import { recomputeDerived } from './climate'
import { applyLandRatio, clampLandRatio, DEFAULT_LAND_RATIO } from './land'
import { createRng, fbm } from './noise'
import type { Biome, City, World } from './types'

const idx = (w: number, x: number, y: number) => y * w + x

interface Plate {
  x: number
  y: number
  vx: number
  vy: number
  continental: boolean
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

function buildElevation(
  w: number,
  h: number,
  plates: Plate[],
  plateId: Int16Array,
  seed: number,
): Float32Array {
  const elev = new Float32Array(w * h)

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = idx(w, x, y)
      const p = plates[plateId[i]]
      const n =
        fbm(x / 48, y / 48, seed, 5) * 0.55 + fbm(x / 18, y / 18, seed + 7, 3) * 0.25
      elev[i] = p.continental ? 0.38 + n * 0.22 : 0.12 + n * 0.12
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

/** Irregular ocean around the domain so continents don't fill a rectangle. */
function applyNoisyOceanMargins(
  elev: Float32Array,
  w: number,
  h: number,
  seed: number,
): void {
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = idx(w, x, y)
      const nx = w <= 1 ? 0.5 : x / (w - 1)
      const ny = h <= 1 ? 0.5 : y / (h - 1)
      const edge = Math.min(nx, 1 - nx, ny * 1.2, (1 - ny) * 1.2)
      const warp = (fbm(x / 16, y / 13, seed + 61, 4) - 0.5) * 0.12
      const fade = Math.max(0, Math.min(1, (edge + warp - 0.02) / 0.12))
      const smooth = fade * fade * (3 - 2 * fade)
      const ocean = 0.07 + fbm(x / 10, y / 10, seed + 77, 3) * 0.1
      elev[i] = ocean * (1 - smooth) + elev[i] * smooth
    }
  }
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
): World {
  const land = clampLandRatio(landRatio)
  const rng = createRng(seed)
  const plateCount = 8 + Math.floor(rng() * 6)
  const plates: Plate[] = []
  const continentalP = 0.18 + land * 1.0

  for (let i = 0; i < plateCount; i++) {
    const ang = rng() * Math.PI * 2
    const speed = 0.35 + rng() * 0.9
    plates.push({
      x: rng() * width,
      y: rng() * height,
      vx: Math.cos(ang) * speed,
      vy: Math.sin(ang) * speed,
      continental: rng() < continentalP,
    })
  }
  const minCont = land > 0.5 ? Math.ceil(plateCount * 0.45) : Math.max(1, Math.ceil(plateCount * 0.28))
  let cont = plates.filter((p) => p.continental).length
  for (let i = 0; i < plates.length && cont < minCont; i++) {
    if (!plates[i].continental) {
      plates[i].continental = true
      cont++
    }
  }

  const plateId = assignPlates(width, height, plates, seed)
  const elev = buildElevation(width, height, plates, plateId, seed)

  // Coastal fractal: chew continent edges so shores aren't plate-straight
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = idx(width, x, y)
      const edgeNoise = (fbm(x / 12, y / 12, seed + 41, 5) - 0.5) * 0.12
      elev[i] = Math.max(0, Math.min(1, elev[i] + edgeNoise))
    }
  }

  applyNoisyOceanMargins(elev, width, height, seed)

  const seaLevel = 0.44

  const world: World = {
    width,
    height,
    seed,
    seaLevel,
    landRatio: land,
    plateId,
    elev,
    temp: new Float32Array(width * height),
    moist: new Float32Array(width * height),
    flux: new Float32Array(width * height),
    biome: new Array(width * height) as Biome[],
    suitability: new Float32Array(width * height),
    cities: [] as City[],
    plateCount,
    rawElevMin: 0,
    rawElevMax: 1,
    rawSeaThreshold: seaLevel,
    engine: 'local',
    originX: 0,
    originY: 0,
    latRows: height,
  }

  applyLandRatio(world, land)
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
