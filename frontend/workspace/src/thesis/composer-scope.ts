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
  { id: "ask", label: "询问审批", hint: "执行命令、修改工作区外文件或访问网络前，始终询问" },
  { id: "workspace", label: "自动审批", hint: "仅在检测到潜在风险时询问" },
  { id: "trust", label: "完全访问", hint: "不再询问，可自由访问你的文件、终端和网络" },
]

export function isScope(value: unknown): value is Scope {
  return value === "read" || value === "ask" || value === "workspace" || value === "trust"
}

export function scopeRules(scope: Scope): ScopeRule[] {
  if (scope === "read") {
    return [rule("edit", "deny"), rule("bash", "deny"), rule("destructive", "deny"), rule("external_directory", "deny")]
  }
  if (scope === "ask") {
    return [
      rule("edit", "allow"),
      rule("bash", "ask"),
      rule("destructive", "ask"),
      rule("external_directory", "ask"),
      rule("webfetch", "ask"),
    ]
  }
  if (scope === "trust") {
    return [
      rule("edit", "allow"),
      rule("bash", "allow"),
      rule("destructive", "allow"),
      rule("external_directory", "allow"),
      rule("webfetch", "allow"),
      rule("read", "allow"),
    ]
  }
  return [
    rule("edit", "allow"),
    rule("bash", "allow"),
    rule("webfetch", "allow"),
    rule("destructive", "ask"),
    rule("external_directory", "ask"),
  ]
}

export function readScope(directory: string): Scope {
  if (!directory || typeof localStorage === "undefined") return "workspace"
  try {
    const raw = localStorage.getItem(KEY)
    const map = raw ? (JSON.parse(raw) as Record<string, unknown>) : {}
    const value = map[directory]
    if (value === "read") return "workspace"
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
