// Progressive enhancement only. Everything visible is baked into index.html by scripts/build-site.mjs,
// so this file hydrates behaviour (filters, theme, copy, hero canvas) and never re-renders markup.
const root = document.documentElement
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)')
const prefersLight = matchMedia('(prefers-color-scheme: light)')
const $ = (s, el = document) => el.querySelector(s)
const $$ = (s, el = document) => [...el.querySelectorAll(s)]

const storedTheme = () => {
  try {
    const t = localStorage.getItem('theme')
    return t === 'light' || t === 'dark' ? t : null
  } catch {
    return null
  }
}

function setupTheme() {
  const btn = $('#theme-toggle')
  const meta = $('meta[name="theme-color"]')
  const sync = () => {
    const dark = root.dataset.theme !== 'light'
    btn.setAttribute('aria-label', dark ? 'Switch to light theme' : 'Switch to dark theme')
    meta.content = dark ? '#121212' : '#f6f3ee'
  }
  btn.hidden = false
  sync()
  btn.addEventListener('click', () => {
    root.dataset.theme = root.dataset.theme === 'light' ? 'dark' : 'light'
    try { localStorage.setItem('theme', root.dataset.theme) } catch {}
    sync()
  })
  // Follow the OS until the visitor makes an explicit choice.
  prefersLight.addEventListener('change', (e) => {
    if (storedTheme()) return
    root.dataset.theme = e.matches ? 'light' : 'dark'
    sync()
  })
}

function setupFilters() {
  const grid = $('#project-grid')
  const bar = $('.filters')
  const status = $('#filter-status')
  if (!grid || !bar) return
  bar.hidden = false
  bar.addEventListener('click', (e) => {
    const chip = e.target.closest('[data-filter]')
    if (!chip) return
    const f = chip.dataset.filter
    for (const c of $$('[data-filter]', bar)) c.setAttribute('aria-pressed', String(c === chip))
    let shown = 0
    for (const card of $$('.card', grid)) {
      const match = f === 'All' || card.dataset.stack.split(' ').includes(f.toLowerCase())
      card.hidden = !match
      card.classList.toggle('card--featured', false)
      if (match && shown++ === 0 && f === 'All') card.classList.add('card--featured')
    }
    status.textContent = `${shown} ${shown === 1 ? 'project' : 'projects'} shown${f === 'All' ? '' : ` using ${f}`}.`
  })
}

function openCaseFromHash() {
  const target = location.hash.startsWith('#case-') && document.getElementById(location.hash.slice(1))
  if (!target) return
  const card = target.closest('.card')
  if (card?.hidden) $('[data-filter="All"]')?.click()
  target.open = true
  target.querySelector('summary').focus({ preventScroll: true })
  card?.scrollIntoView({ block: 'start' })
}

function setupHeader() {
  const header = $('.site-header')
  const sentinel = document.createElement('div')
  sentinel.style.cssText = 'position:absolute;top:0;height:8px;width:1px'
  document.body.prepend(sentinel)
  new IntersectionObserver(([e]) => header.classList.toggle('is-scrolled', !e.isIntersecting)).observe(sentinel)
}

function setupReveal() {
  const els = $$('.reveal')
  if (!('IntersectionObserver' in window)) return els.forEach((el) => el.classList.add('is-in'))
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target) }
  }, { rootMargin: '0px 0px -10% 0px' })
  els.forEach((el) => io.observe(el))
}

function setupCopy() {
  const btn = $('#copy-email')
  const status = $('#copy-status')
  const email = $('.email-link')?.getAttribute('href')?.replace(/^mailto:/, '')
  if (!navigator.clipboard || !btn || !email) return
  btn.hidden = false
  btn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(email)
      status.textContent = 'Copied.'
    } catch {
      status.textContent = 'Copy failed; select the address instead.'
    }
    setTimeout(() => { status.textContent = '' }, 2500)
  })
}

// Dot field that leans away from the pointer. Static frame under reduced motion; paused offscreen.
function setupHero() {
  const canvas = $('#hero-canvas')
  const ctx = canvas?.getContext('2d')
  if (!ctx) return
  let w = 0, h = 0, dpr = 1, raf = 0, visible = true
  let accent = '', ink = ''
  const pointer = { x: -1e4, y: -1e4 }
  const readColors = () => {
    const cs = getComputedStyle(root)
    accent = cs.getPropertyValue('--accent').trim()
    ink = cs.getPropertyValue('--text').trim()
  }
  const resize = () => {
    dpr = Math.min(2, devicePixelRatio || 1)
    w = canvas.clientWidth
    h = canvas.clientHeight
    canvas.width = w * dpr
    canvas.height = h * dpr
    draw(performance.now())
  }
  function draw(t) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, w, h)
    const gap = Math.max(18, w / 18)
    const still = reduceMotion.matches
    for (let y = gap / 2; y < h; y += gap) {
      for (let x = gap / 2; x < w; x += gap) {
        const dx = x - pointer.x, dy = y - pointer.y
        const d = Math.hypot(dx, dy)
        const push = still ? 0 : Math.max(0, 1 - d / 140) * 14
        const wave = still ? 0 : Math.sin(t / 900 + x / 60 + y / 80) * 1.5
        const px = x + (d ? (dx / d) * push : 0)
        const py = y + (d ? (dy / d) * push : 0) + wave
        const near = Math.max(0, 1 - d / 160)
        ctx.fillStyle = near > 0.05 ? accent : ink
        ctx.globalAlpha = 0.25 + near * 0.75
        ctx.beginPath()
        ctx.arc(px, py, 1.6 + near * 2.4, 0, Math.PI * 2)
        ctx.fill()
      }
    }
    ctx.globalAlpha = 1
  }
  const loop = (t) => {
    draw(t)
    raf = requestAnimationFrame(loop)
  }
  const sync = () => {
    cancelAnimationFrame(raf)
    if (visible && !reduceMotion.matches && !document.hidden) raf = requestAnimationFrame(loop)
    else draw(performance.now())
  }
  readColors()
  canvas.parentElement.addEventListener('pointermove', (e) => {
    const r = canvas.getBoundingClientRect()
    pointer.x = e.clientX - r.left
    pointer.y = e.clientY - r.top
  })
  canvas.parentElement.addEventListener('pointerleave', () => { pointer.x = pointer.y = -1e4 })
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; sync() }).observe(canvas)
  new ResizeObserver(resize).observe(canvas)
  reduceMotion.addEventListener('change', sync)
  document.addEventListener('visibilitychange', sync)
  new MutationObserver(() => { readColors(); draw(performance.now()) }).observe(root, { attributeFilter: ['data-theme'] })
}

addEventListener('hashchange', openCaseFromHash)
for (const a of $$('[data-open-case]')) a.addEventListener('click', () => setTimeout(openCaseFromHash))
setupTheme()
setupFilters()
setupHeader()
setupReveal()
setupCopy()
setupHero()
openCaseFromHash()
