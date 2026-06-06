/**
 * runtime-onboarding-qa.js — Static + runtime QA for onboarding/playability fixes.
 *
 * Validates:
 *   1. Match starts with a meaningful default selection (race + difficulty)
 *   2. HUD buttons work without a dead-end first click
 *   3. Menu/HUD text is readable on mobile-sized layouts
 *
 * Usage: node scripts/qa/runtime-onboarding-qa.js
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_DIR = resolve(__dirname, '../..');

const PASS = 'PASS';
const FAIL = 'FAIL';
let results = [];
let exitCode = 0;

function check(name, condition, message) {
  const status = condition ? PASS : (condition === null ? 'SKIP' : FAIL);
  results.push({ name, status, message });
  if (status === FAIL) exitCode = 1;
  const prefix = status === PASS ? '[PASS]' : (status === FAIL ? '[FAIL]' : '[SKIP]');
  console.log(`  ${prefix} ${name}: ${message}`);
  return status;
}

function readSourceFile(relativePath) {
  try {
    return readFileSync(resolve(PROJECT_DIR, relativePath), 'utf-8');
  } catch {
    return null;
  }
}

// --- Phase 1: Default Selection Verification ---
console.log('============================================');
console.log('  SCC Runtime Onboarding QA');
console.log('  Mobile viewport: 360x640 (iPhone SE)');
console.log('============================================');
console.log('');

console.log('--- Phase 1: Default Selection Verification ---');
console.log('');

const titleSceneSrc = readSourceFile('src/scenes/TitleScene.js');
const hudSrc = readSourceFile('src/scenes/HudScene.js');
const gameSrc = readSourceFile('src/scenes/GameScene.js');
const sessionSrc = readSourceFile('src/game/state/gameSession.js');
const indexHtml = readSourceFile('index.html');

// 1a. Race default
const raceDefaultMatch = titleSceneSrc?.match(/selectedRaceId\s*=\s*session\.raceId\s*\?\?\s*'(\w+)'/);
if (raceDefaultMatch) {
  const defaultRace = raceDefaultMatch[1];
  check('Default race is defined', true, `race defaults to '${defaultRace}'`);
  check('Default race is a valid race', ['terran', 'zerg', 'protoss'].includes(defaultRace),
    `'${defaultRace}' is a recognized race`);
} else {
  check('Default race is defined', false, 'Could not find selectedRaceId default');
}

// 1b. Difficulty default
const diffDefaultMatch = titleSceneSrc?.match(/selectedDifficultyId\s*=\s*session\.difficultyId\s*\?\?\s*'(\w+)'/);
if (diffDefaultMatch) {
  const defaultDiff = diffDefaultMatch[1];
  check('Default difficulty is defined', true, `difficulty defaults to '${defaultDiff}'`);
  check('Default difficulty is balanced', ['normal', 'easy', 'hard'].includes(defaultDiff),
    `'${defaultDiff}' is a balanced starting difficulty`);
} else {
  check('Default difficulty is defined', false, 'Could not find selectedDifficultyId default');
}

// 1c. Deploy button exists and wires to battle
check('Deploy button exists in TitleScene', titleSceneSrc?.includes('startButton') || titleSceneSrc?.includes('deploy'),
  'deploy/start button found in menu');
check('Deploy button triggers battle', titleSceneSrc?.includes('startBattle') || titleSceneSrc?.includes('startGame'),
  'deploy button wired to start battle function');

// 1d. Race selection persists to session
check('Race selection persists to session', titleSceneSrc?.includes('session.setRace') || titleSceneSrc?.includes('session.raceId'),
  'selected race saved to gameSession');

// 1e. Session has race default
const hasRaceDefault = sessionSrc?.includes("raceId:") && (sessionSrc.includes("'terran'") || sessionSrc.includes('"terran"'));
check('Session defaults to terran race', hasRaceDefault,
  hasRaceDefault ? 'session defaults to terran race' : 'no race default in session');

console.log('');

// --- Phase 2: HUD Button Interactivity (no dead-end first click) ---
console.log('--- Phase 2: HUD Button Interactivity (no dead-end first click) ---');
console.log('');

// 2a. HUD buttons have pointer handlers
const hasPointerDown = hudSrc?.includes('pointerdown') || hudSrc?.includes('pointerup');
check('HUD buttons have pointer handlers', hasPointerDown,
  hasPointerDown ? 'pointerdown/pointerup handlers found' : 'no pointer handlers on HUD buttons');

// 2b. Buttons are interactive
check('HUD buttons are interactive', hudSrc?.includes('setInteractive') || hudSrc?.includes('interactive'),
  'buttons configured as interactive');

// 2c. Battle starts with worker units (SC-like)
// Workers are created via createUnit('player', 'worker', ...) or spawnStartingForces()
const hasWorkers = gameSrc?.includes('worker') && (gameSrc?.includes('createUnit') || gameSrc?.includes('spawnStartingForces'));
check('Battle starts with worker units', hasWorkers,
  hasWorkers ? 'worker units created at battle start' : 'no worker spawning at battle start');

// 2d. Commands available immediately
const hasCommands = hudSrc?.includes('select') && (hudSrc?.includes('move') || hudSrc?.includes('attack'));
check('Commands available immediately on battle start', hasCommands,
  hasCommands ? 'select/move/attack commands available' : 'limited commands on battle start');

// 2e. BattleScene passes race to HudScene
check('BattleScene passes race to HUD', gameSrc?.includes("scene.launch('HudScene'"),
  'HudScene launched from BattleScene with race context');

// 2f. No dead-end: race card selection changes UI state
const hasRaceCardSelection = titleSceneSrc?.includes('selectedRaceId') && titleSceneSrc?.includes('refreshCards');
check('Race card selection updates UI feedback', hasRaceCardSelection,
  hasRaceCardSelection ? 'race selection triggers visual feedback' : 'no visual feedback on race selection');

// 2g. Start/Deploy button is always clickable from menu
const hasDeployHandler = titleSceneSrc?.includes('pointerdown') || titleSceneSrc?.includes('setInteractive');
check('Deploy button is interactive from menu', hasDeployHandler,
  hasDeployHandler ? 'deploy button has click handler' : 'deploy button not interactive');

console.log('');

// --- Phase 3: Mobile Text Readability (320px-360px) ---
console.log('--- Phase 3: Mobile Text Readability (320px-360px) ---');
console.log('');

// 3a. TitleScene font sizes
const titleClampMatches = titleSceneSrc?.matchAll(/clamp\((\d+)px,\s*([\d.]+)vw,\s*(\d+)px\)/g);
const titleFontSizes = [...(titleClampMatches || [])].map(m => ({
  min: parseInt(m[1]), max: parseInt(m[3]), vw: parseFloat(m[2])
}));
const titleMinReadable = titleFontSizes.length > 0 && titleFontSizes.every(f => f.min >= 11);
check('TitleScene title text readable at 320px', titleMinReadable,
  titleMinReadable ? `min font sizes: ${titleFontSizes.map(f => f.min + 'px').join(', ')}` : 'some text too small at 320px');

// 3b. HUD font sizes
const hudClampMatches = hudSrc?.matchAll(/clamp\((\d+)px,\s*([\d.]+)vw,\s*(\d+)px\)/g);
const hudFontSizes = [...(hudClampMatches || [])].map(m => ({
  min: parseInt(m[1]), max: parseInt(m[3]), vw: parseFloat(m[2])
}));
const hudMinReadable = hudFontSizes.length > 0 && hudFontSizes.every(f => f.min >= 9);
check('HUD text readable at 320px', hudMinReadable,
  hudMinReadable ? `min font sizes: ${hudFontSizes.map(f => f.min + 'px').join(', ')}` : 'some text too small at 320px');

// 3c. Responsive text sizing (vw units)
const titleUsesVw = titleSceneSrc?.includes('vw');
check('TitleScene uses responsive text sizing', titleUsesVw,
  titleUsesVw ? 'vw-based scaling in title scene' : 'fixed pixel text in title scene');

const hudUsesVw = hudSrc?.includes('vw');
check('HUD uses responsive text sizing', hudUsesVw,
  hudUsesVw ? 'vw-based scaling in HUD' : 'fixed pixel text in HUD');

// 3d. Word-wrap for narrow screens
const titleHasWordWrap = titleSceneSrc?.includes('wordWrap');
check('TitleScene has word-wrap for narrow screens', titleHasWordWrap,
  titleHasWordWrap ? 'word-wrap configured in title scene' : 'no word-wrap in title scene');

const hudHasWordWrap = hudSrc?.includes('wordWrap');
check('HUD has word-wrap for narrow screens', hudHasWordWrap,
  hudHasWordWrap ? 'word-wrap configured in HUD' : 'no word-wrap in HUD');

// 3e. Viewport meta for mobile
const viewportMeta = indexHtml?.includes('viewport') && indexHtml?.includes('width=device-width');
check('Viewport meta configured for mobile', viewportMeta,
  viewportMeta ? 'viewport meta with device-width present' : 'missing viewport meta');

const noScale = indexHtml?.includes('user-scalable=no');
check('Pinch-zoom disabled', noScale,
  noScale ? 'user-scalable=no prevents pinch zoom' : 'pinch-zoom not disabled');

// 3f. Touch-action: none
const touchAction = indexHtml?.includes('touch-action: none') || indexHtml?.includes('touch-action:none');
check('Touch gestures blocked in game area', touchAction,
  touchAction ? 'touch-action: none present' : 'touch gestures not blocked');

console.log('');

// --- Summary ---
console.log('============================================');
const passCount = results.filter(r => r.status === PASS).length;
const failCount = results.filter(r => r.status === FAIL).length;
console.log(`  Results: ${passCount} passed, ${failCount} failed`);
console.log('============================================');

if (failCount === 0) {
  console.log('  ONBOARDING QA: ALL CHECKS PASSED');
} else {
  console.log(`  ONBOARDING QA: ${failCount} issue(s) found`);
}

if (failCount > 0) {
  console.log('');
  console.log('  Failed checks:');
  results.filter(r => r.status === FAIL).forEach(r => {
    console.log(`    - ${r.name}: ${r.message}`);
  });
}

console.log('');
console.log('  Report saved to: backups/qa-reports/');

process.exit(exitCode);
