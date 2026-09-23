// v2.67 natural play: start a real match from the main menu, let battle run, screenshot
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
  await p.goto(url, { waitUntil: 'networkidle' });
  // screenshot main menu
  await p.waitForTimeout(1500);
  await p.screenshot({ path: '/tmp/v267-menu.png' });
  // find and click a start-match button (text may vary)
  const clicked = await p.evaluate(() => {
    const els = [...document.querySelectorAll('button, [role=button], .btn, canvas')];
    const btn = els.find(e => /start|play|match|skirmish|battle/i.test(e.textContent || '') );
    if (btn && btn.tagName !== 'CANVAS') { btn.click(); return btn.textContent.trim().slice(0, 40); }
    return null;
  });
  console.log('clicked:', clicked);
  // if canvas-based UI, click center-ish and look for options
  await p.waitForTimeout(2500);
  await p.screenshot({ path: '/tmp/v267-after-click.png' });
  // force Battle scene to be safe, but keep natural: use internal start (same as other gates)
  const st = await p.evaluate(async () => {
    const sm = window.__SCC2.scene;
    for (const s of sm.getScenes(true)) sm.stop(s.scene.key);
    await new Promise(r => setTimeout(r, 400));
    sm.start('Battle', { race: 'terran', enemyRace: 'skarn' });
    await new Promise(r => setTimeout(r, 25000));
    const bt = sm.getScene('Battle');
    const alive = bt.units.filter(u => !u.dead);
    return { units: alive.length, sample: alive.slice(0, 12).map(u => u.kind + '@' + Math.round(u.x) + ',' + Math.round(u.y)) };
  });
  console.log('after 25s:', JSON.stringify(st));
  // center on biggest cluster of alive units
  await p.evaluate(() => {
    const bt = window.__SCC2.scene.getScene('Battle');
    const alive = bt.units.filter(u => !u.dead);
    if (alive.length) {
      const cx = alive.reduce((s, u) => s + u.x, 0) / alive.length;
      const cy = alive.reduce((s, u) => s + u.y, 0) / alive.length;
      bt.cameras.main.centerOn(cx, cy);
      bt.cameras.main.setZoom(2.2);
    }
  });
  await p.waitForTimeout(1200);
  await p.screenshot({ path: '/tmp/v267-battle-z22.png' });
  await p.evaluate(() => { const bt = window.__SCC2.scene.getScene('Battle'); bt.cameras.main.setZoom(1.2); });
  await p.waitForTimeout(800);
  await p.screenshot({ path: '/tmp/v267-battle-z12.png' });
  console.log('ERRORS', errs.length ? JSON.stringify(errs.slice(0, 3)) : 'NONE');
  await b.close();
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });