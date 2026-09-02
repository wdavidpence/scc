// Title / mission setup scene for SCC2 — campaign ladder, briefing, upgrade shop.
import Phaser from 'phaser';
import { RACES } from '../data/sc1.js';
import { loadCampaign, saveCampaign, buyUpgrade, missionFor, UPKEEP, UPGRADES, MISSIONS } from '../engine/campaign.js';
import { INTRO_SCRIPT, BRIEFS, TITLE_INTRO_SEEN_KEY } from '../engine/cutscenes.js';

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
    const launchTxt = this.add.text(this.W / 2, top + 200, 'LAUNCH MISSION', { fontFamily: 'Menlo, monospace', fontSize: '18px', color: '#bfe0ff' }).setOrigin(0.5);
    launch.on('pointerdown', () => this.launch());
    launch.on('pointerover', () => launch.setFillStyle(0x1c5da8, 1));
    launch.on('pointerout', () => launch.setFillStyle(0x123f74, 1));
    this.input.keyboard.on('keydown-ENTER', () => this.launch());

    // F10: tutorial entry
    const tut = this.add.rectangle(this.W / 2, top + 262, 220, 36, 0x101822, 1).setStrokeStyle(1, 0x3a8f5f).setInteractive({ useHandCursor: true });
    this.add.text(this.W / 2, top + 262, 'TRAINING (TUTORIAL)', { fontFamily: 'Menlo, monospace', fontSize: '13px', color: '#9fe0b0' }).setOrigin(0.5);
    tut.on('pointerdown', () => this.launchTutorial());
    tut.on('pointerover', () => tut.setFillStyle(0x14582f, 1));
    tut.on('pointerout', () => tut.setFillStyle(0x101822, 1));
    this.input.keyboard.on('keydown-T', () => this.launchTutorial());

    this.add.text(this.W / 2, top + 296, `maintenance -${UPKEEP}cr on launch · ENTER=mission · T=tutorial`, { fontFamily: 'Menlo, monospace', fontSize: '12px', color: '#54688a' }).setOrigin(0.5);
    this.subtitle = this.add.text(this.W / 2, top + 318, '', { fontFamily: 'Menlo, monospace', fontSize: '13px', color: '#9fb3d8' }).setOrigin(0.5);
    this.updateSubtitle();

    this.buildShop();
    this.buildMissionSelect();
    this.replayBtn = null;
    try {
      if (localStorage.getItem('scc.replay.last')) {
        const rb = this.add.rectangle(20, this.H - 28, 150, 30, 0x18202c, 1).setOrigin(0, 0.5).setStrokeStyle(1, 0x3f4a5a).setInteractive({ useHandCursor: true });
        this.add.text(95, this.H - 28, 'WATCH REPLAY', { fontFamily: 'Menlo, monospace', fontSize: '12px', color: '#dbe7ff' }).setOrigin(0.5);
        rb.on('pointerdown', () => this.scene.start('Replay'));
        this.replayBtn = rb;
      }
    } catch (e) { /* private mode */ }

    // watch the opening transmission again
    const ib = this.add.rectangle(this.W - 20, this.H - 28, 170, 30, 0x18202c, 1).setOrigin(1, 0.5).setStrokeStyle(1, 0x3f4a5a).setInteractive({ useHandCursor: true });
    this.add.text(this.W - 105, this.H - 28, 'OPENING TRANSMISSION', { fontFamily: 'Menlo, monospace', fontSize: '11px', color: '#bfe0ff' }).setOrigin(0.5);
    ib.on('pointerdown', () => this.playIntro());

    // cold-open intro on first-ever visit (skip once)
    this.showIntroIfNew();
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
    const args = {
      race: this.pick.race, enemyRace: this.pick.enemy, difficulty: this.pick.difficulty,
      mission: m, campaign: this.camp
    };
    const brief = BRIEFS[m.n];
    if (brief) {
      this.scene.pause('Title');
      this.scene.launch('Cut', { script: brief.beats, title: `MISSION ${m.n} BRIEFING`, mode: 'brief', onComplete: () => this.scene.start('Battle', args) });
    } else {
      this.scene.start('Battle', args);
    }
  }

  playIntro() {
    try { localStorage.setItem(TITLE_INTRO_SEEN_KEY, '1'); } catch (e) { /* private mode */ }
    // overlay: pause Title behind, stop Cut on close, resume Title
    this.scene.pause('Title');
    this.scene.launch('Cut', { script: INTRO_SCRIPT, title: 'OPENING TRANSMISSION', mode: 'intro', onComplete: () => this.scene.resume('Title') });
  }

  showIntroIfNew() {
    let seen = false;
    try { seen = !!localStorage.getItem(TITLE_INTRO_SEEN_KEY); } catch (e) { /* private mode */ }
    if (!seen) this.time.delayedCall(80, () => this.playIntro());
  }

  buildMissionSelect() {
    // GAP 4: episode-grouped mission select (M)
    const EPISODES = [
      { name: 'EPISODE I  ·  CLEANUP OPS', missions: [1, 2, 3, 4] },
      { name: 'EPISODE II  ·  THE SWARM', missions: [5, 6, 7] },
      { name: 'EPISODE III  ·  RECKONING', missions: [8, 9, 10, 11] },
    ];
    this._msel = null;
    this.input.keyboard.on('keydown-M', () => { if (!this._msel) this.openMissionSelect(EPISODES); });
    this.input.keyboard.on('keydown-ESC', () => this.closeMissionSelect());
    const hint = this.add.text(this.W / 2, this.H - 10, 'M = mission select', { fontFamily: 'Menlo, monospace', fontSize: '10px', color: '#54688a' }).setOrigin(0.5).setDepth(50);
  }

  openMissionSelect(EPISODES) {
    if (this._msel) return;
    const c = this._msel = this.add.container(0, 0).setDepth(120);
    const dim = this.add.rectangle(0, 0, this.W, this.H, 0x000000, 0.78).setInteractive();
    dim.on('pointerdown', () => this.closeMissionSelect());
    c.add(dim);
    const W = Math.min(680, this.W - 40), x = (this.W - W) / 2;
    const bg = this.add.rectangle(this.W / 2, this.H / 2, W, 420, 0x0c1420, 0.98).setStrokeStyle(2, 0x4ea1ff);
    c.add(bg);
    c.add(this.add.text(this.W / 2, this.H / 2 - 192, 'CAMPAIGN  OP  SELECT', { fontFamily: 'Menlo, monospace', fontSize: '16px', color: '#ffd23f', fontStyle: 'bold' }).setOrigin(0.5));
    let y = this.H / 2 - 158;
    for (const ep of EPISODES) {
      c.add(this.add.text(x + 16, y, ep.name, { fontFamily: 'Menlo, monospace', fontSize: '12px', color: '#7d93ba', fontStyle: 'bold' }));
      y += 22;
      let xx = x + 16;
      for (const n of ep.missions) {
        const m = MISSIONS[n - 1];
        const unlocked = n <= this.camp.mission;
        const done = n < this.camp.mission;
        const bw = 150, bh = 56;
        if (xx + bw > x + W - 12) { xx = x + 16; y += bh + 8; }
        const btn = this.add.rectangle(xx, y, bw, bh, unlocked ? 0x12304f : 0x0a0f18, 1).setStrokeStyle(1, unlocked ? (done ? 0x3a8f5f : 0x4ea1ff) : 0x2a3240).setInteractive({ useHandCursor: unlocked });
        const lbl = this.add.text(xx + 6, y + 6, `${done ? '[DONE] ' : unlocked ? '' : '[LOCKED] '}${n}. ${m.name}`, { fontFamily: 'Menlo, monospace', fontSize: '10px', color: unlocked ? '#dbe7ff' : '#48566e', wordWrap: { width: bw - 12 } });
        const sub = this.add.text(xx + 6, y + bh - 14, `${m.enemy.toUpperCase()} · ${m.difficulty.toUpperCase()}`, { fontFamily: 'Menlo, monospace', fontSize: '9px', color: unlocked ? '#8fa3c8' : '#3a4557' });
        if (unlocked) {
          btn.on('pointerdown', () => this.launchMissionNum(n));
          btn.on('pointerover', () => btn.setFillStyle(0x1c5da8, 1));
          btn.on('pointerout', () => btn.setFillStyle(0x12304f, 1));
        }
        c.add([btn, lbl, sub]);
        xx += bw + 8;
      }
      y += 72;
    }
    c.add(this.add.text(this.W / 2, this.H / 2 + 190, 'cleared missions replay for half upkeep · M/Esc to close', { fontFamily: 'Menlo, monospace', fontSize: '9px', color: '#54688a' }).setOrigin(0.5));
  }

  closeMissionSelect() {
    if (!this._msel) return;
    this._msel.destroy();
    this._msel = null;
  }

  launchMissionNum(n) {
    this.closeMissionSelect();
    if (this.pick.race === this.pick.enemy) this.pick.enemy = this.pick.race === 'zerg' ? 'terran' : 'zerg';
    const m = MISSIONS[Math.min(MISSIONS.length, Math.max(1, n)) - 1];
    const isReplay = n < this.camp.mission;
    this.camp.credits = Math.max(0, this.camp.credits - (isReplay ? Math.ceil(UPKEEP / 2) : UPKEEP));
    saveCampaign(this.camp);
    const args = { race: this.pick.race, enemyRace: this.pick.enemy, difficulty: this.pick.difficulty, mission: m, campaign: this.camp };
    const brief = BRIEFS[m.n];
    if (brief) {
      this.scene.pause('Title');
      this.scene.launch('Cut', { script: brief.beats, title: `MISSION ${m.n} BRIEFING`, mode: 'brief', onComplete: () => this.scene.start('Battle', args) });
    } else {
      this.scene.start('Battle', args);
    }
  }

  launchTutorial() {
    // F10: guided mission 0 — no campaign cost, soft enemy
    this.scene.start('Battle', {
      race: this.pick.race === 'zerg' ? 'zerg' : 'terran', enemyRace: 'zerg', difficulty: 'easy',
      mission: { n: 0, name: 'TRAINING GROUNDS', enemy: 'zerg', difficulty: 'easy', bonusMinerals: 0, brief: 'Learn the ropes. Follow the marker.' },
      tutorial: true
    });
  }
}
