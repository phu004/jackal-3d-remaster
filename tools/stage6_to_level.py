"""Convert the ripped NES Jackal stage 6 map (the enemy fortress) into level data for the remaster (a first pass).

    python tools/stage6_to_level.py

Reads  reference/jackal-stage-6-nes-map.webp  (512 x 3172, title banner on top)
Writes src/levels/stage6/markings.png   the road paint (cream and orange), 4 px per NES pixel, laid over the ground by the game
       src/levels/stage6/terrain.txt    one char per 8x8-pixel NES cell, north at the top
       src/levels/stage6/entities.json  objects, in map-pixel coordinates (banner removed)

Terrain chars (the harbour theme's, see THEMES in game/world.js):
    .  concrete road (drivable)     K  the big green barracks blocks and the HQ at the top (solid)
    W  the fortress walls (the gates in them are objects)     H  helipad concrete
Gates (the orange doors in the walls), the orange huts, the helipad and the barricades (the NES's crossed-girder tank traps: hedgehogs, sandbag walls, drums, crates) are entities. Still to come: the soldiers and guns on the
roofs, the plane park, the HQ's boss.
Re-running overwrites the outputs: put fixes in MANUAL below rather than editing them.
"""
import json
import random
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'reference' / 'jackal-stage-6-nes-map.webp'
OUT = ROOT / 'src' / 'levels' / 'stage6'
HEADER = 60
CELL = 8
HQ_ROWS = 16        # cells: the HQ at the top (olive and dark): solid
EXT = 640          # px: the map is extended this far north (640 px = 100 m): the last building (the NES's end fortress) is removed, to be redesigned (the mini boss, then the boss's open arena)
CLEAR_ROWS = 25    # cells: the end fortress's rows (the full-width block and its side wings) turned to open ground
PAD_X, PAD_Y = 32, 32   # px: how far the paint is carried on past the map's edges (the game's own margin is wider, but nothing is seen out there)

rgb = lambda r, g, b: (r << 16) | (g << 8) | b
CREAM, ROAD, BLACK = rgb(255, 219, 165), rgb(123, 125, 123), 0
SKULLS = [(158, 215, 199, 312), (750, 807, 231, 344)]   # (y0, y1, x0, x1): the orange-and-black skull triangles painted on the road
INK = {CREAM: (214, 211, 197, 255), rgb(255, 162, 0): (192, 106, 14, 255), rgb(198, 113, 0): (150, 78, 8, 255)}   # the paint, toned well down: the game's light is about 1.6 times the colours' value, so these come out as the NES's white and orange
GREEN = [rgb(74, 162, 107), rgb(49, 97, 66), rgb(115, 227, 148)]
OLIVE = [rgb(74, 89, 0), rgb(140, 138, 0), rgb(140, 142, 0), rgb(74, 81, 0), rgb(140, 134, 0)]
ORANGE = [rgb(198, 113, 0), rgb(255, 162, 0)]

MANUAL = [
    {'type': 'start', 'x': 341, 'y': 3096},
    # the two conveyor belts north of the four civilian huts, either side of the road to the central building (found in the NES map: the left x 104..151, y 2320..2431; the right x 360..407, y 2288..2399): they carry the jeep south
    {'type': 'conveyor', 'x': 128, 'y': 2376, 'w': 48, 'h': 112},
    {'type': 'conveyor', 'x': 384, 'y': 2344, 'w': 48, 'h': 112},
    # the last belt, in the narrow valley towards the end of the map (the corridor between the two big blocks: x 256..320, y 480..632): it carries the jeep south, wall to wall
    {'type': 'conveyor', 'x': 288, 'y': 556, 'w': 64, 'h': 152},
    # eight roof guns along the valley's two roofs, four a side, 1.4 m in from the edge facing the belt
    {'type': 'wallturret', 'x': 247, 'y': 504, 'w': 32, 'h': 32, 'lift': 6.5, 'pedestal': 0.5, 'range': 26},
    {'type': 'wallturret', 'x': 247, 'y': 544, 'w': 32, 'h': 32, 'lift': 6.5, 'pedestal': 0.5, 'range': 26},
    {'type': 'wallturret', 'x': 247, 'y': 584, 'w': 32, 'h': 32, 'lift': 6.5, 'pedestal': 0.5, 'range': 26},
    {'type': 'wallturret', 'x': 247, 'y': 624, 'w': 32, 'h': 32, 'lift': 6.5, 'pedestal': 0.5, 'range': 26},
    {'type': 'wallturret', 'x': 329, 'y': 504, 'w': 32, 'h': 32, 'lift': 6.5, 'pedestal': 0.5, 'range': 26},
    {'type': 'wallturret', 'x': 329, 'y': 544, 'w': 32, 'h': 32, 'lift': 6.5, 'pedestal': 0.5, 'range': 26},
    {'type': 'wallturret', 'x': 329, 'y': 584, 'w': 32, 'h': 32, 'lift': 6.5, 'pedestal': 0.5, 'range': 26},
    {'type': 'wallturret', 'x': 329, 'y': 624, 'w': 32, 'h': 32, 'lift': 6.5, 'pedestal': 0.5, 'range': 26},
    # three parked, unmanned light tanks facing south: two side by side, one a row further north (each with an invisible blocker the size of its hull: a 'displaytank' has no hit box of its own)
    {'type': 'displaytank', 'kind': 'light', 'x': 334, 'y': 2902, 'w': 24, 'h': 32}, {'type': 'blocker', 'x': 334, 'y': 2902, 'w': 22, 'h': 30},
    {'type': 'displaytank', 'kind': 'light', 'x': 372, 'y': 2902, 'w': 24, 'h': 32}, {'type': 'blocker', 'x': 372, 'y': 2902, 'w': 22, 'h': 30},
    # two live light tanks (they roll out and fight once in view), parked facing south: one between the unmanned ones, one just south of the gate
    # four more live light tanks (x -19.1 z -100.9; x 20.8 z -103.8; x -2.1 z -126.6; x -3.1 z -149.8) and an enemy jeep (x 12.6 z -160) that circles the jeep lobbing bombs, as stage 2's
    {'type': 'lighttank', 'x': 134, 'y': 2466}, {'type': 'lighttank', 'x': 389, 'y': 2448}, {'type': 'lighttank', 'x': 243, 'y': 2302}, {'type': 'lighttank', 'x': 236, 'y': 2153},
    {'type': 'enemyjeep', 'x': 337, 'y': 2088},
    # the helipad area's guns: four on the roofs along its west side (x -36.4: 1.4 m in from the roof's east edge, nearer the helipad; moved a little south) and three on the east block's west edge (1.8 m in), all lift 6.5, range 26; and a light tank at x -22.9 z -187.1
    {'type': 'wallturret', 'x': 23, 'y': 1957, 'w': 32, 'h': 32, 'lift': 6.5, 'pedestal': 0.5, 'range': 26}, {'type': 'wallturret', 'x': 23, 'y': 2011, 'w': 32, 'h': 32, 'lift': 6.5, 'pedestal': 0.5, 'range': 26},
    {'type': 'wallturret', 'x': 23, 'y': 2075, 'w': 32, 'h': 32, 'lift': 6.5, 'pedestal': 0.5, 'range': 26}, {'type': 'wallturret', 'x': 23, 'y': 2165, 'w': 32, 'h': 32, 'lift': 6.5, 'pedestal': 0.5, 'range': 26},
    {'type': 'wallturret', 'x': 396, 'y': 1934, 'w': 32, 'h': 32, 'lift': 6.5, 'pedestal': 0.5, 'range': 26}, {'type': 'wallturret', 'x': 396, 'y': 1992, 'w': 32, 'h': 32, 'lift': 6.5, 'pedestal': 0.5, 'range': 26},
    {'type': 'wallturret', 'x': 396, 'y': 2075, 'w': 32, 'h': 32, 'lift': 6.5, 'pedestal': 0.5, 'range': 26},
    {'type': 'lighttank', 'x': 109, 'y': 1915},
    # beyond the helipad's north gate: a light tank at x -20.5 z -191.3, a camouflaged gun in the road at x -16.2 z -222.4 and another light tank at x -10.3 z -225.2
    {'type': 'lighttank', 'x': 125, 'y': 1888}, {'type': 'camoturret', 'x': 162, 'y': 1711}, {'type': 'lighttank', 'x': 190, 'y': 1671},
    # the far north: live light tanks at (-19.1, -251.2), (-10.1, -272.1), (1.4, -227.8); an enemy jeep at (28, -265); two unmanned light tanks facing south at (12.4, -268) and (17.1, -269); a camouflaged gun at (-14.8, -277)
    {'type': 'lighttank', 'x': 134, 'y': 1504}, {'type': 'lighttank', 'x': 191, 'y': 1371}, {'type': 'lighttank', 'x': 265, 'y': 1331},
    {'type': 'enemyjeep', 'x': 435, 'y': 1416},
    {'type': 'displaytank', 'kind': 'light', 'x': 335, 'y': 1397, 'w': 24, 'h': 32}, {'type': 'blocker', 'x': 335, 'y': 1397, 'w': 22, 'h': 30},
    {'type': 'displaytank', 'kind': 'light', 'x': 365, 'y': 1397, 'w': 24, 'h': 32}, {'type': 'blocker', 'x': 365, 'y': 1397, 'w': 22, 'h': 30},
    {'type': 'camoturret', 'x': 161, 'y': 1339},
    # the U-shaped building at z -329..-310: four guns on its south edges (the west and east blocks' middles and two on the middle block), and light tanks at (26.1, -311.4) and (-4.6, -312), an enemy jeep at (15.5, -305)
    {'type': 'wallturret', 'x': 40, 'y': 1118, 'w': 32, 'h': 32, 'lift': 6.5, 'pedestal': 0.5, 'range': 26}, {'type': 'wallturret', 'x': 144, 'y': 1118, 'w': 32, 'h': 32, 'lift': 6.5, 'pedestal': 0.5, 'range': 26},
    {'type': 'wallturret', 'x': 176, 'y': 1118, 'w': 32, 'h': 32, 'lift': 6.5, 'pedestal': 0.5, 'range': 26}, {'type': 'wallturret', 'x': 276, 'y': 1118, 'w': 32, 'h': 32, 'lift': 6.5, 'pedestal': 0.5, 'range': 26},
    # two parked, unmanned light tanks facing south at (27.4, -314.7) and (27.4, -325.5)
    {'type': 'displaytank', 'kind': 'light', 'x': 431, 'y': 1098, 'w': 24, 'h': 32}, {'type': 'blocker', 'x': 431, 'y': 1098, 'w': 22, 'h': 30},
    {'type': 'displaytank', 'kind': 'light', 'x': 431, 'y': 1029, 'w': 24, 'h': 32}, {'type': 'blocker', 'x': 431, 'y': 1029, 'w': 22, 'h': 30},
    {'type': 'enemyjeep', 'x': 109, 'y': 855},   # an enemy jeep at (-22.9, -352.7)
    {'type': 'mudlauncher', 'x': 230, 'y': 786, 'dry': True},
    {'type': 'mudlauncher', 'x': 346, 'y': 786, 'dry': True},   # its twin on the other side of the skull (mirrored about the skull's centre, world x 5.0): (14.1, -363.5)   # a hidden missile launcher under the road at (-4.1, -363.5): nothing shows until it fires
    # the last section: a yard of shipping containers thrown about the middle as cover: three piles three high, three two high and seven single ones, all at odd angles (rot, degrees) (y is in the old NES-map coordinates: the generator shifts everything down by EXT, so negative is the extension)
    {'type': 'containerpile', 'x': 256, 'y': -322, 'w': 64, 'h': 32, 'wet': True, 'rot': 12, 'tiers': 4},
    {'type': 'containerpile', 'x': 166, 'y': -133, 'w': 64, 'h': 32, 'wet': True, 'rot': -35, 'tiers': 4},
    {'type': 'containerpile', 'x': 367, 'y': -209, 'w': 64, 'h': 32, 'wet': True, 'rot': 28, 'tiers': 4},
    {'type': 'containerpile', 'x': 131, 'y': -435, 'w': 64, 'h': 32, 'wet': True, 'rot': 70, 'tiers': 3},
    {'type': 'containerpile', 'x': 343, 'y': -448, 'w': 64, 'h': 32, 'wet': True, 'rot': -20, 'tiers': 3},
    {'type': 'containerpile', 'x': 256, 'y': -20, 'w': 64, 'h': 32, 'wet': True, 'rot': 5, 'tiers': 3},
    {'type': 'container', 'x': 237, 'y': -454, 'w': 64, 'h': 32, 'wet': True, 'rot': 50},
    {'type': 'container', 'x': 84, 'y': -309, 'w': 64, 'h': 32, 'wet': True, 'rot': 100},
    {'type': 'container', 'x': 426, 'y': -347, 'w': 64, 'h': 32, 'wet': True, 'rot': -60},
    {'type': 'container', 'x': 78, 'y': -209, 'w': 64, 'h': 32, 'wet': True, 'rot': 33},
    {'type': 'container', 'x': 308, 'y': -108, 'w': 64, 'h': 32, 'wet': True, 'rot': 120},
    {'type': 'container', 'x': 414, 'y': -45, 'w': 64, 'h': 32, 'wet': True, 'rot': -75},
    {'type': 'container', 'x': 107, 'y': -7, 'w': 64, 'h': 32, 'wet': True, 'rot': 15},
    # more towards the north end of the map
    {'type': 'containerpile', 'x': 84, 'y': -615, 'w': 64, 'h': 32, 'wet': True, 'rot': -15, 'tiers': 4}, {'type': 'containerpile', 'x': 420, 'y': -615, 'w': 64, 'h': 32, 'wet': True, 'rot': 40, 'tiers': 4},
    {'type': 'containerpile', 'x': 267, 'y': -615, 'w': 64, 'h': 32, 'wet': True, 'rot': 80, 'tiers': 3}, {'type': 'containerpile', 'x': 172, 'y': -612, 'w': 64, 'h': 32, 'wet': True, 'rot': 20, 'tiers': 3},
    {'type': 'container', 'x': 349, 'y': -549, 'w': 64, 'h': 32, 'wet': True, 'rot': -35}, {'type': 'container', 'x': 90, 'y': -555, 'w': 64, 'h': 32, 'wet': True, 'rot': 65}, {'type': 'container', 'x': 445, 'y': -498, 'w': 64, 'h': 32, 'wet': True, 'rot': 100},
    {'type': 'pickup', 'x': 77, 'y': 1115},   # the hidden star at (-28, -312): shoot to reveal
    {'type': 'lighttank', 'x': 40, 'y': 1146}, {'type': 'lighttank', 'x': 227, 'y': 1115}, {'type': 'enemyjeep', 'x': 355, 'y': 1160},
    {'type': 'bosstank', 'x': 178, 'y': -523, 'w': 35, 'h': 54},   # the final boss at x -12.2 z -568 (the model only so far)
    {'type': 'flametank', 'x': 149, 'y': 98}, {'type': 'flametank', 'x': 378, 'y': 91},   # enemy flame tanks in the arena: x -16.7 z -471, x 19.0 z -472
    {'type': 'lighttank', 'x': 292, 'y': 2622},   # a live light tank at x 5.6, z -76.6
    {'type': 'lighttank', 'x': 333, 'y': 2867}, {'type': 'lighttank', 'x': 332, 'y': 2738},
    {'type': 'displaytank', 'kind': 'light', 'x': 334, 'y': 2830, 'w': 24, 'h': 32}, {'type': 'blocker', 'x': 334, 'y': 2830, 'w': 22, 'h': 30},
    # two of stage 5's wall-mounted guns on the roofs by the start (lift 6.5: the roof's height), each 1.6 m in from a roof edge so a grenade bursting on the wall below reaches it (blast 1.8 m): the first by the west block's east edge, the second by the north edge of the block south of the alley
    {'type': 'wallturret', 'x': 148, 'y': 2969, 'w': 32, 'h': 32, 'lift': 6.5, 'pedestal': 0.5, 'range': 26},
    {'type': 'wallturret', 'x': 86, 'y': 1659, 'w': 32, 'h': 32, 'lift': 6.5, 'pedestal': 0.5, 'range': 26}, {'type': 'wallturret', 'x': 86, 'y': 1710, 'w': 32, 'h': 32, 'lift': 6.5, 'pedestal': 0.5, 'range': 26},   # (the roofs either side of the camouflaged gun: the west one's east edge, and the east one's west edge)
    {'type': 'wallturret', 'x': 266, 'y': 1659, 'w': 32, 'h': 32, 'lift': 6.5, 'pedestal': 0.5, 'range': 26}, {'type': 'wallturret', 'x': 266, 'y': 1710, 'w': 32, 'h': 32, 'lift': 6.5, 'pedestal': 0.5, 'range': 26},
    {'type': 'wallturret', 'x': 112, 'y': 3035, 'w': 32, 'h': 32, 'lift': 6.5, 'pedestal': 0.5, 'range': 26},
    # two more roof guns (lift 6.5) on the first block north of the gate (x -7.5..11.25, south edge z -90): one at each south corner, 1.7 m in from both edges
    {'type': 'wallturret', 'x': 219, 'y': 2525, 'w': 32, 'h': 32, 'lift': 6.5, 'pedestal': 0.5, 'range': 26},
    {'type': 'wallturret', 'x': 317, 'y': 2525, 'w': 32, 'h': 32, 'lift': 6.5, 'pedestal': 0.5, 'range': 26},
    # the pad: painted on the road, as on the NES (no slab): the circle with its H is at (256, 2047); the 14 drums of its ring of lights are placed here (NES px from the circle's middle, the ring open on the east,
    # where the STOP box is). The paint itself (circle, H, spokes, STOP box) is drawn below (PAD_C)
    # the plane park west of the pad: the NES crowds ten small jets in here; the remaster parks three F-35s at 80% (12.6 m long, 8.6 m across), nose to the north-east (rot is counter-clockwise: -45): the first at world (-15.2, -173.8), the second to its south-east (abreast of it), the third to its south-west (behind it, tail-ward). w and h are the turned jet's box (a 57 px square: its nose and tail reach 4.4 m from the middle on each axis)
    {'type': 'f35', 'x': 159, 'y': 2000, 'w': 57, 'h': 57, 'rot': -45},
    {'type': 'f35', 'x': 175, 'y': 2106, 'w': 57, 'h': 57, 'rot': -42},
    {'type': 'f35', 'x': 101, 'y': 2071, 'w': 57, 'h': 57, 'rot': -48},
    {'type': 'helipad', 'x': 256, 'y': 2047, 'w': 16, 'h': 16, 'paint': True, 'lights': [[-12.5, -57.5], [11.75, -58], [-28, -49.5], [27.75, -50], [-44.5, -33.5], [43.75, -33.75], [-52.5, -10], [-52.5, 6], [-44.5, 30.5], [43.75, 30.5], [-28.75, 46], [27.5, 46], [-12.5, 53.75], [11.75, 53.75]]},
]

def load():
    im = np.array(Image.open(SRC).convert('RGB'))[HEADER:].astype(np.int64)
    return im, (im[..., 0] << 16) | (im[..., 1] << 8) | im[..., 2]

def scale2x(img):
    """EPX / Scale2x: doubles a pixel-art image, rounding off its diagonal stair-steps without blurring."""
    key = img.view(np.uint32).reshape(img.shape[:2])
    pad = np.pad(key, 1, mode='edge')
    P, A, B, C, D = key, pad[:-2, 1:-1], pad[1:-1, 2:], pad[1:-1, :-2], pad[2:, 1:-1]  # self, up, right, left, down
    e1 = np.where((C == A) & (C != D) & (A != B), A, P)
    e2 = np.where((A == B) & (A != C) & (B != D), B, P)
    e3 = np.where((D == C) & (D != B) & (C != A), C, P)
    e4 = np.where((B == D) & (B != A) & (D != C), D, P)
    h, w = key.shape
    out = np.empty((h * 2, w * 2), np.uint32)
    out[0::2, 0::2], out[0::2, 1::2], out[1::2, 0::2], out[1::2, 1::2] = e1, e2, e3, e4
    return np.ascontiguousarray(out).view(np.uint8).reshape(h * 2, w * 2, 4)


def main():
    im, key = load()
    rows, cols = key.shape[0] // CELL, key.shape[1] // CELL
    cells = key[:rows * CELL, :cols * CELL].reshape(rows, CELL, cols, CELL).transpose(0, 2, 1, 3)
    n = lambda pal: np.isin(cells, pal).sum(axis=(2, 3))
    grid = np.full((rows, cols), '.', dtype='<U1')
    grid[(n(GREEN) >= 20) | (n(OLIVE) >= 20)] = 'K'
    grid[:HQ_ROWS] = 'K'
    # tidy the building mask: the colour key leaves stray single cells, one-cell-wide slivers hanging off the blocks and one-cell pinholes; they would be drawn as lone pillars and slits
    K = ndimage.binary_opening(grid == 'K', structure=np.ones((2, 2), bool))
    lab_k, cnt_k = ndimage.label(K)
    for i, size in enumerate(ndimage.sum(K, lab_k, range(1, cnt_k + 1)), 1):
        if size < 12: K[lab_k == i] = False
    lab_h, cnt_h = ndimage.label(~K)
    for i, size in enumerate(ndimage.sum(~K, lab_h, range(1, cnt_h + 1)), 1):
        if size <= 4 and not (lab_h == i)[[0, -1], :].any() and not (lab_h == i)[:, [0, -1]].any(): K[lab_h == i] = True
    # flatten the walls: the NES blocks have small dead-end bays and notches in their sides, which drawn in 3D are awkward turns. A bay is open road that is too narrow for a 5 x 5 square
    # (so not part of the open road), small, and reached from the open road at one end only (an alley, open at both ends, is left alone; so are the one-cell steps of a diagonal edge, which the
    # fortress fills with wall pieces). Each such bay is filled in, leaving a flat wall.
    PAD = 6; Kp = np.pad(K, ((0, 0), (PAD, PAD)), mode='edge')   # (a block at the map's side runs on out past it, as the game draws it)
    empty = ~Kp
    wide = ndimage.binary_opening(empty, structure=np.ones((5, 5), bool), border_value=1)
    lab_n, cnt_n = ndimage.label(empty & ~wide)
    filled = 0
    for i in range(1, cnt_n + 1):
        comp = lab_n == i; size = int(comp.sum())
        if size < 3 or size > 40: continue
        touch = ndimage.binary_dilation(comp, structure=np.ones((3, 3), bool)) & wide & empty
        _, clusters = ndimage.label(touch, structure=np.ones((3, 3), bool))
        if clusters == 1: Kp |= comp; filled += size
    K = Kp[:, PAD:-PAD]
    print('flattened', filled, 'bay cells')
    grid[(grid == 'K') & ~K] = '.'; grid[K] = 'K'
    # orange objects: the gates (a 64 x 32 door with its arrows below: a 67 x 65 patch), the tanks (18 x 21) and the huts (66 x 62)
    O = np.isin(key, ORANGE)
    lab, cnt = ndimage.label(ndimage.binary_dilation(O, iterations=2))
    entities, sprites = [], []
    for i in range(1, cnt + 1):
        ys, xs = np.nonzero(lab == i)
        if len(ys) < 60: continue
        y0, y1, x0, x1 = ys.min(), ys.max(), xs.min(), xs.max()
        w, h = x1 - x0 + 1, y1 - y0 + 1
        if (w, h) == (67, 65):      # a gate: the door is the top 32 rows
            entities.append({'type': 'gate', 'x': int((x0 + x1) // 2), 'y': int(y0 + 16), 'w': 64, 'h': 32, 'look': 'orange'})
        elif (w, h) in ((18, 21), (23, 23)):   # a tank in its bay, or a roof gun: not entities here, but their sprites are not road paint
            sprites.append((x0, y0, x1, y1))
        elif (w, h) == (66, 62):    # an orange hut
            sprites.append((x0, y0, x1, y1))
            hx, hy = int((x0 + x1) // 2), int((y0 + y1) // 2)
            # every orange hut is a civilian (prisoner) hut, blown open on its east wall in the start area; the other four stand two each side of the road, the left two opening east and the right two west (toward the road)
            side = 'east' if (hy > 2700 or hx < 256) else 'west'
            entities.append({'type': 'powhut', 'x': hx, 'y': hy, 'w': 48, 'h': 48, 'breach': side, 'exit': side})
    entities += [dict(m) for m in MANUAL]
    for e in entities:  # the conveyor belts (the NES's striped belts with cream rails beside them): their sprites are not road paint either
        if e['type'] == 'conveyor': sprites.append((e['x'] - e['w'] // 2, e['y'] - e['h'] // 2, e['x'] + e['w'] // 2, e['y'] + e['h'] // 2))
    # the walls: a band of four cells across the whole map at each gate (the door is its upper two cells; the wall's face is drawn below it)
    for e in entities:
        if e['type'] != 'gate': continue
        r0 = (e['y'] - 12) // CELL
        grid[r0:r0 + 4, :] = 'W'
    for e in entities:  # objects own their footprint
        w, h = e.get('w', 16), e.get('h', 16)
        r0, r1 = max(0, (e['y'] - h // 2) // CELL), min(rows, (e['y'] + h // 2 + CELL - 1) // CELL)
        c0, c1 = max(0, (e['x'] - w // 2) // CELL), min(cols, (e['x'] + w // 2 + CELL - 1) // CELL)
        if e['type'] == 'gate': continue
        if e['type'] == 'wallturret': continue   # (stands on the roof or ground: no cells cleared)
        if e['type'] == 'helipad' and e.get('paint'): continue   # (painted, not a slab)
        if e['type'] == 'helipad':
            east = e.get('apron') == 'east'
            sq0, sq1 = (c0, c1 - 4) if east else (c0 + 4, c1)
            grid[r0:r1, sq0:sq1] = 'H'
            grid[r0 + 1:r1 - 1, (c1 - 4 if east else c0):(c1 if east else c0 + 4)] = 'H'
        elif e['type'] != 'start':
            sub = grid[r0:r1, c0:c1]; sub[sub == 'K'] = '.'
    # the gates' gateways: open once the gate is gone
    for e in entities:
        if e['type'] == 'gate':
            r0, r1 = (e['y'] - 12) // CELL, (e['y'] - 12) // CELL + 4
            c0, c1 = (e['x'] - 32) // CELL, (e['x'] + 32) // CELL
            grid[r0:r1, c0:c1] = '.'
    # the block west of the helipad (the plane park's neighbour, at the map's edge, x 0..64 px, y 1904..2135): moved 5 m (4 cells) further west, off the map's edge (the edge column carries on outward as the same block)
    for r in range(1904 // CELL, 2136 // CELL):
        seg = grid[r, 0:8].copy(); grid[r, 0:4] = seg[4:8]; grid[r, 4:8] = '.'
    # the barricades: the NES's crossed-girder tank traps (16 x 15 px, in pairs and rows) found by template match on the light grey, each replaced by an obstacle of the same footprint. The enemy's last line is thrown up from
    # whatever came to hand, so most are steel hedgehogs and the rest sandbag walls, fuel drums and ammunition crates
    import cv2
    light = (key == rgb(189, 190, 189)).astype(np.float32)
    tpl = light[224:239, 0:17].copy()
    hit = cv2.matchTemplate(light, tpl, cv2.TM_CCORR)
    tot = cv2.boxFilter(light, -1, (17, 15), normalize=False, anchor=(0, 0))[:hit.shape[0], :hit.shape[1]]
    score = (hit - (tot - hit)) / tpl.sum()   # (the lit pixels of the template, less the ones lit outside it: lines and walls fail)
    found = []
    for y, x in sorted(zip(*np.nonzero(score > .7)), key=lambda p: -score[p]):
        if all(abs(y - b) > 8 or abs(x - a) > 9 for a, b in found): found.append((x, y))
    for x, y in sorted(found, key=lambda p: (p[1], p[0])):
        cx, cy = x + 8, y + 7
        if grid[cy // CELL, cx // CELL] != '.': continue
        kind = ('hedgehog', 'hedgehog', 'hedgehog', 'hedgehog', 'hedgehog', 'hedgehog', 'sandbags', 'drumstack', 'cratestack', 'hedgehog')[(cx * 7 + cy * 13) // 3 % 10]
        entities.append({'type': kind, 'x': int(cx), 'y': int(cy)})
    # chaos: a last-ditch defence is thrown up from whatever came to hand: no two pieces at quite the same angle or spot (the model of each is only dressing: see the blockers below)
    BAR = ('hedgehog', 'sandbags', 'drumstack', 'cratestack')
    brng = random.Random(6666)
    bars = [e for e in entities if e['type'] in BAR]
    spots = [(e['x'], e['y']) for e in bars]
    for e in bars:
        e['x'] += brng.randint(-2, 2); e['y'] += brng.randint(-2, 2); e['rot'] = brng.randint(-30, 30)
    # the seal: on the NES each X blocks its whole tile, and the rows of them close the road right out to the wall or the map's edge. The models do not (they are dressing), so invisible blockers fill every X's tile
    # exactly, and run on past the map's edge (the jeep can drive in the margin there) or to the next wall where that is not far off
    seal = []
    for x, y in spots:
        seal.append({'type': 'blocker', 'x': x, 'y': y, 'w': 18, 'h': 16})
        r = min(rows - 1, y // CELL)
        for sgn in (-1, 1):
            c = x // CELL
            while 0 <= c < cols and grid[r, c] == '.': c += sgn
            edge = x + sgn * 8                                   # the X's own side
            wall = c * CELL + (CELL if sgn < 0 else 0)           # where the open road ends: the next wall, or the map's edge
            if abs(wall - edge) <= 24:
                far = wall + sgn * (160 if not 0 < c < cols else 0)
                x0, x1 = sorted((edge, far))
                seal.append({'type': 'blocker', 'x': (x0 + x1) // 2, 'y': y, 'w': x1 - x0 + 2, 'h': 16})
    entities += seal
    print('barricades', len(bars), 'seal blockers', len(seal))
    # the building layout: the detection above no longer finds the big blocks the layout was made with (it loses most of the 'K' cells), so the saved layout (the last good terrain, from baseline v8) is the base
    base = [r.strip() for r in (ROOT / 'tools' / 'stage6_terrain_base.txt').read_text().splitlines() if r.strip()]
    assert len(base) == rows and all(len(r) == cols for r in base)
    grid = np.array([list(r) for r in base], dtype=grid.dtype)
    top = grid[:CLEAR_ROWS]; top[top == 'K'] = '.'   # the end fortress is gone
    grid = np.vstack([np.full((EXT // CELL, cols), '.', dtype=grid.dtype), grid])   # and 100 m of open ground north of it
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / 'terrain.txt').write_text('\n'.join(''.join(r) for r in grid) + '\n')
    # the road paint: the cream and orange arrows, lanes and dashes (and the skull triangles) on the open road, laid over the ground as an image 4 px per NES pixel (smoothed), as stage 3's
    owned = np.zeros(key.shape, bool)
    jets = np.zeros(key.shape, bool); jets[1950:2125, 88:215] = key[1950:2125, 88:215] == BLACK   # the plane park beside the helipad: real aircraft, to come: not paint. Found by their black outlines, closed up (the lines and arrows round them have none) and grown a little
    owned |= ndimage.binary_dilation(ndimage.binary_fill_holes(ndimage.binary_closing(jets, np.ones((15, 15), bool))), iterations=3)
    for x0, y0, x1, y1 in sprites: owned[max(0, y0 - 2):y1 + 3, max(0, x0 - 2):x1 + 3] = True
    jetm = np.zeros(key.shape, np.uint8)   # the parked jets: no road paint under them (their silhouettes, grown a little: 44 px each way along the fuselage, 34 across the wings, turned as the jet is)
    for e in entities:
        if e['type'] != 'f35': continue
        a = np.radians(e.get('rot', 0)); d = np.array([-np.sin(a), -np.cos(a)]); q = np.array([-d[1], d[0]])
        c = np.array([e['x'], e['y']], float)
        cv2.fillPoly(jetm, [np.round([c + d * 44 + q * 34, c + d * 44 - q * 34, c - d * 44 - q * 34, c - d * 44 + q * 34]).astype(np.int32)], 1)
    owned |= jetm > 0
    for e in entities:
        if e['type'] == 'gate': owned[e['y'] - 18:e['y'] + 18, e['x'] - 36:e['x'] + 36] = True   # (the door, and the wall's top row)
    cellgrid = np.repeat(np.repeat(grid, CELL, 0), CELL, 1)[:key.shape[0], :key.shape[1]]
    light = (key == rgb(189, 190, 189)) & (cellgrid == '.')
    light[1940:2140, 170:372] = False   # (the long dashed lines round the helipad are cream and grey: lines, not tank traps)
    hl, hn = ndimage.label(ndimage.binary_dilation(light, iterations=2))
    hedge = np.isin(hl, [i for i in range(1, hn + 1) if light[hl == i].sum() >= 100])   # the hedgehog tank traps (big lattices of light grey with cream in them): later objects, not road paint
    hedge = ndimage.binary_dilation(hedge, iterations=2)
    owned |= hedge
    pad = ((PAD_Y, PAD_Y), (PAD_X, PAD_X))
    pk, pc, po = np.pad(key, pad, mode='edge'), np.pad(cellgrid, pad, mode='edge'), np.pad(owned, pad, mode='edge')
    # one mask per paint colour (the skull triangles' black too, inside them only), as a label image
    ORG, DK = rgb(255, 162, 0), rgb(198, 113, 0)
    masks = {INK[c]: (pk == c) & (pc == '.') & ~po for c in INK}
    lines = np.zeros(pk.shape, bool); lines[PAD_Y + 1940:PAD_Y + 2140, PAD_X + 170:PAD_X + 372] = True
    masks[INK[CREAM]] |= (pk == rgb(189, 190, 189)) & lines & (pc == '.') & ~po   # (the long dashed lines round the helipad alternate cream and grey: whole lines here)
    masks[INK[ORG]] |= masks[INK[DK]]; masks[INK[DK]] = np.zeros(pk.shape, bool)   # (one orange: the sprites' darker shading pixels are left out; the skull triangles' own two oranges are added back below)
    PAD_C = (256.25, 2047.5)   # the helipad circle's middle (NES px)
    yy, xx = np.mgrid[0:pk.shape[0], 0:pk.shape[1]]
    pad_area = ((xx - PAD_X - PAD_C[0]) ** 2 + (yy - PAD_Y - PAD_C[1]) ** 2 < 44 ** 2) | ((xx >= PAD_X + 276) & (xx <= PAD_X + 338) & (yy >= PAD_Y + 2024) & (yy <= PAD_Y + 2072))
    for k in masks: masks[k] &= ~pad_area   # (the sprite's circle, H, spokes and STOP box: redrawn as clean shapes below)
    # the orange lane arrows pointing down (a 2-pixel shaft of 9 rows, its head under it): found, taken out of the sprite masks and redrawn as clean polygons further down
    arrows = []
    om = np.isin(pk, [ORG, DK]) & (pc == '.') & ~po
    for y in range(om.shape[0] - 20):
        for x in range(2, om.shape[1] - 4):
            if not (om[y, x] and om[y, x + 1] and not om[y, x - 1] and not om[y, x + 2] and not om[y - 1, x]): continue
            n = 0
            while om[y + n, x] and om[y + n, x + 1] and not om[y + n, x - 1] and not om[y + n, x + 2]: n += 1
            if n >= 8 and om[y + n, x - 2:x + 4].all():
                arrows.append((x + 1, y, y + n)); masks[INK[ORG]][y:y + n + 7, x - 3:x + 5] = False
    black = np.zeros(pk.shape, bool)
    for y0, y1, x0, x1 in SKULLS:
        box = (slice(PAD_Y + y0, PAD_Y + y1 + 1), slice(PAD_X + x0, PAD_X + x1 + 1))
        black[box] = pk[box] == BLACK
        for c in INK: masks[INK[c]][box] |= pk[box] == c
    inks = [(24, 22, 20, 255)] + list(masks.keys())          # (the black first: the paint over it wins where they meet)
    masks[(24, 22, 20, 255)] = black
    label = np.zeros(pk.shape, np.uint32)
    for n, col in enumerate(inks, 1): label[masks[col]] = n
    def epx(k):   # Scale2x on a label image: the diagonal stair-steps of the arrows and stripes become straight diagonals
        pad = np.pad(k, 1, mode='edge')
        P, A, B, C, D = k, pad[:-2, 1:-1], pad[1:-1, 2:], pad[1:-1, :-2], pad[2:, 1:-1]
        out = np.empty((k.shape[0] * 2, k.shape[1] * 2), k.dtype)
        out[0::2, 0::2] = np.where((C == A) & (C != D) & (A != B), A, P); out[0::2, 1::2] = np.where((A == B) & (A != C) & (B != D), B, P)
        out[1::2, 0::2] = np.where((D == C) & (D != B) & (C != A), C, P); out[1::2, 1::2] = np.where((B == D) & (B != A) & (D != C), D, P)
        return out
    # drawn at 8 px per NES pixel (Scale2x three times: the stair-steps of every slope, not only the 45-degree ones, become straight edges), each colour blurred a touch and cut with a narrow ramp (anti-aliased edges,
    # the corner-to-corner joins held together, the 1-pixel dashes kept), then averaged down to 4 px per NES pixel (about one screen pixel each: a second round of anti-aliasing)
    H0, W0 = label.shape
    out = np.zeros((H0 * 4, W0 * 4, 4), np.uint8)
    BAND, M = 48, 3
    for y in range(0, H0, BAND):
        a, b = max(0, y - M), min(H0, y + BAND + M)
        big = epx(epx(epx(label[a:b])))
        best, bv, rgb3 = np.zeros(big.shape, np.float32), np.zeros(big.shape, np.float32), np.zeros(big.shape + (3,), np.uint8)
        for n, col in enumerate(inks, 1):
            m = big == n
            if not m.any(): continue
            v = ndimage.gaussian_filter(m.astype(np.float32), 1.5)
            al = np.clip((v - .3) / .25, 0, 1); al = al * al * (3 - 2 * al)
            take = v > bv                                   # (the colour at an edge is the ink that is most there, not a faint neighbour's)
            bv[take] = v[take]; rgb3[take] = col[:3]
            np.maximum(best, al, out=best)
        lo, hi = (y - a) * 8, (min(H0, y + BAND) - a) * 8
        best, rgb3 = best[lo:hi], rgb3[lo:hi]
        h, w = best.shape
        out[y * 4:min(H0, y + BAND) * 4, :, 3] = (best.reshape(h // 2, 2, w // 2, 2).mean(axis=(1, 3)) * 255).astype(np.uint8)
        out[y * 4:min(H0, y + BAND) * 4, :, :3] = rgb3[0::2, 0::2]
    import cv2
    layer = np.zeros(out.shape[:2], np.uint8)   # the down arrows' polygons, anti-aliased at 4 px per NES pixel (shift 4: points in 1/16 of those)
    for cx, y0, yh in arrows:
        pts = np.array([(cx - 1, y0), (cx + 1, y0), (cx + 1, yh), (cx + 3, yh), (cx + .45, yh + 6.6), (cx - .45, yh + 6.6), (cx - 3, yh), (cx - 1, yh)], np.float64)
        cv2.fillPoly(layer, [np.round(pts * 4 * 16).astype(np.int32)], 255, cv2.LINE_AA, 4)
    # the helipad's paint, drawn at 8 px per NES pixel in a window and averaged down: the touchdown circle with its H, eight spokes (cream next to the circle, orange outside), and the STOP box on the east side
    OX, OY, WW, WH, U = 205, 2000, 140, 95, 8
    def P(x, y): return (int(round((x - OX) * U * 16)), int(round((y - OY) * U * 16)))
    cream_l, orange_l = np.zeros((WH * U, WW * U), np.uint8), np.zeros((WH * U, WW * U), np.uint8)
    def line(img, a, b, w): cv2.line(img, P(*a), P(*b), 255, max(1, int(round(w * U))), cv2.LINE_AA, 4)
    cx, cy = PAD_C
    cv2.circle(cream_l, P(cx, cy), int(15 * U * 16), 255, int(1.3 * U), cv2.LINE_AA, 4)
    for dx in (-3.6, 3.6): cv2.fillPoly(cream_l, [np.array([P(cx + dx - 1.2, cy - 6), P(cx + dx + 1.2, cy - 6), P(cx + dx + 1.2, cy + 6), P(cx + dx - 1.2, cy + 6)])], 255, cv2.LINE_AA, 4)   # the H: two uprights
    cv2.fillPoly(cream_l, [np.array([P(cx - 3.6, cy - 1.2), P(cx + 3.6, cy - 1.2), P(cx + 3.6, cy + 1.2), P(cx - 3.6, cy + 1.2)])], 255, cv2.LINE_AA, 4)                                  # and its bar
    for ang in (26, 64, 116, 154, 206, 244, 296, 334):   # the spokes
        ca, sa = np.cos(np.radians(ang)), -np.sin(np.radians(ang))
        for r0, r1, layer_ in ((18, 27, cream_l), (27.5, 39, orange_l)): line(layer_, (cx + ca * r0, cy + sa * r0), (cx + ca * r1, cy + sa * r1), 1.7)
    bx, y0, y1 = 304.5, 2028.5, 2067.5   # the STOP box: a solid line on its west side, dashed lines top and bottom, open to the east
    line(cream_l, (bx, y0), (bx, y1), 1.1)
    for yy_ in (y0, y1):
        x = bx
        while x < 335: line(cream_l, (x, yy_), (min(x + 3, 335), yy_), 1.1); x += 5
    x = 283.5
    while x < bx - 1: line(cream_l, (x, 2051.5), (min(x + 3, bx - 1), 2051.5), 1.2); x += 5                               # the dashed arrow pointing west into the circle
    cv2.fillPoly(cream_l, [np.array([P(276.5, 2051.5), P(283.5, 2048), P(283.5, 2055)])], 255, cv2.LINE_AA, 4)
    (tw, th), base = cv2.getTextSize('STOP', cv2.FONT_HERSHEY_SIMPLEX, 1.0, 2)
    sc = 17.0 * U / tw
    cv2.putText(cream_l, 'STOP', (int((311.5 - OX) * U), int((2040 - OY) * U)), cv2.FONT_HERSHEY_SIMPLEX, sc, 255, max(1, int(1.1 * U * .5)), cv2.LINE_AA)
    for lay, col in ((cream_l, INK[CREAM][:3]), (orange_l, INK[ORG][:3])):
        small = cv2.resize(lay, (WW * 4, WH * 4), interpolation=cv2.INTER_AREA)
        x0_, y0_ = (PAD_X + OX) * 4, (PAD_Y + OY) * 4
        win = out[y0_:y0_ + WH * 4, x0_:x0_ + WW * 4]
        upd = small > win[..., 3]
        win[upd, :3] = col; win[..., 3] = np.maximum(win[..., 3], small)
    hit = layer > 0
    out[hit, :3] = INK[ORG][:3]; out[..., 3] = np.maximum(out[..., 3], layer)
    out = np.vstack([np.zeros((EXT * 4, out.shape[1], 4), np.uint8), out])   # (the extension carries no road paint)
    out[2848:2880] = 0   # (the two rows of orange wedges just north of the arena fence are left off)
    _dash = out[2938:2956, 184:212].copy()   # (the lane's dashes in front of the arena gate: the NES map breaks the line there; it is carried on across, one dash every 32 px)
    for _st in range(824, 1465, 32): out[2938:2956, _st:_st + 28] = _dash
    Image.fromarray(out, 'RGBA').save(OUT / 'markings.png', optimize=True)
    # a few foot soldiers on the open road, clear of everything
    rng = random.Random(1988); soldiers = []
    def clear(x, y):
        r, c = y // CELL, x // CELL
        if not (20 <= r < rows - 8 and 2 <= c < cols - 2) or (grid[r - 1:r + 2, c - 1:c + 2] != '.').any(): return False
        if any(abs(e['x'] - x) < e.get('w', 16) / 2 + 16 and abs(e['y'] - y) < e.get('h', 16) / 2 + 16 for e in entities): return False
        return all((x - o['x']) ** 2 + (y - o['y']) ** 2 > 60 ** 2 for o in soldiers)
    for _ in range(20000):
        if len(soldiers) == 30: break
        x, y = rng.randint(16, 496), rng.randint(200, 2900)
        if clear(x, y): soldiers.append({'type': 'soldier', 'x': x, 'y': y})
    entities += soldiers
    for e in entities: e['y'] += EXT   # (everything keeps its place: the map has grown at the top)
    meta = {'source': SRC.name, 'cell': CELL, 'width': cols * CELL, 'height': rows * CELL + EXT, 'pad': [PAD_X, PAD_Y]}
    (OUT / 'entities.json').write_text(json.dumps({'meta': meta, 'entities': entities}, indent=1))
    print(rows, cols, {t: sum(e['type'] == t for e in entities) for t in {e['type'] for e in entities}})

main()
