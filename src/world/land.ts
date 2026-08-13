import type { World } from './types'

export const DEFAULT_LAND_RATIO = 0.4
export const MIN_LAND_RATIO = 0.12
export const MAX_LAND_RATIO = 0.72

export function clampLandRatio(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_LAND_RATIO
  return Math.max(MIN_LAND_RATIO, Math.min(MAX_LAND_RATIO, value))
}

export function landFraction(elev: Float32Array, seaLevel: number): number {
  if (!elev.length) return 0
  let n = 0
  for (let i = 0; i < elev.length; i++) if (elev[i] >= seaLevel) n++
  return n / elev.length
}

/** Sea-level threshold so about `landRatio` of cells sit at or above water. */
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

export function applyLandRatio(world: World, landRatio: number): void {
  world.landRatio = clampLandRatio(landRatio)
  world.seaLevel = seaLevelForLandRatio(world.elev, world.landRatio)
  world.rawSeaThreshold = world.seaLevel
  const { width: w, height: h, elev, seaLevel } = world
  world.cities = world.cities.filter((c) => {
    if (c.x < 0 || c.y < 0 || c.x >= w || c.y >= h) return false
    return elev[c.y * w + c.x] >= seaLevel
  })
}
