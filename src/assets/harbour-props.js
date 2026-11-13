// Stage 3 (the harbour) props. All built to the asset contract: metres, origin on the ground at the
// centre, front toward -Z.
//   buildContainer   a map container's footprint (~10 x 5 m): two 40-ft containers side by side (and
//                    sometimes one stacked on top) lying east-west, in varied colours and wear;
//                    containerMaterials / CONTAINER are shared with the yard round the map (harbour.js)
//   buildBarrier     a steel crowd barrier, `len` metres long, running east-west
//   buildLaser       a rooftop laser emitter on a squat mount (stage 3's indestructible lasers);
//                    named parts: `head` (turns about Y), `muzzle` (where the beam leaves, -Z of the head)
import * as THREE from 'three';
import { add, mat, cached, canvasTexture, seededRandom } from './common.js';

const pmat = (c, r, m, o) => mat(c, r, m, Object.assign({ envMapIntensity: .35 }, o));

// ---- shipping containers ----
// Real 40-ft proportions (9.8 x 2.44 x 2.6 m), corrugated walls with a bump map for real relief,
// ribbed doors with locking bars, labels, rust and grime that differ from one to the next.
export const CONTAINER = { L: 9.8, W: 2.44, H: 2.6 };
const PAINTS = [ // body colour, how weathered (0 clean .. 1 rusty)
  ['#2f6fb3', .25], ['#b14a2b', .45], ['#d6d4cc', .75], ['#3f6b45', .4], ['#c4932c', .35], ['#7b8288', .3], ['#7a2a26', .5], ['#2a8a8a', .3],
];
export const CONTAINER_VARIANTS = PAINTS.length;

const shade = (hex, k) => '#' + new THREE.Color(hex).multiplyScalar(k).getHexString();
// Drawn in the sizes given below, at TEX_SCALE times the pixels (sharp from the game camera).
const TEX_SCALE = 2;
function canvas2d(w, h) { const c = document.createElement('canvas'); c.width = w * TEX_SCALE; c.height = h * TEX_SCALE; const x = c.getContext('2d'); x.scale(TEX_SCALE, TEX_SCALE); return [c, x]; }
function texOf(c) { const t = canvasTexture(c, 1, 1); t.anisotropy = 16; return t; }



// Rust where rust really forms, painted a pixel at a time from the container's own geometry (`kind`: 'side', 'door', 'end' or 'roof'):
//  - structure first: it gathers in the corrugation grooves (water runs down and lies in them, so a groove is rustier the lower it is), along the foot of the wall (splash and ground damp), under the top rail, round the door frame
//    and the corners and along the welded seams; the flat ridges of a panel stay fairly clean;
//  - runs: thin rusty and grimy streaks pull down from the top rail along the grooves, and from every bolt head and corner;
//  - wear: on the sharp edges, where boxes knock together, the paint is chipped back to grey primer and bare steel;
//  - colour: not one orange but layers: near-black iron oxide (#4a1c0d) deep in the crevices and pits, a weathered mid red-brown (#8b3a2b) over most of it, a few warmer flecks, all mottled by a cellular (Voronoi) texture so a patch breaks
//    up organically, and where a patch is thin it flakes, showing the primer. `rust` (0 .. 1) is how worn the box is.
function makeNoise(rnd) {
  const T = new Float32Array(1024); for (let i = 0; i < T.length; i++) T[i] = rnd();
  const at = (a, b) => T[(a & 31) * 32 + (b & 31)];
  const vn = (px, py) => { const ix = Math.floor(px), iy = Math.floor(py); let fx = px - ix, fy = py - iy; fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
    return (at(ix, iy) * (1 - fx) + at(ix + 1, iy) * fx) * (1 - fy) + (at(ix, iy + 1) * (1 - fx) + at(ix + 1, iy + 1) * fx) * fy; };
  return (px, py) => vn(px, py) * .55 + vn(px * 2.1 + 7, py * 2.1 + 3) * .3 + vn(px * 4.3 + 1, py * 4.3 + 9) * .15;
}
const smooth01 = (a, b, t) => { t = Math.min(1, Math.max(0, (t - a) / (b - a))); return t * t * (3 - 2 * t); };
const hashf = n => { const v = Math.sin(n * 12.9898) * 43758.5453; return v - Math.floor(v); };
const hash2 = (a, b) => hashf(a * 127.1 + b * 311.7);
function voronoi(px, py) { // distance to the nearest of a jittered grid of points (cells ~1 unit): 0 at a cell's heart, up to ~.8 on the walls between
  const ix = Math.floor(px), iy = Math.floor(py); let best = 9;
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) { const cx = ix + i + hash2(ix + i, iy + j), cy = iy + j + hash2(ix + i + 17, iy + j + 5), d = (px - cx) * (px - cx) + (py - cy) * (py - cy); if (d < best) best = d; }
  return Math.sqrt(best);
}
const RUST_FACE = { // pitch: the corrugation's period (canvas units); top, bot, frame: the width of the top rail, bottom rail and the frame at the ends; bolts: [x, y] of bolt heads that streak
  side: { pitch: 512 / 40, groove: [.55, .9], top: 6, bot: 7, frame: 3, bolts: [] },
  door: { pitch: 8, groove: [.55, .9], top: 8, bot: 8, frame: 6, bolts: [18, 46, 82, 110].flatMap(bx => [[bx, 14], [bx, 66], [bx, 118]]) },
  end: { pitch: 12, groove: [.55, .9], top: 7, bot: 7, frame: 3, bolts: [] },
  roof: { pitch: 16, groove: [.62, .95], top: 7, bot: 7, frame: 6, bolts: [], roof: true },
};
function rustPass(x, W, H, rnd, rust, kind = 'side') {
  if (rust < .1) return;
  const F = RUST_FACE[kind], S = TEX_SCALE, R = 2, w = Math.round(W * S / R), h = Math.round(H * S / R), img = x.createImageData(w, h), d = img.data, U = S / R, // (the rust is worked out at half the texture's resolution into its own layer, then laid over the paint scaled up: four times fewer pixels to compute; it has no finer detail than that)
     nz = makeNoise(rnd), ox = rnd() * 40, oy = rnd() * 40, k0 = .3 + rust * .95;
  const nGroove = Math.ceil(W / F.pitch) + 1, runLen = [], runOn = [];
  for (let g = 0; g < nGroove; g++) { runOn.push(hash2(g, ox) < .35 + rust * .5); runLen.push((.25 + .75 * hash2(g + 40, ox)) * H); }
  const bolts = F.bolts.map(([bx, by], n) => ({ bx, by, len: 14 + hash2(n, ox) * 42 * (.4 + rust), on: hash2(n + 90, ox) < .35 + rust * .55 }));
  const chipK = .25 + rust * .6;
  for (let py = 0; py < h; py++) {
    const y = py / U, v = y / H, lowK = smooth01(.45, 1, v);
    for (let px = 0; px < w; px++) {
      const xx = px / U, ph = (xx % F.pitch) / F.pitch;
      const groove = smooth01(F.groove[0], F.groove[1], ph) * (1 - smooth01(.96, 1, ph) * .4);
      const dEdgeY = Math.min(y, H - y), dEdgeX = Math.min(xx, W - xx);
      // where water lies: the grooves (more toward the foot), the foot of the wall, the rim under the top rail, the frame at the ends, the seams
      const gA = F.roof ? 1 : (.15 + .95 * hash2(Math.floor(xx / F.pitch) + 7, ox)) * (.2 + .9 * smooth01(.38, .72, nz(ox + xx / 9, oy + y / 24))); // (each groove its own amount, and patchy down its length)
      const gw = groove * (F.roof ? .65 : (.25 + .75 * lowK) * gA);
      const patchy = .25 + .85 * smooth01(.3, .68, nz(oy + xx / 15, ox * 2 + y / 5));
      const foot = ((1 - smooth01(F.bot, F.bot + 14, H - y)) * .95 + (1 - smooth01(0, 6, H - y)) * .3) * patchy;
      const rim = (1 - smooth01(F.top, F.top + 9, y)) * .55 * patchy;
      const frame = (1 - smooth01(F.frame, F.frame + 8, dEdgeX)) * .7 * patchy;
      const seam = F.roof ? 0 : (1 - smooth01(0, 1.6, Math.abs(y - F.top))) * .35 + (1 - smooth01(0, 1.6, Math.abs(y - (H - F.bot)))) * .35;
      let A = Math.max(gw, foot, rim, frame, seam * .8) + (1 - groove) * .0;
      if (F.roof) A = Math.max(A * .85, smooth01(.5, .78, nz(ox + xx / 40, oy + y / 22)) * .6); // roofs: water ponds in broad low patches too
      // runs down from the top rail along the grooves and from bolt heads
      let run = 0;
      if (!F.roof) {
        const g = Math.floor(xx / F.pitch);
        if (runOn[g] && groove > .45 && y < runLen[g]) run = Math.pow(1 - y / runLen[g], 1.4) * (.45 + .45 * groove) * smooth01(.05, .3, v < .15 ? .3 : 1);
        for (const b of bolts) if (b.on && y > b.by && y < b.by + b.len && Math.abs(xx - b.bx) < 1.6) run = Math.max(run, Math.pow(1 - (y - b.by) / b.len, 1.2) * .85);
        const cx = Math.min(xx, W - xx); if (cx < 3 && y < H * .75) run = Math.max(run, (1 - y / (H * .75)) * .5 * (hash2(Math.floor(y / 6), xx < W / 2 ? 1 : 2) > .3 ? 1 : .4)); // down the corner posts
      }
      A = Math.max(A, run);
      A *= k0 * (.55 + .9 * nz(ox + xx / 14, oy + y / 7));           // the amount differs from place to place: broad variation
      const edgeSharp = Math.min(dEdgeY, dEdgeX, Math.abs(y - F.top) + 3, Math.abs(y - (H - F.bot)) + 3);
      let chip = 0;
      if (edgeSharp < 3.4) { // only on the sharp edges, and only at a few knocked spots along them
        const hot = smooth01(.62, .8, nz(oy + xx / 16, ox + y / 9)), cell = voronoi((xx + ox) / 2.1, (y + oy) / 2.1);
        chip = hot * (1 - smooth01(.6, 3.4, edgeSharp)) * smooth01(.62 - chipK * .25, .78 - chipK * .25, 1 - cell * 1.1 + nz(ox + xx / 3, y / 3) * .35);
      }
      if (A < .06 && chip < .02) continue;
      let cr = 0, cg = 0, cb = 0, ca = 0;
      if (A >= .06) {
        const vo = voronoi((xx + ox) / 3.3, (y + oy) / 3.3), mott = smooth01(.12, .62, vo), pit = nz(ox * 2 + xx / 1.8, oy * 2 + y / 1.8);
        const m = smooth01(.3, .5, A + (mott - .5) * .28 + (pit - .5) * .2);                                      // the patch, its edge broken up by the cells
        if (m > .01) {
          const deep = Math.min(1, smooth01(.5, 1.15, A) * .6 + (1 - mott) * .32 + (groove * lowK) * .12), warm = smooth01(.7, .86, pit) * .5 * (1 - deep);
          cr = 139 + (74 - 139) * deep + warm * 40; cg = 58 + (28 - 58) * deep + warm * 24; cb = 43 + (13 - 43) * deep + warm * 6; // from #8b3a2b to #4a1c0d, with warm flecks
          const thin = 1 - smooth01(.36, .56, A), flake = thin * smooth01(.55, .8, mott); // where the patch is thin the rust flakes off: grey primer shows
          cr += (122 - cr) * flake * .8; cg += (110 - cg) * flake * .8; cb += (108 - cb) * flake * .8;
          ca = Math.min(1, m * (.5 + rust * .45));
        }
      }
      if (chip > .02) { // chipped paint: a rim of grey primer, bare steel in the middle of the chip, laid over the rust
        const bare = smooth01(.45, .85, chip), t = nz(ox + xx * 2, y * 2) * .3, br = 150 + t * 60, c = Math.min(1, chip * 1.4) * .85;
        const kr = bare > .5 ? br : 112, kg = bare > .5 ? br + 2 : 96, kb = bare > .5 ? br + 6 : 92, oa = c + ca * (1 - c);
        cr = (kr * c + cr * ca * (1 - c)) / oa; cg = (kg * c + cg * ca * (1 - c)) / oa; cb = (kb * c + cb * ca * (1 - c)) / oa; ca = oa;
      }
      const k = (py * w + px) * 4; d[k] = cr; d[k + 1] = cg; d[k + 2] = cb; d[k + 3] = Math.round(ca * 255);
    }
  }
  const layer = document.createElement('canvas'); layer.width = w; layer.height = h; layer.getContext('2d').putImageData(img, 0, 0);
  x.drawImage(layer, 0, 0, W, H); // (scaled up, smoothly, over the paint)
}

// Weathering over a face: grime along the bottom, rust patches and runs, scratches.
function weather(x, W, H, rnd, rust, kind = 'side') {
  const g = x.createLinearGradient(0, H * .7, 0, H); g.addColorStop(0, 'rgba(40,30,20,0)'); g.addColorStop(1, `rgba(40,30,20,${.25 + rust * .25})`);
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  rustPass(x, W, H, rnd, rust, kind);
  for (let i = 0; i < 30; i++) { // scratches
    x.strokeStyle = `rgba(255,255,255,${rnd() * .12})`; x.lineWidth = 1; x.beginPath();
    const a = rnd() * W, b = rnd() * H; x.moveTo(a, b); x.lineTo(a + (rnd() - .5) * 30, b + (rnd() - .5) * 6); x.stroke();
  }
}

// Side wall: 40 ribs along its length, rails top and bottom, a faded company mark and a data plate.
function sideCanvas(paint, rust, rnd) {
  const W = 512, H = 136, [c, x] = canvas2d(W, H);
  x.fillStyle = paint; x.fillRect(0, 0, W, H);
  const n = 40, p = W / n;
  for (let i = 0; i < n; i++) {
    const g = x.createLinearGradient(i * p, 0, (i + 1) * p, 0);
    g.addColorStop(0, 'rgba(255,255,255,.14)'); g.addColorStop(.35, 'rgba(255,255,255,.02)'); g.addColorStop(.6, 'rgba(0,0,0,.1)'); g.addColorStop(1, 'rgba(0,0,0,.22)');
    x.fillStyle = g; x.fillRect(i * p, 0, p, H);
  }
  x.fillStyle = shade(paint, .6); x.fillRect(0, 0, W, 6); x.fillRect(0, H - 7, W, 7); // rails
  if (rnd() < .8) { // a company mark: big letters, faded
    x.globalAlpha = .18 + rnd() * .2; x.fillStyle = rnd() < .5 ? '#ffffff' : shade(paint, .55);
    x.font = `900 ${44 + rnd() * 18}px Impact, Arial Black, sans-serif`; x.textBaseline = 'middle';
    const names = ['MAERSK', 'EVERGRN', 'HAPAG', 'COSCO', 'TRITON', 'CMA CGM', 'MSC', 'HANJIN', 'ZIM', 'K-LINE'];
    x.fillText(names[Math.floor(rnd() * names.length)], 40 + rnd() * 120, H * .48); x.globalAlpha = 1;
  }
  x.fillStyle = 'rgba(235,235,225,.75)'; x.fillRect(W - 46, 16, 30, 18); // data plate
  x.fillStyle = 'rgba(30,30,30,.6)'; for (let k = 0; k < 4; k++) x.fillRect(W - 43, 19 + k * 4, 20 + rnd() * 4, 1.5);
  weather(x, W, H, rnd, rust);
  return texOf(c);
}
// Door end: two ribbed leaves, four locking bars with handles, a warning sticker and the ID number.
function doorCanvas(paint, rust, rnd) {
  const W = 128, H = 136, [c, x] = canvas2d(W, H);
  x.fillStyle = paint; x.fillRect(0, 0, W, H);
  for (let i = 0; i < W; i += 8) { x.fillStyle = 'rgba(0,0,0,.12)'; x.fillRect(i + 5, 8, 3, H - 16); x.fillStyle = 'rgba(255,255,255,.1)'; x.fillRect(i, 8, 2, H - 16); }
  x.fillStyle = shade(paint, .5); x.fillRect(0, 0, W, 8); x.fillRect(0, H - 8, W, 8); x.fillRect(0, 0, 6, H); x.fillRect(W - 6, 0, 6, H); x.fillRect(W / 2 - 1, 8, 2, H - 16);
  for (const bx of [18, 46, 82, 110]) {
    x.fillStyle = 'rgba(40,40,40,.85)'; x.fillRect(bx - 1.5, 10, 3, H - 20); x.fillRect(bx - 4, 64, 8, 4); x.fillRect(bx - 4, 14, 8, 3); x.fillRect(bx - 4, H - 18, 8, 3);
  }
  x.fillStyle = 'rgba(255,255,255,.75)'; x.font = '700 9px monospace';
  x.fillText(['MSKU', 'TGHU', 'CMAU', 'HLXU', 'TCLU'][Math.floor(rnd() * 5)] + ' ' + String(Math.floor(rnd() * 900000) + 100000), 54, 22);
  if (rnd() < .6) { x.fillStyle = '#e8c21c'; x.fillRect(90, 80, 14, 16); x.fillStyle = '#222'; x.fillRect(94, 84, 6, 6); }
  weather(x, W, H, rnd, rust, 'door');
  return texOf(c);
}
function plainEndCanvas(paint, rust, rnd) {
  const W = 128, H = 136, [c, x] = canvas2d(W, H);
  x.fillStyle = paint; x.fillRect(0, 0, W, H);
  for (let i = 0; i < W; i += 12) { x.fillStyle = 'rgba(0,0,0,.14)'; x.fillRect(i + 7, 0, 5, H); x.fillStyle = 'rgba(255,255,255,.1)'; x.fillRect(i, 0, 3, H); }
  x.fillStyle = shade(paint, .55); x.fillRect(0, 0, W, 7); x.fillRect(0, H - 7, W, 7);
  weather(x, W, H, rnd, rust, 'end');
  return texOf(c);
}
function roofCanvas(paint, rust, rnd) {
  const W = 512, H = 128, [c, x] = canvas2d(W, H);
  x.fillStyle = shade(paint, .92); x.fillRect(0, 0, W, H);
  for (let i = 0; i < W; i += 16) { x.fillStyle = 'rgba(0,0,0,.08)'; x.fillRect(i + 10, 0, 6, H); }
  rustPass(x, W, H, rnd, rust * .8, 'roof');
  return texOf(c);
}
// Relief (bump) for the corrugations, the same for every colour.
const bumps = () => cached('containerBumps', () => {
  const ribs = (W, H, n, vertical = true) => {
    const [c, x] = canvas2d(W, H); x.fillStyle = '#808080'; x.fillRect(0, 0, W, H);
    const p = (vertical ? W : H) / n;
    for (let i = 0; i < n; i++) {
      const g = vertical ? x.createLinearGradient(i * p, 0, (i + 1) * p, 0) : x.createLinearGradient(0, i * p, 0, (i + 1) * p);
      g.addColorStop(0, '#3a3a3a'); g.addColorStop(.25, '#d0d0d0'); g.addColorStop(.6, '#d0d0d0'); g.addColorStop(.85, '#3a3a3a'); g.addColorStop(1, '#3a3a3a');
      x.fillStyle = g; if (vertical) x.fillRect(i * p, 0, p, H); else x.fillRect(0, i * p, W, p);
    }
    return texOf(c);
  };
  return { side: ribs(512, 64, 40), end: ribs(128, 64, 10), roof: ribs(512, 32, 32) };
});

// The inside seen through an open door: black at the back, the corrugations catching a little light at the sides, planks on the floor, and some cargo (`k` picks which).
function interiorMaterial(k) {
  return cached('containerInterior' + k, () => {
    const W = 128, H = 136, [c, x] = canvas2d(W, H), rnd = seededRandom(900 + k);
    x.fillStyle = '#070809'; x.fillRect(0, 0, W, H);
    const g = x.createLinearGradient(0, 0, W, 0); g.addColorStop(0, 'rgba(70,64,56,.55)'); g.addColorStop(.18, 'rgba(0,0,0,0)'); g.addColorStop(.82, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(70,64,56,.55)'); x.fillStyle = g; x.fillRect(0, 0, W, H);
    for (let i = 0; i < W; i += 6) { x.fillStyle = 'rgba(255,255,255,.035)'; x.fillRect(i, 6, 2, H - 12); } // ribs of the far wall
    x.fillStyle = '#2a2118'; x.fillRect(0, H * .84, W, H * .16); for (let i = 0; i < W; i += 14) { x.fillStyle = 'rgba(0,0,0,.45)'; x.fillRect(i, H * .84, 1.2, H * .16); } // floor planks
    const crates = k % 3; // 0: empty, 1: a few crates, 2: pallets stacked up
    for (let i = 0; i < (crates === 1 ? 3 : crates === 2 ? 5 : 0); i++) {
      const cw = 22 + rnd() * 26, ch = 18 + rnd() * 24, cx = 8 + rnd() * (W - cw - 16), cy = H * .84 - ch + 2;
      x.fillStyle = ['#6a5232', '#4a5a3a', '#52606a', '#7a6a4a'][Math.floor(rnd() * 4)]; x.fillRect(cx, cy, cw, ch);
      x.fillStyle = 'rgba(255,255,255,.14)'; x.fillRect(cx, cy, cw, 2); x.fillStyle = 'rgba(0,0,0,.45)'; x.fillRect(cx + cw - 3, cy, 3, ch); x.fillRect(cx, cy + ch / 2, cw, 1.5);
    }
    return new THREE.MeshStandardMaterial({ map: texOf(c), roughness: .9, metalness: .1, envMapIntensity: .1 });
  });
}

// A tarpaulin: woven plastic in a dull colour with creases, a stitched hem with a metal eyelet every so often, a rope run along the hem, and rain streaks; glossy where it is wet.
function tarpMaterial(v) {
  return cached('tarp' + (v % 4), () => {
    const col = ['#2f5d3a', '#2e5a8f', '#8a7440', '#7a3a34'][v % 4], W = 256, H = 128, [c, x] = canvas2d(W, H), rnd = seededRandom(60 + v % 4);
    x.fillStyle = col; x.fillRect(0, 0, W, H);
    for (let i = 0; i < 26; i++) { // creases: long dark and light lines where it was folded
      const x0 = rnd() * W, y0 = rnd() * H, a = rnd() * Math.PI, len = 30 + rnd() * 110; x.strokeStyle = `rgba(${rnd() < .5 ? '0,0,0' : '255,255,255'},${.06 + rnd() * .1})`; x.lineWidth = 1 + rnd() * 2.2;
      x.beginPath(); x.moveTo(x0, y0); x.lineTo(x0 + Math.cos(a) * len, y0 + Math.sin(a) * len); x.stroke();
    }
    for (let i = 0; i < 900; i++) { x.fillStyle = `rgba(0,0,0,${rnd() * .05})`; x.fillRect(rnd() * W, rnd() * H, 2, 1); x.fillStyle = `rgba(255,255,255,${rnd() * .04})`; x.fillRect(rnd() * W, rnd() * H, 1, 2); } // the weave
    x.fillStyle = 'rgba(0,0,0,.25)'; x.fillRect(0, 0, W, 5); x.fillRect(0, H - 5, W, 5); x.fillRect(0, 0, 5, H); x.fillRect(W - 5, 0, 5, H); // the hem
    x.strokeStyle = 'rgba(230,225,200,.55)'; x.lineWidth = 1.5; x.strokeRect(9, 9, W - 18, H - 18); // the stitching
    for (let i = 14; i < W - 8; i += 24) for (const yy of [6, H - 6]) { x.fillStyle = 'rgba(20,20,20,.6)'; x.beginPath(); x.arc(i, yy, 3.2, 0, 7); x.fill(); x.fillStyle = 'rgba(170,175,180,.9)'; x.beginPath(); x.arc(i, yy, 2.2, 0, 7); x.fill(); x.fillStyle = 'rgba(20,20,20,.9)'; x.beginPath(); x.arc(i, yy, 1, 0, 7); x.fill(); } // eyelets
    for (let i = 0; i < 30; i++) { const px = rnd() * W, len = 10 + rnd() * 50, g = x.createLinearGradient(0, 0, 0, len); g.addColorStop(0, 'rgba(0,0,0,.12)'); g.addColorStop(1, 'rgba(0,0,0,0)'); x.save(); x.translate(px, rnd() * H * .7); x.fillStyle = g; x.fillRect(0, 0, 1.5, len); x.restore(); } // rain streaks
    return new THREE.MeshStandardMaterial({ map: texOf(c), roughness: .38, metalness: 0, envMapIntensity: .35, side: THREE.DoubleSide });
  });
}

const WEAR_PAIRS = [[1, 2], [0, 3], [3, 1], [2, 0], [1, 3], [2, 0], [3, 1], [0, 2]]; // (per colour; the yard along the sides uses [1, 0, 3, 2, 1, 2, 3, 0] for the same colours)
// What one box gets when it is built with the yard's variety (stage 6): how worn it is, whether its doors stand open (one leaf, or both), whether it is really two 20-footers end to end, and what lies on its roof.
function rollStyle(sr, exposed) {
  const pick = sr() < .5 ? 0 : 1, doors = sr() < .55 ? (sr() < .5 ? 1 : 2) : 0, short = sr() < .16, roof = exposed ? sr() : 1;
  return { pick, doors: short ? 0 : doors, short, tarp: false, barrels: false, cargo: Math.floor(sr() * 3), side: sr() < .5 ? -1 : 1 };
}

// The six face materials (+x doors, -x plain end, roof, floor, +z / -z sides) of container variant v,
// weathering picked by `wear` (0 or 1): shared by the props and the stacks in the yard round the map.
// A rain-soaked container: darker, deeper paint under a film of water. The sides: rain streaks running down the steel (narrow columns, each its own length, darker and shinier), a wet dark band along the foot where the road
// splashes up, a run of droplets. The roof (`roof`): the water lying on it in patches, black and glossy, with beads between. Built on the physical material; all of it is painted in the shader from the face's texture coordinates.
function wetMaterial(map, bump, roof = false) {
  // (a standard material: the physical one's clearcoat layer cost about 2.5 ms a frame; the gloss is kept by a slightly lower roughness)
  const m = new THREE.MeshStandardMaterial({ map, bumpMap: bump, bumpScale: .05, roughness: .33, metalness: .3, envMapIntensity: .55, shadowSide: THREE.FrontSide });
  m.color.setScalar(roof ? .7 : .66); // (wet paint is darker)
  m.onBeforeCompile = sh => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      float wHash( vec2 p ) { return fract( sin( dot( p, vec2( 12.9898, 78.233 ) ) ) * 43758.5453 ); }
      float wNoise( vec2 p ) { vec2 i = floor( p ), f = fract( p ); f = f * f * ( 3.0 - 2.0 * f ); return mix( mix( wHash( i ), wHash( i + vec2( 1, 0 ) ), f.x ), mix( wHash( i + vec2( 0, 1 ) ), wHash( i + vec2( 1, 1 ) ), f.x ), f.y ); }`)
      .replace('#include <map_fragment>', `#include <map_fragment>
      float wWet = 0.0;
      ${roof ? `
      vec2 wq = vUv * vec2( 14.0, 7.0 );
      float wPool = smoothstep( .45, .8, wNoise( wq ) * .65 + wNoise( wq * 2.7 + 5.0 ) * .35 ) * .8;                 // water lying in patches
      float wBead = step( .84, wHash( floor( vUv * vec2( 220.0, 110.0 ) ) ) ) * ( 1.0 - wPool );               // beads between the patches
      diffuseColor.rgb = mix( diffuseColor.rgb * ( 1.0 - .2 * wBead ), diffuseColor.rgb * .82, wPool );
      wWet = clamp( wPool + wBead * .7, 0.0, 1.0 );` : `
      float wCol = floor( vUv.x * 64.0 ), wH = fract( sin( wCol * 91.7 ) * 43758.5453 ), wH2 = fract( sin( wCol * 37.3 + 4.1 ) * 24634.6345 );
      float wRun = smoothstep( 1.0, .15, abs( fract( vUv.x * 64.0 ) - .5 ) * 2.0 + ( wH2 - .5 ) * .5 );
      float wLen = .3 + .7 * wH2, wStreak = wRun * step( .3, wH ) * smoothstep( 1.0 - wLen - .02, 1.0 - wLen + .22, vUv.y );
      float wFoot = 1.0 - smoothstep( 0.0, .24, vUv.y );
      float wDrop = step( .82, wHash( floor( vUv * vec2( 150.0, 60.0 ) ) ) ) * .6;
      diffuseColor.rgb *= 1.0 - .5 * wStreak - .42 * wFoot - .1 * wDrop;
      wWet = clamp( wStreak * .9 + wFoot * .8 + wDrop, 0.0, 1.0 );`}`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
      roughnessFactor = mix( roughnessFactor, ${roof ? '.07' : '.22'}, wWet );`)
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
      if ( cameraPosition.y < 0.0 ) { reflectedLight.directSpecular *= .0; reflectedLight.indirectSpecular *= .2; }   // (in the wet road's mirror, which looks from below the ground: no sun glare on the mirrored box)`);
  };
  m.customProgramCacheKey = () => 'wetContainer3' + (roof ? 'Roof' : 'Side');
  return m;
}

export function containerMaterials(v, wear = 0, wet = false) {
  return cached(`containerMats:${v}:${wear}:${wet ? 'wet' : 'dry'}`, () => {
    const [paint, rust0] = PAINTS[v % PAINTS.length], rust = Math.min(1, Math.max(0, rust0 + [-.125, .125, .32, .56][wear])), rnd = seededRandom(v * 97 + wear * 13 + 5), b = bumps();
    const m = (map, bump, wetShade = false) => wet && wetShade ? wetMaterial(map, bump, wetShade === 'roof') : new THREE.MeshStandardMaterial({ map, bumpMap: bump, bumpScale: .05, roughness: .62, metalness: .35, envMapIntensity: .45, shadowSide: THREE.FrontSide }); // (shadowSide: the shadow is drawn from the faces turned to the sun, so none of the ground beside a container's far side is lit)
    const side = m(sideCanvas(paint, rust, rnd), b.side, true), door = m(doorCanvas(paint, rust, rnd), b.end, true), end = m(plainEndCanvas(paint, rust, rnd), b.end, true), roof = m(roofCanvas(paint, rust, rnd), b.roof, 'roof');
    return [door, end, roof, roof, side, side];
  });
}

// One container standing at (x, y, z) (y: the ground or the roof it sits on), long axis along X turned by yaw.
// The open doors of the yard's containers in a strong wind (stage 6's storm, k 0 .. 1). Each is a heavy steel leaf on a hinge, simulated: the wind pushes on it (in gusts that roll across the yard, the same gust reaching each a moment
// apart, higher doors feeling more of it and a little turbulence on top), its weight makes it slow to start and slow to stop, a rusty hinge drags on it and a little holds it where it was left, and at the ends of its travel (nearly
// shut against the container, or flung wide against its side) it hits the stop, bangs and bounces back a little.
const DOOR_SWINGS = [], DOOR_LO = .15, DOOR_HI = 2.3;
export function swingDoors(dt, t, k) {
  if (dt <= 0) return;
  dt = Math.min(dt, .05); const n = 3, h = dt / n;
  for (const d of DOOR_SWINGS) {
    d.a ??= d.base; d.w ??= 0;
    // the wind is gusty and keeps changing its mind: a signed push (now at the door's back, now in its face), with quick shifts in it, and a rarer hard slam
    const tl = t - d.ph * .25, wind = Math.sin(tl * 1.1) * .7 + Math.sin(tl * 2.3 + 1.3 + d.ph) * .55 + Math.sin(tl * 4.7 + d.ph * 2.0) * .3 + 1.6 * Math.pow(Math.max(0, Math.sin(tl * .55 + d.ph)), 6) * (Math.sin(tl * 3.1) > 0 ? 1 : -1);
    const hi = d.fast - 1, push = k * d.fast * (1 + hi * .7) * wind * 3.6, rest = Math.min(.7, .35 + hi * .14); // (the higher the door, the harder it is thrown, the freer it swings and the more it bounces)
    for (let s = 0; s < n; s++) {
      const drag = .8 / (1 + hi * .3) * d.w + .12 * Math.sign(d.w) * Math.min(1, Math.abs(d.w) * 8), hold = .12 * (d.a - d.base);
      d.w += (push - drag - hold) * h; d.a += d.w * h;
      if (d.a > DOOR_HI) { d.a = DOOR_HI; if (d.w > .25) d.bang = d.w; d.w = d.w > .05 ? -d.w * rest : 0; }
      else if (d.a < DOOR_LO) { d.a = DOOR_LO; if (d.w < -.25) d.bang = -d.w; d.w = d.w < -.05 ? -d.w * rest : 0; }
    }
    d.pv.rotation.y = -d.sd * d.a;
  }
}

function containerBox(root, v, wear, x, y, z, yaw = 0, wet = false, exposed = false) {
  const { L, W, H } = CONTAINER, frame = cached('containerFrame', () => pmat(0x2a2a2a, .6, .6));
  y += .02; // (clear of the ground, or of the one it's stacked on)
  const st = typeof wet === 'function' ? rollStyle(wet, exposed) : null; // (wet is the style's random source when the yard's variety is wanted)
  if (st) wear = WEAR_PAIRS[v % WEAR_PAIRS.length][st.pick]; // (each colour comes in two levels of wear only, one of them the one the side yard uses: every colour and wear is a set of textures to draw, and the yard's boxes are many)
  const mats = containerMaterials(v, wear, !!wet), cx = Math.cos(yaw), sn = Math.sin(yaw);
  let first = null;
  const one = (len, ox, flip, doors) => { // a box `len` long, its middle ox along the line, its door end facing +x (turned round if flip)
    const bx = x + ox * cx, bz = z - ox * sn, by = yaw + (flip ? Math.PI : 0), bc = Math.cos(by), bs = Math.sin(by);
    const ms = doors ? [interiorMaterial(st.cargo), ...mats.slice(1)] : mats;
    const box = new THREE.Mesh(new THREE.BoxGeometry(len, H, W), ms); box.position.set(bx, y + H / 2, bz); box.rotation.y = by; box.castShadow = box.receiveShadow = true; root.add(box);
    (root.userData.tops ??= []).push({ x: bx, z: bz, ry: by, hl: len / 2, hw: W / 2, h: y + H }); // (each box's own footprint and top, in the pile's own frame: the rain's splashes land on each at its own height, see world.js)
    for (const a of [-1, 1]) for (const b of [-1, 1]) for (const h of [.1, H - .1]) { // corner castings: standing a little proud of every face (no flicker)
      const lx = a * (len / 2 - .09), lz = b * (W / 2 - .09);
      add(root, new THREE.BoxGeometry(.24, .23, .24), frame, bx + lx * bc + lz * bs, y + h + (h > 1 ? .005 : -.005), bz - lx * bs + lz * bc);
    }
    if (doors) { // the doors: a leaf hung on each side of the end, each swung open or left shut (one leaf open: the other stays shut)
      const bar = cached('containerBar', () => pmat(0x1c1c1c, .6, .5));
      [-1, 1].forEach(sd => {
        const angle = doors === 2 ? (1.5 + (sd * st.side > 0 ? .5 : 0) + ((v + (ox > 0 ? 1 : 0)) % 3) * .1) : (sd === st.side ? 1.7 : 0); // (rad: 0 shut, 1.7 about ninety-seven degrees)
        const pv = new THREE.Group(); pv.position.set(len / 2 + .035, 0, sd * (W / 2 - .015)); pv.rotation.y = -sd * angle;
        if (angle > .5) { pv.name = 'doorSwing'; DOOR_SWINGS.push({ pv, sd, base: angle, fast: 1 + y / H * .6, ph: (v * 1.7 + x * .31 + z * .53 + sd * 2.1) % 6.283 }); } // (an open door: the wind will swing it, see swingDoors)
        const leaf = new THREE.Mesh(new THREE.BoxGeometry(.07, H - .1, W / 2 - .03), mats[1]); leaf.position.set(0, 0, -sd * (W / 4 - .005)); leaf.castShadow = true; pv.add(leaf);
        for (const f of [.3, .65]) add(pv, new THREE.BoxGeometry(.05, H - .2, .05), bar, .06, 0, -sd * (W / 2 - .03) * f);
        const g = new THREE.Group(); g.position.set(bx, y + H / 2, bz); g.rotation.y = by; g.add(pv); root.add(g);
      });
    }
    return box;
  };
  if (st?.short) { const q = L / 4; first = one(L / 2 - .1, -q, true, 0); one(L / 2 - .1, q, false, 0); }
  else first = one(L, 0, false, st ? st.doors : 0);
  if (st?.tarp) { // a tarpaulin dragged across part of the roof: creased and sagging, tied down by its eyelets, hanging a little over the edges
    const tl = L * (.45 + .2 * (v % 3) / 2), tw = W * 1.02, geo = new THREE.PlaneGeometry(tl, tw, 30, 10); geo.rotateX(-Math.PI / 2);
    const p = geo.attributes.position, tr = seededRandom(v * 31 + 7);
    const ph = [tr() * 6, tr() * 6, tr() * 6];
    for (let i = 0; i < p.count; i++) { const px = p.getX(i), pz = p.getZ(i), e = Math.abs(pz) / (tw / 2), end = Math.abs(px) / (tl / 2);
      p.setY(i, .045 + .035 * Math.sin(px * 2.3 + ph[0]) * Math.cos(pz * 3.1 + ph[1]) + .02 * Math.sin(px * 7 + pz * 5 + ph[2]) - Math.pow(e, 6) * .35 - Math.pow(end, 8) * .08); } // (billows between the ties; the long edges droop over the sides)
    geo.computeVertexNormals();
    const t = new THREE.Mesh(geo, tarpMaterial(v)); const ox = (st.side * .22) * L;
    t.position.set(x + ox * cx, y + H + .02, z - ox * sn); t.rotation.y = yaw + st.side * .06; t.castShadow = t.receiveShadow = true; root.add(t);
  }
  return first;
}

// A map container's footprint (~10 x 5 m): two containers side by side, sometimes a third stacked on
// top, each its own colour and wear (picked from `seed`).
// A pile of shipping containers, thrown up at odd angles: a bottom row of two, a second tier shoved about on it, and (3 tiers) one more set crooked on top. Each box carries its own paint and wear.
export function buildContainerPile(seed = 1, tiers = 3, wet = false) {
  const root = new THREE.Group(); root.name = 'containerPile';
  const sr = wet ? seededRandom(Math.abs(Math.round(seed * 7.3)) + 41) : false; // (the yard's variety draws from its own random source: the colours and positions stay as they were)
  const rnd = seededRandom(Math.abs(Math.round(seed * 13.7)) + 11), pick = () => Math.floor(rnd() * PAINTS.length), { H } = CONTAINER, j = k => (rnd() - .5) * 2 * k;
  for (const z of [-1.28, 1.28]) containerBox(root, pick(), Math.floor(rnd() * 2), j(.25), 0, z + j(.05), j(.03), sr);
  for (let t = 1; t < tiers; t++) { // the tiers above: pairs shoved along and slewed a little, and the top one a single box set crooked across the two below
    const y = t * H + t * .03;
    if (t === tiers - 1) containerBox(root, pick(), Math.floor(rnd() * 2), j(2.2), y, j(.9), j(.4), sr, true);
    else for (const z of [-1.28, 1.28]) if (rnd() < .85) containerBox(root, pick(), Math.floor(rnd() * 2), j(1.6), y, z + j(.12), j(.13), sr);
  }
  return root;
}

export function buildContainer(seed = 1, wet = false) {
  const root = new THREE.Group(); root.name = 'container';
  const sr = wet ? seededRandom(Math.abs(Math.round(seed * 7.3)) + 43) : false;
  const rnd = seededRandom(Math.abs(Math.round(seed * 13.7)) + 3), pick = () => Math.floor(rnd() * PAINTS.length);
  const v1 = pick(), v2 = rnd() < .35 ? v1 : pick();
  for (const [v, z] of [[v1, -1.28], [v2, 1.28]]) containerBox(root, v, Math.floor(rnd() * 2), (rnd() - .5) * .3, 0, z + (rnd() - .5) * .08, (rnd() - .5) * .025, sr, true);
  if (rnd() < .3) { const tz = rnd() < .5 ? -1.28 : 1.28; root.userData.topperZ = tz; containerBox(root, pick(), Math.floor(rnd() * 2), (rnd() - .5) * .4, CONTAINER.H + .03, tz, (rnd() - .5) * .03, sr, true); }   // (topperZ: where the second tier sits along the pair, for the collision heights)
  return root;
}

export function buildBarrier(len = 10) {
  const root = new THREE.Group(); root.name = 'barrier';
  const steel = cached('barrierSteel', () => pmat(0xd8dad6, .45, .6));
  const dark = cached('barrierDark', () => pmat(0x6e706c, .6, .5));
  const H = 1.1, panels = Math.max(1, Math.round(len / 2.5)), pw = len / panels;
  for (let p = 0; p < panels; p++) {
    const x0 = -len / 2 + p * pw;
    for (const y of [.25, H]) { const r = add(root, new THREE.CylinderGeometry(.04, .04, pw - .08, 8), steel, x0 + pw / 2, y, 0); r.rotation.z = Math.PI / 2; } // rails
    for (const x of [x0 + .06, x0 + pw - .06]) add(root, new THREE.CylinderGeometry(.045, .045, H, 8), steel, x, H / 2, 0); // frame posts
    for (let i = 1; i < 9; i++) add(root, new THREE.CylinderGeometry(.018, .018, H - .25, 6), steel, x0 + i * pw / 9, (H + .25) / 2, 0); // bars
    for (const x of [x0 + .2, x0 + pw - .2]) add(root, new THREE.BoxGeometry(.08, .05, .9), dark, x, .03, 0); // feet
  }
  return root;
}

// mount 'wall' (bolted to a wall's face: origin on the wall, the emitter's front toward -Z, its middle at
// the origin's height): a slim armoured housing that sits close to the wall, angled faces, a glowing lens
// slit in a recessed bezel, heat-sink fins and a cable conduit; stood on end, the slit upright (it
// throws a vertical curtain of energy: lasers.js). 'roof': the same unit on a roof plinth.
// Named parts: `head`, `lens` (the glowing slit), `muzzle` (the middle of the lens).
export function buildLaser(mount = 'wall') {
  const root = new THREE.Group(); root.name = 'laser';
  const armour = cached('laserArmour', () => pmat(0x3d4246, .38, .75));
  const trim = cached('laserTrim', () => pmat(0x1b1d1f, .45, .7));
  const steel = cached('laserSteel', () => pmat(0x9aa0a4, .3, .85));
  const lens = cached('laserLens', () => new THREE.MeshStandardMaterial({ color: 0x3a0806, emissive: 0xff2a12, emissiveIntensity: 1.4, roughness: .15, metalness: .2 }));
  const led = cached('laserLed', () => new THREE.MeshStandardMaterial({ color: 0x103010, emissive: 0x40ff60, emissiveIntensity: 1.2 }));
  const head = new THREE.Group(); head.name = 'head'; root.add(head);
  if (mount === 'roof') { add(root, new THREE.BoxGeometry(2.2, .6, 1.6), trim, 0, .3, 0); head.position.set(0, 1.2, .3); }
  head.rotation.z = Math.PI / 2; // (on end: the lens slit runs up and down)
  // recessed mounting frame against the wall
  add(head, new THREE.BoxGeometry(2.0, 1.5, .12), trim, 0, 0, -.06);
  // the housing: a low box with chamfered top and bottom faces (a squashed octagonal prism)
  const prof = new THREE.Shape(), hw = .8, hh = .55, ch = .22;
  prof.moveTo(-hw + ch, -hh); prof.lineTo(hw - ch, -hh); prof.lineTo(hw, -hh + ch); prof.lineTo(hw, hh - ch); prof.lineTo(hw - ch, hh);
  prof.lineTo(-hw + ch, hh); prof.lineTo(-hw, hh - ch); prof.lineTo(-hw, -hh + ch); prof.closePath();
  const body = new THREE.ExtrudeGeometry(prof, { depth: .45, bevelEnabled: true, bevelThickness: .04, bevelSize: .03, bevelSegments: 2 });
  body.translate(0, 0, -.12 - .45 - .04); // its back against the frame
  add(head, body, armour);
  // the lens: a recessed bezel and a glowing slit across the front
  add(head, new THREE.BoxGeometry(1.15, .26, .08), trim, 0, -.05, -.66);
  add(head, new THREE.BoxGeometry(1.0, .12, .04), lens, 0, -.05, -.69).name = 'lens';
  // heat-sink fins along the top, a status light, a cable conduit up into the wall
  for (let i = 0; i < 7; i++) add(head, new THREE.BoxGeometry(.04, .14, .34), steel, -.42 + i * .14, .6, -.36);
  add(head, new THREE.SphereGeometry(.035, 8, 6), led, .62, .32, -.64);
  add(head, new THREE.CylinderGeometry(.05, .05, .9, 8), steel, -.62, .9, -.12);
  const muzzle = new THREE.Object3D(); muzzle.name = 'muzzle'; muzzle.position.set(0, -.05, -.72); head.add(muzzle);
  return root;
}
