// Smoke: briefing card — first play shows, replay skips (persisted), ESC dismisses.
const path = require('path');
const { execSync } = require('child_process');
const pwPath = execSync('npm root -g').toString().trim();
const { chromium } = require(path.join(pwPath, 'playwright'));
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
  const errs = [];
  p.on('pageerror', e => errs.push(String(e).slice(0, 120)));
  await p.goto(process.env.SCC_URL || 'http://127.0.0.1:4177/scc/', { waitUntil: 'networkidle' });
  await p.waitForTimeout(800);
  const M = { n: 9, name: 'SMOKE OPS', brief: 'Test briefing line.' };
  const first = await p.evaluate(async (m) => {
    try { localStorage.removeItem('scc.brief.9'); } catch (e) {}
    const sm = window.__SCC2.scene;
    sm.start('Battle', { race: 'terran', enemyRace: 'skarn', mission: m });
    await new Promise(r => setTimeout(r, 2500));
    const bt = sm.getScene('Battle');
    return { cardShown: !!bt.__briefCont, marker: localStorage.getItem('scc.brief.9') };
  }, M);
  await p.keyboard.press('Escape');
  await p.waitForTimeout(300);
  const dismissed = await p.evaluate(() => {
    const bt = window.__SCC2.scene.getScene('Battle');
    return { cardGone: !bt.__briefCont };
  });
  const second = await p.evaluate(async (m) => {
    const sm = window.__SCC2.scene;
    sm.stop('Battle'); sm.stop('Hud');
    sm.start('Battle', { race: 'terran', enemyRace: 'skarn', mission: m });
    await new Promise(r => setTimeout(r, 2500));
    const bt = sm.getScene('Battle');
    return { cardSkipped: !bt.__briefCont, alive: bt.scene.isActive() };
  }, M);
  console.log('first:', JSON.stringify(first));
  console.log('esc-dismiss:', JSON.stringify(dismissed));
  console.log('replay:', JSON.stringify(second));
  console.log('pageerrors:', errs.length, errs.slice(0, 3));
  const ok = first.cardShown && first.marker === '1' && dismissed.cardGone && second.cardSkipped && errs.length === 0;
  console.log(ok ? 'BRIEF-SKIP PASS' : 'BRIEF-SKIP FAIL');
  await b.close();
})();
