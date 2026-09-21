// P1.025 — Match-level seeded PRNG for simulation (PURE: no Phaser, no DOM).
// sfc32 (4x u32 state + draw counter). Integer-only state machine: identical
// streams on any engine (verified default-V8 vs --jitless in the gate).
// Determinism contract: same seed + same call sequence => identical stream;
// full state serializes into canonical sim state (replay rejoin, P1.035/36).
//
// Usage rules:
// - ONE instance per match: scene.simRng. All simulation randomness draws
//   from it. Presentation FX jitter must NOT consume it (render-rate
//   coupling); it keeps independent Math.random/its own stream.
// - Never reseed mid-match; never branch on floating-point residue of a
//   draw in a way that changes the NUMBER of draws per tick (that is what
//   keeps streams aligned across machines).
'use strict';

class SimRng {
  // seed: integer. 0/null -> fixed default (deterministic).
  constructor(seed) { this.s = new Int32Array(4); this.n = 0; this.reset(seed); }

  reset(seed) {
    // splitmix32 to whiten the seed into the 4 state words (integer math)
    let z = (seed >>> 0) || 0x9E3779B9;
    const sm = () => {
      z = (z + 0x9E3779B9) | 0;
      let t = z;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return (t ^ (t >>> 14)) >>> 0;
    };
    for (let i = 0; i < 4; i++) this.s[i] = sm() | 0;
    this.n = 0;
    return this;
  }

  // Raw u32 draw + state advance.
  u32() {
    const s = this.s;
    let t = (s[0] + s[1]) | 0;
    s[0] = (s[1] ^ (s[1] >>> 9)) | 0;
    s[1] = (s[2] + (s[2] << 3)) | 0;
    s[2] = ((s[2] << 21) | (s[2] >>> 11)) | 0;
    s[3] = (s[3] + 1) | 0;
    t = (t + s[3]) | 0;
    s[2] = (s[2] + t) | 0;
    this.n++;
    return t >>> 0;
  }

  u01() { return this.u32() / 4294967296; }
  int(n) { return Math.floor((this.u32() / 4294967296) * n); } // 0..n-1
  range(a, b) { return a + this.u01() * (b - a); }

  // Canonical serialized state (for simSchema/hash/export). Order fixed.
  state() { return [this.s[0] >>> 0, this.s[1] >>> 0, this.s[2] >>> 0, this.s[3] >>> 0, this.n]; }
  restore(st) {
    for (let i = 0; i < 4; i++) this.s[i] = st[i] | 0;
    this.n = st[4] | 0;
    return this;
  }
  // u32 digest of state (schema rngState slot; P1.036 canonical hashing
  // will cover the full state — this is the interim cheap checksum).
  digest() {
    const st = this.state();
    let h = 0x811c9dc5;
    for (const v of st) {
      for (let k = 0; k < 4; k++) {
        h ^= (v >>> (k * 8)) & 0xff;
        h = Math.imul(h, 0x01000193) >>> 0;
      }
    }
    return h >>> 0;
  }
}

const SimRngMod = { SimRng };
export { SimRng };
export default SimRngMod;