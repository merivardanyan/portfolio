# Portfolio

A hand-coded portfolio site plus six projects people actually want to try. Every project ships a static demo that runs on browser storage, and most also include a real backend you can run locally with one command.

| Project | Hook | Stack | Folder |
|---|---|---|---|
| Hue Hunt | Rebuild a color from memory; daily puzzle with a shareable grid | React, Node, SQLite | `projects/hue-hunt` |
| Ghostwriter | Share a link that replays your writing keystroke by keystroke | React (serverless by design) | `projects/ghostwriter` |
| Fair Share | Split a receipt by who ate what, live | React, Zustand, Node, ws, SQLite | `projects/fair-share` |
| Seed Sequencer | A garden where every plant is a loop | Vue 3, Pinia, Web Audio | `projects/seed-sequencer` |
| Throttle Lab | Four rate limiters side by side; see why a request gets a 429 | Vanilla JS, Web Components, Node, SQLite | `projects/throttle-lab` |
| Hot Take Court | Put your opinion on trial and get a verdict card | PHP 8, MySQL/SQLite, vanilla JS | `projects/hot-take-court` |

Each project has its own README covering the pitch, architecture, run instructions, design decisions and next steps.

## Quick start

```bash
npm run build:demos   # build every project's static demo and copy it to site/demos/<slug>/
npm run build:site    # bake site/config.js + site/projects.json into site/index.html
npm run serve         # http://localhost:4173/portfolio/ (sub-path, like GitHub Pages)
```

`node scripts/copy-demos.mjs seed-sequencer throttle-lab` builds only the projects you name. `--skip-build` copies existing `dist/` folders as they are. The script fails (exit code 1) if a build fails or a demo's `index.html` uses absolute `/assets/` paths, and it warns if a demo has no "← Portfolio" link.

Requirements: Node 22.5+ (built-in `node:sqlite`; developed on Node 26) and PHP 8.5 with `pdo_sqlite` for Hot Take Court's server.

## Personalize before publishing

1. **`site/config.js`**: name, initials, role, location, email, GitHub, LinkedIn, repo URL, deployed site URL, about text and "looking for". Every field is a placeholder (`YOUR NAME`, `you@example.com`, `https://github.com/YOUR_USERNAME`, ...). Nothing personal is invented anywhere else.
2. **Images**: see `site/assets/images/IMAGES_NEEDED.md`. The hero, social card, favicons and the six covers are in place. The portrait slot (`portrait.webp`) and the per-demo `og.png` files are still to come. Flags in `config.js` turn slots on; until then, CSS fallbacks render and nothing requests a missing file.
3. Run `npm run build:site` so the static HTML (seen by crawlers, link previews and no-JS visitors) matches.

## Layout

```
site/                       the portfolio (plain HTML/CSS/JS, no build step, no CDNs)
  index.html                all sections; grid + config fields baked in between markers
  styles.css  main.js       main.js is an ES module (< 10 KB)
  render.js                 card/config renderers shared by main.js and the bake script
  config.js  projects.json  the only files you normally edit
  404.html                  GitHub Pages fallback (sets <base> for project sites)
  assets/fonts/             self-hosted Inter, Space Grotesk, JetBrains Mono (latin, woff2, OFL)
  assets/images/            hero, OG card, favicons, project covers
  demos/<slug>/             build output from scripts/copy-demos.mjs
scripts/
  copy-demos.mjs            build + copy + validate demos
  build-site.mjs            bake config + projects into index.html, compute page weight
  serve.mjs                 zero-dependency static server with a sub-path mount
projects/<slug>/            one folder per project
```

## Site decisions

- **No framework, no build step, no third-party requests.** Fonts are self-hosted (about 71 KB for 4 files). The page is about 127 KB of code and fonts uncompressed, and about 90 KB over the wire (gzip), before images.
- **Progressive enhancement.** The project grid and all config values are baked into the HTML, so the page works with JS disabled. JS adds the filter chips (All / React / Vue / Node / PHP), theme toggle, copy-email, scroll reveals and the hero dot field. It also re-renders the grid from `projects.json`, so adding a project means adding one JSON entry and a cover image.
- **Dark by default**, with a manual light theme saved in `localStorage` and applied before first paint, so there's no flash.
- **Motion is optional.** Reveals use opacity and transform only (no layout shift). The hero canvas pauses offscreen and in background tabs, and draws a single static frame under `prefers-reduced-motion`.
- **Accessibility.** Skip link, landmarks, one `h1`, `aria-pressed` filter chips with a live result count, case studies in native `<details>`, and accent-colored focus rings.

## Deploying to GitHub Pages

Publish the `site/` folder, either with an Actions workflow that runs `npm run build` and uploads `site/` as the Pages artifact, or by committing `site/demos/` and serving `site/` from a branch. All demo builds use relative paths (`base: './'`) and hash or no routing, so they work under `/<repo>/demos/<slug>/` and refreshing never 404s.
