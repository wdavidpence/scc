# SCC visual polish campaign

Research anchors: Blizzard's StarCraft Remastered presentation emphasizes faction identity, readable silhouettes, and a complete beginning-to-end presentation; Blizzard GamesPress provides the official StarCraft II visual reference archive. The campaign below translates those qualities into original Phaser primitives and procedural art, without copying assets.

1. Attract-screen gradient wash — TitleScene.createAttractBackdrop — implemented.
2. Animated horizon light — TitleScene.createAttractBackdrop — implemented.
3. Faction-colored vertical light shafts — TitleScene.createAttractBackdrop — implemented.
4. Floating attract-screen particles — TitleScene.create — implemented/preserved.
5. Tactical briefing eyebrow — TitleScene.create — implemented.
6. Logo emissive duplicate and pulse — TitleScene.create — implemented.
7. Faction briefing cards with strong silhouettes — TitleScene.createRaceCard — implemented/preserved.
8. Card hover lift/scale response — TitleScene.createRaceCard — implemented.
9. Faction-specific card accents and chips — TitleScene.createRaceCard — implemented/preserved.
10. Card typography collision repair — TitleScene.createRaceCard/applyLayout — implemented.
11. Framed AI difficulty console — TitleScene.createDifficultyControls — implemented.
12. Difficulty state hierarchy — TitleScene.refreshDifficultyControls — implemented/preserved.
13. Deploy button hover response — TitleScene.create — implemented.
14. Uplink/status footer strip — TitleScene.create — implemented.
15. Battlefield deployment rails — GameScene.createTacticalOverlays — implemented.
16. Corner command brackets — GameScene.createTacticalOverlays — implemented.
17. Animated battlefield scanline — GameScene.createTacticalOverlays — implemented.
18. Drifting tactical dust depth layer — GameScene.createTacticalOverlays — implemented.
19. Rotating strategic objective reticle — GameScene.createTacticalOverlays — implemented.
20. Readability hierarchy for resource/structure/unit labels — GameScene.createResourceNode/createStructure/createUnit — implemented.

Acceptance targets: title screen has no overlap at 1200x675; battle scene launches with no JavaScript exceptions; visual changes do not alter combat/economy/input behavior.
