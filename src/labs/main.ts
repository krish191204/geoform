/**
 * Labs page (`/labs.html`). Tiny demos of one rule each.
 * Same generator as the editor. The editor applies these quietly;
 * labs let you feel elevation, rivers, rain, plates, cities, continents.
 */
import './style.css'
import { navHtml } from '../chrome/nav'
import { LABS, type LabId } from './content'
import { mountContinents } from './continents'
import { mountElevation } from './elevation'
import { mountRain } from './rain'
import { mountRivers } from './rivers'
import { mountSettle } from './settle'
import { mountTectonics } from './tectonics'
import type { StopFn } from './shared'

const root = document.querySelector<HTMLDivElement>('#labs-root')!

let active: LabId = 'elevation'
let stopLab: StopFn | null = null
let heroRaf = 0

function labMeta(id: LabId) {
  return LABS.find((l) => l.id === id) ?? LABS[0]
}

function render() {
  const lab = labMeta(active)
  root.innerHTML = `
    <div class="shell">
      ${navHtml('labs')}

      <header class="hero">
        <canvas class="hero-canvas" id="heroCanvas" aria-hidden="true"></canvas>
        <div class="hero-veil"></div>
        <div class="hero-copy">
          <h1>Labs</h1>
          <p>Same physics as the atlas: elevation, rivers that drain, rain shadows, plate edges, settlement, and how land clumps into continents. The editor applies these quietly; labs let you feel each rule.</p>
          <div class="hero-actions">
            <button type="button" class="chip-btn btn-primary" data-jump="labs">Open a lab</button>
            <a class="chip-btn" href="/roadmap.html">Accuracy roadmap</a>
          </div>
        </div>
      </header>

      <div class="lab-rail" id="labRail"></div>

      <section class="panel" id="labs">
        <div class="lab-head">
          <h2><span id="labNum">${lab.num}</span> · <span id="labTitle">${lab.title}</span></h2>
          <p class="tagline" id="labTagline">${lab.tagline}</p>
          <p class="feel" id="labPhysics">${lab.physics}</p>
          <ul class="teach" id="labTeach">
            ${lab.teaches.map((t) => `<li>${t}</li>`).join('')}
          </ul>
        </div>
        <div id="labMount"></div>
        <p class="feel narration" id="labNarration"></p>
      </section>

      <p class="footer-note">
        These labs are the same rules the local atlas uses — simplified so you can see one force at a time.
        The map editor silently repairs broken geography; here you can break it on purpose and watch water, climate, and cities follow.
        Roadmap: <a href="/roadmap.html">/roadmap.html</a> · Critique: <a href="/critique.html">/critique.html</a> · Editor: <a href="/">/</a>
      </p>
    </div>
  `

  paintRail()
  bindChrome()
  startHero()
  mountActive()
}

function paintRail() {
  const rail = document.querySelector('#labRail')!
  rail.innerHTML = LABS.map(
    (l) => `
    <button type="button" class="chip-btn ${l.id === active ? 'active' : ''}" data-lab="${l.id}">
      <small>${l.num}</small>${l.title}
    </button>`,
  ).join('')
  rail.querySelectorAll<HTMLButtonElement>('[data-lab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      active = btn.dataset.lab as LabId
      paintRail()
      const lab = labMeta(active)
      document.querySelector('#labNum')!.textContent = lab.num
      document.querySelector('#labTitle')!.textContent = lab.title
      document.querySelector('#labTagline')!.textContent = lab.tagline
      document.querySelector('#labPhysics')!.textContent = lab.physics
      document.querySelector('#labTeach')!.innerHTML = lab.teaches.map((t) => `<li>${t}</li>`).join('')
      mountActive()
      document.querySelector('#labs')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  })
}

function mountActive() {
  stopLab?.()
  stopLab = null
  const mount = document.querySelector<HTMLElement>('#labMount')!
  // retrigger elegant enter (animation-principles: slow-in/out staging)
  mount.replaceChildren()
  void mount.offsetWidth
  mount.style.animation = 'none'
  void mount.offsetWidth
  mount.style.animation = ''

  const narrate = (t: string) => {
    const el = document.querySelector<HTMLElement>('#labNarration')
    if (!el || el.textContent === t) return
    el.style.opacity = '0'
    window.setTimeout(() => {
      el.textContent = t
      el.style.opacity = '1'
    }, 140)
  }
  if (active === 'elevation') stopLab = mountElevation(mount, narrate)
  else if (active === 'rivers') stopLab = mountRivers(mount, narrate)
  else if (active === 'rain') stopLab = mountRain(mount, narrate)
  else if (active === 'tectonics') stopLab = mountTectonics(mount, narrate)
  else if (active === 'continents') stopLab = mountContinents(mount, narrate)
  else stopLab = mountSettle(mount, narrate)
}

function bindChrome() {
  document.querySelectorAll<HTMLButtonElement>('[data-jump]').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelector(`#${btn.dataset.jump}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  })
}

function startHero() {
  cancelAnimationFrame(heroRaf)
  const canvas = document.querySelector<HTMLCanvasElement>('#heroCanvas')
  if (!canvas) return
  const ctx = canvas.getContext('2d')!
  const particles = Array.from({ length: 40 }, () => ({
    x: Math.random(),
    y: Math.random(),
    v: 0.0007 + Math.random() * 0.0016,
    s: 0.6 + Math.random() * 1.6,
  }))

  const resize = () => {
    const rect = canvas.getBoundingClientRect()
    canvas.width = Math.floor(rect.width * devicePixelRatio)
    canvas.height = Math.floor(rect.height * devicePixelRatio)
  }
  resize()
  window.addEventListener('resize', resize, { passive: true })

  const tick = (t: number) => {
    const w = canvas.width
    const h = canvas.height
    ctx.clearRect(0, 0, w, h)
    const g = ctx.createLinearGradient(0, 0, w, h)
    g.addColorStop(0, '#163a44')
    g.addColorStop(0.55, '#1f5a66')
    g.addColorStop(1, '#2a6b5c')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, w, h)

    ctx.fillStyle = 'rgba(212, 180, 120, 0.16)'
    ctx.beginPath()
    ctx.moveTo(0, h * 0.58)
    for (let x = 0; x <= w; x += w / 36) {
      const y =
        h *
        (0.52 +
          0.07 * Math.sin(x * 0.01 + t * 0.0004) +
          0.1 * Math.sin(x * 0.004 + 1.2))
      ctx.lineTo(x, y)
    }
    ctx.lineTo(w, h)
    ctx.lineTo(0, h)
    ctx.fill()

    for (const p of particles) {
      p.x += p.v
      if (p.x > 1.05) {
        p.x = -0.05
        p.y = Math.random()
      }
      ctx.fillStyle = `rgba(231,242,240,${0.15 + p.s * 0.08})`
      ctx.beginPath()
      ctx.arc(p.x * w, p.y * h * 0.5, p.s * devicePixelRatio, 0, Math.PI * 2)
      ctx.fill()
    }
    heroRaf = requestAnimationFrame(tick)
  }
  heroRaf = requestAnimationFrame(tick)
}

render()
