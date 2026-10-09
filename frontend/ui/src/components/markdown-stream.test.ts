import { describe, expect, test } from "bun:test"
import { prepareStreamMarkdown } from "./markdown-stream"

describe("prepareStreamMarkdown", () => {
  test("leaves settled text unchanged", () => {
    const text = "这是 **加粗到一半"
    expect(prepareStreamMarkdown(text, false)).toBe(text)
  })

  test("closes an open bold marker on the tail line", () => {
    expect(prepareStreamMarkdown("已完成。\n这是 **加粗到一半", true)).toBe("已完成。\n这是 **加粗到一半**")
  })

  test("closes an open inline code span on the tail line", () => {
    expect(prepareStreamMarkdown("用 `code", true)).toBe("用 `code`")
  })

  test("drops a broken link target and keeps the label", () => {
    expect(prepareStreamMarkdown("见 [点我](https://exa", true)).toBe("见 点我")
  })

  test("closes an open math span on the tail line", () => {
    expect(prepareStreamMarkdown("能量 $E=mc", true)).toBe("能量 $E=mc$")
  })

  test("closes an open fence so later text stays inside the code block", () => {
    expect(prepareStreamMarkdown("```js\nconst a = 1", true)).toBe("```js\nconst a = 1\n```\n")
  })

  test("does not close a fence that is still being typed", () => {
    expect(prepareStreamMarkdown("```js", true)).toBe("```js")
  })

  test("holds a short table row until the columns catch up", () => {
    const text = "| 基因 | 数量 |\n| --- | --- |\n| CD3 | 12 |\n| CD4 |"
    expect(prepareStreamMarkdown(text, true)).toBe("| 基因 | 数量 |\n| --- | --- |\n| CD3 | 12 |\n")
  })

  test("keeps a table row once every column is present", () => {
    const text = "| 基因 | 数量 |\n| --- | --- |\n| CD3 | 12"
    expect(prepareStreamMarkdown(text, true)).toBe(text)
  })

  test("does not heal a line that already ended", () => {
    expect(prepareStreamMarkdown("这是 **加粗到一半\n", true)).toBe("这是 **加粗到一半\n")
  })
})
