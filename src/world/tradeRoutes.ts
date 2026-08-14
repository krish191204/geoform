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

function latBand(y: number, h: number): number {
  return Math.abs(y / Math.max(h - 1, 1) - 0.5)
}

function biomeBlocked(name: string): boolean {
  const b = name.toLowerCase()
  return b.includes('ice') || b.includes('polar') || b.includes('tundra')
}

/** Classify how ships can use an ocean cell. */
export function classifySeaCell(world: World, x: number, y: number): SeaNavClass {
  const { width: w, height: h, elev, seaLevel, biome, temp } = world
  if (y < 0 || y >= h) return 'blocked'
  const i = idx(w, wrapX(x, w), y)
  if (elev[i] >= seaLevel) return 'blocked'
  if (biomeBlocked(biome[i])) return 'blocked'
  if (latBand(y, h) > 0.44 && temp[i] < 0.28) return 'blocked'
  if (latBand(y, h) > 0.38 || temp[i] < 0.22) return 'polar'
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

function torusDist(ax: number, ay: number, bx: number, by: number, w: number): number {
  const dx = Math.min(Math.abs(ax - bx), w - Math.abs(ax - bx))
  return Math.hypot(dx, ay - by)
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
  const startKey = `${from.x},${from.y}`
  const goalKey = `${to.x},${to.y}`
  if (startKey === goalKey) return [from]

  const open = new Set<string>([startKey])
  const cameFrom = new Map<string, string>()
  const g = new Map<string, number>([[startKey, 0]])

  const parse = (k: string) => {
    const [xs, ys] = k.split(',')
    return { x: Number(xs), y: Number(ys) }
  }

  while (open.size) {
    let current = ''
    let bestF = Infinity
    for (const k of open) {
      const p = parse(k)
      const f = (g.get(k) ?? Infinity) + torusDist(p.x, p.y, to.x, to.y, w)
      if (f < bestF) {
        bestF = f
        current = k
      }
    }
    if (!current) break
    if (current === goalKey) {
      const path: { x: number; y: number }[] = []
      let k: string | undefined = current
      while (k) {
        path.push(parse(k))
        k = cameFrom.get(k)
      }
      path.reverse()
      return path
    }
    open.delete(current)
    const cur = parse(current)
    const gCur = g.get(current) ?? Infinity
    for (const [dx, dy] of DIRS) {
      const nx = wrapX(cur.x + dx, w)
      const ny = cur.y + dy
      if (ny < 0 || ny >= h) continue
      const cls = classifySeaCell(world, nx, ny)
      const step = moveCost(cls)
      if (!Number.isFinite(step)) continue
      const nk = `${nx},${ny}`
      const tent = gCur + step * (dx && dy ? 1.35 : 1)
      if (tent >= (g.get(nk) ?? Infinity)) continue
      cameFrom.set(nk, current)
      g.set(nk, tent)
      open.add(nk)
    }
  }
  return null
}

function simplifyPath(path: { x: number; y: number }[]): { x: number; y: number }[] {
  if (path.length <= 2) return path
  const out: { x: number; y: number }[] = [path[0]]
  for (let i = 1; i < path.length - 1; i++) {
    const a = out[out.length - 1]
    const b = path[i]
    const c = path[i + 1]
    const abx = b.x - a.x
    const aby = b.y - a.y
    const bcx = c.x - b.x
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
  const waypoints = simplifyPath(raw)
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

  const routes: TradeRoute[] = []
  const seen = new Set<string>()
  const add = (from: number, to: number) => {
    const key = from < to ? `${from}:${to}` : `${to}:${from}`
    if (seen.has(key)) return
    const route = routeBetweenPorts(world, from, to)
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

  // Link remaining ports to their nearest reachable neighbor (limited mesh).
  for (const p of ports) {
    let best: { j: number; len: number } | null = null
    for (const q of ports) {
      if (p === q) continue
      const r = routeBetweenPorts(world, p, q)
      if (!r) continue
      const len = r.waypoints.length
      if (!best || len < best.len) best = { j: q, len }
    }
    if (best) add(p, best.j)
    if (routes.length >= 24) break
  }

  return routes
}

export function recomputeTradeRoutes(world: World): void {
  if (!world.tradeRoutes.length) return
  const next: TradeRoute[] = []
  for (const r of world.tradeRoutes) {
    const rebuilt = routeBetweenPorts(world, r.from, r.to)
    if (rebuilt) next.push(rebuilt)
  }
  world.tradeRoutes = next
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
