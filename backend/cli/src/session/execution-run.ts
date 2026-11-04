import path from "path"
import fs from "fs/promises"
import { Instance } from "../project/instance"
import { Execution, budget, type Track } from "./execution"
import type { QueryKind } from "./query-type"
import type { ChiefMemory } from "./supervision"

const busy = new Set<string>()

export namespace ExecutionRun {
  export async function advance(input: {
    sessionID: string
    taskID: string
    model: { providerID: string; modelID: string }
    text: string
    plan: string
    queryType?: QueryKind
    prior?: ChiefMemory
  }) {
    const action = Execution.step(input.prior, input.text, "execute")
    if (action === "hold" && input.prior?.phase) {
      return {
        phase: input.prior.phase,
        tracks: input.prior.tracks ?? [],
        delivery: input.prior.delivery,
        auditCount: input.prior.auditCount ?? 0,
        layer: input.prior.layer ?? 0,
        strategy: input.prior.strategy,
      }
    }
    if (action === "audit") {
      return audit(input)
    }
    const kind = input.queryType ?? input.prior?.queryType ?? "breadth"
    const layer =
      kind === "depth" && Execution.reply(input.text) === "continue" ? (input.prior?.layer ?? 0) + 1 : (input.prior?.layer ?? 0)
    const tracks = await parallel({
      sessionID: input.sessionID,
      taskID: input.taskID,
      model: input.model,
      plan: input.plan,
      task: input.text,
      specs: Execution.assigned(
        input.plan,
        input.text,
        kind === "straightforward" ? "breadth" : kind,
        layer,
      ),
      prior: input.prior?.tracks ?? [],
    })
    const titles = tracks.map((track) => track.title).join("、")
    return {
      phase: "customer" as const,
      tracks,
      delivery: undefined,
      auditCount: input.prior?.auditCount ?? 0,
      layer,
      strategy:
        kind === "depth"
          ? `深挖第 ${layer + 1} 层只派了${titles}。按层写成稿：这一层结论、证据来自哪一路、还不能下结论的点、下一层要追的问题。请客户选择继续深挖、分叉或确认完成。`
          : `铺开已并行完成${titles}。按块写成稿，写明冲突和没覆盖的范围。请客户选择继续探索、分叉或确认完成。`,
    }
  }

  async function audit(input: {
    sessionID: string
    taskID: string
    model: { providerID: string; modelID: string }
    text: string
    plan: string
    prior?: ChiefMemory
  }) {
    const tracks = input.prior?.tracks ?? []
    const first = await review(input.sessionID, input.model, input.plan, tracks)
    const issues = Execution.findings(first)
    const repaired =
      issues.length > 0 && (input.prior?.auditCount ?? 0) < 1
        ? await parallel({
            sessionID: input.sessionID,
            taskID: input.taskID,
            model: input.model,
            plan: input.plan,
            task: input.text,
            specs: tracks.filter((track) => issues.some((issue) => issue.track === track.key)),
            prior: tracks,
            issues,
          })
        : tracks
    const merged = tracks.map((track) => repaired.find((item) => item.key === track.key) ?? track)
    const second = issues.length > 0 ? await review(input.sessionID, input.model, input.plan, merged) : first
    const left = Execution.findings(second)
    if (left.length > 0) {
      return {
        phase: "customer" as const,
        tracks: merged,
        delivery: undefined,
        auditCount: (input.prior?.auditCount ?? 0) + 1,
        layer: input.prior?.layer ?? 0,
        strategy: `审核仍有问题，已退回原执行人复查过一次。把剩余问题告诉客户，不要宣称完成。\n${left
          .map((issue) => `- ${issue.track}: ${issue.issue}`)
          .join("\n")}`,
      }
    }
    const method = await run({
      sessionID: input.sessionID,
      model: input.model,
      agent: "write",
      title: "方法学 · 撰稿研究员",
      ms: budget.ms("domain"),
      prompt: [
        "你是撰稿研究员。只根据已经审核通过的结果写方法学。",
        "写出数据、步骤、软件版本和统计选择。不要重新分析，不要写整篇论文。",
        input.plan,
        merged.map((track) => `## ${track.key}\n${track.output}`).join("\n\n"),
      ].join("\n\n"),
    })
    const body = Execution.manifest({ plan: input.plan, method: method.output, tracks: merged, audit: second })
    const file = path.join(Instance.directory, ".hyscience", "delivery", `${input.sessionID}-${input.taskID}.md`)
    await fs.mkdir(path.dirname(file), { recursive: true })
    await fs.writeFile(file, body)
    return {
      phase: "final" as const,
      tracks: merged,
      delivery: file,
      auditCount: (input.prior?.auditCount ?? 0) + 1,
      layer: input.prior?.layer ?? 0,
      strategy: "审核没有阻断问题。向客户交付最终版本：产物文件、代码、环境、方法学和历史。",
    }
  }

  async function review(
    sessionID: string,
    model: { providerID: string; modelID: string },
    plan: string,
    tracks: Track[],
  ) {
    const packet = tracks.map((track) => `## ${track.key}\n${track.output}`).join("\n\n")
    const domain = tracks.find((track) => track.key === "domain")?.agent ?? "biology"
    const notes = await Promise.all(
      Execution.auditors(domain).map((auditor) =>
        run({
          sessionID,
          model,
          agent: auditor.agent,
          title: `审核 · ${auditor.title}`,
          prompt: auditPrompt(auditor.title, plan, packet),
          ms: budget.ms("literature"),
        }),
      ),
    )
    return notes
      .map((note) => note.output)
      .filter(Boolean)
      .join("\n")
  }

  async function parallel(input: {
    sessionID: string
    taskID: string
    model: { providerID: string; modelID: string }
    plan: string
    task: string
    specs: Track[]
    prior: Track[]
    issues?: { track: string; issue: string }[]
  }) {
    const picked = Execution.resume(input.specs, input.issues ? [] : input.prior, input.task)
    const ran = await Promise.all(
      picked.run.map(async (spec) => {
        const issue = input.issues?.find((item) => item.track === spec.key)?.issue
        const previous = input.prior.find((item) => item.key === spec.key)?.output
        const dir = path.join(Instance.directory, Execution.workdir(input.taskID, spec.key))
        await fs.mkdir(dir, { recursive: true })
        const result = await run({
          sessionID: input.sessionID,
          model: input.model,
          agent: spec.agent,
          title: `${spec.title} · ${spec.agent}`,
          prompt: trackPrompt(spec, input.plan, input.task, dir, previous, issue),
          ms: budget.ms(spec.key),
        })
        return { ...spec, output: result.output, status: result.status }
      }),
    )
    const byKey = new Map(ran.map((track) => [track.key, track]))
    return input.specs.map((spec) => byKey.get(spec.key) ?? picked.keep.find((item) => item.key === spec.key) ?? spec)
  }
}

function trackPrompt(spec: Track, plan: string, task: string, dir: string, previous?: string, issue?: string) {
  const role =
    spec.key === "literature"
      ? "你负责文献检索。只交回与任务直接相关的已发表文献：题名、出处、以及它支持的说法。"
      : spec.key === "compute"
        ? "你负责计算分析。只用 Python、R 或 shell。交回脚本、语言和关键包版本、以及输出文件路径。"
        : spec.key === "code"
          ? "你负责在仓库里定位实现。只交回文件路径、入口和与任务相关的代码位置。不要改文件。"
          : "你负责领域分析。使用这个领域自己的数据和工具。交回方法、结果和文件路径。"
  return [
    role,
    `只把新文件写到 ${dir}。不要写到其他轨道的目录。`,
    "同一时刻最多同时使用 2 个工具。",
    "不要给客户写总结。",
    issue ? `首席导研究员退回的问题，只复查这一条：${issue}` : "",
    previous ? `上一轮输出：\n${previous.slice(0, 3000)}` : "",
    `任务：\n${task}`,
    `规划：\n${plan}`,
  ]
    .filter(Boolean)
    .join("\n\n")
}

function auditPrompt(role: string, plan: string, packet: string) {
  return [
    `你是${role}。只审核下面的并行结果，不重做分析。`,
    "查事实错误、数字对不上、文字和引用错误、代码和文件路径不一致。",
    "没有阻断问题时只写：无阻断问题",
    "有问题时每行一条：- literature: 问题、- compute: 问题、- code: 问题 或 - domain: 问题",
    `规划：\n${plan}`,
    packet,
  ].join("\n\n")
}

async function run(input: {
  sessionID: string
  model: { providerID: string; modelID: string }
  agent: string
  title: string
  prompt: string
  ms: number
}) {
  const key = `${input.sessionID}:${input.agent}:${input.title}`
  if (busy.has(key)) return { output: "未完成：这一路正在跑。", status: "partial" as const }
  busy.add(key)
  try {
    const { Session } = await import("./index")
    const { SessionPrompt } = await import("./prompt")
    const child = await Session.create({
      parentID: input.sessionID,
      title: input.title,
      permission: [{ permission: "task", pattern: "*", action: "deny" }],
    })
    const pending = SessionPrompt.prompt({
      sessionID: child.id,
      agent: input.agent,
      model: input.model,
      parts: [{ type: "text", text: input.prompt }],
    }).then((result) =>
      result.parts
        .flatMap((part) => (part.type === "text" && !part.hybio ? [part.text.trim()] : []))
        .filter(Boolean)
        .join("\n")
        .trim(),
    )
    const output = await deadline(pending, input.ms, () => {
      SessionPrompt.cancel(child.id)
    })
    return { output, status: output.startsWith("未完成") ? ("partial" as const) : ("done" as const) }
  } catch {
    return { output: "未完成：这一路没有交回结果。", status: "partial" as const }
  } finally {
    busy.delete(key)
  }
}

function deadline(work: Promise<string>, ms: number, onLate: () => void) {
  return new Promise<string>((resolve) => {
    const timer = setTimeout(() => {
      onLate()
      resolve("未完成：到达本轮时限。已写入本轨道目录的文件予以保留。")
    }, ms)
    work.then(
      (value) => {
        clearTimeout(timer)
        resolve(value || "未完成：这一路没有交回结果。")
      },
      () => {
        clearTimeout(timer)
        resolve("未完成：这一路没有交回结果。")
      },
    )
  })
}
