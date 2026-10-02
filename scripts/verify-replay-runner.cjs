// P1.038 GATE — headless CLI match runner.
// DONE-WHEN: "a 10-minute replay executes in <10 s without browser, canvas,
// audio, or GPU". P1.038-i2 extended the runner to SCCR/1 + netCmds; the
// gate now proves BOTH replay paths and the refusal paths:
//  - legacy JSON: dual-run <10 s, byte-identical final hash (determinism),
//    seed variant diverges, generated file byte-stable;
//  - SCCR/1: 10-min 715-command battle replays <10 s; dual-run identical;
//    SHUFFLED-ARRIVAL runs (permuted delivery through netCmds) identical —
//    end-to-end proof that arrival order cannot change outcomes;
//  - refusals (exit 3): fake local map/data content hashes, corruption,
//    truncation. A runner that silently replays a wrong-content file is a
//    time bomb; refusing is the contract.
//  - 200-unit scale probe executes with time REPORTED (feeds P1.052).
'use strict';
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const RR = path.join(ROOT, 'scripts/replay-runner.cjs');
const REPLAY = path.join(ROOT, 'replays/training-10min.json');
const REPLAY_SCC = path.join(ROOT, 'replays/training-10min.sccr');
const LIMIT_MS = 10000;

let pass = 0, fail = 0;
const ok = (id, cond, extra = '') => { if (cond) { pass++; console.log(`PASS ${id} ${extra}`); } else { fail++; console.log(`FAIL ${id} ${extra}`); } };
const run = (args, timeout = 120000) => execFileSync(process.execPath, [RR, ...args], { encoding: 'utf8', timeout });
const runFail = (args) => { try { const o = run(args); return { code: 0, out: o }; } catch (e) { return { code: e.status, out: (e.stdout || '') + (e.stderr || '') }; } };
const h = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex').slice(0, 16);

const t0 = Date.now();

// ---------- legacy JSON family ----------
const gen1 = execFileSync(process.execPath, [RR, '--generate', '/tmp/rp-a.json'], { encoding: 'utf8' });
const gen2 = execFileSync(process.execPath, [RR, '--generate', '/tmp/rp-b.json'], { encoding: 'utf8' });
ok('REPLAY-GEN-STABLE', gen1.includes('GENERATED') && h('/tmp/rp-a.json') === h('/tmp/rp-b.json'), `${h('/tmp/rp-a.json')}`);

if (!fs.existsSync(REPLAY)) execFileSync(process.execPath, [RR, '--generate', REPLAY], { encoding: 'utf8' });
ok('REPLAY-COMMITTED-MATCHES-GEN', h(REPLAY) === h('/tmp/rp-a.json'));

const r1 = run(['--replay', REPLAY]);
const r2 = run(['--replay', REPLAY]);
const parse = (s) => /wallMs=(\d+).*finalHash=(\w+)/.exec(s);
const p1 = parse(r1), p2 = parse(r2);
ok('TEN-MIN-under-10s', !!p1 && Number(p1[1]) < LIMIT_MS, r1.trim());
ok('DUAL-RUN-HASH-EQUAL', !!p1 && !!p2 && p1[2] === p2[2] && Number(p1[1]) < LIMIT_MS && Number(p2[1]) < LIMIT_MS, `${p1 && p1[2]} vs ${p2 && p2[2]} (${p1 && p1[1]}ms/${p2 && p2[1]}ms)`);

const rh = run(['--replay', REPLAY, '--hash-every', '24']);
const ph = parse(rh);
ok('HASHMODE-FINAL-EQUAL', !!ph && ph[2] === p1[2], `ring mode ${ph && ph[1]}ms`);

const variant = JSON.parse(fs.readFileSync(REPLAY, 'utf8')); variant.seed = 999;
fs.writeFileSync('/tmp/rp-seed999.json', JSON.stringify(variant));
const rv = run(['--replay', '/tmp/rp-seed999.json']);
const pv = parse(rv);
ok('SEED-DIVERGES', !!pv && pv[2] !== p1[2], `${pv && pv[2]} vs ${p1 && p1[2]}`);

// ---------- SCCR/1 family ----------
execFileSync(process.execPath, [RR, '--generate-sccr', '/tmp/scc-a.txt'], { encoding: 'utf8' });
execFileSync(process.execPath, [RR, '--generate-sccr', '/tmp/scc-b.txt'], { encoding: 'utf8' });
ok('SCCR-GEN-STABLE', h('/tmp/scc-a.txt') === h('/tmp/scc-b.txt'), `${h('/tmp/scc-a.txt')}`);

if (!fs.existsSync(REPLAY_SCC)) execFileSync(process.execPath, [RR, '--generate-sccr', REPLAY_SCC], { encoding: 'utf8' });
ok('SCCR-COMMITTED-MATCHES-GEN', h(REPLAY_SCC) === h('/tmp/scc-a.txt'));

const s1 = run(['--replay', REPLAY_SCC]);
const s2 = run(['--replay', REPLAY_SCC]);
const ps1 = parse(s1), ps2 = parse(s2);
ok('SCCR-under-10s', !!ps1 && Number(ps1[1]) < LIMIT_MS, s1.trim());
ok('SCCR-DUAL-HASH-EQUAL', !!ps1 && !!ps2 && ps1[2] === ps2[2], `${ps1 && ps2[2]}`);

// shuffled arrival: permuted DELIVERY order must produce identical exec
// result (netCmds canonical ordering, end-to-end through the runner)
const sh7 = run(['--replay', REPLAY_SCC, '--shuffle-arrival', '7']);
const shB = run(['--replay', REPLAY_SCC, '--shuffle-arrival', '12345']);
const shC = run(['--replay', REPLAY_SCC, '--shuffle-arrival', '987654']);
const psh = [sh7, shB, shC].map(parse);
ok('SCCR-SHUFFLE-IDENTITY', psh.every(p => p && p[2] === ps1[2]), psh.map(p => p && p[2]).join(' vs '));

// ring mode dual identity (per-tick hashing must not perturb the sim)
const tail = (s) => { const m = /finalHash=(\w+)(?: ring=(\w+))?/.exec(s); return m ? m[1] + (m[2] || '') : ''; };
const sRing1 = run(['--replay', REPLAY_SCC, '--hash-every', '24']);
const sRing2 = run(['--replay', REPLAY_SCC, '--hash-every', '24']);
ok('SCCR-RINGMODE-IDENTICAL', tail(sRing1) === tail(sRing2) && tail(sRing1).length > 16 && tail(sRing1).startsWith(ps1[2]), `${tail(sRing1)} vs ${tail(sRing2)}`);

// refusals: wrong local content + corruption + truncation
const fMap = runFail(['--replay', REPLAY_SCC, '--fake-map', 'deadbeef']);
ok('SCCR-REFUSE-MAPHASH', fMap.code === 3 && fMap.out.includes('MAP_HASH_MISMATCH'), fMap.out.trim().slice(0, 80));
const fData = runFail(['--replay', REPLAY_SCC, '--fake-data', 'cafebabe']);
ok('SCCR-REFUSE-DATAHASH', fData.code === 3 && fData.out.includes('DATA_HASH_MISMATCH'), fData.out.trim().slice(0, 80));
{
  const t = fs.readFileSync(REPLAY_SCC, 'utf8');
  const i = t.indexOf('\nC ') + 20;
  const c = t[i] === '1' ? '2' : '1';
  fs.writeFileSync('/tmp/scc-corrupt.txt', t.slice(0, i) + c + t.slice(i + 1));
  const fC = runFail(['--replay', '/tmp/scc-corrupt.txt']);
  ok('SCCR-REFUSE-CORRUPTION', fC.code === 3 && fC.out.includes('CHECKSUM'), fC.out.trim().slice(0, 80));
  fs.writeFileSync('/tmp/scc-trunc.txt', t.slice(0, Math.floor(t.length / 2)));
  const fT = runFail(['--replay', '/tmp/scc-trunc.txt']);
  ok('SCCR-REFUSE-TRUNCATION', fT.code === 3, `exit ${fT.code} ${fT.out.trim().slice(0, 60)}`);
}

// attrition: both replays must actually fight (non-vacuity)
{
  const m1 = /units (\d+)\/(\d+)/.exec(r1);
  const m2 = /units (\d+)\/(\d+)/.exec(s1);
  ok('BATTLE-HAPPENS', m1 && m2 && (m2[2] - m2[1]) >= 8, `json ${m1 && m1[1]}/${m1 && m1[2]}, sccr ${m2 && m2[1]}/${m2 && m2[2]}`);
}

// ---------- scale probe (P1.052 data; hard-fail only beyond 60 s) ----------
const big = JSON.parse(fs.readFileSync(REPLAY, 'utf8'));
big.units = [];
for (let i = 0; i < 100; i++) big.units.push({ team: 0, kind: i % 9 === 0 ? 'tank' : 'marine', x: 200 + (i % 10) * 14, y: 200 + Math.floor(i / 10) * 12 });
for (let i = 0; i < 100; i++) big.units.push({ team: 1, kind: i % 9 === 0 ? 'vexwing' : 'skarnling', x: 700 - (i % 10) * 14, y: 200 + Math.floor(i / 10) * 12 });
fs.writeFileSync('/tmp/rp-200u.json', JSON.stringify(big));
const tb0 = Date.now();
const rb = run(['--replay', '/tmp/rp-200u.json']);
const tms = Date.now() - tb0;
ok('SCALE-200U-feasible', tms < 60000, `200 units x 14400 ticks in ${tms}ms — ${(() => { const m = /units (\d+)\/200/.exec(rb); return m ? m[1] + ' survived' : '?'; })()} (data for P1.052)`);

console.log(`RESULT REPLAY-RUNNER ${fail === 0 ? 'PASS' : 'FAIL'} ${pass}/${pass + fail} (${Date.now() - t0}ms total)`);
process.exit(fail === 0 ? 0 : 1);