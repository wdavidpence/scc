/**
 * scripts/verify-mountain-continuity.cjs
 * Verifier for mountain continuity and valley clearance (P0.006).
 */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execSync } = require('node:child_process');

const EXPECTED_ELEV_RAMP_SHA256 = 'a731b52ecfed451f8d965f21e791d19a254b3ae30e790d55e143b5fa281d779f';
const SEEDS = [
  { name: 'default (seed 1234567)', seed: undefined, rngSeed: 1234567 },
  { name: 'seed 1 override', seed: 1, rngSeed: 1 },
  { name: 'seed 42 override', seed: 42, rngSeed: 42 },
];

let chromium;
try {
  chromium = require('playwright').chromium;
} catch {
  const globalRoot = execSync('npm root -g', { encoding: 'utf8' }).trim();
  chromium = require(path.join(globalRoot, 'playwright')).chromium;
}

const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json' };

function createStaticServer(stageDir) {
  return http.createServer((req, res) => {
    let reqPath = req.url.replace(/^\/scc\/?/, '').split('?')[0];
    if (!reqPath || reqPath === '/') reqPath = 'index.html';
    const filePath = path.join(stageDir, reqPath);
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' });
      fs.createReadStream(filePath).pipe(res);
    } else {
      res.writeHead(404); res.end('Not Found');
    }
  });
}

async function runSeedInstance(url, seedOverride) {
  const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--enable-gpu'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await page.goto(url, { waitUntil: 'load' });
    await page.evaluate(() => localStorage.setItem('starfront.cutseen.v1', '1'));
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => window.__SCC2 && window.__SCC2.scene.isActive('Title'), null, { timeout: 20000 });

    await page.evaluate((seed) => {
      const g = window.__SCC2, sm = g.scene;
      for (const sc of sm.getScenes(true)) {
        if (sc.scene.key !== 'Boot' && sc.scene.key !== 'Preload') sm.stop(sc.scene.key);
      }
      if (seed !== undefined) {
        sm.getScene('Battle').rng = () => {
          let s = seed; return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
        };
      }
      sm.start('Battle', { race: 'terran', enemyRace: 'skarn', difficulty: 'normal' });
    }, seedOverride);

    await page.waitForFunction(() => {
      const b = window.__SCC2?.scene?.getScene('Battle');
      return b && b.nav && b.mountains && b.terrainCanvas && b.valleys;
    }, null, { timeout: 20000 });

    return await page.evaluate((seed) => {
      const b = window.__SCC2.scene.getScene('Battle');
      const { w, h, tileSize } = b.nav;
      const valleys = (b.valleys || []).map(([tx, ty]) => {
        const i = b.nav.idx(tx, ty);
        return {
          tx, ty,
          elev: Number(b.elevAt((tx + 0.5) * tileSize, (ty + 0.5) * tileSize)),
          solid: Boolean(b.nav.solid[i]),
          blocked: Boolean(b.nav.blocked[i]),
          walkable: Boolean(b.nav.walkable(tx, ty)),
        };
      });

      const solidMask = Array.from(b.nav.solid);
      const connectivityCorridors = (b.connectivityCorridors || []).map(([tx, ty]) => [tx, ty]);
      const hqA = { x: Math.floor(w * 0.12), y: Math.floor(h * 0.12) };
      const hqB = { x: Math.floor(w * 0.88), y: Math.floor(h * 0.88) };
      const seen = new Uint8Array(w * h);
      const q = [hqA.x + hqA.y * w];
      seen[q[0]] = 1;
      let reachedB = false;
      while (q.length > 0) {
        const curr = q.pop(), cx = curr % w, cy = (curr / w) | 0;
        if (Math.abs(cx - hqB.x) <= 6 && Math.abs(cy - hqB.y) <= 6) { reachedB = true; break; }
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = cx + dx, ny = cy + dy;
          if (!b.nav.inBounds(nx, ny)) continue;
          const ni = b.nav.idx(nx, ny);
          if (seen[ni] || !b.nav.walkable(nx, ny)) continue;
          seen[ni] = 1; q.push(ni);
        }
      }

      const terrainTruth = (seed === undefined && typeof b.exportTerrainTruth === 'function') ? b.exportTerrainTruth() : null;
      return { w, h, tileSize, valleys, solidMask, connectivityCorridors, reachedB, terrainTruth, mountainCount: b.mountains ? b.mountains.length : 0 };
    }, seedOverride);
  } finally {
    await browser.close();
  }
}

function computeIntendedAuthored(w, h, rngSeed) {
  const wall = [];
  for (let ty = 6; ty < h - 6; ty++) {
    const cx = Math.round(w * 0.5 + Math.sin(ty * 0.09 + 1.7) * 11);
    if (ty > h * 0.42 && ty < h * 0.58) continue;
    for (let d = -2; d <= 2; d++) wall.push([cx + d, ty]);
    const c2 = cx + 12 + Math.round(Math.sin(ty * 0.13) * 4);
    for (let d = -1; d <= 1; d++) wall.push([c2 + d, ty]);
  }
  const fingers = [];
  for (const side of [0, 1]) {
    for (const fy of side ? [0.30, 0.72] : [0.22, 0.64]) {
      const lanes = side ? [0.55, 0.85] : [0.12, 0.42];
      for (let tx = side ? w * 0.58 : w * 0.08; tx < (side ? w - 6 : w * 0.46); tx++) {
        const ty = Math.round(h * fy + Math.sin(tx * 0.11 + fy * 9) * 5);
        if (lanes.some(L => tx > w * L - 4 && tx < w * L + 4)) continue;
        for (let d = -1; d <= 1; d++) fingers.push([tx, ty + d]);
      }
    }
  }
  let s = rngSeed;
  const rnd = () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
  const knolls = [];
  for (let k = 0; k < 14; k++) {
    const kx = 14 + ((rnd() * (w - 28)) | 0), ky = 14 + ((rnd() * (h - 28)) | 0), kr = 2 + ((rnd() * 3) | 0);
    for (let dy = -kr; dy <= kr; dy++) for (let dx = -kr; dx <= kr; dx++) {
      if (dx * dx + dy * dy <= kr * kr) knolls.push([kx + dx, ky + dy]);
    }
  }
  return [...wall, ...fingers, ...knolls];
}

async function main() {
  const repoRoot = path.resolve(__dirname, '..');
  const stageDir = path.join('/tmp', 'scc-build-mountain-continuity-' + Date.now());

  console.log('--- Staging Vite build in /tmp ---');
  execSync(`npx vite build --outDir ${stageDir} --emptyOutDir`, { cwd: repoRoot, stdio: 'inherit' });
  const server = createStaticServer(stageDir);
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const targetUrl = `http://127.0.0.1:${server.address().port}/scc/`;

  try {
    let allPassed = true;
    const failures = [], seedResults = [];
    let defaultFingerprint = '';

    for (const item of SEEDS) {
      console.log(`\n--- Testing ${item.name} ---`);
      const run = await runSeedInstance(targetUrl, item.seed);
      const { w, h, valleys, solidMask, connectivityCorridors, reachedB, terrainTruth, mountainCount } = run;

      const rawAuthored = computeIntendedAuthored(w, h, item.rngSeed);
      const hqClear = [{ x: Math.floor(w * 0.12), y: Math.floor(h * 0.12), r: 12 }, { x: Math.floor(w * 0.88), y: Math.floor(h * 0.88), r: 12 }];
      const inHqClear = (tx, ty) => hqClear.some(hq => Math.abs(tx - hq.x) <= hq.r && Math.abs(ty - hq.y) <= hq.r);
      const valleySet = new Set(valleys.map(v => `${v.tx},${v.ty}`));
      const corridorSet = new Set(connectivityCorridors.map(([cx, cy]) => `${cx},${cy}`));

      const intendedSet = new Set();
      for (const [tx, ty] of rawAuthored) {
        if (tx < 3 || ty < 3 || tx >= w - 3 || ty >= h - 3) continue;
        if (inHqClear(tx, ty) || valleySet.has(`${tx},${ty}`) || corridorSet.has(`${tx},${ty}`)) continue;
        intendedSet.add(`${tx},${ty}`);
      }

      let nonSolidCount = 0;
      for (const k of intendedSet) {
        const [tx, ty] = k.split(',').map(Number);
        if (solidMask[ty * w + tx] === 0) nonSolidCount++;
      }

      const solidValleys = valleys.filter(v => v.solid).length;
      const nonZeroElevValleys = valleys.filter(v => v.elev !== 0).length;
      const nonWalkableValleys = valleys.filter(v => !v.walkable).length;

      if (item.seed === undefined) {
        const elevRampStr = terrainTruth.cells.map(c => `${c.elevation}/${c.terrain_class === 'ramp' ? 1 : 0}`).join(',');
        defaultFingerprint = crypto.createHash('sha256').update(elevRampStr).digest('hex');
        if (defaultFingerprint !== EXPECTED_ELEV_RAMP_SHA256) {
          failures.push(`Elevation+ramp fingerprint mismatch: ${defaultFingerprint}`); allPassed = false;
        }
      }

      seedResults.push({ name: item.name, mountainCount, intendedCount: intendedSet.size, nonSolidCount, valleyCount: valleys.length, solidValleys, nonWalkableValleys, hqConnected: reachedB });
      console.log(`Result: intended=${intendedSet.size}, nonSolid=${nonSolidCount}, valleys=${valleys.length}, solidValleys=${solidValleys}, nonWalkableValleys=${nonWalkableValleys}, hqConnected=${reachedB}`);

      if (nonSolidCount !== 0) { failures.push(`${item.name}: mountain interior non-solid count === ${nonSolidCount}`); allPassed = false; }
      if (solidValleys !== 0) { failures.push(`${item.name}: flat valley solid count === ${solidValleys}`); allPassed = false; }
      if (nonZeroElevValleys !== 0) { failures.push(`${item.name}: flat valley non-zero elevation count === ${nonZeroElevValleys}`); allPassed = false; }
      if (nonWalkableValleys !== 0) { failures.push(`${item.name}: flat valley non-walkable count === ${nonWalkableValleys}`); allPassed = false; }
      if (!reachedB) { failures.push(`${item.name}: HQ-to-HQ walkable flood-fill failed`); allPassed = false; }
    }

    console.log('\n--- VERIFICATION SUMMARY ---');
    for (const r of seedResults) {
      console.log(`[${r.name}] mountainCount=${r.mountainCount} nonSolid=${r.nonSolidCount} valleys=${r.valleyCount} solidValleys=${r.solidValleys} hqConnected=${r.hqConnected}`);
    }
    console.log(`Elevation+ramp SHA256: ${defaultFingerprint} (expected ${EXPECTED_ELEV_RAMP_SHA256})`);

    if (!allPassed) {
      console.error('\nVERIFICATION FAILED:\n' + failures.map(f => `  - ${f}`).join('\n'));
      process.exit(1);
    }
    console.log('\nALL P0.006 CONTINUITY CHECKS PASSED');
    process.exit(0);
  } finally {
    server.close();
    try { fs.rmSync(stageDir, { recursive: true, force: true }); } catch {}
  }
}

main().catch(err => { console.error('FAIL:', err.message || err); process.exit(1); });
