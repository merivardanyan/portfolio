// Builds each project's static demo and copies it to site/demos/<slug>/.
// usage: node scripts/copy-demos.mjs [slug ...] [--skip-build]
// Fails (exit 1) if a build fails or a copied demo uses absolute /assets/ paths.
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { cp, rm, readFile, readdir, stat, mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const demosDir = path.join(root, 'site', 'demos')

// type "vite": npm run build in the project root, copy dist/. type "static": copy a folder as-is.
const PROJECTS = [
  { slug: 'hue-hunt', type: 'vite' },
  { slug: 'ghostwriter', type: 'vite' },
  { slug: 'fair-share', type: 'vite' },
  { slug: 'seed-sequencer', type: 'vite' },
  { slug: 'throttle-lab', type: 'vite' },
  { slug: 'hot-take-court', type: 'static', from: 'demo', exclude: ['tests'] },
]

const args = process.argv.slice(2)
const skipBuild = args.includes('--skip-build')
const only = args.filter((a) => !a.startsWith('--'))
const unknown = only.filter((s) => !PROJECTS.some((p) => p.slug === s))
if (unknown.length) {
  console.error(`Unknown project(s): ${unknown.join(', ')}`)
  process.exit(1)
}

function run(cmd, cwd, env = {}) {
  const res = spawnSync(cmd, { cwd, shell: true, stdio: 'inherit', env: { ...process.env, ...env } })
  return res.status === 0
}

async function walk(dir) {
  const out = []
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...(await walk(full)))
    else out.push(full)
  }
  return out
}

async function dirSize(dir) {
  let total = 0
  for (const f of await walk(dir)) total += (await stat(f)).size
  return total
}

async function validate(slug, dir) {
  const errors = []
  const warnings = []
  const index = path.join(dir, 'index.html')
  if (!existsSync(index)) return { errors: [`${slug}: index.html missing`], warnings }
  const html = await readFile(index, 'utf8')
  if (/(?:src|href)=["']\/assets\//.test(html)) errors.push(`${slug}: index.html uses absolute /assets/ paths (set Vite base: './')`)
  for (const f of await walk(dir)) {
    if (!/\.(css|html)$/.test(f)) continue
    const text = await readFile(f, 'utf8')
    if (/url\(\s*["']?\/assets\//.test(text)) errors.push(`${slug}: ${path.relative(dir, f)} has url(/assets/...)`)
  }
  if (!/href=["']\.\.\/\.\.\/["']/.test(html) && !/\.\.\/\.\.\//.test(await bundleText(dir))) {
    warnings.push(`${slug}: no "← Portfolio" link to ../../ found`)
  }
  return { errors, warnings }
}

async function bundleText(dir) {
  const files = (await walk(dir)).filter((f) => f.endsWith('.js'))
  return (await Promise.all(files.map((f) => readFile(f, 'utf8')))).join('\n')
}

const results = []
await mkdir(demosDir, { recursive: true })

for (const p of PROJECTS) {
  if (only.length && !only.includes(p.slug)) continue
  const projectDir = path.join(root, 'projects', p.slug)
  let source
  if (p.type === 'vite') {
    if (!existsSync(path.join(projectDir, 'package.json'))) {
      results.push({ slug: p.slug, status: 'skipped', note: 'no package.json yet' })
      continue
    }
    if (!skipBuild) {
      console.log(`\n▸ ${p.slug}: building`)
      if (!existsSync(path.join(projectDir, 'node_modules'))) {
        const install = existsSync(path.join(projectDir, 'package-lock.json')) ? 'npm ci' : 'npm install'
        if (!run(install, projectDir)) {
          results.push({ slug: p.slug, status: 'failed', note: `${install} failed` })
          continue
        }
      }
      // Demo builds always use the local adapter, whatever the developer's shell has set.
      if (!run('npm run build', projectDir, { VITE_API_MODE: 'local', VITE_API_URL: '' })) {
        results.push({ slug: p.slug, status: 'failed', note: 'npm run build failed' })
        continue
      }
    }
    source = path.join(projectDir, 'dist')
  } else {
    source = path.join(projectDir, p.from)
  }
  if (!existsSync(path.join(source, 'index.html'))) {
    results.push({ slug: p.slug, status: 'failed', note: `${path.relative(root, source)}/index.html not found` })
    continue
  }

  const target = path.join(demosDir, p.slug)
  await rm(target, { recursive: true, force: true })
  const exclude = new Set((p.exclude ?? []).map((e) => path.join(source, e)))
  await cp(source, target, { recursive: true, filter: (src) => ![...exclude].some((e) => src === e || src.startsWith(e + path.sep)) })

  const { errors, warnings } = await validate(p.slug, target)
  const kb = ((await dirSize(target)) / 1024).toFixed(1)
  results.push({ slug: p.slug, status: errors.length ? 'invalid' : 'ok', note: [...errors, ...warnings].join('; '), kb })
}

console.log('\nDemo copy summary')
for (const r of results) {
  console.log(`  ${r.status.padEnd(8)} ${r.slug.padEnd(16)} ${r.kb ? `${r.kb} KB`.padEnd(11) : ''.padEnd(11)}${r.note ?? ''}`)
}
const failed = results.filter((r) => r.status === 'failed' || r.status === 'invalid')
if (failed.length) {
  console.error(`\n${failed.length} demo(s) failed: ${failed.map((r) => r.slug).join(', ')}`)
  process.exit(1)
}
