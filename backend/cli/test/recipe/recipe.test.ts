import { describe, expect, test } from "bun:test"
import path from "path"
import { tmpdir } from "../fixture/fixture"
import { Instance } from "../../src/project/instance"
import { RecipeCatalog } from "../../src/recipe/load"
import { RecipeRun } from "../../src/recipe/run"
import { RecipeRoute } from "../../src/recipe/route"
import { RecipeUpgrade } from "../../src/recipe/upgrade"
import { Manifest } from "../../src/recipe/schema"

const manifest = path.join(import.meta.dir, "../../skills/biology/imc-analysis/recipe.json")

describe("recipe.manifest", () => {
  test("parses IMC cards and keeps expert-only steps out of ready set", async () => {
    const parsed = Manifest.parse(await Bun.file(manifest).json())
    const ids = parsed.recipes.map((recipe) => recipe.id)
    expect(ids).toContain("imc.segment")
    expect(ids).toContain("imc.pcf")
    expect(ids).toContain("imc.convert")
    expect(parsed.recipes.find((recipe) => recipe.id === "imc.convert")?.maturity).toBe("expert_only")
    expect(parsed.recipes.find((recipe) => recipe.id === "imc.segment")?.maturity).toBe("ready")
  })

  test("rejects unknown fields on params", () => {
    expect(() =>
      Manifest.parse({
        version: "1",
        recipes: [
          {
            id: "bad",
            title: "bad",
            maturity: "ready",
            skill: "imc-analysis",
            script: "scripts/imc_pipeline.py",
            params: { foo: { kind: "shell" } },
          },
        ],
      }),
    ).toThrow()
  })
})

describe("recipe.whitelist", () => {
  async function segment() {
    const parsed = Manifest.parse(await Bun.file(manifest).json())
    return parsed.recipes.find((item) => item.id === "imc.segment")!
  }

  test("fills defaults and rejects unknown keys", async () => {
    const recipe = await segment()
    const params = RecipeRun.whitelist(recipe, { input_dir: "images", panel: "panel.csv" })
    expect(params.segmenter).toBe("otsu")
    expect(params.min_area).toBe(50)
    expect(() => RecipeRun.whitelist(recipe, { input_dir: "images", panel: "panel.csv", bash: "rm -rf /" })).toThrow(
      /unknown param/,
    )
  })

  test("rejects enum outside the allow list", async () => {
    const recipe = await segment()
    expect(() =>
      RecipeRun.whitelist(recipe, { input_dir: "images", panel: "panel.csv", segmenter: "custom.py" }),
    ).toThrow(/invalid enum/)
  })
})

describe("recipe.paths", () => {
  test("blocks paths outside the project", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        expect(() => RecipeCatalog.resolveUserPath("/etc/passwd")).toThrow(/outside project/)
        expect(() => RecipeCatalog.resolveUserPath("../escape")).toThrow(/outside project/)
        const inside = RecipeCatalog.resolveUserPath("images")
        expect(inside.startsWith(tmp.path)).toBe(true)
      },
    })
  })
})

describe("recipe.route", () => {
  test("reads an explicit recipe marker", () => {
    expect(RecipeRoute.marker('hello <imc-recipe id="imc.segment" />')).toBe("imc.segment")
  })

  test("keeps optimization requests on the large model", () => {
    expect(RecipeRoute.expert("请优化分割算法")).toBe(true)
    expect(RecipeRoute.expert("modify the algorithm for segmentation")).toBe(true)
    expect(RecipeRoute.expert("请执行 IMC 细胞分割")).toBe(false)
  })

  test("matches a single high-confidence keyword", async () => {
    const recipes = Manifest.parse(await Bun.file(manifest).json()).recipes
    expect(RecipeRoute.matchKeyword("请做细胞邻域分析", recipes)?.id).toBe("imc.neighborhood")
    expect(RecipeRoute.matchKeyword("随便看看数据", recipes)).toBeUndefined()
  })

  test("routes ready IMC cards only when execution_model is available", async () => {
    await using tmp = await tmpdir({
      config: {
        execution_model: "local-openai/qwen",
        provider: {
          "local-openai": {
            name: "Local",
            npm: "@ai-sdk/openai-compatible",
            models: {
              qwen: {
                name: "Qwen",
                tool_call: true,
                limit: { context: 8192, output: 2048 },
              },
            },
            options: { baseURL: "http://localhost:11434/v1" },
          },
        },
      },
    })
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const hit = await RecipeRoute.resolve({
          subdomain: "imc",
          text: 'run <imc-recipe id="imc.segment" />',
        })
        expect(hit?.agent).toBe("recipe-executor")
        expect(hit?.model.modelID).toBe("qwen")
        expect(
          await RecipeRoute.resolve({
            subdomain: "imc",
            text: '优化算法 <imc-recipe id="imc.segment" />',
          }),
        ).toBeUndefined()
        expect(
          await RecipeRoute.resolve({
            subdomain: "imc",
            text: '<imc-recipe id="imc.convert" />',
          }),
        ).toBeUndefined()
        expect(
          await RecipeRoute.resolve({
            subdomain: "biology",
            text: '<imc-recipe id="imc.segment" />',
          }),
        ).toBeUndefined()
      },
    })
  })
})

describe("recipe.upgrade", () => {
  test("upgrades at most once per session", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const pack = { recipe: "imc.segment", params: { min_area: 50 }, outputs: [], error: "boom" }
        expect(RecipeUpgrade.mark("ses_1", pack)).toBe(true)
        expect(RecipeUpgrade.consume("ses_1")?.error).toBe("boom")
        expect(RecipeUpgrade.mark("ses_1", pack)).toBe(false)
        expect(RecipeUpgrade.consume("ses_1")).toBeUndefined()
        expect(RecipeUpgrade.render(pack)).toContain("<imc-recipe-upgrade />")
        expect(RecipeUpgrade.render(pack)).toContain("imc.segment")
      },
    })
  })
})
