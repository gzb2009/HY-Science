import type { Config } from "./gen/types.gen.js"
import type { Event, PermissionRequest, QuestionDecision, QuestionInfo, QuestionRequest } from "./gen/types.gen.js"
import { createHYscienceClient, type HYscienceClient } from "./client.js"
import { createHYscienceServer } from "./server.js"

export const AGENT_DECIDE = "由智能体决定"

export const PROTOCOLS = ["general", "imc", "single-cell", "spatial", "genomics"] as const

export type Protocol = (typeof PROTOCOLS)[number]
export type Intent = "plan" | "work"

export function researchOf(protocol: Protocol) {
  if (protocol === "general") return { domain: "general" as const }
  return { domain: "biology" as const, subdomain: protocol }
}

export function advance(input: { count: number; tab: number; answers: string[][]; answer: string }) {
  const answers = input.answers.slice(0, input.tab)
  answers[input.tab] = [input.answer]
  const last = input.tab >= input.count - 1
  if (!last) return { tab: input.tab + 1, answers, submit: undefined }
  const submit = Array.from({ length: input.count }, (_, index) => answers[index] ?? [])
  return { tab: input.tab, answers, submit }
}

export function skipLabel(question: QuestionInfo, decision?: QuestionDecision) {
  const rec = decision?.recommendation?.trim()
  if (rec && question.options.some((option) => option.label === rec)) return rec
  const marked = question.options.find((option) => /推荐|Recommended/.test(option.label))
  return marked?.label ?? question.options[0]?.label ?? AGENT_DECIDE
}

export function notice(event: Event) {
  if (event.type === "question.asked") return { kind: "question" as const, request: event.properties }
  if (event.type === "permission.asked") return { kind: "permission" as const, request: event.properties }
  if (event.type === "session.idle") return { kind: "idle" as const, sessionID: event.properties.sessionID }
  if (event.type === "message.part.updated" && event.properties.part.type === "file") {
    const part = event.properties.part
    return { kind: "file" as const, name: part.filename ?? part.url, url: part.url }
  }
  if (event.type === "message.part.updated" && event.properties.part.type === "text" && !event.properties.part.hybio)
    return { kind: "text" as const }
  return { kind: "ignore" as const }
}

export type Launch = {
  directory: string
  text: string
  protocol?: Protocol
  intent?: Intent
  agent?: string
  baseUrl?: string
  port?: number
  timeout?: number
  config?: Config
  command?: string[]
  cwd?: string
  model?: { providerID: string; modelID: string }
}

type Envelope<T> = { data?: T; error?: unknown }

async function read<T>(pending: Promise<Envelope<T>>) {
  const value = await pending
  if (value.error) {
    const message = typeof value.error === "string" ? value.error : JSON.stringify(value.error)
    throw new Error(message)
  }
  if (value.data === undefined) throw new Error("empty response")
  return value.data
}

function directoryHeader(directory: string) {
  if (/^[\x00-\x7F]*$/.test(directory)) return directory
  return encodeURIComponent(directory)
}

export async function launch(input: Launch) {
  const directory = input.directory
  const owned = input.baseUrl
    ? undefined
    : await createHYscienceServer({
        hostname: "127.0.0.1",
        port: input.port ?? 0,
        timeout: input.timeout ?? 20000,
        config: input.config,
        command: input.command,
        cwd: input.cwd,
      })
  return open(input, directory, owned).catch((error: unknown) => {
    owned?.close()
    throw error
  })
}

async function open(input: Launch, directory: string, owned: { url: string; close: () => void } | undefined) {
  const url = input.baseUrl ?? owned?.url
  if (!url) throw new Error("没有服务地址")
  const client = createHYscienceClient({ baseUrl: url, directory })
  if (input.protocol) await applyProtocol(client, directory, input.protocol)
  const session = await read(client.session.create({ directory, title: input.text.slice(0, 80) }))
  await send(url, directory, session.id, input)
  const slot = { requestID: "", tab: 0, answers: [] as string[][] }

  async function pendingQuestions() {
    const rows = await read(client.question.list({ directory }))
    return rows.filter((item) => item.sessionID === session.id)
  }

  async function current() {
    const pending = (await pendingQuestions())[0]
    if (!pending) return
    if (slot.requestID !== pending.id) {
      slot.requestID = pending.id
      slot.tab = 0
      slot.answers = []
    }
    return pending
  }

  async function pick(answer: string) {
    const pending = await current()
    if (!pending) throw new Error("没有待回答的问题")
    const next = advance({
      count: pending.questions.length,
      tab: slot.tab,
      answers: slot.answers,
      answer,
    })
    slot.tab = next.tab
    slot.answers = next.answers
    if (!next.submit) return { submitted: false as const, tab: slot.tab }
    await read(client.question.reply({ requestID: pending.id, directory, answers: next.submit }))
    slot.requestID = ""
    slot.tab = 0
    slot.answers = []
    return { submitted: true as const, tab: next.tab }
  }

  async function pendingPermissions() {
    const rows = await read(client.permission.list({ directory }))
    return rows.filter((item) => item.sessionID === session.id)
  }

  return {
    client,
    url,
    directory,
    sessionID: session.id,
    protocol: input.protocol,
    intent: input.intent ?? "work",
    close() {
      owned?.close()
    },
    questions: pendingQuestions,
    choose: pick,
    decide() {
      return pick(AGENT_DECIDE)
    },
    async skip() {
      const pending = await current()
      if (!pending) throw new Error("没有待回答的问题")
      const question = pending.questions[slot.tab]
      if (!question) throw new Error("没有待回答的问题")
      return pick(skipLabel(question, pending.decision))
    },
    permissions: pendingPermissions,
    async allow() {
      return settle("once")
    },
    async deny() {
      return settle("reject")
    },
    result,
  }

  async function settle(reply: "once" | "reject") {
    const item = (await pendingPermissions())[0]
    if (!item) throw new Error("没有待确认的权限")
    await read(client.permission.reply({ requestID: item.id, directory, reply }))
    return item
  }

  async function result() {
    const rows = await read(client.session.messages({ sessionID: session.id, directory }))
    const text = rows
      .filter((row) => row.info.role === "assistant")
      .flatMap((row) => row.parts.flatMap((part) => (part.type === "text" && !part.hybio ? [part.text] : [])))
      .join("\n")
      .trim()
    const files = rows.flatMap((row) =>
      row.parts.flatMap((part) =>
        part.type === "file" ? [{ name: part.filename ?? part.url, url: part.url, mime: part.mime }] : [],
      ),
    )
    const recorded = await client.provenance.list({ directory }).then(
      (value) => value,
      () => undefined,
    )
    if (!recorded || recorded.error || !recorded.data)
      return { text, files: [], missing: files, provenance: "unknown" as const }
    const nodes = recorded.data.nodes.flatMap((node) => {
      if (!node || typeof node !== "object") return []
      const item = node as { kind?: string; path?: string; label?: string; meta?: { sessionID?: string } }
      if (item.meta?.sessionID !== session.id) return []
      if (item.kind !== "artifact" && !item.path) return []
      return [item]
    })
    const paths = nodes.flatMap((node) => (node.path ? [node.path] : []))
    const known = (name: string) => paths.some((item) => item === name || item.endsWith(`/${name}`))
    return {
      text,
      files: nodes.map((node) => ({ name: node.path ?? node.label ?? node.kind ?? "artifact", path: node.path })),
      missing: files.filter((file) => !known(file.name)),
      provenance: "recorded" as const,
    }
  }
}

async function applyProtocol(client: HYscienceClient, directory: string, protocol: Protocol) {
  const project = await read(client.project.current({ directory }))
  const research = researchOf(protocol)
  await read(
    client.project.update({
      projectID: project.id,
      directory,
      research: {
        ...research,
        notes: project.research?.notes,
      },
    }),
  )
}

async function send(base: string, directory: string, sessionID: string, input: Launch) {
  const endpoint = new URL(`/session/${sessionID}/prompt_async`, base)
  endpoint.searchParams.set("directory", directory)
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-hyscience-directory": directoryHeader(directory),
    },
    body: JSON.stringify({
      agent: input.agent ?? "research",
      intent: input.intent ?? "work",
      model: input.model,
      parts: [{ type: "text", text: input.text }],
    }),
  })
  if (res.ok) return
  const body = await res.text()
  throw new Error(body || `启动智能体失败 (${res.status})`)
}

export type { PermissionRequest, QuestionRequest }
