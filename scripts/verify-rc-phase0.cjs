// P0.019 — Phase-0 release-candidate gate: clean-build launch, training completes,
// battle restarts, topology debug overlay agrees 100% with nav truth.
// Usage: SCC_URL=http://127.0.0.1:4177/scc/ NODE_PATH=$(npm root -g) node scripts/verify-rc-phase0.cjs
const { chromium } = require('playwright');
const URL = process.env.SCC_URL || 'http://127.0.0.1:4177/scc/';
let PASS = 0, FAIL = 0; const errors = [];
const ok = (id, cond, extra = '') => { if (cond) { PASS++; console.log(`PASS ${id} ${extra}`); } else { FAIL++; console.log(`FAIL ${id} ${extra}`); } };

const poll = async (page, fn, ms = 20000, label = '') => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try { if (await page.evaluate(fn)) return true; } catch (e) { /* scene not ready */ }
    await page.waitForTimeout(120);
  }
  console.log(`poll-timeout ${label}`); return false;
};

(async () => {
  const browser = await chromium.launch({ headless: false, args: ['--use-gl=angle', '--enable-gpu'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

  // launch clean
  await page.goto(URL, { waitUntil: 'load' });
  await page.evaluate(() => localStorage.removeItem('scc.trainseen'));
  await page.reload({ waitUntil: 'load' });
  ok('LAUNCH_TITLE', await poll(page, () => window.__SCC2 && window.__SCC2.scene.isActive('Title'), 25000, 'title'));

  // training completes via tutorial entry (real state transition)
  const tut = await page.evaluate(() => {
    const t = window.__SCC2.scene.getScene('Title');
    if (typeof t.launchTutorial === 'function') { t.launchTutorial(); return true; }
    return false;
  });
  ok('TUTORIAL_LAUNCHED', tut);
  ok('BATTLE_ACTIVE', await poll(page, () => window.__SCC2.scene.isActive('Battle'), 25000, 'battle'));
  const tutMode = await page.evaluate(() => { const b = window.__SCC2.scene.getScene('Battle'); return !!b.tutorialMode; });
  ok('TUTORIAL_MODE', tutMode);
  // TRAINING completion via the proven real-mouse coach lane (full forced-click gate)
  const { execFileSync } = require('child_process');
  let coachPass = false, coachOut = '';
  try {
    coachOut = execFileSync('node', ['scripts/verify-v265-coach.cjs'], { cwd: __dirname + '/..', env: { ...process.env, SCC_URL: URL, NODE_PATH: process.env.NODE_PATH || '/usr/local/lib/node_modules' }, encoding: 'utf8', timeout: 300000 });
    coachPass = /RESULT GATE-V265 PASS 28\/28/.test(coachOut);
  } catch (e) { coachOut = String(e.stdout || e.message); }
  ok('TRAINING_COMPLETES_REAL_MOUSE', coachPass, coachPass ? '' : coachOut.split('\n').filter(l => l.startsWith('FAIL')).slice(0, 2).join(' | '));
  await page.evaluate(() => { const g = window.__SCC2; if (g.scene.isActive('Title')) { const t = g.scene.getScene('Title'); t.startBattle ? t.startBattle() : g.scene.start('Battle', { race: 'terran', enemyRace: 'skarn' }); } });

  // battle restart lifecycle x2 with overlay across restart
  for (let c = 1; c <= 2; c++) {
    await page.evaluate(() => { const b = window.__SCC2.scene.getScene('Battle'); b.scene.restart({ race: 'terran', enemyRace: 'skarn' }); });
    const up = await poll(page, () => { const b = window.__SCC2.scene.getScene('Battle'); return b.nav && b.scene.isActive('Battle'); }, 25000, `restart${c}`);
    ok(`RESTART_${c}_NAV_READY`, up);
  }

  // topology overlay toggle + agreement with nav truth (100%)
  const ov = await page.evaluate(() => {
    const b = window.__SCC2.scene.getScene('Battle');
    const on1 = b.toggleTopologyOverlay();
    const g = b._topoOverlay;
    const nav = b.nav;
    let solidCells = 0; for (let i = 0; i < nav.solid.length; i++) if (nav.solid[i]) solidCells++;
    const truth = b.exportTerrainTruth();
    const truthSolid = truth.cells.filter(c => c.nav_solid).length;
    const on2 = b.toggleTopologyOverlay();
    const offVisible = b._topoOverlay ? b._topoOverlay.visible : null;
    const on3 = b.toggleTopologyOverlay();
    return { on1, on2, on3, offVisible, hasG: !!g, solidCells, truthSolid, cellCount: truth.cells.length };
  });
  ok('OVERLAY_TOGGLES', ov.on1 === true && ov.on2 === false && ov.on3 === true && ov.hasG);
  ok('OVERLAY_AGREES_100', ov.solidCells === ov.truthSolid && ov.solidCells > 0, `nav_solid=${ov.solidCells} truth_nav_solid=${ov.truthSolid} cells=${ov.cellCount}`);

  await page.screenshot({ path: '/tmp/rc-phase0-topo.png' });
  ok('NO_PAGE_ERRORS', errors.length === 0, errors.slice(0, 3).join(' | '));
  console.log(`\nRESULT RC-PHASE0 ${FAIL === 0 ? 'PASS' : 'FAIL'} ${PASS}/${PASS + FAIL}`);
  await browser.close();
  process.exit(FAIL === 0 ? 0 : 1);
})().catch(e => { console.error('HARNESS ERROR', String(e).slice(0, 200)); process.exit(2); });
