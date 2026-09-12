// v2.62 gate: debrief panel chrome — accent rules, stat plate, halo, slam-in title, live relayout.
// Real hud:gameover fires late (delayed finish chain): POLL for panel, never fixed sleeps.
const path = require('path');
const { execSync } = require('child_process');
const pwPath = execSync('npm root -g').toString().trim();
const { chromium } = require(path.join(pwPath, 'playwright'));
(async () => {
  const url = process.env.SCC_URL || 'http://127.0.0.1:4177/scc/';
  const errs = [];
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  p.on('pageerror', e => errs.push(String(e)));
  p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await p.goto(url, { waitUntil: 'networkidle' });
  await p.evaluate(() => localStorage.setItem('starfront.cutseen.v1', '1'));
  await p.goto(url, { waitUntil: 'networkidle' });
  await p.waitForTimeout(2500);
  await p.evaluate(async () => {
    const sm = window.__SCC2.scene;
    for (const s of sm.getScenes(true)) sm.stop(s.scene.key);
    await new Promise(r => setTimeout(r, 400));
    sm.start('Battle', { race: 'terran', enemyRace: 'skarn' });
    await new Promise(r => setTimeout(r, 5000));
  });
  const out = [];
  const chk = (id, ok, extra) => { out.push({ id, ok: !!ok, ...(extra || {}) }); };

  await p.evaluate(() => { window.__SCC2.scene.getScene('Battle').endGame('victory'); });

  // 1. PANEL_LIVE: poll up to 8s for the real hud:gameover; census max title scale (slam evidence)
  const live = await p.evaluate(async () => {
    const h = window.__SCC2.scene.getScene('Hud');
    let maxScale = 0, vis = false;
    for (let i = 0; i < 40; i++) {
      if (h.goPanel && h.goPanel.visible) {
        vis = true;
        maxScale = Math.max(maxScale, h.goTitle.scaleX);
        if (h.goTitle.text && Math.abs(h.goTitle.scaleX - 1) < 0.02) break;
      }
      await new Promise(r => setTimeout(r, 200));
    }
    await new Promise(r => setTimeout(r, 600));
    return {
      vis, title: h.goTitle.text, scale: +h.goTitle.scaleX.toFixed(2), maxScale: +maxScale.toFixed(2),
      chrome: !!h.goChrome, halo: !!h.goHalo,
      haloScale: h.goHalo ? +h.goHalo.scaleX.toFixed(2) : 0,
      stats: h.goStats.text,
    };
  });
  chk('PANEL_LIVE', live.vis === true && live.title === 'MISSION ACCOMPLISHED' && live.chrome && live.halo && /KILLS/.test(live.stats), live);
  chk('TITLE_SLAM', live.scale >= 0.85 && live.scale <= 1.15, { scale: live.scale, maxScale: live.maxScale });

  // 2. CHROME_PX: accent rule green + stat plate darker than surrounding dim
  const px = await p.evaluate(() => {
    const h = window.__SCC2.scene.getScene('Hud');
    const cv = window.__SCC2.canvas;
    const o = document.createElement('canvas'); o.width = cv.width; o.height = cv.height;
    const x = o.getContext('2d', { willReadFrequently: true }); x.drawImage(cv, 0, 0);
    const d = x.getImageData(0, 0, o.width, o.height).data;
    const cy = h.H / 2, cx = h.W / 2;
    const at = (X, Y) => { const i = (Math.round(Y) * cv.width + Math.round(X)) * 4; return [d[i], d[i + 1], d[i + 2]]; };
    const rule = at(cx, cy - 96);          // green accent rule 0x6ee7a0
    const plate = at(cx - 180, cy - 15);  // stat plate 0x0a1220
    const dim = at(cx - 320, cy + 200);   // bare dim
    const lum = c => 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];
    return { rule, plate, dim, ruleLum: +lum(rule).toFixed(1), plateLum: +lum(plate).toFixed(1), dimLum: +lum(dim).toFixed(1),
      ruleGreen: rule[1] > 100 && rule[1] > rule[0] + 25 && rule[1] > rule[2] + 15 };
  });
  chk('CHROME_PX', px.ruleGreen === true, px);

  // 3. RELAYOUT: real victory event already fired -> direct defeat call is race-free
  await p.evaluate(() => { window.__SCC2.scene.getScene('Hud').showGameOver('defeat'); });
  await p.waitForTimeout(1000);
  const relay = await p.evaluate(() => {
    const h = window.__SCC2.scene.getScene('Hud');
    const cv = window.__SCC2.canvas;
    const o = document.createElement('canvas'); o.width = cv.width; o.height = cv.height;
    const x = o.getContext('2d', { willReadFrequently: true }); x.drawImage(cv, 0, 0);
    const d = x.getImageData(0, 0, o.width, o.height).data;
    const cy = h.H / 2, cx = h.W / 2;
    const at = (X, Y) => { const i = (Math.round(Y) * cv.width + Math.round(X)) * 4; return [d[i], d[i + 1], d[i + 2]]; };
    const rule = at(cx, cy - 96); // now red 0xff5c5c
    return { title: h.goTitle.text, color: h.goTitle.color, rule,
      ruleRed: rule[0] > 130 && rule[0] > rule[2] + 40 };
  });
  chk('RELAYOUT_DEFEAT', relay.title === 'MISSION FAILED' && relay.ruleRed === true, relay);

  // 4. CLICK RETURN: click, poll up to 5s for Title active + Battle stopped
  await p.mouse.click(700, 450);
  const back = await p.evaluate(async () => {
    for (let i = 0; i < 25; i++) {
      if (window.__SCC2.scene.isActive('Title') && !window.__SCC2.scene.isActive('Battle')) return { ok: true, i };
      await new Promise(r => setTimeout(r, 200));
    }
    return { ok: false, title: window.__SCC2.scene.isActive('Title'), battle: window.__SCC2.scene.isActive('Battle') };
  });
  chk('CLICK_RETURN_TITLE', back.ok === true, back);

  console.log(out.map(o => `${o.ok ? 'PASS' : 'FAIL'} ${o.id} ${JSON.stringify(o)}`).join('\n'));
  console.log('ERRS', JSON.stringify(errs.slice(0, 4)));
  await b.close();
  const fails = out.filter(o => !o.ok).length;
  console.log(fails ? `GATE-V262 ${out.length - fails}/${out.length} FAIL` : `GATE-V262 ${out.length}/${out.length} PASS`);
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log('E', String(e).slice(0, 300)); process.exit(1); });
