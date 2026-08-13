import { classifyBiome } from './climate'
import { fbm } from './noise'
import type { World } from './types'

export const MAX_WORLD_WIDTH = 640
export const MAX_WORLD_HEIGHT = 320

const idx = (w: number, x: number, y: number) => y * w + x

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v))
}

/** How many extra cells are needed so the map still fills the view after a zoom-out. */
export function padsForZoomOut(
  world: World,
  factor: number,
  focusX: number,
  focusY: number,
): { left: number; right: number; top: number; bottom: number } | null {
  const scaleUp = 1 / Math.max(0.5, Math.min(0.98, factor))
  let extraW = Math.max(8, Math.round(world.width * (scaleUp - 1)))
  let extraH = Math.max(4, Math.round(world.height * (scaleUp - 1)))
  extraW = Math.min(extraW, MAX_WORLD_WIDTH - world.width)
  extraH = Math.min(extraH, MAX_WORLD_HEIGHT - world.height)
  if (extraW <= 0 && extraH <= 0) return null

  const fx = clamp(focusX, 0, 1)
  const fy = clamp(focusY, 0, 1)
  const left = extraW > 0 ? clamp(Math.round(extraW * fx), 0, extraW) : 0
  const top = extraH > 0 ? clamp(Math.round(extraH * fy), 0, extraH) : 0
  return {
    left,
    right: extraW - left,
    top,
    bottom: extraH - top,
  }
}

export function expandWorld(
  world: World,
  padLeft: number,
  padRight: number,
  padTop: number,
  padBottom: number,
): boolean {
  padLeft = Math.max(0, padLeft | 0)
  padRight = Math.max(0, padRight | 0)
  padTop = Math.max(0, padTop | 0)
  padBottom = Math.max(0, padBottom | 0)
  if (!padLeft && !padRight && !padTop && !padBottom) return false

  const ow = world.width
  const oh = world.height
  const nw = ow + padLeft + padRight
  const nh = oh + padTop + padBottom
  if (nw > MAX_WORLD_WIDTH || nh > MAX_WORLD_HEIGHT) return false

  const oldElev = world.elev
  const oldPlate = world.plateId
  const oldTemp = world.temp
  const oldMoist = world.moist
  const oldFlux = world.flux
  const oldBiome = world.biome
  const oldSuit = world.suitability
  const canCopyDerived = oldTemp.length === ow * oh && oldBiome.length === ow * oh

  const elev = new Float32Array(nw * nh)
  const plateId = new Int16Array(nw * nh)
  const temp = new Float32Array(nw * nh)
  const moist = new Float32Array(nw * nh)
  const flux = new Float32Array(nw * nh)
  const biome = new Array(nw * nh)
  const suitability = new Float32Array(nw * nh)

  const originX = world.originX - padLeft
  const originY = world.originY - padTop
  const sea = world.seaLevel
  const seed = world.seed
  const latSpan = Math.max(1, world.latRows - 1)

  for (let y = 0; y < nh; y++) {
    for (let x = 0; x < nw; x++) {
      const i = idx(nw, x, y)
      const ox = x - padLeft
      const oy = y - padTop
      if (ox >= 0 && oy >= 0 && ox < ow && oy < oh) {
        const oi = idx(ow, ox, oy)
        elev[i] = oldElev[oi]
        plateId[i] = oldPlate[oi]
        if (canCopyDerived) {
          temp[i] = oldTemp[oi]
          moist[i] = oldMoist[oi]
          flux[i] = oldFlux[oi]
          biome[i] = oldBiome[oi]
          suitability[i] = oldSuit[oi]
        }
        continue
      }

      const cx = clamp(ox, 0, ow - 1)
      const cy = clamp(oy, 0, oh - 1)
      const edge = oldElev[idx(ow, cx, cy)]
      const edgePlate = oldPlate[idx(ow, cx, cy)]
      const dx = ox < 0 ? -ox : ox >= ow ? ox - (ow - 1) : 0
      const dy = oy < 0 ? -oy : oy >= oh ? oy - (oh - 1) : 0
      const dist = Math.hypot(dx, dy)
      const gx = x + originX
      const gy = y + originY
      const n =
        fbm(gx / 48, gy / 48, seed, 5) * 0.55 + fbm(gx / 18, gy / 18, seed + 7, 3) * 0.25
      const coast = (fbm(gx / 14, gy / 14, seed + 41, 4) - 0.5) * 0.08
      const shelf = Math.max(0, 1 - dist / 11)
      let e = 0.1 + n * 0.11 + coast
      if (edge >= sea) {
        e = edge * (1 - dist / Math.max(6, dist)) * 0.15 + (sea - 0.05) * shelf + e * (1 - shelf * 0.55)
        if (dist < 5) e = edge * (1 - dist / 5) + (sea - 0.03) * (dist / 5)
      } else {
        e = edge * shelf * 0.45 + e * (1 - shelf * 0.35)
      }
      const island = fbm(gx / 11, gy / 11, seed + 99, 4)
      if (island > 0.78 && dist > 12 && n > 0.55) {
        e = sea + 0.05 + (island - 0.78) * 0.45 + n * 0.08
      }

      e = Math.max(0, Math.min(1, e))
      elev[i] = e
      plateId[i] = edgePlate

      const lat = Math.max(0, Math.min(1, gy / latSpan))
      const latTemp = 1 - Math.pow(Math.abs(lat - 0.5) * 2, 1.15)
      const above = Math.max(0, e - sea)
      temp[i] = Math.max(0, Math.min(1, latTemp - above * 1.35))
      if (e < sea) {
        moist[i] = 1
        biome[i] = e > sea - 0.03 ? 'coast' : 'ocean'
      } else {
        moist[i] = 0.45
        biome[i] = classifyBiome(e, sea, temp[i], moist[i])
      }
    }
  }

  world.width = nw
  world.height = nh
  world.originX = originX
  world.originY = originY
  world.elev = elev
  world.plateId = plateId
  world.temp = temp
  world.moist = moist
  world.flux = flux
  world.biome = biome
  world.suitability = suitability
  for (const c of world.cities) {
    c.x += padLeft
    c.y += padTop
  }
  return true
}
