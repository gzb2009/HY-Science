import { createStore, reconcile } from "solid-js/store"
import { createEffect, createMemo, onCleanup } from "solid-js"
import { createSimpleContext } from "@hysci/ui/context"
import { persisted } from "@/utils/persist"

export interface NotificationSettings {
  agent: boolean
  permissions: boolean
  errors: boolean
}

export interface SoundSettings {
  agent: string
  permissions: string
  errors: string
}

export type MotionPref = "system" | "on" | "off"

export interface AppearanceSettings {
  fontSize: number
  codeFontSize: number
  font: string
  uiFont: string
  toolDensity: number
  codeWrap: boolean
  themedDiff: boolean
  hue: number
  intensity: number
  reduceTransparency: boolean
  fontSmoothing: boolean
  followContrast: boolean
  reduceMotion: MotionPref
}

export interface Settings {
  general: {
    autoSave: boolean
    releaseNotes: boolean
  }
  updates: {
    startup: boolean
  }
  appearance: AppearanceSettings
  keybinds: Record<string, string>
  permissions: {
    autoApprove: boolean
  }
  notifications: NotificationSettings
  sounds: SoundSettings
  ui: {
    showChangesView: boolean
  }
}

const defaultSettings: Settings = {
  general: {
    autoSave: true,
    releaseNotes: true,
  },
  updates: {
    startup: true,
  },
  appearance: {
    fontSize: 14,
    codeFontSize: 12,
    font: "jetbrains-mono",
    uiFont: "system",
    toolDensity: 100,
    codeWrap: false,
    themedDiff: true,
    hue: 210,
    intensity: 0,
    reduceTransparency: false,
    fontSmoothing: true,
    followContrast: true,
    reduceMotion: "system",
  },
  keybinds: {},
  permissions: {
    autoApprove: false,
  },
  notifications: {
    agent: true,
    permissions: true,
    errors: false,
  },
  sounds: {
    // Silent by default — UI sounds are opt-in. ("" → soundSrc() returns
    // undefined → playSound() is a no-op.) The agent/error sound firing on
    // click-triggered notifications was jarring; enable per-sound in Settings.
    agent: "",
    permissions: "",
    errors: "",
  },
  ui: {
    showChangesView: false,
  },
}

const monoFallback =
  'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace'

const monoFonts: Record<string, string> = {
  system: monoFallback,
  "ibm-plex-mono": `"IBM Plex Mono", "IBM Plex Mono Fallback", ${monoFallback}`,
  "cascadia-code": `"Cascadia Code Nerd Font", "Cascadia Code NF", "Cascadia Mono NF", "IBM Plex Mono", "IBM Plex Mono Fallback", ${monoFallback}`,
  "fira-code": `"Fira Code Nerd Font", "FiraMono Nerd Font", "FiraMono Nerd Font Mono", "IBM Plex Mono", "IBM Plex Mono Fallback", ${monoFallback}`,
  hack: `"Hack Nerd Font", "Hack Nerd Font Mono", "IBM Plex Mono", "IBM Plex Mono Fallback", ${monoFallback}`,
  inconsolata: `"Inconsolata Nerd Font", "Inconsolata Nerd Font Mono","IBM Plex Mono", "IBM Plex Mono Fallback", ${monoFallback}`,
  "intel-one-mono": `"Intel One Mono Nerd Font", "IntoneMono Nerd Font", "IntoneMono Nerd Font Mono", "IBM Plex Mono", "IBM Plex Mono Fallback", ${monoFallback}`,
  iosevka: `"Iosevka Nerd Font", "Iosevka Nerd Font Mono", "IBM Plex Mono", "IBM Plex Mono Fallback", ${monoFallback}`,
  "jetbrains-mono": `"JetBrains Mono Nerd Font", "JetBrainsMono Nerd Font Mono", "JetBrainsMonoNL Nerd Font", "JetBrainsMonoNL Nerd Font Mono", "IBM Plex Mono", "IBM Plex Mono Fallback", ${monoFallback}`,
  "meslo-lgs": `"Meslo LGS Nerd Font", "MesloLGS Nerd Font", "MesloLGM Nerd Font", "IBM Plex Mono", "IBM Plex Mono Fallback", ${monoFallback}`,
  "roboto-mono": `"Roboto Mono Nerd Font", "RobotoMono Nerd Font", "RobotoMono Nerd Font Mono", "IBM Plex Mono", "IBM Plex Mono Fallback", ${monoFallback}`,
  "source-code-pro": `"Source Code Pro Nerd Font", "SauceCodePro Nerd Font", "SauceCodePro Nerd Font Mono", "IBM Plex Mono", "IBM Plex Mono Fallback", ${monoFallback}`,
  "ubuntu-mono": `"Ubuntu Mono Nerd Font", "UbuntuMono Nerd Font", "UbuntuMono Nerd Font Mono", "IBM Plex Mono", "IBM Plex Mono Fallback", ${monoFallback}`,
}

function quoted(name: string, fallback: string) {
  return `"${name.replaceAll('"', "")}", ${fallback}`
}

export function monoFontFamily(font: string | undefined) {
  const key = font ?? defaultSettings.appearance.font
  const known = monoFonts[key]
  if (known) return known
  if (!key || key === "system") return monoFallback
  return quoted(key, monoFallback)
}

export function uiFontStack(font: string | undefined) {
  if (!font || font === "system") return ""
  const known = uiFonts[font]
  if (known) return known
  return quoted(font, '"PingFang SC", "Hiragino Sans GB", sans-serif')
}

export const FONT_SIZE_PRESETS = [12, 14, 16, 18] as const
const UI_FONT_MIN = 10
const UI_FONT_MAX = 24
const CODE_FONT_MIN = 10
const CODE_FONT_MAX = 20
const FONT_SIZE_BASE = defaultSettings.appearance.fontSize
const CODE_FONT_BASE = defaultSettings.appearance.codeFontSize

export const UI_FONT_OPTIONS = ["system", "pingfang", "songti", "arial", "rounded"] as const

const uiFonts: Record<string, string> = {
  pingfang: '"PingFang SC", "Hiragino Sans GB", "Noto Sans CJK SC", sans-serif',
  songti: '"Songti SC", "Songti TC", "Noto Serif CJK SC", Georgia, serif',
  arial: "Arial, Helvetica, sans-serif",
  rounded: '"Arial Rounded MT Bold", "Arial Rounded MT", Arial, sans-serif',
}

export function clampFontSize(value: number) {
  if (!Number.isFinite(value)) return FONT_SIZE_BASE
  return Math.min(UI_FONT_MAX, Math.max(UI_FONT_MIN, Math.round(value)))
}

export function clampCodeSize(value: number) {
  if (!Number.isFinite(value)) return CODE_FONT_BASE
  return Math.min(CODE_FONT_MAX, Math.max(CODE_FONT_MIN, Math.round(value)))
}

function clampUnit(value: number, max: number, fallback: number) {
  if (!Number.isFinite(value)) return fallback
  return Math.min(max, Math.max(0, Math.round(value)))
}

function motionPref(value: string | undefined): MotionPref {
  if (value === "on" || value === "off" || value === "system") return value
  return "system"
}

function densityBand(value: number) {
  if (value < 34) return "compact"
  if (value < 67) return "balanced"
  return "detailed"
}

const DIFF_WASH = [
  "--surface-diff-add-base",
  "--surface-diff-add-weak",
  "--surface-diff-add-weaker",
  "--surface-diff-add-strong",
  "--surface-diff-delete-base",
  "--surface-diff-delete-weak",
  "--surface-diff-delete-weaker",
  "--surface-diff-delete-strong",
] as const

function applyAppearance(raw: Partial<AppearanceSettings> | undefined) {
  if (typeof document === "undefined") return
  const base = defaultSettings.appearance
  const root = document.documentElement
  const fontSize = clampFontSize(raw?.fontSize ?? base.fontSize)
  const codeSize = clampCodeSize(raw?.codeFontSize ?? base.codeFontSize)
  const hue = clampUnit(raw?.hue ?? base.hue, 360, base.hue)
  const intensity = clampUnit(raw?.intensity ?? base.intensity, 100, base.intensity)
  const density = clampUnit(raw?.toolDensity ?? base.toolDensity, 100, base.toolDensity)
  const face = uiFontStack(raw?.uiFont ?? base.uiFont)
  root.style.setProperty("--font-family-mono", monoFontFamily(raw?.font))
  root.style.setProperty("--app-font-size", `${fontSize}px`)
  root.style.setProperty("--code-font-size", `${codeSize}px`)
  root.style.fontSize = `${Math.round((fontSize / FONT_SIZE_BASE) * 16)}px`
  for (const name of SCALED_TYPE) root.style.removeProperty(name)
  if (face) {
    root.style.setProperty("--font-sans", face)
    root.style.setProperty("--font-family-sans", face)
  } else {
    root.style.removeProperty("--font-sans")
    root.style.removeProperty("--font-family-sans")
  }
  root.style.setProperty("--appearance-hue", String(hue))
  root.style.setProperty("--appearance-intensity", String(intensity))
  root.dataset.codeWrap = raw?.codeWrap ? "true" : "false"
  root.dataset.themedDiff = raw?.themedDiff === false ? "false" : "true"
  root.dataset.reduceTransparency = raw?.reduceTransparency ? "true" : "false"
  root.dataset.fontSmooth = raw?.fontSmoothing === false ? "false" : "true"
  root.dataset.reduceMotion = motionPref(raw?.reduceMotion)
  root.dataset.toolDensity = densityBand(density)
  root.dataset.tint = intensity > 0 ? "true" : "false"
  for (const name of DIFF_WASH) {
    if (raw?.themedDiff === false) root.style.setProperty(name, "transparent")
    else root.style.removeProperty(name)
  }
}

const SCALED_TYPE = [
  "--font-size-2x-small",
  "--font-size-x-small",
  "--font-size-small",
  "--font-size-base",
  "--font-size-large",
  "--font-size-x-large",
  "--text-2xs",
  "--text-xs",
  "--text-sm",
  "--text-base",
  "--text-md",
  "--text-lg",
  "--text-xl",
  "--text-2xl",
]

export const { use: useSettings, provider: SettingsProvider } = createSimpleContext({
  name: "Settings",
  init: () => {
    const [store, setStore, _, ready] = persisted("settings.v3", createStore<Settings>(defaultSettings))

    createEffect(() => {
      const raw = store.appearance
      applyAppearance({
        fontSize: raw?.fontSize,
        codeFontSize: raw?.codeFontSize,
        font: raw?.font,
        uiFont: raw?.uiFont,
        toolDensity: raw?.toolDensity,
        codeWrap: raw?.codeWrap,
        themedDiff: raw?.themedDiff,
        hue: raw?.hue,
        intensity: raw?.intensity,
        reduceTransparency: raw?.reduceTransparency,
        fontSmoothing: raw?.fontSmoothing,
        reduceMotion: raw?.reduceMotion,
      })
    })

    createEffect(() => {
      const follow = store.appearance?.followContrast ?? defaultSettings.appearance.followContrast
      const query = typeof window === "undefined" ? undefined : window.matchMedia("(prefers-contrast: more)")
      const paint = () => {
        document.documentElement.dataset.highContrast = follow && query?.matches ? "true" : "false"
      }
      paint()
      query?.addEventListener("change", paint)
      onCleanup(() => query?.removeEventListener("change", paint))
    })

    return {
      ready,
      get current() {
        return store
      },
      general: {
        autoSave: createMemo(() => store.general?.autoSave ?? defaultSettings.general.autoSave),
        setAutoSave(value: boolean) {
          setStore("general", "autoSave", value)
        },
        releaseNotes: createMemo(() => store.general?.releaseNotes ?? defaultSettings.general.releaseNotes),
        setReleaseNotes(value: boolean) {
          setStore("general", "releaseNotes", value)
        },
      },
      updates: {
        startup: createMemo(() => store.updates?.startup ?? defaultSettings.updates.startup),
        setStartup(value: boolean) {
          setStore("updates", "startup", value)
        },
      },
      appearance: {
        fontSize: createMemo(() => clampFontSize(store.appearance?.fontSize ?? defaultSettings.appearance.fontSize)),
        setFontSize(value: number) {
          setStore("appearance", "fontSize", clampFontSize(value))
        },
        codeFontSize: createMemo(() =>
          clampCodeSize(store.appearance?.codeFontSize ?? defaultSettings.appearance.codeFontSize),
        ),
        setCodeFontSize(value: number) {
          setStore("appearance", "codeFontSize", clampCodeSize(value))
        },
        font: createMemo(() => store.appearance?.font ?? defaultSettings.appearance.font),
        setFont(value: string) {
          setStore("appearance", "font", value)
        },
        uiFont: createMemo(() => store.appearance?.uiFont ?? defaultSettings.appearance.uiFont),
        setUiFont(value: string) {
          setStore("appearance", "uiFont", value)
        },
        toolDensity: createMemo(() =>
          clampUnit(store.appearance?.toolDensity ?? defaultSettings.appearance.toolDensity, 100, 100),
        ),
        setToolDensity(value: number) {
          setStore("appearance", "toolDensity", clampUnit(value, 100, defaultSettings.appearance.toolDensity))
        },
        codeWrap: createMemo(() => store.appearance?.codeWrap ?? defaultSettings.appearance.codeWrap),
        setCodeWrap(value: boolean) {
          setStore("appearance", "codeWrap", value)
        },
        themedDiff: createMemo(() => store.appearance?.themedDiff ?? defaultSettings.appearance.themedDiff),
        setThemedDiff(value: boolean) {
          setStore("appearance", "themedDiff", value)
        },
        hue: createMemo(() => clampUnit(store.appearance?.hue ?? defaultSettings.appearance.hue, 360, 210)),
        setHue(value: number) {
          setStore("appearance", "hue", clampUnit(value, 360, defaultSettings.appearance.hue))
        },
        intensity: createMemo(() =>
          clampUnit(store.appearance?.intensity ?? defaultSettings.appearance.intensity, 100, 0),
        ),
        setIntensity(value: number) {
          setStore("appearance", "intensity", clampUnit(value, 100, defaultSettings.appearance.intensity))
        },
        reduceTransparency: createMemo(
          () => store.appearance?.reduceTransparency ?? defaultSettings.appearance.reduceTransparency,
        ),
        setReduceTransparency(value: boolean) {
          setStore("appearance", "reduceTransparency", value)
        },
        fontSmoothing: createMemo(() => store.appearance?.fontSmoothing ?? defaultSettings.appearance.fontSmoothing),
        setFontSmoothing(value: boolean) {
          setStore("appearance", "fontSmoothing", value)
        },
        followContrast: createMemo(() => store.appearance?.followContrast ?? defaultSettings.appearance.followContrast),
        setFollowContrast(value: boolean) {
          setStore("appearance", "followContrast", value)
        },
        reduceMotion: createMemo(() => motionPref(store.appearance?.reduceMotion)),
        setReduceMotion(value: MotionPref) {
          setStore("appearance", "reduceMotion", value)
        },
      },
      keybinds: {
        get: (action: string) => store.keybinds?.[action],
        set(action: string, keybind: string) {
          setStore("keybinds", action, keybind)
        },
        reset(action: string) {
          setStore("keybinds", action, undefined!)
        },
        resetAll() {
          setStore("keybinds", reconcile({}))
        },
      },
      permissions: {
        autoApprove: createMemo(() => store.permissions?.autoApprove ?? defaultSettings.permissions.autoApprove),
        setAutoApprove(value: boolean) {
          setStore("permissions", "autoApprove", value)
        },
      },
      notifications: {
        agent: createMemo(() => store.notifications?.agent ?? defaultSettings.notifications.agent),
        setAgent(value: boolean) {
          setStore("notifications", "agent", value)
        },
        permissions: createMemo(() => store.notifications?.permissions ?? defaultSettings.notifications.permissions),
        setPermissions(value: boolean) {
          setStore("notifications", "permissions", value)
        },
        errors: createMemo(() => store.notifications?.errors ?? defaultSettings.notifications.errors),
        setErrors(value: boolean) {
          setStore("notifications", "errors", value)
        },
      },
      sounds: {
        agent: createMemo(() => store.sounds?.agent ?? defaultSettings.sounds.agent),
        setAgent(value: string) {
          setStore("sounds", "agent", value)
        },
        permissions: createMemo(() => store.sounds?.permissions ?? defaultSettings.sounds.permissions),
        setPermissions(value: string) {
          setStore("sounds", "permissions", value)
        },
        errors: createMemo(() => store.sounds?.errors ?? defaultSettings.sounds.errors),
        setErrors(value: string) {
          setStore("sounds", "errors", value)
        },
      },
      ui: {
        showChangesView: createMemo(() => store.ui?.showChangesView ?? defaultSettings.ui.showChangesView),
        setShowChangesView(value: boolean) {
          setStore("ui", "showChangesView", value)
        },
      },
    }
  },
})
