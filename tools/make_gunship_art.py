"""Generates the painted enemy-gunship sprites in art/sprites/gunship/ (flat gouache fills, stitched seams,
iron bands, rivets). Run with the ComfyUI embedded python (numpy + PIL):  python tools/make_gunship_art.py

gasbag.png and hullplate.png are NEUTRAL (mid grey = no change) and are laid over each gunship's own bag / hull colour with
the 'overlay' blend in gunshipArt.js, so every generated gunship keeps her own colours. engine.png, port.png and dome.png
are full colour (iron + oxblood)."""
import numpy as np, math, os, sys
from PIL import Image, ImageDraw, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', 'art', 'sprites', 'gunship')
OUT = os.environ.get('GUNSHIP_OUT', OUT)
os.makedirs(OUT, exist_ok=True)
INK = (62, 44, 32)
rng = np.random.default_rng(11)


def smooth(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def lowfreq(h, w, cell, amp):
    lo = rng.normal(0, 1, (h // cell + 2, w // cell + 2)).astype(np.float32)
    lo = np.asarray(Image.fromarray(lo).resize((w, h), Image.BICUBIC), dtype=np.float32)
    return lo * amp


# ---------------------------------------------------------------- gasbag (neutral, overlay)
def gasbag():
    W, H, k = 1600, 400, 2
    Wk, Hk = W * k, H * k
    cx, cy = Wk / 2, Hk / 2
    rx, ry = Wk / 2 - 6 * k, Hk / 2 - 6 * k
    yy, xx = np.mgrid[0:Hk, 0:Wk].astype(np.float32)
    v = np.clip((yy - cy) / ry, -1, 1)
    s = np.sqrt(np.clip(1 - v * v, 1e-4, 1))
    u = np.clip((xx - cx) / (rx * s), -1.3, 1.3)
    N = 11
    f = (u + 1) / 2 * N
    pidx = np.clip(np.floor(f), 0, N - 1).astype(int)
    base = 128 + rng.normal(0, 5, N).astype(np.float32)[pidx]
    col = base + lowfreq(Hk, Wk, 70, 6.0)
    # top light, belly shadow, darker tips
    shadow = smooth(-0.1, 1.0, v) * 0.5 + smooth(0.55, 1.0, v) * 0.15
    col = col * (1 - shadow) + 52 * shadow
    hi = smooth(-0.95, -0.5, v) * (1 - smooth(-0.5, -0.1, v))
    hi *= 1 - smooth(0.75, 1.0, np.abs((xx - cx) / rx))
    col = col * (1 - 0.5 * hi) + 205 * 0.5 * hi
    tip = smooth(0.8, 1.0, np.abs((xx - cx) / rx)) * 0.25
    col = col * (1 - tip) + 70 * tip
    # crude seams: dark line + a rough double row of dashes beside it
    fr = f - np.floor(f)
    dxp = np.minimum(fr, 1 - fr) * (2.0 / N) * rx * s
    fade = smooth(0.06, 0.25, s)
    seam = (1 - smooth(1.8 * k, 3.4 * k, dxp)) * fade
    col = col * (1 - 0.65 * seam) + 28 * 0.65 * seam
    dash = ((yy / (11 * k)).astype(int) % 2 == 0)
    st = (np.abs(dxp - 7 * k) < 1.1 * k) & dash & (fade > 0.5)
    col = np.where(st, col * 0.62, col)
    rgb = np.repeat(col[..., None], 3, axis=2)
    img = Image.fromarray(np.clip(rgb, 0, 255).astype(np.uint8), 'RGB')
    d = ImageDraw.Draw(img)

    def g(v_):
        return (int(v_),) * 3

    # iron bands following the meridians (at panel seams 2, 5 (centre is the emblem), 8)
    def band(i):
        pts_l, pts_r = [], []
        for yv in np.linspace(-0.97, 0.97, 80):
            sv = math.sqrt(1 - yv * yv)
            uc = -1 + 2 * i / N
            x = cx + uc * rx * sv
            y = cy + yv * ry
            hw = 9 * k * (0.5 + 0.5 * sv)
            pts_l.append((x - hw, y))
            pts_r.append((x + hw, y))
        poly = pts_l + pts_r[::-1]
        d.polygon(poly, fill=g(58))
        d.line(pts_l + [pts_r[-1]], fill=g(22), width=2 * k)
        d.line(pts_r, fill=g(22), width=2 * k)
        for yv in np.linspace(-0.9, 0.9, 19):
            sv = math.sqrt(1 - yv * yv)
            x = cx + (-1 + 2 * i / N) * rx * sv
            y = cy + yv * ry
            r = 3.0 * k * (0.6 + 0.4 * sv)
            d.ellipse([x - r, y - r + k, x + r, y + r + k], fill=g(34))
            d.ellipse([x - r, y - r, x + r, y + r], fill=g(176))
    for i in (2, 4, 7, 9):
        band(i)
    # emblem backdrop: a rope-bound stitched disc in the middle
    ex, ey = cx, cy + 6 * k
    er_x, er_y = 118 * k, 82 * k
    d.ellipse([ex - er_x - 6 * k, ey - er_y - 6 * k, ex + er_x + 6 * k, ey + er_y + 6 * k], fill=g(30))
    d.ellipse([ex - er_x, ey - er_y, ex + er_x, ey + er_y], fill=g(104))
    for a in np.linspace(0, 2 * math.pi, 46, endpoint=False):
        x0 = ex + math.cos(a) * (er_x - 8 * k)
        y0 = ey + math.sin(a) * (er_y - 8 * k)
        x1 = ex + math.cos(a) * (er_x + 2 * k)
        y1 = ey + math.sin(a) * (er_y + 2 * k)
        d.line([x0, y0, x1, y1], fill=g(40), width=2 * k)

    # rough patches: irregular, cross-stitched, a bit lighter or darker than the cloth
    def patch(px, py, pw, ph, val, seed):
        r2 = np.random.default_rng(seed)
        pts = [(px, py), (px + pw * 0.5, py - 3 * k), (px + pw, py + 2 * k), (px + pw + 3 * k, py + ph * 0.5),
               (px + pw, py + ph), (px + pw * 0.45, py + ph + 3 * k), (px - 2 * k, py + ph - 2 * k), (px - 3 * k, py + ph * 0.45)]
        pts = [(x + r2.normal(0, 1.5 * k), y + r2.normal(0, 1.5 * k)) for x, y in pts]
        d.polygon([(x + 3 * k, y + 4 * k) for x, y in pts], fill=g(70))
        d.polygon(pts, fill=g(val))
        d.line(pts + [pts[0]], fill=g(34), width=2 * k)
        for t in np.arange(10 * k, pw - 6 * k, 14 * k):
            for yo in (7 * k, ph - 7 * k):
                x, y = px + t, py + yo
                d.line([x - 4 * k, y - 4 * k, x + 4 * k, y + 4 * k], fill=g(40), width=int(1.6 * k))
                d.line([x - 4 * k, y + 4 * k, x + 4 * k, y - 4 * k], fill=g(40), width=int(1.6 * k))
    for (px, py, pw, ph, val, sd) in [(300, 95, 130, 78, 150, 1), (1090, 215, 118, 70, 106, 2), (520, 250, 96, 58, 112, 3), (1230, 70, 100, 60, 146, 4), (150, 215, 82, 56, 150, 5)]:
        patch(px * k, py * k, pw * k, ph * k, val, sd)
    # rigging rings along the belly
    for X in (190, 440, 700, 900, 1160, 1410):
        ix = X * k
        iy = cy + ry * math.sqrt(max(0.0, 1 - ((ix - cx) / rx) ** 2)) - 14 * k
        r = 8 * k
        d.ellipse([ix - r, iy - r + k, ix + r, iy + r + k], fill=g(30))
        d.ellipse([ix - r, iy - r, ix + r, iy + r], fill=g(170), outline=g(26), width=2 * k)
        d.ellipse([ix - r * .4, iy - r * .4, ix + r * .4, iy + r * .4], fill=g(60))
    arr = np.asarray(img, dtype=np.float32)
    # alpha: the ellipse, antialiased by the downscale
    A = Image.new('L', (Wk, Hk), 0)
    ImageDraw.Draw(A).ellipse([cx - rx - 2 * k, cy - ry - 2 * k, cx + rx + 2 * k, cy + ry + 2 * k], fill=255)
    out = Image.fromarray(arr.astype(np.uint8), 'RGB').convert('RGBA')
    out.putalpha(A)
    out.resize((W, H), Image.LANCZOS).save(os.path.join(OUT, 'gasbag.png'))


# ---------------------------------------------------------------- hull plate tile (neutral, overlay), seamless both ways
def hullplate():
    W, H, k = 480, 640, 2          # 240 x 320 world units at 2 px/unit
    Wk, Hk = W * k, H * k
    img = Image.new('RGB', (Wk, Hk), (128, 128, 128))
    d = ImageDraw.Draw(img)
    rowh = Hk // 5
    pw = Wk // 2
    r2 = np.random.default_rng(5)
    G = lambda v_: (int(v_),) * 3

    def wrapped(fn):
        for ox in (-Wk, 0, Wk):
            for oy in (-Hk, 0, Hk):
                fn(ox, oy)
    for row in range(5):
        off = (pw // 2) if row % 2 else 0
        for c in range(2):
            x0 = c * pw + off
            y0 = row * rowh
            val = 128 + int(r2.integers(-9, 10))

            def plate(ox, oy, x0=x0, y0=y0, val=val):
                X0, Y0 = x0 + ox, y0 + oy
                d.rectangle([X0, Y0, X0 + pw, Y0 + rowh], fill=G(val))
                # soft top light, bottom shade inside each plate (painted bevel)
                for t in range(0, 7 * k):
                    a = 1 - t / (7 * k)
                    d.line([X0, Y0 + t, X0 + pw, Y0 + t], fill=G(val + 34 * a))
                    d.line([X0, Y0 + rowh - t, X0 + pw, Y0 + rowh - t], fill=G(val - 40 * a))
            wrapped(plate)
    # seams + rivets
    def seams(ox, oy):
        for row in range(5):
            off = (pw // 2) if row % 2 else 0
            y0 = row * rowh + oy
            d.line([ox, y0, ox + Wk, y0], fill=G(26), width=3 * k)
            for c in range(3):
                x = c * pw + off + ox
                d.line([x, y0, x, y0 + rowh], fill=G(26), width=3 * k)
                for fy in (0.2, 0.8):
                    for dxs in (-12 * k, 12 * k):
                        rx_, ry_ = x + dxs, y0 + rowh * fy
                        r = 4.2 * k
                        d.ellipse([rx_ - r, ry_ - r + 1.8 * k, rx_ + r, ry_ + r + 1.8 * k], fill=G(40))
                        d.ellipse([rx_ - r, ry_ - r, rx_ + r, ry_ + r], fill=G(188))
                        d.ellipse([rx_ - r * .45, ry_ - r * .55, rx_ + r * .1, ry_ - r * .05], fill=G(236))
            # a row of mid-plate rivets along top/bottom edges
            for c in range(0, 8):
                x = (c + 0.5) * pw / 4 + ox
                for fy in (0.1, 0.9):
                    r = 2.6 * k
                    d.ellipse([x - r, y0 + rowh * fy - r, x + r, y0 + rowh * fy + r], fill=G(150))
    wrapped(seams)
    # a few rust/soot scuffs (wrap-safe by drawing at offsets)
    for i in range(14):
        sx, sy = r2.integers(0, Wk), r2.integers(0, Hk)
        ln, wd = r2.integers(30, 90) * k, r2.integers(4, 9) * k
        tone = int(r2.choice([84, 100, 168]))
        for ox in (-Wk, 0, Wk):
            for oy in (-Hk, 0, Hk):
                d.rounded_rectangle([sx + ox, sy + oy, sx + ox + ln, sy + oy + wd], radius=wd // 2, fill=G(tone))
    # two bolted repair patches
    for (px, py, w_, h_) in [(180, 240, 150, 100), (620, 840, 130, 90)]:
        for ox in (-Wk, 0, Wk):
            for oy in (-Hk, 0, Hk):
                x, y = px * k * 0.5 + ox, py * k * 0.5 + oy
                d.rectangle([x + 3 * k, y + 4 * k, x + w_ * k * 0.5 + 3 * k, y + h_ * k * 0.5 + 4 * k], fill=G(70))
                d.rectangle([x, y, x + w_ * k * 0.5, y + h_ * k * 0.5], fill=G(156), outline=G(26), width=2 * k)
                for cx_, cy_ in [(x + 8 * k, y + 8 * k), (x + w_ * k * 0.5 - 8 * k, y + 8 * k), (x + 8 * k, y + h_ * k * 0.5 - 8 * k), (x + w_ * k * 0.5 - 8 * k, y + h_ * k * 0.5 - 8 * k)]:
                    d.ellipse([cx_ - 3 * k, cy_ - 3 * k, cx_ + 3 * k, cy_ + 3 * k], fill=G(210))
    img = img.filter(ImageFilter.GaussianBlur(0.6 * k))
    img.resize((W, H), Image.LANCZOS).save(os.path.join(OUT, 'hullplate.png'))


# ---------------------------------------------------------------- helpers for coloured sprites
def newcanvas(w, h, k=4):
    return Image.new('RGBA', (w * k, h * k), (0, 0, 0, 0)), k


def save(img, w, h, name):
    img.resize((w, h), Image.LANCZOS).save(os.path.join(OUT, name))


def grad_rect(d, box, top, bot, k):
    x0, y0, x1, y1 = box
    n = int(y1 - y0)
    for i in range(n):
        t = i / max(1, n - 1)
        c = tuple(int(top[j] * (1 - t) + bot[j] * t) for j in range(3)) + (255,)
        d.line([x0, y0 + i, x1, y0 + i], fill=c)


def rivet(d, x, y, r, k):
    d.ellipse([x - r, y - r + k, x + r, y + r + k], fill=(24, 20, 22, 255))
    d.ellipse([x - r, y - r, x + r, y + r], fill=(150, 142, 138, 255), outline=INK + (255,), width=max(1, k // 2))
    d.ellipse([x - r * .4, y - r * .6, x + r * .1, y - r * .1], fill=(214, 206, 196, 255))


# ---------------------------------------------------------------- engine nacelle (box -44..48 x, -40..24 y, world; 2px/unit)
def engine():
    w, h, k = 184, 128, 4
    img, _ = canvas_for(w, h, k)
    d = ImageDraw.Draw(img)
    S = lambda x, y: ((x + 44) * 2 * k, (y + 40) * 2 * k)
    iron_t, iron_b = (96, 88, 92), (46, 40, 46)
    # exhaust stack
    sx0, sy0 = S(-6, -34)
    sx1, sy1 = S(8, -16)
    d.rectangle([sx0, sy0, sx1, sy1], fill=(36, 30, 32, 255), outline=INK + (255,), width=2 * k)
    d.rectangle([sx0 - 3 * k, sy0, sx1 + 3 * k, sy0 + 6 * k], fill=(60, 52, 56, 255), outline=INK + (255,), width=2 * k)
    # body: rounded iron barrel, light top / dark belly
    bx0, by0 = S(-34, -20)
    bx1, by1 = S(42, 20)
    body = Image.new('RGBA', (w * k, h * k), (0, 0, 0, 0))
    bd = ImageDraw.Draw(body)
    grad_rect(bd, (bx0, by0, bx1, by1), (128, 118, 120), (38, 32, 38), k)
    m = Image.new('L', (w * k, h * k), 0)
    ImageDraw.Draw(m).rounded_rectangle([bx0, by0, bx1, by1], radius=14 * 2 * k, fill=255)
    img.paste(body, (0, 0), m)
    d = ImageDraw.Draw(img)
    # oxblood band across the middle, charcoal cowl at the nose, brass-ish hub
    ox0, _ = S(0, 0)
    ox1, _ = S(16, 0)
    # cowl (nose end)
    cx0, cy0 = S(-40, -17)
    cx1, cy1 = S(-26, 17)
    d.rounded_rectangle([cx0, cy0, cx1, cy1], radius=6 * k, fill=(34, 30, 34, 255), outline=INK + (255,), width=2 * k)
    # band stripe (drawn clipped by simple rectangle inside body)
    d.rectangle([ox0, by0 + 2 * k, ox1, by1 - 2 * k], fill=(120, 40, 38, 255), outline=INK + (255,), width=int(1.6 * k))
    for yy in (S(0, -14)[1], S(0, 14)[1]):
        rivet(d, (ox0 + ox1) / 2, yy, 2.4 * k, k)
    # panel line + rivet rows
    for xx in (S(-14, 0)[0], S(26, 0)[0]):
        d.line([xx, by0 + 3 * k, xx, by1 - 3 * k], fill=(30, 26, 30, 255), width=2 * k)
    for xx in (S(-22, 0)[0], S(34, 0)[0]):
        for yy in (S(0, -12)[1], S(0, 12)[1]):
            rivet(d, xx, yy, 2.2 * k, k)
    # outline of body
    d.rounded_rectangle([bx0, by0, bx1, by1], radius=14 * 2 * k, outline=INK + (255,), width=int(2.4 * k))
    # shaft stub
    sx, sy = S(-44, 0)
    d.rectangle([sx, sy - 3 * k, S(-38, 0)[0], sy + 3 * k], fill=(70, 64, 66, 255), outline=INK + (255,), width=k)
    save(img, w, h, 'engine.png')


def canvas_for(w, h, k):
    return Image.new('RGBA', (w * k, h * k), (0, 0, 0, 0)), k


# ---------------------------------------------------------------- cannon port ring (48x48 world, 96px)
def port():
    w, h, k = 96, 96, 4
    img, _ = canvas_for(w, h, k)
    d = ImageDraw.Draw(img)
    c = w * k / 2
    R = 22 * 2 * k
    d.ellipse([c - R, c - R + 3 * k, c + R, c + R + 3 * k], fill=(24, 18, 20, 120))
    # iron ring, light top-left to dark bottom-right
    ring = Image.new('RGBA', img.size, (0, 0, 0, 0))
    rd = ImageDraw.Draw(ring)
    grad_rect(rd, (c - R, c - R, c + R, c + R), (136, 126, 126), (40, 34, 40), k)
    m = Image.new('L', img.size, 0)
    ImageDraw.Draw(m).ellipse([c - R, c - R, c + R, c + R], fill=255)
    img.paste(ring, (0, 0), m)
    d = ImageDraw.Draw(img)
    d.ellipse([c - R, c - R, c + R, c + R], outline=INK + (255,), width=int(2.4 * k))
    r2 = 15 * 2 * k
    d.ellipse([c - r2, c - r2, c + r2, c + r2], fill=(74, 30, 30, 255), outline=INK + (255,), width=int(2 * k))
    r3 = 10 * 2 * k
    d.ellipse([c - r3, c - r3, c + r3, c + r3], fill=(30, 24, 26, 255), outline=INK + (255,), width=int(2 * k))
    for a in np.linspace(0, 2 * math.pi, 8, endpoint=False) + 0.4:
        rivet(d, c + math.cos(a) * 18.6 * 2 * k, c + math.sin(a) * 18.6 * 2 * k, 2.2 * k, k)
    save(img, w, h, 'port.png')


# ---------------------------------------------------------------- turret dome (box 48 x 42 world; dome centre (24,24), r 20)
def dome():
    w, h, k = 96, 84, 4
    img, _ = canvas_for(w, h, k)
    d = ImageDraw.Draw(img)
    cx, cy, R = 48 * k, 48 * k, 40 * k
    # base ring
    d.rounded_rectangle([8 * k, 52 * k, 88 * k, 80 * k], radius=5 * k, fill=(52, 46, 52, 255), outline=INK + (255,), width=int(2.4 * k))
    d.rectangle([12 * k, 54 * k, 84 * k, 60 * k], fill=(96, 88, 90, 255))
    for x in (18, 36, 60, 78):
        rivet(d, x * k, 70 * k, 2.6 * k, k)
    # dome: oxblood iron, lit from the top
    dm = Image.new('RGBA', img.size, (0, 0, 0, 0))
    dd = ImageDraw.Draw(dm)
    grad_rect(dd, (cx - R, cy - R, cx + R, cy), (170, 74, 66), (84, 30, 32), k)
    m = Image.new('L', img.size, 0)
    ImageDraw.Draw(m).pieslice([cx - R, cy - R, cx + R, cy + R], 180, 360, fill=255)
    img.paste(dm, (0, 0), m)
    d = ImageDraw.Draw(img)
    d.arc([cx - R, cy - R, cx + R, cy + R], 180, 360, fill=INK + (255,), width=int(2.4 * k))
    d.line([cx - R, cy, cx + R, cy], fill=INK + (255,), width=int(2.4 * k))
    # a charcoal band and gun slit
    d.arc([cx - R + 9 * k, cy - R + 9 * k, cx + R - 9 * k, cy + R - 9 * k], 200, 340, fill=(36, 28, 30, 255), width=4 * k)
    d.ellipse([cx - 9 * k, cy - 30 * k, cx + 9 * k, cy - 14 * k], fill=(214, 190, 160, 110))
    save(img, w, h, 'dome.png')


if __name__ == '__main__':
    only = sys.argv[1:] or ['gasbag', 'hullplate', 'engine', 'port', 'dome']
    for n in only:
        globals()[n]()
        print('made', n)
