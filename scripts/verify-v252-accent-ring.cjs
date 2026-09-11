// v2.52 gate: race-accent selection rings + hover glow with rank pips.
// Prints per-check JSON + GATE-V252 PASS/FAIL, exit code reflects result.
const path = require('path');
const pwPath = require('child_process').execSync('npm root -g').toString().trim();
const { chromium } = require(path.join(pwPath, 'playwright'));
(async () => {
  const url = process.env.SCC_URL || 'http://127.0.0.1:4177/scc/';
  const shot = process.env.SHOT || '/tmp/v252_accent.png';
  const errs = [];
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  p.on('pageerror', e => errs.push(String(e)));
  p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
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
    const mid = bt.cameras.main.midPoint;
    window.__u0 = bt.spawnUnit(0, 'marine', mid.x - 40, mid.y, { arriveReady: true });
    window.__u1 = bt.spawnUnit(1, 'skarling', mid.x + 40, mid.y, { arriveReady: true });
    window.__u0.kills = 12; window.__u0.level = 2;
  });
  await p.waitForTimeout(400);
  const out = [];
  const chk = (id, ok, extra) => out.push({ id, ok: !!ok, ...(extra || {}) });

  // 1. friendly selection ring uses terran accent 0x4ea1ff
  const ring = await p.evaluate(() => {
    const bt = window.__SCC2.scene.getScene('Battle');
    bt.clearSelection();
    bt.addToSelection(window.__u0);
    const c = window.__u0._ring;
    return { fill: c && c.fillColor, stroke: c && c.strokeColor };
  });
  chk('RING_TERRAN_ACCENT', ring.fill === 0x4ea1ff && ring.stroke === 0x4ea1ff, ring);

  // 2. enemy ring keeps team color (not player accent)
  const ering = await p.evaluate(() => {
    const bt = window.__SCC2.scene.getScene('Battle');
    bt.showSelRing(window.__u1);
    return { fill: window.__u1._ring && window.__u1._ring.fillColor };
  });
  chk('RING_ENEMY_TEAMCOLOR', ering.fill === 0xff8a4a, ering);

  // 3. boot race sanity (rings derive from players[0].race)
  const hot = await p.evaluate(() => {
    const bt = window.__SCC2.scene.getScene('Battle');
    return { race: bt.players[0].race };
  });
  chk('BOOT_RACE_TERRAN', hot.race === 'terran', hot);

  // 4. hover glow: friendly unit ring tinted accent
  const hov = await p.evaluate(async () => {
    const bt = window.__SCC2.scene.getScene('Battle');
    bt.polish.hoverGlow(window.__u0);
    await new Promise(r => setTimeout(r, 100));
    return { stroke: bt.polish._hoverRing && bt.polish._hoverRing.strokeColor };
  });
  chk('HOVER_ACCENT', hov.stroke === 0x4ea1ff, hov);

  // 5. rank pips appear at level 2
  const pips = await p.evaluate(() => {
    const bt = window.__SCC2.scene.getScene('Battle');
    bt.polish.hoverGlow(window.__u0);
    return { has: !!bt.polish._hoverPips };
  });
  chk('RANK_PIPS', pips.has === true, pips);

  // 6. no pips at level 0
  const nopips = await p.evaluate(() => {
    const bt = window.__SCC2.scene.getScene('Battle');
    window.__u1.level = 0;
    bt.polish.hoverGlow(window.__u1);
    return { has: !!bt.polish._hoverPips, ring: !!bt.polish._hoverRing };
  });
  chk('NO_PIPS_LV0', nopips.has === false && nopips.ring === true, nopips);

  // 7. hover tracking: move the unit, ring follows
  const track = await p.evaluate(() => {
    const bt = window.__SCC2.scene.getScene('Battle');
    bt.polish.hoverGlow(window.__u0);
    const before = { x: bt.polish._hoverRing.x, y: bt.polish._hoverRing.y };
    window.__u0.setPos(window.__u0.x + 60, window.__u0.y + 30);
    bt.polish.hoverGlow(window.__u0); // same id -> must reposition
    return { moved: Math.abs(bt.polish._hoverRing.x - before.x) >= 55 && Math.abs(bt.polish._hoverRing.y - before.y) >= 25 };
  });
  chk('HOVER_TRACKS', track.moved === true, track);

  // 8. hover clears on empty
  const clear = await p.evaluate(() => {
    const bt = window.__SCC2.scene.getScene('Battle');
    bt.polish.hoverGlow(null);
    return { ring: !!bt.polish._hoverRing, pips: !!bt.polish._hoverPips };
  });
  chk('HOVER_CLEAR', clear.ring === false && clear.pips === false, clear);

  // 9. real pointer hover path. PITFALL: cam scroll drifts between evaluates
  // (startup follow-snap), so parking coords computed earlier miss by ~300px.
  // Flip it: read the LIVE pointer world pos, snap the unit under it, then
  // jiggle the mouse to re-fire the hover handler. Deterministic.
  await p.mouse.move(700, 400, { steps: 3 });
  await p.waitForTimeout(150);
  let pointerOk = false;
  let lastDiag = null;
  for (let attempt = 0; attempt < 5 && !pointerOk; attempt++) {
    const snapped = await p.evaluate(() => {
      const bt = window.__SCC2.scene.getScene('Battle');
      const ap = bt.input.activePointer;
      window.__u0.order = null; window.__u0.path = [];
      window.__u0.setPos(ap.worldX, ap.worldY);
      return { ok: !window.__u0.dead };
    });
    if (!snapped.ok) throw new Error('test marine died mid-gate');
    await p.mouse.move(701, 400, { steps: 1 });
    await p.mouse.move(700, 400, { steps: 1 });
    await p.waitForTimeout(200);
    const r = await p.evaluate(() => {
      const bt = window.__SCC2.scene.getScene('Battle');
      const ap = bt.input.activePointer;
      return { ring: !!bt.polish._hoverRing, tip: !!(bt._hoverTip && bt._hoverTip.alpha > 0), dist: Math.round(Math.hypot(ap.worldX - window.__u0.x, ap.worldY - window.__u0.y)) };
    });
    lastDiag = r;
    pointerOk = r.ring === true && r.tip === true;
  }
  chk('POINTER_HOVER', pointerOk === true, lastDiag);

  await p.screenshot({ path: shot });
  console.log(out.map(o => JSON.stringify(o)).join('\n'));
  const fails = out.filter(o => !o.ok);
  const errFails = errs.filter(e => !/favicon|cursor/i.test(e));
  if (fails.length || errFails.length) { console.log('GATE-V252 FAIL', JSON.stringify(errFails.slice(0, 3))); await b.close(); process.exit(1); }
  console.log('GATE-V252 PASS ' + out.length + '/' + out.length);
  await b.close();
})().catch(e => { console.error('FATAL', String(e)); process.exit(2); });
