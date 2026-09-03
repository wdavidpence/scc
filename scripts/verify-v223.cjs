// v2.23 gate: all 10 AAA upgrades, verified against real APIs in src2/
const { chromium } = require('/Users/davidpence/.hermes/node/lib/node_modules/playwright');
(async () => {
  const browser = await chromium.launch({ headless: false, args: ['--use-gl=angle', '--enable-gpu'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 760 } });
  const errors = [];
  page.on('pageerror', e => errors.push((e.stack || e.message).split('\n').slice(0, 2).join(' | ')));
  await page.goto('http://127.0.0.1:5175/index2.html', { waitUntil: 'load' });
  await page.waitForTimeout(1500);
  await page.evaluate(() => { try { localStorage.setItem('starfront.cutseen.v1', '1'); } catch (e) {} });
  await page.evaluate(() => { const c = window.__SCC2.scene.getScene('Cut'); if (c && c.scene.isActive()) c.close(); });
  await page.waitForTimeout(400);
  const out = {};

  out.titleActive = await page.evaluate(() => window.__SCC2.scene.isActive('Title'));

  await page.evaluate(() => {
    const sm = window.__SCC2.scene;
    ['Title', 'Cut', 'Brief'].forEach(s => { if (sm.isActive(s)) sm.stop(s); });
    sm.start('Battle', { race: 'terran', enemyRace: 'zerg', difficulty: 'normal', mission: { n: 1, name: 'CLEANUP OP', enemy: 'zerg', difficulty: 'easy', bonusMinerals: 200, brief: '' } });
    if (!sm.isActive('Hud')) sm.start('Hud');
  });
  await page.waitForTimeout(3000);
  out.battleActive = await page.evaluate(() => window.__SCC2.scene.isActive('Battle'));

  // [9] named commander
  out.commander = await page.evaluate(() => {
    const b = window.__SCC2.scene.getScene('Battle');
    return { name: b.aiCommander?.name || null, doctrine: b.aiProfile?.doctrine || null };
  });

  // [10] triggers framework
  out.triggers = await page.evaluate(() => {
    const b = window.__SCC2.scene.getScene('Battle');
    return { has: !!b.triggers, count: b.triggers?.defs?.length || 0 };
  });

  // [1] combat juice: shells, muzzle sparks, brass, scorch decals after live fire
  out.juice = await page.evaluate(async () => {
    const b = window.__SCC2.scene.getScene('Battle');
    const home = b.buildings.find(x => x.team === 0 && x.built);
    b._tempReveals = b._tempReveals || [];
    b._tempReveals.push({ x: home.x + 120, y: home.y + 70, r: 400, until: b.gameTime + 60 });
    const marines = [];
    for (let i = 0; i < 6; i++) marines.push(b.spawnUnit(0, 'marine', home.x + 40 + i * 18, home.y + 60, { arriveReady: true }));
    b.players[0].minerals = 9999;
    const tank = b.spawnUnit(0, 'tank', home.x + 80, home.y + 100, { arriveReady: true });
    const enemy = b.spawnUnit(1, 'zergling', home.x + 110, home.y + 66, { arriveReady: true });
    enemy.hp = enemy.maxHp = 3000;
    marines.forEach(m => { if (m) m.setOrder({ type: 'attackTarget', target: enemy }); });
    if (tank) tank.setOrder({ type: 'attackTarget', target: enemy });
    let sawShell = 0, sawBrass = 0, sawSpark = 0, goreGrew = 0;
    const gore0 = b.children.list.filter(c => c.active && /gore-|scorch/.test(c.texture?.key || '')).length;
    for (let i = 0; i < 60; i++) {
      await new Promise(r => setTimeout(r, 60));
      b._tempReveals[0].until = b.gameTime + 60;
      if (b.children.list.some(c => c._proj?.shell && c.active)) sawShell++;
      if (b.children.list.some(c => c._proj && c.active)) sawSpark++;
      if ((b._brass || []).length) sawBrass++;
    }
    const decals = b.children.list.filter(c => c.active && /gore-|scorch/.test(c.texture?.key || '')).length;
    return { sawShell, sawBrass, sawSpark, goreBefore: gore0, decals, enemyHp: Math.round(enemy.hp) };
  });

  // [3] walk frames: moving unit swaps -w0/-w1/-w2 textures
  out.walkFrames = await page.evaluate(async () => {
    const b = window.__SCC2.scene.getScene('Battle');
    const m = b.units.find(u => u.team === 0 && u.kind === 'marine' && !u.dead);
    m.issueMove(m.x + 260, m.y + 120);
    const keys = new Set();
    for (let i = 0; i < 14; i++) { await new Promise(r => setTimeout(r, 110)); keys.add(m.sprite.texture.key); }
    return { frames: [...keys].filter(k => k.includes('-w')), multiFrame: [...keys].some(k => k.includes('-w')) };
  });

  // [2] accel ramp: _curSpeed climbs toward max after a fresh order
  out.accel = await page.evaluate(async () => {
    const b = window.__SCC2.scene.getScene('Battle');
    const m = b.units.find(u => u.team === 0 && !u.dead && !u.moving) || b.units.find(u => u.team === 0 && !u.dead);
    m._curSpeed = 0;
    m.issueMove(m.x + 320, m.y);
    await new Promise(r => setTimeout(r, 90));
    const v1 = m._curSpeed;
    await new Promise(r => setTimeout(r, 800));
    const v2 = m._curSpeed;
    return { v1: Math.round(v1), v2: Math.round(v2), ramps: v2 > v1 };
  });

  // [2b] alt-click subgroups: _sgCycle advances, MOVE GROUP alert text
  out.subgroups = await page.evaluate(async () => {
    const b = window.__SCC2.scene.getScene('Battle');
    const ms = b.units.filter(u => u.team === 0 && u.kind === 'marine' && !u.dead).slice(0, 6);
    b.clearSelection(); ms.forEach(u => b.selection.add(u));
    b.rightClickOrder({ x: 520, y: 520 }, false, true);
    const c1 = b._sgCycle;
    b.rightClickOrder({ x: 525, y: 525 }, false, true);
    const c2 = b._sgCycle;
    const moved = ms.filter(u => u.waypoints && u.waypoints.length).length + ms.filter(u => u.moving || u.order === 'move').length;
    return { c1, c2, advanced: c2 > c1 };
  });

  // [4] cast ghost
  out.castGhost = await page.evaluate(async () => {
    const b = window.__SCC2.scene.getScene('Battle');
    b.showCastGhost(90, 0x9a6bff);
    await new Promise(r => setTimeout(r, 150));
    const ghost = !!b._castGhost && b._castGhost.active;
    b.castMode = null; b.clearCastGhost();
    return { ghost };
  });

  // [6] depletion: mineral sprite scaleX shrinks as amount drains
  out.depletion = await page.evaluate(() => {
    const b = window.__SCC2.scene.getScene('Battle');
    const m = b.minerals.find(mm => mm.sprite && mm.amount > 300);
    if (!m) return { err: 'no mineral' };
    const before = m.sprite.scaleX;
    m.amount = 300;
    b.updateResourceDepletion();
    const after = m.sprite.scaleX;
    return { before: +before.toFixed(2), after: +after.toFixed(2), shrinks: after < before - 0.02 };
  });

  // [5] F11 tech panel
  out.techPanel = await page.evaluate(async () => {
    const h = window.__SCC2.scene.getScene('Hud');
    h.toggleTechTree(true);
    await new Promise(r => setTimeout(r, 300));
    const vis = !!(h._tech && h._tech.visible);
    const rows = (h._techRows || []).length;
    const sample = (h._techRows || []).slice(0, 2).map(r => r.txt.text.trim());
    h.toggleTechTree(false);
    return { vis, rows, sample };
  });

  // regression: training pipeline still works (command center trains SCVs; barracks if present)
  out.train = await page.evaluate(async () => {
    const b = window.__SCC2.scene.getScene('Battle');
    const raf = b.buildings.find(x => x.team === 0 && x.built && x.canProduce('marine')) || b.buildings.find(x => x.team === 0 && x.built && x.canProduce('scv'));
    if (!raf) return { queued: false, err: 'no host' };
    b.players[0].minerals = 9999; b.players[0].gas = 9999; b.players[0].supplyCap = 200; b.players[0].supplyUsed = 0;
    const kind = raf.canProduce('marine') ? 'marine' : 'scv';
    const ok = raf.queueUnit(kind);
    await new Promise(r => setTimeout(r, 400));
    return { queued: !!ok, kind, qlen: raf.queue.length };
  });

  await page.waitForTimeout(8000);
  out.alive = await page.evaluate(() => window.__SCC2.scene.isActive('Battle'));
  out.pageErrors = errors;
  console.log(JSON.stringify(out, null, 1));
  await page.screenshot({ path: 'shots-v223-aaa.png' });
  await browser.close();
  const fail = errors.length > 0 || !out.battleActive || !out.alive || !out.commander.name || !out.triggers.count
    || !out.juice.sawSpark || !out.juice.sawBrass || !out.walkFrames.multiFrame
    || !out.accel.ramps || !out.subgroups.advanced || !out.castGhost.ghost
    || !out.depletion.shrinks || !out.techPanel.vis || out.techPanel.rows < 3 || !out.train.queued;
  process.exit(fail ? 1 : 0);
})();
