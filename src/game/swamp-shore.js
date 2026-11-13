// Stage 4's swamp shore dressing: small reeds in clumps along the waterline (a few standing out in the water), and debris: sticks lying on the mud, scraps of leaf floating
// by the edge. Placed where the water mask (the one the water is drawn from) goes from wet to dry, so they follow the shore exactly; all instanced (a few draw calls, a
// couple of thousand cheap blades), not lit by shadows.
import * as THREE from 'three';

const SPACING = 1.0, STEP = 2; // m between clumps at the least; px between samples of the mask when looking for the edge
export function buildSwampShore(scene, bounds, { tex, WE, LE, L, heightAt }) {
  const cv = tex.image; if (!cv?.getContext) return;
  const w = cv.width, h = cv.height, data = cv.getContext('2d').getImageData(0, 0, w, h).data;
  const wet = (x, y) => x < 0 || y < 0 || x >= w || y >= h ? false : data[(y * w + x) * 4 + 1] > 127;
  const toX = px => ((px + .5) / w - .5) * WE, toZ = py => ((py + .5) / h - .5) * LE - L / 2; // (the canvas row 0 is the north end: see the water mesh's UVs)
  const pad = 6, px0 = Math.max(0, Math.floor((bounds.x0 - pad) / WE * w + w / 2)), px1 = Math.min(w - 1, Math.ceil((bounds.x1 + pad) / WE * w + w / 2));
  const py0 = Math.max(0, Math.floor(((bounds.z0 - pad + L / 2) / LE + .5) * h)), py1 = Math.min(h - 1, Math.ceil(((bounds.z1 + pad + L / 2) / LE + .5) * h));
  let seed = 4242; const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
  const cell = new Set(), pts = []; // dart throwing on a coarse grid so the clumps are spaced about evenly
  for (let y = py0; y <= py1; y += STEP) for (let x = px0; x <= px1; x += STEP) {
    if (!wet(x, y)) continue;
    const R = 3; let dx = 0, dy = 0; // the way to dry land: toward the dry neighbours
    for (const [ax, ay] of [[R, 0], [-R, 0], [0, R], [0, -R]]) if (!wet(x + ax, y + ay)) { dx += ax; dy += ay; }
    if (!dx && !dy) continue;
    const wx = toX(x), wz = toZ(y), key = Math.floor(wx / SPACING) + ',' + Math.floor(wz / SPACING);
    if (cell.has(key) || rnd() < .25) continue;
    cell.add(key); const len = Math.hypot(dx, dy); pts.push({ x: wx, z: wz, lx: dx / len, lz: dy / len }); // (canvas +y is +z in the world: both run south)
  }
  const reeds = [], sticks = [], leaves = [], tint = [[.42, .38, .16], [.5, .42, .2], [.3, .34, .13], [.55, .5, .3], [.36, .3, .14]];
  for (const p of pts) {
    const sx = -p.lz, sz = p.lx; // along the shore
    if (rnd() < .8) { // a clump of reeds, on the bank
      const inland = .25 + rnd(), along = (rnd() - .5) * .8, cx = p.x + p.lx * inland + sx * along, cz = p.z + p.lz * inland + sz * along, n = 3 + Math.floor(rnd() * 6), c = tint[Math.floor(rnd() * tint.length)];
      for (let i = 0; i < n; i++) reeds.push({ x: cx + (rnd() - .5) * .35, z: cz + (rnd() - .5) * .35, h: .45 + rnd() * .75, lean: (rnd() - .5) * .6, yaw: rnd() * 6.283, c: c.map(v => v * (.85 + rnd() * .3)) });
    }
    if (rnd() < .3) { // a few standing in the shallows
      const out = .15 + rnd() * .5, cx = p.x - p.lx * out, cz = p.z - p.lz * out, c = tint[Math.floor(rnd() * tint.length)];
      for (let i = 0; i < 2 + Math.floor(rnd() * 3); i++) reeds.push({ x: cx + (rnd() - .5) * .3, z: cz + (rnd() - .5) * .3, h: .4 + rnd() * .6, lean: (rnd() - .5) * .5, yaw: rnd() * 6.283, c: c.map(v => v * (.8 + rnd() * .3)), water: true });
    }
    if (rnd() < .3) { const a = rnd() * .9; sticks.push({ x: p.x + p.lx * a + sx * (rnd() - .5), z: p.z + p.lz * a + sz * (rnd() - .5), len: .3 + rnd(), yaw: rnd() * 6.283, tilt: (rnd() - .5) * .15, c: .7 + rnd() * .5 }); } // a stick on the mud
    if (rnd() < .45) for (let i = 0; i < 1 + Math.floor(rnd() * 3); i++) leaves.push({ x: p.x - p.lx * rnd() * .6 + (rnd() - .5) * .6, z: p.z - p.lz * rnd() * .6 + (rnd() - .5) * .6, s: .05 + rnd() * .09, yaw: rnd() * 6.283, c: .6 + rnd() * .6 }); // scraps floating
  }
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), pos = new THREE.Vector3(), sc = new THREE.Vector3(), col = new THREE.Color();
  const make = (geo, material, list, place) => {
    if (!list.length) return;
    const im = new THREE.InstancedMesh(geo, material, list.length);
    list.forEach((it, i) => { place(it); im.setMatrixAt(i, m); im.setColorAt(i, col); });
    im.frustumCulled = false; scene.add(im);
  };
  const lit = (extra = {}) => new THREE.MeshStandardMaterial({ roughness: 1, envMapIntensity: .1, ...extra });
  make(new THREE.ConeGeometry(.03, 1, 3, 1, true).translate(0, .5, 0), lit({ side: THREE.DoubleSide }), reeds, r => {
    pos.set(r.x, (r.water ? .03 : heightAt(r.x, r.z)) - .03, r.z); m.compose(pos, q.setFromEuler(e.set(r.lean, r.yaw, r.lean * .6)), sc.set(1, r.h, 1)); col.setRGB(...r.c);
  });
  make(new THREE.CylinderGeometry(.03, .025, 1, 5).rotateZ(Math.PI / 2), lit(), sticks, r => {
    pos.set(r.x, heightAt(r.x, r.z) + .02, r.z); m.compose(pos, q.setFromEuler(e.set(0, r.yaw, r.tilt)), sc.set(r.len, 1, 1)); col.setRGB(.2 * r.c, .14 * r.c, .08 * r.c);
  });
  make(new THREE.CircleGeometry(1, 6).rotateX(-Math.PI / 2), lit({ side: THREE.DoubleSide }), leaves, r => {
    pos.set(r.x, .05, r.z); m.compose(pos, q.setFromEuler(e.set(0, r.yaw, 0)), sc.set(r.s, 1, r.s * .55)); col.setRGB(.26 * r.c, .22 * r.c, .08 * r.c);
  });
}
