// v2.39 gate: deep AI kit re-skins units/buildings/fx in live battle
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
  await p.evaluate(() => {}).catch(() => {});
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
    await new Promise(r => setTimeout(r, 4000));
    const bs = sm.getScene('Battle');
    const names = bs.textures.getTextureKeys();
    return {
      srcU: names.filter(k => k.startsWith('au-src-')).length,
      srcB: names.filter(k => k.startsWith('ab-src-')).length,
      aiU: names.filter(k => /^u-.+-t\d$/.test(k)).length,
      aiB: names.filter(k => /^b-.+-t\d$/.test(k)).length,
      fx: names.filter(k => ['explosion', 'inferno', 'rubble', 'crater', 'smoke'].includes(k)).length,
      baked: bs._aiBaked || 0,
      units: bs.units ? bs.units.length : 0,
    };
  });
  console.log('state', JSON.stringify(st));
  const fails = [];
  const ck = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails.push(m); };
  ck(!st.err, 'battle started');
  ck(st.srcU >= 25, 'AI unit sources preloaded :: ' + st.srcU);
  ck(st.srcB >= 30, 'AI building sources preloaded :: ' + st.srcB);
  ck(st.aiU >= 60, 'baked team-tinted unit keys :: ' + st.aiU);
  ck(st.aiB >= 90, 'baked team-tinted building keys :: ' + st.aiB);
  ck(st.fx >= 4, 'AI fx keys baked :: ' + st.fx);
  // sample a player unit sprite: is it showing an AI-baked texture (canvas), non-blank?
  const spr = await p.evaluate(() => {
    const bs = window.__SCC2.scene.getScene('Battle');
    const q = Array.isArray(bs.units) ? bs.units : (bs.units.getChildren ? bs.units.getChildren() : []);
    const mine = q.filter(u => u.sprite && /^u-/.test(u.sprite.texture.key));
    if (!mine.length) return { err: 'no unit sprites' };
    const tex = mine[0].sprite.texture;
    const c = document.createElement('canvas'); c.width = tex.getSourceImage().width; c.height = tex.getSourceImage().height;
    const x = c.getContext('2d'); x.drawImage(tex.getSourceImage(), 0, 0);
    const d = x.getImageData(0, 0, c.width, c.height).data;
    let on = 0, tint = 0;
    for (let i = 3; i < d.length; i += 4) if (d[i] > 60) { on++; if (d[i + 2] > d[i] + 20) tint++; }
    return { tex: tex.key, w: c.width, h: c.height, opaque: on, blueish: tint };
  });
  console.log('unit0', JSON.stringify(spr));
  ck(spr.opaque > 100 && /-t0/.test(spr.tex || ''), 'unit sprite uses AI team texture :: ' + spr.tex + ' px=' + spr.opaque);
  await p.screenshot({ path: '/tmp/v239_deep.png' });
  const errClean = errs.length === 0;
  ck(errClean, 'zero page errors :: ' + errs.slice(0, 2).join(';').slice(0, 160));
  await b.close();
  console.log(fails.length ? 'GATE FAIL ' + fails.length : 'GATE PASS 8/8');
  process.exit(fails.length ? 1 : 0);
})();
