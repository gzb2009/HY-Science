import { createMemo, createSignal, onCleanup, onMount, Show, For, type JSX } from "solid-js"
import { useParams } from "@solidjs/router"
import { useSDK } from "@/context/sdk"
import { useSync } from "@/context/sync"
import { useLanguage } from "@/context/language"
import { toast } from "@/thesis/Toast"
import {
  fillRatio,
  formatSlice,
  measureContext,
  usageBand,
  type ContextSliceId,
  type ContextUsage,
} from "./context-meter"
import "./context-meter.css"

const ORDER: ContextSliceId[] = ["system", "skill", "message"]

function Track(props: { usage: ContextUsage; size?: "full" }) {
  const ratio = () => fillRatio(props.usage)
  const share = (tokens: number) => (props.usage.used <= 0 || tokens <= 0 ? 0 : (tokens / props.usage.used) * 100)
  return (
    <span class="cs-context-track" data-size={props.size} data-band={usageBand(props.usage.percent)} aria-hidden="true">
      <span
        class="cs-context-fill"
        data-live={props.usage.used > 0 ? "true" : "false"}
        data-band={usageBand(props.usage.percent)}
        style={{ "--fill": `${ratio() * 100}%` }}
      >
        <For each={props.usage.slices}>
          {(slice) => <span class="cs-context-slice" data-id={slice.id} style={{ width: `${share(slice.tokens)}%` }} />}
        </For>
      </span>
    </span>
  )
}

export function ContextMeter(props: { providerID?: string; modelID?: string; limit: number }): JSX.Element {
  const params = useParams()
  const sdk = useSDK()
  const sync = useSync()
  const language = useLanguage()
  const [open, setOpen] = createSignal(false)
  const [busy, setBusy] = createSignal(false)
  let root: HTMLDivElement | undefined

  onMount(() => {
    const close = (event: MouseEvent) => {
      if (!open()) return
      const target = event.target
      if (target instanceof Node && root?.contains(target)) return
      setOpen(false)
    }
    document.addEventListener("mousedown", close)
    onCleanup(() => document.removeEventListener("mousedown", close))
  })

  const usage = createMemo(() => {
    const sid = params.id
    const msgs = sid && sid !== "new" ? (sync.data.message[sid] ?? []) : []
    let input = 0
    let output = 0
    let reasoning = 0
    let messageChars = 0
    let skillChars = 0
    const skills = new Set<string>()
    for (let i = msgs.length - 1; i >= 0; i--) {
      const msg = msgs[i]
      if (msg?.role !== "assistant" || !("tokens" in msg)) continue
      input = msg.tokens.input
      output = msg.tokens.output
      reasoning = msg.tokens.reasoning
      break
    }
    for (const msg of msgs) {
      for (const part of sync.data.part[msg.id] ?? []) {
        if (part.type === "text" || part.type === "reasoning") {
          messageChars += "text" in part ? String(part.text ?? "").length : 0
          continue
        }
        if (part.type !== "tool" || !("tool" in part) || !("state" in part)) continue
        const state = part.state
        const out = state.status === "completed" ? state.output.length : 0
        const body = out + JSON.stringify(state.input ?? "").length
        if (part.tool === "skill") {
          skillChars += body
          const name = state.input.name
          skills.add(typeof name === "string" && name ? name : part.callID)
          continue
        }
        messageChars += body
      }
    }
    return measureContext({
      limit: props.limit,
      input,
      output,
      reasoning,
      messageChars,
      skillChars,
      skillCount: skills.size,
    })
  })

  const working = () => {
    const sid = params.id
    if (!sid || sid === "new") return false
    const status = sync.data.session_status?.[sid] as { type?: string } | undefined
    return !!status && status.type !== "idle"
  }

  const label = (id: ContextSliceId) => {
    if (id === "skill") {
      const count = usage().skillCount
      return count > 0
        ? language.t("context.window.skill.count", { count: String(count) })
        : language.t("context.window.skill")
    }
    if (id === "message") return language.t("context.window.message")
    return language.t("context.window.system")
  }

  const percent = () => {
    const row = usage()
    if (row.limit <= 0) return "—"
    return `${row.percent}%`
  }

  const compress = async () => {
    const sid = params.id
    if (!sid || sid === "new" || !props.providerID || !props.modelID || busy() || working() || usage().used <= 0) return
    setBusy(true)
    const res = await sdk.client.session
      .summarize({
        sessionID: sid,
        providerID: props.providerID,
        modelID: props.modelID,
        auto: false,
      })
      .catch((err: { message?: string }) => {
        toast.error(language.t("context.window.failed"), err?.message ?? "")
        return undefined
      })
    setBusy(false)
    if (!res) return
    if (res.error) {
      toast.error(language.t("context.window.failed"), String(res.error))
      return
    }
    setOpen(false)
  }

  return (
    <div class="cs-context-meter" ref={root}>
      <button
        type="button"
        class="cs-context-meter-btn"
        data-open={open() ? "true" : "false"}
        aria-expanded={open()}
        aria-label={language.t("context.window")}
        onClick={() => setOpen((value) => !value)}
      >
        <Track usage={usage()} />
        <span>{percent()}</span>
      </button>
      <Show when={open()}>
        <div class="cs-context-panel" role="dialog" aria-label={language.t("context.window")}>
          <div class="cs-context-head">
            <span class="cs-context-title">{language.t("context.window")}</span>
            <span class="cs-context-pct">{percent()}</span>
          </div>
          <p class="cs-context-hint">{language.t("context.window.hint")}</p>
          <Track usage={usage()} size="full" />
          <div class="cs-context-rows">
            <For each={ORDER}>
              {(id) => {
                const slice = () => usage().slices.find((item) => item.id === id)
                return (
                  <div class="cs-context-row">
                    <span class="cs-context-name">
                      <span class="cs-context-dot" data-id={id} />
                      {label(id)}
                    </span>
                    <span class="cs-context-pct">{formatSlice(slice()?.tokens ?? 0, usage().limit)}</span>
                  </div>
                )
              }}
            </For>
          </div>
          <button
            type="button"
            class="cs-context-compress"
            disabled={busy() || working() || usage().used <= 0 || !props.providerID || !props.modelID}
            onClick={() => void compress()}
          >
            {busy() ? language.t("context.window.compressing") : language.t("context.window.compress")}
          </button>
        </div>
      </Show>
    </div>
  )
}
