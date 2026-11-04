import { seat } from "@hysci/util/seat"

/**
 * 首席导研究员的任务拆分。编号事项留在科研回路上，核查研究员在依赖完成后核查。
 */

export namespace Coordinator {
  export type Role = "coordinator" | "expert" | "reviewer"

  export interface Subtask {
    id: string
    description: string
    agent: string
    role: Role
    dependencies: string[] // subtask ids this depends on
    priority: number // 1=highest
  }

  export interface Plan {
    subtasks: Subtask[]
    reasoning: string
  }

  /**
   * Regex-based task decomposition. For complex requests (100+ chars, multiple
   * question marks or numbered items), split into subtasks.
   * Full LLM-driven decomposition would use a cheap model; regex is the fast path.
   */
  export function decompose(text: string): Plan {
    const subtasks: Subtask[] = []

    const review = () => {
      if (subtasks.length < 2) return
      const dependencies = subtasks.map((task) => task.id)
      subtasks.push({
        id: `subtask-${subtasks.length + 1}`,
        description:
          "Audit the named expert outputs for citations, computations, and code-to-figure consistency. Do not repeat execution.",
        agent: "critique",
        role: "reviewer",
        dependencies,
        priority: subtasks.length + 1,
      })
    }

    const numberedItems = text.match(/(?:^|\n)\s*(?:\d+[.)]\s*|[-*]\s+)([^\n]+)/g) ?? []
    const items = numberedItems
      .map((raw) => raw.replace(/^\s*(?:\d+[.)]\s*|[-*]\s+)/, "").trim())
      .filter((item) => item.length >= 10)
    if (items.length >= 2) {
      for (const item of items) {
        subtasks.push({
          id: `subtask-${subtasks.length + 1}`,
          description: item,
          agent: "research",
          role: "expert",
          dependencies: [],
          priority: subtasks.length + 1,
        })
      }
      review()
      return { subtasks, reasoning: `Decomposed into ${subtasks.length} subtasks from numbered list` }
    }

    return {
      subtasks: [
        { id: "subtask-1", description: text, agent: "research", role: "expert", dependencies: [], priority: 1 },
      ],
      reasoning: "Single task — the visible agent stays research",
    }
  }

  function role(name: string) {
    if (name === "reviewer") return "核查研究员"
    if (name === "expert") return "研究员"
    return "首席导研究员"
  }

  function who(key: string) {
    const item = seat(key)
    if (!item) return key
    return `${item.zh} ${key}`
  }

  /** Format the sitting plan as hybio injection for 首席导研究员. */
  export function formatPlan(plan: Plan): string {
    if (plan.subtasks.length <= 1) return ""
    const lines = [
      "<coordinator-plan>",
      `## 首席导研究员把这件事分成 ${plan.subtasks.length} 件`,
      plan.reasoning,
      "",
      "| # | 角色 | 子任务 | 研究员 | 依赖 |",
      "|---|------|--------|--------|------|",
      ...plan.subtasks.map(
        (s) =>
          `| ${s.id.split("-")[1]} | ${role(s.role)} | ${s.description.slice(0, 60)}... | ${who(s.agent)} | ${s.dependencies.length > 0 ? s.dependencies.join(", ") : "无"} |`,
      ),
      "",
      "执行策略：",
      "- 首席导研究员派工与交付；进组的事没有依赖时可以并行，用 task，subagent_type 用括号里的 key",
      "- 核查研究员必须在所有 dependencies 的 <task_result> 可引用后执行；只接收这些结构化结果，不接收执行分支的完整对话历史",
      "- 核查研究员只核查引用、计算和代码-图表一致性，不重复执行",
      "- 核查研究员的阻断性发现必须在首席导研究员交付前解决或明确标注",
      "</coordinator-plan>",
    ]
    return lines.join("\n")
  }
}
