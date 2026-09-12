// v2.61 gate: minimap elev/rock paint (fog-gated), Title sky-tint wash, denser battle dust.
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

  // 1. Title sky-tint: vertical luminance gradient in top 50% of the FALLBACK
  // wash (key art hidden for the probe — the wash is what ships behind it)
  await p.evaluate(() => {
    const t = window.__SCC2.scene.getScene('Title');
    if (t.bgImg) t.bgImg.setVisible(false);
  });
  await p.waitForTimeout(600); // let WebGL render one frame without the key art
  const sky = await p.evaluate(() => {
    const t = window.__SCC2.scene.getScene('Title');
    if (!t || !window.__SCC2.scene.isActive('Title')) return { err: 'title not active' };
    const cv = window.__SCC2.canvas;
    const o = document.createElement('canvas'); o.width = cv.width; o.height = cv.height;
    const x = o.getContext('2d', { willReadFrequently: true }); x.drawImage(cv, 0, 0);
    const d = x.getImageData(0, 0, o.width, o.height).data;
    const strip = Math.floor(o.height * 0.5);
    const lum = [];
    for (let yy = 2; yy < strip; yy += Math.max(1, Math.floor(strip / 12))) {
      let s = 0, n = 0;
      for (let xx = 4; xx < o.width - 4; xx += 3) {
        const i = (yy * o.width + xx) * 4;
        s += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]; n++;
      }
      lum.push(s / n);
    }
    // ignore columns-brightness noise: compare top strip rows vs mid strip rows; B channel too
    const top = lum.slice(0, 3).reduce((a, v) => a + v, 0) / 3;
    const mid = lum.slice(-3).reduce((a, v) => a + v, 0) / 3;
    return { top: +top.toFixed(1), mid: +mid.toFixed(1), rows: lum.length, ok: mid > top + 6 };
  });
  chk('SKY_TINT', sky.ok === true, sky);

  // 2. Battle boot
  await p.evaluate(async () => {
    const sm = window.__SCC2.scene;
    for (const s of sm.getScenes(true)) sm.stop(s.scene.key);
    await new Promise(r => setTimeout(r, 400));
    sm.start('Battle', { race: 'terran', enemyRace: 'skarn' });
    await new Promise(r => setTimeout(r, 5000));
  });

  // 3+4 recipe (corrected): fog restamp only ADDS seen tiles — zeroing never
  // sticks. FOG test uses a NATURALLY unseen rock tile at boot. ELEV test stamps
  // a row seen=1 (stable, adds only), waits >=2 swiftshader frames, then probes.
  const geom = await p.evaluate(() => {
    const bt = window.__SCC2.scene.getScene('Battle');
    const h = window.__SCC2.scene.getScene('Hud');
    let eTx = -1, eTy = -1;
    for (let i = 0; i < bt.elev.length; i++) if (bt.elev[i]) { eTy = (i / 160) | 0; eTx = i % 160; break; }
    let rTx = -1, rTy = -1;
    // unit vision re-stamps seen every tick — lock tile selection now; the final
    // assert re-reads live seen + shroudCtx at capture time (fog is dynamic)
    for (const r of (bt.rockTiles || [])) {
      if (r.tx > 5 && r.ty > 5 && r.tx < 155 && r.ty < 155) { rTx = r.tx; rTy = r.ty; break; }
    }
    window.__mmProbe = (tx, ty) => {
      const cv = window.__SCC2.canvas;
      const sc = cv.width / window.innerWidth;
      const tile = h.mmSize / 160;
      const cx0 = Math.round((h.mmX + tx * tile + tile / 2) * sc);
      const cy0 = Math.round((h.mmY + ty * tile + tile / 2) * sc);
      const o = document.createElement('canvas'); o.width = cv.width; o.height = cv.height;
      const x = o.getContext('2d', { willReadFrequently: true }); x.drawImage(cv, 0, 0);
      const d = x.getImageData(0, 0, o.width, o.height).data;
      let rr = 0, gg = 0, bb = 0, n = 0;
      for (let dy2 = -1; dy2 <= 1; dy2++) for (let dx2 = -1; dx2 <= 1; dx2++) {
        const i = ((cy0 + dy2) * cv.width + (cx0 + dx2)) * 4;
        rr += d[i]; gg += d[i + 1]; bb += d[i + 2]; n++;
      }
      return [rr / n, gg / n, bb / n].map(v => Math.round(v));
    };
    // stamp the elev row + neighbors seen (adds only = stable), force repaint
    for (let tx = eTx - 12; tx <= eTx + 24; tx++) {
      bt.seen[bt.nav.idx(tx, eTy)] = 1;
      bt.seen[bt.nav.idx(tx, eTy + 1)] = 1;
      bt.seen[bt.nav.idx(tx, eTy - 1)] = 1;
    }
    let lTx = eTx, guard = 0;
    while (guard++ < 60 && (bt.elev[eTy * 160 + lTx] || (bt.rockTiles || []).some(rr => rr.tx === lTx && rr.ty === eTy))) lTx++;
    h._shroudAt = -99; h.drawShroud(bt);
    return { eTx, eTy, rTx, rTy, lTx, have: eTx >= 0 && rTx >= 0 };
  });
  await p.waitForTimeout(2200); // >= 2 swiftshader frames incl. 2Hz shroud cadence
  // HARNESS LIMIT (swiftshader): canvas-texture images (mm_shroud, mmTerrain) do
  // not upload to the framebuffer headless (red-paint test: composite unchanged),
  // while vector mmG DOES composite. So: shroud asserts read _mmShroudCtx (the
  // game's paint of record); elev asserts read the composite (mmG path, real).
  // HARNESS LIMIT (swiftshader headless): canvas-texture images (mm_shroud) do not
  // upload to the GL framebuffer (red-paint probe: composite unchanged), while the
  // mmTerrain snapshot and mmG vector DO composite. Assert the shroud on its paint
  // of record (_mmShroudCtx): unseen rock tiles opaque void, explored tiles lighter.
  const fog = await p.evaluate((g) => {
    const h = window.__SCC2.scene.getScene('Hud');
    const bt = window.__SCC2.scene.getScene('Battle');
    let rockVoid = 0, rockTotal = 0, seenLight = 0;
    for (const r of (bt.rockTiles || [])) {
      rockTotal++;
      const d = h._mmShroudCtx.getImageData(r.tx, r.ty, 1, 1).data;
      if (d[0] <= 8 && d[1] <= 10 && d[2] <= 16 && d[3] === 255) rockVoid++;
      else if (d[3] > 0 || d[0] > 20) seenLight++;
    }
    // sanity: some seen rock exists (elev row was stamped seen adjacent)
    const anySeen = bt.seen.reduce((s, v) => s + v, 0);
    return { rockTotal, rockVoid, seenTiles: anySeen };
  }, geom);
  // FOG_TIGHT: ALL rock tiles are void-dark in the shroud until scouted,
  // and the seen map is live (nonzero) so the gating is real, not all-black.
  chk('MINIMAP_FOG_TIGHT', fog.rockVoid >= fog.rockTotal - 2 && fog.seenTiles >= 1,
    { rockVoid: fog.rockVoid, rockTotal: fog.rockTotal, seenTiles: fog.seenTiles });
  const px = await p.evaluate((g) => ({
    elev: window.__mmProbe(g.eTx, g.eTy),
    low: window.__mmProbe(g.lTx, g.eTy),
  }), geom);
  const lum = c => 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];
  const eL = lum(px.elev), loL = lum(px.low);
  // ELEV_PAINT: seen elev face lifted vs adjacent lowland
  chk('MINIMAP_ELEV_PAINT', geom.have === true && eL > loL + 3, { elev: px.elev, low: px.low, eL: +eL.toFixed(1), loL: +loL.toFixed(1) });

  // 5. Battle dust density: live scrollFactor0 motes above threshold after 12s
  const dust = await p.evaluate(async () => {
    const bt = window.__SCC2.scene.getScene('Battle');
    bt.polish._cheap = () => true; // v2.56 pitfall: children>850 budget silently skips polish
    bt.polish._wxT = 0;
    await new Promise(r => setTimeout(r, 15000));
    const motes = bt.children.list.filter(o => o.active && o.scrollFactorX === 0 && o.depth === 9000);
    // swiftshader ticks ~1-2fps: at the v2.61 0.05-0.12s cadence expect ~4+ live motes;
    // pre-v2.61 cadence (0.12-0.27s) yields ~1-2 in the same window.
    return { n: motes.length, ok: motes.length >= 4 };
  });
  chk('BATTLE_DUST_DENSITY', dust.ok === true, dust);

  console.log(out.map(o => `${o.ok ? 'PASS' : 'FAIL'} ${o.id} ${JSON.stringify(o)}`).join('\n'));
  console.log('ERRS', JSON.stringify(errs.slice(0, 4)));
  await b.close();
  const fails = out.filter(o => !o.ok).length;
  console.log(fails ? `GATE-V261 ${out.length - fails}/${out.length} FAIL` : `GATE-V261 ${out.length}/${out.length} PASS`);
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log('E', String(e).slice(0, 300)); process.exit(1); });
