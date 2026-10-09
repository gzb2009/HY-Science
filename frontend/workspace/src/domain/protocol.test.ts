import { describe, expect, test } from "bun:test"
import { protocolResearch } from "./protocol"

describe("protocolResearch", () => {
  test("locks a specialist protocol and clears the lock for general", () => {
    expect(protocolResearch("imc", " keep ")).toEqual({
      domain: "biology",
      subdomain: "imc",
      notes: "keep",
    })
    expect(protocolResearch("general")).toEqual({
      domain: "general",
      subdomain: undefined,
      notes: undefined,
    })
  })
})
