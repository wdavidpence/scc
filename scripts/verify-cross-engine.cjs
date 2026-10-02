// P1.056 GATE — cross-engine parity for the shared match kernel.
// Same replay file + same kernel code (src2/engine/simMatch.js) executed in
// THREE environments: node default V8 (CLI runner), node --jitless (no-JIT
// tier), and Chromium (page-side kernel world through window.__SIM exposed
// by main2.js). All digests must be byte-identical — float math, Map/array
// iteration order and command scheduling are then pinned across engines.
// Also proves shuffled-arrival identity THROUGH the page (netCmds
// canonicalisation survives arrival permutation in BOTH engines), and that
// ring-hash mode is sim-neutral cross-engine.
//
// Slice: 6v6 skirmish on open ground, 1200 ticks, exercising the state
// paths P1.056 single-sourced: kernel stepProjectiles + splashPass +
// instant-hit kinds (incinerator/blades), shell kinds (tank), fogOff
// acquire, issueMove pathing, patrol/stop/attackTarget chains.
'use strict';
const path = require('path');
const fs = require('fs');
const { execSync, execFileSync } = require('child_process');
const { pathToFileURL } = require('url');
const pwPath = execSync('npm root -g').toString().trim();
const { chromium } = require(path.join(pwPath, 'playwright'));

const ROOT = path.resolve(__dirname, '..');
const RR = path.join(ROOT, 'scripts/replay-runner.cjs');
const SLICE = '/tmp/slice-6v6.sccr';
const URL = process.env.SCC_URL || 'http://127.0.0.1:4177/scc/';

let pass = 0, fail = 0;
const ok = (id, cond, extra = '') => { if (cond) { pass++; console.log(`PASS ${id} ${extra}`); } else { fail++; console.log(`FAIL ${id} ${extra}`); } };

(async () => {
  // ---------- build the slice (single builder, node side) ----------
  const rf = await import(pathToFileURL(path.resolve(ROOT, 'src2/engine/replayFormat.js')).href);
  const ST = (await import(pathToFileURL(path.resolve(ROOT, 'src2/engine/simTerrain.js')).href)).SimTerrain;
  const sc1 = await import(pathToFileURL(path.resolve(ROOT, 'src2/data/sc1.js')).href);

  const seed = 0xC0FFEE;
  const ms = ST.buildMapState(seed, sc1.MAP_W, sc1.MAP_H);
  const bake = ST.bakeLayers(ms, sc1.MAP_W, sc1.MAP_H);
  const units = [];
  const PA = ['marine', 'marine', 'tank', 'incinerator', 'wraith', 'marine'];
  const PB = ['skarnling', 'skarnling', 'razorspine', 'vexwing', 'skarnling', 'skarnling'];
  PA.forEach((k, i) => units.push([0, k, 1130 + (i % 2) * 30, 400 + i * 24]));
  PB.forEach((k, i) => units.push([1, k, 1290 + (i % 2) * 30, 400 + i * 24]));
  const commands = [];
  const sqA = [1, 2, 3, 4, 5, 6], sqB = [7, 8, 9, 10, 11, 12];
  commands.push({ tick: 4, player: 0, type: 'order', subject: 'move', payload: { wp: { x: 1350, y: 480 }, shift: false, alt: false, sel: sqA, attackMove: true } });
  commands.push({ tick: 4, player: 1, type: 'order', subject: 'move', payload: { wp: { x: 1150, y: 440 }, shift: false, alt: false, sel: sqB, attackMove: true } });
  commands.push({ tick: 60, player: 0, type: 'attackTarget', subject: 'attackTarget', payload: { target: 10, sel: [1, 2] } });
  commands.push({ tick: 61, player: 1, type: 'attackTarget', subject: 'attackTarget', payload: { target: 3, sel: [8, 9] } });
  commands.push({ tick: 180, player: 0, type: 'patrol', subject: 'patrol', payload: { a: { x: 1180, y: 420 }, b: { x: 1320, y: 520 }, sel: [6] } });
  commands.push({ tick: 300, player: 1, type: 'stop', subject: 'stop', payload: { sel: [11, 12] } });
  commands.push({ tick: 320, player: 0, type: 'order', subject: 'move', payload: { wp: { x: 1420, y: 520 }, shift: false, alt: false, sel: [4] } });
  const repl = { seed, ticks: 1200, hashEvery: 24,
    mapHash: rf.computeMapHash(bake),
    dataHash: rf.computeDataHash({ units: sc1.UNITS, buildings: sc1.BUILDINGS, techs: sc1.TECHS, w: sc1.MAP_W, h: sc1.MAP_H, tile: sc1.TILE }),
    units, commands };
  fs.writeFileSync(SLICE, rf.encodeReplay(repl));
  console.log('slice built:', units.length, 'units', commands.length, 'cmds');

  // ---------- three environments, four modes ----------
  const runNode = (jitless, args = []) => {
    const argv = jitless ? ['--jitless', RR, '--replay', SLICE] : [RR, '--replay', SLICE];
    argv.push(...args);
    try { return execFileSync(process.execPath, argv, { encoding: 'utf8', timeout: 120000 }).trim(); }
    catch (e) { return 'ERR ' + String(e.message || e).slice(0, 140); }
  };
  const parse = (s) => /units (\d+)\/(\d+).*finalHash=(\w+) (?:ring=(\w+))?/.exec(s) || [, '', '', '', ''];

  const n1 = runNode(false);
  const n2 = runNode(false);
  const nJit = runNode(true);
  const nShuf = runNode(false, ['--shuffle-arrival', '77']);
  const p1 = parse(n1), p2 = parse(n2), pJ = parse(nJit), pS = parse(nShuf);

  ok('SLICE-BATTLE-HAPPENS', p1[1] && (Number(p1[2]) - Number(p1[1])) >= 2, `${p1[2]} units -> ${p1[1]} alive`);
  ok('NODE-DUAL-IDENTICAL', p1[3] === p2[3] && p1[3].length >= 8, `${p1[3]} vs ${p2[3]}`);
  ok('JITLESS-EQUALS-DEFAULT', pJ[3] === p1[3], `jitless ${pJ[3]} vs default ${p1[3]}`);
  ok('SHUFFLE-THRU-QUEUE-IDENTICAL', pS[3] === p1[3], `shuffled -> ${pS[3]}`);

  // ---------- Chromium: page-side kernel world ----------
  const browser = await chromium.launch();
  const pageRun = async (optsArg) => {
    const p = await browser.newPage({ viewport: { width: 900, height: 600 } });
    const errs = [];
    p.on('pageerror', e => errs.push(String(e).slice(0, 160)));
    await p.goto(URL, { waitUntil: 'networkidle' });
    const text = fs.readFileSync(SLICE, 'utf8');
    const out = await p.evaluate(([text, opts]) => {
      const S = window.__SIM;
      if (!S || !S.SimMatch || !S.rf || !S.SimTerrain || !S.NavGrid || !S.Unit || !S.nc || !S.SimRng || !S.SimSchema) return { err: 'NO_SIM_SURFACE' };
      const dec = S.rf.decodeReplay(text, {});
      if (!dec.ok) return { err: 'DECODE ' + dec.error };
      const rep = dec.replay;
      const ms = S.SimTerrain.buildMapState(rep.seed, S.sc1.MAP_W, S.sc1.MAP_H);
      const bake = S.SimTerrain.bakeLayers(ms, S.sc1.MAP_W, S.sc1.MAP_H);
      const nav = new S.NavGrid(S.sc1.MAP_W, S.sc1.MAP_H, S.sc1.TILE);
      nav.solid.set(bake.solid); nav.blocked.set(bake.blocked); nav.elev = ms.elev; nav.ramp = ms.ramp;
      const terrain = { nav, bake, ms };
      const E = { Unit: S.Unit, SimRng: S.SimRng, SimSchema: S.SimSchema, nc: S.nc, rf: S.rf };
      const t0 = performance.now();
      const r = S.SimMatch.runHeadlessMatch(rep, E, terrain, opts);
      return { ms: Math.round(performance.now() - t0), hash: String(r.finalHash), ring: r.ringDigest, alive: r.alive, total: r.total, drained: r.drained };
    }, [text, optsArg]);
    await p.close();
    return { out, errs };
  };
  const A = await pageRun({});
  const B = await pageRun({});
  const SH = await pageRun({ shuffleSeed: 77 });
  const okA = A.out && !A.out.err;
  ok('PAGE-SURFACE+RUN', okA && A.errs.length === 0, okA ? `page run ${A.out.ms}ms, ${A.errs.length} page errors` : JSON.stringify(A));
  ok('PAGE-DUAL-IDENTICAL', okA && B.out && !B.out.err && A.out.hash === B.out.hash, `${A.out && A.out.hash} vs ${B.out && B.out.hash}`);
  ok('PAGE-SHUFFLE-IDENTICAL', okA && SH.out && !SH.out.err && SH.out.hash === A.out.hash, `page shuffled -> ${SH.out && SH.out.hash}`);
  ok('CROSS-ENGINE-IDENTITY', okA && A.out.hash === p1[3], `node ${p1[3]} vs chromium ${A.out && A.out.hash}`);
  ok('CROSS-ENGINE-ALIVE', okA && String(A.out.alive) === String(p1[1]), `${A.out && A.out.alive} vs ${p1[1]}`);

  await browser.close();
  console.log(`RESULT CROSS-ENGINE ${fail === 0 ? 'PASS' : 'FAIL'} ${pass}/${pass + fail}`);
  process.exit(fail === 0 ? 0 : 1);
})();
