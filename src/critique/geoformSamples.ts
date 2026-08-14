/**
 * Built-in Geoform worlds for the critique gallery.
 * healthy  = a normal generated map (should score well).
 * broken   = we vandalize height on purpose (rectangle, all-land slab, speckle)
 *            so you can see the grader catch it. Repair runs the editor pipeline.
 */
/**
 * Built-in Geoform worlds for the critique gallery.
 * healthy  = a normal generated map (should score well).
 * broken   = we vandalize height on purpose (rectangle, all-land slab, speckle)
 *            so you can see the grader catch it. Repair runs the editor pipeline.
 */
import { generateWorld } from '../world/generate'
import { harmonizeWorld } from '../world/geography'
import { serializeWorld } from '../world/persist'
import type { World } from '../world/types'

export interface GeoformSample {
  id: string
  title: string
  blurb: string
  kind: 'healthy' | 'broken'
  world: World
}

/** Stamp a green rectangle in the ocean — the "this is not a continent" fixture. */
function rectangleWorld(): World {
  const world = generateWorld(96, 48, 7, 0.4, 'continents')
  world.elev.fill(world.seaLevel - 0.12)
  for (let y = 10; y <= 36; y++) {
    for (let x = 18; x <= 74; x++) world.elev[y * 96 + x] = 0.72
  }
  world.temp.fill(0)
  world.moist.fill(0)
  world.flux.fill(0)
  return world
}

/** All land, no ocean — climate left dead on purpose. */
function slabWorld(): World {
  const world = generateWorld(96, 48, 9, 0.4, 'continents')
  world.elev.fill(0.7)
  world.temp.fill(0)
  world.moist.fill(0)
  return world
}

/** Island-world speckle at low land % — looks like acne if you wanted continents. */
function speckleWorld(): World {
  const world = generateWorld(96, 48, 21, 0.22, 'islands')
  return world
}

/** The gallery list: two healthy worlds plus three vandalized ones. */
export function getGeoformSamples(): GeoformSample[] {
  return [
    {
      id: 'gf-continents',
      title: 'Full continents',
      blurb: 'Local atlas at 40% land — a few large masses, climate already run.',
      kind: 'healthy',
      world: generateWorld(96, 48, 21, 0.4, 'continents'),
    },
    {
      id: 'gf-islands',
      title: 'Island world',
      blurb: 'Same seed as islands on purpose. Speckles are allowed here.',
      kind: 'healthy',
      world: generateWorld(96, 48, 21, 0.4, 'islands'),
    },
    {
      id: 'gf-wet-continents',
      title: 'Wet continents',
      blurb: '22% land, Full continents — still clumps, not mountain-peak islands.',
      kind: 'healthy',
      world: generateWorld(96, 48, 3, 0.22, 'continents'),
    },
    {
      id: 'gf-rectangle',
      title: 'Stamped rectangle',
      blurb: 'A box of land in the sea, climate never run — what the editor now repairs.',
      kind: 'broken',
      world: rectangleWorld(),
    },
    {
      id: 'gf-slab',
      title: 'All-land slab',
      blurb: '100% land, dead weather. The teal UI around a canvas is not ocean.',
      kind: 'broken',
      world: slabWorld(),
    },
    {
      id: 'gf-speckle-ask',
      title: 'Asked for islands',
      blurb: 'Archipelago at 22% land. Fine if Landmass is Island world.',
      kind: 'healthy',
      world: speckleWorld(),
    },
  ]
}

export function worldToJson(world: World) {
  return serializeWorld(world)
}

/** Run the same silent repair the editor uses. Does not mutate the gallery original. */
export function repairedCopy(world: World): World {
  const copy = {
    ...world,
    elev: Float32Array.from(world.elev),
    temp: Float32Array.from(world.temp),
    moist: Float32Array.from(world.moist),
    flux: Float32Array.from(world.flux),
    biome: world.biome.slice(),
    suitability: Float32Array.from(world.suitability),
    plateId: Int16Array.from(world.plateId),
    plateVx: Float32Array.from(world.plateVx),
    plateVy: Float32Array.from(world.plateVy),
    cities: world.cities.map((c) => ({ ...c })),
  }
  harmonizeWorld(copy, { sculpt: false })
  return copy
}
