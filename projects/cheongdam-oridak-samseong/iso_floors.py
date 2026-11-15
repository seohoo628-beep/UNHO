"""Generate isometric 3D floor-stack SVG for the space composition slide."""
import math

COS30 = math.cos(math.radians(30))

w, d, t = 380, 260, 26
gap = 128
z1F = 0
zB1 = -gap
shaft_top = z1F + 2 * gap + 62

# canvas sized around projected extents
W, H = 780, 950
OX, OY = 386, 400  # projection origin

def sxy(x, y, z):
    return OX + (x - y) * COS30, OY + (x + y) * 0.5 - z

def P(x, y, z):
    a, b = sxy(x, y, z)
    return f"{a:.1f},{b:.1f}"

def slab(z, top, left, right, stroke):
    a, b, c, e = (0, 0), (w, 0), (w, d), (0, d)
    lf = f'<polygon points="{P(*e,z)} {P(*c,z)} {P(*c,z-t)} {P(*e,z-t)}" fill="{left}" stroke="{stroke}" stroke-width="2"/>'
    rf = f'<polygon points="{P(*c,z)} {P(*b,z)} {P(*b,z-t)} {P(*c,z-t)}" fill="{right}" stroke="{stroke}" stroke-width="2"/>'
    topf = f'<polygon points="{P(*a,z)} {P(*b,z)} {P(*c,z)} {P(*e,z)}" fill="{top}" stroke="{stroke}" stroke-width="2"/>'
    return lf + rf + topf

def prism(x0, y0, pw, pd, zlo, zhi, top, left, right, stroke):
    a, b, c, e = (x0, y0), (x0 + pw, y0), (x0 + pw, y0 + pd), (x0, y0 + pd)
    lf = f'<polygon points="{P(*e,zhi)} {P(*c,zhi)} {P(*c,zlo)} {P(*e,zlo)}" fill="{left}" stroke="{stroke}" stroke-width="2"/>'
    rf = f'<polygon points="{P(*c,zhi)} {P(*b,zhi)} {P(*b,zlo)} {P(*c,zlo)}" fill="{right}" stroke="{stroke}" stroke-width="2"/>'
    topf = f'<polygon points="{P(*a,zhi)} {P(*b,zhi)} {P(*c,zhi)} {P(*e,zhi)}" fill="{top}" stroke="{stroke}" stroke-width="2"/>'
    return lf + rf + topf

GOLD = "#C9A227"
GOLD_L = "#E3C567"
CREAM = "#EFE3C8"
CREAM_D1 = "#C6AE7B"
CREAM_D2 = "#A98F55"
INK = "#15130E"

floors = [
    ("B1", zB1, "#6E5A2E", "#4A3D20", "#3A301A", "#8C7746", "#F3E7C9"),
    ("1F", z1F, CREAM, CREAM_D1, CREAM_D2, GOLD, INK),
    ("2F", z1F + gap, CREAM, CREAM_D1, CREAM_D2, GOLD, INK),
    ("3F", z1F + 2 * gap, CREAM, CREAM_D1, CREAM_D2, GOLD, INK),
]

parts = []

# ground line (G.L.): horizontal dashed line at ground-level front corner height
gy = OY + (w + d) * 0.5
parts.append(f'<line x1="18" y1="{gy:.1f}" x2="{W-18}" y2="{gy:.1f}" stroke="#57534A" stroke-width="2" stroke-dasharray="10 8"/>')
parts.append(f'<text x="24" y="{gy-10:.1f}" font-family="Pretendard" font-size="22" fill="#8A857A">G.L.</text>')

# dumbwaiter shaft at right-rear corner, drawn before slabs so slabs sit in front
sx0, sy0, sw_, sd_ = w - 52, 14, 36, 36
parts.append(prism(sx0, sy0, sw_, sd_, zB1 - t, shaft_top, GOLD_L, "#8C6F16", GOLD, "#E3C567"))

# floor slabs bottom-up; labels float outside the front-left corner of each slab
for name, z, top, left, right, stroke, txtcol in floors:
    parts.append(slab(z, top, left, right, stroke))
    cx, cy = sxy(0, d, z - t * 0.5)
    parts.append(
        f'<text x="{cx-22:.1f}" y="{cy+3:.1f}" font-family="Pretendard SemiBold, Pretendard, sans-serif" '
        f'font-size="40" font-weight="600" fill="#E9DCC3" text-anchor="end">{name}</text>'
    )

# rising chevrons beside the shaft (screen-space, vertically aligned)
ax, ay = sxy(sx0 + sw_, sy0 + sd_ * 0.5, 0)
ax += 30
for zz in [zB1 + 66, z1F + 62, z1F + gap + 62, z1F + 2 * gap + 56]:
    cy = ay - zz
    parts.append(
        f'<path d="M {ax-11:.1f} {cy+8:.1f} L {ax:.1f} {cy-7:.1f} L {ax+11:.1f} {cy+8:.1f}" '
        f'fill="none" stroke="{GOLD_L}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" opacity="0.92"/>'
    )

svg = (
    f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">'
    + "".join(parts)
    + "</svg>"
)
with open("deck_assets/iso_floors.svg", "w") as f:
    f.write(svg)
print("wrote deck_assets/iso_floors.svg")
