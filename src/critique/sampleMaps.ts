/**
 * Procedural map images as raw RGBA — no DOM required.
 * Higher-res teaching maps for critique fixtures + UI gallery.
 */

export interface SampleMap {
  id: string
  width: number
  height: number
  data: Uint8ClampedArray
  mode: 'painted' | 'heightmap'
  title: string
  blurb: string
  corpus: 'synthetic' | 'earth-pattern' | 'fantasy-owned'
}

function px(data: Uint8ClampedArray, w: number, x: number, y: number, r: number, g: number, b: number, a = 255) {
  if (x < 0 || y < 0 || x >= w) return
  const h = (data.length / (w * 4)) | 0
  if (y >= h) return
  const i = (y * w + x) * 4
  data[i] = r | 0
  data[i + 1] = g | 0
  data[i + 2] = b | 0
  data[i + 3] = a
}

function noise2(x: number, y: number, seed = 0) {
  const n =
    Math.sin(x * 1.7 + seed) * Math.cos(y * 1.3 - seed * 0.5) +
    0.5 * Math.sin(x * 3.1 - y * 2.2 + seed * 2) +
    0.25 * Math.sin(x * 6.4 + y * 5.1 - seed)
  return n * 0.5 + 0.5
}

function fill(data: Uint8ClampedArray, r: number, g: number, b: number) {
  for (let i = 0; i < data.length; i += 4) {
    data[i] = r
    data[i + 1] = g
    data[i + 2] = b
    data[i + 3] = 255
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
  const h = (data.length / (w * 4)) | 0
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const cx = x0 + (x1 - x0) * t
    const cy = y0 + (y1 - y0) * t
    const rad = thickness
    for (let y = Math.max(0, (cy - rad) | 0); y < Math.min(h, (cy + rad + 1) | 0); y++) {
      for (let x = Math.max(0, (cx - rad) | 0); x < Math.min(w, (cx + rad + 1) | 0); x++) {
        if ((x - cx) ** 2 + (y - cy) ** 2 <= rad * rad) px(data, w, x, y, r, g, b)
      }
    }
  }
}

function paintCoastContinent(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  opts: {
    ocean: [number, number, number]
    landFn: (nx: number, ny: number) => [number, number, number]
    inLand: (nx: number, ny: number) => boolean
  },
) {
  fill(data, ...opts.ocean)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const nx = x / w
      const ny = y / h
      if (!opts.inLand(nx, ny)) continue
      const [r, g, b] = opts.landFn(nx, ny)
      // soft coast dither
      const edge =
        opts.inLand(nx + 0.01, ny) &&
        opts.inLand(nx - 0.01, ny) &&
        opts.inLand(nx, ny + 0.01) &&
        opts.inLand(nx, ny - 0.01)
      if (!edge && noise2(nx * 40, ny * 40, 9) > 0.55) continue
      px(data, w, x, y, r, g, b)
    }
  }
}

/** Desert glued to jungle with no mountain between. */
export function sampleBrokenDesertJungle(): SampleMap {
  const width = 320
  const height = 180
  const data = new Uint8ClampedArray(width * height * 4)
  paintCoastContinent(data, width, height, {
    ocean: [28, 88, 118],
    inLand: (nx, ny) => {
      const coast = 0.2 + 0.03 * Math.sin(ny * 18) + 0.02 * noise2(nx * 8, ny * 8, 1)
      return nx > coast && nx < 0.92 && ny > 0.08 && ny < 0.92
    },
    landFn: (nx, ny) => {
      const n = noise2(nx * 10, ny * 10, 2)
      // jungle west half of continent
      if (nx < 0.55) {
        const g = 110 + n * 40
        return [35 + n * 20, g, 45 + n * 15]
      }
      // desert east — abrupt, no ridge
      const dry = 0.85 + 0.1 * n
      return [Math.round(210 * dry), Math.round(165 * dry), Math.round(85 * dry)]
    },
  })
  return {
    id: 'broken-desert-jungle',
    width,
    height,
    data,
    mode: 'painted',
    title: 'Desert kisses jungle',
    blurb: 'Synthetic crime: wet forest glued to arid sand with no range between.',
    corpus: 'synthetic',
  }
}

/** Stream cresting bright peaks. */
export function sampleBrokenRiverRidge(): SampleMap {
  const width = 320
  const height = 180
  const data = new Uint8ClampedArray(width * height * 4)
  paintCoastContinent(data, width, height, {
    ocean: [28, 88, 118],
    inLand: (nx, ny) => nx > 0.22 + 0.02 * Math.sin(ny * 14) && nx < 0.9 && ny > 0.1 && ny < 0.9,
    landFn: (nx, ny) => {
      const ridge = Math.exp(-Math.pow((nx - 0.55) / 0.07, 2)) * (0.7 + 0.3 * Math.sin(ny * 10))
      const n = noise2(nx * 12, ny * 12, 3)
      if (ridge > 0.55) {
        const snow = ridge > 0.75 && n > 0.45
        return snow ? [238, 242, 248] : [170 + ridge * 50, 165 + ridge * 40, 155]
      }
      return [85 + n * 30, 130 + n * 25, 70 + n * 20]
    },
  })
  // stream climbing the ridge (muted blue so it isn't ocean-classified)
  strokeLine(data, width, 90, 140, 200, 45, 1.6, 125, 148, 162)
  strokeLine(data, width, 200, 45, 250, 70, 1.5, 125, 148, 162)
  // city in water
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) px(data, width, 40 + dx, 90 + dy, 18, 18, 18)
  return {
    id: 'broken-river-ridge',
    width,
    height,
    data,
    mode: 'painted',
    title: 'River over the ridge',
    blurb: 'Synthetic: a painted channel crests highland spikes.',
    corpus: 'synthetic',
  }
}

/** Inland streams that never reach the sea. */
export function sampleBrokenStrandedRivers(): SampleMap {
  const width = 320
  const height = 180
  const data = new Uint8ClampedArray(width * height * 4)
  paintCoastContinent(data, width, height, {
    ocean: [28, 88, 118],
    inLand: (nx, ny) => nx > 0.28 && nx < 0.95 && ny > 0.08 && ny < 0.92,
    landFn: (nx, ny) => {
      const n = noise2(nx * 9, ny * 9, 4)
      return [95 + n * 35, 135 + n * 30, 75 + n * 20]
    },
  })
  const stream = [125, 148, 162] as const
  const paths: [number, number, number, number][] = [
    [170, 40, 210, 80],
    [210, 80, 185, 120],
    [230, 50, 260, 110],
    [195, 55, 240, 100],
    [220, 130, 255, 70],
  ]
  for (const [x0, y0, x1, y1] of paths) strokeLine(data, width, x0, y0, x1, y1, 1.35, ...stream)
  for (let i = 0; i < 16; i++) {
    const x0 = 165 + i * 6
    strokeLine(data, width, x0, 55, x0 + 12, 105, 1.25, ...stream)
  }
  return {
    id: 'broken-stranded-rivers',
    width,
    height,
    data,
    mode: 'painted',
    title: 'Rivers to nowhere',
    blurb: 'Synthetic: inland channels that never meet coast or lake.',
    corpus: 'synthetic',
  }
}

/** Hot peaks / inverted lapse painted as bright warm highlands. */
export function sampleBrokenHotPeaks(): SampleMap {
  const width = 320
  const height = 180
  const data = new Uint8ClampedArray(width * height * 4)
  paintCoastContinent(data, width, height, {
    ocean: [30, 86, 115],
    inLand: (nx, ny) => nx > 0.18 && nx < 0.88 && ny > 0.12 && ny < 0.88,
    landFn: (nx, ny) => {
      const peak = Math.exp(-Math.pow((nx - 0.5) / 0.12, 2) - Math.pow((ny - 0.45) / 0.18, 2))
      const n = noise2(nx * 11, ny * 11, 5)
      if (peak > 0.35) {
        // warm terracotta summits — wrong for alpine
        return [200 + peak * 40, 110 + peak * 20, 70 + n * 20]
      }
      return [70 + n * 25, 120 + n * 30, 80 + n * 20]
    },
  })
  return {
    id: 'broken-hot-peaks',
    width,
    height,
    data,
    mode: 'painted',
    title: 'Hot mountains',
    blurb: 'Synthetic: highlands read warm/arid instead of cool alpine.',
    corpus: 'synthetic',
  }
}

/** Lonely salt-and-pepper peaks. */
export function sampleBrokenPepperPeaks(): SampleMap {
  const width = 320
  const height = 180
  const data = new Uint8ClampedArray(width * height * 4)
  paintCoastContinent(data, width, height, {
    ocean: [28, 88, 118],
    inLand: (nx, ny) => nx > 0.2 && nx < 0.9 && ny > 0.1 && ny < 0.9,
    landFn: (nx, ny) => {
      const n = noise2(nx * 8, ny * 8, 6)
      return [90 + n * 30, 125 + n * 25, 70 + n * 18]
    },
  })
  // Many 1px snow dots — larger blobs look belt-like to the lonely-peak detector.
  const peaks: [number, number][] = []
  for (let i = 0; i < 36; i++) {
    const cx = 0.26 + ((i * 19) % 60) / 100
    const cy = 0.2 + ((i * 31) % 62) / 100
    peaks.push([cx, cy])
  }
  for (const [cx, cy] of peaks) {
    const x = (cx * width) | 0
    const y = (cy * height) | 0
    px(data, width, x, y, 242, 244, 250)
    // tiny halo so relief registers, but stay sparse
    px(data, width, x + 1, y, 200, 198, 195)
    px(data, width, x, y + 1, 200, 198, 195)
  }
  return {
    id: 'broken-pepper-peaks',
    width,
    height,
    data,
    mode: 'painted',
    title: 'Pepper peaks',
    blurb: 'Synthetic: isolated pinnacles instead of an orogenic belt.',
    corpus: 'synthetic',
  }
}

/** Cascades-like: wet west, crest, dry east. */
export function sampleCascadesRainShadow(): SampleMap {
  const width = 340
  const height = 190
  const data = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const nx = x / width
      const ny = y / height
      const n = noise2(nx * 14, ny * 14, 7)
      let r: number
      let g: number
      let b: number
      if (nx < 0.17 + 0.015 * Math.sin(ny * 22) + 0.01 * n) {
        r = 32
        g = 92
        b = 122
      } else if (nx < 0.4) {
        const lush = 0.8 + 0.15 * n
        r = Math.round(42 * lush)
        g = Math.round(125 * lush)
        b = Math.round(58 * lush)
      } else if (nx < 0.54) {
        const ridge = Math.exp(-Math.pow((nx - 0.47) / 0.05, 2))
        const snow = ridge > 0.55 && n > 0.48
        if (snow) {
          r = 236
          g = 240
          b = 246
        } else {
          r = Math.round(145 + ridge * 55)
          g = Math.round(142 + ridge * 45)
          b = Math.round(138 + ridge * 35)
        }
      } else {
        const dry = 0.75 + 0.2 * (nx - 0.54) + 0.05 * n
        r = Math.round(188 * dry)
        g = Math.round(158 * dry)
        b = Math.round(98 * dry)
      }
      px(data, width, x, y, r, g, b)
    }
  }
  strokeLine(data, width, 130, 100, 45, 110, 1.5, 120, 145, 160)
  return {
    id: 'cascades-rain-shadow',
    width,
    height,
    data,
    mode: 'painted',
    title: 'Cascades pattern',
    blurb: 'Earth-pattern: Pacific → wet forest → N–S crest → dry inland (not a copyrighted basemap).',
    corpus: 'earth-pattern',
  }
}

/** Andes-like coastal desert west of high range, wetter east foothills. */
export function sampleAndesRainShadow(): SampleMap {
  const width = 340
  const height = 190
  const data = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const nx = x / width
      const ny = y / height
      const n = noise2(nx * 12, ny * 16, 8)
      let r: number
      let g: number
      let b: number
      if (nx < 0.14) {
        r = 25
        g = 80
        b = 110
      } else if (nx < 0.32) {
        // Atacama-ish coastal desert (west of range)
        const dry = 0.9 + 0.08 * n
        r = Math.round(200 * dry)
        g = Math.round(175 * dry)
        b = Math.round(120 * dry)
      } else if (nx < 0.48) {
        const ridge = Math.exp(-Math.pow((nx - 0.4) / 0.05, 2))
        const snow = ridge > 0.6 && n > 0.5
        r = snow ? 240 : Math.round(150 + ridge * 60)
        g = snow ? 244 : Math.round(145 + ridge * 50)
        b = snow ? 250 : Math.round(140 + ridge * 40)
      } else {
        // wetter leeward Amazon-ish for this schematic (east)
        const lush = 0.75 + 0.2 * n
        r = Math.round(50 * lush)
        g = Math.round(120 * lush)
        b = Math.round(55 * lush)
      }
      px(data, width, x, y, r, g, b)
    }
  }
  return {
    id: 'andes-rain-shadow',
    width,
    height,
    data,
    mode: 'painted',
    title: 'Andes pattern',
    blurb: 'Earth-pattern: dry Pacific coast, high crest, greener interior — schematic, self-drawn.',
    corpus: 'earth-pattern',
  }
}

/** Owned fantasy continent with coherent drainage + rain shadow. */
export function sampleFantasyOwnedCoherent(): SampleMap {
  const width = 340
  const height = 190
  const data = new Uint8ClampedArray(width * height * 4)
  paintCoastContinent(data, width, height, {
    ocean: [26, 78, 108],
    inLand: (nx, ny) => {
      const blob =
        Math.exp(-Math.pow((nx - 0.55) / 0.32, 2) - Math.pow((ny - 0.5) / 0.38, 2)) +
        0.15 * noise2(nx * 6, ny * 6, 10)
      return blob > 0.35
    },
    landFn: (nx, ny) => {
      const ridge = Math.exp(-Math.pow((nx - 0.5) / 0.08, 2))
      const n = noise2(nx * 10, ny * 10, 11)
      if (ridge > 0.45) return ridge > 0.7 ? [230, 235, 242] : [160, 155, 148]
      if (nx < 0.5) return [55 + n * 20, 120 + n * 30, 60 + n * 15] // wet west
      const dry = 0.8 + 0.15 * n
      return [Math.round(185 * dry), Math.round(155 * dry), Math.round(95 * dry)] // dry east
    },
  })
  strokeLine(data, width, 150, 70, 80, 100, 1.5, 122, 146, 160)
  strokeLine(data, width, 150, 70, 120, 140, 1.4, 122, 146, 160)
  return {
    id: 'fantasy-owned-coherent',
    width,
    height,
    data,
    mode: 'painted',
    title: 'Owned coherent fantasy',
    blurb: 'Self-drawn fantasy continent with windward wet / lee dry and downhill rivers.',
    corpus: 'fantasy-owned',
  }
}

/** Owned fantasy with intentional geography mistakes for benchmark. */
export function sampleFantasyOwnedBroken(): SampleMap {
  const width = 340
  const height = 190
  const data = new Uint8ClampedArray(width * height * 4)
  paintCoastContinent(data, width, height, {
    ocean: [26, 78, 108],
    inLand: (nx, ny) => {
      const blob = Math.exp(-Math.pow((nx - 0.58) / 0.3, 2) - Math.pow((ny - 0.48) / 0.36, 2))
      return blob > 0.32
    },
    landFn: (nx, ny) => {
      const n = noise2(nx * 9, ny * 9, 12)
      const ridge = Math.exp(-Math.pow((nx - 0.52) / 0.06, 2))
      if (ridge > 0.5) {
        return ridge > 0.75 && n > 0.4 ? [235, 238, 245] : [155, 150, 145]
      }
      // flipped shadow: dry west, wet east of the crest
      if (nx < 0.52) {
        const dry = 0.85 + 0.1 * n
        return [Math.round(195 * dry), Math.round(165 * dry), Math.round(100 * dry)]
      }
      return [45 + n * 25, 130 + n * 25, 55 + n * 20]
    },
  })
  // river climbing northeast onto brighter ground
  strokeLine(data, width, 140, 130, 230, 50, 1.55, 125, 148, 162)
  return {
    id: 'fantasy-owned-broken',
    width,
    height,
    data,
    mode: 'painted',
    title: 'Owned broken fantasy',
    blurb: 'Self-drawn fantasy with flipped rain shadow and uphill stream — benchmark only.',
    corpus: 'fantasy-owned',
  }
}

export const ALL_SAMPLE_BUILDERS = [
  sampleBrokenDesertJungle,
  sampleBrokenRiverRidge,
  sampleBrokenStrandedRivers,
  sampleBrokenHotPeaks,
  sampleBrokenPepperPeaks,
  sampleCascadesRainShadow,
  sampleAndesRainShadow,
  sampleFantasyOwnedCoherent,
  sampleFantasyOwnedBroken,
] as const

export function getAllSamples(): SampleMap[] {
  return ALL_SAMPLE_BUILDERS.map((b) => b())
}

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
