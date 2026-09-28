// Gate: real mouse clicks on Custom Match panel rows + LAUNCH (user-path parity).
const path = require('path');
const { execSync } = require('child_process');
const pwPath = execSync('npm root -g').toString().trim();
const { chromium } = require(path.join(pwPath, 'playwright'));
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
  await p.addInitScript(() => { try { localStorage.setItem('starfront.cutseen.v1', '1'); localStorage.setItem('scc.brief.0', '1'); } catch (e) {} });
  await p.goto(process.env.SCC_URL || 'http://127.0.0.1:4177/scc/', { waitUntil: 'networkidle' });
  await p.waitForTimeout(1500);
  await p.mouse.click(640, 400); await p.waitForTimeout(300);
  await p.keyboard.press('KeyC'); await p.waitForTimeout(300);
  const open = await p.evaluate(() => { const t = window.__SCC2.scene.getScene('Title'); return t ? !!t._cmod : 'NO-TITLE'; });
  if (open !== true) { console.log('CM-CLICK FAIL (panel not open: ' + open + ')'); await b.close(); return; }
  // rows y = 270..438 step 42, launch at 492 (panel math, 800px viewport 1:1)
  for (const y of [270, 312, 354, 396, 438]) { await p.mouse.click(640, y); await p.waitForTimeout(80); }
  const toggled = await p.evaluate(() => ({ ...window.__SCC2.scene.getScene('Title')._cmSelect }));
  await p.mouse.click(640, 492);
  await p.waitForTimeout(2600);
  const r = await p.evaluate(() => {
    const sm = window.__SCC2.scene;
    const bt = sm.getScene('Battle');
    return { battleActive: sm.isActive('Battle'), mods: bt ? bt.mods : null };
  });
  console.log('toggles:', JSON.stringify(toggled));
  console.log('after-launch:', JSON.stringify(r));
  const allOn = Object.values(toggled).every(Boolean);
  const ok = allOn && r.battleActive && r.mods.blitz && r.mods.holdTime === 120 && r.mods.cratesWin === 5 && r.mods.convoy && r.mods.boss === 'custom';
  console.log(ok ? 'CM-CLICK PASS' : 'CM-CLICK FAIL');
  await b.close();
})();