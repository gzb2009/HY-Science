import { describe, expect, test } from "bun:test"
import { Specialty } from "../../src/session/specialty"

describe("Specialty", () => {
  test("does not decide a literature comparison", () => {
    const hit = Specialty.judge({ text: "IMC 和单细胞有什么区别", filenames: [] })
    expect(hit.discuss).toBe(true)
    expect(hit.domain).toBeUndefined()
    expect(Specialty.slide({ domain: "biology", direction: "imc" }, hit)).toBe(false)
  })

  test("follows a clear single-cell request even when memory is IMC", () => {
    const hit = Specialty.judge({ text: "分析这个单细胞数据", filenames: ["cells.h5ad"] })
    expect(hit.domain).toBe("biology")
    expect(hit.direction).toBe("single-cell")
    expect(hit.ambiguous).toBeUndefined()
  })

  test("treats an explicit training request as ml", () => {
    const hit = Specialty.judge({ text: "训练一个模型", filenames: [] })
    expect(hit.domain).toBe("ml")
    expect(hit.direction).toBe("training")
  })

  test("asks once when two biology directions are named", () => {
    const hit = Specialty.judge({ text: "单细胞和空间转录组都分析一下", filenames: [] })
    expect(hit.domain).toBe("biology")
    expect(hit.ambiguous).toBe("direction")
    expect(hit.candidates).toContain("single-cell")
    expect(hit.candidates).toContain("spatial")
  })

  test("stops a later execution that leaves the decision already made", () => {
    const session = "ses_specialty"
    Specialty.clear(session)
    Specialty.remember(session, { domain: "biology", direction: "imc" })
    const next = Specialty.judge({ text: "跑一下全基因组变异检测", filenames: ["cohort.vcf"] })
    expect(Specialty.slide(Specialty.recall(session), next)).toBe(true)
    expect(Specialty.take(session, next)).toBe(false)
    Specialty.pend(session, { domain: "biology", direction: "genomics" })
    expect(Specialty.take(session, Specialty.judge({ text: "基因组", filenames: [] }))).toBe(true)
    Specialty.clear(session)
  })
})
