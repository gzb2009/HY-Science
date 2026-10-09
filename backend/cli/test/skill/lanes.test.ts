import { describe, expect, test } from "bun:test"
import { laneOf } from "../../src/skill/lanes"
import { themeAllows } from "@hysci/util/themes"

describe("laneOf", () => {
  test("sends analysis to assay and prose to manuscript", () => {
    expect(laneOf({ name: "scanpy", location: "/skills/biology/scanpy/SKILL.md" })).toBe("assay")
    expect(laneOf({ name: "HY_bulk-rnaseq", location: "/skills/biology/HY_bulk-rnaseq/SKILL.md" })).toBe("assay")
    expect(laneOf({ name: "HY_manuscript-draft", location: "/skills/manuscript/HY_manuscript-draft/SKILL.md" })).toBe(
      "manuscript",
    )
    expect(laneOf({ name: "HY_evidence-reader", location: "/skills/manuscript/HY_evidence-reader/SKILL.md" })).toBe(
      "evidence",
    )
    expect(laneOf({ name: "HY_design-stats", location: "/skills/manuscript/HY_design-stats/SKILL.md" })).toBe("design")
    expect(laneOf({ name: "HY_statistical-power", location: "/skills/coding/HY_statistical-power/SKILL.md" })).toBe(
      "design",
    )
    expect(laneOf({ name: "vllm", location: "/skills/ml-inference/vllm/SKILL.md" })).toBe("hold")
    expect(laneOf({ name: "HY_lane-assay" })).toBe("assay")
  })
})

describe("theme gate", () => {
  test("opens the manuscript lane on an imaging project and keeps full-text download out", () => {
    expect(themeAllows("imc", "HY_lane-manuscript")).toBe(true)
    expect(themeAllows("imc", "HY_manuscript-response")).toBe(true)
    expect(themeAllows("imc", "nature-downloader")).toBe(false)
    expect(themeAllows("imc", "nature-writing")).toBe(false)
    expect(themeAllows("single-cell", "HY_bulk-rnaseq")).toBe(true)
    expect(themeAllows("genomics", "HY_qiime2")).toBe(true)
    expect(themeAllows("imc", "HY_qiime2")).toBe(false)
  })
})
