// Prisoner of war — PLACEHOLDER, after the NES sprite: a captured soldier in green fatigues and a field
// cap, waving one arm for rescue. Stocky, ~1.7 m tall. Origin at his feet, facing -Z.
// Named parts: legL, legR (swing on X at the hip), kneeL, kneeR (bend on X), armL, armR (shoulders),
// elbowL, elbowR. The fatigues use the material in userData.uniform, so its colour can be cycled
// (the NES flashes special prisoners through other palettes).
import * as THREE from 'three';
import { PI, add, mat } from './common.js';

const limb = (rTop, rBottom, len) => new THREE.CylinderGeometry(rTop, rBottom, len, 10).translate(0, -len / 2, 0); // hangs from its top

// colors: { shirt, trousers } — the fatigues default to all green. bulk > 1 makes him burlier
// (thicker torso and limbs, broader shoulders and hips); size scales him overall. engineer: a yellow
// hard hat instead of the cap, a tool belt, and a toolbox carried in his left hand.
export function buildPOW({ shirt = 0x3f7a36, trousers = 0x3f7a36, bulk = 1, size = 1, engineer = false } = {}) {
  const m = {
    uniform: mat(shirt, .9, 0, { envMapIntensity: .4 }), // shirt, sleeves and cap; own copy per prisoner, so it can be recoloured
    trousers: mat(trousers, .9, 0, { envMapIntensity: .4 }),
    trim: mat(0x24461f, .9, 0, { envMapIntensity: .4 }),
    skin: mat(0xc89a72, .8, 0, { envMapIntensity: .4 }),
    boot: mat(0x1c1a16, .8, 0),
  };
  const root = new THREE.Group(); root.name = 'pow'; root.userData.uniform = m.uniform;
  const body = new THREE.Group(); body.name = 'body'; root.add(body); body.scale.setScalar(.99 * size); // (1.1, less 10%)
  const B = bulk, limbB = (a, b, len) => limb(a * B, b * B, len);
  const group = (parent, name, x, y, z = 0) => { const g = new THREE.Group(); g.name = name; g.position.set(x, y, z); parent.add(g); return g; };

  for (const [leg, knee, x] of [['legL', 'kneeL', -.13 * B], ['legR', 'kneeR', .13 * B]]) {
    const hip = group(body, leg, x, .9);
    add(hip, limbB(.1, .088, .44), m.trousers);
    const k = group(hip, knee, 0, -.44);
    add(k, limbB(.085, .07, .3), m.trousers);
    add(k, limbB(.078, .074, .1), m.boot, 0, -.3, 0);                                  // boot top
    add(k, new THREE.BoxGeometry(.15, .1, .27), m.boot, 0, -.43, -.04);
  }
  const torso = add(body, new THREE.CylinderGeometry(.25 * B, .23 * B, .56, 14), m.uniform, 0, 1.18, 0); torso.scale.z = .8;
  const belt = add(body, new THREE.CylinderGeometry(.235 * B, .235 * B, .07, 14), m.trim, 0, .93, 0); belt.scale.z = .82;
  [-.1, .1].forEach(x => add(body, new THREE.BoxGeometry(.11, .1, .03), m.trim, x * B, 1.27, -.2 * B)); // breast pockets
  const collar = add(body, new THREE.CylinderGeometry(.11 * B, .14 * B, .06, 12), m.trim, 0, 1.47, 0); collar.scale.z = .85;
  add(body, new THREE.CylinderGeometry(.075 * B, .08 * B, .08, 10), m.skin, 0, 1.5, 0); // neck
  add(body, new THREE.SphereGeometry(.13, 14, 10), m.skin, 0, 1.62, 0);
  if (engineer) {
    // yellow hard hat: domed shell, ridge over the top, brim all round
    const hat = mat(0xe8bc1c, .45, .05, { envMapIntensity: .5 });
    const shell = add(body, new THREE.SphereGeometry(.16, 48, 24, 0, PI * 2, 0, PI / 2), hat, 0, 1.69, .005); shell.scale.y = .85;
    const ridge = add(body, new THREE.SphereGeometry(.03, 16, 10), hat, 0, 1.82, .005); ridge.scale.set(1, .7, 5);   // smooth centre ridge
    const brim = add(body, new THREE.TorusGeometry(.19, .016, 10, 40), hat, 0, 1.69, -.01); brim.rotation.x = PI / 2; // rounded brim edge
    const disc = add(body, new THREE.CylinderGeometry(.19, .19, .02, 40), hat, 0, 1.69, -.01);
    for (const o of [shell, ridge, brim, disc]) o.receiveShadow = false; // too small to need shadows on it; avoids speckles (shadow acne)
    // tool belt: leather, pouches, a hammer at the hip
    const leather = mat(0x5a3a1e, .8, 0, { envMapIntensity: .4 }), steel = mat(0x8a8c88, .4, .7);
    const tb = add(body, new THREE.CylinderGeometry(.245 * B, .245 * B, .09, 14), leather, 0, .93, 0); tb.scale.z = .84;
    [-.16, .16].forEach(x => add(body, new THREE.BoxGeometry(.1, .13, .06), leather, x * B, .85, -.17 * B));
    add(body, new THREE.CylinderGeometry(.02, .02, .3, 8), leather, .27 * B, .78, 0);
    add(body, new THREE.BoxGeometry(.06, .05, .14), steel, .27 * B, .94, 0);
  } else {
    // field cap: a soft crown with a short brim at the front
    const cap = add(body, new THREE.CylinderGeometry(.13, .145, .1, 14), m.uniform, 0, 1.72, .005); cap.scale.z = .95;
    add(body, new THREE.CylinderGeometry(.13, .13, .02, 14), m.trim, 0, 1.775, .005);
    const brim = add(body, new THREE.BoxGeometry(.2, .02, .1), m.trim, 0, 1.68, -.15); brim.rotation.x = .25;
  }
  for (const [arm, elbow, x] of [['armL', 'elbowL', -.3 * B], ['armR', 'elbowR', .3 * B]]) {
    const sh = group(body, arm, x, 1.4);
    add(sh, new THREE.SphereGeometry(.085 * B, 10, 8), m.uniform);
    add(sh, limbB(.075, .065, .29), m.uniform);
    const el = group(sh, elbow, 0, -.29);
    add(el, limbB(.065, .055, .2), m.uniform);                                         // rolled sleeve
    add(el, limbB(.05, .045, .08), m.skin, 0, -.2, 0);
    add(el, new THREE.SphereGeometry(.058 * B, 10, 8), m.skin, 0, -.3, 0);
  }
  if (engineer) { // red toolbox in his left hand
    const hand = root.getObjectByName('elbowL'), red = mat(0xb8281e, .5, .3, { envMapIntensity: .5 }), dark = mat(0x2a2a28, .6, .4);
    const box = new THREE.Group(); box.position.set(0, -.45, 0); hand.add(box);
    add(box, new THREE.BoxGeometry(.18, .2, .42), red, 0, -.04, 0);
    add(box, new THREE.BoxGeometry(.185, .02, .425), dark, 0, .03, 0);                   // lid line
    add(box, new THREE.BoxGeometry(.03, .08, .2), dark, 0, .1, 0);                       // handle
  }
  return root;
}
