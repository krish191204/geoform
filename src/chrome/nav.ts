/**
 * Top bar shared by every page: Map editor, Labs, Critique, Roadmap.
 * navHtml('editor') highlights the current page. Keep links in sync if you
 * add a page.
 */
import './nav.css'

export type AppPage = 'editor' | 'labs' | 'critique' | 'roadmap'

const LINKS: { page: AppPage; href: string; label: string }[] = [
  { page: 'editor', href: '/', label: 'Map editor' },
  { page: 'labs', href: '/labs.html', label: 'Labs' },
  { page: 'critique', href: '/critique.html', label: 'Critique' },
  { page: 'roadmap', href: '/roadmap.html', label: 'Roadmap' },
]

export function navHtml(page: AppPage, trailing = ''): string {
  const links = LINKS.map((item) => {
    const current = item.page === page
    return `<a href="${item.href}" class="${current ? 'active' : ''}"${current ? ' aria-current="page"' : ''}>${item.label}</a>`
  }).join('')

  return `
    <nav class="topnav" aria-label="Geoform">
      <a class="brand-lock" href="/">Geoform</a>
      <div class="nav-links">${links}</div>
      ${trailing}
    </nav>
  `
}
