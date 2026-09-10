// v2.45 slice A gate: bigger map, mountains + chokes, scattered hidden resources, minimap leak fix
const path = require('path');
const fs = require('fs');
const pwPath = require('child_process').execSync('npm root -g').toString().trim();
const { chromium } = require(path.join(pwPath, 'playwright'));
(async () => {
  const url = process.env.SCC_URL || 'http://127.0.0.1:4177/scc/';
  const shot = process.env.SHOT || '/tmp/v245a_battle.png';
  const errs = [];
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  p.on('pageerror', e => errs.push(String(e)));
  p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await p.goto(url, { waitUntil: 'networkidle' });
  await p.evaluate(() => localStorage.setItem('starfront.cutseen.v1', '1'));
  await p.goto(url, { waitUntil: 'networkidle' });
  await p.waitForTimeout(2000);
  const st = await p.evaluate(async () => {
    const game = window.__SCC2;
    if (!game) return { err: 'no game' };
    const sm = game.scene;
    for (const s of sm.getScenes(true)) sm.stop(s.scene.key);
    await new Promise(r => setTimeout(r, 500));
    const t0 = performance.now();
    sm.start('Battle', { race: 'terran', enemyRace: 'skarn', difficulty: 'normal' });
    await new Promise(r => setTimeout(r, 6000));
    const bs = sm.getScene('Battle');
    const out = {};
    out.bootMs = Math.round(performance.now() - t0);
    // map enlarged
    out.mapBig = bs.nav.w === 160 && bs.nav.h === 160;
    // mountains exist and are solid
    let solidCount = 0;
    for (let i = 0; i < bs.nav.solid.length; i++) if (bs.nav.solid[i]) solidCount++;
    out.solidCount = solidCount;
    out.mountains = (bs.mountains || []).length;
    // connectivity HQ A to HQ B flood fill
    const W = bs.nav.w, H = bs.nav.h;
    const ax = Math.floor(W * 0.12), ay = Math.floor(H * 0.12), bx = Math.floor(W * 0.88), by = Math.floor(H * 0.88);
    const seen = new Uint8Array(W * H);
    const q = [ax + ay * W]; seen[q[0]] = 1;
    let reach = false;
    while (q.length) {
      const i = q.pop();
      const x = i % W, y = (i / W) | 0;
      if (Math.abs(x - bx) <= 4 && Math.abs(y - by) <= 4) { reach = true; break; }
      for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 1 || ny < 1 || nx >= W - 1 || ny >= H - 1) continue;
        const ni = nx + ny * W;
        if (seen[ni] || bs.nav.solid[ni]) continue;
        seen[ni] = 1; q.push(ni);
      }
    }
    out.connected = reach;
    // resources scattered: mineral patches span wide
    const xs = bs.minerals.map(m => m.x), ys = bs.minerals.map(m => m.y);
    out.mineralSpreadX = (Math.max(...xs) - Math.min(...xs)) / (W * 16);
    out.mineralCount = bs.minerals.length;
    out.geyserCount = bs.geysers.length;
    // no resource on solid tile
    out.resOnSolid = [...bs.minerals, ...bs.geysers].some(r => bs.nav.solid[bs.nav.idx(Math.floor(r.x / 16), Math.floor(r.y / 16))]);
    // spawn clear: HQ spot walkable
    out.hqWalkable = !bs.nav.solid[bs.nav.idx(ax, ay)];
    return out;
  });
  const du = await p.evaluate(() => new Promise(r => window.__SCC2.renderer.snapshot(img => r(img.src))));
  fs.writeFileSync(shot, Buffer.from(du.split(',')[1], 'base64'));
  const results = [
    ['map 160x160', st.mapBig],
    ['mountains painted', (st.mountains || 0) > 800],
    ['HQs connected', st.connected],
    ['minerals scattered (>70% width)', (st.mineralSpreadX || 0) > 0.7],
    ['mineral fields >= 12 patches', (st.mineralCount || 0) >= 88],
    ['geysers >= 4', (st.geysers || st.geyserCount || 0) >= 4],
    ['no resources on mountains', st.resOnSolid === false],
    ['HQ spawn walkable', st.hqWalkable],
    ['0 page errors', errs.length === 0],
  ];
  let pass = 0;
  for (const [n, ok] of results) { console.log(ok ? 'PASS' : 'FAIL', n); if (ok) pass++; }
  console.log(`${pass}/${results.length}`, JSON.stringify(st).slice(0, 400));
  if (errs.length) console.log('ERRORS:', errs.slice(0, 4));
  await b.close();
  process.exit(pass === results.length ? 0 : 1);
})().catch(e => { console.log('E', String(e).slice(0, 300)); process.exit(1); });
