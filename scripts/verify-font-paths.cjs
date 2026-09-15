const http = require('http');
const fs = require('fs');
const path = require('path');
const { execSync, spawnSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const distDir = path.join(rootDir, 'dist');

let chromium;
try {
  chromium = require('playwright').chromium;
} catch {
  const pwPath = execSync('npm root -g', { encoding: 'utf8' }).trim();
  chromium = require(path.join(pwPath, 'playwright')).chromium;
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.ttf': 'font/ttf',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
};

const REQUIRED_TTF_BASENAMES = [
  'Orbitron-Variable.ttf',
  'Rajdhani-Bold.ttf',
  'Rajdhani-SemiBold.ttf',
];

function build(basePath) {
  const res = spawnSync('npx', ['vite', 'build', '--base', basePath], {
    cwd: rootDir,
    encoding: 'utf8',
    env: { ...process.env },
  });
  const output = (res.stdout || '') + '\n' + (res.stderr || '');
  if (res.status !== 0) {
    throw new Error(`Vite build failed for base ${basePath}:\n${output}`);
  }

  // Count unresolved font warnings
  const lines = output.split('\n');
  const unresolvedTtf = lines.filter(l =>
    /\.ttf/i.test(l) && /(?:unresolved|didn't resolve|could not resolve)/i.test(l)
  );

  return {
    output,
    unresolvedTtfCount: unresolvedTtf.length,
    unresolvedWarnings: unresolvedTtf,
  };
}

function startServer(basePath) {
  const isScc = basePath === '/scc/';
  const server = http.createServer((req, res) => {
    let reqUrl = req.url.split('?')[0];

    if (isScc) {
      if (reqUrl === '/scc') {
        res.writeHead(302, { Location: '/scc/' });
        return res.end();
      }
      if (!reqUrl.startsWith('/scc/')) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        return res.end('Not Found outside /scc/');
      }
      reqUrl = reqUrl.slice('/scc/'.length - 1); // retains leading '/'
    }

    if (reqUrl === '/' || reqUrl === '') {
      reqUrl = '/index.html';
    } else if (reqUrl === '/scc/favicon.svg' && !isScc) {
      reqUrl = '/favicon.svg';
    }

    const relPath = reqUrl.startsWith('/') ? reqUrl.slice(1) : reqUrl;
    const targetFile = path.join(distDir, relPath);

    if (fs.existsSync(targetFile) && fs.statSync(targetFile).isFile()) {
      const ext = path.extname(targetFile);
      const mime = MIME_TYPES[ext] || 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': mime });
      fs.createReadStream(targetFile).pipe(res);
    } else {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
    }
  });

  return new Promise((resolve, reject) => {
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      resolve({
        server,
        port,
        close: () => new Promise(r => server.close(r)),
      });
    });
    server.on('error', reject);
  });
}

async function verifyBase(browser, basePath) {
  console.log(`\n=== Testing Base: "${basePath}" ===`);
  const buildResult = build(basePath);
  console.log(`Build complete. Unresolved TTF warnings: ${buildResult.unresolvedTtfCount}`);
  if (buildResult.unresolvedTtfCount > 0) {
    console.error('Found unresolved TTF warnings:', buildResult.unresolvedWarnings);
  }

  const srv = await startServer(basePath);
  const page = await browser.newPage();

  const pageErrors = [];
  const requestFailed = [];
  const ttf200Urls = new Set();
  let font404Count = 0;

  page.on('pageerror', err => pageErrors.push(String(err)));
  page.on('requestfailed', req => {
    requestFailed.push(`${req.url()} (${req.failure()?.errorText || 'failed'})`);
  });
  page.on('response', res => {
    const u = res.url();
    const isFont = /\.ttf(\?.*)?$/i.test(u) || u.includes('/fonts/');
    if (isFont && res.status() === 404) {
      font404Count++;
    }
    if (res.status() === 200 && /\.ttf(\?.*)?$/i.test(u)) {
      ttf200Urls.add(u);
    }
  });

  const targetUrl = `http://127.0.0.1:${srv.port}${basePath === '/' ? '/' : '/scc/'}`;
  await page.goto(targetUrl, { waitUntil: 'networkidle' });

  // Trigger explicit font loads for complete FontFaceSet coverage
  await page.evaluate(async () => {
    await Promise.all([
      document.fonts.load('16px Orbitron'),
      document.fonts.load('700 16px Rajdhani'),
      document.fonts.load('600 16px Rajdhani'),
    ]);
    await document.fonts.ready;
  });

  const checkOrbitron = await page.evaluate(() => document.fonts.check('16px Orbitron'));
  const checkRajdhani700 = await page.evaluate(() => document.fonts.check('700 16px Rajdhani'));
  const checkRajdhani600 = await page.evaluate(() => document.fonts.check('600 16px Rajdhani'));

  await page.close();
  await srv.close();

  // Verify all 3 required TTF files were delivered
  const ttfFilesReceived = REQUIRED_TTF_BASENAMES.filter(b =>
    Array.from(ttf200Urls).some(u => u.includes(b))
  );

  const metrics = {
    basePath,
    unresolvedTtfCount: buildResult.unresolvedTtfCount,
    ttf200Count: ttfFilesReceived.length,
    font404Count,
    requestFailedCount: requestFailed.length,
    pageErrorCount: pageErrors.length,
    checkOrbitron,
    checkRajdhani700,
    checkRajdhani600,
    ttfResponses: Array.from(ttf200Urls),
    requestFailed,
    pageErrors,
  };

  console.log(`Metrics for ${basePath}:`, JSON.stringify(metrics, null, 2));

  return metrics;
}

(async () => {
  let browser;
  try {
    browser = await chromium.launch({ headless: true });

    const rootMetrics = await verifyBase(browser, '/');
    const sccMetrics = await verifyBase(browser, '/scc/');

    await browser.close();

    const failures = [];

    for (const m of [rootMetrics, sccMetrics]) {
      const b = m.basePath;
      if (m.unresolvedTtfCount !== 0) {
        failures.push(`${b}: expected 0 unresolved TTF warnings, got ${m.unresolvedTtfCount}`);
      }
      if (m.ttf200Count !== 3) {
        failures.push(`${b}: expected 3 TTF HTTP 200 responses, got ${m.ttf200Count}`);
      }
      if (m.font404Count !== 0) {
        failures.push(`${b}: expected 0 font 404 responses, got ${m.font404Count}`);
      }
      if (m.requestFailedCount !== 0) {
        failures.push(`${b}: expected 0 failed requests, got ${m.requestFailedCount} (${m.requestFailed.join(', ')})`);
      }
      if (m.pageErrorCount !== 0) {
        failures.push(`${b}: expected 0 page errors, got ${m.pageErrorCount} (${m.pageErrors.join(', ')})`);
      }
      if (!m.checkOrbitron) {
        failures.push(`${b}: document.fonts.check('16px Orbitron') returned false`);
      }
      if (!m.checkRajdhani700) {
        failures.push(`${b}: document.fonts.check('700 16px Rajdhani') returned false`);
      }
      if (!m.checkRajdhani600) {
        failures.push(`${b}: document.fonts.check('600 16px Rajdhani') returned false`);
      }
    }

    console.log('\n================ VERIFICATION SUMMARY ================');
    console.log(`Root Base (/) Metrics:
  Unresolved TTF warnings: ${rootMetrics.unresolvedTtfCount}
  TTF 200 responses:       ${rootMetrics.ttf200Count}/3
  Font 404 count:          ${rootMetrics.font404Count}
  Request failed count:    ${rootMetrics.requestFailedCount}
  Page error count:        ${rootMetrics.pageErrorCount}
  fonts.check Orbitron:    ${rootMetrics.checkOrbitron}
  fonts.check Rajdhani 700:${rootMetrics.checkRajdhani700}
  fonts.check Rajdhani 600:${rootMetrics.checkRajdhani600}`);

    console.log(`\nSCC Base (/scc/) Metrics:
  Unresolved TTF warnings: ${sccMetrics.unresolvedTtfCount}
  TTF 200 responses:       ${sccMetrics.ttf200Count}/3
  Font 404 count:          ${sccMetrics.font404Count}
  Request failed count:    ${sccMetrics.requestFailedCount}
  Page error count:        ${sccMetrics.pageErrorCount}
  fonts.check Orbitron:    ${sccMetrics.checkOrbitron}
  fonts.check Rajdhani 700:${sccMetrics.checkRajdhani700}
  fonts.check Rajdhani 600:${sccMetrics.checkRajdhani600}`);

    if (failures.length > 0) {
      console.error('\nVERIFICATION FAILED:');
      for (const f of failures) console.error(`  - ${f}`);
      process.exit(1);
    }

    console.log('\nALL CHECKS PASSED: Dual-base font resolution and loading verified.');
    process.exit(0);
  } catch (err) {
    if (browser) await browser.close();
    console.error('Fatal error during verification:', err);
    process.exit(1);
  }
})();
