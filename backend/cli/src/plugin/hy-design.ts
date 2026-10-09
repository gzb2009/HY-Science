import type { Hooks, PluginInput } from "@hysci/plugin"
import path from "path"

const LIMIT = 6000

export const HY_DESIGN_MARK = "HY design (project DESIGN.md)"

export function designSystemBlock(text: string) {
  const body = text.trim().slice(0, LIMIT)
  if (!body) return ""
  return `${HY_DESIGN_MARK}: treat this as the authoritative token sheet. Do not invent a competing palette, type scale, or layout concept unless the user explicitly asks to restyle.\n\n${body}`
}

export async function HyDesignPlugin(input: PluginInput): Promise<Hooks> {
  return {
    "experimental.chat.system.transform": async (_input, output) => {
      const file = Bun.file(path.join(input.directory, "DESIGN.md"))
      if (!(await file.exists())) return
      const block = designSystemBlock(await file.text())
      if (!block) return
      if (output.system.some((item) => item.includes(HY_DESIGN_MARK))) return
      output.system.push(block)
    },
  }
}
