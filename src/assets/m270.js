// M270 MLRS multiple-launch rocket system (placeholder): compact turntable mount, no lift column or platform.
// One continuous upper body runs from the nose, up the sloped front, over a wide armoured cab (louvred shutters over the
// windscreen panels; the rear wall is angled forward and stepped) and back along the rear engine deck. Tracks: six road wheels,
// front drive sprocket, rear idler, armour skirts over the top run.
// The launcher is a wide, squat box (two six-tube pods in one shell). It sits on a low, flush circular turntable ring on the
// rear deck; a compact rotating base carries two short trunnion arms that hold a hinge axle under the box's rear bottom edge.
// The box pitches up from that rear hinge, so it stays close to the vehicle; two short elevation rams run from the base
// to brackets under the front of the box and lengthen as it rises. Stowed, the box lies flat (0 degrees) on resting blocks.
// Deployed, it rests at a firing-ready elevation (default ~25 degrees, never below 15), so the front is always up over the cab
// roof before the turntable turns and the rockets always aim up and over the vehicle.
// Origin on the ground at the centre of the hull; the nose faces -Z. ~6.9 m long, ~2.9 m wide (with skirts), ~2.35 m to the cab roof.
// Named parts: `hull` (everything), `turret` (the rotating base, turns about Y), `boom` (the launcher box, pitches about its rear hinge).
// Drive it with poseM270(root, traverse, elevate, deploy):
//   traverse  angle in radians (0 = muzzles over the cab, PI = over the tail), applied once the pod is up
//   elevate   0..1 of the 66 degree range for the deployed pitch (default M270_READY ~ 25 degrees; clamped to at least 15)
//   deploy    0 = stowed (flat, locked at 0) .. 1 = deployed; animate it for a sequenced move: elevate, then traverse
//             (and the reverse when stowing: traverse back to 0, then lower the pod flat).
import * as THREE from 'three';
import { add, mat, cached, PI, roundedRect, canvasTexture, seededRandom, extrudeProfile } from './common.js';

const DECK = 1.54;        // top of the rear engine deck (profile 1.5 + bevel)
const TURN_Z = 1.7;       // turntable centre (and hinge) along the hull; the box lies forward of it (was 2.25: moved toward the middle of the hull)
const RING_TOP = .06;     // the fixed ring is nearly flush with the deck
const BOX_Y = .36;        // hinge axle / underside of the box above the turntable ring
const ELEV_MAX = 1.15, MIN_EL = 15 * PI / 180, RAM_BL = .7, RAM_ATT = 1.9; // elevation range; ram barrel length; ram attach distance from the hinge
export const M270_READY = 25 * PI / 180 / ELEV_MAX; // default firing-ready elevation, ~25 degrees (as the 0..1 elevate value)

// light dust/grain texture, tinted by the material colour (colour map is sRGB so it doesn't render too bright)
function mGrainCanvas(bump) {
  const S = 256, rnd = seededRandom(270);
  const c = document.createElement('canvas'); c.width = c.height = S; const x = c.getContext('2d');
  x.fillStyle = bump ? '#808080' : '#f2f2f2'; x.fillRect(0, 0, S, S);
  if (!bump) for (let k = 0; k < 14; k++) {
    const px = rnd() * S, py = rnd() * S, r = 30 + rnd() * 70, g = x.createRadialGradient(px, py, 0, px, py, r), v = rnd() > .5 ? 255 : 0;
    g.addColorStop(0, `rgba(${v},${v},${v},.07)`); g.addColorStop(1, `rgba(${v},${v},${v},0)`); x.fillStyle = g; x.fillRect(px - r, py - r, 2 * r, 2 * r);
  }
  for (let i = 0; i < 6000; i++) { const v = rnd() > .5 ? 255 : 0; x.fillStyle = `rgba(${v},${v},${v},${bump ? .06 : .035})`; x.fillRect(rnd() * S, rnd() * S, 1 + rnd() * 2, 1 + rnd() * 2); }
  return c;
}
const mSkin = (hex, rough, metal) => new THREE.MeshStandardMaterial({
  color: hex, roughness: rough, metalness: metal, bumpScale: .3,
  map: cached('m270GrainMap', () => { const t = canvasTexture(mGrainCanvas(false)); t.colorSpace = THREE.SRGBColorSpace; return t; }),
  bumpMap: cached('m270GrainBump', () => canvasTexture(mGrainCanvas(true))),
});
// Camouflage: the paint's own colour as the base, with irregular patches of darker olive, brown and tan over it (big splotches, each made of overlapping circles), and the same fine grain.
// The patches are drawn in the colours themselves (the material's colour is white), so each panel shows the pattern across its face.
function mCamoCanvas(hex, seed) {
  const S = 256, rnd = seededRandom(seed), c = document.createElement('canvas'); c.width = c.height = S; const x = c.getContext('2d');
  const r0 = hex >> 16 & 255, g0 = hex >> 8 & 255, b0 = hex & 255, rgb = (r, g, b, a = 1) => `rgba(${Math.round(r)},${Math.round(g)},${Math.round(b)},${a})`;
  x.fillStyle = rgb(r0, g0, b0); x.fillRect(0, 0, S, S);
  const colours = [rgb(r0 * .85, g0 * .88, b0 * .85), rgb(r0 * 1.2, g0 * .94, b0 * .84), rgb(r0 * 1.36, g0 * 1.2, b0 * 1.12), rgb(r0 * 1.1, g0 * .88, b0 * .7)]; // darker olive, a brown, a tan, a redder brown
  for (let k = 0; k < 8; k++) { // patches
    const col = colours[k % 4 === 3 ? (rnd() < .5 ? 1 : 3) : k % 4], px = rnd() * S, py = rnd() * S, r = 34 + rnd() * 52, stretch = .6 + rnd() * 1.1, rot = rnd() * 3;
    x.fillStyle = col; x.save(); x.translate(px, py); x.rotate(rot);
    for (let j = 0; j < 8; j++) { const a = rnd() * 6.283, d = rnd() * r * .7; x.beginPath(); x.ellipse(Math.cos(a) * d * stretch, Math.sin(a) * d, r * (.35 + rnd() * .4) * stretch, r * (.3 + rnd() * .35), rnd() * 3, 0, 6.283); x.fill(); }
    x.restore();
  }
  for (let i = 0; i < 6000; i++) { const v = rnd() > .5 ? 255 : 0; x.fillStyle = `rgba(${v},${v},${v},.035)`; x.fillRect(rnd() * S, rnd() * S, 1 + rnd() * 2, 1 + rnd() * 2); } // grain
  return c;
}
const mCamo = (hex, rough, metal, seed) => new THREE.MeshStandardMaterial({
  color: 0xffffff, roughness: rough, metalness: metal, bumpScale: .3,
  map: cached('m270Camo' + hex, () => canvasTexture(mCamoCanvas(hex, seed))),
  bumpMap: cached('m270GrainBump', () => canvasTexture(mGrainCanvas(true))),
});
const mMats = () => cached('m270Mats', () => ({
  green: mCamo(0x5b6444, .8, .05, 271), trim: mCamo(0x474e36, .75, .1, 272), pod: mCamo(0x525a3f, .7, .1, 273),
  dark: mat(0x1f1f1c, .85, .1), rubber: mat(0x181816, .95, 0), metal: mat(0x4b4a42, .5, .6),
  lens: mat(0xc7cdd0, .2, .3), amber: mat(0xe0a030, .3, .1, { emissive: 0x3a2400 }),
  glass: mat(0x1d2c38, .15, .5), red: mat(0x8a2222, .5, .1), chrome: mat(0xb9bcbc, .25, .9),
}));
const mClamp = x => Math.min(1, Math.max(0, x));
const mEase = x => { x = mClamp(x); return x * x * (3 - 2 * x); };

// Road wheel / idler / sprocket: axis along X, so group.rotation.x spins it.
function mWheel(parent, t, x, y, z, r, tyre) {
  const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g);
  const side = Math.sign(x);
  if (tyre) add(g, new THREE.CylinderGeometry(r, r, .26, 24), t.rubber).rotation.z = PI / 2;
  add(g, new THREE.CylinderGeometry(r * (tyre ? .74 : 1), r * (tyre ? .74 : 1), .3, 24), t.green).rotation.z = PI / 2;
  add(g, new THREE.CylinderGeometry(r * .3, r * .3, .34, 12), t.dark).rotation.z = PI / 2;
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * PI * 2, b = add(g, new THREE.CylinderGeometry(.02, .02, .03, 6), t.metal, side * .165, Math.sin(a) * r * .52, Math.cos(a) * r * .52);
    b.rotation.z = PI / 2;
  }
  return g;
}

// Flat plate (footprint w x d, lying flat) with rectangular slots cut through it; slots are [cx, cz, width, length].
function mSlottedPlate(parent, w, d, depth, yBase, material, slots) {
  const s = roundedRect(w, d, .06);
  slots.forEach(([cx, cz, sw, sd]) => {
    const h = new THREE.Path(), xa = cx - sw / 2, xb = cx + sw / 2, za = cz - sd / 2, zb = cz + sd / 2;
    h.moveTo(xa, za); h.lineTo(xb, za); h.lineTo(xb, zb); h.lineTo(xa, zb); h.lineTo(xa, za); s.holes.push(h);
  });
  const m = add(parent, new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false }), material, 0, yBase, 0);
  m.rotation.x = -PI / 2; return m;
}

// The launcher box: one wide, squat shell (2.3 x 0.76 x 3.5 m), muzzles at -Z, flat top with recessed rails.
// Its rear bottom edge is the boom's origin (the hinge); the box extends forward (-Z) from there.
function mLauncherBox(parent, t) {
  const W = 2.3, H = .76, L = 3.5, p = new THREE.Group(); p.position.set(0, 0, -L / 2); parent.add(p);
  add(p, new THREE.BoxGeometry(W, H, L), t.pod, 0, H / 2, 0);                                  // shell
  [-1.5, -.75, 0, .75, 1.5].forEach(z => add(p, new THREE.BoxGeometry(W + .06, H - .04, .07), t.trim, 0, H / 2, z)); // side bands
  [-1, 1].forEach(s => [-1, 1].forEach(z => add(p, new THREE.BoxGeometry(.06, .1, .14), t.metal, s * (W / 2 + .02), .55, z))); // lifting lugs
  [-1, 1].forEach(s => {
    add(p, new THREE.BoxGeometry(.18, .1, .3), t.dark, s * .5, -.03, L / 2 - RAM_ATT);          // ram brackets under the front of the box
    add(p, new THREE.CylinderGeometry(.09, .09, .3, 12), t.metal, s * .72, 0, L / 2 - .12).rotation.z = PI / 2;   // hinge knuckles on the rear bottom edge
    add(p, new THREE.BoxGeometry(.26, .12, .24), t.trim, s * .72, .04, L / 2 - .12);           // knuckle mounts
  });
  // (the flat top is plain: the slotted plate, rails and cross slots that were here read as an odd rectangle from above)
  // muzzle face: two pods of 3 x 2 tube covers, and a spine between them
  add(p, new THREE.BoxGeometry(.1, H, .05), t.trim, 0, H / 2, -L / 2 - .02);
  [-.57, .57].forEach(px => [-.33, 0, .33].forEach(cx => [.2, .56].forEach(cy => {
    add(p, new THREE.CylinderGeometry(.12, .12, .04, 16), t.dark, px + cx, cy, -L / 2 - .02).rotation.x = PI / 2;
    add(p, new THREE.TorusGeometry(.125, .015, 6, 16), t.metal, px + cx, cy, -L / 2 - .045);
    add(p, new THREE.CylinderGeometry(.06, .06, .03, 10), t.metal, px + cx, cy, L / 2 + .02).rotation.x = PI / 2;   // rear plugs
  })));
  return p;
}

// Hydraulic ram along local +Z: fixed barrel at the base and a chrome rod whose length is set by aimRam.
function mRam(parent, t) {
  const g = new THREE.Group(); parent.add(g);
  add(g, new THREE.CylinderGeometry(.065, .065, RAM_BL, 12).rotateX(PI / 2), t.metal, 0, 0, RAM_BL / 2);       // barrel
  add(g, new THREE.CylinderGeometry(.08, .08, .1, 12).rotateX(PI / 2), t.dark, 0, 0, RAM_BL - .05);           // gland
  add(g, new THREE.BoxGeometry(.14, .14, .16), t.dark, 0, 0, -.02);                                           // base clevis
  const rod = add(g, new THREE.CylinderGeometry(.036, .036, 1, 10).rotateX(PI / 2), t.chrome);                // piston rod (scaled in z)
  const eye = add(g, new THREE.BoxGeometry(.12, .12, .1), t.dark);                                            // rod eye
  return { g, rod, eye };
}
const mZ = new THREE.Vector3(0, 0, 1), mDir = new THREE.Vector3();
function mAimRam(r, a, p) {
  mDir.subVectors(p, a); const len = mDir.length();
  r.g.position.copy(a); r.g.quaternion.setFromUnitVectors(mZ, mDir.normalize());
  const rl = Math.max(.01, len - RAM_BL + .2);
  r.rod.scale.z = rl; r.rod.position.z = RAM_BL - .2 + rl / 2; r.eye.position.z = len;
}

export function buildM270() {
  const t = mMats();
  const root = new THREE.Group(); root.name = 'm270';
  const hull = new THREE.Group(); hull.name = 'hull'; root.add(hull);

  // ---- upper body: ONE profile from nose, up the sloped front and windscreen, over the cab roof, down to the rear deck.
  const fp = new THREE.Shape(); // side profile: x along the vehicle (nose = -x), y up
  fp.moveTo(-3.4, .85); fp.lineTo(-3.4, 1.3); fp.lineTo(-3.05, 1.7); fp.lineTo(-2.9, 2.3); fp.lineTo(-1.65, 2.3);
  fp.lineTo(-1.3, 1.85); fp.lineTo(-1.3, 1.5); fp.lineTo(3.4, 1.5); fp.lineTo(3.4, .85); fp.lineTo(-3.4, .85);
  extrudeProfile(hull, fp, 2.52, .04, .04, t.green);                                           // 2.6 m wide with the bevels
  add(hull, new THREE.BoxGeometry(1.9, .55, 6.6), t.trim, 0, .62, .05);                        // lower hull between the tracks
  add(hull, new THREE.BoxGeometry(2.4, .12, .14), t.trim, 0, .93, -3.5);                       // front bumper
  [-1, 1].forEach(s => {
    add(hull, new THREE.TorusGeometry(.07, .015, 6, 12), t.metal, s * .8, .93, -3.58);         // tow shackles
    add(hull, new THREE.BoxGeometry(.1, .12, .06), t.red, s * .9, 1.25, 3.47);                 // tail lights
    add(hull, new THREE.BoxGeometry(.5, .3, .04), t.trim, s * .5, 1.05, 3.46);                 // rear plate panels
    const l = new THREE.Group(); l.position.set(s * 1.0, 1.1, -3.46); hull.add(l);             // front light clusters
    add(l, new THREE.BoxGeometry(.4, .22, .05), t.dark);
    [[-.12, t.amber], [0, t.lens], [.12, t.amber]].forEach(([lx, m]) => add(l, new THREE.CylinderGeometry(.045, .045, .03, 12), m, lx, 0, -.03).rotation.x = PI / 2);
  });
  add(hull, new THREE.CylinderGeometry(.05, .05, .2, 8), t.metal, 0, 1.0, 3.55).rotation.x = PI / 2;   // rear pintle

  // grille panel on the sloped lower front
  const gp = new THREE.Group(); gp.position.set(0, 1.546, -3.278); gp.rotation.x = .719; hull.add(gp);
  add(gp, new THREE.BoxGeometry(1.4, .36, .04), t.trim);
  for (let i = -3; i <= 3; i++) add(gp, new THREE.BoxGeometry(1.3, .025, .03), t.dark, 0, i * .045, -.03);

  // ---- cab: three windscreen panels, each with louvred armour shutter slats; side windows; mirrors; roof
  [-.85, 0, .85].forEach(x => {
    const w = new THREE.Group(); w.position.set(x, 2.016, -3.038); w.rotation.x = .2456; hull.add(w);   // follows the windscreen slope
    add(w, new THREE.BoxGeometry(.84, .54, .05), t.dark);                                      // frame
    add(w, new THREE.BoxGeometry(.76, .46, .05), t.glass, 0, 0, -.012);                        // glass
    [-.19, -.095, 0, .095, .19].forEach(y => add(w, new THREE.BoxGeometry(.8, .03, .1), t.trim, 0, y, -.075).rotation.x = .6);  // louvre slats
    [-1, 1].forEach(s => add(w, new THREE.BoxGeometry(.04, .58, .12), t.dark, s * .42, 0, -.06));   // shutter side rails
  });
  [-1, 1].forEach(s => {
    add(hull, new THREE.BoxGeometry(.04, .34, .6), t.glass, s * 1.3, 1.95, -2.3);              // side windows
    add(hull, new THREE.BoxGeometry(.03, .85, .03), t.dark, s * 1.31, 1.9, -1.75);             // door seams
    add(hull, new THREE.BoxGeometry(.03, .06, .14), t.metal, s * 1.32, 1.75, -1.95);           // door handles
    add(hull, new THREE.BoxGeometry(.05, .05, .24), t.metal, s * 1.4, 2.05, -2.75);            // mirror arms
    add(hull, new THREE.BoxGeometry(.04, .3, .16), t.dark, s * 1.46, 2.05, -2.85);             // mirrors
  });
  add(hull, new THREE.BoxGeometry(.8, .05, .7), t.trim, .5, 2.365, -2.2);                      // roof hatch
  add(hull, new THREE.BoxGeometry(.5, .03, .5), t.dark, -.5, 2.355, -2.3);                     // roof vent
  add(hull, new THREE.CylinderGeometry(.008, .014, 2.2, 6), t.metal, 1.05, 3.45, -1.9);        // whip aerial
  add(hull, new THREE.CylinderGeometry(.05, .06, .1, 8), t.dark, 1.05, 2.4, -1.9);             // aerial base

  // ---- engine deck details under the stowed box
  add(hull, new THREE.BoxGeometry(1.3, .04, .6), t.dark, 0, DECK + .01, .4);                   // grille
  [-.45, -.15, .15, .45].forEach(x => add(hull, new THREE.BoxGeometry(.04, .05, .55), t.trim, x, DECK + .03, .4));
  add(hull, new THREE.CylinderGeometry(.06, .06, .3, 8), t.metal, -1.05, DECK + .12, .1);      // exhaust stack

  // ---- tracks: rubber belt, cleats, six road wheels, front sprocket, rear idler, armour skirt over the top run
  const zf = -2.85, zr = 3.0, STR = zr - zf, R = .4, P = 2 * STR + 2 * PI * R, N = 84, d = new THREE.Object3D();
  const beltShape = roundedRect(STR + .8, .8, .4); beltShape.holes.push(roundedRect(STR + .7, .7, .35));
  const beltGeo = new THREE.ExtrudeGeometry(beltShape, { depth: .34, bevelEnabled: false, curveSegments: 24 }); beltGeo.translate(0, 0, -.17);
  const cleatGeo = new THREE.BoxGeometry(.34, .045, .12), TX = 1.15, z0 = (zf + zr) / 2;
  [-1, 1].forEach(s => {
    const belt = add(hull, beltGeo, t.rubber, s * TX, .4, z0); belt.rotation.y = -PI / 2;
    const cleats = new THREE.InstancedMesh(cleatGeo, t.dark, N); cleats.position.x = s * TX; cleats.castShadow = cleats.receiveShadow = true;
    for (let i = 0; i < N; i++) {
      const u = i * P / N; let z, y, th;
      if (u < STR) { z = zf + u; y = .8; th = PI / 2; }
      else if (u < STR + PI * R) { th = PI / 2 - (u - STR) / R; z = zr + R * Math.cos(th); y = .4 + R * Math.sin(th); }
      else if (u < 2 * STR + PI * R) { z = zr - (u - STR - PI * R); y = 0; th = -PI / 2; }
      else { th = -PI / 2 - (u - 2 * STR - PI * R) / R; z = zf + R * Math.cos(th); y = .4 + R * Math.sin(th); }
      d.position.set(0, y, z); d.rotation.set(PI / 2 - th, 0, 0); d.updateMatrix(); cleats.setMatrixAt(i, d.matrix);
    }
    hull.add(cleats);
    [-1.8, -1.0, -.2, .6, 1.4, 2.2].forEach(z => mWheel(hull, t, s * TX, .4, z, .32, true));   // six road wheels
    mWheel(hull, t, s * TX, .4, zf, .34, false);                                                // front drive sprocket
    mWheel(hull, t, s * TX, .4, zr, .34, false);                                                // rear idler
    for (let i = 0; i < 6; i++) add(hull, new THREE.BoxGeometry(.04, .42, .95), t.green, s * 1.42, .68, -2.4 + i * .99);  // skirt plates
    add(hull, new THREE.BoxGeometry(.06, .04, 5.9), t.trim, s * 1.43, .9, .05);                 // skirt top lip
    for (let i = 0; i < 7; i++) add(hull, new THREE.BoxGeometry(.16, .06, .08), t.dark, s * 1.36, .88, -2.9 + i * 1.0);  // skirt brackets
    for (let i = 0; i < 6; i++) add(hull, new THREE.BoxGeometry(.03, .06, .1), t.metal, s * 1.45, .75, -2.4 + i * .99);  // skirt handles
  });

  // ---- turntable: a low circular ring set flush into the rear deck, with a bolt circle
  add(hull, new THREE.CylinderGeometry(1.04, 1.08, RING_TOP, 48), t.metal, 0, DECK + RING_TOP / 2, TURN_Z);   // fixed race
  for (let i = 0; i < 24; i++) { const a = i / 24 * PI * 2; add(hull, new THREE.CylinderGeometry(.03, .03, .025, 6), t.dark, Math.sin(a) * .99, DECK + RING_TOP + .008, TURN_Z + Math.cos(a) * .99); }
  // resting blocks: the box lies on these when stowed (they sit well clear of the pod's swing once it is pitched up)
  [-1, 1].forEach(s => [-.8, .9].forEach(z => {
    add(hull, new THREE.BoxGeometry(.5, RING_TOP + BOX_Y, .5), t.trim, s * .85, DECK + (RING_TOP + BOX_Y) / 2, z);
    add(hull, new THREE.CylinderGeometry(.05, .05, .05, 8), t.metal, s * .85, DECK + RING_TOP + BOX_Y + .02, z);   // locating pins
  }));

  // ---- turret: the compact rotating base (turns about Y). Origin on top of the fixed ring, at the hinge position.
  const turret = new THREE.Group(); turret.name = 'turret'; turret.position.set(0, DECK + RING_TOP, TURN_Z); hull.add(turret);
  add(turret, new THREE.CylinderGeometry(.92, .94, .05, 40), t.dark, 0, .025, 0);              // rotating bearing ring
  for (let i = 0; i < 32; i++) { const a = i / 32 * PI * 2; add(turret, new THREE.BoxGeometry(.06, .05, .08), t.metal, Math.sin(a) * .95, .025, Math.cos(a) * .95).rotation.y = a; }   // gear teeth
  add(turret, new THREE.CylinderGeometry(.72, .8, .14, 32), t.trim, 0, .12, 0);                // round housing
  add(turret, new THREE.BoxGeometry(1.7, .14, .6), t.trim, 0, .12, 0);                         // cross carrier for the trunnion arms
  [-1, 1].forEach(s => {
    add(turret, new THREE.BoxGeometry(.22, .2, .42), t.green, s * .72, .27, 0);               // trunnion arms, bolted down into the base
    add(turret, new THREE.BoxGeometry(.22, .1, .3), t.green, s * .72, .16, .22);              // rear gussets
    add(turret, new THREE.CylinderGeometry(.1, .1, .24, 14), t.metal, s * .72, BOX_Y, 0).rotation.z = PI / 2;   // axle bosses
    add(turret, new THREE.BoxGeometry(.2, .06, .3), t.dark, s * .5, .17, -.65);               // ram base pads on the housing edge
  });
  add(turret, new THREE.CylinderGeometry(.05, .05, 1.9, 12), t.chrome, 0, BOX_Y, 0).rotation.z = PI / 2;   // hinge axle

  // ---- boom: the launcher box, hinged at its rear bottom edge, muzzles toward -Z
  const boom = new THREE.Group(); boom.name = 'boom'; boom.position.set(0, BOX_Y, 0); turret.add(boom);
  mLauncherBox(boom, t);

  // ---- elevation rams: short, from the base up to brackets under the front of the box
  root.userData.rams = [-1, 1].map(s => ({ x: s * .5, ...mRam(turret, t) }));

  poseM270(root);                                                 // starts deployed at the firing-ready elevation
  return root;
}

export function poseM270(root, traverse = 0, elevate = M270_READY, deploy = 1) {
  const d = mClamp(deploy);
  const E = mEase(d / .55), T = mEase((d - .55) / .45);          // pitch up first, then traverse
  const th = Math.max(MIN_EL, mClamp(elevate) * ELEV_MAX) * E;   // deployed pitch is never below 15 degrees
  root.getObjectByName('turret').rotation.y = traverse * T;      // radians; 0 = over the cab, PI = over the tail (locked at 0 when stowed)
  root.getObjectByName('boom').rotation.x = th;                  // 0 = flat on the blocks, pitching up from the rear hinge
  const a = new THREE.Vector3(), p = new THREE.Vector3();
  (root.userData.rams || []).forEach(r => {                      // rams stretch from the base to the brackets under the box
    a.set(r.x, .24, -.7);
    p.set(r.x, BOX_Y - .03 * Math.cos(th) + RAM_ATT * Math.sin(th), -.03 * Math.sin(th) - RAM_ATT * Math.cos(th));
    mAimRam(r, a, p);
  });
}
