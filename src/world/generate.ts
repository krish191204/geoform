import { recomputeDerived } from './climate'
import { chewStraightCoasts, noisyPolarOcean } from './coasts'
import { sculptOrogeny } from './geography'
import { applyLandRatio, clampLandRatio, DEFAULT_LAND_RATIO } from './land'
import {
  clampContinentMass,
  cohereLand,
  DEFAULT_CONTINENT_MASS,
  massRecipe,
  type ContinentMass,
} from './mass'
import { createRng, fbm } from './noise'
import type { Biome, City, World } from './types'

const idx = (w: number, x: number, y: number) => y * w + x

interface Plate {
  x: number
  y: number
  vx: number
  vy: number
  continental: boolean
  radius: number
}

function assignPlates(w: number, h: number, plates: Plate[], seed: number): Int16Array {
  const plateId = new Int16Array(w * h)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      // Noise-warped coordinates → organic (non-polygonal) plate boundaries
      const wx = x + (fbm(x / 28, y / 28, seed + 3, 3) - 0.5) * 22
      const wy = y + (fbm(x / 28, y / 28, seed + 9, 3) - 0.5) * 18
      let best = 0
      let bestD = Infinity
      for (let p = 0; p < plates.length; p++) {
        let dx = wx - plates[p].x
        if (dx > w / 2) dx -= w
        if (dx < -w / 2) dx += w
        const dy = (wy - plates[p].y) * 1.15
        const d = dx * dx + dy * dy
        if (d < bestD) {
          bestD = d
          best = p
        }
      }
      plateId[idx(w, x, y)] = best
    }
  }
  return plateId
}

function wrapDx(dx: number, w: number): number {
  if (dx > w / 2) dx -= w
  if (dx < -w / 2) dx += w
  return dx
}

function buildElevation(
  w: number,
  h: number,
  plates: Plate[],
  plateId: Int16Array,
  seed: number,
  mass: ContinentMass,
): Float32Array {
  const recipe = massRecipe(mass)
  const elev = new Float32Array(w * h)
  const counts = new Float32Array(plates.length)
  for (let i = 0; i < plateId.length; i++) counts[plateId[i]]++
  for (let p = 0; p < plates.length; p++) {
    const areaR = Math.sqrt(Math.max(1, counts[p]) / Math.PI)
    plates[p].radius = areaR * (plates[p].continental ? recipe.radiusScale : 0.24)
  }

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = idx(w, x, y)
      const p = plates[plateId[i]]
      const n =
        fbm(x / 48, y / 48, seed, 5) * 0.55 + fbm(x / 18, y / 18, seed + 7, 3) * 0.25
      const wx = wrapDx(x - p.x, w) + (fbm(x / 22, y / 18, seed + 19, 4) - 0.5) * 22
      const wy = y - p.y + (fbm(x / 18, y / 22, seed + 23, 4) - 0.5) * 16
      const d = Math.hypot(wx, wy * 1.12)
      const blob = fbm(x / 36, y / 30, seed + 5, 5)
      const gulfs = fbm(x / 10, y / 9, seed + 41, 4)
      let t = 1 - d / Math.max(4, p.radius * (0.9 + blob * 0.4))
      t += (blob - 0.5) * 0.45
      if (gulfs < recipe.gulfThresh) t -= (recipe.gulfThresh - gulfs) * recipe.gulfCut

      if (p.continental) {
        const land = Math.max(0, t)
        elev[i] = 0.14 + n * 0.1 + land * (0.32 + n * 0.14)
        if (gulfs > 0.8 && t > 0.08) elev[i] += 0.05
      } else {
        elev[i] = 0.1 + n * 0.08
        if (blob > recipe.islandThresh && n > 0.5) {
          elev[i] = 0.42 + (blob - recipe.islandThresh) * 0.45 + n * 0.08
        }
      }
    }
  }

  // Boundary tectonics
  const dirs = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ]
  const delta = new Float32Array(w * h)

  for (let y = 1; y < h - 1; y++) {
    for (let x = 0; x < w; x++) {
      const i = idx(w, x, y)
      const a = plateId[i]
      const pa = plates[a]
      for (const [dx, dy] of dirs) {
        const nx = (x + dx + w) % w
        const ny = y + dy
        if (ny < 0 || ny >= h) continue
        const b = plateId[idx(w, nx, ny)]
        if (a === b) continue
        const pb = plates[b]
        // Relative velocity along the shared normal (from a toward b)
        const relx = pa.vx - pb.vx
        const rely = pa.vy - pb.vy
        const approach = -(relx * dx + rely * dy) // positive = converging
        const contA = pa.continental
        const contB = pb.continental

        if (approach > 0.15) {
          if (contA && contB) {
            delta[i] += 0.14 + approach * 0.12 // Himalayan collision
          } else if (contA !== contB) {
            // Ocean under continent → arc on continental side, trench on ocean
            if (contA) delta[i] += 0.1 + approach * 0.08
            else delta[i] -= 0.06 + approach * 0.04
          } else {
            delta[i] += 0.05 + approach * 0.05 // island arc
          }
        } else if (approach < -0.15) {
          delta[i] -= 0.04 // rift
          if (!contA) delta[i] += 0.02 // mid-ocean ridge bump
        }
      }
    }
  }

  for (let i = 0; i < elev.length; i++) elev[i] += delta[i]

  // Smooth a few times for coherent ranges
  for (let pass = 0; pass < 3; pass++) {
    const next = new Float32Array(elev)
    for (let y = 1; y < h - 1; y++) {
      for (let x = 0; x < w; x++) {
        const i = idx(w, x, y)
        const l = elev[idx(w, (x - 1 + w) % w, y)]
        const r = elev[idx(w, (x + 1) % w, y)]
        const u = elev[idx(w, x, y - 1)]
        const d = elev[idx(w, x, y + 1)]
        // Keep sharp mountains: less blend where already high
        const t = elev[i] > 0.55 ? 0.15 : 0.35
        next[i] = elev[i] * (1 - t) + ((l + r + u + d) * 0.25) * t
      }
    }
    elev.set(next)
  }

  // Normalize roughly into 0..1
  let min = Infinity
  let max = -Infinity
  for (let i = 0; i < elev.length; i++) {
    min = Math.min(min, elev[i])
    max = Math.max(max, elev[i])
  }
  const span = Math.max(1e-6, max - min)
  for (let i = 0; i < elev.length; i++) {
    elev[i] = (elev[i] - min) / span
  }

  return elev
}


const CITY_NAMES = [
  'Ashmere',
  'Korrin',
  'Velport',
  'Dunhollow',
  'Sableford',
  'Irien',
  'Marost',
  'Cairnwick',
  'Leth',
  'Orendale',
  'Thalass',
  'Brinek',
  'Yarrow',
  'Solmere',
  'Gildenreach',
]

export function generateWorld(
  width: number,
  height: number,
  seed: number,
  landRatio = DEFAULT_LAND_RATIO,
  continentMass: ContinentMass = DEFAULT_CONTINENT_MASS,
): World {
  const land = clampLandRatio(landRatio)
  const mass = clampContinentMass(continentMass)
  const recipe = massRecipe(mass)
  const rng = createRng(seed)
  const plateCount = recipe.plateMin + Math.floor(rng() * recipe.plateSpan)
  const plates: Plate[] = []
  const wantCont =
    recipe.contMin + Math.floor(rng() * Math.max(1, recipe.contMax - recipe.contMin + 1))

  for (let i = 0; i < plateCount; i++) {
    const ang = rng() * Math.PI * 2
    const speed = 0.35 + rng() * 0.9
    const slice = (i + 0.5) / Math.max(1, wantCont)
    plates.push({
      x: mass === 'continents' && i < wantCont ? (slice + (rng() - 0.5) * 0.18) * width : rng() * width,
      y: rng() * height * 0.5 + height * 0.25,
      vx: Math.cos(ang) * speed,
      vy: Math.sin(ang) * speed,
      continental: i < wantCont,
      radius: 12,
    })
  }

  const plateId = assignPlates(width, height, plates, seed)
  const elev = buildElevation(width, height, plates, plateId, seed, mass)

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = idx(width, x, y)
      const edgeNoise = (fbm(x / 12, y / 12, seed + 41, 5) - 0.5) * (mass === 'islands' ? 0.12 : 0.07)
      elev[i] = Math.max(0, Math.min(1, elev[i] + edgeNoise))
    }
  }

  noisyPolarOcean(elev, width, height, seed)

  const plateVx = new Float32Array(plateCount)
  const plateVy = new Float32Array(plateCount)
  for (let i = 0; i < plateCount; i++) {
    plateVx[i] = plates[i].vx * 0.32
    plateVy[i] = plates[i].vy * 0.32
  }

  const seaLevel = 0.44

  const world: World = {
    width,
    height,
    seed,
    seaLevel,
    landRatio: land,
    continentMass: mass,
    plateId,
    elev,
    temp: new Float32Array(width * height),
    moist: new Float32Array(width * height),
    flux: new Float32Array(width * height),
    biome: new Array(width * height) as Biome[],
    suitability: new Float32Array(width * height),
    cities: [] as City[],
    plateCount,
    plateVx,
    plateVy,
    rawElevMin: 0,
    rawElevMax: 1,
    rawSeaThreshold: seaLevel,
    engine: 'local',
    originX: 0,
    originY: 0,
    latRows: height,
  }

  applyLandRatio(world, land)
  cohereLand(world.elev, width, height, world.seaLevel, recipe.speckleMax, recipe.pondMax)
  for (let p = 0; p < recipe.chewPasses; p++) {
    chewStraightCoasts(world.elev, width, height, world.seaLevel, seed + p * 9)
  }
  sculptOrogeny(world)
  if (recipe.speckleMax > 0) {
    cohereLand(world.elev, width, height, world.seaLevel, Math.max(4, recipe.speckleMax - 6), 6)
  }
  recomputeDerived(world)
  return world
}

export function paintElevation(
  world: World,
  cx: number,
  cy: number,
  radius: number,
  amount: number,
): void {
  const { width: w, height: h, elev } = world
  const r2 = radius * radius
  for (let y = Math.max(0, cy - radius); y <= Math.min(h - 1, cy + radius); y++) {
    for (let x = Math.max(0, cx - radius); x <= Math.min(w - 1, cx + radius); x++) {
      const dx = x - cx
      const dy = y - cy
      const d2 = dx * dx + dy * dy
      if (d2 > r2) continue
      const falloff = 1 - Math.sqrt(d2) / radius
      const i = idx(w, x, y)
      elev[i] = Math.max(0, Math.min(1, elev[i] + amount * falloff * falloff))
    }
  }
  // Local preview while WorldEngine recompute is in flight / debounced
  recomputeDerived(world, false)
}

export function nextCityName(world: World): string {
  const used = new Set(world.cities.map((c) => c.name))
  for (const n of CITY_NAMES) {
    if (!used.has(n)) return n
  }
  return `Settlement ${world.cities.length + 1}`
}
