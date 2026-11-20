// Pure string renderers shared by main.js (browser) and scripts/build-site.mjs (Node).

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

export const FILTERS = ['All', 'React', 'Vue', 'Node', 'PHP']

export const sourceUrl = (p, cfg) => (/^https?:/.test(p.source) ? p.source : `${cfg.repo}/tree/${cfg.repoBranch}/${p.source}`)

const stackKey = (p) => p.stack.map((s) => s.toLowerCase()).join(' ')

// 800w/1200w siblings are generated next to each full-size WebP (see README, "Images").
export const srcset = (src, full) => (/.webp$/.test(src)
  ? [800, 1200].map((w) => `${src.replace(/.webp$/, `-${w}.webp`)} ${w}w`).concat(`${src} ${full}w`).join(', ')
  : '')

const COVER_SIZES = {
  featured: '(min-width: 1200px) 655px, (min-width: 800px) 56vw, calc(100vw - 32px)',
  regular: '(min-width: 1200px) 570px, (min-width: 800px) 48vw, calc(100vw - 32px)',
}

function cover(p, cfg, featured) {
  const set = srcset(p.image, 1600)
  const inner = cfg.images?.covers
    ? `<img src="${esc(p.image)}"${set ? ` srcset="${esc(set)}" sizes="${featured ? COVER_SIZES.featured : COVER_SIZES.regular}"` : ''} alt="" width="1600" height="1000" loading="lazy" decoding="async">`
    : `<span class="cover__name">${esc(p.name)}</span>`
  return `<div class="cover" aria-hidden="true">${inner}</div>`
}

// The hero box is at most 460px square and crops a 16:9 image, so the image renders ~1.78x the box width.
export const HERO_SIZES = '(min-width: 520px) 818px, calc((100vw - 32px) * 1.78)'
export const HERO_SRCSET = srcset('assets/images/hero.webp', 1920)
// The only image on the page that can be the LCP element, so the only one with fetchpriority.
export const HERO_IMG = `<img src="assets/images/hero.webp" srcset="${HERO_SRCSET}" sizes="${HERO_SIZES}" alt="" width="1920" height="1080" fetchpriority="high" decoding="async">`
export const PORTRAIT_IMG = '<img src="assets/images/portrait.webp" alt="" width="368" height="460" loading="lazy" decoding="async">'

export function renderCard(p, cfg, i) {
  const featured = i === 0
  const cs = p.caseStudy ?? {}
  return `<li class="card${featured ? ' card--featured' : ''}" data-stack="${esc(stackKey(p))}" style="--card-accent:${esc(p.accent)}">
  <article class="card__inner" aria-labelledby="t-${esc(p.slug)}">
    <a class="card__media" href="${esc(p.demo)}" tabindex="-1" aria-hidden="true">${cover(p, cfg, featured)}</a>
    <div class="card__body">
      <h3 class="card__title" id="t-${esc(p.slug)}">${esc(p.name)}</h3>
      <p class="card__hook">${esc(p.hook)}</p>
      <ul class="badges" aria-label="Stack">${p.stack.map((s) => `<li>${esc(s)}</li>`).join('')}</ul>
      <div class="card__actions">
        <a class="btn btn--primary" href="${esc(p.demo)}">Live demo<span class="vh">: ${esc(p.name)}</span></a>
        <a class="btn" href="${esc(sourceUrl(p, cfg))}" rel="noopener">Source<span class="vh">: ${esc(p.name)}</span></a>
      </div>
      <details class="case" id="case-${esc(p.slug)}">
        <summary>Case study<span class="vh">: ${esc(p.name)}</span></summary>
        <div class="case__body">
          ${cs.problem ? `<h4>Problem</h4><p>${esc(cs.problem)}</p>` : ''}
          ${cs.architecture ? `<h4>Architecture</h4><p>${esc(cs.architecture)}</p>` : ''}
          ${p.highlights?.length ? `<h4>Highlights</h4><ul>${p.highlights.map((h) => `<li>${esc(h)}</li>`).join('')}</ul>` : ''}
          ${cs.decisions?.length ? `<h4>Key decisions</h4><ul>${cs.decisions.map((d) => `<li>${esc(d)}</li>`).join('')}</ul>` : ''}
          <h4>Stack</h4><p>${p.stack.map(esc).join(', ')}</p>
        </div>
      </details>
    </div>
  </article>
</li>`
}

export const renderGrid = (projects, cfg) => projects.map((p, i) => renderCard(p, cfg, i)).join('\n')

/** Fields filled from config.js. `text` keys set textContent, `href` keys set the href attribute. */
export function configFields(cfg) {
  return {
    text: {
      name: cfg.name,
      initials: cfg.initials,
      role: cfg.role,
      years: cfg.yearsExperience,
      location: cfg.location,
      email: cfg.email,
      lookingFor: cfg.lookingFor,
      about0: cfg.about?.[0],
      about1: cfg.about?.[1],
      about2: cfg.about?.[2],
      year: String(new Date().getFullYear()),
    },
    href: {
      email: `mailto:${cfg.email}`,
      github: cfg.github,
      linkedin: cfg.linkedin,
      repo: cfg.repo,
    },
  }
}
