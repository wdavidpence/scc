import Phaser from 'phaser';
import { GameStates, session } from '../game/state/gameSession.js';
import { RACE_ORDER, getRace } from '../game/data/races.js';

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

    this.cameras.main.setBackgroundColor('#07111c');

    this.background = this.add.rectangle(width / 2, height / 2, width, height, 0x07111c, 1);
    this.shell = this.add.rectangle(width / 2, height / 2 - 30, Math.min(width - 24, 900), Math.min(height - 48, this.layout.compact ? 760 : 530), 0x0a1524, 0.92)
      .setStrokeStyle(2, 0x1f3b61, 1);

    this.titleText = this.add.text(width / 2, this.layout.titleY, 'SCC', {
      fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      fontSize: 'clamp(48px, 12vw, 88px)',
      fontStyle: '800',
      color: '#ffffff',
      align: 'center'
    }).setOrigin(0.5);

    this.subtitleText = this.add.text(width / 2, this.layout.subtitleY, 'StarCraft-inspired mobile RTS skirmish', {
      fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      fontSize: 'clamp(14px, 3vw, 22px)',
      color: '#cbd5e1',
      align: 'center'
    }).setOrigin(0.5);

    this.descriptionText = this.add.text(width / 2, this.layout.descriptionY, 'Choose a race, then build, scout, and push across the battlefield.', {
      fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      fontSize: 'clamp(13px, 2.6vw, 18px)',
      color: '#94a3b8',
      align: 'center',
      wordWrap: { width: Math.min(width - 50, 680) }
    }).setOrigin(0.5);

    this.cardEntries = [];
    RACE_ORDER.forEach((raceId, index) => {
      const race = getRace(raceId);
      this.cardEntries.push(this.createRaceCard(race, index));
    });

    this.startButton = this.add.rectangle(width / 2, this.layout.startY, this.layout.startWidth, 60, 0x2563eb, 1)
      .setStrokeStyle(2, 0x60a5fa, 1)
      .setInteractive({ useHandCursor: true });

    this.startLabel = this.add.text(width / 2, this.layout.startY, 'Deploy into Mission', {
      fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      fontSize: 'clamp(16px, 3vw, 22px)',
      fontStyle: '700',
      color: '#ffffff',
      align: 'center'
    }).setOrigin(0.5);

    this.footerText = this.add.text(width / 2, this.layout.footerY, 'Tip: tap and drag the battlefield to pan once you are in the match.', {
      fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      fontSize: 'clamp(12px, 2.3vw, 15px)',
      color: '#64748b',
      align: 'center'
    }).setOrigin(0.5);

    this.startButton.on('pointerdown', () => this.startBattle());
    this.refreshCards();
    this.scale.on('resize', this.handleResize, this);
  }

  getLayout(width, height) {
    const compact = width < 880;
    if (compact) {
      const cardWidth = Math.min(width - 36, 440);
      const cardHeight = Math.min(144, Math.max(128, (height - 320) / 3));
      const gap = 12;
      return {
        compact: true,
        cardWidth,
        cardHeight,
        cardGap: gap,
        cardPositions: [
          { x: width / 2, y: height / 2 - cardHeight - 74 },
          { x: width / 2, y: height / 2 - cardHeight / 2 + 18 },
          { x: width / 2, y: height / 2 + cardHeight / 2 + 110 }
        ],
        titleY: height * 0.16,
        subtitleY: height * 0.16 + 54,
        descriptionY: height * 0.16 + 94,
        startY: Math.min(height - 106, height / 2 + 320),
        startWidth: Math.min(width - 50, 300),
        footerY: Math.min(height - 28, height / 2 + 388)
      };
    }

    const cardWidth = Math.min(290, Math.max(220, (width - 56) / 3));
    const cardGap = Math.min(20, Math.max(12, (width - cardWidth * 3) / 4));
    const totalWidth = cardWidth * 3 + cardGap * 2;
    const startX = (width - totalWidth) / 2 + cardWidth / 2;
    return {
      compact: false,
      cardWidth,
      cardGap,
      cardPositions: [
        { x: startX, y: height / 2 - 10 },
        { x: startX + cardWidth + cardGap, y: height / 2 - 10 },
        { x: startX + (cardWidth + cardGap) * 2, y: height / 2 - 10 }
      ],
      titleY: height / 2 - 220,
      subtitleY: height / 2 - 160,
      descriptionY: height / 2 - 122,
      startY: height / 2 + 202,
      startWidth: 270,
      footerY: height / 2 + 282
    };
  }

  createRaceCard(race, index) {
    const layout = this.layout;
    const position = layout.cardPositions[index];
    const cardHeight = layout.compact ? layout.cardHeight : 230;

    const card = this.add.rectangle(position.x, position.y, layout.cardWidth, cardHeight, 0x0b1220, 1)
      .setStrokeStyle(2, race.accent, 1)
      .setInteractive({ useHandCursor: true });

    const topLine = this.add.rectangle(position.x, position.y - cardHeight / 2 + 16, layout.cardWidth - 20, 4, race.accent, 1);
    const title = this.add.text(position.x, position.y - (layout.compact ? 48 : 74), race.name, {
      fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      fontSize: 'clamp(18px, 4vw, 30px)',
      fontStyle: '800',
      color: '#ffffff',
      align: 'center'
    }).setOrigin(0.5);

    const subtitle = this.add.text(position.x, position.y - (layout.compact ? 18 : 34), race.subtitle, {
      fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      fontSize: 'clamp(12px, 2.4vw, 16px)',
      color: '#cbd5e1',
      align: 'center',
      wordWrap: { width: layout.cardWidth - 30 }
    }).setOrigin(0.5);

    const facts = this.add.text(position.x, position.y + (layout.compact ? 18 : 18), [
      `Worker: ${race.workerName}`,
      `Troop: ${race.soldierName}`,
      `Base: ${race.commandCenterName}`,
      `Production: ${race.productionName}`
    ], {
      fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      fontSize: 'clamp(11px, 2vw, 14px)',
      color: '#94a3b8',
      align: 'center',
      lineSpacing: 10
    }).setOrigin(0.5);

    const chipY = layout.compact ? position.y + cardHeight / 2 - 28 : position.y + 86;
    const chip = this.add.rectangle(position.x, chipY, 128, 28, race.accent, 0.18);
    const chipLabel = this.add.text(position.x, chipY, 'Tap to select', {
      fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
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

    return { race, card, topLine, title, subtitle, facts, chip, chipLabel, cardHeight };
  }

  refreshCards() {
    this.cardEntries.forEach((entry) => {
      const selected = entry.race.id === this.selectedRaceId;
      entry.card.setAlpha(selected ? 1 : 0.72);
      entry.card.setStrokeStyle(selected ? 3 : 2, selected ? entry.race.glow : entry.race.accent, 1);
      entry.facts.setColor(selected ? '#dbeafe' : '#94a3b8');
      entry.chip.setFillStyle(entry.race.accent, selected ? 0.35 : 0.18);
      entry.chipLabel.setText(selected ? 'Selected' : 'Tap to select');
    });

    const activeRace = getRace(this.selectedRaceId);
    this.startButton.setFillStyle(activeRace.accent, 1);
    this.startButton.setStrokeStyle(2, activeRace.glow, 1);
    this.startLabel.setText(`Deploy as ${activeRace.name}`);
  }

  startBattle() {
    const race = getRace(this.selectedRaceId);
    session.setRace(race.id, race.name);
    this.scene.start('BattleScene');
  }

  applyLayout(gameSize) {
    const { width, height } = gameSize;
    this.layout = this.getLayout(width, height);

    this.background.setPosition(width / 2, height / 2);
    this.background.setSize(width, height);

    this.shell.setPosition(width / 2, height / 2 - 30);
    this.shell.setSize(Math.min(width - 24, 900), Math.min(height - 48, this.layout.compact ? 760 : 530));

    this.titleText.setPosition(width / 2, this.layout.titleY);
    this.subtitleText.setPosition(width / 2, this.layout.subtitleY);
    this.descriptionText.setPosition(width / 2, this.layout.descriptionY);
    this.descriptionText.setWordWrapWidth(Math.min(width - 50, 680));

    this.cardEntries.forEach((entry, index) => {
      const pos = this.layout.cardPositions[index];
      const cardHeight = entry.cardHeight;
      entry.card.setPosition(pos.x, pos.y).setSize(this.layout.cardWidth, cardHeight);
      entry.topLine.setPosition(pos.x, pos.y - cardHeight / 2 + 16).setSize(this.layout.cardWidth - 20, 4);
      entry.title.setPosition(pos.x, pos.y - (this.layout.compact ? 48 : 74));
      entry.subtitle.setPosition(pos.x, pos.y - (this.layout.compact ? 18 : 34));
      entry.subtitle.setWordWrapWidth(this.layout.cardWidth - 30);
      entry.facts.setPosition(pos.x, pos.y + (this.layout.compact ? 18 : 18));
      const chipY = this.layout.compact ? pos.y + cardHeight / 2 - 28 : pos.y + 86;
      entry.chip.setPosition(pos.x, chipY).setSize(128, 28);
      entry.chipLabel.setPosition(pos.x, chipY);
    });

    this.startButton.setPosition(width / 2, this.layout.startY).setSize(this.layout.startWidth, 60);
    this.startLabel.setPosition(width / 2, this.layout.startY);
    this.footerText.setPosition(width / 2, this.layout.footerY);
    this.refreshCards();
  }

  handleResize(gameSize) {
    this.applyLayout(gameSize);
  }
}
