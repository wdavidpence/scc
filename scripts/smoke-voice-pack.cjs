// Smoke: voice pack playback lanes. Verifies manifest load, preload fetches,
// and that each new action key resolves to a real 200 file (via network log).
const path = require('path');
const { execSync } = require('child_process');
const pwPath = execSync('npm root -g').toString().trim();
const { chromium } = require(path.join(pwPath, 'playwright'));
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
  const errs = [];
  const m4a = [];
  p.on('pageerror', e => errs.push(String(e).slice(0, 120)));
  p.on('response', r => { const u = r.url(); if (u.endsWith('.m4a') || u.endsWith('manifest.json')) m4a.push(r.status() + ' ' + u.split('/vo/')[1]); });
  await p.goto(process.env.SCC_URL || 'http://127.0.0.1:4177/scc/', { waitUntil: 'networkidle' });
  await p.waitForTimeout(800);
  const r = await p.evaluate(async () => {
    const sm = window.__SCC2.scene;
    sm.start('Battle', { race: 'terran', enemyRace: 'skarn', difficulty: 'hard' });
    await new Promise(r => setTimeout(r, 5500)); // boot + 2.2 s commander radio delay
    const a = window.__SCC2.audio2;
    const hits = {};
    for (const act of ['ultimate', 'admin', 'nuke', 'bselect', 'boss_on', 'boss_off', 'radio3', 'select'])
      hits[act] = a.voPlay(act, 1, 0.9, true, 'skarn') ? 'PACK' : (a.voPlay(act) ? 'PACK-SELF' : 'NO');
    return { manifest: a._vo && a._vo.ready, race: a.race, hits };
  });
  await p.waitForTimeout(1500);
  const bad = m4a.filter(s => s.startsWith('4') || s.startsWith('5'));
  console.log('manifest+lane probe:', JSON.stringify(r));
  console.log('m4a/manifest requests:', m4a.length, '| non-200:', bad.length ? bad.join(', ') : 'NONE');
  console.log('pageerrors:', errs.length, errs.slice(0, 3));
  await b.close();
})();
