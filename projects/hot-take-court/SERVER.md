# Hot Take Court: the PHP app

The "real" version of Hot Take Court: framework-free PHP 8.2+ (tested on 8.5), PDO, server-rendered HTML with a small progressive-enhancement script. SQLite locally, MySQL 8 in production; only `DB_DSN` changes. (`demo/` is the separate static JS build.)

## Run locally

Requirements: PHP 8.2+ with `pdo_sqlite` and `mbstring` (`php -m` to check; `curl` too for the smoke test).

```bash
cd projects/hot-take-court
cp .env.example .env                                # optional, defaults work
php -S localhost:8080 -t public public/index.php    # or: composer start
```

Open http://localhost:8080. The first request creates `data/hot-take-court.sqlite` from `db/schema.sqlite.sql` and seeds it (60 users, 40 cases, ~1,100 votes, arguments, upvotes). Demo login: **`demo` / `password123`**.

```bash
php db/seed.php --fresh     # rebuild the SQLite database from scratch
php tests/smoke.php         # 18 checks: repositories (in-memory SQLite) + full HTTP flow against php -S
```

### MySQL 8 (production)

```bash
mysql -u root -p -e "CREATE DATABASE hot_take_court CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci"
mysql -u root -p hot_take_court < db/schema.mysql.sql
# .env:
#   DB_DSN=mysql:host=127.0.0.1;dbname=hot_take_court;charset=utf8mb4
#   DB_USER=... DB_PASS=...  APP_ENV=production  SESSION_SECURE=1
php db/seed.php              # optional demo data
```

SQL is written to be portable (no engine-specific functions; datetimes are UTC `Y-m-d H:i:s` strings in both, counters use `col = col + 1`, unique violations are detected by SQLSTATE `23000` on both drivers). The MySQL path was not executed here (no MySQL server available); the SQLite path is fully tested.

## Architecture

```
public/index.php            front controller: bootstrap, session, routes, error rendering
  └─ Router                 '/cases/{id}' patterns, 404 / 405 + Allow
      └─ Controllers        CaseController (docket, case page, card, file, profile)
         │                  AuthController (register, login, logout)
         │                  ApiController  (JSON: list, vote, argue, upvote)
         └─ Repositories    Case / Vote / Argument / User: all SQL lives here, prepared statements only
             └─ Db          PDO wrapper: typed binds, transactions, SQLite auto-schema
src/Verdict.php             pure rules: verdict label, percentages, trending score
src/VerdictCard.php         pure SVG renderer for the card / og:image
src/Auth.php, Csrf.php, RateLimiter.php, Clock.php, View.php, Config.php
templates/*.php             plain PHP templates, everything escaped with e()
```

## Routes

| Method | Path | Notes |
|---|---|---|
| GET | `/` | Docket. `?sort=trending\|new\|closing&category=Food&page=2`, 10 per page |
| GET | `/cases/{id}` | Verdict page: SVG card, tally, vote form, top argument per side, all arguments, copy link, OG tags |
| GET | `/cases/{id}/card.svg` | 1200x630 verdict card (also the `og:image`). Cached 60 s while open, 1 day when closed |
| GET | `/new` | File-a-case form (redirects to login if needed) |
| POST | `/cases` | `body` (3-140 chars, whitespace normalised), `category` (Food, Tech, Life, Pop Culture, Work) |
| GET | `/u/{username}` | Profile: cases, record ("Defended 12 takes, 8 acquitted"), agreement rate with the jury |
| GET/POST | `/login`, `/register` | |
| POST | `/logout` | POST + CSRF only |
| GET | `/api/cases` | `?sort=&category=&page=` -> `{ items: [{ id, body, category, username, createdAt, closesAt, guilty, acquit, open, verdict, url, card }], page, pages, total, sort, category }` |
| POST | `/api/cases/{id}/vote` | `{ verdict: 'guilty'\|'acquit', argument?, csrf? }` -> `{ guilty, acquit, yourVote, argument? }` |
| POST | `/api/cases/{id}/arguments` | `{ body }` (3-120 chars). Side = your vote. -> `201 { argument }` |
| POST | `/api/arguments/{id}/upvote` | -> `{ id, upvotes }` |

JSON errors: `{ "error": { "code", "message", "details?" } }`. Codes include `unauthenticated` 401, `csrf_mismatch` 419, `own_case` / `own_argument` / `vote_first` 403, `case_not_found` / `argument_not_found` / `not_found` 404, `method_not_allowed` 405, `already_voted` / `already_argued` / `already_upvoted` / `case_closed` 409, `invalid_verdict` / `invalid_argument` 422, `invalid_sort` / `invalid_page` / `invalid_category` 400, `rate_limited` 429 (+ `Retry-After`).

The `/api/*` write endpoints also accept plain form posts (no JS): they redirect back to the case page with a flash message, and errors render as HTML. `public/assets/app.js` upgrades them to `fetch()`.

## Security

- **Passwords**: `password_hash(PASSWORD_DEFAULT)` (bcrypt), 8-72 chars, `password_needs_rehash` on login. Unknown usernames still run `password_verify` against a dummy hash so timing doesn't reveal which accounts exist; the error message is generic.
- **Sessions**: strict mode, cookie-only, `HttpOnly`, `SameSite=Lax`, `Secure` on HTTPS (or `SESSION_SECURE=1`). `session_regenerate_id(true)` on login/register; logout destroys the session and cookie.
- **CSRF**: per-session synchronizer token on every POST (form `_csrf`, JSON `csrf`, or `X-CSRF-Token` header), compared with `hash_equals`, rotated on login.
- **SQL**: PDO prepared statements everywhere, `ATTR_EMULATE_PREPARES=false`, ints bound as `PARAM_INT`. The only interpolated identifier (the vote counter column) comes from a whitelist.
- **One vote per user per case** is the `votes` primary key `(case_id, user_id)`; the counter update runs in the same transaction, so two concurrent votes cannot both land or skew counts. Same pattern for `arguments (case_id, user_id)` and `argument_upvotes (argument_id, user_id)`.
- **Rate limits** (table `rate_limits`, subjects stored as SHA-256): login 5 per 15 min per IP+username and 30 per IP; register 5/hour per IP (`REGISTER_LIMIT_PER_HOUR`); filing 10/hour, votes 60/min, arguments 20/hour, upvotes 120/hour per user.
- **Output**: every template value goes through `e()`; the SVG card escapes with `ENT_XML1`. Headers: CSP (`script-src 'self'`, no inline script or style), `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`. The SVG response gets its own `default-src 'none'` CSP.
- **Redirects**: `next=` only accepts same-site relative paths.

## Rules

- Cases close 72 hours after filing. You can't vote on your own case or upvote your own argument.
- Verdict when closed: more guilty votes = `GUILTY`, more not-guilty = `ACQUITTED`, tie or no votes = `HUNG JURY`. While open: `DELIBERATING`.
- Trending = votes from the last 24 h, each weighted `0.5^(age_h / 6)` (6 h half-life), divided by `1 + case_age_h / 72`. Ranked in PHP for portability; at real scale this would be a periodically materialised column.
- Agreement rate = share of your votes on closed, decided (non-tied) cases that matched the majority.

## Notes / what I'd do next

- Many social networks don't render SVG `og:image`s. Next step: rasterise the same SVG to PNG (Imagick or a headless browser job) and cache it on case close.
- Materialise the trending score (cron or on-vote update) instead of ranking open cases per request.
- MySQL integration run in CI (docker `mysql:8`) to execute the same smoke test against `schema.mysql.sql`.
