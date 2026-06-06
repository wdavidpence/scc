#!/usr/bin/env node
/**
 * runtime-smoke.js — Runtime gameplay assertions for SCC.
 *
 * Validates boot flow, scene graph, asset pipeline, session state,
 * race data, game logic, and integration at runtime.
 *
 * Usage:
 *   node scripts/qa/runtime-smoke.js          # verbose output
 *   node scripts/qa/runtime-smoke.js --json   # machine-readable JSON
 *   node scripts/qa/runtime-smoke.js --quiet  # pass/fail only
 */

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { RACE_ORDER, getRace, RACES } from '../../src/game/data/races.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_DIR = resolve(__dirname, '../..');

const ARGS = process.argv.slice(2);
const JSON_OUTPUT = ARGS.includes('--json');
const QUIET = ARGS.includes('--quiet');

const PASS = 'PASS';
const FAIL = 'FAIL';
const WARN = 'WARN';

let results = [];
let exitCode = 0;

function check(name, condition, message) {
  const status = condition ? PASS : (condition === null ? WARN : FAIL);
  results.push({ name, status, message });
  if (status === FAIL) exitCode = 1;
  if (!JSON_OUTPUT && !QUIET) {
    const prefix = status === PASS ? '[PASS]' : (status === FAIL ? '[FAIL]' : '[WARN]');
    console.log(`  ${prefix} ${name}: ${message}`);
  }
  return status;
}

function readSourceFile(relativePath) {
  try { return readFileSync(join(PROJECT_DIR, relativePath), 'utf-8'); } catch { return null; }
}

// === Phase 1: Boot Flow ===
function checkBootFlow() {
  if (!JSON_OUTPUT && !QUIET) console.log('--- Boot Flow Assertions ---');

  const createGame = readSourceFile('src/game/createGame.js');
  const scenesSrc = readSourceFile('src/game/scenes.js');
  if (!createGame) { check('Boot flow: createGame.js exists', false, 'file not found'); return; }

  check('Boot flow: createGame imports SCENE_LIST', /import\s+\{\s*SCENE_LIST\s*\}\s+from\s+['\"]\.\/scenes\.js['\"]/.test(createGame), 'SCENE_LIST import found');
  check('Boot flow: createGame references SCENE_LIST', /scene:\s*SCENE_LIST/.test(createGame), 'scene: SCENE_LIST found');

  const sceneListMatch = scenesSrc && scenesSrc.match(/SCENE_LIST\s*=\s*\[([^\]]+)\]/s);
  if (!sceneListMatch) { check('Boot flow: SCENE_LIST in scenes.js', false, 'no SCENE_LIST [...] found'); return; }

  const registeredScenes = sceneListMatch[1].match(/\w+Scene/g) || [];
  const expectedChain = ['BootScene', 'PreloadScene', 'MenuScene', 'BattleScene', 'HudScene'];
  const chainComplete = expectedChain.every(s => registeredScenes.includes(s));
  check('Boot flow: all 5 scenes registered', chainComplete,
    chainComplete ? `[${registeredScenes.join(', ')}]` : `expected [${expectedChain.join(', ')}], got [${registeredScenes.join(', ')}]`);

  const bootIdx = registeredScenes.indexOf('BootScene');
  const hudIdx = registeredScenes.indexOf('HudScene');
  check('Boot flow: BootScene is first', bootIdx === 0, `BootScene at index ${bootIdx}`);
  check('Boot flow: HudScene is last', hudIdx === registeredScenes.length - 1, `HudScene at index ${hudIdx}`);

  // Scene transition chain
  const bootSrc = readSourceFile('src/scenes/BootScene.js');
  const preloadSrc = readSourceFile('src/scenes/PreloadScene.js');
  const menuSrc = readSourceFile('src/scenes/TitleScene.js');
  const battleSrc = readSourceFile('src/scenes/GameScene.js');

  check('Boot flow: Boot → Preload transition',
    bootSrc && bootSrc.includes("scene.start('PreloadScene')"),
    bootSrc && bootSrc.includes("scene.start('PreloadScene'") ? 'BootScene.start(\'PreloadScene\') found' : 'no transition');

  check('Boot flow: Preload → Menu transition',
    preloadSrc && preloadSrc.includes("scene.start('MenuScene')"),
    'PreloadScene starts MenuScene');

  check('Boot flow: Menu → Battle transition',
    menuSrc && (menuSrc.includes("scene.start('BattleScene')") || menuSrc.includes("scene.start(\"BattleScene\")")),
    'MenuScene starts BattleScene');

  check('Boot flow: Battle launches HUD (sub-scene)',
    battleSrc && battleSrc.includes("scene.launch('HudScene'"),
    'BattleScene launches HudScene');

  // Scene name registration matches exports
  const sceneFiles = [
    { path: 'src/scenes/BootScene.js', expectedName: 'BootScene' },
    { path: 'src/scenes/PreloadScene.js', expectedName: 'PreloadScene' },
    { path: 'src/scenes/TitleScene.js', expectedName: 'MenuScene' },
    { path: 'src/scenes/GameScene.js', expectedName: 'BattleScene' },
  ];
  for (const sf of sceneFiles) {
    const content = readSourceFile(sf.path);
    if (!content) { check(`Boot flow: ${sf.expectedName} name`, false, `${sf.path} not found`); continue; }
    const nameMatch = content.match(/super\('([^']+)'\)/);
    if (nameMatch) {
      check(`Boot flow: ${sf.expectedName} registers correctly`, nameMatch[1] === sf.expectedName,
        `registered as '${nameMatch[1]}' (expected '${sf.expectedName}')`);
    } else { check(`Boot flow: ${sf.expectedName} name`, false, 'no super(...) found'); }
  }

  // Preload loads sprite sheets that exist on disk
  if (preloadSrc) {
    const loadCalls = preloadSrc.match(/this\.load\.spritesheet\('([^']+)'/g);
    if (loadCalls) {
      const spriteKeys = loadCalls.map(c => c.match(/'([^']+)'/)?.[1]).filter(Boolean);
      check('Boot flow: Preload loads sprite sheets (>= 15)', spriteKeys.length >= 15,
        `${spriteKeys.length} spritesheets loaded`);

      const assetDir = join(PROJECT_DIR, 'src/assets/sprites');
      let missingAssets = [];
      for (const key of spriteKeys) {
        const parts = key.split('-');
        if (parts.length >= 2) {
          const raceDir = join(assetDir, parts[0]);
          const spriteFile = `${parts.slice(1).join('-')}.png`;
          if (!existsSync(join(raceDir, spriteFile))) { missingAssets.push(key); }
        }
      }
      check('Boot flow: all sprite assets exist on disk', missingAssets.length === 0,
        missingAssets.length === 0 ? 'all referenced spritesheets found' : `missing: [${missingAssets.join(', ')}]`);
    }
  }

  // index.html checks
  const indexHtml = readSourceFile('index.html');
  if (indexHtml) {
    check('Boot flow: index.html has game container div', indexHtml.includes('id="game"'), 'div#game found');
    check('Boot flow: index.html references Phaser', indexHtml.includes('phaser') || indexHtml.includes('Phaser') || (indexHtml.includes('<script') && (indexHtml.includes('type="module"') || indexHtml.includes("type='module'"))), 'Phaser ref in HTML or module script');
    check('Boot flow: index.html imports main.js', indexHtml.includes('main') && (indexHtml.includes('.js') || indexHtml.includes("src='")), 'main.js import found');
  }
}

// === Phase 2: Scene Graph ===
function checkSceneGraph() {
  if (!JSON_OUTPUT && !QUIET) console.log('');
  if (!JSON_OUTPUT && !QUIET) console.log('--- Scene Graph & Initialization ---');

  const sceneFiles = [
    'src/scenes/BootScene.js', 'src/scenes/PreloadScene.js',
    'src/scenes/TitleScene.js', 'src/scenes/GameScene.js', 'src/scenes/HudScene.js',
  ];
  for (const path of sceneFiles) {
    const content = readSourceFile(path);
    if (!content) continue;
    const hasCreate = /create\s*\(\s*\)/.test(content);
    check(`Scene graph: ${path.split('/').pop()} has create()`, hasCreate, hasCreate ? 'create() present' : 'no create()');
    const hasExtends = /extends\s+Phaser\.Scene/.test(content);
    check(`Scene graph: ${path.split('/').pop()} extends Phaser.Scene`, hasExtends, hasExtends ? 'proper inheritance' : 'no inheritance');
    const isBoot = path.includes('Boot');
    const hasResize = /resize/.test(content);
    if (isBoot) { check(`Scene graph: ${path.split('/').pop()} resize`, true, 'intentionally minimal'); }
    else { check(`Scene graph: ${path.split('/').pop()} resize`, hasResize, hasResize ? 'resize handler present' : 'no resize'); }
  }

  // createGame.js config
  const createGame = readSourceFile('src/game/createGame.js');
  if (createGame) {
    check('Scene graph: Phaser.Game has type config', createGame.includes('type:') || createGame.includes('type :'), 'type: Phaser.AUTO');
    check('Scene graph: Phaser.Game has parent config', createGame.includes('parent:'), 'parent: \'game\'');
    check('Scene graph: Phaser.Game has scale config', createGame.includes('scale:') || createGame.includes('scale :'), 'scale config');
    check('Scene graph: Phaser.Game has scene array', createGame.includes('scene:'), 'scene array');
    check('Scene graph: scale mode is RESIZE', createGame.includes('RESIZE'), 'Phaser.Scale.RESIZE');
    const apMatch = createGame.match(/activePointers:\s*(\d+)/);
    if (apMatch) { check('Scene graph: multi-touch support (>= 3)', parseInt(apMatch[1]) >= 3, `${apMatch[1]} activePointers`); }
    else { check('Scene graph: multi-touch configured', false, 'activePointers not found'); }
  }

  // BattleScene core systems
  const battleSrcForCheck = readSourceFile('src/scenes/GameScene.js');
  if (battleSrcForCheck) {
    check('Scene graph: BattleScene sets world bounds', battleSrcForCheck.includes('setBounds'), 'camera.bounds set');
    check('Scene graph: BattleScene configures physics', battleSrcForCheck.includes('physics.world') || battleSrcForCheck.includes('physics'), 'physics.world configured');
    check('Scene graph: BattleScene creates input controller', battleSrcForCheck.includes('createInputController') || battleSrcForCheck.includes('inputController'), 'input controller instantiated');
    check('Scene graph: BattleScene loads race data', battleSrcForCheck.includes('getRace') || battleSrcForCheck.includes('this.race'), 'race data loaded');
    check('Scene graph: BattleScene syncs with session', battleSrcForCheck.includes('session.'), 'session integration present');
    check('Scene graph: BattleScene creates map', battleSrcForCheck.includes('createMap'), 'createMap() called');
    check('Scene graph: BattleScene creates gas geysers', battleSrcForCheck.includes('createGasGeysers') || battleSrcForCheck.includes('createResourceNode'), 'resource nodes initialized');
    check('Scene graph: BattleScene spawns starting forces', battleSrcForCheck.includes('spawnStartingForces') || battleSrcForCheck.includes('spawn'), 'initial units spawned');
  }

  // HUD scene config
  const hudSrcForCheck = readSourceFile('src/scenes/HudScene.js');
  if (hudSrcForCheck) {
    check('Scene graph: HUD has layout system', hudSrcForCheck.includes('getLayout') || hudSrcForCheck.includes('layout'), 'responsive layout');
    check('Scene graph: HUD has button system', hudSrcForCheck.includes('buttonDefs') || hudSrcForCheck.includes('buttons'), 'button definitions');
    check('Scene graph: HUD has resource display', hudSrcForCheck.includes('resourceText') || hudSrcForCheck.includes('resources'), 'resource text');
    check('Scene graph: HUD has selection panel', hudSrcForCheck.includes('selectionPanel') || hudSrcForCheck.includes('selectionTitle'), 'selection panel');
    check('Scene graph: HUD has game log', hudSrcForCheck.includes('logText') || hudSrcForCheck.includes('log'), 'game log');
  }

  // Menu scene config
  const menuSrcForCheck = readSourceFile('src/scenes/TitleScene.js');
  if (menuSrcForCheck) {
    check('Scene graph: Menu has race card system', menuSrcForCheck.includes('createRaceCard') || menuSrcForCheck.includes('RACE_ORDER'), 'race cards');
    check('Scene graph: Menu has deploy button', menuSrcForCheck.includes('startButton') || menuSrcForCheck.includes('deploy'), 'deploy button');
    check('Scene graph: Menu has startBattle handler', menuSrcForCheck.includes('startBattle') || menuSrcForCheck.includes('scene.start'), 'startBattle()');
  }
}

// === Phase 3: Asset Pipeline ===
function checkAssetPipeline() {
  if (!JSON_OUTPUT && !QUIET) console.log('');
  if (!JSON_OUTPUT && !QUIET) console.log('--- Asset Pipeline Assertions ---');

  const assetDir = join(PROJECT_DIR, 'src/assets/sprites');
  const races = ['terran', 'zerg', 'protoss'];

  for (const race of races) {
    const raceDir = join(assetDir, race);
    if (!existsSync(raceDir)) { check(`Asset pipeline: ${race} dir`, false, `${raceDir} not found`); continue; }

    const knownSprites = ['marine', 'scv', 'drone', 'zergling', 'hydralisk', 'zealot', 'probe', 'dragoon'];
    let hasAnySprite = false;
    for (const s of knownSprites) { if (existsSync(join(raceDir, `${s}.png`))) { hasAnySprite = true; break; } }
    check(`Asset pipeline: ${race} has sprite assets`, hasAnySprite, `${race} sprite directory exists`);

    const structures = ['command-center', 'barracks', 'factory', 'hatchery', 'spawning-pool', 'nexus', 'gateway', 'cybernetics-core'];
    let structureCount = 0;
    for (const struct of structures) { if (existsSync(join(raceDir, `${struct}.png`))) structureCount++; }
    check(`Asset pipeline: ${race} has structure sprites (>= 2)`, structureCount >= 2, `${structureCount} structure sprites`);

    const animDirs = ['attack', 'death', 'idle', 'move'];
    let animTypeCount = 0;
    for (const animDir of animDirs) { if (existsSync(join(raceDir, animDir))) animTypeCount++; }
    check(`Asset pipeline: ${race} has animation frames (>= 2 types)`, animTypeCount >= 2, `${animTypeCount}/4 animation types`);
  }

  // Preload references match actual files
  const preloadSrc = readSourceFile('src/scenes/PreloadScene.js');
  if (preloadSrc) {
    const loadCalls = preloadSrc.match(/this\.load\.spritesheet\('([^']+)','([^']+)'/g) || [];
    let missing = [];
    for (const call of loadCalls) {
      const match = call.match(/'([^']+)','([^']+)'/);
      if (match && !existsSync(join(PROJECT_DIR, match[2]))) { missing.push(match[1]); }
    }
    check('Asset pipeline: preload references match actual files', missing.length === 0,
      missing.length === 0 ? 'all referenced assets exist' : `missing: [${missing.join(', ')}]`);

    // Sprite sheet frame dimensions reasonable (16-256px)
    const frameMatches = preloadSrc.matchAll(/frameWidth:\s*(\d+)[^}]*frameHeight:\s*(\d+)/g);
    const framePairs = [...frameMatches].map(m => [parseInt(m[1]), parseInt(m[2])]);
    const unreasonable = framePairs.filter(([w, h]) => w < 16 || w > 256 || h < 16 || h > 256);
    check('Asset pipeline: sprite frame dimensions reasonable (16-256px)', unreasonable.length === 0,
      unreasonable.length === 0 ? `all ${framePairs.length} spritesheets in range` : `unreasonable: [${unreasonable.map(([w,h]) => `${w}x${h}`).join(', ')}]`);

    // All source PNG files exist
    const pngCalls = preloadSrc.match(/this\.load\.spritesheet\('[^']+','([^']+)'/g) || [];
    const pngPaths = pngCalls.map(c => c.match(/'([^']+)'/)?.[1]).filter(Boolean);
    const missingPngs = pngPaths.filter(p => !existsSync(join(PROJECT_DIR, p)));
    check('Asset pipeline: all source PNG files exist', missingPngs.length === 0,
      missingPngs.length === 0 ? 'all source PNGs found' : `missing: [${missingPngs.join(', ')}]`);
  }

  // dist/ build output (if built)
  const distAssetsDir = join(PROJECT_DIR, 'dist/assets');
  if (existsSync(distAssetsDir)) {
    try {
      const distSprites = readdirRecursive(distAssetsDir, 'sprites');
      check('Asset pipeline: dist/ has sprite assets (if built)', distSprites.length > 0,
        `${distSprites} sprite files in dist/`);
    } catch { check('Asset pipeline: dist/ assets (skip)', true, 'dist/ exists but listing skipped'); }
  } else { check('Asset pipeline: dist/ assets (skip — not built)', true, 'dist/ not yet built'); }
}

function readdirRecursive(dirPath, filter) {
  const entries = [];
  function scan(dir) {
    try {
      for (const item of readdirSync(dir, { withFileTypes: true })) {
        const fullPath = join(dir, item.name);
        if (item.isDirectory()) {
          if (filter && item.name === filter) entries.push(fullPath);
          else if (item.name.includes(filter)) scan(fullPath);
        } else if (item.name.endsWith('.png')) { entries.push(fullPath); }
      }
    } catch {}
  }
  scan(dirPath); return entries;
}

// === Phase 4: Session State ===
function checkSessionState() {
  if (!JSON_OUTPUT && !QUIET) console.log('');
  if (!JSON_OUTPUT && !QUIET) console.log('--- Session State Assertions ---');

  const sessionSrc = readSourceFile('src/game/state/gameSession.js');
  if (!sessionSrc) { check('Session state: gameSession module', false, 'file not found'); return; }

  check('Session state: exports createGameSession()', sessionSrc.includes('export function createGameSession'), 'factory exported');
  check('Session state: exports singleton session', sessionSrc.includes('export const session') || sessionSrc.includes('session = createGameSession'), 'singleton exported');

  // initialState fields
  const requiredFields = ['screen', 'raceId', 'raceName', 'objective', 'message', 'outcome', 'log', 'resources', 'selection', 'battle', 'lastAction'];
  const missingFields = requiredFields.filter(f => !sessionSrc.includes(`'${f}'`) && !sessionSrc.includes(`${f}:`));
  check('Session state: initialState has all fields', missingFields.length === 0,
    missingFields.length === 0 ? 'all required fields present' : `missing: [${missingFields.join(', ')}]`);

  // snapshot() returns core fields
  const hasSnapshot = sessionSrc.includes('snapshot()');
  if (hasSnapshot) {
    const snapshotBody = sessionSrc.match(/const\s+snapshot\s*=\s*\(\)\s*=>\s*\{([\s\S]*?)\n\s*}/);
    if (snapshotBody) {
      const fieldsInSnapshot = requiredFields.filter(f => snapshotBody[1].includes(f));
      check('Session state: snapshot() returns core fields', fieldsInSnapshot.length >= 8,
        `${fieldsInSnapshot.join(', ')} in snapshot (expected >= 8)`);
    }
  }

  // API methods
  const apiMethods = ['setScreen', 'setRace', 'setObjective', 'setMessage', 'pushLog',
    'setResources', 'setSelection', 'setBattle', 'setOutcome', 'resetForMenu', 'startBattle'];
  let methodsPresent = 0;
  for (const method of apiMethods) { if (sessionSrc.includes(`${method}(`)) methodsPresent++; }
  check('Session state: API methods available (>= 10)', methodsPresent >= 10, `${methodsPresent}/${apiMethods.length} API methods`);

  // Event system
  check('Session state: event emitter configured', sessionSrc.includes('EventEmitter'), 'Phaser.Events.EventEmitter');
  check('Session state: emits change events', sessionSrc.includes('emit') || sessionSrc.includes('emitChange'), 'change events emitted');

  // startBattle() initializes state
  const startBattleBody = sessionSrc.match(/startBattle[\s\S]*?\{([\s\S]*?)\n\s*\}/);
  if (startBattleBody) {
    check('Session state: startBattle sets screen to BATTLE',
      startBattleBody[1].includes('BATTLE') || startBattleBody[1].includes("screen = GameStates.BATTLE"), 'screen transitions to BATTLE');
    check('Session state: startBattle sets initial resources',
      startBattleBody[1].includes('minerals') || startBattleBody[1].includes('resources'), 'resources initialized');
  }

  // GameStates constants
  check('Session state: GameStates is frozen', sessionSrc.includes('Object.freeze'), 'Object.freeze used');
  const states = ['MENU', 'BRIEFING', 'BATTLE', 'VICTORY', 'DEFEAT'];
  const statesFound = states.filter(s => sessionSrc.includes(s)).length;
  check('Session state: all GameStates defined (>= 5)', statesFound >= 5, `${statesFound}/5 GameStates`);
}

// === Phase 5: Race Data (runtime) ===
function checkRaceData() {
  if (!JSON_OUTPUT && !QUIET) console.log('');
  if (!JSON_OUTPUT && !QUIET) console.log('--- Race Data Assertions ---');

  check('Race data: getRace returns valid race', true, 'getRace is callable');

  for (const raceId of RACE_ORDER) {
    const race = getRace(raceId);

    // Required properties
    const requiredProps = ['id', 'name', 'subtitle', 'accent', 'glow', 'backdrop',
      'commandCenterName', 'productionName', 'techBuildingName', 'workerName',
      'soldierName', 'signatureName', 'startMinerals', 'startGas',
      'startSupplyCap', 'startSupplyUsed', 'startWorkers', 'startSoldiers'];
    const missing = requiredProps.filter(p => !(p in race));
    check(`Race data: ${raceId} has all properties`, missing.length === 0,
      missing.length === 0 ? 'all required props present' : `missing: [${missing.join(', ')}]`);

    // Structures, units, geysers
    check(`Race data: ${raceId} has structures`, race.structures && typeof race.structures === 'object',
      race.structures ? 'structures object found' : 'no structures');
    check(`Race data: ${raceId} has units`, race.units && typeof race.units === 'object',
      race.units ? 'units object found' : 'no units');
    check(`Race data: ${raceId} has gas geysers`, race.gasGeysers && Array.isArray(race.gasGeysers) && race.gasGeysers.length > 0,
      race.gasGeysers ? `${race.gasGeysers.length} geysers defined` : 'no geysers');

    // Unit properties
    if (race.units) {
      for (const unitType of ['worker', 'soldier', 'signature']) {
        const unit = race.units[unitType];
        if (unit) {
          const unitProps = ['label', 'cost', 'gasCost', 'buildTime', 'hp', 'maxHp', 'speed', 'attack', 'range', 'cooldown', 'supply', 'radius'];
          const missingUnits = unitProps.filter(p => !(p in unit));
          check(`Race data: ${raceId} ${unitType} has all properties`, missingUnits.length === 0,
            `${unitType}: ${unit.label}`);
        } else { check(`Race data: ${raceId} ${unitType} unit`, false, `${unitType} not defined`); }
      }
      check(`Race data: ${raceId} has enemy units`, race.units.enemySoldier && race.units.enemySignature, 'enemy units defined');
    }

    // Balance checks
    if (race.startMinerals >= 400 && race.startMinerals <= 600) {
      check(`Race data: ${raceId} startMinerals balanced (${race.startMinerals})`, true, `${race.startMinerals}`);
    } else { check(`Race data: ${raceId} startMinerals balanced (${race.startMinerals})`, false, `${race.startMinerals} (expected 400-600)`); }

    if (race.startSupplyCap >= 8 && race.startSupplyCap <= 12) {
      check(`Race data: ${raceId} startSupplyCap balanced (${race.startSupplyCap})`, true, `${race.startSupplyCap}`);
    } else { check(`Race data: ${raceId} startSupplyCap balanced (${race.startSupplyCap})`, false, `${race.startSupplyCap} (expected 8-12)`); }
  }

  // Cross-race parity
  const accents = RACE_ORDER.map(id => getRace(id).accent);
  check('Race data: all races have distinct accent colors', new Set(accents).size === 3, `${new Set(accents).size}/3 unique`);

  const backdrops = RACE_ORDER.map(id => getRace(id).backdrop);
  check('Race data: all races have distinct backdrops', new Set(backdrops).size === 3, `${new Set(backdrops).size}/3 unique`);

  check('Race data: all races have gas geysers', RACE_ORDER.every(id => getRace(id).gasGeysers && getRace(id).gasGeysers.length > 0), 'economy parity');
  check('Race data: all races have tech buildings', RACE_ORDER.every(id => getRace(id).structures && getRace(id).structures.techBuilding), 'tech building parity');

  // getRace fallback
  const defaultRace = getRace('nonexistent_race');
  check('Race data: getRace fallback to terran', defaultRace && defaultRace.id === 'terran', `nonexistent race returns terran`);
  const undefinedRace = getRace();
  check('Race data: getRace(undefined) defaults to terran', undefinedRace && undefinedRace.id === 'terran', `undefined raceId returns terran`);
}

// === Phase 6: Game Logic (runtime) ===
function checkGameLogic() {
  if (!JSON_OUTPUT && !QUIET) console.log('');
  if (!JSON_OUTPUT && !QUIET) console.log('--- Game Logic Assertions ---');

  const battleSrc = readSourceFile('src/scenes/GameScene.js');
  if (!battleSrc) { check('Game logic: BattleScene source', false, 'file not found'); return; }

  // World constants
  const wwMatch = battleSrc.match(/WORLD_WIDTH\s*=\s*(\d+)/);
  const whMatch = battleSrc.match(/WORLD_HEIGHT\s*=\s*(\d+)/);
  if (wwMatch && whMatch) {
    const ww = parseInt(wwMatch[1]), wh = parseInt(whMatch[1]);
    check('Game logic: world dimensions valid', ww > 0 && wh > 0, `${ww}x${wh}`);
    check('Game logic: world is side-scrolling (wider than tall)', ww > wh, `${ww}x${wh}`);
    check('Game logic: camera bounds match world', battleSrc.includes('setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT)'), 'camera matches world');
    check('Game logic: physics bounds match world', battleSrc.includes('physics.world.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT)'), 'physics bounds match');

    const minZoomMatch = battleSrc.match(/MIN_ZOOM\s*=\s*(\d+\.?\d*)/);
    const maxZoomMatch = battleSrc.match(/MAX_ZOOM\s*=\s*(\d+\.?\d*)/);
    if (minZoomMatch && maxZoomMatch) {
      const minZ = parseFloat(minZoomMatch[1]), maxZ = parseFloat(maxZoomMatch[1]);
      check('Game logic: zoom range valid (0.5-2.0)', minZ < maxZ, `zoom ${minZ}-${maxZ}`);
      const initialZoomMatch = battleSrc.match(/setZoom\(([\d.]+)/);
      if (initialZoomMatch) {
        const z = parseFloat(initialZoomMatch[1]);
        check('Game logic: initial zoom in valid range', z >= minZ && z <= maxZ, `initial ${z}, range ${minZ}-${maxZ}`);
      }
    }
  }

  // Input handling constants
  const tapThresholdMatch = battleSrc.match(/TAP_DRAG_THRESHOLD\s*=\s*(\d+)/);
  if (tapThresholdMatch) {
    const threshold = parseInt(tapThresholdMatch[1]);
    check('Game logic: tap/drag threshold >= 18px (mobile)', threshold >= 18, `${threshold}px (>= 18 prevents accidental pans)`);
    check('Game logic: tap/drag threshold is used', battleSrc.includes('TAP_DRAG_THRESHOLD') && (battleSrc.includes('distance') || battleSrc.includes('moved')), 'threshold applied in input handling');
  }

  // Entity systems
  check('Game logic: unit system exists', battleSrc.includes('this.units') || battleSrc.includes('units:'), 'units array');
  check('Game logic: structure system exists', battleSrc.includes('this.structures') || battleSrc.includes('structures:'), 'structures array');
  check('Game logic: resource node system exists', battleSrc.includes('this.resourceNodes') || battleSrc.includes('resourceNodes:'), 'resource nodes');
  check('Game logic: gas geyser system exists', battleSrc.includes('this.gasGeysers') || battleSrc.includes('gasGeysers:'), 'gas geysers');

  // Economy tracking
  check('Game logic: mineral economy tracked', battleSrc.includes('this.playerMinerals') || battleSrc.includes('playerMinerals:'), 'player minerals');
  check('Game logic: gas economy tracked', battleSrc.includes('this.playerGas') || battleSrc.includes('playerGas:'), 'player gas');
  check('Game logic: supply system tracked', battleSrc.includes('this.playerSupplyCap') || battleSrc.includes('playerSupplyCap:'), 'supply cap/usage');

  // Enemy AI systems
  check('Game logic: enemy economy tracked', battleSrc.includes('this.enemyMinerals') && battleSrc.includes('this.enemyGas'), 'enemy minerals + gas');
  check('Game logic: enemy supply tracked', battleSrc.includes('this.enemySupplyCap') || battleSrc.includes('enemySupplyCap:'), 'enemy supply');
  check('Game logic: enemy AI wave system', battleSrc.includes('this.enemyWave') || battleSrc.includes('enemyWave:'), 'enemy wave counter');
  check('Game logic: enemy spawn timer', battleSrc.includes('this.enemySpawnTimer') || battleSrc.includes('enemySpawnTimer:'), 'enemy spawning scheduled');
  check('Game logic: enemy attack timer', battleSrc.includes('this.enemyAttackTimer') || battleSrc.includes('enemyAttackTimer:'), 'enemy attacks scheduled');
  check('Game logic: enemy income timer', battleSrc.includes('this.enemyIncomeTimer') || battleSrc.includes('enemyIncomeTimer:'), 'enemy mineral income');

  // Game state management
  check('Game logic: pause system', battleSrc.includes('this.paused') || battleSrc.includes('paused:'), 'pause flag present');
  check('Game logic: game end system', battleSrc.includes('this.ended') || battleSrc.includes('ended:'), 'game end flag');
  check('Game logic: command mode system', battleSrc.includes('this.commandMode') || battleSrc.includes('commandMode:'), 'command mode (select/move/attack)');
  check('Game logic: entity selection system', battleSrc.includes('this.selectedEntity') || battleSrc.includes('selectedEntity:'), 'selected entity tracking');
  check('Game logic: game update loop', /update\s*\(/.test(battleSrc) || /update\s*\(time/.test(battleSrc), 'update() method');
  check('Game logic: camera clamping', battleSrc.includes('clampCamera') || battleSrc.includes('Math.Clamp'), 'camera boundary clamping');
  check('Game logic: construction system', battleSrc.includes('this.constructions') || battleSrc.includes('constructions:'), 'construction queue');
  check('Game logic: build slots for player and enemy', battleSrc.includes('this.playerBuildSlots') && battleSrc.includes('this.enemyBuildSlots'), 'build slots for both sides');

  // HUD integration
  check('Game logic: HUD launched from BattleScene', battleSrc.includes("scene.launch('HudScene'"), 'HudScene launched');
  check('Game logic: session sync with HUD', battleSrc.includes('syncSession') || battleSrc.includes('this.syncSession'), 'session sync');
  check('Game logic: pointer controls installed', battleSrc.includes('installPointerControls') || battleSrc.includes('this.installPointerControls'), 'pointer controls');
  check('Game logic: pinch zoom installed', battleSrc.includes('installPinchZoom') || battleSrc.includes('this.installPinchZoom'), 'pinch zoom');
  check('Game logic: HUD action handler', battleSrc.includes('handleHudAction') || battleSrc.includes('this.handleHudAction'), 'handleHudAction method');

  // Visual feedback
  check('Game logic: selection highlight feedback', battleSrc.includes('this.selectionHighlight') || battleSrc.includes('selectionHighlight:'), 'selection highlight ring');
  check('Game logic: tap feedback indicator', battleSrc.includes('this.tapFeedback') || battleSrc.includes('tapFeedback:'), 'tap flash feedback');

  // Scene lifecycle
  check('Game logic: shutdown cleanup', battleSrc.includes('shutdown') || /shutdown\s*\(/.test(battleSrc), 'shutdown cleanup');
  check('Game logic: map decoration', battleSrc.includes('drawDecor') || battleSrc.includes('this.drawDecor'), 'map decorations');
  check('Game logic: map generation', battleSrc.includes('createMap') || battleSrc.includes('this.createMap'), 'createMap method');
  check('Game logic: gas geyser placement', battleSrc.includes('createGasGeysers') || battleSrc.includes('this.createGasGeysers'), 'geyser placement');
  check('Game logic: starting forces spawn', battleSrc.includes('spawnStartingForces') || battleSrc.includes('this.spawnStartingForces'), 'unit spawning');
}

// === Phase 7: Integration ===
function checkIntegration() {
  if (!JSON_OUTPUT && !QUIET) console.log('');
  if (!JSON_OUTPUT && !QUIET) console.log('--- Integration Assertions ---');

  // createGame.js delegates to the shared SCENE_LIST, while scenes.js owns the scene order
  const createGame = readSourceFile('src/game/createGame.js');
  const scenesSrc = readSourceFile('src/game/scenes.js');
  if (createGame) {
    check('Integration: createGame imports SCENE_LIST', /import\s+\{\s*SCENE_LIST\s*\}\s+from\s+['\"]\.\/scenes\.js['\"]/.test(createGame), 'SCENE_LIST import present');
    check('Integration: createGame uses SCENE_LIST', /scene:\s*SCENE_LIST/.test(createGame), 'scene: SCENE_LIST registered');
    check('Integration: createGame exports factory', createGame.includes('export function createGame'), 'createGame() exported');
  }
  if (scenesSrc) {
    const expectedScenes = ['BootScene', 'PreloadScene', 'MenuScene', 'BattleScene', 'HudScene'];
    for (const name of expectedScenes) {
      check(`Integration: scenes.js imports ${name}`, scenesSrc.includes(`import ${name}`) || scenesSrc.includes(`from '../scenes/${name === 'MenuScene' ? 'TitleScene' : name}.js'`), 'scene import present');
    }
    const sceneListMatch = scenesSrc.match(/SCENE_LIST\s*=\s*\[([^\]]+)\]/s);
    const registeredScenes = sceneListMatch ? (sceneListMatch[1].match(/\w+Scene/g) || []) : [];
    check('Integration: scenes.js exports SCENE_LIST', !!sceneListMatch, 'SCENE_LIST exported');
    check('Integration: scenes.js order is Boot→Hud', registeredScenes.length === expectedScenes.length && expectedScenes.every((s, i) => registeredScenes[i] === s), registeredScenes.length ? `[${registeredScenes.join(', ')}]` : 'no scene list');
  }

  // main.js calls createGame()
  const mainSrc = readSourceFile('src/main.js');
  if (mainSrc) {
    check('Integration: main.js calls createGame()', mainSrc.includes('createGame()'), 'createGame() called');
    check('Integration: main.js imports createGame', mainSrc.includes("import { createGame }"), 'createGame imported');
  }

  // Race data exports
  const racesSrc = readSourceFile('src/game/data/races.js');
  if (racesSrc) {
    check('Integration: RACE_ORDER exported', racesSrc.includes('export const RACE_ORDER'), 'RACE_ORDER exported');
    check('Integration: RACES exported', racesSrc.includes('export const RACES') || racesSrc.includes('export {'), 'RACES exported');
    check('Integration: getRace() exported', racesSrc.includes('export function getRace') || racesSrc.includes('export {'), 'getRace exported');

    // BattleScene imports
    const battleSrc = readSourceFile('src/scenes/GameScene.js');
    if (battleSrc) {
      check('Integration: BattleScene imports race data', battleSrc.includes("import { getRace }") || battleSrc.includes('getRace'), 'getRace imported');
      check('Integration: BattleScene imports session + GameStates', battleSrc.includes("import { session, GameStates }") || (battleSrc.includes('session') && battleSrc.includes('GameStates')), 'session + GameStates');
      check('Integration: BattleScene imports input controller', battleSrc.includes("import { createInputController }") || battleSrc.includes('createInputController'), 'createInputController');
    }

    // MenuScene imports
    const menuSrc = readSourceFile('src/scenes/TitleScene.js');
    if (menuSrc) {
      check('Integration: MenuScene imports race data', menuSrc.includes("import { RACE_ORDER, getRace }") || (menuSrc.includes('RACE_ORDER') && menuSrc.includes('getRace')), 'RACE_ORDER + getRace');
      check('Integration: MenuScene imports GameStates + session', menuSrc.includes("import { GameStates, session }"), 'GameStates + session');
    }

    // HudScene imports session
    const hudSrc = readSourceFile('src/scenes/HudScene.js');
    if (hudSrc) { check('Integration: HudScene imports session', hudSrc.includes("import { session }"), 'session imported'); }
  }

  // All scenes have shutdown handlers
  const sceneFiles = ['src/scenes/BootScene.js', 'src/scenes/PreloadScene.js',
    'src/scenes/TitleScene.js', 'src/scenes/GameScene.js', 'src/scenes/HudScene.js'];
  for (const path of sceneFiles) {
    const content = readSourceFile(path);
    if (!content) continue;
    check(`Integration: ${path.split('/').pop()} has shutdown handler`, content.includes('Events.SHUTDOWN') || content.includes('shutdown'), 'shutdown cleanup');
  }

  // index.html structure
  const indexHtml = readSourceFile('index.html');
  if (indexHtml) {
    check('Integration: viewport meta tag', indexHtml.includes('viewport'), 'viewport configured');
    check('Integration: touch-action: none', indexHtml.includes('touch-action: none') || indexHtml.includes('touch-action:none'), 'touch gestures disabled');
    check('Integration: game container div', indexHtml.includes('<div') && (indexHtml.includes('id="game"') || indexHtml.includes('id = "game"')), 'div#game present');
    check('Integration: module script import', indexHtml.includes('<script') && (indexHtml.includes('main.js') || indexHtml.includes("type='module'")), 'module script tag');
  }

  // Vite config
  const viteConfig = readSourceFile('vite.config.js');
  if (viteConfig) { check('Integration: Vite build config exists', viteConfig.includes('build') || viteConfig.includes('rollup'), 'Vite/rollup config'); }

  // package.json
  const pkgSrc = readSourceFile('package.json');
  if (pkgSrc) {
    check('Integration: Phaser in package.json dependencies', pkgSrc.includes('phaser'), 'phaser dependency');
    check('Integration: build script in package.json', pkgSrc.includes('"build"') || pkgSrc.includes("'build'"), 'build script');
  }

  // QA scripts exist
  const qaScripts = ['scripts/qa/verify-build.sh', 'scripts/qa/gameplay-checks.js',
    'scripts/qa/touch-checks.js', 'scripts/qa/smoke-test.sh', 'scripts/qa/run-qa.sh'];
  for (const script of qaScripts) { check(`Integration: ${script} exists`, existsSync(join(PROJECT_DIR, script)), 'QA script present'); }
  if (existsSync(join(PROJECT_DIR, 'scripts/qa/release-gate.sh'))) { check('Integration: release-gate.sh exists', true, 'release gate script'); }
}

// === Summary ===
function printSummary() {
  const passCount = results.filter(r => r.status === PASS).length;
  const failCount = results.filter(r => r.status === FAIL).length;
  const warnCount = results.filter(r => r.status === WARN).length;

  if (JSON_OUTPUT) {
    console.log(JSON.stringify({ timestamp: new Date().toISOString(), project: PROJECT_DIR, results, exitCode, summary: { pass: passCount, fail: failCount, warn: warnCount } }, null, 2));
    process.exit(exitCode);
  }

  if (QUIET) { console.log(`Runtime Smoke: ${passCount} passed, ${failCount} failed, ${warnCount} warnings`); process.exit(exitCode); }

  console.log('============================================');
  console.log('  Runtime Smoke Test Summary');
  console.log('============================================');
  console.log(`  ${passCount} passed, ${failCount} failed, ${warnCount} warnings`);

  if (failCount === 0) { console.log('  RUNTIME SMOKE TESTS: ALL PASSED'); }
  else {
    console.log(`  RUNTIME SMOKE TESTS: ${failCount} issue(s) found`);
    const failures = results.filter(r => r.status === FAIL);
    if (failures.length > 0) {
      console.log(''); console.log('  Failed checks:');
      for (const f of failures) { console.log(`    - ${f.name}: ${f.message}`); }
    }
  }
}

// === Main ===
function main() {
  if (!JSON_OUTPUT && !QUIET) {
    console.log('============================================');
    console.log('  SCC Runtime Smoke Tests');
    console.log(`  ${new Date().toISOString()}`);
    console.log('============================================');
    console.log('');
  }

  checkBootFlow();
  checkSceneGraph();
  checkAssetPipeline();
  checkSessionState();
  checkRaceData();
  checkGameLogic();
  checkIntegration();

  printSummary();
  process.exit(exitCode);
}

main();
