// HUD for SCC2: resources, command card, selection panel, minimap, alerts.
import Phaser from 'phaser';
import { UNITS, BUILDINGS, TECHS, RACE_INFO, TILE, MAP_W, MAP_H } from '../data/sc1.js';
import { CH, CHIPS } from '../engine/chrome.js';

export class HudScene extends Phaser.Scene {
  constructor() { super('Hud'); }

  init(data) { this.race = data.race || 'terran'; this.world = data.world; }

  preload() {
    // v2.46: chrome is now fully procedural (engine/chrome.js) — the old AI
    // hud_chrome.png load raced itself on scene restarts ("key already in use").
  }

  create() {
    this.W = this.scale.width; this.H = this.scale.height;
    CH.init(this); // v2.46: bake 9-slice chrome, resource icons, shroud, cursor frames
    // v2.41: 4-tier HUD type scale + uniform drop shadow — intercept add.text once
    const self = this;
    const TIERS = [10, 12, 16, 24, 40];
    const _txt = this.add.text.bind(this.add);
    this.add.text = function (x, y, str, opts) {
      const o = Object.assign({}, opts);
      if (o.fontSize) {
        const px = parseFloat(o.fontSize) || 12;
        let t = TIERS[TIERS.length - 1];
        for (const tier of TIERS) if (px <= tier) { t = tier; break; }
        o.fontSize = t + 'px';
      }
      if (o.shadow === undefined) o.shadow = { offsetX: 0, offsetY: 1, color: '#000000', blur: 0, opacity: 0.7 };
      const tx = _txt(x, y, str, o);
      return tx;
    };
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
    battle.events.on('hud:unaffordable', () => { if (this.scene.isActive()) this.flashNotEnough(); });
    battle.events.on('hud:gameover', (r) => { if (this.scene.isActive()) this.showGameOver(r); });
    battle.events.on('hud:alert', (msg) => { if (this.scene.isActive()) this.banner(msg); });
    battle.events.on('hud:pause', (on) => { if (this.scene.isActive()) this.showPause(on); });
    battle.events.on('hud:cinema', (r) => { if (this.scene.isActive()) this.cinemaFlash(r); });
    battle.events.on('hud:radio', (msg, who) => { if (this.scene.isActive()) this.radio(msg, who); });
    // v2.27: kill feed ticker + voice bark subtitles
    battle.events.on('hud:kill', (e) => { if (this.scene.isActive()) this.killFeed(e); });
    battle.events.on('hud:bark', (t) => { if (this.scene.isActive()) this.barkSub(t); });
    battle.events.on('hud:groups', (gs) => { if (this.scene.isActive()) this.renderGroupBadges(gs); });
    battle.events.on('hud:groupcontents', (d) => { if (this.scene.isActive()) this.showGroupContents(d); });
    battle.events.on('hud:activeTeam', (t) => { if (this.scene.isActive()) this.showActiveTeam(t); });
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
    this.createCommandCursor();
  }

  // v2.47 COMMAND CURSOR: game-drawn pointer that reflects order state
  // (normal / attack / cast / place), replacing the OS arrow over the battlefield.
  createCommandCursor() {
    this.input.setDefaultCursor('none');
    // interactive UI elements restore a hand cursor automatically on hover;
    // if no game canvas exists (gate headless without WebGL) fall back to default
    this.cur = this.add.image(-100, -100, 'cur-normal').setScrollFactor(0).setDepth(10000);
    this._curState = 'normal';
    this._curTgt = null;
    // v2.49: race-tinted normal cursor when the accent variant is baked
    if (this.race && this.textures.exists(`cur-${this.race}`)) this.cur.setTexture(`cur-${this.race}`);
    // v2.49: cursor trail — fading after-images on fast movement
    this._trail = [];       // live ghost sprites
    this._trailHead = null; // last sampled position
    this._trailLast = 0;
    const trailCol = ({ terran: 0x4ea1ff, skarn: 0xff7b2e, auraxis: 0xa78bfa })[this.race] ?? 0x9fb8ff;
    this.input.on('pointermove', (p) => {
      if (!this.cur || !this.cur.active) return;
      const now = this.time.now;
      const h0 = this._trailHead;
      if (h0 && (p.x - h0.x) * (p.x - h0.x) + (p.y - h0.y) * (p.y - h0.y) > 900 && now - this._trailLast > 33) {
        this._trailLast = now;
        const sp = this.add.image(h0.x, h0.y, 'cur-normal').setScrollFactor(0).setDepth(9998).setTint(trailCol).setAlpha(0.35).setScale(0.8);
        this._trail.push(sp);
        this.tweens.add({ targets: sp, alpha: 0, scale: 0.45, duration: 260, ease: 'Quad.easeOut', onComplete: () => sp.destroy() });
        while (this._trail.length > 10) { const o = this._trail.shift(); if (o.active) o.destroy(); }
      }
      this._trailHead = { x: p.x, y: p.y };
      this.cur.setPosition(p.x, p.y + 2);
      const b = this.scene.get('Battle');
      if (!b || !b.scene.isActive()) return;
      let st = 'normal';
      if (b.placing) st = 'place';
      else if (b.castMode || b.ultMode || b.scanMode) st = 'cast';
      else if (b.attackMoveMode) st = 'attack';
      if (st !== this._curState) {
        this._curState = st;
        const key = st === 'attack' ? 'cur-attack' : st === 'cast' ? 'cur-cast' : st === 'place' ? 'cur-place' : 'cur-normal';
        if (this.textures.exists(key)) this.cur.setTexture(key);
      }
    });
    this.input.on('pointerdown', () => {
      if (!this.cur || !this.cur.active) return;
      this.cur.setScale(1.35);
      this.tweens.add({ targets: this.cur, scale: 1, duration: 130, ease: 'Back.easeOut' });
    });
    this.events.once('shutdown', () => this.input.setDefaultCursor('default'));
  }

  fmt(n) { return Math.floor(n).toLocaleString('en-US'); }

  createTopBar() {
    this.top = this.add.graphics();
    // v2.46: nine-slice chrome strip replaces the flat rect
    this.topPanel = CH.panel(this, 'chr-topbar', 0, 0, this.W, 34, { depth: 0 });
    this.topBG = this.add.rectangle(0, 0, this.W, 34, 0x05080e, 0.55).setOrigin(0, 0).setScrollFactor(0).setDepth(-1);
    // v2.46: resource icon segments (icon + value), SC1-style gutter rhythm
    const iconY = 9;
    this._resNums = [];
    const num = (x) => { const t = this.add.text(x, 8, '0', { fontFamily: 'Menlo, monospace', fontSize: '14px', color: '#dbe7ff' }).setScrollFactor(0); this._resNums.push(t); return t; };
    const mkIco = (x, key) => { if (this.textures.exists(key)) return this.add.image(x, iconY + 8, key).setScrollFactor(0); return null; };
    this.icoMin = mkIco(10, 'ico-mineral'); this.resMin = num(30);
    this.icoGas = mkIco(118, 'ico-gas'); this.resGas = num(138);
    this.icoSup = mkIco(224, 'ico-supply'); this.resSup = num(244);
    this.tickTxt = this.add.text(340, 8, '', { fontFamily: 'Menlo, monospace', fontSize: '13px', color: '#7db4ff', fontStyle: 'bold' }).setScrollFactor(0).setAlpha(0);
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

  showActiveTeam(t) {
    const col = t === 0 ? '#6ee7a0' : '#ff8a5c';
    if (!this._teamBadge) {
      this._teamBadge = this.add.text(this.W / 2, 54, '', { fontFamily: 'Menlo, monospace', fontSize: '13px', fontWeight: 'bold', color: col, backgroundColor: '#000000cc', padding: { x: 10, y: 4 } }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(97);
    }
    this._teamBadge.setText(`▶ COMMANDER ${String.fromCharCode(65 + t)} · TAB TO SWITCH`).setColor(col).setAlpha(1);
    this.tweens.add({ targets: this._teamBadge, alpha: 0.55, duration: 500, yoyo: true, repeat: 3 });
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
    const race = b?.hotseat ? (b.players[b.activeTeam ?? 0]?.race || 'terran') : (b?.race || 'terran');
    const raceTech = {
      terran: ['terranInfantryWeapons', 'terranInfantryArmor', 'vehiclePlating', 'radar', 'controlTower', 'vitaReactor', 'combatMedics', 'machineShop'],
      skarn: ['skarnMeleeAttacks', 'skarnCarapace', 'burrowChrysalis', 'chitinousPlating', 'greaterAerie', 'deepWarren', 'hive', 'sporecaster', 'corroder'],
      auraxis: ['portalPhase', 'bladeguardSpeed', 'sentinelRange', 'fabricatorCalibration', 'psionicStorm', 'nightblade', 'skyAnchor', 'auraxisGround', 'umbralConvergence'],
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
    const T = b.hotseat ? (b.activeTeam ?? 0) : 0;
    // find a built building that hosts this tech and queue it there
    const t = TECHS[row.id];
    const host = b.buildings.find(bb => !bb.dead && bb.built && bb.team === T && (bb.buildId === t.at || bb.morphedTo === t.at));
    if (!host) { this.scene.get('Battle').events.emit('hud:alert', `REQUIRES ${t.at ? (BUILDINGS[t.at]?.name || t.at).toUpperCase() : 'HOST'} ON FIELD`); return; }
    host.queueResearch(row.id) ? this.scene.get('Battle').events.emit('hud:alert', `RESEARCH QUEUED: ${t.name.toUpperCase()}`) : this.audio?.error?.();
    this.refreshTechTree();
  }

  refreshTechTree() {
    if (!this._tech || !this._tech.visible) return;
    const b = this.scene.get('Battle');
    if (!b || !b.players) return;
    const T = b.hotseat ? (b.activeTeam ?? 0) : 0;
    const p = b.players[T];
    const status = {};
    for (const r of this._techRows || []) {
      const t = TECHS[r.id];
      const done = p.techs[r.id];
      const queued = b.buildings.some(bb => !bb.dead && bb.team === T && (bb.queue || []).some(q => q.research === r.id));
      const host = b.buildings.find(bb => !bb.dead && bb.built && bb.team === T && (bb.buildId === t.at || bb.morphedTo === t.at));
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
    // v2.40: AI chrome bezel + live terrain tint on the minimap face.
    // Creation order = draw order: mmBG (dark) -> chrome bezel -> terrain tint -> frame -> dots -> zone.
    if (this.textures.exists('ai-hud_chrome')) {
      this.mmChrome = this.add.image(this.mmX - 4, this.mmY - 4, 'ai-hud_chrome').setOrigin(0, 0).setScrollFactor(0).setTint(0xbfc9d6).setAlpha(0.85);
      this.mmChrome.setDisplaySize(this.mmSize + 8, this.mmSize + 8);
    }
    if (this.textures.exists('terrain')) {
      this.mmTerrain = this.add.image(this.mmX, this.mmY, 'terrain').setOrigin(0, 0).setScrollFactor(0).setAlpha(0.92);
      this.mmTerrain.setDisplaySize(this.mmSize, this.mmSize);
    }
    this.mmFrame = this.add.rectangle(this.mmX, this.mmY, this.mmSize, this.mmSize, 0x2b313a, 1).setOrigin(0, 0).setScrollFactor(0).setStrokeStyle(1, 0x3b444f);
    // v2.50: race-accent corner brackets on the minimap bezel
    this.mmAcc = (RACE_INFO[this.race] || {}).accent || 0x4ea1ff;
    this.mmBrackets = this.add.graphics().setScrollFactor(0).setDepth(2);
    this.drawMmBrackets();
    // v2.46: fibrous shroud tile over the explored-but-unseen fog area (minimap-only visual)
    if (this.textures.exists('chr-shroud')) {
      this.mmShroud = this.add.image(this.mmX, this.mmY, 'chr-shroud').setOrigin(0, 0).setScrollFactor(0).setDisplaySize(this.mmSize, this.mmSize).setAlpha(0.85);
      this._mmShroudCv = document.createElement('canvas'); this._mmShroudCv.width = 160; this._mmShroudCv.height = 160;
      this._mmShroudCtx = this._mmShroudCv.getContext('2d');
      if (this.textures.exists('mm_shroud')) this.textures.remove('mm_shroud'); // restart: rebind fresh canvas
      this.textures.addCanvas('mm_shroud', this._mmShroudCv);
      this.mmShroud.setTexture('mm_shroud');
    }
    this.mmG = this.add.graphics().setScrollFactor(0);
    const zone = this.add.zone(this.mmX, this.mmY, this.mmSize, this.mmSize).setOrigin(0, 0).setScrollFactor(0).setInteractive({ useHandCursor: true });
    this.mmZone = zone;
    zone.on('pointerdown', (p) => this.mmClick(p.x, p.y, p.button));
    zone.on('pointerdrag', (p) => this.mmClick(p.x, p.y, 0));
    this.input.on('pointerdown', (p) => { if (p.button === 2 && this.input.mouse) this.input.mouse.disableContextMenu?.(); });
    if (this.input.mouse) this.input.mouse.disableContextMenu();
  }

  mmClick(px, py, button) {
    const wx = ((px - this.mmX) / this.mmSize) * MAP_W * TILE;
    const wy = ((py - this.mmY) / this.mmSize) * MAP_H * TILE;
    if (button === 2) { this.scene.get('Battle').placeBeacon(wx, wy); return; }
    this.scene.get('Battle').events.emit('hud:camera', { x: wx, y: wy });
  }

  createCommandCard() {
    this.cardBG = this.add.graphics().setScrollFactor(0);
    // v2.46: nine-slice chrome backing for the command card area
    // v2.49: per-race accent variant when baked (terran/skarn/auraxis)
    const raceKey = this.race && this.textures.exists(`chr-card-${this.race}`) ? `chr-card-${this.race}` : 'chr-card';
    this._cardPanel = CH.panel(this, raceKey, 4, this.H - 128, Math.min(this.W - 210, 78 * Math.max(1, Math.min(4, Math.floor((this.W - 24) / 84))) + 24), 124, { depth: -1, alpha: 0.92 });
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

  // v2.36: SC1-style grey-out command card. opts.state = (battle)=>reason|'' evaluated
  // live on every hud:tick — reasons: minerals|supply|tech|energy|nocrew|done|place.
  disMsg(r) { return ({ minerals: 'NOT ENOUGH MINERALS', supply: 'SUPPLY BLOCKED', tech: 'TECH REQUIRED', energy: 'NOT ENOUGH ENERGY', nocrew: 'NO CREW', place: 'INVALID POSITION', done: 'ALREADY DONE' })[r] || 'UNAVAILABLE'; }
  disCtx(r) { return ({ minerals: 'supply', supply: 'supply', tech: 'tech', energy: 'energy', place: 'place' })[r] || 'nocrew'; }
  get disG() { if (!this._disG) this._disG = this.add.graphics().setScrollFactor(0).setDepth(151); return this._disG; }
  redrawDisabled() {
    const g = this.disG; g.clear();
    for (const bb of this.buttons) if (bb.disabled) {
      g.lineStyle(2, 0xd23c3c, 0.95)
        .lineBetween(bb.x + 3, bb.y + 3, bb.x + bb.w - 3, bb.y + bb.h - 3)
        .lineBetween(bb.x + bb.w - 3, bb.y + 3, bb.x + 3, bb.y + bb.h - 3);
    }
  }

  mkBtn(x, y, w, h, label, cb, tip, opts = {}) {
    const self = this;
    const bg = this.add.rectangle(x, y, w, h, 0x18202c, 1).setOrigin(0, 0).setScrollFactor(0).setInteractive({ useHandCursor: true });
    const brd = this.add.rectangle(x, y, w, h, 0x2f3a49, 0).setOrigin(0, 0).setScrollFactor(0).setStrokeStyle(1, 0x3f4a5a);
    // v2.48: baked glyph chip in the button's top-left corner; label drops below it.
    // If the label carries an '[X]' hotkey suffix, strip it and badge the corner instead.
    let chip = null;
    const chipKey = opts.chip && this.textures.exists(opts.chip) ? opts.chip : null;
    const textY = chipKey ? y + h / 2 + 5 : y + h / 2;
    if (chipKey) {
      const hk = opts.hotkey || (typeof label === 'string' ? (label.match(/\[([A-Z])\]/) || [])[1] : null);
      if (hk && typeof label === 'string') label = label.replace(/ ?\[[A-Z]\]/, '');
      chip = this.add.image(x + 11, y + 11, chipKey).setScrollFactor(0).setDepth(150);
      if (hk) {
        chip._hk = this.add.text(x + w - 4, y + 4, hk, { fontFamily: 'Menlo, monospace', fontSize: '8px', color: '#8fa3c8' }).setOrigin(1, 0).setScrollFactor(0).setDepth(153);
      }
    }
    const txt = this.add.text(x + w / 2, textY, label, { fontFamily: 'Menlo, monospace', fontSize: '11px', color: '#dbe7ff', align: 'center' }).setOrigin(0.5).setScrollFactor(0);
    const hit = this.add.zone(x, y, w, h).setOrigin(0, 0).setScrollFactor(0).setInteractive({ useHandCursor: true });
    const btn = { bg, brd, txt, hit, chip, x, y, w, h, label, disabled: false, _disReason: '', _check: opts.state || null,
      setDisabled(on, reason = '') {
        on = !!on;
        if (this.disabled === on && this._disReason === reason) return;
        this.disabled = on; this._disReason = reason;
        txt.setColor(on ? '#6b7686' : '#dbe7ff');
        if (chip) chip.setAlpha(on ? 0.35 : 1);
        if (chip && chip._hk) chip._hk.setColor(on ? '#4d5766' : '#8fa3c8');
        if (on) bg.setFillStyle(0x10161f, 1); else bg.setFillStyle(0x18202c, 1);
        self.redrawDisabled();
      },
      setPosition(nx, ny) { this.x = nx; this.y = ny; bg.setPosition(nx, ny); brd.setPosition(nx, ny); txt.setPosition(nx + w / 2, chipKey ? ny + h / 2 + 5 : ny + h / 2); hit.setPosition(nx, ny); if (chip) chip.setPosition(nx + 11, ny + 11); if (chip && chip._hk) chip._hk.setPosition(nx + w - 4, ny + 4); if (this.disabled) self.redrawDisabled(); } };
    hit.on('pointerdown', () => {
      if (btn.disabled) { const ctx = self.disCtx(btn._disReason); self.scene.get('Battle').audio?.announcer?.(ctx); self.flashNotEnough(self.disMsg(btn._disReason)); return; }
      self.flash(bg); self.scene.get('Battle').audio?.uiClick?.(); cb();
    });
    hit.on('pointerover', () => {
      if (btn.disabled) { self.showTip(btn.x + w / 2, btn.y - 8, (Array.isArray(tip) ? tip : [tip]).concat(self.disMsg(btn._disReason))); return; }
      bg.setFillStyle(0x22304a, 1); self.scene.get('Battle').audio?.uiHover?.(); if (tip) self.showTip(btn.x + w / 2, btn.y - 8, tip);
    });
    hit.on('pointerout', () => { bg.setFillStyle(btn.disabled ? 0x10161f : 0x18202c, 1); self.hideTip(); });
    this.buttons.push(btn);
    if (btn._check) { const b0 = this.scene.get('Battle'); if (b0) btn.setDisabled(!!btn._check(b0), btn._check(b0)); }
    return btn;
  }

  // live grey-out refresh (throttled ~4Hz): re-run each button's state fn
  updateButtonStates(b) {
    const now = this.time ? this.time.now : 0;
    if (now - (this._bsAt || 0) < 250) return;
    this._bsAt = now;
    for (const btn of this.buttons) {
      if (!btn._check) continue;
      let reason = '';
      try { reason = btn._check(b) || ''; } catch (e) { reason = ''; }
      btn.setDisabled(!!reason, reason);
    }
  }

  setIncomeRate(perMin) {
    if (!this.rateTxt) this.rateTxt = this.add.text(this.resText.width + 22, 9, '', { fontFamily: 'Menlo, monospace', fontSize: '9px', color: '#4c7ea8' }).setScrollFactor(0);
    this.rateTxt.setText(perMin > 0 ? `+${Math.round(perMin)}/m` : '');
  }

  flashNotEnough(msg) {
    if (!this._neT) this._neT = this.add.text(this.W / 2, 34, '', { fontFamily: 'Menlo, monospace', fontSize: '12px', fontWeight: 'bold', color: '#ff6060' }).setOrigin(0.5).setScrollFactor(0).setDepth(95).setStroke(2, 0x000000, 0.8);
    this._neT.setText(msg || 'NOT ENOUGH MINERALS').setAlpha(1).setScale(1.06);
    this.tweens.add({ targets: this._neT, alpha: 0, scale: 1, duration: 900, ease: 'Quad.easeOut' });
    if (this.resText) { this.resText.setColor('#ff6060'); this.time.delayedCall(350, () => { if (this.resText?.active !== false) this.resText.setColor('#dbe7ff'); }); }
  }

  flash(bg) { bg.setFillStyle(0x3b82f6, 1); this.tweens.add({ targets: bg, fillAlpha: 1, duration: 90, onComplete: () => bg.setFillStyle(0x18202c, 1) }); }

  // SC1-style hover tooltip — v2.48: baked chr-tip 9-slice panel backing
  // v2.51: cost rows get real mineral/gas/supply icon chips inline

  showTip(cx, topY, lines) {
    this.hideTip();
    const arr0 = Array.isArray(lines) ? lines : [lines];
    const arr = [...arr0];
    // find a cost row like "Min 150  Gas 50  Sup 2" and iconify it
    let cost = null;
    const ci = arr.findIndex(l => /^Min \d+/.test(l.trim()));
    if (ci >= 0) {
      const m = /^Min (\d+)(?:\s+Gas (\d+))?(?:\s+Sup (\d+))?$/.exec(arr[ci].trim());
      if (m) { cost = { m: +m[1], g: m[2] ? +m[2] : 0, s: m[3] ? +m[3] : 0, row: ci }; arr[ci] = (cost.g > 0 ? `${cost.m} + ${cost.g}` : `${cost.m}`) + (cost.s > 0 ? `  Sup ${cost.s}` : ''); }
    }
    const w = Math.max(140, ...arr.map(l => l.length * 6.6)) + 16;
    const h = arr.length * 14 + 10;
    const x = Math.min(this.W - w - 6, Math.max(6, cx - w / 2));
    const y = Math.max(6, topY - h);
    if (this.textures.exists('chr-tip')) {
      this._tipNs = CH.panel(this, 'chr-tip', x, y, w, h, { depth: 90, alpha: 0.97 });
    } else {
      this._tipG = this.add.graphics().setScrollFactor(0).setDepth(90);
      this._tipG.fillStyle(0x05080f, 0.95).fillRoundedRect(x, y, w, h, 4);
      this._tipG.lineStyle(1, 0xffd23f, 0.8).strokeRoundedRect(x, y, w, h, 4);
    }
    this._tipT = this.add.text(x + 8, y + 5, arr.join('\n'), { fontFamily: 'Menlo, monospace', fontSize: '10px', color: '#dbe7ff', lineHeight: 14 }).setScrollFactor(0).setDepth(91);
    // cost icons inline before the numbers on the cost row; the row text gets
    // 2 leading spaces per icon (Menlo 10px ~= 6px advance) so digits clear them
    if (cost) {
      this._tipIcons = [];
      let ix = x + 8;
      const iy = y + 5 + cost.row * 14;
      let pad = '';
      if (this.textures.exists('ico-mineral')) { this._tipIcons.push(this.add.image(ix + 5, iy + 6, 'ico-mineral').setScrollFactor(0).setDepth(92).setScale(0.7)); ix += 12; pad += '  '; }
      if (cost.g > 0 && this.textures.exists('ico-gas')) { this._tipIcons.push(this.add.image(ix + 5, iy + 6, 'ico-gas').setScrollFactor(0).setDepth(92).setScale(0.7)); ix += 12; pad += '  '; }
      if (cost.s > 0 && this.textures.exists('ico-supply')) { this._tipIcons.push(this.add.image(ix + 5, iy + 6, 'ico-supply').setScrollFactor(0).setDepth(92).setScale(0.7)); ix += 12; pad += '  '; }
      if (pad && this._tipT) {
        const rows = this._tipT.text.split('\n');
        rows[cost.row] = pad + rows[cost.row];
        this._tipT.setText(rows.join('\n'));
      }
    }
  }
  hideTip() {
    if (this._tipG) { this._tipG.destroy(); this._tipG = null; }
    if (this._tipNs) { if (this._tipNs.obj.active) this._tipNs.obj.destroy(); this._tipNs = null; }
    if (this._tipT) { this._tipT.destroy(); this._tipT = null; }
    if (this._tipIcons) { this._tipIcons.forEach(i => i.active && i.destroy()); this._tipIcons = null; }
  }

  incomeTick(txt, col) {
    if (!this.tickTxt) return;
    this.tickTxt.setText(txt).setColor(col).setAlpha(1).setPosition(this.resText.width + 20, 8);
    this.tweens.add({ targets: this.tickTxt, alpha: 0, y: 2, duration: 650, ease: 'Quad.easeOut' });
  }

  clearButtons() {
    for (const b of this.buttons) { b.bg.destroy(); b.brd.destroy(); b.txt.destroy(); b.hit.destroy(); if (b.chip) { if (b.chip._hk) b.chip._hk.destroy(); b.chip.destroy(); } }
    this.buttons = [];
    if (this._disG) this._disG.clear();
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
    const T = b?.hotseat ? (b.activeTeam ?? 0) : 0;
    const race = b?.hotseat ? b.players[T].race : this.race;
    this._lastSelInfo = info;
    // v2.35b: any non-unit selection clears busts (deselect or building)
    if (!info?.building && !(info?.count > 0)) {
      if (this._busts) { for (const s of this._busts) (s.sp || s).destroy(); this._busts = []; }
      this._selUnits = null;
    }
    if (info?.building) {
      const sel = info.building;
      // v2.35b: building selected — clear unit busts
      if (this._busts) { for (const s of this._busts) (s.sp || s).destroy(); this._busts = []; }
      this._selUnits = null;
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
      for (const k of prods) unitRows.push({ label: UNITS[k].name.split(' ')[0], cb: () => b.events.emit('hud:queueUnit', { buildingId: sel.buildId, kind: k }), cost: UNITS[k].minerals + (UNITS[k].gas ? '/' + UNITS[k].gas : ''), chip: CHIPS.train,
        state: (bt) => { const T = bt.hotseat ? (bt.activeTeam ?? 0) : 0; const p = bt.players[T]; const d = UNITS[k];
          if (p.supplyUsed + (d.supply || 0) > p.supplyCap) return 'supply';
          if (d.tech && !bt.techResearched(T, d.tech)) return 'tech';
          if (!bt.canAfford(T, d.minerals, d.gas)) return 'minerals';
          return ''; },
        tip: [UNITS[k].name, `Min ${UNITS[k].minerals}${UNITS[k].gas ? '  Gas ' + UNITS[k].gas : ''}  Sup ${UNITS[k].supply || 0}`, `HP ${UNITS[k].hp}${UNITS[k].shield ? ' +Sh ' + UNITS[k].shield : ''}  Arm ${UNITS[k].armor || 0}`, `Dmg ${UNITS[k].damage}  Rng ${UNITS[k].range}  Spd ${(UNITS[k].speed || 0).toFixed(2)}`, UNITS[k].tech ? (b.techResearched(0, UNITS[k].tech) ? '✓ ' + (TECHS[UNITS[k].tech]?.name || '') : 'REQUIRES: ' + (TECHS[UNITS[k].tech]?.name || UNITS[k].tech)) : null].filter(Boolean) });
      // research
      const techRows = [];
      for (const tId of def.tech || []) {
        const t = TECHS[tId];
        if (!t) continue;
        if (t.requiresTech && !b.techResearched(0, t.requiresTech)) continue;
        const done = b.techResearched(0, tId);
        techRows.push({ label: (done ? '✓' : '') + t.name.slice(0, 7), cb: () => b.events.emit('hud:queueResearch', { buildingId: sel.buildId, techId: tId }), cost: t.minerals + (t.gas ? '/' + t.gas : ''), chip: CHIPS.upgrade,
          state: (bt) => { const T = bt.hotseat ? (bt.activeTeam ?? 0) : 0;
            if (bt.techResearched(T, tId)) return 'done';
            if (t.requiresTech && !bt.techResearched(T, t.requiresTech)) return 'tech';
            if (!bt.canAfford(T, t.minerals, t.gas)) return 'minerals';
            return ''; },
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
        this.mkBtn(x, y, 78, 38, `${r.label}\n${r.cost}`, r.cb, r.tip, { state: r.state, chip: r.chip });
        i++
      });
      if (def.rally === false && rows.length === 0) {
        this.mkBtn(12, this.H - 96, 78, 38, 'STOP', () => b.events.emit('hud:command', 'stop'), null, { chip: CHIPS.stop });
      }
      return;
    }
    const n = info?.count || 0;
    if (n > 0) {
      const workers = info.units.filter(u => ['rigger', 'skarling', 'artificer'].includes(u.kind)).length === n;
      this.cardTitle.setText(`${n} UNITS${workers ? ' (WORKERS)' : ''}`);
      const names = info.units.slice(0, 3).map(u => `${u.name} ${u.hp}/${u.maxHp}${u.cargo ? ' +' + u.cargo : ''}`).join('  ');
      this.selText.setText(names);
      // SC1 unit-status portraits (hp/shield/energy bars + level chevrons)
      if (!this.portraitG) this.portraitG = this.add.graphics().setScrollFactor(0).setDepth(152);
      this.drawPortraits(info.units, b);
      const order = RACE_INFO[race].buildingOrder.filter(bid => BUILDINGS[bid].race === race);
      const rows = workers ? order : [];
      const kinds = new Set((info.units || []).map(u => u.kind));
      if (!workers) {
        if (kinds.has('tank')) rows.push('__siege');
        if (kinds.has('burrower')) rows.push('__burrow');
        if (kinds.has('marine')) rows.push('__stim');
        if (kinds.has('nightblade')) rows.push('__cloak');
        if (kinds.has('nightblade') && kinds.size === 1) { rows.push('__merge'); if (b.techResearched(0, 'umbralConvergence')) rows.push('__mergeDark'); }
        if (kinds.has('voidlance')) rows.push('__mael');
        if (kinds.has('umbral')) rows.push('__mael');
        if (kinds.has('vexwing')) { rows.push('__morphG'); rows.push('__morphD'); }
        if (kinds.has('corroder')) rows.push('__caustic');
        if (kinds.has('caller')) rows.push('__storm');
        rows.push('__patrol');
        rows.push('__hold');
        if (b.hasBuilding('scienceFacility', 0)) rows.push('__scan');
      }
      // v2.46: DEPLOY button when an MCV-class vehicle is selected
      if ((info.units || []).some(u => u.def && u.def.mcv)) rows.unshift('__deploy');
      let i = 0;
      const cols = Math.max(1, Math.min(5, Math.floor((this.W - 24) / 74)));
      const abil = {
        __siege: ['SIEGE [S]', () => b.events.emit('hud:siege')],
        __burrow: ['BURROW [B]', () => b.events.emit('hud:burrow')],
        __stim: ['STIM [F]', () => b.events.emit('hud:stim')],
        __cloak: ['CLOAK [K]', () => b.events.emit('hud:cloak')],
        __merge: ['MERGE [M]', () => b.events.emit('hud:mergeRadiant')],
        __mergeDark: ['DARK MERGE', () => b.events.emit('hud:mergeDarkRadiant')],
        __mael: ['MAELSTROM', () => b.events.emit('hud:maelstrom')],
        __morphG: ['GUARDIAN', () => b.events.emit('hud:morphSporecaster')],
        __morphD: ['DEVOURER', () => b.events.emit('hud:morphCorroder')],
        __caustic: ['CAUSTIC', () => b.events.emit('hud:caustic')],
        __storm: ['PSI STORM [V]', () => b.events.emit('hud:castStorm')],
        __patrol: ['PATROL [P]', () => b.events.emit('hud:patrol')],
        __hold: ['HOLD [H]', () => b.events.emit('hud:command', 'hold')],
        __scan: ['SCAN [T]', () => b.events.emit('hud:scan')],
        // v2.46 backlog: MCV deploy button in the command card (was D-key only)
        __deploy: ['DEPLOY [D]', () => { const m = b.selection && [...b.selection].find(u => !u.dead && u.def.mcv); if (m) b.deployMCV(m); }]
      };
      // live grey-out conditions per ability (energy/tech gates read from selection each tick)
      const hasKind = (bt, ...ks) => bt.selection && [...bt.selection].some(u => !u.dead && ks.includes(u.kind));
      const energyReady = (bt, ...ks) => bt.selection && [...bt.selection].some(u => !u.dead && ks.includes(u.kind) && (u.energy || 0) >= (ks[0] === 'voidlance' || ks[0] === 'umbral' ? 100 : 75));
      const abilState = {
        __cloak: (bt) => (!hasKind(bt, 'nightblade') || [...bt.selection].every(u => u.dead || !u.def.cloak)) ? 'nocrew' : '',
        __merge: (bt) => (bt.selection && [...bt.selection].filter(u => !u.dead && u.kind === 'nightblade').length >= 2) ? '' : 'nocrew',
        __mergeDark: (bt) => !b.techResearched(0, 'umbralConvergence') ? 'tech' : ((bt.selection && [...bt.selection].filter(u => !u.dead && u.kind === 'nightblade').length >= 2) ? '' : 'nocrew'),
        __mael: (bt) => energyReady(bt, 'voidlance', 'umbral') ? '' : 'energy',
        __storm: (bt) => energyReady(bt, 'caller') ? '' : 'energy',
        __caustic: (bt) => energyReady(bt, 'corroder') ? '' : 'energy',
        __morphG: (bt) => !b.techResearched(0, 'sporecaster') ? 'tech' : (hasKind(bt, 'vexwing') ? '' : 'nocrew'),
        __morphD: (bt) => !b.techResearched(0, 'corroder') ? 'tech' : (hasKind(bt, 'vexwing') ? '' : 'nocrew'),
        __scan: (bt) => bt._scanCd > 0 ? 'energy' : (!b.hasBuilding('scienceFacility', 0) ? 'tech' : ''),
      };
      const btnDefs = rows.map(bid => {
        const chipKey = CHIPS[String(bid).replace(/^__/, '')] || (bid[0] === '_' ? '' : CHIPS.build);
        if (abil[bid]) return { label: abil[bid][0], cb: abil[bid][1], state: abilState[bid] || null, chip: chipKey };
        return { label: BUILDINGS[bid].name.split(' ').map(w => w[0]).join('').slice(0, 4).toUpperCase() + '\n' + BUILDINGS[bid].name.split(' ')[0], cb: () => b.events.emit('hud:place', bid), chip: chipKey,
          state: (bt) => { const T = bt.hotseat ? (bt.activeTeam ?? 0) : 0; const d = BUILDINGS[bid];
            if (d.requires && !d.requires.every(r => bt.hasBuilding(r, T))) return 'tech';
            if (!bt.canAfford(T, d.minerals, d.gas)) return 'minerals';
            return ''; } };
      });
      btnDefs.unshift({ label: 'STOP', cb: () => b.events.emit('hud:command', 'stop'), chip: CHIPS.stop });
      btnDefs.unshift({ label: 'ATTACK\nMOVE', cb: () => b.events.emit('hud:attackMode'), chip: CHIPS.attack });
      btnDefs.slice(0, cols * 2).forEach((r) => {
        const col = i % cols, row = (i / cols) | 0;
        this.mkBtn(12 + col * 72, this.H - 96 + row * 44, 68, 38, r.label, r.cb, null, { state: r.state, chip: r.chip });
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
    // v2.35b gap 27: destroy previous bust sprites before rebuilding
    if (this._busts) { for (const s of this._busts) (s.sp || s).destroy(); this._busts = []; }
    this._busts = [];
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
      // SC1: animated portrait bust — sprite cycle of the unit's walk frames
      const team = u.team > 2 ? 2 : (u.team || 0);
      const baseKey = `u-${u.def?.icon || u.kind}-t${team}`;
      if (b.textures.exists(baseKey)) {
        const sp = this.add.image(x + 18, y + 10, baseKey).setDepth(150).setScale(1.6);
        this._busts.push({ sp, u, team, fr: 0 });
      } else {
        g.fillStyle(0x4ea1ff, 0.9); g.fillRect(x + 12, y + 4, 12, 12);
      }
    }
    this._selUnits = units || [];
    this._selX0 = x0; this._selY0 = y0; this._selMax = max;
    this.drawPortraitBars();
  }

  drawPortraitBars() {
    const g = this.portraitG; if (!g || !this._selUnits) return;
    // redraw only the bars over the busts layer's frame
    const x0 = this._selX0, y0 = this._selY0, max = this._selMax;
    for (let i = 0; i < max; i++) {
      const u = this._selUnits[i];
      const x = x0 + i * 40, y = y0;
      // hp bar
      const hr = Math.max(0, Math.min(1, u.hp / (u.maxHp || 1)));
      g.fillStyle(0x0a1220, 0.9); g.fillRect(x + 2, y + 18, 32, 6);
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
      // SC1 damaged-portrait flicker: red flash while recently hurt
      if (u._dmgFlashUntil && performance.now() < u._dmgFlashUntil) {
        g.fillStyle(0xff4444, 0.25); g.fillRect(x, y, 36, 26);
      }
    }
  }

  // v2.35b gap 27: bust animation tick — walk-frame cycle ~7fps, live bars
  update() {
    if (!this._busts || !this._busts.length) return;
    const now = performance.now();
    if (now - (this._pfT || 0) < 140) return;
    this._pfT = now;
    const b = this.scene.get('Battle');
    const fr = ((this._pf || 0) + 1) % 3; this._pf = fr;
    for (const e of this._busts) {
      if (!e.sp.active || e.u.dead) { if (e.sp.active) e.sp.setAlpha(0.25); continue; }
      const k = `u-${e.u.def?.icon || e.u.kind}-t${e.team}-w${fr}`;
      if (b?.textures?.exists(k)) e.sp.setTexture(k);
    }
    // live bars: redraw every other bust tick
    if (this._selUnits) { this.portraitG.clear(); const x0 = this._selX0, y0 = this._selY0, max = this._selMax;
      this.portraitG.fillStyle(0x0a1220, 0.85); this.portraitG.fillRect(x0 - 2, y0 - 2, max * 40 + 4, 30);
      this.portraitG.lineStyle(1, 0x3f4a5a, 0.8); this.portraitG.strokeRect(x0 - 2, y0 - 2, max * 40 + 4, 30);
      for (let i = 0; i < max; i++) { const x = x0 + i * 40; this.portraitG.fillStyle(0x101826, 1); this.portraitG.fillRect(x, y0, 36, 26); }
      this.drawPortraitBars();
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
    // v2.53: was auto-width at W-260 -> long lines ran THROUGH the minimap
    // (mmX = W-198) and clipped off-screen. Fixed-width wrap column that
    // ends 10px left of the minimap bezel.
    const mmx = this.mmX || (this.W - 198);
    const lw = Math.max(220, mmx - 18);
    this._logW = lw;
    this._logText = this.add.text(0, 44, '', { fontFamily: 'Menlo, monospace', fontSize: '10px', color: '#b9c8e8', lineHeight: 14, align: 'right', wordWrap: { width: lw } }).setOrigin(1, 0).setScrollFactor(0).setDepth(60).setAlpha(0.95);
    this._logText.setX(mmx - 10);
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
      const acc = (RACE_INFO[this.race] || {}).accent || 0x6ee7a0;
      // v2.51: baked plate + accent stroke + pop tween on (re)render
      if (this.textures.exists('chr-grpbadge')) {
        const plate = this.add.image(x + size / 2, by + size / 2, 'chr-grpbadge').setScrollFactor(0).setDepth(60).setDisplaySize(size, size);
        if (empty) plate.setTint(0x5a616c).setAlpha(0.6); else plate.setTint(acc);
        this.groupBadgeTxts.push(plate);
      } else {
        this.groupBadgeG.fillStyle(0x0a1220, 0.92).fillRoundedRect(x, by, size, size, 4);
      }
      this.groupBadgeG.lineStyle(1, empty ? 0x3a3f48 : acc, 1).strokeRoundedRect(x + 0.5, by + 0.5, size - 1, size - 1, 4);
      this.groupBadgeTxts.push(this.add.text(x + size / 2, by + 7, String(g.n), { fontFamily: 'Menlo, monospace', fontSize: '11px', color: empty ? '#5a616c' : '#eaf4ff', fontStyle: 'bold' }).setOrigin(0.5).setScrollFactor(0).setDepth(61));
      this.groupBadgeTxts.push(this.add.text(x + size / 2, by + 17, empty ? '—' : String(alive), { fontFamily: 'Menlo, monospace', fontSize: '8px', color: '#8fa3c8' }).setOrigin(0.5).setScrollFactor(0).setDepth(61));
      if (!empty && this._grpPop !== g.n) {
        this.tweens.add({ targets: this.groupBadgeTxts.slice(-3), scale: { from: 1.25, to: 1 }, duration: 160, ease: 'Back.easeOut' });
      }
      if (!empty) this._grpPop = g.n;
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
    if (r === 'victory') this.scene.get('Battle').polish?.confetti();
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
    this.updateButtonStates(b);
    this.censusTick(b);
    this.urgencyTick(b);
    const T = b.hotseat ? (b.activeTeam ?? 0) : 0;
    const p = b.players[T];
    const capped = p.supplyUsed >= p.supplyCap;
    // v2.46: icon+number layout (icons baked in chrome.js; legacy resText kept as alias)
    this.resText = { setText: () => {}, setColor: (c) => { for (const t of this._resNums) if (t?.active) t.setColor(c); }, width: 300, active: true };
    this.resMin.setText(this.fmt(p.minerals));
    this.resGas.setText(this.fmt(p.gas));
    this.resSup.setText(`${Math.floor(p.supplyUsed)}/${p.supplyCap}`).setColor('#dbe7ff');
    if (this.icoSup) this.icoSup.setTint(capped ? 0xff5c5c : 0xffffff);
    if (capped) this.resSup.setColor('#ff5c5c');
    // v2.26: income rate readout (+N/min) once your economy is collecting
    {
      const nowMs2 = performance.now();
      if (!this._ir) this._ir = { t: nowMs2, m: p.minerals, g: p.gas, on: false };
      const dt = (nowMs2 - this._ir.t) / 60000;
      if (dt >= 0.5) {
        const dm = p.minerals - this._ir.m, dg = p.gas - this._ir.g;
        if (dm > 0 || dg > 0) this._ir.on = true;
        if (this._ir.on) this.setIncomeRate(dt > 0 ? (dm + dg * 1.4) / dt : 0);
        this._ir = { t: nowMs2, m: p.minerals, g: p.gas, on: this._ir.on };
      }
    }
    this.resText.setColor(capped ? '#ff5c5c' : '#dbe7ff');
    const idle = p.idleWorkers || 0;
    if (!this.idleTxt) {
      this.idleTxt = this.add.text(this.W / 2 + 150, 14, '', { fontFamily: 'Menlo, monospace', fontSize: '11px', color: '#ffd23f' }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(61);
      // v2.51: baked chip plate behind the IDLE counter
      if (this.textures.exists('chr-idle')) this._idlePlate = this.add.image(this.W / 2 + 150, 22, 'chr-idle').setOrigin(0.5).setScrollFactor(0).setDepth(60).setVisible(false).setDisplaySize(64, 18);
    }
    if (this.idleTxt) { this.idleTxt.setText(idle > 0 ? `IDLE ${idle} ▶` : '').setVisible(idle > 0); }
    if (this._idlePlate) { this._idlePlate.setVisible(idle > 0); if (idle > 0 && !this._idlePulse) { this._idlePulse = this.tweens.add({ targets: this._idlePlate, alpha: { from: 1, to: 0.55 }, duration: 600, yoyo: true, repeat: -1 }); } else if (idle === 0 && this._idlePulse) { this.tweens.killTweensOf(this._idlePlate); this._idlePulse = null; this._idlePlate.setAlpha(1); } }
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

  // v2.46: shroud pass — unexplored tiles go opaque dark, explored-but-unseen get the
  // fibrous fog texture, currently-explored intel reads through. Repaints at 2Hz.
  drawShroud(b) {
    if (!this.mmShroud || !this._mmShroudCtx) return;
    const now = b.gameTime || 0;
    if (now - (this._shroudAt || -9) < 0.5) return;
    this._shroudAt = now;
    const ctx = this._mmShroudCtx, res = this._mmShroudCv.width / MAP_W;
    ctx.clearRect(0, 0, this._mmShroudCv.width, this._mmShroudCv.height);
    if (!this._shroudPat) this._shroudPat = ctx.createPattern(this.textures.get('chr-shroud').getSourceImage(), 'repeat');
    // per-tile: unexplored = opaque void; explored = translucent fibrous shroud
    for (let i = 0; i < b.seen.length; i++) {
      const tx = i % MAP_W, ty = (i / MAP_W) | 0;
      if (!b.seen[i]) { ctx.fillStyle = '#05070d'; ctx.fillRect(tx * res, ty * res, res, res); continue; }
      ctx.globalAlpha = 0.30; ctx.fillStyle = '#5b6678';
      ctx.fillRect(tx * res, ty * res, res, res);
      ctx.globalAlpha = 0.22; ctx.fillStyle = this._shroudPat;
      ctx.fillRect(tx * res, ty * res, res, res);
      ctx.globalAlpha = 1;
    }
    this.textures.get('mm_shroud').refresh();
  }

  drawMinimap(b) {
    const g = this.mmG;
    g.clear();
    const s = this.mmSize / (MAP_W * TILE);
    this.drawShroud(b);
    // polish: rotating radar sweep + framed bezel
    b.polish?.radarSweep(g, this.mmX, this.mmY, this.mmSize);
    b.polish?.mmFrame(g, this.mmX, this.mmY, this.mmSize);
    // blight
    for (const t of [0, 1]) {
      const cells = b.blightCanvases[t].cells;
      g.fillStyle(t === 0 ? 0x24406e : 0x5a2340, 0.85);
      for (let i = 0; i < cells.length; i++) if (cells[i]) { g.fillRect(this.mmX + ((i % MAP_W) * TILE) * s, this.mmY + (((i / MAP_W) | 0) * TILE) * s, 2, 2); }
    }
    // v2.45: resources only appear once scouted (no always-known economy leak)
    g.fillStyle(0x2c4a7a, 0.9);
    for (const m of b.minerals) {
      if (m.amount <= 0) continue;
      if (!b.seen[b.nav.idx(Math.floor(m.x / TILE), Math.floor(m.y / TILE))]) continue;
      g.fillCircle(this.mmX + m.x * s, this.mmY + m.y * s, 1.6);
    }
    g.fillStyle(0x3ad0a0, 0.9);
    for (const ge of b.geysers) {
      if (!b.seen[b.nav.idx(Math.floor(ge.x / TILE), Math.floor(ge.y / TILE))]) continue;
      g.fillCircle(this.mmX + ge.x * s, this.mmY + ge.y * s, 2);
    }
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

  // ---------------- v2.27 ----------------
  // 55) kill feed ticker: v2.48 rows on baked chrome strips, weapon glyph, 6s fade
  killFeed(e) {
    if (!e) return;
    this._kf = this._kf || [];
    this._kf.push({ mine: e.mine, killer: e.killer, victim: e.victim });
    if (this._kf.length > 5) this._kf.shift();
    // rebuild row objects on chr-kfrow strips (tinted by outcome)
    if (this._kfRows) { for (const r of this._kfRows) { if (r.bg) r.bg.destroy(); if (r.ico) r.ico.destroy(); if (r.txt) r.txt.destroy(); } }
    this._kfRows = [];
    const x0 = 10, y0 = this.H - 238;
    this._kf.forEach((m, i) => {
      const y = y0 + i * 17;
      const ok = this.textures.exists('chr-kfrow');
      const bg = ok ? this.add.image(x0, y, 'chr-kfrow').setOrigin(0, 0).setScrollFactor(0).setDepth(60).setTint(m.mine ? 0x2a4a6e : 0x6e2a2a).setAlpha(0.88)
        : this.add.rectangle(x0, y, 190, 15, m.mine ? 0x1c3a5a : 0x5a1c1c, 0.8).setOrigin(0, 0).setScrollFactor(0).setDepth(60);
      const ico = this.textures.exists('chip-attack') ? this.add.image(x0 + 8, y + 7.5, 'chip-attack').setScrollFactor(0).setDepth(62).setScale(0.8) : null;
      const txt = this.add.text(x0 + 18, y + 7.5, `${m.killer}  ⚔  ${m.victim}`, { fontFamily: 'Menlo, monospace', fontSize: '11px', color: m.mine ? '#cfe6ff' : '#ffd0d0' }).setOrigin(0, 0.5).setScrollFactor(0).setDepth(62);
      this._kfRows.push({ bg, ico, txt });
    });
    this._kfText = this._kfRows.length ? this._kfRows[this._kfRows.length - 1].txt : null;
    if (!this._kfDecayT) this._kfDecayT = 0;
    if (this._kfDecay) this.time.removeEvent(this._kfDecay);
    this._kfDecay = this.time.delayedCall(4200, () => {
      if (!this._kfRows) return;
      for (const r of this._kfRows) { this.tweens.add({ targets: [r.bg, r.ico, r.txt].filter(Boolean), alpha: 0.25, duration: 1800 }); }
    });
  }

  // 56) voice bark subtitle card (mirrors SpeechSynthesis barks)
  barkSub(text) {
    if (!text) return;
    if (this._barkT) this._barkT.destroy();
    if (this._barkG) this._barkG.destroy();
    const w = Math.min(520, text.length * 7 + 40);
    if (this.textures.exists('chr-kfrow')) {
      this._barkG = this.add.image(this.W / 2 - w / 2, this.H - 300, 'chr-kfrow').setOrigin(0, 0).setScrollFactor(0).setDepth(70).setDisplaySize(w, 30).setTint(0x1d4a38).setAlpha(0.92);
    } else {
      this._barkG = this.add.graphics().setScrollFactor(0).setDepth(70);
      this._barkG.fillStyle(0x050a14, 0.88).fillRoundedRect(this.W / 2 - w / 2, this.H - 300, w, 30, 5);
      this._barkG.lineStyle(1, 0x6ee7a0, 0.85).strokeRoundedRect(this.W / 2 - w / 2, this.H - 300, w, 30, 5);
    }
    this._barkT = this.add.text(this.W / 2, this.H - 285, '“' + text + '”', { fontFamily: 'Menlo, monospace', fontSize: '12px', fontStyle: 'italic', color: '#d7f5e3', wordWrap: { width: w - 16 } }).setOrigin(0.5).setScrollFactor(0).setDepth(71);
    this.tweens.add({ targets: [this._barkG, this._barkT], alpha: 0, delay: 3600, duration: 600, onComplete: () => { if (this._barkT && this._barkT.active) { this._barkT.destroy(); this._barkT = null; } if (this._barkG && this._barkG.active) { this._barkG.destroy(); this._barkG = null; } } });
  }

  // 57) minimap strategic zoom: wheel over the minimap scales it, remembered
  mmZoomWheel(px, py, dy) {
    if (px < this.mmX || px > this.mmX + this.mmSize || py < this.mmY || py > this.mmY + this.mmSize) return false;
    const sizes = [140, 190, 240];
    const cur = sizes.indexOf(this.mmSize);
    const nxt = Phaser.Math.Clamp(cur < 0 ? 1 : (dy > 0 ? cur - 1 : cur + 1), 0, sizes.length - 1);
    if (sizes[nxt] === this.mmSize) return true;
    const nz = sizes[nxt];
    const oldX = this.mmX, oldY = this.mmY, os = this.mmSize;
    this.mmSize = nz; this.mmX = this.W - nz - 8;
    if (this._logText && this._logW) { this._logText.setX(this.mmX - 10); } // v2.53 keep msg log clear of bezel (origin=1)
    this.mmBG.setSize(nz, nz); this.mmBG.setPosition(this.mmX, this.mmY);
    this.mmFrame.setSize(nz, nz); this.mmFrame.setPosition(this.mmX, this.mmY);
    if (this.mmChrome) { this.mmChrome.setPosition(this.mmX - 4, this.mmY - 4); this.mmChrome.setDisplaySize(nz + 8, nz + 8); }
    if (this.mmTerrain) { this.mmTerrain.setPosition(this.mmX, this.mmY); this.mmTerrain.setDisplaySize(nz, nz); }
    if (this.mmZone) { this.mmZone.setSize(nz, nz); this.mmZone.setPosition(this.mmX, this.mmY); }
    this.drawMmBrackets(); // v2.50
    this.mmG.setScale(1);
    const b = this.scene.get('Battle');
    if (b && b.playSounds && b.playSounds.zoom) b.playSounds.zoom();
    this._mmZoomPop = { t: this.time.now };
    return true;
  }

  drawMmBrackets() {
    if (!this.mmBrackets || !this.mmBrackets.active) return;
    const g = this.mmBrackets; g.clear();
    const L = 12, s = this.mmSize, x = this.mmX, y = this.mmY;
    g.lineStyle(2, this.mmAcc, 0.9);
    // TL
    g.lineBetween(x, y + L, x, y); g.lineBetween(x, y, x + L, y);
    // TR
    g.lineBetween(x + s - L, y, x + s, y); g.lineBetween(x + s, y, x + s, y + L);
    // BL
    g.lineBetween(x, y + s - L, x, y + s); g.lineBetween(x, y + s, x + L, y + s);
    // BR
    g.lineBetween(x + s - L, y + s, x + s, y + s); g.lineBetween(x + s, y + s, x + s, y + s - L);
  }

  // 58) fleet census: top-bar silhouette counts, click selects all of type on screen
  censusTick(b) {
    if (!b || b.gameOver) { if (this._census) this._census.setVisible(false); return; }
    const sc = b.units.filter(u => !u.dead && u.team === (b.activeTeam ?? 0));
    const tally = {};
    for (const u of sc) tally[u.kind] = (tally[u.kind] || 0) + 1;
    const keys = Object.keys(tally).sort((a, b2) => tally[b2] - tally[a]).slice(0, 6);
    if (!keys.length) { if (this._census) this._census.setVisible(false); return; }
    if (!this._census) {
      this._census = this.add.container(70, 40).setScrollFactor(0).setDepth(60);
      this._censusBG = this.add.graphics();
      this._census.add(this._censusBG);
      this._censusList = [];
    }
    // rebuild rows on kind change only
    const sig = keys.join(',');
    if (this._censusSig === sig) {
      keys.forEach((k, i) => { const row = this._censusList[i]; if (row) row.num.setText(String(tally[k])); });
      return;
    }
    this._censusSig = sig;
    for (const c of this._censusList) { c.bg.destroy(); c.ic.destroy(); c.num.destroy(); }
    this._censusList = [];
    this._censusBG.clear();
    this._censusBG.fillStyle(0x050a14, 0.75).fillRoundedRect(-4, -4, keys.length * 34 + 12, 34, 5);
    keys.forEach((k, i) => {
      const bx = i * 34;
      const bg = this.add.rectangle(bx, 0, 28, 26, 0x0a1626, 0.9).setOrigin(0, 0).setInteractive({ useHandCursor: true });
      const ic = this.add.text(bx + 14, 7, (UNITS[k]?.name || k).slice(0, 2).toUpperCase(), { fontFamily: 'Menlo, monospace', fontSize: '9px', color: '#9fb3d8' }).setOrigin(0.5);
      const num = this.add.text(bx + 14, 18, String(tally[k]), { fontFamily: 'Menlo, monospace', fontSize: '10px', color: '#ffd23f' }).setOrigin(0.5);
      bg.on('pointerdown', () => {
        const bb = this.scene.get('Battle');
        if (!bb || !bb.clearSelection) return;
        bb.clearSelection();
        const vw = bb.cameras.main.worldView;
        for (const u of bb.units) if (!u.dead && u.team === (bb.activeTeam ?? 0) && u.kind === k && vw.contains(u.x, u.y)) bb.addToSelection(u);
      });
      this._census.add([bg, ic, num]);
      this._censusList.push({ bg, ic, num, k });
    });
  }

  // 59) objective urgency recolor + sting at 10s on hold objectives
  urgencyTick(b) {
    if (!b || !b.mission || !b.mission.holdSeconds || !this.timeText) return;
    const left = b.mission.holdSeconds - b.gameTime;
    if (left <= 0) { if (!this._urgStung) { this._urgStung = true; b.audio?.alertSnd?.(); } return; }
    if (left < 20) { this.timeText.setColor('#ff5c5c'); if (!this._urgPulse) { this._urgPulse = this.tweens.add({ targets: this.timeText, alpha: 0.45, yoyo: true, repeat: -1, duration: 300 }); } if (!this._urgStung && left <= 10) { this._urgStung = true; b.audio?.alertSnd?.(); this.banner('FINAL TEN SECONDS'); } }
    else if (left < 60) this.timeText.setColor('#ffb04a');
    else { this.timeText.setColor('#ffffff'); if (this._urgPulse) { this._urgPulse.stop(); this._urgPulse = null; this.timeText.setAlpha(1); } this._urgStung = false; }
  }

  handleResize() {
    this.W = this.scale.width; this.H = this.scale.height;
    this.topBG.setSize(this.W, 34);
    if (this.topPanel) this.topPanel.resize(this.W, 34);
    this.timeText.setPosition(this.W / 2, 8);
    this.selCount.setPosition(this.W - 12, 8);
    this.speedBtn.setPosition(this.W - 70, 4);
    this.mmX = this.W - this.mmSize - 8;
    this.mmBG.setPosition(this.mmX, this.mmY);
    this.mmFrame.setPosition(this.mmX, this.mmY);
    if (this.mmShroud) this.mmShroud.setPosition(this.mmX, this.mmY);
    if (this._cardPanel) { this._cardPanel.obj.setPosition(4, this.H - 128); this._cardPanel.resize(Math.min(this.W - 210, 78 * Math.max(1, Math.min(4, Math.floor((this.W - 24) / 84))) + 24), 124); }
    if (this.gameOver) { this.goDim.setSize(this.W, this.H); this.goTitle.setPosition(this.W / 2, this.H / 2 - 20); }
  }
}
