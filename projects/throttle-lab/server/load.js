#!/usr/bin/env node
// Tiny autocannon-style load script (zero deps).
//   node load.js [--url http://127.0.0.1:8789] [--algo tokenBucket|all] [--rps 20] [--seconds 5] [--key demo]
// Prints a per-second timeline of 200 vs 429 for each algorithm.

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => {
  if (a.startsWith('--')) acc.push([a.slice(2), all[i + 1]?.startsWith('--') ? 'true' : all[i + 1]]);
  return acc;
}, []));
const base = args.url ?? 'http://127.0.0.1:8789';
const algos = (args.algo ?? 'all') === 'all' ? ['fixedWindow', 'slidingLog', 'slidingCounter', 'tokenBucket'] : [args.algo];
const rps = Number(args.rps ?? 20);
const seconds = Number(args.seconds ?? 5);
const key = args.key ?? `load-${Date.now()}`;

const stats = Object.fromEntries(algos.map((a) => [a, Array.from({ length: seconds }, () => ({ ok: 0, limited: 0, other: 0 }))]));
const start = Date.now();
const inflight = [];

for (let i = 0; i < rps * seconds; i++) {
  const due = start + (i * 1000) / rps;
  await new Promise((r) => setTimeout(r, Math.max(0, due - Date.now())));
  const sec = Math.min(seconds - 1, Math.floor((Date.now() - start) / 1000));
  for (const algo of algos) {
    inflight.push(fetch(`${base}/api/limited/${algo}?key=${encodeURIComponent(key)}`)
      .then((res) => { res.body?.cancel(); const s = stats[algo][sec]; if (res.status === 200) s.ok++; else if (res.status === 429) s.limited++; else s.other++; })
      .catch(() => { stats[algo][sec].other++; }));
  }
}
await Promise.all(inflight);

console.log(`\n${rps} req/s for ${seconds}s against ${base}, key=${key}\n`);
for (const algo of algos) {
  const line = stats[algo].map((s) => `${String(s.ok).padStart(3)}/${String(s.limited).padEnd(3)}`).join(' | ');
  const tot = stats[algo].reduce((t, s) => ({ ok: t.ok + s.ok, limited: t.limited + s.limited }), { ok: 0, limited: 0 });
  console.log(`${algo.padEnd(15)} ${line}   total ${tot.ok} ok / ${tot.limited} limited`);
}
console.log('\n(each cell: 200s / 429s in that second)');
