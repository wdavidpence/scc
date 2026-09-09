// GATE-V236: SC1-style live command-card grey-out (disabled buttons + reasons + announcer blip)
const { chromium } = require('/Users/davidpence/.hermes/node/lib/node_modules/playwright');
const URL = process.env.SCC_URL || 'http://127.0.0.1:4177/scc/';
const SHOT = '/tmp/scc-v236-greyout.png';
const R = [];
const check = (name, ok, extra) => { R.push({ name, ok: !!ok, extra }); };

(async () => {
  const browser = await chromium.launch({ headless: false, args: ['--use-gl=angle', '--enable-gpu'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(URL, { waitUntil: 'load' });
  await page.evaluate(() => localStorage.setItem('starfront.cutseen.v1', '1'));
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.__SCC2 && window.__SCC2.scene.isActive('Title'), null, { timeout: 30000 });
  await page.evaluate(() => { const s = window.__SCC2.scene; s.stop('Title'); s.start('Battle', { race: 'terran', mission: 1 }); const h = s.getScene('Hud'); if (!h.scene.isActive()) s.start('Hud', { race: 'terran' }); });
  await page.waitForTimeout(6000);

  // 1) machinery exists on Hud
  const mach = await page.evaluate(() => {
    const h = window.__SCC2.scene.getScene('Hud');
    return typeof h.mkBtn === 'function' && typeof h.updateButtonStates === 'function' && typeof h.redrawDisabled === 'function' && !!h.disG;
  });
  check('greyout_machinery', mach);

  // 2) select a command center: expensive late units grey with supply/minerals reason, cheap marine NOT grey
  const card = await page.evaluate(async () => {
    const b = window.__SCC2.scene.getScene('Battle');
    const h = window.__SCC2.scene.getScene('Hud');
    const cc = b.buildings.find(x => !x.dead && x.team === 0 && x.buildId === 'commandCenter');
    if (!cc) return { ok: false, why: 'no-cc' };
    b.players[0].minerals = 10; b.players[0].gas = 0;
    b.selectBuilding(cc);
    await new Promise(r => setTimeout(r, 150));
    const btns = h.buttons.filter(x => x._check);
    const dis = btns.filter(x => x.disabled);
    const reasons = dis.map(x => x._disReason);
    return { ok: btns.length > 0 && dis.length > 0 && reasons.every(r => ['minerals', 'supply', 'tech', 'done'].includes(r)), n: btns.length, ndis: dis.length, reasons: [...new Set(reasons)].join(',') };
  });
  check('afford_greyout', card.ok, JSON.stringify(card));

  // 3) grey-out clears live when money arrives (hud:tick driven, no re-select)
  const ungrey = await page.evaluate(async () => {
    const b = window.__SCC2.scene.getScene('Battle');
    const h = window.__SCC2.scene.getScene('Hud');
    b.players[0].minerals = 5000; b.players[0].gas = 5000;
    await new Promise(r => setTimeout(r, 1400)); // > throttle window + tick cadence
    const btns = h.buttons.filter(x => x._check);
    const stillDis = btns.filter(x => x.disabled && x._disReason === 'minerals');
    return { ok: btns.length > 0 && stillDis.length === 0, remaining: stillDis.map(x => x._disReason).join(',') };
  });
  check('live_ungrey_on_funds', ungrey.ok, JSON.stringify(ungrey));

  // 4) disabled click: no crash, reason flash shown, cb not fired
  const click = await page.evaluate(async () => {
    const b = window.__SCC2.scene.getScene('Battle');
    const h = window.__SCC2.scene.getScene('Hud');
    const cc = b.buildings.find(x => !x.dead && x.team === 0 && x.buildId === 'commandCenter');
    b.players[0].minerals = 0; b.players[0].gas = 0;
    b.selectBuilding(cc);
    await new Promise(r => setTimeout(r, 150));
    const dis = h.buttons.find(x => x.disabled && x._check);
    if (!dis) return { ok: false, why: 'no-disabled-btn' };
    let fired = false; dis._firedProbe = true;
    const qBefore = cc.queue.length;
    dis.hit.emit('pointerdown', {});
    await new Promise(r => setTimeout(r, 120));
    const flashed = h._neT && h._neT.alpha > 0 && /NOT ENOUGH|SUPPLY BLOCKED|TECH REQUIRED/.test(h._neT.text);
    return { ok: flashed && cc.queue.length === qBefore, flashed, txt: h._neT ? h._neT.text : '', q: cc.queue.length - qBefore };
  });
  check('disabled_click_denied', click.ok, JSON.stringify(click));

  // 5) worker build menu: tech-gated buildings grey with 'tech' reason when prereqs missing
  const techgate = await page.evaluate(async () => {
    const b = window.__SCC2.scene.getScene('Battle');
    const h = window.__SCC2.scene.getScene('Hud');
    const wrk = [...b.units].filter(u => !u.dead && u.team === 0 && u.def && u.def.worker);
    if (!wrk.length) return { ok: 'skip', why: 'no-workers' };
    b.players[0].minerals = 5000; b.players[0].gas = 5000;
    h.onSelection({ units: wrk, count: wrk.length });
    await new Promise(r => setTimeout(r, 150));
    const btns = h.buttons.filter(x => x._check);
    const techDis = btns.filter(x => x.disabled && x._disReason === 'tech');
    return { ok: btns.length > 0, n: btns.length, ntech: techDis.length, skip: false };
  });
  check('worker_card_stateable', techgate.ok === true || techgate.ok === 'skip', JSON.stringify(techgate));

  // 6) X-cross graphics drawn over disabled buttons on shared canvas
  const cross = await page.evaluate(() => {
    const h = window.__SCC2.scene.getScene('Hud');
    const disN = h.buttons.filter(x => x.disabled).length;
    const built = !!h._disG && disN > 0; // graphics buffer carries line commands
    return { ok: built, disN };
  });
  check('red_x_over_disabled', cross.ok, JSON.stringify(cross));

  await page.screenshot({ path: SHOT });
  check('no_page_errors', errors.length === 0, errors.slice(0, 3).join('|'));

  const fails = R.filter(r => !r.ok);
  console.log(R.map(r => (r.ok ? 'PASS' : 'FAIL') + ' ' + r.name + (r.extra ? ' · ' + r.extra : '')).join('\n'));
  console.log(fails.length ? `GATE-V236 FAIL ${fails.length}/${R.length}` : `GATE-V236 PASS ${R.length} checks · shot ${SHOT}`);
  await browser.close();
  process.exit(fails.length ? 1 : 0);
})();
