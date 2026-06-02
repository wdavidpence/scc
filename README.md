# SCC

SCC is a mobile-first HTML5 RTS prototype inspired by the classic 1998 era of real-time strategy games.

Current goals:
- Phaser 3.x + Vite foundation
- three playable races: Terran, Zerg, Protoss
- single-player skirmish flow
- touch-friendly selection and command HUD
- data-driven units, structures, and balance
- iterative Kanban-driven development

## Run locally

```bash
npm install
npm run dev
```

## Build for production

```bash
npm run build
```

## Project layout

- `src/main.js` — entry point
- `src/game/createGame.js` — Phaser bootstrap
- `src/game/state/gameSession.js` — shared session state and UI snapshots
- `src/game/data/races.js` — race definitions and balance data
- `src/scenes/BootScene.js` — startup handoff
- `src/scenes/PreloadScene.js` — brand/loading screen
- `src/scenes/TitleScene.js` — race-select menu scene
- `src/scenes/GameScene.js` — main battle scene
- `src/scenes/HudScene.js` — mobile HUD and command panel

## Controls

- Tap a unit or structure to select it
- Tap empty ground to move selected combat units
- Use the HUD buttons for attack, train, and build actions
- Drag on the battlefield to pan the camera
- Use WASD or arrow keys on desktop to pan the view

## Notes

This repo is intended to be backed by GitHub and managed through Hermes Kanban with small, testable cards.
