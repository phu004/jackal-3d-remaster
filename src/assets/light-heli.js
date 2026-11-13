// Light utility helicopter (placeholder): a single-engine six-seater in the style of the photo the
// player supplied, white with a green cheat line after the NES sprite. A rounded cabin pod with a big
// wrap-round windscreen and chin windows, a raised engine cowling behind the mast, a slim tail
// boom with an end-plated stabiliser and swept fin, the tail rotor on the left, and skids.
// Real size (~10.9 m long with the rotor turning). Origin on the ground under the mast, front -Z.
// Named parts: `rotor` (spins on Y, has a child `disc` blur disc), `tailRotor` (spins on X),
// `doorL` / `doorR` (markers on the ground by the cabin doors, where passengers climb in).
import * as THREE from 'three';
import { add, mat, cached, PI, rotorBlurMaterial } from './common.js';

const pmat = (c, r, m, o) => mat(c, r, m, Object.assign({ envMapIntensity: .5 }, o));

// A patch of the cabin ellipsoid (same centre and radii, pushed out by `grow`), for windows and paint.
function patch(parent, material, c, rad, grow, phi0, phiLen, th0, thLen) {
  const g = new THREE.SphereGeometry(1, 40, 24, phi0, phiLen, th0, thLen);
  const m = add(parent, g, material, c.x, c.y, c.z);
  m.scale.set(rad.x * grow, rad.y * grow, rad.z * grow);
  return m;
}

export function buildLightHeli() {
  const m = cached('lightHeliMats', () => ({
    white: pmat(0xf2f2ee, .35, .15), green: pmat(0x2f8a3a, .4, .15), grey: pmat(0x8a8e90, .45, .6),
    dark: pmat(0x26282a, .6, .4), glass: pmat(0x1b2830, .08, .7, { transparent: true, opacity: .85 }),
    blade: pmat(0x2a2c2e, .5, .3), tip: pmat(0xe8c040, .5, .1), skid: pmat(0x303234, .45, .6),
  }));
  const root = new THREE.Group(); root.name = 'lightHeli';

  // cabin pod and the rear fuselage it fairs into
  const cc = new THREE.Vector3(0, 1.42, -.75), cr = new THREE.Vector3(.92, .86, 1.95);
  patch(root, m.white, cc, cr, 1, 0, PI * 2, 0, PI);
  add(root, new THREE.SphereGeometry(1, 32, 18), m.white, 0, 1.5, .9).scale.set(.78, .74, 1.45);
  // windows: wrap-round windscreen, chin windows, side windows in the cabin doors
  patch(root, m.glass, cc, cr, 1.012, PI * 1.5 - .95, 1.9, .3, 1.15);
  patch(root, m.glass, cc, cr, 1.012, PI * 1.5 - .5, 1.0, 1.9, .45);
  patch(root, m.glass, cc, cr, 1.012, PI - .45, .9, .55, .85);   // right
  patch(root, m.glass, cc, cr, 1.012, -.45, .9, .55, .85);       // left
  patch(root, m.green, cc, cr, 1.006, PI * 1.5 - .95 + 1.9, PI * 2 - 1.9, 1.55, .14); // cheat line (not across the windscreen)
  // engine cowling and gearbox fairing on the roof, exhaust out the back
  add(root, new THREE.SphereGeometry(1, 28, 16), m.white, 0, 2.15, .55).scale.set(.58, .42, 1.45);
  add(root, new THREE.BoxGeometry(.5, .06, .9), m.dark, -.4, 2.3, 1.0).rotation.z = .5;   // intake grille
  add(root, new THREE.BoxGeometry(.5, .06, .9), m.dark, .4, 2.3, 1.0).rotation.z = -.5;
  add(root, new THREE.CylinderGeometry(.16, .2, .55, 14), m.grey, .32, 2.2, 2.05).rotation.x = PI / 2 - .2; // exhaust
  // tail boom (white with the green line carried along it), stabiliser with end plates, fin
  const boom = add(root, new THREE.CylinderGeometry(.16, .36, 5.2, 18), m.white, 0, 1.68, 4.55);
  boom.rotation.x = PI / 2 - .05; // rises slightly toward the tail
  const stripe = add(root, new THREE.CylinderGeometry(.225, .362, 3.6, 18, 1, true, PI * .35, PI * .3), m.green, 0, 1.64, 3.75);
  stripe.rotation.x = PI / 2 - .05; stripe.scale.set(1.01, 1, 1.01);
  const stripe2 = stripe.clone(); stripe2.rotation.y = PI; stripe2.position.copy(stripe.position); root.add(stripe2);
  add(root, new THREE.BoxGeometry(2.3, .06, .5), m.white, 0, 1.82, 6.0);
  [-1, 1].forEach(s => add(root, new THREE.BoxGeometry(.06, .55, .5), m.white, s * 1.15, 1.9, 6.05));
  const fin = new THREE.Shape(); // side view: x = back along the boom, y = up
  fin.moveTo(0, -.65); fin.lineTo(.5, -.75); fin.lineTo(.75, .2); fin.lineTo(1.05, 1.35); fin.lineTo(.75, 1.4); fin.lineTo(.15, .3); fin.closePath();
  const finM = add(root, new THREE.ExtrudeGeometry(fin, { depth: .07, bevelEnabled: false }), m.white, .035, 1.85, 6.55);
  finM.rotation.y = -PI / 2;
  // tail rotor on the left of the fin
  const tail = new THREE.Group(); tail.name = 'tailRotor'; tail.position.set(-.18, 2.15, 7.3); root.add(tail);
  add(tail, new THREE.CylinderGeometry(.08, .08, .12, 10), m.grey).rotation.z = PI / 2;
  [0, PI].forEach(a => { const b = add(tail, new THREE.BoxGeometry(.03, .92, .14), m.blade, 0, Math.cos(a) * .48, Math.sin(a) * .48); b.rotation.x = a; });
  // main rotor: mast, hub and three blades with yellow tips, and a motion-blur disc
  add(root, new THREE.CylinderGeometry(.11, .15, .45, 12), m.grey, 0, 2.72, -.1);
  const rotor = new THREE.Group(); rotor.name = 'rotor'; rotor.position.set(0, 2.98, -.1); root.add(rotor);
  add(rotor, new THREE.CylinderGeometry(.28, .32, .16, 16), m.dark);
  for (let i = 0; i < 3; i++) {
    const a = i * 2 * PI / 3, arm = new THREE.Group(); arm.rotation.y = a; rotor.add(arm);
    add(arm, new THREE.BoxGeometry(5.0, .04, .3), m.blade, 2.85, .02, 0);
    add(arm, new THREE.BoxGeometry(.35, .045, .3), m.tip, 5.2, .02, 0);
  }
  const disc = new THREE.Mesh(new THREE.CircleGeometry(5.4, 64), rotorBlurMaterial());
  disc.name = 'disc'; disc.rotation.x = -PI / 2; rotor.add(disc);
  // skids: two tubes with upturned toes on bent cross tubes
  [-1, 1].forEach(s => {
    add(root, new THREE.CylinderGeometry(.045, .045, 3.1, 8), m.skid, s * 1.08, .06, -.45).rotation.x = PI / 2;
    const toe = add(root, new THREE.CylinderGeometry(.045, .045, .45, 8), m.skid, s * 1.08, .16, -2.15); toe.rotation.x = PI / 2 + .6;
  });
  for (const z of [-1.25, .45]) {
    const curve = new THREE.CatmullRomCurve3([[-1.08, .06], [-1.0, .45], [-.6, .68], [.6, .68], [1.0, .45], [1.08, .06]].map(([x, y]) => new THREE.Vector3(x, y, z)));
    add(root, new THREE.TubeGeometry(curve, 24, .045, 6), m.skid);
  }
  [['doorL', -1.45], ['doorR', 1.45]].forEach(([n, x]) => { // where boarders climb in (cabin doors, on the ground)
    const d = new THREE.Object3D(); d.name = n; d.position.set(x, 0, -.35); root.add(d);
  });
  return root;
}
