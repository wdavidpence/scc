// Drop-play smoke: dropship load/unload, bunker garrison/fire, medic heal,
// splash falloff, camera inertia, scout alert, missions ladder — on src2 dev server.
const PW = '/Users/davidpence/.hermes/node/lib/node_modules/playwright';
const { chromium } = require(PW);

(async () => {
  const browser = await chromium.launch({ headless: false, args: ['--use-gl=angle', '--enable-gpu'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 760 } });
  const errors = [];
  page.on('pageerror', e => errors.push((e.stack || e.message).split('\n').slice(0, 3).join(' | ')));
  await page.goto('http://127.0.0.1:5175/index2.html', { waitUntil: 'load' });
  await page.waitForTimeout(2500);
  const boot = await page.evaluate(() => {
    const g = window.__SCC2;
    if (!g) return 'NOGAME';
    const t = g.scene.getScene('Title');
    return t && t.scene.isActive() ? 'TITLE_OK' : 'NO_TITLE';
  });
  console.log('BOOT', boot);

  await page.evaluate(() => {
    window.__SCC2.scene.stop('Title');
    window.__SCC2.scene.start('Battle', { race: 'terran', enemyRace: 'zerg', difficulty: 'normal',
      mission: { n: 9, name: 'GHOST PROTOCOL', enemy: 'terran', difficulty: 'hard', bonusMinerals: 100, brief: 'drop test', mods: { holdTime: 180, boss: 'ghost' } } });
  });
  await page.waitForTimeout(4500);

  // Drive the systems programmatically at the BattleScene API level
  const r1 = await page.evaluate(() => {
    const b = window.__SCC2.scene.getScene('Battle');
    const base = b.buildings.find(x => x.team === 0);
    // spawn dropship + marines + bunker + medic near base
    const ds = b.spawnUnit(0, 'dropship', base.x + 100, base.y + 60);
    const m1 = b.spawnUnit(0, 'marine', base.x + 140, base.y + 80);
    const m2 = b.spawnUnit(0, 'marine', base.x + 150, base.y + 90);
    const med = b.spawnUnit(0, 'medic', base.x + 120, base.y + 70);
    return { ds: !!ds && ds.def.transport, m: !!m1 && !!m2, med: !!med && !!med.def.heal };
  });
  console.log('SPAWN', JSON.stringify(r1));

  // bunker: place via API
  const r2 = await page.evaluate(() => {
    const b = window.__SCC2.scene.getScene('Battle');
    const base = b.buildings.find(x => x.team === 0);
    const Bcls = Object.getPrototypeOf(base).constructor;
    const bk = new Bcls(b, 0, 'bunker', base.x - 120, base.y + 40, { instant: true });
    b.buildings.push(bk);
    return { ok: !!bk, id: bk.buildId, built: bk.built };
  });
  console.log('BUNKER', JSON.stringify(r2));

  // load marines into dropship via right-click path (simulate selection+rightClickOrder at dropship pos)
  const r3 = await page.evaluate(() => {
    const b = window.__SCC2.scene.getScene('Battle');
    const ds = b.units.find(u => u.kind === 'dropship');
    const ms = b.units.filter(u => u.kind === 'marine');
    b.clearSelection();
    ms.forEach(m => b.selection.add(m));
    b.rightClickOrder({ x: ds.x, y: ds.y }, false);
    return { carry: ds.carry.length, loaded: ms.every(m => m.loaded || m.dead) };
  });
  console.log('LOAD', JSON.stringify(r3));

  // send dropship forward and unload
  const r4 = await page.evaluate(() => {
    const b = window.__SCC2.scene.getScene('Battle');
    const ds = b.units.find(u => u.kind === 'dropship');
    const base = b.buildings.find(x => x.team === 0);
    ds.setOrder({ type: 'unload', point: { x: base.x + 500, y: base.y + 200 } });
    return { order: ds.order?.type, unloadAt: !!ds.unloadAt };
  });
  console.log('UNLOAD_ORDER', JSON.stringify(r4));
  await page.waitForTimeout(9000);
  const r5 = await page.evaluate(() => {
    const b = window.__SCC2.scene.getScene('Battle');
    const ds = b.units.find(u => u.kind === 'dropship');
    const ms = b.units.filter(u => u.kind === 'marine' && !u.dead);
    return { carry: ds ? ds.carry.length : -1, outMarines: ms.length, far: ds ? Math.round(Math.abs(ds.x - b.buildings[0].x)) : -1 };
  });
  console.log('UNLOAD', JSON.stringify(r5));

  // garrison marines into bunker and verify bunker fires + aliens take dmg
  const r6 = await page.evaluate(() => {
    const b = window.__SCC2.scene.getScene('Battle');
    const bk = b.buildings.find(x => x.buildId === 'bunker' && !x.dead);
    b.spawnUnit(1, 'zergling', bk.x + 90, bk.y + 20, { arriveReady: true });
    const foe = b.units.find(u => u.team === 1 && !u.dead);
    const foeHp0 = foe ? foe.hp : -1;
    const marines = b.units.filter(u => u.kind === 'marine' && !u.dead && !u.loaded);
    const ok = marines.slice(0, 2).map(m => b.garrisonInto(bk, m));
    return { ok, gar: bk.garrison.length, foeHp0 };
  });
  console.log('GARRISON', JSON.stringify(r6));
  await page.waitForTimeout(6000);
  const r7 = await page.evaluate(() => {
    const b = window.__SCC2.scene.getScene('Battle');
    const bk = b.buildings.find(x => x.buildId === 'bunker' && !x.dead);
    const foe = b.units.find(u => u.team === 1 && !u.dead);
    return { gar: bk ? bk.garrison.length : -1, foeHp: foe ? Math.round(foe.hp) : 0, panInertia: typeof b.panVX };
  });
  console.log('GARRISON_FIRE', JSON.stringify(r7));

  // medic heal: damage a marine, order heal
  const r8 = await page.evaluate(() => {
    const b = window.__SCC2.scene.getScene('Battle');
    const m = b.units.find(u => u.kind === 'marine' && !u.dead && !u.loaded) || b.units.find(u => u.kind === 'marine' && !u.dead);
    const med = b.units.find(u => u.kind === 'medic' && !u.dead);
    if (!m || !med) return 'MISSING';
    m.hp = m.maxHp * 0.4;
    b.clearSelection(); b.selection.add(med);
    b.rightClickOrder({ x: m.x, y: m.y }, false);
    return { order: med.order?.type, hp: Math.round(m.hp) };
  });
  console.log('HEAL_ORDER', JSON.stringify(r8));
  await page.waitForTimeout(4000);
  const r9 = await page.evaluate(() => {
    const b = window.__SCC2.scene.getScene('Battle');
    const m = b.units.find(u => u.kind === 'marine' && !u.dead);
    const med = b.units.find(u => u.kind === 'medic' && !u.dead);
    return { hp: m ? Math.round(m.hp) : -1, max: m ? m.maxHp : -1, medOrder: med ? med.order?.type : 'gone' };
  });
  console.log('HEAL', JSON.stringify(r9));

  // camera inertia: press D briefly, confirm glide after release
  await page.keyboard.down('KeyD');
  await page.waitForTimeout(700);
  await page.keyboard.up('KeyD');
  const vx0 = await page.evaluate(() => window.__SCC2.scene.getScene('Battle').panVX);
  await page.waitForTimeout(400);
  const vx1 = await page.evaluate(() => window.__SCC2.scene.getScene('Battle').panVX);
  console.log('CAM_INERTIA', JSON.stringify({ vx0: Math.round(vx0), vx1: Math.round(vx1), glide: vx0 > 100 && vx1 < vx0 }));

  // missions ladder
  const r10 = await page.evaluate(async () => {
    const mod = await import('/src2/engine/campaign.js');
    return { n: mod.MISSIONS.length, last: mod.MISSIONS[9].name };
  });
  console.log('MISSIONS', JSON.stringify(r10));

  await page.screenshot({ path: '/Users/davidpence/scc-work/verify/drop-play.png' });
  console.log('ERRORS', errors.length ? errors.slice(0, 5) : 'NONE');
  await browser.close();
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
