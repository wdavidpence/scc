# DONE

## Foundation jobs
- JOB-000 — repository/build/play digest accepted; critical A* defect identified.
- JOB-001 — public gameplay-parameter teardown accepted after token/citation correction.
- JOB-002 — context-pack generator accepted; verification 7/7.

## PLAN bullets
- P0.001 — baseline frozen at commit `fef34297535f3b268e57b5258d071e978be4068f`; two independent 302+ second browser runs; verifier PASS. Evidence: `baseline/phase0.csv`.
- P0.002 — pure-Node four-case pathfinding harness committed in expected-red state; open-route reconstruction returns null and gate exits 1 as specified.
- P0.003 — corrected A* entry extraction with a one-line source replacement; pathfinding harness 4/4 PASS and production build PASS.
- P0.004 — failed ground A* now returns a legal nearest-reachable partial route; 100/100 trials avoid solid cells and emit explicit unreachable feedback within 3.873 ms maximum.
- P0.005 — deterministic runtime terrain-truth export covers all 25,600 cells; reports 286 coordinate-specific mismatches including cliff, rock, valley, mountain/elevation, and ramp defects.
- P0.006 — continuous solid mountain bodies verified across three RNG cases; 125/125 flat valley cells stay walkable per case, HQ connectivity passes 3/3, and valley obstruction mismatches fall from 109 to 0.
- P0.007 — three plateau components each have a 3-cell walkable ramp; 91 non-ramp cliff edges are solid with zero line-clear/path crossing leaks; cliff and ramp mismatches fall to 0.
- P0.008 — three honest flat-ground routes verified between HQs; 344 unique valley cells, 3/3 blocked-corridor recomputations, ≥31.45-tile separation, and labeled real-game screenshot PASS.
- P0.009 — 50-case clearance harness proves small units pass 20/20 narrow gaps, large units reject 20/20, both pass 25/25 legal wide corridors, and flying passes 5/5 in 23.04 ms; source already correct.
- P0.010 — real spawned Wraith and Marine share endpoints across mountain terrain; Wraith ratio 1.000 crosses solid directly, Marine uses 17 valley samples with zero illegal entries and a longer legal route, both arrive at 0px error; labeled real-game screenshot PASS.

- P0.011 — 50 deterministic blocker-open trials pass in one fixed 50ms tick: A* 200/200, shared-flow 200/200, zero stale fields, zero blocked samples; real-browser terrain/order regressions PASS.
- P0.012 — five real BattleScene restarts pass with 8/8 dynamic texture keys singleton-bound every cycle, zero console/page/duplicate errors, and 15.60 MB forced-GC heap growth (≤25 MB).
- P0.013 — dual-base font gate passes for `/` and `/scc/`: zero unresolved build warnings, all 3 TTFs HTTP 200, zero 404/request/page errors, and all Orbitron/Rajdhani font checks true.

- P0.014 — deleted legacy src/ runtime (93 tracked files) + 9 src/-reading legacy harnesses/scripts; import-graph BFS over 25 src2 modules reaches zero src/; production build exit 0; coach gate 28/28 live on real Chromium; deletion quota count=1 verified by scripts/verify-legacy-src-p0014.cjs (P0.014-GREEN).

- P0.015 — deleted vite2.config.js, vite2.preview.config.js, index2.html, dist2/, and 6 orphaned v216-v221 harnesses; sole documented preview command = vite build + python http.server under /scc/; active gates reference zero index2/vite2; build exit 0; coach gate 28/28 x2 (first post-build run = known CDN/staging flake, rerun green); deletion quota count=2.

- P0.016 — deleted orphaned tracked stage artifacts .stage/scc and .gate-root/scc (serve-time symlinks, referenced by zero gates); gitignored; clean rebuild regenerates only dist/ (ignored), tracked stage output count=0; coach gate 28/28 post-rebuild; deletion quota count=3.

- P0.018 — scripts/verify-routing-seeded.cjs: 100 seeded dual-ridge mountain maps, routes validated against independent no-corner-cut BFS oracle; 200/200 assertions pass (route-exists for every oracle-reachable pair, zero solid-cell entry); wired into run-regression-263.sh; full suite GREEN.

- P0.017 — WAIVED quota for v2.66 (autonomous default after human-gate timeout). Evidence: full src2 audit names zero intact dead gameplay systems; only orphan fragments recorded in BACKLOG. Reversible ruling; deletion ticket pending.

- P0.019 — Phase-0 RC: F5 topology debug overlay (renders nav truth; mountain/ramp/valley), verify-rc-phase0.cjs 10/10 incl nested coach 28/28, restarts x2, 100% overlay-truth agreement, zero page errors. RC build index-Ck1UuTjr.js.

- P0.020 — GATED-WAIVED by owner (option 2). Automated-only acceptance; deferred human fun-gate mandated again at P1.055/P2.100+. 5 outside testers required at first fun-gate opportunity.

- P1.021 — src2/engine/simSchema.js canonical sim state (tickIndex/rng/terrain/players/units/buildings/projectiles/orders), allowlist projection + order-stable canonicalizer + FNV hash; BattleScene.exportSimState live seam verified in Chromium; gate SIM-SCHEMA 16/16; coach 28/28 regression green.

- P1.022 — src2/engine/simClock.js fixed 24Hz clock (exact tick count under variable fps, interpolation alpha, spiral-of-death clamp); gate SIM-CLOCK 11/11. Scene consumption of the clock lands in P1.026 (delete variable-delta updates).

- P1.023 — src2/engine/simInt.js integer world coordinates (Q8 = 1/256 px), pure deterministic movement kernel: footprint probe, segment audit (no-tunnel), axis-priority slide, blocked-at-truth. WIP inherited with a Q16/Q8 velocity unit mix (teleport + tunneling); fixed to single-unit arithmetic. Gate scripts/verify-int-coords.cjs 13/13 incl cross-engine hash equality (default V8 vs --jitless V8 + in-process, 20,000 ticks).

- P1.024 — src2/engine/simNum.js canonical integer-number contract: Q8 positions, Q8/tick rates, 24Hz tick timers, 1/256-turn bearing, orderToCanonical (float point -> Q8 tx/ty); simSchema.validate now rejects floats+NaN on declared integer fields (coverage deliberately excludes hp/damage — Phase 4 scope); BattleScene.exportSimState quantizes through SimNum (canonical export is integer-only). Gates: verify-sim-num.cjs 14/14, verify-sim-schema 18/18, regression-263 suite green on rebuilt bundle (v253 = AudioContext env flake, identical on LIVE pre-change bundle; all functional checks ok:true).
- P1.025 — seeded PRNG for sim randomness: src2/engine/simRng.js sfc32 kernel (4x u32 + draw counter, serialize/restore/digest; shipped in the playability commit, gate added now) + this pass: entity.js sim-side audit closed two missed sites (volley muzzle-origin jitter, bunker garrison origin — SIM because projectile spawn position shifts flight distance and therefore the applyHit tick); simRng(world) now also accepts kernel world.rng (simWorld oracle); headless-fallback Math.random restricted by contract comment to rng-less mock worlds. Gate scripts/verify-rng.cjs extended to 18 checks: chi2, 100-seed x 3-engine stream identity, scripted 368k-draw slice x 5 seeds byte-equal across default/jitless V8, sim-file source scan (ban-patterns + statement guard: no Math.random on issueMove/spawnUnit/spawnProjectile/findNearestEnemy lines), presentation isolation, exportSimState rngState, schema int-declaration. Full browser regression-263 GREEN on rebuilt bundle (Playwright chromium-headless-shell had to be reinstalled — cache was empty since the 09-16 npm audit sweep). Done-when caveat: 100-seed MATCH-replay identity needs P1.038 runner + P1.026 fixed-delta; stream-level determinism proven instead, per context pack.

- P1.026 — variable-delta deletion, Phase-1 shape (option B, pack-approved): src2/engine/simWorld.js pure fixed-24Hz kernel (consumes simClock tick counts + simInt Q8 movement + seeded SimRng; scripted 16-unit skirmish fixture in-gate) + scripts/verify-fixed-tick.cjs 8/8 — exact tick counts under 30/60/144Hz/stutter render schedules, cadence-equal state (paced === straight-through at same tick count), 10k-tick hash identity across in-process/default-V8/--jitless, render observer cannot alter sim hash, shell-trail roll camera-guarded, single interceptor damage pathway. Kernel shipped in playability commit; this pass = audit + closure + BACKLOG deferral record. Live variable-dt chain removal is P1.029-mandated first task (see BACKLOG).


## P1.036 — per-tick canonical state hashing (2026-09-23)
- Ring: BattleScene fixed-tick loop records hashState(exportSimState()) per finished tick, 1200 deep, opt-in via __collectHashes (default off).
- orderToCanonical: no more live-object leakage into canonical stream (attackTarget.target cycle -> stack overflow, found by mutation test); refs become #id, waypoint arrays become Q8 pairs.
- Gate scripts/verify-hash-ring.cjs 7/7 (Node canonical checks + dual-granularity live ring identity + mutation-at-500 firstDiff=500). Suite 26/26 GREEN.

## P1.037 — first-divergent-tick desync report (2026-09-23)
- src2/engine/desyncReport.js: ring scan -> first divergent tick, then leaf-level field diff (dotted paths, cap 64, truncation flag).
- verify-desync-report.cjs 9/9 headless: tick-500 pos/hp/rng mutations each report tick 500 + exact field; control + insertion-order twins clean; 78ms.
- Suite 27/27 GREEN (gate runs in kernel loop).

## P1.027 i3b — input-callback purity, live scope (2026-09-30)
- All remaining state-mutating input sites moved to the tick head: patrol/attack-move/casts (ult nuke+storm, scan, voidlance, caustic, unit psiStorm), build placement (pointer + coach auto-place), deploy (D key + HUD button), merge/morph (keys + HUD), production/research queues, stop/hold HUD. handleHudCommand deleted (deletion quota 1/2). Input callbacks are enqueue-only (__cmd) + presentation/UI; execCmd resolves state at the fixed-tick boundary with press-time selection snapshots.
- Render-clock damage chains deleted, recreated as simTimers entries (nuke_detonate 2900ms, ult_storm 450ms x10, ucast_storm_tick 500ms x7, caustic_tick 600ms x10): pause now freezes them, chains die with the caster, render pace cannot shift the applyHit tick (deletion quota 2/2).
- tryPlace re-validates placementReason at EXEC (stale ghost validity cannot place); cast energy + scan CD re-checked at EXEC (verified live: second storm at 25 energy rejected).
- Gates: scripts/verify-input-purity.cjs 8/8 (source-purity scan, live scope) + scripts/verify-cmd-live2.cjs 17/17 (behavior, manual-clock). Both wired into run-regression-263 + scripts/build-qa.sh one-shot rebuild helper.
- Full suite 38/38 GREEN on rebuilt bundle (dist/assets/index-CHMertWJ.js), incl economy-live hands-off chain, tick-parity 0.5x/0.25x digest identity, hash-ring mutation-at-500.

## P1.028 — render-clock teardown-proof + projectile single-source (2026-09-30)
- New gate scripts/verify-teardown-hash.cjs 10/10: twin battles at same tick budget; teardown run destroys every depth>=45 presentation object (FX, projectile/spark carriers; lightLayer/tintRect/gradeRect keep-list) and stops all active tweens every 12 sim ticks. Hash rings byte-identical at 1x + 0.5x granularity, plain and blitz twins. Non-vacuity: purged>50 objects AND in-flight projectile sprites really destroyed, so the flight-survival path is exercised, not skipped.
- Projectile refactor: spawnProjectile creates {id,x,y,team,kind,damage,splash,target,attacker,dead,shell} in this.projectiles[] (SIM single source); stepSim flight loop + damage read projectiles[], not children.list; sprite carrier = decoration with _proj back-ref (polish.js projTrail kept working); dead entries culled same tick; instant hits store no carrier. Teardown/camNear sprite kills can no longer drop a damage tick.
- Blitz mod un-jammed from render clock: time.delayedCall(800ms) enemy-HP doubling replaced by scheduleMs('blitz_pick', 2000ms, n:90) retry-at-tick-boundary; gate proves the mark lands at a fixed tick at both paces, with and without teardown.
- Harness lesson: CROSS-PACE hash pairing is flaky (~1/6) at ring-record level with zero state divergence (per-tick exportSimState diff = 0/720 via probe); use same-pace twin pairs for teardown/purge gates, keep pace invariance on hash-ring/tick-parity. Manual-clock pages must set __manual BEFORE the create-stall spin (post-start sleep leaked real frames -> tick overrun).
- P1.025 deferred half closed same commit: scripts/verify-replay-record.cjs 16/16 — record -> fresh-boot replay of the cmd stream at same tick boundaries -> truncated replay must diverge; 3 seeds x 500 ticks; identity = per-tick hash ring AND final exportSimState byte-equal; one retry on fork (genuine rare fork still fails).
- Full suite 40/40 GREEN on rebuilt bundle (QA server on 4177, build-qa.sh one-shot).

## P1.030 INCREMENT 1 DONE 2026-09-30 (suite 41/41 GREEN)
- Extraction: src2/engine/simEconomy.js — pure resource-ledger (canAfford/spend/income/depositCargo), supply accounting (canSpawn/chargeSupply/releaseSupply/computeSupplyCap), and harvest world-queries (nearestDropOff/pickMineralForWorker/nearestMineralPatch/nearestGeyser). BattleScene now keeps one-line delegators (spawnUnit gate, onUnitDeath release, computeSupplyCap, ledger trio, onCargoDeposited, AI income lines, the four query bodies). entity.js production chains keep calling world.*, so live match and headless golden execute the SAME arithmetic — a live/headless fork is a module bug, not harness drift. Semantics preserved verbatim incl. arriveReady cap-bypass + charge-always (SUPPLY-OVERSHOOT-SEMANTICS pins it) and the P0.39/v2.70#4 occupancy-cap machinery in pickMineralForWorker.
- Gate: scripts/verify-economy-golden.cjs 11/11 — 5-minute (7200-tick @24Hz) economy replay, NO DOM/Phaser (phaser-stub loader): real Unit harvest/gas/returnCargo + Building queue drain + spawnFromQueue on a fake world. Checks: dual-run hash identity, cross-V8 --jitless identity, no-NaN, conservation (mined == deposited + cargo-in-flight on BOTH ledgers, exact), production ran (queue 30 successes, 38 spawns), supply exact (38 charges, 0 leaks), pinned totals (1200 M + 300 G mined; ledger M 300->0, G 0->296). Full-field depletion reached, so depletion/re-pick/blacklist paths execute inside the replay.
- Runner: gate appended to the pure-Node block of run-regression-263.sh; new scripts/qa-build.sh one-shot builder. Full suite 41/41 GREEN on rebuilt bundle (index-D6zYhLj5), economy-live browser chain (~100 s hands-off mining) still ACCEPTANCE PASS -> extraction behavior-neutral live.
- Harness note: pins were CALIBRATED from a real run, never hand-written; conservation identities bound them so a collapsed run cannot pass. Fake world needs nav.blockRect + textures.exists + time.now (Building ctor/update) — flat-terrain stub already covers; add those three when cloning the pattern.

## DEF-MOVE-1 DONE 2026-09-30 — group-move jitter/freeze (user report: "6 soldiers jittered and did not move")
- Root causes (all proven live, not guessed): (1) stepAlongFlow separation was UNCAPPED — the P0.39 cap existed only on the A* branch, so crowd push rotated/cancelled the goal drive; (2) flowAt-null (pocket/plateau/dead field) parked units in state 'move' FOREVER with zero motion — no escape hatch; (3) formation slots could aim inside solid tiles; (4) a completed building auto-sets selectedBuilding, and right-click-over-empty-ground with units selected ran the RALLY branch instead of the move branch (rally swallow).
- Fixes: capped flow-branch separation at 0.75 (same constant as stepAlongPath); dead-flow now hands off to per-unit A* (flowField=null + needsPath); stuck-breaker — <2.5px progress in 0.7s while on flow = hand to A*, after 2 failed handoffs resolve to idle (never a frozen move state); formation slots snap to the click point if their tile is unwalkable; rally placement requires !SEL.length (matches SC1 semantics).
- Verified end-to-end in real Chromium (repro scripts/repro-v4.cjs + permanent gate): rally-pocket 6-marine march went from net 2-8px in 6s (tortuosity 20+) to net 145-160px reaching the target, orders resolving; footprint-locked cluster (worst synthetic case) degrades to idle instead of freezing.
- Gate: scripts/verify-smooth-move.cjs 2/2 (~50 s, 2 scenarios, travel + no-freeze criteria), wired into run-regression-263.sh browser block.
- Harness lesson (bit twice): browser gates run under run-regression-263.sh WITHOUT NODE_PATH — require('playwright') via npm root -g (copy the verify-cmd-live.cjs header), otherwise the gate crashes in-suite and passes standalone.

## P1.031-i1 DONE 2026-09-30 — combat-math extraction to simCombat.js
- New src2/engine/simCombat.js: sizeMult, effectiveDamage (size mult + bonus
  dmg/armor + high-ground +2), absorb (shield-then-hp, regen-delay only where
  the property exists — buildings never set it), unitSplashDamage +
  bldgSplashDamage falloff curves, splashPass (verbatim unit+bldg loops),
  structureShot (turret + bunker-garrison shot math), secondaryDamage
  (burrower 0.8 falloff), stepProjectiles (P1.028 flight loop, verbatim).
- entity.js: local effectiveDamage deleted (re-exported from kernel);
  Unit/Building.takeDamage absorb → SC.absorb; turret + bunker fire math →
  SC.structureShot; fireAt/burrowerStrike call the kernel.
- BattleScene.js: applyHit splash loops → SC.splashPass (pass the REAL target
  — a surrogate breaks the u===target identity skip); stepSim projectile loop
  → SC.stepProjectiles. Live and replay now execute the same code.
- Gate: scripts/verify-combat-golden.cjs 13/13 (~0.3 s): dual-run identity +
  cross-V8, full-roster DAMAGE-ORACLE (5712 attacker/target pairs vs an
  independent oracle transcription), absorb/splash/flight endpoint pins, and a
  real 247-tick firefight replay (turret + splash + shields + ridge +2).
- Pitfall found while calibrating the gate: TILE is 16, not 24 — a 7-tile
  turret radius is 112 px; a probe script saved 3 wrong pins. Also:
  bldgSplash floor is 0.3.
- Suite: 43/43 GREEN on rebuilt bundle index-uB35jQIA (HEAD-fresh).

## P1.031-i2 DONE 2026-09-30 — veterancy + upgrade math into simCombat kernel
- Added to simCombat.js: shotDamage (= effectiveDamage + level*2, was fireAt's
  inline `dmg + lvl*2`), applySpawnBonuses (spawn-time weapon/armor/plating/
  speed assembly, was BattleScene.spawnUnit), researchBonuses (SIM block of
  completeResearch: tech flag, upgrade counters INCLUDING the affects++ →
  set(level) → explicit-id++ double-increment quirk, retro-apply to infantry/
  vehicle branch lists, sentinel range def-clone). Presentation-only code
  (tints, orb fly, alerts) stayed in the scene; the empty deepWarren find
  block was dead code and was not carried over.
- verify-combat-golden.cjs 13→17 checks: SHOT-ORACLE (64 combos vs
  independent recompute), SPAWN-BONUS-PINS, RESEARCH-PINS (pins the counter
  quirk + Math.max no-clobber + team filter + def-clone), RETRO-IN-SCENARIO
  (mid-fight Weapons-2 at tick 90 on live units). Scenario now runs P1
  upgraded (w1/a1 + plating) and research fires DURING the replay.
- Economy golden unchanged hash (91cd7fc1) after wiring its spawnUnit through
  the same kernel — single-source discipline without pin churn.
- Harness lesson 1 (smooth-move gate): J waypoint scan searched LEFT of the
  blob and passed only on lucky camera/map rolls; on left-edge spawn maps the
  waypoint projected off-screen (x<0) and the click never happened. Fixed:
  scan down-right, require the waypoint inside camera worldView (clickable).
  Lesson 2 (suite runner): a down QA server turns every browser gate RED
  with misleading errors — run-regression-263.sh now aborts fast on
  non-200 preflight instead of burning 11 minutes.
- Suite 43/43 GREEN incl. teardown-hash 10/10 + replay parity (kernel
  extraction verified behavior-identical). Released as v2.71.0.

## P1.032-i1 DONE 2026-10-01 — terrain/nav pure-state kernel + worker-chain unfreeze
- New src2/engine/simTerrain.js: buildMapState(seed,W,H) generates rock
  clusters/tiles/destructibles, elev/ramp, ridge+knoll lines, valley bands
  (ty 44-52, ty 110-118), HQ-connectivity corridors; bakeLayers emits
  solid/blocked. Scene keeps a SEPARATE presentation stream for sprite
  key/flip/scale so render pacing can never enter the sim hash.
- Terrain is now SimRng(matchSeed)-driven. Before: this.rng() minted a fresh
  LCG(1234567) per call — every match had the identical map, so the P1.032
  done-when (seed-driven maps) had never actually been satisfied.
- Preserved quirks: destructibles share reference identity with rockTiles
  entries (runtime mutates both — no copy/filter); valley-cleanup orphan
  destructibles are harmless and asserted as such (walkable check, not list
  equality).
- Fixed: pathfinding findPath goal-snap took the FIRST walkable tile in ring
  scan order and could snap onto the unit's own start tile. Off-centre mineral
  patches on shelf-edge terrain produced 1-2 point paths whose last waypoint
  was ~22.6px from the crystal — outside the 17.6px harvest radius — so the
  whole worker chain froze (economy-live RED; DEF-MOVE residual shuffle in
  crowded pockets). Snap now picks the CLOSEST walkable cell to the goal
  pixel, never the start tile; deterministic ring scan (r then x then y,
  strict '<').
- New gate scripts/verify-terrain-golden.cjs: T1 byte identity incl.
  cross-engine (--jitless) check, T2 8-seed divergence, T3 A→B flood
  connectivity, T4 ramp reachability, T5 count floors. Wired into
  run-regression-263.sh, suite 43→44.
- Suite 44/44 GREEN twice (one earlier RED was a replay-record contention
  flake: 16/16 standalone and on rerun, zero flakes in final full run).

## P1.033 DONE 2026-10-01 — render adapters on tick snapshots (render-off + 144 Hz identity)
- New src2/engine/renderAdapter.js: one-tick-behind entity interpolation.
  Per tick, snapshotPair copies container.x/y into _r0/_r1 display fields;
  per render frame smoothPass shifts the unit CHILD visuals (sprite/shadow
  local offsets) by lerp(r0,r1,alpha), alpha = _tickAcc/TICK. Container
  position — the collision AND hash-observed truth (get x(){container.x},
  exportSimState q8) — is never written, so interpolation adds zero state.
- New __renderOff flag: skips the ENTIRE __step render tail. Proved
  simulation-invisible, together with the writer moves below, by byte-
  identical per-tick hash rings and final exportSimState across tail-on /
  render-off / 144 Hz-interp runs of one scripted 16-unit skirmish.
- Three render-paced STATE writers removed from the tail (they mutated sim
  state at display cadence — the exact coupling this ticket exists to kill):
  coach harvest-lesson worker park (was coach.tick), hold-the-line countdown
  + settlement/endGame, brood-nest skywarden refuel. All now run in the
  fixed-tick loop verbatim at 24 Hz; render-off probes prove they still fire.
- Gate scripts/verify-render-adapter.cjs (13 checks): identity family A/B/C
  + non-vacuity (attrition >=8 kills, tail-skip counter proves tail really
  off, interp paints >500 moving frames maxOff>1.5px, writer probes).
  Wired into run-regression-263.sh, suite 44->45. Full suite 45/45 GREEN.

## P1.034 DONE 2026-10-01 — net-side command queue (shuffled-arrival identity)
- New src2/engine/netCmds.js: pure receive buffer for network command
  streams. Canonical execution order is content — (dueTick, player, seq) —
  never arrival time. Per-player seq prefix = causality: a command executes
  only after every smaller seq in its stream; a missing seq HOLDS the rest
  of that stream (late retransmit resumes at the right point). Duplicate
  (player,seq) drops. Same shape as TCP reassembly + frame-delay lockstep:
  jitter changes latency, not outcome.
- This is deliberately NOT the local input path: cmdQueue (P1.027) keeps
  last-arrival-wins coalescing for mouse UX. Net streams must never
  coalesce — every sender command is authoritative. That asymmetry is the
  ticket.
- BattleScene wiring: __net(pkt) feed + tick-head drain right after
  matchCmds. Default play leaves netBuf undefined — zero cost, local path
  byte-identical (full suite proves it).
- Gate scripts/verify-netcmds.cjs (8 checks): P family pure-kernel (12-pkt
  stream under reversed + 5 seeded-shuffle arrivals => byte-identical exec
  sequences; dedup; gap-hold prefix rule; --jitless cross-engine digest
  match via verify-netcmds-selftest.cjs). L family live (12 scripted
  order/stop/stance packets into the REAL scene in 4 arrival permutations;
  wrapped-execCmd call order + hashRing + exportSimState identical across
  all four and different from the no-commands control; gapped-delivery run
  preserved per-player seq order). Wired into run-regression-263.sh, suite
  45->46. Full suite 46/46 GREEN, zero flakes.
- Gate-authoring lesson: P3 initially RED because the assertion checked
  per-player prefix AFTER drainNet had already popped the whole batch
  (next had advanced). Kernel was right, probe was wrong — same lesson as
  P1.032: assert the invariant, not a probe artifact.

## P1.035 DONE 2026-10-01 — SCCR/1 replay format (lossless round-trip + content-hash refusal)
- New src2/engine/replayFormat.js (pure kernel, zero src2 consumers yet —
  P1.038 runner + P1.050 golden replays are the planned consumers).
- Envelope: header (version, seed, ticks, hashEvery, mapHash, dataHash,
  cmdCount) + spawn fixtures + one line per tick-stamped command
  (tick|player|type|subject|payloadJSON) + trailing FNV-1a checksum over
  every byte above. Text format = diffable, 8 MB-capped at 10 min.
- Two refusal classes kept deliberately distinct: the CHECKSUM catches any
  corruption or edit anywhere (seed, tick stamps, payloads — first defense
  is refuse, never hand-decode tampered semantics); CONTENT HASHES are
  compared against local state — a replay must not run against a terrain
  bake or a balance table it was not recorded on. That is what turns golden
  replays into guard rails instead of time bombs when terrain gen or unit
  stats change (a stat tweak flips the canonical data hash -> refusal).
- Losslessness contract proven: decode(encode(x)) deep-equal + byte-identical
  re-encode, incl. fractional .125-grid waypoints and nested payloads; JSON
  shortest-roundtrip preserves doubles; no re-keying anywhere.
- Gate scripts/verify-replay-format.cjs (7 checks): 600 s/14400-tick 2.3k
  command fixture round-trips; 40 single-byte corruption sites all refused;
  RE-SIGNED attacks (checksum recomputed) still refused for version/magic/
  cmd-count/map/data classes with exact error codes; --jitless cross-engine
  digest match; live-recorded __cmdLog stream (~420 real commands) from a
  running match round-trips + wrong-map refused. Wired into suite 46->47;
  full suite 47/47 GREEN zero flakes.
- Harness lessons: seed swap is checksum-class by design (seed covered, no
  separate semantic seed check) — assert the REAL rejection path; object
  round-trip comparison must be field-wise (key insertion order differs
  between recorded and decoded shapes; byte-equal re-encode is the proof).

## P1.038 DONE 2026-10-02 — headless CLI match runner on the SCCR/1 spine
- replay-runner.cjs rewritten: consumes legacy JSON AND SCCR/1 replays.
  SCCR path = P1.035 format kernel (decode + refusal classes) feeding the
  P1.034 netCmds receive queue — the three-ticket spine (34+35+38) closes
  end-to-end: record order -> file -> any arrival permutation -> one
  canonical execution order -> one hash.
- Headless world upgraded from 64x64 all-walkable nav stub to the REAL
  SimTerrain bake + real NavGrid (elev/ramp aware) built from the replay
  seed; content hashes compared against that bake, so a replay recorded on
  different terrain or balance is REFUSED (exit 3) instead of silently
  replayed against changed rules.
- New CLI: --generate-sccr (byte-stable writer), --shuffle-arrival <seed>
  (permuted delivery proof), --hash-every N (ring mode, proven
  sim-neutral: final hash identical with and without), --fake-map/--fake-data
  (harness-only refusal-path injection).
- Timings (24-inch M2 CU class box): 10-min mirrored battle 519 ms
  (done-when limit 10 s); 200-unit probe 3.4 s — P1.052 starts from
  feasible territory; 251/715 headless-skipped cmd types count as skips,
  never crashes (format portability).
- Gate verify-replay-runner.cjs extended 7 -> 18 checks (dual-run identity
  both paths, shuffle identity x3, refusal x4, attrition, scale probe).
  Suite stayed 47 gates (replay-runner lives in the loop list), 47/47
  GREEN twice, zero flakes.
- Harness lesson: dual-identity asserts must compare DIGESTS (finalHash +
  ring digest), never whole output lines — wallMs varies per run.

## P1.050-i1 DONE 2026-10-02 — replay-runner run isolation (foundation for golden-replay parity)
- Found and fixed a REAL determinism defect: replay-runner executed twice in
  one process diverged (entity.js module-level nextId continued across runs;
  Math.random history shared). Cross-process runs were always deterministic,
  so the shipped suite never caught it — the defect blocked the P1.039
  five-run bot-vs-bot requirement and any future in-process batching.
- Fix = per-run isolation, default ON: loader.mjs propagates a per-run nonce
  query through the whole engine import subtree (fresh module copies, ids
  restart at 1, no shared tables) + Math.random pinned to a seed-derived LCG
  for the run. SCC_RUN_ISOLATED=0 opts out for A/B experiments.
- Proof: in-process hashes now EQUAL CLI hashes on both golden files
  (sccr 1721121357, json 251974592); mid-stream file switch no cross-pollution.
- verify-replay-runner.cjs extended 18 -> 22 checks (INPROC-SCCR/JSON dual,
  NO-CROSS-POLLUTION, EQUALS-CLI). Suite stayed 47/47 GREEN, exit 0, zero flakes.
- P1.050 remains open: full-economy tutorial parity needs the headless
  full-match core -> new ticket P1.056 (P1.050 now depends on it).
