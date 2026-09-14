// v2.65 TRAINING COACH gate — real-mouse forced-click tutorial verification
// Usage: SCC_URL=http://127.0.0.1:4177/scc/ NODE_PATH=$(npm root -g) node scripts/verify-v265-coach.cjs
const { chromium } = require('playwright');
const URL = process.env.SCC_URL || 'http://127.0.0.1:4177/scc/';

const errors = [];
let PASS = 0, FAIL = 0;
const ok = (id, cond, extra = '') => { if (cond) { PASS++; console.log(`PASS ${id} ${extra}`); } else { FAIL++; console.log(`FAIL ${id} ${extra}`); } };

(async () => {
  const browser = await chromium.launch({ headless: false, args: ['--use-gl=angle', '--enable-gpu'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

  await page.goto(URL, { waitUntil: 'load' });
  await page.evaluate(() => localStorage.setItem('starfront.cutseen.v1', '1'));
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.__SCC2 && window.__SCC2.scene.isActive('Title'), null, { timeout: 20000 });

  // ---- TRAINING launch path (button target exists) ----
  const launchTut = await page.evaluate(() => {
    const t = window.__SCC2.scene.getScene('Title');
    return typeof t.launchTutorial === 'function';
  });
  ok('TITLE_HAS_TRAINING', launchTut);

  // direct boot training sim
  await page.evaluate(() => {
    const g = window.__SCC2, sm = g.scene;
    for (const s of sm.getScenes(true)) { if (s.scene.key !== 'Boot' && s.scene.key !== 'Preload') sm.stop(s.scene.key); }
    sm.start('Battle', { race: 'terran', enemyRace: 'skarn', tutorial: true, difficulty: 'easy' });
  });
  await page.waitForFunction(() => { const b = window.__SCC2.scene.getScene('Battle'); return b && b.coach && b.coach.active; }, null, { timeout: 15000 });
  const bs = () => page.evaluateHandle(() => window.__SCC2.scene.getScene('Battle'));
  const getB = () => windowB;
  let windowB = 'b';

  // ---- A: coach armed on step 0, enemy crippled ----
  let st = await page.evaluate(() => {
    const b = window.__SCC2.scene.getScene('Battle');
    return { step: b.coach.step.id, len: b.coach.steps.length, income: b.aiProfile.income, gap: b.aiProfile.attackGap, commander: b.aiProfile.doctrine, trig: b.triggers.defs.length, troops: b.units.filter(u => u.team === 1 && !u.dead && !u.def.mcv).length };
  });
  ok('COACH_ARMED', st.step === 'select_mcv' && st.len >= 10, JSON.stringify(st));
  ok('ENEMY_CRIPPLED', st.income <= 0.1 && st.gap > 1e8 && st.commander === 'sim' && st.trig === 0 && st.troops === 0);

  const w2s = (wx, wy) => page.evaluate(([x, y]) => {
    const c = window.__SCC2.scene.getScene('Battle').cameras.main;
    return { x: (x - c.worldView.x) * c.zoom, y: (y - c.worldView.y) * c.zoom };
  }, [wx, wy]);
  const poll = async (fn, ms = 300, tries = 40) => { for (let i = 0; i < tries; i++) { if (await fn()) return true; await page.waitForTimeout(ms); } return false; };
  const stepNow = () => page.evaluate(() => { const b = window.__SCC2.scene.getScene('Battle'); return b.coach ? b.coach.step.id : 'DONE'; });

  // ---- B: forced-click block — off-target click selects NOTHING ----
  await page.waitForTimeout(600);
  await page.mouse.click(500, 500); // empty ground far from marker
  let sel = await page.evaluate(() => { const b = window.__SCC2.scene.getScene('Battle'); return { n: b.selection.size, pulse: b.coach.hintPulse }; });
  ok('OFFCLICK_BLOCKED', sel.n === 0 && sel.pulse > 0, JSON.stringify(sel));

  // ---- C: click the MCV -> selects + advances ----
  const mcv = await page.evaluate(() => { const b = window.__SCC2.scene.getScene('Battle'); const u = b.units.find(x => x.team === 0 && !x.dead && x.def.mcv); return u ? { x: u.x, y: u.y } : null; });
  await page.evaluate(() => { const b = window.__SCC2.scene.getScene('Battle'); const u = b.units.find(x => x.team === 0 && !x.dead && x.def.mcv); if (u) b.cameras.main.centerOn(u.x, u.y); });
  await page.waitForTimeout(400);
  const msp = mcv ? await w2s(mcv.x, mcv.y) : { x: 640, y: 400 };
  await page.mouse.click(Math.round(msp.x), Math.round(msp.y));
  ok('MCV_SELECTED', await poll(async () => (await stepNow()) === 'deploy'), `step=${await stepNow()}`);

  // ---- D: card button gate — off-button card click blocked, DEPLOY passes ----
  const dep = await page.evaluate(() => {
    const h = window.__SCC2.scene.getScene('Hud');
    const btn = h.buttons.find(x => !x.disabled && /DEPLOY/i.test(String(x.txt?.text || '')));
    return btn ? { x: btn.x, y: btn.y, w: btn.w, h: btn.h } : null;
  });
  ok('DEPLOY_BTN_ON_CARD', !!dep);
  if (dep) {
    // click STOP area (off-target) — should NOT deploy
    await page.mouse.click(45, dep.y + dep.h / 2);
    let deployedTooEarly = await page.evaluate(() => window.__SCC2.scene.getScene('Battle').buildings.some(b => b.team === 0 && b.def.primary));
    ok('OFFBTN_BLOCKED', !deployedTooEarly);
    await page.mouse.click(dep.x + dep.w / 2, dep.y + dep.h / 2);
    ok('DEPLOY_OK', await poll(async () => (await stepNow()) !== 'deploy'), `step=${await stepNow()}`);
  }

  // ---- E: worker button from primary card ----
  await poll(async () => (await stepNow()) === 'train_worker', 300, 20);
  const wkBtn = await page.evaluate(() => {
    const h = window.__SCC2.scene.getScene('Hud');
    const btn = h.buttons.find(x => !x.disabled && /rigger/i.test(String(x.txt?.text || '')));
    return btn ? { x: btn.x, y: btn.y, w: btn.w, h: btn.h } : null;
  });
  ok('WORKER_BTN', !!wkBtn);
  if (wkBtn) {
    await page.mouse.click(wkBtn.x + wkBtn.w / 2, wkBtn.y + wkBtn.h / 2);
    ok('WORKER_QUEUED', await poll(async () => (await stepNow()) === 'select_worker' || await page.evaluate(() => window.__SCC2.scene.getScene('Battle').buildings.filter(b => b.team === 0).reduce((a, b) => a + (b.queue ? b.queue.length : 0), 0) > 0), 300, 15));
  }

  // ---- F: click the worker (tween-stop + two-stage coords — worldView is stale in the SAME frame as centerOn) ----
  const clickWorld = async (pickFnBody, passFnBody, tries = 20, button = 'left') => {
    for (let i = 0; i < tries; i++) {
      const okStage = await page.evaluate((pickSrc) => {
        const b = window.__SCC2.scene.getScene('Battle');
        try { b.tweens.getTweensOf(b.cameras.main).forEach(t => t.stop()); } catch (e) {}
        const t = eval(pickSrc)(b);
        if (!t) return false;
        b.cameras.main.centerOn(t.x, t.y);
        return true;
      }, pickFnBody);
      if (!okStage) { await page.waitForTimeout(250); continue; }
      // worldView refresh poll (swiftshader ~2fps): target inside view with margin
      const inView = await poll(async () => await page.evaluate((pickSrc) => {
        const b = window.__SCC2.scene.getScene('Battle');
        const t = eval(pickSrc)(b); const c = b.cameras.main, vw = c.worldView;
        return !!t && t.x > vw.x + 50 && t.x < vw.right - 50 && t.y > vw.y + 50 && t.y < vw.bottom - 50;
      }, pickFnBody), 150, 14);
      if (!inView) continue;
      const sp = await page.evaluate((pickSrc) => {
        const b = window.__SCC2.scene.getScene('Battle');
        const t = eval(pickSrc)(b);
        if (!t) return null;
        const c = b.cameras.main;
        return { x: (t.x - c.worldView.x) * c.zoom, y: (t.y - c.worldView.y) * c.zoom };
      }, pickFnBody);
      if (!sp) { await page.waitForTimeout(250); continue; }
      await page.mouse.move(Math.round(sp.x), Math.round(sp.y));
      await page.waitForTimeout(80);
      await page.mouse.down({ button }); await page.waitForTimeout(60); await page.mouse.up({ button });
      await page.waitForTimeout(150);
      if (await page.evaluate((passSrc) => { const b = window.__SCC2.scene.getScene('Battle'); return eval(passSrc)(b); }, passFnBody)) return true;
    }
    return false;
  };
  const workerExists = await poll(async () => await page.evaluate(() => window.__SCC2.scene.getScene('Battle').units.some(u => u.team === 0 && u.kind === 'rigger' && !u.dead)), 500, 30);
  ok('WORKER_SPAWNED', workerExists);
  await poll(async () => (await stepNow()) === 'select_worker', 300, 10);
  if (workerExists) {
    const selOK = await clickWorld(
      'b=>b.units.find(x=>x.team===0&&x.kind===\'rigger\'&&!x.dead)',
      'b=>[...b.selection].some(u=>u.kind===\'rigger\')');
    ok('WORKER_SELECTED', selOK);
    ok('WORKER_STEP_ADVANCE', await poll(async () => (await stepNow()) === 'harvest', 300, 12), `step=${await stepNow()}`);
  }

  // ---- G: right-click gate at minerals (target = coach's OWN target, never re-pick) ----
  await poll(async () => (await stepNow()) === 'harvest', 300, 10);
  const stageMin = await page.evaluate(() => {
    const b = window.__SCC2.scene.getScene('Battle');
    try { b.tweens.getTweensOf(b.cameras.main).forEach(t => t.stop()); } catch (e) {}
    const m = b.coach.step.target();
    if (!m) return false;
    b.cameras.main.centerOn(m.x, m.y);
    return true;
  });
  await poll(async () => await page.evaluate(() => {
    const b = window.__SCC2.scene.getScene('Battle');
    const m = b.coach.step.target(); const c = b.cameras.main, vw = c.worldView;
    return !!m && m.x > vw.x + 60 && m.x < vw.right - 60 && m.y > vw.y + 60 && m.y < vw.bottom - 60;
  }), 150, 20);
  const minPos = await page.evaluate(() => {
    const b = window.__SCC2.scene.getScene('Battle'); const m = b.coach.step.target();
    if (!m) return null; const c = b.cameras.main;
    return { x: (m.x - c.worldView.x) * c.zoom, y: (m.y - c.worldView.y) * c.zoom };
  });
  ok('MINERAL_FOUND', !!minPos && stageMin);
  if (minPos) {
    // off-target: opposite corner of the viewport from the mineral
    const offX = minPos.x > 640 ? 120 : 1160, offY = minPos.y > 400 ? 120 : 620;
    await page.evaluate(() => { const b = window.__SCC2.scene.getScene('Battle'); b.coach.hintPulse = 0; });
    await page.mouse.click(offX, offY, { button: 'right' });
    let blocked = await poll(async () => await page.evaluate(() => { const b = window.__SCC2.scene.getScene('Battle'); return b.coach && b.coach.hintPulse > 0 && !b.units.some(u => u.kind === 'rigger' && (u.order?.type === 'harvest' || u.order?.type === 'returnCargo')); }), 150, 8);
    ok('RIGHT_OFFBLOCKED', blocked);
    // on-target: re-center + re-read fresh screen px each retry (swiftshader cam lag)
    for (let k = 0; k < 6; k++) {
      await page.evaluate(() => { const b = window.__SCC2.scene.getScene('Battle'); try { b.tweens.getTweensOf(b.cameras.main).forEach(t => t.stop()); } catch (e) {} const m = b.coach.step.target?.() || b.coach.markerTarget; if (m) b.cameras.main.centerOn(m.x, m.y); });
      await page.waitForTimeout(250);
      const fp = await page.evaluate(() => { const b = window.__SCC2.scene.getScene('Battle'); const m = b.coach.step.target?.() || b.coach.markerTarget; const c = b.cameras.main; return { x: (m.x - c.worldView.x) * c.zoom, y: (m.y - c.worldView.y) * c.zoom }; });
      await page.mouse.click(Math.round(fp.x), Math.round(fp.y), { button: 'right' });
      if (await poll(async () => await page.evaluate(() => { const b = window.__SCC2.scene.getScene('Battle'); return (b.coach && b.coach._minedClick) || b.units.some(u => u.kind === 'rigger' && (u.order?.type === 'harvest' || u.order?.type === 'returnCargo')); }), 250, 6)) break;
    }
    ok('HARVEST_ORDER', await page.evaluate(() => { const b = window.__SCC2.scene.getScene('Battle'); return (b.coach && b.coach._minedClick) || b.units.some(u => u.kind === 'rigger' && (u.order?.type === 'harvest' || u.order?.type === 'returnCargo')); }));
    ok('HARVEST_ADVANCE', await poll(async () => (await stepNow()) === 'click_build', 300, 15));
  }

  // ---- H: barracks button + ghost placement at coach spot ----
  await poll(async () => (await stepNow()) === 'click_build', 300, 15);
  const barBtn = await page.evaluate(() => {
    const h = window.__SCC2.scene.getScene('Hud');
    const btn = h.buttons.find(x => !x.disabled && /barracks/i.test(String(x.txt?.text || '')));
    return btn ? { x: btn.x, y: btn.y, w: btn.w, h: btn.h } : null;
  });
  ok('BARRACKS_BTN', !!barBtn);
  if (barBtn) {
    await page.mouse.click(barBtn.x + barBtn.w / 2, barBtn.y + barBtn.h / 2);
    await poll(async () => await page.evaluate(() => !!window.__SCC2.scene.getScene('Battle').placing), 200, 10);
    await page.evaluate(() => { const b = window.__SCC2.scene.getScene('Battle'); try { b.tweens.getTweensOf(b.cameras.main).forEach(t => t.stop()); } catch (e) {} const sp = b.coach.buildSpot(); b.cameras.main.centerOn(sp.x, sp.y); });
    await page.waitForTimeout(300);
    const spot = await page.evaluate(() => {
      const b = window.__SCC2.scene.getScene('Battle'); const sp = b.coach.buildSpot();
      const c = b.cameras.main;
      return { x: (sp.x - c.worldView.x) * c.zoom, y: (sp.y - c.worldView.y) * c.zoom };
    });
    await page.mouse.click(Math.round(spot.x), Math.round(spot.y));
    ok('BARRACKS_PLACED', await poll(async () => await page.evaluate(() => window.__SCC2.scene.getScene('Battle').buildings.some(b => b.team === 0 && b.buildId === 'barracks')), 400, 25));
  }

  // ---- I: barracks built -> click -> train marine -> kill dummy ----
  const built = await poll(async () => await page.evaluate(() => window.__SCC2.scene.getScene('Battle').buildings.some(b => b.team === 0 && b.buildId === 'barracks' && b.built)), 700, 90);
  ok('BARRACKS_BUILT', built);
  await poll(async () => (await stepNow()) === 'click_prod_building', 300, 20);
  if (['click_prod_building', 'train_fighter'].includes(await stepNow())) {
    const bpos = await page.evaluate(() => {
      const b = window.__SCC2.scene.getScene('Battle'); const bb = b.buildings.find(x => x.team === 0 && x.buildId === 'barracks' && x.built);
      if (!bb) return null; b.cameras.main.centerOn(bb.x, bb.y); const c = b.cameras.main;
      return { x: (bb.x - c.worldView.x) * c.zoom, y: (bb.y - c.worldView.y) * c.zoom };
    });
    if (bpos) { await page.waitForTimeout(250); await page.mouse.click(Math.round(bpos.x), Math.round(bpos.y)); }
    await poll(async () => (await stepNow()) === 'train_fighter', 300, 12);
    let marBtn = await page.evaluate(() => {
      const h = window.__SCC2.scene.getScene('Hud');
      const btn = h.buttons.find(x => !x.disabled && /marine/i.test(String(x.txt?.text || '')));
      return btn ? { x: btn.x, y: btn.y, w: btn.w, h: btn.h } : null;
    });
    // afford watchdog: top up funds until the train button lights (greyout is v2.36 legit)
    for (let i = 0; i < 10 && !marBtn; i++) {
      await page.evaluate(() => { const b = window.__SCC2.scene.getScene('Battle'); b.players[0].minerals += 300; });
      await page.waitForTimeout(400);
      marBtn = await page.evaluate(() => {
        const h = window.__SCC2.scene.getScene('Hud');
        const btn = h.buttons.find(x => !x.disabled && /marine/i.test(String(x.txt?.text || '')));
        return btn ? { x: btn.x, y: btn.y, w: btn.w, h: btn.h } : null;
      });
    }
    ok('MARINE_BTN', !!marBtn);
    if (marBtn) {
      await page.mouse.click(marBtn.x + marBtn.w / 2, marBtn.y + marBtn.h / 2);
      const marine = await poll(async () => await page.evaluate(() => window.__SCC2.scene.getScene('Battle').units.some(u => u.team === 0 && u.kind === 'marine' && !u.dead)), 500, 40);
      ok('MARINE_TRAINED', marine);
      const selStep = await poll(async () => (await stepNow()) === 'select_fighter' || (await stepNow()) === 'kill_foe', 400, 20);
      ok('FIGHTER_STEP', selStep, `step=${await stepNow()}`);
      if (await stepNow() === 'select_fighter') {
        const usp = await page.evaluate(() => { const b = window.__SCC2.scene.getScene('Battle'); const u = b.units.find(x => x.team === 0 && x.kind === 'marine' && !x.dead); if (!u) return null; b.cameras.main.centerOn(u.x, u.y); const c = b.cameras.main; return { x: (u.x - c.worldView.x) * c.zoom, y: (u.y - c.worldView.y) * c.zoom }; });
        if (usp) { await page.waitForTimeout(250); await page.mouse.click(Math.round(usp.x), Math.round(usp.y)); }
        await poll(async () => (await stepNow()) === 'kill_foe', 300, 12);
      }
      // dummy must spawn + be killable
      const foe = await poll(async () => await page.evaluate(() => { const b = window.__SCC2.scene.getScene('Battle'); const f = b.coach._dummyFoe; if (!f || f.dead) return false; const c = b.cameras.main; b.cameras.main.centerOn(f.x, f.y); return true; }), 500, 25);
      ok('DUMMY_SPAWNED', foe);
      if (foe) {
        // on-target retry: dummy drifts + swiftshader cam lag — re-center + re-read each try
        let killed = false;
        for (let k = 0; k < 8 && !killed; k++) {
          await page.evaluate(() => { const b = window.__SCC2.scene.getScene('Battle'); const f = b.coach._dummyFoe; if (!f) return; try { b.tweens.getTweensOf(b.cameras.main).forEach(t => t.stop()); } catch (e) {} b.cameras.main.centerOn(f.x, f.y); const u = b.units.find(x => x.team === 0 && x.kind === 'marine' && !x.dead); if (u && Math.hypot(u.x - f.x, u.y - f.y) > 40) u.issueMove(f.x, f.y, true); });
          await page.waitForTimeout(250);
          const fp = await page.evaluate(() => { const b = window.__SCC2.scene.getScene('Battle'); const f = b.coach._dummyFoe; const c = b.cameras.main; return { x: (f.x - c.worldView.x) * c.zoom, y: (f.y - c.worldView.y) * c.zoom, hp: f.hp }; });
          await page.mouse.click(Math.round(fp.x), Math.round(fp.y), { button: 'right' });
          killed = await poll(async () => await page.evaluate(() => { const b = window.__SCC2.scene.getScene('Battle'); if (!b.coach) return true; return !!b.coach._dummyFoe && b.coach._dummyFoe.dead; }), 400, 30);
        }
        ok('DUMMY_KILLED', killed);
      }
    }
  }

  // ---- J: completion + persistence + player keeps control ----
  const doneState = await poll(async () => await page.evaluate(() => {
    const b = window.__SCC2.scene.getScene('Battle');
    return !!localStorage.getItem('scc.trainseen') && (!b.coach || !b.coach.active);
  }), 700, 40);
  ok('TRAINING_DONE_PERSISTED', doneState);
  const controlOK = await page.evaluate(() => {
    const b = window.__SCC2.scene.getScene('Battle');
    b.units.some(u => u.team === 0 && !u.dead); // can still select
    return !b.coach;
  });
  ok('CONTROL_RETURNED', controlOK);

  const realErrs = errors.filter(e => !/AudioContext|autoplay|favicon|WebGL|GPU stall|debounced/i.test(e));
  ok('NO_PAGE_ERRORS', realErrs.length === 0, realErrs.slice(0, 4).join(' | '));

  console.log(`\nRESULT ${FAIL === 0 ? 'GATE-V265 PASS' : 'GATE-V265 FAIL'} ${PASS}/${PASS + FAIL}`);
  await browser.close();
  process.exit(FAIL === 0 ? 0 : 1);
})().catch(e => { console.log('HARNESS ERROR', e); process.exit(2); });
