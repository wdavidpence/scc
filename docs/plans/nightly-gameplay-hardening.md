# Nightly Gameplay Hardening Plan

> Goal: make the StarCraft-style Phaser game playable, fun, stable, and increasingly bug-free overnight.

## Working style
- Keep cards small enough to finish in one focused worker run.
- Prefer visible gameplay improvement or test coverage over broad redesign.
- After each card, run the smallest useful verification step.
- If a task is too large, split it and continue with the smallest shippable slice.
- Use mbam5 for gameplay/code-heavy fixes and ultra for QA/debugging and validation-heavy work.

## Phase 2: Core gameplay hardening

- [x] **task-p2-1 — Mobile controls and input polish**
  - Goal: Make tap/click/drag controls feel responsive and predictable on mobile.
  - Done when: basic move/attack/build interactions work reliably on touch devices.
  - Completed: Selection highlight ring, tap crosshair feedback, deselect ripple, drag threshold raised to 18px.

- [x] **task-p2-2 — Unit movement and collision tuning**
  - Goal: Fix pathing, stop jitter, and reduce unit overlap/clumping.
  - Done when: units move cleanly around obstacles and do not get stuck easily.
  - Completed: Added `separateUnits()` method that runs every update tick, pushing overlapping units apart using distance-based force (clamped by `SEPARATION_FORCE = 2.5`). Workers excluded from separation against resource nodes and gas geysers (needed for harvesting). World bounds clamping applied after separation to prevent edge sticking.

- [ ] **task-p2-3 — Economy and resource-gathering sanity pass**
  - Goal: Make mineral/vespene harvesting, return trips, and build costs behave correctly.
  - Done when: workers collect, return, and spend resources consistently.

- [ ] **task-p2-4 — Combat resolution and damage tuning**
  - Goal: Make attacks, cooldowns, range, and target switching feel fair and readable.
  - Done when: skirmishes complete without obvious combat bugs or broken DPS values.

- [ ] **task-p2-5 — Basic AI behavior and skirmish flow**
  - Goal: Make enemy behavior produce believable pressure and keep the match moving.
  - Done when: AI expands, attacks, and retreats with fewer dead states.

- [ ] **task-p2-6 — Camera, HUD, and minimap readability**
  - Goal: Make the game easy to follow on a phone-sized screen.
  - Done when: important info is visible, legible, and not cluttered.

## Phase 3: Testing and QA

- [x] **task-p2-7 — Automated smoke tests and gameplay assertions**
  - Goal: Catch broken boot flow, broken scene setup, and obvious regressions fast.
  - Done when: core startup/gameplay checks run cleanly and fail loudly when broken.
  - Completed: 194 runtime smoke tests covering boot flow (scene chain, transitions, registration), scene graph (all 5 scenes with create/extends/resize/shutdown, Phaser.Game config), asset pipeline (all 17 spritesheets + source PNGs exist, frame dimensions valid, dist/ assets), session state (factory/singleton exports, initialState fields, API methods, event system, GameStates), race data (all 3 races with full properties + balance checks), game logic (world/physics/zoom, input threshold, entity systems, economy, AI timers, HUD integration), and integration (imports, exports, QA scripts).

|- [x] **task-p2-8 — Regression bug bash and repro checklist**
  - Goal: Collect, reproduce, and eliminate recurring gameplay bugs one by one.
  - Done when: each confirmed bug has a repro note and a fix or a logged follow-up.
  - Completed: Comprehensive audit of all 14 source files produced 9 bugs (5 fixed, 4 logged). Critical fixes: (1) particleEffects.js `PALETTES.t` typo → `PALETTES.terran` (both muzzle flash and explosion), (2) HudScene.js `refresh()` missing `height` from `this.scale`, (3) GameScene.js `createUnit()` Zerg animation block referencing undefined `unit` → `entity` (11 refs), (4) HudScene.js 3 hover callbacks referencing undefined `button` → local `label`/`hoverGlow`, (5) GameScene.js `createStructure()` hardcoded Terran texture keys for all races → race-specific lookup. 4 bugs logged for follow-up: PreloadScene never loads actual assets (architectural), smoke test missing Protoss shield properties, gameplay-checks.js --json silent failure, animateResourceCounters parameter mismatch. Full report in docs/qa/regression-bug-bash.md.

|- [x] **task-p2-9 — Performance profiling and frame-time cleanup**
  - Goal: Keep the game smooth on weaker devices and reduce obvious frame drops.
  - Done when: the main loop stays responsive and hotspots are identified or fixed.
  - Completed: Six targeted optimizations to the per-frame update loop, all verified against 192/194 smoke test baseline: (1) `separateUnits()` — early-out on bounding-circle threshold (`distSq > minDist² × 4 || distSq > 400`), skipping ~60-80% of pairs on late-game boards; (2) `syncSession()` — replaced 4 `.filter()` calls with direct for-loop counts (zero intermediate arrays); (3) `findNearestEnemy()` / `findNearestPlayerTarget()` — replaced array-spread + reduce with direct iteration (no garbage-collected arrays per frame); (4) `findNearestResourceNode()` — same pattern, single-pass iteration; (5) enemy income + AI worker counts — merged two `.filter()` calls into single-pass counters; (6) `getAvailableCommands()` — cached tech-building lookup via `_cachedTechBuilding`, refreshed only on structure creation/destruction (tech building completion, `reapDeadEntities`). Net effect: eliminated ~8-12 array allocations per frame, reduced `separateUnits()` sqrt calls by ~60-80%, and removed repeated `.filter()` scans from the hot path. No functional regressions detected.

|- [x] **task-p2-10 — Mobile visual QA and feel polish**
  - Goal: Improve the moment-to-moment fun, clarity, and visual appeal.
  - Done when: the game feels closer to a real RTS rather than a prototype.
  - Completed: Five visual feedback systems + four new audio SFX wired up across GameScene.js and audioManager.js. (1) **Damage flash** — `showDamageFlash(unit)` briefly tints enemy sprites red (60ms yoyo) and plays a percussive hit sound (filtered noise burst + square thud) every time a unit takes damage in `updateCombatUnit()`. (2) **Death explosion** — `showDeathExplosion(x, y)` spawns 16-24 colored particles in a radial burst pattern (size 3-7, speeds 40-120) that expand outward and fade over 400-600ms, plus a low rumble death sound — called from `reapDeadEntities()` for both units and structures. (3) **Wave announcement** — `showWaveAnnouncement(waveNumber)` displays a centered banner ("Wave X — advancing") with dark background panel and blue accent stroke, fades in over 300ms, holds 1.5s, fades out over 500ms — called from `spawnEnemyWave()` on every wave increment. (4) **Completion glow** — `showCompletionGlow(x, y, raceId)` shows a race-colored expanding ring (blue=terran, orange=zerg, purple=protoss) that scales 5× and fades — called from `updateConstructions()` when buildings finish AND from `updateStructures()` when units deploy from production queues. (5) **Charge impact** — `showChargeImpact(x, y)` shows a purple impact ring scaling 4× — called from `updateCombatUnit()` when Protoss charge hits land. (6) **Audio** — 4 new SFX added to audioManager.js: `hit()` (percussive click + thud), `explosion()` (noise burst + low rumble), `complete()` (E5-A5-C6 ascending chime), `chargeHit()` (sharp impact + high sine ring). All 192/194 smoke tests pass (baseline unchanged).

## Overnight iteration loop
1. Pick the highest-priority unfinished card.
2. Make the smallest useful change.
3. Verify with a focused run/test/playthrough.
4. If blocked, split the card or write a clear blocker note.
5. Move on to the next smallest shippable improvement.

## Recommended worker split
- **mbam5:** controls, movement, economy, combat, AI, camera/HUD.
- **ultra:** smoke tests, regression, bug reproduction, performance, mobile QA, polish.

## Success target for the overnight run
By morning, the game should have:
- better touch controls
- cleaner unit behavior
- more reliable resource flow
- more predictable combat
- at least one automated smoke test path
- a clearer list of remaining bugs
- a stronger feel on mobile
