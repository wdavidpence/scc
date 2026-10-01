// P1.034 net-queue GATE (ticket done_when: "shuffled network arrival produces
// identical execution order and hash").
//
// P family (pure Node): netCmds kernel fed the SAME command set under seeded
// arrival permutations (incl. full reversal) must produce byte-identical
// execution sequences; duplicates drop; gap-hold preserves per-player seq
// order. P4 reruns the digest under `node --jitless` (cross-engine identity).
//
// L family (live, manual-clock): a scripted skirmish where 12 order/stop/
// stance packets enter the live BattleScene netBuf in four arrival
// permutations (canonical / reversed / two seeded shuffles; all delivered
// before the clock advances). Oracle: wrapped execCmd call-order + full
// hashRing + final exportSimState byte-identical across all four AND
// different from a no-commands control run (non-vacuity). Exec count must
// equal packet count — the net path executes EVERY packet (no last-arrival
// coalescing; that is the local-input path, and coalescing there is
// arrival-order dependent BY DESIGN, which is exactly why net streams need
// this queue).
const path = require('path');
const { execSync, execFileSync } = require('child_process');

// ---------- P family ----------
async function runPure() {
  const { pathToFileURL } = require('url');
  const { createNetBuf, deliver, drainNet } = await import(pathToFileURL(path.resolve(__dirname, '../src2/engine/netCmds.js')).href);

  const mkStream = () => {
    const s = [];
    const push = (player, tick, type, payload) => {
      const seq = (s.filter(x => x.player === player).pop() || { seq: 0 }).seq + 1;
      s.push({ player, seq, tick, type, payload });
    };
    push(0, 2, 'order', { wp: { x: 700, y: 300 }, sel: [1, 2] });
    push(0, 2, 'order', { wp: { x: 800, y: 200 }, sel: [1] });   // same-subject follow-up: both must execute
    push(1, 2, 'order', { wp: { x: 690, y: 310 }, sel: [5] });   // cross-player tick collision
    push(0, 5, 'stop', { sel: [2] });
    push(1, 5, 'stance', { stance: 'hold', sel: [5, 6] });
    push(0, 9, 'order', { wp: { x: 900, y: 300 }, sel: [3, 4] });
    push(1, 9, 'order', { wp: { x: 905, y: 295 }, sel: [7] });
    push(0, 14, 'order', { wp: { x: 1000, y: 250 }, sel: [1, 2] });
    push(1, 14, 'stop', { sel: [6] });
    push(0, 20, 'stance', { stance: 'attack', sel: [3] });
    push(1, 20, 'order', { wp: { x: 1005, y: 240 }, sel: [5, 6, 7] });
    return s;
  };

  const execRun = (packets) => {
    const buf = createNetBuf();
    for (const p of packets) deliver(buf, p);
    const log = [];
    for (let tick = 1; tick <= 60; tick++) {
      for (const c of drainNet(buf, tick)) log.push(`${tick}:${c.player}:${c.seq}:${c.type}`);
    }
    return { log: log.join('|'), n: log.length, dropped: buf.dropped };
  };

  const lcgShuffle = (arr, seed) => {
    const a = arr.slice();
    let s = seed >>> 0;
    const rnd = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  };

  const out = { notes: [] };
  const ok = (id, cond, note) => { if (!cond) out.notes.push(`FAIL ${id}${note ? ' :: ' + note : ''}`); };

  const canon = mkStream();
  const base = execRun(canon);
  ok('P0-NONVACUOUS', base.n === canon.length, `executed ${base.n}/${canon.length}`);

  const perms = [canon.slice().reverse(), lcgShuffle(canon, 991), lcgShuffle(canon, 4242), lcgShuffle(canon, 77777), lcgShuffle(canon, 1234567), lcgShuffle(canon, 987654321)];
  let permDiff = 0, allSame = true;
  for (const pm of perms) {
    const pmSeq = pm.map(p => `${p.player}:${p.seq}`).join();
    const cmSeq = canon.map(p => `${p.player}:${p.seq}`).join();
    if (pmSeq !== cmSeq) permDiff++;
    if (execRun(pm).log !== base.log) allSame = false;
  }
  ok('P1-PERM-IDENTITY', allSame, 'a permutation forked the execution sequence');
  ok('P1-PERM-REAL', permDiff >= 5, `only ${permDiff} permutations differ from canonical`);

  const dup = [];
  for (const p of canon) { dup.push(p); dup.push({ ...p }); }
  const rD = execRun(dup);
  ok('P2-DEDUP', rD.log === base.log && rD.dropped === canon.length, `logEqual=${rD.log === base.log} dropped=${rD.dropped}`);

  const rev = canon.slice().reverse();
  const bufG = createNetBuf();
  for (const p of rev) deliver(bufG, p);
  const logG = [];
  let prefixOK = true;
  const lastSeen = new Map();
  for (let tick = 1; tick <= 60; tick++) {
    for (const c of drainNet(bufG, tick)) {
      logG.push(`${tick}:${c.player}:${c.seq}:${c.type}`);
      // per-player executed seqs must form a strict 1,2,3,... prefix — no
      // command may run ahead of a missing smaller seq (gap-hold invariant)
      const prev = lastSeen.get(c.player) || 0;
      if (c.seq !== prev + 1) prefixOK = false;
      lastSeen.set(c.player, c.seq);
    }
  }
  ok('P3-GAP-ORDER', logG.join('|') === base.log && prefixOK, 'reversed arrival diverged or broke the seq prefix rule');

  // P4 cross-engine: selftest child prints one digest of the same family;
  // default V8 vs --jitless must agree.
  try {
    const mk = (flags) => execFileSync('node', [...flags.split(' ').filter(Boolean), path.resolve(__dirname, 'verify-netcmds-selftest.cjs')], { encoding: 'utf8' }).trim();
    const v8 = mk('');
    const jl = mk('--jitless');
    ok('P4-CROSS-ENGINE', v8.length > 10 && v8 === jl, `v8=${v8.slice(0, 24)} jitless=${jl.slice(0, 24)}`);
  } catch (e) { ok('P4-CROSS-ENGINE', false, String(e).slice(0, 120)); }

  return out;
}

(async () => {
  let pass = 0, fail = 0;
  const ok = (id, cond, note) => { if (cond) { pass++; console.log(`PASS ${id}`); } else { fail++; console.log(`FAIL ${id}${note ? ' :: ' + note : ''}`); } };

  console.log('--- P family (pure kernel) ---');
  const P = await runPure();
  for (const n of P.notes) console.log(n);
  ok('P-FAMILY', P.notes.length === 0, `${P.notes.length} kernel failures`);

  console.log('--- L family (live identity under shuffled arrival) ---');
  let chromium;
  try { chromium = require(path.join(execSync('npm root -g').toString().trim(), 'playwright')).chromium; }
  catch (e) { console.log('SKIP L family (no playwright): ' + e.message.slice(0, 60)); console.log(`RESULT NETQ ${fail === 0 ? 'PASS' : 'FAIL'} ${pass}/${pass + fail} (live skipped)`); process.exit(fail === 0 ? 0 : 1); }

  // builds S (module-level array under eval) from live units; S declared outside eval
  const packetScript = `
    const push = (player, tick, type, payload) => {
      const seq = (S.filter(x => x.player === player).pop() || { seq: 0 }).seq + 1;
      S.push({ player, seq, tick, type, payload });
    };
    const t0 = u.filter(x => x.team === 0 && !x.dead).map(x => x.id);
    const t1 = u.filter(x => x.team === 1 && !x.dead).map(x => x.id);
    push(0, 10, 'order', { wp: { x: 760, y: 380 }, sel: t0.slice(0, 2) });
    push(0, 11, 'order', { wp: { x: 840, y: 420 }, sel: [t0[0]] });
    push(1, 10, 'order', { wp: { x: 750, y: 390 }, sel: t1.slice(0, 2) });
    push(0, 30, 'stance', { stance: 'attack', sel: t0.slice(0, 3) });
    push(1, 30, 'order', { wp: { x: 900, y: 350 }, sel: t1.slice(2) });
    push(0, 52, 'order', { wp: { x: 980, y: 300 }, sel: t0.slice(2) });
    push(1, 52, 'stop', { sel: [t1[0]] });
    push(0, 77, 'stop', { sel: [t0[1]] });
    push(1, 77, 'order', { wp: { x: 1020, y: 280 }, sel: t1.slice(0, 3) });
    push(0, 101, 'order', { wp: { x: 1100, y: 260 }, sel: t0.slice(0, 2) });
    push(1, 101, 'stance', { stance: 'hold', sel: t1.slice(3) });
    push(0, 123, 'order', { wp: { x: 1160, y: 240 }, sel: t0 });
  `;

  const browser = await chromium.launch();
  const runLive = async (mode) => {
    const p = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const errs = [];
    p.on('pageerror', e => errs.push(String(e).slice(0, 160)));
    await p.goto(process.env.SCC_URL || 'http://127.0.0.1:4177/scc/', { waitUntil: 'networkidle' });
    const r = await p.evaluate(async ([modeSrc, packetsSrc]) => {
      const sm = window.__SCC2.scene;
      for (const s of sm.getScenes(true)) sm.stop(s.scene.key);
      await new Promise(r => setTimeout(r, 300));
      sm.start('Battle', { race: 'terran', enemyRace: 'skarn' });
      const bs = sm.getScene('Battle');
      if (!bs) return { err: 'NO_BATTLE_INSTANCE' };
      bs.__manual = true;
      const tw = performance.now();
      while (performance.now() - tw < 15000) {
        if (bs.simRng && bs.units && bs.units.length) break;
        await new Promise(r => setTimeout(r, 25));
      }
      if (!bs.simRng) return { err: 'CREATE_STALL' };
      const u = bs.units;
      const S = []; eval(packetsSrc);
      const execLog = [];
      const orig = bs.execCmd.bind(bs);
      bs.execCmd = (c) => { execLog.push(`${bs.simTickIndex}:${c.player}:${c.seq}:${c.type}`); return orig(c); };
      let arr;
      if (modeSrc === 'none') arr = [];
      else if (modeSrc === 'canon') arr = S.slice();
      else if (modeSrc === 'rev') arr = S.slice().reverse();
      else if (modeSrc === 'gap') arr = S.slice().reverse();
      else {
        let s = modeSrc === 'shufA' ? 900001 : 2000003;
        arr = S.slice();
        const rnd = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
        for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; }
        void s;
      }
      const w0 = bs.units.find(x => x.team === 0);
      const p0 = w0 ? { x: w0.x, y: w0.y } : { x: 0, y: 0 };
      if (modeSrc === 'gap') {
        // split delivery with holes: first 6 now, step 60, rest after —
        // per-player seq prefix ORDER must survive; execution timing shifts
        // legally (late arrival = latency, the kernel never reorders)
        for (const pkt of arr.slice(0, 6)) bs.__net(pkt);
        bs.__collectHashes = true;
        await new Promise(r => setTimeout(r, 50));
        for (let i = 0; i < 60; i++) bs.__step(1000 / 24);
        for (const pkt of arr.slice(6)) bs.__net(pkt);
        for (let i = 60; i < 240; i++) bs.__step(1000 / 24);
      } else {
        for (const pkt of arr) bs.__net(pkt);
        bs.__collectHashes = true;
        await new Promise(r => setTimeout(r, 50));
        for (let i = 0; i < 240; i++) bs.__step(1000 / 24);
      }
      const st = bs.exportSimState();
      const w1 = bs.units.find(x => x.id === (w0 && w0.id));
      return {
        err: null,
        ring: (bs.hashRing || []).join('|'),
        state: typeof st === 'string' ? st : JSON.stringify(st),
        exec: execLog.join('|'),
        nExec: execLog.length, nPk: arr.length,
        moved: w1 ? Math.abs(w1.x - p0.x) + Math.abs(w1.y - p0.y) : 0,
      };
    }, [mode, packetScript]);
    await p.close();
    return { ...r, errs };
  };

  const C = await runLive('none');
  const A = await runLive('canon');
  const B = await runLive('rev');
  const SA = await runLive('shufA');
  const SB = await runLive('shufB');
  const DG = await runLive('gap'); // split delivery: order must stay intact; timing may (legally) shift
  await browser.close();
  const runs = { C, A, B, SA, SB, DG };
  for (const [k, v] of Object.entries(runs)) if (v.err) { ok(`RUN-OK-${k}`, false, v.err); }
  if (!Object.values(runs).some(v => v.err)) {
    ok('RUNS-OK', true);
    ok('IDENTITY-CANON-VS-REV', A.exec === B.exec && A.ring === B.ring && A.state === B.state, 'reversed arrival forked exec order/ring/state');
    ok('IDENTITY-SHUFFLES', A.exec === SA.exec && A.exec === SB.exec && A.ring === SA.ring && A.ring === SB.ring, 'a seeded shuffle forked the oracle');
    ok('NO-COALESCING', A.nExec === A.nPk && A.nExec === 12, `exec ${A.nExec}/${A.nPk} (net path must execute every packet)`);
    const gapOrder = (() => {
      if (DG.nExec !== 12) return false;
      const last = {};
      for (const e of DG.exec.split('|')) {
        const parts = e.split(':');
        const p = parts[1], sq = +parts[2];
        if (sq !== (last[p] || 0) + 1) return false;
        last[p] = sq;
      }
      return true;
    })();
    ok('GAP-ORDER-PRESERVED', gapOrder, `gap run exec ${DG.nExec}/12, order=${gapOrder}`);
    ok('NONVACUOUS', A.ring !== C.ring && A.moved > 60, `ring differs=${A.ring !== C.ring} moved=${(A.moved || 0).toFixed(0)}px`);
    const noErr = Object.values(runs).every(v => v.errs.length === 0);
    ok('NO-PAGE-ERRORS', noErr, Object.values(runs).flatMap(v => v.errs).slice(0, 3).join('; ').slice(0, 200));
  }
  console.log(`RESULT NETQ ${fail === 0 ? 'PASS' : 'FAIL'} ${pass}/${pass + fail}`);
  process.exit(fail === 0 ? 0 : 1);
})().catch(e => { console.log('FAIL NETQ-HARNESS :: ' + String(e).slice(0, 300)); process.exit(1); });