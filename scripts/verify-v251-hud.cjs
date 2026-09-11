// v2.51 HUD chrome gate: tooltip cost icons, control-group badge plates, idle chip.
// Prints per-check JSON + GATE-V251 PASS/FAIL, exit code reflects result.
const path = require('path');
const fs = require('fs');
const pwPath = require('child_process').execSync('npm root -g').toString().trim();
const { chromium } = require(path.join(pwPath, 'playwright'));
(async () => {
  const url = process.env.SCC_URL || 'http://127.0.0.1:4177/scc/';
  const shot = process.env.SHOT || '/tmp/v251_hud.png';
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
    const b = window.__SCC2.scene.getScene('Battle');
    // deploy CC so workers exist and training buttons appear
    const mcv = b.units.find(u => u.team === 0 && !u.dead && u.def.mcv);
    if (mcv) {
      const pd = mcv.def.deploysTo || 'commandCenter';
      const min = b.minerals[0];
      if (min) {
        outer0: for (let r = 2; r < 14; r++) for (const [dx, dy] of [[r,0],[-r,0],[0,r],[0,-r]]) if (b.placementValid(pd, min.x + dx * 16, min.y + dy * 16)) { mcv.setPos(min.x + dx * 16, min.y + dy * 16); break outer0; }
      }
      b.deployMCV(mcv);
      await new Promise(r => setTimeout(r, 2500));
    }
  });
  const out = [];
  const chk = (id, ok, extra) => out.push({ id, ok: !!ok, ...(extra || {}) });

  // 1. new baked textures exist
  const tex = await p.evaluate(() => {
    const h = window.__SCC2.scene.getScene('Hud');
    const keys = ['chr-grpbadge', 'chr-idle', 'ico-mineral', 'ico-gas', 'ico-supply'];
    return { missing: keys.filter(k => !h.textures.exists(k)) };
  });
  chk('TEX_BAKED', tex.missing.length === 0, tex);

  // 2. tooltip iconify: direct showTip with a unit-style cost row
  const tip = await p.evaluate(async () => {
    const h = window.__SCC2.scene.getScene('Hud');
    h.showTip(700, 400, ['Marine', 'Min 50  Gas 0  Sup 1', 'HP 45']);
    await new Promise(r => setTimeout(r, 150));
    const icons = (h._tipIcons || []).length;
    const txt = h._tipT ? h._tipT.text : '';
    h.hideTip();
    return { icons, hasMinWord: /Min \d/.test(txt), txt: txt.split('\n')[1] };
  });
  chk('TIP_COST_ICONS', tip.icons >= 1 && tip.hasMinWord === false, tip);

  // 3. hideTip cleans up icons
  const tipHide = await p.evaluate(async () => {
    const h = window.__SCC2.scene.getScene('Hud');
    h.hideTip();
    await new Promise(r => setTimeout(r, 80));
    return { icons: (h._tipIcons || []).filter(i => i.active).length };
  });
  chk('TIP_CLEANUP', tipHide.icons === 0, tipHide);

  // 4. control-group badge plates render with accent tint
  const grp = await p.evaluate(async () => {
    const b = window.__SCC2.scene.getScene('Battle');
    const h = window.__SCC2.scene.getScene('Hud');
    let units = b.units.filter(u => u.team === 0 && !u.dead);
    if (units.length < 2) {
      units = [
        b.spawnUnit(0, 'rigger', b.cameras.main.midPoint.x - 40, b.cameras.main.midPoint.y, { arriveReady: true }),
        b.spawnUnit(0, 'rigger', b.cameras.main.midPoint.x + 40, b.cameras.main.midPoint.y, { arriveReady: true })
      ].filter(Boolean);
      await new Promise(r => setTimeout(r, 300));
    }
    if (!units.length) return { err: 'no units' };
    b.controlGroups['1'] = units;
    h.renderGroupBadges([{ n: '1', alive: units.length }]);
    await new Promise(r => setTimeout(r, 120));
    const plate = (h.groupBadgeTxts || []).find(o => o.type === 'Image' && o.texture.key === 'chr-grpbadge');
    return { plate: !!plate, tint: plate ? plate.tintTopLeft.toString(16) : null };
  });
  chk('GRP_BADGE_PLATE', grp.plate === true && grp.tint === '4ea1ff', grp);

  // 5. idle chip plate: pin ALL team-0 workers idle -> visible; kill them -> hidden
  const idle = await p.evaluate(async () => {
    const b = window.__SCC2.scene.getScene('Battle');
    const h = window.__SCC2.scene.getScene('Hud');
    let rs = b.units.filter(u => u.team === 0 && !u.dead && u.def.worker);
    if (rs.length < 1) {
      rs = [
        b.spawnUnit(0, 'rigger', b.cameras.main.midPoint.x, b.cameras.main.midPoint.y + 60, { arriveReady: true }),
        b.spawnUnit(0, 'rigger', b.cameras.main.midPoint.x + 30, b.cameras.main.midPoint.y + 60, { arriveReady: true })
      ].filter(Boolean);
    }
    const dbg = { rsN: rs.length };
    // workers auto-claim harvest orders every frame; force idle semantics
    rs.forEach(u => {
      Object.defineProperty(u, 'order', { get: () => null, set: () => {}, configurable: true });
      Object.defineProperty(u, 'state', { get: () => 'idle', set: () => {}, configurable: true });
    });
    await new Promise(r => setTimeout(r, 800)); // let game loop recompute idleWorkers
    b.players[0].idleWorkers = Math.max(b.players[0].idleWorkers || 0, rs.length); // census runs on AI think cadence; seed it
    h.refresh(); // HUD refresh is event-throttled; nudge it explicitly
    await new Promise(r => setTimeout(r, 200));
    const on = !!h._idlePlate && h._idlePlate.visible && h.idleTxt.visible;
    dbg.idleWorkers = b.players[0].idleWorkers;
    dbg.txt = h.idleTxt ? h.idleTxt.text : null;
    rs.forEach(u => { u.dead = true; if (u.sprite && u.sprite.active) u.sprite.destroy(); });
    b.players[0].idleWorkers = 0;
    h.refresh();
    await new Promise(r => setTimeout(r, 200));
    const off = !!h._idlePlate && !h._idlePlate.visible && !h.idleTxt.visible;
    return { on, off, hasPlate: !!h._idlePlate, dbg };
  }).catch(e => ({ err: String(e) }));
  chk('IDLE_CHIP', idle.hasPlate === true && idle.on === true && idle.off === true, idle);

  const snap = await p.evaluate(() => new Promise(r => window.__SCC2.renderer.snapshot(img => r(img.src))));
  fs.writeFileSync(shot, Buffer.from(snap.split(',')[1], 'base64'));
  chk('ERRORS', errs.length === 0, { errs: errs.slice(0, 5) });
  const fail = out.filter(o => !o.ok);
  console.log(JSON.stringify(out, null, 1));
  console.log(fail.length ? `GATE-V251 FAIL ${out.length - fail.length}/${out.length}` : `GATE-V251 PASS ${out.length}/${out.length}`);
  await b.close();
  process.exit(fail.length ? 1 : 0);
})().catch(e => { console.error('GATE-V251 CRASH', e); process.exit(2); });
