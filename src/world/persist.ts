/**
 * Save / load. The planet lives in RAM; this file turns it into JSON and back.
 *
 * serializeWorld   → a plain object you can JSON.stringify
 * deserializeWorld → arrays again. By default it *repairs* geography on load
 *                    (harmonizeWorld). Critique passes { repair: false } so it
 *                    can grade a broken save as broken.
 * autosaveWorld    → localStorage in THIS browser only. Another machine will
 *                    not see it. Use Save (download) to carry a file around.
 *
 * TypedArrays cannot go in JSON, so we convert them to number[].
 */
import type { World } from './types'
import { refreshGeography } from './geography'
import { landFraction } from './land'
import { clampContinentMass, DEFAULT_CONTINENT_MASS } from './mass'

const STORAGE_KEY = 'geoform.autosave.v1'

/** JSON on disk / in localStorage. TypedArrays become number[] because JSON cannot hold Float32Array. */
export interface SavedWorld {
  version: 1
  savedAt: string
  width: number
  height: number
  seed: number
  seaLevel: number
  plateCount: number
  plateId: number[]
  elev: number[]
  temp: number[]
  moist: number[]
  flux: number[]
  biome: string[]
  cities: World['cities']
  rawElevMin: number
  rawElevMax: number
  rawSeaThreshold: number
  engine: World['engine']
  originX?: number
  originY?: number
  latRows?: number
  landRatio?: number
  continentMass?: 'continents' | 'mixed' | 'islands'
  plateVx?: number[]
  plateVy?: number[]
}

/** Snapshot a World as JSON-friendly arrays. This is the Save file. */
export function serializeWorld(world: World): SavedWorld {
  return {
    version: 1,
    savedAt: new Date().toISOString(),
    width: world.width,
    height: world.height,
    seed: world.seed,
    seaLevel: world.seaLevel,
    plateCount: world.plateCount,
    plateId: Array.from(world.plateId),
    elev: Array.from(world.elev),
    temp: Array.from(world.temp),
    moist: Array.from(world.moist),
    flux: Array.from(world.flux),
    biome: world.biome.slice(),
    cities: world.cities.map((c) => ({ ...c })),
    rawElevMin: world.rawElevMin,
    rawElevMax: world.rawElevMax,
    rawSeaThreshold: world.rawSeaThreshold,
    engine: world.engine,
    originX: world.originX,
    originY: world.originY,
    latRows: world.latRows,
    landRatio: world.landRatio,
    continentMass: world.continentMass,
    plateVx: Array.from(world.plateVx),
    plateVy: Array.from(world.plateVy),
  }
}

/**
 * Turn a save file back into a World.
 * repair defaults to true (editor / autosave). Critique sets repair: false.
 */
export function deserializeWorld(data: SavedWorld, opts?: { repair?: boolean }): World {
  if (data.version !== 1) throw new Error(`Unsupported save version: ${data.version}`)
  const n = data.width * data.height
  if (data.elev.length !== n) throw new Error('Corrupt save: elevation size mismatch')

  const world: World = {
    width: data.width,
    height: data.height,
    seed: data.seed,
    seaLevel: data.seaLevel,
    plateId: Int16Array.from(data.plateId),
    elev: Float32Array.from(data.elev),
    temp: Float32Array.from(data.temp),
    moist: Float32Array.from(data.moist),
    flux: Float32Array.from(data.flux),
    biome: data.biome.slice(),
    suitability: new Float32Array(n),
    cities: data.cities.map((c) => ({ ...c })),
    plateCount: data.plateCount,
    rawElevMin: data.rawElevMin,
    rawElevMax: data.rawElevMax,
    rawSeaThreshold: data.rawSeaThreshold,
    engine: data.engine,
    originX: data.originX ?? 0,
    originY: data.originY ?? 0,
    latRows: data.latRows ?? data.height,
    landRatio: 0,
    continentMass: DEFAULT_CONTINENT_MASS,
    plateVx: Float32Array.from(data.plateVx ?? []),
    plateVy: Float32Array.from(data.plateVy ?? []),
  }
  world.landRatio = data.landRatio ?? landFraction(world.elev, world.seaLevel)
  world.continentMass = clampContinentMass(data.continentMass)
  if (opts?.repair !== false) refreshGeography(world, { sculpt: false })
  return world
}

/** Remember the map in this browser. Lost if you clear site data. */
export function autosaveWorld(world: World): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(serializeWorld(world)))
  } catch (err) {
    console.warn('Geoform autosave failed', err)
  }
}

/** Restore the last autosave from this browser, or null if there isn't one. */
export function loadAutosave(): World | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    return deserializeWorld(JSON.parse(raw) as SavedWorld)
  } catch (err) {
    console.warn('Geoform autosave load failed', err)
    return null
  }
}

export function clearAutosave(): void {
  localStorage.removeItem(STORAGE_KEY)
}

export function hasAutosave(): boolean {
  return localStorage.getItem(STORAGE_KEY) !== null
}

/** Trigger a browser download of geoform-seed-….json */
export function downloadWorld(world: World, filename?: string): void {
  const blob = new Blob([JSON.stringify(serializeWorld(world), null, 2)], {
    type: 'application/json',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename ?? `geoform-seed-${world.seed}.json`
  a.click()
  URL.revokeObjectURL(url)
}

/** Read a JSON file the user dropped or picked. Repairs unless you say not to. */
export async function readWorldFile(file: File): Promise<World> {
  const text = await file.text()
  return deserializeWorld(JSON.parse(text) as SavedWorld)
}
