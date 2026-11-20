// Bakes config.js + projects.json into site/index.html so the page is complete without JS
// (crawlers, link previews, no-JS visitors). main.js renders the same markup at runtime.
import { readFile, writeFile, stat } from 'node:fs/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'
import path from 'node:path'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const site = path.join(root, 'site')
const indexPath = path.join(site, 'index.html')

const { default: config } = await import(`${pathToFileURL(path.join(site, 'config.js')).href}?t=${Date.now()}`)
const { renderGrid, configFields, esc, HERO_IMG, PORTRAIT_IMG } = await import(pathToFileURL(path.join(site, 'render.js')).href)
const projects = JSON.parse(await readFile(path.join(site, 'projects.json'), 'utf8'))

for (const p of projects) {
  for (const key of ['slug', 'name', 'hook', 'stack', 'demo', 'source', 'image', 'accent']) {
    if (!p[key]) throw new Error(`projects.json: "${p.slug ?? '?'}" is missing "${key}"`)
  }
}

let html = await readFile(indexPath, 'utf8')

const between = (name, content) => {
  const re = new RegExp(`(<!--${name}:start-->)[\\s\\S]*?(<!--${name}:end-->)`)
  if (!re.test(html)) throw new Error(`index.html: missing <!--${name}:start--> marker`)
  html = html.replace(re, `$1${content}$2`)
}

between('grid', `\n${renderGrid(projects, config)}\n`)
between('hero', config.images?.hero ? HERO_IMG : '')
between('portrait', config.images?.portrait ? PORTRAIT_IMG : '')

const { text, href } = configFields(config)
html = html.replace(/(<([a-z0-9]+)\b[^>]*\bdata-config="([a-zA-Z0-9]+)"[^>]*>)([^<]*)(<\/\2>)/g, (m, open, tag, key, _inner, close) => (
  key in text && text[key] !== undefined ? `${open}${esc(text[key])}${close}` : m
))
html = html.replace(/<a\b([^>]*)\bdata-config-href="([a-zA-Z0-9]+)"([^>]*)>/g, (m, pre, key, post) => {
  if (!href[key]) return m
  const attrs = `${pre}data-config-href="${key}"${post}`.replace(/\s*href="[^"]*"/, '')
  return `<a href="${esc(href[key])}"${attrs.startsWith(' ') ? '' : ' '}${attrs}>`
})

const title = `${config.name} · ${config.role}`
const siteUrl = config.siteUrl.endsWith('/') ? config.siteUrl : `${config.siteUrl}/`
html = html
  .replace(/<title>[^<]*<\/title>/, `<title>${esc(title)}</title>`)
  .replace(/(<meta property="og:title" content=")[^"]*/, `$1${esc(title)}`)
  .replace(/(<meta property="og:url" content=")[^"]*/, `$1${esc(siteUrl)}`)
  .replace(/(<meta property="og:image" content=")[^"]*/, `$1${esc(`${siteUrl}assets/images/og.png`)}`)
  .replace(/(<meta name="twitter:image" content=")[^"]*/, `$1${esc(`${siteUrl}assets/images/og.png`)}`)
  .replace(/(<meta name="twitter:title" content=")[^"]*/, `$1${esc(title)}`)
  .replace(/(<meta property="og:site_name" content=")[^"]*/, `$1${esc(config.name)}`)
  .replace(/(<link rel="canonical" href=")[^"]*/, `$1${esc(siteUrl)}`)

const urls = [siteUrl, ...projects.map((p) => `${siteUrl}demos/${p.slug}/`)]
await writeFile(path.join(site, 'robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: ${siteUrl}sitemap.xml\n`)
await writeFile(path.join(site, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `  <url><loc>${esc(u)}</loc></url>`).join('\n')}\n</urlset>\n`)

const weighed = ['styles.css', 'main.js', 'render.js', 'config.js', 'projects.json', 'assets/images/favicon.svg',
  'assets/fonts/inter-latin-400-normal.woff2', 'assets/fonts/space-grotesk-latin-600-normal.woff2',
  'assets/fonts/space-grotesk-latin-700-normal.woff2', 'assets/fonts/jetbrains-mono-latin-400-normal.woff2']
let bytes = Buffer.byteLength(html)
for (const f of weighed) bytes += (await stat(path.join(site, f))).size
const kb = Math.round(bytes / 1024)
html = html.replace(/(<span id="weight">)[^<]*(<\/span>)/, `$1~${kb} KB$2`)

await writeFile(indexPath, html)
console.log(`site/index.html baked: ${projects.length} projects, page weight ~${kb} KB uncompressed (fonts included).`)
