import { describe, expect, it } from 'vitest'
import { generateWorld } from '../../src/world/generate'
import { suggestSettlements, suggestSettlementMix } from '../../src/world/settlements'
import {
  classifySeaCell,
  listPortIndices,
  routeBetweenPorts,
  suggestTradeRoutes,
} from '../../src/world/tradeRoutes'

describe('maritime trade routes', () => {
  it('classifies ocean cells by navigability', () => {
    const world = generateWorld(96, 48, 55, 0.4, 'continents')
    let open = 0
    let blocked = 0
    for (let y = 0; y < world.height; y++) {
      for (let x = 0; x < world.width; x++) {
        if (world.elev[y * world.width + x] >= world.seaLevel) continue
        const cls = classifySeaCell(world, x, y)
        if (cls === 'open') open++
        if (cls === 'blocked') blocked++
      }
    }
    expect(open).toBeGreaterThan(0)
    expect(blocked).toBeGreaterThan(0)
  })

  it('links coastal ports when seas connect', () => {
    let linked = false
    for (let seed = 1; seed < 50; seed++) {
      const world = generateWorld(96, 48, seed, 0.4, 'continents')
      world.cities = suggestSettlementMix(world)
      if (listPortIndices(world).length < 2) continue
      world.tradeRoutes = suggestTradeRoutes(world)
      if (world.tradeRoutes.length === 0) continue
      linked = true
      for (const route of world.tradeRoutes) {
        expect(route.waypoints.length).toBeGreaterThan(1)
        for (const p of route.waypoints) {
          expect(classifySeaCell(world, p.x, p.y)).not.toBe('blocked')
        }
      }
      break
    }
    expect(linked).toBe(true)
  })

  it('routes between two fishing ports when reachable', () => {
    const world = generateWorld(96, 48, 88, 0.4, 'continents')
    const ports = suggestSettlements(world, 'fishing', 3)
    world.cities = ports
    if (ports.length < 2) return
    const route = routeBetweenPorts(world, 0, 1)
    if (!route) return
    expect(route.waypoints[0]).toBeTruthy()
    expect(route.waypoints[route.waypoints.length - 1]).toBeTruthy()
  })

  it('treats ice and polar water as blocked or costly, not open', () => {
    const world = generateWorld(64, 32, 3, 0.4, 'continents')
    let polarOrBlocked = 0
    for (let x = 0; x < world.width; x++) {
      const cls = classifySeaCell(world, x, 0)
      if (world.elev[x] < world.seaLevel && (cls === 'blocked' || cls === 'polar')) polarOrBlocked++
    }
    expect(polarOrBlocked).toBeGreaterThan(0)
  })
})
