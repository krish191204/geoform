/**
 * Shared canvas helpers for labs: resize for sharp pixels, lerp, noise,
 * drawing the little atmosphere vignette. Not the planet generator.
 */
export type StopFn = () => void

export function resizeCanvas(canvas: HTMLCanvasElement) {
  const rect = canvas.getBoundingClientRect()
  const dpr = Math.min(2.5, window.devicePixelRatio || 1)
  const w = Math.max(1, Math.floor(rect.width * dpr))
  const h = Math.max(1, Math.floor(rect.height * dpr))
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w
    canvas.height = h
  }
  return { w, h, dpr, cssW: rect.width, cssH: rect.height }
}

export function clamp(v: number, a: number, b: number) {
  return Math.max(a, Math.min(b, v))
}

export function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t
}

export function smoothstep(e0: number, e1: number, x: number) {
  const t = clamp((x - e0) / (e1 - e0), 0, 1)
  return t * t * (3 - 2 * t)
}

export function softNoise(x: number, y: number, seed = 0) {
  const n =
    Math.sin(x * 1.7 + seed) * Math.cos(y * 1.3 - seed * 0.5) +
    0.5 * Math.sin(x * 3.1 - y * 2.2 + seed * 2) +
    0.25 * Math.sin(x * 6.4 + y * 5.1 - seed)
  return n * 0.5 + 0.5
}

export function idx(x: number, y: number, w: number) {
  return y * w + x
}

/** Bilinear sample of a float grid; u,v in [0,1] */
export function sampleBilinear(grid: Float32Array, gw: number, gh: number, u: number, v: number) {
  const x = clamp(u, 0, 1) * (gw - 1)
  const y = clamp(v, 0, 1) * (gh - 1)
  const x0 = x | 0
  const y0 = y | 0
  const x1 = Math.min(x0 + 1, gw - 1)
  const y1 = Math.min(y0 + 1, gh - 1)
  const tx = x - x0
  const ty = y - y0
  const a = grid[idx(x0, y0, gw)]
  const b = grid[idx(x1, y0, gw)]
  const c = grid[idx(x0, y1, gw)]
  const d = grid[idx(x1, y1, gw)]
  return lerp(lerp(a, b, tx), lerp(c, d, tx), ty)
}

export function hillshade(e: Float32Array, gw: number, gh: number, x: number, y: number, zScale = 2.8) {
  const x0 = Math.max(0, x - 1)
  const x1 = Math.min(gw - 1, x + 1)
  const y0 = Math.max(0, y - 1)
  const y1 = Math.min(gh - 1, y + 1)
  const dzdx = (e[idx(x1, y, gw)] - e[idx(x0, y, gw)]) / Math.max(1, x1 - x0)
  const dzdy = (e[idx(x, y1, gw)] - e[idx(x, y0, gw)]) / Math.max(1, y1 - y0)
  // light from NW
  const lx = -0.55
  const ly = -0.45
  const lz = 0.7
  const nx = -dzdx * zScale
  const ny = -dzdy * zScale
  const nz = 1
  const inv = 1 / Math.hypot(nx, ny, nz)
  const ndot = (nx * inv * lx + ny * inv * ly + nz * inv * lz)
  return clamp(0.35 + ndot * 0.65, 0.15, 1.15)
}

export function terrainColor(elev: number, shade: number, moisture = 0.45): [number, number, number] {
  // layered palette: deep water → beach → grass → rock → snow hint
  let r: number, g: number, b: number
  if (elev < 0.08) {
    const t = elev / 0.08
    r = lerp(28, 48, t)
    g = lerp(72, 110, t)
    b = lerp(98, 140, t)
  } else if (elev < 0.14) {
    const t = (elev - 0.08) / 0.06
    r = lerp(194, 160, t)
    g = lerp(178, 150, t)
    b = lerp(132, 100, t)
  } else if (elev < 0.45) {
    const t = (elev - 0.14) / 0.31
    const lush = moisture
    r = lerp(lerp(92, 70, lush), lerp(110, 88, lush), t)
    g = lerp(lerp(128, 145, lush), lerp(120, 130, lush), t)
    b = lerp(lerp(72, 78, lush), lerp(70, 68, lush), t)
  } else if (elev < 0.72) {
    const t = (elev - 0.45) / 0.27
    r = lerp(118, 148, t)
    g = lerp(120, 132, t)
    b = lerp(98, 112, t)
  } else {
    const t = (elev - 0.72) / 0.28
    r = lerp(168, 232, t)
    g = lerp(160, 236, t)
    b = lerp(148, 242, t)
  }
  return [clamp(r * shade, 0, 255), clamp(g * shade, 0, 255), clamp(b * shade, 0, 255)]
}

/** Paint a smooth hillshaded elevation field into an ImageData buffer */
export function paintTerrain(
  img: ImageData,
  elev: Float32Array,
  gw: number,
  gh: number,
  opts?: { moisture?: Float32Array | null; seaLevel?: number },
) {
  const { data, width: w, height: h } = img
  const sea = opts?.seaLevel ?? 0.08
  for (let py = 0; py < h; py++) {
    const v = (py + 0.5) / h
    for (let px = 0; px < w; px++) {
      const u = (px + 0.5) / w
      let e = sampleBilinear(elev, gw, gh, u, v)
      // slight anti-pixel blur via tiny jitter average
      e =
        (e +
          sampleBilinear(elev, gw, gh, u + 0.4 / w, v) +
          sampleBilinear(elev, gw, gh, u, v + 0.4 / h)) /
        3
      const gx = clamp(Math.round(u * (gw - 1)), 0, gw - 1)
      const gy = clamp(Math.round(v * (gh - 1)), 0, gh - 1)
      const shade = hillshade(elev, gw, gh, gx, gy, e < sea ? 0.8 : 3.2)
      const moist = opts?.moisture ? sampleBilinear(opts.moisture, gw, gh, u, v) : 0.5
      const [r, g, b] = terrainColor(e, shade, moist)
      const i = (py * w + px) * 4
      data[i] = r
      data[i + 1] = g
      data[i + 2] = b
      data[i + 3] = 255
    }
  }
}

export function drawAtmosphere(ctx: CanvasRenderingContext2D, w: number, h: number, t = 0) {
  const sky = ctx.createLinearGradient(0, 0, 0, h)
  sky.addColorStop(0, '#6a8f9c')
  sky.addColorStop(0.45, '#a8c4c0')
  sky.addColorStop(1, '#d8e4d6')
  ctx.fillStyle = sky
  ctx.fillRect(0, 0, w, h)

  // soft sun glow
  const gx = w * (0.78 + 0.02 * Math.sin(t * 0.0003))
  const gy = h * 0.18
  const sun = ctx.createRadialGradient(gx, gy, 0, gx, gy, w * 0.35)
  sun.addColorStop(0, 'rgba(255,236,190,0.45)')
  sun.addColorStop(0.35, 'rgba(255,220,160,0.12)')
  sun.addColorStop(1, 'rgba(255,220,160,0)')
  ctx.fillStyle = sun
  ctx.fillRect(0, 0, w, h)

  // haze
  const haze = ctx.createLinearGradient(0, h * 0.55, 0, h)
  haze.addColorStop(0, 'rgba(220,230,220,0)')
  haze.addColorStop(1, 'rgba(200,210,200,0.25)')
  ctx.fillStyle = haze
  ctx.fillRect(0, 0, w, h)
}

/** Catmull-Rom → bezier polyline for silky strokes */
export function strokeSmooth(
  ctx: CanvasRenderingContext2D,
  pts: { x: number; y: number }[],
  width: number,
  color: string,
) {
  if (pts.length < 2) return
  ctx.strokeStyle = color
  ctx.lineWidth = width
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.beginPath()
  ctx.moveTo(pts[0].x, pts[0].y)
  if (pts.length === 2) {
    ctx.lineTo(pts[1].x, pts[1].y)
  } else {
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[Math.max(0, i - 1)]
      const p1 = pts[i]
      const p2 = pts[i + 1]
      const p3 = pts[Math.min(pts.length - 1, i + 2)]
      const cp1x = p1.x + (p2.x - p0.x) / 6
      const cp1y = p1.y + (p2.y - p0.y) / 6
      const cp2x = p2.x - (p3.x - p1.x) / 6
      const cp2y = p2.y - (p3.y - p1.y) / 6
      ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2.x, p2.y)
    }
  }
  ctx.stroke()
}

export function roundedRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const rr = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + rr, y)
  ctx.arcTo(x + w, y, x + w, y + h, rr)
  ctx.arcTo(x + w, y + h, x, y + h, rr)
  ctx.arcTo(x, y + h, x, y, rr)
  ctx.arcTo(x, y, x + w, y, rr)
  ctx.closePath()
}
