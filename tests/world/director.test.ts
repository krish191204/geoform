import { describe, expect, it } from 'vitest'
import { interpretLocally } from '../../src/world/director'

describe('director local parser', () => {
  it('maps mining town request to suggest mining', () => {
    const plan = interpretLocally('Add a mining town in the highlands')
    expect(plan.actions.some((a) => a.type === 'suggest' && a.plan === 'mining')).toBe(true)
  })

  it('maps wetter east coast to channel and climate refresh', () => {
    const plan = interpretLocally('Make the east coast wetter')
    expect(plan.actions.some((a) => a.type === 'brush' && a.tool === 'channel' && a.region === 'east')).toBe(
      true,
    )
    expect(plan.actions.some((a) => a.type === 'refresh_climate')).toBe(true)
  })

  it('maps settlement mix', () => {
    const plan = interpretLocally('Suggest settlements full mix')
    expect(plan.actions.some((a) => a.type === 'suggest' && a.plan === 'mix')).toBe(true)
  })
})
