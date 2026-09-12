// crop a region of a PNG to a new PNG
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

function writePNG(p, W, H, bpp, buf) {
  const raw = Buffer.alloc(H * (1 + W * bpp));
  for (let y = 0; y < H; y++) {
    raw[y * (1 + W * bpp)] = 0;
    buf.copy(raw, y * (1 + W * bpp) + 1, y * W * bpp, (y + 1) * W * bpp);
  }
  const chunks = [];
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = bpp === 3 ? 2 : 6;
  const crcTable = [];
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crcTable[n] = c >>> 0; }
  const crc = (b) => { let c = 0xffffffff; for (const x of b) c = crcTable[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type, 'ascii'), data]); const cc = Buffer.alloc(4); cc.writeUInt32BE(crc(td)); return Buffer.concat([len, td, cc]); };
  chunks.push(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  chunks.push(chunk('IHDR', ihdr));
  chunks.push(chunk('IDAT', zlib.deflateSync(raw)));
  chunks.push(chunk('IEND', Buffer.alloc(0)));
  fs.writeFileSync(p, Buffer.concat(chunks));
}

const [, , file, x0s, y0s, x1s, y1s, out] = process.argv;
const img = readPNG(file);
const x0 = parseInt(x0s), y0 = parseInt(y0s), x1 = parseInt(x1s), y1 = parseInt(y1s);
const W = x1 - x0, H = y1 - y0;
const buf = Buffer.alloc(W * H * img.bpp);
for (let y = 0; y < H; y++) img.buf.copy(buf, y * W * img.bpp, ((y0 + y) * img.W + x0) * img.bpp, ((y0 + y) * img.W + x1) * img.bpp);
writePNG(out || 'crop.png', W, H, img.bpp, buf);
console.log('wrote', out || 'crop.png', W + 'x' + H);
