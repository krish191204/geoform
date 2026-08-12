/**
 * Procedural map images as raw RGBA — no DOM required.
 * Used by critique fixtures, Vitest, and (via canvas blit) the broken-sample UI.
 */

export interface SampleMap {
  id: string
  width: number
  height: number
  /** RGBA pixel buffer */
  data: Uint8ClampedArray
  mode: 'painted' | 'heightmap'
}

function px(data: Uint8ClampedArray, w: number, x: number, y: number, r: number, g: number, b: number, a = 255) {
  if (x < 0 || y < 0 || x >= w) return
  const h = data.length / (w * 4)
  if (y >= h) return
  const i = (y * w + x) * 4
  data[i] = r
  data[i + 1] = g
  data[i + 2] = b
  data[i + 3] = a
}

function fill(data: Uint8ClampedArray, r: number, g: number, b: number) {
  for (let i = 0; i < data.length; i += 4) {
    data[i] = r
    data[i + 1] = g
    data[i + 2] = b
    data[i + 3] = 255
  }
}

function fillRect(
  data: Uint8ClampedArray,
  w: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  r: number,
  g: number,
  b: number,
) {
  const h = data.length / (w * 4)
  for (let y = Math.max(0, y0 | 0); y < Math.min(h, y1 | 0); y++) {
    for (let x = Math.max(0, x0 | 0); x < Math.min(w, x1 | 0); x++) {
      px(data, w, x, y, r, g, b)
    }
  }
}

function fillCircle(
  data: Uint8ClampedArray,
  w: number,
  cx: number,
  cy: number,
  rad: number,
  r: number,
  g: number,
  b: number,
) {
  const h = data.length / (w * 4)
  const r2 = rad * rad
  for (let y = Math.max(0, (cy - rad) | 0); y < Math.min(h, (cy + rad + 1) | 0); y++) {
    for (let x = Math.max(0, (cx - rad) | 0); x < Math.min(w, (cx + rad + 1) | 0); x++) {
      if ((x - cx) ** 2 + (y - cy) ** 2 <= r2) px(data, w, x, y, r, g, b)
    }
  }
}

function strokeLine(
  data: Uint8ClampedArray,
  w: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  thickness: number,
  r: number,
  g: number,
  b: number,
) {
  const steps = Math.max(2, Math.hypot(x1 - x0, y1 - y0) | 0)
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const x = x0 + (x1 - x0) * t
    const y = y0 + (y1 - y0) * t
    fillCircle(data, w, x, y, thickness, r, g, b)
  }
}

/** Desert glued to jungle with no mountain between — classic biome crime. */
export function sampleBrokenDesertJungle(): SampleMap {
  const width = 240
  const height = 140
  const data = new Uint8ClampedArray(width * height * 4)
  fill(data, 26, 90, 114) // ocean
  // flat land mid-tones (no ridge)
  fillRect(data, width, 36, 18, 228, 122, 120, 140, 95)
  // deep jungle (strong green dominance)
  fillRect(data, width, 70, 35, 125, 105, 28, 150, 48)
  // arid desert immediately east (low blue so arid detector fires)
  fillRect(data, width, 128, 35, 190, 105, 215, 165, 85)
  return { id: 'broken-desert-jungle', width, height, data, mode: 'painted' }
}

/** Blue river stroke climbing over bright rock spikes. */
export function sampleBrokenRiverRidge(): SampleMap {
  const width = 240
  const height = 140
  const data = new Uint8ClampedArray(width * height * 4)
  fill(data, 26, 90, 114)
  fillRect(data, width, 50, 15, 220, 125, 95, 154, 88)
  // ridge / spikes
  for (const [cx, cy] of [
    [120, 50],
    [140, 55],
    [160, 48],
  ] as const) {
    fillCircle(data, width, cx, cy, 14, 210, 205, 198)
    fillCircle(data, width, cx, cy - 8, 8, 235, 235, 240)
  }
  // muted stream blue — blueDom enough for rivers, not enough for ocean class
  strokeLine(data, width, 55, 105, 170, 40, 1.5, 125, 148, 162)
  fillCircle(data, width, 22, 70, 3, 20, 20, 20)
  return { id: 'broken-river-ridge', width, height, data, mode: 'painted' }
}

/** Inland streams that never reach the sea. */
export function sampleBrokenStrandedRivers(): SampleMap {
  const width = 240
  const height = 140
  const data = new Uint8ClampedArray(width * height * 4)
  fill(data, 26, 90, 114)
  fillRect(data, width, 55, 10, 230, 130, 110, 150, 90)
  // stream blue with blueDom ~0.05 so river detector fires but ocean class does not
  const stream = [125, 148, 162] as const
  strokeLine(data, width, 120, 35, 155, 65, 1.4, ...stream)
  strokeLine(data, width, 155, 65, 135, 100, 1.4, ...stream)
  strokeLine(data, width, 175, 40, 200, 95, 1.4, ...stream)
  strokeLine(data, width, 145, 45, 180, 85, 1.4, ...stream)
  strokeLine(data, width, 165, 100, 195, 55, 1.4, ...stream)
  for (let i = 0; i < 14; i++) {
    const x0 = 122 + i * 5
    strokeLine(data, width, x0, 48, x0 + 10, 88, 1.3, ...stream)
  }
  return { id: 'broken-stranded-rivers', width, height, data, mode: 'painted' }
}

/**
 * Cascades-like rain-shadow pattern (public geographic knowledge, not a copyrighted basemap):
 * Pacific west → wet coast forest → N–S range → dry inland east.
 */
export function sampleCascadesRainShadow(): SampleMap {
  const width = 260
  const height = 150
  const data = new Uint8ClampedArray(width * height * 4)

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const nx = x / width
      const ny = y / height
      let r: number
      let g: number
      let b: number
      if (nx < 0.18) {
        // Pacific
        r = 30
        g = 90
        b = 120
      } else if (nx < 0.38) {
        // wet windward forest
        const lush = 0.85 + 0.1 * Math.sin(ny * 12)
        r = 40
        g = Math.round(110 * lush)
        b = 55
      } else if (nx < 0.52) {
        // Cascades crest — rock / snow
        const ridge = Math.exp(-Math.pow((nx - 0.45) / 0.05, 2))
        const snow = ridge > 0.55 && (ny * 17 + nx * 3) % 1 > 0.45
        if (snow) {
          r = 235
          g = 240
          b = 245
        } else {
          r = Math.round(140 + ridge * 60)
          g = Math.round(140 + ridge * 50)
          b = Math.round(135 + ridge * 40)
        }
      } else {
        // Columbia / rain-shadow steppe — dry east
        const dry = 0.7 + 0.2 * (nx - 0.52)
        r = Math.round(190 * dry)
        g = Math.round(160 * dry)
        b = Math.round(100 * dry)
      }
      // soft coast noise
      if (nx > 0.16 && nx < 0.2 && Math.sin(ny * 40) > 0.3) {
        r = 35
        g = 95
        b = 125
      }
      px(data, width, x, y, r, g, b)
    }
  }

  // sensible river: west-slope stream to ocean (downhill-ish)
  strokeLine(data, width, 110, 80, 40, 90, 2.2, 55, 130, 175)

  return { id: 'cascades-rain-shadow', width, height, data, mode: 'painted' }
}

export const ALL_SAMPLE_MAPS = [
  sampleBrokenDesertJungle,
  sampleBrokenRiverRidge,
  sampleBrokenStrandedRivers,
  sampleCascadesRainShadow,
] as const

/** Blit a sample into a browser canvas (for the critique UI broken sample). */
export function sampleToCanvas(sample: SampleMap): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = sample.width
  c.height = sample.height
  const ctx = c.getContext('2d')!
  const pixels = new Uint8ClampedArray(sample.data)
  const img = new ImageData(pixels, sample.width, sample.height)
  ctx.putImageData(img, 0, 0)
  return c
}
