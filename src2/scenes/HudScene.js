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
    this.createMsgLog();
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
    battle.events.on('hud:alert', (msg) => { if (this.scene.isActive()) this.banner(msg); });
    battle.events.on('hud:pause', (on) => { if (this.scene.isActive()) this.showPause(on); });
    battle.events.on('hud:cinema', (r) => { if (this.scene.isActive()) this.cinemaFlash(r); });
    battle.events.on('hud:radio', (msg, who) => { if (this.scene.isActive()) this.radio(msg, who); });
    battle.events.on('hud:groups', (gs) => { if (this.scene.isActive()) this.renderGroupBadges(gs); });
    battle.events.on('hud:groupcontents', (d) => { if (this.scene.isActive()) this.showGroupContents(d); });
    this.events.once('shutdown', () => {
      battle.events.off('hud:tick');
      battle.events.off('hud:selection');
      battle.events.off('hud:gameover');
      battle.events.off('hud:alert');
      battle.events.off('hud:pause');
      battle.events.off('hud:cinema');
      battle.events.off('hud:radio');
      battle.events.off('hud:groups');
      battle.events.off('hud:groupcontents');
    });

    this.events.on('resize', () => this.handleResize());
    this.input.on('pointerdown', () => { this.audioUnlock = true; });
  }

  fmt(n) { return Math.floor(n).toLocaleString('en-US'); }

  createTopBar() {
    this.top = this.add.graphics();
    this.topBG = this.add.rectangle(0, 0, this.W, 34, 0x05080e, 0.92).setOrigin(0, 0).setScrollFactor(0);
    this.resText = this.add.text(12, 8, '', { fontFamily: 'Menlo, monospace', fontSize: '14px', color: '#dbe7ff' }).setScrollFactor(0);
    this.tickTxt = this.add.text(200, 8, '', { fontFamily: 'Menlo, monospace', fontSize: '13px', color: '#7db4ff', fontStyle: 'bold' }).setScrollFactor(0).setAlpha(0);
    this.timeText = this.add.text(this.W / 2, 8, '', { fontFamily: 'Menlo, monospace', fontSize: '13px', color: '#8fa3c8' }).setOrigin(0.5, 0).setScrollFactor(0);
    this.selCount = this.add.text(this.W - 12, 8, '', { fontFamily: 'Menlo, monospace', fontSize: '13px', color: '#6ee7a0' }).setOrigin(1, 0).setScrollFactor(0);
    this.apmText = this.add.text(this.W - 150, 8, '', { fontFamily: 'Menlo, monospace', fontSize: '12px', color: '#9fb3d8' }).setOrigin(0.5, 0).setScrollFactor(0);
    this.speedBtn = this.mkBtn(this.W - 70, 4, 60, 24, '1x', () => {
      const b = this.scene.get('Battle');
      b.timeScale = b.timeScale === 1 ? 2 : 1;
      this.speedBtn.txt.setText(b.timeScale + 'x');
    });
    this.createUltimateBar();
    this.createObjectives();
  }

  createUltimateBar() {
    this.ultBtnBG = this.add.rectangle(this.W / 2, this.H - 118, 150, 20, 0x101822, 1).setOrigin(0.5, 0).setScrollFactor(0).setStrokeStyle(1, 0x3f4a5a).setInteractive({ useHandCursor: true });
    this.ultFill = this.add.rectangle(this.W / 2 - 74, this.H - 116, 0, 16, 0xff9c3c, 0.9).setOrigin(0, 0).setScrollFactor(0);
    this.ultTxt = this.add.text(this.W / 2, this.H - 108, 'ULTIMATE', { fontFamily: 'Menlo, monospace', fontSize: '10px', color: '#8fa3c8' }).setOrigin(0.5).setScrollFactor(0);
    this.ultBtnBG.on('pointerdown', () => this.scene.get('Battle').armUltimate());
  }

  createObjectives() {
    this.objText = this.add.text(12, 44, '', { fontFamily: 'Menlo, monospace', fontSize: '11px', color: '#9fb3d8', lineHeight: 16 }).setScrollFactor(0);
    const b = this.scene.get('Battle');
    b.events.on('hud:objectives', (objs) => { if (this.scene.isActive()) this.renderObjectives(objs); });
    this.events.once('shutdown', () => b.events.off('hud:objectives'));
    this.renderObjectives(b.objectives);
    this.buildIntelPanel();
    this.buildTechTreePanel();
  }

  // ---------------- AAA tech tree browser (F11) ----------------
  buildTechTreePanel() {
    this._tech = this.add.container(0, 0).setDepth(96).setScrollFactor(0).setVisible(false);
    const dim = this.add.rectangle(0, 0, this.W, this.H, 0x000000, 0.74).setInteractive();
    const W = Math.min(860, this.W - 40), H = Math.min(460, this.H - 80);
    const cx = this.W / 2, cy = this.H / 2;
    const bg = this.add.rectangle(cx, cy, W, H, 0x0a121e, 0.98).setStrokeStyle(2, 0x7ad7ff, 0.85);
    const title = this.add.text(cx, cy - H / 2 + 20, 'T E C H   T R E E', { fontFamily: 'Menlo, monospace', fontSize: '16px', color: '#7ad7ff', fontStyle: 'bold' }).setOrigin(0.5);
    const hint = this.add.text(cx, cy + H / 2 - 12, 'F11 / ESC to close · click an available upgrade to queue research', { fontFamily: 'Menlo, monospace', fontSize: '10px', color: '#5f748f' }).setOrigin(0.5);
    this._techRows = [];
    const rowH = 18, startY = cy - H / 2 + 44;
    const b0 = this.scene.get('Battle');
    const race = b0?.race || 'terran';
    const techIds = Object.keys(TECHS).filter(k => this.techMatchesRace(k, b0));
    let y = startY;
    for (const id of techIds) {
      if (y > cy + H / 2 - 30) break;
      const t = TECHS[id];
      const txt = this.add.text(cx - W / 2 + 18, y, '', { fontFamily: 'Menlo, monospace', fontSize: '11px', color: '#9fb3d8', lineHeight: rowH }).setOrigin(0, 0);
      const hit = this.add.rectangle(cx - W / 2 + 8, y + 7, W - 30, rowH - 2, 0xffffff, 0.001).setInteractive({ useHandCursor: true });
      const row = { id, txt, hit, y: y - startY };
      hit.on('pointerdown', () => this.techRowClick(row));
      hit.on('pointerover', () => { if (!row.disabled) { txt.setColor('#ffffff'); } });
      hit.on('pointerout', () => { this.refreshTechTree(); });
      this._tech.add([txt, hit]);
      this._techRows.push(row);
      y += rowH;
    }
    this._tech.add([dim, bg, title, hint]);
    this.input.keyboard.on('keydown-F11', () => { if (this.scene.isActive()) this.toggleTechTree(); });
    dim.on('pointerdown', () => this.toggleTechTree(false));
  }

  techMatchesRace(techId, b) {
    const t = TECHS[techId];
    const race = b?.race || 'terran';
    const raceTech = {
      terran: ['terranInfantryWeapons', 'terranInfantryArmor', 'vehiclePlating', 'radar', 'controlTower', 'caduceusReactor', 'combatMedics', 'machineShop'],
      zerg: ['zergMeleeAttacks', 'zergCarapace', 'lurkerEgg', 'chitinousPlating', 'greaterSpire', 'lair', 'hive', 'guardian', 'devourer'],
      protoss: ['gatewayWarp', 'zealotSpeed', 'dragoonRange', 'roboticsFacilityTech', 'psionicStorm', 'darkTemplar', 'fleetBeacon', 'protossGround', 'darkArchonMerge'],
    };
    const match = raceTech[race] || raceTech.terran;
    return match.some(m => techId.startsWith(m) || techId === m);
  }

  toggleTechTree(force) {
    const on = force !== undefined ? force : !this._tech.visible;
    this._tech.setVisible(on);
    if (on) this.refreshTechTree();
  }

  techRowClick(row) {
    if (row.disabled) return;
    const b = this.scene.get('Battle');
    // find a built building that hosts this tech and queue it there
    const t = TECHS[row.id];
    const host = b.buildings.find(bb => !bb.dead && bb.built && bb.team === 0 && (bb.buildId === t.at || bb.morphedTo === t.at));
    if (!host) { this.scene.get('Battle').events.emit('hud:alert', `REQUIRES ${t.at ? (BUILDINGS[t.at]?.name || t.at).toUpperCase() : 'HOST'} ON FIELD`); return; }
    host.queueResearch(row.id) ? this.scene.get('Battle').events.emit('hud:alert', `RESEARCH QUEUED: ${t.name.toUpperCase()}`) : this.audio?.error?.();
    this.refreshTechTree();
  }

  refreshTechTree() {
    if (!this._tech || !this._tech.visible) return;
    const b = this.scene.get('Battle');
    if (!b || !b.players) return;
    const p = b.players[0];
    const status = {};
    for (const r of this._techRows || []) {
      const t = TECHS[r.id];
      const done = p.techs[r.id];
      const queued = b.buildings.some(bb => !bb.dead && (bb.queue || []).some(q => q.research === r.id));
      const host = b.buildings.find(bb => !bb.dead && bb.built && bb.team === 0 && (bb.buildId === t.at || bb.morphedTo === t.at));
      const prereqOk = !t.requiresTech || p.techs[t.requiresTech];
      const afford = p.minerals >= t.minerals && p.gas >= (t.gas || 0);
      r.disabled = done || queued || !host || !prereqOk;
      const mark = done ? '✔' : queued ? '…' : host && prereqOk ? (afford ? '◆' : '◇') : '✕';
      const name = t.name.padEnd(22, ' ');
      const cost = `${t.minerals}M ${t.gas || 0}G ${t.time}s`.padEnd(16, ' ');
      const note = done ? 'RESEARCHED' : queued ? 'IN PROGRESS' : !prereqOk ? `REQ: ${TECHS[t.requiresTech]?.name || t.requiresTech}` : !host ? `NEED ${BUILDINGS[t.at]?.name || t.at}` : afford ? 'AVAILABLE' : 'INSUFFICIENT';
      r.txt.setText(`${mark} ${name} ${cost} ${note}`);
      r.txt.setColor(done ? '#9fe0b0' : queued ? '#ffd23f' : host && prereqOk && afford ? '#dbe7ff' : '#5f748f');
    }
  }

  // ---------------- SC1-style intelligence panel (F10) ----------------
  buildIntelPanel() {
    this._intel = this.add.container(0, 0).setDepth(95).setScrollFactor(0).setVisible(false);
    const dim = this.add.rectangle(0, 0, this.W, this.H, 0x000000, 0.72).setInteractive();
    const W = Math.min(720, this.W - 60), H = Math.min(420, this.H - 90);
    const cx = this.W / 2, cy = this.H / 2;
    const bg = this.add.rectangle(cx, cy, W, H, 0x0c1420, 0.98).setStrokeStyle(2, 0xffd23f, 0.85);
    const title = this.add.text(cx, cy - H / 2 + 22, 'S C C   I N T E L L I G E N C E', { fontFamily: 'Menlo, monospace', fontSize: '16px', color: '#ffd23f', fontStyle: 'bold' }).setOrigin(0.5);
    const hint = this.add.text(cx, cy + H / 2 - 14, 'F10 / ESC to close', { fontFamily: 'Menlo, monospace', fontSize: '10px', color: '#5f748f' }).setOrigin(0.5);
    const colL = cx - W / 2 + 20, colR = cx + 24;
    this._intelP = this.add.text(colL, cy - H / 2 + 46, '', { fontFamily: 'Menlo, monospace', fontSize: '12px', color: '#9fe0b0', lineHeight: 18 }).setOrigin(0, 0);
    this._intelE = this.add.text(colR, cy - H / 2 + 46, '', { fontFamily: 'Menlo, monospace', fontSize: '12px', color: '#e0a0a0', lineHeight: 18 }).setOrigin(0, 0);
    this._intelO = this.add.text(colL, cy + H / 2 - 96, '', { fontFamily: 'Menlo, monospace', fontSize: '11px', color: '#9fb3d8', lineHeight: 16 }).setOrigin(0, 0);
    this._intel.add([dim, bg, title, hint, this._intelP, this._intelE, this._intelO]);
    this.input.keyboard.on('keydown-F10', () => { if (this.scene.isActive()) this.toggleIntel(); });
    dim.on('pointerdown', () => this.toggleIntel(false));
  }

  toggleIntel(force) {
    const on = force !== undefined ? force : !this._intel.visible;
    this._intel.setVisible(on);
    if (on) { this.refreshIntel(); if (!this._intelTimer) this._intelTimer = this.time.addEvent({ delay: 1000, loop: true, callback: () => { if (this._intel.visible) this.refreshIntel(); } }); }
  }

  refreshIntel() {
    const b = this.scene.get('Battle');
    if (!b || !b.players) return;
    const fmt = (t) => {
      const p = b.players[t];
      const army = b.units.filter(u => !u.dead && u.team === t);
      const blds = b.buildings.filter(x => !x.dead && x.team === t);
      const byKind = {};
      army.forEach(u => { byKind[u.kind] = (byKind[u.kind] || 0) + 1; });
      const mix = Object.entries(byKind).sort((a, z) => z[1] - a[1]).slice(0, 6).map(([k, n]) => `${n}x ${(UNITS[k] && UNITS[k].name) || k}`).join('\n') || '      no contact';
      const techs = Object.keys(p.techs || {}).filter(k => p.techs[k]);
      const up = p.upgrades || {};
      const lines = [];
      lines.push(`${t === 0 ? 'YOUR FORCES' : 'HOSTILE FORCES'}`);
      lines.push(`  minerals ${p.minerals | 0}    gas ${p.gas | 0}`);
      lines.push(`  supply   ${p.supplyUsed}/${p.supplyCap}`);
      lines.push(`  army ${army.length}    structures ${blds.length}    kills ${army.reduce((a, u) => a + (u.kills | 0), 0)}`);
      lines.push(`  force mix:`);
      lines.push(mix);
      lines.push(`  upgrades: wpn ${up.weapons || 0}  armor ${up.armor || 0}`);
      if (techs.length) lines.push(`  tech: ${techs.slice(0, 4).join(', ')}`);
      return lines.join('\n');
    };
    this._intelP.setText(fmt(0));
    this._intelE.setText(fmt(1));
    const objs = (b.objectives || []).map(o => `${o.done ? '[DONE]' : '[  ]'} ${o.text}`);
    const last = b.mission ? `MISSION ${b.mission.n}: ${b.mission.name}` : '';
    this._intelO.setText(`OBJECTIVES\n${objs.join('\n')}\n${last}`);
  }

  renderObjectives(objs) {
    if (!objs) return;
    const lines = objs.map(o => `${o.done ? '✓' : '○'} ${o.text}`);
    this.objText.setText(lines.join('\n'));
  }

  createMinimap() {
    this.mmSize = Math.min(190, Math.max(120, this.W * 0.16));
    this.mmX = this.W - this.mmSize - 8;
    this.mmY = 40;
    this.mmBG = this.add.rectangle(this.mmX, this.mmY, this.mmSize, this.mmSize, 0x060a12, 0.95).setOrigin(0, 0).setScrollFactor(0);
    this.mmFrame = this.add.rectangle(this.mmX, this.mmY, this.mmSize, this.mmSize, 0x2b313a, 1).setOrigin(0, 0).setScrollFactor(0).setStrokeStyle(1, 0x3b444f);
    this.mmG = this.add.graphics().setScrollFactor(0);
    const zone = this.add.zone(this.mmX, this.mmY, this.mmSize, this.mmSize).setOrigin(0, 0).setScrollFactor(0).setInteractive({ useHandCursor: true });
    zone.on('pointerdown', (p) => this.mmClick(p.x, p.y, p.button));
    zone.on('pointerdrag', (p) => this.mmClick(p.x, p.y, 0));
    this.input.on('pointerdown', (p) => { if (p.button === 2 && this.input.mouse) this.input.mouse.disableContextMenu?.(); });
    if (this.input.mouse) this.input.mouse.disableContextMenu();
  }

  mmClick(px, py, button) {
    const wx = ((px - this.mmX) / this.mmSize) * 96 * TILE;
    const wy = ((py - this.mmY) / this.mmSize) * 96 * TILE;
    if (button === 2) { this.scene.get('Battle').placeBeacon(wx, wy); return; }
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
    const stats = this.add.text(0, 2, '', { fontFamily: 'Menlo, monospace', fontSize: '14px', color: '#ffd23f' }).setOrigin(0.5);
    const sub = this.add.text(0, 30, 'click to return', { fontFamily: 'Menlo, monospace', fontSize: '14px', color: '#8fa3c8' }).setOrigin(0.5);
    this.goPanel.add([dim, title, stats, sub]);
    this.goTitle = title; this.goDim = dim; this.goStats = stats; this.goSub = sub;
    this.input.on('pointerdown', () => { if (!this.gameOver) return; this.scene.stop('Battle'); this.scene.stop('Hud'); this.scene.start('Title'); });
  }

  mkBtn(x, y, w, h, label, cb, tip) {
    const bg = this.add.rectangle(x, y, w, h, 0x18202c, 1).setOrigin(0, 0).setScrollFactor(0).setInteractive({ useHandCursor: true });
    const brd = this.add.rectangle(x, y, w, h, 0x2f3a49, 0).setOrigin(0, 0).setScrollFactor(0).setStrokeStyle(1, 0x3f4a5a);
    const txt = this.add.text(x + w / 2, y + h / 2, label, { fontFamily: 'Menlo, monospace', fontSize: '11px', color: '#dbe7ff', align: 'center' }).setOrigin(0.5).setScrollFactor(0);
    const hit = this.add.zone(x, y, w, h).setOrigin(0, 0).setScrollFactor(0).setInteractive({ useHandCursor: true });
    hit.on('pointerdown', () => { this.flash(bg); cb(); });
    hit.on('pointerover', () => { bg.setFillStyle(0x22304a, 1); if (tip) this.showTip(x + w / 2, y - 8, tip); });
    hit.on('pointerout', () => { bg.setFillStyle(0x18202c, 1); this.hideTip(); });
    const btn = { bg, brd, txt, hit, x, y, w, h, label, setPosition(nx, ny) { this.x = nx; this.y = ny; bg.setPosition(nx, ny); brd.setPosition(nx, ny); txt.setPosition(nx + w / 2, ny + h / 2); hit.setPosition(nx, ny); } };
    this.buttons.push(btn);
    return btn;
  }

  flash(bg) { bg.setFillStyle(0x3b82f6, 1); this.tweens.add({ targets: bg, fillAlpha: 1, duration: 90, onComplete: () => bg.setFillStyle(0x18202c, 1) }); }

  // SC1-style hover tooltip (cost/time/requirements/kills)
  showTip(cx, topY, lines) {
    this.hideTip();
    const arr = Array.isArray(lines) ? lines : [lines];
    const w = Math.max(140, ...arr.map(l => l.length * 6.6)) + 16;
    const h = arr.length * 14 + 10;
    const x = Math.min(this.W - w - 6, Math.max(6, cx - w / 2));
    const y = Math.max(6, topY - h);
    this._tipG = this.add.graphics().setScrollFactor(0).setDepth(90);
    this._tipG.fillStyle(0x05080f, 0.95).fillRoundedRect(x, y, w, h, 4);
    this._tipG.lineStyle(1, 0xffd23f, 0.8).strokeRoundedRect(x, y, w, h, 4);
    this._tipT = this.add.text(x + 8, y + 5, arr.join('\n'), { fontFamily: 'Menlo, monospace', fontSize: '10px', color: '#dbe7ff', lineHeight: 14 }).setScrollFactor(0).setDepth(91);
  }
  hideTip() {
    if (this._tipG) { this._tipG.destroy(); this._tipG = null; }
    if (this._tipT) { this._tipT.destroy(); this._tipT = null; }
  }

  incomeTick(txt, col) {
    if (!this.tickTxt) return;
    this.tickTxt.setText(txt).setColor(col).setAlpha(1).setPosition(this.resText.width + 20, 8);
    this.tweens.add({ targets: this.tickTxt, alpha: 0, y: 2, duration: 650, ease: 'Quad.easeOut' });
  }

  clearButtons() {
    for (const b of this.buttons) { b.bg.destroy(); b.brd.destroy(); b.txt.destroy(); b.hit.destroy(); }
    this.buttons = [];
  }

  mkTab(x, y, w, label, active, cb) {
    const bg = this.add.rectangle(x, y, w, 15, active ? 0x1c5da8 : 0x101822, 1).setOrigin(0, 0).setScrollFactor(0).setInteractive({ useHandCursor: true });
    if (active) bg.setStrokeStyle(1, 0x4ea1ff); else bg.setStrokeStyle(1, 0x3f4a5a);
    const txt = this.add.text(x + w / 2, y + 8, label, { fontFamily: 'Menlo, monospace', fontSize: '9px', color: active ? '#eaf4ff' : '#8fa3c8' }).setOrigin(0.5).setScrollFactor(0);
    bg.on('pointerdown', cb);
    bg.on('pointerover', () => { if (!active) bg.setFillStyle(0x22304a, 1); });
    bg.on('pointerout', () => { bg.setFillStyle(active ? 0x1c5da8 : 0x101822, 1); });
    this.buttons.push({ bg, brd: { destroy() {} }, txt, hit: { destroy() {} } });
  }

  onSelection(info) {
    this.clearButtons();
    const b = this.scene.get('Battle');
    const race = this.race;
    this._lastSelInfo = info;
    if (info?.building) {
      const sel = info.building;
      if (this._cardTabBld !== sel.buildId) { this._cardTab = 'train'; this._cardTabBld = sel.buildId; }
      this.cardTitle.setText(sel.name.toUpperCase());
      this.selText.setText(`HP ${sel.hp}/${sel.maxHp}`);
      // SC1: live production queue readout above the card
      if (!this.queueText) this.queueText = this.add.text(12, this.H - 112, '', { fontFamily: 'Menlo, monospace', fontSize: '10px', color: '#8fa3c8' }).setScrollFactor(0);
      const q = (sel.queue || []).map(it => it.research ? (TECHS[it.research]?.name || it.research).slice(0, 12) : (UNITS[it.kind]?.name || it.kind).split(' ')[0]);
      this.queueText.setText(q.length ? `QUEUE: ${q.join(' > ')}` : '');
      // queue display + train buttons
      const def = BUILDINGS[sel.buildId];
      let i = 0;
      const cols = Math.max(1, Math.min(4, Math.floor((this.W - 24) / 84)));
      const unitRows = [];
      const prods = Object.keys(UNITS).filter(k => (def.produces?.includes(k) || UNITS[k].build === sel.buildId) && UNITS[k].race === race && !UNITS[k].summon);
      for (const k of prods) unitRows.push({ label: UNITS[k].name.split(' ')[0], cb: () => b.events.emit('hud:queueUnit', { buildingId: sel.buildId, kind: k }), cost: UNITS[k].minerals + (UNITS[k].gas ? '/' + UNITS[k].gas : ''),
        tip: [UNITS[k].name, `Min ${UNITS[k].minerals}${UNITS[k].gas ? '  Gas ' + UNITS[k].gas : ''}  Sup ${UNITS[k].supply || 0}`, `HP ${UNITS[k].hp}${UNITS[k].shield ? ' +Sh ' + UNITS[k].shield : ''}  Arm ${UNITS[k].armor || 0}`, `Dmg ${UNITS[k].damage}  Rng ${UNITS[k].range}  Spd ${(UNITS[k].speed || 0).toFixed(2)}`, UNITS[k].tech ? (b.techResearched(0, UNITS[k].tech) ? '✓ ' + (TECHS[UNITS[k].tech]?.name || '') : 'REQUIRES: ' + (TECHS[UNITS[k].tech]?.name || UNITS[k].tech)) : null].filter(Boolean) });
      // research
      const techRows = [];
      for (const tId of def.tech || []) {
        const t = TECHS[tId];
        if (!t) continue;
        if (t.requiresTech && !b.techResearched(0, t.requiresTech)) continue;
        const done = b.techResearched(0, tId);
        techRows.push({ label: (done ? '✓' : '') + t.name.slice(0, 7), cb: () => b.events.emit('hud:queueResearch', { buildingId: sel.buildId, techId: tId }), cost: t.minerals + (t.gas ? '/' + t.gas : ''),
          tip: [t.name, `Min ${t.minerals}${t.gas ? '  Gas ' + t.gas : ''}  ${t.time}s`, t.unlocks ? ('Unlocks: ' + (UNITS[t.unlocks]?.name || t.unlocks)) : null, t.morph ? ('Morphs: ' + t.at) : null, done ? 'RESEARCHED' : null].filter(Boolean) });
      }
      // GAP 37: tabbed build menu — TRAIN / UPGRADE headers when a lab has both
      let rows = unitRows;
      if (unitRows.length && techRows.length) {
        const tab = this._cardTab === 'up' ? 'up' : 'train';
        this.mkTab(12, this.H - 118, 60, 'TRAIN', tab === 'train', () => { this._cardTab = 'train'; this.onSelection(this._lastSelInfo); });
        this.mkTab(78, this.H - 118, 74, 'UPGRADE', tab === 'up', () => { this._cardTab = 'up'; this.onSelection(this._lastSelInfo); });
        if (tab === 'up') rows = techRows;
      }
      rows.slice(0, cols * 2).forEach((r) => {
        const col = i % cols, row = (i / cols) | 0;
        const x = 12 + col * 82, y = this.H - 96 + row * 44;
        this.mkBtn(x, y, 78, 38, `${r.label}\n${r.cost}`, r.cb, r.tip);
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
      // SC1 unit-status portraits (hp/shield/energy bars + level chevrons)
      if (!this.portraitG) this.portraitG = this.add.graphics().setScrollFactor(0);
      this.drawPortraits(info.units, b);
      const order = RACE_INFO[race].buildingOrder.filter(bid => BUILDINGS[bid].race === race);
      const rows = workers ? order : [];
      const kinds = new Set((info.units || []).map(u => u.kind));
      if (!workers) {
        if (kinds.has('tank')) rows.push('__siege');
        if (kinds.has('lurker')) rows.push('__burrow');
        if (kinds.has('marine')) rows.push('__stim');
        if (kinds.has('darkTemplar')) rows.push('__cloak');
        if (kinds.has('darkTemplar') && kinds.size === 1) { rows.push('__merge'); if (b.techResearched(0, 'darkArchonMerge')) rows.push('__mergeDark'); }
        if (kinds.has('corsair')) rows.push('__mael');
        if (kinds.has('darkArchon')) rows.push('__mael');
        if (kinds.has('mutalisk')) { rows.push('__morphG'); rows.push('__morphD'); }
        if (kinds.has('devourer')) rows.push('__caustic');
        if (kinds.has('htemplar')) rows.push('__storm');
        rows.push('__patrol');
        rows.push('__hold');
        if (b.hasBuilding('scienceFacility', 0)) rows.push('__scan');
      }
      let i = 0;
      const cols = Math.max(1, Math.min(5, Math.floor((this.W - 24) / 74)));
      const abil = {
        __siege: ['SIEGE [S]', () => b.events.emit('hud:siege')],
        __burrow: ['BURROW [B]', () => b.events.emit('hud:burrow')],
        __stim: ['STIM [F]', () => b.events.emit('hud:stim')],
        __cloak: ['CLOAK [K]', () => b.events.emit('hud:cloak')],
        __merge: ['MERGE [M]', () => b.events.emit('hud:mergeArchon')],
        __mergeDark: ['DARK MERGE', () => b.events.emit('hud:mergeDarkArchon')],
        __mael: ['MAELSTROM', () => b.events.emit('hud:maelstrom')],
        __morphG: ['GUARDIAN', () => b.events.emit('hud:morphGuardian')],
        __morphD: ['DEVOURER', () => b.events.emit('hud:morphDevourer')],
        __caustic: ['CAUSTIC', () => b.events.emit('hud:caustic')],
        __storm: ['PSI STORM [V]', () => b.events.emit('hud:castStorm')],
        __patrol: ['PATROL [P]', () => b.events.emit('hud:patrol')],
        __hold: ['HOLD [H]', () => b.events.emit('hud:command', 'hold')],
        __scan: ['SCAN [T]', () => b.events.emit('hud:scan')]
      };
      const btnDefs = rows.map(bid => {
        if (abil[bid]) return { label: abil[bid][0], cb: abil[bid][1] };
        return { label: BUILDINGS[bid].name.split(' ').map(w => w[0]).join('').slice(0, 4).toUpperCase() + '\n' + BUILDINGS[bid].name.split(' ')[0], cb: () => b.events.emit('hud:place', bid) };
      });
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

  drawPortraits(units, b) {
    const g = this.portraitG; if (!g) return;
    g.clear();
    const x0 = 12, y0 = this.H - 142;
    const max = Math.min(6, (units || []).length);
    // frame
    if (max > 0) {
      g.fillStyle(0x0a1220, 0.85); g.fillRect(x0 - 2, y0 - 2, max * 40 + 4, 30);
      g.lineStyle(1, 0x3f4a5a, 0.8); g.strokeRect(x0 - 2, y0 - 2, max * 40 + 4, 30);
    }
    for (let i = 0; i < max; i++) {
      const u = units[i];
      const x = x0 + i * 40, y = y0;
      g.fillStyle(0x101826, 1); g.fillRect(x, y, 36, 26);
      // unit icon block tinted by race/team
      g.fillStyle(0x4ea1ff, 0.9); g.fillRect(x + 12, y + 4, 12, 12);
      // hp bar
      const hr = Math.max(0, Math.min(1, u.hp / (u.maxHp || 1)));
      g.fillStyle(0x000000, 0.6); g.fillRect(x + 2, y + 18, 32, 3);
      g.fillStyle(hr > 0.5 ? 0x3ddc6a : hr > 0.25 ? 0xffd23f : 0xff4444); g.fillRect(x + 2, y + 19, 32 * hr, 1);
      if (u.shield > 0) {
        const sr = Math.max(0, Math.min(1, u.shield / (u.maxShield || 1)));
        g.fillStyle(0x4ea1ff); g.fillRect(x + 2, y + 21, 32 * sr, 1);
      }
      if (u.energy !== undefined && u.energy !== null) {
        const er = Math.max(0, Math.min(1, u.energy / (u.maxEnergy || 100)));
        g.fillStyle(0xffd23f); g.fillRect(x + 2, y + 23, 32 * er, 1);
      }
      // level chevrons
      const lv = u.level || 0;
      for (let c = 0; c < lv; c++) { g.fillStyle(0xffd23f, 0.95); g.fillRect(x + 3 + c * 4, y + 2, 3, 2); }
    }
  }

  banner(msg) {
    this.alert.setText(msg).setColor('#ffd23f').setAlpha(1);
    this.tweens.add({ targets: this.alert, alpha: 0, delay: 2200, duration: 500 });
    this.logMessage(msg);
  }

  // ---------------- SC1 message log (GAP 35) ----------------
  createMsgLog() {
    this._msgLog = [];
    this._logText = this.add.text(this.W - 260, 44, '', { fontFamily: 'Menlo, monospace', fontSize: '10px', color: '#b9c8e8', lineHeight: 14, align: 'right' }).setScrollFactor(0).setDepth(60).setAlpha(0.95);
    this.events.once('shutdown', () => { this._msgLog = []; });
  }

  logMessage(msg) {
    if (!this._logText) return;
    const b = this.scene.get('Battle');
    const t = b ? (b.gameTime | 0) : 0;
    const mm = `0${Math.floor(t / 60)}`.slice(-2), ss = `0${t % 60}`.slice(-2);
    this._msgLog.push({ line: `${mm}:${ss} ${msg}`, born: this.time.now });
    if (this._msgLog.length > 7) this._msgLog.shift();
    this.renderMsgLog();
    if (!this._logFadeH) this._logFadeH = this.time.addEvent({ delay: 1000, loop: true, callback: () => this.fadeMsgLog() });
  }

  fadeMsgLog() {
    if (!this._logText) return;
    const now = this.time.now;
    this._msgLog = this._msgLog.filter(m => now - m.born < 12000);
    this.renderMsgLog();
  }

  renderMsgLog() {
    if (!this._logText) return;
    const now = this.time.now;
    this._logText.setText(this._msgLog.map(m => {
      const age = now - m.born;
      return age > 10000 ? null : m.line;
    }).filter(Boolean).join('\n'));
  }

  // SC-style radio log: bottom-left message stack that fades after a few seconds
  radio(msg, who) {
    if (!this._radioLog) {
      this._radioLog = this.add.container(12, this.H - 150).setScrollFactor(0).setDepth(30);
    }
    const label = who ? `[${String(who).toUpperCase()}] ` : '[COMMS] ';
    const line = this.add.text(0, 0, label + msg, { fontFamily: 'Menlo, monospace', fontSize: '12px', color: '#bfe0ff', backgroundColor: '#050a14d8', padding: { x: 8, y: 4 }, wordWrap: { width: Math.min(460, this.W - 40) } }).setOrigin(0, 1);
    this._radioLog.add(line);
    // re-stack newest at bottom
    const kids = this._radioLog.list.filter(k => k.active !== false && typeof k.getHeight === 'function');
    let y = 0;
    for (let i = kids.length - 1; i >= 0; i--) {
      const h = kids[i].getHeight();
      kids[i].setPosition(0, y);
      y -= h + 4;
    }
    this.tweens.add({ targets: line, alpha: 0, delay: 6000, duration: 800, onComplete: () => line.destroy() });
  }

  showPause(on) {
    if (!this.pauseText) {
      this.pauseText = this.add.text(this.W / 2, this.H * 0.22, '', { fontFamily: 'Menlo, monospace', fontSize: '22px', color: '#bfe0ff', backgroundColor: '#050a14c0', padding: { x: 14, y: 8 } }).setOrigin(0.5).setScrollFactor(0);
    }
    if (on) {
      this.pauseText.setText('  PAUSED  ·  issue orders, SPACE to resume  ');
      this.pauseText.setVisible(true);
      if (this._pauseTwn) this._pauseTwn.stop();
      this._pauseTwn = this.tweens.add({ targets: this.pauseText, alpha: { from: 1, to: 0.55 }, duration: 700, yoyo: true, repeat: -1 });
    } else {
      this.pauseText.setVisible(false);
    }
  }

  cinemaFlash(r) {
    // F9: letterbox bars slide in for the kill shot
    if (!this._lbTop) {
      this._lbTop = this.add.rectangle(0, -40, this.W, 40, 0x000000, 0.95).setOrigin(0, 0).setScrollFactor(0);
      this._lbBot = this.add.rectangle(0, this.H + 40, this.W, 40, 0x000000, 0.95).setOrigin(0, 1).setScrollFactor(0);
    }
    this._lbTop.setSize(this.W, 40); this._lbBot.setSize(this.W, 40);
    this._lbBot.y = this.H + 40;
    this.tweens.add({ targets: this._lbTop, y: 0, duration: 350, ease: 'Cubic.easeOut' });
    this.tweens.add({ targets: this._lbBot, y: this.H, duration: 350, ease: 'Cubic.easeOut' });
    this.banner(r === 'victory' ? 'TARGET DESTROYED' : 'BASE LOST');
  }

  showHelp() {
    this.alert.setText('LMB drag=select  RMB=order  A=attack-move  ESC=cancel  1-8=select group  Shift/Ctrl+1-8=assign  wheel=zoom').setAlpha(1);
    this.tweens.add({ targets: this.alert, alpha: 0, delay: 3200, duration: 400 });
  }

  renderGroupBadges(gs) {
    if (!this.groupBadgeG) this.groupBadgeG = this.add.graphics().setScrollFactor(0).setDepth(60);
    if (!this.groupBadgeTxts) this.groupBadgeTxts = [];
    this.groupBadgeG.clear();
    this.groupBadgeTxts.forEach(t => t.destroy());
    this.groupBadgeTxts = [];
    if (!gs || !gs.length) return;
    const battle = this.scene.get('Battle');
    const size = 22, gap = 4;
    const bx = this.W - this.mmSize - 8, by = this.mmY + this.mmSize + 6;
    const sorted = [...gs].sort((a, b) => (+a.n) - (+b.n));
    sorted.forEach((g, i) => {
      const x = bx + i * (size + gap);
      const alive = ((battle.controlGroups && battle.controlGroups[g.n]) || []).filter(u => !u.dead).length;
      const empty = alive === 0;
      this.groupBadgeG.fillStyle(0x0a1220, 0.92).fillRoundedRect(x, by, size, size, 4);
      this.groupBadgeG.lineStyle(1, empty ? 0x3a3f48 : 0x6ee7a0, 1).strokeRoundedRect(x, by, size, size, 4);
      this.groupBadgeTxts.push(this.add.text(x + size / 2, by + 7, String(g.n), { fontFamily: 'Menlo, monospace', fontSize: '11px', color: empty ? '#5a616c' : '#6ee7a0', fontStyle: 'bold' }).setOrigin(0.5).setScrollFactor(0).setDepth(61));
      this.groupBadgeTxts.push(this.add.text(x + size / 2, by + 17, empty ? '—' : String(alive), { fontFamily: 'Menlo, monospace', fontSize: '8px', color: '#8fa3c8' }).setOrigin(0.5).setScrollFactor(0).setDepth(61));
    });
  }

  showGroupContents(d) {
    if (!d || !d.tally) return;
    if (this._grpPopT) this.tweens.killTweensOf(this._grpPopT);
    if (this._grpPopG) this._grpPopG.destroy();
    if (this._grpPopT) this._grpPopT.destroy();
    const entries = Object.entries(d.tally);
    const body = entries.map(([k, c]) => `${c}x ${k}`).join('   ');
    const w = Math.max(120, body.length * 7.2 + 30);
    const cx = this.W / 2, cy = this.H - 170;
    this._grpPopG = this.add.graphics().setScrollFactor(0).setDepth(70);
    this._grpPopG.fillStyle(0x000000, 0.78).fillRoundedRect(cx - w / 2, cy - 16, w, 34, 6);
    this._grpPopG.lineStyle(1, 0xffd23f, 0.9).strokeRoundedRect(cx - w / 2, cy - 16, w, 34, 6);
    this._grpPopT = this.add.text(cx, cy - 6, `[${d.n}]  ${body}`, { fontFamily: 'Menlo, monospace', fontSize: '12px', color: '#ffd23f' }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(71);
    this.tweens.add({ targets: [this._grpPopG, this._grpPopT], alpha: 0, delay: 1500, duration: 400 });
  }

  showGameOver(r) {
    this.gameOver = r;
    this.goPanel.setVisible(true).setAlpha(0);
    this.goDim.setSize(this.W, this.H);
    this.goTitle.setPosition(this.W / 2, this.H / 2 - 60);
    this.goTitle.setText(r === 'victory' ? 'MISSION ACCOMPLISHED' : 'MISSION FAILED');
    this.goTitle.setColor(r === 'victory' ? '#6ee7a0' : '#ff5c5c');
    const b = this.scene.get('Battle');
    const apm = Math.round((b.cmdCount / Math.max(30, b.gameTime)) * 60);
    const kills = (b.record && b.record.kills) || 0;
    const reward = b.lastReward || 0;
    if (this.goStats) {
      this.goStats.setPosition(this.W / 2, this.H / 2 - 14);
      this.goStats.setText(`TIME ${((b.gameTime / 60) | 0)}:${String(b.gameTime % 60 | 0).padStart(2, '0')}   APM ${apm}   ARMY ${b.units.filter(u => !u.dead && u.team === 0).length}${reward ? `   +${reward} CR` : ''}`);
    }
    if (this.goSub) {
      this.goSub.setPosition(this.W / 2, this.H / 2 + 14);
      const dl = b.debriefLine || '';
      const go = this.goSub;
      const lay = () => { try { if (!go.active) return; go.setPosition(this.W / 2, this.H / 2 + 14); go.setText(dl).setColor(r === 'victory' ? '#9fe0b0' : '#e0a0a0'); } catch (e) { /* texture torn */ } };
      try { go.setFontSize(13); go.setWordWrap({ width: Math.min(560, this.W - 80) }); go.setAlign('center'); } catch (e) { /* noop */ }
      lay();
      this.time.delayedCall(120, lay); // safe re-layout after any texture churn
    }
    this.tweens.add({ targets: this.goPanel, alpha: 1, duration: 600 });
    // SC1 mission stamp: mission name slammed onto the debrief
    if (!this._stamp && b.mission) {
      const st = this.add.text(this.W / 2, this.H / 2 + 78, `MISSION ${b.mission.n} :: ${b.mission.name}`, { fontFamily: 'Menlo, monospace', fontSize: '15px', color: r === 'victory' ? '#ffd23f' : '#ff8a8a', fontStyle: 'bold', backgroundColor: '#00000066', padding: { x: 10, y: 4 } }).setOrigin(0.5).setScrollFactor(0).setDepth(88);
      st.setScale(2.4).setAlpha(0).setAngle(-4);
      this.tweens.add({ targets: st, scale: 1, alpha: 1, angle: -2, duration: 260, ease: 'Back.easeOut' });
      this._stamp = st;
      this.events.once('shutdown', () => { if (this._stamp) { this._stamp.destroy(); this._stamp = null; } });
    } else if (this._stamp && b.mission) {
      this._stamp.setText(`MISSION ${b.mission.n} :: ${b.mission.name}`).setColor(r === 'victory' ? '#ffd23f' : '#ff8a8a').setScale(2.4).setAlpha(0);
      this.tweens.add({ targets: this._stamp, scale: 1, alpha: 1, duration: 260, ease: 'Back.easeOut' });
    }
  }

  refresh() {
    const b = this.scene.get('Battle');
    if (!b || !b.players) return;
    const p = b.players[0];
    const capped = p.supplyUsed >= p.supplyCap;
    this.resText.setText(`MIN ${this.fmt(p.minerals)}   GAS ${this.fmt(p.gas)}   SUPPLY ${Math.floor(p.supplyUsed)}/${p.supplyCap}${capped ? ' !' : ''}`);
    this.resText.setColor(capped ? '#ff5c5c' : '#dbe7ff');
    const idle = p.idleWorkers || 0;
    if (!this.idleTxt) {
      this.idleTxt = this.add.text(this.W / 2 + 150, 14, '', { fontFamily: 'Menlo, monospace', fontSize: '11px', color: '#ffd23f', backgroundColor: '#00000088', padding: { x: 5, y: 2 } }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(61);
    }
    if (this.idleTxt) { this.idleTxt.setText(idle > 0 ? `IDLE ${idle} ▶` : '').setVisible(idle > 0); }
    // SC1 idle-worker cycle: click the IDLE chip to jump+select each idle worker in turn
    if (idle > 0 && !this._idleInteractive) {
      this._idleInteractive = true;
      this.idleTxt.setInteractive({ useHandCursor: true });
      this.idleTxt.on('pointerdown', () => this.scene.get('Battle').cycleIdleWorker());
    } else if (idle === 0 && this._idleInteractive) {
      this._idleInteractive = false;
      this.idleTxt.disableInteractive();
    }
    // SC1 trailing income tick: flashing +N beside the counter when resources arrive
    if (this._lastRes === undefined) this._lastRes = { m: p.minerals, g: p.gas };
    const dm = Math.floor(p.minerals - this._lastRes.m), dg = Math.floor(p.gas - this._lastRes.g);
    const nowMs = this.time ? this.time.now : 0;
    if ((dm >= 5 || dg >= 5) && nowMs - (this._tickAt || 0) > 700) { this._tickAt = nowMs; if (dm >= 5) this.incomeTick(`+${dm}`, '#7db4ff'); if (dg >= 5) this.incomeTick(`+${dg}`, '#7dffd9'); }
    this._lastRes = { m: p.minerals, g: p.gas };
    const t = Math.floor(b.gameTime);
    this.timeText.setText(`${String((t / 60) | 0).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`);
    this.selCount.setText(`SEL ${b.selection.size}`);
    if (this.apmText) {
      const apm = Math.round((b.cmdCount / Math.max(30, b.gameTime)) * 60);
      this.apmText.setText(`APM ${apm}`);
    }
    if (this.ultFill && b.ultKind) {
      const pct = b.ultimateEnergy / b.ultimateMax;
      this.ultFill.displayWidth = 148 * Math.min(1, pct);
      const ready = pct >= 1;
      this.ultFill.setFillStyle(ready ? 0x6ee7a0 : 0xff9c3c, ready ? 1 : 0.8);
      this.ultTxt.setColor(ready ? '#eaf4ff' : '#8fa3c8');
      this.ultTxt.setText(ready ? `${(b.ultKind() === 'nuke' ? 'NUCLEAR STRIKE' : b.ultKind() === 'storm' ? 'PSIONIC STORM' : 'BROOD SURGE')} [G]` : `ULTIMATE ${Math.floor(pct * 100)}%`);
      if (this._holdUntilTxt && b._holdUntil != null) { /* noop */ }
    }
    if (this.objText && b.objectives) this.renderObjectives(b.objectives);
    // live production queue refresh for the selected building
    if (this.queueText) {
      const sb = b.selectedBuilding;
      if (sb && !sb.dead) {
        const q = (sb.queue || []).map(it => it.research ? (TECHS[it.research]?.name || it.research).slice(0, 12) : (UNITS[it.kind]?.name || it.kind).split(' ')[0]);
        const prog = sb.queue[0] ? ` ${Math.floor((1 - sb.queue[0].remaining / (sb.queue[0].total || 1)) * 100)}%` : '';
        this.queueText.setText(q.length ? `QUEUE: ${q.join(' > ')}${prog}` : '');
      }
    }
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
    // SC1: spider mines on minimap (own only)
    for (const m of (b.spiderMines || [])) {
      if (m.team !== 0) continue;
      g.fillStyle(0xffd23f, m.armed ? 0.9 : 0.4);
      g.fillCircle(this.mmX + m.x * s, this.mmY + m.y * s, 1.2);
    }
    // SC1: beacon ping (alt/right-click minimap) — expanding cyan marker
    if (b.beacon) {
      const k = Math.max(0, 1 - (b.gameTime - b.beacon.t) / 5);
      if (k > 0) {
        const bx = this.mmX + b.beacon.x * s, by = this.mmY + b.beacon.y * s;
        g.lineStyle(1.5, 0x9fffff, k);
        g.strokeCircle(bx, by, 3 + (1 - k) * 9);
        g.fillStyle(0x9fffff, k * 0.7);
        g.fillCircle(bx, by, 1.6);
      }
    }
    // GAP: minimap event pings (combat/contact/building loss) — expanding rings
    for (const p of (b._eventPings || [])) {
      const k = Math.max(0, 1 - (b.gameTime - p.t) / 4);
      if (k <= 0) continue;
      const px = this.mmX + p.x * s, py = this.mmY + p.y * s;
      g.lineStyle(1.5, p.color, k * 0.9);
      g.strokeCircle(px, py, 2 + (1 - k) * (p.big ? 14 : 8));
    }
    // SC1 power-up crates on minimap (only where visible)
    for (const cr of (b.crates || [])) {
      if (!b.isVisible(cr.x, cr.y)) continue;
      g.fillStyle(0xffd23f, 0.9);
      g.fillRect(this.mmX + cr.x * s - 1.5, this.mmY + cr.y * s - 1.5, 3, 3);
    }
    // camera view rect
    const cam = b.cameras.main;
    g.lineStyle(1, 0xffffff, 0.7);
    g.strokeRect(this.mmX + cam.worldView.x * s, this.mmY + cam.worldView.y * s, cam.worldView.width * s, cam.worldView.height * s);
    // F3: incoming threat pings (blinking red clusters)
    if (b.threats) {
      const blink = (Math.sin(Date.now() / 160) + 1) / 2;
      for (const t of b.threats) {
        const mx = this.mmX + t.x * s, my = this.mmY + t.y * s;
        g.fillStyle(0xff4040, 0.35 + blink * 0.6);
        g.fillCircle(mx, my, 3.4);
        g.lineStyle(1, 0xff8080, 0.5 + blink * 0.4);
        g.strokeCircle(mx, my, 5 + blink * 3);
      }
    }
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
