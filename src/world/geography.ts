/**
 * Quiet repair pipeline — the function that makes the planet "possible".
 *
 * Call harmonizeWorld after generate, load, add-continent, or Refresh.
 * Do NOT call the heavy sculpt on every paint dab or the brush fights you.
 *
 * Order (why it matters):
 *  1. If land/water mix is insane, move the water line.
 *  2. Reshape masses (drown speckles or keep islands).
 *  3. Chew ruler-straight coasts so a painted rectangle stops looking like a stamp.
 *  4. Optional mountain-building at plate edges (only when sculpt: true).
 *  5. Cut river outlets so water reaches the sea.
 *  6. Move cities off the ocean.
 *  7. Rebuild climate / rivers / biomes from the new heights.
 *
 * The UI does not pop errors. It just fixes the map.
 */
import {
  ensureVisibleHydrology,
  recomputeDerived,
  recomputeSuitability,
} from './climate'
import { chewStraightCoasts, meanderCoasts } from './coasts'
import { applyLandRatio, landFraction, MAX_LAND_RATIO, MIN_LAND_RATIO } from './land'
import { clampContinentMass, cohereLand, drownOffshoreSpeckle, fitCoastalLandRatio, landmassStats, massRecipe, reshapeLandmasses } from './mass'
import { createRng, fbm } from './noise'
import type { World } from './types'
import { remapTradeRoutes, recomputeTradeRoutes } from './tradeRoutes'

/** Cell (x, y) → flat array index. Memorize this; every file uses it. */
const idx = (w: number, x: number, y: number) => y * w + x

/** Make sure each plate has a slide direction. Old worlds may be missing this. */
export function ensurePlateMotion(world: World): void {
  const n = Math.max(1, world.plateCount)
  if (world.plateVx.length === n && world.plateVy.length === n) return
  const rng = createRng(world.seed + 91 + n * 17)
  const vx = new Float32Array(n)
  const vy = new Float32Array(n)
  const oldX = world.plateVx
  const oldY = world.plateVy
  for (let p = 0; p < n; p++) {
    if (oldX && p < oldX.length) {
      vx[p] = oldX[p]
      vy[p] = oldY[p]
    } else {
      const ang = rng() * Math.PI * 2
      const speed = 0.18 + rng() * 0.42
      vx[p] = Math.cos(ang) * speed
      vy[p] = Math.sin(ang) * speed
    }
  }
  world.plateVx = vx
  world.plateVy = vy
}

/**
 * Raise mountains and drop rifts where plates currently touch.
 * "Orogeny" = mountain-building. We only run this on New world / Refresh,
 * not on every paint dab — otherwise every brush stroke grows a Himalaya.
 */
export function sculptOrogeny(world: World): void {
  ensurePlateMotion(world)
  const { width: w, height: h, elev, plateId, seaLevel, plateVx, plateVy, seed } = world
  const delta = new Float32Array(w * h)
  const dirs = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ]

  for (let y = 1; y < h - 1; y++) {
    for (let x = 0; x < w; x++) {
      const i = idx(w, x, y)
      const p = plateId[i]
      const land = elev[i] >= seaLevel
      for (const [dx, dy] of dirs) {
        const nx = (x + dx + w) % w
        const ny = y + dy
        const ni = idx(w, nx, ny)
        const q = plateId[ni]
        if (q === p) continue
        const nLand = elev[ni] >= seaLevel
        const len = Math.hypot(dx, dy) || 1
        const relx = plateVx[p] - plateVx[q]
        const rely = plateVy[p] - plateVy[q]
        // approach > 0 means plates are crashing into each other.
        const approach = -(relx * dx + rely * dy) / len
        const n = fbm(x / 10, y / 10, seed + 4, 3)
        if (approach > 0.02 && land && nLand) {
          delta[i] += (0.07 + approach * 0.14) * (0.55 + n * 0.45)
        } else if (approach > 0.02 && land && !nLand) {
          delta[i] += 0.045 * (0.5 + n * 0.5)
        } else if (approach > 0.02 && !land && nLand) {
          delta[i] -= 0.05 + n * 0.02
        } else if (approach < -0.02) {
          delta[i] -= land ? 0.035 : 0.02
        }
      }
    }
  }

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = idx(w, x, y)
      if (elev[i] < seaLevel) {
        elev[i] = Math.max(0, Math.min(1, elev[i] + delta[i] * 0.65))
        continue
      }
      const grain = (fbm(x / 22, y / 18, seed + 12, 4) - 0.5) * 0.06
      elev[i] = Math.max(seaLevel + 0.01, Math.min(1, elev[i] + delta[i] + grain))
    }
  }
}

/**
 * Broad inland uplands / plateaus — Azgaar-style interiors are not featureless
 * coastal shelves. Raise gently where land is away from the shore.
 */
export function sculptInlandUplands(world: World): void {
  const { width: w, height: h, elev, seaLevel, seed } = world
  const n = w * h
  const dist = new Int32Array(n)
  const q = new Int32Array(n)
  dist.fill(-1)
  let qLen = 0
  for (let i = 0; i < n; i++) {
    if (elev[i] < seaLevel) {
      dist[i] = 0
      q[qLen++] = i
    }
  }
  if (!qLen) return
  for (let head = 0; head < qLen; head++) {
    const i = q[head]
    const x = i % w
    const y = (i / w) | 0
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const nx = (x + dx + w) % w
      const ny = y + dy
      if (ny < 0 || ny >= h) continue
      const ni = idx(w, nx, ny)
      if (dist[ni] >= 0) continue
      dist[ni] = dist[i] + 1
      q[qLen++] = ni
    }
  }

  for (let y = 1; y < h - 1; y++) {
    for (let x = 0; x < w; x++) {
      const i = idx(w, x, y)
      if (elev[i] < seaLevel) continue
      const d = dist[i]
      // Mid-interior: gentle plateau; leave coasts and already-high peaks alone.
      if (d < 4 || d > 28) continue
      if (elev[i] > seaLevel + 0.38) continue
      const plateau = fbm(x / 28, y / 24, seed + 61, 3)
      const rim = fbm(x / 11, y / 10, seed + 77, 2)
      if (plateau < 0.42) continue
      const lift =
        0.035 +
        (plateau - 0.42) * 0.12 * Math.min(1, (d - 3) / 10) +
        (rim - 0.5) * 0.025
      elev[i] = Math.max(seaLevel + 0.02, Math.min(0.78, elev[i] + lift))
    }
  }
}

/** Old saves might lack climate arrays. Allocate them to the current grid size. */
function ensureArrays(world: World): void {
  const n = world.width * world.height
  if (world.temp.length !== n) world.temp = new Float32Array(n)
  if (world.moist.length !== n) world.moist = new Float32Array(n)
  if (world.flux.length !== n) world.flux = new Float32Array(n)
  if (world.biome.length !== n) world.biome = new Array(n)
  if (world.suitability.length !== n) world.suitability = new Float32Array(n)
  if (!world.tradeRoutes) world.tradeRoutes = []
}

/**
 * Cities cannot float. If a city sits on ocean (or off the map), scoot it
 * to the nearest land cell. If there is no land, delete it.
 */
function relocateOceanCities(world: World): void {
  const { width: w, height: h, elev, seaLevel } = world
  const previous = world.cities.slice()
  for (const c of world.cities) {
    if (c.x >= 0 && c.y >= 0 && c.x < w && c.y < h && elev[c.y * w + c.x] >= seaLevel) continue
    let bestD = Infinity
    let bx = c.x
    let by = c.y
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (elev[y * w + x] < seaLevel) continue
        const dx = Math.min(Math.abs(x - c.x), w - Math.abs(x - c.x))
        const d = dx * dx + (y - c.y) * (y - c.y)
        if (d < bestD) {
          bestD = d
          bx = x
          by = y
        }
      }
    }
    if (bestD < Infinity) {
      c.x = bx
      c.y = by
    }
  }
  world.cities = world.cities.filter(
    (c) => c.x >= 0 && c.y >= 0 && c.x < w && c.y < h && elev[c.y * w + c.x] >= seaLevel,
  )
  remapTradeRoutes(world, previous)
}

/**
 * Make the planet physically possible: seas, coasts, climate, rivers, plates.
 * Call this instead of leaving broken geography for the user to notice.
 *
 * WorldEngine maps already have plate landmasses — never run Local continent
 * reshape on them or Python mountains / painted ridges get drowned and the
 * atlas looks like it never changed.
 */
export function harmonizeWorld(world: World, opts?: { sculpt?: boolean }): void {
  ensureArrays(world)
  ensurePlateMotion(world)

  if (world.engine === 'worldengine') {
    if (opts?.sculpt) {
      sculptOrogeny(world)
      sculptInlandUplands(world)
    }
    relocateOceanCities(world)
    // Keep Python climate/biomes; always ensure rivers are visible on the atlas.
    ensureVisibleHydrology(world)
    recomputeSuitability(world)
    if (world.tradeRoutes?.length) recomputeTradeRoutes(world)
    return
  }

  const frac = landFraction(world.elev, world.seaLevel)
  if (frac > MAX_LAND_RATIO + 0.04 || frac < MIN_LAND_RATIO - 0.04) {
    applyLandRatio(world, world.landRatio)
  }
  const mass = clampContinentMass(world.continentMass)
  if (mass !== 'islands') reshapeLandmasses(world)
  const recipe = massRecipe(mass)
  for (let pass = 0; pass < 4; pass++) {
    const stats = landmassStats(world)
    let changed = false
    if (stats.axisAlignedCoastShare > 0.28) {
      chewStraightCoasts(world.elev, world.width, world.height, world.seaLevel, world.seed + 21 + pass * 13)
      chewStraightCoasts(world.elev, world.width, world.height, world.seaLevel, world.seed + 37 + pass * 17)
      meanderCoasts(world.elev, world.width, world.height, world.seaLevel, world.seed + 11 + pass * 5)
      if (mass !== 'islands') {
        drownOffshoreSpeckle(world)
        fitCoastalLandRatio(world)
      }
      changed = true
    }
    if (mass !== 'islands' && (stats.speckleShare > 0.08 || stats.components > 10)) {
      cohereLand(world.elev, world.width, world.height, world.seaLevel, recipe.speckleMax, recipe.pondMax)
      drownOffshoreSpeckle(world)
      fitCoastalLandRatio(world)
      changed = true
    }
    if (!changed) break
  }
  if (mass !== 'islands') {
    drownOffshoreSpeckle(world)
    fitCoastalLandRatio(world)
  }
  if (opts?.sculpt) {
    sculptOrogeny(world)
    sculptInlandUplands(world)
  }
  if (mass !== 'islands') {
    drownOffshoreSpeckle(world)
    fitCoastalLandRatio(world)
  }
  relocateOceanCities(world)
  // Drainage runs inside recomputeDerived, after the last land nibble.
  recomputeDerived(world)
  if (world.tradeRoutes?.length) recomputeTradeRoutes(world)
}

/** Same as harmonizeWorld. The button is labeled Refresh geography. */
export function refreshGeography(world: World, opts?: { sculpt?: boolean }): void {
  harmonizeWorld(world, opts)
}
