// gate-v241-graphics.cjs — v2.41 graphics gate
const path = require('path');
const pwPath = require('child_process').execSync('npm root -g').toString().trim();
const { chromium } = require(path.join(pwPath, 'playwright'));
(async () => {
  const url = process.env.SCC_URL || 'http://127.0.0.1:4177/scc/';
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
    sm.start('Battle', { race: 'terran', enemyRace: 'skarn', difficulty: 'normal' });
    await new Promise(r => setTimeout(r, 9000));
    const bs = sm.getScene('Battle');
    const keys = bs.textures.getTextureKeys();
    const base = bs.buildings.find(bb => bb.team === 0 && bb.def.primary);
    if (base) bs.stampBlightAi(0, base.x, base.y);
    await new Promise(r => setTimeout(r, 800));
    const units = [];
    for (const u of (bs.units || [])) if (!u.dead && u.team === 0 && u.def.size !== 'huge') { units.push(u); if (units.length >= 3) break; }
    for (const u of units) bs.addToSelection(u);
    return {
      moss2: keys.includes('ai-ground_moss2'),
      rust: keys.includes('ai-ground_rust'),
      chrome: keys.includes('ai-hud_chrome'),
      fogMist: keys.includes('ai-fog_mist'),
      forge: (bs._forgeLights || []).length,
      deco: (bs._decoImgs || []).length,
      units: (bs.units || []).length,
      ring: units[0] && units[0]._ring ? units[0]._ring.strokeWidth : 0,
    };
  });
  await p.screenshot({ path: '/tmp/v241_battle.png' });
  console.log(JSON.stringify({ ...st, errors: errs.slice(0, 6) }));
  const ok = !st.err && errs.length === 0 && st.moss2 && st.rust && st.chrome && st.fogMist && st.deco > 0;
  console.log(ok ? 'PASS' : 'FAIL');
  await b.close();
  process.exit(ok ? 0 : 1);
})();
