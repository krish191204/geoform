/**
 * Product stages: Sketch → Critique → Make sense → Worldbuild.
 * Sketch is an empty ocean you draw on. Make sense auto-applies geography.
 */

export type UxStage = 'sketch' | 'critique' | 'alternatives' | 'worldbuild'

export interface StageDef {
  id: UxStage
  num: string
  title: string
  blurb: string
}

export const UX_STAGES: StageDef[] = [
  {
    id: 'sketch',
    num: '01',
    title: 'Sketch',
    blurb: 'Empty ocean. Draw land however you want.',
  },
  {
    id: 'critique',
    num: '02',
    title: 'Critique',
    blurb: 'Tear the map apart — what fails as geography.',
  },
  {
    id: 'alternatives',
    num: '03',
    title: 'Make sense',
    blurb: 'Closest map to your sketch that obeys geography.',
  },
  {
    id: 'worldbuild',
    num: '04',
    title: 'Worldbuild',
    blurb: 'Cities, trade, and story on the committed map.',
  },
]

/** Earth radius; slider clamps to these bounds (km). */
export const PLANET_RADIUS_MIN_KM = 2500
export const PLANET_RADIUS_MAX_KM = 12000
export const PLANET_RADIUS_DEFAULT_KM = 6371

export function clampPlanetRadiusKm(km: number): number {
  if (!Number.isFinite(km)) return PLANET_RADIUS_DEFAULT_KM
  return Math.max(PLANET_RADIUS_MIN_KM, Math.min(PLANET_RADIUS_MAX_KM, Math.round(km)))
}

export function stageDef(id: UxStage): StageDef {
  return UX_STAGES.find((s) => s.id === id) ?? UX_STAGES[0]
}

export function stageAllowsTerrain(stage: UxStage): boolean {
  return stage === 'sketch'
}

export function stageAllowsSettlements(stage: UxStage): boolean {
  return stage === 'worldbuild'
}
