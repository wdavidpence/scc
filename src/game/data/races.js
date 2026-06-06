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
    techBuildingName: 'Tech Lab',
    workerName: 'SCV',
    soldierName: 'Marine',
    signatureName: 'Marauder',
    startMinerals: 500,
    startGas: 150,
    startSupplyCap: 10,
    startSupplyUsed: 4,
    startWorkers: 4,
    startSoldiers: 1,
    enemyIncomePerSecond: 5,
    workerHarvest: 8,
    workerGasHarvest: 3,
    gasGeysers: [
      { x: 0.30, y: 0.30, amount: 1500 },
      { x: 0.70, y: 0.70, amount: 1500 }
    ],
    structures: {
      commandCenter: { cost: 0, buildTime: 0, maxHp: 1600, width: 110, height: 72, supplyBonus: 0, color: 0x1d4ed8 },
      production: { cost: 150, buildTime: 10, maxHp: 900, width: 88, height: 56, supplyBonus: 8, color: 0x2563eb },
      techBuilding: { cost: 200, buildTime: 12, maxHp: 750, width: 76, height: 52, supplyBonus: 0, color: 0x7c3aed, requiredStructure: 'production' }
    },
    units: {
      worker: { label: 'SCV', cost: 50, gasCost: 0, buildTime: 7, hp: 45, maxHp: 45, speed: 128, attack: 4, range: 24, cooldown: 0.8, supply: 1, radius: 14, color: 0x93c5fd },
      soldier: { label: 'Marine', cost: 50, gasCost: 25, buildTime: 9, hp: 55, maxHp: 55, speed: 146, attack: 8, range: 32, cooldown: 0.65, supply: 1, radius: 15, color: 0x60a5fa,
        stimpack: {
          damageMultiplier: 2,
          speedMultiplier: 0.5,
          duration: 14,
          cooldown: 30,
          hpBurn: 15,
          label: 'Stimpack'
        } },
      signature: { label: 'Marauder', cost: 150, gasCost: 100, buildTime: 16, hp: 150, maxHp: 150, speed: 118, attack: 14, range: 30, cooldown: 1.1, supply: 2, radius: 17, color: 0x3b82f6, requiresTech: true },
      enemySoldier: { label: 'Raider', cost: 50, buildTime: 9, hp: 55, maxHp: 55, speed: 136, attack: 8, range: 32, cooldown: 0.7, supply: 1, radius: 15, color: 0xf97316 },
      enemySignature: { label: 'Elite Raider', cost: 150, buildTime: 16, hp: 150, maxHp: 150, speed: 112, attack: 14, range: 30, cooldown: 1.15, supply: 2, radius: 17, color: 0xdc2626 }
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
    techBuildingName: 'Spire',
    workerName: 'Drone',
    soldierName: 'Zergling',
    signatureName: 'Hydralisk',
    startMinerals: 500,
    startGas: 150,
    startSupplyCap: 11,
    startSupplyUsed: 4,
    startWorkers: 4,
    startSoldiers: 2,
    enemyIncomePerSecond: 5,
    workerHarvest: 10,
    workerGasHarvest: 4,
    gasGeysers: [
      { x: 0.25, y: 0.65, amount: 1500 },
      { x: 0.75, y: 0.35, amount: 1500 }
    ],
    structures: {
      commandCenter: { cost: 0, buildTime: 0, maxHp: 1450, width: 112, height: 76, supplyBonus: 0, color: 0x7c2d12 },
      production: { cost: 125, buildTime: 8, maxHp: 820, width: 84, height: 58, supplyBonus: 10, color: 0xea580c },
      techBuilding: { cost: 175, buildTime: 10, maxHp: 680, width: 72, height: 50, supplyBonus: 0, color: 0xa855f7, requiredStructure: 'production' }
    },
    units: {
      worker: { label: 'Drone', cost: 40, gasCost: 0, buildTime: 6, hp: 35, maxHp: 35, speed: 156, attack: 3, range: 20, cooldown: 0.75, supply: 1, radius: 13, color: 0xf97316 },
      soldier: { label: 'Zergling', cost: 25, gasCost: 0, buildTime: 6, hp: 32, maxHp: 32, speed: 170, attack: 6, range: 20, cooldown: 0.48, supply: 1, radius: 13, color: 0xfb923c },
      baneling: { label: 'Baneling', cost: 35, gasCost: 0, buildTime: 7, hp: 30, maxHp: 30, speed: 220, attack: 6, range: 20, cooldown: 0.48, supply: 1, radius: 16, color: 0xff4500, isBaneling: true },
      signature: { label: 'Hydralisk', cost: 100, gasCost: 75, buildTime: 14, hp: 100, maxHp: 100, speed: 138, attack: 10, range: 42, cooldown: 0.72, supply: 2, radius: 15, color: 0x16a34a, isRanged: true },
      enemySoldier: { label: 'Raider', cost: 25, buildTime: 6, hp: 32, maxHp: 32, speed: 162, attack: 6, range: 20, cooldown: 0.52, supply: 1, radius: 13, color: 0xfca5a5 },
      enemySignature: { label: 'Elite Raider', cost: 100, buildTime: 14, hp: 100, maxHp: 100, speed: 132, attack: 10, range: 42, cooldown: 0.76, supply: 2, radius: 15, color: 0xdc2626 }
    }
  },
  protoss: {
    id: 'protoss',
    name: 'Protoss',
    subtitle: 'High-tech precision, expensive units, and sturdy defenses.',
    accent: 0xa78bfa,
    glow: 0xd8b4fe,
    backdrop: 0x0c0918,
    commandCenterName: 'Nexus',
    productionName: 'Gateway',
    techBuildingName: 'Cybernetics Core',
    workerName: 'Probe',
    soldierName: 'Zealot',
    signatureName: 'Dragoon',
    startMinerals: 500,
    startGas: 150,
    startSupplyCap: 9,
    startSupplyUsed: 4,
    startWorkers: 4,
    startSoldiers: 1,
    enemyIncomePerSecond: 5,
    workerHarvest: 9,
    workerGasHarvest: 3,
    gasGeysers: [
      { x: 0.35, y: 0.35, amount: 1500 },
      { x: 0.65, y: 0.65, amount: 1500 }
    ],
    structures: {
      commandCenter: { cost: 0, buildTime: 0, maxHp: 1700, width: 112, height: 74, supplyBonus: 0, color: 0x7c3aed },
      production: { cost: 175, buildTime: 11, maxHp: 980, width: 90, height: 60, supplyBonus: 9, color: 0x8b5cf6 },
      techBuilding: { cost: 225, buildTime: 13, maxHp: 800, width: 78, height: 54, supplyBonus: 0, color: 0xc084fc, requiredStructure: 'production' }
    },
    units: {
      worker: { label: 'Probe', cost: 50, gasCost: 0, buildTime: 7, hp: 40, maxHp: 40, speed: 132, attack: 3, range: 22, cooldown: 0.76, supply: 1, radius: 14, color: 0xc4b5fd },
      soldier: { label: 'Zealot', cost: 75, gasCost: 25, buildTime: 10, hp: 85, maxHp: 85, shield: 85, maxShield: 85, speed: 124, attack: 12, range: 26, cooldown: 0.72, supply: 2, radius: 16, color: 0xa78bfa, chargeCooldown: 10, chargeDamage: 6, chargeDashDist: 120 },
      signature: { label: 'Dragoon', cost: 150, gasCost: 125, buildTime: 18, hp: 140, maxHp: 140, shield: 50, maxShield: 50, speed: 114, attack: 16, range: 56, cooldown: 1.2, supply: 2, radius: 17, color: 0x7c3aed, requiresTech: true },
      enemySoldier: { label: 'Raider', cost: 75, buildTime: 10, hp: 85, maxHp: 85, speed: 118, attack: 12, range: 26, cooldown: 0.76, supply: 2, radius: 16, color: 0xfcd34d },
      enemySignature: { label: 'Elite Raider', cost: 150, buildTime: 18, hp: 140, maxHp: 140, speed: 110, attack: 16, range: 56, cooldown: 1.25, supply: 2, radius: 17, color: 0xdc2626 }
    }
  }
};

export function getRace(raceId = 'terran') {
  return RACES[raceId] ?? RACES.terran;
}
