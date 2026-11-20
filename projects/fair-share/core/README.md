# Fair Share core

Pure, zero-dependency ES modules shared by the React client (optimistic updates, `localAdapter`) and the Node server (authoritative state). No DOM, no Node APIs (`newId` uses `globalThis.crypto`, available in browsers and Node 19+).

```js
import { computeSplit, applyOp, applyPatch, rebase, parseReceipt, parseMoney, formatMoney } from '../core/index.js';
```

Tests: `cd core && npm test` (node:test; 100% lines/functions via `npm run coverage`). Test files are `core/test/*.js` (not `*.test.js`) so Vitest in the app ignores them.

## Money rules

- Every amount is an **integer in the currency's minor unit** (`unitCents`, `taxCents`, ...). Cents for USD, yen for JPY (0 digits), fils for BHD (3 digits). Floats never touch money; products use `BigInt`.
- Percent tips are **basis points**: `1800` = 18%. Applied to the pre-tax subtotal, rounded half-up.
- Allocation uses **largest remainder** (Hamilton), so parts always sum to the total.

## `money.js`

| Export | Description |
|---|---|
| `MAX_CENTS` | `1_000_000_000` upper bound for any amount |
| `currencyDigits(code)` | Minor-unit digits from Intl (USD 2, JPY 0); 2 if unknown |
| `isCurrency(code)` | Uppercase ISO-4217 code known to `Intl.supportedValuesOf('currency')` |
| `isCents(v)` | Non-negative safe integer <= `MAX_CENTS` |
| `parseMoney(input, digits = 2) -> number \| null` | `'24'`, `'24.5'`, `'$1,234.56'`, `'1.234,56'`, `'12,50'` all work. Negative, ambiguous (`'12.345'` with 2 digits) or malformed input gives `null` |
| `formatMoney(cents, currency = 'USD', locale?)` | `Intl` display string |
| `centsToDecimal(cents, digits = 2)` | `'12.50'` for `<input>` values |
| `applyBasisPoints(amount, bp)` | `amount * bp / 10000`, half-up |
| `allocate(total, weights, tieOrder?) -> number[]` | Largest remainder. Throws `RangeError` on bad input or non-zero total over all-zero weights |
| `splitEvenly(total, n, offset = 0)` | Near-equal parts; `offset` rotates who gets the spare unit |

## `split.js`

`computeSplit(bill, claims = bill.claims) ->`

```js
{
  currency, subtotalCents, taxCents, tipCents, totalCents,
  people: [{ participantId, name, color, subtotalCents, taxCents, tipCents, totalCents,
             items: [{ itemId, name, shareCents, splitWays }] }],     // in participant join order
  unclaimed: { subtotalCents, taxCents, tipCents, totalCents, itemIds },
  allClaimed: boolean,                                                  // items exist and none unclaimed
}
```

- A shared item's line total (`unitCents * qty`) is split evenly among its claimers. The spare cent rotates per item (by item-id hash), so nobody always pays the extra penny.
- Tax and tip are allocated in proportion to each person's subtotal. **Unclaimed items get their own bucket**, so `sum(people.totalCents) + unclaimed.totalCents === totalCents` always (property-tested on 500 random bills).
- Claims for unknown participants or items are ignored. Duplicates collapse.
- Also exported: `lineCents(item)`, `billSubtotal(bill)`, `tipCents(bill)`.

## `bill.js` (state + ops reducer)

Bill state (this is also the HTTP/WS snapshot shape):

```js
{
  id: 'K7QM2XPA', title: 'Friday dinner', currency: 'USD',
  taxCents: 450, tip: { mode: 'percent', value: 1800 },   // or { mode: 'amount', value: 1000 }
  locked: false, version: 12,
  items: [{ id, name, unitCents, qty }],                  // ordered
  participants: [{ id, name, color: '#RRGGBB' }],         // join order
  claims: { [itemId]: [participantId, ...] },             // absent key = unclaimed
}
```

Ops (`applyOp(state, op, ctx)` returns a **new** state with `version + 1`, or throws `BillError { code, message }`):

| op | fields | who |
|---|---|---|
| `bill.set` | `title?`, `currency?`, `taxCents?`, `tip?` | host |
| `bill.lock` | `locked: boolean` | host (the only op allowed while locked) |
| `item.add` | `item: { id, name, unitCents, qty? }`, `index?` | host |
| `item.update` | `id`, `name?`, `unitCents?`, `qty?` | host |
| `item.remove` | `id` (also drops its claims) | host |
| `participant.join` | `participant: { id, name, color? }` | server |
| `claim` / `unclaim` | `itemId`, `participantId` | participant (self only) or host |

`ctx` is `{ role: 'host' | 'participant' | 'server', participantId? }`; default `server` (no permission checks). `claim`/`unclaim` are idempotent: a no-op returns the **same object** (no version bump).

Joining with a name that already exists in the bill (case-insensitive, NFC, trimmed) throws `duplicate_name`.

Error codes: `invalid_op`, `unknown_op`, `forbidden`, `bill_locked`, `invalid_<field>` (e.g. `invalid_name`, `invalid_tip`, `invalid_currency`, `invalid_qty`, `invalid_unitCents`), `item_not_found`, `participant_not_found`, `duplicate_item`, `duplicate_participant`, `duplicate_name`, `too_many_items` (200), `too_many_participants` (50), `invalid_index`, `invalid_ops`.

Other exports:

| Export | Description |
|---|---|
| `createBill({ id, title?, currency?, taxCents?, tip?, items? })` | Validated fresh state (version 0) |
| `applyOps(state, ops, ctx)` | Apply a list; all-or-nothing |
| `applyPatch(state, { version, op }) -> { state, status }` | Client reconciliation: `'applied'`, `'stale'` (already have it), `'gap'` (request a snapshot) |
| `rebase(confirmed, pending) -> { view, pending, rejected }` | Optimistic view = confirmed state + pending ops (`[{ op, ctx? }]`); ops that no longer apply are returned in `rejected` |
| `validateItem`, `validateParticipant`, `validateTip` | Field validators (throw `BillError`) |
| `newId(len = 12)` | Unbiased random URL-safe id |
| `BILL_ID_ALPHABET`, `BILL_ID_RE`, `newBillId()` | 8-char bill codes without look-alikes (no 0/O/1/I/L). The server and the local adapter should both use these |
| `nextColor(state)`, `PARTICIPANT_COLORS`, `LIMITS`, `HOST_OPS`, `PARTICIPANT_OPS`, `SERVER_OPS`, `BillError` | |

### Recommended client loop

```js
// confirmed = last server state; pending = [{ reqId, op }]
onUserTap(itemId)   -> pending.push({ reqId, op: { op: 'claim', itemId, participantId: me } }); send; view = rebase(confirmed, pending).view
onServer('patch')   -> const r = applyPatch(confirmed, msg); if (r.status === 'gap') send({ type: 'sync' }); else confirmed = r.state;
                       drop pending with msg.reqId; view = rebase(confirmed, pending).view
onServer('snapshot')-> confirmed = msg.bill; view = rebase(confirmed, pending).view
```

## `parse.js`

`parseReceipt(text, { digits = 2 }) -> { items: [{ name, unitCents, qty }], taxCents, tipCents, skipped }`

- One item per line: `[qty][x|×] name price`, e.g. `2 Margherita 24.00`, `3x Beer 13.00`, `Tiramisu 7.5`.
- The price is the **line total** (receipt convention): `2 Margherita 24.00` gives `unitCents: 1200, qty: 2`. If the total doesn't divide evenly by qty, it becomes `qty: 1` named `"3x Beer"` so no cent is invented or lost.
- `Tax/VAT/GST/HST` lines go to `taxCents`; `Tip/Gratuity/Service charge` to `tipCents` (null if absent).
- `Subtotal`, `Total`, card/cash lines, lines without a price, lines whose name is only a number and lines with quantity `0` (`0 Free thing 0`) are returned in `skipped`.
- Items have no `id`; assign one (`newId()`) before `item.add`, or send them to `POST /api/bills` which assigns ids.
