import { recomputeDerived } from './climate'
import { createRng, fbm } from './noise'
import type { World } from './types'

const idx = (w: number, x: number, y: number) => y * w + x

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

/** Raise ranges and drop rifts from current plate contacts and continent shape. */
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

export function refreshGeography(world: World, opts?: { sculpt?: boolean }): void {
  if (opts?.sculpt) sculptOrogeny(world)
  recomputeDerived(world)
}
