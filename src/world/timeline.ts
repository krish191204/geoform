/**
 * Deep-time slider: "what did this planet look like N million years ago?"
 *
 * Present (age 0) is the map you edit. The past is a *copy* we reconstruct by
 * sliding plates backward and gathering land toward a supercontinent. We do
 * not overwrite your present map. Cities vanish on old ages (they had not
 * been founded yet).
 *
 * This is a sketch, not a geology thesis. MAX_AGE_MA = 200 million years.
 */
import { recomputeDerived } from './climate'
import { ensurePlateMotion } from './geography'
import { fbm } from './noise'
import type { World } from './types'

export const MAX_AGE_MA = 200

const idx = (w: number, x: number, y: number) => y * w + x

function wrapX(x: number, w: number): number {
  return ((x % w) + w) % w
}

/** Copy the World shell with empty arrays — we fill height next. */
function cloneShell(world: World): World {
  const n = world.width * world.height
  return {
    ...world,
    elev: new Float32Array(n),
    plateId: new Int16Array(n),
    temp: new Float32Array(n),
    moist: new Float32Array(n),
    flux: new Float32Array(n),
    biome: new Array(n),
    suitability: new Float32Array(n),
    cities: [],
    tradeRoutes: [],
    plateVx: new Float32Array(world.plateVx),
    plateVy: new Float32Array(world.plateVy),
  }
}

/**
 * Average land position on a cylinder.
 * Longitude uses circular mean (cos/sin) so a continent wrapping the date line
 * does not pull the centroid into the ocean at x=0.
 */
function landCentroid(world: World): { x: number; y: number } {
  const { width: w, elev, seaLevel } = world
  let sx = 0
  let sy = 0
  let ySum = 0
  let n = 0
  for (let i = 0; i < elev.length; i++) {
    if (elev[i] < seaLevel) continue
    const x = i % w
    const y = (i / w) | 0
    const ang = (2 * Math.PI * x) / w
    sx += Math.cos(ang)
    sy += Math.sin(ang)
    ySum += y
    n++
  }
  if (!n) return { x: w / 2, y: world.height / 2 }
  let meanAng = Math.atan2(sy / n, sx / n)
  if (meanAng < 0) meanAng += Math.PI * 2
  const cx = (meanAng / (Math.PI * 2)) * w
  return { x: cx, y: ySum / n }
}

/** Mean distance of land cells from the land centroid — used to test clustering. */
export function landSpread(world: World): number {
  const { width: w, elev, seaLevel } = world
  const c = landCentroid(world)
  let s = 0
  let n = 0
  for (let i = 0; i < elev.length; i++) {
    if (elev[i] < seaLevel) continue
    const x = i % w
    const y = (i / w) | 0
    let dx = x - c.x
    if (dx > w / 2) dx -= w
    if (dx < -w / 2) dx += w
    s += Math.hypot(dx, y - c.y)
    n++
  }
  return n ? s / n : 0
}

/**
 * Rebuild a past map from today's continents: reverse plate drift,
 * gather land toward a supercontinent, and lower ranges that had not yet risen.
 */
export function reconstructPast(world: World, ageMa: number): World {
  ensurePlateMotion(world)
  const age = Math.max(0, Math.min(MAX_AGE_MA, ageMa))
  if (age < 0.5) {
    const copy = cloneShell(world)
    copy.elev.set(world.elev)
    copy.plateId.set(world.plateId)
    copy.cities = world.cities.map((c) => ({ ...c }))
    copy.temp.set(world.temp)
    copy.moist.set(world.moist)
    copy.flux.set(world.flux)
    copy.biome = world.biome.slice()
    copy.suitability.set(world.suitability)
    return copy
  }

  const { width: w, height: h, elev, plateId, seaLevel, seed, plateVx, plateVy } = world
  const out = cloneShell(world)
  const acc = new Float32Array(w * h)
  const wgt = new Float32Array(w * h)
  const pAcc = new Float32Array(w * h)
  acc.fill(seaLevel - 0.12)
  const pull = age / MAX_AGE_MA
  const relief = 1 - pull * 0.42
  const c = landCentroid(world)

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = idx(w, x, y)
      const e = elev[i]
      if (e < seaLevel - 0.01) continue
      const p = plateId[i]
      const vx = plateVx[p] ?? 0
      const vy = plateVy[p] ?? 0
      let dx = -vx * age
      let dy = -vy * age
      let gx = x - c.x
      if (gx > w / 2) gx -= w
      if (gx < -w / 2) gx += w
      dx += -gx * pull * 0.55
      dy += (c.y - y) * pull * 0.45
      const fx = wrapX(x + dx, w)
      const fy = Math.max(0, Math.min(h - 1, y + dy))
      const x0 = Math.floor(fx)
      const y0 = Math.floor(fy)
      const x1 = wrapX(x0 + 1, w)
      const y1 = Math.min(h - 1, y0 + 1)
      const tx = fx - x0
      const ty = fy - y0
      const hgt = seaLevel + (e - seaLevel) * relief
      const splat = (xx: number, yy: number, wt: number) => {
        if (wt <= 0) return
        const j = idx(w, xx, yy)
        acc[j] += hgt * wt
        wgt[j] += wt
        pAcc[j] += p * wt
      }
      splat(x0, y0, (1 - tx) * (1 - ty))
      splat(x1, y0, tx * (1 - ty))
      splat(x0, y1, (1 - tx) * ty)
      splat(x1, y1, tx * ty)
    }
  }

  for (let i = 0; i < acc.length; i++) {
    if (wgt[i] > 0.12) {
      const e = acc[i] / wgt[i]
      const chew = (fbm((i % w) / 14, ((i / w) | 0) / 14, seed + 33, 3) - 0.5) * 0.05 * pull
      out.elev[i] = Math.max(0, Math.min(1, e + chew))
      out.plateId[i] = Math.round(pAcc[i] / wgt[i])
    } else {
      const x = i % w
      const y = (i / w) | 0
      out.elev[i] = Math.max(0, seaLevel - 0.14 + fbm(x / 20, y / 16, seed + 8, 3) * 0.06)
      out.plateId[i] = 0
    }
  }

  if (age < 8) {
    out.cities = world.cities
      .map((c) => ({ ...c }))
      .filter((c) => out.elev[idx(w, c.x, c.y)] >= seaLevel)
  }

  recomputeDerived(out)
  return out
}
