// v2.57 gate: rally-line feedback, tech-complete celebration, heavy-death camera kick.
const path = require('path');
const pwPath = require('child_process').execSync('npm root -g').toString().trim();
const { chromium } = require(path.join(pwPath, 'playwright'));
(async () => {
  const url = process.env.SCC_URL || 'http://127.0.0.1:4177/scc/';
  const shot = process.env.SHOT || '/tmp/v257_fx.png';
  const errs = [];
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  p.on('pageerror', e => errs.push(String(e)));
  p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await p.goto(url, { waitUntil: 'networkidle' });
  await p.evaluate(() => localStorage.setItem('starfront.cutseen.v1', '1'));
  await p.goto(url, { waitUntil: 'networkidle' });
  await p.waitForTimeout(2000);
  await p.evaluate(async () => {
    const sm = window.__SCC2.scene;
    for (const s of sm.getScenes(true)) sm.stop(s.scene.key);
    await new Promise(r => setTimeout(r, 400));
    sm.start('Battle', { race: 'terran', enemyRace: 'skarn' });
    sm.start('Hud', { race: 'terran' });
    await new Promise(r => setTimeout(r, 5000));
    const bt = window.__SCC2.scene.getScene('Battle');
    if (bt.polish) bt.polish._cheap = () => true; // before deploy inflates children
    const mcv = bt.units.find(u => u && u.def && u.team === 0 && !u.dead && u.def.mcv);
    if (mcv) {
      const pd = mcv.def.deploysTo || 'commandCenter';
      const min = bt.minerals[0];
      if (min) { outer: for (let rr = 2; rr < 14; rr++) { for (const dd of [[rr,0],[-rr,0],[0,rr],[0,-rr]]) { if (bt.placementValid(pd, min.x + dd[0]*16, min.y + dd[1]*16)) { mcv.setPos(min.x + dd[0]*16, min.y + dd[1]*16); break outer; } } } }
      bt.deployMCV(mcv);
      await new Promise(r => setTimeout(r, 2500));
    }
  });
  const out = [];
  const chk = (id, ok, extra) => out.push({ id, ok: !!ok, ...(extra || {}) });

  // 1. rally line: showRallyFlag spawns a dashed graphics survivor then fades
  const rally = await p.evaluate(async () => {
    const bt = window.__SCC2.scene.getScene('Battle');
    const cc = bt.buildings.find(bl => bl.team === 0 && bl.def.primary && !bl.dead);
    if (!cc) return { err: 'no CC' };
    cc.rallyPoint = { x: cc.x + 120, y: cc.y + 60 };
    const g0 = bt.children.list.filter(o => o.type === 'Graphics' && o.depth === 46).length;
    bt.showRallyFlag(cc);
    const lines = bt.children.list.filter(o => o.active && o.type === 'Graphics' && o.depth === 46);
    const spawned = lines.length - g0 >= 1;
    const lg = lines[lines.length - 1];
    // swiftshader ~1-2fps: tween onComplete resolves late — poll, don't sleep-once
    let faded = false;
    for (let i = 0; i < 24 && !faded; i++) {
      await new Promise(r => setTimeout(r, 300));
      faded = !lg.active || lg.alpha < 0.05;
    }
    return { ok: spawned && faded, spawned, faded, alpha: +lg.alpha.toFixed(2) };
  });
  chk('RALLY_LINE_FADE', rally.ok === true, rally);

  // 2. tech celebrate: spy depth-band spawns at lab on completeResearch
  const tech = await p.evaluate(async () => {
    const bt = window.__SCC2.scene.getScene('Battle');
    const cc = bt.buildings.find(bl => bl.team === 0 && bl.def.primary && !bl.dead);
    if (!cc) return { err: 'no CC' };
    const before = bt.children.list.filter(o => o.active && o._techFx).length;
    bt.completeResearch(0, 'terranInfantryWeapons1');
    await new Promise(r => setTimeout(r, 250));
    const burst = bt.children.list.filter(o => o.active && o._techFx);
    const rings = burst.filter(o => o._techFx === 'ring').length;
    const sparks = burst.filter(o => o._techFx === 'spark').length;
    return { ok: burst.length - before >= 10 && rings >= 3 && sparks >= 8, add: burst.length - before, rings, sparks };
  });
  chk('TECH_CELEBRATE_BURST', tech.ok === true, tech);

  // 3. burst auto-clears (no orphan sprites) — poll: swiftshader stretches
  // tween wall-clock (ring delay 280+800ms, sparks delay+1400ms)
  const clear = await p.evaluate(async () => {
    const bt = window.__SCC2.scene.getScene('Battle');
    let n = 99;
    for (let i = 0; i < 40 && n > 0; i++) {
      await new Promise(r => setTimeout(r, 300));
      n = bt.children.list.filter(o => o.active && o._techFx).length;
    }
    return { ok: n === 0, n };
  });
  chk('TECH_BURST_CLEARS', clear.ok === true, clear);

  // 4. heavy death camera kick: shake state rises on heavy kill in view
  const kick = await p.evaluate(() => {
    const bt = window.__SCC2.scene.getScene('Battle');
    const cam = bt.cameras.main;
    const tank = bt.spawnUnit(1, 'siegeTank' in {} ? 'siegeTank' : Object.keys(window.__SCC2.registry.get('data') || {}).find(k => false) || 'tank', cam.worldView.x + 200, cam.worldView.y + 200, { arriveReady: true });
    if (!tank) return { err: 'no tank spawn' };
    tank.def.heavy = true; // force heavy flag for the test
    const s0 = bt._shake.mag;
    tank.hp = 0; tank.dead = true;
    bt.onUnitDeath(tank);
    const kicked = bt._shake.mag >= 4 && bt._shake.t > 0;
    bt._shake.mag = s0; // restore
    return { ok: kicked, mag: bt._shake.mag, t: bt._shake.t };
  });
  chk('HEAVY_DEATH_KICK', kick.ok === true, kick);

  // 5. light death does NOT kick
  const light = await p.evaluate(() => {
    const bt = window.__SCC2.scene.getScene('Battle');
    const cam = bt.cameras.main;
    bt._shake = { t: 0, mag: 0, ox: 0, oy: 0 };
    const u = bt.spawnUnit(1, 'skarling', cam.worldView.x + 200, cam.worldView.y + 240, { arriveReady: true });
    if (!u) return { err: 'no unit' };
    u.def.heavy = false;
    u.hp = 0; u.dead = true;
    bt.onUnitDeath(u);
    return { ok: bt._shake.mag === 0, mag: bt._shake.mag };
  });
  chk('LIGHT_DEATH_NO_KICK', light.ok === true, light);

  await p.screenshot({ path: shot });
  console.log(out.map(o => JSON.stringify(o)).join('\n'));
  const fails = out.filter(o => !o.ok);
  const errFails = errs.filter(e => !/favicon|cursor|AudioContext|speech/i.test(e));
  if (fails.length || errFails.length) { console.log('GATE-V257 FAIL', JSON.stringify({ fails: fails.map(f => f.id), errs: errFails.slice(0, 3) })); await b.close(); process.exit(1); }
  console.log('GATE-V257 PASS ' + out.length + '/' + out.length);
  await b.close();
})().catch(e => { console.error('FATAL', String(e).slice(0,300)); process.exit(2); });
