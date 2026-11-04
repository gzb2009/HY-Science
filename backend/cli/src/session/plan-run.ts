const drafting = new Set<string>()

export namespace PlanRun {
  export async function write(input: {
    sessionID: string
    task: string
    prior?: string
    shape?: string
    model: { providerID: string; modelID: string }
  }) {
    if (drafting.has(input.sessionID)) return ""
    drafting.add(input.sessionID)
    try {
      const { Session } = await import("./index")
      const { SessionPrompt } = await import("./prompt")
      const child = await Session.create({
        parentID: input.sessionID,
        title: "任务规划 · 任务规划研究员",
      })
      const prompt = [
        "为下面的任务写规划。不要执行。",
        input.shape ?? "",
        input.prior ? `上一版规划，按新的要求改：\n${input.prior}` : "",
        input.task,
      ]
        .filter(Boolean)
        .join("\n\n")
      const result = await SessionPrompt.prompt({
        sessionID: child.id,
        agent: "planner",
        model: input.model,
        parts: [{ type: "text", text: prompt }],
      })
      return result.parts
        .flatMap((part) => (part.type === "text" && !part.hybio ? [part.text.trim()] : []))
        .filter(Boolean)
        .join("\n")
        .trim()
    } catch {
      return ""
    } finally {
      drafting.delete(input.sessionID)
    }
  }
}
