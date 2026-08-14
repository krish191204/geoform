/**
 * Critique page (`/critique.html`). Drop a Geoform JSON (or a picture) and
 * get a grade. Gallery includes healthy worlds and deliberately broken ones.
 *
 * Repair like the editor runs harmonizeWorld. Leave it broken if you want
 * to see why the score is bad. deserializeWorld(..., { repair: false })
 * is how we load a broken save without silently fixing it.
 */
import './style.css'
import { navHtml } from '../chrome/nav'
import {
  analyzeMapImage,
  analyzeRawPixels,
  type ImageMode,
} from './analyzeImage'
import { analyzeGeoformWorld } from './analyzeWorld'
import { getGeoformSamples, repairedCopy, worldToJson, type GeoformSample } from './geoformSamples'
import { deserializeWorld, type SavedWorld } from '../world/persist'
import type { World } from '../world/types'
import { drawCritiquePreview } from './preview'
import { getAllSamples, sampleToCanvas, type SampleMap } from './sampleMaps'
import { KIND_LABEL, SEVERITY_LABEL, type CritiqueResult, type IssueKind, type Severity } from './types'

const root = document.querySelector<HTMLDivElement>('#critique-root')!

let result: CritiqueResult | null = null
let activeId: string | null = null
let filter: 'all' | Severity = 'all'
let previewImage: ImageBitmap | HTMLImageElement | HTMLCanvasElement | null = null
let raf = 0
let mode: ImageMode = 'auto'
let lastFile: File | null = null
let galleryScores: Record<string, number> = {}
let geoformScores: Record<string, number> = {}
let geoformCache: GeoformSample[] | null = null
let lastWorld: World | null = null

function geoformList() {
  if (!geoformCache) geoformCache = getGeoformSamples()
  return geoformCache
}

function render() {
  const samples = getAllSamples()
  root.innerHTML = `
    <div class="shell">
      ${navHtml('critique')}

      <header class="hero">
        <div class="hero-veil"></div>
        <div class="hero-copy">
          <h1>Critique</h1>
          <p>The atlas repairs broken geography as you paint. This page grades maps you bring in — fixture crimes, Earth-pattern rain shadows, Geoform JSON, and owned fantasy benchmarks.</p>
          <div class="hero-actions">
            <button type="button" class="chip-btn btn-primary" id="pickFile">Upload image or JSON</button>
            <button type="button" class="chip-btn" data-jump="geoform">Geoform worlds</button>
            <button type="button" class="chip-btn" data-jump="gallery">Image fixtures</button>
          </div>
        </div>
      </header>

      <section class="panel" id="geoform">
        <div class="section-head-inline">
          <div>
            <h2>Geoform worlds</h2>
            <p class="muted">Live local-atlas samples. Broken cards are what the editor now repairs on its own — critique still names the crime.</p>
          </div>
        </div>
        <div class="gallery-grid" id="geoformGrid"></div>
      </section>

      <section class="panel" id="gallery">
        <div class="section-head-inline">
          <div>
            <h2>Fixture gallery</h2>
            <p class="muted">Click a card to run the same critic the Vitest suite uses. Corpus: synthetic · earth-pattern · fantasy-owned.</p>
          </div>
          <button type="button" class="chip-btn" id="gradeAll">Grade all</button>
        </div>
        <div class="gallery-grid" id="galleryGrid"></div>
      </section>

      <section class="panel">
        <div class="drop" id="drop">
          <h2>Drop a map image or Geoform JSON</h2>
          <p>
            <strong>PNG / JPG / WebP / GIF</strong> for painted atlases, or a <strong>Geoform export</strong> (<code>.json</code>)
            from the editor. Toggle mode if auto-detect guesses wrong.
          </p>
          <div class="mode-row" id="modeRow">
            <button type="button" class="chip-btn ${mode === 'auto' ? 'active' : ''}" data-mode="auto">Auto</button>
            <button type="button" class="chip-btn ${mode === 'painted' ? 'active' : ''}" data-mode="painted">Painted map</button>
            <button type="button" class="chip-btn ${mode === 'heightmap' ? 'active' : ''}" data-mode="heightmap">Heightmap</button>
          </div>
          <div class="drop-actions">
            <button type="button" class="chip-btn btn-primary" id="pickFile2">Choose image</button>
          </div>
          <input class="hidden-file" id="file" type="file" accept="image/png,image/jpeg,image/webp,image/gif,.png,.jpg,.jpeg,.webp,.gif,application/json,.json" />
        </div>

        <div class="workspace" id="workspace" hidden>
          <div>
            <div class="preview-wrap">
              <canvas id="preview"></canvas>
            </div>
          </div>
          <div>
            <div class="scoreboard" id="scoreboard"></div>
            <div class="filters" id="filters"></div>
            <div class="issue-list" id="issues"></div>
          </div>
        </div>
      </section>

      <p class="footer-note">
        Policy: Earth AOIs calibrate physics; these images and Geoform exports benchmark the critic.
        The map editor does not nag — it repairs. Critique is the place that still says the quiet part out loud.
        See <a href="/docs/TRAINING_AND_TESTS.md">TRAINING_AND_TESTS.md</a>
        · Labs: <a href="/labs.html">/labs.html</a>
        · Editor: <a href="/">/</a>
      </p>
    </div>
  `

  paintGallery(samples)
  paintGeoform()
  bind(samples)
  if (result) paintResult()
}

function paintGallery(samples: SampleMap[]) {
  const grid = root.querySelector('#galleryGrid')!
  grid.innerHTML = samples
    .map((s) => {
      const score = galleryScores[s.id]
      const canvas = sampleToCanvas(s)
      const url = canvas.toDataURL('image/png')
      return `
      <button type="button" class="gallery-card" data-sample="${s.id}">
        <img src="${url}" alt="${s.title}" />
        <div class="gallery-meta">
          <strong>${s.title}</strong>
          <span class="corpus">${s.corpus}</span>
          <span class="score-pill">${score == null ? '—' : score}</span>
        </div>
        <p>${s.blurb}</p>
      </button>`
    })
    .join('')

  grid.querySelectorAll<HTMLButtonElement>('[data-sample]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const sample = samples.find((s) => s.id === btn.dataset.sample)
      if (sample) void runSample(sample)
    })
  })
}

function worldThumb(world: World): string {
  const c = document.createElement('canvas')
  c.width = world.width
  c.height = world.height
  const ctx = c.getContext('2d')!
  const img = ctx.createImageData(world.width, world.height)
  const sea = world.seaLevel
  for (let i = 0; i < world.elev.length; i++) {
    const o = i * 4
    if (world.elev[i] < sea) {
      img.data[o] = 32
      img.data[o + 1] = 86
      img.data[o + 2] = 112
    } else {
      const t = Math.max(0, Math.min(1, (world.elev[i] - sea) * 2.2))
      img.data[o] = (70 + t * 90) | 0
      img.data[o + 1] = (118 + t * 50) | 0
      img.data[o + 2] = (62 + t * 30) | 0
    }
    img.data[o + 3] = 255
  }
  ctx.putImageData(img, 0, 0)
  return c.toDataURL('image/png')
}

function paintGeoform() {
  const grid = root.querySelector('#geoformGrid')
  if (!grid) return
  const samples = geoformList()
  grid.innerHTML = samples
    .map((s) => {
      const score = geoformScores[s.id]
      return `
      <button type="button" class="gallery-card" data-geoform="${s.id}">
        <img src="${worldThumb(s.world)}" alt="${s.title}" />
        <div class="gallery-meta">
          <strong>${s.title}</strong>
          <span class="corpus">${s.kind}</span>
          <span class="score-pill">${score == null ? '—' : score}</span>
        </div>
        <p>${s.blurb}</p>
      </button>`
    })
    .join('')
  grid.querySelectorAll<HTMLButtonElement>('[data-geoform]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const sample = samples.find((s) => s.id === btn.dataset.geoform)
      if (sample) runGeoform(sample)
    })
  })
}

function runGeoform(sample: GeoformSample) {
  lastFile = null
  lastWorld = sample.world
  result = analyzeGeoformWorld(worldToJson(sample.world))
  result.label = sample.title
  geoformScores[sample.id] = result.score
  previewImage = null
  activeId = result.issues[0]?.id ?? null
  filter = 'all'
  paintGeoform()
  paintResult()
}

function gradeSample(sample: SampleMap) {
  const r = analyzeRawPixels(sample.data, sample.width, sample.height, sample.id, mode === 'auto' ? sample.mode : mode)
  galleryScores[sample.id] = r.score
  return r
}

async function runSample(sample: SampleMap) {
  lastFile = null
  lastWorld = null
  const r = gradeSample(sample)
  result = r
  previewImage = sampleToCanvas(sample)
  activeId = r.issues[0]?.id ?? null
  filter = 'all'
  paintGallery(getAllSamples())
  paintResult()
}

function bind(samples: SampleMap[]) {
  const file = root.querySelector<HTMLInputElement>('#file')!
  const drop = root.querySelector('#drop')!
  const open = () => file.click()
  root.querySelector('#pickFile')?.addEventListener('click', open)
  root.querySelector('#pickFile2')?.addEventListener('click', open)
  drop.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).closest('button')) return
    open()
  })

  file.addEventListener('change', async () => {
    const f = file.files?.[0]
    if (f) await ingest(f)
    file.value = ''
  })

  ;['dragenter', 'dragover'].forEach((ev) => {
    drop.addEventListener(ev, (e) => {
      e.preventDefault()
      drop.classList.add('drag')
    })
  })
  ;['dragleave', 'drop'].forEach((ev) => {
    drop.addEventListener(ev, (e) => {
      e.preventDefault()
      drop.classList.remove('drag')
    })
  })
  drop.addEventListener('drop', async (e) => {
    const f = (e as DragEvent).dataTransfer?.files?.[0]
    if (f) await ingest(f)
  })

  root.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      mode = btn.dataset.mode as ImageMode
      root.querySelectorAll('[data-mode]').forEach((b) => b.classList.toggle('active', b === btn))
      if (lastFile) await ingest(lastFile)
    })
  })

  root.querySelector('#gradeAll')?.addEventListener('click', () => {
    for (const s of samples) gradeSample(s)
    paintGallery(getAllSamples())
  })

  root.querySelectorAll<HTMLButtonElement>('[data-jump]').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelector(`#${btn.dataset.jump}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  })
}

async function ingest(file: File) {
  try {
    const isImage = file.type.startsWith('image/') || /\.(png|jpe?g|webp|gif)$/i.test(file.name)
    if (!isImage) {
      if (/\.json$/i.test(file.name) || file.type.includes('json')) {
        const text = await file.text()
        previewImage = null
        lastFile = null
        lastWorld = deserializeWorld(JSON.parse(text) as SavedWorld, { repair: false })
        result = analyzeGeoformWorld(worldToJson(lastWorld))
        activeId = result.issues[0]?.id ?? null
        filter = 'all'
        paintResult()
        return
      }
      throw new Error('Drop a map image (PNG, JPG, WebP, or GIF) or a Geoform JSON export.')
    }

    lastFile = file
    lastWorld = null
    result = await analyzeMapImage(file, { mode })
    previewImage = await createImageBitmap(file).catch(async () => {
      const url = URL.createObjectURL(file)
      const img = new Image()
      await new Promise<void>((res, rej) => {
        img.onload = () => res()
        img.onerror = () => rej()
        img.src = url
      })
      URL.revokeObjectURL(url)
      return img
    })
    activeId = result.issues[0]?.id ?? null
    filter = 'all'
    paintResult()
  } catch (err) {
    alert(err instanceof Error ? err.message : 'Could not read that file')
  }
}

function paintResult() {
  if (!result) return
  const workspace = root.querySelector<HTMLElement>('#workspace')!
  workspace.hidden = false
  workspace.scrollIntoView({ behavior: 'smooth', block: 'start' })

  root.querySelector('#scoreboard')!.innerHTML = `
    <div class="score-card">
      <div class="label">Geography grade</div>
      <div class="big">${result.score}</div>
      <p>${result.summary}</p>
      <p style="margin-top:0.45rem">${escapeHtml(result.label)} · ${result.width}×${result.height}</p>
      ${
        lastWorld
          ? `<button type="button" class="chip-btn" id="repairWorld" style="margin-top:0.7rem">Repair like the editor</button>`
          : ''
      }
    </div>
  `

  root.querySelector('#repairWorld')?.addEventListener('click', () => {
    if (!lastWorld) return
    lastWorld = repairedCopy(lastWorld)
    result = analyzeGeoformWorld(worldToJson(lastWorld))
    result.label = `${result.label} · repaired`
    previewImage = null
    activeId = result.issues[0]?.id ?? null
    filter = 'all'
    paintResult()
  })

  const filters = root.querySelector('#filters')!
  const counts: Record<string, number> = { all: result.issues.length }
  for (const s of ['critical', 'major', 'minor', 'note'] as Severity[]) {
    counts[s] = result.issues.filter((i) => i.severity === s).length
  }
  filters.innerHTML = (['all', 'critical', 'major', 'minor', 'note'] as const)
    .map(
      (s) => `
      <button type="button" class="chip-btn ${filter === s ? 'active' : ''}" data-filter="${s}">
        ${s === 'all' ? 'All' : SEVERITY_LABEL[s]} · ${counts[s]}
      </button>`,
    )
    .join('')
  filters.querySelectorAll<HTMLButtonElement>('[data-filter]').forEach((btn) => {
    btn.addEventListener('click', () => {
      filter = btn.dataset.filter as typeof filter
      paintResult()
    })
  })

  const list = root.querySelector('#issues')!
  const shown = result.issues.filter((i) => filter === 'all' || i.severity === filter)
  if (!shown.length) {
    list.innerHTML = `<p class="empty">Nothing in this severity bucket.</p>`
  } else {
    list.innerHTML = shown
      .map((issue) => {
        const kind = KIND_LABEL[issue.kind as IssueKind] ?? issue.kind
        return `
        <button type="button" class="issue ${issue.id === activeId ? 'active' : ''}" data-issue="${issue.id}">
          <div class="issue-top">
            <span class="badge ${issue.severity}">${SEVERITY_LABEL[issue.severity]}</span>
            <span class="badge note">${kind}</span>
            <span class="badge note">${Math.round(issue.confidence * 100)}% conf.</span>
          </div>
          <h3>${escapeHtml(issue.title)}</h3>
          <p>${escapeHtml(issue.critique)}</p>
          <p class="fix"><strong>Fix:</strong> ${escapeHtml(issue.fix)}</p>
          ${issue.evidence ? `<p style="margin:0.35rem 0 0;font-size:0.82rem;color:var(--ink-soft)">${escapeHtml(issue.evidence)}</p>` : ''}
        </button>`
      })
      .join('')
    list.querySelectorAll<HTMLButtonElement>('[data-issue]').forEach((btn) => {
      btn.addEventListener('click', () => {
        activeId = btn.dataset.issue!
        paintResult()
      })
    })
  }

  cancelAnimationFrame(raf)
  const canvas = root.querySelector<HTMLCanvasElement>('#preview')!
  const tick = () => {
    if (!result) return
    drawCritiquePreview(canvas, result, activeId, previewImage)
    raf = requestAnimationFrame(tick)
  }
  raf = requestAnimationFrame(tick)
}

function escapeHtml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

render()
