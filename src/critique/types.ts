/**
 * What a critique report looks like: a score, a list of issues, optional pins
 * on the preview. source tells you if we graded JSON or a picture.
 */
export type Severity = 'critical' | 'major' | 'minor' | 'note'

export type IssueKind =
  | 'hydro'
  | 'climate'
  | 'orography'
  | 'settlement'
  | 'tectonic'
  | 'visual'

export interface MapIssue {
  id: string
  severity: Severity
  kind: IssueKind
  title: string
  critique: string
  fix: string
  /** normalized 0..1 map coords for pin, if localized */
  at?: { x: number; y: number }
  confidence: number
  evidence?: string
}

export interface CritiqueResult {
  source: 'geoform-json' | 'image'
  label: string
  width: number
  height: number
  score: number
  summary: string
  issues: MapIssue[]
  /** optional preview grids 0..1 */
  elev?: Float32Array
  moist?: Float32Array
  water?: Float32Array
}

export const KIND_LABEL: Record<IssueKind, string> = {
  hydro: 'Hydrology',
  climate: 'Climate',
  orography: 'Orography',
  settlement: 'Settlement',
  tectonic: 'Tectonics',
  visual: 'Readability',
}

export const SEVERITY_LABEL: Record<Severity, string> = {
  critical: 'Critical',
  major: 'Major',
  minor: 'Minor',
  note: 'Note',
}
