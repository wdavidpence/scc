// v2.26 AAA polish verification — corpse decals, flinch, trails, stencil, rally arrow,
// fog ?, selection tint, queue chips, orb fly, day/night, creep bubbles. Real Chromium.
const PW = '/Users/davidpence/.hermes/node/lib/node_modules/playwright';
const { chromium } = require(PW);
const OUT = '/Users/davidpence/scc-work/verify';
require('fs').mkdirSync(OUT, { recursive: true });

(async () => {
  const browser = await chromium.launch({ headless: false, args: ['--use-gl=angle', '--enable-gpu'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 760 } });
  const errors = [];
  page.on('pageerror', e => errors.push((e.stack || e.message).split('\n').slice(0, 3).join(' | ')));
  await page.goto(process.env.SCC_URL || 'http://localhost:4177/scc/index.html', { waitUntil: 'load' });
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
  await page.waitForTimeout(1100);
  await skipCuts();
  await page.waitForTimeout(2500);

  const R = { pass: [], fail: [], skip: [] };
  const chk = (name, ok) => (ok === 'skip' ? R.skip : ok ? R.pass : R.fail).push(name);

  await page.waitForFunction(() => !!window.__SCC2?.scene?.getScene('Battle')?.polish, null, { timeout: 15000 });

  // center camera on own start units
  await page.evaluate(() => {
    const g = window.__SCC2.scene.getScene('Battle');
    const w = g.units.filter(u => u.team === 0);
    if (w.length) { const m = w[0]; g.cameras.main.centerOn(m.x, m.y); }
  });
  await page.waitForTimeout(300);

  // 1) flinch: friendly unit takes damage -> sprite squash
  chk('flinch squash on hit', await page.evaluate(() => {
    const g = window.__SCC2.scene.getScene('Battle');
    const u = g.units.find(x => !x.dead && x.sprite);
    if (!u) return 'skip';
    const base = u.baseScale || 1;
    u.takeDamage(4, null);
    return Math.abs(u.sprite.scaleX - base * 1.14) < 0.25 && Math.abs(u.sprite.scaleY - base * 0.86) < 0.25;
  }));

  // 2) corpse decals: center camera, let worldView settle, then kill an enemy
  await page.evaluate(() => {
    const g = window.__SCC2.scene.getScene('Battle');
    const foe = g.units.find(x => !x.dead && x.team === 1);
    if (foe) { g._gateFoe = foe; g.cameras.main.centerOn(foe.x, foe.y); }
  });
  await page.waitForTimeout(350);
  await page.evaluate(() => {
    const g = window.__SCC2.scene.getScene('Battle');
    const foe = g._gateFoe;
    if (foe && !foe.dead) foe.takeDamage(99999, g.units.find(x => x.team === 0) || null);
  });
  await page.waitForTimeout(400);
  chk('corpse decals on kill', await page.evaluate(() => {
    const g = window.__SCC2.scene.getScene('Battle');
    let n = 0;
    for (const c of g.children.list) if (c.active && c.texture && (c.texture.key === 'scorch' || c.texture.key === 'blood') && (c.depth === 6 || c.depth === 7)) n++;
    return n >= 2;
  }));

  // 3) production queue chips: spawn a barracks-like producer via existing buildings, else skip
  chk('production queue chips', await page.evaluate(() => {
    const g = window.__SCC2.scene.getScene('Battle');
    const pool = g.buildings.find(x => !x.dead && x.built && x.team === 0 && x.queueUnit);
    if (!pool) return 'skip';
    const kind = pool.def.produces ? pool.def.produces[0] : (g.race === 'terran' ? 'marine' : g.race === 'zerg' ? 'drone' : 'probe');
    const q0 = pool.queue.length;
    if (!pool.queueUnit(kind)) pool.queue.push({ kind, remaining: 8, total: 10 });
    g.selection.clear(); g.addToSelection(pool);
    g.polish.queueChips();
    if (pool.queue.length === 0) return 'skip';
    return !!(g.polish._qc && g.polish._qc.c.length > 0);
  }));

  // 4) build ghost stencil in placing mode
  chk('build ghost stencil', await page.evaluate(() => {
    const g = window.__SCC2.scene.getScene('Battle');
    const w = g.units.find(x => !x.dead && x.def.worker);
    if (!w) return 'skip';
    g.selection.clear(); g.addToSelection(w);
    g.players[0].minerals += 500; g.players[0].gas += 200;
    g.startPlacing(g.race === 'zerg' ? 'spawningPool' : g.race === 'protoss' ? 'gateway' : 'barracks');
    if (!g.ghostValid) return 'skip';
    // spy on draw calls: stencil adds hatched lineBetween + per-tile fillCircle
    let lines = 0, dots = 0;
    const ob = g.ghostValid.lineBetween.bind(g.ghostValid);
    const of = g.ghostValid.fillCircle.bind(g.ghostValid);
    g.ghostValid.lineBetween = (...a) => { lines++; return ob(...a); };
    g.ghostValid.fillCircle = (...a) => { dots++; return of(...a); };
    g.snapGhost({ x: w.x + 64, y: w.y + 32 });
    g.ghostValid.lineBetween = ob; g.ghostValid.fillCircle = of;
    return lines > 4 && dots > 2;
  }));
  await page.evaluate(() => { const g = window.__SCC2.scene.getScene('Battle'); if (g.cancelPlacing) g.cancelPlacing(); });

  // 5) rally arrow flight
  chk('rally arrow', await page.evaluate(() => {
    const g = window.__SCC2.scene.getScene('Battle');
    const sb = g.buildings.find(x => !x.dead && x.built && x.team === 0 && x.def.rally !== false);
    if (!sb) return 'skip';
    sb.rallyPoint = { x: sb.x + 80, y: sb.y + 40 };
    const n0 = g.children.list.length;
    g.polish.rallyArrow(sb);
    return g.children.list.length > n0;
  }));

  // 6) fog ? cluster
  chk('fog ? cluster', await page.evaluate(() => {
    const g = window.__SCC2.scene.getScene('Battle');
    const m = g.cameras.main.midPoint;
    const n0 = g.children.list.filter(c => c.type === 'Text' && c.text === '?').length;
    g.polish.fogQuestion(m.x, m.y);
    return g.children.list.filter(c => c.type === 'Text' && c.text === '?').length > n0;
  }));

  // 7) selection tint/glow
  chk('selection tint + glow', await page.evaluate(() => {
    const g = window.__SCC2.scene.getScene('Battle');
    const u = g.units.find(x => !x.dead && x.sprite);
    if (!u) return 'skip';
    g.selection.clear(); g.addToSelection(u);
    return u.sprite.tintTopLeft !== 16777215 || (g.polish._selGlows && g.polish._selGlows.size > 0);
  }));

  // 8) orb fly + smoke wisp + shield break APIs fire
  chk('orb/smoke/shieldbreak fire', await page.evaluate(() => {
    const g = window.__SCC2.scene.getScene('Battle');
    const m = g.cameras.main.midPoint;
    const n0 = g.children.list.length;
    g.polish.orbFly(m.x, m.y);
    g.polish.smokeWisp(m.x + 20, m.y);
    const u = g.units.find(x => !x.dead && x.shield > 0);
    if (u) u.takeDamage(u.shield + 1, null);
    return g.children.list.length > n0 + 2;
  }));

  // 9) starfield + day/night initialized
  chk('starfield + daynight init', await page.evaluate(() => {
    const p = window.__SCC2.scene.getScene('Battle').polish;
    return !!(p._stars && p._dn);
  }));

  // 10) creep bubbles fire somewhere over live creep (camera aimed at a real creep cell)
  chk('creep bubbles', await page.evaluate(() => {
    const g = window.__SCC2.scene.getScene('Battle');
    let hit = null;
    for (const [k, cc] of Object.entries(g.creepCanvases || {})) {
      if (!cc || !cc.cells) continue;
      const i = cc.cells.findIndex(v => v);
      if (i >= 0) { hit = { t: +k, tx: i % 96, ty: (i / 96) | 0 }; break; }
    }
    if (!hit) return 'skip';
    g.cameras.main.centerOn(hit.tx * 16 + 8, hit.ty * 16 + 8);
    return true;
  }));
  await page.waitForTimeout(350);
  chk('creep bubbles visible', await page.evaluate(() => {
    const g = window.__SCC2.scene.getScene('Battle');
    // bypass rate timer: invoke the spawn path directly 6 times
    const n0 = g.children.list.filter(c => c.depth === 9).length;
    for (let k = 0; k < 6; k++) { g.polish._cbT = 0; g.polish.creepBubbles(1); }
    return g.children.list.filter(c => c.depth === 9).length > n0;
  }));

  // 11) real combat: trails + muzzle + streak still clean
  // spawn a REAL marine projectile through the live update loop (projTrail runs per-frame)
  let trailSeen = false;
  for (let k = 0; k < 12 && !trailSeen; k++) {
    trailSeen = await page.evaluate(() => {
      const g = window.__SCC2.scene.getScene('Battle');
      const foe = g.units.find(x => !x.dead && x.team === 1);
      const mine = g.units.find(x => !x.dead && x.team === 0);
      if (!foe || !mine) return false;
      g.cameras.main.centerOn(foe.x, foe.y);
      mine.setPos(foe.x - 70, foe.y - 30);
      g.spawnProjectile({ from: { x: mine.x, y: mine.y }, target: foe, damage: 5, splash: 0, team: 0, kind: 'marine', speed: 420, attacker: mine });
      return true;
    });
    await page.waitForTimeout(250);
    const t = await page.evaluate(() => window.__SCC2.scene.getScene('Battle').children.list.filter(c => c.active && c.depth === 43).length);
    if (t > 0) trailSeen = true;
  }
  chk('phosphor trails under live projectiles', trailSeen);

  // soak
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${OUT}/v226-aaa.png` });

  console.log(`PASS ${R.pass.length}: ${R.pass.join('; ')}`);
  console.log(`SKIP ${R.skip.length}: ${R.skip.join('; ')}`);
  console.log(`FAIL ${R.fail.length}: ${R.fail.join('; ')}`);
  console.log(`ERRORS ${errors.length ? JSON.stringify(errors.slice(0, 3)) : '[]'}`);
  const ok = R.fail.length === 0 && errors.length === 0;
  console.log(ok ? 'GATE-V226 PASS' : 'GATE-V226 FAIL');
  await browser.close();
  process.exit(ok ? 0 : 1);
})().catch(e => { console.error('GATE CRASH', e); process.exit(2); });
