/**
 * Always-on coach copy. Every picker should call into here so the user
 * never stares at a silent control.
 */
import type { Layer, Tool } from '../world/types'
import type { ContinentMass } from '../world/mass'
import type { ContinentStyle } from '../world/continents'
import type { MapLook } from '../render/draw'

export type CoachTone = 'tip' | 'ok' | 'warn' | 'go'

export interface CoachMessage {
  title: string
  tip: string
  next: string
  tone?: CoachTone
  /** Knock-on effects after an edit. Shown as “What else changed”. */
  changed?: string[]
}

const TOOL_COACH: Record<Tool, CoachMessage> = {
  raise: {
    title: 'Raise',
    tip: 'Drag on land to push hills and mountains up. Harder strength = faster change.',
    next: 'Release the mouse — rivers and climate catch up. Try Ridge for a mountain chain.',
    tone: 'go',
  },
  lower: {
    title: 'Lower',
    tip: 'Drag to sink land or carve basins. Do not erase a whole continent unless you mean to.',
    next: 'Low spots can become lakes/seas if they drop under the water line.',
    tone: 'tip',
  },
  smooth: {
    title: 'Smooth',
    tip: 'Softens cliffs and stamp edges. Use after Raise if coasts look like rectangles.',
    next: 'Then switch to Relief to check the silhouette.',
    tone: 'tip',
  },
  ridge: {
    title: 'Ridge',
    tip: 'Drag in a line to paint a mountain chain along your stroke.',
    next: 'Paint on land. Ocean first? Use Land or Add continent.',
    tone: 'go',
  },
  channel: {
    title: 'Channel',
    tip: 'Carves a valley. Good for guiding where a river wants to run.',
    next: 'Release — hydrology will prefer the low path.',
    tone: 'go',
  },
  plateau: {
    title: 'Plateau',
    tip: 'Flattens a highland into a table. Great for interiors, not for coastlines.',
    next: 'Too flat? Add a Ridge on the rim so rivers still have a slope.',
    tone: 'tip',
  },
  sea: {
    title: 'Ocean',
    tip: 'Paints cells below sea level. Turns land into water.',
    next: 'Cities cannot sit here. Use Land to reclaim ground.',
    tone: 'warn',
  },
  land: {
    title: 'Land',
    tip: 'Raises cells above the sea — quick coasts and islands.',
    next: 'If Full continents is on, tiny lonely blobs may drown on Refresh.',
    tone: 'go',
  },
  city: {
    title: 'Found city',
    tip: 'Click viable land. The town gets a role from geography — farm, port, mine, etc.',
    next: 'Use Suggest settlements for capitals, farmlands, and specialized towns.',
    tone: 'go',
  },
  razecity: {
    title: 'Raze city',
    tip: 'Click near a city to remove it. Needs a city within reach.',
    next: 'Deep-time slider must be Present to edit cities.',
    tone: 'tip',
  },
  inspect: {
    title: 'Inspect',
    tip: 'Hover cells to read height, rain, biome, and city score — no editing.',
    next: 'Switch to Settle layer to see good city sites as colors.',
    tone: 'tip',
  },
  continent: {
    title: 'Add continent',
    tip: 'Click open ocean only. Pick a style in Continents first.',
    next: 'Blocked on land. Auto-place finds a hole for you.',
    tone: 'go',
  },
}

const LAYER_COACH: Record<string, CoachMessage> = {
  relief: {
    title: 'Relief look',
    tip: 'Heights plus blue river tint. This is the default “is my planet alive?” view.',
    next: 'No blue streams? Paint slopes inland, then release or hit Refresh climate.',
    tone: 'tip',
  },
  elevation: {
    title: 'Elevation look',
    tip: 'Pure height colors — easier to spot flat shelves vs peaks.',
    next: 'Use Raise / Ridge where everything is the same green.',
    tone: 'tip',
  },
  biome: {
    title: 'Biome look',
    tip: 'Plants and deserts from temperature + rain (which came from height).',
    next: 'Weird desert next to rainforest? Check Moisture and your mountain rain shadows.',
    tone: 'tip',
  },
  temperature: {
    title: 'Temperature look',
    tip: 'Hot near the equator, cold at poles and peaks. Hover land for °C and °F.',
    next: 'Raise mountains to cool them.',
    tone: 'tip',
  },
  moisture: {
    title: 'Moisture look',
    tip: 'Wind dumps rain on windward slopes; the far side is a rain shadow.',
    next: 'Dry interiors are normal behind ridges.',
    tone: 'tip',
  },
  plates: {
    title: 'Plates look',
    tip: 'Colored plates with dark sutures. Raise / Land / Ridge claim crust under your brush so plates follow what you sculpt. Warm edges = collision; cool = rift.',
    next: 'Flooding with Ocean keeps the same plate underwater. Refresh climate rebuilds collision ranges along sutures.',
    tone: 'tip',
  },
  suitability: {
    title: 'Settle look',
    tip: 'Green = favorable towns. Amber = can work with friction. Red = ocean, peaks, cliffs.',
    next: 'Found city on green or amber. Only impossible terrain is blocked.',
    tone: 'go',
  },
  satellite: {
    title: 'Satellite look',
    tip: 'Pretty globe texture from the same grids.',
    next: 'Editing still changes the underlying heightfield.',
    tone: 'tip',
  },
  night: {
    title: 'Night look',
    tip: 'Dark side mood lighting — same data underneath.',
    next: 'Switch back to Relief to judge rivers and coasts.',
    tone: 'tip',
  },
}

const MASS_COACH: Record<ContinentMass, CoachMessage> = {
  continents: {
    title: 'Full continents',
    tip: 'Keeps a few big landmasses. Tiny painted islands may drown on Refresh — that is on purpose.',
    next: 'Paint attached to a real coast if you want land to stay.',
    tone: 'warn',
  },
  mixed: {
    title: 'Continents & islands',
    tip: 'Big land plus some offshore scraps are allowed.',
    next: 'Good default if you want archipelagos without chaos.',
    tone: 'tip',
  },
  islands: {
    title: 'Island world',
    tip: 'Speckles are the point. Refresh will not glue them into continents.',
    next: 'New world will scatter land. Cities need the bigger islands.',
    tone: 'tip',
  },
}

export function coachTool(tool: Tool): CoachMessage {
  return TOOL_COACH[tool]
}

export function coachLayer(look: MapLook | Layer): CoachMessage {
  return LAYER_COACH[look] ?? {
    title: 'Map look',
    tip: 'This layer recolors the same world — it does not change heights by itself.',
    next: 'Paint with a terrain tool, then flip looks to check climate.',
    tone: 'tip',
  }
}

export function coachMass(mass: ContinentMass): CoachMessage {
  return MASS_COACH[mass]
}

export function coachContinentStyle(_style: ContinentStyle, label: string, desc: string): CoachMessage {
  return {
    title: `Continent style · ${label}`,
    tip: desc,
    next: 'Select Add continent, then click open ocean — or Auto-place.',
    tone: 'go',
  }
}

export function coachEngine(engine: 'worldengine' | 'local'): CoachMessage {
  if (engine === 'worldengine') {
    return {
      title: 'Python science',
      tip: 'New world and climate Refresh talk to the API. Brushes still paint instantly in the browser.',
      next: 'If New world fails, the app flips to Local automatically.',
      tone: 'tip',
    }
  }
  return {
    title: 'Local preview',
    tip: 'Everything runs in this browser — fine offline, slightly simpler science.',
    next: import.meta.env.PROD
      ? 'The full map editor works here without a server.'
      : 'Switch to Python science when npm run dev:api is up for fuller climate.',
    tone: 'tip',
  }
}

export function coachView(mode: 'atlas' | 'planet'): CoachMessage {
  if (mode === 'planet') {
    return {
      title: 'Planet view',
      tip: 'Drag to spin, drag up/down to tilt, scroll to zoom. Same world as the atlas.',
      next: 'Press G or Atlas to return to painting on the flat map.',
      tone: 'tip',
    }
  }
  return {
    title: 'Atlas view',
    tip: 'Flat map for painting. Scroll zooms; Space+drag pans.',
    next: 'Pick Raise and drag on land to sculpt.',
    tone: 'go',
  }
}

export function coachLandRatio(landPct: number): CoachMessage {
  return {
    title: `Land ${landPct}%`,
    tip: 'Moves the water line along existing coasts — does not sprinkle random islands.',
    next: 'Release the slider to rebuild climate. Extreme mixes look weird; ~30–45% is Earth-like.',
    tone: landPct < 20 || landPct > 60 ? 'warn' : 'tip',
  }
}

export function coachTimeline(age: number): CoachMessage {
  if (age < 0.5) {
    return {
      title: 'Present',
      tip: 'You are editing today’s map. Mountains, rivers, and cities apply here.',
      next: 'Slide Age only to peek at the past — paint tools prefer Present.',
      tone: 'ok',
    }
  }
  return {
    title: `${Math.round(age)} Ma ago`,
    tip: 'Reconstructed past from plate motion — mostly a preview, not a second editable planet.',
    next: 'Return Age to Present before founding cities or painting.',
    tone: 'warn',
  }
}

/** Paint the always-visible coach box. */
export function paintCoach(el: HTMLElement | null, msg: CoachMessage): void {
  if (!el) return
  const tone = msg.tone ?? 'tip'
  el.dataset.tone = tone
  el.hidden = false
  const changed =
    msg.changed?.length ?
      `<div class="coach-changed">
        <p class="coach-changed-label">What else changed</p>
        <ul>${msg.changed.map((c) => `<li>${escapeHtml(c)}</li>`).join('')}</ul>
      </div>`
    : ''
  el.innerHTML = `
    <p class="coach-kicker">${toneLabel(tone)}</p>
    <strong class="coach-title">${escapeHtml(msg.title)}</strong>
    <p class="coach-tip">${escapeHtml(msg.tip)}</p>
    ${changed}
    <p class="coach-next"><span>Try next</span> ${escapeHtml(msg.next)}</p>
  `
}

function toneLabel(tone: CoachTone): string {
  if (tone === 'go') return 'Do this'
  if (tone === 'warn') return 'Watch out'
  if (tone === 'ok') return 'What just happened'
  return 'Suggestion'
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
