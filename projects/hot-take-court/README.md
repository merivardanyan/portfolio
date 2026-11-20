# Hot Take Court: put your opinion on trial

Submit your hottest take (140 characters, one of five categories) and the internet is the jury. For 72 hours, people vote Guilty (the take is wrong) or Not guilty and argue their side in one line. The best arguments get upvoted to the top. When the case closes, you get a verdict card ("Pineapple belongs on pizza: ACQUITTED 64-36") with a rubber stamp, a split bar and a case number, ready to drop into a group chat.

![Screenshot placeholder](docs/screenshot.webp)

This project has two front ends over one set of rules:

| | What | Where |
|---|---|---|
| **The real app** | PHP 8.5, no framework. Front controller, router, controllers, repositories, PDO prepared statements, session auth, CSRF, rate limiting, MySQL 8 schema with a SQLite twin | `public/`, `src/`, `templates/`, `db/` |
| **Static demo** | The same UI and rules in vanilla JS on `localStorage`, seeded with 40 cases. This is what the portfolio links to | `demo/` |

## Run the PHP app

Requires PHP 8.5 with `pdo_sqlite` (check with `php -m`).

```bash
cd projects/hot-take-court
cp .env.example .env                                  # optional; defaults work
php -S localhost:8080 -t public public/index.php      # http://localhost:8080
php tests/smoke.php                                   # domain + full HTTP flow tests (no PHPUnit)
php db/seed.php --fresh                               # rebuild the local SQLite database
```

On the first request the app creates `data/hot-take-court.sqlite` and seeds demo data (`AUTO_SEED=1`). For MySQL, apply `db/schema.mysql.sql`, set `DB_DSN=mysql:...` in `.env`, then run `php db/seed.php`.

### Routes

- HTML: `GET /`, `GET /cases/{id}`, `GET /new`, `POST /cases`, `GET /u/{username}`, `GET|POST /login`, `GET|POST /register`, `POST /logout`
- JSON: `GET /api/cases?sort=trending|new|closing&category=&page=`, `POST /api/cases/{id}/vote` `{ verdict, argument? }`, `POST /api/cases/{id}/arguments` `{ body }`, `POST /api/arguments/{id}/upvote`. Writes need the session cookie plus a CSRF token (`X-CSRF-Token` header or `csrf` field). Plain form posts to the same endpoints redirect back, so voting works without JavaScript.
- `GET /cases/{id}/card.svg`: the verdict card, also used as the `og:image`.
- Errors: `{ "error": { "code", "message", "details"? } }`, with `429` + `Retry-After` from the rate limiter.

## Run the static demo

No build step. Serve the folder with any static server:

```bash
cd projects/hot-take-court/demo
npx serve .            # or: python -m http.server
node --test tests/     # core rules + localStorage adapter tests
```

From the repo root, `npm run build:demos` copies it to `site/demos/hot-take-court/` (tests excluded).

## Architecture

```
            PHP app (real)                                   Static demo (demo/)
 public/index.php ── Router ── Controllers          index.html ── js/app.js (hash router, views)
                                  │                                   │
                             Repositories (PDO)                  js/api.js ──┬── local-adapter.js (localStorage)
                                  │                                          └── http-adapter.js (GET /api/cases;
                         SQLite  |  MySQL 8                                       everything else opens the PHP pages)
     src/Verdict.php: verdict + trending rules  ◀── mirrored by ──▶  js/core.js
     src/VerdictCard.php: SVG card              ◀── mirrored by ──▶  js/card.js (+ PNG export via canvas)
```

- **Constraints live in the database.** `votes` has `PRIMARY KEY (case_id, user_id)`, arguments are one per juror per case, and counters update in the same transaction as the vote. The demo's local adapter enforces the same rules (and returns the same 401/404/409/422/429 statuses), so the UI handles identical error paths.
- **Adapter switch.** Set `window.HTC_API_URL` in `demo/config.js` to the PHP app's origin. The docket then reads from `GET /api/cases`, and actions that need the PHP session (voting, auth, filing, case pages) open the server-rendered pages. The PHP app sends no CORS headers, so serve the demo from the same origin in that mode.
- **Share links that survive without a server.** The demo's "Copy share link" encodes a verdict snapshot into the URL (`#/verdict/<base64url>`), so a friend who opens it sees the same card even though their `localStorage` has different data. The PHP app shares `/cases/{id}` with the SVG card as the OG image.

## Design decisions

- **No framework, by choice.** The goal is to show what a framework would give you, built by hand: routing, CSRF, session fixation protection (`session_regenerate_id` on login), `password_hash`, prepared statements and output escaping in templates.
- **Same verdict rules everywhere.** Cases close 72 hours after filing. A tie, or no votes at all, is a hung jury. Trending counts votes from the last 24 hours, damped by case age. Closed cases leave the trending and closing-soon lists.
- **MySQL-ready, SQLite-friendly.** `schema.mysql.sql` uses `ENUM`s and `AUTO_INCREMENT`. The SQLite twin uses `TEXT` + `CHECK` and `INTEGER PRIMARY KEY`. Datetimes are UTC strings in both.
- **The demo is honest about being a demo.** Demo accounts hash passwords with salted SHA-256 via Web Crypto and stay in your browser, and the footer says so. The real app uses `password_hash(PASSWORD_DEFAULT)`, rehashes on login when the default changes, and equalises login timing for unknown usernames.

## What I'd do next

- A small JSON session endpoint (`GET /api/session` with the CSRF token) so the static front end can vote against the real server cross-origin, with an explicit CORS allow-list.
- Weekly "Supreme Court" round-up of the closest verdicts.
- Moderation: report button, a word filter for takes, and an admin queue.
- Rendering the OG card to PNG on the server for platforms that don't accept SVG previews.
