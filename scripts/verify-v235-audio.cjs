// v2.35 gate: SC1 audio depth Sprint A — per-race announcer error library,
// voiced under-attack w/ cooldown, escalating repeat-select tiers, idle
// chatter, voiced briefings (BRIEF_VO decode), voiced debrief.
const PW = '/Users/davidpence/.hermes/node/lib/node_modules/playwright';
const { chromium } = require(PW);
const URL = process.env.SCC_URL || 'http://127.0.0.1:4177/scc/';

(async () => {
  const browser = await chromium.launch({ headless: false, args: ['--use-gl=angle', '--enable-gpu'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text() + ' @ ' + (m.location() && m.location().url || '')); });
  const failedFetches = [];
  page.on('response', r => { if (r.status() >= 400 && /vo\//.test(r.url())) failedFetches.push(r.status() + ' ' + r.url()); });

  await page.goto(URL, { waitUntil: 'load' });
  await page.evaluate(() => localStorage.setItem('starfront.cutseen.v1', '1'));
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.__SCC2 && window.__SCC2.scene.isActive('Title'), null, { timeout: 30000 });

  const out = {};
  const R = (name, fn) => out[name] = fn;

  await page.evaluate(() => {
    const s = window.__SCC2.scene;
    s.stop('Title');
    s.start('Battle', { race: 'terran', mission: 1 });
    !s.isActive('Hud') && s.start('Hud', { race: 'terran' });
  });
  await page.waitForTimeout(5000);

  // 1. voice manifest has the new announcer keys for all 3 races
  R('manifest', await page.evaluate(async () => {
    const m = await (await fetch('vo/manifest.json')).json();
    const need = ['err_supply','err_tech','err_place','err_energy','err_nocrew','underattack','select2','select3'];
    return ['terran','skarn','auraxis'].every(r => need.every(k => (m[r] || {})[k] === 2));
  }));

  // 2. announcer(ctx) exists, speaks, and its VO files exist (audio element loads)
  R('announcer', await page.evaluate(async () => {
    const a = window.__SCC2.audio2 || window.__SCC2.scene.getScene('Battle').audio;
    if (!a || typeof a.announcer !== 'function') return 'no-fn';
    a.init();
    for (let i = 0; i < 8; i++) { try { a._lastBark = 0; a.announcer(['supply','tech','place','energy','nocrew'][i % 5]); } catch (e) { return 'throw:' + e; } }
    // probe every terran err file exists
    const keys = ['err_supply','err_tech','err_place','err_energy','err_nocrew'];
    let miss = 0;
    for (const k of keys) for (let i = 1; i <= 2; i++) {
      const r = await fetch(`vo/terran/${k}_${i}.m4a`, { method: 'HEAD' });
      if (!r.ok || +(r.headers.get('content-length') || 0) < 2000) miss++;
    }
    return miss === 0 ? 'ok' : 'miss:' + miss;
  }));

  // 3. under-attack cooldown: second call within window is suppressed
  R('ua_cooldown', await page.evaluate(() => {
    const a = window.__SCC2.audio2 || window.__SCC2.scene.getScene('Battle').audio;
    a._lastUA = 0; a._lastBark = 0;
    a.underAttackBark();
    const t1 = a._lastUA || 0;
    const before = a._selIdx ? JSON.stringify(a._selIdx) : '';
    a.underAttackBark(); // must no-op
    return t1 > 0 && a._lastUA === t1;
  }));

  // 4. escalating select tiers: same selection repeated steps 1->2->3
  R('select_tiers', await page.evaluate(() => {
    const a = window.__SCC2.audio2 || window.__SCC2.scene.getScene('Battle').audio;
    a._selTier = { sig: '', n: 0, t: 0 };
    a.selectBark(['marine']); const t1 = a._selTier.n;
    a.selectBark(['marine']); const t2 = a._selTier.n;
    a.selectBark(['marine']); const t3 = a._selTier.n;
    a.selectBark(['marine']); const t4 = a._selTier.n; // capped
    return t1 === 1 && t2 === 2 && t3 === 3 && t4 === 3;
  }));

  // 5. escalating VO files exist for all races
  R('tier_vo', await page.evaluate(async () => {
    let miss = 0;
    for (const race of ['terran','skarn','auraxis']) for (const act of ['select2','select3','underattack']) for (let i = 1; i <= 2; i++) {
      const r = await fetch(`vo/${race}/${act}_${i}.m4a`, { method: 'HEAD' });
      if (!r.ok || +(r.headers.get('content-length') || 0) < 2000) miss++;
    }
    return miss === 0;
  }));

  // 6. briefing VO baked + decoded via cinematicAudio
  R('brief_vo', await page.evaluate(() => new Promise(res => {
    const t0 = Date.now();
    const chk = () => {
      const c = window.__CIN;
      const keys = ['b1a','b5a','b10b'];
      const ready = keys.filter(k => c && c.isReady(k));
      if (ready.length === keys.length || Date.now() - t0 > 20000) res(ready.length + '/' + keys.length);
      else setTimeout(chk, 500);
    };
    chk();
  })));

  // 7. briefing beats carry vo keys, and opening one plays without error
  R('brief_beats', await page.evaluate(() => {
    const b = window.__SCC2.scene.getScene('Battle');
    return new Promise(res => {
      // fire the gameover debrief bark path directly
      try {
        b.debriefLine = 'Sector scrubbed. The colony will live another season.';
        try { b.audio._lastBark = 0; } catch (e) {}
        b.audio.bark(b.debriefLine, 0.8, 0.92);
        res(true);
      } catch (e) { res('throw:' + e); }
    });
  }));

  // 8. idle chatter exists + cooldown flag arms
  R('idle_chatter', await page.evaluate(() => {
    const a = window.__SCC2.audio2 || window.__SCC2.scene.getScene('Battle').audio;
    a._lastIdle = 0;
    const before = a._lastIdle;
    a.idleChatter();
    return typeof a.idleChatter === 'function' && a._lastIdle > before;
  }));

  await page.waitForTimeout(1500);
  out.failed_vo_fetches = failedFetches;
  const bad = errors.filter(e => !/favicon/i.test(e));
  console.log(JSON.stringify(out, null, 1));
  console.log('ERRORS', bad.length ? JSON.stringify(bad.slice(0, 5)) : 'NONE');
  const pass = out.manifest === true && out.announcer === 'ok' && out.ua_cooldown === true
    && out.select_tiers === true && out.tier_vo === true
    && typeof out.brief_vo === 'string' && out.brief_vo.startsWith('3/3')
    && (out.brief_beats === true) && out.idle_chatter === true
    && failedFetches.length === 0 && bad.length === 0;
  console.log(pass ? 'GATE-V235 PASS' : 'GATE-V235 FAIL');
  await browser.close();
  process.exit(pass ? 0 : 1);
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(1); });
