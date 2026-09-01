// Persistent campaign ladder for SCC2: 8 escalating missions + between-mission
// upgrades bought with earned credits. State persists in localStorage.
const KEY = 'starfr…n.v1';

export const MISSIONS = [
  { n: 1, name: 'CLEANUP OP', enemy: 'zerg', difficulty: 'easy', bonusMinerals: 200, brief: 'Scattered Zerg remains. Establish a base and purge the area.' },
  { n: 2, name: 'FIRST CONTACT', enemy: 'zerg', difficulty: 'normal', bonusMinerals: 100, brief: 'A coordinated Zerg force has landed. Hold the line.' },
  { n: 3, name: 'FIRE AND FURY', enemy: 'terran', difficulty: 'normal', bonusMinerals: 50, brief: 'Renegade Terran warlord contests the sector.' },
  { n: 4, name: 'PSI STORM', enemy: 'protoss', difficulty: 'normal', bonusMinerals: 0, brief: 'The Templar have arrived. Their shields are strong; overwhelm them.' },
  { n: 5, name: 'SWARM', enemy: 'zerg', difficulty: 'hard', bonusMinerals: 0, brief: 'A full brood nest. Survive 4 minutes of constant assault, then break them.', mods: { holdTime: 240 } },
  { n: 6, name: 'IRON WALL', enemy: 'terran', difficulty: 'hard', bonusMinerals: 0, brief: 'Heavily fortified Terran position with a battlecruiser champion. Bring siege.', mods: { boss: 'battlecruiser' } },
  { n: 7, name: 'JUDGEMENT', enemy: 'protoss', difficulty: 'hard', bonusMinerals: 0, brief: 'A Fleet assault led by a champion carrier. Their carriers will blot out the sun.', mods: { boss: 'carrier' } },
  { n: 8, name: 'FINAL RECKONING', enemy: 'zerg', difficulty: 'hard', bonusMinerals: 0, brief: 'The Overmind itself focuses on you. Hold 3 minutes, then slay the Ultralisk champion.', mods: { holdTime: 180, boss: 'ultralisk' } },
  { n: 9, name: 'GHOST PROTOCOL', enemy: 'terran', difficulty: 'hard', bonusMinerals: 100, brief: 'Ghost operatives and dropships hit your supply lines. Hold 3 minutes and purge the sector.', mods: { holdTime: 180, boss: 'ghost' } },
  { n: 10, name: 'OVERMIND ASCENDANT', enemy: 'zerg', difficulty: 'hard', bonusMinerals: 0, brief: 'The final brood: an Ultralisk champion backed by a sustained swarm assault.', mods: { holdTime: 240, boss: 'ultralisk' } }
];

export const UPGRADES = [
  { id: 'w1', name: 'INF WEAPONS +1', cost: 300, effect: 'weapons', val: 1 },
  { id: 'a1', name: 'PLATING +1', cost: 300, effect: 'armor', val: 1 },
  { id: 'w2', name: 'INF WEAPONS +2', cost: 500, effect: 'weapons', val: 2, needs: 'w1' },
  { id: 'a2', name: 'PLATING +2', cost: 500, effect: 'armor', val: 2, needs: 'a1' },
  { id: 'tr1', name: 'START +400 MIN', cost: 250, effect: 'startMinerals', val: 400 },
  { id: 'tr2', name: 'START +200 GAS', cost: 250, effect: 'startGas', val: 200 },
  { id: 'ts1', name: 'BUILD SPEED +15%', cost: 400, effect: 'buildSpeed', val: 0.15 },
  { id: 'sc1', name: 'FREE SCOUT DRONE', cost: 200, effect: 'freeScout', val: 1 },
  { id: 'pk_flag', name: 'VETERAN BANNERS', cost: 600, effect: 'perk', val: 1 },
  { id: 'pk_chrome', name: 'CHROME PLATING', cost: 900, effect: 'perk', val: 1 },
  { id: 'pk_skins', name: 'OBSIDIAN SKINS', cost: 1200, effect: 'perk', val: 1 }
];

// Between-mission maintenance cost so credits stay scarce (charged at mission launch).
export const UPKEEP = 100;

export function loadCampaign() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) { /* fallthrough */ }
  return { mission: 1, credits: 500, owned: {} };
}

export function saveCampaign(c) {
  try { localStorage.setItem(KEY, JSON.stringify(c)); } catch (e) { /* private mode */ }
}

export function buyUpgrade(c, id) {
  const u = UPGRADES.find(x => x.id === id);
  if (!u) return false;
  if (c.owned[id]) return false;
  if (u.needs && !c.owned[u.needs]) return false;
  if (c.credits < u.cost) return false;
  c.credits -= u.cost;
  c.owned[id] = true;
  saveCampaign(c);
  return true;
}

// Apply owned upgrades to player[0] state at battle start
export function applyUpgradesToPlayer(c, player, UNITS) {
  player.upgrades = player.upgrades || { weapons: 0, armor: 0 };
  let extraWorkers = 0, freeScout = null;
  for (const u of UPGRADES) {
    if (!c.owned[u.id]) continue;
    if (u.effect === 'weapons') player.upgrades.weapons = Math.max(player.upgrades.weapons, u.val);
    if (u.effect === 'armor') player.upgrades.armor = Math.max(player.upgrades.armor, u.val);
    if (u.effect === 'startMinerals') player.minerals += u.val;
    if (u.effect === 'startGas') player.gas += u.val;
    if (u.effect === 'buildSpeed') player.buildSpeedBonus = (player.buildSpeedBonus || 0) + u.val;
    if (u.effect === 'freeScout') freeScout = true;
  }
  return { extraWorkers, freeScout };
}

export function missionFor(c) {
  return MISSIONS[Math.min(c.mission, MISSIONS.length) - 1];
}
