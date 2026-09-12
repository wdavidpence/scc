// probe: title wash rows + minimap shroud columns (diagnostic)
const path = require('path');
const { execSync } = require('child_process');
const pwPath = execSync('npm root -g').toString().trim();
const { chromium } = require(path.join(pwPath, 'playwright'));
(async () => {
  const url = process.env.SCC_URL || 'http://127.0.0.1:4177/scc/';
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  await p.goto(url, { waitUntil: 'networkidle' });
  await p.evaluate(() => localStorage.setItem('starfront.cutseen.v1', '1'));
  await p.goto(url, { waitUntil: 'networkidle' });
  await p.waitForTimeout(3000);
  const sky = await p.evaluate(() => {
    const t = window.__SCC2.scene.getScene('Title');
    if (t.bgImg) t.bgImg.setVisible(false);
    const cv = window.__SCC2.canvas;
    const o = document.createElement('canvas'); o.width = cv.width; o.height = cv.height;
    const x = o.getContext('2d', { willReadFrequently: true }); x.drawImage(cv, 0, 0);
    const d = x.getImageData(0, 0, o.width, o.height).data;
    const rows = [];
    for (let yy = 4; yy < o.height * 0.5; yy += Math.floor(o.height * 0.5 / 12)) {
      let s = 0, n = 0;
      for (let xx = 4; xx < o.width - 4; xx += 3) {
        const i = (yy * o.width + xx) * 4;
        s += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]; n++;
      }
      rows.push({ yy, lum: +(s / n).toFixed(1) });
    }
    return { W: o.width, H: o.height, rows };
  });
  console.log('SKY', JSON.stringify(sky));
  await p.evaluate(async () => {
    const sm = window.__SCC2.scene;
    for (const s of sm.getScenes(true)) sm.stop(s.scene.key);
    await new Promise(r => setTimeout(r, 400));
    sm.start('Battle', { race: 'terran', enemyRace: 'skarn' });
    await new Promise(r => setTimeout(r, 5000));
  });
  const fog = await p.evaluate(() => {
    const bt = window.__SCC2.scene.getScene('Battle');
    const h = window.__SCC2.scene.getScene('Hud');
    for (let ty = 0; ty < 160; ty++) for (let tx = 0; tx < 160; tx++) bt.seen[bt.nav.idx(tx, ty)] = 0;
    h._shroudAt = -99; h.drawShroud(bt);
    h.drawMinimap(bt);
    const cv = window.__SCC2.canvas;
    const o = document.createElement('canvas'); o.width = cv.width; o.height = cv.height;
    const x = o.getContext('2d', { willReadFrequently: true }); x.drawImage(cv, 0, 0);
    const d = x.getImageData(0, 0, o.width, o.height).data;
    const sc = cv.width / window.innerWidth;
    const tile = h.mmSize / 160;
    const px = (tx, ty) => {
      const cx = Math.round((h.mmX + tx * tile + tile / 2) * sc);
      const cy = Math.round((h.mmY + ty * tile + tile / 2) * sc);
      const i = (cy * cv.width + cx) * 4;
      return [d[i], d[i + 1], d[i + 2]];
    };
    // scan a grid of tiles across the blanked minimap; report unique-ish colors
    const hits = {};
    let light = 0, tot = 0;
    for (let ty = 2; ty < 158; ty += 7) for (let tx = 2; tx < 158; tx += 7) {
      const c = px(tx, ty); tot++;
      const lum = 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];
      if (lum > 45) light++;
      const k = (c[0] >> 4) + ',' + (c[1] >> 4) + ',' + (c[2] >> 4);
      hits[k] = (hits[k] || 0) + 1;
    }
    const rock = (bt.rockTiles || [])[0];
    return { mmX: h.mmX, mmY: h.mmY, mmSize: h.mmSize, sc, tile: +tile.toFixed(2), canvasW: cv.width, canvasH: cv.height, dpr: window.devicePixelRatio, light, tot, topColors: Object.entries(hits).sort((a, b2) => b2[1] - a[1]).slice(0, 6), rockPx: rock ? px(rock.tx, rock.ty) : null };
  });
  console.log('FOG', JSON.stringify(fog));
  await b.close();
})().catch(e => { console.log('E', String(e).slice(0, 300)); process.exit(1); });
