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
    heightMax: 144,
    heightMin: 128,
    gap: 12,
    yOffset74: 74,
    yOffset18: 18,
    yOffset110: 110,
    yOffset320: 320,
  },
  wide: {
    widthMax: 290,
    widthMin: 220,
    widthPad: 56,
    gapMax: 20,
    gapMin: 12,
  },
};

const START_BUTTON = {
  widthCompact: 300,
  widthWide: 270,
  height: 60,
};

// ── Footer Y-position constants (compact vs wide) ───────────────────────────
const FOOTER_Y = {
  compact: { footerMinPad: 28, footerCenterOffset: 388 },
  wide: { footerCenterOffset: 282 },
};

// ── Shared menu text style (title, subtitle, description, labels, footer) ────
const MENU_TEXT_STYLE = { fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' };

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

    this.cameras.main.setBackgroundColor('#07111c');

    this.background = this.add.rectangle(width / 2, height / 2, width, height, 0x07111c, 1);

    // Subtle floating particles in the background
    const particleGroup = this.add.group();
    for (let i = 0; i < 40; i += 1) {
      const px = Phaser.Math.Between(0, width);
      const py = Phaser.Math.Between(0, height);
      const size = Phaser.Math.FloatBetween(1, 3);
      const alpha = Phaser.Math.FloatBetween(0.1, 0.4);
      const particle = this.add.circle(px, py, size, 0x3b82f6, alpha);
      particleGroup.add(particle);
    }

    // Gently drift particles upward
    this.tweens.addCounter({
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
    this.shell = this.add.rectangle(shell.x, shell.y, shell.width, shell.height, 0x0a1524, 0.92)
      .setStrokeStyle(2, 0x1f3b61, 1);

    this.titleText = this.add.text(width / 2, this.layout.titleY, 'SCC', {
      ...MENU_TEXT_STYLE,
      fontSize: 'clamp(48px, 12vw, 88px)',
      fontStyle: '800',
      color: '#ffffff',
      align: 'center'
    }).setOrigin(0.5);

    // Version number (top-right corner)
    this.versionText = this.add.text(width - 16, 16, 'v1.1.2', {
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

    // Start button - simple rectangle with reliable input
    this.startButton = this.add.rectangle(width / 2, this.layout.startY, this.layout.startWidth, START_BUTTON.height, 0x2563eb, 1)
      .setStrokeStyle(2, 0x60a5fa, 1)
      .setInteractive({ useHandCursor: true });

    this.startLabel = this.add.text(width / 2, this.layout.startY, 'Deploy into Mission', {
      ...MENU_TEXT_STYLE,
      fontSize: 'clamp(16px, 3vw, 22px)',
      fontStyle: '700',
      color: '#ffffff',
      align: 'center'
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
    this.refreshCards();
    this.scale.on('resize', this.handleResize, this);
  }

  getCardLayout(width, height) {
    const compact = width < 880;
    if (compact) {
      const cardWidth = Math.min(width - CARD_SPACING.compact.widthMinPad, CARD_SPACING.compact.widthMax);
      const cardHeight = Math.min(CARD_SPACING.compact.heightMax, Math.max(CARD_SPACING.compact.heightMin, (height - CARD_SPACING.compact.yOffset320) / 3));
      const gap = CARD_SPACING.compact.gap;
      return { compact: true, cardWidth, cardHeight, cardGap: gap, cardPositions: [
        { x: width / 2, y: height / 2 - cardHeight - CARD_SPACING.compact.yOffset74 },
        { x: width / 2, y: height / 2 - cardHeight / 2 + CARD_SPACING.compact.yOffset18 },
        { x: width / 2, y: height / 2 + cardHeight / 2 + CARD_SPACING.compact.yOffset110 }
      ]};
    }

    const cardWidth = Math.min(CARD_SPACING.wide.widthMax, Math.max(CARD_SPACING.wide.widthMin, (width - CARD_SPACING.wide.widthPad) / 3));
    const cardGap = Math.min(CARD_SPACING.wide.gapMax, Math.max(CARD_SPACING.wide.gapMin, (width - cardWidth * 3) / 4));
    const totalWidth = cardWidth * 3 + cardGap * 2;
    const startX = (width - totalWidth) / 2 + cardWidth / 2;
    return { compact: false, cardWidth, cardGap, cardPositions: [
      { x: startX, y: height / 2 - 10 },
      { x: startX + cardWidth + cardGap, y: height / 2 - 10 },
      { x: startX + (cardWidth + cardGap) * 2, y: height / 2 - 10 }
    ]};
  }

  getLayout(width, height) {
    const card = this.getCardLayout(width, height);
    if (card.compact) {
      const startY = Math.min(height - 106, height / 2 + CARD_SPACING.compact.yOffset320);
      const difficultyY = startY - 126;
      const difficultyButtonWidth = Math.min(144, Math.max(88, Math.floor((width - 72) / 3)));
      const difficultyGap = Math.min(14, Math.max(8, Math.floor((width - difficultyButtonWidth * 3) / 4)));
      const difficultyTotalWidth = difficultyButtonWidth * 3 + difficultyGap * 2;
      const difficultyStartX = (width - difficultyTotalWidth) / 2 + difficultyButtonWidth / 2;
      return {
        ...card,
        titleY: height * 0.10,
        subtitleY: height * 0.10 + 80,
        descriptionY: height * 0.10 + 120,
        startY,
        startWidth: Math.min(width - 50, START_BUTTON.widthCompact),
        footerY: Math.min(height - FOOTER_Y.compact.footerMinPad, height / 2 + FOOTER_Y.compact.footerCenterOffset),
        difficultyY,
        difficultyButtonWidth,
        difficultyButtonHeight: 34,
        difficultyPositions: DIFFICULTY_ORDER.map((difficultyId, index) => ({ x: difficultyStartX + (difficultyButtonWidth + difficultyGap) * index, y: difficultyY }))
      };
    }

    const startY = height / 2 + 202;
    const difficultyY = startY - 126;
    const difficultyButtonWidth = Math.min(144, Math.max(88, Math.floor((width - 72) / 3)));
    const difficultyGap = Math.min(14, Math.max(8, Math.floor((width - difficultyButtonWidth * 3) / 4)));
    const difficultyTotalWidth = difficultyButtonWidth * 3 + difficultyGap * 2;
    const difficultyStartX = (width - difficultyTotalWidth) / 2 + difficultyButtonWidth / 2;
    return {
      ...card,
      titleY: height / 2 - 260,
      subtitleY: height / 2 - 180,
      descriptionY: height / 2 - 135,
      startY,
      startWidth: START_BUTTON.widthWide,
      footerY: height / 2 + FOOTER_Y.wide.footerCenterOffset,
      difficultyY,
      difficultyButtonWidth,
      difficultyButtonHeight: 34,
      difficultyPositions: DIFFICULTY_ORDER.map((difficultyId, index) => ({ x: difficultyStartX + (difficultyButtonWidth + difficultyGap) * index, y: difficultyY }))
    };
  }

  createRaceCard(race, index) {
    const layout = this.layout;
    const position = layout.cardPositions[index];
    const cardHeight = layout.compact ? layout.cardHeight : CARD_SPACING.wide.heightMax;

    const card = this.add.rectangle(position.x, position.y, layout.cardWidth, cardHeight, 0x0b1220, 1)
      .setStrokeStyle(2, race.accent, 1)
      .setInteractive({ useHandCursor: true });

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
    const title = this.add.text(position.x, position.y - (layout.compact ? 48 : 74), race.name, {
      ...MENU_TEXT_STYLE,
      fontSize: 'clamp(18px, 4vw, 30px)',
      fontStyle: '800',
      color: '#ffffff',
      align: 'center'
    }).setOrigin(0.5);

    const subtitle = this.add.text(position.x, position.y - (layout.compact ? 18 : 34), race.subtitle, {
      ...MENU_TEXT_STYLE,
      fontSize: 'clamp(12px, 2.4vw, 16px)',
      color: '#cbd5e1',
      align: 'center',
      wordWrap: { width: raceCardSubtitleWrapWidth(layout.cardWidth) }
    }).setOrigin(0.5);

    const facts = this.add.text(position.x, position.y + (layout.compact ? 18 : 18), [
      `Worker: ${race.workerName}`,
      `Troop: ${race.soldierName}`,
      `Base: ${race.commandCenterName}`,
      `Production: ${race.productionName}`
    ], {
      ...MENU_TEXT_STYLE,
      fontSize: 'clamp(11px, 2vw, 14px)',
      color: '#94a3b8',
      align: 'center',
      lineSpacing: 10
    }).setOrigin(0.5);

    const chipY = layout.compact ? position.y + cardHeight / 2 - 28 : position.y + 86;
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
      this.selectedRaceId = race.id;
      session.setRace(race.id, race.name);
      this.refreshCards();
    };

    card.on('pointerdown', select);

    return { race, card, topLine, accentLeft, accentRight, title, subtitle, facts, chip, chipIcon, chipLabel, cardHeight };
  }

  refreshCards() {
    this.cardEntries.forEach((entry) => {
      const selected = entry.race.id === this.selectedRaceId;
      entry.card.setAlpha(selected ? 1 : 0.72);
      entry.card.setStrokeStyle(selected ? 3 : 2, selected ? entry.race.glow : entry.race.accent, 1);
      entry.facts.setColor(selected ? '#dbeafe' : '#94a3b8');
      entry.chip.setFillStyle(entry.race.accent, selected ? 0.35 : 0.18);
      entry.chipLabel.setText(selected ? 'Selected' : 'Tap to select');
      entry.chipIcon?.setAlpha(selected ? 1 : 0.7);
      entry.accentLeft?.setAlpha(selected ? 1 : 0.7);
      entry.accentRight?.setAlpha(selected ? 1 : 0.7);
    });

    const activeRace = getRace(this.selectedRaceId);
    this.startButton.setFillStyle(activeRace.accent, 1);
    this.startButton.setStrokeStyle(2, activeRace.glow, 1);
    this.startLabel.setText(`Deploy as ${activeRace.name}`);
    this.refreshDifficultyControls();
  }

  createDifficultyControls() {
    this.difficultyLabelText = this.add.text(this.scale.width / 2, this.layout.difficultyY - 26, 'AI difficulty', {
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
    const descY = this.layout.difficultyPositions[0].y + this.layout.difficultyButtonHeight + 16;
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
    });
  }

  selectDifficulty(difficultyId) {
    this.selectedDifficultyId = getDifficulty(difficultyId).id;
    session.setDifficulty(this.selectedDifficultyId);
    this.refreshDifficultyControls();
  }

  startBattle() {
    const race = getRace(this.selectedRaceId);
    session.setDifficulty(this.selectedDifficultyId);
    session.setRace(race.id, race.name);
    this.scene.start('BattleScene');
  }


  applyLayout(gameSize) {
    const { width, height } = gameSize;
    this.layout = this.getLayout(width, height);

    this.background.setPosition(width / 2, height / 2);
    this.background.setSize(width, height);

    const shell = getShellSize(width, height, this.layout.compact);
    this.shell.setPosition(shell.x, shell.y);
    this.shell.setSize(shell.width, shell.height);

    this.titleText.setPosition(width / 2, this.layout.titleY);
    this.versionText.setPosition(width - 16, 16);
    this.subtitleText.setPosition(width / 2, this.layout.subtitleY + 10);
    this.descriptionText.setPosition(width / 2, this.layout.descriptionY + 10);
    this.descriptionText.setWordWrapWidth(descWrapWidth(width));

    this.cardEntries.forEach((entry, index) => {
      const pos = this.layout.cardPositions[index];
      const cardHeight = entry.cardHeight;
      entry.card.setPosition(pos.x, pos.y).setSize(this.layout.cardWidth, cardHeight);
      entry.topLine.setPosition(pos.x, pos.y - cardHeight / 2 + 16).setSize(this.layout.cardWidth - 20, 4);
      entry.title.setPosition(pos.x, pos.y - (this.layout.compact ? 48 : 74));
      entry.subtitle.setPosition(pos.x, pos.y - (this.layout.compact ? 18 : 34));
      entry.subtitle.setWordWrapWidth(raceCardSubtitleWrapWidth(this.layout.cardWidth));
      entry.facts.setPosition(pos.x, pos.y + (this.layout.compact ? 18 : 18));
      const chipY = this.layout.compact ? pos.y + cardHeight / 2 - 28 : pos.y + 86;
      entry.chip.setPosition(pos.x, chipY).setSize(128, 28);
      entry.chipLabel.setPosition(pos.x, chipY);
      entry.chipIcon?.setPosition(pos.x - 38, chipY);
      entry.accentLeft?.setPosition(pos.x - this.layout.cardWidth / 2 + 24, pos.y - cardHeight / 2 + 24);
      entry.accentRight?.setPosition(pos.x + this.layout.cardWidth / 2 - 24, pos.y - cardHeight / 2 + 24);
    });

    this.difficultyLabelText?.setPosition(width / 2, this.layout.difficultyY - 26);
    this.difficultyEntries.forEach((entry, index) => {
      const pos = this.layout.difficultyPositions[index];
      entry.button.setPosition(pos.x, pos.y).setSize(this.layout.difficultyButtonWidth, this.layout.difficultyButtonHeight);
      entry.label.setPosition(pos.x, pos.y);
    });
    this.refreshDifficultyControls();

    this.startButton.setPosition(width / 2, this.layout.startY).setSize(this.layout.startWidth, START_BUTTON.height);
    this.startLabel.setPosition(width / 2, this.layout.startY);
    this.footerText.setPosition(width / 2, this.layout.footerY);
    this.refreshCards();
  }

  handleResize(gameSize) {
    this.applyLayout(gameSize);
  }

  shutdown() {
    // Clean up race cards and buttons when scene is destroyed.
    if (this.background) this.background.destroy();
    if (this.shell) this.shell.destroy();
    if (this.titleText) this.titleText.destroy();
    if (this.footerText) this.footerText.destroy();
    if (this.difficultyLabelText) this.difficultyLabelText.destroy();
    if (this.startButton) this.startButton.destroy();
    if (this.difficultyEntries) {
      for (const entry of this.difficultyEntries) {
        if (entry.button) entry.button.destroy();
        if (entry.label) entry.label.destroy();
      }
    }
    if (this.raceCards) {
      for (const card of this.raceCards) {
        if (card.icon) card.icon.destroy();
        if (card.title) card.title.destroy();
        if (card.subtitle) card.subtitle.destroy();
        if (card.facts) card.facts.destroy();
        if (card.chip) card.chip.destroy();
        if (card.accentLeft) card.accentLeft.destroy();
        if (card.accentRight) card.accentRight.destroy();
      }
    }
  }
}
