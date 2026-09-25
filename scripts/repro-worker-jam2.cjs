// Repro probe #2: crowded mineral + a cliff band that cuts the straight-line
// paths (groundBlocked=true on y in [128,144], x in [200,320]) + refinery.
// Tests the two suspected live jams: (a) wall-hug deadlock (blocked step
// repeated forever, no repath), (b) crowd pile-up at one mineral.
'use strict';
const path = require('path');
const { pathToFileURL } = require('url');
const TICK = 1 / 24;

(async () => {
  const { register } = require('node:module');
  register('./stubs/loader.mjs', pathToFileURL('/Users/davidpence/scc-work/scripts/repro-worker-jam2.cjs'));
  const { Unit } = await import(path.resolve('/Users/davidpence/scc-work/src2/engine/entity.js'));
  const { SimRng } = await import(path.resolve('/Users/davidpence/scc-work/src2/engine/simRng.js'));

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
  const rng = new SimRng(7);
  const CELL = 28;
  const spatial = {
    map: new Map(),
    rebuild(units) { this.map.clear(); for (const u of units) { if (u.dead) continue; const k = ((u.x / CELL) | 0) + ',' + ((u.y / CELL) | 0); if (!this.map.has(k)) this.map.set(k, []); this.map.get(k).push(u); } },
    near(x, y) { const out = []; const cx = (x / CELL) | 0, cy = (y / CELL) | 0; for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) { const c = this.map.get((cx + dx) + ',' + (cy + dy)); if (c) out.push(...c); } return out; },
  };
  const T = 16;
  const blockedTile = (tx, ty) => tx >= 12 && tx <= 20 && ty >= 8 && ty <= 9; // cliff band
  const w = {
    units: [], projectiles: [], rng, simRng: rng, econ: 0,
    time: { now: 0, delayedCall: () => ({}) },
    add: { container: (x, y) => cont(x, y), image: () => chainer, graphics: () => chainer,
      circle: () => chainer, rectangle: () => chainer, text: () => chainer, triangle: () => chainer },
    textures: { exists: () => false },
    tweens: { add() {}, addCounter() {} }, events: { emit() {} },
    cameras: { main: { midPoint: { x: 960, y: 540 }, width: 1920, height: 1080 } },
    camNear: () => false, currentlyVisible: () => true, flash() {}, shake() {},
    groundBlocked(u, x, y) {
      if (!blockedTile(Math.floor(x / T), Math.floor(y / T))) return false;
      return !blockedTile(Math.floor(u.x / T), Math.floor(u.y / T)); // may not ENTER band from outside
    },
    blightSpeedAt: () => false,
    separationVector(u) {
      let sx = 0, sy = 0;
      for (const o of spatial.near(u.x, u.y)) {
        if (o === u || o.dead) continue;
        if (o.flying !== u.flying) continue;
        const dx = u.x - o.x, dy = u.y - o.y;
        const d2 = dx * dx + dy * dy;
        const minD = (u.radius + o.radius) * 1.15;
        if (d2 > minD * minD || d2 === 0) continue;
        const d = Math.sqrt(d2);
        const push = (minD - d) / minD;
        sx += (dx / d) * push; sy += (dy / d) * push;
      }
      return { x: sx, y: sy };
    },
    nav: { idx: (x, y) => y * 64 + x, blockedBy: new Int8Array(64 * 64), walkable: () => true,
      unblockBy() {}, findPath: (x0, y0, x1, y1) => [{ x: x0, y: y0 }, { x: x1, y: y1 }] }, // straight line like the old stub
    techResearched: () => false, hasAddOn: () => false, spend: () => true,
    minerals: [{ x: 150, y: 100, amount: 800 }], // ALL workers want this one patch
    refinery: { x: 420, y: 100 },                // behind the cliff band; straight line cuts through it
    spawnProjectile(p) {}, applyHit() {},
    pickMineralForWorker(u) {
      let best = null, bd = 1e9;
      for (const m of this.minerals) { if (m.amount <= 0) continue; const d = Math.hypot(m.x - u.x, m.y - u.y); if (d < bd) { bd = d; best = m; } }
      return best;
    },
    nearestDropOff(u) { return u.cargo > 0 ? this.refinery : null; },
    onMineralDug() {}, depleteMineral(t) { const i = this.minerals.indexOf(t); if (i >= 0) this.minerals.splice(i, 1); },
    onCargoDeposited(u) { this.econ += u.cargo; },
    acquireFor() { return null; }, findNearestEnemy() { return null; }, onUnitDeath() {},
  };
  for (let i = 0; i < 8; i++) {
    const u = new Unit(w, 0, 'rigger', 100 + (i % 4) * 14, 70 + Math.floor(i / 4) * 14);
    w.units.push(u);
  }
  w.spatial = spatial;
  const stuck = new Map();
  for (const u of w.units) stuck.set(u.id, { moved: 0, still: 0, maxStill: 0, deposits: 0, digs: 0 });
  const prev = new Map();
  let jamTicks = 0;
  for (let t = 0; t < 2400; t++) {
    spatial.rebuild(w.units);
    w.time.now = t;
    for (const u of w.units) if (!u.dead) u.update(TICK);
    let moving = 0;
    for (const u of w.units) {
      const p = prev.get(u.id) || { x: u.x, y: u.y };
      const sp = Math.hypot(u.x - p.x, u.y - p.y);
      const h = stuck.get(u.id);
      const acting = u.state === 'harvest' || u.state === 'returnCargo';
      const wandering = acting && !(u.state === 'harvest' && sp < 0.02 && Math.hypot(u.x - 150, u.y - 100) < 16 * 1.1); // standing at patch mining = fine
      if (wandering && sp < 0.05) { h.still++; h.maxStill = Math.max(h.maxStill, h.still); jamTicks++; } else h.still = 0;
      if (sp > 0.05) moving++;
      prev.set(u.id, { x: u.x, y: u.y });
    }
    if (t % 600 === 0) {
      console.log(`t=${t} moving=${moving}/8 econ=${w.econ}`);
      for (const u of w.units) console.log(`  ${u.kind}#${u.id} ${u.state} c=${u.cargo} at ${u.x.toFixed(0)},${u.y.toFixed(0)} maxStill=${stuck.get(u.id).maxStill}`);
    }
  }
  console.log('FINAL econ:', w.econ, 'stuckTicks:', jamTicks, '/', 2400 * 8);
  console.log('EXPECTED with clean paths ~', (8 * 2400 / 24 / (2.6 + 6)) * 8, '(6s transit leg across the map; a working game routes around the cliff)');
})();