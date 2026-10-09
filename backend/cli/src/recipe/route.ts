import { Config } from "../config/config"
import { Provider } from "../provider/provider"
import { RecipeCatalog } from "./load"
import type { Recipe } from "./schema"

export const RECIPE_MARK = /<imc-recipe\s+id="([^"]+)"\s*\/>/i

const EXPERT =
  /优化|修改算法|新方法|解释异常|改代码|换分割器实现|customize algorithm|new method|modify (the )?algorithm|explain (the )?(error|anomaly)/i

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
    const recipe = marked ? recipes.find((item) => item.id === marked) : matchKeyword(input.text, recipes)
    if (!recipe || recipe.maturity !== "ready") return undefined

    return {
      agent: "recipe-executor" as const,
      model,
      recipe: recipe.id,
    }
  }
}
