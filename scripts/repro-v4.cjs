// REPRO v4: execution-side truth. Clean selection (real addToSelection, no
// rally hijack), right-click move via real mouse, 100ms-resolution movement
// trace to expose jitter vs freeze. Usage:
//   SCC_URL=http://127.0.0.1:4177/scc/ NODE_PATH=$(npm root -g) node scripts/repro-v4.cjs [--jam]
// --jam: spawn cluster INSIDE CC footprint (solid tiles, worst case).
const { chromium } = require('playwright');
const URL = process.env.SCC_URL || 'http://127.0.0.1:4177/scc/';
const JAM = process.argv.includes('--jam');

(async () => {
  const browser = await chromium.launch({ headless: false, args: ['--use-gl=angle', '--enable-gpu'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('pageerror', e => console.log('PAGEERROR', String(e).slice(0, 200)));
  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__SCC2 && window.__SCC2.scene.isActive('Title'), null, { timeout: 30000 });
  await page.evaluate(() => {
    const sm = window.__SCC2.scene;
    for (const s of sm.getScenes(true)) { if (s.scene.key !== 'Boot' && s.scene.key !== 'Preload') sm.stop(s.scene.key); }
    sm.start('Hud', { race: 'terran' });
    sm.start('Battle', { race: 'terran', enemyRace: 'skarn', difficulty: 'easy' });
  });
  await page.waitForFunction(() => { const b = window.__SCC2.scene.getScene('Battle'); return b && b.units && b.units.length >= 1; }, null, { timeout: 30000 });
  await page.waitForTimeout(1200);

  const setup = await page.evaluate((jam) => {
    const b = window.__SCC2.scene.getScene('Battle');
    const TILE = 16;
    const walk = (tx, ty) => b.nav.walkable(tx, ty, 0, -1);
    let cc = b.buildings.find(x => x.team === 0 && x.def && x.def.primary);
    const vw = b.cameras.main.worldView;
    let base = null;
    for (let cy = Math.floor(vw.y / TILE) + 4; cy < Math.floor((vw.y + vw.height) / TILE) - 4 && !base; cy++)
      for (let cx = Math.floor(vw.x / TILE) + 5; cx < Math.floor((vw.x + vw.width) / TILE) - 16 && !base; cx++) {
        let okp = true;
        for (let dx = -6; dx <= 15 && okp; dx++) for (let dy = -4; dy <= 4; dy++) if (!walk(cx + dx, cy + dy)) { okp = false; break; }
        if (okp) base = { cx, cy };
      }
    if (!base) return { err: 'no open area' };
    const baseX = base.cx * TILE + 8, baseY = base.cy * TILE + 8;
    if (!cc) {
      const mcv = b.spawnUnit(0, 'mcv', baseX, baseY, { arriveReady: true });
      if (!b.deployMCV(mcv, true)) return { err: 'deploy failed' };
      cc = b.buildings.find(x => x.team === 0 && x.def && x.def.primary);
      if (!cc) return { err: 'no CC' };
    }
    const hw = (cc.def.w * TILE) / 2, hh = (cc.def.h * TILE) / 2;
    const spots = jam
      ? [[0, 0], [8, 0], [-8, 0], [0, 8], [8, 8], [-8, -8]] // inside footprint
      : [[hw + 6, -hh + 4], [hw + 14, -hh + 10], [hw + 22, -hh + 4], [hw + 6, -hh + 12], [hw + 14, -hh + 2], [hw + 22, -hh + 12]]; // rally pocket at NE corner
    for (const [dx, dy] of spots) b.spawnUnit(0, 'marine', cc.x + dx, cc.y + dy, { arriveReady: true });
    if (b.units.filter(u => u.kind === 'marine' && u.team === 0).length < 6) return { err: 'spawn fail' };
    b.edgePan = false;
    return { ok: true };
  }, JAM);
  if (setup.err) { console.log('SETUP_FAIL', JSON.stringify(setup)); await browser.close(); process.exit(2); }

  await page.waitForTimeout(1500); // settle

  const pick = await page.evaluate(() => {
    const b = window.__SCC2.scene.getScene('Battle');
    const TILE = 16;
    const walk = (tx, ty) => b.nav.walkable(tx, ty, 0, -1);
    const marines = b.units.filter(u => u.kind === 'marine' && u.team === 0 && !u.dead);
    const c = marines.reduce((a, u) => ({ x: a.x + u.x / marines.length, y: a.y + u.y / marines.length }), { x: 0, y: 0 });
    // move target: 10 tiles SOUTH (away from CC and enemy line), walkable
    let wp = null;
    outer:
    for (let d = 10; d >= 6; d--) for (let dx = -2; dx <= 2; dx++) {
      const tx = Math.floor(c.x / TILE) + dx, ty = Math.floor(c.y / TILE) + d;
      if (walk(tx, ty) && walk(tx, ty - 1)) { wp = { x: tx * TILE + 8, y: ty * TILE + 8 }; break outer; }
    }
    if (!wp) return { err: 'no wp' };
    b.__wp = wp;
    // CLEAN selection via the real path (clears rally state)
    b.clearSelection();
    b.selectedBuilding = null;
    for (const u of marines) b.addToSelection(u);
    const cam = b.cameras.main;
    const toScreen = (x, y) => ({ x: Math.round((x - cam.worldView.x) * cam.zoom), y: Math.round((y - cam.worldView.y) * cam.zoom) });
    const blob = toScreen(c.x, c.y);
    const wps = toScreen(wp.x, wp.y);
    return { selN: b.selection.size, sb: !!b.selectedBuilding, blob, wps, wp };
  });
  console.log('PICK=' + JSON.stringify(pick));
  if (pick.err || pick.blob.x < 15 || pick.blob.y < 15 || pick.wps.x < 15 || pick.wps.x > 1060 || pick.wps.y > 690) { console.log('GEOM_FAIL'); await page.screenshot({ path: '/tmp/repro-v4-fail.png' }); await browser.close(); process.exit(2); }

  // real drag-select (kept for fidelity; --nodrag skips to isolate exec)
  if (!process.argv.includes('--nodrag')) {
    await page.mouse.move(pick.blob.x - 30, pick.blob.y - 24);
    await page.mouse.down();
    await page.waitForTimeout(140);
    await page.mouse.move(pick.blob.x + 30, pick.blob.y + 24, { steps: 4 });
    await page.waitForTimeout(140);
    await page.mouse.up();
    await page.waitForTimeout(250);
    console.log('DRAG_SEL=' + await page.evaluate(() => window.__SCC2.scene.getScene('Battle').selection.size));
  }

  // real right-click move order
  await page.mouse.move(pick.wps.x, pick.wps.y);
  await page.waitForTimeout(120);
  await page.mouse.down({ button: 'right' });
  await page.waitForTimeout(140);
  await page.mouse.up({ button: 'right' });
  await page.waitForTimeout(120);

  // 100ms-resolution trace, 6 s: positions + flow/order state
  const trace = await page.evaluate(async () => {
    const b = window.__SCC2.scene.getScene('Battle');
    const snap = () => b.units.filter(u => u.kind === 'marine' && u.team === 0 && !u.dead).map(u => [Math.round(u.x * 10) / 10, Math.round(u.y * 10) / 10, u.state, u.flowField ? 1 : 0, u.moving ? 1 : 0, u.order ? u.order.type : '-']);
    const out = { first: snap() };
    await new Promise(r => setTimeout(r, 300));
    const frames = [];
    for (let i = 0; i < 60; i++) { frames.push(snap()); await new Promise(r => setTimeout(r, 100)); }
    out.frames = frames;
    out.last = snap();
    out.tick0 = b.__t0; out.tick = b.simTickIndex;
    return out;
  });
  // jitter analysis: per unit, net displacement vs summed step distance (tortuosity)
  const first = trace.first, last = trace.last, F = trace.frames;
  const lines = [];
  for (let u = 0; u < first.length; u++) {
    const p0 = [first[u][0], first[u][1]], p1 = [last[u][0], last[u][1]];
    const net = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
    let path = 0, flips = 0, lastdx = 0, lastdy = 0;
    for (let f = 1; f < F.length; f++) {
      const dx = F[f][u][0] - F[f - 1][u][0], dy = F[f][u][1] - F[f - 1][u][1];
      const d = Math.hypot(dx, dy);
      path += d;
      if (d > 0.3 && lastdx + dx < -0.001 && Math.abs(lastdx) + Math.abs(dx) > 0.4) flips++;
      if (Math.abs(dx) > 0.05) lastdx = dx;
      if (Math.abs(dy) > 0.05) lastdy = dy;
    }
    lines.push(`u${u} net=${net.toFixed(1)} path=${path.toFixed(1)} flips=${flips} ${last[u][2]}/${last[u][3] ? 'F' : '-'}/${last[u][4] ? 'M' : 'S'} ${last[u][5]}`);
  }
  console.log('TRACE t0->t=' + JSON.stringify({ first: first.map(f => f.slice(0, 2)) }));
  for (const uu of [1, 4]) {
    console.log(`PATH u${uu}: ` + F.map(fr => `${fr[uu][0]},${fr[uu][1]}`).join(' '));
  }
  console.log('ANALYSIS:\n' + lines.join('\n'));
  await page.screenshot({ path: '/tmp/repro-v4.png' });
  await browser.close();
})().catch(e => { console.error('REPRO ERROR', String(e).slice(0, 500)); process.exit(1); });
