// v2.49 accent/trail/ghost-grade gate. Prints per-check JSON + GATE-V249 PASS/FAIL.
const path = require('path');
const fs = require('fs');
const pwPath = require('child_process').execSync('npm root -g').toString().trim();
const { chromium } = require(path.join(pwPath, 'playwright'));
(async () => {
  const url = process.env.SCC_URL || 'http://127.0.0.1:4177/scc/';
  const shot = process.env.SHOT || '/tmp/v249_accent.png';
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
    sm.start('Battle', { race: 'skarn', enemyRace: 'terran' });
    sm.start('Hud', { race: 'skarn' });
    await new Promise(r => setTimeout(r, 6000));
    // deploy the player MCV (hive spreads blight -> clawPit-placeable ground)
    const b = window.__SCC2.scene.getScene('Battle');
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

  // 1. race accent textures baked for all 3 races
  const tex = await p.evaluate(() => {
    const h = window.__SCC2.scene.getScene('Hud');
    const keys = ['chr-card-terran', 'chr-card-skarn', 'chr-card-auraxis', 'cur-terran', 'cur-skarn', 'cur-auraxis'];
    return { missing: keys.filter(k => !h.textures.exists(k)) };
  });
  chk('ACCENT_TEX', tex.missing.length === 0, tex);

  // 2. card panel uses the race variant (skarn this run)
  const card = await p.evaluate(() => {
    const h = window.__SCC2.scene.getScene('Hud');
    return { key: h._cardPanel && h._cardPanel.obj ? h._cardPanel.obj.texture.key : null };
  });
  chk('CARD_RACE', card.key === 'chr-card-skarn', card);

  // 3. normal cursor is race-tinted; swaps to cur-attack under attack-move
  await p.mouse.move(700, 400, { steps: 3 });
  await p.waitForTimeout(120);
  const cur = await p.evaluate(async () => {
    const h = window.__SCC2.scene.getScene('Hud');
    const normalTex = h.cur.texture.key;
    const b = window.__SCC2.scene.getScene('Battle');
    b.attackMoveMode = true;
    await new Promise(r => setTimeout(r, 60));
    return { normalTex };
  });
  await p.mouse.move(710, 410, { steps: 2 });
  await p.waitForTimeout(150);
  const cur2 = await p.evaluate(() => {
    const h = window.__SCC2.scene.getScene('Hud');
    const b = window.__SCC2.scene.getScene('Battle');
    const atkTex = h.cur.texture.key;
    b.attackMoveMode = false;
    return { atkTex };
  });
  chk('CUR_RACE_STATE', cur.normalTex === 'cur-skarn' && cur2.atkTex === 'cur-attack', { normalTex: cur.normalTex, atkTex: cur2.atkTex });

  // 4. cursor trail: fast sweeps spawn fading ghost cursors
  for (let i = 0; i < 12; i++) { await p.mouse.move(200 + i * 80, 300 + i * 20); await p.waitForTimeout(40); }
  await p.waitForTimeout(100);
  const trail = await p.evaluate(() => {
    const h = window.__SCC2.scene.getScene('Hud');
    return { live: (h._trail || []).filter(s => s && s.active).length };
  });
  chk('CUR_TRAIL', trail.live >= 2, trail);

  // 5. ghost race-grade: valid placement tints toward skarn accent + additive wash exists
  const gh = await p.evaluate(async () => {
    const b = window.__SCC2.scene.getScene('Battle');
    b.players[0].minerals += 1000;
    let w = b.units.find(u => u.team === 0 && !u.dead && u.def.worker);
    if (!w) { w = b.spawnUnit(0, 'skarling', b.cameras.main.midPoint.x, b.cameras.main.midPoint.y, { arriveReady: true }); await new Promise(r => setTimeout(r, 300)); }
    if (!w) return { err: 'no worker' };
    b.selection.clear(); b.selection.add(w);
    b.startPlacing('clawPit');
    if (!b.placing) return { err: 'cannot place (funds/crew)' };
    // map-wide coarse scan for any valid spot (skarn may need blight terrain)
    let spot = null;
    outer: for (let x = 48; x < 2500; x += 32) for (let y = 48; y < 2500; y += 32) { if (b.placementValid('clawPit', x, y)) { spot = [x, y]; break outer; } }
    if (!spot) return { err: 'no spot', placing: true };
    b.snapGhost({ x: spot[0], y: spot[1] });
    await new Promise(r => setTimeout(r, 120));
    // skarn accent ff7b2e: expect red-dominant tint (r>=180, r>g+40)
    const t = b.ghost.tintTopLeft || b.ghost.tint;
    const r8 = (t >> 16) & 255, g8 = (t >> 8) & 255, bl = t & 255;
    return { ok: b.isValid, tint: t.toString(16), r8, g8, bl, grade: !!b.ghostGrade };
  });
  chk('GHOST_GRADE', gh.ok === true && gh.grade === true && gh.r8 >= 180 && gh.r8 > gh.g8 + 40 && gh.g8 > gh.bl, gh);

  // 6. cancel clears the grade wash
  const cl = await p.evaluate(async () => {
    const b = window.__SCC2.scene.getScene('Battle');
    b.cancelPlacing();
    await new Promise(r => setTimeout(r, 100));
    // graphics has no drawn commands when cleared: bounds empty
    const empty = !b.ghostGrade || b.ghostGrade.commandBuffer.length === 0 || b.ghostGrade.data.length === 0;
    return { empty: !!empty, ghost: !!b.ghost };
  });
  chk('GHOST_CLEAR', cl.empty && !cl.ghost, cl);

  // shot
  const snap = await p.evaluate(() => new Promise(r => window.__SCC2.renderer.snapshot(img => r(img.src))));
  fs.writeFileSync(shot, Buffer.from(snap.split(',')[1], 'base64'));
  chk('ERRORS', errs.length === 0, { errs: errs.slice(0, 5) });
  const fail = out.filter(o => !o.ok);
  console.log(JSON.stringify(out, null, 1));
  console.log(fail.length ? `GATE-V249 FAIL ${out.length - fail.length}/${out.length}` : `GATE-V249 PASS ${out.length}/${out.length}`);
  await b.close();
  process.exit(fail.length ? 1 : 0);
})().catch(e => { console.error('GATE-V249 CRASH', e); process.exit(2); });
