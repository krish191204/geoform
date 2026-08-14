import { buildDirectorContext, interpretLocally, type DirectorPlan } from './director'
import type { World } from './types'

/** Try Gemini-backed /api/interpret; fall back to local rules. */
export async function interpretDirector(prompt: string, world: World): Promise<DirectorPlan> {
  try {
    const res = await fetch('/api/interpret', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt,
        context: buildDirectorContext(world),
      }),
    })
    if (res.ok) {
      const data = (await res.json()) as DirectorPlan
      if (Array.isArray(data.actions) && data.actions.length) {
        return {
          actions: data.actions,
          explanation: data.explanation ?? 'Applied from Director.',
          source: data.source ?? 'rules',
        }
      }
    }
  } catch {
    /* offline or API down */
  }
  return interpretLocally(prompt)
}
