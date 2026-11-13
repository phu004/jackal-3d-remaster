// A campfire: a ring of rough stones with snow on top, charred logs leaning in over a bed of glowing embers, a patch of melted, dark ground round it, and two seat logs. The flames, sparks, smoke and firelight are
// not here: the game starts a fire at the spot (Fires, fire.js). buildCampfire(seed) returns a Group about 4 m across, origin on the ground at the middle of the fire.
import * as THREE from 'three';
import { mergeStatic } from '../game/optimize.js';

let barkTex = null, meltTex = null;
const bark = () => barkTex ??= (() => { // vertical furrows in dark brown wood
  const W = 64, H = 128, c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d'); x.fillStyle = '#4a3523'; x.fillRect(0, 0, W, H);
  let sd = 3; const rn = () => (sd = (sd * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 90; i++) { const px = rn() * W, w = 1 + rn() * 3, v = rn() < .5 ? 20 : 90; x.fillStyle = `rgba(${v},${v * .7 | 0},${v * .5 | 0},${.25 + rn() * .3})`; x.fillRect(px, rn() * H * .5, w, 20 + rn() * 80); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; return t;
})();
const melt = () => meltTex ??= (() => { // dark wet earth and slush in the middle, fading out into the snow
  const S = 256, c = document.createElement('canvas'); c.width = c.height = S; const x = c.getContext('2d'), g = x.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, 'rgba(24,20,17,.95)'); g.addColorStop(.45, 'rgba(36,30,26,.85)'); g.addColorStop(.7, 'rgba(70,62,56,.5)'); g.addColorStop(1, 'rgba(120,112,106,0)'); x.fillStyle = g; x.fillRect(0, 0, S, S);
  let sd = 9; const rn = () => (sd = (sd * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 60; i++) { const a = rn() * 6.28, d = 40 + rn() * 80, r = 6 + rn() * 14, gg = x.createRadialGradient(S / 2 + Math.cos(a) * d, S / 2 + Math.sin(a) * d, 0, S / 2 + Math.cos(a) * d, S / 2 + Math.sin(a) * d, r); gg.addColorStop(0, 'rgba(30,26,22,.4)'); gg.addColorStop(1, 'rgba(30,26,22,0)'); x.fillStyle = gg; x.fillRect(0, 0, S, S); }
  return new THREE.CanvasTexture(c);
})();

export function buildCampfire(seed = 1) {
  let sd = seed * 7919 % 2147483647 || 1; const rn = () => (sd = (sd * 16807) % 2147483647) / 2147483647;
  const g = new THREE.Group(); g.name = 'campfire';
  const add = (geo, mat, x, y, z, cast = true) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = cast; m.receiveShadow = true; g.add(m); return m; };

  const patch = new THREE.Mesh(new THREE.CircleGeometry(2.1, 40), new THREE.MeshStandardMaterial({ map: melt(), transparent: true, depthWrite: false, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  patch.rotation.x = -Math.PI / 2; patch.position.y = .04; patch.receiveShadow = true; g.add(patch); // (melted ground)

  const ash = add(new THREE.CylinderGeometry(.62, .7, .08, 20), new THREE.MeshStandardMaterial({ color: 0x1c1917, roughness: 1 }), 0, .06, 0, false); // (the charcoal and ash bed)
  const emberMat = new THREE.MeshStandardMaterial({ color: 0x3a1208, emissive: 0xff4a10, emissiveIntensity: 2.2, roughness: .8 });
  for (let i = 0; i < 9; i++) { const a = rn() * 6.28, d = rn() * .5, e = add(new THREE.IcosahedronGeometry(.07 + rn() * .06, 0), emberMat, Math.cos(a) * d, .13 + rn() * .04, Math.sin(a) * d, false); e.scale.set(1.4, .6, 1.1); e.rotation.y = rn() * 6; } // (red-hot coals)

  // the stone ring: eleven rough stones, each a lumpy rounded shape with a cap of snow on its top
  const stoneMats = [0x77756f, 0x66655f, 0x85827a, 0x5c5b57].map(c => new THREE.MeshStandardMaterial({ color: c, roughness: .95 })), snowMat = new THREE.MeshStandardMaterial({ color: 0xf3f6fb, roughness: 1 }); // (shared, so the pieces can be merged into a few meshes)
  for (let i = 0; i < 11; i++) {
    const a = i / 11 * Math.PI * 2 + (rn() - .5) * .2, r = 1.02 + (rn() - .5) * .12, s = .26 + rn() * .12, geo = new THREE.IcosahedronGeometry(1, 2), pos = geo.attributes.position;
    for (let k = 0; k < pos.count; k++) { const n = 1 + (Math.sin(pos.getX(k) * 5 + i) * Math.cos(pos.getZ(k) * 4 + i * 2) + Math.sin(pos.getY(k) * 6 + i * 3)) * .11; pos.setXYZ(k, pos.getX(k) * n, pos.getY(k) * n, pos.getZ(k) * n); }
    geo.computeVertexNormals();
    const st = add(geo, stoneMats[i % 4], Math.cos(a) * r, s * .5, Math.sin(a) * r); st.scale.set(s * (1.05 + rn() * .3), s * .78, s * (.85 + rn() * .3)); st.rotation.y = rn() * 6;
    const cap = add(new THREE.SphereGeometry(1, 12, 6), snowMat, Math.cos(a) * r, s * .92, Math.sin(a) * r, false); cap.scale.set(s * .85, s * .24, s * .7); cap.rotation.y = st.rotation.y;
  }

  // the logs: charred toward the fire (vertex colours), bark furrows, leaning in over the coals at about 55 degrees and crossing at the top, plus two lying across the bed
  const woodMat = new THREE.MeshStandardMaterial({ map: bark(), vertexColors: true, roughness: 1 });
  const log = (len, r) => { const geo = new THREE.CylinderGeometry(r * .9, r, len, 10, 6), pos = geo.attributes.position, col = new Float32Array(pos.count * 3);
    for (let k = 0; k < pos.count; k++) { const t = (pos.getY(k) + len / 2) / len, burnt = Math.pow(t, 1.5), j = .85 + Math.random() * .3, v = (1 - burnt * .85) * j; col[k * 3] = v; col[k * 3 + 1] = v * (1 - burnt * .1); col[k * 3 + 2] = v * (1 - burnt * .2); }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3)); return geo; };
  for (let i = 0; i < 6; i++) { // (a loose teepee: each foot out on the ground, the tops crossing over the fire)
    const a = i / 6 * Math.PI * 2 + rn() * .3, foot = new THREE.Vector3(Math.cos(a) * (.85 + rn() * .2), .1, Math.sin(a) * (.85 + rn() * .2)), apex = new THREE.Vector3((rn() - .5) * .14, .78 + rn() * .12, (rn() - .5) * .14), dir = apex.clone().sub(foot), len = dir.length() + .12;
    const m = new THREE.Mesh(log(len, .07 + rn() * .02), woodMat); m.castShadow = m.receiveShadow = true; m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize()); m.position.copy(foot).addScaledVector(dir, len / 2 - .05); g.add(m);
  }
  for (const [a, len] of [[.4, 1.0], [2.2, .9]]) { const m = new THREE.Mesh(log(len, .085), woodMat); m.castShadow = m.receiveShadow = true; m.rotation.set(0, a, Math.PI / 2); m.position.set(0, .15, 0); g.add(m); } // (lying across the coals)

  // two seat logs a little way off, with a bank of snow along the top
  for (const [a, rr, len] of [[-.55, 2.05, 1.9], [2.7, 1.95, 1.6]]) {
    const x = Math.cos(a) * rr, z = Math.sin(a) * rr, m = new THREE.Mesh(log(len, .17), woodMat); m.castShadow = m.receiveShadow = true; m.position.set(x, .17, z); m.rotation.set(0, -a + Math.PI / 2, Math.PI / 2); g.add(m);
    const snow = add(new THREE.SphereGeometry(1, 14, 6), snowMat, x, .3, z, false); snow.scale.set(.1, .07, len * .42); snow.rotation.y = -a + Math.PI / 2 + Math.PI / 2;
  }
  return mergeStatic(g);
}
