/**
 * Plain-English “you did X, so Y also changed” for writers.
 * Snapshot the grids, then list only differences big enough to see.
 */
import { RIVER_MAIN_MIN, RIVER_VISIBLE_MIN } from '../world/climate'
import { landFraction } from '../world/land'
import { formatTemperatureDelta } from '../world/temperature'
import type { Tool, World } from '../world/types'
import type { CoachMessage } from './coach'

export interface WorldSnapshot {
  landPct: number
  oceanPct: number
  riverCells: number
  mainRivers: number
  peak: number
  landMoist: number
  landTemp: number
  cities: number
  biomes: Record<string, number>
}

const BIOME_NAME: Record<string, string> = {
  ocean: 'ocean',
  coast: 'coast',
  alpine: 'high mountains',
  ice: 'ice',
  tundra: 'tundra',
  taiga: 'taiga / boreal forest',
  desert: 'desert',
  savanna: 'savanna',
  grassland: 'grassland',
  rainforest: 'rainforest',
  forest: 'forest',
}

function biomeName(id: string): string {
  return BIOME_NAME[id] ?? id.replace(/_/g, ' ')
}

export function snapshotWorld(world: World): WorldSnapshot {
  const { elev, seaLevel, flux, moist, temp, biome, cities } = world
  const n = elev.length
  let land = 0
  let riverCells = 0
  let mainRivers = 0
  let peak = 0
  let moistSum = 0
  let tempSum = 0
  const biomes: Record<string, number> = {}
  for (let i = 0; i < n; i++) {
    const b = biome[i] || 'unknown'
    biomes[b] = (biomes[b] ?? 0) + 1
    if (elev[i] < seaLevel) continue
    land++
    if (elev[i] > peak) peak = elev[i]
    moistSum += moist[i] ?? 0
    tempSum += temp[i] ?? 0
    if (flux[i] >= RIVER_VISIBLE_MIN) riverCells++
    if (flux[i] >= RIVER_MAIN_MIN) mainRivers++
  }
  const landPct = Math.round(landFraction(elev, seaLevel) * 100)
  return {
    landPct,
    oceanPct: 100 - landPct,
    riverCells,
    mainRivers,
    peak,
    landMoist: land ? moistSum / land : 0,
    landTemp: land ? tempSum / land : 0,
    cities: cities.length,
    biomes,
  }
}

function pct(n: number, total: number): number {
  if (!total) return 0
  return Math.round((n / total) * 100)
}

function signed(n: number): string {
  if (n > 0) return `+${n}`
  return String(n)
}

function biomeShifts(before: WorldSnapshot, after: WorldSnapshot, total: number): string[] {
  const keys = new Set([...Object.keys(before.biomes), ...Object.keys(after.biomes)])
  const rows: { name: string; delta: number }[] = []
  for (const k of keys) {
    if (k === 'ocean' || k === 'coast') continue
    const d = (after.biomes[k] ?? 0) - (before.biomes[k] ?? 0)
    if (Math.abs(d) < Math.max(8, total * 0.004)) continue
    rows.push({ name: biomeName(k), delta: d })
  }
  rows.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
  return rows.slice(0, 3).map((r) =>
    r.delta > 0 ? `More ${r.name} appeared.` : `Less ${r.name} than before.`,
  )
}

/** Bullet list of visible knock-on effects. Empty if nothing moved enough. */
export function diffWorld(before: WorldSnapshot, after: WorldSnapshot): string[] {
  const out: string[] = []
  const landDelta = after.landPct - before.landPct
  if (Math.abs(landDelta) >= 1) {
    out.push(
      landDelta > 0
        ? `Land grew to ${after.landPct}% (ocean now ${after.oceanPct}%). More cells sit above the water line.`
        : `Land shrank to ${after.landPct}% (ocean now ${after.oceanPct}%). More cells are underwater.`,
    )
  } else {
    out.push(`Land/water mix is unchanged (${after.landPct}% land, ${after.oceanPct}% ocean).`)
  }

  const riverDelta = after.riverCells - before.riverCells
  if (Math.abs(riverDelta) >= 6) {
    out.push(
      riverDelta > 0
        ? `Rivers grew: ${before.riverCells} → ${after.riverCells} stream cells on the Relief look (water found new downhill paths).`
        : `Rivers shrank: ${before.riverCells} → ${after.riverCells} stream cells (slopes or catchments got smaller).`,
    )
  } else {
    out.push(`River network is about the same (${after.riverCells} blue stream cells on Relief).`)
  }

  if (after.mainRivers !== before.mainRivers && Math.abs(after.mainRivers - before.mainRivers) >= 2) {
    out.push(
      after.mainRivers > before.mainRivers
        ? `Thicker main rivers: ${after.mainRivers} big stems now (was ${before.mainRivers}).`
        : `Fewer thick main rivers: ${after.mainRivers} now (was ${before.mainRivers}).`,
    )
  }

  const peakDelta = after.peak - before.peak
  if (Math.abs(peakDelta) >= 0.03) {
    out.push(
      peakDelta > 0
        ? `Highest land got taller (peaks look more gray/white on Relief).`
        : `Highest land got lower (fewer alpine peaks).`,
    )
  }

  const moistDelta = after.landMoist - before.landMoist
  if (Math.abs(moistDelta) >= 0.025) {
    out.push(
      moistDelta > 0
        ? `Land got wetter on average — check the Moisture look for rain.`
        : `Land got drier on average — rain shadows or less ocean fetch. Check Moisture.`,
    )
  }

  const tempDelta = after.landTemp - before.landTemp
  if (Math.abs(tempDelta) >= 0.02) {
    const deg = formatTemperatureDelta(tempDelta)
    out.push(
      tempDelta > 0
        ? `Land got warmer by ~${deg} on average (lower mountains or more lowland).`
        : `Land got cooler by ~${deg} on average (higher mountains or more polar land).`,
    )
  }

  const total = Object.values(after.biomes).reduce((a, b) => a + b, 0)
  out.push(...biomeShifts(before, after, total))

  if (after.cities !== before.cities) {
    const d = after.cities - before.cities
    out.push(d > 0 ? `Cities: ${signed(d)} (now ${after.cities}).` : `Cities: ${d} (now ${after.cities}).`)
  }

  return out
}

export function describeWorldNow(world: World): string[] {
  const s = snapshotWorld(world)
  const n = world.width * world.height
  const forest = pct((s.biomes.forest ?? 0) + (s.biomes.rainforest ?? 0) + (s.biomes.taiga ?? 0), n)
  const dry = pct((s.biomes.desert ?? 0) + (s.biomes.savanna ?? 0) + (s.biomes.grassland ?? 0), n)
  return [
    `This planet is ${s.landPct}% land and ${s.oceanPct}% ocean.`,
    `Relief shows ${s.riverCells} river cells (${s.mainRivers} thicker main stems). Those are calculated from height — you did not draw them.`,
    `Plants (Biome look): about ${forest}% forest/rain/taiga and ${dry}% grass/savanna/desert, plus ice and mountains.`,
    s.cities
      ? `${s.cities} ${s.cities === 1 ? 'city' : 'cities'} on the map.`
      : `No cities yet — Found city or Suggest settlements from the left panel.`,
  ]
}

export function coachAfterChange(
  youDid: string,
  why: string,
  before: WorldSnapshot | null,
  afterWorld: World,
  next: string,
): CoachMessage {
  const after = snapshotWorld(afterWorld)
  const changed = before ? diffWorld(before, after) : describeWorldNow(afterWorld)
  return {
    title: youDid,
    tip: why,
    changed,
    next,
    tone: 'ok',
  }
}

const STROKE_COPY: Partial<Record<Tool, { title: string; why: string }>> = {
  raise: {
    title: 'You raised land',
    why: 'That drag pushed heights up (hills/mountains). Height is the cause. Rain, rivers, and plants are effects and just rebuilt from the new heights.',
  },
  lower: {
    title: 'You lowered land',
    why: 'That drag sank heights. If cells dropped under the water line they became ocean. Rivers and climate rebuilt from the new slopes.',
  },
  smooth: {
    title: 'You smoothed land',
    why: 'That drag blended neighboring heights so cliffs are softer. Rivers may have shifted because downhill paths changed.',
  },
  ridge: {
    title: 'You painted a ridge',
    why: 'That drag built a thin mountain chain along your stroke. Windward slopes get more rain; the far side can dry out. Rivers now run off the new high ground.',
  },
  channel: {
    title: 'You carved a channel',
    why: 'That drag cut a valley. Water prefers the lowest path, so rivers often follow the channel after the rebuild.',
  },
  plateau: {
    title: 'You flattened a plateau',
    why: 'That drag evened heights into a table. Flat land can starve rivers unless there is still a slope to the sea — we carve outlets if bowls appear.',
  },
  sea: {
    title: 'You painted ocean',
    why: 'That drag put cells below the water line. Those cells are now sea, not land. Cities cannot sit there. Climate treats them as water.',
  },
  land: {
    title: 'You painted land',
    why: 'That drag lifted cells above the water line. New coast appeared. Tiny lonely blobs may still drown later if Full continents is on.',
  },
}

export function strokeCopy(tool: Tool): { title: string; why: string } {
  return (
    STROKE_COPY[tool] ?? {
      title: 'You edited the land',
      why: 'The heightfield changed. Climate, rivers, and biomes always follow height — they just rebuilt.',
    }
  )
}

export const AFTER_EDIT_NEXT =
  'Relief = heights + blue rivers. Biome = plants. Moisture = rain. Undo (Z) reverts the whole stroke if you hate it.'

