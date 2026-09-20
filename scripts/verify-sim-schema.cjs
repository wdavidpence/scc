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

  // P1.024: fixture rewritten to CANONICAL integer form (Q8 pos, ticks,
  // 1/256-turn bearing). validate() now rejects floats on declared
  // integer fields — see FLOAT_REJECTED below.
  const fixture = {
    tickIndex: 4321,
    rngState: 987654321,
    terrain: { w: 8, h: 8, tileSize: 16, solid: Array(64).fill(0), ramp: Array(64).fill(0) },
    players: [
      { team: 0, race: 'terran', minerals: 350, gas: 150, supplyUsed: 4, supplyCap: 12, techs: { tank: true }, upgrades: { weapons: 1, armor: 0 } },
      { team: 1, race: 'skarn', minerals: 400, gas: 150, supplyUsed: 2, supplyCap: 8, techs: {}, upgrades: { weapons: 0, armor: 0 } }
    ],
    units: [
      { id: 7, team: 0, kind: 'marine', x: 30848, y: 22592, hp: 40, maxHp: 40, shield: 0, maxShield: 0, state: 'move', order: { type: 'move', tx: 51200, ty: 15360 }, cargo: 0, facing: 64, attackTimer: 10, dead: false },
      { id: 8, team: 1, kind: 'skarling', x: 76800, y: 76800, hp: 35, maxHp: 35, shield: 0, maxShield: 0, state: 'attackMove', order: { type: 'attackMove', tx: 25600, ty: 25600 }, cargo: 0, facing: 224, attackTimer: 0, dead: false }
    ],
    buildings: [
      { id: 2, team: 0, buildId: 'barracks', x: 16384, y: 12288, hp: 300, maxHp: 300, built: true, queue: [{ kind: 'marine', remaining: 132 }], rally: { x: 28160, y: 17920 } }
    ],
    projectiles: [
      { id: 91, team: 0, kind: 'bullet', x: 38528, y: 20544, vx: 2347, vy: -107, damage: 6, targetId: 8, ttl: 22 }
    ],
    orders: [
      { tick: 4320, team: 0, seq: 1, cmd: 'move', unitIds: [7], tx: 51200, ty: 15360 }
    ]
  };

  // pre-P1.024 float fixture — kept as the negative control for
  // float-rejection (this exact shape was the P1.021 fixture).
  const floatFixture = JSON.parse(JSON.stringify(fixture));
  floatFixture.units[0].x = 120.5;
  floatFixture.units[0].attackTimer = 0.4;
  floatFixture.projectiles[0].x = 150.5;
  floatFixture.projectiles[0].ttl = 0.9;
  floatFixture.players[0].minerals = 350.25;
  floatFixture.buildings[0].queue[0].remaining = 5.5;

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

  // 4. round-trip equality of numeric fields in canonical integer form
  const rt = SimSchema.deserialize(snap);
  ok('ROUNDTRIP_TICK', rt.tickIndex === fixture.tickIndex);
  ok('ROUNDTRIP_UNITS', rt.units.length === 2 && rt.units[0].x === 30848 && rt.units[0].order.tx === 51200);
  ok('ROUNDTRIP_PROJ', rt.projectiles.length === 1 && rt.projectiles[0].targetId === 8);
  ok('ROUNDTRIP_HASH', canonicalize(rt) === canonicalize(fixture));

  // 4b. P1.024: floats on declared integer-number fields are REJECTED,
  // with a specific error naming each offending field.
  ok('FLOAT_REJECTED', SimSchema.validate(floatFixture) === false, `errors=${(SimSchema.validate.errors || []).length}`);
  const ferr = (SimSchema.validate.errors || []).join('|');
  ok('FLOAT_ERRORS_NAMED', ['units[0].x', 'units[0].attackTimer', 'projectiles[0].x', 'projectiles[0].ttl', 'players[0].minerals', 'buildings[0].queue[0].remaining'].every(f => ferr.includes(f)), ferr.slice(0, 140));

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
