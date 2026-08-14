import { describe, expect, it } from 'vitest'
import { expandWorld, MAX_WORLD_HEIGHT, MAX_WORLD_WIDTH, padsForZoomOut } from '../../src/world/expand'
import { EditHistory } from '../../src/world/history'
import type { World } from '../../src/world/types'

function miniWorld(width = 16, height = 8): World {
  const n = width * height
  const elev = new Float32Array(n)
  const plateId = new Int16Array(n)
  elev.fill(0.2)
  const peak = (height / 2) * width + (width / 2 | 0)
  elev[peak] = 0.72
  return {
    width,
    height,
    seed: 42,
    seaLevel: 0.44,
    plateId,
    elev,
    temp: new Float32Array(n),
    moist: new Float32Array(n),
    flux: new Float32Array(n),
    biome: Array.from({ length: n }, () => 'ocean'),
    suitability: new Float32Array(n),
    cities: [{ x: 8, y: 4, name: 'Peak', score: 0.8 }],
    tradeRoutes: [],
    plateCount: 1,
    rawElevMin: 0,
    rawElevMax: 1,
    rawSeaThreshold: 0.44,
    engine: 'local',
    originX: 0,
    originY: 0,
    latRows: height,
    landRatio: 0.4,
    continentMass: 'continents',
    plateVx: new Float32Array([0.2]),
    plateVy: new Float32Array([0.05]),
  }
}

describe('padsForZoomOut', () => {
  it('adds cells biased toward the cursor', () => {
    const world = miniWorld()
    const pads = padsForZoomOut(world, 0.92, 0.25, 0.75)
    expect(pads).not.toBeNull()
    expect(pads!.left + pads!.right).toBeGreaterThan(0)
    expect(pads!.top + pads!.bottom).toBeGreaterThan(0)
    expect(pads!.left).toBeLessThan(pads!.right)
    expect(pads!.top).toBeGreaterThan(pads!.bottom)
  })

  it('returns null when the atlas is already at the size cap', () => {
    const world = miniWorld(MAX_WORLD_WIDTH, MAX_WORLD_HEIGHT)
    expect(padsForZoomOut(world, 0.92, 0.5, 0.5)).toBeNull()
  })

  it('adds height when the viewport is taller than the atlas', () => {
    const world = miniWorld(32, 8)
    const pads = padsForZoomOut(world, 0.92, 0.5, 0.5, 400, 400)
    expect(pads).not.toBeNull()
    const extraW = pads!.left + pads!.right
    const extraH = pads!.top + pads!.bottom
    expect(extraH).toBeGreaterThan(extraW)
    const aspect = (world.width + extraW) / (world.height + extraH)
    expect(aspect).toBeGreaterThan(0.7)
    expect(aspect).toBeLessThan(1.4)
  })
})

describe('expandWorld', () => {
  it('copies existing land, shifts cities, and moves the origin', () => {
    const world = miniWorld()
    const ok = expandWorld(world, 3, 5, 2, 4)
    expect(ok).toBe(true)
    expect(world.width).toBe(24)
    expect(world.height).toBe(14)
    expect(world.originX).toBe(-3)
    expect(world.originY).toBe(-2)
    expect(world.cities[0]).toMatchObject({ x: 11, y: 6 })
    const copied = world.elev[(2 + 4) * world.width + (3 + 8)]
    expect(copied).toBeGreaterThan(0.5)
  })

  it('refuses to grow past the size cap', () => {
    const world = miniWorld(MAX_WORLD_WIDTH - 2, 8)
    expect(expandWorld(world, 0, 4, 0, 0)).toBe(false)
    expect(world.width).toBe(MAX_WORLD_WIDTH - 2)
  })
})

describe('history across expand', () => {
  it('restores the previous grid size on undo', () => {
    const world = miniWorld()
    const history = new EditHistory()
    history.push(world, 'Expand map')
    expandWorld(world, 2, 2, 1, 1)
    expect(world.width).toBe(20)
    history.undo(world)
    expect(world.width).toBe(16)
    expect(world.height).toBe(8)
    expect(world.originX).toBe(0)
    expect(world.cities[0]).toMatchObject({ x: 8, y: 4 })
  })
})
