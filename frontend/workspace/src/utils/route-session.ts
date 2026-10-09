import { base64Encode } from "@hysci/util/encode"

/** Last path segment after `/session/`. Bare `/session` has no id. */
export function sessionIdFromPath(pathname: string) {
  const parts = pathname.split("/").filter(Boolean)
  if (parts[1] !== "session") return
  return parts[2]
}

export function projectSessionHref(directory: string, sessionId?: string) {
  const slug = base64Encode(directory)
  if (sessionId) return `/${slug}/session/${sessionId}`
  return `/${slug}/session/new`
}
