// Repro probe #3: LIVE field geometry. Minerals get a footprint block
// (blockRect), refinery blocks its footprint, workers request paths with
// clearance=0, cliff band is solid terrain. 8 workers.
'use strict';
const path = require('path');
const { pathToFileURL } = require('url');
const TICK = 1 / 24;

(async () => {
  const { register } = require('node:module');
  register('./stubs/loader.mjs', pathToFileURL('/Users/davidpence/scc-work/scripts/repro-worker-jam3.cjs'));
  const { Unit } = await import(path.resolve('/Users/davidpence/scc-work/src2/engine/entity.js'));
  const { NavGrid } = await import(path.resolve('/Users/davidpence/scc-work/src2/engine/pathfinding.js'));
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
  const T = 16, W = 64, H = 40;
  const nav = new NavGrid(W, H, T);
  // cliff band y=128..144 -> tile rows 8..9, x tiles 12..20 solid
  for (let ty = 8; ty <= 9; ty++) for (let tx = 12; tx <= 20; tx++) nav.solid[ty * W + tx] = 1;
  const minerals = [{ x: 150, y: 100, amount: 1e6 }, { x: 130, y: 116, amount: 1e6 }];
  const refinery = { x: 420, y: 100 };
  nav.blockRect(9001, Math.floor(130 / T), Math.floor(92 / T), Math.ceil(170 / T), Math.ceil(108 / T)); // field blocks
  nav.blockRect(9002, Math.floor((refinery.x - 32) / T), Math.floor((refinery.y - 24) / T), Math.ceil((refinery.x + 32) / T), Math.ceil((refinery.y + 24) / T));
  const w = {
    units: [], projectiles: [], rng, simRng: rng, econ: 0,
    time: { now: 0, delayedCall: () => ({}) },
    add: new Proxy({ container: (x, y) => cont(x, y) }, { get: (t, k) => (k in t ? t[k] : () => chainer()) }),
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
    nav,
    techResearched: () => false, hasAddOn: () => false, spend: () => true,
    minerals, refinery,
    spawnProjectile() {}, applyHit() {},
    pickMineralForWorker(u) {
      let best = null, bd = 1e9;
      for (const m of this.minerals) { if (m.amount <= 0) continue; const d = Math.hypot(m.x - u.x, m.y - u.y); if (d < bd) { bd = d; best = m; } }
      return best;
    },
    nearestDropOff(u) { return u.cargo > 0 ? this.refinery : null; },
    onMineralDug() {}, depleteMineral() {},
    onCargoDeposited(u) { this.econ += u.cargo; },
    acquireFor() { return null; }, findNearestEnemy() { return null; }, onUnitDeath() {},
  };
  for (let i = 0; i < 8; i++) {
    const u = new Unit(w, 0, 'rigger', 90 + (i % 4) * 14, 60 + Math.floor(i / 4) * 14);
    u.setOrder({ type: 'harvest' });
    w.units.push(u);
  }
  w.spatial = spatial;
  const stuck = new Map();
  for (const u of w.units) stuck.set(u.id, { still: 0, maxStill: 0, states: new Set(), pathLens: [] });
  const prev = new Map();
  for (let t = 0; t < 2400; t++) {
    spatial.rebuild(w.units);
    w.time.now = t;
    for (const u of w.units) if (!u.dead) u.update(TICK);
    for (const u of w.units) {
      const p = prev.get(u.id) || { x: u.x, y: u.y };
      const sp = Math.hypot(u.x - p.x, u.y - p.y);
      const h = stuck.get(u.id);
      const acting = u.state === 'harvest' || u.state === 'returnCargo';
      const atWork = (u.state === 'harvest' && Math.hypot(u.x - 140, u.y - 108) < 22)
        || (u.state === 'returnCargo' && Math.hypot(u.x - 420, u.y - 124) < 45);
      if (acting && !atWork && sp < 0.05) { h.still++; h.maxStill = Math.max(h.maxStill, h.still); }
      else h.still = 0;
      if (t % 240 === 0 && acting) { h.states.add(u.state); if (u.path && u.path.length) h.pathLens.push(u.path.length); }
      prev.set(u.id, { x: u.x, y: u.y });
    }
  }
  for (const u of w.units) {
    const h = stuck.get(u.id);
    console.log(`#${u.id} ${u.state} cargo=${u.cargo} at ${u.x.toFixed(0)},${u.y.toFixed(0)} maxStill=${h.maxStill} states=${[...h.states]} pathLens=${[...new Set(h.pathLens)].join('/')}`);
  }
  console.log('FINAL econ:', w.econ, ' | open-field baseline with same geometry was 512');
})();