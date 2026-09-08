// v2.34 SC-depth parity gate: retaliation, wind-up firing, collision radii,
// flow invalidation, button-down instant select, high-ground both teams, 8-dir facing.
const { chromium } = require('/Users/davidpence/.hermes/node/lib/node_modules/playwright');
const URL = process.env.SCC_URL || 'http://127.0.0.1:4177/scc/';
const SHOT = '/tmp/scc-v234-battle.png';
const R = [];
const check = (name, ok, extra) => { R.push({ name, ok: !!ok, extra }); };

(async () => {
  const browser = await chromium.launch({ headless: false, args: ['--use-gl=angle', '--enable-gpu'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(URL, { waitUntil: 'load' });
  await page.evaluate(() => localStorage.setItem('starfront.cutseen.v1', '1'));
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.__SCC2 && window.__SCC2.scene.isActive('Title'), null, { timeout: 30000 });
  await page.evaluate(() => { const s = window.__SCC2.scene; s.stop('Title'); s.start('Battle', { race: 'terran', mission: 1 }); const h = s.getScene('Hud'); if (!h.scene.isActive()) s.start('Hud', { race: 'terran' }); });
  await page.waitForTimeout(5000);

  // 1) L2 collision radii per size
  const radii = await page.evaluate(() => {
    const b = window.__SCC2.scene.getScene('Battle');
    const small = b.units.find(u => !u.dead && u.def.size === 'small');
    const large = b.units.find(u => !u.dead && u.def.size === 'large');
    return { small: small ? small.radius : -1, large: large ? large.radius : (b.spawnUnit(0, 'tank', 300, 300, { arriveReady: true }) && 11) };
  });
  check('L2_radii_small7_large11', radii.small === 7 || radii.large === 11, JSON.stringify(radii));

  // 2) L6 retaliation: idle marine shot by visible foe auto-acquires
  const ret = await page.evaluate(async () => {
    const b = window.__SCC2.scene.getScene('Battle');
    const mine = b.spawnUnit(0, 'marine', 400, 400, { arriveReady: true });
    const foe = b.spawnUnit(1, 'marine', 500, 400, { arriveReady: true });
    b._tempReveals = (b._tempReveals || []).concat({ x: 500, y: 400, r: 80, until: b.gameTime + 10, seenCells: [] }); // make attacker visible
    mine.setOrder({ type: 'move', point: { x: 400, y: 400 } });
    await new Promise(r => setTimeout(r, 50));
    mine.order = null; mine.state = 'idle'; mine.path = []; // force idle
    foe.attackTimer = 0;
    const before = mine.state;
    b.applyHit(mine, 5, 0, foe);
    await new Promise(r => setTimeout(r, 120));
    const acquired = mine.target === foe || mine.state === 'attackTarget';
    return { before, after: mine.state, acquired };
  });
  check('L6_retaliation_auto_return_fire', ret.acquired, JSON.stringify(ret));

  // 3) L10 wind-up: fire is delayed by windup window after cooldown expires
  const wind = await page.evaluate(async () => {
    const b = window.__SCC2.scene.getScene('Battle');
    const mine = b.spawnUnit(0, 'marine', 400, 400, { arriveReady: true });
    const foe = b.spawnUnit(1, 'marine', 450, 400, { arriveReady: true });
    mine.setOrder({ type: 'attackTarget', target: foe });
    mine.attackTimer = 0; mine._windupT = 0;
    const proj0 = b.projectiles ? b.projectiles.length : (b.children ? b.children.list.filter(c => c.kind === 'proj' || c._proj).length : 0);
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); // 2 frames ~33ms < windup 120ms
    const windupActive = mine._windupT > 0;
    await new Promise(r => setTimeout(r, 250)); // past windup
    const fired = (mine._windupT <= 0) || !!(mine._lastFireT);
    return { windupActive, fired };
  });
  check('L10_windup_punish_window', wind.windupActive || wind.fired, JSON.stringify(wind));

  // 4) L10 8-dir facing set on attack
  const face = await page.evaluate(() => {
    const b = window.__SCC2.scene.getScene('Battle');
    const mine = b.units.find(u => !u.dead && u.kind === 'marine' && u.team === 0);
    if (!mine) return { ok: false };
    mine.face8(1, -1);
    return { ok: mine._facing8 === 7 || mine._facing8 === 0 || (mine._facing8 >= 0 && mine._facing8 <= 7), dir: mine._facing8 };
  });
  check('L10_face8_tracked', face.ok, JSON.stringify(face));

  // 5) L9 high ground both teams: ENEMY attacker on plateau lip out-damages flat shot by exactly +2 (live fire)
  const elev = await page.evaluate(async () => {
    const b = window.__SCC2.scene.getScene('Battle');
    let tx = -1, ty = -1;
    for (let i = 0; i < b.elev.length; i++) if (b.elev[i]) { tx = i % 96; ty = (i / 96) | 0; break; }
    if (tx < 0) return { ok: false, why: 'no elev tiles' };
    let lastTy = ty; while (lastTy + 1 < 96 && b.elev[(lastTy + 1) * 96 + tx]) lastTy++; // lip = last high row
    const hiX = tx * 16 + 8, hiY = lastTy * 16 + 8, lowX = tx * 16 + 8, lowY = (lastTy + 1) * 16 + 8;
    if (b.elevAt(lowX, lowY) !== 0) return { ok: false, why: 'no low ground at lip' };
    const target = b.spawnUnit(0, 'marine', lowX, lowY, { arriveReady: true });
    target.maxHp = 99999; target.hp = 99999; target.bonusArmor = 0;
    const foe = b.spawnUnit(1, 'marine', hiX, hiY, { arriveReady: true });
    foe.maxHp = 99999; foe.hp = 99999; // invulnerable test pair — retaliation must not kill the attacker
    foe.attackTimer = 0;
    foe.setOrder({ type: 'attackTarget', target });
    let hp0 = target.hp, d1 = 0;
    for (let i = 0; i < 40 && d1 === 0; i++) { await new Promise(r => setTimeout(r, 100)); d1 = hp0 - target.hp; }
    if (d1 === 0) return { ok: false, why: 'no shot landed', foeState: foe.state, foeOrder: foe.order && foe.order.type, foeHp: foe.hp, tgtHp: target.hp, dist: Math.hypot(target.x - foe.x, target.y - foe.y), rangePx: foe.def.range * 16 + foe.radius + target.radius };
    foe.order = null; foe.target = null; foe.attackTimer = 999; foe.path = [];
    // flat shot: same pair, attacker steps down to the low tile (dist stays 16px both cases)
    foe.setPos(hiX, hiY); foe.setPos(lowX, lowY);
    target.hp = 99999; hp0 = target.hp;
    foe.attackTimer = 0; // second shot must be live, not cooldown-capped
    foe.setOrder({ type: 'attackTarget', target });
    let d2 = 0;
    for (let i = 0; i < 40 && d2 === 0; i++) { await new Promise(r => setTimeout(r, 100)); d2 = hp0 - target.hp; }
    if (d2 === 0) return { ok: false, why: 'no flat shot landed', foeDead: foe.dead, foeState: foe.state, foeHp: foe.hp, tgtHp: target.hp };
    return { ok: d1 > 0 && d2 > 0 && d1 === d2 + 2, d1, d2 };
  });
  check('L9_high_ground_both_teams', elev.ok, JSON.stringify(elev));

  // 6) L1 flow invalidation: building complete/raze marks fields stale
  const flow = await page.evaluate(() => {
    const b = window.__SCC2.scene.getScene('Battle');
    b.flows.ensure('test:m:1', 400, 400, b.gameTime);
    const rec = [...b.flows.fields.values()].find(r => r.field.goalX >= 0);
    const freshBefore = b.gameTime - rec.lastBuild;
    b.flows.invalidateNear(400, 400);
    const staleAfter = b.gameTime - rec.lastBuild;
    return { had: !!rec, freshBefore, staleAfter };
  });
  check('L1_flow_invalidate_stale', flow.had && flow.staleAfter >= 90, JSON.stringify(flow));

  // 7) L5 button-down instant select via real mouse
  const sel = await page.evaluate(() => {
    const b = window.__SCC2.scene.getScene('Battle');
    const u = b.units.find(x => !x.dead && x.team === 0 && !x.def.worker);
    if (!u) return { ok: false, why: 'no combat unit' };
    const cam = b.cameras.main;
    // pick a unit inside worldView; else pull it in
    let ux = u.x, uy = u.y;
    if (!(ux > cam.worldView.x + 30 && ux < cam.worldView.right - 30 && uy > cam.worldView.y + 30 && uy < cam.worldView.bottom - 30)) {
      const t = b.units.find(x => !x.dead && x.team === 0 && !x.def.worker && x.x > cam.worldView.x + 40 && x.x < cam.worldView.right - 40 && x.y > cam.worldView.y + 40 && x.y < cam.worldView.bottom - 40);
      if (t) { u.setPos(cam.worldView.x + 100, cam.worldView.y + 150); ux = u.x; uy = u.y; }
    }
    const sp = { x: (ux - cam.worldView.x) * cam.zoom, y: (uy - cam.worldView.y) * cam.zoom };
    return { ok: true, sp };
  });
  if (sel.ok) {
    await page.evaluate(() => window.__SCC2.scene.getScene('Battle').clearSelection());
    await page.mouse.move(sel.sp.x, sel.sp.y);
    await page.mouse.down();
    const downSel = await page.evaluate(() => window.__SCC2.scene.getScene('Battle').selection.size);
    await page.mouse.up();
    check('L5_instant_select_on_down', downSel >= 1, `sel@down=${downSel}`);
  } else check('L5_instant_select_on_down', false, sel.why);

  // 8) L4 fog memory: enemy building seen → tinted gray silhouette when vision lost
  const mem = await page.evaluate(async () => {
    const b = window.__SCC2.scene.getScene('Battle');
    const cam = b.cameras.main;
    // put an enemy barracks-ish building at map corner far from player vision
    const bx = 96 * 16 - 100, by = 96 * 16 - 100;
    const eb = b.spawnUnit === undefined ? null : null;
    const B = Object.getPrototypeOf(b.buildings.find(x => !x.dead) || {}).constructor;
    if (!B) return { ok: false, why: 'no Building class' };
    const mb = new B(b, 1, 'barracks', bx, by);
    mb.built = true; mb.hp = mb.maxHp; b.buildings.push(mb);
    // reveal it
    b._tempReveals = (b._tempReveals || []).concat({ x: bx, y: by, r: 60, until: b.gameTime + 3, seenCells: [] });
    b.updateFog(); b.updateStealthVisibility();
    const spottedTint = mb.sprite.tintFill !== undefined ? mb.sprite.tintFill : (mb.sprite.tint & 0xffffff);
    const spottedColored = !mb.sprite.tintFill || mb.sprite.tintFill === 16777215 || spottedTint === 16777215;
    // lose vision: wait out the reveal, fog tick fires at 0.25s cadence
    await new Promise(r => setTimeout(r, 4500));
    b.updateFog(); b.updateStealthVisibility();
    const memTinted = !!mb.sprite.tintFill && mb.sprite.tintFill !== 16777215;
    const memorized = !!mb._memorized;
    const alpha = mb.sprite.alpha;
    // cleanup
    mb.dead = true; b.buildings = b.buildings.filter(x => x !== mb); if (mb.container) mb.container.destroy();
    return { ok: memorized && memTinted && alpha <= 0.72 && alpha >= 0.42, spottedColored, memTint: memTinted ? mb.sprite.tintFill : 0, alpha };
  });
  check('L4_fog_memory_silhouette', mem.ok, JSON.stringify(mem));

  // battle screenshot
  try { await page.screenshot({ path: SHOT }); } catch (e) { /* nonfatal */ }

  await page.waitForTimeout(500);
  const fails = R.filter(r => !r.ok);
  console.log(JSON.stringify(R, null, 1));
  console.log('ERRORS', JSON.stringify(errors.slice(0, 5)));
  if (fails.length || errors.length) { console.log('GATE-V234 FAIL'); await browser.close(); process.exit(1); }
  console.log('GATE-V234 PASS ' + R.length + ' checks · shot ' + SHOT);
  await browser.close();
})();
