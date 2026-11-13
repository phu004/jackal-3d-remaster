"""Draft layout for the SECRET LEVEL (the snow level reached from stage 5's secret helipad). Designed by hand, not from an NES map: the NES game had no secret stage.

    python tools/secret_to_level.py

Writes src/levels/secret/terrain.txt   one char per 8x8-px cell (1.25 m), north at the top
       src/levels/secret/entities.json objects in map-pixel coordinates (x = col*8+4, y = row*8+4)
       tools/secret_preview.png        a picture of the layout to look at (4 px per cell)

THE LAYOUT (200 cols x 200 rows = 250 m x 250 m, the user's own sketch): all flat except the mountains.
  WEST EDGE    a continuous snow-covered MOUNTAIN range ('X', cliffs: see cliff in index.js), 8..20 % of the width, wavering.
  EAST / NORTH the SEA ('S' for now: shallow water you can drive through, a PLACEHOLDER for the frozen sea): everything east of a curve that
               runs down from the top (col 66) and sweeps round east to the right edge at row ~152. The ISLAND (col 164, row 39) is in its north-east corner.
  the corridor between the mountains and the sea (west to north) leads up to the LASER FENCE (row 24, gate gap) and the summit beyond (later).
  SOUTH        the land where the level starts (sunny; the snow begins here).
Terrain chars: . land   S water   W wall   X mountain.
Re-running overwrites the outputs: put changes in this file, not in them.
"""
import json
import math
import random
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'src' / 'levels' / 'secret'
COLS, ROWS, CELL = 200, 200, 8
FENCE_ROW = 24
IN0, IN1 = 0, COLS - 1
random.seed(7)

# the sketch's outlines, in the drawing's pixels (the map is the square x 563..1210, y 243..865)
def cell_pt(x, y): return (x - 563) / 647 * COLS, (y - 243) / 622 * ROWS
MOUNTAIN_EDGE = [cell_pt(*p) for p in [(652, 243), (657, 290), (690, 370), (690, 395), (650, 460), (648, 490), (680, 570), (683, 630), (662, 660), (675, 710), (678, 770), (655, 810), (613, 865)]]
SEA_EDGE = [cell_pt(*p) for p in [(778, 243), (768, 320), (785, 440), (810, 520), (850, 590), (885, 610), (900, 660), (945, 695), (1020, 715), (1070, 708), (1210, 718)]]
def interp_row(pts, r):  # col of a polyline at a row (the polyline runs top to bottom)
    for (c0, r0), (c1, r1) in zip(pts, pts[1:]):
        if r0 <= r <= r1: return c0 + (c1 - c0) * (r - r0) / max(1e-6, r1 - r0)
    return pts[0][0] if r < pts[0][1] else pts[-1][0]
def in_poly(poly, c, r):
    inside = False
    for (c0, r0), (c1, r1) in zip(poly, poly[1:] + poly[:1]):
        if (r0 > r) != (r1 > r) and c < c0 + (c1 - c0) * (r - r0) / (r1 - r0): inside = not inside
    return inside
SEA_POLY = SEA_EDGE + [(COLS + 5, SEA_EDGE[-1][1]), (COLS + 5, -5), (SEA_EDGE[0][0], -5)]
ISLAND = dict(row=cell_pt(0, 363)[1], col=cell_pt(1095, 0)[0], rc=28, rr=31)

def wob(c, r): return 1 + .1 * math.sin(c / 3.0 + r / 5.0) + .07 * math.sin(c / 1.7 - r / 2.9)
g = [['.'] * COLS for _ in range(ROWS)]
def put(r, c, ch):
    if 0 <= r < ROWS and 0 <= c < COLS: g[r][c] = ch
for r in range(ROWS):
    for c in range(COLS):
        # (the coast wanders at three scales: long bays and headlands, coves, and small bumps and notches)
        dx = 5 * math.sin(r / 11.0 + 1.3) + 2.6 * math.sin(r / 4.3 + .4) + 1.3 * math.sin(r / 1.9 + 2.1) + .7 * math.sin(r / .9)
        dz = 5 * math.sin(c / 12.0 + .7) + 2.6 * math.sin(c / 4.6 + 2.0) + 1.3 * math.sin(c / 2.1 + .5) + .7 * math.sin(c / .8)
        f = min(1.0, (COLS - 1 - c) / 14.0, r / 14.0)  # (the wobble dies away toward the east and north edges, where the sea runs off the map: no stray bits of land there)
        if in_poly(SEA_POLY, c + .5 + dx * f, r + .5 + dz * f): put(r, c, 'S')
# The island: an ellipse (its coast wobbling with it) over the sea. ISL_SHIFT moves the whole island in tiles (1.25 m each): 2.4 east and 2.4 north = 3 m each way. Everything standing on it is placed against the island as it was (so the random
# placement is unchanged) and then moved by the same amount, below.
ISL_DC, ISL_DR = 10.4, -2.4   # (2.4 east and 2.4 north of where it was drawn, then 8 tiles (10 m) further east)
sea_only = [row[:] for row in g]
ISL_SCALE = .78   # the island drawn smaller (the same shape, scaled about its middle: 78% of the original); what stands on it is scaled in toward its middle the same way, below
def island_cells(dc, dr, k=1.0):
    def old_pt(r, c): return ISLAND['row'] + (r - ISLAND['row'] - dr) / k, ISLAND['col'] + (c - ISLAND['col'] - dc) / k   # (where this cell lies on the island as it was drawn)
    out = set()
    for r in range(ROWS):
        for c in range(COLS):
            ro, co = old_pt(r, c)
            if ((ro - ISLAND['row']) / ISLAND['rr']) ** 2 + ((co - ISLAND['col']) / ISLAND['rc']) ** 2 <= wob(co, ro) ** 2 and sea_only[r][c] == 'S': out.add((r, c))
    return out
old_island, new_island = island_cells(0, 0), island_cells(ISL_DC, ISL_DR, ISL_SCALE)
ISL_DC = 14.0   # (the island is moved as far east as it goes without touching the map's east edge, never cut: from far out, west in small steps until its easternmost column is 2 short of the edge, which leaves a column of sea there)
new_island = island_cells(ISL_DC, ISL_DR, ISL_SCALE)
while any(c >= COLS - 2 for r, c in new_island) and ISL_DC > -20:
    ISL_DC -= .1; new_island = island_cells(ISL_DC, ISL_DR, ISL_SCALE)
print('island centre world x', round(-125 + (ISLAND['col'] + ISL_DC + .5) * 1.25, 1), '| easternmost island column', max(c for r, c in new_island), 'of', COLS - 1)
for r, c in new_island: put(r, c, '.')
def drop_islets(maxn=40):  # tiny bits of land cut off from everything else (the island's wobbling coast can leave one a few metres across, off its west side): a dark patch of bare beach in the sea; they go back to sea
    seen = set()
    for r0 in range(ROWS):
        for c0 in range(COLS):
            if g[r0][c0] != '.' or (r0, c0) in seen: continue
            st, cells = [(r0, c0)], []; seen.add((r0, c0))
            while st:
                r, c = st.pop(); cells.append((r, c))
                for dr, dc in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    rr, cc = r + dr, c + dc
                    if 0 <= rr < ROWS and 0 <= cc < COLS and g[rr][cc] == '.' and (rr, cc) not in seen: seen.add((rr, cc)); st.append((rr, cc))
            if len(cells) < maxn:
                for r, c in cells: g[r][c] = 'S'
drop_islets()
for r in range(ROWS):  # the mountains
    for c in range(int(interp_row(MOUNTAIN_EDGE, r) + 1.2 * math.sin(r / 4.0))): put(r, c, 'X')
# the laser fence: a wall across the corridor between the mountains and the sea, with a gap for the gate
for c in range(70):  # (the corridor only: not across the island)
    if g[FENCE_ROW][c] == '.' and not 43 <= c <= 51: put(FENCE_ROW, c, 'W')

# the SUMMIT ROAD: an opening in the mountains at the west, at world (-75.7, -206.8): a road of about 110 m that switches back up the massif to a plateau, rising 30 m. The tiles along it are opened ('X' -> '.') so the jeep can
# drive it (the height is visual only: mountains.js raises the ground along the road and builds the cliff walls beside it, see `summit` in index.js); the dense path is written to summit.json.
SUMMIT_CTRL = [(-57.2, -190.6), (-57.3, -196.5), (-58.6, -202.2), (-62.0, -205.7), (-66.0, -206.7), (-70.0, -206.8), (-75.7, -206.8), (-86, -206.8), (-98, -206.8), (-105, -204), (-108.5, -196), (-109, -184), (-107.5, -172), (-108.5, -160), (-109, -150), (-112, -143), (-115.5, -137), (-117, -133)]   # west from the opening, then south all the way up
SUMMIT_HALF = 3.3   # m: half the road's width
SUMMIT_PLATEAU = (-117.0, -130.0, 6.8)
SUMMIT_PLATEAU_Z2 = -110.0
SUMMIT_PLATEAU_X2 = -126.5   # (and 6 m further west: the plateau is a rounded rectangle, the axis rectangle x -123..-117, z -130..-120, grown by r; the part beyond the map's west edge is the level's `extend`)
EXT_COLS = 8   # tiles (10 m) beyond the west edge   # (the plateau is a capsule: a disc dragged from z -130 south to z -120, 10 m longer to the south, and 1 m wider)
def catmull(pts, step=1.0):
    P = [pts[0]] + list(pts) + [pts[-1]]; out = []
    for i in range(1, len(P) - 2):
        p0, p1, p2, p3 = P[i - 1], P[i], P[i + 1], P[i + 2]
        n = max(2, int(math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / step))
        for k in range(n):
            t = k / n; t2 = t * t; t3 = t2 * t
            out.append(tuple(.5 * ((2 * p1[a]) + (-p0[a] + p2[a]) * t + (2 * p0[a] - 5 * p1[a] + 4 * p2[a] - p3[a]) * t2 + (-p0[a] + 3 * p1[a] - 3 * p2[a] + p3[a]) * t3) for a in (0, 1)))
    out.append(tuple(pts[-1])); return out
SUMMIT_ON = True
SUMMIT_PTS = catmull(SUMMIT_CTRL)
# the second arm of the Y: the branch from the north, leaving the main road (which runs north-west up there) heading south and bending west into the mouth, joining the first at x = -70
SUMMIT_CTRL_B = [(-61.9, -222.0), (-60.9, -217.5), (-60.5, -213.0), (-61.5, -209.5), (-64.0, -207.5), (-67.0, -206.9), (-70.0, -206.8), (-77.0, -206.8), (-86.0, -206.8)]   # (it runs on along the first arm's line, past the junction, and fades out there: it must not end with a visible cap where the two meet)
SUMMIT_PTS_B = catmull(SUMMIT_CTRL_B)
TOPZ = -270.0   # world z of the map's top edge (it moves north when the NORTH rows are added, below)
def to_cell(x, z): return ((x + 125) / 1.25 - .5, (z - TOPZ) / 1.25 - .5)
for r in range(ROWS if SUMMIT_ON else 0):
    for c in range(COLS):
        wx, wz = -125 + (c + .5) * 1.25, -270 + (r + .5) * 1.25
        near = min(math.hypot(wx - q[0], wz - q[1]) for q in SUMMIT_PTS)
        if (near <= SUMMIT_HALF + .6 or math.hypot(wx - min(max(wx, SUMMIT_PLATEAU_X2), SUMMIT_PLATEAU[0]), wz - min(max(wz, SUMMIT_PLATEAU[1]), SUMMIT_PLATEAU_Z2)) <= SUMMIT_PLATEAU[2]) and g[r][c] == 'X': put(r, c, '.')
# the POW village (south-west): a walled compound TILTED to square up to the branch road. Its gate is at world (-36.6, -25.8) = cell (70.2, 178.7); the road runs straight in through it, square on to the main road
# (which here runs along T); the compound lies beyond the gate along N, 34 cells wide (along T) and 24 deep.
VG = (70.2, 178.7); VT = (-0.85, -0.52); VN = (-0.52, 0.85); VHALF, VDEEP, VGAP = 17, 24, 3.5
def vpt(a, b): return (VG[0] + VT[0] * a + VN[0] * b, VG[1] + VT[1] * a + VN[1] * b)
# (the village's walls are not map cells: they are angled wall segments listed in index.js, drawn and blocked by world.js)

terrain = [''.join(row) for row in g]
# the map runs on 20 m (16 rows) further south than the sketch: more beach, and the mountains carry on down the west edge
EXTRA = 16
last = terrain[-1]; edge = last.index('.')
for i in range(1, EXTRA + 1):
    e = max(4, int(round(edge - .4 * i)))
    terrain.append('X' * e + '.' * (COLS - e))
ROWS += EXTRA


def px(col, row): return col * CELL + 4, row * CELL + 4
ents = []
def add(t, col, row, **kw):
    x, y = px(col, row); ents.append({'type': t, 'x': x, 'y': y, **kw})
def land(r, c): return 0 <= r < ROWS and 0 <= c < COLS and terrain[r][c] == '.'
def scatter(t, n, r0, r1, c0, c1, avoid=(), gap=6, reject=None, **kw):
    placed = []
    tries = 0
    while len(placed) < n and tries < 4000:
        tries += 1
        r, c = random.randint(r0, r1), random.randint(c0, c1)
        if not land(r, c) or not all(land(r + dr, c + dc) for dr in (-2, 2) for dc in (-2, 2)): continue
        if reject and reject(r, c): continue
        if any(abs(r - a) < gap and abs(c - b) < gap for a, b in placed + list(avoid)): continue
        placed.append((r, c)); add(t, c, r, **kw)
    return placed

def put_ent(t, col, row, **kw):  # (an object on open land only: a spot that isn't is reported, not placed)
    if not land(row, col): print('  NOT ON LAND, skipped:', t, col, row); return
    add(t, col, row, **kw)
# --- the beach (south, the start): the jeep, two POW huts, guns, tanks, soldiers
add('start', (110.2 + 125) / 1.25 - .5, (-28.6 + 270) / 1.25 - .5)   # the transport lands here: world (110.2, -28.6); the jeep rolls out of its rear, 10 m to the north-west
# (removed: assets are being placed by hand) put_ent('tent', 62, 168, w=52, h=39, rot=90); put_ent('tent', 166, 178, w=52, h=39, rot=-90)
# (removed: assets are being placed by hand) for c, r in [(66, 150), (110, 160), (150, 168)]: put_ent('turret', c, r, w=32, h=32)
# (removed: assets are being placed by hand) for c, r in [(70, 175), (140, 185), (110, 172)]: put_ent('lighttank', c, r)
scatter('soldier', 12, 160, 190, 45, COLS - 9, avoid=[(193, 100)])
put_ent('pickup', 100, 176)

# --- the island (north-east): the POWER PLANT (a barracks stands in for it), three POW huts, the helipad, guns, tanks, soldiers
ic, ir = round(ISLAND['col']), round(ISLAND['row'])
n_island0 = len(ents); terrain_new = terrain
terrain = [''.join('.' if (r, c) in old_island - new_island else 'S' if (r, c) in new_island - old_island else ch for c, ch in enumerate(row)) for r, row in enumerate(terrain_new)]   # (the island as it was, for placing things on it)
# (removed: the island's placeholder hut: put_ent('barracks', ic, ir - 14, w=56, h=48, look='brown', scale=1.08))
# (the island's placeholder helipad is gone: the evac helicopters use the summit pad, below)
# (removed: assets are being placed by hand) for dc, dr in [(-14, 0), (14, 0), (0, -2)]: put_ent('tent', ic + dc, ir + dr, w=52, h=39, rot=0)
# (removed: assets are being placed by hand) for dc, dr in [(-18, -12), (18, -12), (0, -24), (-20, 4), (20, 4)]: put_ent('turret', ic + dc, ir + dr, w=32, h=32)
# (removed: assets are being placed by hand) for dc, dr in [(-12, 8), (12, 8)]: put_ent('lighttank', ic + dc, ir + dr)
PLANT = (90 - 21.6 * .62 - 3, 90 + 21 * .62 + 3, -238 - 36 * .62 - 3, -238 + 16.3 * .62 + 3)   # the power station's footprint in world metres (x0, x1, z0, z1: land part and fuel pier, with 3 m round it), see powerStation in index.js
def island_world(r, c):   # where a tile of the island as first drawn ends up once the island is scaled and moved
    ox, oy = px(ISLAND['col'], ISLAND['row']); x, y = px(c, r)
    return ((ox + (x - ox) * ISL_SCALE + ISL_DC * CELL - 800) / 6.4, (oy + (y - oy) * ISL_SCALE + ISL_DR * CELL - 1728) / 6.4)
def under_plant(r, c): x, z = island_world(r, c); return PLANT[0] < x < PLANT[1] and PLANT[2] < z < PLANT[3]
scatter('soldier', 12, ir - 22, ir + 22, ic - 22, ic + 22, avoid=[(ir + 14, ic)], gap=5, reject=under_plant)
PICKUP_AT = (70.5, -218.0)   # (the island's pickup, on the strip of ground west of the power station)
terrain = terrain_new
ocx, ocy = px(ISLAND['col'], ISLAND['row'])
GUARDS = [(111.2, -220.0, 1, .45, 0.8), (108.5, -239.5, -1, .45, 4.4), (100.9, -206.1, -1, .45, 3.9), (86.5, -205.5, 1, .45, 2.2), (77.5, -215.5, -1, .45, 5.3), (76.8, -233.9, 1, .45, 1.5)]   # five roof-gun style turrets (stage 6's wallturret, on a concrete base) spread round the island's perimeter, 8 to 10 m in from the water (past the dark beach), mostly on the side the player comes from: x, z, which way it sweeps when idle (1 or -1), how fast (rad/s), the way it starts out facing
for gx, gz, gd, gs, gst in GUARDS: ents.append({'type': 'wallturret', 'x': round(gx * 6.4 + 800, 1), 'y': round(gz * 6.4 + 1728, 1), 'w': 32, 'h': 32, 'lift': 0, 'pedestal': 1.2, 'base': 'bunker', 'range': 34, 'scan': {'dir': gd, 'speed': gs, 'start': gst}})
ents.append({'type': 'pickup', 'x': round(PICKUP_AT[0] * 6.4 + 800, 1), 'y': round(PICKUP_AT[1] * 6.4 + 1728, 1)}); n_island0 = n_island0   # (appended after the island's contents are moved, below)
for e in ents[n_island0:-(1 + len(GUARDS))]: e['x'] = round(ocx + (e['x'] - ocx) * ISL_SCALE + ISL_DC * CELL, 1); e['y'] = round(ocy + (e['y'] - ocy) * ISL_SCALE + ISL_DR * CELL, 1)   # (and now the whole island and all on it moves)

# --- the corridor up to the fence (west to north) and the fence itself
# (removed: assets are being placed by hand) for c, r in [(34, 62), (52, 40)]: put_ent('mediumtank', c, r)
# (removed: assets are being placed by hand) for c, r in [(37, 34), (56, 34), (48, 80)]: put_ent('turret', c, r, w=32, h=32)
scatter('soldier', 8, 26, 90, 28, 62, gap=5)
add('gate', 47, FENCE_ROW, w=64, h=32, look='orange', curtain=True, snowRoof=True)         # the laser fence's gate: a curtain of red energy (no doors)

# --- the enemy armour: 8 medium tanks spread along the road (alternating the mountain side and the sea side of the corridor, so the road is covered from both), and 2 M270 rocket launchers at the corridor's two narrowest points
def span(r):  # the land between the mountains and the sea on a row: (first land col, first sea col)
    row = terrain[r]; x = row.rfind('X') + 1; sc = row.find('S', x); return x, (sc if sc >= 0 else COLS)
def put_tank(kind, r, c, **kw):
    if all(land(r + dr, c + dc) for dr in (-3, 0, 3) for dc in (-3, 0, 3)): add(kind, c, r, **kw)
    else: print('  NOT ON OPEN LAND, skipped:', kind, c, r)
for i, r in enumerate([42, 66, 92, 118, 140]):
    x, sc = span(r); put_tank('mediumtank', r, x + 10 if i in (0, 2) else sc - 10)   # (the last one moved to the sea side: the second engineer hut stands on the mountain side there)
for r, c in [(176, 120), (181, 163), (168, 92)]: put_tank('mediumtank', r, c)   # (the one by the start moved 6 m west)
for r in (34, 86):   # one at the narrowest stretch of the corridor (about 35 m wide, just below the fence), one further down the road, on the mountain side of each, covering the road
    x, sc = span(r); put_tank('m270', r, x + 9, rot=-135 if r == 34 else -45)

# --- an ENGINEER hut (a brown-roofed barracks: blow it open and an engineer comes out) near the north road
add('barracks', (67.3 + 125) / 1.25 - .5, (-54.8 + 270) / 1.25 - .5, w=56, h=48, look='brown', scale=1.08, snowRoof=True)
add('barracks', (-69.4 + 125) / 1.25 - .5, (-97.8 + 270) / 1.25 - .5, w=56, h=48, look='brown', scale=1.08, snowRoof=True)   # a second engineer hut, by the foot of the mountains

# --- the POW village: huts in the compound (long sides along the road), and its gate
for a_, b_, br in [(-11, 6, 'west'), (10, 9, 'east'), (-12, 17.5, 'west'), (11, 19, 'east')]:   # (all turned the same way, along the road; the exit is on the side that faces the middle of the village)
    c, r = vpt(a_, b_); add('tent', c, r, w=39, h=52, rot=-31.5, breach=br, snowRoof=True)
for a_ in (-8, 8):   # two gun turrets outside the gate, one each side of the road
    c, r = vpt(a_, -4); add('turret', c, r, w=32, h=32, rot=-31.5, snowRoof=True)   # (turned to square up with the gate and the wall, and placed exactly: a turret on each side of the road at the same distance)
add('gate', VG[0], VG[1], w=56, h=16, rot=-31.5, look='brown', snowRoof=True)

# THE SECOND ASCENT: the map runs on 125 m (100 rows) further north. The corridor carries on past the fence, then ends at a second massif across its whole width (the west range and the sea's shore on each side), and a road
# switches back up it in three legs to a big plateau 50 m up (the boss's, later). mountains.js raises the ground along it exactly as along the west summit (`summit2` in index.js); the tiles along it are opened here.
NORTH = 150
S2_FRONT = int(round((-274 - (-270 - NORTH * 1.25)) / 1.25))   # the massif's front (rows from the new top: the foot of the road is at world z -274)
S2_LEGS, S2_GAP, S2_Z0, S2_W, S2_E = 6, 20.0, -290.0, -110.0, -62.0   # six legs, 20 m apart, west end x -110, east end x -62
S2_CTRL = [(-68, -246), (-68, -268), (-70, -278)]
for _i in range(S2_LEGS):
    _z = S2_Z0 - S2_GAP * _i; _west = _i % 2 == 0; _xs = [-84, -98, S2_W] if _west else [-100, -84, -72, S2_E]
    if _i: _xs = list(reversed(_xs)) if False else _xs
    S2_CTRL += [(_x, _z) for _x in _xs]
    if _i < S2_LEGS - 1: S2_CTRL.append(((S2_W - 3) if _west else (S2_E + 2), _z - S2_GAP / 2))   # the hairpin's outer point
S2_CTRL += [(-64, S2_Z0 - S2_GAP * (S2_LEGS - 1) - 8), (-70, S2_Z0 - S2_GAP * (S2_LEGS - 1) - 14)]
S2_PLATEAU = dict(x=-66.0, x2=-106.0, z=-438.0, z2=-404.0, r=14.0)
S2_HALF = 5.2   # m: half the SECOND road's width (the first road keeps SUMMIT_HALF, 3.3): wider, so the tanks' shells can be dodged on it
north = []
for i in range(NORTH):
    _r = i + 37.0; _g = min(1.0, (NORTH - 1 - i) / 14.0)   # (the shore wanders the way the old coast does: at three scales plus a per-row jitter, so its tile-steps are irregular, not a regular staircase; it dies away toward the old part's top row)
    _ss = lambda f: 0.0 if f <= 0 else 1.0 if f >= 1 else f * f * (3 - 2 * f)
    _calm = 0.0 * _ss((i - 76) / 8.0) * (1 - _ss((i - 124) / 8.0))   # (rows 84..124, world z -352..-302: the east coast along the start of the climb, in full view: only the long slow bends, no small bumps (those show as stair-steps), the bends themselves gentler)
    sea0 = 66 + int(round(_g * .75 * (5 * (1 - .6 * _calm) * math.sin(_r / 11.0 + 1.3) + (1 - _calm) * (2.6 * math.sin(_r / 4.3 + .4) + 1.3 * math.sin(_r / 1.9 + 2.1) + .7 * math.sin(_r / .9)))))
    row = ['X'] * COLS
    for c in range(27, COLS):
        wall = 28 + int(round(1.5 * math.sin(i / 5.0)))
        front = S2_FRONT + int(round(2 * math.sin(c / 4.0) + math.sin(c / 1.7)))
        edge = 55
        if c >= sea0: row[c] = 'S'
        elif i < front and c < edge: row[c] = 'X'
        elif i >= front and c < wall: row[c] = 'X'
        else: row[c] = '.'
    north.append(row)
for e in ents: e['y'] += NORTH * CELL
terrain = [''.join(r) for r in north] + terrain
ROWS += NORTH; TOPZ -= NORTH * 1.25
S2_PTS = catmull(S2_CTRL)
_g2 = [list(r) for r in terrain]
for r in range(NORTH + 24):
    for c in range(COLS):
        wx, wz = -125 + (c + .5) * 1.25, TOPZ + (r + .5) * 1.25
        near = min(math.hypot(wx - q[0], wz - q[1]) for q in S2_PTS if abs(q[1] - wz) < 12) if any(abs(q[1] - wz) < 12 for q in S2_PTS) else 1e9
        pa = math.hypot(wx - min(max(wx, S2_PLATEAU['x2']), S2_PLATEAU['x']), wz - min(max(wz, S2_PLATEAU['z']), S2_PLATEAU['z2']))
        if (near <= S2_HALF + .6 or pa <= S2_PLATEAU['r'] + 3.2) and _g2[r][c] == 'X': _g2[r][c] = '.'
terrain = [''.join(r) for r in _g2]
_L2 = [0.0]
for _a in range(1, len(S2_PTS)): _L2.append(_L2[-1] + math.hypot(S2_PTS[_a][0] - S2_PTS[_a - 1][0], S2_PTS[_a][1] - S2_PTS[_a - 1][1]))
def _s2w(i, span=9):   # the tracks' width factor at a point of the second road: 1 on the straight, down to .72 where the road turns hard (the heading changes by 90 degrees or more over 2 x span metres)
    a, b = S2_PTS[max(0, i - span)], S2_PTS[min(len(S2_PTS) - 1, i + span)]; m = S2_PTS[i]
    h1 = math.atan2(m[1] - a[1], m[0] - a[0]); h2 = math.atan2(b[1] - m[1], b[0] - m[0]); d = abs((h2 - h1 + math.pi) % (2 * math.pi) - math.pi)
    k = min(1.0, d / (math.pi / 2)); return round(1 - .28 * k * k * (3 - 2 * k), 2)
# the tracks end where the road is nearest (-106, -387) (the start of the fifth leg): they fade into the snow over the 16 m before it, and the last stretch to the plateau has none
_end = min(range(len(S2_PTS)), key=lambda i: math.hypot(S2_PTS[i][0] + 106, S2_PTS[i][1] + 387)); _fade = 16
S2_TRAIL = []
for i in list(range(0, _end, 3)) + [_end]:
    if S2_PTS[i][1] >= -268.0: continue
    f = min(1.0, (_end - i) / _fade); f = f * f * (3 - 2 * f)
    S2_TRAIL.append([round(to_cell(*S2_PTS[i])[0], 2), round(to_cell(*S2_PTS[i])[1], 2), round(f, 2), _s2w(i)])
(OUT / 'summit2.json').write_text(json.dumps({'pts': [[round(q[0], 2), round(q[1], 2)] for q in S2_PTS], 'length': round(_L2[-1], 1), 'halfW': S2_HALF, 'plateau': S2_PLATEAU, 'trail': S2_TRAIL}))   # (the tracks of the main road carry on up the second ascent, from where the old trail ends north of the laser gate: index.js joins them to it)
print('second ascent road length', round(_L2[-1], 1), 'm')

meta = {'source': 'designed by hand (tools/secret_to_level.py)', 'cell': CELL, 'width': COLS * CELL, 'height': ROWS * CELL, 'pad': [32, 32]}
_st = next(e for e in ents if e['type'] == 'start')
for e in ents:   # the foot soldier by the start: 6 m further west
    if e['type'] == 'soldier' and math.hypot(e['x'] - _st['x'], e['y'] - _st['y']) < 20 * 6.4: e['x'] -= 6 * 6.4
if SUMMIT_ON:   # the EVAC helipad on the summit (the landing circle is 3.75 m west of the entity, so the entity sits 3.75 m east of the pad's middle (-121, -119.5); the pad itself is drawn by assets/summitpad.js)
    ents.append({'type': 'flametank', 'x': round(-132 * 6.4 + COLS * CELL / 2, 2), 'y': round(-121 * 6.4 + ROWS * CELL, 2)})   # a flame tank at the west end of the summit plateau, world (-132, -121)
    ents.append({'type': 'barracks', 'x': round(-127 * 6.4 + COLS * CELL / 2, 2), 'y': round(-132.3 * 6.4 + ROWS * CELL, 2), 'w': 56, 'h': 48, 'look': 'brown', 'scale': 1.08, 'snowRoof': True, 'rot': 25})   # an engineer hut on the summit plateau, turned 25 degrees, world (-127, -132.3)
    _hc, _hr = to_cell(-116, -111.5); ents.append({'type': 'helipad', 'x': round((_hc + .5) * CELL, 2), 'y': round((_hr + .5) * CELL, 2), 'w': 112, 'h': 64})
OUT.mkdir(parents=True, exist_ok=True)
(OUT / 'terrain.txt').write_text('\n'.join(terrain) + '\n')
_r0 = int(((SUMMIT_PLATEAU[1] - SUMMIT_PLATEAU[2] - 6) - TOPZ) / 1.25); _r1 = int(((SUMMIT_PLATEAU_Z2 + SUMMIT_PLATEAU[2] + 6) - TOPZ) / 1.25)   # the rows beyond the west edge that are tiles (the rest of the way out is the usual forest)
def _ext_tile(r, j):
    wx, wz = -125 - (j + .5) * 1.25, TOPZ + (r + .5) * 1.25
    if SUMMIT_ON and math.hypot(wx - min(max(wx, SUMMIT_PLATEAU_X2), SUMMIT_PLATEAU[0]), wz - min(max(wz, SUMMIT_PLATEAU[1]), SUMMIT_PLATEAU_Z2)) <= SUMMIT_PLATEAU[2]: return '.'
    return 'X'
EXTEND = {'r0': _r0, 'r1': _r1, 'cols': EXT_COLS, 'rows': [''.join(_ext_tile(r, j) for j in range(EXT_COLS)) for r in range(_r0, _r1 + 1)]} if SUMMIT_ON else None
_L = [0.0]
for _a in range(1, len(SUMMIT_PTS)): _L.append(_L[-1] + math.hypot(SUMMIT_PTS[_a][0] - SUMMIT_PTS[_a - 1][0], SUMMIT_PTS[_a][1] - SUMMIT_PTS[_a - 1][1]))
(OUT / 'summit.json').write_text(json.dumps({'pts': [[round(q[0], 2), round(q[1], 2)] for q in SUMMIT_PTS], 'length': round(_L[-1], 1), 'halfW': SUMMIT_HALF, 'plateau': {'x': SUMMIT_PLATEAU[0], 'z': SUMMIT_PLATEAU[1], 'z2': SUMMIT_PLATEAU_Z2, 'x2': SUMMIT_PLATEAU_X2, 'r': SUMMIT_PLATEAU[2]}, 'extend': EXTEND, 'trail2': (lambda pts, cum: [[round(to_cell(*pts[i])[0], 2), round(to_cell(*pts[i])[1], 2), round((lambda f: f * f * (3 - 2 * f))(min(1.0, cum[i] / 9.0)) * (lambda f: f * f * (3 - 2 * f))(min(1.0, (cum[-1] - cum[i]) / 9.0)), 2)] for i in range(0, len(pts), 3)] + [[round(to_cell(*pts[-1])[0], 2), round(to_cell(*pts[-1])[1], 2), 0]])(SUMMIT_PTS_B, [sum(math.hypot(SUMMIT_PTS_B[a][0] - SUMMIT_PTS_B[a - 1][0], SUMMIT_PTS_B[a][1] - SUMMIT_PTS_B[a - 1][1]) for a in range(1, i + 1)) for i in range(len(SUMMIT_PTS_B))]), 'trail': [[round(to_cell(*SUMMIT_PTS[i])[0], 2), round(to_cell(*SUMMIT_PTS[i])[1], 2), round((lambda f: f * f * (3 - 2 * f))(min(1.0, _L[i] / 9.0)) * (lambda f: f * f * (3 - 2 * f))(min(1.0, (_L[-1] - _L[i]) / 8.0)), 2)] for i in range(0, len(SUMMIT_PTS), 3)] + [[round(to_cell(*SUMMIT_PTS[-1])[0], 2), round(to_cell(*SUMMIT_PTS[-1])[1], 2), 0]]}))   # (a Y junction: the branch leaves the main road, which here runs along x = -58.8, heading the same way (north) and bends away west; its tracks fade in over the first 14 m, growing out of the main road's tracks)
print('summit road length', round(_L[-1], 1), 'm')
(OUT / 'entities.json').write_text(json.dumps({'meta': meta, 'entities': ents}, indent=1))

# world coordinates (metres) of a cell, for the config in index.js: x = (px - width/2)/6.4, z = (py - height)/6.4
def world(col, row): x, y = px(col, row); return round((x - meta['width'] / 2) / 6.4, 1), round((y - meta['height']) / 6.4, 1)
print('start', world(100, 193), '| island centre', world(ic, ir), '| fence', world(47, FENCE_ROW), '| sea edge z', world(100, 152)[1], '| subs', [world(*p) for p in [(110, 70), (130, 110), (100, 130)]])

# a picture of the layout
try:
    from PIL import Image, ImageDraw
    S = 4
    img = Image.new('RGB', (COLS * S, ROWS * S)); d = ImageDraw.Draw(img)
    colour = {'X': (90, 96, 104), '.': (222, 228, 236), 'S': (60, 110, 170), 'W': (200, 60, 50)}
    for r in range(ROWS):
        for c in range(COLS): d.rectangle([c * S, r * S, c * S + S - 1, r * S + S - 1], fill=colour[terrain[r][c]])
    mark = {'start': (0, 200, 0), 'helipad': (255, 255, 0), 'tent': (255, 140, 0), 'turret': (200, 0, 200), 'lighttank': (220, 0, 0), 'mediumtank': (130, 0, 0), 'soldier': (30, 30, 30), 'barracks': (0, 0, 0), 'gate': (255, 80, 0), 'pickup': (0, 220, 220)}
    for e in ents:
        x, y = e['x'] * S / CELL, e['y'] * S / CELL; k = mark.get(e['type'], (0, 0, 0)); big = e['type'] in ('barracks', 'helipad', 'gate', 'start', 'mediumtank')
        d.ellipse([x - (5 if big else 2), y - (5 if big else 2), x + (5 if big else 2), y + (5 if big else 2)], fill=k)
    img.save(ROOT / 'tools' / 'secret_preview.png')
except ImportError:
    print('(PIL missing: no preview picture)')
print('wrote', OUT)
