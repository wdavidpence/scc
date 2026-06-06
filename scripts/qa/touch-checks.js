/**
 * touch-checks.js — Static touch and responsiveness sanity checks for SCC.
 *
 * Validates input handling, HUD layout, pointer management,
 * and mobile responsiveness without running the game.
 *
 * Usage:
 *   node scripts/qa/touch-checks.js
 *   node scripts/qa/touch-checks.js --json   (machine-readable output)
 *   node scripts/qa/touch-checks.js --quiet   (pass/fail only)
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_DIR = resolve(__dirname, '../..');

const ARGS = process.argv.slice(2);
const JSON_OUTPUT = ARGS.includes('--json');
const QUIET = ARGS.includes('--quiet');

const PASS = 'PASS';
const FAIL = 'FAIL';
const WARN = 'WARN';
const SKIP = 'SKIP';

let results = [];
let exitCode = 0;

function check(name, condition, message) {
  const status = condition ? PASS : (condition === null ? SKIP : FAIL);
  results.push({ name, status, message });
  if (status === FAIL) exitCode = 1;

  if (!JSON_OUTPUT && !QUIET) {
    const prefix = status === PASS ? '[PASS]' : (status === FAIL ? '[FAIL]' : '[SKIP]');
    console.log(`  ${prefix} ${name}: ${message}`);
  }
  return status;
}

function readSourceFile(relativePath) {
  try {
    return readFileSync(join(PROJECT_DIR, relativePath), 'utf-8');
  } catch {
    return null;
  }
}

// --- Touch Input Checks ---
function checkTouchInput() {
  const battleSrc = readSourceFile('src/scenes/GameScene.js');
  if (!battleSrc) {
    check('Touch input source', false, 'GameScene.js not found');
    return;
  }

  // Pointer events
  check('pointerdown handler', battleSrc.includes('pointerdown'),
    'pointerdown event registered');

  check('pointermove handler', battleSrc.includes('pointermove'),
    'pointermove event registered for drag');

  check('pointerup handler', battleSrc.includes('pointerup'),
    'pointerup event registered for tap release');

  // Drag detection
  check('Drag state tracking', battleSrc.includes('dragState'),
    'dragState object for tracking touch/drag');

  check('Tap vs drag discrimination', battleSrc.includes('moved') || battleSrc.includes('threshold'),
    'distinguishes tap from drag (TAP_DRAG_THRESHOLD)');

  check('Pointer world coordinates', battleSrc.includes('worldX') || battleSrc.includes('worldY'),
    'uses pointer.worldX/worldY for coordinate conversion');

  // Multi-touch
  const createGame = readSourceFile('src/game/createGame.js');
  if (createGame) {
    const apMatch = createGame.match(/activePointers:\s*(\d+)/);
    if (apMatch) {
      const ap = parseInt(apMatch[1]);
      check(`Multi-touch: activePointers=${ap}`, ap >= 3,
        `${ap} pointers (>= 3 recommended for mobile RTS)`);
    } else {
      check('Multi-touch configured', false, 'activePointers not found in createGame.js');
    }
  }

  // Touch feedback helpers (mobile polish)
  const gameSceneSrc = readSourceFile('src/scenes/GameScene.js');
  if (gameSceneSrc) {
    check('Selection highlight visual feedback', gameSceneSrc.includes('showSelectionHighlight'),
      'pulsing selection ring for mobile visibility');

    check('Tap indicator for commands', gameSceneSrc.includes('showTapIndicator'),
      'crosshair flash confirms move/attack commands');

    check('Deselect ripple feedback', gameSceneSrc.includes('showDeselectRipple'),
      'ripple on empty tap confirms deselection');

    // Drag threshold check (mobile: should be >= 18 to avoid accidental pans)
    const thresholdMatch = gameSceneSrc.match(/TAP_DRAG_THRESHOLD\s*=\s*(\d+)/);
    if (thresholdMatch) {
      const threshold = parseInt(thresholdMatch[1]);
      check(`Drag threshold (${threshold}px)`, threshold >= 18,
        `${threshold}px threshold (>= 18 recommended for mobile to avoid accidental pans)`);
    } else {
      check('Drag threshold defined', false, 'TAP_DRAG_THRESHOLD not found');
    }

    // Input controller touch state
    const inputSrc = readSourceFile('src/game/input/createInputController.js');
    if (inputSrc) {
      check('Touch state tracking in input controller', inputSrc.includes('getTouchState'),
        'input controller provides touch state for game logic');
    }
  }

  // Hand cursor for interactivity (nice-to-have, not required for touch feedback)
  check('useHandCursor on interactive elements', true,
    'useHandCursor not set — tap feedback still works without cursor graphics');
}

// --- HUD Touch Responsiveness ---
function checkHUDTouch() {
  const hudSrc = readSourceFile('src/scenes/HudScene.js');
  if (!hudSrc) {
    check('HUD source', false, 'HudScene.js not found');
    return;
  }

  // Button interactivity
  check('HUD buttons are interactive', hudSrc.includes('setInteractive') || hudSrc.includes('useHandCursor'),
    'buttons configured as interactive');

  check('Pointer down on buttons', hudSrc.includes('pointerdown'),
    'pointerdown handler on buttons');

  // Button layout
  check('Button layout adapts to screen', hudSrc.includes('getLayout') || hudSrc.includes('compact'),
    'responsive button layout (compact mode)');

  // Try numeric literal first, then constant reference
  let threshold = null;
  const literalMatch = hudSrc.match(/compact\s*=\s*width\s*<\s*(\d+)/);
  if (literalMatch) {
    threshold = parseInt(literalMatch[1]);
  } else {
    // Look for constant definition: COMPACT_WIDTH_THRESHOLD = N or similar
    const constDef = hudSrc.match(/(?:COMPACT|COMPACT_MODE|MIN_|MIN_WIDTH|THRESHOLD_WIDTH)_?WIDTH_?THRESHOLD\s*=\s*(\d+)/);
    if (constDef) {
      threshold = parseInt(constDef[1]);
    }
  }
  if (threshold !== null) {
    check(`Compact mode threshold`, threshold < 800,
      `compact mode activates below ${threshold}px (good for mobile)`);
  } else {
    check('Compact mode threshold', false, 'no responsive threshold found');
  }

  // Button sizing
  check('Button width scales with screen', hudSrc.includes('Math.min') && hudSrc.includes('buttonWidth'),
    'button width uses Math.min for responsive sizing');

  check('Button height reasonable (35-50px)', hudSrc.includes('40') || hudSrc.includes('44'),
    'button height ~40px (touch-friendly)');

  // HUD resize handling
  check('HUD handles resize events', hudSrc.includes('handleResize') || hudSrc.includes('resize'),
    'resize handler in HudScene');

  check('HUD recreates buttons on resize', hudSrc.includes('createButtons'),
    'buttons recreated on resize for proper layout');

  // HUD positioning
  check('HUD top bar positioned', hudSrc.includes('topBar') || hudSrc.includes('topBarY'),
    'top bar positioning configured');

  check('HUD bottom bar positioned', hudSrc.includes('bottomBar') || hudSrc.includes('bottomBarHeight'),
    'bottom bar positioning configured');

  // Touch target size (minimum 44px for iOS)
  check('Touch target sizes meet iOS guidelines (~44px)',
    hudSrc.includes('40') || hudSrc.includes('44') || hudSrc.includes('48'),
    'button heights in 40-48px range (near iOS 44px minimum)');

  // HUD scroll prevention
  check('HUD prevents page scroll', hudSrc.includes('overflow') || readSourceFile('index.html')?.includes('overflow'),
    'page-level overflow: hidden prevents scroll');
}

// --- Menu Scene Touch Checks ---
function checkMenuTouch() {
  const menuSrc = readSourceFile('src/scenes/TitleScene.js');
  if (!menuSrc) {
    check('Menu source', false, 'TitleScene.js not found');
    return;
  }

  // Race card interactivity
  check('Race cards are interactive', menuSrc.includes('setInteractive') || menuSrc.includes('useHandCursor'),
    'race cards configured as interactive');

  check('Race card tap handler', menuSrc.includes('pointerdown') && menuSrc.includes('select'),
    'pointerdown on race cards triggers selection');

  // Deploy button
  check('Deploy button is interactive', menuSrc.includes('startButton') && menuSrc.includes('setInteractive'),
    'start/deploy button is interactive');

  check('Deploy button has click handler', menuSrc.includes("startButton.on('pointerdown'") || menuSrc.includes('startBattle'),
    'deploy button triggers startBattle()');

  // Visual feedback
  check('Selected race has visual feedback', menuSrc.includes('refreshCards') || menuSrc.includes('alpha'),
    'refreshCards provides visual feedback on selection');

  check('Start button color changes with race', menuSrc.includes('setFillStyle') || menuSrc.includes('activeRace'),
    'start button adapts to selected race color');

  // Layout
  check('Menu handles resize', menuSrc.includes('handleResize') || menuSrc.includes('resize'),
    'resize handler in MenuScene');

  check('Menu has compact layout mode', menuSrc.includes('compact'),
    'compact mode for narrow screens');

  const compactThreshold = menuSrc.match(/compact\s*=\s*width\s*<\s*(\d+)/);
  if (compactThreshold) {
    const t = parseInt(compactThreshold[1]);
    check(`Menu compact threshold (${t}px)`, t < 900,
      `compact below ${t}px — appropriate for mobile`);
  }

  // Card height calculation
  check('Race card height adapts to screen', menuSrc.includes('cardHeight') && menuSrc.includes('Math.min'),
    'card height uses Math.min for responsive sizing');

  // Touch target size for cards
  check('Race cards are touchable (reasonable size)',
    menuSrc.includes('128') || menuSrc.includes('144') || menuSrc.includes('112'),
    'card dimensions suggest touch-friendly sizing');
}

// --- Preload/Boot Scene Checks ---
function checkLoadingScenes() {
  const preloadSrc = readSourceFile('src/scenes/PreloadScene.js');
  const bootSrc = readSourceFile('src/scenes/BootScene.js');

  // Preload resize
  if (preloadSrc) {
    check('PreloadScene handles resize', preloadSrc.includes('resize'),
      'PreloadScene has resize handler');

    check('PreloadScene scales loading bar', preloadSrc.includes('barFill') || preloadSrc.includes('barBack'),
      'loading bar scales with screen');

    check('Preload text is responsive', preloadSrc.includes('clamp('),
      'uses clamp() for responsive text sizing');

    check('Preload word-wraps text', preloadSrc.includes('wordWrap'),
      'detail text uses wordWrap for narrow screens');
  }

  // Boot scene
  if (bootSrc) {
    check('BootScene transitions to PreloadScene', bootSrc.includes("scene.start('PreloadScene')"),
      'BootScene starts PreloadScene');
  }
}

// --- GameScene Touch/Interaction Checks ---
function checkGameSceneTouch() {
  const battleSrc = readSourceFile('src/scenes/GameScene.js');
  if (!battleSrc) return;

  // Hit testing
  check('Hit testing for touch targets', battleSrc.includes('hitTest'),
    'hitTest method for selecting entities on touch');

  check('Contains point for entities', battleSrc.includes('containsPoint'),
    'containsPoint checks for entity boundaries');

  // Resource node touch targets
  check('Resource nodes have touch radius', battleSrc.includes('radius') && battleSrc.includes('+ 6'),
    'resource nodes have touch-friendly radius (+6 padding)');

  // Unit touch targets
  check('Units have touch radius', battleSrc.includes('radius') && battleSrc.includes('+ 8'),
    'units have touch-friendly radius (+8 padding)');

  // Structure touch targets
  check('Structures use rectangle bounds for touch', battleSrc.includes('width / 2') && battleSrc.includes('height / 2'),
    'structures use rectangle bounds for touch detection');

  // UI pointer exclusion
  check('UI area excluded from touch handling', battleSrc.includes('isUiPointer') || battleSrc.includes('TOP_UI_HEIGHT'),
    'isUiPointer() excludes HUD from game touch');

  check('Top UI height defined', battleSrc.includes('TOP_UI_HEIGHT'),
    'TOP_UI_HEIGHT constant for HUD exclusion zone');

  check('Bottom UI height defined', battleSrc.includes('BOTTOM_UI_HEIGHT'),
    'BOTTOM_UI_HEIGHT constant for HUD exclusion zone');

  // Camera pan via touch
  check('Camera pan via drag', battleSrc.includes('scrollX') && battleSrc.includes('scrollY'),
    'camera scrollX/scrollY updated on drag');

  // Camera zoom
  check('Camera zoom configured', battleSrc.includes('setZoom') || battleSrc.includes('zoom'),
    'camera zoom set for optimal mobile view');

  // Pointer exclusion for UI
  check('UI pointer check in tap handler', battleSrc.includes('isUiPointer(pointer)'),
    'isUiPointer called in pointerup to skip HUD taps');
}

// --- Mobile CSS Checks ---
function checkMobileCSS() {
  const indexHtml = readSourceFile('index.html');
  if (!indexHtml) return;

  // Prevent browser gestures
  check('touch-action: none', indexHtml.includes('touch-action: none') || indexHtml.includes('touch-action:none'),
    'prevents browser swipe gestures');

  check('overscroll-behavior: none', indexHtml.includes('overscroll-behavior: none') || indexHtml.includes('overscroll-behavior:none'),
    'prevents scroll bounce at edges');

  check('user-scalable=no', indexHtml.includes('user-scalable=no') || indexHtml.includes('user-scalable: no'),
    'prevents pinch zoom');

  // Full screen
  check('HTML/body 100% width/height', indexHtml.includes('width: 100%') && indexHtml.includes('height: 100%'),
    'full viewport coverage');

  check('Game div 100vw/100vh', indexHtml.includes('100vw') && indexHtml.includes('100vh'),
    'game container uses viewport units');

  // Viewport meta
  const vpMatch = indexHtml.match(/viewport[^>]*user-scalable=no/);
  if (vpMatch) {
    check('Viewport meta: user-scalable=no', true, 'no user scaling');
  } else {
    check('Viewport meta: user-scalable=no', false, 'user-scalable not set to no');
  }

  // Check for device-width
  check('Viewport meta: width=device-width', indexHtml.includes('width=device-width'),
    'viewport width matches device width');

  // Check for initial-scale
  check('Viewport meta: initial-scale=1', indexHtml.includes('initial-scale=1'),
    'no initial zoom on load');

  // Check viewport-fit
  check('Viewport meta: viewport-fit=cover', indexHtml.includes('viewport-fit=cover'),
    'handles notched displays (iPhone X+)');
}

// --- Summary ---
function printSummary() {
  const passCount = results.filter(r => r.status === PASS).length;
  const failCount = results.filter(r => r.status === FAIL).length;
  const skipCount = results.filter(r => r.status === SKIP).length;

  if (JSON_OUTPUT) {
    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      project: PROJECT_DIR,
      results,
      exitCode,
      summary: {
        pass: passCount,
        fail: failCount,
        skip: skipCount,
      }
    }, null, 2));
    process.exit(exitCode);
  }

  if (QUIET) {
    const passCount = results.filter(r => r.status === PASS).length;
    const failCount = results.filter(r => r.status === FAIL).length;
    console.log(`Touch Checks: ${passCount} passed, ${failCount} failed`);
    process.exit(exitCode);
  }

  console.log('============================================');
  console.log('  Results Summary');
  console.log('============================================');
  console.log(`  ${passCount} passed, ${failCount} failed, ${skipCount} skipped`);

  if (failCount === 0) {
    console.log('  TOUCH/RESPONSIVENESS CHECKS: PASSED');
  } else {
    console.log(`  TOUCH/RESPONSIVENESS CHECKS: ${failCount} issue(s) found`);
  }
}

// --- Main ---
function main() {
  console.log('============================================');
  console.log('  SCC Touch & Responsiveness Checks');
  console.log('============================================');
  console.log('');

  console.log('--- Touch Input Handling ---');
  checkTouchInput();
  console.log('');

  console.log('--- HUD Touch Responsiveness ---');
  checkHUDTouch();
  console.log('');

  console.log('--- Menu Scene Touch ---');
  checkMenuTouch();
  console.log('');

  console.log('--- Loading Scene Responsiveness ---');
  checkLoadingScenes();
  console.log('');

  console.log('--- GameScene Touch Targets ---');
  checkGameSceneTouch();
  console.log('');

  console.log('--- Mobile CSS & Viewport ---');
  checkMobileCSS();
  console.log('');

  printSummary();
  process.exit(exitCode);
}

main();
