import { api } from './api.js'
import {
  CATEGORIES, MAX_TAKE, MAX_ARGUMENT, SORTS, VERDICT_LABEL, caseNumber, timeLabel, encodeVerdict, decodeVerdict, percentSplit,
} from './core.js'
import { verdictCardSvg, downloadCardPng } from './card.js'

const view = document.getElementById('view')
const nav = document.getElementById('nav-user')
const live = document.getElementById('live')
let session = null
let current = null

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]))
const SORT_LABEL = { trending: 'Trending', new: 'Newest', closing: 'Closing soon' }

function announce(msg) {
  live.textContent = ''
  requestAnimationFrame(() => { live.textContent = msg })
}

function toast(msg, kind = 'info') {
  const el = document.getElementById('toast')
  el.textContent = msg
  el.dataset.kind = kind
  el.hidden = false
  clearTimeout(toast.t)
  toast.t = setTimeout(() => { el.hidden = true }, 3500)
  announce(msg)
}

function parseHash() {
  const raw = location.hash.replace(/^#/, '') || '/'
  const [path, query = ''] = raw.split('?')
  return { path, params: new URLSearchParams(query) }
}

function hashFor(path, params = {}) {
  const q = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== null && v !== undefined && v !== ''))
  return `#${path}${q.toString() ? `?${q}` : ''}`
}

function splitBar(guilty, acquit) {
  const s = percentSplit(guilty, acquit)
  const g = s.total ? s.guilty : 50
  return `<div class="split" role="img" aria-label="${s.guilty}% guilty, ${s.acquit}% not guilty, ${s.total} votes">
    <div class="split__bar"><span class="split__g" style="width:${g}%"></span><span class="split__a" style="width:${100 - g}%"></span></div>
    <div class="split__legend" aria-hidden="true"><span class="g">Guilty ${s.guilty}%</span><span class="muted">${s.total} votes</span><span class="a">Not guilty ${s.acquit}%</span></div>
  </div>`
}

function statusBadge(verdict) {
  return `<span class="badge badge--${verdict.status}">${VERDICT_LABEL[verdict.status]}</span>`
}

const isOwnCase = (c) => !!session && c.author === session.username

function voteButtons(c, compact = false) {
  if (c.verdict.status !== 'open') return ''
  if (isOwnCase(c)) return `<p class="voted">You filed this case, so the jury decides without you.</p>`
  if (c.yourVote) return `<p class="voted">You voted <strong>${c.yourVote === 'guilty' ? 'Guilty' : 'Not guilty'}</strong>.</p>`
  if (!session) return `<p class="voted"><a href="${hashFor('/login', { next: `/cases/${c.id}` })}">Log in</a> to sit on the jury.</p>`
  return `<div class="vote-row${compact ? ' vote-row--compact' : ''}">
    <button type="button" class="btn btn--guilty" data-action="vote" data-id="${c.id}" data-verdict="guilty">Guilty<span class="visually-hidden">: this take is wrong</span></button>
    <button type="button" class="btn btn--acquit" data-action="vote" data-id="${c.id}" data-verdict="acquit">Not guilty<span class="visually-hidden">: this take is right</span></button>
  </div>`
}

function caseCard(c) {
  return `<article class="case-card" aria-labelledby="case-${c.id}">
    <div class="case-card__meta">
      <span class="mono">${caseNumber(c.id)}</span>
      <a class="tag" href="${hashFor('/', { cat: c.category })}">${esc(c.category)}</a>
      <span class="muted">${timeLabel(c, Date.now())}</span>
    </div>
    <h3 class="case-card__take" id="case-${c.id}"><a href="#/cases/${c.id}">“${esc(c.body)}”</a></h3>
    ${splitBar(c.guilty, c.acquit)}
    <div class="case-card__foot">
      <span class="muted">Filed by <a href="#/u/${encodeURIComponent(c.author)}">@${esc(c.author)}</a></span>
      ${statusBadge(c.verdict)}
    </div>
    ${voteButtons(c, true)}
  </article>`
}

function pagination(page, pages, params) {
  if (pages <= 1) return ''
  const link = (p, label, rel) => `<a class="btn btn--ghost" rel="${rel}" href="${hashFor('/', { ...params, page: p })}">${label}</a>`
  return `<nav class="pager" aria-label="Pagination">
    ${page > 1 ? link(page - 1, '← Previous', 'prev') : '<span></span>'}
    <span class="muted">Page ${page} of ${pages}</span>
    ${page < pages ? link(page + 1, 'Next →', 'next') : '<span></span>'}
  </nav>`
}

async function renderDocket(params) {
  const sort = SORTS.includes(params.get('sort')) ? params.get('sort') : 'trending'
  const cat = CATEGORIES.includes(params.get('cat')) ? params.get('cat') : null
  const data = await api.listCases({ sort, category: cat, page: params.get('page') || 1 })
  const base = { sort: sort === 'trending' ? null : sort, cat }
  return `<section class="hero">
      <h1 tabindex="-1">The Docket</h1>
      <p class="lede">Hot takes on trial. Every case closes 72 hours after filing. You're the jury.</p>
      <a class="btn btn--primary" href="#/new">File a case</a>
    </section>
    <nav class="tabs" aria-label="Sort cases">
      ${SORTS.map((s) => `<a href="${hashFor('/', { ...base, sort: s === 'trending' ? null : s, page: null })}" ${s === sort ? 'aria-current="page"' : ''}>${SORT_LABEL[s]}</a>`).join('')}
    </nav>
    <nav class="chips" aria-label="Filter by category">
      <a href="${hashFor('/', { ...base, cat: null })}" ${!cat ? 'aria-current="page"' : ''}>All</a>
      ${CATEGORIES.map((c) => `<a href="${hashFor('/', { ...base, cat: c })}" ${c === cat ? 'aria-current="page"' : ''}>${esc(c)}</a>`).join('')}
    </nav>
    <h2 class="visually-hidden">${SORT_LABEL[sort]} cases${cat ? ` in ${esc(cat)}` : ''}</h2>
    ${data.items.length ? `<div class="case-list">${data.items.map(caseCard).join('')}</div>` : '<p class="empty">No open cases here. File one?</p>'}
    ${pagination(data.page, data.pages, base)}`
}

function argumentItem(a) {
  const disabled = !session || a.yours || a.yourUpvote
  const label = a.yourUpvote ? 'Upvoted' : 'Upvote'
  return `<li class="arg">
    <p>${esc(a.body)}</p>
    <div class="arg__foot">
      <span class="muted">@${esc(a.author)}${a.yours ? ' (you)' : ''}</span>
      <button type="button" class="btn btn--small" data-action="upvote" data-id="${a.id}" aria-pressed="${a.yourUpvote}" ${disabled ? 'disabled' : ''}>
        ▲ <span class="visually-hidden">${label}, </span>${a.upvotes}
      </button>
    </div>
  </li>`
}

async function renderCase(id) {
  const c = await api.getCase(id)
  current = c
  const open = c.verdict.status === 'open'
  const side = (s) => c.arguments.filter((a) => a.side === s)
  let jury = ''
  if (open && session && !c.yourVote && !isOwnCase(c)) {
    jury = `<form class="jury" data-form="vote" data-id="${c.id}">
      <label for="arg-body">Your argument <span class="muted">(optional, ${MAX_ARGUMENT} characters)</span></label>
      <input id="arg-body" name="argument" maxlength="${MAX_ARGUMENT}" autocomplete="off" placeholder="One line. Make it count.">
      <div class="vote-row">
        <button class="btn btn--guilty" name="verdict" value="guilty">Guilty<span class="visually-hidden">: this take is wrong</span></button>
        <button class="btn btn--acquit" name="verdict" value="acquit">Not guilty<span class="visually-hidden">: this take is right</span></button>
      </div>
    </form>`
  } else if (open && session && c.yourVote && !c.yourArgument) {
    jury = `${voteButtons(c)}<form class="jury" data-form="argue" data-id="${c.id}">
      <label for="arg-body">Add your argument for the ${c.yourVote === 'guilty' ? 'prosecution' : 'defence'}</label>
      <div class="inline-form"><input id="arg-body" name="argument" maxlength="${MAX_ARGUMENT}" required autocomplete="off"><button class="btn">Submit</button></div>
    </form>`
  } else {
    jury = voteButtons(c) || `<p class="voted">The jury has spoken.${c.yourVote ? ` You voted <strong>${c.yourVote === 'guilty' ? 'Guilty' : 'Not guilty'}</strong>.` : ''}</p>`
  }
  const svg = verdictCardSvg({ ...c, status: c.verdict.status })
  return `<p><a href="#/">← Back to the docket</a></p>
    <article class="case">
      <div class="case-card__meta">
        <span class="mono">${caseNumber(c.id)}</span><span class="tag">${esc(c.category)}</span>
        <span class="muted">${timeLabel(c, Date.now())}</span>${statusBadge(c.verdict)}
      </div>
      <h1 tabindex="-1" class="case__take">“${esc(c.body)}”</h1>
      <p class="muted">Filed by <a href="#/u/${encodeURIComponent(c.author)}">@${esc(c.author)}</a></p>
      ${splitBar(c.guilty, c.acquit)}
      <section class="panel" aria-labelledby="jury-h"><h2 id="jury-h">The jury</h2>${jury}</section>
      <section class="arguments" aria-labelledby="args-h">
        <h2 id="args-h">Arguments</h2>
        <div class="arguments__cols">
          <div><h3 class="g">For the prosecution (guilty)</h3>${side('guilty').length ? `<ul class="arg-list">${side('guilty').map(argumentItem).join('')}</ul>` : '<p class="muted">No arguments yet.</p>'}</div>
          <div><h3 class="a">For the defence (not guilty)</h3>${side('acquit').length ? `<ul class="arg-list">${side('acquit').map(argumentItem).join('')}</ul>` : '<p class="muted">No arguments yet.</p>'}</div>
        </div>
      </section>
      <section class="panel" aria-labelledby="card-h">
        <h2 id="card-h">Verdict card</h2>
        <figure class="card-figure">${svg}</figure>
        <div class="vote-row">
          <button type="button" class="btn" data-action="copy-link">Copy share link</button>
          <button type="button" class="btn" data-action="download">Download PNG</button>
        </div>
      </section>
    </article>`
}

function renderShared(payload) {
  const v = decodeVerdict(payload)
  if (!v) return renderNotFound('That verdict link is damaged.')
  return `<p><a href="#/">← The docket</a></p>
    <section class="panel">
      <h1 tabindex="-1">Verdict: ${esc(VERDICT_LABEL[v.status])}</h1>
      <p class="muted">A verdict someone shared with you. The snapshot lives in the link itself.</p>
      <figure class="card-figure">${verdictCardSvg(v)}</figure>
      <div class="vote-row"><a class="btn btn--primary" href="#/new">Put your own take on trial</a><a class="btn" href="#/">Browse the docket</a></div>
    </section>`
}

function renderAuth(kind, params) {
  const next = params.get('next') || '/'
  const isLogin = kind === 'login'
  return `<section class="panel narrow">
    <h1 tabindex="-1">${isLogin ? 'Log in' : 'Join the jury'}</h1>
    <p class="local-note" id="local-note"><strong>Local demo.</strong> Accounts are stored only in this browser (localStorage). Your password is hashed with PBKDF2 on this device and never sent anywhere. Still, use a throwaway password.</p>
    <form data-form="${kind}" data-next="${esc(next)}" aria-describedby="local-note" novalidate>
      <label for="u">Username</label>
      <input id="u" name="username" autocomplete="username" required minlength="3" maxlength="32" pattern="[A-Za-z0-9_]+" aria-describedby="u-hint">
      <p id="u-hint" class="hint">3-32 letters, numbers or underscores.</p>
      <label for="p">Password</label>
      <input id="p" name="password" type="password" autocomplete="${isLogin ? 'current-password' : 'new-password'}" required minlength="8" aria-describedby="p-hint">
      <p id="p-hint" class="hint">At least 8 characters.</p>
      <p class="form-error" role="alert" hidden></p>
      <button class="btn btn--primary">${isLogin ? 'Log in' : 'Create account'}</button>
    </form>
    <p class="muted">${isLogin ? `New here? <a href="${hashFor('/register', { next })}">Create an account</a>` : `Already a juror? <a href="${hashFor('/login', { next })}">Log in</a>`}</p>
  </section>`
}

function renderNew() {
  if (!session) {
    return `<section class="panel narrow"><h1 tabindex="-1">File a case</h1>
      <p>You need an account to put a take on trial.</p>
      <p><a class="btn btn--primary" href="${hashFor('/register', { next: '/new' })}">Join the jury</a> <a class="btn" href="${hashFor('/login', { next: '/new' })}">Log in</a></p></section>`
  }
  return `<section class="panel narrow">
    <h1 tabindex="-1">File a case</h1>
    <form data-form="new" novalidate>
      <label for="take">Your hot take</label>
      <textarea id="take" name="body" rows="3" maxlength="${MAX_TAKE}" required aria-describedby="take-count"></textarea>
      <p id="take-count" class="hint" aria-live="polite">0 / ${MAX_TAKE}</p>
      <label for="cat">Category</label>
      <select id="cat" name="category" required>${CATEGORIES.map((c) => `<option>${esc(c)}</option>`).join('')}</select>
      <p class="form-error" role="alert" hidden></p>
      <button class="btn btn--primary">File it. Let the jury decide.</button>
    </form>
  </section>`
}

async function renderProfile(name) {
  const p = await api.profile(name)
  const r = p.record
  const agree = p.agreement.rate === null ? 'No decided votes yet' : `${p.agreement.rate}% (${p.agreement.agreed} of ${p.agreement.decided})`
  return `<section class="hero">
      <h1 tabindex="-1">@${esc(p.username)}</h1>
      <p class="lede">Defended ${r.filed} ${r.filed === 1 ? 'take' : 'takes'}, ${r.acquitted} acquitted.</p>
    </section>
    <dl class="stats">
      <div><dt>Cases filed</dt><dd>${r.filed}</dd></div>
      <div><dt>Decided</dt><dd>${r.decided}</dd></div>
      <div><dt>Acquitted</dt><dd>${r.acquitted}</dd></div>
      <div><dt>Found guilty</dt><dd>${r.guilty}</dd></div>
      <div><dt>Agrees with the jury</dt><dd>${agree}</dd></div>
      <div><dt>Votes cast</dt><dd>${p.votesCast}</dd></div>
    </dl>
    <h2>Cases</h2>
    ${p.cases.length ? `<div class="case-list">${p.cases.map(caseCard).join('')}</div>` : '<p class="empty">No cases filed yet.</p>'}`
}

function renderNotFound(msg = 'This page was dismissed for lack of evidence.') {
  return `<section class="panel narrow"><h1 tabindex="-1">Not found</h1><p>${esc(msg)}</p><p><a href="#/">Back to the docket</a></p></section>`
}

function renderNav() {
  nav.innerHTML = session
    ? `<a href="#/u/${encodeURIComponent(session.username)}">@${esc(session.username)}</a>
       <button type="button" class="btn btn--ghost btn--small" data-action="logout">Log out</button>`
    : `<a href="#/login">Log in</a><a class="btn btn--small" href="#/register">Join</a>`
}

async function route() {
  const { path, params } = parseHash()
  const parts = path.split('/').filter(Boolean)
  let html
  try {
    if (!parts.length) html = await renderDocket(params)
    else if (parts[0] === 'cases' && parts[1]) html = await renderCase(parts[1])
    else if (parts[0] === 'verdict' && parts[1]) html = renderShared(parts[1])
    else if (parts[0] === 'new') html = renderNew()
    else if (parts[0] === 'login' || parts[0] === 'register') html = renderAuth(parts[0], params)
    else if (parts[0] === 'u' && parts[1]) html = await renderProfile(decodeURIComponent(parts[1]))
    else html = renderNotFound()
  } catch (e) {
    html = e.status === 404 ? renderNotFound(e.message) : renderNotFound(`Something went wrong: ${e.message}`)
  }
  view.innerHTML = html
  document.title = `${view.querySelector('h1')?.textContent.trim() || 'Hot Take Court'} · Hot Take Court`
  return view
}

async function navigate({ keepFocus = false } = {}) {
  const scroll = window.scrollY
  await route()
  if (keepFocus) {
    window.scrollTo(0, scroll)
  } else {
    window.scrollTo(0, 0)
    view.querySelector('h1')?.focus({ preventScroll: true })
  }
}

function formError(form, msg) {
  const el = form.querySelector('.form-error')
  el.textContent = msg
  el.hidden = false
}

async function refreshSession() {
  session = await api.session()
  renderNav()
}

document.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-action]')
  if (!btn) return
  const { action, id } = btn.dataset
  try {
    if (action === 'vote') {
      btn.disabled = true
      await api.vote(id, btn.dataset.verdict)
      toast(`Vote recorded: ${btn.dataset.verdict === 'guilty' ? 'Guilty' : 'Not guilty'}.`)
      await navigate({ keepFocus: true })
      document.getElementById(`case-${id}`)?.querySelector('a')?.focus({ preventScroll: true })
    } else if (action === 'upvote') {
      btn.disabled = true
      await api.upvote(id)
      toast('Argument upvoted.')
      await navigate({ keepFocus: true })
    } else if (action === 'logout') {
      await api.logout()
      await refreshSession()
      toast('Logged out.')
      await navigate()
    } else if (action === 'copy-link' && current) {
      const url = `${location.href.split('#')[0]}#/verdict/${encodeVerdict(current, Date.now())}`
      try {
        await navigator.clipboard.writeText(url)
        toast('Share link copied.')
      } catch {
        window.prompt('Copy this link:', url)
      }
    } else if (action === 'download' && current) {
      await downloadCardPng(verdictCardSvg({ ...current, status: current.verdict.status }), `hot-take-court-${current.id}.png`)
    } else if (action === 'reset') {
      if (!window.confirm('Reset the demo? This restores the 40 seeded cases and removes your cases, votes and accounts.')) return
      localStorage.removeItem('hot-take-court:v1')
      await api.reset()
      await refreshSession()
      toast('Demo data reset.')
      location.hash = '#/'
      await navigate()
    }
  } catch (err) {
    btn.disabled = false
    toast(err.message, 'error')
  }
})

document.addEventListener('submit', async (e) => {
  const form = e.target.closest('[data-form]')
  if (!form) return
  e.preventDefault()
  const data = new FormData(form)
  const kind = form.dataset.form
  try {
    if (kind === 'login' || kind === 'register') {
      await api[kind]({ username: String(data.get('username')).trim(), password: String(data.get('password')) })
      await refreshSession()
      toast(kind === 'login' ? `Welcome back, @${session.username}.` : `Welcome to the jury, @${session.username}.`)
      location.hash = `#${form.dataset.next || '/'}`
    } else if (kind === 'new') {
      const { id } = await api.fileCase({ body: String(data.get('body')), category: String(data.get('category')) })
      toast(`Case ${caseNumber(id)} filed.`)
      location.hash = `#/cases/${id}`
    } else if (kind === 'vote') {
      const verdict = e.submitter?.value
      const argument = String(data.get('argument') || '').trim()
      await api.vote(form.dataset.id, verdict)
      if (argument) await api.argue(form.dataset.id, argument)
      toast(`Vote recorded: ${verdict === 'guilty' ? 'Guilty' : 'Not guilty'}.`)
      await navigate({ keepFocus: true })
      document.getElementById('jury-h')?.setAttribute('tabindex', '-1')
      document.getElementById('jury-h')?.focus({ preventScroll: true })
    } else if (kind === 'argue') {
      await api.argue(form.dataset.id, String(data.get('argument')))
      toast('Argument submitted.')
      await navigate({ keepFocus: true })
    }
  } catch (err) {
    if (form.querySelector('.form-error')) formError(form, err.message)
    else toast(err.message, 'error')
  }
})

document.addEventListener('input', (e) => {
  if (e.target.id === 'take') {
    document.getElementById('take-count').textContent = `${e.target.value.length} / ${MAX_TAKE}`
  }
})

window.addEventListener('hashchange', () => navigate())

if (api.mode === 'http') document.getElementById('demo-note').hidden = true
await refreshSession()
await navigate({ keepFocus: true })
