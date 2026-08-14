/**
 * Lab 03 — rain shadow. Moist air climbs a ridge, dumps rain, then the far
 * side is dry. This is orography: mountains mint deserts.
 */
import { approach, ambientPhase, EASE, prefersReducedMotion } from './motion'
import { drawAtmosphere, resizeCanvas, type StopFn } from './shared'

export function mountRain(root: HTMLElement, onNarrate: (t: string) => void): StopFn {
  let ridgeT = 0.55
  let windT = 0.7
  let ridge = ridgeT
  let wind = windT

  root.innerHTML = `
    <div class="demo-grid">
      <div class="demo-canvas-wrap tall scene">
        <canvas id="oroCanvas"></canvas>
      </div>
      <div class="demo-controls">
        <label>
          Ridge height · <strong id="ridgeVal">${Math.round(ridgeT * 100)}%</strong>
          <input id="ridge" type="range" min="10" max="95" value="${Math.round(ridgeT * 100)}" />
        </label>
        <label>
          Wind strength · <strong id="windVal">${Math.round(windT * 100)}%</strong>
          <input id="wind" type="range" min="20" max="100" value="${Math.round(windT * 100)}" />
        </label>
        <div>
          <div>Windward moisture</div>
          <div class="meter" id="wetMeter"><span></span></div>
          <div>Leeward moisture</div>
          <div class="meter dry" id="dryMeter"><span></span></div>
        </div>
        <p class="hint">West wind climbs, rains, then descends dry — the same orography the atlas runs on every climate pass.</p>
      </div>
    </div>
  `

  const canvas = root.querySelector<HTMLCanvasElement>('#oroCanvas')!
  const ctx = canvas.getContext('2d')!
  const wet = () => Math.min(1, 0.35 + wind * 0.4 + ridge * 0.35)
  const dry = () => Math.max(0.05, 0.85 - ridge * 0.7 * wind - wind * 0.1)

  let wetShown = wet()
  let dryShown = dry()

  const updateMeters = () => {
    root.querySelector<HTMLElement>('#wetMeter span')!.style.width = `${Math.round(wetShown * 100)}%`
    root.querySelector<HTMLElement>('#dryMeter span')!.style.width = `${Math.round(dryShown * 100)}%`
    if (dry() < 0.35) onNarrate('Strong rain shadow: moisture dumped on the climb; the far side stays arid.')
    else if (ridge < 0.35) onNarrate('Low ridge: little lift. East and west stay similarly moist — raise the mountain.')
    else onNarrate('Shadow forming. Push ridge height and wind to dry the lee.')
  }

  root.querySelector<HTMLInputElement>('#ridge')!.oninput = (e) => {
    ridgeT = Number((e.target as HTMLInputElement).value) / 100
    root.querySelector('#ridgeVal')!.textContent = `${(e.target as HTMLInputElement).value}%`
  }
  root.querySelector<HTMLInputElement>('#wind')!.oninput = (e) => {
    windT = Number((e.target as HTMLInputElement).value) / 100
    root.querySelector('#windVal')!.textContent = `${(e.target as HTMLInputElement).value}%`
  }

  type Drop = { x: number; y: number; life: number; side: 'w' | 'l'; vy: number; vx: number }
  const drops: Drop[] = []
  let raf = 0
  let alive = true
  let last = performance.now()

  const tick = (now: number) => {
    if (!alive) return
    const dt = Math.min(0.05, (now - last) / 1000)
    last = now
    ridge = approach(ridge, ridgeT, dt, 6)
    wind = approach(wind, windT, dt, 6)
    wetShown = approach(wetShown, wet(), dt, 5)
    dryShown = approach(dryShown, dry(), dt, 5)
    updateMeters()

    const { w, h, dpr } = resizeCanvas(canvas)
    ctx.clearRect(0, 0, w, h)
    drawAtmosphere(ctx, w, h, now)

    const baseY = h * 0.78
    const peakX = w * 0.52
    const peakH = h * (0.2 + ridge * 0.48)
    const wv = wet()
    const dv = dry()

    // ground split — staged contrast
    const wetG = ctx.createLinearGradient(0, baseY, peakX, baseY)
    wetG.addColorStop(0, `rgba(55,120,75,${0.55 + wv * 0.35})`)
    wetG.addColorStop(1, `rgba(70,130,80,${0.45 + wv * 0.25})`)
    ctx.fillStyle = wetG
    ctx.fillRect(0, baseY, peakX, h - baseY)

    const dryG = ctx.createLinearGradient(peakX, baseY, w, baseY)
    dryG.addColorStop(0, `rgba(170,130,70,${0.35 + (1 - dv) * 0.4})`)
    dryG.addColorStop(1, `rgba(190,145,80,${0.45 + (1 - dv) * 0.35})`)
    ctx.fillStyle = dryG
    ctx.fillRect(peakX, baseY, w - peakX, h - baseY)

    // mountain silhouette with volume
    ctx.beginPath()
    ctx.moveTo(w * 0.12, baseY)
    ctx.bezierCurveTo(w * 0.28, baseY - peakH * 0.15, peakX - w * 0.12, baseY - peakH * 0.55, peakX, baseY - peakH)
    ctx.bezierCurveTo(peakX + w * 0.12, baseY - peakH * 0.4, w * 0.78, baseY - peakH * 0.12, w * 0.9, baseY)
    ctx.closePath()
    const rock = ctx.createLinearGradient(peakX, baseY - peakH, peakX + w * 0.2, baseY)
    rock.addColorStop(0, '#f0ebe4')
    rock.addColorStop(0.28, '#b0a498')
    rock.addColorStop(0.65, '#7a8a62')
    rock.addColorStop(1, '#5a7048')
    ctx.fillStyle = rock
    ctx.fill()

    // lee shade
    ctx.save()
    ctx.clip()
    const lee = ctx.createLinearGradient(peakX, 0, w * 0.9, 0)
    lee.addColorStop(0, 'rgba(255,255,255,0.05)')
    lee.addColorStop(0.35, 'rgba(0,0,0,0.05)')
    lee.addColorStop(1, 'rgba(40,30,20,0.28)')
    ctx.fillStyle = lee
    ctx.fillRect(0, 0, w, h)
    ctx.restore()

    // wind ribbons along arcs (arc principle)
    const phase = ambientPhase(now, 5) * w * 0.5
    ctx.lineCap = 'round'
    for (let i = 0; i < 6; i++) {
      const y = h * (0.16 + i * 0.07)
      const amp = (6 + i) * dpr * (0.6 + wind)
      const x0 = ((phase + i * 70) % (w * 0.55)) - 40
      ctx.beginPath()
      ctx.moveTo(x0, y)
      ctx.bezierCurveTo(x0 + 50, y - amp, x0 + 100, y + amp * 0.6, x0 + 160, y)
      // lift over ridge
      if (x0 + 160 > peakX - 80) {
        const lift = peakH * 0.25 * ridge
        ctx.bezierCurveTo(x0 + 200, y - lift, x0 + 240, y - lift * 0.3, Math.min(w * 0.95, x0 + 300), y + 8)
      }
      ctx.strokeStyle = `rgba(255,255,255,${0.18 + wind * 0.28})`
      ctx.lineWidth = (1.2 + wind) * dpr
      ctx.stroke()
    }

    // rain / dust particles with arcs
    if (!prefersReducedMotion()) {
      if (Math.random() < 0.4 + wv * 0.45) {
        drops.push({
          x: Math.random() * peakX * 0.92,
          y: h * 0.1,
          life: 1,
          side: 'w',
          vy: (2.8 + Math.random()) * dpr,
          vx: (1.2 + wind * 2) * dpr,
        })
      }
      if (Math.random() < 0.06 + (1 - dv) * 0.06) {
        drops.push({
          x: peakX + Math.random() * (w - peakX) * 0.9,
          y: h * 0.18,
          life: 1,
          side: 'l',
          vy: 1.1 * dpr,
          vx: (1.6 + wind * 1.5) * dpr,
        })
      }
    }

    for (let i = drops.length - 1; i >= 0; i--) {
      const d = drops[i]
      d.x += d.vx
      d.y += d.vy
      d.life -= 0.018
      // slight arc droop
      d.vy += 0.04 * dpr
      if (d.side === 'w') {
        ctx.strokeStyle = `rgba(90,150,210,${d.life * 0.75})`
        ctx.lineWidth = 1.6 * dpr
        ctx.beginPath()
        ctx.moveTo(d.x, d.y)
        ctx.lineTo(d.x - d.vx * 0.6, d.y - d.vy * 0.8)
        ctx.stroke()
      } else {
        ctx.fillStyle = `rgba(200,170,110,${d.life * 0.45})`
        ctx.beginPath()
        ctx.arc(d.x, d.y, 1.8 * dpr, 0, Math.PI * 2)
        ctx.fill()
      }
      if (d.life <= 0 || d.y > baseY) drops.splice(i, 1)
    }

    // labels
    const pulse = 0.85 + 0.15 * EASE.breathe(ambientPhase(now, 4))
    ctx.font = `600 ${13 * dpr}px Outfit, sans-serif`
    ctx.fillStyle = `rgba(20,32,28,${0.65 * pulse})`
    ctx.fillText('Windward · wet', 22 * dpr, baseY + 26 * dpr)
    ctx.fillText('Leeward · rain shadow', peakX + 14 * dpr, baseY + 26 * dpr)

    raf = requestAnimationFrame(tick)
  }

  updateMeters()
  raf = requestAnimationFrame(tick)
  return () => {
    alive = false
    cancelAnimationFrame(raf)
  }
}
