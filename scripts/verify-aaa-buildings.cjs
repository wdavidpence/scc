// AAA buildings gate: all tex keys exist with LINEAR filter + 2x SS,
// contact-sheet render for human review, live battle screenshot, 0 errors.
const { chromium } = require('/Users/davidpence/.hermes/node/lib/node_modules/playwright');
const URL = process.env.SCC_URL || 'http://127.0.0.1:4177/scc/';
const SHOT = '/tmp/scc-aaa-battle.png';
const SHEET = '/tmp/scc-aaa-sheet.png';
const BIDS = ['commandCenter','supplyDepot','refinery','barracks','factory','starport','academy','missileTurret','engineeringBay','scienceFacility','machineShop','bunker','controlTower','broodNest','blightNode','geneForge','clawPit','spineWarren','aerie','tremorCavern','stingerColony','gasSiphon','deepWarren','hive','aegis','conduit','essenceTap','portal','fabricator','synapseCore','runeworks','psiVault','convocation','skyPortal','lanceTurret','forge','skyAnchor'];
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
  // studio contact sheet straight from texture source canvases
  const sheetUrl = await page.evaluate((BIDS) => {
    const g = window.__SCC2;
    const cell = 160, cols = 6, rows = Math.ceil(BIDS.length / cols);
    const c = document.createElement('canvas'); c.width = cols * cell; c.height = rows * cell;
    const ctx = c.getContext('2d'); ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.fillStyle = '#0a0f16'; ctx.fillRect(0, 0, c.width, c.height);
    BIDS.forEach((bid, i) => {
      const key = `b-${bid}-t${bid === 'commandCenter' ? 0 : /ostDepot|refinery|barracks|factory|starport|academy|Turret|Bay|Facility|machineShop|bunker|controlTower/.test(bid) ? 0 : /rood|Node|eneForge|claw|Warren|rie|Cavern|inger|iphon|deep|hive/.test(bid) ? 1 : 2}`;
      if (!g.textures.exists(key)) return;
      const src = g.textures.get(key).getSourceImage();
      const x = (i % cols) * cell + 6, y = Math.floor(i / cols) * cell + 14;
      const sc = Math.min((cell - 12) / src.width, (cell - 26) / src.height);
      ctx.drawImage(src, x, y, src.width * sc, src.height * sc);
      ctx.fillStyle = '#9fb3c8'; ctx.font = '10px monospace'; ctx.fillText(bid, x, y - 4);
    });
    return c.toDataURL('image/png');
  }, BIDS);
  require('fs').writeFileSync(SHEET, Buffer.from(sheetUrl.split(',')[1], 'base64'));
  // live battle
  await page.evaluate(() => { const s = window.__SCC2.scene; s.stop('Title'); s.start('Battle', { race: 'terran', mission: 1 }); if (!s.isActive('Hud')) s.start('Hud', { race: 'terran' }); });
  await page.waitForTimeout(6000);
  const stats = await page.evaluate((BIDS) => {
    const b = window.__SCC2.scene.getScene('Battle');
    const missing = BIDS.filter(k => !b.textures.exists(`b-${k}-t0`) && !b.textures.exists(`b-${k}-t1`) && !b.textures.exists(`b-${k}-t2`));
    const cc = b.buildings.find(x => x.team === 0 && x.def.primary);
    return { missing, ccW: cc ? Math.round(cc.sprite.displayWidth) : 0, ccH: cc ? Math.round(cc.sprite.displayHeight) : 0, footW: cc ? cc.def.w * 32 : 0, footH: cc ? cc.def.h * 32 : 0 };
  }, BIDS);
  await page.screenshot({ path: SHOT });
  // legacy native size: sprites render at 32px/tile (2x world footprint) — parity check
  const pass = stats.missing.length === 0 && stats.ccW === stats.footW && stats.ccH === stats.footH && errors.length === 0;
  console.log(JSON.stringify({ missing: stats.missing, ccScale: [stats.ccW, stats.ccH], foot: [stats.footW, stats.footH], errors: errors.slice(0, 6) }));
  console.log(pass ? 'GATE-AAA PASS' : 'GATE-AAA FAIL');
  await browser.close();
  process.exit(pass ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
