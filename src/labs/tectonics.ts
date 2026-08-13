/**
 * Lab 04 — plate edges. Converge = mountains. Diverge = rift / new sea.
 * Transform = plates sliding past (less vertical drama). Same idea as
 * sculptOrogeny in the editor, just one boundary you can poke.
 */
import { approach, ambientPhase, EASE, prefersReducedMotion } from './motion'
import { clamp, drawAtmosphere, resizeCanvas, softNoise, type StopFn } from './shared'

type Mode = 'converge' | 'diverge' | 'transform'

export function mountTectonics(root: HTMLElement, onNarrate: (t: string) => void): StopFn {
  let mode: Mode = 'converge'
  let rateT = 0.55
  let rate = rateT

  root.innerHTML = `
    <div class="demo-grid">
      <div class="demo-canvas-wrap tall scene">
        <canvas id="tecCanvas"></canvas>
      </div>
      <div class="demo-controls">
        <div class="btn-row">
          <button type="button" class="chip-btn active" data-mode="converge">Converge</button>
          <button type="button" class="chip-btn" data-mode="diverge">Diverge</button>
          <button type="button" class="chip-btn" data-mode="transform">Transform</button>
        </div>
        <label>
          Plate speed · <strong id="rateVal">${Math.round(rateT * 100)}%</strong>
          <input id="rate" type="range" min="15" max="100" value="${Math.round(rateT * 100)}" />
        </label>
        <button type="button" class="chip-btn" id="rewind">Rewind time</button>
        <div class="stat-grid">
          <div><span>Boundary</span><strong id="modeLabel">Convergent</strong></div>
          <div><span>Relief</span><strong id="reliefVal">—</strong></div>
        </div>
        <p class="hint">Two plates meet at the dashed suture. The atlas sculpts ranges and rifts from the same boundary logic.</p>
      </div>
    </div>
  `

  const canvas = root.querySelector<HTMLCanvasElement>('#tecCanvas')!
  const ctx = canvas.getContext('2d')!
  const N = 180
  const elev = new Float32Array(N)
  const markers: { x: number; y: number; side: -1 | 1; phase: number }[] = []

  const resetCrust = () => {
    for (let i = 0; i < N; i++) {
      const x = i / (N - 1)
      elev[i] = 0.34 + softNoise(x * 7, 0.2, 4) * 0.05
    }
    markers.length = 0
    for (let i = 0; i < 22; i++) {
      markers.push({
        x: Math.random() < 0.5 ? 0.08 + Math.random() * 0.34 : 0.58 + Math.random() * 0.34,
        y: 0.22 + Math.random() * 0.4,
        side: Math.random() < 0.5 ? -1 : 1,
        phase: Math.random() * Math.PI * 2,
      })
    }
  }
  resetCrust()

  root.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach((btn) => {
    btn.addEventListener('click', () => {
      mode = btn.dataset.mode as Mode
      root.querySelectorAll('[data-mode]').forEach((b) => b.classList.toggle('active', b === btn))
      root.querySelector('#modeLabel')!.textContent =
        mode === 'converge' ? 'Convergent' : mode === 'diverge' ? 'Divergent' : 'Transform'
      resetCrust()
    })
  })
  root.querySelector<HTMLInputElement>('#rate')!.oninput = (e) => {
    rateT = Number((e.target as HTMLInputElement).value) / 100
    root.querySelector('#rateVal')!.textContent = `${Math.round(rateT * 100)}%`
  }
  root.querySelector('#rewind')!.addEventListener('click', resetCrust)

  let raf = 0
  let alive = true
  let last = performance.now()

  const tick = (now: number) => {
    if (!alive) return
    const dt = Math.min(0.05, (now - last) / 1000)
    last = now
    rate = approach(rate, rateT, dt, 6)

    const mid = 0.5
    const band = 0.09
    for (let i = 0; i < N; i++) {
      const x = i / (N - 1)
      const dist = Math.abs(x - mid)
      const edge = Math.exp(-Math.pow(dist / band, 2))
      if (mode === 'converge') {
        elev[i] += edge * 0.32 * dt * rate
        elev[i] -= (1 - edge) * 0.015 * dt * rate
      } else if (mode === 'diverge') {
        elev[i] -= edge * 0.38 * dt * rate
        elev[i] += (dist > band ? 0.025 : 0) * dt * rate
      } else {
        elev[i] += (softNoise(x * 22, now * 0.0002, 1) - 0.5) * 0.012 * edge * dt
      }
      elev[i] = clamp(elev[i], 0.04, 1.2)
    }

    for (const m of markers) {
      if (mode === 'converge') m.x += (mid - m.x) * 0.12 * dt * rate
      else if (mode === 'diverge') m.x += m.side * 0.1 * dt * rate
      else {
        const shear = m.x < mid ? 1 : -1
        m.y += shear * 0.16 * dt * rate
        if (m.y > 0.82) m.y = 0.2
        if (m.y < 0.16) m.y = 0.8
      }
      m.x = clamp(m.x, 0.03, 0.97)
    }

    const { w, h, dpr } = resizeCanvas(canvas)
    ctx.clearRect(0, 0, w, h)
    drawAtmosphere(ctx, w, h, now)

    const baseY = h * 0.7
    // deep mantle band
    const mantle = ctx.createLinearGradient(0, baseY + h * 0.08, 0, h)
    mantle.addColorStop(0, '#6b3d28')
    mantle.addColorStop(1, '#3a2118')
    ctx.fillStyle = mantle
    ctx.fillRect(0, baseY + h * 0.1, w, h)

    // crust silhouette
    ctx.beginPath()
    ctx.moveTo(0, baseY)
    let peak = 0
    let trough = 1
    for (let i = 0; i < N; i++) {
      const x = (i / (N - 1)) * w
      const y = baseY - elev[i] * h * 0.48
      peak = Math.max(peak, elev[i])
      trough = Math.min(trough, elev[i])
      ctx.lineTo(x, y)
    }
    ctx.lineTo(w, h)
    ctx.lineTo(0, h)
    ctx.closePath()
    const rock = ctx.createLinearGradient(0, baseY - peak * h * 0.48, 0, h)
    rock.addColorStop(0, '#d8d2c8')
    rock.addColorStop(0.35, '#8a9470')
    rock.addColorStop(0.7, '#5a6a58')
    rock.addColorStop(1, '#3d4550')
    ctx.fillStyle = rock
    ctx.fill()

    // form lighting
    ctx.save()
    ctx.beginPath()
    ctx.moveTo(0, baseY)
    for (let i = 0; i < N; i++) {
      ctx.lineTo((i / (N - 1)) * w, baseY - elev[i] * h * 0.48)
    }
    ctx.lineTo(w, baseY)
    ctx.closePath()
    ctx.clip()
    const lite = ctx.createLinearGradient(0, 0, w, 0)
    lite.addColorStop(0, 'rgba(255,255,255,0.1)')
    lite.addColorStop(0.5, 'rgba(0,0,0,0)')
    lite.addColorStop(1, 'rgba(20,25,30,0.2)')
    ctx.fillStyle = lite
    ctx.fillRect(0, 0, w, h)
    ctx.restore()

    // suture (staging focal)
    const breath = EASE.breathe(ambientPhase(now, 4.5))
    ctx.strokeStyle = `rgba(184,90,42,${0.45 + breath * 0.25})`
    ctx.lineWidth = 2 * dpr
    ctx.setLineDash([8 * dpr, 6 * dpr])
    ctx.beginPath()
    ctx.moveTo(w * mid, h * 0.08)
    ctx.lineTo(w * mid, baseY + 10 * dpr)
    ctx.stroke()
    ctx.setLineDash([])

    if (mode === 'diverge' && trough < 0.22) {
      const riftW = w * 0.12
      const water = ctx.createLinearGradient(0, baseY - trough * h * 0.48, 0, baseY + h * 0.12)
      water.addColorStop(0, 'rgba(70,140,190,0.35)')
      water.addColorStop(1, 'rgba(40,90,140,0.7)')
      ctx.fillStyle = water
      ctx.beginPath()
      ctx.ellipse(w * mid, baseY - trough * h * 0.2, riftW / 2, h * 0.06, 0, 0, Math.PI * 2)
      ctx.fill()
    }

    if (mode === 'converge' && peak > 0.75 && !prefersReducedMotion()) {
      for (let k = 0; k < 4; k++) {
        const x = w * (mid - 0.03 + k * 0.02)
        const y = baseY - peak * h * 0.48 - (8 + k * 2) * dpr
        const a = 0.25 + 0.2 * Math.sin(now * 0.008 + k)
        ctx.fillStyle = `rgba(230,100,40,${a})`
        ctx.beginPath()
        ctx.arc(x, y, (2.5 + k * 0.4) * dpr, 0, Math.PI * 2)
        ctx.fill()
      }
    }

    for (const m of markers) {
      const bob = prefersReducedMotion() ? 0 : Math.sin(now * 0.002 + m.phase) * 2 * dpr
      ctx.beginPath()
      ctx.arc(m.x * w, m.y * baseY + bob, 3.8 * dpr, 0, Math.PI * 2)
      ctx.fillStyle = m.side < 0 ? 'rgba(50,95,120,0.9)' : 'rgba(170,95,45,0.9)'
      ctx.fill()
      ctx.strokeStyle = 'rgba(255,255,255,0.45)'
      ctx.lineWidth = 1 * dpr
      ctx.stroke()
    }

    // motion arrows along arcs
    ctx.strokeStyle = 'rgba(20,32,28,0.5)'
    ctx.fillStyle = 'rgba(20,32,28,0.5)'
    ctx.lineWidth = 2 * dpr
    const arrow = (x0: number, x1: number, y: number) => {
      ctx.beginPath()
      ctx.moveTo(x0, y)
      ctx.quadraticCurveTo((x0 + x1) / 2, y - 10 * dpr, x1, y)
      ctx.stroke()
      const dir = Math.sign(x1 - x0)
      ctx.beginPath()
      ctx.moveTo(x1, y)
      ctx.lineTo(x1 - dir * 10 * dpr, y - 5 * dpr)
      ctx.lineTo(x1 - dir * 10 * dpr, y + 5 * dpr)
      ctx.fill()
    }
    if (mode === 'converge') {
      arrow(w * 0.16, w * 0.4, h * 0.16)
      arrow(w * 0.84, w * 0.6, h * 0.16)
    } else if (mode === 'diverge') {
      arrow(w * 0.4, w * 0.16, h * 0.16)
      arrow(w * 0.6, w * 0.84, h * 0.16)
    }

    const relief = peak - trough
    root.querySelector('#reliefVal')!.textContent = relief.toFixed(2)
    if (mode === 'converge') {
      onNarrate(
        peak > 0.85
          ? 'Collision pile-up: crust thickens into a range. Heat flickers along the suture.'
          : 'Plates push together. Elevation builds at the boundary — mountains are time × convergence.',
      )
    } else if (mode === 'diverge') {
      onNarrate(
        trough < 0.18
          ? 'Rift open: thinned crust sinks; water can flood the valley — a newborn ocean ditch.'
          : 'Plates pull apart. The middle drops. Markers drift outward on each flank.',
      )
    } else {
      onNarrate('Strike-slip: plates grind past. Markers shear; elevation barely changes — rivers would kink.')
    }

    raf = requestAnimationFrame(tick)
  }

  raf = requestAnimationFrame(tick)
  return () => {
    alive = false
    cancelAnimationFrame(raf)
  }
}
