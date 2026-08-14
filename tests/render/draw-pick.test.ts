import { describe, expect, it } from 'vitest'
import { clientToContainedBitmap } from '../../src/render/draw'

describe('clientToContainedBitmap', () => {
  it('maps the center of a matching box to 0.5, 0.5', () => {
    const mapped = clientToContainedBitmap(150, 100, { left: 50, top: 50, width: 200, height: 100 }, 400, 200)
    expect(mapped).toEqual({ nx: 0.5, ny: 0.5 })
  })

  it('ignores letterbox bars when the box is taller than the bitmap', () => {
    const rect = { left: 0, top: 0, width: 200, height: 200 }
    const mapped = clientToContainedBitmap(100, 100, rect, 400, 200)
    expect(mapped).toEqual({ nx: 0.5, ny: 0.5 })
    expect(clientToContainedBitmap(100, 10, rect, 400, 200)).toBeNull()
  })
})
