// P1.031 i1 — headless combat golden: executes the REAL production combat
// chain (Unit.updateAttackTarget windup/cooldown -> fireAt -> projectile
// spawn -> SC.stepProjectiles flight -> SC.splashPass blast -> SC.absorb
// shield/hp) with NO DOM and NO Phaser, exactly like verify-economy-golden
// does for the economy chain. The kernel is single-sourced: the live
// BattleScene runs the SAME stepProjectiles/splashPass; a fork between live
// and replay is a bug in simCombat.js, not harness drift.
//
// Proves: (1) byte-identical state traces across two identical runs,
// (2) cross-V8 identity (--jitless child), (3) NO-NaN over the whole fight,
// (4) combat actually RAN (enemy squad + turret wiped within budget, our
// side took return fire), (5) blast multi-hit observed (>=2 victims damaged
// in one tick), (6) every effectiveDamage combination across the whole unit
// roster matches an INDEPENDENT oracle recomputation in this file (incl.
// bonusDamage/bonusArmor and high-ground +2), (7) absorb/splash/flight
// arithmetic pinned at exact endpoints.
'use strict';
const path = require('path');
const { spawnSync } = require('child_process');

const TICK = 1 / 24;

let LOADED = null;
async function loadModules() {
  if (LOADED) return LOADED;
  const { register } = require('node:module');
  register('./stubs/loader.mjs', require('url').pathToFileURL(__filename));
  const entity = await import(path.resolve(__dirname, '../src2/engine/entity.js'));
  LOADED = {
    Unit: entity.Unit,
    Building: entity.Building,
    SC: await import(path.resolve(__dirname, '../src2/engine/simCombat.js')),
    SimRng: (await import(path.resolve(__dirname, '../src2/engine/simRng.js'))).SimRng,
    sc1: await import(path.resolve(__dirname, '../src2/data/sc1.js')),
  };
  return LOADED;
}

// ---- scenario: squad firefight with splash, shields and a turret ----------
async function runFight({ seed, ticks }) {
  const { Unit, Building, SC, SimRng, sc1 } = await loadModules();
  const { UNITS, TILE } = sc1;

  const chainer = new Proxy(function () {}, {
    get: (t, k) => (k === 'x' || k === 'y' ? 0 : chainer),
    set: () => true,
    apply: () => chainer,
  });
  function cont(x, y) {
    const o = {
      x, y, list: [],
      setPosition(nx, ny) { o.x = nx; o.y = ny; },
      add() {}, remove() {}, destroy() {},
      setDepth() {}, setScale() {}, setVisible() {}, setAlpha() {},
      setRotation() {}, setAngle() {}, setFlipX() {}, setTint() {},
      getScaleX() { return 1; },
    };
    return o;
  }
  const rng = new SimRng(seed);
  // high ground: y < 303 is elevation 2 (north ridge). P1's second rank
  // stands on it -> the +2 attacker-elevation branch executes in-scenario.
  const w = {
    units: [], buildings: [], projectiles: [], geysers: [], minerals: [],
    rng, simRng: rng, time: { now: 0, delayedCall: () => ({}) },
    elevAt: (x, y) => (y < 303 ? 2 : 0),
    players: [
      { team: 0, race: 'terran', minerals: 300, gas: 0, supplyUsed: 0, supplyCap: 10, techs: {}, upgrades: { weapons: 0, armor: 0 } },
      // P1 starts upgraded (w1/a1 + plating): spawn-time bonus path executes
      { team: 1, race: 'terran', minerals: 400, gas: 150, supplyUsed: 0, supplyCap: 10, techs: { vehiclePlating1: true }, upgrades: { weapons: 1, armor: 1 } },
    ],
    add: {
      container: (x, y) => cont(x, y),
      image: () => chainer, graphics: () => chainer, circle: () => chainer,
      rectangle: () => chainer, text: () => chainer,
    },
    textures: { exists: () => false },
    tweens: { add() {}, addCounter() {} },
    events: { emit() {} },
    cameras: { main: { midPoint: { x: 960, y: 540 }, width: 1920, height: 1080 } },
    camNear: () => false,
    currentlyVisible: () => true,
    groundBlocked: () => false,
    blightSpeedAt: () => false,
    separationVector: () => ({ x: 0, y: 0 }),
    nav: {
      idx: (x, y) => y * 64 + x,
      blockedBy: new Int8Array(64 * 64),
      walkable: () => true,
      unblockBy() {}, blockRect() {},
      findPath: (x0, y0, x1, y1) => [{ x: x0, y: y0 }, { x: x1, y: y1 }],
    },
    techResearched: () => false, hasAddOn: () => false, hasBuilding: () => false,
    autoMine: false, coach: null,
    spawnUnit(team, kind, x, y, opts = {}) {
      const u = new Unit(this, team, kind, x, y, opts);
      this.units.push(u);
      // P1.031-i2: spawn bonuses run through the SAME kernel as live spawnUnit
      SC.applySpawnBonuses(u, this.players[team], id => !!this.players[team].techs[id]);
      return u;
    },
    spawnProjectile(p) { this.projectiles.push({ x: p.from.x, y: p.from.y, ...p }); },
    // verbatim transcription of BattleScene.acquireFor/findNearestEnemy
    // (fog visibleFor stubbed true) — harness stays behavior-faithful
    acquireFor(unit, range) {
      const t = unit.def.targets || 'both';
      return this.findNearestEnemy(unit.x, unit.y, range, t === 'air' ? true : undefined, t === 'air' ? false : t === 'ground' ? true : undefined, unit.team);
    },
    findNearestEnemy(x, y, range, forAir, forGround, fromTeam) {
      const home = fromTeam ?? 0;
      let best = null, bd = range;
      for (const u of this.units) {
        if (u.dead || u.team === undefined) continue;
        if (u.team === home) continue;
        if (forAir === false && u.flying) continue;
        if (forGround === false && !u.flying) continue;
        const d = Math.hypot(x - u.x, y - u.y);
        if (d < bd) { bd = d; best = u; }
      }
      return best;
    },
    onUnitDeath(u) { this.units = this.units.filter(x => x !== u); },
    onBuildingDeath(b) { this.buildings = this.buildings.filter(x => x !== b); },
    onBuildingComplete() {},
    applyHit(target, dmg) { if (target && !target.dead) target.takeDamage(dmg, null); },
  };

  // P0 (player side): 4 marines + 1 tank, slight arc + 2 Wraiths (flyers:
  // the air-only turret needs an airborne target to engage)
  w.spawnUnit(0, 'marine', 120, 300);
  w.spawnUnit(0, 'marine', 128, 306);
  w.spawnUnit(0, 'marine', 136, 302);
  w.spawnUnit(0, 'marine', 144, 310);
  w.spawnUnit(0, 'tank', 112, 305);
  // Wraiths INSIDE the turret's 112px (7*TILE) air-defense radius — idle air
  // units parked ~100px from the turret so the structure-shot branch fires
  w.spawnUnit(0, 'wraith', 192, 300);
  w.spawnUnit(0, 'wraith', 202, 294);
  // veterancy + terrain branches must execute in-scenario too
  w.units[0].level = 2;
  w.units[1].bonusArmor = 1;
  // P1 (enemy side): 4 marines (two on the ridge), 1 shielded Sentinel,
  // 1 missile turret. One enemy carries bonusDamage (veterancy term).
  const e1 = w.spawnUnit(1, 'marine', 250, 300); // on ridge (y<303)
  w.spawnUnit(1, 'marine', 258, 301);            // on ridge
  w.spawnUnit(1, 'marine', 254, 308);
  w.spawnUnit(1, 'marine', 262, 310);
  w.spawnUnit(1, 'sentinel', 270, 306);
  e1.bonusDamage = 3;
  const turret = new Building(w, 1, 'missileTurret', 292, 300, { instant: true });
  w.buildings.push(turret);
  // mid-fight research events: retro-apply path executes DURING the replay
  // (t=40 chosen so infantry are still alive to receive the bonus)
  const script = (t) => {
    if (t === 40) SC.researchBonuses(w.players[1], w.units, 'terranInfantryWeapons1', sc1.TECHS.terranInfantryWeapons1, 1);
    if (t === 90) SC.researchBonuses(w.players[1], w.units, 'terranInfantryWeapons2', sc1.TECHS.terranInfantryWeapons2, 1);
  };

  for (const u of w.units) if (u.team === 0 && !u.flying) u.setOrder({ type: 'attackMove', point: { x: 290, y: 305 } });

  let splashMultiTick = -1, sentHpWhileShield = false, enemyDeadTick = -1;
  let allyDentTick = -1, turretFired = false, retroRan = false;
  const trace = [];
  for (let t = 0; t < ticks; t++) {
    w.time.now = t;
    script(t);
    if (t === 91) retroRan = w.units.some(u => u.team === 1 && !u.dead && u.bonusDamage === 4);
    const before = w.projectiles.length;
    // exact per-unit hp snapshot BEFORE any damage this tick (object keys:
    // no kind-substring collisions)
    const prevHp = new Map(w.units.map(u => [u, u.hp]));
    for (const u of w.units) if (!u.dead) u.update(TICK);
    for (const b of w.buildings) b.update(TICK);
    // SAME kernel the live stepSim runs
    SC.stepProjectiles(w, TICK, (tgt, d, sp, atk) => {
      if (tgt.dead) return;
      tgt.takeDamage(d, atk);
      SC.splashPass(w, tgt, d, sp, atk);
    });
    if (before > 0 && w.projectiles.length > 0) turretFired = turretFired || w.projectiles.some(p => p.kind === 'turret');
    if (splashMultiTick < 0) {
      let dents = 0;
      for (const u of w.units) {
        const p = prevHp.get(u);
        if (p === undefined) continue;
        if (u.dead ? p > 0 : u.hp < p - 1e-9) dents++;
      }
      if (dents >= 2) splashMultiTick = t;
    }
    trace.push(`${t}|` + w.units.map(u => `${u.kind}:${u.x.toFixed(3)},${u.y.toFixed(3)},${u.state},${u.hp.toFixed(3)},${u.shield.toFixed(3)}`).join('|') + `#${w.projectiles.length}`);
    if (allyDentTick < 0 && w.units.some(u => u.team === 0 && u.hp < (u.__start ?? (u.__start = u.hp)))) allyDentTick = t;
    // auto-acquire targets UNITS only (live semantics) — wipe = enemy units;
    // the turret is asserted via TURRET-SHOT (its own firing), not via death.
    if (enemyDeadTick < 0 && !w.units.some(u => u.team === 1 && !u.dead)) enemyDeadTick = t;
    if (enemyDeadTick >= 0 && t > enemyDeadTick + 60) break; // let projectiles settle
  }
  const full = trace.join('\n');
  const { createHash } = require('crypto');
  return {
    hash: createHash('sha256').update(full).digest('hex').slice(0, 16),
    nan: /NaN|Infinity/.test(full),
    splashMultiTick, sentHpWhileShield, enemyDeadTick, allyDentTick,
    turretFired, retroRan,
    projLeft: w.projectiles.length,
    enemiesLeft: w.units.filter(u => u.team === 1 && !u.dead).length,
  };
}

// ---- independent oracle: recomputed from SPEC, not from simCombat.js ------
async function oracleChecks() {
  const { SC, sc1 } = await loadModules();
  const { UNITS, SIZE_MULT } = sc1;
  const flat = { elevAt: undefined };
  let bad = 0, total = 0;
  // three elevation regimes: flat (no elevAt), flat-with-field, attacker-on-ridge
  const regimes = [
    { wA: flat, attElev: 0, tgtElev: 0 },
    { wA: { elevAt: () => 0 }, attElev: 0, tgtElev: 0 },
    { wA: { elevAt: (x, y) => (y < 303 ? 2 : 0) }, attElev: 2, tgtElev: 0 }, // attacker y=300 vs target y=310
  ];
  for (const [ak, a] of Object.entries(UNITS)) {
    if (!a.damage) continue;
    for (const [tk, t] of Object.entries(UNITS)) {
      for (const [bd, ba] of [[0, 0], [3, 1]]) {
        for (const rg of regimes) {
          total++;
          const A = { def: a, x: 10, y: 300, world: rg.wA, bonusDamage: bd };
          const B = { def: t, x: 40, y: 310, bonusArmor: ba };
          // oracle math (independent transcription of the frozen spec)
          const mult = SIZE_MULT[a.attackType]?.[t.size] ?? 1;
          const armor = t.armor + ba;
          let d = (a.damage + bd) * mult - armor;
          if (rg.attElev > rg.tgtElev) d += 2;
          const want = Math.max(1, Math.round(d));
          const got = SC.effectiveDamage(A, B);
          if (want !== got) { bad++; if (bad < 5) console.log(`ORACLE-DIFF ${ak}->${tk} bd=${bd} ba=${ba} want ${want} got ${got}`); }
        }
      }
    }
  }
  // splash falloff endpoint pins (independent values)
  const f1 = SC.unitSplashDamage(20, 0, 30) === 20;
  const f2 = SC.unitSplashDamage(20, 30, 30) === Math.ceil(20 * 0.4);
  const f3 = SC.unitSplashDamage(20, 15, 30) === Math.ceil(20 * (1 - 0.6 * 0.5));
  const g1 = SC.bldgSplashDamage(40, 0, 20) === Math.ceil(40 * 0.5);
  const g2 = SC.bldgSplashDamage(40, 20, 20) === Math.ceil(40 * 0.3); // NOTE: curve floor is 0.3, not the raw 0.25
  const h1 = SC.secondaryDamage(18) === Math.round(18 * 0.8) && SC.secondaryDamage(400) === 320;
  // structureShot pins: turret dmg 6 vs marine(armor1) => round(6*1-1)=5
  const s1 = SC.structureShot(6, 'normal', { def: { size: 'medium', armor: 1 } }) === 5;
  const s2 = SC.structureShot(6, 'normal', { def: { size: 'large', armor: 3 } }) === Math.max(1, Math.round(6 * SIZE_MULT['normal'].large - 3));
  // absorb pins
  const u = { shield: 100, hp: 100, shieldRegenDelay: 0 };
  const a1 = SC.absorb(u, 30) === 30 && u.shield === 70 && u.hp === 100 && u.shieldRegenDelay === 5;
  const a2 = SC.absorb(u, 120) === 70 && u.shield === 0 && u.hp === 50; // 120-70 shield = 50 through to hp
  const b = { shield: 50, hp: 100 };
  const a3 = SC.absorb(b, 80) === 50 && b.shield === 0 && b.hp === 70 && b.shieldRegenDelay === undefined;
  // flight pin: exact hit tick + dead-target cull (independent mini-sim)
  const w = { units: [], buildings: [], projectiles: [] };
  const tgt = { x: 60, y: 0, radius: 6, dead: false, hp: 50, takeDamage() {} };
  w.units = [tgt];
  w.projectiles.push({ x: 0, y: 0, target: tgt, speed: 620, damage: 5, splash: 0, attacker: null });
  let hitTick = -1;
  for (let t = 0; t < 100; t++) {
    const pre = w.projectiles.length;
    SC.stepProjectiles(w, TICK, () => {});
    if (w.projectiles.length < pre) { hitTick = t; break; }
  }
  let t2 = 0, d = 60, step = 620 * TICK;
  while (d > step + 6) { d -= step; t2++; } // oracle: first tick where pre-move dist <= step+r
  const flightOk = hitTick === t2;
  // ---- P1.031-i2: shotDamage = weapon math + veterancy*2, checked against
  // an independent recompute over sampled pairs x levels 0..3 x bonus combos
  let sbad = 0, stotal = 0;
  const pairs = [['marine', 'marine'], ['marine', 'sentinel'], ['tank', 'marine'], ['tank', 'tank'], ['wraith', 'wraith'], ['sentinel', 'tank'], ['marine', 'wraith'], ['wraith', 'marine']];
  for (const [ak, tk] of pairs) {
    for (let lvl = 0; lvl <= 3; lvl++) {
      for (const [bd, ba] of [[0, 0], [3, 1]]) {
        stotal++;
        const A = { def: UNITS[ak], x: 10, y: 300, world: flat, level: lvl, bonusDamage: bd };
        const B = { def: UNITS[tk], x: 40, y: 310, bonusArmor: ba };
        const mult = SIZE_MULT[UNITS[ak].attackType]?.[UNITS[tk].size] ?? 1;
        const want = Math.max(1, Math.round((UNITS[ak].damage + bd) * mult - (UNITS[tk].armor + ba))) + lvl * 2;
        if (SC.shotDamage(A, B) !== want) { sbad++; if (sbad < 4) console.log(`SHOT-DIFF ${ak}->${tk} lvl${lvl} want ${want} got ${SC.shotDamage(A, B)}`); }
      }
    }
  }
  // ---- spawn-bonus assembly pins (independent of kernel internals)
  const mk = (kind) => ({ kind, def: UNITS[kind], speed: 100, bonusDamage: 0, bonusArmor: 0 });
  const pUp = { upgrades: { weapons: 1, armor: 1 } };
  const noTech = () => false;
  const m2 = mk('marine'); SC.applySpawnBonuses(m2, pUp, noTech);
  const sp1 = m2.bonusDamage === 2 && m2.bonusArmor === 1; // w1*2, armor level 1
  const wr = mk('wraith'); SC.applySpawnBonuses(wr, pUp, id => id === 'vehiclePlating1');
  const sp2 = wr.bonusDamage === 0 && wr.bonusArmor === 3; // air-only: no weapon bonus; plating +2
  const bg = mk('bladeguard'); SC.applySpawnBonuses(bg, pUp, id => id === 'bladeguardSpeed');
  const sp3 = Math.abs(bg.speed - 118) < 1e-9;
  const tk2 = mk('tank'); SC.applySpawnBonuses(tk2, pUp, id => id === 'bladeguardSpeed');
  const sp4 = tk2.speed === 100 && tk2.bonusDamage === 2 && tk2.bonusArmor === 1;
  // ---- research retro pins: counter quirk (affects++ → set(level) → id++)
  // preserved, Math.max no-clobber, team filter, plating retro, def clone
  const pr1 = { upgrades: { weapons: 1, armor: 0 }, techs: {} };
  const mu = { kind: 'marine', def: UNITS.marine, team: 1, dead: false, hp: 50, bonusDamage: 5, bonusArmor: 0 };
  SC.researchBonuses(pr1, [mu], 'terranInfantryWeapons1', sc1.TECHS.terranInfantryWeapons1, 1);
  const rs1 = pr1.upgrades.weapons === 2 && pr1.techs.terranInfantryWeapons1 === true;
  const rs2 = mu.bonusDamage === 5;
  const mu2 = { kind: 'marine', def: UNITS.marine, team: 1, dead: false, hp: 50, bonusDamage: 0, bonusArmor: 0 };
  SC.researchBonuses({ upgrades: { weapons: 0, armor: 0 }, techs: {} }, [mu2], 'terranInfantryWeapons1', sc1.TECHS.terranInfantryWeapons1, 1);
  const rs3 = mu2.bonusDamage === 2;
  const tk3 = { kind: 'tank', def: UNITS.tank, team: 1, dead: false, hp: 50, bonusDamage: 0, bonusArmor: 0 };
  const pr3 = { upgrades: { weapons: 0, armor: 0 }, techs: {} };
  SC.researchBonuses(pr3, [tk3], 'vehiclePlating1', sc1.TECHS.vehiclePlating1, 1);
  const rs4 = pr3.upgrades.armor === 1 && tk3.bonusArmor === 2;
  const mu3 = { kind: 'marine', def: UNITS.marine, team: 0, dead: false, hp: 50, bonusDamage: 0, bonusArmor: 0 };
  SC.researchBonuses({ upgrades: { weapons: 0, armor: 0 }, techs: {} }, [mu3], 'terranInfantryWeapons1', sc1.TECHS.terranInfantryWeapons1, 1);
  const rs5 = mu3.bonusDamage === 0;
  const sv = { kind: 'sentinel', def: UNITS.sentinel, team: 1, dead: false, hp: 50, bonusDamage: 0, bonusArmor: 0 };
  const origRange = UNITS.sentinel.range;
  SC.researchBonuses({ upgrades: { weapons: 0, armor: 0 }, techs: {} }, [sv], 'sentinelRange', sc1.TECHS.sentinelRange, 1);
  const rs6 = sv.def !== UNITS.sentinel && sv.def.range === origRange + 1 && UNITS.sentinel.range === origRange;
  return { bad, total, fx: f1 && f2 && f3 && g1 && g2 && h1, struct: s1 && s2, absorb: a1 && a2 && a3, flightOk, hitTick, t2,
    sbad, stotal, spawnPins: sp1 && sp2 && sp3 && sp4, researchPins: rs1 && rs2 && rs3 && rs4 && rs5 && rs6 };
}

(async () => {
  if (process.argv.includes('--child')) {
    const r = await runFight({ seed: 7, ticks: 1200 });
    console.log(`CHILD-HASH ${r.hash}`);
    process.exit(0);
  }
  let pass = 0, fail = 0;
  const ok = (id, cond, extra = '') => { if (cond) { pass++; console.log(`PASS ${id} ${extra}`); } else { fail++; console.log(`FAIL ${id} ${extra}`); } };
  const t0 = Date.now();

  const A = await runFight({ seed: 7, ticks: 1200 });
  const B = await runFight({ seed: 7, ticks: 1200 });
  ok('DUAL-RUN-IDENTITY', A.hash === B.hash, `${A.hash} vs ${B.hash}`);
  ok('NO-NaN', !A.nan && !B.nan);
  ok('FIGHT-RAN', A.enemyDeadTick >= 0, `enemies wiped at tick ${A.enemyDeadTick} (budget 1200)`);
  ok('RETURN-FIRE', A.allyDentTick >= 0, `first player-side dent at tick ${A.allyDentTick}`);
  ok('BLAST-MULTI-HIT', A.splashMultiTick >= 0, `2+ victims in one tick at ${A.splashMultiTick}`);
  ok('TURRET-SHOT', A.turretFired, 'turret projectiles entered the flight kernel');
  ok('RETRO-IN-SCENARIO', A.retroRan, 'mid-fight Weapons-2 retro raised P1 bonusDamage to 4');
  ok('FLIGHT-CULLED', A.projLeft === 0 && A.enemiesLeft === 0, `projectiles left ${A.projLeft}, enemies left ${A.enemiesLeft}`);

  const O = await oracleChecks();
  ok('DAMAGE-ORACLE', O.bad === 0, `${O.total - O.bad}/${O.total} attacker/target pairs match independent oracle`);
  ok('FALLOFF-PINS', O.fx);
  ok('STRUCT-SHOT-PINS', O.struct);
  ok('ABSORB-PINS', O.absorb);
  ok('FLIGHT-PIN', O.flightOk, `hit tick ${O.hitTick} === oracle ${O.t2}`);
  ok('SHOT-ORACLE', O.sbad === 0, `${O.stotal - O.sbad}/${O.stotal} shot combos match independent oracle`);
  ok('SPAWN-BONUS-PINS', O.spawnPins);
  ok('RESEARCH-PINS', O.researchPins, 'counter quirk + max-no-clobber + team filter + def clone preserved');

  const child = spawnSync(process.execPath, ['--jitless', __filename, '--child'], { encoding: 'utf8', timeout: 180000 });
  const m = /CHILD-HASH (\w+)/.exec(child.stdout || '');
  ok('CROSS-V8', !!m && m[1] === A.hash, `${m ? m[1] : 'no child hash'} vs ${A.hash}`);

  console.log(`RESULT COMBAT-GOLDEN ${fail === 0 ? 'PASS' : 'FAIL'} ${pass}/${pass + fail} (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  process.exit(fail === 0 ? 0 : 1);
})();