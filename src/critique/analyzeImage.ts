/**
 * Grade a picture of a map (PNG/JPEG), not a Geoform JSON.
 * We guess height/water from colors. Less accurate than grading a save file.
 */
import type { CritiqueResult, MapIssue, Severity } from './types'
import { sampleBrokenDesertJungle, sampleToCanvas } from './sampleMaps'

export type ImageMode = 'auto' | 'painted' | 'heightmap'

export interface AnalyzeImageOptions {
  mode?: ImageMode
}

interface PixelMaps {
  w: number
  h: number
  elev: Float32Array
  moist: Float32Array
  water: Float32Array
  river: Float32Array
  ice: Float32Array
  relief: Float32Array
  mode: 'painted' | 'heightmap'
}

/** Primary path: criticize a map image (PNG/JPG/WebP/GIF). */
export async function analyzeMapImage(
  file: File,
  opts: AnalyzeImageOptions = {},
): Promise<CritiqueResult> {
  const bmp = await loadImage(file)
  return analyzeImageElement(bmp, file.name, opts.mode ?? 'auto')
}

export async function analyzeImageElement(
  bmp: HTMLImageElement | ImageBitmap | HTMLCanvasElement,
  label: string,
  mode: ImageMode = 'auto',
): Promise<CritiqueResult> {
  const maxW = 280
  const maxH = 168
  const scale = Math.min(maxW / bmp.width, maxH / bmp.height, 1)
  const w = Math.max(48, Math.round(bmp.width * scale))
  const h = Math.max(32, Math.round(bmp.height * scale))

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(bmp, 0, 0, w, h)
  const { data } = ctx.getImageData(0, 0, w, h)
  return analyzeRawPixels(data, w, h, label, mode)
}

/** DOM-free entry for tests and fixture generators. */
export function analyzeRawPixels(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  label: string,
  mode: ImageMode = 'auto',
): CritiqueResult {
  if (data.length !== w * h * 4) {
    throw new Error(`RGBA length ${data.length} ≠ ${w * h * 4}`)
  }
  const detected = mode === 'auto' ? detectMode(data, w, h) : mode === 'painted' || mode === 'heightmap' ? mode : 'painted'
  const maps = buildMaps(data, w, h, detected)
  const issues = critiquePixels(maps, data)
  const score = grade(issues)

  return {
    source: 'image',
    label: `${label} · ${maps.mode} read`,
    width: w,
    height: h,
    score,
    summary: summarize(score, issues, maps.mode),
    issues,
    elev: maps.elev,
    moist: maps.moist,
    water: maps.water,
  }
}

function detectMode(data: Uint8ClampedArray, w: number, h: number): 'painted' | 'heightmap' {
  let satSum = 0
  let n = 0
  const step = Math.max(1, ((w * h) / 4000) | 0)
  for (let i = 0; i < w * h; i += step) {
    const o = i * 4
    const r = data[o] / 255
    const g = data[o + 1] / 255
    const b = data[o + 2] / 255
    const max = Math.max(r, g, b)
    const min = Math.min(r, g, b)
    satSum += max > 1e-6 ? (max - min) / max : 0
    n++
  }
  const sat = satSum / Math.max(1, n)
  // grayscale / soft gray = heightmap; colorful = painted atlas
  return sat < 0.12 ? 'heightmap' : 'painted'
}

function buildMaps(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  mode: 'painted' | 'heightmap',
): PixelMaps {
  const elev = new Float32Array(w * h)
  const moist = new Float32Array(w * h)
  const water = new Float32Array(w * h)
  const river = new Float32Array(w * h)
  const ice = new Float32Array(w * h)
  const relief = new Float32Array(w * h)
  const lum = new Float32Array(w * h)

  for (let i = 0; i < w * h; i++) {
    const o = i * 4
    const r = data[o] / 255
    const g = data[o + 1] / 255
    const b = data[o + 2] / 255
    const L = 0.2126 * r + 0.7152 * g + 0.0722 * b
    lum[i] = L
    const { s } = rgbToHsv(r, g, b)
    const blueDom = b - Math.max(r, g)
    const greenDom = g - Math.max(r, b)
    const arid = r > 0.42 && g > 0.32 && b < 0.4 && r + 0.05 >= g && s > 0.15
    const icy = L > 0.78 && s < 0.18 && b >= r * 0.92
    ice[i] = icy ? 1 : 0

    // water: blue-dominant or dark teal, not bright ice
    const isWater =
      !icy &&
      ((blueDom > 0.07 && b > 0.25 && L < 0.78 && s > 0.12) ||
        (b > 0.35 && g > 0.25 && r < 0.28 && L < 0.62))
    water[i] = isWater ? 1 : 0

    if (mode === 'heightmap') {
      elev[i] = isWater ? Math.min(L, 0.12) : clamp(L, 0, 1)
      moist[i] = isWater ? 0.95 : clamp(0.55 - Math.abs(L - 0.45) * 0.4, 0.05, 0.9)
    } else {
      // painted: snow/rock bright = high; forest mid; desert mid-high; water low
      let e = 0.2 + L * 0.45
      if (icy) e = 0.88 + L * 0.1
      else if (arid) e = 0.35 + L * 0.25
      else if (greenDom > 0.05) e = 0.22 + L * 0.35
      if (s < 0.12 && L > 0.55 && !isWater) e = Math.max(e, 0.55 + L * 0.35) // gray rock
      elev[i] = isWater ? 0.06 : clamp(e, 0.08, 1)
      moist[i] = isWater
        ? 0.95
        : clamp(0.2 + greenDom * 1.6 - (arid ? 0.4 : 0) + (icy ? -0.2 : 0) + (1 - L) * 0.08, 0, 1)
    }
  }

  // edge-connected ocean flood; inland water can still be lake/river paint
  const ocean = floodOcean(water, w, h)

  // local relief (mountain proxy)
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x
      const c = elev[i]
      let minN = c
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          minN = Math.min(minN, elev[(y + dy) * w + (x + dx)])
        }
      }
      relief[i] = Math.max(0, c - minN)
    }
  }

  // rivers: thin blue-ish strokes — including inland water paint that isn't ocean
  for (let y = 2; y < h - 2; y++) {
    for (let x = 2; x < w - 2; x++) {
      const i = y * w + x
      if (ocean[i]) continue
      const o = i * 4
      const r = data[o] / 255
      const g = data[o + 1] / 255
      const b = data[o + 2] / 255
      const L = lum[i]
      const blueDom = b - Math.max(r, g)
      const teal = b > 0.28 && g > 0.22 && r < 0.35 && L < 0.7
      const wetPaint = water[i] > 0.5
      if (!(blueDom > 0.045 || teal || wetPaint)) continue
      let oceanN = 0
      let landN = 0
      for (let dy = -3; dy <= 3; dy++) {
        for (let dx = -3; dx <= 3; dx++) {
          const j = (y + dy) * w + (x + dx)
          if (ocean[j]) oceanN++
          else if (water[j] < 0.5) landN++
        }
      }
      // thin corridor through land, not a bay / lake blob
      let waterN = 0
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          if (water[(y + dy) * w + (x + dx)] > 0.5 && !ocean[(y + dy) * w + (x + dx)]) waterN++
        }
      }
      if (oceanN < 6 && landN > 18 && waterN < 22) {
        river[i] = clamp(0.45 + Math.max(blueDom, wetPaint ? 0.2 : 0) * 2.2, 0.45, 1)
      }
    }
  }

  // thicken river confidence slightly along neighbors
  const river2 = new Float32Array(river)
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x
      if (river[i] <= 0) continue
      let s = river[i]
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const) {
        s = Math.max(s, river[(y + dy) * w + (x + dx)] * 0.7)
      }
      river2[i] = s
    }
  }
  river.set(river2)

  // Stream paint is blue-gray; without this boost it reads as "arid" in moist and
  // poisons rain-shadow / desert-jungle checks next to channels.
  for (let i = 0; i < w * h; i++) {
    if (river[i] > 0.35) moist[i] = Math.max(moist[i], 0.72)
  }

  return { w, h, elev, moist, water, river, ice, relief, mode }
}

function floodOcean(water: Float32Array, w: number, h: number): Uint8Array {
  const ocean = new Uint8Array(w * h)
  const q: number[] = []
  const push = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return
    const i = y * w + x
    if (ocean[i] || water[i] < 0.5) return
    ocean[i] = 1
    q.push(i)
  }
  for (let x = 0; x < w; x++) {
    push(x, 0)
    push(x, h - 1)
  }
  for (let y = 0; y < h; y++) {
    push(0, y)
    push(w - 1, y)
  }
  while (q.length) {
    const i = q.pop()!
    const x = i % w
    const y = (i / w) | 0
    push(x + 1, y)
    push(x - 1, y)
    push(x, y + 1)
    push(x, y - 1)
  }
  return ocean
}

function critiquePixels(maps: PixelMaps, data: Uint8ClampedArray): MapIssue[] {
  const { w, h, elev, moist, water, river, ice, relief, mode } = maps
  const issues: MapIssue[] = []
  let n = 0
  const id = () => `img-${++n}`

  // ——— Rivers climbing relief ———
  {
    let climbs = 0
    let cx = 0
    let cy = 0
    let worst = 0
    for (let y = 2; y < h - 2; y++) {
      for (let x = 2; x < w - 2; x++) {
        const i = y * w + x
        if (river[i] < 0.45 || water[i] > 0.5) continue
        // local elev vs downhill neighbor along darker/bluer path
        let bestE = elev[i]
        for (const [dx, dy] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
          [1, 1],
          [1, -1],
          [-1, 1],
          [-1, -1],
        ] as const) {
          const j = (y + dy) * w + (x + dx)
          if (river[j] < 0.2 && water[j] < 0.5) continue
          if (elev[j] < bestE) {
            bestE = elev[j]
          }
        }
        const climb = elev[i] - bestE
        // river on strong local peak
        if (relief[i] > 0.08 && climb < 0.01) {
          climbs++
          if (relief[i] > worst) {
            worst = relief[i]
            cx = x
            cy = y
          }
        }
      }
    }
    const riverCells = countAbove(river, 0.45)
    if (riverCells > 12 && climbs > Math.max(4, riverCells * 0.08)) {
      issues.push({
        id: id(),
        severity: climbs > riverCells * 0.2 ? 'critical' : 'major',
        kind: 'hydro',
        title: 'Rivers ignore the land',
        critique: `About ${climbs} river strokes sit on local highs. Painted rivers that crest ridges or float across plateaus are the #1 fantasy-map giveaway.`,
        fix: 'Redraw channels in valley folds; thicken only after confluence. Water seeks lower ground.',
        at: { x: cx / w, y: cy / h },
        confidence: mode === 'painted' ? 0.78 : 0.7,
        evidence: `${riverCells} river pixels sampled`,
      })
    } else if (riverCells < 8 && mode === 'painted') {
      const land = countLand(water)
      if (land > w * h * 0.35) {
        issues.push({
          id: id(),
          severity: 'minor',
          kind: 'hydro',
          title: 'Almost no rivers',
          critique: 'Big landmass with barely any stream color. Continents need drainage — even dry ones show washes and wadis.',
          fix: 'Add a few trunk rivers from highlands to coast, branching upstream.',
          confidence: 0.55,
        })
      }
    }
  }

  // ——— Endorheic weirdness: river networks that never reach water ———
  {
    const reach = new Uint8Array(w * h)
    const q: number[] = []
    for (let i = 0; i < w * h; i++) {
      if (water[i] <= 0.5) continue
      // seed from water that touches a river corridor
      const x = i % w
      const y = (i / w) | 0
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          const nx = x + dx
          const ny = y + dy
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue
          const j = ny * w + nx
          if (river[j] >= 0.45 && !reach[j]) {
            reach[j] = 1
            q.push(j)
          }
        }
      }
    }
    for (let qi = 0; qi < q.length; qi++) {
      const i = q[qi]
      const x = i % w
      const y = (i / w) | 0
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
        [1, 1],
        [1, -1],
        [-1, 1],
        [-1, -1],
      ] as const) {
        const nx = x + dx
        const ny = y + dy
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue
        const j = ny * w + nx
        if (reach[j] || river[j] < 0.45) continue
        reach[j] = 1
        q.push(j)
      }
    }
    let stranded = 0
    let riverCells = 0
    let sx = 0
    let sy = 0
    for (let i = 0; i < w * h; i++) {
      if (river[i] < 0.5) continue
      riverCells++
      if (!reach[i]) {
        stranded++
        sx = i % w
        sy = (i / w) | 0
      }
    }
    if (riverCells > 12 && stranded > Math.max(10, riverCells * 0.45)) {
      issues.push({
        id: id(),
        severity: 'major',
        kind: 'hydro',
        title: 'Rivers to nowhere',
        critique: `${stranded} of ${riverCells} stream samples never reach a coast or lake through the channel network. Unless you mean endorheic basins, rivers should empty somewhere.`,
        fix: 'Connect trunks to the sea, or terminate in a labeled inland sea / salt flat.',
        at: { x: sx / w, y: sy / h },
        confidence: 0.72,
      })
    }
  }

  // ——— Flat vegetation / climate ———
  {
    let land = 0
    let mean = 0
    for (let i = 0; i < w * h; i++) {
      if (water[i] > 0.5) continue
      land++
      mean += moist[i]
    }
    if (land > 50) {
      mean /= land
      let v = 0
      for (let i = 0; i < w * h; i++) {
        if (water[i] > 0.5) continue
        v += (moist[i] - mean) ** 2
      }
      v /= land
      if (v < 0.006 && mode === 'painted') {
        issues.push({
          id: id(),
          severity: 'major',
          kind: 'climate',
          title: 'One biome blob',
          critique: 'Land color/moisture barely varies. Real maps show wet coasts, dry interiors, latitude belts, and rain shadows.',
          fix: 'Break the palette: steppe, forest, desert, alpine — with soft ecotones.',
          confidence: 0.74,
        })
      }
    }
  }

  // ——— Desert next to jungle ———
  {
    let hits = 0
    let hx = 0
    let hy = 0
    for (let y = 4; y < h - 4; y += 2) {
      for (let x = 4; x < w - 4; x += 2) {
        const i = y * w + x
        if (water[i] > 0.5 || river[i] > 0.35) continue
        for (const [dx, dy] of [
          [6, 0],
          [0, 6],
          [6, 6],
          [6, -6],
        ] as const) {
          const nx = x + dx
          const ny = y + dy
          if (nx < 2 || ny < 2 || nx >= w - 2 || ny >= h - 2) continue
          const j = ny * w + nx
          if (water[j] > 0.5 || river[j] > 0.35) continue
          const hi = Math.max(moist[i], moist[j])
          const lo = Math.min(moist[i], moist[j])
          // true jungle/forest vs arid — ignore mild grassland steps
          if (hi < 0.55 || lo > 0.2) continue
          // orographic barrier = real highland (snow/ice or bright rock), not biome elev jumps
          const steps = Math.max(Math.abs(dx), Math.abs(dy), 1)
          let hasRidge = false
          for (let t = 0; t <= steps; t++) {
            const xx = x + Math.round((dx * t) / steps)
            const yy = y + Math.round((dy * t) / steps)
            const k = yy * w + xx
            if (ice[k] > 0.5 || elev[k] > 0.72) {
              hasRidge = true
              break
            }
          }
          if (hasRidge) continue
          if (relief[i] < 0.06 && relief[j] < 0.06) {
            hits++
            hx = x
            hy = y
          }
        }
      }
    }
    if (hits > 10) {
      issues.push({
        id: id(),
        severity: 'critical',
        kind: 'orography',
        title: 'Desert kisses jungle',
        critique: `${hits} hard wet/dry contacts have no mountain or coast between them. That’s how you get Sahara glued to Amazon.`,
        fix: 'Add a range (rain shadow), an ocean arm, or a wide grassland transition.',
        at: { x: hx / w, y: hy / h },
        confidence: 0.8,
      })
    }
  }

  // ——— Missing rain shadow beside tall relief ———
  {
    let flips = 0
    let fx = 0
    let fy = 0
    for (let y = 4; y < h - 4; y += 3) {
      for (let x = 10; x < w - 10; x += 3) {
        const i = y * w + x
        if (water[i] > 0.5 || river[i] > 0.35 || relief[i] < 0.06 || elev[i] < 0.45) continue
        const iW = y * w + (x - 8)
        const iE = y * w + (x + 8)
        if (water[iW] > 0.5 || water[iE] > 0.5 || river[iW] > 0.35 || river[iE] > 0.35) continue
        const mW = moist[iW]
        const mE = moist[iE]
        // assume west wind: lee (east) should be drier
        if (mE > mW + 0.22) {
          flips++
          fx = x
          fy = y
        }
      }
    }
    if (flips > 4) {
      issues.push({
        id: id(),
        severity: 'major',
        kind: 'orography',
        title: 'Rain shadow probably flipped',
        critique: `On ${flips} highland samples the east side looks wetter than the west. If winds are westerlies, the lee should dry out.`,
        fix: 'Dry the downwind flank; green the upwind climb — or state a different prevailing wind.',
        at: { x: fx / w, y: fy / h },
        confidence: 0.62,
        evidence: 'Assumes west → east winds',
      })
    }
  }

  // ——— Lonely spike mountains ———
  {
    let peaks = 0
    let lonely = 0
    let px = 0
    let py = 0
    for (let y = 2; y < h - 2; y++) {
      for (let x = 2; x < w - 2; x++) {
        const i = y * w + x
        if (water[i] > 0.5 || elev[i] < 0.58 || relief[i] < 0.035) continue
        peaks++
        let near = 0
        for (let dy = -4; dy <= 4; dy++) {
          for (let dx = -4; dx <= 4; dx++) {
            if (Math.abs(dx) + Math.abs(dy) === 0) continue
            if (elev[(y + dy) * w + (x + dx)] > 0.52) near++
          }
        }
        // isolated spike: few highland neighbors in the ring
        if (near < 6) {
          lonely++
          px = x
          py = y
        }
      }
    }
    if (peaks > 8 && lonely / peaks > 0.22) {
      issues.push({
        id: id(),
        severity: 'minor',
        kind: 'tectonic',
        title: 'Salt-and-pepper peaks',
        critique: 'High points look scattered instead of belt-like. Plate boundaries build ranges and arcs, not confetti mountains.',
        fix: 'Connect peaks into continuous ridges along a suture line.',
        at: { x: px / w, y: py / h },
        confidence: 0.58,
      })
    }
  }

  // ——— Continentality: wet everywhere inland ———
  {
    let inland = 0
    let wetInland = 0
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x
        if (water[i] > 0.5) continue
        let coast = false
        for (let dy = -5; dy <= 5 && !coast; dy++) {
          for (let dx = -5; dx <= 5; dx++) {
            const nx = x + dx
            const ny = y + dy
            if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue
            if (water[ny * w + nx] > 0.5) coast = true
          }
        }
        if (coast) continue
        inland++
        if (moist[i] > 0.55) wetInland++
      }
    }
    if (inland > 40 && wetInland / inland > 0.72) {
      issues.push({
        id: id(),
        severity: 'major',
        kind: 'climate',
        title: 'No dry heartland',
        critique: 'Deep interior stays as wet as the coasts. Large continents usually dry out inland (continentality) unless monsoons or inland seas intervene.',
        fix: 'Fade greens toward steppe/desert in the continental core.',
        confidence: 0.68,
      })
    }
  }

  // ——— Latitude cue ———
  {
    const band = Math.max(2, (h * 0.14) | 0)
    let topIce = 0
    let botIce = 0
    let topN = 0
    let botN = 0
    for (let y = 0; y < band; y++) {
      for (let x = 0; x < w; x++) {
        topN++
        topIce += ice[y * w + x]
        botN++
        botIce += ice[(h - 1 - y) * w + x]
      }
    }
    const topRatio = topIce / topN
    const botRatio = botIce / botN
    if (mode === 'painted' && topRatio < 0.02 && botRatio < 0.02 && h > 50) {
      issues.push({
        id: id(),
        severity: 'note',
        kind: 'climate',
        title: 'No polar cue',
        critique: 'Neither the top nor bottom edge reads cold/icy. Fine for a regional map — odd if this is a whole planet.',
        fix: 'Add latitude cooling, tundra, or ice caps — or crop to a tropical/temperate band on purpose.',
        confidence: 0.42,
      })
    }
  }

  // ——— Speckled coasts ———
  {
    let speckles = 0
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = y * w + x
        if (water[i] < 0.5) continue
        let landN = 0
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (water[(y + dy) * w + (x + dx)] < 0.5) landN++
          }
        }
        if (landN >= 7) speckles++
      }
    }
    if (speckles > 15) {
      issues.push({
        id: id(),
        severity: 'minor',
        kind: 'visual',
        title: 'Peppered oceans',
        critique: `${speckles} ocean pixels are almost landlocked. Usually noisy color picking, not a real archipelago.`,
        fix: 'Clean the coast mask; keep intentional islands chunky enough to read.',
        confidence: 0.64,
      })
    }
  }

  // ——— Settlement-looking dots far inland on peaks ———
  {
    const dots = findDarkDots(data, w, h, water)
    for (const d of dots.slice(0, 6)) {
      const i = d.y * w + d.x
      if (relief[i] > 0.07 && elev[i] > 0.55) {
        issues.push({
          id: id(),
          severity: 'minor',
          kind: 'settlement',
          title: 'Marker on a peak',
          critique: 'A dark/city-like mark sits on sharp high relief. Capitals usually prefer gentler ground near water.',
          fix: 'Slide markers downhill toward rivers or bays unless it’s a fortress on purpose.',
          at: { x: d.x / w, y: d.y / h },
          confidence: 0.5,
        })
      } else if (water[i] > 0.5) {
        issues.push({
          id: id(),
          severity: 'major',
          kind: 'settlement',
          title: 'Marker in the water',
          critique: 'Something that looks like a city mark is sitting in ocean/lake color.',
          fix: 'Move it to the shoreline.',
          at: { x: d.x / w, y: d.y / h },
          confidence: 0.55,
        })
      }
    }
  }

  if (!issues.length) {
    issues.push({
      id: id(),
      severity: 'note',
      kind: 'visual',
      title: 'No loud mistakes',
      critique: `Against ${mode} image heuristics, nothing screams. That can mean good geography — or a style the detector can’t read.`,
      fix: 'Toggle Painted vs Heightmap if the read feels wrong, or compare against the geography labs.',
      confidence: 0.45,
    })
  }

  issues.sort((a, b) => weight(b) - weight(a))
  return issues
}

function findDarkDots(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  water: Float32Array,
): { x: number; y: number }[] {
  const dots: { x: number; y: number; score: number }[] = []
  for (let y = 3; y < h - 3; y++) {
    for (let x = 3; x < w - 3; x++) {
      const i = y * w + x
      const o = i * 4
      const L = (0.2126 * data[o] + 0.7152 * data[o + 1] + 0.0722 * data[o + 2]) / 255
      if (L > 0.22) continue
      // local contrast: darker than neighborhood
      let mean = 0
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          const j = ((y + dy) * w + (x + dx)) * 4
          mean += (0.2126 * data[j] + 0.7152 * data[j + 1] + 0.0722 * data[j + 2]) / 255
        }
      }
      mean /= 25
      if (mean - L < 0.18) continue
      // compact
      let darkN = 0
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const j = ((y + dy) * w + (x + dx)) * 4
          const l2 = (0.2126 * data[j] + 0.7152 * data[j + 1] + 0.0722 * data[j + 2]) / 255
          if (l2 < 0.28) darkN++
        }
      }
      if (darkN < 3 || darkN > 7) continue
      dots.push({ x, y, score: mean - L + (water[i] > 0.5 ? 0.2 : 0) })
    }
  }
  dots.sort((a, b) => b.score - a.score)
  // non-max suppress
  const out: { x: number; y: number }[] = []
  for (const d of dots) {
    if (out.some((o) => Math.hypot(o.x - d.x, o.y - d.y) < 6)) continue
    out.push({ x: d.x, y: d.y })
    if (out.length >= 10) break
  }
  return out
}

function weight(i: MapIssue) {
  const s = i.severity === 'critical' ? 28 : i.severity === 'major' ? 16 : i.severity === 'minor' ? 7 : 2
  return s * i.confidence
}

function grade(issues: MapIssue[]) {
  const raw = issues.reduce((a, i) => a + weight(i), 0)
  return Math.max(0, Math.min(100, Math.round(100 - raw)))
}

function summarize(score: number, issues: MapIssue[], mode: string) {
  const critical = issues.filter((i) => i.severity === 'critical').length
  const major = issues.filter((i) => i.severity === 'major').length
  if (score >= 80) return `Solid read as a ${mode} map (${score}/100). ${issues.length} notes — mostly polish.`
  if (score >= 55)
    return `Believable with cracks (${score}/100, ${mode}). ${major} major issue${major === 1 ? '' : 's'} to fix.`
  return `Geographically noisy (${score}/100, ${mode}). ${critical} critical, ${major} major — the paint is arguing with physics.`
}

function countAbove(arr: Float32Array, t: number) {
  let n = 0
  for (let i = 0; i < arr.length; i++) if (arr[i] > t) n++
  return n
}

function countLand(water: Float32Array) {
  let n = 0
  for (let i = 0; i < water.length; i++) if (water[i] < 0.5) n++
  return n
}

function rgbToHsv(r: number, g: number, b: number) {
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const d = max - min
  const s = max < 1e-6 ? 0 : d / max
  return { s, v: max }
}

function clamp(v: number, a: number, b: number) {
  return Math.max(a, Math.min(b, v))
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Could not read image'))
    }
    img.src = url
  })
}

/** Procedural broken map — shared with fixture generators. */
export function makeBrokenSampleCanvas(): HTMLCanvasElement {
  return sampleToCanvas(sampleBrokenDesertJungle())
}

export function severityRank(s: Severity) {
  return s === 'critical' ? 3 : s === 'major' ? 2 : s === 'minor' ? 1 : 0
}
