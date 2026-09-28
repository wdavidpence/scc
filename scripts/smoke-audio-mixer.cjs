// Smoke: pause-menu audio mixer works + persists.
const path = require('path');
const { execSync } = require('child_process');
const pwPath = execSync('npm root -g').toString().trim();
const { chromium } = require(path.join(pwPath, 'playwright'));
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  await p.goto(process.env.SCC_URL || 'http://127.0.0.1:4177/scc/', { waitUntil: 'networkidle' });
  await p.waitForTimeout(1200);
  const r = await p.evaluate(async () => {
    const sm = window.__SCC2.scene;
    sm.start('Battle', { race: 'terran', enemyRace: 'skarn' });
    await new Promise(r => setTimeout(r, 2500));
    const bt = sm.getScene('Battle');
    const hs = sm.getScene('Hud');
    bt.tut = null;
    const out = { audio: !!bt.audio, mix: bt.audio && { ...bt.audio.mix } };
    // 1) toggle mute via API (= comma key path)
    const m1 = bt.audio.toggleMute();
    // 2) set bands like a bar click would
    bt.audio.setBand('voice', 0.4); bt.audio.setBand('music', 0.0);
    out.after = { ...bt.audio.mix };
    // 3) unpause path: pause -> panel visible -> resume hides
    bt.togglePause();
    out.panelVisible = hs._audPanel ? hs._audPanel.visible : 'NO-PANEL';
    bt.togglePause();
    out.panelHiddenAfterResume = hs._audPanel ? !hs._audPanel.visible : 'NO-PANEL';
    // 4) persistence
    out.stored = localStorage.getItem('scc.mix');
    // 5) tone through sfxBus still fires without error
    try { bt.audio.tone(440, 0.05); bt.audio.startMusic({}); out.sfx = 'ok'; } catch (e) { out.sfx = String(e).slice(0, 80); }
    return out;
  });
  console.log(JSON.stringify(r, null, 1));
  const errs = [];
  p.on('pageerror', e => errs.push(String(e).slice(0, 120)));
  await p.waitForTimeout(800);
  console.log('pageerrors:', errs.length, errs.slice(0, 3));
  await b.close();
})();
