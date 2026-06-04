/**
 * Particle effects for combat — muzzle flashes on attack, explosions on death.
 * Race-specific palettes ensure visual consistency with each faction's aesthetic.
 */

/* ---------------------------------------------------------------------------
 * Palette helpers — one per race, matching the existing GameScene.js colors.
 * ---------------------------------------------------------------------------*/

const PALETTES = {
  terran: {
    muzzle: ['#3b82f6', '#60a5fa', '#93c5fd', '#dbeafe'],
    spark:  ['#f59e0b', '#fbbf24', '#fb923c'],
    death:  ['#3b82f6', '#60a5fa', '#93c5fd', '#f59e0b', '#fb923c'],
    debris: ['#1e293b', '#475569']
  },
  zerg: {
    muzzle: ['#f97316', '#fb923c', '#fbbf24', '#fdba74'],
    spark:  ['#ea580c', '#f59e0b', '#fbbf24'],
    death:  ['#f97316', '#fb923c', '#fbbf24', '#a855f7', '#c084fc'],
    debris: ['#1a0f08', '#5c3a1e']
  },
  protoss: {
    muzzle: ['#8b5cf6', '#a78bfa', '#c4b5fd', '#d8b4fe'],
    spark:  ['#a855f7', '#c084fc', '#e9d5ff'],
    death:  ['#8b5cf6', '#a78bfa', '#c4b5fd', '#d8b4fe', '#fbbf24'],
    debris: ['#0c0918', '#4a2d7a']
  }
};

/* ---------------------------------------------------------------------------
 * Muzzle flash — small burst fired from the attacker toward the target.
 * Creates 3-5 particles that travel outward rapidly and fade quickly.
 * ---------------------------------------------------------------------------*/

export function spawnMuzzleFlash(scene, x, y, race, options = {}) {
  const palette = PALETTES[race] || PALETTES.terran;
  const count  = options.count ?? 4;
  const speed  = options.speed ?? 180;
  const life   = options.life ?? 0.25;

  // Spawn a small group of particles
  const group = scene.add.group();

  for (let i = 0; i < count; i += 1) {
    const angle = (Math.PI * 2 / count) * i + Phaser.Math.Between(-15, 15);
    const col   = palette.muzzle[Phaser.Math.Between(0, palette.muzzle.length - 1)];
    const size  = Phaser.Math.Between(3, 6);

    // Draw a small rectangle as particle (pixel-art style)
    const p = scene.add.rectangle(x, y, size, size, 0xffffff, 1)
      .setOrigin(0.5)
      .setAlpha(1)
      .setDepth(10);

    // Color the particle via canvas texture (pixel art)
    const key = `_pf_m_${scene.textures.exists(`_pf_m_${race}_${i}`) ? (i + 1) : i}`;
    // Skip texture creation for performance — use tint instead.

    p.setTint(getColorFromString(col));
    group.add(p);

    scene.tweens.add({
      targets: p,
      x:       x + Math.cos(angle) * Phaser.Math.Between(8, 24),
      y:       y + Math.sin(angle) * Phaser.Math.Between(8, 24),
      alpha:   0,
      scaleX:  0.3,
      scaleY:  0.3,
      duration: (life * 1000) * Phaser.Math.FloatBetween(0.6, 1.2),
      ease:    'Linear',
      onComplete: () => { p.destroy(); }
    });
  }

  // Quick flash at origin (bright white burst)
  const flash = scene.add.circle(x, y, 6, 0xffffff, 0.9)
    .setOrigin(0.5)
    .setDepth(11);

  scene.tweens.add({
    targets: flash,
    alpha:   0,
    scaleX:  0.15,
    scaleY:  0.15,
    duration: life * 600,
    ease:    'Linear',
    onComplete: () => { flash.destroy(); group.destroy(true); }
  });
}

/* ---------------------------------------------------------------------------
 * Explosion — death effect. Larger burst with more particles, debris, and
 * a ring that expands outward (classic explosion look).
 * ---------------------------------------------------------------------------*/

export function spawnExplosion(scene, x, y, race, options = {}) {
  const palette = PALETTES[race] || PALETTES.terran;
  const isStructure = options.isStructure ?? false;
  const count   = isStructure ? 18 : 10;
  const maxDist = isStructure ? 50 : 32;
  const life    = options.life ?? (isStructure ? 0.7 : 0.5);

  // --- Ring burst (expanding circle) ---
  const ring = scene.add.circle(x, y, 4, 0xffffff, 0.8)
    .setOrigin(0.5)
    .setDepth(9);

  scene.tweens.add({
    targets: ring,
    scaleX:  (maxDist / 4) * 2,
    scaleY:  (maxDist / 4) * 2,
    alpha:   0,
    duration: life * 800,
    ease:    'Cubic.easeOut',
    onComplete: () => { ring.destroy(); }
  });

  // --- Core particles (colored burst) ---
  const coreGroup = scene.add.group();

  for (let i = 0; i < count; i += 1) {
    const angle = (Math.PI * 2 / count) * i + Phaser.Math.Between(-10, 10);
    const dist  = Phaser.Math.Between(6, maxDist);
    const col   = palette.death[Phaser.Math.Between(0, palette.death.length - 1)];
    const size  = Phaser.Math.Between(3, isStructure ? 8 : 5);

    const p = scene.add.rectangle(x, y, size, size, 0xffffff, 1)
      .setOrigin(0.5)
      .setAlpha(1)
      .setDepth(8);

    p.setTint(getColorFromString(col));
    coreGroup.add(p);

    const tx = x + Math.cos(angle) * dist;
    const ty = y + Math.sin(angle) * dist;

    scene.tweens.add({
      targets: p,
      x:       tx,
      y:       ty,
      alpha:   0,
      scaleX:  0.2,
      scaleY:  0.2,
      duration: life * 1000 * Phaser.Math.FloatBetween(0.7, 1.3),
      ease:    'Cubic.easeOut',
      onComplete: () => { p.destroy(); }
    });
  }

  // --- Sparks (tiny fast particles, brighter) ---
  const sparkCount = isStructure ? 10 : 5;

  for (let i = 0; i < sparkCount; i += 1) {
    const angle = Phaser.Math.Between(0, Math.PI * 2);
    const dist  = Phaser.Math.Between(4, maxDist * 0.7);
    const col   = palette.spark[Phaser.Math.Between(0, palette.spark.length - 1)];
    const size  = Phaser.Math.Between(2, 3);

    const s = scene.add.rectangle(x, y, size, size, 0xffffff, 1)
      .setOrigin(0.5)
      .setAlpha(1)
      .setDepth(12);

    s.setTint(getColorFromString(col));

    scene.tweens.add({
      targets: s,
      x:       x + Math.cos(angle) * dist,
      y:       y + Math.sin(angle) * dist,
      alpha:   0,
      duration: life * 600 * Phaser.Math.FloatBetween(0.5, 1),
      ease:    'Cubic.easeOut',
      onComplete: () => { s.destroy(); }
    });
  }

  // --- Debris (slow, dark particles that linger) ---
  const debrisCount = isStructure ? 6 : 3;

  for (let i = 0; i < debrisCount; i += 1) {
    const angle = Phaser.Math.Between(0, Math.PI * 2);
    const dist  = Phaser.Math.Between(10, maxDist * 0.8);
    const col   = palette.debris[Phaser.Math.Between(0, palette.debris.length - 1)];
    const size  = Phaser.Math.Between(4, isStructure ? 8 : 5);

    const d = scene.add.rectangle(x, y, size, size, 0xffffff, 0.8)
      .setOrigin(0.5)
      .setAlpha(0.8)
      .setDepth(7);

    d.setTint(getColorFromString(col));

    scene.tweens.add({
      targets: d,
      x:       x + Math.cos(angle) * dist,
      y:       y + Math.sin(angle) * dist,
      alpha:   0.3,
      duration: life * 1400,
      ease:    'Cubic.easeIn',
      onComplete: () => { d.destroy(); }
    });
  }

  // Cleanup groups after full life
  const cleanupTime = (life + 0.2) * 1000;

  scene.time.delayedCall(cleanupTime, () => {
    coreGroup.destroy(true);
  });
}

/* ---------------------------------------------------------------------------
 * Helper: convert a hex string color to Phaser integer tint.
 * ---------------------------------------------------------------------------*/

function getColorFromString(hex) {
  // Strip # if present, parse as integer
  const cleaned = hex.replace('#', '');
  return parseInt(cleaned, 16);
}
