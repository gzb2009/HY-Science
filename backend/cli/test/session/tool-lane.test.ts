import { describe, expect, test } from "bun:test"
import { ToolLane } from "../../src/session/tool-lane"
import { budget } from "../../src/session/execution"

describe("ToolLane", () => {
  test("lets one track run two tools, and holds the third", async () => {
    ToolLane.reset()
    await ToolLane.acquire("track-a")
    await ToolLane.acquire("track-a")
    let entered = false
    const third = ToolLane.acquire("track-a").then(() => {
      entered = true
    })
    await Promise.resolve()
    expect(entered).toBe(false)
    ToolLane.release("track-a")
    await third
    expect(entered).toBe(true)
    ToolLane.release("track-a")
    ToolLane.release("track-a")
    ToolLane.reset()
  })

  test("stops at eight tools across tracks", async () => {
    ToolLane.reset()
    const ids = ["a", "b", "c", "d"]
    await Promise.all(ids.flatMap((id) => [ToolLane.acquire(id), ToolLane.acquire(id)]))
    let entered = false
    const extra = ToolLane.acquire("e").then(() => {
      entered = true
    })
    await Promise.resolve()
    expect(entered).toBe(false)
    expect(budget.toolsGlobal).toBe(8)
    ToolLane.release("a")
    await extra
    expect(entered).toBe(true)
    ids.forEach((id) => {
      ToolLane.release(id)
      ToolLane.release(id)
    })
    ToolLane.release("e")
    ToolLane.reset()
  })
})
