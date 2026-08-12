/**
 * Motion helpers guided by animation-principles
 * (slow-in/out, continuous ambient loops, reduced-motion).
 */

export const EASE = {
  /** elegant smooth — cubic-bezier(0.4, 0, 0.2, 1) sampled */
  elegant: (t: number) => {
    // approx ease via smoothstep^mix
    const x = clamp01(t)
    return x * x * (3 - 2 * x)
  },
  /** organic perpetual loop phase 0..1 → eased ping-pong */
  breathe: (t: number) => {
    const x = clamp01(t)
    return 0.5 - 0.5 * Math.cos(x * Math.PI * 2)
  },
  outCubic: (t: number) => {
    const x = 1 - clamp01(t)
    return 1 - x * x * x
  },
  inOutCubic: (t: number) => {
    const x = clamp01(t)
    return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2
  },
}

function clamp01(t: number) {
  return Math.max(0, Math.min(1, t))
}

export function prefersReducedMotion() {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
}

/** Critically-damped-ish approach toward a target (slow in/out feel on updates) */
export function approach(current: number, target: number, dt: number, rate = 8) {
  if (prefersReducedMotion()) return target
  const k = 1 - Math.exp(-rate * dt)
  return current + (target - current) * k
}

/** Ambient cycle in seconds — prime-ish lengths so layers desync (continuous-infinite) */
export function ambientPhase(ms: number, periodSec: number) {
  if (prefersReducedMotion()) return 0
  return ((ms / 1000) % periodSec) / periodSec
}
