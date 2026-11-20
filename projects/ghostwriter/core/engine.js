export const SNAPSHOT_EVERY = 200;

export function applyEvent(text, e) {
  if (e.type === 'insert') return text.slice(0, e.pos) + e.text + text.slice(e.pos);
  return text.slice(0, e.pos) + text.slice(e.pos + e.len);
}

export function caretAfter(e) {
  return e.type === 'insert' ? e.pos + e.text.length : e.pos;
}

export function buildSnapshots(events, every = SNAPSHOT_EVERY) {
  const snapshots = [''];
  let text = '';
  for (let i = 0; i < events.length; i++) {
    text = applyEvent(text, events[i]);
    if ((i + 1) % every === 0) snapshots.push(text);
  }
  return snapshots;
}

export function countAt(events, t) {
  let lo = 0;
  let hi = events.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (events[mid].t <= t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

export function textAtCount(events, count, snapshots, every = SNAPSHOT_EVERY) {
  const snapIndex = snapshots ? Math.min(Math.floor(count / every), snapshots.length - 1) : 0;
  let text = snapshots ? snapshots[snapIndex] : '';
  for (let i = snapIndex * every; i < count; i++) text = applyEvent(text, events[i]);
  return text;
}

export function stateAt(events, t, snapshots, every = SNAPSHOT_EVERY) {
  const count = countAt(events, t);
  const text = textAtCount(events, count, snapshots, every);
  const caret = count > 0 ? caretAfter(events[count - 1]) : 0;
  return { text, caret, count };
}

export function duration(events) {
  return events.length ? events[events.length - 1].t : 0;
}

export function compressPauses(events, maxGap = 1200, keep = 600) {
  let shift = 0;
  let prev = 0;
  return events.map((e) => {
    const gap = e.t - prev;
    if (gap > maxGap) shift += gap - keep;
    prev = e.t;
    return { ...e, t: e.t - shift };
  });
}

export function activityBuckets(events, buckets = 60) {
  const out = new Array(buckets).fill(0);
  const total = duration(events);
  if (!events.length) return out;
  for (const e of events) {
    const i = total === 0 ? 0 : Math.min(buckets - 1, Math.floor((e.t / total) * buckets));
    out[i] += e.type === 'insert' ? e.text.length : e.len;
  }
  return out;
}
