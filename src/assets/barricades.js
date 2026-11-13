// Stage 6 (the enemy fortress) barricades: the enemy's last line, thrown up from whatever came to hand. Built to the asset contract: metres,
// origin on the ground at the centre, front toward -Z, each about 2.5 m across (the NES's 16 px tank-trap cross).
//   buildHedgehog     a steel tank trap: two angle-iron beams crossed in an X and a third through them, as the NES draws it
//   buildSandbagWall  a wall of sandbags, three courses high in running bond
//   buildDrumStack    fuel drums: four on the ground and one on top, some rusted, some stood on their sides
//   buildCrateStack   ammunition crates, stacked and one cocked over, with a spool of wire on the side
import * as THREE from 'three';
import { add, mat, cached, seededRandom } from './common.js';
import { bagGeometries, sandbagMaterial } from './stage-props.js';

const pmat = (c, r, m, o) => mat(c, r, m, Object.assign({ envMapIntensity: .35 }, o));
const M = () => cached('barricadeMats', () => ({
  steel: [0x8d9091, 0x7d8082, 0x6f6e6a].map(c => pmat(c, .55, .65)),
  rust: pmat(0x7a4a30, .85, .3),
  dark: pmat(0x2d2f30, .6, .5),
  drum: [0x4a5430, 0x5a6a38, 0x7a4a30, 0x2a4aa8, 0x6b6e62].map(c => pmat(c, .55, .55)),
  drumTop: pmat(0x2a2c2a, .6, .5),
  crate: [0x5b6538, 0x4d5632].map(c => pmat(c, .85, .05)),
  cleat: pmat(0x3a3f26, .9, 0),
  wood: pmat(0x6a4a2a, .9, 0),
  wire: pmat(0x9a9c9c, .4, .8),
}));

// An angle-iron beam from a to b (an L: the web and the flange).
function beam(root, a, b, mats, s = .24) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), len = A.distanceTo(B), mid = A.clone().add(B).multiplyScalar(.5), q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), B.clone().sub(A).normalize());
  for (const [w, h, y, z] of [[len, s, 0, 0], [len, s * .22, s / 2, s * .4]]) { // (the web lying across, the flange standing on it)
    const m = add(root, new THREE.BoxGeometry(w, h, h === s ? s * .22 : s * .8), mats, mid.x, mid.y, mid.z); m.quaternion.copy(q); m.translateY(y); m.translateZ(z);
  }
}

export function buildHedgehog(seed = 1) {
  const root = new THREE.Group(), m = M(), rnd = seededRandom(seed * 7 + 3); root.name = 'hedgehog';
  const steel = m.steel[Math.floor(rnd() * 3)], k = .5 * (.95 + rnd() * .1), H = 1.12, yaw = (rnd() - .5) * .5;
  const g = new THREE.Group(); g.rotation.y = yaw; root.add(g);
  beam(g, [-1.2, H - 1.2 * .78, 0], [1.2, H + 1.2 * .78, 0], steel);   // the X as seen from the south
  beam(g, [-1.2, H + 1.2 * .78, 0], [1.2, H - 1.2 * .78, 0], steel);
  beam(g, [0, H, -1.05], [0, H, 1.05], m.steel[(Math.floor(rnd() * 3) + 1) % 3]);   // the third, through the middle
  for (const z of [-.16, .16]) add(g, new THREE.BoxGeometry(.7, .7, .06), m.dark, 0, H, z).rotation.z = Math.PI / 4;   // gusset plates either side of where they cross
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) { // the feet: a concrete block poured round each, and a rusted bolt-on plate
    add(g, new THREE.BoxGeometry(.6, .22, .6), m.rust, sx * 1.12, .11, sz * .0 + sz * .02).rotation.y = sx * .3;
  }
  for (const sz of [-1, 1]) add(g, new THREE.BoxGeometry(.5, .2, .5), m.rust, 0, .1, sz * .95).rotation.y = sz * .4;
  for (let i = 0; i < 3; i++) { // a tangle of barbed wire thrown over the middle
    const w = add(g, new THREE.TorusGeometry(.55 + i * .12, .018, 3, 14), m.wire, 0, H + (i - 1) * .12, 0); w.rotation.set(.5 + i * 1.1, i * .9, i * .5); w.castShadow = false;
  }
  return root;
}

export function buildSandbagWall(seed = 1, look = null) {
  const root = new THREE.Group(), rnd = seededRandom(seed * 11 + 5), geos = bagGeometries(), bagMat = sandbagMaterial(look === 'grey' ? 0x77787a : 0xb0a070); root.name = 'sandbags';
  for (let row = 0; row < 2; row++) for (let c = 0; c < 4 - row; c++) for (let i = 0; i < 3; i++) { // two bags thick, four courses high at the front, three behind
    if (c % 2 && i === 2) continue; // (the upper course is offset half a bag, so one short)
    const b = add(root, geos[Math.floor(rnd() * 3)], bagMat, -.9 + i * .9 + (c % 2 ? .45 : 0) + (rnd() - .5) * .06, .19 + c * .33, (row ? .26 : -.26) + (rnd() - .5) * .08);
    b.rotation.set((rnd() - .5) * .08, (rnd() - .5) * .18, (rnd() - .5) * .1); b.scale.set(.95 + rnd() * .08, .92 + rnd() * .14, 1.05);
  }
  const stake = pmat(0x4a3a24, .9, 0);
  for (const x of [-1.3, 1.3]) add(root, new THREE.CylinderGeometry(.05, .05, 1.5, 6), stake, x, .75, 0).castShadow = false;   // a picket at each end
  return root;
}

export function buildDrumStack(seed = 1) {
  const root = new THREE.Group(), m = M(), rnd = seededRandom(seed * 13 + 1); root.name = 'drums';
  const drum = (x, y, z, tilt = 0) => {
    const d = new THREE.Group(), col = m.drum[Math.floor(rnd() * m.drum.length)];
    add(d, new THREE.CylinderGeometry(.42, .42, 1.1, 14), col, 0, .55, 0);
    for (const yy of [.2, .9]) add(d, new THREE.CylinderGeometry(.436, .436, .06, 14, 1, true), m.dark, 0, yy, 0).castShadow = false;   // rolling hoops: a thin band round the drum (28 triangles, not a 216-triangle torus), no shadow of its own
    add(d, new THREE.CylinderGeometry(.4, .4, .04, 14), m.drumTop, 0, 1.11, 0).castShadow = false;
    d.position.set(x, y, z); d.rotation.set(tilt * (rnd() - .5), rnd() * 6, tilt * (rnd() - .5)); root.add(d); return d;
  };
  add(root, new THREE.BoxGeometry(2.4, .12, 2.0), m.wood, 0, .06, 0);   // a pallet under the lot
  for (const [x, z] of [[-.85, -.5], [0, -.55], [.85, -.5], [-.85, .45], [0, .5], [.85, .45]]) drum(x + (rnd() - .5) * .08, .12, z + (rnd() - .5) * .08, .04);
  for (const [x, z] of [[-.42, -.05], [.42, 0], [0, .0]].slice(0, 2)) drum(x, 1.22, z + (rnd() - .5) * .1, .08);
  add(root, new THREE.BoxGeometry(2.6, .05, .06), m.dark, 0, .75, -.95).castShadow = false;   // a strap round the lot
  const side = add(root, new THREE.CylinderGeometry(.42, .42, 1.1, 14), m.drum[2], 1.55, .42, .0); side.rotation.z = Math.PI / 2; side.rotation.y = .4;   // one on its side, spilling over toward the road
  return root;
}

export function buildCrateStack(seed = 1) {
  const root = new THREE.Group(), m = M(), rnd = seededRandom(seed * 17 + 9); root.name = 'crates';
  const crate = (x, y, z, w, h, d, rot, mt) => {
    const c = new THREE.Group(); add(c, new THREE.BoxGeometry(w, h, d), mt, 0, h / 2, 0);
    for (const sx of [-1, 1]) add(c, new THREE.BoxGeometry(.08, h + .03, d + .03), m.cleat, sx * (w / 2 - .06), h / 2, 0).castShadow = false;   // end cleats
    c.position.set(x, y, z); c.rotation.y = rot; root.add(c); return c;
  };
  crate(-.55, 0, -.2, 1.2, .75, .8, (rnd() - .5) * .15, m.crate[0]);
  crate(.7, 0, .15, 1.2, .75, .8, (rnd() - .5) * .15 + .2, m.crate[1]);
  crate(-.45, .75, -.15, 1.1, .7, .75, .35, m.crate[1]);
  crate(-1.05, 0, .55, .9, .6, .7, .5, m.crate[0]);
  crate(.95, .75, -.2, .9, .6, .7, -.3, m.crate[0]);
  for (const [x, z, y] of [[1.2, -.75, .21], [1.2, -.75, .6]]) add(root, new THREE.TorusGeometry(.32, .16, 8, 16), m.dark, x, y, z).rotation.x = Math.PI / 2;   // a pair of tyres
  crate(.1, .75, .35, 1.0, .65, .7, -.25, m.wood);
  const spool = add(root, new THREE.CylinderGeometry(.5, .5, .5, 14), m.wire, 0, .5, .95); spool.rotation.x = Math.PI / 2; spool.castShadow = false;   // a drum of razor wire
  add(root, new THREE.CylinderGeometry(.62, .62, .06, 14), m.wood, 0, .5, 1.2).rotation.x = Math.PI / 2;
  add(root, new THREE.CylinderGeometry(.62, .62, .06, 14), m.wood, 0, .5, .7).rotation.x = Math.PI / 2;
  return root;
}
