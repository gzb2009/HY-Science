const KEY = "hyscience.sitting"

function slot(id: string | undefined) {
  if (!id || id === "new") return "draft"
  return id
}

function parse(raw: string | null) {
  if (!raw) return []
  try {
    const value = JSON.parse(raw) as unknown
    if (!Array.isArray(value)) return []
    return value.filter((item): item is string => typeof item === "string")
  } catch {
    return []
  }
}

export function readSitting(id: string | undefined) {
  return parse(localStorage.getItem(`${KEY}.${slot(id)}`))
}

export function writeSitting(id: string | undefined, members: readonly string[]) {
  localStorage.setItem(`${KEY}.${slot(id)}`, JSON.stringify(members))
}

export function bindSitting(sessionID: string, members: readonly string[], fresh: boolean) {
  writeSitting(sessionID, members)
  if (fresh) localStorage.removeItem(`${KEY}.draft`)
}
