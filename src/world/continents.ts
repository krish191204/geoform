/**
 * "Add a continent" tool — drop a new landmass into empty ocean.
 *
 * Styles (collision, rift, arcs, …) change *how* the new land meets the old:
 * mountains where coasts face, rifts that pull apart, island arcs, etc.
 * After placing, we run refreshGeography so climate and rivers catch up.
 *
 * This is not the Full continents dropdown. That dropdown is mass.ts.
 * This file is the stamp you click onto the map.
 */
import { chewStraightCoasts } from './coasts'
import { ensurePlateMotion, refreshGeography, sculptInlandUplands, sculptOrogeny } from './geography'
import { fbm } from './noise'
import type { World } from './types'

const idx = (w: number, x: number, y: number) => y * w + x

export type ContinentStyle =
  | 'collision'
  | 'rift'
  | 'arcs'
  | 'drift'
  | 'supercontinent'
  | 'archipelago'

export const CONTINENT_STYLES: { id: ContinentStyle; label: string; desc: string }[] = [
  {
    id: 'collision',
    label: 'Collision ranges',
    desc: 'Facing coasts rise into Himalayan belts',
  },
  {
    id: 'rift',
    label: 'Rifted coasts',
    desc: 'Old land pulls apart — rifts and new seas',
  },
  {
    id: 'arcs',
    label: 'Volcanic arcs',
    desc: 'Trenches and island arcs; volcanic highlands',
  },
  {
    id: 'drift',
    label: 'Open-ocean drift',
    desc: 'New land in empty sea; others keep their shape',
  },
  {
    id: 'supercontinent',
    label: 'Supercontinent',
    desc: 'Landmasses gather; interior collision belts',
  },
  {
    id: 'archipelago',
    label: 'Broken archipelago',
    desc: 'Old continents fragment into island chains',
  },
]

/** Wrap longitude: shortest way around the cylinder. */
function wrapDx(dx: number, w: number): number {
  if (dx > w / 2) dx -= w
  if (dx < -w / 2) dx += w
  return dx
}

/**
 * Distance from each cell to the nearest land. Ocean far from land = high number.
 * Used to drop a new continent in empty sea (drift) or near an existing coast (collision).
 */
function landDistance(world: World): Float32Array {
  const { width: w, height: h, elev, seaLevel } = world
  const dist = new Float32Array(w * h)
  dist.fill(1e9)
  const q: number[] = []
  for (let i = 0; i < w * h; i++) {
    if (elev[i] >= seaLevel) {
      dist[i] = 0
      q.push(i)
    }
  }
  const dirs = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ]
  for (let head = 0; head < q.length; head++) {
    const i = q[head]
    const x = i % w
    const y = (i / w) | 0
    const d = dist[i]
    for (const [dx, dy] of dirs) {
      const nx = (x + dx + w) % w
      const ny = y + dy
      if (ny < 0 || ny >= h) continue
      const ni = idx(w, nx, ny)
      if (dist[ni] > d + 1) {
        dist[ni] = d + 1
        q.push(ni)
      }
    }
  }
  return dist
}

/** Pick an ocean cell for the new continent, depending on style (far out vs near a coast). */
export function findOceanSite(world: World, style: ContinentStyle): { x: number; y: number } | null {
  const { width: w, elev, seaLevel } = world
  const dist = landDistance(world)
  let maxD = 0
  for (let i = 0; i < dist.length; i++) {
    if (elev[i] < seaLevel) maxD = Math.max(maxD, dist[i])
  }
  if (maxD < 8) return null

  const target =
    style === 'drift'
      ? maxD * 0.88
      : style === 'collision' || style === 'supercontinent'
        ? maxD * 0.42
        : style === 'archipelago'
          ? maxD * 0.55
          : maxD * 0.5

  let best = -1
  let bestErr = Infinity
  for (let i = 0; i < dist.length; i++) {
    if (elev[i] >= seaLevel) continue
    const err = Math.abs(dist[i] - target)
    if (err < bestErr) {
      bestErr = err
      best = i
    }
  }
  if (best < 0) return null
  return { x: best % w, y: (best / w) | 0 }
}

function nearestLand(world: World, cx: number, cy: number): { x: number; y: number } | null {
  const { width: w, height: h, elev, seaLevel } = world
  let best = -1
  let bestD = Infinity
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (elev[idx(w, x, y)] < seaLevel) continue
      const dx = wrapDx(x - cx, w)
      const dy = y - cy
      const d = dx * dx + dy * dy
      if (d < bestD) {
        bestD = d
        best = idx(w, x, y)
      }
    }
  }
  if (best < 0) return null
  return { x: best % w, y: (best / w) | 0 }
}

interface PlateStat {
  id: number
  x: number
  y: number
  land: number
  n: number
}

function plateStats(world: World): PlateStat[] {
  const { width: w, height: h, plateId, elev, seaLevel } = world
  const map = new Map<number, PlateStat>()
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = idx(w, x, y)
      const id = plateId[i]
      let s = map.get(id)
      if (!s) {
        s = { id, x: 0, y: 0, land: 0, n: 0 }
        map.set(id, s)
      }
      s.x += x
      s.y += y
      s.n++
      if (elev[i] >= seaLevel) s.land++
    }
  }
  const out: PlateStat[] = []
  for (const s of map.values()) {
    s.x /= s.n
    s.y /= s.n
    out.push(s)
  }
  return out
}

function isCoast(world: World, x: number, y: number): boolean {
  const { width: w, height: h, elev, seaLevel } = world
  const land = elev[idx(w, x, y)] >= seaLevel
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue
      const nx = (x + dx + w) % w
      const ny = y + dy
      if (ny < 0 || ny >= h) continue
      if ((elev[idx(w, nx, ny)] >= seaLevel) !== land) return true
    }
  }
  return false
}

function smoothLocal(world: World, times: number) {
  const { width: w, height: h, elev } = world
  for (let pass = 0; pass < times; pass++) {
    const next = new Float32Array(elev)
    for (let y = 1; y < h - 1; y++) {
      for (let x = 0; x < w; x++) {
        const i = idx(w, x, y)
        const l = elev[idx(w, (x - 1 + w) % w, y)]
        const r = elev[idx(w, (x + 1) % w, y)]
        const u = elev[idx(w, x, y - 1)]
        const d = elev[idx(w, x, y + 1)]
        next[i] = elev[i] * 0.62 + (l + r + u + d) * 0.095
      }
    }
    elev.set(next)
  }
}

/**
 * Stamp a new land blob at (cx, cy) and restyle nearby coasts for this style.
 * Then refresh geography so rivers and climate catch up.
 */
export function addContinent(
  world: World,
  cx: number,
  cy: number,
  style: ContinentStyle,
  radius: number,
): { ok: boolean; message: string } {
  const { width: w, height: h, elev, plateId, seaLevel } = world
  // Continents grow from the sea. Stamping on land stacks nonsense mountains.
  if (cx < 0 || cy < 0 || cx >= w || cy >= h || elev[cy * w + cx] >= seaLevel) {
    return {
      ok: false,
      message: 'Click open ocean — new continents grow from the sea, not on existing land.',
    }
  }
  const r = Math.max(12, Math.min(52, radius))
  let maxId = 0
  for (let i = 0; i < plateId.length; i++) maxId = Math.max(maxId, plateId[i])
  if (maxId >= 36) {
    return { ok: false, message: 'Too many plates — start a new world to keep adding land.' }
  }

  const newId = maxId + 1
  const land = nearestLand(world, cx, cy)
  let ax = 1
  let ay = 0
  if (land) {
    ax = wrapDx(land.x - cx, w)
    ay = land.y - cy
    const len = Math.hypot(ax, ay) || 1
    ax /= len
    ay /= len
  }
  const px = -ay
  const py = ax

  let rx = r
  let ry = r * 0.72
  if (style === 'rift') {
    rx = r * 1.35
    ry = r * 0.48
  } else if (style === 'arcs') {
    rx = r * 1.45
    ry = r * 0.38
  } else if (style === 'supercontinent') {
    rx = r * 1.25
    ry = r * 0.95
  } else if (style === 'archipelago') {
    rx = r * 1.15
    ry = r * 0.7
  } else if (style === 'drift') {
    rx = r * 0.95
    ry = r * 0.82
  }

  const mask = new Uint8Array(w * h)
  let claimed = 0
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = wrapDx(x - cx, w)
      const dy = y - cy
      const wx = dx + (fbm(x / 16, y / 14, world.seed + 11, 4) - 0.5) * r * 1.15
      const wy = dy + (fbm(x / 14, y / 16, world.seed + 29, 4) - 0.5) * r * 0.95
      const along = wx * ax + wy * ay
      const across = wx * px + wy * py
      const e2 = (along / rx) * (along / rx) + (across / ry) * (across / ry)
      const coast = fbm(x / 8, y / 8, world.seed + 63, 4)
      const gulfs = fbm(x / 6, y / 6, world.seed + 81, 3)
      if (e2 > 0.72 + coast * 0.55) continue
      if (e2 > 0.28 && gulfs < 0.32) continue
      if (style === 'archipelago' && coast < 0.48) continue
      if (style === 'arcs' && (e2 < 0.38 || gulfs < 0.3)) continue
      mask[idx(w, x, y)] = 1
      claimed++
    }
  }
  if (claimed < 40) {
    return { ok: false, message: 'Not enough room here — try open ocean or Auto-place.' }
  }

  for (let i = 0; i < mask.length; i++) {
    if (!mask[i]) continue
    plateId[i] = newId
    const x = i % w
    const y = (i / w) | 0
    const n =
      fbm(x / 36, y / 36, world.seed + 4, 4) * 0.55 + fbm(x / 14, y / 14, world.seed + 8, 3) * 0.25
    const t = 1 - Math.min(1, Math.hypot(wrapDx(x - cx, w) / rx, (y - cy) / ry))
    const ragged = (fbm(x / 9, y / 8, world.seed + 14, 4) - 0.5) * 0.08
    let height = seaLevel + 0.05 + n * 0.18 + t * 0.07 + ragged

    if (style === 'collision') height = seaLevel + 0.1 + n * 0.22 + t * 0.14
    if (style === 'rift') height = seaLevel + 0.05 + n * 0.12 + t * 0.04
    if (style === 'arcs') {
      const ridge = Math.pow(Math.max(0, 1 - Math.abs((x * ax + y * ay) % 18) / 9), 1.4)
      height = seaLevel + 0.04 + n * 0.12 + ridge * 0.22
    }
    if (style === 'archipelago') {
      const island = fbm(x / 9, y / 9, world.seed + 71, 3)
      if (island < 0.52) {
        height = seaLevel - 0.08 - n * 0.06
      } else {
        height = seaLevel + 0.05 + (island - 0.52) * 0.35 + n * 0.08
      }
    }
    if (style === 'supercontinent') height = seaLevel + 0.08 + n * 0.2 + t * 0.1
    if (style === 'drift') height = seaLevel + 0.07 + n * 0.16 + t * 0.06

    elev[i] = Math.max(0, Math.min(1, height))
  }

  const stats = plateStats(world)
  const continents = stats.filter((s) => s.id !== newId && s.land / s.n > 0.28)

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = idx(w, x, y)
      if (mask[i]) continue
      const dx = wrapDx(cx - x, w)
      const dy = cy - y
      const dist = Math.hypot(dx, dy)
      const e = elev[i]
      const above = e >= seaLevel
      const coast = isCoast(world, x, y)
      const n = fbm(x / 16, y / 16, world.seed + 90, 3)
      let dlt = 0

      if (style === 'collision' && above) {
        const facing = coast ? 1.15 : 0.35
        const near = Math.exp(-dist / (r * 2.4))
        dlt += near * facing * (0.07 + n * 0.05)
        if (coast && dist < r * 3.2) dlt += 0.06
      } else if (style === 'collision' && !above && dist < r * 2.2) {
        dlt -= 0.04 * Math.exp(-dist / r)
      }

      if (style === 'rift' && above) {
        const across = Math.abs(wrapDx(x - cx, w) * px + (y - cy) * py)
        const riftBand = Math.exp(-((across - r * 0.9) ** 2) / (r * r * 0.35))
        dlt -= riftBand * (0.12 + n * 0.04)
        if (coast) dlt += 0.03
      }

      if (style === 'arcs') {
        const band = Math.abs(dist - r * 1.7)
        if (!above && band < r * 0.45) dlt += (0.16 + n * 0.08) * (1 - band / (r * 0.45))
        if (!above && dist < r * 1.35 && dist > r * 0.7) dlt -= 0.07
        if (above && coast && dist < r * 3) dlt += 0.05 + n * 0.03
      }

      if (style === 'drift' && above && coast) {
        dlt += (n - 0.5) * 0.03
      }

      if (style === 'supercontinent') {
        for (const c of continents) {
          const vx = wrapDx(c.x - x, w)
          const vy = c.y - y
          const toOld = Math.hypot(vx, vy)
          const wx = wrapDx(cx - c.x, w)
          const wy = cy - c.y
          const span = Math.hypot(wx, wy) || 1
          const t = ((wrapDx(x - c.x, w) * wx + (y - c.y) * wy) / (span * span))
          const perp = Math.abs(wrapDx(x - c.x, w) * -wy + (y - c.y) * wx) / span
          if (t > 0.08 && t < 0.92 && perp < r * 0.55) {
            if (!above) dlt += 0.09 * (1 - perp / (r * 0.55))
            else dlt += 0.05
          }
          if (above && toOld < r * 1.2) dlt += 0.04
        }
        if (above && dist < r * 2.8) dlt += 0.06 * Math.exp(-dist / (r * 1.6))
      }

      if (style === 'archipelago') {
        if (above && coast && n > 0.62) dlt -= 0.1 + n * 0.04
        if (!above && n > 0.72 && dist < r * 4) dlt += 0.11
        if (above && n > 0.78 && fbm(x / 7, y / 7, world.seed + 3, 2) > 0.6) dlt -= 0.08
      }

      if (dlt !== 0) {
        elev[i] = Math.max(0, Math.min(1, e + dlt))
      }
    }
  }

  smoothLocal(world, style === 'archipelago' ? 1 : 2)
  chewStraightCoasts(world.elev, w, h, seaLevel, world.seed + 17)

  world.plateCount = newId + 1
  ensurePlateMotion(world)
  sculptOrogeny(world)
  sculptInlandUplands(world)
  world.cities = world.cities.filter((c) => {
    const i = idx(w, c.x, c.y)
    return i >= 0 && i < elev.length && elev[i] >= seaLevel
  })

  refreshGeography(world, { sculpt: false })
  const label = CONTINENT_STYLES.find((s) => s.id === style)?.label ?? style
  return { ok: true, message: `Added ${label.toLowerCase()} — plates and neighboring coasts rewrote.` }
}
