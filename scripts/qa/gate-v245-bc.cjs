// v2.45 slice B+C gate: RA start (MCV only), deploy->CC, AI deploys blind, fog no enemy paint
const path = require('path');
const fs = require('fs');
const pwPath = require('child_process').execSync('npm root -g').toString().trim();
const { chromium } = require(path.join(pwPath, 'playwright'));
(async () => {
  const url = process.env.SCC_URL || 'http://127.0.0.1:4177/scc/';
  const shot = process.env.SHOT || '/tmp/v245bc_start.png';
  const errs = [];
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  p.on('pageerror', e => errs.push(String(e)));
  p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await p.goto(url, { waitUntil: 'networkidle' });
  await p.evaluate(() => localStorage.setItem('starfront.cutseen.v1', '1'));
  await p.goto(url, { waitUntil: 'networkidle' });
  await p.waitForTimeout(2000);

  // ---- start state: MCV only, no buildings ----
  const st = await p.evaluate(async () => {
    const game = window.__SCC2; if (!game) return { err: 'no game' };
    const sm = game.scene;
    for (const s of sm.getScenes(true)) sm.stop(s.scene.key);
    await new Promise(r => setTimeout(r, 500));
    sm.start('Battle', { race: 'terran', enemyRace: 'skarn', difficulty: 'normal' });
    await new Promise(r => setTimeout(r, 6000));
    const bs = sm.getScene('Battle');
    const out = {};
    out.pUnits = bs.units.filter(u => !u.dead && u.team === 0).map(u => u.kind);
    out.pBuildings = bs.buildings.filter(x => !x.dead && x.team === 0).length;
    out.hasMCV = out.pUnits.includes('mcv');
    out.mcvOnly = out.pUnits.length === 1 && out.pUnits[0] === 'mcv';
    out.supplyCap = bs.players[0].supplyCap;
    // enemy: must have roaming MCV, no primary yet (deploys after ~10s roam)
    out.eMCV = bs.units.some(u => !u.dead && u.team === 1 && u.def.mcv);
    out.ePrimaryAtSpawn = bs.buildings.some(x => !x.dead && x.team === 1 && x.def.primary);
    // fog blind: tile deep in enemy half must NOT be seen at spawn
    const W = bs.nav.w;
    const etx = Math.floor(W * 0.88), ety = Math.floor(W * 0.88);
    out.enemySideUnseen = bs.seen[bs.nav.idx(etx, ety)] === 0;
    return out;
  });

  await p.evaluate(() => new Promise(r => window.__SCC2.renderer.snapshot(img => r(img.src)))).then(du => fs.writeFileSync(shot, Buffer.from(du.split(',')[1], 'base64')));

  // ---- player deploy flow: move MCV to starter patch, deploy ----
  const dep = await p.evaluate(async () => {
    const bs = window.__SCC2.scene.getScene('Battle');
    const mcv = bs.units.find(u => !u.dead && u.team === 0 && u.kind === 'mcv');
    if (!mcv) return { err: 'no player MCV' };
    // nearest mineral
    let best = null, bd = 1e9;
    for (const m of bs.minerals) { const d = Math.hypot(m.x - mcv.x, m.y - mcv.y); if (d < bd) { bd = d; best = m; } }
    // fast-forward: snap straight to a valid deploy spot beside the patch (harness speedup)
    const d0 = { w: 5, h: 4 };
    let placed = null;
    for (let ox = 0; ox <= 80 && !placed; ox += 8) for (let oy = 0; oy <= 48 && !placed; oy += 8) {
      for (const [sx, sy] of [[ox, oy], [-ox, oy], [ox, -oy], [-ox, -oy]]) {
        if (bs.deploySpotValid(d0, best.x + sx, best.y + sy, 0)) { placed = { x: best.x + sx, y: best.y + sy }; break; }
      }
    }
    if (!placed) return { err: 'no valid spot near patch' };
    mcv.order = null; mcv.state = 'idle';
    mcv.x = placed.x; mcv.y = placed.y;
    await new Promise(r => setTimeout(r, 100));
    bs.clearSelection();
    bs.addToSelection ? bs.addToSelection(mcv) : bs.selection.add(mcv);
    const ok = bs.deployMCV(mcv);
    await new Promise(r => setTimeout(r, 400));
    const cc = bs.buildings.find(x => !x.dead && x.team === 0 && x.def.primary);
    // supply + production
    const canTrain = !!(cc && cc.def.produces && cc.def.produces.includes('rigger'));
    let trainWorked = false;
    if (canTrain && bs.players[0].minerals >= 50) { cc.queueUnit('rigger'); trainWorked = cc.queue.length > 0 || bs.units.some(u => !u.dead && u.team === 0 && u.kind === 'rigger'); }
    return { ok: !!ok, cc: !!cc, supplyCap: bs.players[0].supplyCap, canTrain, trainWorked, mcvGone: !bs.units.includes(mcv) };
  });

  // ---- AI deploys over time (blind to player, but finds ITS minerals) ----
  const ai = await p.evaluate(async () => {
    const bs = window.__SCC2.scene.getScene('Battle');
    for (let i = 0; i < 60; i++) {
      if (bs.buildings.some(x => !x.dead && x.team === 1 && x.def.primary)) break;
      await new Promise(r => setTimeout(r, 500));
    }
    const eCC = bs.buildings.find(x => !x.dead && x.team === 1 && x.def.primary);
    return { aiDeployed: !!eCC, aiCCPos: eCC ? [Math.round(eCC.x), Math.round(eCC.y)] : null };
  });

  const du2 = await p.evaluate(() => new Promise(r => window.__SCC2.renderer.snapshot(img => r(img.src))));
  fs.writeFileSync(shot.replace('.png', '_deploy.png'), Buffer.from(du2.split(',')[1], 'base64'));

  const results = [
    ['player starts with MCV', st.hasMCV],
    ['player start = MCV only (no troops/workers)', st.mcvOnly],
    ['no player buildings at start', st.pBuildings === 0],
    ['supply cap 0 pre-deploy', st.supplyCap === 0],
    ['enemy starts with MCV too', st.eMCV],
    ['enemy has no base at spawn', st.ePrimaryAtSpawn === false],
    ['enemy half unseen at spawn (fog blind)', st.enemySideUnseen],
    ['deploy succeeds near minerals', dep.ok],
    ['CC exists after deploy', dep.cc],
    ['supply granted after deploy', dep.supplyCap > 0],
    ['CC trains harvesters', dep.trainWorked],
    ['MCV consumed on deploy', dep.mcvGone],
    ['AI deploys its base (blind search)', ai.aiDeployed],
    ['0 page errors', errs.length === 0],
  ];
  let pass = 0;
  for (const [n, ok] of results) { console.log(ok ? 'PASS' : 'FAIL', n); if (ok) pass++; }
  console.log(`${pass}/${results.length}`, JSON.stringify({ st, dep, ai }).slice(0, 500));
  if (errs.length) console.log('ERRORS:', errs.slice(0, 5));
  await b.close();
  process.exit(pass === results.length ? 0 : 1);
})().catch(e => { console.log('E', String(e).slice(0, 300)); process.exit(1); });
