export type ContextSliceId = "system" | "skill" | "message"

export type ContextSlice = {
  id: ContextSliceId
  tokens: number
}

export type ContextUsage = {
  used: number
  limit: number
  percent: number
  skillCount: number
  slices: ContextSlice[]
}

const CHARS_PER_TOKEN = 4

/** Split a measured prompt into system, skill, and message slices. The total is the provider token count. */
export function measureContext(input: {
  limit: number
  input: number
  output: number
  reasoning: number
  messageChars: number
  skillChars: number
  skillCount: number
}): ContextUsage {
  const used = Math.max(0, input.input + input.output + input.reasoning)
  const limit = Math.max(0, input.limit)
  const message = Math.min(used, Math.round(Math.max(0, input.messageChars) / CHARS_PER_TOKEN))
  const rest = used - message
  const skill = Math.min(rest, Math.round(Math.max(0, input.skillChars) / CHARS_PER_TOKEN))
  const system = rest - skill
  const percent = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0
  return {
    used,
    limit,
    percent,
    skillCount: Math.max(0, input.skillCount),
    slices: [
      { id: "system", tokens: system },
      { id: "skill", tokens: skill },
      { id: "message", tokens: message },
    ],
  }
}

export function formatSlice(tokens: number, limit: number) {
  if (tokens <= 0 || limit <= 0) return "0%"
  const pct = (tokens / limit) * 100
  if (pct < 1) return "<1%"
  return `${Math.round(pct)}%`
}

export function sliceWidth(tokens: number, usage: ContextUsage) {
  const base = usage.limit > 0 ? usage.limit : usage.used
  if (base <= 0 || tokens <= 0) return 0
  return Math.min(100, (tokens / base) * 100)
}

/** 0–1 share of the window. The bar width tracks this, not a rounded label. */
export function fillRatio(usage: ContextUsage) {
  if (usage.used <= 0) return 0
  if (usage.limit <= 0) return 1
  return Math.min(1, usage.used / usage.limit)
}

export function usageBand(percent: number) {
  if (percent >= 75) return "high"
  if (percent >= 40) return "mid"
  if (percent > 0) return "low"
  return "empty"
}
