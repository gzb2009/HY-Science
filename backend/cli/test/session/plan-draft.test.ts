import { describe, expect, test } from "bun:test"
import { PlanDraft } from "../../src/session/plan-draft"

describe("PlanDraft", () => {
  test("plans executable work and concrete tasks", () => {
    expect(
      PlanDraft.needsPlan({
        text: "分析这个单细胞数据并比较两组差异。",
        intent: "data_analysis",
        action: "execute",
        mustClarify: false,
      }),
    ).toBe(true)
    expect(
      PlanDraft.needsPlan({
        text: "针对这个项目查看，并且提出优化建议和目前工作的总结",
        intent: "direct_answer",
        action: "answer",
        mustClarify: false,
      }),
    ).toBe(true)
  })

  test("does not plan a direct question or a blocked premise", () => {
    expect(
      PlanDraft.needsPlan({
        text: "什么是 t 检验",
        intent: "direct_answer",
        action: "answer",
        mustClarify: false,
      }),
    ).toBe(false)
    expect(
      PlanDraft.needsPlan({
        text: "分析这个数据",
        intent: "data_analysis",
        action: "clarify",
        mustClarify: true,
      }),
    ).toBe(false)
  })

  test("drafts once, waits, then executes only after approval", () => {
    const task = "分析这个单细胞数据并比较两组差异。"
    expect(
      PlanDraft.decide({
        text: task,
        intent: "data_analysis",
        action: "execute",
        mustClarify: false,
      }),
    ).toBe("draft")
    expect(
      PlanDraft.decide({
        text: task,
        intent: "data_analysis",
        action: "execute",
        mustClarify: false,
        draft: { status: "pending", source: task },
      }),
    ).toBe("present")
    expect(
      PlanDraft.decide({
        text: "按这个做",
        intent: "direct_answer",
        action: "answer",
        mustClarify: false,
        draft: { status: "pending", source: task },
      }),
    ).toBe("execute")
    expect(
      PlanDraft.decide({
        text: "第三步改成只做质控",
        intent: "correction",
        action: "answer",
        mustClarify: false,
        draft: { status: "pending", source: task },
      }),
    ).toBe("redraft")
    expect(
      PlanDraft.decide({
        text: "把图例字号加大",
        intent: "direct_answer",
        action: "answer",
        mustClarify: false,
        draft: { status: "approved", source: task },
      }),
    ).toBe("execute")
  })
})
