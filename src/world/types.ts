/**
 * The shape of a planet in RAM.
 *
 * Start here if you are lost. A World is not a picture. It is a pile of
 * arrays the same length as width * height. The canvas is just a drawing
 * of these numbers.
 *
 * Cell (x, y) lives at index:  y * width + x
 * Walk off the right edge and you wrap to the left (a cylinder).
 * Do not wrap top/bottom — those are poles.
 *
 * Longer tour: HOW_IT_WORKS.md at the repo root.
 */

/** Which coloring the atlas canvas uses. Relief = pretty shaded land. */
export type Layer =
  | 'relief'
  | 'plates'
  | 'elevation'
  | 'moisture'
  | 'temperature'
  | 'biome'
  | 'suitability'

/** What the mouse does when you click the map. */
export type Tool =
  | 'raise'
  | 'lower'
  | 'smooth'
  | 'ridge'
  | 'channel'
  | 'plateau'
  | 'sea'
  | 'land'
  | 'city'
  | 'razecity'
  | 'inspect'
  | 'continent'

/** A biome is just a label like "ocean" or "tropical rain forest". */
export type Biome = string

export interface City {
  x: number
  y: number
  name: string
  /** 0 = terrible place to live, 1 = great. */
  score: number
}

/** Settlement viability — not one ideal biome, but can vs cannot. */
export type SuitabilityTier = 'blocked' | 'marginal' | 'favorable'

/** Why a cell can or cannot host a city. */
export interface SuitabilityResult {
  score: number
  /** True when tier is marginal or favorable (can place without Shift). */
  ok: boolean
  tier: SuitabilityTier
  reasons: string[]
}

export interface World {
  /** Cells across (longitude). Typical: 320. */
  width: number
  /** Cells down (latitude). Typical: 160. */
  height: number
  /** Random number that built this planet. Same seed → same new world. */
  seed: number
  /**
   * The water line. Height below this is ocean. Height above is land.
   * Usually around 0.34 after we pick a land/water mix.
   */
  seaLevel: number
  /**
   * Wish, not a measurement: "I want this fraction of cells to be land."
   * 0.40 means 40% land. The slider writes this. Repair tries to honor it
   * by growing or shrinking existing coasts — not by sprinkling islands.
   */
  landRatio: number
  /**
   * How land should clump.
   * continents = 2–3 big blobs (Earth look). Speckles get drowned.
   * mixed      = a few big ones plus leftovers.
   * islands    = keep the speckles. Only this mode wants archipelagos.
   */
  continentMass: 'continents' | 'mixed' | 'islands'
  /** Which tectonic plate owns each cell. Integer ids, 0..plateCount-1. */
  plateId: Int16Array
  /** Ground height per cell, 0 (deep sea) to 1 (huge mountain). */
  elev: Float32Array
  /** How warm, 0 cold … 1 hot. Equator hot, poles cold, mountains colder. */
  temp: Float32Array
  /** How wet the climate thinks this cell is. Ocean is always wet. */
  moist: Float32Array
  /** How much river water tries to flow through this cell. Fat rivers = high flux. */
  flux: Float32Array
  /** One biome name per cell, derived from height + temp + rain. */
  biome: Biome[]
  /** How good this cell is for a city. Same 0..1 idea as City.score. */
  suitability: Float32Array
  cities: City[]
  plateCount: number
  /** How fast each plate slides, in cells per million years. */
  plateVx: Float32Array
  plateVy: Float32Array
  /** WorldEngine-only: original height range so we can send edits back. */
  rawElevMin: number
  rawElevMax: number
  rawSeaThreshold: number
  /**
   * Which generator made this map.
   * local       = this repo's TypeScript (the default).
   * worldengine = optional WASM/Python backend. Ignore until Local makes sense.
   */
  engine: 'worldengine' | 'local'
  /**
   * World-space origin of cell (0,0). When you zoom out we add cells around
   * the map, so the old (0,0) is no longer the corner. originX/Y remember that.
   */
  originX: number
  originY: number
  /**
   * How many rows "full planet latitude" uses. Frozen at generate so zoom-out
   * padding does not suddenly restyle climate (equator would jump).
   */
  latRows: number
}

const FALLBACK_BIOME = '#6e7f6a'

/** Paint-by-numbers colors for WorldEngine biome names, plus short aliases (forest, desert). */
export const BIOME_COLORS: Record<string, string> = {
  ocean: '#1f5f74',
  coast: '#3d8a9a',
  ice: '#e8f0f4',
  'polar desert': '#dce3e6',
  'subpolar dry tundra': '#b7c4b0',
  'subpolar moist tundra': '#a8b8a4',
  'subpolar wet tundra': '#9aaf96',
  'subpolar rain tundra': '#8ba688',
  'boreal desert': '#c4b89a',
  'boreal dry scrub': '#9aaa78',
  'boreal moist forest': '#4f6b52',
  'boreal wet forest': '#3f5f44',
  'boreal rain forest': '#35583c',
  'cool temperate desert': '#d4b483',
  'cool temperate desert scrub': '#c4a86e',
  'cool temperate steppe': '#8fad5f',
  'cool temperate moist forest': '#3d6b45',
  'cool temperate wet forest': '#345c3c',
  'cool temperate rain forest': '#2c5240',
  'warm temperate desert': '#d9bc8a',
  'warm temperate desert scrub': '#c9ac72',
  'warm temperate thorn scrub': '#b89a5c',
  'warm temperate dry forest': '#5a8a4a',
  'warm temperate moist forest': '#3d6b45',
  'warm temperate wet forest': '#2f5a3a',
  'warm temperate rain forest': '#264d36',
  'subtropical desert': '#d4b483',
  'subtropical desert scrub': '#c4a35a',
  'subtropical thorn woodland': '#b8974e',
  'subtropical dry forest': '#6a9a4a',
  'subtropical moist forest': '#3d7a4a',
  'subtropical wet forest': '#2f6a42',
  'subtropical rain forest': '#1f5a3a',
  'tropical desert': '#d8b67a',
  'tropical desert scrub': '#c4a35a',
  'tropical thorn woodland': '#b8974e',
  'tropical dry forest': '#6a9a4a',
  'tropical very dry forest': '#7aa050',
  'tropical moist forest': '#2d6b48',
  'tropical wet forest': '#1f5a3e',
  'tropical rain forest': '#1f4d38',
  // legacy simple names
  tundra: '#b7c4b0',
  taiga: '#4f6b52',
  grassland: '#8fad5f',
  forest: '#3d6b45',
  rainforest: '#1f4d38',
  savanna: '#c4a35a',
  desert: '#d4b483',
  alpine: '#8a8f8c',
}

/** Look up a biome color. Unknown names get a fuzzy match, then grey-green. */
export function biomeColor(name: string): string {
  if (BIOME_COLORS[name]) return BIOME_COLORS[name]
  // fuzzy fallbacks
  if (name.includes('ocean')) return BIOME_COLORS.ocean
  if (name.includes('ice')) return BIOME_COLORS.ice
  if (name.includes('desert')) return BIOME_COLORS.desert
  if (name.includes('rain forest') || name.includes('rainforest')) return BIOME_COLORS.rainforest
  if (name.includes('forest')) return BIOME_COLORS.forest
  if (name.includes('tundra')) return BIOME_COLORS.tundra
  if (name.includes('steppe') || name.includes('grass')) return BIOME_COLORS.grassland
  if (name.includes('scrub') || name.includes('thorn') || name.includes('savanna'))
    return BIOME_COLORS.savanna
  return FALLBACK_BIOME
}

/** JSON shape WorldEngine sends over /api. Converted in worldengine.ts. */
export interface WorldEnginePayload {
  engine: string
  width: number
  height: number
  seed: number
  seaLevel: number
  plateCount: number
  elev: number[]
  plateId: number[]
  temp: number[]
  moist: number[]
  flux: number[]
  biome: string[]
  rawElevMin: number
  rawElevMax: number
  rawSeaThreshold: number
}
