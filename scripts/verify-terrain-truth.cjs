/**
 * scripts/verify-terrain-truth.cjs
 *
 * Deterministic verifier for BattleScene terrain truth export.
 * Stages a Vite build in /tmp, runs two independent Chromium instances
 * with the unchanged default deterministic mode, requires byte-identical export, validates
 * the schema, and writes terrain_truth.json.
 */

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');

const LIVE_DIMENSIONS = Object.freeze({ w: 160, h: 160, tileSize: 16, pxw: 2560, pxh: 2560 });

let chromium;
try {
  chromium = require('playwright').chromium;
} catch (e) {
  try {
    const globalRoot = execSync('npm root -g', { encoding: 'utf8' }).trim();
    chromium = require(path.join(globalRoot, 'playwright')).chromium;
  } catch (err) {
    console.error('FATAL: Could not load playwright:', err.message);
    process.exit(1);
  }
}

const MIME_MAP = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.json': 'application/json',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
};

function createStaticServer(stageDir) {
  return http.createServer((req, res) => {
    let reqPath = req.url.replace(/^\/scc\/?/, '');
    reqPath = reqPath.split('?')[0];
    if (!reqPath || reqPath === '/') reqPath = 'index.html';
    const filePath = path.join(stageDir, reqPath);
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const ext = path.extname(filePath);
      res.writeHead(200, { 'Content-Type': MIME_MAP[ext] || 'application/octet-stream' });
      fs.createReadStream(filePath).pipe(res);
    } else {
      res.writeHead(404);
      res.end('Not Found');
    }
  });
}

async function runBrowserInstance(url) {
  const browser = await chromium.launch({
    headless: true,
    args: ['--use-gl=angle', '--enable-gpu'],
  });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const errors = [];
    page.on('pageerror', err => errors.push(String(err)));
    page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });

    await page.goto(url, { waitUntil: 'load' });
    await page.evaluate(() => localStorage.setItem('starfront.cutseen.v1', '1'));
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => window.__SCC2 && window.__SCC2.scene.isActive('Title'), null, { timeout: 20000 });

    // Boot BattleScene with its unchanged default deterministic mode
    await page.evaluate(() => {
      const g = window.__SCC2;
      const sm = g.scene;
      for (const sc of sm.getScenes(true)) {
        if (sc.scene.key !== 'Boot' && sc.scene.key !== 'Preload') sm.stop(sc.scene.key);
      }
      sm.start('Battle', { race: 'terran', enemyRace: 'skarn', difficulty: 'normal' });
    });

    await page.waitForFunction(() => {
      const b = window.__SCC2?.scene?.getScene('Battle');
      return b && b.nav && b.mountains && b.terrainCanvas;
    }, null, { timeout: 20000 });

    // Seam check: exportTerrainTruth method must exist on BattleScene
    const exportResult = await page.evaluate((expected) => {
      const b = window.__SCC2.scene.getScene('Battle');
      if (!b) throw new Error('BattleScene not found');
      if (typeof b.exportTerrainTruth !== 'function') {
        throw new Error('BattleScene.exportTerrainTruth seam method is not implemented');
      }
      const live = {
        w: b.nav?.w,
        h: b.nav?.h,
        tileSize: b.nav?.tileSize,
        pxw: b.terrainCanvas?.width,
        pxh: b.terrainCanvas?.height,
      };
      if (JSON.stringify(live) !== JSON.stringify(expected)) {
        throw new Error(`Live terrain dimensions mismatch: ${JSON.stringify(live)}`);
      }
      return b.exportTerrainTruth();
    }, LIVE_DIMENSIONS);

    const realErrors = errors.filter(e => !/AudioContext|autoplay|favicon|WebGL|GPU stall|debounced/i.test(e));
    if (realErrors.length > 0) {
      console.warn('Page errors during instance run:', realErrors);
    }

    return exportResult;
  } finally {
    await browser.close();
  }
}

function validateSchema(data) {
  if (!data || typeof data !== 'object') {
    throw new Error('Exported terrain truth must be an object');
  }
  const { summary, cells } = data;
  if (!summary || typeof summary !== 'object') {
    throw new Error('summary object missing from export');
  }
  if (summary.total_cells !== LIVE_DIMENSIONS.w * LIVE_DIMENSIONS.h) {
    throw new Error(`Expected summary.total_cells === ${LIVE_DIMENSIONS.w * LIVE_DIMENSIONS.h}, got ${summary.total_cells}`);
  }
  if (!Number.isInteger(summary.mismatch_count) || summary.mismatch_count < 0) {
    throw new Error('summary.mismatch_count must be a number');
  }
  const dims = summary.dimensions;
  if (!dims || JSON.stringify(dims) !== JSON.stringify(LIVE_DIMENSIONS)) {
    throw new Error(`Dimensions mismatch: expected ${JSON.stringify(LIVE_DIMENSIONS)}, got ${JSON.stringify(dims)}`);
  }
  if (!summary.counts || !summary.counts.by_terrain_class || !summary.counts.by_nav_truth) {
    throw new Error('summary.counts must include by_terrain_class and by_nav_truth');
  }

  const classNames = ['mountain', 'plateau', 'cliff_edge', 'ramp', 'rock', 'valley', 'plain'];
  const navNames = ['solid', 'blocked', 'walkable'];
  const navFields = { solid: 'nav_solid', blocked: 'nav_blocked', walkable: 'walkable' };
  const classCounts = Object.fromEntries(classNames.map(name => [name, 0]));
  const navCounts = Object.fromEntries(navNames.map(name => [name, 0]));
  if (!Array.isArray(cells) || cells.length !== LIVE_DIMENSIONS.w * LIVE_DIMENSIONS.h) {
    throw new Error(`Expected cells array of exactly ${LIVE_DIMENSIONS.w * LIVE_DIMENSIONS.h} items, got ${cells ? cells.length : 'non-array'}`);
  }

  let mismatchesFound = 0;
  const cliffReason = 'non-ramp cliff/elevation transition lacks terrain-solid blocking';
  const rockReason = 'rock cell represented only by blockedBy/dynamic blocking';
  let cliffCandidates = 0;
  let rockCandidates = 0;

  for (let idx = 0; idx < cells.length; idx++) {
    const c = cells[idx];
    const expectedTy = Math.floor(idx / LIVE_DIMENSIONS.w);
    const expectedTx = idx % LIVE_DIMENSIONS.w;
    if (c.tx !== expectedTx || c.ty !== expectedTy) {
      throw new Error(`Cell ordering failure at index ${idx}: expected (tx=${expectedTx}, ty=${expectedTy}), got (tx=${c.tx}, ty=${c.ty})`);
    }
    if (typeof c.world_x !== 'number' || !Number.isFinite(c.world_x) || c.world_x !== (c.tx + 0.5) * LIVE_DIMENSIONS.tileSize) {
      throw new Error(`Cell (${c.tx}, ${c.ty}) world_x must be a valid number`);
    }
    if (typeof c.world_y !== 'number' || !Number.isFinite(c.world_y) || c.world_y !== (c.ty + 0.5) * LIVE_DIMENSIONS.tileSize) {
      throw new Error(`Cell (${c.tx}, ${c.ty}) world_y must be a valid number`);
    }
    if (!classNames.includes(c.terrain_class)) {
      throw new Error(`Cell (${c.tx}, ${c.ty}) has invalid terrain_class: ${c.terrain_class}`);
    }
    classCounts[c.terrain_class]++;
    if (typeof c.elevation !== 'number') {
      throw new Error(`Cell (${c.tx}, ${c.ty}) elevation must be numeric`);
    }
    for (const key of ['nav_solid', 'nav_blocked', 'walkable', 'mismatch']) {
      if (typeof c[key] !== 'boolean') throw new Error(`Cell (${c.tx}, ${c.ty}) ${key} must be boolean`);
    }
    if (typeof c.nav_blocked_by !== 'number' || !Number.isInteger(c.nav_blocked_by)) {
      throw new Error(`Cell (${c.tx}, ${c.ty}) nav_blocked_by must be an integer`);
    }
    for (const key of navNames) if (c[navFields[key]]) navCounts[key]++;
    if (c.terrain_class === 'cliff_edge' && !c.nav_solid) {
      cliffCandidates++;
      if (!c.mismatch_reason.includes(cliffReason)) throw new Error(`Cell (${c.tx}, ${c.ty}) lacks cliff-edge mismatch coverage`);
    }
    if (c.terrain_class === 'rock' && !c.nav_solid && c.nav_blocked) {
      rockCandidates++;
      if (!c.mismatch_reason.includes(rockReason)) throw new Error(`Cell (${c.tx}, ${c.ty}) lacks rock-solidity mismatch coverage`);
    }
    if (c.mismatch) {
      mismatchesFound++;
      if (typeof c.mismatch_reason !== 'string' || c.mismatch_reason.trim().length === 0) {
        throw new Error(`Cell (${c.tx}, ${c.ty}) has mismatch=true but mismatch_reason is empty`);
      }
    } else if (typeof c.mismatch_reason !== 'string' || c.mismatch_reason.trim().length !== 0) {
      throw new Error(`Cell (${c.tx}, ${c.ty}) has a mismatch reason but mismatch=false`);
    }
  }

  if (JSON.stringify(summary.counts.by_terrain_class) !== JSON.stringify(classCounts)) {
    throw new Error(`Terrain class counts do not match cells: ${JSON.stringify(summary.counts.by_terrain_class)}`);
  }
  if (JSON.stringify(summary.counts.by_nav_truth) !== JSON.stringify(navCounts)) {
    throw new Error(`Nav truth counts do not match cells: ${JSON.stringify(summary.counts.by_nav_truth)}`);
  }
  if (summary.mismatch_count !== mismatchesFound) {
    throw new Error(`summary.mismatch_count (${summary.mismatch_count}) does not match actual mismatch count (${mismatchesFound})`);
  }
  if (classCounts.cliff_edge <= 0) throw new Error('No observed cliff-edge coverage in terrain export');
  if (cliffCandidates !== 0) throw new Error(`Expected 0 unblocked cliff-edge solidity mismatches, got ${cliffCandidates}`);
  if (!rockCandidates) throw new Error('No observed rock dynamic-blocking solidity mismatch was covered');
}

async function main() {
  const repoRoot = path.resolve(__dirname, '..');
  const stageDir = path.join('/tmp', 'scc-build-terrain-truth-' + Date.now());
  const truthFile = path.join(repoRoot, 'terrain_truth.json');

  console.log('--- Staging Vite build in /tmp ---');
  execSync(`npx vite build --outDir ${stageDir} --emptyOutDir`, {
    cwd: repoRoot,
    stdio: 'inherit',
  });

  const server = createStaticServer(stageDir);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const targetUrl = `http://127.0.0.1:${server.address().port}/scc/`;
  console.log(`Serving staged build at ${targetUrl}`);

  try {
    console.log('--- Running browser instance 1 ---');
    const run1 = await runBrowserInstance(targetUrl);
    validateSchema(run1);
    const json1 = JSON.stringify(run1);

    console.log('--- Running browser instance 2 (independent verification) ---');
    const run2 = await runBrowserInstance(targetUrl);
    validateSchema(run2);
    const json2 = JSON.stringify(run2);

    if (json1 !== json2) {
      throw new Error('Determinism failure: Browser instance 1 and 2 produced non-identical terrain truth exports!');
    }
    console.log('PASS: Deterministic runs produced byte-identical output.');

    // Write compact one-line terrain_truth.json
    fs.writeFileSync(truthFile, json1 + '\n', 'utf8');
    console.log(`PASS: Written compact one-line ${truthFile}`);

    // Verify written file
    const writtenRaw = fs.readFileSync(truthFile, 'utf8').trim();
    const parsed = JSON.parse(writtenRaw);
    validateSchema(parsed);
    const compact = writtenRaw.trim();
    if (compact.includes('\n') || compact.includes('\r')) throw new Error('terrain_truth.json is not one-line compact JSON');
    const mismatches = parsed.cells.filter(c => c.mismatch);
    for (const m of mismatches) {
      if (typeof m.world_x !== 'number' || typeof m.world_y !== 'number' || !m.mismatch_reason) {
        throw new Error(`terrain_truth.json cell (${m.tx}, ${m.ty}) invalid mismatch coordinates or reason`);
      }
    }
    console.log(`DONE-WHEN VERIFIED: ${parsed.cells.length} cells, ${mismatches.length} mismatches reported, all coordinates valid.`);
    console.log(`Summary counts:`, JSON.stringify(parsed.summary.counts));

    process.exit(0);
  } finally {
    server.close();
    try { fs.rmSync(stageDir, { recursive: true, force: true }); } catch (e) {}
  }
}

main().catch(err => {
  console.error('FAIL:', err.message || err);
  process.exit(1);
});
