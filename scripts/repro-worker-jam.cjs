// Repro probe: 6 workers, 2 mineral patches, 1 refinery — count completed
// mine cycles and detect jam (worker with a harvest/return order that moves
// < 0.5px over 240 ticks). Run: node /tmp/repro-worker-jam.cjs
'use strict';
const path = require('path');
const { pathToFileURL } = require('url');
const TICK = 1 / 24;

(async () => {
  const { register } = require('node:module');
  register('./stubs/loader.mjs', pathToFileURL('/Users/davidpence/scc-work/scripts/repro-worker-jam.cjs'));
  const { Unit } = await import(path.resolve('/Users/davidpence/scc-work/src2/engine/entity.js'));
  const { SimRng } = await import(path.resolve('/Users/davidpence/scc-work/src2/engine/simRng.js'));

  // ---- fake world WITH spatial hash like the live game ----------------------
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
  const rng = new SimRng(42);
  const CELL = 28;
  const spatial = {
    map: new Map(),
    key(x, y) { return ((x / CELL) | 0) + ',' + ((y / CELL) | 0); },
    rebuild(units) {
      this.map.clear();
      for (const u of units) { if (u.dead) continue; const k = this.key(u.x, u.y); if (!this.map.has(k)) this.map.set(k, []); this.map.get(k).push(u); }
    },
    near(x, y) {
      const out = [];
      const cx = (x / CELL) | 0, cy = (y / CELL) | 0;
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
        const c = this.map.get((cx + dx) + ',' + (cy + dy));
        if (c) out.push(...c);
      }
      return out;
    },
  };
  const w = {
    units: [], projectiles: [], rng, simRng: rng, econ: 0,
    time: { now: 0, delayedCall: () => ({}) },
    add: { container: (x, y) => cont(x, y), image: () => chainer, graphics: () => chainer,
      circle: () => chainer, rectangle: () => chainer, text: () => chainer, triangle: () => chainer },
    textures: { exists: () => false },
    tweens: { add() {}, addCounter() {} }, events: { emit() {} },
    cameras: { main: { midPoint: { x: 960, y: 540 }, width: 1920, height: 1080 } },
    camNear: () => false, currentlyVisible: () => true, flash() {}, shake() {},
    groundBlocked: () => false, blightSpeedAt: () => false,
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
      unblockBy() {}, findPath: (x0, y0, x1, y1) => [{ x: x0, y: y0 }, { x: x1, y: y1 }] },
    techResearched: () => false, hasAddOn: () => false, spend: () => true,
    minerals: [{ x: 120, y: 120, amount: 600 }, { x: 180, y: 140, amount: 600 }],
    refinery: { x: 260, y: 130 },
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
  // ---- 6 workers near mineral field, refinery 100px east ------------------
  const TILES = 16;
  for (let i = 0; i < 6; i++) {
    const u = new Unit(w, 0, 'rigger', 110 + (i % 3) * 20, 100 + Math.floor(i / 3) * 20);
    w.units.push(u);
  }
  w.spatial = spatial;
  // ---- run 3000 ticks (~125 s) -------------------------------------------
  const hist = new Map(); // id -> {deposits, lastPos, jamTicks, stuckAt}
  for (const u of w.units) hist.set(u.id, { deposits: 0, digs: 0, x0: u.x, y0: u.y, jam: 0, samples: [] });
  for (let t = 0; t < 3000; t++) {
    spatial.rebuild(w.units);
    w.time.now = t;
    for (const u of w.units) if (!u.dead) u.update(TICK);
    for (const u of w.units) {
      if (u.dead) continue;
      const h = hist.get(u.id);
      const sp = Math.hypot(u.x - (h.px ?? u.x), u.y - (h.py ?? u.y));
      if (sp < 0.02 && (u.state === 'harvest' || u.state === 'returnCargo')) h.jam++;
      else if (h.jam > 0) { h.samples.push(`t${t}:break jam=${h.jam}`); h.jam = 0; }
      h.px = u.x; h.py = u.y;
    }
    // count deposits by watching cargo drop to 0 with returnCargo->harvest transition
  }
  const endEcon = w.econ;
  for (const u of w.units) {
    const h = hist.get(u.id);
    console.log(`${u.kind}#${u.id} state=${u.state} cargo=${u.cargo} pos=${u.x.toFixed(0)},${u.y.toFixed(0)} distMineral=${Math.hypot(u.x - 150, u.y - 130).toFixed(0)} distRef=${Math.hypot(u.x - 260, u.y - 130).toFixed(0)} jamLongestSamples=${h.samples.sort((a, b) => parseInt(b.split('jam=')[1]) - parseInt(a.split('jam=')[1])).slice(0, 2).join(' | ')}`);
  }
  console.log('econ total deposited:', endEcon, '(6 workers x 3000 ticks; perfect chain ~', (6 * 3000 / 24 / (2.6 + 4)) * 8, ')');
})();