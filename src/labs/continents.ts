/**
 * Lab 06 — Full continents vs islands.
 * Same generateWorld as the map editor. Switch the chips and watch speckles
 * drown (continents) or stay (islands). Land % grows/shrinks coasts, it does
 * not sprinkle new islands.
 */
import { generateWorld } from '../world/generate'
import { landFraction } from '../world/land'
import {
  CONTINENT_MASS_OPTIONS,
  landmassStats,
  type ContinentMass,
} from '../world/mass'
import { paintTerrain, resizeCanvas, type StopFn } from './shared'

const GW = 120
const GH = 60

export function mountContinents(root: HTMLElement, onNarrate: (t: string) => void): StopFn {
  let mass: ContinentMass = 'continents'
  let landT = 0.4
  let land = landT
  let seed = 21
  let world = generateWorld(GW, GH, seed, land, mass)
  let dirty = true

  root.innerHTML = `
    <div class="demo-grid">
      <div class="demo-canvas-wrap tall scene">
        <canvas id="contCanvas"></canvas>
      </div>
      <div class="demo-controls">
        <div class="btn-row" id="massRow">
          ${CONTINENT_MASS_OPTIONS.map(
            (opt) =>
              `<button type="button" class="chip-btn ${opt.id === mass ? 'active' : ''}" data-mass="${opt.id}">${opt.label}</button>`,
          ).join('')}
        </div>
        <label>
          Land share · <strong id="landVal">${Math.round(landT * 100)}%</strong>
          <input id="land" type="range" min="16" max="62" value="${Math.round(landT * 100)}" />
        </label>
        <div class="btn-row">
          <button type="button" class="chip-btn" id="reshuffle">New seed</button>
        </div>
        <div class="stat-grid">
          <div><span>Masses</span><strong id="compN">—</strong></div>
          <div><span>Largest</span><strong id="largest">—</strong></div>
          <div><span>Land</span><strong id="mixVal">—</strong></div>
        </div>
        <p class="hint">Same generator as the map editor. Full continents keep a few large masses even when the world is wet.</p>
      </div>
    </div>
  `

  const canvas = root.querySelector<HTMLCanvasElement>('#contCanvas')!
  const ctx = canvas.getContext('2d')!

  const rebuild = () => {
    world = generateWorld(GW, GH, seed, land, mass)
    dirty = true
    const stats = landmassStats(world)
    const mix = landFraction(world.elev, world.seaLevel)
    root.querySelector('#compN')!.textContent = String(stats.components)
    root.querySelector('#largest')!.textContent = `${Math.round(stats.largestShare * 100)}%`
    root.querySelector('#mixVal')!.textContent = `${Math.round(mix * 100)}%`
    if (mass === 'continents') {
      onNarrate(
        stats.components <= 6
          ? 'A handful of continents with gulfs — climate and rivers will follow this land.'
          : 'Still gathering land into continents. Raise land share or hit New seed.',
      )
    } else if (mass === 'islands') {
      onNarrate('Island world on purpose: many scraps in open ocean. Switch to Full continents for Earth-like masses.')
    } else {
      onNarrate('Mixed: large masses plus smaller islands. Speckles stay only if they earn it.')
    }
  }

  let regenTimer = 0
  const scheduleRebuild = () => {
    window.clearTimeout(regenTimer)
    regenTimer = window.setTimeout(rebuild, 60)
  }

  root.querySelectorAll<HTMLButtonElement>('[data-mass]').forEach((btn) => {
    btn.addEventListener('click', () => {
      mass = btn.dataset.mass as ContinentMass
      root.querySelectorAll('[data-mass]').forEach((b) => b.classList.toggle('active', b === btn))
      rebuild()
    })
  })
  root.querySelector<HTMLInputElement>('#land')!.oninput = (e) => {
    landT = Number((e.target as HTMLInputElement).value) / 100
    land = landT
    root.querySelector('#landVal')!.textContent = `${Math.round(landT * 100)}%`
    scheduleRebuild()
  }
  root.querySelector('#reshuffle')!.addEventListener('click', () => {
    seed = (Math.random() * 1e9) | 0
    rebuild()
  })

  rebuild()

  let raf = 0
  let alive = true
  let img: ImageData | null = null
  const mapped = new Float32Array(GW * GH)

  const tick = () => {
    if (!alive) return
    const { w, h } = resizeCanvas(canvas)
    if (!img || img.width !== w || img.height !== h) img = ctx.createImageData(w, h)
    if (dirty && img) {
      const sea = world.seaLevel
      for (let i = 0; i < mapped.length; i++) {
        const e = world.elev[i]
        mapped[i] = e < sea ? (e / Math.max(1e-6, sea)) * 0.1 : 0.14 + ((e - sea) / Math.max(0.08, 1 - sea)) * 0.82
      }
      paintTerrain(img, mapped, GW, GH, { moisture: world.moist, seaLevel: 0.12 })
      dirty = false
    }
    if (img) ctx.putImageData(img, 0, 0)
    raf = requestAnimationFrame(tick)
  }
  raf = requestAnimationFrame(tick)

  return () => {
    alive = false
    window.clearTimeout(regenTimer)
    cancelAnimationFrame(raf)
  }
}
