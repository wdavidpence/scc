const CELL = 32;

function sightFor(entity) {
  if (!entity || entity.hp <= 0) return 0;
  if (entity.type === 'worker') return 210;
  if (entity.type === 'structure' || entity.type === 'construction') {
    return entity.role === 'commandCenter' ? 320 : 230;
  }
  return 270;
}

export function createFogOfWar(scene, worldWidth, worldHeight) {
  const cols = Math.ceil(worldWidth / CELL);
  const rows = Math.ceil(worldHeight / CELL);
  const explored = new Uint8Array(cols * rows);
  const visible = new Uint8Array(cols * rows);
  const gfx = scene.add.graphics().setDepth(26);

  const idx = (c, r) => r * cols + c;

  function mark(x, y, radius) {
    if (radius <= 0) return;
    const r2 = radius * radius;
    const c0 = Math.max(0, Math.floor((x - radius) / CELL));
    const c1 = Math.min(cols - 1, Math.floor((x + radius) / CELL));
    const r0 = Math.max(0, Math.floor((y - radius) / CELL));
    const r1 = Math.min(rows - 1, Math.floor((y + radius) / CELL));
    for (let r = r0; r <= r1; r += 1) {
      for (let c = c0; c <= c1; c += 1) {
        const cx = c * CELL + CELL / 2;
        const cy = r * CELL + CELL / 2;
        const dx = cx - x;
        const dy = cy - y;
        if (dx * dx + dy * dy <= r2) {
          const i = idx(c, r);
          visible[i] = 1;
          explored[i] = 1;
        }
      }
    }
  }

  function isVisible(x, y) {
    const c = Math.max(0, Math.min(cols - 1, Math.floor(x / CELL)));
    const r = Math.max(0, Math.min(rows - 1, Math.floor(y / CELL)));
    return visible[idx(c, r)] === 1;
  }

  function isExplored(x, y) {
    const c = Math.max(0, Math.min(cols - 1, Math.floor(x / CELL)));
    const r = Math.max(0, Math.min(rows - 1, Math.floor(y / CELL)));
    return explored[idx(c, r)] === 1;
  }

  function applyEntityFog(entity, seen) {
    if (!entity || entity.team === 'player') return;
    const nodes = [entity.sprite, entity.shadow, entity.ridge, entity.core, entity.hpBack, entity.hpFront, entity.statusText, entity.labelText];
    nodes.forEach((node) => {
      if (node && typeof node.setVisible === 'function') node.setVisible(seen);
    });
    if (entity.sprite && !seen) entity.sprite.setAlpha(0);
    else if (entity.sprite && seen) entity.sprite.setAlpha(entity.type === 'construction' ? 0.7 : 0.98);
  }

  function update() {
    visible.fill(0);
    const sources = [...(scene.units || []), ...(scene.structures || []), ...(scene.constructions || [])];
    for (let i = 0; i < sources.length; i += 1) {
      const entity = sources[i];
      if (!entity || entity.team !== 'player' || entity.hp <= 0) continue;
      mark(entity.x, entity.y, sightFor(entity));
    }

    gfx.clear();
    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        const i = idx(c, r);
        if (visible[i]) continue;
        gfx.fillStyle(explored[i] ? 0x05070c : 0x010204, explored[i] ? 0.58 : 0.94);
        gfx.fillRect(c * CELL, r * CELL, CELL + 0.5, CELL + 0.5);
      }
    }

    const hidden = [...(scene.units || []), ...(scene.enemyUnits || []), ...(scene.structures || [])];
    hidden.forEach((entity) => applyEntityFog(entity, isVisible(entity.x, entity.y)));
  }

  return { update, isVisible, isExplored, gfx };
}
