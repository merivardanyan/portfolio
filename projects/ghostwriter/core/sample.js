import { mulberry32 } from './random.js';

const SCRIPT = [
  ['type', 'Hey Sam,'],
  ['pause', 1400],
  ['type', '\n\nI owe you an apology for yesterday. I was '],
  ['pause', 900],
  ['type', 'compeltely'],
  ['back', 7],
  ['type', 'pletely out of line'],
  ['pause', 2200],
  ['type', ' and '],
  ['type', 'I know it'],
  ['pause', 1600],
  ['back', 9],
  ['type', "there's no excuse for it."],
  ['pause', 2600],
  ['type', '\n\nCan I make it up to you? Dinner is on me, '],
  ['type', 'anywhere you want'],
  ['pause', 1200],
  ['back', 17],
  ['type', 'anywhere except that sushi place'],
  ['pause', 700],
  ['type', ' :)'],
  ['pause', 1800],
  ['type', '\n\nSorry, sorry, sorry.\nAlex'],
];

export function makeSample(seed = 7) {
  const rand = mulberry32(seed);
  const events = [];
  let t = 0;
  let pos = 0;
  for (const [op, arg] of SCRIPT) {
    if (op === 'pause') {
      t += arg;
    } else if (op === 'type') {
      for (const ch of arg) {
        t += Math.round(55 + rand() * 120 + (ch === ' ' ? 40 : 0));
        events.push({ t, type: 'insert', pos, text: ch });
        pos += ch.length;
      }
    } else if (op === 'back') {
      for (let i = 0; i < arg; i++) {
        t += Math.round(45 + rand() * 50);
        pos -= 1;
        events.push({ t, type: 'delete', pos, len: 1 });
      }
    }
  }
  return {
    v: 1,
    title: 'An apology, unedited',
    createdAt: Date.UTC(2026, 10, 1),
    reveal: false,
    events,
  };
}
