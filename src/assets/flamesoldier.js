// Flame-thrower soldier: the foot soldier with his rocket launcher swapped for a fuel pack on his back (two orange-banded
// cylinders and a tank frame), a hose over the shoulder and a flame gun in his hands. Same size, origin at his feet, facing -Z.
// Named parts as the soldier's (legL, legR, kneeL, kneeR, armL, armR) plus `pack` (the fuel canisters: they go up when he dies),
// `nozzle` (the flame gun) and `muzzle` (its tip, where the jet leaves; -Z forward), `pilot` (the pilot flame's glow).
import * as THREE from 'three';
import { PI, add, mat, cached } from './common.js';
import { buildSoldier } from './soldier.js';

const mats = () => cached('flameSoldierMats', () => ({
  tank: mat(0x8e3d18, .45, .55, { envMapIntensity: .6 }),   // dirty orange fuel canisters
  band: mat(0x1d1d1b, .6, .5),
  steel: mat(0x55595c, .5, .7),
  hose: mat(0x1a1a18, .8, .1),
  hood: mat(0x6b6a5e, .9, 0),                                // asbestos-grey hood and gloves
  pilot: new THREE.MeshStandardMaterial({ color: 0xeaf4ff, emissive: 0x7ab8ff, emissiveIntensity: 2.4, roughness: .3 }),
}));

export function buildFlameSoldier() {
  const m = mats(), root = buildSoldier(), body = root.getObjectByName('body');
  const rl = root.getObjectByName('launcher'); rl.parent.remove(rl);
  // fuel pack: two upright canisters on a frame, on his back (+Z), with a valve block between them
  const pack = new THREE.Group(); pack.name = 'pack'; pack.position.set(0, 1.28, .3); body.add(pack);
  for (const x of [-.12, .12]) {
    add(pack, new THREE.CylinderGeometry(.095, .095, .62, 14), m.tank, x, 0, 0);
    add(pack, new THREE.SphereGeometry(.095, 14, 8, 0, PI * 2, 0, PI / 2), m.tank, x, .31, 0);
    add(pack, new THREE.CylinderGeometry(.099, .099, .05, 14), m.band, x, .17, 0);
    add(pack, new THREE.CylinderGeometry(.099, .099, .05, 14), m.band, x, -.17, 0);
  }
  add(pack, new THREE.BoxGeometry(.1, .1, .1), m.steel, 0, .3, 0);
  add(pack, new THREE.BoxGeometry(.36, .03, .04), m.steel, 0, .14, .1);
  add(pack, new THREE.BoxGeometry(.36, .03, .04), m.steel, 0, -.2, .1);
  // hood over the helmet's brim: a rounded cowl that makes him read as a different man
  add(body, new THREE.SphereGeometry(.165, 14, 10, 0, PI * 2, PI * .35, PI * .5), m.hood, 0, 1.62, .01).scale.y = .95;
  // hose from the valve, over the right shoulder, to the gun
  const hose = new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(.04, 1.58, .3), new THREE.Vector3(.2, 1.7, .2), new THREE.Vector3(.27, 1.55, -.05), new THREE.Vector3(.2, 1.42, -.3)]), 12, .022, 6);
  add(body, hose, m.hose);
  // the flame gun: a long barrel with a flared nozzle, a grip and the pilot flame at its tip, held where the launcher was
  const nozzle = new THREE.Group(); nozzle.name = 'nozzle'; nozzle.position.set(.2, 1.5, -.05); body.add(nozzle);
  const along = g => g.rotateX(PI / 2);
  add(nozzle, along(new THREE.CylinderGeometry(.04, .045, .8, 10)), m.steel, 0, 0, -.25);
  add(nozzle, along(new THREE.CylinderGeometry(.07, .045, .14, 10)), m.band, 0, 0, -.7);              // flared tip
  add(nozzle, along(new THREE.CylinderGeometry(.06, .06, .3, 10)), m.tank, 0, -.06, -.1);               // fuel chamber
  add(nozzle, new THREE.BoxGeometry(.04, .13, .06), m.band, 0, -.1, .05).rotation.x = .2;                // grip
  const pilot = add(nozzle, new THREE.SphereGeometry(.028, 8, 6), m.pilot, 0, .04, -.74); pilot.name = 'pilot'; pilot.castShadow = false;
  const muzzle = new THREE.Object3D(); muzzle.name = 'muzzle'; muzzle.position.set(0, 0, -.78); nozzle.add(muzzle);
  return root;
}
