// Playability probe v2 — real-mouse end-to-end in a NON-tutorial battle.
// 1) boot -> Title (screenshot) 2) direct Battle (no tutorial) 3) select
// real worker(s), real right-click move to walkable target, sample trail
// 4) harvest order via right-click on a mineral 5) control-group recall.
// Usage: SCC_URL=http://127.0.0.1:4178/scc/ NODE_PATH=$(npm root -g) node scripts/probe-playability.cjs
const { chromium } = require('playwright');
const URL = process.env.SCF_URL || process.env.SCC_URL || 'http://127.0.0.1:4178/scc/';
const errors = [];
let PASS = 0, FAIL = 0;
const ok = (id, cond, extra = '') => { if (cond) { PASS++; console.log(`PASS ${id} ${extra}`); } else { console.log(`FAIL ${id} ${extra}`); FAIL++; } };

(async () => {
  const browser = await chromium.launch({ headless: false, args: ['--use-gl=angle', '--enable-gpu'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

  // ---------- 1) COLD BOOT -> TITLE ----------
  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__SCC2 && window.__SCC2.scene.isActive('Title'), null, { timeout: 30000 });
  const titleBtns = await page.evaluate(() => {
    const t = window.__SCC2.scene.getScene('Title');
    return t.children.list.filter(c => c.input && c.input.enabled).length;
  });
  ok('TITLE_HAS_CONTROLS', titleBtns >= 3, `interactive=${titleBtns}`);
  await page.screenshot({ path: '/tmp/play-02-title.png' });

  // ---------- 2) REAL BATTLE (mission 1 style, no tutorial) ----------
  await page.evaluate(() => {
    const sm = window.__SCC2.scene;
    for (const s of sm.getScenes(true)) { if (s.scene.key !== 'Boot' && s.scene.key !== 'Preload') sm.stop(s.scene.key); }
    sm.start('Hud', { race: 'terran' });
    sm.start('Battle', { race: 'terran', enemyRace: 'skarn', difficulty: 'easy' });
  });
  await page.waitForFunction(() => { const b = window.__SCC2.scene.getScene('Battle'); return b && b.units && b.units.some(u => u.def && u.def.worker && !u.dead); }, null, { timeout: 30000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: '/tmp/play-10-battle-start.png' });

  // ---------- 3) click-select a worker, right-click move, measure ----------
  const setup = await page.evaluate(() => {
    const b = window.__SCC2.scene.getScene('Battle');
    const w = b.units.find(u => u.def && u.def.worker && !u.dead);
    const cam = b.cameras.main;
    // pick a walkable target ~120px away along +x: use nav truth
    const TILE = 16;
    const tx0 = Math.floor(w.x / TILE), ty0 = Math.floor(w.y / TILE);
    let target = null;
    for (let dx = 8; dx <= 10; dx++) {
      const tx = tx0 + dx, ty = ty0;
      if (b.nav.walkable ? b.nav.walkable(tx, ty) : !b.nav.solid[b.nav.idx(tx, ty)]) { target = { x: tx * TILE + 8, y: ty * TILE + 8 }; break; }
    }
    const toScreen = (x, y) => ({ x: (x - cam.worldView.x) * cam.zoom, y: (y - cam.worldView.y) * cam.zoom });
    return { wp: toScreen(w.x, w.y), tp: target ? toScreen(target.x, target.y) : null, target, unitPos: { x: w.x, y: w.y } };
  });
  console.log('MOVE_SETUP=' + JSON.stringify(setup));
  if (setup.tp && setup.tp.x > 0 && setup.tp.x < 1280 && setup.tp.y > 0 && setup.tp.y < 800) {
    await page.mouse.click(setup.wp.x, setup.wp.y);           // select worker
    const sel1 = await page.evaluate(() => { const b = window.__SCC2.scene.getScene('Battle'); const s = b.selection; return s && (s.count ? s.count() : s.length !== undefined ? s.length : (s.set ? s.set.size : 'obj')); });
    console.log('SELECTED=' + JSON.stringify(sel1));
    const t0 = Date.now();
    await page.mouse.click(setup.tp.x, setup.tp.y, { button: 'right' });  // move order
    let arrived = false, stuck = false, samples = [];
    for (let i = 0; i < 20; i++) {
      const p = await page.evaluate(() => {
        const b = window.__SCC2.scene.getScene('Battle');
        const u = b.units.find(x => x.def && x.def.worker && !x.dead);
        return { x: u.x, y: u.y, order: u.order && u.order.type, pathLen: (u.path || []).length, pathIndex: u.pathIndex };
      });
      samples.push(`${Math.round((Date.now() - t0) / 1000)}s:${p.x.toFixed(0)},${p.y.toFixed(0)} o=${p.order} p=${p.pathIndex}/${p.pathLen}`);
      if (Math.hypot(p.x - setup.target.x, p.y - setup.target.y) < 12) { arrived = true; break; }
      if (i >= 8 && p.order !== 'move' && p.order !== 'harvest') { stuck = true; }
      await page.waitForTimeout(1000);
    }
    console.log('MOVE_SAMPLES=' + samples.join(' | '));
    ok('UNIT_MOVES_TO_ORDER', arrived, `arrived=${arrived} stuck=${stuck}`);
    await page.screenshot({ path: '/tmp/play-11-move-end.png' });

    // ---------- 4) right-click a mineral -> harvest resumes ----------
    const mine = await page.evaluate(() => {
      const b = window.__SCC2.scene.getScene('Battle');
      const m = b.minerals && b.minerals.find(mm => !mm.depleted && mm.x < 2000);
      if (!m) return null;
      const cam = b.cameras.main;
      return { mx: m.x, my: m.y, sx: (m.x - cam.worldView.x) * cam.zoom, sy: (m.y - cam.worldView.y) * cam.zoom, inView: m.x >= cam.worldView.x && m.x <= cam.worldView.right };
    });
    if (mine && mine.inView && mine.sx > 0 && mine.sx < 1280) {
      await page.mouse.click(setup.wp.x, setup.wp.y);
      await page.mouse.click(mine.sx, mine.sy, { button: 'right' });
      let harvesting = false;
      for (let i = 0; i < 10; i++) {
        const st = await page.evaluate(() => { const b = window.__SCC2.scene.getScene('Battle'); const u = b.units.find(x => x.def && x.def.worker && !u_dead_check(x)); function u_dead_check(x) { return x.dead; } return { order: u && u.order && u.order.type, cargo: u && u.cargo }; });
        if (st.order === 'harvest' || (st.cargo || 0) > 0) { harvesting = true; break; }
        await page.waitForTimeout(1000);
      }
      ok('HARVEST_ORDER', harvesting, JSON.stringify(mine));
    } else {
      ok('HARVEST_ORDER', false, 'no mineral in view: ' + JSON.stringify(mine));
    }

    // ---------- 5) control group assign + recall ----------
    await page.evaluate(() => { const b = window.__SCC2.scene.getScene('Battle'); const s = b.selection; const u = b.units.find(x => x.def && x.def.worker && !x.dead); if (s.clear) s.clear(); if (s.add) s.add(u); else s.push(u); if (u) u.selected = true; });
    await page.keyboard.press('Digit1');
    await page.waitForTimeout(200);
    await page.evaluate(() => { const b = window.__SCC2.scene.getScene('Battle'); b.selection.clear && b.selection.clear(); });
    await page.waitForTimeout(200);
    await page.keyboard.press('Digit1');
    const grp = await page.evaluate(() => { const b = window.__SCC2.scene.getScene('Battle'); const s = b.selection; return s && (s.count ? s.count() : s.length !== undefined ? s.length : (s.set ? s.set.size : 0)); });
    ok('CONTROL_GROUP', (grp || 0) >= 1, `after Digit1 recall selected=${JSON.stringify(grp)}`);
  } else {
    ok('UNIT_MOVES_TO_ORDER', false, 'no valid walkable target in view');
  }

  ok('NO_PAGE_ERRORS', errors.length === 0, errors.slice(0, 3).join(' | '));
  console.log(`\nRESULT PLAYABILITY ${FAIL === 0 ? 'PASS' : 'FAIL'} ${PASS}/${PASS + FAIL}`);
  await browser.close();
  process.exit(FAIL === 0 ? 0 : 1);
})().catch(e => { console.error('PROBE ERROR', String(e).slice(0, 400)); process.exit(1); });
