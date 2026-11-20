import {
  sortCases, paginate, verdictOf, isClosed, record, agreementRate, topArgument,
  validateTake, validateArgument, validateCredentials, CATEGORIES, HOUR, SORTS,
} from './core.js'
import { buildSeed } from './seed.js'

const KEY = 'hot-take-court:v1'
const FILE_LIMIT = 5

/** Same shape as the PHP app's JSON errors: { error: { code, message, details } } plus the HTTP status. */
export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.details = details
  }
}

export const PBKDF2_ITERATIONS = 100_000
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
const unhex = (s) => Uint8Array.from(s.match(/../g) ?? [], (h) => parseInt(h, 16))

/** PBKDF2-SHA256 via WebCrypto. Demo accounts never leave the browser, but people reuse passwords. */
export async function hashPassword(password, saltHex, iterations = PBKDF2_ITERATIONS) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: unhex(saltHex), iterations }, key, 256)
  return hex(bits)
}

function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

/** Accounts created before PBKDF2 used one salted SHA-256 round; they are upgraded on next login. */
async function legacySha256(password, salt) {
  return hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${salt}:${password}`)))
}

const newSalt = () => hex(crypto.getRandomValues(new Uint8Array(16)))

/**
 * Mirrors the PHP app's rules in the browser: one vote per user per case (the PK on votes),
 * one upvote per user per argument, counters updated together with the vote, 72h closing,
 * and a per-user filing rate limit.
 */
export function createLocalAdapter({ storage = globalThis.localStorage, now = () => Date.now() } = {}) {
  function load() {
    try {
      const raw = storage.getItem(KEY)
      if (raw) {
        const db = JSON.parse(raw)
        if (db.version === 1) return db
      }
    } catch { /* corrupted or unavailable storage: reseed */ }
    const db = buildSeed(now())
    save(db)
    return db
  }
  function save(db) {
    try { storage.setItem(KEY, JSON.stringify(db)) } catch { /* quota or private mode */ }
  }
  function mutate(fn) {
    const db = load()
    const result = fn(db)
    save(db)
    return result
  }

  const me = (db) => db.users.find((u) => u.id === db.session) ?? null
  const userName = (db, id) => db.users.find((u) => u.id === id)?.username ?? 'unknown'
  const requireUser = (db) => {
    const u = me(db)
    if (!u) throw new ApiError(401, 'unauthenticated', 'Log in to do that.')
    return u
  }
  const findCase = (db, id) => {
    const c = db.cases.find((x) => x.id === Number(id))
    if (!c) throw new ApiError(404, 'case_not_found', 'Case not found.')
    return c
  }

  function present(db, c, t, userId) {
    const vote = db.votes.find((v) => v.caseId === c.id && v.userId === userId)
    const args = db.arguments.filter((a) => a.caseId === c.id)
    const top = (side) => {
      const a = topArgument(args, side)
      return a ? { id: a.id, body: a.body, upvotes: a.upvotes, author: userName(db, a.userId) } : null
    }
    return {
      id: c.id,
      body: c.body,
      category: c.category,
      author: userName(db, c.userId),
      createdAt: c.createdAt,
      closesAt: c.createdAt + 72 * HOUR,
      guilty: c.guilty,
      acquit: c.acquit,
      verdict: verdictOf(c, t),
      yourVote: vote?.verdict ?? null,
      topGuilty: top('guilty'),
      topAcquit: top('acquit'),
    }
  }

  return {
    mode: 'local',

    async session() {
      const db = load()
      const u = me(db)
      return u ? { id: u.id, username: u.username } : null
    },

    async register({ username, password }) {
      const err = validateCredentials(username, password)
      if (err) throw new ApiError(422, 'validation_failed', err)
      const salt = newSalt()
      const passwordHash = await hashPassword(password, salt)
      return mutate((db) => {
        if (db.users.some((u) => u.username.toLowerCase() === username.toLowerCase())) {
          throw new ApiError(409, 'username_taken', 'That username is taken.')
        }
        const user = { id: Math.max(0, ...db.users.map((u) => u.id)) + 1, username, passwordHash, salt, kdf: 'pbkdf2', createdAt: now() }
        db.users.push(user)
        db.session = user.id
        return { id: user.id, username }
      })
    },

    async login({ username, password }) {
      const db = load()
      const user = db.users.find((u) => u.username.toLowerCase() === String(username).toLowerCase())
      let ok = false
      if (user?.passwordHash) {
        const candidate = user.kdf === 'pbkdf2' ? await hashPassword(password, user.salt) : await legacySha256(password, user.salt)
        ok = timingSafeEqual(candidate, user.passwordHash)
        if (ok && user.kdf !== 'pbkdf2') {
          user.salt = newSalt()
          user.passwordHash = await hashPassword(password, user.salt)
          user.kdf = 'pbkdf2'
        }
      } else {
        await hashPassword(password, newSalt())
      }
      if (!ok) throw new ApiError(401, 'invalid_credentials', 'Wrong username or password.')
      db.session = user.id
      save(db)
      return { id: user.id, username: user.username }
    },

    async logout() {
      mutate((db) => { db.session = null })
    },

    async listCases({ sort = 'trending', category = null, page = 1 } = {}) {
      const db = load()
      const t = now()
      const s = SORTS.includes(sort) ? sort : 'trending'
      const pool = CATEGORIES.includes(category) ? db.cases.filter((c) => c.category === category) : db.cases
      const result = paginate(sortCases(pool, s, t), page)
      return { ...result, sort: s, items: result.items.map((c) => present(db, c, t, db.session)) }
    },

    async getCase(id) {
      const db = load()
      const t = now()
      const c = findCase(db, id)
      const args = db.arguments
        .filter((a) => a.caseId === c.id)
        .sort((a, b) => b.upvotes - a.upvotes || a.createdAt - b.createdAt)
        .map((a) => ({
          id: a.id,
          side: a.side,
          body: a.body,
          upvotes: a.upvotes,
          author: userName(db, a.userId),
          yourUpvote: db.argumentUpvotes.some((u) => u.argumentId === a.id && u.userId === db.session),
          yours: a.userId === db.session,
        }))
      return { ...present(db, c, t, db.session), arguments: args, yourArgument: args.some((a) => a.yours) }
    },

    async fileCase({ body, category }) {
      const err = validateTake(body, category)
      if (err) throw new ApiError(422, 'validation_failed', err)
      return mutate((db) => {
        const user = requireUser(db)
        const t = now()
        const recent = db.cases.filter((c) => c.userId === user.id && t - c.createdAt < HOUR).length
        if (recent >= FILE_LIMIT) throw new ApiError(429, 'rate_limited', `Slow down: ${FILE_LIMIT} cases per hour.`)
        const c = {
          id: Math.max(0, ...db.cases.map((x) => x.id)) + 1,
          userId: user.id, body: body.trim(), category, createdAt: t, guilty: 0, acquit: 0, recentVotes: 0,
        }
        db.cases.push(c)
        return { id: c.id }
      })
    },

    async vote(caseId, verdict) {
      if (verdict !== 'guilty' && verdict !== 'acquit') throw new ApiError(422, 'invalid_verdict', 'Unknown verdict.')
      return mutate((db) => {
        const user = requireUser(db)
        const c = findCase(db, caseId)
        if (isClosed(c, now())) throw new ApiError(409, 'case_closed', 'This case is closed.')
        if (c.userId === user.id) throw new ApiError(403, 'own_case', 'You filed this case, so you can’t sit on its jury.')
        if (db.votes.some((v) => v.caseId === c.id && v.userId === user.id)) throw new ApiError(409, 'already_voted', 'You already voted on this case.')
        db.votes.push({ caseId: c.id, userId: user.id, verdict, createdAt: now() })
        c[verdict] += 1
        c.recentVotes = (c.recentVotes ?? 0) + 1
        return { guilty: c.guilty, acquit: c.acquit, yourVote: verdict }
      })
    },

    async argue(caseId, body) {
      const err = validateArgument(body)
      if (err) throw new ApiError(422, 'invalid_argument', err)
      return mutate((db) => {
        const user = requireUser(db)
        const c = findCase(db, caseId)
        if (isClosed(c, now())) throw new ApiError(409, 'case_closed', 'This case is closed.')
        const vote = db.votes.find((v) => v.caseId === c.id && v.userId === user.id)
        if (!vote) throw new ApiError(403, 'vote_first', 'Vote first, then argue your side.')
        if (db.arguments.some((a) => a.caseId === c.id && a.userId === user.id)) throw new ApiError(409, 'already_argued', 'One argument per juror.')
        const a = {
          id: Math.max(0, ...db.arguments.map((x) => x.id)) + 1,
          caseId: c.id, userId: user.id, side: vote.verdict, body: body.trim(), upvotes: 0, createdAt: now(),
        }
        db.arguments.push(a)
        return { id: a.id, side: a.side }
      })
    },

    async upvote(argumentId) {
      return mutate((db) => {
        const user = requireUser(db)
        const a = db.arguments.find((x) => x.id === Number(argumentId))
        if (!a) throw new ApiError(404, 'argument_not_found', 'Argument not found.')
        if (a.userId === user.id) throw new ApiError(403, 'own_argument', 'You cannot upvote your own argument.')
        if (isClosed(findCase(db, a.caseId), now())) throw new ApiError(409, 'case_closed', 'This case is closed.')
        if (db.argumentUpvotes.some((u) => u.argumentId === a.id && u.userId === user.id)) throw new ApiError(409, 'already_upvoted', 'Already upvoted.')
        db.argumentUpvotes.push({ argumentId: a.id, userId: user.id })
        a.upvotes += 1
        return { upvotes: a.upvotes }
      })
    },

    async profile(username) {
      const db = load()
      const t = now()
      const user = db.users.find((u) => u.username.toLowerCase() === String(username).toLowerCase())
      if (!user) throw new ApiError(404, 'user_not_found', 'No such juror.')
      const own = db.cases.filter((c) => c.userId === user.id).sort((a, b) => b.createdAt - a.createdAt)
      const byId = new Map(db.cases.map((c) => [c.id, c]))
      return {
        username: user.username,
        cases: own.map((c) => present(db, c, t, db.session)),
        record: record(own, t),
        agreement: agreementRate(db.votes.filter((v) => v.userId === user.id), byId, t),
        votesCast: db.votes.filter((v) => v.userId === user.id).length,
      }
    },

    async reset() {
      const session = load().session
      const db = buildSeed(now())
      save(db)
      return session
    },
  }
}
