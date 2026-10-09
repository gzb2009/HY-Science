import { ErrorBoundary, For, Show, type JSX } from "solid-js"
import { FileExplorer } from "@/thesis/FileExplorer"
import { FileView } from "@/thesis/FilePreview"
import { centerTabs } from "@/thesis/store/centerTabs"
import { IconFile } from "@/thesis/shared/Icon"
import { FONT_MONO, FONT_SANS } from "@/styles/tokens"
import { formatHostFilePath } from "@/utils/projectWorkspace"
import type { ResultFile } from "@hysci/ui/session-result"
import type { SlotProps } from "./slots"

const emptyNames = new Set<string>()
const emptyFiles: ResultFile[] = []

export function FilesCenter(props: SlotProps): JSX.Element {
  return (
    <>
      <Show when={centerTabs.filesOpen() && centerTabs.active() === "files"}>
        <div style={{ display: "flex", flex: 1, "min-height": 0, "flex-direction": "column" }}>
          <ErrorBoundary fallback={(err) => <FilesError error={err} />}>
            <FileExplorer
              projectRoot={props.projectRoot ?? ""}
              taskFileNames={props.taskFileNames ?? emptyNames}
              recentTurnFileNames={props.recentTurnFileNames ?? emptyNames}
              taskResultFiles={props.taskResultFiles ?? emptyFiles}
              recentResultFiles={props.recentResultFiles ?? emptyFiles}
            />
          </ErrorBoundary>
        </div>
      </Show>
      <For each={centerTabs.docs()}>
        {(doc) => (
          <div
            style={{
              display: centerTabs.active() === doc.id ? "flex" : "none",
              flex: 1,
              "min-height": 0,
              "flex-direction": "column",
            }}
          >
            <FileView
              path={doc.path}
              directory={doc.directory}
              subtitle={`This computer · ${formatHostFilePath(doc.directory, doc.path)}`}
              onClose={() => centerTabs.closeDoc(doc.id)}
            />
          </div>
        )}
      </For>
    </>
  )
}

function FilesError(props: { error: unknown }): JSX.Element {
  const message = () => (props.error instanceof Error ? props.error.message : String(props.error))
  return (
    <div
      style={{
        flex: 1,
        "min-height": 0,
        display: "grid",
        "place-items": "center",
        padding: "28px",
        background: "var(--color-bg)",
      }}
    >
      <div
        style={{
          width: "min(420px, 100%)",
          display: "flex",
          "flex-direction": "column",
          "align-items": "center",
          gap: "10px",
          padding: "22px",
          "border-radius": "12px",
          border: "1px solid var(--color-border)",
          background: "var(--color-surface-solid)",
          "text-align": "center",
        }}
      >
        <IconFile size={22} strokeWidth={1.4} />
        <div style={{ "font-family": FONT_SANS, "font-size": "1rem", "font-weight": 600, color: "var(--color-text)" }}>
          Files view failed
        </div>
        <div
          style={{
            "font-family": FONT_MONO,
            "font-size": "0.786rem",
            color: "var(--color-text-faint)",
            "line-height": 1.5,
          }}
        >
          {message()}
        </div>
        <button
          type="button"
          onClick={() => window.location.reload()}
          style={{
            all: "unset",
            cursor: "pointer",
            padding: "7px 12px",
            "border-radius": "6px",
            border: "1px solid var(--color-border)",
            "font-family": FONT_MONO,
            "font-size": "0.786rem",
            color: "var(--color-text)",
          }}
        >
          reload
        </button>
      </div>
    </div>
  )
}
