import { defineConfig, loadEnv } from 'vite'

function cspMeta(apiUrl) {
  const connect = ["'self'"]
  if (apiUrl) {
    try { connect.push(new URL(apiUrl).origin) } catch { /* invalid URL: keep 'self' only */ }
  }
  const content = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    `connect-src ${connect.join(' ')}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'none'",
  ].join('; ')
  return {
    name: 'csp-meta',
    apply: 'build',
    transformIndexHtml: () => [{ tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content }, injectTo: 'head-prepend' }],
  }
}

export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, process.cwd(), 'VITE_'), ...process.env }
  return {
    base: './',
    plugins: [cspMeta(env.VITE_API_MODE === 'local' ? '' : env.VITE_API_URL)],
    build: { outDir: 'dist', target: 'es2022' },
    server: { fs: { allow: ['.'] } },
    test: { include: ['tests/**/*.test.js'], environment: 'node' },
  }
})
