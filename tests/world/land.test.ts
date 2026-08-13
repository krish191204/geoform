import { describe, expect, it } from 'vitest'
import { generateWorld } from '../../src/world/generate'
import { applyLandRatio, landFraction, seaLevelForLandRatio } from '../../src/world/land'

describe('seaLevelForLandRatio', () => {
  it('picks a threshold that matches the requested land share', () => {
    const elev = new Float32Array(100)
    for (let i = 0; i < 100; i++) elev[i] = i / 99
    const sea = seaLevelForLandRatio(elev, 0.3)
    const land = landFraction(elev, sea)
    expect(land).toBeGreaterThan(0.25)
    expect(land).toBeLessThan(0.35)
  })
})

describe('applyLandRatio', () => {
  it('drowns cities that fall below the new shoreline', () => {
    const world = generateWorld(64, 32, 7, 0.45)
    world.cities.push({ x: 1, y: 1, name: 'Low', score: 0.5 })
    applyLandRatio(world, 0.2)
    expect(world.landRatio).toBeCloseTo(0.2)
    expect(landFraction(world.elev, world.seaLevel)).toBeGreaterThan(0.12)
    expect(landFraction(world.elev, world.seaLevel)).toBeLessThan(0.28)
    expect(
      world.cities.every((c) => world.elev[c.y * world.width + c.x] >= world.seaLevel),
    ).toBe(true)
  })

  it('carves ocean when the heightfield is a flat land slab', () => {
    const world = generateWorld(48, 24, 3, 0.4)
    world.elev.fill(0.7)
    applyLandRatio(world, 0.4)
    const mix = landFraction(world.elev, world.seaLevel)
    expect(mix).toBeGreaterThan(0.15)
    expect(mix).toBeLessThan(0.75)
  })
})

describe('generateWorld land ratio', () => {
  it('builds a wetter world when asked for more water', () => {
    const wet = generateWorld(80, 40, 99, 0.2)
    const dry = generateWorld(80, 40, 99, 0.6)
    expect(landFraction(wet.elev, wet.seaLevel)).toBeLessThan(landFraction(dry.elev, dry.seaLevel))
    expect(wet.landRatio).toBeCloseTo(0.2)
    expect(dry.landRatio).toBeCloseTo(0.6)
  })
})
