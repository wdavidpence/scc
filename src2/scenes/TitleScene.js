// Title / mission setup scene for SCC2.
import Phaser from 'phaser';
import { RACES } from '../data/sc1.js';

const RACE_ORDER = ['terran', 'zerg', 'protoss'];

export class TitleScene extends Phaser.Scene {
  constructor() { super('Title'); }

  create() {
    this.W = this.scale.width; this.H = this.scale.height;
    this.pick = { race: 'terran', enemy: 'zerg', difficulty: 'normal' };

    this.add.rectangle(0, 0, this.W, this.H, 0x04070d).setOrigin(0, 0);
    // starfield
    for (let i = 0; i < 90; i++) {
      const s = Math.random() * 2 + 0.5;
      this.add.circle(Math.random() * this.W, Math.random() * this.H, s, 0xffffff, 0.15 + Math.random() * 0.4).setScrollFactor(0);
    }
    const glow = this.add.circle(this.W / 2, -80, 320, 0x123a66, 0.35);
    this.tweens.add({ targets: glow, alpha: { from: 0.2, to: 0.45 }, duration: 2600, yoyo: true, repeat: -1 });

    this.add.text(this.W / 2, this.H * 0.16, 'STARFRONT', { fontFamily: 'Menlo, monospace', fontSize: '54px', color: '#e8f1ff', fontStyle: 'bold' }).setOrigin(0.5);
    this.add.text(this.W / 2, this.H * 0.16 + 52, 'CONFLICT  ·  a StarCraft-inspired RTS', { fontFamily: 'Menlo, monospace', fontSize: '15px', color: '#7d93ba' }).setOrigin(0.5);

    this.buildChoiceRow('RACE', this.W / 2 - 170, this.H * 0.4, 'race');
    this.buildChoiceRow('ENEMY', this.W / 2 - 170, this.H * 0.4 + 76, 'enemy');
    this.buildChoiceRow('DIFFICULTY', this.W / 2 - 170, this.H * 0.4 + 152, 'diff');

    const launch = this.add.rectangle(this.W / 2, this.H * 0.4 + 236, 220, 52, 0x123f74, 1).setStrokeStyle(2, 0x4ea1ff).setInteractive({ useHandCursor: true });
    this.add.text(this.W / 2, this.H * 0.4 + 236, 'LAUNCH MISSION', { fontFamily: 'Menlo, monospace', fontSize: '18px', color: '#bfe0ff' }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    launch.on('pointerdown', () => this.launch());
    launch.on('pointerover', () => launch.setFillStyle(0x1c5da8, 1));
    launch.on('pointerout', () => launch.setFillStyle(0x123f74, 1));
    this.input.keyboard.on('keydown-ENTER', () => this.launch());

    this.add.text(this.W / 2, this.H * 0.4 + 300, 'select race & enemy — ENTER to launch', { fontFamily: 'Menlo, monospace', fontSize: '12px', color: '#54688a' }).setOrigin(0.5);
    this.subtitle = this.add.text(this.W / 2, this.H * 0.16 + 82, '', { fontFamily: 'Menlo, monospace', fontSize: '13px', color: '#9fb3d8' }).setOrigin(0.5);
    this.updateSubtitle();
  }

  updateSubtitle() {
    if (this.subtitle) this.subtitle.setText(RACES[this.pick.race].subtitle);
  }

  buildChoiceRow(label, x, y, field) {
    this.add.text(x, y + 14, label, { fontFamily: 'Menlo, monospace', fontSize: '13px', color: '#7d93ba' }).setOrigin(0, 0.5);
    const opts = field === 'diff' ? ['easy', 'normal', 'hard'] : RACE_ORDER;
    const labels = field === 'diff' ? { easy: 'EASY', normal: 'NORMAL', hard: 'BRUTAL' } : { terran: 'TERRAN', zerg: 'ZERZ', protoss: 'PROTOSS' };
    if (field === 'enemy') labels.zerg = 'ZEARG';
    opts.forEach((o, i) => {
      const bx = x + 110 + i * 130, by = y;
      const r = this.add.rectangle(bx, by, 118, 34, 0x101822, 1).setStrokeStyle(1, 0x2f3a49).setInteractive({ useHandCursor: true });
      const t = this.add.text(bx, by, labels[o] || o.toUpperCase(), { fontFamily: 'Menlo, monospace', fontSize: '13px', color: '#8fa3c8' }).setOrigin(0.5);
      r.setData({ field, val: o });
      r.on('pointerdown', () => {
        this.pick[field === 'race' ? 'race' : field === 'enemy' ? 'enemy' : 'difficulty'] = o;
        this.refreshChoice(field);
        this.updateSubtitle();
      });
      r.on('pointerover', () => t.setColor('#dbe7ff'));
      r.on('pointerout', () => { });
      if (!this.choices) this.choices = [];
      this.choices.push({ r, t, field, val: o });
    });
    this.refreshChoice(field);
  }

  refreshChoice(field) {
    const cur = this.pick[field === 'race' ? 'race' : field === 'enemy' ? 'enemy' : 'difficulty'];
    for (const c of this.choices) {
      if (c.field !== field) continue;
      if (c.val === cur) { c.r.setFillStyle(0x1c5da8, 1).setStrokeStyle(2, 0x4ea1ff); c.t.setColor('#eaf4ff'); }
      else { c.r.setFillStyle(0x101822, 1).setStrokeStyle(1, 0x2f3a49); c.t.setColor('#8fa3c8'); }
    }
  }

  launch() {
    if (this.pick.race === this.pick.enemy) this.pick.enemy = this.pick.race === 'zerg' ? 'terran' : 'zerg';
    this.scene.start('Battle', { race: this.pick.race, enemyRace: this.pick.enemy, difficulty: this.pick.difficulty });
  }
}
