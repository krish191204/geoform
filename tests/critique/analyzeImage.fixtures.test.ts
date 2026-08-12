import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { analyzeRawPixels } from '../../src/critique/analyzeImage'
import { ALL_SAMPLE_BUILDERS, type SampleMap } from '../../src/critique/sampleMaps'
import type { MapIssue } from '../../src/critique/types'
import { SEVERITY_ORDER, type CritiqueFixtureExpect } from './fixtureSchema'

const __dirname = dirname(fileURLToPath(import.meta.url))
const fixturesDir = join(__dirname, 'fixtures')

const SAMPLES: Record<string, () => SampleMap> = Object.fromEntries(
  ALL_SAMPLE_BUILDERS.map((b) => {
    const s = b()
    return [s.id, b]
  }),
)

function loadExpect(id: string): CritiqueFixtureExpect {
  return JSON.parse(readFileSync(join(fixturesDir, `${id}.json`), 'utf8')) as CritiqueFixtureExpect
}

function matches(
  issue: MapIssue,
  rule: { kind?: string; titleIncludes?: string; minSeverity?: string },
): boolean {
  if (rule.kind && issue.kind !== rule.kind) return false
  if (rule.titleIncludes && !issue.title.toLowerCase().includes(rule.titleIncludes.toLowerCase())) {
    return false
  }
  if (rule.minSeverity) {
    const need = SEVERITY_ORDER[rule.minSeverity as keyof typeof SEVERITY_ORDER]
    if (SEVERITY_ORDER[issue.severity] < need) return false
  }
  return true
}

describe('critique fixture pack', () => {
  const ids = readdirSync(fixturesDir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => f.replace(/\.json$/, ''))
    .sort()

  it('ships a seeded pack (≥8) with PNG + JSON + generators', () => {
    expect(ids.length).toBeGreaterThanOrEqual(8)
    for (const id of ids) {
      expect(readdirSync(fixturesDir)).toContain(`${id}.png`)
      expect(SAMPLES[id], `missing sample generator for ${id}`).toBeTypeOf('function')
    }
  })

  for (const id of ids) {
    it(`analyzes ${id} against sidecar expectations`, () => {
      const expectSpec = loadExpect(id)
      const sample = SAMPLES[id]()
      const result = analyzeRawPixels(
        sample.data,
        sample.width,
        sample.height,
        sample.id,
        expectSpec.mode ?? sample.mode,
      )

      for (const rule of expectSpec.mustFind) {
        const hit = result.issues.find((issue) => matches(issue, rule))
        expect(
          hit,
          `expected to find ${JSON.stringify(rule)} in ${result.issues.map((i) => i.title).join(' | ')}`,
        ).toBeTruthy()
      }

      for (const rule of expectSpec.mustNotFind ?? []) {
        const hit = result.issues.find((issue) => matches(issue, rule))
        expect(hit, `must not find ${JSON.stringify(rule)} but got ${hit?.title}`).toBeFalsy()
      }

      if (expectSpec.score?.min != null) expect(result.score).toBeGreaterThanOrEqual(expectSpec.score.min)
      if (expectSpec.score?.max != null) expect(result.score).toBeLessThanOrEqual(expectSpec.score.max)
    })
  }
})
