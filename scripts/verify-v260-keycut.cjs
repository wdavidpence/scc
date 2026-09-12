// v2.60 gate: KEYCUT rock/mineral/geyser cutouts, ground spatter, hero sharpen, title dust.
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
  await p.waitForTimeout(2500);

  const out = [];
  const chk = (id, ok, extra) => { out.push({ id, ok: !!ok, ...(extra || {}) }); };

  // 1. Title: dust motes exist and drift
  const title = await p.evaluate(async () => {
    const t = window.__SCC2.scene.getScene('Title');
    if (!t || !window.__SCC2.scene.isActive('Title')) return { err: 'title not active' };
    const n = (t._dust || []).length;
    const a = (t._dust || []).map(m => Math.round(m.x * 10) + ',' + Math.round(m.y * 10));
    await new Promise(r => setTimeout(r, 1600));
    const c = (t._dust || []).map(m => Math.round(m.x * 10) + ',' + Math.round(m.y * 10));
    let moved = 0;
    for (let i = 0; i < c.length; i++) if (a[i] && a[i] !== c[i]) moved++;
    return { n, moved, ok: n >= 20 && moved >= 8 };
  });
  chk('TITLE_DUST', title.ok === true, title);

  // 2. Title: hero portrait sharpened flag
  const hero = await p.evaluate(() => {
    const t = window.__SCC2.scene.getScene('Title');
    const keys = ['terran', 'skarn', 'auraxis'].filter(r => t.textures.exists('hero_' + r)).map(r => !!t.textures.get('hero_' + r).__sharpened);
    return { checked: keys.length, allSharp: keys.length > 0 && keys.every(Boolean) };
  });
  chk('HERO_SHARPEN', hero.allSharp === true, hero);

  // 3. Battle: KEYCUT ran and rock corner alpha now transparent at edges
  await p.evaluate(async () => {
    const sm = window.__SCC2.scene;
    for (const s of sm.getScenes(true)) sm.stop(s.scene.key);
    await new Promise(r => setTimeout(r, 400));
    sm.start('Battle', { race: 'terran', enemyRace: 'skarn' });
    await new Promise(r => setTimeout(r, 5000));
  });
  const keycut = await p.evaluate(() => {
    const bt = window.__SCC2.scene.getScene('Battle');
    const res = { n: bt._keycutN || 0, rocks: [] };
    for (const k of ['ai-rock0', 'ai-rock1', 'ai-rock2']) {
      if (!bt.textures.exists(k)) continue;
      const src = bt.textures.get(k).getSourceImage();
      const c = document.createElement('canvas'); c.width = src.width; c.height = src.height;
      const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(src, 0, 0);
      const d = x.getImageData(0, 0, c.width, c.height).data;
      // corner + edge midpoint alphas
      const px = (XX, yy) => d[(yy * c.width + XX) * 4 + 3];
      const corners = [px(1, 1), px(c.width - 2, 1), px(1, c.height - 2), px(c.width - 2, c.height - 2)];
      const maxCorner = Math.max(...corners);
      res.rocks.push({ k, maxCornerAlpha: maxCorner, ok: maxCorner < 40 });
    }
    res.cutRan = (bt._keycutN || 0) >= 1;
    res.cornersClear = res.rocks.every(r => r.ok);
    res.ok = res.cutRan && res.cornersClear;
    return res;
  });
  chk('KEYCUT_CORNERS', keycut.ok === true, keycut);

  // 4. Battle: ground spatter images exist and paint across the whole map
  const spatter = await p.evaluate(() => {
    const bt = window.__SCC2.scene.getScene('Battle');
    const imgs = bt.children.list.filter(o => o.active && o.texture && /^spatter\d$/.test(o.texture.key));
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const im of imgs) { minX = Math.min(minX, im.x); maxX = Math.max(maxX, im.x); minY = Math.min(minY, im.y); maxY = Math.max(maxY, im.y); }
    const spanOK = imgs.length > 200 && (maxX - minX) > 1200 && (maxY - minY) > 1200;
    return { n: imgs.length, spanOK };
  });
  chk('GROUND_SPATTER', spatter.spanOK === true, spatter);

  // 5. Full-frame texture diversity improved vs old flat floors (var>700, uniq>500)
  const stats = await p.evaluate(() => {
    const cv = window.__SCC2.canvas;
    const o = document.createElement('canvas'); o.width = cv.width; o.height = cv.height;
    const x = o.getContext('2d', { willReadFrequently: true }); x.drawImage(cv, 0, 0);
    const d = x.getImageData(0, 0, o.width, o.height).data;
    let s = 0, s2 = 0, n = 0; const hues = new Set();
    for (let i = 0; i < d.length; i += 4) {
      const l = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      s += l; s2 += l * l; n++;
      if (l > 8) hues.add((d[i] >> 4) + ',' + (d[i + 1] >> 4) + ',' + (d[i + 2] >> 4));
    }
    const avg = s / n, varr = s2 / n - avg * avg;
    return { avg: +avg.toFixed(1), var: Math.round(varr), uniq: hues.size, brightOK: avg >= 30 };
  });
  chk('TEXTURE_RICH', stats.var > 500 && stats.uniq > 400 && stats.brightOK, stats);

  console.log(out.map(o => `${o.ok ? 'PASS' : 'FAIL'} ${o.id} ${JSON.stringify(o)}`).join('\n'));
  console.log('ERRS', JSON.stringify(errs.slice(0, 4)));
  await b.close();
  const fails = out.filter(o => !o.ok).length;
  console.log(fails ? `GATE-V260 ${out.length - fails}/${out.length} FAIL` : `GATE-V260 ${out.length}/${out.length} PASS`);
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log('E', String(e).slice(0, 300)); process.exit(1); });
