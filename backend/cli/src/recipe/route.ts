import path from "path"
import { Config } from "../config/config"
import { Provider } from "../provider/provider"
import { Skill } from "../skill/skill"
import { RecipeCatalog } from "./load"
import type { Recipe } from "./schema"

export const RECIPE_MARK = /<imc-recipe\s+id="([^"]+)"\s*\/>/i

const EXPERT =
  /优化|修改算法|新方法|解释异常|改代码|换分割器实现|customize algorithm|new method|modify (the )?algorithm|explain (the )?(error|anomaly)/i

async function skillReady(name: string) {
  const bundled = path.join(import.meta.dir, "../../skills/biology", name, "SKILL.md")
  if (await Bun.file(bundled).exists()) return true
  const skills = await Skill.all()
  return skills.some((item) => item.name === name)
}

export namespace RecipeRoute {
  export function marker(text: string) {
    return text.match(RECIPE_MARK)?.[1]
  }

  export function expert(text: string) {
    return EXPERT.test(text)
  }

  export function matchKeyword(text: string, recipes: Recipe[]) {
    const lower = text.toLowerCase()
    const hits = recipes.filter(
      (recipe) => recipe.maturity === "ready" && recipe.keywords.some((key) => lower.includes(key.toLowerCase())),
    )
    if (hits.length !== 1) return undefined
    return hits[0]
  }

  export async function execution() {
    const cfg = await Config.get()
    if (!cfg.execution_model) return undefined
    const parsed = Provider.parseModel(cfg.execution_model)
    const available = await Provider.list()
    const model = available[parsed.providerID]?.models[parsed.modelID]
    if (!model || model.capabilities.toolcall === false) return undefined
    return parsed
  }

  export async function resolve(input: { subdomain?: string; text: string }) {
    if (input.subdomain !== "imc") return undefined
    if (input.text.includes("<imc-recipe-upgrade")) return undefined
    if (expert(input.text)) return undefined
    const model = await execution()
    if (!model) return undefined

    const recipes = await RecipeCatalog.all()
    const marked = marker(input.text)
    if (!marked) return undefined
    const recipe = recipes.find((item) => item.id === marked)
    if (!recipe || recipe.maturity !== "ready") return undefined
    if (!(await skillReady(recipe.skill))) return undefined

    return {
      agent: "recipe-executor" as const,
      model,
      recipe: recipe.id,
    }
  }
}
