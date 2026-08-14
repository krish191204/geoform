/**
 * Zoom-out used to just CSS-shrink the canvas (postage stamp on a grey desk).
 * Now it adds real cells around the map so the world grows.
 *
 * padsForZoomOut: how many cells to add on each side so the map still fills
 *   the view, without going past 1024×512.
 * expandWorld: copy the old grid into the middle, invent new height around
 *   the edges that matches the landmass style, scoot cities, chew the new coasts.
 *
 * originX/originY shift so climate latitude stays put (equator does not jump).
 */
import { classifyBiome } from './climate'
import { chewStraightCoasts } from './coasts'
import { clampLandRatio } from './land'
import { clampContinentMass } from './mass'
import { fbm } from './noise'
import type { World } from './types'

export const MAX_WORLD_WIDTH = 1024
export const MAX_WORLD_HEIGHT = 512

const idx = (w: number, x: number, y: number) => y * w + x

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v))
}

function smoothstep(edge0: number, edge1: number, x: number) {
  const t = clamp((x - edge0) / Math.max(1e-6, edge1 - edge0), 0, 1)
  return t * t * (3 - 2 * t)
}

/** Negative inside the old map, positive outside. Used to blend new pad cells into the old coast. */
function signedRectDist(ox: number, oy: number, ow: number, oh: number): number {
  if (ox >= 0 && oy >= 0 && ox < ow && oy < oh) {
    return -Math.min(ox + 0.5, oy + 0.5, ow - 0.5 - ox, oh - 0.5 - oy)
  }
  const dx = ox < 0 ? -ox : ox >= ow ? ox - (ow - 1) : 0
  const dy = oy < 0 ? -oy : oy >= oh ? oy - (oh - 1) : 0
  return Math.hypot(dx, dy)
}

/** How many extra cells are needed so the map still fills the view after a zoom-out. */
export function padsForZoomOut(
  world: World,
  factor: number,
  focusX: number,
  focusY: number,
  viewW = 0,
  viewH = 0,
): { left: number; right: number; top: number; bottom: number } | null {
  const scaleUp = 1 / Math.max(0.5, Math.min(0.98, factor))
  let extraW = Math.max(8, Math.round(world.width * (scaleUp - 1)))
  let extraH = Math.max(4, Math.round(world.height * (scaleUp - 1)))
  extraW = Math.min(extraW, MAX_WORLD_WIDTH - world.width)
  extraH = Math.min(extraH, MAX_WORLD_HEIGHT - world.height)

  if (viewW > 40 && viewH > 40) {
    const nw = world.width + extraW
    const nh = world.height + extraH
    const worldAspect = nw / Math.max(1, nh)
    const viewAspect = viewW / viewH
    if (worldAspect > viewAspect + 0.03) {
      const wantH = Math.round(nw / viewAspect)
      extraH += Math.max(0, Math.min(MAX_WORLD_HEIGHT - (world.height + extraH), wantH - nh))
    } else if (viewAspect > worldAspect + 0.03) {
      const wantW = Math.round(nh * viewAspect)
      extraW += Math.max(0, Math.min(MAX_WORLD_WIDTH - (world.width + extraW), wantW - nw))
    }
  }

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

/** Invent height for a new pad cell. Continents mode prefers big blobs, not speckle. */
function generatePadElev(
  gx: number,
  gy: number,
  seed: number,
  sea: number,
  land: number,
  mass: ReturnType<typeof clampContinentMass> = 'continents',
): number {
  const n =
    fbm(gx / 48, gy / 48, seed, 5) * 0.55 + fbm(gx / 18, gy / 18, seed + 7, 3) * 0.25
  const coast = (fbm(gx / 14, gy / 14, seed + 41, 4) - 0.5) * 0.08
  let e = 0.08 + n * 0.12 + coast
  if (mass === 'continents') {
    const ridge = fbm(gx / 52, gy / 40, seed + 13, 5)
    const thresh = 0.78 - land * 0.16
    if (ridge > thresh) {
      const t = (ridge - thresh) / Math.max(0.08, 1 - thresh)
      e = sea + 0.05 + t * 0.24 + n * 0.1
    }
    return clamp(e, 0, 1)
  }
  const blob = fbm(gx / 30, gy / 26, seed + 13, 5)
  const island = fbm(gx / 11, gy / 11, seed + 99, 4)
  const continentThresh = 1.14 - land * 0.28
  const islandThresh = mass === 'islands' ? 0.82 - land * 0.2 : 0.9 - land * 0.16
  if (blob > continentThresh) {
    const t = (blob - continentThresh) / Math.max(0.08, 1 - continentThresh)
    e = sea + 0.04 + t * 0.26 + n * 0.12
  } else if (island > islandThresh && n > 0.42) {
    e = sea + 0.03 + (island - islandThresh) * 0.42 + n * 0.06
  }
  return clamp(e, 0, 1)
}

/**
 * Grow the grid. Returns false if we are already at max size or pads are zero.
 * Cities move with the old rectangle so they stay on the same land.
 */
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
  const land = clampLandRatio(world.landRatio)
  const mass = clampContinentMass(world.continentMass)
  const short = Math.min(ow, oh)
  const warpAmp = Math.min(28, Math.max(4, short * 0.18))
  const copyDepth = -Math.min(22, Math.max(3, short * 0.14))
  const chewLo = -Math.min(32, Math.max(8, short * 0.22))

  for (let y = 0; y < nh; y++) {
    for (let x = 0; x < nw; x++) {
      const i = idx(nw, x, y)
      const ox = x - padLeft
      const oy = y - padTop
      const gx = x + originX
      const gy = y + originY
      const warp = (fbm(gx / 11, gy / 9, seed + 21, 4) - 0.5) * warpAmp
      const sd = signedRectDist(ox, oy, ow, oh) + warp
      const inside = ox >= 0 && oy >= 0 && ox < ow && oy < oh
      const gen = generatePadElev(gx, gy, seed, sea, land, mass)
      const edgePlate = oldPlate[idx(ow, clamp(ox, 0, ow - 1), clamp(oy, 0, oh - 1))]

      // Deep inside the old map: copy height as-is.
      // Near the old edge: chew the coast so the seam is not a rectangle.
      // Outside: invent new height, blend toward nearby land if we want continents.
      let e: number
      let plate = edgePlate
      let copied = false

      if (inside && sd < copyDepth) {
        const oi = idx(ow, ox, oy)
        e = oldElev[oi]
        plate = oldPlate[oi]
        copied = true
        if (canCopyDerived) {
          temp[i] = oldTemp[oi]
          moist[i] = oldMoist[oi]
          flux[i] = oldFlux[oi]
          biome[i] = oldBiome[oi]
          suitability[i] = oldSuit[oi]
        }
      } else if (inside) {
        const oi = idx(ow, ox, oy)
        const oldE = oldElev[oi]
        plate = oldPlate[oi]
        const chew = fbm(gx / 8, gy / 8, seed + 50, 4)
        const exposure = smoothstep(chewLo, 6, sd)
        if (oldE >= sea && chew * exposure > 0.28) {
          e = oldE * (1 - exposure * chew) + Math.min(oldE, sea - 0.06 - chew * 0.08) * exposure * chew
        } else {
          e = oldE * (1 - exposure * 0.55) + gen * exposure * 0.55
        }
      } else {
        e = gen
        const blend = 1 - smoothstep(1, Math.max(8, warpAmp * 0.8), sd)
        if (blend > 0.02) {
          const near = oldElev[idx(ow, clamp(ox, 0, ow - 1), clamp(oy, 0, oh - 1))]
          if (mass !== 'islands' && near >= sea) {
            e = e * (1 - blend * 0.62) + near * blend * 0.62
          } else {
            const shelfMix = blend * blend * 0.18
            e = e * (1 - shelfMix) + Math.min(near, sea - 0.03) * shelfMix
          }
        }
      }

      e = clamp(e, 0, 1)
      elev[i] = e
      plateId[i] = plate

      if (copied) continue

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
  if (world.tradeRoutes) {
    for (const r of world.tradeRoutes) {
      for (const p of r.waypoints) {
        p.x += padLeft
        p.y += padTop
      }
    }
  }
  chewStraightCoasts(world.elev, nw, nh, sea, seed + 33)
  return true
}
