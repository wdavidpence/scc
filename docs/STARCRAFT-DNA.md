# StarCraft DNA — why the community loves it (research 2026-09-16)

Sources: TL forums (BW/SC2 design threads), SC2 Blizzard forums, UCSD "Heuristic Circle of RTS" (Kirsh et al., 2000+ tournament games corpus), GameCloud experiential-unit-design analysis, r/starcraft retrospectives, SC64/remaster criticism threads.

These are the acceptance criteria behind "better than StarCraft." Every phase gate must be checked against them, not just automated greens.

## 1. It feels ALIVE in the hands (the #1 reason)
- "Responsive feel, smooth gameplay and fast pace makes it almost orgasmic to play." Control response is the product.
- BW units never clump into a homogenous ball; formation, separation, and imperfect unit AI produce organic, never-identical army shapes ("nearly infinite permutations... no army ever looks exactly the same").
- Corollary for SCC: deterministic does NOT mean sterile. Determinism lives in the tick model (P1); variety comes from per-unit separation noise, facing, acceleration, and terrain interaction that is itself seeded. Do not let the deterministic core flatten movement into a sliding blob.
- Anti-pattern that killed SC2's feel for veterans: auto-clumping death ball, single-formation combat, battles decided pre-fight (TL philosophy-of-design thread).

## 2. Simple to read, infinite to master (elegance, not content bloat)
- Veterans' core complaint about modern SC: "making every unit a caster," gimmick creep, lost elegance. Positioning + economy must remain the fundamentals that decide games.
- High ground miss chance, 12-unit control groups, ramp chokes: constraints that create skill layers, not artificial hurdles.
- Corollary for SCC: every slice unit needs a distinct control feel (experiential unit design — think about each unit differently), and the map must create terrain decisions (ramps, chokes, vision lines) that matter mechanically (Phase 0/2 gates already encode this).

## 3. Combat is drama, not arithmetic
- Momentum, comeback potential, visible sacrifice. Losing should feel like a lesson, not a coin flip or a gimmick.
- Attack-move vs hold-position vs stop are qualitatively different commands with different unit behavior. Command choice must have visible personality.
- Corollary for SCC: attack-move/hold/patrol/focus-fire intent states (P2.071) are table stakes; windup telegraphs and impact confirmation (P2.088) make damage readable.

## 4. Audio IS the game (unit voices are culture)
- "In the pipe, five by five", "Ready to work", zerg creep squelch, marine select pitch-shift variety: barks carry personality, state, and reassurance within milliseconds.
- Selection responses vary per voice group and pitch-shift on repeat to avoid repetition fatigue.
- Corollary for SCC: original faction-original barks (P8.235 — never paraphrase Blizzard lines), select/move/attack/damage/irritation categories, bark-density control, terrain-aware impacts. Audio must communicate state blind (blind-ID gates).

## 5. Every unit has a physical identity
- Marines feel fragile-organized; zerglings feel fast-animal; tanks feel heavy-industrial. Sound, animation, acceleration, and impact all agree on the same mass-class story (GameCloud experiential design).
- Corollary for SCC: the current zero-frame-animation state (814 single-frame textures) is the single biggest break of this law. Walk/attack/idle animation + role-scaled acceleration curves (P2.062/63) are non-negotiable, ahead of most polish work.

## 6. The UI has weight and reassurance
- Chunky physical buttons, HUD that answers every question without opening a menu, radar/minimap legible at a glance.
- Corollary for SCC: Phase 7 readability hierarchy + click-onset budgets (p95 <80ms, P8.229).

## 7. Replay/competitive infrastructure = community longevity
- BW survived 20+ years because replays, ladder, custom maps, and casters existed. The Kirch corpus study is literally built from SC replay files.
- Corollary for SCC: golden replays + replay browser (P1.035/P10.286) are not extras; they are the longevity machine.

## Priority overrides this research imposes
1. Sprite animation + organic movement variety (breaks cheap-tell #1) may be promoted out of its phase ONLY as data/render-layer work that cannot touch sim hashes.
2. Barks/audio identity gates stay in Phase 8 but asset generation (free pipeline, original content) may start early in background.
3. Fun gate median >=3.5 on clarity/control/tension/would-play-again is the definition of AAA parity. Automated gates never override a failed human gate.
