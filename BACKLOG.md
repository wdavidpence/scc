# BACKLOG

Noticed work is recorded here and abandoned until promoted to an authorized PLAN bullet.

- Victory/defeat presentation polish from v2.64 backlog.
- Title-screen visual-impact pass beyond 7/10.
- Production bundle code splitting.
- Full commercial-AAA content breadth beyond the defined vertical slice.

- Bug: BUILDINGS.nightblade mirrors UNITS.nightblade and can surface a non-placeable unit button in the build menu (needs denormalization audit + regression).
- Dead code fragments (audit P0.017): findTransportNear, findBunkerNear, applyUpgradeTintToBuildings, onProjectileHit — zero call sites; also campaign mission-start does not consume UPKEEP. Bundle into one cleanup ticket with quota ruling.
- P1.029 MANDATED FIRST TASK (from P1.026 pack, option B-iv): migrate the live variable-dt chain (BattleScene.update -> Unit.update/stepAlongPath/stepAlongFlow/fire/harvest, AI blocks, per-frame projectile flight + interceptor cd) to fixed 24Hz tick consumption via simClock/simWorld. Until that lands, the literal "all simulation mutation inside fixed tick" holds in the kernel/oracle only, NOT in the live scene; interceptor cd (renderer dt) vs projectile flight is the known dual-clock site.


- P1.027 increment 2 (kernel v2): cmdQueue rewritten to match-scope model (epoch=pause generation, last-intent-wins coalescing per {layer,subject}, enqueue never executes, canonical (tick,player,key) drain). Gate rebuilt on new API: 12/12 (unique-key shuffle identity x4, repeat stability, canonical order, boundary/pause/coalesce semantics, dual-V8 children). Full browser suite re-run GREEN (17/17 + routing 200/200) with new bundle.
- P1.027 INCREMENT 3 MANDATED NEXT (scene wiring): (i) add simClock accumulator to BattleScene.update (fixed 24Hz steps, max 4/ticket; until it lands there is NO tick clock in the live scene - simTickIndex is read by exportSimState but never assigned); (ii) convert L2849 LMB box-select, L2858 group hotkeys (direct addGroup), L2953-2981 keyboard block (~20 slots, direct entity/state mutation incl. 6 direct Math.random), L2993 RMB order (replaces enqueueOrder overlay now), L750 Ctrl-click group branch, L835 build-placement click, L846 build-menu click to enqueue {tick: simClock.tick, epoch}; (iii) drain at tick loop head + exec handlers; (iv) then the source scan gate (no state writes inside input callbacks) can flip from kernel-scope to live-scope.

- P1.028 state of play: time.delayedCall render-clock timers that MUTATED sim state are deleted (boss spawn, surge buff revert, brood-hatch spawn, 2x endgame win) -> now simTimers deadline entries executed at fixed 24Hz tick boundaries; simTickIndex finally ASSIGNED (exportSimState no longer reads undefined). Remaining delayedCall sites verified presentation-only (fire FX emitters, ack rings, HUD alert flags). Interceptor cd + projectile flight + unit movement still render-dt driven = P1.029 mandated first task, unchanged.
