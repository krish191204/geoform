/**
 * Short mandatory first-run tutorial, then the live coach takes over.
 * Completion is stored in localStorage (v2 — older completions re-show once).
 */
import './tutorial.css'

const STORAGE_KEY = 'geoform.tutorial.v2.done'

export type TutorialHooks = {
  lockChrome: (locked: boolean, practice: boolean) => void
  setRaiseTool: () => void
  setStatus: (msg: string) => void
  onComplete?: () => void
}

type Step = {
  id: string
  title: string
  body: string
  bullets?: string[]
  requirePaint?: boolean
  cta?: string
}

const STEPS: Step[] = [
  {
    id: 'welcome',
    title: '30-second orientation',
    body: 'Geoform is a paint program for planets. You change height. Climate and rivers follow. The yellow coach box always tells you what to do next.',
    bullets: [
      'You do not draw rivers by hand — they flow downhill.',
      'Every tool and layer explains itself when you click it.',
    ],
    cta: 'Next — try painting',
  },
  {
    id: 'paint',
    title: 'Paint once on the map',
    body: 'Raise is selected. Drag on green/brown land below. Continue unlocks only after a real stroke.',
    bullets: ['Skip the deep ocean for this try.', 'Release when done — rivers catch up.'],
    requirePaint: true,
    cta: 'I painted — finish',
  },
  {
    id: 'done',
    title: 'You’re in',
    body: 'Watch the coach box when you pick tools, layers, land %, or New world. Replay anytime: World → Replay tutorial.',
    cta: 'Start building',
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

export function isTutorialBlocking(): boolean {
  return active
}

export function tutorialAllowsPaint(): boolean {
  return active && STEPS[stepIndex]?.requirePaint === true
}

export function tutorialNotifyStrokeEnd(): void {
  if (!active || !STEPS[stepIndex]?.requirePaint || paintedOk) return
  paintedOk = true
  renderStep()
  hooks?.setStatus('Stroke counted — continue the tutorial.')
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
  const isLast = stepIndex >= STEPS.length - 1

  root.innerHTML = `
    <div class="tutorial-card">
      <p class="tutorial-kicker">Quick start · ${stepIndex + 1} / ${STEPS.length}</p>
      <div class="tutorial-progress" aria-hidden="true">${dots}</div>
      <h2 id="tutorialTitle">${step.title}</h2>
      <p>${step.body}</p>
      ${bullets}
      ${
        needPaint
          ? `<p class="tutorial-wait">Drag on the map — Continue stays locked until you paint.</p>`
          : ''
      }
      <div class="tutorial-actions">
        <button type="button" class="tutorial-next" id="tutorialNext" ${needPaint ? 'disabled' : ''}>
          ${step.cta ?? (isLast ? 'Start building' : 'Next')}
        </button>
      </div>
    </div>
  `

  root.querySelector('#tutorialNext')?.addEventListener('click', () => {
    if (STEPS[stepIndex]?.requirePaint && !paintedOk) return
    if (stepIndex >= STEPS.length - 1) {
      const done = hooks?.onComplete
      const status = hooks?.setStatus
      stopTutorial(true)
      status?.('Coach is on — click any tool and read the yellow box.')
      done?.()
      return
    }
    stepIndex++
    paintedOk = false
    renderStep()
  })

  hooks.setStatus(
    practice ? 'Tutorial: drag Raise on land, then continue.' : `Tutorial: ${step.title}`,
  )
}
