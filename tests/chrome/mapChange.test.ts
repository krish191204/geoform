import { describe, expect, it } from 'vitest'
import { diffWorld, snapshotWorld, type WorldSnapshot } from '../../src/chrome/mapChange'
import { RIVER_VISIBLE_MIN } from '../../src/world/climate'
import type { World } from '../../src/world/types'

function blank(width = 20, height = 10): World {
  const n = width * height
  return {
    width,
    height,
    seed: 1,
    seaLevel: 0.4,
    landRatio: 0.4,
    continentMass: 'continents',
    plateId: new Int16Array(n),
    elev: new Float32Array(n).fill(0.2),
    temp: new Float32Array(n).fill(0.5),
    moist: new Float32Array(n).fill(0.4),
    flux: new Float32Array(n),
    biome: Array.from({ length: n }, () => 'ocean'),
    suitability: new Float32Array(n),
    cities: [],
    tradeRoutes: [],
    plateCount: 1,
    plateVx: new Float32Array([0]),
    plateVy: new Float32Array([0]),
    rawElevMin: 0,
    rawElevMax: 1,
    rawSeaThreshold: 0.4,
    engine: 'local',
    originX: 0,
    originY: 0,
    latRows: height,
  }
}

describe('map change copy', () => {
  it('reports land and river growth in plain English', () => {
    const w = blank()
    for (let i = 0; i < 40; i++) {
      w.elev[i] = 0.7
      w.biome[i] = 'grassland'
    }
    const before = snapshotWorld(w)
    for (let i = 40; i < 80; i++) {
      w.elev[i] = 0.75
      w.biome[i] = 'forest'
      w.flux[i] = RIVER_VISIBLE_MIN + 1
    }
    const after = snapshotWorld(w)
    const lines = diffWorld(before, after)
    expect(lines.some((s) => /Land grew/i.test(s))).toBe(true)
    expect(lines.some((s) => /Rivers grew/i.test(s))).toBe(true)
    expect(lines.some((s) => /forest/i.test(s))).toBe(true)
  })

  it('says land/water unchanged when the mix did not move', () => {
    const before: WorldSnapshot = {
      landPct: 40,
      oceanPct: 60,
      riverCells: 10,
      mainRivers: 2,
      peak: 0.7,
      landMoist: 0.4,
      landTemp: 0.5,
      cities: 0,
      biomes: { grassland: 50 },
    }
    const after = { ...before, riverCells: 11, biomes: { grassland: 50 } }
    const lines = diffWorld(before, after)
    expect(lines[0]).toMatch(/unchanged/)
  })
})
