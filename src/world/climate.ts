/**
 * Weather, rivers, biomes, and "can a city live here?"
 *
 * Nothing in this file invents land. It only *reads* height + sea level and
 * writes temp, rain, river flux, biome labels, and suitability.
 *
 * Temperature: hot at the equator, cold at the poles, colder up mountains
 *   (lapse rate — air cools as it rises).
 * Rain: pretend wind blows west → east along each row. Ocean loads the air
 *   with moisture. When air hits a slope (orography) it dumps rain, then
 *   the far side is a desert (rain shadow).
 * Rivers: every land cell pours into its lowest neighbor. Flux is "how many
 *   upstream cells dumped on me." We wrap X so a river can cross the date line.
 * Drainage: if a cell has no downhill path to the sea, we cut a tiny canyon
 *   toward the ocean so rivers never sit in a closed bowl.
 */
import type { Biome, SuitabilityResult, World } from './types'

const idx = (w: number, x: number, y: number) => y * w + x

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

    // West → east prevailing winds; moisture depletes over orography
    let airMoisture = band

    for (let x = 0; x < w; x++) {
      const i = idx(w, x, y)
      const e = elev[i]
      const above = Math.max(0, e - seaLevel)

      // Temperature: equator-hot, poles-cold, lapse rate with elevation
      const latTemp = 1 - Math.pow(Math.abs(lat - 0.5) * 2, 1.15)
      temp[i] = Math.max(0, Math.min(1, latTemp - above * 1.35))

      if (e < seaLevel) {
        moist[i] = 1
        airMoisture = Math.min(1, airMoisture + 0.04)
        continue
      }

      const prevE = x > 0 ? elev[idx(w, x - 1, y)] : e
      const rise = Math.max(0, e - prevE)
      // Orographic lift dumps rain on windward slopes
      const orographic = rise * 4.5
      const localPrecip = Math.max(0, airMoisture * 0.55 + orographic - above * 0.15)
      moist[i] = Math.max(0, Math.min(1, localPrecip))

      // Air dries after dropping rain, especially over high terrain
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
 * Closed bowls trap rivers. Walk from the ocean inland (distance-to-sea),
 * then from the far cells back: if a cell has no downhill neighbor, nick the
 * next cell toward the sea so water can escape. We wrap X. We do not wrap Y.
 */
export function ensureDrainage(world: World): void {
  const { width: w, height: h, elev, seaLevel } = world
  const dist = new Int32Array(w * h)
  dist.fill(-1)
  const q: number[] = []
  for (let i = 0; i < w * h; i++) {
    if (elev[i] < seaLevel) {
      dist[i] = 0
      q.push(i)
    }
  }
  if (!q.length) return
  for (let head = 0; head < q.length; head++) {
    const i = q[head]
    const x = i % w
    const y = (i / w) | 0
    for (const [dx, dy] of CARDINAL) {
      const nx = (x + dx + w) % w
      const ny = y + dy
      if (ny < 0 || ny >= h) continue
      const ni = idx(w, nx, ny)
      if (dist[ni] >= 0) continue
      dist[ni] = dist[i] + 1
      q.push(ni)
    }
  }

  for (let k = q.length - 1; k >= 0; k--) {
    const i = q[k]
    if (dist[i] <= 0) continue
    const x = i % w
    const y = (i / w) | 0
    let hasDown = false
    let next = -1
    let nextDist = dist[i]
    for (const [dx, dy] of CARDINAL) {
      const nx = (x + dx + w) % w
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
    if (elev[next] >= elev[i] && elev[next] >= seaLevel) {
      // Lower the downhill cell just enough that water can leave. Stay near sea if we hit the coast.
      elev[next] = Math.max(seaLevel - 0.02, elev[i] - 0.004)
    }
  }
}

/**
 * River map: start every land cell with a trickle, then pour downhill from
 * the highest cells so tributaries add up. Ocean cells are skipped.
 * X wraps (cylinder). Y does not (poles).
 */
export function recomputeHydrology(world: World): void {
  const { width: w, height: h, elev, seaLevel, flux } = world
  flux.fill(0.01)

  const order: number[] = []
  for (let i = 0; i < w * h; i++) order.push(i)
  order.sort((a, b) => elev[b] - elev[a])

  for (const i of order) {
    const e = elev[i]
    if (e < seaLevel) continue
    const x = i % w
    const y = (i / w) | 0
    let best = -1
    let bestE = e
    for (const [dx, dy] of FLOW_DIRS) {
      const nx = (x + dx + w) % w
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
}

/** Stamp a biome label on every cell. */
export function recomputeBiomes(world: World): void {
  const { width: w, height: h, elev, seaLevel, temp, moist, biome } = world
  for (let i = 0; i < w * h; i++) {
    biome[i] = classifyBiome(elev[i], seaLevel, temp[i], moist[i])
  }
}

/** How steep is this cell vs its neighbors. Steep = bad for a city. */
function slopeAt(world: World, x: number, y: number): number {
  const { width: w, height: h, elev } = world
  const e = elev[idx(w, x, y)]
  let maxD = 0
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue
      const nx = x + dx
      const ny = y + dy
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue
      maxD = Math.max(maxD, Math.abs(elev[idx(w, nx, ny)] - e))
    }
  }
  return maxD
}

/**
 * Can people farm and drink here? Ocean = no. Peak = no. Desert / ice = bad.
 * Near a river or coast = good. This is why cities refuse to sit on water.
 */
export function evaluateSuitability(world: World, x: number, y: number): SuitabilityResult {
  const { width: w, elev, seaLevel, moist, flux, biome, temp } = world
  const i = idx(w, x, y)
  const reasons: string[] = []
  let score = 0.5

  if (elev[i] < seaLevel) {
    return { score: 0, ok: false, reasons: ['Open ocean — no solid ground'] }
  }

  if (elev[i] > 0.82) {
    reasons.push('High alpine peak — too steep and cold')
    score -= 0.55
  } else if (elev[i] > 0.72) {
    reasons.push('Highlands — harsh for a major city')
    score -= 0.25
  }

  const slope = slopeAt(world, x, y)
  if (slope > 0.08) {
    reasons.push('Terrain too steep to settle')
    score -= 0.35
  } else if (slope < 0.03) {
    score += 0.08
  }

  if (moist[i] < 0.18) {
    reasons.push('Deep rain-shadow desert — scarce water')
    score -= 0.4
  } else if (moist[i] < 0.28) {
    reasons.push('Arid climate')
    score -= 0.15
  } else if (moist[i] > 0.45) {
    score += 0.1
  }

  if (temp[i] < 0.2) {
    reasons.push('Polar cold')
    score -= 0.3
  } else if (temp[i] > 0.35 && temp[i] < 0.75) {
    score += 0.12
  }

  // Fresh water access
  let nearRiver = flux[i] > 2.5
  let nearCoast = false
  for (let dy = -3; dy <= 3 && !nearCoast; dy++) {
    for (let dx = -3; dx <= 3; dx++) {
      const nx = x + dx
      const ny = y + dy
      if (nx < 0 || ny < 0 || nx >= w || ny >= world.height) continue
      const ni = idx(w, nx, ny)
      if (flux[ni] > 3.2) nearRiver = true
      if (elev[ni] < seaLevel) nearCoast = true
    }
  }

  if (nearRiver) {
    score += 0.22
  } else if (nearCoast) {
    score += 0.14
  } else {
    reasons.push('Far from rivers and coast')
    score -= 0.2
  }

  const b = biome[i]
  if (
    b === 'desert' ||
    b === 'ice' ||
    b === 'alpine' ||
    b.includes('desert') ||
    b === 'ocean' ||
    b.includes('ice')
  ) {
    if (
      !reasons.some(
        (r) =>
          r.toLowerCase().includes('desert') ||
          r.toLowerCase().includes('alpine') ||
          r.toLowerCase().includes('polar') ||
          r.toLowerCase().includes('ocean'),
      )
    ) {
      reasons.push(`Biome (${b}) is hostile to settlement`)
    }
    score -= 0.15
  }
  if (
    b.includes('forest') ||
    b.includes('steppe') ||
    b === 'grassland' ||
    b === 'savanna' ||
    b.includes('woodland')
  ) {
    score += 0.1
  }

  score = Math.max(0, Math.min(1, score))
  const ok = score >= 0.42 && elev[i] < 0.82 && elev[i] >= seaLevel && slope <= 0.09

  if (ok && reasons.length === 0) reasons.push('Favorable site')
  if (!ok && reasons.length === 0) reasons.push('Site score too low for a lasting city')

  return { score, ok, reasons }
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
 * Rebuild everything that is *not* height: climate, rivers, biomes, cities-layer.
 * Height is the cause. These arrays are the effects. After a brush stroke we
 * often skip suitability until the stroke ends (it is slower).
 */
export function recomputeDerived(world: World, includeSuitability = true): void {
  recomputeClimate(world)
  recomputeHydrology(world)
  recomputeBiomes(world)
  if (includeSuitability) recomputeSuitability(world)
}
