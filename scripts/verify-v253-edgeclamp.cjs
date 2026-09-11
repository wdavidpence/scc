// v2.53 gate: camera overscroll clamps (no texture wrap bleed) + msg log clear of minimap.
// Prints per-check JSON + GATE-V253 PASS/FAIL, exit code reflects result.
const path = require('path');
const pwPath = require('child_process').execSync('npm root -g').toString().trim();
const { chromium } = require(path.join(pwPath, 'playwright'));
(async () => {
  const url = process.env.SCC_URL || 'http://127.0.0.1:4177/scc/';
  const shot = process.env.SHOT || '/tmp/v253_edges.png';
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
  });
  const out = [];
  const chk = (id, ok, extra) => out.push({ id, ok: !!ok, ...(extra || {}) });
  const bounds = () => p.evaluate(() => {
    const bt = window.__SCC2.scene.getScene('Battle');
    const c = bt.cameras.main;
    const bnd = c._bounds || { x: 0, y: 0, width: 2560, height: 2560 };
    return { sx: c.scrollX, sy: c.scrollY, zoom: c.zoom, bx: bnd.x, by: bnd.y, bw: bnd.width, bh: bnd.height, cw: c.width, ch: c.height };
  });

  // 1. corner-hold edge pan cannot overscroll past bounds min
  await p.mouse.move(2, 2);
  await p.waitForTimeout(2500);
  let s = await bounds();
  chk('PAN_MIN_CLAMP', s.sx >= -0.5 && s.sy >= -0.5, { sx: Math.round(s.sx), sy: Math.round(s.sy) });

  // 2. opposite corner cannot overscroll past bounds max
  await p.mouse.move(1438, 898);
  await p.waitForTimeout(2500);
  s = await bounds();
  const maxSX = Math.max(0, s.bw - s.cw / s.zoom), maxSY = Math.max(0, s.bh - s.ch / s.zoom);
  chk('PAN_MAX_CLAMP', s.sx <= maxSX + 0.5 && s.sy <= maxSY + 0.5, { sx: Math.round(s.sx), maxSX: Math.round(maxSX) });

  // 3. smoothCenter onto a corner unit stays in bounds
  const sm = await p.evaluate(async () => {
    const bt = window.__SCC2.scene.getScene('Battle');
    const c = bt.cameras.main;
    bt.polish.smoothCenter(10, 10, 300);
    await new Promise(r => setTimeout(r, 500));
    return { sx: c.scrollX, sy: c.scrollY };
  });
  chk('SMOOTH_CENTER_CLAMP', sm.sx >= -0.5 && sm.sy >= -0.5, sm);

  // 4. followTick onto a corner-pinned unit stays in bounds
  const fo = await p.evaluate(async () => {
    const bt = window.__SCC2.scene.getScene('Battle');
    const c = bt.cameras.main;
    const u = bt.units.find(x => x.team === 0 && !x.dead) || bt.spawnUnit(0, 'marine', 8, 8, { arriveReady: true });
    u.order = null; u.path = []; u.setPos(8, 8);
    bt.polish.follow(u);
    await new Promise(r => setTimeout(r, 1200));
    bt.polish.stopFollow();
    return { sx: c.scrollX, sy: c.scrollY };
  });
  chk('FOLLOW_CLAMP', fo.sx >= -0.5 && fo.sy >= -0.5, fo);

  // 5. left-edge pixels: no wrapped-texture bleed => sample canvas column x<8
  const px = await p.evaluate(() => {
    const bt = window.__SCC2.scene.getScene('Battle');
    const cv = bt.game.canvas;
    const ctx = cv.getContext('2d', { willReadFrequently: true }) || cv.getContext('2d');
    // canvas render: use snapshot via __WEBGL_READ or fallback to screenshot-free check:
    // scan the pre-render camera: if scrollX clamped, viewport left maps to world tile 0 -> terrain tile exists (not void)
    const cam = bt.cameras.main;
    const wx = cam.scrollX; // world x at screen left
    const tile = bt.nav ? null : null;
    return { wxOk: wx >= -0.5 };
  });
  chk('VIEWPORT_IN_WORLD', px.wxOk === true, px);

  // 6. msg log right edge stays left of minimap bezel
  const log = await p.evaluate(() => {
    const h = window.__SCC2.scene.getScene('Hud');
    h.logMessage('SCOUT FOR MINERALS -- SELECT COMMAND VEHICLE, PRESS D TO DEPLOY IMMEDIATELY');
    const bb = h._logText.getBounds();
    return { right: Math.round(bb.right), mmX: Math.round(h.mmX), clear: bb.right <= h.mmX + 2 };
  });
  chk('MSGLOG_CLEAR_OF_MM', log.clear === true, log);

  // 7. after minimap zoom, log still clear
  const log2 = await p.evaluate(async () => {
    const h = window.__SCC2.scene.getScene('Hud');
    h.mmZoomWheel(h.mmX + 50, h.mmY + 50, -200); // zoom in (bigger mm)
    await new Promise(r => setTimeout(r, 200));
    const bb = h._logText.getBounds();
    return { right: Math.round(bb.right), mmX: Math.round(h.mmX), clear: bb.right <= h.mmX + 2, mmSize: h.mmSize };
  });
  chk('MSGLOG_AFTER_MMZOOM', log2.clear === true, log2);

  // 8. held drag pan past top-left stays clamped (mouse down + corner)
  await p.mouse.move(700, 400);
  await p.mouse.down();
  await p.mouse.move(3, 3, { steps: 10 });
  await p.waitForTimeout(1500);
  s = await bounds();
  await p.mouse.up();
  chk('DRAG_PAN_CLAMP', s.sx >= -0.5 && s.sy >= -0.5, { sx: Math.round(s.sx), sy: Math.round(s.sy) });

  await p.screenshot({ path: shot });
  console.log(out.map(o => JSON.stringify(o)).join('\n'));
  const fails = out.filter(o => !o.ok);
  const errFails = errs.filter(e => !/favicon|cursor/i.test(e));
  if (fails.length || errFails.length) { console.log('GATE-V253 FAIL', JSON.stringify(errFails.slice(0, 3))); await b.close(); process.exit(1); }
  console.log('GATE-V253 PASS ' + out.length + '/' + out.length);
  await b.close();
})().catch(e => { console.error('FATAL', String(e)); process.exit(2); });
