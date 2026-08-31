// HUD for SCC2: resources, command card, selection panel, minimap, alerts.
import Phaser from 'phaser';
import { UNITS, BUILDINGS, TECHS, RACE_INFO, TILE } from '../data/sc1.js';

export class HudScene extends Phaser.Scene {
  constructor() { super('Hud'); }

  init(data) { this.race = data.race || 'terran'; this.world = data.world; }

  create() {
    this.W = this.scale.width; this.H = this.scale.height;
    this.buttons = [];
    this.createTopBar();
    this.createMinimap();
    this.createCommandCard();
    this.createSelectionPanel();
    this.createAlert();
    this.createGameOverPanel();

    const battle = this.scene.get('Battle');
    // clear stale listeners from any previous boot of this scene
    battle.events.off('hud:tick');
    battle.events.off('hud:selection');
    battle.events.off('hud:gameover');
    battle.events.on('hud:tick', () => { if (this.scene.isActive()) this.refresh(); });
    battle.events.on('hud:selection', (info) => { if (this.scene.isActive()) this.onSelection(info); });
    battle.events.on('hud:gameover', (r) => { if (this.scene.isActive()) this.showGameOver(r); });
    this.events.once('shutdown', () => {
      battle.events.off('hud:tick');
      battle.events.off('hud:selection');
      battle.events.off('hud:gameover');
    });

    this.events.on('resize', () => this.handleResize());
    this.input.on('pointerdown', () => { this.audioUnlock = true; });
  }

  fmt(n) { return Math.floor(n).toLocaleString('en-US'); }

  createTopBar() {
    this.top = this.add.graphics();
    this.topBG = this.add.rectangle(0, 0, this.W, 34, 0x05080e, 0.92).setOrigin(0, 0).setScrollFactor(0);
    this.resText = this.add.text(12, 8, '', { fontFamily: 'Menlo, monospace', fontSize: '14px', color: '#dbe7ff' }).setScrollFactor(0);
    this.timeText = this.add.text(this.W / 2, 8, '', { fontFamily: 'Menlo, monospace', fontSize: '13px', color: '#8fa3c8' }).setOrigin(0.5, 0).setScrollFactor(0);
    this.selCount = this.add.text(this.W - 12, 8, '', { fontFamily: 'Menlo, monospace', fontSize: '13px', color: '#6ee7a0' }).setOrigin(1, 0).setScrollFactor(0);
    this.speedBtn = this.mkBtn(this.W - 70, 4, 60, 24, '1x', () => {
      const b = this.scene.get('Battle');
      b.timeScale = b.timeScale === 1 ? 2 : 1;
      this.speedBtn.txt.setText(b.timeScale + 'x');
    });
  }

  createMinimap() {
    this.mmSize = Math.min(190, Math.max(120, this.W * 0.16));
    this.mmX = this.W - this.mmSize - 8;
    this.mmY = 40;
    this.mmBG = this.add.rectangle(this.mmX, this.mmY, this.mmSize, this.mmSize, 0x060a12, 0.95).setOrigin(0, 0).setScrollFactor(0);
    this.mmFrame = this.add.rectangle(this.mmX, this.mmY, this.mmSize, this.mmSize, 0x2b313a, 1).setOrigin(0, 0).setScrollFactor(0).setStrokeStyle(1, 0x3b444f);
    this.mmG = this.add.graphics().setScrollFactor(0);
    const zone = this.add.zone(this.mmX, this.mmY, this.mmSize, this.mmSize).setOrigin(0, 0).setScrollFactor(0).setInteractive({ useHandCursor: true });
    zone.on('pointerdown', (p) => this.mmClick(p.x, p.y));
    zone.on('pointerdrag', (p) => this.mmClick(p.x, p.y));
  }

  mmClick(px, py) {
    const wx = ((px - this.mmX) / this.mmSize) * 96 * TILE;
    const wy = ((py - this.mmY) / this.mmSize) * 96 * TILE;
    this.scene.get('Battle').events.emit('hud:camera', { x: wx, y: wy });
  }

  createCommandCard() {
    this.cardBG = this.add.graphics().setScrollFactor(0);
    this.cardTitle = this.add.text(12, this.H - 116, '', { fontFamily: 'Menlo, monospace', fontSize: '12px', color: '#9fb3d8' }).setScrollFactor(0);
    this.buttons = [];
  }

  createSelectionPanel() {
    this.selText = this.add.text(12, this.H - 138, '', { fontFamily: 'Menlo, monospace', fontSize: '12px', color: '#cfe0ff' }).setScrollFactor(0);
  }

  createAlert() {
    this.alert = this.add.text(this.W / 2, this.H * 0.28, '', { fontFamily: 'Menlo, monospace', fontSize: '16px', color: '#ffd23f', backgroundColor: '#00000088', padding: { x: 10, y: 6 } }).setOrigin(0.5).setScrollFactor(0).setAlpha(0);
  }

  createGameOverPanel() {
    this.goPanel = this.add.container(0, 0).setDepth(2000).setScrollFactor(0).setAlpha(0).setVisible(false);
    const dim = this.add.rectangle(0, 0, 1, 1, 0x02040a, 0.82);
    const title = this.add.text(0, 0, '', { fontFamily: 'Menlo, monospace', fontSize: '40px', color: '#ffffff' }).setOrigin(0.5);
    const sub = this.add.text(0, 44, 'click to return', { fontFamily: 'Menlo, monospace', fontSize: '14px', color: '#8fa3c8' }).setOrigin(0.5);
    this.goPanel.add([dim, title, sub]);
    this.goTitle = title; this.goDim = dim;
    this.input.on('pointerdown', () => { if (!this.gameOver) return; this.scene.stop('Battle'); this.scene.stop('Hud'); this.scene.start('Title'); });
  }

  mkBtn(x, y, w, h, label, cb) {
    const bg = this.add.rectangle(x, y, w, h, 0x18202c, 1).setOrigin(0, 0).setScrollFactor(0).setInteractive({ useHandCursor: true });
    const brd = this.add.rectangle(x, y, w, h, 0x2f3a49, 0).setOrigin(0, 0).setScrollFactor(0).setStrokeStyle(1, 0x3f4a5a);
    const txt = this.add.text(x + w / 2, y + h / 2, label, { fontFamily: 'Menlo, monospace', fontSize: '11px', color: '#dbe7ff', align: 'center' }).setOrigin(0.5).setScrollFactor(0);
    const hit = this.add.zone(x, y, w, h).setOrigin(0, 0).setScrollFactor(0).setInteractive({ useHandCursor: true });
    hit.on('pointerdown', () => { this.flash(bg); cb(); });
    hit.on('pointerover', () => bg.setFillStyle(0x22304a, 1));
    hit.on('pointerout', () => bg.setFillStyle(0x18202c, 1));
    const btn = { bg, brd, txt, hit, x, y, w, h, label, setPosition(nx, ny) { this.x = nx; this.y = ny; bg.setPosition(nx, ny); brd.setPosition(nx, ny); txt.setPosition(nx + w / 2, ny + h / 2); hit.setPosition(nx, ny); } };
    this.buttons.push(btn);
    return btn;
  }

  flash(bg) { bg.setFillStyle(0x3b82f6, 1); this.tweens.add({ targets: bg, fillAlpha: 1, duration: 90, onComplete: () => bg.setFillStyle(0x18202c, 1) }); }

  clearButtons() {
    for (const b of this.buttons) { b.bg.destroy(); b.brd.destroy(); b.txt.destroy(); b.hit.destroy(); }
    this.buttons = [];
  }

  onSelection(info) {
    this.clearButtons();
    const b = this.scene.get('Battle');
    const race = this.race;
    if (info?.building) {
      const sel = info.building;
      this.cardTitle.setText(sel.name.toUpperCase());
      this.selText.setText(`HP ${sel.hp}/${sel.maxHp}`);
      // queue display + train buttons
      const def = BUILDINGS[sel.buildId];
      let i = 0;
      const cols = Math.max(1, Math.min(4, Math.floor((this.W - 24) / 84)));
      const rows = [];
      const prods = (def.produces || []).filter(k => UNITS[k] && UNITS[k].race === race && b.hasBuilding ? true : UNITS[k]);
      for (const k of prods) rows.push({ label: UNITS[k].name.split(' ')[0], cb: () => b.events.emit('hud:queueUnit', { buildingId: sel.buildId, kind: k }), cost: UNITS[k].minerals + (UNITS[k].gas ? '/' + UNITS[k].gas : '') });
      // research
      for (const tId of def.tech || []) {
        const t = TECHS[tId];
        if (!t) continue;
        rows.push({ label: t.name.slice(0, 7), cb: () => b.events.emit('hud:queueResearch', { buildingId: sel.buildId, techId: tId }), cost: t.minerals + (t.gas ? '/' + t.gas : '') });
      }
      rows.slice(0, cols * 2).forEach((r) => {
        const col = i % cols, row = (i / cols) | 0;
        const x = 12 + col * 82, y = this.H - 96 + row * 44;
        this.mkBtn(x, y, 78, 38, `${r.label}\n${r.cost}`, r.cb);
        i++;
      });
      if (def.rally === false && rows.length === 0) {
        this.mkBtn(12, this.H - 96, 78, 38, 'STOP', () => b.events.emit('hud:command', 'stop'));
      }
      return;
    }
    const n = info?.count || 0;
    if (n > 0) {
      const workers = info.units.filter(u => ['scv', 'drone', 'probe'].includes(u.kind)).length === n;
      this.cardTitle.setText(`${n} UNITS${workers ? ' (WORKERS)' : ''}`);
      const names = info.units.slice(0, 3).map(u => `${u.name} ${u.hp}/${u.maxHp}${u.cargo ? ' +' + u.cargo : ''}`).join('  ');
      this.selText.setText(names);
      const order = RACE_INFO[race].buildingOrder.filter(bid => BUILDINGS[bid].race === race);
      const rows = workers ? order : [];
      let i = 0;
      const cols = Math.max(1, Math.min(5, Math.floor((this.W - 24) / 74)));
      const btnDefs = rows.map(bid => ({ label: BUILDINGS[bid].name.split(' ').map(w => w[0]).join('').slice(0, 4).toUpperCase() + '\n' + BUILDINGS[bid].name.split(' ')[0], cb: () => b.events.emit('hud:place', bid) }));
      btnDefs.unshift({ label: 'STOP', cb: () => b.events.emit('hud:command', 'stop') });
      btnDefs.unshift({ label: 'ATTACK\nMOVE', cb: () => b.events.emit('hud:attackMode') });
      btnDefs.slice(0, cols * 2).forEach((r) => {
        const col = i % cols, row = (i / cols) | 0;
        this.mkBtn(12 + col * 72, this.H - 96 + row * 44, 68, 38, r.label, r.cb);
        i++;
      });
      return;
    }
    this.cardTitle.setText('NO SELECTION');
    this.selText.setText('drag to select · right-click to order · A then click = attack-move');
    this.mkBtn(12, this.H - 96, 68, 38, 'HELP', () => this.showHelp());
  }

  showHelp() {
    this.alert.setText('LMB drag=select  RMB=order  A=attack-move  ESC=cancel  1-3=groups  wheel=zoom').setAlpha(1);
    this.tweens.add({ targets: this.alert, alpha: 0, delay: 3200, duration: 400 });
  }

  showGameOver(r) {
    this.gameOver = r;
    this.goPanel.setVisible(true).setAlpha(0);
    this.goDim.setSize(this.W, this.H);
    this.goTitle.setPosition(this.W / 2, this.H / 2 - 20);
    this.goTitle.setText(r === 'victory' ? 'MISSION ACCOMPLISHED' : 'MISSION FAILED');
    this.goTitle.setColor(r === 'victory' ? '#6ee7a0' : '#ff5c5c');
    this.tweens.add({ targets: this.goPanel, alpha: 1, duration: 600 });
  }

  refresh() {
    const b = this.scene.get('Battle');
    if (!b || !b.players) return;
    const p = b.players[0];
    this.resText.setText(`MIN ${this.fmt(p.minerals)}   GAS ${this.fmt(p.gas)}   SUPPLY ${Math.floor(p.supplyUsed)}/${p.supplyCap}`);
    const t = Math.floor(b.gameTime);
    this.timeText.setText(`${String((t / 60) | 0).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`);
    this.selCount.setText(`SEL ${b.selection.size}`);
    this.drawMinimap(b);
    // alert when enemy visible near base
    if (!b._alertShown) {
      const base = b.buildings.find(x => x.team === 0 && x.def.primary);
      if (base) {
        const foe = b.units.find(u => !u.dead && u.team === 1 && Math.hypot(u.x - base.x, u.y - base.y) < TILE * 14);
        if (foe) {
          b._alertShown = true;
          this.alert.setText('ENEMY FORCES ATTACKING').setColor('#ff5c5c').setAlpha(1);
          this.tweens.add({ targets: this.alert, alpha: 0.25, duration: 700, yoyo: true, repeat: 3, onComplete: () => this.alert.setAlpha(0) });
          b.events.once('hud:tick', () => { });
        }
      }
    }
  }

  drawMinimap(b) {
    const g = this.mmG;
    g.clear();
    const s = this.mmSize / (96 * TILE);
    // creep
    for (const t of [0, 1]) {
      const cells = b.creepCanvases[t].cells;
      g.fillStyle(t === 0 ? 0x24406e : 0x5a2340, 0.85);
      for (let i = 0; i < cells.length; i++) if (cells[i]) { g.fillRect(this.mmX + ((i % 96) * 16) * s, this.mmY + (((i / 96) | 0) * 16) * s, 2, 2); }
    }
    g.fillStyle(0x2c4a7a, 0.9);
    for (const m of b.minerals) if (m.amount > 0) g.fillCircle(this.mmX + m.x * s, this.mmY + m.y * s, 1.6);
    g.fillStyle(0x3ad0a0, 0.9);
    for (const ge of b.geysers) g.fillCircle(this.mmX + ge.x * s, this.mmY + ge.y * s, 2);
    for (const bl of b.buildings) {
      if (bl.dead) continue;
      const vis = b.isVisible(bl.x, bl.y) || bl.team === 0;
      if (!vis) continue;
      g.fillStyle(bl.team === 0 ? 0x4ea1ff : 0xff7b2e, bl.built ? 1 : 0.5);
      g.fillRect(this.mmX + bl.x * s - 2, this.mmY + bl.y * s - 2, 4, 4);
    }
    for (const u of b.units) {
      if (u.dead) continue;
      if (u.team !== 0 && !b.isVisible(u.x, u.y)) continue;
      g.fillStyle(u.team === 0 ? 0x9fe0b0 : 0xff9c5c, 1);
      g.fillRect(this.mmX + u.x * s - 1, this.mmY + u.y * s - 1, 2, 2);
    }
    // camera view rect
    const cam = b.cameras.main;
    g.lineStyle(1, 0xffffff, 0.7);
    g.strokeRect(this.mmX + cam.worldView.x * s, this.mmY + cam.worldView.y * s, cam.worldView.width * s, cam.worldView.height * s);
  }

  handleResize() {
    this.W = this.scale.width; this.H = this.scale.height;
    this.topBG.setSize(this.W, 34);
    this.timeText.setPosition(this.W / 2, 8);
    this.selCount.setPosition(this.W - 12, 8);
    this.speedBtn.setPosition(this.W - 70, 4);
    this.mmX = this.W - this.mmSize - 8;
    this.mmBG.setPosition(this.mmX, this.mmY);
    this.mmFrame.setPosition(this.mmX, this.mmY);
    if (this.gameOver) { this.goDim.setSize(this.W, this.H); this.goTitle.setPosition(this.W / 2, this.H / 2 - 20); }
  }
}
