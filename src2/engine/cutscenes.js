// SCC cutscene engine data — SC-style cinematic scripts, mission briefings,
// debriefs and in-battle radio chatter. Each script is an array of beats:
//   { kind:'title'|'radio'|'pan'|'fx', who?, name?, color?, text, sfx?, wait (s) }
// Rendered by scenes/CutScene.js. All dialogue original, SC-flavored.

export const SPEAKERS = {
  jem:     { name: 'JEM', color: '#c9d6ee' },
  joey:    { name: 'JOEY RAY', color: '#9fb0cc' },
  nakamura:{ name: 'LT. NAKAMURA', color: '#ffd23f' },
  vance:   { name: 'SGT. VANCE', color: '#b8c8e0' },
  corvin:  { name: 'PVT. CORVIN', color: '#8fa3c8' },
  voss:    { name: 'CMDR. VOSS', color: '#4ea1ff' },
  hal:     { name: 'SGT. HAL', color: '#ffb454' },
  kate:    { name: 'OPS OFFICER KATE', color: '#7dd0a0' },
  overseer:{ name: 'THE SWARM', color: '#ff7b2e' },
  conclave:{ name: 'THE CONCLAVE', color: '#a78bfa' },
  artanis: { name: 'EXECUTOR', color: '#c4b5fd' },
  fenix:   { name: 'PRAETOR', color: '#f0abfc' },
  admiral: { name: 'FLEET ADMIRAL', color: '#e8f1ff' },
  vice:    { name: 'VICE ADMIRAL', color: '#9ca3af' },
  control: { name: 'FLEET CONTROL', color: '#6ee7a0' },
  quartermaster: { name: 'REQUISITION', color: '#ffd23f' },
};

// ---- Opening cinematic: cold open from the victims' POV, then title ----
// v2.30: fully voiced — each radio beat carries a pre-baked Edge-TTS clip
// (vo/intro/*.mp3) and its wait auto-extends to the voice duration.
export const INTRO_SCRIPT = [
  { kind: 'static', wait: 0.9 },
  { kind: 'scene', art: 'wreckage', wait: 3.4 },
  { kind: 'radio', who: 'jem', vo: 'jem1', text: '…salvage rights are salvaged rights, Joey Ray. Look at this hull. That blast came from the *inside*.', wait: 7.3 },
  { kind: 'radio', who: 'joey', vo: 'joey1', text: 'Inside? Nothing blows a freighter apart from the inside except a reactor.', wait: 5.1 },
  { kind: 'radio', who: 'jem', vo: 'jem2', text: 'And this scar? Melted. One clean stroke. Nothing in our book cuts like that.', wait: 6.1 },
  { kind: 'fx', fx: 'radar', color: '#4ea1ff', text: 'PROXIMITY ALERT — UNREGISTERED CONTACT', wait: 1.6 },
  { kind: 'radio', who: 'joey', vo: 'joey2', text: 'Sensor ping. Big. Coming about to—', wait: 3.7 },
  { kind: 'scene', art: 'alien', wait: 2.6 },
  { kind: 'radio', who: 'jem', vo: 'jem3', text: 'Cut the lights! Cut everything, now—', wait: 3.3 },
  { kind: 'fx', fx: 'burn', color: '#a78bfa', wait: 2.6 },
  { kind: 'static', wait: 0.9 },
  { kind: 'scene', art: 'title', wait: 3.2 },
  { kind: 'radio', who: 'control', vo: 'control1', text: 'Outwatch Relay Log, entry one-four-four… Relay Station Kesh has gone dark. All forty-two thousand souls.', wait: 9.5 },
  { kind: 'radio', who: 'control', vo: 'control2', text: 'Whatever did this is already moving sunward. It is moving toward *us*.', wait: 6.1 },
  { kind: 'scene', art: 'armada', wait: 3.4 },
  { kind: 'card', text: 'THEY CAME WITHOUT WARNING.', vo: 'card1', wait: 2.8 },
  { kind: 'fx', fx: 'jump', color: '#cfe4ff', wait: 1.2 },
];

// ---- Per-mission briefings (radio dialogue + objective stamp) ----
export const BRIEFS = {
  1: { title: 'CLEANUP OP', stamp: 'OPERATION: FIRST LIGHT', beats: [
    { kind: 'radio', who: 'voss', vo: 'b1a', text: 'Magistrate, the colony is a graveyard and the local fauna made it that way. You will re-establish the mineral line and purge the sector.', wait: 5.0 },
    { kind: 'radio', who: 'hal', vo: 'b1b', text: 'Translation: clean up the mess someone else made. Boot your marines, build a depot, and stay off the blight until you have guns.', wait: 5.4 },
    { kind: 'obj', text: 'ESTABLISH BASE  ·  PURGE THE SKARN REMNANTS' , wait: 3.0 },
  ]},
  2: { title: 'FIRST CONTACT', stamp: 'OPERATION: ANVIL', beats: [
    { kind: 'radio', who: 'voss', vo: 'b2a', text: 'A coordinated swarm has landed on our flank. This is not the scattered vermin you scrubbed last tour.', wait: 4.6 },
    { kind: 'radio', who: 'kate', vo: 'b2b', text: 'They are walling off the gas geyser before we can. If they lock the gas, they lock the tech. Break their grip early.', wait: 5.2 },
    { kind: 'obj', text: 'HOLD THE LINE  ·  DENY THE GEYSERS' , wait: 3.0 },
  ]},
  3: { title: 'FIRE AND FURY', stamp: 'OPERATION: BURN NOTICE', beats: [
    { kind: 'radio', who: 'voss', vo: 'b3a', text: 'A renegade warlord claims this sector by right of salvage. He has our old battlecruiser parts, and no scruples.', wait: 5.0 },
    { kind: 'radio', who: 'hal', vo: 'b3b', text: 'Terran on terran. Fine by me — just watch for the incinerators. They like the terrain a little too much.', wait: 4.6 },
    { kind: 'obj', text: 'BREAK THE WARLORD\u2019S FORTIFICATIONS' , wait: 3.0 },
  ]},
  4: { title: 'PSI STORM', stamp: 'OPERATION: SHATTERED MIRROR', beats: [
    { kind: 'radio', who: 'conclave', vo: 'b4a', text: 'Adept heralds rise in the high orbit. Their shields drink fire and their storm answers in kind.', wait: 5.0 },
    { kind: 'radio', who: 'kate', vo: 'b4b', text: 'Do not bunch up. Their storm punishes tight formations. Spread out, swarm their shields, break the projectors.', wait: 5.2 },
    { kind: 'obj', text: 'OVERWHELM THE ADEPT LANDING' , wait: 3.0 },
  ]},
  5: { title: 'SWARM', stamp: 'OPERATION: MEATGRINDER', beats: [
    { kind: 'radio', who: 'overseer', vo: 'b5a', text: 'The brood nest screams your name across every dead channel. It does not negotiate. It consumes.', wait: 4.8 },
    { kind: 'radio', who: 'hal', vo: 'b5b', text: 'Four minutes of hell, then the tunnel mouths empty. Bunkers up, marines loaded, and for God\u2019s sake keep the drop lanes clear.', wait: 5.6 },
    { kind: 'obj', text: 'SURVIVE 4 MINUTES OF ASSAULT  ·  THEN BREAK THE NEST' , wait: 3.2 },
  ]},
  6: { title: 'IRON WALL', stamp: 'OPERATION: SIEGE BREAKER', beats: [
    { kind: 'radio', who: 'voss', vo: 'b6a', text: 'The warlord\u2019s fortress bristles with turrets and a champion battlecruiser owns the sky above it.', wait: 4.8 },
    { kind: 'radio', who: 'nakamura', vo: 'b6b', text: 'Bring siege tanks and bring them early. We crack the wall, then we own the rubble.', wait: 4.0 },
    { kind: 'obj', text: 'SIEGE THE FORTRESS  ·  DOWN THE CHAMPION' , wait: 3.2 },
  ]},
  7: { title: 'JUDGEMENT', stamp: 'OPERATION: SKY BREAK', beats: [
    { kind: 'radio', who: 'conclave', vo: 'b7a', text: 'The Fleet of the Executor darkens your sun. Its arks judge you unworthy of orbit.', wait: 4.6 },
    { kind: 'radio', who: 'fenix', vo: 'b7b', text: 'Interceptors are children until the hangar sings. Shoot the singers. The sky falls after.', wait: 4.4 },
    { kind: 'obj', text: 'SHOOT DOWN THE CHAMPION ARK' , wait: 3.0 },
  ]},
  8: { title: 'FINAL RECKONING', stamp: 'OPERATION: KINGSLAYER', beats: [
    { kind: 'radio', who: 'overseer', vo: 'b8a', text: 'The Mind focuses its ten thousand eyes upon your hives of metal and your small green world. It is curious how you will die.', wait: 5.6 },
    { kind: 'radio', who: 'hal', vo: 'b8b', text: 'Three minutes of everything it has. Then we put a rounds-down the throat of that Tremorclaw and end the argument.', wait: 5.2 },
    { kind: 'obj', text: 'HOLD 3 MINUTES  ·  SLAY THE TREMORCLAW CHAMPION' , wait: 3.4 },
  ]},
  9: { title: 'GHOST PROTOCOL', stamp: 'OPERATION: SILENT KNIFE', beats: [
    { kind: 'radio', who: 'voss', vo: 'b9a', text: 'Ghost operatives hit our supply lines at three installations last night. No bodies. No trace. No survivors.', wait: 4.8 },
    { kind: 'radio', who: 'kate', vo: 'b9b', text: 'Keep detection coverage on every convoy lane and stagger the moves. You can\u2019t shoot what you can\u2019t see.', wait: 4.8 },
    { kind: 'obj', text: 'HOLD 3 MINUTES  ·  PURGE THE SECTOR' , wait: 3.2 },
  ]},
  10: { title: 'HIVE CROWN ASCENDANT', stamp: 'OPERATION: FINAL BELL', beats: [
    { kind: 'radio', who: 'overseer', vo: 'b10a', text: 'You have taken broods from me. You have salted my blight. Tonight the debt comes due in fang and acid.', wait: 5.2 },
    { kind: 'radio', who: 'hal', vo: 'b10b', text: 'Last ride, folks. Everything we\u2019ve got, straight down the middle. Nobody gets left behind.', wait: 4.6 },
    { kind: 'obj', text: 'SURVIVE THE SWARM  ·  KILL THE CHAMPION' , wait: 3.4 },
  ]},
};

// ---- Post-mission debriefs ----
export const DEBRIEFS_WIN = {
  1: 'Sector scrubbed. The colony will live another season.',
  2: 'The swarm broke on our line like water on rock. Today rock won.',
  3: 'The warlord\u2019s banner burns. Salvage rights: reclaimed.',
  4: 'Their storm spent itself on our bunkers. Auraxis sends no angels to the damned.',
  5: 'Four minutes. A hundred graves. And the nest is ash behind us.',
  6: 'The wall came down. Rubble suits them — it was always going to.',
  7: 'The sky is clear. Their champion burns brighter than their sun.',
  8: 'The Mind watched us kill its champion. It will remember that.',
  9: 'Ghosts need ground to haunt. We salted all of it.',
  10: 'The brood is broken. Go home, drink, and wait for the next war.',
};
export const DEBRIEFS_LOSE = {
  1: 'The line never formed. History won\u2019t even note the date.',
  2: 'They came through, and we weren\u2019t the wall we promised.',
  3: 'Fortress stands. So does his mockery. Fall in and try again.',
  4: 'Their storm still sings over the wreck of this base.',
  5: 'We broke at the third wave. The fourth never even had to push.',
  6: 'The guns on that wall spoke for us. Loudly. Too loud.',
  7: 'Their arks blot out the sun. We never learned to look up.',
  8: 'The Mind got what it came for: our bones.',
  9: 'We never saw them. That was the whole trick.',
  10: 'The swarm eats everything eventually. Tonight, it ate us.',
};

// ---- In-battle radio chatter: [{t: seconds, msg, who?}] ----
export function missionChatter(n, enemyRace) {
  const foe = { terran: 'renegade', skarn: 'swarm', auraxis: 'Adept' }[enemyRace] || 'enemy';
  const out = [
    { t: 12, msg: 'Perimeter sensors nominal. Keep your eyes on the dark.' },
    { t: 75, msg: 'Mineral haulers behind schedule. Tighten the harvest loop.' },
    { t: 150, msg: `Signals traffic spikes — the ${foe} is massing something.` },
    { t: 240, msg: 'Gas flow still throttled. Every volcite you own is bought with a fight.' },
    { t: 330, msg: `Scanner contact, bearing east. ${foe.toUpperCase()} COLUMN ON THE MOVE.` },
  ];
  if (n >= 5) out.push({ t: 420, msg: 'Heavy bio-signs underground. Something big is burrowing.' });
  if (n >= 8) out.push({ t: 500, msg: 'Fleet overhead insurance expired. This is all we have.' });
  return out;
}

export const TITLE_INTRO_SEEN_KEY = 'starfront.cutseen.v1';
