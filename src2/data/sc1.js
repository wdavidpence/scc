// SC2-REBUILT — original sci-fi RTS inspired by classic RTS games
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
  rigger: {
    race: 'terran', name: 'Rigger', hp: 60, armor: 0, size: 'small',
    speed: 0.62, targets: 'ground', attackType: 'concussive', damage: 5, cooldown: 1.0, range: 0.6,
    supply: 1, minerals: 50, gas: 0, buildTime: 12, build: 'commandCenter',
    sight: 8, worker: true, lift: false, icon: 'rigger'
  },
  marine: {
    race: 'terran', name: 'Marine', hp: 60, armor: 0, size: 'small',
    speed: 0.66, targets: 'ground', attackType: 'concussive', damage: 6, cooldown: 0.86, range: 4,
    supply: 1, minerals: 50, gas: 10, buildTime: 18, build: 'barracks',
    sight: 8, canStim: true, icon: 'marine'
  },
  incinerator: {
    race: 'terran', name: 'Incinerator', hp: 80, armor: 0, size: 'small',
    speed: 0.62, targets: 'ground', attackType: 'concussive', damage: 8, cooldown: 0.96, range: 2.4,
    splash: { radius: 1.2, falloff: false },
    supply: 1, minerals: 50, gas: 30, buildTime: 21, build: 'academy',
    sight: 8, icon: 'incinerator'
  },
  tank: {
    race: 'terran', name: 'Siebreaker', hp: 150, armor: 1, size: 'large',
    speed: 0.36, targets: 'ground', attackType: 'explosive', damage: 30, cooldown: 2.6, range: 8,
    splash: { radius: 1.5 },
    supply: 2, minerals: 150, gas: 100, buildTime: 32, build: 'factory',
    sight: 9, siege: { range: 12, cooldown: 3.2, damage: 50, splash: 2.5, switchTime: 1.1 },
    icon: 'tank'
  },
  duster: {
    race: 'terran', name: 'Duster', hp: 70, armor: 0, size: 'small',
    speed: 1.44, targets: 'ground', attackType: 'explosive', damage: 12, cooldown: 0.86, range: 5.4,
    supply: 1, minerals: 75, gas: 25, buildTime: 22, build: 'factory',
    sight: 11, spiderMine: true, patrol: true, icon: 'duster'
  },
  ballista: {
    race: 'terran', name: 'Ballista', hp: 120, armor: 1, size: 'large',
    speed: 0.66, targets: 'both', attackType: 'explosive', damage: 20, cooldown: 1.2, range: 6,
    airDamage: 24,
    supply: 2, minerals: 150, gas: 75, buildTime: 38, build: 'machineShop',
    sight: 10, icon: 'ballista'
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
    sight: 12, icon: 'battlecruiser'
  },
  ghost: {    race: 'terran', name: 'Ghost', hp: 45, armor: 0, size: 'small',
    speed: 0.66, targets: 'both', attackType: 'normal', damage: 10, cooldown: 0.92, range: 6,
    supply: 1, minerals: 25, gas: 75, buildTime: 25, build: 'academy', tech: 'vitaReactor',
    sight: 11, detect: true, icon: 'ghost'
  },
  medic: {
    race: 'terran', name: 'Medic', hp: 50, armor: 0, size: 'small',
    speed: 0.66, targets: 'ground', attackType: 'normal', damage: 4, cooldown: 1.2, range: 4,
    supply: 1, minerals: 50, gas: 75, buildTime: 23, build: 'academy', tech: 'combatMedics',
    sight: 9, heal: { amount: 4, interval: 0.5, range: 3.2 }, icon: 'medic'
  },
  drone: {
    race: 'terran', name: 'Sentinel Drone', hp: 90, armor: 0, size: 'small', flying: true,
    speed: 1.3, targets: 'ground', attackType: 'ignore', damage: 0, cooldown: 1, range: 0,
    supply: 1, minerals: 100, gas: 50, buildTime: 20, build: 'starport',
    sight: 12, detect: true, icon: 'drone', weaponless: true
  },
  dropship: {
    race: 'terran', name: 'Dropship', hp: 200, armor: 1, size: 'large', flying: true,
    speed: 0.96, targets: 'ground', attackType: 'ignore', damage: 0, cooldown: 1, range: 0,
    supply: 2, minerals: 150, gas: 100, buildTime: 40, build: 'starport',
    sight: 10, transport: 8, icon: 'dropship', weaponless: true
  },

  // ---------------- SKARN ----------------
  skarling: {
    race: 'skarn', name: 'Skarling', hp: 40, armor: 0, size: 'small',
    speed: 0.66, targets: 'ground', attackType: 'concussive', damage: 4, cooldown: 1.0, range: 0.6,
    supply: 1, minerals: 50, gas: 0, buildTime: 12, build: 'broodNest',
    sight: 8, worker: true, icon: 'skarling'
  },
  skarnling: {
    race: 'skarn', name: 'Skarnling', hp: 35, armor: 0, size: 'small',
    speed: 0.96, targets: 'ground', attackType: 'concussive', damage: 5, cooldown: 0.5, range: 0.8,
    supply: 0.5, minerals: 25, gas: 0, buildTime: 8, build: 'clawPit', trainCount: 2,
    sight: 8, icon: 'skarnling'
  },
  razorspine: {
    race: 'skarn', name: 'Razorspine', hp: 80, armor: 0, size: 'medium',
    speed: 0.72, targets: 'both', attackType: 'normal', damage: 10, cooldown: 0.96, range: 5.4,
    supply: 1, minerals: 75, gas: 25, buildTime: 24, build: 'spineWarren',
    sight: 9, icon: 'razor'
  },
  vexwing: {
    race: 'skarn', name: 'Vexwing', hp: 150, armor: 0, size: 'medium', flying: true,
    speed: 1.44, targets: 'both', attackType: 'normal', damage: 9, cooldown: 1.0, range: 1.4,
    supply: 2, minerals: 100, gas: 50, buildTime: 24, build: 'aerie',
    sight: 10, icon: 'vex'
  },
  tremorclaw: {
    race: 'skarn', name: 'Tremorclaw', hp: 400, armor: 1, size: 'large',
    speed: 0.72, targets: 'ground', attackType: 'explosive', damage: 20, cooldown: 1.0, range: 1.2,
    supply: 4, minerals: 150, gas: 150, buildTime: 48, build: 'tremorCavern', tech: 'chitinousPlating',
    sight: 10, icon: 'tremor'
  },
  skywarden: {
    race: 'skarn', name: 'Skywarden', hp: 200, armor: 1, size: 'large', flying: true,
    speed: 0.48, targets: 'ground', attackType: 'ignore', damage: 0, cooldown: 1, range: 0,
    supply: 0, supplyBonus: 8, minerals: 100, gas: 0, buildTime: 18, build: 'broodNest',
    sight: 12, icon: 'skywarden', weaponless: true
  },
  airstinger: {
    race: 'skarn', name: 'Airstinger', hp: 25, armor: 0, size: 'small', flying: true,
    speed: 1.0, targets: 'air', attackType: 'explosive', damage: 22, cooldown: 0.6, range: 0.9,
    splash: { radius: 0.5, self: true },
    supply: 1, minerals: 25, gas: 75, buildTime: 10, build: 'aerie',
    sight: 9, icon: 'airstinger'
  },
  burrower: {
    race: 'skarn', name: 'Burrower', hp: 130, armor: 1, size: 'large',
    speed: 0.62, targets: 'ground', attackType: 'explosive', damage: 30, cooldown: 2.0, range: 6,
    supply: 2, minerals: 50, gas: 100, buildTime: 28, build: 'spineWarren', tech: 'burrowChrysalis',
    burrow: true, sight: 8, icon: 'burrower'
  },

  // ---------------- AURAXIS ----------------
  artificer: {
    race: 'auraxis', name: 'Artificer', hp: 20, shield: 20, armor: 0, size: 'small',
    speed: 0.66, targets: 'ground', attackType: 'explosive', damage: 5, cooldown: 1.0, range: 0.6,
    supply: 1, minerals: 50, gas: 0, buildTime: 12, build: 'aegis',
    sight: 8, worker: true, icon: 'artificer'
  },
  bladeguard: {
    race: 'auraxis', name: 'Bladeguard', hp: 60, shield: 60, armor: 1, size: 'medium',
    speed: 0.84, targets: 'ground', attackType: 'normal', damage: 6, cooldown: 0.64, range: 0.8,
    supply: 2, minerals: 100, gas: 0, buildTime: 24, build: 'portal',
    sight: 8, icon: 'bladeguard'
  },
  sentinel: {
    race: 'auraxis', name: 'Sentinel', hp: 100, shield: 100, armor: 1, size: 'large',
    speed: 0.62, targets: 'ground', attackType: 'explosive', damage: 20, cooldown: 1.44, range: 5.4,
    supply: 2, minerals: 125, gas: 50, buildTime: 32, build: 'portal', tech: 'fabricatorCalibration',
    sight: 8, icon: 'sentinel'
  },
  stormcaller: {
    race: 'auraxis', name: 'Stormcaller', hp: 40, shield: 40, armor: 0, size: 'small',
    speed: 0.62, targets: 'both', attackType: 'normal', damage: 6, cooldown: 1.0, range: 5.4,
    supply: 2, minerals: 50, gas: 150, buildTime: 32, build: 'convocation',
    sight: 10, psiStorm: { damage: 4, cooldown: 0.5, radius: 2.0, duration: 4.0, energy: 75 },
    energy: 100, castAbility: 'storm', icon: 'caller'
  },
  nightblade: {
    race: 'auraxis', name: 'Nightblade', hp: 50, shield: 50, armor: 1, size: 'medium',
    speed: 0.84, targets: 'ground', attackType: 'normal', damage: 20, cooldown: 1.2, range: 0.8,
    supply: 2, minerals: 125, gas: 125, buildTime: 40, build: 'convocation', tech: 'nightblade',
    sight: 10, cloak: true, icon: 'nblade'
  },
  radiant: {
    race: 'auraxis', name: 'Radiant', hp: 150, shield: 150, armor: 0, size: 'large',
    speed: 0.66, targets: 'both', attackType: 'normal', damage: 10, cooldown: 0.8, range: 5.4,
    supply: 4, minerals: 0, gas: 0, buildTime: 0, build: null, summon: true,
    sight: 8, icon: 'radiant'
  },
  ark: {
    race: 'auraxis', name: 'Ark', hp: 300, shield: 300, armor: 3, size: 'large', flying: true,
    speed: 0.48, targets: 'ground', attackType: 'ignore', damage: 5, cooldown: 0.9, range: 8, attacksPerVolley: 4,
    supply: 6, minerals: 300, gas: 200, buildTime: 72, build: 'skyPortal', tech: 'skyAnchor',
    sight: 11, interceptor: true, icon: 'ark'
  },
  voidlance: {
    race: 'auraxis', name: 'Voidlance', hp: 80, shield: 80, armor: 1, size: 'medium', flying: true,
    speed: 0.85, targets: 'air', attackType: 'normal', damage: 5, cooldown: 0.9, range: 7,
    supply: 2, minerals: 150, gas: 150, buildTime: 48, build: 'skyPortal',
    energy: 100, castAbility: 'maelstrom', sight: 10, icon: 'voidlance'
  },
  umbral: {
    race: 'auraxis', name: 'Umbral', hp: 100, shield: 100, armor: 0, size: 'medium',
    speed: 0.7, targets: 'both', attackType: 'normal', damage: 8, cooldown: 0.9, range: 6,
    supply: 4, minerals: 0, gas: 0, buildTime: 0, build: null, summon: true,
    energy: 150, feedback: true, castAbility: 'maelstrom', sight: 9, icon: 'umbral'
  }
};

export const SWARM_UNITS = {
  sporecaster: {
    race: 'skarn', name: 'Sporecaster', hp: 150, armor: 2, size: 'large', flying: true,
    speed: 0.58, targets: 'ground', attackType: 'concussive', damage: 20, cooldown: 1.6, range: 9,
    supply: 3, minerals: 0, gas: 0, buildTime: 0, build: null, morphFrom: 'vexwing',
    sight: 12, icon: 'sporecaster'
  },
  corroder: {
    race: 'skarn', name: 'Corroder', hp: 150, armor: 2, size: 'large', flying: true,
    speed: 0.58, targets: 'both', attackType: 'normal', damage: 6, cooldown: 1.4, range: 8,
    supply: 3, minerals: 0, gas: 0, buildTime: 0, build: null, morphFrom: 'vexwing',
    energy: 100, castAbility: 'cloud', sight: 11, icon: 'corroder'
  }
};
Object.assign(UNITS, SWARM_UNITS);

export const BUILDINGS = {
  // ---------------- TERRAN ----------------
  commandCenter: {
    race: 'terran', name: 'Command Center', hp: 500, armor: 1, size: 'large',
    minerals: 400, gas: 0, buildTime: 48, w: 5, h: 4, sight: 9,
    supply: 10, produces: ['rigger'], rally: true, primary: true
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
    minerals: 150, gas: 0, buildTime: 40, w: 4, h: 3, sight: 6, produces: ['marine', 'incinerator']
  },
  factory: {
    race: 'terran', name: 'Factory', hp: 300, armor: 1, size: 'large',
    minerals: 200, gas: 100, buildTime: 64, w: 4, h: 3, sight: 6, produces: ['tank', 'duster', 'ballista'],
    requires: ['barracks', 'academy']
  },
  machineShop: {
    race: 'terran', name: 'Machine Shop', hp: 300, armor: 1, size: 'large',
    minerals: 50, gas: 50, buildTime: 32, w: 2, h: 2, sight: 4, addOnTo: 'factory',
    unlocks: ['ballista']
  },
  starport: {
    race: 'terran', name: 'Starport', hp: 300, armor: 1, size: 'large',
    minerals: 150, gas: 100, buildTime: 64, w: 4, h: 3, sight: 6, produces: ['wraith', 'dropship', 'drone'],
    requires: ['factory']
  },
  controlTower: {
    race: 'terran', name: 'Control Tower', hp: 300, armor: 1, size: 'large',
    minerals: 100, gas: 50, buildTime: 32, w: 2, h: 2, sight: 4, addOnTo: 'starport',
    unlocks: ['battlecruiser']
  },
  academy: {
    race: 'terran', name: 'Academy', hp: 300, armor: 1, size: 'large',
    minerals: 100, gas: 50, buildTime: 32, w: 3, h: 3, sight: 6, produces: ['incinerator', 'ghost', 'medic'],
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
  vitaReactor: {
    race: 'terran', name: 'Vita Reactor', hp: 300, armor: 1, addOnTo: 'scienceFacility',
    minerals: 0, gas: 0, buildTime: 0, w: 0, h: 0, sight: 0, unlocks: ['ghost']
  },
  bunker: {
    race: 'terran', name: 'Bunker', hp: 350, armor: 1, size: 'large',
    minerals: 100, gas: 0, buildTime: 26, w: 2, h: 2, sight: 7, rally: true,
    garrison: 4, garrisonDefense: { damage: 6, cooldown: 0.9, range: 6, attackType: 'normal' }
  },

  // ---------------- SKARN ----------------
  broodNest: {
    race: 'skarn', name: 'Brood Nest', hp: 300, armor: 1, size: 'large',
    minerals: 300, gas: 0, buildTime: 0, growFromDrone: true, w: 4, h: 4, sight: 9,
    produces: ['skarling', 'skywarden'], blightRadius: 9, primary: true, blightGrowth: true
  },
  geneForge: {
    race: 'skarn', name: 'Gene Foundry', hp: 300, armor: 1, size: 'large',
    minerals: 100, gas: 100, blight: true, buildTime: 32, w: 3, h: 3, sight: 5,
    tech: ['skarnMeleeAttacks1', 'skarnCarapace1']
  },
  blightNode: {
    race: 'skarn', name: 'Blight Node', hp: 300, armor: 1, size: 'large',
    minerals: 50, gas: 0, blight: true, buildTime: 24, w: 2, h: 2, sight: 5,
    transforms: ['hive']
  },
  clawPit: {
    race: 'skarn', name: 'Claw Pit', hp: 300, armor: 1, size: 'large',
    minerals: 200, gas: 0, blight: true, buildTime: 48, w: 3, h: 3, sight: 6, produces: ['skarnling']
  },
  spineWarren: {
    race: 'skarn', name: 'Spine Warren', hp: 300, armor: 1, size: 'large',
    minerals: 100, gas: 50, blight: true, buildTime: 40, w: 3, h: 3, sight: 6, produces: ['razorspine', 'burrower'],
    tech: ['burrowChrysalis']
  },
  aerie: {
    race: 'skarn', name: 'Aerie', hp: 300, armor: 1, size: 'large',
    minerals: 200, gas: 150, blight: true, buildTime: 64, w: 3, h: 3, sight: 8, produces: ['vexwing', 'airstinger'],
    tech: ['greaterAerie']
  },
  hive: {
    race: 'skarn', name: 'Hive', hp: 400, armor: 1, size: 'large',
    minerals: 300, gas: 200, blight: true, buildTime: 80, w: 4, h: 4, sight: 9,
    produces: ['tremorclaw'], techTree: true, transformFrom: 'deepWarren'
  },
  deepWarren: {
    race: 'skarn', name: 'Deep Warren', hp: 400, armor: 1, size: 'large',
    minerals: 150, gas: 100, blight: true, buildTime: 56, w: 4, h: 4, sight: 9,
    transformFrom: 'broodNest', unlocks: ['spineWarren', 'aerie']
  },
  tremorCavern: {
    race: 'skarn', name: 'Tremor Cavern', hp: 300, armor: 1, size: 'large',
    minerals: 150, gas: 200, blight: true, buildTime: 40, w: 3, h: 3, sight: 6, produces: ['tremorclaw'],
    requires: ['deepWarren']
  },
  chitinousPlating: {
    race: 'skarn', name: 'Chitinous Plating', hp: 300, addOnTo: null, minerals: 0, gas: 0, buildTime: 0, w: 0, h: 0, sight: 0, techOnly: true, requires: ['deepWarren']
  },
  stingerColony: {
    race: 'skarn', name: 'Stinger Colony', hp: 350, armor: 1, size: 'large',
    minerals: 100, gas: 50, blight: true, buildTime: 24, w: 2, h: 2, sight: 9,
    defense: { damage: 9, cooldown: 0.96, range: 8, attackType: 'normal', targets: 'air' }, detect: true,
    transformFrom: 'blightNode'
  },
  gasSiphon: {
    race: 'skarn', name: 'Gas Siphon', hp: 300, armor: 1, size: 'large',
    minerals: 75, gas: 0, blight: true, buildTime: 24, w: 4, h: 3, sight: 5, onGeyser: true, gasCap: 8
  },
  greaterAerie: { race: 'skarn', name: 'Greater Aerie', hp: 300, addOnTo: null, minerals: 0, gas: 0, buildTime: 0, w: 0, h: 0, sight: 0, techOnly: true, requires: ['deepWarren'] },
  burrowChrysalisZ: { race: 'skarn', name: 'Burrower Chrysalis', techOnly: true, addOnTo: null, minerals: 50, gas: 100, buildTime: 34, w: 0, h: 0, sight: 0 },

  // ---------------- AURAXIS ----------------
  aegis: {
    race: 'auraxis', name: 'Aegis', hp: 600, shield: 600, armor: 1, size: 'large',
    minerals: 400, gas: 0, buildTime: 0, w: 5, h: 4, sight: 10,
    supply: 15, produces: ['artificer'], primary: true, warps: true
  },
  conduit: {
    race: 'auraxis', name: 'Conduit', hp: 300, shield: 300, armor: 1, size: 'large',
    minerals: 100, gas: 0, buildTime: 18, w: 2, h: 2, sight: 6, supply: 8, power: true
  },
  essenceTap: {
    race: 'auraxis', name: 'Essence Tap', hp: 600, shield: 600, armor: 1, size: 'large',
    minerals: 75, gas: 0, buildTime: 24, w: 4, h: 3, sight: 5, onGeyser: true, gasCap: 8
  },
  portal: {
    race: 'auraxis', name: 'Portal', hp: 450, shield: 450, armor: 1, size: 'large',
    minerals: 150, gas: 0, buildTime: 48, w: 3, h: 3, sight: 6, produces: ['bladeguard'], power: true,
    tech: ['portalPhase']
  },
  fabricator: {
    race: 'auraxis', name: 'Fabricator Bay', hp: 450, shield: 450, armor: 1, size: 'large',
    minerals: 200, gas: 100, buildTime: 64, w: 4, h: 3, sight: 6, power: true, produces: ['sentinel'],
    requires: ['synapseCore']
  },
  synapseCore: {
    race: 'auraxis', name: 'Synapse Core', hp: 450, shield: 450, armor: 1, size: 'large',
    minerals: 150, gas: 100, buildTime: 48, w: 3, h: 3, sight: 6, power: true,
    tech: ['bladeguardSpeed', 'sentinelRange']
  },
  runeworks: {
    race: 'auraxis', name: 'Runeworks', hp: 450, shield: 450, armor: 1, size: 'large',
    minerals: 150, gas: 100, buildTime: 48, w: 3, h: 3, sight: 6, power: true,
    tech: ['sentinel'], unlocks: ['sentinel'], addOnTo: 'fabricator',
    requires: ['synapseCore']
  },
  psiVault: {
    race: 'auraxis', name: 'Psi Vault', hp: 450, shield: 450, armor: 1, size: 'large',
    minerals: 150, gas: 200, buildTime: 64, w: 3, h: 3, sight: 6, power: true,
    tech: ['psionicStorm'], unlocks: ['stormcaller']
  },
  nightblade: { race: 'auraxis', name: 'Nightblade Veil', techOnly: true, minerals: 100, gas: 100, buildTime: 34, addOnTo: 'psiVault', w: 0, h: 0, sight: 0 },
  convocation: {
    race: 'auraxis', name: 'The Convocation', hp: 450, shield: 450, armor: 1, size: 'large',
    minerals: 150, gas: 100, buildTime: 48, w: 3, h: 3, sight: 6, power: true,
    produces: ['stormcaller', 'nightblade'], tech: ['umbralConvergence'], requires: ['psiVault', 'nightblade']
  },
  skyPortal: {
    race: 'auraxis', name: 'Sky Portal', hp: 450, shield: 450, armor: 1, size: 'large',
    minerals: 150, gas: 150, buildTime: 64, w: 4, h: 3, sight: 6, power: true, produces: ['ark', 'voidlance'],
    requires: ['synapseCore']
  },
  skyAnchor: {
    race: 'auraxis', name: 'Sky Anchor', hp: 450, shield: 450, addOnTo: 'skyPortal', armor: 1, size: 'large',
    minerals: 150, gas: 100, buildTime: 48, w: 3, h: 3, sight: 6, power: true, unlocks: ['ark']
  },
  lanceTurret: {
    race: 'auraxis', name: 'Lance Turret', hp: 300, shield: 300, armor: 1, size: 'large',
    minerals: 150, gas: 0, buildTime: 32, w: 2, h: 2, sight: 8, power: true,
    defense: { damage: 18, cooldown: 1.2, range: 7, attackType: 'explosive', targets: 'both' }
  },
  forge: {
    race: 'auraxis', name: 'Foundry', hp: 450, shield: 450, armor: 1, size: 'large',
    minerals: 150, gas: 0, buildTime: 32, w: 2, h: 2, sight: 5, power: true,
    tech: ['auraxisGroundWeapons1', 'auraxisGroundPlating1']
  },
  portalPhase: { race: 'auraxis', name: 'Phase Gate', techOnly: true, minerals: 150, gas: 150, buildTime: 48, addOnTo: 'portal', w: 0, h: 0, sight: 0 }
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
  skarnMeleeAttacks1: { name: 'Frenzy Glands', minerals: 100, gas: 100, time: 32, at: 'geneForge', affects: 'skarnMeleeAttacks', level: 1 },
  skarnCarapace1: { name: 'Rending Fang', minerals: 100, gas: 100, time: 32, at: 'geneForge', affects: 'skarnArmor', level: 1 },
  burrowChrysalis: { name: 'Burrower Chrysalis', minerals: 50, gas: 100, time: 34, at: 'spineWarren', unlocks: 'burrower' },
  chitinousPlating: { name: 'Chitinous Plating', minerals: 100, gas: 100, time: 32, at: 'tremorCavern', unlocks: 'tremorclaw' },
  greaterAerie: { name: 'Greater Aerie', minerals: 150, gas: 150, time: 50, at: 'aerie', unlocks: 'vexwing' },
  portalPhase: { name: 'Phase Gate', minerals: 150, gas: 150, time: 48, at: 'synapseCore' },
  bladeguardSpeed: { name: 'Stride Matrix', minerals: 100, gas: 100, time: 32, at: 'synapseCore', affects: 'auraxisGroundSpeed', level: 1 },
  sentinelRange: { name: 'Arc Emitter', minerals: 100, gas: 100, time: 32, at: 'synapseCore' },
  fabricatorCalibration: { name: 'Phase Calibration', minerals: 100, gas: 100, time: 32, at: 'runeworks', unlocks: 'sentinel' },
  psionicStorm: { name: 'Psionic Storm', minerals: 150, gas: 150, time: 48, at: 'psiVault', ability: true },
  nightblade: { name: 'Nightblade', minerals: 100, gas: 100, time: 34, at: 'psiVault', unlocks: 'nightblade' },
  controlTower: { name: 'Control Tower', minerals: 100, gas: 50, time: 32, at: 'starport', unlocks: 'battlecruiser' },
  vitaReactor: { name: 'Vita Reactor', minerals: 100, gas: 100, time: 32, at: 'scienceFacility', unlocks: 'ghost' },
  combatMedics: { name: 'Combat Medics', minerals: 100, gas: 100, time: 30, at: 'academy', unlocks: 'medic' },
  skyAnchor: { name: 'Sky Anchor', minerals: 150, gas: 100, time: 48, at: 'skyPortal', unlocks: 'ark' },
  deepWarren: { name: 'Deep Warren', minerals: 150, gas: 100, time: 56, at: 'broodNest', morph: 'deepWarren' },
  hive: { name: 'Hive', minerals: 200, gas: 150, time: 80, at: 'deepWarren', morph: 'hive' },
  auraxisGroundWeapons1: { name: 'Core Charge', minerals: 100, gas: 100, time: 32, at: 'foundry', affects: 'auraxisWeapons', level: 1 },
  auraxisGroundPlating1: { name: 'Refraction Field', minerals: 100, gas: 100, time: 32, at: 'foundry', affects: 'auraxisArmor', level: 1 },
  umbralConvergence: { name: 'Convergence', minerals: 100, gas: 100, time: 30, at: 'convocation', unlocks: 'umbral' },
  sporecaster: { name: 'Spore Lance', minerals: 50, gas: 100, time: 45, at: 'aerie', unlocks: 'sporecaster', requiresTech: 'greaterAerie' },
  corroder: { name: 'Corroder', minerals: 150, gas: 50, time: 45, at: 'aerie', unlocks: 'corroder', requiresTech: 'greaterAerie' }
};

export const RACES = {
  terran: { id: 'terran', subtitle: 'Sturdy defenses, ion storms of lead, drop-pod improvisation.' },
  skarn: { id: 'skarn', subtitle: 'Overwhelming numbers, blight adaptation, relentless hunger.' },
  auraxis: { id: 'auraxis', subtitle: 'Psionic precision, shielded warriors, ancient fury.' }
};

export const RACE_INFO = {
  terran: {
    id: 'terran', name: 'Terran', primary: 'commandCenter', workers: ['rigger'],
    accent: 0x4ea1ff, buildingOrder: ['supplyDepot', 'barracks', 'refinery', 'academy', 'factory', 'missileTurret', 'bunker', 'starport', 'machineShop', 'engineeringBay']
  },
  skarn: {
    id: 'skarn', name: 'Skarn', primary: 'broodNest', workers: ['skarling'],
    accent: 0xff7b2e, buildingOrder: ['geneForge', 'clawPit', 'gasSiphon', 'spineWarren', 'aerie', 'stingerColony']
  },
  auraxis: {
    id: 'auraxis', name: 'Auraxis', primary: 'aegis', workers: ['artificer'],
    accent: 0xa78bfa, buildingOrder: ['conduit', 'portal', 'essenceTap', 'foundry', 'synapseCore', 'fabricator', 'runeworks', 'psiVault', 'convocation', 'lanceTurret', 'skyPortal', 'skyAnchor']
  }
};
