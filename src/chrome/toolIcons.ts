/**
 * Tiny logos for the tool palette.
 * Each icon is an inline SVG that uses currentColor so active/inactive
 * tools keep the same ink look. Keep paths simple — mountain, wave, city.
 */

import type { Tool } from '../world/types'

const svg = (body: string) =>
  `<svg class="tool-icon" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">${body}</svg>`

const stroke = 'fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"'

/** Mountain peaks — Raise */
const raise = svg(`<path ${stroke} d="M3 19 L9 7 L12 12 L15 5 L21 19 Z"/><path ${stroke} d="M8 19 L12 12 L16 19"/>`)

/** Valley / sink — Lower */
const lower = svg(`<path ${stroke} d="M4 6 H20"/><path ${stroke} d="M5 6 L12 18 L19 6"/>`)

/** Soft blur circles — Smooth */
const smooth = svg(
  `<circle ${stroke} cx="12" cy="12" r="7"/><circle ${stroke} cx="12" cy="12" r="3.5" opacity="0.55"/>`,
)

/** Mountain chain / ridge line */
const ridge = svg(
  `<path ${stroke} d="M2 18 L7 8 L10 13 L14 5 L18 12 L22 18"/><path ${stroke} d="M2 18 H22"/>`,
)

/** Carved river channel */
const channel = svg(
  `<path ${stroke} d="M5 4 L9 12 L7 20"/><path ${stroke} d="M19 4 L15 12 L17 20"/><path ${stroke} d="M9 12 H15"/>`,
)

/** Flat highland plateau */
const plateau = svg(
  `<path ${stroke} d="M4 18 L7 10 H17 L20 18 Z"/><path ${stroke} d="M7 10 H17"/>`,
)

/** Ocean waves */
const sea = svg(
  `<path ${stroke} d="M3 10 C5.5 7 8.5 13 11 10 C13.5 7 16.5 13 19 10 C20 9.3 21 9 21 9"/><path ${stroke} d="M3 16 C5.5 13 8.5 19 11 16 C13.5 13 16.5 19 19 16 C20 15.3 21 15 21 15"/>`,
)

/** Land / coast rise */
const land = svg(
  `<path ${stroke} d="M3 17 C6 17 7 12 10 12 C13 12 14 17 17 17 C19 17 20 15 21 15 L21 20 L3 20 Z"/><path ${stroke} d="M8 12 L10 7 L13 12"/>`,
)

/** Founded city / settlement */
const city = svg(
  `<path ${stroke} d="M5 20 V10 L12 5 L19 10 V20"/><path ${stroke} d="M9 20 V14 H15 V20"/><path ${stroke} d="M10 11 H11 M13 11 H14 M10 8.5 H11"/>`,
)

/** Raze / tear down */
const razecity = svg(
  `<path ${stroke} d="M6 20 V9 L12 5 L18 9 V20"/><path ${stroke} d="M9 20 V14 H15 V20"/><path ${stroke} d="M5 5 L19 19 M19 5 L5 19"/>`,
)

/** Inspect / magnifier */
const inspect = svg(
  `<circle ${stroke} cx="11" cy="11" r="6.5"/><path ${stroke} d="M16 16 L20.5 20.5"/>`,
)

/** New continent stamp */
const continent = svg(
  `<path ${stroke} d="M4 14 C5 9 8 7 11 8 C13 5 17 6 19 9 C21 11 21 15 18 17 C16 19 12 20 9 18 C6 17 3 16 4 14 Z"/><path ${stroke} d="M12 8 V4 M12 4 L10 6 M12 4 L14 6"/>`,
)

export const TOOL_ICONS: Record<Tool, string> = {
  raise,
  lower,
  smooth,
  ridge,
  channel,
  plateau,
  sea,
  land,
  city,
  razecity,
  inspect,
  continent,
}

/** Layer / look chips — same ink style, a bit smaller. */
export function layerIcon(id: string): string {
  const s = (body: string) =>
    `<svg class="chip-icon" viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" focusable="false">${body}</svg>`
  switch (id) {
    case 'relief':
      return s(`<path ${stroke} d="M3 18 L8 8 L12 14 L16 6 L21 18 Z"/>`)
    case 'elevation':
      return s(`<path ${stroke} d="M4 18 V8 M4 18 H20 M4 14 H14 M4 10 H9"/>`)
    case 'biome':
      return s(`<path ${stroke} d="M12 20 V10 M12 10 C8 10 7 6 12 3 C17 6 16 10 12 10 Z"/>`)
    case 'moisture':
      return s(`<path ${stroke} d="M12 4 C12 4 6 11 6 15 A6 6 0 0 0 18 15 C18 11 12 4 12 4 Z"/>`)
    case 'temperature':
      return s(
        `<path ${stroke} d="M12 14 V5 M10 5 H14"/><circle ${stroke} cx="12" cy="17" r="3"/>`,
      )
    case 'suitability':
      return s(`<path ${stroke} d="M5 20 V10 L12 5 L19 10 V20"/><path ${stroke} d="M9 20 V14 H15 V20"/>`)
    case 'plates':
      return s(`<path ${stroke} d="M4 8 L12 4 L20 8 V16 L12 20 L4 16 Z"/><path ${stroke} d="M12 4 V20 M4 8 L20 16"/>`)
    case 'satellite':
      return s(`<circle ${stroke} cx="12" cy="12" r="8"/><path ${stroke} d="M4 12 H20 M12 4 C15 8 15 16 12 20 C9 16 9 8 12 4"/>`)
    case 'night':
      return s(`<path ${stroke} d="M15 3 A9 9 0 1 0 21 15 A7 7 0 0 1 15 3 Z"/>`)
    default:
      return s(`<circle ${stroke} cx="12" cy="12" r="6"/>`)
  }
}

/** Continent style chips. */
export function continentStyleIcon(id: string): string {
  const s = (body: string) =>
    `<svg class="chip-icon" viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" focusable="false">${body}</svg>`
  switch (id) {
    case 'collision':
      return s(`<path ${stroke} d="M3 18 L8 8 L12 14 L16 8 L21 18"/><path ${stroke} d="M9 18 H15"/>`)
    case 'rift':
      return s(`<path ${stroke} d="M4 6 L10 12 L4 18"/><path ${stroke} d="M20 6 L14 12 L20 18"/>`)
    case 'arcs':
      return s(`<path ${stroke} d="M4 16 C8 8 16 8 20 16"/><path ${stroke} d="M7 16 L9 12 L11 16 M13 16 L15 11 L17 16"/>`)
    case 'drift':
      return s(`<path ${stroke} d="M5 12 H19"/><path ${stroke} d="M15 8 L19 12 L15 16"/><circle ${stroke} cx="7" cy="12" r="2.5"/>`)
    case 'supercontinent':
      return s(`<path ${stroke} d="M5 12 C6 7 10 6 12 8 C14 6 18 7 19 12 C18 17 14 18 12 16 C10 18 6 17 5 12 Z"/>`)
    case 'archipelago':
      return s(
        `<circle ${stroke} cx="7" cy="10" r="2.2"/><circle ${stroke} cx="13" cy="7" r="1.6"/><circle ${stroke} cx="16" cy="13" r="2.4"/><circle ${stroke} cx="9" cy="16" r="1.5"/>`,
      )
    default:
      return continent
  }
}

/** Landmass mode chips. */
export function massIcon(id: string): string {
  const s = (body: string) =>
    `<svg class="chip-icon" viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" focusable="false">${body}</svg>`
  if (id === 'islands') {
    return s(
      `<circle ${stroke} cx="7" cy="10" r="2.2"/><circle ${stroke} cx="14" cy="8" r="1.7"/><circle ${stroke} cx="17" cy="14" r="2.5"/><circle ${stroke} cx="9" cy="16" r="1.4"/>`,
    )
  }
  if (id === 'mixed') {
    return s(
      `<path ${stroke} d="M3 15 C5 9 9 8 12 10 C14 8 17 9 19 13 C17 17 12 18 9 16 C6 15 3 16 3 15 Z"/><circle ${stroke} cx="19" cy="8" r="1.5"/>`,
    )
  }
  return s(`<path ${stroke} d="M3 15 C5 8 9 7 12 9 C15 7 19 8 21 14 C18 18 12 19 8 17 C5 16 3 16 3 15 Z"/>`)
}
