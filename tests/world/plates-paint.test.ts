import { describe, expect, it } from 'vitest'
import { generateWorld } from '../../src/world/generate'
import { brushRaise, brushSeaLevel, syncPlatesUnderBrush } from '../../src/world/tools'

describe('syncPlatesUnderBrush', () => {
  it('claims new land for the nearby continental plate', () => {
    const world = generateWorld(96, 48, 11, 0.4, 'continents')
    // Find a coastal ocean cell next to land.
    let ox = -1
    let oy = -1
    let landPlate = -1
    outer: for (let y = 2; y < world.height - 2; y++) {
      for (let x = 0; x < world.width; x++) {
        const i = y * world.width + x
        if (world.elev[i] >= world.seaLevel) continue
        for (const [dx, dy] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ] as const) {
          const nx = (x + dx + world.width) % world.width
          const ny = y + dy
          const ni = ny * world.width + nx
          if (world.elev[ni] < world.seaLevel) continue
          ox = x
          oy = y
          landPlate = world.plateId[ni]
          break outer
        }
      }
    }
    expect(ox).toBeGreaterThanOrEqual(0)
    brushSeaLevel(world, ox, oy, 4, false, 1, 0.7)
    syncPlatesUnderBrush(world, ox, oy, 4, 0.7)
    expect(world.elev[oy * world.width + ox]).toBeGreaterThanOrEqual(world.seaLevel)
    expect(world.plateId[oy * world.width + ox]).toBe(landPlate)
  })

  it('raise on existing land pulls the suture toward the brush plate', () => {
    const world = generateWorld(96, 48, 42, 0.4, 'continents')
    let bx = -1
    let by = -1
    let claim = -1
    let other = -1
    outer: for (let y = 2; y < world.height - 2; y++) {
      for (let x = 0; x < world.width; x++) {
        const i = y * world.width + x
        if (world.elev[i] < world.seaLevel) continue
        const p = world.plateId[i]
        const nx = (x + 1) % world.width
        const ni = y * world.width + nx
        if (world.elev[ni] < world.seaLevel) continue
        if (world.plateId[ni] === p) continue
        bx = x
        by = y
        claim = p
        other = world.plateId[ni]
        break outer
      }
    }
    expect(bx).toBeGreaterThanOrEqual(0)
    expect(claim).not.toBe(other)
    brushRaise(world, bx, by, 5, 0.08, 0.8)
    syncPlatesUnderBrush(world, bx, by, 5, 0.8)
    const mid = by * world.width + ((bx + 1) % world.width)
    expect(world.plateId[mid]).toBe(claim)
  })
})
