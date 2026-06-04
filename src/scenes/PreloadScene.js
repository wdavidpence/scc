import Phaser from 'phaser';

// Loading-panel sizing constants.  Matching the panel to the viewport
// with a clamped maximum keeps the loading UI readable at every resolution.
const PANEL_MAX_WIDTH  = 700;
const PANEL_MAX_HEIGHT = 420;
const PANEL_PAD_X      = 24;
const PANEL_PAD_Y      = 40;
const BAR_MAX_WIDTH    = 430;
const BAR_PAD_X        = 110;
const DETAIL_PAD_X     = 80;
const DETAIL_MAX_WIDTH = 560;

// Shared text style for loading-screen title and detail.
const LOADING_TEXT_STYLE = {
  fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  align: 'center',
};

function panelSize(w, h) {
  return {
    width:  Math.min(w - PANEL_PAD_X, PANEL_MAX_WIDTH),
    height: Math.min(h - PANEL_PAD_Y, PANEL_MAX_HEIGHT),
  };
}

function barWidth(w) {
  return Math.min(w - BAR_PAD_X, BAR_MAX_WIDTH);
}

function detailWrapWidth(w) {
  return Math.min(w - DETAIL_PAD_X, DETAIL_MAX_WIDTH);
}

// Asset manifest: every spritesheet loaded during preload.
// Each descriptor is { key, path, frameWidth, frameHeight }.
const ASSET_MANIFEST = [
  // Terran unit animation spritesheets (16 frames each: idle, walk, attack, death)
  { key: 'terran-scv',         path: 'assets/sprites/terran-anim/scv.png',       frameWidth: 56, frameHeight: 28 },
  { key: 'terran-marine',      path: 'assets/sprites/terran-anim/marine.png',    frameWidth: 60, frameHeight: 30 },
  { key: 'terran-marauder',    path: 'assets/sprites/terran-anim/marauder.png',  frameWidth: 68, frameHeight: 34 },
  // Terran building spritesheets
  { key: 'terran-command-center', path: 'assets/sprites/terran/command-center.png', frameWidth: 110, frameHeight: 72 },
  { key: 'terran-barracks',       path: 'assets/sprites/terran/barracks.png',     frameWidth: 88, frameHeight: 56 },
  { key: 'terran-factory',        path: 'assets/sprites/terran/factory.png',      frameWidth: 76, frameHeight: 52 },
  // Zerg unit animation spritesheets (16 frames each)
  { key: 'zerg-drone',     path: 'assets/sprites/zerg/drone.png',      frameWidth: 26, frameHeight: 26 },
  { key: 'zerg-zergling',  path: 'assets/sprites/zerg/zergling.png',   frameWidth: 26, frameHeight: 26 },
  { key: 'zerg-hydralisk', path: 'assets/sprites/zerg/hydralisk.png',  frameWidth: 30, frameHeight: 30 },
  { key: 'zerg-baneling',  path: 'assets/sprites/zerg/baneling.png',   frameWidth: 32, frameHeight: 32 },
  // Zerg building spritesheets
  { key: 'zerg-spawning-pool', path: 'assets/sprites/zerg/spawning-pool.png', frameWidth: 84, frameHeight: 58 },
  { key: 'zerg-spire',       path: 'assets/sprites/zerg/spire.png',       frameWidth: 72, frameHeight: 50 },
  // Protoss unit animation spritesheets (16 frames each: idle, walk, attack, death)
  { key: 'protoss-probe',          path: 'assets/sprites/protoss/probe-anim.png',         frameWidth: 28, frameHeight: 28 },
  { key: 'protoss-zealot',         path: 'assets/sprites/protoss/zealot-anim.png',        frameWidth: 32, frameHeight: 32 },
  { key: 'protoss-dragoon',        path: 'assets/sprites/protoss/dragoon-anim.png',       frameWidth: 34, frameHeight: 34 },
  // Protoss building spritesheets
  { key: 'protoss-nexus',              path: 'assets/sprites/protoss/nexus.png',            frameWidth: 112, frameHeight: 74 },
  { key: 'protoss-gateway',            path: 'assets/sprites/protoss/gateway.png',          frameWidth: 90, frameHeight: 60 },
  { key: 'protoss-cybernetics-core',   path: 'assets/sprites/protoss/cybernetics-core.png', frameWidth: 78, frameHeight: 54 },
];

function loadAssetManifest(loader, manifest) {
  for (const asset of manifest) {
    loader.spritesheet(asset.key, asset.path, {
      frameWidth: asset.frameWidth,
      frameHeight: asset.frameHeight,
    });
  }
}

export default class PreloadScene extends Phaser.Scene {
  constructor() {
    super('PreloadScene');
  }

  preload() {
    loadAssetManifest(this.load, ASSET_MANIFEST);
  }

  create() {
    const { width, height } = this.scale;
    const cx = width / 2;
    const cy = height / 2;

    this.cameras.main.setBackgroundColor('#07111c');

    const panel = panelSize(width, height);
    this.backdrop = this.add.rectangle(cx, cy, panel.width, panel.height, 0x081825, 0.95)
      .setStrokeStyle(2, 0x1f3b61, 1);

    this.title = this.add.text(cx, cy - 50, 'Loading SCC command core…', {
      ...LOADING_TEXT_STYLE,
      fontSize: 'clamp(24px, 5vw, 42px)',
      fontStyle: '700',
      color: '#ffffff',
    }).setOrigin(0.5);

    this.detail = this.add.text(cx, cy + 6, 'Preparing the mobile RTS shell, HUD, and race selection menu.', {
      ...LOADING_TEXT_STYLE,
      fontSize: 'clamp(14px, 3vw, 20px)',
      color: '#cbd5e1',
      wordWrap: { width: detailWrapWidth(width) }
    }).setOrigin(0.5);

    const bw = barWidth(width);
    this.barBack = this.add.rectangle(cx, cy + 82, bw, 16, 0x0f172a, 1);
    this.barFill = this.add.rectangle(cx - bw / 2, cy + 82, 8, 16, 0x60a5fa, 1)
      .setOrigin(0, 0.5);

    this.time.addEvent({
      delay: 600,
      callback: () => {
        this.tweens.add({
          targets: this.barFill,
          width: bw,
          duration: 260,
          ease: 'Sine.easeInOut',
          onComplete: () => this.scene.start('MenuScene')
        });
      }
    });

    this.scale.on('resize', (gameSize) => {
      const nextCx = gameSize.width / 2;
      const nextCy = gameSize.height / 2;
      this.backdrop.setPosition(nextCx, nextCy);
      const nextPanel = panelSize(gameSize.width, gameSize.height);
      this.backdrop.setSize(nextPanel.width, nextPanel.height);
      this.title.setPosition(nextCx, nextCy - 50);
      this.detail.setPosition(nextCx, nextCy + 6);
      this.detail.wordWrap.width = detailWrapWidth(gameSize.width);
      const nextBw = barWidth(gameSize.width);
      this.barBack.setPosition(nextCx, nextCy + 82);
      this.barBack.width = nextBw;
      this.barFill.setPosition(nextCx - nextBw / 2, nextCy + 82);
      this.barFill.width = nextBw;
    });
  }

  shutdown() {
    // Clean up preload UI when scene is destroyed.
    if (this.backdrop) this.backdrop.destroy();
    if (this.title) this.title.destroy();
    if (this.detail) this.detail.destroy();
    if (this.barBack) this.barBack.destroy();
    if (this.barFill) this.barFill.destroy();
  }
}
