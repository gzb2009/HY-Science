import { createEffect, createMemo, createSignal, Show, type JSX } from "solid-js"
import { useParams } from "@solidjs/router"
import { useSync } from "@/context/sync"
import { useLanguage } from "@/context/language"
import { uiStore } from "@/thesis/store/ui"
import { setSlotGate } from "@/shell/slots"
import { floatShare } from "@/thesis/float-doc"
import { DocsPane } from "@/thesis/RightPane/DocsPane"

export function RightPane(props: { sessionID?: string }): JSX.Element {
  const params = useParams()
  const sync = useSync()
  const language = useLanguage()
  const sessionID = () => props.sessionID ?? params.id
  const hasAgents = createMemo(() => {
    const id = sessionID()
    if (!id) return false
    const nested = (parentID: string | undefined): boolean => {
      if (!parentID) return false
      if (parentID === id) return true
      return nested(sync.data.session.find((row) => row.id === parentID)?.parentID)
    }
    return sync.data.session.some((item) => nested(item.parentID))
  })

  createEffect(() => {
    setSlotGate("agents", hasAgents())
  })

  createEffect(() => {
    if (uiStore.rightPaneTab() === "agents" && !hasAgents()) uiStore.setRightPaneTab("now")
  })

  const [share, setShare] = createSignal(0.5)

  createEffect(() => {
    const id = sessionID() ?? ""
    const todos = id ? (sync.data.todo[id] ?? []) : []
    if (!todos.length || !id) return
    const key = `cs-plan-seen:${id}`
    if (sessionStorage.getItem(key)) return
    sessionStorage.setItem(key, "1")
    uiStore.setRightPaneTab("plan")
    uiStore.setRightPaneOpen(true)
  })

  function drag(event: PointerEvent) {
    event.preventDefault()
    const move = (next: PointerEvent) => setShare(floatShare(next.clientX, window.innerWidth))
    const up = () => {
      window.removeEventListener("pointermove", move)
      window.removeEventListener("pointerup", up)
    }
    window.addEventListener("pointermove", move)
    window.addEventListener("pointerup", up)
  }

  return (
    <Show when={uiStore.rightPaneOpen()}>
      <aside
        class="cs-float-doc"
        style={{ width: `calc(${share() * 100}vw - 24px)` }}
        aria-label={language.t("rightpane.label")}
      >
        <div class="cs-float-doc-grip" onPointerDown={drag} />
        <DocsPane sessionID={sessionID()} onCollapse={() => uiStore.setRightPaneOpen(false)} />
      </aside>
    </Show>
  )
}

