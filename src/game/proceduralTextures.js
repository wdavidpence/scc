import Phaser from 'phaser';

/**
 * Procedural texture generator — replaces missing spritesheet assets.
 * Draws every unit, building, and resource sprite on canvas so the game
 * runs with zero external files. Each race gets a distinct visual identity.
 */

// ── Helpers ──────────────────────────────────────────────────────────────
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

function star(ctx, cx, cy, spikes, outerR, innerR) {
  ctx.beginPath();
  for (let i = 0; i < spikes * 2; i++) {
    const r = i % 2 === 0 ? outerR : innerR;
    const a = (Math.PI * i) / spikes - Math.PI / 2;
    if (i === 0) ctx.moveTo(cx + r * Math.cos(a), cy + r * Math.sin(a));
    else ctx.lineTo(cx + r * Math.cos(a), cy + r * Math.sin(a));
  }
  ctx.closePath();
}

function createTex(scene, key, w, h, draw) {
  if (scene.textures.exists(key)) return;
  const tex = scene.textures.createCanvas(key, w, h);
  draw(tex.context, w, h);
  tex.refresh();
}

// ── TERRAN textures ──────────────────────────────────────────────────────
function terranScv(ctx, w, h) {
  // Heavy mech suit — boxy body + drill arm
  ctx.fillStyle = '#1e3a5f'; rrect(ctx, 6, h - 20, w - 12, 16, 3); ctx.fill();
  ctx.fillStyle = '#4a90d9'; rrect(ctx, 10, h - 36, w - 24, 20, 4); ctx.fill();
  ctx.fillStyle = '#6bb3f0'; rrect(ctx, 14, h - 52, w - 34, 20, 3); ctx.fill();
  // Helmet
  ctx.fillStyle = '#87ceeb'; ctx.beginPath(); ctx.arc(w / 2, h - 56, 9, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#1a365d'; ctx.fillRect(w / 2 - 5, h - 58, 10, 4);
  // Drill arm (right)
  ctx.fillStyle = '#b8860b'; ctx.fillRect(w - 14, h - 32, 8, 6);
  ctx.fillStyle = '#d4a017'; ctx.fillRect(w - 8, h - 36, 5, 14);
  // Backpack
  ctx.fillStyle = '#2d5a87'; rrect(ctx, 4, h - 30, 10, 16, 2); ctx.fill();
}

function terranMarine(ctx, w, h) {
  // Marine with rifle — lean body + weapon
  ctx.fillStyle = '#2d5a87'; rrect(ctx, 10, h - 18, w - 20, 14, 3); ctx.fill();
  ctx.fillStyle = '#4a90d9'; rrect(ctx, 12, h - 36, w - 24, 22, 4); ctx.fill();
  // Helmet with visor
  ctx.fillStyle = '#6bb3f0'; ctx.beginPath(); ctx.arc(w / 2, h - 42, 10, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#1a365d'; ctx.fillRect(w / 2 - 7, h - 44, 14, 5);
  ctx.fillStyle = '#00ff88'; ctx.fillRect(w / 2 - 4, h - 43, 8, 3);
  // Rifle (right side)
  ctx.fillStyle = '#708090'; ctx.fillRect(w - 16, h - 34, 12, 5);
  ctx.fillStyle = '#a0b0c0'; ctx.fillRect(w - 4, h - 36, 4, 12);
}

function terranMarauder(ctx, w, h) {
  // Heavy marauder — big body + dual cannons
  ctx.fillStyle = '#1e3a5f'; rrect(ctx, 6, h - 20, w - 12, 18, 4); ctx.fill();
  ctx.fillStyle = '#3a6d9e'; rrect(ctx, 8, h - 42, w - 16, 26, 5); ctx.fill();
  // Big helmet
  ctx.fillStyle = '#4a90d9'; ctx.beginPath(); ctx.arc(w / 2, h - 50, 13, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#1a365d'; ctx.fillRect(w / 2 - 9, h - 54, 18, 6);
  ctx.fillStyle = '#ff4444'; ctx.fillRect(w / 2 - 5, h - 52, 10, 4);
  // Dual cannons
  ctx.fillStyle = '#b8860b'; rrect(ctx, w - 22, h - 38, 16, 7, 2); ctx.fill();
  ctx.fillStyle = '#d4a017'; rrect(ctx, w - 26, h - 32, 10, 8, 2); ctx.fill();
}

function terranCommandCenter(ctx, w, h) {
  // Large command building — multi-tier with antenna
  ctx.fillStyle = '#0f172a'; rrect(ctx, 4, h - 8, w - 8, 6, 2); ctx.fill();
  ctx.fillStyle = '#1e3a5f'; rrect(ctx, 8, h - 40, w - 16, 36, 4); ctx.fill();
  ctx.fillStyle = '#2563eb'; rrect(ctx, 14, h - 60, w - 28, 24, 3); ctx.fill();
  // Windows
  ctx.fillStyle = '#60a5fa'; rrect(ctx, 20, h - 54, 16, 12, 2); ctx.fill();
  ctx.fillStyle = '#93c5fd'; rrect(ctx, w - 40, h - 54, 16, 12, 2); ctx.fill();
  // Antenna
  ctx.fillStyle = '#3b82f6'; ctx.fillRect(w / 2 - 1, h - 78, 3, 20);
  ctx.fillStyle = '#fbbf24'; ctx.beginPath(); ctx.arc(w / 2 + 0.5, h - 80, 4, 0, Math.PI * 2); ctx.fill();
}

function terranBarracks(ctx, w, h) {
  ctx.fillStyle = '#1e3a5f'; rrect(ctx, 4, h - 6, w - 8, 4, 2); ctx.fill();
  ctx.fillStyle = '#2563eb'; rrect(ctx, 8, h - 38, w - 16, 34, 4); ctx.fill();
  ctx.fillStyle = '#4a90d9'; rrect(ctx, 12, h - 50, w - 24, 16, 3); ctx.fill();
  // Door
  ctx.fillStyle = '#0f172a'; rrect(ctx, w / 2 - 8, h - 20, 16, 16, 2); ctx.fill();
  ctx.fillStyle = '#fbbf24'; rrect(ctx, w / 2 - 10, h - 52, 20, 4, 1); ctx.fill();
}

function terranFactory(ctx, w, h) {
  ctx.fillStyle = '#1e3a5f'; rrect(ctx, 4, h - 6, w - 8, 4, 2); ctx.fill();
  ctx.fillStyle = '#3a6d9e'; rrect(ctx, 6, h - 40, w - 12, 36, 4); ctx.fill();
  ctx.fillStyle = '#7c3aed'; rrect(ctx, 10, h - 52, w - 20, 16, 3); ctx.fill();
  // Chimney
  ctx.fillStyle = '#4a5568'; ctx.fillRect(w - 20, h - 64, 10, 18);
  ctx.fillStyle = '#a0aec0'; ctx.fillRect(w - 22, h - 68, 14, 6);
}

// ── ZERG textures ────────────────────────────────────────────────────────
function zergDrone(ctx, w, h) {
  // Organic worker — bulbous body + claw arms
  ctx.fillStyle = '#5c3a1e'; ctx.beginPath(); ctx.ellipse(w / 2, h - 8, w / 2 - 4, 6, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#c2410c'; ctx.beginPath(); ctx.ellipse(w / 2, h - 28, w / 3, 14, 0, 0, Math.PI * 2); ctx.fill();
  // Head
  ctx.fillStyle = '#ea580c'; ctx.beginPath(); ctx.ellipse(w / 2, h - 46, 10, 8, 0, 0, Math.PI * 2); ctx.fill();
  // Eyes (glowing)
  ctx.fillStyle = '#fbbf24';
  ctx.beginPath(); ctx.arc(w / 2 - 5, h - 48, 3, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(w / 2 + 5, h - 48, 3, 0, Math.PI * 2); ctx.fill();
  // Claws
  ctx.fillStyle = '#9a3412'; ctx.fillRect(6, h - 28, 8, 5);
  ctx.fillStyle = '#9a3412'; ctx.fillRect(w - 14, h - 28, 8, 5);
}

function zergZergling(ctx, w, h) {
  // Fast melee unit — low body + claws + fangs
  ctx.fillStyle = '#7c2d12'; ctx.beginPath(); ctx.ellipse(w / 2, h - 8, w / 2 - 3, 6, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#ea580c'; ctx.beginPath(); ctx.ellipse(w / 2, h - 24, w / 3, 16, 0.15, 0, Math.PI * 2); ctx.fill();
  // Head with fangs
  ctx.fillStyle = '#f97316'; ctx.beginPath(); ctx.ellipse(w / 2, h - 44, 10, 8, 0, 0, Math.PI * 2); ctx.fill();
  // Fangs
  ctx.fillStyle = '#fef3c7'; ctx.fillRect(w / 2 - 4, h - 40, 3, 8);
  ctx.fillRect(w / 2 + 1, h - 40, 3, 8);
  // Eyes
  ctx.fillStyle = '#fbbf24';
  ctx.beginPath(); ctx.arc(w / 2 - 5, h - 46, 3, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(w / 2 + 5, h - 46, 3, 0, Math.PI * 2); ctx.fill();
  // Claws extending forward
  ctx.fillStyle = '#9a3412'; rrect(ctx, w - 16, h - 24, 10, 5, 2); ctx.fill();
}

function zergHydralisk(ctx, w, h) {
  // Ranged unit — tall body + spinal cannon
  ctx.fillStyle = '#16a34a'; ctx.beginPath(); ctx.ellipse(w / 2, h - 8, w / 2 - 4, 6, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#15803d'; ctx.beginPath(); ctx.ellipse(w / 2, h - 34, w / 3, 20, 0.1, 0, Math.PI * 2); ctx.fill();
  // Neck/head
  ctx.fillStyle = '#16a34a'; ctx.beginPath(); ctx.ellipse(w / 2, h - 58, 11, 9, 0.3, 0, Math.PI * 2); ctx.fill();
  // Spikes on back
  for (let i = 0; i < 4; i++) {
    ctx.fillStyle = '#a855f7';
    ctx.beginPath();
    const sy = h - 20 - i * 8;
    ctx.moveTo(w / 2 + 10, sy);
    ctx.lineTo(w / 2 + 18, sy - 6);
    ctx.lineTo(w / 2 + 10, sy + 4);
    ctx.fill();
  }
  // Cannon (right side)
  ctx.fillStyle = '#2d5a1e'; rrect(ctx, w - 18, h - 40, 14, 7, 2); ctx.fill();
  ctx.fillStyle = '#a855f7'; ctx.beginPath(); ctx.arc(w - 6, h - 36, 5, 0, Math.PI * 2); ctx.fill();
  // Eyes
  ctx.fillStyle = '#fbbf24';
  ctx.beginPath(); ctx.arc(w / 2 - 5, h - 60, 3, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(w / 2 + 5, h - 60, 3, 0, Math.PI * 2); ctx.fill();
}

function zergHatchery(ctx, w, h) {
  // Organic command center — bulbous with tendrils
  ctx.fillStyle = '#1a0f08'; rrect(ctx, 4, h - 6, w - 8, 4, 2); ctx.fill();
  ctx.fillStyle = '#5c3a1e'; ctx.beginPath(); ctx.ellipse(w / 2, h - 30, w / 2 - 8, 26, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#7c2d12'; ctx.beginPath(); ctx.ellipse(w / 2, h - 46, w / 3, 18, 0, 0, Math.PI * 2); ctx.fill();
  // Mouth/entrance
  ctx.fillStyle = '#1a0f08'; ctx.beginPath(); ctx.ellipse(w / 2, h - 14, 18, 10, 0, 0, Math.PI * 2); ctx.fill();
  // Glowing spots
  ctx.fillStyle = '#f97316';
  for (let i = 0; i < 5; i++) {
    const a = (Math.PI * 2 / 5) * i;
    ctx.beginPath(); ctx.arc(w / 2 + Math.cos(a) * 30, h - 40 + Math.sin(a) * 12, 3, 0, Math.PI * 2); ctx.fill();
  }
}

function zergSpawningPool(ctx, w, h) {
  ctx.fillStyle = '#5c3a1e'; rrect(ctx, 4, h - 6, w - 8, 4, 2); ctx.fill();
  ctx.fillStyle = '#ea580c'; rrect(ctx, 8, h - 36, w - 16, 32, 6); ctx.fill();
  // Pool liquid
  ctx.fillStyle = '#f97316'; rrect(ctx, 14, h - 28, w - 28, 20, 4); ctx.fill();
  ctx.fillStyle = '#fbbf24'; rrect(ctx, 18, h - 24, w - 36, 12, 3); ctx.fill();
  // Organic rim
  ctx.fillStyle = '#7c2d12'; rrect(ctx, 6, h - 40, w - 12, 8, 3); ctx.fill();
}

function zergSpire(ctx, w, h) {
  ctx.fillStyle = '#5c3a1e'; rrect(ctx, 4, h - 6, w - 8, 4, 2); ctx.fill();
  ctx.fillStyle = '#a855f7'; rrect(ctx, 10, h - 34, w - 20, 30, 5); ctx.fill();
  // Spire top
  ctx.fillStyle = '#c084fc'; ctx.beginPath();
  ctx.moveTo(w / 2 - 16, h - 34); ctx.lineTo(w / 2, h - 58); ctx.lineTo(w / 2 + 16, h - 34);
  ctx.fill();
  // Energy core
  ctx.fillStyle = '#fbbf24'; ctx.beginPath(); ctx.arc(w / 2, h - 18, 6, 0, Math.PI * 2); ctx.fill();
}

// ── PROTOSS textures ─────────────────────────────────────────────────────
function protossProbe(ctx, w, h) {
  // Floating worker — sleek body + energy beam
  ctx.fillStyle = '#4a2d7a'; rrect(ctx, 10, h - 18, w - 20, 14, 5); ctx.fill();
  // Floating body (diamond shape)
  ctx.fillStyle = '#7c3aed'; ctx.beginPath();
  ctx.moveTo(w / 2, h - 56); ctx.lineTo(w - 10, h - 34);
  ctx.lineTo(w / 2, h - 16); ctx.lineTo(10, h - 34);
  ctx.fill();
  // Core glow
  ctx.fillStyle = '#a78bfa'; ctx.beginPath(); ctx.arc(w / 2, h - 34, 8, 0, Math.PI * 2); ctx.fill();
  // Eyes
  ctx.fillStyle = '#e0d4ff';
  ctx.beginPath(); ctx.arc(w / 2 - 5, h - 36, 3, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(w / 2 + 5, h - 36, 3, 0, Math.PI * 2); ctx.fill();
}

function protossZealot(ctx, w, h) {
  // Melee unit — tall body + dual warp blades
  ctx.fillStyle = '#3b1f7a'; rrect(ctx, 8, h - 20, w - 16, 16, 3); ctx.fill();
  // Body armor
  ctx.fillStyle = '#7c3aed'; rrect(ctx, 10, h - 44, w - 20, 28, 5); ctx.fill();
  // Helmet with glowing eyes
  ctx.fillStyle = '#a78bfa'; ctx.beginPath(); ctx.arc(w / 2, h - 54, 11, 0, Math.PI * 2); ctx.fill();
  // Eye slit
  ctx.fillStyle = '#e0d4ff'; ctx.fillRect(w / 2 - 8, h - 56, 16, 4);
  ctx.fillStyle = '#ffffff'; ctx.fillRect(w / 2 - 6, h - 55, 12, 2);
  // Warp blades (left + right)
  ctx.fillStyle = '#c084fc'; rrect(ctx, 2, h - 36, 8, 18, 4); ctx.fill();
  ctx.fillStyle = '#ffffff'; rrect(ctx, 3, h - 35, 6, 16, 3); ctx.fill();
  ctx.fillStyle = '#c084fc'; rrect(ctx, w - 10, h - 36, 8, 18, 4); ctx.fill();
  ctx.fillStyle = '#ffffff'; rrect(ctx, w - 9, h - 35, 6, 16, 3); ctx.fill();
}

function protossDragoon(ctx, w, h) {
  // Ranged unit — shield wall + cannon
  ctx.fillStyle = '#3b1f7a'; rrect(ctx, 6, h - 20, w - 12, 18, 4); ctx.fill();
  // Body with shield wall (left side)
  ctx.fillStyle = '#7c3aed'; rrect(ctx, 8, h - 46, w - 16, 30, 5); ctx.fill();
  // Shield wall
  ctx.fillStyle = '#a78bfa'; rrect(ctx, 2, h - 44, 10, 30, 3); ctx.fill();
  ctx.fillStyle = '#c4b5fd'; rrect(ctx, 3, h - 42, 8, 26, 2); ctx.fill();
  // Helmet
  ctx.fillStyle = '#a78bfa'; ctx.beginPath(); ctx.arc(w / 2, h - 56, 12, 0, Math.PI * 2); ctx.fill();
  // Eye slit (wider than zealot)
  ctx.fillStyle = '#e0d4ff'; ctx.fillRect(w / 2 - 9, h - 58, 18, 4);
  ctx.fillStyle = '#ffffff'; ctx.fillRect(w / 2 - 7, h - 57, 14, 2);
  // Cannon (right side)
  ctx.fillStyle = '#c084fc'; rrect(ctx, w - 20, h - 40, 16, 8, 3); ctx.fill();
  ctx.fillStyle = '#e0d4ff'; ctx.beginPath(); ctx.arc(w - 6, h - 36, 5, 0, Math.PI * 2); ctx.fill();
}

function protossNexus(ctx, w, h) {
  // Command center — floating diamond with energy beams
  ctx.fillStyle = '#1a0f34'; rrect(ctx, 4, h - 6, w - 8, 4, 2); ctx.fill();
  // Main structure (hexagonal)
  ctx.fillStyle = '#4a2d7a'; rrect(ctx, 10, h - 38, w - 20, 34, 6); ctx.fill();
  // Top crystal
  ctx.fillStyle = '#7c3aed'; ctx.beginPath();
  ctx.moveTo(w / 2, h - 68); ctx.lineTo(w - 18, h - 38);
  ctx.lineTo(18, h - 38); ctx.fill();
  // Core glow
  ctx.fillStyle = '#a78bfa'; ctx.beginPath(); ctx.arc(w / 2, h - 30, 12, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#e0d4ff'; ctx.beginPath(); ctx.arc(w / 2, h - 30, 6, 0, Math.PI * 2); ctx.fill();
  // Energy beams (vertical)
  ctx.fillStyle = '#c084fc'; ctx.fillRect(w / 2 - 1, h - 76, 3, 10);
}

function protossGateway(ctx, w, h) {
  ctx.fillStyle = '#3b1f7a'; rrect(ctx, 4, h - 6, w - 8, 4, 2); ctx.fill();
  // Portal frame (arched)
  ctx.fillStyle = '#7c3aed'; rrect(ctx, 8, h - 46, w - 16, 42, 5); ctx.fill();
  // Portal opening
  ctx.fillStyle = '#a78bfa'; rrect(ctx, 14, h - 36, w - 28, 30, 4); ctx.fill();
  // Energy inside portal
  ctx.fillStyle = '#c084fc'; rrect(ctx, 18, h - 32, w - 36, 22, 3); ctx.fill();
  // Top arch
  ctx.fillStyle = '#e0d4ff'; ctx.beginPath(); ctx.ellipse(w / 2, h - 46, w / 3, 8, 0, Math.PI, Math.PI * 2); ctx.fill();
}

function protossCyberneticsCore(ctx, w, h) {
  ctx.fillStyle = '#3b1f7a'; rrect(ctx, 4, h - 6, w - 8, 4, 2); ctx.fill();
  // Core body
  ctx.fillStyle = '#7c3aed'; rrect(ctx, 8, h - 40, w - 16, 36, 5); ctx.fill();
  // Top crystal cluster
  ctx.fillStyle = '#a78bfa'; ctx.beginPath();
  ctx.moveTo(w / 2, h - 60); ctx.lineTo(w - 14, h - 40);
  ctx.lineTo(14, h - 40); ctx.fill();
  // Energy core
  ctx.fillStyle = '#c084fc'; ctx.beginPath(); ctx.arc(w / 2, h - 22, 8, 0, Math.PI * 2); ctx.fill();
  // Circuit lines
  ctx.fillStyle = '#e0d4ff';
  ctx.fillRect(12, h - 30, w - 24, 2);
  ctx.fillRect(12, h - 26, w - 24, 2);
}

// ── Resource textures (shared across races, different palettes) ──────────
function mineralCluster(ctx, w, h, baseColor, highlight) {
  // Base rock
  ctx.fillStyle = '#1a1a2e'; rrect(ctx, 4, h - 6, w - 8, 4, 2); ctx.fill();
  // Crystal cluster
  ctx.fillStyle = baseColor;
  ctx.beginPath(); ctx.moveTo(w / 2, 4); ctx.lineTo(w - 8, h - 10); ctx.lineTo(8, h - 10); ctx.fill();
  // Left crystal
  ctx.fillStyle = highlight;
  ctx.beginPath(); ctx.moveTo(12, h - 10); ctx.lineTo(8, 14); ctx.lineTo(20, h - 10); ctx.fill();
  // Right crystal
  ctx.beginPath(); ctx.moveTo(w - 12, h - 10); ctx.lineTo(w - 8, 14); ctx.lineTo(w - 20, h - 10); ctx.fill();
  // Sparkle on top
  ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(w / 2, 8, 3, 0, Math.PI * 2); ctx.fill();
}

function gasGeyser(ctx, w, h, baseColor, glow) {
  // Base rock
  ctx.fillStyle = '#1a1a2e'; rrect(ctx, 4, h - 6, w - 8, 4, 2); ctx.fill();
  // Vent body
  ctx.fillStyle = baseColor; rrect(ctx, 8, h - 26, w - 16, 20, 4); ctx.fill();
  // Gas streams (vertical wisps)
  ctx.fillStyle = glow;
  ctx.fillRect(w / 2 - 4, h - 38, 3, 16);
  ctx.fillRect(w / 2 + 2, h - 34, 3, 12);
  ctx.fillRect(w / 2 - 8, h - 30, 2, 10);
  // Bubbles at top
  ctx.beginPath(); ctx.arc(w / 2, h - 40, 5, 0, Math.PI * 2); ctx.fill();
}

// ── Main generator function ──────────────────────────────────────────────
export function generateAllTextures(scene) {
  // Terran units (38x56 canvas, centered)
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
  createTex(scene, 'zerg-baneling', 42, 48, (ctx, w, h) => {
    // Baneling — small, spherical, with spikes
    ctx.fillStyle = '#7c2d12'; ctx.beginPath(); ctx.ellipse(w / 2, h - 14, w / 2 - 4, 10, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ea580c'; ctx.beginPath(); ctx.ellipse(w / 2, h - 30, w / 3, 16, 0, 0, Math.PI * 2); ctx.fill();
    // Spikes all around
    ctx.fillStyle = '#f97316';
    for (let i = 0; i < 8; i++) {
      const a = (Math.PI * 2 / 8) * i - Math.PI / 4;
      ctx.beginPath();
      ctx.moveTo(w / 2 + Math.cos(a) * 14, h - 30 + Math.sin(a) * 12);
      ctx.lineTo(w / 2 + Math.cos(a) * 22, h - 30 + Math.sin(a) * 18);
      ctx.lineTo(w / 2 + Math.cos(a + 0.3) * 14, h - 30 + Math.sin(a + 0.3) * 12);
      ctx.fill();
    }
    // Eyes
    ctx.fillStyle = '#fbbf24';
    ctx.beginPath(); ctx.arc(w / 2 - 4, h - 36, 3, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(w / 2 + 4, h - 36, 3, 0, Math.PI * 2); ctx.fill();
    // Spiked tail
    ctx.fillStyle = '#9a3412'; rrect(ctx, w - 10, h - 36, 8, 5, 2); ctx.fill();
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

  // Resource nodes (shared)
  createTex(scene, 'terran-mineral', 40, 40, (ctx) => mineralCluster(ctx, 40, 40, '#67e8f9', '#dbeafe'));
  createTex(scene, 'zerg-mineral', 40, 40, (ctx) => mineralCluster(ctx, 40, 40, '#f97316', '#fb923c'));
  createTex(scene, 'protoss-mineral', 40, 40, (ctx) => mineralCluster(ctx, 40, 40, '#a78bfa', '#c4b5fd'));

  createTex(scene, 'terran-gas', 36, 36, (ctx) => gasGeyser(ctx, 36, 36, '#c084fc', '#f0abfc'));
  createTex(scene, 'zerg-gas', 36, 36, (ctx) => gasGeyser(ctx, 36, 36, '#a855f7', '#c084fc'));
  createTex(scene, 'protoss-gas', 36, 36, (ctx) => gasGeyser(ctx, 36, 36, '#c084fc', '#d8b4fe'));
}
