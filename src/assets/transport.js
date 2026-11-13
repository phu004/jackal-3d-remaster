// Tandem-rotor transport — the chopper that drops the jeep off at the start of each stage.
// Ported from asset-sources/Tandem-Rotor Transport – Textured.html (Claude.ai artifact).
//
// Contract: ~14.5 m long, origin on the ground under the fuselage, nose toward -Z.
// Named parts:
//   rotorFront / rotorRear  spin on Y (front clockwise, rear counter-clockwise); each has a child 'disc' (blur disc)
//   ramp                    rear loading ramp, hinges on X between RAMP_CLOSED and RAMP_OPEN
//   rampOpening             dark cargo-bay opening, show it while the ramp is down
import * as THREE from 'three';
import { PI, add, mat, paint, palette, tireMaterial, roundedRect, extrudeProfile, decal, rotorBlurMaterial } from './common.js';

export const RAMP_CLOSED = -0.33, RAMP_OPEN = 0.27;
// Where the ramp hinge sits, in model space (useful for driving things out of it).
export const RAMP_HINGE = new THREE.Vector3(0, 0.7, 4.1);
export const RAMP_LENGTH = 2.6;

export function buildTransport() {
  const { black: BLK, steel: STL, yellow: YEL, glass: GLS } = palette();
  const GRN = paint('#136322', .3, .35), DKG = paint('#083614', .38, .3), TIRE = tireMaterial();

  const root = new THREE.Group(); root.name = 'transport';
  const H = new THREE.Group(); H.position.y = 0.82; root.add(H); // lifts wheels onto y = 0
  const mesh = (g, m, x = 0, y = 0, z = 0, p = H) => add(p, g, m, x, y, z);
  const ext = (shape, depth, bt, bs, m, x, y, z) => extrudeProfile(H, shape, depth, bt, bs, m, x, y, z);

  // ---- fuselage: blunt nose, flat cabin roof, upswept tail with ramp ----
  const fp = new THREE.Shape();
  fp.moveTo(-6.4, .35); fp.quadraticCurveTo(-6.9, .4, -6.9, 1.1); fp.lineTo(-6.85, 1.5);
  fp.quadraticCurveTo(-6.7, 2.1, -6.1, 2.45); fp.lineTo(-5.0, 2.6); fp.lineTo(4.4, 2.6);
  fp.quadraticCurveTo(6.4, 2.6, 7.1, 2.15); fp.lineTo(7.35, 1.55); fp.lineTo(6.6, .9);
  fp.quadraticCurveTo(5.4, .3, 4.0, .05); fp.lineTo(-5.4, 0); fp.quadraticCurveTo(-6.1, 0, -6.4, .35);
  ext(fp, 3.2, .3, .18, GRN);
  // belly keel stripe
  ext(roundedRect(9, .28, .1), 2.0, .12, .06, DKG, 0, -.05, -.6);

  // cockpit windscreen + frame, side windows
  {
    const P0 = [-6.85, 1.5], C = [-6.7, 2.1], P1 = [-6.1, 2.45];
    const pt = t => [(1 - t) * (1 - t) * P0[0] + 2 * (1 - t) * t * C[0] + t * t * P1[0], (1 - t) * (1 - t) * P0[1] + 2 * (1 - t) * t * C[1] + t * t * P1[1]];
    const tn = t => { const dx = 2 * (1 - t) * (C[0] - P0[0]) + 2 * t * (P1[0] - C[0]), dy = 2 * (1 - t) * (C[1] - P0[1]) + 2 * t * (P1[1] - C[1]), l = Math.hypot(dx, dy); return [dx / l, dy / l]; };
    const strip = (t0, t1, o1, o2, depth, m, xc) => {
      const a = [], b = [];
      for (let i = 0; i <= 24; i++) {
        const t = t0 + (t1 - t0) * i / 24, p = pt(t), T = tn(t), N = [-T[1], T[0]];
        a.push(new THREE.Vector2(p[0] + N[0] * o2, p[1] + N[1] * o2)); b.push(new THREE.Vector2(p[0] + N[0] * o1, p[1] + N[1] * o1));
      }
      const g = new THREE.ExtrudeGeometry(new THREE.Shape(a.concat(b.reverse())), { depth, bevelEnabled: false });
      g.translate(0, 0, -depth / 2); const o = mesh(g, m, xc || 0, 0, 0); o.rotation.y = -PI / 2; return o;
    };
    strip(0, 1, .185, .235, 3.2, BLK);                           // frame plate hugging the nose
    strip(.08, .92, .225, .27, 2.8, GLS);                        // curved glass
    [-.95, 0, .95].forEach(x => strip(.05, .95, .225, .3, .1, BLK, x)); // posts
  }

  [-1, 1].forEach(s => {
    mesh(new THREE.BoxGeometry(.05, .9, 1.6), BLK, s * 1.91, 1.95, -5.7); mesh(new THREE.BoxGeometry(.06, .75, 1.4), GLS, s * 1.93, 1.95, -5.7);
    for (let i = 0; i < 5; i++) mesh(new THREE.CylinderGeometry(.19, .19, .06, 20), BLK, s * 1.92, 1.75, -.6 + i * 1.15).rotation.z = PI / 2; // portholes
    mesh(new THREE.CylinderGeometry(.12, .12, .06, 16), GLS, s * 1.94, 1.75, -.6).rotation.z = PI / 2;
    // sponsons + main gear
    ext(roundedRect(4.8, 1.05, .48), .4, .28, .14, GRN, s * 2.15, .42, .5);
    mesh(new THREE.CylinderGeometry(.08, .08, .7, 12), STL, s * 2.15, -.15, 2.3);
    mesh(new THREE.CylinderGeometry(.4, .4, .34, 32), TIRE, s * 2.15, -.42, 2.3).rotation.z = PI / 2;
    mesh(new THREE.CylinderGeometry(.2, .2, .36, 20), STL, s * 2.15, -.42, 2.3).rotation.z = PI / 2;
    // nose gear
    mesh(new THREE.CylinderGeometry(.32, .32, .16, 28), TIRE, s * .34, -.46, -5.0).rotation.z = PI / 2;
    // engine nacelles + exhausts on aft pylon
    mesh(new THREE.CylinderGeometry(.5, .38, 2.8, 32), GRN, s * .95, 3.6, 4.3).rotation.x = PI / 2;
    mesh(new THREE.CylinderGeometry(.3, .4, .5, 24), BLK, s * .95, 3.6, 5.9).rotation.x = PI / 2;
    // nav lights (red = port on the right when viewed from the front, as in the source artifact)
    mesh(new THREE.SphereGeometry(.1, 12, 12), mat(s > 0 ? 0xff3030 : 0x30ff50, .3, .1, { emissive: s > 0 ? 0x660000 : 0x006615 }), s * 1.9, 2.5, -6.3);
  });
  mesh(new THREE.CylinderGeometry(.06, .06, .75, 12), STL, 0, -.05, -5.0);
  mesh(new THREE.BoxGeometry(.3, .1, .3), YEL, 0, .9, -7.15); // landing light
  // cargo door (starboard) + upper rear door outline
  mesh(new THREE.BoxGeometry(.04, 1.5, 1.7), DKG, 1.93, 1.25, -2.6);
  mesh(new THREE.BoxGeometry(2.7, .95, .06), DKG, 0, 1.6, 7.3).rotation.x = .5;
  // aft pylon (tall, tapered)
  const ps = new THREE.Shape(); ps.moveTo(0, 0); ps.lineTo(3.0, 0); ps.lineTo(2.1, 2.4); ps.lineTo(.9, 2.4); ps.closePath();
  ext(ps, 1.3, .05, .05, GRN, 0, 2.4, 3.4);
  // forward pylon fairing + masts
  mesh(new THREE.CylinderGeometry(.6, .85, .75, 32), GRN, 0, 2.95, -4.2);
  mesh(new THREE.CylinderGeometry(.2, .28, .7, 24), DKG, 0, 3.5, -4.2);
  mesh(new THREE.CylinderGeometry(.22, .3, .6, 24), DKG, 0, 4.85, 4.85);

  // ---- rotors ----
  const bs = new THREE.Shape(); bs.moveTo(.5, -.3); bs.lineTo(6.3, -.2); bs.quadraticCurveTo(6.55, 0, 6.3, .2); bs.lineTo(.5, .32); bs.closePath();
  const bg = new THREE.ExtrudeGeometry(bs, { depth: .07, bevelEnabled: true, bevelSize: .02, bevelThickness: .015, bevelSegments: 2 });
  const rotor = (name, y, z) => {
    const g = new THREE.Group(); g.name = name; g.position.set(0, y, z); H.add(g);
    mesh(new THREE.CylinderGeometry(.5, .58, .34, 32), STL, 0, 0, 0, g);
    for (let i = 0; i < 3; i++) {
      const a = i * 2 * PI / 3, b = mesh(bg, BLK, 0, 0, 0, g); b.rotation.x = -PI / 2; b.rotation.z = a;
      mesh(new THREE.BoxGeometry(.55, .08, .32), YEL, Math.cos(a) * 6.0, .04, -Math.sin(a) * 6.0, g).rotation.y = a;
    }
    const d = new THREE.Mesh(new THREE.CircleGeometry(6.6, 64), rotorBlurMaterial());
    d.name = 'disc'; d.rotation.x = -PI / 2; g.add(d);
  };
  rotor('rotorFront', 3.9, -4.2);
  rotor('rotorRear', 5.25, 4.85);

  // ---- rear loading ramp (new for the game) ----
  const hinge = new THREE.Group(); hinge.name = 'ramp';
  hinge.position.set(RAMP_HINGE.x, RAMP_HINGE.y - H.position.y, RAMP_HINGE.z); hinge.rotation.x = RAMP_CLOSED; H.add(hinge);
  mesh(new THREE.BoxGeometry(2.5, .12, RAMP_LENGTH), DKG, 0, -.06, RAMP_LENGTH / 2, hinge);
  for (let i = 0; i < 6; i++) mesh(new THREE.BoxGeometry(2.2, .05, .08), BLK, 0, .02, .3 + i * .4, hinge); // grip bars
  const hole = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 2.7), new THREE.MeshBasicMaterial({ color: 0x0a0a06, side: THREE.DoubleSide }));
  hole.name = 'rampOpening'; hole.position.set(0, .29, 5.36); hole.rotation.x = PI / 2 - .32; hole.visible = false; H.add(hole);

  // ---- stencils ----
  [-1, 1].forEach(s => {
    const d = decal(1.8, .9, (x, w, hh) => {
      x.fillStyle = 'rgba(236,236,214,.93)'; x.font = 'bold 190px Impact,"Arial Black",sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('154', w / 2, hh * .4);
      for (let i = 0; i < 13; i++) { x.fillStyle = i % 2 ? 'rgba(20,20,20,.92)' : 'rgba(240,200,40,.95)'; x.fillRect(38 + i * 34, hh * .8, 34, hh * .14); }
    });
    d.position.set(s * 1.915, 1.65, 5.3); d.rotation.y = s * PI / 2; H.add(d);
  });

  return root;
}
