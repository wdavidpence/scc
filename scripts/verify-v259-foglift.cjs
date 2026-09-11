// v2.59 gate: lifted fog + lighter vignette + dithered scarp edges + explored shroud read-through.
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
    const bt = window.__SCC2.scene.getScene('Battle');
    if (bt.polish) bt.polish._cheap = () => true;
    // reveal a swatch of explored ground so the fog read-through is measurable
    const mid = bt.cameras.main.midPoint;
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
      const tx = Math.floor(mid.x / 16) + dx, ty = Math.floor(mid.y / 16) + dy;
      bt.seen[ty * 160 + tx] = 1;
    }
    bt.updateFog();
  });
  const out = [];
  const chk = (id, ok, extra) => { out.push({ id, ok: !!ok, ...(extra || {}) }); };

  const alphas = await p.evaluate(() => {
    const bt = window.__SCC2.scene.getScene('Battle');
    return { fog: +bt.fogImg.alpha.toFixed(2), vig: +bt.vignetteImg.alpha.toFixed(2) };
  });
  chk('FOG_LIFTED', alphas.fog <= 0.40, alphas);
  chk('VIGNETTE_LIGHT', alphas.vig <= 0.74, alphas);

  // explored ground under fog must be visibly lit (not near-black)
  const bright = await p.evaluate(() => {
    const cv = window.__SCC2.canvas;
    const off = document.createElement('canvas'); off.width = cv.width; off.height = cv.height;
    const x = off.getContext('2d'); x.drawImage(cv, 0, 0);
    const W = cv.width, H = cv.height;
    const d = x.getImageData(Math.round(W * 0.42), Math.round(H * 0.42), 240, 160).data;
    let s = 0; const n = d.length / 4;
    for (let i = 0; i < d.length; i += 4) s += 0.299 * d[i] + 0.587 * d[i+1] + 0.114 * d[i+2];
    return { avgLum: +(s / n).toFixed(1) };
  });
  chk('EXPLORED_LIT', bright.avgLum >= 38, bright);

  // plateau paint: sample terrain texture on a highland boundary column — must NOT be a solid
  // single-color band (dither => varied pixels across the scarp row)
  const scarp = await p.evaluate(() => {
    const bt = window.__SCC2.scene.getScene('Battle');
    const src = bt.textures.get('terrain').getSourceImage();
    const ctx = src.getContext ? src.getContext('2d', { willReadFrequently: true }) : null;
    if (!ctx) return { err: 'no ctx' };
    let tx = -1, ty = -1;
    for (let i = 0; i < bt.elev.length && tx < 0; i++) {
      if (!bt.elev[i]) continue;
      const x0 = i % 160, y0 = (i / 160) | 0;
      if (!bt.elev[i - 160]) { tx = x0; ty = y0; }
    }
    if (tx < 0) return { err: 'no plateau edge' };
    const d = ctx.getImageData(tx * 16, ty * 16, 16, 6).data;
    const uniq = new Set();
    for (let i = 0; i < d.length; i += 4) uniq.add((d[i] >> 3) + ',' + (d[i+1] >> 3) + ',' + (d[i+2] >> 3));
    return { tx, ty, uniqColors: uniq.size, ok: uniq.size >= 4 };
  });
  chk('SCARP_DITHER', scarp.ok === true, scarp);

  // minimap shroud: explored tile pixels brighter than unexplored void
  const mm = await p.evaluate(() => {
    const h = window.__SCC2.scene.getScene('Hud');
    const bt = window.__SCC2.scene.getScene('Battle');
    const cv = h._mmShroudCv; const ctx = cv.getContext('2d', { willReadFrequently: true });
    const res = cv.width / 160;
    // stamp a known band explored on row 80, force a repaint at current time, then sample
    for (let tx = 40; tx < 120; tx++) bt.seen[80 * 160 + tx] = 1;
    h._shroudAt = -99;
    h.drawShroud(bt);
    const seen = []; const void_ = [];
    for (let tx = 0; tx < 160; tx++) {
      const idx = 80 * 160 + tx;
      const px = ctx.getImageData(Math.round(tx * res), Math.round(80 * res), 1, 1).data;
      const lum = 0.299 * px[0] + 0.587 * px[1] + 0.114 * px[2];
      if (bt.seen[idx]) seen.push(lum); else void_.push(lum);
    }
    const avg = a => a.length ? a.reduce((s, v) => s + v, 0) / a.length : -1;
    return { seenLum: +avg(seen).toFixed(1), voidLum: +avg(void_).toFixed(1), nSeen: seen.length };
  });
  chk('SHROUD_READTHROUGH', mm.seenLum > mm.voidLum + 20, mm);

  console.log(out.map(o => `${o.ok ? 'PASS' : 'FAIL'} ${o.id} ${JSON.stringify(o)}`).join('\n'));
  console.log('ERRS', JSON.stringify(errs.slice(0, 4)));
  await b.close();
  const fails = out.filter(o => !o.ok).length;
  console.log(fails ? `GATE-V259 ${out.length - fails}/${out.length} FAIL` : `GATE-V259 ${out.length}/${out.length} PASS`);
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log('E', String(e).slice(0, 300)); process.exit(1); });
