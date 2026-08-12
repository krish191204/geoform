import './style.css'
import {
  analyzeImageElement,
  analyzeMapImage,
  makeBrokenSampleCanvas,
  type ImageMode,
} from './analyzeImage'
import { analyzeGeoformWorld } from './analyzeWorld'
import { drawCritiquePreview } from './preview'
import { KIND_LABEL, SEVERITY_LABEL, type CritiqueResult, type IssueKind, type Severity } from './types'

const root = document.querySelector<HTMLDivElement>('#critique-root')!

let result: CritiqueResult | null = null
let activeId: string | null = null
let filter: 'all' | Severity = 'all'
let previewImage: ImageBitmap | HTMLImageElement | HTMLCanvasElement | null = null
let raf = 0
let mode: ImageMode = 'auto'
let lastFile: File | null = null

function render() {
  root.innerHTML = `
    <div class="shell">
      <nav class="topnav">
        <a class="brand-lock" href="/">Geoform</a>
        <div class="nav-links">
          <a href="/">Map editor</a>
          <a href="/labs.html">Geography labs</a>
          <a href="/roadmap.html">Accuracy roadmap</a>
        </div>
      </nav>

      <header class="hero">
        <div class="hero-veil"></div>
        <div class="hero-copy">
          <h1>Geoform</h1>
          <p>Drop a map image. We read water, rivers, biomes, and relief from the pixels — then roast what breaks geography.</p>
          <div class="hero-actions">
            <button type="button" class="chip-btn btn-primary" id="pickFile">Upload image</button>
            <button type="button" class="chip-btn" id="loadBroken">Try a broken sample</button>
          </div>
        </div>
      </header>

      <section class="panel">
        <div class="drop" id="drop">
          <h2>Drop a map image</h2>
          <p>
            Built for <strong>PNG / JPG / WebP / GIF</strong> — painted atlases or grayscale heightmaps.
            Auto-detects which one you gave it. Toggle below if it guesses wrong.
          </p>
          <div class="mode-row" id="modeRow">
            <button type="button" class="chip-btn ${mode === 'auto' ? 'active' : ''}" data-mode="auto">Auto</button>
            <button type="button" class="chip-btn ${mode === 'painted' ? 'active' : ''}" data-mode="painted">Painted map</button>
            <button type="button" class="chip-btn ${mode === 'heightmap' ? 'active' : ''}" data-mode="heightmap">Heightmap</button>
          </div>
          <div class="drop-actions">
            <button type="button" class="chip-btn btn-primary" id="pickFile2">Choose image</button>
            <button type="button" class="chip-btn" id="loadBroken2">Broken sample</button>
          </div>
          <input class="hidden-file" id="file" type="file" accept="image/png,image/jpeg,image/webp,image/gif,.png,.jpg,.jpeg,.webp,.gif" />
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
        Image critiques are geography heuristics from color &amp; shape — not a climate model.
        Pair with the <a href="/labs.html">geography labs</a> to feel the rules yourself.
      </p>
    </div>
  `

  bind()
  if (result) paintResult()
}

function bind() {
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
    const dt = (e as DragEvent).dataTransfer
    const f = dt?.files?.[0]
    if (f) await ingest(f)
  })

  root.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      mode = btn.dataset.mode as ImageMode
      root.querySelectorAll('[data-mode]').forEach((b) => b.classList.toggle('active', b === btn))
      if (lastFile) await ingest(lastFile)
      else if (previewImage && result?.label.includes('Broken sample')) await loadBrokenSample()
    })
  })

  root.querySelector('#loadBroken')?.addEventListener('click', () => void loadBrokenSample())
  root.querySelector('#loadBroken2')?.addEventListener('click', () => void loadBrokenSample())
}

async function ingest(file: File) {
  try {
    const isImage =
      file.type.startsWith('image/') || /\.(png|jpe?g|webp|gif)$/i.test(file.name)
    if (!isImage) {
      // quiet fallback — not the product focus
      if (/\.json$/i.test(file.name) || file.type.includes('json')) {
        const text = await file.text()
        previewImage = null
        lastFile = null
        result = analyzeGeoformWorld(JSON.parse(text))
        activeId = result.issues[0]?.id ?? null
        filter = 'all'
        paintResult()
        return
      }
      throw new Error('Drop a map image (PNG, JPG, WebP, or GIF).')
    }

    lastFile = file
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

  const sb = root.querySelector('#scoreboard')!
  sb.innerHTML = `
    <div class="score-card">
      <div class="label">Geography grade</div>
      <div class="big">${result.score}</div>
      <p>${result.summary}</p>
      <p style="margin-top:0.45rem">${escapeHtml(result.label)} · ${result.width}×${result.height}</p>
    </div>
  `

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
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

async function loadBrokenSample() {
  lastFile = null
  const sample = makeBrokenSampleCanvas()
  previewImage = sample
  result = await analyzeImageElement(sample, 'Broken sample', mode)
  activeId = result.issues[0]?.id ?? null
  filter = 'all'
  paintResult()
}

render()
