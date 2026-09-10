// Procedural pixel-art textures for SCC2. All top-down, team-tinted.
import Phaser from 'phaser';

const T = 32; // tile size

function makeTex(scene, key, w, h, draw) {
  if (scene.textures.exists(key)) return;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  draw(ctx, w, h);
  scene.textures.addCanvas(key, c);
}

function px(ctx, x, y, w, h, col) { ctx.fillStyle = col; ctx.fillRect(x, y, w, h); }

// ---- hand-finish pass: outline + rim light + energy accents on unit sprites ----
function hex2rgb(h) { return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]; }
function mix(c1, c2, t) {
  const a = typeof c1 === 'string' ? hex2rgb(c1) : c1, b = typeof c2 === 'string' ? hex2rgb(c2) : c2;
  return `rgb(${Math.round(a[0] + (b[0] - a[0]) * t)},${Math.round(a[1] + (b[1] - a[1]) * t)},${Math.round(a[2] + (b[2] - a[2]) * t)})`;
}
function darker(c, t = 0.35) { return mix(c, '#000000', t); }
function lighter(c, t = 0.45) { return mix(c, '#ffffff', t); }

// Post-process a sprite into a pseudo-3D render: auto-crop + re-center,
// hard silhouette outline, top-lit volume gradient (bright crown -> deep
// bottom AO), NW rim light, SE shade, specular crown, race-energy accent.
function finishSprite(canvas, race, teamCol) {
  const ctx = canvas.getContext('2d');
  const S = canvas.width;
  const F = 32;
  const src = ctx.getImageData(0, 0, S, S);
  const oc = document.createElement('canvas'); oc.width = F; oc.height = F;
  const octx = oc.getContext('2d');
  // ---- auto-crop bbox ----
  let x0 = S, y0 = S, x1 = -1, y1 = -1;
  const sd = src.data;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) if (sd[(y * S + x) * 4 + 3] > 10) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 < 0) return oc;
  const cw = x1 - x0 + 1, ch = y1 - y0 + 1;
  const scale = Math.min(((F - 4) / cw), ((F - 4) / ch), 1.5);
  const dw = Math.round(cw * scale), dh = Math.round(ch * scale);
  const ox = Math.round((F - dw) / 2), oy = Math.round((F - dh) / 2);
  octx.imageSmoothingEnabled = false;
  // ---- outline: 4 offset silhouettes in near-black ----
  const sil = document.createElement('canvas'); sil.width = dw; sil.height = dh;
  const sctx = sil.getContext('2d');
  sctx.imageSmoothingEnabled = false;
  sctx.drawImage(canvas, x0, y0, cw, ch, 0, 0, dw, dh);
  sctx.globalCompositeOperation = 'source-in';
  sctx.fillStyle = 'rgba(8,8,12,1)';
  sctx.fillRect(0, 0, dw, dh);
  const OFF = Math.max(1, Math.round(scale));
  for (const [dx, dy] of [[-OFF, 0], [OFF, 0], [0, -OFF], [0, OFF]]) octx.drawImage(sil, ox + dx, oy + dy);
  // ---- body ----
  octx.drawImage(canvas, x0, y0, cw, ch, ox, oy, dw, dh);
  // ---- top-lit volume pass: bright crown down to deep bottom AO ----
  const vol = document.createElement('canvas'); vol.width = F; vol.height = F;
  const vctx = vol.getContext('2d');
  vctx.drawImage(oc, 0, 0);
  vctx.globalCompositeOperation = 'source-atop';
  const vg = vctx.createLinearGradient(0, oy, 0, oy + dh);
  vg.addColorStop(0, 'rgba(255,250,230,0.16)');   // sunlit top
  vg.addColorStop(0.42, 'rgba(255,255,255,0.03)');
  vg.addColorStop(0.78, 'rgba(4,6,12,0.22)');      // terminator
  vg.addColorStop(1, 'rgba(2,3,8,0.46)');           // bottom AO
  vctx.fillStyle = vg; vctx.fillRect(0, 0, F, F);
  // specular crown blob (offset NW of center) — kept faint so faces/visors stay readable
  vctx.globalCompositeOperation = 'lighter';
  const sp = vctx.createRadialGradient(F / 2 - 3, oy + 3, 0, F / 2 - 3, oy + 3, Math.max(3, dw * 0.32));
  sp.addColorStop(0, 'rgba(255,255,255,0.12)');
  sp.addColorStop(1, 'rgba(255,255,255,0)');
  vctx.fillStyle = sp; vctx.fillRect(0, 0, F, F);
  octx.drawImage(vol, 0, 0);
  // ---- rim/shade from the rendered body alpha ----
  const bd = octx.getImageData(ox, oy, dw, dh).data;
  const at = (x, y) => (x < 0 || y < 0 || x >= dw || y >= dh) ? 0 : bd[(y * dw + x) * 4 + 3];
  const rim = document.createElement('canvas'); rim.width = F; rim.height = F;
  const rctx = rim.getContext('2d');
  const shade = document.createElement('canvas'); shade.width = F; shade.height = F;
  const shctx = shade.getContext('2d');
  const rimCol = teamCol;
  const accentCol = race === 'skarn' ? '#c9ff5a' : race === 'auraxis' ? '#7ad7ff' : '#ffd23f';
  const img = octx.getImageData(0, 0, F, F);
  const d = img.data;
  const rimD = rctx.createImageData(F, F).data;
  const shD = shctx.createImageData(F, F).data;
  for (let y = 0; y < F; y++) for (let x = 0; x < F; x++) {
    const i = (y * F + x) * 4;
    if (d[i + 3] < 10) continue;
    // NW edge => rim; SE edge => shade
    if (!at(x - ox - 1, y - oy - 1) || !at(x - ox, y - oy - 1)) {
      rimD[i] = 255; rimD[i + 1] = 255; rimD[i + 2] = 255; rimD[i + 3] = 190;
    }
    if (!at(x - ox + 1, y - oy + 1) || !at(x - ox, y - oy + 1)) {
      shD[i] = 0; shD[i + 1] = 0; shD[i + 2] = 0; shD[i + 3] = 140;
    }
  }
  rctx.putImageData(new ImageData(rimD, F, F), 0, 0);
  shctx.putImageData(new ImageData(shD, F, F), 0, 0);
  octx.drawImage(shade, 0, 0);
  // rim tinted with team color over white base
  const tint = document.createElement('canvas'); tint.width = F; tint.height = F;
  const tctx = tint.getContext('2d');
  tctx.drawImage(rim, 0, 0);
  tctx.globalCompositeOperation = 'source-atop';
  tctx.fillStyle = rimCol; tctx.globalAlpha = 0.55; tctx.fillRect(0, 0, F, F);
  octx.globalAlpha = 0.9; octx.drawImage(tint, 0, 0); octx.globalAlpha = 1;
  // ---- race energy accent: glowing notch on the spine ----
  octx.globalCompositeOperation = 'lighter';
  octx.fillStyle = accentCol;
  octx.fillRect(Math.round(F / 2 - 1), oy + 1, 2, 2);
  octx.globalAlpha = 0.5;
  octx.fillRect(Math.round(F / 2 - 2), oy, 4, 4);
  octx.globalAlpha = 1;
  octx.globalCompositeOperation = 'source-over';
  return oc;
}

// ---- terran exo-skeleton humanoid rig ----------------------------------------
// Draws a chunky power-exo frame with a GLASS dome helmet; a real human
// face (skin, eyes, brow, mouth-shadow) is visible THROUGH the visor.
// (x,y) = top-left of a 20-wide humanoid cell; head is 8px wide at cx.
function exoHuman(ctx, col, opts = {}) {
  const cx = 10;
  const skin = opts.skin || '#c8875a';
  const skinShade = '#96613a';
  const glass = opts.glass || 'rgba(150,210,255,0.34)';
  const frame = opts.frame || '#39424e';
  const frameHi = opts.frameHi || '#5a6673';
  const heavy = opts.heavy || 0; // extra pauldron bulk

  // ---- legs (armored greaves) ----
  px(ctx, cx - 4, 15, 3, 4, frame); px(ctx, cx + 1, 15, 3, 4, frame);
  px(ctx, cx - 4, 15, 1, 4, frameHi); px(ctx, cx + 1, 15, 1, 4, frameHi);
  px(ctx, cx - 4, 18, 3, 2, '#222831'); px(ctx, cx + 1, 18, 3, 2, '#222831'); // boots

  // ---- torso: exo chest plate over undersuit ----
  px(ctx, cx - 4, 8, 8, 7, frame);            // undersuit
  px(ctx, cx - 5, 8, 10, 5, col);            // team-colored chest armor
  px(ctx, cx - 5, 8, 10, 1, lighter(col, 0.35)); // pauldron sheen
  px(ctx, cx - 3, 9, 6, 1, darker(col, 0.3));    // plate seam
  px(ctx, cx - 1, 10, 2, 2, '#ffd23f');          // chest pilot light
  if (heavy) { px(ctx, cx - 6, 7, 3, 4, frameHi); px(ctx, cx + 3, 7, 3, 4, frameHi); } // heavy shoulders

  // ---- arms (segmented exo pistons) ----
  px(ctx, cx - 7, 9, 2, 5, frameHi); px(ctx, cx + 5, 9, 2, 5, frameHi);
  px(ctx, cx - 7, 11, 2, 1, frame); px(ctx, cx + 5, 11, 2, 1, frame); // joint gap

  // ---- neck seal ----
  px(ctx, cx - 2, 6, 4, 2, '#2a3038');

  // ---- GLASS HELMET with human face inside ----
  // dome shell (metal ring)
  ctx.fillStyle = frame;
  ctx.beginPath(); ctx.arc(cx, 4.5, 4.6, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = frameHi;
  ctx.beginPath(); ctx.arc(cx, 4, 4.6, Math.PI * 1.15, Math.PI * 1.85); ctx.fill(); // crown highlight
  // ---- HUMAN FACE inside the helmet, glass tint layered OVER it ----
  const skinSat = opts.skin ? opts.skin : '#c8875a';
  ctx.save();
  ctx.beginPath(); ctx.arc(cx, 4.5, 3.2, 0, Math.PI * 2); ctx.clip();
  px(ctx, cx - 3, 2, 6, 6, skinSat);                       // skin
  px(ctx, cx - 3, 5, 6, 3, skinShade);                    // jaw shadow
  px(ctx, cx - 2, 1.5, 4, 1.4, opts.hair || '#2b2118');  // hair/balaclava top
  px(ctx, cx - 2, 4, 1, 1, '#141821');                    // left eye
  px(ctx, cx + 1, 4, 1, 1, '#141821');                    // right eye
  px(ctx, cx - 2, 3.2, 1, 0.6, '#3a2b1e');               // brow L
  px(ctx, cx + 1, 3.2, 1, 0.6, '#3a2b1e');               // brow R
  px(ctx, cx - 0.5, 6, 1, 0.6, '#7a4a38');               // mouth
  // see-through canopy: light glass wash over the face
  ctx.fillStyle = glass; ctx.fillRect(cx - 4, 0.5, 8, 8.5);
  ctx.restore();
  // glass glare kept near the helmet rim so the face stays readable
  ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.lineWidth = 0.5;
  ctx.beginPath(); ctx.arc(cx, 4.5, 3.1, Math.PI * 1.1, Math.PI * 1.4); ctx.stroke();
}

function teamHex(team, colors) {
  const n = team === 0 ? colors[0] : team === 1 ? colors[1] : colors[2];
  return '#' + n.toString(16).padStart(6, '0');
}

export const TEAM_COLORS = [[0x4ea1ff, 0xff7b2e, 0xff4fa3], [0xff7b2e, 0xffd23f, 0x9b5de5], [0xb0b7c3, 0x8d99ae, 0x6c757d]];

export function createAllTextures(scene) {
  createTerrain(scene);
  createResources(scene);
  createBlight(scene);
  createUnitTextures(scene);
  createBuildingTextures(scene);
  createFx(scene);
  createCursor(scene);
}

function createTerrain(scene) {
  // 4 ground variants + cliff tile
  const bases = [
    { key: 'g0', c1: '#37523a', c2: '#415f45', speck: '#4d7054' },
    { key: 'g1', c1: '#3b5536', c2: '#476041', speck: '#557050' },
    { key: 'g2', c1: '#425233', c2: '#4d5f3d', speck: '#5d7049' },
    { key: 'g3', c1: '#354c3f', c2: '#40594c', speck: '#4e6a5b' }
  ];
  for (const b of bases) {
    makeTex(scene, b.key, T, T, (ctx) => {
      px(ctx, 0, 0, T, T, b.c1);
      for (let i = 0; i < 26; i++) {
        const x = (Math.random() * T) | 0, y = (Math.random() * T) | 0;
        px(ctx, x, y, 2 + ((Math.random() * 3) | 0), 1 + ((Math.random() * 2) | 0), Math.random() < 0.5 ? b.c2 : b.speck);
      }
      // subtle darker edge cracks
      for (let i = 0; i < 3; i++) {
        const x = (Math.random() * T) | 0;
        px(ctx, x, (Math.random() * T) | 0, 1, 4 + ((Math.random() * 5) | 0), 'rgba(0,0,0,0.25)');
      }
    });
  }
  makeTex(scene, 'rock', T, T, (ctx) => {
    px(ctx, 0, 0, T, T, '#12161a');
    // chunky rock
    ctx.fillStyle = '#3c4450'; ctx.beginPath(); ctx.moveTo(3, 26); ctx.lineTo(8, 8); ctx.lineTo(17, 4); ctx.lineTo(27, 12); ctx.lineTo(28, 24); ctx.lineTo(14, 29); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#556070'; ctx.beginPath(); ctx.moveTo(8, 8); ctx.lineTo(17, 4); ctx.lineTo(22, 10); ctx.lineTo(12, 14); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#20262e'; ctx.fillRect(0, 26, T, 6);
  });
  makeTex(scene, 'rock2', T, T, (ctx) => {
    px(ctx, 0, 0, T, T, '#12161a');
    ctx.fillStyle = '#47505e'; ctx.beginPath(); ctx.moveTo(4, 20); ctx.lineTo(10, 6); ctx.lineTo(24, 8); ctx.lineTo(26, 22); ctx.lineTo(16, 28); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#646f80'; ctx.beginPath(); ctx.moveTo(10, 6); ctx.lineTo(24, 8); ctx.lineTo(18, 14); ctx.closePath(); ctx.fill();
  });
}

function createResources(scene) {
  // mineral cluster 32x32, sparkling blue crystals
  makeTex(scene, 'minerals', T, T, (ctx) => {
    px(ctx, 0, 24, T, 8, 'rgba(0,0,0,0.3)');
    const crystal = (x, y, w, h, c1, c2) => {
      ctx.fillStyle = c1; ctx.beginPath(); ctx.moveTo(x + w / 2, y); ctx.lineTo(x + w, y + h * 0.7); ctx.lineTo(x + w * 0.7, y + h); ctx.lineTo(x + w * 0.25, y + h); ctx.lineTo(x, y + h * 0.65); ctx.closePath(); ctx.fill();
      ctx.fillStyle = c2; ctx.beginPath(); ctx.moveTo(x + w / 2, y); ctx.lineTo(x + w, y + h * 0.7); ctx.lineTo(x + w * 0.55, y + h * 0.6); ctx.closePath(); ctx.fill();
    };
    crystal(6, 6, 10, 18, '#3f78cf', '#7db4ff');
    crystal(15, 2, 9, 22, '#356bbd', '#69a6ff');
    crystal(22, 8, 8, 16, '#2f5ca3', '#5e97e8');
    crystal(2, 12, 7, 12, '#356bbd', '#69a6ff');
    px(ctx, 8, 10, 2, 3, '#cfe6ff'); px(ctx, 18, 6, 2, 4, '#cfe6ff'); px(ctx, 24, 12, 1, 3, '#bcd9ff');
  });
  // volcite geyser
  makeTex(scene, 'geyser', T, T, (ctx) => {
    px(ctx, 0, 0, T, T, '#1a2024');
    ctx.fillStyle = '#2e3840'; ctx.beginPath(); ctx.arc(16, 18, 11, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#3a4650'; ctx.beginPath(); ctx.arc(16, 16, 7, 0, Math.PI * 2); ctx.fill();
    px(ctx, 12, 12, 8, 8, '#4affc8');
    px(ctx, 14, 8, 4, 6, '#7dffd9');
    ctx.globalAlpha = 0.5; px(ctx, 13, 4, 6, 4, '#b8ffe9'); px(ctx, 15, 0, 3, 4, '#d8fff4'); ctx.globalAlpha = 1;
  });
}

function createBlight(scene) {
  makeTex(scene, 'blight', T, T, (ctx) => {
    px(ctx, 0, 0, T, T, '#5c3048');
    for (let i = 0; i < 30; i++) {
      px(ctx, (Math.random() * T) | 0, (Math.random() * T) | 0, 2, 2, Math.random() < 0.5 ? '#713b55' : '#472537');
    }
    ctx.fillStyle = '#8f4768';
    ctx.beginPath(); ctx.arc(8, 10, 3, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(22, 20, 2.5, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(15, 26, 2, 0, 7); ctx.fill();
  });
  makeTex(scene, 'blight-node', T, T, (ctx) => {
    px(ctx, 0, 0, T, T, '#452434');
    ctx.fillStyle = '#7a4060'; ctx.beginPath(); ctx.arc(16, 16, 6, 0, 7); ctx.fill();
    ctx.fillStyle = '#a85c84'; ctx.beginPath(); ctx.arc(16, 16, 3, 0, 7); ctx.fill();
  });
}

function createUnitTextures(scene) {
  // Each unit: 20x20 canvas top-down sprite per team tint.
  const defs = {
    rigger: (ctx, col) => {
      exoHuman(ctx, darker(col, 0.25), { frame: '#4b5563', frameHi: '#6b7684' }); // worker exo: lighter tooling frame
      px(ctx, 15, 7, 5, 2, '#d9c26a'); px(ctx, 19, 6, 2, 4, '#f0e0a0'); // welding torch arm
      px(ctx, 1, 7, 3, 3, '#5a6673'); px(ctx, 0, 8, 2, 2, '#8a95a3'); // mineral scoop
      px(ctx, 14, 12, 2, 2, '#6ee7a0'); // suit power cell lit
    },
    marine: (ctx, col) => {
      exoHuman(ctx, col, { heavy: 1 }); // standard marine exo
      px(ctx, 15, 9, 5, 2, '#2b323b'); px(ctx, 19, 9, 2, 1, '#141a22'); // rifle barrel
      px(ctx, 15, 8, 3, 2, '#3c434c');
      px(ctx, 8, 0, 4, 1, '#ffffff'); // helmet stripe
    },
    incinerator: (ctx, col) => {
      exoHuman(ctx, '#8a3b1e', { frame: '#5c2c19', frameHi: '#8a4a2a', glass: 'rgba(255,170,90,0.34)', heavy: 1 });
      px(ctx, 15, 8, 5, 3, '#ffb03c'); px(ctx, 20, 8, 3, 3, '#ffe27a'); // flamethrower nozzle
      px(ctx, 2, 7, 3, 6, '#3c434c'); px(ctx, 2, 6, 3, 1, '#ff7b2e'); // fuel tank valve on back edge
      px(ctx, 4, 1, 3, 2, '#ff9d3c'); // pilot lamp on helmet
    },
    tank: (ctx, col) => {
      px(ctx, 2, 5, 16, 12, '#5b6470'); px(ctx, 3, 6, 14, 4, col);
      px(ctx, 14, 9, 10, 3, '#3c434c'); // barrel
      px(ctx, 2, 5, 16, 2, '#727c8a'); px(ctx, 2, 15, 16, 2, '#727c8a'); // tread edges
      px(ctx, 8, 10, 4, 4, '#8b95a3');
    },
    duster: (ctx, col) => {
      px(ctx, 3, 7, 14, 8, col); px(ctx, 13, 5, 6, 4, '#3c434c'); // gun pod
      px(ctx, 4, 15, 3, 3, '#1e2229'); px(ctx, 12, 15, 3, 3, '#1e2229'); // wheels
      px(ctx, 5, 8, 8, 3, '#ffd9a0');
      px(ctx, 17, 6, 4, 2, '#ff7b2e');
    },
    ballista: (ctx, col) => {
      // bipedal walker: coroutine hull, cluster rocket pods with lit tips, chaingun
      px(ctx, 4, 5, 12, 10, '#3d4653'); px(ctx, 5, 6, 10, 3, '#525d6c'); // hull + highlight
      px(ctx, 6, 8, 8, 3, col); // team chest band
      px(ctx, 2, 2, 4, 8, '#39424e'); px(ctx, 14, 2, 4, 8, '#39424e'); // rocket pods
      px(ctx, 2, 2, 4, 1, '#556070'); px(ctx, 14, 2, 4, 1, '#556070'); // pod caps
      px(ctx, 3, 4, 2, 1, '#ff5a5a'); px(ctx, 15, 4, 2, 1, '#ff5a5a'); // rocket lights
      px(ctx, 3, 6, 2, 1, '#ff8a5a'); px(ctx, 15, 6, 2, 1, '#ff8a5a');
      px(ctx, 15, 10, 6, 3, '#2c333d'); px(ctx, 20, 11, 2, 1, '#141a22'); // chaingun barrel
      px(ctx, 6, 15, 3, 4, '#313842'); px(ctx, 11, 15, 3, 4, '#313842'); // hydraulic legs
      px(ctx, 6, 18, 3, 1, '#525d6c'); px(ctx, 11, 18, 3, 1, '#525d6c'); // feet
    },
    wraith: (ctx, col) => {
      ctx.fillStyle = '#414b58'; ctx.beginPath(); ctx.moveTo(10, 2); ctx.lineTo(18, 8); ctx.lineTo(20, 16); ctx.lineTo(2, 16); ctx.lineTo(4, 8); ctx.closePath(); ctx.fill();
      px(ctx, 7, 5, 6, 4, col); px(ctx, 1, 12, 4, 2, '#2c333d'); px(ctx, 15, 12, 4, 2, '#2c333d');
      px(ctx, 9, 16, 2, 3, '#ff9c3c'); // thruster
      px(ctx, 8, 10, 4, 2, '#8fd0ff');
    },
    dropship: (ctx, col) => {
      ctx.fillStyle = '#525c6a'; ctx.beginPath(); ctx.moveTo(3, 8); ctx.lineTo(17, 8); ctx.lineTo(20, 13); ctx.lineTo(0, 13); ctx.closePath(); ctx.fill();
      px(ctx, 6, 5, 8, 4, '#67727f'); px(ctx, 7, 6, 6, 2, col); // canopy
      px(ctx, 2, 13, 5, 2, '#39424e'); px(ctx, 13, 13, 5, 2, '#39424e'); // landing skids
      px(ctx, 8, 10, 4, 3, col); // side ramp light
      px(ctx, 17, 6, 3, 2, '#8fd0ff');
    },
    medic: (ctx, col) => {
      exoHuman(ctx, '#d8dde6', { frame: '#a8b0bd', frameHi: '#e8edf4', glass: 'rgba(140,255,200,0.32)' }); // white medical exo
      px(ctx, 8, 9, 4, 1, '#ff5a5a'); px(ctx, 9, 8, 2, 3, '#ff5a5a'); // red cross
      px(ctx, 15, 6, 4, 2, '#6ee7a0'); px(ctx, 18, 5, 2, 2, '#b0ffd9'); // med-injector
    },
    battlecruiser: (ctx, col) => {
      // NGV battleship: layered grey hull, forward battery, team-lit spine, burning engines
      ctx.fillStyle = '#39424e'; ctx.beginPath(); ctx.moveTo(4, 4); ctx.lineTo(16, 2); ctx.lineTo(18, 10); ctx.lineTo(14, 16); ctx.lineTo(2, 12); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#4b5563'; ctx.beginPath(); ctx.moveTo(5, 5); ctx.lineTo(15, 3.5); ctx.lineTo(16.5, 9.5); ctx.lineTo(13, 14); ctx.lineTo(3.5, 11); ctx.closePath(); ctx.fill();
      px(ctx, 7, 5, 6, 2, '#6b7684'); // deck highlight
      px(ctx, 6, 8, 5, 2, col); px(ctx, 12, 6, 2, 6, col); // team spine + bridge
      px(ctx, 15, 3, 3, 1, '#2c333d'); px(ctx, 15, 7, 3, 1, '#2c333d'); px(ctx, 15, 11, 3, 1, '#2c333d'); // starboard batteries
      px(ctx, 2, 12, 3, 2, '#7a8794'); px(ctx, 4, 14, 2, 2, '#3d444d');
      px(ctx, 1, 8, 2, 2, '#ffb03c'); px(ctx, 0, 10, 1, 2, '#ff7b2e'); // engine flare
      px(ctx, 9, 6, 1, 1, '#ffd23f'); // hull beacon
    },
    ghost: (ctx, col) => {
      exoHuman(ctx, '#3d4450', { frame: '#2a3038', frameHi: '#4a5260', glass: 'rgba(180,140,255,0.30)', hair: '#1a1424' }); // psi-black ops exo
      px(ctx, 15, 9, 6, 2, '#20252c'); px(ctx, 20, 9, 2, 1, '#0c1016'); // sniper barrel
      px(ctx, 8, 0, 4, 1, '#b060ff'); // psi antenna glow
      px(ctx, 7, 12, 1, 1, '#c9a0ff'); px(ctx, 12, 12, 1, 1, '#c9a0ff'); // psi nodes
    },
    skarling: (ctx, col) => {
      ctx.fillStyle = '#7a4520'; ctx.beginPath(); ctx.arc(10, 11, 6, 0, 7); ctx.fill();
      px(ctx, 7, 5, 6, 3, col); // carapace top
      px(ctx, 2, 8, 3, 2, '#5e3517'); px(ctx, 15, 8, 3, 2, '#5e3517'); // side legs
      px(ctx, 4, 14, 2, 3, '#5e3517'); px(ctx, 14, 14, 2, 3, '#5e3517');
      px(ctx, 8, 3, 4, 2, '#f0b060');
    },
    skarnling: (ctx, col) => {
      ctx.fillStyle = '#8f4a1e'; ctx.beginPath(); ctx.arc(10, 12, 5, 0, 7); ctx.fill();
      ctx.fillStyle = '#c96a24'; ctx.beginPath(); ctx.arc(10, 6, 4, 0, 7); ctx.fill(); // head
      px(ctx, 5, 3, 2, 3, '#ffe9c2'); px(ctx, 13, 3, 2, 3, '#ffe9c2'); // claws
      px(ctx, 8, 5, 4, 2, col); // back spine tint
      px(ctx, 3, 12, 2, 2, '#6b3513'); px(ctx, 15, 12, 2, 2, '#6b3513');
    },
    razor: (ctx, col) => {
      ctx.fillStyle = '#3c6b40'; ctx.beginPath(); ctx.arc(9, 12, 5, 0, 7); ctx.fill();
      ctx.fillStyle = '#5d8f52'; ctx.beginPath(); ctx.arc(10, 6, 3.5, 0, 7); ctx.fill(); // head
      px(ctx, 14, 5, 6, 2, '#8bbf7a'); // spined ridge
      px(ctx, 13, 7, 4, 1, col);
      px(ctx, 4, 14, 2, 3, '#2f5233'); px(ctx, 12, 14, 2, 3, '#2f5233');
    },
    vex: (ctx, col) => {
      ctx.fillStyle = '#4a3b6e'; ctx.beginPath(); ctx.moveTo(10, 2); ctx.lineTo(16, 8); ctx.lineTo(13, 15); ctx.lineTo(5, 13); ctx.lineTo(2, 7); ctx.closePath(); ctx.fill();
      px(ctx, 6, 5, 6, 3, col);
      ctx.fillStyle = '#6b55a0'; ctx.fillRect(0, 9, 6, 2); ctx.fillRect(14, 9, 6, 2); // wings
      px(ctx, 8, 13, 3, 3, '#37284f');
    },
    tremor: (ctx, col) => {
      // hulking champion: armored carapace ridges, massive glow-tipped tusks, spiked forelegs
      ctx.fillStyle = '#5c2c19'; ctx.beginPath(); ctx.arc(10, 11, 8, 0, 7); ctx.fill(); // shadow body
      ctx.fillStyle = '#7a3a22'; ctx.beginPath(); ctx.arc(10, 10, 7, 0, 7); ctx.fill();
      ctx.fillStyle = '#a05030'; ctx.beginPath(); ctx.arc(10, 6, 5, 0, 7); ctx.fill(); // head mass
      px(ctx, 6, 3, 8, 2, '#8a4526'); // carapace ridge
      px(ctx, 2, 1, 4, 5, '#ffe9c2'); px(ctx, 14, 1, 4, 5, '#ffe9c2'); // giant tusks
      px(ctx, 2, 1, 1, 2, col); px(ctx, 17, 1, 1, 2, col); // takedown glow tips
      px(ctx, 7, 7, 6, 3, col); // chest team plate
      px(ctx, 8, 8, 1, 1, '#ffd23f'); px(ctx, 11, 8, 1, 1, '#ffd23f'); // eye cluster
      px(ctx, 0, 12, 3, 4, '#572917'); px(ctx, 17, 12, 3, 4, '#572917'); // spiked forelegs
      px(ctx, 1, 11, 1, 1, '#ffe9c2'); px(ctx, 18, 11, 1, 1, '#ffe9c2'); // claw points
      px(ctx, 4, 16, 3, 3, '#472214'); px(ctx, 13, 16, 3, 3, '#472214'); // rear legs
    },
    skywarden: (ctx, col) => {
      ctx.fillStyle = '#7a5030'; ctx.beginPath(); ctx.arc(10, 9, 7, 0, 7); ctx.fill();
      ctx.fillStyle = '#5e3b20'; ctx.beginPath(); ctx.arc(10, 12, 4, 0, 7); ctx.fill(); // lower pouch
      px(ctx, 6, 6, 8, 3, col);
      ctx.globalAlpha = 0.6; ctx.fillStyle = '#c98d55';
      ctx.beginPath(); ctx.arc(3, 12, 3, 0, 7); ctx.fill(); ctx.beginPath(); ctx.arc(17, 12, 3, 0, 7); ctx.fill();
      ctx.globalAlpha = 1;
    },
    airstinger: (ctx, col) => {
      ctx.fillStyle = '#556b2f'; ctx.beginPath(); ctx.arc(10, 10, 4.5, 0, 7); ctx.fill();
      px(ctx, 6, 2, 2, 5, '#88aa44'); px(ctx, 12, 2, 2, 5, '#88aa44');
      px(ctx, 8, 14, 4, 3, col);
    },
    burrower: (ctx, col) => {
      ctx.fillStyle = '#6b4a2a'; ctx.beginPath(); ctx.ellipse(10, 12, 7, 5, 0, 0, 7); ctx.fill();
      px(ctx, 8, 4, 4, 8, '#8a6238');
      px(ctx, 7, 2, 6, 2, '#d9c290'); // spikes
      px(ctx, 8, 7, 4, 2, col);
    },
    artificer: (ctx, col) => {
      ctx.fillStyle = '#5a5f7a'; ctx.beginPath(); ctx.arc(10, 10, 5, 0, 7); ctx.fill();
      px(ctx, 8, 3, 4, 4, col);
      ctx.fillStyle = '#7d84a8'; ctx.fillRect(2, 9, 3, 2); ctx.fillRect(15, 9, 3, 2);
      ctx.globalAlpha = 0.7; px(ctx, 8, 15, 4, 3, '#9fb0ff'); ctx.globalAlpha = 1; // hover glow
    },
    bladeguard: (ctx, col) => {
      px(ctx, 6, 4, 8, 12, '#7d6bc4');
      px(ctx, 7, 5, 6, 3, col); // face guard
      ctx.fillStyle = '#9f8fe0'; ctx.fillRect(1, 7, 3, 2); ctx.fillRect(16, 7, 3, 2); // arm blades mount
      px(ctx, 0, 6, 2, 6, '#cfe0ff'); px(ctx, 18, 6, 2, 6, '#cfe0ff'); // vibro blades glow
      px(ctx, 7, 16, 2, 3, '#4b3f7e'); px(ctx, 11, 16, 2, 3, '#4b3f7e');
    },
    sentinel: (ctx, col) => {
      px(ctx, 4, 8, 12, 8, '#4b5563'); px(ctx, 5, 9, 10, 3, col);
      px(ctx, 14, 8, 6, 3, '#333a45'); // blaster
      ctx.fillStyle = '#6b7686'; ctx.fillRect(2, 14, 4, 3); ctx.fillRect(14, 14, 4, 3); // legs
      px(ctx, 7, 5, 6, 4, '#8b95a3'); px(ctx, 8, 6, 4, 2, '#aef');
    },
    caller: (ctx, col) => {
      px(ctx, 6, 4, 8, 12, '#e8e4d8'); px(ctx, 7, 5, 6, 3, col);
      px(ctx, 3, 8, 2, 5, '#cfc9b8'); px(ctx, 15, 8, 2, 5, '#cfc9b8');
      px(ctx, 8, 2, 4, 2, '#b0a888'); // headpiece
    },
    nblade: (ctx, col) => {
      px(ctx, 6, 4, 8, 12, '#2c2440'); px(ctx, 7, 5, 6, 3, col);
      px(ctx, 3, 7, 2, 6, '#1e1830'); px(ctx, 15, 7, 2, 6, '#1e1830');
      px(ctx, 16, 6, 5, 2, '#b060ff'); // warp blade
    },
    radiant: (ctx, col) => {
      ctx.fillStyle = '#8fb4ff'; ctx.globalAlpha = 0.85;
      ctx.beginPath(); ctx.arc(10, 10, 7, 0, 7); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#cfe0ff'; ctx.beginPath(); ctx.arc(10, 10, 4, 0, 7); ctx.fill();
      px(ctx, 6, 8, 8, 2, col);
      px(ctx, 8, 2, 4, 3, '#ffffff');
    },
    ark: (ctx, col) => {
      // auraxis ark: cathedral-ship silhouette, interceptor bay glow, thruster corona
      ctx.fillStyle = '#55657a'; ctx.beginPath(); ctx.moveTo(2, 6); ctx.lineTo(18, 3); ctx.lineTo(20, 12); ctx.lineTo(4, 16); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#6f7f95'; ctx.beginPath(); ctx.moveTo(3, 6.5); ctx.lineTo(17, 4); ctx.lineTo(18.5, 11); ctx.lineTo(5, 15); ctx.closePath(); ctx.fill();
      px(ctx, 4, 7, 12, 3, col); // team-lit superstructure
      px(ctx, 5, 4, 4, 3, '#7d8fa8'); px(ctx, 6, 5, 2, 1, '#cfe0ff'); // bridge tower
      px(ctx, 6, 12, 8, 2, '#2a3648'); // dark interceptor bay
      px(ctx, 7, 12, 1, 2, '#9fc8ff'); px(ctx, 10, 12, 1, 2, '#9fc8ff'); px(ctx, 13, 12, 1, 2, '#9fc8ff'); // interceptor lights
      ctx.fillStyle = 'rgba(159,200,255,0.35)'; ctx.beginPath(); ctx.arc(17, 13, 3, 0, 7); ctx.fill(); // thruster corona
      px(ctx, 15, 2, 4, 2, '#8fa2bc');
    },
    voidlance: (ctx, col) => {
      // sleek auraxis hunter: swept wings, glowing void emitter
      ctx.fillStyle = '#5d6f8f'; ctx.beginPath(); ctx.moveTo(10, 2); ctx.lineTo(16, 10); ctx.lineTo(10, 18); ctx.lineTo(4, 10); ctx.closePath(); ctx.fill();
      px(ctx, 8, 7, 5, 6, col); // hull core
      px(ctx, 9, 9, 3, 2, '#bfe0ff'); // void lens
      px(ctx, 2, 9, 3, 2, '#7186a8'); px(ctx, 15, 9, 3, 2, '#7186a8'); // wing tips
      px(ctx, 10, 4, 1, 2, '#e6f2ff');
    },
    umbral: (ctx, col) => {
      // twin dark flame bodies merged at the base
      px(ctx, 5, 3, 4, 9, '#241a3a'); px(ctx, 11, 3, 4, 9, '#241a3a');
      px(ctx, 4, 12, 12, 5, '#1a1230'); // merged skirt
      px(ctx, 6, 5, 2, 3, col); px(ctx, 12, 5, 2, 3, col); // void eyes
      px(ctx, 5, 13, 10, 2, '#7a4fd0'); // convergence band
      px(ctx, 9, 15, 2, 2, '#c9a0ff');
      px(ctx, 6, 1, 2, 2, '#3a2a5a'); px(ctx, 12, 1, 2, 2, '#3a2a5a'); // flame tips
    },
    drone: (ctx, col) => {
      // terran recon drone: quadcopter with 4 spinning rotor arms, sensor ball
      ctx.strokeStyle = '#4b5563'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(4, 4); ctx.lineTo(16, 16); ctx.moveTo(16, 4); ctx.lineTo(4, 16); ctx.stroke(); // X arms
      for (const [rx, ry] of [[4, 4], [16, 4], [4, 16], [16, 16]]) {
        ctx.fillStyle = '#2b313a'; ctx.beginPath(); ctx.arc(rx, ry, 3.2, 0, 7); ctx.fill(); // motor
        ctx.strokeStyle = 'rgba(210,225,245,0.55)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(rx, ry, 3.6, 0, 7); ctx.stroke(); // rotor blur ring
        px(ctx, rx - 0.5, ry - 0.5, 1, 1, col); // nav light
      }
      px(ctx, 7, 7, 6, 6, '#5a6673'); px(ctx, 8, 8, 4, 3, '#7a8794'); // body hull
      ctx.fillStyle = 'rgba(140,220,255,0.8)'; ctx.beginPath(); ctx.arc(10, 12, 2.2, 0, 7); ctx.fill(); // glass sensor dome
      px(ctx, 9, 11, 1, 1, '#0e1620'); // sensor lens
      px(ctx, 8, 5, 4, 1, col); // team beacon bar
    },
    sporecaster: (ctx, col) => {
      // bloated spore-carrying flyer with long neck
      ctx.fillStyle = '#8a9a4a'; ctx.beginPath(); ctx.ellipse(10, 11, 7, 5, 0, 0, 7); ctx.fill();
      px(ctx, 3, 8, 14, 2, '#6b7a38'); // wing membrane
      px(ctx, 8, 4, 5, 4, '#9fae58'); // neck/head hump
      px(ctx, 9, 5, 2, 2, col); // eye
      px(ctx, 7, 13, 2, 3, '#4d5a28'); px(ctx, 11, 13, 2, 3, '#4d5a28'); // spore pods
      px(ctx, 6, 10, 1, 1, col);
    },
    corroder: (ctx, col) => {
      // caustic flyer: hunched body dripping corrosion sacs
      ctx.fillStyle = '#5f8a6a'; ctx.beginPath(); ctx.ellipse(10, 10, 6.5, 5.5, 0, 0, 7); ctx.fill();
      px(ctx, 4, 7, 12, 2, '#48684f');
      px(ctx, 9, 4, 3, 3, '#77a884'); // head
      px(ctx, 10, 5, 1, 1, col); // eye
      px(ctx, 5, 13, 2, 4, '#8fbf6a'); px(ctx, 9, 14, 2, 4, '#8fbf6a'); px(ctx, 13, 13, 2, 4, '#8fbf6a'); // acid droplets
      px(ctx, 6, 16, 1, 2, '#b0e08a'); px(ctx, 13, 16, 1, 2, '#b0e08a');
    }
  };

  const raceOf = { rigger: 'terran', marine: 'terran', incinerator: 'terran', tank: 'terran', duster: 'terran', ballista: 'terran', wraith: 'terran', battlecruiser: 'terran', ghost: 'terran', medic: 'terran', raven: 'terran', drone: 'terran',
    skarling: 'skarn', skarnling: 'skarn', skarnling: 'skarn', razor: 'skarn', razorspine: 'skarn', vex: 'skarn', vexwing: 'skarn', tremor: 'skarn', tremorclaw: 'skarn', skywarden: 'skarn', airstinger: 'skarn', burrower: 'skarn', queen: 'skarn', hatchling: 'skarn',
    artificer: 'auraxis', bladeguard: 'auraxis', sentinel: 'auraxis', caller: 'auraxis', stormcaller: 'auraxis', nblade: 'auraxis', nightblade: 'auraxis', radiant: 'auraxis', ark: 'auraxis', reaver: 'auraxis', shuttle: 'auraxis', voidlance: 'auraxis', umbral: 'auraxis',
    sporecaster: 'skarn', corroder: 'skarn' };
  const largeKinds = ['tank', 'battlecruiser', 'tremor', 'ark', 'ballista', 'skywarden', 'burrower', 'sentinel', 'reaver', 'battleship', 'battlecruiser'];
  for (const [kind, fn] of Object.entries(defs)) {
    for (let team = 0; team < 3; team++) {
      const col = team === 0 ? '#4ea1ff' : team === 1 ? '#ff7b2e' : '#ff4fa3';
      const raw = document.createElement('canvas'); raw.width = 20; raw.height = 20;
      fn(raw.getContext('2d'), col);
      const finished = finishSprite(raw, raceOf[kind] || 'terran', col);
      if (!scene.textures.exists(`u-${kind}-t${team}`)) scene.textures.addCanvas(`u-${kind}-t${team}`, finished);
      // AAA: walk-cycle frames — cut the FINISHED sprite halves and offset them (finishSprite re-centers raw, so cutting raw would cancel the shift)
      if (kind === 'rigger' || kind === 'skarling' || kind === 'artificer' || kind === 'skywarden' || kind === 'battlecruiser' || kind === 'ark' || kind === 'sporecaster' || kind === 'corroder' || kind === 'drone') continue; // wheeled/hovering/flying: no leg cycle
      const FH = finished.height;
      for (let fr = 0; fr < 3; fr++) {
        if (scene.textures.exists(`u-${kind}-t${team}-w${fr}`)) continue;
        const frC = document.createElement('canvas'); frC.width = FH; frC.height = FH;
        const fctx = frC.getContext('2d');
        fctx.imageSmoothingEnabled = false;
        const dx = fr === 1 ? 0 : (fr === 0 ? 1 : -1);
        const bob = fr === 2 ? -1 : 0;
        const mid = Math.round(FH * 0.62);
        fctx.drawImage(finished, 0, 0, FH, mid, 0, bob, FH, mid);
        fctx.drawImage(finished, 0, mid, FH, FH - mid, dx, mid, FH, FH - mid);
        scene.textures.addCanvas(`u-${kind}-t${team}-w${fr}`, frC);
      }
    }
  }
}

function createBuildingTextures(scene) {
  // key: b-{buildId}-t{team} at TILE multiples
  const drawPanel = (ctx, w, h, base, edge, roof, accent) => {
    ctx.fillStyle = edge; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = base; ctx.fillRect(2, 2, w - 4, h - 4);
    ctx.fillStyle = roof; ctx.fillRect(4, 4, w - 8, h - 8);
    ctx.fillStyle = accent; ctx.fillRect(6, 6, Math.max(4, (w - 12) * 0.4), 4);
    ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fillRect(0, h - 4, w, 4); // shadow
  };
  for (let team = 0; team < 3; team++) {
    const col = team === 0 ? '#4ea1ff' : team === 1 ? '#ff7b2e' : '#ff4fa3';
    const dark = team === 0 ? '#1d3a63' : team === 1 ? '#6e3512' : '#5b3f9e';

    // command center 5x4 tiles — extruded pseudo-3D command bunker
    makeTex(scene, 'b-commandCenter-t0', 5 * T, 4 * T, (ctx) => {
      const w = 5 * T, h = 4 * T;
      const sunlit = '#7d8ea3', mid = '#57626f', dark = '#2c333b', deeper = '#1a1f26';
      // ground apron + ambient occlusion rim
      px(ctx, 0, 0, w, h, 'rgba(0,0,0,0)');
      ctx.fillStyle = 'rgba(8,10,14,0.55)';
      ctx.beginPath(); ctx.ellipse(w / 2, h - 7, w / 2 - 4, 7, 0, 0, 7); ctx.fill();
      // landing apron (front, lighter concrete with hazard chevrons)
      px(ctx, 8, h - 18, w - 16, 14, '#49525c');
      px(ctx, 8, h - 18, w - 16, 2, '#5c6771');
      for (let i = 0; i < 5; i++) px(ctx, 12 + i * 12, h - 14, 8, 2, (i % 2 ? '#d9c26a' : '#20262d'));
      px(ctx, w / 2 - 5, h - 13, 3, 7, '#dfe6ee'); px(ctx, w / 2 + 2, h - 13, 3, 7, '#dfe6ee'); px(ctx, w / 2 - 2, h - 11, 4, 3, '#dfe6ee'); // pad H
      // main bunker block: front wall (mid), top deck (sunlit), SE side (dark)
      px(ctx, 10, 22, w - 20, h - 40, mid);                        // front wall
      ctx.fillStyle = dark; ctx.beginPath(); ctx.moveTo(w - 10, 22); ctx.lineTo(w - 4, 18); ctx.lineTo(w - 4, h - 22); ctx.lineTo(w - 10, h - 18); ctx.closePath(); ctx.fill(); // SE wall sliver
      px(ctx, 10, 18, w - 20, 5, sunlit);                          // deck lip
      px(ctx, 10, 22, w - 20, 2, darker(sunlit, 0.25));             // deck shadow line
      // armored buttresses on front wall
      for (let i = 0; i < 4; i++) px(ctx, 14 + i * 18, 24, 4, h - 44, darker(mid, 0.3));
      // glowing bay windows (team lit)
      for (let i = 0; i < 6; i++) px(ctx, 16 + i * 10, 30, 5, 3, col);
      px(ctx, 14, 36, w - 28, 2, darker(mid, 0.45));                // wall seam
      // central command tower stack (two tiers, sunlit crowns)
      px(ctx, w / 2 - 16, 10, 32, 14, mid);
      px(ctx, w / 2 - 16, 8, 32, 3, sunlit);
      ctx.fillStyle = dark; ctx.beginPath(); ctx.moveTo(w / 2 + 16, 10); ctx.lineTo(w / 2 + 20, 7); ctx.lineTo(w / 2 + 20, 21); ctx.lineTo(w / 2 + 16, 24); ctx.closePath(); ctx.fill();
      px(ctx, w / 2 - 12, 2, 24, 7, '#67727f');                     // upper bridge
      px(ctx, w / 2 - 12, 0, 24, 2, sunlit);                        // bridge crown
      // glass bridge band with pilot silhouettes implied by bright windows
      for (let i = 0; i < 5; i++) px(ctx, w / 2 - 10 + i * 4.4, 4, 3, 3, 'rgba(143,210,255,0.9)');
      // radar dome (sphere shading: bright NW -> dark SE)
      const dg = ctx.createRadialGradient(w / 2 - 3, h / 2 - 12, 1, w / 2, h / 2 - 9, 8);
      dg.addColorStop(0, '#c9d6e6'); dg.addColorStop(0.55, '#8593a5'); dg.addColorStop(1, '#39424e');
      ctx.fillStyle = dg; ctx.beginPath(); ctx.arc(w / 2, h / 2 - 9, 7.5, 0, 7); ctx.fill();
      ctx.strokeStyle = darker(col, 0.1); ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(w / 2, h / 2 - 9, 7.5, Math.PI * 0.9, Math.PI * 1.6); ctx.stroke();
      px(ctx, w / 2 - 1, h / 2 - 19, 2, 4, '#b8c6d8');             // antenna mast
      px(ctx, w / 2 - 2, h / 2 - 20, 4, 1, col);                    // beacon
      // exhaust stacks w/ warm inner glow
      px(ctx, 12, 14, 4, 8, dark); px(ctx, 12, 14, 4, 2, '#3a4450'); px(ctx, 13, 15, 2, 2, '#ff9c3c');
      px(ctx, w - 16, 14, 4, 8, dark); px(ctx, w - 16, 14, 4, 2, '#3a4450'); px(ctx, w - 15, 15, 2, 2, '#ff9c3c');
      // team stripe across the front + bottom AO
      px(ctx, 10, h - 22, w - 20, 2, col);
      ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fillRect(10, h - 20, w - 20, 2);
    });
    // broodNest 4x4
    makeTex(scene, 'b-broodNest-t1', 4 * T, 4 * T, (ctx) => {
      const w = 4 * T, h = 4 * T;
      ctx.fillStyle = '#5e3320'; ctx.beginPath(); ctx.arc(w / 2, h / 2 + 4, w / 2 - 2, 0, 7); ctx.fill();
      ctx.fillStyle = '#7c4527'; ctx.beginPath(); ctx.arc(w / 2, h / 2, w / 2 - 8, 0, 7); ctx.fill();
      ctx.fillStyle = '#a05c30'; ctx.beginPath(); ctx.arc(w / 2, h / 2 - 6, 14, 0, 7); ctx.fill();
      px(ctx, 4, h - 10, 10, 6, '#40222f'); // ramp
      ctx.fillStyle = col; ctx.beginPath(); ctx.arc(w / 2, h / 2 - 8, 5, 0, 7); ctx.fill();
    });
    // aegis 5x4
    makeTex(scene, 'b-aegis-t2', 5 * T, 4 * T, (ctx) => {
      const w = 5 * T, h = 4 * T;
      ctx.fillStyle = '#4a586b'; ctx.beginPath(); ctx.moveTo(w / 2, 4); ctx.lineTo(w - 8, h / 2); ctx.lineTo(w / 2, h - 6); ctx.lineTo(8, h / 2); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#65758c'; ctx.beginPath(); ctx.moveTo(w / 2, 12); ctx.lineTo(w - 22, h / 2); ctx.lineTo(w / 2, h - 16); ctx.lineTo(22, h / 2); ctx.closePath(); ctx.fill();
      ctx.fillStyle = col; ctx.beginPath(); ctx.arc(w / 2, h / 2, 7, 0, 7); ctx.fill();
      px(ctx, 0, h - 4, w, 4, 'rgba(0,0,0,0.45)');
    });

    // generic sized buildings per race/size
    const sizes = { supplyDepot: [2, 2], refinery: [4, 3], barracks: [4, 3], factory: [4, 3], starport: [4, 3], academy: [3, 3], missileTurret: [2, 2], engineeringBay: [2, 2], scienceFacility: [4, 3], machineShop: [2, 2], bunker: [2, 2],
      geneForge: [3, 3], clawPit: [3, 3], spineWarren: [3, 3], aerie: [3, 3], tremorCavern: [3, 3], stingerColony: [2, 2], gasSiphon: [4, 3], deepWarren: [4, 4], hive: [4, 4], blightNode: [2, 2],
      conduit: [2, 2], portal: [3, 3], fabricator: [4, 3], synapseCore: [3, 3], runeworks: [3, 3], psiVault: [3, 3], convocation: [3, 3], skyPortal: [4, 3], lanceTurret: [2, 2], forge: [2, 2], essenceTap: [4, 3], skyAnchor: [3, 3], controlTower: [2, 2] };

    for (const [bid, [tw, th]] of Object.entries(sizes)) {
      for (let team = 0; team < 3; team++) {
        const tcol = team === 0 ? '#4ea1ff' : team === 1 ? '#ff7b2e' : '#ff4fa3';
        const base = team === 0 ? '#525c6a' : team === 1 ? '#6b3d22' : '#4c4a72';
        const roof = team === 0 ? '#67727f' : team === 1 ? '#87502c' : '#63618f';
        const edge = team === 0 ? '#2b313a' : team === 1 ? '#42250f' : '#2f2e4a';
        const key = `b-${bid}-t${team}`;
        if (scene.textures.exists(key)) continue;
        makeTex(scene, key, tw * T, th * T, (ctx) => {
          const w = tw * T, h = th * T;
          if (bid === 'conduit') {
            ctx.fillStyle = tcol; ctx.fillRect(w / 2 - 4, 2, 8, h - 4);
            ctx.fillStyle = '#8b95a3'; ctx.fillRect(w / 2 - 6, h / 2 - 3, 12, 6);
            ctx.globalAlpha = 0.4; ctx.fillStyle = '#ffffff'; ctx.fillRect(w / 2 - 2, 4, 4, h - 8); ctx.globalAlpha = 1;
            return;
          }
          if (bid === 'lanceTurret' || bid === 'missileTurret' || bid === 'stingerColony') {
            ctx.fillStyle = edge; ctx.beginPath(); ctx.arc(w / 2, h / 2, w / 2 - 1, 0, 7); ctx.fill();
            ctx.fillStyle = base; ctx.beginPath(); ctx.arc(w / 2, h / 2, w / 2 - 4, 0, 7); ctx.fill();
            ctx.fillStyle = roof; ctx.beginPath(); ctx.arc(w / 2, h / 2 - 2, w / 2 - 9, 0, 7); ctx.fill();
            ctx.fillStyle = tcol; ctx.fillRect(w / 2 - 3, h / 2 - 3, 6, 6);
            if (bid === 'missileTurret') { px(ctx, w / 2 - 1, 2, 2, 8, '#ff5a5a'); px(ctx, w / 2 + 3, 3, 2, 7, '#ffd23f'); }
            return;
          }
          drawPanel(ctx, w, h, base, edge, roof, tcol);
          if (bid === 'barracks' || bid === 'factory' || bid === 'starport' || bid === 'portal' || bid === 'fabricator' || bid === 'skyPortal') {
            px(ctx, 6, h - 10, 12, 6, '#101418'); // door
            px(ctx, 7, h - 9, 10, 4, '#1c222a');
          }
          if (bid === 'aerie' || bid === 'synapseCore' || bid === 'psiVault') {
            ctx.globalAlpha = 0.8; ctx.fillStyle = tcol; ctx.beginPath(); ctx.arc(w / 2, h / 2, 5, 0, 7); ctx.fill(); ctx.globalAlpha = 1;
          }
        });
      }
    }
    // terran command center exists; broodNest/aegis exist. skip duplicates.
  }
}

function createFx(scene) {
  // soft ground shadow blob (per-size, tinted by caller alpha)
  // v2.44: denser contact core so units read as grounded, not floating
  makeTex(scene, 'shadow-s', 20, 10, (ctx) => {
    const g = ctx.createRadialGradient(10, 5, 1, 10, 5, 9);
    g.addColorStop(0, 'rgba(0,0,0,0.75)'); g.addColorStop(0.55, 'rgba(0,0,0,0.4)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(10, 5, 9.5, 4.5, 0, 0, 7); ctx.fill();
  });
  makeTex(scene, 'shadow-m', 26, 12, (ctx) => {
    const g = ctx.createRadialGradient(13, 6, 1, 13, 6, 12);
    g.addColorStop(0, 'rgba(0,0,0,0.75)'); g.addColorStop(0.55, 'rgba(0,0,0,0.4)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(13, 6, 12.5, 5.5, 0, 0, 7); ctx.fill();
  });
  makeTex(scene, 'shadow-l', 40, 16, (ctx) => {
    const g = ctx.createRadialGradient(20, 8, 2, 20, 8, 18);
    g.addColorStop(0, 'rgba(0,0,0,0.75)'); g.addColorStop(0.55, 'rgba(0,0,0,0.4)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(20, 8, 19, 7.5, 0, 0, 7); ctx.fill();
  });
  makeTex(scene, 'spark', 8, 8, (ctx) => {
    ctx.fillStyle = '#ffe08a'; ctx.beginPath(); ctx.arc(4, 4, 3, 0, 7); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.fillRect(3, 3, 2, 2);
  });
  // artillery shell (points +x)
  makeTex(scene, 'shell', 10, 4, (ctx) => {
    ctx.fillStyle = '#c9ccd4'; ctx.fillRect(0, 1, 6, 2);
    ctx.fillStyle = '#ffd27a'; ctx.beginPath(); ctx.moveTo(6, 0.5); ctx.lineTo(10, 2); ctx.lineTo(6, 3.5); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#7a828c'; ctx.fillRect(0, 1, 2, 2);
  });
  // spent brass casing
  makeTex(scene, 'brass', 5, 2, (ctx) => {
    ctx.fillStyle = '#d8a848'; ctx.fillRect(0, 0, 5, 2);
    ctx.fillStyle = '#f2d080'; ctx.fillRect(0, 0, 2, 1);
    ctx.fillStyle = '#8f6c28'; ctx.fillRect(4, 0, 1, 2);
  });
  makeTex(scene, 'explosion', 40, 40, (ctx) => {
    ctx.fillStyle = '#ff9c3c'; ctx.beginPath(); ctx.arc(20, 20, 16, 0, 7); ctx.fill();
    ctx.fillStyle = '#ffd27a'; ctx.beginPath(); ctx.arc(20, 20, 10, 0, 7); ctx.fill();
    ctx.fillStyle = '#fff4d0'; ctx.beginPath(); ctx.arc(20, 20, 5, 0, 7); ctx.fill();
  });
  makeTex(scene, 'storm', 64, 64, (ctx) => {
    ctx.fillStyle = 'rgba(160,90,255,0.5)'; ctx.beginPath(); ctx.arc(32, 32, 30, 0, 7); ctx.fill();
    ctx.fillStyle = 'rgba(200,150,255,0.6)';
    for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.arc(16 + Math.random() * 32, 16 + Math.random() * 32, 6, 0, 7); ctx.fill(); }
  });
  makeTex(scene, 'lift-glow', 32, 12, (ctx) => {
    const g = ctx.createLinearGradient(0, 0, 0, 12);
    g.addColorStop(0, '#9fc8ff'); g.addColorStop(1, 'rgba(159,200,255,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 32, 12);
  });
  // persistent death scorch decal
  makeTex(scene, 'scorch', 24, 24, (ctx) => {
    ctx.fillStyle = 'rgba(20,14,10,0.75)'; ctx.beginPath(); ctx.ellipse(12, 12, 11, 8, 0.3, 0, 7); ctx.fill();
    ctx.fillStyle = 'rgba(45,32,22,0.6)'; ctx.beginPath(); ctx.ellipse(10, 11, 6, 4, 0.8, 0, 7); ctx.fill();
    ctx.fillStyle = 'rgba(80,55,35,0.5)'; ctx.fillRect(6, 14, 3, 2); ctx.fillRect(15, 8, 2, 2);
  });
  // blood splat for hits
  makeTex(scene, 'blood', 10, 10, (ctx) => {
    ctx.fillStyle = '#b3372e'; ctx.beginPath(); ctx.arc(5, 5, 3, 0, 7); ctx.fill();
    ctx.fillStyle = '#8f2b24'; ctx.fillRect(2, 4, 2, 2); ctx.fillRect(7, 6, 2, 1);
  });
  // SC1 persistent per-race gore/carnage decals
  makeTex(scene, 'gore-skarn', 28, 28, (ctx) => {
    ctx.fillStyle = 'rgba(70,120,40,0.65)'; ctx.beginPath(); ctx.ellipse(14, 14, 12, 9, 0.4, 0, 7); ctx.fill();
    ctx.fillStyle = 'rgba(150,60,80,0.55)'; ctx.beginPath(); ctx.ellipse(10, 12, 5, 4, 0, 0, 7); ctx.fill();
    ctx.fillStyle = 'rgba(190,220,120,0.5)'; ctx.fillRect(16, 16, 3, 2); ctx.fillRect(8, 18, 2, 2); ctx.fillRect(18, 8, 2, 2);
    ctx.fillStyle = 'rgba(120,40,55,0.6)'; ctx.fillRect(12, 6, 2, 3);
  });
  makeTex(scene, 'gore-terran', 26, 26, (ctx) => {
    ctx.fillStyle = 'rgba(140,30,28,0.6)'; ctx.beginPath(); ctx.ellipse(13, 13, 11, 8, 0.7, 0, 7); ctx.fill();
    ctx.fillStyle = 'rgba(90,20,18,0.5)'; ctx.beginPath(); ctx.ellipse(16, 15, 5, 3, 0, 0, 7); ctx.fill();
    ctx.fillStyle = 'rgba(60,60,64,0.55)'; ctx.fillRect(6, 8, 3, 2); ctx.fillRect(17, 7, 2, 2); // oil/soot
    ctx.fillStyle = 'rgba(200,190,180,0.4)'; ctx.fillRect(10, 18, 2, 2); // shrapnel
  });
  makeTex(scene, 'gore-auraxis', 26, 26, (ctx) => {
    ctx.fillStyle = 'rgba(70,140,220,0.45)'; ctx.beginPath(); ctx.ellipse(13, 13, 11, 7, 0.2, 0, 7); ctx.fill();
    ctx.fillStyle = 'rgba(140,200,255,0.5)'; ctx.fillRect(8, 10, 2, 2); ctx.fillRect(15, 14, 2, 2); ctx.fillRect(12, 17, 3, 1); // ionized residue
    ctx.fillStyle = 'rgba(30,40,60,0.5)'; ctx.beginPath(); ctx.ellipse(13, 12, 5, 3, 0.9, 0, 7); ctx.fill();
  });
  // burning wreckage for dead structures — v2.35b: fresh burning stage
  makeTex(scene, 'rubble', 40, 40, (ctx) => {
    ctx.fillStyle = 'rgba(24,22,20,0.85)';
    ctx.beginPath(); ctx.moveTo(4, 30); ctx.lineTo(12, 12); ctx.lineTo(20, 22); ctx.lineTo(28, 8); ctx.lineTo(36, 28); ctx.lineTo(30, 34); ctx.lineTo(10, 34); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(50,44,38,0.8)'; ctx.fillRect(9, 22, 8, 6); ctx.fillRect(22, 18, 9, 8);
    ctx.fillStyle = 'rgba(255,140,60,0.7)'; ctx.fillRect(13, 20, 3, 3); ctx.fillRect(26, 16, 2, 3);
    ctx.fillStyle = 'rgba(255,210,120,0.8)'; ctx.fillRect(14, 21, 1, 1); ctx.fillRect(26, 17, 1, 1);
  });
  // v2.35b gap 94: wreckage stage 1 — blackened twisted frame still fully alight
  makeTex(scene, 'rubble-fresh', 40, 40, (ctx) => {
    ctx.fillStyle = 'rgba(16,13,10,0.92)';
    ctx.beginPath(); ctx.moveTo(3, 32); ctx.lineTo(9, 10); ctx.lineTo(15, 20); ctx.lineTo(21, 6); ctx.lineTo(27, 18); ctx.lineTo(33, 9); ctx.lineTo(37, 30); ctx.lineTo(30, 36); ctx.lineTo(8, 36); ctx.closePath(); ctx.fill();
    // hot core flames
    ctx.fillStyle = 'rgba(255,120,30,0.85)'; ctx.fillRect(8, 18, 6, 8); ctx.fillRect(18, 14, 7, 10); ctx.fillRect(28, 20, 5, 6);
    ctx.fillStyle = 'rgba(255,190,80,0.9)'; ctx.fillRect(10, 20, 3, 4); ctx.fillRect(20, 16, 3, 5); ctx.fillRect(29, 22, 2, 3);
    ctx.fillStyle = 'rgba(255,240,170,0.95)'; ctx.fillRect(11, 22, 1, 2); ctx.fillRect(21, 18, 1, 2);
    // glowing beam tips
    ctx.fillStyle = 'rgba(255,150,50,0.6)'; ctx.fillRect(9, 10, 2, 3); ctx.fillRect(21, 6, 2, 3); ctx.fillRect(33, 9, 2, 3);
  });
  // v2.35b gap 94: stage 3 — cold gray ash after the fire dies
  makeTex(scene, 'rubble-ash', 40, 40, (ctx) => {
    ctx.fillStyle = 'rgba(58,58,62,0.8)';
    ctx.beginPath(); ctx.moveTo(4, 31); ctx.lineTo(11, 13); ctx.lineTo(19, 23); ctx.lineTo(27, 10); ctx.lineTo(36, 29); ctx.lineTo(29, 35); ctx.lineTo(9, 35); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(92,92,98,0.7)'; ctx.fillRect(10, 24, 7, 5); ctx.fillRect(23, 20, 8, 7);
    ctx.fillStyle = 'rgba(130,130,138,0.5)'; ctx.fillRect(12, 25, 3, 2); ctx.fillRect(25, 22, 3, 2);
    ctx.fillStyle = 'rgba(30,30,34,0.6)'; ctx.fillRect(8, 33, 24, 2); // settled ash line
  });
  // v2.35b gap 94: rising smoke puff
  makeTex(scene, 'smoke', 16, 16, (ctx) => {
    const g = ctx.createRadialGradient(8, 8, 1, 8, 8, 8);
    g.addColorStop(0, 'rgba(90,90,96,0.55)'); g.addColorStop(0.6, 'rgba(60,60,66,0.30)'); g.addColorStop(1, 'rgba(40,40,46,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(8, 8, 8, 0, 7); ctx.fill();
  });
  // power-up crate (SC1 pickups)
  makeTex(scene, 'crate', 14, 14, (ctx) => {
    px(ctx, 1, 2, 12, 10, '#3d4a5c'); px(ctx, 2, 3, 10, 8, '#55677f');
    px(ctx, 1, 6, 12, 2, '#ffd23f'); // hazard band
    px(ctx, 6, 4, 2, 6, '#9fc8ff'); // glow core
    ctx.fillStyle = 'rgba(255,210,63,0.35)'; ctx.fillRect(0, 1, 14, 12);
  });
  // critter (scratch-like scavenger)
  makeTex(scene, 'critter', 12, 12, (ctx) => {
    px(ctx, 4, 4, 5, 4, '#a88b5c'); px(ctx, 2, 5, 2, 2, '#8f774d'); // body + snout
    px(ctx, 5, 2, 1, 2, '#8f774d'); px(ctx, 7, 2, 1, 2, '#8f774d'); // ears
    px(ctx, 8, 5, 1, 1, '#ffdf9e'); // eye
    px(ctx, 9, 7, 2, 1, '#8f774d'); px(ctx, 3, 8, 1, 2, '#6e5a3a'); px(ctx, 7, 8, 1, 2, '#6e5a3a'); // legs
  });
}

function createCursor(scene) {
  makeTex(scene, 'crosshair', 16, 16, (ctx) => {
    ctx.strokeStyle = '#ff6b6b'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(8, 8, 6, 0, 7); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(8, 0); ctx.lineTo(8, 4); ctx.moveTo(8, 12); ctx.lineTo(16, 8); ctx.moveTo(0, 8); ctx.lineTo(4, 8); ctx.moveTo(12, 8); ctx.lineTo(16, 8); ctx.stroke();
  });
  // soft radial glow for point lights (white; tinted at draw time)
  makeTex(scene, 'glow', 64, 64, (ctx) => {
    const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.4, 'rgba(255,255,255,0.5)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64);
  });
  makeTex(scene, 'glow-soft', 128, 128, (ctx) => {
    const g = ctx.createRadialGradient(64, 64, 4, 64, 64, 62);
    g.addColorStop(0, 'rgba(255,255,255,0.85)');
    g.addColorStop(0.35, 'rgba(255,255,255,0.35)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 128);
  });
}

export { makeTex };
