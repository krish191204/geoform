/** Map normalized temp [0, 1] to Earth-like °C for display (poles/peaks → tropics). */
export const TEMP_C_MIN = -45
export const TEMP_C_MAX = 38
export const TEMP_C_SPAN = TEMP_C_MAX - TEMP_C_MIN

/** Convert internal 0..1 temperature to degrees Celsius. */
export function normToCelsius(norm: number): number {
  const t = Math.max(0, Math.min(1, norm))
  return TEMP_C_MIN + t * TEMP_C_SPAN
}

/** Convert degrees Celsius to Fahrenheit. */
export function celsiusToFahrenheit(c: number): number {
  return (c * 9) / 5 + 32
}

/** Round for UI — whole degrees read cleaner on a game map. */
export function formatCelsius(norm: number): string {
  return `${Math.round(normToCelsius(norm))}°C`
}

export function formatFahrenheit(norm: number): string {
  return `${Math.round(celsiusToFahrenheit(normToCelsius(norm)))}°F`
}

/** Inspector-style label: both scales. */
export function formatTemperature(norm: number): string {
  return `${formatCelsius(norm)} · ${formatFahrenheit(norm)}`
}

/** Average land-temp shift in normalized units → approximate °C / °F change. */
export function formatTemperatureDelta(normDelta: number): string {
  const dc = Math.abs(normDelta) * TEMP_C_SPAN
  const df = (Math.abs(normDelta) * TEMP_C_SPAN * 9) / 5
  return `${Math.round(dc)}°C / ${Math.round(df)}°F`
}
