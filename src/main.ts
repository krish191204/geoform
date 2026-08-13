/**
 * Map editor page (`/`). This is the big one.
 *
 * Mental model:
 *  - `world` is the planet (arrays). Null until boot finishes.
 *  - `history` is undo/redo snapshots.
 *  - `renderer` draws the canvas from those arrays.
 *  - Buttons mutate `world`, then we redraw.
 *
 * Default engine is Local (browser). WorldEngine is the optional dropdown.
 * Typical size: 320×160. Zoom-out adds real cells (expand.ts), it does not
 * CSS-shrink the picture.
 *
 * If you are lost, open HOW_IT_WORKS.md then src/world/types.ts.
 */
import './style.css'
import { navHtml } from './chrome/nav'
import { evaluateSuitability, recomputeDerived, recomputeSuitability } from './world/climate'
import { generateWorld, nextCityName } from './world/generate'
import { EditHistory } from './world/history'
import {
  autosaveWorld,
  clearAutosave,
  downloadWorld,
  loadAutosave,
  readWorldFile,
} from './world/persist'
import {
  brushChannel,
  brushPlateau,
  brushRaise,
  brushRidge,
  brushSeaLevel,
  brushSmooth,
  removeNearestCity,
  suggestCities,
} from './world/tools'
import { addContinent, findOceanSite, CONTINENT_STYLES, type ContinentStyle } from './world/continents'
import { expandWorld, padsForZoomOut } from './world/expand'
import { chewStraightCoasts } from './world/coasts'
import { refreshGeography } from './world/geography'
import { applyLandRatio, DEFAULT_LAND_RATIO, landFraction } from './world/land'
import {
  clampContinentMass,
  CONTINENT_MASS_OPTIONS,
  DEFAULT_CONTINENT_MASS,
  reshapeLandmasses,
  type ContinentMass,
} from './world/mass'
import { MAX_AGE_MA, reconstructPast } from './world/timeline'
import { fetchWorldEngineWorld, recomputeWorldEngine } from './world/worldengine'
import { MapRenderer, screenToCell, type MapLook } from './render/draw'
import { PlanetView } from './render/globe'
import type { Layer, Tool, World } from './world/types'

const WIDTH = 320
const HEIGHT = 160

type EngineChoice = 'local' | 'worldengine'

// --- live editor state (one planet, one brush, one view) ---

const TERRAIN_TOOLS: Tool[] = [
  'raise',
  'lower',
  'smooth',
  'ridge',
  'channel',
  'plateau',
  'sea',
  'land',
]

let seed = (Math.random() * 1e9) | 0
let landRatio = DEFAULT_LAND_RATIO
let continentMass: ContinentMass = DEFAULT_CONTINENT_MASS
let world: World | null = null
let layer: Layer = 'relief'
let tool: Tool = 'raise'
let continentStyle: ContinentStyle = 'collision'
let brush = 6
let strength = 0.045
let softness = 0.7
let painting = false
let strokeActive = false
let hover: { x: number; y: number } | null = null
let lastCell: { x: number; y: number } | null = null
let status = 'Loading…'
let busy = false
let recomputeTimer: number | null = null
let recomputeGeneration = 0
let autosaveTimer: number | null = null
let engineChoice: EngineChoice = 'local'
let viewZoom = 1
let viewPanX = 0
let viewPanY = 0
let viewMode: 'atlas' | 'planet' = 'atlas'
let globeLook: MapLook = 'relief'
let planet: PlanetView | null = null
let panning = false
let panStart = { x: 0, y: 0, panX: 0, panY: 0 }
let spaceDown = false
let climatePhase: 'idle' | 'painting' | 'updating' = 'idle'
let pendingNewWorld: (() => void) | null = null
let timelineAge = 0
let timelineView: World | null = null
let timelineTimer: number | null = null
const history = new EditHistory()
const renderer = new MapRenderer()
let raf = 0

const app = document.querySelector<HTMLDivElement>('#app')!

/** Debounced write to localStorage. Another computer will not see this. */
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

function setStatus(msg: string) {
  status = msg
  const el = document.querySelector('#status')
  if (el) el.textContent = status
}

/** Swap in a new planet (New world, Load, undo). Reset the deep-time slider to Present. */
function applyWorld(next: World, message: string) {
  world = next
  seed = next.seed
  landRatio = next.landRatio
  continentMass = clampContinentMass(next.continentMass)
  timelineAge = 0
  timelineView = null
  history.clear()
  resetView()
  const seedInput = document.querySelector<HTMLInputElement>('#seed')
  if (seedInput) seedInput.value = String(seed)
  syncLandRatioUi()
  syncMassUi()
  syncTimelineUi()
  refreshGeography(next, { sculpt: false })
  renderer.invalidate()
  setStatus(message)
  setClimatePhase('idle')
  updateInspector()
  updateGeoFlags()
  updateCities()
  updateHistoryButtons()
  scheduleAutosave()
}

function resetView() {
  viewZoom = 1
  viewPanX = 0
  viewPanY = 0
  planet?.reset()
  applyViewTransform()
}

/** Size the canvas so the whole grid fits in the map pane (letterbox is UI, not ocean). */
function fitAtlasCanvas() {
  const canvas = document.querySelector<HTMLCanvasElement>('#map')
  const vp = document.querySelector<HTMLElement>('#mapViewport')
  const src = displayWorld() ?? world
  if (!canvas || !vp || !src) return
  const aspect = src.width / Math.max(1, src.height)
  const vw = vp.clientWidth
  const vh = vp.clientHeight
  if (vw < 2 || vh < 2) return
  let w = vw
  let h = w / aspect
  if (h > vh) {
    h = vh
    w = h * aspect
  }
  canvas.style.width = `${Math.max(1, Math.round(w))}px`
  canvas.style.height = `${Math.max(1, Math.round(h))}px`
}

function applyViewTransform() {
  const canvas = document.querySelector<HTMLCanvasElement>('#map')
  if (!canvas) return
  fitAtlasCanvas()
  canvas.style.transform = `translate(${viewPanX}px, ${viewPanY}px) scale(${viewZoom})`
  const hud = document.querySelector('#hudZoom')
  if (hud) {
    hud.textContent =
      viewMode === 'planet' ? 'Globe' : `${Math.round(viewZoom * 100)}%`
  }
}

function isLayerLook(look: MapLook): look is Layer {
  return look !== 'satellite' && look !== 'night'
}

/** Atlas = 2D map. Planet = 3D globe of the same arrays. */
function setViewMode(mode: 'atlas' | 'planet') {
  viewMode = mode
  const map = document.querySelector<HTMLCanvasElement>('#map')
  const globe = document.querySelector<HTMLCanvasElement>('#globe')
  if (map) map.hidden = mode === 'planet'
  if (globe) globe.hidden = mode === 'atlas'
  document.querySelector('#viewAtlas')?.classList.toggle('active', mode === 'atlas')
  document.querySelector('#viewPlanet')?.classList.toggle('active', mode === 'planet')
  if (mode === 'planet') {
    if (isLayerLook(layer)) globeLook = layer
    planet?.layout()
    renderer.invalidate()
    setStatus('Planet — drag to spin, drag up/down to tilt, scroll to zoom. Looks change the surface.')
  } else {
    if (isLayerLook(globeLook)) layer = globeLook
    setStatus('Atlas view')
  }
  renderLayerChips()
  applyViewTransform()
}

function renderLayerChips() {
  const layers = document.querySelector('#layers')
  if (!layers) return
  const defs: { id: MapLook; label: string }[] =
    viewMode === 'planet'
      ? [
          { id: 'relief', label: 'Relief' },
          { id: 'satellite', label: 'Satellite' },
          { id: 'night', label: 'Night' },
          { id: 'biome', label: 'Biome' },
          { id: 'moisture', label: 'Moisture' },
          { id: 'temperature', label: 'Heat' },
          { id: 'plates', label: 'Plates' },
          { id: 'elevation', label: 'Height' },
        ]
      : [
          { id: 'relief', label: 'Relief' },
          { id: 'biome', label: 'Biome' },
          { id: 'moisture', label: 'Moisture' },
          { id: 'temperature', label: 'Heat' },
          { id: 'suitability', label: 'Settle' },
          { id: 'plates', label: 'Plates' },
          { id: 'elevation', label: 'Height' },
        ]
  const current = viewMode === 'planet' ? globeLook : layer
  layers.innerHTML = defs
    .map(
      (l) =>
        `<button type="button" class="chip ${current === l.id ? 'active' : ''}" data-look="${l.id}">${l.label}</button>`,
    )
    .join('')
  layers.querySelectorAll<HTMLButtonElement>('[data-look]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const next = btn.dataset.look as MapLook
      if (viewMode === 'planet') {
        globeLook = next
        if (isLayerLook(next)) layer = next
      } else if (isLayerLook(next)) {
        layer = next
        globeLook = next
        if (layer === 'suitability' && world) recomputeSuitability(world)
      }
      renderer.invalidate()
      planet?.setLook(globeLook)
      renderLayerChips()
    })
  })
}

function syncMassUi() {
  const current = world?.continentMass ?? continentMass
  document.querySelectorAll<HTMLButtonElement>('[data-mass]').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.mass === current)
  })
}

function updateGeoFlags() {
  const el = document.querySelector('#geoFlags')
  if (!el) return
  el.innerHTML = ''
}

function syncLandRatioUi() {
  const pct = Math.round((world?.landRatio ?? landRatio) * 100)
  const input = document.querySelector<HTMLInputElement>('#landRatio')
  if (input && document.activeElement !== input) input.value = String(pct)
  const landEl = document.querySelector('#landVal')
  const waterEl = document.querySelector('#waterVal')
  if (landEl) landEl.textContent = String(pct)
  if (waterEl) waterEl.textContent = String(100 - pct)
}

/** Present map, or a reconstructed past if the Age slider is not 0. */
function displayWorld(): World | null {
  if (timelineAge > 0.5 && timelineView) return timelineView
  return world
}

function syncTimelineUi() {
  const input = document.querySelector<HTMLInputElement>('#timeline')
  if (input && document.activeElement !== input) input.value = String(Math.round(timelineAge))
  const el = document.querySelector('#ageVal')
  if (el) el.textContent = timelineAge < 0.5 ? 'Present' : `${Math.round(timelineAge)} Ma`
}

function setTimelineAge(age: number) {
  timelineAge = Math.max(0, Math.min(MAX_AGE_MA, age))
  syncTimelineUi()
  if (!world || timelineAge < 0.5) {
    timelineView = null
    renderer.invalidate()
    if (world) setStatus('Present — mountains, rivers, and climate follow the continents.')
    return
  }
  timelineView = reconstructPast(world, timelineAge)
  renderer.invalidate()
  updateInspector()
  setStatus(`${Math.round(timelineAge)} Ma — reconstructed from today’s plates.`)
}

function scheduleTimeline(age: number) {
  timelineAge = Math.max(0, Math.min(MAX_AGE_MA, age))
  syncTimelineUi()
  if (timelineTimer !== null) window.clearTimeout(timelineTimer)
  timelineTimer = window.setTimeout(() => setTimelineAge(timelineAge), 40)
}

function pickCell(clientX: number, clientY: number): { x: number; y: number } | null {
  const src = displayWorld()
  if (!src) return null
  if (viewMode === 'planet') {
    if (!planet) return null
    return planet.pick(clientX, clientY, src)
  }
  const canvas = document.querySelector<HTMLCanvasElement>('#map')
  if (!canvas) return null
  return screenToCell(canvas, clientX, clientY, src)
}

function zoomFocus(clientX: number, clientY: number): { fx: number; fy: number } {
  const canvas = document.querySelector<HTMLCanvasElement>('#map')
  const viewport = document.querySelector<HTMLElement>('#mapViewport')
  const canvasRect = canvas?.getBoundingClientRect()
  if (
    canvasRect &&
    clientX >= canvasRect.left &&
    clientX <= canvasRect.right &&
    clientY >= canvasRect.top &&
    clientY <= canvasRect.bottom
  ) {
    return {
      fx: (clientX - canvasRect.left) / Math.max(1, canvasRect.width),
      fy: (clientY - canvasRect.top) / Math.max(1, canvasRect.height),
    }
  }
  const vr = viewport?.getBoundingClientRect()
  if (!vr) return { fx: 0.5, fy: 0.5 }
  return {
    fx: (clientX - vr.left) / Math.max(1, vr.width),
    fy: (clientY - vr.top) / Math.max(1, vr.height),
  }
}

/**
 * Zoom-out: add real cells around the map so it still fills the view.
 * If we are already at 640×320 we just zoom the camera instead.
 */
function tryExpandOnZoomOut(factor: number, fx: number, fy: number): boolean {
  if (!world || busy || strokeActive || factor >= 1) return false
  const vp = document.querySelector<HTMLElement>('#mapViewport')
  const target = viewZoom < 0.999 ? viewZoom * factor : factor
  const pads = padsForZoomOut(
    world,
    target,
    fx,
    fy,
    vp?.clientWidth ?? 0,
    vp?.clientHeight ?? 0,
  )
  if (!pads) return false
  beginStroke('Expand map')
  strokeActive = false
  const ok = expandWorld(world, pads.left, pads.right, pads.top, pads.bottom)
  if (!ok) {
    history.cancelLast()
    return false
  }
  viewZoom = 1
  viewPanX = 0
  viewPanY = 0
  applyViewTransform()
  timelineAge = 0
  timelineView = null
  syncTimelineUi()
  try {
    refreshGeography(world, { sculpt: false })
  } catch {
    recomputeDerived(world)
  }
  renderer.invalidate()
  setClimatePhase('idle')
  updateCities()
  updateInspector()
  updateHistoryButtons()
  scheduleAutosave()
  setStatus(`Atlas grew to ${world.width}×${world.height}`)
  return true
}

function zoomAt(clientX: number, clientY: number, factor: number) {
  const canvas = document.querySelector<HTMLCanvasElement>('#map')
  if (!canvas) return
  const { fx, fy } = zoomFocus(clientX, clientY)

  if (factor < 1 && viewZoom * factor < 1.02) {
    if (tryExpandOnZoomOut(factor, fx, fy)) return
    viewZoom = 1
    viewPanX = 0
    viewPanY = 0
    applyViewTransform()
    return
  }

  const oldZoom = viewZoom
  const next = Math.max(1, Math.min(3.2, oldZoom * factor))
  if (next === oldZoom) return
  const rect = canvas.getBoundingClientRect()
  const w = Math.max(1, rect.width)
  const h = Math.max(1, rect.height)
  const cfx = (clientX - rect.left) / w
  const cfy = (clientY - rect.top) / h
  viewPanX += (cfx - 0.5) * w * (1 - next / oldZoom)
  viewPanY += (cfy - 0.5) * h * (1 - next / oldZoom)
  viewZoom = next
  if (viewZoom <= 1.001) {
    viewZoom = 1
    viewPanX = 0
    viewPanY = 0
  }
  applyViewTransform()
}

function focusCell(x: number, y: number) {
  hover = { x, y }
  const canvas = document.querySelector<HTMLCanvasElement>('#map')
  if (!canvas || !world) return
  viewZoom = Math.max(viewZoom, 1.65)
  const lx = ((x + 0.5) / world.width) * canvas.offsetWidth
  const ly = ((y + 0.5) / world.height) * canvas.offsetHeight
  viewPanX = -(lx - canvas.offsetWidth / 2) * viewZoom
  viewPanY = -(ly - canvas.offsetHeight / 2) * viewZoom
  applyViewTransform()
}

function setClimatePhase(next: 'idle' | 'painting' | 'updating') {
  if (climatePhase === next) {
    syncClimateHud()
    return
  }
  climatePhase = next
  renderer.invalidate()
  syncClimateHud()
}

function syncClimateHud() {
  const el = document.querySelector<HTMLElement>('#hudClimate')
  if (!el) return
  if (climatePhase === 'idle') {
    el.hidden = true
    el.classList.remove('busy')
    el.textContent = ''
    return
  }
  el.hidden = false
  el.classList.toggle('busy', climatePhase === 'updating')
  el.textContent =
    climatePhase === 'painting' ? 'Climate follows the land' : 'Updating rivers & climate'
}

function setMapHint(on: boolean) {
  const el = document.querySelector<HTMLElement>('#mapHint')
  if (el) el.hidden = !on
}

function hideConfirm() {
  pendingNewWorld = null
  const banner = document.querySelector<HTMLDivElement>('#confirmBanner')
  if (banner) {
    banner.hidden = true
    banner.innerHTML = ''
  }
}

function askNewWorld(run: () => void) {
  if (!world?.cities.length) {
    run()
    return
  }
  pendingNewWorld = run
  const banner = document.querySelector<HTMLDivElement>('#confirmBanner')
  if (!banner) {
    run()
    return
  }
  banner.hidden = false
  banner.innerHTML = `
    <strong>Generate a new world?</strong>
    <p>This map and its cities will be replaced. Export first if you want a copy.</p>
    <div class="banner-actions">
      <button type="button" class="chip primary-chip" id="confirmOk">New world</button>
      <button type="button" class="chip" id="confirmCancel">Keep this one</button>
    </div>
  `
  banner.querySelector('#confirmOk')?.addEventListener('click', () => {
    const fn = pendingNewWorld
    hideConfirm()
    fn?.()
  })
  banner.querySelector('#confirmCancel')?.addEventListener('click', hideConfirm)
}

/** Build the HTML chrome (buttons, sliders). Called once at boot, then we patch bits. */
function renderShell() {
  const worldTrailing = `
    <div class="nav-trailing">
      <details class="world-menu" id="worldMenu">
        <summary>World</summary>
        <div class="world-menu-panel">
          <label for="seed">Seed</label>
          <div class="seed-field">
            <input id="seed" type="number" value="${seed}" />
            <button type="button" id="randomize" title="Fill a random seed">Shuffle</button>
          </div>
          <button type="button" id="export">Export JSON</button>
          <button type="button" id="import">Import JSON</button>
          <input id="importFile" type="file" accept="application/json,.json" hidden />
          <label for="engine">Backend</label>
          <select id="engine">
            <option value="local" selected>Local (browser)</option>
            <option value="worldengine">WorldEngine API</option>
          </select>
          <span id="saveMeta" class="save-meta">No save yet</span>
        </div>
      </details>
      <button type="button" id="regen" class="primary">New world</button>
    </div>
  `

  app.innerHTML = `
    <header class="chrome">
      ${navHtml('editor', worldTrailing)}
    </header>
    <div class="layout">
      <aside class="panel tools-panel">
        <h2>Tools</h2>
        <div class="tool-grid" id="tools"></div>

        <div class="slider-row">
          <label>Brush · <span id="brushVal">${brush}</span></label>
          <input id="brush" type="range" min="1" max="22" value="${brush}" />
        </div>
        <div class="slider-row">
          <label>Strength · <span id="strengthVal">${Math.round(strength * 100)}</span></label>
          <input id="strength" type="range" min="1" max="16" value="${Math.round(strength * 100)}" />
        </div>
        <div class="slider-row">
          <label>Softness · <span id="softVal">${Math.round(softness * 100)}</span>%</label>
          <input id="softness" type="range" min="20" max="100" value="${Math.round(softness * 100)}" />
        </div>
        <h3>Landmass</h3>
        <div class="style-grid" id="massStyles"></div>
        <p class="hint">Full continents by default. Island world is the speckle look — only if you want it. New worlds follow this; paint still does what you do.</p>
        <div class="slider-row">
          <label>Land · <span id="landVal">${Math.round(landRatio * 100)}</span>% · Water · <span id="waterVal">${Math.round((1 - landRatio) * 100)}</span>%</label>
          <input id="landRatio" type="range" min="12" max="72" value="${Math.round(landRatio * 100)}" />
        </div>
        <p class="hint">Flood or expose coasts. New worlds and zoom-out ocean follow this mix.</p>

        <h3>Deep time</h3>
        <div class="slider-row">
          <label>Age · <span id="ageVal">Present</span></label>
          <input id="timeline" type="range" min="0" max="200" value="0" />
        </div>
        <p class="hint">Pull back to see how today’s continents sat earlier — mountains and climate rebuild for that age.</p>

        <h3>Continents</h3>
        <div class="style-grid" id="continentStyles"></div>
        <div class="action-row">
          <button type="button" id="autoContinent">Auto-place</button>
        </div>
        <p class="hint" id="continentHint">Pick a style, then use Add continent on the map — or Auto-place in open ocean.</p>

        <h3>Actions</h3>
        <div class="action-row">
          <button type="button" id="undo" title="Ctrl/⌘ Z">Undo</button>
          <button type="button" id="redo" title="Ctrl/⌘ Shift Z">Redo</button>
        </div>
        <div class="action-row">
          <button type="button" id="suggestCities">Suggest cities</button>
          <button type="button" id="clearCities">Clear cities</button>
        </div>
        <div class="action-row">
          <button type="button" id="resetView">Reset view</button>
          <button type="button" id="recomputeNow">Refresh climate</button>
        </div>

        <p class="hint shortcuts">
          <strong>Paint</strong> drag · <strong>Pan</strong> Space+drag or middle mouse ·
          <strong>Zoom</strong> scroll (out grows the atlas) · <strong>Planet</strong> G · <strong>Keys</strong> 1–0 tools, C continent, [ ] brush, Z undo
        </p>
      </aside>

      <section class="map-shell">
        <div class="map-viewport" id="mapViewport">
          <canvas id="map"></canvas>
          <canvas id="globe" hidden></canvas>
        </div>
        <div class="map-overlay" id="layers"></div>
        <div class="map-hud" id="mapHud">
          <span id="hudClimate" hidden></span>
          <span id="hudZoom">100%</span>
          <button type="button" class="view-toggle active" id="viewAtlas" title="Flat atlas">Atlas</button>
          <button type="button" class="view-toggle" id="viewPlanet" title="Rotate the planet">Planet</button>
          <span id="hudTool">Raise</span>
        </div>
        <div class="map-hint" id="mapHint" hidden>Drag to raise land</div>
        <div class="loading" id="loading">Raising continents…</div>
        <div class="api-banner" id="apiBanner" hidden></div>
        <div class="api-banner" id="confirmBanner" hidden></div>
      </section>

      <aside class="panel inspector">
        <h2>Inspector</h2>
        <div id="geoFlags" class="geo-flags"></div>
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

/** Is the optional WorldEngine Python API up? If not, we stay on Local. */
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

/** New world using the TypeScript generator. Always works offline. */
function loadLocalWorld(nextSeed: number, note?: string) {
  setBusy(true, 'Raising continents…')
  setStatus('Generating local world…')
  try {
    const next = generateWorld(WIDTH, HEIGHT, nextSeed, landRatio, continentMass)
    clearAutosave()
    applyWorld(
      next,
      note ?? `Seed ${next.seed} · paint ridges, coasts, and cities — climate follows`,
    )
    hideApiDown()
    hideConfirm()
    setMapHint(true)
    setClimatePhase('idle')
  } finally {
    setBusy(false)
  }
}

/** First paint: restore autosave if this browser has one, else generate a new seed. */
async function boot() {
  hideApiDown()
  engineChoice = 'local'
  const sel = document.querySelector<HTMLSelectElement>('#engine')
  if (sel) sel.value = 'local'

  const saved = loadAutosave()
  if (saved) {
    applyWorld(
      saved,
      `Restored autosave (seed ${saved.seed}, ${saved.cities.length} cities).`,
    )
    const el = document.querySelector('#saveMeta')
    if (el) el.textContent = 'Restored from browser autosave'
    setMapHint(false)
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

/** New world: Local generator, or WorldEngine if you picked that dropdown and the API is up. */
async function loadWorld(nextSeed: number) {
  if (engineChoice !== 'worldengine') {
    loadLocalWorld(nextSeed)
    return
  }
  setBusy(true, 'Raising continents…')
  setStatus('Trying WorldEngine…')
  try {
    if (!(await apiHealthy())) throw new Error('API offline')
    const next = await fetchWorldEngineWorld(nextSeed, WIDTH, HEIGHT, 10)
    next.landRatio = landRatio
    next.continentMass = continentMass
    clearAutosave()
    applyWorld(next, `WorldEngine seed ${next.seed}`)
    hideApiDown()
    setMapHint(true)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    engineChoice = 'local'
    const sel = document.querySelector<HTMLSelectElement>('#engine')
    if (sel) sel.value = 'local'
    loadLocalWorld(nextSeed, `Backend unavailable (${msg}) — local engine ready.`)
  } finally {
    setBusy(false)
  }
}

/** After painting, wait a beat then rebuild climate/rivers. Immediate = no wait. */
function scheduleClimateRecompute(immediate = false) {
  if (!world) return
  if (recomputeTimer !== null) window.clearTimeout(recomputeTimer)
  const gen = ++recomputeGeneration
  const run = async () => {
    if (!world || gen !== recomputeGeneration) return
    const useLocal =
      world.engine === 'local' || engineChoice === 'local' || !(await apiHealthy())
    if (useLocal) {
      refreshGeography(world, { sculpt: false })
      if (timelineAge > 0.5) timelineView = reconstructPast(world, timelineAge)
      renderer.invalidate()
      scheduleAutosave()
      setStatus('Rivers and climate rebuilt from the land.')
      setClimatePhase('idle')
      updateInspector()
      updateGeoFlags()
      return
    }
    setStatus('Recomputing climate…')
    setClimatePhase('updating')
    try {
      const next = await recomputeWorldEngine(world)
      if (gen !== recomputeGeneration) return
      // preserve history by mutating fields instead of applyWorld wipe
      world = next
      refreshGeography(world, { sculpt: false })
      renderer.invalidate()
      setStatus('Climate updated.')
      setClimatePhase('idle')
      updateInspector()
      updateCities()
      scheduleAutosave()
    } catch {
      if (!world) return
      refreshGeography(world, { sculpt: false })
      renderer.invalidate()
      setStatus('Used local climate after backend failure.')
      setClimatePhase('idle')
      updateInspector()
    }
  }
  if (immediate) void run()
  else recomputeTimer = window.setTimeout(() => void run(), 160)
}

/** Snapshot undo BEFORE the stroke. One undo undoes the whole drag, not each pixel. */
function beginStroke(label: string) {
  if (!world || strokeActive) return
  history.push(world, label)
  strokeActive = true
  updateHistoryButtons()
}

function endStroke() {
  if (!strokeActive) return
  strokeActive = false
  if (
    world &&
    (tool === 'land' || tool === 'sea' || tool === 'raise' || tool === 'lower' || tool === 'plateau')
  ) {
    chewStraightCoasts(world.elev, world.width, world.height, world.seaLevel, world.seed + 21)
    renderer.invalidate()
  }
  setClimatePhase('updating')
  scheduleClimateRecompute(true)
}

function updateHistoryButtons() {
  const undo = document.querySelector<HTMLButtonElement>('#undo')
  const redo = document.querySelector<HTMLButtonElement>('#redo')
  if (undo) undo.disabled = !history.canUndo()
  if (redo) redo.disabled = !history.canRedo()
}

function doUndo() {
  if (!world || !history.canUndo()) return
  const label = history.undo(world)
  timelineAge = 0
  timelineView = null
  syncTimelineUi()
  landRatio = world.landRatio
  continentMass = clampContinentMass(world.continentMass)
  syncLandRatioUi()
  syncMassUi()
  refreshGeography(world, { sculpt: false })
  renderer.invalidate()
  updateCities()
  updateInspector()
  updateHistoryButtons()
  scheduleAutosave()
  setClimatePhase('idle')
  setStatus(label ? `Undo: ${label}` : 'Undo')
}

function doRedo() {
  if (!world || !history.canRedo()) return
  const label = history.redo(world)
  timelineAge = 0
  timelineView = null
  syncTimelineUi()
  landRatio = world.landRatio
  continentMass = clampContinentMass(world.continentMass)
  syncLandRatioUi()
  syncMassUi()
  refreshGeography(world, { sculpt: false })
  renderer.invalidate()
  updateCities()
  updateInspector()
  updateHistoryButtons()
  scheduleAutosave()
  setClimatePhase('idle')
  setStatus(label ? `Redo: ${label}` : 'Redo')
}

function setTool(next: Tool) {
  tool = next
  const tools = document.querySelector('#tools')
  tools?.querySelectorAll('.tool').forEach((b) => {
    b.classList.toggle('active', (b as HTMLElement).dataset.tool === tool)
  })
  const hud = document.querySelector('#hudTool')
  const def = TOOL_DEFS.find((t) => t.id === tool)
  if (hud && def) hud.textContent = def.label
  syncContinentHint()
}

const TOOL_DEFS: { id: Tool; label: string; desc: string; key: string }[] = [
  { id: 'raise', label: 'Raise', desc: 'Uplift mountains & hills', key: '1' },
  { id: 'lower', label: 'Lower', desc: 'Erode or sink land', key: '2' },
  { id: 'smooth', label: 'Smooth', desc: 'Blur harsh terrain', key: '3' },
  { id: 'ridge', label: 'Ridge', desc: 'Paint a mountain chain', key: '4' },
  { id: 'channel', label: 'Channel', desc: 'Carve river valleys', key: '5' },
  { id: 'plateau', label: 'Plateau', desc: 'Flatten a highland', key: '6' },
  { id: 'sea', label: 'Ocean', desc: 'Paint below sea level', key: '7' },
  { id: 'land', label: 'Land', desc: 'Raise above the sea', key: '8' },
  { id: 'city', label: 'Found city', desc: 'Place where geography allows', key: '9' },
  { id: 'razecity', label: 'Raze city', desc: 'Remove a nearby city', key: '0' },
  { id: 'inspect', label: 'Inspect', desc: 'Read cell climate & score', key: 'I' },
  { id: 'continent', label: 'Add continent', desc: 'New landmass; plates rewrite', key: 'C' },
]

/** Mouse / keyboard / slider wiring. This is most of the page's behavior. */
function bind() {
  const tools = document.querySelector('#tools')!
  tools.innerHTML = TOOL_DEFS.map(
    (t) =>
      `<button type="button" class="tool ${tool === t.id ? 'active' : ''}" data-tool="${t.id}">
        <span class="tool-main"><span>${t.label}</span><kbd>${t.key}</kbd></span>
        <small>${t.desc}</small>
      </button>`,
  ).join('')
  tools.querySelectorAll<HTMLButtonElement>('[data-tool]').forEach((btn) => {
    btn.addEventListener('click', () => setTool(btn.dataset.tool as Tool))
  })

  const styles = document.querySelector('#continentStyles')
  if (styles) {
    styles.innerHTML = CONTINENT_STYLES.map(
      (s) =>
        `<button type="button" class="style-chip ${s.id === continentStyle ? 'active' : ''}" data-style="${s.id}" title="${s.desc}">
          <span>${s.label}</span>
          <small>${s.desc}</small>
        </button>`,
    ).join('')
    styles.querySelectorAll<HTMLButtonElement>('[data-style]').forEach((btn) => {
      btn.addEventListener('click', () => {
        continentStyle = btn.dataset.style as ContinentStyle
        styles.querySelectorAll('.style-chip').forEach((b) => b.classList.remove('active'))
        btn.classList.add('active')
        syncContinentHint()
      })
    })
  }

  const massBox = document.querySelector('#massStyles')
  if (massBox) {
    massBox.innerHTML = CONTINENT_MASS_OPTIONS.map(
      (s) =>
        `<button type="button" class="style-chip ${s.id === continentMass ? 'active' : ''}" data-mass="${s.id}" title="${s.desc}">
          <span>${s.label}</span>
          <small>${s.desc}</small>
        </button>`,
    ).join('')
    massBox.querySelectorAll<HTMLButtonElement>('[data-mass]').forEach((btn) => {
      btn.addEventListener('click', () => {
        continentMass = clampContinentMass(btn.dataset.mass)
        if (world) world.continentMass = continentMass
        syncMassUi()
        updateGeoFlags()
        scheduleAutosave()
        const opt = CONTINENT_MASS_OPTIONS.find((s) => s.id === continentMass)
        setStatus(
          continentMass === 'islands'
            ? 'Island world — next New world will speckle. Paint still does what you do.'
            : `${opt?.label ?? 'Full continents'} — next New world grows large landmasses.`,
        )
      })
    })
  }
  document.querySelector('#autoContinent')?.addEventListener('click', () => {
    placeContinentAuto()
  })
  syncContinentHint()
  renderLayerChips()

  const globeCanvas = document.querySelector<HTMLCanvasElement>('#globe')
  if (globeCanvas) planet = new PlanetView(globeCanvas)
  window.addEventListener('resize', () => {
    if (viewMode === 'planet') planet?.layout()
    else applyViewTransform()
  })
  document.querySelector('#viewAtlas')?.addEventListener('click', () => setViewMode('atlas'))
  document.querySelector('#viewPlanet')?.addEventListener('click', () => setViewMode('planet'))

  document.querySelector('#engine')?.addEventListener('change', (e) => {
    engineChoice = (e.target as HTMLSelectElement).value as EngineChoice
  })

  document.querySelector('#brush')!.addEventListener('input', (e) => {
    brush = Number((e.target as HTMLInputElement).value)
    document.querySelector('#brushVal')!.textContent = String(brush)
  })
  document.querySelector('#strength')!.addEventListener('input', (e) => {
    strength = Number((e.target as HTMLInputElement).value) / 100
    document.querySelector('#strengthVal')!.textContent = String(Math.round(strength * 100))
  })
  document.querySelector('#softness')!.addEventListener('input', (e) => {
    softness = Number((e.target as HTMLInputElement).value) / 100
    document.querySelector('#softVal')!.textContent = String(Math.round(softness * 100))
  })
  const landInput = document.querySelector<HTMLInputElement>('#landRatio')
  landInput?.addEventListener('input', (e) => {
    landRatio = Number((e.target as HTMLInputElement).value) / 100
    document.querySelector('#landVal')!.textContent = String(Math.round(landRatio * 100))
    document.querySelector('#waterVal')!.textContent = String(Math.round((1 - landRatio) * 100))
    if (!world || busy) return
    if (!strokeActive) beginStroke('Land / water')
    applyLandRatio(world, landRatio)
    reshapeLandmasses(world)
    renderer.invalidate()
    updateCities()
    updateInspector()
    setClimatePhase('painting')
  })
  landInput?.addEventListener('change', () => {
    if (!world) return
    endStroke()
    setStatus(`Land ${Math.round(landRatio * 100)}% · water ${Math.round((1 - landRatio) * 100)}%`)
  })

  const timeInput = document.querySelector<HTMLInputElement>('#timeline')
  timeInput?.addEventListener('input', (e) => {
    scheduleTimeline(Number((e.target as HTMLInputElement).value))
  })
  timeInput?.addEventListener('change', (e) => {
    setTimelineAge(Number((e.target as HTMLInputElement).value))
  })

  document.querySelector('#undo')!.addEventListener('click', doUndo)
  document.querySelector('#redo')!.addEventListener('click', doRedo)
  document.querySelector('#resetView')!.addEventListener('click', () => {
    resetView()
    setStatus('View reset')
  })
  document.querySelector('#recomputeNow')!.addEventListener('click', () => {
    if (!world) return
    if (timelineAge > 0.5) setTimelineAge(0)
    setClimatePhase('updating')
    refreshGeography(world, { sculpt: true })
    renderer.invalidate()
    setClimatePhase('idle')
    setStatus('Mountains, rivers, and climate rebuilt from the continents.')
    updateInspector()
    scheduleAutosave()
  })
  document.querySelector('#suggestCities')!.addEventListener('click', () => {
    if (!world) return
    beginStroke('Suggest cities')
    strokeActive = false
    const added = suggestCities(world, 5)
    world.cities.push(...added)
    updateCities()
    updateHistoryButtons()
    renderer.invalidate()
    scheduleAutosave()
    setStatus(added.length ? `Suggested ${added.length} cities on good sites.` : 'No strong sites found — try Settle layer.')
  })
  document.querySelector('#clearCities')!.addEventListener('click', () => {
    if (!world?.cities.length) return
    beginStroke('Clear cities')
    strokeActive = false
    world.cities = []
    updateCities()
    updateHistoryButtons()
    renderer.invalidate()
    scheduleAutosave()
    setStatus('Cities cleared')
  })

  document.querySelector('#regen')!.addEventListener('click', () => {
    if (busy) return
    askNewWorld(() => {
      seed = (Math.random() * 1e9) | 0
      const seedInput = document.querySelector<HTMLInputElement>('#seed')
      if (seedInput) seedInput.value = String(seed)
      void loadWorld(seed)
    })
  })
  document.querySelector('#randomize')!.addEventListener('click', () => {
    seed = (Math.random() * 1e9) | 0
    document.querySelector<HTMLInputElement>('#seed')!.value = String(seed)
  })
  document.querySelector('#export')!.addEventListener('click', () => {
    if (!world) return
    downloadWorld(world)
    setStatus(`Exported geoform-seed-${world.seed}.json`)
  })
  const importFile = document.querySelector<HTMLInputElement>('#importFile')!
  document.querySelector('#import')!.addEventListener('click', () => importFile.click())
  importFile.addEventListener('change', () => {
    const file = importFile.files?.[0]
    importFile.value = ''
    if (!file) return
    void (async () => {
      try {
        applyWorld(await readWorldFile(file), `Imported ${file.name}`)
        setMapHint(false)
      } catch (err) {
        setStatus(`Import failed: ${err instanceof Error ? err.message : String(err)}`)
      }
    })()
  })

  window.addEventListener('beforeunload', () => {
    if (world) autosaveWorld(world)
  })

  window.addEventListener('keydown', (e) => {
    const tag = (e.target as HTMLElement)?.tagName
    const typing = tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA'

    if (e.code === 'Space' && !typing) {
      spaceDown = true
      e.preventDefault()
    }
    if (typing) return

    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
      e.preventDefault()
      if (e.shiftKey) doRedo()
      else doUndo()
      return
    }
    if (e.key.toLowerCase() === 'g') {
      setViewMode(viewMode === 'planet' ? 'atlas' : 'planet')
      return
    }
    if (e.key === '[') {
      brush = Math.max(1, brush - 1)
      syncBrushUi()
    }
    if (e.key === ']') {
      brush = Math.min(22, brush + 1)
      syncBrushUi()
    }
    const byKey = TOOL_DEFS.find((t) => t.key.toLowerCase() === e.key.toLowerCase())
    if (byKey) setTool(byKey.id)
  })
  window.addEventListener('keyup', (e) => {
    if (e.code === 'Space') spaceDown = false
  })

  const canvas = document.querySelector<HTMLCanvasElement>('#map')!
  const viewport = document.querySelector<HTMLElement>('#mapViewport')!
  if (typeof ResizeObserver !== 'undefined') {
    new ResizeObserver(() => {
      if (viewMode === 'atlas') applyViewTransform()
    }).observe(viewport)
  }

  viewport.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault()
      if (viewMode === 'planet') {
        planet?.dolly(e.deltaY > 0 ? 1.08 : 0.92)
        return
      }
      zoomAt(e.clientX, e.clientY, e.deltaY > 0 ? 0.92 : 1.08)
    },
    { passive: false },
  )

  const applyAt = (clientX: number, clientY: number, shiftKey: boolean) => {
    if (!world || busy) return
    if (timelineAge > 0.5 && tool !== 'inspect') setTimelineAge(0)
    const cell = pickCell(clientX, clientY)
    if (!cell) return
    hover = cell

    if (tool === 'inspect') {
      updateInspector()
      return
    }

    if (tool === 'city') {
      tryPlaceCity(cell.x, cell.y, shiftKey)
      return
    }

    if (tool === 'razecity') {
      beginStroke('Raze city')
      strokeActive = false
      const removed = removeNearestCity(world, cell.x, cell.y)
      updateCities()
      updateHistoryButtons()
      renderer.invalidate()
      scheduleAutosave()
      setStatus(removed ? `Razed ${removed.name}` : 'No city nearby')
      return
    }

    if (tool === 'continent') {
      placeContinentAt(cell.x, cell.y)
      return
    }

    if (!TERRAIN_TOOLS.includes(tool)) return

    if (!strokeActive) {
      beginStroke(TOOL_DEFS.find((t) => t.id === tool)?.label ?? 'Edit')
      setClimatePhase('painting')
      setMapHint(false)
    }

    const dirX = lastCell ? cell.x - lastCell.x : 1
    const dirY = lastCell ? cell.y - lastCell.y : 0
    const dirLen = Math.hypot(dirX, dirY)
    const strokeDirX = dirLen > 0.1 ? dirX : 1
    const strokeDirY = dirLen > 0.1 ? dirY : 0

    switch (tool) {
      case 'raise':
        brushRaise(world, cell.x, cell.y, brush, strength, softness)
        break
      case 'lower':
        brushRaise(world, cell.x, cell.y, brush, -strength, softness)
        break
      case 'smooth':
        brushSmooth(world, cell.x, cell.y, brush, Math.min(1, strength * 4), softness)
        break
      case 'ridge':
        brushRidge(world, cell.x, cell.y, brush, strength * 1.35, softness, strokeDirX, strokeDirY)
        break
      case 'channel':
        brushChannel(world, cell.x, cell.y, brush, strength, softness, strokeDirX, strokeDirY)
        break
      case 'plateau':
        brushPlateau(world, cell.x, cell.y, brush, Math.min(1, strength * 3), softness)
        break
      case 'sea':
        brushSeaLevel(world, cell.x, cell.y, brush, true, Math.min(1, strength * 3), softness)
        break
      case 'land':
        brushSeaLevel(world, cell.x, cell.y, brush, false, Math.min(1, strength * 3), softness)
        break
      default:
        break
    }

    lastCell = cell
    renderer.invalidate()
    scheduleAutosave()
    setStatus(`${TOOL_DEFS.find((t) => t.id === tool)?.label ?? 'Edit'} — climate will refresh when you release`)
    updateInspector()
  }

  canvas.addEventListener('pointerdown', (e) => {
    setMapHint(false)
    hideConfirm()
    if (e.button === 1 || spaceDown || e.button === 2) {
      panning = true
      panStart = { x: e.clientX, y: e.clientY, panX: viewPanX, panY: viewPanY }
      canvas.setPointerCapture(e.pointerId)
      e.preventDefault()
      return
    }
    if (e.button !== 0) return
    painting = true
    lastCell = null
    canvas.setPointerCapture(e.pointerId)
    applyAt(e.clientX, e.clientY, e.shiftKey)
  })
  canvas.addEventListener('pointermove', (e) => {
    if (panning) {
      viewPanX = panStart.panX + (e.clientX - panStart.x)
      viewPanY = panStart.panY + (e.clientY - panStart.y)
      applyViewTransform()
      return
    }
    if (!world) return
    hover = pickCell(e.clientX, e.clientY)
    if (painting && TERRAIN_TOOLS.includes(tool)) {
      applyAt(e.clientX, e.clientY, e.shiftKey)
    } else {
      updateInspector()
    }
  })
  const endPointer = () => {
    if (painting) endStroke()
    painting = false
    panning = false
    lastCell = null
  }
  canvas.addEventListener('pointerup', endPointer)
  canvas.addEventListener('pointercancel', endPointer)
  canvas.addEventListener('pointerleave', () => {
    if (!painting) hover = null
  })
  canvas.addEventListener('contextmenu', (e) => e.preventDefault())

  const globeEl = document.querySelector<HTMLCanvasElement>('#globe')
  if (globeEl && planet) {
    let planetMoved = false
    globeEl.addEventListener('pointerdown', (e) => {
      setMapHint(false)
      hideConfirm()
      if (e.button !== 0 && e.button !== 1 && e.button !== 2) return
      globeEl.setPointerCapture(e.pointerId)
      planetMoved = false
      if (e.shiftKey && e.button === 0 && TERRAIN_TOOLS.includes(tool)) {
        painting = true
        lastCell = null
        applyAt(e.clientX, e.clientY, e.shiftKey)
        return
      }
      panning = true
      planet?.onPointerDown(e.clientX, e.clientY)
      e.preventDefault()
    })
    globeEl.addEventListener('pointermove', (e) => {
      if (painting && TERRAIN_TOOLS.includes(tool)) {
        applyAt(e.clientX, e.clientY, e.shiftKey)
        return
      }
      if (panning) {
        planetMoved = true
        planet?.onPointerMove(e.clientX, e.clientY)
        return
      }
      hover = pickCell(e.clientX, e.clientY)
      updateInspector()
    })
    globeEl.addEventListener('pointerup', (e) => {
      if (!planetMoved && !painting && e.button === 0) {
        applyAt(e.clientX, e.clientY, e.shiftKey)
      }
      planet?.onPointerUp()
      endPointer()
    })
    globeEl.addEventListener('pointercancel', () => {
      planet?.onPointerUp()
      endPointer()
    })
    globeEl.addEventListener('contextmenu', (e) => e.preventDefault())
  }

  document.addEventListener('pointerdown', (e) => {
    const menu = document.querySelector('#worldMenu')
    if (menu instanceof HTMLDetailsElement && menu.open && !menu.contains(e.target as Node)) {
      menu.open = false
    }
  })

  updateHistoryButtons()
  setTool(tool)
}

function syncBrushUi() {
  const input = document.querySelector<HTMLInputElement>('#brush')
  if (input) input.value = String(brush)
  const val = document.querySelector('#brushVal')
  if (val) val.textContent = String(brush)
}

function continentRadius(): number {
  return Math.round(10 + brush * 1.7)
}

function syncContinentHint() {
  const el = document.querySelector('#continentHint')
  const def = CONTINENT_STYLES.find((s) => s.id === continentStyle)
  if (el && def) {
    el.textContent =
      tool === 'continent'
        ? `Click ocean to place — ${def.desc}`
        : `${def.desc} · choose Add continent (C) or Auto-place`
  }
}

function placeContinentAt(x: number, y: number) {
  if (!world || busy) return
  const style = CONTINENT_STYLES.find((s) => s.id === continentStyle)
  beginStroke(style ? `Add ${style.label.toLowerCase()}` : 'Add continent')
  strokeActive = false
  const result = addContinent(world, x, y, continentStyle, continentRadius())
  if (!result.ok) {
    history.cancelLast()
    updateHistoryButtons()
    setStatus(result.message)
    return
  }
  setMapHint(false)
  renderer.invalidate()
  updateCities()
  updateInspector()
  updateHistoryButtons()
  scheduleAutosave()
  setClimatePhase('updating')
  scheduleClimateRecompute(true)
  setStatus(result.message)
}

function placeContinentAuto() {
  if (!world || busy) return
  const site = findOceanSite(world, continentStyle)
  if (!site) {
    setStatus('No open ocean large enough — lower some land first.')
    return
  }
  placeContinentAt(site.x, site.y)
  hover = site
  updateInspector()
}

function tryPlaceCity(x: number, y: number, force: boolean) {
  if (!world) return
  const result = evaluateSuitability(world, x, y)
  if (world.cities.some((c) => Math.hypot(c.x - x, c.y - y) < 4)) {
    setStatus('Too close to an existing city.')
    updateInspector()
    return
  }
  if (!result.ok && !force) {
    setStatus(`Blocked: ${result.reasons[0]} (${(result.score * 100) | 0}%). Hold Shift to force.`)
    updateInspector()
    return
  }
  beginStroke('Found city')
  strokeActive = false
  const name = nextCityName(world)
  world.cities.push({ x, y, name, score: result.score })
  setStatus(
    force && !result.ok
      ? `Forced ${name} (${(result.score * 100) | 0}%).`
      : `Founded ${name} — suitability ${(result.score * 100) | 0}%.`,
  )
  updateInspector()
  updateCities()
  updateHistoryButtons()
  renderer.invalidate()
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

/** Fewer pixels on huge grids so the canvas stays snappy. */
function rasterScale(w: World): number {
  const cells = w.width * w.height
  if (cells > 160_000) return 2
  if (cells > 80_000) return 3
  return 4
}

/** Draw the current world onto the canvas. Called every animation frame while dirty. */
function paint() {
  const src = displayWorld()
  if (!src) return
  if (viewMode !== 'planet') fitAtlasCanvas()
  if (viewMode === 'planet' && planet) {
    planet.layout()
    planet.sync(
      src,
      globeLook,
      `${src.seed}|${src.width}x${src.height}|${src.elev[0]}|${src.elev[(src.elev.length / 2) | 0]}|${src.seaLevel}|${src.biome[(src.biome.length / 2) | 0]}|${src.cities.length}|${climatePhase}|${Math.round(timelineAge)}`,
    )
    planet.render()
    return
  }
  const canvas = document.querySelector<HTMLCanvasElement>('#map')
  if (!canvas) return
  const ctx = canvas.getContext('2d')!
  renderer.draw(ctx, src, {
    layer,
    showRivers: true,
    showCities: timelineAge < 8,
    scale: rasterScale(src),
    hover,
    brush,
    tool,
    painting,
    riversMuted: climatePhase !== 'idle',
  })
}

function updateInspector() {
  updateGeoFlags()
  const el = document.querySelector('#inspect')
  if (!el) return
  const src = displayWorld()
  if (!src || !hover) {
    el.innerHTML = `<p class="hint">Hover the map. Switch to <strong>Settle</strong> layer to scout city sites.</p>`
    return
  }
  const { x, y } = hover
  const i = y * src.width + x
  if (i < 0 || i >= src.elev.length) return
  const suit = evaluateSuitability(src, x, y)
  const above = src.elev[i] >= src.seaLevel
  const landPct = Math.round(landFraction(src.elev, src.seaLevel) * 100)
  el.innerHTML = `
    <div class="inspect-head">
      <strong>${x}, ${y}</strong>
      <span class="pill ${above ? 'land' : 'sea'}">${above ? 'Land' : 'Ocean'}</span>
      <span class="pill score ${suit.ok ? 'ok' : 'no'}">${(suit.score * 100) | 0}%</span>
    </div>
    <dl>
      <dt>Elevation</dt><dd>${(src.elev[i] * 100) | 0}%</dd>
      <dt>Land / water</dt><dd>${landPct}% · ${100 - landPct}%</dd>
      <dt>Temperature</dt><dd>${(src.temp[i] * 100) | 0}%</dd>
      <dt>Moisture</dt><dd>${(src.moist[i] * 100) | 0}%</dd>
      <dt>River flux</dt><dd>${src.flux[i].toFixed(1)}</dd>
      <dt>Biome</dt><dd>${src.biome[i]}</dd>
      <dt>Plate</dt><dd>#${src.plateId[i]}</dd>
    </dl>
    <ul class="reasons">
      ${
        above
          ? suit.reasons.map((r) => `<li class="${suit.ok ? 'good' : 'bad'}">${r}</li>`).join('')
          : '<li>Open water</li>'
      }
    </ul>
  `
}

function escapeAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
}

function commitCityName(index: number, input: HTMLInputElement) {
  if (!world) return
  const city = world.cities[index]
  if (!city) return
  const original = input.dataset.original ?? city.name
  const next = input.value.trim() || original
  input.value = next
  if (next === original) {
    city.name = original
    return
  }
  city.name = original
  beginStroke(`Rename ${original}`)
  strokeActive = false
  city.name = next
  updateHistoryButtons()
  scheduleAutosave()
  setStatus(`Renamed to ${next}`)
}

function updateCities() {
  const el = document.querySelector('#cities')
  if (!el) return
  if (!world?.cities.length) {
    el.innerHTML = `<li class="empty-city">None yet — try <em>Suggest cities</em> or the Found tool</li>`
    return
  }
  el.innerHTML = world.cities
    .map(
      (c, i) =>
        `<li class="city-row">
          <input type="text" class="city-name" data-city="${i}" value="${escapeAttr(c.name)}" maxlength="40" spellcheck="false" aria-label="Rename ${escapeAttr(c.name)}" />
          <button type="button" class="city-score" data-focus-city="${i}" title="Show on map">${(c.score * 100) | 0}%</button>
        </li>`,
    )
    .join('')

  el.querySelectorAll<HTMLInputElement>('.city-name').forEach((input) => {
    input.addEventListener('focus', () => {
      input.dataset.original = input.value
      input.select()
    })
    input.addEventListener('input', () => {
      if (!world) return
      const city = world.cities[Number(input.dataset.city)]
      if (city) city.name = input.value
    })
    input.addEventListener('blur', () => {
      commitCityName(Number(input.dataset.city), input)
    })
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        input.blur()
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        input.value = input.dataset.original ?? input.value
        input.blur()
      }
    })
  })

  el.querySelectorAll<HTMLButtonElement>('[data-focus-city]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (!world) return
      const c = world.cities[Number(btn.dataset.focusCity)]
      if (!c) return
      hover = { x: c.x, y: c.y }
      focusCell(c.x, c.y)
      updateInspector()
      setStatus(`Focused ${c.name}`)
    })
  })
}

renderShell()
