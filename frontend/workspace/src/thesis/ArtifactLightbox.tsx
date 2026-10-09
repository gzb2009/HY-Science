import { createEffect, createSignal, onCleanup, onMount, Show, type JSX } from "solid-js"
import { Portal } from "solid-js/web"
import { useSDK } from "@/context/sdk"
import { useLanguage } from "@/context/language"
import { artifactImageUrl, type ArtifactData } from "@/utils/artifactPreview"
import type { ImagePreview } from "@/thesis/store/ui"

type Pdfjs = {
  GlobalWorkerOptions: { workerSrc: string }
  getDocument(source: { data: Uint8Array }): {
    promise: Promise<{
      numPages: number
      getPage(page: number): Promise<{
        getViewport(options: { scale: number }): { width: number; height: number }
        render(options: { canvasContext: CanvasRenderingContext2D; viewport: { width: number; height: number } }): {
          promise: Promise<void>
          cancel(): void
        }
      }>
      destroy(): Promise<void>
    }>
  }
}

type PdfDoc = {
  numPages: number
  getPage(page: number): Promise<{
    getViewport(options: { scale: number }): { width: number; height: number }
    render(options: { canvasContext: CanvasRenderingContext2D; viewport: { width: number; height: number } }): {
      promise: Promise<void>
      cancel(): void
    }
  }>
  destroy(): Promise<void>
}

export function ArtifactLightbox(props: { artifact: ImagePreview; onClose: () => void }): JSX.Element {
  const sdk = useSDK()
  const language = useLanguage()
  // Snapshot once. The parent <Show> accessor throws once the preview is cleared,
  // and any live read of props.artifact during that update aborts unmount.
  const artifact: ImagePreview = {
    directory: props.artifact.directory,
    path: props.artifact.path,
    name: props.artifact.name,
    mime: props.artifact.mime,
    kind: props.artifact.kind,
  }
  const kind = () => artifact.kind ?? (artifact.name.toLowerCase().endsWith(".pdf") ? "pdf" : "image")
  const [data, setData] = createSignal<ArtifactData>()
  const [failed, setFailed] = createSignal("")
  const [zoom, setZoom] = createSignal(1)
  const [page, setPage] = createSignal(1)
  const [pages, setPages] = createSignal(1)
  const [box, setBox] = createSignal({ w: 800, h: 560 })
  const [natural, setNatural] = createSignal({ w: 0, h: 0 })
  const src = () => artifactImageUrl(data(), artifact.mime)
  const clampZoom = (value: number) => setZoom(Math.min(8, Math.max(0.25, Math.round(value * 20) / 20)))

  const pad = 48
  const inner = () => ({
    w: Math.max(160, box().w - pad),
    h: Math.max(120, box().h - pad),
  })

  const imageSize = () => {
    const nat = natural()
    const view = inner()
    if (!nat.w || !nat.h) return { w: view.w, h: view.h }
    const fit = Math.min(view.w / nat.w, view.h / nat.h, 1)
    return { w: Math.round(nat.w * fit * zoom()), h: Math.round(nat.h * fit * zoom()) }
  }

  let stage: HTMLDivElement | undefined
  const drag = { on: false, x: 0, y: 0, left: 0, top: 0 }

  createEffect(() => {
    const directory = artifact.directory
    const path = artifact.path
    setData(undefined)
    setFailed("")
    setZoom(1)
    setPage(1)
    setPages(1)
    setNatural({ w: 0, h: 0 })
    if (!directory || !path) return
    void sdk.client.file
      .read({ directory, path })
      .then((res) => {
        const payload = res as { data?: ArtifactData }
        setData(payload.data ?? (res as ArtifactData))
      })
      .catch((error: { message?: string }) => setFailed(error?.message ?? "read failed"))
  })

  onMount(() => {
    const el = stage
    if (!el) return
    const measure = () => setBox({ w: el.clientWidth, h: el.clientHeight })
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return
      event.preventDefault()
      const next = zoom() + (event.deltaY < 0 ? 0.2 : -0.2)
      const before = el.scrollWidth
      clampZoom(next)
      requestAnimationFrame(() => {
        if (!before) return
        const ratio = el.scrollWidth / before
        el.scrollLeft =
          (el.scrollLeft + event.clientX - el.getBoundingClientRect().left) * ratio -
          (event.clientX - el.getBoundingClientRect().left)
        el.scrollTop =
          (el.scrollTop + event.clientY - el.getBoundingClientRect().top) * ratio -
          (event.clientY - el.getBoundingClientRect().top)
      })
    }
    el.addEventListener("wheel", onWheel, { passive: false })
    onCleanup(() => {
      try {
        observer.disconnect()
        el.removeEventListener("wheel", onWheel)
      } catch {
        // Unmount must finish even if the node is already gone.
      }
    })
  })

  createEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault()
        props.onClose()
        return
      }
      if (event.key === "+" || event.key === "=") {
        event.preventDefault()
        clampZoom(zoom() + 0.25)
        return
      }
      if (event.key === "-" || event.key === "_") {
        event.preventDefault()
        clampZoom(zoom() - 0.25)
        return
      }
      if (kind() !== "pdf") return
      if (event.key === "ArrowRight" || event.key === "ArrowDown") {
        event.preventDefault()
        setPage((value) => Math.min(pages(), value + 1))
      }
      if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
        event.preventDefault()
        setPage((value) => Math.max(1, value - 1))
      }
    }
    window.addEventListener("keydown", onKey)
    onCleanup(() => window.removeEventListener("keydown", onKey))
  })

  const onPointerDown = (event: PointerEvent) => {
    if (event.button !== 0 || !stage) return
    drag.on = true
    drag.x = event.clientX
    drag.y = event.clientY
    drag.left = stage.scrollLeft
    drag.top = stage.scrollTop
    stage.setPointerCapture(event.pointerId)
    stage.classList.add("is-panning")
  }
  const onPointerMove = (event: PointerEvent) => {
    if (!drag.on || !stage) return
    stage.scrollLeft = drag.left - (event.clientX - drag.x)
    stage.scrollTop = drag.top - (event.clientY - drag.y)
  }
  const onPointerUp = (event: PointerEvent) => {
    drag.on = false
    stage?.classList.remove("is-panning")
    if (stage?.hasPointerCapture(event.pointerId)) stage.releasePointerCapture(event.pointerId)
  }

  return (
    <Portal>
      <div
        class="cs-artifact-lightbox"
        role="dialog"
        aria-modal="true"
        aria-label={artifact.name}
        onClick={props.onClose}
      >
        <header
          class="cs-artifact-lightbox-bar"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
        >
          <span class="cs-artifact-lightbox-name">{artifact.name}</span>
          <Show when={kind() === "pdf"}>
            <span class="cs-artifact-lightbox-pages">
              <button type="button" disabled={page() <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>
                ‹
              </button>
              {page()} / {pages()}
              <button
                type="button"
                disabled={page() >= pages()}
                onClick={() => setPage((value) => Math.min(pages(), value + 1))}
              >
                ›
              </button>
            </span>
          </Show>
          <span class="cs-artifact-lightbox-zoom">
            <button type="button" onClick={() => clampZoom(zoom() - 0.25)}>
              −
            </button>
            <button type="button" onClick={() => setZoom(1)}>
              {Math.round(zoom() * 100)}%
            </button>
            <button type="button" onClick={() => clampZoom(zoom() + 0.25)}>
              +
            </button>
          </span>
          <button type="button" class="cs-artifact-lightbox-close" onClick={props.onClose}>
            {language.t("common.close")}
          </button>
        </header>
        <div
          ref={stage}
          class="cs-artifact-lightbox-stage"
          onClick={(event) => event.stopPropagation()}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <Show when={failed()}>
            <p class="cs-artifact-lightbox-empty">{failed()}</p>
          </Show>
          <Show when={!failed() && kind() === "image"}>
            <Show when={src()} fallback={<p class="cs-artifact-lightbox-empty">loading…</p>}>
              <div
                class="cs-artifact-lightbox-frame"
                style={{
                  width: `${imageSize().w}px`,
                  height: `${imageSize().h}px`,
                }}
              >
                <img
                  src={src()}
                  alt={artifact.name}
                  onLoad={(event) => {
                    const img = event.currentTarget
                    setNatural({ w: img.naturalWidth, h: img.naturalHeight })
                  }}
                  onDblClick={() => setZoom(zoom() === 1 ? 2 : 1)}
                />
              </div>
            </Show>
          </Show>
          <Show when={!failed() && kind() === "pdf"}>
            <PdfStage data={data()} page={page()} zoom={zoom()} box={inner()} onPages={setPages} />
          </Show>
        </div>
      </div>
    </Portal>
  )
}

function PdfStage(props: {
  data: ArtifactData | undefined
  page: number
  zoom: number
  box: { w: number; h: number }
  onPages: (count: number) => void
}): JSX.Element {
  const [canvas, setCanvas] = createSignal<HTMLCanvasElement>()
  const [doc, setDoc] = createSignal<PdfDoc>()
  const [base, setBase] = createSignal({ w: 0, h: 0 })

  createEffect(() => {
    const node = canvas()
    const size = base()
    const zoom = props.zoom
    const view = props.box
    if (!node || !size.w || !size.h) return
    const fit = Math.min(view.w / size.w, view.h / size.h)
    const scale = Math.max(0.08, fit * zoom)
    node.style.width = `${Math.floor(size.w * scale)}px`
    node.style.height = `${Math.floor(size.h * scale)}px`
  })

  createEffect(() => {
    const file = props.data
    if (!file?.content || file.encoding !== "base64") {
      setDoc(undefined)
      return
    }
    const life = { disposed: false, handle: undefined as PdfDoc | undefined }
    void (async () => {
      try {
        const pdfjs = (await import("pdfjs-dist")) as unknown as Pdfjs
        if (!pdfjs.GlobalWorkerOptions.workerSrc) {
          pdfjs.GlobalWorkerOptions.workerSrc = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default
        }
        const bytes = Uint8Array.from(atob(file.content!), (char) => char.charCodeAt(0))
        const loaded = await pdfjs.getDocument({ data: bytes }).promise
        if (life.disposed) {
          await loaded.destroy()
          return
        }
        life.handle = loaded
        setDoc(loaded)
        props.onPages(loaded.numPages)
      } catch {
        if (!life.disposed) setDoc(undefined)
      }
    })()
    onCleanup(() => {
      life.disposed = true
      const handle = life.handle as { destroy?: () => Promise<void> } | undefined
      if (!handle || typeof handle.destroy !== "function") return
      void handle.destroy().catch(() => undefined)
    })
  })

  createEffect(() => {
    const loaded = doc()
    const node = canvas()
    const pageNumber = props.page
    const zoom = props.zoom
    const view = props.box
    if (!loaded || !node) return
    const life = { disposed: false, task: undefined as { cancel(): void } | undefined }
    void (async () => {
      try {
        const page = await loaded.getPage(Math.min(pageNumber, loaded.numPages))
        if (life.disposed) return
        const raw = page.getViewport({ scale: 1 })
        setBase({ w: raw.width, h: raw.height })
        const fit = Math.min(view.w / raw.width, view.h / raw.height)
        const viewport = page.getViewport({ scale: Math.max(0.08, fit * zoom) })
        const ratio = window.devicePixelRatio || 1
        node.width = Math.floor(viewport.width * ratio)
        node.height = Math.floor(viewport.height * ratio)
        node.style.width = `${Math.floor(viewport.width)}px`
        node.style.height = `${Math.floor(viewport.height)}px`
        const context = node.getContext("2d")
        if (!context) return
        context.setTransform(ratio, 0, 0, ratio, 0, 0)
        const rendered = page.render({ canvasContext: context, viewport })
        life.task = rendered
        await rendered.promise
      } catch {
        // empty canvas; filename stays in the bar
      }
    })()
    onCleanup(() => {
      life.disposed = true
      try {
        life.task?.cancel()
      } catch {
        // Cancelling a finished render must not block lightbox unmount.
      }
    })
  })

  return <canvas ref={setCanvas} class="cs-artifact-lightbox-pdf" />
}
