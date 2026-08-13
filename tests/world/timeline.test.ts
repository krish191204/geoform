import { describe, expect, it } from 'vitest'
import { generateWorld } from '../../src/world/generate'
import { reconstructPast } from '../../src/world/timeline'

describe('reconstructPast', () => {
  it('rebuilds a deep-time map from today’s continents', () => {
    const now = generateWorld(80, 40, 21, 0.4)
    const past = reconstructPast(now, 180)
    expect(past.width).toBe(now.width)
    expect(past.cities.length).toBe(0)
    expect(past.elev.length).toBe(now.elev.length)
    let land = 0
    for (let i = 0; i < past.elev.length; i++) if (past.elev[i] >= past.seaLevel) land++
    expect(land).toBeGreaterThan(40)
  })

  it('keeps the present map at age 0', () => {
    const now = generateWorld(64, 32, 8, 0.4)
    const copy = reconstructPast(now, 0)
    expect(copy.elev[10]).toBeCloseTo(now.elev[10])
    expect(copy.plateId[10]).toBe(now.plateId[10])
  })
})
