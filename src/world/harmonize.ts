/**
 * Step 3 — Make sense: take the sketched heightfield and push it toward the
 * closest writer-plausible geography. No menus. No accept/reject. Just do it.
 */
import { chewStraightCoasts, meanderCoasts } from './coasts'
import { recomputeDerived } from './climate'
import { sculptInlandUplands, sculptOrogeny } from './geography'
import { reshapeLandmasses } from './mass'
import type { World } from './types'

const wrapX = (x: number, w: number) => ((x % w) + w) % w
const idx = (w: number, x: number, y: number) => y * w + x

/**
 * Mutate `world` in place toward a geographically coherent map that still
 * resembles the sketch (same broad land footprint, nonsense sanded off).
 */
export function harmonizeToGeography(world: World): { applied: string[] } {
  const applied: string[] = []

  world.continentMass = 'continents'
  reshapeLandmasses(world)
  applied.push('Cohered landmasses')

  meanderCoasts(world.elev, world.width, world.height, world.seaLevel, world.seed + 19)
  chewStraightCoasts(world.elev, world.width, world.height, world.seaLevel, world.seed + 21)
  applied.push('Naturalized coasts')

  sculptOrogeny(world)
  sculptInlandUplands(world)
  applied.push('Plate sutures & inland relief')

  openBasins(world)
  fixRainShadowFlanks(world)
  softenIceDesertPeaks(world)
  applied.push('Drainage, rain shadows, climate sanity')

  recomputeDerived(world, true)
  applied.push('Rebuilt climate, rivers, biomes')
  return { applied }
}

function openBasins(world: World): void {
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
        const j = idx(w, wrapX(x + dx, w), y + dy)
        if (elev[j] < minN) {
          minN = elev[j]
          minJ = j
        }
      }
      if (minJ >= 0 && minN >= elev[i] - 1e-5 && elev[i] > seaLevel + 0.02) {
        elev[minJ] = Math.max(seaLevel - 0.01, elev[i] - 0.025)
      }
    }
  }
}

function fixRainShadowFlanks(world: World): void {
  const { width: w, height: h, elev, seaLevel, latRows, originY } = world
  for (let y = 2; y < h - 2; y++) {
    const lat = Math.max(0, Math.min(1, (y + originY) / Math.max(1, latRows - 1)))
    const pole = Math.abs(lat - 0.5) * 2
    const fromWest = pole >= 0.28 && pole < 0.62
    for (let x = 0; x < w; x++) {
      const i = idx(w, x, y)
      if (elev[i] < seaLevel + 0.2) continue
      const west = elev[idx(w, wrapX(x - 2, w), y)]
      const east = elev[idx(w, wrapX(x + 2, w), y)]
      if (elev[i] < Math.max(west, east) + 0.06) continue
      if (fromWest) {
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

function softenIceDesertPeaks(world: World): void {
  const { elev, seaLevel } = world
  for (let i = 0; i < elev.length; i++) {
    if (elev[i] < seaLevel) continue
    if (elev[i] > 0.82) elev[i] = 0.82 - (elev[i] - 0.82) * 0.35
  }
}
