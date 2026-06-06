/**
 * ai-difficulty-runtime-smoke.js — Verify AI difficulty runtime integration.
 *
 * Checks that the critical source patterns exist and are wired correctly:
 *   - getDifficulty(session.difficultyId)
 *   - enemyStartingMinerals / enemyStartingSupplyCap / enemyIncomeMultiplier
 *   - getEnemyWaveInterval(this.aiDifficulty, ...)
 *   - enemyTechWave / enemySignatureWave / enemySignatureCadence
 *
 * Also runs runtime assertions on the actual exported values:
 *   - DIFFICULTY_ORDER is exactly ['easy','normal','hard'] with all ids present
 *   - getDifficulty('missing') returns DIFFICULTIES.normal (fallback)
 *   - enemyStartingMinerals / enemyIncomeMultiplier increase easy -> normal -> hard
 *   - enemyWaveStart / enemyWaveFloor decrease easy -> normal -> hard
 *   - getEnemyWaveInterval respects each floor and decreases/stays flat for waves 0..8
 *
 * Usage:
 *   node scripts/qa/ai-difficulty-runtime-smoke.js
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

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

function readSource(relativePath) {
  try {
    return readFileSync(join(PROJECT_DIR, relativePath), 'utf-8');
  } catch {
    return null;
  }
}

// --- Source files to inspect ---
const DIFFICULTIES = 'src/game/data/difficulties.js';
const GAME_SCENE   = 'src/scenes/GameScene.js';
const TITLE_SCENE  = 'src/scenes/TitleScene.js';
const GAME_SESSION = 'src/game/state/gameSession.js';

// Read all sources once
const srcDifficulties = readSource(DIFFICULTIES);
const srcGameScene  = readSource(GAME_SCENE);
const srcTitleScene = readSource(TITLE_SCENE);
const srcGameSession = readSource(GAME_SESSION);

// --- Pattern checks ---

// 1. getDifficulty(session.difficultyId) — must appear in GameScene.js
check('getDifficulty(session.difficultyId)',
  srcGameScene && /getDifficulty\s*\(\s*session\.difficultyId\s*\)/.test(srcGameScene),
  'GameScene.js imports getDifficulty and calls it with session.difficultyId');

// 2. enemyStartingMinerals — defined in difficulties.js, used in GameScene.js
const hasDefMinerals = srcDifficulties && /enemyStartingMinerals\s*:\s*\d+/.test(srcDifficulties);
const hasUseMinerals = srcGameScene && /enemyStartingMinerals/.test(srcGameScene);
check('enemyStartingMinerals', hasDefMinerals && hasUseMinerals,
  'defined in difficulties.js and referenced in GameScene.js');

// 3. enemyStartingSupplyCap
const hasDefSupply = srcDifficulties && /enemyStartingSupplyCap\s*:\s*\d+/.test(srcDifficulties);
const hasUseSupply = srcGameScene && /enemyStartingSupplyCap/.test(srcGameScene);
check('enemyStartingSupplyCap', hasDefSupply && hasUseSupply,
  'defined in difficulties.js and referenced in GameScene.js');

// 4. enemyIncomeMultiplier
const hasDefIncome = srcDifficulties && /enemyIncomeMultiplier\s*:\s*[\d.]+/.test(srcDifficulties);
const hasUseIncome = srcGameScene && /enemyIncomeMultiplier/.test(srcGameScene);
check('enemyIncomeMultiplier', hasDefIncome && hasUseIncome,
  'defined in difficulties.js and referenced in GameScene.js');

// 5. getEnemyWaveInterval(this.aiDifficulty, ...)
check('getEnemyWaveInterval(this.aiDifficulty, ...)',
  srcGameScene && /getEnemyWaveInterval\s*\(\s*this\.aiDifficulty/.test(srcGameScene),
  'GameScene.js calls getEnemyWaveInterval with this.aiDifficulty');

// 6. enemyTechWave — defined in difficulties.js, used in GameScene.js
const hasDefTech = srcDifficulties && /enemyTechWave\s*:\s*\d+/.test(srcDifficulties);
const hasUseTech = srcGameScene && /enemyTechWave/.test(srcGameScene);
check('enemyTechWave', hasDefTech && hasUseTech,
  'defined in difficulties.js and referenced in GameScene.js');

// 7. enemySignatureWave
const hasDefSig = srcDifficulties && /enemySignatureWave\s*:\s*\d+/.test(srcDifficulties);
const hasUseSig = srcGameScene && /enemySignatureWave/.test(srcGameScene);
check('enemySignatureWave', hasDefSig && hasUseSig,
  'defined in difficulties.js and referenced in GameScene.js');

// 8. enemySignatureCadence
const hasDefCad = srcDifficulties && /enemySignatureCadence\s*:\s*\d+/.test(srcDifficulties);
const hasUseCad = srcGameScene && /enemySignatureCadence/.test(srcGameScene);
check('enemySignatureCadence', hasDefCad && hasUseCad,
  'defined in difficulties.js and referenced in GameScene.js');

// --- Runtime assertions (import the actual module) ---
let imported;
try {
  imported = await import('../../src/game/data/difficulties.js');
} catch (e) {
  check('import difficulties module', false, 'could not import: ' + e.message);
  imported = null;
}

if (imported) {
  const { DIFFICULTY_ORDER, DIFFICULTIES, getDifficulty, getEnemyWaveInterval } = imported;

  // R1: DIFFICULTY_ORDER is exactly ['easy','normal','hard']
  const orderMatch = Array.isArray(DIFFICULTY_ORDER) &&
    DIFFICULTY_ORDER.length === 3 &&
    DIFFICULTY_ORDER[0] === 'easy' &&
    DIFFICULTY_ORDER[1] === 'normal' &&
    DIFFICULTY_ORDER[2] === 'hard';
  check('DIFFICULTY_ORDER is exactly [easy,normal,hard]', orderMatch,
    DIFFICULTY_ORDER ? JSON.stringify(DIFFICULTY_ORDER) : 'not exported');

  // R2: every id in DIFFICULTY_ORDER exists in DIFFICULTIES
  const allIdsPresent = orderMatch && DIFFICULTY_ORDER.every(id => id in DIFFICULTIES);
  check('every DIFFICULTY_ORDER id exists in DIFFICULTIES', allIdsPresent,
    orderMatch ? 'all ' + DIFFICULTY_ORDER.join(', ') + ' found' : 'order mismatch');

  // R3: getDifficulty('missing') returns DIFFICULTIES.normal
  const fallbackOk = imported.getDifficulty &&
    imported.getDifficulty('missing') === DIFFICULTIES.normal;
  check("getDifficulty('missing') returns normal", fallbackOk,
    fallbackOk ? 'fallback works' : "getDifficulty missing or wrong fallback");

  // R4: enemyStartingMinerals increases easy -> normal -> hard
  const dEasy = DIFFICULTIES.easy;
  const dNormal = DIFFICULTIES.normal;
  const dHard = DIFFICULTIES.hard;
  const mineralsOk = dEasy && dNormal && dHard &&
    dEasy.enemyStartingMinerals < dNormal.enemyStartingMinerals &&
    dNormal.enemyStartingMinerals < dHard.enemyStartingMinerals;
  check('enemyStartingMinerals increases easy->normal->hard', mineralsOk,
    mineralsOk ? `${dEasy.enemyStartingMinerals} < ${dNormal.enemyStartingMinerals} < ${dHard.enemyStartingMinerals}` : 'mineral scaling wrong');

  // R5: enemyIncomeMultiplier increases easy -> normal -> hard
  const incomeOk = dEasy && dNormal && dHard &&
    dEasy.enemyIncomeMultiplier < dNormal.enemyIncomeMultiplier &&
    dNormal.enemyIncomeMultiplier < dHard.enemyIncomeMultiplier;
  check('enemyIncomeMultiplier increases easy->normal->hard', incomeOk,
    incomeOk ? `${dEasy.enemyIncomeMultiplier} < ${dNormal.enemyIncomeMultiplier} < ${dHard.enemyIncomeMultiplier}` : 'income scaling wrong');

  // R6: enemyWaveStart decreases easy -> normal -> hard
  const waveStartOk = dEasy && dNormal && dHard &&
    dEasy.enemyWaveStart > dNormal.enemyWaveStart &&
    dNormal.enemyWaveStart > dHard.enemyWaveStart;
  check('enemyWaveStart decreases easy->normal->hard', waveStartOk,
    waveStartOk ? `${dEasy.enemyWaveStart} > ${dNormal.enemyWaveStart} > ${dHard.enemyWaveStart}` : 'waveStart scaling wrong');

  // R7: enemyWaveFloor decreases easy -> normal -> hard
  const waveFloorOk = dEasy && dNormal && dHard &&
    dEasy.enemyWaveFloor > dNormal.enemyWaveFloor &&
    dNormal.enemyWaveFloor > dHard.enemyWaveFloor;
  check('enemyWaveFloor decreases easy->normal->hard', waveFloorOk,
    waveFloorOk ? `${dEasy.enemyWaveFloor} > ${dNormal.enemyWaveFloor} > ${dHard.enemyWaveFloor}` : 'waveFloor scaling wrong');

  // R8: getEnemyWaveInterval respects each difficulty floor and decreases/stays flat for waves 0..8
  let intervalOk = true;
  let intervalMsg = '';
  if (dEasy && dNormal && dHard) {
    const diffs = [dEasy, dNormal, dHard];
    const labels = ['easy', 'normal', 'hard'];
    const allIntervals = [];
    for (const [idx, d] of diffs.entries()) {
      const vals = [];
      for (let w = 0; w <= 8; w++) {
        const v = getEnemyWaveInterval(d, w);
        vals.push(v);
      }
      allIntervals.push({ label: labels[idx], values: vals, floor: d.enemyWaveFloor });
    }

    // Check: for each difficulty, values decrease or stay flat as wave increases
    for (const { label, values } of allIntervals) {
      for (let i = 1; i < values.length; i++) {
        if (values[i] > values[i - 1]) {
          intervalOk = false;
          intervalMsg += `${label} wave ${i-1}->${i}: ${values[i-1]} -> ${values[i]} (increased)`;
        }
      }
    }

    // Check: each value >= floor for that difficulty
    for (const { label, values, floor } of allIntervals) {
      for (let i = 0; i < values.length; i++) {
        if (values[i] < floor) {
          intervalOk = false;
          intervalMsg += `${label} wave ${i}: ${values[i]} < floor ${floor}`;
        }
      }
    }

    if (intervalOk) {
      const summary = allIntervals.map(d => `${d.label}: [${d.values.join(', ')}] floor=${d.floor}`).join('; ');
      intervalMsg = summary;
    } else {
      intervalMsg = intervalMsg.trim();
    }
  } else {
    intervalOk = false;
    intervalMsg = 'missing difficulty defs for interval check';
  }
  check('getEnemyWaveInterval respects floors and decreases/stays flat (waves 0..8)', intervalOk, intervalMsg);
}

// --- Summary ---
if (JSON_OUTPUT) {
  console.log(JSON.stringify({ results, total: results.length, passed: results.filter(r => r.status === PASS).length, failed: results.filter(r => r.status === FAIL).length, exitCode }));
} else {
  const passed = results.filter(r => r.status === PASS).length;
  const failed = results.filter(r => r.status === FAIL).length;
  console.log(`\nAI difficulty runtime smoke: ${passed}/${results.length} passed, ${failed} failed.`);
  if (failed > 0) {
    console.log('FAIL — one or more source patterns are missing or broken.');
  } else {
    console.log('ALL CHECKS PASSED — AI difficulty system is wired correctly.');
  }
}

process.exit(exitCode);
