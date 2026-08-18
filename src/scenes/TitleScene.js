import Phaser from 'phaser';
import { GameStates, session } from '../game/state/gameSession.js';
import { DIFFICULTY_ORDER, getDifficulty } from '../game/data/difficulties.js';
import { RACE_ORDER, getRace } from '../game/data/races.js';
import { getShellSize } from '../game/shellSize.js';

// ── Card spacing & start-button sizing constants (compact vs wide) ──────────
const CARD_SPACING = {
  compact: {
    widthMax: 440,
    widthMinPad: 36,
    heightMax: 140,
    heightMin: 116,
    gap: 10,
  },
  wide: {
    widthMax: 290,
    widthMin: 220,
    widthPad: 56,
    gapMax: 20,
    gapMin: 12,
    heightMax: 210,
  },
};

const START_BUTTON = {
  widthCompact: 300,
  widthWide: 270,
  height: 60,
};

// ── Shared menu text style (title, subtitle, description, labels, footer) ────
const MENU_TEXT_STYLE = { fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' };

const FACTION_PRESENTATION = {
  terran: { callsign: 'IRON LEGION', descriptor: 'MECHANIZED FRONTIER', icon: 'terran-marine', tint: 0x60a5fa },
  zerg: { callsign: 'BROOD SWARM', descriptor: 'ADAPTIVE HIVE MIND', icon: 'zerg-zergling', tint: 0xf97316 },
  protoss: { callsign: 'AEON CONCLAVE', descriptor: 'PSIONIC ASCENDANCY', icon: 'protoss-zealot', tint: 0xa78bfa }
};

// ── Description word-wrap width helpers ───────────────────────────────────────
const DESC_WRAP_PAD = 50;
const DESC_WRAP_MAX = 680;

function descWrapWidth(width) {
  return Math.min(width - DESC_WRAP_PAD, DESC_WRAP_MAX);
}

// ── Race-card subtitle word-wrap helper ───────────────────────────────────────
const RACE_CARD_SUBTITLE_WRAP_PAD = 30;

function raceCardSubtitleWrapWidth(cardWidth) {
  return cardWidth - RACE_CARD_SUBTITLE_WRAP_PAD;
}

const FACTION_PALETTES = {
  terran: { deep: 0x07111c, mid: 0x12345a, hot: 0x60a5fa, light: 0xdbeafe },
  zerg: { deep: 0x140b08, mid: 0x4a1d18, hot: 0xf97316, light: 0xffedd5 },
  protoss: { deep: 0x0c0918, mid: 0x2f2160, hot: 0xa78bfa, light: 0xede9fe },
};

function reducedMotion() {
  return typeof window !== 'undefined'
    && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

export default class MenuScene extends Phaser.Scene {
  constructor() {
    super('MenuScene');
  }

  create() {
    session.setScreen(GameStates.MENU, 'menu');
    session.setMessage('Choose a faction, then deploy into battle.');
    session.setObjective('Single-player skirmish: build economy, produce troops, and destroy the enemy base.');

    const { width, height } = this.scale;
    this.layout = this.getLayout(width, height);
    this.selectedRaceId = session.raceId ?? 'terran';
    this.selectedDifficultyId = session.difficultyId ?? 'normal';

    this.reducedMotion = reducedMotion();
    this.isTransitioning = false;
    this.lastInteractionAt = this.time.now;
    this.attractIndex = 0;
    this.cameras.main.setBackgroundColor('#050a12');

    // PASS 1/2/3/4/5/6/7/8/9/10: layered command-deck atmosphere.
    this.background = this.add.rectangle(width / 2, height / 2, width, height, 0x050a12, 1);
    this.backdropGlow = this.add.graphics().setDepth(-8);
    this.backdropGrid = this.add.graphics().setDepth(-7).setAlpha(0.24);
    this.backdropVignette = this.add.graphics().setDepth(-6).setAlpha(0.72);
    this.starfield = this.add.group();
    this.createBackdropArt(width, height);

    // PASS 11: directional, recycled ambient particles.
    const particleGroup = this.add.group();
    this.particleGroup = particleGroup;
    for (let i = 0; i < 40; i += 1) {
      const px = Phaser.Math.Between(0, width);
      const py = Phaser.Math.Between(0, height);
      const size = Phaser.Math.FloatBetween(1, 3);
      const alpha = Phaser.Math.FloatBetween(0.1, 0.4);
      const particle = this.add.circle(px, py, size, 0x3b82f6, alpha);
      particleGroup.add(particle);
    }

    // Gently drift particles upward
    this.particleTween = this.reducedMotion ? null : this.tweens.addCounter({
      from: 0, to: 1, duration: Infinity, ease: 'Linear',
      onUpdate: (tween) => {
        particleGroup.getChildren().forEach((p, idx) => {
          p.setY(p.y - 0.2 * (1 + (idx % 3) * 0.5));
          if (p.y < -10) {
            p.setPosition(Phaser.Math.Between(0, width), height + 10);
          }
        });
      }
    });

    const shell = getShellSize(width, height, this.layout.compact);
    this.shellGlow = this.add.rectangle(shell.x, shell.y, shell.width + 18, shell.height + 18, 0x1d4ed8, 0.06)
      .setStrokeStyle(1, 0x60a5fa, 0.2).setDepth(-4);
    this.shell = this.add.rectangle(shell.x, shell.y, shell.width, shell.height, 0x0a1524, 0.92)
      .setStrokeStyle(2, 0x1f3b61, 1);
    this.shellInner = this.add.rectangle(shell.x, shell.y, shell.width - 12, shell.height - 12, 0x000000, 0)
      .setStrokeStyle(1, 0x1e3a5f, 0.6);

    this.titleHalo = this.add.text(width / 2, this.layout.titleY + 2, 'SCC', {
      ...MENU_TEXT_STYLE,
      fontSize: 'clamp(48px, 10vw, 92px)',
      fontStyle: '900', color: '#1d4ed8', align: 'center', alpha: 0.32,
    }).setOrigin(0.5).setBlendMode(Phaser.BlendModes.ADD);
    this.titleText = this.add.text(width / 2, this.layout.titleY, 'SCC', {
      ...MENU_TEXT_STYLE,
      fontSize: 'clamp(48px, 10vw, 92px)',
      fontStyle: '900',
      color: '#ffffff',
      align: 'center', letterSpacing: 8,
      shadow: { offsetX: 0, offsetY: 4, color: '#000000', blur: 8, stroke: true, fill: true }
    }).setOrigin(0.5);
    this.titleRule = this.add.graphics();
    this.titleRule.lineStyle(1, 0x60a5fa, 0.65);
    this.titleRule.lineBetween(width / 2 - 150, this.layout.titleY + 52, width / 2 + 150, this.layout.titleY + 52);

    // Version number (top-right corner)
    this.versionText = this.add.text(width - 16, 16, 'v2.13.0', {
      ...MENU_TEXT_STYLE,
      fontSize: '12px',
      fontStyle: '600',
      color: '#475569'
    }).setOrigin(1, 0);

    this.subtitleText = this.add.text(width / 2, this.layout.subtitleY, 'StarCraft-inspired mobile RTS skirmish', {
      ...MENU_TEXT_STYLE,
      fontSize: 'clamp(14px, 3vw, 22px)',
      color: '#cbd5e1',
      align: 'center'
    }).setOrigin(0.5);

    this.descriptionText = this.add.text(width / 2, this.layout.descriptionY, 'Choose a race, then build, scout, and push across the battlefield.', {
      ...MENU_TEXT_STYLE,
      fontSize: 'clamp(13px, 2.6vw, 18px)',
      color: '#94a3b8',
      align: 'center',
      wordWrap: { width: descWrapWidth(width) }
    }).setOrigin(0.5);

    this.cardEntries = [];
    RACE_ORDER.forEach((raceId, index) => {
      const race = getRace(raceId);
      this.cardEntries.push(this.createRaceCard(race, index));
    });

    this.difficultyEntries = [];
    this.createDifficultyControls();
    this.createDifficultyTrack();

    // PASS 7/15/18: layered deploy control, pulse, and transition lock.
    this.startAura = this.add.rectangle(width / 2, this.layout.startY, this.layout.startWidth + 22, START_BUTTON.height + 18, 0x2563eb, 0.1)
      .setStrokeStyle(1, 0x60a5fa, 0.35);
    this.startButton = this.add.rectangle(width / 2, this.layout.startY, this.layout.startWidth, START_BUTTON.height, 0x2563eb, 1)
      .setStrokeStyle(2, 0x60a5fa, 1)
      .setInteractive({ useHandCursor: true });
    this.startHighlight = this.add.rectangle(width / 2, this.layout.startY - START_BUTTON.height / 2 + 2, this.layout.startWidth - 4, 2, 0xffffff, 0.35);

    this.startLabel = this.add.text(width / 2, this.layout.startY - 4, 'Deploy into Mission', {
      ...MENU_TEXT_STYLE,
      fontSize: 'clamp(16px, 3vw, 22px)',
      fontStyle: '700',
      color: '#ffffff',
      align: 'center'
    }).setOrigin(0.5);
    this.startSubLabel = this.add.text(width / 2, this.layout.startY + 20, 'CLICK TO INITIALIZE DEPLOYMENT', {
      ...MENU_TEXT_STYLE, fontSize: '10px', fontStyle: '700', color: '#dbeafe',
      letterSpacing: 2, align: 'center'
    }).setOrigin(0.5);

    this.footerText = this.add.text(width / 2, this.layout.footerY, 'Tip: tap and drag the battlefield to pan once you are in the match.', {
      ...MENU_TEXT_STYLE,
      fontSize: 'clamp(12px, 2.3vw, 15px)',
      color: '#64748b',
      align: 'center'
    }).setOrigin(0.5);

    // Multiple input handlers for maximum compatibility
    this.startButton.on('pointerdown', () => this.startBattle());
    this.startButton.on('click', () => this.startBattle());
    this.input.on('pointerdown', () => this.noteInteraction());
    this.keyboardInteractionHandler = () => this.noteInteraction();
    this.input.keyboard?.on('keydown', this.keyboardInteractionHandler, this);
    this.refreshCards();
    this.startIdleAnimations();
    // PASS 12/13/16: responsive attract mode, motion preference, and input polish.
    this.attractTimer = this.time.addEvent({ delay: 4200, loop: true, callback: () => this.updateAttractMode() });
    this.scale.on('resize', this.handleResize, this);
    this.handlePointerUp = this.onPointerUp.bind(this);
    this.input.on('pointerup', this.handlePointerUp);
    this.handleDomPointerUp = (event) => {
      const rect = this.game.canvas.getBoundingClientRect();
      const scaleX = this.scale.width / rect.width;
      const scaleY = this.scale.height / rect.height;
      this.onPointerUp({
        x: (event.clientX - rect.left) * scaleX,
        y: (event.clientY - rect.top) * scaleY
      });
    };
    this.game.canvas.addEventListener('pointerup', this.handleDomPointerUp);
  }

  createBackdropArt(width, height) {
    const palette = FACTION_PALETTES[this.selectedRaceId] || FACTION_PALETTES.terran;
    this.backdropGlow.clear();
    [
      { radius: Math.max(width, height) * 0.72, alpha: 0.05, color: palette.mid },
      { radius: Math.max(width, height) * 0.48, alpha: 0.08, color: palette.hot },
      { radius: Math.max(width, height) * 0.24, alpha: 0.1, color: palette.hot },
    ].forEach((layer) => this.backdropGlow.fillStyle(layer.color, layer.alpha)
      .fillCircle(width / 2, height * 0.34, layer.radius));

    this.backdropGrid.clear();
    this.backdropGrid.lineStyle(1, palette.hot, 0.35);
    const horizon = height * 0.54;
    for (let i = -12; i <= 12; i += 1) {
      const x = width / 2 + i * Math.max(20, width / 18);
      this.backdropGrid.lineBetween(width / 2 + (x - width / 2) * 0.18, horizon, x, height + 20);
    }
    for (let i = 0; i < 10; i += 1) {
      const y = horizon + (i * i + 1) * height * 0.018;
      this.backdropGrid.lineBetween(0, y, width, y);
    }

    this.backdropVignette.clear();
    this.backdropVignette.fillStyle(0x000000, 0.42);
    this.backdropVignette.fillRect(0, 0, width, 28);
    this.backdropVignette.fillRect(0, height - 42, width, 42);
    this.backdropVignette.fillStyle(0x000000, 0.28);
    this.backdropVignette.fillRect(0, 0, 34, height);
    this.backdropVignette.fillRect(width - 34, 0, 34, height);

    if (this.starfield?.getChildren().length) {
      this.tweens.killTweensOf(this.starfield.getChildren());
    }
    this.starfield.clear(true, true);
    const starCount = Math.min(90, Math.max(36, Math.floor(width * height / 11000)));
    for (let i = 0; i < starCount; i += 1) {
      const star = this.add.circle(Phaser.Math.Between(20, width - 20), Phaser.Math.Between(20, height - 20), Phaser.Math.FloatBetween(0.35, 1.5), palette.light, Phaser.Math.FloatBetween(0.18, 0.65));
      star.setDepth(-7);
      this.starfield.add(star);
      if (!this.reducedMotion) {
        this.tweens.add({ targets: star, alpha: star.alpha * 0.35, duration: Phaser.Math.Between(1100, 2600), yoyo: true, repeat: -1, delay: Phaser.Math.Between(0, 900), ease: 'Sine.easeInOut' });
      }
    }
  }

  createDifficultyTrack() {
    // PASS 8: unified difficulty rail with a sliding selection marker.
    const y = this.layout.difficultyY;
    const width = this.layout.difficultyButtonWidth * 3 + 24;
    this.difficultyTrack = this.add.rectangle(this.scale.width / 2, y, width + 12, this.layout.difficultyButtonHeight + 10, 0x020617, 0.55)
      .setStrokeStyle(1, 0x334155, 0.9);
    this.difficultyMarker = this.add.rectangle(this.layout.difficultyPositions[1].x, y, this.layout.difficultyButtonWidth - 6, this.layout.difficultyButtonHeight - 6, 0x1d4ed8, 0.22)
      .setStrokeStyle(1, 0x60a5fa, 0.65);
    this.difficultyTrack.setDepth(-1);
    this.difficultyMarker.setDepth(-1);
  }

  startIdleAnimations() {
    // PASS 7/10: restrained breathing glow; reduced-motion users get a static UI.
    if (this.reducedMotion) return;
    this.tweens.add({ targets: [this.startAura, this.titleHalo], alpha: 0.18, duration: 1500, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    this.tweens.add({ targets: this.shellGlow, alpha: 0.12, duration: 2200, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
  }

  noteInteraction() {
    this.lastInteractionAt = this.time.now;
    this.attractIndex = -1;
  }

  updateAttractMode() {
    // PASS 11: attract mode previews each faction only after a quiet period.
    if (this.isTransitioning || this.time.now - this.lastInteractionAt < 3600) return;
    this.attractIndex = (this.attractIndex + 1) % RACE_ORDER.length;
    const raceId = RACE_ORDER[this.attractIndex];
    this.selectedRaceId = raceId;
    session.setRace(raceId, getRace(raceId).name);
    this.refreshCards();
  }

  getCardLayout(width, height) {
    const compact = width < 880;
    if (compact) {
      const cardWidth = Math.min(width - CARD_SPACING.compact.widthMinPad, CARD_SPACING.compact.widthMax);
      const cardHeight = Math.min(CARD_SPACING.compact.heightMax, Math.max(CARD_SPACING.compact.heightMin, Math.floor((height - 370) / 3)));
      const gap = CARD_SPACING.compact.gap;
      const titleY = Math.round(height * 0.07);
      const subtitleY = titleY + 36;
      const descriptionY = subtitleY + 27;
      const startCardY = descriptionY + 26 + cardHeight / 2;
      const cardStep = cardHeight + gap;
      return { compact: true, cardWidth, cardHeight, cardGap: gap, cardPositions: [
        { x: width / 2, y: startCardY },
        { x: width / 2, y: startCardY + cardStep },
        { x: width / 2, y: startCardY + cardStep * 2 }
      ]};
    }

    const cardWidth = Math.min(CARD_SPACING.wide.widthMax, Math.max(CARD_SPACING.wide.widthMin, (width - CARD_SPACING.wide.widthPad) / 3));
    const cardGap = Math.min(CARD_SPACING.wide.gapMax, Math.max(CARD_SPACING.wide.gapMin, (width - cardWidth * 3) / 4));
    const totalWidth = cardWidth * 3 + cardGap * 2;
    const startX = (width - totalWidth) / 2 + cardWidth / 2;
    const cardHeight = CARD_SPACING.wide.heightMax;
    const cardY = Math.round(height * 0.42);
    return { compact: false, cardWidth, cardHeight, cardGap, cardPositions: [
      { x: startX, y: cardY },
      { x: startX + cardWidth + cardGap, y: cardY },
      { x: startX + (cardWidth + cardGap) * 2, y: cardY }
    ]};
  }

  getLayout(width, height) {
    const card = this.getCardLayout(width, height);
    const difficultyButtonWidth = Math.min(144, Math.max(88, Math.floor((width - 72) / 3)));
    const difficultyGap = Math.min(14, Math.max(8, Math.floor((width - difficultyButtonWidth * 3) / 4)));
    const difficultyTotalWidth = difficultyButtonWidth * 3 + difficultyGap * 2;
    const difficultyStartX = (width - difficultyTotalWidth) / 2 + difficultyButtonWidth / 2;

    if (card.compact) {
      const titleY = Math.round(height * 0.07);
      const subtitleY = titleY + 36;
      const descriptionY = subtitleY + 27;
      const difficultyY = card.cardPositions[2].y + card.cardHeight / 2 + 48;
      const startY = difficultyY + 86;
      const footerY = Math.min(height - 20, startY + 56);
      return {
        ...card,
        titleY, subtitleY, descriptionY, startY,
        startWidth: Math.min(width - 50, START_BUTTON.widthCompact),
        footerY, difficultyY, difficultyButtonWidth, difficultyButtonHeight: 34,
        difficultyPositions: DIFFICULTY_ORDER.map((id, index) => ({ x: difficultyStartX + (difficultyButtonWidth + difficultyGap) * index, y: difficultyY }))
      };
    }

    const titleY = Math.round(height * 0.125);
    const subtitleY = titleY + 38;
    const descriptionY = subtitleY + 26;
    const difficultyY = Math.round(height * 0.64);
    const startY = Math.round(height * 0.765);
    const footerY = Math.min(height - 20, Math.round(height * 0.94));
    return {
      ...card,
      titleY, subtitleY, descriptionY, startY,
      startWidth: START_BUTTON.widthWide,
      footerY, difficultyY, difficultyButtonWidth, difficultyButtonHeight: 34,
      difficultyPositions: DIFFICULTY_ORDER.map((id, index) => ({ x: difficultyStartX + (difficultyButtonWidth + difficultyGap) * index, y: difficultyY }))
    };
  }

  createRaceCard(race, index) {
    const layout = this.layout;
    const position = layout.cardPositions[index];
    const cardHeight = layout.compact ? layout.cardHeight : CARD_SPACING.wide.heightMax;

    const card = this.add.rectangle(position.x, position.y, layout.cardWidth, cardHeight, 0x0b1220, 1)
      .setStrokeStyle(2, race.accent, 1)
      .setInteractive({ useHandCursor: true });

    const cardInner = this.add.rectangle(position.x, position.y, layout.cardWidth - 8, cardHeight - 8, 0x000000, 0)
      .setStrokeStyle(1, 0x1e293b, 0.8);

    const topLine = this.add.rectangle(position.x, position.y - cardHeight / 2 + 16, layout.cardWidth - 20, 4, race.accent, 1);
    const accentLeft = race.id === 'terran'
      ? this.add.image(position.x - layout.cardWidth / 2 + 24, position.y - cardHeight / 2 + 24, 'terran-scv').setDisplaySize(20, 20)
      : race.id === 'zerg'
        ? this.add.image(position.x - layout.cardWidth / 2 + 24, position.y - cardHeight / 2 + 24, 'zerg-drone').setDisplaySize(20, 20)
        : race.id === 'protoss'
          ? this.add.image(position.x - layout.cardWidth / 2 + 24, position.y - cardHeight / 2 + 24, 'protoss-probe').setDisplaySize(20, 20)
        : null;
    const accentRight = race.id === 'terran'
      ? this.add.image(position.x + layout.cardWidth / 2 - 24, position.y - cardHeight / 2 + 24, 'terran-marine').setDisplaySize(20, 20)
      : race.id === 'zerg'
        ? this.add.image(position.x + layout.cardWidth / 2 - 24, position.y - cardHeight / 2 + 24, 'zerg-zergling').setDisplaySize(20, 20)
        : race.id === 'protoss'
          ? this.add.image(position.x + layout.cardWidth / 2 - 24, position.y - cardHeight / 2 + 24, 'protoss-zealot').setDisplaySize(20, 20)
        : null;
    const presentation = FACTION_PRESENTATION[race.id];
    const title = this.add.text(position.x, position.y - (layout.compact ? 42 : 74), presentation.callsign, {
      ...MENU_TEXT_STYLE,
      fontSize: 'clamp(18px, 4vw, 30px)',
      fontStyle: '800',
      color: '#ffffff',
      align: 'center'
    }).setOrigin(0.5);

    const subtitle = this.add.text(position.x, position.y - (layout.compact ? 18 : 45), presentation.descriptor, {
      ...MENU_TEXT_STYLE,
      fontSize: 'clamp(12px, 2.4vw, 16px)',
      color: '#cbd5e1',
      align: 'center',
      wordWrap: { width: raceCardSubtitleWrapWidth(layout.cardWidth) }
    }).setOrigin(0.5);

    const emblem = this.createFactionEmblem(race, position.x, position.y + (layout.compact ? 2 : 4), layout.compact ? 0.42 : 0.62);
    const facts = this.add.text(position.x, position.y + (layout.compact ? 32 : 48), [
      `${race.workerName.toUpperCase()}  •  ${race.soldierName.toUpperCase()}`,
      `${race.commandCenterName.toUpperCase()}  //  ${race.productionName.toUpperCase()}`
    ], {
      ...MENU_TEXT_STYLE,
      fontSize: 'clamp(11px, 2vw, 14px)',
      color: '#94a3b8',
      align: 'center',
      lineSpacing: 5
    }).setOrigin(0.5);

    const chipY = layout.compact ? position.y + cardHeight / 2 - 20 : position.y + 78;
    const chip = this.add.rectangle(position.x, chipY, 128, 28, race.accent, 0.18);
    const chipIcon = race.id === 'terran'
      ? this.add.image(position.x - 38, chipY, 'terran-marauder').setDisplaySize(20, 20)
      : race.id === 'zerg'
        ? this.add.image(position.x - 38, chipY, 'zerg-hydralisk').setDisplaySize(20, 20)
        : race.id === 'protoss'
          ? this.add.image(position.x - 38, chipY, 'protoss-dragoon').setDisplaySize(20, 20)
        : null;
    const chipLabel = this.add.text(position.x, chipY, 'Tap to select', {
      ...MENU_TEXT_STYLE,
      fontSize: 'clamp(11px, 2.1vw, 13px)',
      color: '#e2e8f0',
      align: 'center'
    }).setOrigin(0.5);

    const select = () => {
      this.noteInteraction();
      this.selectedRaceId = race.id;
      session.setRace(race.id, race.name);
      this.refreshCards();
    };

    card.on('pointerover', () => {
      if (!this.reducedMotion) this.tweens.add({ targets: [card, cardInner], scaleX: 1.025, scaleY: 1.025, duration: 140, ease: 'Quad.easeOut', overwrite: true });
    });
    card.on('pointerout', () => {
      this.tweens.add({ targets: [card, cardInner], scaleX: 1, scaleY: 1, duration: 160, ease: 'Quad.easeOut', overwrite: true });
    });
    card.on('pointerdown', select);

    return { race, card, cardInner, topLine, accentLeft, accentRight, title, subtitle, emblem, facts, chip, chipIcon, chipLabel, cardHeight };
  }

  createFactionEmblem(race, x, y, scale = 1) {
    const p = FACTION_PRESENTATION[race.id];
    const g = this.add.graphics().setPosition(x, y).setDepth(2);
    g.lineStyle(2 * scale, p.tint, 0.72);
    g.strokeCircle(0, 0, 26 * scale);
    g.lineStyle(1 * scale, 0xffffff, 0.18);
    g.strokeCircle(0, 0, 34 * scale);
    g.fillStyle(p.tint, 0.12);
    g.fillCircle(0, 0, 23 * scale);
    const icon = this.add.image(x, y, p.icon).setDisplaySize(40 * scale, 50 * scale).setDepth(3).setTint(p.tint);
    if (!this.reducedMotion) this.tweens.add({ targets: [g, icon], angle: { from: -2, to: 2 }, alpha: { from: 0.82, to: 1 }, duration: 1500, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    return { g, icon };
  }

  refreshCards() {
    const palette = FACTION_PALETTES[this.selectedRaceId] || FACTION_PALETTES.terran;
    this.createBackdropArt(this.scale.width, this.scale.height);
    this.titleHalo?.setColor(`#${palette.hot.toString(16).padStart(6, '0')}`);
    this.titleRule?.clear().lineStyle(1, palette.hot, 0.65).lineBetween(this.scale.width / 2 - 150, this.layout.titleY + 52, this.scale.width / 2 + 150, this.layout.titleY + 52);
    this.cardEntries.forEach((entry) => {
      const selected = entry.race.id === this.selectedRaceId;
      entry.card.setAlpha(selected ? 1 : 0.72);
      entry.card.setStrokeStyle(selected ? 3 : 2, selected ? entry.race.glow : entry.race.accent, 1);
      entry.cardInner?.setStrokeStyle(1, selected ? entry.race.accent : 0x1e293b, selected ? 0.9 : 0.4);
      entry.facts.setColor(selected ? '#dbeafe' : '#94a3b8');
      entry.chip.setFillStyle(entry.race.accent, selected ? 0.35 : 0.18);
      entry.chipLabel.setText(selected ? 'SELECTED // READY' : 'TAP TO SELECT');
      entry.chipIcon?.setAlpha(selected ? 1 : 0.7);
      entry.accentLeft?.setAlpha(selected ? 1 : 0.7);
      entry.accentRight?.setAlpha(selected ? 1 : 0.7);
      if (selected && !this.reducedMotion) {
        this.tweens.add({ targets: entry.cardInner, alpha: 0.45, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut', overwrite: true });
      }
    });

    const activeRace = getRace(this.selectedRaceId);
    this.startButton.setFillStyle(activeRace.accent, 1);
    this.startButton.setStrokeStyle(2, activeRace.glow, 1);
    this.startAura?.setFillStyle(activeRace.accent, 0.12).setStrokeStyle(1, activeRace.glow, 0.4);
    this.startLabel.setText(`Deploy as ${activeRace.name}`);
    this.startSubLabel?.setColor(`#${(FACTION_PALETTES[this.selectedRaceId] || FACTION_PALETTES.terran).light.toString(16).padStart(6, '0')}`);
    this.refreshDifficultyControls();
  }

  createDifficultyControls() {
    this.difficultyLabelText = this.add.text(this.scale.width / 2, this.layout.difficultyY - 24, 'AI difficulty', {
      fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      fontSize: 'clamp(12px, 2.1vw, 15px)',
      fontStyle: '700',
      color: '#cbd5e1',
      align: 'center'
    }).setOrigin(0.5);

    this.difficultyEntries = DIFFICULTY_ORDER.map((difficultyId, index) => {
      const difficulty = getDifficulty(difficultyId);
      const position = this.layout.difficultyPositions[index];
      const button = this.add.rectangle(position.x, position.y, this.layout.difficultyButtonWidth, this.layout.difficultyButtonHeight, 0x0b1220, 1)
        .setStrokeStyle(2, difficulty.id === 'easy' ? 0x22c55e : difficulty.id === 'hard' ? 0xf59e0b : 0x334155, 1)
        .setInteractive({ useHandCursor: true });
      const label = this.add.text(position.x, position.y, difficulty.label, {
        fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        fontSize: 'clamp(11px, 2vw, 13px)',
        fontStyle: '700',
        color: '#e2e8f0',
        align: 'center'
      }).setOrigin(0.5);

      button.on('pointerdown', () => this.selectDifficulty(difficulty.id));
      return { difficulty, button, label };
    });

    // Difficulty description (below difficulty buttons)
    const descY = this.layout.difficultyY + 34;
    const activeDifficulty = getDifficulty(this.selectedDifficultyId);
    this.difficultyDescText = this.add.text(this.scale.width / 2, descY, activeDifficulty.description, {
      fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      fontSize: 'clamp(10px, 1.8vw, 13px)',
      fontStyle: '600',
      color: '#94a3b8',
      align: 'center'
    }).setOrigin(0.5);
  }

  refreshDifficultyControls() {
    const activeDifficulty = getDifficulty(this.selectedDifficultyId);
    this.difficultyLabelText?.setText(`AI difficulty • ${activeDifficulty.label}`);

    // Update description text
    if (this.difficultyDescText) {
      this.difficultyDescText.setText(activeDifficulty.description);
    }

    this.difficultyEntries.forEach((entry) => {
      const selected = entry.difficulty.id === this.selectedDifficultyId;
      const accent = selected ? (entry.difficulty.id === 'easy' ? 0x22c55e : entry.difficulty.id === 'hard' ? 0xfbbf24 : 0x60a5fa) : 0x334155;
      entry.button.setStrokeStyle(selected ? 3 : 2, accent, 1);
      entry.button.setFillStyle(selected ? 0x12213a : 0x0b1220, 1);
      entry.label.setColor(selected ? '#ffffff' : '#cbd5e1');
      entry.label.setAlpha(selected ? 1 : 0.78);
      entry.button.setAlpha(selected ? 1 : 0.84);
      if (selected && this.difficultyMarker) {
        this.tweens.add({ targets: this.difficultyMarker, x: entry.button.x, duration: this.reducedMotion ? 0 : 220, ease: 'Cubic.easeOut', overwrite: true });
        this.difficultyMarker.setStrokeStyle(1, accent, 0.85).setFillStyle(accent, 0.18);
      }
    });
  }

  selectDifficulty(difficultyId) {
    this.selectedDifficultyId = getDifficulty(difficultyId).id;
    session.setDifficulty(this.selectedDifficultyId);
    this.refreshDifficultyControls();
  }

  startBattle() {
    // PASS 15/18: debounce every launch and fade through a tactical lock screen.
    if (this.isStarting || this.isTransitioning) return;
    this.isStarting = true;
    this.isTransitioning = true;
    this.noteInteraction();
    this.startButton.disableInteractive();
    const width = this.scale.width;
    const height = this.scale.height;
    this.transitionOverlay = this.add.rectangle(width / 2, height / 2, width, height, 0x020617, 0)
      .setDepth(100);
    this.transitionLabel = this.add.text(width / 2, height / 2 - 18, 'INITIALIZING DEPLOYMENT', {
      ...MENU_TEXT_STYLE, fontSize: '14px', fontStyle: '800', color: '#dbeafe', letterSpacing: 3,
    }).setOrigin(0.5).setDepth(101).setAlpha(0);
    this.transitionBar = this.add.rectangle(width / 2, height / 2 + 22, 6, 3, 0x60a5fa, 1)
      .setOrigin(0.5).setDepth(101).setAlpha(0);
    try {
      const race = getRace(this.selectedRaceId);
      session.setDifficulty(this.selectedDifficultyId);
      session.setRace(race.id, race.name);
      this.tweens.add({ targets: [this.transitionOverlay, this.transitionLabel, this.transitionBar], alpha: 1, duration: this.reducedMotion ? 0 : 180, ease: 'Sine.easeIn', onComplete: () => {
        this.tweens.add({ targets: this.transitionBar, width: width * 0.34, duration: this.reducedMotion ? 0 : 420, ease: 'Cubic.easeInOut', onComplete: () => this.scene.start('BattleScene') });
      }});
    } catch (err) {
      console.error('[MenuScene] scene.start(BattleScene) failed:', err);
      this.isStarting = false;
      this.isTransitioning = false;
      this.startButton.setInteractive({ useHandCursor: true });
    }
  }

  onPointerUp(pointer) {
    if (!pointer) return;
    if (this.startButton?.getBounds().contains(pointer.x, pointer.y)) {
      this.startBattle();
      return;
    }
    this.cardEntries?.forEach((e) => {
      if (e.card?.getBounds().contains(pointer.x, pointer.y)) {
        this.selectedRaceId = e.race.id;
        session.setRace(e.race.id, e.race.name);
        this.refreshCards();
      }
    });
    this.difficultyEntries?.forEach((e) => {
      if (e.button?.getBounds().contains(pointer.x, pointer.y)) {
        this.selectDifficulty(e.difficulty.id);
      }
    });
  }


  applyLayout(gameSize) {
    const { width, height } = gameSize;
    this.layout = this.getLayout(width, height);

    this.background.setPosition(width / 2, height / 2);
    this.background.setSize(width, height);
    this.createBackdropArt(width, height);

    const shell = getShellSize(width, height, this.layout.compact);
    this.shell.setPosition(shell.x, shell.y);
    this.shell.setSize(shell.width, shell.height);
    this.shellGlow?.setPosition(shell.x, shell.y).setSize(shell.width + 18, shell.height + 18);
    if (this.shellInner) {
      this.shellInner.setPosition(shell.x, shell.y);
      this.shellInner.setSize(shell.width - 12, shell.height - 12);
    }

    this.titleText.setPosition(width / 2, this.layout.titleY);
    this.titleHalo?.setPosition(width / 2, this.layout.titleY + 2);
    this.titleRule?.clear().lineStyle(1, FACTION_PALETTES[this.selectedRaceId]?.hot || 0x60a5fa, 0.65)
      .lineBetween(width / 2 - 150, this.layout.titleY + 52, width / 2 + 150, this.layout.titleY + 52);
    this.versionText.setPosition(width - 16, 16);
    this.subtitleText.setPosition(width / 2, this.layout.subtitleY);
    this.descriptionText.setPosition(width / 2, this.layout.descriptionY);
    this.descriptionText.setWordWrapWidth(descWrapWidth(width));

    this.cardEntries.forEach((entry, index) => {
      const pos = this.layout.cardPositions[index];
      const cardHeight = entry.cardHeight;
      entry.card.setPosition(pos.x, pos.y).setSize(this.layout.cardWidth, cardHeight);
      if (entry.cardInner) {
        entry.cardInner.setPosition(pos.x, pos.y).setSize(this.layout.cardWidth - 8, cardHeight - 8);
      }
      entry.topLine.setPosition(pos.x, pos.y - cardHeight / 2 + 16).setSize(this.layout.cardWidth - 20, 4);
      entry.title.setPosition(pos.x, pos.y - (this.layout.compact ? 42 : 74));
      entry.subtitle.setPosition(pos.x, pos.y - (this.layout.compact ? 18 : 45));
      entry.subtitle.setWordWrapWidth(raceCardSubtitleWrapWidth(this.layout.cardWidth));
      entry.facts.setPosition(pos.x, pos.y + (this.layout.compact ? 32 : 48));
      entry.emblem?.g.setPosition(pos.x, pos.y + (this.layout.compact ? 2 : 4));
      entry.emblem?.icon.setPosition(pos.x, pos.y + (this.layout.compact ? 2 : 4));
      const chipY = this.layout.compact ? pos.y + cardHeight / 2 - 20 : pos.y + 78;
      entry.chip.setPosition(pos.x, chipY).setSize(128, 28);
      entry.chipLabel.setPosition(pos.x, chipY);
      entry.chipIcon?.setPosition(pos.x - 38, chipY);
      entry.accentLeft?.setPosition(pos.x - this.layout.cardWidth / 2 + 24, pos.y - cardHeight / 2 + 24);
      entry.accentRight?.setPosition(pos.x + this.layout.cardWidth / 2 - 24, pos.y - cardHeight / 2 + 24);
    });

    this.difficultyLabelText?.setPosition(width / 2, this.layout.difficultyY - 24);
    this.difficultyTrack?.setPosition(width / 2, this.layout.difficultyY).setSize(this.layout.difficultyButtonWidth * 3 + 36, this.layout.difficultyButtonHeight + 10);
    this.difficultyEntries.forEach((entry, index) => {
      const pos = this.layout.difficultyPositions[index];
      entry.button.setPosition(pos.x, pos.y).setSize(this.layout.difficultyButtonWidth, this.layout.difficultyButtonHeight);
      entry.label.setPosition(pos.x, pos.y);
    });
    if (this.difficultyDescText) {
      this.difficultyDescText.setPosition(width / 2, this.layout.difficultyY + 34);
    }
    this.refreshDifficultyControls();

    this.startButton.setPosition(width / 2, this.layout.startY).setSize(this.layout.startWidth, START_BUTTON.height);
    this.startAura?.setPosition(width / 2, this.layout.startY).setSize(this.layout.startWidth + 22, START_BUTTON.height + 18);
    if (this.startHighlight) {
      this.startHighlight.setPosition(width / 2, this.layout.startY - START_BUTTON.height / 2 + 2).setSize(this.layout.startWidth - 4, 2);
    }
    this.startLabel.setPosition(width / 2, this.layout.startY - 4);
    this.startSubLabel?.setPosition(width / 2, this.layout.startY + 20);
    this.footerText.setPosition(width / 2, this.layout.footerY);
    this.refreshCards();
  }

  handleResize(gameSize) {
    this.applyLayout(gameSize);
  }

  shutdown() {
    if (this.handlePointerUp) {
      this.input?.off('pointerup', this.handlePointerUp);
    }
    if (this.handleDomPointerUp && this.game?.canvas) {
      this.game.canvas.removeEventListener('pointerup', this.handleDomPointerUp);
    }
    this.attractTimer?.remove(false);
    this.particleTween?.remove();
    if (this.keyboardInteractionHandler) {
      this.input?.keyboard?.off('keydown', this.keyboardInteractionHandler, this);
    }
    // Clean up race cards and buttons when scene is destroyed.
    if (this.background) this.background.destroy();
    if (this.backdropGlow) this.backdropGlow.destroy();
    if (this.backdropGrid) this.backdropGrid.destroy();
    if (this.backdropVignette) this.backdropVignette.destroy();
    if (this.starfield) this.starfield.destroy(true);
    if (this.shellGlow) this.shellGlow.destroy();
    if (this.titleHalo) this.titleHalo.destroy();
    if (this.titleRule) this.titleRule.destroy();
    if (this.difficultyTrack) this.difficultyTrack.destroy();
    if (this.difficultyMarker) this.difficultyMarker.destroy();
    if (this.shell) this.shell.destroy();
    if (this.shellInner) this.shellInner.destroy();
    if (this.titleText) this.titleText.destroy();
    if (this.footerText) this.footerText.destroy();
    if (this.difficultyLabelText) this.difficultyLabelText.destroy();
    if (this.startButton) this.startButton.destroy();
    if (this.startAura) this.startAura.destroy();
    if (this.startSubLabel) this.startSubLabel.destroy();
    if (this.transitionOverlay) this.transitionOverlay.destroy();
    if (this.transitionLabel) this.transitionLabel.destroy();
    if (this.transitionBar) this.transitionBar.destroy();
    if (this.startHighlight) this.startHighlight.destroy();
    if (this.difficultyEntries) {
      for (const entry of this.difficultyEntries) {
        if (entry.button) entry.button.destroy();
        if (entry.label) entry.label.destroy();
      }
    }
    if (this.cardEntries) {
      for (const entry of this.cardEntries) {
        if (entry.card) entry.card.destroy();
        if (entry.cardInner) entry.cardInner.destroy();
        if (entry.topLine) entry.topLine.destroy();
        if (entry.accentLeft) entry.accentLeft.destroy();
        if (entry.accentRight) entry.accentRight.destroy();
        if (entry.title) entry.title.destroy();
        if (entry.subtitle) entry.subtitle.destroy();
        if (entry.emblem?.g) entry.emblem.g.destroy();
        if (entry.emblem?.icon) entry.emblem.icon.destroy();
        if (entry.facts) entry.facts.destroy();
        if (entry.chip) entry.chip.destroy();
        if (entry.chipIcon) entry.chipIcon.destroy();
        if (entry.chipLabel) entry.chipLabel.destroy();
      }
    }
  }
}
