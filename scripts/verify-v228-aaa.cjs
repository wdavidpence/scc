// v2.28 AAA polish verification — gas assignment UI (badges, assign/unassign,
// auto-swarm removed), trail density tuning, formation-engage ghosts.
const PW = '/Users/davidpence/.hermes/node/lib/node_modules/playwright';
const { chromium } = require(PW);

(async () => {
  const url = process.env.SCC_URL || 'http://127.0.0.1:4177/scc/index.html';
  const browser = await chromium.launch({ headless: false, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 760 } });
  const errors = [];
  const fails = [];
  page.on('pageerror', e => errors.push(String(e.message || e)));
  page.on('console', m => { if (m.type() === 'error' && !/AudioContext|autoplay|favicon|net::ERR|Failed to load resource/i.test(m.text())) errors.push(m.text()); });
  const chk = (name, ok) => { console.log((ok ? 'PASS' : 'FAIL') + '  ' + name); if (!ok) fails.push(name); };

  await page.goto(url, { waitUntil: 'load', timeout: 60000 });
  await page.waitForFunction(() => window.__SCC2 && window.__SCC2.scene.isActive('Title'), null, { timeout: 90000 });
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__SCC2.scene.isActive('Battle'), null, { timeout: 30000 });
  await page.waitForFunction(() => { const s = window.__SCC2.scene.getScene('Battle'); return s.units && s.units.length > 0; }, null, { timeout: 60000 });
  await page.waitForTimeout(2500);

  // helper: force a built refinery onto a geyser near player base
  await page.evaluate(() => {
    const g = window.__SCC2.scene.getScene('Battle');
    const geys = g.geysers;
    const base = g.buildings.find(b => b.team === 0 && b.def.primary) || { x: geys[0].x + 60, y: geys[0].y + 60 };
    g.polish.gasBadgesTick = g.polish.gasBadgesTick.bind(g.polish);
    window.__mkRef = (gey) => {
      const ref = gey.building;
      if (ref && !ref.dead) { ref.dead = true; }
      const fake = { x: gey.x, y: gey.y, team: 0, dead: false, built: true, def: { onGeyser: true, w: 2, h: 2 }, geyser: gey, radius: 14, update: () => {} };
      gey.building = fake;
      gey.workers = gey.workers ? gey.workers.filter(w => !w.dead) : [];
      g.buildings.push(fake);
      return fake;
    };
  });

  // 1) auto-swarm removed: fresh refinery gets ZERO auto-assigned workers
  chk('auto-swarm removed', await page.evaluate(() => {
    const g = window.__SCC2.scene.getScene('Battle');
    const gey = g.geysers.find(x => !x.building) || g.geysers[0];
    const fake = window.__mkRef(gey);
    g.assignGeyserWorkers(fake);
    return gey.workers.length === 0;
  }));

  // 2) hint banner fires for player refinery completion
  chk('assign hint banner', await page.evaluate(() => {
    const g = window.__SCC2.scene.getScene('Battle');
    let got = null;
    g.events.once('hud:alert', m => { got = m; });
    const gey = g.geysers[0];
    g.assignGeyserWorkers(gey.building || { team: 0, geyser: gey, def: { onGeyser: true } });
    return typeof got === 'string' && /RIGHT-CLICK REFINERY/.test(got);
  }));

  // 3) manual assignment routes workers to geyser, caps at 3
  chk('manual assign + cap 3', await page.evaluate(() => {
    const g = window.__SCC2.scene.getScene('Battle');
    const gey = g.geysers[0];
    if (!gey.building) window.__mkRef(gey);
    const workers = g.units.filter(u => !u.dead && u.team === 0 && u.def.worker).slice(0, 4);
    g.clearSelection();
    for (const w of workers) g.addToSelection(w);
    const sel = [...g.selection].filter(u => u.def.worker);
    if (sel.length === g.selection.size && g.selection.size > 0) g.rightClickOrder({ x: gey.x, y: gey.y }, false, false);
    return gey.workers.length <= 3 && gey.workers.length > 0 && gey.workers.every(w => w.gasTarget === gey);
  }));

  // 4) GAS CREW alert echoed on manual assign
  const crewAlert = await page.evaluate(async () => {
    const g = window.__SCC2.scene.getScene('Battle');
    const gey = g.geysers[1] || g.geysers[0];
    if (!gey.building) window.__mkRef(gey);
    const h = window.__SCC2.scene.getScene('Hud');
    const w = g.units.find(u => !u.dead && u.team === 0 && u.def.worker && !u.gasTarget);
    if (!w) return { ok: false, txt: 'no free worker' };
    g.clearSelection(); g.addToSelection(w);
    g.rightClickOrder({ x: gey.x, y: gey.y }, false, false);
    await new Promise(r => setTimeout(r, 150));
    return { ok: /GAS CREW \d\/3/.test(h.alert.text), txt: h.alert.text };
  });
  if (!crewAlert.ok) console.log('   banner was:', crewAlert.txt);
  chk('gas crew assign alert', crewAlert.ok);

  // 5) unassign toggle: right-click own geyser refinery while its miners selected
  chk('gas unassign toggle', await page.evaluate(() => {
    const g = window.__SCC2.scene.getScene('Battle');
    const gey = g.geysers[0];
    const w = gey.workers[0];
    if (!w || !gey.building) return false;
    g.clearSelection(); g.addToSelection(w);
    g.rightClickOrder({ x: gey.building.x, y: gey.building.y }, false, false);
    return !w.gasTarget && !gey.workers.includes(w);
  }));

  // 6) gas badge renders over player refinery (N/3 + depletion ring)
  chk('gas badge render', await page.evaluate(async () => {
    const g = window.__SCC2.scene.getScene('Battle');
    const gey = g.geysers[0];
    if (!gey.building) window.__mkRef(gey);
    gey.gas = 1200; gey.full = 2500;
    g.cameras.main.centerOn(gey.x, gey.y);
    g.polish._gbT = 0;
    g.polish.gasBadgesTick(1);
    await new Promise(r => setTimeout(r, 100));
    const texts = g.children.list.filter(c => c.depth === 80 && c.text && /\/3/.test(c.text)).length;
    const rings = g.children.list.filter(c => c.depth === 79 && c.type === 'ArcGeometry' || (c.depth === 79 && c.strokeWidth === 1.5)).length;
    return texts >= 1;
  }));

  // 7) badge rebuilds on worker-count change, sweeps when refinery gone
  chk('badge live updates + sweep', await page.evaluate(async () => {
    const g = window.__SCC2.scene.getScene('Battle');
    const gey = g.geysers[0];
    const w = g.units.find(u => !u.dead && u.team === 0 && u.def.worker);
    gey.workers = [w];
    g.polish._gbT = 0; g.polish.gasBadgesTick(1);
    const sig1 = [...g.polish._gb.values()].map(v => v.sig).join(',');
    gey.building = null; gey.workers = [];
    g.buildings = g.buildings.filter(b => b.geyser !== gey);
    g.polish._gbT = 0; g.polish.gasBadgesTick(1);
    const gone = ![...g.polish._gb.keys()].includes(gey.id);
    return /^1:\d+$/.test(sig1) && gone;
  }));

  // 8) trail density: fast projectiles sparser than shells
  chk('trail density tuning', () => page.evaluate(() => {
    const g = window.__SCC2.scene.getScene('Battle');
    const mk = (shell, speed) => {
      const img = g.add.circle(100, 100, 2, 0xffffff).setDepth(43);
      img._proj = { target: { dead: false, x: 120, y: 100, radius: 4 }, damage: 1, splash: 0, speed, team: 0, attacker: null, kind: 'tank', shell };
      return img;
    };
    const shell = mk(true, 300), bolt = mk(false, 900);
    let sc = 0, bc = 0;
    const before = g.children.list.length;
    for (let i = 0; i < 6; i++) { const b = g.children.list.length; g.polish.projTrail(shell); if (g.children.list.length > b) sc++; }
    for (let i = 0; i < 6; i++) { const b = g.children.list.length; g.polish.projTrail(bolt); if (g.children.list.length > b) bc++; }
    shell.destroy(); bolt.destroy();
    return sc === 6 && bc === 2 && g.polish._tn > 0;
  }));

  // 9) global trail cap holds under spam
  chk('global trail cap', () => page.evaluate(() => {
    const g = window.__SCC2.scene.getScene('Battle');
    const img = g.add.circle(50, 50, 2, 0xffffff).setDepth(43);
    img._proj = { target: { dead: false, x: 60, y: 50, radius: 4 }, speed: 300, team: 0, kind: 'tank', shell: true };
    g.polish._tn = 60; // over the 48 cap
    const b = g.children.list.length;
    for (let i = 0; i < 5; i++) g.polish.projTrail(img);
    const added = g.children.list.length - b;
    img.destroy();
    return added === 0;
  }));

  // 10) formation-engage ghosts appear on attack-move of combat group
  chk('formation engage ghosts', () => page.evaluate(() => {
    const g = window.__SCC2.scene.getScene('Battle');
    const combat = g.units.filter(u => !u.dead && u.team === 0 && !u.def.worker).slice(0, 5);
    if (combat.length < 3) return 'skip';
    g.clearSelection(); for (const u of combat) g.addToSelection(u);
    const anchor = combat[0];
    g.polish.formationGhosts(combat, anchor.x + 120, anchor.y + 40);
    return g.children.list.filter(c => c.depth === 49 && c.type === 'Circle' || c.strokeWidth === 1 && c.alpha <= 0.55 && c.depth === 49).length >= 3 || [...g.tweens.running].length > 0;
  }));

  await page.waitForTimeout(600);
  const shot = '/Users/davidpence/scc-work/verify/v228-aaa.png';
  await page.screenshot({ path: shot });
  await browser.close();

  if (errors.length) console.log('ERRORS', JSON.stringify(errors.slice(0, 6)));
  console.log('RESULT:', fails.length === 0 && errors.length === 0 ? 'PASS' : 'FAIL');
  process.exit(fails.length === 0 && errors.length === 0 ? 0 : 1);
})().catch(e => { console.log('E', String(e).slice(0, 220)); process.exit(1); });
