import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as core from '../js/core.js'
import { createLocalAdapter, hashPassword, PBKDF2_ITERATIONS } from '../js/local-adapter.js'
import { buildSeed } from '../js/seed.js'
import { verdictCardSvg } from '../js/card.js'

const { HOUR } = core
const NOW = Date.UTC(2026, 10, 19, 12)
const mk = (o) => ({ id: 1, body: 'Test take here', category: 'Food', createdAt: NOW, guilty: 0, acquit: 0, recentVotes: 0, ...o })

test('verdicts', () => {
  assert.equal(core.verdictOf(mk({ guilty: 5 }), NOW).status, 'open')
  const old = NOW - 73 * HOUR
  assert.equal(core.verdictOf(mk({ createdAt: old, guilty: 6, acquit: 4 }), NOW).status, 'guilty')
  assert.equal(core.verdictOf(mk({ createdAt: old, guilty: 3, acquit: 4 }), NOW).status, 'acquitted')
  assert.equal(core.verdictOf(mk({ createdAt: old, guilty: 4, acquit: 4 }), NOW).status, 'hung')
  assert.equal(core.isClosed(mk({ createdAt: NOW - 72 * HOUR }), NOW), true)
})

test('percent split always sums to 100', () => {
  assert.deepEqual(core.percentSplit(0, 0), { guilty: 0, acquit: 0, total: 0 })
  assert.deepEqual(core.percentSplit(1, 2), { guilty: 33, acquit: 67, total: 3 })
  for (let g = 0; g < 30; g++) for (let a = 1; a < 30; a++) {
    const s = core.percentSplit(g, a)
    assert.equal(s.guilty + s.acquit, 100)
  }
})

test('sorting and pagination', () => {
  const cases = [
    mk({ id: 1, createdAt: NOW - 1 * HOUR, recentVotes: 5 }),
    mk({ id: 2, createdAt: NOW - 30 * HOUR, recentVotes: 200 }),
    mk({ id: 3, createdAt: NOW - 80 * HOUR, recentVotes: 999 }),
    mk({ id: 4, createdAt: NOW - 70 * HOUR, recentVotes: 1 }),
  ]
  assert.deepEqual(core.sortCases(cases, 'new', NOW).map((c) => c.id), [1, 2, 4, 3])
  assert.deepEqual(core.sortCases(cases, 'closing', NOW).map((c) => c.id), [4, 2, 1])
  const trending = core.sortCases(cases, 'trending', NOW).map((c) => c.id)
  assert.ok(!trending.includes(3), 'closed cases are not trending')
  assert.deepEqual(trending, [2, 1, 4])
  assert.equal(core.trendingScore({ createdAt: NOW }, NOW), 0)

  const items = Array.from({ length: 23 }, (_, i) => i)
  assert.deepEqual(core.paginate(items, 3).items, [20, 21, 22])
  assert.equal(core.paginate(items, 99).page, 3)
  assert.equal(core.paginate(items, 'junk').page, 1)
  assert.equal(core.paginate([], 1).pages, 1)
})

test('record and agreement', () => {
  const old = NOW - 100 * HOUR
  const cs = [
    mk({ id: 1, createdAt: old, guilty: 1, acquit: 5 }),
    mk({ id: 2, createdAt: old, guilty: 5, acquit: 1 }),
    mk({ id: 3, createdAt: old, guilty: 2, acquit: 2 }),
    mk({ id: 4 }),
  ]
  assert.deepEqual(core.record(cs, NOW), { filed: 4, decided: 3, acquitted: 1, guilty: 1, hung: 1 })
  const byId = new Map(cs.map((c) => [c.id, c]))
  const votes = [
    { caseId: 1, verdict: 'acquit' }, { caseId: 2, verdict: 'acquit' }, { caseId: 3, verdict: 'guilty' },
    { caseId: 4, verdict: 'guilty' }, { caseId: 99, verdict: 'guilty' },
  ]
  assert.deepEqual(core.agreementRate(votes, byId, NOW), { decided: 2, agreed: 1, rate: 50 })
  assert.equal(core.agreementRate([], byId, NOW).rate, null)
})

test('validation', () => {
  assert.match(core.validateTake('short', 'Food'), /at least/)
  assert.match(core.validateTake('x'.repeat(141), 'Food'), /140/)
  assert.match(core.validateTake('A perfectly fine take', 'Sports'), /category/)
  assert.equal(core.validateTake('A perfectly fine take', 'Food'), null)
  assert.match(core.validateArgument('no'), /at least/)
  assert.match(core.validateArgument('x'.repeat(121)), /120/)
  assert.equal(core.validateArgument('Fine argument'), null)
  assert.match(core.validateCredentials('a b', 'password1'), /Usernames/)
  assert.match(core.validateCredentials('juror', 'short'), /Passwords/)
  assert.equal(core.validateCredentials('juror_1', 'longenough'), null)
})

test('labels and text wrapping', () => {
  assert.equal(core.caseNumber(42), 'No. 0042')
  assert.equal(core.timeLabel(mk({}), NOW), 'Closes in 3d')
  assert.equal(core.timeLabel(mk({ createdAt: NOW - 70 * HOUR }), NOW), 'Closes in 2h')
  assert.equal(core.timeLabel(mk({ createdAt: NOW - 72 * HOUR + 60_000 * 5 }), NOW), 'Closes in 5m')
  assert.equal(core.timeLabel(mk({ createdAt: NOW - 100 * HOUR }), NOW), 'Closed 1d ago')
  assert.deepEqual(core.wrapText('one two three four', 9, 3), ['one two', 'three', 'four'])
  const cut = core.wrapText('aaaa bbbb cccc dddd eeee', 9, 2)
  assert.equal(cut.length, 2)
  assert.match(cut[1], /…$/)
  assert.deepEqual(core.wrapText('supercalifragilistic', 5, 2), ['supercalifragilistic'])
})

test('verdict share payload round-trips and rejects junk', () => {
  const c = mk({ id: 7, body: 'Ünïcode “quotes” are fine', guilty: 3, acquit: 9, createdAt: NOW - 80 * HOUR })
  const v = core.decodeVerdict(core.encodeVerdict(c, NOW))
  assert.deepEqual(v, { id: 7, body: c.body, category: 'Food', guilty: 3, acquit: 9, status: 'acquitted' })
  assert.equal(core.decodeVerdict('not-json'), null)
  assert.equal(core.decodeVerdict(core.toBase64Url(JSON.stringify({ i: 1, b: 'x', c: 'Nope', g: 1, a: 1, s: 'open' }))), null)
  assert.equal(core.decodeVerdict(core.toBase64Url(JSON.stringify({ i: 1, b: 'x', c: 'Food', g: -1, a: 1, s: 'open' }))), null)
  assert.equal(core.topArgument([], 'guilty'), null)
})

test('verdict card escapes user text', () => {
  const svg = verdictCardSvg({ id: 1, body: '<script>alert(1)</script> & co', category: 'Tech', guilty: 1, acquit: 0, status: 'guilty' })
  assert.ok(!svg.includes('<script>'))
  assert.ok(svg.includes('GUILTY'))
  assert.ok(verdictCardSvg({ id: 2, body: 'x', category: 'Life', guilty: 0, acquit: 0, status: 'hung' }).includes('HUNG JURY'))
})

test('seed has 40 cases with a mix of open and closed', () => {
  const db = buildSeed(NOW)
  assert.equal(db.cases.length, 40)
  const closed = db.cases.filter((c) => core.isClosed(c, NOW)).length
  assert.ok(closed > 5 && closed < 35, `closed=${closed}`)
  assert.deepEqual(buildSeed(NOW), buildSeed(NOW))
})

function memoryStorage() {
  const m = new Map()
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }
}

test('local adapter enforces the same rules as the database', async () => {
  let t = NOW
  const api = createLocalAdapter({ storage: memoryStorage(), now: () => t })
  assert.equal(await api.session(), null)
  await assert.rejects(api.vote(1, 'guilty'), { status: 401 })
  await assert.rejects(api.register({ username: 'x', password: 'password1' }), { status: 422 })
  await api.register({ username: 'juror', password: 'password1' })
  await assert.rejects(api.register({ username: 'JUROR', password: 'password1' }), { status: 409 })
  await api.logout()
  await assert.rejects(api.login({ username: 'juror', password: 'wrongpass' }), { status: 401 })
  await assert.rejects(api.login({ username: 'crumbjudge', password: 'anything1' }), { status: 401 })
  assert.equal((await api.login({ username: 'Juror', password: 'password1' })).username, 'juror')

  const { id } = await api.fileCase({ body: 'Cold pizza is breakfast.', category: 'Food' })
  await assert.rejects(api.fileCase({ body: 'bad', category: 'Food' }), { status: 422 })
  await assert.rejects(api.vote(id, 'acquit'), { status: 403, code: 'own_case' })
  await assert.rejects(api.argue(id, 'Before voting'), { status: 403, code: 'vote_first' })

  await api.logout()
  await api.register({ username: 'second_juror', password: 'password2' })
  assert.deepEqual(await api.vote(id, 'acquit'), { guilty: 0, acquit: 1, yourVote: 'acquit' })
  await assert.rejects(api.vote(id, 'guilty'), { status: 409, code: 'already_voted' })
  await assert.rejects(api.vote(id, 'maybe'), { status: 422 })
  await assert.rejects(api.vote(9999, 'guilty'), { status: 404 })
  const arg = await api.argue(id, 'It is cold, it is pizza, it is morning.')
  assert.equal(arg.side, 'acquit')
  await assert.rejects(api.argue(id, 'Second one'), { status: 409, code: 'already_argued' })
  await assert.rejects(api.argue(id, 'x'), { status: 422 })
  await assert.rejects(api.upvote(arg.id), { status: 403, code: 'own_argument' })
  await assert.rejects(api.upvote(123456), { status: 404 })

  const detail = await api.getCase(id)
  assert.equal(detail.yourVote, 'acquit')
  assert.equal(detail.yourArgument, true)
  assert.equal(detail.topAcquit.author, 'second_juror')
  await assert.rejects(api.getCase(9999), { status: 404 })

  await api.logout()
  await api.login({ username: 'juror', password: 'password1' })
  assert.equal((await api.upvote(arg.id)).upvotes, 1)
  await assert.rejects(api.upvote(arg.id), { status: 409, code: 'already_upvoted' })

  for (let i = 0; i < 4; i++) await api.fileCase({ body: `Rate limit check ${i}`, category: 'Work' })
  await assert.rejects(api.fileCase({ body: 'One too many', category: 'Work' }), { status: 429 })

  const list = await api.listCases({ sort: 'new', category: 'Food' })
  assert.equal(list.items[0].id, id)
  assert.ok(list.items.every((c) => c.category === 'Food'))
  assert.equal((await api.listCases({ sort: 'bogus' })).sort, 'trending')
  assert.ok((await api.listCases({ sort: 'closing' })).items.every((c) => c.verdict.status === 'open'))

  t = NOW + 73 * HOUR
  await api.logout()
  await api.login({ username: 'second_juror', password: 'password2' })
  await assert.rejects(api.vote(id, 'guilty'), { status: 409, code: 'case_closed' })
  await assert.rejects(api.argue(id, 'Too late now'), { status: 409, code: 'case_closed' })
  const filer = await api.profile('juror')
  assert.equal(filer.record.filed, 5)
  assert.equal(filer.record.acquitted, 1)
  const voter = await api.profile('second_juror')
  assert.equal(voter.agreement.rate, 100)
  assert.equal(voter.votesCast, 1)
  await assert.rejects(api.profile('nobody_here'), { status: 404 })

  await api.reset()
  assert.equal((await api.listCases({ sort: 'new' })).total, 40)
})

test('local adapter recovers from corrupt storage', async () => {
  const storage = memoryStorage()
  storage.setItem('hot-take-court:v1', '{nope')
  const api = createLocalAdapter({ storage, now: () => NOW })
  assert.equal((await api.listCases({ sort: 'new' })).total, 40)
})

test('passwords are stored as PBKDF2 with a per-user salt and legacy hashes upgrade on login', async () => {
  const storage = memoryStorage()
  const api = createLocalAdapter({ storage, now: () => NOW })
  await api.register({ username: 'alice', password: 'correct horse' })
  await api.register({ username: 'bob', password: 'correct horse' })
  const db = JSON.parse(storage.getItem('hot-take-court:v1'))
  const [a, b] = ['alice', 'bob'].map((n) => db.users.find((u) => u.username === n))
  assert.equal(a.kdf, 'pbkdf2')
  assert.match(a.salt, /^[0-9a-f]{32}$/)
  assert.notEqual(a.salt, b.salt)
  assert.notEqual(a.passwordHash, b.passwordHash)
  assert.equal(a.passwordHash, await hashPassword('correct horse', a.salt, PBKDF2_ITERATIONS))
  assert.ok(!JSON.stringify(db).includes('correct horse'))

  const { createHash } = await import('node:crypto')
  a.kdf = undefined
  a.salt = 'old-salt'
  a.passwordHash = createHash('sha256').update('old-salt:correct horse').digest('hex')
  storage.setItem('hot-take-court:v1', JSON.stringify(db))
  await api.logout()
  assert.equal((await api.login({ username: 'alice', password: 'correct horse' })).username, 'alice')
  const upgraded = JSON.parse(storage.getItem('hot-take-court:v1')).users.find((u) => u.username === 'alice')
  assert.equal(upgraded.kdf, 'pbkdf2')
  assert.notEqual(upgraded.salt, 'old-salt')
})
