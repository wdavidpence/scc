// crop regions from a PNG + report texture variance per region
const fs = require('fs');
const zlib = require('zlib');
const path = require('path');

function readPNG(p) {
  const d = fs.readFileSync(p);
  let pos = 8, idat = [], W = 0, H = 0, ct = 6;
  while (pos < d.length) {
    const ln = d.readUInt32BE(pos);
    const typ = d.toString('latin1', pos + 4, pos + 8);
    const data = d.slice(pos + 8, pos + 8 + ln);
    pos += 12 + ln;
    if (typ === 'IHDR') { W = data.readUInt32BE(0); H = data.readUInt32BE(4); ct = data[9]; }
    else if (typ === 'IDAT') idat.push(data);
    else if (typ === 'IEND') break;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const bpp = ct === 2 ? 3 : 4;
  const out = Buffer.alloc(W * H * bpp);
  let prev = Buffer.alloc(W * bpp), i = 0;
  for (let y = 0; y < H; y++) {
    const f = raw[i++];
    const line = Buffer.from(raw.slice(i, i + W * bpp)); i += W * bpp;
    for (let x = 0; x < W * bpp; x++) {
      const a = x >= bpp ? line[x - bpp] : 0, b = prev[x], c = x >= bpp ? prev[x - bpp] : 0;
      if (f === 1) line[x] = (line[x] + a) & 255;
      else if (f === 2) line[x] = (line[x] + b) & 255;
      else if (f === 3) line[x] = (line[x] + (a + b) >> 1) & 255;
      else if (f === 4) { const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c); line[x] = (line[x] + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 255; }
    }
    line.copy(out, y * W * bpp); prev = line;
  }
  return { W, H, bpp, buf: out };
}

const file = process.argv[2];
const img = readPNG(file);
const name = path.basename(file, '.png');
function stats(tag, x0, y0, x1, y1) {
  let s = 0, s2 = 0, n = 0;
  const hues = new Map();
  for (let y = y0; y < y1; y += 2) for (let x = x0; x < x1; x += 2) {
    const i = (y * img.W + x) * img.bpp;
    const l = 0.299 * img.buf[i] + 0.587 * img.buf[i + 1] + 0.114 * img.buf[i + 2];
    s += l; s2 += l * l; n++;
    const key = (img.buf[i] >> 4) + ',' + (img.buf[i + 1] >> 4) + ',' + (img.buf[i + 2] >> 4);
    hues.set(key, (hues.get(key) || 0) + 1);
  }
  const avg = s / n, varr = s2 / n - avg * avg;
  console.log(name, tag, 'avg=' + avg.toFixed(1), 'var=' + varr.toFixed(0), 'uniq=' + hues.size, 'top=' + [...hues.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(e => e[0]).join('|'));
}
const { W, H } = img;
stats('mid-band', 0, Math.round(H * 0.40), W, Math.round(H * 0.55));
stats('right-edge', Math.round(W * 0.82), Math.round(H * 0.30), W, Math.round(H * 0.75));
stats('center', Math.round(W * 0.35), Math.round(H * 0.35), Math.round(W * 0.65), Math.round(H * 0.65));
stats('full', 0, 0, W, H);
