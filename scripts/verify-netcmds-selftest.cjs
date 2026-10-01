// P1.034 cross-engine selftest: prints ONE digest of the netCmds permutation
// family (same shape as the P1 checks in verify-netcmds.cjs). Run once with
// default V8 and once with --jitless by the parent gate; digests must match.
'use strict';
const path = require('path');
const { pathToFileURL } = require('url');

(async () => {
  const { createNetBuf, deliver, drainNet } = await import(pathToFileURL(path.resolve(__dirname, '../src2/engine/netCmds.js')).href);
  const s = [];
  const push = (player, tick, type, payload) => {
    const seq = (s.filter(x => x.player === player).pop() || { seq: 0 }).seq + 1;
    s.push({ player, seq, tick, type, payload });
  };
  push(0, 2, 'order', { wp: { x: 700, y: 300 }, sel: [1, 2] });
  push(0, 2, 'order', { wp: { x: 800, y: 200 }, sel: [1] });
  push(1, 2, 'order', { wp: { x: 690, y: 310 }, sel: [5] });
  push(0, 5, 'stop', { sel: [2] });
  push(1, 5, 'stance', { stance: 'hold', sel: [5, 6] });
  push(0, 9, 'order', { wp: { x: 900, y: 300 }, sel: [3, 4] });
  push(1, 9, 'order', { wp: { x: 905, y: 295 }, sel: [7] });
  push(0, 14, 'order', { wp: { x: 1000, y: 250 }, sel: [1, 2] });
  push(1, 14, 'stop', { sel: [6] });
  push(0, 20, 'stance', { stance: 'attack', sel: [3] });
  push(1, 20, 'order', { wp: { x: 1005, y: 240 }, sel: [5, 6, 7] });

  const perms = [s, s.slice().reverse(),
    (() => { const a = s.slice(); let x = 991; const rnd = () => { x = (Math.imul(x, 1664525) + 1013904223) >>> 0; return x / 4294967296; }; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; })(),
    (() => { const a = s.slice(); let x = 42424242; const rnd = () => { x = (Math.imul(x, 1664525) + 1013904223) >>> 0; return x / 4294967296; }; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; })()];

  const digests = [];
  for (const pm of perms) {
    const buf = createNetBuf();
    for (const p of pm) deliver(buf, p);
    const log = [];
    for (let tick = 1; tick <= 60; tick++) {
      for (const c of drainNet(buf, tick)) log.push(`${tick}:${c.player}:${c.seq}:${c.type}`);
    }
    digests.push(log.join('|'));
  }
  // all permutations must equal; print shared digest (length + content hash
  // via simple FNV inline so a cross-engine divergence shows as string diff)
  const equal = digests.every(d => d === digests[0]);
  if (!equal) { console.log('DIVERGENT'); return; }
  let h = 0x811c9dc5;
  const d = digests[0];
  for (let i = 0; i < d.length; i++) { h ^= d.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  console.log(`${digests.length}:${d.length}:${h >>> 0}`);
})();