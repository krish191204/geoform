import { describe, expect, it } from 'vitest'
import { critiqueLiveWorld } from '../../src/critique/analyzeWorld'
import { applyAlternative, proposeAlternatives } from '../../src/world/alternatives'
import {
  recomputeClimate,
  recomputeDerived,
} from '../../src/world/climate'
import { generateWorld } from '../../src/world/generate'
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

describe('Donald bar · writer-plausible climate', () => {
  it('mid-latitude ridge casts a rain shadow (windward wetter than lee)', () => {
    const w = 48
    const h = 24
    const world = blankWorld(w, h, 0.4)
    // Mid-lat row (~y=6 → pole≈0.5) uses westerlies.
    const y = 6
    for (let yy = 4; yy < 10; yy++) {
      for (let x = 0; x < w; x++) world.elev[yy * w + x] = 0.52
      // Tall N–S ridge
      world.elev[yy * w + 20] = 0.9
      world.elev[yy * w + 21] = 0.92
      world.elev[yy * w + 22] = 0.9
    }
    // Ocean fetch to the west of the ridge
    for (let yy = 4; yy < 10; yy++) {
      for (let x = 0; x < 10; x++) world.elev[yy * w + x] = 0.2
    }
    recomputeClimate(world)
    const windward = world.moist[y * w + 18]
    const lee = world.moist[y * w + 26]
    expect(windward).toBeGreaterThan(lee + 0.04)
  })

  it('new worlds are not mostly ice+desert and keep living biomes', () => {
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
      expect(moistSum / land).toBeGreaterThan(0.2)
      expect(tempSum / land).toBeGreaterThan(0.28)
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

  it('ice↔warm-desert adjacency stays rare on generated continents', () => {
    for (const seed of [7, 42, 99]) {
      const world = generateWorld(96, 48, seed, 0.4, 'continents')
      const { width: w, height: h, elev, seaLevel, biome, temp } = world
      let bad = 0
      for (let y = 1; y < h - 1; y++) {
        for (let x = 0; x < w; x++) {
          const i = y * w + x
          if (elev[i] < seaLevel) continue
          const b = biome[i].toLowerCase()
          if (!b.includes('ice') && b !== 'tundra') continue
          for (const [dx, dy] of [
            [1, 0],
            [-1, 0],
            [0, 1],
            [0, -1],
          ] as const) {
            const j = y * w + ((x + dx + w) % w) + dy * 0
            const jj = (y + dy) * w + ((x + dx + w) % w)
            if (elev[jj] < seaLevel) continue
            const nb = biome[jj].toLowerCase()
            if (nb.includes('desert') && temp[jj] > 0.4) bad++
            void j
          }
        }
      }
      expect(bad).toBeLessThan(40)
    }
  })
})

describe('critique → alternatives pipeline', () => {
  it('critiqueLiveWorld grades a generated map and alternatives apply', () => {
    const world = generateWorld(64, 32, 11, 0.4, 'continents')
    const before = critiqueLiveWorld(world)
    expect(before.score).toBeGreaterThanOrEqual(0)
    expect(before.score).toBeLessThanOrEqual(100)
    const alts = proposeAlternatives(before)
    expect(alts.some((a) => a.kind === 'rebuild_climate')).toBe(true)
    const rebuild = alts.find((a) => a.kind === 'rebuild_climate')!
    applyAlternative(world, rebuild)
    let moistOk = false
    for (let i = 0; i < world.moist.length; i++) {
      if (world.elev[i] >= world.seaLevel && world.moist[i] > 0.05) moistOk = true
    }
    expect(moistOk).toBe(true)
  })

  it('soften ice↔desert alternative rebuilds derived fields', () => {
    const world = blankWorld(32, 16, 0.4)
    for (let y = 2; y < 14; y++) {
      for (let x = 2; x < 30; x++) world.elev[y * 32 + x] = 0.55
    }
    world.elev[8 * 32 + 10] = 0.88
    world.biome[8 * 32 + 10] = 'ice'
    world.biome[8 * 32 + 11] = 'desert'
    world.temp[8 * 32 + 11] = 0.6
    recomputeDerived(world, false)
    applyAlternative(world, {
      id: 't',
      title: 'Soften',
      why: 'test',
      kind: 'soften_ice_desert',
      issueIds: [],
    })
    expect(world.temp.some((t) => t > 0.2)).toBe(true)
  })
})
