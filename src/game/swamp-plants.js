// Stage 4's plants on the mud water: low-poly, flat-shaded and instanced (a handful of draw calls). Lily pads (a notched disc) float in drifts, a few with a lotus flower on
// them; patches of duckweed lie on the surface; clumps of cattails and rushes stand out of the shallows. They sit where the water is, a margin in from the shore, and keep clear
// of the tree trunks. Not mirrored in the water (userData.noWater) and not shadowed: the water level is flat, so they cost almost nothing.
import * as THREE from 'three';
import { BufferGeometryUtils } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const SURFACE = .05; // m: just over the water mesh, which is at .01 (no z-fighting)
const PAD_VARIANTS = 5;

// geo, placed by m and painted one colour: non-indexed, only position, normal and color kept (so they merge)
function piece(geo, m, rgb) {
  let g = geo.clone(); g.deleteAttribute('uv'); g.applyMatrix4(m); if (g.index) g = g.toNonIndexed(); g.computeVertexNormals();
  const n = g.attributes.position.count, col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { col[i * 3] = rgb[0]; col[i * 3 + 1] = rgb[1]; col[i * 3 + 2] = rgb[2]; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

// An irregular pad, a fan from the centre: a wavering outline with a few torn-in bites, a notch of its own width and place, the rim curled up unevenly (some sides more than others),
// and a darker, wetter heart fading to a paler edge. `v` seeds it, so each variant differs.
function padGeometry(v) {
  let s = 700 + v * 131; const rnd = () => (s = (s * 9301 + 49297) % 233280) / 233280;
  const n = 11 + (v % 3) * 2, notch = .2 + rnd() * .6, a0 = rnd() * 6.283, ph = rnd() * 6.283, curl = .05 + rnd() * .22, base = [.17 + rnd() * .06, .33 + rnd() * .08, .1 + rnd() * .05];
  const pos = [], col = [], ring = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + (Math.PI * 2 - notch) * i / n, bite = rnd() < .18 ? .7 + rnd() * .15 : 1, r = (1 + (rnd() - .5) * .24) * bite * (1 + .08 * Math.sin(a * 2 + ph));
    const y = r * r * curl * (.4 + .9 * Math.max(0, Math.sin(a * 1.5 + ph))) * (bite < 1 ? .4 : 1), k = .9 + rnd() * .2;
    ring.push([Math.cos(a) * r, y, Math.sin(a) * r, k]);
  }
  const put = (p, dark) => { pos.push(p[0], p[1], p[2]); const k = dark ? .75 : (p[3] ?? 1) * 1.05; col.push(base[0] * k, base[1] * k, base[2] * k); };
  for (let i = 0; i < n; i++) { put([0, -.01, 0, 1], true); put(ring[i]); put(ring[i + 1]); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.computeVertexNormals();
  return g;
}

function flowerGeometry() { // a lotus: two rings of pointed petals round a yellow heart
  const parts = [], I = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  for (const [n, tilt, h, w, c] of [[6, .95, .2, .07, [.85, .55, .65]], [5, .5, .26, .06, [.95, .8, .85]]]) {
    for (let i = 0; i < n; i++) {
      const a = i / n * 6.283 + (n === 5 ? .3 : 0), g = new THREE.ConeGeometry(w, h, 3).translate(0, h / 2, 0);
      parts.push(piece(g, new THREE.Matrix4().compose(new THREE.Vector3(Math.cos(a) * .025, 0, Math.sin(a) * .025), q.setFromEuler(e.set(Math.sin(a) * tilt, 0, -Math.cos(a) * tilt)), new THREE.Vector3(1, 1, 1)), c));
    }
  }
  parts.push(piece(new THREE.CylinderGeometry(.03, .04, .07, 5).translate(0, .035, 0), I, [.9, .75, .15]));
  return BufferGeometryUtils.mergeBufferGeometries(parts);
}

function cattailGeometry() { // a clump: slim blades and a few stalks, each topped with a brown spike
  const parts = [], q = new THREE.Quaternion(), e = new THREE.Euler();
  let s = 31; const rnd = () => (s = (s * 9301 + 49297) % 233280) / 233280;
  for (let i = 0; i < 7; i++) { // blades
    const h = .7 + rnd() * .6, a = rnd() * 6.283, d = rnd() * .12;
    parts.push(piece(new THREE.ConeGeometry(.035, h, 3, 1, true).translate(0, h / 2, 0), new THREE.Matrix4().compose(new THREE.Vector3(Math.cos(a) * d, 0, Math.sin(a) * d), q.setFromEuler(e.set((rnd() - .5) * .5, rnd() * 6, (rnd() - .5) * .5)), new THREE.Vector3(1, 1, 1)), [.3 + rnd() * .1, .42 + rnd() * .1, .14]));
  }
  for (let i = 0; i < 4; i++) { // stalks with spikes
    const h = 1.0 + rnd() * .55, a = rnd() * 6.283, d = rnd() * .14, lx = (rnd() - .5) * .3, lz = (rnd() - .5) * .3;
    const m = new THREE.Matrix4().compose(new THREE.Vector3(Math.cos(a) * d, 0, Math.sin(a) * d), q.setFromEuler(e.set(lx, 0, lz)), new THREE.Vector3(1, 1, 1));
    parts.push(piece(new THREE.CylinderGeometry(.012, .016, h, 3).translate(0, h / 2, 0), m, [.34, .4, .16]));
    parts.push(piece(new THREE.CylinderGeometry(.034, .034, .22, 5).translate(0, h + .08, 0), m, [.28, .16, .08]));
    parts.push(piece(new THREE.ConeGeometry(.012, .1, 3).translate(0, h + .24, 0), m, [.34, .3, .16]));
  }
  return BufferGeometryUtils.mergeBufferGeometries(parts);
}

function duckweedGeometry() { // an uneven mat: a ring of overlapping small flat blobs
  const parts = [], q = new THREE.Quaternion(), e = new THREE.Euler();
  let s = 57; const rnd = () => (s = (s * 9301 + 49297) % 233280) / 233280;
  for (let i = 0; i < 12; i++) { // small curled, torn leaves heaped and overlapping, at different heights and tilts, some bright and some dark, a few stems standing up
    const a = rnd() * 6.283, d = Math.sqrt(rnd()) * .6, r = .13 + rnd() * .2, tint = .8 + rnd() * .55;
    const g = padGeometry(40 + i).clone(); g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(Math.cos(a) * d, .005 + rnd() * .05, Math.sin(a) * d), q.setFromEuler(e.set((rnd() - .5) * .6, rnd() * 6.283, (rnd() - .5) * .6, 'YXZ')), new THREE.Vector3(r, 1.4 + rnd(), r * (.7 + rnd() * .4))));
    const c = g.attributes.color; for (let k = 0; k < c.count; k++) c.setXYZ(k, c.getX(k) * tint, c.getY(k) * tint * (.9 + rnd() * .2), c.getZ(k) * tint); g.computeVertexNormals();
    parts.push(g);
  }
  for (let i = 0; i < 6; i++) { const a = rnd() * 6.283, d = rnd() * .6, h = .06 + rnd() * .12; parts.push(piece(new THREE.ConeGeometry(.015, h, 3).translate(Math.cos(a) * d, h / 2, Math.sin(a) * d), new THREE.Matrix4(), [.3, .42, .14])); } // (tiny shoots)
  return BufferGeometryUtils.mergeBufferGeometries(parts);
}

// bounds: the swamp's extent; wet(x, z, margin): on the water, margin px in from its edge; avoid: [{ x, z, r }]; boxes: the tree trunks ({ x, z }) to keep clear of.
export function buildSwampPlants(scene, { bounds, wet, avoid = [], boxes = [], seed = 99 }) {
  let sd = seed; const rnd = () => (sd = (sd * 9301 + 49297) % 233280) / 233280;
  const free = (x, z, clear) => !avoid.some(a => Math.hypot(a.x - x, a.z - z) < a.r) && !boxes.some(b => Math.hypot(b.x - x, b.z - z) < clear);
  // Drifts of `per` items (at most) round centres jittered over a grid across the whole swamp (so no half of it is left bare), each cell having one with chance `prob`.
  const pick = (cell, prob, margin, clear, spread, per) => {
    const out = [];
    for (let gx = bounds.x0; gx < bounds.x1; gx += cell) for (let gz = bounds.z0; gz < bounds.z1; gz += cell) {
      if (rnd() > prob) continue;
      const cx = gx + rnd() * cell, cz = gz + rnd() * cell; if (!wet(cx, cz, margin)) continue;
      for (let i = 0, k = Math.ceil(per * (.5 + rnd() * .5)); i < k; i++) {
        const a = rnd() * 6.283, d = spread * Math.sqrt(rnd()), x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d;
        if (wet(x, z, margin) && free(x, z, clear)) out.push({ x, z });
      }
    }
    return out;
  };
  const pads = pick(6, .48, 7, 1.5, 2.2, 5).map((p, i) => ({ ...p, v: i % PAD_VARIANTS, s: .3 + rnd() * rnd() * .5, sz: .75 + rnd() * .4, y: rnd() * .03, tx: (rnd() - .5) * .22, tz: (rnd() - .5) * .22, yaw: rnd() * 6.283, c: .75 + rnd() * .5 })); // (small and large, long and short, tilted, at slightly different heights so the crowded ones overlap)
  const flowers = pads.filter(p => p.s > .45 && rnd() < .25).map(p => ({ ...p, y: p.y + .02 }));
  const mats = pick(7, .28, 7, 1.4, 2.5, 2).map(p => ({ ...p, s: .8 + rnd() * .7, sz: .8 + rnd() * .3, yaw: rnd() * 6.283, c: .8 + rnd() * .3, y: 0 })); // (a dark algae film)
  const reeds = pick(7, .28, 9, 2.2, 3, 3).map(p => ({ ...p, s: .8 + rnd() * .6, yaw: rnd() * 6.283, c: .8 + rnd() * .3 }));

  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, envMapIntensity: .1, flatShading: true, side: THREE.DoubleSide });
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), pos = new THREE.Vector3(), sc = new THREE.Vector3(), col = new THREE.Color();
  const eu = new THREE.Euler();
  const make = (name, geo, list, y, scale) => {
    if (!list.length) return;
    const im = new THREE.InstancedMesh(geo, mat, list.length); im.name = name;
    list.forEach((it, i) => {
      pos.set(it.x, y + (it.y ?? 0), it.z); m.compose(pos, q.setFromEuler(eu.set(it.tx ?? 0, it.yaw ?? 0, it.tz ?? 0, 'YXZ')), scale(it, sc)); im.setMatrixAt(i, m); im.setColorAt(i, col.setScalar(it.c ?? 1));
    });
    im.frustumCulled = false; im.castShadow = false; im.receiveShadow = false; im.userData.noWater = true; scene.add(im);
  };
  for (let v = 0; v < PAD_VARIANTS; v++) make('swampPads' + v, padGeometry(v), pads.filter(p => p.v === v), SURFACE, (it, s) => s.set(it.s, 1, it.s * it.sz));
  make('swampLotus', flowerGeometry(), flowers.map(f => ({ ...f, c: 1, tx: 0, tz: 0 })), SURFACE + .02, (it, v) => v.set(1.3, 1.3, 1.3));
  make('swampCattails', cattailGeometry(), reeds, 0, (it, v) => v.set(it.s, it.s, it.s));
}
