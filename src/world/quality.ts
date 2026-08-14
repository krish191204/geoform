/** Atlas + globe rendering quality — simulation grid size for new worlds. */
export type MapQuality = 'draft' | 'standard' | 'high' | 'hd'

export type ExportResolution = '2k' | '4k'

export interface QualityPreset {
  id: MapQuality
  label: string
  width: number
  height: number
  /** Globe texture bake multiplier (world cells → tex pixels). */
  globeBake: number
  /** Cap baked globe texture width (WebGL / memory). */
  globeTexMax: number
  globeWidthSegments: number
  globeHeightSegments: number
  displacementScale: number
  /** Extra atlas raster scale adjustment (−1..+2). */
  rasterAdjust: number
}

export const QUALITY_PRESETS: Record<MapQuality, QualityPreset> = {
  draft: {
    id: 'draft',
    label: 'Draft',
    width: 384,
    height: 192,
    globeBake: 2,
    globeTexMax: 2048,
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
    globeTexMax: 3072,
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
    globeBake: 5,
    globeTexMax: 4096,
    globeWidthSegments: 192,
    globeHeightSegments: 128,
    displacementScale: 0.07,
    rasterAdjust: 1,
  },
  hd: {
    id: 'hd',
    label: 'HD',
    width: 768,
    height: 384,
    globeBake: 6,
    globeTexMax: 4096,
    globeWidthSegments: 160,
    globeHeightSegments: 120,
    displacementScale: 0.065,
    rasterAdjust: 2,
  },
}

export const DEFAULT_MAP_QUALITY: MapQuality = 'standard'
export const QUALITY_STORAGE_KEY = 'geoform.quality.v1'

/** Prefer Standard on published builds; HD locally on wide screens. */
export function defaultMapQuality(): MapQuality {
  if (typeof import.meta !== 'undefined' && import.meta.env?.PROD) return 'standard'
  if (typeof window !== 'undefined' && window.innerWidth >= 1024) return 'hd'
  return 'standard'
}

export function loadMapQuality(): MapQuality {
  try {
    const raw = localStorage.getItem(QUALITY_STORAGE_KEY)
    if (raw && raw in QUALITY_PRESETS) return raw as MapQuality
  } catch {
    /* ignore */
  }
  return defaultMapQuality()
}

export function saveMapQuality(q: MapQuality): void {
  try {
    localStorage.setItem(QUALITY_STORAGE_KEY, q)
  } catch {
    /* ignore */
  }
}

export function atlasRasterScale(cells: number, quality: MapQuality): number {
  let base = cells > 220_000 ? 2 : cells > 120_000 ? 3 : cells > 80_000 ? 4 : 5
  base += QUALITY_PRESETS[quality].rasterAdjust
  return Math.max(2, Math.min(8, base))
}

/** Device pixel ratio clamp for crisp atlas on Retina displays. */
export function displayPixelRatio(): number {
  if (typeof window === 'undefined') return 1
  return Math.min(2, Math.max(1, window.devicePixelRatio || 1))
}

/** Cap atlas raster scale so zoom-in stays sharp without blowing memory. */
export function atlasRasterScaleForZoom(
  worldWidth: number,
  worldHeight: number,
  quality: MapQuality,
  viewZoom: number,
  preview = false,
): number {
  const cells = worldWidth * worldHeight
  const prod = typeof import.meta !== 'undefined' && import.meta.env?.PROD
  const dpr = prod ? 1 : displayPixelRatio()
  const base = atlasRasterScale(cells, quality) * dpr
  const desired = base * Math.max(1, viewZoom)
  const maxPixels = prod ? 1_500_000 : 8_000_000
  const maxScale = Math.max(2, Math.floor(Math.sqrt(maxPixels / Math.max(1, cells))))
  let scale = Math.max(2, Math.min(maxScale, Math.round(desired)))
  if (preview) scale = Math.min(scale, 3)
  return scale
}

/** Globe bake scale capped so textures stay within preset limits. */
export function globeBakeForWorld(
  worldWidth: number,
  preset: QualityPreset,
): number {
  const ideal = preset.globeBake
  const texW = worldWidth * ideal
  if (texW <= preset.globeTexMax) return ideal
  return Math.max(2, Math.floor(preset.globeTexMax / Math.max(1, worldWidth)))
}

/** Target pixel size for PNG export (maintains world aspect). */
export function exportDimensions(
  worldWidth: number,
  worldHeight: number,
  res: ExportResolution,
): { width: number; height: number } {
  const targetW = res === '4k' ? 4096 : 2048
  const targetH = Math.max(1, Math.round((targetW * worldHeight) / Math.max(1, worldWidth)))
  return { width: targetW, height: targetH }
}
