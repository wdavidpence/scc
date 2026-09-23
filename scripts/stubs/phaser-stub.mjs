// Stand-in for the 'phaser' package under Node (see loader.mjs). entity.js
// never dereferences the namespace at runtime in the sim paths; anything
// that does should throw loudly rather than silently misbehave.
const fn = new Proxy(function () {}, {
  get: (t, k) => (k === 'then' ? undefined : fn),
  apply: () => fn,
});
export const Phaser = fn;
export default fn;
