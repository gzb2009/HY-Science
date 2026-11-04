import { describe, expect, test } from "bun:test"
import { Execution } from "../../src/session/execution"

describe("Execution", () => {
  test("adds code lookup beside the domain researcher, and physics audit gets its own checker", () => {
    const tracks = Execution.tracks("在 src/pipeline.py 里核对这个蛋白质组脚本")
    expect(tracks.map((track) => track.agent)).toEqual(["literature-review", "task", "explore", "biology"])
    expect(Execution.auditors("biology").map((item) => item.agent)).toEqual(["critique", "reviewer"])
    expect(Execution.auditors("physics").map((item) => item.agent)).toEqual([
      "critique",
      "reviewer",
      "physics-critique",
    ])
  })

  test("walks approval, another round, audit, and then stays on the final version", () => {
    let prior: { phase?: string; source?: string } | undefined
    const turns = [
      ["按这个做", "dispatch"],
      ["按这个做", "hold"],
      ["继续探索", "dispatch"],
      ["分叉到物理", "dispatch"],
      ["确认完成", "audit"],
      ["确认完成", "hold"],
    ] as const
    for (const [text, expected] of turns) {
      const got = Execution.step(prior, text, "execute")
      expect(got).toBe(expected)
      if (got === "dispatch") prior = { phase: "customer", source: text }
      if (got === "audit") prior = { phase: "final", source: text }
    }
  })

  test("keeps a protein task on literature, compute, and biology", () => {
    const tracks = Execution.tracks("做这个蛋白质组差异分析，并检索文献")
    expect(tracks.map((track) => track.key)).toEqual(["literature", "compute", "domain"])
    expect(tracks[2]?.agent).toBe("biology")
    expect(Execution.domainAgent("把模拟分叉到物理研究员")).toBe("physics")
    const depth = Execution.tracks("分析这个单细胞数据并比较两组差异", "depth", 0)
    expect(depth.map((track) => track.key)).toEqual(["domain"])
    expect(Execution.tracks("分析这个单细胞数据并比较两组差异", "depth", 1)[0]?.key).toBe("literature")
    expect(Execution.tracks("什么是 t 检验", "straightforward")).toEqual([])
    const named = Execution.assigned(
      "## 步骤\n1. 文献检索交给文献研究员。\n2. 生物研究员看蛋白组。",
      "蛋白组",
      "breadth",
    )
    expect(named.map((track) => track.key)).toEqual(["literature", "domain"])
    const specs = Execution.tracks("做这个蛋白质组差异分析", "breadth")
    const prior = specs.map((track, index) => ({
      ...track,
      output: "ok",
      status: index === 1 ? ("partial" as const) : ("done" as const),
    }))
    const again = Execution.resume(specs, prior, "继续探索")
    expect(again.run.map((track) => track.key)).toEqual(["compute"])
    expect(again.keep.map((track) => track.key)).toEqual(["literature", "domain"])
    expect(Execution.resume(specs, prior, "继续把文献检索做深").run.map((track) => track.key)).toEqual([
      "literature",
      "compute",
    ])
  })

  test("waits for the customer, then audits or runs another round", () => {
    expect(Execution.step(undefined, "按这个做", "execute")).toBe("dispatch")
    expect(Execution.step({ phase: "customer", source: "按这个做" }, "按这个做", "execute")).toBe("hold")
    expect(Execution.step({ phase: "customer", source: "按这个做" }, "继续探索", "execute")).toBe("dispatch")
    expect(Execution.step({ phase: "customer", source: "按这个做" }, "确认完成", "execute")).toBe("audit")
    expect(Execution.step({ phase: "final", source: "确认完成" }, "好的", "execute")).toBe("hold")
    expect(Execution.reply("分叉到物理")).toBe("fork")
  })

  test("sends numbered and wording errors back to the track that made them", () => {
    const issues = Execution.findings("- compute: 样本量写成 12，表里是 11\n- literature: 引用年份错误\n无阻断问题")
    expect(issues).toEqual([
      { track: "compute", issue: "样本量写成 12，表里是 11" },
      { track: "literature", issue: "引用年份错误" },
    ])
    expect(Execution.findings("- code: 函数名和文件不一致")).toEqual([
      { track: "code", issue: "函数名和文件不一致" },
    ])
    expect(Execution.findings("无阻断问题")).toEqual([])
  })

  test("assembles the final package sections", () => {
    const text = Execution.manifest({
      plan: "## 步骤\n比较两组",
      method: "使用 DESeq2，比对到 GRCh38。",
      tracks: [
        {
          key: "compute",
          agent: "task",
          title: "计算分析",
          output: "python 3.11\n输出 /tmp/result.csv\n```python\nprint(1)\n```",
        },
      ],
      audit: "无阻断问题",
    })
    expect(text).toContain("## 产物文件")
    expect(text).toContain("/tmp/result.csv")
    expect(text).toContain("## 代码")
    expect(text).toContain("## 环境")
    expect(text).toContain("python 3.11")
    expect(text).toContain("## 方法学")
    expect(text).toContain("DESeq2")
    expect(text).toContain("## 历史")
  })
})
