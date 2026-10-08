// Node module-loader hook for tools/instances.mjs (V.0): the game's modules are loaded once per "instance".
// An import whose parent URL carries ?inst=NAME resolves its children with the same ?inst=NAME, so the whole public/
// module graph under that entry (config, shipLayout, simulation, every module) is a second, fully independent copy.
export async function resolve(specifier, context, nextResolve) {
  const r = await nextResolve(specifier, context);
  const m = context.parentURL && /[?&]inst=([A-Za-z0-9_]+)/.exec(context.parentURL);
  if (m && r.url.startsWith('file:') && r.url.includes('/public/') && !/[?&]inst=/.test(r.url)) {
    return { ...r, url: r.url + (r.url.includes('?') ? '&' : '?') + 'inst=' + m[1] };
  }
  return r;
}
