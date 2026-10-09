import { toResearch, type DomainId } from "./registry"

/** Research fields stored on the project. `general` clears the subdomain so nothing is locked. */
export function protocolResearch(id: DomainId, notes?: string) {
  return {
    ...toResearch(id),
    notes: notes?.trim() || undefined,
  }
}
