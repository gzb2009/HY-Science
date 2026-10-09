export const LANES = ["assay", "evidence", "design", "manuscript", "compute"] as const

export type Lane = (typeof LANES)[number] | "hold"

const NAME: Record<string, Lane> = {
  "literature-review": "evidence",
  "research-lookup": "evidence",
  "pubmed-database": "evidence",
  "biorxiv-database": "evidence",
  "openalex-database": "evidence",
  "HY_paper-lookup": "evidence",
  HY_zotero: "evidence",
  "HY_evidence-search": "evidence",
  "HY_evidence-pipeline": "evidence",
  "HY_evidence-reader": "evidence",
  "HY_evidence-xray": "evidence",
  "HY_evidence-card": "evidence",
  "HY_evidence-refs": "evidence",
  "HY_design-stats": "design",
  "scientific-writing": "manuscript",
  "citation-management": "manuscript",
  "scientific-slides": "manuscript",
  "peer-review": "manuscript",
  "hypothesis-generation": "design",
  "scientific-brainstorming": "design",
  "scientific-critical-thinking": "design",
  "grill-me": "design",
  "statistical-analysis": "design",
  "exploratory-data-analysis": "design",
  "HY_experimental-design": "design",
  "HY_statistical-power": "design",
}

const DIR: Record<string, Lane> = {
  biology: "assay",
  chemistry: "assay",
  physics: "assay",
  databases: "evidence",
  research: "evidence",
  writing: "manuscript",
  manuscript: "manuscript",
  coding: "compute",
  visualization: "compute",
  "data-engineering": "compute",
  "ml-training": "hold",
  "ml-inference": "hold",
  "llm-tools": "hold",
  "cloud-compute": "hold",
  quantum: "hold",
  other: "hold",
  design: "hold",
}

export function laneOf(input: { name: string; location?: string }): Lane {
  const bare = input.name.startsWith("HY_") ? input.name.slice("HY_".length) : input.name
  if (bare.startsWith("lane-")) {
    const lane = bare.slice("lane-".length)
    if (LANES.includes(lane as (typeof LANES)[number])) return lane as Lane
  }
  const named = NAME[input.name]
  if (named) return named
  const parts = (input.location ?? "").split("/")
  const at = parts.lastIndexOf("skills")
  const dir = at >= 0 ? parts[at + 1] : ""
  return DIR[dir] ?? "hold"
}
