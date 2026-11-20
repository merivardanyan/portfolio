// Loads site/config.js and normalises siteUrl for the build scripts.
import { fileURLToPath, pathToFileURL } from 'node:url'
import path from 'node:path'

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
export const site = path.join(root, 'site')

const PLACEHOLDER = /YOUR_|example\.(com|org)/i

export async function loadSiteConfig({ production = process.argv.includes('--production') } = {}) {
  const { default: config } = await import(`${pathToFileURL(path.join(site, 'config.js')).href}?t=${Date.now()}`)
  let url
  try {
    url = new URL(config.siteUrl)
  } catch {
    throw new Error(`site/config.js: siteUrl "${config.siteUrl}" is not an absolute URL`)
  }
  if (!/^https?:$/.test(url.protocol)) throw new Error('site/config.js: siteUrl must be http(s)')
  url.pathname = url.pathname.replace(/\/?$/, '/')
  url.search = ''
  url.hash = ''
  const placeholder = PLACEHOLDER.test(url.href)
  if (placeholder && production) {
    throw new Error(`site/config.js: siteUrl is still the placeholder "${config.siteUrl}". Set the deployed URL before a --production build.`)
  }
  return {
    config,
    siteUrl: url.href,
    basePath: url.pathname,
    placeholder,
    abs: (rel) => new URL(rel.replace(/^\.?\//, ''), url).href,
  }
}
