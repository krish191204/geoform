import './style.css'
import { evaluateSuitability, recomputeDerived, recomputeSuitability } from './world/climate'
import { generateWorld, nextCityName, paintElevation } from './world/generate'
import {
  autosaveWorld,
  clearAutosave,
  downloadWorld,
  loadAutosave,
  readWorldFile,
} from './world/persist'
import { fetchWorldEngineWorld, recomputeWorldEngine } from './world/worldengine'
import { MapRenderer, screenToCell } from './render/draw'
import type { Layer, Tool, World } from './world/types'

const WIDTH = 320
const HEIGHT = 160

/** Local browser sim is the default. WorldEngine is an optional Python backend. */
type EngineChoice = 'local' | 'worldengine'

let seed = (Math.random() * 1e9) | 0
let world: World | null = null
let layer: Layer = 'relief'
let tool: Tool = 'raise'
let brush = 6
let strength = 0.045
let painting = false
let hover: { x: number; y: number } | null = null
let status = 'Loading…'
let busy = false
let recomputeTimer: number | null = null
let recomputeGeneration = 0
let autosaveTimer: number | null = null
let engineChoice: EngineChoice = 'local'
const renderer = new MapRenderer()
let raf = 0

const app = document.querySelector<HTMLDivElement>('#app')!

function scheduleAutosave() {
  if (!world) return
  if (autosaveTimer !== null) window.clearTimeout(autosaveTimer)
  autosaveTimer = window.setTimeout(() => {
    if (!world) return
    autosaveWorld(world)
    const stamp = new Date().toLocaleTimeString()
    const el = document.querySelector('#saveMeta')
    if (el) el.textContent = `Autosaved ${stamp}`
  }, 400)
}

function applyWorld(next: World, message: string) {
  world = next
  seed = next.seed
  const seedInput = document.querySelector<HTMLInputElement>('#seed')
  if (seedInput) seedInput.value = String(seed)
  renderer.invalidate()
  status = message
  document.querySelector('#status')!.textContent = status
  updateInspector()
  updateCities()
  scheduleAutosave()
}

function renderShell() {
  app.innerHTML = `
    <header class="topbar">
      <div class="brand">
        <h1>Geoform</h1>
        <p>Geography-aware worldbuilding in the browser — plates, rain shadows, biomes, settlement. Raise a ridge and climate recomputes.</p>
      </div>
      <div class="seed-row">
        <a class="chip-link" href="/labs.html">Geography labs</a>
        <a class="chip-link" href="/critique.html">Map critique</a>
        <a class="chip-link" href="/roadmap.html">Accuracy roadmap</a>
        <label for="seed">Seed</label>
        <input id="seed" type="number" value="${seed}" />
        <button type="button" id="regen" class="primary">New world</button>
        <button type="button" id="randomize">Random seed</button>
        <button type="button" id="export">Export JSON</button>
        <button type="button" id="import">Import</button>
        <input id="importFile" type="file" accept="application/json,.json" hidden />
        <span id="saveMeta" class="save-meta">No save yet</span>
      </div>
    </header>
    <div class="layout">
      <aside class="panel">
        <h2>Tools</h2>
        <div class="tool-grid" id="tools"></div>
        <div class="slider-row">
          <label>Brush size · <span id="brushVal">${brush}</span></label>
          <input id="brush" type="range" min="2" max="18" value="${brush}" />
        </div>
        <div class="slider-row">
          <label>Raise / lower strength</label>
          <input id="strength" type="range" min="1" max="12" value="${Math.round(strength * 100)}" />
        </div>
        <p class="hint">
          Runs entirely in this browser. Autosave stays here (no cloud).
          Export JSON to keep a copy. Optional Python backend is advanced-only.
        </p>
        <details class="advanced">
          <summary>Advanced engine</summary>
          <label for="engine">Backend</label>
          <select id="engine" title="Local is default. WorldEngine needs a separate Python process.">
            <option value="local" ${engineChoice === 'local' ? 'selected' : ''}>Local (browser) — default</option>
            <option value="worldengine" ${engineChoice === 'worldengine' ? 'selected' : ''}>WorldEngine (Python API)</option>
          </select>
          <p class="hint">WorldEngine is optional. Leave this on Local unless you ran <code>npm run dev:api</code>.</p>
        </details>
      </aside>
      <section class="map-shell">
        <canvas id="map"></canvas>
        <div class="map-overlay" id="layers"></div>
        <div class="loading" id="loading">Generating world…</div>
        <div class="api-banner" id="apiBanner" hidden></div>
      </section>
      <aside class="panel inspector">
        <h2>Inspector</h2>
        <div id="inspect"></div>
        <div class="status" id="status">${status}</div>
        <h3>Cities</h3>
        <ul class="city-list" id="cities"></ul>
      </aside>
    </div>
  `
  bind()
  startLoop()
  void boot()
}

async function apiHealthy(): Promise<boolean> {
  try {
    const res = await fetch('/health', { cache: 'no-store' })
    if (!res.ok) return false
    const body = (await res.json()) as { ok?: boolean }
    return body.ok === true
  } catch {
    return false
  }
}

function hideApiDown() {
  const banner = document.querySelector<HTMLDivElement>('#apiBanner')
  if (banner) {
    banner.hidden = true
    banner.innerHTML = ''
  }
}

function loadLocalWorld(nextSeed: number, note?: string) {
  setBusy(true, 'Generating world…')
  status = 'Generating local world…'
  document.querySelector('#status')!.textContent = status
  try {
    const next = generateWorld(WIDTH, HEIGHT, nextSeed)
    clearAutosave()
    applyWorld(
      next,
      note ?? `Seed ${next.seed} · ${next.plateCount} plates · rain shadows & biomes (browser)`,
    )
    hideApiDown()
  } finally {
    setBusy(false)
  }
}

async function boot() {
  hideApiDown()
  engineChoice = 'local'
  const sel = document.querySelector<HTMLSelectElement>('#engine')
  if (sel) sel.value = 'local'

  const saved = loadAutosave()
  if (saved) {
    applyWorld(
      saved,
      `Restored autosave (seed ${saved.seed}, ${saved.cities.length} cities). Generate a new world to discard.`,
    )
    const el = document.querySelector('#saveMeta')
    if (el) el.textContent = 'Restored from browser autosave'
    return
  }

  loadLocalWorld(seed)
}

function setBusy(on: boolean, message?: string) {
  busy = on
  const el = document.querySelector<HTMLDivElement>('#loading')
  if (el) {
    el.style.display = on ? 'grid' : 'none'
    if (message) el.textContent = message
  }
  document.querySelectorAll<HTMLButtonElement>('#regen, #randomize').forEach((b) => {
    b.disabled = on
  })
}

async function loadWorld(nextSeed: number) {
  if (engineChoice !== 'worldengine') {
    loadLocalWorld(nextSeed)
    return
  }

  setBusy(true, 'Contacting optional WorldEngine API…')
  status = 'Trying WorldEngine…'
  document.querySelector('#status')!.textContent = status
  try {
    if (!(await apiHealthy())) throw new Error('API offline')
    const next = await fetchWorldEngineWorld(nextSeed, WIDTH, HEIGHT, 10)
    clearAutosave()
    applyWorld(next, `WorldEngine seed ${next.seed} · ${next.plateCount} plates`)
    hideApiDown()
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    engineChoice = 'local'
    const sel = document.querySelector<HTMLSelectElement>('#engine')
    if (sel) sel.value = 'local'
    loadLocalWorld(nextSeed, `Python backend unavailable (${msg}) — using local engine instead.`)
  } finally {
    setBusy(false)
  }
}

function scheduleClimateRecompute() {
  if (!world) return
  if (recomputeTimer !== null) window.clearTimeout(recomputeTimer)
  const gen = ++recomputeGeneration
  recomputeTimer = window.setTimeout(() => {
    void (async () => {
      if (!world || gen !== recomputeGeneration) return

      const useLocal =
        world.engine === 'local' || engineChoice === 'local' || !(await apiHealthy())
      if (useLocal) {
        recomputeDerived(world)
        renderer.invalidate()
        scheduleAutosave()
        status = 'Climate updated (rain shadow, rivers, biomes).'
        document.querySelector('#status')!.textContent = status
        updateInspector()
        return
      }

      status = 'Recomputing climate…'
      document.querySelector('#status')!.textContent = status
      try {
        const next = await recomputeWorldEngine(world)
        if (gen !== recomputeGeneration) return
        applyWorld(next, 'Climate updated.')
      } catch (err) {
        recomputeDerived(world)
        renderer.invalidate()
        scheduleAutosave()
        status = `Backend recompute failed — used local climate (${err instanceof Error ? err.message : String(err)})`
        document.querySelector('#status')!.textContent = status
        updateInspector()
      }
    })()
  }, 650)
}

function bind() {
  const tools = document.querySelector('#tools')!
  const toolDefs: { id: Tool; label: string; desc: string }[] = [
    { id: 'raise', label: 'Raise', desc: 'Uplift — climate recomputes' },
    { id: 'lower', label: 'Lower', desc: 'Erode or sink terrain' },
    { id: 'city', label: 'Found city', desc: 'Only where geography allows' },
    { id: 'inspect', label: 'Inspect', desc: 'Read elevation, climate, score' },
  ]
  tools.innerHTML = toolDefs
    .map(
      (t) =>
        `<button type="button" class="tool ${tool === t.id ? 'active' : ''}" data-tool="${t.id}">${t.label}<small>${t.desc}</small></button>`,
    )
    .join('')
  tools.querySelectorAll<HTMLButtonElement>('[data-tool]').forEach((btn) => {
    btn.addEventListener('click', () => {
      tool = btn.dataset.tool as Tool
      tools.querySelectorAll('.tool').forEach((b) => b.classList.remove('active'))
      btn.classList.add('active')
    })
  })

  const layers = document.querySelector('#layers')!
  const layerDefs: { id: Layer; label: string }[] = [
    { id: 'relief', label: 'Relief' },
    { id: 'biome', label: 'Biome' },
    { id: 'moisture', label: 'Moisture' },
    { id: 'temperature', label: 'Heat' },
    { id: 'suitability', label: 'Settle' },
    { id: 'plates', label: 'Plates' },
    { id: 'elevation', label: 'Height' },
  ]
  layers.innerHTML = layerDefs
    .map(
      (l) =>
        `<button type="button" class="chip ${layer === l.id ? 'active' : ''}" data-layer="${l.id}">${l.label}</button>`,
    )
    .join('')
  layers.querySelectorAll<HTMLButtonElement>('[data-layer]').forEach((btn) => {
    btn.addEventListener('click', () => {
      layer = btn.dataset.layer as Layer
      if (layer === 'suitability' && world) recomputeSuitability(world)
      renderer.invalidate()
      layers.querySelectorAll('.chip').forEach((b) => b.classList.remove('active'))
      btn.classList.add('active')
      // paint loop will redraw
    })
  })

  document.querySelector('#engine')?.addEventListener('change', (e) => {
    engineChoice = (e.target as HTMLSelectElement).value as EngineChoice
  })

  document.querySelector('#brush')!.addEventListener('input', (e) => {
    brush = Number((e.target as HTMLInputElement).value)
    document.querySelector('#brushVal')!.textContent = String(brush)
  })
  document.querySelector('#strength')!.addEventListener('input', (e) => {
    strength = Number((e.target as HTMLInputElement).value) / 100
  })

  document.querySelector('#regen')!.addEventListener('click', () => {
    if (busy) return
    if (world?.cities.length && !confirm('Generate a new world? Current autosave will be replaced.')) return
    const input = document.querySelector<HTMLInputElement>('#seed')!
    seed = Number(input.value) || 1
    void loadWorld(seed)
  })
  document.querySelector('#randomize')!.addEventListener('click', () => {
    if (busy) return
    if (world?.cities.length && !confirm('Generate a new world? Current autosave will be replaced.')) return
    seed = (Math.random() * 1e9) | 0
    document.querySelector<HTMLInputElement>('#seed')!.value = String(seed)
    void loadWorld(seed)
  })

  document.querySelector('#export')!.addEventListener('click', () => {
    if (!world) return
    downloadWorld(world)
    status = `Exported geoform-seed-${world.seed}.json`
    document.querySelector('#status')!.textContent = status
  })

  const importFile = document.querySelector<HTMLInputElement>('#importFile')!
  document.querySelector('#import')!.addEventListener('click', () => importFile.click())
  importFile.addEventListener('change', () => {
    const file = importFile.files?.[0]
    importFile.value = ''
    if (!file) return
    void (async () => {
      try {
        const next = await readWorldFile(file)
        applyWorld(next, `Imported ${file.name} (seed ${next.seed}).`)
        const el = document.querySelector('#saveMeta')
        if (el) el.textContent = `Imported ${file.name}`
      } catch (err) {
        status = `Import failed: ${err instanceof Error ? err.message : String(err)}`
        document.querySelector('#status')!.textContent = status
      }
    })()
  })

  window.addEventListener('beforeunload', () => {
    if (world) autosaveWorld(world)
  })

  const canvas = document.querySelector<HTMLCanvasElement>('#map')!

  const applyAt = (clientX: number, clientY: number, shiftKey: boolean) => {
    if (!world || busy) return
    const cell = screenToCell(canvas, clientX, clientY, world)
    if (!cell) return
    hover = cell

    if (tool === 'raise' || tool === 'lower') {
      paintElevation(world, cell.x, cell.y, brush, tool === 'raise' ? strength : -strength)
      renderer.invalidate()
      scheduleAutosave()
      status =
        world.engine === 'local'
          ? 'Terrain edited — local climate will refresh…'
          : 'Terrain edited — waiting to recompute climate…'
      updateInspector()
      document.querySelector('#status')!.textContent = status
      scheduleClimateRecompute()
      return
    }

    if (tool === 'city') {
      tryPlaceCity(cell.x, cell.y, shiftKey)
      return
    }

    updateInspector()
  }

  canvas.addEventListener('pointerdown', (e) => {
    painting = true
    canvas.setPointerCapture(e.pointerId)
    applyAt(e.clientX, e.clientY, e.shiftKey)
  })
  canvas.addEventListener('pointermove', (e) => {
    if (!world) return
    const cell = screenToCell(canvas, e.clientX, e.clientY, world)
    hover = cell
    if (painting && (tool === 'raise' || tool === 'lower')) {
      applyAt(e.clientX, e.clientY, e.shiftKey)
    } else {
      updateInspector()
    }
  })
  canvas.addEventListener('pointerup', () => {
    painting = false
  })
  canvas.addEventListener('pointerleave', () => {
    painting = false
    hover = null
  })
}

function tryPlaceCity(x: number, y: number, force: boolean) {
  if (!world) return
  const result = evaluateSuitability(world, x, y)
  if (world.cities.some((c) => Math.hypot(c.x - x, c.y - y) < 4)) {
    status = 'Too close to an existing city.'
    document.querySelector('#status')!.textContent = status
    updateInspector()
    return
  }

  if (!result.ok && !force) {
    status = `Blocked: ${result.reasons[0]} (score ${(result.score * 100) | 0}%). Hold Shift to force.`
    document.querySelector('#status')!.textContent = status
    updateInspector()
    return
  }

  const name = nextCityName(world)
  world.cities.push({ x, y, name, score: result.score })
  status =
    force && !result.ok
      ? `Forced ${name} onto a poor site (${(result.score * 100) | 0}%).`
      : `Founded ${name} — suitability ${(result.score * 100) | 0}%.`
  updateInspector()
  updateCities()
  document.querySelector('#status')!.textContent = status
  scheduleAutosave()
}

function startLoop() {
  cancelAnimationFrame(raf)
  const tick = () => {
    paint()
    raf = requestAnimationFrame(tick)
  }
  raf = requestAnimationFrame(tick)
}

function paint() {
  if (!world) return
  const canvas = document.querySelector<HTMLCanvasElement>('#map')
  if (!canvas) return
  const ctx = canvas.getContext('2d')!
  renderer.draw(ctx, world, {
    layer,
    showRivers: true,
    showCities: true,
    scale: 4,
    hover,
    brush,
    tool,
    painting,
  })
}

function updateInspector() {
  const el = document.querySelector('#inspect')
  if (!el) return
  if (!world || !hover) {
    el.innerHTML = `<p class="hint">Hover the map to read a cell.</p>`
    return
  }
  const { x, y } = hover
  const i = y * world.width + x
  const suit = evaluateSuitability(world, x, y)
  el.innerHTML = `
    <dl>
      <dt>Engine</dt><dd>${world.engine}</dd>
      <dt>Cell</dt><dd>${x}, ${y}</dd>
      <dt>Elevation</dt><dd>${(world.elev[i] * 100) | 0}%</dd>
      <dt>Sea level</dt><dd>${world.elev[i] < world.seaLevel ? 'Ocean' : 'Land'}</dd>
      <dt>Temperature</dt><dd>${(world.temp[i] * 100) | 0}%</dd>
      <dt>Moisture</dt><dd>${(world.moist[i] * 100) | 0}%</dd>
      <dt>River flux</dt><dd>${world.flux[i].toFixed(1)}</dd>
      <dt>Biome</dt><dd>${world.biome[i]}</dd>
      <dt>Plate</dt><dd>#${world.plateId[i]}</dd>
      <dt>Suitability</dt><dd>${(suit.score * 100) | 0}%</dd>
    </dl>
    <ul class="reasons">
      ${suit.reasons.map((r) => `<li class="${suit.ok ? 'good' : 'bad'}">${r}</li>`).join('')}
    </ul>
  `
}

function updateCities() {
  const el = document.querySelector('#cities')
  if (!el) return
  if (!world?.cities.length) {
    el.innerHTML = `<li><span>None yet</span><span>—</span></li>`
    return
  }
  el.innerHTML = world.cities
    .map((c) => `<li><span>${c.name}</span><span>${(c.score * 100) | 0}%</span></li>`)
    .join('')
}

renderShell()
