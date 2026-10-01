// DEF-MOVE-1 SMOOTH-MOVE GATE: real right-click group move must PRODUCE TRAVEL.
// Guards the user-reported "6 soldiers jittered and did not move" class:
//  scenario N (rally-pocket cluster, walkable): all 6 marines travel >= 60px,
//    tortuosity path/net <= 2.0, order resolves (final state !== 'move').
//  scenario J (--jam, cluster inside CC footprint / solid tiles): no unit may
//    stay locked in a 'move' state (dead-flow freeze) — must fall back to A*
//    or resolve to idle within the trace window.
// Requires the QA server. Usage:
//   SCC_URL=http://127.0.0.1:4177/scc/ NODE_PATH=$(npm root -g) node scripts/verify-smooth-move.cjs
const path = require('path');
const { execSync } = require('child_process');
const pwPath = execSync('npm root -g').toString().trim();
const { chromium } = require(path.join(pwPath, 'playwright'));
const URL = process.env.SCC_URL || 'http://127.0.0.1:4177/scc/';
let fails = [];

async function scenario(page, jam) {
  const tag = jam ? 'J' : 'N';
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
    const vw = b.cameras.main.worldView;
    let base = null;
    for (let cy = Math.floor(vw.y / TILE) + 4; cy < Math.floor((vw.y + vw.height) / TILE) - 4 && !base; cy++)
      for (let cx = Math.floor(vw.x / TILE) + 5; cx < Math.floor((vw.x + vw.width) / TILE) - 16 && !base; cx++) {
        let okp = true;
        for (let dx = -6; dx <= 15 && okp; dx++) for (let dy = -4; dy <= 4; dy++) if (!walk(cx + dx, cy + dy)) { okp = false; break; }
        if (okp) base = { cx, cy };
      }
    if (!base) return { err: 'no open area' };
    const mcv = b.spawnUnit(0, 'mcv', base.cx * TILE + 8, base.cy * TILE + 8, { arriveReady: true });
    if (!b.deployMCV(mcv, true)) return { err: 'deploy failed' };
    const cc = b.buildings.find(x => x.team === 0 && x.def && x.def.primary);
    if (!cc) return { err: 'no CC' };
    const hw = (cc.def.w * TILE) / 2, hh = (cc.def.h * TILE) / 2;
    const spots = jam
      ? [[0, 0], [8, 0], [-8, 0], [0, 8], [8, 8], [-8, -8]]
      : [[hw + 6, -hh + 4], [hw + 14, -hh + 10], [hw + 22, -hh + 4], [hw + 6, -hh + 12], [hw + 14, -hh + 2], [hw + 22, -hh + 12]];
    for (const [dx, dy] of spots) b.spawnUnit(0, 'marine', cc.x + dx, cc.y + dy, { arriveReady: true });
    if (b.units.filter(u => u.kind === 'marine' && u.team === 0).length < 6) return { err: 'spawn fail' };
    b.edgePan = false;
    return { ok: true };
  }, jam);
  if (setup.err) return { err: setup.err };
  await page.waitForTimeout(1200);

  const pick = await page.evaluate(() => {
    const b = window.__SCC2.scene.getScene('Battle');
    const TILE = 16;
    const walk = (tx, ty) => b.nav.walkable(tx, ty, 0, -1);
    const marines = b.units.filter(u => u.kind === 'marine' && u.team === 0 && !u.dead);
    const c = marines.reduce((a, u) => ({ x: a.x + u.x / marines.length, y: a.y + u.y / marines.length }), { x: 0, y: 0 });
    let wp = null;
    outer:
    for (let d = 10; d >= 6; d--) for (let dx = -2; dx <= 2; dx++) {
      const tx = Math.floor(c.x / TILE) + dx, ty = Math.floor(c.y / TILE) + d;
      if (walk(tx, ty) && walk(tx, ty - 1)) { wp = { x: tx * TILE + 8, y: ty * TILE + 8 }; break outer; }
    }
    if (!wp) return { err: 'no wp' };
    b.__wp = wp;
    b.clearSelection();
    b.selectedBuilding = null;
    for (const u of marines) b.addToSelection(u);
    const cam = b.cameras.main;
    const toScreen = (x, y) => ({ x: Math.round((x - cam.worldView.x) * cam.zoom), y: Math.round((y - cam.worldView.y) * cam.zoom) });
    return { selN: b.selection.size, blob: toScreen(c.x, c.y), wps: toScreen(wp.x, wp.y) };
  });
  if (pick.err || pick.wps.x < 15 || pick.wps.x > 1060 || pick.wps.y > 690 || pick.wps.y < 15) return { err: 'geometry: ' + JSON.stringify(pick) };

  // real right-click at the target (press+release, Phaser pointer chain)
  await page.mouse.move(pick.wps.x, pick.wps.y);
  await page.waitForTimeout(120);
  await page.mouse.down({ button: 'right' });
  await page.waitForTimeout(140);
  await page.mouse.up({ button: 'right' });
  await page.waitForTimeout(120);

  const trace = await page.evaluate(async () => {
    const b = window.__SCC2.scene.getScene('Battle');
    const snap = () => b.units.filter(u => u.kind === 'marine' && u.team === 0 && !u.dead).map(u => [u.x, u.y, u.state, !!u.flowField, u.order ? u.order.type : '-']);
    const first = snap();
    const frames = [];
    for (let i = 0; i < 90; i++) { frames.push(snap()); await new Promise(r => setTimeout(r, 100)); }
    return { first, frames, selN: b.selection.size, orderAtStart: first[0] ? first[0][4] : '?' };
  });

  const F = trace.frames;
  const n = trace.first.length;
  if (process.env.DUMP) {
    for (const uu of [0, 1, 4]) console.log(`PATH ${tag} u${uu}: ` + F.map(fr => `${Math.round(fr[uu][0])},${Math.round(fr[uu][1])}`).join(' '));
  }
  const units = [];
  for (let u = 0; u < n; u++) {
    const p0 = trace.first[u], p1 = F[F.length - 1][u];
    const net = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
    let path = 0, last = p0;
    for (let f = 1; f < F.length; f++) { path += Math.hypot(F[f][u][0] - last[0], F[f][u][1] - last[1]); last = F[f][u]; }
    units.push({ net: Math.round(net * 10) / 10, path: Math.round(path * 10) / 10, st: p1[2] });
  }
  return { units, trace };
}

(async () => {
  const browser = await chromium.launch({ headless: false, args: ['--use-gl=angle', '--enable-gpu'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('pageerror', e => fails.push('PAGEERROR ' + String(e).slice(0, 120)));

  // scenario N: rally-pocket cluster on walkable ground — must TRAVEL
  let r = await scenario(page, false);
  if (r.err) fails.push('N setup: ' + r.err);
  else {
    for (let i = 0; i < r.units.length; i++) {
      const u = r.units[i];
      if (u.net < 60) fails.push(`N u${i} travel ${u.net}px < 60 (path ${u.path})`);
      else if (u.path / u.net > 2.0) fails.push(`N u${i} tortuosity ${(u.path / u.net).toFixed(2)} > 2.0`);
    }
    const stuck = r.units.filter(u => u.st === 'move').length;
    if (stuck) fails.push(`N ${stuck} unit(s) still locked in 'move' after 9s`);
  }
  console.log('N orderAtStart=' + r.orderAtStart + ' units=' + JSON.stringify(r.units && r.units.map(u => `${u.net}/${u.st}`)));

  // scenario J: cluster inside the CC footprint (solid tiles) — must NOT freeze
  r = await scenario(page, true);
  if (r.err) fails.push('J setup: ' + r.err);
  else {
    const stuck = r.units.filter(u => u.st === 'move').length;
    if (stuck) fails.push(`J ${stuck} unit(s) locked in dead-flow 'move' (freeze regression)`);
  }
  console.log('J orderAtStart=' + r.orderAtStart + ' units=' + JSON.stringify(r.units && r.units.map(u => `${u.net}/${u.st}`)));

  await browser.close();
  if (fails.length === 0) { console.log('SMOOTH-MOVE PASS 2/2'); process.exit(0); }
  console.log('SMOOTH-MOVE FAIL: ' + fails.join(' | '));
  process.exit(1);
})().catch(e => { console.error('SMOOTH-MOVE ERROR ' + String(e).slice(0, 300)); process.exit(1); });