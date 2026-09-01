// Probe: medic auto-heal micro, AI drop ops, expanded tutorial ladder.
const PW = '/Users/davidpence/.hermes/node/lib/node_modules/playwright';
const { chromium } = require(PW);

(async () => {
  const browser = await chromium.launch({ headless: false, args: ['--use-gl=angle', '--enable-gpu'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 760 } });
  const errors = [];
  page.on('pageerror', e => errors.push((e.stack || e.message).split('\n').slice(0, 3).join(' | ')));
  await page.goto('http://127.0.0.1:5175/index2.html', { waitUntil: 'load' });
  await page.waitForTimeout(2200);

  // --- tutorial ladder (Terran, free) ---
  await page.evaluate(() => {
    window.__SCC2.scene.stop('Title');
    window.__SCC2.scene.start('Battle', { race: 'terran', enemyRace: 'zerg', difficulty: 'easy', tutorial: true });
  });
  await page.waitForTimeout(3500);
  const tut = await page.evaluate(() => {
    const b = window.__SCC2.scene.getScene('Battle');
    return { steps: b.tut ? b.tut.steps.length : 0, text: b.tut ? b.tut.text.text.slice(0, 60) : 'none', res: Math.round(b.players[0].minerals) };
  });
  console.log('TUTORIAL', JSON.stringify(tut));

  // simulate garrison step: build bunker instantly + garrison a marine -> step 5 advances
  const tut2 = await page.evaluate(() => {
    const b = window.__SCC2.scene.getScene('Battle');
    const base = b.buildings.find(x => x.team === 0);
    const Bcls = Object.getPrototypeOf(base).constructor;
    const bk = new Bcls(b, 0, 'bunker', base.x + 120, base.y + 60, { instant: true });
    b.buildings.push(bk);
    const m = b.spawnUnit(0, 'marine', base.x + 130, base.y + 70, { arriveReady: true });
    b.garrisonInto(bk, m);
    return { i: b.tut.i };
  });
  await page.waitForTimeout(800);
  const tut3 = await page.evaluate(() => {
    const b = window.__SCC2.scene.getScene('Battle');
    return { i: b.tut.i, text: b.tut.text.text.slice(0, 70) };
  });
  console.log('TUT_GARRISON_STEP', JSON.stringify({ before: tut2.i, ...tut3 }));

  // --- medic auto-heal micro ---
  await page.evaluate(() => {
    window.__SCC2.scene.stop('Battle');
    window.__SCC2.scene.start('Battle', { race: 'terran', enemyRace: 'zerg', difficulty: 'easy' });
  });
  await page.waitForTimeout(3500);
  const ah = await page.evaluate(() => {
    const b = window.__SCC2.scene.getScene('Battle');
    const base = b.buildings.find(x => x.team === 0);
    const med = b.spawnUnit(0, 'medic', base.x + 40, base.y + 40, { arriveReady: true });
    const m = b.spawnUnit(0, 'marine', base.x + 150, base.y + 90, { arriveReady: true });
    m.hp = m.maxHp * 0.3;
    med.setOrder({ type: 'stop' }); med.order = null; med.state = 'idle'; // force idle path
    return { medOrder: med.order, medState: med.state, hp: Math.round(m.hp) };
  });
  console.log('AUTOHEAL_SETUP', JSON.stringify(ah));
  await page.waitForTimeout(4000);
  const ah2 = await page.evaluate(() => {
    const b = window.__SCC2.scene.getScene('Battle');
    const med = b.units.find(u => u.kind === 'medic' && !u.dead);
    const m = b.units.find(u => u.kind === 'marine' && !u.dead);
    return { medOrder: med ? med.order?.type : 'dead', hp: m ? Math.round(m.hp) : -1 };
  });
  console.log('AUTOHEAL_AFTER', JSON.stringify(ah2));

  // --- AI drop ops: fast-forward an AI terran vs zerg... player terran fights AI zerg (no drops);
  // instead run enemy=terran and drive AI think with a loaded dropship scenario ---
  await page.evaluate(() => {
    window.__SCC2.scene.stop('Battle');
    window.__SCC2.scene.start('Battle', { race: 'zerg', enemyRace: 'terran', difficulty: 'normal' });
  });
  await page.waitForTimeout(3500);
  const drop = await page.evaluate(() => {
    const b = window.__SCC2.scene.getScene('Battle');
    // stage: AI terran dropship near its base with infantry, time > 150
    const ebase = b.buildings.find(x => x.team === 1);
    const ds = b.spawnUnit(1, 'dropship', ebase.x - 100, ebase.y + 60, { arriveReady: true });
    for (let i = 0; i < 4; i++) b.spawnUnit(1, 'marine', ebase.x - 80 + i * 20, ebase.y + 80, { arriveReady: true });
    const victim = b.units.find(u => u.team === 0 && u.def.worker);
    b.gameTime = 200;
    // reveal player workers so AI can target them
    if (victim) { const c = b.cameras.main; c.centerOn(victim.x, victim.y); }
    b.aiState.lastSeenPlayerPos = victim ? { x: victim.x, y: victim.y } : null;
    return { ds: !!ds, victim: !!victim };
  });
  console.log('AI_DROP_SETUP', JSON.stringify(drop));
  await page.waitForTimeout(6000);
  const drop2 = await page.evaluate(() => {
    const b = window.__SCC2.scene.getScene('Battle');
    const ds = b.units.find(u => u.kind === 'dropship' && u.team === 1 && !u.dead);
    return { order: ds ? ds.order?.type : 'dead', carry: ds ? ds.carry.length : -1, at: ds ? [Math.round(ds.x), Math.round(ds.y)] : null };
  });
  console.log('AI_DROP', JSON.stringify(drop2));
  await page.waitForTimeout(8000);
  const drop3 = await page.evaluate(() => {
    const b = window.__SCC2.scene.getScene('Battle');
    const ds = b.units.find(u => u.kind === 'dropship' && u.team === 1 && !u.dead);
    const enemyMarines = b.units.filter(u => u.kind === 'marine' && u.team === 1 && !u.dead);
    return { carry: ds ? ds.carry.length : 'dead', droppedFlag: !!b._droppedOnce, marinesOnMap: enemyMarines.length };
  });
  console.log('AI_DROP_DONE', JSON.stringify(drop3));
  await page.screenshot({ path: '/Users/davidpence/scc-work/verify/ai-drop.png' });
  console.log('ERRORS', errors.length ? errors.slice(0, 4) : 'NONE');
  await browser.close();
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
