import path from "path"
import { Instance } from "../project/instance"
import { Provenance } from "../science/provenance/store"
import { RecipeCatalog } from "./load"
import { RecipeUpgrade } from "./upgrade"
import type { Param, Recipe } from "./schema"

export type Status = "ok" | "needs_input" | "needs_expert"

export type RecipeResult = {
  status: Status
  recipe: string
  run?: string
  params?: Record<string, unknown>
  outputs?: string[]
  counts?: Record<string, number>
  log?: string
  error?: string
}

const FLAG: Record<string, string> = {
  input_dir: "--input-dir",
  panel: "--panel",
  output_dir: "--output-dir",
  input: "--input",
  segmenter: "--segmenter",
  nucleus_channel: "--nucleus-channel",
  min_area: "--min-area",
  min_intensity_pct: "--min-intensity-pct",
  max_area_factor: "--max-area-factor",
  qc_method: "--qc-method",
  n_pcs: "--n-pcs",
  n_clusters: "--n-clusters",
  k: "--k",
  n_niches: "--n-niches",
  preprocess: "--preprocess",
  method: "--method",
  n_mes: "--n-mes",
  group_var: "--group-var",
}

export namespace RecipeRun {
  export function whitelist(recipe: Recipe, raw: Record<string, unknown>) {
    const out: Record<string, unknown> = {}
    for (const [key, spec] of Object.entries(recipe.params)) {
      if (raw[key] === undefined) {
        if (spec.required && spec.default === undefined) {
          throw Object.assign(new Error(`missing param: ${key}`), { status: "needs_input" as const })
        }
        if (spec.default !== undefined) out[key] = spec.default
        continue
      }
      out[key] = coerce(key, spec, raw[key])
    }
    for (const key of Object.keys(raw)) {
      if (!recipe.params[key]) throw new Error(`unknown param: ${key}`)
    }
    return out
  }

  export async function execute(input: {
    recipe: string
    params?: Record<string, unknown>
    sessionID?: string
    model?: string
  }): Promise<RecipeResult> {
    const recipe = await RecipeCatalog.get(input.recipe)
    if (!recipe) return { status: "needs_expert", recipe: input.recipe, error: "unknown recipe" }
    if (recipe.maturity !== "ready" || !recipe.script) {
      return fail(input.sessionID, recipe.id, {}, [], "expert_only recipe")
    }

    const checked = checkParams(recipe, input.params ?? {})
    if (checked.error) {
      if (checked.status === "needs_input") {
        return { status: "needs_input", recipe: recipe.id, error: checked.error }
      }
      return fail(input.sessionID, recipe.id, {}, [], checked.error)
    }

    const resolved = resolveParams(recipe, checked.params)
    if ("error" in resolved) {
      return { status: "needs_expert", recipe: recipe.id, error: resolved.error, params: checked.params }
    }

    const missing = await missingInputs(recipe, resolved.paths, resolved.params)
    if (missing) return { status: "needs_input", recipe: recipe.id, params: resolved.params, error: missing }

    const script = await RecipeCatalog.resolveScript(recipe)
    if (!script) return fail(input.sessionID, recipe.id, resolved.params, [], "script missing")

    const argv = buildArgv(script, recipe, resolved.params)
    const id = `imc_${Date.now().toString(36)}_${crypto.randomUUID().slice(0, 8)}`
    const dir = path.join(Instance.worktree, ".hyscience", "runs", "imc")
    const log = path.join(dir, `${id}.log`)
    const started = Date.now()
    const spawn = await launch(argv, recipe.timeout_ms, Instance.worktree)
    await Bun.write(log, spawn.text)
    const outputs = await existingOutputs(recipe, resolved.params)
    const counts = await tally(resolved.params)
    const record = {
      id,
      recipe: recipe.id,
      version: "1.0.0",
      script,
      hash: await digest(script),
      params: resolved.params,
      model: input.model,
      outputs,
      status: spawn.code === 0 ? "ok" : "error",
      code: spawn.code,
      log,
      ms: Date.now() - started,
    }
    await Bun.write(path.join(dir, `${id}.json`), JSON.stringify(record, null, 2))
    await Provenance.record({
      kind: "run",
      label: recipe.title,
      meta: {
        tool: "imc_recipe",
        recipe: recipe.id,
        run: id,
        log,
        sessionID: input.sessionID,
        inputs: resolved.params,
        status: spawn.code === 0 ? "ok" : "error",
      },
    })

    if (spawn.code !== 0) {
      const status = spawn.code === 2 ? "needs_input" : "needs_expert"
      if (status === "needs_input") {
        return { status, recipe: recipe.id, run: id, params: resolved.params, outputs, log, error: tail(spawn.text) }
      }
      return fail(input.sessionID, recipe.id, resolved.params, outputs, tail(spawn.text), id, log)
    }

    return {
      status: "ok",
      recipe: recipe.id,
      run: id,
      params: resolved.params,
      outputs,
      counts,
      log,
    }
  }
}

function checkParams(recipe: Recipe, raw: Record<string, unknown>) {
  try {
    return { params: RecipeRun.whitelist(recipe, raw) }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const status = (error as { status?: Status }).status ?? "needs_expert"
    return { error: message, status, params: {} as Record<string, unknown> }
  }
}

function coerce(key: string, spec: Param, value: unknown) {
  if (spec.kind === "boolean") {
    if (typeof value === "boolean") return value
    throw new Error(`invalid boolean: ${key}`)
  }
  if (spec.kind === "number") {
    const num = typeof value === "number" ? value : Number(value)
    if (!Number.isFinite(num)) throw new Error(`invalid number: ${key}`)
    return num
  }
  if (typeof value !== "string") throw new Error(`invalid string: ${key}`)
  if (spec.kind === "enum") {
    if (!spec.choices?.includes(value)) throw new Error(`invalid enum: ${key}`)
    return value
  }
  return value
}

function resolveParams(recipe: Recipe, params: Record<string, unknown>) {
  const out: Record<string, unknown> = { ...params }
  const paths: string[] = []
  try {
    for (const [key, spec] of Object.entries(recipe.params)) {
      if (spec.kind !== "path" || out[key] === undefined) continue
      const resolved = RecipeCatalog.resolveUserPath(String(out[key]))
      out[key] = resolved
      paths.push(resolved)
    }
    return { params: out, paths }
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error), status: "needs_expert" as const }
  }
}

async function missingInputs(recipe: Recipe, paths: string[], params: Record<string, unknown>) {
  for (const [key, spec] of Object.entries(recipe.params)) {
    if (spec.kind !== "path" || !spec.required) continue
    const target = String(params[key] ?? "")
    if (!(await exists(target))) return `missing ${key}: ${params[key]}`
  }
  const output = String(params.output_dir ?? "")
  for (const name of recipe.requires) {
    const target = path.join(output, name)
    if (!(await exists(target))) return `missing checkpoint: ${name}`
  }
  return undefined
}

function buildArgv(script: string, recipe: Recipe, params: Record<string, unknown>) {
  const argv = [script]
  if (recipe.step) argv.push("--step", recipe.step)
  if (recipe.skill === "imc-analysis") argv.push("--non-interactive")
  for (const [key, value] of Object.entries(params)) {
    const flag = FLAG[key]
    if (!flag) continue
    if (typeof value === "boolean") {
      if (value) argv.push(flag)
      continue
    }
    argv.push(flag, String(value))
  }
  return argv
}

async function launch(argv: string[], timeout: number, cwd: string) {
  const bin = await python()
  const proc = Bun.spawn([bin, ...argv], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
    signal: AbortSignal.timeout(timeout),
  })
  const stdout = await new Response(proc.stdout).text()
  const stderr = await new Response(proc.stderr).text()
  const code = await proc.exited
  return { code, text: `${stdout}\n${stderr}`.trim() }
}

async function python() {
  for (const bin of ["python3", "python"]) {
    const proc = Bun.spawn([bin, "--version"], { stdout: "pipe", stderr: "pipe" })
    if ((await proc.exited) === 0) return bin
  }
  throw new Error("python not found")
}

async function existingOutputs(recipe: Recipe, params: Record<string, unknown>) {
  const output = String(params.output_dir ?? "")
  const found: string[] = []
  for (const name of recipe.produces) {
    const target = path.join(output, name)
    if (await exists(target)) found.push(rel(target))
  }
  return found
}

async function tally(params: Record<string, unknown>) {
  const output = String(params.output_dir ?? "")
  const cells = path.join(output, "cells_full.csv")
  const qc = path.join(output, "cells_qc.csv")
  const segment = path.join(output, "cells_segment.csv")
  const file = (await exists(cells)) ? cells : (await exists(qc)) ? qc : (await exists(segment)) ? segment : undefined
  if (!file) return undefined
  const text = await Bun.file(file).text()
  const rows = text.trim().split("\n").length - 1
  return { cells: Math.max(0, rows) }
}

async function digest(file: string) {
  const bytes = await Bun.file(file).arrayBuffer()
  const hash = await crypto.subtle.digest("SHA-256", bytes)
  return [...new Uint8Array(hash)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 16)
}

async function exists(file: string) {
  return Bun.file(file).exists()
}

function rel(file: string) {
  return path.relative(Instance.worktree, file) || file
}

function tail(text: string) {
  const lines = text.split("\n").filter(Boolean)
  return lines.slice(-8).join("\n").slice(0, 800)
}

function fail(
  sessionID: string | undefined,
  recipe: string,
  params: Record<string, unknown>,
  outputs: string[],
  error: string,
  run?: string,
  log?: string,
): RecipeResult {
  if (sessionID) RecipeUpgrade.mark(sessionID, { recipe, params, outputs, error })
  return { status: "needs_expert", recipe, run, params, outputs, log, error }
}
