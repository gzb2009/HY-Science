import { describe, expect, test } from "bun:test"
import { Query } from "../../src/session/query-type"

describe("Query", () => {
  test("stops before classification when a premise is still blocking", () => {
    expect(
      Query.classify({ text: "分析这个数据", intent: "data_analysis", action: "clarify", mustClarify: true }),
    ).toBeUndefined()
  })

  test("answers a definition without a plan", () => {
    expect(Query.classify({ text: "什么是 t 检验", intent: "direct_answer", action: "answer", mustClarify: false })).toBe(
      "straightforward",
    )
  })

  test("drills one object before fanning out", () => {
    expect(
      Query.classify({
        text: "有哪些标志物，并沿其中一条机制深入",
        intent: "exploration",
        action: "answer",
        mustClarify: false,
      }),
    ).toBe("depth")
    expect(
      Query.classify({
        text: "分析这个单细胞数据并比较两组差异。",
        intent: "data_analysis",
        action: "execute",
        mustClarify: false,
      }),
    ).toBe("depth")
  })

  test("fans out independent questions", () => {
    expect(
      Query.classify({
        text: "这个领域有哪些方法，分别给一份综述",
        intent: "literature_verification",
        action: "plan",
        mustClarify: false,
      }),
    ).toBe("breadth")
  })

  test("records scope before any dispatch", () => {
    const note = Query.assess("分析这个单细胞数据并比较两组差异。", "depth", ["human"])
    expect(note.task).toContain("单细胞")
    expect(note.inside).toContain("逐层")
    expect(note.outside).toContain("同时派出去")
    expect(note.premises).toBe("human")
  })
})
