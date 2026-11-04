import path from "path"
import fs from "fs/promises"
import { Instance } from "../project/instance"
import { Query } from "./query-type"

const APPROVE =
  /^(?:按这个做|按此执行|按计划执行|按计划|开始执行|开始做|开始吧|开始|可以执行|执行吧|同意|就这样|就按这个|继续执行|可以|好的|行|go ahead|proceed|approved|approve|start)[。.!！\s]*$/i

export type PlanMove = "skip" | "draft" | "redraft" | "present" | "execute"

export type PlanRecord = {
  version: 1
  status: "pending" | "approved"
  taskID: string
  source: string
  plan: string
  updatedAt: number
}

const held = new Set<string>()

export namespace PlanDraft {
  export function needsPlan(input: { text: string; intent: string; action: string; mustClarify: boolean }) {
    const kind = Query.classify(input)
    return kind === "depth" || kind === "breadth"
  }

  export function approves(text: string) {
    const value = text.trim()
    if (!value || value.length > 24) return false
    return APPROVE.test(value)
  }

  export function decide(input: {
    text: string
    intent: string
    action: string
    mustClarify: boolean
    draft?: Pick<PlanRecord, "status" | "source">
  }): PlanMove {
    const text = input.text.trim()
    const draft = input.draft
    if (draft?.status === "approved") return "execute"
    if (draft?.status === "pending") {
      if (approves(text)) return "execute"
      if (draft.source === text) return "present"
      return "redraft"
    }
    if (!needsPlan(input)) return "skip"
    return "draft"
  }

  export function hold(sessionID: string) {
    held.add(sessionID)
  }

  export function release(sessionID: string) {
    held.delete(sessionID)
  }

  export function holding(sessionID: string) {
    return held.has(sessionID)
  }

  function filepath(sessionID: string, taskID: string) {
    return path.join(Instance.directory, ".hyscience", "memory", `plan-${sessionID}-${taskID}.json`)
  }

  export async function load(sessionID: string, taskID: string): Promise<PlanRecord | undefined> {
    try {
      const value = JSON.parse(await fs.readFile(filepath(sessionID, taskID), "utf8")) as Partial<PlanRecord>
      if (value.status !== "pending" && value.status !== "approved") return undefined
      if (typeof value.plan !== "string" || typeof value.source !== "string") return undefined
      return {
        version: 1,
        status: value.status,
        taskID,
        source: value.source,
        plan: value.plan,
        updatedAt: typeof value.updatedAt === "number" ? value.updatedAt : 0,
      }
    } catch {
      return undefined
    }
  }

  export async function save(sessionID: string, record: Omit<PlanRecord, "version" | "updatedAt">) {
    const next: PlanRecord = {
      version: 1,
      status: record.status,
      taskID: record.taskID,
      source: record.source,
      plan: record.plan.slice(0, 8000),
      updatedAt: Date.now(),
    }
    const file = filepath(sessionID, record.taskID)
    await fs.mkdir(path.dirname(file), { recursive: true })
    await fs.writeFile(file, JSON.stringify(next, null, 2))
    return next
  }
}
