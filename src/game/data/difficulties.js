export const DIFFICULTY_ORDER = ['easy', 'normal', 'hard'];

export const DIFFICULTIES = {
  easy: {
    id: 'easy',
    label: 'Easy',
    description: 'Slower enemy build-up. Good for learning the loop.',
    enemyStartingMinerals: 50,
    enemyStartingSupplyCap: 10,
    enemyIncomeMultiplier: 0,
    enemyTargetWorkers: 6,
    enemyAttackArmy: 8,
    enemyRetreatArmy: 2,
    enemyAttackCooldown: 28
  },
  normal: {
    id: 'normal',
    label: 'Normal',
    description: 'Even 1v1. Both sides grow from a command center and four workers.',
    enemyStartingMinerals: 50,
    enemyStartingSupplyCap: 10,
    enemyIncomeMultiplier: 0,
    enemyTargetWorkers: 8,
    enemyAttackArmy: 6,
    enemyRetreatArmy: 2,
    enemyAttackCooldown: 22
  },
  hard: {
    id: 'hard',
    label: 'Hard',
    description: 'Faster enemy production and earlier attacks.',
    enemyStartingMinerals: 80,
    enemyStartingSupplyCap: 10,
    enemyIncomeMultiplier: 0,
    enemyTargetWorkers: 10,
    enemyAttackArmy: 5,
    enemyRetreatArmy: 1,
    enemyAttackCooldown: 16
  }
};

export function getDifficulty(difficultyId = 'normal') {
  return DIFFICULTIES[difficultyId] ?? DIFFICULTIES.normal;
}

export function getEnemyWaveInterval() {
  return 9999;
}
