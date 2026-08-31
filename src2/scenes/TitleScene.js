// Title / mission setup scene for SCC2 — campaign ladder, briefing, upgrade shop.
import Phaser from 'phaser';
import { RACES } from '../data/sc1.js';
import { loadCampaign, saveCampaign, buyUpgrade, missionFor, UPKEEP, UPGRADES, MISSIONS } from '../engine/campaign.js';

const RACE_ORDER = ['terran', 'zerg', 'protoss'];

export class TitleScene extends Phaser.Scene {
  constructor() { super('Title'); }

  create() {
    this.W = this.scale.width; this.H = this.scale.height;
    this.camp = loadCampaign();
    const m = missionFor(this.camp);
    this.pick = { race: 'terran', enemy: m.enemy, difficulty: m.difficulty };

    this.add.rectangle(0, 0, this.W, this.H, 0x04070d).setOrigin(0, 0);
    for (let i = 0; i < 90; i++) {
      const s = Math.random() * 2 + 0.5;
      this.add.circle(Math.random() * this.W, Math.random() * this.H, s, 0xffffff, 0.15 + Math.random() * 0.4).setScrollFactor(0);
    }
    const glow = this.add.circle(this.W / 2, -80, 320, 0x123a66, 0.35);
    this.tweens.add({ targets: glow, alpha: { from: 0.2, to: 0.45 }, duration: 2600, yoyo: true, repeat: -1 });

    this.add.text(this.W / 2, this.H * 0.1, 'STARFRONT', { fontFamily: 'Menlo, monospace', fontSize: '50px', color: '#e8f1ff', fontStyle: 'bold' }).setOrigin(0.5);
    this.add.text(this.W / 2, this.H * 0.1 + 46, 'CONFLICT  ·  a StarCraft-inspired RTS', { fontFamily: 'Menlo, monospace', fontSize: '14px', color: '#7d93ba' }).setOrigin(0.5);

    // ---- campaign status + briefing ----
    this.campText = this.add.text(this.W / 2, this.H * 0.1 + 78, `MISSION ${this.camp.mission}/${MISSIONS.length}  ·  ${m.name}  ·  CREDITS ${this.camp.credits}`, { fontFamily: 'Menlo, monospace', fontSize: '15px', color: '#ffd23f' }).setOrigin(0.5);
    const briefBox = this.add.rectangle(this.W / 2, this.H * 0.1 + 118, Math.min(640, this.W - 40), 44, 0x0a1220, 0.85).setOrigin(0.5).setStrokeStyle(1, 0x2f3a49);
    this.add.text(this.W / 2, this.H * 0.1 + 118, m.brief, { fontFamily: 'Menlo, monospace', fontSize: '12px', color: '#9fb3d8', align: 'center', wordWrap: { width: Math.min(620, this.W - 60) } }).setOrigin(0.5);

    const top = this.H * 0.42;
    this.buildChoiceRow('RACE', this.W / 2 - 170, top, 'race');
    this.buildChoiceRow('ENEMY', this.W / 2 - 170, top + 64, 'enemy');
    this.buildChoiceRow('DIFFICULTY', this.W / 2 - 170, top + 128, 'diff');

    const launch = this.add.rectangle(this.W / 2, top + 200, 220, 52, 0x123f74, 1).setStrokeStyle(2, 0x4ea1ff).setInteractive({ useHandCursor: true });
    this.add.text(this.W / 2, top + 200, 'LAUNCH MISSION', { fontFamily: 'Menlo, monospace', fontSize: '18px', color: '#bfe0ff' }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    launch.on('pointerdown', () => this.launch());
    launch.on('pointerover', () => launch.setFillStyle(0x1c5da8, 1));
    launch.on('pointerout', () => launch.setFillStyle(0x123f74, 1));
    this.input.keyboard.on('keydown-ENTER', () => this.launch());

    this.add.text(this.W / 2, top + 262, `maintenance -${UPKEEP}cr on launch · ENTER to launch`, { fontFamily: 'Menlo, monospace', fontSize: '12px', color: '#54688a' }).setOrigin(0.5);
    this.subtitle = this.add.text(this.W / 2, top + 284, '', { fontFamily: 'Menlo, monospace', fontSize: '13px', color: '#9fb3d8' }).setOrigin(0.5);
    this.updateSubtitle();

    this.buildShop();
    this.replayBtn = null;
    try {
      if (localStorage.getItem('scc.replay.last')) {
        const rb = this.add.rectangle(20, this.H - 28, 150, 30, 0x18202c, 1).setOrigin(0, 0.5).setStrokeStyle(1, 0x3f4a5a).setInteractive({ useHandCursor: true });
        this.add.text(95, this.H - 28, 'WATCH REPLAY', { fontFamily: 'Menlo, monospace', fontSize: '12px', color: '#dbe7ff' }).setOrigin(0.5);
        rb.on('pointerdown', () => this.scene.start('Replay'));
        this.replayBtn = rb;
      }
    } catch (e) { /* private mode */ }
  }

  buildShop() {
    this.shopTexts = [];
    const sx = 16, sy = 60;
    const t = this.add.text(sx, sy, 'FIELD REQUISITIONS', { fontFamily: 'Menlo, monospace', fontSize: '11px', color: '#7d93ba' });
    this.shopTexts.push(t);
    UPGRADES.forEach((u, i) => {
      const owned = !!this.camp.owned[u.id];
      const afford = this.camp.credits >= u.cost;
      const locked = u.needs && !this.camp.owned[u.needs];
      const yy = sy + 22 + i * 26;
      const label = owned ? `✓ ${u.name}` : `${u.name}  ${u.cost}cr${locked ? ' 🔒' : ''}`;
      const txt = this.add.text(sx + 8, yy, label, { fontFamily: 'Menlo, monospace', fontSize: '11px', color: owned ? '#6ee7a0' : locked ? '#4a5568' : afford ? '#dbe7ff' : '#7d6a54' });
      this.shopTexts.push(txt);
      if (!owned) {
        const zone = this.add.zone(sx, yy - 8, 210, 24).setOrigin(0, 0).setInteractive({ useHandCursor: true });
        zone.on('pointerdown', () => {
          if (buyUpgrade(this.camp, u.id)) {
            txt.setText(`✓ ${u.name}`).setColor('#6ee7a0');
            this.campText.setText(`MISSION ${this.camp.mission}/${MISSIONS.length}  ·  ${missionFor(this.camp).name}  ·  CREDITS ${this.camp.credits}`);
            this.audioPing();
          } else this.audio?.error?.();
        });
      }
    });
  }

  audioPing() {
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this._ac = this._ac || new AC();
      const o = this._ac.createOscillator(); const g = this._ac.createGain();
      o.frequency.value = 880; g.gain.setValueAtTime(0.04, this._ac.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, this._ac.currentTime + 0.1);
      o.connect(g); g.connect(this._ac.destination); o.start(); o.stop(this._ac.currentTime + 0.12);
    } catch (e) { /* silent */ }
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
    const m = missionFor(this.camp);
    this.camp.credits = Math.max(0, this.camp.credits - UPKEEP);
    saveCampaign(this.camp);
    this.scene.start('Battle', {
      race: this.pick.race, enemyRace: this.pick.enemy, difficulty: this.pick.difficulty,
      mission: m, campaign: this.camp
    });
  }
}
