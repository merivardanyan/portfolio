import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// Build-only so the dev server's HMR client isn't blocked. Vue's runtime build needs no eval.
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
].join('; ')

const cspMeta = {
  name: 'csp-meta',
  apply: 'build',
  transformIndexHtml: () => [{ tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: CSP }, injectTo: 'head-prepend' }],
}

export default defineConfig({
  base: './',
  plugins: [vue(), cspMeta],
  build: { outDir: 'dist', target: 'es2022' },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.js'],
    coverage: {
      provider: 'v8',
      include: ['src/state/**', 'src/music/**', 'src/audio/scheduler.js'],
    },
  },
})
