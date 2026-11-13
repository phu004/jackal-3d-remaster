"""Convert the ripped NES Jackal stage 5 map (the enemy airbase approach) into level data for the remaster.

    python tools/stage5_to_level.py [debug.png]

Reads  reference/jackal-stage-5-nes-map.webp  (512 x 2932, title banner on top)
Writes src/levels/stage5/terrain.txt    one char per 8x8-pixel NES cell, north at the top
       src/levels/stage5/entities.json  objects, in map-pixel coordinates (banner removed)

Terrain chars:  .  open ground (drivable)
                X  plateau: a raised grass shelf with a rock face (impassable, drawn raised; the NES's light green ledges)
                V  chasm: a deep valley (impassable, drawn as a drop with a rocky floor; the NES's black pits)
                G  bridge deck over a chasm (drivable)      Y  the bridge's parapet and footway over the chasm (impassable)
                g  deck on solid ground (the bridge's approach, drivable)   y  its parapet on solid ground (impassable)
                F  scrub: bushes and mid-sized trees (impassable; the NES's dark green woods at the edges)
                N  wire fence (blocks driving and walking, not shots)   n  a fence's steel gate (blocks everything)
                W  compound walls   K  the airbase at the top (the boss area: closed for now)   H  helipad concrete
Everything else on the map (turrets, huts, mines) is an entity or left for later: those cells read as ground.

Re-running overwrites the outputs: put fixes in MANUAL below rather than editing them.
"""
import json
import sys
from pathlib import Path

import numpy as np
from scipy import ndimage
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'reference' / 'jackal-stage-5-nes-map.webp'
OUT = ROOT / 'src' / 'levels' / 'stage5'
HEADER = 60
CELL = 8

rgb = lambda r, g, b: (r << 16) | (g << 8) | b
BLACK = [rgb(0, 0, 0)]
BROWN = [rgb(123, 65, 0)]
GRAY = [rgb(123, 125, 123), rgb(189, 190, 189)]
FOREST = [rgb(49, 97, 66)]
LEDGE = [rgb(74, 162, 107)]

BRIDGE_EXT = 2      # cells the bridge's approach reaches over the solid ground at each end

MANUAL = [
    {'type': 'start', 'x': 208, 'y': 2840},
    # the helipad (the NES map's gun-metal platform with the star and the STOP strip on its east side)
    {'type': 'helipad', 'x': 328, 'y': 528, 'w': 112, 'h': 64},
    # the two huts in the north compound and the three in the south one (the NES's orange buildings): civilian POW huts
    {'type': 'tent', 'x': 192, 'y': 1024, 'w': 52, 'h': 39, 'breach': 'east', 'windows': 'east', 'rot': -90},
    {'type': 'tent', 'x': 352, 'y': 1056, 'w': 39, 'h': 52, 'breach': 'west'},
    {'type': 'tent', 'x': 418, 'y': 2351, 'w': 39, 'h': 52, 'breach': 'west'},
    {'type': 'tent', 'x': 192, 'y': 2428, 'w': 39, 'h': 52, 'breach': 'east'},
    {'type': 'tent', 'x': 384, 'y': 2428, 'w': 39, 'h': 52, 'breach': 'west'},
    {'type': 'gate', 'x': 224, 'y': 1104, 'w': 64, 'h': 32, 'look': 'brown'},   # the north compound's south gate (the green doors)
    {'type': 'gate', 'x': 288, 'y': 2480, 'w': 64, 'h': 32, 'look': 'brown'},   # the south compound's south gate
    {'type': 'pickup', 'x': 304, 'y': 1856},   # the star on the middle bridge: shoot it to reveal it
    # the NES map's static gun emplacements (grey 32x32 blocks)
    # the airbase's energy gate (the orange doors in the middle of its wall) and the five gun emplacements behind the wall (the boss fight's optional targets)
    # the four wall-mounted guns (optional targets): either side of the gate, one beyond each end of the garages, on top of the wall (z -436.4)
    {'type': 'wallturret', 'x': 60.8, 'y': 79, 'w': 32, 'h': 32}, {'type': 'wallturret', 'x': 236.2, 'y': 79, 'w': 32, 'h': 32}, {'type': 'wallturret', 'x': 339.2, 'y': 79, 'w': 32, 'h': 32}, {'type': 'wallturret', 'x': 501.8, 'y': 79, 'w': 32, 'h': 32},
    {'type': 'gate', 'x': 288, 'y': 79, 'w': 64, 'h': 16, 'look': 'airbase', 'energy': True},   # (hangs in the middle of the wall's thickness)
    {'type': 'turret', 'x': 176, 'y': 352, 'w': 32, 'h': 32},
    {'type': 'turret', 'x': 272, 'y': 352, 'w': 32, 'h': 32},
    {'type': 'turret', 'x': 207, 'y': 560, 'w': 32, 'h': 32},
    {'type': 'turret', 'x': 430, 'y': 560, 'w': 32, 'h': 32},
    {'type': 'turret', 'x': 304, 'y': 592, 'w': 32, 'h': 32},
    {'type': 'turret', 'x': 336, 'y': 592, 'w': 32, 'h': 32},
    {'type': 'turret', 'x': 400, 'y': 895, 'w': 32, 'h': 32},
    {'type': 'turret', 'x': 367, 'y': 926, 'w': 32, 'h': 32},
    {'type': 'turret', 'x': 145, 'y': 1215, 'w': 32, 'h': 32},
    {'type': 'turret', 'x': 112, 'y': 1246, 'w': 32, 'h': 32},
    {'type': 'turret', 'x': 80, 'y': 1277, 'w': 32, 'h': 32},
    {'type': 'turret', 'x': 336, 'y': 1375, 'w': 32, 'h': 32},
    {'type': 'turret', 'x': 368, 'y': 1375, 'w': 32, 'h': 32},
    {'type': 'turret', 'x': 175, 'y': 1551, 'w': 32, 'h': 32},
    {'type': 'turret', 'x': 240, 'y': 1551, 'w': 32, 'h': 32},
    {'type': 'turret', 'x': 336, 'y': 2175, 'w': 32, 'h': 32},
    {'type': 'turret', 'x': 431, 'y': 2175, 'w': 32, 'h': 32},
    {'type': 'turret', 'x': 336, 'y': 2335, 'w': 32, 'h': 32},
    # the grey corrugated engineer huts (the second from the bottom, y 2247, becomes the disguised garage later)
    {'type': 'barracks', 'x': 127, 'y': 505, 'w': 56, 'h': 48, 'look': 'grey', 'scale': 1.08},
    {'type': 'barracks', 'x': 160, 'y': 870, 'w': 56, 'h': 48, 'look': 'grey', 'scale': 1.08},
    {'type': 'barracks', 'x': 382, 'y': 1655, 'w': 56, 'h': 48, 'look': 'grey', 'scale': 1.08},
    {'type': 'barracks', 'x': 96, 'y': 2247, 'w': 60, 'h': 52, 'look': 'garage'},
    {'type': 'mediumtank', 'x': 96, 'y': 2240, 'hidden': True},                 # parked inside the garage hut, nose to the door, back against the rear wall, under the roof; it rolls out when the hut is blown open
    {'type': 'barracks', 'x': 191, 'y': 2758, 'w': 56, 'h': 48, 'look': 'grey', 'scale': 1.08},
    # the camouflaged guns (camo-turrets.js, with a dirt lid) in the ground north of the triple bridge: above the left bridge's west half, and either side of the middle bridge (the NES had them in the cliff face)
    {'type': 'camoturret', 'x': 40.3, 'y': 1713.6},
    {'type': 'camoturret', 'x': 235.5, 'y': 1752},
    {'type': 'camoturret', 'x': 389.1, 'y': 1745.6},
    # the sandbag arcs (open to the north, the NES's grey crescents), found by matching the sprite on the map: centres in map pixels
    {'type': 'foxhole', 'x': 176, 'y': 1579, 'w': 32, 'h': 20, 'look': 'grey'},
    {'type': 'foxhole', 'x': 208, 'y': 587, 'w': 32, 'h': 20, 'look': 'grey'},
    {'type': 'foxhole', 'x': 208, 'y': 1515, 'w': 32, 'h': 20, 'look': 'grey'},
    {'type': 'foxhole', 'x': 208, 'y': 1619, 'w': 32, 'h': 20, 'look': 'grey'},
    {'type': 'foxhole', 'x': 208, 'y': 2171, 'w': 32, 'h': 20, 'look': 'grey'},
    {'type': 'foxhole', 'x': 240, 'y': 587, 'w': 32, 'h': 20, 'look': 'grey'},
    {'type': 'foxhole', 'x': 240, 'y': 1579, 'w': 32, 'h': 20, 'look': 'grey'},
    {'type': 'foxhole', 'x': 240, 'y': 2203, 'w': 32, 'h': 20, 'look': 'grey'},
    {'type': 'foxhole', 'x': 272, 'y': 619, 'w': 32, 'h': 20, 'look': 'grey'},
    {'type': 'foxhole', 'x': 272, 'y': 2235, 'w': 32, 'h': 20, 'look': 'grey'},
    {'type': 'foxhole', 'x': 304, 'y': 619, 'w': 32, 'h': 20, 'look': 'grey'},
    {'type': 'foxhole', 'x': 304, 'y': 1403, 'w': 32, 'h': 20, 'look': 'grey'},
    {'type': 'foxhole', 'x': 336, 'y': 619, 'w': 32, 'h': 20, 'look': 'grey'},
    {'type': 'foxhole', 'x': 336, 'y': 1403, 'w': 32, 'h': 20, 'look': 'grey'},
    {'type': 'foxhole', 'x': 368, 'y': 619, 'w': 32, 'h': 20, 'look': 'grey'},
    {'type': 'foxhole', 'x': 368, 'y': 1403, 'w': 32, 'h': 20, 'look': 'grey'},
    {'type': 'foxhole', 'x': 400, 'y': 587, 'w': 32, 'h': 20, 'look': 'grey'},
    {'type': 'foxhole', 'x': 400, 'y': 1403, 'w': 32, 'h': 20, 'look': 'grey'},
    {'type': 'foxhole', 'x': 432, 'y': 587, 'w': 32, 'h': 20, 'look': 'grey'},
]
# the NES map's land mines (the orange rings), in map pixels
MINES = [(303, 932), (303, 1736), (336, 1736), (88, 1808), (128, 1864), (96, 1911), (112, 1984), (247, 2176), (279, 2208), (299, 2244)]
# the compounds' walls: (x0, y0, x1, y1) in map pixels, snapped to cells; the walls' front faces are 4 cells deep, the side walls one
WALLS = [
    (128, 960, 136, 1120), (408, 960, 416, 1120),           # the north compound's sides
    (136, 960, 288, 992), (320, 960, 408, 992),             # its top wall, with a gap between
    (136, 1088, 192, 1120), (256, 1088, 408, 1120),         # its bottom wall, the gate between
    (128, 2320, 136, 2496), (472, 2256, 480, 2496),         # the south compound's sides
    (136, 2320, 192, 2352), (224, 2320, 288, 2352),         # its inner top wall
    (288, 2256, 296, 2352), (296, 2256, 352, 2288), (384, 2256, 472, 2288),
    (128, 2464, 256, 2496), (320, 2464, 480, 2496),         # its bottom wall, the gate between
]

im = np.array(Image.open(SRC).convert('RGB'))[HEADER:].astype(np.int64)
H, W = im.shape[:2]
key = (im[..., 0] << 16) | (im[..., 1] << 8) | im[..., 2]
rows, cols = H // CELL, W // CELL
cells = key[:rows * CELL, :cols * CELL].reshape(rows, CELL, cols, CELL).transpose(0, 2, 1, 3)
share = lambda cs: np.isin(cells, cs).mean(axis=(2, 3))
S8 = np.ones((3, 3), bool)

brown, gray, black, ledge, forest = share(BROWN), share(GRAY), share(BLACK), share(LEDGE), share(FOREST)
ground = brown >= .45

# --- chasms: the black pits, with their rim rock (a band of grey on the north side, and along the slanted edges) ---
pit = ndimage.binary_opening(black >= .9, np.ones((3, 3)))
lab, n = ndimage.label(pit, S8)
for i, size in enumerate(ndimage.sum(pit, lab, range(1, n + 1)), 1):
    if size < 100: pit[lab == i] = False
north = np.array([[0, 1, 0], [0, 1, 0], [0, 0, 0]], bool)
chasm = pit.copy()
rim = ~ground & (forest < .1) & (ledge < .25) & (gray + black >= .2)
for _ in range(5): chasm |= ndimage.binary_dilation(chasm, north) & rim
for _ in range(2): chasm |= ndimage.binary_dilation(chasm, S8) & rim
chasm[:16, :] = False   # (the airbase at the top is no chasm)

# --- bridges: the blocks of stone that fill a gap in a pit (black on both sides of them) ---
closed = ndimage.binary_closing(np.pad(pit, ((0, 0), (30, 30))), np.ones((1, 25)))[:, 30:-30]
span = closed & ~pit & (gray >= .35)
span = ndimage.binary_opening(span, np.ones((5, 5)))
blab, bn = ndimage.label(span, np.ones((3, 3)))
bridges = []
for i in range(1, bn + 1):
    rr, cc = np.where(blab == i)
    if len(rr) < 60: continue
    bridges.append((rr.min(), rr.max(), cc.min(), cc.max()))
# a bridge's rows run from the chasm's north edge to its south edge, read off the chasm beside it
for k, (r0, r1, c0, c1) in enumerate(bridges):
    side = chasm[:, max(0, c0 - 2)] | chasm[:, min(cols - 1, c1 + 2)]
    ra, rb = r0, r1
    while ra > 0 and side[ra - 1]: ra -= 1
    while rb < rows - 1 and side[rb + 1]: rb += 1
    bridges[k] = (ra, rb, c0, c1)
    chasm[ra:rb + 1, c0:c1 + 1] = True

# --- plateaus: the light green ledges and their rock faces below ---
top = ndimage.binary_opening(ledge >= .3, np.ones((2, 2)))
lab, n = ndimage.label(top, S8)
for i, size in enumerate(ndimage.sum(top, lab, range(1, n + 1)), 1):
    if size < 40: top[lab == i] = False
plateau = top.copy()
plateau |= ndimage.binary_dilation(top, S8, iterations=1) & ~ground
down = np.array([[0, 0, 0], [0, 1, 0], [0, 1, 0]], bool)
for _ in range(5): plateau |= ndimage.binary_dilation(plateau, down) & ~ground & ~chasm
plateau &= ~chasm
plateau = ndimage.binary_closing(plateau, np.ones((3, 3))) & ~chasm
plateau[:16, :] = False
plateau[:, 0] |= plateau[:, 1]; plateau[:, -1] |= plateau[:, -2]  # a plateau that reaches the side edge takes the last column too (the world runs it on past the edge)

# --- scrub: the dark green woods along the edges ---
scrub = ndimage.binary_opening((forest >= .2) & (ledge < .6), np.ones((2, 2))) & ~chasm & ~plateau
lab, n = ndimage.label(scrub, S8)
for i, size in enumerate(ndimage.sum(scrub, lab, range(1, n + 1)), 1):
    if size < 8: scrub[lab == i] = False
scrub = ndimage.binary_dilation(scrub, S8) & ~chasm & ~plateau & ~ground | scrub
scrub[:16, :] = False

grid = np.full((rows, cols), '.', dtype='<U1')
grid[scrub] = 'F'
grid[plateau] = 'X'
grid[chasm] = 'V'
# the bridge decks and their parapets (the outer column each side), with approaches over the ground at both ends
for ra, rb, c0, c1 in bridges:
    for r in range(ra, rb + 1):
        for c in range(c0 - 1, c1 + 2):
            grid[r, c] = 'G' if c0 <= c <= c1 else 'Y'
    for k in range(1, BRIDGE_EXT + 1):
        for r in (ra - k, rb + k):
            for c in range(c0 - 1, c1 + 2):
                grid[r, c] = 'g' if c0 <= c <= c1 else 'y'
    print('bridge', 'rows', ra, rb, 'cols', c0, c1, '= x', c0 * CELL, (c1 + 1) * CELL, 'y', ra * CELL, (rb + 1) * CELL)

# the compounds' walls
for x0, y0, x1, y1 in WALLS:
    grid[y0 // CELL:y1 // CELL, x0 // CELL:x1 // CELL] = 'W'
# the gates' gaps
for e in MANUAL:
    if e['type'] != 'gate': continue
    for r in range((e['y'] - e['h'] // 2) // CELL, (e['y'] + e['h'] // 2 + CELL - 1) // CELL):
        for c in range((e['x'] - e['w'] // 2) // CELL, (e['x'] + e['w'] // 2 + CELL - 1) // CELL): grid[r, c] = '.'
# the airbase (the boss): the runway and hangars behind it stay closed ('K'); across the map a wall (rows 7-10, 'K') with the energy gate in the middle (cols 32-39) and,
# either side of the gate, a block of two garages (cols 11-26 and 45-60, 'K': game/airbase-boss.js builds them) whose doors face south onto open apron (rows 11-15)
grid[:16, :] = 'K'
grid[11:16, :] = '.'
grid[7:11, :] = 'K'   # (the wall itself is built by game/airbase-boss.js: thick, and running on past the map's sides)
for c0 in (11, 45):   # a block: 16 cells wide = pillar (2), bay (5), pillar (2), bay (5), pillar (2); the bays are open pockets (the closed doors are blockers: airbase-boss.js)
    grid[7:11, c0:c0 + 16] = 'K'
    for b0 in (c0 + 2, c0 + 9): grid[3:11, b0:b0 + 5] = '.'   # (the bays reach 10 m back: rows 3-10)
grid[7:16, 32:40] = '.'   # the road to the energy gate
# the helipad's concrete: the landing square and the STOP strip on its east side
for e in MANUAL:
    if e['type'] != 'helipad': continue
    w, h = e['w'], e['h']
    r0, r1 = (e['y'] - h // 2) // CELL, (e['y'] + h // 2 + CELL - 1) // CELL
    c0, c1 = (e['x'] - w // 2) // CELL, (e['x'] + w // 2 + CELL - 1) // CELL
    for r in range(r0, r1):
        for c in range(c0, c1 - 4): grid[r, c] = 'H'
    for r in range(r0 + 1, r1 - 1):
        for c in range(c1 - 4, c1): grid[r, c] = 'H'

# the wire fences (the NES's chain-link: they stop the jeep and the men, not the shots) and their steel gates (these stop everything). Rows (2 cells thick), columns, gate columns
FENCES = [
    (265, 266, 4, 60, [(12, 19), (44, 51)]),   # the long fence across the middle of the map, two gates
    (51, 52, 0, 63, [(24, 31)]),               # the fence across the road below the airbase, a gate in the middle
    (295, 296, 0, 15, []),                     # the short fence out to the west compound's wall
]
for r0, r1, c0, c1, gates in FENCES:
    for r in range(r0, r1 + 1):
        for c in range(c0, c1 + 1): grid[r, c] = '.' if any(g0 <= c <= g1 for g0, g1 in gates) else 'N' # (a gate's cells are open ground: the gate entity blocks them until it is shot down)
    for g0, g1 in gates: MANUAL.append({'type': 'gate', 'x': (g0 + g1 + 1) * CELL // 2, 'y': (r0 + r1 + 1) * CELL // 2, 'w': (g1 - g0 + 1) * CELL, 'h': 16, 'look': 'steel'})

out = [''.join(r) for r in grid]

# foot soldiers: one in each 85 m band on open ground, away from walls, the start, mines and everything else
rng = np.random.default_rng(1988)
open_ = ndimage.binary_erosion(grid == '.', np.ones((7, 7), bool))
fixed = [(e['x'], e['y']) for e in MANUAL if e['type'] not in ('start',)] + [(m[0], m[1]) for m in MINES]
band = 136   # px (about 21 m): one soldier in each band
soldiers = []
y = 2780
while y > 140:
    ys = [yy for yy in range(int(y - band), int(y)) if 0 <= yy // CELL < rows]
    for _ in range(200):
        yy = int(rng.choice(ys)); xx = int(rng.integers(40, W - 40))
        if not open_[yy // CELL, xx // CELL]: continue
        if any(abs(xx - fx) < 40 and abs(yy - fy) < 40 for fx, fy in fixed): continue
        soldiers.append({'type': 'soldier', 'x': xx, 'y': yy}); fixed.append((xx, yy)); break
    y -= band
mines = [{'x': x, 'y': y} for x, y in MINES]
# TEST: bush assets (bush.js) spread over open ground far north of the start (set TEST_BUSHES to 0 to drop them): to see whether the off-screen ones are culled
TEST_BUSHES = 0
bushes = []
brng = np.random.default_rng(77)
variants = ['leafy', 'leafy', 'flowering', 'scrub', 'scrub', 'fern', 'willow', 'juniper']
for _ in range(40000):
    if len(bushes) >= TEST_BUSHES: break
    xx = int(brng.integers(40, W - 40)); yy = int(brng.integers(140, 2300))
    if not open_[yy // CELL, xx // CELL]: continue
    if any(abs(xx - fx) < 26 and abs(yy - fy) < 26 for fx, fy in fixed): continue
    bushes.append({'type': 'bush', 'x': xx, 'y': yy, 'variant': variants[len(bushes) % len(variants)]}); fixed.append((xx, yy))

# objects added later go at the END of the list: a saved game records what is destroyed by an object's place in it, so adding in the middle would shift the others' numbers
EXTRA_END = [{'type': 'wallturret', 'x': 15.4, 'y': 79, 'w': 32, 'h': 32},
             {'type': 'gate', 'x': -156.0, 'y': 1240, 'w': 8, 'h': 64, 'look': 'airbase', 'pylons': True, 'rot': 90, 'energy': True}]   # the secret compound's energy gate, in the middle of its east wall (x -64.375, z -255), turned to run along Z   # a fifth wall gun, left of the leftmost one (x -37.6 m)
# the secret passage: a corridor cut through the forest at the map's left edge (rows 152-157 = z -258.75 .. -251.25, cols 0-7), leading out to an extra land mass beyond the left edge (stage.extend, see world.js):
# 42 columns (52.5 m) out from the edge over rows 139-170 (z -275 .. -235): a two-column forest border (open only where the corridor meets it), then an oval of open land, and forest round it. Done last, on the finished map,
# so it does not change where the soldiers and bushes above were placed.
for r in (154, 155): out[r] = '.' * 8 + out[r][8:]   # (a very narrow way: two rows)
EXT_R0, EXT_R1, EXT_COLS = 128, 181, 46   # (rows 139-170 are the land itself; the rows above and below are woods all the way out)
import math
def trail(j): # the way's middle row (in cell-edge coordinates) at column j: it twists a little between the bushes, then runs straight for the gate
    return 155 + 3.0 * math.sin(j * .42 + .5) * min(1, j / 3) * (1 - min(1, max(0, (j - 12) / 5)))
ER = []
for r in range(EXT_R0, EXT_R1 + 1):
    dz = (r - 154.5) / 16
    row = []
    for j in range(EXT_COLS):
        wob = .09 * math.sin(r * .9 + j * .35) + .07 * math.sin(r * .37 - j * .8)
        woods = dz * dz + ((j - 29.5) / 23) ** 2 < 1.0 + wob or j <= 18 or r < 139 or r > 170   # scrub all over the way in from the map's edge, and in a ragged patch round the helipad
        if j < 2 and r in (154, 155): woods = False
        if abs(r + .5 - trail(j)) < 1.05 + 1.05 * min(1, j / 7) and j <= 18: woods = False       # the way itself: four or five cells wide
        if j >= 19: woods = not 143 <= r <= 165 or j >= 42   # (and a few cells of woods beyond the compound's west wall)
        #                          # round the compound: woods above and below it (a one-row clearing against its walls)                     # the clearing round the compound
        if 150 <= r <= 159 and 17 <= j <= 18: woods = False               # and the gate's mouth
        row.append('F' if woods else '.')
    ER.append(row)
for r in range(144, 165):
    for j in range(19, 41): ER[r - EXT_R0][j] = 'K' if r in (144, 164) or j in (19, 40) else '.'
for r in range(151, 159): ER[r - EXT_R0][19] = '.'
ext_rows = [''.join(x) for x in ER]
(OUT / 'extension.json').write_text(json.dumps({'r0': EXT_R0, 'r1': EXT_R1, 'cols': EXT_COLS, 'rows': ext_rows}, indent=0))
OUT.mkdir(parents=True, exist_ok=True)
(OUT / 'terrain.txt').write_text('\n'.join(out) + '\n')
(OUT / 'entities.json').write_text(json.dumps({'meta': {'source': SRC.name, 'cell': CELL, 'width': W, 'height': H}, 'entities': MANUAL + soldiers + bushes + EXTRA_END, 'mines': mines}, indent=1))
cnt = lambda ch: sum(l.count(ch) for l in out)
print(rows, 'x', cols, 'cells;', {ch: cnt(ch) for ch in 'XVGYgyFWKH'}, len(soldiers), 'soldiers', len(bushes), 'test bushes')
if len(sys.argv) > 1:
    pal = {'.': (123, 65, 0), 'X': (74, 162, 107), 'V': (0, 0, 0), 'G': (200, 200, 190), 'Y': (240, 240, 120), 'g': (160, 160, 150), 'y': (200, 200, 60), 'F': (30, 70, 40),
           'W': (120, 125, 123), 'K': (90, 90, 140), 'H': (60, 60, 200)}
    Image.fromarray(np.array([[pal[ch] for ch in l] for l in out], np.uint8)).resize((cols * 4, rows * 4), Image.NEAREST).save(sys.argv[1])
