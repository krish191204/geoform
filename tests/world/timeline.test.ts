import { describe, expect, it } from 'vitest'
import { generateWorld } from '../../src/world/generate'
import { landSpread, reconstructPast } from '../../src/world/timeline'

describe('reconstructPast', () => {
  it('gathers today’s continents when the age slider goes back', () => {
    const now = generateWorld(80, 40, 21, 0.4)
    const past = reconstructPast(now, 180)
    expect(landSpread(past)).toBeLessThan(landSpread(now) * 0.92)
    expect(past.width).toBe(now.width)
    expect(past.cities.length).toBe(0)
  })

  it('keeps the present map at age 0', () => {
    const now = generateWorld(64, 32, 8, 0.4)
    const copy = reconstructPast(now, 0)
    expect(copy.elev[10]).toBeCloseTo(now.elev[10])
    expect(copy.plateId[10]).toBe(now.plateId[10])
  })
})
