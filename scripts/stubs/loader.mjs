// P1.029 i2: ESM loader hook — maps the bare 'phaser' import to a stub so
// entity.js (which has ZERO runtime Phaser-namespace usage) can be loaded
// headless. Display objects come from the fake world, not Phaser.
export async function resolve(specifier, context, nextResolve) {
  if (specifier === 'phaser') {
    return { url: new URL('./phaser-stub.mjs', import.meta.url).href, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}
