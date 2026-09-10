// v2.44 gate: smooth fog/intel at 4px/tile, feathered vision holes, dense shadows, tooltip/objective collision fix
const path = require('path');
const fs = require('fs');
const pwPath = require('child_process').execSync('npm root -g').toString().trim();
const { chromium } = require(path.join(pwPath, 'playwright'));
(async () => {
  const url = process.env.SCC_URL || 'http://127.0.0.1:4177/scc/';
  const shot = process.env.SHOT || '/tmp/v244_battle.png';
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
    const out = {};
    // 1. fog/intel canvas resolution MAP*4 (v2.45: 160)
    out.fogRes = bs.fogCanvas.width === bs.nav.w * 4 && bs.visCanvas.width === bs.nav.h * 4;
    // 2. fog image scale matches
    out.fogScale = Math.abs(bs.fogImg.scaleX - 16 / 4) < 0.01;
    // 3. fog unseen color is deep blue not pure black: sample center of an unseen tile block
    {
      const fx = bs.fogCtx;
      // find an unseen tile
      let px = null;
      const d = fx.getImageData(0, 0, bs.fogCanvas.width, bs.fogCanvas.height).data;
      for (let i = 0; i < bs.seen.length; i++) {
        if (!bs.seen[i]) { const tx = i % bs.nav.w, ty = (i / bs.nav.w) | 0; const o = ((ty * 4 + 2) * bs.fogCanvas.width + (tx * 4 + 2)) * 4; if (d[o + 3] > 200) { px = [d[o], d[o + 1], d[o + 2]]; break; } }
      }
      out.fogColor = px; // expect [6,10,20]
      out.fogTint = !!px && px[2] > px[0]; // blue > red = tinted, not pure black
    }
    // 4. feathered edge: along a horizontal scanline through a building vision center, count intermediate-alpha fog pixels
    {
      // v2.45 RA start: no buildings at spawn — use the player MCV as the vision source
      const b0 = bs.buildings.find(bb => bb.team === 0 && !bb.dead) || bs.units.find(u => u.team === 0 && !u.dead);
      const cx = Math.round(b0.x / 16 * 4), cy = Math.round(b0.y / 16 * 4);
      const d = bs.fogCtx.getImageData(cx, cy, 60, 1).data;
      let mid = 0;
      for (let i = 0; i < 60; i++) { const a = d[i * 4 + 3]; if (a > 10 && a < 245) mid++; }
      out.featherPx = mid; // >3 means a gradient exists, not a hard step
    }
    // 5. shadow textures denser core: sample shadow-s center alpha
    {
      const t = bs.textures.get('shadow-s').getSourceImage();
      const sx = t.getContext('2d').getImageData(10, 5, 1, 1).data;
      out.shadowCoreA = sx[3]; // >=180 target (0.75*255)
    }
    // 6. unit containers carry shadow
    const u0 = bs.units.find(u => !u.dead && u.team === 0);
    out.unitShadow = !!(u0 && u0.shadow);
    // 7. tipPos flips near top-left objectives zone
    bs._hoverTip.setText(['X'.repeat(10)]);
    const tp = bs._tipPos(60, 90);
    out.tipFlip = tp[0] > 60 || tp[1] > 90;
    return out;
  });
  const du = await p.evaluate(() => new Promise(r => window.__SCC2.renderer.snapshot(img => r(img.src))));
  fs.writeFileSync(shot, Buffer.from(du.split(',')[1], 'base64'));
  const results = [
    ['fog 4px/tile canvas', st.fogRes],
    ['fog image scale', st.fogScale],
    ['fog tinted not black', st.fogTint],
    ['feathered vision edge', (st.featherPx || 0) > 3],
    ['shadow core dense', (st.shadowCoreA || 0) >= 170],
    ['unit shadow present', st.unitShadow],
    ['tooltip flips off objectives', st.tipFlip],
    ['0 page errors', errs.length === 0],
  ];
  let pass = 0;
  for (const [name, ok] of results) { console.log(ok ? 'PASS' : 'FAIL', name); if (ok) pass++; }
  console.log(`${pass}/${results.length}`, JSON.stringify(st).slice(0, 400));
  if (errs.length) console.log('ERRORS:', errs.slice(0, 3));
  await b.close();
  process.exit(pass === results.length ? 0 : 1);
})().catch(e => { console.log('E', String(e).slice(0, 300)); process.exit(1); });
