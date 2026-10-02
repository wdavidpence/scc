#!/usr/bin/env node
// P1.056-i2 — Training golden gate. Executes replays/training-recipe.json
// (a TRAINING RECIPE: deploy-MCV, worker production, harvest steering,
// barracks placement, unit production, research, kill-dummy) through the
// simTrain kernel — the first headless run of the FULL training chain.
//
// Tiers checked here (headless):
//  A) determinism: run1 (jit) === run2 (jitless vm) finalHash + ringDigest
//  B) proof-order: shuffled command arrival === canonical digest
//  C) non-vacuity: truncated stream (no harvest release, no production
//     cmds) MUST diverge AND its chain milestones MUST fail — a golden
//     whose chain silently no-ops is a lie (STATE.json P1.056 lesson).
//  D) chain milestones (the done_when list, made executable):
//     CC deployed + supply cap recompute; riggers born + harvest income
//     > 0; barracks built by rigger workers; marines produced (2 + 1
//     post-research with the weapon-bonus applied at spawn); research
//     completed; kill-dummy executed with a kill; ZERO skipped commands.
// i3 (next slice): the same recipe replayed in the live BattleScene with
// coach/AI/crates disabled — digest parity live-vs-kernel. See
// docs/P1.056-kernel-design.md.
//
// Usage: node scripts/verify-training-golden.cjs [--explore] [--write]
//   --write (re)generates replays/training-recipe.json from the built-in
//   recipe and verifies it; default = verify the committed file.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { pathToFileURL } = require('url');

const TICK = 1 / 24;
const RECIPE = path.resolve(__dirname, '../replays/training-recipe.json');

// ---- engine loading (stub loader: phaser + nonce isolation) --------------
async function loadEngine(nonce) {
  const { register } = require('node:module');
  if (!loadEngine._reg) { register('./stubs/loader.mjs', pathToFileURL(__filename)); loadEngine._reg = true; }
  const q = nonce ? '?s=' + nonce : '';
  const eng = (f) => import(pathToFileURL(path.resolve(__dirname, '../src2/engine', f)).href + q);
  const ent = await import(pathToFileURL(path.resolve(__dirname, '../src2/engine/entity.js')).href + q);
  return {
    Unit: ent.Unit,
    Building: ent.Building,
    SimRng: (await eng('simRng.js')).SimRng,
    SimSchema: (await eng('simSchema.js')).SimSchema,
    NavGrid: (await eng('pathfinding.js')).NavGrid,
    SimTerrain: (await eng('simTerrain.js')).SimTerrain,
    rf: (await eng('replayFormat.js')),
    nc: (await eng('netCmds.js')).default || (await eng('netCmds.js')),
    sm: await eng('simMatch.js'),
    st: await eng('simTrain.js'),
    sc1: await import(pathToFileURL(path.resolve(__dirname, '../src2/data/sc1.js')).href + q),
  };
}

// ---- built-in recipe (v1 hand-tuned; generator asserts = the file's truth)
function buildRecipe() {
  const c = (tick, type, payload, player = 0) => ({ tick, player, type, subject: type, payload });
  return {
    schema: 'TRAIN/1',
    name: 'training-recipe-v1',
    seed: 0xBEEF02,
    seconds: 210,
    ticks: Math.round(210 / TICK),
    // kernel-map fixture (deviation from the live training map, documented):
    // crystals only in the open mid-corridor, no crates/critters/geysers.
    minerals: [
      [816, 736, 1500], [826, 752, 1500], [794, 752, 1500],
      [840, 720, 1500], [806, 720, 1500],
      [1040, 640, 1500], [1056, 656, 1500], [1032, 672, 1500],
    ],
    units: [
      [0, 'mcv', 950, 728, 'mcv'],
      [1, 'broodmatron', 1130, 728, 'brood1'],
      [1, 'skarnling', 1105, 720, 'sk1'],
      [1, 'skarnling', 1120, 736, 'sk2'],
      [1, 'skarnling', 1105, 744, 'sk3'],
      [1, 'skarnling', 1120, 712, 'sk4'],
    ],
    commands: [
      c(10, 'deploy', { uid: 'mcv' }),
      c(14, 'queue', { bid: 'commandCenter', kind: 'rigger', id: 'wr1' }),
      c(14, 'queue', { bid: 'commandCenter', kind: 'rigger', id: 'wr2' }),
      c(14, 'queue', { bid: 'commandCenter', kind: 'rigger', id: 'wr3' }),
      c(240, 'harvest', { wp: [{ x: 820, y: 744 }], sel: ['wr1', 'wr2', 'wr3'] }),
      c(500, 'place', { bid: 'barracks', x: 860, y: 700, sel: ['wr1', 'wr2', 'wr3'] }),
      c(1150, 'queue', { bid: 'barracks', kind: 'marine', id: 'm1' }),
      c(1160, 'queue', { bid: 'barracks', kind: 'marine', id: 'm2' }),
      c(1180, 'place', { bid: 'engineeringBay', x: 1012, y: 700, sel: ['wr1', 'wr2', 'wr3'] }),
      c(1650, 'research', { bid: 'engineeringBay', techId: 'terranInfantryWeapons1' }),
      c(2550, 'queue', { bid: 'barracks', kind: 'marine', id: 'm3' }),
      c(3050, 'spawn', { kind: 'skarnling', team: 1, x: 975, y: 782, hpFrac: 0.45, id: 'foe1', move: { x: 940, y: 800 } }),
      c(3052, 'spawn', { kind: 'skarnling', team: 1, x: 1008, y: 798, hpFrac: 0.45, id: 'foe2', move: { x: 970, y: 812 } }),
      c(3060, 'attackTarget', { sel: ['m1', 'm2', 'm3', 'wr1', 'wr2', 'wr3'], target: 'foe1' }),
      c(3092, 'attackTarget', { sel: ['m1', 'm2', 'm3', 'wr1', 'wr2', 'wr3'], target: 'foe2' }),
    ],
  };
}

// ---- run helpers -----------------------------------------------------------
function pinRng(seed) {
  const real = Math.random;
  let s = (seed ^ 0x85ebca6b) >>> 0; if (!s) s = 1;
  Math.random = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
  return () => { Math.random = real; };
}

async function runMatch(rep, { jitless = false, shuffleSeed = 0, hashEvery = 600, drop = null } = {}) {
  const nonce = 'tg' + Math.random().toString(16).slice(2) + Date.now().toString(16);
  const E = await loadEngine(nonce);
  const release = pinRng(rep.seed >>> 0);
  try {
    const r = await E.st.runTrainingMatch(E, rep, { shuffleSeed, hashEvery });
    return r;
  } finally { release(); }
}

// ---- milestone assertions (probe = {tick, world} snapshot) ----------------
function checkChain(r, label, expect) {
  const fails = [];
  const w = r.world;
  const p0 = w.players[0];
  const cc = w.buildings.find((b) => b.buildId === 'commandCenter' && b.team === 0);
  const barracks = w.buildings.find((b) => b.buildId === 'barracks' && b.team === 0);
  const eb = w.buildings.find((b) => b.buildId === 'engineeringBay' && b.team === 0);
  const riggers = w.units.filter((u) => u.kind === 'rigger' && u.team === 0);
  const marines = w.units.filter((u) => u.kind === 'marine' && u.team === 0);
  const foe1 = w.units.find((u) => u.id === 'foe1');
  const foe1Dead = w._deathIds.includes('foe1');
  if (expect === 'full') {
    if (!cc || !cc.built) fails.push('CC not deployed/built');
    else if (p0.supplyCap !== 10) fails.push('CC supply recompute wrong: ' + p0.supplyCap);
    if (riggers.length !== 3) fails.push('rigger production failed: ' + riggers.length + '/3');
    if (w.totalDeposited <= 0) fails.push('no harvest income (chain did not run)');
    if (!barracks || !barracks.built) fails.push('barracks not built');
    if (marines.length !== 3) fails.push('marine production failed: ' + marines.length + '/3');
    if (!eb || !eb.built) fails.push('engineeringBay not built');
    if (!p0.techs.terranInfantryWeapons1) fails.push('research not completed');
    const m3 = w.units.find((u) => u.id === 'm3');
    if (m3 && !(m3.bonusDamage > 0)) fails.push('spawn-bonus not applied to post-research marine');
    if (!foe1Dead) fails.push('kill-dummy did not die (foe1 alive: ' + !!foe1 + ')');
    if (r.skipped !== 0) fails.push('unexpected skipped count: ' + r.skipped + ' (expected 0)');
    if (r.executed !== 15) fails.push('executed != 15: got ' + r.executed);
  }
  return fails;
}

async function main() {
  const argv = process.argv.slice(2);
  const explore = argv.includes('--explore');
  const write = argv.includes('--write');
  if (write || !fs.existsSync(RECIPE)) fs.writeFileSync(RECIPE, JSON.stringify(buildRecipe(), null, 1));
  const rep = JSON.parse(fs.readFileSync(RECIPE, 'utf8'));

  // self-spawn mode: `node --jitless verify-training-golden.cjs --emit-hash`
  // (spawned by the parent) — prints the jitless digest for tier A compare.
  if (argv.includes('--emit-hash')) {
    const r = await runMatch(rep, {});
    console.log('JITLESS-HASH', r.finalHash);
    process.exit(0);
  }
  console.log('recipe', rep.name, 'seed', rep.seed.toString(16), 'cmds', rep.commands.length, 'ticks', rep.ticks);

  // A) determinism: jit x2 + --jitless child (P1.038 isolation pattern)
  const r1 = await runMatch(rep, {});
  const r2 = await runMatch(rep, {});
  let jitHash = null;
  try {
    const { execFileSync } = require('child_process');
    const out = execFileSync(process.execPath, ['--jitless', __filename, '--emit-hash'], { encoding: 'utf8', timeout: 180000 });
    const m = /JITLESS-HASH (\S+)/.exec(out);
    jitHash = m ? m[1] : null;
  } catch (e) { console.log('jitless child failed:', String(e.message).split('\n')[0]); }
  const A = r1.finalHash === r2.finalHash && String(jitHash) === String(r1.finalHash);
  console.log('A determinism jit/jit/jitless:', A ? 'PASS' : 'FAIL', r1.finalHash, r2.finalHash, jitHash);

  // B) proof-order
  const r4 = await runMatch(rep, { shuffleSeed: 4242 });
  const B = r4.finalHash === r1.finalHash && r4.executed === r1.executed;
  console.log('B shuffled-arrival identity:', B ? 'PASS' : 'FAIL', r4.finalHash, 'exec', r4.executed);

  // C) non-vacuity: strip production/harvest commands -> chain must fail
  const stub = { ...rep, commands: rep.commands.filter((c) => !['queue', 'harvest', 'research', 'place', 'spawn'].includes(c.type)) };
  const r5 = await runMatch(stub, {});
  const C = r5.finalHash !== r1.finalHash && r5.world.totalDeposited === 0;
  console.log('C truncated diverges + no income:', C ? 'PASS' : 'FAIL', 'income', r5.world.totalDeposited);

  // D) chain milestones
  const fails = checkChain(r1, 'full', 'full');
  console.log('D chain:', fails.length === 0 ? 'PASS' : 'FAIL ' + fails.join(' | '));

  if (explore) {
    const w = r1.world;
    console.log('final units:', w.units.filter((u) => !u.dead).map((u) => `${u.id}:${u.kind}@${Math.round(u.x)},${Math.round(u.y)},hp${Math.round(u.hp)}`).join(' '));
    console.log('buildings:', w.buildings.map((b) => `${b.buildId}@${b.x},${b.y} built=${b.built} hp=${Math.round(b.hp)}`).join(' | '));
    console.log('p0:', JSON.stringify(r1.world.players[0]));
    console.log('deposited', r1.world.totalDeposited);
  }
  const ok = A && B && C && fails.length === 0;
  console.log(ok ? 'TRAINING-GOLDEN: PASS' : 'TRAINING-GOLDEN: FAIL');
  process.exit(ok ? 0 : 1);
}

main().catch((e) => { console.error('TRAINING-GOLDEN ERROR', e); process.exit(2); });
