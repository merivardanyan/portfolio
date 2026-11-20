// Zero-dependency static server for site/, mounted under a sub-path to mimic GitHub Pages.
// usage: node scripts/serve.mjs [port] [mount]   e.g. node scripts/serve.mjs 4173 /portfolio/
import http from 'node:http'
import { createReadStream, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const site = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'site')
const port = Number(process.argv[2] || 4173)
const mount = (process.argv[3] || '/portfolio/').replace(/\/?$/, '/')
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp',
  '.woff2': 'font/woff2', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml',
}

const stat = (p) => { try { return statSync(p) } catch { return null } }

function send(res, status, file) {
  res.writeHead(status, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' })
  createReadStream(file).pipe(res)
}

http.createServer((req, res) => {
  const { pathname, search } = new URL(req.url, 'http://localhost')
  let url
  try {
    url = decodeURIComponent(pathname)
  } catch {
    res.writeHead(400, { 'Content-Type': 'text/plain' })
    return res.end('Bad request: malformed URL encoding')
  }
  if (url.includes('\0')) {
    res.writeHead(400, { 'Content-Type': 'text/plain' })
    return res.end('Bad request')
  }
  if (url === '/' || url === mount.slice(0, -1)) {
    res.writeHead(302, { Location: mount })
    return res.end()
  }
  const notFound = path.join(site, '404.html')
  if (!url.startsWith(mount)) return send(res, 404, notFound)

  const file = path.resolve(site, `.${path.posix.sep}${url.slice(mount.length)}`)
  if (file !== site && !file.startsWith(site + path.sep)) return send(res, 404, notFound)

  const info = stat(file)
  if (info?.isDirectory()) {
    if (!pathname.endsWith('/')) {
      res.writeHead(301, { Location: `${pathname}/${search}` })
      return res.end()
    }
    const index = path.join(file, 'index.html')
    return stat(index)?.isFile() ? send(res, 200, index) : send(res, 404, notFound)
  }
  if (info?.isFile()) return send(res, 200, file)
  send(res, 404, notFound)
}).listen(port, () => console.log(`Serving site/ at http://localhost:${port}${mount}`))
