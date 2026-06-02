export const RACE_ORDER = ['terran', 'zerg', 'protoss'];

export const RACES = {
  terran: {
    id: 'terran',
    name: 'Terran',
    subtitle: 'Balanced forces, sturdy defenses, and classic battlefield rhythm.',
    accent: 0x60a5fa,
    glow: 0x93c5fd,
    backdrop: 0x07111c,
    commandCenterName: 'Command Center',
    productionName: 'Barracks',
    workerName: 'SCV',
    soldierName: 'Marine',
    signatureName: 'Marauder',
    startMinerals: 500,
    startSupplyCap: 10,
    startSupplyUsed: 4,
    startWorkers: 4,
    startSoldiers: 1,
    enemyIncomePerSecond: 7,
    workerHarvest: 10,
    structures: {
      commandCenter: { cost: 0, buildTime: 0, maxHp: 1600, width: 110, height: 72, supplyBonus: 0, color: 0x1d4ed8 },
      production: { cost: 150, buildTime: 10, maxHp: 900, width: 88, height: 56, supplyBonus: 8, color: 0x2563eb }
    },
    units: {
      worker: { label: 'SCV', cost: 50, buildTime: 7, hp: 45, maxHp: 45, speed: 128, attack: 4, range: 24, cooldown: 0.8, supply: 1, radius: 14, color: 0x93c5fd },
      soldier: { label: 'Marine', cost: 50, buildTime: 9, hp: 55, maxHp: 55, speed: 146, attack: 8, range: 32, cooldown: 0.65, supply: 1, radius: 15, color: 0x60a5fa },
      enemySoldier: { label: 'Raider', cost: 50, buildTime: 9, hp: 55, maxHp: 55, speed: 136, attack: 8, range: 32, cooldown: 0.7, supply: 1, radius: 15, color: 0xf97316 }
    }
  },
  zerg: {
    id: 'zerg',
    name: 'Zerg',
    subtitle: 'Swarm pressure, cheap bodies, and relentless momentum.',
    accent: 0xf97316,
    glow: 0xfbbf24,
    backdrop: 0x140b08,
    commandCenterName: 'Hatchery',
    productionName: 'Spawning Pool',
    workerName: 'Drone',
    soldierName: 'Zergling',
    signatureName: 'Hydralisk',
    startMinerals: 500,
    startSupplyCap: 11,
    startSupplyUsed: 4,
    startWorkers: 4,
    startSoldiers: 2,
    enemyIncomePerSecond: 8,
    workerHarvest: 12,
    structures: {
      commandCenter: { cost: 0, buildTime: 0, maxHp: 1450, width: 112, height: 76, supplyBonus: 0, color: 0x7c2d12 },
      production: { cost: 125, buildTime: 8, maxHp: 820, width: 84, height: 58, supplyBonus: 10, color: 0xea580c }
    },
    units: {
      worker: { label: 'Drone', cost: 40, buildTime: 6, hp: 35, maxHp: 35, speed: 156, attack: 3, range: 20, cooldown: 0.75, supply: 1, radius: 13, color: 0xf97316 },
      soldier: { label: 'Zergling', cost: 25, buildTime: 6, hp: 32, maxHp: 32, speed: 170, attack: 6, range: 20, cooldown: 0.48, supply: 1, radius: 13, color: 0xfb923c },
      enemySoldier: { label: 'Raider', cost: 25, buildTime: 6, hp: 32, maxHp: 32, speed: 162, attack: 6, range: 20, cooldown: 0.52, supply: 1, radius: 13, color: 0xfca5a5 }
    }
  },
  protoss: {
    id: 'protoss',
    name: 'Protoss',
    subtitle: 'High-tech precision, expensive units, and sturdy shields.',
    accent: 0xa78bfa,
    glow: 0xd8b4fe,
    backdrop: 0x0c0918,
    commandCenterName: 'Nexus',
    productionName: 'Gateway',
    workerName: 'Probe',
    soldierName: 'Zealot',
    signatureName: 'Dragoon',
    startMinerals: 500,
    startSupplyCap: 9,
    startSupplyUsed: 4,
    startWorkers: 4,
    startSoldiers: 1,
    enemyIncomePerSecond: 7,
    workerHarvest: 11,
    structures: {
      commandCenter: { cost: 0, buildTime: 0, maxHp: 1700, width: 112, height: 74, supplyBonus: 0, color: 0x7c3aed },
      production: { cost: 175, buildTime: 11, maxHp: 980, width: 90, height: 60, supplyBonus: 9, color: 0x8b5cf6 }
    },
    units: {
      worker: { label: 'Probe', cost: 50, buildTime: 7, hp: 40, maxHp: 40, speed: 132, attack: 3, range: 22, cooldown: 0.76, supply: 1, radius: 14, color: 0xc4b5fd },
      soldier: { label: 'Zealot', cost: 75, buildTime: 10, hp: 85, maxHp: 85, speed: 124, attack: 12, range: 26, cooldown: 0.72, supply: 2, radius: 16, color: 0xa78bfa },
      enemySoldier: { label: 'Raider', cost: 75, buildTime: 10, hp: 85, maxHp: 85, speed: 118, attack: 12, range: 26, cooldown: 0.76, supply: 2, radius: 16, color: 0xfcd34d }
    }
  }
};

export function getRace(raceId = 'terran') {
  return RACES[raceId] ?? RACES.terran;
}
