import { test, expect } from "bun:test"
import { designSystemBlock, HY_DESIGN_MARK } from "../../src/plugin/hy-design"

test("designSystemBlock wraps DESIGN.md as the token sheet", () => {
  const block = designSystemBlock("  accent: #1a4f6b\n")
  expect(block.startsWith(HY_DESIGN_MARK)).toBe(true)
  expect(block).toContain("accent: #1a4f6b")
})

test("designSystemBlock skips empty sheets", () => {
  expect(designSystemBlock("  \n")).toBe("")
})

test("designSystemBlock truncates oversized sheets", () => {
  const block = designSystemBlock("x".repeat(9000))
  expect(block.length).toBeLessThan(9000)
  expect(block.length).toBeGreaterThan(1000)
})
