import { describe, expect, test } from "bun:test"
import { Supervision } from "../../src/session/supervision"

describe("Supervision", () => {
  test("asks one premise before planning", () => {
    const text = Supervision.strategy({ mustClarify: true, blocking: "分析目标", move: "skip" })
    expect(text).toContain("分析目标")
    expect(text).toContain("不派工")
  })

  test("holds execution until the plan is confirmed", () => {
    expect(Supervision.strategy({ mustClarify: false, move: "draft" })).toContain("确认前不执行")
    expect(Supervision.strategy({ mustClarify: false, move: "execute" })).toContain("按记忆里的规划执行")
  })

  test("writes intent, strategy, and the plan into one memory block", () => {
    const block = Supervision.block({
      intent: "data_analysis",
      action: "execute",
      strategy: "这是多步任务。规划交给任务规划研究员。你只把规划交给用户，确认前不执行。",
      plan: "## 任务\n比较两组差异",
      status: "pending",
    })
    expect(block).toContain("<chief-memory>")
    expect(block).toContain("数据分析（data_analysis）")
    expect(block).toContain("执行（execute）")
    expect(block).toContain("待确认")
    expect(block).toContain("比较两组差异")
    expect(block).toContain("不要调用工具")
  })
})
