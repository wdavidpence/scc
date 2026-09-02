// v2.17 gate: control-group badges + contents popup + group bark hookup
const PW = '/Users/davidpence/.hermes/node/lib/node_modules/playwright';
const { chromium } = require(PW);
(async () => {
  const browser = await chromium.launch({ headless: false, args: ['--use-gl=angle', '--enable-gpu'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 760 } });
  const errors = [];
  page.on('pageerror', e => errors.push((e.stack || e.message).split('\n').slice(0, 2).join(' | ')));
  await page.goto('http://127.0.0.1:5175/index2.html', { waitUntil: 'load' });
  await page.waitForTimeout(1500);
  // skip cutscenes
  for (let i = 0; i < 6; i++) {
    const closed = await page.evaluate(() => { try { localStorage.setItem('starfront.cutseen.v1', '1'); } catch (e) {} const sm = window.__SCC2?.scene; if (!sm) return false; const s = sm.getScene('Cut'); if (s && s.scene.isActive()) { s.close(); return true; } return false; });
    if (!closed) break;
    await page.waitForTimeout(400);
  }
  await page.keyboard.press('Enter');
  await page.waitForTimeout(1200);
  await page.evaluate(() => { const sm = window.__SCC2.scene; const s = sm.getScene('Cut'); if (s && s.scene.isActive()) s.close(); });
  await page.waitForTimeout(3500);

  // 1) select 3 marines via game API + assign group 2 (Ctrl+2)
  const assigned = await page.evaluate(() => {
    const b = window.__SCC2.scene.getScene('Battle');
    const base = b.buildings.find(x => x.team === 0);
    const spawned = [];
    for (let i = 0; i < 3; i++) spawned.push(b.spawnUnit(0, 'marine', base.x + 60 + i * 24, base.y + 40, { arriveReady: true }));
    b.clearSelection();
    spawned.forEach(u => b.addToSelection(u));
    b.assignGroup(2);
    return { group: (b.controlGroups[2] || []).length, sel: b.selection.size };
  });
  console.log('ASSIGN', JSON.stringify(assigned));
  await page.waitForTimeout(300);

  // 2) badge exists in HUD after assign event
  const badge = await page.evaluate(() => {
    const h = window.__SCC2.scene.getScene('Hud');
    return { hasG: !!h.groupBadgeG, texts: (h.groupBadgeTxts || []).map(t => t.text) };
  });
  console.log('BADGE', JSON.stringify(badge));

  // 3) clear selection, select group via window keyup '2' (keyboard path) -> popup + reselect
  await page.evaluate(() => { window.__SCC2.scene.getScene('Battle').clearSelection(); });
  await page.keyboard.press('Digit2');
  await page.waitForTimeout(250);
  const sel2 = await page.evaluate(() => {
    const b = window.__SCC2.scene.getScene('Battle');
    const h = window.__SCC2.scene.getScene('Hud');
    return {
      sel: b.selection.size,
      popText: h._grpPopT ? h._grpPopT.text : null,
      popAlpha: h._grpPopT ? h._grpPopT.alpha : 0
    };
  });
  console.log('SELECT2', JSON.stringify(sel2));

  // 4) shift+digit assignment through real keyboard events
  await page.evaluate(() => {
    const b = window.__SCC2.scene.getScene('Battle');
    const base = b.buildings.find(x => x.team === 0);
    const z = b.spawnUnit(0, 'zealot', base.x + 200, base.y + 40, { arriveReady: true });
    b.clearSelection(); b.addToSelection(z);
  });
  await page.keyboard.down('Shift'); await page.keyboard.press('Digit5'); await page.keyboard.up('Shift');
  await page.waitForTimeout(250);
  const shiftAssign = await page.evaluate(() => {
    const b = window.__SCC2.scene.getScene('Battle');
    return { g5: (b.controlGroups[5] || []).map(u => u.kind), badgeTexts: (window.__SCC2.scene.getScene('Hud').groupBadgeTxts || []).map(t => t.text) };
  });
  console.log('SHIFT5', JSON.stringify(shiftAssign));

  // 5) kill one marine, re-emit badges -> alive count updates
  const afterDeath = await page.evaluate(() => {
    const b = window.__SCC2.scene.getScene('Battle');
    const m = (b.controlGroups[2] || [])[0];
    m.dead = true;
    b.events.emit('hud:groups', Object.keys(b.controlGroups).map(k => ({ n: k, count: b.controlGroups[k].length })));
    const h = window.__SCC2.scene.getScene('Hud');
    return { texts: (h.groupBadgeTxts || []).map(t => t.text) };
  });
  console.log('AFTER_DEATH', JSON.stringify(afterDeath));

  // screenshot for record
  await page.screenshot({ path: '/Users/davidpence/scc-work/verify/v217-groups.png' });
  console.log('ERRORS', errors.length ? errors.slice(0, 3) : 'NONE');
  await browser.close();
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
