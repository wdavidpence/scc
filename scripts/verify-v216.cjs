// SCC2 v2.16 feature gate: crates, critters, beacon, morphs, merges, void casts, gore/rubble.
const path = require('path');
const PW = '/Users/davidpence/.hermes/node/lib/node_modules/playwright';
const { chromium } = require(PW);

const OUT = '/Users/davidpence/scc-work/verify';
require('fs').mkdirSync(OUT, { recursive: true });

(async () => {
  const browser = await chromium.launch({ headless: false, args: ['--use-gl=angle', '--enable-gpu'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 760 } });
  const errors = [];
  page.on('pageerror', e => errors.push((e.stack || e.message).split('\n').slice(0, 3).join(' | ')));
  await page.goto(process.env.SCC_URL || 'http://127.0.0.1:5175/index2.html', { waitUntil: 'load' });
  await page.waitForTimeout(1200);

  const skipCuts = async () => {
    for (let i = 0; i < 6; i++) {
      const closed = await page.evaluate(() => { try { localStorage.setItem('starfront.cutseen.v1', '1'); } catch (e) {} const sm = window.__SCC2?.scene; if (!sm) return false; const s = sm.getScene('Cut'); if (s && s.scene.isActive()) { s.close(); return true; } return false; });
      if (!closed) return;
      await page.waitForTimeout(700);
    }
  };
  await skipCuts();
  await page.keyboard.press('Enter');
  await page.waitForTimeout(1000);
  await skipCuts();
  await page.waitForTimeout(3500);

  const g = () => page.evaluate(() => { const b = window.__SCC2.scene.getScene('Battle'); return b; });

  // 1) crates + critters exist
  const world = await page.evaluate(() => {
    const b = window.__SCC2.scene.getScene('Battle');
    return { crates: (b.crates || []).length, critters: (b.critters || []).length, kinds: (b.crates || []).map(c => c.kind) };
  });
  console.log('WORLD', JSON.stringify(world));

  // 2) claim a crate with a marine teleported onto it
  const claim = await page.evaluate(async () => {
    const b = window.__SCC2.scene.getScene('Battle');
    const c = b.crates[0];
    if (!c) return { ok: false };
    const m = b.spawnUnit(0, 'marine', c.x, c.y + 6, { arriveReady: true });
    const before = b.players[0].minerals + b.players[0].gas;
    await new Promise(r => setTimeout(r, 1200));
    return { ok: true, cratesLeft: b.crates.length, surge: !!b.powerSurgeUntil, spawn: !!b.units.find(u => !u.dead && u.kind === 'marine' && Math.hypot(u.x - c.x, u.y - c.y) < 60) };
  });
  console.log('CLAIM', JSON.stringify(claim));

  // 3) critter flees when a unit comes near
  const flee = await page.evaluate(async () => {
    const b = window.__SCC2.scene.getScene('Battle');
    const cr = b.critters[0];
    if (!cr) return { ok: false };
    const m = b.spawnUnit(0, 'marine', cr.x - 30, cr.y, { arriveReady: true });
    const p0 = [cr.x, cr.y];
    await new Promise(r => setTimeout(r, 1400));
    return { ok: true, moved: Math.round(Math.hypot(cr.x - p0[0], cr.y - p0[1])) };
  });
  console.log('CRITTER_FLEE', JSON.stringify(flee));

  // 4) beacon via HUD right-click path (call placeBeacon directly + minimap render)
  const beacon = await page.evaluate(() => {
    const b = window.__SCC2.scene.getScene('Battle');
    b.placeBeacon(b.cameras.main.midPoint.x + 100, b.cameras.main.midPoint.y + 40);
    return { set: !!b.beacon };
  });
  console.log('BEACON', JSON.stringify(beacon));

  // 5) dark templar merge -> darkArchon requires tech; grant tech, spawn 2 dtemplars, merge
  const merge = await page.evaluate(async () => {
    const b = window.__SCC2.scene.getScene('Battle');
    b.players[0].techs.darkArchonMerge = true;
    b.techResearched(0, 'darkArchonMerge');
    const a = b.spawnUnit(0, 'darkTemplar', 400, 400, { arriveReady: true });
    const c = b.spawnUnit(0, 'darkTemplar', 440, 400, { arriveReady: true });
    if (!a || !c) return { ok: false, note: 'spawn failed (supply?)' };
    b.selection.clear(); b.selection.add(a); b.selection.add(c);
    b.summonArchon('darkArchon');
    await new Promise(r => setTimeout(r, 300));
    const da = b.units.find(u => !u.dead && u.kind === 'darkArchon');
    return { ok: !!da, daEnergy: da ? da.energy : null, dpsLeft: b.units.filter(u => !u.dead && u.kind === 'darkTemplar').length };
  });
  console.log('MERGE', JSON.stringify(merge));

  // 6) maelstrom locks airborne enemy
  const mael = await page.evaluate(async () => {
    const b = window.__SCC2.scene.getScene('Battle');
    const da = b.units.find(u => !u.dead && u.kind === 'darkArchon');
    const w = b.spawnUnit(1, 'wraith', da.x, da.y + 30, { arriveReady: true }) || b.spawnUnit(1, 'mutalisk', da.x, da.y + 30, { arriveReady: true });
    if (!w) return { ok: false, note: 'no air enemy' };
    b.selection.clear(); b.selection.add(da);
    b.castMaelstrom(da, w.x, w.y);
    await new Promise(r => setTimeout(r, 250));
    return { ok: true, stun: Math.round(w.stunTimer || 0), energy: Math.round(da.energy) };
  });
  console.log('MAELSTROM', JSON.stringify(mael));

  // 7) mutalisk morphs to devourer (grant tech)
  const morph = await page.evaluate(async () => {
    const b = window.__SCC2.scene.getScene('Battle');
    b.players[0].techs.devourer = true;
    b.players[0].minerals += 2000; b.players[0].gas += 2000;
    const m = b.spawnUnit(0, 'mutalisk', 500, 500, { arriveReady: true });
    if (!m) return { ok: false, note: 'no muta' };
    // morph requires 2 supply headroom (SC1) — park all other marines to free cap
    b.units.filter(u => !u.dead && u.team === 0 && u.def.supply > 0 && u !== m).forEach(u => { u._cap = u.def.supply; u.def = Object.assign({}, u.def, { supply: 0 }); });
    b.selection.clear(); b.selection.add(m);
    b.morphSelected('devourer');
    await new Promise(r => setTimeout(r, 600));
    const d = b.units.find(u => !u.dead && u.kind === 'devourer');
    return { ok: !!d, from: m.dead };
  });
  console.log('MORPH_DEVOURER', JSON.stringify(morph));

  // 8) caustic cloud damage to ground enemy
  const cloud = await page.evaluate(async () => {
    const b = window.__SCC2.scene.getScene('Battle');
    const d = b.units.find(u => !u.dead && u.kind === 'devourer');
    if (!d) return { ok: false };
    const z = b.spawnUnit(1, 'marine', d.x + 40, d.y, { arriveReady: true });
    b.selection.clear(); b.selection.add(d);
    b.castCausticCloud(d, z.x, z.y);
    const hp0 = z.hp + z.shield;
    await new Promise(r => setTimeout(r, 2200));
    return { ok: true, hpDrop: Math.round(hp0 - z.hp) };
  });
  console.log('CAUSTIC', JSON.stringify(cloud));

  // 9) guardian morph
  const guard = await page.evaluate(async () => {
    const b = window.__SCC2.scene.getScene('Battle');
    b.players[0].techs.guardian = true;
    const m = b.spawnUnit(0, 'mutalisk', 520, 520, { arriveReady: true });
    if (!m) return { ok: false };
    b.selection.clear(); b.selection.add(m);
    b.morphSelected('guardian');
    await new Promise(r => setTimeout(r, 400));
    return { ok: !!b.units.find(u => !u.dead && u.kind === 'guardian') };
  });
  console.log('MORPH_GUARDIAN', JSON.stringify(guard));

  // 10) gore + rubble textures render without error after kills
  const gore = await page.evaluate(async () => {
    const b = window.__SCC2.scene.getScene('Battle');
    const e = b.spawnUnit(1, 'marine', 600, 400, { arriveReady: true });
    if (e) b.applyHit(e, 9999, { physical: true }, b.units.find(u => !u.dead && u.team === 0) || { team: 0 });
    const e2 = b.spawnUnit(1, 'zergling', 620, 420, { arriveReady: true });
    if (e2) b.applyHit(e2, 9999, { physical: true }, b.units.find(u => !u.dead && u.team === 0) || { team: 0 });
    await new Promise(r => setTimeout(r, 600));
    return { ok: b.textures.exists('gore-terran') && b.textures.exists('gore-zerg') && b.textures.exists('rubble') && b.textures.exists('crate') && b.textures.exists('critter') };
  });
  console.log('GORE_TEX', JSON.stringify(gore));

  // 11) corsair spawns via stargate produce list integrity
  const data = await page.evaluate(() => {
    const b = window.__SCC2.scene.getScene('Battle');
    const u = b.spawnUnit(0, 'corsair', 300, 300, { arriveReady: true });
    return { corsair: !!u, corsairTargetsAirOnly: u ? u.def.targets === 'air' : false };
  });
  console.log('CORSAIR', JSON.stringify(data));

  // 12) idle-worker cycle + income tick
  const idle = await page.evaluate(() => {
    const b = window.__SCC2.scene.getScene('Battle');
    const w = b.units.filter(u => !u.dead && u.team === 0 && u.def.worker && u.state === 'idle' && !u.order);
    if (!w.length) { const dr = b.units.find(u => !u.dead && u.team === 0 && u.def.worker); if (dr) { dr.order = null; dr.path = []; dr.state = 'idle'; } }
    b.cycleIdleWorker();
    const sel = b.selection.size;
    const h = window.__SCC2.scene.getScene('Hud');
    h.incomeTick('+50', '#7db4ff');
    return { sel, tickShown: h.tickTxt && h.tickTxt.alpha > 0.5, text: h.tickTxt ? h.tickTxt.text : '' };
  });
  console.log('IDLE_CYCLE', JSON.stringify(idle));

  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/v216-deep.png` });

  console.log('ERRORS', JSON.stringify(errors));
  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(2); });
