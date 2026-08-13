import type { Biome, SuitabilityResult, World } from './types'

const idx = (w: number, x: number, y: number) => y * w + x

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

function climateLat(world: World, y: number): number {
  const span = Math.max(1, world.latRows - 1)
  return Math.max(0, Math.min(1, (y + world.originY) / span))
}

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

export function recomputeHydrology(world: World): void {
  const { width: w, height: h, elev, seaLevel, flux } = world
  flux.fill(0.01)

  // Multiple passes of flow to lowest neighbor (simple, stable)
  const order: number[] = []
  for (let i = 0; i < w * h; i++) order.push(i)
  order.sort((a, b) => elev[b] - elev[a])

  const dirs = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ]

  for (const i of order) {
    const e = elev[i]
    if (e < seaLevel) continue
    const x = i % w
    const y = (i / w) | 0
    let best = -1
    let bestE = e
    for (const [dx, dy] of dirs) {
      const nx = x + dx
      const ny = y + dy
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue
      const ni = idx(w, nx, ny)
      if (elev[ni] < bestE) {
        bestE = elev[ni]
        best = ni
      }
    }
    if (best >= 0 && elev[best] >= seaLevel) {
      flux[best] += flux[i]
    } else if (best >= 0) {
      // drains to sea — keep flux on last land cell for river mouths
    }
  }
}

export function recomputeBiomes(world: World): void {
  const { width: w, height: h, elev, seaLevel, temp, moist, biome } = world
  for (let i = 0; i < w * h; i++) {
    biome[i] = classifyBiome(elev[i], seaLevel, temp[i], moist[i])
  }
}

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

export function recomputeSuitability(world: World): void {
  const { width: w, height: h, suitability } = world
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      suitability[idx(w, x, y)] = evaluateSuitability(world, x, y).score
    }
  }
}

export function recomputeDerived(world: World, includeSuitability = true): void {
  recomputeClimate(world)
  recomputeHydrology(world)
  recomputeBiomes(world)
  if (includeSuitability) recomputeSuitability(world)
}
