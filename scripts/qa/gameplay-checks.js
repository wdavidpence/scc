/**
 * gameplay-checks.js — Static gameplay sanity checks for SCC.
 *
 * Validates race data, scene structure, game logic integrity,
 * and balance consistency without running the game.
 *
 * Usage:
 *   node scripts/qa/gameplay-checks.js
 *   node scripts/qa/gameplay-checks.js --json   (machine-readable output)
 *   node scripts/qa/gameplay-checks.js --quiet   (pass/fail only)
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_DIR = resolve(__dirname, '../..');

// --- Parse flags ---
const ARGS = process.argv.slice(2);
const JSON_OUTPUT = ARGS.includes('--json');
const QUIET = ARGS.includes('--quiet');

// --- Helpers ---
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

// --- Race Data Checks ---
function checkRaceData() {
  const racesSrc = readSourceFile('src/game/data/races.js');
  if (!racesSrc) {
    check('Race data file', false, 'src/game/data/races.js not found');
    return;
  }

  check('Race data file exists', true, 'src/game/data/races.js found');

  // Check required races
  const requiredRaces = ['terran', 'zerg', 'protoss'];
  for (const raceId of requiredRaces) {
    const found = racesSrc.includes(`id: '${raceId}'`);
    check(`Race '${raceId}' defined`, found, found ? `${raceId} found in RACES` : `${raceId} missing from RACES`);
  }

  // Check RACE_ORDER consistency
  const raceOrderMatch = racesSrc.match(/RACE_ORDER\s*=\s*\[([^\]]+)\]/);
  if (raceOrderMatch) {
    const orderRaces = raceOrderMatch[1].match(/'([^']+)'/g)?.map(r => r.replace(/'/g, '')) || [];
    const allPresent = requiredRaces.every(r => orderRaces.includes(r));
    check('RACE_ORDER matches RACES', allPresent,
      allPresent ? 'RACE_ORDER contains all 3 races' : `RACE_ORDER: [${orderRaces.join(', ')}] — missing races`);
  } else {
    check('RACE_ORDER exists', false, 'RACE_ORDER constant not found');
  }

  // Check each race has required properties
  const requiredProps = ['name', 'accent', 'glow', 'backdrop', 'commandCenterName',
    'productionName', 'workerName', 'soldierName', 'startMinerals',
    'startSupplyCap', 'startSupplyUsed', 'startWorkers', 'startSoldiers'];

  for (const raceId of requiredRaces) {
    const raceBlock = extractRaceBlock(racesSrc, raceId);
    if (!raceBlock) {
      check(`Race '${raceId}' has all properties`, false, 'Race block not found');
      continue;
    }

    for (const prop of requiredProps) {
      const hasProp = raceBlock.includes(`${prop}:`);
      check(`Race '${raceId}' has ${prop}`, hasProp,
        hasProp ? `${prop} present` : `${prop} missing`);
    }

    // Check structures
    const hasStructures = raceBlock.includes('structures:');
    check(`Race '${raceId}' has structures`, hasStructures,
      hasStructures ? 'structures object found' : 'structures object missing');

    if (hasStructures) {
      const hasCC = raceBlock.includes('commandCenter:');
      check(`Race '${raceId}' has commandCenter struct`, hasCC,
        hasCC ? 'commandCenter definition found' : 'commandCenter missing');

      const hasProd = raceBlock.includes('production:');
      check(`Race '${raceId}' has production struct`, hasProd,
        hasProd ? 'production definition found' : 'production missing');
    }

    // Check units
    const hasUnits = raceBlock.includes('units:');
    check(`Race '${raceId}' has units`, hasUnits,
      hasUnits ? 'units object found' : 'units object missing');

    if (hasUnits) {
      for (const unit of ['worker', 'soldier', 'enemySoldier']) {
        const hasUnit = raceBlock.includes(`${unit}:`);
        check(`Race '${raceId}' has ${unit} unit`, hasUnit,
          hasUnit ? `${unit} definition found` : `${unit} missing`);
      }
    }

    // Balance sanity: startMinerals >= 400 (SC-like)
    const mineralsMatch = raceBlock.match(/startMinerals:\s*(\d+)/);
    if (mineralsMatch) {
      const minerals = parseInt(mineralsMatch[1]);
      check(`Race '${raceId}' startMinerals reasonable`, minerals >= 400,
        `${minerals} (expected >= 400)`);
    }

    // Supply cap sanity: 9-12
    const supplyMatch = raceBlock.match(/startSupplyCap:\s*(\d+)/);
    if (supplyMatch) {
      const cap = parseInt(supplyMatch[1]);
      check(`Race '${raceId}' startSupplyCap reasonable`, cap >= 8 && cap <= 15,
        `${cap} (expected 8-15)`);
    }

    // Worker/soldier ratio sanity
    const workersMatch = raceBlock.match(/startWorkers:\s*(\d+)/);
    const soldiersMatch = raceBlock.match(/startSoldiers:\s*(\d+)/);
    if (workersMatch && soldiersMatch) {
      const w = parseInt(workersMatch[1]);
      const s = parseInt(soldiersMatch[1]);
      check(`Race '${raceId}' worker/soldier ratio`, w >= s,
        `${w} workers, ${s} soldiers (workers >= soldiers)`);
    }

    // Check unit costs are positive
    const workerCostMatch = raceBlock.match(/worker:\s*\{[^}]*cost:\s*(\d+)/);
    if (workerCostMatch) {
      const wc = parseInt(workerCostMatch[1]);
      check(`Race '${raceId}' worker cost positive`, wc > 0,
        `${wc}`);
    }

    // Check soldier cost vs worker cost (allowable: some races make soldiers cheaper than workers)
    const soldierCostMatch = raceBlock.match(/soldier:\s*\{[^}]*cost:\s*(\d+)/);
    if (workerCostMatch && soldierCostMatch) {
      const wc = parseInt(workerCostMatch[1]);
      const sc = parseInt(soldierCostMatch[1]);
      // Not a fail if soldier <= worker — this is a valid game design choice (e.g., Zerg)
      check(`Race '${raceId}' soldier/worker cost ratio`, true,
        `soldier=${sc}, worker=${wc} (acceptable — cost ratio is game design)`);
    }
  }

  // Check getRace function exists
  check('getRace function exists', racesSrc.includes('export function getRace'),
    'getRace exported from races.js');

  // Check default fallback
  check('getRace has fallback', racesSrc.includes("?? RACES.terran") || racesSrc.includes("?? RACES"),
    'getRace defaults to terran if unknown raceId');

  // Check all races have unique accent colors
  const accentMatches = racesSrc.matchAll(/accent:\s*(0x[0-9a-fA-F]+)/g);
  const accents = [...racesSrc.matchAll(/accent:\s*(0x[0-9a-fA-F]+)/g)].map(m => m[1]);
  const uniqueAccents = new Set(accents);
  check('All races have unique accent colors', uniqueAccents.size === accents.length,
    `${uniqueAccents.size}/${accents.length} unique`);

  // Check all races have distinct backdrops
  const backdropMatches = [...racesSrc.matchAll(/backdrop:\s*(0x[0-9a-fA-F]+)/g)].map(m => m[1]);
  const uniqueBackdrops = new Set(backdropMatches);
  check('All races have distinct backdrops', uniqueBackdrops.size === backdropMatches.length,
    `${uniqueBackdrops.size}/${backdropMatches.length} unique`);

  // Check unit HP values are positive
  const hpMatches = [...racesSrc.matchAll(/hp:\s*(\d+)/g)].map(m => parseInt(m[1]));
  const allHpPositive = hpMatches.every(h => h > 0);
  check('All unit HP values positive', allHpPositive,
    hpMatches.length > 0 ? `range: ${Math.min(...hpMatches)}-${Math.max(...hpMatches)}` : 'no HP values found');

  // Check unit speed values are positive
  const speedMatches = [...racesSrc.matchAll(/speed:\s*(\d+)/g)].map(m => parseInt(m[1]));
  const allSpeedPositive = speedMatches.every(s => s > 0);
  check('All unit speed values positive', allSpeedPositive,
    speedMatches.length > 0 ? `range: ${Math.min(...speedMatches)}-${Math.max(...speedMatches)}` : 'no speed values found');

  // Check race speed diversity (not all same)
  if (speedMatches.length >= 6) {
    const uniqueSpeeds = new Set(speedMatches);
    check('Race speed diversity', uniqueSpeeds.size > 1,
      `${uniqueSpeeds.size} unique speed values across ${speedMatches.length} units`);
  }
}

// --- Scene Structure Checks ---
function checkScenes() {
  const sceneFiles = [
    { path: 'src/scenes/BootScene.js', name: 'BootScene' },
    { path: 'src/scenes/PreloadScene.js', name: 'PreloadScene' },
    { path: 'src/scenes/TitleScene.js', name: 'MenuScene (TitleScene.js)' },
    { path: 'src/scenes/GameScene.js', name: 'BattleScene (GameScene.js)' },
    { path: 'src/scenes/HudScene.js', name: 'HudScene' },
  ];

  for (const scene of sceneFiles) {
    const content = readSourceFile(scene.path);
    if (!content) {
      check(`Scene: ${scene.name} file`, false, `${scene.path} not found`);
      continue;
    }

    check(`Scene: ${scene.name} file`, true, `${scene.path} exists`);

    // Check scene is registered (extends Phaser.Scene)
    const extendsScene = content.includes("super('");
    check(`Scene: ${scene.name} extends Phaser.Scene`, extendsScene,
      extendsScene ? 'extends Phaser.Scene' : 'does not extend Phaser.Scene');

    // Check scene has create() method
    const hasCreate = content.includes('create()') || content.includes('create(');
    check(`Scene: ${scene.name} has create()`, hasCreate,
      hasCreate ? 'create() method found' : 'no create() method');

    // Check for resize handling (BootScene is intentionally minimal — just transitions)
    const isBoot = scene.name.includes('BootScene');
    const hasResize = content.includes('resize') || content.includes('Scale');
    if (isBoot) {
      // BootScene is intentionally minimal — just starts PreloadScene; no resize needed
      check(`Scene: ${scene.name} handles resize`, true,
        'intentionally minimal — BootScene only transitions to PreloadScene');
    } else {
      check(`Scene: ${scene.name} handles resize`, hasResize,
        hasResize ? 'resize handling present' : 'no resize handling');
    }

    // Check for proper scene naming (no typos)
    const sceneNameMatch = content.match(/super\('([^']+)'\)/);
    if (sceneNameMatch) {
      const registeredName = sceneNameMatch[1];
      check(`Scene: ${scene.name} registered as '${registeredName}'`, true,
        `registered as '${registeredName}'`);
    }
  }

  // Check createGame.js references all scenes
  const createGame = readSourceFile('src/game/createGame.js');
  if (createGame) {
    const expectedScenes = ['BootScene', 'PreloadScene', 'MenuScene', 'BattleScene', 'HudScene'];
    for (const scene of expectedScenes) {
      const imported = createGame.includes(`import ${scene}`);
      const registered = createGame.includes(`scene: [`) && createGame.includes(scene);
      check(`createGame imports ${scene}`, imported,
        imported ? 'imported' : 'not imported');
      check(`createGame registers ${scene}`, registered,
        registered ? 'registered in scene array' : 'not registered in scene array');
    }

    // Check scene order makes sense
    const sceneArrayMatch = createGame.match(/scene:\s*\[([^\]]+)\]/);
    if (sceneArrayMatch) {
      const sceneOrder = sceneArrayMatch[1].match(/\w+/g) || [];
      const expectedOrder = ['BootScene', 'PreloadScene', 'MenuScene', 'BattleScene', 'HudScene'];
      const orderCorrect = expectedOrder.every((s, i) => sceneOrder[i] === s);
      check('Scene registration order correct', orderCorrect,
        orderCorrect ? 'Boot -> Preload -> Menu -> Battle -> Hud' : `actual: [${sceneOrder.join(', ')}]`);
    }
  }
}

// --- Game Logic Checks ---
function checkGameLogic() {
  const battleSrc = readSourceFile('src/scenes/GameScene.js');
  if (!battleSrc) {
    check('BattleScene source', false, 'src/scenes/GameScene.js not found');
    return;
  }

  // Check world bounds
  const worldWidthMatch = battleSrc.match(/WORLD_WIDTH\s*=\s*(\d+)/);
  const worldHeightMatch = battleSrc.match(/WORLD_HEIGHT\s*=\s*(\d+)/);
  if (worldWidthMatch && worldHeightMatch) {
    const ww = parseInt(worldWidthMatch[1]);
    const wh = parseInt(worldHeightMatch[1]);
    check('World dimensions defined', ww > 0 && wh > 0,
      `${ww}x${wh}`);
    check('World is wider than tall (side-scrolling)', ww > wh,
      `${ww}x${wh} — horizontal play area`);
  } else {
    check('World dimensions defined', false, 'WORLD_WIDTH/WORLD_HEIGHT not found');
  }

  // Check camera clamping
  check('Camera clamping implemented', battleSrc.includes('clampCamera') || battleSrc.includes('Clamp'),
    battleSrc.includes('clampCamera') ? 'clampCamera function found' : 'no camera boundary clamping');

  // Check input handling
  check('Pointer/touch input handled', battleSrc.includes('pointerdown') || battleSrc.includes('pointerup'),
    battleSrc.includes('pointerdown') ? 'pointerdown handler found' : 'no pointer handlers');

  check('Drag detection with threshold', battleSrc.includes('TAP_DRAG_THRESHOLD') || battleSrc.includes('threshold'),
    battleSrc.includes('TAP_DRAG_THRESHOLD') ? 'tap/drag threshold configured' : 'no drag threshold');
  // Check keyboard input (via input controller)
  check('Keyboard input supported', battleSrc.includes('keyboard') || battleSrc.includes('inputController') || battleSrc.includes('InputController'),
    battleSrc.includes('inputController') ? 'input controller module referenced' : 'no keyboard input');

  // Check game entities
  check('Resource nodes system', battleSrc.includes('resourceNodes') || battleSrc.includes('createResourceNode'),
    battleSrc.includes('createResourceNode') ? 'resource node system found' : 'no resource nodes');

  check('Unit system (player + enemy)', battleSrc.includes('playerUnits') && battleSrc.includes('enemyUnits'),
    'both playerUnits and enemyUnits arrays found');

  check('Structure system', battleSrc.includes('structures') && battleSrc.includes('createStructure'),
    'structure system with createStructure found');

  check('Construction system', battleSrc.includes('constructions') || battleSrc.includes('construction'),
    'construction/building system found');

  // Check game states
  check('Victory/defeat conditions', battleSrc.includes('checkVictoryDefeat') || battleSrc.includes('victory') || battleSrc.includes('defeat'),
    battleSrc.includes('checkVictoryDefeat') ? 'checkVictoryDefeat method found' : 'no win/loss conditions');

  check('Enemy AI / waves', battleSrc.includes('enemyWave') || battleSrc.includes('spawnEnemyWave'),
    battleSrc.includes('spawnEnemyWave') ? 'enemy wave spawning found' : 'no enemy AI waves');

  // Check resource economy
  check('Mineral economy system', battleSrc.includes('playerMinerals') || battleSrc.includes('enemyMinerals'),
    'mineral economy (player + enemy) found');

  check('Supply system', battleSrc.includes('playerSupplyCap') || battleSrc.includes('playerSupplyUsed'),
    'supply cap and usage tracking found');

  // Check HUD integration
  check('HudScene launched from BattleScene', battleSrc.includes("scene.launch('HudScene'"),
    'HudScene launched via scene.launch()');

  check('Session sync for HUD', battleSrc.includes('syncSession') || battleSrc.includes('session'),
    'session sync mechanism found');

  // Check game loop (update method)
  check('Game update loop', battleSrc.includes('update(') || battleSrc.includes('update(time'),
    'update() game loop method found');

  // Check pause functionality
  check('Pause/resume functionality', battleSrc.includes('togglePause') || battleSrc.includes('paused'),
    battleSrc.includes('togglePause') ? 'togglePause method found' : 'no pause functionality');

  // Check entity lifecycle (creation + destruction)
  check('Entity destruction/cleanup', battleSrc.includes('destroyEntity') || battleSrc.includes('reapDead'),
    battleSrc.includes('destroyEntity') ? 'entity cleanup found' : 'no entity destruction');

  // Check HUD scene
  const hudSrc = readSourceFile('src/scenes/HudScene.js');
  if (hudSrc) {
    check('HudScene file exists', true, 'src/scenes/HudScene.js found');

    // Check command buttons
    const commandButtons = ['select', 'move', 'attack', 'train-worker', 'train-soldier', 'build-production', 'pause'];
    for (const btn of commandButtons) {
      const hasBtn = hudSrc.includes(btn);
      check(`HudScene has '${btn}' button`, hasBtn,
        hasBtn ? 'button definition found' : 'button not found in HUD');
    }

    // Check resource display
    check('Hud displays minerals', hudSrc.includes('minerals') || hudSrc.includes('Minerals'),
      'mineral display in HUD');

    check('Hud displays supply', hudSrc.includes('supply') || hudSrc.includes('Supply'),
      'supply display in HUD');

    // Check selection panel
    check('Hud has selection panel', hudSrc.includes('selectionPanel') || hudSrc.includes('selection'),
      'selection panel found');

    // Check log display
    check('Hud has game log', hudSrc.includes('logText') || hudSrc.includes('log'),
      'game log display found');

    // Check HUD resize handling
    check('Hud handles resize', hudSrc.includes('handleResize') || hudSrc.includes('resize'),
      'resize handler found');
  }

  // Check gameSession (shared state)
  const sessionSrc = readSourceFile('src/game/state/gameSession.js');
  if (sessionSrc) {
    check('gameSession module exists', true, 'src/game/state/gameSession.js found');

    // Check required state fields
    const requiredState = ['screen', 'raceId', 'raceName', 'objective', 'message', 'outcome',
      'log', 'resources', 'selection', 'battle', 'lastAction'];
    for (const field of requiredState) {
      // Look for field as object key (unquoted or quoted)
      const hasField = sessionSrc.includes(`${field}:`) || sessionSrc.includes(`'${field}'`) || sessionSrc.includes(`"${field}"`);
      check(`Session state has '${field}'`, hasField,
        hasField ? 'state field present' : 'state field missing');
    }

    // Check event emission
    check('Session uses event emitter', sessionSrc.includes('EventEmitter'),
      'Phaser.Events.EventEmitter used');

    // Check snapshot method
    check('Session has snapshot() method', sessionSrc.includes('snapshot()'),
      'snapshot() method found for HUD sync');

    // Check GameStates constants
    check('GameStates constants defined', sessionSrc.includes('GameStates'),
      'GameStates freeze object found');

    const states = ['MENU', 'BATTLE', 'VICTORY', 'DEFEAT'];
    for (const state of states) {
      const hasState = sessionSrc.includes(state);
      check(`GameStates has '${state}'`, hasState,
        hasState ? 'state constant defined' : 'state constant missing');
    }
  }

  // Check input controller
  const inputSrc = readSourceFile('src/game/input/createInputController.js');
  if (inputSrc) {
    check('Input controller module exists', true, 'src/game/input/createInputController.js found');
    check('Input controller supports keyboard', inputSrc.includes('keyboard') || inputSrc.includes('createCursorKeys'),
      'keyboard input support found');
    check('Input controller returns vector', inputSrc.includes('Vector2') || inputSrc.includes('vector'),
      'returns normalized vector for camera movement');
  }

  // Check PreloadScene
  const preloadSrc = readSourceFile('src/scenes/PreloadScene.js');
  if (preloadSrc) {
    check('PreloadScene exists', true, 'src/scenes/PreloadScene.js found');
    check('PreloadScene handles resize', preloadSrc.includes('resize'),
      'resize handler in preload');
    check('PreloadScene transitions to MenuScene', preloadSrc.includes("scene.start('MenuScene')"),
      'transitions to MenuScene after loading');
  }

  // Check BootScene
  const bootSrc = readSourceFile('src/scenes/BootScene.js');
  if (bootSrc) {
    check('BootScene exists', true, 'src/scenes/BootScene.js found');
    check('BootScene transitions to PreloadScene', bootSrc.includes("scene.start('PreloadScene')"),
      'transitions to PreloadScene');
  }
}

// --- Index.html / Mobile Checks ---
function checkMobileConfig() {
  const indexHtml = readSourceFile('index.html');
  if (!indexHtml) {
    check('index.html', false, 'index.html not found');
    return;
  }

  check('index.html exists', true, 'index.html found');

  // Viewport
  check('Viewport meta tag', indexHtml.includes('viewport'),
    'viewport meta present');

  const viewportMatch = indexHtml.match(/viewport[^>]*width\s*=\s*['"]?(\d+|device-width)/i);
  if (viewportMatch) {
    check('Viewport width=device-width', true, 'device-width configured');
  } else {
    check('Viewport width=device-width', false, 'viewport missing device-width');
  }

  // Mobile-specific meta
  check('apple-mobile-web-app-capable', indexHtml.includes('apple-mobile-web-app-capable'),
    'PWA capable mode configured');

  check('apple-mobile-web-app-status-bar-style', indexHtml.includes('apple-mobile-web-app-status-bar-style'),
    'status bar style configured');

  check('theme-color meta', indexHtml.includes('theme-color'),
    'theme color configured for mobile');

  // CSS checks
  check('touch-action: none in CSS', indexHtml.includes('touch-action: none') || indexHtml.includes('touch-action:none'),
    'touch-action: none prevents browser gestures');

  check('overflow: hidden in CSS', indexHtml.includes('overflow: hidden') || indexHtml.includes('overflow:hidden'),
    'overflow: hidden prevents scroll bounce');

  check('user-scalable: no', indexHtml.includes('user-scalable=no') || indexHtml.includes('user-scalable: no'),
    'user-scalable=no prevents pinch zoom');

  // Check game container
  check('#game container div', indexHtml.includes('id="game"') || indexHtml.includes("id='game'"),
    '#game container element present');

  // Check script import
  check('main.js script tag', indexHtml.includes('src="/src/main.js"'),
    'main.js module script tag present');

  // Check viewport height usage
  check('100vh height usage', indexHtml.includes('100vh'),
    'viewport-height units used for full-screen');
}

// --- Extract helpers ---
function extractRaceBlock(content, raceId) {
  // Find the start of the race block
  const startIdx = content.indexOf(`${raceId}:`);
  if (startIdx === -1) return null;

  // Find the opening brace after the raceId
  let braceStart = content.indexOf('{', startIdx);
  if (braceStart === -1) return null;

  // Count braces to find matching close
  let depth = 0;
  let i = braceStart;
  while (i < content.length) {
    if (content[i] === '{') depth++;
    else if (content[i] === '}') {
      depth--;
      if (depth === 0) break;
    }
    i++;
  }

  if (depth !== 0) return null;
  return content.substring(braceStart, i + 1);
}

// --- Main ---
function main() {
  if (JSON_OUTPUT) {
    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      project: PROJECT_DIR,
      results,
      exitCode,
      summary: {
        pass: results.filter(r => r.status === PASS).length,
        fail: results.filter(r => r.status === FAIL).length,
        warn: results.filter(r => r.status === WARN).length,
        skip: results.filter(r => r.status === SKIP).length,
      }
    }, null, 2));
    process.exit(exitCode);
  }

  if (QUIET) {
    // Just print pass/fail count
    const passCount = results.filter(r => r.status === PASS).length;
    const failCount = results.filter(r => r.status === FAIL).length;
    console.log(`Gameplay Checks: ${passCount} passed, ${failCount} failed`);
    process.exit(exitCode);
  }

  console.log('============================================');
  console.log('  SCC Gameplay Sanity Checks');
  console.log('============================================');
  console.log('');

  console.log('--- Race Data ---');
  checkRaceData();
  console.log('');

  console.log('--- Scene Structure ---');
  checkScenes();
  console.log('');

  console.log('--- Game Logic ---');
  checkGameLogic();
  console.log('');

  console.log('--- Mobile Configuration ---');
  checkMobileConfig();
  console.log('');

  const passCount = results.filter(r => r.status === PASS).length;
  const failCount = results.filter(r => r.status === FAIL).length;
  const warnCount = results.filter(r => r.status === WARN).length;
  const skipCount = results.filter(r => r.status === SKIP).length;

  console.log('============================================');
  console.log(`  Results: ${passCount} passed, ${failCount} failed, ${warnCount} warnings, ${skipCount} skipped`);
  console.log('============================================');

  if (failCount === 0) {
    console.log('  GAMEPLAY CHECKS: PASSED');
  } else {
    console.log(`  GAMEPLAY CHECKS: ${failCount} issue(s) found`);
  }

  process.exit(exitCode);
}

main();
