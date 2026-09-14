# REPOSITORY DIGEST: STARFRONT (SCC2)

## Repository Tree (Depth 3 with LOC)

```text
├── ARCHITECT_EXECUTION.md (19 LOC)
├── NOTICE-AI-ART.md (35 LOC)
├── README.md (104 LOC)
├── VISUAL_POLISH_20.md (55 LOC)
├── generate_protoss_animations.py (305 LOC)
├── index.html (38 LOC)
├── index2.html (25 LOC)
├── package.json (28 LOC)
├── vite.config.js (20 LOC)
├── vite2.config.js (11 LOC)
├── vite2.preview.config.js (10 LOC)
├── .gate-root/ (0 LOC) [scc -> dist]
├── ai_raw/ (0 LOC) [526 PNG, 93 prompt files]
├── assets/ (0 LOC) [106 PNG]
├── backups/ (97 LOC)
├── dist/ (1676 LOC) [bundle output]
├── docs/ (507 LOC)
├── public/ (27 LOC)
│   ├── assets/ (0 LOC)
│   ├── audio/ (0 LOC) [28 MP3]
│   ├── fonts/ (0 LOC) [3 TTF]
│   └── vo/ (0 LOC) [92 M4A]
├── qa-shots/ (0 LOC) [32 PNG]
├── research/ (168 LOC)
├── scripts/ (9247 LOC)
│   ├── qa/ (850 LOC)
│   ├── verify-*.cjs [37 test gates]
│   ├── probe-*.cjs [28 probe scripts]
│   └── *.sh, *.py [runners]
├── shots/ (0 LOC) [16 PNG]
├── src/ (9387 LOC) [legacy SCC1]
│   ├── assets/ (0 LOC)
│   ├── game/ (3476 LOC)
│   ├── scenes/ (5908 LOC)
│   └── main.js (3 LOC)
├── src2/ (13464 LOC) [active SCC2]
│   ├── createGame2.js (28 LOC)
│   ├── data/ (497 LOC)
│   ├── engine/ (5747 LOC)
│   ├── main2.js (10 LOC)
│   └── scenes/ (7182 LOC)
├── stage/ (0 LOC)
└── verify/ (0 LOC) [47 PNG]
```

## Engine / Dependencies / Platforms

- **Engine**: Phaser 3.90.0 (Canvas renderer, pixelArt: true, antialias: false, roundPixels: true, Scale.RESIZE).
- **Bundler**: Vite 8.0.16.
- **Dependencies**: phaser ^3.90.0, vite ^8.0.16; devDependencies: webpack-cli ^7.0.3.
- **Platforms**: Web / HTML5 Canvas (Desktop mouse/keyboard, Mobile touch with activePointers: 3).
- **Audio**: Phaser Web Audio disabled (disableWebAudio: true); handled via custom Web Audio synthesis and HTMLAudio buffers in audio2.js and cinematicAudio.js.

## Simulation Layer Signatures Only

```javascript
// src2/engine/entity.js
teamColorHex(team)
effectiveDamage(attacker, target)
Unit: constructor(world, team, kind, x, y), setPos(x, y), setOrder(order), issueMove(x, y, attackMove), issueAttack(target), issueAttackMove(x, y), issueHarvest(mineral), issueReturnCargo(depot), issueBuild(buildId, gx, gy), issuePatrol(tx, ty), issueHold(), issueStop(), takeDamage(amount, attacker), die(), update(dt), updateAutoAcquire(dt), repath(toX, toY), stepAlongPath(dt), stepAlongFlow(dt, field), face8(dx, dy), face(dx, dy), animate(dt), drawHp(), inWeaponRange(target)
Building: constructor(world, team, kind, x, y), update(dt), takeDamage(amount, attacker), die(), startTraining(unitKind), startResearch(techKey), cancelQueue(index), canProduce(kind), drawHp()

// src2/engine/pathfinding.js
NavGrid: constructor(w, h, tileSize), idx(tx, ty), inBounds(tx, ty), blockRect(id, x0, y0, x1, y1), unblockBy(id), walkable(tx, ty, clearance, ignoreId), findPath(startX, startY, goalX, goalY, clearance, ignoreId, maxNodes), hIdx(x, y), smooth(path, clearance, ignoreId), lineClear(x0, y0, x1, y1, clearance, ignoreId)

// src2/engine/flowfield.js
FlowField: constructor(nav, w, h), build(goalX, goalY, ignoreId, maxClearance), flowAt(x, y), distAt(x, y)
FlowManager: constructor(nav, w, h), getField(goalKey, goalX, goalY, clearance), ensure(goalKey, goalX, goalY, gameTime, interval, clearance), invalidateNear(x, y)
SpatialHash: constructor(cell), key(x, y), clear(), insert(unit), query(x, y, radius)

// src2/engine/triggers.js, commanders.js, coach.js, campaign.js
Triggers: constructor(defs), tick(dt, ctx), satisfied(trigger, ctx), fire(trigger, ctx)
pickCommander(race, difficulty)
Coach: constructor(battle), buildSteps(), buildSpot(), spawnDummy(), layout(), showStep(i), onDown(pointer), nudge(msg), allowHudBtn(btn), gateRight(worldPoint), tick(dt), teardown(), finish(success)
loadCampaign(), saveCampaign(campaign), buyUpgrade(campaign, id), applyUpgradesToPlayer(campaign, player, UNITS), missionFor(campaign)
```

## Tick Rate

- **Simulation Step**: Variable delta time tied to Phaser render loop in BattleScene.update(time, delta):
  `const dt = Math.min(0.05, delta / 1000) * this.timeScale;`
- **Nominal Rate**: ~60 Hz (browser requestAnimationFrame). Minimum step clamp: 20 Hz (dt <= 0.05s).
- **Throttled Sub-systems**: Spatial hash rebuilt every frame (~60 Hz); flowfield refresh at 0.5s intervals; skarn blight spread at 0.9s intervals; unit repath randomized between 0.0s–0.5s; hover tooltip probe at 12.5 Hz (80ms).

## Sim/Render Split

- **Split Present**: **NO**.
- **Evidence**:
  1. Unit and Building instantiate Phaser display GameObjects directly in constructors (world.add.container, world.add.image, world.tweens.add) in src2/engine/entity.js:47-55.
  2. Simulation state mutations trigger Phaser visuals, tweens, text, and particles inline during entity updates (src2/engine/entity.js:854-876).
  3. Main simulation tick for units, buildings, spatial hashing, and projectiles runs synchronously inside BattleScene.prototype.update(time, delta) (src2/scenes/BattleScene.js:3673-3820).
  4. No detached headless simulation or independent state container exists.

## Determinism

- **Deterministic**: **NO**.
- **Evidence**:
  1. Unseeded Math.random() in core simulation logic: Unit.repathTimer (entity.js:42), projectile scatter/shake (BattleScene.js:3808-3820), AI target spread (BattleScene.js:4330), corpse rotation and ragdoll velocity (entity.js:864-875).
  2. Variable delta times (delta / 1000) based on browser display frame rate introduce arithmetic divergence.
  3. Orders dispatch immediately on asynchronous DOM mouse/keyboard events without a tick-indexed queue.

## PLAYED THE BUILD FOR 5 MINUTES
Launched build on Chromium with ANGLE GPU backend at http://127.0.0.1:4177/scc/; verified TitleScene loaded cleanly with zero console errors.
Triggered Mission 1 launch via mouse click on LAUNCH MISSION button at (720, 690); cutscene briefing engaged with audio beds.
Skipped briefing via Space keypress; BattleScene and HudScene transitioned to active state at t=7.7s.
Single-click unit selection on starting worker (Rigger) verified via world-to-screen coordinate mapping; selection count registered 1.
Clicked ground to clear selection; verified selection state update and audio deselect trigger.
Dragged marquee selection box across canvas area (mouse down, move 140px diagonal, mouse up); verified multi-unit selection.
Assigned selection to Control Group 1 via Ctrl+1; deselected and verified instant recall via Digit1 keypress.
Issued right-click Move order to (650, 450); unit set order to move, accelerated via speed ramp, and navigated toward target.
Issued Hold position order ('H') and Stop order ('S'); verified unit halted trajectory and transitioned stance correctly.
Targeted mineral field with right-click; worker acquired harvest order, engaged mining cycle, and returned cargo to Command Center.
Selected Command Center and trained additional worker; verified 50 mineral deduction and production queue progression.
Tested terrain collision against solid mountain boundaries; verified NavGrid occupancy grid blocked impassable terrain.
Drag-selected strike force and issued Attack-Move ('A' + click) towards enemy base; observed weapon cooldowns and engagement ranges.
Executed endGame victory trigger at t=240s; observed camera pan/zoom to extraction point, letterbox bars, and debrief audio bark.
Clicked to dismiss debrief panel, returned cleanly to TitleScene, and relaunched match at t=247s; ran second match until t=300.2s with 7 duplicate texture warnings.

## Severity-Ordered Broken List

1. **[CRITICAL] NavGrid.findPath Array Destructuring Bug Causes Complete Pathfinding Failure**
   - **Location**: src2/engine/pathfinding.js:94
   - **Details**: `const [cur, f] = open.splice(bi, 1)` assigns array `[nIdx, fScore]` to `cur`. On line 110, `gScore.get(cur)` looks up an Array object in an integer-keyed Map, returning undefined (cg = Infinity). Neighbor evaluation fails (Infinity < Infinity is false). Zero neighbors are queued; A* search aborts at node 0 and returns null. All ground units permanently fall back to single-step straight-line movement (repath() in src2/engine/entity.js:199).
2. **[HIGH] Duplicate Texture Creation Crash/Warning on Match Restart**
   - **Location**: src2/engine/art.js:29-45, src2/scenes/BattleScene.js
   - **Details**: Relaunching a match from TitleScene throws 7 console errors: Texture key already in use: fog, vis, fog_mist, blight-t0, blight-ai-t0, blight-t1, blight-ai-t1. Dynamic canvas textures created via textures.createCanvas() do not check textures.exists(key) and are not cleared on shutdown.
3. **[MEDIUM] Unresolved CSS Font Asset Paths at Build Time**
   - **Location**: index.html:14, 20, 26
   - **Details**: Vite build reports warnings for fonts/Orbitron-Variable.ttf, fonts/Rajdhani-Bold.ttf, and fonts/Rajdhani-SemiBold.ttf failing to resolve at build time due to missing base path prefixes.
4. **[LOW] Monolithic Bundle Chunk Exceeds 500 kB**
   - **Location**: vite.config.js, dist/assets/index-BA8Pyue4.js
   - **Details**: Production build emits a single 1,676 kB JS chunk, triggering Vite bundle size warning.
5. **[LOW] Unclean Git Working Directory**
   - **Location**: Repository root
   - **Details**: Working tree contains modified binary file verify/v227-aaa.png and untracked file ARCHITECT_EXECUTION.md.

## TODO / FIXME / HACK Counts

- **TODO**: 0
- **FIXME**: 0
- **HACK**: 0
*(Searched across all source, script, markdown, and config files. Excluded generated sourcemaps in stage/ and binary bytes).*

## Asset Counts by Type

- **Images (Total: 951)**: PNG: 936 (ai_raw: 526, public: 115, assets: 106, src: 67, verify: 47, qa-shots: 32, stage: 18, shots: 16, root: 6, research: 3); JPG: 11 (public: 7, research: 4); GIF: 2; SVG: 2.
- **Audio (Total: 120)**: M4A voice tracks: 92 (public/vo/); MP3 SFX: 28 (public/audio/).
- **Fonts (Total: 3)**: TTF: 3 (Orbitron-Variable.ttf, Rajdhani-Bold.ttf, Rajdhani-SemiBold.ttf).
- **Configuration / Data (Total: 5)**: JSON: 5 (package.json, package-lock.json, src2/data/ai-manifest.json, 2 in public/).
- **Code & Scripts**: CommonJS (.cjs): 115; JavaScript (.js): 62; Shell (.sh): 40; Python (.py): 15; Markdown (.md): 21; HTML (.html): 3; Backups (.bak245): 29.

## Build / Test Commands and Actual Outcomes

- **Build**: `npm run build` (`vite build`) -> **SUCCESS** (Exit code 0). Built in 632ms. Emitted dist/index.html (1.47 kB), dist/assets/index-BA8Pyue4.js (1,676 kB). 3 font path warnings, 1 chunk size warning.
- **Primary Gate Test**: `NODE_PATH=$(npm root -g) node scripts/verify-v265-coach.cjs` -> **SUCCESS** (RESULT GATE-V265 PASS 28/28, Exit code 0). Verified tutorial coach, forced click gating, worker train, mineral harvest, barracks placement/construction, marine production, and dummy kill.
- **Regression Tests**: verify-v247-grade.cjs (PASS), verify-v264-portrait-pop.cjs (GATE-V264 5/5 PASS). Note: package.json defines dev, build, and preview scripts only; no test script declared.

## Current Commit and Dirty-Tree State

- **Current Commit**: fef34297535f3b268e57b5258d071e978be4068f
  - Author: wdavidpence <wdavidpence@users.noreply.github.com>
  - Date: Mon Sep 14 08:45:09 2026 -0400
  - Message: v2.65.1 coach objectives panel sync: F10/objectives text mirrors current training step; campaign mission 1 boot verified (mission.tutorial -> coach + crippled AI)
- **Dirty-Tree State** (git status --porcelain):
  - M verify/v227-aaa.png (Modified binary capture, unstaged)
  - ?? ARCHITECT_EXECUTION.md (Untracked documentation file)
  - ?? DIGEST.md (Created repository digest)
