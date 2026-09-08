import { Instance } from "../project/instance"

export type Compact = {
  recipe: string
  params: Record<string, unknown>
  outputs: string[]
  error: string
}

export namespace RecipeUpgrade {
  const state = Instance.state(() => ({}) as Record<string, { used: boolean; pending?: Compact }>)

  export function mark(sessionID: string, pack: Compact) {
    const slot = state()[sessionID] ?? { used: false }
    if (slot.used) return false
    slot.pending = pack
    state()[sessionID] = slot
    return true
  }

  export function consume(sessionID: string) {
    const slot = state()[sessionID]
    if (!slot?.pending || slot.used) return undefined
    const pack = slot.pending
    slot.pending = undefined
    slot.used = true
    state()[sessionID] = slot
    return pack
  }

  export function used(sessionID: string) {
    return state()[sessionID]?.used === true
  }

  export function render(pack: Compact) {
    return [
      "<imc-recipe-upgrade />",
      "A mature IMC recipe failed and needs the default model once.",
      `recipe: ${pack.recipe}`,
      `params: ${JSON.stringify(pack.params)}`,
      `outputs: ${pack.outputs.join(", ") || "(none)"}`,
      `error: ${pack.error}`,
      "Do not reload the full skill or repository. Diagnose from this package only.",
    ].join("\n")
  }
}
