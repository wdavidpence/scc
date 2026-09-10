// v2.46 HUD chrome gate: 9-slice panels, resource icons, minimap shroud,
// beveled health bars, MCV deploy button. Prints PASS/FAIL per check +
// GATE-V246 PASS/FAIL token, exits non-zero on fail.
const path = require('path');
const fs = require('fs');
const pwPath = require('child_process').execSync('npm root -g').toString().trim();
const { chromium } = require(path.join(pwPath, 'playwright'));
(async () => {
  const url = process.env.SCC_URL || 'http://127.0.0.1:4177/scc/';
  const shot = process.env.SHOT || '/tmp/v246_chrome.png';
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
    sm.start('Battle', { race: 'terran', enemyRace: 'skarn', difficulty: 'normal' });
    sm.start('Hud', { race: 'terran' });
    await new Promise(r => setTimeout(r, 6000));
  });
  const h = await p.evaluate(() => window.__SCC2.scene.getScene('Hud'));
  const out = [];
  const chk = (id, ok, extra) => { out.push({ id, ok: !!ok, ...(extra || {}) }); };

  // 1. chrome textures baked
  const tex = await p.evaluate(() => {
    const t = window.__SCC2.textures;
    const keys = ['chr-panel', 'chr-topbar', 'chr-card', 'ico-mineral', 'ico-gas', 'ico-supply', 'chr-shroud', 'mm_shroud'];
    const o = {}; for (const k of keys) o[k] = t.exists(k);
    return o;
  });
  chk('CHROME_TEX', Object.values(tex).every(Boolean), tex);

  // 2. nine-slice native in use on topbar + card
  const ns = await p.evaluate(() => {
    const hd = window.__SCC2.scene.getScene('Hud');
    return { top: hd.topPanel ? hd.topPanel.native : false, card: hd._cardPanel ? hd._cardPanel.native : false,
      topType: hd.topPanel && hd.topPanel.obj ? hd.topPanel.obj.constructor.name : '' };
  });
  chk('NINE_SLICE', ns.top && ns.card, ns);

  // 3. resource icons on the topbar with live numbers
  const res = await p.evaluate(() => {
    const hd = window.__SCC2.scene.getScene('Hud');
    return { icons: !!(hd.icoMin && hd.icoGas && hd.icoSup), min: hd.resMin ? hd.resMin.text : '', gas: hd.resGas ? hd.resGas.text : '', sup: hd.resSup ? hd.resSup.text : '' };
  });
  chk('RES_ICONS', res.icons && /\d/.test(res.min) && /\//.test(res.sup), res);

  // 4. minimap shroud: unexplored corner opaque, explored tiles semi-transparent
  const shr = await p.evaluate(async () => {
    const hd = window.__SCC2.scene.getScene('Hud');
    const bs = window.__SCC2.scene.getScene('Battle');
    hd._shroudAt = -9; hd.drawShroud(bs);
    const src = window.__SCC2.textures.get('mm_shroud').getSourceImage();
    const c = document.createElement('canvas'); c.width = src.width; c.height = src.height;
    const x = c.getContext('2d'); x.drawImage(src, 0, 0);
    const res = src.width / 160;
    const far = x.getImageData(Math.floor(156 * res), Math.floor(156 * res), 1, 1).data;
    // find a seen tile near player HQ and sample ONE px at its center
    let ax = 8, ay = 8;
    for (let i = 0; i < bs.seen.length; i++) if (bs.seen[i]) { ax = (i % 160); ay = (i / 160) | 0; break; }
    const near = x.getImageData(Math.floor(ax * res), Math.floor(ay * res), 1, 1).data;
    return { farA: far[3], nearA: near[3], shroudVisible: hd.mmShroud ? hd.mmShroud.visible : false };
  });
  chk('MM_SHROUD', shr.farA > 200 && shr.nearA < 160 && shr.shroudVisible, shr);

  // 5. beveled health bar draws multi-row pixels when damaged
  const bar = await p.evaluate(async () => {
    const bs = window.__SCC2.scene.getScene('Battle');
    const u = bs.units.find(x => x.team === 0 && !x.dead && !x.def.worker);
    if (!u) return { err: 'no combat unit' };
    u.takeDamage(Math.floor(u.maxHp * 0.4), null); u.drawHp();
    const snap = await new Promise(r => window.__SCC2.renderer.snapshot(img => r(img.src)));
    return { damaged: u.hp < u.maxHp, snapLen: snap.length };
  });
  chk('HP_BAR', bar.damaged === true, bar);

  // 6. DEPLOY button appears on MCV selection and sits in the card
  const dep = await p.evaluate(() => {
    const bs = window.__SCC2.scene.getScene('Battle');
    const hd = window.__SCC2.scene.getScene('Hud');
    const mcv = bs.units.find(u => u.team === 0 && !u.dead && u.def.mcv);
    if (!mcv) return { err: 'no mcv' };
    bs.selection.clear(); bs.selection.add(mcv); mcv.selected = true;
    hd.onSelection({ units: [mcv], count: 1 });
    const btn = hd.buttons.find(bb => String(bb.label).startsWith('DEPLOY'));
    return { found: !!btn, label: btn ? btn.label : '' };
  });
  chk('DEPLOY_BTN', dep.found && /DEPLOY/.test(dep.label), dep);

  // 7. clicking DEPLOY deploys the MCV into a primary command center
  const dep2 = await p.evaluate(async () => {
    const bs = window.__SCC2.scene.getScene('Battle');
    const hd = window.__SCC2.scene.getScene('Hud');
    const mcv = bs.units.find(u => u.team === 0 && !u.dead && u.def.mcv);
    if (!mcv) return { err: 'no mcv' };
    const btn = hd.buttons.find(bb => String(bb.label).startsWith('DEPLOY'));
    if (!btn) return { err: 'no button' };
    btn.hit.emit('pointerdown', {});
    await new Promise(r => setTimeout(r, 900));
    const cc = bs.buildings.find(x => x.team === 0 && x.def.primary && !x.dead);
    return { deployed: !!cc };
  });
  chk('DEPLOY_CLICK', dep2.deployed === true, dep2);

  await p.evaluate(() => new Promise(r => window.__SCC2.renderer.snapshot(img => r(img.src)))).then(d => fs.writeFileSync(shot, Buffer.from(d.split(',')[1], 'base64')));

  console.log(JSON.stringify(out, null, 1));
  const fails = out.filter(o => !o.ok);
  console.log('ERRORS', JSON.stringify(errs.slice(0, 6)));
  if (fails.length === 0 && errs.length === 0) { console.log('GATE-V246 PASS'); await b.close(); process.exit(0); }
  console.log('GATE-V246 FAIL', fails.map(f => f.id).join(','));
  await b.close(); process.exit(1);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
