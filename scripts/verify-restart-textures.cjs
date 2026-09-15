// Real-Chromium lifecycle verifier for BattleScene's owned dynamic textures.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');

const REQUIRED_KEYS = Object.freeze([
  { key: 'terrain' },
  { key: 'fog' },
  { key: 'vis' },
  { key: 'fog_mist', source: 'ai-fog_mist' },
  { key: 'blight-t0' },
  { key: 'blight-t1' },
  { key: 'blight-ai-t0', source: 'ai-blight_player' },
  { key: 'blight-ai-t1', source: 'ai-blight_enemy' },
]);

let chromium;
try {
  chromium = require('playwright').chromium;
} catch {
  const globalRoot = execSync('npm root -g', { encoding: 'utf8' }).trim();
  chromium = require(path.join(globalRoot, 'playwright')).chromium;
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

function listenLocal(server) {
  return new Promise((resolve, reject) => {
    const onError = (error) => {
      server.off('listening', onListening);
      reject(error);
    };
    const onListening = () => {
      server.off('error', onError);
      resolve();
    };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(0, '127.0.0.1');
  });
}

function isDuplicateTextureMessage(message) {
  return /(?:already\s+exists|duplicate|cannot add|can't add|key.*(?:exists|used)|texture.*(?:exists|already))/i.test(message);
}

async function waitForReady(page, cycle) {
  await page.waitForFunction((expectedCycle) => {
    const g = window.__SCC2;
    const b = g?.scene?.getScene('Battle');
    const oldNav = window.__P0012_OLD_NAV;
    const ready = Boolean(
      g?.scene?.isActive('Battle')
      && b?.scene?.isActive('Battle')
      && b?.nav
      && b?.nav !== oldNav
      && b?.mountains
      && b?.terrainCanvas
      && b?.fogCanvas
      && b?.visCanvas
      && b?.fogTex
      && b?.visTex
      && b?.blightCanvases?.[0]
      && b?.blightCanvases?.[1]
    );
    if (!ready) return false;
    window.__P0012_RESTART_STATE = window.__P0012_RESTART_STATE || {};
    window.__P0012_RESTART_STATE.completedCycle = expectedCycle;
    return true;
  }, cycle, { timeout: 20000 });
}

async function inspectCycle(page, cycle) {
  return page.evaluate(({ expectedCycle, keySpecs }) => {
    const g = window.__SCC2;
    const b = g?.scene?.getScene('Battle');
    if (!b) throw new Error(`BattleScene missing after cycle ${expectedCycle}`);
    const list = b.textures?.list || {};
    const count = (key) => Object.keys(list).filter((candidate) => candidate === key).length;
    const sources = Object.fromEntries(keySpecs
      .filter(({ source }) => source)
      .map(({ source }) => [source, !!b.textures.exists(source)]));
    const keys = {};
    for (const { key, source } of keySpecs) {
      if (!source || sources[source]) keys[key] = count(key);
    }
    const images = {
      terrain: b.terrainImg?.texture?.key === 'terrain',
      fog: b.fogImg?.texture?.key === 'fog',
      vis: b.visImg?.texture?.key === 'vis',
      fog_mist: !sources['ai-fog_mist'] || b.fogMistImg?.texture?.key === 'fog_mist',
      blight0: b.blightTextures?.[0]?.key === 'blight-t0',
      blight1: b.blightTextures?.[1]?.key === 'blight-t1',
      blightAi0: !sources['ai-blight_player'] || b.blightCanvases?.[0]?.ac
        && b.textures.get('blight-ai-t0')?.key === 'blight-ai-t0',
      blightAi1: !sources['ai-blight_enemy'] || b.blightCanvases?.[1]?.ac
        && b.textures.get('blight-ai-t1')?.key === 'blight-ai-t1',
    };
    const dimensions = {
      terrain: [b.terrainCanvas?.width, b.terrainCanvas?.height],
      fog: [b.fogCanvas?.width, b.fogCanvas?.height],
      vis: [b.visCanvas?.width, b.visCanvas?.height],
      fog_mist: [b.mistCanvas?.width, b.mistCanvas?.height],
      blight0: [b.blightCanvases?.[0]?.c?.width, b.blightCanvases?.[0]?.c?.height],
      blight1: [b.blightCanvases?.[1]?.c?.width, b.blightCanvases?.[1]?.c?.height],
      blightAi0: [b.blightCanvases?.[0]?.ac?.width, b.blightCanvases?.[0]?.ac?.height],
      blightAi1: [b.blightCanvases?.[1]?.ac?.width, b.blightCanvases?.[1]?.ac?.height],
    };
    const dimensionRefs = {
      terrain: dimensions.terrain,
      fog: dimensions.fog,
      vis: dimensions.vis,
      fog_mist: dimensions.fog_mist,
      'blight-t0': dimensions.blight0,
      'blight-t1': dimensions.blight1,
      'blight-ai-t0': dimensions.blightAi0,
      'blight-ai-t1': dimensions.blightAi1,
    };
    const textureDimensions = {};
    const previousSources = window.__P0012_TEXTURE_SOURCES || {};
    const sourceReuse = {};
    for (const { key, source } of keySpecs) {
      if (source && !sources[source]) continue;
      const sourceImage = b.textures.get(key)?.getSourceImage();
      textureDimensions[key] = [sourceImage?.width, sourceImage?.height];
      sourceReuse[key] = previousSources[key] ? previousSources[key] === sourceImage : null;
    }
    window.__P0012_TEXTURE_SOURCES = Object.fromEntries(Object.keys(textureDimensions)
      .map((key) => [key, b.textures.get(key).getSourceImage()]));
    return { cycle: expectedCycle, keys, sources, images, dimensions, dimensionRefs, textureDimensions, sourceReuse };
  }, { expectedCycle: cycle, keySpecs: REQUIRED_KEYS });
}

async function runBrowser(targetUrl) {
  const consoleEvents = [];
  const pageErrors = [];
  const browser = await chromium.launch({
    headless: true,
    args: [
      '--use-gl=angle',
      '--enable-gpu',
      '--enable-precise-memory-info',
      '--js-flags=--expose-gc',
    ],
  });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    page.on('pageerror', (error) => pageErrors.push(error.stack || String(error)));
    page.on('console', (message) => {
      if (message.type() === 'warn' || message.type() === 'error') {
        consoleEvents.push({ type: message.type(), text: message.text() });
      }
    });

    await page.goto(targetUrl, { waitUntil: 'load' });
    await page.evaluate(() => localStorage.setItem('starfront.cutseen.v1', '1'));
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => window.__SCC2?.scene?.isActive('Title'), null, { timeout: 20000 });

    await page.evaluate(() => {
      const g = window.__SCC2;
      const sm = g.scene;
      for (const sc of sm.getScenes(true)) {
        if (sc.scene.key !== 'Boot' && sc.scene.key !== 'Preload') sm.stop(sc.scene.key);
      }
      window.__P0012_OLD_NAV = null;
      window.__P0012_RESTART_STATE = { completedCycle: 0, restartCalls: 0 };
      sm.start('Battle', {
        race: 'terran',
        enemyRace: 'skarn',
        difficulty: 'normal',
        __p0012RestartCycle: 0,
      });
    });
    await page.waitForFunction(() => {
      const g = window.__SCC2;
      const b = g?.scene?.getScene('Battle');
      return Boolean(
        g?.scene?.isActive('Battle')
        && b?.scene?.isActive('Battle')
        && b?.nav
        && b?.mountains
        && b?.terrainCanvas
        && b?.fogCanvas
        && b?.visCanvas
        && b?.fogTex
        && b?.visTex
        && b?.blightCanvases?.[0]
        && b?.blightCanvases?.[1]
      );
    }, null, { timeout: 20000 });

    const cycles = [];
    let completedCycles = 0;
    let expectedDimensions = null;
    for (let cycle = 1; cycle <= 5; cycle++) {
      await page.evaluate((expectedCycle) => {
        const sm = window.__SCC2.scene;
        const battle = sm.getScene('Battle');
        window.__P0012_OLD_NAV = battle?.nav;
        window.__P0012_RESTART_STATE = window.__P0012_RESTART_STATE || {};
        window.__P0012_RESTART_STATE.restartCalls = (window.__P0012_RESTART_STATE.restartCalls || 0) + 1;
        battle.scene.restart({
          race: 'terran',
          enemyRace: 'skarn',
          difficulty: 'normal',
          __p0012RestartCycle: expectedCycle,
        });
      }, cycle);
      await waitForReady(page, cycle);
      completedCycles = cycle;
      const observation = await inspectCycle(page, cycle);
      if (Object.values(observation.keys).some((keyCount) => keyCount !== 1)) {
        throw new Error(`Cycle ${cycle} dynamic texture key count failure: ${JSON.stringify(observation.keys)}`);
      }
      if (Object.values(observation.images).some((exists) => !exists)) {
        throw new Error(`Cycle ${cycle} dynamic texture image binding failure: ${JSON.stringify(observation.images)}`);
      }
      if (Object.entries(observation.textureDimensions)
        .some(([key, value]) => JSON.stringify(value) !== JSON.stringify(observation.dimensionRefs[key]))) {
        throw new Error(`Cycle ${cycle} dynamic texture dimensions mismatch: ${JSON.stringify({ dimensions: observation.dimensions, textureDimensions: observation.textureDimensions })}`);
      }
      if (Object.entries(observation.sourceReuse).some(([, reused]) => reused === false)) {
        throw new Error(`Cycle ${cycle} dynamic texture source was replaced: ${JSON.stringify(observation.sourceReuse)}`);
      }
      const dimensionsJson = JSON.stringify(observation.dimensions);
      if (expectedDimensions && dimensionsJson !== expectedDimensions) {
        throw new Error(`Cycle ${cycle} dynamic texture dimensions changed: ${dimensionsJson}`);
      }
      expectedDimensions = expectedDimensions || dimensionsJson;
      cycles.push(observation);
      if (cycle === 1 || cycle === 5) {
        const heap = await page.evaluate(() => {
          if (typeof window.gc !== 'function') throw new Error('Explicit GC is unavailable');
          window.gc();
          return performance.memory?.usedJSHeapSize;
        });
        if (!Number.isFinite(heap)) throw new Error(`Cycle ${cycle} precise usedJSHeapSize unavailable`);
        observation.usedJSHeapSize = heap;
      }
    }

    const restartCalls = await page.evaluate(() => window.__P0012_RESTART_STATE?.restartCalls);
    if (restartCalls !== 5) {
      throw new Error(`Expected restartCalls === 5, got ${restartCalls}`);
    }

    const duplicateTextureErrors = consoleEvents
      .filter(({ type, text }) => type === 'error' && isDuplicateTextureMessage(text));
    const realPageErrors = pageErrors;
    const heapGrowth = cycles[4].usedJSHeapSize - cycles[0].usedJSHeapSize;
    return { cycles, consoleEvents, pageErrors, duplicateTextureErrors, realPageErrors, heapGrowth, completedCycles, restartCalls };
  } finally {
    await browser.close();
  }
}

async function main() {
  const repoRoot = path.resolve(__dirname, '..');
  const stageDir = path.join('/tmp', 'scc-build-restart-textures-' + Date.now());
  execSync(`npx --no-install vite build --outDir ${stageDir} --emptyOutDir`, { cwd: repoRoot, stdio: 'inherit' });

  const server = createStaticServer(stageDir);
  try {
    await listenLocal(server);
    const targetUrl = `http://127.0.0.1:${server.address().port}/scc/`;
    console.log(`Serving staged build at ${targetUrl}`);
    const result = await runBrowser(targetUrl);
    console.log(`COMPLETED CYCLES: ${result.completedCycles}`);
    console.log(`RESTART CALLS: ${result.restartCalls}`);
    for (const cycle of result.cycles) {
      console.log(`CYCLE ${cycle.cycle}: keys=${JSON.stringify(cycle.keys)} images=${JSON.stringify(cycle.images)} sources=${JSON.stringify(cycle.sources)}${cycle.usedJSHeapSize ? ` usedJSHeapSize=${cycle.usedJSHeapSize}` : ''}`);
    }
    console.log(`CONSOLE WARN/ERROR COUNT: ${result.consoleEvents.length}`);
    for (const event of result.consoleEvents) console.log(`CONSOLE ${event.type}: ${event.text}`);
    console.log(`DUPLICATE TEXTURE ERRORS: ${result.duplicateTextureErrors.length}`);
    console.log(`PAGEERROR COUNT: ${result.realPageErrors.length}`);
    for (const error of result.realPageErrors) console.log(`PAGEERROR: ${error}`);
    console.log(`HEAP GROWTH: ${result.heapGrowth} bytes (${(result.heapGrowth / (1024 * 1024)).toFixed(2)} MB)`);

    if (result.restartCalls !== 5) throw new Error('Expected 5 scene.restart calls');
    if (result.duplicateTextureErrors.length !== 0) throw new Error('Duplicate texture-key errors were captured');
    if (result.realPageErrors.length !== 0) throw new Error('Uncaught page errors were captured');
    if (result.heapGrowth > 25 * 1024 * 1024) throw new Error('usedJSHeapSize growth exceeded 25 MB');
    console.log('DONE-WHEN VERIFIED: five BattleScene.restart cycles passed.');
  } finally {
    server.close();
    try { fs.rmSync(stageDir, { recursive: true, force: true }); } catch (e) {}
  }
}

main().catch((error) => {
  console.error('FAIL:', error.message || error);
  process.exit(1);
});
