import { describe, expect, it } from 'vitest'
import { createEmptySeaWorld } from '../../src/world/generate'
import { harmonizeToGeography } from '../../src/world/harmonize'
import { landFraction } from '../../src/world/land'

describe('empty sea → make sense', () => {
  it('createEmptySeaWorld is almost all ocean', () => {
    const w = createEmptySeaWorld(64, 32, 7)
    expect(landFraction(w.elev, w.seaLevel)).toBeLessThan(0.02)
    expect(w.planetRadiusKm).toBe(6371)
  })

  it('harmonizeToGeography keeps sketched land roughly and fills climate', () => {
    const w = createEmptySeaWorld(48, 24, 3)
    // Paint a blob
    for (let y = 8; y < 16; y++) {
      for (let x = 10; x < 30; x++) w.elev[y * 48 + x] = 0.55
    }
    w.elev[12 * 48 + 20] = 0.9
    const landBefore = landFraction(w.elev, w.seaLevel)
    const { applied } = harmonizeToGeography(w)
    expect(applied.length).toBeGreaterThan(2)
    expect(landFraction(w.elev, w.seaLevel)).toBeGreaterThan(landBefore * 0.5)
    expect(w.temp.some((t) => t > 0.2)).toBe(true)
  })
})
