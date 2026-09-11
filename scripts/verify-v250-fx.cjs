// v2.50 accent FX gate: rally flag race cloth, build-complete bloom, minimap brackets.
// Prints per-check JSON + GATE-V250 PASS/FAIL, exit code reflects result.
const path = require('path');
const fs = require('fs');
const pwPath = require('child_process').execSync('npm root -g').toString().trim();
const { chromium } = require(path.join(pwPath, 'playwright'));
(async () => {
  const url = process.env.SCC_URL || 'http://127.0.0.1:4177/scc/';
  const shot = process.env.SHOT || '/tmp/v250_fx.png';
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

  // 1. minimap corner brackets drawn in terran accent (0x4ea1ff)
  const mm = await p.evaluate(() => {
    const h = window.__SCC2.scene.getScene('Hud');
    return { has: !!h.mmBrackets && h.mmBrackets.active, acc: h.mmAcc };
  });
  chk('MM_BRACKETS', mm.has === true && mm.acc === 0x4ea1ff, mm);

  // 2. rally flag on deployed CC: cloth = terran accent + additive glow child
  const rf = await p.evaluate(() => {
    const b = window.__SCC2.scene.getScene('Battle');
    const cc = b.buildings.find(x => x.team === 0 && !x.dead && x.def.primary);
    if (!cc) return { err: 'no cc' };
    if (!cc.rallyPoint) cc.rallyPoint = { x: cc.x, y: cc.y + 40 };
    b.showRallyFlag(cc);
    const kids = cc._rallyFlag.list;
    const tri = kids.find(k => k.type === 'Triangle');
    return { flag: !!cc._rallyFlag, cloth: tri ? tri.fillColor : null, kids: kids.length };
  });
  chk('RALLY_FLAG_ACCENT', rf.flag === true && rf.cloth === 0x4ea1ff && rf.kids >= 3, rf);

  // 3. build-complete accent bloom: call the FX channel directly with terran accent,
  //    count additive bloom circles spawned (fake objects never enter onBuildingComplete)
  const bc = await p.evaluate(async () => {
    const b = window.__SCC2.scene.getScene('Battle');
    const before = b.children.list.filter(c => c.active).length;
    b.polish.buildCompleteFX(b.cameras.main.midPoint.x, b.cameras.main.midPoint.y, true, 0x4ea1ff);
    await new Promise(r => setTimeout(r, 150));
    const ADD = 1; // Phaser.BlendModes.ADD
    const blooms = b.children.list.filter(c => c.active && c.blendMode === ADD).length;
    return { grew: b.children.list.filter(c => c.active).length > before, blooms };
  });
  chk('BUILD_BLOOM_ACCENT', bc.grew === true && bc.blooms >= 1, bc);

  // 4. rally flag destroyed with the building (teardown still clean)
  const td = await p.evaluate(async () => {
    const b = window.__SCC2.scene.getScene('Battle');
    const cc = b.buildings.find(x => x.team === 0 && !x.dead && x.def.primary);
    if (!cc) return { err: 'no cc' };
    cc.takeDamage(999999, null);
    await new Promise(r => setTimeout(r, 400));
    return { flag: !!cc._rallyFlag, dead: !!cc.dead };
  });
  chk('RALLY_TEARDOWN', td.flag === false, td);

  // 5. strategic zoom redraws brackets without crash
  await p.mouse.move(1300, 120);
  try { await p.mouse.wheel(0, -200); } catch (e) { await p.mouse.wheel({ deltaY: -200 }); }
  await p.waitForTimeout(250);
  const mm2 = await p.evaluate(() => {
    const h = window.__SCC2.scene.getScene('Hud');
    return { size: h.mmSize, brackets: !!h.mmBrackets && h.mmBrackets.active };
  });
  chk('MM_BRACKET_ZOOM', mm2.brackets === true && mm2.size > 120, mm2);

  await p.waitForTimeout(300);
  const snap = await p.evaluate(() => new Promise(r => window.__SCC2.renderer.snapshot(img => r(img.src))));
  fs.writeFileSync(shot, Buffer.from(snap.split(',')[1], 'base64'));
  chk('ERRORS', errs.length === 0, { errs: errs.slice(0, 5) });
  const fail = out.filter(o => !o.ok);
  console.log(JSON.stringify(out, null, 1));
  console.log(fail.length ? `GATE-V250 FAIL ${out.length - fail.length}/${out.length}` : `GATE-V250 PASS ${out.length}/${out.length}`);
  await b.close();
  process.exit(fail.length ? 1 : 0);
})().catch(e => { console.error('GATE-V250 CRASH', e); process.exit(2); });
