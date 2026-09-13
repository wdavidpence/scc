// v2.64 PORTRAIT HOVER POP gate (5):
// HITZones census / pointerover pop scale>1.9 / ring+nameplate live /
// pointerout restores 1.6 + ring dead / reselect rebuild no orphans.
const path = require('path');
const { execSync } = require('child_process');
const pwPath = execSync('npm root -g').toString().trim();
const { chromium } = require(path.join(pwPath, 'playwright'));
(async () => {
  const url = process.env.SCC_URL || 'http://127.0.0.1:4177/scc/';
  const errs = [];
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  p.on('pageerror', e => errs.push(String(e)));
  await p.goto(url, { waitUntil: 'networkidle' });
  await p.evaluate(() => localStorage.setItem('starfront.cutseen.v1', '1'));
  await p.goto(url, { waitUntil: 'networkidle' });
  await p.waitForTimeout(2500);
  await p.evaluate(async () => {
    const sm = window.__SCC2.scene;
    for (const s of sm.getScenes(true)) sm.stop(s.scene.key);
    await new Promise(r => setTimeout(r, 400));
    sm.start('Battle', { race: 'terran', enemyRace: 'skarn' });
    await new Promise(r => setTimeout(r, 5000));
  });
  // seed 2 marines, select them so drawPortraits runs
  const seeded = await p.evaluate(() => {
    const bt = window.__SCC2.scene.getScene('Battle');
    const h = window.__SCC2.scene.getScene('Hud');
    const u1 = bt.spawnUnit(0, 'marine', 200, 200, { arriveReady: true });
    const u2 = bt.spawnUnit(0, 'marine', 230, 200, { arriveReady: true });
    if (!u1 || !u2) return false;
    bt.selection.clear(); bt.selection.add(u1); bt.selection.add(u2);
    h.onSelection({ units: [u1, u2], count: 2 });
    return true;
  });
  if (!seeded) { console.log('FAIL SEED'); process.exit(1); }
  await p.waitForTimeout(600);
  const R = [];
  const ck = (id, ok, info) => { R.push({ id, ok }); console.log((ok ? 'PASS ' : 'FAIL ') + id, JSON.stringify(info || {})); };
  // 1 HITZ census: bust count == hitzones, bust[0] live sprite exists
  const census = await p.evaluate(() => {
    const h = window.__SCC2.scene.getScene('Hud');
    const busts = h._busts || [];
    return { n: busts.length, hz: busts.filter(e => e.hz && e.hz.active).length, sp: busts.filter(e => e.sp && e.sp.active).length, y0: h._selY0 };
  });
  ck('HITZ_CENSUS', census.n === 2 && census.hz === 2 && census.sp === 2, census);
  // 2 hover bust 0 center -> scale pop past 1.6 toward 2.1 (swiftshader tween stretch: poll)
  const hx = 12 + 18, hy = census.y0 + 10;
  await p.mouse.move(hx - 3, hy); await p.waitForTimeout(120);
  await p.mouse.move(hx, hy);
  let pop = 0;
  for (let t = 0; t < 16; t++) {
    pop = await p.evaluate(() => { const h = window.__SCC2.scene.getScene('Hud'); const s = h._busts && h._busts[0] && h._busts[0].sp; return s ? +s.scale.toFixed(2) : 0; });
    if (pop > 1.9) break;
    await p.waitForTimeout(250);
  }
  ck('HOVER_POP', pop > 1.9, { scale: pop });
  // 3 ring + nameplate live while hovered
  const hov = await p.evaluate(() => {
    const h = window.__SCC2.scene.getScene('Hud');
    const s = h._busts && h._busts[0] && h._busts[0].sp;
    return { ring: !!(s && s._porRing && s._porRing.active), name: !!(h._porName && h._porName.active && h._porName.alpha > 0.5), txt: h._porName ? h._porName.text : '' };
  });
  ck('RING_NAMEPLATE', hov.ring && hov.name, hov);
  // 4 pointerout restores base scale + ring destroyed
  await p.mouse.move(hx, hy + 80); await p.waitForTimeout(150);
  await p.mouse.move(hx + 1, hy + 80);
  let rest = 0, ringDead = false;
  for (let t = 0; t < 16; t++) {
    const r = await p.evaluate(() => { const h = window.__SCC2.scene.getScene('Hud'); const s = h._busts && h._busts[0] && h._busts[0].sp; return { sc: s ? +s.scale.toFixed(2) : 0, ring: !!(s && s._porRing && s._porRing.active) }; });
    rest = r.sc; ringDead = !r.ring;
    if (rest < 1.7 && ringDead) break;
    await p.waitForTimeout(250);
  }
  ck('OUT_RESTORE', rest <= 1.7 && ringDead, { scale: rest, ringDead });
  // 5 reselect rebuild: old busts/zones gone, exactly 2 live zones, no page errors
  await p.evaluate(() => {
    const bt = window.__SCC2.scene.getScene('Battle');
    const h = window.__SCC2.scene.getScene('Hud');
    const u = bt.spawnUnit(0, 'incinerator', 260, 200, { arriveReady: true });
    bt.selection.clear(); bt.selection.add(u);
    h.onSelection({ units: [u], count: 1 });
  });
  await p.waitForTimeout(600);
  const rebuild = await p.evaluate(() => {
    const h = window.__SCC2.scene.getScene('Hud');
    const busts = h._busts || [];
    let orphanHZ = 0;
    for (const c of h.children.list) if (c._porHz && c.active) orphanHZ++;
    return { n: busts.length, liveHZ: orphanHZ, spAlive: busts.filter(e => e.sp && e.sp.active).length };
  });
  ck('REBUILD_CLEAN', rebuild.n === 1 && rebuild.liveHZ === 1 && rebuild.spAlive === 1 && errs.length === 0, { ...rebuild, errs: errs.length });
  const pass = R.filter(r => r.ok).length;
  console.log(`GATE-V264 ${pass}/${R.length} ${pass === R.length ? 'PASS' : 'FAIL'}`);
  await p.screenshot({ path: '/tmp/v264-hover.png' });
  await b.close();
  process.exit(pass === R.length ? 0 : 1);
})().catch(e => { console.log('E', String(e).slice(0, 300)); process.exit(1); });
