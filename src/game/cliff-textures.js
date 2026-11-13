// Procedural, tileable textures for stage 4's cliffs (cliffs.js), drawn on canvases: no image files.
//   rock:  fine grain, horizontal strata bands, vertical erosion streaks (+ a normal map made from the same height field by a Sobel filter)
//   grit:  desaturated olive-tan dirt with small pebbles and dry grass flecks (+ its normal map), for the plateau and the dirt along the foot
//   dirtAlpha: a soft noisy mask that breaks up the dirt strip's edge
import * as THREE from 'three';

const SIZE = 512;

// Tileable value noise: x and y wrap after px and py cells.
function pnoise(seed, px, py) {
  const hash = (x, y) => { let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) ^ seed; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
  const wrap = (n, p) => ((n % p) + p) % p;
  return (u, v) => { // u, v in 0..1 across the tile
    const x = u * px, y = v * py, xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, a = xf * xf * (3 - 2 * xf), b = yf * yf * (3 - 2 * yf);
    const h00 = hash(wrap(xi, px), wrap(yi, py)), h10 = hash(wrap(xi + 1, px), wrap(yi, py)), h01 = hash(wrap(xi, px), wrap(yi + 1, py)), h11 = hash(wrap(xi + 1, px), wrap(yi + 1, py));
    return (h00 + (h10 - h00) * a) * (1 - b) + (h01 + (h11 - h01) * a) * b;
  };
}
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const rng = seed => () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };

const canvas = () => { const c = document.createElement('canvas'); c.width = c.height = SIZE; return c; };
const texture = c => { const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; return t; };

// Sobel normal map of a height field (SIZE x SIZE, wrapping), `strength` scales the slope.
function normalMap(h, strength) {
  const c = canvas(), ctx = c.getContext('2d'), img = ctx.createImageData(SIZE, SIZE), at = (x, y) => h[((y + SIZE) % SIZE) * SIZE + (x + SIZE) % SIZE];
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
    const dx = (at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1)) - (at(x - 1, y - 1) + 2 * at(x - 1, y) + at(x - 1, y + 1));
    const dy = (at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1)) - (at(x - 1, y - 1) + 2 * at(x, y - 1) + at(x + 1, y - 1));
    let nx = -dx * strength, ny = -dy * strength, nz = 1; const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
    const i = (y * SIZE + x) * 4; img.data[i] = (nx * .5 + .5) * 255; img.data[i + 1] = (ny * .5 + .5) * 255; img.data[i + 2] = (nz * .5 + .5) * 255; img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0); return texture(c);
}

function rockTextures() {
  const g1 = pnoise(101, 48, 48), g2 = pnoise(102, 96, 96), g3 = pnoise(103, 192, 192), bandN = pnoise(104, 2, 16), warp = pnoise(105, 6, 6), streakN = pnoise(106, 110, 5), streakN2 = pnoise(107, 40, 3);
  const h = new Float32Array(SIZE * SIZE), c = canvas(), ctx = c.getContext('2d'), img = ctx.createImageData(SIZE, SIZE);
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
    const u = x / SIZE, v = y / SIZE;
    const grain = g1(u, v) * .5 + g2(u, v) * .3 + g3(u, v) * .2;
    // strata: 16 horizontal bands a tile, wobbling a little across it (the noise is nearly constant along x, so they are not contour lines), each a gentle ramp ending in a soft ledge with a thin crack
    const q = v * 16 + (bandN(u, v) - .5) * 1.2 + (warp(u, v) - .5) * .3, f = q - Math.floor(q), ledge = f * (1 - smooth(.88, 1, f)), crack = smooth(.9, .96, f) * (1 - smooth(.96, 1, f));
    const streak = smooth(.52, .8, streakN(u, v) * .7 + streakN2(u, v) * .3);            // erosion streaks run down the face
    const ht = grain * .35 + ledge * .4 + (1 - streak * .8) * .25 - crack * .12;
    h[y * SIZE + x] = ht;
    const val = Math.min(1, Math.max(.25, .72 + (ht - .5) * .6 - streak * .22 - crack * .25)), i = (y * SIZE + x) * 4;
    img.data[i] = val * 255; img.data[i + 1] = val * 247; img.data[i + 2] = val * 236; img.data[i + 3] = 255; // (a barely warm grey: the vertex colour carries the hue)
  }
  ctx.putImageData(img, 0, 0);
  return { map: texture(c), normal: normalMap(h, 3.5) };
}

function gritTextures() {
  const rand = rng(77), g1 = pnoise(201, 32, 32), g2 = pnoise(202, 128, 128), g3 = pnoise(203, 8, 8);
  const h = new Float32Array(SIZE * SIZE), c = canvas(), ctx = c.getContext('2d'), img = ctx.createImageData(SIZE, SIZE);
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
    const u = x / SIZE, v = y / SIZE, n = g1(u, v) * .5 + g2(u, v) * .5, patch = g3(u, v), i = (y * SIZE + x) * 4;
    h[y * SIZE + x] = n * .5; // (the pebbles are added below)
    const k = .86 + (n - .5) * .3 + (patch - .5) * .16; // desaturated olive-tan, dry
    img.data[i] = 150 * k; img.data[i + 1] = 142 * k; img.data[i + 2] = 104 * k; img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const wrapped = (x, y, r, draw) => { for (const ox of [-SIZE, 0, SIZE]) for (const oy of [-SIZE, 0, SIZE]) if (x + ox > -r && x + ox < SIZE + r && y + oy > -r && y + oy < SIZE + r) draw(x + ox, y + oy); };
  for (let n = 0; n < 260; n++) { // pebbles: a lighter, greyer disc with a dark lower-right edge, and a bump in the height field
    const x = rand() * SIZE, y = rand() * SIZE, r = 2 + rand() * rand() * 7, tone = 150 + rand() * 60, warm = rand() * 18;
    wrapped(x, y, r, (px, py) => {
      ctx.fillStyle = `rgba(55,48,34,.55)`; ctx.beginPath(); ctx.arc(px + r * .25, py + r * .25, r, 0, 6.283); ctx.fill();
      ctx.fillStyle = `rgb(${tone + warm},${tone},${tone - 16})`; ctx.beginPath(); ctx.arc(px, py, r * .9, 0, 6.283); ctx.fill();
    });
    for (let dy = -Math.ceil(r); dy <= r; dy++) for (let dx = -Math.ceil(r); dx <= r; dx++) {
      const d = Math.hypot(dx, dy) / r; if (d >= 1) continue;
      const hx = (Math.floor(x) + dx + SIZE) % SIZE, hy = (Math.floor(y) + dy + SIZE) % SIZE; h[hy * SIZE + hx] += Math.sqrt(1 - d * d) * (.5 + r * .06);
    }
  }
  for (let n = 0; n < 520; n++) { // dry grass flecks: short strokes, mostly upright, olive and straw
    const x = rand() * SIZE, y = rand() * SIZE, len = 3 + rand() * 6, a = -Math.PI / 2 + (rand() - .5) * 1.4, straw = rand() < .45;
    wrapped(x, y, len, (px, py) => {
      ctx.strokeStyle = straw ? `rgba(176,154,86,${.55 + rand() * .3})` : `rgba(92,108,52,${.5 + rand() * .3})`; ctx.lineWidth = 1 + rand() * .8;
      ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + Math.cos(a) * len, py + Math.sin(a) * len); ctx.stroke();
    });
  }
  return { map: texture(c), normal: normalMap(h, 6) };
}

function dirtAlpha() { // a soft, blotchy mask (0.2 .. 1) for the dirt strip's alpha: its edge is a texture, not a clean line
  const c = canvas(), ctx = c.getContext('2d'), img = ctx.createImageData(SIZE, SIZE), a = pnoise(301, 8, 8), b = pnoise(302, 24, 24), d = pnoise(303, 64, 64);
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
    const u = x / SIZE, v = y / SIZE, n = a(u, v) * .5 + b(u, v) * .33 + d(u, v) * .17, k = .15 + .85 * smooth(.3, .62, n), i = (y * SIZE + x) * 4;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = k * 255; img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0); return texture(c);
}

let cache = null;
export function cliffTextures() { // null where there is no canvas (a script run outside the browser)
  if (typeof document === 'undefined') return null;
  return cache ??= { rock: rockTextures(), grit: gritTextures(), dirtAlpha: dirtAlpha() };
}
