import { describe, expect, test } from "bun:test"
import { resumeHref } from "./desktop-session"

describe("resumeHref", () => {
  test("stays on the project list when the user leaves a session", () => {
    expect(resumeHref({ shell: true, stay: true, href: "/dir/session/ses_1?desktop=1" })).toBeUndefined()
  })

  test("resumes the last session on a desktop launch", () => {
    expect(resumeHref({ shell: true, stay: false, href: "/dir/session/ses_1?desktop=1" })).toBe(
      "/dir/session/ses_1?desktop=1",
    )
  })
})
