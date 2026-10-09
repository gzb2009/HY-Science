import { createEffect, createMemo, createSignal, For, onCleanup, Show, type JSX } from "solid-js"
import { useParams } from "@solidjs/router"
import { IMC_STEPS } from "@/domain/imc-flow"
import { useLanguage } from "@/context/language"
import { useSync } from "@/context/sync"
import { IconChevronDown } from "@/thesis/shared/Icon"
import { shellHost } from "./host"
import { useComposerSlot } from "./composer-slot"
import { centerTabs } from "@/thesis/store/centerTabs"

export function ImcDock(): JSX.Element {
  const language = useLanguage()
  const composer = useComposerSlot()
  const params = useParams()
  const sync = useSync()
  const recipeStatus = createMemo(() => {
    if (!params.id) return undefined
    const users = (sync.data.message[params.id] ?? []).filter((item) => item.role === "user")
    const last = users.at(-1)
    if (last?.agent === "recipe-executor") return "local" as const
    const prev = users.at(-2)
    if (last?.agent === "research" && prev?.agent === "recipe-executor") return "upgrade" as const
    return undefined
  })
  const [open, setOpen] = createSignal(false)
  let root: HTMLDivElement | undefined
  createEffect(() => {
    if (centerTabs.active() === "chat" && shellHost.imc()) return
    setOpen(false)
  })
  createEffect(() => {
    if (!open()) return
    const close = (event: MouseEvent) => {
      if (root && !root.contains(event.target as Node)) setOpen(false)
    }
    const onEsc = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false)
    }
    document.addEventListener("mousedown", close)
    document.addEventListener("keydown", onEsc)
    onCleanup(() => {
      document.removeEventListener("mousedown", close)
      document.removeEventListener("keydown", onEsc)
    })
  })
  return (
    <Show when={shellHost.imc()}>
      <div class="cs-imc-flow-dock" ref={root}>
        <button
          type="button"
          class="cs-imc-flow-trigger"
          aria-expanded={open()}
          aria-haspopup="menu"
          onClick={() => setOpen((value) => !value)}
        >
          {language.t("chat.welcome.imc.flow.title")}
          <IconChevronDown size={11} strokeWidth={1.6} />
        </button>
        <Show when={recipeStatus()}>
          <span class="cs-imc-flow-status">
            {recipeStatus() === "local"
              ? language.t("chat.welcome.imc.flow.local")
              : language.t("chat.welcome.imc.flow.upgrade")}
          </span>
        </Show>
        <Show when={open()}>
          <div class="cs-imc-flow-pop" role="menu">
            <div class="cs-chat-welcome-flow-grid">
              <For each={IMC_STEPS}>
                {(step, index) => {
                  const Glyph = step[3]
                  return (
                    <button
                      type="button"
                      class="cs-chat-welcome-flow-card"
                      role="menuitem"
                      onClick={() => {
                        composer.insert(language.t(step[2]), step[4])
                        setOpen(false)
                      }}
                    >
                      <span class="cs-chat-welcome-flow-mark">
                        <Glyph size={16} strokeWidth={1.6} />
                        <span class="cs-chat-welcome-flow-num">{String(index() + 1).padStart(2, "0")}</span>
                      </span>
                      <span class="cs-chat-welcome-flow-name">{language.t(step[0])}</span>
                      <span class="cs-chat-welcome-flow-hint">{language.t(step[1])}</span>
                    </button>
                  )
                }}
              </For>
            </div>
          </div>
        </Show>
      </div>
    </Show>
  )
}
