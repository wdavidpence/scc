# BACKLOG

Noticed work is recorded here and abandoned until promoted to an authorized PLAN bullet.

- Victory/defeat presentation polish from v2.64 backlog.
- Title-screen visual-impact pass beyond 7/10.
- Production bundle code splitting.
- Full commercial-AAA content breadth beyond the defined vertical slice.

- Bug: BUILDINGS.nightblade mirrors UNITS.nightblade and can surface a non-placeable unit button in the build menu (needs denormalization audit + regression).
- Dead code fragments (audit P0.017): findTransportNear, findBunkerNear, applyUpgradeTintToBuildings, onProjectileHit — zero call sites; also campaign mission-start does not consume UPKEEP. Bundle into one cleanup ticket with quota ruling.
