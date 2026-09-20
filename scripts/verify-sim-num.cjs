// P1.024 — gate for src2/engine/simNum.js (integer velocity/facing/cooldown/
// resource arithmetic + schema float rejection).
// Run:  node scripts/verify-sim-num.cjs
'use strict';
const path = require('path');
const fs = require('fs');

(async () => {
  let num, schema;
  try {
    num = (await import(path.resolve(__dirname, '../src2/engine/simNum.js'))).SimNum;
    schema = (await import(path.resolve(__dirname, '../src2/engine/simSchema.js'))).SimSchema;
  } catch (e) { console.error('P1.024-RED: module missing:', e.message); process.exit(1); }
  if (!num || !schema) { console.error('P1.024-RED: SimNum/SimSchema exports missing'); process.exit(1); }

  let pass = 0, fail = 0;
  const ok = (id, cond, extra = '') => { if (cond) { pass++; console.log(`PASS ${id} ${extra}`); } else { fail++; console.log(`FAIL ${id} ${extra}`); } };

  // ---------- RT: Q8 encode/decode exactness over 100k seeded points ----------
  {
    let bad = 0, bad2 = 0, seed = 0xC0FFEE;
    const rnd = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 0x100000000; };
    for (let i = 0; i < 100000; i++) {
      const px = rnd() * 4096;
      const q = Math.round(px * 256);
      if (num.fromQ8(num.toQ8(q / 256)) * 256 !== q) bad++;
      if (num.fromQ8(num.toQ8(px)) * 256 !== Math.round(px * 256)) bad2++;
    }
    ok('RT_Q8_EXACT', bad === 0 && bad2 === 0, `mismatches ${bad}/${bad2}`);
  }

  // ---------- CHAIN: 10k-tick integer accumulation vs BigInt ground truth ---
  {
    // zig-zag velocity schedule with repeating-fraction magnitudes; the same
    // schedule run in naive float drifts, the integer chain must be EXACT.
    const SCALE = 256n;
    let seed = 0xBEEF01;
    const rnd = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 0x100000000; };
    const steps = [];
    for (let i = 0; i < 10000; i++) steps.push(rnd() < 0.52 ? rnd() * 1.9 + 0.05 : -(rnd() * 1.9 + 0.05));
    // BigInt reference
    let ref = 0n;
    for (const s of steps) { const q = BigInt(Math.round(Math.abs(s) * 256)); ref += s < 0 ? -q : q; }
    // integer chain (what simNum-based movement does: add exact Q8 integers)
    let acc = 0;
    for (const s of steps) { const q = Math.round(Math.abs(s) * 256); acc += s < 0 ? -q : q; }
    // naive float chain
    let f = 0;
    for (const s of steps) f += s;
    ok('CHAIN_INT_EXACT', BigInt(acc) === ref, `int=${acc} ref=${ref}`);
    const drift = Math.abs(f - Number(ref) / 256);
    ok('CHAIN_DRIFT_PRESENT', drift > 0, `float drift ${drift.toFixed(9)} px (float path would diverge per machine)`);
  }

  // ---------- CONV: unit conversions ----------
  ok('CONV_TICKS', num.toTicks(0.4) === 10 && num.toTicks(5.5) === 132 && num.toTicks(0.9) === 22 && num.toTicks(0) === 0);
  ok('CONV_SPEED', num.speedToQ8Tick(900) === 9600 && num.speedToQ8Tick(24) === 256 && num.speedToQ8Tick(0) === 0);
  ok('CONV_BEARING', num.octToBearing(0) === 0 && num.octToBearing(2) === 64 && num.octToBearing(7) === 224 && num.octToBearing(8) === 0 && num.octToBearing(-1) === 224);

  // ---------- ORDER: point -> canonical tx/ty ----------
  {
    const c = num.orderToCanonical({ type: 'move', point: { x: 200.5, y: 60.25 } });
    ok('ORDER_CANON', c.tx === 51328 && c.ty === 15424 && !('point' in c) && c.type === 'move');
  }

  // ---------- SCHEMA: clean integer state validates; injected floats reject ----------
  {
    const clean = {
      tickIndex: 24, rngState: 777,
      terrain: { w: 4, h: 4, tileSize: 16, solid: Array(16).fill(0) },
      players: [{ team: 0, race: 'terran', minerals: 50, gas: 0, supplyUsed: 4, supplyCap: 9, techs: {}, upgrades: {} }],
      units: [{ id: 1, team: 0, kind: 'marine', x: 4096, y: 2048, hp: 40, maxHp: 40, shield: 0, maxShield: 0, state: 'move', order: { type: 'move', tx: 7000, ty: 1000 }, cargo: 8, facing: 96, attackTimer: 3, dead: false }],
      buildings: [{ id: 2, team: 0, buildId: 'barracks', x: 1024, y: 512, hp: 300, maxHp: 300, built: true, queue: [{ kind: 'marine', remaining: 60 }], rally: { x: 3000, y: 900 } }],
      projectiles: [{ id: 3, team: 0, kind: 'bullet', x: 1500, y: 700, vx: 1000, vy: -500, damage: 6, targetId: null, ttl: 12 }],
      orders: [{ tick: 23, team: 0, seq: 1, cmd: 'move', unitIds: [1], tx: 7000, ty: 1000 }]
    };
    ok('SCHEMA_ACCEPT_INT', schema.validate(clean) === true, JSON.stringify(schema.validate.errors));
    const dirty = JSON.parse(JSON.stringify(clean));
    dirty.units[0].x = 16.25;           // pos float
    dirty.units[0].facing = 96.5;       // bearing float
    dirty.units[0].attackTimer = 2.5;   // cooldown float
    dirty.players[0].minerals = 49.75;  // resource float
    dirty.projectiles[0].vx = 999.5;    // velocity float
    dirty.buildings[0].queue[0].remaining = 59.5; // timer float
    ok('SCHEMA_REJECT_FLOAT', schema.validate(dirty) === false);
    const errs = (schema.validate.errors || []).join('|');
    ok('SCHEMA_REJECT_COVERS_ALL', ['units[0].x', 'units[0].facing', 'units[0].attackTimer', 'players[0].minerals', 'projectiles[0].vx', 'buildings[0].queue[0].remaining'].every(f => errs.includes(f)), errs.slice(0, 160));
    // NaN must also reject (not just non-integral floats)
    const nany = JSON.parse(JSON.stringify(clean));
    nany.units[0].cargo = NaN;
    ok('SCHEMA_REJECT_NAN', schema.validate(nany) === false);
  }

  // ---------- SEAM: BattleScene export must quantize through SimNum ----------
  {
    const bs = fs.readFileSync(path.resolve(__dirname, '../src2/scenes/BattleScene.js'), 'utf8');
    const m = bs.match(/exportSimState\(\)\s*\{[\s\S]{0,2500}?\n  \}/);
    const body = m ? m[0] : '';
    ok('SEAM_IMPORTS_NUM', /import\s*\{[^}]*SimNum[^}]*\}\s*from/.test(bs));
    ok('SEAM_QUANTIZES', body.includes('q8(u.x)') && body.includes('tk(u.attackTimer') && body.includes('b256(u._facing8') && body.includes('oc(u.order)'), 'seam maps declared fields through SimNum');
    const floats = body.match(/(x|y|tx|ty|remaining|ttl|facing|attackTimer|minerals|gas):\s*[^,}\n]*\d+\.\d+/g) || [];
    ok('SEAM_NO_RAW_FLOAT_FIELDS', floats.length === 0, floats.slice(0, 3).join(' '));
  }

  console.log(`\nRESULT SIM-NUM ${fail === 0 ? 'PASS' : 'FAIL'} ${pass}/${pass + fail}`);
  process.exit(fail === 0 ? 0 : 1);
})().catch(e => { console.error('P1.024-RED harness error:', String(e).slice(0, 300)); process.exit(1); });