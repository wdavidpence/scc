import Phaser from 'phaser';
import { session } from '../game/state/gameSession.js';

export default class HudScene extends Phaser.Scene {
  constructor() {
    super('HudScene');
  }

  init(data) {
    this.battleScene = data.battleScene;
  }

  create() {
    const { width, height } = this.scale;
    this.layout = this.getLayout(width, height);
    this.buttonDefs = [
      { key: 'select', label: 'Select' },
      { key: 'move', label: 'Move' },
      { key: 'attack', label: 'Attack' },
      { key: 'train-worker', label: 'Train Worker' },
      { key: 'train-soldier', label: 'Train Soldier' },
      { key: 'build-production', label: 'Build' },
      { key: 'pause', label: 'Pause' }
    ];

    this.topBar = this.add.rectangle(width / 2, this.layout.topBarY, width, this.layout.topBarHeight, 0x020617, 0.85).setOrigin(0.5);
    this.bottomBar = this.add.rectangle(width / 2, height - this.layout.bottomBarHeight / 2, width, this.layout.bottomBarHeight, 0x020617, 0.9).setOrigin(0.5);

    this.titleText = this.add.text(18, 10, '', {
      fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      fontSize: 'clamp(15px, 2.7vw, 18px)',
      fontStyle: '700',
      color: '#ffffff'
    });

    this.resourceText = this.add.text(18, 34, '', {
      fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      fontSize: 'clamp(12px, 2.3vw, 16px)',
      color: '#cbd5e1'
    });

    this.objectiveText = this.add.text(width - 18, 12, '', {
      fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      fontSize: 'clamp(12px, 2.2vw, 15px)',
      color: '#93c5fd',
      align: 'right',
      wordWrap: { width: Math.min(420, width - 80) }
    }).setOrigin(1, 0);

    this.selectionPanel = this.add.rectangle(18, height - this.layout.bottomBarHeight + 22, Math.min(350, width - 36), this.layout.selectionPanelHeight, 0x0b1220, 0.96)
      .setOrigin(0, 0)
      .setStrokeStyle(1, 0x334155, 1);

    this.selectionTitle = this.add.text(30, height - this.layout.bottomBarHeight + 34, '', {
      fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      fontSize: 'clamp(14px, 2.6vw, 18px)',
      fontStyle: '700',
      color: '#ffffff'
    });

    this.selectionDetails = this.add.text(30, height - this.layout.bottomBarHeight + 60, '', {
      fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      fontSize: 'clamp(11px, 2.1vw, 14px)',
      color: '#cbd5e1',
      wordWrap: { width: Math.min(320, width - 60) },
      lineSpacing: 6
    });

    this.statusText = this.add.text(30, height - this.layout.bottomBarHeight + this.layout.selectionPanelHeight - 30, '', {
      fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      fontSize: 'clamp(11px, 2.1vw, 14px)',
      color: '#93c5fd'
    });

    this.logText = this.add.text(width - 18, height - this.layout.bottomBarHeight + 34, '', {
      fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      fontSize: 'clamp(11px, 2vw, 13px)',
      color: '#94a3b8',
      align: 'right',
      wordWrap: { width: Math.min(360, width - 60) },
      lineSpacing: 4
    }).setOrigin(1, 0);

    this.buttons = [];
    this.createButtons(width, height);

    this.sessionHandler = (snapshot) => this.refresh(snapshot);
    session.events.on('change', this.sessionHandler, this);
    this.refresh(session.snapshot());

    this.scale.on('resize', this.handleResize, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.shutdown, this);
  }

  getLayout(width, height) {
    const compact = width < 760;
    if (compact) {
      return {
        compact: true,
        topBarHeight: 72,
        topBarY: 36,
        bottomBarHeight: 232,
        selectionPanelHeight: 108,
        buttonRows: [4, 3],
        buttonWidth: Math.min(95, Math.floor((width - 46) / 4) - 6),
        buttonHeight: 40,
        buttonGap: 6,
        buttonTopY: height - 84,
        buttonBottomY: height - 36
      };
    }

    return {
      compact: false,
      topBarHeight: 70,
      topBarY: 35,
      bottomBarHeight: 190,
      selectionPanelHeight: 128,
      buttonRows: [7],
      buttonWidth: Math.min(112, Math.max(82, (width - 40) / 7 - 8)),
      buttonHeight: 40,
      buttonGap: Math.max(4, Math.min(10, (width - 40 - Math.min(112, Math.max(82, (width - 40) / 7 - 8)) * 7) / 6)),
      buttonTopY: height - 64,
      buttonBottomY: height - 64
    };
  }

  createButtons(width, height) {
    this.buttons.forEach((button) => {
      button.bg?.destroy();
      button.label?.destroy();
    });
    this.buttons = [];

    if (this.layout.compact) {
      const topRow = [0, 1, 2, 6];
      const bottomRow = [3, 4, 5];
      const rowConfigs = [
        { keys: topRow, y: this.layout.buttonTopY },
        { keys: bottomRow, y: this.layout.buttonBottomY }
      ];

      rowConfigs.forEach((row, rowIndex) => {
        const rowWidth = row.keys.length * this.layout.buttonWidth + (row.keys.length - 1) * this.layout.buttonGap;
        let x = (width - rowWidth) / 2 + this.layout.buttonWidth / 2;
        row.keys.forEach((defIndex) => {
          const def = this.buttonDefs[defIndex];
          const bg = this.add.rectangle(x, row.y, this.layout.buttonWidth, this.layout.buttonHeight, 0x12304a, 1)
            .setStrokeStyle(1, 0x2d4f72, 1)
            .setInteractive({ useHandCursor: true });
          const label = this.add.text(x, row.y, def.label, {
            fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
            fontSize: 'clamp(10px, 2vw, 13px)',
            fontStyle: '700',
            color: '#ffffff',
            align: 'center'
          }).setOrigin(0.5);
          bg.on('pointerdown', () => this.battleScene?.handleHudAction(def.key));
          this.buttons.push({ key: def.key, bg, label, row: rowIndex });
          x += this.layout.buttonWidth + this.layout.buttonGap;
        });
      });
      return;
    }

    const buttonWidth = this.layout.buttonWidth;
    const buttonGap = this.layout.buttonGap;
    const total = buttonWidth * this.buttonDefs.length + buttonGap * (this.buttonDefs.length - 1);
    let x = (width - total) / 2 + buttonWidth / 2;

    this.buttonDefs.forEach((def) => {
      const bg = this.add.rectangle(x, this.layout.buttonTopY, buttonWidth, this.layout.buttonHeight, 0x12304a, 1)
        .setStrokeStyle(1, 0x2d4f72, 1)
        .setInteractive({ useHandCursor: true });
      const label = this.add.text(x, this.layout.buttonTopY, def.label, {
        fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        fontSize: 'clamp(10px, 2vw, 13px)',
        fontStyle: '700',
        color: '#ffffff',
        align: 'center'
      }).setOrigin(0.5);
      bg.on('pointerdown', () => this.battleScene?.handleHudAction(def.key));
      this.buttons.push({ key: def.key, bg, label, row: 0 });
      x += buttonWidth + buttonGap;
    });
  }

  refresh(snapshot) {
    const data = snapshot ?? session.snapshot();
    const { resources, selection, battle, log, raceName, objective, message, screen, outcome } = data;

    this.titleText.setText(`${raceName} • ${screen}${outcome !== 'none' ? ` • ${outcome.toUpperCase()}` : ''}`);
    this.resourceText.setText(`Minerals ${Math.floor(resources.minerals)} | Supply ${resources.supplyUsed}/${resources.supplyCap} | Enemy bank ${Math.floor(resources.enemyMinerals)}`);
    this.objectiveText.setText(`Objective: ${objective}`);
    this.selectionTitle.setText(selection.label || 'None selected');
    this.selectionDetails.setText(selection.details || 'Nothing selected. Tap a unit, structure, or the battlefield.');
    this.statusText.setText(`${message || battle.status || 'Ready.'} • Command: ${battle.commandMode}`);
    this.logText.setText(log.slice(-4).join('\n'));

    const available = new Set(battle.availableCommands || []);
    this.buttons.forEach((button) => {
      const enabled = available.has(button.key);
      button.bg.setFillStyle(enabled ? 0x1d4ed8 : 0x12304a, 1);
      button.bg.setAlpha(enabled ? 1 : 0.55);
      button.label.setAlpha(enabled ? 1 : 0.55);
    });
  }

  handleResize(gameSize) {
    const { width, height } = gameSize;
    this.layout = this.getLayout(width, height);

    this.topBar.setPosition(width / 2, this.layout.topBarY);
    this.topBar.height = this.layout.topBarHeight;
    this.topBar.width = width;

    this.bottomBar.setPosition(width / 2, height - this.layout.bottomBarHeight / 2);
    this.bottomBar.height = this.layout.bottomBarHeight;
    this.bottomBar.width = width;

    this.objectiveText.setPosition(width - 18, 12);
    this.logText.setPosition(width - 18, height - this.layout.bottomBarHeight + 34);
    this.selectionPanel.setPosition(18, height - this.layout.bottomBarHeight + 22);
    this.selectionPanel.setSize(Math.min(350, width - 36), this.layout.selectionPanelHeight);
    this.selectionTitle.setPosition(30, height - this.layout.bottomBarHeight + 34);
    this.selectionDetails.setPosition(30, height - this.layout.bottomBarHeight + 60);
    this.selectionDetails.setWordWrapWidth(Math.min(320, width - 60));
    this.statusText.setPosition(30, height - this.layout.bottomBarHeight + this.layout.selectionPanelHeight - 30);

    this.createButtons(width, height);
    this.refresh(session.snapshot());
  }

  shutdown() {
    session.events.off('change', this.sessionHandler, this);
  }
}
