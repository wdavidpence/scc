// P1.037 GATE — first-divergent-tick desync report with field-level diff.
// Ticket DONE-WHEN: "injected mutation at tick 500 reports tick 500 and the
// exact divergent field". Runs headless: two identical seeded fake worlds
// (same seam as verify-order-golden), per-tick snapshot+hash streams via
// the REAL SimSchema canonicalizer/hash, one mutation injected at tick 500,
// then desyncReport() must name tick 500 and the mutated field path(s).
// Also: control run (no mutation) reports diverged=false; key-insertion
// differences report NO fields (P1.036 invariance end-to-end through the
// diff path).
'use strict';
const path = require('path');
const { pathToFileURL } = require('url');

const TICK = 1 / 24;
const TICKS = 700;
const MUT = 500;

let M = null;
async function load() {
  if (M) return M;
  const { register } = require('node:module');
  register('./stubs/loader.mjs', pathToFileURL(__filename));
  M = {
    Unit: (await import(path.resolve(__dirname, '../src2/engine/entity.js'))).Unit,
    SimRng: (await import(path.resolve(__dirname, '../src2/engine/simRng.js'))).SimRng,
    SimSchema: (await import(path.resolve(__dirname, '../src2/engine/simSchema.js'))).SimSchema,
    dr: (await import(path.resolve(__dirname, '../src2/engine/desyncReport.js'))),
    sc1: await import(path.resolve(__dirname, '../src2/data/sc1.js')),
  };
  return M;
}

// ---- minimal fake world (subset of verify-order-golden's) ------------------
function makeWorld({ Unit, SimRng, sc1 }, seed) {
  const chainer = new Proxy(function () {}, {
    get: (t, k) => (k === 'x' || k === 'y' ? 0 : chainer),
    set: () => true, apply: () => chainer,
  });
  function cont(x, y) {
    const o = { x, y, list: [],
      setPosition(nx, ny) { o.x = nx; o.y = ny; },
      add() {}, remove() {}, destroy() {},
      setDepth() {}, setScale() {}, setVisible() {}, setAlpha() {},
      setRotation() {}, setAngle() {}, setFlipX() {}, setTint() {},
      getScaleX() { return 1; } };
    return o;
  }
  const rng = new SimRng(seed);
  const w = {
    units: [], projectiles: [], rng, simRng: rng, econ: 0, time: { now: 0, delayedCall: () => ({}) },
    add: { container: (x, y) => cont(x, y), image: () => chainer, graphics: () => chainer,
      circle: () => chainer, rectangle: () => chainer, text: () => chainer },
    textures: { exists: () => false },
    tweens: { add() {}, addCounter() {} }, events: { emit() {} },
    cameras: { main: { midPoint: { x: 960, y: 540 }, width: 1920, height: 1080 } },
    camNear: () => false, currentlyVisible: () => true, flash() {}, shake() {},
    groundBlocked: () => false, blightSpeedAt: () => false,
    separationVector: () => ({ x: 0, y: 0 }),
    nav: { idx: (x, y) => y * 64 + x, blockedBy: new Int8Array(64 * 64), walkable: () => true,
      unblockBy() {}, findPath: (x0, y0, x1, y1) => [{ x: x0, y: y0 }, { x: x1, y: y1 }] },
    techResearched: () => false, hasAddOn: () => false, spend: () => true,
    spawnProjectile(p) { this.projectiles.push({ x: p.from.x, y: p.from.y, ...p }); },
    applyHit(target, dmg) { if (target && !target.dead) target.takeDamage(dmg, null); },
    acquireFor(u, range) {
      let best = null, bd = range;
      for (const e of this.units) {
        if (e.team === u.team || e.dead || e.loaded || e.garrisonedIn) continue;
        if (u.def.targets === 'air' && !e.flying) continue;
        if (u.def.targets === 'ground' && e.flying) continue;
        const d = Math.hypot(e.x - u.x, e.y - u.y);
        if (d < bd) { bd = d; best = e; }
      }
      return best;
    },
    findNearestEnemy(u, r) { return this.acquireFor(u, r); },
    onUnitDeath() {},
  };
  return w;
}

function stepProjectiles(w) {
  for (const p of w.projectiles) {
    if (!p.target || p.target.dead) { p.done = true; continue; }
    const dx = p.target.x - p.x, dy = p.target.y - p.y, d = Math.hypot(dx, dy);
    const step = (p.speed || 600) * TICK;
    if (d <= step) { p.target.takeDamage(p.damage, p.attacker || w.units.find(u => u.team === p.team)); p.done = true; }
    else { p.x += (dx / d) * step; p.y += (dy / d) * step; }
  }
  w.projectiles = w.projectiles.filter(p => !p.done);
}

// snapshot in exportSimState shape (q8 coords) — same field names the LIVE
// ring hashes, so field paths in reports match what a replay would show.
function snapshot(w, tick) {
  const q8 = (v) => Math.round(v * 256);
  return {
    tickIndex: tick,
    rngState: w.simRng.digest(),
    players: [], buildings: [],
    // identity = array index (module-global nextId differs per process run;
    // indices align because both worlds spawn the same script order)
    units: w.units.map((u, i) => ({ idx: i, team: u.team, kind: u.kind, x: q8(u.x), y: q8(u.y),
      hp: u.hp, shield: u.shield, state: u.state, dead: !!u.dead,
      targetIdx: u.target ? w.units.indexOf(u.target) : null })),
    projectiles: w.projectiles.map(p => ({ x: q8(p.x), y: q8(p.y) })),
    orders: [],
  };
}

async function runWorld({ seed = 42, mutateAt = null, mutateHow = null, reversedKeyOrder = false } = {}) {
  const m = await load();
  const { Unit, sc1 } = m;
  const w = makeWorld(m, seed);
  const mk = (team, kind, x, y) => { const u = new Unit(w, team, kind, x, y); w.units.push(u); return u; };
  const a1 = mk(0, 'marine', 200, 300);
  const a2 = mk(0, 'marine', 220, 300);
  const a3 = mk(0, 'tank', 200, 330);
  const b1 = mk(1, 'skarnling', 680, 295);
  const b2 = mk(1, 'skarnling', 695, 305);
  const b3 = mk(1, 'skarnling', 685, 320);
  // spread the fight out: meet around x~450 after a long march so BOTH
  // sides still have living units at the tick-500 mutation point (probe-
  // verified attrition window), then grind slowly with a tank behind.
  a1.issueMove(500, 300, true);   // attackMove chain (real API, golden harness pattern)
  a2.setOrder({ type: 'attackTarget', target: b1 });
  a3.issueMove(500, 330, true);
  for (const b of [b1, b2, b3]) b.issueMove(200, 310, true);

  const snaps = [], ring = [];
  const probe = [];
  for (let t = 0; t < TICKS; t++) {
    if (t === 500) probe.push(['t500 alive', w.units.filter(u => !u.dead).length,
      't0:' + w.units.filter(u => u.team === 0 && !u.dead).length,
      't1:' + w.units.filter(u => u.team === 1 && !u.dead).length]);
    w.time.now = t;
    if (mutateAt != null && t === mutateAt && mutateHow) mutateHow(w);
    for (const u of w.units) if (!u.dead) u.update(TICK);
    stepProjectiles(w);
    const snap = snapshot(w, t + 1);
    if (reversedKeyOrder) {
      // rebuild unit objects with keys inserted in reverse order — the
      // CONTENT is identical; canonicalize must ignore key order entirely.
      snap.units = snap.units.map(u => {
        const o = {};
        for (const k of Object.keys(u).reverse()) o[k] = u[k];
        return o;
      });
    }
    snaps.push(snap);
    ring.push(m.SimSchema.hashState(snap));
  }
  return { w, snaps, ring, probe };
}

(async () => {
  let pass = 0, fail = 0;
  const ok = (id, cond, extra = '') => { if (cond) { pass++; console.log(`PASS ${id} ${extra}`); } else { fail++; console.log(`FAIL ${id} ${extra}`); } };
  const t0 = Date.now();
  await load();
  const { dr } = M;

  // control: identical twins must not diverge
  const A = await runWorld({ seed: 42 });
  const B = await runWorld({ seed: 42 });
  const ctrl = dr.desyncReport(A.ring, B.ring, (t) => A.snaps[t], (t) => B.snaps[t]);
  ok('CONTROL-NO-DIVERGENCE', ctrl.diverged === false, JSON.stringify(ctrl).slice(0, 120));

  // insertion-order twin: identical content, reversed key order per unit
  const R = await runWorld({ seed: 42, reversedKeyOrder: true });
  const ri = dr.desyncReport(A.ring, R.ring, (t) => A.snaps[t], (t) => R.snaps[t]);
  ok('INSERTION-ORDER-INVISIBLE', ri.diverged === false, `ring-equal=${A.ring.join() === R.ring.join()}`);

  // main case: position mutation at tick 500 -> report tick 500 + field.
  // NOTE: Unit.x is a GETTER over container.x (no setter) — mutate the
  // container, the real store (u.x = ... would be a silent no-op).
  const P = await runWorld({ seed: 42, mutateAt: MUT, mutateHow: (w) => {
    const u = w.units.find(u => !u.dead);
    if (u) u.container.x += 0.5; else w.simRng.s[0] = (w.simRng.s[0] ^ 1) | 0;
  } });
  const rp = dr.desyncReport(A.ring, P.ring, (t) => A.snaps[t], (t) => P.snaps[t]);
  ok('POS-DIVERGENCE-TICK-500', rp.diverged === true && rp.tick === MUT, JSON.stringify(rp).slice(0, 140));
  const hasPosField = rp.fields && rp.fields.some(f => /units\[\d+\]\.x/.test(f));
  ok('POS-FIELD-REPORTED', !!hasPosField, rp.fields ? rp.fields.slice(0, 3).join(' | ').slice(0, 140) : 'no fields');

  // damage mutation at 500 -> hp field at 500
  const H = await runWorld({ seed: 42, mutateAt: MUT, mutateHow: (w) => {
    const u = w.units.find(u => !u.dead);
    if (u) u.takeDamage(25, null); else w.simRng.s[0] = (w.simRng.s[0] ^ 1) | 0;
  } });
  const rh = dr.desyncReport(A.ring, H.ring, (t) => A.snaps[t], (t) => H.snaps[t]);
  ok('HP-DIVERGENCE-TICK-500', rh.diverged === true && rh.tick === MUT, JSON.stringify(rh).slice(0, 140));
  const hasHpField = rh.fields && rh.fields.some(f => /\.hp/.test(f));
  ok('HP-FIELD-REPORTED', !!hasHpField, rh.fields ? rh.fields.slice(0, 3).join(' | ').slice(0, 140) : 'no fields');

  // rng perturb at 500 (whole-stream fork) -> tick 500, rngState field
  const G = await runWorld({ seed: 42, mutateAt: MUT, mutateHow: (w) => { w.simRng.s[0] = (w.simRng.s[0] ^ 0x5f3759df) | 0; } });
  const rg = dr.desyncReport(A.ring, G.ring, (t) => A.snaps[t], (t) => G.snaps[t]);
  ok('RNG-FORK-TICK-500', rg.diverged === true && rg.tick === MUT, JSON.stringify(rg).slice(0, 120));

  // firstDivergentTick early-exit sanity + no-drift case
  ok('RING-SCAN', dr.firstDivergentTick([1, 2, 3], [1, 2, 4]) === 2 && dr.firstDivergentTick([1, 2], [1, 2]) === -1);

  // perf: whole 700-tick report path must stay cheap (P1.038 headless runner
  // budgets 10 min match < 10 s: hashing+report must not be quadratic).
  const dt = Date.now() - t0;
  ok('PERF', dt < 30000, `${dt}ms total (5 worlds x 700 ticks)`);

  console.log(`RESULT DESYNC-REPORT ${fail === 0 ? 'PASS' : 'FAIL'} ${pass}/${pass + fail} (${(dt / 1000).toFixed(1)}s)`);
  process.exit(fail === 0 ? 0 : 1);
})();