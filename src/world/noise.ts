/**
 * Fake random numbers that look random but repeat if you use the same seed.
 *
 * createRng(seed) → a function you call over and over. Same seed = same sequence.
 * hash2(x, y, seed) → a number 0..1 for that grid point. Used as "noise".
 * valueNoise2D → smooth noise (neighboring points are similar, not TV static).
 * fbm = "fractal Brownian motion" = stack several noises at different zoom
 *   levels so you get big blobs AND little wiggles. Continents use this a lot.
 *
 * You do not need to understand the bit math. Treat fbm(x, y, seed) as
 * "a wiggle between 0 and 1 at this spot."
 */
/** Mulberry32 — fast seeded PRNG */
export function createRng(seed: number) {
  let t = seed >>> 0
  return () => {
    t += 0x6d2b79f5
    let r = Math.imul(t ^ (t >>> 15), 1 | t)
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r)
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296
  }
}

/** A stable 0..1 number for grid point (x, y). Same inputs always give the same wiggle. */
export function hash2(x: number, y: number, seed: number): number {
  let n = Math.imul(x, 374761393) + Math.imul(y, 668265263) + seed
  n = (n ^ (n >>> 13)) >>> 0
  n = Math.imul(n, 1274126177)
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296
}

/** Smooth noise: neighbors blend together so you get blobs, not TV static. */
export function valueNoise2D(x: number, y: number, seed: number): number {
  const x0 = Math.floor(x)
  const y0 = Math.floor(y)
  const fx = x - x0
  const fy = y - y0
  const sx = fx * fx * (3 - 2 * fx)
  const sy = fy * fy * (3 - 2 * fy)
  const n00 = hash2(x0, y0, seed)
  const n10 = hash2(x0 + 1, y0, seed)
  const n01 = hash2(x0, y0 + 1, seed)
  const n11 = hash2(x0 + 1, y0 + 1, seed)
  const nx0 = n00 * (1 - sx) + n10 * sx
  const nx1 = n01 * (1 - sx) + n11 * sx
  return nx0 * (1 - sy) + nx1 * sy
}

/** Stack several smooth noises at different zooms. This is "the wiggle" continents are made of. */
export function fbm(
  x: number,
  y: number,
  seed: number,
  octaves = 5,
  lacunarity = 2,
  gain = 0.5,
): number {
  // octaves = how many zoom levels to stack. More = more tiny wiggles.
  // lacunarity = how much we zoom in each layer. 2 = each layer twice as detailed.
  // gain = how much weaker each finer layer is. 0.5 = half as loud.
  let amp = 1
  let freq = 1
  let sum = 0
  let norm = 0
  for (let i = 0; i < octaves; i++) {
    sum += amp * valueNoise2D(x * freq, y * freq, seed + i * 1013)
    norm += amp
    amp *= gain
    freq *= lacunarity
  }
  return sum / norm
}
