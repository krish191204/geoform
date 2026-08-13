/**
 * Draw the critique preview: the map image plus pins on issues.
 * Clicking a pin in the list highlights it here.
 */
import type { CritiqueResult, MapIssue } from './types'

export function drawCritiquePreview(
  canvas: HTMLCanvasElement,
  result: CritiqueResult,
  activeId: string | null,
  imageBitmap?: ImageBitmap | HTMLImageElement | HTMLCanvasElement | null,
) {
  const dpr = Math.min(2, devicePixelRatio || 1)
  const rect = canvas.getBoundingClientRect()
  const tw = Math.max(1, Math.floor(rect.width * dpr))
  const th = Math.max(1, Math.floor(rect.height * dpr))
  if (canvas.width !== tw || canvas.height !== th) {
    canvas.width = tw
    canvas.height = th
  }
  const ctx = canvas.getContext('2d')!
  ctx.clearRect(0, 0, tw, th)

  if (imageBitmap) {
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    // cover
    const scale = Math.max(tw / imageBitmap.width, th / imageBitmap.height)
    const dw = imageBitmap.width * scale
    const dh = imageBitmap.height * scale
    ctx.drawImage(imageBitmap, (tw - dw) / 2, (th - dh) / 2, dw, dh)
    ctx.fillStyle = 'rgba(10,24,28,0.18)'
    ctx.fillRect(0, 0, tw, th)
  } else if (result.elev) {
    paintElev(ctx, tw, th, result)
  } else {
    ctx.fillStyle = '#1a3a42'
    ctx.fillRect(0, 0, tw, th)
  }

  // vignette
  const g = ctx.createRadialGradient(tw / 2, th / 2, th * 0.2, tw / 2, th / 2, th * 0.75)
  g.addColorStop(0, 'rgba(0,0,0,0)')
  g.addColorStop(1, 'rgba(8,18,22,0.35)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, tw, th)

  for (const issue of result.issues) {
    if (!issue.at) continue
    drawPin(ctx, issue, issue.id === activeId, tw, th, dpr)
  }
}

function paintElev(ctx: CanvasRenderingContext2D, tw: number, th: number, result: CritiqueResult) {
  const { width: w, height: h, elev, water } = result
  if (!elev) return
  const img = ctx.createImageData(tw, th)
  for (let py = 0; py < th; py++) {
    for (let px = 0; px < tw; px++) {
      const u = px / tw
      const v = py / th
      const x = Math.min(w - 1, (u * w) | 0)
      const y = Math.min(h - 1, (v * h) | 0)
      const i = y * w + x
      const e = elev[i]
      const wet = water?.[i] ?? (e < 0.12 ? 1 : 0)
      const o = (py * tw + px) * 4
      if (wet > 0.5) {
        img.data[o] = 40
        img.data[o + 1] = 95
        img.data[o + 2] = 125
      } else {
        const t = e
        img.data[o] = (70 + t * 120) | 0
        img.data[o + 1] = (100 + t * 80) | 0
        img.data[o + 2] = (65 + t * 40) | 0
      }
      img.data[o + 3] = 255
    }
  }
  ctx.putImageData(img, 0, 0)
}

function drawPin(
  ctx: CanvasRenderingContext2D,
  issue: MapIssue,
  active: boolean,
  tw: number,
  th: number,
  dpr: number,
) {
  if (!issue.at) return
  const x = issue.at.x * tw
  const y = issue.at.y * th
  const color =
    issue.severity === 'critical'
      ? '#c43c1a'
      : issue.severity === 'major'
        ? '#b85a2a'
        : issue.severity === 'minor'
          ? '#8a6a28'
          : '#3d5a55'
  const r = (active ? 9 : 6) * dpr
  ctx.beginPath()
  ctx.arc(x, y, r * 2.2, 0, Math.PI * 2)
  ctx.fillStyle = active ? 'rgba(255,240,210,0.25)' : 'rgba(0,0,0,0.15)'
  ctx.fill()
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.fillStyle = color
  ctx.fill()
  ctx.strokeStyle = 'rgba(255,255,255,0.85)'
  ctx.lineWidth = 1.5 * dpr
  ctx.stroke()
}
