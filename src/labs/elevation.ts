/**
 * Lab 01 — raise a mountain, watch the summit freeze.
 * Lapse rate: air cools about 6.5 °C per km of height. Same latitude,
 * different world once you have a peak.
 */
import { approach, ambientPhase, EASE, prefersReducedMotion } from './motion'
import { clamp, drawAtmosphere, lerp, resizeCanvas, softNoise, type StopFn } from './shared'

const LAPSE = 6.5

export function mountElevation(root: HTMLElement, onNarrate: (t: string) => void): StopFn {
  let peakKmT = 3.2
  let seaTempT = 18
  let peakKm = peakKmT
  let seaTemp = seaTempT

  root.innerHTML = `
    <div class="demo-grid">
      <div class="demo-canvas-wrap tall scene">
        <canvas id="elevCanvas"></canvas>
      </div>
      <div class="demo-controls">
        <label>
          Peak height · <strong id="peakVal">${peakKmT.toFixed(1)} km</strong>
          <input id="peak" type="range" min="0.4" max="6" step="0.1" value="${peakKmT}" />
        </label>
        <label>
          Valley temperature · <strong id="seaVal">${seaTempT} °C</strong>
          <input id="sea" type="range" min="0" max="32" step="1" value="${seaTempT}" />
        </label>
        <div class="stat-grid">
          <div><span>Summit T</span><strong id="sumT">—</strong></div>
          <div><span>Snow line</span><strong id="snowLine">—</strong></div>
          <div><span>Lapse</span><strong>6.5 °C/km</strong></div>
        </div>
        <p class="hint">Drag the ridge. Snow is the 0 °C contour — the same lapse the atlas uses on mountains.</p>
      </div>
    </div>
  `

  const canvas = root.querySelector<HTMLCanvasElement>('#elevCanvas')!
  const ctx = canvas.getContext('2d')!
  const N = 160
  const profile = new Float32Array(N)
  const rebuild = () => {
    for (let i = 0; i < N; i++) {
      const x = i / (N - 1)
      const mountain = Math.exp(-Math.pow((x - 0.52) / 0.2, 2))
      const foothills = 0.2 * Math.exp(-Math.pow((x - 0.3) / 0.14, 2))
      const detail = softNoise(x * 10, 1.2, 2) * 0.045
      profile[i] = clamp(mountain * 0.92 + foothills + detail, 0.02, 1)
    }
  }
  rebuild()

  let dragging = false
  let raf = 0
  let alive = true
  let last = performance.now()
  let snowAlpha = 0

  const elevAt = (i: number) => profile[i] * peakKm
  const tempAt = (elevKm: number) => seaTemp - LAPSE * elevKm
  const snowLineKm = () => (seaTemp <= 0 ? 0 : seaTemp / LAPSE)

  const updateReadout = () => {
    const summit = tempAt(peakKm * Math.max(...profile))
    root.querySelector('#peakVal')!.textContent = `${peakKmT.toFixed(1)} km`
    root.querySelector('#seaVal')!.textContent = `${seaTempT} °C`
    root.querySelector('#sumT')!.textContent = `${summit.toFixed(1)} °C`
    const sl = snowLineKm()
    root.querySelector('#snowLine')!.textContent =
      sl > peakKm * 0.98 ? 'none (too warm)' : `${sl.toFixed(2)} km`
    if (summit < -5) onNarrate('Hard alpine: summit well below freezing. Ice and rock; short seasons below.')
    else if (summit < 0) onNarrate('Snow cap locked. The 0 °C contour sits on the flank — forests stop beneath it.')
    else if (peakKm < 1.2) onNarrate('Gentle hill: little lapse. Summit and valley feel similar. Raise the peak.')
    else onNarrate('Cooler aloft, milder in the valley — same air mass, different elevation.')
  }

  root.querySelector<HTMLInputElement>('#peak')!.oninput = (e) => {
    peakKmT = Number((e.target as HTMLInputElement).value)
    updateReadout()
  }
  root.querySelector<HTMLInputElement>('#sea')!.oninput = (e) => {
    seaTempT = Number((e.target as HTMLInputElement).value)
    updateReadout()
  }

  const paintAt = (clientX: number, clientY: number) => {
    const rect = canvas.getBoundingClientRect()
    const x = (clientX - rect.left) / rect.width
    const y = (clientY - rect.top) / rect.height
    const i = clamp(Math.round(x * (N - 1)), 0, N - 1)
    const h = clamp(1 - (y - 0.1) / 0.72, 0.02, 1)
    const radius = 7
    for (let k = -radius; k <= radius; k++) {
      const j = i + k
      if (j < 0 || j >= N) continue
      const w = EASE.elegant(1 - Math.abs(k) / (radius + 1))
      profile[j] = lerp(profile[j], h, 0.4 * w)
    }
  }

  canvas.addEventListener('pointerdown', (e) => {
    dragging = true
    canvas.setPointerCapture(e.pointerId)
    paintAt(e.clientX, e.clientY)
  })
  canvas.addEventListener('pointermove', (e) => {
    if (dragging) paintAt(e.clientX, e.clientY)
  })
  canvas.addEventListener('pointerup', () => {
    dragging = false
  })

  const pathY = (i: number, baseY: number, skyH: number) => {
    const elev = elevAt(i)
    return baseY - (elev / Math.max(peakKm, 0.4)) * (skyH * 0.74)
  }

  const tick = (now: number) => {
    if (!alive) return
    const dt = Math.min(0.05, (now - last) / 1000)
    last = now
    peakKm = approach(peakKm, peakKmT, dt, 7)
    seaTemp = approach(seaTemp, seaTempT, dt, 7)

    const { w, h, dpr } = resizeCanvas(canvas)
    ctx.clearRect(0, 0, w, h)
    drawAtmosphere(ctx, w, h, now)

    const baseY = h * 0.8
    const skyH = baseY
    const breath = EASE.breathe(ambientPhase(now, 7))

    // temperature veil (staging: cool tones rise)
    for (let band = 0; band < 32; band++) {
      const y0 = (band / 32) * skyH
      const elevApprox = ((skyH - y0) / (skyH * 0.75)) * peakKm
      const temp = tempAt(Math.max(0, elevApprox))
      const cold = clamp((-temp + 6) / 26, 0, 1)
      const warm = clamp((temp - 4) / 24, 0, 1)
      ctx.fillStyle = `rgba(${lerp(100, 230, warm) | 0}, ${lerp(150, 120, cold) | 0}, ${lerp(210, 95, warm) | 0}, 0.055)`
      ctx.fillRect(0, y0, w, skyH / 32 + 1)
    }

    // mountain body with form lighting (solid drawing)
    ctx.beginPath()
    ctx.moveTo(0, baseY)
    for (let i = 0; i < N; i++) {
      const x = (i / (N - 1)) * w
      ctx.lineTo(x, pathY(i, baseY, skyH))
    }
    ctx.lineTo(w, baseY)
    ctx.closePath()
    const rock = ctx.createLinearGradient(0, skyH * 0.15, 0, baseY)
    rock.addColorStop(0, '#e8e4df')
    rock.addColorStop(0.35, '#9a9084')
    rock.addColorStop(0.7, '#6f8458')
    rock.addColorStop(1, '#4f6a42')
    ctx.fillStyle = rock
    ctx.fill()

    // soft shade on lee flank
    ctx.save()
    ctx.clip()
    const shade = ctx.createLinearGradient(w * 0.35, 0, w * 0.85, 0)
    shade.addColorStop(0, 'rgba(255,255,255,0.08)')
    shade.addColorStop(0.45, 'rgba(0,0,0,0)')
    shade.addColorStop(1, 'rgba(20,30,35,0.22)')
    ctx.fillStyle = shade
    ctx.fillRect(0, 0, w, h)
    ctx.restore()

    // snow cap with secondary sparkle (appeal)
    const targetSnow = tempAt(peakKm * Math.max(...profile)) < 0 ? 1 : 0
    snowAlpha = approach(snowAlpha, targetSnow, dt, 4)
    if (snowAlpha > 0.02) {
      ctx.beginPath()
      let started = false
      for (let i = 0; i < N; i++) {
        if (tempAt(elevAt(i)) >= 0) {
          if (started) break
          continue
        }
        const x = (i / (N - 1)) * w
        const y = pathY(i, baseY, skyH)
        if (!started) {
          ctx.moveTo(x, y)
          started = true
        } else ctx.lineTo(x, y)
      }
      ctx.strokeStyle = `rgba(245,250,255,${0.55 + 0.25 * snowAlpha})`
      ctx.lineWidth = 14 * dpr * snowAlpha
      ctx.lineCap = 'round'
      ctx.stroke()

      // fill snow blanket
      ctx.beginPath()
      started = false
      let firstX = 0
      let lastX = 0
      for (let i = 0; i < N; i++) {
        if (tempAt(elevAt(i)) >= 0) continue
        const x = (i / (N - 1)) * w
        const y = pathY(i, baseY, skyH)
        if (!started) {
          ctx.moveTo(x, y)
          firstX = x
          started = true
        } else ctx.lineTo(x, y)
        lastX = x
      }
      if (started) {
        ctx.lineTo(lastX, pathY(Math.round((lastX / w) * (N - 1)), baseY, skyH) + 18 * dpr)
        ctx.lineTo(firstX, pathY(Math.round((firstX / w) * (N - 1)), baseY, skyH) + 18 * dpr)
        ctx.closePath()
        ctx.fillStyle = `rgba(240,246,252,${0.82 * snowAlpha})`
        ctx.fill()
      }
    }

    // snow line — primary staged annotation
    const sl = snowLineKm()
    if (sl > 0 && sl < peakKm) {
      const y = baseY - (sl / peakKm) * (skyH * 0.74)
      ctx.strokeStyle = `rgba(20,32,28,${0.35 + 0.1 * breath})`
      ctx.setLineDash([7 * dpr, 7 * dpr])
      ctx.lineWidth = 1.5 * dpr
      ctx.beginPath()
      ctx.moveTo(w * 0.06, y)
      ctx.lineTo(w * 0.94, y)
      ctx.stroke()
      ctx.setLineDash([])
      ctx.fillStyle = 'rgba(20,32,28,0.72)'
      ctx.font = `600 ${12 * dpr}px Outfit, sans-serif`
      ctx.fillText('0 °C snow line', w * 0.07, y - 10 * dpr)
    }

    // temperature beads along ridge (secondary action, staggered phase)
    for (let k = 0; k < 5; k++) {
      const xNorm = 0.18 + k * 0.16
      const i = Math.round(xNorm * (N - 1))
      const elev = elevAt(i)
      const temp = tempAt(elev)
      const x = xNorm * w
      const bob = prefersReducedMotion() ? 0 : Math.sin(now * 0.002 + k * 1.1) * 3 * dpr
      const y = pathY(i, baseY, skyH) - 22 * dpr + bob
      const pulse = 0.85 + 0.15 * EASE.breathe(ambientPhase(now + k * 400, 3.7))
      ctx.beginPath()
      ctx.arc(x, y, 5.5 * dpr * pulse, 0, Math.PI * 2)
      ctx.fillStyle = temp < 0 ? `rgba(170,205,230,${0.9})` : `rgba(230,150,80,${0.9})`
      ctx.fill()
      ctx.strokeStyle = 'rgba(255,255,255,0.55)'
      ctx.lineWidth = 1.2 * dpr
      ctx.stroke()
      ctx.fillStyle = 'rgba(20,32,28,0.78)'
      ctx.font = `600 ${11 * dpr}px Outfit, sans-serif`
      ctx.fillText(`${temp.toFixed(0)}°`, x + 9 * dpr, y + 4 * dpr)
    }

    // valley floor
    const floor = ctx.createLinearGradient(0, baseY, 0, h)
    floor.addColorStop(0, '#6a8754')
    floor.addColorStop(1, '#4e6a42')
    ctx.fillStyle = floor
    ctx.fillRect(0, baseY, w, h - baseY)

    updateReadout()
    raf = requestAnimationFrame(tick)
  }

  updateReadout()
  raf = requestAnimationFrame(tick)
  return () => {
    alive = false
    cancelAnimationFrame(raf)
  }
}
