// Stage 5's woods along the edges ('F' cells): the Texas hill country's scrub rather than a jungle: live oaks and mesquites with round, low canopies, dark cedars (junipers), shrubs
// and bushes, dry-grass tufts and a few pale stones between them. All low-poly, flat-shaded, baked into 20 m blocks (one mesh per block and kind, each with tight bounds: the blocks
// off screen are skipped). Nothing leans out over the open ground: a tree stands only where a ring round it is scrub too, the bushes nearer the edge.
import * as THREE from 'three';
import { noise2, rng, smooth } from './cliffs.js';
import { buildBush } from '../assets/bush.js';

const BLOCK = 20;
// The bushes are the real bush assets (bush.js: leaf sprays on branches, six variants), a thinned-out selection of them in place of the old blobs: ~700 triangles each, so there are
// far fewer of them than there were blobs, and each stands clear of the next (BUSH_GAP). ?grassoff=oldbush brings the old blob bushes back.
const SHADOW_MARGIN = 10, _inv = new THREE.Matrix4(); // m: how far past the screen a bush can stand and still throw a shadow into it (a pine's shadow is some 5 m long at this sun, plus a little for the camera's motion)
const BUSH_KEEP = 1, BUSH_GAP = 2.0, BUSH_SCALE = [.85, 1.25], BUSH_MODELS = 2, BUSH_BLOCK = 20, BUSH_EDGE = -8, BUSH_SHADOW_REACH = 5, BUSH_FROM = -Infinity; // BUSH_EDGE: none this close (m) to the map's left and right edges (negative: that far past them); BUSH_SHADOW_REACH: the bushes within this many metres of open ground cast shadows, the ones deeper in the woods do not; // BUSH_FROM: the bushes grow only where z > this (the whole map now; the opening stretch alone was -28) // (fewer, bigger bushes cover the same ground for far fewer triangles; big blocks keep the draw calls few)
const BUSH_PICK = [['leafy', 4], ['juniper', 1.4], ['flowering', .35], ['fern', .5], ['willow', .35]]; // (the green ones; the dry ones are the 'scrub' brush)

// A rock-like blob: an icosahedron with every corner pushed in or out (the same way wherever it appears), flat-shaded.
function blob(rand, detail, spread) {
  const g = new THREE.IcosahedronGeometry(1, detail), p = g.attributes.position, seen = new Map(), key = i => [p.getX(i), p.getY(i), p.getZ(i)].map(n => n.toFixed(3)).join();
  for (let i = 0; i < p.count; i++) { const k = key(i); if (!seen.has(k)) seen.set(k, 1 - spread + rand() * spread * 2); const s = seen.get(k); p.setXYZ(i, p.getX(i) * s, p.getY(i) * s, p.getZ(i) * s); }
  g.computeVertexNormals(); return g;
}

// area: { x0, x1, z0, z1 } (m); isScrub(x, z); heightAt(x, z). Returns { count }.
export function buildScrub(scene, { area, isScrub, heightAt, off = '', clear = [] }) { // clear: [{ x, z, r }]: no bush within r metres (round the camouflaged guns)
  if (off.split(',').includes('scrub')) return { count: 0 };
  const rand = rng(515), nPatch = noise2(321), nTone = noise2(333);
  const ring = (r, n = 8) => Array.from({ length: n }, (_, i) => [Math.cos(i / n * 6.283) * r, Math.sin(i / n * 6.283) * r]);
  const R_TREE = ring(2.0), R_BUSH = ring(.9, 6), R_EDGE = ring(.45, 4);
  const inside = (x, z, rg) => isScrub(x, z) && rg.every(([dx, dz]) => isScrub(x + dx, z + dz));
  const blobs = [0, 1, 2, 3].map(() => blob(rand, 1, .22)), bushBlobs = [0, 1, 2].map(() => blob(rand, 0, .3));
  const trunkG = new THREE.CylinderGeometry(.09, .17, 1, 6, 1).translate(0, .5, 0), coneG = new THREE.ConeGeometry(1, 1, 7, 1).translate(0, .5, 0);
  const blocks = new Map(), m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), pv = new THREE.Vector3(), sc = new THREE.Vector3(), v = new THREE.Vector3(), nm = new THREE.Matrix3();
  const bucket = (x, z, kind) => { const key = Math.floor((x - area.x0) / BLOCK) + ',' + Math.floor((z - area.z0) / BLOCK), b = blocks.get(key) ?? blocks.set(key, {}).get(key); return b[kind] ?? (b[kind] = { pos: [], nor: [], col: [] }); };
  const put = (dst, geo, x, y, z, sx, sy, sz, rgb, yaw = rand() * 6.283, tilt = 0) => { // one copy of geo, scaled, turned and set at (x, y, z), its flat colour rgb
    m.compose(pv.set(x, y, z), q.setFromEuler(e.set((rand() - .5) * tilt, yaw, (rand() - .5) * tilt)), sc.set(sx, sy, sz)); nm.getNormalMatrix(m);
    const pa = geo.attributes.position, na = geo.attributes.normal, idx = geo.index, n = idx ? idx.count : pa.count;
    for (let i = 0; i < n; i++) { const j = idx ? idx.getX(i) : i; v.fromBufferAttribute(pa, j).applyMatrix4(m); dst.pos.push(v.x, v.y, v.z); v.fromBufferAttribute(na, j).applyMatrix3(nm).normalize(); dst.nor.push(v.x, v.y, v.z); dst.col.push(rgb[0], rgb[1], rgb[2]); }
  };
  const tone = (base, k) => [base[0] * k * (.95 + rand() * .1), base[1] * k * (.95 + rand() * .1), base[2] * k * (.95 + rand() * .1)];
  const OAK = [.27, .34, .15], MESQ = [.36, .42, .2], CEDAR = [.12, .24, .14], BUSH = [.3, .36, .16], DRY = [.5, .44, .22], BARK = [.2, .14, .09];
  let trees = 0, bushes = 0;
  const TREES = off.split(',').includes('trees');
  const BUSH_MODE = off.split(',').includes('nobush') ? undefined : off.split(',').includes('oldbush') ? 'oldbush' : 'bushes', bushSpots = [], bushGrid = new Map(); // (the bush.js assets; ?grassoff=nobush for none, =oldbush for the old blobs)
  const wantBush = (x, z, y, dry, size) => { // one of the real bushes here, if this spot is kept and clear of the others (true: the old blob bush is not needed)
    if (BUSH_MODE === 'oldbush') return false;
    if (clear.some(c => Math.hypot(c.x - x, c.z - z) < c.r)) return true;
    if (!BUSH_MODE || z < BUSH_FROM || x > area.x1 - 14 - BUSH_EDGE || x < area.x0 + 14 + BUSH_EDGE) return true; // (none, or not in the opening stretch)
    const gx = Math.floor(x / BUSH_GAP), gz = Math.floor(z / BUSH_GAP);
    if (rand() > BUSH_KEEP) return true;
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (const q of bushGrid.get((gx + i) + ',' + (gz + j)) ?? []) if (Math.hypot(q[0] - x, q[1] - z) < BUSH_GAP) return true; // (the real distance, not just the neighbouring cells)
    (bushGrid.get(gx + ',' + gz) ?? bushGrid.set(gx + ',' + gz, []).get(gx + ',' + gz)).push([x, z]);
    let variant = 'scrub'; if (dry && rand() < 2 / 3) variant = rand() < .5 ? 'fern' : 'juniper'; // (two in three of the yellow dry brush are a fern or a pine instead)
    if (!dry) { let u = rand() * BUSH_PICK.reduce((a, p) => a + p[1], 0); for (const [name, w] of BUSH_PICK) { variant = name; if ((u -= w) <= 0) break; } }
    const outer = ring(BUSH_SHADOW_REACH, 8).some(([dx, dz]) => !isScrub(x + dx, z + dz)); // (the woods' outer layer: next to the ground the jeep can drive on)
    bushSpots.push({ outer, x, y, z, variant, model: Math.floor(rand() * BUSH_MODELS), s: (BUSH_SCALE[0] + (BUSH_SCALE[1] - BUSH_SCALE[0]) * rand() * size) * (variant === 'flowering' ? .7 : 1), yaw: rand() * 6.283 }); bushes++;
    return true;
  };
  const STEP = 1.55;
  for (let z = area.z0; z < area.z1; z += STEP) for (let x = area.x0; x < area.x1; x += STEP) {
    const px = x + rand() * STEP, pz = z + rand() * STEP;
    if (!isScrub(px, pz)) continue;
    const patch = smooth(.3, .6, nPatch(px * .05, pz * .05)), y = heightAt(px, pz);
    if (TREES && inside(px, pz, R_TREE) && rand() < .2 + .22 * patch) { // a tree: live oak, mesquite or cedar (switched off: the woods are bushes now; ?grassoff=trees brings them back)
      const kind = rand(), k = .8 + nTone(px * .2, pz * .2) * .4, b = bucket(px, pz, 'tree'); trees++;
      if (kind < .45) { // live oak: a short trunk, a round dark canopy of three or four blobs
        const h = 1.1 + rand() * .7, r = 1.25 + rand() * .7;
        put(b, trunkG, px, y - .05, pz, 1, h + .5, 1, BARK, 0, .15);
        for (let i = 0, n = 3 + (rand() < .5 ? 1 : 0); i < n; i++) { const a = i / n * 6.283 + rand(), o = i ? r * .5 : 0; put(b, blobs[i % 4], px + Math.cos(a) * o, y + h + r * .55 + (i ? rand() * .3 : .35), pz + Math.sin(a) * o, r * (.8 + rand() * .3), r * .72, r * (.8 + rand() * .3), tone(OAK, k)); }
      } else if (kind < .72) { // mesquite: a wide flat-topped crown on a bent trunk
        const h = 1.4 + rand() * .8, r = 1.7 + rand() * .8;
        put(b, trunkG, px, y - .05, pz, 1.2, h + .4, 1.2, BARK, 0, .5);
        for (let i = 0; i < 3; i++) { const a = rand() * 6.283, o = r * .45 * (i ? 1 : 0); put(b, blobs[i], px + Math.cos(a) * o, y + h + .4 + rand() * .3, pz + Math.sin(a) * o, r * (.75 + rand() * .3), r * .38, r * (.75 + rand() * .3), tone(MESQ, k)); }
      } else { // cedar: a dark cone
        const h = 3 + rand() * 2.2, r = .85 + rand() * .45;
        put(b, trunkG, px, y - .05, pz, .8, .6, .8, BARK, 0, .1);
        put(b, coneG, px, y + .45, pz, r, h, r, tone(CEDAR, k)); put(b, coneG, px, y + .45 + h * .35, pz, r * .72, h * .7, r * .72, tone(CEDAR, k * 1.08));
      }
    } else if (inside(px, pz, R_BUSH) && rand() < (BUSH_MODE === 'bushes' ? .95 : .42 + .2 * patch)) { // a bush, a clump of two blobs, green or dry
      const k = .75 + nTone(px * .3 + 9, pz * .3) * .5, r = .45 + rand() * .55, dry = rand() < .3, col = dry ? DRY : BUSH;
      if (wantBush(px, pz, y, dry, 1 + patch * .3)) continue;
      const b = bucket(px, pz, 'bush'); bushes++;
      put(b, bushBlobs[Math.floor(rand() * 3)], px, y + r * .35, pz, r, r * .7, r, tone(col, k));
      if (rand() < .6) put(b, bushBlobs[Math.floor(rand() * 3)], px + (rand() - .5) * r * 1.4, y + r * .3, pz + (rand() - .5) * r * 1.4, r * .75, r * .55, r * .75, tone(col, k * .95));
    } else if (inside(px, pz, R_EDGE) && rand() < (BUSH_MODE === 'bushes' ? .7 : .3)) { // at the edge: a low shrub, so the wood's border is ragged
      if (wantBush(px, pz, y, rand() < .4, .8)) continue;
      const r = .3 + rand() * .35; bushes++; put(bucket(px, pz, 'bush'), bushBlobs[Math.floor(rand() * 3)], px, y + r * .3, pz, r, r * .6, r, tone(rand() < .4 ? DRY : BUSH, .8 + rand() * .4));
    }
  }
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true, envMapIntensity: .12 });
  for (const b of blocks.values()) for (const [kind, d] of Object.entries(b)) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(d.pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(d.nor, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(d.col, 3));
    g.computeBoundingSphere();
    const mesh = new THREE.Mesh(g, mat); mesh.name = 'grass'; mesh.userData.noWater = true; mesh.castShadow = kind === 'tree'; mesh.receiveShadow = true; scene.add(mesh); // (named like the grass: chunks.js leaves it be)
  }
  // the real bushes: per 20 m block and per model, one instanced mesh for the foliage and one for the wood; the bounds are the block's (three r128 culls an instanced mesh by its geometry's bounds alone)
  let bushTris = 0;
  if (bushSpots.length) {
    const models = new Map(), groups = new Map(), mm = new THREE.Matrix4(), qq = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
    for (const s of bushSpots) {
      const key = `${Math.floor((s.x - area.x0) / BUSH_BLOCK)},${Math.floor((s.z - area.z0) / BUSH_BLOCK)}|${s.variant}|${s.model}|${s.outer ? 1 : 0}`, g = groups.get(key) ?? groups.set(key, { s: [], variant: s.variant, model: s.model, outer: s.outer }).get(key); g.s.push(s);
    }
    for (const g of groups.values()) {
      const mk = `${g.variant}${g.model}`, model = models.get(mk) ?? models.set(mk, buildBush(g.variant, 515 + g.model * 31 + g.variant.length * 7)).get(mk);
      const cx = g.s.reduce((a, s) => a + s.x, 0) / g.s.length, cy = g.s.reduce((a, s) => a + s.y, 0) / g.s.length, cz = g.s.reduce((a, s) => a + s.z, 0) / g.s.length, rad = Math.max(...g.s.map(s => Math.hypot(s.x - cx, s.z - cz))) + 2;
      for (const src of model.children) {
        const geo = new THREE.BufferGeometry(); geo.index = src.geometry.index; geo.attributes = src.geometry.attributes; // (the same buffers, with bounds of its own)
        geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(cx, cy + 1.5, cz), rad + 2.5); // (a bush is some 2.6 m wide at the most and 4 m tall: a tight sphere, so a block is drawn only when a bush in it can really be seen)
        const im = new THREE.InstancedMesh(geo, src.material, g.s.length); im.name = 'grass'; im.userData.noWater = true; im.userData.bush = true; im.castShadow = true; im.receiveShadow = true; im.frustumCulled = true; if (src.customDepthMaterial) im.customDepthMaterial = src.customDepthMaterial; // (every bush casts a shadow, with the leaves' cut-out outline) // (three r128 starts an InstancedMesh with culling off; the bounds above are the block's)
        g.s.forEach((s, i) => { mm.compose(new THREE.Vector3(s.x, s.y, s.z), qq.setFromAxisAngle(up, s.yaw), new THREE.Vector3(s.s, s.s * (.9 + (i % 5) * .05), s.s)); im.setMatrixAt(i, mm); });
        im.instanceMatrix.needsUpdate = true; scene.add(im); bushTris += (src.geometry.index.count / 3) * g.s.length;
      }
    }
  }
  console.log(`scrub: ${trees} trees, ${bushes} bushes` + (bushSpots.length ? ` (${bushSpots.length} real bush assets, ${(bushTris / 1000).toFixed(0)}k triangles in all)` : ''));
  // The bushes that cast shadows: only those whose shadow could fall into the view. A bush beyond the screen's edge by more than its shadow's length takes no part in
  // the shadow pass (the main pass already skips it, being out of the camera's frustum): the shadow box reaches well past the screen, and every block in it was drawn.
  const ims = []; scene.traverse(o => { if (o.userData.bush && o.geometry.boundingSphere) ims.push(o); });
  const frustum = new THREE.Frustum(), projView = new THREE.Matrix4(), sph = new THREE.Sphere(); let tick = 0;
  const cull = camera => {
    if (tick++ % 4) return; // (the camera moves a little each frame; a few frames' lag is covered by SHADOW_MARGIN)
    camera.updateMatrixWorld(); projView.multiplyMatrices(camera.projectionMatrix, _inv.copy(camera.matrixWorld).invert()); frustum.setFromProjectionMatrix(projView);
    for (const im of ims) { sph.copy(im.geometry.boundingSphere); sph.radius += SHADOW_MARGIN; im.castShadow = frustum.intersectsSphere(sph); }
  };
  return { count: trees + bushes, cull };
}
