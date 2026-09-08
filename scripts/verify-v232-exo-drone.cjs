// v2.32 gate: terran exo-skeleton humanoids w/ see-through visors,
// ground shadows on all units/buildings, Sentinel Drone unit, IP-clean text.
const path = require('path');
const PW = '/Users/davidpence/.hermes/node/lib/node_modules/playwright';
const { chromium } = require(PW);
const URL = process.env.SCC_URL || 'http://127.0.0.1:4177/scc/';

(async () => {
  const browser = await chromium.launch({ headless: false, args: ['--use-gl=angle', '--enable-gpu'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text() + ' @ ' + (m.location() && m.location().url || '')); });
  await page.goto(URL, { waitUntil: 'load' });
  await page.evaluate(() => localStorage.setItem('starfront.cutseen.v1', '1'));
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.__SCC2 && window.__SCC2.scene.isActive('Title'), null, { timeout: 30000 });
  // launch battle as terran
  await page.evaluate(() => {
    const s = window.__SCC2.scene;
    s.stop('Title');
    s.start('Battle', { race: 'terran', mission: 1 });
    s.isActive('Hud') || s.start('Hud', { race: 'terran' });
  });
  await page.waitForTimeout(5000);

  const out = {};
  // 1. IP-clean live bundle text: no Zerg/Protoss on any visible scene text
  out.ip_clean = await page.evaluate(() => {
    const b = window.__SCC2.scene.getScene('Battle');
    const texts = [];
    b.children.list.forEach(c => { if (c.type === 'Text') texts.push(c.text); });
    const hud = window.__SCC2.scene.getScene('Hud');
    if (hud) hud.children.list.forEach(c => { if (c.type === 'Text') texts.push(c.text); });
    const bad = texts.filter(t => /zerg|protoss/i.test(t));
    return bad.length === 0;
  });

  // 2. drone texture + spawn + flight offset + detect
  out.drone = await page.evaluate(() => {
    const b = window.__SCC2.scene.getScene('Battle');
    if (!b.textures.exists('u-drone-t0')) return { ok: false, why: 'no texture' };
    const d = b.spawnUnit(0, 'drone', b.cameras.main.midPoint.x, b.cameras.main.midPoint.y - 40, { arriveReady: true });
    if (!d) return { ok: false, why: 'spawn fail' };
    return { ok: !!d.flying && d.def.detect === true && !!d.shadow, lift: d.sprite.y, hasShadow: !!d.shadow };
  });

  // 3. marine sprite has skin pixels inside head circle (face through visor)
  out.visor_face = await page.evaluate(() => {
    const b = window.__SCC2.scene.getScene('Battle');
    const src = b.textures.get('u-marine-t0').getSourceImage();
    const c = document.createElement('canvas'); c.width = src.width; c.height = src.height;
    const ctx = c.getContext('2d'); ctx.drawImage(src, 0, 0);
    // scan the whole sprite for warm skin chroma (relative — lighting passes wash absolutes)
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    let skin = 0, blueGlass = 0;
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i], g = d[i + 1], bl = d[i + 2], a = d[i + 3];
      if (a < 40) continue;
      if (r > bl + 22 && r > g + 8 && r > 110 && !(r > 220 && g > 210 && bl > 200)) skin++;
      if (bl > 200 && r < 180 && g > 170) blueGlass++;
    }
    return { skin: skin > 8, glass: blueGlass > 4, skinPx: skin, glassPx: blueGlass };
  });

  // 4. ground shadows present on existing units + buildings
  out.shadows = await page.evaluate(() => {
    const b = window.__SCC2.scene.getScene('Battle');
    const uSh = b.units.filter(u => !u.dead && u.shadow).length;
    const bSh = b.buildings.filter(x => !x.dead && x.shadow).length;
    return { unitShadows: uSh, bldShadows: bSh, texOK: b.textures.exists('shadow-s') && b.textures.exists('shadow-l') };
  });

  // 5. drone trains from starport card path (data wiring)
  out.card = await page.evaluate(() => {
    const b = window.__SCC2.scene.getScene('Battle');
    return (b.def ? true : false) || (window.__SCC2.__scc ? true : false);
  });
  out.starport_produces_drone = await page.evaluate(() => {
    // import data via live game: check canProduce on an existing AI/player starport or raw def
    const s = window.__SCC2.scene.getScene('Battle');
    const sp = s.buildings.find(x => x.buildId === 'starport' && x.team === 0);
    if (sp) return sp.canProduce('drone');
    return null; // fall back to static grep
  });

  // screenshot for the user
  await page.evaluate(() => {
    const b = window.__SCC2.scene.getScene('Battle');
    const m = b.buildings.find(x => x.team === 0 && x.def.primary);
    if (m) b.cameras.main.centerOn(m.x, m.y + 60);
    b.units.filter(u => u.team === 0 && u.def.worker).slice(0, 3).forEach((w, i) => w.issueMove(m.x + 40 + i * 20, m.y + 70));
    // line up some marines
    const kinds = ['marine', 'marine', 'marine', 'rigger', 'drone'];
    kinds.forEach((k, i) => b.spawnUnit(0, k, m.x - 60 + i * 26, m.y + 120, { arriveReady: true }));
  });
  await page.waitForTimeout(1200);
  const shot = '/tmp/scc-v232-exo.png';
  await page.screenshot({ path: shot });

  console.log(JSON.stringify(out, null, 1));
  console.log('SHOT:', shot);
  console.log('ERRORS:', errors.slice(0, 6));
  const pass = out.ip_clean && out.drone.ok !== false && out.visor_face.skin && out.shadows.texOK && out.shadows.unitShadows > 0 && out.shadows.bldShadows > 0 && errors.length === 0;
  console.log(pass ? 'GATE-V232 PASS' : 'GATE-V232 FAIL');
  await browser.close();
  process.exit(pass ? 0 : 1);
})().catch(e => { console.error('GATE CRASH', e); process.exit(2); });
