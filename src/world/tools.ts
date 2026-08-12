import { evaluateSuitability } from './climate'
import { nextCityName } from './generate'
import type { City, World } from './types'

const idx = (w: number, x: number, y: number) => y * w + x

export function cloneElev(elev: Float32Array): Float32Array {
  return new Float32Array(elev)
}

export function cloneCities(cities: City[]): City[] {
  return cities.map((c) => ({ ...c }))
}

/** Soft falloff brush weight in [0,1]. */
function weight(dx: number, dy: number, radius: number, softness: number): number {
  const d = Math.hypot(dx, dy)
  if (d > radius) return 0
  const t = 1 - d / radius
  const soft = Math.max(0.15, Math.min(1, softness))
  return Math.pow(t, 1.2 / soft)
}

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
  for (let y = Math.max(0, cy - r); y <= Math.min(h - 1, cy + r); y++) {
    for (let x = Math.max(0, cx - r); x <= Math.min(w - 1, cx + r); x++) {
      const wt = weight(x - cx, y - cy, r, softness)
      if (!wt) continue
      const i = idx(w, x, y)
      elev[i] = Math.max(0, Math.min(1, elev[i] + amount * wt * wt))
    }
  }
}

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
  for (let y = Math.max(0, cy - r); y <= Math.min(h - 1, cy + r); y++) {
    for (let x = Math.max(0, cx - r); x <= Math.min(w - 1, cx + r); x++) {
      const wt = weight(x - cx, y - cy, r, softness)
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
  let sum = 0
  let n = 0
  for (let y = Math.max(0, cy - r); y <= Math.min(h - 1, cy + r); y++) {
    for (let x = Math.max(0, cx - r); x <= Math.min(w - 1, cx + r); x++) {
      if (!weight(x - cx, y - cy, r, softness)) continue
      sum += elev[idx(w, x, y)]
      n++
    }
  }
  if (!n) return
  const target = sum / n
  for (let y = Math.max(0, cy - r); y <= Math.min(h - 1, cy + r); y++) {
    for (let x = Math.max(0, cx - r); x <= Math.min(w - 1, cx + r); x++) {
      const wt = weight(x - cx, y - cy, r, softness)
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
  const target = toSea ? seaLevel - 0.06 : seaLevel + 0.05
  for (let y = Math.max(0, cy - r); y <= Math.min(h - 1, cy + r); y++) {
    for (let x = Math.max(0, cx - r); x <= Math.min(w - 1, cx + r); x++) {
      const wt = weight(x - cx, y - cy, r, softness)
      if (!wt) continue
      const i = idx(w, x, y)
      elev[i] = elev[i] + (target - elev[i]) * strength * wt
      elev[i] = Math.max(0, Math.min(1, elev[i]))
    }
  }
}

export function suggestCities(world: World, count: number): City[] {
  const { width: w, height: h } = world
  const candidates: { x: number; y: number; score: number }[] = []
  for (let y = 2; y < h - 2; y += 2) {
    for (let x = 2; x < w - 2; x += 2) {
      const r = evaluateSuitability(world, x, y)
      if (!r.ok || r.score < 0.5) continue
      candidates.push({ x, y, score: r.score })
    }
  }
  candidates.sort((a, b) => b.score - a.score)
  const placed: City[] = []
  const scratch = { cities: [...world.cities] as City[] }
  for (const c of candidates) {
    if (placed.length >= count) break
    if (scratch.cities.some((e) => Math.hypot(e.x - c.x, e.y - c.y) < 8)) continue
    const city: City = {
      x: c.x,
      y: c.y,
      name: nextCityName(scratch as World),
      score: c.score,
    }
    placed.push(city)
    scratch.cities.push(city)
  }
  return placed
}

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
