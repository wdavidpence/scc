// v2.18 gate: lurker deep play (reachable, burrow ambush, line splash) + status icons
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
  // force a terran-vs-zerg battle so the AI has a hydralisk den
  await page.evaluate(() => {
    const sm = window.__SCC2.scene;
    const c = sm.getScene('Cut'); if (c && c.scene.isActive()) c.close();
    const t = sm.getScene('Battle');
    if (!t || !t.scene.isActive()) { sm.stop('Title'); sm.start('Battle', { race: 'terran', enemyRace: 'zerg', difficulty: 'normal' }); }
  });
  await page.waitForTimeout(4000);

  const out = {};
  const g = () => page.evaluate(() => window.__SCC2.scene.getScene('Battle'));

  // 1) lurker reachable: AI zerg den canProduce once lurkerEgg researched
  out.reach = await page.evaluate(() => {
    const b = window.__SCC2.scene.getScene('Battle');
    let den = b.buildings.find(x => x.team === 1 && x.buildId === 'hydraliskDen');
    if (!den) { den = new (Object.getPrototypeOf(b.buildings[0]).constructor)(b, 1, 'hydraliskDen', b.buildings.find(x=>x.team===1).x + 100, b.buildings.find(x=>x.team===1).y + 100, { instant: true }); b.buildings.push(den); }
    const before = den.canProduce('lurker');
    b.players[1].techs.lurkerEgg = true;
    const after = den.canProduce('lurker');
    return { den: true, gatedBefore: !before, canAfter: after };
  });

  // 2) player lurker: burrow, root, ambush a hold-fire marine, line-hit a second
  out.ambush = await page.evaluate(async () => {
    const b = window.__SCC2.scene.getScene('Battle');
    const lk = b.spawnUnit(0, 'lurker', 600, 400, { arriveReady: true });
    const m1 = b.spawnUnit(1, 'marine', 600 + 130, 400, { arriveReady: true });   // in lurker range (range6+4 tiles*? check dist)
    const m2 = b.spawnUnit(1, 'marine', 600 + 65, 400, { arriveReady: true });     // mid-line
    m1.stance = 'hold'; m2.stance = 'hold';
    b.clearSelection(); b.addToSelection(lk); b.toggleBurrowSelected();
    const hp0 = [m1.hp, m2.hp];
    await new Promise(r => setTimeout(r, 4500));
    return { burrowed: lk.burrowed, x: Math.round(lk.x), y: Math.round(lk.y), hp0, hpNow: [Math.round(m1.hp), Math.round(m2.hp)] };
  });

  // 3) move order unburrows
  out.unburrow = await page.evaluate(() => {
    const b = window.__SCC2.scene.getScene('Battle');
    const lk = b.units.find(u => u.kind === 'lurker' && !u.dead);
    lk.issueMove(900, 700);
    return { burrowed: lk.burrowed };
  });

  // 4) status icons: stun sparks + stim cross draw without error
  out.icons = await page.evaluate(async () => {
    const b = window.__SCC2.scene.getScene('Battle');
    const m = b.units.find(u => u.team === 0 && !u.dead && u.kind === 'marine') || b.spawnUnit(0, 'marine', 700, 500, { arriveReady: true });
    m.stunTimer = 3; m._stimT = 10;
    await new Promise(r => setTimeout(r, 600));
    return { drew: true, stun: m.stunTimer > 0 };
  });

  // 5) AI actually trains lurkers after tech + money
  out.aiTrain = await page.evaluate(async () => {
    const b = window.__SCC2.scene.getScene('Battle');
    b.players[1].techs.lurkerEgg = true;
    b.players[1].minerals = 3000; b.players[1].gas = 3000;
    b.players[1].supplyCap = 200;
    await new Promise(r => setTimeout(r, 12000));
    const den = b.buildings.find(x => x.team === 1 && x.buildId === 'hydraliskDen');
    return { queue: den ? den.queue.map(q => q.kind) : null, lurkers: b.units.filter(u => u.kind === 'lurker' && u.team === 1 && !u.dead).length };
  });

  await page.screenshot({ path: '/Users/davidpence/scc-work/verify/v218-lurker.png' });
  console.log(JSON.stringify(out, null, 1));
  console.log('ERRORS', errors.length ? errors.slice(0, 4) : 'NONE');
  await browser.close();
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
