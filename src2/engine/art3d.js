// AAA building studio — high-detail pseudo-3D procedural sprites for all races.
import Phaser from 'phaser';
// Techniques: multi-face extrusion (sunlit roof / lit facade / shaded side),
// cylindrical+spherical gradients, baked AO, panel greebles, team-lit emissive
// windows with bloom, hazard stripes, chitin ribs + sacs, crystal spires + runes.
import { TILE } from '../data/sc1.js';
const T = TILE; // world tile = 16px; art renders at SS x T for crisp zoom

function seedRand(str) { let h = 2166136261 >>> 0; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } let a = h >>> 0; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const OL = 'rgba(5,7,11,0.92)';
function rr(ctx, x, y, w, h, r = 2) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
function vgrad(ctx, y0, y1, c0, c1) { const g = ctx.createLinearGradient(0, y0, 0, y1); g.addColorStop(0, c0); g.addColorStop(1, c1); return g; }
function hgrad(ctx, x0, x1, c0, c1, c2) { const g = ctx.createLinearGradient(x0, 0, x1, 0); g.addColorStop(0, c0); g.addColorStop(0.38, c1); if (c2) g.addColorStop(1, c2); else g.addColorStop(1, c0); return g; }
function rgrad(ctx, cx, cy, r, c0, c1, fx = 0.35, fy = 0.32) { const g = ctx.createRadialGradient(cx - r * fx, cy - r * fy, r * 0.04, cx, cy, r); g.addColorStop(0, c0); g.addColorStop(1, c1); return g; }
function px(ctx, x, y, w, h, col) { ctx.fillStyle = col; ctx.fillRect(x, y, w, h); }
function stroke(ctx, col, lw = 1) { ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.stroke(); }

// extruded block: gradient facade + dark outline + sunlit top bevel + bottom AO
function block(ctx, x, y, w, h, c0, c1, r = 2) { rr(ctx, x, y, w, h, r); ctx.fillStyle = vgrad(ctx, y, y + h, c0, c1); ctx.fill(); stroke(ctx, OL); px(ctx, x + 2, y + 1, Math.max(0, w - 4), 1, 'rgba(255,255,255,0.22)'); px(ctx, x + 1, y + h - 2, Math.max(0, w - 2), 2, 'rgba(0,0,0,0.38)'); }
// perspective side sliver (right face, darker)
function side(ctx, x, y, h, skew, col) { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + skew, y - skew * 0.55); ctx.lineTo(x + skew, y + h - skew * 0.55); ctx.lineTo(x, y + h); ctx.closePath(); ctx.fillStyle = col; ctx.fill(); stroke(ctx, 'rgba(5,7,11,0.8)'); }
// cylinder tank: horizontal shade for roundness + lit cap
function cyl(ctx, cx, y, w, h, edge, mid, cap, rim) { const x = cx - w / 2; px(ctx, x, y + 2, w, h - 2, hgrad(ctx, x, x + w, edge, mid, edge)); stroke(ctx, 'rgba(5,7,11,0.8)'); ctx.beginPath(); ctx.ellipse(cx, y + 2, w / 2, 3.4, 0, 0, 7); ctx.fillStyle = cap; ctx.fill(); stroke(ctx, rim || 'rgba(5,7,11,0.7)'); px(ctx, x + 1.4, y + 3, 1.4, h - 5, 'rgba(255,255,255,0.16)'); }
// lit windows with additive bloom
function lights(ctx, x, y, n, sp, col, ww = 3, wh = 2) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; for (let i = 0; i < n; i++) { const cx = x + i * sp; const g = ctx.createRadialGradient(cx + ww / 2, y + wh / 2, 0.5, cx + ww / 2, y + wh / 2, 4.4); g.addColorStop(0, col.replace(/[\d.]+\)$/, '0.5)')); g.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = g; ctx.fillRect(cx - 3.4, y - 3.4, ww + 6.8, wh + 6.8); } ctx.restore(); for (let i = 0; i < n; i++) px(ctx, x + i * sp, y, ww, wh, col); }
function stripes(ctx, x, y, w, h, cA, cB, cw = 5) { ctx.save(); rr(ctx, x, y, w, h, 1); ctx.clip(); let flip = false; for (let i = -h; i < w; i += cw) { ctx.fillStyle = flip ? cB : cA; ctx.beginPath(); ctx.moveTo(x + i, y + h); ctx.lineTo(x + i + cw, y + h); ctx.lineTo(x + i + cw + h, y); ctx.lineTo(x + i + h, y); ctx.closePath(); ctx.fill(); flip = !flip; } ctx.restore(); }
function mast(ctx, x, y, h, col) { px(ctx, x, y, 1.4, h, '#8b95a3'); px(ctx, x - 1.4, y + h * 0.45, 4.2, 1, '#6b7684'); px(ctx, x - 0.7, y - 1.6, 2.6, 2, col); }
function dome(ctx, cx, cy, r, c0, c1) { ctx.fillStyle = rgrad(ctx, cx, cy, r, c0, c1); ctx.beginPath(); ctx.arc(cx, cy, r, 0, 7); ctx.fill(); stroke(ctx, 'rgba(5,7,11,0.85)'); ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(cx, cy, r * 0.72, Math.PI * 1.02, Math.PI * 1.5); ctx.stroke(); }
function vents(ctx, x, y, w, h, col) { px(ctx, x, y, w, h, col); for (let i = 0; i < 3; i++) px(ctx, x + 1 + i * (w - 2) / 3, y + 1, (w - 2) / 3 - 1, 1, 'rgba(0,0,0,0.5)'); }
function corrugate(ctx, x, y, w, h, a = 0.1) { for (let i = 0; i < w; i += 4) px(ctx, x + i, y, 1, h, `rgba(0,0,0,${a})`); }
function speckle(ctx, w, h, rng, col, n = 26) { for (let i = 0; i < n; i++) px(ctx, rng() * w, rng() * h, 1 + rng() * 2, 1, col); }
function ao(ctx, w, h, a = 0.5) { ctx.save(); const g = ctx.createLinearGradient(0, h - 10, 0, h); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, `rgba(0,0,0,${a})`); ctx.fillStyle = g; ctx.fillRect(0, h - 10, w, 10); ctx.restore(); }
// organic sac: wet blob with subsurface-ish glow + specular dot
function sac(ctx, cx, cy, rx, ry, body, deep, glowCol) { ctx.fillStyle = rgrad(ctx, cx, cy, Math.max(rx, ry), body, deep); ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, 7); ctx.fill(); stroke(ctx, 'rgba(10,6,4,0.8)'); if (glowCol) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; const g = ctx.createRadialGradient(cx, cy + ry * 0.2, 0.5, cx, cy, rx * 1.4); g.addColorStop(0, glowCol); g.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(cx, cy, rx * 1.4, ry * 1.4, 0, 0, 7); ctx.fill(); ctx.restore(); } ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.beginPath(); ctx.ellipse(cx - rx * 0.32, cy - ry * 0.42, rx * 0.24, ry * 0.14, -0.5, 0, 7); ctx.fill(); }
// chitin plate row: overlapping scales
function ribs(ctx, cx, yTop, w, rows, cA, cB) { for (let r = 0; r < rows; r++) { const y = yTop + r * 5; const ww = w - r * 4; ctx.fillStyle = r % 2 ? cB : cA; ctx.beginPath(); ctx.ellipse(cx, y, ww / 2, 3.6, 0, Math.PI, 0); ctx.fill(); stroke(ctx, 'rgba(10,6,4,0.65)'); } }
// bone spur
function spur(ctx, x, y, h, flip = 1) { ctx.fillStyle = vgrad(ctx, y - h, y, '#f4ead0', '#9a8258'); ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + 3 * flip, y - h * 0.55, x + 1.6 * flip, y - h); ctx.quadraticCurveTo(x + 0.6 * flip, y - h * 0.5, x, y); ctx.closePath(); ctx.fill(); stroke(ctx, 'rgba(10,6,4,0.6)'); }
// crystal spire (auraxis): tapered prism w/ emissive seam
function spire(ctx, cx, baseY, h, w, c0, c1, seam) { ctx.beginPath(); ctx.moveTo(cx - w / 2, baseY); ctx.lineTo(cx - w * 0.22, baseY - h); ctx.lineTo(cx + w * 0.18, baseY - h * 0.92); ctx.lineTo(cx + w / 2, baseY); ctx.closePath(); ctx.fillStyle = vgrad(ctx, baseY - h, baseY, c0, c1); ctx.fill(); stroke(ctx, 'rgba(8,10,16,0.85)'); if (seam) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; stroke(ctx, seam, 1); ctx.beginPath(); ctx.moveTo(cx - w * 0.1, baseY - 2); ctx.lineTo(cx, baseY - h + 2); ctx.stroke(); ctx.restore(); } ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.beginPath(); ctx.moveTo(cx - w / 2 + 1.5, baseY - 2); ctx.lineTo(cx - w * 0.24, baseY - h * 0.86); ctx.lineTo(cx - w * 0.14, baseY - h * 0.84); ctx.lineTo(cx - w * 0.34, baseY - 2); ctx.closePath(); ctx.fill(); }
function runes(ctx, x, y, w, h, col, rng, n = 8) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = col; ctx.lineWidth = 1; for (let i = 0; i < n; i++) { const rx = x + rng() * w, ry = y + rng() * h; ctx.beginPath(); ctx.moveTo(rx, ry); ctx.lineTo(rx + (rng() - 0.5) * 5, ry + (rng() - 0.5) * 5); ctx.stroke(); } ctx.restore(); }
function dish(ctx, cx, cy, r, col) { ctx.beginPath(); ctx.ellipse(cx, cy, r, r * 0.62, -0.5, 0, 7); ctx.fillStyle = vgrad(ctx, cy - r, cy + r, '#c3cedd', '#5b6470'); ctx.fill(); stroke(ctx, OL); px(ctx, cx - 0.6, cy - r * 0.9, 1.2, r * 0.9, '#8b95a3'); ctx.beginPath(); ctx.arc(cx + 0.2, cy - r * 0.9, 1.4, 0, 7); ctx.fillStyle = col; ctx.fill(); }

const TEAMS = [['#4ea1ff', 'rgba(120,190,255,'], ['#ff7b2e', 'rgba(255,150,80,'], ['#ff4fa3', 'rgba(255,110,180,']];
function team(T_) { return { col: TEAMS[T_][0], lit: TEAMS[T_][1] + '0.9)', soft: TEAMS[T_][1] + '0.55)' }; }

// ---------------- TERRAN ----------------
const TERR = { s0: '#9aa6b6', s1: '#5b6570', dk: '#333b45', dk2: '#20252c', steel: '#6b7684' };
function terranPlate(ctx, x, y, w, h, tm, extra) { block(ctx, x, y, w, h, TERR.s0, TERR.s1); corrugate(ctx, x + 3, y + 3, w - 6, h - 6, 0.08); lights(ctx, x + 5, y + h * 0.45, Math.max(2, ((w - 10) / 9) | 0), 9, tm.soft, 4, 2); if (extra) extra(ctx); }

// ---------------- renderers per building ----------------
const B = {};

B.commandCenter = (ctx, w, h, tm, rng) => {
  ctx.fillStyle = 'rgba(8,10,14,0.5)'; ctx.beginPath(); ctx.ellipse(w / 2, h - 6, w / 2 - 6, 7, 0, 0, 7); ctx.fill(); // contact AO
  block(ctx, 10, 26, w - 20, h - 46, TERR.s0, TERR.dk);                       // main bunker
  corrugate(ctx, 14, 30, w - 28, h - 54);
  side(ctx, w - 10, 26, h - 46, 6, TERR.dk);                                   // shaded side
  px(ctx, 10, 26, w - 20, 2, 'rgba(255,255,255,0.28)');
  for (let i = 0; i < 5; i++) px(ctx, 16 + i * 18, 28, 5, h - 52, TERR.dk2); // buttresses
  lights(ctx, 18, 42, ((w - 40) / 12) | 0, 12, tm.soft, 5, 3);               // bay windows
  block(ctx, w / 2 - 20, 12, 40, 18, '#8894a6', '#4d5662');                  // tower base
  side(ctx, w / 2 + 20, 12, 18, 5, TERR.dk);
  block(ctx, w / 2 - 14, 2, 28, 12, '#9aa6b6', '#5b6570', 3);               // bridge tower
  lights(ctx, w / 2 - 11, 5, 5, 4.8, 'rgba(143,210,255,0.95)', 3.4, 3.4);  // glass bridge
  dome(ctx, w / 2, 12 - 14, 6, '#dbe6f2', '#57616d');                        // sits above? clamp
  dish(ctx, w / 2 + 26, 22, 7, tm.col);
  mast(ctx, w / 2 - 30, 8, 16, tm.col);
  cyl(ctx, 24, 16, 12, 12, TERR.dk, '#7c8794', '#9aa6b6');                    // fuel tank left
  cyl(ctx, w - 24, 16, 12, 12, TERR.dk, '#7c8794', '#9aa6b6');
  stripes(ctx, 12, h - 24, w - 24, 5, '#d9b23f', '#20252c');
  block(ctx, w / 2 - 14, h - 22, 28, 16, '#49525c', '#333b45', 1);          // blast door
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; const g = ctx.createRadialGradient(w / 2, h - 14, 1, w / 2, h - 14, 12); g.addColorStop(0, tm.lit.replace(/[\d.]+\)$/, '0.4)')); g.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = g; ctx.fillRect(w / 2 - 14, h - 24, 28, 20); ctx.restore();
  ao(ctx, w, h);
};
B.supplyDepot = (ctx, w, h, tm, rng) => {
  block(ctx, 8, 20, w - 16, h - 28, '#7e8898', TERR.s1);                      // lower container
  block(ctx, 12, 10, w - 26, 14, '#8d97a8', '#525c68');                       // upper container offset
  corrugate(ctx, 10, 22, w - 20, h - 32);
  stripes(ctx, 10, h - 12, w - 20, 4, '#d9b23f', '#20252c', 4);
  px(ctx, 12, 12, 3, 3, tm.col); px(ctx, w - 15, 12, 3, 3, tm.col);         // corner castings lit
  vents(ctx, w - 22, 14, 8, 4, TERR.dk); mast(ctx, w / 2, 2, 10, tm.col); ao(ctx, w, h);
};
B.refinery = (ctx, w, h, tm, rng) => {
  ctx.fillStyle = 'rgba(8,10,14,0.5)'; ctx.beginPath(); ctx.ellipse(w / 2, h - 5, w / 2 - 8, 6, 0, 0, 7); ctx.fill();
  block(ctx, 12, 24, w - 34, h - 38, TERR.s0, TERR.dk); corrugate(ctx, 14, 26, w - 38, h - 42);
  side(ctx, w - 22, 24, h - 38, 5, TERR.dk);
  cyl(ctx, 22, 12, 16, 16, TERR.dk, '#79848f', '#99a5b5');                    // storage tank
  cyl(ctx, 44, 8, 14, 20, TERR.dk, '#79848f', '#99a5b5');
  px(ctx, 30, 26, 16, 2, '#5b6570'); px(ctx, 30, 30, 16, 2, '#5b6570');     // pipe runs
  block(ctx, w - 30, h - 20, 22, 14, '#49525c', TERR.dk2, 1); lights(ctx, w - 26, h - 16, 3, 6, tm.soft, 4, 2); // control bay
  mast(ctx, w - 12, 4, 18, tm.col);
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = 'rgba(255,160,60,0.75)'; ctx.beginPath(); ctx.ellipse(w - 10, 8, 2.4, 4, 0, 0, 7); ctx.fill(); ctx.restore(); // flare
  ao(ctx, w, h);
};
B.barracks = (ctx, w, h, tm, rng) => {
  block(ctx, 8, 18, w - 16, h - 26, '#8b95a5', TERR.s1); corrugate(ctx, 10, 20, w - 20, h - 30);
  side(ctx, w - 8, 18, h - 26, 5, TERR.dk);
  block(ctx, w / 2 - 16, h - 18, 32, 16, '#3a434d', TERR.dk2, 1);           // shutter gate
  for (let i = 0; i < 4; i++) px(ctx, w / 2 - 14 + i * 8, h - 16, 6, 12, '#2a323a');
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; const g = ctx.createRadialGradient(w / 2, h - 8, 1, w / 2, h - 8, 14); g.addColorStop(0, 'rgba(255,190,90,0.5)'); g.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = g; ctx.fillRect(w / 2 - 16, h - 20, 32, 20); ctx.restore();
  block(ctx, w - 26, 6, 12, 16, '#7c8794', '#49525c');                        // watchtower
  px(ctx, w - 24, 9, 8, 4, 'rgba(143,210,255,0.9)'); mast(ctx, w - 20.5, 0, 6, tm.col);
  stripes(ctx, 10, h - 8, 20, 4, '#d9b23f', '#20252c', 4);
  lights(ctx, 14, 24, 3, 8, tm.soft, 4, 2); ao(ctx, w, h);
};
B.factory = (ctx, w, h, tm, rng) => {
  block(ctx, 8, 16, w - 16, h - 24, TERR.s0, TERR.dk); corrugate(ctx, 10, 18, w - 20, h - 28);
  side(ctx, w - 8, 16, h - 24, 6, TERR.dk);
  px(ctx, 8, 16, w - 12, 2, 'rgba(255,255,255,0.3)');
  block(ctx, w / 2 - 20, h - 20, 40, 18, '#39424c', TERR.dk2);              // toothy hangar
  for (let i = 0; i < 5; i++) px(ctx, w / 2 - 18 + i * 8, h - 20, 3, 5, '#20252c');
  lights(ctx, w / 2 - 14, h - 12, 4, 8, 'rgba(255,180,80,0.9)', 5, 3);
  px(ctx, 14, 10, 40, 2, '#5b6570'); px(ctx, 20, 4, 30, 3, '#6b7684');      // gantry crane
  px(ctx, 34, 6, 4, 4, tm.col);
  cyl(ctx, w - 14, 6, 8, 12, TERR.dk, '#79848f', '#99a5b5');
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = 'rgba(255,150,60,0.6)'; ctx.beginPath(); ctx.arc(w - 14, 8, 2.2, 0, 7); ctx.fill(); ctx.restore();
  stripes(ctx, w - 44, h - 8, 26, 4, '#d9b23f', '#20252c', 4); ao(ctx, w, h);
};
B.starport = (ctx, w, h, tm, rng) => {
  px(ctx, 6, h - 22, w - 12, 16, '#49525c'); px(ctx, 6, h - 22, w - 12, 2, '#5c6771'); // apron
  for (let i = 0; i < 6; i++) px(ctx, 10 + i * ((w - 20) / 6), h - 8, 3, 2, 'rgba(255,220,120,0.9)');
  block(ctx, 10, 12, 30, 24, TERR.s0, TERR.dk); corrugate(ctx, 12, 14, 26, 20);          // hangar
  block(ctx, 14, h - 18, 22, 14, '#39424c', TERR.dk2, 1);
  block(ctx, w - 24, 4, 16, 30, '#8894a6', '#4d5662');                        // control tower
  lights(ctx, w - 21, 8, 3, 5, 'rgba(143,210,255,0.95)', 4, 3); mast(ctx, w - 16.5, -2, 6, tm.col);
  dish(ctx, w / 2 + 12, 18, 8, tm.col);
  stripes(ctx, 8, h - 24, w - 16, 3, '#d9b23f', '#20252c', 4); ao(ctx, w, h);
};
B.academy = (ctx, w, h, tm, rng) => {
  block(ctx, 8, 18, w - 16, h - 26, '#8892a2', TERR.s1); corrugate(ctx, 10, 20, w - 20, h - 30);
  side(ctx, w - 8, 18, h - 26, 5, TERR.dk);
  block(ctx, w / 2 - 12, h - 16, 24, 14, '#3a434d', TERR.dk2, 1); lights(ctx, w / 2 - 8, h - 12, 3, 6, tm.soft, 4, 2);
  block(ctx, 12, 6, 10, 14, '#6b7684', '#39424c'); block(ctx, w - 22, 8, 8, 12, '#6b7684', '#39424c'); // obstacle towers
  lights(ctx, 16, 22, ((w - 32) / 8) | 0, 8, 'rgba(143,210,255,0.9)', 3, 2); ao(ctx, w, h);
};
B.missileTurret = (ctx, w, h, tm, rng) => {
  ctx.fillStyle = 'rgba(8,10,14,0.55)'; ctx.beginPath(); ctx.ellipse(w / 2, h - 5, w / 2 - 3, 5, 0, 0, 7); ctx.fill();
  block(ctx, 6, 14, w - 12, h - 20, '#7c8794', TERR.dk, 3);
  block(ctx, w / 2 - 8, 6, 16, 12, '#8894a6', '#49525c', 2);                 // launcher housing
  for (let i = 0; i < 3; i++) { px(ctx, w / 2 - 6 + i * 4.4, 2, 3, 6, '#c9ccd4'); px(ctx, w / 2 - 6 + i * 4.4, 1, 3, 1.4, '#ff5a5a'); } // missiles
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = tm.lit; ctx.beginPath(); ctx.arc(w / 2, 12, 2, 0, 7); ctx.fill(); ctx.restore();
  mast(ctx, 6, 2, 10, tm.col); ao(ctx, w, h);
};
B.engineeringBay = (ctx, w, h, tm, rng) => {
  block(ctx, 6, 12, w - 12, h - 18, '#8b95a5', TERR.s1); corrugate(ctx, 8, 14, w - 16, h - 22);
  block(ctx, 10, h - 14, 14, 10, '#39424c', TERR.dk2, 1); ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = 'rgba(255,170,70,0.4)'; ctx.fillRect(11, h - 13, 12, 8); ctx.restore();
  px(ctx, w - 14, 6, 2, 10, '#6b7684'); px(ctx, w - 20, 6, 8, 2, '#6b7684'); // crane jib
  px(ctx, w - 13, 2, 6, 5, '#49525c'); // tire stack hint
  lights(ctx, w - 26, 16, 2, 7, tm.soft, 3, 2); ao(ctx, w, h);
};
B.scienceFacility = (ctx, w, h, tm, rng) => {
  block(ctx, 10, 22, w - 20, h - 32, '#b7c0cc', '#7a8593'); corrugate(ctx, 12, 24, w - 24, h - 36, 0.06);
  dome(ctx, w / 2, 18, 9, '#e8f1fa', '#8fa0b5');
  mast(ctx, 18, 4, 16, tm.col); mast(ctx, w - 18, 6, 14, tm.col); dish(ctx, w - 30, 20, 7, tm.col);
  lights(ctx, 16, 30, ((w - 32) / 9) | 0, 9, 'rgba(143,210,255,0.9)', 4, 2); ao(ctx, w, h);
};
B.machineShop = (ctx, w, h, tm, rng) => {
  block(ctx, 6, 12, w - 12, h - 16, '#7e8898', TERR.s1); corrugate(ctx, 8, 14, w - 16, h - 20);
  block(ctx, 12, h - 12, 12, 8, '#39424c', TERR.dk2, 1); ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = 'rgba(255,150,60,0.4)'; ctx.fillRect(13, h - 11, 10, 6); ctx.restore();
  vents(ctx, w - 20, 8, 10, 5, TERR.dk); px(ctx, 8, 10, 8, 2, '#6b7684'); ao(ctx, w, h);
};
B.bunker = (ctx, w, h, tm, rng) => {
  ctx.fillStyle = 'rgba(8,10,14,0.55)'; ctx.beginPath(); ctx.ellipse(w / 2, h - 4, w / 2 - 2, 4, 0, 0, 7); ctx.fill();
  block(ctx, 4, 12, w - 8, h - 16, '#79848f', TERR.dk, 4);
  px(ctx, 6, 13, w - 12, 2, 'rgba(255,255,255,0.3)');
  block(ctx, 8, 16, w - 16, 8, '#49525c', '#2a323a', 2); // firing slit
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = 'rgba(255,90,80,0.75)'; ctx.fillRect(10, 19, 6, 2); ctx.fillRect(w - 16, 19, 6, 2); ctx.restore();
  for (let i = 0; i < 4; i++) { px(ctx, 7 + i * ((w - 14) / 4), 13, 2, 2, '#c9ccd4'); } // bolts
  px(ctx, w / 2 - 4, h - 8, 8, 6, TERR.dk2); ao(ctx, w, h);
};
B.controlTower = (ctx, w, h, tm, rng) => {
  block(ctx, 8, 10, w - 16, h - 14, '#8894a6', '#49525c');
  lights(ctx, 11, 13, 3, 5, 'rgba(143,210,255,0.95)', 4, 3);
  mast(ctx, w / 2 - 0.7, 2, 8, tm.col); vents(ctx, w - 16, h - 8, 8, 4, TERR.dk); ao(ctx, w, h);
};

// ---------------- SKARN ----------------
const SKR = { ch0: '#a05c2e', ch1: '#5e3116', dk: '#3a1d0e', bone: '#f0e2c4', flesh: '#7c3f1e' };
B.broodNest = (ctx, w, h, tm, rng) => {
  ctx.fillStyle = 'rgba(20,8,4,0.55)'; ctx.beginPath(); ctx.ellipse(w / 2, h - 6, w / 2 - 4, 7, 0, 0, 7); ctx.fill();
  ctx.beginPath(); ctx.moveTo(4, h - 8); ctx.quadraticCurveTo(w / 2 - 6, 4, w / 2 + 4, 6); ctx.quadraticCurveTo(w - 6, 14, w - 4, h - 8); ctx.closePath();
  ctx.fillStyle = vgrad(ctx, 6, h - 8, '#b06a34', SKR.dk); ctx.fill(); stroke(ctx, 'rgba(12,6,4,0.9)');
  ribs(ctx, w / 2, 16, w - 24, 5, SKR.ch0, SKR.ch1);
  sac(ctx, w / 2 - 14, h - 24, 6, 4.4, '#c8813e', '#6e3a18', 'rgba(200,255,90,0.4)');
  sac(ctx, w / 2 + 12, h - 30, 5, 3.6, '#c8813e', '#6e3a18', 'rgba(200,255,90,0.35)');
  sac(ctx, w / 2 + 2, 14, 4.4, 3.2, '#d99a55', '#7c4020', tm.soft);
  block(ctx, w / 2 - 8, h - 16, 16, 12, '#2a1208', '#160a04', 4); // maw entrance
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = 'rgba(255,120,60,0.4)'; ctx.beginPath(); ctx.ellipse(w / 2, h - 11, 5, 3, 0, 0, 7); ctx.fill(); ctx.restore();
  spur(ctx, 12, h - 18, 14, 1); spur(ctx, w - 12, h - 16, 12, -1);
  speckle(ctx, w, h, rng, 'rgba(30,14,8,0.5)', 30); ao(ctx, w, h);
};
B.geneForge = (ctx, w, h, tm, rng) => {
  ctx.beginPath(); ctx.moveTo(w / 2 - 14, h - 8); ctx.quadraticCurveTo(w / 2 - 10, 8, w / 2 - 2, 2); ctx.quadraticCurveTo(w / 2 + 8, 10, w / 2 + 14, h - 8); ctx.closePath();
  ctx.fillStyle = vgrad(ctx, 2, h - 8, '#9c5a2c', SKR.dk); ctx.fill(); stroke(ctx, 'rgba(12,6,4,0.9)');
  ribs(ctx, w / 2, 12, 22, 4, '#a86430', SKR.ch1);
  sac(ctx, w / 2, h * 0.5, 7, 5.4, '#e0b060', '#8a4a20', 'rgba(200,255,90,0.55)');
  spur(ctx, 10, h - 16, 16); spur(ctx, w - 10, h - 14, 14, -1); spur(ctx, w / 2, 6, 8, 1);
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = 'rgba(200,255,90,0.5)'; ctx.beginPath(); ctx.arc(w / 2 + 10, h - 24, 2.4, 0, 7); ctx.fill(); ctx.restore(); ao(ctx, w, h);
};
B.blightNode = (ctx, w, h, tm, rng) => {
  sac(ctx, w / 2, h / 2 + 2, 10, 8, '#8a4a24', '#331a0c', 'rgba(190,230,80,0.35)');
  ribs(ctx, w / 2, h / 2 - 4, 14, 2, '#a05c2e', '#6b3517');
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = 'rgba(200,255,90,0.6)'; ctx.beginPath(); ctx.arc(w / 2, h / 2, 2, 0, 7); ctx.fill(); ctx.restore(); ao(ctx, w, h);
};
B.clawPit = (ctx, w, h, tm, rng) => {
  ctx.beginPath(); ctx.ellipse(w / 2, h / 2, w / 2 - 4, h / 2 - 4, 0, 0, 7); ctx.fillStyle = vgrad(ctx, 4, h - 4, '#8a4a24', '#2a1408'); ctx.fill(); stroke(ctx, 'rgba(12,6,4,0.9)');
  ctx.beginPath(); ctx.ellipse(w / 2, h / 2 + 2, 9, 6, 0, 0, 7); ctx.fillStyle = '#160a04'; ctx.fill(); // pit mouth
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; spur(ctx, w / 2 + Math.cos(a) * 11, h / 2 + Math.sin(a) * 7.4, 5, Math.cos(a) > 0 ? 1 : -1); }
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = tm.soft; ctx.beginPath(); ctx.arc(w / 2, h / 2 + 3, 2.4, 0, 7); ctx.fill(); ctx.restore(); ao(ctx, w, h);
};
B.spineWarren = (ctx, w, h, tm, rng) => {
  ctx.beginPath(); ctx.moveTo(4, h - 6); ctx.quadraticCurveTo(w / 2, 2, w - 4, h - 6); ctx.closePath(); ctx.fillStyle = vgrad(ctx, 4, h - 6, '#8f5128', '#38190b'); ctx.fill(); stroke(ctx, 'rgba(12,6,4,0.9)');
  for (let i = 0; i < 6; i++) spur(ctx, 8 + i * ((w - 16) / 5), h - 12 - (i % 3) * 4, 8 + (i % 2) * 5, i % 2 ? 1 : -1);
  block(ctx, w / 2 - 7, h - 14, 14, 10, '#180b05', '#0c0603', 3);
  lights(ctx, w / 2 - 4, h - 10, 2, 5, 'rgba(200,255,90,0.7)', 3, 2); ao(ctx, w, h);
};
B.aerie = (ctx, w, h, tm, rng) => {
  ctx.beginPath(); ctx.moveTo(w / 2 - 12, h - 6); ctx.quadraticCurveTo(w / 2 - 14, 10, w / 2 - 4, 4); ctx.quadraticCurveTo(w / 2 + 8, 0, w / 2 + 12, 12); ctx.quadraticCurveTo(w / 2 + 13, h - 8, w / 2 + 10, h - 6); ctx.closePath();
  ctx.fillStyle = vgrad(ctx, 2, h - 6, '#9c5a2c', '#33170a'); ctx.fill(); stroke(ctx, 'rgba(12,6,4,0.9)');
  ctx.beginPath(); ctx.ellipse(w / 2 + 2, 16, 7, 5, 0, 0, 7); ctx.fillStyle = '#1a0c05'; ctx.fill(); stroke(ctx, 'rgba(10,5,3,0.8)'); // nest hole
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = 'rgba(140,220,255,0.4)'; ctx.beginPath(); ctx.ellipse(w / 2 + 2, 17, 4, 2.4, 0, 0, 7); ctx.fill(); ctx.restore();
  spur(ctx, 14, h - 14, 12); spur(ctx, w - 12, h - 10, 10, -1);
  ctx.strokeStyle = 'rgba(220,180,120,0.6)'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(w / 2 - 12, 22); ctx.quadraticCurveTo(w / 2 - 22, 18, w / 2 - 18, 12); ctx.stroke(); // wing arch ao(ctx, w, h);
  ao(ctx, w, h);
};
B.hive = (ctx, w, h, tm, rng) => {
  ctx.fillStyle = 'rgba(20,8,4,0.6)'; ctx.beginPath(); ctx.ellipse(w / 2, h - 5, w / 2 - 3, 6, 0, 0, 7); ctx.fill();
  ctx.beginPath(); ctx.moveTo(4, h - 8); ctx.quadraticCurveTo(8, 12, w / 2 - 6, 8); ctx.quadraticCurveTo(w / 2 + 10, 4, w - 8, 16); ctx.quadraticCurveTo(w - 2, 26, w - 4, h - 8); ctx.closePath();
  ctx.fillStyle = vgrad(ctx, 6, h - 8, '#b06a34', '#2e1509'); ctx.fill(); stroke(ctx, 'rgba(12,6,4,0.9)');
  dome(ctx, w / 2 - 18, 22, 9, '#c8813e', '#6e3a18'); dome(ctx, w / 2 + 16, 26, 8, '#b87338', '#5e3116'); dome(ctx, w / 2 - 2, 14, 11, '#d99a55', '#7c4020');
  ribs(ctx, w / 2, 30, w - 30, 3, '#a05c2e', '#6b3517');
  sac(ctx, w / 2 - 22, h - 22, 6, 4, '#c8813e', '#6e3a18', 'rgba(200,255,90,0.5)');
  sac(ctx, w / 2 + 20, h - 18, 5, 3.6, '#c8813e', '#6e3a18', 'rgba(200,255,90,0.45)');
  for (let i = 0; i < 4; i++) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = tm.soft; ctx.beginPath(); ctx.arc(14 + i * ((w - 28) / 3), h - 14, 2, 0, 7); ctx.fill(); ctx.restore(); }
  spur(ctx, 8, h - 20, 16); spur(ctx, w - 8, h - 18, 14, -1); ao(ctx, w, h);
};
B.deepWarren = (ctx, w, h, tm, rng) => {
  ctx.beginPath(); ctx.moveTo(4, h - 6); ctx.quadraticCurveTo(w / 2 - 4, 14, w - 4, h - 6); ctx.closePath(); ctx.fillStyle = vgrad(ctx, 14, h - 6, '#8a4a24', '#2c1408'); ctx.fill(); stroke(ctx, 'rgba(12,6,4,0.9)');
  block(ctx, 10, h / 2 - 2, 12, 10, '#180b05', '#0c0603', 4); block(ctx, w - 24, h / 2 + 2, 12, 10, '#180b05', '#0c0603', 4); // tunnel mouths
  lights(ctx, 13, h / 2 + 2, 2, 5, 'rgba(200,255,90,0.6)', 3, 2);
  ribs(ctx, w / 2, 20, w - 26, 3, '#96522a', '#61331a'); speckle(ctx, w, h, rng, 'rgba(30,14,8,0.5)', 24); ao(ctx, w, h);
};
B.tremorCavern = (ctx, w, h, tm, rng) => {
  block(ctx, 6, 14, w - 12, h - 20, '#6b6157', '#332c24'); // rocky
  speckle(ctx, w, h, rng, 'rgba(20,16,12,0.6)', 34);
  block(ctx, w / 2 - 10, h - 16, 20, 14, '#161008', '#0a0603', 2); // heavy doors
  px(ctx, w / 2 - 10, h - 10, 20, 2, '#8f8578');
  ctx.beginPath(); ctx.moveTo(w / 2 - 16, 12); ctx.quadraticCurveTo(w / 2 - 20, 2, w / 2 - 12, 4); ctx.quadraticCurveTo(w / 2 - 16, 10, w / 2 - 12, 12); ctx.closePath(); ctx.fillStyle = SKR.bone; ctx.fill(); // tusk gate L
  ctx.beginPath(); ctx.moveTo(w / 2 + 16, 12); ctx.quadraticCurveTo(w / 2 + 20, 2, w / 2 + 12, 4); ctx.quadraticCurveTo(w / 2 + 16, 10, w / 2 + 12, 12); ctx.closePath(); ctx.fillStyle = SKR.bone; ctx.fill();
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = tm.soft; ctx.fillRect(w / 2 - 3, h - 13, 6, 3); ctx.restore(); ao(ctx, w, h);
};
B.stingerColony = (ctx, w, h, tm, rng) => {
  sac(ctx, w / 2, h / 2 + 3, 10, 7, '#8f5128', '#33170a', 'rgba(190,230,80,0.3)');
  for (let i = 0; i < 3; i++) cyl(ctx, w / 2 - 8 + i * 8, 8, 5, 12, '#6e3a18', '#b87338', '#d99a55'); // launch tubes
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; for (let i = 0; i < 3; i++) { ctx.fillStyle = 'rgba(200,255,90,0.6)'; ctx.beginPath(); ctx.arc(w / 2 - 8 + i * 8, 8, 1.8, 0, 7); ctx.fill(); } ctx.restore();
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = tm.soft; ctx.beginPath(); ctx.arc(w / 2, h - 8, 2, 0, 7); ctx.fill(); ctx.restore(); ao(ctx, w, h);
};
B.gasSiphon = (ctx, w, h, tm, rng) => {
  ctx.fillStyle = 'rgba(20,8,4,0.5)'; ctx.beginPath(); ctx.ellipse(w / 2, h - 6, 16, 5, 0, 0, 7); ctx.fill();
  cyl(ctx, w / 2 - 14, 12, 10, h - 22, '#4a2410', '#96522a', '#c8813e'); cyl(ctx, w / 2 + 14, 10, 10, h - 20, '#4a2410', '#96522a', '#c8813e'); // stalks
  sac(ctx, w / 2, 16, 8, 6, '#d99a55', '#7c4020', 'rgba(74,255,200,0.45)'); // siphon bulb over geyser
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = 'rgba(74,255,200,0.5)'; ctx.fillRect(w / 2 - 1, 22, 2, h - 34); ctx.restore(); // gas feed line
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = tm.soft; ctx.beginPath(); ctx.arc(w / 2 + 14, 10, 2, 0, 7); ctx.fill(); ctx.restore(); ao(ctx, w, h);
};

// ---------------- AURAXIS ----------------
const AUR = { st0: '#c8a86a', st1: '#8a7440', dk: '#42392a', rune: 'rgba(122,215,255,', crys: '#cfe6ff' };
B.aegis = (ctx, w, h, tm, rng) => {
  ctx.fillStyle = 'rgba(10,12,20,0.5)'; ctx.beginPath(); ctx.ellipse(w / 2, h - 6, w / 2 - 8, 7, 0, 0, 7); ctx.fill();
  // wing walls (stepped)
  for (let i = 0; i < 3; i++) block(ctx, 8 + i * 6, 26 - i * 4, 12, 12 + i * 4, AUR.st0, AUR.dk, 1);
  for (let i = 0; i < 3; i++) block(ctx, w - 20 - i * 6, 26 - i * 4, 12, 12 + i * 4, AUR.st0, AUR.dk, 1);
  block(ctx, 12, 30, w - 24, h - 42, '#b3945c', '#5c4c28');                // main hall
  px(ctx, 12, 30, w - 24, 2, 'rgba(255,240,200,0.4)');
  block(ctx, w / 2 - 16, 12, 32, 22, '#cdb077', '#75613a');                 // sanctum
  side(ctx, w / 2 + 16, 12, 22, 5, AUR.dk);
  block(ctx, w / 2 - 9, 0, 18, 14, '#e0c488', '#8a7440', 3);                // crown
  px(ctx, w / 2 - 9, 1, 18, 2, 'rgba(255,250,230,0.5)');
  spire(ctx, w / 2 - 26, 30, 26, 8, '#e0c488', '#6e5a30', AUR.rune + '0.8)');
  spire(ctx, w / 2 + 26, 30, 22, 8, '#e0c488', '#6e5a30', AUR.rune + '0.8)');
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  const g = ctx.createLinearGradient(0, 2, 0, h - 20); g.addColorStop(0, AUR.rune + '0.5)'); g.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = g; ctx.fillRect(w / 2 - 5, 2, 10, h - 26); ctx.restore(); // pylon beam
  runes(ctx, 14, 34, w - 28, h - 52, AUR.rune + '0.6)', rng, 12);
  lights(ctx, w / 2 - 12, h - 22, 5, 6, 'rgba(122,215,255,0.95)', 4, 3); ao(ctx, w, h);
};
B.conduit = (ctx, w, h, tm, rng) => {
  block(ctx, w / 2 - 6, h - 12, 12, 10, '#8a7440', AUR.dk, 2); // base
  spire(ctx, w / 2, h - 8, h - 12, 9, AUR.crys, '#4a6a8f', AUR.rune + '0.9)');
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; const g = ctx.createRadialGradient(w / 2, h / 2, 1, w / 2, h / 2, 14); g.addColorStop(0, AUR.rune + '0.55)'); g.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, w, h); ctx.restore();
  px(ctx, w / 2 - 0.8, 2, 1.6, 6, AUR.rune + '0.9)'); ao(ctx, w, h);
};
B.essenceTap = (ctx, w, h, tm, rng) => {
  block(ctx, w / 2 - 12, h - 16, 24, 12, '#b3945c', '#5c4c28', 2);        // collector ring base
  ctx.strokeStyle = '#e0c488'; ctx.lineWidth = 2.4; ctx.beginPath(); ctx.ellipse(w / 2, h / 2, 14, 7, 0, 0, 7); ctx.stroke(); // hover ring
  ctx.strokeStyle = AUR.rune + '0.8)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(w / 2, h / 2 - 1, 11, 5, 0, 0, 7); ctx.stroke();
  spire(ctx, w / 2, h / 2 + 2, 18, 7, AUR.crys, '#4a6a8f', AUR.rune + '0.9)');
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = 'rgba(74,255,200,0.5)'; ctx.fillRect(w / 2 - 1, h / 2 + 2, 2, h / 2 - 16); ctx.restore();
  lights(ctx, w / 2 - 8, h - 12, 3, 6, tm.soft, 4, 2); ao(ctx, w, h);
};
B.portal = (ctx, w, h, tm, rng) => {
  ctx.beginPath(); ctx.ellipse(w / 2, h / 2 - 2, 12, 13, 0, 0, 7); ctx.fillStyle = vgrad(ctx, 4, h - 8, '#cdb077', '#5c4c28'); ctx.fill(); stroke(ctx, OL);
  ctx.beginPath(); ctx.ellipse(w / 2, h / 2 - 2, 8, 9, 0, 0, 7); ctx.fillStyle = AUR.rune + '0.28)'; ctx.fill();
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; const g = ctx.createRadialGradient(w / 2, h / 2, 0.5, w / 2, h / 2, 9); g.addColorStop(0, AUR.rune + '0.85)'); g.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = g; ctx.fill(); ctx.restore();
  block(ctx, 10, h - 12, 8, 10, '#b3945c', '#5c4c28', 1); block(ctx, w - 18, h - 12, 8, 10, '#b3945c', '#5c4c28', 1); // guardian statues hint
  px(ctx, 12.4, h - 10, 2.6, 4, AUR.rune + '0.8)'); px(ctx, w - 15.6, h - 10, 2.6, 4, AUR.rune + '0.8)');
  spire(ctx, w / 2 - 15, 12, 10, 5, AUR.crys, '#4a6a8f'); spire(ctx, w / 2 + 15, 12, 10, 5, AUR.crys, '#4a6a8f'); ao(ctx, w, h);
};
B.fabricator = (ctx, w, h, tm, rng) => {
  block(ctx, 10, 20, w - 20, h - 30, '#bfa166', '#66542e'); px(ctx, 10, 20, w - 20, 2, 'rgba(255,240,200,0.4)');
  block(ctx, w / 2 - 14, h - 18, 28, 14, '#574727', '#33291a', 1);         // forge mouth
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; const g = ctx.createRadialGradient(w / 2, h - 10, 1, w / 2, h - 10, 15); g.addColorStop(0, 'rgba(120,220,255,0.55)'); g.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = g; ctx.fillRect(w / 2 - 16, h - 22, 32, 22); ctx.restore();
  for (let i = 0; i < 3; i++) spire(ctx, w / 2 - 16 + i * 16, 20, 12, 5, AUR.crys, '#4a6a8f');
  runes(ctx, 12, 24, w - 24, 12, AUR.rune + '0.5)', rng, 8); ao(ctx, w, h);
};
B.synapseCore = (ctx, w, h, tm, rng) => {
  ctx.strokeStyle = '#cdb077'; ctx.lineWidth = 2.6; ctx.beginPath(); ctx.arc(w / 2, h / 2, 11, 0, 7); ctx.stroke(); // ring
  ctx.strokeStyle = OL; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.arc(w / 2, h / 2, 12.4, 0, 7); ctx.stroke();
  sac(ctx, w / 2, h / 2, 8, 7, '#9fb8d8', '#41608a', AUR.rune + '0.5)');   // psionic brain core
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; const g = ctx.createRadialGradient(w / 2, h / 2 - 8, 0.5, w / 2, h / 2 - 8, 6); g.addColorStop(0, AUR.rune + '0.7)'); g.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = g; ctx.fillRect(w / 2 - 7, h / 2 - 15, 14, 14); ctx.restore(); ao(ctx, w, h);
};
B.runeworks = (ctx, w, h, tm, rng) => {
  block(ctx, 8, 22, w - 16, h - 30, '#c3a564', '#5c4c28'); px(ctx, 8, 22, w - 16, 2, 'rgba(255,240,200,0.45)');
  runes(ctx, 12, 26, w - 24, h - 38, AUR.rune + '0.75)', rng, 14);
  spire(ctx, w / 2 - 10, 22, 14, 4, AUR.crys, '#4a6a8f'); spire(ctx, w / 2 + 10, 22, 14, 4, AUR.crys, '#4a6a8f');
  lights(ctx, w / 2 - 6, h - 14, 3, 5, 'rgba(122,215,255,0.9)', 3, 2); ao(ctx, w, h);
};
B.psiVault = (ctx, w, h, tm, rng) => {
  block(ctx, 10, 24, w - 20, h - 32, '#b8965e', '#4c3d22'); px(ctx, 10, 24, w - 20, 2, 'rgba(255,240,200,0.4)');
  dome(ctx, w / 2, 22, 10, '#cfe0f2', '#54749c');
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; for (let i = 0; i < 3; i++) { ctx.fillStyle = AUR.rune + '0.5)'; ctx.beginPath(); ctx.ellipse(w / 2, 20 - i * 4, 6 - i, 2, 0, 0, 7); ctx.fill(); } ctx.restore(); // hovering shard rings
  runes(ctx, 12, 28, w - 24, h - 42, AUR.rune + '0.7)', rng, 10); ao(ctx, w, h);
};
B.convocation = (ctx, w, h, tm, rng) => {
  spire(ctx, w / 2 - 12, h - 12, 34, 9, '#d8bc80', '#6e5a30', AUR.rune + '0.7)');
  spire(ctx, w / 2 + 12, h - 12, 30, 9, '#d8bc80', '#6e5a30', AUR.rune + '0.7)');
  spire(ctx, w / 2, h - 10, 44, 11, '#ead298', '#8a7440', AUR.rune + '0.9)');
  ctx.strokeStyle = 'rgba(122,215,255,0.5)'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(w / 2 - 14, h - 26); ctx.quadraticCurveTo(w / 2, h - 34, w / 2 + 14, h - 26); ctx.stroke(); // energy bridge
  block(ctx, w / 2 - 14, h - 14, 28, 10, '#b3945c', '#5c4c28', 2); lights(ctx, w / 2 - 9, h - 11, 4, 5, 'rgba(122,215,255,0.95)', 3, 2); ao(ctx, w, h);
};
B.skyPortal = (ctx, w, h, tm, rng) => {
  block(ctx, 12, h - 22, w - 24, 16, '#bfa166', '#5c4c28'); px(ctx, 12, h - 22, w - 24, 2, 'rgba(255,240,200,0.45)');
  spire(ctx, w / 2, 12, 12, 16, '#d8bc80', '#75613a', AUR.rune + '0.8)');
  ctx.strokeStyle = '#e0c488'; ctx.lineWidth = 2.2; ctx.beginPath(); ctx.ellipse(w / 2, 12, 14, 4.4, 0, 0, 7); ctx.stroke(); // launch ring
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; const g = ctx.createRadialGradient(w / 2, 12, 1, w / 2, 12, 12); g.addColorStop(0, AUR.rune + '0.6)'); g.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = g; ctx.fill(); ctx.restore();
  lights(ctx, 18, h - 16, ((w - 36) / 8) | 0, 8, 'rgba(122,215,255,0.9)', 4, 2); spire(ctx, 10, h - 8, 16, 5, AUR.crys, '#4a6a8f'); spire(ctx, w - 10, h - 8, 16, 5, AUR.crys, '#4a6a8f'); ao(ctx, w, h);
};
B.lanceTurret = (ctx, w, h, tm, rng) => {
  block(ctx, 8, 18, w - 16, h - 24, '#b8965e', '#4c3d22', 3);
  spire(ctx, w / 2, 16, 14, 8, '#cfe0f2', '#4a6a8f', AUR.rune + '0.9)');
  ctx.strokeStyle = AUR.rune + '0.7)'; ctx.lineWidth = 1.6;
  ctx.beginPath(); ctx.moveTo(w / 2 - 9, h / 2 + 4); ctx.lineTo(w / 2 - 2, h / 2 - 4); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(w / 2 + 9, h / 2 + 4); ctx.lineTo(w / 2 + 2, h / 2 - 4); ctx.stroke(); // hover lance barrels
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = 'rgba(122,215,255,0.8)'; ctx.beginPath(); ctx.arc(w / 2, h / 2 - 6, 2, 0, 7); ctx.fill(); ctx.restore(); ao(ctx, w, h);
};
B.forge = (ctx, w, h, tm, rng) => {
  block(ctx, 8, 14, w - 16, h - 20, '#c3a564', '#5c4c28'); px(ctx, 8, 14, w - 16, 2, 'rgba(255,240,200,0.45)');
  block(ctx, 12, h - 12, w - 24, 8, '#33291a', '#1c160c', 1); ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = 'rgba(120,220,255,0.45)'; ctx.fillRect(13, h - 11, w - 26, 6); ctx.restore();
  spire(ctx, w / 2, 14, 10, 5, AUR.crys, '#4a6a8f'); runes(ctx, 10, 18, w - 20, 8, AUR.rune + '0.6)', rng, 6); ao(ctx, w, h);
};
B.skyAnchor = (ctx, w, h, tm, rng) => {
  block(ctx, w / 2 - 5, 14, 10, h - 20, '#cdb077', '#66542e');
  ctx.strokeStyle = '#e0c488'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(w / 2, 12, 10, 3.6, 0, 0, 7); ctx.stroke();
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; const g = ctx.createRadialGradient(w / 2, 12, 0.5, w / 2, 12, 10); g.addColorStop(0, AUR.rune + '0.7)'); g.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = g; ctx.fill(); ctx.restore();
  spire(ctx, w / 2 - 12, h - 6, 14, 5, AUR.crys, '#4a6a8f'); spire(ctx, w / 2 + 12, h - 6, 14, 5, AUR.crys, '#4a6a8f'); ao(ctx, w, h);
};

export const SIZES = { supplyDepot: [2, 2], refinery: [4, 3], barracks: [4, 3], factory: [4, 3], starport: [4, 3], academy: [3, 3], missileTurret: [2, 2], engineeringBay: [2, 2], scienceFacility: [4, 3], machineShop: [2, 2], bunker: [2, 2],
  geneForge: [3, 3], clawPit: [3, 3], spineWarren: [3, 3], aerie: [3, 3], tremorCavern: [3, 3], stingerColony: [2, 2], gasSiphon: [4, 3], deepWarren: [4, 4], hive: [4, 4], blightNode: [2, 2],
  conduit: [2, 2], portal: [3, 3], fabricator: [4, 3], synapseCore: [3, 3], runeworks: [3, 3], psiVault: [3, 3], convocation: [3, 3], skyPortal: [4, 3], lanceTurret: [2, 2], forge: [2, 2], essenceTap: [4, 3], skyAnchor: [3, 3], controlTower: [2, 2] };

export function createBuildingsAAA(scene) {
  const sizes = { commandCenter: [5, 4], supplyDepot: [2, 2], refinery: [4, 3], barracks: [4, 3], factory: [4, 3], starport: [4, 3], academy: [3, 3], missileTurret: [2, 2], engineeringBay: [2, 2], scienceFacility: [4, 3], machineShop: [2, 2], bunker: [2, 2], controlTower: [2, 2], broodNest: [4, 4], blightNode: [2, 2], geneForge: [3, 3], clawPit: [3, 3], spineWarren: [3, 3], aerie: [3, 3], tremorCavern: [3, 3], stingerColony: [2, 2], gasSiphon: [4, 3], deepWarren: [4, 4], hive: [4, 4], aegis: [5, 4], conduit: [2, 2], essenceTap: [4, 3], portal: [3, 3], fabricator: [4, 3], synapseCore: [3, 3], runeworks: [3, 3], psiVault: [3, 3], convocation: [3, 3], skyPortal: [4, 3], lanceTurret: [2, 2], forge: [2, 2], skyAnchor: [3, 3] };
  // 2x supersampled onto the 16px world grid: canvas = 32*tw, sprite scales to footprint
  const SS = 2;
  for (const [bid, [tw, th]] of Object.entries(sizes)) {
    const fn = B[bid];
    if (!fn) continue;
    for (let team = 0; team < 3; team++) {
      const key = `b-${bid}-t${team}`;
      if (scene.textures.exists(key)) scene.textures.remove(key);
      const canvas = document.createElement('canvas');
      canvas.width = tw * T * SS; canvas.height = th * T * SS;
      const ctx = canvas.getContext('2d');
      ctx.scale(SS, SS);
      const rng = seedRand(bid + '-' + team);
      const tm = [{ col: '#4ea1ff', lit: 'rgba(120,190,255,0.9)', soft: 'rgba(120,190,255,0.55)' }, { col: '#ff7b2e', lit: 'rgba(255,150,80,0.9)', soft: 'rgba(255,150,80,0.55)' }, { col: '#ff4fa3', lit: 'rgba(255,110,180,0.9)', soft: 'rgba(255,110,180,0.55)' }][team];
      try { fn(ctx, tw * T, th * T, tm, rng); } catch (e) { console.warn('bld-art', bid, String(e)); }
      scene.textures.addCanvas(key, canvas);
      try { scene.textures.get(key).setFilter(Phaser.Textures.FilterMode.LINEAR); } catch (e) { /* older phaser */ }
      const src = scene.textures.get(key).getSourceImage();
      src.style.imageRendering = 'auto';
    }
  }
}
