// AAA: data-driven mission triggers — SC-style event/condition/action framework.
// BattleScene instantiates one Triggers and calls tick(dt, ctx) each frame.
// ctx = { gameTime, scene, units, buildings, objectives, events, audio, spawnUnit, ... }
// Trigger schema:
//   { id, when: 'time'|'unitsSeen'|'unitsDead:kind'|'buildingLost'|'nearUnit:x,y,r',
//     t: <seconds or count>, msg, radio, bark?, spawn?: [{kind,team,fx,fy}],
//     objective?: {id,text}, once?: true, pan?: {fx,fy} }

export class Triggers {
  constructor(defs = []) {
    this.defs = defs.map(d => ({ once: true, ...d, fired: false, armed: false }));
  }

  // Arm time-based triggers immediately; others on first satisfaction.
  tick(dt, ctx) {
    for (const tr of this.defs) {
      if (tr.fired && tr.once) continue;
      if (this.satisfied(tr, ctx)) this.fire(tr, ctx);
    }
  }

  satisfied(tr, ctx) {
    const g = ctx.gameTime;
    if (tr.when === 'time') return g >= (tr.t || 0);
    if (tr.when === 'unitsSeen') {
      const n = ctx.units.filter(u => !u.dead && u.team !== 0 && ctx.isVisible && ctx.isVisible(u.x, u.y)).length;
      return n >= (tr.t || 1);
    }
    if (tr.when && tr.when.startsWith('unitsDead:')) {
      const kind = tr.when.split(':')[1];
      const dead = ctx.units.filter(u => u.dead && u.kind === kind).length;
      return dead >= (tr.t || 1);
    }
    if (tr.when === 'buildingLost') {
      const lost = ctx.buildings.filter(b => b.dead && b.team === 0).length;
      return lost >= (tr.t || 1);
    }
    if (tr.when && tr.when.startsWith('near:')) {
      // near:fx,fy,r — enemy unit enters fractional map zone
      const [, fx, fy, r] = tr.when.split(':');
      const x = parseFloat(fx) * (ctx.PXW || 1), y = parseFloat(fy) * (ctx.PXH || 1), rr = parseFloat(r) || 100;
      return ctx.units.some(u => !u.dead && u.team !== 0 && Math.hypot(u.x - x, u.y - y) < rr);
    }
    return false;
  }

  fire(tr, ctx) {
    if (tr.fired && tr.once) return;
    tr.fired = true;
    if (tr.msg && ctx.events) ctx.events.emit('hud:radio', tr.msg, tr.who || 'INTEL');
    if (tr.bark && ctx.audio) ctx.audio.bark(tr.msg || '', tr.barkPitch || 0.8, 1.0);
    if (tr.objective && ctx.objectives && !ctx.objectives.find(o => o.id === tr.objective.id)) {
      ctx.objectives.push({ ...tr.objective, done: false });
      if (ctx.events) ctx.events.emit('hud:objectives', ctx.objectives);
      if (ctx.audio) ctx.audio.objective?.();
    }
    if (tr.spawn && ctx.spawnUnit) {
      for (const sp of tr.spawn) {
        const x = (sp.fx ?? 0.85) * (ctx.PXW || 1536), y = (sp.fy ?? 0.15) * (ctx.PXH || 1536);
        try { ctx.spawnUnit(sp.team ?? 1, sp.kind, x, y, { arriveReady: true }); } catch (e) { /* noop */ }
      }
      if (ctx.events) ctx.events.emit('hud:alert', '⚠ REINFORCEMENTS INBOUND', 0xff5c5c);
    }
    if (tr.pan && ctx.cameras && ctx.scene) {
      ctx.cameras.main.centerOn((tr.pan.fx ?? 0.5) * (ctx.PXW || 1536), (tr.pan.fy ?? 0.5) * (ctx.PXH || 1536));
    }
  }

  // Mission designer helper: standard wave-reinforcement trigger set
  static waveReinforcements(atSecs, kinds, counts) {
    return atSecs.map((t, i) => ({
      id: `reinforce-${i}`, when: 'time', t,
      msg: 'Sensors detect warp-in signatures. Reinforcements dropping on the field.',
      bark: true, barkPitch: 0.7,
      spawn: kinds[i].map((k, j) => ({ kind: k, team: 1, fx: 0.8 + (j % 3) * 0.05, fy: 0.12 + Math.floor(j / 3) * 0.06 })).slice(0, counts[i]),
    }));
  }
}
