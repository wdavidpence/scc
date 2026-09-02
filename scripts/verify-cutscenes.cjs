// verify-cutscenes.cjs — drive the new CutScene flows live:
// 1) fresh boot => intro plays (Cut scene active, radio beats appear)
// 2) skip => back to Title
// 3) LAUNCH MISSION => briefing Cut plays, completes => Battle runs
// 4) radio chatter event fires into HUD
const { chromium } = require('/Users/davidpence/.hermes/node/lib/node_modules/playwright');
const URL = process.env.CUT_URL || 'http://127.0.0.1:4176/scc/';
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch({ headless: false, args: ['--use-gl=angle', '--enable-gpu'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errs = [];
  page.on('pageerror', e => errs.push('PAGEERROR ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/favicon|404 \(File not found\)/i.test(m.text())) errs.push('CONSOLE ' + m.text()); });

  const sceneActive = name => page.evaluate(n => {
    const sm = window.__SCC2?.scene; if (!sm) return false;
    const s = sm.getScene(n); return !!(s && s.scene.isActive());
  }, name);

  await page.goto(URL, { waitUntil: 'networkidle' });
  await sleep(2500);

  // 1) first-ever boot should auto-play intro (clear flag first to force it)
  await page.evaluate(() => { try { localStorage.removeItem('starfront.cutseen.v1'); localStorage.clear(); } catch (e) {} });
  await page.reload({ waitUntil: 'networkidle' });
  await sleep(2500);
  const introActive = await sceneActive('Cut');
  console.log('INTRO_AUTOPLAY:', introActive ? 'PASS' : 'FAIL');

  // let a couple of radio beats run, then screenshot the cinematic
  await sleep(4000);
  const radioShown = await page.evaluate(() => {
    const cut = window.__SCC2.scene.getScene('Cut');
    if (!cut) return false;
    return cut.stageLayer?.list?.length > 0 || cut.uiLayer?.list?.length > 0;
  });
  console.log('CINEMA_STAGE_CONTENT:', radioShown ? 'PASS' : 'FAIL');
  await page.screenshot({ path: '/Users/davidpence/scc-work/research/cut_intro.png' });

  // 2) skip -> title
  await page.mouse.click(640, 400);
  await sleep(900);
  const backTitle = await sceneActive('Title');
  const cutGone = !(await sceneActive('Cut'));
  console.log('SKIP_TO_TITLE:', backTitle && cutGone ? 'PASS' : 'FAIL');

  // 3) launch mission -> briefing -> battle
  // find LAUNCH button coords via evaluate on Title
  await page.evaluate(() => {
    const t = window.__SCC2.scene.getScene('Title');
    if (t && t.scene.isActive()) t.launch();
  });
  await sleep(1500);
  const briefActive = await sceneActive('Cut');
  console.log('BRIEFING_PLAYS:', briefActive ? 'PASS' : 'FAIL');
  await page.screenshot({ path: '/Users/davidpence/scc-work/research/cut_brief.png' });
  await page.mouse.click(640, 400); // skip briefing
  await sleep(2500);
  const battleActive = await sceneActive('Battle');
  console.log('BATTLE_AFTER_BRIEF:', battleActive ? 'PASS' : 'FAIL');

  // 4) force a radio chatter beat -> HUD radio log exists
  const radioOk = await page.evaluate(() => {
    const b = window.__SCC2.scene.getScene('Battle');
    const h = window.__SCC2.scene.getScene('Hud');
    if (!b || !h) return 'noscene';
    b.events.emit('hud:radio', 'TEST CHATTER — CONTACT BEARING EAST', 'ops');
    const cont = h._radioLog;
    return cont && cont.list.length > 0 ? 'pass' : 'empty';
  });
  console.log('HUD_RADIO_LOG:', radioOk === 'pass' ? 'PASS' : 'FAIL:' + radioOk);

  // 5) debrief line flows to game-over board: set one + emit
  const debOk = await page.evaluate(() => {
    const b = window.__SCC2.scene.getScene('Battle');
    const h = window.__SCC2.scene.getScene('Hud');
    b.debriefLine = 'The sector is ours. Mostly.';
    h.showGameOver('victory');
    return h.goSub && h.goSub.text === 'The sector is ours. Mostly.';
  });
  console.log('DEBRIEF_ON_BOARD:', debOk ? 'PASS' : 'FAIL');

  await page.screenshot({ path: '/Users/davidpence/scc-work/research/cut_battle_radio.png' });

  console.log('ERRORS:', errs.length ? errs.slice(0, 8).join('\n') : 'NONE');
  await browser.close();
  const pass = introActive && backTitle && briefActive && battleActive && radioOk === 'pass' && debOk && !errs.length;
  console.log(pass ? 'ALL:PASS' : 'ALL:CHECK');
  process.exit(pass ? 0 : 1);
})().catch(e => { console.error('HARNESS FAIL', e); process.exit(2); });
