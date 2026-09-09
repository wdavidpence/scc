// GATE-V235B: animated portrait busts (gap 27) + staged rubble (gap 94) + damage tell (gap 95)
const { chromium } = require('/Users/davidpence/.hermes/node/lib/node_modules/playwright');
const URL = process.env.SCC_URL || 'http://127.0.0.1:4177/scc/';
const SHOT = '/tmp/scc-v235b-portraits.png';
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

  // 1) staged rubble + smoke textures registered
  const rubTex = await page.evaluate(() => {
    const b = window.__SCC2.scene.getScene('Battle');
    return b.textures.exists('rubble-fresh') && b.textures.exists('rubble') && b.textures.exists('rubble-ash') && b.textures.exists('smoke');
  });
  check('staged_rubble_textures', rubTex);

  // 2) spawn marines (have walk frames) + select -> bust sprites spawn in Hud
  const bust = await page.evaluate(async () => {
    const b = window.__SCC2.scene.getScene('Battle');
    const h = window.__SCC2.scene.getScene('Hud');
    const m1 = b.spawnUnit(0, 'marine', 420, 420, { arriveReady: true });
    const m2 = b.spawnUnit(0, 'marine', 440, 420, { arriveReady: true });
    const mine = [m1, m2].filter(Boolean);
    if (!mine.length) return { n: -1 };
    h.onSelection({ units: mine, count: mine.length });
    await new Promise(r => setTimeout(r, 300));
    return { n: h._busts ? h._busts.length : -2, tex: h._busts && h._busts[0] ? h._busts[0].sp.texture.key : '' };
  });
  check('busts_spawn_on_select', bust.n > 0, JSON.stringify(bust));

  // 3) bust frames cycle
  const cycle = await page.evaluate(async () => {
    const h = window.__SCC2.scene.getScene('Hud');
    if (!h._busts || !h._busts.length) return { ok: false };
    const t0 = h._busts[0].sp.texture.key;
    await new Promise(r => setTimeout(r, 1100));
    const t1 = h._busts[0].sp.texture.key;
    return { ok: t0 !== t1, t0, t1 };
  });
  check('bust_frame_cycle', cycle.ok, JSON.stringify(cycle));

  // 4) damage tell: red flash tint applied then cleared
  const dmg = await page.evaluate(async () => {
    const b = window.__SCC2.scene.getScene('Battle');
    const u = b.units.find(x => !x.dead && x.team === 0);
    if (!u) return { ok: false, why: 'no-unit' };
    u._dmgTinting = false; // reset any in-flight flash from combat
    u.takeDamage(5, null);
    const hasFlash = u._dmgFlashUntil > performance.now() - 50;
    const tinted = u.sprite.tintTopLeft !== 16777215;
    await new Promise(r => setTimeout(r, 250));
    const cleared = u.sprite.tintTopLeft === 16777215 || u._tinted;
    return { ok: hasFlash && tinted && cleared, hasFlash, tinted, cleared, tint: u.sprite.tintTopLeft, dead: u.dead };
  });
  check('damage_flash_tell', dmg.ok, JSON.stringify(dmg));

  // 5) enemy building death -> fresh rubble image on battlefield
  const rub = await page.evaluate(async () => {
    const b = window.__SCC2.scene.getScene('Battle');
    const bd = b.buildings.find(x => !x.dead && x.team === 1);
    if (!bd) { // spawn one
      const nb = b.spawnBuilding && b.spawnBuilding(1, 'rally', 600, 400);
      if (!nb) return 'no-building';
    }
    const target = b.buildings.find(x => !x.dead && x.team === 1);
    target.hp = 1; target.shield = 0;
    target.takeDamage(50, null);
    await new Promise(r => setTimeout(r, 400));
    return b.children.list.some(c => c.active && c.texture && c.texture.key === 'rubble-fresh');
  });
  check('building_death_fresh_rubble', rub === true, String(rub));

  // 6) rubble stage transitions texture over time (fresh -> burning within ~7s of the kill above)
  const stage = await page.evaluate(async () => {
    const b = window.__SCC2.scene.getScene('Battle');
    await new Promise(r => setTimeout(r, 6500));
    return b.children.list.some(c => c.active && c.texture && c.texture.key === 'rubble');
  });
  check('rubble_stage2_collapse', stage);

  await page.screenshot({ path: SHOT });
  check('no_page_errors', errors.length === 0, errors.slice(0, 3).join('|'));

  const fails = R.filter(r => !r.ok);
  console.log(R.map(r => (r.ok ? 'PASS' : 'FAIL') + ' ' + r.name + (r.extra ? ' · ' + r.extra : '')).join('\n'));
  console.log(fails.length ? `GATE-V235B FAIL ${fails.length}/${R.length}` : `GATE-V235B PASS ${R.length} checks · shot ${SHOT}`);
  await browser.close();
  process.exit(fails.length ? 1 : 0);
})();
