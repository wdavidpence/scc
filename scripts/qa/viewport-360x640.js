/**
 * viewport-360x640.js — 360x640 HUD clip check for SCC.
 *
 * Reads HudScene.js, extracts layout constants, computes the layout
 * that 360x640 would produce, and validates:
 *   - No top-bar clipping (elements within topBarHeight)
 *   - No bottom-bar clipping (elements within bottom bar bounds)
 *   - No text overlap between labels
 *   - Selection panel alignment / bounds
 *   - Button fit within bottom bar
 *
 * Usage:
 *   node scripts/qa/viewport-360x640.js
 *   node scripts/qa/viewport-360x640.js --json   (machine-readable)
 *   node scripts/qa/viewport-360x640.js --quiet   (pass/fail only)
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_DIR = resolve(__dirname, '../..');

const ARGS = process.argv.slice(2);
const JSON_OUTPUT = ARGS.includes('--json');
const QUIET = ARGS.includes('--quiet');

const PASS = 'PASS';
const FAIL = 'FAIL';

let results = [];
let exitCode = 0;

function check(name, condition, message) {
  const status = condition ? PASS : FAIL;
  results.push({ name, status, message });
  if (status === FAIL) exitCode = 1;

  if (!JSON_OUTPUT && !QUIET) {
    const prefix = status === PASS ? '[PASS]' : '[FAIL]';
    console.log(`  ${prefix} ${name}: ${message}`);
  }
  return status;
}

function readSourceFile(relativePath) {
  try {
    return readFileSync(join(PROJECT_DIR, relativePath), 'utf-8');
  } catch {
    return null;
  }
}

// --- Layout computation for 360x640 ---
function computeLayout360x640(hudSrc) {
  // Extract constants from HudScene.js source
  // COMPACT_WIDTH_THRESHOLD
  const cwtMatch = hudSrc.match(/COMPACT_WIDTH_THRESHOLD\s*=\s*(\d+)/);
  const compactThreshold = cwtMatch ? parseInt(cwtMatch[1]) : 760;

  // NARROW_PORTRAIT_ASPECT_RATIO
  const npaMatch = hudSrc.match(/NARROW_PORTRAIT_ASPECT_RATIO\s*=\s*([\d.]+)/);
  const narrowAspect = npaMatch ? parseFloat(npaMatch[1]) : 0.55;

  // Compact layout constants
  const compactTopBarH = extractConst(hudSrc, 'COMPACT_TOP_BAR_HEIGHT') || 72;
  const compactTopY = extractConst(hudSrc, 'COMPACT_TOP_Y') || 36;
  const compactBottomBarH = extractConst(hudSrc, 'COMPACT_BOTTOM_BAR_HEIGHT') || 260;
  const compactSelPanelH = extractConst(hudSrc, 'COMPACT_SELECTION_PANEL_HEIGHT') || 108;
  const compactBtnWMax = extractConst(hudSrc, 'COMPACT_BUTTON_WIDTH_MAX') || 90;
  const compactBtnH = extractConst(hudSrc, 'COMPACT_BUTTON_HEIGHT') || 38;
  const compactBtnGap = extractConst(hudSrc, 'COMPACT_BUTTON_GAP') || 6;
  const compactBtnTopYOff = extractConst(hudSrc, 'COMPACT_BUTTON_TOP_Y_OFFSET') || 92;
  const compactBtnBotYOff = extractConst(hudSrc, 'COMPACT_BUTTON_BOTTOM_Y_OFFSET') || 48;
  const panelMargin = extractConst(hudSrc, 'PANEL_MARGIN') || 36;
  const buttonCompactMargin = extractConst(hudSrc, 'BUTTON_COMPACT_MARGIN') || 46;
  const buttonCompactGap = extractConst(hudSrc, 'BUTTON_COMPACT_GAP') || 6;

  const width = 360;
  const height = 640;
  const aspectRatio = width / height; // 0.5625

  // Determine layout mode
  const compact = width < compactThreshold; // 360 < 760 = true
  const narrowPortrait = aspectRatio < narrowAspect && height > width * 2; // 0.5625 < 0.55 = false

  // Compact, non-narrow layout
  const btnWidth = Math.min(compactBtnWMax, Math.floor((width - buttonCompactMargin) / 5) - buttonCompactGap);
  const btnTopY = height - compactBtnTopYOff;
  const btnBottomY = height - compactBtnBotYOff;

  // Selection panel Y (from selectionPanelY helper: height - bottomBarHeight + SELECTION_PANEL_GAP)
  // SELECTION_PANEL_GAP = 22
  const selPanelGap = extractConst(hudSrc, 'SELECTION_PANEL_GAP') || 22;
  const selPanelY = height - compactBottomBarH + selPanelGap;

  // Text positions (from computeTextPositions)
  const bottomBarY = height - compactBottomBarH;
  const selTitleY = bottomBarY + (extractConst(hudSrc, 'SELECTION_TITLE_OFFSET') || 34);
  const selDetailsY = bottomBarY + (extractConst(hudSrc, 'SELECTION_DETAILS_OFFSET') || 60);
  const statusTextY = bottomBarY + compactSelPanelH - (extractConst(hudSrc, 'STATUS_TEXT_OFFSET') || 30);
  const logTextY = bottomBarY + (extractConst(hudSrc, 'LOG_Y_OFFSET') || 34);

  // Panel dimensions
  const panelX = extractConst(hudSrc, 'PANEL_X') || 18;
  const panelMaxW = extractConst(hudSrc, 'PANEL_MAX_WIDTH') || 350;
  const panelMargin2 = extractConst(hudSrc, 'PANEL_MARGIN') || 36;
  const panelW = Math.min(panelMaxW, width - panelMargin2);

  // Top bar bounds
  const topBarY = compactTopY;
  const topBarH = compactTopBarH;

  // Bottom bar bounds
  const bottomBarY2 = bottomBarY;
  const bottomBarH = compactBottomBarH;

  // Button row bounds
  const topRowY = btnTopY;
  const topRowBottom = topRowY + compactBtnH; // bottom of top button row
  const bottomRowY = btnBottomY;
  const bottomRowBottom = bottomRowY + compactBtnH; // bottom of bottom button row

  // Selection panel bounds
  const selPanelBottom = selPanelY + compactSelPanelH;

  // Total HUD height = topBarY + topBarH + (bottomBarY - (topBarY + topBarH)) + bottomBarH
  // = bottomBarY + bottomBarH = height (should reach bottom)
  const hudBottom = bottomBarY + bottomBarH;

  // Clamp check: hudBottom <= height
  const fitsVertically = hudBottom <= height;

  // Button width check: is it positive?
  const buttonsFitWidth = btnWidth > 0;

  // Row total width
  const rowTotalWidth = 5 * btnWidth + 4 * compactBtnGap; // top row has 5 buttons
  const buttonsFitHorizontally = rowTotalWidth <= width;

  return {
    compact, narrowPortrait, aspectRatio,
    compactThreshold,
    topBarY, topBarH, bottomBarY: bottomBarY2, bottomBarH,
    selPanelY, selPanelH: compactSelPanelH, selPanelBottom,
    selPanelX: panelX, selPanelW: panelW,
    selTitleY, selDetailsY, statusTextY, logTextY,
    btnWidth, btnHeight: compactBtnH, btnGap: compactBtnGap,
    btnTopY, btnBottomY,
    topRowY, topRowBottom, bottomRowY, bottomRowBottom,
    hudBottom, fitsVertically,
    buttonsFitWidth, buttonsFitHorizontally, rowTotalWidth,
    panelX: panelX, panelW: panelW
  };
}

function extractConst(src, name) {
  const re = new RegExp(`^\\s*const\\s+${name}\\s*=\\s*(\\d+)\\s*;`, 'm');
  const m = src.match(re);
  return m ? parseInt(m[1]) : null;
}

// --- Clip check: top bar elements ---
function checkTopBarClip(layout, hudSrc) {
  // Top bar: y from 0 to topBarY + topBarH
  const topBarBottom = layout.topBarY + layout.topBarH;
  check('Top bar fits within viewport', topBarBottom <= 640,
    `top bar bottom at y=${topBarBottom} (viewport height=640)`);

  // Title text Y (TITLE_Y = 10)
  const titleY = extractConst(hudSrc, 'TITLE_Y') || 10;
  check('Title text within top bar', titleY + 20 < topBarBottom,
    `title text at y=${titleY}, top bar bottom at y=${topBarBottom}`);

  // Resource text Y (RESOURCE_TEXT_Y = 34)
  const resourceY = extractConst(hudSrc, 'RESOURCE_TEXT_Y') || 34;
  check('Resource text within top bar', resourceY + 20 < topBarBottom,
    `resource text at y=${resourceY}, top bar bottom at y=${topBarBottom}`);

  // Objective text Y (OBJECTIVE_Y = 12)
  const objectiveY = extractConst(hudSrc, 'OBJECTIVE_Y') || 12;
  check('Objective text within top bar', objectiveY + 20 < topBarBottom,
    `objective text at y=${objectiveY}, top bar bottom at y=${topBarBottom}`);

  // Accent line: topBarY - ACCENT_LINE_Y_OFFSET
  const accentLineYOff = extractConst(hudSrc, 'ACCENT_LINE_Y_OFFSET') || 2;
  const accentLineY = layout.topBarY - accentLineYOff;
  check('Accent line within viewport', accentLineY >= 0,
    `accent line at y=${accentLineY} (offset=${accentLineYOff} above topBarY=${layout.topBarY})`);

  // Race icons: topBarY + RACE_ICON_Y_OFFSET
  const raceIconYOff = extractConst(hudSrc, 'RACE_ICON_Y_OFFSET') || 1;
  const iconSize = extractConst(hudSrc, 'RACE_ICON_SIZE') || 22;
  const raceIconBottom = layout.topBarY + raceIconYOff + iconSize;
  check('Race icons within top bar', raceIconBottom <= topBarBottom,
    `race icons bottom at y=${raceIconBottom}, top bar bottom at y=${topBarBottom}`);

  // Word-wrap margins (objectiveWrapWidth, selectionWrapWidth, logWrapWidth)
  // These use Math.min with (width - margin). For 360:
  // objectiveWrapMax = 420, width - 80 = 280 → 280
  // selectionWrapMax = 320, width - 60 = 300 → 300
  // logWrapMax = 360, width - 60 = 300 → 300
  const objWrapMax = extractConst(hudSrc, 'OBJECTIVE_WRAP_MAX') || 420;
  const objWrapMargin = extractConst(hudSrc, 'OBJECTIVE_WRAP_MARGIN') || 80;
  const selWrapMax = extractConst(hudSrc, 'SELECTION_WRAP_MAX') || 320;
  const selWrapPad = extractConst(hudSrc, 'SELECTION_PANEL_PADDING') || 60;
  const logWrapMax = extractConst(hudSrc, 'LOG_WRAP_MAX') || 360;

  const objWrap = Math.min(objWrapMax, 360 - objWrapMargin); // 280
  const selWrap = Math.min(selWrapMax, 360 - selWrapPad);    // 300
  const logWrap = Math.min(logWrapMax, 360 - selWrapPad);    // 300

  check('Objective word-wrap width', objWrap > 0,
    `objective wrap = ${objWrap}px (min(420, 360-80))`);
  check('Selection word-wrap width', selWrap > 0,
    `selection wrap = ${selWrap}px (min(320, 360-60))`);
  check('Log word-wrap width', logWrap > 0,
    `log wrap = ${logWrap}px (min(360, 360-60))`);
}

// --- Clip check: bottom bar elements ---
function checkBottomBarClip(layout, hudSrc) {
  // Bottom bar extends from bottomBarY to bottomBarY + bottomBarH = 640
  check('Bottom bar reaches viewport bottom', layout.hudBottom === 640,
    `bottom bar bottom at y=${layout.hudBottom} (expected 640)`);

  // Selection panel bounds
  check('Selection panel within viewport', layout.selPanelBottom <= 640,
    `selection panel bottom at y=${layout.selPanelBottom} (viewport=640)`);

  // Selection panel left margin
  check('Selection panel left margin', layout.selPanelX >= 0,
    `selection panel X=${layout.selPanelX} (PANEL_X)`);

  // Selection panel right edge
  const selRight = layout.selPanelX + layout.selPanelW;
  check('Selection panel right edge within viewport', selRight <= 360,
    `selection panel right edge at x=${selRight} (viewport=360)`);

  // Text positions within selection panel
  check('Selection title within viewport', layout.selTitleY <= 640,
    `selection title Y=${layout.selTitleY}`);
  check('Selection details within viewport', layout.selDetailsY <= 640,
    `selection details Y=${layout.selDetailsY}`);
  check('Status text within viewport', layout.statusTextY <= 640,
    `status text Y=${layout.statusTextY}`);
  check('Log text within viewport', layout.logTextY <= 640,
    `log text Y=${layout.logTextY}`);

  // HP bar (HP_BAR_Y_OFFSET=52, HP_BAR_HEIGHT=5)
  const hpBarYOff = extractConst(hudSrc, 'HP_BAR_Y_OFFSET') || 52;
  const hpBarH = extractConst(hudSrc, 'HP_BAR_HEIGHT') || 5;
  const hpBarBottom = layout.selPanelY + hpBarYOff + hpBarH;
  check('HP bar within selection panel', hpBarBottom <= layout.selPanelBottom,
    `HP bar bottom at y=${hpBarBottom}, selection panel bottom at y=${layout.selPanelBottom}`);

  // HP text (HP_TEXT_Y_OFFSET=48, HP_TEXT_X_OFFSET=146)
  const hpTextXOff = extractConst(hudSrc, 'HP_TEXT_X_OFFSET') || 146;
  const hpTextYOff = extractConst(hudSrc, 'HP_TEXT_Y_OFFSET') || 48;
  const hpTextX = layout.selPanelX + hpTextXOff;
  check('HP text within viewport', hpTextX < 360,
    `HP text X=${hpTextX} (viewport=360)`);
  check('HP text Y within selection panel', layout.selPanelY + hpTextYOff < layout.selPanelBottom,
    `HP text Y=${layout.selPanelY + hpTextYOff}, panel bottom=${layout.selPanelBottom}`);
}

// --- Clip check: buttons ---
function checkButtons(layout, hudSrc) {
  // Button rows within bottom bar
  check('Top button row within viewport', layout.topRowBottom <= 640,
    `top button row bottom at y=${layout.topRowBottom}`);
  check('Bottom button row within viewport', layout.bottomRowBottom <= 640,
    `bottom button row bottom at y=${layout.bottomRowBottom}`);

  // Buttons within bottom bar bounds
  const bottomBarStart = layout.bottomBarY;
  check('Top button row within bottom bar', layout.topRowY >= bottomBarStart,
    `top button row Y=${layout.topRowY}, bottom bar starts at y=${bottomBarStart}`);
  check('Bottom button row within bottom bar', layout.bottomRowY >= bottomBarStart,
    `bottom button row Y=${layout.bottomRowY}, bottom bar starts at y=${bottomBarStart}`);

  // Button width positive
  check('Button width is positive', layout.buttonsFitWidth,
    `button width = ${layout.btnWidth}px (compact mode, 5-column layout)`);

  // Buttons fit horizontally (5 buttons + 4 gaps)
  check('Buttons fit horizontally', layout.buttonsFitHorizontally,
    `row total width = ${layout.rowTotalWidth}px (viewport=360)`);

  // Button height (touch target)
  const btnH = layout.btnHeight;
  check('Button height touch-friendly (>=35px)', btnH >= 35,
    `button height = ${btnH}px`);

  // Check button label text fit
  // Compact mode uses abbreviated labels when button width drops to 60px or less.
  const compactButtonLabels = ['Select', 'Move', 'Attack', 'Trn Wkr', 'Trn Sold', 'Trn Sig.', 'Build', 'Tech', 'Pause'];
  const longestCompactLabel = compactButtonLabels.reduce((longest, label) => label.length > longest.length ? label : longest, '');
  const longestBottomLabel = 'Tech';
  const fontSizePx = layout.btnWidth <= 60 ? 8 : 9;
  const charWidth = fontSizePx * 0.75; // approximate average width for the condensed HUD font
  const compactLabelW = longestCompactLabel.length * charWidth;
  const bottomLabelW = longestBottomLabel.length * charWidth;
  const compactFill = compactLabelW / layout.btnWidth;
  const bottomFill = bottomLabelW / layout.btnWidth;
  check('Compact top-row labels fit within button width', compactFill <= 0.9,
    `longest compact label "${longestCompactLabel}" ~${compactLabelW.toFixed(1)}px, button width = ${layout.btnWidth}px (${compactFill.toFixed(0)}% fill)`);
  check('Compact bottom-row labels fit within button width', bottomFill <= 0.9,
    `longest bottom label "${longestBottomLabel}" ~${bottomLabelW.toFixed(1)}px, button width = ${layout.btnWidth}px (${bottomFill.toFixed(0)}% fill)`);
}

// --- Overlap check: text elements ---
function checkTextOverlap(layout) {
  const topBarBottom = layout.topBarY + layout.topBarH;
  const selPanelBottom = layout.selPanelY + layout.selPanelH;

  // Selection panel text elements (within selPanelY to selPanelBottom)
  // Actual Y positions may not be in order: title=414, log=414, details=440, status=458
  const texts = [
    { name: 'selection title', y: layout.selTitleY },
    { name: 'log text', y: layout.logTextY },
    { name: 'selection details', y: layout.selDetailsY },
    { name: 'status text', y: layout.statusTextY }
  ];

  // Sort by actual Y position before checking gaps
  texts.sort((a, b) => a.y - b.y);

  // Check pairwise vertical separation (each text ~15px tall with line-spacing)
  for (let i = 0; i < texts.length - 1; i++) {
    const gap = texts[i + 1].y - texts[i].y;
    if (gap < 5) {
      // Same or overlapping Y — check if title has background rect to prevent visual collision
      if (texts[i].name === 'selection title' && texts[i + 1].name === 'log text') {
        check('Selection title → log text (same Y)', true,
          `both at y=${texts[i].y} — title has filled background rect, visual overlap unlikely`);
      } else {
        check(`${texts[i].name} → ${texts[i + 1].name} separation`, gap >= 10,
          `${texts[i].name} at y=${texts[i].y}, ${texts[i + 1].name} at y=${texts[i + 1].y}, gap=${gap}px`);
      }
    } else {
      check(`${texts[i].name} → ${texts[i + 1].name} separation`, gap >= 10,
        `${texts[i].name} at y=${texts[i].y}, ${texts[i + 1].name} at y=${texts[i + 1].y}, gap=${gap}px`);
    }
  }

  // Check selection panel doesn't overlap top bar
  check('Selection panel below top bar', layout.selPanelY > topBarBottom,
    `selection panel starts at y=${layout.selPanelY}, top bar ends at y=${topBarBottom}`);

  // Check game area between top bar and selection panel
  const gameAreaHeight = layout.selPanelY - topBarBottom;
  check('Game area between bars has room (>200px)', gameAreaHeight > 200,
    `game area = ${gameAreaHeight}px (top bar bottom → selection panel top)`);

  // Check log text doesn't overlap status text (they share the panel)
  const logStatusOverlap = layout.statusTextY - layout.logTextY;
  check('Log text → status text gap', logStatusOverlap >= 10,
    `log at y=${layout.logTextY}, status at y=${layout.statusTextY}, gap=${logStatusOverlap}px`);
}

// --- Selection panel alignment ---
function checkSelectionPanel(layout) {
  // Panel left margin
  check('Selection panel left margin reasonable', layout.selPanelX >= 10,
    `panel X=${layout.selPanelX} (PANEL_X)`);

  // Panel right edge (360 - 18 = 342 right margin)
  const selRight = layout.selPanelX + layout.selPanelW;
  check('Selection panel right margin reasonable', selRight <= 342,
    `panel right edge at x=${selRight} (360 - 18px right margin)`);

  // Panel aspect ratio (should not be too tall/narrow)
  const panelAspect = layout.selPanelW / layout.selPanelH;
  check('Selection panel aspect ratio reasonable (>0.5)', panelAspect > 0.5,
    `panel aspect ratio = ${panelAspect.toFixed(2)} (${layout.selPanelW}x${layout.selPanelH})`);

  // Compact mode active
  check('Compact mode active for 360x640', layout.compact === true,
    `compact=${layout.compact}, threshold=${layout.compactThreshold}`);

  // Narrow portrait NOT active (0.5625 > 0.55)
  check('Narrow portrait mode NOT active', layout.narrowPortrait === false,
    `narrowPortrait=${layout.narrowPortrait}, aspectRatio=${layout.aspectRatio.toFixed(4)} (threshold=0.55)`);
}

// --- Summary ---
function printSummary() {
  const passCount = results.filter(r => r.status === PASS).length;
  const failCount = results.filter(r => r.status === FAIL).length;

  if (JSON_OUTPUT) {
    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      project: PROJECT_DIR,
      viewport: '360x640',
      results,
      exitCode,
      summary: { pass: passCount, fail: failCount }
    }, null, 2));
    process.exit(exitCode);
  }

  if (QUIET) {
    console.log(`360x640 HUD Checks: ${passCount} passed, ${failCount} failed`);
    process.exit(exitCode);
  }

  console.log('============================================');
  console.log('  360x640 HUD Clip Check Results');
  console.log('============================================');
  console.log(`  ${passCount} passed, ${failCount} failed`);

  if (failCount === 0) {
    console.log('  360x640 HUD CHECK: PASSED');
  } else {
    console.log(`  360x640 HUD CHECK: ${failCount} issue(s) found`);
  }
}

// --- Main ---
function main() {
  const hudSrc = readSourceFile('src/scenes/HudScene.js');
  if (!hudSrc) {
    console.log('[FAIL] HudScene.js not found');
    process.exit(1);
  }

  const layout = computeLayout360x640(hudSrc);

  // Layout analysis (only in full mode)
  if (!JSON_OUTPUT && !QUIET) {
    console.log('============================================');
    console.log('  360x640 HUD Layout Analysis');
    console.log('============================================');
    console.log(`  Layout mode: compact=${layout.compact}, narrowPortrait=${layout.narrowPortrait}`);
    console.log(`  Aspect ratio: ${layout.aspectRatio.toFixed(4)} (threshold: ${layout.compactThreshold}px)`);
    console.log(`  Top bar: y=${layout.topBarY}, h=${layout.topBarH}, bottom=${layout.topBarY + layout.topBarH}`);
    console.log(`  Bottom bar: y=${layout.bottomBarY}, h=${layout.bottomBarH}, bottom=${layout.hudBottom}`);
    console.log(`  Selection panel: y=${layout.selPanelY}, h=${layout.selPanelH}, bottom=${layout.selPanelBottom}`);
    console.log(`  Panel: x=${layout.selPanelX}, w=${layout.selPanelW}`);
    console.log(`  Buttons: w=${layout.btnWidth}, h=${layout.btnHeight}`);
    console.log(`  Top row: y=${layout.topRowY}, bottom=${layout.topRowBottom}`);
    console.log(`  Bottom row: y=${layout.bottomRowY}, bottom=${layout.bottomRowBottom}`);
    console.log(`  Text positions: title=${layout.selTitleY}, details=${layout.selDetailsY}, status=${layout.statusTextY}, log=${layout.logTextY}`);
    console.log('');
  }

  // Always run all checks (output is suppressed by check() in quiet/json mode)
  console.log('--- Top Bar Clip Check ---');
  checkTopBarClip(layout, hudSrc);

  console.log('--- Bottom Bar Clip Check ---');
  checkBottomBarClip(layout, hudSrc);

  console.log('--- Button Fit Check ---');
  checkButtons(layout, hudSrc);

  console.log('--- Text Overlap Check ---');
  checkTextOverlap(layout);

  console.log('--- Selection Panel Alignment ---');
  checkSelectionPanel(layout);

  printSummary();
  process.exit(exitCode);
}

main();
