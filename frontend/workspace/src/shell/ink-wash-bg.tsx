import { onCleanup, onMount } from "solid-js"

const SESSION_PLATE = "/ink-wash-agent-bg.png"

export function InkWashBg(props: {
  plate?: string
  strength?: number
  scale?: number
  anchor?: "center" | "bottom-left"
}) {
  let node: HTMLCanvasElement | undefined
  onMount(() => {
    if (!node) return
    const stop = mount(node, {
      src: props.plate ?? SESSION_PLATE,
      strength: props.strength,
      scale: props.scale,
      anchor: props.anchor,
    })
    onCleanup(stop)
  })
  return <canvas ref={node} class="cs-ink-wash" aria-hidden="true" />
}

function mount(
  canvas: HTMLCanvasElement,
  opts: { src: string; strength?: number; scale?: number; anchor?: "center" | "bottom-left" },
) {
  const ctx = canvas.getContext("2d", { alpha: true })
  if (!ctx) return () => undefined

  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches
  const state = {
    density: reduced ? 0.25 : 0.4,
    bloom: reduced ? 0.3 : 0.55,
    plate: opts.strength ?? 0.86,
    paused: false,
    wind: 0.1,
  }

  const plate = new Image()
  let ready = false
  plate.onload = () => {
    ready = true
  }
  plate.src = opts.src

  const grain = document.createElement("canvas")
  const specks: Speck[] = []
  const blooms: Bloom[] = []
  let w = 0
  let h = 0
  let last = performance.now()
  let frame = 0

  const bake = () => {
    grain.width = 256
    grain.height = 256
    const g = grain.getContext("2d")
    if (!g) return
    const data = g.createImageData(256, 256)
    for (let i = 0; i < data.data.length; i += 4) {
      const n = 232 + Math.random() * 16
      data.data[i] = n
      data.data[i + 1] = n
      data.data[i + 2] = n
      data.data[i + 3] = 255
    }
    g.putImageData(data, 0, 0)
  }

  const seed = () => {
    const n = Math.round((w * h) / 38000 * state.density)
    while (specks.length < n) specks.push(speck())
    if (specks.length > n) specks.length = n
  }

  const speck = (x?: number, y?: number): Speck => ({
    x: x ?? Math.random() * w,
    y: y ?? Math.random() * h,
    r: 0.45 + Math.random() * 1.2,
    a: 0.08 + Math.random() * 0.18,
    vx: (Math.random() - 0.5) * 0.1,
    vy: -0.025 - Math.random() * 0.07,
    life: 10 + Math.random() * 16,
  })

  const drop = (x: number, y: number, force: boolean) => {
    const n = force ? 0.65 : 0.35 + Math.random() * 0.25
    blooms.push({
      x,
      y,
      r: 8,
      max: (42 + Math.random() * 56) * n * (0.45 + state.bloom * 0.5),
      a: 0.16 * Math.max(0.2, state.bloom),
      grow: 24 + Math.random() * 16,
    })
  }

  const resize = () => {
    const dpr = Math.min(devicePixelRatio || 1, 2)
    const nextW = canvas.clientWidth
    const nextH = canvas.clientHeight
    if (nextW < 1 || nextH < 1) return
    const bw = Math.max(1, Math.floor(nextW * dpr))
    const bh = Math.max(1, Math.floor(nextH * dpr))
    if (canvas.width === bw && canvas.height === bh) return
    w = nextW
    h = nextH
    canvas.width = bw
    canvas.height = bh
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    seed()
    draw()
  }

  const draw = () => {
    ctx.fillStyle = "#f3f3f1"
    ctx.fillRect(0, 0, w, h)
    const pattern = ctx.createPattern(grain, "repeat")
    if (pattern) {
      ctx.globalAlpha = 0.12
      ctx.fillStyle = pattern
      ctx.fillRect(0, 0, w, h)
      ctx.globalAlpha = 1
    }
    if (ready && plate.naturalWidth) {
      const cover = Math.max(w / plate.naturalWidth, h / plate.naturalHeight)
      const scale = cover * (opts.scale ?? 1)
      const dw = plate.naturalWidth * scale
      const dh = plate.naturalHeight * scale
      const left = opts.anchor === "bottom-left" ? -dw * 0.06 : (w - dw) / 2
      const top = opts.anchor === "bottom-left" ? h - dh + dh * 0.1 : (h - dh) / 2
      ctx.save()
      ctx.filter = "saturate(0.2) contrast(1.08)"
      ctx.globalAlpha = state.plate
      ctx.drawImage(plate, left, top, dw, dh)
      ctx.restore()
    }
  }

  const step = (now: number) => {
    const dt = Math.min(0.033, (now - last) / 1000)
    last = now
    draw()
    if (!state.paused) {
      state.wind = Math.sin(now * 0.00018) * 0.16
      for (const item of specks) {
        item.x += (item.vx + state.wind) * 60 * dt
        item.y += item.vy * 60 * dt
        item.life -= dt
        if (item.x < -8) item.x = w + 8
        if (item.x > w + 8) item.x = -8
        if (item.y < -8 || item.life < 0) Object.assign(item, speck(Math.random() * w, h + 6))
      }
      for (let i = blooms.length - 1; i >= 0; i--) {
        const item = blooms[i]
        item.r += item.grow * dt
        item.a *= 0.986
        if (item.r > item.max || item.a < 0.01) blooms.splice(i, 1)
      }
      if (state.bloom > 0 && Math.random() < 0.0025 * state.bloom) {
        drop(Math.random() * w, h * (0.42 + Math.random() * 0.42), false)
      }
    }
    for (const item of blooms) {
      const glow = ctx.createRadialGradient(item.x, item.y, 0, item.x, item.y, item.r)
      glow.addColorStop(0, `rgba(18, 18, 18, ${item.a})`)
      glow.addColorStop(0.5, `rgba(18, 18, 18, ${item.a * 0.4})`)
      glow.addColorStop(1, "rgba(18, 18, 18, 0)")
      ctx.fillStyle = glow
      ctx.beginPath()
      ctx.arc(item.x, item.y, item.r, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.fillStyle = "#1a1a1a"
    for (const item of specks) {
      ctx.globalAlpha = item.a
      ctx.beginPath()
      ctx.arc(item.x, item.y, item.r, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.globalAlpha = 1
    frame = requestAnimationFrame(step)
  }

  bake()
  const ro = new ResizeObserver(resize)
  ro.observe(canvas)
  resize()
  frame = requestAnimationFrame(step)
  return () => {
    cancelAnimationFrame(frame)
    ro.disconnect()
  }
}

type Speck = {
  x: number
  y: number
  r: number
  a: number
  vx: number
  vy: number
  life: number
}

type Bloom = {
  x: number
  y: number
  r: number
  max: number
  a: number
  grow: number
}
