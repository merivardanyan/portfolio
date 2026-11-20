import { hslToCss, tierFor } from '../../core/index.js';

export const CARD_W = 1200;
export const CARD_H = 630;

const FONT = '"Space Grotesk", "Segoe UI", system-ui, sans-serif';
const MONO = '"JetBrains Mono", ui-monospace, Consolas, monospace';
export const TIER_COLORS = { perfect: '#3fbf6f', close: '#e8c547', off: '#f08a3c', miss: '#ef5b52' };

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fill();
}

export function drawCard(canvas, { title, score, rounds, percentile, footer }) {
  canvas.width = CARD_W;
  canvas.height = CARD_H;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#18181a';
  ctx.fillRect(0, 0, CARD_W, CARD_H);

  const stripe = ctx.createLinearGradient(0, 0, CARD_W, 0);
  rounds.forEach((r, i) => stripe.addColorStop(rounds.length > 1 ? i / (rounds.length - 1) : 0, hslToCss(r.target)));
  ctx.fillStyle = stripe;
  ctx.fillRect(0, 0, CARD_W, 10);

  ctx.fillStyle = '#a5a5ab';
  ctx.font = `500 30px ${MONO}`;
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(title.toUpperCase(), 72, 110);

  ctx.fillStyle = '#f4f4f5';
  ctx.font = `700 168px ${FONT}`;
  const scoreText = score.toFixed(1);
  ctx.fillText(scoreText, 64, 290);
  const w = ctx.measureText(scoreText).width;
  ctx.fillStyle = '#a5a5ab';
  ctx.font = `700 72px ${FONT}`;
  ctx.fillText('%', 64 + w + 10, 290);

  if (percentile != null) {
    ctx.fillStyle = '#f4f4f5';
    ctx.font = `500 34px ${FONT}`;
    ctx.fillText(`Better than ${percentile}% of players`, 72, 350);
  }

  const n = rounds.length;
  const gap = 18;
  const areaX = 72;
  const areaW = CARD_W - 144;
  const cell = Math.min(180, (areaW - gap * (n - 1)) / n);
  const top = 400;
  rounds.forEach((r, i) => {
    const x = areaX + i * (cell + gap);
    ctx.fillStyle = hslToCss(r.target);
    roundRect(ctx, x, top, cell, 70, 14);
    ctx.fillStyle = hslToCss(r.guess);
    roundRect(ctx, x, top + 76, cell, 70, 14);
    ctx.fillStyle = TIER_COLORS[tierFor(r.score).label];
    ctx.beginPath();
    ctx.arc(x + 12, top + 176, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f4f4f5';
    ctx.font = `500 26px ${MONO}`;
    ctx.fillText(String(Math.round(r.score)), x + 30, top + 185);
  });

  ctx.fillStyle = '#a5a5ab';
  ctx.font = `400 22px ${MONO}`;
  ctx.textAlign = 'right';
  ctx.fillText(footer, CARD_W - 72, 110);
  ctx.textAlign = 'left';
  return canvas;
}

export function downloadCard(canvas, filename) {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      resolve();
    }, 'image/png');
  });
}
