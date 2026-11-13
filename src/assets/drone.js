// Folding camera quadcopter (placeholder), after a sleek enterprise drone: a sculpted fuselage and arms in brown-green camouflage (smooth teardrop loft with a
// slanted nose, raised battery hatch, intake scoop, vents and front obstacle-avoidance sensor dots), four tapered two-segment folding
// arms, motor pods with silver/red trim rings and thin semi-transparent folding propeller blades, and a three-axis camera gimbal
// slung under the nose. The front arms sit higher and carry long landing feet under the motor pods; the rear arms are mounted lower
// with short feet, so all four feet land on the same plane.
// Origin at the centre of the fuselage; the nose and camera face -Z. Landed, the origin is 0.2 m above the ground (the feet reach y = -0.2).
// ~0.57 m long body, ~0.8 m across the front motors unfolded, ~0.54 m rotors.
// Named parts: `airframe` (everything, tilts), `gimbal` (fixed mount) > `camera` (pitches), `arm0..3` (fold about the shoulder hinge),
// `rotor0..3` (motor pods), `prop0..3` (the spinning blades). 0 = front-left, 1 = front-right, 2 = rear-left, 3 = rear-right.
// Drive it with poseDrone(root, spin, pitch, roll, gimbal, blur, fold):
//   spin     rotor angle in radians (advance it every frame); diagonal rotors turn opposite ways
//   pitch    radians, positive = nose down (flying forward);  roll  radians, positive = right side down
//   gimbal   camera pitch in radians, 0 = level, positive = looking down (-0.5 .. 1.57)
//   blur     0..1: fades in a translucent disc over each rotor (use it when spinning fast)
//   fold     0 = arms and blades open .. 1 = folded flat against the body (front arms swing back, rear arms swing forward)
import * as THREE from 'three';
import { add, mat, cached, PI, roundedRect, canvasTexture, seededRandom } from './common.js';

// Low detail (the game's drones, small on screen, three or four passes each): the round parts get a third to a half of their segments, the fuselage's grid a third of its rings (buildDrone(true)); the asset viewer builds the full one.
let LOW = false;
const lo = (n, k, min) => LOW ? Math.max(min, Math.round(n * k)) : n;
function SG(r, w = 8, h = 6, ...rest) { return new THREE.SphereGeometry(r, lo(w, .4, 6), lo(h, .4, 4), ...rest); }
function CG(rt, rb, h, rs = 8, hs = 1, ...rest) { return new THREE.CylinderGeometry(rt, rb, h, lo(rs, .4, 7), lo(hs, .4, 1), ...rest); }
function TG(r, t, rs = 8, ts = 6, ...rest) { return new THREE.TorusGeometry(r, t, lo(rs, .5, 5), lo(ts, .4, 10), ...rest); }
const GROUND = -.2;   // landing-foot level, relative to the origin
const R_PROP = .285;  // blade length from the centre

// fine matte grain, tinted by the material colour (colour map is sRGB so it doesn't render too bright)
function dGrainCanvas(bump) {
  const S = 256, rnd = seededRandom(51);
  const c = document.createElement('canvas'); c.width = c.height = S; const x = c.getContext('2d');
  x.fillStyle = bump ? '#808080' : '#f2f2f2'; x.fillRect(0, 0, S, S);
  if (!bump) for (let k = 0; k < 10; k++) {
    const px = rnd() * S, py = rnd() * S, r = 30 + rnd() * 70, g = x.createRadialGradient(px, py, 0, px, py, r), v = rnd() > .5 ? 255 : 0;
    g.addColorStop(0, `rgba(${v},${v},${v},.05)`); g.addColorStop(1, `rgba(${v},${v},${v},0)`); x.fillStyle = g; x.fillRect(px - r, py - r, 2 * r, 2 * r);
  }
  for (let i = 0; i < 7000; i++) { const v = rnd() > .5 ? 255 : 0; x.fillStyle = `rgba(${v},${v},${v},${bump ? .05 : .03})`; x.fillRect(rnd() * S, rnd() * S, 1 + rnd() * 2, 1 + rnd() * 2); }
  return c;
}
const dSkin = (hex, rough, metal) => new THREE.MeshStandardMaterial({
  color: hex, roughness: rough, metalness: metal, bumpScale: .2,
  map: cached('droneGrainMap', () => { const t = canvasTexture(dGrainCanvas(false)); t.colorSpace = THREE.SRGBColorSpace; return t; }),
  bumpMap: cached('droneGrainBump', () => canvasTexture(dGrainCanvas(true))),
});
// Smooth natural camouflage: 3D fractal value-noise thresholded into soft-edged brown / green / tan / dark patches over an olive base.
// It is baked into vertex colours from each vertex's position, so there is no texture tile, no stretching and no visible seams.
const dNoise = cached('droneNoise', () => {
  const rnd = seededRandom(91), V = Array.from({ length: 256 }, () => rnd()), P = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [P[i], P[j]] = [P[j], P[i]]; }
  const h = (x, y, z) => V[P[(P[(P[x & 255] + y) & 255] + z) & 255]], sm = q => q * q * q * (q * (q * 6 - 15) + 10), L = (p, q, k) => p + (q - p) * k;
  return (x, y, z) => {
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), u = sm(x - xi), v = sm(y - yi), w = sm(z - zi);
    return L(L(L(h(xi, yi, zi), h(xi + 1, yi, zi), u), L(h(xi, yi + 1, zi), h(xi + 1, yi + 1, zi), u), v),
             L(L(h(xi, yi, zi + 1), h(xi + 1, yi, zi + 1), u), L(h(xi, yi + 1, zi + 1), h(xi + 1, yi + 1, zi + 1), u), v), w);
  };
});
const dFbm = (x, y, z, o) => .6 * dNoise(x + o, y + o * .7, z + o * 1.3) + .3 * dNoise(x * 2.1 + o + 7, y * 2.1 + 3, z * 2.1 + 5) + .1 * dNoise(x * 4.3 + 13, y * 4.3 + o, z * 4.3);
const dSS = (a, b, x) => { const k = Math.min(1, Math.max(0, (x - a) / (b - a))); return k * k * (3 - 2 * k); };
const dCamoCols = () => cached('droneCamoCols', () => ({ base: new THREE.Color(0x56603b), brown: new THREE.Color(0x6f5738), green: new THREE.Color(0x3f5230), tan: new THREE.Color(0x8e7f56), dark: new THREE.Color(0x2d2c1e) }));
function dCamoColor(x, y, z, out) {
  const C = dCamoCols(), F = 8, f1 = dFbm(x * F, y * F, z * F, 0), f2 = dFbm(x * F, y * F, z * F, 31.7), f3 = dFbm(x * F * 1.3, y * F * 1.3, z * F * 1.3, 71.3);
  out.copy(C.base);
  out.lerp(C.brown, dSS(.47, .51, f1));
  out.lerp(C.green, dSS(.58, .62, f2));
  out.lerp(C.tan, dSS(.59, .63, f3) * .9);
  out.lerp(C.dark, dSS(.645, .68, f3 * .5 + f1 * .5));
  return out;
}
// Bake the camo into a mesh's vertex colours. M maps the mesh's own space into the frame the pattern lives in; `off` shifts the pattern.
function dBakeCamo(mesh, M, off) {
  const g = mesh.geometry, p = g.attributes.position, col = new Float32Array(p.count * 3), v = new THREE.Vector3(), c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).applyMatrix4(M); dCamoColor(v.x + off.x, v.y + off.y, v.z + off.z, c);
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
}
const dMats = () => cached('droneMats', () => ({
  camo: new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: .62, metalness: .12, bumpScale: .15, bumpMap: cached('droneGrainBump', () => canvasTexture(dGrainCanvas(true))) }), arm: dSkin(0x30333a, .55, .26), pod: dSkin(0x24262b, .45, .4),
  black: mat(0x0b0c0d, .4, .4), sensor: mat(0x050506, .08, .7), rubber: mat(0x121213, .9, 0),
  silver: mat(0xbfc3c9, .25, .95), red: mat(0xb3202a, .28, .85), lens: mat(0x07121c, .04, .95),
  blade: new THREE.MeshStandardMaterial({ color: 0x1f2228, roughness: .3, metalness: .1, transparent: true, opacity: .5, side: THREE.DoubleSide }),
  ledR: mat(0xff2a2a, .3, 0, { emissive: 0xff1010, emissiveIntensity: 1.5 }), ledG: mat(0x2aff5a, .3, 0, { emissive: 0x10ff30, emissiveIntensity: 1.5 }),
}));
const dEase = x => { x = Math.min(1, Math.max(0, x)); return x * x * (3 - 2 * x); };
const dWrap = a => Math.atan2(Math.sin(a), Math.cos(a));
const dV = (x, y, z) => new THREE.Vector3(x, y, z);

// Sculpted fuselage: cross-sections [z, half-width, top y, bottom y, squareness] lofted along Z with smooth splines; each section is a
// superellipse, so the body is rounded on top with a flatter belly. The camouflage is baked into vertex colours from each vertex position.
function dFuselage(secs, t) {
  const NU = LOW ? 36 : 100, NS = LOW ? 24 : 72;
  const cA = new THREE.CatmullRomCurve3(secs.map(s => dV(s[0], s[1], s[2])), false, 'centripetal');
  const cB = new THREE.CatmullRomCurve3(secs.map(s => dV(s[3], s[4], 0)), false, 'centripetal');
  const pos = [], uv = [], col = [], c = new THREE.Color();
  for (let i = 0; i <= NU; i++) {
    const u = i / NU, a = cA.getPoint(u), b = cB.getPoint(u), z = a.x, w = a.y, top = a.z, bot = b.x, n = b.y;
    const c0 = (top + bot) / 2, h = (top - bot) / 2;
    for (let j = 0; j <= NS; j++) {
      const an = j / NS * PI * 2, co = Math.cos(an), si = Math.sin(an);
      const x = w * Math.sign(co) * Math.pow(Math.abs(co), 2 / n), y = c0 + h * Math.sign(si) * Math.pow(Math.abs(si), 2 / n);
      pos.push(x, y, z); uv.push(u * 1.6, j / NS * 1.5);
      dCamoColor(x, y, z, c); col.push(c.r, c.g, c.b);
    }
  }
  const idx = [];
  for (let i = 0; i < NU; i++) for (let j = 0; j < NS; j++) { const a = i * (NS + 1) + j, b = a + NS + 1; idx.push(a, a + 1, b, b, a + 1, b + 1); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setIndex(idx); g.computeVertexNormals();
  const nr = g.attributes.normal;                                   // merge the normals along the seam so it shades smoothly
  for (let i = 0; i <= NU; i++) {
    const p = i * (NS + 1), q = p + NS;
    const x = nr.getX(p) + nr.getX(q), y = nr.getY(p) + nr.getY(q), z = nr.getZ(p) + nr.getZ(q), l = Math.hypot(x, y, z) || 1;
    nr.setXYZ(p, x / l, y / l, z / l); nr.setXYZ(q, x / l, y / l, z / l);
  }
  const m = new THREE.Mesh(g, t.camo); m.castShadow = m.receiveShadow = true; return m;
}

// Flattened tapered limb from a to b (r0 at a, r1 at b); `flat` squashes it vertically, `wide` widens it sideways.
function dLimb(parent, material, a, b, r0, r1, flat = .6, wide = 1.2) {
  const dir = new THREE.Vector3().subVectors(b, a), len = dir.length(); dir.normalize();
  const xAxis = new THREE.Vector3().crossVectors(dV(0, 1, 0), dir); if (xAxis.lengthSq() < 1e-6) xAxis.set(1, 0, 0); xAxis.normalize();
  const yAxis = new THREE.Vector3().crossVectors(dir, xAxis).normalize();
  const g = new THREE.Group(); g.position.copy(a); g.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(xAxis, yAxis, dir)); parent.add(g);
  add(g, new CG(r1, r0, len, 20, 16).rotateX(PI / 2), material, 0, 0, len / 2).scale.set(wide, flat, 1);
  return g;
}

// Thin, tapered blade lying along +X; pitched slightly and drooping a little at the tip.
const dBladeGeo = () => cached('droneBladeGeo', () => {
  const s = new THREE.Shape();
  s.moveTo(.035, -.014); s.lineTo(.12, -.017); s.quadraticCurveTo(.21, -.032, R_PROP - .015, -.02); s.quadraticCurveTo(R_PROP + .006, 0, R_PROP - .015, .02);
  s.quadraticCurveTo(.21, .032, .12, .017); s.lineTo(.035, .014); s.lineTo(.035, -.014);
  return new THREE.ExtrudeGeometry(s, { depth: .004, bevelEnabled: false }).rotateX(-PI / 2);
});

// Folding two-blade rotor on a hub: each blade hangs from its own hinge group so it can fold back along the arm.
function dProp(parent, t, i, dir, align) {
  const prop = new THREE.Group(); prop.name = 'prop' + i; prop.position.y = .092; parent.add(prop);
  add(prop, new CG(.026, .032, .022, 20), t.silver, 0, .004, 0);           // hub
  add(prop, new THREE.ConeGeometry(.02, .03, 16), t.black, 0, .025, 0);                        // spinner
  const bl = [0, 1].map(k => {
    const g = new THREE.Group(); g.name = 'blade' + i + k; g.rotation.y = k * PI; prop.add(g);   // (named: a part that moves, so the merge in the game leaves it alone)
    const b = new THREE.Mesh(dBladeGeo(), t.blade); b.rotation.set(.16, 0, -.06); g.add(b);
    return g;
  });
  const blurMat = new THREE.MeshBasicMaterial({ color: 0x1f2228, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false });
  const disc = new THREE.Mesh(new THREE.CircleGeometry(R_PROP, 48).rotateX(-PI / 2), blurMat); disc.position.y = .006; prop.add(disc);
  return { g: prop, A: bl[0], B: bl[1], dir, align, blur: blurMat };
}

// One arm: hinge barrel at the shoulder, a wide flat upper arm, a knuckle, a slender forearm, the motor pod and a landing foot.
// Coordinates are given for the right-hand side and mirrored by sx. Returns what poseDrone needs.
function dArm(air, t, i, sx, front, dir) {
  const S = front ? dV(.105, .03, -.135) : dV(.105, -.035, .135), E = front ? dV(.235, .034, -.185) : dV(.225, -.045, .185);
  const T = front ? dV(.395, .0, -.295) : dV(.37, -.075, .295);
  const g = new THREE.Group(); g.name = 'arm' + i; g.position.set(sx * S.x, S.y, S.z); air.add(g);
  const e = dV(sx * (E.x - S.x), E.y - S.y, E.z - S.z), tp = dV(sx * (T.x - S.x), T.y - S.y, T.z - S.z);
  add(g, new CG(.036, .036, .06, 20), t.black, 0, 0, 0);                    // shoulder hinge barrel
  const lg1 = dLimb(g, t.camo, dV(0, 0, 0), e, .04, .03, .5, 1.3);                                           // upper arm: wide and flat at the body
  const knuckle = add(g, new SG(.031, 24, 16), t.camo, e.x, e.y, e.z); knuckle.scale.set(1, .6, 1);
  const lg2 = dLimb(g, t.camo, e, tp, .028, .02, .6, 1.15);                                                   // slender forearm, angled at the joint
  const off = dV(i * 3.7, i * 1.3, i * 5.1), bake = (mesh, parent) => {            // pattern lives in the arm's frame, so it folds with the arm
    parent.updateMatrix(); mesh.updateMatrix();
    dBakeCamo(mesh, parent === g ? mesh.matrix.clone() : new THREE.Matrix4().multiplyMatrices(parent.matrix, mesh.matrix), off);
  };
  bake(lg1.children[0], lg1); bake(knuckle, g); bake(lg2.children[0], lg2);
  // motor pod: dark housing, silver band, red trim ring and a dark cap under the prop hub
  const m = new THREE.Group(); m.position.set(tp.x, tp.y - .01, tp.z); g.add(m);
  const housing = add(m, new CG(.047, .052, .075, 28, 6), t.camo, 0, .0375, 0);   // camo housing, in the arm's pattern frame
  m.updateMatrix(); housing.updateMatrix(); dBakeCamo(housing, new THREE.Matrix4().multiplyMatrices(m.matrix, housing.matrix), off);
  add(m, new CG(.054, .054, .02, 28), t.silver, 0, .062, 0);
  add(m, new TG(.049, .0055, 10, 36), t.red, 0, .076, 0).rotation.x = PI / 2;
  add(m, new CG(.038, .04, .012, 24), t.black, 0, .079, 0);
  add(m, new SG(.011, 8, 8), front ? (sx < 0 ? t.ledR : t.ledG) : t.black, 0, -.002, 0);   // arm light
  // landing foot: dark tapered strut angled outward under the pod, with a rubber pad on the ground plane
  const fe = dV(tp.x + sx * .035, GROUND - S.y, tp.z + (front ? -.012 : .022));
  dLimb(g, t.black, dV(tp.x, tp.y - .015, tp.z), fe, .022, .014, 1, 1);
  add(g, new SG(.019, 10, 8), t.rubber, fe.x, fe.y, fe.z).scale.set(1, .6, 1);
  // how far the arm turns to lie along the body (front arms swing back, rear arms swing forward), and where folded blades point
  const phiSrc = Math.atan2(-tp.z, tp.x), phiDst = Math.atan2(front ? -1 : 1, sx * .12);
  const u = dV(-(tp.x - e.x), 0, -(tp.z - e.z)).normalize();     // folded blades lie along the arm, toward the shoulder
  const prop = dProp(m, t, i, dir, Math.atan2(-u.x, -u.z));
  return { g, fold: dWrap(phiDst - phiSrc), prop };
}

export function buildDrone(low = false) {
  LOW = low;
  const t = dMats();
  const root = new THREE.Group(); root.name = 'drone';
  const air = new THREE.Group(); air.name = 'airframe'; root.add(air);

  // ---- fuselage: a smooth teardrop with a slanted nose rising to a raised, full-length battery hatch, then a tapered tail
  air.add(dFuselage([
    [-.268, .014, .004, -.012, 2.4], [-.245, .055, .022, -.036, 2.4], [-.20, .085, .036, -.05, 2.5], [-.12, .105, .056, -.056, 2.6],
    [-.02, .114, .076, -.056, 2.7], [.10, .116, .088, -.054, 2.7], [.20, .108, .084, -.05, 2.7], [.26, .088, .066, -.04, 2.5],
    [.29, .05, .04, -.022, 2.3], [.298, .012, .02, -.008, 2.2],
  ], t));
  add(air, new THREE.BoxGeometry(.11, .008, .06), t.black, 0, .05, -.115).rotation.x = -.23;      // intake scoop recessed into the slanted nose
  for (let k = 0; k < 5; k++) add(air, new THREE.BoxGeometry(.09, .006, .008), t.black, 0, .08 - k * .0105, .19 + k * .0125);   // rear vent slots
  [-1, 1].forEach(s => {
    for (let k = 0; k < 3; k++) add(air, new THREE.BoxGeometry(.006, .008, .035), t.black, s * .106, -.002, .19 + k * .028);       // side vents
    // front-facing obstacle-avoidance sensor dots: an outer and inner pair on the nose, a pair below
    [[.07, .0, -.205], [.038, .012, -.226]].forEach(([x, y, z]) => add(air, new SG(.0125, 14, 10), t.sensor, s * x, y, z));
    add(air, new SG(.011, 12, 8), t.sensor, s * .05, -.054, -.15);
    add(air, new SG(.009, 10, 8), t.sensor, s * .04, -.055, .22);                 // rear belly sensors
  });
  add(air, new CG(.006, .006, .008, 8), t.ledG, 0, .04, .292).rotation.x = PI / 2;   // tail light
  const strobe = { lamp: new THREE.MeshBasicMaterial({ color: 0xff3a30 }), halo: new THREE.MeshBasicMaterial({ color: 0xff2a20, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }) };   // a red strobe on the back
  add(air, new SG(.04, 12, 8), strobe.lamp, 0, .1, .1); add(air, new SG(.24, 14, 10), strobe.halo, 0, .1, .1); // (a big lamp and halo: it shows from far off)
  root.userData.strobe = strobe;

  // ---- four tapered, angled, folding arms: front pair higher with long feet, rear pair lower with short ones
  const dirs = [1, -1, -1, 1], arms = [[-1, true], [1, true], [-1, false], [1, false]].map(([sx, front], i) => dArm(air, t, i, sx, front, dirs[i]));

  // ---- camera gimbal under the nose: fixed pan/roll mount and yoke, with the camera pitching on the side pins
  const gim = new THREE.Group(); gim.position.set(0, -.045, -.2); air.add(gim);
  add(gim, new CG(.046, .052, .03, 28), t.black, 0, -.002, 0);               // pan motor
  add(gim, new CG(.036, .04, .026, 24), t.pod, 0, -.028, 0);                 // roll motor
  add(gim, new THREE.BoxGeometry(.15, .02, .05), t.pod, 0, -.05, 0);                              // yoke bridge
  [-1, 1].forEach(s => {
    add(gim, new THREE.BoxGeometry(.014, .1, .045), t.pod, s * .074, -.095, 0);                   // yoke arms
    add(gim, new CG(.018, .018, .012, 16), t.silver, s * .083, -.12, 0).rotation.z = PI / 2;   // pitch pivots
  });
  const cam = new THREE.Group(); cam.name = 'camera'; cam.position.set(0, -.12, 0); gim.add(cam);
  const camBody = add(cam, new THREE.ExtrudeGeometry(roundedRect(.12, .095, .028), { depth: .1, bevelEnabled: true, bevelThickness: .008, bevelSize: .008, bevelSegments: LOW ? 1 : 3, curveSegments: LOW ? 4 : 10 }), t.pod, 0, 0, -.05);
  add(cam, new CG(.036, .039, .034, 28).rotateX(PI / 2), t.black, 0, -.004, -.066);           // main lens barrel
  add(cam, new TG(.039, .0045, 8, 32), t.red, 0, -.004, -.085);                                  // red trim ring
  add(cam, new CG(.029, .029, .006, 28).rotateX(PI / 2), t.lens, 0, -.004, -.087);           // front glass
  add(cam, new CG(.013, .014, .02, 16).rotateX(PI / 2), t.black, 0, .031, -.064);             // second (thermal) lens
  add(cam, new CG(.009, .009, .004, 16).rotateX(PI / 2), t.lens, 0, .031, -.075);
  add(cam, new THREE.BoxGeometry(.05, .006, .04), t.black, 0, .049, -.01);                                        // top vent

  root.userData.arms = arms;
  root.userData.parts = { air, cam };
  poseDrone(root);
  return root;
}

export function poseDrone(root, spin = 0, pitch = 0, roll = 0, gimbal = 0, blur = 0, fold = 0) {
  const p = root.userData.parts, f = dEase(fold);
  const sb = root.userData.strobe, on = f < .6 && (performance.now() % 700) < 220;                 // flashes while the arms are open (a perched drone is dark)
  if (sb) { sb.lamp.color.setHex(on ? 0xffe8e0 : f < .6 ? 0x5a0d09 : 0x2a0a08); sb.halo.opacity = on ? .9 : 0; }
  p.air.rotation.set(-pitch, 0, -roll);                                    // positive pitch = nose (-Z) down, positive roll = right side down
  p.cam.rotation.x = -Math.min(1.57, Math.max(-.5, gimbal));               // positive gimbal = looking down
  root.userData.arms.forEach(a => {
    a.g.rotation.y = a.fold * f;                                           // arms swing about the shoulder hinges
    const pr = a.prop;
    pr.g.rotation.y = (1 - f) * spin * pr.dir + f * pr.align;              // spinning when open, lined up along the arm when folded
    pr.A.rotation.y = f * PI / 2; pr.B.rotation.y = PI - f * PI / 2;       // the blades fold together
    pr.blur.opacity = .14 * Math.min(1, Math.max(0, blur)) * (1 - f);
  });
}
