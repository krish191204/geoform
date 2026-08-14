import { describe, expect, it } from 'vitest'
import { generateWorld } from '../../src/world/generate'
import { landmassStats } from '../../src/world/mass'
import { flagImpossibleGeography } from '../../src/world/plausibility'
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
    temp: new Float32Array(n).fill(0.5),
    moist: new Float32Array(n).fill(0.5),
    flux: new Float32Array(n).fill(0.01),
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

describe('full continents vs island world', () => {
  it('keeps most land in a few large masses when asked for continents', () => {
    for (const seed of [3, 21, 88, 404, 9001]) {
      const world = generateWorld(96, 48, seed, 0.4, 'continents')
      const stats = landmassStats(world)
      expect(stats.landCells, `seed ${seed} has land`).toBeGreaterThan(80)
      expect(stats.largestShare, `seed ${seed} largest share`).toBeGreaterThan(0.28)
      expect(stats.speckleShare, `seed ${seed} speckles`).toBeLessThan(0.22)
      const flags = flagImpossibleGeography(world, 'continents')
      expect(flags.some((f) => f.id === 'pimples'), `seed ${seed} pimple flag`).toBe(false)
    }
  })

  it('is allowed to speckle when the user asks for an island world', () => {
    const islands = generateWorld(96, 48, 21, 0.4, 'islands')
    const continents = generateWorld(96, 48, 21, 0.4, 'continents')
    expect(landmassStats(islands).components).toBeGreaterThan(landmassStats(continents).components)
  })

  it('keeps full continents even on a wet 22% land mix', () => {
    for (const seed of [3, 21, 88]) {
      const world = generateWorld(160, 80, seed, 0.22, 'continents')
      const stats = landmassStats(world)
      expect(stats.components, `seed ${seed} components`).toBeLessThan(12)
      expect(stats.largestShare, `seed ${seed} largest share`).toBeGreaterThan(0.4)
      expect(stats.speckleShare, `seed ${seed} speckles`).toBeLessThan(0.08)
      expect(flagImpossibleGeography(world, 'continents').some((f) => f.id === 'pimples')).toBe(
        false,
      )
    }
  })
})

describe('flagImpossibleGeography', () => {
  it('flags a stamped land rectangle', () => {
    const world = blankWorld(48, 24)
    for (let y = 6; y <= 17; y++) {
      for (let x = 10; x <= 34; x++) world.elev[y * 48 + x] = 0.7
    }
    const flags = flagImpossibleGeography(world, 'continents')
    expect(flags.some((f) => f.id === 'rectangle')).toBe(true)
  })

  it('flags green pimples when the user asked for continents', () => {
    const world = blankWorld(40, 24)
    let x = 2
    let y = 2
    for (let n = 0; n < 30; n++) {
      world.elev[y * 40 + x] = 0.7
      x += 3
      if (x >= 38) {
        x = 2
        y += 3
      }
    }
    const flags = flagImpossibleGeography(world, 'continents')
    expect(flags.some((f) => f.id === 'pimples' || f.id === 'shattered')).toBe(true)
  })

  it('flags a planet with no ocean as a fake rectangle', () => {
    const world = blankWorld(32, 16)
    world.elev.fill(0.7)
    const flags = flagImpossibleGeography(world, 'continents')
    expect(flags.some((f) => f.id === 'no-ocean')).toBe(true)
  })

  it('flags weather that never ran', () => {
    const world = generateWorld(48, 24, 5, 0.4, 'continents')
    world.temp.fill(0)
    world.moist.fill(0)
    const flags = flagImpossibleGeography(world, 'continents')
    expect(flags.some((f) => f.id === 'dead-climate')).toBe(true)
  })

  it('flags a city in the ocean', () => {
    const world = blankWorld(16, 8)
    world.cities.push({ x: 1, y: 1, name: 'Atlantis', score: 0.9 })
    const flags = flagImpossibleGeography(world, 'continents')
    expect(flags.some((f) => f.title.includes('drink'))).toBe(true)
  })
})

describe('climate follows the land', () => {
  it('keeps equatorial land warmer than polar land', () => {
    const world = generateWorld(80, 40, 17, 0.4, 'continents')
    const { width: w, height: h, elev, seaLevel, temp } = world
    const band = (y0: number, y1: number) => {
      let s = 0
      let n = 0
      for (let y = y0; y < y1; y++) {
        for (let x = 0; x < w; x++) {
          if (elev[y * w + x] < seaLevel) continue
          s += temp[y * w + x]
          n++
        }
      }
      return n ? s / n : 0
    }
    const eq = band(Math.floor(h * 0.4), Math.ceil(h * 0.6))
    const pole = band(0, Math.floor(h * 0.15))
    expect(eq).toBeGreaterThan(pole)
    expect(flagImpossibleGeography(world).some((f) => f.id === 'hot-poles')).toBe(false)
  })
})
