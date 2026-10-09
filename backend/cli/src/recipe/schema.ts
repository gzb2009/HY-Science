import z from "zod"

export const Param = z.object({
  kind: z.enum(["string", "number", "boolean", "enum", "path"]),
  required: z.boolean().optional(),
  default: z.union([z.string(), z.number(), z.boolean()]).optional(),
  choices: z.array(z.string()).optional(),
})
export type Param = z.infer<typeof Param>

export const Recipe = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  maturity: z.enum(["ready", "expert_only"]),
  skill: z.string().min(1),
  script: z.string(),
  step: z.string().optional(),
  params: z.record(z.string(), Param).default({}),
  requires: z.array(z.string()).default([]),
  produces: z.array(z.string()).default([]),
  timeout_ms: z.number().int().positive().default(600_000),
  keywords: z.array(z.string()).default([]),
  upgrade: z.array(z.string()).default([]),
})
export type Recipe = z.infer<typeof Recipe>

export const Manifest = z.object({
  version: z.string(),
  recipes: z.array(Recipe).min(1),
})
export type Manifest = z.infer<typeof Manifest>
