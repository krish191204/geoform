/**
 * Draw the 2D atlas. One canvas pixel (after scale) = one world cell.
 *
 * We walk every cell, pick a color from height / biome / rain / whatever
 * layer is selected, put it in an ImageData, and blit it. Cities are dots
 * on top. The CSS object-fit: contain letterbox around the canvas is UI
 * chrome — not ocean. Ocean is only cells whose height is below sea level.
 */
import { biomeColor, type Layer, type SeaNavClass, type TradeRoute, type World } from '../world/types'
import { RIVER_MAIN_MIN, RIVER_VISIBLE_MIN } from '../world/climate'
import { classifySeaCell } from '../world/tradeRoutes'

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t
}

function clamp(v: number, lo = 0, hi = 255) {
  return Math.max(lo, Math.min(hi, v))
}

function mix(
  a: [number, number, number],
  b: [number, number, number],
  t: number,
): [number, number, number] {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]
}

/** Atlas bathymetry → coastal shelf → verdant lowlands → rock → snow */
function elevColor(e: number, sea: number): [number, number, number] {
  if (e < sea) {
    const t = e / sea
    if (t < 0.45) return mix([8, 28, 48], [18, 62, 92], t / 0.45)
    if (t < 0.85) return mix([18, 62, 92], [36, 110, 128], (t - 0.45) / 0.4)
    return mix([36, 110, 128], [70, 150, 148], (t - 0.85) / 0.15)
  }
  const t = (e - sea) / Math.max(1e-6, 1 - sea)
  if (t < 0.08) return mix([168, 176, 122], [92, 138, 72], t / 0.08) // beach → grass
  if (t < 0.28) return mix([92, 138, 72], [58, 112, 58], (t - 0.08) / 0.2)
  if (t < 0.5) return mix([58, 112, 58], [110, 118, 72], (t - 0.28) / 0.22)
  if (t < 0.72) return mix([110, 118, 72], [128, 112, 88], (t - 0.5) / 0.22)
  if (t < 0.88) return mix([128, 112, 88], [168, 162, 152], (t - 0.72) / 0.16)
  return mix([168, 162, 152], [246, 248, 250], (t - 0.88) / 0.12)
}

function heat(t: number): [number, number, number] {
  if (t < 0.33) return mix([40, 70, 170], [70, 160, 170], t / 0.33)
  if (t < 0.66) return mix([70, 160, 170], [210, 170, 70], (t - 0.33) / 0.33)
  return mix([210, 170, 70], [200, 70, 40], (t - 0.66) / 0.34)
}

function moistureColor(m: number): [number, number, number] {
  if (m < 0.35) return mix([196, 150, 88], [170, 140, 70], m / 0.35)
  if (m < 0.65) return mix([170, 140, 70], [70, 130, 90], (m - 0.35) / 0.3)
  return mix([70, 130, 90], [30, 100, 140], (m - 0.65) / 0.35)
}

function suitColor(s: number): [number, number, number] {
  if (s < 0.28) return mix([120, 48, 40], [150, 70, 38], s / 0.28)
  if (s < 0.52) return mix([150, 70, 38], [170, 150, 50], (s - 0.28) / 0.24)
  return mix([170, 150, 50], [50, 140, 70], (s - 0.52) / 0.48)
}

const PLATE_PALETTE: [number, number, number][] = [
  [214, 106, 72],
  [72, 148, 140],
  [196, 150, 70],
  [110, 120, 170],
  [150, 100, 120],
  [90, 140, 90],
  [180, 120, 90],
  [100, 160, 180],
  [170, 90, 90],
  [130, 130, 90],
  [90, 110, 140],
  [160, 140, 110],
]

function sampleElev(world: World, x: number, y: number): number {
  const { width: w, height: h, elev } = world
  const x0 = Math.floor(x)
  const y0 = Math.floor(y)
  const x1 = Math.min(w - 1, x0 + 1)
  const y1 = Math.min(h - 1, y0 + 1)
  const fx = x - x0
  const fy = y - y0
  const e00 = elev[y0 * w + x0]
  const e10 = elev[y0 * w + x1]
  const e01 = elev[y1 * w + x0]
  const e11 = elev[y1 * w + x1]
  return lerp(lerp(e00, e10, fx), lerp(e01, e11, fx), fy)
}

function isCoast(world: World, x: number, y: number): boolean {
  const { width: w, height: h, elev, seaLevel } = world
  const land = elev[y * w + x] >= seaLevel
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue
      const nx = x + dx
      const ny = y + dy
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue
      const nLand = elev[ny * w + nx] >= seaLevel
      if (nLand !== land) return true
    }
  }
  return false
}

function cellColor(
  world: World,
  layer: Layer,
  x: number,
  y: number,
  riverAmt: number,
  time: number,
): [number, number, number] {
  const { width: w, height: h, seaLevel } = world
  const i = y * w + x
  const e = world.elev[i]
  let rgb: [number, number, number]

  switch (layer) {
    case 'relief':
    case 'elevation':
      rgb = elevColor(e, seaLevel)
      break
    case 'plates': {
      const p = world.plateId[i] % PLATE_PALETTE.length
      rgb = [...PLATE_PALETTE[p]] as [number, number, number]
      if (e < seaLevel) rgb = mix(rgb, [20, 50, 70], 0.55)
      break
    }
    case 'moisture':
      rgb = e < seaLevel ? ([22, 58, 82] as [number, number, number]) : moistureColor(world.moist[i])
      break
    case 'temperature':
      rgb = e < seaLevel ? ([22, 58, 82] as [number, number, number]) : heat(world.temp[i])
      break
    case 'biome':
      rgb = hexToRgb(biomeColor(world.biome[i]))
      break
    case 'suitability':
      rgb = e < seaLevel ? ([18, 48, 68] as [number, number, number]) : suitColor(world.suitability[i])
      break
    default:
      rgb = elevColor(e, seaLevel)
  }

  // Hillshade on relief / biome / elevation for depth
  if (layer === 'relief' || layer === 'biome' || layer === 'elevation') {
    const er = sampleElev(world, Math.min(w - 1.001, x + 1), y)
    const ed = sampleElev(world, x, Math.min(h - 1.001, y + 1))
    const dx = e - er
    const dy = e - ed
    // Soft directional light from NW
    const shade = 0.72 + dx * 4.2 + dy * 3.0
    const ambient = layer === 'biome' ? 0.55 : 0.35
    const lit = ambient + (1 - ambient) * clamp(shade, 0.45, 1.35) / 1.15
    rgb = [clamp(rgb[0] * lit), clamp(rgb[1] * lit), clamp(rgb[2] * lit)]
  }

  // Animated deep-water caustic shimmer
  if (e < seaLevel && (layer === 'relief' || layer === 'biome' || layer === 'elevation')) {
    const depth = 1 - e / seaLevel
    const wave =
      0.5 +
      0.5 *
        Math.sin(x * 0.35 + time * 1.6 + Math.cos(y * 0.22) * 2) *
        Math.sin(y * 0.4 - time * 1.1)
    const shimmer = wave * depth * 0.14
    rgb = [
      clamp(rgb[0] + shimmer * 40),
      clamp(rgb[1] + shimmer * 70),
      clamp(rgb[2] + shimmer * 90),
    ]
  }

  // Coast foam / ink edge
  if (isCoast(world, x, y) && layer !== 'plates') {
    if (e < seaLevel) {
      rgb = mix(rgb, [210, 230, 230], 0.28)
    } else {
      rgb = mix(rgb, [30, 42, 36], 0.22)
    }
  }

  // Rivers — tributaries faint, main stems brighter (Azgaar-like network)
  if (riverAmt > 0 && layer !== 'plates' && e >= seaLevel) {
    const f = world.flux[i]
    if (f >= RIVER_VISIBLE_MIN) {
      const isMain = f >= RIVER_MAIN_MIN
      const strength = isMain
        ? Math.min(1, (f - RIVER_MAIN_MIN) / 12)
        : Math.min(1, (f - RIVER_VISIBLE_MIN) / 8)
      const pulse = 0.85 + 0.15 * Math.sin(time * 3 + x * 0.2 + y * 0.15)
      const base = isMain ? 0.55 : 0.32
      const t = (base + strength * 0.38) * pulse * riverAmt
      rgb = mix(rgb, isMain ? [45, 125, 185] : [70, 155, 195], t)
    }
  }

  // Micro-texture so flats don't look like solid fill
  const grain =
    ((Math.sin(x * 12.9898 + y * 78.233) * 43758.5453) % 1) * 0.1 - 0.05
  rgb = [clamp(rgb[0] * (1 + grain)), clamp(rgb[1] * (1 + grain)), clamp(rgb[2] * (1 + grain))]

  return rgb
}

/** Which coloring the 2D map (and globe bake) uses. Satellite / night are extra looks, not extra data. */
export type MapLook = Layer | 'satellite' | 'night'

function satelliteColor(world: World, x: number, y: number): [number, number, number] {
  const { width: w, seaLevel } = world
  const i = y * w + x
  const e = world.elev[i]
  if (e < seaLevel) {
    const t = e / Math.max(1e-6, seaLevel)
    if (t < 0.4) return mix([4, 18, 42], [12, 52, 92], t / 0.4)
    return mix([12, 52, 92], [40, 120, 130], (t - 0.4) / 0.6)
  }
  const bio = hexToRgb(biomeColor(world.biome[i]))
  const rel = elevColor(e, seaLevel)
  return mix(rel, bio, 0.55)
}

function nightColor(world: World, x: number, y: number): [number, number, number] {
  const { width: w, seaLevel } = world
  const i = y * w + x
  const e = world.elev[i]
  let rgb: [number, number, number]
  if (e < seaLevel) {
    rgb = mix([6, 12, 28], [14, 28, 52], e / Math.max(1e-6, seaLevel))
  } else {
    const t = (e - seaLevel) / Math.max(1e-6, 1 - seaLevel)
    rgb = mix([22, 28, 38], [48, 52, 62], Math.min(1, t * 1.4))
  }
  let lights = 0
  if (e >= seaLevel) {
    lights += Math.max(0, world.suitability[i] - 0.55) * 0.9
    for (const c of world.cities) {
      const d = Math.hypot(c.x - x, c.y - y)
      if (d < 3.5) lights = Math.max(lights, 1 - d / 3.5)
    }
  }
  if (lights > 0) rgb = mix(rgb, [255, 210, 140], Math.min(1, lights))
  return rgb
}

function lookColor(world: World, look: MapLook, x: number, y: number, time = 0): [number, number, number] {
  if (look === 'satellite') {
    let rgb = satelliteColor(world, x, y)
    const e = world.elev[y * world.width + x]
    const er = sampleElev(world, Math.min(world.width - 1.001, x + 1), y)
    const ed = sampleElev(world, x, Math.min(world.height - 1.001, y + 1))
    const shade = 0.72 + (e - er) * 4.2 + (e - ed) * 3.0
    const lit = 0.4 + 0.6 * clamp(shade, 0.45, 1.35) / 1.15
    return [clamp(rgb[0] * lit), clamp(rgb[1] * lit), clamp(rgb[2] * lit)]
  }
  if (look === 'night') return nightColor(world, x, y)
  return cellColor(world, look, x, y, look === 'plates' ? 0 : 1, time)
}

export function bakeWorldImageData(world: World, look: MapLook, scale = 2): ImageData {
  const { width: w, height: h } = world
  const cw = Math.max(1, w * scale)
  const ch = Math.max(1, h * scale)
  const image = new ImageData(cw, ch)
  const data = image.data
  for (let py = 0; py < ch; py++) {
    const y = Math.min(h - 1, (py / scale) | 0)
    for (let px = 0; px < cw; px++) {
      const x = Math.min(w - 1, (px / scale) | 0)
      const [r, g, b] = lookColor(world, look, x, y, 0)
      const o = (py * cw + px) * 4
      data[o] = r
      data[o + 1] = g
      data[o + 2] = b
      data[o + 3] = 255
    }
  }
  if (look !== 'night') {
    for (const c of world.cities) {
      const cx = Math.round((c.x + 0.5) * scale)
      const cy = Math.round((c.y + 0.5) * scale)
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const px = cx + dx
          const py = cy + dy
          if (px < 0 || py < 0 || px >= cw || py >= ch) continue
          const o = (py * cw + px) * 4
          data[o] = 245
          data[o + 1] = 236
          data[o + 2] = 214
        }
      }
    }
  }
  return image
}

export function bakeBumpImageData(world: World, scale = 2): ImageData {
  const { width: w, height: h, elev, seaLevel } = world
  const cw = Math.max(1, w * scale)
  const ch = Math.max(1, h * scale)
  const image = new ImageData(cw, ch)
  const data = image.data
  for (let py = 0; py < ch; py++) {
    const y = Math.min(h - 1, (py / scale) | 0)
    for (let px = 0; px < cw; px++) {
      const x = Math.min(w - 1, (px / scale) | 0)
      const e = elev[y * w + x]
      const v = e < seaLevel ? Math.round((e / seaLevel) * 70) : Math.round(90 + ((e - seaLevel) / Math.max(1e-6, 1 - seaLevel)) * 165)
      const o = (py * cw + px) * 4
      data[o] = v
      data[o + 1] = v
      data[o + 2] = v
      data[o + 3] = 255
    }
  }
  return image
}

/** RGB normal map from elevation slope — sharper mountains on the 3D globe. */
export function bakeNormalImageData(world: World, scale = 2): ImageData {
  const { width: w, height: h, elev, seaLevel } = world
  const cw = Math.max(1, w * scale)
  const ch = Math.max(1, h * scale)
  const image = new ImageData(cw, ch)
  const data = image.data

  const sample = (x: number, y: number) => {
    const cx = Math.max(0, Math.min(w - 1, x))
    const cy = Math.max(0, Math.min(h - 1, y))
    return elev[cy * w + cx]
  }

  for (let py = 0; py < ch; py++) {
    const y = Math.min(h - 1, (py / scale) | 0)
    for (let px = 0; px < cw; px++) {
      const x = Math.min(w - 1, (px / scale) | 0)
      const e = elev[y * w + x]
      const dx = (sample(x + 1, y) - sample(x - 1, y)) * 2.4
      const dy = (sample(x, y + 1) - sample(x, y - 1)) * 2.4
      const dz = e < seaLevel ? 0.35 : 0.85 + Math.max(0, e - seaLevel) * 0.5
      const len = Math.hypot(dx, dy, dz) || 1
      const o = (py * cw + px) * 4
      data[o] = Math.round((-dx / len) * 0.5 * 255 + 128)
      data[o + 1] = Math.round((dy / len) * 0.5 * 255 + 128)
      data[o + 2] = Math.round((dz / len) * 0.5 * 255 + 128)
      data[o + 3] = 255
    }
  }
  return image
}

/** Displacement height for globe mesh (land rises, ocean sinks slightly). */
export function bakeDisplacementImageData(world: World, scale = 2): ImageData {
  const { width: w, height: h, elev, seaLevel } = world
  const cw = Math.max(1, w * scale)
  const ch = Math.max(1, h * scale)
  const image = new ImageData(cw, ch)
  const data = image.data
  for (let py = 0; py < ch; py++) {
    const y = Math.min(h - 1, (py / scale) | 0)
    for (let px = 0; px < cw; px++) {
      const x = Math.min(w - 1, (px / scale) | 0)
      const e = elev[y * w + x]
      const v =
        e < seaLevel
          ? Math.round(40 + (e / Math.max(seaLevel, 1e-6)) * 30)
          : Math.round(110 + ((e - seaLevel) / Math.max(1e-6, 1 - seaLevel)) * 145)
      const o = (py * cw + px) * 4
      data[o] = v
      data[o + 1] = v
      data[o + 2] = v
      data[o + 3] = 255
    }
  }
  return image
}

export interface DrawOptions {
  layer: Layer
  showRivers: boolean
  showCities: boolean
  /** Maritime lanes and sea hazard overlay. */
  showTradeRoutes?: boolean
  scale?: number
  time?: number
  hover?: { x: number; y: number } | null
  brush?: number
  tool?: string
  painting?: boolean
  /** Fade river overlay while climate is stale / recomputing */
  riversMuted?: boolean
  /**
   * For city / continent / raze: true = green ring (allowed), false = red (blocked),
   * null = normal brush colors.
   */
  placeOk?: boolean | null
}

const HAZARD_TINT: Record<SeaNavClass, [number, number, number, number]> = {
  blocked: [120, 28, 28, 0.28],
  coastal: [180, 110, 40, 0.22],
  polar: [140, 170, 210, 0.24],
  open: [0, 0, 0, 0],
}

const ROUTE_STROKE: Record<TradeRoute['hazard'], string> = {
  open: 'rgba(255, 220, 150, 0.88)',
  coastal: 'rgba(255, 190, 110, 0.9)',
  polar: 'rgba(190, 215, 255, 0.88)',
  mixed: 'rgba(255, 200, 130, 0.9)',
}

function strokeRoute(
  ctx: CanvasRenderingContext2D,
  pts: { x: number; y: number }[],
  scale: number,
  hazard: TradeRoute['hazard'],
  width: number,
) {
  if (pts.length < 2) return
  ctx.save()
  ctx.strokeStyle = ROUTE_STROKE[hazard]
  ctx.lineWidth = 2.2
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  ctx.setLineDash(hazard === 'open' ? [7, 5] : [4, 4])
  const px = (x: number) => (x + 0.5) * scale
  const py = (y: number) => (y + 0.5) * scale
  ctx.beginPath()
  ctx.moveTo(px(pts[0].x), py(pts[0].y))
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]
    const b = pts[i]
    const dx = b.x - a.x
    if (Math.abs(dx) > width / 2) {
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(px(b.x), py(b.y))
      continue
    }
    ctx.lineTo(px(b.x), py(b.y))
  }
  ctx.stroke()
  ctx.setLineDash([])
  ctx.restore()
}

/** Soft hazard wash — bilinear upsample so the overlay is not chunky cell squares. */
function drawSeaHazards(
  ctx: CanvasRenderingContext2D,
  world: World,
  scale: number,
) {
  const { width: w, height: h, seaLevel, elev } = world
  const cw = w * scale
  const ch = h * scale
  const image = new ImageData(cw, ch)
  const data = image.data

  const sample = (x: number, y: number): [number, number, number, number] => {
    if (y < 0 || y >= h || elev[y * w + x] >= seaLevel) return [0, 0, 0, 0]
    return HAZARD_TINT[classifySeaCell(world, x, y)]
  }

  const mixA = (
    a: [number, number, number, number],
    b: [number, number, number, number],
    t: number,
  ): [number, number, number, number] => [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
    a[3] + (b[3] - a[3]) * t,
  ]

  for (let py = 0; py < ch; py++) {
    const yf = py / scale
    const y0 = Math.min(h - 1, yf | 0)
    const y1 = Math.min(h - 1, y0 + 1)
    const fy = yf - y0
    for (let px = 0; px < cw; px++) {
      const xf = px / scale
      const x0 = wrapX(xf | 0, w)
      const x1 = wrapX((xf | 0) + 1, w)
      const fx = xf - (xf | 0)
      const c00 = sample(x0, y0)
      const c10 = sample(x1, y0)
      const c01 = sample(x0, y1)
      const c11 = sample(x1, y1)
      const top = mixA(c00, c10, fx)
      const bot = mixA(c01, c11, fx)
      const [r, g, b, a] = mixA(top, bot, fy)
      const o = (py * cw + px) * 4
      data[o] = clamp(r)
      data[o + 1] = clamp(g)
      data[o + 2] = clamp(b)
      data[o + 3] = clamp(a * 255)
    }
  }

  ctx.save()
  // putImageData replaces pixels (punches holes in land). drawImage alpha-blends.
  const layer =
    typeof OffscreenCanvas !== 'undefined'
      ? new OffscreenCanvas(cw, ch)
      : (() => {
          const c = document.createElement('canvas')
          c.width = cw
          c.height = ch
          return c
        })()
  const layerCtx = layer.getContext('2d')
  if (!layerCtx) {
    ctx.restore()
    return
  }
  layerCtx.putImageData(image, 0, 0)
  ctx.drawImage(layer as CanvasImageSource, 0, 0)
  ctx.restore()
}

function wrapX(x: number, w: number): number {
  return ((x % w) + w) % w
}

interface WindParticle {
  x: number
  y: number
  vx: number
  life: number
}

function hashWorld(world: World): string {
  const mid = (world.elev.length / 2) | 0
  const q = (world.elev.length / 4) | 0
  const a = (world.elev.length / 5) | 0
  const b = (world.elev.length / 3) | 0
  // Sample several cells so paint away from mid/q still busts the bitmap cache.
  return `${world.width}x${world.height}:${world.elev[0]}:${world.elev[mid]}:${world.elev[q]}:${world.elev[a]}:${world.elev[b]}:${world.moist[mid]}:${world.flux[mid]}:${world.biome[mid]}:${world.plateId[mid]}:${world.cities.length}`
}

/**
 * Paints the atlas canvas from World arrays.
 * We cache the last bitmap so we only redraw cells when height/climate changed.
 * scale drops 4→3→2 on huge grids so zoom-out stays fast.
 */
export class MapRenderer {
  private cacheKey = ''
  private base: ImageData | null = null
  private scale = 4
  private particles: WindParticle[] = []
  private lastW = 0
  private lastH = 0

  private shimmerBuf: ImageData | null = null
  private shimmerFrame = 0

  invalidate() {
    this.cacheKey = ''
    this.base = null
    this.shimmerBuf = null
  }

  private ensureParticles(w: number, h: number) {
    if (this.particles.length && this.lastW === w && this.lastH === h) return
    this.lastW = w
    this.lastH = h
    this.particles = Array.from({ length: 90 }, () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      vx: 0.35 + Math.random() * 0.55,
      life: Math.random(),
    }))
  }

  private rebuildBase(world: World, opts: DrawOptions, time: number) {
    const scale = opts.scale ?? this.scale
    this.scale = scale
    const { width: w, height: h } = world
    const cw = w * scale
    const ch = h * scale
    const riverAmt = opts.showRivers ? (opts.riversMuted ? 0.28 : 1) : 0
    const image = new ImageData(cw, ch)
    const data = image.data

    for (let py = 0; py < ch; py++) {
      const yf = py / scale
      const y0 = Math.min(h - 1, yf | 0)
      const y1 = Math.min(h - 1, y0 + 1)
      const fy = yf - y0
      for (let px = 0; px < cw; px++) {
        const xf = px / scale
        const x0 = Math.min(w - 1, xf | 0)
        const x1 = Math.min(w - 1, x0 + 1)
        const fx = xf - x0

        const c00 = cellColor(world, opts.layer, x0, y0, riverAmt, time)
        const c10 = cellColor(world, opts.layer, x1, y0, riverAmt, time)
        const c01 = cellColor(world, opts.layer, x0, y1, riverAmt, time)
        const c11 = cellColor(world, opts.layer, x1, y1, riverAmt, time)
        const top = mix(c00, c10, fx)
        const bot = mix(c01, c11, fx)
        const [r, g, b] = mix(top, bot, fy)

        const o = (py * cw + px) * 4
        data[o] = r
        data[o + 1] = g
        data[o + 2] = b
        data[o + 3] = 255
      }
    }

    // Soft vignette baked lightly into edges
    for (let py = 0; py < ch; py++) {
      for (let px = 0; px < cw; px++) {
        const nx = (px / cw) * 2 - 1
        const ny = (py / ch) * 2 - 1
        const v = Math.min(1, Math.sqrt(nx * nx * 0.7 + ny * ny * 0.95))
        const dark = 1 - v * v * 0.18
        const o = (py * cw + px) * 4
        data[o] = clamp(data[o] * dark)
        data[o + 1] = clamp(data[o + 1] * dark)
        data[o + 2] = clamp(data[o + 2] * dark)
      }
    }

    this.base = image
  }

  draw(ctx: CanvasRenderingContext2D, world: World, opts: DrawOptions) {
    const time = opts.time ?? performance.now() / 1000
    const scale = opts.scale ?? this.scale
    const cw = world.width * scale
    const ch = world.height * scale
    if (ctx.canvas.width !== cw || ctx.canvas.height !== ch) {
      ctx.canvas.width = cw
      ctx.canvas.height = ch
    }

    // Rebuild when world/layer changes — not every shimmer tick
    const key = `${world.seed}|${hashWorld(world)}|${opts.layer}|${opts.showRivers}|${opts.riversMuted ? 1 : 0}|${scale}`
    if (key !== this.cacheKey || !this.base) {
      this.rebuildBase(world, opts, 0)
      this.cacheKey = key
    }

    ctx.putImageData(this.base!, 0, 0)

    const reduceMotion =
      typeof window !== 'undefined' &&
      (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false)

    // Throttled water shimmer (every 3rd frame) — keeps motion without melting the CPU
    if (
      !reduceMotion &&
      (opts.layer === 'relief' || opts.layer === 'biome' || opts.layer === 'elevation')
    ) {
      this.shimmerFrame++
      if (this.shimmerFrame % 3 === 0 || !this.shimmerBuf) {
        const img = new ImageData(new Uint8ClampedArray(this.base!.data), cw, ch)
        const data = img.data
        for (let y = 0; y < world.height; y++) {
          for (let x = 0; x < world.width; x++) {
            const i = y * world.width + x
            if (world.elev[i] >= world.seaLevel) continue
            const depth = 1 - world.elev[i] / world.seaLevel
            const wave =
              0.5 +
              0.5 *
                Math.sin(x * 0.35 + time * 1.6 + Math.cos(y * 0.22) * 2) *
                Math.sin(y * 0.4 - time * 1.1)
            const shimmer = wave * depth * 0.16
            for (let sy = 0; sy < scale; sy++) {
              for (let sx = 0; sx < scale; sx++) {
                const o = ((y * scale + sy) * cw + (x * scale + sx)) * 4
                data[o] = clamp(data[o] + shimmer * 40)
                data[o + 1] = clamp(data[o + 1] + shimmer * 70)
                data[o + 2] = clamp(data[o + 2] + shimmer * 90)
              }
            }
          }
        }
        this.shimmerBuf = img
      }
      if (this.shimmerBuf) ctx.putImageData(this.shimmerBuf, 0, 0)
    }

    // Wind streamers (moisture / relief)
    if (!reduceMotion && (opts.layer === 'moisture' || opts.layer === 'relief')) {
      this.ensureParticles(world.width, world.height)
      ctx.save()
      ctx.globalCompositeOperation = 'lighter'
      for (const p of this.particles) {
        p.x += p.vx * 0.55
        p.life += 0.008
        if (p.x > world.width || p.life > 1) {
          p.x = 0
          p.y = Math.random() * world.height
          p.life = 0
        }
        const i = Math.min(world.height - 1, p.y | 0) * world.width + Math.min(world.width - 1, p.x | 0)
        const blocked = world.elev[i] > world.seaLevel + 0.28
        const alpha = blocked ? 0.04 : 0.12 * (1 - Math.abs(p.life - 0.5) * 2)
        ctx.strokeStyle = `rgba(210, 235, 255, ${alpha})`
        ctx.lineWidth = 1.2
        ctx.beginPath()
        ctx.moveTo(p.x * scale, p.y * scale)
        ctx.lineTo((p.x + 2.8) * scale, (p.y + Math.sin(p.x * 0.3) * 0.35) * scale)
        ctx.stroke()
      }
      ctx.restore()
    }

    // Brush preview — red when a stamp would be refused, green when allowed.
    if (
      opts.hover &&
      opts.tool &&
      opts.tool !== 'inspect'
    ) {
      const { x, y } = opts.hover
      const r = (opts.brush ?? 6) * scale
      const isCarve = opts.tool === 'lower' || opts.tool === 'channel' || opts.tool === 'sea'
      const isStamp =
        opts.tool === 'city' || opts.tool === 'razecity' || opts.tool === 'continent'
      const placeOk = opts.placeOk
      ctx.save()
      ctx.beginPath()
      ctx.arc(
        (x + 0.5) * scale,
        (y + 0.5) * scale,
        isStamp ? Math.max(10, r * 0.45) : r,
        0,
        Math.PI * 2,
      )
      let stroke = 'rgba(243,238,220,0.92)'
      let fill = 'rgba(243,238,220,0.07)'
      if (placeOk === false) {
        stroke = 'rgba(176,48,40,0.95)'
        fill = 'rgba(176,48,40,0.14)'
      } else if (placeOk === true) {
        stroke = 'rgba(54,120,72,0.95)'
        fill = 'rgba(54,120,72,0.12)'
      } else if (isCarve) {
        stroke = 'rgba(180,70,40,0.9)'
        fill = 'rgba(180,70,40,0.08)'
      } else if (opts.tool === 'smooth' || opts.tool === 'plateau') {
        stroke = 'rgba(90,140,160,0.9)'
        fill = 'rgba(90,140,160,0.08)'
      }
      ctx.strokeStyle = stroke
      ctx.lineWidth = opts.painting ? 2.5 : 1.6
      ctx.setLineDash(
        isStamp
          ? placeOk === false
            ? [3, 4]
            : [5, 4]
          : opts.tool === 'ridge' || opts.tool === 'channel'
            ? [6, 3]
            : [],
      )
      ctx.stroke()
      ctx.fillStyle = fill
      ctx.fill()
      // Tiny X when blocked so it reads even without color.
      if (placeOk === false) {
        const cx = (x + 0.5) * scale
        const cy = (y + 0.5) * scale
        const arm = Math.max(5, r * 0.22)
        ctx.beginPath()
        ctx.moveTo(cx - arm, cy - arm)
        ctx.lineTo(cx + arm, cy + arm)
        ctx.moveTo(cx + arm, cy - arm)
        ctx.lineTo(cx - arm, cy + arm)
        ctx.strokeStyle = 'rgba(176,48,40,0.95)'
        ctx.lineWidth = 2
        ctx.setLineDash([])
        ctx.stroke()
      }
      ctx.restore()
    }

    // Maritime trade routes + sea hazard overlay
    if (opts.showTradeRoutes) {
      drawSeaHazards(ctx, world, scale)
      for (const route of world.tradeRoutes) {
        strokeRoute(ctx, route.waypoints, scale, route.hazard, world.width)
      }
    }

    // Cities with soft pulse
    if (opts.showCities) {
      const pulse = 0.65 + 0.35 * Math.sin(time * 2.4)
      ctx.save()
      for (const city of world.cities) {
        const px = (city.x + 0.5) * scale
        const py = (city.y + 0.5) * scale
        ctx.beginPath()
        ctx.arc(px, py, 7 + pulse * 2, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(242, 230, 201, ${0.12 + pulse * 0.1})`
        ctx.fill()
        ctx.fillStyle = '#1a1a16'
        ctx.beginPath()
        ctx.arc(px, py, 4.4, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = '#f2e6c9'
        ctx.beginPath()
        ctx.arc(px, py, 2.5, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = 'rgba(20,24,20,0.9)'
        ctx.font = '600 12px Outfit, sans-serif'
        ctx.shadowColor = 'rgba(243,238,220,0.7)'
        ctx.shadowBlur = 4
        ctx.fillText(city.name, px + 7, py + 4)
        ctx.shadowBlur = 0
      }
      ctx.restore()
    }
  }
}

/** Normalize a client point onto a contain-fitted bitmap (object-fit: contain). */
export function clientToContainedBitmap(
  clientX: number,
  clientY: number,
  rect: { left: number; top: number; width: number; height: number },
  bitmapW: number,
  bitmapH: number,
): { nx: number; ny: number } | null {
  if (rect.width < 1 || rect.height < 1 || bitmapW < 1 || bitmapH < 1) return null
  const boxAspect = rect.width / rect.height
  const bmpAspect = bitmapW / bitmapH
  let left = rect.left
  let top = rect.top
  let drawW = rect.width
  let drawH = rect.height
  if (boxAspect > bmpAspect + 1e-6) {
    drawW = drawH * bmpAspect
    left += (rect.width - drawW) / 2
  } else if (bmpAspect > boxAspect + 1e-6) {
    drawH = drawW / bmpAspect
    top += (rect.height - drawH) / 2
  }
  const nx = (clientX - left) / drawW
  const ny = (clientY - top) / drawH
  if (nx < 0 || ny < 0 || nx > 1 || ny > 1) return null
  return { nx, ny }
}

/** Mouse pixel → world cell, accounting for the letterbox around a contain-fit canvas. */
export function screenToCell(
  canvas: HTMLCanvasElement,
  clientX: number,
  clientY: number,
  world: World,
): { x: number; y: number } | null {
  const rect = canvas.getBoundingClientRect()
  const mapped = clientToContainedBitmap(clientX, clientY, rect, canvas.width, canvas.height)
  if (!mapped) return null
  const x = Math.floor(mapped.nx * world.width)
  const y = Math.floor(mapped.ny * world.height)
  if (x < 0 || y < 0 || x >= world.width || y >= world.height) return null
  return { x, y }
}
