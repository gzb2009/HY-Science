/** End timestamp for the thinking-duration clock. */
export function turnClockEnd(input: {
  created: number
  now: number
  live: boolean
  completed?: number
  paused?: number
  lastActivity?: number
}) {
  if (input.completed) return input.completed
  if (input.paused) return input.paused
  if (input.live) return input.now
  return input.lastActivity ?? input.created
}

export function partStamp(part: { time?: { start?: number; end?: number } } | undefined) {
  if (!part?.time) return 0
  return Math.max(part.time.end ?? 0, part.time.start ?? 0)
}
