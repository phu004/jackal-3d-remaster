// Stage 2's ramps up onto the terraces: worn flights of stone steps, as on the NES map. Each step is
// laid as a few irregular slabs across its width (seams offset from step to step, pale sand showing in
// the joints), in the same pale limestone as the terrace paving, worn darker and smoother up the middle
// where feet went, a few slabs tilted, chipped and cracked. Low, thin parapets run up both sides,
// worn and broken in places, and sand has drifted over the bottom steps. Visual only: the jeep glides
// up the smooth slope underneath (heightAt in world.js).
import * as THREE from 'three';

// ---- steps ----
const STEPS = 7;                  // steps per flight
const SLABS = [2, 4];             // slabs across each step (min, max)
const SEAM = [0, .035];           // metres: gap between slabs (pale sand shows through; 0 = closed up)
const TILT_CHANCE = .2;           // share of slabs sitting slightly askew
const TILT = .035;                // radians
const WORN_PATH = .4;             // share of the flight's width, down the middle, worn darker and smoother
// ---- texture ----
const TEX = 512, TILE = 2;        // px, metres per texture tile
const STONE = [176, 173, 165];    // the paving's warm grey-cream limestone (one hue)
const ALBEDO = .62;               // overall brightness, as the paving's material tints it (so it doesn't clip under the sun)
const TONE_VAR = .05;             // per-slab lightness variation (±)
const WARMTH = [1.05, 1, .88];    // r, g, b: a touch warmer, less blue (the floor's grey-cream), same lightness
const CONTRAST = .06;             // fine grain contrast
const GRIME = .12;                // low-frequency grime (low contrast)
const CRACKS = 3;                 // cracks per texture tile
const VARIANTS = 6;               // texture variants (offset / rotation), so no two slabs match
// ---- parapets ----
const RAIL_H = [.32, .48];        // metres above the steps (low)
const RAIL_T = .22;               // thickness (slim)
const RAIL_SEGMENTS = [3, 5];     // pieces along each side
const RAIL_BROKEN = .25;          // share of pieces fallen away
// ---- sand ----
const DRIFTS = [4, 7];            // low sand mounds over the bottom steps
const DRIFT_H = [.08, .26];       // metres (flat, thin-edged)
const GRAINS = 14;                // sand scatters on the steps, per flight
const SEAM_SAND = .45;            // share of seams with a line of sand along them
const SAND_BED = [176, 164, 138]; // pale sand in the joints

function rng(seed) {
  let s = seed >>> 0;
  return () => { s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}

// Low-contrast limestone with fine grain (no cloudy blotches), a few cracks with a pale dust rim and
// some chips.
function stepTexture(rand) {
  const c = document.createElement('canvas'); c.width = c.height = TEX; const x = c.getContext('2d');
  const img = x.createImageData(TEX, TEX), d = img.data, [r0, g0, b0] = STONE;
  const P = 6, grid = Float32Array.from({ length: P * P }, rand); // tileable low-frequency grime
  const grime = (u, v) => { const gx = u * P, gy = v * P, ix = Math.floor(gx), iy = Math.floor(gy), fx = gx - ix, fy = gy - iy, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const at = (a, b) => grid[(b % P) * P + (a % P)];
    return (at(ix, iy) * (1 - sx) + at(ix + 1, iy) * sx) * (1 - sy) + (at(ix, iy + 1) * (1 - sx) + at(ix + 1, iy + 1) * sx) * sy; };
  for (let i = 0; i < TEX * TEX; i++) {
    const k = 1 + (rand() - .5) * CONTRAST - (grime((i % TEX) / TEX, Math.floor(i / TEX) / TEX) - .5) * GRIME;
    d[i * 4] = r0 * k; d[i * 4 + 1] = g0 * k; d[i * 4 + 2] = b0 * k; d[i * 4 + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  for (let i = 0; i < 3000; i++) { // grain and pits
    x.fillStyle = rand() < .6 ? `rgba(70,62,50,${.05 + rand() * .1})` : `rgba(240,236,226,${.05 + rand() * .08})`;
    x.fillRect(rand() * TEX, rand() * TEX, 1 + rand() * 2, 1 + rand() * 2);
  }
  for (let k = 0; k < CRACKS; k++) { // cracks: dark core, pale dust rim on one side
    const pts = []; let px = rand() * TEX, py = rand() * TEX, a = rand() * Math.PI * 2;
    for (let s = 0; s < 40; s++) { a += (rand() - .5) * .5; px += Math.cos(a) * 6; py += Math.sin(a) * 6; pts.push([px, py]); }
    for (const [col, w, off] of [['rgba(236,230,216,.4)', 1.6, 1.2], ['rgba(70,60,48,.7)', 1.1, 0]]) {
      x.strokeStyle = col; x.lineWidth = w; x.beginPath(); pts.forEach(([a2, b2], i) => i ? x.lineTo(a2 + off, b2 + off) : x.moveTo(a2 + off, b2 + off)); x.stroke();
    }
  }
  for (let k = 0; k < 6; k++) { // chips
    const px = rand() * TEX, py = rand() * TEX, r = 3 + rand() * 6;
    x.fillStyle = 'rgba(90,80,64,.45)'; x.beginPath(); for (let j = 0; j < 6; j++) { const a = j / 6 * Math.PI * 2, rr = r * (.5 + rand() * .6); x.lineTo(px + Math.cos(a) * rr, py + Math.sin(a) * rr); } x.fill();
  }
  return c;
}

// Scale a box's texture coordinates to its real size (one tile per TILE metres).
function boxUV(geo, w, h, d, tile = TILE) {
  const uv = geo.attributes.uv, dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) { const i = f * 4 + k; uv.setXY(i, uv.getX(i) * dims[f][0] / tile, uv.getY(i) * dims[f][1] / tile); }
  return geo;
}

// flights: [{ x0, x1, z0, z1, highEast }] (the ramp's area, and which end is up). rise: the terrace height.
// floor: { sand: the ground's sand material }. Returns a group (merge it).
export function buildRampStairs(flights, rise, floor) {
  const rand = rng(5), g = new THREE.Group();
  const canvas = stepTexture(rand);
  const variant = k => { // the same stone, shifted and turned, so neighbouring slabs differ
    const t = new THREE.CanvasTexture(canvas); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 16;
    t.offset.set(rand(), rand()); t.rotation = (k % 4) * Math.PI / 2; t.center.set(.5, .5);
    return t;
  };
  const tone = (k, worn) => { const f = ALBEDO * (1 + (k / (VARIANTS - 1) - .5) * 2 * TONE_VAR) * (worn ? .9 : 1); return new THREE.Color(f * WARMTH[0], f * WARMTH[1], f * WARMTH[2]); };
  const mats = Array.from({ length: VARIANTS }, (_, k) => ({
    plain: new THREE.MeshStandardMaterial({ map: variant(k), color: tone(k, false), roughness: .95, envMapIntensity: .25 }),
    worn: new THREE.MeshStandardMaterial({ map: variant(k + 1), color: tone(k, true), roughness: .78, envMapIntensity: .3 }), // smoothed by feet
  }));
  const frameMat = new THREE.MeshStandardMaterial({ map: variant(2), color: tone(2, false).multiplyScalar(.95), roughness: .95, envMapIntensity: .25 }); // the steps' stone, a touch greyer
  const sandMat = floor.sand, bedMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(...SAND_BED.map(v => v / 255 * ALBEDO)), roughness: 1, envMapIntensity: .2 });
  const box = (w, h, d, m, x, y, z, rx = 0, rz = 0, tile = TILE) => {
    const o = new THREE.Mesh(boxUV(new THREE.BoxGeometry(w, h, d), w, h, d, tile), m);
    o.position.set(x, y, z); o.rotation.set(rx, 0, rz); o.castShadow = o.receiveShadow = true; g.add(o); return o;
  };
  for (const f of flights) {
    const { x0, x1, z0, z1, highEast } = f, run = (x1 - x0) / STEPS, width = z1 - z0 - .1, zc = (z0 + z1) / 2;
    for (let i = 0; i < STEPS; i++) {
      const h = rise * (i + 1) / STEPS, len = (STEPS - i) * run, cx = highEast ? x1 - len / 2 : x0 + len / 2;
      const bed = len - .12; box(bed, h - .03, width - .04, bedMat, highEast ? x1 - bed / 2 : x0 + bed / 2, (h - .03) / 2, zc); // sand bed in the joints (set back from the front)
      // slabs across the step, of varied width (seams offset from the step below)
      const n = SLABS[0] + Math.floor(rand() * (SLABS[1] - SLABS[0] + 1)), cuts = [0];
      for (let k = 1; k < n; k++) cuts.push(k / n + (rand() - .5) * .5 / n);
      cuts.push(1);
      for (let k = 0; k < n; k++) {
        const seam = SEAM[0] + rand() * (SEAM[1] - SEAM[0]), a = z0 + .05 + cuts[k] * width + seam / 2, b = z0 + .05 + cuts[k + 1] * width - seam / 2;
        const mid = (a + b) / 2, worn = Math.abs(mid - zc) < width * WORN_PATH / 2, tilt = rand() < TILT_CHANCE;
        const sl = len, sx = cx;
        if (b - a > .3 && rand() < SEAM_SAND && k < n - 1) { // a line of sand along the seam on the tread, fading out
          const sl2 = run * (.3 + rand() * .6), sxx = (highEast ? x1 - len : x0 + len) + (highEast ? 1 : -1) * sl2 / 2;
          box(sl2, .012, SEAM[1] + .03, sandMat, sxx, h + .006, b + seam / 2, 0, 0, 2);
        }
        box(sl, h, b - a, mats[Math.floor(rand() * VARIANTS)][worn ? 'worn' : 'plain'], sx, h / 2 + (tilt ? (rand() - .5) * .03 : 0), mid,
          tilt ? (rand() - .5) * TILT : 0, tilt ? (rand() - .5) * TILT : 0);
      }
    }
    // low, thin parapets up both sides, in worn pieces, some fallen away; rough end stones
    const xl = highEast ? x0 : x1, xh = highEast ? x1 : x0, runLen = Math.abs(xh - xl), slope = Math.atan2(rise, runLen) * (highEast ? 1 : -1);
    for (const z of [z0 + .14, z1 - .14]) {
      const pieces = RAIL_SEGMENTS[0] + Math.floor(rand() * (RAIL_SEGMENTS[1] - RAIL_SEGMENTS[0] + 1));
      for (let k = 0; k < pieces; k++) {
        if (rand() < RAIL_BROKEN) continue;
        const t0 = k / pieces + rand() * .03, t1 = (k + 1) / pieces - rand() * .03, tm = (t0 + t1) / 2;
        const len = Math.hypot(runLen, rise) * (t1 - t0), hh = RAIL_H[0] + rand() * (RAIL_H[1] - RAIL_H[0]);
        const x = xl + (xh - xl) * tm, y = rise * tm + hh / 2 - .05;
        const o = box(len, hh, RAIL_T * (.85 + rand() * .3), frameMat, x, y, z + (rand() - .5) * .04, 0, slope + (rand() - .5) * .04);
        o.rotation.y = (rand() - .5) * .04;
      }
      for (const [x, y0] of [[xl, 0], [xh, rise]]) { // chipped, uneven end stones
        const s = .34 + rand() * .14, hh = .45 + rand() * .25;
        const o = box(s, hh, s * (.8 + rand() * .3), frameMat, x, y0 + hh / 2 - .03, z, (rand() - .5) * .08, (rand() - .5) * .08);
        o.rotation.y = (rand() - .5) * .3;
      }
    }
    // sand drifted over the bottom steps, in soft overlapping mounds
    const drifts = DRIFTS[0] + Math.floor(rand() * (DRIFTS[1] - DRIFTS[0] + 1));
    for (let k = 0; k < drifts; k++) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), sandMat);
      const hh = DRIFT_H[0] + rand() * (DRIFT_H[1] - DRIFT_H[0]), reach = run * (1 + rand() * 2.2);
      m.position.set(xl + (highEast ? 1 : -1) * reach * (.1 + rand() * .4), -.03, z0 + .2 + rand() * (z1 - z0 - .4));
      m.scale.set(reach, hh + rise / STEPS * rand() * .6, .6 + rand() * 1.3); m.rotation.y = (rand() - .5) * .7;
      m.receiveShadow = true; g.add(m);
    }
    for (let k = 0; k < GRAINS; k++) { // sand scattered up the bottom steps, thinning out
      const i = Math.floor(Math.pow(rand(), 1.8) * STEPS * .7), h = rise * (i + 1) / STEPS, s = .1 + rand() * .3;
      const x = xl + (highEast ? 1 : -1) * (i + .2 + rand() * .6) * run, m = new THREE.Mesh(new THREE.CircleGeometry(s, 7), sandMat);
      m.rotation.set(-Math.PI / 2, 0, rand() * 3); m.position.set(x, h + .008, z0 + .3 + rand() * (z1 - z0 - .6)); m.scale.set(1, .5 + rand() * .8, 1);
      m.receiveShadow = true; g.add(m);
    }
  }
  return g;
}
