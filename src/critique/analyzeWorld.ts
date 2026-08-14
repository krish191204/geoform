/**
 * Grade a Geoform save (the JSON from Save). Looks at land shape, climate,
 * rivers, cities. This is the "teacher's red pen." The editor does not use
 * this — it repairs instead of nagging.
 */
import type { CritiqueResult, MapIssue, Severity } from './types'
import { landBboxFill, landmassStats } from '../world/mass'

interface GridWorld {
  width: number
  height: number
  elev: Float32Array | number[]
  temp?: Float32Array | number[]
  moist?: Float32Array | number[]
  flux?: Float32Array | number[]
  biome?: string[]
  cities?: { x: number; y: number; name: string; score?: number }[]
  seaLevel?: number
  seed?: number
  label?: string
}

const DIRS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
] as const

function idx(x: number, y: number, w: number) {
  return y * w + x
}

function severityScore(s: Severity) {
  return s === 'critical' ? 28 : s === 'major' ? 16 : s === 'minor' ? 7 : 2
}

function grade(issues: MapIssue[]) {
  const raw = issues.reduce((a, i) => a + severityScore(i.severity) * i.confidence, 0)
  return Math.max(0, Math.round(100 - raw))
}

export function analyzeGeoformWorld(raw: unknown): CritiqueResult {
  const data = raw as Record<string, unknown>
  if (!data || typeof data !== 'object') throw new Error('Not a JSON object')
  const width = Number(data.width)
  const height = Number(data.height)
  if (!width || !height) throw new Error('Missing width/height — need a Geoform export')
  const elev = toFloat(data.elev, width * height)
  const world: GridWorld = {
    width,
    height,
    elev,
    temp: data.temp ? toFloat(data.temp, width * height) : undefined,
    moist: data.moist ? toFloat(data.moist, width * height) : undefined,
    flux: data.flux ? toFloat(data.flux, width * height) : undefined,
    biome: Array.isArray(data.biome) ? (data.biome as string[]) : undefined,
    cities: Array.isArray(data.cities)
      ? (data.cities as GridWorld['cities'])
      : undefined,
    seaLevel: typeof data.seaLevel === 'number' ? data.seaLevel : 0.22,
    seed: typeof data.seed === 'number' ? data.seed : undefined,
    label: `Geoform world${data.seed != null ? ` · seed ${data.seed}` : ''}`,
  }
  return critiqueGrid(world, 'geoform-json')
}

function toFloat(v: unknown, n: number): Float32Array {
  if (!Array.isArray(v) && !(v instanceof Float32Array)) throw new Error('Grid field missing')
  const arr = Float32Array.from(v as ArrayLike<number>)
  if (arr.length !== n) throw new Error(`Grid size ${arr.length} ≠ ${n}`)
  return arr
}

export function critiqueGrid(world: GridWorld, source: CritiqueResult['source']): CritiqueResult {
  const { width: w, height: h, elev } = world
  const sea = world.seaLevel ?? 0.22
  const issues: MapIssue[] = []
  let id = 0
  const nextId = () => `i${++id}`

  // ——— Hydrology: steepest descent vs flux ———
  if (world.flux) {
    const flux = world.flux
    let climbCount = 0
    let climbX = 0
    let climbY = 0
    let worstClimb = 0
    let sinks = 0
    let maxFlux = 0
    for (let i = 0; i < flux.length; i++) maxFlux = Math.max(maxFlux, flux[i])

    for (let y = 1; y < h - 1; y++) {
      for (let x = 0; x < w; x++) {
        const i = idx(x, y, w)
        if (elev[i] < sea) continue
        if (flux[i] < maxFlux * 0.08) continue
        let best = -1
        let bestE = elev[i]
        for (const [dx, dy] of DIRS) {
          const nx = (x + dx + w) % w
          const ny = y + dy
          if (ny < 0 || ny >= h) continue
          const j = idx(nx, ny, w)
          if (elev[j] < bestE) {
            bestE = elev[j]
            best = j
          }
        }
        if (best < 0) {
          sinks++
          continue
        }
        // if this cell has high flux but is a local sink interior — odd for through-flowing rivers
        const drop = elev[i] - bestE
        if (drop < 1e-5 && flux[i] > maxFlux * 0.15) {
          climbCount++
          if (flux[i] > worstClimb) {
            worstClimb = flux[i]
            climbX = x
            climbY = y
          }
        }
      }
    }

    if (climbCount > w * h * 0.002) {
      issues.push({
        id: nextId(),
        severity: climbCount > w * h * 0.01 ? 'critical' : 'major',
        kind: 'hydro',
        title: 'Rivers stall in basins',
        critique: `Found ${climbCount} high-flow cells that don’t drain downhill. On a real map that usually means painted rivers ignoring topography, or pits with no outlet.`,
        fix: 'Carve outlets, lower the pit floor, or redraw rivers along steepest-descent paths.',
        at: { x: climbX / w, y: climbY / h },
        confidence: 0.85,
        evidence: `Worst local flux ≈ ${worstClimb.toFixed(1)}`,
      })
    }

    // rivers crossing ridges: high flux on local high points
    let ridgeCross = 0
    let rx = 0
    let ry = 0
    for (let y = 2; y < h - 2; y++) {
      for (let x = 2; x < w - 2; x++) {
        const i = idx(x, y, w)
        if (elev[i] < sea || flux[i] < maxFlux * 0.12) continue
        let lower = 0
        for (const [dx, dy] of DIRS) {
          const nx = (x + dx + w) % w
          const ny = y + dy
          if (ny < 0 || ny >= h) continue
          if (elev[idx(nx, ny, w)] < elev[i] - 0.01) lower++
        }
        // peak-like with big river
        if (lower >= 6) {
          ridgeCross++
          rx = x
          ry = y
        }
      }
    }
    if (ridgeCross > 4) {
      issues.push({
        id: nextId(),
        severity: 'major',
        kind: 'hydro',
        title: 'Streams crest ridges',
        critique: `${ridgeCross} strong-flow cells sit on local highs. Water doesn’t climb mountain spines for fun — that’s a classic fantasy-map tell.`,
        fix: 'Move channels to valley floors; use flow accumulation from the DEM.',
        at: { x: rx / w, y: ry / h },
        confidence: 0.8,
      })
    }
  } else {
    issues.push({
      id: nextId(),
      severity: 'note',
      kind: 'hydro',
      title: 'No river / flux layer',
      critique: 'Without flow data I can’t prove drainage mistakes — only elevation and climate heuristics.',
      fix: 'Export a Geoform world (or include a flux grid) for a sharper hydro critique.',
      confidence: 1,
    })
  }

  // ——— Climate: lapse-ish ———
  if (world.temp) {
    const temp = world.temp
    let samples = 0
    let covET = 0
    let meanE = 0
    let meanT = 0
    for (let i = 0; i < elev.length; i++) {
      if (elev[i] < sea) continue
      meanE += elev[i]
      meanT += temp[i]
      samples++
    }
    if (samples > 50) {
      meanE /= samples
      meanT /= samples
      let varE = 0
      for (let i = 0; i < elev.length; i++) {
        if (elev[i] < sea) continue
        const de = elev[i] - meanE
        const dt = temp[i] - meanT
        covET += de * dt
        varE += de * de
      }
      const slope = varE > 1e-8 ? covET / varE : 0
      // expect negative slope (higher = colder). temp often normalized 0..1
      if (slope > 0.15) {
        issues.push({
          id: nextId(),
          severity: 'critical',
          kind: 'climate',
          title: 'Hotter mountains than valleys',
          critique: `Elevation and temperature correlate the wrong way (slope ${slope.toFixed(2)}). Real air cools ~6.5 °C/km — snowcaps shouldn’t be warmer than coasts.`,
          fix: 'Drive temperature from latitude + lapse rate off the DEM, then layer climate noise.',
          confidence: 0.9,
          evidence: `∂T/∂elev ≈ ${slope.toFixed(3)}`,
        })
      } else if (slope > -0.05) {
        issues.push({
          id: nextId(),
          severity: 'minor',
          kind: 'climate',
          title: 'Weak elevation cooling',
          critique: 'Temperature barely drops with height. Tall ranges should read colder even if your art style is soft.',
          fix: 'Apply a clearer lapse term so peaks feel alpine.',
          confidence: 0.7,
          evidence: `∂T/∂elev ≈ ${slope.toFixed(3)}`,
        })
      }
    }
  }

  // ——— Orography / rain shadow (assume prevailing west wind) ———
  if (world.moist) {
    const moist = world.moist
    let violations = 0
    let vx = 0
    let vy = 0
    for (let y = 2; y < h - 2; y += 2) {
      for (let x = 4; x < w - 4; x += 2) {
        const i = idx(x, y, w)
        if (elev[i] < sea + 0.05) continue
        // local ridge if higher than west and east neighbors
        const west = elev[idx(x - 3, y, w)]
        const east = elev[idx(x + 3, y, w)]
        if (elev[i] < west + 0.08 || elev[i] < east + 0.08) continue
        if (elev[i] < sea + 0.25) continue
        const mWest = moist[idx(x - 3, y, w)]
        const mEast = moist[idx(x + 3, y, w)]
        // lee (east) wetter than windward (west) by a lot while ridge is tall
        if (mEast > mWest + 0.18 && elev[i] - Math.min(west, east) > 0.12) {
          violations++
          vx = x
          vy = y
        }
      }
    }
    if (violations > 8) {
      issues.push({
        id: nextId(),
        severity: 'major',
        kind: 'orography',
        title: 'Rain shadow flipped',
        critique: `Assuming west winds, ${violations} ridge samples are wetter on the lee than the windward side. Mountains usually steal rain on the climb.`,
        fix: 'Moisten the upwind flank; dry the downwind rain shadow — or document a different prevailing wind.',
        at: { x: vx / w, y: vy / h },
        confidence: 0.65,
        evidence: 'Heuristic: west → east wind',
      })
    }
  }

  // ——— Settlement ———
  if (world.cities?.length) {
    for (const c of world.cities) {
      const x = Math.round(c.x)
      const y = Math.round(c.y)
      if (x < 1 || y < 1 || x >= w - 1 || y >= h - 1) continue
      const i = idx(x, y, w)
      if (elev[i] < sea) {
        issues.push({
          id: nextId(),
          severity: 'critical',
          kind: 'settlement',
          title: `${c.name || 'City'} is underwater`,
          critique: 'A city marker sits below sea level. Unless it’s Atlantis, that’s a placement bug.',
          fix: 'Move to the nearest coast or raise the land.',
          at: { x: x / w, y: y / h },
          confidence: 0.95,
        })
        continue
      }
      const slope =
        Math.abs(elev[i] - elev[idx(x - 1, y, w)]) +
        Math.abs(elev[i] - elev[idx(x + 1, y, w)]) +
        Math.abs(elev[i] - elev[idx(x, y - 1, w)]) +
        Math.abs(elev[i] - elev[idx(x, y + 1, w)])
      if (slope > 0.35) {
        issues.push({
          id: nextId(),
          severity: 'major',
          kind: 'settlement',
          title: `${c.name || 'City'} on a cliff`,
          critique: 'Slope under this settlement is brutal. People can terrace or fortify, but daily life is harder.',
          fix: 'Slide it downhill toward a river terrace or bay — or keep it as a deliberate high fortress.',
          at: { x: x / w, y: y / h },
          confidence: 0.8,
          evidence: `local slope sum ${slope.toFixed(2)}`,
        })
      }
      if (world.temp && world.temp[i] < 0.12 && elev[i] > 0.7) {
        issues.push({
          id: nextId(),
          severity: 'minor',
          kind: 'settlement',
          title: `${c.name || 'City'} on a frozen summit`,
          critique: 'Cold, high, and harsh — plausible as a fortress or mining hub, weak as a breadbasket capital.',
          fix: 'Keep high sites military or industrial; put farm capitals in milder valleys.',
          at: { x: x / w, y: y / h },
          confidence: 0.7,
        })
      }
      // far from water access
      if (world.flux) {
        let nearWater = elev[i] < sea + 0.04
        for (let dy = -4; dy <= 4 && !nearWater; dy++) {
          for (let dx = -4; dx <= 4; dx++) {
            const nx = x + dx
            const ny = y + dy
            if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue
            const j = idx(nx, ny, w)
            if (elev[j] < sea || world.flux[j] > 40) nearWater = true
          }
        }
        if (!nearWater) {
          issues.push({
            id: nextId(),
            severity: 'minor',
            kind: 'settlement',
            title: `${c.name || 'City'} far from water`,
            critique: 'No coast or strong stream nearby. Towns can still live on wells, trade, or seasonal water — but life is harder.',
            fix: 'Nudge toward a river, lake, or harbor — or invent canals / aquifers on purpose.',
            at: { x: x / w, y: y / h },
            confidence: 0.6,
          })
        }
      }
    }
  }

  // ——— Biome vs moisture quick sanity ———
  if (world.biome && world.moist) {
    let desertWet = 0
    let rainforestDry = 0
    let px = 0
    let py = 0
    for (let i = 0; i < world.biome.length; i++) {
      if (elev[i] < sea) continue
      const b = world.biome[i].toLowerCase()
      const m = world.moist[i]
      if (b.includes('desert') && m > 0.55) {
        desertWet++
        px = i % w
        py = (i / w) | 0
      }
      if (b.includes('rain forest') && m < 0.25) {
        rainforestDry++
        px = i % w
        py = (i / w) | 0
      }
    }
    if (desertWet > w * h * 0.01) {
      issues.push({
        id: nextId(),
        severity: 'major',
        kind: 'climate',
        title: 'Wet deserts',
        critique: `${desertWet} desert-labeled cells are quite moist. Either the biome legend is lying or the moisture field is.`,
        fix: 'Recompute biomes from temp + moisture, or fix the moisture map.',
        at: { x: px / w, y: py / h },
        confidence: 0.75,
      })
    }
    if (rainforestDry > w * h * 0.008) {
      issues.push({
        id: nextId(),
        severity: 'major',
        kind: 'climate',
        title: 'Parched rainforests',
        critique: `${rainforestDry} rain-forest cells look dry. Labels and climate fields disagree.`,
        fix: 'Align Holdridge / biome rules with the moisture grid.',
        at: { x: px / w, y: py / h },
        confidence: 0.75,
      })
    }
  }

  // ——— Plate / tectonic soft note ———
  if (!issues.some((i) => i.kind === 'tectonic')) {
    // mountain belt continuity: high elev should cluster
    let high = 0
    let highIsolated = 0
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = idx(x, y, w)
        if (elev[i] < 0.72) continue
        high++
        let neighbors = 0
        for (const [dx, dy] of DIRS) {
          if (elev[idx(x + dx, y + dy, w)] > 0.65) neighbors++
        }
        if (neighbors <= 1) highIsolated++
      }
    }
    if (high > 30 && highIsolated / high > 0.35) {
      issues.push({
        id: nextId(),
        severity: 'minor',
        kind: 'tectonic',
        title: 'Lonely peaks',
        critique: 'Many high cells are isolated spikes. Real orogens form belts and arcs from plate boundaries — not salt-and-pepper mountains.',
        fix: 'Sculpt continuous ranges along plate sutures; soften lone pinnacles.',
        confidence: 0.55,
        evidence: `${highIsolated}/${high} highs are isolated`,
      })
    }
  }

  const mass = landmassStats({
    width: w,
    height: h,
    elev: elev instanceof Float32Array ? elev : Float32Array.from(elev),
    seaLevel: sea,
  })
  if (mass.landCells > 80 && mass.speckleShare > 0.32) {
    issues.push({
      id: nextId(),
      severity: 'major',
      kind: 'tectonic',
      title: 'Green pimples, not continents',
      critique: `${Math.round(mass.speckleShare * 100)}% of the land is speckle islands. A planet can be an archipelago on purpose — otherwise that is blue ocean with acne, not geography.`,
      fix: 'Use Full continents, paint larger masses, or own the island-world choice.',
      confidence: 0.8,
      evidence: `${mass.components} scraps, largest ${Math.round(mass.largestShare * 100)}% of land`,
    })
  }
  const fill = landBboxFill({
    width: w,
    height: h,
    elev: elev instanceof Float32Array ? elev : Float32Array.from(elev),
    seaLevel: sea,
  })
  if (mass.landCells > 40 && fill > 0.8 && mass.components <= 4) {
    issues.push({
      id: nextId(),
      severity: 'major',
      kind: 'visual',
      title: 'Rectangular coasts',
      critique: `${Math.round(fill * 100)}% of the land’s bounding box is filled. Plates do not stamp a box in the middle of the sea.`,
      fix: 'Break the walls with inlets and capes, or generate a new world.',
      confidence: 0.78,
    })
  }

  if (issues.length === 0) {
    issues.push({
      id: nextId(),
      severity: 'note',
      kind: 'visual',
      title: 'No sharp violations found',
      critique: 'Against these heuristics the map looks coherent. That doesn’t mean it’s Earth-accurate — only that the obvious cartoon mistakes aren’t screaming.',
      fix: 'Try the accuracy roadmap labs next, or upload a second region for comparison.',
      confidence: 0.5,
    })
  }

  issues.sort(
    (a, b) => severityScore(b.severity) * b.confidence - severityScore(a.severity) * a.confidence,
  )

  const score = grade(issues)
  const criticals = issues.filter((i) => i.severity === 'critical').length
  const majors = issues.filter((i) => i.severity === 'major').length
  const summary =
    score >= 80
      ? `Mostly coherent (${score}/100). ${issues.length} notes — polish, don’t panic.`
      : score >= 55
        ? `Believable with cracks (${score}/100). ${majors} major issue${majors === 1 ? '' : 's'} worth fixing.`
        : `Geographically noisy (${score}/100). ${criticals} critical, ${majors} major — the land is arguing with itself.`

  const elevOut = elev instanceof Float32Array ? elev : Float32Array.from(elev)
  const moistOut = world.moist
    ? world.moist instanceof Float32Array
      ? world.moist
      : Float32Array.from(world.moist)
    : undefined
  const water = new Float32Array(w * h)
  for (let i = 0; i < water.length; i++) water[i] = elevOut[i] < sea ? 1 : 0

  return {
    source,
    label: world.label ?? 'Uploaded map',
    width: w,
    height: h,
    score,
    summary,
    issues,
    elev: elevOut,
    moist: moistOut,
    water,
  }
}
