import { createEffect, For, onCleanup, Show, type JSX } from "solid-js"
import { IconChevronDown, IconFolder, IconShield } from "@/thesis/shared/Icon"
import { SCOPES, type Scope } from "@/thesis/composer-scope"

function useDismiss(open: () => boolean, root: () => HTMLElement | undefined, close: () => void) {
  createEffect(() => {
    if (!open()) return
    const onPointer = (event: PointerEvent) => {
      const node = root()
      if (node?.contains(event.target as Node)) return
      close()
    }
    document.addEventListener("pointerdown", onPointer)
    onCleanup(() => document.removeEventListener("pointerdown", onPointer))
  })
}

export function WorkspacePick(props: {
  name: string
  open: boolean
  projects: { id: string; name: string; path: string; current: boolean }[]
  onToggle: () => void
  onClose: () => void
  onPick: (id: string) => void
}): JSX.Element {
  let root: HTMLDivElement | undefined
  useDismiss(
    () => props.open,
    () => root,
    () => props.onClose(),
  )
  return (
    <div class="cs-workspace-pick" ref={root}>
      <button
        type="button"
        class="cs-workspace-pill"
        aria-label="工作区"
        aria-expanded={props.open}
        onClick={() => props.onToggle()}
      >
        <IconFolder size={14} strokeWidth={1.6} />
        <span>{props.name}</span>
        <IconChevronDown size={12} strokeWidth={1.6} />
      </button>
      <Show when={props.open}>
        <div class="cs-workspace-menu" role="menu">
          <For
            each={props.projects}
            fallback={<div class="cs-scope-empty">没有其他项目</div>}
          >
            {(project) => (
              <button
                type="button"
                role="menuitem"
                class="cs-scope-item"
                data-current={project.current ? "true" : undefined}
                onClick={() => props.onPick(project.id)}
              >
                <span class="cs-scope-item-title">{project.name}</span>
                <span class="cs-scope-item-hint">{project.path}</span>
              </button>
            )}
          </For>
        </div>
      </Show>
    </div>
  )
}

export function ScopePick(props: {
  value: Scope
  open: boolean
  onToggle: () => void
  onClose: () => void
  onPick: (scope: Scope) => void
}): JSX.Element {
  let root: HTMLDivElement | undefined
  useDismiss(
    () => props.open,
    () => root,
    () => props.onClose(),
  )
  const current = () => SCOPES.find((item) => item.id === props.value) ?? SCOPES[2]
  return (
    <div class="cs-scope-pick" ref={root}>
      <button
        type="button"
        class="cs-scope-pill"
        data-scope={props.value}
        aria-label="权限"
        aria-expanded={props.open}
        title={current().hint}
        onClick={() => props.onToggle()}
      >
        <IconShield size={13} strokeWidth={1.6} />
        <span>{current().label}</span>
        <IconChevronDown size={11} strokeWidth={1.6} />
      </button>
      <Show when={props.open}>
        <div class="cs-scope-menu" data-place="up" role="menu">
          <For each={SCOPES}>
            {(item) => (
              <button
                type="button"
                role="menuitem"
                class="cs-scope-item"
                data-current={item.id === props.value ? "true" : undefined}
                data-scope={item.id}
                onClick={() => props.onPick(item.id)}
              >
                <span class="cs-scope-item-title">{item.label}</span>
                <span class="cs-scope-item-hint">{item.hint}</span>
              </button>
            )}
          </For>
        </div>
      </Show>
    </div>
  )
}
