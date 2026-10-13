import { Component, For, Show, createEffect, createMemo, createSignal, onCleanup, onMount, type JSX } from "solid-js"
import { Portal } from "solid-js/web"
import { Select } from "@hysci/ui/select"
import { Switch } from "@hysci/ui/switch"
import { useTheme, type ColorScheme } from "@hysci/ui/theme"
import { useLanguage } from "@/context/language"
import { useSettings, uiFontStack, monoFontFamily, type MotionPref } from "@/context/settings"
import { installedFonts, readLocalFonts } from "./machine-fonts"

export default function Appearance() {
  const language = useLanguage()
  return (
    <div class="flex flex-col h-full overflow-y-auto no-scrollbar px-4 pb-10 sm:px-8">
      <div class="sticky top-0 z-10 bg-[linear-gradient(to_bottom,var(--surface-raised-stronger-non-alpha)_calc(100%_-_24px),transparent)]">
        <div class="flex flex-col gap-1 pt-8 pb-8 max-w-[760px]">
          <h2 class="text-16-medium text-text-strong">{language.t("settings.appearance.page.title")}</h2>
          <p class="text-13-regular text-text-weak">{language.t("settings.appearance.page.description")}</p>
        </div>
      </div>
      <AppearanceBody />
    </div>
  )
}

const AppearanceBody: Component = () => {
  const theme = useTheme()
  const language = useLanguage()
  const settings = useSettings()
  const [fonts, setFonts] = createSignal<string[]>([])

  onMount(() => {
    setFonts(installedFonts())
    void readLocalFonts().then((names) => {
      if (names.length > 0) setFonts(names)
    })
  })

  const refreshFonts = () => {
    void readLocalFonts().then((names) => {
      if (names.length > 0) setFonts(names)
    })
  }

  const colorSchemeOptions = createMemo((): { value: ColorScheme; label: string }[] => [
    { value: "system", label: language.t("theme.scheme.system") },
    { value: "light", label: language.t("theme.scheme.light") },
    { value: "dark", label: language.t("theme.scheme.dark") },
  ])

  const paletteOptions = createMemo(() =>
    Object.entries(theme.themes()).map(([id, def]) => ({
      value: id,
      label: def.name ?? id,
    })),
  )

  const motionOptions = [
    { value: "system" as MotionPref, label: "settings.appearance.motion.system" },
    { value: "on" as MotionPref, label: "settings.appearance.motion.on" },
    { value: "off" as MotionPref, label: "settings.appearance.motion.off" },
  ] as const

  const sampleFace = () => uiFontStack(settings.appearance.uiFont()) || "var(--font-family-sans)"
  const sampleStyle = (): JSX.CSSProperties => ({
    "font-family": sampleFace(),
    "font-size": "var(--app-font-size, 14px)",
  })
  const swatchStyle = (): JSX.CSSProperties => ({
    background: `hsl(${settings.appearance.hue()} 28% 72%)`,
  })

  return (
    <div class="flex flex-col gap-8 w-full max-w-[760px]">
      <Card title={language.t("settings.appearance.theme.title")}>
        <Row
          title={language.t("settings.general.row.theme.title")}
          description={language.t("settings.appearance.theme.description")}
        >
          <Select
            options={colorSchemeOptions()}
            current={colorSchemeOptions().find((o) => o.value === theme.colorScheme())}
            value={(o) => o.value}
            label={(o) => o.label}
            onHighlight={(option) => option && theme.previewColorScheme(option.value)}
            onOpenChange={(open) => {
              if (!open) theme.cancelPreview()
            }}
            onSelect={(option) => {
              if (option) theme.setColorScheme(option.value)
            }}
            variant="secondary"
            size="small"
            triggerVariant="settings"
          />
        </Row>
        <Row
          title={language.t("settings.appearance.palette.title")}
          description={language.t("settings.appearance.palette.description")}
        >
          <Select
            options={paletteOptions()}
            current={paletteOptions().find((o) => o.value === theme.themeId())}
            value={(o) => o.value}
            label={(o) => o.label}
            onHighlight={(option) => option && theme.previewTheme(option.value)}
            onOpenChange={(open) => {
              if (!open) theme.cancelPreview()
            }}
            onSelect={(option) => {
              if (option) theme.setTheme(option.value)
            }}
            variant="secondary"
            size="small"
            triggerVariant="settings"
          />
        </Row>
      </Card>

      <Card title={language.t("settings.appearance.agent.title")}>
        <Row
          title={language.t("settings.appearance.density.title")}
          description={language.t("settings.appearance.density.description")}
        >
          <div class="cs-slider-field">
            <input
              class="cs-appearance-slider"
              type="range"
              min="0"
              max="100"
              value={settings.appearance.toolDensity()}
              aria-label={language.t("settings.appearance.density.title")}
              onInput={(event) => settings.appearance.setToolDensity(Number(event.currentTarget.value))}
            />
            <div class="cs-slider-caption">
              <span>{language.t("settings.appearance.density.compact")}</span>
              <span>{language.t("settings.appearance.density.detailed")}</span>
            </div>
          </div>
        </Row>
        <Row
          title={language.t("settings.appearance.wrap.title")}
          description={language.t("settings.appearance.wrap.description")}
        >
          <Switch
            checked={settings.appearance.codeWrap()}
            onChange={(checked) => settings.appearance.setCodeWrap(checked)}
          />
        </Row>
        <Row
          title={language.t("settings.appearance.diff.title")}
          description={language.t("settings.appearance.diff.description")}
        >
          <Switch
            checked={settings.appearance.themedDiff()}
            onChange={(checked) => settings.appearance.setThemedDiff(checked)}
          />
        </Row>
      </Card>

      <Card title={language.t("settings.appearance.color.title")}>
        <Row title={language.t("settings.appearance.hue.title")} description={language.t("settings.appearance.hue.description")}>
          <div class="cs-slider-inline">
            <input
              class="cs-appearance-slider"
              type="range"
              min="0"
              max="360"
              value={settings.appearance.hue()}
              aria-label={language.t("settings.appearance.hue.title")}
              onInput={(event) => settings.appearance.setHue(Number(event.currentTarget.value))}
            />
            <span class="cs-hue-swatch" style={swatchStyle()} />
          </div>
        </Row>
        <Row
          title={language.t("settings.appearance.intensity.title")}
          description={language.t("settings.appearance.intensity.description")}
        >
          <div class="cs-slider-inline">
            <input
              class="cs-appearance-slider"
              type="range"
              min="0"
              max="100"
              value={settings.appearance.intensity()}
              aria-label={language.t("settings.appearance.intensity.title")}
              onInput={(event) => settings.appearance.setIntensity(Number(event.currentTarget.value))}
            />
            <span class="cs-slider-percent">{settings.appearance.intensity()}%</span>
          </div>
        </Row>
        <Row
          title={language.t("settings.appearance.opaque.title")}
          description={language.t("settings.appearance.opaque.description")}
        >
          <Switch
            checked={settings.appearance.reduceTransparency()}
            onChange={(checked) => settings.appearance.setReduceTransparency(checked)}
          />
        </Row>
      </Card>

      <Card title={language.t("settings.appearance.type.title")}>
        <Row
          title={language.t("settings.appearance.uiSize.title")}
          description={language.t("settings.appearance.uiSize.description")}
        >
          <Stepper
            value={settings.appearance.fontSize()}
            min={10}
            max={24}
            reset={14}
            resetLabel={language.t("settings.appearance.uiSize.reset")}
            onChange={(value) => settings.appearance.setFontSize(value)}
          />
        </Row>
        <Row
          title={language.t("settings.appearance.codeSize.title")}
          description={language.t("settings.appearance.codeSize.description")}
        >
          <Stepper
            value={settings.appearance.codeFontSize()}
            min={10}
            max={20}
            reset={12}
            resetLabel={language.t("settings.appearance.codeSize.reset")}
            onChange={(value) => settings.appearance.setCodeFontSize(value)}
          />
        </Row>
        <Row
          title={language.t("settings.appearance.uiFont.title")}
          description={language.t("settings.appearance.uiFont.description")}
        >
          <FontPicker
            value={settings.appearance.uiFont()}
            fonts={fonts()}
            systemLabel={language.t("settings.appearance.uiFont.system")}
            searchLabel={language.t("settings.appearance.font.search")}
            emptyLabel={language.t("settings.appearance.font.empty")}
            onOpen={refreshFonts}
            onChange={(value) => settings.appearance.setUiFont(value)}
          />
        </Row>
        <Row
          title={language.t("settings.appearance.codeFont.title")}
          description={language.t("settings.appearance.codeFont.description")}
        >
          <FontPicker
            value={settings.appearance.font()}
            fonts={fonts()}
            systemLabel={language.t("font.option.systemMono")}
            searchLabel={language.t("settings.appearance.font.search")}
            emptyLabel={language.t("settings.appearance.font.empty")}
            onOpen={refreshFonts}
            onChange={(value) => settings.appearance.setFont(value)}
          />
        </Row>
        <p class="cs-font-sample" style={sampleStyle()}>
          {language.t("settings.appearance.font.sample")}
        </p>
        <div
          class="cs-diff-preview"
          data-themed={settings.appearance.themedDiff() ? "true" : "false"}
          style={{ "font-family": monoFontFamily(settings.appearance.font()) }}
        >
          <div class="cs-diff-del">
            <span>1</span>
            <code>return a + b;</code>
          </div>
          <div class="cs-diff-add">
            <span>1</span>
            <code>const result = a + b;</code>
          </div>
          <div class="cs-diff-add">
            <span>2</span>
            <code>return result;</code>
          </div>
        </div>
        <Row
          title={language.t("settings.appearance.smooth.title")}
          description={language.t("settings.appearance.smooth.description")}
        >
          <Switch
            checked={settings.appearance.fontSmoothing()}
            onChange={(checked) => settings.appearance.setFontSmoothing(checked)}
          />
        </Row>
      </Card>

      <Card title={language.t("settings.appearance.contrast.title")}>
        <Row
          title={language.t("settings.appearance.contrast.follow.title")}
          description={language.t("settings.appearance.contrast.follow.description")}
        >
          <Switch
            checked={settings.appearance.followContrast()}
            onChange={(checked) => settings.appearance.setFollowContrast(checked)}
          />
        </Row>
      </Card>

      <Card title={language.t("settings.appearance.motion.title")}>
        <Row
          title={language.t("settings.appearance.motion.reduce.title")}
          description={language.t("settings.appearance.motion.reduce.description")}
        >
          <Select
            options={[...motionOptions]}
            current={motionOptions.find((o) => o.value === settings.appearance.reduceMotion()) ?? motionOptions[0]}
            value={(o) => o.value}
            label={(o) => language.t(o.label)}
            onSelect={(option) => option && settings.appearance.setReduceMotion(option.value)}
            variant="secondary"
            size="small"
            triggerVariant="settings"
          />
        </Row>
      </Card>
    </div>
  )
}

const FontPicker: Component<{
  value: string
  fonts: string[]
  systemLabel: string
  searchLabel: string
  emptyLabel: string
  onOpen: () => void
  onChange: (value: string) => void
}> = (props) => {
  const [open, setOpen] = createSignal(false)
  const [query, setQuery] = createSignal("")
  const [box, setBox] = createSignal({ top: 0, left: 0, max: 280, up: false })
  let root: HTMLDivElement | undefined
  let list: HTMLDivElement | undefined
  const place = () => {
    const trigger = root?.querySelector("button")
    if (!trigger) return
    const rect = trigger.getBoundingClientRect()
    const below = window.innerHeight - rect.bottom - 16
    const above = rect.top - 16
    const up = below < 220 && above > below
    const room = Math.max(160, Math.min(360, up ? above : below))
    setBox({ top: up ? rect.top - 4 : rect.bottom + 4, left: Math.max(8, rect.right - 280), max: room, up })
  }
  const listStyle = (): JSX.CSSProperties => {
    const frame = box()
    return {
      top: `${frame.top}px`,
      left: `${frame.left}px`,
      "max-height": `${frame.max}px`,
      transform: frame.up ? "translateY(-100%)" : "none",
    }
  }
  const legacy: Record<string, string> = {
    "jetbrains-mono": "JetBrains Mono",
    "ibm-plex-mono": "IBM Plex Mono",
    "source-code-pro": "Source Code Pro",
    pingfang: "PingFang SC",
    songti: "Songti SC",
    arial: "Arial",
    rounded: "Arial Rounded MT Bold",
  }
  const label = () => (props.value === "system" ? props.systemLabel : (legacy[props.value] ?? props.value))
  const face = () => {
    const name = props.value === "system" ? "" : (legacy[props.value] ?? props.value)
    if (!name) return "inherit"
    return `"${name.replaceAll('"', "")}"`
  }
  const shown = createMemo(() => {
    const q = query().trim().toLowerCase()
    return props.fonts.filter((name) => !q || name.toLowerCase().includes(q))
  })
  createEffect(() => {
    if (!open()) return
    const close = (event: MouseEvent) => {
      const target = event.target
      if (target instanceof Node && (root?.contains(target) || list?.contains(target))) return
      setOpen(false)
    }
    const follow = (event: Event) => {
      const target = event.target
      if (target instanceof Node && list?.contains(target)) return
      place()
    }
    document.addEventListener("mousedown", close)
    window.addEventListener("resize", follow)
    document.addEventListener("scroll", follow, true)
    onCleanup(() => {
      document.removeEventListener("mousedown", close)
      window.removeEventListener("resize", follow)
      document.removeEventListener("scroll", follow, true)
    })
  })
  const choose = (value: string) => {
    props.onChange(value)
    setOpen(false)
    setQuery("")
  }
  return (
    <div class="cs-font-picker" ref={root}>
      <button
        type="button"
        class="cs-font-trigger"
        style={{ "font-family": face() }}
        onClick={() => {
          const next = !open()
          setOpen(next)
          if (!next) return
          place()
          props.onOpen()
        }}
      >
        {label()}
      </button>
      <Show when={open()}>
        <Portal>
        <div class="cs-font-list" ref={list} style={listStyle()}>
          <input
            class="cs-font-search"
            type="text"
            placeholder={props.searchLabel}
            value={query()}
            onInput={(event) => setQuery(event.currentTarget.value)}
          />
          <button type="button" class="cs-font-option" onClick={() => choose("system")}>
            {props.systemLabel}
          </button>
          <For each={shown()}>
            {(name) => (
              <button
                type="button"
                class="cs-font-option"
                classList={{ "is-current": label() === name }}
                style={{ "font-family": `"${name.replaceAll('"', "")}"` }}
                onClick={() => choose(name)}
              >
                {name}
              </button>
            )}
          </For>
          <Show when={shown().length === 0}>
            <div class="cs-font-empty">{props.emptyLabel}</div>
          </Show>
        </div>
        </Portal>
      </Show>
    </div>
  )
}

const Card: Component<{ title: string; children: JSX.Element }> = (props) => (
  <div class="flex flex-col gap-1">
    <h3 class="text-13-medium text-text-weak tracking-wide pb-2">{props.title}</h3>
    <div class="cs-appearance-card">{props.children}</div>
  </div>
)

const Row: Component<{ title: string; description: string; children: JSX.Element }> = (props) => (
  <div class="flex flex-wrap items-center justify-between gap-4 px-4 py-3.5 border-b border-border-weak-base last:border-none">
    <div class="flex flex-col gap-0.5 min-w-0">
      <span class="text-14-medium text-text-strong">{props.title}</span>
      <span class="text-12-regular text-text-weak">{props.description}</span>
    </div>
    <div class="flex-shrink-0">{props.children}</div>
  </div>
)

const Stepper: Component<{
  value: number
  min: number
  max: number
  reset: number
  resetLabel: string
  onChange: (value: number) => void
}> = (props) => {
  const step = (delta: number) => {
    props.onChange(Math.min(props.max, Math.max(props.min, props.value + delta)))
  }
  return (
    <div class="cs-stepper">
      <button type="button" class="cs-stepper-btn" aria-label={props.resetLabel} onClick={() => props.onChange(props.reset)}>
        ↺
      </button>
      <button type="button" class="cs-stepper-btn" disabled={props.value <= props.min} onClick={() => step(-1)}>
        −
      </button>
      <span class="cs-stepper-value">{props.value}</span>
      <button type="button" class="cs-stepper-btn" disabled={props.value >= props.max} onClick={() => step(1)}>
        +
      </button>
    </div>
  )
}
