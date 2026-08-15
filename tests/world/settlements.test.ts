import { describe, expect, it } from 'vitest'
import { generateWorld } from '../../src/world/generate'
import {
  inferSettlementRole,
  scoreSettlementRole,
  settlementCapacity,
  settlementCountForCoverage,
  suggestSettlementMix,
  suggestSettlementsCovering,
  suggestSettlementsForRole,
} from '../../src/world/settlements'

describe('settlement roles', () => {
  it('assigns roles from geography on a generated world', () => {
    const world = generateWorld(96, 48, 42, 0.4, 'continents')
    const mix = suggestSettlementMix(world)
    expect(mix.length).toBeGreaterThan(0)
    const roles = new Set(mix.map((c) => c.role))
    expect(roles.has('seat_of_power') || mix.some((c) => c.role === 'seat_of_power')).toBe(true)
    for (const city of mix) {
      expect(city.role).toBeTruthy()
      expect(city.score).toBeGreaterThan(0)
    }
  })

  it('labels every settlement role for the UI', () => {
    const world = generateWorld(48, 24, 7, 0.4, 'continents')
    for (const role of ['seat_of_power', 'farmland', 'fishing', 'mining', 'hunting', 'trade', 'pastoral'] as const) {
      const s = scoreSettlementRole(world, 20, 12, role)
      expect(s).toBeGreaterThanOrEqual(0)
      expect(s).toBeLessThanOrEqual(1)
    }
  })

  it('can suggest a specific role', () => {
    const world = generateWorld(96, 48, 99, 0.4, 'continents')
    const farms = suggestSettlementsForRole(world, 'farmland', 2)
    expect(farms.length).toBeGreaterThan(0)
    expect(farms.every((c) => c.role === 'farmland')).toBe(true)
    const role = inferSettlementRole(world, farms[0].x, farms[0].y)
    // Mild climates can score the same cell as a capital — still a living-land role.
    expect(['farmland', 'pastoral', 'trade', 'seat_of_power']).toContain(role)
  })

  it('scales settlement count with coverage slider', () => {
    const world = generateWorld(96, 48, 12, 0.4, 'continents')
    const low = suggestSettlementsCovering(world, 'mix', 0.2)
    const high = suggestSettlementsCovering(world, 'mix', 1)
    expect(high.length).toBeGreaterThan(low.length)
    expect(settlementCountForCoverage(world, 1)).toBeGreaterThan(settlementCountForCoverage(world, 0.2))
    expect(settlementCapacity(world)).toBeGreaterThan(0)
  })

  it('packs more towns at maximal coverage than the default mix', () => {
    const world = generateWorld(96, 48, 21, 0.4, 'continents')
    const mix = suggestSettlementMix(world)
    const packed = suggestSettlementsCovering(world, 'mix', 1)
    expect(packed.length).toBeGreaterThan(mix.length)
  })
})
