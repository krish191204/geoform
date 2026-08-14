import { describe, expect, it } from 'vitest'
import { generateWorld } from '../../src/world/generate'
import { harmonizeWorld } from '../../src/world/geography'
import { landFraction } from '../../src/world/land'
import { deserializeWorld, serializeWorld } from '../../src/world/persist'
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

function impossible(world: World) {
  return flagImpossibleGeography(world).filter((f) => f.severity === 'impossible')
}

describe('harmonizeWorld', () => {
  it('carves a real ocean and runs climate on a flat land slab', () => {
    const world = blankWorld(48, 24)
    world.elev.fill(0.7)
    world.cities.push({ x: 2, y: 2, name: 'Midland', score: 0.8 })
    harmonizeWorld(world)
    const mix = landFraction(world.elev, world.seaLevel)
    expect(mix).toBeGreaterThan(0.12)
    expect(mix).toBeLessThan(0.78)
    let tMax = 0
    for (let i = 0; i < world.temp.length; i++) tMax = Math.max(tMax, world.temp[i])
    expect(tMax).toBeGreaterThan(0.2)
    expect(impossible(world).some((f) => f.id === 'no-ocean' || f.id === 'dead-climate')).toBe(
      false,
    )
    expect(world.cities.every((c) => world.elev[c.y * world.width + c.x] >= world.seaLevel)).toBe(
      true,
    )
  })

  it('breaks a stamped rectangle instead of leaving straight walls', () => {
    const world = blankWorld(48, 24)
    for (let y = 6; y <= 17; y++) {
      for (let x = 10; x <= 34; x++) world.elev[y * 48 + x] = 0.7
    }
    expect(flagImpossibleGeography(world, 'continents').some((f) => f.id === 'rectangle')).toBe(
      true,
    )
    harmonizeWorld(world)
    expect(impossible(world).some((f) => f.id === 'rectangle')).toBe(false)
  })

  it('merges green speckles when the world asked for continents', () => {
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
    expect(
      flagImpossibleGeography(world, 'continents').some((f) => f.id === 'pimples' || f.id === 'shattered'),
    ).toBe(true)
    harmonizeWorld(world)
    expect(impossible(world).some((f) => f.id === 'pimples' || f.id === 'shattered')).toBe(false)
  })

  it('moves a city off the ocean onto land', () => {
    const world = generateWorld(48, 24, 11, 0.4, 'continents')
    world.cities = [{ x: 0, y: 0, name: 'Atlantis', score: 0.9 }]
    world.elev[0] = world.seaLevel - 0.2
    harmonizeWorld(world)
    expect(world.cities.length).toBeGreaterThan(0)
    expect(
      world.cities.every((c) => world.elev[c.y * world.width + c.x] >= world.seaLevel),
    ).toBe(true)
    expect(impossible(world).some((f) => f.id.startsWith('city-ocean'))).toBe(false)
  })
})

describe('load repairs broken saves', () => {
  it('restores ocean and climate when a save is a solid land slab', () => {
    const world = generateWorld(48, 24, 5, 0.4, 'continents')
    world.elev.fill(0.7)
    world.temp.fill(0)
    world.moist.fill(0)
    const loaded = deserializeWorld(serializeWorld(world))
    expect(landFraction(loaded.elev, loaded.seaLevel)).toBeLessThan(0.78)
    expect(loaded.temp[Math.floor(loaded.temp.length / 2)]).toBeGreaterThan(0)
    expect(impossible(loaded).some((f) => f.id === 'no-ocean' || f.id === 'dead-climate')).toBe(
      false,
    )
  })

  it('can load a broken save unchanged for critique', () => {
    const world = generateWorld(48, 24, 5, 0.4, 'continents')
    world.elev.fill(0.7)
    world.temp.fill(0)
    const loaded = deserializeWorld(serializeWorld(world), { repair: false })
    expect(landFraction(loaded.elev, loaded.seaLevel)).toBeGreaterThan(0.9)
  })
})
