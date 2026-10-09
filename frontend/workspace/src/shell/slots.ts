import { createSignal, type JSX } from "solid-js"
import type { ResultFile } from "@hysci/ui/session-result"

export type SlotName = "message" | "center" | "inspector" | "composer.extra"

export type CenterSlotProps = {
  projectRoot: string
  taskFileNames: Set<string>
  recentTurnFileNames: Set<string>
  taskResultFiles: ResultFile[]
  recentResultFiles: ResultFile[]
}

export type SlotProps = Partial<CenterSlotProps> & {
  sessionID?: string
}

export type SlotEntry = {
  id: string
  slot: SlotName
  order: number
  labelKey?: string
  icon?: (props: { size?: number; strokeWidth?: number }) => JSX.Element
  /** Hidden until `setSlotGate(id, true)`. */
  gated?: boolean
  component: (props: SlotProps) => JSX.Element
}

const [entries, setEntries] = createSignal<SlotEntry[]>([])
const [gate, setGate] = createSignal<Record<string, boolean>>({})
const seen = new Set<string>()

export function registerSlot(entry: SlotEntry) {
  if (seen.has(entry.id)) return
  seen.add(entry.id)
  setEntries((prev) => [...prev, entry].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id)))
}

export function setSlotGate(id: string, open: boolean) {
  setGate((prev) => {
    if (prev[id] === open) return prev
    return { ...prev, [id]: open }
  })
}

export function slotOpen(entry: SlotEntry) {
  if (!entry.gated) return true
  return gate()[entry.id] === true
}

export function slotEntries(slot: SlotName) {
  return entries().filter((entry) => entry.slot === slot && slotOpen(entry))
}

export function resetSlots() {
  seen.clear()
  setEntries([])
  setGate({})
}
