/**
 * Director — plain English → existing map tools (no new simulation code).
 * Local rules always work; optional /api/interpret adds Gemini when configured.
 */
import { landFraction } from './land'
import {
  brushChannel,
  brushRaise,
  brushSmooth,
} from './tools'
import {
  suggestSettlements,
  suggestSettlementsForRole,
  type SettlementPlan,
} from './settlements'
import type { SettlementRole, World } from './types'

export type MapRegion =
  | 'east'
  | 'west'
  | 'north'
  | 'south'
  | 'center'
  | 'coast'
  | 'highlands'

export type DirectorBrushTool = 'raise' | 'lower' | 'channel' | 'smooth'

export type DirectorAction =
  | { type: 'brush'; tool: DirectorBrushTool; region: MapRegion; strength?: number }
  | { type: 'suggest'; plan: SettlementPlan; count?: number }
  | { type: 'clear_cities' }
  | { type: 'refresh_climate' }

export interface DirectorPlan {
  actions: DirectorAction[]
  explanation: string
  source?: 'local' | 'gemini' | 'rules'
}

export interface DirectorContext {
  width: number
  height: number
  landPct: number
  oceanPct: number
  riverCells: number
  landMoist: number
  cities: { name: string; role?: string; x: number; y: number }[]
  biomes: Record<string, number>
}

export interface DirectorResult {
  plan: DirectorPlan
  summary: string[]
}

const ROLE_ALIASES: [RegExp, SettlementRole][] = [
  [/seat of power|capital|capital city|throne/, 'seat_of_power'],
  [/farmland|farm land|\bfarms?\b|\bfarming\b/, 'farmland'],
  [/fishing port|fishing town|\bharbor\b|\bharbour\b|\bport\b/, 'fishing'],
  [/\bmining town\b|\bmine\b|\bmining\b|\bore\b/, 'mining'],
  [/hunting camp|\bhunting\b|\bfur trade\b/, 'hunting'],
  [/pastoral|\bherds?\b|\bwool\b/, 'pastoral'],
  [/trade town|trade post|\bmarket\b/, 'trade'],
]

export function buildDirectorContext(world: World): DirectorContext {
  const { elev, seaLevel, flux, moist, biome, cities, width, height } = world
  const landPct = Math.round(landFraction(elev, seaLevel) * 100)
  const biomes: Record<string, number> = {}
  let riverCells = 0
  let moistSum = 0
  let land = 0
  for (let i = 0; i < elev.length; i++) {
    if (elev[i] < seaLevel) continue
    land++
    moistSum += moist[i] ?? 0
    if (flux[i] >= 1.8) riverCells++
    const b = biome[i] ?? 'unknown'
    biomes[b] = (biomes[b] ?? 0) + 1
  }
  return {
    width,
    height,
    landPct,
    oceanPct: 100 - landPct,
    riverCells,
    landMoist: land ? moistSum / land : 0,
    biomes,
    cities: cities.map((c) => ({
      name: c.name,
      role: c.role,
      x: c.x,
      y: c.y,
    })),
  }
}

export function detectRegion(text: string): MapRegion | null {
  if (/east coast|eastern coast|east\b/.test(text)) return 'east'
  if (/west coast|western coast|west\b/.test(text)) return 'west'
  if (/\bnorth\b|northern/.test(text)) return 'north'
  if (/\bsouth\b|southern/.test(text)) return 'south'
  if (/highland|upland|mountain|alpine|\bpeak/.test(text)) return 'highlands'
  if (/coast|shore|coastal/.test(text)) return 'coast'
  if (/center|central|middle|interior/.test(text)) return 'center'
  return null
}

function detectSettlementRole(text: string): SettlementRole | null {
  for (const [re, role] of ROLE_ALIASES) {
    if (re.test(text)) return role
  }
  return null
}

function countFromText(text: string, fallback = 1): number {
  if (/\btwo\b|\b2\b|\ba couple\b/.test(text)) return 2
  if (/\bthree\b|\b3\b/.test(text)) return 3
  if (/\bfour\b|\b4\b/.test(text)) return 4
  if (/\bfive\b|\b5\b/.test(text)) return 5
  return fallback
}

const ACTION_LABELS: Record<string, string> = {
  raise: 'raised land',
  lower: 'lowered land',
  channel: 'carved river valleys',
  smooth: 'smoothed terrain',
}

function explainActions(actions: DirectorAction[]): string {
  const parts: string[] = []
  for (const a of actions) {
    if (a.type === 'brush') {
      parts.push(`${ACTION_LABELS[a.tool] ?? a.tool} in the ${a.region}`)
    } else if (a.type === 'suggest') {
      parts.push(
        a.plan === 'mix'
          ? 'suggested a settlement mix'
          : `suggested ${a.count ?? 1} ${a.plan.replace(/_/g, ' ')} site(s)`,
      )
    } else if (a.type === 'clear_cities') parts.push('cleared settlements')
    else if (a.type === 'refresh_climate') parts.push('queued climate refresh')
  }
  return parts.join('; ')
}

/** Offline rule parser — no API key required. */
export function interpretLocally(prompt: string): DirectorPlan {
  const text = prompt.toLowerCase().trim()
  const actions: DirectorAction[] = []
  if (!text) {
    return {
      actions: [],
      explanation: 'Type what you want changed — e.g. “Add a mining town” or “Make the east coast wetter”.',
      source: 'local',
    }
  }

  if (/full mix|suggest settlement|suggest town|populate the map|settlement mix/.test(text)) {
    actions.push({ type: 'suggest', plan: 'mix' })
  }

  const role = detectSettlementRole(text)
  if (role) {
    actions.push({ type: 'suggest', plan: role, count: countFromText(text, 1) })
  }

  if (/clear cit|remove cit|delete cit|erase cit/.test(text)) {
    actions.push({ type: 'clear_cities' })
  }

  const region = detectRegion(text) ?? 'center'
  const wantsWet =
    /wetter|wet\b|rain|moist|river|stream|waterway|hydrolog/.test(text) &&
    !/drier|dry\b|desert/.test(text)
  const wantsDry = /drier|dry\b|arid|desert|rain shadow/.test(text)
  const wantsRaise = /raise|higher|uplift|elevate|mountain|ridge|plateau/.test(text)
  const wantsLower = /lower|sink|depress|subside/.test(text)
  const wantsSmooth = /smooth|flatten|gentle|terrace/.test(text)

  if (wantsWet) actions.push({ type: 'brush', tool: 'channel', region })
  if (wantsDry) actions.push({ type: 'brush', tool: 'lower', region, strength: 0.07 })
  if (wantsRaise && !wantsWet) actions.push({ type: 'brush', tool: 'raise', region })
  if (wantsLower && !wantsDry) actions.push({ type: 'brush', tool: 'lower', region })
  if (wantsSmooth) actions.push({ type: 'brush', tool: 'smooth', region })

  if (/refresh climate|rebuild climate|update climate|redo climate/.test(text)) {
    actions.push({ type: 'refresh_climate' })
  }

  const hasTerrain = actions.some((a) => a.type === 'brush')
  if (hasTerrain && !actions.some((a) => a.type === 'refresh_climate')) {
    actions.push({ type: 'refresh_climate' })
  }

  if (!actions.length) {
    return {
      actions: [],
      explanation:
        'Could not map that to a tool. Try: “Add a mining town”, “Suggest settlements”, “Make the east coast wetter”, or “Raise the western highlands”.',
      source: 'local',
    }
  }

  return {
    actions: dedupeActions(actions),
    explanation: explainActions(actions),
    source: 'local',
  }
}

function dedupeActions(actions: DirectorAction[]): DirectorAction[] {
  const out: DirectorAction[] = []
  const seen = new Set<string>()
  for (const a of actions) {
    const key = JSON.stringify(a)
    if (seen.has(key)) continue
    seen.add(key)
    out.push(a)
  }
  return out
}

function regionPoints(world: World, region: MapRegion, max = 16): { x: number; y: number }[] {
  const { width: w, height: h, elev, seaLevel } = world
  const pts: { x: number; y: number }[] = []
  const pad = 3
  const inX = (x: number, band: 'east' | 'west' | 'center' | 'all') => {
    if (band === 'all') return x >= pad && x < w - pad
    if (band === 'east') return x >= (((w * 2) / 3) | 0) && x < w - pad
    if (band === 'west') return x >= pad && x < ((w / 3) | 0)
    return x >= ((w / 3) | 0) && x < (((w * 2) / 3) | 0)
  }
  const inY = (y: number, band: 'north' | 'south' | 'center' | 'all') => {
    if (band === 'all') return y >= pad && y < h - pad
    if (band === 'north') return y >= pad && y < ((h / 3) | 0)
    if (band === 'south') return y >= (((h * 2) / 3) | 0) && y < h - pad
    return y >= ((h / 3) | 0) && y < (((h * 2) / 3) | 0)
  }

  for (let y = pad; y < h - pad; y++) {
    for (let x = pad; x < w - pad; x++) {
      const i = y * w + x
      let ok = false
      switch (region) {
        case 'east':
          ok = inX(x, 'east') && inY(y, 'all')
          break
        case 'west':
          ok = inX(x, 'west') && inY(y, 'all')
          break
        case 'north':
          ok = inX(x, 'all') && inY(y, 'north')
          break
        case 'south':
          ok = inX(x, 'all') && inY(y, 'south')
          break
        case 'center':
          ok = inX(x, 'center') && inY(y, 'center')
          break
        case 'coast':
          if (elev[i] < seaLevel) continue
          for (const [dx, dy] of [
            [1, 0],
            [-1, 0],
            [0, 1],
            [0, -1],
          ]) {
            const nx = (x + dx + w) % w
            const ny = y + dy
            if (ny < 0 || ny >= h) continue
            if (elev[ny * w + nx] < seaLevel) ok = true
          }
          break
        case 'highlands':
          ok = elev[i] >= seaLevel + 0.28
          break
      }
      if (ok) pts.push({ x, y })
    }
  }

  if (!pts.length) {
    return [{ x: (w / 2) | 0, y: (h / 2) | 0 }]
  }

  pts.sort((a, b) => {
    if (region === 'highlands') return elev[b.y * w + b.x] - elev[a.y * w + a.x]
    return 0
  })

  const step = Math.max(1, Math.floor(pts.length / max))
  const sampled: { x: number; y: number }[] = []
  for (let i = 0; i < pts.length && sampled.length < max; i += step) {
    sampled.push(pts[i])
  }
  return sampled
}

function applyRegionBrush(world: World, action: Extract<DirectorAction, { type: 'brush' }>): void {
  const radius = Math.max(6, Math.min(14, Math.round(world.width / 28)))
  const strength = action.strength ?? 0.085
  const softness = 0.72
  const points = regionPoints(world, action.region)
  for (const { x, y } of points) {
    switch (action.tool) {
      case 'raise':
        brushRaise(world, x, y, radius, strength, softness)
        break
      case 'lower':
        brushRaise(world, x, y, radius, -strength, softness)
        break
      case 'smooth':
        brushSmooth(world, x, y, radius, Math.min(1, strength * 4), softness)
        break
      case 'channel':
        brushChannel(world, x, y, radius, strength, softness, 1, 0)
        brushChannel(world, x, y, radius, strength * 0.85, softness, 0, 1)
        break
    }
  }
}

export function executeDirectorPlan(world: World, plan: DirectorPlan): DirectorResult {
  const summary: string[] = []

  for (const action of plan.actions) {
    switch (action.type) {
      case 'brush':
        applyRegionBrush(world, action)
        summary.push(`${ACTION_LABELS[action.tool]} (${action.region})`)
        break
      case 'suggest': {
        const count = action.count ?? (action.plan === 'mix' ? 0 : 1)
        const added =
          action.plan === 'mix'
            ? suggestSettlements(world, 'mix')
            : suggestSettlementsForRole(world, action.plan, count)
        world.cities.push(...added)
        summary.push(
          added.length
            ? `added ${added.length} settlement${added.length === 1 ? '' : 's'} (${action.plan})`
            : `no good ${action.plan} sites found`,
        )
        break
      }
      case 'clear_cities':
        world.cities = []
        summary.push('cleared all settlements')
        break
      case 'refresh_climate':
        break
    }
  }

  return {
    plan,
    summary: summary.length ? summary : ['Nothing to apply'],
  }
}

export function planNeedsClimateRefresh(plan: DirectorPlan): boolean {
  return plan.actions.some((a) => a.type === 'brush' || a.type === 'refresh_climate')
}
