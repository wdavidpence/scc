// Title / mission setup scene for SCC2 — v2.30 AAA rework.
// Painted title backdrop, faction hero-art cards, idle attract loop,
// juicy buttons with real SFX, diegetic HUD chrome, briefing + shop.
import Phaser from 'phaser';
import { RACES } from '../data/sc1.js';
import { loadCampaign, saveCampaign, buyUpgrade, missionFor, UPKEEP, UPGRADES, MISSIONS } from '../engine/campaign.js';
import { INTRO_SCRIPT, BRIEFS, TITLE_INTRO_SEEN_KEY } from '../engine/cutscenes.js';
import { preloadCinematic } from './CutScene.js';
import * as cin from '../engine/cinematicAudio.js';

const RACE_ORDER = ['terran', 'zerg', 'protoss'];
const MONO = 'Menlo, monospace';
const DISPLAY = 'Orbitron';
const BODY = 'Rajdhani';
const HERO = { terran: 'assets/hero/terran.jpg', zerg: 'assets/hero/zerg.jpg', protoss: 'assets/hero/protoss.jpg' };
const LORE = {
  terran: 'Roughneck colonists. Tough steel, cheap bullets.',
  zerg: 'The swarm. Overwhelming numbers, endless hunger.',
  protoss: 'Ancient psy-tech. Few, devastating, arrogant.',
};

export class TitleScene extends Phaser.Scene {
  constructor() { super('Title'); }

  preload() {
    preloadCinematic(this);
    for (const r of RACE_ORDER) if (!this.textures.exists('hero_' + r)) this.load.image('hero_' + r, HERO[r]);
  }

  create() {
    this.W = this.scale.width; this.H = this.scale.height;
    this.camp = loadCampaign();
    const m = missionFor(this.camp);
    this.pick = { race: 'terran', enemy: m.enemy, difficulty: m.difficulty };
    this._attract = 0; // seconds without input
    this._attractIdx = 0;
    this._attractOn = false;

    cin.resume();
    cin.preloadAll('');

    // ---- painted backdrop (real key art) over graded wash fallback ----
    const bgG = this.add.graphics().setDepth(0);
    bgG.fillGradientStyle(0x14283f, 0x14283f, 0x060b16, 0x060b16, 1);
    bgG.fillRect(0, 0, this.W, this.H);
    if (this.textures.exists('cin_titlebg')) {
      const tex = this.textures.get('cin_titlebg').getSourceImage();
      const sc = Math.max(this.W / tex.width, this.H / tex.height) * 1.06;
      this.bgImg = this.add.image(this.W / 2, this.H / 2, 'cin_titlebg').setScale(sc).setDepth(1).setAlpha(0);
      this.tweens.add({ targets: this.bgImg, alpha: 0.85, duration: 1200, ease: 'Sine.easeIn' });
      // slow Ken Burns drift — the screen is never still
      this.tweens.add({ targets: this.bgImg, x: this.W / 2 - 34, y: this.H / 2 + 12, scale: sc * 1.05, duration: 40000, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      this.add.rectangle(this.W / 2, this.H / 2, this.W, this.H, 0x04070d, 0.42).setDepth(2);
    }
    for (let i = 0; i < 160; i++) {
      const big = Math.random() < 0.1;
      const s = big ? 1.6 + Math.random() * 1.2 : Math.random() * 1.2 + 0.5;
      this.add.circle(Math.random() * this.W, Math.random() * this.H, s, big ? 0xcfe4ff : 0xffffff, 0.18 + Math.random() * 0.4).setScrollFactor(0).setDepth(3);
    }
    const glow = this.add.circle(this.W / 2, -80, 340, 0x2c5d9e, 0.35).setBlendMode(Phaser.BlendModes.ADD).setDepth(3);
    this.tweens.add({ targets: glow, alpha: { from: 0.22, to: 0.5 }, duration: 2600, yoyo: true, repeat: -1 });

    // film grain on the title too
    if (!this.textures.exists('grain')) {
      const ct = this.textures.createCanvas('grain', 128, 128);
      const cx2 = ct.getContext();
      const id = cx2.createImageData(128, 128);
      for (let i = 0; i < id.data.length; i += 4) { const v = 150 + Math.floor(Math.random() * 105); id.data[i] = v; id.data[i + 1] = v; id.data[i + 2] = v; id.data[i + 3] = 22; }
      cx2.putImageData(id, 0, 0); ct.refresh();
    }
    this.grain = this.add.tileSprite(0, 0, this.W, this.H, 'grain').setOrigin(0).setDepth(6).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.4).setScrollFactor(0);

    // ---- logo lockup ----
    const logoY = this.H * 0.1;
    const halo = this.add.circle(this.W / 2, logoY, 150, 0x2c5d9e, 0.14).setBlendMode(Phaser.BlendModes.ADD).setDepth(4);
    this.tweens.add({ targets: halo, scale: 1.3, alpha: 0.05, duration: 2800, yoyo: true, repeat: -1 });
    this.add.text(this.W / 2 + 2, logoY + 1, 'STARFRONT', { fontFamily: DISPLAY, fontSize: '54px', color: '#4ea1ff', fontWeight: '900' }).setOrigin(0.5).setDepth(4).setAlpha(0.35);
    this.add.text(this.W / 2 - 2, logoY - 1, 'STARFRONT', { fontFamily: DISPLAY, fontSize: '54px', color: '#ff7a6b', fontWeight: '900' }).setOrigin(0.5).setDepth(4).setAlpha(0.3);
    this.add.text(this.W / 2, logoY, 'STARFRONT', { fontFamily: DISPLAY, fontSize: '54px', color: '#f4f9ff', fontWeight: '900' }).setOrigin(0.5).setDepth(5);
    const rule = this.add.rectangle(this.W / 2, logoY + 38, 0, 1.5, 0x4ea1ff, 0.8).setDepth(5);
    this.tweens.add({ targets: rule, width: Math.min(560, this.W - 120), duration: 900, ease: 'Cubic.easeOut' });
    this.add.text(this.W / 2, logoY + 52, 'C O N F L I C T   ·   a StarCraft-inspired RTS', { fontFamily: BODY, fontSize: '15px', color: '#8fa9cf', fontWeight: '700' }).setOrigin(0.5).setDepth(5);

    // ---- campaign status + briefing ----
    this.campText = this.add.text(this.W / 2, logoY + 84, `MISSION ${this.camp.mission}/${MISSIONS.length}  ·  ${m.name}  ·  CREDITS ${this.camp.credits}`, { fontFamily: BODY, fontSize: '16px', color: '#ffd23f', fontWeight: '700', letterSpacing: 1 }).setOrigin(0.5).setDepth(5);
    const bw = Math.min(660, this.W - 40);
    const bb = this.add.graphics().setDepth(5);
    bb.fillStyle(0x0a1220, 0.82).fillRoundedRect(this.W / 2 - bw / 2, logoY + 102, bw, 42, 5);
    bb.lineStyle(1, 0x2f3a49, 1).strokeRoundedRect(this.W / 2 - bw / 2, logoY + 102, bw, 42, 5);
    this.add.text(this.W / 2, logoY + 123, m.brief, { fontFamily: BODY, fontSize: '13px', color: '#9fb3d8', fontWeight: '600', align: 'center', wordWrap: { width: bw - 24 } }).setOrigin(0.5).setDepth(6);

    // ---- faction hero cards ----
    this.cards = {};
    const cardW = Math.min(220, (this.W - 80) / 3 - 12);
    const totalW = cardW * 3 + 24;
    const startX = this.W / 2 - totalW / 2 + cardW / 2;
    const cardY = this.H * 0.42;
    RACE_ORDER.forEach((r, i) => {
      const x = startX + i * (cardW + 12);
      this.cards[r] = this.buildCard(r, x, cardY, cardW);
    });

    // ---- enemy + difficulty compact rows ----
    this.buildChoiceRow('ENEMY', this.W / 2 - 190, this.H * 0.66, 'enemy');
    this.buildChoiceRow('DIFFICULTY', this.W / 2 - 190, this.H * 0.66 + 42, 'diff');

    // ---- LAUNCH button with juice ----
    const ly = this.H * 0.66 + 96;
    this.launchBtn = this.buildButton(this.W / 2, ly, 250, 54, 'LAUNCH MISSION', { fill: 0x123f74, stroke: 0x4ea1ff, color: '#bfe0ff', big: true, onDown: () => this.launch() });
    this.input.keyboard.on('keydown-ENTER', () => this.launch());

    this.buildButton(this.W / 2, ly + 66, 250, 34, 'TRAINING (TUTORIAL)', { fill: 0x101822, stroke: 0x3a8f5f, color: '#9fe0b0', onDown: () => this.launchTutorial() });
    this.input.keyboard.on('keydown-T', () => this.launchTutorial());
    this.buildButton(this.W / 2, ly + 104, 250, 34, 'HOT-SEAT 1v1 (H)', { fill: 0x181022, stroke: 0xa06bff, color: '#c9a0ff', onDown: () => this.launchHotseat() });
    this.input.keyboard.on('keydown-H', () => this.launchHotseat());

    this.add.text(this.W / 2, ly + 130, `upkeep −${UPKEEP}cr on launch · click cards & buttons · ENTER=launch`, { fontFamily: MONO, fontSize: '11px', color: '#54688a' }).setOrigin(0.5).setDepth(5);
    this.subtitle = this.add.text(this.W / 2, ly + 148, '', { fontFamily: BODY, fontSize: '13px', color: '#9fb3d8', fontWeight: '600' }).setOrigin(0.5).setDepth(5);
    this.updateSubtitle();

    this.buildShop();
    this.buildMissionSelect();

    // corner utility buttons
    try {
      if (localStorage.getItem('scc.replay.last')) {
        this.buildButton(20, this.H - 28, 150, 28, 'WATCH REPLAY', { fill: 0x18202c, stroke: 0x3f4a5a, color: '#dbe7ff', origin: 'left', onDown: () => this.scene.start('Replay') });
      }
    } catch (e) { /* private mode */ }
    this.buildButton(this.W - 20, this.H - 28, 170, 28, 'OPENING TRANSMISSION', { fill: 0x18202c, stroke: 0x3f4a5a, color: '#bfe0ff', origin: 'right', small: true, onDown: () => this.playIntro() });

    // ---- diegetic HUD chrome: corner brackets + radar sweep + live tag ----
    this.buildHudChrome();

    // idle attract loop
    this._bumpAttract = () => { this._attract = 0; if (this._attractOn) this.endAttract(); };
    this.input.on('pointerdown', this._bumpAttract);
    this.input.keyboard.on('keydown', this._bumpAttract);
    this.events.on('update', this._titleTick, this);

    this.showIntroIfNew();
  }

  // ---------- hero card ----------
  buildCard(race, x, y, w) {
    const rc = RACES[race];
    const col = { terran: 0x4ea1ff, zerg: 0xff8a4c, protoss: 0xffd23f }[race];
    const h = 168;
    const layer = this.add.container(0, 0).setDepth(5); // world-space parent (no local transform)
    const frame = this.add.graphics();
    layer.add(frame);
    const drawFrame = (sel) => {
      frame.clear();
      frame.fillStyle(0x0a1424, sel ? 0.95 : 0.82).fillRoundedRect(x - w / 2, y - h / 2, w, h, 6);
      frame.lineStyle(sel ? 2 : 1, sel ? col : 0x2f3a49, sel ? 1 : 0.8);
      frame.strokeRoundedRect(x - w / 2, y - h / 2, w, h, 6);
      if (sel) frame.fillStyle(col, 0.9).fillRect(x - w / 2 + 6, y - h / 2 - 3, w - 12, 3);
    };
    // hero art in WORLD space so the mask aligns
    let img = null;
    if (this.textures.exists('hero_' + race)) {
      const tex = this.textures.get('hero_' + race).getSourceImage();
      const ih = h - 34;
      const sc = Math.max((w - 8) / tex.width, ih / tex.height); // cover
      img = this.add.image(x, y - h / 2 + 8 + ih / 2, 'hero_' + race).setScale(sc).setDepth(5);
      const mask = this.make.graphics({ add: false });
      mask.fillStyle(0xffffff).fillRoundedRect(x - w / 2 + 4, y - h / 2 + 4, w - 8, ih, 4);
      img.setMask(mask.createGeometryMask());
      img.setAlpha(race === this.pick.race ? 1 : 0.62);
      layer.add(img);
    }
    const shade = this.add.graphics();
    shade.fillStyle(0x0a1424, 0.9).fillRoundedRect(x - w / 2 + 4, y + h / 2 - 30, w - 8, 26, 4);
    layer.add(shade);
    const name = this.add.text(x, y + h / 2 - 17, String(rc.name || race).toUpperCase(), { fontFamily: DISPLAY, fontSize: '15px', color: '#dbe7ff', fontWeight: '700' }).setOrigin(0.5).setDepth(6);
    layer.add(name);
    const zone = this.add.zone(x, y, w, h).setInteractive({ useHandCursor: true }).setDepth(7);
    layer.add(zone);
    const api = { layer, frame, drawFrame, img, name, race, x, y, w, h, col, sel: false };
    zone.on('pointerdown', () => { this.setRace(race); cin.click(0.45); });
    zone.on('pointerover', () => { if (!api.sel && img) this.tweens.add({ targets: img, alpha: 0.85, duration: 140 }); });
    zone.on('pointerout', () => { if (!api.sel && img) this.tweens.add({ targets: img, alpha: 0.62, duration: 140 }); });
    drawFrame(race === this.pick.race);
    return api;
  }

  setRace(race) {
    this.pick.race = race;
    if (this.pick.enemy === race) this.pick.enemy = race === 'zerg' ? 'terran' : 'zerg';
    for (const [k, card] of Object.entries(this.cards)) {
      card.sel = k === race;
      card.drawFrame(card.sel);
      if (card.img) this.tweens.add({ targets: card.img, alpha: card.sel ? 1 : 0.62, duration: 220 });
      this.tweens.add({ targets: card.name, color: card.sel ? '#ffffff' : '#dbe7ff', duration: 200 });
    }
    this.refreshChoice('enemy');
    this.updateSubtitle();
  }

  // ---------- generic juice button ----------
  buildButton(x, y, w, h, label, o = {}) {
    const g = this.add.graphics().setDepth(5);
    const rx = o.origin === 'left' ? x : o.origin === 'right' ? x - w : x - w / 2;
    const paint = (fill, sw) => { g.clear(); g.fillStyle(fill, 1).fillRoundedRect(rx, y - h / 2, w, h, 5); g.lineStyle(sw, o.stroke, 1).strokeRoundedRect(rx, y - h / 2, w, h, 5); };
    paint(o.fill, o.big ? 2 : 1);
    const t = this.add.text(x, y, label, { fontFamily: o.big ? DISPLAY : BODY, fontSize: o.small ? '10px' : o.big ? '17px' : '13px', color: o.color, fontWeight: '700', letterSpacing: o.big ? 2 : 1 }).setOrigin(o.origin === 'left' ? 0 : o.origin === 'right' ? 1 : 0.5).setDepth(6);
    const hit = this.add.zone(x, y, w, h).setInteractive({ useHandCursor: true }).setDepth(7);
    hit.on('pointerdown', () => {
      cin.resume(); cin.click(0.5);
      this.tweens.add({ targets: t, scaleX: 0.96, scaleY: 0.9, yoyo: true, duration: 90, onComplete: () => { if (o.onDown) o.onDown(); } });
      if (o.big) {
        const ring = this.add.circle(x, y, 8, 0, 0).setStrokeStyle(2, o.stroke, 0.9).setDepth(6);
        this.tweens.add({ targets: ring, scale: 6, alpha: 0, duration: 380, ease: 'Cubic.easeOut', onComplete: () => ring.destroy() });
      }
    });
    hit.on('pointerover', () => paint(0x1c5da8, o.big ? 2 : 1));
    hit.on('pointerout', () => paint(o.fill, o.big ? 2 : 1));
    return { g, t, hit };
  }

  // ---------- choice rows (enemy/difficulty) ----------
  buildChoiceRow(label, x, y, field) {
    this.add.text(x, y, label, { fontFamily: BODY, fontSize: '13px', color: '#7d93ba', fontWeight: '700', letterSpacing: 2 }).setOrigin(0, 0.5).setDepth(5);
    const opts = field === 'diff' ? ['easy', 'normal', 'hard'] : RACE_ORDER;
    const labels = field === 'diff' ? { easy: 'EASY', normal: 'NORMAL', hard: 'BRUTAL' } : { terran: 'TERRAN', zerg: 'ZERG', protoss: 'PROTOSS' };
    if (!this.choices) this.choices = [];
    opts.forEach((o, i) => {
      const bx = x + 118 + i * 128, by = y;
      const r = this.add.rectangle(bx, by, 116, 32, 0x101822, 1).setStrokeStyle(1, 0x2f3a49).setInteractive({ useHandCursor: true }).setDepth(5);
      const t = this.add.text(bx, by, labels[o] || o.toUpperCase(), { fontFamily: BODY, fontSize: '13px', color: '#8fa3c8', fontWeight: '700', letterSpacing: 1 }).setOrigin(0.5).setDepth(6);
      r.setData({ field, val: o });
      r.on('pointerdown', () => {
        cin.click(0.4);
        this.pick[field === 'race' ? 'race' : field === 'enemy' ? 'enemy' : 'difficulty'] = o;
        if (field === 'enemy' && this.pick.enemy === this.pick.race) this.pick.enemy = this.pick.race === 'zerg' ? 'terran' : 'zerg';
        this.refreshChoice(field);
        this.updateSubtitle();
        this.tweens.add({ targets: t, scale: { from: 1.15, to: 1 }, duration: 140 });
      });
      r.on('pointerover', () => t.setColor('#dbe7ff'));
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

  updateSubtitle() {
    if (this.subtitle) this.subtitle.setText(LORE[this.pick.race] || (RACES[this.pick.race] && RACES[this.pick.race].subtitle) || '');
  }

  // ---------- HUD chrome ----------
  buildHudChrome() {
    const g = this.add.graphics().setDepth(8);
    const br = 26; // bracket length
    g.lineStyle(2, 0x4ea1ff, 0.5);
    const corners = [[14, 14, 1, 1], [this.W - 14, 14, -1, 1], [14, this.H - 14, 1, -1], [this.W - 14, this.H - 14, -1, -1]];
    for (const [cx, cy, sx, sy] of corners) {
      g.lineBetween(cx, cy + sy * br, cx, cy);
      g.lineBetween(cx, cy, cx + sx * br, cy);
    }
    // radar sweep bottom-right
    const rx = this.W - 74, ry = this.H - 96;
    g.lineStyle(1, 0x3f6b9e, 0.6);
    g.strokeCircle(rx, ry, 34).strokeCircle(rx, ry, 18);
    g.lineBetween(rx - 34, ry, rx + 34, ry).lineBetween(rx, ry - 34, rx, ry + 34);
    const sweep = this.add.graphics().setDepth(8);
    sweep.fillStyle(0x4ea1ff, 0.35); sweep.slice(rx, ry, 34, -0.4, 0.12); sweep.fillPath();
    this.tweens.add({ targets: sweep, angle: 360, duration: 4200, repeat: -1, ease: 'linear' });
    const blip = this.add.circle(rx + 12, ry - 9, 2.4, 0x9fe0b0, 1).setDepth(9);
    this.tweens.add({ targets: blip, alpha: { from: 1, to: 0.15 }, duration: 900, yoyo: true, repeat: -1 });
    // live transmission tag
    const tag = this.add.text(this.W - 24, 24, '● TRANSMISSION LIVE', { fontFamily: BODY, fontSize: '12px', color: '#ff6b6b', fontWeight: '700', letterSpacing: 2 }).setOrigin(1, 0).setDepth(8);
    this.tweens.add({ targets: tag, alpha: { from: 1, to: 0.25 }, duration: 900, yoyo: true, repeat: -1 });
    // sector clock (odometer-ish)
    this._clockTxt = this.add.text(24, 24, 'SECTOR CLOCK 00:00', { fontFamily: BODY, fontSize: '12px', color: '#54688a', fontWeight: '700', letterSpacing: 1 }).setDepth(8);
  }

  _titleTick(t) {
    const dt = Math.min(100, t - (this._lastAttractT || t)) / 1000; this._lastAttractT = t;
    if (this.grain && Math.random() < 0.5) this.grain.setTilePosition(Math.random() * 128, Math.random() * 128);
    if (this._clockTxt) {
      const s = Math.floor(t / 1000);
      const mm = String(Math.floor(s / 60) % 100).padStart(2, '0');
      const ss = String(s % 60).padStart(2, '0');
      const str = `SECTOR CLOCK ${mm}:${ss}`;
      if (this._clockTxt.text !== str) this._clockTxt.setText(str);
    }
    this._attract += dt;
    if (this._attract > 8 && !this._attractOn) this.startAttract();
    if (this._attractOn) {
      const beat = (t / 1000) % 12;
      if (!this._ab || beat < (this._abPrev || 0)) { this.attractBeat(); }
      this._abPrev = beat;
    }
  }

  // ---------- idle attract loop ----------
  startAttract() {
    this._attractOn = true;
    this._attractIdx = RACE_ORDER.indexOf(this.pick.race);
    this._ab = 0;
    if (!this._attractBed) this._attractBed = cin.staticBed(0.05);
    this.attractBeat();
  }
  attractBeat() {
    this._attractIdx = (this._attractIdx + 1) % RACE_ORDER.length;
    const r = RACE_ORDER[this._attractIdx];
    this.setRace(r);
    cin.click(0.25);
  }
  endAttract() {
    this._attractOn = false;
    if (this._attractBed) { try { this._attractBed.s.stop(); } catch (e) {} this._attractBed = null; }
  }

  // ---------- shop ----------
  buildShop() {
    this.shopTexts = [];
    const sx = 16, sy = 60;
    const pw = 216;
    const panel = this.add.graphics().setDepth(5);
    panel.fillStyle(0x0a1220, 0.72).fillRoundedRect(sx - 4, sy - 6, pw, 28 + UPGRADES.length * 24, 5);
    panel.lineStyle(1, 0x2f3a49, 0.8).strokeRoundedRect(sx - 4, sy - 6, pw, 28 + UPGRADES.length * 24, 5);
    const t = this.add.text(sx, sy, 'FIELD REQUISITIONS', { fontFamily: BODY, fontSize: '11px', color: '#7d93ba', fontWeight: '700', letterSpacing: 2 });
    this.shopTexts.push(t);
    UPGRADES.forEach((u, i) => {
      const owned = !!this.camp.owned[u.id];
      const afford = this.camp.credits >= u.cost;
      const locked = u.needs && !this.camp.owned[u.needs];
      const yy = sy + 20 + i * 24;
      const label = owned ? `✓ ${u.name}` : `${u.name}  ${u.cost}cr${locked ? ' 🔒' : ''}`;
      const txt = this.add.text(sx + 8, yy, label, { fontFamily: BODY, fontSize: '12px', fontWeight: '600', color: owned ? '#6ee7a0' : locked ? '#4a5568' : afford ? '#dbe7ff' : '#7d6a54' });
      this.shopTexts.push(txt);
      if (!owned) {
        const zone = this.add.zone(sx, yy - 8, 210, 24).setOrigin(0, 0).setInteractive({ useHandCursor: true });
        zone.on('pointerdown', () => {
          if (buyUpgrade(this.camp, u.id)) {
            txt.setText(`✓ ${u.name}`).setColor('#6ee7a0');
            this.campText.setText(`MISSION ${this.camp.mission}/${MISSIONS.length}  ·  ${missionFor(this.camp).name}  ·  CREDITS ${this.camp.credits}`);
            cin.click(0.5); cin.impact(0.25);
          } else this.audio?.error?.();
        });
        zone.on('pointerover', () => txt.setColor('#f0f6ff'));
        zone.on('pointerout', () => txt.setColor(afford ? '#dbe7ff' : '#7d6a54'));
      }
    });
  }

  buildMissionSelect() {
    const EPISODES = [
      { name: 'EPISODE I  ·  CLEANUP OPS', missions: [1, 2, 3, 4] },
      { name: 'EPISODE II  ·  THE SWARM', missions: [5, 6, 7] },
      { name: 'EPISODE III  ·  RECKONING', missions: [8, 9, 10, 11] },
    ];
    this._msel = null;
    this.input.keyboard.on('keydown-M', () => { if (!this._msel) this.openMissionSelect(EPISODES); });
    this.input.keyboard.on('keydown-ESC', () => this.closeMissionSelect());
    this.add.text(this.W / 2, this.H - 10, 'M = mission select', { fontFamily: MONO, fontSize: '10px', color: '#54688a' }).setOrigin(0.5).setDepth(50);
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
    c.add(this.add.text(this.W / 2, this.H / 2 - 192, 'CAMPAIGN  OP  SELECT', { fontFamily: DISPLAY, fontSize: '16px', color: '#ffd23f', fontWeight: '700', letterSpacing: 2 }).setOrigin(0.5));
    let y = this.H / 2 - 158;
    for (const ep of EPISODES) {
      c.add(this.add.text(x + 16, y, ep.name, { fontFamily: BODY, fontSize: '12px', color: '#7d93ba', fontWeight: '700', letterSpacing: 1 }));
      y += 22;
      let xx = x + 16;
      for (const n of ep.missions) {
        const m = MISSIONS[n - 1];
        const unlocked = n <= this.camp.mission;
        const done = n < this.camp.mission;
        const bw = 150, bh = 56;
        if (xx + bw > x + W - 12) { xx = x + 16; y += bh + 8; }
        const btn = this.add.rectangle(xx, y, bw, bh, unlocked ? 0x12304f : 0x0a0f18, 1).setStrokeStyle(1, unlocked ? (done ? 0x3a8f5f : 0x4ea1ff) : 0x2a3240).setInteractive({ useHandCursor: unlocked });
        const lbl = this.add.text(xx + 6, y + 6, `${done ? '[DONE] ' : unlocked ? '' : '[LOCKED] '}${n}. ${m.name}`, { fontFamily: BODY, fontSize: '11px', fontWeight: '600', color: unlocked ? '#dbe7ff' : '#48566e', wordWrap: { width: bw - 12 } });
        const sub = this.add.text(xx + 6, y + bh - 14, `${m.enemy.toUpperCase()} · ${m.difficulty.toUpperCase()}`, { fontFamily: BODY, fontSize: '10px', fontWeight: '600', color: unlocked ? '#8fa3c8' : '#3a4557' });
        if (unlocked) {
          btn.on('pointerdown', () => { cin.click(0.5); this.launchMissionNum(n); });
          btn.on('pointerover', () => btn.setFillStyle(0x1c5da8, 1));
          btn.on('pointerout', () => btn.setFillStyle(0x12304f, 1));
        }
        c.add([btn, lbl, sub]);
        xx += bw + 8;
      }
      y += 72;
    }
    c.add(this.add.text(this.W / 2, this.H / 2 + 190, 'cleared missions replay for half upkeep · M/Esc to close', { fontFamily: MONO, fontSize: '9px', color: '#54688a' }).setOrigin(0.5));
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
      this.endAttract();
      this.scene.pause('Title');
      this.scene.launch('Cut', { script: brief.beats, title: `MISSION ${m.n} BRIEFING`, mode: 'brief', onComplete: () => this.scene.start('Battle', args) });
    } else {
      cin.whoosh(0.6);
      this.scene.start('Battle', args);
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
      this.endAttract();
      this.scene.pause('Title');
      this.scene.launch('Cut', { script: brief.beats, title: `MISSION ${m.n} BRIEFING`, mode: 'brief', onComplete: () => this.scene.start('Battle', args) });
    } else {
      cin.whoosh(0.6);
      this.scene.start('Battle', args);
    }
  }

  playIntro() {
    try { localStorage.setItem(TITLE_INTRO_SEEN_KEY, '1'); } catch (e) { /* private mode */ }
    this.endAttract();
    this.scene.pause('Title');
    this.scene.launch('Cut', { script: INTRO_SCRIPT, title: 'OPENING TRANSMISSION', mode: 'intro', onComplete: () => this.scene.resume('Title') });
  }

  showIntroIfNew() {
    let seen = false;
    try { seen = !!localStorage.getItem(TITLE_INTRO_SEEN_KEY); } catch (e) { /* private mode */ }
    if (!seen) this.time.delayedCall(80, () => this.playIntro());
  }

  shutdown() {
    this.events.off('update', this._titleTick, this);
    this.endAttract();
    cin.stopAll(this._audioNodes);
  }
}
