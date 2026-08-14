/**
 * A checklist of "this cannot happen on a planet."
 *
 * The editor no longer nags with this. It silently repairs instead
 * (see geography.ts). Critique still uses these flags to grade a map
 * you *wanted* to leave broken.
 *
 * Speckle = tiny island. Rectangle = land fills its bounding box like a stamp.
 * Dead climate = temp/rain still zero because weather never ran.
 */
import { landBboxFill, landmassStats, type ContinentMass } from './mass'
import type { World } from './types'

export type FlagSeverity = 'impossible' | 'unlikely' | 'note'

export interface GeoFlag {
  id: string
  severity: FlagSeverity
  title: string
  detail: string
}

/** Average land temperature in a band of rows. Used to catch "poles hotter than equator." */
function meanLandTemp(world: World, y0: number, y1: number): number | null {
  const { width: w, elev, seaLevel, temp } = world
  let s = 0
  let n = 0
  for (let y = y0; y < y1; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x
      if (elev[i] < seaLevel) continue
      s += temp[i]
      n++
    }
  }
  return n ? s / n : null
}

/** Count fat river cells that have no downhill neighbor (water climbing a hill). */
function riversClimb(world: World): { count: number; x: number; y: number } {
  const { width: w, height: h, elev, seaLevel, flux } = world
  let maxFlux = 0
  for (let i = 0; i < flux.length; i++) maxFlux = Math.max(maxFlux, flux[i])
  const cutoff = maxFlux * 0.12
  let count = 0
  let worst = 0
  let wx = 0
  let wy = 0
  const dirs = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ]
  for (let y = 1; y < h - 1; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x
      if (elev[i] < seaLevel || flux[i] < cutoff) continue
      let best = elev[i]
      for (const [dx, dy] of dirs) {
        const nx = ((x + dx) % w + w) % w
        const ny = y + dy
        best = Math.min(best, elev[ny * w + nx])
      }
      if (elev[i] - best < 1e-5) {
        count++
        if (flux[i] > worst) {
          worst = flux[i]
          wx = x
          wy = y
        }
      }
    }
  }
  return { count, x: wx, y: wy }
}

/** Call out geography that cannot happen on a planet with weather and plates. */
export function flagImpossibleGeography(world: World, mass?: ContinentMass): GeoFlag[] {
  const flags: GeoFlag[] = []
  const want = mass ?? world.continentMass
  const stats = landmassStats(world)

  if (stats.landCells < 12) {
    flags.push({
      id: 'no-land',
      severity: 'impossible',
      title: 'There is no continent',
      detail: 'Almost no land sits above sea level. Raise some ground or flood less water.',
    })
  } else if (stats.landCells / Math.max(1, world.width * world.height) > 0.9) {
    flags.push({
      id: 'no-ocean',
      severity: 'impossible',
      title: 'No ocean — that rectangle is the whole planet',
      detail: `${Math.round((stats.landCells / (world.width * world.height)) * 100)}% of cells are land. The teal around the atlas is empty UI, not water. Flood coasts or hit New world.`,
    })
  } else if (want === 'continents' && stats.speckleShare > 0.28) {
    flags.push({
      id: 'pimples',
      severity: 'impossible',
      title: 'Green pimples on a blue ocean',
      detail: `${Math.round(stats.speckleShare * 100)}% of the land is speckle islands. Full continents need a few large masses — switch to Island world if that is the point, or paint bigger land.`,
    })
  } else if (want === 'continents' && stats.largestShare < 0.22 && stats.components > 12) {
    flags.push({
      id: 'shattered',
      severity: 'unlikely',
      title: 'Land is shattered',
      detail: `${stats.components} separate scraps, none of them a real continent. Merge them or pick Island world.`,
    })
  }

  if (want === 'islands' && stats.largestShare > 0.72 && stats.components < 4) {
    flags.push({
      id: 'not-islands',
      severity: 'note',
      title: 'This is a continent, not an island world',
      detail: 'One mass holds most of the land. Fine if you changed your mind — otherwise break it up.',
    })
  }

  const fill = landBboxFill(world)
  if (fill > 0.8 && stats.landCells > 40 && stats.components <= 4) {
    flags.push({
      id: 'rectangle',
      severity: 'impossible',
      title: 'Straight walls are not coasts',
      detail: `${Math.round(fill * 100)}% of the land’s bounding box is filled. Real plates do not stamp rectangles in the middle of the sea.`,
    })
  }

  const h = world.height
  const eq = meanLandTemp(world, Math.floor(h * 0.4), Math.ceil(h * 0.6))
  const north = meanLandTemp(world, 0, Math.max(1, Math.floor(h * 0.18)))
  const south = meanLandTemp(world, Math.floor(h * 0.82), h)
  const polar = north != null && south != null ? (north + south) / 2 : (north ?? south)
  if (eq != null && polar != null && polar > eq + 0.08) {
    flags.push({
      id: 'hot-poles',
      severity: 'impossible',
      title: 'Poles are hotter than the equator',
      detail: 'Air cools toward the poles and with height. Refresh climate so weather follows the land.',
    })
  }

  let tMax = 0
  for (let i = 0; i < world.temp.length; i++) tMax = Math.max(tMax, world.temp[i])
  if (stats.landCells > 20 && tMax < 0.05) {
    flags.push({
      id: 'dead-climate',
      severity: 'impossible',
      title: 'Weather never ran',
      detail: 'Temperature and rain are still zero. Refresh climate so physics follows the land.',
    })
  }

  const climb = riversClimb(world)
  const landFrac = stats.landCells / Math.max(1, world.width * world.height)
  if (landFrac < 0.88 && climb.count > 12) {
    flags.push({
      id: 'climbing-rivers',
      severity: 'impossible',
      title: 'Rivers climbing uphill',
      detail: `Water at ${climb.x}, ${climb.y} has nowhere downhill to go. Refresh climate so rivers drain.`,
    })
  }

  for (const c of world.cities) {
    if (c.x < 0 || c.y < 0 || c.x >= world.width || c.y >= world.height) continue
    if (world.elev[c.y * world.width + c.x] < world.seaLevel) {
      flags.push({
        id: `city-ocean-${c.name}`,
        severity: 'impossible',
        title: `${c.name} is in the drink`,
        detail: 'Cities do not found themselves on open ocean. Move it or raise the seafloor.',
      })
    }
  }

  if (flags.length === 0) {
    flags.push({
      id: 'ok',
      severity: 'note',
      title: 'Geography is following the land',
      detail: 'Plates, rivers, and climate rebuilt from this heightfield. Paint what you want — this panel calls out what cannot happen.',
    })
  }

  return flags
}
