import { describe, expect, test } from "bun:test"
import { registerSlot, resetSlots, setSlotGate, slotEntries, slotOpen } from "./slots"

describe("shell slots", () => {
  test("lists a slot in order and hides gated entries until opened", () => {
    resetSlots()
    registerSlot({
      id: "b",
      slot: "inspector",
      order: 2,
      component: () => null as never,
    })
    registerSlot({
      id: "a",
      slot: "inspector",
      order: 1,
      component: () => null as never,
    })
    registerSlot({
      id: "agents",
      slot: "inspector",
      order: 3,
      gated: true,
      component: () => null as never,
    })
    registerSlot({ id: "a", slot: "inspector", order: 9, component: () => null as never })
    expect(slotEntries("inspector").map((entry) => entry.id)).toEqual(["a", "b"])
    setSlotGate("agents", true)
    expect(slotEntries("inspector").map((entry) => entry.id)).toEqual(["a", "b", "agents"])
    expect(slotOpen(slotEntries("center")[0] ?? { id: "x", slot: "center", order: 0, component: () => null as never })).toBe(
      true,
    )
  })
})
