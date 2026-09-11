// v2.54 gate: minimap patrol route chrome + construction dust FX.
// Prints per-check JSON + GATE-V254 PASS/FAIL, exit code reflects result.
const path = require('path');
const pwPath = require('child_process').execSync('npm root -g').toString().trim();
const { chromium } = require(path.join(pwPath, 'playwright'));
(async () => {
  const url = process.env.SCC_URL || 'http://127.0.0.1:4177/scc/';
  const shot = process.env.SHOT || '/tmp/v254_fx.png';
  const errs = [];
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  p.on('pageerror', e => errs.push(String(e)));
  p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); if (/DIAG/.test(m.text())) console.log(m.text()); });
  await p.goto(url, { waitUntil: 'networkidle' });
  await p.evaluate(() => localStorage.setItem('starfront.cutseen.v1', '1'));
  await p.goto(url, { waitUntil: 'networkidle' });
  await p.waitForTimeout(2000);
  await p.evaluate(async () => {
    console.log('DIAG boot1');
    const sm = window.__SCC2.scene;
    for (const s of sm.getScenes(true)) sm.stop(s.scene.key);
    await new Promise(r => setTimeout(r, 400));
    sm.start('Battle', { race: 'terran', enemyRace: 'skarn' });
    sm.start('Hud', { race: 'terran' });
    await new Promise(r => setTimeout(r, 5000));
    console.log('DIAG boot2');
    const bt = window.__SCC2.scene.getScene('Battle');
    // deploy CC so workers trickle in
    const mcv = bt.units.find(u => u && u.def && u.team === 0 && !u.dead && u.def.mcv);
    console.log('DIAG mcv', !!mcv);
    if (mcv) {
      const pd = mcv.def.deploysTo || 'commandCenter';
      const min = bt.minerals[0];
      if (min) { for (let rr = 2; rr < 14; rr++) { for (const dd of [[rr,0],[-rr,0],[0,rr],[0,-rr]]) { if (bt.placementValid(pd, min.x + dd[0]*16, min.y + dd[1]*16)) { mcv.setPos(min.x + dd[0]*16, min.y + dd[1]*16); rr = 99; break; } } } }
      bt.deployMCV(mcv);
      await new Promise(r => setTimeout(r, 2500));
    }
  });
  const out = [];
  const chk = (id, ok, extra) => out.push({ id, ok: !!ok, ...(extra || {}) });

  // 1. patrol: set two anchors + order via the real API
  const pat = await p.evaluate(() => {
    const bt = window.__SCC2.scene.getScene('Battle');
    const cam = bt.cameras.main;
    const u = bt.units.find(x => x.team === 0 && !x.dead && !x.def.mcv) || bt.spawnUnit(0, 'marine', cam.scrollX + 200, cam.scrollY + 200, { arriveReady: true });
    u.patrolPoints = [{ x: cam.scrollX + 180, y: cam.scrollY + 180 }, { x: cam.scrollX + 380, y: cam.scrollY + 320 }];
    u._patrolIdx = 0;
    u.setOrder({ type: 'patrol' });
    bt._patrolPingAt = bt.gameTime;
    return { ok: !!u.order && u.order.type === 'patrol' && u.patrolPoints.length === 2 };
  });
  chk('PATROL_ORDER_SET', pat.ok === true, pat);

  // 2. minimap draw contains patrol segments: count line draws by sampling mmG
  //    graphics command log isn't public; instead compare pixel evidence is hard ->
  //    functional proxy: drawMinimap ran without error and patrol chrome code path
  //    exercised (verify by patching a spy on lineBetween during draw).
  const spy = await p.evaluate(() => {
    const bt = window.__SCC2.scene.getScene('Battle');
    const h = window.__SCC2.scene.getScene('Hud');
    let dashes = 0, rings = 0, ret = 0;
    const g = h.mmG || h.__mmG;
    // find the graphics: scan children for the one used by drawMinimap
    const gg = h.mmG;
    if (!gg) return { err: 'no graphics' };
    const origLB = gg.lineBetween.bind(gg), origSC = gg.strokeCircle.bind(gg);
    gg.lineBetween = (...a) => { dashes++; return origLB(...a); };
    gg.strokeCircle = (...a) => { rings++; return origSC(...a); };
    h.drawMinimap(bt);
    gg.lineBetween = origLB; gg.strokeCircle = origSC;
    return { dashes, rings };
  });
  chk('PATROL_MINIMAP_CHROME', spy.dashes >= 4 && spy.rings >= 2, spy);

  // 3. armed anchor reticle: patrolMode + anchor draws a strokeCircle
  const armed = await p.evaluate(() => {
    const bt = window.__SCC2.scene.getScene('Battle');
    const h = window.__SCC2.scene.getScene('Hud');
    bt.patrolMode = true; bt._patrolAnchor = { x: bt.cameras.main.scrollX + 250, y: bt.cameras.main.scrollY + 250 };
    let rings = 0;
    const gg = h.mmG;
    const origSC = gg.strokeCircle.bind(gg);
    gg.strokeCircle = (...a) => { rings++; return origSC(...a); };
    h.drawMinimap(bt);
    gg.strokeCircle = origSC;
    bt.patrolMode = false;
    return { rings };
  });
  chk('PATROL_ARM_RETICLE', armed.rings >= 3, armed);

  // 4. construction: place a building site with a worker, watch dust puffs spawn
  const cons = await p.evaluate(async () => {
    const bt = window.__SCC2.scene.getScene('Battle');
    const cam = bt.cameras.main;
    // find or spawn a worker
    let w = bt.units.find(u => u && u.def && u.team === 0 && !u.dead && u.def.worker);
    if (!w) w = bt.spawnUnit(0, 'rigger', cam.scrollX + 300, cam.scrollY + 300, { arriveReady: true });
    if (!w) return { err: 'no worker and spawnUnit failed' };
    const bid = 'supplyDepot';
    let sx = cam.scrollX + 500, sy = cam.scrollY + 400;
    for (let rr = 0; rr < 12 && !bt.placementValid(bid, sx, sy); rr++) { sx += 32; }
    if (!bt.placementValid(bid, sx, sy)) return { err: 'no valid spot' };
    const bb = new window.__SCCBuilding(bt, 0, bid, sx, sy, {});
    bt.buildings.push(bb);
    w.setPos(sx, sy);
    w.setOrder({ type: 'build', building: bb });
    // swiftshader ticks ~1-2fps; poll for live dust puffs up to 6s
    let nearCount = 0;
    for (let i = 0; i < 12 && nearCount === 0; i++) {
      await new Promise(r => setTimeout(r, 500));
      w.setPos(sx, sy); // keep in build range
      const near = bt.children.list.filter(o => o.active && o.type === 'Arc' && Math.abs(o.x - sx) < 60 && Math.abs(o.y - sy) < 60 && o.fillColor === 0xc8b890);
      nearCount = near.length;
    }
    return { nearCount, built: bb.built, prog: Math.round((bb.constructionProgress / bb.buildTime) * 100) };
  });
  chk('CONSTRUCT_DUST', cons.nearCount >= 1, cons);

  // 5. no errors + patrol unit actually moves
  const moved = await p.evaluate(async () => {
    const bt = window.__SCC2.scene.getScene('Battle');
    const u = bt.units.find(x => x.team === 0 && x.order?.type === 'patrol' && !x.dead);
    if (!u) return { ok: false, why: 'patroller gone' };
    const p0 = { x: u.x, y: u.y };
    await new Promise(r => setTimeout(r, 1500));
    return { ok: Math.hypot(u.x - p0.x, u.y - p0.y) > 4 };
  });
  chk('PATROL_MOVES', moved.ok === true, moved);

  await p.screenshot({ path: shot });
  console.log(out.map(o => JSON.stringify(o)).join('\n'));
  const fails = out.filter(o => !o.ok);
  const errFails = errs.filter(e => !/favicon|cursor/i.test(e));
  if (fails.length || errFails.length) { console.log('GATE-V254 FAIL', JSON.stringify({ fails: fails.map(f => f.id), errs: errFails.slice(0, 3) })); await b.close(); process.exit(1); }
  console.log('GATE-V254 PASS ' + out.length + '/' + out.length);
  await b.close();
})().catch(e => { console.error('FATAL', String(e)); process.exit(2); });
