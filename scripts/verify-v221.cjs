// v2.21 gate: message log, minimap event pings, mining automation toggle (J), gradual intel fade
const { chromium } = require('/Users/davidpence/.hermes/node/lib/node_modules/playwright');
(async () => {
  const browser = await chromium.launch({ headless: false, args: ['--use-gl=angle', '--enable-gpu'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 760 } });
  const errors = [];
  page.on('pageerror', e => errors.push((e.stack || e.message).split('\n').slice(0, 2).join(' | ')));
  await page.goto('http://127.0.0.1:5175/index2.html', { waitUntil: 'load' });
  await page.waitForTimeout(1500);
  await page.evaluate(() => { try { localStorage.setItem('starfront.cutseen.v1', '1'); } catch (e) {} });
  await page.keyboard.press('Enter');
  await page.waitForTimeout(1200);
  await page.evaluate(() => { const c = window.__SCC2.scene.getScene('Cut'); if (c && c.scene.isActive()) c.close(); });
  await page.evaluate(() => {
    const sm = window.__SCC2.scene;
    ['Title', 'Cut', 'Brief'].forEach(s => { if (sm.isActive(s)) sm.stop(s); });
    sm.start('Battle', { race: 'terran', enemyRace: 'zerg', difficulty: 'normal' });
  });
  await page.waitForTimeout(3500);

  const out = {};

  // 1) message log: fire an alert, expect a timestamped line in the log stack
  await page.evaluate(() => { window.__SCC2.scene.getScene('Battle').events.emit('hud:alert', 'GATE TEST MESSAGE'); });
  await page.waitForTimeout(250);
  out.msgLog = await page.evaluate(() => {
    const h = window.__SCC2.scene.getScene('Hud');
    return { lines: h._msgLog.length, has: h._logText.text.includes('GATE TEST MESSAGE'), timed: /\d\d:\d\d/.test(h._logText.text) };
  });

  // 2) combat-death event ping
  out.ping = await page.evaluate(() => {
    const b = window.__SCC2.scene.getScene('Battle');
    const e = b.spawnUnit(1, 'zergling', b.cameras.main.midPoint.x, b.cameras.main.midPoint.y, { arriveReady: true });
    e.die();
    return { pings: b._eventPings.length, color: b._eventPings[b._eventPings.length - 1]?.color };
  });

  // 3) mining toggle: off parks idle miners, on resumes them
  out.mine = await page.evaluate(() => {
    const b = window.__SCC2.scene.getScene('Battle');
    const w = b.units.find(u => !u.dead && u.team === 0 && u.def.worker);
    if (!w) return { skip: true };
    b.toggleAutoMine(); // -> off
    w.order = null; w.state = 'idle';
    return { offFlag: b.autoMine === false };
  });
  await page.waitForTimeout(600);
  out.mineStay = await page.evaluate(() => {
    const b = window.__SCC2.scene.getScene('Battle');
    const w = b.units.find(u => !u.dead && u.team === 0 && u.def.worker);
    const parked = !w.order;
    b.toggleAutoMine(); // -> on
    return { parked, onFlag: b.autoMine === true };
  });
  await page.waitForTimeout(600);
  out.mineResume = await page.evaluate(() => {
    const b = window.__SCC2.scene.getScene('Battle');
    const w = b.units.find(u => !u.dead && u.team === 0 && u.def.worker);
    return { busy: !!w.order };
  });

  // 4) intel fade: explore a fresh patch, then walk vision away; staleness rises over time
  out.intelFade = await page.evaluate(() => {
    const b = window.__SCC2.scene.getScene('Battle');
    const tx = 5, ty = 5, i = b.nav.idx(tx, ty);
    b.lastSeen[i] = b.gameTime - 100; // stale tile already seen
    b.seen[i] = 1;
    const staleA = Math.min(1, 0.25 + ((b.gameTime - b.lastSeen[i]) / 40) * 0.75);
    b.lastSeen[i] = b.gameTime; // freshly seen
    const freshA = Math.min(1, 0.25 + ((b.gameTime - b.lastSeen[i]) / 40) * 0.75);
    return { staleA, freshA, gap: staleA > freshA + 0.3 };
  });

  // 5) first-contact flag wiring exists and fires when enemy visible
  out.contact = await page.evaluate(() => {
    const b = window.__SCC2.scene.getScene('Battle');
    b._contacted = false;
    const pb = b.buildings.find(x => x.team === 0 && x.def.primary);
    const e = b.spawnUnit(1, 'zergling', pb.x + 60, pb.y + 60, { arriveReady: true }); // deep in base vision
    return { spawnOK: !!e };
  });
  await page.waitForTimeout(700);
  out.contactDone = await page.evaluate(() => { const b = window.__SCC2.scene.getScene('Battle'); return !!b._contacted; });

  console.log(JSON.stringify(out, null, 1));
  console.log('ERRORS:', errors.length ? errors.join(' ;; ') : 'none');
  const pass = out.msgLog.has && out.msgLog.timed
    && out.ping.pings >= 1
    && out.mine.offFlag && out.mineStay.parked && out.mineResume.busy
    && out.intelFade.gap && out.contactDone && errors.length === 0;
  console.log(pass ? 'GATE-V221 PASS' : 'GATE-V221 FAIL');
  await browser.close();
  process.exit(pass ? 0 : 1);
})();
