import type { IssueKind, Severity } from '../../src/critique/types'

/**
 * Sidecar schema for critique image fixtures.
 * One JSON file per PNG in tests/critique/fixtures/.
 */
export interface CritiqueFixtureExpect {
  /** Fixture id — must match PNG basename */
  id: string
  /** Human description */
  description: string
  /** Corpus class */
  corpus: 'synthetic' | 'earth-pattern' | 'fantasy-owned'
  /** Force analyzer mode; auto if omitted */
  mode?: 'auto' | 'painted' | 'heightmap'
  /** At least one issue must match each entry */
  mustFind: Array<{
    kind?: IssueKind
    /** Substring match against issue title (case-insensitive) */
    titleIncludes?: string
    minSeverity?: Severity
  }>
  /** Fail if any issue matches */
  mustNotFind?: Array<{
    kind?: IssueKind
    titleIncludes?: string
  }>
  /** Soft bounds on grade */
  score?: { min?: number; max?: number }
}

export const SEVERITY_ORDER: Record<Severity, number> = {
  note: 0,
  minor: 1,
  major: 2,
  critical: 3,
}
