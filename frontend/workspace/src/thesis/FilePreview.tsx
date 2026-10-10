import {
  createSignal,
  createResource,
  createEffect,
  createMemo,
  onMount,
  onCleanup,
  type JSX,
  Show,
  For,
  Suspense,
  Switch,
  Match,
} from "solid-js"
import { Markdown } from "@hysci/ui/markdown"
import { useSDK } from "@/context/sdk"
import { useSync } from "@/context/sync"
import { usePlatform } from "@/context/platform"
import { FONT_MONO, FONT_SANS, FONT_CODE } from "@/styles/tokens"
import { PdfViewer } from "@/science/renderers/documents/PdfViewer"
import { OfficePreview, type OfficePreviewData } from "@/thesis/OfficePreview"
import { toast } from "@/thesis/Toast"
import { IconFile, IconX, IconCopy, IconDownload, IconBookOpen, IconBraces, IconRefresh } from "@/thesis/shared/Icon"

/**
 * Slide-in SIDE PREVIEW pane for opening a file from the Files tree.
 *
 * A file's extension picks the renderer:
 *   .md / .markdown  → formatted markdown (@hysci/ui Markdown)
 *   .pdf             → PdfViewer (pdfjs page rasterizer)
 *   .tex / .latex    → highlighted LaTeX source (a .tex is a source FILE, not a
 *                      math expression — the KaTeX LatexView is reserved for
 *                      kind:"latex" math ARTIFACTS with a single math string)
 *   images           → inline <img>
 *   everything else  → syntax-aware code/text view (with edit + save)
 *
 * It mounts as a right-anchored drawer over the session so md / pdf / latex
 * get room to breathe instead of the cramped 360px pane. Esc / backdrop
 * click / the header × all close it.
 */

const ext = (name: string): string => {
  const i = name.lastIndexOf(".")
  return i > 0 ? name.slice(i + 1).toLowerCase() : ""
}

// Extension → shiki/highlight.js language id for the code fallback.
const LANG: Record<string, string> = {
  py: "python",
  ts: "typescript",
  tsx: "tsx",
  js: "javascript",
  jsx: "jsx",
  mjs: "javascript",
  cjs: "javascript",
  json: "json",
  jsonl: "json",
  yaml: "yaml",
  yml: "yaml",
  toml: "toml",
  ini: "ini",
  cfg: "ini",
  sh: "bash",
  bash: "bash",
  zsh: "bash",
  rs: "rust",
  go: "go",
  swift: "swift",
  java: "java",
  kt: "kotlin",
  rb: "ruby",
  php: "php",
  c: "c",
  h: "c",
  cpp: "cpp",
  cc: "cpp",
  hpp: "cpp",
  cu: "cpp",
  // .tex and friends are text/source files — highlight them as LaTeX source
  // (shiki has a `latex` grammar). A full \documentclass document must never
  // be fed to KaTeX (which only typesets a single math string → blank page).
  tex: "latex",
  latex: "latex",
  sty: "latex",
  cls: "latex",
  bib: "latex",
  css: "css",
  scss: "scss",
  html: "html",
  xml: "xml",
  svg: "xml",
  sql: "sql",
  r: "r",
  jl: "julia",
  lua: "lua",
  dockerfile: "docker",
  makefile: "makefile",
  csv: "csv",
  txt: "text",
  log: "text",
}

const TEXT_EXT = new Set([
  "py",
  "pyi",
  "pyx",
  "ipynb",
  "ts",
  "tsx",
  "js",
  "jsx",
  "mjs",
  "cjs",
  "json",
  "jsonl",
  "md",
  "mdx",
  "markdown",
  "csv",
  "tsv",
  "txt",
  "log",
  "text",
  "r",
  "rmd",
  "yaml",
  "yml",
  "toml",
  "ini",
  "cfg",
  "sh",
  "bash",
  "zsh",
  "css",
  "scss",
  "html",
  "xml",
  "sql",
  "tex",
  "latex",
  "sty",
  "cls",
  "bib",
  "c",
  "h",
  "cpp",
  "cc",
  "hpp",
  "rs",
  "go",
  "java",
  "kt",
  "rb",
  "php",
  "lua",
  "jl",
])

function decodeBase64(value: string) {
  const bytes = Uint8Array.from(atob(value), (char) => char.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

type Kind = "markdown" | "pdf" | "image" | "code" | "binary" | "office" | "sheet"

type FileData = { content?: string; encoding?: string; mimeType?: string; preview?: OfficePreviewData }

/**
 * Inline file view — header (icon + name + subtitle + controls) over the
 * type-aware renderer body. This is the single source of truth for the
 * renderer dispatch; the center document tab and inset results pane mount it,
 * so file rendering is not duplicated and no overlay is required.
 */
export function FileView(props: {
  path: string
  directory?: string
  subtitle?: string
  onClose?: () => void
}): JSX.Element {
  const sdk = useSDK()
  const sync = useSync()
  const platform = usePlatform()
  const directory = () => props.directory || sync.project?.worktree || sync.data.path.directory || sdk.directory
  const name = () => props.path.split("/").pop() || props.path
  const e = () => ext(name())

  // `showSource` flips rendered docs (md / tex) to their raw text; for code
  // files it flips the read-only highlighted view into an editable textarea.
  const [showSource, setShowSource] = createSignal(false)
  const [draft, setDraft] = createSignal("")
  const [savedText, setSavedText] = createSignal("")
  const [zoom, setZoom] = createSignal(1)
  const [saving, setSaving] = createSignal(false)
  const [refreshKey, setRefreshKey] = createSignal(0)

  const [file] = createResource(
    () => [directory(), props.path, refreshKey()] as const,
    async ([dir, path]) => {
      if (!dir || !path) return undefined
      // Pass the params FLAT — the generated client maps `directory`/`path`
      // into the query string; a `{ query: {...} }` wrapper is dropped and
      // sends nothing. `directory` re-roots the backend Instance so any host
      // file is readable by absolute directory + relative path (File.read).
      const res: any = await sdk.client.file.read({ directory: dir, path })
      return (res?.data ?? res) as FileData
    },
  )

  const data = () => {
    if (file.error) return
    return file()
  }
  const isBinary = () => data()?.encoding === "base64" && !TEXT_EXT.has(e())
  const mime = () => data()?.mimeType ?? ""
  const b64 = () => data()?.content ?? ""
  const dataUrl = () => `data:${mime() || "application/octet-stream"};base64,${b64()}`
  const text = () => {
    if (!data()) return ""
    if (data()?.encoding !== "base64") return data()!.content ?? ""
    if (!TEXT_EXT.has(e())) return ""
    return decodeBase64(data()!.content ?? "")
  }
  const dirty = () => draft() !== savedText()

  const kind = createMemo<Kind>(() => {
    const x = e()
    if (["xlsx", "xls", "xlsm", "docx", "pptx"].includes(x)) return "office"
    if (isBinary()) {
      if (mime().startsWith("image/") || ["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg"].includes(x)) return "image"
      if (mime() === "application/pdf" || x === "pdf") return "pdf"
      return "binary"
    }
    if (x === "md" || x === "markdown" || x === "mdx") return "markdown"
    if (x === "pdf") return "pdf"
    if (x === "csv" || x === "tsv") return "sheet"
    // .tex / .latex / .sty / .cls are source files → highlighted "code" view
    // (LANG maps them to the shiki `latex` grammar). They are NEVER routed to
    // KaTeX, which blanks on a full \documentclass document.
    return "code"
  })

  const badge = () => {
    const k = kind()
    if (k === "code") return LANG[e()] ?? e() ?? "text"
    return k
  }

  createEffect(() => {
    if (file.loading) return
    const next = text()
    setDraft(next)
    setSavedText(next)
  })

  createEffect(() => {
    props.path
    setZoom(1)
    setShowSource(false)
  })

  const save = async () => {
    if (saving() || isBinary() || !dirty()) return
    setSaving(true)
    try {
      // The generated SDK has no file.write; hit the real PUT /file/content
      // route directly. `directory` re-roots the backend Instance, `path` is
      // relative to it (see server middleware + File.write).
      const url = `${sdk.url.replace(/\/$/, "")}/file/content?directory=${encodeURIComponent(directory())}`
      const doFetch = platform.fetch ?? fetch
      const res = await doFetch(url, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: props.path, content: draft() }),
      })
      if (!res.ok) throw new Error(`save failed (${res.status})`)
      const d: any = await res.json().catch(() => ({}))
      const next = typeof d?.content === "string" ? d.content : draft()
      setDraft(next)
      setSavedText(next)
      toast.success("saved", name())
    } catch (err: any) {
      toast.error("save failed", err?.message ?? String(err))
    } finally {
      setSaving(false)
    }
  }

  const copy = async () => {
    try {
      await navigator.clipboard?.writeText(isBinary() ? dataUrl() : draft())
      toast.success("copied", name())
    } catch {}
  }

  const toggleable = () => kind() === "markdown" || kind() === "code" || kind() === "sheet"
  const framed = () => kind() === "sheet" || kind() === "code" || (kind() === "markdown" && showSource())

  return (
    <Suspense
      fallback={
        <div
          style={{
            flex: 1,
            display: "grid",
            "place-items": "center",
            background: "var(--color-surface-solid)",
            "font-family": FONT_MONO,
            "font-size": "0.786rem",
            color: "var(--color-text-faint)",
          }}
        >
          loading preview…
        </div>
      }
    >
      <div
        style={{
          flex: 1,
          "min-height": 0,
          "min-width": 0,
          display: "flex",
          "flex-direction": "column",
          background: "var(--color-surface-solid)",
          overflow: "hidden",
        }}
      >
        {/* header */}
        <div
          style={{
            display: "flex",
            "align-items": "center",
            gap: "10px",
            padding: "10px 12px 10px 16px",
            "border-bottom": "1px solid var(--color-border)",
            background: "var(--color-bg)",
            "flex-shrink": 0,
          }}
        >
          <IconFile size={14} strokeWidth={1.5} />
          <div style={{ flex: 1, "min-width": 0, display: "flex", "flex-direction": "column", gap: "1px" }}>
            <span
              title={props.path}
              style={{
                "font-family": FONT_CODE,
                "font-size": "0.857rem",
                color: "var(--color-text)",
                overflow: "hidden",
                "text-overflow": "ellipsis",
                "white-space": "nowrap",
              }}
            >
              {name()}
            </span>
            <Show when={props.subtitle}>
              <span
                title={props.subtitle}
                style={{
                  "font-family": FONT_MONO,
                  "font-size": "0.714rem",
                  color: "var(--color-text-faint)",
                  overflow: "hidden",
                  "text-overflow": "ellipsis",
                  "white-space": "nowrap",
                }}
              >
                {props.subtitle}
              </span>
            </Show>
          </div>
          <span
            style={{
              "flex-shrink": 0,
              padding: "2px 8px",
              "border-radius": "4px",
              border: "1px solid var(--color-border)",
              background: "var(--color-bg-subtle)",
              "font-family": FONT_MONO,
              "font-size": "0.714rem",
              color: "var(--color-text-faint)",
              "letter-spacing": "0.03em",
            }}
          >
            {badge()}
          </span>

          <Show when={dirty()}>
            <button type="button" onClick={() => setDraft(savedText())} style={ctlBtn()}>
              reset
            </button>
            <button type="button" onClick={() => void save()} style={ctlBtn(true)}>
              {saving() ? "saving…" : "save"}
            </button>
          </Show>

          <Show when={toggleable()}>
            <button
              type="button"
              onClick={() => setShowSource((v) => !v)}
              title={
                kind() === "sheet"
                  ? showSource()
                    ? "表格"
                    : "原文"
                  : showSource()
                    ? "rendered view"
                    : kind() === "code"
                      ? "edit source"
                      : "raw source"
              }
              style={iconBtn(showSource())}
            >
              <Show when={showSource()} fallback={<IconBraces size={13} strokeWidth={1.6} />}>
                <IconBookOpen size={13} strokeWidth={1.6} />
              </Show>
            </button>
          </Show>

          <Show when={!isBinary()}>
            <button type="button" onClick={() => void copy()} title="copy contents" style={iconBtn()}>
              <IconCopy size={13} strokeWidth={1.6} />
            </button>
          </Show>
          <Show when={isBinary()}>
            <a href={dataUrl()} download={name()} title="download" style={{ ...iconBtn(), "text-decoration": "none" }}>
              <IconDownload size={13} strokeWidth={1.6} />
            </a>
          </Show>
          <Show when={kind() === "image"}>
            <button
              type="button"
              onClick={() => setZoom((value) => (value === 1 ? 2 : 1))}
              title={zoom() === 1 ? "zoom in" : "reset zoom"}
              style={iconBtn(zoom() !== 1)}
            >
              {zoom() === 1 ? "+" : "1:1"}
            </button>
          </Show>

          <button type="button" onClick={() => setRefreshKey((k) => k + 1)} title="refresh" style={iconBtn()}>
            <IconRefresh size={13} strokeWidth={1.6} />
          </button>

          <Show when={props.onClose}>
            <button type="button" onClick={() => props.onClose!()} title="close" style={iconBtn()}>
              <IconX size={14} strokeWidth={1.7} />
            </button>
          </Show>
        </div>

        {/* body */}
        <Show
          when={!file.loading}
          fallback={
            <div
              style={{
                padding: "20px",
                "font-family": FONT_MONO,
                "font-size": "0.857rem",
                color: "var(--color-text-faint)",
              }}
            >
              loading…
            </div>
          }
        >
          <Show
            when={!file.error}
            fallback={
              <div
                style={{
                  flex: 1,
                  "min-height": 0,
                  display: "flex",
                  "flex-direction": "column",
                  "align-items": "center",
                  "justify-content": "center",
                  gap: "10px",
                  padding: "40px 24px",
                  "text-align": "center",
                  background: "var(--color-bg-subtle)",
                }}
              >
                <IconFile size={20} strokeWidth={1.4} />
                <div
                  style={{
                    "font-family": FONT_SANS,
                    "font-size": "0.929rem",
                    "font-weight": 500,
                    color: "var(--color-text)",
                  }}
                >
                  couldn't open this file
                </div>
                <div
                  style={{
                    "font-family": FONT_SANS,
                    "font-size": "0.857rem",
                    color: "var(--color-text-faint)",
                    "line-height": 1.5,
                    "max-width": "340px",
                  }}
                >
                  {file.error instanceof Error ? file.error.message : String(file.error)}
                </div>
                <button type="button" onClick={() => setRefreshKey((k) => k + 1)} style={retryBtn()}>
                  retry
                </button>
              </div>
            }
          >
            <div
              class="thesis-scroll"
              style={{
                flex: 1,
                "min-height": 0,
                "min-width": 0,
                display: "flex",
                "flex-direction": "column",
                overflow: framed() ? "hidden" : "auto",
                background: "var(--color-bg-subtle)",
              }}
            >
              <Switch>
                <Match when={kind() === "markdown" && !showSource()}>
                  <div style={{ padding: "22px 26px", width: "100%", "box-sizing": "border-box" }}>
                    <Markdown class="thesis-md" text={draft()} />
                  </div>
                </Match>

                <Match when={kind() === "pdf"}>
                  <div style={{ padding: "14px" }}>
                    <PdfViewer kind="pdf" data={{ base64: b64(), maxPages: 40 }} height={100000} />
                  </div>
                </Match>

                <Match when={kind() === "image"}>
                  <div
                    style={{
                      display: "grid",
                      "place-items": "center",
                      padding: "22px",
                      "min-height": "100%",
                      overflow: zoom() === 1 ? "hidden" : "auto",
                    }}
                  >
                    <img
                      src={dataUrl()}
                      alt={name()}
                      onClick={() => setZoom((value) => (value === 1 ? 2 : 1))}
                      style={{
                        width: zoom() === 1 ? "auto" : `${zoom() * 100}%`,
                        "max-width": zoom() === 1 ? "100%" : "none",
                        "max-height": zoom() === 1 ? "100%" : "none",
                        "object-fit": "contain",
                        "border-radius": "4px",
                        cursor: zoom() === 1 ? "zoom-in" : "zoom-out",
                      }}
                    />
                  </div>
                </Match>

                <Match when={kind() === "office"}>
                  <div class="hy-office-page">
                    <OfficePreview preview={data()?.preview} />
                  </div>
                </Match>

                <Match when={kind() === "binary"}>
                  <div
                    style={{
                      display: "grid",
                      "place-items": "center",
                      padding: "40px 24px",
                      "min-height": "100%",
                      "text-align": "center",
                    }}
                  >
                    <div
                      style={{
                        "font-family": FONT_SANS,
                        "font-size": "0.929rem",
                        color: "var(--color-text-muted)",
                        "line-height": 1.6,
                      }}
                    >
                      Binary file — no inline preview.
                      <br />
                      Use the download button above to open it.
                    </div>
                  </div>
                </Match>

                <Match when={(kind() === "code" || kind() === "sheet") && showSource()}>
                  <textarea
                    value={draft()}
                    spellcheck={false}
                    onInput={(ev) => setDraft(ev.currentTarget.value)}
                    class="hy-source-edit thesis-scroll"
                  />
                </Match>

                <Match when={kind() === "sheet"}>
                  <SheetView text={draft()} name={name()} />
                </Match>

                <Match when={kind() === "code" || (kind() === "markdown" && showSource())}>
                  <SourceView text={shownText(name(), draft())} />
                </Match>
              </Switch>
            </div>
          </Show>
        </Show>
      </div>
    </Suspense>
  )
}

const ROW = 32

function isNumeric(value: string) {
  const t = value.trim()
  if (!t) return false
  return /^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(t)
}

function splitCells(line: string, sep: string) {
  const out: string[] = []
  let cur = ""
  let quoted = false
  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    if (char === '"') {
      if (quoted && line[i + 1] === '"') {
        cur += '"'
        i++
        continue
      }
      quoted = !quoted
      continue
    }
    if (char === sep && !quoted) {
      out.push(cur)
      cur = ""
      continue
    }
    cur += char
  }
  out.push(cur)
  return out
}

function parseSheet(text: string, name: string) {
  const sep = ext(name) === "tsv" ? "\t" : ","
  const lines = text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
  if (!lines.length) return { cols: [] as { name: string; num: boolean }[], rows: [] as string[][] }
  const rows = lines.slice(1).map((line) => splitCells(line, sep))
  const head = splitCells(lines[0], sep)
  const cols = head.map((label, index) => {
    const sample = rows
      .slice(0, 24)
      .map((row) => (row[index] ?? "").trim())
      .filter(Boolean)
    return { name: label.trim() || `列 ${index + 1}`, num: sample.length > 0 && sample.every(isNumeric) }
  })
  return { cols, rows }
}

function shownText(name: string, text: string) {
  if (!name.toLowerCase().endsWith(".json")) return text
  try {
    return JSON.stringify(JSON.parse(text), null, 2)
  } catch {
    return text
  }
}

function SourceView(props: { text: string }) {
  const lines = createMemo(() => {
    const raw = props.text.replace(/\r\n/g, "\n")
    const parts = raw.endsWith("\n") ? raw.slice(0, -1).split("\n") : raw.split("\n")
    return parts.length ? parts : [""]
  })
  return (
    <div class="hy-source thesis-scroll">
      <For each={lines()}>
        {(line, index) => (
          <div class="hy-source-line">
            <span class="hy-source-no">{index() + 1}</span>
            <code>{line.length ? line : " "}</code>
          </div>
        )}
      </For>
    </div>
  )
}

function SheetView(props: { text: string; name: string }) {
  const sheet = createMemo(() => parseSheet(props.text, props.name))
  const tracks = () => `52px repeat(${Math.max(sheet().cols.length, 1)}, minmax(132px, 180px))`
  const [top, setTop] = createSignal(0)
  const [view, setView] = createSignal(480)
  let node: HTMLDivElement | undefined

  const measure = () => {
    if (!node) return
    setView(node.clientHeight)
  }

  onMount(() => {
    measure()
    const watch = new ResizeObserver(measure)
    if (node) watch.observe(node)
    onCleanup(() => watch.disconnect())
  })

  createEffect(() => {
    props.name
    setTop(0)
    if (node) node.scrollTop = 0
  })

  const start = createMemo(() => Math.max(0, Math.floor((top() - 34) / ROW) - 8))
  const slice = createMemo(() => sheet().rows.slice(start(), start() + Math.ceil(view() / ROW) + 14))

  return (
    <div class="hy-sheet">
      <div
        class="hy-sheet-scroll thesis-scroll"
        ref={(el) => (node = el)}
        onScroll={(event) => setTop(event.currentTarget.scrollTop)}
      >
        <div class="hy-sheet-head" style={{ "grid-template-columns": tracks() }}>
          <span class="hy-sheet-gutter hy-sheet-corner" />
          <For each={sheet().cols}>
            {(col) => (
              <span class="hy-sheet-h" data-num={col.num ? "true" : undefined} title={col.name}>
                {col.name}
              </span>
            )}
          </For>
        </div>
        <Show
          when={sheet().rows.length > 0}
          fallback={<div class="hy-sheet-empty">{sheet().cols.length ? "没有数据行" : "空表"}</div>}
        >
          <div class="hy-sheet-space" style={{ height: `${sheet().rows.length * ROW}px` }}>
            <For each={slice()}>
              {(row, index) => {
                const at = () => start() + index()
                return (
                  <div
                    class="hy-sheet-row"
                    data-alt={at() % 2 ? "true" : undefined}
                    style={{ top: `${at() * ROW}px`, height: `${ROW}px`, "grid-template-columns": tracks() }}
                  >
                    <span class="hy-sheet-gutter">{at() + 1}</span>
                    <For each={sheet().cols}>
                      {(col, ci) => (
                        <span class="hy-sheet-cell" data-num={col.num ? "true" : undefined} title={row[ci()] ?? ""}>
                          {row[ci()] ?? ""}
                        </span>
                      )}
                    </For>
                  </div>
                )
              }}
            </For>
          </div>
        </Show>
      </div>
      <div class="hy-sheet-status">
        {sheet().rows.length.toLocaleString()} 行 · {sheet().cols.length} 列
      </div>
    </div>
  )
}

function iconBtn(active = false): JSX.CSSProperties {
  return {
    all: "unset",
    cursor: "pointer",
    display: "inline-flex",
    "align-items": "center",
    "justify-content": "center",
    width: "28px",
    height: "28px",
    "border-radius": "4px",
    color: active ? "var(--color-text)" : "var(--color-text-faint)",
    background: active ? "var(--color-accent-subtle)" : "transparent",
    "flex-shrink": 0,
    transition: "background 120ms ease, color 120ms ease",
  } as JSX.CSSProperties
}

function retryBtn(): JSX.CSSProperties {
  return {
    all: "unset",
    cursor: "pointer",
    "margin-top": "2px",
    padding: "5px 12px",
    "border-radius": "4px",
    border: "1px solid var(--color-border)",
    "font-family": FONT_MONO,
    "font-size": "0.786rem",
    color: "var(--color-text)",
  } as JSX.CSSProperties
}

function ctlBtn(primary = false): JSX.CSSProperties {
  return {
    all: "unset",
    cursor: "pointer",
    display: "inline-flex",
    "align-items": "center",
    padding: "5px 11px",
    "border-radius": "4px",
    border: primary ? "1px solid var(--color-text)" : "1px solid var(--color-border)",
    background: primary ? "var(--color-text)" : "var(--color-bg-subtle)",
    color: primary ? "var(--color-bg)" : "var(--color-text-muted)",
    "font-family": FONT_MONO,
    "font-size": "0.786rem",
    "font-weight": primary ? 600 : 500,
    "flex-shrink": 0,
  } as JSX.CSSProperties
}
