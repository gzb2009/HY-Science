import { FILES, FOREIGN, KEYWORDS, type Profile } from "./biology-lexicon"

export type Domain = "biology" | "physics" | "ml"

export type Judgment = {
  discuss: boolean
  domain?: Domain
  direction?: string
  ambiguous?: "domain" | "direction"
  candidates: string[]
}

const DISCUSS =
  /区别|差异|对比|比较|检索|搜索|查阅|文献|论文|调研|综述|概述|介绍|原理|机制|什么是|是什么|what is|how does|compared to|difference between|\bvs\.?\b|review|survey/i
const RUN = /跑一下|开始跑|开始分析|执行分析|请分析|帮我做|给我做|请做|训练|analyze this|run this/i

const ML_TRAIN = /训练|微调|fine-?tun|\btraining\b/i
const ML_EVAL = /评估模型|模型评测|benchmark|\bevaluation\b/i
const ML_INFER = /模型推理|部署模型|\binference\b/i
const ML = /机器学习|训练模型|微调|神经网络|\bml\b|\btraining\b|\bevaluation\b|\binference\b/i
const PHYS_SIM = /模拟|仿真|\bpde\b|微分方程|\bsimulation\b/i
const PHYS_THEORY = /理论推导|哈密顿|拉格朗日/i
const PHYS_EXP = /物理实验|测量装置/i
const PHYS = /计算物理|物理模拟|微分方程|\bsimulation\b/i

const PROFILES = Object.keys(KEYWORDS) as Profile[]
const LABEL: Record<Profile, RegExp> = {
  imc: /空间蛋白成像|\bimc\b/i,
  spatial: /空间转录组|\bspatial\b/i,
  genomics: /基因组|\bgenomics\b/i,
  "single-cell": /单细胞分析|\bsingle-cell\b/i,
}

export type Memory = { domain: Domain; direction?: string }

const MEMORY = new Map<string, Memory>()
const PENDING = new Map<string, Memory>()

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))]
}

function biologyDirections(text: string, filenames: string[]) {
  return PROFILES.filter(
    (profile) =>
      filenames.some((name) => FILES[profile].test(name)) ||
      KEYWORDS[profile].test(text) ||
      FOREIGN[profile].test(text) ||
      LABEL[profile].test(text),
  )
}

function mlDirection(text: string) {
  const hits = [
    ML_TRAIN.test(text) ? "training" : "",
    ML_EVAL.test(text) ? "evaluation" : "",
    ML_INFER.test(text) ? "inference" : "",
  ].filter(Boolean)
  return unique(hits)
}

function physicsDirection(text: string) {
  const hits = [
    PHYS_SIM.test(text) ? "simulation" : "",
    PHYS_THEORY.test(text) ? "theory" : "",
    PHYS_EXP.test(text) ? "experiment" : "",
  ].filter(Boolean)
  return unique(hits)
}

export namespace Specialty {
  export function judge(input: { text: string; filenames: string[] }): Judgment {
    const text = input.text
    const filenames = input.filenames
    if (DISCUSS.test(text) && !RUN.test(text) && filenames.length === 0) {
      return { discuss: true, candidates: [] }
    }

    const biology = unique(biologyDirections(text, filenames))
    const train = ML_TRAIN.test(text) && filenames.length === 0
    const domains = unique([
      biology.length && !train ? "biology" : "",
      ML.test(text) || train ? "ml" : "",
      PHYS.test(text) ? "physics" : "",
    ])

    if (domains.length > 1) return { discuss: false, ambiguous: "domain", candidates: domains }
    if (domains.length === 0) return { discuss: false, candidates: [] }

    const domain = domains[0] as Domain
    if (domain === "biology") {
      if (biology.length === 1) return { discuss: false, domain, direction: biology[0], candidates: biology }
      return { discuss: false, domain, ambiguous: "direction", candidates: biology }
    }
    const directions = domain === "ml" ? mlDirection(text) : physicsDirection(text)
    if (directions.length === 1) return { discuss: false, domain, direction: directions[0], candidates: directions }
    const options = domain === "ml" ? ["training", "evaluation", "inference"] : ["simulation", "theory", "experiment"]
    return { discuss: false, domain, ambiguous: "direction", candidates: directions.length ? directions : options }
  }

  export function slide(previous: Memory | undefined, next: Judgment) {
    if (!previous || next.discuss || next.ambiguous || !next.domain) return false
    if (next.domain !== previous.domain) return true
    if (next.direction && previous.direction && next.direction !== previous.direction) return true
    return false
  }

  export function recall(sessionID: string) {
    return MEMORY.get(sessionID)
  }

  export function remember(sessionID: string, value: Memory) {
    MEMORY.set(sessionID, value)
    PENDING.delete(sessionID)
    return value
  }

  export function clear(sessionID: string) {
    MEMORY.delete(sessionID)
    PENDING.delete(sessionID)
  }

  export function pend(sessionID: string, value: Memory) {
    PENDING.set(sessionID, value)
  }

  export function take(sessionID: string, next: Judgment) {
    const pending = PENDING.get(sessionID)
    if (!pending || next.discuss || next.ambiguous || !next.domain) return false
    if (next.domain !== pending.domain) return false
    if (pending.direction && next.direction && pending.direction !== next.direction) return false
    PENDING.delete(sessionID)
    return true
  }

  export function reminder(input: { judgment: Judgment; memory?: Memory; drifted: boolean }) {
    if (input.judgment.discuss) {
      return "<specialty>Literature or comparison. Do not choose a domain or direction, and do not ask.</specialty>"
    }
    if (input.drifted && input.memory) {
      return [
        "<specialty>",
        `This task is ${input.memory.domain}${input.memory.direction ? ` / ${input.memory.direction}` : ""}.`,
        "The new request would execute a different domain or direction. Ask one question before running it. Do not start the other analysis.",
        "</specialty>",
      ].join("\n")
    }
    if (input.judgment.ambiguous) {
      const layer = input.judgment.ambiguous === "domain" ? "domain (biology, physics, or ml)" : "direction"
      return [
        "<specialty>",
        `The ${layer} is ambiguous. Candidates: ${input.judgment.candidates.join(", ") || "none"}.`,
        "Ask one question listing only those candidates. Project memory is not a preferred answer.",
        "</specialty>",
      ].join("\n")
    }
    if (!input.judgment.domain) return
    const direction = input.judgment.direction ? ` / ${input.judgment.direction}` : ""
    const protocol =
      input.judgment.direction === "imc"
        ? " Follow the imc-analysis skill when it covers this step. If no protocol skill covers the step, analyze with the current rules and do not switch to recipe-executor."
        : ""
    return `<specialty>Decided from this request: ${input.judgment.domain}${direction}. Project memory does not override this. Continue.${protocol}</specialty>`
  }
}
