// v2.56 gate: radar sweep sonar ping, building select voice, weather FX.
const path = require('path');
const pwPath = require('child_process').execSync('npm root -g').toString().trim();
const { chromium } = require(path.join(pwPath, 'playwright'));
(async () => {
  const url = process.env.SCC_URL || 'http://127.0.0.1:4177/scc/';
  const shot = process.env.SHOT || '/tmp/v256_fx.png';
  const errs = [];
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  p.on('pageerror', e => errs.push(String(e)));
  p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); if (/DIAG/.test(m.text())) console.log(m.text()); });
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
    // swiftshader budget: skip polish._cheap gating in headless. CRITICAL:
    // must patch BEFORE the CC deploy inflates children past the 850 budget,
    // or weatherFX and other polish FX silently never spawn.
    if (bt.polish) bt.polish._cheap = () => true;
    const mcv = bt.units.find(u => u && u.def && u.team === 0 && !u.dead && u.def.mcv);
    if (mcv) {
      const pd = mcv.def.deploysTo || 'commandCenter';
      const min = bt.minerals[0];
      if (min) { outer: for (let rr = 2; rr < 14; rr++) { for (const dd of [[rr,0],[-rr,0],[0,rr],[0,-rr]]) { if (bt.placementValid(pd, min.x + dd[0]*16, min.y + dd[1]*16)) { mcv.setPos(min.x + dd[0]*16, min.y + dd[1]*16); break outer; } } } }
      bt.deployMCV(mcv);
      await new Promise(r => setTimeout(r, 2500));
    }
    // swiftshader budget: skip polish._cheap gating in headless
    if (bt.polish) bt.polish._cheap = () => true;
  });
  const out = [];
  const chk = (id, ok, extra) => out.push({ id, ok: !!ok, ...(extra || {}) });

  // 1. radar sonar ping: sweep wraps 2pi -> tone fires
  const radar = await p.evaluate(() => {
    const bt = window.__SCC2.scene.getScene('Battle');
    const h = window.__SCC2.scene.getScene('Hud');
    const pol = bt.polish;
    if (!pol) return { err: 'no polish' };
    pol._radarA = Math.PI * 2 - 0.01; // park just short of wrap
    let tones = 0, lastFreq = 0;
    const origTone = bt.audio.tone.bind(bt.audio);
    bt.audio.tone = (f) => { tones++; lastFreq = f; };
    pol.radarSweep(h.mmG, h.mmX, h.mmY, h.mmSize); // this call wraps
    pol.radarSweep(h.mmG, h.mmX, h.mmY, h.mmSize); // no wrap
    bt.audio.tone = origTone;
    return { ok: tones === 1 && lastFreq === 1180, tones, lastFreq };
  });
  chk('RADAR_SONAR_PING', radar.ok === true, radar);

  // 2. building select voice: selectBuilding fires buildingBark once per 4s dedupe
  const bvoice = await p.evaluate(() => {
    const bt = window.__SCC2.scene.getScene('Battle');
    const cc = bt.buildings.find(bl => bl.team === 0 && bl.def.primary && !bl.dead);
    if (!cc) return { err: 'no CC' };
    let barks = 0, txt = '';
    const orig = bt.audio.bark.bind(bt.audio);
    bt.audio.bark = (t) => { barks++; txt = t; };
    bt.audio._lastBarkSel = null;
    bt.selectBuilding(cc);
    const first = barks === 1 && txt.length > 3;
    bt.selectBuilding(cc); // same building within 4s -> deduped
    const dedup = barks === 1;
    bt.audio.bark = orig;
    return { ok: first && dedup, barks, txt, dedup };
  });
  chk('BUILDING_SELECT_VOICE', bvoice.ok === true, bvoice);

  // 3. weather FX terran motes spawn (scrollFactor 0 particles in battle scene)
  const wx = await p.evaluate(async () => {
    const bt = window.__SCC2.scene.getScene('Battle');
    const pol = bt.polish;
    const wired = pol.tick.toString().includes('weatherFX');
    let calls = 0;
    const orig = pol.weatherFX.bind(pol);
    pol.weatherFX = (dt) => { calls++; orig(dt); };
    // NOTE: this Phaser build stores flat scrollFactorX/Y, not a vector.
    const wxKids = () => bt.children.list.filter(o => o.active && o.depth === 9000 && o.scrollFactorX === 0);
    await new Promise(r => setTimeout(r, 2500));
    const live = wxKids().length;
    pol.weatherFX(1); pol.weatherFX(1); pol.weatherFX(1); // manual fire if tick cadence starved
    await new Promise(r => setTimeout(r, 400));
    const live2 = wxKids().length;
    pol.weatherFX = orig;
    return { ok: wired && live2 >= 1, wired, calls, live, live2 };
  });
  chk('WEATHER_SPAWN_TERRAN', wx.ok === true, wx);

  // 4. weather race variant: skarn spore color check via players[0] swap
  const wxRace = await p.evaluate(async () => {
    const bt = window.__SCC2.scene.getScene('Battle');
    bt.players[0].race = 'skarn';
    bt.polish._wxT = 0;
    const before = bt.children.list.filter(o => o.active && o.depth === 9000 && o.scrollFactorX === 0).length;
    await new Promise(r => setTimeout(r, 2500));
    const spawn = bt.children.list.filter(o => o.active && o.depth === 9000 && o.scrollFactorX === 0);
    const spore = spawn.some(o => o.fillColor === 16756848);
    bt.players[0].race = 'terran';
    return { ok: spawn.length - before >= 1 && spore, spawned: spawn.length - before, spore };
  });
  chk('WEATHER_RACE_SKARN', wxRace.ok === true, wxRace);

  // 5. no leftover flood: motes auto-destroy (count bounded after another 6s)
  // v2.61: cadence doubled + terran secondary ember -> cap raised 30->60
  const bounded = await p.evaluate(async () => {
    const bt = window.__SCC2.scene.getScene('Battle');
    await new Promise(r => setTimeout(r, 6000));
    const n = bt.children.list.filter(o => o.active && o.depth === 9000 && o.scrollFactorX === 0).length;
    return { ok: n < 60, n };
  });
  chk('WEATHER_BOUNDED', bounded.ok === true, bounded);

  await p.screenshot({ path: shot });
  console.log(out.map(o => JSON.stringify(o)).join('\n'));
  const fails = out.filter(o => !o.ok);
  const errFails = errs.filter(e => !/favicon|cursor|AudioContext|speech/i.test(e));
  if (fails.length || errFails.length) { console.log('GATE-V256 FAIL', JSON.stringify({ fails: fails.map(f => f.id), errs: errFails.slice(0, 3) })); await b.close(); process.exit(1); }
  console.log('GATE-V256 PASS ' + out.length + '/' + out.length);
  await b.close();
})().catch(e => { console.error('FATAL', String(e).slice(0,300)); process.exit(2); });
