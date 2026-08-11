export type Layer =
  | 'relief'
  | 'plates'
  | 'elevation'
  | 'moisture'
  | 'temperature'
  | 'biome'
  | 'suitability'

export type Tool = 'raise' | 'lower' | 'city' | 'inspect'

/** WorldEngine Holdridge names + a few UI aliases */
export type Biome = string

export interface City {
  x: number
  y: number
  name: string
  score: number
}

export interface SuitabilityResult {
  score: number
  ok: boolean
  reasons: string[]
}

export interface World {
  width: number
  height: number
  seed: number
  seaLevel: number
  plateId: Int16Array
  elev: Float32Array
  temp: Float32Array
  moist: Float32Array
  flux: Float32Array
  biome: Biome[]
  suitability: Float32Array
  cities: City[]
  plateCount: number
  /** WorldEngine raw elevation calibration (for recompute) */
  rawElevMin: number
  rawElevMax: number
  rawSeaThreshold: number
  engine: 'worldengine' | 'local'
}

const FALLBACK_BIOME = '#6e7f6a'

/** Colors for WorldEngine biomes + simple aliases */
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
