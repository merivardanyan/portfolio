export const COLORS = {
  ok: '#3ddc84',
  no: '#ff6b6b',
  accent: '#ffb020',
  ink: '#e8eaf0',
  muted: '#8a91a3',
  line: '#2a2f3b',
  track: '#1f2430',
  panel: '#151922',
}

export const TIMELINE_SPAN_MS = 20_000

export function setupCanvas(canvas) {
  const dpr = Math.min(2, window.devicePixelRatio || 1)
  const w = canvas.clientWidth
  const h = canvas.clientHeight
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr)
    canvas.height = Math.round(h * dpr)
  }
  const ctx = canvas.getContext('2d')
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, w, h)
  ctx.font = '11px ui-monospace, Consolas, monospace'
  ctx.textBaseline = 'middle'
  return { ctx, w, h }
}

function slots(ctx, x, y, w, h, used, limit) {
  const gap = 3
  const n = Math.min(limit, 50)
  const sw = Math.max(3, (w - gap * (n - 1)) / n)
  for (let i = 0; i < n; i++) {
    ctx.fillStyle = i < used ? (used >= limit ? COLORS.no : COLORS.ok) : COLORS.track
    ctx.fillRect(x + i * (sw + gap), y, sw, h)
  }
}

function label(ctx, text, x, y, color = COLORS.muted, align = 'left') {
  ctx.fillStyle = color
  ctx.textAlign = align
  ctx.fillText(text, x, y)
}

export function drawInternals(canvas, v, now) {
  const { ctx, w, h } = setupCanvas(canvas)
  const pad = 8
  const inner = w - pad * 2
  if (v.algo === 'fixedWindow') {
    const p = (now - v.windowStart) / v.windowMs
    label(ctx, `window ${(v.windowStart / 1000).toFixed(0)}–${(v.windowEnd / 1000).toFixed(0)} s`, pad, 10)
    label(ctx, `resets in ${((v.windowEnd - now) / 1000).toFixed(1)} s`, w - pad, 10, COLORS.muted, 'right')
    ctx.fillStyle = COLORS.track
    ctx.fillRect(pad, 20, inner, 6)
    ctx.fillStyle = COLORS.accent
    ctx.fillRect(pad, 20, inner * p, 6)
    slots(ctx, pad, 36, inner, h - 44, v.count, v.limit)
  } else if (v.algo === 'slidingLog') {
    label(ctx, `last ${(v.windowMs / 1000).toFixed(0)} s: ${v.count}/${v.limit} logged`, pad, 10)
    const y = 26
    ctx.fillStyle = COLORS.track
    ctx.fillRect(pad, y, inner, 14)
    for (const t of v.log) {
      const x = pad + ((t - v.windowStart) / v.windowMs) * inner
      ctx.fillStyle = v.count >= v.limit ? COLORS.no : COLORS.ok
      ctx.fillRect(x - 1, y - 2, 3, 18)
    }
    label(ctx, 'oldest →', pad, y + 24, COLORS.muted)
    label(ctx, '← now', w - pad, y + 24, COLORS.muted, 'right')
    if (v.log.length) label(ctx, `oldest expires in ${((v.log[0] + v.windowMs - now) / 1000).toFixed(1)} s`, w / 2, y + 24, COLORS.ink, 'center')
  } else if (v.algo === 'slidingCounter') {
    const scale = Math.max(v.limit * 1.6, v.estimate + 1)
    const px = (n) => (n / scale) * inner
    const prevPart = v.previousCount * v.previousWeight
    label(ctx, `estimate ${v.previousCount} × ${(v.previousWeight * 100).toFixed(0)}% + ${v.currentCount} = ${v.estimate.toFixed(2)}`, pad, 10)
    const y = 24
    ctx.fillStyle = COLORS.track
    ctx.fillRect(pad, y, inner, 18)
    ctx.fillStyle = '#5b6b8c'
    ctx.fillRect(pad, y, px(prevPart), 18)
    ctx.fillStyle = v.estimate + 1 > v.limit ? COLORS.no : COLORS.ok
    ctx.fillRect(pad + px(prevPart), y, px(v.currentCount), 18)
    const lx = pad + px(v.limit)
    ctx.fillStyle = COLORS.accent
    ctx.fillRect(lx - 1, y - 4, 2, 26)
    label(ctx, `limit ${v.limit}`, lx, y + 30, COLORS.accent, 'center')
    label(ctx, '▮ previous (weighted)', pad, y + 30, '#8ea0c4')
  } else if (v.algo === 'tokenBucket') {
    const bw = Math.min(70, inner * 0.3)
    const bh = h - 16
    const bx = pad
    const by = 8
    const fill = v.tokens / v.capacity
    ctx.strokeStyle = COLORS.muted
    ctx.lineWidth = 1.5
    ctx.strokeRect(bx, by, bw, bh)
    ctx.fillStyle = v.tokens < 1 ? COLORS.no : COLORS.ok
    ctx.fillRect(bx + 2, by + bh - 2 - (bh - 4) * fill, bw - 4, (bh - 4) * fill)
    for (let i = 1; i < Math.min(v.capacity, 20); i++) {
      ctx.fillStyle = COLORS.panel
      ctx.fillRect(bx + 2, by + bh - 2 - ((bh - 4) * i) / v.capacity, bw - 4, 1)
    }
    const tx = bx + bw + 14
    label(ctx, `${v.tokens.toFixed(2)} / ${v.capacity} tokens`, tx, 16, COLORS.ink)
    label(ctx, `refill ${v.refillPerSec}/s (1 per ${(v.msPerToken / 1000).toFixed(1)} s)`, tx, 34)
    label(ctx, v.nextTokenInMs ? `next token in ${(v.nextTokenInMs / 1000).toFixed(1)} s` : 'bucket full', tx, 52)
  }
}

/** Returns hit targets [{ id, x, y }] for pointer and keyboard selection. */
export function drawTimeline(canvas, { events, now, cfg, algo, selectedId, reducedMotion }) {
  const { ctx, w, h } = setupCanvas(canvas)
  const xOf = (t) => w - ((now - t) / TIMELINE_SPAN_MS) * w
  const start = now - TIMELINE_SPAN_MS

  if (algo === 'slidingLog' || algo === 'slidingCounter') {
    ctx.fillStyle = 'rgba(255,176,32,0.07)'
    ctx.fillRect(xOf(now - cfg.windowMs), 0, w, h - 16)
  }
  for (let s = Math.max(0, Math.ceil(start / 1000) * 1000); s <= now; s += 1000) {
    const x = xOf(s)
    ctx.fillStyle = COLORS.line
    ctx.fillRect(x, 0, 1, h - 16)
    if ((s / 1000) % 5 === 0) label(ctx, `${s / 1000}s`, x, h - 7, COLORS.muted, 'center')
  }
  if (algo !== 'tokenBucket') {
    ctx.strokeStyle = COLORS.accent
    ctx.setLineDash([4, 4])
    ctx.lineWidth = 1
    for (let b = Math.max(0, Math.ceil(start / cfg.windowMs) * cfg.windowMs); b <= now; b += cfg.windowMs) {
      const x = Math.round(xOf(b)) + 0.5
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x, h - 16)
      ctx.stroke()
    }
    ctx.setLineDash([])
  }

  const targets = []
  let row = 0
  let lastT = null
  for (const e of events) {
    if (e.t < start) continue
    row = e.t === lastT ? row + 1 : 0
    lastT = e.t
    const x = xOf(e.t)
    const y = h - 26 - (row % 7) * 10
    const age = now - e.t
    const r = reducedMotion ? 4 : 4 * Math.min(1, 0.4 + age / 250)
    ctx.fillStyle = e.allowed ? COLORS.ok : COLORS.no
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fill()
    if (e.id === selectedId) {
      ctx.strokeStyle = COLORS.ink
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.arc(x, y, 7.5, 0, Math.PI * 2)
      ctx.stroke()
    }
    targets.push({ id: e.id, x, y })
  }
  return targets
}
