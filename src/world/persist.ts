import type { World } from './types'
import { recomputeSuitability } from './climate'

const STORAGE_KEY = 'geoform.autosave.v1'

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
}

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
  }
}

export function deserializeWorld(data: SavedWorld): World {
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
  }
  recomputeSuitability(world)
  return world
}

export function autosaveWorld(world: World): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(serializeWorld(world)))
  } catch (err) {
    console.warn('Geoform autosave failed', err)
  }
}

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

export async function readWorldFile(file: File): Promise<World> {
  const text = await file.text()
  return deserializeWorld(JSON.parse(text) as SavedWorld)
}
