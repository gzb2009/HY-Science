import { describe, expect, test } from "bun:test"
import { tmpdir } from "../fixture/fixture"
import { Instance } from "../../src/project/instance"
import { ImcRecipeTool } from "../../src/tool/imc-recipe"
import { RecipeRun } from "../../src/recipe/run"

const ctx = {
  sessionID: "ses_test",
  messageID: "msg_test",
  callID: "call_test",
  agent: "recipe-executor",
  abort: AbortSignal.any([]),
  messages: [],
  metadata: () => {},
  ask: async () => {},
}

describe("tool.imc_recipe", () => {
  test("lists ready and expert-only recipes", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const tool = await ImcRecipeTool.init()
        const result = await tool.execute({ action: "list" }, ctx)
        expect(result.output).toContain("imc.segment")
        expect(result.output).toContain("imc.convert")
      },
    })
  })

  test("inspect returns whitelist params", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const tool = await ImcRecipeTool.init()
        const result = await tool.execute({ action: "inspect", recipe: "imc.segment" }, ctx)
        expect(result.output).toContain("segmenter")
        expect(result.output).toContain("ready")
      },
    })
  })

  test("run of expert_only returns needs_expert", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const result = await RecipeRun.execute({ recipe: "imc.convert", sessionID: "ses_test" })
        expect(result.status).toBe("needs_expert")
      },
    })
  })

  test("run without required paths returns needs_input", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const result = await RecipeRun.execute({
          recipe: "imc.segment",
          params: { input_dir: "images", panel: "panel.csv" },
        })
        expect(result.status).toBe("needs_input")
      },
    })
  })

  test("run rejects a path outside the project", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const result = await RecipeRun.execute({
          recipe: "imc.inspect",
          params: { input_dir: "/etc", panel: "/etc/passwd" },
        })
        expect(result.status).toBe("needs_expert")
        expect(result.error).toMatch(/outside project/)
      },
    })
  })
})
