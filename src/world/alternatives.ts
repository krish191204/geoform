/**
 * Science-grounded map patches proposed from Critique issues.
 * Each alternative mutates elevation (or triggers a rebuild), then climate re-derives.
 */
import type { CritiqueResult, MapIssue } from '../critique/types'
import { reshapeLandmasses } from './mass'
import { recomputeDerived } from './climate'
import type { World } from './types'

export type AltKind =
  | 'rebuild_climate'
  | 'open_drainage'
  | 'fix_rain_shadow'
  | 'soften_ice_desert'
  | 'reshape_continents'

export interface Alternative {
  id: string
  title: string
  why: string
  kind: AltKind
  issueIds: string[]
}

const wrapX = (x: number, w: number) => ((x % w) + w) % w
const idx = (w: number, x: number, y: number) => y * w + x

/** Build a short list of distinct fixes from a critique report. */
export function proposeAlternatives(result: CritiqueResult): Alternative[] {
  const alts: Alternative[] = []
  const byKind = new Map<string, MapIssue[]>()
  for (const issue of result.issues) {
    const list = byKind.get(issue.kind) ?? []
    list.push(issue)
    byKind.set(issue.kind, list)
  }

  const hydro = byKind.get('hydro') ?? []
  if (hydro.some((i) => /basin|sink|drain|ridge-crossing/i.test(i.title + i.critique))) {
    alts.push({
      id: 'alt-drain',
      title: 'Open closed basins',
      why: 'Carve downhill outlets so rivers can reach the sea instead of pooling inland.',
      kind: 'open_drainage',
      issueIds: hydro.map((i) => i.id),
    })
  }

  const oro = byKind.get('orography') ?? []
  if (oro.length) {
    alts.push({
      id: 'alt-shadow',
      title: 'Restore rain shadows',
      why: 'Nudge ridge flanks so windward slopes catch moisture and lee sides dry out.',
      kind: 'fix_rain_shadow',
      issueIds: oro.map((i) => i.id),
    })
  }

  const climate = byKind.get('climate') ?? []
  if (climate.some((i) => /ice|desert|dual|wet desert|parched|moisture/i.test(i.title + i.critique))) {
    alts.push({
      id: 'alt-ice-desert',
      title: 'Soften ice↔desert dualism',
      why: 'Ease extreme highs and dry interiors so mid-latitudes are not ice next to barren sand.',
      kind: 'soften_ice_desert',
      issueIds: climate.map((i) => i.id),
    })
  }

  const mass = byKind.get('visual') ?? []
  const tectonic = byKind.get('tectonic') ?? []
  if (
    mass.some((i) => /pimple|island|rect|coast|mass/i.test(i.title + i.critique)) ||
    tectonic.some((i) => /lonely|peak/i.test(i.title + i.critique))
  ) {
    alts.push({
      id: 'alt-mass',
      title: 'Reshape landmasses',
      why: 'Grow coherent continents and drown lonely speckles — Full continents mode.',
      kind: 'reshape_continents',
      issueIds: [...mass, ...tectonic].map((i) => i.id),
    })
  }

  // Always offer a clean climate rebuild from current heights.
  alts.push({
    id: 'alt-rebuild',
    title: 'Rebuild climate from height',
    why: 'Re-run wind, moisture budget, rivers, and biomes from the elevation field you sketched.',
    kind: 'rebuild_climate',
    issueIds: result.issues.slice(0, 6).map((i) => i.id),
  })

  return alts
}

/** Apply one alternative, then refresh derived climate/hydro/biomes. */
export function applyAlternative(world: World, alt: Alternative): void {
  switch (alt.kind) {
    case 'open_drainage':
      // ensureDrainage is inside recomputeDerived; nick a few stubborn pits harder first.
      deepenOutlets(world)
      break
    case 'fix_rain_shadow':
      fixRainShadowFlanks(world)
      break
    case 'soften_ice_desert':
      softenIceDesert(world)
      break
    case 'reshape_continents':
      reshapeLandmasses(world)
      break
    case 'rebuild_climate':
    default:
      break
  }
  recomputeDerived(world, true)
}

function deepenOutlets(world: World): void {
  const { width: w, height: h, elev, seaLevel } = world
  for (let y = 1; y < h - 1; y++) {
    for (let x = 0; x < w; x++) {
      const i = idx(w, x, y)
      if (elev[i] < seaLevel) continue
      let minN = elev[i]
      let minJ = -1
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const) {
        const nx = wrapX(x + dx, w)
        const ny = y + dy
        if (ny < 0 || ny >= h) continue
        const j = idx(w, nx, ny)
        if (elev[j] < minN) {
          minN = elev[j]
          minJ = j
        }
      }
      // Local sink above sea — nick the lowest neighbor toward sea.
      if (minJ >= 0 && minN >= elev[i] - 1e-5 && elev[i] > seaLevel + 0.02) {
        elev[minJ] = Math.max(seaLevel - 0.01, elev[i] - 0.025)
      }
    }
  }
}

/**
 * For mid-latitude ridges, lower lee slightly and raise windward foothills
 * so orographic moisture has a clear climb / shadow.
 */
function fixRainShadowFlanks(world: World): void {
  const { width: w, height: h, elev, seaLevel, latRows, originY } = world
  for (let y = 2; y < h - 2; y++) {
    const lat = Math.max(0, Math.min(1, (y + originY) / Math.max(1, latRows - 1)))
    const pole = Math.abs(lat - 0.5) * 2
    // Mid-lats: westerlies (wind from west). Tropics/polar: easterlies.
    const fromWest = pole >= 0.28 && pole < 0.62
    for (let x = 0; x < w; x++) {
      const i = idx(w, x, y)
      if (elev[i] < seaLevel + 0.2) continue
      const west = elev[idx(w, wrapX(x - 2, w), y)]
      const east = elev[idx(w, wrapX(x + 2, w), y)]
      if (elev[i] < Math.max(west, east) + 0.06) continue
      if (fromWest) {
        // Windward (west) foothill up a touch; lee (east) down.
        const wi = idx(w, wrapX(x - 1, w), y)
        const ei = idx(w, wrapX(x + 1, w), y)
        if (elev[wi] >= seaLevel) elev[wi] = Math.min(0.95, elev[wi] + 0.012)
        if (elev[ei] >= seaLevel) elev[ei] = Math.max(seaLevel + 0.02, elev[ei] - 0.018)
      } else {
        const wi = idx(w, wrapX(x - 1, w), y)
        const ei = idx(w, wrapX(x + 1, w), y)
        if (elev[ei] >= seaLevel) elev[ei] = Math.min(0.95, elev[ei] + 0.012)
        if (elev[wi] >= seaLevel) elev[wi] = Math.max(seaLevel + 0.02, elev[wi] - 0.018)
      }
    }
  }
}

/** Cap alpine spikes and slightly raise mid-continent floors that classify as desert ice neighbors. */
function softenIceDesert(world: World): void {
  const { width: w, height: h, elev, seaLevel, temp, moist, biome } = world
  for (let i = 0; i < elev.length; i++) {
    if (elev[i] < seaLevel) continue
    if (elev[i] > 0.82) elev[i] = 0.82 - (elev[i] - 0.82) * 0.35
  }
  // After a light elev soften we still need climate; also nudge desert cells next to ice.
  for (let y = 1; y < h - 1; y++) {
    for (let x = 0; x < w; x++) {
      const i = idx(w, x, y)
      if (elev[i] < seaLevel) continue
      const b = (biome[i] || '').toLowerCase()
      if (!b.includes('desert') && !b.includes('ice') && b !== 'tundra') continue
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const) {
        const j = idx(w, wrapX(x + dx, w), y + dy)
        if (elev[j] < seaLevel) continue
        const nb = (biome[j] || '').toLowerCase()
        const iceHere = b.includes('ice') || b === 'tundra'
        const desertNb = nb.includes('desert')
        const desertHere = b.includes('desert')
        const iceNb = nb.includes('ice') || nb === 'tundra'
        if ((iceHere && desertNb) || (desertHere && iceNb)) {
          // Pull both toward temperate: lower peak ice, add a hint of moisture budget via elev.
          if (elev[i] > 0.7) elev[i] -= 0.04
          if (elev[j] > 0.7) elev[j] -= 0.04
          if (temp.length === elev.length && temp[i] < 0.25) {
            /* climate rebuild will fix temp */
          }
          if (moist.length === elev.length) {
            /* rebuild fills moist */
          }
        }
      }
    }
  }
}
