import Phaser from 'phaser';

export default class PlayScene extends Phaser.Scene {
  constructor() {
    super('PlayScene');
  }

  create() {
    const { width, height } = this.scale;
    this.cameras.main.setBackgroundColor('#0b1020');

    this.add.text(16, 16, 'Play Scene', {
      fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      fontSize: '20px',
      color: '#e2e8f0'
    });

    this.add.text(16, 44, 'Replace this with your game loop, HUD, and input.', {
      fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      fontSize: '14px',
      color: '#94a3b8'
    });

    this.player = this.add.circle(width / 2, height / 2, 20, 0x38bdf8);
    this.target = new Phaser.Math.Vector2(width / 2, height / 2);

    this.input.on('pointermove', (pointer) => {
      this.target.set(pointer.x, pointer.y);
    });

    this.input.on('pointerdown', (pointer) => {
      this.target.set(pointer.x, pointer.y);
    });

    this.scale.on('resize', (gameSize) => {
      if (!this.player) return;
      this.player.setPosition(gameSize.width / 2, gameSize.height / 2);
      this.target.set(gameSize.width / 2, gameSize.height / 2);
    });
  }

  update(time, delta) {
    if (!this.player) return;

    const dt = delta / 1000;
    const speed = 420;
    const dx = this.target.x - this.player.x;
    const dy = this.target.y - this.player.y;
    const distance = Math.hypot(dx, dy);

    if (distance > 2) {
      const step = Math.min(distance, speed * dt);
      this.player.x += (dx / distance) * step;
      this.player.y += (dy / distance) * step;
    }
  }
}
