export type QueryKind = "straightforward" | "depth" | "breadth"

const BREADTH = /有哪些|分别|版图|综述|多组学|并列|多个交付|landscape|overview|what are the/i
const DEPTH = /为什么|机制|深入|优化|逐层|这个项目|how does|why does|drill|pathway/i
const TASK = /查看|优化|总结|规划|设计|方案|分析|评估|review|plan|analy[sz]e|design|summar/i

export namespace Query {
  export function classify(input: { text: string; intent: string; action: string; mustClarify: boolean }) {
    const text = input.text.trim()
    if (!text || input.mustClarify) return undefined
    if (input.intent === "meta_conversation") return "straightforward" as const
    const breadth = BREADTH.test(text) || input.action === "plan"
    const depth =
      DEPTH.test(text) ||
      input.action === "execute" ||
      (input.intent === "literature_verification" && text.length >= 20 && !BREADTH.test(text)) ||
      (text.length >= 20 && TASK.test(text) && input.action !== "plan")
    if (depth && breadth) return "depth" as const
    if (breadth) return "breadth" as const
    if (depth) return "depth" as const
    return "straightforward" as const
  }

  export function assess(text: string, kind: QueryKind | undefined, known: string[]) {
    const task = text.split(/[。！？\n]/)[0]?.trim().slice(0, 80) || text.slice(0, 80)
    const inside =
      kind === "depth"
        ? "沿一个对象逐层往下"
        : kind === "breadth"
          ? "把互不依赖的块同时展开"
          : kind === "straightforward"
            ? "直接回答这一个问题"
            : "先补齐挡住下一步的前提"
    const outside =
      kind === "straightforward"
        ? "不写计划，不派研究员"
        : kind === "depth"
          ? "第一轮不把文献、计算、代码和领域同时派出去"
          : kind === "breadth"
            ? "不把有依赖的步骤放进同一轮"
            : "确认前不写计划，不派工"
    return {
      task,
      inside,
      outside,
      premises: known.filter(Boolean).join("、") || "原文还没有写下已知前提",
    }
  }

  export function shape(kind: QueryKind | undefined) {
    if (kind === "depth")
      return "这是深挖。步骤按层写。每一层只回答一个问题，并写明依赖上一层的哪条结果、用哪一位研究员、做完的标志。没有依赖的核对才可以并列。"
    if (kind === "breadth")
      return "这是铺开。步骤按独立的块写。每一块写独立问题、负责的研究员、不与其他块共享的材料、交回格式。块之间不写依赖。"
    return ""
  }
}
