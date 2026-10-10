// Builds the online showcase (GitHub Pages) into _site/: the public/ pages plus the art, with the server's art lists written out as plain
// files, so the TV game (bot crew only, no phones), the build page and the art test pages all run with no server. Run by
// .github/workflows/pages.yml on every push to main; locally: node tools/build-pages.mjs, then serve _site/ with any static server.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, '_site');
const ART = path.join(ROOT, 'art');

fs.rmSync(OUT, { recursive: true, force: true });
fs.cpSync(path.join(ROOT, 'public'), OUT, { recursive: true });
if (fs.existsSync(ART)) fs.cpSync(ART, path.join(OUT, 'art'), { recursive: true });

// The same lists server.js answers on /api/sprites, /api/backgrounds and /api/textures.
const sprites = [];
const walk = (dir, rel) => {
  if (!fs.existsSync(dir)) return;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) walk(path.join(dir, e.name), rel + e.name + '/');
    else if (/\.(png|svg)$/i.test(e.name)) sprites.push(rel + e.name);
    else if (e.name === 'rig.json') sprites.push(rel + 'rig.json');
  }
};
walk(path.join(ART, 'sprites'), '');
const backgrounds = [];
const bgRoot = path.join(ART, 'backgrounds');
if (fs.existsSync(bgRoot)) {
  for (const d of fs.readdirSync(bgRoot, { withFileTypes: true })) {
    if (!d.isDirectory()) continue;
    for (const f of fs.readdirSync(path.join(bgRoot, d.name))) if (/\.(png|webp|jpe?g|svg)$/i.test(f)) backgrounds.push(d.name + '/' + f);
  }
}
const texRoot = path.join(ART, 'textures');
const textures = fs.existsSync(texRoot) ? fs.readdirSync(texRoot).filter((f) => /\.png$/i.test(f)) : [];
fs.mkdirSync(path.join(OUT, 'api'), { recursive: true });
fs.writeFileSync(path.join(OUT, 'api', 'sprites'), JSON.stringify(sprites));
fs.writeFileSync(path.join(OUT, 'api', 'backgrounds'), JSON.stringify(backgrounds));
fs.writeFileSync(path.join(OUT, 'api', 'textures'), JSON.stringify(textures));
fs.writeFileSync(path.join(OUT, '.nojekyll'), ''); // (serve every file as it is)
fs.mkdirSync(path.join(OUT, 'socket.io'), { recursive: true });
fs.writeFileSync(path.join(OUT, 'socket.io', 'socket.io.js'), '// No relay server online: io stays undefined and the host runs in showcase mode (network.js).\n');

// The front page: links to what works without the server.
const pages = [
  ['host.html', 'Play on this screen', 'The TV game with bot crew. Press "Add 4 bot crew", then CAST OFF! (Phones can join only when the game runs from start.bat.)'],
  ['host.html?versus=1&bots=4', 'Versus battle', 'Two airships, bot crews, best of 3.'],
  ['buildtest.html', 'Shipwright', 'Build your own airship, then PLAYTEST it.'],
  ['three3d.html', '3D test', 'The same game drawn in 3D with Three.js: real searchlights, a real come-about turn, the Kraken in the sea.'],
  ['creaturetest.html', 'The Kraken', 'The giant boss creature test page.'],
  ['gunshiptest.html', 'Gunship art', 'Enemy gunship drawings.'],
  ['styletest.html', 'Art style', 'The storybook art style test.'],
].filter(([file]) => fs.existsSync(path.join(OUT, file.split('?')[0])));
const card = ([href, title, blurb]) => `<a class="card" href="${href}"><b>${title}</b><span>${blurb}</span></a>`;
fs.writeFileSync(path.join(OUT, 'index.html'), `<!doctype html><html><head><meta charset="utf-8"><title>Airship Crew</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
@font-face{font-family:'Limelight';src:url(fonts/Limelight-Regular.ttf) format('truetype')}
@font-face{font-family:'Libre Baskerville';src:url(fonts/LibreBaskerville.ttf) format('truetype');font-weight:400 700}
body{margin:0;min-height:100vh;background:#2b1d14;color:#3a2c20;font-family:'Libre Baskerville',Georgia,serif;display:flex;justify-content:center;padding:24px 16px;box-sizing:border-box}
main{max-width:720px;width:100%}
h1{font-family:'Limelight',Georgia,serif;font-weight:400;color:#f3ead6;font-size:48px;margin:0 0 4px}
p.lead{color:#e8d9b8;margin:0 0 20px}
.card{display:block;background:#f3ead6;border:3px solid #3a2c20;border-radius:10px;padding:14px 16px;margin:0 0 12px;color:#3a2c20;text-decoration:none;box-shadow:4px 5px 0 rgba(0,0,0,.35)}
.card b{display:block;font-family:'Limelight',Georgia,serif;font-weight:400;font-size:24px}
.card:hover{background:#fff6e2}
</style></head><body><main>
<h1>Airship Crew</h1>
<p class="lead">A co-op party game: one TV runs the airship, and up to 16 friends crew her from their phones. This is the online showcase, played by bot crew.</p>
${pages.map(card).join('\n')}
</main></body></html>
`);
console.log(`_site built: ${sprites.length} sprites, ${backgrounds.length} backgrounds, ${textures.length} textures, ${pages.length} pages`);
