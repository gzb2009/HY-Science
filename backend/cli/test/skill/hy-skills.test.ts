import { describe, expect, test } from "bun:test"
import path from "path"
import { readdir } from "fs/promises"
import { laneOf, type Lane } from "../../src/skill/lanes"
import { SHARED_SKILLS, themeAllows } from "@hysci/util/themes"

const root = path.resolve(import.meta.dir, "../..")
const skills = path.join(root, "skills")

const banned = [
  "Yuan1z",
  "K-Dense",
  "claude-scientific-skills",
  "always_load",
  "nature-writing",
  "nature-downloader",
  "nature-paper-trans",
  "Nature Statistics Reporting",
  "figures4papers",
]

const expectLane: Record<string, Lane> = {}

async function hyFiles() {
  const out: { name: string; file: string; body: string }[] = []
  const walk = async (dir: string) => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      const full = path.join(dir, entry.name)
      const file = path.join(full, "SKILL.md")
      if (entry.name.startsWith("HY_") && (await Bun.file(file).exists())) {
        out.push({ name: entry.name, file, body: await Bun.file(file).text() })
      }
      await walk(full)
    }
  }
  await walk(skills)
  return out
}

describe("HY_ skills", () => {
  test("every imported skill is renamed, original, and on its lane", async () => {
    const found = await hyFiles()
    const names = found.map((item) => item.name).sort()
    expect(names).toEqual(Object.keys(expectLane).sort())
    for (const item of found) {
      const name = item.body.match(/^name:\s*(.+)$/m)?.[1]?.trim()
      expect(name, item.file).toBe(item.name)
      expect(item.name.startsWith("HY_"), item.name).toBe(true)
      for (const phrase of banned) expect(item.body, `${item.name} still has ${phrase}`).not.toContain(phrase)
      if (!item.name.startsWith("HY_lane-") && item.name !== "HY_manuscript-shared") {
        expect(item.body, item.name).toContain("## When to load")
        expect(item.body, item.name).toContain("## Steps")
        expect(item.body, item.name).toContain("## Stop")
      }
      expect(laneOf({ name: item.name, location: item.file }), item.name).toBe(expectLane[item.name])
    }
  })

  test("upstream copies are gone and the gate uses HY_ names", async () => {
    const gone = [
      "manuscript/nature-writing",
      "manuscript/nature-downloader",
      "biology/bulk-rnaseq",
      "biology/qiime2-amplicon",
      "coding/experimental-design",
      "databases/pyzotero",
      "lanes/lane-assay",
    ]
    for (const rel of gone) expect(await Bun.file(path.join(skills, rel, "SKILL.md")).exists()).toBe(false)
    for (const name of Object.keys(expectLane)) {
      expect(SHARED_SKILLS.includes(name as (typeof SHARED_SKILLS)[number]) || name.startsWith("HY_"), name).toBe(true)
    }
    expect(themeAllows("imc", "scientific-writing")).toBe(true)
    expect(themeAllows("single-cell", "scanpy")).toBe(true)
    expect(themeAllows("genomics", "pysam")).toBe(true)
    expect(themeAllows("imc", "pysam")).toBe(false)
    expect(themeAllows("imc", "nature-writing")).toBe(false)
  })
})
