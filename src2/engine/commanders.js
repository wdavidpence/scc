// AAA: named AI commanders — personality tiers per race/difficulty.
// Each commander layers a distinct doctrine (timings, composition bias,
// flank behavior) on top of the base difficulty profile, and opens the
// mission with a signature radio line so the player knows who they face.

export const COMMANDERS = {
  zerg: [
    { id: 'zerg_rush', name: 'BROOD Mother Kerra', race: 'zerg', tier: 'easy',
      radio: 'The swarm smells fear. Run, little marine.',
      mods: { harassAt: 55, threshold: 1.35, attackGap: 55, compBias: 'zergling' } },
    { id: 'zerg_swarm', name: 'Cerebrate Xel\'Naga-bane', race: 'zerg', tier: 'normal',
      radio: 'Overwhelming force. Overwhelming hunger.',
      mods: { armyCap: 24, threshold: 1.05, attackGap: 40, compBias: 'hydralisk', flankSplit: 0.6 } },
    { id: 'zerg_lurker', name: 'Executor Vurlok', race: 'zerg', tier: 'hard',
      radio: 'The ground beneath you... is already ours.',
      mods: { armyCap: 30, threshold: 0.85, attackGap: 32, compBias: 'lurker', lurkerEarly: true } },
  ],
  terran: [
    { id: 'terran_hold', name: 'Captain "Anvil" Drake', race: 'terran', tier: 'easy',
      radio: 'Dig in. Come out when he does.',
      mods: { threshold: 1.5, attackGap: 70, harassAt: 120, compBias: 'tank' } },
    { id: 'terran_drop', name: 'Warden Steele', race: 'terran', tier: 'normal',
      radio: 'Nobody is safe behind my lines. Including you.',
      mods: { harassAt: 50, threshold: 1.1, attackGap: 45, compBias: 'marine', dropOps: true } },
    { id: 'terran_bomber', name: 'Marshal Vane', race: 'terran', tier: 'hard',
      radio: 'You will die at 40,000 feet. Or 4 meters. I can arrange either.',
      mods: { armyCap: 32, threshold: 0.85, attackGap: 30, compBias: 'wraith', dropOps: true } },
  ],
  protoss: [
    { id: 'proto_steady', name: 'Templar Guard Selin', race: 'protoss', tier: 'easy',
      radio: 'Your destruction will be orderly.',
      mods: { threshold: 1.4, attackGap: 60, compBias: 'zealot' } },
    { id: 'proto_storm', name: 'High Templar Aldric', race: 'protoss', tier: 'normal',
      radio: 'The storm gathers at my command.',
      mods: { threshold: 1.1, attackGap: 45, compBias: 'htemplar' } },
    { id: 'proto_void', name: 'Fleet Executor Miraz', race: 'protoss', tier: 'hard',
      radio: 'En taro Adun. Your sky darkens with my fleet.',
      mods: { armyCap: 30, threshold: 0.8, attackGap: 32, compBias: 'carrier' } },
  ],
};

// pick a commander for the roll. Difficulty picks the tier; a reroll is
// possible but the commander never plays above their tier.
export function pickCommander(race, difficulty) {
  const list = COMMANDERS[race] || COMMANDERS.zerg;
  const tier = difficulty === 'hard' ? 'hard' : difficulty === 'easy' ? 'easy' : 'normal';
  return list.find(c => c.tier === tier) || list[0];
}
