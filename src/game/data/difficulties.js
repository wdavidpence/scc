export const DIFFICULTY_ORDER = ['easy', 'normal', 'hard'];

export const DIFFICULTIES = {
  easy: {
    id: 'easy',
    label: 'Easy',
    description: 'Slower income, later waves, and fewer elite raids.',
    enemyStartingMinerals: 260,
    enemyStartingSupplyCap: 8,
    enemyIncomeMultiplier: 0.82,
    enemyWaveStart: 8.5,
    enemyWaveFloor: 5.5,
    enemyWaveDecay: 0.22,
    enemyTechWave: 4,
    enemySignatureWave: 5,
    enemySignatureCadence: 3
  },
  normal: {
    id: 'normal',
    label: 'Normal',
    description: 'Baseline pressure with steady income and balanced waves.',
    enemyStartingMinerals: 320,
    enemyStartingSupplyCap: 10,
    enemyIncomeMultiplier: 1,
    enemyWaveStart: 7.5,
    enemyWaveFloor: 4,
    enemyWaveDecay: 0.3,
    enemyTechWave: 3,
    enemySignatureWave: 3,
    enemySignatureCadence: 2
  },
  hard: {
    id: 'hard',
    label: 'Hard',
    description: 'Faster income, earlier tech, and more frequent elite pressure.',
    enemyStartingMinerals: 380,
    enemyStartingSupplyCap: 12,
    enemyIncomeMultiplier: 1.25,
    enemyWaveStart: 6.5,
    enemyWaveFloor: 3.5,
    enemyWaveDecay: 0.36,
    enemyTechWave: 2,
    enemySignatureWave: 2,
    enemySignatureCadence: 2
  }
};

export function getDifficulty(difficultyId = 'normal') {
  return DIFFICULTIES[difficultyId] ?? DIFFICULTIES.normal;
}

export function getEnemyWaveInterval(difficulty, enemyWave) {
  return Math.max(difficulty.enemyWaveFloor, difficulty.enemyWaveStart - enemyWave * difficulty.enemyWaveDecay);
}
