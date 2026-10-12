import { describe, expect, test } from "bun:test"
import { AGENT_DECIDE, advance, notice, researchOf, skipLabel } from "./research.js"
import type { Event, QuestionInfo } from "./gen/types.gen.js"

const question: QuestionInfo = {
  question: "组织类型？",
  header: "组织",
  options: [
    { label: "FFPE", description: "石蜡" },
    { label: "新鲜组织（推荐）", description: "新鲜" },
  ],
}

describe("research launch helpers", () => {
  test("general clears the subdomain and specialist protocols keep it", () => {
    expect(researchOf("general")).toEqual({ domain: "general" })
    expect(researchOf("imc")).toEqual({ domain: "biology", subdomain: "imc" })
    expect(researchOf("single-cell").subdomain).toBe("single-cell")
  })

  test("decide and skip fill only the current question", () => {
    const first = advance({ count: 2, tab: 0, answers: [], answer: AGENT_DECIDE })
    expect(first.submit).toBeUndefined()
    expect(first.answers).toEqual([[AGENT_DECIDE]])
    const second = advance({ count: 2, tab: first.tab, answers: first.answers, answer: "FFPE" })
    expect(second.submit).toEqual([[AGENT_DECIDE], ["FFPE"]])
  })

  test("skip uses the recommended option for the current question", () => {
    expect(skipLabel(question, { id: "d", taskID: "t", recommendation: "FFPE", expiresAt: 1 })).toBe("FFPE")
    expect(skipLabel(question)).toBe("新鲜组织（推荐）")
  })

  test("events collapse to question, permission, file, or text", () => {
    const asked = notice({
      type: "question.asked",
      properties: { id: "q", sessionID: "s", questions: [question] },
    })
    expect(asked.kind).toBe("question")
    const file = notice({
      type: "message.part.updated",
      properties: {
        part: {
          id: "p",
          sessionID: "s",
          messageID: "m",
          type: "file",
          mime: "text/csv",
          filename: "cells.csv",
          url: "file:///cells.csv",
        },
      },
    } as Event)
    expect(file).toEqual({ kind: "file", name: "cells.csv", url: "file:///cells.csv" })
  })
})
