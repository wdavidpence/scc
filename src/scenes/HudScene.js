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
  fontSize: 'clamp(10px, 2vw, 13px)',
  fontStyle: '700',
  color: COLOR_WHITE,
  align: 'center',
  shadowOffsetX: 1,
  shadowOffsetY: 1,
  shadowColor: '#000000',
  shadowBlur: 2,
  shadowFill: true
};

const buttonLabelStyle = (layout) => ({
  ...BUTTON_LABEL_STYLE,
  fontSize: layout.buttonWidth <= 60 ? '10px' : BUTTON_LABEL_STYLE.fontSize
});

const COMPACT_LABEL_ABBREVIATIONS = {
  'Train Worker': 'Trn Wkr',
  'Train Soldier': 'Trn Sold',
  'Train Sig.': 'Trn Sig.',
  'Tech Lab': 'Tech',
  'Supply': 'Sply',
  'Defense': 'Def'
};

const compactLabelText = (label) => COMPACT_LABEL_ABBREVIATIONS[label] ?? label;

const buttonLabelText = (layout, label) => (layout.buttonWidth <= 60 ? compactLabelText(label) : label);

// ── HudScene spacing constants (extracted from inline literals) ─────────
const PANEL_X = 18;                          // left margin for panels
const TITLE_Y = 10;                          // top-bar title text Y
const RESOURCE_TEXT_Y = 34;                  // resource text Y
const OBJECTIVE_X_OFFSET = 18;               // right-margin offset for objective text
const OBJECTIVE_Y = 12;                      // objective text Y
const SELECTION_PANEL_GAP = 22;              // gap between bottomBar and selection panel (used in Y calc)
const SELECTION_TITLE_OFFSET = 34;           // offset from bottomBar for selection title (used in Y calc)
const SELECTION_DETAILS_OFFSET = 60;         // offset from bottomBar for selection details (used in Y calc)
const STATUS_TEXT_OFFSET = 30;               // offset from bottomBar for status text (used in Y calc)
const LOG_Y_OFFSET = 34;                     // offset from bottomBar for log text (used in Y calc)
const LOG_X_OFFSET = 18;                     // right-margin offset for log text
const PANEL_MAX_WIDTH = 350;                 // max selection panel width (used in Math.min)
const OBJECTIVE_WRAP_MAX = 420;              // max objective word-wrap width (used in Math.min)
const SELECTION_WRAP_MAX = 320;              // max selection details word-wrap width (used in Math.min)
const LOG_WRAP_MAX = 360;                    // max log text word-wrap width (used in Math.min)

// ── Word-wrap width helpers (extracted from inline Math.min calculations) ──
const objectiveWrapWidth = (width) => Math.min(OBJECTIVE_WRAP_MAX, width - OBJECTIVE_WRAP_MARGIN);
const selectionWrapWidth = (width) => Math.min(SELECTION_WRAP_MAX, width - SELECTION_PANEL_PADDING);
const logWrapWidth = (width) => Math.min(LOG_WRAP_MAX, width - SELECTION_PANEL_PADDING);
const panelWidth = (width) => Math.min(PANEL_MAX_WIDTH, width - PANEL_MARGIN);
const HP_BAR_WIDTH = 120;                    // max HP bar width (used in Math.min)
const HP_BAR_HEIGHT = 5;                     // HP bar height (used for bg + front)
const HP_BAR_X_OFFSET = 0;                   // X offset of HP bar from panelX (kept at 0 for left alignment)
const HP_BAR_Y_OFFSET = 52;                  // Y offset of HP bar from panelY (used in setPosition)
const HP_TEXT_Y_OFFSET = 48;                 // Y offset of HP text from panelY (used in setPosition)
const HP_TEXT_X_OFFSET = 146;                // X offset of HP text from panelX (used in setPosition)
const RACE_ICON_X = 148;                     // X for primary race icon (terran-scv / zerg-drone / protoss-probe)
const RACE_ICON_ALT_X = 174;                 // X for secondary race icon (terran-marine / zerg-zergling / protoss-zealot)
const RACE_ICON_SIZE = 22;                   // display size for race icons (width + height)
const RACE_ICON_Y_OFFSET = 1;                // Y offset for race icons from topBarY (used in handleResize)
const COMMAND_INDICATOR_RADIUS = 4;          // radius of command mode indicator dot
const COMMAND_INDICATOR_COLOR = 0x60a5fa;    // blue color for command indicator
const LINE_SPACING_DETAILS = 6;              // line spacing for selection details text
const LINE_SPACING_LOG = 4;                  // line spacing for log text
const HOVER_GLOW_INSET = 6;                  // extra inset for hover-glow rectangle (bg.width/height + HOVER_GLOW_INSET)
const HOVER_GLOW_COLOR = 0x3b82f6;           // blue color for hover-glow rectangle
const HOVER_GLOW_ALPHA = 0.08;               // initial alpha for hover-glow rectangle (before active)
const HOVER_GLOW_ACTIVE_ALPHA = 0.4;         // alpha target for active-state hover-glow tween
const ACCENT_LINE_Y_OFFSET = 2;              // offset above topBarY for accent line position
const ACCENT_LINE_HEIGHT = 2;                // thickness of the race accent line
const BORDER_LINE_HEIGHT = 1;                // thickness of top/bottom bar borders
const PULSE_GLOW_INSET = 8;                  // extra inset for command pulse glow (bg.width/height + PULSE_GLOW_INSET)

// ── Inline spacing/offset constants (used in create/handleResize)
const PANEL_MARGIN = 36;                     // horizontal margin from edges (width - 36)
const OBJECTIVE_WRAP_MARGIN = 80;            // horizontal margin for objective wrap (width - 80)
const SELECTION_PANEL_PADDING = 60;          // horizontal padding for selection text (width - 60)
const BUTTON_COMPACT_MARGIN = 46;            // horizontal margin for compact mode button layout (width - 46)
const BUTTON_COMPACT_GAP = 6;                // gap subtracted in compact mode button width calc

// ── Inline spacing/offset constants (used in create/handleResize) ────────────────────────
const COMPACT_WIDTH_THRESHOLD = 760;         // width below which compact mode activates
const NARROW_PORTRAIT_ASPECT_RATIO = 0.55;   // aspect ratio for narrow portrait detection
const NARROW_PORTRAIT_HEIGHT_MULTIPLIER = 2; // height multiplier for narrow portrait

// Compact wide layout
const COMPACT_TOP_BAR_HEIGHT = 72;
const COMPACT_TOP_Y = 36;
const COMPACT_BOTTOM_BAR_HEIGHT = 260;
const COMPACT_SELECTION_PANEL_HEIGHT = 108;
const COMPACT_BUTTON_WIDTH_MAX = 90;
const COMPACT_BUTTON_HEIGHT = 44;
const COMPACT_BUTTON_GAP = 5;
const COMPACT_BUTTON_TOP_Y_OFFSET = 92;      // subtracted from height for buttonTopY
const COMPACT_BUTTON_BOTTOM_Y_OFFSET = 48;    // subtracted from height for buttonBottomY

// Compact narrow portrait layout
const COMPACT_NARROW_TOP_BAR_HEIGHT = 64;
const COMPACT_NARROW_TOP_Y = 32;
const COMPACT_NARROW_BOTTOM_BAR_HEIGHT = 280;
const COMPACT_NARROW_SELECTION_PANEL_HEIGHT = 100;
const COMPACT_NARROW_BUTTON_WIDTH_MAX = 68;
const COMPACT_NARROW_BUTTON_HEIGHT = 44;
const COMPACT_NARROW_BUTTON_GAP = 4;
const COMPACT_NARROW_BUTTON_TOP_Y_OFFSET = 84; // subtracted from height for buttonTopY
const COMPACT_NARROW_BUTTON_BOTTOM_Y_OFFSET = 42; // subtracted from height for buttonBottomY

// Wide (non-compact) layout
const WIDE_TOP_BAR_HEIGHT = 70;
const WIDE_TOP_Y = 35;
const WIDE_BOTTOM_BAR_HEIGHT = 220;
const WIDE_SELECTION_PANEL_HEIGHT = 128;
const WIDE_BUTTON_WIDTH_MIN = 72;
const WIDE_BUTTON_WIDTH_MAX = 100;
const WIDE_BUTTON_HEIGHT = 38;
const WIDE_BUTTON_GAP_MIN = 3;
const WIDE_BUTTON_GAP_MAX = 8;
const WIDE_BUTTON_MARGIN = 40;               // margin used in button width calc

// ── Top-bar border center Y helper (extracted from create/handleResize) ────
const topBarBorderCenterY = (layout) => layout.topBarY + layout.topBarHeight / 2;

// ── Selection panel Y helper (extracted from create/handleResize) ─────────
const selectionPanelY = (width, height) => {
  const layout = getLayout(width, height);
  const bottomBarY = height - layout.bottomBarHeight;
  if (layout.compact) {
    return bottomBarY - layout.selectionPanelHeight - SELECTION_PANEL_GAP;
  }
  return bottomBarY + SELECTION_PANEL_GAP;
};

// ── Bottom-bar center Y helper (extracted from create/handleResize) ────────
const bottomBarCenterYValue = (textPos, bottomBarHeight) => textPos.bottomBarY + bottomBarHeight / 2;

// ── Bottom-bar text baseline helper (extracted from create/handleResize) ──
const computeTextPositions = (width, height) => {
  const layout = getLayout(width, height);
  const bottomBarY = height - layout.bottomBarHeight;
  const panelY = selectionPanelY(width, height);

  if (layout.compact) {
    return {
      bottomBarY,
      selectionTitleY: panelY + 12,
      selectionDetailsY: panelY + 38,
      statusTextY: panelY + layout.selectionPanelHeight - STATUS_TEXT_OFFSET,
      logTextY: panelY + 12
    };
  }

  return {
    bottomBarY,
    selectionTitleY: bottomBarY + SELECTION_TITLE_OFFSET,
    selectionDetailsY: bottomBarY + SELECTION_DETAILS_OFFSET,
    statusTextY: bottomBarY + layout.selectionPanelHeight - STATUS_TEXT_OFFSET,
    logTextY: bottomBarY + LOG_Y_OFFSET
  };
};

// ── Compact-narrow button-row placement helper (extracted from getLayout) ──
const compactNarrowButtonRowPositions = (height) => {
  const narrowBottomBarY = height - COMPACT_NARROW_BOTTOM_BAR_HEIGHT;
  const narrowSelectionPanelY = narrowBottomBarY - COMPACT_NARROW_SELECTION_PANEL_HEIGHT - SELECTION_PANEL_GAP;
  const narrowButtonBottomY = narrowSelectionPanelY - COMPACT_NARROW_BUTTON_HEIGHT - 12;
  return {
    buttonTopY: narrowButtonBottomY - COMPACT_NARROW_BUTTON_HEIGHT - 8,
    buttonBottomY: narrowButtonBottomY
  };
};

// ── Layout computation (extracted from class method for file-scoped helpers) ──
const getLayout = (width, height) => {
  const aspectRatio = width / height;
  const compact = width < COMPACT_WIDTH_THRESHOLD;
  const narrowPortrait = aspectRatio < NARROW_PORTRAIT_ASPECT_RATIO && height > width * NARROW_PORTRAIT_HEIGHT_MULTIPLIER;

  if (compact && narrowPortrait) {
    const compactNarrowBtnWidth = Math.min(COMPACT_NARROW_BUTTON_WIDTH_MAX, Math.floor((width - PANEL_MARGIN) / 3) - COMPACT_NARROW_BUTTON_GAP);
    const { buttonTopY, buttonBottomY } = compactNarrowButtonRowPositions(height);
    return {
      compact: true, narrowPortrait: true,
      topBarHeight: COMPACT_NARROW_TOP_BAR_HEIGHT,
      topBarY: COMPACT_NARROW_TOP_Y,
      bottomBarHeight: COMPACT_NARROW_BOTTOM_BAR_HEIGHT,
      selectionPanelHeight: COMPACT_NARROW_SELECTION_PANEL_HEIGHT,
      buttonRows: [5, 6],
      buttonWidth: compactNarrowBtnWidth,
      buttonHeight: COMPACT_NARROW_BUTTON_HEIGHT,
      buttonGap: COMPACT_NARROW_BUTTON_GAP,
      buttonTopY,
      buttonBottomY
    };
  }

  if (compact) {
    const compactBtnWidth = Math.min(COMPACT_BUTTON_WIDTH_MAX, Math.floor((width - BUTTON_COMPACT_MARGIN) / 5) - BUTTON_COMPACT_GAP);
    const compactBottomBarY = height - COMPACT_BOTTOM_BAR_HEIGHT;
    const compactSelectionPanelY = compactBottomBarY - COMPACT_SELECTION_PANEL_HEIGHT - SELECTION_PANEL_GAP;
    const compactButtonBottomY = compactSelectionPanelY - COMPACT_BUTTON_HEIGHT - 12;
    const compactButtonTopY = compactButtonBottomY - COMPACT_BUTTON_HEIGHT - 8;
    return {
      compact: true, narrowPortrait: false,
      topBarHeight: COMPACT_TOP_BAR_HEIGHT,
      topBarY: COMPACT_TOP_Y,
      bottomBarHeight: COMPACT_BOTTOM_BAR_HEIGHT,
      selectionPanelHeight: COMPACT_SELECTION_PANEL_HEIGHT,
      buttonRows: [5, 6],
      buttonWidth: compactBtnWidth,
      buttonHeight: COMPACT_BUTTON_HEIGHT,
      buttonGap: COMPACT_BUTTON_GAP,
      buttonTopY: compactButtonTopY,
      buttonBottomY: compactButtonBottomY
    };
  }

  const wideBtnWidth = Math.min(WIDE_BUTTON_WIDTH_MAX, Math.max(WIDE_BUTTON_WIDTH_MIN, (width - WIDE_BUTTON_MARGIN) / 11 - WIDE_BUTTON_GAP_MAX));
  const wideBtnGap = Math.max(WIDE_BUTTON_GAP_MIN, (width - WIDE_BUTTON_MARGIN - wideBtnWidth * 11) / 10);
  return {
    compact: false, narrowPortrait: false,
    topBarHeight: WIDE_TOP_BAR_HEIGHT,
    topBarY: WIDE_TOP_Y,
    bottomBarHeight: WIDE_BOTTOM_BAR_HEIGHT,
    selectionPanelHeight: WIDE_SELECTION_PANEL_HEIGHT,
    buttonRows: [11],
    buttonWidth: wideBtnWidth,
    buttonHeight: WIDE_BUTTON_HEIGHT,
    buttonGap: Math.min(WIDE_BUTTON_GAP_MAX, wideBtnGap),
    buttonTopY: height - COMPACT_BUTTON_TOP_Y_OFFSET,
    buttonBottomY: height - COMPACT_BUTTON_BOTTOM_Y_OFFSET
  };
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
    const textPos = computeTextPositions(width, height);
    this.buttonDefs = [
      { key: 'select', label: 'Select' },
      { key: 'move', label: 'Move' },
      { key: 'attack', label: 'Attack' },
      { key: 'train-worker', label: 'Train Worker' },
      { key: 'train-soldier', label: 'Train Soldier' },
      { key: 'train-signature', label: 'Train Sig.' },
      { key: 'build-supply', label: 'Supply' },
      { key: 'build-defense', label: 'Defense' },
      { key: 'build-production', label: 'Build' },
      { key: 'build-tech', label: 'Tech Lab' },
      { key: 'pause', label: 'Pause' }
    ];

    // Top bar with subtle gradient effect
    this.topBar = this.add.rectangle(width / 2, this.layout.topBarY, width, this.layout.topBarHeight, 0x020617, 0.85).setOrigin(0.5);
    this.topBarBorder = this.add.rectangle(width / 2, this.layout.topBarY + this.layout.topBarHeight / 2, width, BORDER_LINE_HEIGHT, 0x1e3a5f, 0.6).setOrigin(0.5);

    // Bottom bar (uses file-scoped computeTextPositions baseline)
    const bottomBarCenterY = bottomBarCenterYValue(textPos, this.layout.bottomBarHeight);
    this.bottomBar = this.add.rectangle(width / 2, bottomBarCenterY, width, this.layout.bottomBarHeight, 0x020617, 0.9).setOrigin(0.5);
    this.bottomBarBorder = this.add.rectangle(width / 2, bottomBarCenterY, width, BORDER_LINE_HEIGHT, 0x1e3a5f, 0.5).setOrigin(0.5);

    // Race accent accent line on top bar
    const raceColors = { terran: 0x1d4ed8, zerg: 0xf97316, protoss: 0x7c3aed };
    const initialRaceId = this.battleScene?.race?.id ?? session.raceId ?? 'terran';
    this.accentLine = this.add.rectangle(width / 2, this.layout.topBarY - ACCENT_LINE_Y_OFFSET, width, ACCENT_LINE_HEIGHT, raceColors[initialRaceId] ?? 0x1d4ed8, 0.7).setOrigin(0.5);
    this.raceIcon = initialRaceId === 'terran'
      ? this.add.image(RACE_ICON_X, this.layout.topBarY + RACE_ICON_Y_OFFSET, 'terran-scv').setDisplaySize(RACE_ICON_SIZE, RACE_ICON_SIZE)
      : initialRaceId === 'zerg'
        ? this.add.image(RACE_ICON_X, this.layout.topBarY + RACE_ICON_Y_OFFSET, 'zerg-drone').setDisplaySize(RACE_ICON_SIZE, RACE_ICON_SIZE)
        : initialRaceId === 'protoss'
          ? this.add.image(RACE_ICON_X, this.layout.topBarY + RACE_ICON_Y_OFFSET, 'protoss-probe').setDisplaySize(RACE_ICON_SIZE, RACE_ICON_SIZE)
        : null;
    this.raceIconAlt = initialRaceId === 'terran'
      ? this.add.image(RACE_ICON_ALT_X, this.layout.topBarY + RACE_ICON_Y_OFFSET, 'terran-marine').setDisplaySize(RACE_ICON_SIZE, RACE_ICON_SIZE)
      : initialRaceId === 'zerg'
        ? this.add.image(RACE_ICON_ALT_X, this.layout.topBarY + RACE_ICON_Y_OFFSET, 'zerg-zergling').setDisplaySize(RACE_ICON_SIZE, RACE_ICON_SIZE)
        : initialRaceId === 'protoss'
          ? this.add.image(RACE_ICON_ALT_X, this.layout.topBarY + RACE_ICON_Y_OFFSET, 'protoss-zealot').setDisplaySize(RACE_ICON_SIZE, RACE_ICON_SIZE)
        : null;

    // Title text
    this.titleText = this.add.text(PANEL_X, TITLE_Y, '', {
      fontFamily: FONT_FAMILY,
      fontSize: 'clamp(15px, 2.7vw, 18px)',
      fontStyle: '700',
      color: COLOR_WHITE
    });

    // Resource text (now includes gas) — with animated counter support
    this.resourceText = this.add.text(PANEL_X, RESOURCE_TEXT_Y, '', {
      fontFamily: FONT_FAMILY,
      fontSize: 'clamp(12px, 2.3vw, 16px)',
      color: COLOR_SLAKE_200
    });

    // Objective text (top-right)
    this.objectiveText = this.add.text(width - OBJECTIVE_X_OFFSET, OBJECTIVE_Y, '', {
      fontFamily: FONT_FAMILY,
      fontSize: 'clamp(12px, 2.2vw, 15px)',
      color: COLOR_BLUE_300,
      align: 'right',
      wordWrap: { width: objectiveWrapWidth(width) }
    }).setOrigin(1, 0);

    // Wave counter (top-right, below objective)
    this.waveCounter = this.add.text(width - OBJECTIVE_X_OFFSET, OBJECTIVE_Y + 20, 'Wave: 0', {
      fontFamily: FONT_FAMILY,
      fontSize: 'clamp(11px, 2vw, 14px)',
      fontStyle: '700',
      color: '#f59e0b'
    }).setOrigin(1, 0);

    // Unit count indicator (top-right, below wave counter)
    this.unitCountText = this.add.text(width - OBJECTIVE_X_OFFSET, OBJECTIVE_Y + 38, '', {
      fontFamily: FONT_FAMILY,
      fontSize: 'clamp(10px, 1.8vw, 12px)',
      fontStyle: '600',
      color: COLOR_SLAKE_400
    }).setOrigin(1, 0);

    // Player base HP bar (top-left area, below resources)
    const hpBarWidth = Math.min(120, width * 0.15);
    this.playerBaseHpBack = this.add.rectangle(PANEL_X, RESOURCE_TEXT_Y + 16, hpBarWidth, 5, 0x0f172a, 0.8)
      .setOrigin(0, 0);
    this.playerBaseHpFront = this.add.rectangle(PANEL_X, RESOURCE_TEXT_Y + 16, hpBarWidth, 5, '#22c55e', 0.9)
      .setOrigin(0, 0);
    this.playerBaseHpLabel = this.add.text(PANEL_X, RESOURCE_TEXT_Y + 12, 'Your Base', {
      fontFamily: FONT_FAMILY,
      fontSize: 'clamp(8px, 1.4vw, 10px)',
      fontStyle: '600',
      color: '#94a3b8'
    }).setOrigin(0, 0);

    // Enemy base HP bar (right below player's)
    this.enemyBaseHpBack = this.add.rectangle(PANEL_X, RESOURCE_TEXT_Y + 30, hpBarWidth, 5, 0x0f172a, 0.8)
      .setOrigin(0, 0);
    this.enemyBaseHpFront = this.add.rectangle(PANEL_X, RESOURCE_TEXT_Y + 30, hpBarWidth, 5, '#fb7185', 0.9)
      .setOrigin(0, 0);
    this.enemyBaseHpLabel = this.add.text(PANEL_X, RESOURCE_TEXT_Y + 26, 'Enemy Base', {
      fontFamily: FONT_FAMILY,
      fontSize: 'clamp(8px, 1.4vw, 10px)',
      fontStyle: '600',
      color: '#94a3b8'
    }).setOrigin(0, 0);

    // Store hpBarWidth for onDataChange updates
    this.hpBarWidth = hpBarWidth;

    // --- Selection panel (reuses textPos from top of create) ---
    const panelX = PANEL_X;
    const panelY = selectionPanelY(width, height);
    const panelW = panelWidth(width);
    const panelH = this.layout.selectionPanelHeight;

    this.selectionPanel = this.add.rectangle(panelX, panelY, panelW, panelH, 0x0b1220, 0.96)
      .setOrigin(0, 0)
      .setStrokeStyle(1, 0x334155, 1);

    // HP bar in selection panel (for units/structures)
    this.hpBarBack = this.add.rectangle(panelX + HP_BAR_X_OFFSET, panelY + HP_BAR_Y_OFFSET, HP_BAR_WIDTH, HP_BAR_HEIGHT, 0x0f172a, 1).setOrigin(0, 0).setVisible(false);
    this.hpBarFront = this.add.rectangle(panelX + HP_BAR_X_OFFSET, panelY + HP_BAR_Y_OFFSET, 0, HP_BAR_HEIGHT, 0x22c55e, 1).setOrigin(0, 0).setVisible(false);
    this.hpText = this.add.text(panelX + HP_TEXT_X_OFFSET, panelY + HP_TEXT_Y_OFFSET, '', {
      fontFamily: FONT_FAMILY,
      fontSize: 'clamp(10px, 1.8vw, 12px)',
      color: COLOR_SLAKE_400
    }).setVisible(false);

    // Selection title
    this.selectionTitle = this.add.text(STATUS_TEXT_OFFSET, textPos.selectionTitleY, '', {
      fontFamily: FONT_FAMILY,
      fontSize: 'clamp(15px, 2.8vw, 19px)',
      fontStyle: '700',
      color: COLOR_WHITE
    });

    // Selection details
    this.selectionDetails = this.add.text(STATUS_TEXT_OFFSET, textPos.selectionDetailsY, '', {
      fontFamily: FONT_FAMILY,
      fontSize: 'clamp(12px, 2.2vw, 15px)',
      color: COLOR_SLAKE_200,
      wordWrap: { width: selectionWrapWidth(width) },
      lineSpacing: LINE_SPACING_DETAILS
    });

    // Status text
    this.statusText = this.add.text(STATUS_TEXT_OFFSET, textPos.statusTextY, '', {
      fontFamily: FONT_FAMILY,
      fontSize: 'clamp(12px, 2.2vw, 15px)',
      color: COLOR_BLUE_300
    });

    // Log text (right side of selection panel)
    this.logText = this.add.text(width - LOG_X_OFFSET, textPos.logTextY, '', {
      fontFamily: FONT_FAMILY,
      fontSize: 'clamp(12px, 2.1vw, 14px)',
      color: COLOR_SLAKE_400,
      align: 'right',
      wordWrap: { width: logWrapWidth(width) },
      lineSpacing: LINE_SPACING_LOG
    }).setOrigin(1, 0);

    this.buttons = [];
    this.createButtons(width, height);

    // Command mode indicator (small dot above active button)
    this.commandIndicator = this.add.circle(0, 0, COMMAND_INDICATOR_RADIUS, COMMAND_INDICATOR_COLOR, 0.9).setVisible(false);

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
    const MAX_TWEEN_DURATION = 1500;

    // Build the initial text (with old values)
    const baseText = `Supply ${supplyUsedVal}/${supplyCapVal}  |  Enemy ${enemyMineralsVal}`;
    const mineralsLabel = 'Minerals ';
    const gasLabel = '  Gas ';

    this._resourceTween = this.tweens.add({
      targets: {},
      duration: Math.min(duration, MAX_TWEEN_DURATION),
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
    return getLayout(width, height);
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
          const button = { key: def.key, bg: null, label: null, row: rowIndex, pulse: null, hoverGlow: null };
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
                button.hoverGlow = this.add.rectangle(bg.x, bg.y, bg.width + HOVER_GLOW_INSET, bg.height + HOVER_GLOW_INSET, HOVER_GLOW_COLOR, HOVER_GLOW_ALPHA)
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

          const label = this.add.text(x, row.y, buttonLabelText(this.layout, def.label), buttonLabelStyle(this.layout)).setOrigin(0.5);

          bg.on('pointerdown', () => this.battleScene?.handleHudAction(def.key));
          button.bg = bg;
          button.label = label;
          this.buttons.push(button);
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
      const button = { key: def.key, bg: null, label: null, row: 0, pulse: null, hoverGlow: null };
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
            button.hoverGlow = this.add.rectangle(bg.x, bg.y, bg.width + HOVER_GLOW_INSET, bg.height + HOVER_GLOW_INSET, HOVER_GLOW_COLOR, HOVER_GLOW_ALPHA)
              .setStrokeStyle(0)
              .setAlpha(0);
            button.hoverGlow.setDepth(-1);
          }
          this.tweens.add({
            targets: button.hoverGlow,
            alpha: HOVER_GLOW_ACTIVE_ALPHA,
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

      const label = this.add.text(x, this.layout.buttonTopY, buttonLabelText(this.layout, def.label), buttonLabelStyle(this.layout)).setOrigin(0.5);

      bg.on('pointerdown', () => this.battleScene?.handleHudAction(def.key));
      button.bg = bg;
      button.label = label;
      this.buttons.push(button);
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

    // Wave counter
    if (this.waveCounter && battle.wave) {
      this.waveCounter.setText(`Wave: ${battle.wave}`);
    }

    // Unit count indicator (player vs enemy)
    if (this.unitCountText && battle.playerUnits !== undefined && battle.enemyUnits !== undefined) {
      this.unitCountText.setText(`${battle.playerUnits} vs ${battle.enemyUnits}`);
    }

    // Player base HP bar
    if (this.playerBaseHpFront && battle.playerBaseHp !== undefined) {
      const maxHp = this.race?.maxBaseHp ?? 1000; // default fallback
      const ratio = Math.max(0, battle.playerBaseHp / maxHp);
      this.playerBaseHpFront.setSize(this.hpBarWidth * ratio, 5);

      // Color changes with health: green > yellow > red
      if (ratio > 0.5) {
        this.playerBaseHpFront.setFillStyle('#22c55e', 0.9);
      } else if (ratio > 0.25) {
        this.playerBaseHpFront.setFillStyle('#fbbf24', 0.9);
      } else {
        this.playerBaseHpFront.setFillStyle('#ef4444', 0.9);
      }
    }

    // Enemy base HP bar
    if (this.enemyBaseHpFront && battle.enemyBaseHp !== undefined) {
      const maxHp = this.race?.maxBaseHp ?? 1000; // default fallback
      const ratio = Math.max(0, battle.enemyBaseHp / maxHp);
      this.enemyBaseHpFront.setSize(this.hpBarWidth * ratio, 5);

      // Color: red when high HP (bad), green when low (good - almost won)
      if (ratio > 0.5) {
        this.enemyBaseHpFront.setFillStyle('#fb7185', 0.9);
      } else if (ratio > 0.25) {
        this.enemyBaseHpFront.setFillStyle('#f97316', 0.9);
      } else {
        this.enemyBaseHpFront.setFillStyle('#22c55e', 0.9);
      }
    }

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
      const hpBarW = HP_BAR_WIDTH * hpRatio;
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

    // Position HP bar (reuse file-scoped selectionPanelY helper)
    const panelX = PANEL_X;
    const panelY = selectionPanelY(width, height);
    this.hpBarBack.setPosition(panelX, panelY + HP_BAR_Y_OFFSET);
    this.hpBarFront.setPosition(panelX, panelY + HP_BAR_Y_OFFSET);
    this.hpText.setPosition(panelX + HP_TEXT_X_OFFSET, panelY + HP_TEXT_Y_OFFSET);
  }

  updateCommandPulse(button, isActive) {
    if (isActive) {
      if (!button.pulse) {
        // Create a subtle glow around the active button
        const bg = button.bg;
        button.pulse = this.add.rectangle(bg.x, bg.y, bg.width + PULSE_GLOW_INSET, bg.height + PULSE_GLOW_INSET, 0x3b82f6, 0.15)
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
    const textPos = computeTextPositions(width, height);

    // Check if layout mode changed (compact <-> non-compact, or narrow portrait)
    const layoutChanged = (oldLayout.compact !== this.layout.compact) ||
                          (oldLayout.narrowPortrait !== this.layout.narrowPortrait);

    this.topBar.setPosition(width / 2, this.layout.topBarY);
    this.topBar.height = this.layout.topBarHeight;
    this.topBar.width = width;

    this.topBarBorder.setPosition(width / 2, this.layout.topBarY + this.layout.topBarHeight / 2);
    this.topBarBorder.width = width;

    this.accentLine.setPosition(width / 2, this.layout.topBarY - ACCENT_LINE_Y_OFFSET);
    this.accentLine.width = width;

    const raceIconY = this.layout.topBarY + RACE_ICON_Y_OFFSET;
    this.raceIcon?.setPosition(RACE_ICON_X, raceIconY);
    this.raceIconAlt?.setPosition(RACE_ICON_ALT_X, raceIconY);

    // Bottom bar (uses file-scoped computeTextPositions baseline)
    const bottomBarCenterY = bottomBarCenterYValue(textPos, this.layout.bottomBarHeight);
    this.bottomBar.setPosition(width / 2, bottomBarCenterY);
    this.bottomBar.height = this.layout.bottomBarHeight;
    this.bottomBar.width = width;

    this.bottomBarBorder.setPosition(width / 2, bottomBarCenterY);
    this.bottomBarBorder.width = width;

    this.objectiveText.setPosition(width - OBJECTIVE_X_OFFSET, OBJECTIVE_Y);

    // Update text positions (reuses textPos from top of handleResize)
    const panelX = PANEL_X;
    const panelY = selectionPanelY(width, height);
    this.hpBarBack.setPosition(panelX, panelY + HP_BAR_Y_OFFSET);
    this.hpBarFront.setPosition(panelX, panelY + HP_BAR_Y_OFFSET);
    this.hpText.setPosition(panelX + HP_TEXT_X_OFFSET, panelY + HP_TEXT_Y_OFFSET);

    this.logText.setPosition(width - LOG_X_OFFSET, textPos.logTextY);
    this.selectionPanel.setPosition(panelX, panelY);
    this.selectionPanel.setSize(panelWidth(width), this.layout.selectionPanelHeight);
    this.selectionTitle.setPosition(STATUS_TEXT_OFFSET, textPos.selectionTitleY);
    this.selectionDetails.setPosition(STATUS_TEXT_OFFSET, textPos.selectionDetailsY);
    this.selectionDetails.setWordWrapWidth(selectionWrapWidth(width));
    this.statusText.setPosition(STATUS_TEXT_OFFSET, textPos.statusTextY);

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
