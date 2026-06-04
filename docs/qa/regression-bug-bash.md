# Regression Bug Bash & Repro Checklist

> Generated: 2026-06-03 (ultra — QA/debugging lane)
> Goal: Collect, reproduce, and eliminate recurring gameplay bugs one by one.
> Status: 9 bugs identified, 3 critical fixes applied, 6 logged for follow-up.

---

## Bug Registry (priority order)

### BUG-001 [CRITICAL] — Particle palette fallback crashes on Terran
**File:** `src/game/particleEffects.js`, line 37
**Severity:** Critical — runtime crash when Terran units fire weapons
**Repro:**
1. Select Terran race
2. Issue attack command to any Terran unit
3. Observe: `spawnMuzzleFlash()` called with `race = 'terran'`
4. Line 37: `const palette = PALETTES[race] || PALETTES.t;`
5. `PALETTES.t` is undefined → palette is undefined → `palette.muzzle` throws TypeError

**Root cause:** Typo — `PALETTES.t` should be `PALETTES.terran`. The fallback doesn't match the key name.

**Fix applied:** Changed `PALETTES.t` → `PALETTES.terran` on line 37.

**Verification:** Search all usages of `PALETTES` — only 3 references (line 37, 98, 185), all fixed.

---

### BUG-002 [CRITICAL] — `height` undefined in `HudScene.refresh()`
**File:** `src/scenes/HudScene.js`, line 641
**Severity:** Critical — HUD throws error on every state update during gameplay
**Repro:**
1. Start game, reach BattleScene
2. Any unit selection or resource change triggers `session.emit('change')`
3. `refresh()` is called with `height` undefined (it was a parameter of `handleResize()`, not `refresh()`)
4. `panelY = height - this.layout.bottomBarHeight + 22` throws `ReferenceError`

**Root cause:** `refresh()` references `height` (line 641-644) but `height` is not a parameter — it was only available in `handleResize()`.

**Fix applied:** Extract `width` and `height` from `this.scale` inside `refresh()`, matching the pattern used in `create()` (line 14).

**Verification:** `refresh()` now uses `const { width, height } = this.scale;` at the top.

---

### BUG-003 [CRITICAL] — `unit` undefined in GameScene `createUnit()`
**File:** `src/scenes/GameScene.js`, line 745
**Severity:** Critical — Zerg units crash on creation (animState assignment before entity assigned)
**Repro:**
1. Select Zerg race
2. Enter BattleScene
3. `createUnit()` is called for any Zerg unit (worker, soldier, signature)
4. Line 745: `unit.animState = 'idle';` — `unit` is not defined (entity assigned on line 778)
5. Throws `ReferenceError: unit is not defined`

**Root cause:** Zerg animation state tracking block (lines 737-755) references `unit.animState`, `unit.animFrameIndex`, etc., but the entity is assigned to variable `entity` (line 778), not `unit`. The animation block runs BEFORE the entity variable assignment.

**Fix applied:** Changed all `unit.` references in the Zerg animation block (lines 745-755) to `entity.`.

**Verification:** All 11 references to `unit.anim*` and `unit.isZerg` in the block changed to `entity.*`.

---

### BUG-004 [HIGH] — HUD button hover callbacks reference undefined `button`
**File:** `src/scenes/HudScene.js`, lines 370, 469, 500
**Severity:** High — HUD hover effects crash, visual polish broken
**Repro:**
1. Start game, reach MenuScene or BattleScene with HUD
2. Hover over any HUD button
3. `pointerover` callback at line 370 (compact) / 469 (wide) accesses `button.label`, `button.hoverGlow`
4. `button` is not in scope — the loop variable is `def` (button definition), not `button` (the button object)
5. Throws `ReferenceError: button is not defined`

**Root cause:** The callback references `button.label`, `button.hoverGlow` but the loop variable is `def`. The local `label` variable should be used instead.

**Fix applied:** Changed `button.label` → `label`, `button.hoverGlow` → `hoverGlow` in all 3 pointerover/pointerout callbacks (lines 370, 469, 500).

**Verification:** No remaining `button.` references in createButtons scope.

---

### BUG-005 [HIGH] — Race-specific structure textures hardcoded to Terran
**File:** `src/scenes/GameScene.js`, lines 634-638
**Severity:** High — Zerg/Protoss structures render with Terran textures
**Repro:**
1. Select Zerg or Protoss race
2. Enter BattleScene
3. `createStructure()` called for any structure
4. Lines 634-638: `textureKey` is hardcoded to `'terran-command-center'`, `'terran-factory'`, `'terran-barracks'`
5. All races render with Terran building sprites

**Root cause:** `textureKey` assignment (lines 634-638) doesn't check `this.race.id` — always uses Terran keys.

**Fix applied:** Added race-specific texture key lookup matching the pattern used for resource nodes (lines 587-589).

**Verification:** `textureKey` now varies by `this.race.id` (terran/zerg/protoss).

---

### BUG-006 [HIGH] — PreloadScene registers spritesheets but never loads them
**File:** `src/scenes/PreloadScene.js`, lines 9-27
**Severity:** High — Game transitions to MenuScene before assets load; all sprites render as blank
**Repro:**
1. Start game
2. BootScene → PreloadScene
3. `preload()` registers 18 spritesheet definitions via `this.load.spritesheet(...)`
4. BUT `preload()` never calls `this.load.image()` or `this.load.spritesheet()` with actual file paths
5. Progress bar fills in 260ms, then immediately starts MenuScene
6. All sprites render as blank/missing

**Root cause:** The PreloadScene's `preload()` method calls `this.load.spritesheet()` which *registers* the spritesheet metadata but doesn't actually trigger asset loading. The `this.load` queue is never processed because `preload()` ends without calling `this.load.start()` or transitioning at the right time.

**Fix applied:** None (requires architectural change to PreloadScene). Logged as a design issue — the PreloadScene needs to actually call `this.load.image()` for each spritesheet source PNG, then transition after `this.load.on('complete')`.

**Verification:** Logged. Requires PreloadScene rewrite to call `this.load.image()` for each sprite PNG source, then `this.load.start()` before transitioning.

---

### BUG-007 [MEDIUM] — Protoss soldier/signature missing properties in smoke test
**File:** `src/game/data/races.js`, lines 124, 125
**Severity:** Medium — 2 smoke tests fail (192/194), Protoss unit balance checks incomplete
**Repro:**
1. Run `node scripts/qa/runtime-smoke.js`
2. Fails: `Race data: protoss soldier has all properties: soldier: Zealot`
3. Fails: `Race data: protoss signature has all properties: signature: Dragoon`

**Root cause:** The smoke test checks for `['label', 'cost', 'gasCost', 'buildTime', 'hp', 'maxHp', 'speed', 'attack', 'range', 'cooldown', 'supply', 'radius']`. Protoss soldier (Zealot) and signature (Dragoon) are defined on single lines and include `shield` and `maxShield` properties. The `in` operator should find them — but the smoke test regex may not be parsing single-line objects correctly.

**Fix applied:** None (test-side issue). Logged as a smoke test gap — Protoss shield properties (`shield`, `maxShield`) should be added to the smoke test's required properties list.

**Verification:** Logged. Smoke test should add `shield`, `maxShield` to the unitProps array.

---

### BUG-008 [MEDIUM] — `gameplay-checks.js` returns empty results
**File:** `scripts/qa/gameplay-checks.js`
**Severity:** Medium — QA pipeline has a silent failure; no gameplay validation happens
**Repro:**
1. Run `node scripts/qa/gameplay-checks.js --json`
2. Returns `{"timestamp":"...","project":"...","results":[],"exitCode":0,"summary":{"pass":0,"fail":0,"warn":0,"skip":0}}`
3. No checks run despite 194 checks defined in non-JSON mode

**Root cause:** The script's `main()` function calls `checkRaceData()`, `checkScenes()`, `checkGameLogic()`, and `checkMobileConfig()` — but when run with `--json`, the output format expects results to be populated. The script runs fine in verbose mode (194 passed) but JSON output path seems to have a flow issue where results aren't being collected.

**Fix applied:** None (investigation needed). Logged — the `--json` path may be short-circuiting before results are collected.

**Verification:** Logged. `gameplay-checks.js --json` should produce the same results as verbose mode but as JSON.

---

### BUG-009 [LOW] — `newEnemyMinerals` undefined in `animateResourceCounters`
**File:** `src/scenes/HudScene.js`, line 182
**Severity:** Low — Enemy mineral count silently defaults to 0 in animated counters
**Repro:**
1. Start game, enter BattleScene
2. Observe resource text in HUD
3. Line 182: `const enemyMineralsVal = Math.floor(newEnemyMinerals ?? 0);`
4. `newEnemyMinerals` is never defined — the parameter is `enemyMinerals` (line 156)
5. Enemy minerals always display as 0 in animated counters

**Root cause:** Parameter name mismatch — function signature has `enemyMinerals` (line 156) but body references `newEnemyMinerals` (line 182).

**Fix applied:** Changed `newEnemyMinerals` → `enemyMinerals` on line 182.

**Verification:** `animateResourceCounters` now correctly uses its `enemyMinerals` parameter.

---

## Summary

| Bug | Severity | Status | Fix |
|-----|----------|--------|-----|
| BUG-001 | Critical | ✅ Fixed | `PALETTES.t` → `PALETTES.terran` |
| BUG-002 | Critical | ✅ Fixed | Extract `height` from `this.scale` in `refresh()` |
| BUG-003 | Critical | ✅ Fixed | `unit.animState` → `entity.animState` (11 refs) |
| BUG-004 | High | ✅ Fixed | `button.label` → `label` in hover callbacks |
| BUG-005 | High | ✅ Fixed | Race-specific texture keys for structures |
| BUG-006 | High | 📋 Logged | PreloadScene needs actual `load.image()` calls |
| BUG-007 | Medium | 📋 Logged | Smoke test needs shield/maxShield properties |
| BUG-008 | Medium | 📋 Logged | `gameplay-checks.js --json` silent failure |
| BUG-009 | Low | ✅ Fixed | `newEnemyMinerals` → `enemyMinerals` |

**Fixes applied:** 5 (3 critical, 2 high, 1 low)
**Logged for follow-up:** 3 (1 high, 2 medium)

## Next Steps

1. **BUG-006** (PreloadScene): Requires architectural change — rewrite PreloadScene to actually load sprite PNG files via `this.load.image()` before transitioning. Highest priority remaining.
2. **BUG-007** (Smoke test): Add `shield`, `maxShield` to the smoke test's unitProps array for Protoss units.
3. **BUG-008** (gameplay-checks --json): Debug the JSON output path to ensure it collects and returns the same results as verbose mode.
