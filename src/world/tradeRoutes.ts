/**
 * Maritime trade routes — ocean paths between ports, avoiding dangerous seas.
 */
import { resolveCityRole } from './settlements'
import type { SeaNavClass, TradeRoute, World } from './types'

const idx = (w: number, x: number, y: number) => y * w + x
const wrapX = (x: number, w: number) => ((x % w) + w) % w

const DIRS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
] as const

const PORT_ROLES = new Set(['fishing', 'trade', 'seat_of_power'])
const DIAG_COST = 1.35

/** Latitude 0 = north pole, 0.5 = equator. Same frame as climate.ts. */
function climateLat(world: World, y: number): number {
  const span = Math.max(1, world.latRows - 1)
  return Math.max(0, Math.min(1, (y + world.originY) / span))
}

function distFromEquator(world: World, y: number): number {
  return Math.abs(climateLat(world, y) - 0.5)
}

function iceSea(name: string): boolean {
  const b = name.toLowerCase()
  return b.includes('ice') || b.includes('polar')
}

/** Classify how ships can use an ocean cell. */
export function classifySeaCell(world: World, x: number, y: number): SeaNavClass {
  const { width: w, height: h, elev, seaLevel, biome, temp } = world
  if (y < 0 || y >= h) return 'blocked'
  const i = idx(w, wrapX(x, w), y)
  if (elev[i] >= seaLevel) return 'blocked'
  if (iceSea(biome[i])) return 'blocked'
  const pole = distFromEquator(world, y)
  if (pole > 0.44 && temp[i] < 0.28) return 'blocked'
  if (pole > 0.38 || temp[i] < 0.22) return 'polar'
  const depth = seaLevel - elev[i]
  if (depth < 0.035) return 'coastal'
  for (const [dx, dy] of DIRS) {
    const nx = wrapX(x + dx, w)
    const ny = y + dy
    if (ny < 0 || ny >= h) continue
    if (elev[idx(w, nx, ny)] >= seaLevel) return 'coastal'
  }
  return 'open'
}

function moveCost(cls: SeaNavClass): number {
  if (cls === 'blocked') return Infinity
  if (cls === 'polar') return 9
  if (cls === 'coastal') return 4
  return 1
}

/** Wrap-aware octile distance — admissible for cardinal cost 1, diagonal 1.35. */
function octile(ax: number, ay: number, bx: number, by: number, w: number): number {
  const dx = Math.min(Math.abs(ax - bx), w - Math.abs(ax - bx))
  const dy = Math.abs(ay - by)
  const diag = Math.min(dx, dy)
  return diag * DIAG_COST + (Math.max(dx, dy) - diag)
}

function routeHazard(waypoints: { x: number; y: number }[], world: World): TradeRoute['hazard'] {
  const seen = new Set<SeaNavClass>()
  for (const p of waypoints) {
    seen.add(classifySeaCell(world, p.x, p.y))
  }
  if (seen.has('polar') && seen.has('coastal')) return 'mixed'
  if (seen.has('polar')) return 'polar'
  if (seen.has('coastal')) return 'coastal'
  return 'open'
}

/** Nearest navigable ocean cell for a settlement (harbor mouth). */
export function findPortCell(world: World, cityIndex: number): { x: number; y: number } | null {
  const city = world.cities[cityIndex]
  if (!city) return null
  const { width: w, height: h } = world
  const startX = city.x
  const startY = city.y
  const maxR = Math.max(14, Math.round(Math.min(w, h) * 0.08))
  for (let r = 0; r <= maxR; r++) {
    let ringBest: { x: number; y: number; d: number } | null = null
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue
        const x = wrapX(startX + dx, w)
        const y = startY + dy
        if (y < 0 || y >= h) continue
        const cls = classifySeaCell(world, x, y)
        if (cls === 'blocked') continue
        const d = Math.hypot(dx, dy)
        if (!ringBest || d < ringBest.d || (d === ringBest.d && cls === 'open')) {
          ringBest = { x, y, d }
        }
      }
    }
    if (ringBest) return { x: ringBest.x, y: ringBest.y }
  }
  return null
}

export function isPortCity(world: World, cityIndex: number): boolean {
  const city = world.cities[cityIndex]
  if (!city) return false
  const role = resolveCityRole(city, world)
  if (!PORT_ROLES.has(role)) return false
  return findPortCell(world, cityIndex) !== null
}

function astarRoute(
  world: World,
  from: { x: number; y: number },
  to: { x: number; y: number },
): { x: number; y: number }[] | null {
  const { width: w, height: h } = world
  const start = idx(w, from.x, from.y)
  const goal = idx(w, to.x, to.y)
  if (start === goal) return [from]

  const open: number[] = [start]
  const inOpen = new Uint8Array(w * h)
  inOpen[start] = 1
  const cameFrom = new Int32Array(w * h).fill(-1)
  const gScore = new Float32Array(w * h).fill(Infinity)
  gScore[start] = 0
  const maxSteps = w * h

  for (let steps = 0; steps < maxSteps && open.length; steps++) {
    let bestI = 0
    let bestF = Infinity
    for (let oi = 0; oi < open.length; oi++) {
      const k = open[oi]
      const x = k % w
      const y = (k / w) | 0
      const f = gScore[k] + octile(x, y, to.x, to.y, w)
      if (f < bestF) {
        bestF = f
        bestI = oi
      }
    }
    const current = open[bestI]
    open[bestI] = open[open.length - 1]
    open.pop()
    inOpen[current] = 0
    if (current === goal) {
      const path: { x: number; y: number }[] = []
      let k = current
      while (k >= 0) {
        path.push({ x: k % w, y: (k / w) | 0 })
        k = cameFrom[k]
      }
      path.reverse()
      return path
    }
    const cx = current % w
    const cy = (current / w) | 0
    const gCur = gScore[current]
    for (const [dx, dy] of DIRS) {
      const nx = wrapX(cx + dx, w)
      const ny = cy + dy
      if (ny < 0 || ny >= h) continue
      const step = moveCost(classifySeaCell(world, nx, ny))
      if (!Number.isFinite(step)) continue
      const nk = idx(w, nx, ny)
      const tent = gCur + step * (dx && dy ? DIAG_COST : 1)
      if (tent >= gScore[nk]) continue
      cameFrom[nk] = current
      gScore[nk] = tent
      if (!inOpen[nk]) {
        open.push(nk)
        inOpen[nk] = 1
      }
    }
  }
  return null
}

function wrapDeltaX(dx: number, w: number): number {
  let x = ((dx % w) + w) % w
  if (x > w / 2) x -= w
  return x
}

function simplifyPath(path: { x: number; y: number }[], w: number): { x: number; y: number }[] {
  if (path.length <= 2) return path
  const out: { x: number; y: number }[] = [path[0]]
  for (let i = 1; i < path.length - 1; i++) {
    const a = out[out.length - 1]
    const b = path[i]
    const c = path[i + 1]
    const abx = wrapDeltaX(b.x - a.x, w)
    const bcx = wrapDeltaX(c.x - b.x, w)
    const aby = b.y - a.y
    const bcy = c.y - b.y
    if (abx * bcy !== aby * bcx) out.push(b)
  }
  out.push(path[path.length - 1])
  return out
}

/** Route between two port city indices, or null if unreachable. */
export function routeBetweenPorts(world: World, fromIdx: number, toIdx: number): TradeRoute | null {
  if (fromIdx === toIdx) return null
  const a = findPortCell(world, fromIdx)
  const b = findPortCell(world, toIdx)
  if (!a || !b) return null
  const raw = astarRoute(world, a, b)
  if (!raw || raw.length < 2) return null
  const waypoints = simplifyPath(raw, world.width)
  return {
    id: `route-${fromIdx}-${toIdx}`,
    from: fromIdx,
    to: toIdx,
    waypoints,
    hazard: routeHazard(waypoints, world),
  }
}

/** All coastal ports worth linking (fishing, trade, capitals). */
export function listPortIndices(world: World): number[] {
  const out: number[] = []
  for (let i = 0; i < world.cities.length; i++) {
    if (isPortCity(world, i)) out.push(i)
  }
  return out
}

/** Build trade lanes from the capital to every other port, plus nearest-neighbor links. */
export function suggestTradeRoutes(world: World): TradeRoute[] {
  const ports = listPortIndices(world)
  if (ports.length < 2) return []

  const cache = new Map<string, TradeRoute | null>()
  const pair = (a: number, b: number) => {
    const key = a < b ? `${a}:${b}` : `${b}:${a}`
    if (!cache.has(key)) cache.set(key, routeBetweenPorts(world, a, b))
    return cache.get(key) ?? null
  }

  const routes: TradeRoute[] = []
  const seen = new Set<string>()
  const add = (from: number, to: number) => {
    const key = from < to ? `${from}:${to}` : `${to}:${from}`
    if (seen.has(key)) return
    const route = pair(from, to)
    if (!route) return
    seen.add(key)
    routes.push(route)
  }

  const capital = ports.find((i) => resolveCityRole(world.cities[i], world) === 'seat_of_power')
  if (capital != null) {
    for (const p of ports) {
      if (p !== capital) add(capital, p)
    }
  }

  for (const p of ports) {
    let best: { j: number; len: number } | null = null
    for (const q of ports) {
      if (p === q) continue
      const r = pair(p, q)
      if (!r) continue
      if (!best || r.waypoints.length < best.len) best = { j: q, len: r.waypoints.length }
    }
    if (best) add(p, best.j)
    if (routes.length >= 24) break
  }

  return routes
}

export function recomputeTradeRoutes(world: World): void {
  if (!world.tradeRoutes?.length) return
  const next: TradeRoute[] = []
  for (const r of world.tradeRoutes) {
    if (r.from < 0 || r.to < 0 || r.from >= world.cities.length || r.to >= world.cities.length) continue
    const rebuilt = routeBetweenPorts(world, r.from, r.to)
    if (rebuilt) next.push(rebuilt)
  }
  world.tradeRoutes = next
}

/** After cities move or drop, keep route endpoints pointing at the same towns. */
export function remapTradeRoutes(world: World, previousCities: World['cities']): void {
  if (!world.tradeRoutes?.length) return
  const next: TradeRoute[] = []
  for (const r of world.tradeRoutes) {
    const fromCity = previousCities[r.from]
    const toCity = previousCities[r.to]
    const from = fromCity ? world.cities.indexOf(fromCity) : -1
    const to = toCity ? world.cities.indexOf(toCity) : -1
    if (from < 0 || to < 0 || from === to) continue
    next.push({ ...r, from, to })
  }
  world.tradeRoutes = next
  recomputeTradeRoutes(world)
}

export const SEA_NAV_LABEL: Record<SeaNavClass, string> = {
  open: 'Open ocean',
  coastal: 'Coastal shelf · shallow, reefs',
  polar: 'Polar seas · ice risk',
  blocked: 'Blocked · land or ice',
}

export const ROUTE_HAZARD_LABEL: Record<TradeRoute['hazard'], string> = {
  open: 'Open-water lane',
  coastal: 'Coastal route · stays near shore',
  polar: 'Polar passage · ice risk',
  mixed: 'Mixed · coastal and polar legs',
}
