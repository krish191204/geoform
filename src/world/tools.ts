/**
 * What the paintbrush actually does to height.
 *
 * Every brush walks a circle of cells around the cursor. weight() is "how
 * much this cell is inside the brush" (1 at the center, 0 at the edge),
 * with noise so stamps are not perfect circles.
 *
 * Raise / lower change height. Smooth averages neighbors. Ridge is a thin
 * mountain along the stroke. Channel is ridge but downward (a valley).
 * Sea / land push cells below or above the water line.
 *
 * After a stroke the editor asks climate.ts to rebuild weather. Land-raising
 * brushes also claim plateId under the stroke so Plates view tracks the
 * crust you are sculpting. We still do not reshape whole continents on every
 * dab — Refresh geography does that later.
 */
import { fbm } from './noise'
import { suggestSettlementMix } from './settlements'
import type { City, World } from './types'

const idx = (w: number, x: number, y: number) => y * w + x

/** Copy height so undo can restore it. TypedArrays need a real copy, not a pointer. */
export function cloneElev(elev: Float32Array): Float32Array {
  return new Float32Array(elev)
}

export function cloneCities(cities: City[]): City[] {
  return cities.map((c) => ({ ...c }))
}

export function clonePlateId(plateId: Int16Array): Int16Array {
  return new Int16Array(plateId)
}

/** If the grid grew (zoom-out) but climate arrays are still the old size, make new ones. */
export function ensureDerived(world: World): void {
  const n = world.width * world.height
  if (world.temp.length === n && world.biome.length === n) return
  world.temp = new Float32Array(n)
  world.moist = new Float32Array(n)
  world.flux = new Float32Array(n)
  world.biome = new Array(n)
  world.suitability = new Float32Array(n)
}

/** Soft falloff brush weight in [0,1]. 1 at the cursor, 0 at the edge. Noise makes the circle ragged so stamps are not perfect disks. */
function weight(
  dx: number,
  dy: number,
  radius: number,
  softness: number,
  x = 0,
  y = 0,
  seed = 0,
): number {
  const warp = seed ? (fbm(x / 5.5, y / 5.5, seed, 3) - 0.5) * radius * 0.42 : 0
  const d = Math.hypot(dx, dy) + warp
  if (d > radius) return 0
  const t = 1 - d / radius
  const soft = Math.max(0.15, Math.min(1, softness))
  return Math.pow(t, 1.2 / soft)
}

/** Raise land under the brush. amount can be negative = lower. */
export function brushRaise(
  world: World,
  cx: number,
  cy: number,
  radius: number,
  amount: number,
  softness: number,
): void {
  const { width: w, height: h, elev } = world
  const r = Math.max(1, radius)
  const pad = Math.ceil(r * 0.5)
  for (let y = Math.max(0, cy - r - pad); y <= Math.min(h - 1, cy + r + pad); y++) {
    for (let x = Math.max(0, cx - r - pad); x <= Math.min(w - 1, cx + r + pad); x++) {
      const wt = weight(x - cx, y - cy, r, softness, x, y, world.seed + 3)
      if (!wt) continue
      const i = idx(w, x, y)
      elev[i] = Math.max(0, Math.min(1, elev[i] + amount * wt * wt))
    }
  }
}

/** Blend each cell toward its neighbors. Softens cliffs. */
export function brushSmooth(
  world: World,
  cx: number,
  cy: number,
  radius: number,
  strength: number,
  softness: number,
): void {
  const { width: w, height: h, elev } = world
  const r = Math.max(1, radius)
  const src = cloneElev(elev)
  const pad = Math.ceil(r * 0.5)
  for (let y = Math.max(0, cy - r - pad); y <= Math.min(h - 1, cy + r + pad); y++) {
    for (let x = Math.max(0, cx - r - pad); x <= Math.min(w - 1, cx + r + pad); x++) {
      const wt = weight(x - cx, y - cy, r, softness, x, y, world.seed + 3)
      if (!wt) continue
      let sum = 0
      let n = 0
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx
          const ny = y + dy
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue
          sum += src[idx(w, nx, ny)]
          n++
        }
      }
      const avg = sum / Math.max(1, n)
      const i = idx(w, x, y)
      elev[i] = src[i] + (avg - src[i]) * strength * wt
    }
  }
}

/** Paint an elongated ridge along a stroke direction. */
export function brushRidge(
  world: World,
  cx: number,
  cy: number,
  radius: number,
  amount: number,
  softness: number,
  dirX: number,
  dirY: number,
): void {
  const { width: w, height: h, elev } = world
  const r = Math.max(1, radius)
  let dx = dirX
  let dy = dirY
  const len = Math.hypot(dx, dy) || 1
  dx /= len
  dy /= len
  // perpendicular for thin ridge cross-section
  const px = -dy
  const py = dx
  for (let y = Math.max(0, cy - r * 2); y <= Math.min(h - 1, cy + r * 2); y++) {
    for (let x = Math.max(0, cx - r * 2); x <= Math.min(w - 1, cx + r * 2); x++) {
      const ox = x - cx
      const oy = y - cy
      const along = ox * dx + oy * dy
      const across = ox * px + oy * py
      if (Math.abs(along) > r * 1.6) continue
      const acrossFall = 1 - Math.abs(across) / Math.max(0.8, r * 0.55)
      if (acrossFall <= 0) continue
      const alongFall = 1 - Math.abs(along) / (r * 1.6)
      const wt = Math.pow(acrossFall, 1.4 / Math.max(0.2, softness)) * alongFall
      const i = idx(w, x, y)
      elev[i] = Math.max(0, Math.min(1, elev[i] + amount * wt))
    }
  }
}

/** Carve a valley / river channel. */
export function brushChannel(
  world: World,
  cx: number,
  cy: number,
  radius: number,
  amount: number,
  softness: number,
  dirX: number,
  dirY: number,
): void {
  brushRidge(world, cx, cy, Math.max(1, radius * 0.7), -Math.abs(amount) * 1.15, softness, dirX, dirY)
}

/** Flatten toward local mean (plateau). */
export function brushPlateau(
  world: World,
  cx: number,
  cy: number,
  radius: number,
  strength: number,
  softness: number,
): void {
  const { width: w, height: h, elev } = world
  const r = Math.max(1, radius)
  const pad = Math.ceil(r * 0.5)
  let sum = 0
  let n = 0
  for (let y = Math.max(0, cy - r - pad); y <= Math.min(h - 1, cy + r + pad); y++) {
    for (let x = Math.max(0, cx - r - pad); x <= Math.min(w - 1, cx + r + pad); x++) {
      if (!weight(x - cx, y - cy, r, softness, x, y, world.seed + 3)) continue
      sum += elev[idx(w, x, y)]
      n++
    }
  }
  if (!n) return
  const target = sum / n
  for (let y = Math.max(0, cy - r - pad); y <= Math.min(h - 1, cy + r + pad); y++) {
    for (let x = Math.max(0, cx - r - pad); x <= Math.min(w - 1, cx + r + pad); x++) {
      const wt = weight(x - cx, y - cy, r, softness, x, y, world.seed + 3)
      if (!wt) continue
      const i = idx(w, x, y)
      elev[i] = elev[i] + (target - elev[i]) * strength * wt
    }
  }
}

/** Paint toward ocean (below sea) or land (above sea). */
export function brushSeaLevel(
  world: World,
  cx: number,
  cy: number,
  radius: number,
  toSea: boolean,
  strength: number,
  softness: number,
): void {
  const { width: w, height: h, elev, seaLevel } = world
  const r = Math.max(1, radius)
  const pad = Math.ceil(r * 0.5)
  const target = toSea ? seaLevel - 0.06 : seaLevel + 0.05
  for (let y = Math.max(0, cy - r - pad); y <= Math.min(h - 1, cy + r + pad); y++) {
    for (let x = Math.max(0, cx - r - pad); x <= Math.min(w - 1, cx + r + pad); x++) {
      const wt = weight(x - cx, y - cy, r, softness, x, y, world.seed + 3)
      if (!wt) continue
      const i = idx(w, x, y)
      elev[i] = elev[i] + (target - elev[i]) * strength * wt
      elev[i] = Math.max(0, Math.min(1, elev[i]))
    }
  }
}

const wrapX = (x: number, w: number) => ((x % w) + w) % w

/**
 * Which plate "owns" the crust under the brush: prefer land at the cursor,
 * else the nearest land plate so ocean→land paint extends a real continent.
 */
function claimPlateAt(world: World, cx: number, cy: number): number {
  const { width: w, height: h, elev, seaLevel, plateId } = world
  const x0 = Math.max(0, Math.min(w - 1, cx | 0))
  const y0 = Math.max(0, Math.min(h - 1, cy | 0))
  const i0 = idx(w, x0, y0)
  if (elev[i0] >= seaLevel) return plateId[i0]

  let best = plateId[i0]
  let bestD = Infinity
  const R = 14
  for (let y = Math.max(0, y0 - R); y <= Math.min(h - 1, y0 + R); y++) {
    for (let x = x0 - R; x <= x0 + R; x++) {
      const nx = wrapX(x, w)
      const i = idx(w, nx, y)
      if (elev[i] < seaLevel) continue
      const dx = Math.min(Math.abs(nx - x0), w - Math.abs(nx - x0))
      const dy = y - y0
      const d = dx * dx + dy * dy
      if (d < bestD) {
        bestD = d
        best = plateId[i]
      }
    }
  }
  return best
}

/**
 * After raising / painting land, assign plateId under the brush so Plates
 * view follows the world you are sculpting (not a frozen New-world stamp).
 * Flooded ocean keeps its plate (same crust, now underwater).
 */
export function syncPlatesUnderBrush(
  world: World,
  cx: number,
  cy: number,
  radius: number,
  softness: number,
): void {
  const { width: w, height: h, elev, seaLevel, plateId } = world
  if (!plateId.length) return
  const claim = claimPlateAt(world, cx, cy)
  const r = Math.max(1, radius)
  const pad = Math.ceil(r * 0.5)
  for (let y = Math.max(0, cy - r - pad); y <= Math.min(h - 1, cy + r + pad); y++) {
    for (let x = Math.max(0, cx - r - pad); x <= Math.min(w - 1, cx + r + pad); x++) {
      const wt = weight(x - cx, y - cy, r, softness, x, y, world.seed + 3)
      // Only the solid core of the stroke moves plate ownership.
      if (wt < 0.22) continue
      const i = idx(w, x, y)
      if (elev[i] >= seaLevel) plateId[i] = claim
    }
  }
}

/** @deprecated Use suggestSettlementMix from settlements.ts */
export function suggestCities(world: World, _count: number): City[] {
  return suggestSettlementMix(world)
}

/** Delete the city closest to (x, y) if it is within maxDist cells. */
export function removeNearestCity(world: World, x: number, y: number, maxDist = 5): City | null {
  let best = -1
  let bestD = maxDist
  for (let i = 0; i < world.cities.length; i++) {
    const d = Math.hypot(world.cities[i].x - x, world.cities[i].y - y)
    if (d < bestD) {
      bestD = d
      best = i
    }
  }
  if (best < 0) return null
  return world.cities.splice(best, 1)[0] ?? null
}
