# SCC Pre-Backup QA Checklist

> Copy this checklist before every milestone backup or release.
> Run `./scripts/qa/run-qa.sh` to auto-validate. Fill in the manual items below.

---

## Quick Run (Automated)

- [ ] `./scripts/qa/run-qa.sh` — full QA suite
- [ ] `./scripts/qa/run-qa.sh --skip-build` — skip build (code-only changes)
- [ ] Review reports in `backups/qa-reports/`

---

## Phase 1: Build Verification

- [ ] `npm run build` exits with code 0
- [ ] `dist/index.html` exists and is not empty
- [ ] JS bundles present in `dist/`
- [ ] No single file exceeds 2 MB
- [ ] Total `dist/` size under 5 MB
- [ ] Viewport meta tag preserved in build
- [ ] iOS PWA meta tags present
- [ ] `touch-action: none` present in build
- [ ] Phaser reference present in build

---

## Phase 2: Gameplay Sanity

### Race Data
- [ ] All 3 races (Terran, Zerg, Protoss) defined
- [ ] Each race has: name, accent, glow, backdrop, commandCenterName, productionName
- [ ] Each race has: startMinerals, startSupplyCap, startWorkers, startSoldiers
- [ ] Each race has structures (commandCenter + production)
- [ ] Each race has units (worker, soldier, enemySoldier)
- [ ] Start minerals >= 400 for all races
- [ ] Supply cap between 8-15 for all races
- [ ] Workers >= soldiers for all races
- [ ] Soldier cost >= worker cost for all races
- [ ] All unit HP values positive
- [ ] All unit speed values positive
- [ ] Races have distinct accent colors and backdrops

### Scenes
- [ ] All 5 scenes present (Boot, Preload, Menu, Battle, Hud)
- [ ] All scenes extend Phaser.Scene
- [ ] All scenes have create() method
- [ ] Non-Boot scenes handle resize (BootScene is intentionally minimal — just transitions to Preload)
- [ ] createGame.js imports and registers all scenes
- [ ] Scene order: Boot → Preload → Menu → Battle → Hud

### Game Logic
- [ ] World dimensions defined (wider than tall)
- [ ] Camera clamping implemented
- [ ] Pointer/touch input handled (pointerdown, pointermove, pointerup)
- [ ] Drag detection with threshold (tap vs drag)
- [ ] Keyboard input supported (WASD + cursors)
- [ ] Resource node system present
- [ ] Unit system (player + enemy)
- [ ] Structure system with createStructure
- [ ] Construction/building system
- [ ] Victory/defeat conditions
- [ ] Enemy AI / wave spawning
- [ ] Mineral economy (player + enemy)
- [ ] Supply system (cap + usage)
- [ ] HudScene launched from BattleScene
- [ ] Session sync for HUD updates
- [ ] Game update loop (update method)
- [ ] Pause/resume functionality
- [ ] Entity destruction/cleanup

### HUD
- [ ] All 7 command buttons present (select, move, attack, train-worker, train-soldier, build-production, pause)
- [ ] HUD displays minerals and supply
- [ ] HUD has selection panel
- [ ] HUD has game log
- [ ] HUD handles resize

---

## Phase 3: Touch & Responsiveness

### Touch Input
- [ ] pointerdown, pointermove, pointerup handlers in BattleScene
- [ ] Drag state tracking (tap vs discrimination)
- [ ] Multi-touch: activePointers >= 3
- [ ] Hand cursor on interactive elements

### HUD Touch
- [ ] Buttons are interactive with pointerdown
- [ ] Responsive button layout (compact mode)
- [ ] Button width scales with screen
- [ ] Touch target sizes ~40-48px (near iOS 44px)
- [ ] HUD handles resize events
- [ ] Buttons recreated on resize

### Menu Scene
- [ ] Race cards are interactive
- [ ] Deploy button is interactive with click handler
- [ ] Visual feedback on race selection
- [ ] Responsive layout (compact mode)
- [ ] Touch-friendly card sizes

### Mobile CSS
- [ ] `touch-action: none` in CSS
- [ ] `overscroll-behavior: none` in CSS
- [ ] `user-scalable=no` in viewport meta
- [ ] Full viewport coverage (100vw/100vh)
- [ ] Viewport: `width=device-width, initial-scale=1`
- [ ] `viewport-fit=cover` for notched displays

### GameScene Touch
- [ ] Hit testing for touch targets
- [ ] Resource nodes have touch radius
- [ ] Units have touch radius
- [ ] Structures use rectangle bounds
- [ ] UI area excluded from game touch (isUiPointer)
- [ ] Camera pan via drag
- [ ] Camera zoom configured

---

## Phase 4: Manual Sanity Play

> Run the game in a browser or on a device and verify:

- [ ] Game loads without console errors
- [ ] Loading screen displays and transitions to menu
- [ ] Race selection menu renders correctly on mobile viewport
- [ ] Can select all 3 races (Terran, Zerg, Protoss)
- [ ] Deploy button changes color per race
- [ ] Battle scene loads after deploy
- [ ] Can tap units and structures to select
- [ ] Can tap empty ground to move selected units
- [ ] Drag on battlefield pans camera
- [ ] HUD buttons appear and are functional
- [ ] Resource display updates (minerals, supply)
- [ ] Selection panel shows correct info
- [ ] Game log displays messages
- [ ] Pause/resume works
- [ ] Enemy waves spawn and attack
- [ ] Workers harvest minerals
- [ ] Construction completes and becomes operational
- [ ] Victory/defeat triggers correctly
- [ ] Game returns to menu after battle ends
- [ ] No visual glitches or clipping on mobile viewport
- [ ] No JS errors in browser console

---

## Phase 5: Pre-Backup Actions

- [ ] All QA checks passed (automated + manual)
- [ ] Git working tree is clean (or uncommitted changes documented)
- [ ] `./scripts/backup.sh <tag>` — create milestone backup
- [ ] `./scripts/sync.sh <tag>` — push to GitHub
- [ ] Tag appears in GitHub tags

---

## Notes

---

*Generated by SCC QA harness. Last run: ___________*
*Checked by: ___________*
*Date: ___________*
