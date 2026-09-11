// v2.58 CRISP gate: native-size unit bakes, scale-1 display, integer positions, walk-cycle key swaps.
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
    const mid = bt.cameras.main.midPoint;
    for (let i = 0; i < 6; i++) bt.spawnUnit(0, 'marine', mid.x - 80 + i * 24, mid.y - 40 + (i % 2) * 20, { arriveReady: true });
    for (let i = 0; i < 4; i++) bt.spawnUnit(1, 'skarling', mid.x + 110 + i * 20, mid.y + 8 + (i % 3) * 14, { arriveReady: true });
  });
  const out = [];
  const chk = (id, ok, extra) => { out.push({ id, ok: !!ok, ...(extra || {}) }); };

  // 1. every unit sprite scale is exactly 1.0 (or integer-ish sizeScale, never the old 0.61 fractional)
  const scales = await p.evaluate(() => {
    const bt = window.__SCC2.scene.getScene('Battle');
    const bad = [];
    for (const u of bt.units.filter(u => u && !u.dead && u.sprite)) {
      const s = +u.sprite.scaleX.toFixed(3);
      if (s < 0.9) bad.push({ k: u.sprite.texture.key, s });
    }
    return { n: bt.units.filter(u => u && !u.dead).length, bad };
  });
  chk('SCALE_NO_FRACTIONAL', scales.bad.length === 0, scales);

  // 2. unit texture source width == display width (native 1:1 bake)
  const native = await p.evaluate(() => {
    const bt = window.__SCC2.scene.getScene('Battle');
    const bad = [];
    const seen = new Set();
    for (const u of bt.units.filter(u => u && !u.dead && u.sprite)) {
      const k = u.sprite.texture.key;
      if (seen.has(k)) continue; seen.add(k);
      const src = bt.textures.get(k).source[0];
      if (!src) continue;
      if (Math.abs(src.width * (u.sprite.scaleX || 1) - u.sprite.displayWidth) > 1 || src.width * (u.sprite.scaleX || 1) < src.width * 0.99) bad.push({ k, src: src.width, disp: Math.round(u.sprite.displayWidth) });
      if (u.sprite.scaleX < 0.99) bad.push({ k, scale: u.sprite.scaleX });
    }
    return { checked: seen.size, bad };
  });
  chk('NATIVE_1TO1', native.bad.length === 0, native);

  // 3. roundPixels: renderer reports it
  const rp = await p.evaluate(() => {
    const g = window.__SCC2;
    let camRound = false;
    try { camRound = !!g.scene.getScene('Battle').cameras.main.roundPixels; } catch (e) {}
    const cfg = (g.config && g.config.render && g.config.render.roundPixels) || (g.config && g.config.roundPixels) || false;
    return { autoRound: !!cfg, camRound };
  });
  chk('ROUND_PIXELS', rp.autoRound === true, rp);

  // 4. walk cycle actually swaps texture KEYS while moving (the real animation proof)
  const walk = await p.evaluate(async () => {
    const bt = window.__SCC2.scene.getScene('Battle');
    const mid = bt.cameras.main.midPoint;
    const m = bt.units.find(u => u && !u.dead && u.team === 0 && u.kind === 'marine');
    if (!m) return { err: 'no marine' };
    m.setPos(mid.x - 140, mid.y);
    bt.addToSelection(m);
    bt.issueGroupMove([m], mid.x + 160, mid.y, false);
    const keys = new Set();
    for (let i = 0; i < 40; i++) {
      await new Promise(r => setTimeout(r, 90));
      keys.add(m.sprite.texture.key);
    }
    const base = `u-marine-t${m.team > 2 ? 2 : m.team}`;
    const wk = [...keys].filter(k => /-w\d$/.test(k));
    return { keys: [...keys].slice(0, 8), walkFramesSeen: wk.length, moved: Math.abs(m.x - (mid.x - 140)) > 30 };
  });
  chk('WALK_CYCLE', walk.walkFramesSeen >= 2 && walk.moved === true, walk);

  // 5. idle returns to base texture
  const idle = await p.evaluate(async () => {
    const bt = window.__SCC2.scene.getScene('Battle');
    const m = bt.units.find(u => u && !u.dead && u.team === 0 && u.kind === 'marine');
    if (!m) return { err: 'no marine' };
    m.setOrder({ type: 'stop' }); m.path = []; m.target = null;
    await new Promise(r => setTimeout(r, 900));
    const k = m.sprite.texture.key;
    return { key: k, base: /-w\d$/.test(k) === false };
  });
  chk('IDLE_BASE_FRAME', idle.base === true, idle);

  console.log(out.map(o => `${o.ok ? 'PASS' : 'FAIL'} ${o.id} ${JSON.stringify(o)}`).join('\n'));
  console.log('ERRS', JSON.stringify(errs.slice(0, 4)));
  await b.close();
  const fails = out.filter(o => !o.ok).length;
  console.log(fails ? `GATE-V258 ${out.length - fails}/${out.length} FAIL` : `GATE-V258 ${out.length}/${out.length} PASS`);
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log('E', String(e).slice(0, 300)); process.exit(1); });
