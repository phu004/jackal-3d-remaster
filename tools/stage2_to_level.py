"""Convert the ripped NES Jackal stage 2 map (desert ruins) into level data for the remaster.

    python tools/stage2_to_level.py

Reads  asset-sources/jackal-stage-2-nes-map.webp  (512 x 2932, title banner on top)
Writes src/levels/stage2/terrain.txt    one char per 8x8-pixel NES cell, north at the top
       src/levels/stage2/entities.json  objects found on the map, in map-pixel coordinates
       reference/stage2-debug.png       the map with detections drawn on, for checking

Terrain chars:  .  sand            "  grass field         P  stone terrace (raised; visual only)
                E  terrace edge     ^  ramp (walkable)     ~  water (blocks)
                W  compound wall (blocks)    R  pool rim (blocks)    C  causeway (walkable stone)
                H  helipad concrete
Gameplay is 2D: terraces and their edges only *look* raised (see the game's height map);
edges and walls block, ramps are the way up.

Re-running overwrites both files: put fixes in MANUAL below rather than editing the output.
"""
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'asset-sources' / 'jackal-stage-2-nes-map.webp'
OUT = ROOT / 'src' / 'levels' / 'stage2'
DEBUG = ROOT / 'reference' / 'stage2-debug.png'
HEADER = 60
CELL = 8

rgb = lambda r, g, b: (r << 16) | (g << 8) | b
OLIVE, GREY, CREAM, BLACK = rgb(140, 138, 0), rgb(189, 190, 189), rgb(255, 219, 165), 0
DKGREEN, GREEN, STONE = rgb(49, 97, 66), rgb(82, 162, 0), rgb(123, 125, 123)
WATER = [rgb(33, 0, 181), rgb(66, 146, 198)]

# Things the automatic pass can't know. Positions are map pixels (centre). Filled in as the
# stage is built up.
MANUAL = [
    {'type': 'start', 'x': 190, 'y': 2840},                      # where the jeep starts: open sand, clear of the columns
    {'type': 'helipad', 'x': 352, 'y': 1031, 'w': 128, 'h': 82, 'apron': 'west'},  # POW drop-off in the grass field; its STOP strip is on the west
    {'type': 'pickup', 'x': 448, 'y': 328},                       # star by the north colonnade
    {'type': 'pickup', 'x': 55, 'y': 1808},                       # star on the west terrace
    {'type': 'lighttank', 'x': 384, 'y': 2712},                   # light tank well east of the first engineer hut (out of reach of the start)
    {'type': 'lighttank', 'x': 164, 'y': 2380},                   # light tank east of the first pool, south of its two turrets
    {'type': 'mediumtank', 'x': 352, 'y': 1915},                  # medium tank just north of the village's north gate
    # huts (grey, corrugated roof) and striped tents
    {'type': 'hut', 'x': 128, 'y': 1149, 'w': 64, 'h': 56},
    {'type': 'hut', 'x': 96, 'y': 1976, 'w': 48, 'h': 48},
    {'type': 'hut', 'x': 288, 'y': 2071, 'w': 48, 'h': 48},
    {'type': 'hut', 'x': 160, 'y': 2664, 'w': 48, 'h': 48},
    {'type': 'tent', 'x': 416, 'y': 2079, 'w': 56, 'h': 56, 'breach': 'west', 'look': 'straw'},  # open on the left: the right is the map's edge
    {'type': 'tent', 'x': 416, 'y': 2182, 'w': 56, 'h': 48, 'breach': 'west', 'look': 'straw'},
    # compound gates (green doors in the stone walls)
    {'type': 'gate', 'x': 352, 'y': 2001, 'w': 56, 'h': 28},
    {'type': 'gate', 'x': 288, 'y': 2207, 'w': 64, 'h': 28},
    # fallen columns lying in the grass field
    {'type': 'fallen', 'x': 80, 'y': 966, 'w': 32, 'h': 14},
    {'type': 'fallen', 'x': 144, 'y': 998, 'w': 32, 'h': 14},
    {'type': 'fallen', 'x': 432, 'y': 1127, 'w': 32, 'h': 14},
    {'type': 'fallen', 'x': 400, 'y': 1159, 'w': 32, 'h': 14},
    # statues standing in the pools, and the row of great busts along the north wall
    {'type': 'statue', 'x': 175, 'y': 455, 'w': 32, 'h': 40},
    {'type': 'statue', 'x': 335, 'y': 455, 'w': 32, 'h': 40},
    {'type': 'statue', 'x': 175, 'y': 535, 'w': 32, 'h': 40},
    {'type': 'statue', 'x': 335, 'y': 535, 'w': 32, 'h': 40},
    {'type': 'statue', 'x': 45, 'y': 2342, 'w': 32, 'h': 40},
    {'type': 'bust', 'x': 190, 'y': 35, 'w': 32, 'h': 40},
    {'type': 'bust', 'x': 230, 'y': 35, 'w': 32, 'h': 40},
    {'type': 'bust', 'x': 270, 'y': 35, 'w': 32, 'h': 40},
    {'type': 'bust', 'x': 310, 'y': 35, 'w': 32, 'h': 40},
]
NO_TURRETS = [(288, 416, 990, 1072)]

# Foot soldiers, scattered over open ground along the route (not near the landing zone, objects or
# each other), plus a squad in the compound yard. (x0, x1, y0, y1, count) in map pixels.
SOLDIER_ZONES = [
    (250, 460, 2020, 2260, 4),    # compound yard
    (24, 488, 330, 2700, 24),     # anywhere along the route (start area excluded)
]


def soldiers(grid, entities):
    import random
    rng = random.Random(1989)
    rows, cols = grid.shape
    out = []
    def clear(x, y):
        r, c = y // CELL, x // CELL
        if not (1 <= r < rows - 1 and 1 <= c < cols - 1): return False
        if any(grid[r + dr, c + dc] not in '."' for dr in (-1, 0, 1) for dc in (-1, 0, 1)): return False
        for e in entities:
            if e['type'] in ('start', 'pickup'): continue
            if abs(e['x'] - x) < e.get('w', 16) / 2 + 14 and abs(e['y'] - y) < e.get('h', 16) / 2 + 14: return False
        return all((x - o['x']) ** 2 + (y - o['y']) ** 2 > 44 ** 2 for o in out)
    for x0, x1, y0, y1, n in SOLDIER_ZONES:
        placed = 0
        for _ in range(6000):
            if placed == n: break
            x, y = rng.randint(x0, x1), rng.randint(y0, y1)
            if clear(x, y):
                out.append({'type': 'soldier', 'x': x, 'y': y}); placed += 1
    return out  # x0, x1, y0, y1: the helipad's markings look like turret frames


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


def classify(key):
    rows, cols = key.shape[0] // CELL, key.shape[1] // CELL
    cells = key[:rows * CELL, :cols * CELL].reshape(rows, CELL, cols, CELL).transpose(0, 2, 1, 3)
    n = lambda pal: np.isin(cells, pal if isinstance(pal, list) else [pal]).sum(axis=(2, 3))
    grid = np.full((rows, cols), '?', dtype='<U1')
    grid[n([OLIVE, GREEN, BLACK]) >= 56] = '.'
    grid[n(OLIVE) >= 40] = '.'
    grid[n([DKGREEN, GREEN]) >= 56] = '"'
    grid[n([GREY, CREAM]) == 64] = 'P'
    grid[n(WATER) >= 32] = '~'
    return grid


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


def pools(g, entities):
    """Tidy the pools so each is a clean basin fully enclosed by its stone rim (as the NES draws them)."""
    rows, cols = g.shape
    def near(ch, r, c, d):
        return (g[max(0, r - d):r + d + 1, max(0, c - d):c + d + 1] == ch).any()
    # the causeway's ends: stone in line with it is causeway too, not wall (it must stay open)
    for _ in range(3):
        for r, c in zip(*np.nonzero(g == 'W')):
            if (g[max(0, r - 3):r + 4, c] == 'C').any():
                g[r, c] = 'C'
    # statues stand in the water
    for e in entities:
        if e['type'] == 'statue':
            r0, r1 = (e['y'] - e['h'] // 2) // CELL, (e['y'] + e['h'] // 2 + CELL - 1) // CELL
            c0, c1 = (e['x'] - e['w'] // 2) // CELL, (e['x'] + e['w'] // 2 + CELL - 1) // CELL
            sub = g[r0:r1, c0:c1]; sub[sub == '.'] = '~'
    for _ in range(2):
        for r in range(rows):
            for c in range(cols):
                ch = g[r, c]
                if ch == 'W' and near('R', r, c, 1) and near('~', r, c, 3):
                    g[r, c] = 'R'  # the rim's outer half, mistaken for compound wall
                elif ch == '.' and near('~', r, c, 1) and near('R', r, c, 1):
                    g[r, c] = '~'  # the shadow line along the rim is water
    for r in range(rows):  # gaps in a rim: sand with rim on both sides along the rim's line
        for c in range(cols):
            if g[r, c] != '.' or not near('~', r, c, 3): continue
            if (0 < c < cols - 1 and g[r, c - 1] == 'R' and g[r, c + 1] == 'R') or (0 < r < rows - 1 and g[r - 1, c] == 'R' and g[r + 1, c] == 'R')                     or (c < cols - 1 and g[r, c + 1] == 'R' and r > 0 and g[r - 1, c] == 'R'):
                g[r, c] = 'R'
    # (a pool running off the side of the map stays open there: the water carries on past the edge, as on the NES)
    # fill any sand left between a rim and the corner it closes (until nothing changes)
    changed = True
    while changed:
        changed = False
        for r in range(rows):
            for c in range(cols):
                if g[r, c] == '.' and sum(1 for dr, dc in ((1, 0), (-1, 0), (0, 1), (0, -1)) if 0 <= r + dr < rows and 0 <= c + dc < cols and g[r + dr, c + dc] == 'R') >= 2 and near('~', r, c, 3):
                    g[r, c] = 'R'; changed = True
    # the rims either side of the causeway: as wide on one side as on the other (the stones match)
    for r in range(rows):
        cs = np.nonzero(g[r] == 'C')[0]
        if not len(cs): continue
        c0, c1 = cs.min(), cs.max()
        def run(c, step):
            n = 0
            while 0 <= c < cols and g[r, c] == 'R': n += 1; c += step
            return n
        left, right = run(c0 - 1, -1), run(c1 + 1, 1)
        if not left or not right: continue
        w = max(left, right)
        for k in range(w):
            for c in (c0 - 1 - k, c1 + 1 + k):
                if 0 <= c < cols and g[r, c] in ('~', '.'): g[r, c] = 'R'


def cacti(key, grid, entities):
    """The little green plants dotted over the sand (clumps of two or three): one 'cactus' per plant,
    from the green pixels on plain sand cells; not along the terraces' scrub fringe, walls or rims."""
    rows, cols = grid.shape
    near_wall = np.zeros_like(grid, bool)
    for r, c in zip(*np.nonzero(np.isin(grid, ['E', 'W', 'R', 'P', '~', '"', 'H']))):
        near_wall[max(0, r - 2):r + 3, max(0, c - 2):c + 3] = True
    green = np.isin(key, [DKGREEN, GREEN])
    H, W = key.shape
    seen = np.zeros_like(green)
    out = []
    for y, x in zip(*np.nonzero(green)):
        if seen[y, x] or y // CELL >= rows or x // CELL >= cols: continue
        if grid[y // CELL, x // CELL] != '.' or near_wall[y // CELL, x // CELL]: continue
        stack, pts = [(y, x)], []
        seen[y, x] = True
        while stack:
            cy, cx = stack.pop(); pts.append((cy, cx))
            for dy in (-1, 0, 1):
                for dx in (-1, 0, 1):
                    ny, nx = cy + dy, cx + dx
                    if 0 <= ny < H and 0 <= nx < W and green[ny, nx] and not seen[ny, nx]:
                        seen[ny, nx] = True; stack.append((ny, nx))
        if len(pts) < 4: continue
        ys, xs = [q[0] for q in pts], [q[1] for q in pts]
        cx, cy = sum(xs) // len(xs), sum(ys) // len(ys)
        if any(e['type'] in ('column', 'turret', 'hut', 'tent', 'helipad', 'fallen') and abs(e['x'] - cx) < e.get('w', 24) / 2 + 6 and abs(e['y'] - cy) < e.get('h', 24) / 2 + 6 for e in entities):
            continue
        if any(abs(o['x'] - cx) < 5 and abs(o['y'] - cy) < 5 for o in out): continue
        out.append({'type': 'cactus', 'x': int(cx), 'y': int(cy), 'size': len(pts)})
    return out


def main():
    im, key = load()
    grid = classify(key)
    rows, cols = grid.shape
    entities = []

    # --- pillars: find each cap, then the plinth's black base line below it. In a colonnade the
    # pillars stand in a tight row, each partly hiding the one behind: a pillar's own base is then
    # out of sight behind the next one, so the search stops at the next cap down the row and the
    # base goes at the usual cap-to-base distance instead.
    caps = sorted(set(match(key, 42, 305, 14, 9, [CREAM])), key=lambda c: (c[1], c[0]))
    TYPICAL = 52  # px from cap to the plinth's base line on a free-standing pillar
    for px, py in caps:
        cx = px + 6
        below = [c for c in caps if abs(c[0] - px) <= 4 and py + 8 < c[1] < py + 110]
        limit = min([c[1] for c in below], default=py + 110)
        base = None
        if below:  # one of a row: its base is hidden behind the next pillar; space them as their caps are
            base = py + TYPICAL
        else:
            for y in range(py + 16, min(limit + TYPICAL // 2, key.shape[0])):
                if (key[y, cx - 12:cx + 12] == BLACK).sum() >= 18:
                    base = y
                    break
        if base is None:
            continue  # not a pillar after all
        if any(e['type'] == 'column' and abs(e['x'] - cx) < 8 and abs(e['y'] - (base - 6)) < 8 for e in entities):
            continue  # the same pillar again (its cap matched more than once)
        entities.append({'type': 'column', 'x': cx, 'y': base - 6, 'w': 32, 'h': 24, 'tall': base - py})  # w x h: the plinth

    # --- ramps: a log rail at the top and bottom, planks between ---
    for px, py in match(key, 201, 1744, 38, 8, [BLACK, CREAM]):
        if any(e['type'] == 'ramp' and abs(e['x'] - (px + 19)) < 8 and abs(e['y'] - (py + 28)) < 60 for e in entities):
            continue
        entities.append({'type': 'ramp', 'x': px + 19, 'y': py + 28, 'w': 40, 'h': 56})

    # --- turrets: grey 32x32 blocks; matched on the stone frame along their top and bottom
    # (the gun in the middle can point any way) ---
    top = set(match(key, 162, 130, 28, 4, [STONE]))
    for px, py in match(key, 162, 154, 28, 4, [STONE]):
        x, y = px + 14, py - 10
        if (px, py - 24) not in top or any(x0 <= x <= x1 and y0 <= y <= y1 for x0, x1, y0, y1 in NO_TURRETS):
            continue
        if any(e['type'] == 'turret' and abs(e['x'] - x) < 20 and abs(e['y'] - y) < 20 for e in entities):
            continue  # the same turret, matched a pixel or two off
        entities.append({'type': 'turret', 'x': x, 'y': y, 'w': 32, 'h': 32})
    entities += [dict(m) for m in MANUAL]

    # objects own their footprint: what's under them is whatever surrounds them
    def footprint(e):
        w, h = e.get('w', 24), e.get('h', 16)
        if e['type'] == 'column':
            w, h = 32, 24  # the plinth
        return (max(0, (e['y'] - h // 2) // CELL), min(rows, (e['y'] + h // 2 + CELL - 1) // CELL),
                max(0, (e['x'] - w // 2) // CELL), min(cols, (e['x'] + w // 2 + CELL - 1) // CELL))
    owned = np.zeros((rows, cols), bool)
    for e in entities:
        if e['type'] in ('ramp', 'start', 'pickup', 'helipad', 'lighttank', 'mediumtank'):
            continue
        r0, r1, c0, c1 = footprint(e)
        owned[r0:r1, c0:c1] = True
    for e in entities:
        if e['type'] == 'column':
            r0, r1, c0, c1 = footprint(e)
            top_r = max(0, (e['y'] - e['tall']) // CELL)
            owned[top_r:r0, max(0, (e['x'] - 10) // CELL):min(cols, (e['x'] + 10 + CELL - 1) // CELL)] = True

    out_grid = grid.copy()
    out_grid[owned & (grid != '~')] = '*'  # filled in below from the surroundings (a tent's striped roof isn't terrace, a gate isn't grass)

    # ramps: walkable; the planks are the way up
    for e in entities:
        if e['type'] == 'ramp':
            r0, r1, c0, c1 = (e['y'] - e['h'] // 2) // CELL, (e['y'] + e['h'] // 2) // CELL, (e['x'] - e['w'] // 2) // CELL, (e['x'] + e['w'] // 2) // CELL
            out_grid[r0 + 1:r1, c0:c1 + 1] = '^'

    # stone: the pools' rims are walls, the causeway between the pools is walkable
    n = lambda pal, r, c: int(np.isin(key[r * CELL:r * CELL + CELL, c * CELL:c * CELL + CELL], pal).sum())
    for r in range(rows):
        for c in range(cols):
            if out_grid[r, c] not in ('?', '.') or n([STONE], r, c) < 6 or n([OLIVE], r, c) > 24:
                continue
            row = out_grid[r]
            west = any(row[k] == '~' for k in range(max(0, c - 14), c))
            east = any(row[k] == '~' for k in range(c + 1, min(cols, c + 15)))
            inner = all(row[k] != '~' for k in range(max(0, c - 2), min(cols, c + 3)))
            out_grid[r, c] = 'C' if west and east and inner else 'R' if (out_grid[max(0, r - 2):r + 3, max(0, c - 2):c + 3] == '~').any() else 'W'

    # a star's sprite isn't terrain: its cells take after their surroundings (not terrace edge)
    for e in entities:
        if e['type'] == 'pickup':
            sub = out_grid[(e['y'] - 8) // CELL:(e['y'] + 8) // CELL + 1, (e['x'] - 8) // CELL:(e['x'] + 8) // CELL + 1]
            sub[sub == '?'] = '*'
    # terrace edges: structure cells touching a terrace (the rubble rim and its scrub)
    def near(ch, r, c, d):
        return (out_grid[max(0, r - d):r + d + 1, max(0, c - d):c + d + 1] == ch).any()
    for r in range(rows):
        for c in range(cols):
            if out_grid[r, c] == '?' and near('P', r, c, 2):
                out_grid[r, c] = 'E'
    # filled-in object footprints and leftover detail take after their surroundings
    for _ in range(3):
        for r, c in zip(*np.nonzero(np.isin(out_grid, ['*', '?']))):
            nb = out_grid[max(0, r - 1):r + 2, max(0, c - 1):c + 2].ravel().tolist()
            for ch in ('P', '"', '.'):
                if nb.count(ch) >= 2:
                    out_grid[r, c] = ch
                    break
    out_grid[np.isin(out_grid, ['*', '?'])] = '.'
    out_grid[:3][out_grid[:3] == '.'] = 'P'  # above the north colonnade: the top of the ruins
    pools(out_grid, entities)
    # compound walls: one-cell notches in the NES's wall bands are decoration, not gaps (they'd make
    # the walls come out in misaligned or sideways pieces)
    for _ in range(2):
        for r in range(1, rows - 1):
            for c in range(1, cols - 1):
                if out_grid[r, c] == '.' and ((out_grid[r, c - 1] == 'W' and out_grid[r, c + 1] == 'W') or (out_grid[r - 1, c] == 'W' and out_grid[r + 1, c] == 'W')):
                    out_grid[r, c] = 'W'
    for e in entities:  # the helipad's concrete apron (the slab and markings are drawn by the game)
        if e['type'] == 'helipad': # the landing square, and a narrower STOP strip on its apron side (4 cells, a cell short top and bottom)
            r0, r1 = (e['y'] - e['h'] // 2) // CELL, (e['y'] + e['h'] // 2) // CELL
            c0, c1 = (e['x'] - e['w'] // 2) // CELL, (e['x'] + e['w'] // 2) // CELL
            west = e.get('apron') == 'west'
            sq0, sq1 = (c0 + 4, c1) if west else (c0, c1 - 4)
            out_grid[r0:r1, sq0:sq1] = 'H'
            out_grid[r0 + 1:r1 - 1, (c0 if west else c1 - 4):(c0 + 4 if west else c1)] = 'H'
            ring = out_grid[max(0, r0 - 3):r1 + 3, max(0, c0 - 3):c1 + 3] # the NES's ring of drums / lights: grass under them (the game puts its own lights there)
            if (ring == '"').sum() > (ring == '.').sum(): ring[ring == '.'] = '"'
    # every terrace is closed by an edge where it meets the ground, except where a ramp comes up
    low = np.isin(out_grid, ['.', '"'])
    for r, c in zip(*np.nonzero(out_grid == 'P')):
        nb = [(r + 1, c), (r - 1, c), (r, c + 1), (r, c - 1)]
        if any(0 <= rr < rows and 0 <= cc < cols and low[rr, cc] for rr, cc in nb)                 and not (out_grid[max(0, r - 1):r + 2, max(0, c - 1):c + 2] == '^').any():
            out_grid[r, c] = 'E'
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / 'terrain.txt').write_text('\n'.join(''.join(r) for r in out_grid) + '\n')
    entities += cacti(key, out_grid, entities)
    entities += soldiers(out_grid, entities)
    meta = {'source': SRC.name, 'cell': CELL, 'width': cols * CELL, 'height': rows * CELL}
    (OUT / 'entities.json').write_text(json.dumps({'meta': meta, 'entities': entities}, indent=1))

    # --- debug image ---
    dbg = Image.fromarray(im.astype(np.uint8)).convert('RGBA')
    ov = Image.new('RGBA', dbg.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(ov)
    tint = {'.': None, '"': None, 'P': (255, 0, 255, 70), 'E': (255, 120, 0, 120), '^': (0, 255, 0, 120),
            '~': (0, 120, 255, 60), 'W': (40, 40, 40, 170), 'R': (60, 60, 120, 170), 'C': (255, 255, 0, 90), 'H': (200, 200, 200, 120), '?': (255, 0, 0, 110)}
    for r in range(rows):
        for c in range(cols):
            col = tint.get(out_grid[r, c])
            if col:
                d.rectangle([c * CELL, r * CELL, c * CELL + CELL - 1, r * CELL + CELL - 1], fill=col)
    for e in entities:
        w, h = e.get('w', 16), e.get('h', 16) if e['type'] != 'column' else 12
        col = {'column': (0, 255, 255, 255), 'ramp': (0, 255, 0, 255), 'turret': (255, 0, 0, 255)}.get(e['type'], (255, 255, 255, 255))
        d.rectangle([e['x'] - w // 2, e['y'] - h // 2, e['x'] + w // 2, e['y'] + h // 2], outline=col, width=2)
    Image.alpha_composite(dbg, ov).convert('RGB').save(DEBUG)
    print(f'{rows}x{cols} cells, {len(entities)} entities:',
          {t: sum(e['type'] == t for e in entities) for t in sorted({e['type'] for e in entities})})


if __name__ == '__main__':
    main()
