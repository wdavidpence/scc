/**
 * Determines the damage tier based on current and maximum HP.
 * @param {number} hp - Current health points.
 * @param {number} maxHp - Maximum health points.
 * @returns {"critical"|"wounded"|"healthy"} The damage tier.
 */
export function getDamageTier(hp, maxHp) {
  if (maxHp <= 0) return "critical";
  const ratio = Math.min(1, Math.max(0, hp / maxHp));
  return ratio <= 0.25 ? "critical" : ratio <= 0.6 ? "wounded" : "healthy";
}
