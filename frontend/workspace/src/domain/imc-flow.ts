import { IconCells, IconChart, IconGraph, IconMatrix, IconScatter, IconSigma } from "@/thesis/shared/Icon"

export const IMC_STEPS = [
  ["chat.welcome.imc.flow.s1", "chat.welcome.imc.flow.h1", "chat.welcome.imc.flow.p1", IconMatrix, "imc.convert"],
  ["chat.welcome.imc.flow.s2", "chat.welcome.imc.flow.h2", "chat.welcome.imc.flow.p2", IconCells, "imc.segment"],
  ["chat.welcome.imc.flow.s3", "chat.welcome.imc.flow.h3", "chat.welcome.imc.flow.p3", IconSigma, "imc.qc"],
  ["chat.welcome.imc.flow.s4", "chat.welcome.imc.flow.h4", "chat.welcome.imc.flow.p4", IconScatter, "imc.cluster"],
  ["chat.welcome.imc.flow.s5", "chat.welcome.imc.flow.h5", "chat.welcome.imc.flow.p5", IconGraph, "imc.neighborhood"],
  ["chat.welcome.imc.flow.s6", "chat.welcome.imc.flow.h6", "chat.welcome.imc.flow.p6", IconChart, "imc.region"],
] as const

export function recipeMark(id: string) {
  return `<imc-recipe id="${id}" />`
}
