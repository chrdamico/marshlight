import math
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter

OUT = Path(__file__).resolve().parent.parent / 'public' / 'icons'
OUT.mkdir(parents=True, exist_ok=True)


def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(len(a)))


def icon(size, pad=0.0):
    S = size * 4
    img = Image.new('RGBA', (S, S), (0, 0, 0, 255))
    px = img.load()
    top, bot = (16, 24, 52), (6, 9, 18)
    for y in range(S):
        c = lerp(top, bot, y / S)
        for x in range(S):
            px[x, y] = c + (255,)
    d = ImageDraw.Draw(img)
    cx, cy = S / 2, S * 0.56
    scale = S * (1 - pad * 2)

    glow = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    for i in range(40, 0, -1):
        r = scale * 0.46 * i / 40
        a = int(150 * (1 - i / 40) ** 1.6)
        gd.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(140, 230, 255, a))
    glow = glow.filter(ImageFilter.GaussianBlur(S * 0.03))
    img.alpha_composite(glow)

    reeds = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    rd = ImageDraw.Draw(reeds)
    base = S * (0.92 - pad * 0.6)
    for i, (x, h, lean) in enumerate([(0.12, 0.30, -0.02), (0.18, 0.22, 0.03), (0.82, 0.27, 0.02), (0.88, 0.19, -0.03), (0.76, 0.16, 0.01), (0.25, 0.14, 0.0)]):
        x0 = pad * S + x * scale
        top_y = base - h * scale
        rd.line([(x0, base), (x0 + lean * scale, top_y)], fill=(20, 34, 40, 255), width=max(2, int(S * 0.012)))
        if i % 2 == 0:
            rd.ellipse([x0 + lean * scale - S * 0.012, top_y - S * 0.035, x0 + lean * scale + S * 0.012, top_y + S * 0.02], fill=(36, 30, 26, 255))
    rd.rectangle([0, base, S, S], fill=(12, 26, 32, 255))
    img.alpha_composite(reeds)

    r = scale * 0.17
    body = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    bd = ImageDraw.Draw(body)
    pts = []
    for k in range(0, 181):
        a = math.pi * k / 180
        pts.append((cx + math.cos(a) * r, cy + math.sin(a) * r))
    tipx, tipy = cx + r * 0.15, cy - r * 2.2
    for k in range(1, 41):
        t = k / 40
        x = (1 - t) ** 2 * (cx - r) + 2 * (1 - t) * t * (cx - r * 0.95) + t * t * tipx
        y = (1 - t) ** 2 * cy + 2 * (1 - t) * t * (cy - r * 1.1) + t * t * tipy
        pts.append((x, y))
    for k in range(1, 41):
        t = k / 40
        x = (1 - t) ** 2 * tipx + 2 * (1 - t) * t * (cx + r * 0.95) + t * t * (cx + r)
        y = (1 - t) ** 2 * tipy + 2 * (1 - t) * t * (cy - r * 1.2) + t * t * cy
        pts.append((x, y))
    bd.polygon(pts, fill=(200, 246, 255, 255))
    inner = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    idr = ImageDraw.Draw(inner)
    for i in range(30, 0, -1):
        rr = r * 1.4 * i / 30
        a = int(255 * (1 - i / 30) ** 0.8)
        idr.ellipse([cx - rr, cy + r * 0.1 - rr, cx + rr, cy + r * 0.1 + rr], fill=(255, 255, 255, a))
    body.alpha_composite(Image.composite(inner, Image.new('RGBA', (S, S), (0, 0, 0, 0)), body.split()[3]))
    halo = body.filter(ImageFilter.GaussianBlur(S * 0.025))
    img.alpha_composite(halo)
    img.alpha_composite(body)
    d = ImageDraw.Draw(img)
    ex, ew, eh = r * 0.38, r * 0.13, r * 0.26
    for sx in (-1, 1):
        d.ellipse([cx + sx * ex - ew, cy + r * 0.05 - eh, cx + sx * ex + ew, cy + r * 0.05 + eh], fill=(18, 48, 64, 255))
    return img.resize((size, size), Image.LANCZOS)


def rounded(img, radius):
    m = Image.new('L', img.size, 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, img.size[0] - 1, img.size[1] - 1], radius=radius, fill=255)
    out = Image.new('RGBA', img.size, (0, 0, 0, 0))
    out.paste(img, (0, 0), m)
    return out


icon(512).save(OUT / 'icon-512.png')
icon(192).save(OUT / 'icon-192.png')
icon(512, pad=0.1).save(OUT / 'maskable-512.png')
icon(180).convert('RGB').save(OUT / 'apple-touch-icon.png')
rounded(icon(64), 14).resize((32, 32), Image.LANCZOS).save(OUT / 'favicon-32.png')
print('icons written to', OUT)
