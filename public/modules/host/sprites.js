// Sprite loader. Loads whatever PNGs exist in art/sprites/ (the server lists them), strips flat
// magenta (#FF00FF) backgrounds, and offers helpers that draw a sprite if it exists and report
// false if not, so every caller can fall back to its placeholder drawing.
//
// Keys are paths without ".png", e.g. 'ship/gasbag', 'crew/bulldog/head'.
// Art is made at 2x, so by default 1 image pixel = 0.5 world units.
//
// art/sprites/rig.json (optional) fine-tunes characters and planes, e.g.
//   { "crew/bulldog": { "scale": 0.5, "neck": { "x": 2, "y": -58 } } }
// (see characterArt.js for the keys).

export function createSprites() {
  const images = {};
  const tints = new Map();
  let rig = {};

  // Turn magenta pixels transparent (with a soft edge) and return a canvas.
  const stripMagenta = (img) => {
    const c = document.createElement('canvas');
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    const g = c.getContext('2d');
    g.drawImage(img, 0, 0);
    const data = g.getImageData(0, 0, c.width, c.height);
    const p = data.data;
    let changed = false;
    for (let i = 0; i < p.length; i += 4) {
      const r = p[i];
      const g = p[i + 1];
      const b = p[i + 2];
      const m = Math.min(r, b) - g; // how magenta this pixel is
      if (m < 40 || Math.abs(r - b) > 70) continue;
      changed = true;
      if (r > 200 && b > 200 && g < 90) p[i + 3] = 0; // background
      else {
        // Edge pixel blended with the background: fade it and take the pink out.
        p[i + 3] = Math.round(p[i + 3] * Math.max(0, 1 - m / 255));
        p[i] = p[i + 2] = g;
      }
    }
    if (changed) g.putImageData(data, 0, 0);
    return c;
  };

  const load = async () => {
    let list = [];
    try {
      list = await (await fetch('/api/sprites')).json();
    } catch {
      return;
    }
    if (list.includes('rig.json')) {
      try {
        rig = await (await fetch('/art/sprites/rig.json')).json();
      } catch (err) {
        console.warn('art/sprites/rig.json could not be read:', err);
      }
    }
    await Promise.all(
      list
        .filter((k) => k !== 'rig.json' && !k.endsWith('/rig.json'))
        .map(
          (key) =>
            new Promise((resolve) => {
              const img = new Image();
              img.onload = () => {
                images[key] = stripMagenta(img);
                resolve();
              };
              img.onerror = () => {
                console.warn('Could not load sprite', key);
                resolve();
              };
              img.src = `/art/sprites/${key}.png`;
            }),
        ),
    );
    console.log(`Loaded ${Object.keys(images).length} sprite(s)`);
  };

  const get = (key) => images[key] || null;
  const has = (key) => !!images[key];

  // Draw into a world-space box. Returns false (and draws nothing) if the sprite doesn't exist.
  const box = (ctx, key, x, y, w, h, flip = false) => {
    const img = images[key];
    if (!img) return false;
    if (flip) {
      ctx.save();
      ctx.translate(x + w / 2, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(img, -w / 2, y, w, h);
      ctx.restore();
    } else ctx.drawImage(img, x, y, w, h);
    return true;
  };

  // Draw at natural size (scale world units per pixel) with a pivot (fractions of the image),
  // placed at (x, y) and rotated by rot.
  const pivot = (ctx, key, x, y, px, py, rot = 0, scale = 0.5, img = images[key]) => {
    if (!img) return false;
    const w = img.width * scale;
    const h = img.height * scale;
    ctx.save();
    ctx.translate(x, y);
    if (rot) ctx.rotate(rot);
    ctx.drawImage(img, -w * px, -h * py, w, h);
    ctx.restore();
    return true;
  };

  // A copy of a sprite multiplied by a colour (scarves take the player's colour; far limbs
  // are darkened). Cached.
  const tinted = (key, color) => {
    const img = images[key];
    if (!img) return null;
    const id = key + color;
    if (tints.has(id)) return tints.get(id);
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    const g = c.getContext('2d');
    g.drawImage(img, 0, 0);
    g.globalCompositeOperation = 'multiply';
    g.fillStyle = color;
    g.fillRect(0, 0, c.width, c.height);
    g.globalCompositeOperation = 'destination-in';
    g.drawImage(img, 0, 0);
    tints.set(id, c);
    return c;
  };

  const rigFor = (key) => rig[key] || {};

  // A plane from art/sprites/planes/<name>/ (body, plus an edge-on prop that "spins" by
  // stretching), drawn centred on the origin facing right. part = 'body' or 'wreck'.
  // rig.json "planes/<name>": { "prop": { "x": 0.5, "y": 0 } } = prop position as fractions of
  // the body size from its centre (0.5 = right edge).
  const plane = (ctx, name, time, part = 'body') => {
    const body = images[`planes/${name}/${part}`];
    if (!body) return false;
    const R = { scale: 0.5, prop: { x: 0.5, y: 0 }, ...rigFor('planes/' + name) };
    const w = body.width * R.scale;
    const h = body.height * R.scale;
    ctx.drawImage(body, -w / 2, -h / 2, w, h);
    const prop = images[`planes/${name}/prop`];
    if (prop && part === 'body') {
      const spin = 0.25 + 0.75 * Math.abs(Math.sin(time * 30));
      const pw = prop.width * R.scale;
      const ph = prop.height * R.scale * spin;
      ctx.drawImage(prop, w * R.prop.x - pw / 2, h * R.prop.y - ph / 2, pw, ph);
    }
    return true;
  };

  return { load, get, has, box, pivot, tinted, rigFor, plane };
}
