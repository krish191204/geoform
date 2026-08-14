/**
 * Lab 02 — rivers from height. Water is lazy: it always flows downhill.
 * Thick lines are where many cells dump into one (a confluence), not decoration.
 * X wraps like the editor so a river can cross the date line.
 */
import { approach, ambientPhase, EASE, prefersReducedMotion } from './motion'
import {
  clamp,
  idx,
  paintTerrain,
  resizeCanvas,
  softNoise,
  strokeSmooth,
  type StopFn,
} from './shared'

const W = 96
const H = 56
const DIRS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
] as const

export function mountRivers(root: HTMLElement, onNarrate: (t: string) => void): StopFn {
  let brushT = 0.14
  let brush = brushT
  let mode: 'raise' | 'lower' = 'raise'
  let thresholdT = 28
  let threshold = thresholdT

  root.innerHTML = `
    <div class="demo-grid">
      <div class="demo-canvas-wrap tall scene">
        <canvas id="riverCanvas"></canvas>
      </div>
      <div class="demo-controls">
        <div class="btn-row">
          <button type="button" class="chip-btn active" data-mode="raise">Raise</button>
          <button type="button" class="chip-btn" data-mode="lower">Lower</button>
          <button type="button" class="chip-btn" id="resetTerrain">Reset hills</button>
        </div>
        <label>
          Brush strength · <strong id="brushVal">${Math.round(brushT * 100)}%</strong>
          <input id="brush" type="range" min="4" max="28" value="${Math.round(brushT * 100)}" />
        </label>
        <label>
          River threshold · <strong id="thrVal">${thresholdT}</strong> cells
          <input id="thr" type="range" min="10" max="80" value="${thresholdT}" />
        </label>
        <div class="stat-grid">
          <div><span>Stream paths</span><strong id="streamN">—</strong></div>
          <div><span>Max flow</span><strong id="maxFlow">—</strong></div>
        </div>
        <p class="hint">Sculpt the land. Water wraps east–west and drains downhill — same rule as the atlas.</p>
      </div>
    </div>
  `

  const canvas = root.querySelector<HTMLCanvasElement>('#riverCanvas')!
  const ctx = canvas.getContext('2d')!
  const elev = new Float32Array(W * H)
  const flow = new Float32Array(W * H)
  const drain = new Int32Array(W * H)
  const order = new Int32Array(W * H)
  let offscreen: OffscreenCanvas | HTMLCanvasElement | null = null
  let octx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null = null

  const seedTerrain = () => {
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const nx = x / W
        const ny = y / H
        const ridge = Math.exp(-Math.pow((nx - 0.42) / 0.2, 2)) * (0.5 + 0.28 * Math.sin(ny * 5.5))
        const bowl = 0.32 * Math.exp(-Math.pow((nx - 0.76) / 0.18, 2) - Math.pow((ny - 0.55) / 0.28, 2))
        elev[idx(x, y, W)] = clamp(
          0.16 + ridge * 0.72 + bowl + softNoise(nx * 6, ny * 6, 2) * 0.07,
          0.04,
          1,
        )
      }
    }
  }
  seedTerrain()

  const recomputeFlow = () => {
    for (let i = 0; i < W * H; i++) {
      order[i] = i
      flow[i] = 1
      drain[i] = -1
    }
    order.sort((a, b) => elev[b] - elev[a])
    for (let k = 0; k < order.length; k++) {
      const i = order[k]
      const x = i % W
      const y = (i / W) | 0
      let best = -1
      let bestE = elev[i]
      for (const [dx, dy] of DIRS) {
        const nx = (x + dx + W) % W
        const ny = y + dy
        if (ny < 0 || ny >= H) continue
        const j = idx(nx, ny, W)
        if (elev[j] < bestE) {
          bestE = elev[j]
          best = j
        }
      }
      drain[i] = best
      if (best >= 0) flow[best] += flow[i]
    }
  }

  /** Trace stream centerlines from high-flow cells toward outlets */
  const tracePaths = (maxF: number) => {
    const paths: { pts: { x: number; y: number }[]; strength: number }[] = []
    const used = new Uint8Array(W * H)
    const starts: number[] = []
    for (let i = 0; i < W * H; i++) {
      if (flow[i] >= threshold) starts.push(i)
    }
    starts.sort((a, b) => flow[b] - flow[a])
    for (const start of starts.slice(0, 48)) {
      if (used[start]) continue
      const pts: { x: number; y: number }[] = []
      let i = start
      let guard = 0
      let strength = flow[start]
      while (i >= 0 && guard++ < 200) {
        if (flow[i] < threshold * 0.65 && pts.length > 3) break
        used[i] = 1
        const x = i % W
        const y = (i / W) | 0
        pts.push({ x: (x + 0.5) / W, y: (y + 0.5) / H })
        const next = drain[i]
        if (next < 0 || elev[next] >= elev[i]) break
        i = next
        strength = Math.max(strength, flow[i])
      }
      if (pts.length >= 4) paths.push({ pts, strength: strength / (maxF + 1) })
    }
    return paths
  }

  let painting = false
  let raf = 0
  let alive = true
  let last = performance.now()
  let dirty = true

  const paint = (clientX: number, clientY: number) => {
    const rect = canvas.getBoundingClientRect()
    const gx = clamp(((clientX - rect.left) / rect.width) * W, 0, W - 0.001)
    const gy = clamp(((clientY - rect.top) / rect.height) * H, 0, H - 0.001)
    const r = 3.2
    for (let y = (gy | 0) - 4; y <= (gy | 0) + 4; y++) {
      for (let x = (gx | 0) - 4; x <= (gx | 0) + 4; x++) {
        if (x < 0 || y < 0 || x >= W || y >= H) continue
        const d = Math.hypot(x - gx, y - gy)
        if (d > r) continue
        const fall = EASE.elegant(1 - d / r) * brush
        const i = idx(x, y, W)
        elev[i] = clamp(elev[i] + (mode === 'raise' ? fall : -fall), 0.02, 1)
      }
    }
    dirty = true
  }

  root.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach((btn) => {
    btn.addEventListener('click', () => {
      mode = btn.dataset.mode as 'raise' | 'lower'
      root.querySelectorAll('[data-mode]').forEach((b) => b.classList.toggle('active', b === btn))
    })
  })
  root.querySelector('#resetTerrain')!.addEventListener('click', () => {
    seedTerrain()
    dirty = true
    onNarrate('Hills reset. Watch streams re-knit along the new drainage.')
  })
  root.querySelector<HTMLInputElement>('#brush')!.oninput = (e) => {
    brushT = Number((e.target as HTMLInputElement).value) / 100
    root.querySelector('#brushVal')!.textContent = `${Math.round(brushT * 100)}%`
  }
  root.querySelector<HTMLInputElement>('#thr')!.oninput = (e) => {
    thresholdT = Number((e.target as HTMLInputElement).value)
    root.querySelector('#thrVal')!.textContent = `${thresholdT}`
    dirty = true
  }

  canvas.addEventListener('pointerdown', (e) => {
    painting = true
    canvas.setPointerCapture(e.pointerId)
    paint(e.clientX, e.clientY)
  })
  canvas.addEventListener('pointermove', (e) => {
    if (painting) paint(e.clientX, e.clientY)
  })
  canvas.addEventListener('pointerup', () => {
    painting = false
  })

  let paths: { pts: { x: number; y: number }[]; strength: number }[] = []
  let maxF = 1

  const tick = (now: number) => {
    if (!alive) return
    const dt = Math.min(0.05, (now - last) / 1000)
    last = now
    brush = approach(brush, brushT, dt, 8)
    threshold = approach(threshold, thresholdT, dt, 10)

    if (dirty || painting) {
      recomputeFlow()
      maxF = 0
      for (let i = 0; i < flow.length; i++) maxF = Math.max(maxF, flow[i])
      paths = tracePaths(maxF)
      dirty = false
    }

    const { w, h, dpr } = resizeCanvas(canvas)
    // render terrain at half res then scale up for soft look + speed
    const tw = Math.max(1, (w / 2) | 0)
    const th = Math.max(1, (h / 2) | 0)
    if (!offscreen || (offscreen as HTMLCanvasElement).width !== tw) {
      if (typeof OffscreenCanvas !== 'undefined') {
        offscreen = new OffscreenCanvas(tw, th)
      } else {
        offscreen = document.createElement('canvas')
        offscreen.width = tw
        offscreen.height = th
      }
      octx = offscreen.getContext('2d') as CanvasRenderingContext2D
    }
    const img = (octx as CanvasRenderingContext2D).createImageData(tw, th)
    paintTerrain(img, elev, W, H, { seaLevel: 0.05 })
    ;(octx as CanvasRenderingContext2D).putImageData(img, 0, 0)

    ctx.clearRect(0, 0, w, h)
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(offscreen as CanvasImageSource, 0, 0, w, h)

    // soft vignette for staging
    const vig = ctx.createRadialGradient(w * 0.5, h * 0.45, h * 0.2, w * 0.5, h * 0.5, h * 0.75)
    vig.addColorStop(0, 'rgba(0,0,0,0)')
    vig.addColorStop(1, 'rgba(10,20,24,0.28)')
    ctx.fillStyle = vig
    ctx.fillRect(0, 0, w, h)

    // river ribbons — glow then core (appeal + solid drawing)
    const shimmer = prefersReducedMotion() ? 0.5 : EASE.breathe(ambientPhase(now, 3.3))
    for (const path of paths) {
      const screen = path.pts.map((p) => ({ x: p.x * w, y: p.y * h }))
      const width = (1.2 + path.strength * 7) * dpr
      ctx.globalCompositeOperation = 'screen'
      strokeSmooth(ctx, screen, width * 2.2, `rgba(120,190,255,${0.12 + shimmer * 0.08})`)
      ctx.globalCompositeOperation = 'source-over'
      strokeSmooth(ctx, screen, width, `rgba(70,150,220,${0.55 + path.strength * 0.35})`)
      strokeSmooth(ctx, screen, width * 0.35, `rgba(210,235,255,${0.35 + shimmer * 0.2})`)
    }

    root.querySelector('#streamN')!.textContent = `${paths.length}`
    root.querySelector('#maxFlow')!.textContent = `${Math.round(maxF)}`

    if (paths.length < 4) onNarrate('Few streams: flatten less, dig a valley, or lower the threshold.')
    else if (mode === 'raise') onNarrate('Raising a ridge splits drainage — water peels toward lower neighbors.')
    else onNarrate('Lowering a trench concentrates flow. Confluence ribbons thicken where catchments merge.')

    raf = requestAnimationFrame(tick)
  }

  dirty = true
  raf = requestAnimationFrame(tick)
  return () => {
    alive = false
    cancelAnimationFrame(raf)
  }
}
