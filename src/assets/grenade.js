// Hand grenade — PLACEHOLDER (the jeep's thrown grenade). ~0.61 m long (SIZE), exaggerated so it reads
// from the game camera. Origin at its centre; long axis along Y.
import * as THREE from 'three';
import { PI, add, mat, cached } from './common.js';

const mats = () => cached('grenadeMats', () => ({
  body: mat(0x4a5226, .6, .2, { envMapIntensity: .5 }),
  groove: mat(0x1e2210, .8, .1),
  steel: mat(0x8d948c, .35, .8, { envMapIntensity: .5 }),
}));
const SIZE = .81; // drawn this much of its modelled size (.9, less 10%)

export function buildGrenade() {
  const m = mats(), root = new THREE.Group(); root.name = 'grenade';
  const body = add(root, new THREE.SphereGeometry(.26, 16, 12), m.body);
  body.scale.set(1, 1.35, 1); // egg-shaped, longer than it is wide
  [-.18, 0, .18].forEach(y => { // segment grooves around the body
    const r = .26 * Math.sqrt(1 - (y / (.26 * 1.35)) ** 2) + .005;
    add(root, new THREE.TorusGeometry(r, .025, 6, 20), m.groove, 0, y, 0).rotation.x = PI / 2;
  });
  add(root, new THREE.CylinderGeometry(.09, .11, .14, 12), m.steel, 0, .39, 0); // fuse cap
  const lever = add(root, new THREE.BoxGeometry(.06, .34, .03), m.steel, .1, .26, 0); // spoon
  lever.rotation.z = -.35;
  root.scale.setScalar(SIZE);
  return root;
}
