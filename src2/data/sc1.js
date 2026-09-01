// SC2-REBUILT — StarCraft 1 inspired RTS
// Data layer: units, buildings, tech, balance. Stats mirror SC1 feel.
// Attack types: concussive / normal / explosive / ignore
// Armor types: none / 1 / 2 / 3
// Sizes: small / medium / large
// Targets: ground / air / both

export const TILE = 16;

// Damage multipliers by attack type vs unit size (SC1 rules)
export const SIZE_MULT = {
  concussive: { small: 1.0, medium: 0.5, large: 0.25 },
  normal: { small: 1.0, medium: 1.0, large: 1.0 },
  explosive: { small: 0.5, medium: 0.75, large: 1.0 },
  ignore: { small: 1.0, medium: 1.0, large: 1.0 }
};

export const BUILD_TIME_SCALE = 0.18; // accelerate vs SC1 for browser session pacing

export const UNITS = {
  // ---------------- TERRAN ----------------
  scv: {
    race: 'terran', name: 'SCV', hp: 60, armor: 0, size: 'small',
    speed: 0.62, targets: 'ground', attackType: 'concussive', damage: 5, cooldown: 1.0, range: 0.6,
    supply: 1, minerals: 50, gas: 0, buildTime: 12, build: 'commandCenter',
    sight: 8, worker: true, lift: false, icon: 'scv'
  },
  marine: {
    race: 'terran', name: 'Marine', hp: 60, armor: 0, size: 'small',
    speed: 0.66, targets: 'ground', attackType: 'concussive', damage: 6, cooldown: 0.86, range: 4,
    supply: 1, minerals: 50, gas: 10, buildTime: 18, build: 'barracks',
    sight: 8, canStim: true, icon: 'marine'
  },
  firebat: {
    race: 'terran', name: 'Firebat', hp: 80, armor: 0, size: 'small',
    speed: 0.62, targets: 'ground', attackType: 'concussive', damage: 8, cooldown: 0.96, range: 2.4,
    splash: { radius: 1.2, falloff: false },
    supply: 1, minerals: 50, gas: 30, buildTime: 21, build: 'academy',
    sight: 8, icon: 'firebat'
  },
  tank: {
    race: 'terran', name: 'Siege Tank', hp: 150, armor: 1, size: 'large',
    speed: 0.36, targets: 'ground', attackType: 'explosive', damage: 30, cooldown: 2.6, range: 8,
    splash: { radius: 1.5 },
    supply: 2, minerals: 150, gas: 100, buildTime: 32, build: 'factory',
    sight: 9, siege: { range: 12, cooldown: 3.2, damage: 50, splash: 2.5, switchTime: 1.1 },
    icon: 'tank'
  },
  vulture: {
    race: 'terran', name: 'Vulture', hp: 70, armor: 0, size: 'small',
    speed: 1.44, targets: 'ground', attackType: 'explosive', damage: 12, cooldown: 0.86, range: 5.4,
    supply: 1, minerals: 75, gas: 25, buildTime: 22, build: 'factory',
    sight: 11, spiderMine: true, patrol: true, icon: 'vulture'
  },
  goliath: {
    race: 'terran', name: 'Goliath', hp: 120, armor: 1, size: 'large',
    speed: 0.66, targets: 'both', attackType: 'explosive', damage: 20, cooldown: 1.2, range: 6,
    airDamage: 24,
    supply: 2, minerals: 150, gas: 75, buildTime: 38, build: 'machineShop',
    sight: 10, icon: 'goliath'
  },
  wraith: {
    race: 'terran', name: 'Wraith', hp: 120, armor: 0, size: 'large', flying: true,
    speed: 1.14, targets: 'air', attackType: 'explosive', damage: 20, cooldown: 1.7, range: 7,
    supply: 2, minerals: 150, gas: 100, buildTime: 36, build: 'starport',
    sight: 11, icon: 'wraith'
  },
  battlecruiser: {
    race: 'terran', name: 'Battlecruiser', hp: 500, armor: 3, size: 'large', flying: true,
    speed: 0.48, targets: 'ground', attackType: 'explosive', damage: 5, cooldown: 1.0, range: 6, attacksPerVolley: 8,
    supply: 8, minerals: 300, gas: 200, buildTime: 80, build: 'starport', tech: 'controlTower',
    sight: 12, icon: 'bc'
  },
  ghost: {    race: 'terran', name: 'Ghost', hp: 45, armor: 0, size: 'small',
    speed: 0.66, targets: 'both', attackType: 'normal', damage: 10, cooldown: 0.92, range: 6,
    supply: 1, minerals: 25, gas: 75, buildTime: 25, build: 'academy', tech: 'caduceusReactor',
    sight: 11, detect: true, icon: 'ghost'
  },
  medic: {
    race: 'terran', name: 'Medic', hp: 50, armor: 0, size: 'small',
    speed: 0.66, targets: 'ground', attackType: 'normal', damage: 4, cooldown: 1.2, range: 4,
    supply: 1, minerals: 50, gas: 75, buildTime: 23, build: 'academy', tech: 'combatMedics',
    sight: 9, heal: { amount: 4, interval: 0.5, range: 3.2 }, icon: 'medic'
  },
  dropship: {
    race: 'terran', name: 'Dropship', hp: 200, armor: 1, size: 'large', flying: true,
    speed: 0.96, targets: 'ground', attackType: 'ignore', damage: 0, cooldown: 1, range: 0,
    supply: 2, minerals: 150, gas: 100, buildTime: 40, build: 'starport',
    sight: 10, transport: 8, icon: 'dropship', weaponless: true
  },

  // ---------------- ZERG ----------------
  drone: {
    race: 'zerg', name: 'Drone', hp: 40, armor: 0, size: 'small',
    speed: 0.66, targets: 'ground', attackType: 'concussive', damage: 4, cooldown: 1.0, range: 0.6,
    supply: 1, minerals: 50, gas: 0, buildTime: 12, build: 'hatchery',
    sight: 8, worker: true, icon: 'drone'
  },
  zergling: {
    race: 'zerg', name: 'Zergling', hp: 35, armor: 0, size: 'small',
    speed: 0.96, targets: 'ground', attackType: 'concussive', damage: 5, cooldown: 0.5, range: 0.8,
    supply: 0.5, minerals: 25, gas: 0, buildTime: 8, build: 'spawningPool', trainCount: 2,
    sight: 8, icon: 'zergling'
  },
  hydralisk: {
    race: 'zerg', name: 'Hydralisk', hp: 80, armor: 0, size: 'medium',
    speed: 0.72, targets: 'both', attackType: 'normal', damage: 10, cooldown: 0.96, range: 5.4,
    supply: 1, minerals: 75, gas: 25, buildTime: 24, build: 'hydraliskDen',
    sight: 9, icon: 'hydra'
  },
  mutalisk: {
    race: 'zerg', name: 'Mutalisk', hp: 150, armor: 0, size: 'medium', flying: true,
    speed: 1.44, targets: 'both', attackType: 'normal', damage: 9, cooldown: 1.0, range: 1.4,
    supply: 2, minerals: 100, gas: 50, buildTime: 24, build: 'spire',
    sight: 10, icon: 'muta'
  },
  ultralisk: {
    race: 'zerg', name: 'Ultralisk', hp: 400, armor: 1, size: 'large',
    speed: 0.72, targets: 'ground', attackType: 'explosive', damage: 20, cooldown: 1.0, range: 1.2,
    supply: 4, minerals: 150, gas: 150, buildTime: 48, build: 'ultraliskCavern', tech: 'chitinousPlating',
    sight: 10, icon: 'ultra'
  },
  overlord: {
    race: 'zerg', name: 'Overlord', hp: 200, armor: 1, size: 'large', flying: true,
    speed: 0.48, targets: 'ground', attackType: 'ignore', damage: 0, cooldown: 1, range: 0,
    supply: 0, supplyBonus: 8, minerals: 100, gas: 0, buildTime: 18, build: 'hatchery',
    sight: 12, icon: 'overlord', weaponless: true
  },
  scourge: {
    race: 'zerg', name: 'Scourge', hp: 25, armor: 0, size: 'small', flying: true,
    speed: 1.0, targets: 'air', attackType: 'explosive', damage: 22, cooldown: 0.6, range: 0.9,
    splash: { radius: 0.5, self: true },
    supply: 1, minerals: 25, gas: 75, buildTime: 10, build: 'spire',
    sight: 9, icon: 'scourge'
  },
  lurker: {
    race: 'zerg', name: 'Lurker', hp: 130, armor: 1, size: 'large',
    speed: 0.62, targets: 'ground', attackType: 'explosive', damage: 30, cooldown: 2.0, range: 6,
    supply: 2, minerals: 50, gas: 100, buildTime: 28, build: 'hydraliskDen', tech: 'lurkerEgg',
    burrow: true, icon: 'lurker'
  },

  // ---------------- PROTOSS ----------------
  probe: {
    race: 'protoss', name: 'Probe', hp: 20, shield: 20, armor: 0, size: 'small',
    speed: 0.66, targets: 'ground', attackType: 'explosive', damage: 5, cooldown: 1.0, range: 0.6,
    supply: 1, minerals: 50, gas: 0, buildTime: 12, build: 'nexus',
    sight: 8, worker: true, icon: 'probe'
  },
  zealot: {
    race: 'protoss', name: 'Zealot', hp: 60, shield: 60, armor: 1, size: 'medium',
    speed: 0.84, targets: 'ground', attackType: 'normal', damage: 6, cooldown: 0.64, range: 0.8,
    supply: 2, minerals: 100, gas: 0, buildTime: 24, build: 'gateway',
    sight: 8, icon: 'zealot'
  },
  dragoon: {
    race: 'protoss', name: 'Dragoon', hp: 100, shield: 100, armor: 1, size: 'large',
    speed: 0.62, targets: 'ground', attackType: 'explosive', damage: 20, cooldown: 1.44, range: 5.4,
    supply: 2, minerals: 125, gas: 50, buildTime: 32, build: 'gateway', tech: 'roboticsFacilityTech',
    sight: 8, icon: 'dragoon'
  },
  highTemplar: {
    race: 'protoss', name: 'High Templar', hp: 40, shield: 40, armor: 0, size: 'small',
    speed: 0.62, targets: 'both', attackType: 'normal', damage: 6, cooldown: 1.0, range: 5.4,
    supply: 2, minerals: 50, gas: 150, buildTime: 32, build: 'council',
    sight: 10, psiStorm: { damage: 4, cooldown: 0.5, radius: 2.0, duration: 4.0, energy: 75 },
    energy: 100, castAbility: 'storm', icon: 'htemplar'
  },
  darkTemplar: {
    race: 'protoss', name: 'Dark Templar', hp: 50, shield: 50, armor: 1, size: 'medium',
    speed: 0.84, targets: 'ground', attackType: 'normal', damage: 20, cooldown: 1.2, range: 0.8,
    supply: 2, minerals: 125, gas: 125, buildTime: 40, build: 'council', tech: 'darkTemplar',
    sight: 10, cloak: true, icon: 'dtemplar'
  },
  archon: {
    race: 'protoss', name: 'Archon', hp: 150, shield: 150, armor: 0, size: 'large',
    speed: 0.66, targets: 'both', attackType: 'normal', damage: 10, cooldown: 0.8, range: 5.4,
    supply: 4, minerals: 0, gas: 0, buildTime: 0, build: null, summon: true,
    sight: 8, icon: 'archon'
  },
  carrier: {
    race: 'protoss', name: 'Carrier', hp: 300, shield: 300, armor: 3, size: 'large', flying: true,
    speed: 0.48, targets: 'ground', attackType: 'ignore', damage: 5, cooldown: 0.9, range: 8, attacksPerVolley: 4,
    supply: 6, minerals: 300, gas: 200, buildTime: 72, build: 'stargate', tech: 'fleetBeacon',
    sight: 11, interceptor: true, icon: 'carrier'
  }
};

export const BUILDINGS = {
  // ---------------- TERRAN ----------------
  commandCenter: {
    race: 'terran', name: 'Command Center', hp: 500, armor: 1, size: 'large',
    minerals: 400, gas: 0, buildTime: 48, w: 5, h: 4, sight: 9,
    supply: 10, produces: ['scv'], rally: true, primary: true
  },
  supplyDepot: {
    race: 'terran', name: 'Supply Depot', hp: 300, armor: 1, size: 'large',
    minerals: 100, gas: 0, buildTime: 24, w: 2, h: 2, sight: 4,
    supply: 8, dropSupply: true
  },
  refinery: {
    race: 'terran', name: 'Refinery', hp: 450, armor: 1, size: 'large',
    minerals: 100, gas: 0, buildTime: 24, w: 4, h: 3, sight: 5, onGeyser: true, gasCap: 8
  },
  barracks: {
    race: 'terran', name: 'Barracks', hp: 300, armor: 1, size: 'large',
    minerals: 150, gas: 0, buildTime: 40, w: 4, h: 3, sight: 6, produces: ['marine', 'firebat']
  },
  factory: {
    race: 'terran', name: 'Factory', hp: 300, armor: 1, size: 'large',
    minerals: 200, gas: 100, buildTime: 64, w: 4, h: 3, sight: 6, produces: ['tank', 'vulture', 'goliath'],
    requires: ['barracks', 'academy']
  },
  machineShop: {
    race: 'terran', name: 'Machine Shop', hp: 300, armor: 1, size: 'large',
    minerals: 50, gas: 50, buildTime: 32, w: 2, h: 2, sight: 4, addOnTo: 'factory',
    unlocks: ['goliath']
  },
  starport: {
    race: 'terran', name: 'Starport', hp: 300, armor: 1, size: 'large',
    minerals: 150, gas: 100, buildTime: 64, w: 4, h: 3, sight: 6, produces: ['wraith', 'dropship'],
    requires: ['factory']
  },
  controlTower: {
    race: 'terran', name: 'Control Tower', hp: 300, armor: 1, size: 'large',
    minerals: 100, gas: 50, buildTime: 32, w: 2, h: 2, sight: 4, addOnTo: 'starport',
    unlocks: ['battlecruiser']
  },
  academy: {
    race: 'terran', name: 'Academy', hp: 300, armor: 1, size: 'large',
    minerals: 100, gas: 50, buildTime: 32, w: 3, h: 3, sight: 6, produces: ['firebat', 'ghost', 'medic'],
    requires: ['barracks']
  },
  missileTurret: {
    race: 'terran', name: 'Missile Turret', hp: 200, armor: 1, size: 'large',
    minerals: 50, gas: 50, buildTime: 24, w: 2, h: 2, sight: 8,
    defense: { damage: 18, cooldown: 1.0, range: 7, attackType: 'explosive', targets: 'air' }, detect: true
  },
  engineeringBay: {
    race: 'terran', name: 'Engineering Bay', hp: 300, armor: 1, size: 'large',
    minerals: 100, gas: 0, buildTime: 32, w: 2, h: 2, sight: 4,
    tech: ['terranInfantryArmor1', 'terranInfantryWeapons1']
  },
  scienceFacility: {
    race: 'terran', name: 'Science Facility', hp: 300, armor: 1, size: 'large',
    minerals: 100, gas: 100, buildTime: 64, w: 4, h: 3, sight: 6,
    tech: ['radar'], unlocks: ['ghost']
  },
  caduceusReactor: {
    race: 'terran', name: 'Caduceus Reactor', hp: 300, armor: 1, addOnTo: 'scienceFacility',
    minerals: 0, gas: 0, buildTime: 0, w: 0, h: 0, sight: 0, unlocks: ['ghost']
  },
  bunker: {
    race: 'terran', name: 'Bunker', hp: 350, armor: 1, size: 'large',
    minerals: 100, gas: 0, buildTime: 26, w: 2, h: 2, sight: 7, rally: true,
    garrison: 4, garrisonDefense: { damage: 6, cooldown: 0.9, range: 6, attackType: 'normal' }
  },

  // ---------------- ZERG ----------------
  hatchery: {
    race: 'zerg', name: 'Hatchery', hp: 300, armor: 1, size: 'large',
    minerals: 300, gas: 0, buildTime: 0, growFromDrone: true, w: 4, h: 4, sight: 9,
    produces: ['drone', 'overlord'], creepRadius: 9, primary: true, creepGrowth: true
  },
  evolutionChamber: {
    race: 'zerg', name: 'Evolution Chamber', hp: 300, armor: 1, size: 'large',
    minerals: 100, gas: 100, creep: true, buildTime: 32, w: 3, h: 3, sight: 5,
    tech: ['zergMeleeAttacks1', 'zergCarapace1']
  },
  creepColony: {
    race: 'zerg', name: 'Creep Colony', hp: 300, armor: 1, size: 'large',
    minerals: 50, gas: 0, creep: true, buildTime: 24, w: 2, h: 2, sight: 5,
    transforms: ['hive']
  },
  spawningPool: {
    race: 'zerg', name: 'Spawning Pool', hp: 300, armor: 1, size: 'large',
    minerals: 200, gas: 0, creep: true, buildTime: 48, w: 3, h: 3, sight: 6, produces: ['zergling']
  },
  hydraliskDen: {
    race: 'zerg', name: 'Hydralisk Den', hp: 300, armor: 1, size: 'large',
    minerals: 100, gas: 50, creep: true, buildTime: 40, w: 3, h: 3, sight: 6, produces: ['hydralisk'],
    tech: ['lurkerEgg']
  },
  spire: {
    race: 'zerg', name: 'Spire', hp: 300, armor: 1, size: 'large',
    minerals: 200, gas: 150, creep: true, buildTime: 64, w: 3, h: 3, sight: 8, produces: ['mutalisk', 'scourge'],
    tech: ['greaterSpire']
  },
  hive: {
    race: 'zerg', name: 'Hive', hp: 400, armor: 1, size: 'large',
    minerals: 300, gas: 200, creep: true, buildTime: 80, w: 4, h: 4, sight: 9,
    produces: ['ultralisk'], techTree: true, transformFrom: 'lair'
  },
  lair: {
    race: 'zerg', name: 'Lair', hp: 400, armor: 1, size: 'large',
    minerals: 150, gas: 100, creep: true, buildTime: 56, w: 4, h: 4, sight: 9,
    transformFrom: 'hatchery', unlocks: ['hydraliskDen', 'spire']
  },
  ultraliskCavern: {
    race: 'zerg', name: 'Ultralisk Cavern', hp: 300, armor: 1, size: 'large',
    minerals: 150, gas: 200, creep: true, buildTime: 40, w: 3, h: 3, sight: 6, produces: ['ultralisk'],
    requires: ['lair']
  },
  chitinousPlating: {
    race: 'zerg', name: 'Chitinous Plating', hp: 300, addOnTo: null, minerals: 0, gas: 0, buildTime: 0, w: 0, h: 0, sight: 0, techOnly: true, requires: ['lair']
  },
  sporeColony: {
    race: 'zerg', name: 'Spore Colony', hp: 350, armor: 1, size: 'large',
    minerals: 100, gas: 50, creep: true, buildTime: 24, w: 2, h: 2, sight: 9,
    defense: { damage: 9, cooldown: 0.96, range: 8, attackType: 'normal', targets: 'air' }, detect: true,
    transformFrom: 'creepColony'
  },
  extractor: {
    race: 'zerg', name: 'Extractor', hp: 300, armor: 1, size: 'large',
    minerals: 75, gas: 0, creep: true, buildTime: 24, w: 4, h: 3, sight: 5, onGeyser: true, gasCap: 8
  },
  greaterSpire: { race: 'zerg', name: 'Greater Spire', hp: 300, addOnTo: null, minerals: 0, gas: 0, buildTime: 0, w: 0, h: 0, sight: 0, techOnly: true, requires: ['lair'] },
  lurkerEggZ: { race: 'zerg', name: 'Lurker Egg Research', techOnly: true, addOnTo: null, minerals: 50, gas: 100, buildTime: 34, w: 0, h: 0, sight: 0 },

  // ---------------- PROTOSS ----------------
  nexus: {
    race: 'protoss', name: 'Nexus', hp: 600, shield: 600, armor: 1, size: 'large',
    minerals: 400, gas: 0, buildTime: 0, w: 5, h: 4, sight: 10,
    supply: 15, produces: ['probe'], primary: true, warps: true
  },
  pylon: {
    race: 'protoss', name: 'Pylon', hp: 300, shield: 300, armor: 1, size: 'large',
    minerals: 100, gas: 0, buildTime: 18, w: 2, h: 2, sight: 6, supply: 8, power: true
  },
  assimulator: {
    race: 'protoss', name: 'Assimilator', hp: 600, shield: 600, armor: 1, size: 'large',
    minerals: 75, gas: 0, buildTime: 24, w: 4, h: 3, sight: 5, onGeyser: true, gasCap: 8
  },
  gateway: {
    race: 'protoss', name: 'Gateway', hp: 450, shield: 450, armor: 1, size: 'large',
    minerals: 150, gas: 0, buildTime: 48, w: 3, h: 3, sight: 6, produces: ['zealot'], power: true,
    tech: ['gatewayWarp']
  },
  roboticsFacility: {
    race: 'protoss', name: 'Robotics Facility', hp: 450, shield: 450, armor: 1, size: 'large',
    minerals: 200, gas: 100, buildTime: 64, w: 4, h: 3, sight: 6, power: true, produces: ['dragoon'],
    requires: ['cyberneticsCore']
  },
  cyberneticsCore: {
    race: 'protoss', name: 'Cybernetics Core', hp: 450, shield: 450, armor: 1, size: 'large',
    minerals: 150, gas: 100, buildTime: 48, w: 3, h: 3, sight: 6, power: true,
    tech: ['zealotSpeed', 'dragoonRange']
  },
  roboticsTechFacility: {
    race: 'protoss', name: 'Robotics Tech Bay', hp: 450, shield: 450, armor: 1, size: 'large',
    minerals: 150, gas: 100, buildTime: 48, w: 3, h: 3, sight: 6, power: true,
    tech: ['dragoon'], unlocks: ['dragoon'], addOnTo: 'roboticsFacility',
    requires: ['cyberneticsCore']
  },
  templarArchives: {
    race: 'protoss', name: 'Templar Archives', hp: 450, shield: 450, armor: 1, size: 'large',
    minerals: 150, gas: 200, buildTime: 64, w: 3, h: 3, sight: 6, power: true,
    tech: ['psionicStorm'], unlocks: ['highTemplar']
  },
  darkTemplar: { race: 'protoss', name: 'Dark Templar Research', techOnly: true, minerals: 100, gas: 100, buildTime: 34, addOnTo: 'templarArchives', w: 0, h: 0, sight: 0 },
  council: {
    race: 'protoss', name: 'Council of the Templar', hp: 450, shield: 450, armor: 1, size: 'large',
    minerals: 150, gas: 100, buildTime: 48, w: 3, h: 3, sight: 6, power: true,
    produces: ['highTemplar', 'darkTemplar'], requires: ['templarArchives', 'darkTemplar']
  },
  stargate: {
    race: 'protoss', name: 'Stargate', hp: 450, shield: 450, armor: 1, size: 'large',
    minerals: 150, gas: 150, buildTime: 64, w: 4, h: 3, sight: 6, power: true, produces: ['carrier'],
    requires: ['cyberneticsCore']
  },
  fleetBeacon: {
    race: 'protoss', name: 'Fleet Beacon', hp: 450, shield: 450, addOnTo: 'stargate', armor: 1, size: 'large',
    minerals: 150, gas: 100, buildTime: 48, w: 3, h: 3, sight: 6, power: true, unlocks: ['carrier']
  },
  photonCannon: {
    race: 'protoss', name: 'Photon Cannon', hp: 300, shield: 300, armor: 1, size: 'large',
    minerals: 150, gas: 0, buildTime: 32, w: 2, h: 2, sight: 8, power: true,
    defense: { damage: 18, cooldown: 1.2, range: 7, attackType: 'explosive', targets: 'both' }
  },
  forge: {
    race: 'protoss', name: 'Forge', hp: 450, shield: 450, armor: 1, size: 'large',
    minerals: 150, gas: 0, buildTime: 32, w: 2, h: 2, sight: 5, power: true,
    tech: ['protossGroundWeapons1', 'protossGroundPlating1']
  },
  gatewayWarp: { race: 'protoss', name: 'Warp Gate', techOnly: true, minerals: 150, gas: 150, buildTime: 48, addOnTo: 'gateway', w: 0, h: 0, sight: 0 }
};

// Simplified tech research: key -> {minerals, gas, time, at: buildingId}
export const TECHS = {
  terranInfantryWeapons1: { name: 'Infantry Weapons 1', minerals: 100, gas: 100, time: 32, at: 'engineeringBay', affects: 'terranInfantryWeapons', level: 1 },
  terranInfantryWeapons2: { name: 'Infantry Weapons 2', minerals: 175, gas: 175, time: 38, at: 'engineeringBay', affects: 'terranInfantryWeapons', level: 2, requiresTech: 'terranInfantryWeapons1' },
  terranInfantryWeapons3: { name: 'Infantry Weapons 3', minerals: 250, gas: 250, time: 44, at: 'engineeringBay', affects: 'terranInfantryWeapons', level: 3, requiresTech: 'terranInfantryWeapons2' },
  terranInfantryArmor1: { name: 'Infantry Armor 1', minerals: 100, gas: 100, time: 32, at: 'engineeringBay', affects: 'terranInfantryArmor', level: 1 },
  terranInfantryArmor2: { name: 'Infantry Armor 2', minerals: 175, gas: 175, time: 38, at: 'engineeringBay', affects: 'terranInfantryArmor', level: 2, requiresTech: 'terranInfantryArmor1' },
  terranInfantryArmor3: { name: 'Infantry Armor 3', minerals: 250, gas: 250, time: 44, at: 'engineeringBay', affects: 'terranInfantryArmor', level: 3, requiresTech: 'terranInfantryArmor2' },
  vehiclePlating1: { name: 'Vehicle Plating', minerals: 150, gas: 150, time: 36, at: 'machineShop', affects: 'vehiclePlating', level: 1 },
  radar: { name: 'Scanner Sweep', minerals: 200, gas: 200, time: 48, at: 'scienceFacility', ability: true },
  zergMeleeAttacks1: { name: 'Metabolic Boost', minerals: 100, gas: 100, time: 32, at: 'evolutionChamber', affects: 'zergMeleeAttacks', level: 1 },
  zergCarapace1: { name: 'Piercing Claw', minerals: 100, gas: 100, time: 32, at: 'evolutionChamber', affects: 'zergArmor', level: 1 },
  lurkerEgg: { name: 'Lurker Aspect', minerals: 50, gas: 100, time: 34, at: 'hydraliskDen', unlocks: 'lurker' },
  chitinousPlating: { name: 'Chitinous Plating', minerals: 100, gas: 100, time: 32, at: 'ultraliskCavern', unlocks: 'ultralisk' },
  greaterSpire: { name: 'Greater Spire', minerals: 150, gas: 150, time: 50, at: 'spire', unlocks: 'mutalisk' },
  gatewayWarp: { name: 'Warp Gate', minerals: 150, gas: 150, time: 48, at: 'cyberneticsCore' },
  zealotSpeed: { name: 'Leg Enhancements', minerals: 100, gas: 100, time: 32, at: 'cyberneticsCore', affects: 'protossGroundSpeed', level: 1 },
  dragoonRange: { name: 'Particle Bay', minerals: 100, gas: 100, time: 32, at: 'cyberneticsCore' },
  roboticsFacilityTech: { name: 'Hi-Senal Tracking', minerals: 100, gas: 100, time: 32, at: 'roboticsTechFacility', unlocks: 'dragoon' },
  psionicStorm: { name: 'Psionic Storm', minerals: 150, gas: 150, time: 48, at: 'templarArchives', ability: true },
  darkTemplar: { name: 'Dark Templar', minerals: 100, gas: 100, time: 34, at: 'templarArchives', unlocks: 'darkTemplar' },
  controlTower: { name: 'Control Tower', minerals: 100, gas: 50, time: 32, at: 'starport', unlocks: 'battlecruiser' },
  caduceusReactor: { name: 'CAD. Reactor', minerals: 100, gas: 100, time: 32, at: 'scienceFacility', unlocks: 'ghost' },
  combatMedics: { name: 'Combat Medics', minerals: 100, gas: 100, time: 30, at: 'academy', unlocks: 'medic' },
  fleetBeacon: { name: 'Fleet Beacon', minerals: 150, gas: 100, time: 48, at: 'stargate', unlocks: 'carrier' },
  lair: { name: 'Lair', minerals: 150, gas: 100, time: 56, at: 'hatchery', morph: 'lair' },
  hive: { name: 'Hive', minerals: 200, gas: 150, time: 80, at: 'lair', morph: 'hive' },
  protossGroundWeapons1: { name: 'Singularity Charge', minerals: 100, gas: 100, time: 32, at: 'forge', affects: 'protossWeapons', level: 1 },
  protossGroundPlating1: { name: 'Personal Cloaking Field', minerals: 100, gas: 100, time: 32, at: 'forge', affects: 'protossArmor', level: 1 }
};

export const RACES = {
  terran: { id: 'terran', subtitle: 'Sturdy defenses, ion storms of lead, drop-pod improvisation.' },
  zerg: { id: 'zerg', subtitle: 'Overwhelming numbers, creep adaptation, relentless hunger.' },
  protoss: { id: 'protoss', subtitle: 'Psionic precision, shielded warriors, ancient fury.' }
};

export const RACE_INFO = {
  terran: {
    id: 'terran', name: 'Terran', primary: 'commandCenter', workers: ['scv'],
    accent: 0x4ea1ff, buildingOrder: ['supplyDepot', 'barracks', 'refinery', 'academy', 'factory', 'missileTurret', 'bunker', 'starport', 'machineShop', 'engineeringBay']
  },
  zerg: {
    id: 'zerg', name: 'Zerg', primary: 'hatchery', workers: ['drone'],
    accent: 0xff7b2e, buildingOrder: ['evolutionChamber', 'spawningPool', 'extractor', 'hydraliskDen', 'spire', 'sporeColony']
  },
  protoss: {
    id: 'protoss', name: 'Protoss', primary: 'nexus', workers: ['probe'],
    accent: 0xa78bfa, buildingOrder: ['pylon', 'gateway', 'assimilator', 'forge', 'cyberneticsCore', 'roboticsFacility', 'roboticsTechFacility', 'templarArchives', 'council', 'photonCannon', 'stargate', 'fleetBeacon']
  }
};
