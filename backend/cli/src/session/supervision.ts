import path from "path"
import fs from "fs/promises"
import { Instance } from "../project/instance"
import type { PlanMove } from "./plan-draft"
import type { Track } from "./execution"

const INTENT: Record<string, string> = {
  direct_answer: "直接回答",
  exploration: "探索",
  research_design: "研究设计",
  data_analysis: "数据分析",
  literature_verification: "文献核对",
  execution: "执行",
  correction: "纠正",
  meta_conversation: "询问自身",
}

const ACTION: Record<string, string> = {
  answer: "回答",
  clarify: "先确认",
  plan: "先规划",
  execute: "执行",
}

export type ChiefMemory = {
  version: 1
  taskID: string
  intent: string
  action: string
  blocking?: string
  strategy: string
  plan: string
  status: "noted" | "pending" | "approved"
  phase?: "customer" | "final"
  tracks?: Track[]
  delivery?: string
  auditCount?: number
  queryType?: "straightforward" | "depth" | "breadth"
  layer?: number
  assessment?: { task: string; inside: string; outside: string; premises: string }
  source: string
  updatedAt: number
}

export namespace Supervision {
  export function strategy(input: { mustClarify: boolean; blocking?: string; move: PlanMove; queryType?: ChiefMemory["queryType"] }) {
    if (input.mustClarify) return `先确认这一项：${input.blocking ?? "缺少的前提"}。确认前不分类之后的步骤，不派工。`
    if (input.move === "draft" || input.move === "present") {
      if (input.queryType === "depth") return "这是深挖。规划按层写。你只把规划交给用户，确认前不执行。"
      if (input.queryType === "breadth") return "这是铺开。规划按独立的块写。你只把规划交给用户，确认前不执行。"
      return "规划交给任务规划研究员。你只把规划交给用户，确认前不执行。"
    }
    if (input.move === "redraft") return "用户改了要求。规划要重写。确认前不执行。"
    if (input.move === "execute") return "规划已确认。按记忆里的规划执行，不要另写一份。"
    return "直接回答。不写计划，不派工。"
  }

  export function status(move: PlanMove, hasPlan: boolean): ChiefMemory["status"] {
    if (!hasPlan) return "noted"
    if (move === "execute") return "approved"
    return "pending"
  }

  export function block(
    memory: Pick<
      ChiefMemory,
      "intent" | "action" | "blocking" | "strategy" | "plan" | "status" | "phase" | "tracks" | "delivery" | "queryType" | "assessment"
    >,
  ) {
    const turn = turnLine(memory)
    const plan = memory.plan.trim() ? memory.plan.trim() : "还没有。"
    const tracks = (memory.tracks ?? []).map((track) => `### ${track.title}\n${clip(track.output, 1200)}`)
    return [
      "<chief-memory>",
      "首席导研究员的监管记忆。收到消息时写下，后续回合以它为准。",
      `意图：${label(memory.intent, INTENT)}`,
      `动作：${label(memory.action, ACTION)}`,
      ...(memory.queryType ? [`查询类型：${queryLabel(memory.queryType)}`] : []),
      ...(memory.assessment
        ? [
            `任务：${memory.assessment.task}`,
            `范围内：${memory.assessment.inside}`,
            `范围外：${memory.assessment.outside}`,
            `已知前提：${memory.assessment.premises}`,
          ]
        : []),
      ...(memory.blocking ? [`未决前提：${memory.blocking}`] : []),
      `策略：${memory.strategy}`,
      `规划状态：${memory.status === "approved" ? "已确认" : memory.status === "pending" ? "待确认" : "记录"}`,
      ...(memory.phase ? [`执行阶段：${memory.phase === "final" ? "最终版本" : "等待客户决定"}`] : []),
      "规划：",
      plan,
      ...(tracks.length ? ["并行结果：", ...tracks] : []),
      ...(memory.delivery ? [`最终文件：${memory.delivery}`] : []),
      turn,
      "</chief-memory>",
    ].join("\n")
  }

  function queryLabel(kind: NonNullable<ChiefMemory["queryType"]>) {
    if (kind === "depth") return "深挖（depth-first）"
    if (kind === "breadth") return "铺开（breadth-first）"
    return "直答（straightforward）"
  }

  function turnLine(memory: Pick<ChiefMemory, "phase" | "status" | "queryType">) {
    if (memory.phase === "final") return "本回合交付最终版本。不要再派工。"
    if (memory.phase === "customer" && memory.queryType === "depth")
      return "本回合按层写成稿：这一层的结论、证据来自哪一路、还不能下结论的点、下一层要追的问题。请客户选择继续深挖、分叉或确认完成。不要自己开始新的分析。"
    if (memory.phase === "customer")
      return "本回合按块写成稿：每块的发现、块与块的冲突、没覆盖到的范围。请客户选择继续探索、分叉或确认完成。不要自己开始新的分析。"
    if (memory.status === "pending") return "本回合只把规划交给用户，并问是否按此执行。不要调用工具，不要开始分析或修改文件。"
    if (memory.queryType === "straightforward") return "本回合直接回答。不写规划，不派工。"
    if (memory.status === "approved") return "本回合按上面的规划执行，不要另写一份。"
    return "本回合按策略做。"
  }

  function label(key: string, table: Record<string, string>) {
    const name = table[key]
    return name ? `${name}（${key}）` : key
  }

  function clip(value: string, size: number) {
    const text = value.trim()
    return text.length <= size ? text : text.slice(0, size - 1).trimEnd() + "…"
  }

  function filepath(sessionID: string, taskID: string) {
    return path.join(Instance.directory, ".hyscience", "memory", `chief-${sessionID}-${taskID}.json`)
  }

  export async function load(sessionID: string, taskID: string): Promise<ChiefMemory | undefined> {
    try {
      const value = JSON.parse(await fs.readFile(filepath(sessionID, taskID), "utf8")) as Partial<ChiefMemory>
      if (typeof value.strategy !== "string" || typeof value.intent !== "string") return undefined
      if (value.status !== "noted" && value.status !== "pending" && value.status !== "approved") return undefined
      return {
        version: 1,
        taskID,
        intent: value.intent,
        action: typeof value.action === "string" ? value.action : "answer",
        blocking: typeof value.blocking === "string" ? value.blocking : undefined,
        strategy: value.strategy,
        plan: typeof value.plan === "string" ? value.plan : "",
        status: value.status,
        phase: value.phase === "customer" || value.phase === "final" ? value.phase : undefined,
        queryType: value.queryType === "straightforward" || value.queryType === "depth" || value.queryType === "breadth" ? value.queryType : undefined,
        layer: typeof value.layer === "number" ? value.layer : undefined,
        assessment:
          value.assessment && typeof value.assessment.task === "string"
            ? {
                task: value.assessment.task,
                inside: value.assessment.inside ?? "",
                outside: value.assessment.outside ?? "",
                premises: value.assessment.premises ?? "",
              }
            : undefined,
        tracks: Array.isArray(value.tracks) ? value.tracks : undefined,
        delivery: typeof value.delivery === "string" ? value.delivery : undefined,
        auditCount: typeof value.auditCount === "number" ? value.auditCount : undefined,
        source: typeof value.source === "string" ? value.source : "",
        updatedAt: typeof value.updatedAt === "number" ? value.updatedAt : 0,
      }
    } catch {
      return undefined
    }
  }

  export async function save(sessionID: string, record: Omit<ChiefMemory, "version" | "updatedAt">) {
    const next: ChiefMemory = {
      version: 1,
      taskID: record.taskID,
      intent: record.intent,
      action: record.action,
      blocking: record.blocking,
      strategy: record.strategy,
      plan: record.plan.slice(0, 8000),
      status: record.status,
      phase: record.phase,
      queryType: record.queryType,
      layer: record.layer,
      assessment: record.assessment,
      tracks: record.tracks?.map((track) => ({ ...track, output: track.output.slice(0, 8000) })),
      delivery: record.delivery,
      auditCount: record.auditCount,
      source: record.source.slice(0, 2000),
      updatedAt: Date.now(),
    }
    const file = filepath(sessionID, record.taskID)
    await fs.mkdir(path.dirname(file), { recursive: true })
    await fs.writeFile(file, JSON.stringify(next, null, 2))
    return next
  }
}
