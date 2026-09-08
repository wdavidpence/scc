// compare-brightness.js — captures identical scenes from two builds, computes
// brightness/color histograms from Phaser renderer.snapshot (WebGL-safe).
const PW = '/Users/davidpence/.hermes/node/lib/node_modules/playwright';
const { chromium } = require(PW);
const fs = require('fs');

const SHOT_DIR = '/Users/davidpence/scc-work/shots/compare-2026-09-05';

async function run(url, tag) {
  const browser = await chromium.launch({ headless: false, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 760 } });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e.message).slice(0, 120)));
  await page.goto(url, { waitUntil: 'load', timeout: 60000 });
  await page.waitForFunction(() => window.__SCC2 && window.__SCC2.scene.isActive('Title'), null, { timeout: 90000 });
  const shot = async (name) => {
    const du = await page.evaluate(() => new Promise(r => window.__SCC2.renderer.snapshot(img => r(img.src))));
    fs.writeFileSync(`${SHOT_DIR}/${tag}-${name}.png`, Buffer.from(du.split(',')[1], 'base64'));
    return du;
  };
  const stats = async () => page.evaluate(() => new Promise(res => {
    window.__SCC2.renderer.snapshot(img => {
      const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
      const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0);
      const d = ctx.getImageData(0, 0, c.width, c.height).data;
      let sum = 0, n = 0, satSum = 0, lit = 0, mid = 0, dark = 0;
      const buckets = {};
      for (let i = 0; i < d.length; i += 4) {
        const r = d[i], g = d[i + 1], b = d[i + 2];
        const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        sum += lum; n++;
        if (lum > 140) lit++; else if (lum > 50) mid++; else dark++;
        const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
        satSum += mx === 0 ? 0 : (mx - mn) / mx;
        const k = `${Math.round(r / 48) * 48},${Math.round(g / 48) * 48},${Math.round(b / 48) * 48}`;
        buckets[k] = (buckets[k] || 0) + 1;
      }
      const top = Object.entries(buckets).sort((a, b) => b[1] - a[1]).slice(0, 8)
        .map(([k, v]) => ({ rgb: k, pct: +(100 * v / n).toFixed(1) }));
      res({ meanLum: +(sum / n).toFixed(1), litPct: +(100 * lit / n).toFixed(1), midPct: +(100 * mid / n).toFixed(1), darkPct: +(100 * dark / n).toFixed(1), meanSat: +(satSum / n).toFixed(3), top });
    });
  }));

  await page.waitForTimeout(1200);
  const titleStats = await stats(); await shot('title');

  // enter battle
  for (let i = 0; i < 40 && !(await page.evaluate(() => window.__SCC2.scene.isActive('Battle'))); i++) {
    await page.keyboard.press('Enter');
    await page.mouse.click(640, 400);
    await page.waitForTimeout(500);
  }
  await page.waitForFunction(() => window.__SCC2.scene.isActive('Battle'), null, { timeout: 30000 });
  await page.waitForTimeout(6000); // let economy/AI run a bit

  // scene A: player base view
  await page.evaluate(() => {
    const g = window.__SCC2.scene.getScene('Battle');
    const base = g.buildings.find(b => b.team === 0 && b.def.primary);
    if (base) g.cameras.main.centerOn(base.x, base.y);
  });
  await page.waitForTimeout(1200);
  const baseStats = await stats(); await shot('base');

  // scene B: center of map, force a skirmish if possible
  await page.evaluate(() => {
    const g = window.__SCC2.scene.getScene('Battle');
    g.cameras.main.centerOn(g.scale.width * 2, g.scale.height * 1.5);
  });
  await page.waitForTimeout(800);
  // stage combat: bring some marines to fight near camera
  await page.evaluate(async () => {
    const g = window.__SCC2.scene.getScene('Battle');
    const mine = g.units.filter(u => !u.dead && u.team === 0 && !u.def.worker).slice(0, 6);
    const foe = g.units.filter(u => !u.dead && u.team === 1).slice(0, 4);
    if (!mine.length) return;
    const cam = g.cameras.main;
    for (const u of mine) { u.container.setPosition(cam.midPoint.x - 80 + Math.random() * 40, cam.midPoint.y - 40 + Math.random() * 80); }
    for (const f of foe) { f.container.setPosition(cam.midPoint.x + 90 + Math.random() * 40, cam.midPoint.y - 40 + Math.random() * 80); }
    for (const u of mine) for (const f of foe) { try { u.fireWeapon(f); } catch (e) {} }
    await new Promise(r => setTimeout(r, 700));
    for (const u of mine) for (const f of foe) { if (!f.dead) { try { u.fireWeapon(f); } catch (e) {} } }
  });
  await page.waitForTimeout(900);
  const battleStats = await stats(); await shot('battle');

  // scene C (new builds only): gas assignment UI — refinery on geyser, crew mining, badges
  await page.evaluate(async () => {
    const g = window.__SCC2.scene.getScene('Battle');
    if (!g.polish || !g.polish.gasBadgesTick) return false;
    const gey = g.geysers[0];
    const cam = g.cameras.main;
    const workers = g.units.filter(u => !u.dead && u.team === 0 && u.def.worker).slice(0, 3);
    let ref = gey.building;
    if (!ref || ref.dead) {
      ref = { x: gey.x, y: gey.y, team: 0, dead: false, built: true, def: { onGeyser: true, w: 2, h: 2 }, geyser: gey, radius: 14, update: () => {} };
      gey.building = ref; g.buildings.push(ref);
    }
    workers.forEach((w, i) => {
      w.container.setPosition(gey.x - 24 + i * 24, gey.y + 30 + (i % 2) * 12);
      if (!gey.workers.includes(w)) gey.workers.push(w);
      w.gasTarget = gey; w.setOrder({ type: 'harvestGas' });
    });
    cam.centerOn(gey.x, gey.y);
    g.polish.gasAssignFX(gey);
    g.polish._gbT = 0; g.polish.gasBadgesTick(1);
    await new Promise(r => setTimeout(r, 900));
    return true;
  });
  await page.waitForTimeout(700);
  const gasStats = await stats(); await shot('gas-ui');

  console.log(JSON.stringify({ tag, errors, title: titleStats, base: baseStats, battle: battleStats, gas: gasStats }));
  await browser.close();
}

(async () => {
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  await run('http://127.0.0.1:4178/scc/index.html', 'old-v224');
  await run('http://127.0.0.1:4177/scc/index.html', 'new-v228');
})().catch(e => { console.log('E', String(e).slice(0, 250)); process.exit(1); });
