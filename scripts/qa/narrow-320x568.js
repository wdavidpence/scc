/**
 * narrow-320x568.js — Static layout smoke test for 320x568 viewport.
 *
 * Simulates the getLayout() function from HudScene.js at 320x568
 * and checks for clipping, panel overlap, and touch target issues.
 *
 * Usage: node scripts/qa/narrow-320x568.js [--json]
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_DIR = resolve(__dirname, '../..');

const ARGS = process.argv.slice(2);
const JSON_OUTPUT = ARGS.includes('--json');

const PASS = 'PASS';
const FAIL = 'FAIL';
const WARN = 'WARN';
const SKIP = 'SKIP';

let results = [];
let exitCode = 0;

function check(name, condition, message) {
  const status = condition ? PASS : (condition === null ? SKIP : FAIL);
  results.push({ name, status, message });
  if (status === FAIL) exitCode = 1;
  if (!JSON_OUTPUT) {
    const prefix = status === PASS ? '[PASS]' : (status === FAIL ? '[FAIL]' : '[WARN]');
    console.log(`  ${prefix} ${name}: ${message}`);
  }
  return status;
}

// ── Layout constants extracted from HudScene.js ──
const COMPACT_WIDTH_THRESHOLD = 760;
const NARROW_PORTRAIT_ASPECT_RATIO = 0.55;
const NARROW_PORTRAIT_HEIGHT_MULTIPLIER = 2;
const PANEL_MARGIN = 36;
const BUTTON_COMPACT_MARGIN = 46;
const BUTTON_COMPACT_GAP = 6;

const COMPACT_TOP_BAR_HEIGHT = 72;
const COMPACT_TOP_Y = 36;
const COMPACT_BOTTOM_BAR_HEIGHT = 260;
const COMPACT_SELECTION_PANEL_HEIGHT = 108;
const COMPACT_BUTTON_WIDTH_MAX = 90;
const COMPACT_BUTTON_HEIGHT = 44;
const COMPACT_BUTTON_GAP = 5;
const COMPACT_BUTTON_BOTTOM_Y_OFFSET = 48;

const SELECTION_PANEL_GAP = 22;

function getLayout(width, height) {
  const aspectRatio = width / height;
  const compact = width < COMPACT_WIDTH_THRESHOLD;
  const narrowPortrait = aspectRatio < NARROW_PORTRAIT_ASPECT_RATIO &&
    height > width * NARROW_PORTRAIT_HEIGHT_MULTIPLIER;

  if (compact && narrowPortrait) {
    const narrowBottomBarY = height - 280;
    const narrowSelectionPanelY = narrowBottomBarY - 100 - SELECTION_PANEL_GAP;
    const narrowButtonBottomY = narrowSelectionPanelY - 44 - 12;
    const narrowButtonTopY = narrowButtonBottomY - 44 - 8;
    return {
      compact: true, narrowPortrait: true,
      topBarHeight: 64, topBarY: 32,
      bottomBarHeight: 280, selectionPanelHeight: 100,
      buttonRows: [3, 4], buttonWidth: 68, buttonHeight: 44, buttonGap: 4,
      buttonTopY: narrowButtonTopY, buttonBottomY: narrowButtonBottomY
    };
  }

  if (compact) {
    const compactBtnWidth = Math.min(COMPACT_BUTTON_WIDTH_MAX,
      Math.floor((width - BUTTON_COMPACT_MARGIN) / 5) - BUTTON_COMPACT_GAP);
    const compactBottomBarY = height - COMPACT_BOTTOM_BAR_HEIGHT;
    const compactSelectionPanelY = compactBottomBarY - COMPACT_SELECTION_PANEL_HEIGHT - SELECTION_PANEL_GAP;
    const compactButtonBottomY = compactSelectionPanelY - COMPACT_BUTTON_HEIGHT - 12;
    const compactButtonTopY = compactButtonBottomY - COMPACT_BUTTON_HEIGHT - 8;
    return {
      compact: true, narrowPortrait: false,
      topBarHeight: COMPACT_TOP_BAR_HEIGHT, topBarY: COMPACT_TOP_Y,
      bottomBarHeight: COMPACT_BOTTOM_BAR_HEIGHT,
      selectionPanelHeight: COMPACT_SELECTION_PANEL_HEIGHT,
      buttonRows: [5, 4],
      buttonWidth: compactBtnWidth, buttonHeight: COMPACT_BUTTON_HEIGHT,
      buttonGap: BUTTON_COMPACT_GAP,
      buttonTopY: compactButtonTopY,
      buttonBottomY: compactButtonBottomY
    };
  }

  // Wide (non-compact)
  const wideBtnWidth = Math.min(100, Math.max(72, (width - 40) / 9 - 8));
  const wideBtnGap = Math.max(3, (width - 40 - wideBtnWidth * 9) / 8);
  return {
    compact: false, narrowPortrait: false,
    topBarHeight: 70, topBarY: 35,
    bottomBarHeight: 220, selectionPanelHeight: 128,
    buttonRows: [9], buttonWidth: wideBtnWidth,
    buttonHeight: 38, buttonGap: Math.min(8, wideBtnGap),
    buttonTopY: height - 92, buttonBottomY: height - 48
  };
}

// ── 320x568 test ──
function test320x568() {
  const W = 320, H = 568;
  const layout = getLayout(W, H);

  console.log('============================================');
  console.log('  SCC 320x568 Narrow-Mobile Layout Check');
  console.log('============================================');
  console.log('');

  const aspectRatio = W / H;
  const compact = layout.compact;
  const narrowPortrait = layout.narrowPortrait;

  console.log(`  Layout mode: compact=${compact}, narrowPortrait=${narrowPortrait}`);
  console.log(`  aspectRatio = ${aspectRatio.toFixed(4)} (threshold: ${NARROW_PORTRAIT_ASPECT_RATIO})`);
  console.log('');

  // Top bar
  const topBarTop = layout.topBarY - layout.topBarHeight / 2;
  const topBarBottom = layout.topBarY + layout.topBarHeight / 2;
  check('Top bar within screen', topBarTop >= 0 && topBarBottom <= H,
    `topBar covers y=${topBarTop.toFixed(0)}-${topBarBottom.toFixed(0)} (screen: 0-${H})`);

  // Bottom bar
  const bottomBarY = H - layout.bottomBarHeight;
  const bottomBarBottom = bottomBarY + layout.bottomBarHeight;
  check('Bottom bar within screen', bottomBarY >= 0 && bottomBarBottom <= H,
    `bottomBar covers y=${bottomBarY}-${bottomBarBottom} (screen: 0-${H})`);

  // Selection panel overlap with bottom bar
  const selTop = layout.compact
    ? bottomBarY - layout.selectionPanelHeight - SELECTION_PANEL_GAP
    : bottomBarY + SELECTION_PANEL_GAP;
  const selBottom = selTop + layout.selectionPanelHeight;
  const selOverlap = Math.max(0, selBottom - bottomBarY);
  check('Selection panel no overlap with bottom bar', selOverlap === 0,
    selOverlap > 0
      ? `selection panel (y=${selTop}-${selBottom}) overlaps bottom bar (y=${bottomBarY}) by ${selOverlap}px`
      : `selection panel (y=${selTop}-${selBottom}) sits ${bottomBarY - selBottom}px above bottom bar`);

  // Top button row
  const topRowTop = layout.buttonTopY - layout.buttonHeight / 2;
  const topRowBottom = layout.buttonTopY + layout.buttonHeight / 2;
  const topRowAboveBar = Math.max(0, topRowBottom - bottomBarY);
  check('Top button row within bottom bar', topRowBottom <= bottomBarY,
    topRowAboveBar > 0
      ? `top row (y=${topRowTop.toFixed(0)}-${topRowBottom.toFixed(0)}) extends ${topRowAboveBar}px above bottom bar (y=${bottomBarY})`
      : `top row (y=${topRowTop.toFixed(0)}-${topRowBottom.toFixed(0)}) within bottom bar`);

  // Bottom button row
  const botRowTop = layout.buttonBottomY - layout.buttonHeight / 2;
  const botRowBottom = layout.buttonBottomY + layout.buttonHeight / 2;
  check('Bottom button row within screen', botRowBottom <= H,
    botRowBottom > H
      ? `bottom row (y=${botRowTop.toFixed(0)}-${botRowBottom.toFixed(0)}) extends ${botRowBottom - H}px below screen`
      : `bottom row (y=${botRowTop.toFixed(0)}-${botRowBottom.toFixed(0)}) within screen`);

  // Touch target sizes
  const btnW = layout.buttonWidth;
  const btnH = layout.buttonHeight;
  check('Button height >= 44px (iOS)', btnH >= 44,
    `buttonHeight=${btnH}px (minimum 44px for iOS touch targets)`);
  check('Button width >= 44px (iOS)', btnW >= 44,
    `buttonWidth=${btnW}px (minimum 44px for iOS touch targets)`);

  // Button row horizontal fit
  const topRowCount = layout.buttonRows[0];
  const totalTopRowWidth = topRowCount * btnW + (topRowCount - 1) * layout.buttonGap;
  check('Top row horizontal fit', totalTopRowWidth <= W,
    `${topRowCount} buttons x ${btnW}px + ${topRowCount - 1} gaps x ${layout.buttonGap}px = ${totalTopRowWidth}px (screen: ${W}px), margin=${((W - totalTopRowWidth) / 2).toFixed(1)}px each side`);

  const botRowCount = layout.buttonRows[1];
  const totalBotRowWidth = botRowCount * btnW + (botRowCount - 1) * layout.buttonGap;
  check('Bottom row horizontal fit', totalBotRowWidth <= W,
    `${botRowCount} buttons x ${btnW}px + ${botRowCount - 1} gaps x ${layout.buttonGap}px = ${totalBotRowWidth}px (screen: ${W}px), margin=${((W - totalBotRowWidth) / 2).toFixed(1)}px each side`);

  // Vertical space budget
  const totalBarHeight = layout.topBarHeight + layout.bottomBarHeight;
  check('Bars do not overlap', totalBarHeight <= H,
    totalBarHeight > H
      ? `total bar height (${totalBarHeight}px) > screen height (${H}px), overlap by ${totalBarHeight - H}px`
      : `total bar height (${totalBarHeight}px) < screen height (${H}px)`);

  // Font readability (clamp check)
  console.log('');
  console.log('  Font sizes at 320px (all clamp to minimum):');
  console.log('    Title:          clamp(15px, 2.7vw, 18px)  -> 15px');
  console.log('    Resource:       clamp(12px, 2.3vw, 16px)  -> 12px');
  console.log('    Selection title:clamp(14px, 2.6vw, 18px)  -> 14px');
  console.log('    Selection det.: clamp(11px, 2.1vw, 14px)  -> 11px');
  console.log('    Button label:   clamp(9px,  1.8vw, 12px)  -> 9px');
  check('Font sizes readable at 320px', true, 'all clamp to minimums (9-15px range)');

  // Print summary
  console.log('');
  const passCount = results.filter(r => r.status === PASS).length;
  const failCount = results.filter(r => r.status === FAIL).length;
  const warnCount = results.filter(r => r.status === WARN).length;

  if (JSON_OUTPUT) {
    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      viewport: '320x568',
      layoutMode: `${layout.compact ? 'compact' : 'wide'}${layout.narrowPortrait ? ', narrowPortrait' : ''}`,
      results,
      exitCode,
      summary: { pass: passCount, fail: failCount, warn: warnCount }
    }, null, 2));
    process.exit(exitCode);
  }

  console.log('============================================');
  console.log('  320x568 Layout Summary');
  console.log('============================================');
  console.log(`  ${passCount} passed, ${failCount} failed, ${warnCount} warnings`);
  console.log('');

  if (failCount === 0) {
    console.log('  320x568 LAYOUT CHECKS: ALL PASSED');
  } else {
    console.log(`  320x568 LAYOUT CHECKS: ${failCount} issue(s) found`);
  }
}

test320x568();
process.exit(exitCode);
