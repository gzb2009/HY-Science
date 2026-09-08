import path from "path"
import { Skill } from "../skill/skill"
import { Instance } from "../project/instance"
import { Manifest, Recipe } from "./schema"

const BUNDLED: Record<string, string> = {
  "imc-analysis": path.join(import.meta.dir, "../../skills/biology/imc-analysis"),
  "pcf-analysis": path.join(import.meta.dir, "../../skills/biology/pcf-analysis"),
}

export namespace RecipeCatalog {
  export function parse(raw: unknown) {
    return Manifest.parse(raw)
  }

  export async function all() {
    const seen = new Set<string>()
    const recipes: Recipe[] = []
    const files = new Set<string>()
    for (const root of Object.values(BUNDLED)) files.add(path.join(root, "recipe.json"))
    for (const skill of await Skill.all()) files.add(path.join(path.dirname(skill.location), "recipe.json"))
    for (const file of files) {
      const text = await Bun.file(file)
        .text()
        .catch(() => undefined)
      if (!text) continue
      const parsed = Manifest.safeParse(JSON.parse(text))
      if (!parsed.success) throw new Error(`invalid recipe manifest: ${file}`)
      for (const recipe of parsed.data.recipes) {
        if (seen.has(recipe.id)) continue
        seen.add(recipe.id)
        recipes.push(recipe)
      }
    }
    return recipes
  }

  export async function get(id: string) {
    const recipes = await all()
    return recipes.find((recipe) => recipe.id === id)
  }

  export async function resolveScript(recipe: Recipe) {
    if (!recipe.script) return undefined
    const root = await skillRoot(recipe.skill)
    if (!root) throw new Error(`skill not installed: ${recipe.skill}`)
    const resolved = path.resolve(root, recipe.script)
    if (!inside(root, resolved)) throw new Error(`script escapes skill: ${recipe.script}`)
    if (!(await Bun.file(resolved).exists())) throw new Error(`script missing: ${resolved}`)
    return resolved
  }

  export function resolveUserPath(input: string) {
    const resolved = path.isAbsolute(input) ? path.resolve(input) : path.resolve(Instance.worktree, input)
    if (!Instance.containsPath(resolved)) throw new Error(`path outside project: ${input}`)
    return resolved
  }
}

async function skillRoot(name: string) {
  const skill = await Skill.get(name)
  if (skill) return path.dirname(skill.location)
  const bundled = BUNDLED[name]
  if (bundled && (await Bun.file(path.join(bundled, "SKILL.md")).exists())) return bundled
  return undefined
}

function inside(root: string, target: string) {
  const rel = path.relative(root, target)
  return rel !== "" && !rel.startsWith("..") && !path.isAbsolute(rel)
}
