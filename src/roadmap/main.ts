/**
 * Roadmap page (`/roadmap.html`). What already shipped vs what is still a wish.
 * SHIPPED in content.ts is the honest "this works today" list. Stages below
 * that are future Earth-calibration work, not the current editor.
 */
import './style.css'
import { navHtml } from '../chrome/nav'
import {
  DATASETS,
  PHASES,
  SHIPPED,
  STAGES,
  WEEK_TASKS,
  type DatasetCard,
  type Stage,
  type StageId,
} from './content'

const CHECK_KEY = 'geoform.roadmap.checks.v1'

let activeStage: StageId = 'ingest'
let activeDataset = DATASETS[0].id
let activePhase = PHASES[0].id
let ridge = 0.55
let wind = 0.7

const root = document.querySelector<HTMLDivElement>('#roadmap-root')!

function loadChecks(): Record<string, boolean> {
  try {
    return JSON.parse(localStorage.getItem(CHECK_KEY) || '{}') as Record<string, boolean>
  } catch {
    return {}
  }
}

function saveChecks(map: Record<string, boolean>) {
  localStorage.setItem(CHECK_KEY, JSON.stringify(map))
}

function stageById(id: StageId): Stage {
  return STAGES.find((s) => s.id === id) ?? STAGES[0]
}

function datasetById(id: string): DatasetCard {
  return DATASETS.find((d) => d.id === id) ?? DATASETS[0]
}

function render() {
  const stage = stageById(activeStage)
  const ds = datasetById(activeDataset)
  const phase = PHASES.find((p) => p.id === activePhase) ?? PHASES[0]
  const checks = loadChecks()
  const done = WEEK_TASKS.filter((t) => checks[t.id]).length
  const pct = Math.round((done / WEEK_TASKS.length) * 100)

  root.innerHTML = `
    <div class="shell">
      ${navHtml('roadmap')}

      <header class="hero" id="hero">
        <canvas class="hero-canvas" id="heroCanvas" aria-hidden="true"></canvas>
        <div class="hero-veil"></div>
        <div class="hero-copy">
          <h1>Roadmap</h1>
          <p>T0 is shipping: a local atlas that keeps continents, drains rivers, and repairs impossible geography instead of warning. Next is Earth-taught climate — rain shadows fitted to real mountains.</p>
          <div class="hero-actions">
            <button type="button" class="chip-btn btn-primary" data-jump="pipeline">Walk the pipeline</button>
            <button type="button" class="chip-btn" data-jump="demo">Play the rain shadow</button>
            <a class="chip-btn" href="/labs.html">Geography labs</a>
            <a class="chip-btn" href="/critique.html">Critique</a>
            <button type="button" class="chip-btn" data-jump="week">This week’s checklist</button>
          </div>
        </div>
      </header>

      <section class="section" id="shipped">
        <div class="section-head">
          <div>
            <h2>Already in the atlas</h2>
            <p>The map editor, labs, and critique share one local engine. These rules run now — they are not a later phase.</p>
          </div>
        </div>
        <div class="vault" id="shippedGrid"></div>
      </section>

      <section class="section" id="pipeline">
        <div class="section-head">
          <div>
            <h2>The pipeline</h2>
            <p>Seven stages toward Earth-calibrated climate. The local atlas already does stage-shaped work (height → climate → rivers → cities). This spine is how we lock it to Earth data.</p>
          </div>
        </div>
        <div class="panel pipeline">
          <div class="stage-rail" id="stageRail"></div>
          <div class="stage-detail" id="stageDetail"></div>
        </div>
      </section>

      <section class="section" id="demo">
        <div class="section-head">
          <div>
            <h2>Feel a rain shadow</h2>
            <p>Wind from the west. Drag the ridge height. Watch the lee side dry. This is what calibration teaches the engine to reproduce on Earth data.</p>
          </div>
        </div>
        <div class="panel demo-grid">
          <div class="demo-canvas-wrap">
            <canvas id="oroCanvas" width="720" height="360"></canvas>
          </div>
          <div class="demo-controls">
            <label>
              Ridge height · <strong id="ridgeVal">${Math.round(ridge * 100)}%</strong>
              <input id="ridge" type="range" min="10" max="95" value="${Math.round(ridge * 100)}" />
            </label>
            <label>
              Wind strength · <strong id="windVal">${Math.round(wind * 100)}%</strong>
              <input id="wind" type="range" min="20" max="100" value="${Math.round(wind * 100)}" />
            </label>
            <div>
              <div>Windward moisture</div>
              <div class="meter" id="wetMeter"><span></span></div>
              <div>Leeward moisture</div>
              <div class="meter dry" id="dryMeter"><span></span></div>
            </div>
            <p class="feel" id="oroNarration"></p>
          </div>
        </div>
      </section>

      <section class="section" id="data">
        <div class="section-head">
          <div>
            <h2>What you ingest</h2>
            <p>Click a card. Start with P0 only — one region, not the whole planet.</p>
          </div>
        </div>
        <div class="panel">
          <div class="dataset-grid" id="datasetGrid"></div>
          <div class="dataset-focus" id="datasetFocus"></div>
        </div>
      </section>

      <section class="section" id="phases">
        <div class="section-head">
          <div>
            <h2>Phases over time</h2>
            <p>Scrub the roadmap. You are aiming for T1 (Earth-calibrated), not a planetary twin.</p>
          </div>
        </div>
        <div class="panel">
          <div class="phase-track" id="phaseTrack"></div>
          <div class="feel" id="phaseBlurb"></div>
        </div>
      </section>

      <section class="section" id="vault">
        <div class="section-head">
          <div>
            <h2>Where truth lives</h2>
            <p>Three planes. Browser autosave is only a sticky note on plane C.</p>
          </div>
        </div>
        <div class="vault">
          <article>
            <h3>A · Raw scientific</h3>
            <p>Immutable downloads: DEM, WorldClim, ERA5, HydroSHEDS. Checksums. Never overwrite.</p>
          </article>
          <article>
            <h3>B · Derived</h3>
            <p>COGs, flow maps, orographic coefficients. Rebuildable from A + code.</p>
          </article>
          <article>
            <h3>C · Product worlds</h3>
            <p>Your edited maps & cities. Convex (or equivalent) + export files + restore drills.</p>
          </article>
        </div>
      </section>

      <section class="section" id="week">
        <div class="section-head">
          <div>
            <h2>This week</h2>
            <p>Check items off. Progress sticks in this browser so the process stays visceral, not abstract.</p>
          </div>
          <button type="button" class="chip-btn" id="resetChecks">Reset checks</button>
        </div>
        <div class="panel">
          <div class="progress-line"><span id="weekBar" style="width:${pct}%"></span></div>
          <p id="weekMeta">${done} / ${WEEK_TASKS.length} done · ${pct}%</p>
          <ul class="checklist" id="weekList"></ul>
        </div>
      </section>

      <p class="footer-note">
        Deep reference: <a href="/docs/ACCURACY_ROADMAP.md">docs/ACCURACY_ROADMAP.md</a>
        · Map editor: <a href="/">/</a>
        · Labs: <a href="/labs.html">/labs.html</a>
        · Critique: <a href="/critique.html">/critique.html</a>
      </p>
    </div>
  `

  // Fill dynamic bits without full re-render thrash for canvases — bind after paint
  paintShipped()
  paintStageRail()
  paintStageDetail(stage)
  paintDatasets(ds)
  paintPhases(phase)
  paintWeek(checks)
  bindChrome()
  startHero()
  startOro()
  updateOroMeters()
}

function paintShipped() {
  const el = document.querySelector('#shippedGrid')
  if (!el) return
  el.innerHTML = SHIPPED.map(
    (item) => `
    <article>
      <h3>${item.title}</h3>
      <p>${item.detail}</p>
    </article>`,
  ).join('')
}

function paintStageRail() {
  const rail = document.querySelector('#stageRail')!
  rail.innerHTML = STAGES.map(
    (s) => `
    <button type="button" class="stage-btn ${s.id === activeStage ? 'active' : ''}" data-stage="${s.id}">
      <small>${s.num}</small>
      <strong>${s.title}</strong>
    </button>`,
  ).join('')
  rail.querySelectorAll<HTMLButtonElement>('[data-stage]').forEach((btn) => {
    btn.addEventListener('click', () => {
      activeStage = btn.dataset.stage as StageId
      paintStageRail()
      paintStageDetail(stageById(activeStage))
    })
  })
}

function paintStageDetail(stage: Stage) {
  const el = document.querySelector('#stageDetail')!
  el.innerHTML = `
    <h3>${stage.num} · ${stage.title}</h3>
    <p class="lede">${stage.oneLiner}</p>
    <p class="feel">${stage.feel}</p>
    <ul>${stage.does.map((d) => `<li>${d}</li>`).join('')}</ul>
    <p class="avoid"><strong>Avoid:</strong> ${stage.avoids}</p>
  `
  el.animate([{ opacity: 0.35 }, { opacity: 1 }], { duration: 220, easing: 'ease-out' })
}

function paintDatasets(ds: DatasetCard) {
  const grid = document.querySelector('#datasetGrid')!
  grid.innerHTML = DATASETS.map(
    (d) => `
    <button type="button" class="dataset-card ${d.id === activeDataset ? 'active' : ''}" data-ds="${d.id}">
      <div class="dom">${d.domain}</div>
      <h3>${d.name}</h3>
      <span class="pri ${d.priority.toLowerCase()}">${d.priority}</span>
    </button>`,
  ).join('')
  grid.querySelectorAll<HTMLButtonElement>('[data-ds]').forEach((btn) => {
    btn.addEventListener('click', () => {
      activeDataset = btn.dataset.ds!
      paintDatasets(datasetById(activeDataset))
    })
  })
  document.querySelector('#datasetFocus')!.innerHTML = `
    <strong>${ds.name}</strong> · ${ds.priority}<br/>
    ${ds.why}<br/><br/>
    <span style="color:var(--ink-soft)">When: ${ds.when}</span>
  `
}

function paintPhases(phase: (typeof PHASES)[number]) {
  const track = document.querySelector('#phaseTrack')!
  track.innerHTML = PHASES.map(
    (p) => `
    <button type="button" class="phase-btn ${p.id === activePhase ? 'active' : ''}" data-phase="${p.id}">
      <strong>${p.title}</strong>
      <span>${p.weeks}</span>
    </button>`,
  ).join('')
  track.querySelectorAll<HTMLButtonElement>('[data-phase]').forEach((btn) => {
    btn.addEventListener('click', () => {
      activePhase = btn.dataset.phase!
      paintPhases(PHASES.find((p) => p.id === activePhase) ?? PHASES[0])
    })
  })
  document.querySelector('#phaseBlurb')!.textContent = `${phase.title}: ${phase.blurb}`
}

function paintWeek(checks: Record<string, boolean>) {
  const list = document.querySelector('#weekList')!
  list.innerHTML = WEEK_TASKS.map(
    (t) => `
    <li>
      <input type="checkbox" id="chk-${t.id}" data-check="${t.id}" ${checks[t.id] ? 'checked' : ''} />
      <label for="chk-${t.id}">${t.label}</label>
    </li>`,
  ).join('')
  list.querySelectorAll<HTMLInputElement>('[data-check]').forEach((input) => {
    input.addEventListener('change', () => {
      const map = loadChecks()
      map[input.dataset.check!] = input.checked
      saveChecks(map)
      const done = WEEK_TASKS.filter((t) => map[t.id]).length
      const pct = Math.round((done / WEEK_TASKS.length) * 100)
      const bar = document.querySelector<HTMLElement>('#weekBar')
      if (bar) bar.style.width = `${pct}%`
      const meta = document.querySelector('#weekMeta')
      if (meta) meta.textContent = `${done} / ${WEEK_TASKS.length} done · ${pct}%`
    })
  })
  document.querySelector('#resetChecks')?.addEventListener('click', () => {
    saveChecks({})
    paintWeek({})
    const bar = document.querySelector<HTMLElement>('#weekBar')
    if (bar) bar.style.width = '0%'
    const meta = document.querySelector('#weekMeta')
    if (meta) meta.textContent = `0 / ${WEEK_TASKS.length} done · 0%`
  })
}

function bindChrome() {
  document.querySelectorAll<HTMLButtonElement>('[data-jump]').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelector(`#${btn.dataset.jump}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  })
}

/* ——— Hero particles over stylized coasts ——— */
let heroRaf = 0
function startHero() {
  cancelAnimationFrame(heroRaf)
  const canvas = document.querySelector<HTMLCanvasElement>('#heroCanvas')
  if (!canvas) return
  const ctx = canvas.getContext('2d')!
  const particles = Array.from({ length: 48 }, () => ({
    x: Math.random(),
    y: Math.random(),
    v: 0.0008 + Math.random() * 0.0018,
    s: 0.6 + Math.random() * 1.8,
  }))

  const resize = () => {
    const rect = canvas.getBoundingClientRect()
    canvas.width = Math.floor(rect.width * devicePixelRatio)
    canvas.height = Math.floor(rect.height * devicePixelRatio)
  }
  resize()
  window.addEventListener('resize', resize, { passive: true })

  const tick = (t: number) => {
    const w = canvas.width
    const h = canvas.height
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, w, h)

    // layered coastline silhouette
    const g = ctx.createLinearGradient(0, 0, w, h)
    g.addColorStop(0, '#163a44')
    g.addColorStop(0.55, '#1f5a66')
    g.addColorStop(1, '#2a6b5c')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, w, h)

    ctx.fillStyle = 'rgba(212, 180, 120, 0.16)'
    ctx.beginPath()
    ctx.moveTo(0, h * 0.62)
    for (let x = 0; x <= w; x += w / 40) {
      const y =
        h *
        (0.55 +
          0.08 * Math.sin(x * 0.01 + t * 0.0004) +
          0.05 * Math.sin(x * 0.02 + 1.7) +
          0.12 * Math.sin(x * 0.004))
      ctx.lineTo(x, y)
    }
    ctx.lineTo(w, h)
    ctx.lineTo(0, h)
    ctx.fill()

    ctx.fillStyle = 'rgba(90, 130, 90, 0.35)'
    ctx.beginPath()
    ctx.moveTo(0, h * 0.72)
    for (let x = 0; x <= w; x += w / 36) {
      const y = h * (0.68 + 0.06 * Math.sin(x * 0.012 + t * 0.0005 + 2))
      ctx.lineTo(x, y)
    }
    ctx.lineTo(w, h)
    ctx.lineTo(0, h)
    ctx.fill()

    for (const p of particles) {
      p.x += p.v
      if (p.x > 1.05) {
        p.x = -0.05
        p.y = Math.random()
      }
      ctx.fillStyle = `rgba(231,242,240,${0.15 + p.s * 0.08})`
      ctx.beginPath()
      ctx.arc(p.x * w, p.y * h * 0.55, p.s * devicePixelRatio, 0, Math.PI * 2)
      ctx.fill()
    }

    heroRaf = requestAnimationFrame(tick)
  }
  heroRaf = requestAnimationFrame(tick)
}

/* ——— Orographic teaching canvas ——— */
let oroRaf = 0
function startOro() {
  cancelAnimationFrame(oroRaf)
  const canvas = document.querySelector<HTMLCanvasElement>('#oroCanvas')
  const ridgeInput = document.querySelector<HTMLInputElement>('#ridge')
  const windInput = document.querySelector<HTMLInputElement>('#wind')
  if (!canvas || !ridgeInput || !windInput) return
  const ctx = canvas.getContext('2d')!

  ridgeInput.oninput = () => {
    ridge = Number(ridgeInput.value) / 100
    document.querySelector('#ridgeVal')!.textContent = `${ridgeInput.value}%`
    updateOroMeters()
  }
  windInput.oninput = () => {
    wind = Number(windInput.value) / 100
    document.querySelector('#windVal')!.textContent = `${windInput.value}%`
    updateOroMeters()
  }

  const drops: { x: number; y: number; life: number; side: 'w' | 'l' }[] = []

  const tick = (t: number) => {
    const w = canvas.width
    const h = canvas.height
    ctx.clearRect(0, 0, w, h)

    // sky
    const sky = ctx.createLinearGradient(0, 0, 0, h)
    sky.addColorStop(0, '#7fa8b0')
    sky.addColorStop(1, '#d7e4dc')
    ctx.fillStyle = sky
    ctx.fillRect(0, 0, w, h)

    const baseY = h * 0.78
    const peakX = w * 0.52
    const peakH = h * (0.18 + ridge * 0.45)

    // ground
    ctx.fillStyle = '#6f8f5a'
    ctx.fillRect(0, baseY, w, h - baseY)

    // mountain
    ctx.beginPath()
    ctx.moveTo(w * 0.18, baseY)
    ctx.quadraticCurveTo(peakX - w * 0.08, baseY - peakH * 0.35, peakX, baseY - peakH)
    ctx.quadraticCurveTo(peakX + w * 0.1, baseY - peakH * 0.25, w * 0.88, baseY)
    ctx.closePath()
    const rock = ctx.createLinearGradient(peakX, baseY - peakH, peakX, baseY)
    rock.addColorStop(0, '#e8e4df')
    rock.addColorStop(0.35, '#9a8f82')
    rock.addColorStop(1, '#6a7d55')
    ctx.fillStyle = rock
    ctx.fill()

    // windward lush vs leeward dry ground tint
    const wet = moistureWindward()
    const dry = moistureLeeward()
    ctx.fillStyle = `rgba(40, 110, 70, ${0.15 + wet * 0.35})`
    ctx.fillRect(0, baseY, peakX, h - baseY)
    ctx.fillStyle = `rgba(180, 130, 70, ${0.12 + (1 - dry) * 0.4})`
    ctx.fillRect(peakX, baseY, w - peakX, h - baseY)

    // wind lines
    ctx.strokeStyle = `rgba(255,255,255,${0.25 + wind * 0.35})`
    ctx.lineWidth = 1.5
    for (let i = 0; i < 7; i++) {
      const y = h * (0.18 + i * 0.07)
      const phase = (t * 0.04 * wind + i) % (w * 0.35)
      ctx.beginPath()
      ctx.moveTo(phase - 40, y)
      ctx.bezierCurveTo(phase + 40, y - 6, phase + 80, y + 6, phase + 140, y)
      ctx.stroke()
    }

    // spawn rain / sparse dust
    if (Math.random() < 0.35 + wet * 0.4) {
      drops.push({ x: Math.random() * peakX * 0.95, y: h * 0.12, life: 1, side: 'w' })
    }
    if (Math.random() < 0.08 + (1 - dry) * 0.05) {
      drops.push({ x: peakX + Math.random() * (w - peakX), y: h * 0.2, life: 1, side: 'l' })
    }

    for (let i = drops.length - 1; i >= 0; i--) {
      const d = drops[i]
      d.x += 1.8 * wind + (d.side === 'w' ? 0.4 : 0.9)
      d.y += d.side === 'w' ? 3.2 : 1.4
      d.life -= 0.02
      ctx.fillStyle =
        d.side === 'w' ? `rgba(80,140,200,${d.life * 0.8})` : `rgba(200,170,110,${d.life * 0.5})`
      ctx.fillRect(d.x, d.y, d.side === 'w' ? 2 : 3, d.side === 'w' ? 7 : 3)
      if (d.life <= 0 || d.y > baseY) drops.splice(i, 1)
    }

    // labels
    ctx.fillStyle = 'rgba(20,32,28,0.75)'
    ctx.font = '600 14px Outfit, sans-serif'
    ctx.fillText('Windward · wet', 24, baseY + 28)
    ctx.fillText('Leeward · rain shadow', peakX + 16, baseY + 28)

    oroRaf = requestAnimationFrame(tick)
  }
  oroRaf = requestAnimationFrame(tick)
}

function moistureWindward() {
  return Math.min(1, 0.35 + wind * 0.4 + ridge * 0.35)
}

function moistureLeeward() {
  return Math.max(0.05, 0.85 - ridge * 0.7 * wind - wind * 0.1)
}

function updateOroMeters() {
  const wet = moistureWindward()
  const dry = moistureLeeward()
  const wetEl = document.querySelector<HTMLElement>('#wetMeter span')
  const dryEl = document.querySelector<HTMLElement>('#dryMeter span')
  if (wetEl) wetEl.style.width = `${Math.round(wet * 100)}%`
  if (dryEl) dryEl.style.width = `${Math.round(dry * 100)}%`
  const n = document.querySelector('#oroNarration')
  if (n) {
    n.textContent =
      dry < 0.35
        ? 'Strong rain shadow: air dumped moisture climbing the ridge; the far side stays arid. Calibration fits this pattern to real WorldClim + ERA5 wind.'
        : ridge < 0.35
          ? 'Low ridge: little lift, so east and west stay similarly moist. Raise the mountain.'
          : 'Moderate shadow forming. Push ridge height and wind to see the lee dry out.'
  }
}

render()
