/**
 * Settlement roles — what a town *does*, not just where it sits.
 * Roles score from biome, height, rivers, coast, and climate.
 */
import { evaluateSuitability, RIVER_MAIN_MIN, RIVER_VISIBLE_MIN } from './climate'
import { nextCityName } from './generate'
import type { City, SettlementRole, World } from './types'

export type SettlementPlan = SettlementRole | 'mix'

const idx = (w: number, x: number, y: number) => y * w + x
const wrapX = (x: number, w: number) => ((x % w) + w) % w

export const SETTLEMENT_ROLES: SettlementRole[] = [
  'seat_of_power',
  'farmland',
  'fishing',
  'mining',
  'hunting',
  'trade',
  'pastoral',
]

export const SETTLEMENT_ROLE_LABEL: Record<SettlementRole, string> = {
  seat_of_power: 'Seat of power',
  farmland: 'Farmland',
  fishing: 'Fishing port',
  mining: 'Mine',
  hunting: 'Hunting camp',
  trade: 'Trade town',
  pastoral: 'Pastoral town',
}

export const SETTLEMENT_ROLE_BLURB: Record<SettlementRole, string> = {
  seat_of_power: 'Capital · admin, law, and tribute',
  farmland: 'Agriculture · grain, orchards, and villages',
  fishing: 'Fishing · nets, smokehouses, and harbors',
  mining: 'Mining · ore, stone, and highland works',
  hunting: 'Hunting · furs, game, and forest trade',
  trade: 'Trade · markets, caravans, and river tolls',
  pastoral: 'Pastoral · herds, wool, and open range',
}

const MIX_PLAN: { role: SettlementRole; count: number }[] = [
  { role: 'seat_of_power', count: 1 },
  { role: 'farmland', count: 2 },
  { role: 'fishing', count: 1 },
  { role: 'mining', count: 1 },
  { role: 'pastoral', count: 1 },
]

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

function waterAccess(world: World, x: number, y: number) {
  const { width: w, height: h, elev, seaLevel, flux } = world
  let nearRiver = flux[idx(w, x, y)] > RIVER_VISIBLE_MIN
  let nearCoast = false
  let riverStrength = flux[idx(w, x, y)]
  for (let dy = -4; dy <= 4; dy++) {
    for (let dx = -4; dx <= 4; dx++) {
      const nx = wrapX(x + dx, w)
      const ny = y + dy
      if (ny < 0 || ny >= h) continue
      const ni = idx(w, nx, ny)
      if (flux[ni] > RIVER_MAIN_MIN * 0.5) nearRiver = true
      if (flux[ni] > riverStrength) riverStrength = flux[ni]
      if (elev[ni] < seaLevel) nearCoast = true
    }
  }
  return { nearRiver, nearCoast, riverStrength }
}

/** How well this cell fits a given economic role (0..1). */
export function scoreSettlementRole(world: World, x: number, y: number, role: SettlementRole): number {
  const suit = evaluateSuitability(world, x, y)
  if (suit.tier === 'blocked') return 0

  const { width: w, elev, seaLevel, moist, temp, biome } = world
  const i = idx(w, x, y)
  const e = elev[i]
  const b = biome[i]
  const slope = slopeAt(world, x, y)
  const water = waterAccess(world, x, y)
  const above = Math.max(0, e - seaLevel)
  let score = suit.score * 0.35

  switch (role) {
    case 'seat_of_power':
      score += suit.tier === 'favorable' ? 0.35 : 0.12
      if (water.nearRiver) score += 0.2
      if (water.nearCoast) score += 0.15
      if (above < 0.35 && slope < 0.04) score += 0.12
      if (moist[i] > 0.28 && temp[i] > 0.25) score += 0.08
      break
    case 'farmland':
      if (b === 'grassland' || b === 'savanna' || b.includes('forest')) score += 0.28
      if (moist[i] > 0.32 && moist[i] < 0.72) score += 0.22
      if (slope < 0.04) score += 0.18
      if (temp[i] > 0.3 && temp[i] < 0.8) score += 0.12
      if (water.nearRiver) score += 0.1
      break
    case 'fishing':
      if (water.nearCoast) score += 0.38
      if (water.nearRiver && above < 0.08) score += 0.22
      if (water.riverStrength > RIVER_MAIN_MIN) score += 0.12
      if (b === 'coast') score += 0.15
      break
    case 'mining':
      if (above > 0.28 && above < 0.48) score += 0.3
      if (b === 'alpine' || above > 0.35) score += 0.18
      if (slope > 0.03 && slope < 0.07) score += 0.1
      if (e > 0.62 && e < 0.8) score += 0.15
      break
    case 'hunting':
      if (b === 'taiga' || b === 'tundra' || b.includes('forest')) score += 0.3
      if (temp[i] < 0.45) score += 0.12
      if (moist[i] > 0.25) score += 0.08
      if (above > 0.05 && above < 0.35) score += 0.1
      break
    case 'trade':
      if (water.nearRiver) score += 0.25
      if (water.nearCoast) score += 0.18
      if (slope < 0.05) score += 0.12
      if (moist[i] > 0.22) score += 0.08
      if (suit.tier === 'favorable') score += 0.1
      break
    case 'pastoral':
      if (b === 'savanna' || b === 'grassland') score += 0.32
      if (moist[i] > 0.18 && moist[i] < 0.42) score += 0.18
      if (slope < 0.05 && above < 0.25) score += 0.15
      if (temp[i] > 0.35) score += 0.08
      break
  }

  return Math.max(0, Math.min(1, score))
}

/** Best-fit role at a cell (for Found city and legacy saves). */
export function inferSettlementRole(world: World, x: number, y: number): SettlementRole {
  let best: SettlementRole = 'trade'
  let bestScore = -1
  for (const role of SETTLEMENT_ROLES) {
    const s = scoreSettlementRole(world, x, y, role)
    if (s > bestScore) {
      bestScore = s
      best = role
    }
  }
  return best
}

export function resolveCityRole(city: City, world: World): SettlementRole {
  return city.role ?? inferSettlementRole(world, city.x, city.y)
}

function landCentroid(world: World): { x: number; y: number } | null {
  const { width: w, elev, seaLevel } = world
  let sx = 0
  let sy = 0
  let n = 0
  for (let y = 0; y < world.height; y++) {
    for (let x = 0; x < w; x++) {
      if (elev[idx(w, x, y)] < seaLevel) continue
      sx += x
      sy += y
      n++
    }
  }
  if (!n) return null
  return { x: sx / n, y: sy / n }
}

function scoreSeatOfPower(world: World, x: number, y: number): number {
  let s = scoreSettlementRole(world, x, y, 'seat_of_power')
  const c = landCentroid(world)
  if (c) {
    const d = Math.hypot(x - c.x, y - c.y)
    const span = Math.max(world.width, world.height)
    s += Math.max(0, 0.15 * (1 - d / (span * 0.35)))
  }
  return Math.min(1, s)
}

function roleScorer(role: SettlementRole) {
  return role === 'seat_of_power'
    ? (w: World, x: number, y: number) => scoreSeatOfPower(w, x, y)
    : (w: World, x: number, y: number) => scoreSettlementRole(w, x, y, role)
}

const MIN_ROLE_SCORE = 0.22
const SPACING = 8
/** Hard cap so the atlas stays readable even on High quality grids. */
export const MAX_SETTLEMENTS = 220
const MIN_SPACING = 4
const MAX_SPACING = 18

function collectCandidates(
  world: World,
  role: SettlementRole,
  minScore = MIN_ROLE_SCORE,
  step = 2,
): { x: number; y: number; score: number }[] {
  const { width: w, height: h } = world
  const scoreAt = roleScorer(role)
  const out: { x: number; y: number; score: number }[] = []
  const stride = Math.max(1, step)
  for (let y = 2; y < h - 2; y += stride) {
    for (let x = 2; x < w - 2; x += stride) {
      const score = scoreAt(world, x, y)
      if (score < minScore) continue
      const suit = evaluateSuitability(world, x, y)
      if (suit.tier === 'blocked') continue
      out.push({ x, y, score })
    }
  }
  out.sort((a, b) => b.score - a.score)
  return out
}

function wrapDist(ax: number, ay: number, bx: number, by: number, w: number): number {
  const dx = Math.min(Math.abs(ax - bx), w - Math.abs(ax - bx))
  return Math.hypot(dx, ay - by)
}

function tooClose(cities: City[], x: number, y: number, w: number, spacing = SPACING): boolean {
  return cities.some((c) => wrapDist(c.x, c.y, x, y, w) < spacing)
}

/** Land cells that are not blocked (ocean, cliff, alpine). */
export function countInhabitableCells(world: World): number {
  const { elev, seaLevel, suitability } = world
  let n = 0
  for (let i = 0; i < elev.length; i++) {
    if (elev[i] < seaLevel) continue
    if (suitability[i] <= 0) continue
    n++
  }
  return n
}

function spacingForTarget(inhabitable: number, target: number): number {
  if (target <= 0) return MAX_SPACING
  const raw = 0.9 * Math.sqrt(Math.max(1, inhabitable) / target)
  return Math.max(MIN_SPACING, Math.min(MAX_SPACING, Math.round(raw)))
}

/** How many towns 100% coverage would place on this map. */
export function settlementCapacity(world: World): number {
  const inhabitable = countInhabitableCells(world)
  if (!inhabitable) return 0
  return Math.max(1, Math.min(MAX_SETTLEMENTS, Math.floor(inhabitable / (MIN_SPACING * MIN_SPACING))))
}

/** Towns to place for a 0..1 coverage of inhabitable land. */
export function settlementCountForCoverage(world: World, coverage: number): number {
  const t = Math.max(0, Math.min(1, coverage))
  if (t <= 0) return 0
  return Math.max(1, Math.round(t * settlementCapacity(world)))
}

/** Place settlements for one role. */
export function suggestSettlementsForRole(
  world: World,
  role: SettlementRole,
  count: number,
  spacing = SPACING,
): City[] {
  const step = count > 20 ? 1 : 2
  const candidates = collectCandidates(world, role, MIN_ROLE_SCORE, step)
  const placed: City[] = []
  const scratch = [...world.cities]
  for (const c of candidates) {
    if (placed.length >= count) break
    if (tooClose(scratch, c.x, c.y, world.width, spacing)) continue
    const city: City = {
      x: c.x,
      y: c.y,
      name: nextCityName({ ...world, cities: scratch } as World),
      score: c.score,
      role,
    }
    placed.push(city)
    scratch.push(city)
  }
  return placed
}

/** Recommended mix: capital, farms, ports, mines, and range towns. */
export function suggestSettlementMix(world: World): City[] {
  const placed: City[] = []
  const scratch = [...world.cities]
  for (const { role, count } of MIX_PLAN) {
    const candidates = collectCandidates(world, role)
    let added = 0
    for (const c of candidates) {
      if (added >= count) break
      if (tooClose(scratch, c.x, c.y, world.width)) continue
      const city: City = {
        x: c.x,
        y: c.y,
        name: nextCityName({ ...world, cities: scratch } as World),
        score: c.score,
        role,
      }
      placed.push(city)
      scratch.push(city)
      added++
    }
  }
  return placed
}

function collectInhabitableSites(world: World): { x: number; y: number; score: number }[] {
  const { width: w, height: h, elev, seaLevel, suitability } = world
  const out: { x: number; y: number; score: number }[] = []
  for (let y = 1; y < h - 1; y++) {
    for (let x = 0; x < w; x++) {
      const i = idx(w, x, y)
      if (elev[i] < seaLevel || suitability[i] <= 0) continue
      out.push({ x, y, score: suitability[i] })
    }
  }
  out.sort((a, b) => b.score - a.score)
  return out
}

/**
 * Fill inhabitable land to a coverage fraction (0..1).
 * 1 = maximal: pack as many towns as the map can hold (capped).
 * Roles follow geography; mix always tries to found a capital first.
 */
export function suggestSettlementsCovering(
  world: World,
  plan: SettlementPlan,
  coverage: number,
): City[] {
  const target = settlementCountForCoverage(world, coverage)
  if (target <= 0) return []
  const inhabitable = countInhabitableCells(world)
  const spacing = spacingForTarget(inhabitable, target)
  if (plan !== 'mix') return suggestSettlementsForRole(world, plan, target, spacing)

  const sites = collectInhabitableSites(world)
  const placed: City[] = []
  const scratch = [...world.cities]
  const w = world.width

  const take = (c: { x: number; y: number; score: number }, role: SettlementRole) => {
    const city: City = {
      x: c.x,
      y: c.y,
      name: nextCityName({ ...world, cities: scratch } as World),
      score: c.score,
      role,
    }
    placed.push(city)
    scratch.push(city)
  }

  for (const c of collectCandidates(world, 'seat_of_power', 0.18)) {
    if (tooClose(scratch, c.x, c.y, w, spacing)) continue
    take(c, 'seat_of_power')
    break
  }

  for (const c of sites) {
    if (placed.length >= target) break
    if (tooClose(scratch, c.x, c.y, w, spacing)) continue
    take(c, inferSettlementRole(world, c.x, c.y))
  }
  return placed
}

export function suggestSettlements(world: World, plan: SettlementPlan, count = 5): City[] {
  if (plan === 'mix') return suggestSettlementMix(world)
  return suggestSettlementsForRole(world, plan, count)
}

export function formatSettlementRole(role: SettlementRole): string {
  return SETTLEMENT_ROLE_LABEL[role]
}

export function describeSettlementRole(role: SettlementRole): string {
  return SETTLEMENT_ROLE_BLURB[role]
}
