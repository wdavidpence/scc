import { createGame2 } from './createGame2.js';
// P1.056: test-harness surface — the cross-engine parity gate
// (scripts/verify-cross-engine.cjs) builds a kernel replay world IN the
// page from these modules and compares its final digest against the CLI
// runner. Same code, two engines: any fork is a gate failure. Not used by
// gameplay; a frozen namespace object only.
import SimMatch from './engine/simMatch.js';
import { SimSchema } from './engine/simSchema.js';
import { SimTerrain } from './engine/simTerrain.js';
import { NavGrid } from './engine/pathfinding.js';
import * as sc1 from './data/sc1.js';
import { Unit } from './engine/entity.js';
import ncDefault from './engine/netCmds.js';
import { SimRng } from './engine/simRng.js';
import * as rf from './engine/replayFormat.js';
window.__SIM = Object.freeze({ SimMatch, SimSchema, SimTerrain, NavGrid, sc1, Unit, nc: ncDefault, SimRng, rf });

let booted = false;
function boot() { if (booted) return; booted = true; createGame2('game'); }

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
