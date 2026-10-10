import { describe, expect, test } from "bun:test"
import { fillRatio, formatSlice, measureContext, sliceWidth, usageBand } from "./context-meter"

describe("measureContext", () => {
  test("splits a measured prompt without exceeding the provider total", () => {
    const usage = measureContext({
      limit: 1000,
      input: 200,
      output: 80,
      reasoning: 0,
      messageChars: 400,
      skillChars: 80,
      skillCount: 2,
    })
    expect(usage.used).toBe(280)
    expect(usage.percent).toBe(28)
    expect(usage.slices.reduce((sum, slice) => sum + slice.tokens, 0)).toBe(280)
    expect(usage.slices.find((slice) => slice.id === "message")?.tokens).toBe(100)
    expect(usage.slices.find((slice) => slice.id === "skill")?.tokens).toBe(20)
    expect(usage.slices.find((slice) => slice.id === "system")?.tokens).toBe(160)
  })

  test("stays empty before the first reply", () => {
    const usage = measureContext({
      limit: 8000,
      input: 0,
      output: 0,
      reasoning: 0,
      messageChars: 0,
      skillChars: 0,
      skillCount: 0,
    })
    expect(usage.percent).toBe(0)
    expect(usage.used).toBe(0)
  })
})

describe("formatSlice", () => {
  test("shows a sub-percent slice as less than one", () => {
    expect(formatSlice(10, 10_000)).toBe("<1%")
    expect(formatSlice(0, 10_000)).toBe("0%")
  })
})

describe("fillRatio", () => {
  test("grows with used tokens and caps at the window", () => {
    const low = measureContext({
      limit: 1000,
      input: 120,
      output: 0,
      reasoning: 0,
      messageChars: 0,
      skillChars: 0,
      skillCount: 0,
    })
    const high = measureContext({
      limit: 1000,
      input: 860,
      output: 0,
      reasoning: 0,
      messageChars: 0,
      skillChars: 0,
      skillCount: 0,
    })
    expect(fillRatio(low)).toBeCloseTo(0.12)
    expect(fillRatio(high)).toBeCloseTo(0.86)
    expect(usageBand(low.percent)).toBe("low")
    expect(usageBand(high.percent)).toBe("high")
  })
})

describe("sliceWidth", () => {
  test("sizes a slice against the window", () => {
    const usage = measureContext({
      limit: 100,
      input: 28,
      output: 0,
      reasoning: 0,
      messageChars: 48,
      skillChars: 0,
      skillCount: 0,
    })
    const message = usage.slices.find((slice) => slice.id === "message")
    expect(message && sliceWidth(message.tokens, usage)).toBe(12)
  })
})
