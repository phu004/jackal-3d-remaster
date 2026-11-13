// Enemy foot soldier — PLACEHOLDER. ~1.6 m tall (a touch chunky so he reads from the high camera),
// origin at his feet, facing -Z, with a rocket launcher on his right shoulder.
// Named parts: legL, legR (swing on X at the hip), kneeL, kneeR (bend on X), armL, armR (shoulders),
// launcher (the weapon, can be knocked loose), muzzle (front of the launcher, where shots leave),
// breech (back of the tube, for back-blast).
import * as THREE from 'three';
import { PI, add, mat, cached, roundedRect, poolPlain } from './common.js';

const mats = () => cached('soldierMats', () => ({
  uniform: mat(0x8c8670, .9, 0, { envMapIntensity: .4 }),
  webbing: mat(0x5c5848, .9, 0, { envMapIntensity: .4 }),
  helmet: mat(0x4a4c3e, .6, .2, { envMapIntensity: .4 }),
  skin: mat(0xc89a72, .8, 0, { envMapIntensity: .4 }),
  boot: mat(0x2a2620, .8, 0),
  gun: mat(0x1e1e1c, .5, .5),
  tube: mat(0x4e5a2e, .6, .3, { envMapIntensity: .5 }),
  warhead: mat(0x6a6e5a, .4, .6, { envMapIntensity: .6 }),
}));

// tapered round limb segment hanging down from its top end
// (low poly: 6 sides and open ends, the joints' spheres cover the ends; a soldier is about 950 triangles, down from 2850)
const segment = (rTop, rBottom, len) => new THREE.CylinderGeometry(rTop, rBottom, len, 6, 1, true).translate(0, -len / 2, 0);
const joint = (r) => new THREE.SphereGeometry(r, 5, 3);

export function buildSoldier() {
  const m = mats(), root = new THREE.Group(); root.name = 'soldier';
  const body = new THREE.Group(); body.name = 'body'; root.add(body); body.scale.setScalar(1.023); // (1.15, less 10% twice, then 10% back up)
  const group = (parent, name, x, y, z = 0) => { const g = new THREE.Group(); g.name = name; g.position.set(x, y, z); parent.add(g); return g; };

  // legs: thigh from the hip, then a knee joint carrying the shin and boot (so the knee can bend)
  for (const [name, knee, x] of [['legL', 'kneeL', -.11], ['legR', 'kneeR', .11]]) {
    const hip = group(body, name, x, .92);
    add(hip, segment(.085, .072, .44), m.uniform);
    const k = group(hip, knee, 0, -.44);
    add(k, joint(.072), m.uniform);
    add(k, segment(.07, .058, .38), m.uniform);
    const boot = add(k, new THREE.CylinderGeometry(.07, .075, .13, 8), m.boot, 0, -.42, -.04);
    boot.scale.z = 1.7;
    add(k, new THREE.BoxGeometry(.15, .03, .27), m.webbing, 0, -.48, -.04);                  // sole
  }
  // torso, tapered and a little flattened, with webbing, belt, pouches, canteen and backpack
  const torso = add(body, new THREE.CylinderGeometry(.21, .17, .56, 10), m.uniform, 0, 1.22, 0); torso.scale.z = .72;
  const belt = add(body, new THREE.CylinderGeometry(.18, .18, .07, 10), m.webbing, 0, .97, 0); belt.scale.z = .74;
  [-1, 1].forEach(s => { // crossed chest straps
    const strap = add(body, new THREE.BoxGeometry(.045, .58, .02), m.webbing, 0, 1.24, -.155);
    strap.rotation.z = s * .5;
  });
  [-.1, 0, .1].forEach(x => add(body, new THREE.BoxGeometry(.075, .09, .05), m.webbing, x, .97, -.14)); // ammo pouches
  add(body, new THREE.CylinderGeometry(.05, .05, .14, 8), m.webbing, .19, .93, .06);                  // canteen
  add(body, new THREE.BoxGeometry(.32, .34, .13), m.webbing, 0, 1.24, .195); // backpack
  add(body, new THREE.CylinderGeometry(.065, .07, .09, 8), m.skin, 0, 1.53, 0);                       // neck
  // head and helmet with a brim
  add(body, new THREE.SphereGeometry(.115, 9, 6), m.skin, 0, 1.64, 0);
  const helmet = add(body, new THREE.SphereGeometry(.155, 12, 5, 0, PI * 2, 0, PI / 2), m.helmet, 0, 1.655, .005);
  helmet.scale.y = .8;
  add(body, new THREE.CylinderGeometry(.18, .18, .022, 12), m.helmet, 0, 1.655, .005);
  // arms: shoulder, upper arm, elbow, forearm, hand. Right hand on the launcher's grip, left arm
  // reaching across to steady the front of the tube.
  for (const [name, x, lift, tilt, bend] of [['armL', -.25, 1.0, .55, .95], ['armR', .25, .25, -.05, 1.7]]) {
    const shoulder = group(body, name, x, 1.43);
    shoulder.rotation.set(lift, 0, tilt);
    add(shoulder, joint(.075), m.uniform);
    add(shoulder, segment(.065, .058, .3), m.uniform);
    const elbow = group(shoulder, '', 0, -.3); elbow.rotation.x = bend;
    add(elbow, joint(.058), m.uniform);
    add(elbow, segment(.055, .048, .27), m.uniform);
    add(elbow, joint(.05), m.skin, 0, -.3, 0);                   // hand
  }
  // rocket launcher on the right shoulder: tube, flared exhaust, warhead poking out the front,
  // pistol grip and a side sight
  const rl = new THREE.Group(); rl.name = 'launcher'; rl.position.set(.2, 1.52, -.05); body.add(rl);
  const tubeAlong = g => g.rotateX(PI / 2);
  add(rl, tubeAlong(new THREE.CylinderGeometry(.075, .075, 1.25, 8)), m.tube, 0, 0, -.12);
  add(rl, tubeAlong(new THREE.CylinderGeometry(.115, .078, .22, 8)), m.gun, 0, 0, .6);        // flared exhaust
  add(rl, tubeAlong(new THREE.CylinderGeometry(.085, .085, .06, 8)), m.gun, 0, 0, -.74);       // muzzle ring
  add(rl, tubeAlong(new THREE.CylinderGeometry(.06, .06, .1, 8)), m.warhead, 0, 0, -.82);      // warhead body
  add(rl, new THREE.ConeGeometry(.11, .26, 8).rotateX(-PI / 2), m.warhead, 0, 0, -1.0);     // warhead nose, point forward (-Z)
  add(rl, new THREE.BoxGeometry(.04, .14, .06), m.gun, 0, -.12, -.1).rotation.x = .2;            // pistol grip
  add(rl, new THREE.BoxGeometry(.03, .1, .1), m.gun, -.1, .06, -.3);                            // sight
  const muzzle = new THREE.Object3D(); muzzle.name = 'muzzle'; muzzle.position.set(0, 0, -1.15); rl.add(muzzle);
  const breech = new THREE.Object3D(); breech.name = 'breech'; breech.position.set(0, 0, .75); rl.add(breech);
  poolPlain(root, .3); // (the cloth, webbing, skin and boots shade alike: one material, each piece its own colour)
  return root;
}
