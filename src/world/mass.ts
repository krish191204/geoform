import { fbm } from './noise'
import { chewStraightCoasts, meanderCoasts } from './coasts'
import type { World } from './types'

export type ContinentMass = 'continents' | 'mixed' | 'islands'

export const DEFAULT_CONTINENT_MASS: ContinentMass = 'continents'

export const CONTINENT_MASS_OPTIONS: { id: ContinentMass; label: string; desc: string }[] = [
  {
    id: 'continents',
    label: 'Full continents',
    desc: 'A few large landmasses with gulfs — default Earth look',
  },
  {
    id: 'mixed',
    label: 'Continents & islands',
    desc: 'Big land plus smaller offshore islands',
  },
  {
    id: 'islands',
    label: 'Island world',
    desc: 'Scattered archipelagos, if that is what you want',
  },
]

export function clampContinentMass(value: unknown): ContinentMass {
  if (value === 'mixed' || value === 'islands' || value === 'continents') return value
  return DEFAULT_CONTINENT_MASS
}

export interface MassRecipe {
  plateMin: number
  plateSpan: number
  contMin: number
  contMax: number
  radiusScale: number
  gulfThresh: number
  gulfCut: number
  islandThresh: number
  speckleMax: number
  pondMax: number
  chewPasses: number
}

export function massRecipe(mass: ContinentMass): MassRecipe {
  if (mass === 'islands') {
    return {
      plateMin: 10,
      plateSpan: 6,
      contMin: 5,
      contMax: 9,
      radiusScale: 0.38,
      gulfThresh: 0.34,
      gulfCut: 1.2,
      islandThresh: 0.76,
      speckleMax: 0,
      pondMax: 2,
      chewPasses: 2,
    }
  }
  if (mass === 'mixed') {
    return {
      plateMin: 8,
      plateSpan: 5,
      contMin: 3,
      contMax: 5,
      radiusScale: 0.78,
      gulfThresh: 0.28,
      gulfCut: 0.85,
      islandThresh: 0.86,
      speckleMax: 6,
      pondMax: 8,
      chewPasses: 2,
    }
  }
  return {
    plateMin: 6,
    plateSpan: 3,
    contMin: 2,
    contMax: 3,
    radiusScale: 1.34,
    gulfThresh: 0.2,
    gulfCut: 0.48,
    islandThresh: 0.94,
    speckleMax: 18,
    pondMax: 22,
    chewPasses: 1,
  }
}

const DIRS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const

function wrapX(x: number, w: number) {
  return ((x % w) + w) % w
}

function flood(
  elev: Float32Array,
  w: number,
  h: number,
  start: number,
  land: boolean,
  sea: number,
  seen: Uint8Array,
): number[] {
  const cells: number[] = []
  const q = [start]
  seen[start] = 1
  while (q.length) {
    const i = q.pop()!
    cells.push(i)
    const x = i % w
    const y = (i / w) | 0
    for (const [dx, dy] of DIRS) {
      const nx = wrapX(x + dx, w)
      const ny = y + dy
      if (ny < 0 || ny >= h) continue
      const ni = ny * w + nx
      if (seen[ni]) continue
      const isLand = elev[ni] >= sea
      if (isLand !== land) continue
      seen[ni] = 1
      q.push(ni)
    }
  }
  return cells
}

export function landComponents(world: Pick<World, 'width' | 'height' | 'elev' | 'seaLevel'>): number[][] {
  const { width: w, height: h, elev, seaLevel: sea } = world
  const seen = new Uint8Array(w * h)
  const out: number[][] = []
  for (let i = 0; i < elev.length; i++) {
    if (seen[i] || elev[i] < sea) continue
    out.push(flood(elev, w, h, i, true, sea, seen))
  }
  return out
}

export interface LandmassStats {
  landCells: number
  components: number
  largestShare: number
  speckleShare: number
  axisAlignedCoastShare: number
}

export function landmassStats(
  world: Pick<World, 'width' | 'height' | 'elev' | 'seaLevel'>,
  speckleSize = 8,
): LandmassStats {
  const { width: w, height: h, elev, seaLevel: sea } = world
  const comps = landComponents(world)
  let landCells = 0
  let largest = 0
  let speckle = 0
  for (const c of comps) {
    landCells += c.length
    largest = Math.max(largest, c.length)
    if (c.length <= speckleSize) speckle += c.length
  }
  let coast = 0
  let straight = 0
  for (let y = 1; y < h - 1; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x
      const land = elev[i] >= sea
      if (!land) continue
      const l = elev[y * w + wrapX(x - 1, w)] >= sea
      const r = elev[y * w + wrapX(x + 1, w)] >= sea
      const u = elev[(y - 1) * w + x] >= sea
      const d = elev[(y + 1) * w + x] >= sea
      const nLand = (l ? 1 : 0) + (r ? 1 : 0) + (u ? 1 : 0) + (d ? 1 : 0)
      if (nLand === 4) continue
      coast++
      const straightNS = u === land && d === land && l !== r
      const straightEW = l === land && r === land && u !== d
      if (straightNS || straightEW) straight++
    }
  }
  return {
    landCells,
    components: comps.length,
    largestShare: landCells ? largest / landCells : 0,
    speckleShare: landCells ? speckle / landCells : 0,
    axisAlignedCoastShare: coast ? straight / coast : 0,
  }
}

/** How completely land fills its bounding box — ~1 is a stamped rectangle. */
export function landBboxFill(world: Pick<World, 'width' | 'height' | 'elev' | 'seaLevel'>): number {
  const { width: w, height: h, elev, seaLevel: sea } = world
  let minx = w
  let maxx = 0
  let miny = h
  let maxy = 0
  let land = 0
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (elev[y * w + x] < sea) continue
      land++
      minx = Math.min(minx, x)
      maxx = Math.max(maxx, x)
      miny = Math.min(miny, y)
      maxy = Math.max(maxy, y)
    }
  }
  if (!land) return 0
  return land / ((maxx - minx + 1) * (maxy - miny + 1))
}

/** Drown tiny islands and fill pinholes so continents stay continents. */
export function cohereLand(
  elev: Float32Array,
  w: number,
  h: number,
  sea: number,
  speckleMax: number,
  pondMax: number,
): void {
  if (speckleMax > 0) {
    const seen = new Uint8Array(w * h)
    for (let i = 0; i < elev.length; i++) {
      if (seen[i] || elev[i] < sea) continue
      const cells = flood(elev, w, h, i, true, sea, seen)
      if (cells.length <= speckleMax) {
        for (const c of cells) elev[c] = Math.min(elev[c], sea - 0.05)
      }
    }
  }
  if (pondMax > 0) {
    const seen = new Uint8Array(w * h)
    for (let i = 0; i < elev.length; i++) {
      if (seen[i] || elev[i] >= sea) continue
      const cells = flood(elev, w, h, i, false, sea, seen)
      if (cells.length > pondMax) continue
      const touchesPole = cells.some((c) => {
        const y = (c / w) | 0
        return y === 0 || y === h - 1
      })
      if (touchesPole) continue
      for (const c of cells) elev[c] = Math.max(elev[c], sea + 0.04)
    }
  }
}

function countLand(elev: Float32Array, sea: number): number {
  let n = 0
  for (let i = 0; i < elev.length; i++) if (elev[i] >= sea) n++
  return n
}

/** Keep a handful of real landmasses; drown the green pimples around them. */
export function drownOffshoreSpeckle(world: World): void {
  const mass = clampContinentMass(world.continentMass)
  if (mass === 'islands') return
  const { width: w, height: h, elev, seaLevel: sea } = world
  const comps = landComponents(world)
  if (!comps.length) return
  comps.sort((a, b) => b.length - a.length)
  const keepN = mass === 'continents' ? 3 : 8
  const minSize = Math.max(
    mass === 'continents' ? 48 : 18,
    Math.round(w * h * (mass === 'continents' ? 0.005 : 0.0015)),
  )
  const keep = new Uint8Array(w * h)
  let kept = 0
  for (const cells of comps) {
    const must = kept < (mass === 'continents' ? 2 : 1)
    if (kept >= keepN) break
    if (!must && cells.length < minSize) continue
    for (const i of cells) keep[i] = 1
    kept++
  }
  if (!kept) {
    for (const i of comps[0]) keep[i] = 1
  }
  for (let i = 0; i < elev.length; i++) {
    if (elev[i] >= sea && !keep[i]) elev[i] = Math.min(elev[i], sea - 0.06)
  }
}

/** Grow or nibble coasts until the land share matches the slider — without new islands. */
export function fitCoastalLandRatio(world: World): void {
  const target = Math.max(0.12, Math.min(0.72, world.landRatio))
  const { width: w, height: h, elev, seaLevel: sea, seed } = world
  const nCells = w * h
  const want = Math.round(target * nCells)

  for (let pass = 0; pass < 48; pass++) {
    const have = countLand(elev, sea)
    if (Math.abs(have - want) <= Math.max(12, nCells * 0.012)) break
    const grow = have < want
    const candidates: number[] = []
    for (let y = 1; y < h - 1; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x
        const isLand = elev[i] >= sea
        if (grow === isLand) continue
        let nLand = 0
        for (const [dx, dy] of DIRS) {
          const nx = wrapX(x + dx, w)
          const ny = y + dy
          if (ny < 0 || ny >= h) continue
          if (elev[ny * w + nx] >= sea) nLand++
        }
        if (grow && nLand === 0) continue
        if (!grow && nLand === 4) continue
        if (grow && nLand < 1) continue
        candidates.push(i)
      }
    }
    if (!candidates.length) break
    const need = Math.abs(want - have)
    const batch = Math.min(
      Math.max(4, Math.round(candidates.length * 0.12)),
      Math.max(6, Math.round(need * 0.28)),
    )
    candidates.sort((a, b) => {
      const ax = a % w
      const ay = (a / w) | 0
      const bx = b % w
      const by = (b / w) | 0
      return (
        fbm(ax / 16, ay / 13, seed + 29 + pass, 3) - fbm(bx / 16, by / 13, seed + 29 + pass, 3)
      )
    })
    for (let k = 0; k < batch; k++) {
      const i = candidates[k]
      const x = i % w
      const y = (i / w) | 0
      const n = fbm(x / 9, y / 8, seed + 41, 3)
      if (grow) elev[i] = sea + 0.03 + n * 0.05
      else elev[i] = Math.min(elev[i], sea - 0.04 - n * 0.04)
    }
  }
}

/**
 * Full continents means a few large masses, even at a wet land/water mix.
 * Island world is the only mode that keeps speckles.
 */
export function reshapeLandmasses(world: World): void {
  const mass = clampContinentMass(world.continentMass)
  if (mass === 'islands') return
  drownOffshoreSpeckle(world)
  fitCoastalLandRatio(world)
  meanderCoasts(world.elev, world.width, world.height, world.seaLevel, world.seed + 19)
  chewStraightCoasts(world.elev, world.width, world.height, world.seaLevel, world.seed + 21)
  chewStraightCoasts(world.elev, world.width, world.height, world.seaLevel, world.seed + 37)
  drownOffshoreSpeckle(world)
  fitCoastalLandRatio(world)
}
