function rrect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function ellipse(ctx, cx, cy, rx, ry) {
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
}

function glow(ctx, color, blur) {
  ctx.shadowColor = color;
  ctx.shadowBlur = blur;
}

function clearGlow(ctx) {
  ctx.shadowBlur = 0;
}

function replaceTex(scene, key, w, h, draw) {
  if (scene.textures.exists(key)) scene.textures.remove(key);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  draw(ctx, w, h);
  scene.textures.addCanvas(key, canvas);
}

function metalBuilding(ctx, w, h, palette) {
  const g = ctx.createLinearGradient(0, 8, 0, h);
  g.addColorStop(0, palette.hi);
  g.addColorStop(0.45, palette.mid);
  g.addColorStop(1, palette.lo);
  ctx.fillStyle = '#05080e';
  rrect(ctx, 6, h * 0.28, w - 12, h * 0.62, 6); ctx.fill();
  ctx.fillStyle = g;
  rrect(ctx, 10, h * 0.22, w - 20, h * 0.58, 5); ctx.fill();
  ctx.fillStyle = palette.trim;
  rrect(ctx, 14, h * 0.3, w - 28, 6, 2); ctx.fill();
  glow(ctx, palette.glow, 10);
  ctx.fillStyle = palette.glow;
  rrect(ctx, w / 2 - 10, h * 0.16, 20, 10, 3); ctx.fill();
  ellipse(ctx, w / 2, h * 0.62, 8, 5);
  clearGlow(ctx);
  ctx.fillStyle = '#0b1220';
  rrect(ctx, 18, h * 0.42, w - 36, h * 0.22, 3); ctx.fill();
  ctx.fillStyle = palette.win;
  for (let i = 0; i < 5; i += 1) ctx.fillRect(22 + i * ((w - 50) / 5), h * 0.46, 6, 8);
}

function hiveBuilding(ctx, w, h, palette) {
  ctx.fillStyle = '#140806';
  ellipse(ctx, w / 2, h * 0.82, w * 0.42, 10);
  const g = ctx.createRadialGradient(w / 2, h * 0.55, 6, w / 2, h * 0.55, w * 0.42);
  g.addColorStop(0, palette.glow);
  g.addColorStop(0.45, palette.mid);
  g.addColorStop(1, palette.lo);
  ctx.fillStyle = g;
  ellipse(ctx, w / 2, h * 0.58, w * 0.38, h * 0.32);
  glow(ctx, palette.glow, 12);
  ctx.fillStyle = palette.hi;
  ellipse(ctx, w / 2, h * 0.36, w * 0.18, h * 0.14);
  clearGlow(ctx);
  ctx.fillStyle = palette.trim;
  ellipse(ctx, w / 2 - 16, h * 0.62, 5, 8);
  ellipse(ctx, w / 2 + 16, h * 0.62, 5, 8);
}

function crystalBuilding(ctx, w, h, palette) {
  ctx.fillStyle = '#080614';
  rrect(ctx, 10, h * 0.7, w - 20, 12, 3); ctx.fill();
  ctx.fillStyle = palette.lo;
  ctx.beginPath();
  ctx.moveTo(w / 2, 6);
  ctx.lineTo(w - 10, h * 0.72);
  ctx.lineTo(10, h * 0.72);
  ctx.closePath();
  ctx.fill();
  glow(ctx, palette.glow, 14);
  ctx.fillStyle = palette.hi;
  ctx.beginPath();
  ctx.moveTo(w / 2, 14);
  ctx.lineTo(w * 0.68, h * 0.58);
  ctx.lineTo(w * 0.32, h * 0.58);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#fff';
  ellipse(ctx, w / 2, h * 0.42, 4, 10);
  clearGlow(ctx);
}

function hdWorker(ctx, w, h, pal) {
  const cx = w / 2;
  ctx.fillStyle = '#05070c';
  ellipse(ctx, cx, h - 5, w * 0.42, 5);
  const body = ctx.createLinearGradient(0, 10, 0, h);
  body.addColorStop(0, pal.hi);
  body.addColorStop(1, pal.lo);
  ctx.fillStyle = body;
  rrect(ctx, cx - 13, h - 36, 26, 22, 5); ctx.fill();
  glow(ctx, pal.glow, 8);
  ctx.fillStyle = pal.glow;
  rrect(ctx, cx - 8, h - 44, 16, 6, 2); ctx.fill();
  clearGlow(ctx);
  ctx.fillStyle = pal.trim;
  rrect(ctx, cx + 10, h - 30, 14, 6, 2); ctx.fill();
  ctx.fillStyle = pal.hi;
  ctx.beginPath(); ctx.arc(cx, h - 40, 10, Math.PI, 0); ctx.fill();
}

function hdSoldier(ctx, w, h, pal) {
  const cx = w / 2;
  ctx.fillStyle = '#05070c';
  ellipse(ctx, cx, h - 4, 13, 4);
  const armor = ctx.createLinearGradient(0, 8, 0, h);
  armor.addColorStop(0, pal.hi);
  armor.addColorStop(1, pal.lo);
  ctx.fillStyle = armor;
  rrect(ctx, cx - 11, h - 32, 22, 24, 4); ctx.fill();
  ctx.fillStyle = pal.lo;
  ctx.beginPath(); ctx.arc(cx, h - 38, 11, Math.PI, 0); ctx.fill();
  glow(ctx, pal.glow, 8);
  ctx.fillStyle = pal.glow;
  rrect(ctx, cx - 8, h - 42, 16, 5, 2); ctx.fill();
  clearGlow(ctx);
  ctx.fillStyle = pal.trim;
  rrect(ctx, cx + 8, h - 26, 16, 5, 2); ctx.fill();
}

export function applyHdArt(scene) {
  const terran = { hi: '#9ec5e8', mid: '#3d6ea8', lo: '#163050', trim: '#fbbf24', glow: '#67e8f9', win: '#bae6fd' };
  const zerg = { hi: '#fdba74', mid: '#ea580c', lo: '#431407', trim: '#facc15', glow: '#fb923c', win: '#fde68a' };
  const proto = { hi: '#ddd6fe', mid: '#7c3aed', lo: '#1e1b4b', trim: '#67e8f9', glow: '#c4b5fd', win: '#e9d5ff' };

  replaceTex(scene, 'terran-command-center', 140, 92, (ctx, w, h) => {
    metalBuilding(ctx, w, h, terran);
    ctx.fillStyle = '#93c5fd';
    rrect(ctx, 20, 10, w - 40, 16, 4); ctx.fill();
    glow(ctx, '#38bdf8', 12);
    ellipse(ctx, w / 2, 18, 16, 6);
    clearGlow(ctx);
  });
  replaceTex(scene, 'terran-barracks', 112, 72, (ctx, w, h) => metalBuilding(ctx, w, h, terran));
  replaceTex(scene, 'terran-factory', 100, 66, (ctx, w, h) => metalBuilding(ctx, w, h, { ...terran, trim: '#fb7185' }));
  replaceTex(scene, 'terran-supply', 84, 60, (ctx, w, h) => metalBuilding(ctx, w, h, { ...terran, glow: '#fde68a' }));
  replaceTex(scene, 'terran-defense', 92, 68, (ctx, w, h) => {
    metalBuilding(ctx, w, h, terran);
    glow(ctx, '#f97316', 10);
    ctx.fillStyle = '#fb923c';
    rrect(ctx, w / 2 - 4, 8, 8, 18, 1); ctx.fill();
    clearGlow(ctx);
  });

  replaceTex(scene, 'zerg-command-center', 144, 96, (ctx, w, h) => hiveBuilding(ctx, w, h, zerg));
  replaceTex(scene, 'zerg-production', 108, 74, (ctx, w, h) => hiveBuilding(ctx, w, h, zerg));
  replaceTex(scene, 'zerg-tech', 96, 64, (ctx, w, h) => hiveBuilding(ctx, w, h, { ...zerg, glow: '#a855f7' }));
  replaceTex(scene, 'zerg-supply', 80, 58, (ctx, w, h) => hiveBuilding(ctx, w, h, zerg));
  replaceTex(scene, 'zerg-defense', 88, 66, (ctx, w, h) => hiveBuilding(ctx, w, h, { ...zerg, hi: '#facc15' }));

  replaceTex(scene, 'protoss-command-center', 144, 94, (ctx, w, h) => crystalBuilding(ctx, w, h, proto));
  replaceTex(scene, 'protoss-production', 112, 76, (ctx, w, h) => crystalBuilding(ctx, w, h, proto));
  replaceTex(scene, 'protoss-tech', 100, 68, (ctx, w, h) => crystalBuilding(ctx, w, h, proto));
  replaceTex(scene, 'protoss-supply', 84, 60, (ctx, w, h) => crystalBuilding(ctx, w, h, proto));
  replaceTex(scene, 'protoss-defense', 90, 66, (ctx, w, h) => crystalBuilding(ctx, w, h, { ...proto, glow: '#67e8f9' }));

  replaceTex(scene, 'terran-scv', 48, 68, (ctx, w, h) => hdWorker(ctx, w, h, terran));
  replaceTex(scene, 'terran-marine', 48, 68, (ctx, w, h) => hdSoldier(ctx, w, h, terran));
  replaceTex(scene, 'zerg-drone', 48, 68, (ctx, w, h) => hdWorker(ctx, w, h, zerg));
  replaceTex(scene, 'zerg-zergling', 48, 64, (ctx, w, h) => hdSoldier(ctx, w, h, zerg));
  replaceTex(scene, 'protoss-probe', 48, 68, (ctx, w, h) => hdWorker(ctx, w, h, proto));
  replaceTex(scene, 'protoss-zealot', 48, 74, (ctx, w, h) => hdSoldier(ctx, w, h, proto));

  [['terran-mineral', '#67e8f9', '#e0f2fe'], ['zerg-mineral', '#fb923c', '#fed7aa'], ['protoss-mineral', '#c4b5fd', '#ede9fe']].forEach(([key, a, b]) => {
    replaceTex(scene, key, 52, 52, (ctx, w, h) => {
      ctx.fillStyle = '#111827';
      ellipse(ctx, w / 2, h - 8, 18, 6);
      glow(ctx, a, 12);
      ctx.fillStyle = a;
      ctx.beginPath(); ctx.moveTo(w / 2, 4); ctx.lineTo(w - 8, h - 10); ctx.lineTo(8, h - 10); ctx.fill();
      ctx.fillStyle = b;
      ctx.beginPath(); ctx.moveTo(16, h - 10); ctx.lineTo(12, 16); ctx.lineTo(24, h - 10); ctx.fill();
      ctx.fillStyle = '#fff';
      ellipse(ctx, w / 2, 12, 3, 2);
      clearGlow(ctx);
    });
  });

  [['terran-gas', '#c084fc'], ['zerg-gas', '#a855f7'], ['protoss-gas', '#818cf8']].forEach(([key, col]) => {
    replaceTex(scene, key, 48, 48, (ctx, w, h) => {
      ctx.fillStyle = '#111827';
      ellipse(ctx, w / 2, h - 6, 16, 5);
      glow(ctx, col, 14);
      ctx.fillStyle = col;
      rrect(ctx, 12, 16, w - 24, 22, 6); ctx.fill();
      ellipse(ctx, w / 2, 12, 7, 6);
      clearGlow(ctx);
    });
  });

  replaceTex(scene, 'terran-terrain', 64, 64, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, '#2a1d12'); g.addColorStop(1, '#3f2b18');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#5a4224';
    for (let i = 0; i < 18; i += 1) ctx.fillRect((i * 17) % 64, (i * 11) % 64, 3, 2);
  });
}
