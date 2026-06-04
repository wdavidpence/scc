import Phaser from 'phaser';

/**
 * ParticleManager — handles all environmental particle effects:
 *  - Resource node sparks (mineral harvesting bursts)
 *  - Construction dust (continuous + completion burst)
 *  - Gas geyser emissions (continuous upward drift)
 */
export default class ParticleManager {
  constructor(scene) {
    this.scene = scene;
    this.particles = [];
    this.activeEmitters = {};
    this.resourceSparkTimers = {};
    this.gasEmitterConfigs = {};

    // Per-race color palettes for particles
    this.palettes = {
      terran: {
        mineral: [0x60a5fa, 0x93c5fd, 0x2563eb, 0x38bdf8],
        mineralBright: [0xdbeafe, 0x67e8f9],
        gas: [0xc084fc, 0xf0abfc, 0x8b5cf6],
        gasBright: [0xf0abfc, 0xd8b4fe],
        dust: [0x64748b, 0x94a3b8, 0x475569],
        construction: [0x2563eb, 0x3b82f6, 0x93c5fd],
        completion: [0x60a5fa, 0x93c5fd, 0xdbeafe, 0x2563eb]
      },
      zerg: {
        mineral: [0xf97316, 0xfb923c, 0x22c55e, 0xfbbf24],
        mineralBright: [0xfbbf24, 0xfcd34d],
        gas: [0xa855f7, 0xc084fc, 0xe879f9],
        gasBright: [0xf0abfc, 0xd8b4fe],
        dust: [0x5c3a1e, 0x78350f, 0x451a03],
        construction: [0xea580c, 0xf97316, 0xfbbf24],
        completion: [0xf97316, 0xfb923c, 0xfbbf24, 0x22c55e]
      },
      protoss: {
        mineral: [0xa78bfa, 0xc4b5fd, 0x7c3aed, 0x818cf8],
        mineralBright: [0xd8b4fe, 0xe9d5ff],
        gas: [0xc084fc, 0xd8b4fe, 0x818cf8],
        gasBright: [0xf0abfc, 0xd8b4fe],
        dust: [0x4a2d7a, 0x6b21a8, 0x3b0764],
        construction: [0x8b5cf6, 0xa78bfa, 0xc4b5fd],
        completion: [0xa78bfa, 0xc4b5fd, 0xd8b4fe, 0x818cf8]
      }
    };
  }

  /** Get the color palette for the current race. */
  getPalette() {
    return this.palettes[this.scene.race?.id] || this.palettes.terran;
  }

  // ─── Resource Node Sparks ────────────────────────────────────────

  /**
   * Spawn a burst of mineral spark particles at a resource node.
   * Called when a worker loads or deposits minerals.
   */
  spawnResourceSpark(x, y) {
    const palette = this.getPalette();
    const colors = [...palette.mineral, ...palette.mineralBright];

    // Spawn 12-18 sparks in a radial pattern
    const count = Phaser.Math.Between(12, 18);
    for (let i = 0; i < count; i += 1) {
      const angle = (Math.PI * 2 * i) / count + Phaser.Math.Between(-15, 15);
      const speed = Phaser.Math.Between(30, 90);
      this._createSpark(x, y, angle, speed, colors, 0.4 + Math.random() * 0.3);
    }

    // Add a few upward "sparkle" particles (bright, short-lived)
    for (let i = 0; i < 4; i += 1) {
      this._createSparkle(x + Phaser.Math.Between(-8, 8), y + Phaser.Math.Between(-12, -4));
    }
  }

  /** Create a single spark particle (small rectangle, fast fade). */
  _createSpark(x, y, angle, speed, colors, lifetime) {
    const size = Phaser.Math.Between(2, 5);
    const color = Phaser.Utils.Array.GetRandom(colors);

    const sprite = this.scene.add.rectangle(x, y, size, size, color, 1)
      .setDepth(10);

    // Random initial velocity based on angle
    const vx = Math.cos(angle) * speed;
    const vy = Math.sin(angle) * speed - 20; // slight upward bias

    this.particles.push({
      sprite,
      vx,
      vy,
      life: lifetime,
      maxLife: lifetime,
      gravity: 40 // slight downward pull on sparks
    });

    // Brief scale-up then fade
    this.scene.tweens.add({
      targets: sprite,
      scaleX: Phaser.Math.Between(0.5, 1.5),
      scaleY: Phaser.Math.Between(0.5, 1.5),
      alpha: 0,
      duration: lifetime * 1000,
      ease: 'Cubic.easeOut',
      onComplete: () => sprite.destroy()
    });
  }

  /** Bright "star" sparkle particle for mineral nodes. */
  _createSparkle(x, y) {
    const palette = this.getPalette();
    const color = Phaser.Utils.Array.GetRandom(palette.mineralBright);

    const sprite = this.scene.add.rectangle(x, y, 3, 3, color, 1)
      .setDepth(10);

    this.scene.tweens.add({
      targets: sprite,
      y: y - Phaser.Math.Between(15, 30),
      alpha: 0,
      duration: Phaser.Math.Between(300, 600),
      ease: 'Cubic.easeOut',
      onComplete: () => sprite.destroy()
    });
  }

  /**
   * Periodic idle sparks for active mineral nodes (when workers are mining).
   * Called from update loop.
   */
  spawnIdleResourceSparks(node) {
    if (!node || node.amount <= 0) return;

    const key = `resource_${node.id}`;
    if (this.resourceSparkTimers[key]) return; // already ticking

    const palette = this.getPalette();
    const colors = [...palette.mineral, ...palette.mineralBright];

    // Spawn a slow idle spark every 0.8-1.5 seconds
    const interval = Phaser.Math.Between(800, 1500);

    this.resourceSparkTimers[key] = this.scene.time.addEvent({
      delay: interval,
      callback: () => {
        // Only spawn if node still exists and has minerals
        const activeNode = this.scene.resourceNodes?.find((n) => n.id === node.id);
        if (!activeNode || activeNode.amount <= 0) {
          this.resourceSparkTimers[key]?.destroy();
          delete this.resourceSparkTimers[key];
          return;
        }

        // Spawn 2-3 idle sparks
        for (let i = 0; i < Phaser.Math.Between(2, 3); i += 1) {
          const offsetX = Phaser.Math.Between(-8, 8);
          const offsetY = Phaser.Math.Between(-6, 2);
          this._createSpark(
            node.x + offsetX,
            node.y + offsetY,
            Phaser.Math.Between(-Math.PI * 0.8, -Math.PI * 0.2), // upward arc
            Phaser.Math.Between(15, 35),
            colors,
            0.6 + Math.random() * 0.4
          );
        }

        // Reschedule
        this.resourceSparkTimers[key].reset({
          delay: Phaser.Math.Between(800, 1500),
          repeat: -1
        });
      },
      repeat: -1,
      loop: true
    });
  }

  /** Stop idle sparks for a resource node (when depleted or destroyed). */
  stopResourceSparks(nodeId) {
    const key = `resource_${nodeId}`;
    if (this.resourceSparkTimers[key]) {
      this.resourceSparkTimers[key].destroy();
      delete this.resourceSparkTimers[key];
    }
  }

  // ─── Construction Dust ────────────────────────────────────────────

  /**
   * Start continuous dust emission for a construction site.
   * Called when construction begins.
   */
  startConstructionDust(construction) {
    if (!construction || !construction.x || !construction.y) return;

    const key = `construction_${construction.id}`;
    if (this.activeEmitters[key]) return; // already running

    const palette = this.getPalette();
    const colors = [...palette.dust, ...palette.construction];

    // Create a particle emitter for continuous dust
    const config = {
      x: construction.x,
      y: construction.y,
      lifespan: 800 + Math.random() * 400,
      speed: { min: 5, max: 18 },
      angle: { min: -90, max: -30 }, // mostly upward
      scale: { start: 1.5, end: 0.2 },
      alpha: { start: 0.6, end: 0 },
      quantity: 1,
      frequency: 120, // emit every 120ms
      tint: colors,
      blendMode: 'NORMAL'
    };

    // Create a small ground-level dust puffs (horizontal spread)
    const groundEmitter = this.scene.add.particles(0, 0, 8, 8, {
      ...config,
      x: { min: construction.x - construction.width / 2 + 10, max: construction.x + construction.width / 2 - 10 },
      y: { min: construction.y + construction.height / 2 - 4, max: construction.y + construction.height / 2 + 4 },
      angle: { min: -100, max: -80 }, // slight upward
      gravityY: 15,
      followX: () => construction.x + Phaser.Math.Between(-construction.width / 2 + 10, construction.width / 2 - 10),
      followY: () => construction.y + construction.height / 2,
      lifespan: 600 + Math.random() * 300,
      frequency: 150,
      emitting: true,
      alpha: { start: 0.4, end: 0 },
      scale: { start: 1, end: 0.1 },
      blendMode: 'NORMAL',
      tint: [...palette.dust]
    });

    // Create a vertical dust column (workers moving around construction)
    const columnEmitter = this.scene.add.particles(0, 0, 6, 6, {
      ...config,
      x: { min: construction.x - 20, max: construction.x + 20 },
      y: { min: construction.y - construction.height / 2, max: construction.y + construction.height / 2 },
      angle: { min: -100, max: -70 },
      gravityY: 8,
      lifespan: 1000 + Math.random() * 500,
      frequency: 200,
      emitting: true,
      alpha: { start: 0.35, end: 0 },
      scale: { start: 2, end: 0.3 },
      blendMode: 'NORMAL',
      tint: [...palette.construction]
    });

    this.activeEmitters[key] = { groundEmitter, columnEmitter };
  }

  /** Stop dust emission for a completed/destroyed construction. */
  stopConstructionDust(constructionId) {
    const key = `construction_${constructionId}`;
    const emitter = this.activeEmitters[key];
    if (emitter) {
      emitter.groundEmitter?.destroy();
      emitter.columnEmitter?.destroy();
      delete this.activeEmitters[key];
    }
  }

  /**
   * Spawn a construction completion burst.
   * Called when a building finishes construction.
   */
  spawnConstructionBurst(x, y) {
    const palette = this.getPalette();

    // Big burst of construction-color particles
    const count = 24;
    for (let i = 0; i < count; i += 1) {
      const angle = (Math.PI * 2 * i) / count;
      const speed = Phaser.Math.Between(40, 120);
      this._createSpark(x, y, angle, speed, palette.construction, 0.6 + Math.random() * 0.4);
    }

    // Bright sparkle burst (white/gold for completion)
    const brightColors = palette.mineralBright;
    for (let i = 0; i < 8; i += 1) {
      const angle = (Math.PI * 2 * i) / 8 + Phaser.Math.Between(-10, 10);
      const speed = Phaser.Math.Between(20, 60);
      this._createSpark(x, y, angle, speed, brightColors, 0.5 + Math.random() * 0.3);
    }

    // Expanding ring effect (using a circle tween)
    const ring = this.scene.add.circle(x, y, 8, 0xffffff, 0.7)
      .setStrokeStyle(2, palette.completion[0], 0.8)
      .setDepth(10);

    this.scene.tweens.add({
      targets: ring,
      scaleX: 12,
      scaleY: 12,
      alpha: 0,
      duration: 500,
      ease: 'Cubic.easeOut',
      onComplete: () => ring.destroy()
    });

    // Second, wider ring with delay
    this.scene.time.delayedCall(150, () => {
      const ring2 = this.scene.add.circle(x, y, 10, palette.completion[2], 0.5)
        .setStrokeStyle(1.5, palette.completion[3], 0.6)
        .setDepth(10);

      this.scene.tweens.add({
        targets: ring2,
        scaleX: 18,
        scaleY: 18,
        alpha: 0,
        duration: 600,
        ease: 'Cubic.easeOut',
        onComplete: () => ring2.destroy()
      });
    });
  }

  // ─── Gas Geyser Emissions ─────────────────────────────────────────

  /**
   * Start continuous gas emission at a geyser.
   * Called during map setup for each gas geyser.
   */
  startGeyserEmission(geyser) {
    if (!geyser || !geyser.x || !geyser.y) return;

    const key = `geyser_${geyser.id}`;
    if (this.activeEmitters[key]) return; // already running

    const palette = this.getPalette();
    const colors = [...palette.gas, ...palette.gasBright];

    // Continuous upward gas particles
    const emitter = this.scene.add.particles(0, 0, 10, 10, {
      x: geyser.x,
      y: geyser.y,
      lifespan: 1200 + Math.random() * 600,
      speed: { min: 8, max: 22 },
      angle: { min: -105, max: -75 }, // mostly upward
      scale: { start: 2.5, end: 0.3 },
      alpha: { start: 0.5, end: 0 },
      quantity: 1,
      frequency: 100,
      tint: colors,
      blendMode: 'NORMAL',
      gravityY: 5,
      followX: geyser.x,
      followY: geyser.y,
      emitting: true
    });

    // Store config for dynamic updates
    this.gasEmitterConfigs[key] = { geyser, emitter };
  }

  /** Update gas emission based on remaining gas amount. */
  updateGeyserEmission(geyser) {
    const key = `geyser_${geyser.id}`;
    const config = this.gasEmitterConfigs[key];
    if (!config) return;

    const ratio = geyser.amount / geyser.maxAmount;

    // Fade out emitter as gas depletes
    config.emitter.setAlpha(ratio * 0.5);

    // Slow emission rate as gas runs low
    if (ratio < 0.2) {
      config.emitter.frequency = 400; // very sparse
    } else if (ratio < 0.5) {
      config.emitter.frequency = 200;
    } else {
      config.emitter.frequency = 100;
    }

    // Stop when depleted
    if (ratio <= 0) {
      this.stopGeyserEmission(geyser.id);
    }
  }

  /** Stop gas emission for a depleted/destroyed geyser. */
  stopGeyserEmission(geyserId) {
    const key = `geyser_${geyserId}`;
    const config = this.gasEmitterConfigs[key];
    if (config) {
      config.emitter?.destroy();
      delete this.gasEmitterConfigs[key];
    }
  }

  // ─── Update Loop ──────────────────────────────────────────────────

  /**
   * Called every frame from GameScene.update() to process active particles.
   */
  update(time, delta) {
    const dt = delta / 1000;

    // Process all active particle sprites
    for (let i = this.particles.length - 1; i >= 0; i -= 1) {
      const p = this.particles[i];

      // Apply gravity
      p.vy += (p.gravity || 0) * dt;

      // Move
      p.sprite.x += p.vx * dt;
      p.sprite.y += p.vy * dt;

      // Decrease life
      p.life -= dt;

      if (p.life <= 0) {
        p.sprite.destroy();
        this.particles.splice(i, 1);
      }
    }
  }

  /** Clean up all particles when the scene shuts down. */
  destroy() {
    // Destroy all particle sprites
    this.particles.forEach((p) => p.sprite?.destroy());
    this.particles = [];

    // Destroy all emitters
    Object.values(this.activeEmitters).forEach((em) => {
      em.groundEmitter?.destroy();
      em.columnEmitter?.destroy();
      em.emitter?.destroy();
    });
    this.activeEmitters = {};

    // Destroy all resource spark timers
    Object.values(this.resourceSparkTimers).forEach((timer) => timer?.destroy());
    this.resourceSparkTimers = {};
    this.gasEmitterConfigs = {};
  }
}
