export type Scope = "read" | "ask" | "workspace" | "trust"

export type ScopeRule = {
  permission: string
  pattern: string
  action: "allow" | "ask" | "deny"
}

const KEY = "hyscience.composer.scope"

const rule = (permission: string, action: ScopeRule["action"]): ScopeRule => ({
  permission,
  pattern: "*",
  action,
})

export const SCOPES: { id: Scope; label: string; hint: string }[] = [
  { id: "read", label: "只读", hint: "不改文件，不跑命令" },
  { id: "ask", label: "先问我", hint: "改文件和跑命令前都要确认" },
  { id: "workspace", label: "工作区内", hint: "项目目录里直接改，目录外仍要问" },
  { id: "trust", label: "全信任", hint: "可改电脑上的任何文件，可跑任何命令" },
]

export function isScope(value: unknown): value is Scope {
  return value === "read" || value === "ask" || value === "workspace" || value === "trust"
}

export function scopeRules(scope: Scope): ScopeRule[] {
  if (scope === "read") {
    return [rule("edit", "deny"), rule("bash", "deny"), rule("destructive", "deny"), rule("external_directory", "deny")]
  }
  if (scope === "ask") {
    return [rule("edit", "ask"), rule("bash", "ask"), rule("destructive", "ask"), rule("external_directory", "ask")]
  }
  if (scope === "trust") {
    return [
      rule("edit", "allow"),
      rule("bash", "allow"),
      rule("destructive", "allow"),
      rule("external_directory", "allow"),
      rule("read", "allow"),
    ]
  }
  return [rule("edit", "allow"), rule("bash", "allow"), rule("destructive", "ask"), rule("external_directory", "ask")]
}

export function readScope(directory: string): Scope {
  if (!directory || typeof localStorage === "undefined") return "workspace"
  try {
    const raw = localStorage.getItem(KEY)
    const map = raw ? (JSON.parse(raw) as Record<string, unknown>) : {}
    const value = map[directory]
    if (isScope(value)) return value
  } catch {
    return "workspace"
  }
  return "workspace"
}

export function writeScope(directory: string, scope: Scope) {
  if (!directory || typeof localStorage === "undefined") return
  try {
    const raw = localStorage.getItem(KEY)
    const map = raw ? (JSON.parse(raw) as Record<string, unknown>) : {}
    localStorage.setItem(KEY, JSON.stringify({ ...map, [directory]: scope }))
  } catch {
    return
  }
}
