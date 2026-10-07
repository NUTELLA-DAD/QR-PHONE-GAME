#!/usr/bin/env python
"""Fix-up pass for the painted background strips in art/backgrounds/<env>/ (P1.2).

Run it with any Python that has numpy + Pillow, e.g. the ComfyUI embedded one:
  C:\\Users\\kenny\\Downloads\\AIRSHIP\\ComfyUI\\ComfyUI_windows_portable\\python_embeded\\python.exe tools/fix_backgrounds.py
  ... tools/fix_backgrounds.py --check            (report only, writes nothing)
  ... tools/fix_backgrounds.py frost sea          (only these environments)
  ... tools/fix_backgrounds.py --force            (redo files already fixed)

What it does to each sideways-tiling strip (clouds, far, mist, mid, near):
  1. Seam: compares the last and first pixel column (the join when the strip repeats). If they differ,
     a smooth, fading colour/alpha correction is spread over ~160 px on each side so the strip wraps cleanly.
     (A correction rather than a cross-fade, so no ghost double-images are added.)
  2. Ramps: the far/mid layers carry a plain top-to-bottom fade that starts with a visible kink; it is eased
     (smoothstep) at both ends so no "edge" shows where the painting begins.
  3. Top edge: alpha is feathered over ~80 px from the first painted row (or from the very top if the painting
     touches it, like the cloud layers), so a cut-off cloud or peak never ends in a hard line.
  4. Bottom edge of the TOP-anchored cloud layers: feathered over ~100-200 px (they hang from the top of the screen,
     so their bottom is in the middle of the picture and must dissolve into the sky).
sky.png is left alone. cave.png is checked both ways (left/right and top/bottom) and only touched if a seam is obvious.
Already-fixed files carry a PNG text tag ("airship-bgfix") so a second run does nothing. The originals are in git.
"""
import os
import sys

import numpy as np
from PIL import Image
from PIL.PngImagePlugin import PngInfo

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'art', 'backgrounds')
ENVS = ['skyisles', 'frost', 'ember', 'storm', 'sea', 'fungal', 'aether']
STRIPS = ['clouds', 'far', 'mist', 'mid', 'near']
TAG = 'airship-bgfix'

SEAM_BAND = 160            # px each side of the join that the seam correction fades over
SEAM_TOL = 1.0             # mean abs difference (0-255, premultiplied RGBA) above which the strip gets a seam fix
CAVE_TOL = 6.0             # the cave texture is only repaired if its seam is this obvious
TOP_FEATHER = 80           # px
BOTTOM_FEATHER = (110, 0)                   # (ramp px, inset px) for the TOP-anchored cloud layers: fully clear this far from the bottom
BOTTOM_FEATHER_ENV = {'ember': (200, 130)}  # ember's cloud layer ends in a cream horizon band and a flat orange plane: dissolve those


def smooth(t):
    t = np.clip(t, 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


def load(path):
    """-> premultiplied float32 array H x W x 4 (0..255)."""
    a = np.asarray(Image.open(path).convert('RGBA')).astype(np.float32)
    a[..., :3] *= a[..., 3:4] / 255.0
    return a


def save(path, p):
    a = p.copy()
    al = np.clip(a[..., 3], 0, 255)
    safe = np.maximum(al, 1e-3)[..., None]
    rgb = np.clip(a[..., :3] * 255.0 / safe, 0, 255)
    rgb[al < 0.5] = 0
    out = np.concatenate([rgb, al[..., None]], axis=2)
    info = PngInfo()
    info.add_text(TAG, '1')
    Image.fromarray(np.rint(out).astype(np.uint8), 'RGBA').save(path, optimize=True, pnginfo=info)


def is_fixed(path):
    try:
        return TAG in Image.open(path).text
    except Exception:
        return False


def clamp_premult(p):
    p[..., 3] = np.clip(p[..., 3], 0, 255)
    p[..., :3] = np.clip(p[..., :3], 0, p[..., 3:4])
    return p


def seam_error(p, axis):
    """Mean abs difference between the two edge lines that meet when the image repeats along `axis` (1 = sideways)."""
    if axis == 1:
        return float(np.abs(p[:, 0] - p[:, -1]).mean())
    return float(np.abs(p[0] - p[-1]).mean())


def fix_seam(p, axis, band=SEAM_BAND):
    """Spread half of the edge mismatch over `band` px on each side, fading to nothing (no ghosting, details stay)."""
    q = np.moveaxis(p, axis, 1) if axis != 1 else p  # work along axis 1
    n = q.shape[1]
    band = int(min(band, n // 3))
    d = (q[:, -1] - q[:, 0]) * 0.5  # per-row (or per-column) offset: left gets +d, right gets -d
    ramp = smooth(1.0 - (np.arange(band) + 0.5) / band)  # 1 at the edge -> 0 inside
    ramp = (ramp * ramp * (3 - 2 * ramp))[None, :, None]  # smoother falloff
    q = q.copy()
    q[:, :band] += d[:, None, :] * ramp
    q[:, n - band:] -= d[:, None, :] * ramp[:, ::-1]
    q = clamp_premult(q)
    return np.moveaxis(q, 1, axis) if axis != 1 else q


def ease_flat_ramp(p):
    """far/mid: a plain vertical alpha ramp (same alpha across a whole row) gets smoothstep easing so it has no kinks."""
    al = p[..., 3]
    spread = al.max(axis=1) - al.min(axis=1)
    rows = np.where((spread <= 3) & (al.mean(axis=1) > 0.5) & (al.mean(axis=1) < 253))[0]
    if len(rows) < 40:
        return p, 0
    q = p.copy()
    for y in rows:
        a = al[y].mean() / 255.0
        f = float(smooth(a)) / a
        q[y] *= f
    return q, len(rows)


def first_painted_row(p, thresh=6.0):
    m = p[..., 3].max(axis=1)
    rows = np.where(m > thresh)[0]
    return int(rows[0]) if len(rows) else 0


def feather_top(p, px=TOP_FEATHER):
    r0 = first_painted_row(p)
    y = np.arange(p.shape[0], dtype=np.float32)
    f = smooth((y - r0) / px)  # 0 at the first painted row (or the top), 1 after px rows
    return p * f[:, None, None]


def feather_bottom(p, px, inset=0):
    h = p.shape[0]
    y = np.arange(h, dtype=np.float32)
    f = smooth((h - 1 - inset - y) / px)
    return p * f[:, None, None]


def process_strip(path, env, kind, check_only, force):
    if not force and is_fixed(path):
        print(f'  {env}/{kind}: already fixed, skipped')
        return
    p = load(path)
    notes = []
    err0 = seam_error(p, 1)
    if err0 > SEAM_TOL:
        p = fix_seam(p, 1)
        notes.append('seam %.1f -> %.1f' % (err0, seam_error(p, 1)))
    else:
        notes.append('seam ok (%.1f)' % err0)
    n = 0
    if kind in ('far', 'mid', 'near'):
        p, n = ease_flat_ramp(p)
    if n:
        notes.append('eased %d-row ramp' % n)
    p = feather_top(p)
    notes.append('top feather %dpx' % TOP_FEATHER)
    if kind == 'clouds':
        bpx, inset = BOTTOM_FEATHER_ENV.get(env, BOTTOM_FEATHER)
        p = feather_bottom(p, bpx, inset)
        notes.append('bottom feather %dpx (clear for the last %d)' % (bpx, inset))
    p = clamp_premult(p)
    print(f'  {env}/{kind}: ' + ', '.join(notes))
    if not check_only:
        save(path, p)


def process_cave(path, env, check_only, force):
    if not force and is_fixed(path):
        print(f'  {env}/cave: already fixed, skipped')
        return
    img = np.asarray(Image.open(path).convert('RGB')).astype(np.float32)
    p = np.concatenate([img, np.full(img.shape[:2] + (1,), 255, np.float32)], axis=2)
    ex, ey = seam_error(p, 1), seam_error(p, 0)
    print(f'  {env}/cave: seam left/right {ex:.1f}, top/bottom {ey:.1f}' + ('' if max(ex, ey) > CAVE_TOL else ' (fine, untouched)'))
    if check_only or max(ex, ey) <= CAVE_TOL:
        return
    if ex > CAVE_TOL:
        p = fix_seam(p, 1)
    if ey > CAVE_TOL:
        p = fix_seam(p, 0)
    out = np.clip(p[..., :3], 0, 255)
    info = PngInfo()
    info.add_text(TAG, '1')
    Image.fromarray(np.rint(out).astype(np.uint8), 'RGB').save(path, optimize=True, pnginfo=info)


def main(argv):
    check_only = '--check' in argv
    force = '--force' in argv
    names = [a for a in argv if not a.startswith('--')]
    envs = names or ENVS
    for env in envs:
        d = os.path.join(ROOT, env)
        if not os.path.isdir(d):
            print(f'{env}: no folder')
            continue
        print(env)
        for kind in STRIPS:
            path = os.path.join(d, kind + '.png')
            if os.path.exists(path):
                process_strip(path, env, kind, check_only, force)
        cave = os.path.join(d, 'cave.png')
        if os.path.exists(cave):
            process_cave(cave, env, check_only, force)
    if check_only:
        print('(check only: nothing was written)')


if __name__ == '__main__':
    main(sys.argv[1:])
