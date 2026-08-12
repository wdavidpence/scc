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

export default class PreloadScene extends Phaser.Scene {
  constructor() {
    super('PreloadScene');
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

    this.scale.on('resize', this.handleResize, this);
  }

  handleResize(gameSize) {
    const nextCx = gameSize.width / 2;
    const nextCy = gameSize.height / 2;
    if (this.backdrop?.active && this.backdrop.geom) {
      this.backdrop.setPosition(nextCx, nextCy);
      const nextPanel = panelSize(gameSize.width, gameSize.height);
      this.backdrop.setSize(nextPanel.width, nextPanel.height);
    }
    if (this.title?.active) this.title.setPosition(nextCx, nextCy - 50);
    if (this.detail?.active) {
      this.detail.setPosition(nextCx, nextCy + 6);
      if (this.detail.wordWrap) this.detail.wordWrap.width = detailWrapWidth(gameSize.width);
    }
    const nextBw = barWidth(gameSize.width);
    if (this.barBack?.active) {
      this.barBack.setPosition(nextCx, nextCy + 82);
      this.barBack.width = nextBw;
    }
    if (this.barFill?.active) {
      this.barFill.setPosition(nextCx - nextBw / 2, nextCy + 82);
      this.barFill.width = nextBw;
    }
  }

  shutdown() {
    if (this.scale) this.scale.off('resize', this.handleResize, this);
    // Clean up preload UI when scene is destroyed.
    if (this.backdrop) this.backdrop.destroy();
    if (this.title) this.title.destroy();
    if (this.detail) this.detail.destroy();
    if (this.barBack) this.barBack.destroy();
    if (this.barFill) this.barFill.destroy();
  }
}
