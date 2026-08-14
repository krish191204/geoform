/**
 * Land vs water helpers.
 *
 * Rule of thumb: a cell is land if elev[i] >= seaLevel, else ocean.
 * landRatio is the *wish* ("about 40% land"). landFraction is the *truth*
 * (count the cells).
 *
 * We only slam the water line with applyLandRatio when the mix is ridiculous
 * (almost no land, or almost no ocean). Everyday painting is left alone so
 * you do not fight the engine. Growing/shrinking coasts lives in mass.ts.
 */
import { fbm } from './noise'
import { remapTradeRoutes } from './tradeRoutes'
import type { World } from './types'

/** Default Land % slider: 40% of cells should be above water. */
export const DEFAULT_LAND_RATIO = 0.4
/** Slider floor. Wetter than this and continents turn into specks. */
export const MIN_LAND_RATIO = 0.12
/** Slider ceiling. Drier than this and there is no real ocean. */
export const MAX_LAND_RATIO = 0.72

/** Keep the slider in a sane band. Garbage in → 40%. */
export function clampLandRatio(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_LAND_RATIO
  return Math.max(MIN_LAND_RATIO, Math.min(MAX_LAND_RATIO, value))
}

/** Actual share of cells that are land right now (0..1). */
export function landFraction(elev: Float32Array, seaLevel: number): number {
  if (!elev.length) return 0
  let n = 0
  for (let i = 0; i < elev.length; i++) if (elev[i] >= seaLevel) n++
  return n / elev.length
}

/**
 * Pick a sea-level number so that about `landRatio` of cells sit at or above it.
 *
 * Trick: sort all heights. If you want 40% land, the water line is the height
 * of the cell 60% of the way up that sorted list. Everything shorter is ocean.
 */
export function seaLevelForLandRatio(elev: Float32Array, landRatio: number): number {
  const t = clampLandRatio(landRatio)
  const n = elev.length
  if (!n) return 0.44
  const targetLand = Math.max(1, Math.min(n - 1, Math.round(t * n)))
  const sorted = Float32Array.from(elev)
  sorted.sort()
  const waterCount = n - targetLand
  return sorted[Math.max(0, Math.min(n - 1, waterCount))]
}

/**
 * Move the water line to match the Land % slider.
 * If the heightfield is a pancake (all the same height), sorting cannot make
 * ocean — we dent some basins first so water has somewhere to sit.
 * Cities that end up underwater get deleted.
 */
export function applyLandRatio(world: World, landRatio: number): void {
  world.landRatio = clampLandRatio(landRatio)
  world.seaLevel = seaLevelForLandRatio(world.elev, world.landRatio)
  let frac = landFraction(world.elev, world.seaLevel)
  if (frac > MAX_LAND_RATIO + 0.04 || frac < MIN_LAND_RATIO - 0.04) {
    carveBasins(world)
    world.seaLevel = seaLevelForLandRatio(world.elev, world.landRatio)
    frac = landFraction(world.elev, world.seaLevel)
  }
  world.rawSeaThreshold = world.seaLevel
  const { width: w, height: h, elev, seaLevel } = world
  const previous = world.cities.slice()
  world.cities = world.cities.filter((c) => {
    if (c.x < 0 || c.y < 0 || c.x >= w || c.y >= h) return false
    return elev[c.y * w + c.x] >= seaLevel
  })
  remapTradeRoutes(world, previous)
}

/**
 * Dent low spots so a flat "all land" map can actually have oceans.
 * Poles get extra cut (Earth has polar ocean). Random basins add gulfs.
 */
function carveBasins(world: World): void {
  const { width: w, height: h, elev, seed } = world
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x
      const ny = h <= 1 ? 0.5 : y / (h - 1)
      const polar = Math.max(0, Math.abs(ny - 0.5) * 2 - 0.52)
      const n = fbm(x / 22, y / 16, seed + 71, 4)
      const basin = fbm(x / 11, y / 9, seed + 88, 3)
      let cut = polar * 0.55
      if (basin < 0.28) cut += (0.28 - basin) * 0.45
      cut += Math.max(0, 0.38 - n) * 0.2
      if (cut <= 0) continue
      elev[i] = Math.max(0, elev[i] * (1 - cut) - cut * 0.08)
    }
  }
}
