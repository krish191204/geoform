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
