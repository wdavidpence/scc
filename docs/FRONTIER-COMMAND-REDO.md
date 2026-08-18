# SCC Frontier Command — Master Redo Program

Status: executable program, 2026-08-17
Current checkpoint: v2.9.0 (`fd6c7d5`)
This document supersedes `AAA-ROADMAP.md`, `TRIPLE-A-PLAN.md`, and `STARCRAFT-COMPETITOR-ROADMAP.md` as the active execution contract.

## Executive position

SCC is an original, mobile-first frontier command RTS. It competes for the same player attention as classic 1998-era RTS games by matching their **command feel, counterplay, and readable combat**, then dressing that loop in **modern presentation and sound**.

It is **not** a StarCraft remake, clone, or equivalence project. Names, silhouettes, lore, audio, maps, and UI currently still lean on recognizable franchise vocabulary; those are a **legal/creative debt** to retire, not a feature to deepen. Quality target: comparable strategic depth and production coherence. Never claim literal AAA budget, cabinet/franchise indistinguishability, or protected-expression parity.

One-sentence promise:

> Short, readable operations where three original civilizations fight over a shifting frontier, and every tap feels like a real command.

## What stays vs what gets redone

Keep (do not throw away the working game):

- Phaser 3.90 + Vite browser runtime
- Three-faction skirmish, economy, workers, gas, construction, queues, combat, AI waves
- Touch HUD, camera pan, pinch zoom, pause, minimap
- Existing QA/smoke gates and sequential verified releases
- `GameScene.js` as a living battle scene until Phase 7 extracts simulation

Redo (this program):

- Command contract so the game plays like an RTS, not a tap-to-deselect prototype
- Presentation grammar: terrain, silhouettes, animation, combat readability
- Audio identity: UI, combat, music, safe teardown
- Strategic depth: fog, pathing, expansions, real counters
- Original universe identity (names, art, lore, audio)
- Authored campaign, save/replay, then co-op

A from-scratch rewrite is rejected. The working loop is the asset. We replace the prototype seams one verified slice at a time until the product is a different class of game.

## Product pillars

1. **Instant command feel** — select, move, attack, build, train, and rally all confirm in under one frame with visible + audible feedback.
2. **Readable war** — every unit, hit, objective, and threat is obvious on desktop and 390px portrait.
3. **Asymmetric civilizations** — economy, production, movement, and recovery differ; colors are not enough.
4. **Authored operations** — missions teach one idea, then combine ideas.
5. **Trustworthy simulation** — same seed + command stream = same result.

## Current verified baseline (repo facts)

- Stack: Phaser 3.90, Vite, ES modules. Entry: `src/main.js`. Battle: `src/scenes/GameScene.js` (~3665 lines). HUD: `HudScene.js` (~1109). Menu: `TitleScene.js` (scene key `MenuScene`).
- Playable now: three races, minerals/gas, workers, construction, production queues, combat, AI waves, minimap, pause, pan, pinch zoom, touch HUD.
- Visual debt already paid through v2.9.0: HUD stacking, zone dividers, lane chevrons, resource labels, minimap anchors, command beacon, unit role rings.
- Audio exists as two procedural systems (`audioManager.js`, `audio/audioSystem.js`) — arcade beeps, not a modern mix. Phaser WebAudio is disabled (`audio.disableWebAudio: true`); custom Web Audio still works after a user gesture.
- Command hole: `selectedEntity` is singular. Empty-ground tap in default `select` mode **clears selection** instead of issuing a move. Enemy tap **selects the enemy** instead of attacking. Move/Attack require an extra HUD mode tap. No box-select, control groups, rally, or command queue.
- Maps exist as gas/slot data (`baseline`, `chokepoint`, `flank`, `island`) without authored terrain topology or fog.
- Faction/unit names still use protected franchise vocabulary.
- Passing structural QA is not proof of fun, balance, or campaign quality.

## Benchmark qualities (not a copy list)

These are the qualities to match with original expression:

- Command responsiveness: ground click/tap with a unit selected is a move; enemy click/tap is an attack; selection survives the order.
- Unit readability at top-down scale: silhouette first, color second, animation third.
- Layered ground, not a flat grid.
- Audio as identity: every select/confirm/alert/combat event has a distinct cue; music follows calm vs fight.
- Tight core loop: workers → resources → expand → tech → supply → counters → destroy the enemy base.

External store/marketing copy is corroboration only, never undocumented mechanics.

## Architecture prerequisites (before scale)

Do these before multiplayer, live service, or a content explosion:

1. Keep renderer (Phaser display/input/camera) separate from simulation state.
2. Fixed-step clock + seeded randomness.
3. Command/event log: select, move, attack, build, train, research, ability, rally.
4. Versioned save schema.
5. Extract economy/combat/AI out of `GameScene.js` incrementally (Phase 7). Never rewrite the 3665-line file in one pass.

## Legal / creative boundary (hard)

- Original names, factions, unit silhouettes, maps, audio, lore, and UI chrome before any commercial positioning.
- Comparable depth is valid. Copying protected expression is not.
- Reports must never claim SCC is indistinguishable from StarCraft or any other commercial RTS.

## Phased roadmap

Each phase is a set of bounded player-visible slices. A phase is done only when its exit criteria pass the gates below. Do not skip to campaign or multiplayer because a HUD looks richer.

### Phase A — Command feel (playability first)

Goal: the game obeys classic RTS input grammar on desktop and touch.

Slices:

- A1. Direct command contract: selected player unit + empty ground = move (keep selection); selected combat unit + enemy = attack that target.
- A2. Multi-select + drag box for player combat units; shared move/attack.
- A3. Control groups 1–4 (desktop) + HUD recall chips (touch).
- A4. Rally point on production structures; trained units walk there.
- A5. Command queue (shift/second-tap append) so rapid orders are not dropped.
- A6. Worker saturation + auto-return-to-resource after build.

Exit: a player can select → move → attack → train → rally without HUD mode gymnastics; portrait 390×844 remains usable; zero delayed JS errors.

### Phase B — Modern presentation grammar

Goal: a coherent visual identity that later slices can inherit.

Slices:

- B1. Faction terrain materials (layered tile + shading + overlay) from data, not scattered scene code.
- B2. Structure silhouettes by role (base, economy, military, tech, defense).
- B3. Unit silhouettes readable by shape at battlefield zoom.
- B4. 2–3 animation variants per idle/move/attack so armies do not lockstep.
- B5. Combat readability: thicker HP, hit flash, directional tracers, death dissolve, create-once lifecycle.
- B6. Persistent fog presentation once Phase C vision exists.

Exit: three factions are distinguishable without reading labels; combat is legible without a legend.

### Phase C — Sound identity

Goal: modern mix, original cues, safe teardown.

Slices:

- C1. One audio manager (channels, ducking, mute, volume, teardown). Retire dual-system drift.
- C2. UI set: select, confirm, error, train complete, build complete, wave warn.
- C3. Combat set: weapon families, hit, death, structure damage.
- C4. Music beds: calm / alert / victory / defeat with crossfade.
- C5. Enable Phaser WebAudio only if custom manager remains the authority and CI probes stay safe.

Exit: every core action has a distinct cue; restart/shutdown leaves no hanging nodes or doubled playback.

### Phase D — Strategic depth

Goal: real RTS decisions.

Slices:

- D1. Fog of war + vision radius + shared team vision.
- D2. Pathfinding that respects chokes; no stacking blobs.
- D3. Expansion node + second base as a real choice.
- D4. Terrain advantage or an original equivalent.
- D5. Detection / cloaked-or-burrow equivalent that is original, not a copy.
- D6. AI that scouts, composes, expands, retreats, and recovers (not only wave timers).

Exit: expand-vs-attack is a real decision; fog makes scouting matter.

### Phase E — Original civilizations

Goal: retire franchise vocabulary and make factions mechanically different.

Slices:

- E1. Universe bible + rename table (internal IDs can stay until a compatibility pass).
- E2–E4. One faction at a time: unique gather, supply, production, recovery rule.
- E5. Six to eight units and five to seven structures per faction, each with a role and a counter.
- E6. Three viable openings per faction in internal tests.

Exit: a player can describe each civilization without using another game’s names.

### Phase F — Campaign and mastery

- F1. First authored 15–20 minute operation that teaches selection, economy, and one faction mechanic.
- F2. Six to eight missions, briefings, optional objectives.
- F3. Versioned save/load.
- F4. Replay from seed + command stream.
- F5. Twelve to twenty missions and four to six skirmish maps.

### Phase G — Simulation extraction (enabler, parallel after A1)

Extract economy, orders, combat resolution, and AI into renderer-independent modules. Phaser keeps display, input adapters, and camera. Add debug overlay: FPS, entity count, sim time, seed, command latency.

### Phase H — Co-op after determinism

Two-player shared operation, pings, reconnect. Ranked PvP only after replays are trustworthy.

## First twenty executable slices

| # | Slice | Phase | Worker | Why it ships next |
|---|-------|-------|--------|-------------------|
| 1 | Direct command contract | A | Agy | Biggest playability hole in current `handleTap` |
| 2 | Enemy-tap attack + keep selection | A | Agy | Completes the RTS click grammar |
| 3 | Multi-select + drag box | A | Agy/Luna | Armies, not one marine |
| 4 | Rally point | A | Agy | Production becomes a decision |
| 5 | Control groups 1–4 + HUD chips | A | Agy | Mastery input |
| 6 | Worker saturation readout | A | Qwen/Agy | Economy readability |
| 7 | Layered faction terrain | B | Agy | Stops the flat-grid look |
| 8 | Structure silhouette pass | B | Agy | Role at a glance |
| 9 | Combat tracers + hit flash | B | Agy | Fight readability |
| 10 | Unified audio manager | C | Luna | Stops dual-system drift |
| 11 | UI + combat cue set | C | Agy | Modern sound |
| 12 | Calm/alert music beds | C | Agy | Emotional pacing |
| 13 | Fog of war | D | Luna | Real RTS |
| 14 | Pathfinding / no-stack | D | Luna | Army control |
| 15 | Expansion choice | D | Agy | Macro |
| 16 | AI scout/compose/retreat | D | Luna | Opponent, not a timer |
| 17 | Original rename + bible | E | Luna | Legal/creative |
| 18 | First faction uniqueness rule | E | Luna | Asymmetry |
| 19 | First authored operation | F | Luna | Player journey |
| 20 | Sim/render split start | G | Luna | Makes 21–N safe |

Slices 1–2 may land as one release if the focused diff stays coherent and both behaviors are live-probed.

## Quality gates (every release)

Code:

- `npm run build`
- `git diff --check`
- No per-frame display-object allocation
- New Phaser objects have create → update → destroy
- Focused diff only; no `GameScene.js` rewrite

Automated:

- `bash scripts/qa/run-qa.sh`
- `bash scripts/qa/smoke-test.sh`

Live browser (one context for navigate, click, resize, screenshot, console):

- Fresh MenuScene → real **Deploy** click → BattleScene + HudScene
- Exercise the slice (for A1: select player unit, tap empty ground, unit moves, selection remains)
- Delayed pageerror / unhandledrejection = 0
- Portrait 390×844: no horizontal overflow, HUD usable
- Do not use `window.Phaser.GAMES`; use `window.__SCC_GAME__`

Publish:

- Visible version marker in TitleScene (`v2.9.0` → next patch)
- Stage only intended game files
- Push `main`, wait for Pages `built`, curl cache-busted title, then live probe
- Never publish unverified transient VFX

## Worker contract (PenceSWE 1.2)

- Hermes/Grok front door does **not** write `src/` game code.
- Agy implements bounded slices in `/tmp/scc-vN` worktrees. Prompt must name `Do not edit /Users/davidpence/scc`.
- Luna handles multi-file / architecture / fog / AI / rename.
- Qwen 3.6-35B: one 5–15 line insert only, copy-complete JS.
- After every worker exit: `git status` on **both** the worktree and the shared checkout.
- Worker summaries are not evidence. Hermes judges diffs, runs gates, and publishes.

## Success metrics

- New player understands the objective within 60 seconds.
- Select → move works without opening the HUD command row.
- First authored operation completable in 15–25 minutes (Phase F).
- Three viable openings per faction (Phase E).
- 60 FPS desktop / 30 FPS supported mobile in ordinary battles.
- No delayed runtime errors after start, combat, resize, restart.

## Risks and evidence limits

- `GameScene.js` monolith: every slice must be surgical or the file becomes unreviewable.
- Franchise names/art: visual polish that deepens those silhouettes increases legal risk; Phase E is not optional.
- Dual audio systems + `disableWebAudio: true`: sound work can fail silently in CI; probe after a real user gesture.
- Maps are slot data, not topology: “island” does not currently require air/naval.
- A passing 189-check QA suite does not prove fun.

## Progress

- Implemented: A1 command contract (v2.10.0/v2.11.0) + A2 multi-select/drag box (v2.13.0).
- Locally verified: A2 mouse box selected 2 soldiers, Squad (2), shared move 665→809 / 690→808, shared attack target kept 2; start path 0 pageerrors.
- Remotely verified: pending Pages after this commit.
- Next slice: A4 rally point (A3 control groups after if input allows).

Do not mark a phase complete because this file exists.
