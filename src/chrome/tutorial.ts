/**
 * Mandatory first-run tutorial. Blocks the editor until the user finishes
 * (and proves they can paint once). Completion is stored in localStorage.
 */
import './tutorial.css'

const STORAGE_KEY = 'geoform.tutorial.v1.done'

export type TutorialHooks = {
  lockChrome: (locked: boolean, practice: boolean) => void
  setRaiseTool: () => void
  setStatus: (msg: string) => void
}

type Step = {
  id: string
  title: string
  body: string
  bullets?: string[]
  /** User must paint a stroke before Next unlocks */
  requirePaint?: boolean
  cta?: string
}

const STEPS: Step[] = [
  {
    id: 'welcome',
    title: 'Welcome to Geoform',
    body: 'This is a paint program for planets. You change the land. Climate, rivers, and biomes follow from the heights.',
    bullets: [
      'You do not draw rivers by hand — they flow downhill from rain.',
      'Barren flat continents are not a goal. New worlds already have mountains, uplands, and streams.',
    ],
    cta: 'Got it',
  },
  {
    id: 'cause',
    title: 'Height is the cause',
    body: 'Raise land → cooler highlands and wet windward slopes. Carve valleys → rivers gather. The map is not decoration; it is physics-lite.',
    bullets: [
      'Relief layer = heights (and river tint).',
      'Biome / rain layers = weather that came from those heights.',
    ],
    cta: 'Next',
  },
  {
    id: 'paint',
    title: 'Your turn: paint a ridge',
    body: 'The Raise tool is selected. Drag on land on the map below. Hold and move — you should see the terrain change while you drag.',
    bullets: [
      'Paint on green/brown land, not deep ocean.',
      'Release when done — climate and rivers catch up a moment later.',
    ],
    requirePaint: true,
    cta: 'I painted — continue',
  },
  {
    id: 'rivers',
    title: 'Rivers appear for free',
    body: 'Blue lines are streams. Thin = tributaries, thicker = main stems. If you raise a mountain, rain and drainage will rewrite after you release the mouse.',
    cta: 'Next',
  },
  {
    id: 'cities',
    title: 'Cities need good sites',
    body: 'Use the City tool on coasts, rivers, and gentle land. The app blocks nonsense placements (ocean peaks, sheer cliffs). Shift-click can force a bad site if you insist.',
    cta: 'Next',
  },
  {
    id: 'done',
    title: 'You’re clear to build',
    body: 'New world regenerates the planet. World menu has seed, import/export, and science backend. You can replay this tutorial anytime from World → Replay tutorial.',
    bullets: [
      'Python science (if running) builds New world; brushes always paint in the browser.',
      'Undo is one stroke at a time (Z).',
    ],
    cta: 'Enter the editor',
  },
]

let active = false
let stepIndex = 0
let paintedOk = false
let root: HTMLElement | null = null
let hooks: TutorialHooks | null = null

export function isTutorialDone(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

export function markTutorialDone(): void {
  try {
    localStorage.setItem(STORAGE_KEY, '1')
  } catch {
    /* private mode */
  }
}

export function clearTutorialDone(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* ignore */
  }
}

/** True while the mandatory tutorial owns the UI. */
export function isTutorialBlocking(): boolean {
  return active
}

/** True only on the paint practice step — map strokes are allowed. */
export function tutorialAllowsPaint(): boolean {
  return active && STEPS[stepIndex]?.requirePaint === true
}

/** Call from endStroke when the user finished a terrain drag. */
export function tutorialNotifyStrokeEnd(): void {
  if (!active || !STEPS[stepIndex]?.requirePaint || paintedOk) return
  paintedOk = true
  renderStep()
  hooks?.setStatus('Nice — that stroke counts. Continue the tutorial.')
}

export function startTutorial(mount: HTMLElement, nextHooks: TutorialHooks): void {
  if (active) stopTutorial(false)
  hooks = nextHooks
  active = true
  stepIndex = 0
  paintedOk = false
  root = document.createElement('div')
  root.className = 'tutorial-root'
  root.id = 'tutorialRoot'
  root.setAttribute('role', 'dialog')
  root.setAttribute('aria-modal', 'true')
  root.setAttribute('aria-labelledby', 'tutorialTitle')
  mount.appendChild(root)
  hooks.lockChrome(true, false)
  renderStep()
}

export function stopTutorial(markDone: boolean): void {
  if (markDone) markTutorialDone()
  active = false
  paintedOk = false
  hooks?.lockChrome(false, false)
  root?.remove()
  root = null
  hooks = null
}

function renderStep(): void {
  if (!root || !hooks) return
  const step = STEPS[stepIndex]
  const practice = !!step.requirePaint
  root.dataset.mode = practice ? 'practice' : 'card'
  hooks.lockChrome(true, practice)
  if (practice) hooks.setRaiseTool()

  const dots = STEPS.map((_, i) => {
    const cls = i < stepIndex ? 'done' : i === stepIndex ? 'current' : ''
    return `<span class="${cls}"></span>`
  }).join('')

  const bullets = step.bullets?.length
    ? `<ul>${step.bullets.map((b) => `<li>${b}</li>`).join('')}</ul>`
    : ''

  const needPaint = step.requirePaint && !paintedOk
  const ctaLabel = step.cta ?? 'Next'
  const isLast = stepIndex >= STEPS.length - 1

  root.innerHTML = `
    <div class="tutorial-card">
      <p class="tutorial-kicker">Tutorial · ${stepIndex + 1} / ${STEPS.length}</p>
      <div class="tutorial-progress" aria-hidden="true">${dots}</div>
      <h2 id="tutorialTitle">${step.title}</h2>
      <p>${step.body}</p>
      ${bullets}
      ${
        needPaint
          ? `<p class="tutorial-wait">Drag on the map first — Continue stays locked until you paint.</p>`
          : ''
      }
      <div class="tutorial-actions">
        <button type="button" class="tutorial-next" id="tutorialNext" ${needPaint ? 'disabled' : ''}>
          ${isLast ? ctaLabel : ctaLabel}
        </button>
      </div>
    </div>
  `

  root.querySelector('#tutorialNext')?.addEventListener('click', () => {
    if (STEPS[stepIndex]?.requirePaint && !paintedOk) return
    if (stepIndex >= STEPS.length - 1) {
      stopTutorial(true)
      hooks?.setStatus('Tutorial done — raise land, found cities, hit New world when you want a fresh planet.')
      return
    }
    stepIndex++
    paintedOk = false
    renderStep()
  })

  hooks.setStatus(
    practice
      ? 'Tutorial: drag Raise on land, then continue.'
      : `Tutorial: ${step.title}`,
  )
}
