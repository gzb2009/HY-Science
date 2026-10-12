import PHYSICS_EXPERIMENT from "../agent/prompt/physics-profiles/experiment.txt"
import PHYSICS_SIMULATION from "../agent/prompt/physics-profiles/simulation.txt"
import PHYSICS_THEORY from "../agent/prompt/physics-profiles/theory.txt"
import ML_EVALUATION from "../agent/prompt/ml-profiles/evaluation.txt"
import ML_INFERENCE from "../agent/prompt/ml-profiles/inference.txt"
import ML_TRAINING from "../agent/prompt/ml-profiles/training.txt"
import { BiologyProfile, type BiologyProfile as BiologySubdomain } from "./biology-profile"
import { DomainScope } from "./domain-scope"
import type { Project } from "../project/project"
import { BIOLOGY_THEMES } from "@hysci/util/themes"

export const SUBDOMAINS = {
  biology: BIOLOGY_THEMES,
  physics: ["simulation", "theory", "experiment"],
  ml: ["training", "evaluation", "inference"],
  general: [],
} as const

const FRAGMENTS = {
  physics: {
    simulation: PHYSICS_SIMULATION,
    theory: PHYSICS_THEORY,
    experiment: PHYSICS_EXPERIMENT,
  },
  ml: {
    training: ML_TRAINING,
    evaluation: ML_EVALUATION,
    inference: ML_INFERENCE,
  },
}

export namespace TaskProfile {
  export function agent(_research: Project.Research | undefined) {
    return "research"
  }

  export function pack(research: Project.Research | undefined, domain?: string) {
    const name = domain ?? research?.domain
    if (name === "biology" || name === "physics" || name === "ml") return name
    return undefined
  }

  export function packFile(name: "biology" | "physics" | "ml") {
    if (name === "biology") return "biology-core-v2.txt"
    if (name === "physics") return "physics.txt"
    return "ml.txt"
  }

  export function fragment(
    research: Project.Research | undefined,
    input: { text: string; filenames: string[] },
    decided?: { domain?: string; direction?: string },
  ) {
    const domain = decided?.domain ?? research?.domain
    if (!domain || domain === "general") return undefined
    if (domain === "biology") {
      const detected = BiologyProfile.detect(input)
      const profile = decided?.direction ?? detected ?? research?.subdomain
      if (!profile || !SUBDOMAINS.biology.includes(profile as BiologySubdomain)) return undefined
      return BiologyProfile.fragment(profile as BiologySubdomain)
    }

    if (domain !== "physics" && domain !== "ml") return undefined
    const profiles = FRAGMENTS[domain]
    const sub = decided?.direction ?? research?.subdomain
    if (!sub || !(sub in profiles)) return undefined
    return profiles[sub as keyof typeof profiles]
  }

  export function context(research: Project.Research | undefined) {
    if (!research) return undefined
    const lock = DomainScope.lock(research.subdomain)
    if (lock) {
      const notes = research.notes?.trim()
      return notes ? `${lock}\n${notes}` : lock
    }
    const lines = [
      `<project-research domain="${research.domain}"${research.subdomain ? ` subdomain="${research.subdomain}"` : ""}>`,
      "Earlier work in this project used this configuration as memory. A clear request for something else takes priority.",
      research.notes?.trim(),
      "</project-research>",
    ].filter(Boolean)
    return lines.join("\n")
  }
}
