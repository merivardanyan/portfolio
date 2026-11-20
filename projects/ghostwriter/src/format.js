export function formatClock(ms, tenths = false) {
  const safe = Math.max(0, ms);
  const total = Math.floor(safe / 1000);
  const m = Math.floor(total / 60);
  const s = String(total % 60).padStart(2, '0');
  return tenths ? `${m}:${s}.${Math.floor((safe % 1000) / 100)}` : `${m}:${s}`;
}

export function formatDuration(ms) {
  const s = Math.max(0, ms) / 1000;
  if (s < 60) return `${s.toFixed(1)} s`;
  const m = Math.floor(s / 60);
  return `${m} min ${Math.round(s % 60)} s`;
}

export function formatBytes(n) {
  return n < 1024 ? `${n} B` : `${(n / 1024).toFixed(1)} KB`;
}

export function formatDate(ms) {
  return new Date(ms).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}
