import { describe, expect, it } from 'vitest'
import {
  celsiusToFahrenheit,
  formatTemperature,
  formatTemperatureDelta,
  normToCelsius,
  TEMP_C_MAX,
  TEMP_C_MIN,
} from '../../src/world/temperature'

describe('temperature display', () => {
  it('maps normalized 0 and 1 to pole and equator-like °C', () => {
    expect(normToCelsius(0)).toBe(TEMP_C_MIN)
    expect(normToCelsius(1)).toBe(TEMP_C_MAX)
  })

  it('formats both Celsius and Fahrenheit for the inspector', () => {
    const label = formatTemperature(1)
    expect(label).toContain('°C')
    expect(label).toContain('°F')
    expect(label).toContain('38°C')
    expect(label).toContain(`${Math.round(celsiusToFahrenheit(38))}°F`)
  })

  it('formats average land-temp shifts in both scales', () => {
    expect(formatTemperatureDelta(0.1)).toMatch(/8°C/)
    expect(formatTemperatureDelta(0.1)).toMatch(/15°F/)
  })
})
