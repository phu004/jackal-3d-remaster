// The props of the second summit's plateau, the boss arena: a radio outpost (textured concrete, door and windows with frames, pipes, vents, a generator, a lean-to, a lattice mast with a lamp, a dish), big rock outcrops (layered rock, thick snow, drifts at the foot, icicle curtains)
// and ice crystal formations (tall, faceted spires on a rocky mound, glowing from within), and a frozen patch.
// Vertices carry their own colour (snow on whatever faces up, the rock's own colour on whatever faces away), so a snowy prop is a mesh or two, not a coated copy of each part.
// buildSummitArena(cfg, heightAt) returns { group, boxes }: the group to add to the scene, and the boxes (x, z, hw, hd, kind) that block the jeep.
// cfg: { outpost: { x, z, rot }, rocks: [{ x, z, r, h, seed }], crystals: [{ x, z, n, seed, size }], ice: { x, z, r } }.
import * as THREE from 'three';
import { REFLECT, UNDERWATER } from '../game/layers.js';
import { BufferGeometryUtils } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const rng = seed => { let s = (seed * 9301 + 49297) % 233280 || 1; return () => (s = (s * 16807) % 2147483647) / 2147483647; };
const hash3 = (x, y, z) => { const q = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return q - Math.floor(q); };
const vnoise = (x, y, z) => { const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z), fx = x - ix, fy = y - iy, fz = z - iz, s = t => t * t * (3 - 2 * t), l = (a, b, t) => a + (b - a) * t;
  const h = (a, b, c) => hash3(ix + a, iy + b, iz + c);
  return l(l(l(h(0, 0, 0), h(1, 0, 0), s(fx)), l(h(0, 1, 0), h(1, 1, 0), s(fx)), s(fy)), l(l(h(0, 0, 1), h(1, 0, 1), s(fx)), l(h(0, 1, 1), h(1, 1, 1), s(fx)), s(fy)), s(fz)); };
const SNOW = new THREE.Color(0xf4f8fc), SNOW_SHADE = new THREE.Color(0xc4d2e4);
const M = (x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));

// A pile of parts, each placed by a matrix and coloured by face: `base` on faces that look sideways or down, snow on faces that look up (`snowK`: 0 none .. 1 a thick cover: snow down to steep faces).
class Parts {
  constructor() { this.list = []; }
  add(geo, at, base, snowK = .8, seed = 1) {
    const g = geo.index ? geo.toNonIndexed() : geo.clone(); g.applyMatrix4(at); g.computeVertexNormals();
    const pos = g.attributes.position, nor = g.attributes.normal, col = new Float32Array(pos.count * 3), c = new THREE.Color(), pal = Array.isArray(base) ? base.map(h => new THREE.Color(h)) : null, b = pal ? null : new THREE.Color(base); // (base may be a palette: camouflage, patches of each colour by a noise of where the face is)
    for (let i = 0; i < pos.count; i += 3) {
      const ny = (nor.getY(i) + nor.getY(i + 1) + nor.getY(i + 2)) / 3, mx = (pos.getX(i) + pos.getX(i + 1) + pos.getX(i + 2)) / 3, my = (pos.getY(i) + pos.getY(i + 1) + pos.getY(i + 2)) / 3, mz = (pos.getZ(i) + pos.getZ(i + 1) + pos.getZ(i + 2)) / 3;
      const n = vnoise(mx * 2.3 + seed, my * 2.3, mz * 2.3), n2 = hash3(mx * 9 + seed, my * 9, mz * 9);
      const s = THREE.MathUtils.smoothstep(ny + (n - .5) * .5, .58 - snowK * .42, .82 - snowK * .42);
      c.copy(pal ? pal[Math.min(pal.length - 1, Math.floor(vnoise(mx * 1.5 + seed, my * 1.5, mz * 1.5) * pal.length * 1.15))] : b).multiplyScalar(.7 + .5 * n + .12 * n2).lerp(SNOW_SHADE, s * .4).lerp(SNOW, s * .9 * (.82 + .18 * n2));
      for (let k = 0; k < 3; k++) { col[(i + k) * 3] = c.r; col[(i + k) * 3 + 1] = c.g; col[(i + k) * 3 + 2] = c.b; }
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3)); for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'color') g.deleteAttribute(k);
    this.list.push(g); return this;
  }
  mesh(mat, cast = true) { const m = new THREE.Mesh(BufferGeometryUtils.mergeBufferGeometries(this.list), mat); m.castShadow = cast; m.receiveShadow = true; return m; }
}
let rockMat = null, metalMat = null, iceMat = null, crystalMat = null, concreteMat = null;
const mats = () => {
  rockMat ??= new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: .96 });
  metalMat ??= new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: .6, metalness: .3 });
  iceMat ??= new THREE.MeshStandardMaterial({ color: 0xd4ecf8, emissive: 0x28506a, emissiveIntensity: .4, roughness: .2, flatShading: true });
  crystalMat ??= new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: .1, metalness: .05, emissive: 0x2a8ab5, emissiveIntensity: .55, transparent: true, opacity: .9 });
};
const icicle = (g, x, y, z, len, w) => g.add(new THREE.ConeGeometry(w, len, 5), M(x, y - len / 2, z, Math.PI, 0, 0), 0xd2e8f4, 0);   // (a cone hanging point down)

// A lump of rock: an icosahedron pushed about by layered noise (ridges and horizontal strata), flat at the foot; `r` wide, `h` tall.
function lump(seed, detail = 3) {
  const g = new THREE.IcosahedronGeometry(1, detail), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), n1 = vnoise(x * 1.6 + seed, y * 1.6, z * 1.6), n2 = vnoise(x * 3.9 + seed * 2, y * 3.9, z * 3.9), n3 = vnoise(x * 9 + seed * 3, y * 9, z * 9);
    const ridge = 1 - Math.abs(n2 * 2 - 1), strata = Math.sin(y * 7.5 + n1 * 3 + seed) * .05, k = 1 + (n1 - .5) * .62 + ridge * .22 + (n3 - .5) * .09 + strata;
    p.setXYZ(i, x * k, Math.max(y * k + (ridge - .4) * .07, -.3), z * k);
  }
  return g;
}
// A rock outcrop: a main mass, a shoulder, a leaning slab and boulders round the foot; thick snow on every top, drifts piled at the foot, and curtains of icicles hanging from the ledges.
function rock(seed, r, h) {
  const rn = rng(seed), g = new Parts(), main = lump(seed, 3), side = lump(seed + 1, 2), slab = lump(seed + 2, 2);
  g.add(main, M(0, h * .3, 0, 0, rn() * 6.28, 0, r, h, r * (.78 + rn() * .3)), 0x5a606a, 1, seed);
  g.add(side, M(r * .85 * (rn() < .5 ? -1 : 1), h * .16, r * .3, 0, rn() * 6.28, 0, r * .62, h * .62, r * .55), 0x666b73, 1, seed + 5);
  g.add(slab, M(-r * .3, h * .62, -r * .5, .35 * (rn() - .5), rn() * 6.28, .4 * (rn() - .5), r * .5, h * .38, r * .42), 0x4f555e, 1, seed + 9);
  for (let i = 0; i < 4; i++) { const a = rn() * 6.28, d = r * (1.0 + rn() * .5), s = r * (.16 + rn() * .2); g.add(side, M(Math.cos(a) * d, s * .3, Math.sin(a) * d, 0, rn() * 6.28, 0, s * 1.2, s * .85, s), 0x666b73, 1, seed + 20 + i); } // (boulders at the foot)
  for (let i = 0; i < 6; i++) { const a = rn() * 6.28, d = r * (.8 + rn() * .5); g.add(side, M(Math.cos(a) * d, 0, Math.sin(a) * d, 0, rn() * 6.28, 0, r * (.35 + rn() * .3), .32 + rn() * .3, r * (.3 + rn() * .25)), 0xdfe7f0, 1, seed + 40 + i); } // (drifts)
  const ic = new Parts(); for (let i = 0; i < 16; i++) { const a = rn() * 6.28, d = r * (.7 + rn() * .3); icicle(ic, Math.cos(a) * d, h * (.25 + rn() * .5), Math.sin(a) * d * .8, .6 + rn() * 1.7, .06 + rn() * .1); }
  const grp = new THREE.Group(); grp.add(g.mesh(rockMat)); grp.add(ic.mesh(iceMat, false)); return grp;
}

// An ice crystal formation: a tall central spire and a ring of leaning ones, each a six-sided shaft with faceted, slightly irregular sides and a sharp, multi-faced point, pale frosted at the foot and cyan toward the tip, standing in a mound of rock and snow with shards lying round it.
function crystals(seed, n, size) {
  const rn = rng(seed), list = [], tip = new THREE.Color(0x5fd0f0), foot = new THREE.Color(0xe6f6ff), cc = new THREE.Color();
  const spire = (a, d, w, len, lean, spin) => {
    const sh = new THREE.CylinderGeometry(w * .35, w, len, 6, 3), p = sh.attributes.position;
    for (let i = 0; i < p.count; i++) { const k = .86 + hash3(Math.round(p.getX(i) * 5) + seed + a, Math.round(p.getY(i) * 2), Math.round(p.getZ(i) * 5)) * .28; p.setX(i, p.getX(i) * k); p.setZ(i, p.getZ(i) * k); }
    const pt = new THREE.ConeGeometry(w * .36, len * .32, 6, 1); pt.translate(0, len * .66, 0); const pp = pt.attributes.position; for (let i = 0; i < pp.count; i++) if (pp.getY(i) > len * .7) pp.setX(i, pp.getX(i) + w * .12);
    const parts = [sh, pt].map(q => { const t = q.index ? q.toNonIndexed() : q; t.deleteAttribute('uv'); return t; }), m = BufferGeometryUtils.mergeBufferGeometries(parts);
    m.applyMatrix4(M(Math.cos(a) * d, len * .5 - .15, Math.sin(a) * d, Math.sin(a) * lean, spin, -Math.cos(a) * lean)); m.computeVertexNormals();
    const q = m.attributes.position, col = new Float32Array(q.count * 3), y0 = -.15, y1 = len * 1.05 + 0;
    for (let i = 0; i < q.count; i++) { const t = THREE.MathUtils.clamp((q.getY(i) - y0) / y1, 0, 1); cc.copy(foot).lerp(tip, Math.pow(t, .8)); col[i * 3] = cc.r; col[i * 3 + 1] = cc.g; col[i * 3 + 2] = cc.b; }
    m.setAttribute('color', new THREE.BufferAttribute(col, 3)); list.push(m);
  };
  spire(0, 0, .9 * size, 6.8 * size, .05, rn() * 6.28);
  for (let i = 1; i < n; i++) { const a = rn() * 6.28 + i, big = i < 4; spire(a, (big ? .9 : 1.3) * size + rn() * 1.0 * size, (big ? .55 : .26) * size * (.8 + rn() * .5), (big ? 3.6 : 1.4) * size * (.75 + rn() * .7), .14 + rn() * .38, rn() * 6.28); }
  const grp = new THREE.Group(), m = new THREE.Mesh(BufferGeometryUtils.mergeBufferGeometries(list), crystalMat); m.castShadow = true; m.receiveShadow = false; grp.add(m);
  const base = new Parts(), lm = lump(seed + 3, 2); // the mound the crystals stand in, and snow banked round it
  base.add(lm, M(0, .2 * size, 0, 0, rn() * 6.28, 0, 2.3 * size, .75 * size, 2.0 * size), 0x5e646d, 1, seed);
  for (let i = 0; i < 5; i++) { const a = rn() * 6.28, d = 2.2 * size * (.8 + rn() * .5), s = .5 * size * (.6 + rn() * .6); base.add(lm, M(Math.cos(a) * d, s * .15, Math.sin(a) * d, 0, rn() * 6.28, 0, s * 1.3, s * .6, s), 0x686e76, 1, seed + 11 + i); }
  for (let i = 0; i < 6; i++) { const a = rn() * 6.28, d = 2.0 * size + rn() * 1.5 * size; base.add(new THREE.ConeGeometry(.12 * size, .9 * size, 5), M(Math.cos(a) * d, .1, Math.sin(a) * d, Math.PI / 2 + (rn() - .5) * .5, 0, rn() * 6.28), 0xcfeaf7, .2, seed + 30 + i); } // (broken shards lying on the snow)
  grp.add(base.mesh(rockMat)); return grp;
}

// Concrete: panel seams, bolts, rust runs under them, stains, snow-melt streaks, a stencilled mark; one picture for each face of a wall.
function concreteTexture() {
  const W = 1024, H = 512, c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d'), rn = rng(31);
  x.fillStyle = '#8c9297'; x.fillRect(0, 0, W, H);
  for (let i = 0; i < 6000; i++) { const v = 100 + rn() * 80 | 0; x.fillStyle = `rgba(${v},${v + 3},${v + 6},${.05 + rn() * .12})`; x.fillRect(rn() * W, rn() * H, 1 + rn() * 4, 1 + rn() * 3); }
  x.strokeStyle = 'rgba(40,44,48,.7)'; x.lineWidth = 3; for (let i = 1; i < 4; i++) { x.beginPath(); x.moveTo(0, i * H / 4); x.lineTo(W, i * H / 4); x.stroke(); } for (let i = 1; i < 8; i++) { x.beginPath(); x.moveTo(i * W / 8, 0); x.lineTo(i * W / 8, H); x.stroke(); }
  for (let j = 0; j < 4; j++) for (let i = 0; i < 8; i++) for (const [dx, dy] of [[10, 10], [W / 8 - 10, 10], [10, H / 4 - 10], [W / 8 - 10, H / 4 - 10]]) {
    const bx = i * W / 8 + dx, by = j * H / 4 + dy; x.fillStyle = 'rgba(52,56,60,.9)'; x.beginPath(); x.arc(bx, by, 3.2, 0, 6.28); x.fill();
    if (rn() < .5) { const g = x.createLinearGradient(0, by, 0, by + 40 + rn() * 50); g.addColorStop(0, 'rgba(150,86,40,.55)'); g.addColorStop(1, 'rgba(150,86,40,0)'); x.fillStyle = g; x.fillRect(bx - 2, by, 4 + rn() * 3, 90); }
  }
  for (let i = 0; i < 22; i++) { const px = rn() * W, g = x.createLinearGradient(0, 0, 0, H); g.addColorStop(0, 'rgba(60,64,66,0)'); g.addColorStop(1, `rgba(52,56,58,${.12 + rn() * .2})`); x.fillStyle = g; x.fillRect(px, 0, 6 + rn() * 26, H); } // (dirty streaks running down)
  const gr = x.createLinearGradient(0, H * .6, 0, H); gr.addColorStop(0, 'rgba(40,44,46,0)'); gr.addColorStop(1, 'rgba(36,40,42,.55)'); x.fillStyle = gr; x.fillRect(0, H * .6, W, H * .4); // (grime at the foot)
  const t = new THREE.CanvasTexture(c); t.anisotropy = 4; return t;
}
// A window pane, 128 x 104 px for a 0.95 x 0.78 m pane: lit (a warm room: a curtain pulled back, a shelf with a radio set, a desk lamp, the glow brightest in the middle, frost creeping in from the corners and a sprinkle of condensation) or dark (a faint sky reflection, the same frost).
function paneTexture(lit) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 208; const x = c.getContext('2d'), W = 256, H = 208, rn = rng(lit ? 3 : 4);
  if (lit === 'frost') { /* (only the frost, on clear glass) */ } else if (lit) {
    const g = x.createRadialGradient(W * .5, H * .55, 10, W * .5, H * .55, W * .62); g.addColorStop(0, '#ffe2a0'); g.addColorStop(.55, '#ffc268'); g.addColorStop(1, '#d9843a'); x.fillStyle = g; x.fillRect(0, 0, W, H);
    x.fillStyle = 'rgba(120,70,30,.85)'; x.fillRect(0, H * .62, W, H * .38);                                              // the far wall below the window's line of sight: a desk top
    x.fillStyle = 'rgba(60,40,28,.9)'; x.fillRect(W * .5, H * .22, W * .38, H * .34); x.fillStyle = 'rgba(255,214,140,.55)'; for (let i = 0; i < 3; i++) x.fillRect(W * .53, H * .27 + i * 18, W * .3, 8);   // a rack of radio sets with their lit dials
    x.fillStyle = 'rgba(90,255,120,.9)'; x.fillRect(W * .8, H * .3, 5, 5); x.fillStyle = 'rgba(255,70,50,.9)'; x.fillRect(W * .8, H * .42, 5, 5);
    x.fillStyle = 'rgba(40,30,24,.95)'; x.beginPath(); x.moveTo(W * .2, H * .62); x.lineTo(W * .26, H * .42); x.lineTo(W * .33, H * .62); x.fill(); x.fillRect(W * .255, H * .3, 4, H * .14); x.beginPath(); x.ellipse(W * .27, H * .3, 14, 7, -.4, 0, 6.3); x.fill();   // a desk lamp
    x.fillStyle = 'rgba(150,56,40,.9)'; x.beginPath(); x.moveTo(0, 0); x.quadraticCurveTo(W * .26, H * .5, W * .1, H); x.lineTo(0, H); x.fill();   // the curtain, pulled back to the left
    for (let i = 0; i < 6; i++) { x.strokeStyle = 'rgba(90,30,22,.5)'; x.lineWidth = 2; x.beginPath(); x.moveTo(i * 6, 0); x.quadraticCurveTo(i * 6 + 24, H * .5, i * 3 + 6, H); x.stroke(); }
  } else {
    const g = x.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#26303c'); g.addColorStop(1, '#0c1014'); x.fillStyle = g; x.fillRect(0, 0, W, H);
    x.fillStyle = 'rgba(160,190,220,.12)'; x.beginPath(); x.moveTo(0, 0); x.lineTo(W * .55, 0); x.lineTo(W * .2, H); x.lineTo(0, H); x.fill();   // a streak of sky reflected in the glass
    x.fillStyle = 'rgba(8,10,12,.85)'; x.fillRect(W * .62, H * .5, W * .3, H * .5);                                                                // (a blind half down)
  }
  for (const [cx, cy] of [[0, 0], [W, 0], [0, H], [W, H]]) { const fr = x.createRadialGradient(cx, cy, 0, cx, cy, W * .34); fr.addColorStop(0, 'rgba(235,245,255,.92)'); fr.addColorStop(.5, 'rgba(225,238,252,.4)'); fr.addColorStop(1, 'rgba(225,238,252,0)'); x.fillStyle = fr; x.fillRect(0, 0, W, H); }   // frost in the corners
  x.strokeStyle = 'rgba(245,250,255,.55)'; x.lineWidth = 1.2; for (let i = 0; i < 26; i++) { const cx = [0, W][i % 2], cy = [0, H][(i >> 1) % 2]; let px = cx, py = cy; x.beginPath(); x.moveTo(px, py); for (let k = 0; k < 4; k++) { px += (W / 2 - cx) * .07 + (rn() - .5) * 22; py += (H / 2 - cy) * .07 + (rn() - .5) * 22; x.lineTo(px, py); } x.stroke(); }   // (ferns of frost)
  for (let i = 0; i < 40; i++) { x.fillStyle = `rgba(255,255,255,${.1 + rn() * .2})`; x.beginPath(); x.arc(rn() * W, rn() * H, 1 + rn() * 2, 0, 6.3); x.fill(); }   // (condensation)
  const t = new THREE.CanvasTexture(c); t.anisotropy = 4; t.encoding = THREE.sRGBEncoding; return t;
}
function signTexture(text, sub) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 128; const x = c.getContext('2d');
  x.fillStyle = '#d6d0ba'; x.fillRect(0, 0, 512, 128); x.strokeStyle = '#2f2f2b'; x.lineWidth = 6; x.strokeRect(5, 5, 502, 118);
  x.fillStyle = '#26261f'; x.font = 'bold 52px "Courier New", monospace'; x.textAlign = 'center'; x.fillText(text, 256, 58); x.font = 'bold 34px "Courier New", monospace'; x.fillText(sub, 256, 105);
  for (let i = 0; i < 160; i++) { x.fillStyle = `rgba(${90 + Math.random() * 40 | 0},70,40,${.04 + Math.random() * .1})`; x.fillRect(Math.random() * 512, Math.random() * 128, 2 + Math.random() * 5, 2); }
  const t = new THREE.CanvasTexture(c); t.anisotropy = 4; return t;
}

// The roof's snow: a thick blanket laid over the slab as one smooth displaced sheet (not boxes): wind-sculpted swells, fine ripples, a rounded cornice that curls over the eaves, and drifts banked round everything that stands on the roof (spots: [x, z, radius, height]).
function roofSnow(W, D, H, spots) {
  const SX = W / 2 + .75, SZ = D / 2 + .55, STEP = .1, nx = Math.round(SX * 2 / STEP), nz = Math.round(SZ * 2 / STEP), pos = new Float32Array((nx + 1) * (nz + 1) * 3), idx = [];
  const ss = (a, b, t) => { t = Math.min(1, Math.max(0, (t - a) / (b - a))); return t * t * (3 - 2 * t); };
  for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) {
    const x = -SX + i * STEP, z = -SZ + j * STEP, d = Math.min(W / 2 + .3 - Math.abs(x), D / 2 + .3 - Math.abs(z));      // d: how far inside the slab's edge
    let top = H + 1.0 + (vnoise(x * .9, 1, z * .9) - .5) * .42 + (vnoise(x * 3.2, 7, z * 3.2) - .5) * .12 + (vnoise(x * 9, 3, z * 9) - .5) * .035 + Math.sin(x * 1.3 + vnoise(x * .6, 5, z * .6) * 4) * .05;
    for (const [sx, sz, r, h] of spots) { const q = Math.hypot(x - sx, z - sz) / r; if (q < 1.6) top += h * Math.exp(-q * q * 1.6); }   // (drifts piled against what stands on the roof)
    const rim = ss(-.3, .55, d), bulge = Math.exp(-(((d - .32) / .24) ** 2)) * .16;                                          // (the cornice: swells just inside the edge, then curls down past it)
    const y = H + .42 + (top - H - .42) * Math.pow(rim, .6) + bulge * rim;
    const k = (j * (nx + 1) + i) * 3; pos[k] = x; pos[k + 1] = y; pos[k + 2] = z;
  }
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) { const a = j * (nx + 1) + i, b = a + 1, c = a + nx + 1, e = c + 1; idx.push(a, c, b, b, c, e); }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setIndex(idx); geo.computeVertexNormals();
  const nor = geo.attributes.normal, col = new Float32Array(pos.length), c = new THREE.Color();
  for (let v = 0; v < pos.length / 3; v++) {
    const x = pos[v * 3], y = pos[v * 3 + 1], z = pos[v * 3 + 2], ny = nor.getY(v), sp = hash3(Math.floor(x * 38), Math.floor(z * 38), 2), n = vnoise(x * 2.1, 9, z * 2.1);
    c.copy(SNOW_SHADE).lerp(SNOW, THREE.MathUtils.smoothstep(ny, .45, .95) * (.78 + .22 * n)); c.multiplyScalar(.96 + .06 * sp + (y - H) * .02);                    // (blue in the hollows and on the steep sides, bright on the tops; a few glinting grains)
    col[v * 3] = c.r; col[v * 3 + 1] = c.g; col[v * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .98, metalness: 0 })); m.castShadow = true; m.receiveShadow = true; m.name = 'roofSnow'; return m;
}

// A window's room, by interior mapping: no picture of a room but the room itself, worked out in the shader. Each pixel of the pane casts the eye's ray into a box behind the glass (a back wall with a rack of radio sets, a floor of planks, a ceiling lamp, side walls, a desk with a lamp, an operator at his set) and is coloured by what that ray meets first, lit by the lamp, so the parallax is real as the view moves.
const roomVert = `varying vec3 vP; varying vec3 vC;
void main() { vP = position; vec3 cw = cameraPosition - modelMatrix[3].xyz; vC = vec3( dot( cw, modelMatrix[0].xyz ), dot( cw, modelMatrix[1].xyz ), dot( cw, modelMatrix[2].xyz ) ); gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 ); }`;
const roomFrag = `varying vec3 vP; varying vec3 vC; uniform float uLit; uniform vec3 uTint;
float h21( vec2 p ) { return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453 ); }
const float HW = 1.5, YL = -1.1, YH = 1.25, ZB = -3.4;
const vec3 LP = vec3( 0.1, 1.0, -1.7 ), LAMP = vec3( -0.8, -0.28, -2.5 );
float boxHit( vec3 o, vec3 d, vec3 lo, vec3 hi, out vec3 n ) {
  vec3 inv = 1.0 / d, t0 = ( lo - o ) * inv, t1 = ( hi - o ) * inv, tn = min( t0, t1 ), tf = max( t0, t1 );
  float a = max( max( tn.x, tn.y ), tn.z ), b = min( min( tf.x, tf.y ), tf.z );
  n = vec3( 0.0 ); if ( b < 0.0 || a > b ) return -1.0;
  if ( a == tn.x ) n = vec3( -sign( d.x ), 0.0, 0.0 ); else if ( a == tn.y ) n = vec3( 0.0, -sign( d.y ), 0.0 ); else n = vec3( 0.0, 0.0, -sign( d.z ) );
  return a;
}
float ellHit( vec3 o, vec3 d, vec3 c, vec3 r ) { vec3 oo = ( o - c ) / r, dd = d / r; float a = dot( dd, dd ), b = dot( oo, dd ), cc = dot( oo, oo ) - 1.0, k = b * b - a * cc; if ( k < 0.0 ) return -1.0; return ( -b - sqrt( k ) ) / a; }
vec3 light( vec3 p, vec3 base ) { vec3 q = p - LP; float f = 0.22 + 1.9 / ( 1.0 + dot( q, q ) * 0.5 ); return base * f * mix( vec3( 1.0 ), vec3( 1.0, 0.86, 0.62 ), step( 0.5, uLit ) ); }
void main() {
  vec3 o = vP, d = normalize( vP - vC );
  float tx = d.x > 0.0 ? ( HW - o.x ) / d.x : ( d.x < 0.0 ? ( -HW - o.x ) / d.x : 1e9 ), ty = d.y > 0.0 ? ( YH - o.y ) / d.y : ( d.y < 0.0 ? ( YL - o.y ) / d.y : 1e9 ), tz = ( ZB - o.z ) / d.z;
  float t = min( min( tx, ty ), tz ); vec3 p = o + d * t, col;
  if ( t == tz ) { // the back wall: paint, a pinned map on the left, a rack of radio sets on the right
    vec2 uv = vec2( ( p.x + HW ) / ( 2.0 * HW ), ( p.y - YL ) / ( YH - YL ) ); col = vec3( 0.46, 0.52, 0.44 ) * ( 0.8 + 0.2 * h21( floor( uv * 40.0 ) ) );
    if ( uv.y < 0.22 ) col *= 0.6;
    if ( uv.x > 0.08 && uv.x < 0.38 && uv.y > 0.34 && uv.y < 0.8 ) { col = vec3( 0.78, 0.72, 0.56 ); col -= 0.18 * step( 0.9, fract( uv.y * 22.0 ) ) + 0.12 * step( 0.9, fract( uv.x * 26.0 ) ); }
    if ( uv.x > 0.55 && uv.x < 0.95 && uv.y > 0.12 && uv.y < 0.9 ) { vec2 r = vec2( ( uv.x - 0.55 ) / 0.4, ( uv.y - 0.12 ) / 0.78 ), cell = vec2( r.x, fract( r.y * 5.0 ) ); float row = floor( r.y * 5.0 );
      col = vec3( 0.1, 0.11, 0.1 ); if ( cell.y > 0.12 && cell.y < 0.88 ) { col = vec3( 0.16, 0.18, 0.17 ); if ( cell.x > 0.1 && cell.x < 0.55 && cell.y > 0.35 && cell.y < 0.65 ) col = mix( vec3( 1.0, 0.7, 0.28 ), vec3( 0.3, 0.9, 0.4 ), step( 0.5, h21( vec2( row, 3.0 ) ) ) ) * 1.6; if ( cell.x > 0.68 && cell.x < 0.9 && abs( cell.y - 0.5 ) < 0.28 && fract( cell.x * 12.0 ) < 0.5 ) col = vec3( 0.55, 0.57, 0.55 ); } }
  } else if ( t == ty ) {
    if ( d.y > 0.0 ) { col = vec3( 0.7, 0.68, 0.6 ); if ( abs( p.x - LP.x ) < 0.4 && abs( p.z - LP.z ) < 0.28 ) col = vec3( 3.2, 2.7, 1.9 ); }  // the ceiling and its lamp
    else { float id = floor( p.x * 4.0 ); col = vec3( 0.34, 0.22, 0.13 ) * ( 0.7 + 0.5 * h21( vec2( id, 1.0 ) ) ) * ( 0.8 + 0.2 * h21( vec2( id, floor( p.z * 2.0 ) ) ) ); col *= 0.7 + 0.3 * step( 0.04, fract( p.x * 4.0 ) ); }    // the floor's planks
  } else { col = vec3( 0.42, 0.47, 0.4 ) * ( 0.85 + 0.15 * h21( floor( p.zy * 30.0 ) ) ); if ( p.y < YL + 0.7 ) col *= 0.65; if ( abs( p.y - ( YL + 0.7 ) ) < 0.025 ) col = vec3( 0.28, 0.2, 0.14 ); }   // the side walls, with a rail
  col = light( p, col );
  vec3 n; float td = boxHit( o, d, vec3( -1.4, -1.1, -3.3 ), vec3( -0.1, -0.55, -1.8 ), n );                                  // the desk
  if ( td > 0.0 && td < t ) { vec3 q = o + d * td; vec3 wood = n.y > 0.5 ? vec3( 0.5, 0.31, 0.17 ) : vec3( 0.28, 0.17, 0.1 ); col = light( q, wood ); t = td; }
  float te = ellHit( o, d, vec3( 0.58, -0.3, -2.5 ), vec3( 0.4, 0.5, 0.26 ) ), th = ellHit( o, d, vec3( 0.58, 0.42, -2.5 ), vec3( 0.19, 0.22, 0.19 ) );   // the operator at his set: shoulders and head
  float tm = te > 0.0 ? ( th > 0.0 ? min( te, th ) : te ) : th; if ( tm > 0.0 && tm < t ) { col = vec3( 0.05, 0.06, 0.05 ) + 0.1 * vec3( 1.0, 0.7, 0.4 ) * max( 0.0, 1.0 - length( ( o + d * tm ) - LAMP ) * 0.5 ); t = tm; }
  float tl = ellHit( o, d, LAMP, vec3( 0.13 ) ); if ( tl > 0.0 && tl < t ) { col = vec3( 3.0, 2.5, 1.5 ); t = tl; }                                  // the desk lamp's bulb
  vec3 w = LAMP - o; float u = clamp( dot( w, d ), 0.0, t ), gl = 0.05 / ( 0.03 + dot( w - d * u, w - d * u ) ); col += vec3( 1.0, 0.75, 0.4 ) * gl * 0.35 * step( 0.5, uLit );   // (a halo round the lamp)
  col *= uTint * ( uLit > 0.5 ? 1.7 : 1.0 ); gl_FragColor = vec4( col, 1.0 );
}`;
const interiorMat = lit => new THREE.ShaderMaterial({ vertexShader: roomVert, fragmentShader: roomFrag, uniforms: { uLit: { value: lit ? 1 : .12 }, uTint: { value: lit ? new THREE.Vector3(1, 1, 1) : new THREE.Vector3(.5, .62, 1.0) } } });

// The radio outpost, about 9.5 m x 6.5 m (origin on the ground at the middle of the main block, the door on the +z face): textured concrete walls on a stepped plinth, a flat roof under a drift with a vent stack, a skylight, a roof aerial and a lamp; a lean-to shed at one end with a sloping roof; a framed steel door with a small window, a stoop and rail; two framed windows
// glowing warm; pipes and a cable run down the wall; a generator with its exhaust, drums and crates, sandbags, a lattice mast with a red lamp and a dish; icicles along the eaves.
function outpost() {
  const grp = new THREE.Group(), W = 9, D = 6, H = 3.3;
  const wallMat = concreteMat ??= new THREE.MeshStandardMaterial({ map: concreteTexture(), roughness: .92 });
  const walls = new THREE.Mesh(new THREE.BoxGeometry(W, H, D), wallMat); walls.position.y = H / 2 + .25; walls.castShadow = walls.receiveShadow = true; grp.add(walls);
  const shed = new THREE.Mesh(new THREE.BoxGeometry(3.4, 2.3, 4.2), wallMat); shed.position.set(W / 2 + 1.5, 1.4, -.8); shed.castShadow = shed.receiveShadow = true; grp.add(shed);
  const g = new Parts();
  g.add(new THREE.BoxGeometry(W + 1, .5, D + 1), M(0, .25, 0), 0x6b6f74, 1, 11);                                                  // the plinth
  g.add(new THREE.BoxGeometry(W + 3.4, .3, D - 1), M(1.1, .1, -.4), 0x73777c, 1, 12);
  g.add(new THREE.BoxGeometry(W + .6, .42, D + .6), M(0, H + .46, 0), 0x61666b, 1, 13);                                           // the roof slab
  g.add(new THREE.BoxGeometry(3.4, .22, 4.4), M(W / 2 + 1.5, 2.65, -.8, 0, 0, -.16), 0x666a70, 1, 16);                              // the shed's sloping roof
  g.add(new THREE.BoxGeometry(3.2, .38, 4.2), M(W / 2 + 1.5, 2.95, -.8, 0, 0, -.16), 0xe4ebf2, 1, 17);                            // (and its snow)
  g.add(new THREE.CylinderGeometry(.34, .38, 1.5, 8), M(1.8, H + 1.6, -1.6), 0x4d5156, .4, 18);                                    // the vent stack
  g.add(new THREE.CylinderGeometry(.5, .34, .22, 8), M(1.8, H + 2.45, -1.6), 0x4d5156, .6, 19);
  g.add(new THREE.BoxGeometry(1.4, .55, 1.0), M(-1.0, H + 1.28, -1.4), 0x59606a, .6, 20);                                          // a skylight hatch
  for (let i = -3; i <= 3; i++) g.add(new THREE.CylinderGeometry(.02, .02, 1.2 - Math.abs(i) * .12, 4), M(-3.6 + i * .32, H + 1.6, 1.8, Math.PI / 2, 0, 0), 0x9aa0a6, 0, 21 + i); // a roof aerial (a yagi)
  g.add(new THREE.CylinderGeometry(.02, .02, 2.8, 4), M(-3.6, H + 1.4, 1.8, 0, 0, Math.PI / 2), 0x9aa0a6, 0, 22);
  // the door: a steel door in a frame, a window in it, a handle; a stoop of two steps and a rail
  g.add(new THREE.BoxGeometry(1.4, 2.6, .3), M(-1.9, 1.55, D / 2 + .1), 0x3c4146, .2, 30);
  g.add(new THREE.BoxGeometry(1.05, 2.3, .14), M(-1.9, 1.45, D / 2 + .22), 0x4f5a4a, .1, 31);
  g.add(new THREE.BoxGeometry(.45, .35, .05), M(-1.9, 2.1, D / 2 + .3), 0x15181b, 0, 32);
  g.add(new THREE.BoxGeometry(.28, .06, .09), M(-1.55, 1.4, D / 2 + .3), 0xb8bcc0, 0, 33);
  g.add(new THREE.BoxGeometry(2.0, .22, 1.1), M(-1.9, .4, D / 2 + .75), 0x6d7176, 1, 34); g.add(new THREE.BoxGeometry(2.0, .22, .6), M(-1.9, .2, D / 2 + 1.25), 0x6d7176, 1, 35);
  for (const dx of [-.95, .95]) g.add(new THREE.CylinderGeometry(.04, .04, 1, 5), M(-1.9 + dx, .95, D / 2 + 1.1), 0x8a8f94, .2, 36);
  g.add(new THREE.CylinderGeometry(.04, .04, 1.9, 5), M(-1.9, 1.45, D / 2 + 1.1, 0, 0, Math.PI / 2), 0x8a8f94, .3, 37);
  // two windows, framed, with a sill, and a lit pane (separate, below)
  for (const wx of [.3, 2.8]) { g.add(new THREE.BoxGeometry(1.2, 1.0, .22), M(wx, 2.0, D / 2 + .06), 0x373b40, .1, 40 + wx); g.add(new THREE.BoxGeometry(1.4, .12, .4), M(wx, 1.4, D / 2 + .2), 0x6d7176, 1, 44); }
  g.add(new THREE.BoxGeometry(.22, 1.0, 1.2), M(W / 2 + .06, 2.0, 1.6), 0x373b40, .1, 45);
  // window details: a cross of glazing bars over each pane, a drip ledge over it, snow heaped on the sill, hinged storm shutters folded open at the sides (louvred), and a hook and bolt on each
  const winDetail = (wx, wy, wz, ry) => { const Rm = (x0, y0, z0) => { const v = new THREE.Vector3(x0, y0, z0).applyAxisAngle(new THREE.Vector3(0, 1, 0), ry); return [wx + v.x, wy + v.y, wz + v.z]; };
    g.add(new THREE.BoxGeometry(.04, .8, .05), M(...Rm(0, 0, .17), 0, ry, 0), 0x2e3236, .1, 150);                                  // (the vertical bar)
    g.add(new THREE.BoxGeometry(.97, .04, .05), M(...Rm(0, 0, .17), 0, ry, 0), 0x2e3236, .1, 151);                                 // (the horizontal bar)
    g.add(new THREE.BoxGeometry(1.4, .08, .3), M(...Rm(0, .6, .12), 0, ry, 0), 0x61666b, .9, 152);                                  // the drip ledge over the frame, snow-capped
    g.add(new THREE.BoxGeometry(1.3, .16, .34), M(...Rm(0, -.55, .26), 0, ry, 0), 0xe6edf4, 1, 153);                               // the snow heaped on the sill
    for (const sd of [-1, 1]) { g.add(new THREE.BoxGeometry(.5, 1.0, .05), M(...Rm(sd * .98, 0, .19), 0, ry + sd * -.55, 0), 0x4f5a4a, .4, 154 + sd);
      for (let i = 0; i < 6; i++) g.add(new THREE.BoxGeometry(.4, .025, .02), M(...Rm(sd * .98, -.4 + i * .16, .22), 0, ry + sd * -.55, 0), 0x3a4338, 0, 156 + i);
      g.add(new THREE.CylinderGeometry(.03, .03, .08, 5), M(...Rm(sd * .74, .3, .12), Math.PI / 2, ry, 0), 0x8a8f94, 0, 163); }       // (hinges and the louvres' slats)
  };
  winDetail(.3, 2.0, D / 2, 0); winDetail(2.8, 2.0, D / 2, 0);

  // pipes and a cable run
  g.add(new THREE.CylinderGeometry(.09, .09, 3.0, 6), M(4.1, 1.9, D / 2 + .14), 0x6f7479, .3, 46); g.add(new THREE.CylinderGeometry(.09, .09, 1.4, 6), M(3.5, 3.3, D / 2 + .14, 0, 0, Math.PI / 2), 0x6f7479, .3, 47);
  g.add(new THREE.CylinderGeometry(.035, .035, 3.6, 4), M(-3.6, 2.2, D / 2 + .08), 0x1d2024, 0, 48); g.add(new THREE.CylinderGeometry(.035, .035, 2.4, 4), M(-2.6, 3.9, D / 2 + .08, 0, 0, Math.PI / 2), 0x1d2024, 0, 49);
  // (the generator is on the hut's west side now, see below)
  for (const [x, z, c] of [[4.9, D / 2 - .2, 0x7a4a2e], [5.6, D / 2 + .6, 0x4d5a3a], [-4.8, D / 2 - .3, 0x7a4a2e]]) { g.add(new THREE.CylinderGeometry(.44, .44, .95, 10), M(x, .72, z), c, .8, 53); g.add(new THREE.CylinderGeometry(.46, .46, .06, 10), M(x, 1.2, z), 0x2f3236, .8, 54); }
  const crate = (x, z, y, ry, s = 1) => g.add(new THREE.BoxGeometry(1.2 * s, .85 * s, .95 * s), M(x, y + .5 + .42 * s, z, 0, ry, 0), 0x5a6446, .9, 55 + (x * 7 | 0));
  crate(-4.6, D / 2 + 1.5, 0, .1); crate(-3.3, D / 2 + 1.8, 0, -.25); crate(-4.0, D / 2 + 1.6, .85, .3, .9);
  for (let i = 0; i < 6; i++) g.add(new THREE.CylinderGeometry(.24, .24, .8, 8), M(.6 + i * .8, .55, D / 2 + 1.9 + (i % 2) * .05, 0, 0, Math.PI / 2), 0x9a8f6c, 1, 60 + i); // a low wall of sandbags
  for (let i = 0; i < 5; i++) g.add(new THREE.CylinderGeometry(.24, .24, .8, 8), M(1.0 + i * .8, .98, D / 2 + 1.9, 0, 0, Math.PI / 2), 0x9a8f6c, 1, 70 + i);
  // the mast: four lattice legs with braces and a platform, a red lamp, a dish on a pole
  const mx = -W / 2 + .7, mz = -D / 2 + .8, MH = 11;
  for (const [a, b] of [[-.32, -.32], [.32, -.32], [-.32, .32], [.32, .32]]) g.add(new THREE.CylinderGeometry(.05, .07, MH, 5), M(mx + a, H + MH / 2 + .3, mz + b), 0x82878d, .1, 80);
  for (let i = 1; i < 10; i++) { const y = H + .3 + i * MH / 10; for (const [ax, az, ry] of [[0, -.32, 0], [0, .32, 0], [-.32, 0, Math.PI / 2], [.32, 0, Math.PI / 2]]) g.add(new THREE.BoxGeometry(.66, .035, .035), M(mx + ax, y, mz + az, 0, ry, i % 2 ? .6 : -.6), 0x82878d, 0, 81); }
  g.add(new THREE.BoxGeometry(1.1, .08, 1.1), M(mx, H + MH * .62, mz), 0x6e7378, 0, 82);
  g.add(new THREE.CylinderGeometry(.04, .04, 2.6, 4), M(mx, H + MH + 1.6, mz), 0x82878d, 0, 83);
  g.add(new THREE.BoxGeometry(.9, .05, .05), M(mx, H + MH * .82, mz), 0x9aa0a6, 0, 84); g.add(new THREE.BoxGeometry(.05, .05, .9), M(mx, H + MH * .9, mz), 0x9aa0a6, 0, 85);
  // the dish, on the roof's far right corner: a pedestal bolted to a plinth, a yoke, and a parabolic dish (a thin double-sided shell with a rim) tipped up and turned toward the south-east, with a feed horn held out on three struts
  const dx0 = W / 2 - 1.3, dz0 = -D / 2 + 1.0, DR = 1.35, DK = .3, DH = 1 / (4 * DK);
  g.add(new THREE.BoxGeometry(1.2, .22, 1.2), M(dx0, H + 1.16, dz0), 0x555a60, .8, 86);                                               // (a plinth in the drift)
  g.add(new THREE.CylinderGeometry(.13, .18, 1.1, 8), M(dx0, H + 1.8, dz0), 0x7e838a, .3, 87);                                        // the pedestal
  g.add(new THREE.BoxGeometry(.5, .16, .5), M(dx0, H + 2.4, dz0), 0x61666c, .4, 88);                                                  // the yoke's block
  for (const sx of [-1, 1]) g.add(new THREE.BoxGeometry(.08, .5, .08), M(dx0 + sx * .2, H + 2.62, dz0), 0x61666c, .2, 89 + sx);        // the yoke's two arms
  const dishM = new THREE.Matrix4().makeRotationY(.5).multiply(new THREE.Matrix4().makeRotationX(.95));
  const dishAt = (lx, ly, lz) => new THREE.Vector3(lx, ly, lz).applyMatrix4(dishM).add(new THREE.Vector3(dx0, H + 2.75, dz0));
  const prof = []; for (let k = 0; k <= 10; k++) { const r = k / 10 * DR; prof.push(new THREE.Vector2(r, DK * r * r)); } for (let k = 10; k >= 0; k--) { const r = k / 10 * DR; prof.push(new THREE.Vector2(r, DK * r * r - .07)); }
  const dishMesh = new THREE.Mesh(new THREE.LatheGeometry(prof, 28), new THREE.MeshStandardMaterial({ color: 0xd7dbe0, roughness: .55, metalness: .25, side: THREE.DoubleSide }));
  dishMesh.applyMatrix4(dishM); dishMesh.position.set(dx0, H + 2.75, dz0); dishMesh.castShadow = dishMesh.receiveShadow = true; grp.add(dishMesh);
  const snowCap = new THREE.Mesh(new THREE.LatheGeometry(prof.slice(0, 6).map(p => new THREE.Vector2(p.x, p.y + .012)), 20), new THREE.MeshStandardMaterial({ color: 0xf2f6fb, roughness: 1, side: THREE.DoubleSide })); // (a dusting of snow lying in the bowl's centre)
  snowCap.applyMatrix4(dishM); snowCap.position.copy(dishMesh.position); snowCap.receiveShadow = true; grp.add(snowCap);
  const focus = dishAt(0, DH * .8, 0), strut = ang => { const rim = dishAt(Math.cos(ang) * DR * .92, DK * (DR * .92) ** 2, Math.sin(ang) * DR * .92), mid = rim.clone().add(focus).multiplyScalar(.5), len = rim.distanceTo(focus);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), focus.clone().sub(rim).normalize()); g.add(new THREE.CylinderGeometry(.018, .018, len, 4), new THREE.Matrix4().compose(mid, q, new THREE.Vector3(1, 1, 1)), 0x6a6f76, 0, 95); };
  strut(0); strut(Math.PI * 2 / 3); strut(Math.PI * 4 / 3);
  { const q = new THREE.Quaternion().setFromRotationMatrix(dishM); g.add(new THREE.CylinderGeometry(.09, .06, .24, 8), new THREE.Matrix4().compose(focus, q, new THREE.Vector3(1, 1, 1)), 0x30343a, 0, 96); } // (the feed horn)
  // the rest of the roof: an air-handling unit with a fan, a duct down to the wall, mushroom vents, and a ladder up the west wall
  g.add(new THREE.BoxGeometry(1.5, .8, 1.0), M(2.9, H + 1.5, 1.5), 0x6a7076, .8, 97);
  g.add(new THREE.BoxGeometry(1.56, .06, 1.06), M(2.9, H + 1.93, 1.5), 0x555a60, .9, 98);
  g.add(new THREE.CylinderGeometry(.36, .36, .06, 14), M(2.9, H + 1.99, 1.5), 0x1d2024, .2, 99);
  for (let i = 0; i < 4; i++) g.add(new THREE.BoxGeometry(.7, .025, .035), M(2.9, H + 2.03, 1.5, 0, i * Math.PI / 4, 0), 0x8a8f94, 0, 100);
  for (let i = 0; i < 5; i++) g.add(new THREE.BoxGeometry(.04, .5, .03), M(2.17, H + 1.5, 1.2 + i * .15), 0x3c4146, 0, 101);               // (louvres on its side)
  g.add(new THREE.CylinderGeometry(.14, .14, 1.4, 8), M(2.9, H + 1.2, 2.3, Math.PI / 2, 0, 0), 0x777c82, .5, 102);                         // (a duct out to the roof's front edge)
  g.add(new THREE.CylinderGeometry(.16, .16, 1.0, 8), M(2.9, H + .75, D / 2 + .12), 0x777c82, .3, 103);                                   // (and down the wall)
  for (const [vx, vz] of [[-2.6, -.2], [.5, .6], [-.1, -2.2]]) { g.add(new THREE.CylinderGeometry(.1, .1, .5, 8), M(vx, H + 1.35, vz), 0x4d5156, .3, 104); g.add(new THREE.ConeGeometry(.28, .2, 8), M(vx, H + 1.7, vz), 0x4d5156, .6, 105); }
  g.add(new THREE.BoxGeometry(.5, .35, .4), M(-3.7, H + 1.3, .2), 0x4a4f55, .6, 106);                                                     // (a junction box under the aerial)
  for (const lz of [1.1, 1.6]) g.add(new THREE.CylinderGeometry(.03, .03, H + .6, 5), M(-W / 2 - .07, (H + .6) / 2 + .1, lz), 0x8a8f94, .2, 107);   // the ladder's rails
  for (let i = 0; i < 10; i++) g.add(new THREE.CylinderGeometry(.025, .025, .5, 5), M(-W / 2 - .07, .6 + i * .36, 1.35, Math.PI / 2, 0, 0), 0x8a8f94, .1, 108 + i);
  // the generator, on the west side: a diesel set on a skid under a little snow-roofed lean-to, a fuel drum with a hose, an exhaust stack, and a cable to a box on the wall
  const GX = -W / 2 - 2.6, GZ = .5;
  g.add(new THREE.BoxGeometry(2.8, .16, 1.7), M(GX, .08, GZ), 0x5b5f64, .9, 120);                                                          // (a concrete pad)
  g.add(new THREE.BoxGeometry(2.3, .14, 1.2), M(GX, .23, GZ), 0x2d3033, .1, 121);                                                          // the skid
  g.add(new THREE.BoxGeometry(1.5, .9, .95), M(GX + .15, .75, GZ), 0x56603f, .5, 122);                                                     // the engine and alternator housing
  g.add(new THREE.BoxGeometry(.62, .82, .9), M(GX - .95, .72, GZ), 0x3f4a35, .4, 123);                                                     // the alternator end
  g.add(new THREE.BoxGeometry(.06, .7, .8), M(GX + .93, .75, GZ), 0x1d2024, 0, 124);                                                       // the radiator grille
  for (let i = 0; i < 5; i++) g.add(new THREE.BoxGeometry(.02, .6, .02), M(GX + .97, .75, GZ - .3 + i * .15), 0x6a6f76, 0, 125 + i);
  g.add(new THREE.BoxGeometry(.5, .2, .5), M(GX + .1, 1.3, GZ), 0x2d2f30, .3, 130);                                                        // the air cleaner / fuse panel
  g.add(new THREE.CylinderGeometry(.07, .07, 1.5, 6), M(GX + .5, 1.65, GZ - .3), 0x2d2f30, .1, 131);                                       // the exhaust stack
  g.add(new THREE.CylinderGeometry(.14, .1, .12, 6), M(GX + .5, 2.45, GZ - .3), 0x2d2f30, .2, 132);
  g.add(new THREE.CylinderGeometry(.5, .5, 1.0, 12), M(GX - 1.5, .95, GZ + .7), 0x7a4a2e, .8, 133); g.add(new THREE.CylinderGeometry(.52, .52, .06, 12), M(GX - 1.5, 1.47, GZ + .7), 0x2f3236, .8, 134); // the fuel drum
  g.add(new THREE.CylinderGeometry(.03, .03, 1.2, 5), M(GX - .75, 1.0, GZ + .65, 0, 0, 1.2), 0x1d2024, 0, 135);                          // (its hose)
  for (const [px, pz] of [[-1.3, -.8], [1.3, -.8], [-1.3, 1.2], [1.3, 1.2]]) g.add(new THREE.CylinderGeometry(.045, .045, 2.2, 5), M(GX + px, 1.15, GZ + pz), 0x8a8f94, .2, 136);   // the lean-to's posts
  g.add(new THREE.BoxGeometry(3.1, .12, 2.5), M(GX, 2.3, GZ + .2, -.1, 0, 0), 0x5b5f64, .9, 137); g.add(new THREE.BoxGeometry(3.0, .3, 2.4), M(GX, 2.48, GZ + .2, -.1, 0, 0), 0xe4ebf2, 1, 138);   // (its sloping roof, and the snow on it)
  g.add(new THREE.CylinderGeometry(.045, .045, 1.9, 6), M(GX + 1.85, .12, GZ - .2, 0, 0, Math.PI / 2), 0x1d2024, 0, 139);                  // the cable: along the ground...
  g.add(new THREE.CylinderGeometry(.045, .045, 1.5, 6), M(-W / 2 - .12, .85, GZ - .2), 0x1d2024, 0, 140);                                  // ...up the wall...
  g.add(new THREE.BoxGeometry(.2, .45, .35), M(-W / 2 - .1, 1.7, GZ - .2), 0x6a7076, .1, 141);                                              // ...to a meter box
  const body = g.mesh(metalMat); grp.add(body);
  grp.add(roofSnow(W, D, H, [[1.8, -1.6, .9, .28], [-1, -1.4, 1.1, .22], [2.9, 1.5, 1.3, .25], [3.2, -2.0, 1.2, .3], [-3.8, -2.2, .9, .25], [-3.6, 1.8, .7, .15], [-2.6, -.2, .5, .15], [.5, .6, .5, .15], [-.1, -2.2, .5, .15], [-3.7, .2, .6, .15]])); // (the roof's blanket of snow, drifted round the things on it)
  const lit = interiorMat(true), glass = interiorMat(false), frostMat = new THREE.MeshBasicMaterial({ map: paneTexture('frost'), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  for (const wx of [.3, 2.8]) { const p = new THREE.Mesh(new THREE.PlaneGeometry(.95, .78), lit); p.position.set(wx, 2.0, D / 2 + .2); grp.add(p); }
  const pe = new THREE.Mesh(new THREE.PlaneGeometry(.95, .78), lit); pe.position.set(W / 2 + .18, 2.0, 1.6); pe.rotation.y = Math.PI / 2; grp.add(pe);
  for (const [fx, fy, fz, ry] of [[.3, 2.0, D / 2 + .215, 0], [2.8, 2.0, D / 2 + .215, 0], [W / 2 + .195, 2.0, 1.6, Math.PI / 2]]) { const fr = new THREE.Mesh(new THREE.PlaneGeometry(.95, .78), frostMat); fr.position.set(fx, fy, fz); fr.rotation.y = ry; fr.renderOrder = 2; grp.add(fr); } // (frost on the outside of each pane)
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(.2, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff2a20 })); lamp.position.set(mx, H + MH + 3, mz); grp.add(lamp); grp.userData.lamp = lamp;
  const lamp2 = new THREE.Mesh(new THREE.SphereGeometry(.13, 8, 6), new THREE.MeshBasicMaterial({ color: 0xfff0c0 })); lamp2.position.set(.2, 3.45, D / 2 + .5); grp.add(lamp2);
  { // the lit windows as light sources: a warm point light in front of the front window, a glow on the glass and the wall round it, and pools of light laid on the snow (additive), so the hut lights up its surroundings
    const S = 128, c = document.createElement('canvas'); c.width = c.height = S; const cx = c.getContext('2d'), gr = cx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(.35, 'rgba(255,255,255,.45)'); gr.addColorStop(.7, 'rgba(255,255,255,.12)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); cx.fillStyle = gr; cx.fillRect(0, 0, S, S);
    const tex = new THREE.CanvasTexture(c), glowMat = op => new THREE.MeshBasicMaterial({ map: tex, color: 0xffa648, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
    const pool = (px, pz, w, d, op) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), glowMat(op)); m.rotation.x = -Math.PI / 2; m.position.set(px, .09, pz); m.renderOrder = 3; grp.add(m); return m; };
    // (no painted fan on the ground: the spotlight below lights the snow itself, so it shows the snow's own relief)
    pool(W / 2 + 2.9, 1.6, 5, 5, .18);                                                                    // (on the snow, in front of the hut and at its east end)
    const halo = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 2.8), glowMat(.4)); halo.position.set(.3, 2.0, D / 2 + .3); halo.renderOrder = 3; grp.add(halo);   // (the glow on the wall round the window)
    const haloB = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 2.8), glowMat(.4)); haloB.position.set(2.8, 2.0, D / 2 + .3); haloB.renderOrder = 3; grp.add(haloB);
    const halo2 = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 2.6), glowMat(.22)); halo2.position.set(W / 2 + .3, 2.0, 1.6); halo2.rotation.y = Math.PI / 2; halo2.renderOrder = 3; grp.add(halo2);
    const light = new THREE.SpotLight(0xffb060, 2, 32, 62 * Math.PI / 180, .85, .8); light.position.set(1.55, 3.1, D / 2 + .5); light.name = 'windowLight'; // (a spot: a 110 degree cone, out of the window to the south and a little down, soft at the edge)
    light.target.position.set(1.55, 0, D / 2 + 9); grp.add(light, light.target);
    light.layers.enable(REFLECT); light.layers.enable(UNDERWATER);   // (the same layers world.js puts the scene's own lights on, and no more: every light must be on every one of the views the game draws, or a view with one light fewer builds new shaders at first use; this light sits inside a group, which that code does not reach. enableAll() was tried and put it into the shadow pass's own view as well: worse)
    light.castShadow = true; light.shadow.mapSize.set(1024, 1024); light.shadow.camera.near = .4; light.shadow.camera.far = 34; light.shadow.bias = -.0004; light.shadow.normalBias = .04; light.shadow.radius = 3;   // (the beam casts shadows: the jeep, crates and sandbags in front of the window throw theirs across the lit snow)
    grp.userData.windowLight = light;
    { // the beam made visible (fake volumetrics): an open cone of light with its apex at the window, a soft shader on it: brightest toward the middle of the beam as you look at it, fading along its length and away from the glass, and fading out near the ground (no hard line where it meets the snow), broken up by a slow mist of noise
      const L = 15, ang = 56 * Math.PI / 180, geo = new THREE.ConeGeometry(L * Math.tan(ang), L, 48, 1, true); geo.translate(0, -L / 2, 0);
      const dir = new THREE.Vector3(0, -.3, 1).normalize(), q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir);
      const mat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, uniforms: { uColor: { value: new THREE.Color(0xffa850) }, uK: { value: .16 }, uL: { value: L } },
        vertexShader: `varying vec3 vN; varying vec3 vV; varying vec3 vW; varying float vT; uniform float uL;
          void main() { vT = clamp( -position.y / uL, 0.0, 1.0 ); vN = normalize( normalMatrix * normal ); vec4 mv = modelViewMatrix * vec4( position, 1.0 ); vV = -mv.xyz; vW = ( modelMatrix * vec4( position, 1.0 ) ).xyz; gl_Position = projectionMatrix * mv; }`,
        fragmentShader: `varying vec3 vN; varying vec3 vV; varying vec3 vW; varying float vT; uniform vec3 uColor; uniform float uK;
          float h( vec3 p ) { return fract( sin( dot( p, vec3( 127.1, 311.7, 74.7 ) ) ) * 43758.5453 ); }
          float vn( vec3 p ) { vec3 i = floor( p ), f = fract( p ); f = f * f * ( 3.0 - 2.0 * f ); return mix( mix( mix( h( i ), h( i + vec3( 1, 0, 0 ) ), f.x ), mix( h( i + vec3( 0, 1, 0 ) ), h( i + vec3( 1, 1, 0 ) ), f.x ), f.y ), mix( mix( h( i + vec3( 0, 0, 1 ) ), h( i + vec3( 1, 0, 1 ) ), f.x ), mix( h( i + vec3( 0, 1, 1 ) ), h( i + vec3( 1, 1, 1 ) ), f.x ), f.y ), f.z ); }
          void main() {
            float facing = pow( abs( dot( normalize( vN ), normalize( vV ) ) ), 1.3 );        // (the thicker the beam along the line of sight, the brighter: edge-on at its rim, so it dies away there)
            float along = pow( 1.0 - vT, 1.6 ) * smoothstep( 0.0, 0.08, vT );                    // (fades with distance from the glass)
            float ground = smoothstep( 0.05, 1.2, vW.y );                                         // (and as it nears the snow)
            float mist = 0.55 + 0.9 * vn( vW * 0.9 ) * vn( vW * 0.35 + 7.0 );
            gl_FragColor = vec4( uColor, 1.0 ) * ( uK * facing * along * ground * mist );
          }` });
      const cone = new THREE.Mesh(geo, mat); cone.quaternion.copy(q); cone.position.set(1.55, 3.1, D / 2 + .5); cone.renderOrder = 4; cone.frustumCulled = false; cone.name = 'windowBeam'; grp.add(cone);
      const wp = new THREE.Vector3(); cone.onBeforeRender = (r, sc, camera) => { cone.getWorldPosition(wp); light.shadow.autoUpdate = camera.position.distanceTo(wp) < 130; }; // (the light's shadow map is only redrawn while the camera is near the hut)
    }
  }
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.8, .7), new THREE.MeshStandardMaterial({ map: signTexture('OP-7 / OP ALPHA', 'RADIO POST'), roughness: .8 })); sign.position.set(.1, 3.0, D / 2 + .03); grp.add(sign);
  const ic = new Parts(); for (let i = 0; i < 22; i++) icicle(ic, -W / 2 + .3 + i * (W - .6) / 21, H + .24, D / 2 + .3, .3 + hash3(i, 3, 5) * .8, .04 + hash3(i, 7, 1) * .05); for (let i = 0; i < 9; i++) icicle(ic, W / 2 + .1 + i * .35, 2.5, D / 2 - 2.6 - 0, .25 + hash3(i, 2, 9) * .4, .04);
  grp.add(ic.mesh(iceMat, false)); return grp;
}

// A mobile radar on a two-wheeled trailer (origin on the ground at the middle of the trailer, the tow bar toward +z): a camouflaged equipment shelter on a chassis, a pair of tyres under mudguards, four stabiliser legs with pads, a tow bar with a hitch and a jack, cable reels, vents and a door on the shelter, and on top a pedestal carrying a flat phased-array panel that turns (the group named 'spin', turned in its onBeforeRender).
const CAMO = [0x3d4d2e, 0x2a3626, 0x6b6143, 0x45382a];
function radar() {
  const grp = new THREE.Group(), g = new Parts(), steel = 0x5c6168, dark = 0x1f2224;
  // chassis, shelter and mudguards
  g.add(new THREE.BoxGeometry(1.7, .2, 3.1), M(0, .62, -.1), 0x3a3f44, .3, 201);                                                    // the chassis deck
  g.add(new THREE.BoxGeometry(1.95, 1.3, 1.95), M(0, 1.35, -.45), CAMO, .5, 202);                                                    // the shelter
  g.add(new THREE.BoxGeometry(2.05, .1, 2.05), M(0, 2.03, -.45), CAMO, .8, 203);                                                     // (its roof lip, where the snow sits)
  g.add(new THREE.BoxGeometry(1.0, 1.0, .08), M(-.4, 1.35, .55), 0x2c342a, .1, 204);                                                // a hatch on the front face
  g.add(new THREE.BoxGeometry(.16, .06, .06), M(-.05, 1.35, .6), 0xb8bcc0, 0, 205);
  for (let i = 0; i < 6; i++) g.add(new THREE.BoxGeometry(.7, .035, .03), M(.5 + .0, 1.0 + i * .08, .54), dark, 0, 206 + i); // louvres beside it
  for (const sx of [-1, 1]) { g.add(new THREE.BoxGeometry(.06, .85, 1.1), M(sx * .99, 1.35, -.45), 0x2c342a, .1, 220 + sx); for (let i = 0; i < 5; i++) g.add(new THREE.BoxGeometry(.04, .03, .9), M(sx * 1.01, 1.0 + i * .12, -.45), dark, 0, 222 + i); } // vent panels on both sides
  for (const sx of [-1, 1]) { g.add(new THREE.BoxGeometry(.26, .06, 1.15), M(sx * 1.0, .98, -.3), CAMO, .8, 230 + sx); g.add(new THREE.BoxGeometry(.1, .3, 1.15), M(sx * 1.12, .83, -.3), CAMO, .3, 232 + sx); } // the mudguards
  // wheels and their axle
  g.add(new THREE.CylinderGeometry(.07, .07, 2.1, 8), M(0, .5, -.3, 0, 0, Math.PI / 2), steel, 0, 240);
  for (const sx of [-1, 1]) { g.add(new THREE.CylinderGeometry(.46, .46, .27, 18), M(sx * 1.12, .46, -.3, 0, 0, Math.PI / 2), 0x1b1d1e, .3, 241 + sx); g.add(new THREE.CylinderGeometry(.24, .24, .29, 10), M(sx * 1.12, .46, -.3, 0, 0, Math.PI / 2), 0x6a6f74, .1, 243 + sx);
    for (let k = 0; k < 6; k++) g.add(new THREE.BoxGeometry(.3, .04, .04), M(sx * 1.27, .46, -.3, k * Math.PI / 6, 0, 0), 0x2d3033, 0, 245 + k); }   // (tread blocks)
  // tow bar: two bars meeting at a hitch, with a jack wheel
  for (const sx of [-1, 1]) g.add(new THREE.BoxGeometry(.1, .1, 1.7), M(sx * .33, .6, 1.95, 0, sx * -.2, 0), 0x3a3f44, .2, 250 + sx);
  g.add(new THREE.CylinderGeometry(.1, .1, .22, 8), M(0, .62, 2.78), steel, 0, 252); g.add(new THREE.BoxGeometry(.24, .2, .3), M(0, .6, 2.6), 0x4a4f55, .2, 253);
  g.add(new THREE.CylinderGeometry(.045, .045, .8, 6), M(0, .3, 2.3), steel, 0, 254); g.add(new THREE.CylinderGeometry(.14, .14, .07, 10), M(0, .12, 2.3, 0, 0, Math.PI / 2), 0x1b1d1e, 0, 255);
  // stabiliser legs and pads
  for (const [lx, lz] of [[-.95, -1.5], [.95, -1.5], [-.95, 1.0], [.95, 1.0]]) { g.add(new THREE.CylinderGeometry(.045, .045, .95, 6), M(lx * 1.12, .35, lz, 0, 0, lx * -.18), steel, 0, 260); g.add(new THREE.BoxGeometry(.34, .05, .34), M(lx * 1.3, .03, lz), 0x4a4f55, .6, 261); g.add(new THREE.BoxGeometry(.12, .14, .12), M(lx * .98, .7, lz), 0x4a4f55, .2, 262); }
  // cable reels on the side, and a stowed cable
  for (const [sx, sz] of [[1, 1.0], [-1, .9]]) { g.add(new THREE.CylinderGeometry(.34, .34, .06, 14), M(sx * 1.0, .98, sz, 0, 0, Math.PI / 2), 0x2d3033, .3, 270); g.add(new THREE.CylinderGeometry(.32, .32, .06, 14), M(sx * 1.2, .98, sz, 0, 0, Math.PI / 2), 0x2d3033, .3, 271); g.add(new THREE.CylinderGeometry(.27, .27, .15, 14), M(sx * 1.1, .98, sz, 0, 0, Math.PI / 2), 0x15171a, .2, 272); }
  g.add(new THREE.BoxGeometry(.16, .32, .3), M(-1.06, 1.45, -1.0), 0x2d3033, .1, 330); g.add(new THREE.CylinderGeometry(.05, .05, .1, 8), M(-1.15, 1.35, -1.0, 0, 0, Math.PI / 2), 0x8a8f94, 0, 331);   // the power socket on the shelter's west face
  // the turntable and the pedestal
  g.add(new THREE.CylinderGeometry(.5, .6, .18, 14), M(0, 2.17, -.45), 0x4a4f55, .6, 280);
  g.add(new THREE.CylinderGeometry(.2, .26, .5, 10), M(0, 2.5, -.45), 0x5c6168, .3, 281);
  grp.add(g.mesh(metalMat));
  // the turning part: a yoke, and the flat array panel, tilted back a little, with its frame, back ribs, a red lamp on top
  const spin = new THREE.Group(); spin.name = 'spin'; spin.position.set(0, 2.6, -.45);
  const a = new Parts();
  a.add(new THREE.BoxGeometry(.7, .22, .5), M(0, 0, 0), 0x4a4f55, .6, 290);
  for (const sx of [-1, 1]) a.add(new THREE.BoxGeometry(.08, .5, .3), M(sx * .3, .3, 0), 0x4a4f55, .2, 291 + sx);
  a.add(new THREE.BoxGeometry(2.0, 1.75, .14), M(0, 1.2, .02, -.1, 0, 0), CAMO, .85, 292);                                         // the array face
  a.add(new THREE.BoxGeometry(2.1, .08, .2), M(0, 2.09, .0, -.1, 0, 0), 0x30363a, .8, 293); a.add(new THREE.BoxGeometry(2.1, .08, .2), M(0, .31, .1, -.1, 0, 0), 0x30363a, .3, 294);     // (the frame, top and bottom)
  for (const sx of [-1, 1]) a.add(new THREE.BoxGeometry(.08, 1.85, .2), M(sx * 1.04, 1.2, .02, -.1, 0, 0), 0x30363a, .5, 295 + sx);                                                      // (and sides)
  for (let i = -2; i <= 2; i++) a.add(new THREE.BoxGeometry(.06, 1.6, .16), M(i * .4, 1.2, -.12, -.1, 0, 0), 0x3a3f44, .3, 298 + i);     // ribs on the back
  for (let r = 0; r < 12; r++) for (let c = 0; c < 8; c++) a.add(new THREE.BoxGeometry(.2, .1, .02), M(-.85 + c * .243, .5 + r * .13, .11 - r * .002, -.1, 0, 0), 0x1d2a20, 0, 310 + r * 8 + c); // (the array's rows of radiating elements, as a faint grid)
  spin.add(a.mesh(metalMat));
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(.07, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff3020 })); lamp.position.set(.9, 2.2, 0); spin.add(lamp);
  grp.add(spin);
  const t0 = Math.random() * 6, turn = () => { spin.rotation.y = t0 + performance.now() / 1000 * .9; };
  lamp.frustumCulled = false; lamp.onBeforeRender = turn; spin.traverse(o => { if (o.isMesh) { o.frustumCulled = false; o.onBeforeRender = turn; } }); // (driven by the clock from every part of it, and none of them is ever culled: the array keeps turning whatever is in view; it is a spin that starts from where the clock says, not from where it was left)   // (it turns about once every seven seconds)
  grp.userData.spin = spin; return grp;
}

// A frozen patch: pale glassy ice with cracks, laid on the snow. r metres.
function icePatch(r) {
  const S = 256, c = document.createElement('canvas'); c.width = c.height = S; const x = c.getContext('2d'), gr = x.createRadialGradient(S / 2, S / 2, S * .08, S / 2, S / 2, S / 2);
  gr.addColorStop(0, 'rgba(190,225,240,.95)'); gr.addColorStop(.65, 'rgba(176,214,232,.8)'); gr.addColorStop(1, 'rgba(176,214,232,0)'); x.fillStyle = gr; x.fillRect(0, 0, S, S);
  x.strokeStyle = 'rgba(255,255,255,.55)'; x.lineWidth = 1.2; const rn = rng(5);
  for (let i = 0; i < 26; i++) { x.beginPath(); let px = S / 2 + (rn() - .5) * 60, py = S / 2 + (rn() - .5) * 60; x.moveTo(px, py); for (let k = 0; k < 5; k++) { px += (rn() - .5) * 70; py += (rn() - .5) * 70; x.lineTo(px, py); } x.stroke(); }
  const t = new THREE.CanvasTexture(c), m = new THREE.Mesh(new THREE.CircleGeometry(r, 40), new THREE.MeshStandardMaterial({ map: t, transparent: true, depthWrite: false, roughness: .12, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  m.rotation.x = -Math.PI / 2; m.receiveShadow = true; return m;
}

export function buildSummitArena(cfg, heightAt) {
  mats();
  const group = new THREE.Group(), boxes = []; group.name = 'summitArena';
  const put = (obj, x, z, rot = 0, lift = 0) => { obj.position.set(x, heightAt(x, z) + lift, z); obj.rotation.y = rot; group.add(obj); return obj; };
  if (cfg.outpost) { const o = cfg.outpost, c = Math.cos(o.rot ?? 0), s = Math.sin(o.rot ?? 0), hw = 6.2 * Math.abs(c) + 3.6 * Math.abs(s), hd = 6.2 * Math.abs(s) + 3.6 * Math.abs(c); put(outpost(), o.x + 1.2 * c, o.z - 1.2 * s, o.rot ?? 0); boxes.push({ x: o.x + 1.2 * c, z: o.z - 1.2 * s, hw, hd, kind: 'building' });
    const gl = -7.1, gz = .5; boxes.push({ x: o.x + 1.2 * c + gl * c + gz * s, z: o.z - 1.2 * s - gl * s + gz * c, hw: 1.5 * Math.abs(c) + .9 * Math.abs(s), hd: 1.5 * Math.abs(s) + .9 * Math.abs(c), kind: 'building' }); } // (the generator on the hut's west side)
  if (cfg.radar) { const r = cfg.radar, c = Math.cos(r.rot ?? 0), sn = Math.sin(r.rot ?? 0), k = r.scale ?? .935; const rd = put(radar(), r.x, r.z, r.rot ?? 0); rd.scale.setScalar(k);
    boxes.push({ x: r.x, z: r.z, hw: (1.15 * Math.abs(c) + 1.7 * Math.abs(sn)) * k, hd: (1.15 * Math.abs(sn) + 1.7 * Math.abs(c)) * k, kind: 'building' }); }   // (the radar trailer is solid)
  if (cfg.radar && cfg.outpost) { // the radar's power cable: out of its socket, down to the snow, across the ground (a little slack in it) and up the shed's east wall into a meter box: the hut feeds the radar
    const r = cfg.radar, o = cfg.outpost, k = r.scale ?? .935, rc = Math.cos(r.rot ?? 0), rs = Math.sin(r.rot ?? 0), hc = Math.cos(o.rot ?? 0), hs = Math.sin(o.rot ?? 0), hx = o.x + 1.2 * hc, hz = o.z - 1.2 * hs;
    const fromRadar = (lx, ly, lz) => new THREE.Vector3(r.x + (lx * rc + lz * rs) * k, heightAt(r.x, r.z) + ly * k, r.z + (-lx * rs + lz * rc) * k), fromHut = (lx, ly, lz) => new THREE.Vector3(hx + lx * hc + lz * hs, heightAt(hx, hz) + ly, hz - lx * hs + lz * hc);
    const sock = fromRadar(-1.2, 1.35, -1.0), a0 = fromRadar(-1.45, 0, -1.0), b0 = fromHut(8.4, 0, -.2), wall = fromHut(7.8, .55, -.2), pts = [sock, new THREE.Vector3(sock.x - .1, sock.y - .5, sock.z)];
    pts.push(new THREE.Vector3(a0.x, heightAt(a0.x, a0.z) + .05, a0.z));
    for (let i = 1; i < 9; i++) { const t = i / 9, x = a0.x + (b0.x - a0.x) * t + Math.sin(t * 7) * .35, z = a0.z + (b0.z - a0.z) * t + Math.sin(t * 5 + 1) * .5; pts.push(new THREE.Vector3(x, heightAt(x, z) + .05, z)); }
    pts.push(new THREE.Vector3(b0.x, heightAt(b0.x, b0.z) + .05, b0.z), new THREE.Vector3(wall.x + .1, wall.y - .25, wall.z), wall.clone());
    const cable = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, false, 'catmullrom', .35), 120, .05, 6), new THREE.MeshStandardMaterial({ color: 0x17181a, roughness: .55, metalness: .25 })); cable.castShadow = true; group.add(cable);
    const box = new THREE.Mesh(new THREE.BoxGeometry(.3, .45, .22), new THREE.MeshStandardMaterial({ color: 0x6a7076, roughness: .6, metalness: .3 })); box.position.copy(wall).add(new THREE.Vector3(.1 * hc, .05, 0)); box.castShadow = true; group.add(box);
  }
  for (const r of cfg.rocks ?? []) { put(rock(r.seed, r.r, r.h), r.x, r.z, 0, -.15); boxes.push({ x: r.x, z: r.z, hw: r.r * .95, hd: r.r * .85, kind: 'wall' }); }
  for (const c of cfg.crystals ?? []) { const sz = c.size ?? 1; put(crystals(c.seed, c.n ?? 9, sz), c.x, c.z, 0, -.1); boxes.push({ x: c.x, z: c.z, hw: 2.2 * sz, hd: 2.0 * sz, kind: 'wall' }); }
  if (cfg.ice) put(icePatch(cfg.ice.r), cfg.ice.x, cfg.ice.z, 0, .07);
  return { group, boxes };
}
