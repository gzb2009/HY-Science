import { describe, expect, test } from "bun:test"
import { allowed, brief, seatMembers } from "@hysci/util/seat"

describe("seat", () => {
  test("keeps only real seats", () => {
    expect(seatMembers(["biology", "biology", "critique", "nope", 1])).toEqual(["biology"])
  })

  test("hearth may call a seated hand and its own instruments", () => {
    expect(allowed("research", "biology", ["biology"])).toBe(true)
    expect(allowed("research", "physics", ["biology"])).toBe(false)
    expect(allowed("research", "critique", [])).toBe(true)
    expect(allowed("research", "task", [])).toBe(true)
  })

  test("seated hands may call each other and not the instruments", () => {
    const members = ["biology", "ml"]
    expect(allowed("biology", "ml", members)).toBe(true)
    expect(allowed("biology", "biology", members)).toBe(false)
    expect(allowed("biology", "critique", members)).toBe(false)
    expect(allowed("biology", "write", members)).toBe(false)
  })

  test("names the hearth and the people actually seated", () => {
    const alone = brief("research", [])
    expect(alone).toContain("首席导研究员 Chief Investigator")
    expect(alone).toContain("组里没有其他研究员")

    const room = brief("research", ["biology", "literature-review"])
    expect(room).toContain("生物研究员 Biology Researcher")
    expect(room).toContain("文献研究员 Literature Researcher")
    expect(room).not.toContain("物理研究员")

    expect(brief("biology", ["biology", "ml"])).toContain("机器学习研究员 Machine Learning Researcher")
    expect(brief("critique", [])).toContain("核查研究员 Verification Researcher")
  })
})
