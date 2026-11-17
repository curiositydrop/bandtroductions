// Lets Node import radio-schedule-engine.js without the browser-only side effect module.
export async function resolve(specifier, context, nextResolve) {
  if (String(specifier).includes('radio-control-room-ux-fix')) {
    return { url: new URL('./radio-engine-stub.mjs', import.meta.url).href, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}
