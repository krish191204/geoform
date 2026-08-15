import { describe, expect, it } from 'vitest'
import {
  ensureDrainage,
  ensureRiverPresence,
  evaluateSuitability,
  RIVER_VISIBLE_MIN,
  recomputeClimate,
  recomputeDerived,
  recomputeHydrology,
} from '../../src/world/climate'
import { generateWorld } from '../../src/world/generate'
import { landSpread, reconstructPast } from '../../src/world/timeline'
import type { World } from '../../src/world/types'

function blankWorld(width: number, height: number, sea = 0.4): World {
  const n = width * height
  return {
    width,
    height,
    seed: 1,
    seaLevel: sea,
    landRatio: 0.4,
    continentMass: 'continents',
    plateId: new Int16Array(n),
    elev: new Float32Array(n).fill(sea - 0.1),
    temp: new Float32Array(n).fill(0),
    moist: new Float32Array(n).fill(0),
    flux: new Float32Array(n).fill(0),
    biome: Array.from({ length: n }, () => 'ocean'),
    suitability: new Float32Array(n),
    cities: [],
    tradeRoutes: [],
    plateCount: 1,
    plateVx: new Float32Array([0]),
    plateVy: new Float32Array([0]),
    rawElevMin: 0,
    rawElevMax: 1,
    rawSeaThreshold: sea,
    engine: 'local',
    originX: 0,
    originY: 0,
    latRows: height,
  }
}

describe('climate wrap + drainage', () => {
  it('moisture advection wraps the date line (no wall at x=0)', () => {
    const w = 32
    const h = 12
    const world = blankWorld(w, h, 0.4)
    world.elev.fill(0.15)
    // Mid-latitude row uses westerlies (west→east), so a ridge at x=w-1
    // casts a rain shadow onto x=0..2 across the date line.
    const y = 3
    for (let yy = 2; yy < h - 2; yy++) {
      world.elev[yy * w + (w - 1)] = 0.88
      world.elev[yy * w + 0] = 0.5
      world.elev[yy * w + 1] = 0.5
      world.elev[yy * w + 2] = 0.5
      // Same-height land with a long ocean fetch to the west (no wrap ridge).
      world.elev[yy * w + 16] = 0.5
      world.elev[yy * w + 17] = 0.5
    }
    recomputeClimate(world)
    const leeOfWrap = world.moist[y * w + 1]
    const openFetch = world.moist[y * w + 16]
    expect(leeOfWrap).toBeLessThan(openFetch)
  })

  it('new worlds are not mostly ice+desert (temperate biomes exist)', () => {
    for (const seed of [3, 21, 88, 241]) {
      const world = generateWorld(128, 64, seed, 0.4, 'continents')
      const counts: Record<string, number> = {}
      let land = 0
      let moistSum = 0
      let tempSum = 0
      for (let i = 0; i < world.elev.length; i++) {
        if (world.elev[i] < world.seaLevel) continue
        land++
        moistSum += world.moist[i]
        tempSum += world.temp[i]
        const b = world.biome[i]
        counts[b] = (counts[b] ?? 0) + 1
      }
      expect(land).toBeGreaterThan(200)
      const medianishMoist = moistSum / land
      const meanTemp = tempSum / land
      expect(medianishMoist).toBeGreaterThan(0.22)
      expect(meanTemp).toBeGreaterThan(0.28)
      const harsh = (counts.ice ?? 0) + (counts.desert ?? 0)
      const living =
        (counts.grassland ?? 0) +
        (counts.forest ?? 0) +
        (counts.savanna ?? 0) +
        (counts.taiga ?? 0) +
        (counts.rainforest ?? 0)
      expect(harsh / land).toBeLessThan(0.55)
      expect(living / land).toBeGreaterThan(0.25)
    }
  })

  it('ensureDrainage opens a path out of a closed basin', () => {
    const w = 24
    const h = 16
    const world = blankWorld(w, h, 0.4)
    // Continent with a pit in the middle.
    for (let y = 3; y < h - 3; y++) {
      for (let x = 3; x < w - 3; x++) world.elev[y * w + x] = 0.55
    }
    world.elev[8 * w + 12] = 0.42 // pit floor still above sea
    world.elev[8 * w + 11] = 0.62
    world.elev[8 * w + 13] = 0.62
    world.elev[7 * w + 12] = 0.62
    world.elev[9 * w + 12] = 0.62

    ensureDrainage(world, 8)
    recomputeHydrology(world)

    // Pit cell should now have a downhill neighbor (or be below sea).
    const i = 8 * w + 12
    const e = world.elev[i]
    if (e < world.seaLevel) return
    const x = 12
    const y = 8
    let hasDown = false
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const ni = (y + dy) * w + ((x + dx + w) % w)
      if (world.elev[ni] < e - 1e-6) hasDown = true
    }
    expect(hasDown).toBe(true)
  })

  it('recomputeDerived drains before rivers so paint path is not stranded', () => {
    const w = 20
    const h = 14
    const world = blankWorld(w, h, 0.4)
    for (let y = 2; y < h - 2; y++) {
      for (let x = 2; x < w - 2; x++) world.elev[y * w + x] = 0.6
    }
    // Deep enclosed pit
    world.elev[7 * w + 10] = 0.41
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
      [1, 1],
      [1, -1],
      [-1, 1],
      [-1, -1],
    ]) {
      world.elev[(7 + dy) * w + (10 + dx)] = 0.7
    }

    recomputeDerived(world, false)

    const i = 7 * w + 10
    const e = world.elev[i]
    let hasDown = e < world.seaLevel
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      if (world.elev[(7 + dy) * w + ((10 + dx + w) % w)] < e - 1e-6) hasDown = true
    }
    expect(hasDown).toBe(true)
    let tMax = 0
    for (let k = 0; k < world.temp.length; k++) tMax = Math.max(tMax, world.temp[k])
    expect(tMax).toBeGreaterThan(0.2)
  })
})

describe('visible rivers on continents', () => {
  it('New world continents have atlas-visible river cells', () => {
    for (const seed of [3, 21, 88]) {
      const world = generateWorld(96, 48, seed, 0.4, 'continents')
      let riverCells = 0
      let land = 0
      for (let i = 0; i < world.elev.length; i++) {
        if (world.elev[i] < world.seaLevel) continue
        land++
        if (world.flux[i] >= RIVER_VISIBLE_MIN) riverCells++
      }
      expect(land).toBeGreaterThan(200)
      expect(riverCells).toBeGreaterThan(8)
    }
  })

  it('ensureRiverPresence scales barren flux on large landmasses', () => {
    const w = 40
    const h = 24
    const world = blankWorld(w, h, 0.4)
    for (let y = 2; y < h - 2; y++) {
      for (let x = 2; x < w - 2; x++) world.elev[y * w + x] = 0.55
    }
    world.flux.fill(0.05)
    for (let i = 0; i < world.elev.length; i++) {
      if (world.elev[i] >= world.seaLevel) world.flux[i] = 0.2
    }
    ensureRiverPresence(world)
    let maxF = 0
    for (let i = 0; i < world.flux.length; i++) maxF = Math.max(maxF, world.flux[i])
    expect(maxF).toBeGreaterThanOrEqual(RIVER_VISIBLE_MIN * 1.25)
  })

  it('hydrology after climate leaves downhill trunks', () => {
    const w = 32
    const h = 20
    const world = blankWorld(w, h, 0.4)
    for (let y = 2; y < h - 2; y++) {
      for (let x = 2; x < w - 2; x++) {
        const t = 1 - Math.abs(x - 16) / 14
        world.elev[y * w + x] = 0.45 + t * 0.35
      }
    }
    ensureDrainage(world)
    recomputeClimate(world)
    recomputeHydrology(world)
    let maxF = 0
    for (let i = 0; i < world.flux.length; i++) {
      if (world.elev[i] >= world.seaLevel) maxF = Math.max(maxF, world.flux[i])
    }
    expect(maxF).toBeGreaterThanOrEqual(RIVER_VISIBLE_MIN)
  })
})

describe('settlement suitability tiers', () => {
  it('blocks ocean, peaks, and cliffs', () => {
    const world = blankWorld(24, 16, 0.4)
    world.elev.fill(0.55)
    world.moist.fill(0.5)
    world.temp.fill(0.55)
    world.flux.fill(2)
    world.biome.fill('grassland')

    expect(evaluateSuitability(world, 4, 4).tier).toBe('favorable')

    world.elev[4 * 24 + 4] = 0.2
    expect(evaluateSuitability(world, 4, 4).tier).toBe('blocked')

    world.elev.fill(0.55)
    world.elev[8 * 24 + 8] = 0.9
    expect(evaluateSuitability(world, 8, 8).tier).toBe('blocked')

    world.elev.fill(0.55)
    world.elev[10 * 24 + 10] = 0.55
    world.elev[10 * 24 + 11] = 0.82
    expect(evaluateSuitability(world, 10, 10).tier).toBe('blocked')
  })

  it('marks harsh desert land as marginal but placeable', () => {
    const world = blankWorld(24, 16, 0.4)
    world.elev.fill(0.55)
    world.moist.fill(0.12)
    world.temp.fill(0.55)
    world.flux.fill(0.2)
    world.biome.fill('desert')
    const site = evaluateSuitability(world, 12, 8)
    expect(site.tier).toBe('marginal')
    expect(site.ok).toBe(true)
  })

  it('marks river valleys as favorable', () => {
    const world = blankWorld(24, 16, 0.4)
    world.elev.fill(0.55)
    world.moist.fill(0.5)
    world.temp.fill(0.55)
    world.flux.fill(6)
    world.biome.fill('grassland')
    const site = evaluateSuitability(world, 12, 8)
    expect(site.tier).toBe('favorable')
    expect(site.ok).toBe(true)
    expect(site.score).toBeGreaterThanOrEqual(0.52)
  })
})

describe('timeline circular centroid', () => {
  it('does not put the land centroid in empty ocean for a wrap-around mass', () => {
    const w = 40
    const h = 20
    const world = blankWorld(w, h, 0.4)
    // Land only near both date-line edges (wraps).
    for (let y = 4; y < h - 4; y++) {
      for (let x = 0; x < 6; x++) world.elev[y * w + x] = 0.65
      for (let x = w - 6; x < w; x++) world.elev[y * w + x] = 0.65
    }
    // Arithmetic mean of x would be ~20 (ocean). Circular mean stays near 0/40.
    const past = reconstructPast(world, 40)
    // Past should still have land clustered near the wrap, not a blob at mid-map only.
    let landMid = 0
    let landEdge = 0
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (past.elev[y * w + x] < past.seaLevel) continue
        if (x > 12 && x < w - 12) landMid++
        else landEdge++
      }
    }
    expect(landEdge + landMid).toBeGreaterThan(20)
    // Spread should be finite and not explode
    expect(landSpread(world)).toBeGreaterThan(0)
    expect(landSpread(world)).toBeLessThan(w)
  })
})
