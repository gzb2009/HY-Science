import {
  createEffect,
  createMemo,
  createResource,
  createSignal,
  For,
  Match,
  on,
  onCleanup,
  onMount,
  Show,
  Switch,
  type JSX,
} from "solid-js"
import { useLocation, useNavigate, useParams } from "@solidjs/router"
import { produce } from "solid-js/store"
import { Binary } from "@hysci/util/binary"
import { projectSessionHref, sessionIdFromPath } from "@/utils/route-session"
import type { Project } from "@hysci/sdk/v2/client"
import { sessionRunning } from "@/utils/sessionActivity"
import { SessionTurn } from "@hysci/ui/session-turn"
import { DropdownMenu } from "@hysci/ui/dropdown-menu"
import { useSync } from "@/context/sync"
import { useGlobalSync } from "@/context/global-sync"
import { useSDK } from "@/context/sdk"
import { useServer } from "@/context/server"
import { usePlatform } from "@/context/platform"
import { useLayout } from "@/context/layout"
import { Composer } from "@/thesis/Composer"
import { RightPane } from "@/thesis/RightPane"
import { ColumnHandle } from "@/thesis/ColumnHandle"
import { SIDEBAR_COL, rightReserved } from "@/thesis/column-width"
import { centerTabs } from "@/thesis/store/centerTabs"
import { shellHost } from "@/shell/host"
import { SlotViews } from "@/shell/builtin"
import { InkWashBg } from "@/shell/ink-wash-bg"
import { FONT_MONO, FONT_SANS, FONT_SERIF } from "@/styles/tokens"
import { uiStore } from "@/thesis/store/ui"
import { floatActions } from "@/thesis/float-doc"
import { useGlobalKeys } from "@/thesis/useGlobalKeys"
import { useDialog } from "@hysci/ui/context/dialog"
import { useModels } from "@/context/models"
import { openSetupDialog } from "@/thesis/SetupDialog"
import { confirmDialog } from "@/thesis/dialogs"
import { DialogSettings } from "@/components/dialog-settings"
import { DisconnectedPanel } from "@/thesis/DisconnectedPanel"
import { CommandPalette } from "@/thesis/CommandPalette"
import { HelpOverlay } from "@/thesis/HelpOverlay"
import { ToastContainer } from "@/thesis/Toast"
import {
  IconPlus,
  IconSettings,
  IconFile,
  IconX,
  IconArrowDown,
  IconArrowUp,
  IconChevronDown,
  IconChevronRight,
  IconChevronLeft,
  IconTrash,
  IconBookOpen,
  IconArrowLeft,
  IconSearch,
  IconFolder,
  IconFolderOpen,
  IconStarFilled,
  IconBraces,
  IconTherefore,
  IconMatrix,
} from "@/thesis/shared/Icon"
import { AgentIcon } from "@/thesis/shared/AgentIcon"
import { useLanguage } from "@/context/language"
import { projectPrefs } from "@/thesis/store/projectPrefs"
import { SessionStatusLight } from "@/thesis/shared/SessionStatusLight"
import { DomainSwitchCard } from "@/domain/DomainSwitchCard"
import { switchFromParts } from "@/domain/switch"
import { InlineRename } from "@/thesis/shared/InlineRename"
import { decode64 } from "@/utils/base64"
import { projectLabel } from "@/utils/projectLabel"
import {
  findProjectByWorktree,
  type HostFileRef,
  resolveHostFileRef,
  resolveProjectWorkingDir,
} from "@/utils/projectWorkspace"
import {
  assistantMessagesForLastTurn,
  collectRecentTurnFileNames,
  collectResultFiles,
  collectTaskFileNames,
  customerFacingResultFiles,
  type ResultFile,
} from "@hysci/ui/session-result"
import {
  migrateResultDirectory,
  isResultDirectory,
  isResultFolderName,
  normalizeResultFolderName,
  resultFolderName,
} from "@/utils/projectResult"
import { firstUserMessageText, getSessionDisplayTitle } from "@/utils/sessionDisplayTitle"
import { isEmptyDraftSession } from "@/utils/sessionNaming"
import { projectMetaLocal } from "@/thesis/store/projectMetaLocal"
import { projectDomainId, type DomainId } from "@/domain/registry"
import { protocolResearch } from "@/domain/protocol"
import { IMC_STEPS } from "@/domain/imc-flow"
import { sessionTitleLocal } from "@/thesis/store/sessionTitleLocal"
import { toast } from "@/thesis/Toast"
import { artifactImageUrl, artifactTable, type ArtifactData } from "@/utils/artifactPreview"
import { rememberDesktopSession, stayOnHome } from "@/utils/desktop-session"

type SyncSession = ReturnType<typeof useSync>["data"]["session"][number]
type SidebarSession = { session: SyncSession; title: string; busy: boolean }
type SidebarGroup = {
  worktree: string
  directory: string
  name: string
  pinned: boolean
  current: boolean
  sessions: SidebarSession[]
}
/**
 * Session page — sidebar + chat/files center + inspector rail (terminal/review).
 */
export default function Page(): JSX.Element {
  const rawParams = useParams()
  const location = useLocation()
  const params = {
    get dir() {
      return rawParams.dir
    },
    get id() {
      return sessionIdFromPath(location.pathname)
    },
  }
  const navigate = useNavigate()
  const sync = useSync()
  const globalSync = useGlobalSync()
  const sdk = useSDK()
  const platform = usePlatform()
  const layout = useLayout()
  const server = useServer()
  const dialog = useDialog()
  async function resolveOutputFile(path: string): Promise<HostFileRef> {
    const worktree = sync.data.path.directory || sdk.directory || sync.project?.worktree || ""
    const ref = resolveHostFileRef(worktree, path)
    if (path.includes("/") || path.startsWith("~") || path.startsWith("file://")) return ref

    const root: any = await sdk.client.file.list({ directory: worktree, path: "." }).catch(() => undefined)
    const rows = root?.data ?? root
    if (!Array.isArray(rows)) return ref
    const folders = rows.filter(
      (node: { type: string; name: string }) => node.type === "directory" && isResultFolderName(node.name),
    )
    for (const folder of folders) {
      const listing: any = await sdk.client.file.list({ directory: worktree, path: folder.name }).catch(() => undefined)
      const files = listing?.data ?? listing
      const file = Array.isArray(files)
        ? files.find((node: { type: string; name: string }) => node.type === "file" && node.name === path)
        : undefined
      if (file) return { directory: worktree, path: `${folder.name}/${file.name}` }
      const children = Array.isArray(files)
        ? files.filter(
            (node: { type: string; name: string }) => node.type === "directory" && !node.name.startsWith("."),
          )
        : []
      for (const child of children) {
        const nested: any = await sdk.client.file
          .list({ directory: worktree, path: `${folder.name}/${child.name}` })
          .catch(() => undefined)
        const nestedFiles = nested?.data ?? nested
        const nestedFile = Array.isArray(nestedFiles)
          ? nestedFiles.find((node: { type: string; name: string }) => node.type === "file" && node.name === path)
          : undefined
        if (nestedFile) return { directory: worktree, path: `${folder.name}/${child.name}/${nestedFile.name}` }
      }
    }
    return ref
  }

  async function previewArtifact(path: string) {
    const ref = await resolveOutputFile(path)
    if (!ref.path) {
      toast.error("preview failed", "invalid file path")
      return
    }
    const name = ref.path.split("/").pop() || ref.path
    uiStore.setImagePreview({
      ...ref,
      name,
      kind: name.toLowerCase().endsWith(".pdf") ? "pdf" : "image",
    })
  }

  async function openFile(path: string) {
    if (/\.(py|ipynb|r|R|sh)$/i.test(path)) {
      uiStore.setRightPaneTab(path)
      uiStore.setRightPaneOpen(true)
      return
    }
    const ref = await resolveOutputFile(path)
    if (!ref.path) {
      toast.error("open failed", "invalid file path")
      return
    }
    centerTabs.openFile(ref.directory, ref.path)
  }

  async function openLocalFile(path: string, action: "reveal" | "app", app?: "excel") {
    const ref = await resolveOutputFile(path)
    if (!ref.path) {
      toast.error("open failed", "invalid file path")
      return
    }
    const url = `${sdk.url.replace(/\/$/, "")}/file/open?directory=${encodeURIComponent(ref.directory)}`
    const res = await (platform.fetch ?? fetch)(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: ref.path, action, ...(app ? { app } : {}) }),
    })
    const body: { opened?: boolean; error?: string; message?: string } = await res.json().catch(() => ({}))
    if (res.ok && body.opened !== false) return
    toast.error("open failed", body.error ?? body.message ?? `HTTP ${res.status}`)
  }

  function newSession() {
    navigate(`/${params.dir}/session/new`)
  }

  const language = useLanguage()

  async function renameProject(name: string) {
    const worktree = projectWorktree()
    if (!worktree) return
    const trimmed = name.trim()
    if (!trimmed) return
    const p = projectRecord()
    try {
      const oldFolder = resultFolderName(worktree, p?.name ?? projectLabel(p ?? { worktree }))
      const nextFolder = normalizeResultFolderName(trimmed, worktree)
      if (oldFolder !== nextFolder) {
        await migrateResultDirectory(sdk.url, fetch, worktree, oldFolder, nextFolder)
      }
      projectMetaLocal.patch(worktree, { name: trimmed, resultFolderName: nextFolder })
      globalSync.project.meta(worktree, { name: trimmed })
      if (p?.id && p.id !== "global" && p.id !== worktree) {
        await sdk.client.project.update({
          projectID: p.id,
          directory: worktree,
          name: trimmed,
          resultFolder: nextFolder,
        } as any)
      }
    } catch (e: any) {
      toast.error(language.t("common.requestFailed"), e?.message ?? String(e))
    }
  }

  async function renameSession(sessionID: string, title: string) {
    const trimmed = title.trim()
    if (!trimmed) return
    sessionTitleLocal.patch(sessionID, trimmed)
    const [, setStore] = globalSync.child(sdk.directory)
    setStore(
      produce((draft) => {
        const match = Binary.search(draft.session, sessionID, (s) => s.id)
        if (match.found) draft.session[match.index].title = trimmed
      }),
    )
    try {
      const res = await sdk.client.session.update({ sessionID, title: trimmed })
      const updated = (res as { data?: { title?: string } })?.data
      if (updated?.title) {
        setStore(
          produce((draft) => {
            const match = Binary.search(draft.session, sessionID, (s) => s.id)
            if (match.found) draft.session[match.index].title = updated.title!
          }),
        )
      }
    } catch (e: any) {
      toast.error(language.t("common.requestFailed"), e?.message ?? String(e))
      void sync.session.sync(sessionID).catch(() => undefined)
    }
  }

  async function deleteSession(sessionID: string) {
    // Capture the next-active id BEFORE the optimistic splice so we
    // know where to navigate.
    const active = params.id === sessionID
    const next = sessions().find((s) => s.id !== sessionID)?.id
    try {
      await sync.session.delete(sessionID)
      sessionTitleLocal.remove(sessionID)
      if (active) {
        navigate(next ? `/${params.dir}/session/${next}` : `/${params.dir}/session/new`)
      }
    } catch (e: any) {
      console.error("session.delete failed", e)
      toast.error("could not delete", e?.message ?? String(e))
    }
  }

  // Force-load the session list into the sync store every time we land
  // on a project. sync.session.fetch() calls session.list AND reconciles
  // the result into the per-directory store; the raw SDK call alone
  // doesn't.
  createEffect(
    on(
      () => params.dir,
      (dir) => {
        if (!dir) return
        centerTabs.resetForProject(dir)
        uiStore.setImagePreview(undefined)
        uiStore.setHelpOpen(false)
        uiStore.setPaletteOpen(false)
        ;(async () => {
          try {
            await sync.session.fetch(50)
          } catch {}
        })()
      },
    ),
  )

  // When the active session id changes, hydrate that session's messages
  // (and parts) into the store. Without this the chat panel shows blank
  // when you click an existing session — sync.session.sync() pulls the
  // backend's stored messages in.
  createEffect(
    on(
      () => params.id,
      (id) => {
        if (!id || id === "new") return
        // First send already wrote the user turn locally. Don't refetch
        // before the server has it — reconcile would wipe the bubble.
        if (sync.data.message[id]?.some((item) => item.role === "user")) {
          void sync.session.review(id).catch(() => undefined)
          return
        }
        void sync.session.sync(id).catch(() => undefined)
        void sync.session.review(id).catch(() => undefined)
      },
    ),
  )

  // Hydrate child (sub-agent) sessions of the active session regardless of
  // which right-pane tab is open, so the Agents view and inline turn status
  // populate immediately and survive a reload.
  const hydratedChildren = new Set<string>()
  createEffect(() => {
    const id = params.id
    if (!id || id === "new") return
    for (const child of sync.data.session) {
      if (child.parentID !== id || hydratedChildren.has(child.id)) continue
      hydratedChildren.add(child.id)
      void sync.session.sync(child.id).catch(() => {})
    }
  })

  const projectWorktree = createMemo(() => decode64(params.dir) ?? "")
  createEffect(() => {
    const dir = projectWorktree()
    if (!dir) return
    rememberDesktopSession(dir, params.id)
  })
  const workspaceDir = () => sdk.directory
  const projectRecord = createMemo(() => {
    projectMetaLocal.all()
    const worktree = projectWorktree()
    if (!worktree) return sync.project
    return findProjectByWorktree(globalSync.data.project, worktree) ?? sync.project
  })
  const [protocolBusy, setProtocolBusy] = createSignal(false)
  async function setProtocol(id: DomainId) {
    const project = projectRecord()
    if (!project?.id || project.id === "global" || protocolBusy()) return
    if (projectDomainId(project) === id) return
    setProtocolBusy(true)
    const research = protocolResearch(id, project.research?.notes)
    try {
      await sdk.client.project.update({
        projectID: project.id,
        directory: project.worktree,
        research,
      } as any)
      globalSync.set(
        "project",
        produce((draft: Project[]) => {
          const row = draft.find((item) => item.id === project.id)
          if (!row) return
          row.research = { ...row.research, ...research }
        }),
      )
      toast.success(language.t("protocol.applied", { name: language.t(`domain.${id}.title` as "domain.general.title") }))
    } catch (err) {
      toast.error(language.t("common.requestFailed"), err instanceof Error ? err.message : String(err))
    } finally {
      setProtocolBusy(false)
    }
  }
  const projectName = createMemo(() => {
    projectMetaLocal.all()
    const p = projectRecord()
    if (p) return projectLabel(p)
    const path = projectWorktree() || resolveProjectWorkingDir(workspaceDir())
    const segs = path.split("/").filter(Boolean)
    return segs[segs.length - 1] ?? path
  })

  const sessions = createMemo<SyncSession[]>(() => {
    const dir = workspaceDir()
    const active = params.id
    return [...sync.data.session]
      .filter((s) => !s.parentID)
      .filter((s) => !s.directory || s.directory === dir)
      .filter((s) => s.id === active || !isEmptyDraftSession(s, sync.data.message[s.id]))
      .sort((a, b) => (b.time?.updated ?? 0) - (a.time?.updated ?? 0))
  })

  const sidebarGroups = createMemo((): SidebarGroup[] => {
    projectMetaLocal.all()
    sessionTitleLocal.all()
    const worktree = projectWorktree()
    if (!worktree) return []
    const dir = resolveProjectWorkingDir(worktree)
    const [child] = globalSync.child(dir, { bootstrap: false })
    return [
      {
        worktree,
        directory: dir,
        name: projectName(),
        pinned: projectPrefs.isFavorite(worktree),
        current: true,
        sessions: sessions().map((session) => ({
          session,
          title: getSessionDisplayTitle(session, child.message[session.id], child.part),
          busy: sessionRunning(child.session_status[session.id]),
        })),
      },
    ]
  })

  const switchProjects = createMemo(() => {
    projectMetaLocal.all()
    const hide = projectPrefs.hidden()
    const current = projectWorktree().replace(/\/$/, "")
    const norm = (value: string) => value.replace(/\/$/, "")
    const by = new Map<string, { worktree: string; name: string; current: boolean }>()
    for (const project of globalSync.data.project) {
      if (!project.worktree || hide.has(project.worktree) || hide.has(norm(project.worktree))) continue
      if (isResultDirectory(project.worktree)) continue
      const path = norm(project.worktree)
      by.set(path, {
        worktree: project.worktree,
        name: projectLabel(project),
        current: path === current,
      })
    }
    return [...by.values()].sort(
      (a, b) => Number(b.current) - Number(a.current) || a.name.localeCompare(b.name, "zh"),
    )
  })

  function latestSessionId(directory: string) {
    const dir = resolveProjectWorkingDir(directory)
    if (dir === workspaceDir() && sessions()[0]?.id) return sessions()[0].id
    const [child] = globalSync.child(dir, { bootstrap: false })
    return [...child.session]
      .filter((s) => !s.parentID && !s.time?.archived)
      .sort((a, b) => (b.time?.updated ?? 0) - (a.time?.updated ?? 0))[0]?.id
  }

  function openProject(directory: string, sessionId?: string) {
    projectPrefs.unhide(directory)
    layout.projects.open(directory)
    server.projects.touch(directory)
    navigate(projectSessionHref(directory, sessionId || latestSessionId(directory)))
  }
  const messages = createMemo(() => (params.id ? (sync.data.message[params.id] ?? []) : []))
  const taskFileNames = createMemo(() => {
    const id = params.id
    if (!id) return new Set<string>()
    const msgs = sync.data.message[id] ?? []
    return collectTaskFileNames({
      messages: msgs,
      partsByMessage: sync.data.part,
    })
  })
  const recentTurnFileNames = createMemo(() => {
    const id = params.id
    if (!id) return new Set<string>()
    const msgs = sync.data.message[id] ?? []
    return collectRecentTurnFileNames({
      messages: msgs,
      partsByMessage: sync.data.part,
    })
  })
  const taskResultFiles = createMemo(() => {
    const id = params.id
    if (!id) return [] as ResultFile[]
    const msgs = sync.data.message[id] ?? []
    return customerFacingResultFiles(
      collectResultFiles({
        assistantMessages: msgs.filter(
          (message) => message.role === "assistant",
        ) as import("@hysci/sdk/v2/client").AssistantMessage[],
        partsByMessage: sync.data.part,
        responseText: "",
      }),
    )
  })
  const recentResultFiles = createMemo(() => {
    const id = params.id
    if (!id) return [] as ResultFile[]
    const msgs = sync.data.message[id] ?? []
    return customerFacingResultFiles(
      collectResultFiles({
        assistantMessages: assistantMessagesForLastTurn(msgs) as import("@hysci/sdk/v2/client").AssistantMessage[],
        partsByMessage: sync.data.part,
        responseText: "",
      }),
    )
  })
  const lastUserMessage = createMemo(() => {
    const ms = messages()
    for (let i = ms.length - 1; i >= 0; i--) if (ms[i].role === "user") return ms[i]
  })
  // A SessionTurn renders nothing for an assistant message — it only renders
  // when handed a user message, gathering that turn's assistant replies itself.
  // So render exactly one turn per user message; iterating every message made
  // each of the (often hundreds of) assistant messages paint an empty turn plus
  // a divider, which stacked up as faint horizontal lines down the chat and
  // bloated the DOM (slowing the reflow when the right pane opens).
  // When the session is in a reverted state, turns at or past the revert point
  // stay hidden until the user restores them or sends a new message (which
  // makes the revert permanent server-side).
  const activeSession = createMemo(() => (params.id ? sync.session.get(params.id) : undefined))
  const revertInfo = createMemo(() => activeSession()?.revert)
  const turnMessages = createMemo(() => {
    const revertID = revertInfo()?.messageID
    return messages().filter((m) => m.role === "user" && (!revertID || m.id < revertID))
  })
  createEffect(() => {
    shellHost.setImc(projectDomainId(projectRecord()) === "imc" && turnMessages().length > 0)
  })
  createEffect(() => {
    const id = params.id
    if (!id || id === "new") return
    void sync.session.todo(id)
  })
  const revertedCount = createMemo(() => {
    const revertID = revertInfo()?.messageID
    if (!revertID) return 0
    return messages().filter((m) => m.role === "user" && m.id >= revertID).length
  })

  const revertTo = async (messageID: string) => {
    const id = params.id
    if (!id) return
    const ok = await confirmDialog(dialog, {
      title: "Undo from here?",
      message:
        "Hides this message and everything after it, and rolls back the file changes they made. You can restore until you send the next message.",
      confirmLabel: "undo",
      danger: true,
    })
    if (!ok) return
    try {
      await sync.session.revert(id, messageID)
      toast.success("reverted", "files rolled back. send a message to continue from here")
    } catch (e: any) {
      toast.error("undo failed", e?.message ?? String(e))
    }
  }

  const restoreRevert = async () => {
    const id = params.id
    if (!id) return
    try {
      await sync.session.unrevert(id)
      toast.success("messages restored")
    } catch (e: any) {
      toast.error("restore failed", e?.message ?? String(e))
    }
  }

  const [stepsExpanded, setStepsExpanded] = createSignal<Record<string, boolean>>({})
  const toggleSteps = (id: string) => setStepsExpanded((prev) => ({ ...prev, [id]: !prev[id] }))

  const [sidebarOpen, setSidebarOpen] = createSignal(true)

  onMount(() => {
    uiStore.setPaletteOpen(false)
    uiStore.setHelpOpen(false)
    uiStore.setImagePreview(undefined)
    const fit = () => {
      uiStore.setSidebarWidth(uiStore.sidebarWidth())
      uiStore.setRightPaneWidth(uiStore.rightPaneWidth())
    }
    fit()
    window.addEventListener("resize", fit)
    onCleanup(() => window.removeEventListener("resize", fit))
  })

  useGlobalKeys({ onNew: () => void newSession() })

  // Center-pane tabs. The chat tab is always mounted (so streaming + scroll
  // survive tab switches); Files mounts on first visit; document tabs mount
  // when opened from the explorer and unmount on close.
  const chatTitle = createMemo(() => {
    const fallback = language.t("sidebar.newSubTask")
    const id = params.id
    if (!id || id === "new") return fallback
    const s = sessions().find((x) => x.id === id)
    if (!s) return fallback
    return getSessionDisplayTitle(s, sync.data.message[id], sync.data.part, fallback)
  })
  createEffect(() => {
    if (centerTabs.active() === "chat") return
    const focused = document.activeElement
    if (focused instanceof HTMLElement && focused.closest(".cs-chat-stage")) focused.blur()
  })

  // Chat scroll. The container resizes whenever the right pane opens/closes
  // (the chat column narrows/widens) or the window changes size. A bare reflow
  // can drop the scroll position to the top, so we track whether the user is
  // pinned to the bottom and re-anchor on every resize via a ResizeObserver —
  // sticking to the bottom when they were reading the latest output, or
  // preserving their distance from the bottom when they had scrolled up.
  let scrollRef: HTMLDivElement | undefined
  let scrollObserver: ResizeObserver | undefined
  let contentObserver: ResizeObserver | undefined
  let boundScroll: HTMLDivElement | undefined
  let boundContent: HTMLDivElement | undefined
  const NEAR_BOTTOM_PX = 120
  const [pinnedToBottom, setPinnedToBottom] = createSignal(true)
  const [prevTurn, setPrevTurn] = createSignal<{ id: string; preview: string }>()
  let distanceFromBottom = 0

  const previewOf = (id: string) => {
    const text = (sync.data.part[id] ?? [])
      .filter((part): part is typeof part & { type: "text"; text: string } => part.type === "text" && "text" in part)
      .map((part) => part.text)
      .join(" ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
    if (!text) return ""
    return text.length > 32 ? `${text.slice(0, 32)}…` : text
  }

  const findPrev = () => {
    const root = scrollRef
    if (!root) {
      setPrevTurn(undefined)
      return
    }
    const edge = root.getBoundingClientRect().top + 16
    const hit = turnMessages().reduce<{ id: string; preview: string } | undefined>((acc, item) => {
      const node = root.querySelector(`[data-message-id="${CSS.escape(item.id)}"]`)
      if (!(node instanceof HTMLElement)) return acc
      if (node.getBoundingClientRect().bottom < edge) return { id: item.id, preview: previewOf(item.id) }
      return acc
    }, undefined)
    setPrevTurn(hit)
  }

  const jumpToPrev = () => {
    const hit = prevTurn()
    if (!hit || !scrollRef) return
    const node = scrollRef.querySelector(`[data-message-id="${CSS.escape(hit.id)}"]`)
    if (!(node instanceof HTMLElement)) return
    const root = scrollRef.getBoundingClientRect()
    const box = node.getBoundingClientRect()
    scrollRef.scrollTo({ top: scrollRef.scrollTop + box.top - root.top - 12, behavior: "smooth" })
  }

  const recordScroll = () => {
    if (!scrollRef) return
    distanceFromBottom = scrollRef.scrollHeight - scrollRef.scrollTop - scrollRef.clientHeight
    setPinnedToBottom(distanceFromBottom <= NEAR_BOTTOM_PX)
    findPrev()
  }

  const stickToBottom = () => {
    if (!scrollRef) return
    scrollRef.scrollTop = scrollRef.scrollHeight
    distanceFromBottom = 0
    setPinnedToBottom(true)
  }

  const jumpToLatest = () => {
    if (!scrollRef) return
    setPinnedToBottom(true)
    distanceFromBottom = 0
    scrollRef.scrollTo({ top: scrollRef.scrollHeight, behavior: "smooth" })
  }

  const reanchor = () => {
    if (!scrollRef) return
    if (pinnedToBottom()) stickToBottom()
    else scrollRef.scrollTop = Math.max(0, scrollRef.scrollHeight - scrollRef.clientHeight - distanceFromBottom)
  }

  const attachScroll = (el: HTMLDivElement) => {
    if (boundScroll === el) return
    if (scrollObserver) scrollObserver.disconnect()
    if (boundScroll) boundScroll.removeEventListener("scroll", recordScroll)
    boundScroll = el
    scrollRef = el
    setPinnedToBottom(true)
    el.addEventListener("scroll", recordScroll, { passive: true })
    const syncGutter = () => {
      const gutter = el.offsetWidth - el.clientWidth
      const stage = el.closest(".cs-chat-stage")
      if (stage instanceof HTMLElement) stage.style.setProperty("--cs-scrollbar", `${gutter}px`)
    }
    scrollObserver = new ResizeObserver(() => {
      syncGutter()
      reanchor()
    })
    scrollObserver.observe(el)
    syncGutter()
  }

  const attachContent = (el: HTMLDivElement) => {
    if (boundContent === el) return
    if (contentObserver) contentObserver.disconnect()
    boundContent = el
    contentObserver = new ResizeObserver(() => {
      if (pinnedToBottom()) stickToBottom()
    })
    contentObserver.observe(el)
  }

  onCleanup(() => {
    if (scrollObserver) scrollObserver.disconnect()
    if (contentObserver) contentObserver.disconnect()
    if (boundScroll) boundScroll.removeEventListener("scroll", recordScroll)
  })

  // New messages / session switch → keep the latest output in view when the
  // user is pinned to the bottom (don't yank them down if they scrolled up).
  createEffect(
    on(
      () => [messages().length, params.id],
      ([, id], prev) => {
        const sessionChanged = !prev || prev[1] !== id
        if (sessionChanged) setPinnedToBottom(true)
        if (scrollRef && pinnedToBottom())
          requestAnimationFrame(() => {
            if (scrollRef && pinnedToBottom()) stickToBottom()
          })
      },
    ),
  )

  createEffect(() => {
    const id = params.id
    if (!id) return
    let size = messages().length
    for (const message of messages()) {
      const parts = sync.data.part[message.id] ?? []
      size += parts.length
      for (const part of parts) {
        if (part.type === "text" || part.type === "reasoning") size += part.text?.length ?? 0
      }
    }
    if (!size || !scrollRef || !pinnedToBottom()) return
    requestAnimationFrame(() => {
      if (scrollRef && pinnedToBottom()) stickToBottom()
    })
  })

  createEffect(() => {
    const worktree = projectWorktree()
    if (projectRecord() && worktree) layout.projects.open(worktree)
  })

  return (
    <div
      class="thesis-root cs-ink-session"
      style={{
        flex: 1,
        display: "flex",
        "flex-direction": "column",
        height: "100dvh",
        overflow: "hidden",
        position: "relative",
      }}
    >
      <InkWashBg strength={0.32} scale={0.58} anchor="bottom-left" />
      <ToastContainer />
      <SlotViews slot="message" />
      <HelpOverlay open={uiStore.helpOpen()} onClose={() => uiStore.setHelpOpen(false)} />
      <CommandPalette open={uiStore.paletteOpen()} onClose={() => uiStore.setPaletteOpen(false)} />

      <DisconnectedPanel />

      <div
        class="cs-session-layout"
        style={{
          flex: 1,
          "min-height": 0,
          "min-width": 0,
          display: "flex",
          overflow: "hidden",
        }}
      >
        <SessionsSidebar
          open={sidebarOpen()}
          groups={sidebarGroups()}
          activeId={params.id}
          filesActive={centerTabs.filesOpen() && centerTabs.active() === "files"}
          onToggle={() => setSidebarOpen((v) => !v)}
          onBack={() => {
            stayOnHome()
            navigate("/")
          }}
          onNew={() => {
            centerTabs.showChat()
            void newSession()
          }}
          onCustomize={() => dialog.show(() => <DialogSettings />)}
          onFiles={() => centerTabs.showFiles()}
          onOpenProject={(worktree) => {
            uiStore.setImagePreview(undefined)
            const here = projectWorktree()
            const same =
              worktree === here || resolveProjectWorkingDir(worktree) === resolveProjectWorkingDir(here)
            if (same && params.id && params.id !== "new") {
              centerTabs.showChat()
              return
            }
            centerTabs.showChat()
            openProject(worktree)
          }}
          onSelect={(worktree, id) => {
            uiStore.setImagePreview(undefined)
            centerTabs.showChat()
            openProject(worktree, id)
          }}
          onDelete={(id) => void deleteSession(id)}
          onRenameProject={(name) => void renameProject(name)}
          onRenameSession={(id, title) => void renameSession(id, title)}
        />

        <div
          class="cs-session-center"
          style={{
            flex: 1,
            "min-width": 0,
            "min-height": 0,
            display: "flex",
            "flex-direction": "column",
            overflow: "hidden",
          }}
        >
          <Show when={centerTabs.tabStripVisible()}>
            <CenterTabStrip
              chatTitle={chatTitle()}
              plan={
                floatActions({
                  statuses: (params.id ? (sync.data.todo[params.id] ?? []) : []).map((item) => item.status),
                  codePaths: taskResultFiles().map((file) => file.path),
                }).plan
              }
              notebook={
                floatActions({
                  statuses: (params.id ? (sync.data.todo[params.id] ?? []) : []).map((item) => item.status),
                  codePaths: taskResultFiles().map((file) => file.path),
                }).notebook
              }
              onPlan={() => {
                uiStore.setRightPaneTab("plan")
                uiStore.setRightPaneOpen(true)
              }}
              onNotebook={(path) => {
                uiStore.setRightPaneTab(path)
                uiStore.setRightPaneOpen(true)
              }}
              onCloseChat={() => {
                centerTabs.showChat()
                void newSession()
              }}
            />
          </Show>

          <div
            class="cs-session-stage"
            style={{
              flex: 1,
              "min-height": 0,
              "min-width": 0,
              position: "relative",
              display: "flex",
              "flex-direction": "column",
            }}
          >
            {/* chat — always mounted so streaming + scroll survive tab switches */}
            <div
              class="cs-chat-stage"
              style={{
                display: centerTabs.chatOpen() && centerTabs.active() === "chat" ? "flex" : "none",
                flex: 1,
                "min-height": 0,
                "flex-direction": "column",
              }}
            >
              <Switch>
                <Match when={params.id && messages().length > 0}>
                  <div class="cs-chat-thread">
                    <div class="cs-chat-live-dock" data-chat-live-dock />
                    <div
                      ref={attachScroll}
                      class="thesis-scroll thesis-chat-scroll cs-chat-scroll"
                      style={{
                        flex: 1,
                        "min-height": 0,
                        "overflow-y": "auto",
                        "overflow-x": "hidden",
                        "padding-top": "12px",
                      }}
                    >
                      <div ref={attachContent} class="cs-chat-scroll-inner">
                        <For each={turnMessages()}>
                          {(message, index) => {
                            return (
                              <div
                                data-message-id={message.id}
                                class={`cs-chat-turn${message.role === "assistant" ? " hys-turn-card" : ""}`}
                              >
                                <Show when={message.role === "assistant" && message.agent}>
                                  <div
                                    class="hys-turn-card-header"
                                    style={{
                                      padding: "6px 12px 2px",
                                      "font-family": "var(--font-sans)",
                                      "font-size": "0.786rem",
                                      "font-weight": "600",
                                      color: "var(--color-text-muted)",
                                      display: "flex",
                                      "align-items": "center",
                                      gap: "8px",
                                    }}
                                  >
                                    <span>
                                      {((message.agent as string) || "assistant")
                                        .replace(/_/g, " ")
                                        .replace(/\b\w/g, (c: string) => c.toUpperCase())}
                                    </span>
                                  </div>
                                </Show>
                                <SessionTurn
                                  sessionID={params.id!}
                                  messageID={message.id}
                                  lastUserMessageID={lastUserMessage()?.id}
                                  stepsExpanded={stepsExpanded()[message.id] ?? false}
                                  onStepsExpandedToggle={() => toggleSteps(message.id)}
                                  onRevertMessage={(id) => void revertTo(id)}
                                  onOpenFile={(path) => void openFile(path)}
                                  onPreviewFile={(path) => void previewArtifact(path)}
                                  renderFilePreview={(file) =>
                                    file.kind === "png" || file.kind === "jpg" || file.kind === "svg" ? (
                                      <ArtifactImageThumb
                                        directory={sync.data.path.directory || sdk.directory}
                                        file={file}
                                      />
                                    ) : file.kind === "pdf" ? (
                                      <ArtifactPdfThumb
                                        directory={sync.data.path.directory || sdk.directory}
                                        file={file}
                                      />
                                    ) : file.kind === "csv" || file.kind === "tsv" ? (
                                      <ArtifactTableThumb
                                        directory={sync.data.path.directory || sdk.directory}
                                        file={file}
                                      />
                                    ) : undefined
                                  }
                                  onRevealFile={(path) => void openLocalFile(path, "reveal")}
                                  onOpenInApp={(path, app) => void openLocalFile(path, "app", app)}
                                  hideTools={["task"]}
                                  classes={{
                                    root: "min-w-0 w-full relative",
                                    content: "flex flex-col justify-between min-w-0",
                                    container: "w-full min-w-0",
                                  }}
                                />
                                <Show
                                  when={message.role === "user" && switchFromParts(sync.data.part[message.id] ?? [])}
                                >
                                  {(hit) => (
                                    <DomainSwitchCard
                                      hit={hit()}
                                      onApply={(id) => void setProtocol(id)}
                                    />
                                  )}
                                </Show>
                                {/* Space, not a rule — the bubbles already separate turns. */}
                                <Show when={index() < turnMessages().length - 1}>
                                  <div style={{ height: "22px" }} />
                                </Show>
                              </div>
                            )
                          }}
                        </For>
                      </div>
                    </div>
                    <Show when={prevTurn()}>
                      {(hit) => (
                        <button
                          type="button"
                          class="cs-chat-prev"
                          onClick={jumpToPrev}
                          title={language.t("chat.jumpPrev")}
                        >
                          <IconArrowUp size={13} strokeWidth={1.75} />
                          <span class="cs-chat-prev-label">{language.t("chat.jumpPrev")}</span>
                          <Show when={hit().preview}>
                            <span class="cs-chat-prev-excerpt">{hit().preview}</span>
                          </Show>
                        </button>
                      )}
                    </Show>
                    <Show when={!pinnedToBottom()}>
                      <button
                        type="button"
                        class="cs-chat-latest"
                        onClick={jumpToLatest}
                        title={language.t("chat.jumpLatest")}
                      >
                        <IconArrowDown size={13} strokeWidth={1.75} />
                        <span>{language.t("chat.jumpLatest")}</span>
                      </button>
                    </Show>
                  </div>
                </Match>
                <Match when={true}>
                  <ChatWelcome
                    domain={projectDomainId(projectRecord())}
                    name={projectName()}
                    projects={switchProjects()}
                    onOpenProject={openProject}
                  />
                </Match>
              </Switch>

              <Show when={revertInfo()}>
                <div style={{ padding: "8px 16px 0" }}>
                  <div
                    style={{
                      display: "flex",
                      "align-items": "center",
                      gap: "12px",
                      padding: "8px 12px",
                      border: "1px solid var(--color-border)",
                      "border-radius": "4px",
                      "font-size": "0.857rem",
                      "font-family": FONT_SANS,
                      color: "var(--color-text-muted)",
                      background: "var(--color-bg)",
                    }}
                  >
                    <span style={{ flex: 1, "min-width": 0 }}>
                      Conversation reverted. {revertedCount()} turn{revertedCount() === 1 ? "" : "s"} hidden and file
                      changes rolled back. Sending a new message makes this permanent.
                    </span>
                    <button
                      type="button"
                      onClick={() => void restoreRevert()}
                      style={{
                        border: "1px solid var(--color-border)",
                        background: "transparent",
                        color: "inherit",
                        padding: "4px 10px",
                        "border-radius": "4px",
                        "font-size": "0.857rem",
                        cursor: "pointer",
                        "white-space": "nowrap",
                      }}
                    >
                      restore
                    </button>
                  </div>
                </div>
              </Show>

              <Composer />
            </div>

            <SlotViews
              slot="center"
              projectRoot={projectWorktree()}
              taskFileNames={taskFileNames()}
              recentTurnFileNames={recentTurnFileNames()}
              taskResultFiles={taskResultFiles()}
              recentResultFiles={recentResultFiles()}
            />
          </div>
        </div>

        <RightPane sessionID={params.id} />
      </div>
    </div>
  )
}

function closeTab(event: MouseEvent, close: () => void) {
  event.preventDefault()
  event.stopPropagation()
  close()
}

function CenterTabStrip(props: {
  chatTitle: string
  plan?: string
  notebook?: string
  onPlan: () => void
  onNotebook: (path: string) => void
  onCloseChat: () => void
}): JSX.Element {
  const active = centerTabs.active
  return (
    <div class="cs-center-tabs">
      <div class="cs-center-tabs-scroll thesis-scroll">
      <Show when={centerTabs.chatOpen()}>
        <div
          role="tab"
          class={`cs-center-tab${active() === "chat" ? " cs-center-tab-active" : ""}`}
          onClick={() => centerTabs.showChat()}
          title={props.chatTitle}
        >
          <span class="cs-center-tab-label">{props.chatTitle}</span>
          <button
            type="button"
            aria-label="close tab"
            class="cs-center-tab-close"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => closeTab(e, props.onCloseChat)}
          >
            <IconX size={11} strokeWidth={1.8} />
          </button>
        </div>
      </Show>
      <Show when={centerTabs.filesOpen()}>
        <div
          role="tab"
          class={`cs-center-tab${active() === "files" ? " cs-center-tab-active" : ""}`}
          onClick={() => centerTabs.showFiles()}
          title="Files"
        >
          <IconFolder size={14} strokeWidth={1.6} />
          <span class="cs-center-tab-label">Files</span>
          <button
            type="button"
            aria-label="close tab"
            class="cs-center-tab-close"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => closeTab(e, centerTabs.closeFiles)}
          >
            <IconX size={11} strokeWidth={1.8} />
          </button>
        </div>
      </Show>
      <For each={centerTabs.docs()}>
        {(doc) => (
          <div
            role="tab"
            class={`cs-center-tab${active() === doc.id ? " cs-center-tab-active" : ""}`}
            onClick={() => centerTabs.setActive(doc.id)}
            title={doc.name}
          >
            <IconFile size={12} strokeWidth={1.6} />
            <span class="cs-center-tab-label">{doc.name}</span>
            <button
              type="button"
              aria-label="close tab"
              class="cs-center-tab-close"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => closeTab(e, () => centerTabs.closeDoc(doc.id))}
            >
              <IconX size={11} strokeWidth={1.8} />
            </button>
          </div>
        )}
      </For>
      </div>
      <div class="cs-center-tab-actions">
        <Show when={props.plan}>
          {(status) => (
            <button
              type="button"
              class="cs-plan-chip"
              aria-label="plan"
              title={`Plan — ${status()}`}
              data-active={uiStore.rightPaneOpen() && uiStore.rightPaneTab() === "plan" ? "true" : undefined}
              onClick={() => props.onPlan()}
            >
              <IconTherefore size={16} strokeWidth={1.5} />
            </button>
          )}
        </Show>
        <Show when={props.notebook}>
          {(path) => (
            <button
              type="button"
              aria-label="notebook"
              title="Open the live kernel notebook — watch cells stream and run code in the agent's kernels"
              data-active={uiStore.rightPaneOpen() && uiStore.rightPaneTab() === path() ? "true" : undefined}
              onClick={() => props.onNotebook(path())}
            >
              <IconMatrix size={15} strokeWidth={1.5} />
            </button>
          )}
        </Show>
      </div>
    </div>
  )
}

function SessionsSidebar(props: {
  open: boolean
  groups: SidebarGroup[]
  activeId: string | undefined
  filesActive: boolean
  onToggle: () => void
  onBack: () => void
  onNew: () => void
  onCustomize: () => void
  onFiles: () => void
  onOpenProject: (worktree: string) => void
  onSelect: (worktree: string, id: string) => void
  onDelete: (id: string) => void
  onRenameProject: (name: string) => void
  onRenameSession: (sessionID: string, title: string) => void
}): JSX.Element {
  const language = useLanguage()
  const [search, setSearch] = createSignal("")
  const [collapsed, setCollapsed] = createSignal<Record<string, boolean>>({})

  const visible = createMemo(() => {
    const q = search().trim().toLowerCase()
    return props.groups
      .map((group) => {
        const nameHit = !q || group.name.toLowerCase().includes(q)
        const sessions = nameHit
          ? group.sessions
          : group.sessions.filter(
              (row) => row.title.toLowerCase().includes(q) || (row.session.title || "").toLowerCase().includes(q),
            )
        return { ...group, sessions }
      })
      .filter((group) => !q || group.sessions.length > 0 || group.name.toLowerCase().includes(q))
  })

  function isCollapsed(worktree: string) {
    return collapsed()[worktree] ?? false
  }

  function toggleGroup(worktree: string) {
    setCollapsed((prev) => ({ ...prev, [worktree]: !prev[worktree] }))
  }

  return (
    <aside
      class={`cs-sidebar thesis-scroll${props.open ? "" : " cs-sidebar-collapsed"}`}
      style={props.open ? { "--cs-sidebar-width": `${uiStore.sidebarWidth()}px` } : undefined}
    >
      <Show
        when={props.open}
        fallback={
          <div
            style={{
              display: "flex",
              "flex-direction": "column",
              "align-items": "center",
              gap: "8px",
              padding: "10px 0",
            }}
          >
            <button type="button" class="cs-sidebar-icon-btn" title="expand sidebar" onClick={props.onToggle}>
              <IconChevronLeft size={14} strokeWidth={1.6} style={{ transform: "rotate(180deg)" }} />
            </button>
            <button type="button" class="cs-sidebar-icon-btn" title="new session" onClick={props.onNew}>
              <IconPlus size={14} strokeWidth={2} />
            </button>
            <button type="button" class="cs-sidebar-icon-btn" title="settings" onClick={props.onCustomize}>
              <IconSettings size={14} strokeWidth={1.6} />
            </button>
            <button type="button" class="cs-sidebar-icon-btn" title="files" onClick={props.onFiles}>
              <IconFolder size={14} strokeWidth={1.6} />
            </button>
          </div>
        }
      >
        <div class="cs-sidebar-head">
          <button
            type="button"
            class="cs-sidebar-back"
            onClick={props.onBack}
            title={language.t("sidebar.backToWorkbench")}
          >
            <IconArrowLeft size={15} strokeWidth={1.5} />
            <span>{language.t("sidebar.backToWorkbench")}</span>
          </button>
          <button type="button" class="cs-sidebar-icon-btn" title="collapse sidebar" onClick={props.onToggle}>
            <IconChevronLeft size={14} strokeWidth={1.6} />
          </button>
        </div>

        <div class="cs-sidebar-search-wrap">
          <div class="cs-sidebar-search">
            <IconSearch size={14} strokeWidth={1.5} style={{ color: "var(--color-text-faint)", "flex-shrink": 0 }} />
            <input
              type="search"
              value={search()}
              placeholder={language.t("sidebar.searchAnalyses")}
              onInput={(e) => setSearch(e.currentTarget.value)}
            />
          </div>
        </div>

        <div class="cs-sidebar-scroll thesis-scroll">
          <button type="button" class="cs-sidebar-new-task" onClick={props.onNew}>
            <span class="cs-sidebar-new-task-icon">
              <IconPlus size={16} strokeWidth={1.75} />
            </span>
            <span>{language.t("sidebar.newSubTask")}</span>
          </button>

          <For each={visible()}>
            {(group) => (
              <div class="cs-sidebar-project-group">
                <div class="cs-sidebar-project-head" data-current={group.current ? "true" : "false"}>
                  <button
                    type="button"
                    class="cs-sidebar-project-toggle"
                    aria-label={isCollapsed(group.worktree) ? "expand" : "collapse"}
                    onClick={() => toggleGroup(group.worktree)}
                  >
                    <Show when={isCollapsed(group.worktree)} fallback={<IconChevronDown size={14} strokeWidth={1.5} />}>
                      <IconChevronRight size={14} strokeWidth={1.5} />
                    </Show>
                  </button>
                  <IconFolder
                    size={14}
                    strokeWidth={1.5}
                    style={{ color: "var(--color-text-faint)", "flex-shrink": 0 }}
                  />
                  <Show when={group.pinned}>
                    <span class="cs-star-amber">
                      <IconStarFilled size={13} strokeWidth={1.5} />
                    </span>
                  </Show>
                  <Show
                    when={group.current}
                    fallback={
                      <button
                        type="button"
                        class="cs-sidebar-project-name cs-sidebar-project-open"
                        title={group.name}
                        onClick={() => props.onOpenProject(group.worktree)}
                      >
                        {group.name}
                      </button>
                    }
                  >
                    <InlineRename
                      class="cs-sidebar-project-name cs-sidebar-project-open"
                      inputClass="cs-inline-rename-input cs-sidebar-project-name-input"
                      value={group.name}
                      title={language.t("common.rename")}
                      onSave={props.onRenameProject}
                      onActivate={() => props.onOpenProject(group.worktree)}
                    />
                  </Show>
                  <span class="cs-sidebar-project-count">{group.sessions.length}</span>
                </div>

                <Show when={!isCollapsed(group.worktree)}>
                  <div class="cs-sidebar-project-sessions">
                    <Show
                      when={group.sessions.length > 0}
                      fallback={
                        <div
                          style={{
                            padding: "12px 16px",
                            "font-family": FONT_SANS,
                            "font-size": "0.857rem",
                            color: "var(--color-text-faint)",
                          }}
                        >
                          {language.t("home.noRecentSessions")}
                        </div>
                      }
                    >
                      <For each={group.sessions}>
                        {(row) => (
                          <SessionRow
                            session={row.session}
                            title={row.title}
                            busy={row.busy}
                            readonly={!group.current}
                            active={group.current && props.activeId === row.session.id}
                            onSelect={() => props.onSelect(group.worktree, row.session.id)}
                            onDelete={() => props.onDelete(row.session.id)}
                            onRename={(title) => props.onRenameSession(row.session.id, title)}
                          />
                        )}
                      </For>
                    </Show>
                  </div>
                </Show>
              </div>
            )}
          </For>

          <button
            type="button"
            class="cs-sidebar-files-card"
            data-active={props.filesActive ? "true" : "false"}
            onClick={props.onFiles}
          >
            <span class="cs-sidebar-files-icon">
              <IconFolderOpen size={18} strokeWidth={1.75} />
            </span>
            <span class="cs-sidebar-files-title">{language.t("sidebar.files")}</span>
          </button>
        </div>
        <ColumnHandle
          edge="end"
          value={uiStore.sidebarWidth()}
          min={SIDEBAR_COL.min}
          max={SIDEBAR_COL.max}
          reserved={rightReserved}
          label={language.t("layout.resizeSidebar")}
          hint={language.t("layout.resizeHint")}
          onInput={uiStore.setSidebarWidth}
          onCommit={uiStore.commitSidebarWidth}
          onReset={uiStore.resetSidebarWidth}
        />
      </Show>
    </aside>
  )
}

function SessionRow(props: {
  session: SyncSession
  title?: string
  busy?: boolean
  readonly?: boolean
  active: boolean
  onSelect: () => void
  onDelete: () => void
  onRename: (title: string) => void
}): JSX.Element {
  const sync = useSync()
  const language = useLanguage()
  const displayTitle = createMemo(
    () => props.title ?? getSessionDisplayTitle(props.session, sync.data.message[props.session.id], sync.data.part),
  )
  const fullTitle = createMemo(
    () => firstUserMessageText(sync.data.message[props.session.id], sync.data.part) || displayTitle(),
  )

  return (
    <div
      role="button"
      tabindex="0"
      data-session-id={props.session.id}
      class={`cs-session-row${props.active ? " cs-session-row-active" : ""}`}
      title={fullTitle()}
      aria-label={`${displayTitle()}：${fullTitle()}`}
      onClick={props.onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault()
          props.onSelect()
        }
      }}
    >
      <SessionStatusLight sessionID={props.session.id} running={props.readonly ? props.busy : undefined} />
      <Show when={!props.readonly} fallback={<span class="cs-session-title">{displayTitle()}</span>}>
        <InlineRename
          class="cs-session-title"
          inputClass="cs-inline-rename-input cs-session-title-input"
          value={displayTitle()}
          title={language.t("common.rename")}
          onSave={props.onRename}
        />
      </Show>
      <Show when={!props.readonly}>
        <button
          type="button"
          class="cs-session-delete"
          title="delete session"
          aria-label="delete session"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation()
            e.preventDefault()
            props.onDelete()
          }}
        >
          <IconTrash size={11} strokeWidth={1.5} />
        </button>
      </Show>
    </div>
  )
}

function launchWelcome(prompt: string) {
  uiStore.setPrefillSend(false)
  uiStore.setPrefill(prompt)
}

function ChatWelcome(props: {
  domain: ReturnType<typeof projectDomainId>
  name: string
  projects: Array<{ worktree: string; name: string; current: boolean }>
  onOpenProject: (worktree: string) => void
}): JSX.Element {
  const models = useModels()
  const dialog = useDialog()
  const language = useLanguage()
  const [switchOpen, setSwitchOpen] = createSignal(false)
  createEffect(() => {
    if (centerTabs.active() !== "chat") setSwitchOpen(false)
  })
  const noModel = () => models.list().length === 0
  const flow = () => props.domain === "imc"
  const prompts = createMemo(() => {
    if (flow()) return []
    const id = props.domain
    return ([1, 2, 3] as const).map((n) => language.t(`chat.welcome.${id}.${n}`))
  })
  return (
    <div class="thesis-fade-in cs-chat-welcome">
      <div class="cs-chat-welcome-hero">
        <div class="cs-chat-welcome-mark">
          <AgentIcon
            size={76}
            style={{
              "--agent-icon-ink": "var(--color-text)",
              "--agent-icon-paper": "var(--color-surface-solid, var(--color-bg))",
            }}
          />
        </div>
        <div class="cs-chat-welcome-copy">
          <h2 class="cs-chat-welcome-title">
            {language.t("chat.welcome.title.before")}
            <DropdownMenu open={switchOpen()} onOpenChange={setSwitchOpen} modal={false}>
              <DropdownMenu.Trigger
                class="cs-chat-welcome-name"
                title={language.t("chat.welcome.switchProject")}
                aria-label={language.t("chat.welcome.switchProject")}
              >
                <span class="cs-chat-welcome-name-text">{props.name}</span>
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content
                  class="cs-menu cs-chat-welcome-project-menu"
                  onCloseAutoFocus={(event) => event.preventDefault()}
                >
                  <For each={props.projects}>
                    {(project) => (
                      <DropdownMenu.Item
                        class="cs-menu-item"
                        data-current={project.current ? "true" : "false"}
                        onSelect={() => {
                          if (!project.current) props.onOpenProject(project.worktree)
                        }}
                      >
                        {project.name}
                      </DropdownMenu.Item>
                    )}
                  </For>
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu>
            {language.t("chat.welcome.title.after")}
          </h2>
        </div>
      </div>

      <Show when={noModel()}>
        <div class="cs-chat-welcome-setup">
          <p>{language.t("chat.welcome.noModel")}</p>
          <button type="button" class="cs-chat-welcome-setup-btn" onClick={() => openSetupDialog(dialog)}>
            {language.t("chat.welcome.setup")}
          </button>
        </div>
      </Show>

      <div class="cs-chat-welcome-prompts">
        <Show when={flow()}>
          <section class="cs-chat-welcome-flow">
            <div class="cs-chat-welcome-flow-head">
              <span class="cs-chat-welcome-flow-title">{language.t("chat.welcome.imc.flow.title")}</span>
            </div>
            <div class="cs-chat-welcome-flow-grid">
              <For each={IMC_STEPS}>
                {(step, index) => {
                  const Glyph = step[3]
                  return (
                    <button
                      type="button"
                      class="cs-chat-welcome-flow-card"
                      onClick={() => launchWelcome(language.t(step[2]))}
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
          </section>
        </Show>
        <For each={prompts()}>
          {(p) => (
            <button type="button" class="cs-chat-welcome-prompt" onClick={() => uiStore.setPrefill(p)}>
              <span class="cs-chat-welcome-prompt-arrow">→</span>
              <span>{p}</span>
            </button>
          )}
        </For>
      </div>
    </div>
  )
}

function ArtifactImageThumb(props: { directory: string; file: ResultFile }): JSX.Element {
  const sdk = useSDK()
  const [data] = createResource(
    () => [props.directory, props.file.path] as const,
    async ([directory, path]) => {
      const res: any = await sdk.client.file.read({ directory, path })
      return (res?.data ?? res) as ArtifactData
    },
  )
  const src = () => artifactImageUrl(data(), props.file.mime)
  return (
    <Show when={src()} fallback={<div data-slot="session-turn-result-file-preview-loading">loading preview…</div>}>
      <img src={src()} alt={props.file.name} loading="lazy" decoding="async" />
    </Show>
  )
}

function ArtifactTableThumb(props: { directory: string; file: ResultFile }): JSX.Element {
  const sdk = useSDK()
  const [data] = createResource(
    () => [props.directory, props.file.path] as const,
    async ([directory, path]) => {
      const res: any = await sdk.client.file.read({ directory, path })
      return (res?.data ?? res) as ArtifactData
    },
  )
  const rows = createMemo(() => artifactTable(data()?.content ?? "", props.file.name))
  const summary = createMemo(() => {
    const content = data()?.content ?? ""
    const total = content.split(/\r?\n/).filter((line) => line.trim()).length
    const columns = rows()[0]?.length ?? 0
    return `${Math.max(0, total - 1)} rows · ${columns} columns`
  })
  return (
    <Show
      when={rows().length > 0}
      fallback={<div data-slot="session-turn-result-table-empty">{props.file.kind.toUpperCase()} · 加载预览中</div>}
    >
      <div data-slot="session-turn-result-table">
        <div data-slot="session-turn-result-table-summary">{summary()}</div>
        <table>
          <thead>
            <tr>
              <For each={rows()[0] ?? []}>{(cell) => <th>{cell}</th>}</For>
            </tr>
          </thead>
          <tbody>
            <For each={rows().slice(1)}>
              {(row) => (
                <tr>
                  <For each={row}>{(cell) => <td>{cell}</td>}</For>
                </tr>
              )}
            </For>
          </tbody>
        </table>
      </div>
    </Show>
  )
}

const pdfThumbCache = new Map<string, { url: string; w: number; h: number }>()
let pdfThumbQueue: Promise<void> = Promise.resolve()

function enqueuePdfThumb(work: () => Promise<void>) {
  pdfThumbQueue = pdfThumbQueue.then(work, work)
  return pdfThumbQueue
}

function paintPdfThumb(canvas: HTMLCanvasElement, thumb: { url: string; w: number; h: number }) {
  canvas.width = thumb.w
  canvas.height = thumb.h
  canvas.style.width = `${Math.round(thumb.w / (window.devicePixelRatio || 1))}px`
  canvas.style.height = `${Math.round(thumb.h / (window.devicePixelRatio || 1))}px`
  const image = new Image()
  image.onload = () => {
    const context = canvas.getContext("2d")
    if (!context) return
    context.drawImage(image, 0, 0)
  }
  image.src = thumb.url
}

function ArtifactPdfThumb(props: { directory: string; file: ResultFile }): JSX.Element {
  const sdk = useSDK()
  const [visible, setVisible] = createSignal(false)
  let canvas!: HTMLCanvasElement

  onMount(() => {
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return
        setVisible(true)
        io.disconnect()
      },
      { rootMargin: "160px" },
    )
    io.observe(canvas)
    onCleanup(() => io.disconnect())
  })

  createEffect(() => {
    if (!visible()) return
    const directory = props.directory
    const path = props.file.path
    const key = `${directory}::${path}`
    let disposed = false

    void enqueuePdfThumb(async () => {
      if (disposed) return
      const hit = pdfThumbCache.get(key)
      if (hit) {
        paintPdfThumb(canvas, hit)
        return
      }
      try {
        const res: unknown = await sdk.client.file.read({ directory, path })
        if (disposed) return
        const file = ((res as { data?: ArtifactData })?.data ?? res) as ArtifactData
        if (!file?.content || file.encoding !== "base64") return
        const pdfjs = (await import("pdfjs-dist")) as unknown as {
          GlobalWorkerOptions: { workerSrc: string }
          getDocument(source: { data: Uint8Array }): {
            promise: Promise<{
              getPage(page: number): Promise<{
                getViewport(options: { scale: number }): { width: number; height: number }
                render(options: {
                  canvasContext: CanvasRenderingContext2D
                  viewport: { width: number; height: number }
                }): { promise: Promise<void>; cancel(): void }
              }>
              destroy(): Promise<void>
            }>
          }
        }
        if (!pdfjs.GlobalWorkerOptions.workerSrc) {
          pdfjs.GlobalWorkerOptions.workerSrc = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default
        }
        const bytes = Uint8Array.from(atob(file.content), (char) => char.charCodeAt(0))
        const loaded = await pdfjs.getDocument({ data: bytes }).promise
        if (disposed) {
          await loaded.destroy()
          return
        }
        const page = await loaded.getPage(1)
        if (disposed) {
          await loaded.destroy()
          return
        }
        const viewport = page.getViewport({ scale: 0.28 })
        const ratio = window.devicePixelRatio || 1
        canvas.width = Math.floor(viewport.width * ratio)
        canvas.height = Math.floor(viewport.height * ratio)
        canvas.style.width = `${Math.floor(viewport.width)}px`
        canvas.style.height = `${Math.floor(viewport.height)}px`
        const context = canvas.getContext("2d")
        if (!context) {
          await loaded.destroy()
          return
        }
        context.setTransform(ratio, 0, 0, ratio, 0, 0)
        await page.render({ canvasContext: context, viewport }).promise
        if (pdfThumbCache.size > 24) {
          const first = pdfThumbCache.keys().next().value
          if (first) pdfThumbCache.delete(first)
        }
        pdfThumbCache.set(key, {
          url: canvas.toDataURL("image/jpeg", 0.72),
          w: canvas.width,
          h: canvas.height,
        })
        await loaded.destroy()
      } catch {
        // The generic file preview remains available when a PDF cannot be rasterized.
      }
    })

    onCleanup(() => {
      disposed = true
    })
  })

  return <canvas data-slot="session-turn-result-pdf-preview" ref={canvas} aria-label={`${props.file.name} 首页预览`} />
}

