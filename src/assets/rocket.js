// Rocket — PLACEHOLDER (the jeep's upgraded launcher round). ~0.9 m long, built along -Z (nose
// forward), origin at its centre. Named parts: flame (exhaust glow at the tail, can be flickered).
// white: the pool statues' missile (stage 2): the same round in white, with pale grey fins, band and nose.
import * as THREE from 'three';
import { PI, add, mat, cached } from './common.js';

const mats = (white = false) => cached(white ? 'rocketMatsWhite' : 'rocketMats', () => ({
  body: white ? mat(0xecebe6, .45, .1, { envMapIntensity: .5 }) : mat(0x5a6640, .5, .3, { envMapIntensity: .5 }),
  nose: white ? mat(0xb4b5b1, .35, .5, { envMapIntensity: .6 }) : mat(0x9a9c94, .35, .7, { envMapIntensity: .6 }),
  fin: white ? mat(0xc8c8c2, .5, .2) : mat(0x2e3228, .6, .4),
  band: white ? mat(0xa8a9a5, .5, .2) : mat(0xd8b830, .5, .2),
  flame: new THREE.MeshBasicMaterial({ color: 0xffb040, transparent: true, opacity: .9, blending: THREE.AdditiveBlending, depthWrite: false }),
}));

export function buildRocket({ white = false } = {}) {
  const m = mats(white), root = new THREE.Group(); root.name = 'rocket';
  const along = g => g.rotateX(PI / 2); // cylinders/cones point along Z
  add(root, along(new THREE.CylinderGeometry(.075, .075, .6, 12)), m.body, 0, 0, .05);
  add(root, along(new THREE.CylinderGeometry(.078, .078, .05, 12)), m.band, 0, 0, -.15);
  add(root, new THREE.ConeGeometry(.075, .22, 12).rotateX(-PI / 2), m.nose, 0, 0, -.36);
  for (let i = 0; i < 4; i++) {
    const fin = add(root, new THREE.BoxGeometry(.02, .14, .16), m.fin, 0, 0, .3);
    fin.rotation.z = i * PI / 2; fin.position.set(Math.sin(i * PI / 2) * .09, Math.cos(i * PI / 2) * .09, .3);
  }
  const flame = new THREE.Mesh(new THREE.ConeGeometry(.08, .45, 10).rotateX(PI / 2), m.flame);
  flame.name = 'flame'; flame.position.z = .58; root.add(flame);
  return root;
}
