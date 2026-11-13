"""Convert the ripped NES Jackal stage 3 map (the harbour) into level data for the remaster.

    python tools/stage3_to_level.py

Reads  reference/jackal-stage-3-nes-map.webp  (512 x 2932, title banner on top)
Writes src/levels/stage3/terrain.txt    one char per 8x8-pixel NES cell, north at the top
       src/levels/stage3/entities.json  objects found on the map, in map-pixel coordinates
       src/levels/stage3/markings.png   the white road markings and the quays' hazard stripes, at 4 px
                                        per NES pixel (smoothed), laid over the ground by the game
       src/levels/stage3/water.png      the water, one pixel per NES pixel (the exact shoreline)
       reference/stage3-debug.png       the map with detections drawn on, for checking

Terrain chars:  .  tarmac (drivable)     ~  water (blocks)        Q  quay edge, hazard-striped (blocks)
                B  stacked wooden crates (solid, indestructible)
                K  warehouse / long building (solid, indestructible)
                L  the laser maze's concrete walls (solid, indestructible; the lasers on their south faces)
                W  harbour wall (blocks; the gates in it are objects)
                H  helipad concrete
No raised areas on this stage.

Objects: turret (fixed gun, as stage 1), laser (rooftop laser, can't be destroyed), container
(shipping container, solid), barrier (shoot over it, can't drive through), parkedjeep (destructible
scenery; star: the hidden weapon star is inside), powhut (blow it open, prisoners come out), gate
(orange doors in the harbour walls, shot open as on stage 2), pickup (hidden star, shoot to reveal),
helipad, start, soldier.

Re-running overwrites the outputs: put fixes in MANUAL below rather than editing them.
"""
import json
import random
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'reference' / 'jackal-stage-3-nes-map.webp'
OUT = ROOT / 'src' / 'levels' / 'stage3'
DEBUG = ROOT / 'reference' / 'stage3-debug.png'
HEADER = 60
BAND_KEEP = .4  # share of the quays' hazard band painted (its outer part)
BAND_FROM_WATER = 13  # px: the band lies within this of the water (band and its shadow); paint further back is something else
STRIPE = 12     # px (in the 4x markings) per stripe of the band: finer than the NES's
LASER_ROWS = 2  # cells deep the laser maze's walls are
LASER_SQUEEZE = .7  # the last emitter wall's spacing (its emitters closer together)
MAZE_TURN = 8   # cells: the narrowest turn between a maze wall's end and a wing
SEA_ROWS = 15  # cells above the north quay: open sea (the warship's sprite isn't land)
CELL = 8
MARGIN = (28, 12)  # cells: the margin the game paints round the map (its sides wider on this stage)
PAD_X, PAD_Y = MARGIN[0] * CELL, MARGIN[1] * CELL

rgb = lambda r, g, b: (r << 16) | (g << 8) | b
TARMAC, MID, WHITE, BLACK = rgb(189, 190, 189), rgb(123, 125, 123), rgb(255, 255, 255), 0
WOOD, AMBER = rgb(198, 113, 0), rgb(255, 162, 0)
RED, DKRED = rgb(255, 121, 49), rgb(165, 48, 0)
WATER = [rgb(49, 81, 132), rgb(66, 97, 255)]

# Things the automatic pass can't know. Positions are map pixels (centre), below the title banner
# (y = y on the image file - HEADER).
MANUAL = [
    {'type': 'start', 'x': 224, 'y': 2836},                                 # the jeep starts in the yard at the bottom
    {'type': 'pickup', 'x': 312, 'y': 536},                                 # star between the four turrets near the end: shoot to reveal
    {'type': 'helipad', 'x': 376, 'y': 774, 'w': 112, 'h': 78, 'apron': 'west'},  # POW drop-off; its STOP strip on the west
    # gates in the three harbour walls (orange doors, shot open)
    {'type': 'gate', 'x': 160, 'y': 414, 'w': 64, 'h': 32, 'look': 'orange'},
    {'type': 'gate', 'x': 288, 'y': 656, 'w': 64, 'h': 32, 'look': 'orange'},
    {'type': 'gate', 'x': 320, 'y': 2686, 'w': 64, 'h': 32, 'look': 'orange'},
]
# The parked jeep with the star in it (its sprite on the map is the star box).
STAR_JEEP = (360, 1313)

# Objects moved by hand from where the map has them: type -> {(x, y) found: (x, y) wanted} (map px).
MOVED = {
    'barrier': {(271, 1408): (271, 1392)},  # the one just north of the piers: a little further from them
}

# Each POW hut: which wall the blast breaks (west / east / back = south), which way the prisoners
# walk off (out of the breach, or a corner: 'southwest').
# Keyed by the hut's centre (map pixels).
POW_SIDES = {
    (352, 2048): ('west', 'west'),        # the first two huts met: out to the west
    (384, 2112): ('west', 'west'),
    (160, 1296): ('east', 'east'),        # the second pair: the left one out to the east
    (352, 1232): ('west', 'west'),        # the right one out to the west
}

# Foot soldiers scattered over open tarmac along the route. (x0, x1, y0, y1, count) in map pixels.
SOLDIER_ZONES = [(24, 488, 300, 2640, 28)]


def load():
    im = np.array(Image.open(SRC).convert('RGB'))[HEADER:].astype(np.int64)
    return im, (im[..., 0] << 16) | (im[..., 1] << 8) | im[..., 2]


def match(key, x, y, w, h, keep):
    """Every place the template at (x, y, w, h) appears, comparing only its pixels whose colour is in keep."""
    t = key[y:y + h, x:x + w]
    m = np.isin(t, keep)
    H, W = key.shape
    ok = np.ones((H - h + 1, W - w + 1), bool)
    for dy, dx in zip(*np.nonzero(m)):
        ok &= key[dy:dy + H - h + 1, dx:dx + W - w + 1] == t[dy, dx]
    return [(int(px), int(py)) for py, px in zip(*np.nonzero(ok))]


def dedupe(points, d=8):
    out = []
    for p in sorted(points):
        if all(abs(p[0] - q[0]) > d or abs(p[1] - q[1]) > d for q in out):
            out.append(p)
    return out


def components(mask):
    seen = np.zeros_like(mask, bool)
    out = []
    for r0, c0 in zip(*np.nonzero(mask)):
        if seen[r0, c0]:
            continue
        stack, comp = [(r0, c0)], []
        seen[r0, c0] = True
        while stack:
            r, c = stack.pop()
            comp.append((r, c))
            for rr, cc in ((r + 1, c), (r - 1, c), (r, c + 1), (r, c - 1)):
                if 0 <= rr < mask.shape[0] and 0 <= cc < mask.shape[1] and mask[rr, cc] and not seen[rr, cc]:
                    seen[rr, cc] = True
                    stack.append((rr, cc))
        out.append(comp)
    return out


def classify(key):
    rows, cols = key.shape[0] // CELL, key.shape[1] // CELL
    cells = key[:rows * CELL, :cols * CELL].reshape(rows, CELL, cols, CELL).transpose(0, 2, 1, 3)
    n = lambda pal: np.isin(cells, pal if isinstance(pal, list) else [pal]).sum(axis=(2, 3))
    water, wood, amber, black = n(WATER), n(WOOD), n(AMBER), n(BLACK)
    grid = np.full((rows, cols), '.', dtype='<U1')
    orange = wood + amber + black
    grid[(orange >= 40) & (wood + amber >= 16)] = 'B'          # crates and buildings (told apart below)
    grid[water >= 32] = '~'
    grid[:SEA_ROWS] = '~'  # the warship at the top (the boss, built by the game) sits in open water
    # the harbour walls: long bands of grey stonework right across the map
    band = (n(MID) >= 12) & (wood + amber < 8) & (water < 8)
    full = [band[r].sum() >= cols * .6 for r in range(rows)]
    for r in range(rows):  # (at least 3 rows thick: a single grey row is a building's shadow, not a wall)
        if full[r] and sum(full[max(0, r - 2):r + 3]) >= 3 and (full[r - 1] or full[min(rows - 1, r + 1)]):
            grid[r][band[r] | (grid[r] == 'B')] = 'W'
    # quay edges: the orange-and-black hazard stripes along the water
    for r in range(rows):
        for c in range(cols):
            if grid[r, c] == 'B' and amber[r, c] >= 8 and black[r, c] >= 8 and wood[r, c] < 8 and \
                    (grid[max(0, r - 2):r + 3, max(0, c - 2):c + 3] == '~').any():
                grid[r, c] = 'Q'
    # crates: each is 32 wide, an X-braced lid then any number of slats, between posts down its sides;
    # found by the lid, then followed down its posts. Any other orange is a building.
    crate = np.zeros((rows, cols), bool)
    H = key.shape[0]
    for px, py in match(key, 0, 130, 32, 10, [WOOD, AMBER]):
        y = py + 10
        while y < H and key[y, px + 1] in (WOOD, AMBER) and key[y, px + 3] == BLACK and key[y, px + 29] in (WOOD, AMBER):
            y += 1
        r0, r1 = max(0, (py - 2) // CELL), (y + CELL // 2) // CELL
        c0, c1 = (px + CELL // 2) // CELL, (px + 32 + CELL // 2) // CELL
        crate[r0:r1, c0:c1] = True
    grid[(grid == 'B') & ~crate] = 'K'
    for comp in components(grid == 'K'):  # (thin strips between crates: crates, not a building)
        if len(comp) < 24:
            for r, c in comp:
                grid[r, c] = 'B'
    return grid


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
    grid = classify(key)
    rows, cols = grid.shape
    entities = []

    def add(kind, x, y, w, h, **extra):
        entities.append({'type': kind, 'x': int(x), 'y': int(y), 'w': w, 'h': h, **extra})

    # --- fixed gun turrets (stage 1's): the 32x32 grey emplacement ---
    for px, py in dedupe(match(key, 224, 480, 32, 32, [MID, WHITE, BLACK]), 16):
        add('turret', px + 16, py + 16, 32, 32)
    add('camoturret', 112, 304, 32, 32)  # the camouflaged gun in the hatched cover left of the road, near the boss: flush with the road till it pops up to fire (camo-turrets.js)
    add('camoturret', 336, 304, 32, 32)  # and its twin in the hatched cover on the road's east side
    # --- rooftop lasers: 32 x 31, on the long buildings ---
    for px, py in dedupe(match(key, 224, 849, 32, 31, [MID, WHITE]), 16):
        add('laser', px + 16, py + 15, 32, 31)
    # --- the laser maze: the NES draws each arm as a deep building (its front face under the roof, for
    # height); here each is a solid concrete wall ('L'), LASER_ROWS deep, its lasers fixed to its south
    # face. The rows below become open ground; the wings running north-south that join the arms stay
    # buildings.
    for ly in sorted({e['y'] for e in entities if e['type'] == 'laser'}):
        top = ly // CELL
        bot = top
        while bot + 1 < rows and (grid[bot + 1] == 'K').sum() >= cols * .4: bot += 1
        for c in range(cols):
            wing = (top >= 2 and grid[top - 2, c] == 'K') or (bot + 2 < rows and grid[bot + 2, c] == 'K')
            for r in range(top + LASER_ROWS, bot + 2):  # (and the shadow row under it)
                if not wing and grid[r, c] in ('K', 'W'): grid[r, c] = '.'
            if not wing:
                for r in range(top, top + LASER_ROWS):
                    if grid[r, c] == 'K': grid[r, c] = 'L'
        # a turn between a wall's end and a wing narrower than MAZE_TURN: the wall ends sooner
        for r in range(top, top + LASER_ROWS):
            c = 0
            while c < cols:
                if grid[r, c] != '.': c += 1; continue
                c2 = c
                while c2 + 1 < cols and grid[r, c2 + 1] == '.': c2 += 1
                short = MAZE_TURN - (c2 - c + 1)
                if short > 0 and 0 < c and c2 < cols - 1:
                    if grid[r, c2 + 1] == 'K' and grid[r, c - 1] == 'L': grid[r, max(0, c - short):c] = '.'      # wing to the east: cut the wall back westward
                    elif grid[r, c - 1] == 'K' and grid[r, c2 + 1] == 'L': grid[r, c2 + 1:c2 + 1 + short] = '.'  # wing to the west
                c = c2 + 1
        for e in entities:
            if e['type'] == 'laser' and e['y'] == ly:
                e['y'] = (top + LASER_ROWS) * CELL  # on the wall's south face
                grid[top:top + LASER_ROWS, (e['x'] - 16) // CELL:(e['x'] + 16) // CELL] = 'L'  # (the wall behind it, where its sprite was)

    # each wall's emitters spaced out evenly (the NES bunches them at one end) along its longest stretch
    # that has wall across the corridor from it, so every curtain ends on a wall, not through a gap
    walls = sorted({e['y'] for e in entities if e['type'] == 'laser'})[:-1]  # (the southernmost wall's are dropped below)
    for ly in walls:
        here = grid[ly // CELL - 1]  # (the wall's southern row)
        below = next((grid[r] for r in range(ly // CELL, rows) if (grid[r] == 'L').sum() > cols * .3), here)  # the next maze wall south
        row = np.where((here == 'L') & (below == 'L'), 'L', '.')
        best, c = (0, 0), 0
        while c < cols:
            if row[c] != 'L': c += 1; continue
            c2 = c
            while c2 + 1 < cols and row[c2 + 1] == 'L': c2 += 1
            if c2 - c > best[1] - best[0]: best = (c, c2)
            c = c2 + 1
        mine = sorted((e for e in entities if e['type'] == 'laser' and e['y'] == ly), key=lambda e: e['x'])
        x0, x1 = (best[0] + 1) * CELL, best[1] * CELL  # (a little in from the ends)
        squeeze = LASER_SQUEEZE if ly == walls[-1] else 1  # (the last wall's, drawn in toward the middle)
        for k, e in enumerate(mine): e['x'] = int((x0 + x1) / 2 + (x1 - x0) * ((k + .5) / len(mine) - .5) * squeeze)

    # the maze's southernmost wall keeps no emitters (they'd only fire out of the maze, into the yard)
    last = max((e['y'] for e in entities if e['type'] == 'laser'), default=None)
    entities[:] = [e for e in entities if not (e['type'] == 'laser' and e['y'] == last)]

    # --- parked jeeps (16 x 23), and the one holding the star ---
    for px, py in dedupe(match(key, 160, 337, 16, 23, [MID, WHITE, BLACK]), 8):
        add('parkedjeep', px + 8, py + 11, 16, 23)
    add('parkedjeep', *STAR_JEEP, 16, 23, star=True)
    add('pickup', *STAR_JEEP, 16, 16)  # the star inside it, revealed when the jeep is destroyed
    # --- barriers in the car parks and lanes: found by the left end, then as long as the rail runs (64 or 96) ---
    for px, py in dedupe(match(key, 208, 584, 14, 16, [MID, WHITE]), 16):
        x = px + 6
        while x < key.shape[1] and key[py + 13, x] == WHITE: x += 1
        w = x + 2 - px
        add('barrier', px + w // 2, py + 8, w, 16)
    for e in entities:  # hand adjustments (MOVED)
        for (fx, fy), (tx, ty) in MOVED.get(e['type'], {}).items():
            if abs(e['x'] - fx) < 4 and abs(e['y'] - fy) < 4: e['from'] = [e['x'], e['y']]; e['x'], e['y'] = tx, ty  # (from: its sprite's spot, kept off the road markings)
    # --- POW huts: the 48 x 48 ribbed hut in its dashed bay ---
    for px, py in dedupe(match(key, 328, 1208, 48, 48, [WOOD, AMBER]), 16):
        cx, cy = px + 24, py + 24
        breach, exit_ = next((v for (hx, hy), v in POW_SIDES.items() if abs(hx - cx) < 12 and abs(hy - cy) < 12), ('back', 'back'))
        add('powhut', cx, cy, 48, 48, breach=breach, exit=exit_)
    # --- shipping containers: 64 x 32 red blocks (a 96 x 64 patch is two, staggered) ---
    red = np.isin(key, [RED, DKRED])
    for comp in components(red):
        ys, xs = [p[0] for p in comp], [p[1] for p in comp]
        x0, y0, w, h = min(xs), min(ys), max(xs) - min(xs) + 1, max(ys) - min(ys) + 1
        if w < 40:
            continue  # (the star box)
        if w <= 70:
            add('container', x0 + 32, y0 + 16, 64, 32)
        else:  # two: which way they're staggered
            tl = red[y0:y0 + 32, x0:x0 + 64].sum() > red[y0:y0 + 32, x0 + 32:x0 + 96].sum()
            add('container', x0 + 32 if tl else x0 + 64, y0 + 16, 64, 32)
            add('container', x0 + 64 if tl else x0 + 32, y0 + 48, 64, 32)
    entities += [dict(m) for m in MANUAL]
    # each gate on its wall's centre line (the game stands the wall there), wherever the hand-placed
    # position puts it
    for e in entities:
        if e['type'] != 'gate': continue
        c = e['x'] // CELL - e['w'] // CELL  # a column of plain wall beside the gateway
        wall = [r for r in range(rows) if grid[r, c] == 'W' and abs(r * CELL - e['y']) < 40]
        if wall: e['y'] = (wall[0] + wall[-1] + 1) * CELL // 2

    # objects own their footprint: what's under them takes after the ground round them
    for e in entities:
        if e['type'] in ('start', 'pickup', 'soldier', 'laser'):
            continue
        w, h = e.get('w', 16), e.get('h', 16)
        if e['type'] == 'powhut':
            w, h = w + 24, h + 24  # its whole bay: the dashed orange-and-black outline round it is paint, not crates
        r0, r1 = max(0, (e['y'] - h // 2) // CELL), min(rows, (e['y'] + h // 2 + CELL - 1) // CELL)
        c0, c1 = max(0, (e['x'] - w // 2) // CELL), min(cols, (e['x'] + w // 2 + CELL - 1) // CELL)
        sub = grid[r0:r1, c0:c1]
        if e['type'] == 'gate':
            sub[:] = 'W'  # the gate stands in the wall (the gate object blocks till it's shot open)
        elif e['type'] == 'helipad':  # the landing square, and a narrower STOP strip on its apron side (4 cells, a cell short top and bottom), as stage 2
            sub[np.isin(sub, ['B', 'K', 'Q'])] = '.'
            west = e.get('apron') == 'west'
            sq0, sq1 = (c0 + 4, c1) if west else (c0, c1 - 4)
            grid[r0:r1, sq0:sq1] = 'H'
            grid[r0 + 1:r1 - 1, (c0 if west else c1 - 4):(c0 + 4 if west else c1)] = 'H'
        else:
            sub[np.isin(sub, ['B', 'K', 'Q'])] = '.'  # (red-roofed containers, the huts' orange: not crates or buildings)
    # a wall's gateway: the cells the gate covers are open ground once it's gone
    for e in entities:
        if e['type'] == 'gate':
            r0, r1 = (e['y'] - e['h'] // 2) // CELL, (e['y'] + e['h'] // 2 + CELL - 1) // CELL
            c0, c1 = (e['x'] - e['w'] // 2) // CELL, (e['x'] + e['w'] // 2 + CELL - 1) // CELL
            grid[r0:r1, c0:c1] = '.'

    # the hidden star near the end is drawn on the NES map as a box (two 'crate' cells): no box here, just a hit spot that reveals it
    for e in entities:
        if e['type'] == 'pickup' and (e['x'], e['y']) == (312, 536):
            r, c = e['y'] // CELL, e['x'] // CELL
            for cc in range(c - 2, c + 1):
                if grid[r, cc] == 'B': grid[r, cc] = '.'
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / 'terrain.txt').write_text('\n'.join(''.join(r) for r in grid) + '\n')

    # --- soldiers: scattered over open tarmac, clear of objects and each other ---
    rng = random.Random(1988)
    soldiers = []
    def clear(x, y):
        r, c = y // CELL, x // CELL
        if not (1 <= r < rows - 1 and 1 <= c < cols - 1): return False
        if (grid[r - 1:r + 2, c - 1:c + 2] != '.').any(): return False
        for e in entities:
            if e['type'] in ('start', 'pickup'): continue
            if abs(e['x'] - x) < e.get('w', 16) / 2 + 14 and abs(e['y'] - y) < e.get('h', 16) / 2 + 14: return False
        return all((x - o['x']) ** 2 + (y - o['y']) ** 2 > 44 ** 2 for o in soldiers)
    for x0, x1, y0, y1, count in SOLDIER_ZONES:
        placed = 0
        for _ in range(8000):
            if placed == count: break
            x, y = rng.randint(x0, x1), rng.randint(y0, y1)
            if clear(x, y):
                soldiers.append({'type': 'soldier', 'x': x, 'y': y}); placed += 1
    entities += soldiers
    # a few more foot soldiers in the double causeway, placed by hand: world (-12.5, -215), (-13, -185), (4.5, -200)
    entities += [{'type': 'soldier', 'x': x, 'y': y} for x, y in [(176, 1496), (173, 1688), (285, 1592)]]
    entities += [{'type': 'lighttank', 'x': 253, 'y': 2453}, {'type': 'lighttank', 'x': 201, 'y': 2366},
                 {'type': 'lighttank', 'x': 323, 'y': 2212}, {'type': 'lighttank', 'x': 298, 'y': 2058},
                 {'type': 'lighttank', 'x': 426, 'y': 1899}, {'type': 'lighttank', 'x': 179, 'y': 1605},
                 {'type': 'lighttank', 'x': 282, 'y': 1483}, {'type': 'lighttank', 'x': 282, 'y': 1419},
                 {'type': 'lighttank', 'x': 388, 'y': 1305}, {'type': 'lighttank', 'x': 64, 'y': 1022}, {'type': 'lighttank', 'x': 378, 'y': 1022},
                 {'type': 'lighttank', 'x': 257, 'y': 894}, {'type': 'lighttank', 'x': 220, 'y': 786},
                 {'type': 'lighttank', 'x': 401, 'y': 457}, {'type': 'lighttank', 'x': 110, 'y': 357},
                 {'type': 'lighttank', 'x': 136, 'y': 133}, {'type': 'lighttank', 'x': 334, 'y': 133}]  # placed by hand: world (-0.5, -65.4), (-8.6, -79), (10.5, -103.2), (6.5, -127.2), (26.6, -152), (-12, -198)

    meta = {'source': SRC.name, 'cell': CELL, 'width': cols * CELL, 'height': rows * CELL, 'pad': [PAD_X, PAD_Y]}  # pad: the markings' and water's margin round the map (px)
    (OUT / 'entities.json').write_text(json.dumps({'meta': meta, 'entities': entities}, indent=1))

    # --- the ground's painted detail: white road markings on the tarmac, hazard stripes on the quays ---
    # Worked out over the map plus the margin the game paints round it (PAD_X / PAD_Y px a side), the
    # map's edges carried on outwards, so quays, stripes and the shoreline don't stop at the map's edge.
    from scipy import ndimage
    pad = ((PAD_Y, PAD_Y), (PAD_X, PAD_X))
    cellgrid = np.repeat(np.repeat(grid, CELL, 0), CELL, 1)[:key.shape[0], :key.shape[1]]
    owned = np.zeros(key.shape, bool)
    for e in entities:
        if e['type'] in ('barrier', 'parkedjeep', 'turret', 'container', 'powhut'):
            w, h = e['w'] + 2, e['h'] + 2
            for ox, oy in [(e['x'], e['y'])] + ([tuple(e['from'])] if 'from' in e else []):
                owned[max(0, oy - h // 2):oy + h // 2 + 1, max(0, ox - w // 2):ox + w // 2 + 1] = True
    white = np.pad((key == WHITE) & (cellgrid == '.') & ~owned, pad)    # (road markings: on the map only)
    key, cellgrid = np.pad(key, pad, mode='edge'), np.pad(cellgrid, pad, mode='edge')
    mark = np.zeros(key.shape + (4,), np.uint8)
    mark[white] = (255, 255, 255, 255)
    # The quays: the land runs out to the outer edge of the hazard band and stops there. On the NES the
    # band has a black staircase on its water side (a drop shadow); that's water here. The band's
    # outer edge is found locally: as far from the solid ground behind it as its stripes reach.
    water_px = np.isin(key, WATER)
    near_quay = ndimage.binary_dilation(cellgrid == 'Q', np.ones((CELL * 2 + 1, CELL * 2 + 1), bool))
    ground = ~water_px & ~np.isin(key, [AMBER, BLACK])                  # any ground that isn't the band's paint
    dist = ndimage.distance_transform_edt(~ground)                      # px from that ground
    reach = ndimage.maximum_filter(np.where(near_quay & (key == AMBER), dist, 0), size=9)  # how far the stripes go, round here
    shore = ndimage.distance_transform_edt(~water_px)                   # px from the water
    land = (~water_px & ~near_quay) | ground | (~water_px & near_quay & (dist <= reach + .5)) | (~water_px & np.isin(cellgrid, ['B', 'K'])) \
        | (~water_px & (shore > BAND_FROM_WATER))  # (crates and buildings by a quay, and anything well back from the water: land)
    land[:PAD_Y + SEA_ROWS * CELL] = False  # (the open sea at the top, where the warship lies)
    # the band's paint: only its outer BAND_KEEP (narrower than the NES draws it; the rest is plain
    # tarmac), in a darker ochre and black
    painted = near_quay & land & (dist >= reach * (1 - BAND_KEEP)) & (shore <= BAND_FROM_WATER)  # (the band itself: not a crate stack's orange-and-black foot just behind it)
    for colour, val in ((AMBER, (196, 128, 18, 255)), (BLACK, (22, 20, 18, 255))):
        mark[painted & (key == colour)] = val
    # the water, pixel by pixel (white = water): everything that isn't land, so the game's shoreline
    # is the band's outer edge exactly, not the 8 px cells
    wet = ~land
    Image.fromarray((wet * 255).astype(np.uint8), 'L').save(OUT / 'water.png', optimize=True)
    mark[524 + PAD_Y:548 + PAD_Y, 300 + PAD_X:324 + PAD_X] = 0  # the hidden star's box outline on the NES map is not a road marking
    # 4x, smoothed the pixel-art way (Scale2x twice): crisp edges, rounded stair-steps on the arrows
    big = scale2x(scale2x(mark))
    # the band repainted with its own diagonal stripes, finer than the NES's (the shape stays the band's)
    band = (big[..., 3] > 0) & ~((big[..., 0] == 255) & (big[..., 1] == 255))  # (not the white road markings)
    yy, xx = np.nonzero(band)
    dark = (((2 * xx + yy) * .45) // STRIPE) % 2 == 1  # (at ~63 degrees: never along a quay, straight or 45-degree)
    big[yy[dark], xx[dark]] = (22, 20, 18, 255)
    big[yy[~dark], xx[~dark]] = (196, 128, 18, 255)
    Image.fromarray(big, 'RGBA').save(OUT / 'markings.png', optimize=True)
    key = key[PAD_Y:-PAD_Y, PAD_X:-PAD_X]  # (the map itself again, for the debug image)

    # --- debug image ---
    dbg = Image.fromarray(im.astype(np.uint8)).convert('RGBA')
    ov = Image.new('RGBA', dbg.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(ov)
    tint = {'L': (120, 0, 120, 140), '~': (0, 120, 255, 50), 'Q': (255, 0, 255, 110), 'B': (255, 200, 0, 90), 'K': (255, 60, 0, 110),
            'W': (40, 40, 40, 170), 'H': (200, 200, 200, 120)}
    for r in range(rows):
        for c in range(cols):
            col = tint.get(grid[r, c])
            if col:
                d.rectangle([c * CELL, r * CELL, c * CELL + CELL - 1, r * CELL + CELL - 1], fill=col)
    colours = {'turret': (255, 0, 0, 255), 'laser': (255, 0, 255, 255), 'parkedjeep': (0, 255, 255, 255),
               'barrier': (0, 255, 0, 255), 'powhut': (255, 255, 0, 255), 'container': (255, 128, 0, 255),
               'gate': (0, 0, 255, 255), 'soldier': (255, 255, 255, 255)}
    for e in entities:
        w, h = e.get('w', 10), e.get('h', 10)
        d.rectangle([e['x'] - w // 2, e['y'] - h // 2, e['x'] + w // 2, e['y'] + h // 2], outline=colours.get(e['type'], (255, 255, 255, 255)), width=2)
    Image.alpha_composite(dbg, ov).convert('RGB').save(DEBUG)
    print(f'{rows}x{cols} cells, {len(entities)} entities:',
          {t: sum(e['type'] == t for e in entities) for t in sorted({e['type'] for e in entities})})


if __name__ == '__main__':
    main()
