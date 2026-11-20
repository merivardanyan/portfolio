export const CATEGORIES = ['Food', 'Tech', 'Life', 'Pop Culture', 'Work']
export const HOUR = 3600_000
export const CASE_TTL_MS = 72 * HOUR
export const MAX_TAKE = 140
export const MAX_ARGUMENT = 120
export const PER_PAGE = 10
export const SORTS = ['trending', 'new', 'closing']

export const closesAt = (c) => c.createdAt + CASE_TTL_MS
export const isClosed = (c, now) => now >= closesAt(c)

export function percentSplit(guilty, acquit) {
  const total = guilty + acquit
  if (!total) return { guilty: 0, acquit: 0, total: 0 }
  const g = Math.round((guilty / total) * 100)
  return { guilty: g, acquit: 100 - g, total }
}

/** status: open | guilty | acquitted | hung. Guilty = the take was found wrong. */
export function verdictOf(c, now) {
  const split = percentSplit(c.guilty, c.acquit)
  let status = 'open'
  if (isClosed(c, now)) {
    if (c.guilty > c.acquit) status = 'guilty'
    else if (c.acquit > c.guilty) status = 'acquitted'
    else status = 'hung'
  }
  return { status, ...split }
}

export const VERDICT_LABEL = { open: 'Jury is out', guilty: 'Guilty', acquitted: 'Acquitted', hung: 'Hung jury' }

/** Votes in the last 24h, damped by case age like the PHP app (score / (1 + ageH/72)). Open cases only. */
export function trendingScore(c, now) {
  const ageHours = Math.max(0, (now - c.createdAt) / HOUR)
  return (c.recentVotes ?? 0) / (1 + ageHours / 72)
}

export function sortCases(cases, sort, now) {
  const list = [...cases]
  if (sort === 'new') return list.sort((a, b) => b.createdAt - a.createdAt || b.id - a.id)
  if (sort === 'closing') {
    return list.filter((c) => !isClosed(c, now)).sort((a, b) => closesAt(a) - closesAt(b) || a.id - b.id)
  }
  return list.filter((c) => !isClosed(c, now)).sort((a, b) => trendingScore(b, now) - trendingScore(a, now) || b.id - a.id)
}

export function paginate(items, page = 1, perPage = PER_PAGE) {
  const pages = Math.max(1, Math.ceil(items.length / perPage))
  const p = Math.min(Math.max(1, Math.floor(Number(page)) || 1), pages)
  return { items: items.slice((p - 1) * perPage, p * perPage), page: p, pages, total: items.length }
}

export function record(cases, now) {
  const out = { filed: cases.length, decided: 0, acquitted: 0, guilty: 0, hung: 0 }
  for (const c of cases) {
    const { status } = verdictOf(c, now)
    if (status === 'open') continue
    out.decided++
    out[status]++
  }
  return out
}

/** Share of a juror's votes on closed cases that matched the final verdict (hung juries excluded). */
export function agreementRate(votes, casesById, now) {
  let decided = 0
  let agreed = 0
  for (const v of votes) {
    const c = casesById.get(v.caseId)
    if (!c) continue
    const { status } = verdictOf(c, now)
    if (status === 'open' || status === 'hung') continue
    decided++
    if ((status === 'guilty') === (v.verdict === 'guilty')) agreed++
  }
  return { decided, agreed, rate: decided ? Math.round((agreed / decided) * 100) : null }
}

export function topArgument(args, side) {
  return args
    .filter((a) => a.side === side)
    .sort((a, b) => b.upvotes - a.upvotes || a.createdAt - b.createdAt)[0] ?? null
}

export function validateTake(body, category) {
  const text = String(body ?? '').trim()
  if (text.length < 8) return 'Your take needs at least 8 characters.'
  if (text.length > MAX_TAKE) return `Keep it to ${MAX_TAKE} characters.`
  if (!CATEGORIES.includes(category)) return 'Pick a category.'
  return null
}

export function validateArgument(body) {
  const text = String(body ?? '').trim()
  if (text.length < 3) return 'Arguments need at least 3 characters.'
  if (text.length > MAX_ARGUMENT) return `Keep arguments to ${MAX_ARGUMENT} characters.`
  return null
}

export function validateCredentials(username, password) {
  if (!/^[a-zA-Z0-9_]{3,32}$/.test(username ?? '')) return 'Usernames are 3-32 letters, numbers or underscores.'
  if (String(password ?? '').length < 8) return 'Passwords need at least 8 characters.'
  return null
}

export const caseNumber = (id) => `No. ${String(id).padStart(4, '0')}`

export function timeLabel(c, now) {
  const diff = closesAt(c) - now
  const abs = Math.abs(diff)
  const unit = abs >= 24 * HOUR ? [Math.floor(abs / (24 * HOUR)), 'd'] : abs >= HOUR ? [Math.floor(abs / HOUR), 'h'] : [Math.max(1, Math.floor(abs / 60000)), 'm']
  return diff > 0 ? `Closes in ${unit[0]}${unit[1]}` : `Closed ${unit[0]}${unit[1]} ago`
}

export function wrapText(text, maxChars, maxLines) {
  const words = String(text).split(/\s+/).filter(Boolean)
  const lines = []
  let line = ''
  for (const w of words) {
    const next = line ? `${line} ${w}` : w
    if (next.length <= maxChars || !line) line = next
    else {
      lines.push(line)
      line = w
    }
  }
  if (line) lines.push(line)
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines)
    kept[maxLines - 1] = `${kept[maxLines - 1].slice(0, maxChars - 1).trimEnd()}…`
    return kept
  }
  return lines
}

export function toBase64Url(str) {
  const bytes = new TextEncoder().encode(str)
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function fromBase64Url(s) {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4)
  const bin = atob(b64)
  return new TextDecoder().decode(Uint8Array.from(bin, (ch) => ch.charCodeAt(0)))
}

/** A self-contained verdict snapshot for share links, so they work without a server. */
export function encodeVerdict(c, now) {
  const v = verdictOf(c, now)
  return toBase64Url(JSON.stringify({ i: c.id, b: c.body, c: c.category, g: c.guilty, a: c.acquit, s: v.status }))
}

export function decodeVerdict(payload) {
  try {
    const o = JSON.parse(fromBase64Url(payload))
    const statuses = Object.keys(VERDICT_LABEL)
    if (!Number.isInteger(o.i) || typeof o.b !== 'string' || o.b.length > MAX_TAKE || !CATEGORIES.includes(o.c)) return null
    if (!Number.isInteger(o.g) || !Number.isInteger(o.a) || o.g < 0 || o.a < 0 || !statuses.includes(o.s)) return null
    return { id: o.i, body: o.b, category: o.c, guilty: o.g, acquit: o.a, status: o.s }
  } catch {
    return null
  }
}
