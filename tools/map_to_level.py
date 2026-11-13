"""Convert a ripped NES Jackal stage map into level data for the remaster.

    python tools/map_to_level.py

Reads  asset-sources/jackal-stage-1-nes-map.webp  (512 x 2932, title banner on top)
Writes src/levels/stage1/terrain.txt    one char per 8x8-pixel NES cell, north at the top
       src/levels/stage1/entities.json  objects found on the map, in map-pixel coordinates
       reference/stage1-debug.png       the map with detections drawn on, for checking

Terrain chars:  .  sand        T  jungle (blocks)   ,  coast / river bank
                ~  water (blocks)   =  bridge       W  wall (blocks)     H  concrete pad

The output is a first draft: re-running this overwrites both files, so make hand edits
in the MANUAL section below (or in a separate file) rather than in the outputs.
"""
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'asset-sources' / 'jackal-stage-1-nes-map.webp'
OUT = ROOT / 'src' / 'levels' / 'stage1'
DEBUG = ROOT / 'reference' / 'stage1-debug.png'
HEADER = 60  # title banner rows on the ripped image
CELL = 8

rgb = lambda r, g, b: (r << 16) | (g << 8) | b
SAND = [rgb(255, 162, 0), rgb(198, 113, 0)]
DARK = [rgb(0, 0, 0), rgb(74, 162, 107), rgb(57, 109, 0), rgb(74, 89, 0)]
WATER = [rgb(33, 0, 181), rgb(66, 97, 255), rgb(255, 255, 255)]
GREY = [rgb(123, 125, 123), rgb(189, 190, 189)]

# Sprite templates: (x, y, w, h) of one clean example on the cropped map. Every pixel that
# isn't sand must match exactly, so each sprite is found wherever the NES drew it.
TEMPLATES = {
    'palm': (160, 96, 32, 32),
    'rock': (164, 965, 26, 24),
    'foxhole': (128, 1160, 32, 20),
    'barracks': (72, 1352, 56, 48),
    'tent': (312, 1988, 39, 52),
}

CLEARING = (1, 39, 5, 59, 5)  # final clearing: rows r0..r1, cols c0..c1 (~65 x 45 m once the edges are rounded), corner radius

# Things the automatic pass can't know. Positions are map pixels (centre).
MANUAL = [
    {'type': 'gate', 'x': 352, 'y': 2128, 'w': 64, 'h': 32},  # compound's south gate (green doors)
    {'type': 'start', 'x': 224, 'y': 2780},                   # where the transport lands
    {'type': 'tent', 'x': 459, 'y': 2078, 'w': 39, 'h': 52},  # drawn slightly differently, so no exact match
    {'type': 'barracks', 'x': 420, 'y': 2000, 'w': 56, 'h': 48, 'variant': 'compound'},
    {'type': 'pickup', 'x': 408, 'y': 855},                    # the hidden star item (one tile left of the NES spot)
    {'type': 'helipad', 'x': 264, 'y': 560},                   # POW drop-off, end of the stage
    {'type': 'lighttank', 'x': 100, 'y': 820},                 # light tank holding the choke point between the jungle and the scrub, south of the helipad
    # invisible solid boxes plugging gaps the NES blocks with sprite-sized collision
    {'type': 'blocker', 'x': 60, 'y': 2128, 'w': 16, 'h': 32},  # between the shore and the palm row west of the compound
]

# Foot soldiers: one in every foxhole, a squad in the compound yard, and the rest scattered over open
# ground along the route (not near the landing zone, buildings or each other). Map pixels.
SOLDIER_ZONES = [  # (x0, x1, y0, y1, count)
    (175, 500, 1935, 2105, 4),    # compound yard
    (24, 488, 120, 2620, 20),     # anywhere along the route (start area excluded)
]
OPEN = set('.')


def soldiers(grid, entities):
    import random
    rng = random.Random(1988)
    out = [{'type': 'soldier', 'x': e['x'], 'y': e['y'] + 2} for e in entities if e['type'] == 'foxhole']
    rows, cols = grid.shape
    def clear(x, y):
        r, c = y // CELL, x // CELL
        if not (1 <= r < rows - 1 and 1 <= c < cols - 1): return False
        if any(grid[r + dr, c + dc] not in OPEN for dr in (-1, 0, 1) for dc in (-1, 0, 1)): return False
        for e in entities:  # keep clear of objects (palms included: they're solid)
            if e['type'] in ('start', 'pickup', 'helipad'): continue
            if abs(e['x'] - x) < e.get('w', 16) / 2 + 12 and abs(e['y'] - y) < e.get('h', 16) / 2 + 12: return False
        return all((x - o['x']) ** 2 + (y - o['y']) ** 2 > 40 ** 2 for o in out)
    for x0, x1, y0, y1, n in SOLDIER_ZONES:
        placed = 0
        for _ in range(4000):
            if placed == n: break
            x, y = rng.randint(x0, x1), rng.randint(y0, y1)
            if clear(x, y):
                out.append({'type': 'soldier', 'x': x, 'y': y}); placed += 1
    return out


# Extra properties for detected objects, matched to the nearest object of that type.
# breach: which wall the blast tears through (from the NES destroyed sprites, they open onto the yard).
PROPS = [
    {'type': 'tent', 'x': 331, 'y': 2014, 'breach': 'east'},  # north hut
    {'type': 'tent', 'x': 235, 'y': 2078, 'breach': 'east'},  # west hut
    {'type': 'tent', 'x': 459, 'y': 2078, 'breach': 'west'},  # east hut
]


def load():
    im = np.array(Image.open(SRC).convert('RGB'))[HEADER:]
    key = (im[..., 0].astype(np.int32) << 16) | (im[..., 1].astype(np.int32) << 8) | im[..., 2]
    return im, key


def classify_cells(key):
    rows, cols = key.shape[0] // CELL, key.shape[1] // CELL
    cells = key[:rows * CELL, :cols * CELL].reshape(rows, CELL, cols, CELL).transpose(0, 2, 1, 3)
    count = lambda pal: np.isin(cells, pal).sum(axis=(2, 3))
    grid = np.full((rows, cols), '.', dtype='<U1')
    grid[count(DARK) >= 40] = 'T'
    grid[count(GREY) >= 24] = '#'
    grid[count(WATER) >= 32] = '~'
    return grid


def components(mask):
    """4-connected components of a boolean grid -> list of (cells list)."""
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


def match_template(key, x, y, w, h):
    t = key[y:y + h, x:x + w]
    mask = ~np.isin(t, SAND)
    H, W = key.shape
    ok = np.ones((H - h + 1, W - w + 1), bool)
    for dy, dx in zip(*np.nonzero(mask)):
        ok &= key[dy:dy + H - h + 1, dx:dx + W - w + 1] == t[dy, dx]
    return [(int(px), int(py)) for py, px in zip(*np.nonzero(ok))]


def near(grid, ch, r, c, dist):
    r0, r1, c0, c1 = max(0, r - dist), r + dist + 1, max(0, c - dist), c + dist + 1
    return (grid[r0:r1, c0:c1] == ch).any()


def main():
    im, key = load()
    grid = classify_cells(key)
    entities = []

    # --- sprites ---
    for name, (x, y, w, h) in TEMPLATES.items():
        for px, py in match_template(key, x, y, w, h):
            entities.append({'type': name, 'x': px + w // 2, 'y': py + h // 2, 'w': w, 'h': h})
            # clear the sprite's cells back to sand so it doesn't become jungle/wall
            grid[py // CELL:(py + h + CELL - 1) // CELL, px // CELL:(px + w + CELL - 1) // CELL] = '.'

    # --- concrete: turrets are 4x4-cell blocks, the rest is bridge / wall / pad ---
    for comp in components(grid == '#'):
        rs, cs = [int(p[0]) for p in comp], [int(p[1]) for p in comp]
        h, w = max(rs) - min(rs) + 1, max(cs) - min(cs) + 1
        if (h, w) == (4, 4):
            entities.append({'type': 'turret', 'x': (min(cs) + 2) * CELL, 'y': (min(rs) + 2) * CELL, 'w': 32, 'h': 32})
            ch = '.'
        elif any(near(grid, '~', r, c, 1) for r, c in comp):
            ch = '='
        elif len(comp) / (h * w) > .75 and min(h, w) >= 6:
            ch = 'H'
        else:
            ch = 'W'
        for r, c in comp:
            grid[r, c] = ch

    # --- dark cells: big masses are jungle, beside water it's the bank, small bits are shadows/detail ---
    for comp in components(grid == 'T'):
        coastal = [(r, c) for r, c in comp if near(grid, '~', r, c, 2)]
        for r, c in coastal:
            grid[r, c] = ','
        rest = [p for p in comp if grid[p] == 'T']
        if len(rest) < 60:
            for r, c in rest:
                grid[r, c] = '.'
    # the dark band under the bridge deck is its shadow on the water
    for r, c in zip(*np.nonzero(grid == ',')):
        if near(grid, '=', r, c, 1) and grid[min(r + 1, grid.shape[0] - 1), c] == '~':
            grid[r, c] = '~'

    # cracks and decorations leave 1-cell holes in walls; real openings are wider
    for r, c in zip(*np.nonzero(grid != 'W')):
        if 0 < c < grid.shape[1] - 1 and grid[r, c - 1] == 'W' and grid[r, c + 1] == 'W':
            grid[r, c] = 'W'
        elif 0 < r < grid.shape[0] - 1 and grid[r - 1, c] == 'W' and grid[r + 1, c] == 'W':
            grid[r, c] = 'W'

    # Remaster tweak: a bigger final clearing at the top of the stage, ~65 x 45 m: a rounded rectangle
    # with a slightly wobbly edge so it reads as natural jungle. It only adds open sand.
    r0, r1, c0, c1, rad = CLEARING
    for r in range(r0, r1):
        for c in range(c0, c1):
            cr = min(max(r, r0 + rad), r1 - 1 - rad); cc = min(max(c, c0 + rad), c1 - 1 - rad)  # nearest point of the inner rect
            wobble = ((r * 7919 + c * 104729) % 97) / 97 * 1.2                                     # deterministic edge noise
            if (r - cr) ** 2 + (c - cc) ** 2 <= (rad - wobble) ** 2 and grid[r, c] == 'T':
                grid[r, c] = '.'
    for r in range(r0 - 1, r1 + 1):  # no lone jungle tiles left dotted along the edge
        for c in range(c0 - 1, c1 + 1):
            if grid[r, c] == 'T' and sum(grid[r + dr, c + dc] == '.' for dr in (-1, 0, 1) for dc in (-1, 0, 1)) >= 5:
                grid[r, c] = '.'

    for m in MANUAL:
        e = dict(m)
        if 'w' in e:  # the object owns its footprint: clear whatever the colour pass made of it
            r0, c0 = (e['y'] - e['h'] // 2) // CELL, (e['x'] - e['w'] // 2) // CELL
            grid[r0:r0 + (e['h'] + CELL - 1) // CELL, c0:c0 + (e['w'] + CELL - 1) // CELL] = '.'
        entities.append(e)

    entities += soldiers(grid, entities)

    for prop in PROPS:
        same = [e for e in entities if e['type'] == prop['type']]
        e = min(same, key=lambda e: (e['x'] - prop['x']) ** 2 + (e['y'] - prop['y']) ** 2)
        e.update({k: v for k, v in prop.items() if k not in ('type', 'x', 'y')})

    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / 'terrain.txt').write_text('\n'.join(''.join(row) for row in grid) + '\n')
    for e in entities:
        if e['type'] == 'barracks': e['scale'] = 1.08   # the engineer huts: 10% smaller than the 1.2 the prisoners' huts are drawn at
    entities.sort(key=lambda e: (-e['y'], e['x']))
    meta = {'source': SRC.name, 'cell': CELL, 'width': grid.shape[1] * CELL, 'height': grid.shape[0] * CELL}
    (OUT / 'entities.json').write_text(json.dumps({'meta': meta, 'entities': entities}, indent=1))

    # --- debug picture: terrain tint + entity boxes ---
    tint = {'.': None, 'T': (0, 90, 0), ',': (120, 80, 40), '~': (0, 0, 160), '=': (200, 200, 200), 'W': (90, 90, 90), 'H': (150, 150, 150)}
    dbg = Image.fromarray(im).convert('RGBA')
    over = Image.new('RGBA', dbg.size)
    d = ImageDraw.Draw(over)
    for (r, c), ch in np.ndenumerate(grid):
        if tint[ch]:
            d.rectangle([c * CELL, r * CELL, c * CELL + CELL - 1, r * CELL + CELL - 1], fill=tint[ch] + (110,))
    colors = {'soldier': 'red', 'bush': 'green', 'palm': 'lime', 'rock': 'brown', 'foxhole': 'yellow', 'barracks': 'cyan', 'tent': 'orange',
              'turret': 'red', 'gate': 'magenta', 'start': 'white', 'drum': 'blue', 'pickup': 'white', 'helipad': 'white'}
    for e in entities:
        w, h = e.get('w', 24), e.get('h', 24)
        d.rectangle([e['x'] - w // 2, e['y'] - h // 2, e['x'] + w // 2, e['y'] + h // 2], outline=colors.get(e['type'], 'white'), width=2)
    DEBUG.parent.mkdir(exist_ok=True)
    Image.alpha_composite(dbg, over).save(DEBUG)

    counts = {}
    for e in entities:
        counts[e['type']] = counts.get(e['type'], 0) + 1
    print(f'grid {grid.shape[1]}x{grid.shape[0]} cells;', ', '.join(f'{k} {v}' for k, v in sorted(counts.items())))


if __name__ == '__main__':
    main()
