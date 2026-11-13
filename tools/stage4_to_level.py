"""Convert the ripped NES Jackal stage 4 map (the mountain valley) into level data for the remaster.

    python tools/stage4_to_level.py

Reads  reference/jackal-stage-4-nes-map.webp  (512 x 2932, title banner on top)
Writes src/levels/stage4/terrain.txt    one char per 8x8-pixel NES cell, north at the top
       src/levels/stage4/entities.json  objects (for now only the start), in map-pixel coordinates

Terrain chars:  .  grass (drivable)
                S  swamp (drivable, slows everything that moves on it)
                X  cliff (steep, impassable to everything; drawn raised)
Everything else on the map (turrets, rails, helipad, huts) is left for later: those cells read as grass.

Re-running overwrites the outputs: put fixes in MANUAL below rather than editing them.
"""
import json
import sys
from pathlib import Path

import numpy as np
from scipy import ndimage
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'reference' / 'jackal-stage-4-nes-map.webp'
OUT = ROOT / 'src' / 'levels' / 'stage4'
HEADER = 60
CELL = 8
CLIFF_SHARE = .4   # a cell this much cliff colour (brown, black dither, olive plateau) is cliff
MIN_CLIFF = 120    # cells
SWAMP_SHARE = .5   # a cell this much light swamp green is swamp

rgb = lambda r, g, b: (r << 16) | (g << 8) | b
CLIFF = [rgb(0, 0, 0), rgb(123, 65, 0), rgb(140, 138, 0)]
SWAMP = [rgb(74, 162, 107)]

MANUAL = [
    {'type': 'start', 'x': 112, 'y': 2840},   # the jeep starts at the bottom of the meadow
    # the POW huts inside the village walls (the fenced huts on the NES map): a blast tears open the side facing the middle and the prisoners come out
    {'type': 'tent', 'x': 236, 'y': 1501, 'w': 52, 'h': 39, 'breach': 'east', 'windows': 'east', 'rot': -90},
    {'type': 'tent', 'x': 300, 'y': 1580, 'w': 39, 'h': 52, 'breach': 'west'},
    {'type': 'tent', 'x': 124, 'y': 1565, 'w': 39, 'h': 52, 'breach': 'east'},
    # engineer huts (the barracks: a rescued engineer upgrades the launcher): one inside the village walls, three outside, at the NES map's hut sprites
    {'type': 'barracks', 'x': 119, 'y': 1385, 'w': 56, 'h': 48, 'look': 'brown', 'scale': 1.08},
    {'type': 'barracks', 'x': 343, 'y': 1257, 'w': 56, 'h': 48, 'look': 'brown', 'scale': 1.08},
    {'type': 'barracks', 'x': 119, 'y': 1737, 'w': 56, 'h': 48, 'look': 'brown', 'scale': 1.08},
    {'type': 'barracks', 'x': 407, 'y': 1825, 'w': 56, 'h': 48, 'look': 'brown', 'scale': 1.08},
    {'type': 'gate', 'x': 224, 'y': 1344, 'w': 64, 'h': 32, 'look': 'brown'},   # the village compound's north gate (the gap in its top wall)
    {'type': 'gate', 'x': 160, 'y': 1648, 'w': 64, 'h': 32, 'look': 'brown'},   # and its south gate
    {'type': 'helipad', 'x': 376, 'y': 656, 'w': 112, 'h': 64, 'apron': 'west'},   # the POW drop-off pad, as stages 2 and 3: the landing square, its STOP strip on the west (laid into the terrain below)
    {'type': 'lighttank', 'x': 414.7, 'y': 2064.3},   # a light tank, at world (24.8, -126.2)
    # the NES map's static gun emplacements (grey 32x32 blocks), found in the map picture
    {'type': 'turret', 'x': 175, 'y': 382, 'w': 32, 'h': 32},
    {'type': 'turret', 'x': 335, 'y': 382, 'w': 32, 'h': 32},
    {'type': 'turret', 'x': 239, 'y': 414, 'w': 32, 'h': 32},
    {'type': 'turret', 'x': 271, 'y': 414, 'w': 32, 'h': 32},
    {'type': 'turret', 'x': 303, 'y': 590, 'w': 32, 'h': 32},
    {'type': 'turret', 'x': 367, 'y': 734, 'w': 32, 'h': 32},
    {'type': 'turret', 'x': 431, 'y': 1134, 'w': 32, 'h': 32},
    {'type': 'turret', 'x': 207, 'y': 1406, 'w': 32, 'h': 32},
    {'type': 'turret', 'x': 271, 'y': 1406, 'w': 32, 'h': 32},
    {'type': 'turret', 'x': 207, 'y': 1694, 'w': 32, 'h': 32},
    {'type': 'turret', 'x': 335, 'y': 1694, 'w': 32, 'h': 32},
    {'type': 'turret', 'x': 175, 'y': 2062, 'w': 32, 'h': 32},
    {'type': 'turret', 'x': 335, 'y': 2062, 'w': 32, 'h': 32},
    {'type': 'mudlauncher', 'x': 239.4, 'y': 2462.4},   # a hidden missile launcher in the mud pond, at world (-2.6, -64.0)
    {'type': 'mudlauncher', 'x': 354.6, 'y': 2291.5},   # a hidden missile launcher in the mud pond, at world (15.4, -90.7)
    {'type': 'mudlauncher', 'x': 112.6, 'y': 2264.6},   # a hidden missile launcher in the mud pond, at world (-22.4, -94.9)
    {'type': 'lighttank', 'x': 172.8, 'y': 965.4},      # a light tank, at world (-13.0, -297.9)
    {'type': 'lighttank', 'x': 255.4, 'y': 1242.6},     # a light tank, at world (-0.1, -254.6)
    {'type': 'lighttank', 'x': 286.7, 'y': 700.5},   # a light tank, at world (4.8, -339.3)
    {'type': 'lighttank', 'x': 190.1, 'y': 148.2},   # a light tank, at world (-10.3, -425.6)
    {'type': 'lighttank', 'x': 321.3, 'y': 148.2},   # a light tank, at world (10.2, -425.6)
    {'type': 'dronepad', 'x': 320, 'y': 1186},          # a drone platform on the cliff's south face, found north of this ground point (drone-pads.js); replaces the NES rocket launcher on the cliff top
    {'type': 'lighttank', 'x': 79.4, 'y': 2136.0},   # a light tank, at world (-27.6, -115.0)
    {'type': 'lighttank', 'x': 373.8, 'y': 2244.2},   # a light tank, at world (18.4, -98.1)
    {'type': 'lighttank', 'x': 367.4, 'y': 2448.3},   # a light tank, at world (17.4, -66.2)
    {'type': 'lighttank', 'x': 198.4, 'y': 2326.1},   # a light tank, at world (-9.0, -85.3)
    # foot soldiers through the valley (stage 1-3 density, about 6.5 per 100 m): one per 85 m band along the valley, on open grass away from the cliffs, the swamp, the start and the tank
    {'type': 'soldier', 'x': 284, 'y': 125},
    {'type': 'soldier', 'x': 205, 'y': 279},
    {'type': 'soldier', 'x': 271, 'y': 309},
    {'type': 'soldier', 'x': 172, 'y': 477},
    {'type': 'soldier', 'x': 422, 'y': 650},
    {'type': 'soldier', 'x': 306, 'y': 718},
    {'type': 'soldier', 'x': 221, 'y': 831},
    {'type': 'soldier', 'x': 159, 'y': 962},
    {'type': 'soldier', 'x': 126, 'y': 1037},
    {'type': 'soldier', 'x': 138, 'y': 1115},
    {'type': 'soldier', 'x': 106, 'y': 1189},
    {'type': 'soldier', 'x': 179, 'y': 1286},
    {'type': 'soldier', 'x': 329, 'y': 1791},
    {'type': 'soldier', 'x': 436, 'y': 1881},
    {'type': 'soldier', 'x': 99, 'y': 1962},
    {'type': 'soldier', 'x': 363, 'y': 2147},
    {'type': 'soldier', 'x': 461, 'y': 2194},
    {'type': 'soldier', 'x': 91, 'y': 2436},
    {'type': 'soldier', 'x': 363, 'y': 2453},
    {'type': 'soldier', 'x': 68, 'y': 2541},
    {'type': 'soldier', 'x': 444, 'y': 2675},
    {'type': 'lighttank', 'x': 232.3, 'y': 2596.2},   # a light tank, at world (-3.7, -43.1): the first one, ten metres further north than the map had it, so the jeep has a moment to react
    {'type': 'rock', 'x': 176, 'y': 529, 'w': 32, 'h': 28, 'look': 'mossy'},   # one of the NES map's boulder sprites (dark ringed rocks in the meadow): indestructible, blocks
    {'type': 'rock', 'x': 176, 'y': 561, 'w': 32, 'h': 28, 'look': 'mossy'},   # one of the NES map's boulder sprites (dark ringed rocks in the meadow): indestructible, blocks
    {'type': 'rock', 'x': 432, 'y': 1105, 'w': 32, 'h': 28, 'look': 'mossy'},   # one of the NES map's boulder sprites (dark ringed rocks in the meadow): indestructible, blocks
    {'type': 'rock', 'x': 304, 'y': 1525, 'w': 32, 'h': 28, 'look': 'mossy'},   # one of the NES map's boulder sprites (this one moved ~4.5 m north of its sprite, clear of the hut) (dark ringed rocks in the meadow): indestructible, blocks
    {'type': 'rock', 'x': 368, 'y': 1617, 'w': 32, 'h': 28, 'look': 'mossy'},   # one of the NES map's boulder sprites (dark ringed rocks in the meadow): indestructible, blocks
    {'type': 'rock', 'x': 80, 'y': 2001, 'w': 32, 'h': 28, 'look': 'mossy'},   # one of the NES map's boulder sprites (dark ringed rocks in the meadow): indestructible, blocks
    {'type': 'm270', 'x': 224, 'y': 813, 'w': 29, 'h': 29, 'rot': 135},   # the orange truck on the NES map (SW-facing): an M270 that does not move, its launcher turns and fires heavy shells
    {'type': 'm270', 'x': 64, 'y': 1773, 'w': 29, 'h': 29, 'rot': 135},
    {'type': 'fallingrock', 'x': 256, 'y': 930, 'dragK': 7, 'turn': 1.25, 'gravK': 2},   # two boulders on the right cliff's top, along the railway: they drop into the valley when the jeep comes near
    {'type': 'fallingrock', 'x': 256, 'y': 1032, 'dragK': 4, 'turn': 0.35, 'gravK': 2},
    {'type': 'fallingrock', 'x': 208, 'y': 1890},   # a boulder on the island's plateau: drops off the rim when the jeep comes near
    {'type': 'fallingrock', 'x': 296, 'y': 1890},   # a boulder on the island's plateau: drops off the rim when the jeep comes near
    {'type': 'fallingrock', 'x': 296, 'y': 1950},   # a boulder on the island's plateau: drops off the rim when the jeep comes near
    {'type': 'fallingrock', 'x': 216, 'y': 1954},   # a boulder on the island's plateau: drops off the rim when the jeep comes near
]

# the whole village (compound walls, gates, huts, the engineer hut and the guns inside it) stands VILLAGE_DY map pixels south of where the NES map has it (16 px = 2 cells = 2.5 m: the terrain
# is cell-sized, so a 2 m move would not fit the wall tiles)
VILLAGE_DY = 16
for e in MANUAL:
    if 64 <= e['x'] <= 352 and 1328 <= e['y'] <= 1664: e['y'] += VILLAGE_DY

im = np.array(Image.open(SRC).convert('RGB'))[HEADER:].astype(np.int64)
H, W = im.shape[:2]
key = (im[..., 0] << 16) | (im[..., 1] << 8) | im[..., 2]
rows, cols = H // CELL, W // CELL
cells = key[:rows * CELL, :cols * CELL].reshape(rows, CELL, cols, CELL).transpose(0, 2, 1, 3)
share = lambda cols_: np.isin(cells, cols_).mean(axis=(2, 3))
cliff = share(CLIFF) >= CLIFF_SHARE
# Huts, rails, the compound's walls and turrets' shadows also read as cliff colours: an opening (erode, then grow back) drops
# anything thinner than 3 cells, and components smaller than MIN_CLIFF cells go too. The real cliffs are huge; the rock islands a few hundred.
cliff = ndimage.binary_opening(cliff, np.ones((3, 3)))
lab, n = ndimage.label(cliff, np.ones((3, 3)))
for i, size in enumerate(ndimage.sum(cliff, lab, range(1, n + 1)), 1):
    if size < MIN_CLIFF: cliff[lab == i] = False
# the boss arena (the big field at the top) a little bigger than the NES map's: the cliffs around it move out up to 3 cells (about 3.75 m), easing back to nothing by row 100
dist = ndimage.distance_transform_edt(cliff)
reach = np.clip(3.0 * np.clip((100 - np.arange(rows)[:, None]) / 20.0, 0, 1), 0, 3)
keep = np.zeros_like(cliff); keep[:3, :] = True; keep[:, :2] = True; keep[:, cols - 2:] = True
cliff = cliff & ~((dist <= reach) & ~keep)
swamp = share(SWAMP) >= SWAMP_SHARE
out = [''.join('X' if cliff[r, c] else 'S' if swamp[r, c] else '.' for c in range(cols)) for r in range(rows)]

# the village compound in the middle of the valley: concrete walls ('W'), 4 cells thick along the top and bottom (the NES draws their front faces), 1 cell on the sides, with the gates'
# gaps left open ('.': the gate objects fill them, as in stage 1). Entity coordinates are map pixels with the header (60 px) taken off.
VX0, VX1, VY0, VY1 = 64, 352, 1328 + VILLAGE_DY, 1664 + VILLAGE_DY
grid = [list(r) for r in out]
vc0, vc1, vr0, vr1 = VX0 // CELL, VX1 // CELL, VY0 // CELL, VY1 // CELL
for r in range(vr0, vr1):
    for c in range(vc0, vc1):
        if r < vr0 + 4 or r >= vr1 - 4 or c == vc0 or c == vc1 - 1: grid[r][c] = 'W'
for e in MANUAL:
    if e['type'] != 'gate': continue
    for r in range((e['y'] - e['h'] // 2) // CELL, (e['y'] + e['h'] // 2 + CELL - 1) // CELL):
        for c in range((e['x'] - e['w'] // 2) // CELL, (e['x'] + e['w'] // 2 + CELL - 1) // CELL): grid[r][c] = '.'
out = [''.join(r) for r in grid]

# the helipad's concrete ('H'), as stages 2 and 3 lay it: the landing square, and a narrower STOP strip on its apron side (4 cells, a cell short top and bottom)
grid = [list(r) for r in out]
for e in MANUAL:
    if e['type'] != 'helipad': continue
    w, h = e['w'], e['h']
    r0, r1 = max(0, (e['y'] - h // 2) // CELL), min(rows, (e['y'] + h // 2 + CELL - 1) // CELL)
    c0, c1 = max(0, (e['x'] - w // 2) // CELL), min(cols, (e['x'] + w // 2 + CELL - 1) // CELL)
    west = e.get('apron') == 'west'
    for r in range(r0, r1):
        for c in range(c0 + 4 if west else c0, c1 if west else c1 - 4): grid[r][c] = 'H'
    for r in range(r0 + 1, r1 - 1):
        for c in range(c0 if west else c1 - 4, c0 + 4 if west else c1): grid[r][c] = 'H'
out = [''.join(r) for r in grid]

OUT.mkdir(parents=True, exist_ok=True)
(OUT / 'terrain.txt').write_text('\n'.join(out) + '\n')
(OUT / 'entities.json').write_text(json.dumps({'meta': {'source': SRC.name, 'cell': CELL, 'width': W, 'height': H}, 'entities': MANUAL}, indent=1))
print(rows, 'x', cols, 'cells;', sum(l.count('X') for l in out), 'cliff,', sum(l.count('S') for l in out), 'swamp')
if len(sys.argv) > 1:  # debug picture: python tools/stage4_to_level.py out.png
    pal = {'.': (60, 140, 60), 'S': (120, 200, 160), 'X': (110, 70, 20)}
    Image.fromarray(np.array([[pal[ch] for ch in l] for l in out], np.uint8)).resize((cols * 4, rows * 4), Image.NEAREST).save(sys.argv[1])
