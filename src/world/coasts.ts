/**
 * Make coasts look like shores, not like someone drew a rectangle.
 *
 * chewStraightCoasts: if a shoreline is a perfect N-S or E-W line, nibble
 *   random bites into capes and inlets.
 * meanderCoasts: push the shoreline around with noise so continents are not boxes.
 * noisyPolarOcean: fade land into ocean near the poles with a wiggly edge,
 *   not a hard rectangular frame.
 *
 * We copy into `next` then write back so we do not chew a cell using a
 * neighbor we already chewed this pass.
 */
import { fbm } from './noise'

const idx = (w: number, x: number, y: number) => y * w + x

/**
 * Break axis-aligned coasts into capes and inlets so land cannot sit
 * as a clean rectangle in the middle of the atlas.
 */
export function chewStraightCoasts(
  elev: Float32Array,
  w: number,
  h: number,
  sea: number,
  seed: number,
): void {
  const next = new Float32Array(elev)
  for (let y = 1; y < h - 1; y++) {
    for (let x = 0; x < w; x++) {
      const i = idx(w, x, y)
      const land = elev[i] >= sea
      const l = elev[idx(w, (x - 1 + w) % w, y)] >= sea
      const r = elev[idx(w, (x + 1) % w, y)] >= sea
      const u = elev[idx(w, x, y - 1)] >= sea
      const d = elev[idx(w, x, y + 1)] >= sea
      const nLand = (l ? 1 : 0) + (r ? 1 : 0) + (u ? 1 : 0) + (d ? 1 : 0)
      if (nLand === 0 || nLand === 4) continue
      const straightNS = u === land && d === land && l !== r
      const straightEW = l === land && r === land && u !== d
      const corner = nLand === 1 || nLand === 3
      if (!straightNS && !straightEW && !corner) continue
      const n = fbm(x / 18, y / 14, seed + 44, 4)
      const grain = fbm(x / 7, y / 7, seed + 18, 3)
      const wave = fbm(x / 28, y / 22, seed + 71, 3) - 0.5
      if (land && (n > 0.5 || grain > 0.66 || wave > 0.16)) {
        next[i] = sea - 0.025 - Math.max(0, n - 0.45) * 0.08
      } else if (!land && (n < 0.46 || grain < 0.32 || wave < -0.16)) {
        next[i] = sea + 0.025 + Math.max(0, 0.5 - n) * 0.07
      }
    }
  }
  elev.set(next)
}

/** Push the shoreline into gulfs and capes so a continent is not a box. */
export function meanderCoasts(
  elev: Float32Array,
  w: number,
  h: number,
  sea: number,
  seed: number,
): void {
  const next = new Float32Array(elev)
  for (let y = 1; y < h - 1; y++) {
    for (let x = 0; x < w; x++) {
      const i = idx(w, x, y)
      const land = elev[i] >= sea
      const l = elev[idx(w, (x - 1 + w) % w, y)] >= sea
      const r = elev[idx(w, (x + 1) % w, y)] >= sea
      const u = elev[idx(w, x, y - 1)] >= sea
      const d = elev[idx(w, x, y + 1)] >= sea
      const nLand = (l ? 1 : 0) + (r ? 1 : 0) + (u ? 1 : 0) + (d ? 1 : 0)
      if (nLand === 0 || nLand === 4) continue
      const wave = fbm(x / 20, y / 16, seed + 12, 4) - 0.5
      const grain = fbm(x / 8, y / 7, seed + 33, 3) - 0.5
      const v = wave * 0.72 + grain * 0.28
      if (land && v > 0.04) {
        next[i] = sea - 0.03 - v * 0.05
        if (v > 0.12) {
          const ix = l && !r ? (x - 1 + w) % w : r && !l ? (x + 1) % w : x
          const iy = u && !d ? y - 1 : d && !u ? y + 1 : y
          if (iy > 0 && iy < h - 1 && elev[idx(w, ix, iy)] >= sea) {
            next[idx(w, ix, iy)] = sea - 0.025
          }
          if (v > 0.2) {
            const ix2 = l && !r ? (x - 2 + w) % w : r && !l ? (x + 2) % w : x
            const iy2 = u && !d ? y - 2 : d && !u ? y + 2 : y
            if (iy2 > 0 && iy2 < h - 1 && elev[idx(w, ix2, iy2)] >= sea) {
              next[idx(w, ix2, iy2)] = sea - 0.02
            }
          }
        }
      } else if (!land && v < -0.06) {
        next[i] = sea + 0.03 - v * 0.04
      }
    }
  }
  elev.set(next)
}

/** Deepen polar ocean with a noisy latitude fade — not a rectangular frame. */
export function noisyPolarOcean(
  elev: Float32Array,
  w: number,
  h: number,
  seed: number,
): void {
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const ny = h <= 1 ? 0.5 : y / (h - 1)
      const polar = Math.max(0, Math.abs(ny - 0.5) * 2 - 0.7)
      if (polar <= 0) continue
      const warp = (fbm(x / 18, y / 10, seed + 61, 4) - 0.5) * 0.4
      const t = Math.max(0, Math.min(1, (polar + warp) / 0.32))
      if (t <= 0) continue
      const smooth = t * t * (3 - 2 * t)
      const ocean = 0.08 + fbm(x / 12, y / 8, seed + 77, 3) * 0.08
      const i = idx(w, x, y)
      elev[i] = ocean * smooth + elev[i] * (1 - smooth)
    }
  }
}
