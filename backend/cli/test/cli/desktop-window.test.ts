import { test, expect } from "bun:test"
import { chromeAppBinary } from "../../src/util/desktop-window"

test("chromeAppBinary is a path or undefined", () => {
  const bin = chromeAppBinary()
  if (bin) expect(bin.length).toBeGreaterThan(2)
})
