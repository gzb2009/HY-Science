import { base64Encode } from "@hysci/util/encode"

const KEY = "hyscience.desktop.last"
const SHELL = "hyscience.desktop.shell"

let stay = false

export function stayOnHome() {
  stay = true
}

export function homeStays() {
  return stay
}

export type DesktopLast = {
  directory: string
  sessionId?: string
}

export function markDesktopShell() {
  if (typeof window === "undefined") return
  try {
    localStorage.setItem(SHELL, "1")
  } catch {}
}

export function isDesktopShell() {
  if (typeof window === "undefined") return false
  try {
    if (new URLSearchParams(window.location.search).get("desktop") === "1") return true
    return localStorage.getItem(SHELL) === "1"
  } catch {
    return false
  }
}

export function rememberDesktopSession(directory: string, sessionId?: string) {
  stay = false
  if (typeof window === "undefined" || !directory) return
  const next: DesktopLast = { directory }
  if (sessionId && sessionId !== "new") next.sessionId = sessionId
  try {
    const encoded = JSON.stringify(next)
    if (localStorage.getItem(KEY) === encoded) return
    localStorage.setItem(KEY, encoded)
  } catch {}
}

export function desktopLast(): DesktopLast | undefined {
  if (typeof window === "undefined") return
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "")
    if (typeof raw?.directory === "string" && raw.directory) return raw
  } catch {
    return
  }
}

export function resumeHref(input: { shell: boolean; stay: boolean; href?: string }) {
  if (input.stay || !input.shell) return
  return input.href
}

export function desktopResumeHref(last = desktopLast()) {
  if (!last) return
  const dir = base64Encode(last.directory)
  if (last.sessionId) return `/${dir}/session/${last.sessionId}?desktop=1`
  return `/${dir}/session?desktop=1`
}
