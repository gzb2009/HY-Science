import { createEffect, createMemo, createResource, For, Match, Show, Switch, type JSX } from "solid-js"
import { useSDK } from "@/context/sdk"
import { useSync } from "@/context/sync"
import { useLanguage } from "@/context/language"
import { Markdown } from "@hysci/ui/markdown"
import { customerFacingResultFiles, collectResultFiles } from "@hysci/ui/session-result"
import type { AssistantMessage } from "@hysci/sdk/v2/client"
import { uiStore } from "@/thesis/store/ui"
import { OfficePreview, type OfficePreviewData } from "@/thesis/OfficePreview"
import { PdfViewer } from "@/science/renderers/documents/PdfViewer"
import { slotEntries } from "@/shell/slots"
import { chooseDoc, floatDocs, planMark } from "@/thesis/float-doc"
import { firstUserMessageText, getSessionDisplayTitle } from "@/utils/sessionDisplayTitle"
import { IconChevronLeft } from "@/thesis/shared/Icon"

type FileKind = "docx" | "md" | "pdf" | "pptx" | "code"

type Doc =
  | { id: "plan"; kind: "plan" }
  | { id: string; kind: FileKind; path: string; name: string }

type FilePayload = {
  content?: string
  encoding?: string
  preview?: OfficePreviewData
}

export function DocsPane(props: { sessionID?: string; onCollapse: () => void }): JSX.Element {
  const sync = useSync()
  const language = useLanguage()

  createEffect(() => {
    const id = props.sessionID
    if (!id) return
    void sync.session.todo(id)
  })

  const todos = createMemo(() => {
    const id = props.sessionID
    if (!id) return []
    return sync.data.todo[id] ?? []
  })

  const docs = createMemo((): Doc[] => {
    const id = props.sessionID
    const messages = id ? (sync.data.message[id] ?? []) : []
    const files = customerFacingResultFiles(
      collectResultFiles({
        assistantMessages: messages.filter((message) => message.role === "assistant") as AssistantMessage[],
        partsByMessage: sync.data.part,
        responseText: "",
      }),
    )
    return floatDocs(files, todos().length) as Doc[]
  })

  const chosen = createMemo(() => chooseDoc(docs(), uiStore.rightPaneTab()))

  const reading = () => {
    const tab = uiStore.rightPaneTab()
    return tab !== "evidence" && tab !== "run" && tab !== "agents"
  }

  const title = createMemo(() => {
    const id = props.sessionID
    const fallback = language.t("rightpane.doc.plan")
    if (!id) return fallback
    const row = sync.data.session.find((item) => item.id === id)
    if (!row) return fallback
    return getSessionDisplayTitle(row, sync.data.message[id], sync.data.part, fallback)
  })

  const subtitle = createMemo(() => {
    const id = props.sessionID
    if (!id) return ""
    const text = firstUserMessageText(sync.data.message[id], sync.data.part)
    const line = text.split("\n").find((item) => item.trim())?.trim() ?? ""
    return line.length > 96 ? `${line.slice(0, 96)}…` : line
  })

  const pill = () => {
    const doc = chosen()
    if (doc && doc.kind !== "plan") return stem(doc.name)
    return planMark(todos().map((step) => step.status)) ?? "plan"
  }

  return (
    <div class="cs-docs">
      <header class="cs-docs-bar cs-docs-bar-doc">
        <button type="button" aria-label={language.t("rightpane.collapse")} onClick={() => props.onCollapse()}>
          <IconChevronLeft size={16} strokeWidth={1.6} />
        </button>
        <span class="cs-plan-pill">{pill()}</span>
      </header>
      <div class="cs-docs-body">
        <Show when={reading()} fallback={<ToolBody sessionID={props.sessionID} />}>
          <Show when={chosen()} fallback={<p class="cs-docs-empty">{language.t("rightpane.doc.empty")}</p>}>
            {(doc) => (
              <DocPaper doc={doc()} steps={todos()} title={title()} subtitle={subtitle()} />
            )}
          </Show>
        </Show>
      </div>
    </div>
  )
}

function DocPaper(props: {
  doc: Doc
  steps: { content: string; status: string }[]
  title: string
  subtitle: string
}): JSX.Element {
  const sdk = useSDK()
  const file = () => {
    const doc = props.doc
    if (doc.kind === "plan") return
    return doc
  }
  return (
    <article class="cs-docs-paper" data-kind={props.doc.kind}>
      <Show when={props.doc.kind === "code" ? file() : undefined}>
        {(item) => (
          <div class="cs-plan-doc">
            <h1 class="cs-plan-title">{stem(item().name)}</h1>
          </div>
        )}
      </Show>
      <Show
        when={props.doc.kind === "plan"}
        fallback={
          <Show when={file()} keyed>
            {(item) => <DocFile directory={sdk.directory} path={item.path} kind={item.kind} />}
          </Show>
        }
      >
        <div class="cs-plan-doc">
          <h1 class="cs-plan-title">{props.title}</h1>
          <Show when={props.subtitle}>
            <p class="cs-plan-sub">{props.subtitle}</p>
          </Show>
          <ol class="cs-docs-plan">
            <For each={props.steps}>
              {(step) => (
                <li class="cs-docs-step" data-status={step.status}>
                  <span class="cs-docs-mark" aria-hidden="true" />
                  <span>{step.content}</span>
                </li>
              )}
            </For>
          </ol>
        </div>
      </Show>
    </article>
  )
}

function ToolBody(props: { sessionID?: string }): JSX.Element {
  const entry = createMemo(() => slotEntries("inspector").find((item) => item.id === uiStore.rightPaneTab()))
  return (
    <Show when={entry()}>
      {(item) => {
        const View = item().component
        return <View sessionID={props.sessionID} />
      }}
    </Show>
  )
}

function DocFile(props: { directory: string; path: string; kind: FileKind }): JSX.Element {
  const sdk = useSDK()
  const language = useLanguage()
  const [data] = createResource(
    () => [props.directory, props.path] as const,
    async ([directory, path]) => {
      const res = await sdk.client.file.read({ directory, path })
      if (res && typeof res === "object" && "data" in res) return (res as { data?: FilePayload }).data
      return res as FilePayload
    },
  )
  const payload = () => {
    if (data.error) return
    return data()
  }
  return (
    <Show when={!data.loading} fallback={<p class="cs-docs-empty">{language.t("rightpane.doc.loading")}</p>}>
      <Show when={!data.error} fallback={<p class="cs-docs-empty">{language.t("rightpane.doc.missing")}</p>}>
      <Switch>
        <Match when={props.kind === "md"}>
          <div class="cs-docs-read">
            <Markdown text={fileText(payload())} />
          </div>
        </Match>
        <Match when={props.kind === "code"}>
          <Notebook name={props.path} text={fileText(payload())} />
        </Match>
        <Match when={props.kind === "pdf" && payload()?.encoding === "base64" && payload()?.content}>
          <PdfViewer kind="pdf" data={{ base64: payload()?.content }} />
        </Match>
        <Match when={props.kind === "docx" || props.kind === "pptx"}>
          <OfficePreview preview={payload()?.preview} />
        </Match>
      </Switch>
      </Show>
    </Show>
  )
}

function fileText(data?: FilePayload) {
  const content = data?.content ?? ""
  if (data?.encoding !== "base64" || !content) return content
  const bytes = Uint8Array.from(atob(content), (ch) => ch.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

function Notebook(props: { name: string; text: string }): JSX.Element {
  const lang = () => {
    const name = props.name.toLowerCase()
    if (name.endsWith(".py")) return "python"
    if (name.endsWith(".r")) return "r"
    if (name.endsWith(".sh")) return "bash"
    return "code"
  }
  const lines = () => props.text.replace(/\n$/, "").split("\n")
  return (
    <div class="cs-nb">
      <div class="cs-nb-meta">
        <span>1</span>
        <span>{lang()}</span>
      </div>
      <pre class="cs-nb-code">
        <For each={lines()}>
          {(line, i) => (
            <div>
              <span>{i() + 1}</span>
              <code>{line || " "}</code>
            </div>
          )}
        </For>
      </pre>
    </div>
  )
}

function stem(name: string) {
  const base = name.split("/").pop() ?? name
  const dot = base.lastIndexOf(".")
  if (dot <= 0) return base
  return base.slice(0, dot)
}


