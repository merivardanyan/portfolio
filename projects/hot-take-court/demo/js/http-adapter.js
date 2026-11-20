import { ApiError } from './local-adapter.js'
import { HOUR } from './core.js'

const STATUS = { DELIBERATING: 'open', GUILTY: 'guilty', ACQUITTED: 'acquitted', 'HUNG JURY': 'hung' }
const parseUtc = (s) => Date.parse(`${String(s).replace(' ', 'T')}Z`)

/**
 * Read-only bridge to the PHP app. The docket comes from GET /api/cases. Everything that needs the
 * PHP session (voting, arguing, auth, filing) and every page the API doesn't expose as JSON (case
 * detail, profile) opens the server-rendered page instead, where CSRF and the session cookie live.
 * The PHP app sends no CORS headers, so serve this demo from the same origin as the app.
 */
export function createHttpAdapter(baseUrl) {
  const root = baseUrl.replace(/\/+$/, '')

  const goTo = (path) => {
    window.location.href = `${root}${path}`
    return new Promise(() => {})
  }

  function shape(c) {
    const created = parseUtc(c.createdAt)
    const g = Number(c.guilty)
    const a = Number(c.acquit)
    const total = g + a
    const gp = total ? Math.round((g / total) * 100) : 0
    return {
      id: c.id,
      body: c.body,
      category: c.category,
      author: c.username,
      createdAt: created,
      closesAt: c.closesAt ? parseUtc(c.closesAt) : created + 72 * HOUR,
      guilty: g,
      acquit: a,
      verdict: { status: STATUS[c.verdict] ?? (c.open ? 'open' : 'hung'), guilty: gp, acquit: total ? 100 - gp : 0, total },
      yourVote: null,
    }
  }

  return {
    mode: 'http',
    session: async () => null,
    async listCases({ sort = 'trending', category = null, page = 1 } = {}) {
      const q = new URLSearchParams({ sort, page: String(page) })
      if (category) q.set('category', category)
      const res = await fetch(`${root}/api/cases?${q}`, { headers: { Accept: 'application/json' } })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new ApiError(res.status, data.error?.code ?? 'http_error', data.error?.message || `Request failed (${res.status})`, data.error?.details)
      return { ...data, items: data.items.map(shape) }
    },
    getCase: (id) => goTo(`/cases/${encodeURIComponent(id)}`),
    vote: (id) => goTo(`/cases/${encodeURIComponent(id)}`),
    argue: (id) => goTo(`/cases/${encodeURIComponent(id)}`),
    upvote: () => goTo('/'),
    profile: (username) => goTo(`/u/${encodeURIComponent(username)}`),
    register: () => goTo('/register'),
    login: () => goTo('/login'),
    logout: () => goTo('/'),
    fileCase: () => goTo('/new'),
    reset: async () => null,
  }
}
