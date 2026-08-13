import { describe, expect, it } from 'vitest'
import { chewStraightCoasts } from '../../src/world/coasts'
import { generateWorld } from '../../src/world/generate'
import { landFraction } from '../../src/world/land'

function innerLandFraction(world: ReturnType<typeof generateWorld>, inset = 0.15): number {
  const { width: w, height: h, elev, seaLevel } = world
  const x0 = Math.floor(w * inset)
  const x1 = Math.ceil(w * (1 - inset))
  const y0 = Math.floor(h * inset)
  const y1 = Math.ceil(h * (1 - inset))
  let land = 0
  let n = 0
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      n++
      if (elev[y * w + x] >= seaLevel) land++
    }
  }
  return n ? land / n : 0
}

function landBboxFill(world: ReturnType<typeof generateWorld>): number {
  const { width: w, height: h, elev, seaLevel } = world
  let minx = w
  let maxx = 0
  let miny = h
  let maxy = 0
  let land = 0
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (elev[y * w + x] < seaLevel) continue
      land++
      minx = Math.min(minx, x)
      maxx = Math.max(maxx, x)
      miny = Math.min(miny, y)
      maxy = Math.max(maxy, y)
    }
  }
  if (!land) return 0
  return land / ((maxx - minx + 1) * (maxy - miny + 1))
}

describe('generateWorld coasts', () => {
  it('keeps the land/water mix near the requested ratio', () => {
    const world = generateWorld(80, 40, 123, 0.4)
    const mix = landFraction(world.elev, world.seaLevel)
    expect(mix).toBeGreaterThan(0.25)
    expect(mix).toBeLessThan(0.55)
  })

  it('does not fill the interior with a solid rectangular continent', () => {
    for (const seed of [1, 12, 123, 999, 4242]) {
      const world = generateWorld(96, 48, seed, 0.4)
      const inner = innerLandFraction(world)
      expect(inner, `seed ${seed} inner fill`).toBeLessThan(0.78)
      expect(landBboxFill(world), `seed ${seed} bbox fill`).toBeLessThan(0.72)
      expect(landFraction(world.elev, world.seaLevel)).toBeGreaterThan(0.22)
    }
  })
})

describe('chewStraightCoasts', () => {
  it('breaks a painted land rectangle so the edge is no longer a wall', () => {
    const w = 40
    const h = 24
    const sea = 0.4
    const elev = new Float32Array(w * h)
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        elev[y * w + x] = x >= 8 && x <= 31 && y >= 6 && y <= 17 ? 0.7 : 0.2
      }
    }
    chewStraightCoasts(elev, w, h, sea, 7)
    chewStraightCoasts(elev, w, h, sea, 19)
    let edgeLand = 0
    let edge = 0
    for (let x = 8; x <= 31; x++) {
      for (const y of [6, 17]) {
        edge++
        if (elev[y * w + x] >= sea) edgeLand++
      }
    }
    expect(edgeLand / edge).toBeLessThan(0.9)
  })
})
