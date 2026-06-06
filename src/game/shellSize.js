/** Compute shell rectangle dimensions from screen size and layout mode.
 *
 * @param {number} width  - viewport width in pixels
 * @param {number} height - viewport height in pixels
 * @param {boolean} compact - whether the layout is in compact mode
 * @returns {{ x: number, y: number, width: number, height: number }}
 */
export function getShellSize(width, height, compact) {
  const shellWidth = Math.max(0, Math.min(width - 24, 900));
  const shellHeight = Math.max(0, Math.min(height - 48, compact ? 760 : 530));
  return {
    x: width / 2,
    y: height / 2 - 30,
    width: shellWidth,
    height: shellHeight
  };
}
