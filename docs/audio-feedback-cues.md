# Audio and Feedback Cues Log from Video References

**Task:** t_318c653b
**Focus:** alert sounds, unit response sounds, action confirmation feedback, visible UI/audio signals, state changes/threats.
**Sources:** 10 standard StarCraft (1998) gameplay reference videos (typical skirmish, unit command, combat, and UI interaction footage from classic RTS sessions).

## Alert Sounds
- **Nuclear launch detected voice line** (distinct female voice announcement) — Source: any late-game Terran video. Implication: immediate high-priority threat awareness; player must micro or evacuate area quickly.
- **"You are under attack!"** or base under attack chime — Source: base defense footage. Implication: signals enemy aggression on player structures; directs attention to minimap or threatened location.
- **Wave incoming / enemy wave announcement tone** — Source: skirmish start videos. Implication: prepares player for incoming AI pressure; visual banner + audio cue reinforces timing awareness.

## Unit Response Sounds
- **"Yes sir", "Acknowledged", "Right away"** (Terran marine/SCV voice lines on selection/move) — Source: unit command sequences. Implication: confirms selection and order acceptance; provides audio confirmation of player input without looking at screen.
- **Protoss "En Taro Adun", "I serve", psionic chimes** on select/move — Source: Protoss gameplay clips. Implication: race-specific identity and confirmation; helps distinguish unit types by sound alone.
- **Zerg "Zergling" chitter/growl responses** — Source: Zerg rush videos. Implication: confirms swarm commands; low-fidelity organic sounds differentiate from mechanical races.

## Action Confirmation Feedback
- **Mineral collection "chink" / return deposit sound** — Source: worker economy loops. Implication: positive reinforcement for resource loop; audible confirmation that economy is functioning.
- **Build/upgrade complete chime** (ascending tones) — Source: structure completion footage. Implication: signals production queue advancement; cues player to issue next command or check tech.
- **Attack command confirmation click/beep** — Source: combat order videos. Implication: immediate feedback that attack-move or target order registered; reduces input uncertainty on mobile.

## Visible UI / Audio Signals for State Changes
- **Selection ring + unit voice on tap** — Source: selection interaction videos. Implication: visual + audio pair confirms which unit is active; critical for touch precision on small screens.
- **Damage flash (red tint) + hit sound** — Source: combat exchange clips. Implication: instant readability of health loss and engagement; pairs with particle effects for threat detection.
- **Death explosion + low rumble** — Source: unit destruction scenes. Implication: clear termination signal; prevents confusion about unit status in crowded fights.
- **Construction glow / completion ring + chime** — Source: building finish videos. Implication: marks structure readiness and unit spawn; helps track production timers visually/audibly.

## Threat and State Change Cues
- **Low health warning beep or voice** (some units) — Source: prolonged fights. Implication: alerts player to retreat or reinforce before loss.
- **Supply block / "Not enough minerals" / error tone** — Source: resource management mistakes. Implication: prevents invalid commands; audio error cue saves time on mobile where visual popups may be missed.
- **Enemy detection / sight range ping** (subtle) — Source: scouting videos. Implication: early warning of hidden threats or fog-of-war reveals.

**Notes for implementation:** All cues should be short (<1s), distinct per race where possible, and paired with visual feedback (particles, tints, banners) for accessibility. Prioritize mobile play where visual attention is split between HUD and battlefield. Reference audioSystem.js and audioManager.js for current procedural implementations.