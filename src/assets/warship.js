// Warship (placeholder) for the Jackal-style level-3 boss: a miniature modern destroyer in the style of the
// Chinese Type 052D (~44 m long, 6.4 m beam): a raked, flared bow, a stealthy faceted superstructure with a
// four-faced radar tower.
// Weapons (6 targets): a gun turret on the foredeck, a second gun turret on the afterdeck, and four single-cell
// vertical launchers (a port / starboard pair forward, another aft).
// Every launcher has a closed lid by default; open it (and raise its missile to the ready position) with
// poseVls(root, index, open): each cell has its own lid, so they can open and close at different times. Missile flight is up to you.
// Origin on the waterline at about mid-length; the bow faces -Z.
// Named parts:
//   hull                the whole ship (rock it on the water)
//   gun                 foredeck turret, turns on Y            -> aimGun(root, yaw, pitch)
//   gunBarrel           pitch pivot inside `gun`; `gunMuzzle` is the muzzle (local -Z = firing direction)
//   gunAft              afterdeck turret (rests pointing astern)   -> aimGun(root, yaw, pitch, 'gunAft')
//   gunAftBarrel / gunAftMuzzle   the same pivots for the aft gun
//   (yaw is in the ship's frame for both guns: 0 = straight ahead, PI = straight astern)
//   vls0 .. vls3        the launchers: 0 forward port, 1 forward starboard, 2 aft port, 3 aft starboard; one cell each
//     vls{n}_lid0         its lid (hinged on the outboard edge)
//     vls{n}_rack         lifts the loaded missile when the lid is open
//     vls{n}_missile0     the loaded missile (nose up)
//     vls{n}_muzzle0      launch point (local -Z points straight up)
//   mast                radar tower
import * as THREE from 'three';
import { add, mat, cached, PI, canvasTexture, seededRandom, decal, roundedRect } from './common.js';
import { buildMissile } from './submarine.js';
import { BufferGeometryUtils } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// ------------------------------------------------------------------ materials
// Painted steel: each kind is a tile of plating (seams, weld lines, streaks of run-off and fine pitting) with a matching bump map. Hull sides use (z, y) metres as their UVs,
// the deckhouse faces (x + z, y), the deck (x, z), so the tiles are sized in metres: `m` = [metres across, metres up] a tile covers.
const KINDS = {
  hull: { res: 1024, m: [8, 4], plate: [0, 0], streaks: 22, tone: .05, pit: 1500, waterline: true },     // long strakes, run-off streaks down the side
  sup: { m: [4, 2], plate: [0, 0], streaks: 14, tone: .05, pit: 1000, blotch: 28 },       // the stealth deckhouse: smooth faces, panel lines
  turret: { m: [2, 2], plate: [0, 0], streaks: 18, tone: .07, pit: 1200, blotch: 34 },   // the gun turrets: hull-grey paint, worn and grimy
  deck: { m: [4, 4], plate: [0, 0], streaks: 0, tone: .05, pit: 4000, nonslip: true }, // non-slip deck coating
  plain: { m: [2, 2], plate: [0, 0], streaks: 0, tone: .02, pit: 800 },
};
function plateCanvas(kind, bump) {
  const K = KINDS[kind], S = K.res ?? 512, W = S, H = Math.round(S * K.m[1] / K.m[0]), rnd = seededRandom(31 + kind.length * 7 + (bump ? 100 : 0));
  const c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d'), px = W / K.m[0], k = S / 512; // px per metre; k: how much finer than the usual 512 this tile is (pixel-sized marks scale with it)
  x.fillStyle = bump ? '#808080' : '#f4f4f4'; x.fillRect(0, 0, W, H);
  if (!bump) for (let k = 0; k < 10; k++) {                                   // faint, wide paint tone shifts (several per tile: no single blotch to repeat)
    const cx = rnd() * W, cy = rnd() * H, r = (60 + rnd() * 120) * k, g = x.createRadialGradient(cx, cy, 0, cx, cy, r), v = rnd() > .5 ? 255 : 0;
    g.addColorStop(0, `rgba(${v},${v},${v},${K.tone})`); g.addColorStop(1, `rgba(${v},${v},${v},0)`); x.fillStyle = g; x.fillRect(cx - r, cy - r, 2 * r, 2 * r);
  }
  const [ph, pw] = [K.plate[0] * px, K.plate[1] * px];                         // seams along (every ph) and, if wanted, across (every pw, staggered each row; 0 = none: long strakes, not bricks)
  if (ph) for (let row = 0, y = 0; y < H + ph; row++, y += ph) {
    x.fillStyle = bump ? '#505050' : 'rgba(40,48,54,.11)'; x.fillRect(0, Math.round(y), W, 2);                       // the seam
    x.fillStyle = bump ? '#a8a8a8' : 'rgba(255,255,255,.07)'; x.fillRect(0, Math.round(y) + 2, W, 1);                // a catch of light under it
    if (pw) for (let xx = (row % 2) * pw / 2; xx < W + pw; xx += pw) { x.fillStyle = bump ? '#585858' : 'rgba(40,48,54,.14)'; x.fillRect(Math.round(xx), Math.round(y), 2, ph);
      x.fillStyle = bump ? '#a0a0a0' : 'rgba(255,255,255,.1)'; x.fillRect(Math.round(xx) + 2, Math.round(y), 1, ph); }
  }
  if (K.waterline && !bump) { // grime and a dark boot-topping stripe where the hull meets the water (the tile's bottom edge is y = 0)
    const g = x.createLinearGradient(0, H, 0, H - .9 * px); g.addColorStop(0, 'rgba(20,24,28,.55)'); g.addColorStop(.35, 'rgba(20,24,28,.22)'); g.addColorStop(1, 'rgba(20,24,28,0)');
    x.fillStyle = g; x.fillRect(0, H - .9 * px, W, .9 * px);
    x.fillStyle = 'rgba(14,18,22,.7)'; x.fillRect(0, H - .3 * px, W, .3 * px); // a darker, crisp boot-topping strip right at the waterline
  }
  if (K.blotch && !bump) {                                                     // faded and grimy patches and a few chips (each drawn wrapped round the tile edges, so the tiling doesn't show)
    const wrap = (cx, cy, r, draw) => { for (const dx of [-W, 0, W]) for (const dy of [-H, 0, H]) if (cx + dx > -r && cx + dx < W + r && cy + dy > -r && cy + dy < H + r) draw(cx + dx, cy + dy); };
    for (let i = 0; i < K.blotch; i++) {
      const sx = rnd() * W, sy = rnd() * H, r = (.2 + rnd() * .6) * px, light = rnd() > .45, c = light ? '236,238,236' : '22,26,28', a = light ? .08 : .1;
      wrap(sx, sy, r, (cx, cy) => { const g = x.createRadialGradient(cx, cy, 0, cx, cy, r); g.addColorStop(0, `rgba(${c},${a})`); g.addColorStop(1, `rgba(${c},0)`); x.fillStyle = g; x.fillRect(cx - r, cy - r, 2 * r, 2 * r); });
    }
    for (let i = 0; i < 40; i++) { const w = 2 + rnd() * 6, sx = rnd() * W, sy = rnd() * H, al = .1 + rnd() * .15; wrap(sx, sy, w, (cx, cy) => { x.fillStyle = `rgba(70,76,80,${al})`; x.fillRect(cx, cy, w, 2); }); }
  }
  if (K.waterline && !bump) {                                                  // the hull's sides: rust stains (orange-brown to ochre), drips running down from them, and chipped, rusting patches (drawn wrapped round the tile edges)
    const wrap = (cx, cy, r, draw) => { for (const dx of [-W, 0, W]) for (const dy of [-H, 0, H]) if (cx + dx > -r && cx + dx < W + r && cy + dy > -r && cy + dy < H + r) draw(cx + dx, cy + dy); };
    for (let i = 0; i < 26; i++) {
      const sx = rnd() * W, sy = H * (.08 + rnd() * .7), r = (.07 + rnd() * .16) * px, len = (.4 + rnd() * 1.3) * px, w = (.05 + rnd() * .07) * px, a = .2 + rnd() * .16, c = rnd() < .45 ? '150,72,28' : '168,112,40';
      wrap(sx, sy, r + len, (cx, cy) => {
        const g = x.createRadialGradient(cx, cy, 0, cx, cy, r); g.addColorStop(0, `rgba(${c},${a})`); g.addColorStop(.6, `rgba(${c},${a * .5})`); g.addColorStop(1, `rgba(${c},0)`); x.fillStyle = g; x.fillRect(cx - r, cy - r, 2 * r, 2 * r);
        const d = x.createLinearGradient(0, cy, 0, cy + len); d.addColorStop(0, `rgba(${c},${a * .85})`); d.addColorStop(1, `rgba(${c},0)`); x.fillStyle = d; x.fillRect(cx - w / 2, cy, w, len);
      });
    }
    for (let i = 0; i < 18; i++) { const w = (3 + rnd() * 8) * k, h = (2 + rnd() * 5) * k, sx = rnd() * W, sy = H * (.05 + rnd() * .85), al = .25 + rnd() * .17, c = rnd() < .5 ? '128,58,24' : '156,98,36'; wrap(sx, sy, w, (cx, cy) => { x.fillStyle = `rgba(${c},${al})`; x.fillRect(cx, cy, w, h); }); }
  }
  for (let i = 0; i < K.streaks; i++) {                                        // run-off and grime streaks down the plating
    const sx = rnd() * W, sy = rnd() * H, len = (30 + rnd() * 110) * k, g = x.createLinearGradient(0, sy, 0, sy + len);
    const rust = rnd() > .55;
    g.addColorStop(0, rust ? 'rgba(120,70,40,.0)' : 'rgba(30,36,40,0)'); g.addColorStop(.25, rust ? 'rgba(120,70,40,.07)' : 'rgba(30,36,40,.05)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    if (!bump) { x.fillStyle = g; x.fillRect(sx, sy, (3 + rnd() * 6) * k, len); }
  }
  if (K.nonslip && !bump) {                                                    // coarse mottling that survives at a distance (every mark is drawn wrapped round the tile edges, so the tiling doesn't show)
    const wrap = (cx, cy, r, draw) => { for (const dx of [-W, 0, W]) for (const dy of [-H, 0, H]) if (cx + dx > -r && cx + dx < W + r && cy + dy > -r && cy + dy < H + r) draw(cx + dx, cy + dy); };
    for (let i = 0; i < 60; i++) {
      const sx = rnd() * W, sy = rnd() * H, r = (.3 + rnd() * .7) * px, light = rnd() > .5, c = light ? '150,154,150' : '8,10,12', a = light ? .12 : .11;
      wrap(sx, sy, r, (cx, cy) => { const g = x.createRadialGradient(cx, cy, 0, cx, cy, r); g.addColorStop(0, `rgba(${c},${a})`); g.addColorStop(1, `rgba(${c},0)`); x.fillStyle = g; x.fillRect(cx - r, cy - r, 2 * r, 2 * r); });
    }
    for (let i = 0; i < 500; i++) { const w = 2 + rnd() * 3, h = w * (.5 + rnd() * .8), sx = rnd() * W, sy = rnd() * H, light = rnd() > .5, al = .1 + rnd() * .12;
      wrap(sx, sy, w, (cx, cy) => { x.fillStyle = light ? `rgba(180,184,180,${al})` : `rgba(8,10,12,${al})`; x.fillRect(cx, cy, w, h); }); }
  }
  if (K.nonslip) for (let i = 0; i < 25000; i++) { const v = rnd() > .5 ? 255 : 0, d = rnd() > .75 ? 2 : 1; x.fillStyle = `rgba(${v},${v},${v},${bump ? .22 : .16})`; x.fillRect(rnd() * W, rnd() * H, d, d); } // grit
  for (let i = 0; i < K.pit * k * k; i++) { const v = rnd() > .5 ? 255 : 0; x.fillStyle = `rgba(${v},${v},${v},${bump ? .035 : .015})`; x.fillRect(rnd() * W, rnd() * H, 1, 1); } // fine pitting
  return c;
}
// (This project's three has no colorSpace: the map is used as drawn, which is how the colours below were chosen.)
const skin = (hex, rough, metal, kind = 'plain', env = .5) => {
  const K = KINDS[kind], rep = [1 / K.m[0], 1 / K.m[1]];
  return new THREE.MeshStandardMaterial({
    color: hex, roughness: rough, metalness: metal, envMapIntensity: env, bumpScale: kind === 'deck' ? .12 : .07, // (env: how much sky it reflects: the deck must not go blue)
    map: cached('shipMap_' + kind, () => canvasTexture(plateCanvas(kind, false), ...rep)), bumpMap: cached('shipBump_' + kind, () => canvasTexture(plateCanvas(kind, true), ...rep)),
  });
};
// Active electronically scanned array face: a grid of small transmit/receive modules in a dark panel
function aesaCanvas() {
  const S = 256, c = document.createElement('canvas'); c.width = c.height = S; const x = c.getContext('2d'), n = 16, cell = S / n;
  x.fillStyle = '#1b262c'; x.fillRect(0, 0, S, S);
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { x.fillStyle = (i + j) % 2 ? '#2d4048' : '#26373e'; x.fillRect(i * cell + 1, j * cell + 1, cell - 2, cell - 2); x.fillStyle = 'rgba(160,190,200,.14)'; x.fillRect(i * cell + 2, j * cell + 2, cell - 5, 1); }
  return c;
}
const mats = () => cached('shipMats', () => ({
  aesa: new THREE.MeshStandardMaterial({ map: cached('shipAesaMap', () => canvasTexture(aesaCanvas(), 1, 1)), color: 0xffffff, roughness: .35, metalness: .5, envMapIntensity: .8 }),
  radome: mat(0xe6eaea, .35, .1),
  hull: skin(0x7c8890, .5, .2, 'hull', .9), boot: skin(0x6a3530, .8, .1, 'hull', .5), deck: skin(0x4a4b4b, .9, 0, 'deck', .3),
  turret: skin(0x76828a, .5, .25, 'turret', .7), roof: skin(0x62666a, .9, 0, 'deck', .3), sup: skin(0x868c8e, .55, .25, 'sup', .8), trim: skin(0x9aa1a3, .5, .3), lid: skin(0x646d73, .5, .4),
  dark: mat(0x1e2124, .7, .3), frame: mat(0x2e3438, .7, .4), glass: mat(0x1c2b33, .15, .5, { envMapIntensity: 1.0 }), door: mat(0x5b656b, .6, .3), radar: mat(0x1d2a33, .5, .5),
  body: mat(0xcfd3c8, .45, .3), nose: mat(0xd04a2e, .5, .2), hazard: mat(0xc8a020, .5, .2), ring: mat(0xdf5a1e, .6, .1), flag: mat(0xc01818, .8, 0), raft: mat(0xd8721f, .6, .1), rail: mat(0xb9c1c4, .4, .5),
}));
// Materials whose meshes can never show in the water's reflection (the camera looks steeply down: the top of the deck and what lies flat on it are hidden by the hull's own side): game/warship.js keeps them out of that view.
const NO_REFLECT = ['deck', 'lid', 'raft', 'ring', 'hazard', 'flag'];
const smooth = x => { x = Math.min(1, Math.max(0, x)); return x * x * (3 - 2 * x); };

// ------------------------------------------------------------------ hull
// stations [z, deck half-beam, deck height, keel height, bilge squareness p, flare]. Deck heights are above the waterline (y = 0).
const KEYS = [
  [-21.0, .05, 3.40, -.05, 2.0, .10], [-20.0, .55, 3.35, -.35, 2.0, .12], [-18.0, 1.45, 3.20, -.95, 2.0, .12], [-15.0, 2.45, 2.95, -1.30, 2.2, .10],
  [-10.0, 3.05, 2.70, -1.50, 2.6, .06], [-4.0, 3.20, 2.55, -1.55, 3.0, .04], [6.0, 3.20, 2.45, -1.55, 3.0, .04],
  [14.0, 3.10, 2.35, -1.45, 3.0, .04], [19.0, 2.95, 2.30, -1.00, 2.8, .03], [21.0, 2.80, 2.28, -.45, 2.6, .02],
];
const RAKE = .5;                                                            // the stem leans forward by this much per metre of height
function profile(keys) {
  const n = keys.length, slope = (i, k) => { const a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1); return (keys[b][k] - keys[a][k]) / (keys[b][0] - keys[a][0]); };
  return z => {
    z = Math.min(keys[n - 1][0], Math.max(keys[0][0], z));
    let i = 0; while (i < n - 2 && z > keys[i + 1][0]) i++;
    const h = keys[i + 1][0] - keys[i][0], t = (z - keys[i][0]) / h, t2 = t * t, t3 = t2 * t;
    const g = k => (2 * t3 - 3 * t2 + 1) * keys[i][k] + (t3 - 2 * t2 + t) * slope(i, k) * h + (-2 * t3 + 3 * t2) * keys[i + 1][k] + (t3 - t2) * slope(i + 1, k) * h;
    return { wd: Math.max(.03, g(1)), top: g(2), bot: Math.min(-.02, g(3)), p: Math.max(2, g(4)), fl: Math.max(0, g(5)) };
  };
}
const prof = profile(KEYS);
const bowK = z => smooth((-10 - z) / 11);                                    // 0 behind z = -10, 1 at the stem
const shearZ = (z, y) => z - RAKE * bowK(z) * Math.max(y, 0);                // world z of the point at nominal z and height y
const deckY = z => prof(z).top;                                              // deck height at nominal z
const deckZ = z => shearZ(z, deckY(z));                                      // world z of the deck at nominal z
function halfW(z, y) {
  const q = prof(z), s = Math.min(1, Math.max(0, (q.top - y) / (q.top - q.bot)));
  return q.wd * (1 - q.fl * s) * Math.pow(Math.max(0, 1 - Math.pow(s, q.p)), 1 / q.p);
}
const hp = (z, y, sg) => new THREE.Vector3(sg * halfW(z, y), y, shearZ(z, y));
const hullN = (z, y, sg) => {                                                // outward normal of the side shell
  const n = new THREE.Vector3().crossVectors(hp(z, y + .03, 1).sub(hp(z, y - .03, 1)), hp(z + .03, y, 1).sub(hp(z - .03, y, 1))).normalize(); n.x *= sg; return n;
};

const NZ = 110, K1 = 14, K2 = 8;                                             // stations along the ship; rows below / above the waterline
const zs = Array.from({ length: NZ + 1 }, (_, i) => -21 + 42 * (1 - Math.cos(PI * i / NZ)) / 2);
function sideGeo(sg) {
  const pos = [], nrm = [], uv = [], idx = [], cols = NZ + 1;
  for (let j = 0; j <= K1 + K2; j++) for (let i = 0; i <= NZ; i++) {
    const q = prof(zs[i]), y = j <= K1 ? q.bot + (0 - q.bot) * j / K1 : q.top * (j - K1) / K2;
    const p = hp(zs[i], y, sg), n = hullN(zs[i], y, sg);
    pos.push(p.x, p.y, p.z); nrm.push(n.x, n.y, n.z); uv.push(p.z, p.y);
  }
  const g = new THREE.BufferGeometry();
  for (let j = 0; j < K1 + K2; j++) for (let i = 0; i < NZ; i++) {                    // rows below the waterline first, so they form the first draw group
    const a = j * cols + i, b = a + cols, c = a + 1, d = b + 1;
    sg > 0 ? idx.push(a, b, c, b, d, c) : idx.push(a, c, b, b, c, d);
  }
  g.groups = [{ start: 0, count: K1 * NZ * 6, materialIndex: 0 }, { start: K1 * NZ * 6, count: K2 * NZ * 6, materialIndex: 1 }];
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); return g;
}
function deckGeo() {
  const pos = [], uv = [], idx = [], nx = 4;
  zs.forEach(z => { const q = prof(z); for (let ix = 0; ix <= nx; ix++) { const x = q.wd * (-1 + 2 * ix / nx); pos.push(x, q.top, shearZ(z, q.top)); uv.push(x, shearZ(z, q.top)); } });
  for (let i = 0; i < NZ; i++) for (let ix = 0; ix < nx; ix++) { const a = i * (nx + 1) + ix, b = a + 1, c = a + nx + 1, d = c + 1; idx.push(a, c, b, b, c, d); }
  const nrm = []; for (let i = 0; i < pos.length / 3; i++) nrm.push(0, 1, 0);
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); return g;
}
function transomGeo() {                                                      // flat stern plate
  const z = 21, ring = [];
  for (let j = 0; j <= K1 + K2; j++) { const q = prof(z), y = j <= K1 ? q.bot + (0 - q.bot) * j / K1 : q.top * (j - K1) / K2; ring.push(hp(z, y, 1)); }
  for (let j = K1 + K2; j >= 0; j--) ring.push(ring[j].clone().setX(-ring[j].x));
  const c = new THREE.Vector3(); ring.forEach(p => c.add(p)); c.divideScalar(ring.length);
  const pos = [c.x, c.y, c.z], nrm = [0, 0, 1], uv = [0, 0], idx = [];
  ring.forEach(p => { pos.push(p.x, p.y, p.z); nrm.push(0, 0, 1); uv.push(p.x, p.y); });
  for (let i = 0; i < ring.length; i++) idx.push(0, 1 + i, 1 + (i + 1) % ring.length);
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); return g;
}

// ------------------------------------------------------------------ small building blocks
// A tapered box: rectangle (wb x lb) at y = 0 up to (wt x lt) at y = h, the top shifted by zt along Z. Flat-shaded faces.
// A flat roof plate whose texture runs in metres (the deck's coating tile), not once across the whole plate.
function roofSlab(w, d, h) {
  const g = new THREE.ExtrudeGeometry(roundedRect(w, d, Math.min(.25, w / 4, d / 4)), { depth: h, bevelEnabled: false, curveSegments: 6 }).rotateX(-PI / 2), p = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i), p.getZ(i));
  return g;
}
function flatFrust(wb, lb, wt, lt, h, zt = 0) {
  const v = [[-wb / 2, 0, -lb / 2], [wb / 2, 0, -lb / 2], [wb / 2, 0, lb / 2], [-wb / 2, 0, lb / 2], [-wt / 2, h, zt - lt / 2], [wt / 2, h, zt - lt / 2], [wt / 2, h, zt + lt / 2], [-wt / 2, h, zt + lt / 2]].map(a => new THREE.Vector3(...a));
  const c = new THREE.Vector3(); v.forEach(p => c.add(p)); c.divideScalar(8);
  const pos = [], uv = [];
  [[0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7], [4, 5, 6, 7]].forEach(q => {
    let f = q.map(i => v[i]); const n = new THREE.Vector3().crossVectors(f[1].clone().sub(f[0]), f[2].clone().sub(f[0])), fc = f.reduce((a, p) => a.add(p), new THREE.Vector3()).divideScalar(4);
    if (n.dot(fc.sub(c)) < 0) f = [f[0], f[3], f[2], f[1]];
    [0, 1, 2, 0, 2, 3].forEach(i => { pos.push(f[i].x, f[i].y, f[i].z); uv.push(f[i].x + f[i].z, f[i].y); });
  });
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.computeVertexNormals(); return g;
}
// A tapered block with soft edges: rectangle (wb x lb) at y = 0 up to (wt x lt) at y = h, the top shifted by zt along Z, its vertical corners
// rounded and its top and bottom edges bevelled. (Thin plates, under 30 cm, stay sharp-cornered slabs.) UVs in metres, as flatFrust's.
function frust(wb, lb, wt, lt, h, zt = 0) {
  if (h < .3) return flatFrust(wb, lb, wt, lt, h, zt);
  const bs = Math.min(.07, h * .1), r = Math.max(.03, Math.min(.2, wb / 4, lb / 4, wt / 4, lt / 4));
  const g = new THREE.ExtrudeGeometry(roundedRect(wb - 2 * bs, lb - 2 * bs, Math.max(.02, r - bs)), { depth: h - 2 * bs, bevelEnabled: true, bevelThickness: bs, bevelSize: bs, bevelSegments: 2, curveSegments: 5 });
  g.rotateX(-PI / 2); g.translate(0, bs, 0);                                    // extruded upward, from y = 0 to h
  const p = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const k = p.getY(i) / h, x = p.getX(i) * (1 + (wt / wb - 1) * k), z = p.getZ(i) * (1 + (lt / lb - 1) * k) + zt * k;
    p.setXYZ(i, x, p.getY(i), z); uv.setXY(i, x + z, p.getY(i));
  }
  g.computeVertexNormals();
  return g;
}
// compact missile along -Z (nose at -Z), ~1.2 m long at scale 1
function shipMissile() {
  const t = mats(), g = new THREE.Group();
  add(g, new THREE.CylinderGeometry(.1, .1, .9, 10), t.body).rotation.x = PI / 2;
  add(g, new THREE.ConeGeometry(.1, .3, 10), t.nose, 0, 0, -.6).rotation.x = -PI / 2;
  add(g, new THREE.BoxGeometry(.3, .012, .18), t.frame, 0, 0, .36);
  add(g, new THREE.BoxGeometry(.012, .3, .18), t.frame, 0, 0, .36);
  return g;
}

// ------------------------------------------------------------------ the ship
const MID_WIDEN = 1; // and this much wider across the ship again
const MID_SCALE = 1; // the deckhouse and everything on it is drawn this much bigger than modelled
const SCALE = .99; // the whole ship is drawn this much of its modelled size (it was tried at .75: 33 m long); 1 = the full 44 m, .99 = 43.6 m (game/warship.js scales its hull, hit boxes and wake to match)
export function buildWarship() {
  const t = mats(); for (const k of NO_REFLECT) t[k].userData.noReflect = true;
  const root = new THREE.Group(); root.name = 'warship'; root.scale.setScalar(SCALE);
  const hull = new THREE.Group(); hull.name = 'hull'; root.add(hull);
  const solid = (g, m) => { const o = new THREE.Mesh(g, m); o.castShadow = o.receiveShadow = true; hull.add(o); return o; };

  // hull shell: red below the waterline, grey above; flat deck; stern plate
  for (const m of Object.values(t)) m.shadowSide = THREE.FrontSide; // (the shadow is drawn from the faces turned to the sun: no lit seam along the far foot of the hull, deckhouse or turrets)
  [1, -1].forEach(sg => solid(sideGeo(sg), [t.boot, t.hull]));
  solid(deckGeo(), t.deck); solid(transomGeo(), t.hull);

  // ---- superstructure: sloped, faceted faces like the 052D's integrated deckhouse
  const D = deckY(0), L1 = D + 2.4, put = (g, m, x, y, z) => add(hull, g, m, x, y, z), midStart = hull.children.length;
  put(frust(4.8, 9.4, 3.8, 8.2, 2.4), t.sup, 0, D, .7);                                       // main deckhouse
  put(roofSlab(5.0, 9.6, .06), t.roof, 0, D + 2.4, .7);                                 // roof edge
  put(frust(3.9, 3.2, 3.1, 2.4, 1.3, -.2), t.sup, 0, L1 + .06, -2.2);                          // bridge
  put(roofSlab(3.3, 2.6, .05), t.roof, 0, L1 + 1.36, -2.3);                             // bridge roof lip
  const bw = put(new THREE.BoxGeometry(2.9, .56, .04), t.glass, 0, L1 + .72, -3.4); bw.rotation.x = .15;      // front windows
  [-1, 1].forEach(s => put(new THREE.BoxGeometry(.04, .38, 2.0), t.glass, s * 1.5, L1 + .72, -2.1));          // side windows
  [-1, 1].forEach(s => put(new THREE.BoxGeometry(.06, .3, 1.3), t.glass, s * 2.2, D + 1.4, -3.4));            // deckhouse windows
  // radar tower with four phased-array faces
  const mast = new THREE.Group(); mast.name = 'mast'; mast.position.set(0, L1 + .06, 1.0); hull.add(mast);
  add(mast, frust(2.6, 2.8, 1.9, 1.9, 3.0), t.sup, 0, 0, 0);
  add(mast, roofSlab(2.0, 2.0, .06), t.roof, 0, 3.0, 0);                       // the tower's roof, in the same worn non-slip coating as the other roofs
  const aesa = (px, pz, rx, rz, side) => {                                                                          // one scanned-array face: a light frame round a grid of modules
    const g = new THREE.Group(); g.position.set(px, 2.05, pz); g.rotation.set(rx, 0, rz); mast.add(g);
    const bx = (a, b, c) => side ? new THREE.BoxGeometry(c, b, a) : new THREE.BoxGeometry(a, b, c);
    add(g, bx(1.75, 1.75, .1), t.trim, 0, 0, 0);
    add(g, bx(1.5, 1.5, .12), t.aesa, 0, 0, 0).rotation.y = side ? PI : 0;
  };
  aesa(0, -.98, .17, 0); aesa(0, .98, -.17, 0); aesa(-.98, 0, 0, .17, true); aesa(.98, 0, 0, -.17, true);   // front / back / port / starboard arrays
  [-.55, .55].forEach(z => add(mast, new THREE.SphereGeometry(.32, 16, 12), t.radome, 0, 3.3, z));                // white radomes on the tower roof
  // the mast above the tower: a stem braced by four legs, with yards, a search-radar dish, whip aerials and a beacon
  const strut = (parent, a, b, r, m) => { const d = b.clone().sub(a), o = add(parent, new THREE.CylinderGeometry(r, r, d.length(), 6), m); o.position.copy(a).addScaledVector(d, .5); o.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()); return o; };
  add(mast, new THREE.CylinderGeometry(.07, .1, 3.6, 8), t.dark, 0, 4.85, 0);
  { // lattice mast: four tapering legs, a square ring at each level and cross-bracing on every face
    const lw = y => .62 - .52 * (y - 3.06) / 2.54, levels = [3.06, 3.9, 4.7, 5.6], V = (x, y, z) => new THREE.Vector3(x, y, z);
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => strut(mast, V(sx * lw(3.06), 3.06, sz * lw(3.06)), V(sx * lw(5.6), 5.6, sz * lw(5.6)), .035, t.frame));
    levels.forEach((y, i) => {
      const w = lw(y);
      if (i) { [-1, 1].forEach(sg => { add(mast, new THREE.BoxGeometry(2 * w, .03, .03), t.frame, 0, y, sg * w); add(mast, new THREE.BoxGeometry(.03, .03, 2 * w), t.frame, sg * w, y, 0); }); }
      if (i === levels.length - 1) return;
      const y1 = levels[i + 1], w1 = lw(y1), d = i % 2 ? -1 : 1;
      [-1, 1].forEach(sg => {
        strut(mast, V(-d * w, y, sg * w), V(d * w1, y1, sg * w1), .015, t.frame);        // the faces across (z = +-w)
        strut(mast, V(sg * w, y, -d * w), V(sg * w1, y1, d * w1), .015, t.frame);        // the faces along (x = +-w)
      });
    });
  }
  add(mast, new THREE.BoxGeometry(2.7, .08, .1), t.frame, 0, 5.0, 0);                                    // lower yard
  add(mast, new THREE.BoxGeometry(1.7, .07, .09), t.frame, 0, 5.7, 0);                                    // upper yard
  [-1, 1].forEach(sx => { add(mast, new THREE.BoxGeometry(.18, .5, .18), t.radar, sx * 1.1, 4.8, 0); add(mast, new THREE.CylinderGeometry(.015, .015, 1.4, 4), t.dark, sx * 1.34, 5.7, 0); add(mast, new THREE.CylinderGeometry(.015, .015, 1.0, 4), t.dark, sx * .8, 6.2, 0); });
  const dish = add(mast, new THREE.SphereGeometry(.5, 16, 8, 0, PI * 2, 0, PI * .35), t.trim, 0, 5.3, -.45); dish.rotation.x = -PI / 2 + .15; dish.scale.set(1.4, 1, .5);   // search radar
  add(mast, new THREE.CylinderGeometry(.04, .06, .3, 6), t.dark, 0, 5.2, -.2);
  add(mast, new THREE.CylinderGeometry(.05, .05, .42, 8), t.dark, 0, 5.3, -.3).rotation.x = PI / 2;               // arm from the mast to the dish
  add(mast, new THREE.CylinderGeometry(.06, .08, .35, 8), t.dark, 0, 5.12, -.42);                              // its pedestal
  add(mast, new THREE.SphereGeometry(.14, 12, 8), t.trim, 0, 6.7, 0);
  // ---- mid-section detail: bridge wings, window bands, doors, rafts, funnel hoods, rails
  const box = (w, h, d, m, x, y, z, rz = 0) => { const o = put(new THREE.BoxGeometry(w, h, d), m, x, y, z); o.rotation.z = rz; return o; };
  box(6.4, .1, 1.1, t.sup, 0, L1 + .5, -2.5); box(6.4, .05, 1.2, t.trim, 0, L1 + .56, -2.5);            // bridge wings reaching past both sides, with a trim edge
  [-1, 1].forEach(sx => {
    box(.07, .42, 1.0, t.glass, sx * 3.2, L1 + .78, -2.5);                                                 // wing windows (their outer faces)
    box(.7, .42, .06, t.glass, sx * 2.7, L1 + .78, -3.0); box(.7, .42, .06, t.glass, sx * 2.7, L1 + .78, -2.0);
    for (let k = 0; k < 4; k++) box(.07, .06, 1.1 - k * .0, t.rail, sx * 3.2, L1 + .62 + k * 0, -2.5); // (a toe rail along each wing end)
  });
  // windows (a framed strip of panes, tilted with the face) and watertight doors (frame, leaf, handle, a small port) on both sides of the deckhouse
  const hwAt = h => 2.4 - h / 2.4 * .5 + .02;
  const windowStrip = (sx, y, z, len, n, h = .44) => {
    const g = new THREE.Group(); g.position.set(sx * hwAt(y - D), y, z); g.rotation.z = sx * .205; hull.add(g);
    add(g, new THREE.BoxGeometry(.05, h + .1, len + .1), t.trim, 0, 0, 0).castShadow = false;                      // frame
    add(g, new THREE.BoxGeometry(.06, h, len), t.glass, .015, 0, 0).castShadow = false;                             // glass
    for (let i = 1; i < n; i++) add(g, new THREE.BoxGeometry(.07, h + .04, .13), t.trim, .02, 0, -len / 2 + len * i / n).castShadow = false; // broad mullions: each pane reads as its own square window
  };
  const hatch = (sx, y, z) => {
    const g = new THREE.Group(); g.position.set(sx * hwAt(y - D), y, z); g.rotation.z = sx * .205; hull.add(g);
    add(g, new THREE.BoxGeometry(.05, 1.0, .7), t.trim, 0, 0, 0).castShadow = false;                                // frame
    add(g, new THREE.BoxGeometry(.07, .9, .56), t.door, .015, -.02, 0).castShadow = false;                          // door leaf
    add(g, new THREE.BoxGeometry(.08, .22, .22), t.glass, .03, .22, 0).castShadow = false;                          // its port
    add(g, new THREE.BoxGeometry(.09, .05, .14), t.rail, .035, -.1, .2).castShadow = false;                         // handle
    add(g, new THREE.BoxGeometry(.09, .05, .3), t.dark, .035, -.34, 0).castShadow = false;                          // kick plate
  };
  [-1, 1].forEach(sx => {
    [-1.2, 1.5, 3.3].forEach(z => hatch(sx, D + .6, z));
    [[-2.7, 1.5, 3], [-.6, 1.4, 3], [1.5, 1.4, 3], [3.4, 1.2, 2]].forEach(([z, len, n]) => windowStrip(sx, D + 1.75, z, len, n));
  });
  for (let k = 1; k < 8; k++) box(.03, .6, .05, t.trim, -1.45 + k * .363, L1 + .72, -3.42);                         // mullions across the bridge's front windows
  // ---- the bridge: side and rear windows, a rear door, a sun visor, and a busy roof (sensors, searchlights, aerials, rails)
  const by = L1 + .06, roofY = L1 + 1.4;                                                                          // bridge base, and its roof
  const faceGroup = (x, y, z, rx, rz) => { const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.set(rx, 0, rz); hull.add(g); return g; };
  [-1, 1].forEach(sx => {
    const g = faceGroup(sx * 1.75, by + .68, -2.3, 0, sx * .3);                                                 // the sloped side face
    add(g, new THREE.BoxGeometry(.05, .66, 2.3), t.trim, 0, 0, 0).castShadow = false; add(g, new THREE.BoxGeometry(.06, .58, 2.2), t.glass, .015, 0, 0).castShadow = false;
    for (let i = 1; i < 5; i++) add(g, new THREE.BoxGeometry(.07, .62, .04), t.trim, .02, 0, -1.1 + 2.2 * i / 5).castShadow = false;
  });
  { const g = faceGroup(0, by + .72, -.78, -.43, 0);                                                              // the rear face: door and two windows
    add(g, new THREE.BoxGeometry(.7, 1.0, .05), t.trim, 0, -.05, 0).castShadow = false; add(g, new THREE.BoxGeometry(.56, .9, .07), t.door, 0, -.07, .015).castShadow = false;
    add(g, new THREE.BoxGeometry(.2, .2, .08), t.glass, 0, .2, .03).castShadow = false; add(g, new THREE.BoxGeometry(.14, .05, .09), t.rail, .2, -.1, .035).castShadow = false;
    [-1, 1].forEach(sx => { add(g, new THREE.BoxGeometry(.8, .4, .05), t.trim, sx * 1.1, .1, 0).castShadow = false; add(g, new THREE.BoxGeometry(.7, .32, .06), t.glass, sx * 1.1, .1, .015).castShadow = false; }); }
  { // the deckhouse's front face: two rows of framed windows and a centre door (the face leans back by atan(.6 / 2.4))
    const fz = h => -4.0 + h * .25 - .02, row = (h, hh, strips) => strips.forEach(([x, w, n]) => {
      const g = faceGroup(x, D + h, fz(h), .245, 0);
      add(g, new THREE.BoxGeometry(w + .1, hh + .1, .05), t.trim, 0, 0, 0).castShadow = false; add(g, new THREE.BoxGeometry(w, hh, .06), t.glass, 0, 0, -.015).castShadow = false;
      for (let i = 1; i < n; i++) add(g, new THREE.BoxGeometry(.04, hh + .04, .07), t.trim, -w / 2 + w * i / n, 0, -.02).castShadow = false;
    });
    row(1.55, .5, [[-1.05, 1.7, 3], [1.05, 1.7, 3]]); row(.7, .42, [[-1.55, .8, 2], [1.55, .8, 2]]);
    const g = faceGroup(0, D + .62, fz(.62), .245, 0);
    add(g, new THREE.BoxGeometry(.7, 1.0, .05), t.trim, 0, 0, 0).castShadow = false; add(g, new THREE.BoxGeometry(.56, .9, .07), t.door, 0, -.02, -.015).castShadow = false;
    add(g, new THREE.BoxGeometry(.2, .2, .08), t.glass, 0, .22, -.03).castShadow = false; add(g, new THREE.BoxGeometry(.14, .05, .09), t.rail, .2, -.1, -.035).castShadow = false;
  }
  box(3.5, .05, .55, t.trim, 0, by + .98, -3.6).rotation.x = .12;                                                 // sun visor over the front windows
  [-1, 1].forEach(sx => box(.05, .1, .55, t.trim, sx * 1.7, by + .93, -3.55));                                    // its brackets
  // roof: an electro-optical sensor ball on a pedestal, two searchlights, aerial domes, a small radar, a flag locker, whips and a signal-light bar
  put(new THREE.CylinderGeometry(.22, .28, .35, 12), t.sup, 0, roofY, -3.2);
  put(new THREE.SphereGeometry(.3, 14, 10), t.dark, 0, roofY + .5, -3.2); put(new THREE.CylinderGeometry(.1, .1, .12, 10), t.glass, 0, roofY + .52, -3.48).rotation.x = PI / 2;
  [-1, 1].forEach(sx => {
    put(new THREE.CylinderGeometry(.06, .06, .3, 6), t.frame, sx * 1.2, roofY + .15, -3.1);
    const sl = put(new THREE.CylinderGeometry(.2, .2, .3, 12), t.dark, sx * 1.2, roofY + .45, -3.1); sl.rotation.x = PI / 2 - .35;
    put(new THREE.CylinderGeometry(.16, .16, .03, 12), t.glass, sx * 1.2, roofY + .56, -3.27).rotation.x = PI / 2 - .35;
    put(new THREE.SphereGeometry(.17, 10, 8), t.trim, sx * .75, roofY + .12, -1.5);                               // satellite / GPS domes
    put(new THREE.CylinderGeometry(.012, .012, 1.6, 4), t.dark, sx * 1.45, roofY + .8, -1.3);                      // whip aerials
    put(new THREE.BoxGeometry(.05, .05, .5), t.frame, sx * .9, roofY + .15, -2.5);                                 // signal lamps
  });
  [-1, 1].forEach(sx => { put(new THREE.CylinderGeometry(.27, .3, .22, 14), t.radome, sx * 1.1, roofY + .11, -2.3); put(new THREE.SphereGeometry(.32, 16, 12), t.dark, sx * 1.1, roofY + .4, -2.3); }); // dark spherical radomes on white cups
  put(new THREE.BoxGeometry(.9, .22, .5), t.sup, .3, roofY + .12, -1.6); put(new THREE.BoxGeometry(.9, .03, .5), t.dark, .3, roofY + .24, -1.6);   // flag locker
  { const r = put(new THREE.BoxGeometry(1.0, .07, .08), t.radar, -.6, roofY + .95, -2.0); put(new THREE.CylinderGeometry(.03, .03, .6, 6), t.frame, -.6, roofY + .6, -2.0); r.name = 'bridgeRadar'; }
  put(new THREE.BoxGeometry(2.6, .05, .06), t.rail, 0, roofY + .3, -3.55);                                         // signal-light bar across the front
  [-1.2, -.4, .4, 1.2].forEach(x => put(new THREE.BoxGeometry(.03, .3, .03), t.rail, x, roofY + .15, -3.55));
  [-1, 1].forEach(sx => { for (let z = -3.5; z <= -1.2; z += .5) { put(new THREE.BoxGeometry(.02, .5, .02), t.rail, sx * 1.62, roofY + .25, z); } put(new THREE.BoxGeometry(.015, .015, 2.4), t.rail, sx * 1.62, roofY + .5, -2.35); put(new THREE.BoxGeometry(.015, .015, 2.4), t.rail, sx * 1.62, roofY + .25, -2.35); }); // roof rails along both sides
  [-1, 1].forEach(sx => [-1.5, .5].forEach(z => {                                                              // life-raft canisters either side of the roof: white tubes with orange bands, in a cradle
    const x = sx * 2.15, y = D + 2.73;
    put(new THREE.CylinderGeometry(.19, .19, 1.0, 16), t.radome, x, y, z).rotation.x = PI / 2;
    put(new THREE.SphereGeometry(.19, 12, 8, 0, PI * 2, 0, PI / 2), t.radome, x, y, z - .5).rotation.x = -PI / 2;       // domed ends
    put(new THREE.SphereGeometry(.19, 12, 8, 0, PI * 2, 0, PI / 2), t.radome, x, y, z + .5).rotation.x = PI / 2;
    [-.3, .3].forEach(dz => put(new THREE.CylinderGeometry(.2, .2, .08, 16), t.raft, x, y, z + dz).rotation.x = PI / 2);   // orange bands
    put(new THREE.BoxGeometry(.34, .06, .9), t.dark, x, D + 2.5, z);                                                    // cradle
  }));
  [3.5, 4.8].forEach(z => { box(1.45, .1, .85, t.trim, 0, L1 + 1.12, z + .12); box(1.4, .06, .8, t.dark, 0, L1 + 1.17, z + .12);
    for (let k = 0; k < 8; k++) box(1.36, .035, .04, t.frame, 0, L1 + 1.215, z + .12 - .32 + k * .09); }); // louvre slats across the grating // funnel caps with a grating
  { const ry = D + 2.46, x0 = 2.4, z0 = -4.0, z1 = 5.4;                                                           // railings round the main roof: both sides and the after edge
    const post = (x, z) => put(new THREE.BoxGeometry(.025, .55, .025), t.rail, x, ry + .275, z), bar = (w, d, x, z) => [.55, .28].forEach(h => put(new THREE.BoxGeometry(w, .016, d), t.rail, x, ry + h, z));
    for (let z = z0; z <= z1 + .01; z += .6) [-1, 1].forEach(sx => post(sx * x0, z));
    for (let x = -x0; x <= x0 + .01; x += .6) post(x, z1);
    [-1, 1].forEach(sx => bar(.016, z1 - z0, sx * x0, (z0 + z1) / 2)); bar(2 * x0, .016, 0, z1); }
  { // the whole mid-section (deckhouse, bridge, tower, mast, funnels, all their detail) drawn MID_SCALE times bigger about the deckhouse's footing; the guard rails below stay as they are
    const pivot = new THREE.Vector3(0, D, .7), mid = new THREE.Group(); mid.name = 'midSection'; mid.position.copy(pivot); mid.scale.set(MID_SCALE * MID_WIDEN, MID_SCALE, MID_SCALE);
    hull.children.slice(midStart).forEach(o => { o.position.sub(pivot); mid.add(o); }); hull.add(mid);
  }
  const railGeos = [], railAt = (z, sg) => new THREE.Vector3(sg * (halfW(z, deckY(z) - .05) - .12), deckY(z), deckZ(z));
  const addBox = (w, h, d, at, yaw = 0) => { const g = new THREE.BoxGeometry(w, h, d); g.applyMatrix4(new THREE.Matrix4().compose(at, new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw), new THREE.Vector3(1, 1, 1))); railGeos.push(g); };
  [-1, 1].forEach(sg => { for (let z = -18.5; z < 20.8; z += .6) {                                        // guard rails along both deck edges: posts and two rails
    const a = railAt(z, sg), b = railAt(Math.min(z + .6, 20.8), sg), mid = a.clone().add(b).multiplyScalar(.5), len = a.distanceTo(b), yaw = Math.atan2(b.x - a.x, b.z - a.z);
    addBox(.025, .72, .025, a.clone().setY(a.y + .36)); [.72, .38, .05].forEach(h => addBox(.016, .016, len, mid.clone().setY(mid.y + h), yaw));
  } });
  { const zr = 20.8, hw = halfW(zr, deckY(zr) - .05) - .12, a = railAt(zr, 1), n = Math.ceil(2 * hw / .6);                // stern rail across the transom
    for (let i = 0; i <= n; i++) addBox(.025, .72, .025, new THREE.Vector3(-hw + 2 * hw * i / n, a.y + .36, a.z));
    [.72, .38, .05].forEach(h => addBox(2 * hw, .016, .016, new THREE.Vector3(0, a.y + h, a.z))); }
  const rails = new THREE.Mesh(BufferGeometryUtils.mergeBufferGeometries(railGeos), t.rail); rails.castShadow = true; hull.add(rails);
  // two raked funnels behind the tower
  [3.5, 4.8].forEach(z => { put(frust(1.7, 1.0, 1.3, .8, 1.0, .12), t.sup, 0, L1 + .06, z); put(new THREE.BoxGeometry(1.0, .06, .55), t.dark, 0, L1 + 1.1, z + .12); });

  // ---- deck fittings (not part of the scaled mid-section): bollards, mushroom vents, hatches, life rings, a davit and a stern flagstaff
  { const at = (z, x, up = 0) => new THREE.Vector3(x, deckY(z) + up, deckZ(z)), edge = (z, sg, inset = .35) => halfW(z, deckY(z) - .05) - inset;
    [-17, -6, 5.5, 13, 19].forEach(z => [-1, 1].forEach(sg => {                                                // mooring bollards along both edges
      const p = at(z, sg * edge(z, sg)); add(hull, new THREE.CylinderGeometry(.11, .14, .34, 10), t.dark, p.x, p.y + .17, p.z); add(hull, new THREE.CylinderGeometry(.18, .18, .07, 10), t.frame, p.x, p.y + .36, p.z);
      add(hull, new THREE.BoxGeometry(.5, .05, .22), t.frame, p.x, p.y + .03, p.z);                           // base plate
    }));
    [[-12, 2.3], [-6.3, -2.5], [13.2, -2.0], [16.6, 2.4], [-12, -2.3]].forEach(([z, x]) => {                  // mushroom ventilators
      const p = at(z, x); add(hull, new THREE.CylinderGeometry(.12, .15, .5, 10), t.frame, p.x, p.y + .25, p.z); add(hull, new THREE.CylinderGeometry(.34, .1, .16, 12), t.trim, p.x, p.y + .55, p.z); add(hull, new THREE.CylinderGeometry(.36, .36, .03, 12), t.dark, p.x, p.y + .64, p.z);
    });
    [[13.4, 1.6, .9, .8], [13.4, -1.6, .9, .8], [6.8, 2.5, .6, .7]].forEach(([z, x, w, d]) => {                       // deck hatches with raised coamings
      const p = at(z, x); add(hull, new THREE.BoxGeometry(w + .14, .09, d + .14), t.frame, p.x, p.y + .045, p.z); add(hull, new THREE.BoxGeometry(w, .05, d), t.lid, p.x, p.y + .1, p.z);
      add(hull, new THREE.BoxGeometry(.3, .02, .06), t.dark, p.x, p.y + .13, p.z);                              // its recessed handle
    });
    [-1, 1].forEach(sg => { const z = -16.2, p = at(z, sg * edge(z, sg, .55)); for (let k = 0; k < 4; k++) {  // life rings hung on the rails
      const rz = z + 6 * k + (sg > 0 ? 1.5 : -1), q = at(rz, sg * (edge(rz, sg, .1) + .02)); add(hull, new THREE.TorusGeometry(.22, .052, 8, 16), t.ring, q.x, q.y + .5, q.z).rotation.y = PI / 2; } });
    { const p = at(14.6, -2.35);                                                                               // a small davit crane on the port quarter
      add(hull, new THREE.CylinderGeometry(.1, .14, 1.9, 8), t.frame, p.x, p.y + .95, p.z); add(hull, new THREE.CylinderGeometry(.2, .2, .1, 10), t.dark, p.x, p.y + .05, p.z);
      const jib = add(hull, new THREE.CylinderGeometry(.05, .07, 1.7, 6), t.frame, p.x + .5, p.y + 2.0, p.z); jib.rotation.z = -1.25;
      add(hull, new THREE.CylinderGeometry(.015, .015, 1.2, 4), t.dark, p.x + 1.2, p.y + 1.55, p.z); add(hull, new THREE.SphereGeometry(.07, 8, 6), t.dark, p.x + 1.2, p.y + .9, p.z); }
    { const p = at(-20.3, 0);                                                                                 // jackstaff at the bow, raked forward
      const j = add(hull, new THREE.CylinderGeometry(.025, .04, 1.5, 6), t.rail, p.x, p.y + .7, p.z + .12); j.rotation.x = -.3; add(hull, new THREE.SphereGeometry(.05, 8, 6), t.trim, p.x, p.y + 1.43, p.z - .1); }
    { const p = at(20.4, 0);                                                                                   // stern flagstaff
      add(hull, new THREE.CylinderGeometry(.035, .05, 2.4, 6), t.rail, p.x, p.y + 1.2, p.z); add(hull, new THREE.SphereGeometry(.07, 8, 6), t.trim, p.x, p.y + 2.43, p.z);
      } }

  // hull number on the bow
  [-1, 1].forEach(sg => {
    const d = decal(2.2, .8, (x, w, h) => { x.fillStyle = 'rgba(236,236,226,.95)'; x.font = 'bold 190px Impact,"Arial Black",sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('172', w / 2, h / 2); });
    const p = hp(-11.5, 1.6, sg), n = hullN(-11.5, 1.6, sg); d.position.copy(p).addScaledVector(n, .02); d.lookAt(p.clone().add(n)); hull.add(d);
  });

  // ---- gun turrets: faceted stealth turret with a single barrel; one on the foredeck, one on the afterdeck
  const buildGun = (name, zNom, barrelName, muzzleName) => {
    const gy = deckY(zNom), gzw = deckZ(zNom);
    add(hull, new THREE.CylinderGeometry(1.05, 1.15, .3, 28), t.frame, 0, gy + .1, gzw);
    const gun = new THREE.Group(); gun.name = name; gun.position.set(0, gy + .25, gzw); hull.add(gun);
    add(gun, frust(2.1, 2.6, 1.6, 2.0, .95, .1), t.turret, 0, 0, 0);
    add(gun, frust(1.6, 2.0, 1.2, 1.5, .25, .1), t.turret, 0, .95, .1);
    add(gun, new THREE.BoxGeometry(.8, .55, .5), t.frame, 0, .55, -1.2);                      // mantlet
    const bar = new THREE.Group(); bar.name = barrelName; bar.position.set(0, .6, -1.45); gun.add(bar);
    add(bar, new THREE.CylinderGeometry(.16, .16, 1.0, 14), t.dark, 0, 0, -.1).rotation.x = PI / 2;      // sleeve
    add(bar, new THREE.CylinderGeometry(.11, .11, 3.2, 12), t.frame, 0, 0, -1.6).rotation.x = PI / 2;    // barrel
    add(bar, new THREE.CylinderGeometry(.16, .16, .36, 12), t.dark, 0, 0, -3.3).rotation.x = PI / 2;     // muzzle brake
    const mz = new THREE.Object3D(); mz.name = muzzleName; mz.position.set(0, 0, -3.5); bar.add(mz);
    // detail: bolts round the ring, chamfer plates, a roof hatch and sensor, rear louvres and bustle, a gaiter and ribs on the barrel
    for (let i = 0; i < 16; i++) { const a = i / 16 * PI * 2; add(hull, new THREE.CylinderGeometry(.04, .04, .05, 6), t.dark, Math.sin(a) * 1.0, gy + .27, gzw + Math.cos(a) * 1.0).castShadow = false; }
    [-1, 1].forEach(sx => {
      const pl = add(gun, new THREE.BoxGeometry(.08, .75, 1.2), t.trim, sx * .98, .45, -.45); pl.rotation.y = sx * .45;      // faceted chamfer plates at the front corners
      add(gun, new THREE.BoxGeometry(.06, .5, .9), t.frame, sx * 1.04, .4, .55);                                          // side access panels
      add(gun, new THREE.BoxGeometry(.04, .12, .3), t.dark, sx * 1.07, .45, .55);                                          // with a vent slot
    });
    add(gun, new THREE.BoxGeometry(.55, .05, .55), t.trim, -.35, 1.22, .4); add(gun, new THREE.BoxGeometry(.3, .04, .05), t.frame, -.35, 1.26, .4);     // roof hatch and its handle
    add(gun, new THREE.CylinderGeometry(.09, .12, .22, 10), t.frame, .5, 1.3, -.05); add(gun, new THREE.SphereGeometry(.12, 10, 8), t.dark, .5, 1.45, -.05);     // sensor ball on a stub
    add(gun, new THREE.CylinderGeometry(.012, .012, .8, 4), t.dark, -.6, 1.6, .7);                                         // whip aerial
    for (let i = 0; i < 5; i++) add(gun, new THREE.BoxGeometry(.9, .045, .04), t.dark, 0, .2 + i * .13, 1.3 + i * .015);   // rear louvres
    add(gun, new THREE.BoxGeometry(1.3, .55, .6), t.sup, 0, .5, 1.5); add(gun, new THREE.BoxGeometry(1.36, .05, .66), t.trim, 0, .8, 1.5);                 // rear bustle with a lip
    add(bar, new THREE.CylinderGeometry(.3, .26, .5, 14), t.dark, 0, 0, .15).rotation.x = PI / 2;                          // gaiter round the barrel's root
    [-.9, -1.4, -1.9].forEach(z => add(bar, new THREE.CylinderGeometry(.14, .14, .08, 12), t.trim, 0, 0, z).rotation.x = PI / 2);   // thermal-sleeve ribs
    add(bar, new THREE.CylinderGeometry(.16, .16, .55, 12), t.frame, 0, 0, -2.45).rotation.x = PI / 2;                      // bore evacuator
    [-3.22, -3.38].forEach(z => add(bar, new THREE.CylinderGeometry(.175, .175, .04, 12), t.dark, 0, 0, z).rotation.x = PI / 2);   // muzzle-brake slots
  };
  buildGun('gun', -14.6, 'gunBarrel', 'gunMuzzle');
  buildGun('gunAft', 16.5, 'gunAftBarrel', 'gunAftMuzzle');

  const holes = []; // the deck's cut-outs over the launchers: [x, z] of each opening's centre
  // ---- vertical launchers: four single-cell launchers, a pair across the deck (port and starboard) forward and another aft, each with its own lid, lids closed by default
  [[-1, -9], [1, -9], [-1, 10], [1, 10]].forEach(([sx, zc], n) => {
    const U = new THREE.Group(); U.name = 'vls' + n; U.position.set(sx * 1.3, deckY(zc), deckZ(zc)); U.scale.setScalar(.738); hull.add(U);
    // a low plinth and rim round a real shaft: the deck is cut away over the cell (the deck material discards its pixels there, see below), a dark liner with ledges runs down to a floor
    const HI = .92;                                                                           // half-size of the opening, in the unit's own scale
    [-1, 1].forEach(e => {
      add(U, new THREE.BoxGeometry(2.2, .5, .18), t.frame, 0, -.1, e * (HI + .09)); add(U, new THREE.BoxGeometry(.18, .5, 2 * HI), t.frame, e * (HI + .09), -.1, 0);      // plinth ring, top at y = .15
      add(U, new THREE.BoxGeometry(2.34, .06, .25), t.trim, 0, .175, e * (HI + .125)); add(U, new THREE.BoxGeometry(.25, .06, 2 * HI), t.trim, e * (HI + .125), .175, 0); // rim, top at y = .205
      add(U, new THREE.BoxGeometry(2 * HI, 2.75, .02), t.dark, 0, -1.225, e * (HI - .01)).castShadow = false; add(U, new THREE.BoxGeometry(.02, 2.75, 2 * HI - .04), t.dark, e * (HI - .01), -1.225, 0).castShadow = false;  // liner, down to y = -2.6
      [-.5, -1.2, -1.9].forEach(y => { add(U, new THREE.BoxGeometry(2 * HI - .04, .04, .05), t.frame, 0, y, e * (HI - .045)).castShadow = false; add(U, new THREE.BoxGeometry(.05, .04, 2 * HI - .14), t.frame, e * (HI - .045), y, 0).castShadow = false; });   // ledges
    });
    add(U, new THREE.BoxGeometry(2 * HI, .04, 2 * HI), t.dark, 0, -2.62, 0).castShadow = false;                            // floor
    [[-1, -1], [-1, 1], [1, -1], [1, 1]].forEach(([a, b]) => add(U, new THREE.BoxGeometry(.34, .008, .1), t.hazard, a * 1.0, .212, b * 1.03).castShadow = false);     // yellow corner marks on the rim
    holes.push([U.position.x, U.position.z]);
    const rack = new THREE.Group(); rack.name = `vls${n}_rack`; U.add(rack);
    const lid = new THREE.Group(); lid.name = `vls${n}_lid0`; lid.position.set(sx * .94, .26, 0); U.add(lid);   // hinge on the outboard edge
    add(lid, new THREE.BoxGeometry(1.92, .07, 1.92), t.lid, -sx * .96, 0, 0);
    const lc = -sx * .96;                                                                                       // lid detail: raised border, cross ribs, bolts, a lifting lug, hinge barrel and brackets, a dark underside
    [-1, 1].forEach(e => { add(lid, new THREE.BoxGeometry(1.92, .045, .06), t.trim, lc, .055, e * .93); add(lid, new THREE.BoxGeometry(.06, .045, 1.8), t.trim, lc + e * .93, .055, 0); });
    add(lid, new THREE.BoxGeometry(1.5, .025, .06), t.frame, lc, .075, 0); add(lid, new THREE.BoxGeometry(.06, .025, 1.5), t.frame, lc, .075, 0);
    [-1, 1].forEach(a => [-1, 1].forEach(b => add(lid, new THREE.CylinderGeometry(.055, .055, .03, 8), t.dark, lc + a * .66, .08, b * .66).castShadow = false));
    add(lid, new THREE.BoxGeometry(.14, .07, .4), t.rail, -sx * 1.72, .1, 0);
    add(lid, new THREE.CylinderGeometry(.075, .075, 1.9, 8), t.frame, 0, .03, 0).rotation.x = PI / 2;
    [-.7, 0, .7].forEach(z => add(lid, new THREE.BoxGeometry(.2, .1, .14), t.dark, -sx * .06, .01, z));
    add(lid, new THREE.BoxGeometry(1.8, .02, 1.8), t.dark, lc, -.05, 0).castShadow = false;
    add(lid, new THREE.BoxGeometry(1.46, .016, 1.46), t.trim, -sx * .96, .045, 0);
    const m = buildMissile(); m.name = `vls${n}_missile0`; m.scale.setScalar(1.6 / .738); m.rotation.x = PI / 2; m.position.set(0, -1.3 / .9, 0); rack.add(m);   // the very missile that is fired (submarine.js, drawn 1.6 times over as in statues.js), allowing for the unit's own .738 scale
    const o = new THREE.Object3D(); o.name = `vls${n}_muzzle0`; o.position.set(0, .26, 0); o.rotation.x = PI / 2; U.add(o);
  });

  // The deck is one flat sheet: its pixels are discarded over each launcher's opening (like the road over the hidden turrets), so the shaft below is real.
  // ---- painted deck markings: edge line, walkway lines beside the deckhouse, safety boxes round the launchers, gun danger rings
  {
    const X0 = -3.4, X1 = 3.4, Z0 = -22, Z1 = 22, PX = 80, cw = Math.round((X1 - X0) * PX), ch = Math.round((Z1 - Z0) * PX);
    const c = document.createElement('canvas'); c.width = cw; c.height = ch; const x = c.getContext('2d');
    const u = X => (X - X0) * PX, v = Z => (Z - Z0) * PX, line = (X, Z, X2, Z2) => { x.beginPath(); x.moveTo(u(X), v(Z)); x.lineTo(u(X2), v(Z2)); x.stroke(); };
    const WHITE = 'rgba(224,226,218,.8)', YEL = 'rgba(214,174,40,.9)';
    x.lineCap = 'butt'; x.strokeStyle = WHITE; x.lineWidth = .09 * PX;
    for (const sg of [-1, 1]) { x.beginPath();                                                    // deck-edge line, following the hull
      for (let z = -19.5; z <= 20.5; z += .5) { const X = sg * (prof(z).wd - .32), Z = shearZ(z, deckY(z)); z < -19.4 ? x.moveTo(u(X), v(Z)) : x.lineTo(u(X), v(Z)); } x.stroke(); }
    x.lineWidth = .08 * PX; for (const sg of [-1, 1]) line(sg * 2.75, deckZ(-4.4), sg * 2.75, deckZ(5.8));   // walkway lines along the deckhouse
    x.strokeStyle = YEL; x.lineWidth = .1 * PX;
    for (const [hx, hz] of holes) { const L = 1.12; x.strokeRect(u(hx - L), v(hz - L), 2 * L * PX, 2 * L * PX); }   // safety boxes round the launchers
    x.setLineDash([.28 * PX, .28 * PX]); x.lineWidth = .16 * PX;
    for (const zn of [-14.6, 16.5]) { x.beginPath(); x.arc(u(0), v(deckZ(zn)), 1.75 * PX, 0, PI * 2); x.stroke(); }  // gun danger rings
    x.setLineDash([]); x.strokeStyle = WHITE; x.lineWidth = .06 * PX;
    for (const zn of [-14.6, 16.5]) for (let a = 0; a < 360; a += 30) { const r = a * PI / 180, X = Math.sin(r), Z = -Math.cos(r); line(X * 1.95, deckZ(zn) + Z * 1.95, X * 2.15, deckZ(zn) + Z * 2.15); } // training marks
    const tex = canvasTexture(c, 1, 1); tex.anisotropy = 8;
    const g = deckGeo(); const uvs = g.attributes.uv, ps = g.attributes.position; for (let i = 0; i < ps.count; i++) uvs.setXY(i, (ps.getX(i) - X0) / (X1 - X0), 1 - (ps.getZ(i) - Z0) / (Z1 - Z0));
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: .9, metalness: 0, envMapIntensity: .2, polygonOffset: true, polygonOffsetFactor: -2, depthWrite: false }));
    m.material.userData.noReflect = true; m.position.y = .01; m.receiveShadow = true; hull.add(m);
  }

  const HOLE = .92 * .738, cut = holes.map(([x, z]) => `vec2(${x.toFixed(4)}, ${z.toFixed(4)})`).join(', ');
  t.deck.onBeforeCompile = sh => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vDeckXZ;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvDeckXZ = position.xz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>\nvarying vec2 vDeckXZ;\nconst vec2 DECK_HOLES[${holes.length}] = vec2[${holes.length}](${cut});`)
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>\nfor (int i = 0; i < ${holes.length}; i++) { vec2 d = abs(vDeckXZ - DECK_HOLES[i]); if (max(d.x, d.y) < ${HOLE.toFixed(4)}) discard; }`);
  };
  t.deck.customProgramCacheKey = () => 'shipDeckHoles';
  t.deck.needsUpdate = true;

  poseWarship(root);
  return root;
}

// open = 0 closed .. 1 lid open and missile raised, ready to fire (lid first, then the missile rises). Each launcher is one cell: open them one at a time.
export function poseVls(root, index, open) {
  const k = Math.min(1, Math.max(0, open)), lid = root.getObjectByName(`vls${index}_lid0`);
  lid.rotation.z = (index & 1 ? -1 : 1) * smooth(k / .45) * 1.7;
  root.getObjectByName(`vls${index}_rack`).position.y = smooth((k - .45) / .55) * 2.05 / .9;
}
// which = 'gun' (foredeck, default) or 'gunAft'. yaw is in the ship's frame: 0 = ahead, PI = astern. pitch raises the barrel.
export function aimGun(root, yaw = 0, pitch = 0, which = 'gun') {
  root.getObjectByName(which).rotation.y = yaw;
  root.getObjectByName(which === 'gun' ? 'gunBarrel' : 'gunAftBarrel').rotation.x = pitch;
}
export function poseWarship(root) { for (let i = 0; i < 4; i++) poseVls(root, i, 0); aimGun(root, 0, 0); aimGun(root, PI, 0, 'gunAft'); }
