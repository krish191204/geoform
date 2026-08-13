import { ensureDrainage, recomputeDerived } from './climate'
import { chewStraightCoasts, meanderCoasts } from './coasts'
import { applyLandRatio, landFraction, MAX_LAND_RATIO, MIN_LAND_RATIO } from './land'
import { clampContinentMass, cohereLand, drownOffshoreSpeckle, fitCoastalLandRatio, landmassStats, massRecipe, reshapeLandmasses } from './mass'
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

function ensureArrays(world: World): void {
  const n = world.width * world.height
  if (world.temp.length === n && world.biome.length === n && world.flux.length === n) return
  world.temp = new Float32Array(n)
  world.moist = new Float32Array(n)
  world.flux = new Float32Array(n)
  world.biome = new Array(n)
  world.suitability = new Float32Array(n)
}

function relocateOceanCities(world: World): void {
  const { width: w, height: h, elev, seaLevel } = world
  for (const c of world.cities) {
    if (c.x >= 0 && c.y >= 0 && c.x < w && c.y < h && elev[c.y * w + c.x] >= seaLevel) continue
    let bestD = Infinity
    let bx = c.x
    let by = c.y
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (elev[y * w + x] < seaLevel) continue
        const d = (x - c.x) * (x - c.x) + (y - c.y) * (y - c.y)
        if (d < bestD) {
          bestD = d
          bx = x
          by = y
        }
      }
    }
    if (bestD < Infinity) {
      c.x = bx
      c.y = by
    }
  }
  world.cities = world.cities.filter(
    (c) => c.x >= 0 && c.y >= 0 && c.x < w && c.y < h && elev[c.y * w + c.x] >= seaLevel,
  )
}

/**
 * Make the planet physically possible: seas, coasts, climate, rivers, plates.
 * Call this instead of leaving broken geography for the user to notice.
 */
export function harmonizeWorld(world: World, opts?: { sculpt?: boolean }): void {
  ensureArrays(world)
  ensurePlateMotion(world)
  const frac = landFraction(world.elev, world.seaLevel)
  if (frac > MAX_LAND_RATIO + 0.04 || frac < MIN_LAND_RATIO - 0.04) {
    applyLandRatio(world, world.landRatio)
  }
  const mass = clampContinentMass(world.continentMass)
  if (mass !== 'islands') reshapeLandmasses(world)
  const recipe = massRecipe(mass)
  for (let pass = 0; pass < 4; pass++) {
    const stats = landmassStats(world)
    let changed = false
    if (stats.axisAlignedCoastShare > 0.28) {
      chewStraightCoasts(world.elev, world.width, world.height, world.seaLevel, world.seed + 21 + pass * 13)
      chewStraightCoasts(world.elev, world.width, world.height, world.seaLevel, world.seed + 37 + pass * 17)
      meanderCoasts(world.elev, world.width, world.height, world.seaLevel, world.seed + 11 + pass * 5)
      if (mass !== 'islands') {
        drownOffshoreSpeckle(world)
        fitCoastalLandRatio(world)
      }
      changed = true
    }
    if (mass !== 'islands' && (stats.speckleShare > 0.08 || stats.components > 10)) {
      cohereLand(world.elev, world.width, world.height, world.seaLevel, recipe.speckleMax, recipe.pondMax)
      drownOffshoreSpeckle(world)
      fitCoastalLandRatio(world)
      changed = true
    }
    if (!changed) break
  }
  if (mass !== 'islands') {
    drownOffshoreSpeckle(world)
    fitCoastalLandRatio(world)
  }
  if (opts?.sculpt) sculptOrogeny(world)
  ensureDrainage(world)
  if (mass !== 'islands') {
    drownOffshoreSpeckle(world)
    fitCoastalLandRatio(world)
  }
  relocateOceanCities(world)
  recomputeDerived(world)
}

export function refreshGeography(world: World, opts?: { sculpt?: boolean }): void {
  harmonizeWorld(world, opts)
}
