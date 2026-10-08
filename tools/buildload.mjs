// Find a ship build for the tools. spec = 'classic', a fixture name ('multi' = tools/fixtures/multi-build.mjs), a path to a .json file
// (a parts array, or { parts: [...] }), a path to a .mjs file (default export: a parts array, or a function(BUILDS) returning one),
// or the JSON text itself ('[{"part":...}]').
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const toolsDir = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));

export async function loadBuild(spec, BUILDS) {
  if (!spec || spec === 'classic') return BUILDS.classic;
  const asParts = (v) => (Array.isArray(v) ? v : v && Array.isArray(v.parts) ? v.parts : null);
  if (/^\s*[[{]/.test(spec)) return asParts(JSON.parse(spec));
  const fixture = path.join(toolsDir, 'fixtures', spec + '-build.mjs');
  const file = fs.existsSync(fixture) ? fixture : path.resolve(spec);
  if (!fs.existsSync(file)) throw new Error('No such build: ' + spec + ' (try classic, multi, or a .json/.mjs path)');
  if (file.endsWith('.json')) return asParts(JSON.parse(fs.readFileSync(file, 'utf8')));
  const mod = (await import(pathToFileURL(file).href)).default;
  return asParts(typeof mod === 'function' ? mod(BUILDS) : mod);
}
