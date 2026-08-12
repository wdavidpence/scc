import Phaser from 'phaser';

// Procedural texture generator — all game assets drawn on canvas.
// No external spritesheets needed; fully self-contained and deployable.

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

function createTex(scene, key, w, h, draw) {
  if (scene.textures.exists(key)) return;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  draw(ctx, w, h);
  scene.textures.addCanvas(key, canvas);
}

// ── TERRAN (industrial/mech aesthetic) ─────────────────────────────────
function terranScv(ctx, w, h) {
  // Heavy mech suit — boxy body + drill arm + backpack thruster
  const cx = w / 2;
  // Legs / treads
  ctx.fillStyle = '#2d4a6f'; rrect(ctx, 8, h - 10, w - 16, 8, 2); ctx.fill();
  // Body armor plate
  ctx.fillStyle = '#4a7ab5'; rrect(ctx, cx - 12, h - 36, 24, 20, 3); ctx.fill();
  // Shoulder pads
  ctx.fillStyle = '#5a8ac5'; rrect(ctx, cx - 16, h - 38, 8, 8, 2); ctx.fill();
  rrect(ctx, cx + 8, h - 38, 8, 8, 2); ctx.fill();
  // Helmet dome
  ctx.fillStyle = '#6ba3d9'; ctx.beginPath(); ctx.arc(cx, h - 42, 10, Math.PI, 0); ctx.fill();
  // Visor (glowing cyan)
  ctx.fillStyle = '#00e5ff'; rrect(ctx, cx - 7, h - 46, 14, 5, 2); ctx.fill();
  // Drill arm (right)
  ctx.fillStyle = '#8d6e3f'; rrect(ctx, cx + 14, h - 32, 10, 5, 2); ctx.fill();
  // Drill tip (spiral)
  ctx.fillStyle = '#d4a017'; rrect(ctx, cx + 22, h - 36, 4, 10, 1); ctx.fill();
  // Backpack thruster (left)
  ctx.fillStyle = '#3d5a7f'; rrect(ctx, cx - 18, h - 34, 6, 12, 2); ctx.fill();
}

function terranMarine(ctx, w, h) {
  const cx = w / 2;
  // Boots
  ctx.fillStyle = '#3d5a7f'; rrect(ctx, cx - 10, h - 8, 8, 6, 2); ctx.fill();
  rrect(ctx, cx + 2, h - 8, 8, 6, 2); ctx.fill();
  // Body armor (marine green)
  ctx.fillStyle = '#4a7ab5'; rrect(ctx, cx - 10, h - 32, 20, 22, 4); ctx.fill();
  // Chest plate detail
  ctx.fillStyle = '#5a8ac5'; rrect(ctx, cx - 6, h - 28, 12, 6, 2); ctx.fill();
  // Helmet with visor
  ctx.fillStyle = '#4a7ab5'; ctx.beginPath(); ctx.arc(cx, h - 38, 10, Math.PI, 0); ctx.fill();
  ctx.fillStyle = '#00ff88'; rrect(ctx, cx - 7, h - 42, 14, 5, 2); ctx.fill();
  // Rifle (right side)
  ctx.fillStyle = '#607d8b'; rrect(ctx, cx + 10, h - 26, 14, 5, 2); ctx.fill();
  // Rifle barrel
  ctx.fillStyle = '#90a4ae'; rrect(ctx, cx + 22, h - 28, 5, 9, 1); ctx.fill();
}

function terranMarauder(ctx, w, h) {
  const cx = w / 2;
  // Heavy boots
  ctx.fillStyle = '#2d4a6f'; rrect(ctx, cx - 14, h - 8, 12, 6, 2); ctx.fill();
  rrect(ctx, cx + 2, h - 8, 12, 6, 2); ctx.fill();
  // Heavy body armor (dark blue)
  ctx.fillStyle = '#3a5d8e'; rrect(ctx, cx - 14, h - 40, 28, 30, 5); ctx.fill();
  // Chest armor plate (large)
  ctx.fillStyle = '#4a7ab5'; rrect(ctx, cx - 10, h - 36, 20, 14, 3); ctx.fill();
  // Shoulder pads (bulky)
  ctx.fillStyle = '#5a8ac5'; rrect(ctx, cx - 18, h - 42, 10, 8, 3); ctx.fill();
  rrect(ctx, cx + 8, h - 42, 10, 8, 3); ctx.fill();
  // Helmet (large, angular)
  ctx.fillStyle = '#3a5d8e'; ctx.beginPath(); ctx.arc(cx, h - 48, 13, Math.PI, 0); ctx.fill();
  // Red visor (aggressive)
  ctx.fillStyle = '#ff4444'; rrect(ctx, cx - 9, h - 52, 18, 6, 3); ctx.fill();
  // Dual cannons (large)
  ctx.fillStyle = '#8d6e3f'; rrect(ctx, cx + 14, h - 32, 16, 8, 3); ctx.fill();
  // Cannon barrel (heavy)
  ctx.fillStyle = '#b8860b'; rrect(ctx, cx + 28, h - 34, 6, 12, 2); ctx.fill();
}

function terranCommandCenter(ctx, w, h) {
  // Foundation platform
  ctx.fillStyle = '#0f172a'; rrect(ctx, 4, h - 8, w - 8, 6, 2); ctx.fill();
  // Main structure body (dark blue)
  ctx.fillStyle = '#1e3a5f'; rrect(ctx, 8, h - 40, w - 16, 32, 5); ctx.fill();
  // Top tier (lighter blue)
  ctx.fillStyle = '#2563eb'; rrect(ctx, 14, h - 58, w - 28, 20, 4); ctx.fill();
  // Windows (cyan glow)
  ctx.fillStyle = '#60a5fa'; rrect(ctx, 20, h - 54, 16, 10, 2); ctx.fill();
  rrect(ctx, w - 40, h - 54, 16, 10, 2); ctx.fill();
  // Window light beams (horizontal)
  ctx.fillStyle = '#93c5fd'; rrect(ctx, 22, h - 49, 12, 2, 0); ctx.fill();
  rrect(ctx, w - 38, h - 49, 12, 2, 0); ctx.fill();
  // Antenna mast
  ctx.fillStyle = '#3b82f6'; rrect(ctx, w / 2 - 1, h - 74, 3, 18, 0); ctx.fill();
  // Antenna tip (blinking light)
  ctx.fillStyle = '#fbbf24'; ctx.beginPath(); ctx.arc(w / 2 + 0.5, h - 76, 4, 0, Math.PI * 2); ctx.fill();
  // Side panels (steel)
  ctx.fillStyle = '#374151'; rrect(ctx, 6, h - 32, 8, 24, 2); ctx.fill();
  rrect(ctx, w - 14, h - 32, 8, 24, 2); ctx.fill();
}

function terranBarracks(ctx, w, h) {
  ctx.fillStyle = '#1e3a5f'; rrect(ctx, 4, h - 6, w - 8, 4, 2); ctx.fill();
  // Main body
  ctx.fillStyle = '#2563eb'; rrect(ctx, 8, h - 38, w - 16, 30, 4); ctx.fill();
  // Roof (angled)
  ctx.fillStyle = '#3b82f6'; rrect(ctx, 10, h - 48, w - 20, 12, 3); ctx.fill();
  // Door (large opening)
  ctx.fillStyle = '#0f172a'; rrect(ctx, w / 2 - 8, h - 16, 16, 14, 2); ctx.fill();
  // Door frame (yellow stripe)
  ctx.fillStyle = '#fbbf24'; rrect(ctx, w / 2 - 10, h - 46, 20, 3, 1); ctx.fill();
}

function terranFactory(ctx, w, h) {
  ctx.fillStyle = '#1e3a5f'; rrect(ctx, 4, h - 6, w - 8, 4, 2); ctx.fill();
  // Main body (dark purple)
  ctx.fillStyle = '#3a2d6e'; rrect(ctx, 8, h - 40, w - 16, 32, 4); ctx.fill();
  // Top section (light purple)
  ctx.fillStyle = '#7c3aed'; rrect(ctx, 10, h - 52, w - 20, 14, 3); ctx.fill();
  // Chimney (smokestack)
  ctx.fillStyle = '#4b5563'; rrect(ctx, w - 20, h - 64, 10, 18, 2); ctx.fill();
  // Chimney cap
  ctx.fillStyle = '#6b7280'; rrect(ctx, w - 22, h - 68, 14, 5, 2); ctx.fill();
}

// ── ZERG (organic/bio aesthetic) ───────────────────────────────────────
function zergDrone(ctx, w, h) {
  const cx = w / 2;
  // Organic base (dark brown bulb)
  ctx.fillStyle = '#5c3a1e'; ellipse(ctx, cx, h - 8, w / 2 - 4, 6);
  // Body (orange)
  ctx.fillStyle = '#c2410c'; ellipse(ctx, cx, h - 26, w / 3 + 2, 14);
  // Head (bulbous)
  ctx.fillStyle = '#ea580c'; ellipse(ctx, cx, h - 46, 11, 9);
  // Mandibles (jaws)
  ctx.fillStyle = '#7c2d12'; rrect(ctx, cx - 8, h - 36, 5, 4, 1); ctx.fill();
  rrect(ctx, cx + 3, h - 36, 5, 4, 1); ctx.fill();
  // Eyes (glowing amber)
  ctx.fillStyle = '#fbbf24';
  ctx.beginPath(); ctx.arc(cx - 5, h - 48, 3, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(cx + 5, h - 48, 3, 0, Math.PI * 2); ctx.fill();
  // Eye highlights
  ctx.fillStyle = '#fef3c7';
  ctx.beginPath(); ctx.arc(cx - 4, h - 49, 1, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(cx + 6, h - 49, 1, 0, Math.PI * 2); ctx.fill();
  // Claws (left + right)
  ctx.fillStyle = '#9a3412'; rrect(ctx, cx - 20, h - 26, 8, 4, 1); ctx.fill();
  rrect(ctx, cx + 12, h - 26, 8, 4, 1); ctx.fill();
}

function zergZergling(ctx, w, h) {
  const cx = w / 2;
  // Low body (dark orange)
  ctx.fillStyle = '#7c2d12'; ellipse(ctx, cx, h - 8, w / 2 - 3, 6);
  // Torso (orange)
  ctx.fillStyle = '#ea580c'; ellipse(ctx, cx + 2, h - 24, w / 3, 16);
  // Head (aggressive)
  ctx.fillStyle = '#f97316'; ellipse(ctx, cx + 4, h - 44, 10, 8);
  // Fangs (white)
  ctx.fillStyle = '#fef3c7'; rrect(ctx, cx - 2, h - 40, 3, 8, 1); ctx.fill();
  rrect(ctx, cx + 5, h - 40, 3, 8, 1); ctx.fill();
  // Eyes (glowing amber)
  ctx.fillStyle = '#fbbf24';
  ctx.beginPath(); ctx.arc(cx, h - 46, 3, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(cx + 8, h - 46, 3, 0, Math.PI * 2); ctx.fill();
  // Claws (extending right)
  ctx.fillStyle = '#9a3412'; rrect(ctx, cx + 18, h - 26, 10, 4, 2); ctx.fill();
}

function zergHydralisk(ctx, w, h) {
  const cx = w / 2;
  // Base (dark green)
  ctx.fillStyle = '#16a34a'; ellipse(ctx, cx, h - 8, w / 2 - 4, 6);
  // Tall body (green)
  ctx.fillStyle = '#15803d'; ellipse(ctx, cx - 2, h - 34, w / 3 + 2, 20);
  // Neck (thick)
  ctx.fillStyle = '#16a34a'; ellipse(ctx, cx - 2, h - 54, 8, 10);
  // Head (with spikes)
  ctx.fillStyle = '#2d5a1e'; ellipse(ctx, cx, h - 62, 12, 9);
  // Spikes on back (purple)
  for (let i = 0; i < 4; i++) {
    ctx.fillStyle = '#a855f7';
    const sy = h - 20 - i * 8;
    ctx.beginPath();
    ctx.moveTo(cx + 12, sy);
    ctx.lineTo(cx + 20, sy - 5);
    ctx.lineTo(cx + 12, sy + 3);
    ctx.fill();
  }
  // Cannon (right side, purple barrel)
  ctx.fillStyle = '#2d5a1e'; rrect(ctx, cx + 14, h - 42, 16, 8, 3); ctx.fill();
  // Cannon tip (glowing purple)
  ctx.fillStyle = '#a855f7'; ctx.beginPath(); ctx.arc(cx + 28, h - 38, 5, 0, Math.PI * 2); ctx.fill();
  // Eyes (glowing amber)
  ctx.fillStyle = '#fbbf24';
  ctx.beginPath(); ctx.arc(cx - 6, h - 64, 3, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(cx + 6, h - 64, 3, 0, Math.PI * 2); ctx.fill();
}

function zergHatchery(ctx, w, h) {
  // Organic base platform
  ctx.fillStyle = '#1a0f08'; rrect(ctx, 4, h - 6, w - 8, 4, 2); ctx.fill();
  // Main body (dark brown bulb)
  ctx.fillStyle = '#5c3a1e'; ellipse(ctx, w / 2, h - 30, w / 2 - 10, 24);
  // Inner body (orange)
  ctx.fillStyle = '#7c2d12'; ellipse(ctx, w / 2, h - 44, w / 3, 16);
  // Mouth/entrance (dark opening)
  ctx.fillStyle = '#0f0502'; ellipse(ctx, w / 2, h - 12, 18, 8);
  // Glowing spots (orange)
  ctx.fillStyle = '#f97316';
  for (let i = 0; i < 5; i++) {
    const a = (Math.PI * 2 / 5) * i;
    ctx.beginPath(); ctx.arc(w / 2 + Math.cos(a) * 30, h - 40 + Math.sin(a) * 12, 3, 0, Math.PI * 2); ctx.fill();
  }
}

function zergSpawningPool(ctx, w, h) {
  ctx.fillStyle = '#5c3a1e'; rrect(ctx, 4, h - 6, w - 8, 4, 2); ctx.fill();
  // Organic walls (brown)
  ctx.fillStyle = '#ea580c'; rrect(ctx, 8, h - 36, w - 16, 28, 5); ctx.fill();
  // Pool liquid (orange)
  ctx.fillStyle = '#f97316'; rrect(ctx, 14, h - 28, w - 28, 18, 3); ctx.fill();
  // Liquid glow (yellow)
  ctx.fillStyle = '#fbbf24'; rrect(ctx, 18, h - 24, w - 36, 10, 2); ctx.fill();
}

function zergSpire(ctx, w, h) {
  // Base platform
  ctx.fillStyle = '#5c3a1e'; rrect(ctx, 4, h - 6, w - 8, 4, 2); ctx.fill();
  // Spire body (purple)
  ctx.fillStyle = '#a855f7'; rrect(ctx, 10, h - 34, w - 20, 28, 5); ctx.fill();
  // Spire top (triangle)
  ctx.fillStyle = '#c084fc';
  ctx.beginPath();
  ctx.moveTo(w / 2 - 16, h - 34);
  ctx.lineTo(w / 2, h - 56);
  ctx.lineTo(w / 2 + 16, h - 34);
  ctx.fill();
  // Energy core (glowing)
  ctx.fillStyle = '#fbbf24'; ctx.beginPath(); ctx.arc(w / 2, h - 16, 6, 0, Math.PI * 2); ctx.fill();
}

// ── PROTOSS (angular/energy aesthetic) ─────────────────────────────────
function protossProbe(ctx, w, h) {
  const cx = w / 2;
  // Base (dark purple)
  ctx.fillStyle = '#3b1f7a'; rrect(ctx, cx - 10, h - 8, 20, 6, 3); ctx.fill();
  // Floating body (diamond)
  ctx.fillStyle = '#7c3aed';
  ctx.beginPath();
  ctx.moveTo(cx, h - 52); ctx.lineTo(cx + 14, h - 30);
  ctx.lineTo(cx, h - 8); ctx.lineTo(cx - 14, h - 30);
  ctx.fill();
  // Core glow (light purple)
  ctx.fillStyle = '#a78bfa'; ellipse(ctx, cx, h - 30, 8, 8);
  // Eyes (white)
  ctx.fillStyle = '#e0d4ff';
  ctx.beginPath(); ctx.arc(cx - 5, h - 32, 3, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(cx + 5, h - 32, 3, 0, Math.PI * 2); ctx.fill();
}

function protossZealot(ctx, w, h) {
  const cx = w / 2;
  // Boots (dark purple)
  ctx.fillStyle = '#3b1f7a'; rrect(ctx, cx - 12, h - 8, 10, 6, 2); ctx.fill();
  rrect(ctx, cx + 2, h - 8, 10, 6, 2); ctx.fill();
  // Body armor (purple)
  ctx.fillStyle = '#7c3aed'; rrect(ctx, cx - 12, h - 40, 24, 30, 5); ctx.fill();
  // Chest plate (lighter purple)
  ctx.fillStyle = '#a78bfa'; rrect(ctx, cx - 8, h - 36, 16, 12, 3); ctx.fill();
  // Helmet (angular)
  ctx.fillStyle = '#a78bfa'; ctx.beginPath(); ctx.arc(cx, h - 50, 12, Math.PI, 0); ctx.fill();
  // Eye slit (wide, white)
  ctx.fillStyle = '#e0d4ff'; rrect(ctx, cx - 8, h - 54, 16, 4, 2); ctx.fill();
  // Warp blades (left)
  ctx.fillStyle = '#c084fc'; rrect(ctx, cx - 18, h - 36, 6, 18, 3); ctx.fill();
  // Warp blade glow (white)
  ctx.fillStyle = '#ffffff'; rrect(ctx, cx - 17, h - 34, 4, 16, 2); ctx.fill();
  // Warp blades (right)
  ctx.fillStyle = '#c084fc'; rrect(ctx, cx + 12, h - 36, 6, 18, 3); ctx.fill();
  // Right blade glow
  ctx.fillStyle = '#ffffff'; rrect(ctx, cx + 13, h - 34, 4, 16, 2); ctx.fill();
}

function protossDragoon(ctx, w, h) {
  const cx = w / 2;
  // Boots (dark purple)
  ctx.fillStyle = '#3b1f7a'; rrect(ctx, cx - 14, h - 8, 12, 6, 2); ctx.fill();
  rrect(ctx, cx + 2, h - 8, 12, 6, 2); ctx.fill();
  // Body armor (purple)
  ctx.fillStyle = '#7c3aed'; rrect(ctx, cx - 14, h - 44, 28, 34, 5); ctx.fill();
  // Shield wall (left side)
  ctx.fillStyle = '#a78bfa'; rrect(ctx, cx - 20, h - 42, 8, 30, 3); ctx.fill();
  // Shield glow (light purple)
  ctx.fillStyle = '#c4b5fd'; rrect(ctx, cx - 19, h - 40, 6, 26, 2); ctx.fill();
  // Helmet (angular)
  ctx.fillStyle = '#a78bfa'; ctx.beginPath(); ctx.arc(cx, h - 54, 13, Math.PI, 0); ctx.fill();
  // Eye slit (wide)
  ctx.fillStyle = '#e0d4ff'; rrect(ctx, cx - 9, h - 58, 18, 4, 2); ctx.fill();
  // Cannon (right side)
  ctx.fillStyle = '#c084fc'; rrect(ctx, cx + 14, h - 36, 18, 10, 3); ctx.fill();
  // Cannon tip (glowing)
  ctx.fillStyle = '#e0d4ff'; ctx.beginPath(); ctx.arc(cx + 30, h - 31, 5, 0, Math.PI * 2); ctx.fill();
}

function protossNexus(ctx, w, h) {
  // Base platform
  ctx.fillStyle = '#1a0f34'; rrect(ctx, 4, h - 6, w - 8, 4, 2); ctx.fill();
  // Main body (hexagonal)
  ctx.fillStyle = '#4a2d7a'; rrect(ctx, 10, h - 36, w - 20, 30, 5); ctx.fill();
  // Top crystal (triangle)
  ctx.fillStyle = '#7c3aed';
  ctx.beginPath();
  ctx.moveTo(w / 2, h - 64); ctx.lineTo(w - 18, h - 36);
  ctx.lineTo(18, h - 36); ctx.fill();
  // Core glow (purple)
  ctx.fillStyle = '#a78bfa'; ellipse(ctx, w / 2, h - 26, 14, 10);
  // Inner core (white)
  ctx.fillStyle = '#e0d4ff'; ellipse(ctx, w / 2, h - 26, 7, 5);
  // Energy beam (vertical)
  ctx.fillStyle = '#c084fc'; rrect(ctx, w / 2 - 1, h - 76, 3, 14, 0); ctx.fill();
}

function protossGateway(ctx, w, h) {
  // Base platform
  ctx.fillStyle = '#3b1f7a'; rrect(ctx, 4, h - 6, w - 8, 4, 2); ctx.fill();
  // Portal frame (arched)
  ctx.fillStyle = '#7c3aed'; rrect(ctx, 8, h - 44, w - 16, 36, 5); ctx.fill();
  // Portal opening (purple energy)
  ctx.fillStyle = '#a78bfa'; rrect(ctx, 14, h - 34, w - 28, 26, 3); ctx.fill();
  // Portal energy (bright purple)
  ctx.fillStyle = '#c084fc'; rrect(ctx, 18, h - 30, w - 36, 18, 2); ctx.fill();
  // Top arch (white)
  ctx.fillStyle = '#e0d4ff'; ellipse(ctx, w / 2, h - 44, w / 3, 6);
}

function protossCyberneticsCore(ctx, w, h) {
  // Base platform
  ctx.fillStyle = '#3b1f7a'; rrect(ctx, 4, h - 6, w - 8, 4, 2); ctx.fill();
  // Core body (purple)
  ctx.fillStyle = '#7c3aed'; rrect(ctx, 8, h - 38, w - 16, 30, 5); ctx.fill();
  // Top crystal cluster (light purple)
  ctx.fillStyle = '#a78bfa';
  ctx.beginPath();
  ctx.moveTo(w / 2, h - 56); ctx.lineTo(w - 14, h - 38);
  ctx.lineTo(14, h - 38); ctx.fill();
  // Energy core (glowing)
  ctx.fillStyle = '#c084fc'; ellipse(ctx, w / 2, h - 18, 9, 7);
  // Circuit lines (white)
  ctx.fillStyle = '#e0d4ff'; rrect(ctx, 12, h - 30, w - 24, 2, 0); ctx.fill();
  rrect(ctx, 12, h - 24, w - 24, 2, 0); ctx.fill();
}

// ── Resource nodes (crystal clusters + gas geysers) ────────────────────
function mineralCluster(ctx, w, h, baseColor, highlight) {
  // Base rock platform
  ctx.fillStyle = '#1a1a2e'; rrect(ctx, 4, h - 6, w - 8, 4, 2); ctx.fill();
  // Center crystal (tall)
  ctx.fillStyle = baseColor;
  ctx.beginPath(); ctx.moveTo(w / 2, 4); ctx.lineTo(w - 6, h - 8); ctx.lineTo(6, h - 8); ctx.fill();
  // Left crystal (medium)
  ctx.fillStyle = highlight;
  ctx.beginPath(); ctx.moveTo(14, h - 8); ctx.lineTo(8, 16); ctx.lineTo(22, h - 8); ctx.fill();
  // Right crystal (short)
  ctx.beginPath(); ctx.moveTo(w - 14, h - 8); ctx.lineTo(w - 8, 16); ctx.lineTo(w - 22, h - 8); ctx.fill();
  // Sparkle on tallest crystal (white)
  ctx.fillStyle = '#ffffff'; ellipse(ctx, w / 2, 8, 3, 2);
}

function gasGeyser(ctx, w, h, baseColor, glow) {
  // Base rock platform
  ctx.fillStyle = '#1a1a2e'; rrect(ctx, 4, h - 6, w - 8, 4, 2); ctx.fill();
  // Vent body (purple)
  ctx.fillStyle = baseColor; rrect(ctx, 8, h - 24, w - 16, 18, 4); ctx.fill();
  // Gas streams (vertical wisps)
  ctx.fillStyle = glow; rrect(ctx, w / 2 - 3, h - 36, 3, 14, 0); ctx.fill();
  rrect(ctx, w / 2 + 1, h - 32, 3, 10, 0); ctx.fill();
  rrect(ctx, w / 2 - 7, h - 28, 2, 8, 0); ctx.fill();
  // Bubble at top (glowing)
  ctx.fillStyle = glow; ellipse(ctx, w / 2, h - 38, 5, 4);
}

// ── Procedural Tiled Terrain Textures (64x64) ───────────────────────────
function terranTerrain(ctx, w, h) {
  ctx.fillStyle = '#141d28';
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = '#090e15';
  ctx.lineWidth = 2;
  ctx.strokeRect(0, 0, w, h);
  ctx.strokeRect(0, 0, 32, 32);
  ctx.strokeRect(32, 32, 32, 32);
  ctx.strokeStyle = '#27364d';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(1, 31); ctx.lineTo(1, 1); ctx.lineTo(31, 1);
  ctx.moveTo(33, 63); ctx.lineTo(33, 33); ctx.lineTo(63, 33);
  ctx.stroke();
  ctx.fillStyle = '#3b4e6b';
  for (const rX of [3, 29, 35, 61]) {
    for (const rY of [3, 29, 35, 61]) {
      ctx.fillRect(rX, rY, 2, 2);
    }
  }
  ctx.fillStyle = '#1c2838';
  ctx.fillRect(8, 12, 16, 2);
  ctx.fillRect(8, 18, 16, 2);
  ctx.fillRect(40, 44, 16, 2);
  ctx.fillRect(40, 50, 16, 2);
}

function zergTerrain(ctx, w, h) {
  ctx.fillStyle = '#170919';
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = '#421440';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, 16); ctx.bezierCurveTo(20, 8, 44, 28, 64, 16);
  ctx.moveTo(16, 0); ctx.bezierCurveTo(28, 24, 8, 48, 20, 64);
  ctx.moveTo(48, 64); ctx.bezierCurveTo(36, 40, 56, 20, 48, 0);
  ctx.stroke();
  ctx.strokeStyle = '#75226e';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, 16); ctx.bezierCurveTo(20, 8, 44, 28, 64, 16);
  ctx.moveTo(16, 0); ctx.bezierCurveTo(28, 24, 8, 48, 20, 64);
  ctx.stroke();
  ctx.fillStyle = '#8a2b16';
  ellipse(ctx, 32, 32, 6, 4);
  ellipse(ctx, 12, 50, 4, 3);
  ellipse(ctx, 52, 14, 5, 3);
  ctx.fillStyle = '#d96818';
  ellipse(ctx, 31, 31, 3, 2);
  ellipse(ctx, 51, 13, 2, 1);
}

function protossTerrain(ctx, w, h) {
  ctx.fillStyle = '#0b0a16';
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = '#221947';
  ctx.lineWidth = 2;
  ctx.strokeRect(4, 4, 56, 56);
  ctx.beginPath();
  ctx.moveTo(32, 0); ctx.lineTo(32, 64);
  ctx.moveTo(0, 32); ctx.lineTo(64, 32);
  ctx.moveTo(16, 4); ctx.lineTo(32, 20); ctx.lineTo(48, 4);
  ctx.moveTo(16, 60); ctx.lineTo(32, 44); ctx.lineTo(48, 60);
  ctx.stroke();
  ctx.strokeStyle = '#5a3bb8';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(32, 4); ctx.lineTo(32, 60);
  ctx.moveTo(4, 32); ctx.lineTo(60, 32);
  ctx.stroke();
  ctx.fillStyle = '#a855f7';
  ellipse(ctx, 32, 32, 5, 5);
  ellipse(ctx, 16, 16, 3, 3);
  ellipse(ctx, 48, 48, 3, 3);
  ctx.fillStyle = '#38bdf8';
  ellipse(ctx, 32, 32, 2, 2);
  ellipse(ctx, 16, 16, 1, 1);
  ellipse(ctx, 48, 48, 1, 1);
}

// ── Main generator function ────────────────────────────────────────────
export function generateAllTextures(scene) {
  // Race terrain textures (64x64 tiled surface)
  createTex(scene, 'terran-terrain', 64, 64, terranTerrain);
  createTex(scene, 'zerg-terrain', 64, 64, zergTerrain);
  createTex(scene, 'protoss-terrain', 64, 64, protossTerrain);

  // Terran units (procedural pixel art)
  createTex(scene, 'terran-scv', 38, 56, terranScv);
  createTex(scene, 'terran-marine', 38, 56, terranMarine);
  createTex(scene, 'terran-marauder', 48, 64, terranMarauder);

  // Terran buildings
  createTex(scene, 'terran-command-center', 110, 72, terranCommandCenter);
  createTex(scene, 'terran-barracks', 88, 56, terranBarracks);
  createTex(scene, 'terran-factory', 76, 52, terranFactory);

  // Zerg units
  createTex(scene, 'zerg-drone', 38, 56, zergDrone);
  createTex(scene, 'zerg-zergling', 38, 52, zergZergling);
  createTex(scene, 'zerg-hydralisk', 48, 68, zergHydralisk);

  // Zerg baneling (small spherical unit)
  createTex(scene, 'zerg-baneling', 42, 48, (ctx) => {
    const cx = 21;
    ctx.fillStyle = '#7c2d12'; ellipse(ctx, cx, 40, 18, 10);
    ctx.fillStyle = '#ea580c'; ellipse(ctx, cx, 24, 13, 16);
    for (let i = 0; i < 8; i++) {
      const a = (Math.PI * 2 / 8) * i - Math.PI / 4;
      ctx.fillStyle = '#f97316';
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * 14, 24 + Math.sin(a) * 12);
      ctx.lineTo(cx + Math.cos(a) * 24, 24 + Math.sin(a) * 20);
      ctx.lineTo(cx + Math.cos(a + 0.3) * 14, 24 + Math.sin(a + 0.3) * 12);
      ctx.fill();
    }
    ctx.fillStyle = '#fbbf24';
    ctx.beginPath(); ctx.arc(17, 18, 3, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(25, 18, 3, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#9a3412'; rrect(ctx, 32, 18, 8, 5, 2); ctx.fill();
  });

  // Zerg buildings
  createTex(scene, 'zerg-command-center', 112, 76, zergHatchery);
  createTex(scene, 'zerg-production', 84, 58, zergSpawningPool);
  createTex(scene, 'zerg-tech', 72, 50, zergSpire);

  // Protoss units
  createTex(scene, 'protoss-probe', 38, 56, protossProbe);
  createTex(scene, 'protoss-zealot', 38, 64, protossZealot);
  createTex(scene, 'protoss-dragoon', 48, 68, protossDragoon);

  // Protoss buildings
  createTex(scene, 'protoss-command-center', 112, 74, protossNexus);
  createTex(scene, 'protoss-production', 90, 60, protossGateway);
  createTex(scene, 'protoss-tech', 78, 54, protossCyberneticsCore);

  // Resource nodes (3 races x minerals + gas = 6 textures)
  createTex(scene, 'terran-mineral', 40, 40, (ctx) => mineralCluster(ctx, 40, 40, '#67e8f9', '#dbeafe'));
  createTex(scene, 'zerg-mineral', 40, 40, (ctx) => mineralCluster(ctx, 40, 40, '#f97316', '#fb923c'));
  createTex(scene, 'protoss-mineral', 40, 40, (ctx) => mineralCluster(ctx, 40, 40, '#a78bfa', '#c4b5fd'));

  createTex(scene, 'terran-gas', 36, 36, (ctx) => gasGeyser(ctx, 36, 36, '#c084fc', '#f0abfc'));
  createTex(scene, 'zerg-gas', 36, 36, (ctx) => gasGeyser(ctx, 36, 36, '#a855f7', '#c084fc'));
  createTex(scene, 'protoss-gas', 36, 36, (ctx) => gasGeyser(ctx, 36, 36, '#c084fc', '#d8b4fe'));
}
