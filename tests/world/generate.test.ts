import { describe, expect, it } from 'vitest'
import { generateWorld } from '../../src/world/generate'
import { landFraction } from '../../src/world/land'

describe('generateWorld coasts', () => {
  it('keeps the rectangular frame mostly ocean instead of a filled land block', () => {
    const world = generateWorld(80, 40, 123, 0.4)
    const { width: w, height: h, elev, seaLevel } = world
    let borderLand = 0
    let border = 0
    for (let x = 0; x < w; x++) {
      for (const y of [0, h - 1]) {
        border++
        if (elev[y * w + x] >= seaLevel) borderLand++
      }
    }
    for (let y = 1; y < h - 1; y++) {
      for (const x of [0, w - 1]) {
        border++
        if (elev[y * w + x] >= seaLevel) borderLand++
      }
    }
    expect(borderLand / border).toBeLessThan(0.35)
    expect(landFraction(elev, seaLevel)).toBeGreaterThan(0.25)
    expect(landFraction(elev, seaLevel)).toBeLessThan(0.55)
  })
})
