import { describe, expect, test } from "bun:test"
import { projectSessionHref, sessionIdFromPath } from "./route-session"
import { base64Encode } from "@hysci/util/encode"

describe("sessionIdFromPath", () => {
  test("reads the session id segment", () => {
    expect(sessionIdFromPath("/abc/session/ses_1")).toBe("ses_1")
    expect(sessionIdFromPath("/abc/session/new")).toBe("new")
  })

  test("bare /session has no leftover id", () => {
    expect(sessionIdFromPath("/abc/session")).toBeUndefined()
    expect(sessionIdFromPath("/abc/session/")).toBeUndefined()
  })
})

describe("projectSessionHref", () => {
  test("always includes a session segment", () => {
    const dir = "/Users/me/test/测试3"
    expect(projectSessionHref(dir)).toBe(`/${base64Encode(dir)}/session/new`)
    expect(projectSessionHref(dir, "ses_1")).toBe(`/${base64Encode(dir)}/session/ses_1`)
  })
})
