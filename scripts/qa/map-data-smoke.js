/**
 * map-data-smoke.js — Executable map data regression gate.
 *
 * Imports MAP_ORDER, MAPS, and getMap from src/game/data/maps.js
 * and verifies structural invariants at runtime.
 *
 * Usage:
 *   npm run qa:map-data
 *   node scripts/qa/map-data-smoke.js [--json] [--quiet]
 */

import { MAP_ORDER, MAPS, getMap } from '../../src/game/data/maps.js';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_DIR = resolve(__dirname, '../..');

// --- Flags ---
const ARGS = process.argv.slice(2);
const JSON_OUTPUT = ARGS.includes('--json');
const QUIET = ARGS.includes('--quiet');

const PASS = 'PASS';
const FAIL = 'FAIL';
let results = [];
let exitCode = 0;

function check(name, condition, message) {
  const status = condition ? PASS : FAIL;
  results.push({ name, status, message });
  if (status === FAIL) exitCode = 1;
  if (!JSON_OUTPUT && !QUIET) {
    const prefix = status === PASS ? '[PASS]' : '[FAIL]';
    console.log(`  ${prefix} ${name}: ${message}`);
  }
  return status;
}

// --- 1. MAP_ORDER exactly matches Object.keys(MAPS) in order ---
const actualKeys = Object.keys(MAPS);
check('MAP_ORDER matches Object.keys(MAPS) order',
  JSON.stringify(MAP_ORDER) === JSON.stringify(actualKeys),
  `MAP_ORDER: [${MAP_ORDER.join(', ')}] == keys: [${actualKeys.join(', ')}]`);

// --- 2. getMap('missing') returns baseline map ---
const missingResult = getMap('missing');
const baseline = MAPS.baseline;
check("getMap('missing') returns baseline",
  missingResult === baseline,
  'getMap falls back to MAPS.baseline for unknown keys');

// --- 3. Per-map invariants ---
const seenLabels = new Set();
let allGasValid = true;
let allSlotsFinite = true;
const gasSignatures = new Set();
const playerSlotSignatures = new Set();

for (const mapKey of MAP_ORDER) {
  const map = MAPS[mapKey];

  // id equals key
  check(`${mapKey}: id === mapKey`,
    map.id === mapKey,
    `id="${map.id}"`);

  // nonempty unique label
  const hasLabel = typeof map.label === 'string' && map.label.length > 0;
  const uniqueLabel = !seenLabels.has(map.label);
  seenLabels.add(map.label);
  check(`${mapKey}: unique nonempty label`,
    hasLabel && uniqueLabel,
    `label="${map.label}" (unique=${uniqueLabel})`);

  // at least 2 gasGeysers
  const geyserCount = Array.isArray(map.gasGeysers) ? map.gasGeysers.length : 0;
  check(`${mapKey}: >= 2 gasGeysers (${geyserCount})`,
    geyserCount >= 2,
    `${geyserCount} gasGeysers`);

  // at least 2 playerBuildSlots
  const playerCount = Array.isArray(map.playerBuildSlots) ? map.playerBuildSlots.length : 0;
  check(`${mapKey}: >= 2 playerBuildSlots (${playerCount})`,
    playerCount >= 2,
    `${playerCount} playerBuildSlots`);

  // at least 2 enemyBuildSlots
  const enemyCount = Array.isArray(map.enemyBuildSlots) ? map.enemyBuildSlots.length : 0;
  check(`${mapKey}: >= 2 enemyBuildSlots (${enemyCount})`,
    enemyCount >= 2,
    `${enemyCount} enemyBuildSlots`);

  // gas geyser x/y in [0,1], amount > 0
  if (Array.isArray(map.gasGeysers)) {
    for (let i = 0; i < map.gasGeysers.length; i++) {
      const g = map.gasGeysers[i];
      const gxValid = typeof g.x === 'number' && g.x >= 0 && g.x <= 1;
      const gyValid = typeof g.y === 'number' && g.y >= 0 && g.y <= 1;
      const gAmtValid = typeof g.amount === 'number' && g.amount > 0;
      if (!gxValid || !gyValid || !gAmtValid) allGasValid = false;
      check(`${mapKey} geyser[${i}]: x,y in [0,1], amount>0`,
        gxValid && gyValid && gAmtValid,
        `x=${g.x}, y=${g.y}, amount=${g.amount}`);

      // gas-layout signature: sorted list of (x,y) pairs as string
      gasSignatures.add(`[${map.gasGeysers.map(g => `${g.x.toFixed(2)},${g.y.toFixed(2)}`).sort().join('|')}]`);
    }
  }

  // build slots have finite numeric x/y
  const allSlots = [...(map.playerBuildSlots || []), ...(map.enemyBuildSlots || [])];
  for (let i = 0; i < allSlots.length; i++) {
    const s = allSlots[i];
    const sxFinite = typeof s.x === 'number' && isFinite(s.x);
    const syFinite = typeof s.y === 'number' && isFinite(s.y);
    if (!sxFinite || !syFinite) allSlotsFinite = false;
    check(`${mapKey} slot[${i}]: finite x,y`,
      sxFinite && syFinite,
      `x=${s.x}, y=${s.y}`);

    // player-slot signature for variety check (playerBuildSlots only)
  }
  if (Array.isArray(map.playerBuildSlots)) {
    playerSlotSignatures.add(`[${map.playerBuildSlots.map(s => `${s.x.toFixed(1)},${s.y.toFixed(1)}`).sort().join('|')}]`);
  }
}

// --- 4. Map variety: >= 3 distinct gas-layout signatures, >= 3 player-slot signatures ---
check('map variety: >= 3 distinct gas-layout signatures',
  gasSignatures.size >= 3,
  `${gasSignatures.size} distinct gas signatures found: ${[...gasSignatures].join(', ')}`);

check('map variety: >= 3 distinct player-slot signatures',
  playerSlotSignatures.size >= 3,
  `${playerSlotSignatures.size} distinct player-slot signatures found: ${[...playerSlotSignatures].join(', ')}`);

// --- Summary ---
function printSummary() {
  if (JSON_OUTPUT) {
    const passed = results.filter(r => r.status === PASS).length;
    const failed = results.filter(r => r.status === FAIL).length;
    console.log(JSON.stringify({ results, total: results.length, passed, failed, exitCode }));
  } else {
    const passed = results.filter(r => r.status === PASS).length;
    const failed = results.filter(r => r.status === FAIL).length;
    console.log(`\nMap data smoke: ${passed}/${results.length} passed, ${failed} failed.`);
    if (failed > 0) {
      console.log('FAIL - one or more map data checks failed.');
    } else {
      console.log('ALL CHECKS PASSED - map data is valid and wired correctly.');
    }
  }
}

printSummary();
process.exit(exitCode);
