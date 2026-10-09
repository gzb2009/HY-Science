import { createSignal } from "solid-js"

const [imc, setImc] = createSignal(false)

/** Shell facts that slot views may read. The shell writes; plugins do not import each other. */
export const shellHost = {
  imc,
  setImc,
}
