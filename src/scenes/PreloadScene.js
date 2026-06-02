import Phaser from 'phaser';

export default class PreloadScene extends Phaser.Scene {
  constructor() {
    super('PreloadScene');
  }

  create() {
    const { width, height } = this.scale;
    const cx = width / 2;
    const cy = height / 2;

    this.cameras.main.setBackgroundColor('#07111c');

    const backdrop = this.add.rectangle(cx, cy, Math.min(width - 24, 700), Math.min(height - 40, 420), 0x081825, 0.95)
      .setStrokeStyle(2, 0x1f3b61, 1);

    const title = this.add.text(cx, cy - 50, 'Loading SCC command core…', {
      fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      fontSize: 'clamp(24px, 5vw, 42px)',
      fontStyle: '700',
      color: '#ffffff',
      align: 'center'
    }).setOrigin(0.5);

    const detail = this.add.text(cx, cy + 6, 'Preparing the mobile RTS shell, HUD, and race selection menu.', {
      fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      fontSize: 'clamp(14px, 3vw, 20px)',
      color: '#cbd5e1',
      align: 'center',
      wordWrap: { width: Math.min(width - 80, 560) }
    }).setOrigin(0.5);

    const barBack = this.add.rectangle(cx, cy + 82, Math.min(width - 110, 430), 16, 0x0f172a, 1);
    const barFill = this.add.rectangle(cx - Math.min(width - 110, 430) / 2, cy + 82, 8, 16, 0x60a5fa, 1)
      .setOrigin(0, 0.5);

    this.time.addEvent({
      delay: 600,
      callback: () => {
        this.tweens.add({
          targets: barFill,
          width: Math.min(width - 110, 430),
          duration: 260,
          ease: 'Sine.easeInOut',
          onComplete: () => this.scene.start('MenuScene')
        });
      }
    });

    this.scale.on('resize', (gameSize) => {
      const nextCx = gameSize.width / 2;
      const nextCy = gameSize.height / 2;
      backdrop.setPosition(nextCx, nextCy);
      backdrop.setSize(Math.min(gameSize.width - 24, 700), Math.min(gameSize.height - 40, 420));
      title.setPosition(nextCx, nextCy - 50);
      detail.setPosition(nextCx, nextCy + 6);
      barBack.setPosition(nextCx, nextCy + 82);
      barBack.width = Math.min(gameSize.width - 110, 430);
      barFill.setPosition(nextCx - Math.min(gameSize.width - 110, 430) / 2, nextCy + 82);
      barFill.width = Math.min(gameSize.width - 110, 430);
    });
  }
}
