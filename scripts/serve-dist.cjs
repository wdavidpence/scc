// Static server for QA gates: serves ./dist under /scc/ (and /) on :4177.
// Usage: node scripts/serve-dist.cjs [--port 4177]   (foreground)
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const DIST = path.join(__dirname, '..', 'dist');
const port = Number(process.env.QA_PORT || (process.argv.includes('--port') ? process.argv[process.argv.indexOf('--port') + 1] : 4177));
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json', '.wasm': 'application/wasm', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.ttf': 'font/ttf', '.woff2': 'font/woff2' };
http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p.startsWith('/scc')) p = p.slice(4);
  if (p === '' || p === '/') p = '/index.html';
  const file = path.join(DIST, path.normalize(p));
  if (!file.startsWith(DIST)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (e, buf) => {
    if (e) { res.writeHead(404); return res.end('404'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(buf);
  });
}).listen(port, '127.0.0.1', () => console.log(`QA server on http://127.0.0.1:${port}/scc/ root=${DIST}`));
