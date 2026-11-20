# Ghostwriter

Write something, then share a link that plays it back keystroke by keystroke, typos and hesitations included. A finished message hides how it was written; the replay shows the deleted first draft, the long pause before "sorry", the word you retyped three times. There is no signup and no server: the entire recording is compressed into the link's `#hash`, so the text never leaves the sender's and recipient's browsers.

![Ghostwriter screenshot](./docs/screenshot.png)

**Stack:** React 18, Vite, `useReducer` + custom hooks (no state library), Vitest. No backend, on purpose.

## Try it

- Live demo: `demos/ghostwriter/` on the portfolio site
- Example replay: open the demo with `#example`

## Architecture

```
 textarea ──input/composition events──► useRecorder ──diffEdit(prev, next, caret)──► Event[]
                                                                                      │
                                       ┌──────────────────────────────────────────────┘
                                       ▼
 core/codec.js   encodeBinary ─► deflate-raw (CompressionStream) ─► base64url ─► #r=<payload>
                                                                                      │
 shared link ◄────────────────────────────────────────────────────────────────────────┘
      │
      ▼
 decode ─► Event[] ─► buildSnapshots (every 200 events)
                          │
 usePlayback (rAF clock) ─► stateAt(events, t, snapshots) ─► { text, caret }  ─► Player
                          │      binary search + replay ≤ 199 events
                          └► computeStats, activityBuckets ─► StatsPanel, Timeline sparkline
```

| Module | Responsibility |
|---|---|
| `core/diff.js` | Turns "value before / value after / caret" into a single `{pos, removed, inserted}` edit. The caret disambiguates edits inside repeated runs (`aa` → `aaa`), and surrogate pairs are never split. |
| `core/codec.js` | Binary format + compression + base64url. Validates every event on decode and enforces hard limits while reading (20,000 edits, 100,000 characters of text, 24 hours, 1 MB inflated), so a crafted link fails fast instead of freezing the tab. Throws `CodecError` on damaged links. |
| `core/engine.js` | Event sourcing: the document is a fold over the event log. Snapshots make seeking O(log n + 200). Also pause compression and activity buckets. |
| `core/stats.js` | WPM, deletions, longest pause, most rewritten word. |
| `src/api/` | `localAdapter` (hash links + localStorage drafts). Errors are `ApiError(status, code, message)`, the same type the other projects use. |

### Wire format (v1)

```
'z' | base64url( deflate-raw(
  0x47 'G', version, flags(title, reveal), createdAt(uvarint seconds), [title],
  eventCount,
  per event: uvarint(Δt in 10 ms units), svarint(Δpos * 4 + kind), [uvarint len],
  utf8(all inserted text, concatenated)
))
```

`kind` is insert-one-char, insert-n, delete-one-char or delete-n, so a normal keystroke costs ~3 bytes before compression. Positions are deltas from where the caret would be after the previous edit, so ordinary typing has a delta of 0. Inserted text is stored as one column at the end, which deflate compresses far better than interleaved text. The 45-second example message (276 edits, 33 of them deletions) fits in about 670 URL characters.

### API module

The other portfolio projects choose between a `localAdapter` and an `httpAdapter` at build time. Ghostwriter has only the local one, on purpose: the link *is* the storage. `src/api/index.js` still exports the same shape (`api` plus `ApiError`), so components never touch the codec or localStorage directly, and a damaged link surfaces as `ApiError(400, 'invalid_replay', …)`.

- `createLink(replay)` → `{ hash: '#r=…', bytes }`
- `resolve(hash)` → the replay, `null` if the hash holds no replay, or throws `ApiError`
- `saveDraft` / `loadDraft` / `clearDraft` → localStorage

## Run locally

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # codec (incl. bomb + fuzz tests), diff, engine, stats, adapter
npm run build      # dist/, works from any sub-path (base: './')
```

## Design decisions

- **No backend.** The link is the product. Keeping the replay in the URL fragment means the content is never sent to any server (fragments aren't part of HTTP requests), there is nothing to moderate or breach, and it costs nothing to host.
- **Record diffs, not keys.** Listening to `keydown` misses paste, autocorrect, drag-and-drop, undo and IME. Diffing the textarea value on each `input` catches all of them. During IME composition, intermediate states are not recorded; the committed text is diffed on `compositionend`.
- **Snapshots computed at load, never stored.** They would multiply the payload size. Rebuilding them is one linear pass, and every seek after that replays at most 199 events.
- **10 ms timestamp resolution.** The display runs at 60 fps (16 ms per frame), so finer timing isn't visible. The coarser unit lets most gaps between keystrokes fit in a single byte.
- **Accessible playback.** Space and the arrow keys work anywhere on the page, the scrubber is a native `<input type="range">` with `aria-valuetext`, and a polite live region announces play, pause, speed and finish, not every character.

## What I'd do next

- Export a replay as a GIF or MP4 (OffscreenCanvas + WebCodecs)
- Selection-aware recording to show text being highlighted before it's replaced
- Optional end-to-end encrypted short links for replays over 8 KB
- "Diff view" that shows every deleted passage struck through
- Per-word heatmap of where the writer hesitated
