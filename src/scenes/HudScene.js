import Phaser from 'phaser';
import { session } from '../game/state/gameSession.js';

// ── HUD style constants (extracted from inline literals) ──────────────
const COLOR_WHITE = '#ffffff';
const COLOR_SLAKE_200 = '#cbd5e1';
const COLOR_BLUE_300 = '#93c5fd';
const COLOR_SLAKE_400 = '#94a3b8';
const COLOR_SLAKE_500 = '#64748b';

const FONT_FAMILY = 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

const BUTTON_LABEL_STYLE = {
  fontFamily: FONT_FAMILY,
  fontSize: 'clamp(9px, 1.8vw, 12px)',
  fontStyle: '700',
  color: COLOR_WHITE,
  align: 'center'
};

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
      { key: 'train-signature', label: 'Train Sig.' },
      { key: 'build-production', label: 'Build' },
      { key: 'build-tech', label: 'Tech Lab' },
      { key: 'pause', label: 'Pause' }
    ];

    // Top bar with subtle gradient effect
    this.topBar = this.add.rectangle(width / 2, this.layout.topBarY, width, this.layout.topBarHeight, 0x020617, 0.85).setOrigin(0.5);
    this.topBarBorder = this.add.rectangle(width / 2, this.layout.topBarY + this.layout.topBarHeight / 2, width, 1, 0x1e3a5f, 0.6).setOrigin(0.5);

    // Bottom bar
    this.bottomBar = this.add.rectangle(width / 2, height - this.layout.bottomBarHeight / 2, width, this.layout.bottomBarHeight, 0x020617, 0.9).setOrigin(0.5);
    this.bottomBarBorder = this.add.rectangle(width / 2, height - this.layout.bottomBarHeight / 2, width, 1, 0x1e3a5f, 0.5).setOrigin(0.5);

    // Race accent accent line on top bar
    const raceColors = { terran: 0x1d4ed8, zerg: 0xf97316, protoss: 0x7c3aed };
    const initialRaceId = this.battleScene?.race?.id ?? session.raceId ?? 'terran';
    this.accentLine = this.add.rectangle(width / 2, this.layout.topBarY - 2, width, 2, raceColors[initialRaceId] ?? 0x1d4ed8, 0.7).setOrigin(0.5);
    this.raceIcon = initialRaceId === 'terran'
      ? this.add.image(148, this.layout.topBarY + 1, 'terran-scv').setDisplaySize(22, 22)
      : initialRaceId === 'zerg'
        ? this.add.image(148, this.layout.topBarY + 1, 'zerg-drone').setDisplaySize(22, 22)
        : initialRaceId === 'protoss'
          ? this.add.image(148, this.layout.topBarY + 1, 'protoss-probe').setDisplaySize(22, 22)
        : null;
    this.raceIconAlt = initialRaceId === 'terran'
      ? this.add.image(174, this.layout.topBarY + 1, 'terran-marine').setDisplaySize(22, 22)
      : initialRaceId === 'zerg'
        ? this.add.image(174, this.layout.topBarY + 1, 'zerg-zergling').setDisplaySize(22, 22)
        : initialRaceId === 'protoss'
          ? this.add.image(174, this.layout.topBarY + 1, 'protoss-zealot').setDisplaySize(22, 22)
        : null;

    // Title text
    this.titleText = this.add.text(18, 10, '', {
      fontFamily: FONT_FAMILY,
      fontSize: 'clamp(15px, 2.7vw, 18px)',
      fontStyle: '700',
      color: COLOR_WHITE
    });

    // Resource text (now includes gas) — with animated counter support
    this.resourceText = this.add.text(18, 34, '', {
      fontFamily: FONT_FAMILY,
      fontSize: 'clamp(12px, 2.3vw, 16px)',
      color: COLOR_SLAKE_200
    });

    // Objective text (top-right)
    this.objectiveText = this.add.text(width - 18, 12, '', {
      fontFamily: FONT_FAMILY,
      fontSize: 'clamp(12px, 2.2vw, 15px)',
      color: COLOR_BLUE_300,
      align: 'right',
      wordWrap: { width: Math.min(420, width - 80) }
    }).setOrigin(1, 0);

    // --- Selection panel ---
    const panelX = 18;
    const panelY = height - this.layout.bottomBarHeight + 22;
    const panelW = Math.min(350, width - 36);
    const panelH = this.layout.selectionPanelHeight;

    this.selectionPanel = this.add.rectangle(panelX, panelY, panelW, panelH, 0x0b1220, 0.96)
      .setOrigin(0, 0)
      .setStrokeStyle(1, 0x334155, 1);

    // HP bar in selection panel (for units/structures)
    this.hpBarBack = this.add.rectangle(panelX + 18, panelY + 52, 120, 5, 0x0f172a, 1).setOrigin(0, 0).setVisible(false);
    this.hpBarFront = this.add.rectangle(panelX + 18, panelY + 52, 0, 5, 0x22c55e, 1).setOrigin(0, 0).setVisible(false);
    this.hpText = this.add.text(panelX + 146, panelY + 48, '', {
      fontFamily: FONT_FAMILY,
      fontSize: 'clamp(10px, 1.8vw, 12px)',
      color: COLOR_SLAKE_400
    }).setVisible(false);

    // Selection title
    this.selectionTitle = this.add.text(30, height - this.layout.bottomBarHeight + 34, '', {
      fontFamily: FONT_FAMILY,
      fontSize: 'clamp(14px, 2.6vw, 18px)',
      fontStyle: '700',
      color: COLOR_WHITE
    });

    // Selection details
    this.selectionDetails = this.add.text(30, height - this.layout.bottomBarHeight + 60, '', {
      fontFamily: FONT_FAMILY,
      fontSize: 'clamp(11px, 2.1vw, 14px)',
      color: COLOR_SLAKE_200,
      wordWrap: { width: Math.min(320, width - 60) },
      lineSpacing: 6
    });

    // Status text
    this.statusText = this.add.text(30, height - this.layout.bottomBarHeight + this.layout.selectionPanelHeight - 30, '', {
      fontFamily: FONT_FAMILY,
      fontSize: 'clamp(11px, 2.1vw, 14px)',
      color: COLOR_BLUE_300
    });

    // Log text (right side of selection panel)
    this.logText = this.add.text(width - 18, height - this.layout.bottomBarHeight + 34, '', {
      fontFamily: FONT_FAMILY,
      fontSize: 'clamp(11px, 2vw, 13px)',
      color: COLOR_SLAKE_400,
      align: 'right',
      wordWrap: { width: Math.min(360, width - 60) },
      lineSpacing: 4
    }).setOrigin(1, 0);

    this.buttons = [];
    this.createButtons(width, height);

    // Command mode indicator (small dot above active button)
    this.commandIndicator = this.add.circle(0, 0, 4, 0x60a5fa, 0.9).setVisible(false);

    // Animated resource counter state
    this._prevMinerals = -1;
    this._prevGas = -1;
    this._resourceTween = null;

    this.sessionHandler = (snapshot) => this.refresh(snapshot);
    session.events.on('change', this.sessionHandler, this);
    this.refresh(session.snapshot());

    this.scale.on('resize', this.handleResize, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.shutdown, this);
  }

  // --- Animated Resource Counters ---
  /**
   * Animate resource text counting from old values to new values.
   * Uses a single Phaser tween that updates the text every frame.
   */
  animateResourceCounters(newMinerals, newGas, supplyUsed, supplyCap, enemyMinerals) {
    // Cancel any in-progress resource animation
    if (this._resourceTween) {
      this._resourceTween.stop();
      this._resourceTween = null;
    }

    const oldMinerals = Math.max(0, this._prevMinerals);
    const oldGas = Math.max(0, this._prevGas);

    // Only animate if values actually changed
    const mineralsChanged = Math.floor(newMinerals) !== oldMinerals;
    const gasChanged = Math.floor(newGas) !== oldGas;

    if (!mineralsChanged && !gasChanged) {
      this._prevMinerals = Math.floor(newMinerals);
      this._prevGas = Math.floor(newGas);
      return;
    }

    let curMinerals = oldMinerals;
    let curGas = oldGas;
    const targetMinerals = Math.floor(newMinerals);
    const targetGas = Math.floor(newGas);
    const supplyUsedVal = supplyUsed;
    const supplyCapVal = supplyCap;
    const enemyMineralsVal = Math.floor(enemyMinerals ?? 0);

    // Duration scales with the magnitude of change (faster for bigger jumps)
    const mineralDiff = Math.abs(targetMinerals - oldMinerals);
    const gasDiff = Math.abs(targetGas - oldGas);
    const maxDiff = Math.max(mineralDiff, gasDiff, 1);
    const duration = Phaser.Math.Between(200, 500) + maxDiff * 15;

    // Build the initial text (with old values)
    const baseText = `Supply ${supplyUsedVal}/${supplyCapVal}  |  Enemy ${enemyMineralsVal}`;
    const mineralsLabel = 'Mines ';
    const gasLabel = '  Gas ';

    this._resourceTween = this.tweens.add({
      targets: {},
      duration: Math.min(duration, 1500), // cap at 1.5s max
      onUpdate: (tween) => {
        const progress = tween.progress;
        // Ease with a slight bounce-out feel using cubic ease
        const eased = progress < 0.5
          ? 4 * progress * progress * progress
          : 1 - Math.pow(-2 * progress + 2, 3) / 2;

        if (mineralsChanged) {
          curMinerals = Math.round(Phaser.Math.Linear(oldMinerals, targetMinerals, eased));
        }
        if (gasChanged) {
          curGas = Math.round(Phaser.Math.Linear(oldGas, targetGas, eased));
        }

        const mineralsStr = mineralsChanged ? `${mineralsLabel}${curMinerals}` : '';
        const gasStr = gasChanged ? `${gasLabel}${curGas}` : '';
        this.resourceText.setText(`${mineralsStr}${gasStr}${baseText}`);

        // Flash the resource text briefly when values change
        if (mineralsChanged || gasChanged) {
          const flashAlpha = 1 - progress * 0.3; // subtle fade from bright
          const flashColor = (mineralsChanged && curMinerals !== targetMinerals) ||
                             (gasChanged && curGas !== targetGas)
            ? '#f1f5f9' // bright white flash during animation
            : '#cbd5e1'; // normal color
          this.resourceText.setColor(flashColor);
        } else {
          this.resourceText.setColor('#cbd5e1');
        }

        // Update the stored previous values when animation completes
        if (progress >= 1) {
          this._prevMinerals = targetMinerals;
          this._prevGas = targetGas;
          this.resourceText.setColor('#cbd5e1');
        }
      },
      ease: 'Cubic.easeInOut'
    });
  }

  /**
   * Flash a resource indicator (mineral or gas) when it changes.
   * Used for rapid, small changes that shouldn't trigger full counter animation.
   */
  flashResourceIndicator(isGas) {
    // Subtle color pulse on the resource text area
    const originalColor = isGas ? '#cbd5e1' : '#cbd5e1';
    const flashColor = isGas ? '#a78bfa' : '#34d399'; // purple for gas, green for minerals

    this.tweens.add({
      targets: this.resourceText,
      color: flashColor,
      duration: 150,
      yoyo: true,
      repeat: 1,
      ease: 'Sine.easeInOut',
      onComplete: () => {
        this.resourceText.setColor(originalColor);
      }
    });
  }

  getLayout(width, height) {
    const aspectRatio = width / height;
    const compact = width < 760;
    const narrowPortrait = aspectRatio < 0.55 && height > width * 2;

    if (compact && narrowPortrait) {
      // Very narrow portrait (e.g. phone held vertically, small screen)
      return {
        compact: true,
        narrowPortrait: true,
        topBarHeight: 64,
        topBarY: 32,
        bottomBarHeight: 280,
        selectionPanelHeight: 100,
        buttonRows: [3, 4],
        buttonWidth: Math.min(68, Math.floor((width - 36) / 3) - 4),
        buttonHeight: 36,
        buttonGap: 4,
        buttonTopY: height - 84,
        buttonBottomY: height - 42
      };
    }

    if (compact) {
      return {
        compact: true,
        narrowPortrait: false,
        topBarHeight: 72,
        topBarY: 36,
        bottomBarHeight: 260,
        selectionPanelHeight: 108,
        buttonRows: [5, 4],
        buttonWidth: Math.min(90, Math.floor((width - 46) / 5) - 6),
        buttonHeight: 38,
        buttonGap: 5,
        buttonTopY: height - 92,
        buttonBottomY: height - 48
      };
    }

    return {
      compact: false,
      narrowPortrait: false,
      topBarHeight: 70,
      topBarY: 35,
      bottomBarHeight: 220,
      selectionPanelHeight: 128,
      buttonRows: [9],
      buttonWidth: Math.min(100, Math.max(72, (width - 40) / 9 - 8)),
      buttonHeight: 38,
      buttonGap: Math.max(3, Math.min(8, (width - 40 - Math.min(100, Math.max(72, (width - 40) / 9 - 8)) * 9) / 8)),
      buttonTopY: height - 64,
      buttonBottomY: height - 64
    };
  }

  createButtons(width, height) {
    this.buttons.forEach((button) => {
      button.bg?.destroy();
      button.label?.destroy();
      button.pulse?.destroy();
    });
    this.buttons = [];

    if (this.layout.compact) {
      // Compact layout: split into 2 rows (5 top, 4 bottom)
      const topRow = [0, 1, 2, 3, 8]; // select, move, attack, train-worker, pause
      const bottomRow = [4, 5, 6, 7]; // train-soldier, train-signature, build-production, build-tech
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

          // Button press animation (scale down)
          bg.on('pointerdown', () => {
            this.tweens.add({
              targets: bg,
              scaleX: 0.92,
              scaleY: 0.92,
              duration: 60,
              yoyo: true,
              ease: 'Sine.easeOut'
            });
          });

          // --- Button hover effects (visual polish) ---
          bg.on('pointerover', () => {
            // Only trigger hover tweens if not currently pressed
            if (bg.scaleX >= 0.95) {
              // Subtle scale up + color brighten on hover
              this.tweens.add({
                targets: bg,
                scaleX: 1.04,
                scaleY: 1.04,
                fill: 0x1a3d5c, // slightly brighter than default
                duration: 120,
                ease: 'Sine.easeOut'
              });
              // Brighten label on hover
              this.tweens.add({
                targets: label,
                alpha: 1,
                duration: 120,
                ease: 'Sine.easeOut'
              });
              // Create a subtle glow rectangle behind the button
              if (!button.hoverGlow) {
                button.hoverGlow = this.add.rectangle(bg.x, bg.y, bg.width + 6, bg.height + 6, 0x3b82f6, 0.08)
                  .setStrokeStyle(0)
                  .setAlpha(0);
                button.hoverGlow.setDepth(-1);
              }
              this.tweens.add({
                targets: button.hoverGlow,
                alpha: 0.4,
                duration: 120,
                ease: 'Sine.easeOut'
              });
            }
          });

          bg.on('pointerout', () => {
            // Restore to normal state (will be corrected by refresh anyway)
            if (bg.scaleX > 0.98) {
              this.tweens.add({
                targets: bg,
                scaleX: 1,
                scaleY: 1,
                fill: 0x12304a, // back to default
                duration: 150,
                ease: 'Sine.easeOut'
              });
            }
            if (button.hoverGlow) {
              this.tweens.add({
                targets: button.hoverGlow,
                alpha: 0,
                duration: 150,
                ease: 'Sine.easeOut',
                onComplete: () => {
                  if (button.hoverGlow && button.hoverGlow.alpha <= 0.01) {
                    button.hoverGlow.destroy();
                    button.hoverGlow = null;
                  }
                }
              });
            }
          });

          const label = this.add.text(x, row.y, def.label, BUTTON_LABEL_STYLE).setOrigin(0.5);

          bg.on('pointerdown', () => this.battleScene?.handleHudAction(def.key));
          this.buttons.push({ key: def.key, bg, label, row: rowIndex, pulse: null, hoverGlow: null });
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

      // Button press animation (scale down)
      bg.on('pointerdown', () => {
        this.tweens.add({
          targets: bg,
          scaleX: 0.92,
          scaleY: 0.92,
          duration: 60,
          yoyo: true,
          ease: 'Sine.easeOut'
        });
      });

      // --- Button hover effects (visual polish) ---
      bg.on('pointerover', () => {
        if (bg.scaleX >= 0.95) {
          this.tweens.add({
            targets: bg,
            scaleX: 1.04,
            scaleY: 1.04,
            fill: 0x1a3d5c,
            duration: 120,
            ease: 'Sine.easeOut'
          });
          this.tweens.add({
            targets: label,
            alpha: 1,
            duration: 120,
            ease: 'Sine.easeOut'
          });
          if (!button.hoverGlow) {
            button.hoverGlow = this.add.rectangle(bg.x, bg.y, bg.width + 6, bg.height + 6, 0x3b82f6, 0.08)
              .setStrokeStyle(0)
              .setAlpha(0);
            button.hoverGlow.setDepth(-1);
          }
          this.tweens.add({
            targets: button.hoverGlow,
            alpha: 0.4,
            duration: 120,
            ease: 'Sine.easeOut'
          });
        }
      });

      bg.on('pointerout', () => {
        if (bg.scaleX > 0.98) {
          this.tweens.add({
            targets: bg,
            scaleX: 1,
            scaleY: 1,
            fill: 0x12304a,
            duration: 150,
            ease: 'Sine.easeOut'
          });
        }
        if (button.hoverGlow) {
          this.tweens.add({
            targets: button.hoverGlow,
            alpha: 0,
            duration: 150,
            ease: 'Sine.easeOut',
            onComplete: () => {
              if (button.hoverGlow && button.hoverGlow.alpha <= 0.01) {
                button.hoverGlow.destroy();
                button.hoverGlow = null;
              }
            }
          });
        }
      });

      const label = this.add.text(x, this.layout.buttonTopY, def.label, BUTTON_LABEL_STYLE).setOrigin(0.5);

      bg.on('pointerdown', () => this.battleScene?.handleHudAction(def.key));
      this.buttons.push({ key: def.key, bg, label, row: 0, pulse: null, hoverGlow: null });
      x += buttonWidth + buttonGap;
    });
  }

  refresh(snapshot) {
    const { width, height } = this.scale;
    const data = snapshot ?? session.snapshot();
    const { resources, selection, battle, log, raceName, objective, message, screen, outcome } = data;

    // Update race accent color on top bar accent line
    const raceColors = { terran: 0x1d4ed8, zerg: 0xf97316, protoss: 0x7c3aed };
    const raceMap = { Terran: 'terran', Zerg: 'zerg', Protoss: 'protoss' };
    const mappedRace = raceMap[raceName] || 'terran';
    const accentColor = raceColors[mappedRace] || 0x1d4ed8;
    this.accentLine.setFillStyle(accentColor, 0.7);

    this.titleText.setText(`${raceName} • ${screen}${outcome !== 'none' ? ` • ${outcome.toUpperCase()}` : ''}`);

    // --- Animated resource text ---
    const newMinerals = resources.minerals;
    const newGas = resources.gas;
    const supplyUsedVal = resources.supplyUsed;
    const supplyCapVal = resources.supplyCap;
    const enemyMineralsVal = Math.floor(resources.enemyMinerals);

    // Trigger animated counter if resources changed
    this.animateResourceCounters(
      newMinerals, newGas,
      supplyUsedVal, supplyCapVal,
      enemyMineralsVal
    );

    // Also update the static parts that don't animate (supply, enemy)
    // The animated counter handles minerals and gas; supply/enemy are static text appended
    // (The animateResourceCounters builds the full string each frame)

    this.objectiveText.setText(`Objective: ${objective}`);
    this.selectionTitle.setText(selection.label || 'None selected');

    // HP bar in selection panel
    if (selection.hp > 0 && selection.maxHp > 0) {
      const hpRatio = Math.max(0, Math.min(1, selection.hp / selection.maxHp));
      const hpBarW = 120 * hpRatio;
      this.hpBarBack.setVisible(true);
      this.hpBarFront.setVisible(true);
      this.hpText.setVisible(true);
      this.hpBarFront.width = hpBarW;
      this.hpBarFront.setFillStyle(
        hpRatio > 0.5 ? 0x22c55e : (hpRatio > 0.25 ? 0xf59e0b : 0xef4444), 1
      );
      this.hpText.setText(`${Math.floor(selection.hp)}/${selection.maxHp} HP`);
    } else {
      this.hpBarBack.setVisible(false);
      this.hpBarFront.setVisible(false);
      this.hpText.setVisible(false);
    }

    // Show additional selection info for units/structures
    let details = selection.details || 'Nothing selected. Tap a unit, structure, or the battlefield.';
    if (selection.kind === 'structure' && selection.owner === 'player') {
      const queueText = battle.buildQueue && battle.buildQueue.length > 0
        ? 'Queue: ' + battle.buildQueue.join('; ')
        : '';
      details = details + (queueText ? `\n${queueText}` : '');
    }
    this.selectionDetails.setText(details);

    const statusMsg = message || battle.status || 'Ready.';
    const commandDisplay = battle.commandMode === 'select' ? 'Ready' : battle.commandMode.toUpperCase();
    this.statusText.setText(`${statusMsg} • Command: ${commandDisplay}`);
    this.logText.setText(log.slice(-4).join('\n'));

    const available = new Set(battle.availableCommands || []);
    const activeCommand = battle.commandMode;

    this.buttons.forEach((button) => {
      const enabled = available.has(button.key);
      const isActive = activeCommand === button.key;

      // Color based on enabled/disabled state
      if (enabled) {
        if (isActive) {
          // Active command mode: bright blue with glow
          button.bg.setFillStyle(0x2563eb, 1);
          button.bg.setStrokeStyle(2, 0x93c5fd, 1);
          button.label.setColor('#ffffff');
          button.bg.setAlpha(1);
          button.label.setAlpha(1);
        } else {
          // Enabled but not active — reset hover state to default
          button.bg.setFillStyle(0x1d4ed8, 1);
          button.bg.setStrokeStyle(1, 0x2d4f72, 1);
          button.label.setColor('#ffffff');
          button.bg.setAlpha(1);
          button.label.setAlpha(1);
        }
      } else {
        // Disabled: dim
        button.bg.setFillStyle(0x12304a, 1);
        button.bg.setStrokeStyle(1, 0x1e3a5f, 1);
        button.label.setColor('#64748b');
        button.bg.setAlpha(0.5);
        button.label.setAlpha(0.5);
      }

      // Reset hover glow for non-hovered buttons during refresh
      if (button.hoverGlow) {
        button.hoverGlow.setAlpha(0);
      }

      // Update pulse animation for active command
      this.updateCommandPulse(button, isActive);
    });

    // Position HP bar
    const panelX = 18;
    const panelY = height - this.layout.bottomBarHeight + 22;
    this.hpBarBack.setPosition(panelX + 18, panelY + 52);
    this.hpBarFront.setPosition(panelX + 18, panelY + 52);
    this.hpText.setPosition(panelX + 146, panelY + 48);
  }

  updateCommandPulse(button, isActive) {
    if (isActive) {
      if (!button.pulse) {
        // Create a subtle glow around the active button
        const bg = button.bg;
        button.pulse = this.add.rectangle(bg.x, bg.y, bg.width + 8, bg.height + 8, 0x3b82f6, 0.15)
          .setStrokeStyle(0)
          .setAlpha(0.5);
        button.pulse.setDepth(-1);
      }
      // Animate the glow
      if (!button.pulseTween) {
        button.pulseTween = this.tweens.add({
          targets: button.pulse,
          alpha: 0.3,
          duration: 800,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.easeInOut'
        });
      }
    } else {
      if (button.pulse) {
        button.pulse.destroy();
        button.pulse = null;
      }
      if (button.pulseTween) {
        button.pulseTween.stop();
        button.pulseTween = null;
      }
    }
  }

  handleResize(gameSize) {
    const { width, height } = gameSize;
    const oldLayout = this.layout;
    this.layout = this.getLayout(width, height);

    // Check if layout mode changed (compact <-> non-compact, or narrow portrait)
    const layoutChanged = (oldLayout.compact !== this.layout.compact) ||
                          (oldLayout.narrowPortrait !== this.layout.narrowPortrait);

    this.topBar.setPosition(width / 2, this.layout.topBarY);
    this.topBar.height = this.layout.topBarHeight;
    this.topBar.width = width;

    this.topBarBorder.setPosition(width / 2, this.layout.topBarY + this.layout.topBarHeight / 2);
    this.topBarBorder.width = width;

    this.accentLine.setPosition(width / 2, this.layout.topBarY - 2);
    this.accentLine.width = width;
    this.raceIcon?.setPosition(148, this.layout.topBarY + 1);
    this.raceIconAlt?.setPosition(174, this.layout.topBarY + 1);

    this.bottomBar.setPosition(width / 2, height - this.layout.bottomBarHeight / 2);
    this.bottomBar.height = this.layout.bottomBarHeight;
    this.bottomBar.width = width;

    this.bottomBarBorder.setPosition(width / 2, height - this.layout.bottomBarHeight / 2);
    this.bottomBarBorder.width = width;

    this.objectiveText.setPosition(width - 18, 12);

    // Update HP bar positions
    const panelY = height - this.layout.bottomBarHeight + 22;
    this.hpBarBack.setPosition(18 + 18, panelY + 52);
    this.hpBarFront.setPosition(18 + 18, panelY + 52);
    this.hpText.setPosition(18 + 146, panelY + 48);

    this.logText.setPosition(width - 18, height - this.layout.bottomBarHeight + 34);
    this.selectionPanel.setPosition(18, height - this.layout.bottomBarHeight + 22);
    this.selectionPanel.setSize(Math.min(350, width - 36), this.layout.selectionPanelHeight);
    this.selectionTitle.setPosition(30, height - this.layout.bottomBarHeight + 34);
    this.selectionDetails.setPosition(30, height - this.layout.bottomBarHeight + 60);
    this.selectionDetails.setWordWrapWidth(Math.min(320, width - 60));
    this.statusText.setPosition(30, height - this.layout.bottomBarHeight + this.layout.selectionPanelHeight - 30);

    // Recreate buttons if layout mode changed
    if (layoutChanged) {
      // Kill any active pulse tweens
      this.buttons.forEach((button) => {
        if (button.pulseTween) {
          button.pulseTween.stop();
        }
      });
      this.createButtons(width, height);
    } else {
      // Just reposition buttons
      this.buttons.forEach((button) => {
        // Repositioning handled by recreateButtons for simplicity
      });
      this.createButtons(width, height);
    }

    this.refresh(session.snapshot());
  }

  shutdown() {
    session.events.off('change', this.sessionHandler, this);
    // Clean up any active tweens
    if (this._resourceTween) {
      this._resourceTween.stop();
      this._resourceTween = null;
    }
    this.tweens.getAll().forEach((tween) => tween.stop());
  }
}
