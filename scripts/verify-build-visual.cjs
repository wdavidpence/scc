// v2.69.2 FINAL gate: base render must be readable.
// No camera manipulation (default view already frames the worker/base area;
// scripted pans fight the tutorial camera and drift off-map). Tests:
//  T1 __MISSING == 0
//  T2 CC uses b-commandCenter pseudo-3D texture
//  T3 no lightLayer glow > 0.45 alpha near base
//  T4 glow offsets stable (drift fix)
//  T5 CC sprite visible
const path = require('path');
const { execSync } = require('child_process');
const pwPath = execSync('npm root -g').toString().trim();
const { chromium } = require(path.join(pwPath, 'playwright'));
const URL = process.env.SCC_URL || 'http://127.0.0.1:4177/scc/';
let fails = 0;
const ok = (n, c, d) => { console.log((c ? 'ok ' : 'FAIL ') + n + (d ? ' — ' + d : '')); if (!c) fails++; };
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  await p.mouse.move(720, 450);
  await p.goto(URL, { waitUntil: 'networkidle' });
  await p.waitForTimeout(1500);
  const r = await p.evaluate(async () => {
    const sm = window.__SCC2.scene;
    sm.start('Battle', { race: 'terran', enemyRace: 'skarn' });
    await new Promise(r => setTimeout(r, 2500));
    const bt = sm.getScene('Battle');
    bt.tut = null;
    const mcv = bt.units.find(u => u.def.mcv && u.team === 0 && !u.dead);
    bt.deployMCV(mcv, true);
    await new Promise(r => setTimeout(r, 1500));
    const cc = bt.buildings.find(b2 => b2.team === 0 && b2.def.primary);
    if (cc) { cc.constructionProgress = 1; cc.built = true; if (cc.refreshBuilt) cc.refreshBuilt(); }
    await new Promise(r => setTimeout(r, 6000));
    const out = { have: !!cc };
    if (!cc) return out;
    let glowMax = 0, driftOk = true;
    if (bt.lightLayer) for (const ch of bt.lightLayer.list) {
      if (!ch.active) continue;
      if (ch.alpha > glowMax) glowMax = ch.alpha;
      if (ch._ox !== undefined) {
        const b0 = bt.buildings.find(bd => bd._bglows && bd._bglows.includes(ch));
        if (b0 && Math.abs(ch.x - (b0.x + ch._ox)) > 14) driftOk = false;
      }
    }
    out.glowMax = +glowMax.toFixed(2); out.driftOk = driftOk;
    let miss = 0, tot = 0;
    bt.children.list.forEach(o => {
      if (o.visible && o.texture && o.texture.key === '__MISSING') miss++;
      if (o.visible && (o.type === 'Sprite' || o.type === 'Image')) tot++;
    });
    out.miss = miss; out.tot = tot;
    out.ccTex = cc.sprite.texture.key;
    out.ccVis = cc.sprite.visible && cc.sprite.alpha;
    return out;
  });
  console.log('probe:', JSON.stringify(r));
  await p.screenshot({ path: '/tmp/bld3d-default.png' });
  ok('T1 no __MISSING', r.miss === 0, r.miss + '/' + r.tot);
  ok('T2 CC pseudo-3D tex', r.ccTex === 'b-commandCenter-t0', r.ccTex);
  ok('T3 glow max <= 0.35', r.glowMax <= 0.35, 'max ' + r.glowMax);
  ok('T4 glow offsets stable', r.driftOk);
  ok('T5 CC sprite visible', r.ccVis > 0.9);
  console.log(fails ? 'BUILD-VISUAL FAIL ' + fails : 'BUILD-VISUAL PASS 5/5');
  await b.close();
  process.exit(fails ? 1 : 0);
})();
