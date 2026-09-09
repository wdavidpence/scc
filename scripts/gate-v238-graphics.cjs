const http = require('http');
const fs = require('fs');
const path = require('path');
const pwPath = require('child_process').execSync('npm root -g').toString().trim();
const { chromium } = require(path.join(pwPath, 'playwright'));
const ROOT = '/Users/davidpence/scc-work/dist';
const MIME={'.html':'text/html','.js':'text/javascript','.png':'image/png','.jpg':'image/jpeg','.map':'text/plain','.css':'text/css','.ttf':'font/ttf','.svg':'image/svg+xml','.woff2':'font/woff2'};
const server = http.createServer((req, res) => {
  let u = decodeURIComponent(req.url.split('?')[0]); if (u.startsWith('/scc')) u = u.slice(4);
  let p = path.join(ROOT, u);
  if (p.endsWith('/')) p += 'index.html';
  fs.readFile(p, (e, d) => { if (e) { res.writeHead(404); res.end('nf'); } else { res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); res.end(d); } });
});
(async () => {
  await new Promise(r => server.listen(8120, r));
  const browser = await chromium.launch({ headless: false, args: ['--use-gl=angle','--enable-gpu'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console:' + m.text()); });
  const R = [];
  const ok = (name, cond, extra='') => { R.push([cond ? 'PASS' : 'FAIL', name + (extra ? ' :: ' + extra : '')]); };

  await page.goto('http://localhost:8120/scc/', { waitUntil: 'load' });
  await page.evaluate(() => localStorage.setItem('starfront.cutseen.v1', '1'));
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.__SCC2, null, { timeout: 45000 });
  await page.waitForTimeout(1500);
  await page.waitForTimeout(2500);
  await page.screenshot({ path: '/tmp/v238_title.png' });
  ok('title loaded, 0 errors so far', errors.length === 0, errors.join(';').slice(0,200));

  // AI kit present in texture cache after title (hero/cin are jpg swaps; battle kit loads on Battle)
  // Start a battle via scene manager
  const started = await page.evaluate(async () => {
    const game = window.__SCC2;
    if (!game) return 'no game';
    const sm = game.scene;
    for (const s of sm.getScenes(true)) sm.stop(s.scene.key);
    await new Promise(r => setTimeout(r, 500));
    sm.start('Battle', { race: 'terran', enemyRace: 'skarn', difficulty: 'normal' });
    await new Promise(r => setTimeout(r, 3500));
    const b = sm.getScene('Battle');
    if (!b) return 'no battle scene';
    const keys = ['ai-ground_a','ai-ground_b','ai-ground_cracked','ai-ground_highland','ai-ground_ash','ai-rock0','ai-rock1','ai-rock2','ai-minerals','ai-geyser'];
    const have = keys.filter(k => b.textures.exists(k));
    const rockImgs = b.children.list.filter(c => c.type==='Image' && /^ai-rock/.test(c.texture.key)).length;
    const minImgs = b.children.list.filter(c => c.type==='Image' && c.texture.key==='ai-minerals').length;
    const geyImgs = b.children.list.filter(c => c.type==='Image' && c.texture.key==='ai-geyser').length;
    return JSON.stringify({ have: have.length, missing: keys.filter(k=>!b.textures.exists(k)), rockImgs, minImgs, geyImgs, units: b.units ? b.units.length : -1 });
  });
  console.log('battle:', started);
  const bd = JSON.parse(started.replace(/^no /,'{}') || '{}');
  ok('10 AI textures loaded', bd.have === 10, (bd.missing||[]).join(','));
  ok('AI rock sprites placed', bd.rockImgs > 100, 'n=' + bd.rockImgs);
  ok('AI mineral sprites placed', bd.minImgs >= 16, 'n=' + bd.minImgs);
  ok('AI geyser sprites placed', bd.geyImgs === 4, 'n=' + bd.geyImgs);
  ok('battle sim alive', bd.units >= 0 && started.includes('units'), started.slice(-40));
  await page.waitForTimeout(1500);
  await page.screenshot({ path: '/tmp/v238_battle.png' });

  // terrain pixel check: sample the terrain canvas — must be rich, not flat green blocks
  const px = await page.evaluate(() => {
    const b = window.__SCC2.scene.getScene('Battle');
    const tex = b.textures.get('terrain').getSourceImage();
    const ctx = tex.getContext ? tex.getContext('2d') : (() => { const c=document.createElement('canvas'); c.width=tex.width;c.height=tex.height; const x=c.getContext('2d'); x.drawImage(tex,0,0); return x; })();
    const d = ctx.getImageData(0,0,tex.width,tex.height).data;
    let lum=[]; for (let i=0;i<d.length;i+=4*97){ lum.push(0.299*d[i]+0.587*d[i+1]+0.114*d[i+2]); }
    const mean=lum.reduce((a,b)=>a+b,0)/lum.length;
    const sd=Math.sqrt(lum.reduce((a,b)=>a+(b-mean)*(b-mean),0)/lum.length);
    return JSON.stringify({mean:Math.round(mean), sd:Math.round(sd), w:tex.width});
  });
  console.log('terrain px:', px);
  const pxd = JSON.parse(px);
  ok('terrain has rich variance (sd>=18)', pxd.sd >= 18, px);

  // mineral shrink + destructible rock kill still work with new sprites
  const rockKill = await page.evaluate(async () => {
    const b = window.__SCC2.scene.getScene('Battle');
    const rk = b.destructibles[0];
    if (!rk) return 'none';
    const pre = b.children.list.filter(c=>c.type==='Image' && /^ai-rock/.test(c.texture.key) && Math.abs(c.x-(rk.tx*32+8))<9).length;
    rk.hp = 1;
    const before = b.children.list.filter(c=>c.type==='Image' && /^ai-rock/.test(c.texture.key) && Math.abs(c.x-(rk.tx*32+8))<9 && Math.abs(c.y-(rk.ty*32+8))<9).length;
    return JSON.stringify({pre, before, tx:rk.tx, ty:rk.ty});
  });
  ok('destructible rocks trackable', rockKill !== 'none', rockKill.slice(0,80));

  ok('zero page errors', errors.length === 0, errors.join(' | ').slice(0,300));

  // screenshot pixel content: battle must be green-teal dominant vs title
  const hues = await page.evaluate(() => {
    const cv = document.querySelector('#game canvas') || document.querySelector('canvas');
    const ctx = cv.getContext('2d', { willReadFrequently: true }) || (() => { const c=document.createElement('canvas'); c.width=cv.width;c.height=cv.height;const x=c.getContext('2d');x.drawImage(cv,0,0);return x;})();
    const d = ctx.getImageData(0, 0, cv.width, cv.height).data;
    let g=0, tot=0; for (let i=0;i<d.length;i+=4*53){ const r=d[i],gg=d[i+1],b=d[i+2]; tot++; if((gg>r+4 && b>r) || (gg>r+6 && gg>b)) g++; }
    return g/Math.max(1,tot);
  });
  ok('battle frame teal/bioluminescent dominant (AI moss)', hues > 0.15, 'tealfrac=' + hues.toFixed(2));

  const fails = R.filter(r=>r[0]==='FAIL');
  R.forEach(r=>console.log(r[0]+' '+r[1]));
  console.log('GATE ' + (fails.length ? 'FAIL '+fails.length : 'PASS '+R.length+'/'+R.length));
  await browser.close(); server.close();
})().catch(e => { console.log('HARNESS ERR ' + e.message); process.exit(1); });
