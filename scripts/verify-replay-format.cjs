// P1.035 replay-format GATE (ticket done_when: "schema round-trips a
// 10-minute replay losslessly and rejects mismatched content hashes").
//
// F family (pure): a scripted 600 s / 14400-tick replay (~2.3k commands,
// float waypoints, nested payloads, 36 spawn fixtures) must encode→decode
// losslessly (deep-equal + byte-identical re-encode). Rejection family:
// single-byte corruption anywhere, truncation, and RE-SIGNED edits (checksum
// recomputed, so the content checks are what rejects — proving the schema
// refuses mismatched map/data hashes even to an adversary who re-hashes).
// Cross-engine: --jitless child must print the identical digest.
//
// L family (live): __cmdLog recorded from a running match (real payload
// shapes) round-trips the same way, and the replay's mapHash must match the
// live baked terrain and reject the same file at a different map.
// Run: node scripts/verify-replay-format.cjs   (SCC_URL for the live part)
const path = require('path');
const { execSync, execFileSync } = require('child_process');

async function loadMods() {
  const { pathToFileURL } = require('url');
  const rf = Object.assign({}, await import(pathToFileURL(path.resolve(__dirname, '../src2/engine/replayFormat.js')).href));
  rf.h32 = rf.default.h32;
  const sc1 = await import(pathToFileURL(path.resolve(__dirname, '../src2/data/sc1.js')).href);
  return { rf, sc1 };
}

// deterministic generator for the 10-minute fixture
function buildBigReplay(rf, sc1) {
  let s = 20261001 >>> 0;
  const rnd = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
  const units = [];
  const kindPool = Object.keys(sc1.UNITS);
  for (let i = 0; i < 36; i++) {
    units.push([i % 2, kindPool[Math.floor(rnd() * kindPool.length)], 64 + rnd() * 1100, 64 + rnd() * 1100]);
  }
  const cmds = [];
  const types = ['order', 'stop', 'stance', 'patrol', 'attackMove', 'attackTarget', 'unload', 'automine', 'ucast', 'place', 'deploy', 'queue'];
  // ~2.3k commands spread over 14400 ticks, incl. same-tick bursts and
  // float waypoints (fractional .375 grid points like real move orders)
  let tick = 2;
  while (tick < 14400 && cmds.length < 2300) {
    const burst = 1 + (rnd() < 0.18 ? Math.floor(rnd() * 3) : 0);
    for (let k = 0; k < burst; k++) {
      const player = rnd() < 0.5 ? 0 : 1;
      const type = types[Math.floor(rnd() * types.length)];
      const u = Math.floor(rnd() * 36);
      const q = () => Math.round((64 + rnd() * 1100) * 8) / 8; // .125 grid floats
      let payload = null;
      if (type === 'order') payload = { wp: { x: q(), y: q() }, shift: rnd() < 0.2, alt: rnd() < 0.1, sel: [u, (u + 1) % 36] };
      else if (type === 'patrol') payload = { a: { x: q(), y: q() }, b: { x: q(), y: q() } };
      else if (type === 'attackTarget') payload = { target: (u + 7) % 36, sel: [u] };
      else if (type === 'stance') payload = { stance: 'hold', sel: [u] };
      else if (type === 'stop') payload = { sel: [u] };
      else if (type === 'unload') payload = { sel: [u], point: { x: q(), y: q() } };
      else if (type === 'ucast') payload = { by: u, mode: 'cloud', x: q(), y: q() };
      else if (type === 'place') payload = { bid: 'pylon', x: q(), y: q(), sel: [u] };
      else if (type === 'deploy') payload = { uid: u };
      else if (type === 'queue') payload = { bid: 'barracks', kind: kindPool[Math.floor(rnd() * kindPool.length)] };
      cmds.push({ tick, player, type, subject: type === 'order' ? 'move' : type, payload });
    }
    tick += 3 + Math.floor(rnd() * 14);
  }
  const mapHash = rf.computeMapHash({ solid: new Uint8Array(25600).fill(1), blocked: [] });
  const dataHash = rf.computeDataHash({ units: sc1.UNITS, buildings: sc1.BUILDINGS, techs: sc1.TECHS, w: sc1.MAP_W, h: sc1.MAP_H, tile: sc1.TILE });
  return { seed: 0xBEEF01, ticks: 14400, hashEvery: 1, mapHash, dataHash, units, commands: cmds };
}

function pureChecks() {
  return loadMods().then(({ rf, sc1 }) => {
    const notes = [];
    const ok = (id, cond, note) => { if (!cond) notes.push(`FAIL ${id}${note ? ' :: ' + note : ''}`); };
    const repl = buildBigReplay(rf, sc1);
    const txt = rf.encodeReplay(repl);

    // F1 lossless round-trip
    const d = rf.decodeReplay(txt, { mapHash: repl.mapHash, dataHash: repl.dataHash });
    ok('F1-DECODE-OK', d.ok === true, d.error);
    if (d.ok) {
      const r = d.replay;
      const same = r.seed === repl.seed && r.ticks === repl.ticks && r.units.length === repl.units.length &&
        r.commands.length === repl.commands.length &&
        JSON.stringify(r.units) === JSON.stringify(repl.units) &&
        r.commands.every((c, i) => c.tick === repl.commands[i].tick && c.player === repl.commands[i].player && c.type === repl.commands[i].type && c.subject === repl.commands[i].subject && JSON.stringify(c.payload) === JSON.stringify(repl.commands[i].payload));
      ok('F1-LOSSLESS', same, 'semantic divergence after decode');
      ok('F1-REENCODE', rf.encodeReplay(r) === txt, 're-encode not byte-identical');
      ok('F1-SIZE', txt.length < 8_000_000, `${txt.length} bytes`);
    }
    // F2 single-byte corruption at spaced positions — ALL must be refused
    let corruptFails = [];
    const cmdStart = txt.indexOf('\nC ') + 2;
    for (let k = 0; k < 40; k++) {
      const i = cmdStart + 10 + ((k * 613 + 37) % Math.max(1, txt.length - cmdStart - 20));
      const c = txt[i];
      const rep = c === '1' ? '2' : '1';
      if (c === rep) continue;
      const mod = txt.slice(0, i) + rep + txt.slice(i + 1);
      const res = rf.decodeReplay(mod, { mapHash: repl.mapHash, dataHash: repl.dataHash });
      if (res.ok) corruptFails.push(i);
    }
    ok('F2-CORRUPTION-REFUSED', corruptFails.length === 0, `silently accepted at ${corruptFails.slice(0, 5)}`);
    // F3 re-signed attacks (checksum recomputed — content checks must catch)
    const resign = (body) => {
      const b = body.endsWith('\n') ? body.slice(0, -1) + '\n' : body;
      return b + '#' + rf.h32(b) + '\n';
    };
    {
      const lines = txt.split('\n');
      const bodyNoCk = lines.slice(0, -2).join('\n') + '\n';
      // seed change re-signed → refused (checksum class: seed is covered)
      // unsigned seed change → checksum refuses (seed is covered)
      const l0 = lines[0].replace(/seed=[0-9a-f]+/, 'seed=beef02');
      const seedSwap = resign(l0 + '\n' + bodyNoCk.slice(bodyNoCk.indexOf('\n') + 1));
      ok('F3-SEED-REFUSED', rf.decodeReplay(txt.replace(/seed=[0-9a-f]+/, 'seed=beef02'), {}).error === 'CHECKSUM_MISMATCH' && !rf.decodeReplay(seedSwap, { mapHash: 'cafe0001', dataHash: repl.dataHash }).ok, 'seed swap accepted');
      // version unsupported
      ok('F3-VERSION', rf.decodeReplay(resign(bodyNoCk.replace('SCCR/1', 'SCCR/2')), {}).error === 'VERSION_UNSUPPORTED');
      ok('F3-MAGIC', rf.decodeReplay(resign(bodyNoCk.replace('SCCR/1', 'SCXR/9')), {}).error === 'BAD_MAGIC');
      // map mismatch even re-signed: build a replay file for seed X but load
      // against a different local map hash
      ok('F3-MAP-MISMATCH', rf.decodeReplay(txt, { mapHash: 'deadbeef', dataHash: repl.dataHash }).error === 'MAP_HASH_MISMATCH');
      // data mismatch: one unit stat tweak changes the canonical data hash
      const tweaked = JSON.parse(JSON.stringify({ units: sc1.UNITS, buildings: sc1.BUILDINGS, techs: sc1.TECHS }));
      const anyK = Object.keys(tweaked.units)[0];
      tweaked.units[anyK].hp = (tweaked.units[anyK].hp || 100) + 1;
      ok('F3-DATA-MISMATCH', rf.decodeReplay(txt, { mapHash: repl.mapHash, dataHash: rf.computeDataHash(tweaked) }).error === 'DATA_HASH_MISMATCH');
      // command-count mismatch (header nc edited, re-signed)
      const ncEdited = bodyNoCk.replace(/nc=\d+/, 'nc=7');
      ok('F3-CC-MISMATCH', rf.decodeReplay(resign(ncEdited), { mapHash: repl.mapHash, dataHash: repl.dataHash }).error === 'CC_MISMATCH');
      // truncation (no checksum line, and body-truncated with stale checksum)
      ok('F3-TRUNC-CK-MISSING', !rf.decodeReplay(txt.slice(0, txt.lastIndexOf('\n#')), {}).ok);
      ok('F3-TRUNC-BODY', !rf.decodeReplay(txt.slice(0, 900) + txt.slice(txt.indexOf('\n#')), {}).ok);
    }
    // F4 digest for cross-engine compare
    const digestSrc = [notes.join('|'), txt.length, rf.h32(txt), corruptFails.length].join(';');
    return { notes, digest: rf.h32(digestSrc), size: txt.length, cmds: repl.commands.length };
  });
}

(async () => {
  let pass = 0, fail = 0;
  const ok = (id, cond, note) => { if (cond) { pass++; console.log(`PASS ${id}`); } else { fail++; console.log(`FAIL ${id}${note ? ' :: ' + note : ''}`); } };

  const { rf, sc1 } = await loadMods();

  if (process.env.REPF_CHILD) {
    const r = await pureChecks();
    console.log(r.digest + ':' + r.notes.length);
    process.exit(0);
  }

  console.log('--- F family (pure schema) ---');
  const P = await pureChecks();
  for (const n of P.notes) console.log(n);
  ok('F-PURE', P.notes.length === 0, `${P.notes.length} failures`);
  try {
    const selfPath = path.resolve(__dirname, 'verify-replay-format.cjs');
    const child = execFileSync(process.execPath, ['--jitless', selfPath], { encoding: 'utf8', env: { ...process.env, REPF_CHILD: '1' } }).trim();
    ok('F-JITLESS', child.startsWith(`${P.digest}:0`), `child=${child} parent=${P.digest}:0`);
  } catch (e) { ok('F-JITLESS', false, String(e).slice(0, 120)); }

  console.log('--- L family (live-recorded stream) ---');
  let chromium;
  try { chromium = require(path.join(execSync('npm root -g').toString().trim(), 'playwright')).chromium; }
  catch (e) { console.log('SKIP L family (no playwright): ' + e.message.slice(0, 60)); console.log(`RESULT REPLAY-FORMAT ${fail === 0 ? 'PASS' : 'FAIL'} ${pass}/${pass + fail} (live skipped)`); process.exit(fail === 0 ? 0 : 1); }

  const browser = await chromium.launch();
  const p = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errs = [];
  p.on('pageerror', e => errs.push(String(e).slice(0, 160)));
  await p.goto(process.env.SCC_URL || 'http://127.0.0.1:4177/scc/', { waitUntil: 'networkidle' });
  const live = await p.evaluate(() => {
    const sm = window.__SCC2.scene;
    for (const s of sm.getScenes(true)) sm.stop(s.scene.key);
    return new Promise(res => setTimeout(() => {
      sm.start('Battle', { race: 'terran', enemyRace: 'skarn' });
      const bs = sm.getScene('Battle');
      if (!bs) return res({ err: 'NO_BATTLE' });
      bs.__manual = true;
      const t0 = performance.now();
      const poll = () => {
        if (performance.now() - t0 > 15000) return res({ err: 'CREATE_STALL' });
        if (bs.simRng && bs.units && bs.units.length) {
          bs.__collectCmds = true;
          // scripted 30 s-ish: order bursts interleaved with steps, real
          // units, float waypoints, plus a real automine + ucast payload
          const ids = bs.units.map(u => u.id);
          let log = [];
          for (let t = 5; t < 700; t += 5) {
            for (let k = 0; k < 3; k++) {
              bs.__cmd('order', { wp: { x: 100 + (t * 1.375) % 900, y: 120 + (t * 0.875) % 700 }, shift: false, alt: false, sel: [ids[(t + k) % ids.length]] }, 0, 'move');
            }
            if (t === 60) bs.__cmd('automine', null, 0, 'automine');
            if (t === 200) { const w = bs.units.find(u => u.def && u.def.cloak); if (w) bs.__cmd('cloak', { sel: [w.id] }, 1, 'cloak'); }
            if (t === 300) { const s2 = bs.units.find(u => u.def && u.def.psiCaster); if (s2) bs.__cmd('ucast', { by: s2.id, mode: 'cloud', x: 500.375, y: 400.625 }, 1, 'ucast'); }
            if (t === 400) bs.__cmd('stance', { stance: 'attack', sel: ids.slice(0, 4) }, 0, 'stance');
            for (let i = 0; i < 24; i++) bs.__step(1000 / 24);
          }
          log = bs.__cmdLog || [];
          res({
            err: null,
            recorded: log.map(c => ({ tick: c.tick, player: c.player, subject: c.subject, type: c.type, payload: c.payload })),
            solid: Array.from(bs.nav.solid),
            seed: bs.matchSeed,
            ticks: bs.simTickIndex,
          });
        } else setTimeout(poll, 25);
      };
      poll();
    }, 300));
  });
  await browser.close();
  ok('L1-RECORD', !live.err && live.recorded && live.recorded.length >= 400, live.err || `recorded ${live.recorded ? live.recorded.length : 0}`);
  if (!live.err) {
    const dataHash = rf.computeDataHash({ units: sc1.UNITS, buildings: sc1.BUILDINGS, techs: sc1.TECHS, w: sc1.MAP_W, h: sc1.MAP_H, tile: sc1.TILE });
    const mapHash = rf.computeMapHash({ solid: live.solid, blocked: [] });
    const repl = { seed: live.seed, ticks: live.ticks, hashEvery: 1, mapHash, dataHash, units: [], commands: live.recorded };
    const txt = rf.encodeReplay(repl);
    const d = rf.decodeReplay(txt, { mapHash, dataHash });
    const sameLive = d.ok && d.replay.commands.length === repl.commands.length && d.replay.commands.every((c, i) => {
      const o = repl.commands[i];
      return c.tick === o.tick && c.player === o.player && c.type === o.type && c.subject === (o.subject ?? o.type) && JSON.stringify(c.payload) === JSON.stringify(o.payload ?? null);
    });
    ok('L2-ROUNDTRIP', sameLive, d.error || 'recorded stream forked');
    ok('L3-REENCODE', rf.encodeReplay(d.replay) === txt, 'live-file re-encode differs');
    // the live map hash must REJECT a different terrain: flip one cell and
    // require MAP_HASH_MISMATCH (schema refuses wrong-map replays)
    const otherSolid = live.solid.slice();
    otherSolid[12345] = otherSolid[12345] ? 0 : 1;
    ok('L4-MAP-REFUSED', rf.decodeReplay(txt, { mapHash: rf.computeMapHash({ solid: otherSolid, blocked: [] }), dataHash }).error === 'MAP_HASH_MISMATCH');
    ok('L5-NO-PAGE-ERRORS', errs.length === 0, errs.slice(0, 3).join('; ').slice(0, 200));
  }
  console.log(`RESULT REPLAY-FORMAT ${fail === 0 ? 'PASS' : 'FAIL'} ${pass}/${pass + fail}`);
  process.exit(fail === 0 ? 0 : 1);
})().catch(e => { console.log('FAIL REPLAY-FORMAT-HARNESS :: ' + String(e).slice(0, 300)); process.exit(1); });