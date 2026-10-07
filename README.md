# Marshlight

A pocket tactics game for one night. You are a will-o'-the-wisp. You cannot attack. The hunters can.

**Play:** https://chrdamico.github.io/marshlight/

Hunters show where they will strike after your move. Each turn you **drift** one cell, or **swap** places with the first thing in any of the 8 straight lines. A swapped hunter keeps aiming the same way, so the others hit him, or he hits them. A swap uses your **breath**; sink a hunter with it and you keep it. You float over the bog; they sink in it. Survive nine hours, from 9 PM until dawn.

Turn-based, no timers, works offline. Made for long flights.

## Content

- **A night:** nine hours on generated marsh boards. Seven kinds of hunters join as the night goes on. After each hour, pick one of three gifts (an extra heart, deeper lungs, a lure, a gust of wind, a mist veil, …). Win at dawn to light a brighter moon: five difficulty levels.
- **Tonight's hunt:** the same night for everyone, once a day. First result counts. Share text included.
- **Trials:** 70 puzzles in 8 chapters. Clear the board in N turns without a hit. Every trial is checked by the solver; most have exactly one solution. The first chapter teaches the game.
- Tap once to preview a move (skulls show who falls), tap again to confirm. Bumpy-flight friendly. Keyboard works too.

## Rules in detail

- All attacks land at the same time, after your move.
- You drift up, down, left or right. Swaps go along all 8 lines.
- A swap uses your breath. A turn without a swap gives it back. If the swap sinks a hunter in the bog, you keep it and can swap again at once.
- Hunters hunt as a pack. The first one aims at you; the others guard the cells you could drift to.
- If no hunter falls for five turns, they call for help. A lantern at the edge shows where the next one steps out of the dark, one turn ahead.
- Peasant: strikes one cell. Hunter: bolt along a line, hits the first thing. Hound: runs two cells, charges until it hits something (into bog it sinks). Alchemist: flask onto empty ground next to you, bursts in a plus. Knight: two hearts, swings at three cells. Priest: light along a whole line, through everyone. Witch: flies over bog, strikes diagonally.
- Ranged hunters rest one turn after they attack.
- Marsh gas bursts when hit and hurts all 8 cells around it.
- When one hunter is left, he runs away and the hour ends.

## Design notes

- One verb. The swap is your only weapon, and it is also your best escape. Every hunter who lines up to hit you also lines up to be swapped.
- The pack makes every hunter matter. When all of them aimed at your cell, one drift dodged everything, and only the alchemist was a threat. Now the red cells form a net around you: find the gap, or swap out, and then you are out of breath.
- No unavoidable traps. The alchemist used to throw onto your cell, so his plus covered every cell you could drift to. Now his flask lands on empty ground: it covers your cell and one way out, never all of them.
- The bog feeds the wisp. A swap that sinks a hunter keeps your breath, so the bog is both your weapon and your rhythm.
- No waiting game. Dodging forever brings more hunters; each kill resets the count.
- No gift decides a night. Movement is the same for everyone (diagonal drift made every hit avoidable, so it is gone). In bot tests every gift raises the win rate by a similar amount.
- Full information. Attacks are shown before you move and land at the same time, so every hit you take is a mistake you can see. The preview shows the exact result of a move.
- The hunters are not stupid: they avoid crossfire, avoid standing in each other's attacks, and never step into the bog. Friendly fire has to be earned.
- Balance comes from simulation. A bot with a two-move search plays hundreds of nights per change (`npm run sim`). It wins about 98% of New Moon nights, 93% under the Gibbous moon and about 73% under the Full Moon. A one-move bot, closer to a hasty player, wins about two thirds of New Moon nights and one in ten under the Full Moon. People play less exhaustively, so expect the first dawn to take a few nights.

## Develop

```bash
npm run serve        # http://localhost:8080
npm test             # rules, preview accuracy, trial solutions, whole bot nights
npm run sim -- 60 2 1   # bot plays 60 nights, 2-ply search, moon 1: win rate per hour
npm run trials       # regenerate public/js/trials-data.js (needs ~1 min, uses all cores)
npm run icons        # regenerate icons (Python + Pillow)
```

No build step. `public/` is the whole site.

- `public/js/engine.js` — rules, enemy AI, previews.
- `public/js/gen.js` — night boards. `run.js` — hours, gifts, moons, score.
- `public/js/solver.js` — exact search, used for trials and hints.
- `public/js/render.js` — canvas board, lighting, animations. `sprites.js` — pixel art.
- `tools/gen-trials.mjs` — makes random boards, keeps the ones with few solutions.

## Deploy

Static hosting of `public/`. `.github/workflows/pages.yml` runs the tests, stamps the service worker and `js/version.js` with the commit date and SHA (so installed apps update, and Settings shows the running version) and publishes to GitHub Pages.

## Install on a phone

Open the site. Android/Chrome: **Install for offline play** on the home screen (or browser menu → Install app). iPhone/Safari: Share → Add to Home Screen.

Fonts: Nunito and IM Fell English, both SIL Open Font License.
