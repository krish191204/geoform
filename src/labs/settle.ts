/**
 * Lab 05 — where cities want to live. Same suitability rules as the editor:
 * not ocean, not a peak, not a desert, preferably near a river or coast.
 */
import { approach, ambientPhase, EASE, prefersReducedMotion } from './motion'
import {
  clamp,
  idx,
  lerp,
  paintTerrain,
  resizeCanvas,
  softNoise,
  type StopFn,
} from './shared'

const W = 88
const H = 52
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

export function mountSettle(root: HTMLElement, onNarrate: (t: string) => void): StopFn {
  let waterW = 0.45
  let flatW = 0.35
  let warmW = 0.2
  let peakBoostT = 0.55
  let peakBoost = peakBoostT

  root.innerHTML = `
    <div class="demo-grid">
      <div class="demo-canvas-wrap tall scene">
        <canvas id="settleCanvas"></canvas>
      </div>
      <div class="demo-controls">
        <label>
          Prefer water · <strong id="waterVal">${Math.round(waterW * 100)}%</strong>
          <input id="water" type="range" min="0" max="80" value="${Math.round(waterW * 100)}" />
        </label>
        <label>
          Prefer flat land · <strong id="flatVal">${Math.round(flatW * 100)}%</strong>
          <input id="flat" type="range" min="0" max="80" value="${Math.round(flatW * 100)}" />
        </label>
        <label>
          Prefer mild climate · <strong id="warmVal">${Math.round(warmW * 100)}%</strong>
          <input id="warm" type="range" min="0" max="60" value="${Math.round(warmW * 100)}" />
        </label>
        <label>
          Mountain height · <strong id="peakVal">${Math.round(peakBoostT * 100)}%</strong>
          <input id="peak" type="range" min="15" max="95" value="${Math.round(peakBoostT * 100)}" />
        </label>
        <div class="stat-grid">
          <div><span>Best sites</span><strong id="bestN">—</strong></div>
          <div><span>Peak score</span><strong id="peakScore">—</strong></div>
        </div>
        <p class="hint">Warm glow = favorable sites. Amber = harsh but plausible. Same rules as Suggest cities on the atlas.</p>
      </div>
    </div>
  `

  const canvas = root.querySelector<HTMLCanvasElement>('#settleCanvas')!
  const ctx = canvas.getContext('2d')!
  const elev = new Float32Array(W * H)
  const flow = new Float32Array(W * H)
  const score = new Float32Array(W * H)
  const order = new Int32Array(W * H)
  let offscreen: HTMLCanvasElement | OffscreenCanvas | null = null

  const buildTerrain = () => {
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const nx = x / W
        const ny = y / H
        const coast = clamp(1.12 - nx * 1.05, 0, 1)
        const ridge = Math.exp(-Math.pow((nx - 0.55) / 0.15, 2)) * peakBoost
        const plain = 0.2 * (1 - ridge) * softNoise(nx * 3, ny * 3, 7)
        elev[idx(x, y, W)] = clamp(
          coast * 0.045 + ridge + plain + softNoise(nx * 8, ny * 8, 3) * 0.04,
          0,
          1,
        )
      }
    }
  }

  const hydro = () => {
    for (let i = 0; i < W * H; i++) {
      order[i] = i
      flow[i] = elev[i] < 0.06 ? 0 : 1
    }
    order.sort((a, b) => elev[b] - elev[a])
    for (let k = 0; k < order.length; k++) {
      const i = order[k]
      if (elev[i] < 0.06) continue
      const x = i % W
      const y = (i / W) | 0
      let best = -1
      let bestE = elev[i]
      for (const [dx, dy] of DIRS) {
        const nx = x + dx
        const ny = y + dy
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue
        const j = idx(nx, ny, W)
        if (elev[j] < bestE) {
          bestE = elev[j]
          best = j
        }
      }
      if (best >= 0) flow[best] += flow[i]
    }
  }

  const scoreLand = () => {
    let maxS = 0
    for (let y = 1; y < H - 1; y++) {
      for (let x = 1; x < W - 1; x++) {
        const i = idx(x, y, W)
        if (elev[i] < 0.07) {
          score[i] = 0
          continue
        }
        const slope =
          Math.abs(elev[i] - elev[idx(x - 1, y, W)]) +
          Math.abs(elev[i] - elev[idx(x + 1, y, W)]) +
          Math.abs(elev[i] - elev[idx(x, y - 1, W)]) +
          Math.abs(elev[i] - elev[idx(x, y + 1, W)])
        const flat = clamp(1 - slope * 4.5, 0, 1)
        const water = clamp(Math.log10(flow[i] + 1) / 2.2, 0, 1)
        const coastNear =
          elev[idx(x - 1, y, W)] < 0.07 ||
          elev[idx(x, y + 1, W)] < 0.07 ||
          elev[idx(x, y - 1, W)] < 0.07
            ? 0.85
            : 0
        const temp = clamp(1 - elev[i] * 1.1, 0, 1)
        const s = waterW * Math.max(water, coastNear * 0.7) + flatW * flat + warmW * temp
        score[i] = s
        maxS = Math.max(maxS, s)
      }
    }
    const cities: { x: number; y: number; s: number }[] = []
    for (let y = 2; y < H - 2; y++) {
      for (let x = 2; x < W - 2; x++) {
        const i = idx(x, y, W)
        const s = score[i]
        if (s < maxS * 0.62) continue
        let localMax = true
        for (let dy = -1; dy <= 1 && localMax; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue
            if (score[idx(x + dx, y + dy, W)] > s) localMax = false
          }
        }
        if (localMax) cities.push({ x, y, s })
      }
    }
    cities.sort((a, b) => b.s - a.s)
    const top = cities.slice(0, 8)
    root.querySelector('#bestN')!.textContent = `${top.length}`
    root.querySelector('#peakScore')!.textContent = maxS.toFixed(2)
    return { maxS, cities: top }
  }

  const bind = (id: string, apply: (v: number) => void, label: string, rebuild = false) => {
    root.querySelector<HTMLInputElement>(`#${id}`)!.oninput = (e) => {
      const v = Number((e.target as HTMLInputElement).value) / 100
      apply(v)
      root.querySelector(`#${label}`)!.textContent = `${Math.round(v * 100)}%`
      if (rebuild) {
        peakBoostT = v
        buildTerrain()
      }
    }
  }
  bind('water', (v) => (waterW = v), 'waterVal')
  bind('flat', (v) => (flatW = v), 'flatVal')
  bind('warm', (v) => (warmW = v), 'warmVal')
  bind('peak', (v) => (peakBoostT = v), 'peakVal', true)

  buildTerrain()
  let raf = 0
  let alive = true
  let last = performance.now()

  const tick = (now: number) => {
    if (!alive) return
    const dt = Math.min(0.05, (now - last) / 1000)
    last = now
    peakBoost = approach(peakBoost, peakBoostT, dt, 5)
    if (Math.abs(peakBoost - peakBoostT) > 0.002) buildTerrain()

    hydro()
    const { maxS, cities } = scoreLand()
    const { w, h, dpr } = resizeCanvas(canvas)

    const tw = Math.max(1, (w / 2) | 0)
    const th = Math.max(1, (h / 2) | 0)
    if (!offscreen || (offscreen as HTMLCanvasElement).width !== tw) {
      offscreen =
        typeof OffscreenCanvas !== 'undefined'
          ? new OffscreenCanvas(tw, th)
          : Object.assign(document.createElement('canvas'), { width: tw, height: th })
      if (!(offscreen instanceof OffscreenCanvas)) {
        ;(offscreen as HTMLCanvasElement).width = tw
        ;(offscreen as HTMLCanvasElement).height = th
      } else {
        offscreen.width = tw
        offscreen.height = th
      }
    }
    const octx = offscreen.getContext('2d') as CanvasRenderingContext2D
    const img = octx.createImageData(tw, th)
    paintTerrain(img, elev, W, H, { seaLevel: 0.06 })

    // soft suitability wash into RGB (staging: heat as secondary layer)
    for (let py = 0; py < th; py++) {
      for (let px = 0; px < tw; px++) {
        const u = (px + 0.5) / tw
        const v = (py + 0.5) / th
        const gx = clamp(Math.round(u * (W - 1)), 0, W - 1)
        const gy = clamp(Math.round(v * (H - 1)), 0, H - 1)
        const s = maxS > 0 ? score[idx(gx, gy, W)] / maxS : 0
        const i = (py * tw + px) * 4
        if (elev[idx(gx, gy, W)] < 0.07) continue
        const glow = EASE.elegant(s)
        img.data[i] = lerp(img.data[i], 235, glow * 0.65) | 0
        img.data[i + 1] = lerp(img.data[i + 1], 150, glow * 0.45) | 0
        img.data[i + 2] = lerp(img.data[i + 2], 70, glow * 0.35) | 0
      }
    }
    octx.putImageData(img, 0, 0)

    ctx.clearRect(0, 0, w, h)
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(offscreen as CanvasImageSource, 0, 0, w, h)

    // river glints
    ctx.globalCompositeOperation = 'screen'
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = idx(x, y, W)
        if (flow[i] > 22 && elev[i] >= 0.07) {
          const a = clamp(Math.log10(flow[i]) / 3, 0.15, 0.55)
          ctx.fillStyle = `rgba(120,190,255,${a * 0.35})`
          ctx.beginPath()
          ctx.arc(((x + 0.5) / W) * w, ((y + 0.5) / H) * h, 2.2 * dpr, 0, Math.PI * 2)
          ctx.fill()
        }
      }
    }
    ctx.globalCompositeOperation = 'source-over'

    const pulse = prefersReducedMotion() ? 1 : 0.85 + 0.15 * EASE.breathe(ambientPhase(now, 2.8))
    cities.forEach((c, n) => {
      const x = ((c.x + 0.5) / W) * w
      const y = ((c.y + 0.5) / H) * h
      const r = (4 + (1 - n / 8) * 3) * dpr * pulse
      // halo
      const g = ctx.createRadialGradient(x, y, 0, x, y, r * 3)
      g.addColorStop(0, 'rgba(255,220,160,0.35)')
      g.addColorStop(1, 'rgba(255,220,160,0)')
      ctx.fillStyle = g
      ctx.beginPath()
      ctx.arc(x, y, r * 3, 0, Math.PI * 2)
      ctx.fill()
      ctx.beginPath()
      ctx.arc(x, y, r, 0, Math.PI * 2)
      ctx.fillStyle = '#1a2420'
      ctx.fill()
      ctx.strokeStyle = 'rgba(255,240,210,0.95)'
      ctx.lineWidth = 1.6 * dpr
      ctx.stroke()
    })

    if (waterW > flatW && waterW > warmW) onNarrate('Water-weighted: cities cling to rivers and the western coast.')
    else if (flatW >= waterW && flatW >= warmW)
      onNarrate('Flat-weighted: steep mountain flanks cool on the heatmap; plains light up.')
    else onNarrate('Climate-weighted: high ridges chill out — settlement slides downhill to milder air.')

    raf = requestAnimationFrame(tick)
  }

  raf = requestAnimationFrame(tick)
  return () => {
    alive = false
    cancelAnimationFrame(raf)
  }
}
