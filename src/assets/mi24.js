// Mil Mi-24 "Hind" attack helicopter (placeholder): a sculpted fuselage lofted from nose to tail boom (camouflage baked into vertex colours,
// pale grey-blue belly), tandem stepped cockpits (gunner low in front, pilot higher behind) under framed glass canopies, a chin turret with a
// four-barrel gun and a sensor pod, a roomy troop cabin with a door and portholes, twin side-by-side engines on top with round dust intakes
// and angled exhausts, a five-blade main rotor, a three-blade tail rotor on the port (left) side of a swept fin, anhedral stub wings carrying
// two rocket pods and a pair of anti-tank missiles each (set behind the doors), and tricycle landing gear that retracts.
// Origin on the ground under the rotor mast (the main rotor is at x = 0, z = 0.15); the nose faces -Z. ~17.8 m fuselage, 17.3 m rotor,
// ~6.8 m wing span, ~4.2 m to the rotor head, ~5.9 m to the top of the tail rotor.
// Named parts: `airframe` (tilts about the centre of mass) > `body` (everything), `rotor` (main rotor, spins), `tailRotor`, `gun` (yaws)
// > `gunPitch`, `gearNose` / `gearL` / `gearR`, and the weapons `podL0 podL1 missilesL podR0 podR1 missilesR` (stored in root.userData.weapons).
// Drive it with poseMi24(root, spin, pitch, roll, blur, gunYaw, gunPitch, gear):
//   spin      main rotor angle in radians (advance it every frame; the tail rotor follows at about 5x)
//   pitch     radians, positive = nose down;  roll  radians, positive = right side down
//   blur      0..1: fades in a translucent disc over each rotor (use it when spinning fast)
//   gunYaw    radians, 0 = straight ahead;  gunPitch  radians, positive = depressed (down)
//   gear      0 = down, 1 = retracted
//   doors     0 = shut, 1 = open: each upper door slides aft and each lower panel folds down into a step
import * as THREE from 'three';
import { add, mat, cached, PI, canvasTexture, seededRandom, extrudeProfile } from './common.js';

const BODY_Y = 1.8;                                  // height of the pivot for pitch and roll (about the centre of mass)
const R_MAIN = 8.65, R_TAIL = 1.95, HUB_Y = 4.15, MAST_Z = .15;
const TAIL_SIDE = -1;                                // -1 = port (left, -X: left when you face the nose), +1 = starboard (right, +X)
const TAIL_AT = { x: TAIL_SIDE * .33, y: 3.95, z: 10.65 };

function hGrainCanvas() {
  const S = 256, rnd = seededRandom(24), c = document.createElement('canvas'); c.width = c.height = S; const x = c.getContext('2d');
  x.fillStyle = '#808080'; x.fillRect(0, 0, S, S);
  for (let i = 0; i < 6000; i++) { const v = rnd() > .5 ? 255 : 0; x.fillStyle = `rgba(${v},${v},${v},.05)`; x.fillRect(rnd() * S, rnd() * S, 1 + rnd() * 2, 1 + rnd() * 2); }
  return c;
}
const hMats = () => cached('mi24Mats', () => ({
  camo: new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: .68, metalness: .1, bumpScale: .15, bumpMap: cached('mi24Bump', () => canvasTexture(hGrainCanvas(), 6, 6)) }),
  olive: mat(0x4b5836, .7, .1), pod: mat(0x474f32, .7, .15), dark: mat(0x1c1d1b, .8, .15), metal: mat(0x5c5f62, .4, .8), steel: mat(0x8a8d90, .35, .9),
  rubber: mat(0x141414, .95, 0), blade: mat(0x2e332a, .6, .2), tip: mat(0xb5481e, .6, .1), white: mat(0xdadad2, .55, .1),
  glass: new THREE.MeshStandardMaterial({ color: 0x1d2c36, roughness: .05, metalness: .7, transparent: true, opacity: .62 }),
  canopy: new THREE.MeshStandardMaterial({ color: 0x0f1a22, roughness: .05, metalness: .9, emissive: 0x050c12 }), frame: mat(0x1c1d1b, .6, .3),
  door: new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: .68, metalness: .1, side: THREE.DoubleSide }),
  ledR: mat(0xff2a2a, .3, 0, { emissive: 0xff1010, emissiveIntensity: 1.5 }), ledG: mat(0x2aff5a, .3, 0, { emissive: 0x10ff30, emissiveIntensity: 1.5 }),
}));
const hV = (x, y, z) => new THREE.Vector3(x, y, z);

// ---- smooth natural camouflage: soft-edged fractal noise patches, baked into vertex colours (see the drone for the same idea)
const hNoise = cached('mi24Noise', () => {
  const rnd = seededRandom(1984), V = Array.from({ length: 256 }, () => rnd()), P = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [P[i], P[j]] = [P[j], P[i]]; }
  const h = (x, y, z) => V[P[(P[(P[x & 255] + y) & 255] + z) & 255]], sm = q => q * q * q * (q * (q * 6 - 15) + 10), L = (p, q, k) => p + (q - p) * k;
  return (x, y, z) => {
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), u = sm(x - xi), v = sm(y - yi), w = sm(z - zi);
    return L(L(L(h(xi, yi, zi), h(xi + 1, yi, zi), u), L(h(xi, yi + 1, zi), h(xi + 1, yi + 1, zi), u), v),
             L(L(h(xi, yi, zi + 1), h(xi + 1, yi, zi + 1), u), L(h(xi, yi + 1, zi + 1), h(xi + 1, yi + 1, zi + 1), u), v), w);
  };
});
const hFbm = (x, y, z, o) => .6 * hNoise(x + o, y + o * .7, z + o * 1.3) + .3 * hNoise(x * 2.1 + o + 7, y * 2.1 + 3, z * 2.1 + 5) + .1 * hNoise(x * 4.3 + 13, y * 4.3 + o, z * 4.3);
const hSS = (a, b, x) => { const k = Math.min(1, Math.max(0, (x - a) / (b - a))); return k * k * (3 - 2 * k); };
const hCols = () => cached('mi24Cols', () => ({ base: new THREE.Color(0x4b5836), brown: new THREE.Color(0x6a5a3b), dark: new THREE.Color(0x2f3b27), tan: new THREE.Color(0x8d8059), belly: new THREE.Color(0x8e9aa0) }));
function hCamoColor(x, y, z, belly, out) {
  const C = hCols(), F = .55, f1 = hFbm(x * F, y * F, z * F, 0), f2 = hFbm(x * F, y * F, z * F, 31.7), f3 = hFbm(x * F * 1.3, y * F * 1.3, z * F * 1.3, 71.3);
  out.copy(C.base);
  out.lerp(C.brown, hSS(.47, .52, f1));
  out.lerp(C.dark, hSS(.55, .60, f2));
  out.lerp(C.tan, hSS(.60, .65, f3) * .8);
  out.lerp(C.belly, belly);
  return out;
}
function hBake(mesh, M) {                                              // bake camo into a mesh's vertex colours; M maps the mesh into the body frame
  const g = mesh.geometry, p = g.attributes.position, col = new Float32Array(p.count * 3), v = new THREE.Vector3(), c = new THREE.Color();
  for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i).applyMatrix4(M); hCamoColor(v.x, v.y, v.z, 0, c); col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
}

// Fuselage sections [z, half-width, top y, bottom y, squareness]. The tandem cockpits are two bubbles raised out of the nose line (gunner low and
// in front, pilot higher behind, a dip between), then the body swells into a wide, boxy troop cabin and tapers into the tail boom.
const SECS = [
  [-6.6, .10, 1.42, 1.02, 2.2], [-6.3, .38, 1.78, .98, 2.3], [-5.7, .55, 2.20, .92, 2.4], [-4.9, .66, 2.58, .86, 2.5], [-4.1, .70, 2.34, .84, 2.5],
  [-3.3, .80, 2.96, .80, 2.5], [-2.5, .88, 3.00, .78, 2.55], [-1.7, 1.02, 2.80, .74, 2.65], [-1.0, 1.20, 2.68, .72, 2.8], [-.2, 1.26, 2.70, .70, 2.9],
  [1.4, 1.26, 2.70, .70, 2.9], [2.6, 1.12, 2.58, .76, 2.7], [3.6, .86, 2.40, .90, 2.55], [4.8, .60, 2.28, 1.05, 2.5], [6.8, .38, 2.20, 1.35, 2.3],
  [9.0, .22, 2.20, 1.65, 2.2], [10.6, .12, 2.22, 1.85, 2.2], [11.2, .06, 2.20, 1.95, 2.2],
];
const hLoft = () => cached('mi24Loft', () => ({
  cA: new THREE.CatmullRomCurve3(SECS.map(q => hV(q[0], q[1], q[2])), false, 'centripetal'),
  cB: new THREE.CatmullRomCurve3(SECS.map(q => hV(q[3], q[4], 0)), false, 'centripetal'),
}));
const hSecCache = new Map();
function hSec(z) {                                        // the loft's section at z (found by bisection along the spline)
  const k = Math.round(z * 1e4); if (hSecCache.has(k)) return hSecCache.get(k);
  const { cA, cB } = hLoft(); let lo = 0, hi = 1;
  for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if (cA.getPoint(m).x < z) lo = m; else hi = m; }
  const a = cA.getPoint(lo), b = cB.getPoint(lo), r = { w: a.y, top: a.z, bot: b.x, n: b.y }; hSecCache.set(k, r); return r;
}
// The cabin's lower half flares out by up to 15% (zero at the cabin's mid-height, full at the belly), fading out toward the cockpit and the tail boom.
const hBelly = (z, y, c0, h) => 1 + .15 * hSS(-2.2, -1.0, z) * (1 - hSS(2.6, 3.8, z)) * hSS(0, 1, (c0 - y) / h);
const hSide = (z, y) => {                                 // x of the hull's right-hand side at (z, y)
  const s = hSec(z), yc = (s.top + s.bot) / 2, h = (s.top - s.bot) / 2, r = Math.abs(y - yc) / h;
  return r >= 1 ? 0 : s.w * Math.pow(1 - Math.pow(r, s.n), 1 / s.n) * hBelly(z, y, yc, h);
};

// Sculpted fuselage lofted along Z (superellipse cross-sections). The canopy panes are part of the same surface: quads of the nose that are
// swapped to dark glass, with frame quads left along their borders, across the windscreen and down the spine.
function hFuselage(t) {
  const NU = 260, NS = 66, { cA, cB } = hLoft();   // 66 columns: the top of the hull (column 16.5) is the middle of a quad, so the spine is centred on x = 0
  const pos = [], uv = [], col = [], rowZ = [], c = new THREE.Color();
  for (let i = 0; i <= NU; i++) {
    const u = i / NU, a = cA.getPoint(u), b = cB.getPoint(u), z = a.x, w = a.y, top = a.z, bot = b.x, n = b.y, c0 = (top + bot) / 2, h = (top - bot) / 2; rowZ.push(z);
    for (let j = 0; j <= NS; j++) {
      const an = j / NS * PI * 2, co = Math.cos(an), si = Math.sin(an);
      const y = c0 + h * Math.sign(si) * Math.pow(Math.abs(si), 2 / n), x = w * Math.sign(co) * Math.pow(Math.abs(co), 2 / n) * hBelly(z, y, c0, h);
      pos.push(x, y, z); uv.push(u * 6, j / NS * 2);
      hCamoColor(x, y, z, 1 - hSS(.1, .27, (y - bot) / (2 * h)), c); col.push(c.r, c.g, c.b);   // pale grey-blue underside
    }
  }
  const rowAt = z => { let k = 0; for (let i = 0; i <= NU; i++) if (Math.abs(rowZ[i] - z) < Math.abs(rowZ[k] - z)) k = i; return k; };
  // canopy panes, as [first row z, last row z, cross-bar z's, half-width in columns at z]. The gunner's canopy narrows toward the nose tip for a teardrop profile.
  const zones = [
    [-5.85, -4.2, [-5.35], z => Math.round(3 + 6 * hSS(-5.85, -4.55, z))],
    [-3.85, -1.95, [-3.2, -2.55], () => 9],
  ].map(([z0, z1, bars, hwAt]) => {
    const i0 = rowAt(z0), i1 = rowAt(z1);
    return { i0, i1, bars: new Set(bars.map(rowAt)), hw: Array.from({ length: i1 - i0 }, (_, k) => hwAt((rowZ[i0 + k] + rowZ[i0 + k + 1]) / 2)) };
  });
  const body = [], glass = [], frame = [];
  for (let i = 0; i < NU; i++) for (let j = 0; j < NS; j++) {
    const a = i * (NS + 1) + j, b = a + NS + 1, q = [a, a + 1, b, b, a + 1, b + 1];
    let list = body;
    for (const zn of zones) if (i >= zn.i0 && i < zn.i1) {
      const r = i - zn.i0, k = Math.abs(j - 16), hw = zn.hw[r];       // k = columns from the spine (column 16 is its own mirror image)
      if (k > hw) continue;
      const narrower = Math.min(zn.hw[r - 1] ?? 0, zn.hw[r + 1] ?? 0);   // keeps the frame outline unbroken where the pane narrows
      list = (r === 0 || i === zn.i1 - 1 || zn.bars.has(i) || k === 0 || k === hw || k > narrower) ? frame : glass;
    }
    list.push(...q);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setIndex([...body, ...glass, ...frame]);
  g.addGroup(0, body.length, 0); g.addGroup(body.length, glass.length, 1); g.addGroup(body.length + glass.length, frame.length, 2);
  g.computeVertexNormals();
  const nr = g.attributes.normal;                                   // merge the seam normals so it shades smoothly
  for (let i = 0; i <= NU; i++) {
    const p = i * (NS + 1), q = p + NS;
    const x = nr.getX(p) + nr.getX(q), y = nr.getY(p) + nr.getY(q), z = nr.getZ(p) + nr.getZ(q), l = Math.hypot(x, y, z) || 1;
    nr.setXYZ(p, x / l, y / l, z / l); nr.setXYZ(q, x / l, y / l, z / l);
  }
  const m = new THREE.Mesh(g, [t.camo, t.canopy, t.frame]); m.castShadow = m.receiveShadow = true; return m;
}

// A patch lying on the hull's side (sx = +1 starboard, -1 port) between z0..z1 and y0..y1, lifted off the surface by `off`.
// ox/oy shift it into a hinge group's local frame. With camo = true it takes the same camouflage as the hull around it.
function hPatch(sx, z0, z1, y0, y1, off, ox, oy, material, camo, nz = 14, ny = 8) {
  const pos = [], col = [], idx = [], c = new THREE.Color();
  for (let iy = 0; iy <= ny; iy++) for (let iz = 0; iz <= nz; iz++) {
    const y = y0 + (y1 - y0) * iy / ny, z = z0 + (z1 - z0) * iz / nz, x = sx * (hSide(z, y) + off);
    pos.push(x - ox, y - oy, z);
    if (camo) { const s = hSec(z); hCamoColor(x, y, z, 1 - hSS(.1, .27, (y - s.bot) / (s.top - s.bot)), c); col.push(c.r, c.g, c.b); }
  }
  for (let iy = 0; iy < ny; iy++) for (let iz = 0; iz < nz; iz++) {
    const a = iy * (nz + 1) + iz, b = a + 1, d = a + nz + 1, e = d + 1;
    if (sx > 0) idx.push(a, d, b, b, d, e); else idx.push(a, b, d, b, e, d);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  if (camo) g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx); g.computeVertexNormals();
  const m = new THREE.Mesh(g, material); m.castShadow = m.receiveShadow = true; return m;
}

// Troop doors on both sides of the cabin. Each is split in two: an upper door with portholes that slides aft, and a lower panel hinged at its
// bottom edge that folds down into a step. Both sit on the hull's own curve, over a dark recess that shows when they open.
function hDoors(body, t) {
  const Z0 = -1.0, Z1 = .6, YB = .98, YM = 1.6, YT = 2.34, doors = [], zc = (Z0 + Z1) / 2;
  [-1, 1].forEach(sx => {
    body.add(hPatch(sx, Z0 - .03, Z1 + .03, YB - .03, YT + .03, .008, 0, 0, t.dark, false));          // door opening (a dark recess)
    // upper door with portholes, handle and a slide rail
    const up = new THREE.Group(); up.name = sx < 0 ? 'doorL' : 'doorR'; body.add(up);
    up.add(hPatch(sx, Z0, Z1, YM + .02, YT, .022, 0, 0, t.door, true));
    [-.7, -.25, .2].forEach(zz => {
      const y = 1.98, X = hSide(zz, y), dX = (hSide(zz, y + .02) - hSide(zz, y - .02)) / .04, n = hV(sx, -dX, 0).normalize();
      const ring = add(up, new THREE.TorusGeometry(.105, .018, 8, 28), t.dark, sx * (X + .03), y, zz); ring.quaternion.setFromUnitVectors(hV(0, 0, 1), n);
      const gl = add(up, new THREE.CylinderGeometry(.092, .092, .02, 24), t.canopy, sx * (X + .03), y, zz); gl.quaternion.setFromUnitVectors(hV(0, 1, 0), n);
    });
    add(up, new THREE.BoxGeometry(.05, .22, .05), t.metal, sx * (hSide(.5, 1.8) + .04), 1.8, .5);
    up.add(hPatch(sx, Z0, Z1, YT - .03, YT, .03, 0, 0, t.dark, false, 14, 1));                       // upper slide rail
    // lower fold-down step, hinged along its bottom edge
    const xh = sx * (hSide(zc, YB) + .022), rp = new THREE.Group(); rp.name = sx < 0 ? 'rampL' : 'rampR'; rp.position.set(xh, YB, 0); body.add(rp);
    rp.add(hPatch(sx, Z0, Z1, YB, YM - .02, .022, xh, YB, t.door, true));
    [1.14, 1.28, 1.42].forEach(y => rp.add(hPatch(sx, Z0 + .08, Z1 - .08, y - .012, y + .012, .036, xh, YB, t.dark, false, 10, 1)));   // stiffening ribs / treads
    add(rp, new THREE.CylinderGeometry(.03, .03, Z1 - Z0, 12).rotateX(PI / 2), t.metal, sx * .01, 0, zc);                                // hinge barrel
    [Z0 + .05, Z1 - .05].forEach(zz => add(rp, new THREE.BoxGeometry(.05, .12, .06), t.metal, sx * .02, .3, zz));                          // latches
    doors.push({ sx, up, rp });
  });
  return doors;
}

// Rocket pod (7 tube covers on the front face) hanging along Z, muzzle at -Z.
function hPod(parent, t, x, y, z) {
  const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g);
  add(g, new THREE.CylinderGeometry(.19, .19, 1.9, 24).rotateX(PI / 2), t.pod);
  add(g, new THREE.ConeGeometry(.19, .4, 24).rotateX(PI / 2), t.pod, 0, 0, 1.15);
  add(g, new THREE.TorusGeometry(.2, .02, 6, 24), t.dark, 0, 0, -.95);
  [-.5, .1, .6].forEach(zz => add(g, new THREE.CylinderGeometry(.2, .2, .05, 24).rotateX(PI / 2), t.dark, 0, 0, zz));
  add(g, new THREE.CylinderGeometry(.17, .17, .02, 24).rotateX(PI / 2), t.dark, 0, 0, -.96);
  [[0, 0]].concat([0, 1, 2, 3, 4, 5].map(k => [Math.cos(k * PI / 3) * .095, Math.sin(k * PI / 3) * .095])).forEach(([px, py]) =>
    add(g, new THREE.CylinderGeometry(.038, .038, .02, 12).rotateX(PI / 2), t.metal, px, py, -.975));
  return g;
}
// Pair of anti-tank missiles on a launch rail, nose at -Z.
function hMissiles(parent, t, x, y, z) {
  const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g);
  add(g, new THREE.BoxGeometry(.7, .1, 1.7), t.dark, 0, .02, 0);
  [-1, 1].forEach(s => {
    add(g, new THREE.CylinderGeometry(.075, .075, 1.6, 16).rotateX(PI / 2), t.white, s * .22, -.12, 0);
    add(g, new THREE.ConeGeometry(.075, .35, 16).rotateX(-PI / 2), t.white, s * .22, -.12, -.97);
    add(g, new THREE.CylinderGeometry(.04, .075, .18, 16).rotateX(PI / 2), t.dark, s * .22, -.12, .88);
    [0, 1, 2, 3].forEach(k => { const f = add(g, new THREE.BoxGeometry(.02, .2, .24), t.dark, s * .22 + Math.sin(k * PI / 2) * .13, -.12 + Math.cos(k * PI / 2) * .13, .62); f.rotation.z = -k * PI / 2; });
  });
  return g;
}

// One stub wing with anhedral, a pylon row, two rocket pods and a missile pair. sx = +1 starboard, -1 port.
function hWing(body, t, sx, weapons) {
  const wg = new THREE.Group(); wg.position.set(sx * 1.2, 1.35, 1.2); wg.rotation.z = -sx * .21; body.add(wg);
  const sh = new THREE.Shape(); [[0, -.6], [2.3, -.2], [2.3, .7], [0, .8]].forEach(([x, z], i) => i ? sh.lineTo(sx * x, -z) : sh.moveTo(sx * x, -z));
  const geo = new THREE.ExtrudeGeometry(sh, { depth: .12, bevelEnabled: true, bevelThickness: .02, bevelSize: .02, bevelSegments: 2 }).rotateX(-PI / 2).translate(0, -.06, 0);
  const w = new THREE.Mesh(geo, t.olive); w.castShadow = w.receiveShadow = true; wg.add(w);
  add(wg, new THREE.SphereGeometry(.07, 10, 8), sx < 0 ? t.ledR : t.ledG, sx * 2.3, 0, .25);                 // navigation light on the tip
  [[.7, 0], [1.3, 1], [1.9, 2]].forEach(([d, k]) => {
    const h = new THREE.Group(); h.position.set(sx * d, -.08, .3); h.rotation.z = sx * .21; wg.add(h);   // counter-rotated so weapons hang level
    add(h, new THREE.BoxGeometry(.12, .42, .7), t.dark, 0, -.2, 0);                                      // pylon
    const wpn = k < 2 ? hPod(h, t, 0, -.63, 0) : hMissiles(h, t, 0, -.5, 0);
    wpn.name = (k < 2 ? 'pod' : 'missiles') + (sx < 0 ? 'L' : 'R') + (k < 2 ? k : ''); weapons.push(wpn);
  });
}

// Landing gear leg: strut, a wheel (or pair) on an axle, origin at the attachment point.
function hLeg(parent, t, name, x, y, z, drop, r, wheelW, pair) {
  const g = new THREE.Group(); g.name = name; g.position.set(x, y, z); parent.add(g);
  add(g, new THREE.CylinderGeometry(.045, .06, drop, 12), t.metal, 0, -drop / 2, 0);
  add(g, new THREE.CylinderGeometry(.03, .03, pair ? .5 : .1, 10), t.steel, 0, -drop, 0).rotation.z = PI / 2;
  (pair ? [-1, 1] : [0]).forEach(s => {
    add(g, new THREE.CylinderGeometry(r, r, wheelW, 28), t.rubber, s * .21, -drop, 0).rotation.z = PI / 2;
    add(g, new THREE.CylinderGeometry(r * .5, r * .5, wheelW + .02, 20), t.steel, s * .21, -drop, 0).rotation.z = PI / 2;
  });
  return g;
}

export function buildMi24() {
  const t = hMats();
  const root = new THREE.Group(); root.name = 'mi24';
  const air = new THREE.Group(); air.name = 'airframe'; air.position.y = BODY_Y; root.add(air);
  const body = new THREE.Group(); body.name = 'body'; body.position.y = -BODY_Y; air.add(body);   // built in ground coordinates
  const weapons = [];

  // ---- fuselage: nose, tandem cockpit, roomy cabin, then the tapering tail boom
  body.add(hFuselage(t));                                          // includes the canopy glass and frames

  // (the tandem cockpits are part of the nose loft above: two sloped bubbles with glass panes and frames cut into the surface)

  // ---- nose: chin gun turret, sensor pod, pitot probes
  const gun = new THREE.Group(); gun.name = 'gun'; gun.position.set(0, .86, -5.7); body.add(gun);
  add(gun, new THREE.SphereGeometry(.26, 18, 14), t.olive);
  const gp = new THREE.Group(); gp.name = 'gunPitch'; gun.add(gp);
  add(gp, new THREE.CylinderGeometry(.13, .13, .5, 16).rotateX(PI / 2), t.metal, 0, 0, -.45);
  [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([a, b]) => add(gp, new THREE.CylinderGeometry(.032, .032, .7, 10).rotateX(PI / 2), t.dark, a * .055, b * .055, -.6));
  add(gp, new THREE.TorusGeometry(.1, .018, 6, 16), t.metal, 0, 0, -.9);
  add(body, new THREE.BoxGeometry(.4, .3, .6), t.dark, -.4, .92, -5.1);                          // sensor pod under the nose
  add(body, new THREE.CylinderGeometry(.09, .09, .1, 12).rotateX(PI / 2), t.glass, -.4, .92, -5.42);
  add(body, new THREE.CylinderGeometry(.018, .018, 1.2, 8).rotateX(PI / 2), t.steel, .5, 1.5, -6.0);   // pitot probes
  add(body, new THREE.CylinderGeometry(.018, .018, 1.0, 8).rotateX(PI / 2), t.steel, -.5, 1.5, -5.9);

  // ---- cabin: split troop doors on both sides (upper door with portholes, lower fold-down step)
  const doors = hDoors(body, t);

  // ---- engines: two nacelles with round dust intakes and downward-angled exhausts, between them the gearbox fairing
  [-1, 1].forEach(s => {
    const eng = add(body, new THREE.CylinderGeometry(.5, .5, 3.6, 32, 28).rotateX(PI / 2), t.camo, s * .52, 2.95, .1);
    eng.updateMatrix(); hBake(eng, eng.matrix);
    add(body, new THREE.TorusGeometry(.42, .07, 10, 36), t.steel, s * .52, 2.95, -1.72);          // intake ring
    add(body, new THREE.CylinderGeometry(.4, .4, .05, 32).rotateX(PI / 2), t.dark, s * .52, 2.95, -1.7);
    add(body, new THREE.ConeGeometry(.14, .34, 16).rotateX(-PI / 2), t.steel, s * .52, 2.95, -1.86);   // intake bullet
    [-.28, -.1, .1, .28].forEach(xx => add(body, new THREE.BoxGeometry(.025, .72, .03), t.metal, s * .52 + xx, 2.95, -1.74));   // intake grille bars
    const ex = new THREE.Group(); ex.position.set(s * .62, 2.85, 1.85); ex.rotation.set(.3, s * .35, 0); body.add(ex);
    add(ex, new THREE.CylinderGeometry(.22, .27, .95, 20).rotateX(PI / 2), t.metal, 0, 0, .45);
    add(ex, new THREE.CylinderGeometry(.19, .19, .04, 20).rotateX(PI / 2), t.dark, 0, 0, .94);
  });
  add(body, new THREE.BoxGeometry(.8, .42, 2.4), t.olive, 0, 3.3, -.1);                          // gearbox fairing between the engines
  add(body, new THREE.BoxGeometry(.5, .3, 1.2), t.dark, 0, 3.53, .5);                            // oil cooler
  add(body, new THREE.CylinderGeometry(.2, .3, .9, 20), t.metal, 0, 3.65, MAST_Z);              // rotor mast
  add(body, new THREE.CylinderGeometry(.4, .4, .06, 24), t.steel, 0, 3.85, MAST_Z);             // swashplate

  // ---- main rotor: five blades on a hub with grips, dampers and pitch links; a faint disc fades in with speed
  const rotor = new THREE.Group(); rotor.name = 'rotor'; rotor.position.set(0, HUB_Y, MAST_Z); body.add(rotor);
  add(rotor, new THREE.CylinderGeometry(.34, .38, .28, 28), t.steel, 0, 0, 0);
  add(rotor, new THREE.CylinderGeometry(.2, .3, .16, 24), t.metal, 0, .2, 0);
  const bs = new THREE.Shape(); bs.moveTo(.8, -.26); bs.lineTo(R_MAIN - .26, -.26); bs.quadraticCurveTo(R_MAIN, -.26, R_MAIN, 0); bs.quadraticCurveTo(R_MAIN, .26, R_MAIN - .26, .26); bs.lineTo(.8, .26); bs.lineTo(.8, -.26);
  const bladeGeo = new THREE.ExtrudeGeometry(bs, { depth: .045, bevelEnabled: false }).rotateX(-PI / 2);
  for (let k = 0; k < 5; k++) {
    const a = new THREE.Group(); a.rotation.y = k * 2 * PI / 5; rotor.add(a);
    add(a, new THREE.CylinderGeometry(.1, .12, .62, 14).rotateZ(PI / 2), t.metal, .6, 0, 0);       // blade grip sleeve
    add(a, new THREE.BoxGeometry(.18, .12, .2), t.dark, .45, .12, .24);                            // damper
    add(a, new THREE.CylinderGeometry(.012, .012, .5, 6), t.steel, .5, -.25, -.22);                // pitch link
    const bl = new THREE.Group(); bl.rotation.z = .05; a.add(bl);                                   // a little coning
    const b = new THREE.Mesh(bladeGeo, t.blade); b.castShadow = true; b.rotation.x = .1; bl.add(b);
    add(bl, new THREE.BoxGeometry(.9, .004, .5), t.tip, R_MAIN - .45, .047, 0);                    // red tip patch
    add(bl, new THREE.BoxGeometry(.9, .004, .5), t.tip, R_MAIN - .45, -.003, 0);
  }
  const mainBlur = new THREE.MeshBasicMaterial({ color: 0x2b2f2a, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false });
  const mainDisc = new THREE.Mesh(new THREE.CircleGeometry(R_MAIN, 72).rotateX(-PI / 2), mainBlur); mainDisc.position.y = .1; rotor.add(mainDisc);

  // ---- tail: boom antenna, swept fin, stabiliser, bumper, and the three-blade tail rotor on the starboard side of the fin
  const fin = new THREE.Shape(); fin.moveTo(7.8, 2.15); fin.lineTo(10.35, 4.5); fin.lineTo(11.4, 4.5); fin.lineTo(11.45, 2.0); fin.lineTo(7.8, 2.15);
  extrudeProfile(body, fin, .1, .015, .015, t.olive);
  add(body, new THREE.BoxGeometry(2.3, .05, .7), t.olive, 0, 2.1, 10.05);                         // horizontal stabiliser
  add(body, new THREE.BoxGeometry(.08, .8, .1), t.metal, 0, 1.3, 9.3).rotation.x = -.35;        // tail bumper strut
  add(body, new THREE.BoxGeometry(.14, .06, .5), t.dark, 0, .93, 9.5);
  add(body, new THREE.CylinderGeometry(.01, .02, .8, 6), t.steel, 0, 2.6, 5.0);                  // whip aerial
  add(body, new THREE.SphereGeometry(.06, 8, 8), t.ledR, 0, 4.55, 11.4);                         // tail light
  add(body, new THREE.CylinderGeometry(.14, .17, .4, 18).rotateZ(PI / 2), t.metal, TAIL_AT.x - Math.sign(TAIL_AT.x) * .12, TAIL_AT.y, TAIL_AT.z);   // tail gearbox
  const tail = new THREE.Group(); tail.name = 'tailRotor'; tail.position.set(TAIL_AT.x, TAIL_AT.y, TAIL_AT.z); body.add(tail);
  add(tail, new THREE.CylinderGeometry(.11, .13, .16, 16).rotateZ(PI / 2), t.steel);
  for (let k = 0; k < 3; k++) {
    const g = new THREE.Group(); g.rotation.x = k * 2 * PI / 3; tail.add(g);
    const sd = Math.sign(TAIL_AT.x), b = add(g, new THREE.BoxGeometry(.035, R_TAIL - .15, .26), t.blade, sd * .1, .15 + (R_TAIL - .15) / 2, 0); b.rotation.y = .3 * sd;
    add(g, new THREE.BoxGeometry(.04, .3, .27), t.tip, sd * .1, R_TAIL - .15, 0).rotation.y = .3 * sd;
  }
  const tailBlur = new THREE.MeshBasicMaterial({ color: 0x2b2f2a, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false });
  tail.add(new THREE.Mesh(new THREE.CircleGeometry(R_TAIL, 40).rotateY(PI / 2), tailBlur));

  // ---- stub wings with weapons, and the landing gear
  hWing(body, t, 1, weapons); hWing(body, t, -1, weapons);
  [-1, 1].forEach(s => add(body, new THREE.BoxGeometry(.4, .46, 1.5), t.olive, s * 1.35, 1.1, 1.5));   // main gear sponsons
  hLeg(body, t, 'gearNose', 0, .8, -4.45, .5, .3, .14, true);
  hLeg(body, t, 'gearL', -1.4, 1.2, 1.5, .75, .45, .26, false);
  hLeg(body, t, 'gearR', 1.4, 1.2, 1.5, .75, .45, .26, false);

  root.userData.weapons = weapons;
  root.userData.parts = { air, rotor, tail, mainBlur, tailBlur, gun, gp, nose: body.getObjectByName('gearNose'), gl: body.getObjectByName('gearL'), gr: body.getObjectByName('gearR'), doors };
  poseMi24(root);
  return root;
}

export function poseMi24(root, spin = 0, pitch = 0, roll = 0, blur = 0, gunYaw = 0, gunPitch = 0, gear = 0, doors = 0) {
  const p = root.userData.parts, b = Math.min(1, Math.max(0, blur)), g = Math.min(1, Math.max(0, gear));
  p.air.rotation.set(-pitch, 0, -roll);                              // positive pitch = nose (-Z) down, positive roll = right side down
  p.rotor.rotation.y = -spin;                                        // clockwise seen from above
  p.tail.rotation.x = -spin * 5.2;                                   // (mirrored with the rotor now on the port side)
  p.mainBlur.opacity = .09 * b; p.tailBlur.opacity = .12 * b;
  p.gun.rotation.y = gunYaw; p.gp.rotation.x = -gunPitch;            // positive gunPitch = muzzle down
  p.nose.rotation.x = -g * PI / 2;                                   // nose leg folds back into the belly
  p.gl.rotation.z = g * 1.45; p.gr.rotation.z = -g * 1.45;           // main legs fold inward
  const e = Math.min(1, Math.max(0, doors)), k = e * e * (3 - 2 * e);
  p.doors.forEach(d => {
    d.rp.rotation.z = -d.sx * k * 1.45;                              // lower panel folds down and out into a step
    d.up.position.set(d.sx * .07 * k, 0, .85 * k);                   // upper door slides aft along its rail
  });
}
