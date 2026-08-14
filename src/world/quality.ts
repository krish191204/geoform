/** Atlas + globe rendering quality — simulation grid size for new worlds. */
export type MapQuality = 'draft' | 'standard' | 'high'

export interface QualityPreset {
  id: MapQuality
  label: string
  width: number
  height: number
  /** Globe texture bake multiplier (world cells → tex pixels). */
  globeBake: number
  globeWidthSegments: number
  globeHeightSegments: number
  displacementScale: number
  /** Extra atlas raster scale adjustment (−1..+1). */
  rasterAdjust: number
}

export const QUALITY_PRESETS: Record<MapQuality, QualityPreset> = {
  draft: {
    id: 'draft',
    label: 'Draft',
    width: 320,
    height: 160,
    globeBake: 2,
    globeWidthSegments: 96,
    globeHeightSegments: 64,
    displacementScale: 0.04,
    rasterAdjust: 0,
  },
  standard: {
    id: 'standard',
    label: 'Standard',
    width: 512,
    height: 256,
    globeBake: 4,
    globeWidthSegments: 128,
    globeHeightSegments: 96,
    displacementScale: 0.055,
    rasterAdjust: 1,
  },
  high: {
    id: 'high',
    label: 'High',
    width: 640,
    height: 320,
    globeBake: 4,
    globeWidthSegments: 192,
    globeHeightSegments: 128,
    displacementScale: 0.07,
    rasterAdjust: 1,
  },
}

export const DEFAULT_MAP_QUALITY: MapQuality = 'standard'
export const QUALITY_STORAGE_KEY = 'geoform.quality.v1'

export function loadMapQuality(): MapQuality {
  try {
    const raw = localStorage.getItem(QUALITY_STORAGE_KEY)
    if (raw && raw in QUALITY_PRESETS) return raw as MapQuality
  } catch {
    /* ignore */
  }
  return DEFAULT_MAP_QUALITY
}

export function saveMapQuality(q: MapQuality): void {
  try {
    localStorage.setItem(QUALITY_STORAGE_KEY, q)
  } catch {
    /* ignore */
  }
}

export function atlasRasterScale(cells: number, quality: MapQuality): number {
  let base = cells > 160_000 ? 2 : cells > 80_000 ? 3 : 4
  base += QUALITY_PRESETS[quality].rasterAdjust
  return Math.max(2, Math.min(5, base))
}
