import { budget } from "./execution"

type Gate = { active: number; queue: Array<() => void> }

const gates = new Map<string, Gate>()
const globalQueue: Array<() => void> = []
let globalActive = 0

function gate(id: string) {
  const found = gates.get(id)
  if (found) return found
  const created: Gate = { active: 0, queue: [] }
  gates.set(id, created)
  return created
}

export namespace ToolLane {
  export function acquire(sessionID: string) {
    const local = gate(sessionID)
    if (local.active < budget.toolsPerTrack && globalActive < budget.toolsGlobal) {
      local.active += 1
      globalActive += 1
      return Promise.resolve()
    }
    return new Promise<void>((resolve) => {
      const start = () => {
        local.active += 1
        globalActive += 1
        resolve()
      }
      if (local.active >= budget.toolsPerTrack) {
        local.queue.push(start)
        return
      }
      globalQueue.push(start)
    })
  }

  export function release(sessionID: string) {
    const local = gate(sessionID)
    local.active = Math.max(0, local.active - 1)
    globalActive = Math.max(0, globalActive - 1)
    const localNext = local.queue.shift()
    if (localNext && globalActive < budget.toolsGlobal) {
      localNext()
      return
    }
    if (localNext) local.queue.unshift(localNext)
    const globalNext = globalQueue.shift()
    if (globalNext) globalNext()
  }

  export function reset() {
    gates.clear()
    globalQueue.splice(0, globalQueue.length)
    globalActive = 0
  }
}
