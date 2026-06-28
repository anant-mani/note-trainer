# Note Trainer

A mobile-first browser app for practicing music note reading. Look at a note on a treble or bass clef staff, tap the matching key on an on-screen piano, get instant feedback.

**Live app:** https://note-trainer.pages.dev

## What it does (Stage 1)

- Treble clef, Bass clef, or Mix (random per question) — pick a mode, it's remembered separately per mode.
- A note appears on the staff. All 7 letter names (A–G) are shown as a small diagonal "ladder" overlaid directly on the staff, so you can see how note position maps to letter name while you're learning.
- Tap the matching key on a one-octave piano keyboard (C–B, black keys shown for visual realism but inactive until sharps/flats are introduced in a later stage).
- 5-second timer per question. Answer (or don't) and the correct letter flashes on the staff.
- A "session" is 10 questions, ending in a summary screen: score, accuracy, average answer time, and a comparison against your last session **in that same mode**.
- Stats (sessions played, accuracy) are tracked separately for Treble / Bass / Mix and saved in the browser's `localStorage`, so they persist between visits on the same device.

Stage 2 (extra ledger lines) and Stage 3 (sharps/flats) are planned but not built yet.

## Tech stack

Plain HTML/CSS/JavaScript — no build step, no framework, no backend.

- [VexFlow](https://www.vexflow.com/) (loaded from a CDN) draws the musical staff, clef, and notes.
- All game logic lives in one IIFE in `app.js` — no modules/bundler involved.
- Cloudflare Web Analytics (a `<script>` snippet in `index.html`) for a basic visit counter.

## File structure

```
index.html   — page structure: header/stats, mode buttons, staff container,
               timer bar, piano keyboard, session-summary overlay, footer buttons
style.css    — all visual styling, mobile-first
app.js       — all behavior (see "Code walkthrough" below)
```

There's no build process. Editing any of these three files and reloading the page is the entire dev loop.

## Code walkthrough (`app.js`)

The whole file is one big `(function () { ... })()` — everything is a local variable/function inside it, nothing leaks to `window`. Roughly top to bottom:

| Section | What it does |
|---|---|
| Constants (`TIMER_SECONDS`, `SESSION_LENGTH`, `TREBLE_LINE_MAP`, `BASS_LINE_MAP`, ...) | Fixed config and the note→staff-position lookup tables used for drawing the letter ladder. |
| `loadStats` / `saveStats` / `emptyModeStats` | Reads/writes the per-mode stats object (`{ treble: {...}, bass: {...}, mix: {...} }`) to `localStorage`. |
| `renderStats` | Updates the "Sessions" / "Accuracy" text in the header for whichever mode is currently selected. |
| `buildKeyboard` | Generates the on-screen piano (white + black keys) once at load. |
| `pickClefMode` | Handles tapping Treble/Bass/Mix — if a session is running, it restarts a fresh one in the new mode (so stats never get attributed to the wrong mode). |
| `drawNote` / `drawNoteLadder` / `drawLadderGroup` | All the VexFlow rendering: staff, clef, the note itself (or no note, for the idle screen), and the diagonal letter-ladder overlay. |
| `highlightLadder` | Lights up the correct letter on the staff after you answer (green/red/amber). |
| `rollClef` / `nextFromBag` / `shuffle` | The "shuffle bag" randomizer — guarantees even coverage of all notes/clefs and no back-to-back repeats, instead of plain `Math.random()` picking (which clusters more than feels fair). |
| `pickQuestion` / `startTimer` / `tick` / `handleAnswer` / `handleTimeout` | The core question loop: show a note, run the countdown, score the answer, move on. |
| `nextRound` / `beginQuestion` / `finishSession` | Session lifecycle: advance to the next question, or end the session and show the summary screen. |
| `start` / `togglePause` / `goHome` | Top-level controls: begin a session, pause/resume, return to the idle screen. |

## Running it locally

No install step needed. Either:

```bash
# from inside the note-trainer folder
python3 -m http.server 8000
# then open http://localhost:8000
```

or just double-click `index.html` to open it directly in a browser.

## Deployment

This repo is connected to **Cloudflare Pages**. Pushing to `main` on GitHub auto-deploys to https://note-trainer.pages.dev within seconds — no manual build or deploy command needed.

Recommended workflow for any change:

```bash
git checkout -b my-change
# edit files
git add -A && git commit -m "describe the change"
git push -u origin my-change
```

Pushing a branch gives it its own preview URL automatically: `https://my-change.note-trainer.pages.dev`. Check the change there first. Once it looks right:

```bash
git checkout main
git merge my-change
git push
```

That's what actually goes live on the production URL.
