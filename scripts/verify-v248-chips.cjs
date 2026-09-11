// v2.48 command-card chip/tooltip/killfeed chrome gate.
// Prints per-check JSON + GATE-V248 PASS/FAIL, exit code reflects result.
const path = require('path');
const pwPath = require('child_process').execSync('npm root -g').toString().trim();
const { chromium } = require(path.join(pwPath, 'playwright'));
(async () => {
  const url = process.env.SCC_URL || 'http://127.0.0.1:4177/scc/';
  const shot = process.env.SHOT || '/tmp/v248_chips.png';
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

  // 0. ability chips on the pre-deploy unit card: RA start has a live MCV
  const ab = await p.evaluate(async () => {
    const bs = window.__SCC2.scene.getScene('Battle');
    const h = window.__SCC2.scene.getScene('Hud');
    const m = bs.units.find(u => u.team === 0 && !u.dead && u.kind === 'marine') || bs.spawnUnit(0, 'marine', bs.cameras.main.midPoint.x, bs.cameras.main.midPoint.y, { arriveReady: true });
    bs.clearSelection(); bs.addToSelection(m);
    await new Promise(r => setTimeout(r, 400));
    const atk = h.buttons.find(bb => /ATTACK/.test(String(bb.label)));
    const stop = h.buttons.find(bb => bb.label === 'STOP');
    const mcv = bs.units.find(u => u.team === 0 && !u.dead && u.def.mcv);
    let dep = null;
    if (mcv) { bs.selection.clear(); bs.selection.add(mcv); mcv.selected = true; h.onSelection({ units: [mcv], count: 1 }); await new Promise(r => setTimeout(r, 400)); dep = h.buttons.find(bb => /DEPLOY/.test(String(bb.label))); }
    // hotkey badge: STIM [F] -> label 'STIM', corner badge 'F'
    bs.clearSelection(); bs.addToSelection(m);
    await new Promise(r => setTimeout(r, 400));
    const stim = h.buttons.find(bb => /STIM/.test(String(bb.label)));
    return { atkChip: atk && atk.chip ? atk.chip.texture.key : null,
      stopChip: stop && stop.chip ? stop.chip.texture.key : null,
      depChip: dep && dep.chip ? dep.chip.texture.key : null,
      depLabel: dep ? dep.label : null,
      stimLabel: stim ? stim.label : null, stimBadge: stim && stim.chip && stim.chip._hk ? stim.chip._hk.text : null };
  });
  chk('ABIL_CHIPS', ab.atkChip === 'chip-attack' && ab.stopChip === 'chip-stop' && ab.depChip === 'chip-deploy' && /DEPLOY/.test(ab.depLabel || ''), ab);
  chk('HOTKEY_BADGE', ab.stimLabel === 'STIM' && ab.stimBadge === 'F', ab);

  // 0b. deploy the MCV so workers/base exist for the worker-card checks (v2.45 harness recipe)
  const boot = await p.evaluate(async () => {
    const bs = window.__SCC2.scene.getScene('Battle');
    const mcv = bs.units.find(u => u.team === 0 && !u.dead && u.def.mcv);
    if (!mcv) return { err: 'no mcv' };
    const min = bs.minerals && bs.minerals[0];
    if (min) {
      for (let r = 2; r < 12; r += 1) {
        const spots = [[min.x + r * 16, min.y], [min.x - r * 16, min.y], [min.x, min.y + r * 16], [min.x, min.y - r * 16]];
        let ok = false;
        for (const [x, y] of spots) { if (bs.placementValid('commandCenter', x, y, 0)) { mcv.setPos(x, y); ok = true; break; } }
        if (ok) break;
      }
    }
    bs.deployMCV(mcv);
    await new Promise(r => setTimeout(r, 3000));
    return { cc: !!bs.buildings.find(bb => bb.team === 0 && !bb.dead), workers: bs.units.filter(u => u.team === 0 && !u.dead && u.def.worker).length };
  });
  chk('MCV_BOOT', boot.cc === true, boot);

  // 1. all chip textures baked
  const tex = await p.evaluate(() => {
    const keys = ['chip-attack','chip-stop','chip-deploy','chip-siege','chip-burrow','chip-stim','chip-cloak',
      'chip-merge','chip-mergeDark','chip-mael','chip-guardian','chip-devourer','chip-caustic','chip-storm',
      'chip-patrol','chip-hold','chip-scan','chip-train','chip-upgrade','chip-build','chr-tip','chr-kfrow'];
    const h = window.__SCC2.scene.getScene('Hud');
    const missing = keys.filter(k => !h.textures.exists(k));
    return { total: keys.length, missing };
  });
  chk('CHIP_TEX', tex.missing.length === 0, tex);

  // 2. worker selection: build buttons carry chip images
  const wrk = await p.evaluate(async () => {
    const bs = window.__SCC2.scene.getScene('Battle');
    const h = window.__SCC2.scene.getScene('Hud');
    let w = bs.units.find(u => u.team === 0 && !u.dead && u.def.worker);
    if (!w) { w = bs.spawnUnit(0, 'rigger', bs.cameras.main.midPoint.x, bs.cameras.main.midPoint.y, { arriveReady: true }); await new Promise(r => setTimeout(r, 300)); }
    if (!w) return { err: 'no worker' };
    bs.selection.clear(); bs.selection.add(w); w.selected = true; h.onSelection({ units: [w], count: 1 });
    await new Promise(r => setTimeout(r, 400));
    const chips = h.buttons.filter(bb => bb.chip && bb.chip.active !== false);
    const buildChips = h.buttons.filter(bb => bb.chip && bb.chip.texture.key === 'chip-build');
    return { btns: h.buttons.length, chips: chips.length, build: buildChips.length,
      sample: chips.slice(0, 3).map(c => c.chip.texture.key) };
  });
  chk('BUILD_CHIPS', wrk.build >= 4, wrk);

  // 3. grey-out dims the chip too (worker card with drained funds)
  const grey = await p.evaluate(async () => {
    const bs = window.__SCC2.scene.getScene('Battle');
    const h = window.__SCC2.scene.getScene('Hud');
    let w = bs.units.find(u => u.team === 0 && !u.dead && u.def.worker);
    if (!w) { w = bs.spawnUnit(0, 'rigger', bs.cameras.main.midPoint.x, bs.cameras.main.midPoint.y, { arriveReady: true }); await new Promise(r => setTimeout(r, 300)); }
    if (!w) return { err: 'no worker' };
    bs.selection.clear(); bs.selection.add(w); w.selected = true; h.onSelection({ units: [w], count: 1 });
    await new Promise(r => setTimeout(r, 300));
    const p0 = bs.players[0]; const saved = p0.minerals; p0.minerals = 0;
    bs.events.emit('hud:tick');
    await new Promise(r => setTimeout(r, 500));
    const dimmed = h.buttons.filter(bb => bb.chip && bb.disabled).map(bb => +bb.chip.alpha.toFixed(2));
    p0.minerals = saved;
    bs.events.emit('hud:tick');
    await new Promise(r => setTimeout(r, 500));
    const restored = h.buttons.filter(bb => bb.chip && !bb.disabled).map(bb => +bb.chip.alpha.toFixed(2));
    return { dimmed, restored };
  });
  chk('CHIP_GREYOUT', grey.dimmed && grey.dimmed.length > 0 && grey.dimmed.every(a => a <= 0.4) && grey.restored && grey.restored.every(a => a >= 0.9), grey);

  // 6. tooltip uses chr-tip 9-slice
  const tip = await p.evaluate(async () => {
    const bs = window.__SCC2.scene.getScene('Battle');
    const h = window.__SCC2.scene.getScene('Hud');
    bs.clearSelection();
    const m = bs.units.find(u => u.team === 0 && !u.dead && u.kind === 'marine');
    bs.addToSelection(m);
    await new Promise(r => setTimeout(r, 300));
    const atk = h.buttons.find(bb => /ATTACK/.test(String(bb.label)));
    h.showTip(atk.x + 34, atk.y - 8, ['ATTACK MOVE', 'A then click']);
    const ok = !!h._tipNs && h._tipNs.obj.texture.key === 'chr-tip';
    h.hideTip();
    return { ok, ns: ok, tipT: !!h._tipT_after };
  });
  chk('TIP_9SLICE', tip.ok, tip);

  // 7. killfeed rows on chr-kfrow strips
  const kf = await p.evaluate(async () => {
    const h = window.__SCC2.scene.getScene('Hud');
    h.killFeed({ killer: 'Marine', victim: 'Skarling', mine: true });
    h.killFeed({ killer: 'Skarling', victim: 'Marine', mine: false });
    await new Promise(r => setTimeout(r, 200));
    const rows = h._kfRows || [];
    return { rows: rows.length, strips: rows.filter(r => r.bg && r.bg.texture && r.bg.texture.key === 'chr-kfrow').length,
      ico: rows.filter(r => r.ico).length, text: rows.length ? rows[rows.length - 1].txt.text : '' };
  });
  chk('KF_ROWS', kf.rows === 2 && kf.strips === 2 && kf.ico === 2, kf);

  // screenshot + brightness budget (day frame, HUD visible)
  await p.evaluate(async () => {
    const bs = window.__SCC2.scene.getScene('Battle');
    const bs2 = bs; bs2._dayT = 0.33; bs2.updateLighting(0.016);
  });
  await p.waitForTimeout(500);
  const snap = await p.evaluate(() => new Promise(r => window.__SCC2.renderer.snapshot(img => r(img.src))));
  require('fs').writeFileSync(shot, Buffer.from(snap.split(',')[1], 'base64'));

  chk('ERRORS', errs.length === 0, { errs: errs.slice(0, 5) });
  const fail = out.filter(o => !o.ok);
  console.log(JSON.stringify(out, null, 1));
  console.log(fail.length ? `GATE-V248 FAIL ${out.length - fail.length}/${out.length}` : `GATE-V248 PASS ${out.length}/${out.length}`);
  await b.close();
  process.exit(fail.length ? 1 : 0);
})().catch(e => { console.error('GATE-V248 CRASH', e); process.exit(2); });
