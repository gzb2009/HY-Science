import { createContext, useContext } from "solid-js"

const ComposerSlotContext = createContext<{ insert: (text: string, recipe?: string) => void }>({
  insert: () => undefined,
})

export const ComposerSlotProvider = ComposerSlotContext.Provider

export function useComposerSlot() {
  return useContext(ComposerSlotContext)
}
