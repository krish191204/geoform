import { describe, expect, it } from 'vitest'
import { atlasRasterScale, QUALITY_PRESETS } from '../../src/world/quality'

describe('map quality presets', () => {
  it('standard is 512×256 with higher globe bake than draft', () => {
    expect(QUALITY_PRESETS.standard.width).toBe(512)
    expect(QUALITY_PRESETS.standard.height).toBe(256)
    expect(QUALITY_PRESETS.standard.globeBake).toBeGreaterThan(QUALITY_PRESETS.draft.globeBake)
  })

  it('atlasRasterScale respects quality on large grids', () => {
    const cells = 512 * 256
    expect(atlasRasterScale(cells, 'high')).toBeGreaterThanOrEqual(atlasRasterScale(cells, 'draft'))
  })
})
