import type { PlanMove } from "./plan-draft"
import type { QueryKind } from "./query-type"

export type Track = {
  key: string
  agent: string
  title: string
  output: string
  status?: "done" | "partial"
}

export type ExecStep = "dispatch" | "audit" | "hold"

const DONE = /确认完成|任务完成|出最终版|最终审核|审核吧|结束这个任务|finalize|final review/i
const FORK = /分叉|另派|换领域|fork/i
const CONTINUE = /继续探索|继续分析|继续深入|继续/i
const CODE = /代码|仓库|脚本|函数|实现|\bbug\b|src\/|\.py\b|\.R\b/i
const TRACK_KEYS = "literature|compute|code|domain"

export const budget = {
  tracks: 4,
  toolsPerTrack: 2,
  toolsGlobal: 8,
  ms(key: string) {
    if (key === "compute" || key === "domain") return 8 * 60 * 1000
    return 2 * 60 * 1000
  },
}

function mark(key: string) {
  if (key === "literature") return /文献检索|文献研究员/
  if (key === "compute") return /计算分析|Python|python|\bshell\b/
  if (key === "code") return /代码定位|代码研究员/
  return /生物研究员|物理研究员|机器学习研究员|领域分析|领域研究员/
}

function mentions(text: string, key: string) {
  return mark(key).test(text)
}

export namespace Execution {
  export function domainAgent(text: string) {
    if (/物理|physics/i.test(text)) return "physics"
    if (/机器学习|模型训练|\bml\b/i.test(text)) return "ml"
    return "biology"
  }

  export function tracks(text: string, kind: QueryKind = "breadth", layer = 0): Track[] {
    if (kind === "straightforward") return []
    if (kind === "depth") return [depthTrack(text, layer)]
    const agent = domainAgent(text)
    const rows: Track[] = [
      { key: "literature", agent: "literature-review", title: "文献检索", output: "" },
      { key: "compute", agent: "task", title: "计算分析", output: "" },
    ]
    if (CODE.test(text)) rows.push({ key: "code", agent: "explore", title: "代码定位", output: "" })
    rows.push({ key: "domain", agent, title: domainTitle(agent), output: "" })
    return rows.slice(0, budget.tracks)
  }

  export function assigned(plan: string, text: string, kind: QueryKind = "breadth", layer = 0): Track[] {
    if (kind === "straightforward") return []
    const corpus = `${plan}\n${text}`
    if (kind === "depth") return [depthTrack(corpus, layer)]
    const full = tracks(corpus, "breadth")
    const named = full.filter((track) => mark(track.key).test(plan))
    return (named.length > 0 ? named : full).slice(0, budget.tracks)
  }

  export function resume(specs: Track[], prior: Track[], text: string) {
    const run = specs.filter((spec) => {
      const old = prior.find((item) => item.key === spec.key)
      if (!old || old.status !== "done") return true
      return mentions(text, spec.key)
    })
    const keep = specs.flatMap((spec) => {
      if (run.some((item) => item.key === spec.key)) return []
      const old = prior.find((item) => item.key === spec.key)
      return old ? [old] : []
    })
    return { run, keep }
  }

  export function workdir(taskID: string, key: string) {
    return `.hyscience/runs/${taskID}/${key}`
  }

  export function auditors(agent: string) {
    const rows = [
      { agent: "critique", title: "核查研究员" },
      { agent: "reviewer", title: "盲审研究员" },
    ]
    if (agent === "physics") rows.push({ agent: "physics-critique", title: "物理核查研究员" })
    return rows
  }

  export function reply(text: string) {
    const value = text.trim()
    if (DONE.test(value)) return "done" as const
    if (FORK.test(value)) return "fork" as const
    if (value.length <= 40 && CONTINUE.test(value)) return "continue" as const
    return "other" as const
  }

  export function step(
    prior: { phase?: string; source?: string } | undefined,
    text: string,
    move: PlanMove,
  ): ExecStep {
    if (move !== "execute") return "hold"
    if (!prior?.phase) return "dispatch"
    if (prior.source === text) return "hold"
    if (prior.phase === "final" && reply(text) !== "continue" && reply(text) !== "fork") return "hold"
    if (prior.phase === "customer" && reply(text) === "done") return "audit"
    if (prior.phase === "customer" || prior.phase === "final") return "dispatch"
    return "dispatch"
  }

  export function findings(text: string) {
    const lines = text.split("\n").flatMap((line) => {
      const match = line.match(new RegExp(`^[-*]\\s*(${TRACK_KEYS})\\s*[:：]\\s*(.+)$`, "i"))
      if (!match) return []
      return [{ track: match[1].toLowerCase(), issue: match[2].trim() }]
    })
    if (/无阻断问题/.test(text) && lines.length === 0) return []
    return lines
  }

  export function manifest(input: { plan: string; method?: string; tracks: Track[]; audit: string }) {
    const blob = input.tracks.map((track) => track.output).join("\n")
    const files = [
      ...new Set(
        [...blob.matchAll(/(?:\/|\.\/)[^\s"'`<>]+?\.(?:png|pdf|csv|tsv|xlsx|h5ad|rds|txt|py|R|r|md|json|html)/g)].map(
          (match) => match[0],
        ),
      ),
    ]
    const code = [...blob.matchAll(/```(?:python|r|R|bash|sh)?\n[\s\S]*?```/g)].map((match) => match[0])
    const env = blob
      .split("\n")
      .filter((line) => /python|R version|sessionInfo|conda|renv|packageVersion|库版本/i.test(line))
      .slice(0, 24)
    return [
      "# 最终版本",
      "",
      "## 产物文件",
      files.length ? files.map((file) => `- ${file}`).join("\n") : "本轮没有交回新的文件路径。",
      "",
      "## 代码",
      code.length ? code.join("\n\n") : "代码在计算分析轨道的输出里。",
      "",
      "## 环境",
      env.length ? env.map((line) => `- ${line.trim()}`).join("\n") : "环境说明在计算分析轨道的输出里。",
      "",
      "## 方法学",
      input.method?.trim() || input.plan.trim() || "规划为空。",
      "",
      "## 历史",
      ...input.tracks.map((track) => `### ${track.title}（${track.agent}）\n${clip(track.output, 1500)}`),
      "",
      "### 审核",
      input.audit.trim() || "无阻断问题",
      "",
    ].join("\n")
  }
}

function domainTitle(agent: string) {
  if (agent === "physics") return "物理研究员"
  if (agent === "ml") return "机器学习研究员"
  return "生物研究员"
}

function depthTrack(text: string, layer: number): Track {
  const sequence: Array<Track["key"]> = CODE.test(text)
    ? ["code", "domain", "compute"]
    : /文献|综述|paper|literature/i.test(text)
      ? ["literature", "domain"]
      : ["domain", "literature", "compute"]
  const key = sequence[Math.min(layer, sequence.length - 1)] ?? "domain"
  if (key === "literature") return { key, agent: "literature-review", title: "文献检索", output: "" }
  if (key === "compute") return { key, agent: "task", title: "计算分析", output: "" }
  if (key === "code") return { key, agent: "explore", title: "代码定位", output: "" }
  const agent = Execution.domainAgent(text)
  return { key: "domain", agent, title: domainTitle(agent), output: "" }
}

function clip(value: string, size: number) {
  const text = value.trim()
  return text.length <= size ? text : text.slice(0, size - 1).trimEnd() + "…"
}
