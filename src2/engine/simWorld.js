// P1.026 — Pure fixed-tick world kernel (no Phaser, no DOM, no Math.random).
// Proof-of-concept replacement for the variable-dt live update chain:
// all simulation mutation happens inside step() — exactly 1/24 s per call,
// clocked by simClock under render use and by count in headless harnesses.
// Movement delegates to the simInt kernel (integer Q8, blocked-at-truth);
// combat is tick-quantized deterministic (integer ranges, squared distance,
// seeded rng only for the documented fire-jitter draw).
//
// This kernel is what P1.029's pure order/combat extraction builds on.
// It is intentionally NOT wired into BattleScene yet (that is the P1.029
// migration); its job today is to prove every live-update behavior has a
// fixed-tick equivalent and to serve as the seeded cross-machine oracle.
'use strict';
import SimInt from './simInt.js';
import { SimRng } from './simRng.js';

const TICK_HZ = 24;

// Units: positions/clearance Q8 (1/256 px); speeds Q8 px/tick (24Hz);
// ranges integer px; cooldowns integer ticks; hp integer.
function createWorld({ w = 64, h = 64, tileSize = 16, solid, seed = 1, units = [] }) {
  const w2 = {
    tile: SimInt.makeWorld({ w, h, tileSize, solid }),
    tick: 0,
    rng: new SimRng(seed),
    events: [],
    units
  };
  for (const u of units) {
    u.cd = 0; u.kills = 0; u.shots = 0;
  }
  return w2;
}

// u: { x,y (float px, quantized at entry), vx,vy (px/tick), r (weapon range px),
//      cd (ticks), hp, team, kind }
function addUnit(w2, spec) {
  const u = SimInt.addUnit(w2.tile, spec);
  u.cd = spec.cd || 0;
  u.kills = 0; u.shots = 0;
  u.hp = spec.hp || 40;
  u.team = spec.team || 0;
  u.r = spec.r || 64;
  w2.units.push(u);
  return u;
}

const Q256 = 256;
function dist2(u, v) {
  const dx = u.x - v.x, dy = u.y - v.y;
  return dx * dx + dy * dy;
}

// One fixed tick. Order inside the tick is FIXED: all fire decisions first
// (against tick-start hp), then deaths resolve, then movement — no
// same-tick kill-then-move, no iteration-order dependence.
function step(w2) {
  w2.tick++;
  const us = w2.units;

  // 1) fire decisions (snapshot pass)
  const shots = [];
  for (const a of us) {
    if (a.dead || a.hp <= 0) continue;
    if (a.cd > 0) { a.cd--; continue; }
    if (!a.r) continue;
    let best = null, bd2 = a.r * a.r * Q256 * Q256;
    for (const b of us) {
      if (b.dead || b.hp <= 0 || b.team === a.team) continue;
      const d2 = dist2(a, b);
      if (d2 <= bd2) { bd2 = d2; best = b; }
    }
    if (!best) continue;
    // one rng draw per shot: target evasion jitter (seeded). 0.4 draw cost
    // replaced the render-rate-coupled Math.random trail-roll defect.
    const evade = w2.rng.u01() < 0.4;
    shots.push([a, best, evade]);
    a.cd = 12; // 0.5 s at 24 Hz
    a.shots++;
  }

  // 2) resolve damage + deaths
  for (const [a, t, evade] of shots) {
    if (t.hp <= 0) continue;
    const dmg = evade ? 3 : 6;
    t.hp -= dmg;
    if (t.hp <= 0) { t.hp = 0; t.dead = true; a.kills++; w2.events.push(`t${w2.tick} ${a.kind}>${t.kind} ${evade ? 'evaded' : 'hit'}`); }
  }

  // 3) movement (simInt handles arrive/waypoints/blocked; dead units idle)
  for (const u of us) {
    if (u.dead || u.hp <= 0) continue;
    SimInt.stepUnit(w2.tile, u);
  }
  return w2;
}

// Canonical trace for hashing: exact decimal integers only.
function snapshot(w2) {
  const rows = w2.units.map(u => `${u.id},${u.kind},${u.x},${u.y},${u.hp},${u.state},${u.cd},${u.kills},${u.shots}`);
  return `t${w2.tick}|${rows.join(';')}`;
}

const SimWorld = { TICK_HZ, createWorld, addUnit, step, snapshot };
export { SimWorld };
export default SimWorld;