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
