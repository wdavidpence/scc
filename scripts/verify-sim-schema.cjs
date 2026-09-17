// P1.021 harness — canonical simulation state schema (pure Node, zero Phaser).
// Fails RED until src2/engine/simSchema.js exists and round-trips a fixture.
'use strict';
const path = require('path');

(async () => {
  let schema;
  try { schema = await import(path.resolve(__dirname, '../src2/engine/simSchema.js')); }
  catch (e) { console.error('P1.021-RED: simSchema.js missing:', e.message); process.exit(1); }

  const { SimSchema, canonicalize } = schema;
  if (!SimSchema || !canonicalize) { console.error('P1.021-RED: SimSchema/canonicalize exports missing'); process.exit(1); }

  const fixture = {
    tickIndex: 4321,
    rngState: 987654321,
    terrain: { w: 8, h: 8, tileSize: 16, solid: Array(64).fill(0), ramp: Array(64).fill(0) },
    players: [
      { team: 0, race: 'terran', minerals: 350, gas: 150, supplyUsed: 4, supplyCap: 12, techs: { tank: true }, upgrades: { weapons: 1, armor: 0 } },
      { team: 1, race: 'skarn', minerals: 400, gas: 150, supplyUsed: 2, supplyCap: 8, techs: {}, upgrades: { weapons: 0, armor: 0 } }
    ],
    units: [
      { id: 7, team: 0, kind: 'marine', x: 120.5, y: 88.25, hp: 40, maxHp: 40, shield: 0, maxShield: 0, state: 'move', order: { type: 'move', tx: 200, ty: 60 }, cargo: 0, facing: 3, attackTimer: 0.4, dead: false },
      { id: 8, team: 1, kind: 'skarling', x: 300, y: 300, hp: 35, maxHp: 35, shield: 0, maxShield: 0, state: 'attackMove', order: { type: 'attackMove', tx: 100, ty: 100 }, cargo: 0, facing: 7, attackTimer: 0, dead: false }
    ],
    buildings: [
      { id: 2, team: 0, buildId: 'barracks', x: 64, y: 48, hp: 300, maxHp: 300, built: true, queue: [{ kind: 'marine', remaining: 5.5 }], rally: { x: 110, y: 70 } }
    ],
    projectiles: [
      { id: 91, team: 0, kind: 'bullet', x: 150.5, y: 80.25, vx: 220, vy: -10, damage: 6, targetId: 8, ttl: 0.9 }
    ],
    orders: [
      { tick: 4320, team: 0, seq: 1, cmd: 'move', unitIds: [7], tx: 200, ty: 60 }
    ]
  };

  let pass = 0, fail = 0;
  const ok = (id, cond, extra = '') => { if (cond) { pass++; console.log(`PASS ${id} ${extra}`); } else { fail++; console.log(`FAIL ${id} ${extra}`); } };

  // 1. validate fixture
  ok('VALID_FIXTURE', SimSchema.validate(fixture) === true, JSON.stringify(SimSchema.validate.errors || SimSchema.validate(fixture)).slice(0, 120));

  // 2. serialize contains every required section
  const snap = SimSchema.serialize(fixture);
  for (const sec of ['tickIndex', 'rngState', 'terrain', 'players', 'units', 'buildings', 'projectiles', 'orders']) {
    ok(`SECTION_${sec}`, snap && sec in snap);
  }

  // 3. canonical JSON is stable regardless of key insertion order
  const a = canonicalize({ tickIndex: 1, b: 2, a: 1 });
  const b = canonicalize({ a: 1, tickIndex: 1, b: 2 });
  ok('CANON_STABLE', a === b, `${a} vs ${b}`);

  // 4. round-trip equality of numeric fields at current (float) precision
  const rt = SimSchema.deserialize(snap);
  ok('ROUNDTRIP_TICK', rt.tickIndex === fixture.tickIndex);
  ok('ROUNDTRIP_UNITS', rt.units.length === 2 && rt.units[0].x === 120.5 && rt.units[0].order.tx === 200);
  ok('ROUNDTRIP_PROJ', rt.projectiles.length === 1 && rt.projectiles[0].targetId === 8);
  ok('ROUNDTRIP_HASH', canonicalize(rt) === canonicalize(fixture));

  // 5. Phaser leakage guard: schema module source must not mention phaser
  const fs = require('fs');
  const src = fs.readFileSync(path.resolve(__dirname, '../src2/engine/simSchema.js'), 'utf8');
  ok('ZERO_PHASER', !/from ['"]phaser|require\(['"]phaser|\.container\(|add\.image|setDepth/.test(src));

  // 6. live parity seam: BattleScene.exportSimState must exist and reuse SimSchema
  const bs = fs.readFileSync(path.resolve(__dirname, '../src2/scenes/BattleScene.js'), 'utf8');
  ok('BATTLE_SEAM', /exportSimState\s*\(\s*\)\s*\{[\s\S]{0,400}SimSchema\.serialize/.test(bs) || /import[^\n]*simSchema/.test(bs));

  console.log(`\nRESULT SIM-SCHEMA ${fail === 0 ? 'PASS' : 'FAIL'} ${pass}/${pass + fail}`);
  process.exit(fail === 0 ? 0 : 1);
})().catch(e => { console.error('P1.021-RED harness error:', String(e).slice(0, 200)); process.exit(1); });
