# Seed Sequencer: grow a song

A garden where every plant is a loop. Plant seeds on an 8x8 plot, prune each plant's 16 leaves (each leaf is a note, its length is the pitch), and the garden plays as a song. Every note snaps to a pentatonic scale, so nothing sounds wrong. Press **Share link** and the whole garden goes into the URL; whoever opens it gets an editable copy to remix.

![Screenshot placeholder](docs/screenshot.webp)

## Stack

Vue 3 (Composition API, `<script setup>`) + Pinia, Web Audio API (oscillators, envelopes, FM bell, convolver reverb with a generated impulse, no samples), SVG, Vite. Vitest for the core logic. No backend.

## Run

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # unit tests
npm run coverage   # coverage for src/state, src/music, src/audio/scheduler.js
npm run build      # dist/, works from any sub-path (base: './')
```

## Architecture

```
 UI (Vue SFCs)                     Pinia store (stores/garden.js)
 TransportBar  SoilGrid  PlantEditor ──actions──▶ history.execute(garden, command)
        ▲                                   │            │
        │ playhead (rAF)                    │            └─ state/commands.js  (do/undo pairs)
        │                                   ▼
 usePlayback ── engine.js ── scheduler.js (look-ahead, audio clock)
                    │
                    └─ voices.js: voice ─▶ column panner ─▶ bus ─▶ dry + convolver ─▶ master ─▶ compressor

 state/serialize.js: Garden ⇄ bytes ⇄ base64url  (#g=… share links, localStorage autosave)
```

- `src/audio/scheduler.js`: a 25 ms timer schedules every step that falls inside the next 120 ms of `AudioContext.currentTime`. Notes land on the sample-accurate audio timeline, so timer jitter never reaches the audio. When the tab is hidden, timers get throttled to about 1 s, so look-ahead widens to 1.5 s. If the timer starves anyway, missed steps are skipped instead of firing all at once.
- Visuals follow the audio clock: the scheduler keeps a queue of `{ step, time }`, and a `requestAnimationFrame` loop drains whatever has become audible. Plants sway only when their note actually sounds.
- `src/state/serialize.js`: a 6-byte header plus 10 bytes per plant (position nibble pair, type, 16 steps as 4-bit nibbles). A full 16-plant garden is about 222 URL characters. Decoding validates every field and rejects bad links rather than half-loading them.
- `src/state/history.js` + `commands.js`: a command stack of `do`/`undo` pairs. Consecutive edits to the same field inside 800 ms merge, so dragging the tempo slider is one undo step.

## Design decisions

- **Commands, not snapshots, for undo.** Step edits store two numbers, not a copy of the garden. Whole-garden operations (randomize, clear, open a shared link) use a snapshot command, so they're undoable too.
- **Typed arrays in reactive state.** Vue doesn't track `Uint8Array` indices, so step commands swap in a new array. That keeps the compact data model and still triggers renders. A unit test locks this in.
- **No router, no backend.** The URL hash *is* the document. It gets stripped after loading, so a refresh shows your autosaved edits instead of the original link.
- **Accessibility.** The soil is a roving-tabindex `role="grid"` (arrows, Home/End, Enter plants or edits, Delete removes). The step editor is a 7x16 grid of `aria-pressed` toggle buttons split into two bars so it fits at 360 px. A polite live region announces actions. Under `prefers-reduced-motion`, plant motion stops and audio keeps playing.
- **Plant cap of 16.** This keeps the share URL short and the voice count manageable on low-end phones.

## Adapter note

Unlike the other projects there's no `api` module: the plan scopes the backend (a "garden gallery") out of the MVP, and the share link replaces it. `VITE_API_URL` has no effect here.

## What I'd do next

- Optional Node "garden gallery" (publish a garden, browse popular remixes) behind the same adapter pattern as the other projects.
- Per-plant volume and octave, plus swing.
- Export to WAV via `OfflineAudioContext`, and a canvas share card.
- An AudioWorklet clock for even tighter timing on low-end devices.
