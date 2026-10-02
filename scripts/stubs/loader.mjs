// P1.029 i2: ESM loader hook — maps the bare 'phaser' import to a stub so
// entity.js (which has ZERO runtime Phaser-namespace usage) can be loaded
// headless. Display objects come from the fake world, not Phaser.
//
// P1.050 addition — per-run module isolation: when a top-level engine
// import carries a '?s=NONCE' query, EVERY relative engine/data import made
// underneath it propagates the same nonce, so the whole module subtree gets
// fresh copies (module-level state like entity.js nextId and any cached
// tables cannot leak between runs in one process). The phaser stub stays
// shared and stateless.
export async function resolve(specifier, context, nextResolve) {
  if (specifier === 'phaser') {
    return { url: new URL('./phaser-stub.mjs', import.meta.url).href, shortCircuit: true };
  }
  const parent = context.parentURL || '';
  const m = /[?&]s=([0-9a-f]+)/i.exec(parent);
  if (m && (specifier.startsWith('./') || specifier.startsWith('../'))) {
    const base = new URL(specifier, parent.split('?')[0]);
    let url = base.href;
    if (url.includes('/engine/') || url.endsWith('sc1.js')) {
      url += (url.includes('?') ? '&' : '?') + 's=' + m[1];
      return { url, shortCircuit: true };
    }
  }
  return nextResolve(specifier, context);
}
