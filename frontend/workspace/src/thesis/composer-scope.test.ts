import { describe, expect, test } from "bun:test"
import { isScope, scopeRules } from "./composer-scope"

describe("composer scope", () => {
  test("read blocks edits and commands", () => {
    const rules = scopeRules("read")
    expect(rules.find((item) => item.permission === "edit")?.action).toBe("deny")
    expect(rules.find((item) => item.permission === "bash")?.action).toBe("deny")
    expect(rules.find((item) => item.permission === "external_directory")?.action).toBe("deny")
  })

  test("workspace allows inside and asks outside", () => {
    const rules = scopeRules("workspace")
    expect(rules.find((item) => item.permission === "edit")?.action).toBe("allow")
    expect(rules.find((item) => item.permission === "external_directory")?.action).toBe("ask")
    expect(rules.find((item) => item.permission === "destructive")?.action).toBe("ask")
  })

  test("trust allows any file or command", () => {
    const rules = scopeRules("trust")
    expect(rules.find((item) => item.permission === "external_directory")?.action).toBe("allow")
    expect(rules.find((item) => item.permission === "destructive")?.action).toBe("allow")
    expect(rules.find((item) => item.permission === "read")?.action).toBe("allow")
  })

  test("scope ids", () => {
    expect(isScope("trust")).toBe(true)
    expect(isScope("open")).toBe(false)
  })
})
