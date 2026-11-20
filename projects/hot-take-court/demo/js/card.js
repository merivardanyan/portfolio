import { caseNumber, percentSplit, wrapText, VERDICT_LABEL } from './core.js'

const esc = (s) => String(s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]))

const STAMP = {
  guilty: { color: '#b3261e', text: 'GUILTY' },
  acquitted: { color: '#1f6f43', text: 'ACQUITTED' },
  hung: { color: '#7a5a12', text: 'HUNG JURY' },
  open: { color: '#5a4636', text: 'JURY IS OUT' },
}

/** 1200x630 verdict card. Same layout as the PHP app's /cases/{id}/card.svg endpoint. */
export function verdictCardSvg({ id, body, category, guilty, acquit, status }) {
  const split = percentSplit(guilty, acquit)
  const stamp = STAMP[status] ?? STAMP.open
  const lines = wrapText(`“${body}”`, 30, 4)
  const lineH = 64
  const top = 230 - ((lines.length - 1) * lineH) / 2
  const barW = 1040
  const gW = split.total ? Math.round((barW * split.guilty) / 100) : barW / 2
  const tspans = lines.map((l, i) => `<tspan x="80" y="${top + i * lineH}">${esc(l)}</tspan>`).join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630" width="1200" height="630" role="img" aria-label="${esc(`Case ${caseNumber(id)}: ${body}. ${VERDICT_LABEL[status]}, ${split.guilty}% guilty, ${split.acquit}% not guilty.`)}">
  <rect width="1200" height="630" fill="#f4ecdf"/>
  <rect x="24" y="24" width="1152" height="582" fill="none" stroke="#1d1a17" stroke-width="3"/>
  <rect x="36" y="36" width="1128" height="558" fill="none" stroke="#1d1a17" stroke-width="1"/>
  <text x="80" y="104" font-family="Georgia, 'Times New Roman', serif" font-size="30" letter-spacing="4" fill="#1d1a17">HOT TAKE COURT</text>
  <text x="1120" y="104" text-anchor="end" font-family="ui-monospace, Consolas, monospace" font-size="26" fill="#5f574d">${esc(caseNumber(id))} · ${esc(category.toUpperCase())}</text>
  <text font-family="Georgia, 'Times New Roman', serif" font-size="54" font-weight="700" fill="#1d1a17">${tspans}</text>
  <g transform="translate(905 360) rotate(-12)">
    <rect x="-200" y="-58" width="400" height="116" rx="10" fill="none" stroke="${stamp.color}" stroke-width="8" opacity="0.92"/>
    <text text-anchor="middle" y="22" font-family="Georgia, 'Times New Roman', serif" font-size="${stamp.text.length > 9 ? 50 : 64}" font-weight="700" letter-spacing="4" fill="${stamp.color}" opacity="0.92">${stamp.text}</text>
  </g>
  <rect x="80" y="470" width="${gW}" height="34" fill="#b3261e"/>
  <rect x="${80 + gW}" y="470" width="${barW - gW}" height="34" fill="#1f6f43"/>
  <text x="80" y="550" font-family="system-ui, sans-serif" font-size="28" font-weight="700" fill="#b3261e">GUILTY ${split.guilty}%</text>
  <text x="1120" y="550" text-anchor="end" font-family="system-ui, sans-serif" font-size="28" font-weight="700" fill="#1f6f43">NOT GUILTY ${split.acquit}%</text>
  <text x="600" y="550" text-anchor="middle" font-family="system-ui, sans-serif" font-size="24" fill="#5f574d">${split.total} ${split.total === 1 ? 'vote' : 'votes'}</text>
</svg>`
}

export function downloadCardPng(svg, filename) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }))
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = 1200
      canvas.height = 630
      canvas.getContext('2d').drawImage(img, 0, 0)
      URL.revokeObjectURL(url)
      canvas.toBlob((blob) => {
        if (!blob) return reject(new Error('Could not render the card.'))
        const a = document.createElement('a')
        a.href = URL.createObjectURL(blob)
        a.download = filename
        a.click()
        setTimeout(() => URL.revokeObjectURL(a.href), 1000)
        resolve()
      }, 'image/png')
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Could not render the card.'))
    }
    img.src = url
  })
}
