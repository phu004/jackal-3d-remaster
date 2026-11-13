// Armoured personnel carrier (placeholder), after an M113: a tan, slab-sided tracked hull with a sloped
// glacis, twin front lights, a commander's cupola (no weapon), roof hatches, whip aerials and a rear ramp
// with a personnel door set into it. The troop compartment is hollow (floor, benches, inner walls),
// so you can see inside when the ramp is down.
// Origin on the ground at the centre of the hull; the nose faces -Z. ~4.8 m long, ~2.7 m wide, ~2.2 m to the roof.
// Named parts: `hull` (everything), `ramp` (hinged at its bottom edge, swings down), `door` (inside the ramp,
// hinged on its right edge, swings outward), `cupola` (turns).
// Drive the openings with poseApc(root, ramp, door): 0 = shut, 1 = fully open.
import * as THREE from 'three';
import { add, mat, cached, PI, roundedRect, canvasTexture, seededRandom, extrudeProfile } from './common.js';

// light dust/grain texture, tinted by the material colour (colour map is sRGB so it doesn't render too bright)
function aGrainCanvas(bump) {
  const S = 256, rnd = seededRandom(23);
  const c = document.createElement('canvas'); c.width = c.height = S; const x = c.getContext('2d');
  x.fillStyle = bump ? '#808080' : '#f2f2f2'; x.fillRect(0, 0, S, S);
  if (!bump) for (let k = 0; k < 14; k++) {
    const px = rnd() * S, py = rnd() * S, r = 30 + rnd() * 70, g = x.createRadialGradient(px, py, 0, px, py, r), v = rnd() > .5 ? 255 : 0;
    g.addColorStop(0, `rgba(${v},${v},${v},.07)`); g.addColorStop(1, `rgba(${v},${v},${v},0)`); x.fillStyle = g; x.fillRect(px - r, py - r, 2 * r, 2 * r);
  }
  for (let i = 0; i < 6000; i++) { const v = rnd() > .5 ? 255 : 0; x.fillStyle = `rgba(${v},${v},${v},${bump ? .06 : .035})`; x.fillRect(rnd() * S, rnd() * S, 1 + rnd() * 2, 1 + rnd() * 2); }
  return c;
}
const aSkin = (hex, rough, metal) => new THREE.MeshStandardMaterial({
  color: hex, roughness: rough, metalness: metal, bumpScale: .3,
  map: cached('apcGrainMap', () => { const t = canvasTexture(aGrainCanvas(false)); t.colorSpace = THREE.SRGBColorSpace; return t; }),
  bumpMap: cached('apcGrainBump', () => canvasTexture(aGrainCanvas(true))),
});
const aMats = () => cached('apcMats', () => ({
  tan: aSkin(0xb3a276, .8, .05), trim: aSkin(0x8f8260, .75, .1), interior: aSkin(0x6a6650, .9, .05),
  dark: mat(0x1f1f1c, .85, .1), rubber: mat(0x181816, .95, 0), metal: mat(0x4b4a42, .5, .6),
  lens: mat(0xc7cdd0, .2, .3), glass: mat(0x15191a, .2, .5), red: mat(0x8a2222, .5, .1),
}));
const aEase = x => { x = Math.min(1, Math.max(0, x)); return x * x * (3 - 2 * x); };

// A slab from a rounded-rectangle footprint, lying flat (footprint y -> -Z), extruded upward from y0.
function aSlab(parent, w, d, r, depth, y0, material, bevel, x = 0, z = 0) {
  const g = new THREE.ExtrudeGeometry(roundedRect(w, d, r), { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 10 });
  const m = add(parent, g, material, x, y0, z); m.rotation.x = -PI / 2; return m;
}
// Road wheel / idler / sprocket: axis along X, so group.rotation.x spins it.
function aWheel(parent, t, x, y, z, r, tyre) {
  const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g);
  const side = Math.sign(x);
  if (tyre) add(g, new THREE.CylinderGeometry(r, r, .26, 24), t.rubber).rotation.z = PI / 2;
  add(g, new THREE.CylinderGeometry(r * (tyre ? .74 : 1), r * (tyre ? .74 : 1), .3, 24), t.tan).rotation.z = PI / 2;
  add(g, new THREE.CylinderGeometry(r * .3, r * .3, .34, 12), t.dark).rotation.z = PI / 2;
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * PI * 2, b = add(g, new THREE.CylinderGeometry(.02, .02, .03, 6), t.metal, side * .165, Math.sin(a) * r * .52, Math.cos(a) * r * .52);
    b.rotation.z = PI / 2;
  }
  return g;
}

export function buildApc() {
  const t = aMats();
  const root = new THREE.Group(); root.name = 'apc';
  const hull = new THREE.Group(); hull.name = 'hull'; root.add(hull);

  // ---- hull: solid engine/driver block with the sloped glacis, then a hollow troop compartment
  const fp = new THREE.Shape(); // side profile: x along the vehicle (nose = -x), y up
  fp.moveTo(-2.36, .54); fp.lineTo(-2.36, .9); fp.lineTo(-1.46, 1.91); fp.lineTo(-.59, 1.91); fp.lineTo(-.59, .54); fp.lineTo(-2.36, .54);
  extrudeProfile(hull, fp, 2.12, .04, .04, t.tan);                                   // 2.2 m wide with the bevels
  [-1, 1].forEach(s => {
    add(hull, new THREE.BoxGeometry(.06, 1.45, 2.95), t.tan, s * 1.07, 1.225, .925);   // outer side wall
    add(hull, new THREE.BoxGeometry(.04, 1.4, 2.95), t.interior, s * 1.02, 1.25, .925); // inner lining
  });
  add(hull, new THREE.BoxGeometry(2.2, .1, 2.95), [t.tan, t.tan, t.tan, t.interior, t.tan, t.tan], 0, 1.9, .925);   // roof
  add(hull, new THREE.BoxGeometry(2.2, .08, 2.95), [t.tan, t.tan, t.interior, t.tan, t.tan, t.tan], 0, .55, .925);  // floor
  add(hull, new THREE.BoxGeometry(2.0, 1.3, .04), t.interior, 0, 1.25, -.53);        // front bulkhead
  [-1, 1].forEach(s => {
    add(hull, new THREE.BoxGeometry(.42, .07, 2.3), t.interior, s * .78, .95, 1.25);   // benches
    add(hull, new THREE.BoxGeometry(.38, .35, 2.2), t.dark, s * .78, .76, 1.25);
    add(hull, new THREE.BoxGeometry(.03, .45, 2.3), t.interior, s * .985, 1.22, 1.25); // seat backs
  });

  // ---- tracks: rubber belt, cleats, wheels, fender over each side
  const beltShape = roundedRect(4.4, .8, .4); beltShape.holes.push(roundedRect(4.3, .7, .35));
  const beltGeo = new THREE.ExtrudeGeometry(beltShape, { depth: .34, bevelEnabled: false, curveSegments: 24 }); beltGeo.translate(0, 0, -.17);
  const R = .4, STR = 3.6, P = 2 * STR + 2 * PI * R, N = 58, d = new THREE.Object3D();
  const cleatGeo = new THREE.BoxGeometry(.34, .045, .12);
  [-1, 1].forEach(s => {
    const belt = add(hull, beltGeo, t.rubber, s * 1.32, .4, 0); belt.rotation.y = -PI / 2;
    const cleats = new THREE.InstancedMesh(cleatGeo, t.dark, N); cleats.position.x = s * 1.32; cleats.castShadow = cleats.receiveShadow = true;
    for (let i = 0; i < N; i++) {
      const u = i * P / N; let z, y, th;
      if (u < STR) { z = -1.8 + u; y = .8; th = PI / 2; }
      else if (u < STR + PI * R) { th = PI / 2 - (u - STR) / R; z = 1.8 + R * Math.cos(th); y = .4 + R * Math.sin(th); }
      else if (u < 2 * STR + PI * R) { z = 1.8 - (u - STR - PI * R); y = 0; th = -PI / 2; }
      else { th = -PI / 2 - (u - 2 * STR - PI * R) / R; z = -1.8 + R * Math.cos(th); y = .4 + R * Math.sin(th); }
      d.position.set(0, y, z); d.rotation.set(PI / 2 - th, 0, 0); d.updateMatrix(); cleats.setMatrixAt(i, d.matrix);
    }
    hull.add(cleats);
    [-1.35, -.7, -.05, .6, 1.25].forEach(z => aWheel(hull, t, s * 1.32, .4, z, .32, true));  // road wheels
    aWheel(hull, t, s * 1.32, .4, -1.8, .34, false);                                            // front idler
    aWheel(hull, t, s * 1.32, .4, 1.8, .34, false);                                             // rear drive sprocket
    add(hull, new THREE.BoxGeometry(.5, .1, 4.2), t.tan, s * 1.3, .92, 0);                      // fender
    add(hull, new THREE.BoxGeometry(.5, .08, .55), t.tan, s * 1.3, .86, -2.3).rotation.x = -.35; // sloped front mudguard
    add(hull, new THREE.BoxGeometry(.04, .14, 4.2), t.trim, s * 1.55, .9, 0);                   // fender lip
  });

  // ---- hull details
  [-1, 1].forEach(s => {
    add(hull, new THREE.CylinderGeometry(.02, .02, 2.4, 6), t.trim, s * 1.14, 1.55, .9).rotation.x = PI / 2; // side rail
    [.1, .7, 1.3, 1.9].forEach(z => add(hull, new THREE.BoxGeometry(.06, .08, .06), t.trim, s * 1.13, 1.55, z));
    add(hull, new THREE.TorusGeometry(.07, .015, 6, 12), t.metal, s * .7, .7, -2.43);          // tow shackles
    add(hull, new THREE.BoxGeometry(.12, .12, .04), t.trim, s * .7, .74, -2.42);
    add(hull, new THREE.BoxGeometry(.1, .12, .06), t.red, s * 1.03, 1.7, 2.43);                 // tail lights
  });
  add(hull, new THREE.BoxGeometry(.14, .55, .42), t.trim, 1.17, 1.4, 1.1);                      // stowage box on the side
  add(hull, new THREE.BoxGeometry(.15, .04, .44), t.dark, 1.17, 1.55, 1.1);

  // twin front lights on the upper glacis, and an access panel on it
  [-1, 1].forEach(s => {
    const l = new THREE.Group(); l.position.set(s * .88, 1.72, -1.69); l.rotation.x = -2.434; hull.add(l);
    add(l, new THREE.BoxGeometry(.3, .12, .08), t.dark, 0, 0, .04);
    [-.07, .07].forEach(x => add(l, new THREE.CylinderGeometry(.04, .04, .03, 12), t.lens, x, 0, .09).rotation.x = PI / 2);
  });
  const pg = new THREE.Group(); pg.position.set(0, 1.4, -1.971); pg.rotation.x = .7077; hull.add(pg);
  add(pg, new THREE.ExtrudeGeometry(roundedRect(1.3, .85, .1), { depth: .03, bevelEnabled: true, bevelThickness: .008, bevelSize: .008, bevelSegments: 2, curveSegments: 10 }), t.trim, 0, 0, -.036);

  // roof: driver's hatch with periscopes, cupola, two cargo hatches, grab handles, aerials
  add(hull, new THREE.CylinderGeometry(.3, .32, .08, 20), t.trim, .55, 1.99, -1.05);
  add(hull, new THREE.CylinderGeometry(.27, .27, .04, 20), t.tan, .55, 2.05, -1.05);
  [.37, .55, .73].forEach(x => add(hull, new THREE.BoxGeometry(.1, .06, .08), t.glass, x, 2.0, -1.4));
  const cup = new THREE.Group(); cup.name = 'cupola'; cup.position.set(.5, 1.95, .15); hull.add(cup);
  add(cup, new THREE.CylinderGeometry(.42, .45, .22, 24), t.trim, 0, .11, 0);
  for (let i = 0; i < 6; i++) { const a = i / 6 * PI * 2; add(cup, new THREE.BoxGeometry(.12, .1, .05), t.glass, Math.sin(a) * .43, .2, Math.cos(a) * .43).rotation.y = a; }
  add(cup, new THREE.CylinderGeometry(.38, .38, .05, 24), t.tan, 0, .245, 0);
  add(cup, new THREE.BoxGeometry(.2, .03, .04), t.dark, 0, .28, .1);
  aSlab(hull, 1.0, 1.3, .06, .03, 1.95, t.trim, 0, -.5, 1.3);
  aSlab(hull, .7, .9, .06, .03, 1.95, t.trim, 0, .5, 1.5);
  [[-.5, 1.3], [.5, 1.5]].forEach(([x, z]) => add(hull, new THREE.BoxGeometry(.25, .03, .03), t.dark, x, 2.0, z));
  [-1, 1].forEach(s => {
    add(hull, new THREE.TorusGeometry(.1, .015, 6, 10, PI), t.metal, s * .8, 1.95, 2.3);                                    // grab handles
    add(hull, new THREE.CylinderGeometry(.05, .06, .12, 8), t.dark, s * .95, 2.0, 2.1);                                             // aerial bases
    add(hull, new THREE.CylinderGeometry(.008, .014, 2.6, 6), t.metal, s * .95, 3.3, 2.1);                                           // whips
  });

  // ---- rear ramp, hinged at the bottom edge; personnel door set into it
  const ramp = new THREE.Group(); ramp.name = 'ramp'; ramp.position.set(0, .55, 2.41); hull.add(ramp);
  const rs = new THREE.Shape(); rs.moveTo(-.95, 0); rs.lineTo(.95, 0); rs.lineTo(.95, 1.35); rs.lineTo(-.95, 1.35); rs.lineTo(-.95, 0);
  const hole = new THREE.Path(); hole.moveTo(.15, .2); hole.lineTo(.85, .2); hole.lineTo(.85, 1.1); hole.lineTo(.15, 1.1); hole.lineTo(.15, .2);
  rs.holes.push(hole);
  add(ramp, new THREE.ExtrudeGeometry(rs, { depth: .08, bevelEnabled: true, bevelThickness: .012, bevelSize: .012, bevelSegments: 2 }), t.tan);
  [.3, .7, 1.1].forEach(y => add(ramp, new THREE.BoxGeometry(.8, .05, .025), t.trim, -.5, y, .095));   // stiffening ribs
  [-1, 1].forEach(s => {
    add(ramp, new THREE.BoxGeometry(.1, .08, .04), t.dark, s * .8, 1.3, .1);                          // latches
    add(ramp, new THREE.CylinderGeometry(.04, .04, .4, 8), t.dark, s * .6, 0, .05).rotation.z = PI / 2; // hinge barrels
  });
  const door = new THREE.Group(); door.name = 'door'; door.position.set(.845, .2, 0); ramp.add(door);
  add(door, new THREE.BoxGeometry(.68, .88, .04), t.tan, -.34, .44, .04);
  add(door, new THREE.BoxGeometry(.5, .7, .02), t.trim, -.34, .44, .075);
  add(door, new THREE.CylinderGeometry(.015, .015, .12, 6), t.metal, -.62, .45, .1).rotation.x = PI / 2;
  [.1, .78].forEach(y => add(ramp, new THREE.BoxGeometry(.04, .1, .06), t.dark, .86, .2 + y, .04));    // door hinges
  return root;
}

export function poseApc(root, ramp, door) {
  root.getObjectByName('ramp').rotation.x = aEase(ramp) * 1.17;   // swings down until it rests on the ground
  root.getObjectByName('door').rotation.y = aEase(door) * 1.9;    // swings outward
}
