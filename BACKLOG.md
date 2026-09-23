# BACKLOG

Noticed work is recorded here and abandoned until promoted to an authorized PLAN bullet.

- Victory/defeat presentation polish from v2.64 backlog.
- Title-screen visual-impact pass beyond 7/10.
- Production bundle code splitting.
- Full commercial-AAA content breadth beyond the defined vertical slice.

- Bug: BUILDINGS.nightblade mirrors UNITS.nightblade and can surface a non-placeable unit button in the build menu (needs denormalization audit + regression).
- Dead code fragments (audit P0.017): findTransportNear, findBunkerNear, applyUpgradeTintToBuildings, onProjectileHit — zero call sites; also campaign mission-start does not consume UPKEEP. Bundle into one cleanup ticket with quota ruling.
- P1.029 MANDATED FIRST TASK (from P1.026 pack, option B-iv): migrate the live variable-dt chain (BattleScene.update -> Unit.update/stepAlongPath/stepAlongFlow/fire/harvest, AI blocks, per-frame projectile flight + interceptor cd) to fixed 24Hz tick consumption via simClock/simWorld. Until that lands, the literal "all simulation mutation inside fixed tick" holds in the kernel/oracle only, NOT in the live scene; interceptor cd (renderer dt) vs projectile flight is the known dual-clock site.

