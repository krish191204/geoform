import { describe, expect, it } from 'vitest'
import {
  atlasRasterScale,
  defaultMapQuality,
  exportDimensions,
  globeBakeForWorld,
  QUALITY_PRESETS,
} from '../../src/world/quality'

describe('map quality presets', () => {
  it('hd is 768×384 with higher globe bake than standard', () => {
    expect(QUALITY_PRESETS.hd.width).toBe(768)
    expect(QUALITY_PRESETS.hd.height).toBe(384)
    expect(QUALITY_PRESETS.hd.globeBake).toBeGreaterThan(QUALITY_PRESETS.standard.globeBake)
  })

  it('atlasRasterScale respects quality on large grids', () => {
    const cells = 512 * 256
    expect(atlasRasterScale(cells, 'hd')).toBeGreaterThanOrEqual(atlasRasterScale(cells, 'draft'))
  })

  it('globeBakeForWorld caps texture width', () => {
    const preset = QUALITY_PRESETS.hd
    expect(globeBakeForWorld(768, preset)).toBeLessThanOrEqual(preset.globeBake)
    expect(768 * globeBakeForWorld(768, preset)).toBeLessThanOrEqual(preset.globeTexMax)
  })

  it('exportDimensions preserves aspect for 2K and 4K', () => {
    const w = 512
    const h = 256
    const two = exportDimensions(w, h, '2k')
    const four = exportDimensions(w, h, '4k')
    expect(two.width).toBe(2048)
    expect(two.height).toBe(1024)
    expect(four.width).toBe(4096)
    expect(four.height).toBe(2048)
  })

  it('defaultMapQuality returns a valid preset', () => {
    expect(QUALITY_PRESETS[defaultMapQuality()]).toBeDefined()
  })
})
