import z from "zod"
import { Tool } from "./tool"
import { RecipeCatalog } from "../recipe/load"
import { RecipeRun } from "../recipe/run"

const DESCRIPTION = `List, inspect, or run a mature IMC recipe. Use only whitelist params. Never invent scripts or shell commands.`

export const ImcRecipeTool = Tool.define("imc_recipe", {
  description: DESCRIPTION,
  parameters: z.object({
    action: z.enum(["list", "inspect", "run"]),
    recipe: z.string().optional(),
    params: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
  }),
  async execute(params, ctx) {
    if (params.action === "list") {
      const recipes = await RecipeCatalog.all()
      const rows = recipes.map((recipe) => ({
        id: recipe.id,
        title: recipe.title,
        maturity: recipe.maturity,
        params: Object.keys(recipe.params),
      }))
      return {
        title: "IMC recipes",
        metadata: {},
        output: JSON.stringify({ recipes: rows }, null, 2),
      }
    }

    if (!params.recipe) {
      return {
        title: "IMC recipe",
        metadata: {},
        output: JSON.stringify({ status: "needs_input", error: "recipe id required" }),
      }
    }

    if (params.action === "inspect") {
      const recipe = await RecipeCatalog.get(params.recipe)
      if (!recipe) {
        return {
          title: "IMC recipe",
          metadata: {},
          output: JSON.stringify({ status: "needs_expert", error: "unknown recipe" }),
        }
      }
      return {
        title: recipe.title,
        metadata: {},
        output: JSON.stringify(
          {
            id: recipe.id,
            title: recipe.title,
            maturity: recipe.maturity,
            params: recipe.params,
            requires: recipe.requires,
            produces: recipe.produces,
          },
          null,
          2,
        ),
      }
    }

    const result = await RecipeRun.execute({
      recipe: params.recipe,
      params: params.params,
      sessionID: ctx.sessionID,
    })
    return {
      title: `${params.recipe} · ${result.status}`,
      metadata: {},
      output: JSON.stringify(result),
    }
  },
})
