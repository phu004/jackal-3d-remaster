// A buried land mine (stage 4), low-poly and flat-shaded: a squat round olive-and-earth case, a raised rim, a slightly smaller pressure plate on top with a domed fuse and four
// ribs, and a few crumbs of soil round it. Coloured to sit in the meadow (dull greens and browns, no warning paint) but fully visible. About a metre across, 12 cm high; origin on
// the ground at its centre.
import * as THREE from 'three';
import { mergeGeometries } from '../game/optimize.js';

const std = (c, r = .85, m = .25) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m, flatShading: true, envMapIntensity: .25 });

const MINE_MAT = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .85, metalness: .2, flatShading: true, envMapIntensity: .25 });
// look: 'olive' (the meadow's), or 'orange' (stage 5: the NES map's orange dots; a bright case on a dark rim reads against the bridges' grey stone)
const LOOKS = { olive: { case_: 0x8c8450, plate: 0xb4a866, rim: 0x23260f, fuse: 0xdcc86a, rib: 0x2a2a14 }, orange: { case_: 0xa85a1a, plate: 0xc27a34, rim: 0x33200e, fuse: 0xd2ae52, rib: 0x3a2410 } };
export function buildLandmine(seed = 1, look = 'olive') {
  let s = seed * 9301 + 49297; const rnd = () => (s = (s * 9301 + 49297) % 233280) / 233280;
  const g = new THREE.Group(); g.name = 'landmine';
  const add = (geo, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = false; m.receiveShadow = true; g.add(m); return m; }; // (no shadow: a mine is 12 cm high, its shadow would be a dozen draw calls in the shadow pass for nothing)
  const L = LOOKS[look] ?? LOOKS.olive, case_ = std(L.case_), plate = std(L.plate), rim = std(L.rim), fuse = std(L.fuse, .6, .45), rib = std(L.rib);
  add(new THREE.CylinderGeometry(.46, .5, .09, 14), case_, 0, .03, 0);                                       // the case, a little sunk into the ground
  add(new THREE.TorusGeometry(.4, .035, 4, 14).rotateX(Math.PI / 2), rim, 0, .085, 0);                        // its raised rim
  add(new THREE.CylinderGeometry(.3, .34, .05, 12), plate, 0, .11, 0);                                        // the pressure plate
  add(new THREE.SphereGeometry(.11, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), fuse, 0, .135, 0);                  // the domed fuse
  for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + Math.PI / 4, b = add(new THREE.BoxGeometry(.2, .03, .05), rib, Math.cos(a) * .2, .14, Math.sin(a) * .2); b.rotation.y = -a; } // four ribs on the plate
  for (let i = 0; i < 7; i++) { const a = rnd() * 6.283, d = .45 + rnd() * .22, k = .03 + rnd() * .04, c = add(new THREE.IcosahedronGeometry(k, 0), std(0x4a3a24, 1, 0), Math.cos(a) * d, .02, Math.sin(a) * d); c.scale.y = .6; } // crumbs of soil
  // All its parts, each with its own colour baked into the vertices, become one mesh with one shared material: a mine was fifteen draw calls (each part had a material of its own), a field of them hundreds.
  { const geos = [], kids = [...g.children]; g.updateMatrixWorld(true);
    for (const m of kids) { const ge = m.geometry.clone().applyMatrix4(m.matrixWorld), n = ge.attributes.position.count, col = new Float32Array(n * 3), c = m.material.color; for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; } ge.setAttribute('color', new THREE.BufferAttribute(col, 3)); geos.push(ge); }
    const merged = mergeGeometries(geos);
    if (merged) { for (const m of kids) g.remove(m); const mesh = new THREE.Mesh(merged, MINE_MAT); mesh.castShadow = false; mesh.receiveShadow = true; g.add(mesh); } }
  g.rotation.y = rnd() * 6.283;
  return g;
}
