import Phaser from 'phaser';

// SCC visual pass layer. Kept separate so visual iteration cannot destabilize RTS logic.
// Passes 1-20 are deliberately low-object-count and mobile-safe.
export function installBattleVisualPolish(scene) {
  const raceId = scene.race?.id || 'terran';
  const faction = raceId === 'zerg'
    ? { hot: 0xf97316, glow: 0xfbbf24, deep: 0x2a120e }
    : raceId === 'protoss'
      ? { hot: 0xa78bfa, glow: 0xd8b4fe, deep: 0x171132 }
      : { hot: 0x38bdf8, glow: 0x93c5fd, deep: 0x071a2b };
  const objects = [];
  const tweens = [];
  const add = (object) => { objects.push(object); return object; };
  const pulse = (target, duration, alpha = 0.22) => {
    tweens.push(scene.tweens.add({ targets: target, alpha, duration, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' }));
  };

  // Pass 1: a dark material underlay separates gameplay silhouettes from the map.
  add(scene.add.rectangle(840, 480, 1680, 960, faction.deep, 0.22).setDepth(-17));

  // Pass 2: layered radial command lighting approximates deferred light pools.
  [300, 210, 120].forEach((radius, index) => {
    const light = add(scene.add.circle(840, 480, radius, faction.hot, 0.018 + index * 0.012).setDepth(-15));
    pulse(light, 2600 + index * 500, 0.012 + index * 0.01);
  });

  // Pass 3: a restrained horizon haze creates depth without blurring units.
  add(scene.add.rectangle(840, 480, 1680, 120, faction.hot, 0.035).setDepth(-14));

  // Pass 4: ground lane seams provide authored terrain rhythm.
  const seams = scene.add.graphics().setDepth(-13);
  seams.lineStyle(1, 0x64748b, 0.18);
  for (let x = 420; x < 1260; x += 84) seams.lineBetween(x, 132, x + 34, 828);
  for (let y = 180; y < 820; y += 96) seams.lineBetween(410, y, 1270, y + 18);
  add(seams);

  // Pass 5: faction border beacons establish territory identity.
  [360, 1320].forEach((x, index) => {
    const color = index === 0 ? faction.hot : 0xf97316;
    const beacon = add(scene.add.circle(x, 480, 12, color, 0.18).setStrokeStyle(2, color, 0.55).setDepth(-11));
    pulse(beacon, 1450 + index * 300, 0.05);
  });

  // Pass 6: animated dust motes sell a living battlefield; fixed seed for determinism.
  for (let i = 0; i < 18; i += 1) {
    const mote = add(scene.add.circle(70 + ((i * 233) % 1540), 130 + ((i * 149) % 700), 1 + (i % 2), i % 3 ? 0x94a3b8 : faction.glow, 0.18).setDepth(-8));
    if (!scene.sys.game.device.input?.touch) {
      tweens.push(scene.tweens.add({ targets: mote, y: mote.y - 18 - (i % 4) * 8, alpha: 0.04, duration: 2800 + i * 70, yoyo: true, repeat: -1, delay: i * 90, ease: 'Sine.easeInOut' }));
    }
  }

  // Pass 7: resource fields get a crisp halo and a readable ground plate.
  scene.resourceNodes?.forEach((node, index) => {
    const ring = add(scene.add.ellipse(node.x, node.y + 7, 46, 18, faction.hot, 0.035)
      .setStrokeStyle(1, faction.glow, 0.32).setDepth(3));
    pulse(ring, 1800 + index * 100, 0.06);
    node.visualRing = ring;
  });

  // Pass 8: gas geysers receive an animated thermal plume ring.
  scene.gasGeysers?.forEach((geyser, index) => {
    const plume = add(scene.add.circle(geyser.x, geyser.y, 24, faction.glow, 0.035)
      .setStrokeStyle(1, faction.glow, 0.38).setDepth(3));
    pulse(plume, 1200 + index * 130, 0.08);
    geyser.visualPlume = plume;
  });

  // Pass 9: structures gain a second emissive band for depth and status readability.
  scene.structures?.forEach((structure) => {
    const band = add(scene.add.rectangle(structure.x, structure.y + structure.height * 0.35, structure.width * 0.48, 2, structure.team === 'enemy' ? 0xff6b35 : faction.glow, 0.32).setDepth(13));
    structure.visualBand = band;
  });

  // Pass 10: unit shadows get a subtle faction contact light.
  scene.units?.forEach((unit) => {
    if (unit.teamMarker) unit.teamMarker.setAlpha(0.2);
    if (unit.shadow) unit.shadow.setAlpha(0.58);
  });

  // Pass 11: a compact scanner sweep adds SC2-style tactical instrumentation.
  const sweep = add(scene.add.rectangle(840, 480, 3, 680, faction.glow, 0.12).setDepth(-7));
  tweens.push(scene.tweens.add({ targets: sweep, x: { from: 420, to: 1260 }, duration: 7000, repeat: -1, ease: 'Sine.easeInOut' }));

  // Pass 12: center objective reticle reinforces the contested lane.
  const reticle = add(scene.add.circle(840, 480, 42, faction.hot, 0).setStrokeStyle(1, faction.glow, 0.3).setDepth(2));
  pulse(reticle, 2100, 0.12);

  // Pass 13: bracket corners frame the playable arena like a command display.
  const brackets = scene.add.graphics().setDepth(2);
  brackets.lineStyle(2, faction.glow, 0.3);
  [[392, 132, 1, 1], [1288, 132, -1, 1], [392, 828, 1, -1], [1288, 828, -1, -1]].forEach(([x, y, sx, sy]) => {
    brackets.lineBetween(x, y, x + sx * 30, y); brackets.lineBetween(x, y, x, y + sy * 30);
  });
  add(brackets);

  // Pass 14: selection remains crisp while gaining a faction scanline.
  let selectionAccent = null;
  const onSelect = (entity) => {
    selectionAccent?.destroy();
    selectionAccent = null;
    if (entity) {
      addSelectionAccent(entity);
      selectionAccent = entity.visualSelectionAccent;
    }
  };

  // Pass 15: construction buildings receive a rotating holographic scaffold.
  scene.constructions?.forEach((building) => {
    const scaffold = add(scene.add.ellipse(building.x, building.y, building.width * 0.72, building.height * 0.64, faction.hot, 0)
      .setStrokeStyle(1, faction.glow, 0.26).setDepth(12));
    tweens.push(scene.tweens.add({ targets: scaffold, angle: 360, duration: 3600, repeat: -1, ease: 'Linear' }));
    building.visualScaffold = scaffold;
  });

  // Pass 16: subtle attack-ready arcs make combat states legible before impact.
  scene.units?.filter((unit) => unit.type !== 'worker').forEach((unit) => {
    const arc = add(scene.add.arc(unit.x, unit.y, 0, 0, 0, faction.glow, 0).setStrokeStyle(1, faction.glow, 0.22).setDepth(11));
    unit.visualArc = arc;
  });

  // Pass 17: faction-colored impact flash pool, reused per hit.
  scene.visualImpactPool = [];

  // Pass 18: deployment beacons at both bases add scale and arrival drama.
  [scene.playerCommandCenter, scene.enemyCommandCenter].forEach((base, index) => {
    if (!base) return;
    const beacon = add(scene.add.circle(base.x, base.y, 58, index ? 0xff6b35 : faction.hot, 0).setStrokeStyle(1, index ? 0xff6b35 : faction.glow, 0.3).setDepth(4));
    pulse(beacon, 2400 + index * 350, 0.05);
  });

  // Pass 19: reduced-motion users keep all static readability layers but no ambience.
  if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
    tweens.splice(0).forEach((tween) => tween.stop());
  }

  // Pass 20: live update keeps visual attachments aligned with moving entities.
  const update = () => {
    scene.resourceNodes?.forEach((node) => node.visualRing?.setPosition(node.x, node.y + 7));
    scene.gasGeysers?.forEach((geyser) => geyser.visualPlume?.setPosition(geyser.x, geyser.y));
    scene.structures?.forEach((structure) => {
      structure.visualBand?.setPosition(structure.x, structure.y + structure.height * 0.35);
      structure.visualScaffold?.setPosition(structure.x, structure.y);
    });
    scene.units?.forEach((unit) => {
      unit.visualArc?.setPosition(unit.x, unit.y);
      unit.visualSelectionAccent?.setPosition(unit.x, unit.y);
      if (unit.visualArc) unit.visualArc.setVisible(unit.hp > 0 && unit.type !== 'worker' && unit.cooldown <= 0);
    });
  };

  function addSelectionAccent(entity) {
    const accent = add(scene.add.circle(entity.x, entity.y, (entity.radius || 20) + 16, faction.glow, 0)
      .setStrokeStyle(1, faction.glow, 0.48).setDepth(5));
    pulse(accent, 900, 0.14);
    entity.visualSelectionAccent = accent;
  }

  const destroy = () => {
    tweens.splice(0).forEach((tween) => tween?.stop());
    objects.splice(0).forEach((object) => object?.destroy?.());
    scene.resourceNodes?.forEach((node) => { node.visualRing = null; });
    scene.gasGeysers?.forEach((geyser) => { geyser.visualPlume = null; });
    scene.structures?.forEach((structure) => { structure.visualBand = null; structure.visualScaffold = null; });
    scene.units?.forEach((unit) => { unit.visualArc = null; unit.visualSelectionAccent = null; });
    selectionAccent = null;
  };

  return { update, onSelect, destroy, faction };
}
