// Focused probe: bunker garrison fire + medic heal, deterministic positions.
const PW = '/Users/davidpence/.hermes/node/lib/node_modules/playwright';
const { chromium } = require(PW);

(async () => {
  const browser = await chromium.launch({ headless: false, args: ['--use-gl=angle', '--enable-gpu'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 760 } });
  const errors = [];
  page.on('pageerror', e => errors.push((e.stack || e.message).split('\n').slice(0, 3).join(' | ')));
  await page.goto('http://127.0.0.1:5175/index2.html', { waitUntil: 'load' });
  await page.waitForTimeout(2200);
  await page.evaluate(() => {
    window.__SCC2.scene.stop('Title');
    window.__SCC2.scene.start('Battle', { race: 'terran', enemyRace: 'zerg', difficulty: 'easy',
      mission: { n: 1, name: 'PROBE', enemy: 'zerg', difficulty: 'easy', bonusMinerals: 200, brief: 'probe', mods: {} } });
  });
  await page.waitForTimeout(4000);

  const setup = await page.evaluate(() => {
    const b = window.__SCC2.scene.getScene('Battle');
    const TILE = 32;
    const base = b.buildings.find(x => x.team === 0);
    b.cameras.main.centerOn(base.x, base.y);
    const Bcls = Object.getPrototypeOf(base).constructor;
    const bk = new Bcls(b, 0, 'bunker', base.x + 200, base.y, { instant: true });
    b.buildings.push(bk);
    const m = b.spawnUnit(0, 'marine', base.x + 210, base.y + 10, { arriveReady: true });
    b.garrisonInto(bk, m);
    // enemy zergling placed inside bunker range (6 tiles = 192px)
    const foe = b.spawnUnit(1, 'zergling', base.x + 200 + 120, base.y + 40, { arriveReady: true });
    foe.setOrder({ type: 'move', point: { x: foe.x, y: foe.y } }); // pin it
    return { gar: bk.garrison.length, foeHp: foe.hp, foeX: foe.x, bkX: bk.x, rangeTiles: bk.def.garrisonDefense.range, tile: TILE };
  });
  console.log('SETUP', JSON.stringify(setup));
  await page.waitForTimeout(5000);
  const after = await page.evaluate(() => {
    const b = window.__SCC2.scene.getScene('Battle');
    const bk = b.buildings.find(x => x.buildId === 'bunker' && !x.dead);
    const foe = b.units.find(u => u.team === 1 && !u.dead && !u.def.worker);
    const live = b.units.filter(u => u.team === 1).map(u => ({ k: u.kind, hp: Math.round(u.hp) }));
    return { foeHp: foe ? Math.round(foe.hp) : 'dead', live, gar: bk ? bk.garrison.length : -1 };
  });
  console.log('BUNKERFIRE', JSON.stringify(after));

  // medic heal on the garrisoned... no — emerge a marine, hurt it, heal it
  const heal = await page.evaluate(() => {
    const b = window.__SCC2.scene.getScene('Battle');
    const base = b.buildings.find(x => x.team === 0);
    const med = b.spawnUnit(0, 'medic', base.x + 60, base.y + 60, { arriveReady: true });
    const m = b.units.find(u => u.kind === 'marine' && !u.dead && !u.loaded);
    const mm = m || b.spawnUnit(0, 'marine', base.x + 100, base.y + 80, { arriveReady: true });
    mm.hp = 20;
    med.setOrder({ type: 'heal', target: mm });
    return { started: med.order?.type, hp: Math.round(mm.hp), mid: mm.id, medKind: med.kind };
  });
  console.log('HEAL_SETUP', JSON.stringify(heal));
  await page.waitForTimeout(5000);
  const heal2 = await page.evaluate(() => {
    const b = window.__SCC2.scene.getScene('Battle');
    const med = b.units.find(u => u.kind === 'medic' && !u.dead);
    const mm = b.units.find(u => u.kind === 'marine' && !u.dead);
    return { medOrder: med ? med.order?.type : 'dead', medState: med ? med.state : '-', mmHp: mm ? Math.round(mm.hp) : 'dead', mmMax: mm ? mm.maxHp : -1 };
  });
  console.log('HEAL_AFTER', JSON.stringify(heal2));
  console.log('ERRORS', errors.length ? errors.slice(0, 4) : 'NONE');
  await browser.close();
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
