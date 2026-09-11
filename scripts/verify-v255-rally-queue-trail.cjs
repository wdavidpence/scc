// v2.55 gate: rally-point minimap dots + event ping + radar ring,
// build-queue countdown chips, attack-move hot cursor trail.
const path = require('path');
const pwPath = require('child_process').execSync('npm root -g').toString().trim();
const { chromium } = require(path.join(pwPath, 'playwright'));
(async () => {
  const url = process.env.SCC_URL || 'http://127.0.0.1:4177/scc/';
  const shot = process.env.SHOT || '/tmp/v255_fx.png';
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
    const sm = window.__SCC2.scene;
    for (const s of sm.getScenes(true)) sm.stop(s.scene.key);
    await new Promise(r => setTimeout(r, 400));
    sm.start('Battle', { race: 'terran', enemyRace: 'skarn' });
    sm.start('Hud', { race: 'terran' });
    await new Promise(r => setTimeout(r, 5000));
    const bt = window.__SCC2.scene.getScene('Battle');
    const mcv = bt.units.find(u => u && u.def && u.team === 0 && !u.dead && u.def.mcv);
    if (mcv) {
      const pd = mcv.def.deploysTo || 'commandCenter';
      const min = bt.minerals[0];
      if (min) { outer: for (let rr = 2; rr < 14; rr++) { for (const dd of [[rr,0],[-rr,0],[0,rr],[0,-rr]]) { if (bt.placementValid(pd, min.x + dd[0]*16, min.y + dd[1]*16)) { mcv.setPos(min.x + dd[0]*16, min.y + dd[1]*16); break outer; } } } }
      bt.deployMCV(mcv);
      await new Promise(r => setTimeout(r, 2500));
    }
  });
  const out = [];
  const chk = (id, ok, extra) => out.push({ id, ok: !!ok, ...(extra || {}) });

  // 1. rally flag: set rally on player CC -> minimap dot + event ping
  const rally = await p.evaluate(() => {
    const bt = window.__SCC2.scene.getScene('Battle');
    const h = window.__SCC2.scene.getScene('Hud');
    const cc = bt.buildings.find(bl => bl.team === 0 && bl.def.primary && !bl.dead);
    if (!cc) return { err: 'no player CC' };
    const before = bt._eventPings.length;
    bt.showRallyFlag(cc);
    const pinged = bt._eventPings.length > before;
    // spy strokeCircle/fillRect counts on mmG during a draw
    let fills = 0;
    const origFC = h.mmG.fillRect.bind(h.mmG);
    let mmRects = [];
    h.mmG.fillRect = (...a) => { mmRects.push(a); return origFC(...a); };
    h.drawMinimap(bt);
    h.mmG.fillRect = origFC;
    // rally dot: 2x2 fill at rally pos * s + mmX
    const s = h.mmSize / (160 * 16);
    const rx = h.mmX + cc._rallyFlagPoint.x * s - 1, ry = h.mmY + cc._rallyFlagPoint.y * s - 1;
    const dot = mmRects.some(a => Math.abs(a[0] - rx) < 1.5 && Math.abs(a[1] - ry) < 1.5);
    return { ok: !!cc._rallyFlag && pinged && dot, pinged, dot, rally: cc._rallyFlagPoint };
  });
  chk('RALLY_MM_DOT_PING', rally.ok === true, rally);

  // 2. radar ring exists inside flag container + tweens pulse
  const radar = await p.evaluate(() => {
    const bt = window.__SCC2.scene.getScene('Battle');
    const cc = bt.buildings.find(bl => bl.team === 0 && bl.def.primary && !bl.dead);
    if (!cc || !cc._rallyFlag) return { err: 'no flag' };
    const ring = cc._rallyFlag.list.find(o => o.type === 'Arc' && o.fillAlpha === 0);
    if (!ring) return { err: 'no ring child', list: cc._rallyFlag.list.map(o => o.type) };
    const s0 = ring.scale;
    return new Promise(res => setTimeout(() => res({ ok: ring.scale > s0 || ring.alpha < 0.7, s0, s1: ring.scale, a: ring.alpha }), 600));
  });
  chk('RALLY_RADAR_PULSE', radar.ok === true, radar);

  // 3. queue chips: queue a unit at CC, check chip row renders + countdown ticks
  const chips = await p.evaluate(async () => {
    const bt = window.__SCC2.scene.getScene('Battle');
    const h = window.__SCC2.scene.getScene('Hud');
    const cc = bt.buildings.find(bl => bl.team === 0 && bl.def.primary && !bl.dead);
    if (!cc) return { err: 'no CC' };
    // queue directly (bypass HUD funds path)
    const def = { buildTime: 6 };
    cc.queue.push({ kind: 'marine', remaining: 6, total: 6 });
    bt.selectBuilding(cc);
    await new Promise(r => setTimeout(r, 300));
    const row = h.queueChipRow;
    const n = row ? row.list.length : 0;
    if (!row || n === 0) return { err: 'no chips', n };
    const t0 = row.list.find(o => o.type === 'Text');
    const pct0 = t0 ? t0.text : null;
    await new Promise(r => setTimeout(r, 1200));
    h.refresh();
    const pct1 = t0 && t0.active ? t0.text : null;
    const down = pct0 && pct1 ? (parseInt(pct1) < parseInt(pct0)) : false;
    return { ok: n >= 2 && /%$/.test(pct0 || '') && down, n, pct0, pct1 };
  });
  chk('QUEUE_CHIPS_COUNTDOWN', chips.ok === true, chips);

  // 4. chip cleanup on card clear
  const cleanup = await p.evaluate(() => {
    const h = window.__SCC2.scene.getScene('Hud');
    h.clearButtons();
    return { ok: h.queueChipRow.list.length === 0, n: h.queueChipRow.list.length };
  });
  chk('QUEUE_CHIP_CLEAR', cleanup.ok === true, cleanup);

  // 5. attack trail: real attackMoveMode + pointer swipes -> hot-tinted sprites
  const trail = await p.evaluate(async () => {
    const bt = window.__SCC2.scene.getScene('Battle');
    const h = window.__SCC2.scene.getScene('Hud');
    bt.attackMoveMode = true;
    for (const sp of (h._trail || [])) if (sp.active) sp.destroy();
    h._trail = [];
    h._trailHead = null; h._trailLast = 0;
    return { ok: true };
  });
  // real pointer moves: swipes over the battlefield
  await p.mouse.move(600, 400);
  await p.waitForTimeout(120);
  await p.mouse.move(640, 420);
  await p.waitForTimeout(120);
  await p.mouse.move(700, 430);
  await p.waitForTimeout(120);
  await p.mouse.move(760, 445);
  const trail2 = await p.evaluate(() => {
    const h = window.__SCC2.scene.getScene('Hud');
    const hot = (h._trail || []).filter(sp => sp.tintTopLeft === 0xff5c5c);
    return { ok: hot.length >= 1, trail: (h._trail || []).length, hot: hot.length };
  });
  chk('ATTACK_TRAIL_HOT', trail.ok === true && trail2.ok === true, trail2);

  await p.screenshot({ path: shot });
  console.log(out.map(o => JSON.stringify(o)).join('\n'));
  const fails = out.filter(o => !o.ok);
  const errFails = errs.filter(e => !/favicon|cursor|AudioContext/i.test(e));
  if (fails.length || errFails.length) { console.log('GATE-V255 FAIL', JSON.stringify({ fails: fails.map(f => f.id), errs: errFails.slice(0, 3) })); await b.close(); process.exit(1); }
  console.log('GATE-V255 PASS ' + out.length + '/' + out.length);
  await b.close();
})().catch(e => { console.error('FATAL', String(e).slice(0,300)); process.exit(2); });
