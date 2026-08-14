import { describe, expect, it } from 'vitest'
import { generateWorld } from '../../src/world/generate'
import {
  gateCityPlacement,
  gateContinentPlacement,
  gatePresentEdit,
  gateRazeCity,
} from '../../src/world/placement'

describe('placement gates', () => {
  it('blocks cities on ocean and allows a land cell that scores well enough', () => {
    const world = generateWorld(96, 48, 11, 0.4, 'continents')
    let ocean = -1
    let land = -1
    for (let i = 0; i < world.elev.length; i++) {
      if (ocean < 0 && world.elev[i] < world.seaLevel) ocean = i
      if (land < 0 && world.elev[i] >= world.seaLevel + 0.05 && world.elev[i] < 0.7) land = i
      if (ocean >= 0 && land >= 0) break
    }
    expect(ocean).toBeGreaterThanOrEqual(0)
    expect(land).toBeGreaterThanOrEqual(0)

    const ox = ocean % world.width
    const oy = (ocean / world.width) | 0
    const oceanGate = gateCityPlacement(world, ox, oy)
    expect(oceanGate.ok).toBe(false)
    expect(oceanGate.hard).toBe(true)

    const lx = land % world.width
    const ly = (land / world.width) | 0
    // May be soft-fail (desert) but must not be "open ocean"
    const landGate = gateCityPlacement(world, lx, ly)
    expect(landGate.title).not.toMatch(/ocean/i)
  })

  it('blocks continent stamps on land and allows open ocean', () => {
    const world = generateWorld(96, 48, 17, 0.4, 'continents')
    let ocean = -1
    let land = -1
    for (let i = 0; i < world.elev.length; i++) {
      if (land < 0 && world.elev[i] >= world.seaLevel) land = i
      if (ocean < 0 && world.elev[i] < world.seaLevel) ocean = i
      if (ocean >= 0 && land >= 0) break
    }
    const lx = land % world.width
    const ly = (land / world.width) | 0
    const landGate = gateContinentPlacement(world, lx, ly, 'collision')
    expect(landGate.ok).toBe(false)
    expect(landGate.hard).toBe(true)

    // Prefer a deep-ocean cell with room around it
    let best = ocean
    let bestN = 0
    for (let i = 0; i < world.elev.length; i++) {
      if (world.elev[i] >= world.seaLevel) continue
      const x = i % world.width
      const y = (i / world.width) | 0
      if (y < 4 || y >= world.height - 4) continue
      let n = 0
      for (let dy = -3; dy <= 3; dy++) {
        for (let dx = -3; dx <= 3; dx++) {
          const nx = (x + dx + world.width) % world.width
          const ny = y + dy
          if (ny < 0 || ny >= world.height) continue
          if (world.elev[ny * world.width + nx] < world.seaLevel) n++
        }
      }
      if (n > bestN) {
        bestN = n
        best = i
      }
    }
    const ox = best % world.width
    const oy = (best / world.width) | 0
    const oceanGate = gateContinentPlacement(world, ox, oy, 'drift')
    expect(oceanGate.ok).toBe(true)
  })

  it('blocks raze when no city is nearby and blocks edits in deep time', () => {
    const world = generateWorld(64, 32, 3, 0.4, 'continents')
    const gate = gateRazeCity(world, 10, 10)
    expect(gate.ok).toBe(false)
    expect(gatePresentEdit(40)?.hard).toBe(true)
    expect(gatePresentEdit(0)).toBeNull()
  })
})
