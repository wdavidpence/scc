// v2.40 gate: AI fog mist overlay, per-team AI blight, HUD chrome + minimap terrain tint
const path = require('path');
const fs = require('fs');
const pwPath = require('child_process').execSync('npm root -g').toString().trim();
const { chromium } = require(path.join(pwPath, 'playwright'));
(async () => {
  const url = process.env.SCC_URL || 'http://127.0.0.1:4177/scc/';
  const shot = process.env.SHOT || '/tmp/v240_battle.png';
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
    await new Promise(r => setTimeout(r, 5000));
    const bs = sm.getScene('Battle');
    const hud = sm.getScene('Hud');
    const keys = bs.textures.getTextureKeys();
    // force blight on the player team so the AI blight stamps render
    const base = bs.buildings.find(bb => bb.team === 0 && bb.def.primary);
    if (base) for (let i = 0; i < 400; i++) bs.addBlight(1, base.x, base.y, 10);
    await new Promise(r => setTimeout(r, 400));
    return {
      fogMist: keys.includes('fog_mist') && !!bs.fogMistImg,
      mistAlpha: bs.fogMistImg ? bs.fogMistImg.alpha : 0,
      blightAi0: keys.includes('blight-ai-t0'),
      blightAi1: keys.includes('blight-ai-t1'),
      blightCells1: bs.blightCanvases[1].cells.reduce((a, c) => a + c, 0),
      chrome: keys.includes('ai-hud_chrome'),
      mmTerrain: !!(hud && hud.mmTerrain),
      mmChrome: !!(hud && hud.mmChrome),
    };
  });
  console.log('state', JSON.stringify(st));
  const fails = [];
  const ck = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails.push(m); };
  ck(!st.err, 'battle started');
  ck(st.fogMist, 'AI fog mist overlay active');
  ck(st.blightAi0 && st.blightAi1, 'AI blight canvases created (both teams)');
  ck(st.blightCells1 > 100, 'blight stamped on AI overlay :: ' + st.blightCells1 + ' cells');
  ck(st.chrome, 'AI HUD chrome texture loaded');
  ck(st.mmTerrain, 'minimap terrain tint present');
  ck(st.mmChrome, 'minimap chrome bezel present');
  // pixel forensics: mist layer actually paints light fog in unseen map region
  const px = await p.evaluate(() => {
    const bs = window.__SCC2.scene.getScene('Battle');
    const c = bs.mistCanvas;
    const x = c.getContext('2d', { willReadFrequently: true });
    const d = x.getImageData(0, 0, c.width, c.height).data;
    let lit = 0, tot = 0;
    for (let i = 3; i < d.length; i += 4 * 53) { tot++; if (d[i] > 40) lit++; }
    // blight AI canvas t0: painted where blight exists
    const bc = bs.blightCanvases[1].ac;
    const bx = bc.getContext('2d', { willReadFrequently: true });
    const bd = bx.getImageData(0, 0, bc.width, bc.height).data;
    let blit = 0;
    for (let i = 3; i < bd.length; i += 4 * 53) if (bd[i] > 40) blit++;
    return { mistLit: lit, mistTot: tot, blightLit: blit };
  });
  console.log('px', JSON.stringify(px));
  ck(px.mistLit > px.mistTot * 0.2, 'mist paints unseen area :: ' + px.mistLit + '/' + px.mistTot);
  ck(px.blightLit > 500, 'AI blight texture painted :: ' + px.blightLit + ' lit samples');
  await p.screenshot({ path: shot });
  const sz = fs.statSync(shot).size;
  ck(sz > 30000, 'screenshot ' + shot + ' :: ' + sz + ' bytes');
  ck(errs.length === 0, '0 page errors' + (errs.length ? ' :: ' + errs.slice(0, 3).join(' | ') : ''));
  await b.close();
  console.log(fails.length ? 'GATE FAIL ' + fails.length : 'GATE PASS');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
