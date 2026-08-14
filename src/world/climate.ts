/**
 * Weather, rivers, biomes, and "can a city live here?"
 *
 * Height is the cause. These arrays are the effects — except ensureDrainage,
 * which nicks height so closed bowls can reach the sea (rivers need an outlet).
 *
 * Temperature: hot at the equator, cold at the poles, colder up mountains.
 * Rain: west → east wind along each row, wrapping the cylinder so the date
 *   line is not a moisture wall. Ocean loads the air; slopes dump rain
 *   (orography); the far side is a rain shadow.
 * Rivers: every land cell pours into its lowest neighbor (D8). X wraps.
 * Drainage: carve a downhill path toward the sea before we accumulate flux.
 *
 * River draw cutoff lives here so hydrology and the atlas stay in sync
 * (Azgaar-style: continents are never left riverless).
 */
import type { Biome, SuitabilityResult, SuitabilityTier, World } from './types'

/** Score at or above this = favorable (easy default for Suggest cities). */
export const SUITABILITY_FAVORABLE_MIN = 0.52

/** Land cells at or above this flux tint as rivers on the atlas. */
export const RIVER_VISIBLE_MIN = 1.8
/** Stronger trunk / main-stem tint starts here. */
export const RIVER_MAIN_MIN = 5.5

const idx = (w: number, x: number, y: number) => y * w + x

const wrapX = (x: number, w: number) => ((x % w) + w) % w

/** Pick a biome name from height + warmth + wetness. Ocean first, then ice, then plants. */
export function classifyBiome(elev: number, sea: number, temp: number, moist: number): Biome {
  if (elev < sea) return elev > sea - 0.03 ? 'coast' : 'ocean'
  if (elev > 0.78) return 'alpine'
  if (temp < 0.18) return moist > 0.35 ? 'tundra' : 'ice'
  if (temp < 0.35) return moist > 0.4 ? 'taiga' : 'tundra'
  if (moist < 0.22) return 'desert'
  if (moist < 0.38) return temp > 0.55 ? 'savanna' : 'grassland'
  if (moist > 0.72 && temp > 0.55) return 'rainforest'
  if (moist > 0.5) return 'forest'
  return 'grassland'
}

/**
 * Latitude 0 = north pole, 0.5 = equator, 1 = south pole.
 * Uses originY + latRows so zoom-out padding does not move the equator.
 */
function climateLat(world: World, y: number): number {
  const span = Math.max(1, world.latRows - 1)
  return Math.max(0, Math.min(1, (y + world.originY) / span))
}

/** Fill temp[] and moist[] from the heightfield. Call after you change elev. */
export function recomputeClimate(world: World): void {
  const { width: w, height: h, elev, seaLevel, temp, moist } = world

  for (let y = 0; y < h; y++) {
    const lat = climateLat(world, y)
    // Latitude bands: wet tropics/mid, drier horse latitudes, wet temperate, dry poles
    const band =
      0.55 +
      0.35 * Math.cos((lat - 0.5) * Math.PI * 2.2) -
      0.25 * Math.pow(Math.abs(lat - 0.5) * 2, 1.4)

    const latTemp = 1 - Math.pow(Math.abs(lat - 0.5) * 2, 1.15)

    // Temperature does not depend on wind — fill first.
    for (let x = 0; x < w; x++) {
      const i = idx(w, x, y)
      const above = Math.max(0, elev[i] - seaLevel)
      temp[i] = Math.max(0, Math.min(1, latTemp - above * 1.35))
    }

    /**
     * Cylinder-safe moisture: walk the row once to prime airMoisture so the
     * value arriving at x=0 matches what left x=w-1, then walk again to write.
     */
    const stepAir = (air: number, x: number): number => {
      const e = elev[idx(w, x, y)]
      const above = Math.max(0, e - seaLevel)
      if (e < seaLevel) return Math.min(1, air + 0.04)
      const prevE = elev[idx(w, wrapX(x - 1, w), y)]
      const rise = Math.max(0, e - prevE)
      const orographic = rise * 4.5
      return Math.max(0.05, air - orographic * 1.8 - above * 0.08 + (1 - above) * 0.01)
    }

    let airMoisture = band
    for (let x = 0; x < w; x++) airMoisture = stepAir(airMoisture, x)

    for (let x = 0; x < w; x++) {
      const i = idx(w, x, y)
      const e = elev[i]
      const above = Math.max(0, e - seaLevel)

      if (e < seaLevel) {
        moist[i] = 1
        airMoisture = Math.min(1, airMoisture + 0.04)
        continue
      }

      const prevE = elev[idx(w, wrapX(x - 1, w), y)]
      const rise = Math.max(0, e - prevE)
      const orographic = rise * 4.5
      const localPrecip = Math.max(0, airMoisture * 0.55 + orographic - above * 0.15)
      moist[i] = Math.max(0, Math.min(1, localPrecip))

      airMoisture = Math.max(
        0.05,
        airMoisture - orographic * 1.8 - above * 0.08 + (1 - above) * 0.01,
      )
    }
  }
}

/** Cardinal neighbors only (no diagonals). Flood-fill uses this so blobs stay 4-connected. */
const CARDINAL = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const

/** All 8 neighbors. Rivers can flow diagonally too (D8). */
const FLOW_DIRS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
] as const

/**
 * Closed bowls trap rivers. BFS distance-to-sea, then repeatedly nick cells
 * along that path until every land cell has a downhill neighbor (or we give up).
 * Mutates elev. We wrap X. We do not wrap Y.
 * Deeper multi-pass carving (Azgaar/mewo2-style outlets) so flats drain.
 */
export function ensureDrainage(world: World, passes = 10): void {
  const { width: w, height: h, elev, seaLevel } = world
  const n = w * h
  const dist = new Int32Array(n)
  const q = new Int32Array(n)

  for (let pass = 0; pass < passes; pass++) {
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
      for (const [dx, dy] of CARDINAL) {
        const nx = wrapX(x + dx, w)
        const ny = y + dy
        if (ny < 0 || ny >= h) continue
        const ni = idx(w, nx, ny)
        if (dist[ni] >= 0) continue
        dist[ni] = dist[i] + 1
        q[qLen++] = ni
      }
    }

    let carved = 0
    for (let k = qLen - 1; k >= 0; k--) {
      const i = q[k]
      if (dist[i] <= 0) continue
      const x = i % w
      const y = (i / w) | 0
      let hasDown = false
      let next = -1
      let nextDist = dist[i]
      for (const [dx, dy] of CARDINAL) {
        const nx = wrapX(x + dx, w)
        const ny = y + dy
        if (ny < 0 || ny >= h) continue
        const ni = idx(w, nx, ny)
        if (elev[ni] < elev[i] - 1e-6) hasDown = true
        if (dist[ni] >= 0 && dist[ni] < nextDist) {
          nextDist = dist[ni]
          next = ni
        }
      }
      if (hasDown || next < 0) continue
      // Always open a step toward the sea — deeper cuts on later passes for stubborn pits.
      const step = 0.01 + pass * 0.006
      const target = Math.max(seaLevel - 0.02, elev[i] - step)
      if (elev[next] > target) {
        elev[next] = target
        carved++
      }
    }
    if (!carved) break
  }
}

/** Reusable index buffer so hydrology does not allocate a number[n] every paint. */
let hydroOrder: Uint32Array | null = null

/**
 * River map: moisture-weighted runoff pours downhill (D8). X wraps.
 * Call after climate so moist[] feeds precipitation.
 */
export function recomputeHydrology(world: World): void {
  const { width: w, height: h, elev, seaLevel, flux, moist } = world
  const n = w * h

  if (!hydroOrder || hydroOrder.length !== n) hydroOrder = new Uint32Array(n)
  const order = hydroOrder
  for (let i = 0; i < n; i++) {
    order[i] = i
    if (elev[i] < seaLevel) {
      flux[i] = 0
      continue
    }
    // Base trickle + rain — enough that large catchments clear the draw cutoff.
    const rain = moist.length === n ? moist[i] : 0.45
    flux[i] = 0.045 + rain * 0.12
  }
  order.sort((a, b) => elev[b] - elev[a])

  for (let oi = 0; oi < n; oi++) {
    const i = order[oi]
    const e = elev[i]
    if (e < seaLevel) continue
    const x = i % w
    const y = (i / w) | 0
    let best = -1
    let bestE = e
    for (const [dx, dy] of FLOW_DIRS) {
      const nx = wrapX(x + dx, w)
      const ny = y + dy
      if (ny < 0 || ny >= h) continue
      const ni = idx(w, nx, ny)
      if (elev[ni] < bestE) {
        bestE = elev[ni]
        best = ni
      }
    }
    if (best >= 0 && elev[best] >= seaLevel) {
      flux[best] += flux[i]
    }
  }

  ensureRiverPresence(world)
}

/**
 * Big continents must show rivers. If accumulation stayed invisible, scale
 * flux up so the strongest paths clear the atlas tint (never leave barren land).
 */
export function ensureRiverPresence(world: World): void {
  const { elev, seaLevel, flux } = world
  let land = 0
  let maxF = 0
  for (let i = 0; i < elev.length; i++) {
    if (elev[i] < seaLevel) continue
    land++
    if (flux[i] > maxF) maxF = flux[i]
  }
  if (land < 80) return
  if (maxF >= RIVER_VISIBLE_MIN * 1.25) return
  const scale = 14 / Math.max(maxF, 1e-4)
  for (let i = 0; i < flux.length; i++) {
    if (elev[i] >= seaLevel) flux[i] *= scale
  }
}

/**
 * Drainage + rivers without wiping WorldEngine climate/biomes.
 * If moisture was never filled, run a quick climate pass first.
 */
export function ensureVisibleHydrology(world: World): void {
  ensureDrainage(world)
  let moistOk = false
  for (let i = 0; i < world.moist.length; i++) {
    if (world.moist[i] > 0.04) {
      moistOk = true
      break
    }
  }
  if (!moistOk) recomputeClimate(world)
  recomputeHydrology(world)
}

/** Stamp a biome label on every cell. */
export function recomputeBiomes(world: World): void {
  const { width: w, height: h, elev, seaLevel, temp, moist, biome } = world
  for (let i = 0; i < w * h; i++) {
    biome[i] = classifyBiome(elev[i], seaLevel, temp[i], moist[i])
  }
}

/** How steep is this cell vs its neighbors. Steep = bad for a city. X wraps. */
function slopeAt(world: World, x: number, y: number): number {
  const { width: w, height: h, elev } = world
  const e = elev[idx(w, x, y)]
  let maxD = 0
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue
      const nx = wrapX(x + dx, w)
      const ny = y + dy
      if (ny < 0 || ny >= h) continue
      maxD = Math.max(maxD, Math.abs(elev[idx(w, nx, ny)] - e))
    }
  }
  return maxD
}

/**
 * Can people live here at all, and how hard is daily life?
 *
 * blocked   — ocean, alpine peak, or cliff (cannot build).
 * marginal  — harsh but plausible (oasis, highland mine, remote trade post).
 * favorable — river valleys, coasts, fertile plains (easy default for Suggest).
 */
export function evaluateSuitability(world: World, x: number, y: number): SuitabilityResult {
  const { width: w, elev, seaLevel, moist, flux, biome, temp, height: h } = world
  const i = idx(w, x, y)
  const strengths: string[] = []
  const challenges: string[] = []
  let score = 0.5

  const blocked = (reasons: string[]): SuitabilityResult => ({
    score: 0,
    ok: false,
    tier: 'blocked',
    reasons,
  })

  if (elev[i] < seaLevel) {
    return blocked(['Open ocean — no solid ground'])
  }

  if (elev[i] > 0.82) {
    return blocked(['Alpine peak — too steep and cold to build on'])
  }

  const slope = slopeAt(world, x, y)
  if (slope > 0.08) {
    return blocked(['Cliff face — too steep to build on'])
  }

  if (elev[i] > 0.72) {
    challenges.push('Highlands — mining, fortress, or pass town')
    score -= 0.22
  } else if (elev[i] > 0.62) {
    challenges.push('Upland — cooler; terrace farming or trade post')
    score -= 0.1
  }

  if (slope > 0.05) {
    challenges.push('Slopes — terrace or careful building')
    score -= 0.1
  } else if (slope < 0.03) {
    strengths.push('Gentle ground')
    score += 0.08
  }

  if (moist[i] < 0.18) {
    challenges.push('Deep desert — oasis, caravan stop, or dry wells')
    score -= 0.28
  } else if (moist[i] < 0.28) {
    challenges.push('Arid — dry-farming or spring town')
    score -= 0.1
  } else if (moist[i] > 0.45) {
    strengths.push('Reliable rainfall')
    score += 0.1
  }

  if (temp[i] < 0.2) {
    challenges.push('Cold — fishing, fur trade, or sheltered valley')
    score -= 0.18
  } else if (temp[i] > 0.35 && temp[i] < 0.75) {
    strengths.push('Mild climate')
    score += 0.12
  }

  // Fresh water access — wrap longitude so coasts across the date line count.
  let nearRiver = flux[i] > RIVER_VISIBLE_MIN * 0.9
  let nearCoast = false
  for (let dy = -3; dy <= 3; dy++) {
    for (let dx = -3; dx <= 3; dx++) {
      const nx = wrapX(x + dx, w)
      const ny = y + dy
      if (ny < 0 || ny >= h) continue
      const ni = idx(w, nx, ny)
      if (flux[ni] > RIVER_MAIN_MIN * 0.55) nearRiver = true
      if (elev[ni] < seaLevel) nearCoast = true
    }
  }

  if (nearRiver) {
    strengths.push('River or stream access')
    score += 0.22
  } else if (nearCoast) {
    strengths.push('Coast or harbor access')
    score += 0.14
  } else if (moist[i] >= 0.22) {
    challenges.push('Remote — rain or wells must suffice')
    score -= 0.08
  } else {
    challenges.push('Far from rivers and coast')
    score -= 0.14
  }

  const b = biome[i]
  if (b === 'desert' || b.includes('desert')) {
    if (!challenges.some((r) => r.toLowerCase().includes('desert') || r.toLowerCase().includes('arid'))) {
      challenges.push('Desert biome — water takes work')
    }
    score -= 0.06
  }
  if (b === 'ice' || b.includes('ice') || b === 'alpine') {
    if (!challenges.some((r) => r.toLowerCase().includes('cold') || r.toLowerCase().includes('highland'))) {
      challenges.push(`Biome (${b}) — harsh living`)
    }
    score -= 0.06
  }
  if (b.includes('forest') || b === 'grassland' || b === 'savanna') {
    strengths.push('Farmland or forage nearby')
    score += 0.08
  } else if (b === 'taiga') {
    challenges.push('Taiga — timber and trade, short growing season')
    score -= 0.04
  }

  score = Math.max(0, Math.min(1, score))
  const tier: SuitabilityTier = score >= SUITABILITY_FAVORABLE_MIN ? 'favorable' : 'marginal'
  const reasons =
    tier === 'favorable'
      ? strengths.length
        ? strengths
        : ['Favorable site']
      : challenges.length
        ? challenges
        : ['Harsh but plausible']

  return { score, ok: true, tier, reasons }
}

/** Fill suitability[] for the whole map (the "where cities want to be" layer). */
export function recomputeSuitability(world: World): void {
  const { width: w, height: h, suitability } = world
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      suitability[idx(w, x, y)] = evaluateSuitability(world, x, y).score
    }
  }
}

/**
 * Rebuild everything that is *not* the intended height sculpt:
 * drainage nicks → climate → rivers → biomes → cities-layer.
 * After a brush stroke we often skip suitability until the stroke ends.
 */
export function recomputeDerived(world: World, includeSuitability = true): void {
  ensureDrainage(world)
  recomputeClimate(world)
  recomputeHydrology(world)
  recomputeBiomes(world)
  if (includeSuitability) recomputeSuitability(world)
}
