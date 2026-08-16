/**
 * Python science backend: Mindwerks WorldEngine behind /api.
 *
 * Default when /health is up (see main.ts boot). TypeScript still owns paint
 * and instant climate preview. If the API is down, Local (generate.ts) takes over.
 *
 * worldFromPayload copies JSON grids into our World shape.
 * fetchWorldEngineWorld asks the server for a new map.
 * recomputeWorldEngine sends painted heights back for climate (stroke end only).
 */
import type { World, WorldEnginePayload } from './types'
import { recomputeSuitability } from './climate'
import { ensurePlateMotion } from './geography'
import { landFraction } from './land'
import { DEFAULT_CONTINENT_MASS } from './mass'

/** Copy a WorldEngine JSON payload into our in-memory World. */
export function worldFromPayload(
  payload: WorldEnginePayload,
  keepCities: World['cities'] = [],
  frame?: {
    originX: number
    originY: number
    latRows: number
    landRatio?: number
    plateVx?: Float32Array
    plateVy?: Float32Array
  },
): World {
  const n = payload.width * payload.height
  const world: World = {
    width: payload.width,
    height: payload.height,
    seed: payload.seed,
    seaLevel: payload.seaLevel,
    landRatio: 0,
    plateId: Int16Array.from(payload.plateId),
    elev: Float32Array.from(payload.elev),
    temp: Float32Array.from(payload.temp),
    moist: Float32Array.from(payload.moist),
    flux: Float32Array.from(payload.flux),
    biome: payload.biome.slice(),
    suitability: new Float32Array(n),
    cities: keepCities.filter(
      (c) => c.x >= 0 && c.y >= 0 && c.x < payload.width && c.y < payload.height,
    ),
    tradeRoutes: [],
    plateCount: payload.plateCount,
    plateVx: frame?.plateVx ? new Float32Array(frame.plateVx) : new Float32Array(0),
    plateVy: frame?.plateVy ? new Float32Array(frame.plateVy) : new Float32Array(0),
    rawElevMin: payload.rawElevMin,
    rawElevMax: payload.rawElevMax,
    rawSeaThreshold: payload.rawSeaThreshold,
    engine: 'worldengine',
    originX: frame?.originX ?? 0,
    originY: frame?.originY ?? 0,
    latRows: frame?.latRows ?? payload.height,
    continentMass: DEFAULT_CONTINENT_MASS,
    planetRadiusKm: 6371,
  }
  world.landRatio = frame?.landRatio ?? landFraction(world.elev, world.seaLevel)
  ensurePlateMotion(world)
  recomputeSuitability(world)
  return world
}

/** Ask the optional backend for a brand-new map. Throws if the API is down. */
export async function fetchWorldEngineWorld(
  seed: number,
  width: number,
  height: number,
  numPlates = 10,
): Promise<World> {
  const res = await fetch('/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ seed, width, height, numPlates }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(err.error || `WorldEngine generate failed (${res.status})`)
  }
  const payload = (await res.json()) as WorldEnginePayload
  return worldFromPayload(payload)
}

/** Send painted heights to WorldEngine and get climate/rivers/biomes back. */
export async function recomputeWorldEngine(world: World): Promise<World> {
  // Keep the exact heights the user painted — Python may erode / re-normalize.
  const paintedElev = Float32Array.from(world.elev)
  const res = await fetch('/api/recompute', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      seed: world.seed,
      width: world.width,
      height: world.height,
      elev: Array.from(world.elev),
      plateId: Array.from(world.plateId),
      seaLevel: world.seaLevel,
      rawElevMin: world.rawElevMin,
      rawElevMax: world.rawElevMax,
      rawSeaThreshold: world.rawSeaThreshold,
    }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(err.error || `WorldEngine recompute failed (${res.status})`)
  }
  const payload = (await res.json()) as WorldEnginePayload
  const next = worldFromPayload(payload, world.cities, {
    originX: world.originX,
    originY: world.originY,
    latRows: world.latRows,
    landRatio: world.landRatio,
    plateVx: world.plateVx,
    plateVy: world.plateVy,
  })
  next.elev.set(paintedElev)
  next.continentMass = world.continentMass
  recomputeSuitability(next)
  return next
}
