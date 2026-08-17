/**
 * Determines the animation state based on the provided input parameters.
 * @param {Object} input - The input object containing game state data.
 * @param {string} input.motionState - The current motion state of the entity.
 * @param {number} input.cooldown - The current cooldown value.
 * @param {number} input.hp - The current health points of the entity.
 * @returns {'idle'|'move'|'attack'|'death'} The determined animation state.
 */
export function getAnimationState({ motionState, cooldown, hp }) {
  if (hp <= 0) {
    return 'death';
  }
  if (motionState === 'attack' || cooldown < 0.15) {
    return 'attack';
  }
  if (motionState === 'move') {
    return 'move';
  }
  return 'idle';
}
