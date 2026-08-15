import { describe, expect, it } from 'vitest'
import { plateBoundaryCue } from '../../src/render/draw'
import { generateWorld } from '../../src/world/generate'

describe('plates look cues', () => {
  it('marks plate sutures and finds converging contacts on a new world', () => {
    const world = generateWorld(96, 48, 42, 0.4, 'continents')
    let edges = 0
    let converging = 0
    let interiors = 0
    for (let y = 1; y < world.height - 1; y++) {
      for (let x = 0; x < world.width; x++) {
        const { edge, approach } = plateBoundaryCue(world, x, y)
        if (edge) {
          edges++
          if (approach > 0.02) converging++
        } else {
          interiors++
        }
      }
    }
    expect(edges).toBeGreaterThan(40)
    expect(interiors).toBeGreaterThan(edges)
    expect(converging).toBeGreaterThan(5)
  })

  it('high plate-edge land sits above nearby interior of the same plate', () => {
    const world = generateWorld(128, 64, 7, 0.4, 'continents')
    let edgeHigh = 0
    let samples = 0
    for (let y = 2; y < world.height - 2; y++) {
      for (let x = 0; x < world.width; x++) {
        const i = y * world.width + x
        if (world.elev[i] < world.seaLevel) continue
        const { edge, approach } = plateBoundaryCue(world, x, y)
        if (!edge || approach <= 0.02) continue
        // Compare to a same-plate interior neighbor a few cells away if available.
        let interiorElev = 0
        let found = false
        for (const [dx, dy] of [
          [3, 0],
          [-3, 0],
          [0, 3],
          [0, -3],
        ] as const) {
          const nx = (x + dx + world.width) % world.width
          const ny = y + dy
          if (ny < 0 || ny >= world.height) continue
          const ni = ny * world.width + nx
          if (world.plateId[ni] !== world.plateId[i]) continue
          if (world.elev[ni] < world.seaLevel) continue
          const cue = plateBoundaryCue(world, nx, ny)
          if (cue.edge) continue
          interiorElev = world.elev[ni]
          found = true
          break
        }
        if (!found) continue
        samples++
        if (world.elev[i] >= interiorElev - 0.02) edgeHigh++
      }
    }
    expect(samples).toBeGreaterThan(10)
    expect(edgeHigh / samples).toBeGreaterThan(0.45)
  })
})
