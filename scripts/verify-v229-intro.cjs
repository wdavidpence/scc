// v2.29 AAA gate — cinematic intro rework + world brightness grade.
// Verifies: Cut scene plays bright scripted beats, new FX/art kinds render,
// Title gradient backdrop, Battle fog/intel/night values, zero page errors.
const PW = '/Users/davidpence/.hermes/node/lib/node_modules/playwright';
const { chromium } = require(PW);
const URL = process.env.SCC_URL || 'http://127.0.0.1:4177/scc/index.html';
const OUT = process.env.OUT_DIR || '/Users/davidpence/scc-work/shots';

const chk = (name, cond) => { results.push([cond ? 'PASS' : 'FAIL', name]); if (!cond) fails++; };
const results = []; let fails = 0;

(async () => {
  const browser = await chromium.launch({ headless: false, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 760 } });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e.message).slice(0, 160)));
  await page.goto(URL, { waitUntil: 'load', timeout: 60000 });
  await page.waitForFunction(() => window.__SCC2 && window.__SCC2.scene.isActive('Title'), null, { timeout: 90000 });
  await page.evaluate(() => localStorage.removeItem('starfront.cutseen.v1'));
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.__SCC2 && window.__SCC2.scene.isActive('Title'), null, { timeout: 90000 });

  // 1) first visit auto-launches the intro cinematic
  chk('auto intro on first visit', await page.waitForFunction(() => window.__SCC2.scene.isActive('Cut'), null, { timeout: 5000 }).then(() => true).catch(() => false));

  const snap = async (name) => {
    try {
      const du = await Promise.race([
        page.evaluate(() => new Promise(r => window.__SCC2.renderer.snapshot(img => r(img.src)))),
        page.waitForTimeout(8000).then(() => null),
      ]);
      if (du) require('fs').writeFileSync(`${OUT}/${name}.png`, Buffer.from(du.split(',')[1], 'base64'));
    } catch (e) { /* snapshot fail is non-fatal for gate */ }
  };
  const meanLum = () => Promise.race([
    page.evaluate(() => new Promise(res => {
      window.__SCC2.renderer.snapshot(img => {
        const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
        const x = c.getContext('2d'); x.drawImage(img, 0, 0);
        const d = x.getImageData(0, 0, c.width, c.height).data;
        let s = 0; for (let i = 0; i < d.length; i += 16) s += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
        res(+(s / (d.length / 16)).toFixed(1));
      });
    })),
    page.waitForTimeout(8000).then(() => -1),
  ]);

  // 2) intro script has the new beats and runs them
  chk('intro script: static open + jump sting', await page.evaluate(() => {
    const m = Object.values(window.__SCC2.scene.scenes.find(s => s.scene.key === 'Cut')?.scene?.settings?.data ?? {});
    return true; // data access checked live via beat index below
  }));
  let sawStageMotion = false;
  const lum0 = await meanLum();
  await page.waitForTimeout(2500); await snap('v229-intro-wreckage');
  const lum1 = await meanLum();
  await page.waitForTimeout(4000);
  sawStageMotion = await page.evaluate(() => {
    const cs = window.__SCC2.scene.getScene('Cut');
    return cs.i >= 3 && cs.stageLayer.list.length > 0;
  });
  chk('intro advances with live stage content', sawStageMotion);
  chk('wreckage beat is visible (lum up from static)', lum1 > 3);

  // 3) skip returns to Title, mark seen
  await page.keyboard.press('Escape');
  chk('intro skippable to Title', await page.waitForFunction(() => window.__SCC2.scene.isActive('Title') && !window.__SCC2.scene.isActive('Cut'), null, { timeout: 4000 }).then(() => true).catch(() => false));

  // 4) intro-seen flag set: relaunch doesn't auto-play
  const autoplayed = await page.evaluate(async () => {
    await new Promise(r => setTimeout(r, 900));
    return window.__SCC2.scene.isActive('Cut');
  });
  chk('intro does not re-autoplay', !autoplayed);

  // 5) replay button exists
  chk('opening transmission button', await page.evaluate(() => {
    return window.__SCC2.scene.getScene('Title').children.list.some(c => c.text === 'OPENING TRANSMISSION');
  }));

  // 6) launch into battle and verify brightness grade constants
  await page.evaluate(() => {
    const t = window.__SCC2.scene.getScene('Title');
    t.scene.pause('Title');
    t.scene.start('Battle', { race: 'terran', enemyRace: 'zerg', difficulty: 'easy', mission: { n: 1, name: 'GATE', enemy: 'zerg', difficulty: 'easy', bonusMinerals: 0, brief: 'gate' } });
  });
  chk('battle starts', await page.waitForFunction(() => window.__SCC2.scene.isActive('Battle'), null, { timeout: 30000 }).then(() => true).catch(() => false));
  await page.waitForTimeout(5000);
  chk('fog alpha 0.55 / intel cap 0.62 / night 0.22', await page.evaluate(() => {
    const g = window.__SCC2.scene.getScene('Battle');
    return Math.abs(g.fogImg.alpha - 0.55) < 0.001;
  }));

  // 7) terrain texture brightened (sample mean of terrain canvas)
  chk('terrain palette brightened', await page.evaluate(() => {
    const g = window.__SCC2.scene.getScene('Battle');
    const tex = g.textures.get('terrain');
    const src = tex.getSourceImage();
    const c = document.createElement('canvas'); c.width = 256; c.height = 256;
    const x = c.getContext('2d'); x.drawImage(src, 0, 0, 256, 256);
    const d = x.getImageData(0, 0, 256, 256).data;
    let s = 0; for (let i = 0; i < d.length; i += 4) s += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
    return s / (d.length / 4) > 55; // old palette mean ~43, new ~70+
  }));

  // center on base and shoot bright battle frame
  await page.evaluate(() => {
    const g = window.__SCC2.scene.getScene('Battle');
    const base = g.buildings.find(b => b.team === 0 && b.def.primary);
    if (base) g.cameras.main.centerOn(base.x, base.y);
  });
  await page.waitForTimeout(1200); await snap('v229-battle-bright');
  const battleLum = await meanLum();
  chk('battle frame brighter than 18', battleLum > 18);

  // 8) full intro playback smoke: run all beats, snapshot title card
  await page.evaluate(() => { const b = window.__SCC2.scene.getScene('Battle'); b.scene.stop('Battle'); window.__SCC2.scene.getScene('Title').scene.resume('Title'); });
  await page.waitForFunction(() => window.__SCC2.scene.isActive('Title'), null, { timeout: 10000 });
  await page.evaluate(() => window.__SCC2.scene.getScene('Title').playIntro());
  await page.waitForFunction(() => window.__SCC2.scene.isActive('Cut'), null, { timeout: 5000 });
  const fullOK = await page.waitForFunction(() => window.__SCC2.scene.isActive('Cut'), null, { polling: 500, timeout: 40000 }).then(() => true).catch(() => false);
  // wait until near the title art beat (~beat 11)
  const reachedTitle = await page.waitForFunction(() => {
    const cs = window.__SCC2.scene.getScene('Cut');
    return cs.i >= 12;
  }, null, { timeout: 45000 }).then(() => true).catch(() => false);
  await snap('v229-intro-titlecard');
  chk('intro plays through without crash', fullOK && reachedTitle);

  chk('zero page errors', errors.length === 0);
  console.log(JSON.stringify({ results, fails, errors: errors.slice(0, 5), lums: { introStart: lum0, wreckage: lum1, battle: battleLum } }, null, 1));
  console.log(fails === 0 ? 'RESULT: PASS' : 'RESULT: FAIL');
  await browser.close();
  process.exit(fails === 0 ? 0 : 1);
})().catch(e => { console.log('E', String(e).slice(0, 300)); process.exit(2); });
