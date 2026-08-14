/**
 * Where you may put discrete things (cities, continents).
 *
 * Terrain brushes stay free — paint what you want; repair runs later.
 * Found city / Add continent are stamps. Stamps refuse nonsense:
 * cities need solid ground (not ocean, peaks, or cliffs); marginal sites are allowed.
 * Continents grow from the sea, not on top of existing land.
 */

import { evaluateSuitability } from './climate'
import type { ContinentStyle } from './continents'
import type { SuitabilityTier, World } from './types'

export interface PlacementGate {
  /** Allowed right now (or with Shift if soft). */
  ok: boolean
  /**
   * Impossible geography — the UI will not let Shift override this.
   * Soft fails (arid climate, far from river) can still be forced.
   */
  hard: boolean
  title: string
  detail: string
  score?: number
  tier?: SuitabilityTier
}

function slopeAt(world: World, x: number, y: number): number {
  const { width: w, height: h, elev } = world
  const e = elev[y * w + x]
  let maxD = 0
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue
      const nx = ((x + dx) % w + w) % w
      const ny = y + dy
      if (ny < 0 || ny >= h) continue
      maxD = Math.max(maxD, Math.abs(elev[ny * w + nx] - e))
    }
  }
  return maxD
}

/**
 * Found city gate.
 * Hard: ocean, peak, cliff, already too close to another city.
 * Marginal and favorable sites both place without Shift.
 */
export function gateCityPlacement(world: World, x: number, y: number): PlacementGate {
  const { width: w, height: h, elev, seaLevel } = world
  if (x < 0 || y < 0 || x >= w || y >= h) {
    return { ok: false, hard: true, title: 'Off the map', detail: 'Click a cell on the atlas.' }
  }
  const i = y * w + x
  if (elev[i] < seaLevel) {
    return {
      ok: false,
      hard: true,
      title: 'Open ocean',
      detail: 'Cities need solid ground. Raise land first, or pick a coast.',
      score: 0,
    }
  }
  if (elev[i] > 0.82) {
    return {
      ok: false,
      hard: true,
      title: 'Alpine peak',
      detail: 'Too high and cold for a lasting city. Found one lower down.',
      score: 0,
    }
  }
  const slope = slopeAt(world, x, y)
  if (slope > 0.09) {
    return {
      ok: false,
      hard: true,
      title: 'Cliff face',
      detail: 'Terrain is too steep to settle. Smooth or pick a gentler slope.',
      score: 0,
    }
  }
  if (world.cities.some((c) => Math.hypot(c.x - x, c.y - y) < 4)) {
    return {
      ok: false,
      hard: true,
      title: 'Too crowded',
      detail: 'Another city is already within 4 cells. Pick a clearer site.',
    }
  }

  const suit = evaluateSuitability(world, x, y)
  if (suit.tier === 'blocked') {
    return {
      ok: false,
      hard: true,
      title: suit.reasons[0] ?? 'Blocked',
      detail: suit.reasons.join(' · ') || 'Cannot build here.',
      score: suit.score,
      tier: suit.tier,
    }
  }
  if (suit.tier === 'marginal') {
    return {
      ok: true,
      hard: false,
      title: 'Hard site',
      detail: `${suit.reasons.join(' · ') || 'Harsh but plausible'}.`,
      score: suit.score,
      tier: suit.tier,
    }
  }
  return {
    ok: true,
    hard: false,
    title: 'Good site',
    detail: suit.reasons[0] ?? 'Favorable site',
    score: suit.score,
    tier: suit.tier,
  }
}

/** Add continent — center must be ocean so new land grows from the sea. */
export function gateContinentPlacement(
  world: World,
  x: number,
  y: number,
  _style: ContinentStyle,
): PlacementGate {
  const { width: w, height: h, elev, seaLevel } = world
  if (x < 0 || y < 0 || x >= w || y >= h) {
    return { ok: false, hard: true, title: 'Off the map', detail: 'Click ocean on the atlas.' }
  }
  if (elev[y * w + x] >= seaLevel) {
    return {
      ok: false,
      hard: true,
      title: 'Already land',
      detail: 'Continents grow from open ocean. Click the sea, or use Auto-place.',
    }
  }
  // Need a little breathing room so the stamp is not a one-cell puddle.
  let oceanNear = 0
  for (let dy = -3; dy <= 3; dy++) {
    for (let dx = -3; dx <= 3; dx++) {
      const nx = (x + dx + w) % w
      const ny = y + dy
      if (ny < 0 || ny >= h) continue
      if (elev[ny * w + nx] < seaLevel) oceanNear++
    }
  }
  if (oceanNear < 12) {
    return {
      ok: false,
      hard: true,
      title: 'Too tight',
      detail: 'This bay is too small. Click deeper ocean or lower some coast first.',
    }
  }
  return {
    ok: true,
    hard: false,
    title: 'Open ocean',
    detail: 'Click to raise a new landmass here.',
  }
}

/** Raze — only when a city is actually nearby. */
export function gateRazeCity(world: World, x: number, y: number, maxDist = 5): PlacementGate {
  let bestD = maxDist
  let name = ''
  for (const c of world.cities) {
    const d = Math.hypot(c.x - x, c.y - y)
    if (d < bestD) {
      bestD = d
      name = c.name
    }
  }
  if (!name) {
    return {
      ok: false,
      hard: true,
      title: 'No city nearby',
      detail: 'Click closer to a city marker to raze it.',
    }
  }
  return {
    ok: true,
    hard: false,
    title: `Raze ${name}`,
    detail: `Will remove ${name}.`,
  }
}

/** Past ages are a reconstruction — do not stamp cities or continents on them. */
export function gatePresentEdit(timelineAge: number): PlacementGate | null {
  if (timelineAge < 0.5) return null
  return {
    ok: false,
    hard: true,
    title: 'Deep time',
    detail: 'Slide Age back to Present before founding cities or adding continents.',
  }
}
