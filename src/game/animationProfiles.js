export const MARINE_ANIMATION_PROFILE = Object.freeze({
  idle: { duration: 900, loop: true, scale: 1, yAmplitude: 0.8, angleAmplitude: 1 },
  move: { duration: 360, loop: true, scale: 1.03, yAmplitude: 1.5, angleAmplitude: 2 },
  attack: { duration: 180, loop: false, scale: 1.08, yAmplitude: -1, angleAmplitude: 4 },
  death: { duration: 520, loop: false, scale: 0.82, yAmplitude: -4, angleAmplitude: 12 }
});
