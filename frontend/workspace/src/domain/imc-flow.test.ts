import { describe, expect, test } from "bun:test"
import { IMC_STEPS, recipeMark } from "./imc-flow"

describe("imc-flow", () => {
  test("cards carry stable recipe ids", () => {
    expect(IMC_STEPS.map((step) => step[4])).toEqual([
      "imc.convert",
      "imc.segment",
      "imc.qc",
      "imc.cluster",
      "imc.neighborhood",
      "imc.region",
    ])
    expect(recipeMark("imc.segment")).toBe('<imc-recipe id="imc.segment" />')
  })
})
