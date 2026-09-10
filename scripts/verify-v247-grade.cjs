// v2.47 grade/cursor gate: color-grade overlay, vignette, command cursor
// state machine, hit FX. Prints per-check JSON + GATE-V247 PASS/FAIL.
const path = require('path');
const fs = require('fs');
const pwPath = require('child_process').execSync('npm root -g').toString().trim();
const { chromium } = require(path.join(pwPath, 'playwright'));
(async () => {
  const url = process.env.SCC_URL || 'http://127.0.0.1:4177/scc/';
  const shot = process.env.SHOT || '/tmp/v247_grade.png';
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
    await new Promise(r => setTimeout(r, 6000));
  });
  const out = [];
  const chk = (id, ok, extra) => out.push({ id, ok: !!ok, ...(extra || {}) });

  // 1. grade + vignette exist on Battle with sane alpha
  const gr = await p.evaluate(() => {
    const bs = window.__SCC2.scene.getScene('Battle');
    return { grade: !!bs.gradeRect, ga: bs.gradeRect ? +bs.gradeRect.alpha.toFixed(3) : -1,
      blend: bs.gradeRect ? bs.gradeRect.blendMode : -1,
      vig: !!bs.vignetteImg, va: bs.vignetteImg ? +bs.vignetteImg.alpha.toFixed(2) : -1 };
  });
  chk('GRADE_LAYER', gr.grade && gr.ga > 0 && gr.vig && gr.va > 0.5, gr);

  // 2. grade shifts at night: force _dayT into night band, updateLighting
  const gr2 = await p.evaluate(() => {
    const bs = window.__SCC2.scene.getScene('Battle');
    const dayCol = bs.gradeRect.fillColor, dayA = bs.gradeRect.alpha;
    bs._dayT = 0.7; bs.updateLighting(0.016);
    const nightCol = bs.gradeRect.fillColor, nightA = bs.gradeRect.alpha;
    bs._dayT = 0.2; bs.updateLighting(0.016);
    return { dayCol, nightCol, dayA: +dayA.toFixed(3), nightA: +nightA.toFixed(3), backCol: bs.gradeRect.fillColor };
  });
  chk('GRADE_DAYNIGHT', gr2.nightCol !== gr2.dayCol && gr2.nightA > gr2.dayA && gr2.backCol === gr2.dayCol, gr2);

  // 3. vignette pixel test: corners darker than center in snapshot
  const vpx = await p.evaluate(async () => {
    const snap = await new Promise(r => window.__SCC2.renderer.snapshot(img => r(img.src)));
    const img = new Image(); await new Promise(r => { img.onload = r; img.src = snap; });
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const x = c.getContext('2d'); x.drawImage(img, 0, 0);
    const lum = (px) => (px[0] + px[1] + px[2]) / 3;
    const s = Math.max(1, Math.min(8, Math.floor(img.width / 180)));
    let cL = 0; const cc = x.getImageData(Math.floor(img.width / 2), Math.floor(img.height / 2), 20 * s, 20 * s).data;
    for (let i = 0; i < cc.length; i += 4 * s) cL += lum([cc[i], cc[i + 1], cc[i + 2]]); cL /= (cc.length / (4 * s));
    let eL = 0; const ec = x.getImageData(0, 0, 14 * s, 14 * s).data;
    for (let i = 0; i < ec.length; i += 4 * s) eL += lum([ec[i], ec[i + 1], ec[i + 2]]); eL /= (ec.length / (4 * s));
    return { cL: +cL.toFixed(1), eL: +eL.toFixed(1), w: img.width };
  });
  chk('VIGNETTE_PX', vpx.cL > vpx.eL, vpx);

  // 4. command cursor: exists, follows pointer, state switches on attack-move mode
  await p.mouse.move(700, 400);
  await p.waitForTimeout(120);
  const cur1 = await p.evaluate(() => {
    const hd = window.__SCC2.scene.getScene('Hud');
    return { exists: !!hd.cur && hd.cur.active, tex: hd.cur ? hd.cur.texture.key : '', x: hd.cur ? Math.round(hd.cur.x) : -1 };
  });
  chk('CUR_FOLLOW', cur1.exists && cur1.tex === 'cur-normal' && cur1.x > 600, cur1);
  await p.evaluate(() => { window.__SCC2.scene.getScene('Battle').events.emit('hud:attackMode'); });
  await p.mouse.move(710, 410);
  await p.waitForTimeout(120);
  const cur2 = await p.evaluate(() => {
    const hd = window.__SCC2.scene.getScene('Hud');
    return { tex: hd.cur ? hd.cur.texture.key : '', st: hd._curState };
  });
  chk('CUR_ATTACK', cur2.tex === 'cur-attack' && cur2.st === 'attack', cur2);
  await p.evaluate(async () => {
    const bs = window.__SCC2.scene.getScene('Battle');
    bs.attackMoveMode = false;
    // startPlacing gates on affordability + workers: stage both (RA start = MCV only)
    bs.players[0].minerals = 5000; bs.players[0].gas = 5000;
    const w = bs.spawnUnit(0, 'rigger', bs.units[0].x + 20, bs.units[0].y + 20, { arriveReady: true });
    if (w) { bs.selection.clear(); bs.selection.add(w); }
    bs.events.emit('hud:place', 'barracks');
  });
  await p.mouse.move(720, 420);
  await p.waitForTimeout(120);
  const cur3 = await p.evaluate(() => {
    const hd = window.__SCC2.scene.getScene('Hud');
    const bs = window.__SCC2.scene.getScene('Battle');
    return { tex: hd.cur ? hd.cur.texture.key : '', placing: !!bs.placing };
  });
  chk('CUR_PLACE', cur3.tex === 'cur-place', cur3);
  // exit placing with ESC
  await p.keyboard.press('Escape');
  await p.evaluate(() => { const bs = window.__SCC2.scene.getScene('Battle'); if (bs.placing) bs.cancelPlacing(); });
  await p.mouse.move(730, 430);
  await p.waitForTimeout(120);
  const cur4 = await p.evaluate(() => window.__SCC2.scene.getScene('Hud').cur.texture.key);
  chk('CUR_BACK', cur4 === 'cur-normal', { tex: cur4 });

  // 5. hit FX: applyHit spawns ring+sparks (child count grows at depth 52)
  const fx = await p.evaluate(async () => {
    const bs = window.__SCC2.scene.getScene('Battle');
    // cancel placing so ghosts don't pollute child counts
    bs.cancelPlacing();
    const mine = bs.units.find(u => u.team === 0 && !u.dead);
    let foe = bs.units.find(u => u.team === 1 && !u.dead);
    if (!foe || !mine) return { err: 'no units' };
    // bring foe to camera center so camNear passes
    const cam = bs.cameras.main;
    foe.setPos(cam.midPoint.x, cam.midPoint.y);
    mine.setPos(cam.midPoint.x - 30, cam.midPoint.y);
    await new Promise(r => setTimeout(r, 300));
    const before = bs.children.list.length;
    bs.applyHit(foe, 40, 0, mine);
    const mid = bs.children.list.length;
    await new Promise(r => setTimeout(r, 500));
    const after = bs.children.list.length;
    return { dmg: foe.hp < foe.maxHp || foe.dead, grew: mid > before + 3, cleaned: after < mid, before, mid, after };
  });
  chk('HIT_FX', fx.dmg && fx.grew && fx.cleaned, fx);

  // 6. brightness budget holds with grade on (daytime mean lum >= 30)
  const lum = await p.evaluate(async () => {
    const bs = window.__SCC2.scene.getScene('Battle');
    bs._dayT = 0.25; bs.updateLighting(0.016);
    const snap = await new Promise(r => Promise.race([window.__SCC2.renderer.snapshot(img => r(img.src)), new Promise(r2 => setTimeout(() => r2(null), 8000))]));
    if (!snap) return { err: 'snapshot timeout' };
    const img = new Image(); await new Promise(r => { img.onload = r; img.src = snap; });
    const c = document.createElement('canvas'); c.width = 320; c.height = 190;
    const x = c.getContext('2d'); x.drawImage(img, 0, 0, 320, 190);
    const d = x.getImageData(0, 0, 320, 190).data;
    let t = 0; for (let i = 0; i < d.length; i += 4) t += (d[i] + d[i + 1] + d[i + 2]) / 3;
    return { avg: +(t / (d.length / 4)).toFixed(1) };
  });
  chk('BRIGHTNESS', !lum.err && lum.avg >= 30, lum);

  await p.evaluate(() => new Promise(r => Promise.race([window.__SCC2.renderer.snapshot(img => r(img.src)), new Promise(r2 => setTimeout(() => r2(null), 8000))]))).then(d => { if (d) fs.writeFileSync(shot, Buffer.from(d.split(',')[1], 'base64')); });

  console.log(JSON.stringify(out, null, 1));
  console.log('ERRORS', JSON.stringify(errs.slice(0, 6)));
  const fails = out.filter(o => !o.ok);
  if (fails.length === 0 && errs.length === 0) { console.log('GATE-V247 PASS'); await b.close(); process.exit(0); }
  console.log('GATE-V247 FAIL', fails.map(f => f.id).join(','));
  await b.close(); process.exit(1);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
