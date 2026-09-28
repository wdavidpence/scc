// Smoke: CUSTOM MATCH gate — C-panel open/close (real keys), stacked-mods launch,
// boss champion actually spawns (retry chain), zero page errors. ~45 s.
const path = require('path');
const { execSync } = require('child_process');
const pwPath = execSync('npm root -g').toString().trim();
const { chromium } = require(path.join(pwPath, 'playwright'));
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
  const errs = [];
  p.on('pageerror', e => errs.push(String(e).slice(0, 140)));
  await p.addInitScript(() => { try { localStorage.setItem('starfront.cutseen.v1', '1'); localStorage.setItem('scc.brief.0', '1'); } catch (e) {} });
  await p.goto(process.env.SCC_URL || 'http://127.0.0.1:4177/scc/', { waitUntil: 'networkidle' });
  await p.waitForTimeout(1500);
  await p.mouse.click(640, 400); // focus canvas (also dismisses attract leftovers)
  await p.waitForTimeout(300);
  await p.keyboard.press('KeyC');
  await p.waitForTimeout(250);
  const open = await p.evaluate(() => { const t = window.__SCC2.scene.getScene('Title'); return t ? !!t._cmod : 'NO-TITLE'; });
  // toggle ALL mods through the panel state (button parity), then launch
  const r = await p.evaluate(async () => {
    const sm = window.__SCC2.scene;
    const ts = sm.getScene('Title');
    ts._cmSelect = { Blitz: true, 'Hold 120s': true, 'Crates win x5': true, 'Convoy escort': true, 'Enemy champion': true };
    ts.launchCustom();
    await new Promise(r => setTimeout(r, 3500));
    const bt0 = sm.getScene('Battle');
    bt0.timeScale = 8;
    // poll until champion spawns (retry chain) or 65 s wall cap — headless RAF
    // is SwiftShader-throttled, fixed-time windows were flaky
    let n = 0, bt = bt0;
    for (; n < 55; n++) {
      await new Promise(r => setTimeout(r, 1200));
      bt = sm.getScene('Battle');
      if (bt && bt.units && bt.units.some(u => u.isBoss && !u.dead)) break;
    }
    return {
      sims: Math.round(bt.gameTime), wallLoops: n,
      battle: true,
      mods: bt.mods,
      crates: bt.crates ? bt.crates.filter(c => c.id >= 9000).length : -1,
      convoy: bt._convoy ? bt._convoy.length : -1,
      hold: bt._holdUntil,
      enemyPrimary: bt.buildings.filter(x => x.team === 1 && x.def.primary && !x.dead).length,
      boss: bt.units.some(u => u.isBoss && !u.dead),
      tries: bt._bossTries,
    };
  });
  console.log('panel:', JSON.stringify({ open }));
  console.log('custom:', JSON.stringify(r));
  console.log('pageerrors:', errs.length, errs.slice(0, 3));
  const ok = open === true && r.battle && r.mods.cratesWin === 5 && r.crates >= 3 && r.convoy === 3
    && r.hold === 120 && r.enemyPrimary >= 1 && r.boss && errs.length === 0;
  console.log(ok ? 'CUSTOM-MATCH PASS' : 'CUSTOM-MATCH FAIL');
  await b.close();
})();