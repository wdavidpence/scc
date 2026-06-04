# SCC Smoke-Check Checklist

> Reusable pre-release / pre-merge checklist. Do not change code — verify only.
> Last updated: 2026-06-02

---

## 0. Prerequisites

- Node.js installed (v18+ recommended)
- `npm` available
- Git repo initialized and clean (or changes documented)

---

## 1. Build Commands (exact)

```bash
# Install deps (first time or after package.json changes)
npm install

# Full QA suite (build + gameplay + touch)
./scripts/qa/run-qa.sh

# Build-only (skip QA)
npm run build

# Runtime smoke test (spins up http-server, checks endpoints)
./scripts/qa/smoke-test.sh

# JSON-mode (machine-readable output)
./scripts/qa/run-qa.sh --json
./scripts/qa/smoke-test.sh --json
```

### Flags reference

| Flag | Effect |
|---|---|
| `--skip-build` | Skip `npm run build` (use when only source changed) |
| `--skip-gameplay` | Skip static gameplay checks |
| `--skip-touch` | Skip static touch/responsiveness checks |
| `--json` | Machine-readable JSON output (all QA scripts) |
| `--quiet` | Pass/fail only, no detail (gameplay + touch scripts) |
| `--skip-install` | Skip `npm install` (build script only) |
| `--quick` | Only check dist/ exists (build script only) |
| `--port NN` | Use specific port for smoke test |

---

## 2. Pass/Fail Criteria

| Check | Pass | Fail |
|---|---|---|
| `npm run build` | Exit code 0 | Non-zero exit |
| `dist/index.html` exists | File present, > 100 bytes | Missing or empty |
| JS bundles in `dist/` | At least one `.js` in `dist/assets/` | No JS found |
| JS bundle references Phaser | `phaser` string in bundle | No Phaser reference |
| `dist/` total size | Under 5 MB | Over 5 MB |
| No file > 2 MB (excl. .map) | All files <= 2 MB | Any file > 2 MB |
| Viewport meta in build | `viewport` present in `dist/index.html` | Missing |
| iOS PWA meta in build | `apple-mobile-web-app-capable` present | Missing |
| `touch-action: none` in build | Present in `dist/index.html` | Missing |
| `./scripts/qa/run-qa.sh` | Exit code 0, 0 failures | Any [FAIL] lines |
| `./scripts/qa/smoke-test.sh` | Exit code 0, 0 failures | Any [FAIL] lines |
| All 3 races defined | terran, zerg, protoss present | Missing race |
| All 5 scenes registered | Boot, Preload, Menu, Battle, Hud | Missing scene |

---

## 3. Quick Mobile Sanity Checks (5-10)

Run the build, open `dist/index.html` in a mobile browser (or device simulator), then verify:

1. **Game loads without console errors** — open DevTools console; no red errors.
2. **Loading screen displays and transitions to menu** — PreloadScene shows progress, then TitleScene renders.
3. **Race selection menu renders correctly on mobile viewport** — all 3 race cards visible, no clipping.
4. **Can select all 3 races** — tap Terran, Zerg, Protoss; deploy button color updates per race.
5. **Battle scene loads after deploy** — no crash, HUD appears, units visible on map.
6. **Tap units/structures to select** — selection panel shows correct info (label, HP, details).
7. **Tap ground to move combat units** — units respond to tap commands.
8. **Drag on battlefield pans camera** — smooth camera movement, no UI overlap.
9. **HUD buttons are functional** — select, move, attack, train-worker, train-soldier, build-production, pause all respond to touch.
10. **No visual glitches or clipping on mobile viewport** — full screen, no content cut off at edges.

---

## 4. Mobile Device Checks (optional, when device available)

- Test on at least one iOS device (Safari) and one Android device (Chrome).
- Verify notched displays handled correctly (`viewport-fit=cover`).
- Verify no pinch-zoom or scroll-bounce behavior.
- Verify touch targets feel natural (button heights ~40-48px).
- Verify game runs at 60fps during active combat (no frame drops).

---

## 5. Report Locations

All QA reports are saved to:
`backups/qa-reports/<timestamp>-<phase>.txt`

Latest reports listed by the master runner after each run.

---

## 6. Quick Reference

| Script | Purpose |
|---|---|
| `scripts/qa/verify-build.sh` | Build verification (deps, build, dist, source integrity) |
| `scripts/qa/gameplay-checks.js` | Static gameplay sanity (race data, scenes, logic) |
| `scripts/qa/touch-checks.js` | Static touch/responsiveness sanity |
| `scripts/qa/smoke-test.sh` | Runtime smoke test (http-server + endpoint checks) |
| `scripts/qa/release-gate.sh` | Full release gate (all checks + manual sign-off) |
| `scripts/qa/run-qa.sh` | Master runner (orchestrates all above) |
| `backups/QA_CHECKLIST.md` | Pre-backup detailed checklist |
| `backups/SMOKE_CHECKLIST.md` | This file — quick smoke check |

---

*Checklist generated from the SCC project structure on 2026-06-02.*
