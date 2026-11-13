// Draw-call reduction: bake a prop's static meshes into one mesh per material.
//
// Every separate mesh costs a draw call in each render pass (reflection, refraction, main, shadow),
// and procedural props are built from many small pieces (a palm is ~20). Merging them changes
// nothing visually. Anything with a name (a moving part such as `turret`, `doorL`, `star`, or a
// marker like `muzzle`) is left as is, and its own static children are merged separately, so the
// asset contract still works on the result.
import * as THREE from 'three';
import { BufferGeometryUtils } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const ATTRS = ['position', 'normal', 'uv', 'color', 'rpos', 'rnor']; // (color: vertex colours, kept so pieces of one shared material can still have their own colours) // (rpos / rnor: a part's position and normal in its model's own space, for shaders that paint or dirty by where on the model a point is: the flame tank)

// A multi-material mesh as one piece per face group: [[material, geometry], ...] (null if it has no groups).
function splitGroups(mesh) {
  const src = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry;
  if (!src.groups.length) return null;
  return src.groups.map(gr => {
    const g = new THREE.BufferGeometry();
    for (const name of ATTRS) { const a = src.attributes[name]; if (a) g.setAttribute(name, new THREE.BufferAttribute(a.array.slice(gr.start * a.itemSize, (gr.start + gr.count) * a.itemSize), a.itemSize)); }
    return [mesh.material[gr.materialIndex], g];
  });
}

function prepare(mesh, toRoot, geometry = mesh.geometry) {
  let g = geometry.index ? geometry.toNonIndexed() : geometry.clone();
  for (const name of Object.keys(g.attributes)) if (!ATTRS.includes(name)) g.deleteAttribute(name);
  if (!g.attributes.normal) g.computeVertexNormals();
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  g.clearGroups();
  return g.applyMatrix4(toRoot);
}

// A mesh's geometry carried into the world (non-indexed, with position, normal and uv), ready to join others.
export function worldGeometry(mesh) { mesh.updateWorldMatrix(true, false); return prepare(mesh, mesh.matrixWorld); }

// Merge plain geometries into one (keeps position / normal / uv).
export function mergeGeometries(geos) {
  return BufferGeometryUtils.mergeBufferGeometries(geos.map(g => { const n = g.index ? g.toNonIndexed() : g; for (const k of Object.keys(n.attributes)) if (!ATTRS.includes(k)) n.deleteAttribute(k); return n; }));
}

// A multi-material mesh's faces regrouped so each material is drawn once (3 faces of one material = 1 call, not 3).
export function regroup(mesh) {
  const g = mesh.geometry; if (!g.index || g.groups.length < 2) return;
  const byMat = new Map(), idx = g.index.array, out = [], g2 = g.clone();
  for (const gr of g.groups) { const m = mesh.material[gr.materialIndex]; (byMat.get(m) ?? byMat.set(m, []).get(m)).push(gr); }
  if (byMat.size === g.groups.length) return;
  g2.clearGroups();
  const mats = [...byMat.keys()];
  mats.forEach((m, mi) => { const start = out.length; for (const gr of byMat.get(m)) for (let k = 0; k < gr.count; k++) out.push(idx[gr.start + k]); g2.addGroup(start, out.length - start, mi); });
  g2.setIndex(out); mesh.geometry = g2; mesh.material = mats;
}

// Draw calls in the shadow pass: every small piece (bolts, hands, boots, lights, links, under `size` m across) is lost in its model's
// own shadow, so it stops casting one. Call it once the model is scaled and in place; nothing else about the pieces changes.
export function dropTinyShadows(root, size = .3) {
  const b = new THREE.Box3(), v = new THREE.Vector3();
  root.updateMatrixWorld(true);
  root.traverse(m => { if (m.isMesh && m.castShadow && b.setFromObject(m).getSize(v).length() < size) m.castShadow = false; });
  return root;
}

// Draw calls in the shadow pass, for a small model of several materials (a missile): only its biggest piece casts a shadow, which is all
// its shadow shows. Call it after mergeStatic, so there are only a few pieces.
export function oneShadow(root) {
  let best = null, bestN = -1; const meshes = [];
  root.traverse(m => { if (!m.isMesh) return; meshes.push(m); const n = m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count; if (n > bestN) { best = m; bestN = n; } });
  for (const m of meshes) m.castShadow = m === best && m.castShadow;
  return root;
}

// Draw calls in the shadow pass, for a big model made of many pieces (a ship): all its static, shadow-casting pieces (not those inside a
// named, moving part; `through` names the groups that don't count as such) are baked into ONE single-material mesh that casts the shadow
// instead, on `layer` (a layer only the shadow pass's camera sees), and they stop casting their own. The twin is a child of `root`, so it moves with it.
export function shadowTwin(root, layer, through = []) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert(), meshes = [], geos = [];
  root.traverse(m => {
    if (!m.isMesh || !m.castShadow || m.isInstancedMesh) return;
    for (let p = m.parent; p && p !== root; p = p.parent) if (p.name && !through.includes(p.name)) return; // (inside a moving, named part: it keeps its own shadow)
    const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
    for (const k of Object.keys(g.attributes)) if (k !== 'position') g.deleteAttribute(k);
    g.clearGroups(); g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld));
    meshes.push(m); geos.push(g);
  });
  const merged = geos.length > 1 && BufferGeometryUtils.mergeBufferGeometries(geos);
  if (!merged) return null;
  for (const m of meshes) m.castShadow = false;
  const twin = new THREE.Mesh(merged, new THREE.MeshBasicMaterial({ shadowSide: THREE.FrontSide }));
  twin.castShadow = true; twin.layers.set(layer); twin.frustumCulled = false; root.add(twin);
  return twin;
}

// A model built once, merged (mergeStatic) and checked, then copied for every use: far fewer draw calls per copy. The copies share the
// merged geometry and materials, so use it only for models nothing re-tints or edits per copy (their named parts still move on their
// own). The merge is checked against the plain model: if it comes out empty or a different size, the plain model is used and a warning
// logged. label: what to call it in that warning (and the key it's cached under).
const modelTemplates = new Map();
export function mergedModel(label, build) {
  let t = modelTemplates.get(label);
  if (!t) {
    const plain = build(), probe = plain.clone(true), want = new THREE.Box3().setFromObject(plain).getSize(new THREE.Vector3());
    t = plain;
    try {
      mergeStatic(probe);
      const got = new THREE.Box3().setFromObject(probe).getSize(new THREE.Vector3()), tol = Math.max(want.x, want.y, want.z) * .02 + .01;
      let meshes = 0; probe.traverse(m => { if (m.isMesh) meshes++; });
      if (meshes && Math.abs(want.x - got.x) < tol && Math.abs(want.y - got.y) < tol && Math.abs(want.z - got.z) < tol) t = probe;
      else console.warn(label + ' merge rejected: size before', want.toArray(), 'after', got.toArray(), 'meshes', meshes);
    } catch (e) { console.warn(label + ' merge failed:', e); }
    modelTemplates.set(label, t);
  }
  return t.clone(true);
}

export function mergeStatic(root) {
  if (root.isMesh && Array.isArray(root.material)) regroup(root); // (a prop that is one multi-material box)
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const buckets = new Map(); // material -> { geos, meshes, castShadow, receiveShadow }
  const named = [];
  // collect unnamed meshes under root, stopping at named nodes
  (function walk(node) {
    for (const child of node.children) {
      if (child.name) { named.push(child); continue; }
      if (child.isMesh && !child.isInstancedMesh) {
        const pieces = Array.isArray(child.material) ? splitGroups(child) : [[child.material, child.geometry]];
        if (pieces) {
          const toRoot = new THREE.Matrix4().multiplyMatrices(inv, child.matrixWorld);
          for (const [material, geo] of pieces) {
            const b = buckets.get(material) ?? { geos: [], meshes: new Set(), castShadow: false, receiveShadow: false, depth: child.customDepthMaterial, split: false };
            b.geos.push(prepare(child, toRoot, geo));
            b.meshes.add(child); b.split ||= pieces.length > 1 || Array.isArray(child.material);
            b.castShadow ||= child.castShadow; b.receiveShadow ||= child.receiveShadow;
            buckets.set(material, b);
          }
        }
      }
      walk(child);
    }
  })(root);

  for (const [material, b] of buckets) {
    if (b.geos.length < 2 && !b.split) continue; // nothing to gain (a piece of a multi-material mesh always goes: its mesh is removed)
    const merged = BufferGeometryUtils.mergeBufferGeometries(b.geos);
    if (!merged) continue;
    for (const m of b.meshes) {
      m.parent?.remove(m);
      // keep any grouping nodes' other children; meshes' own children (rare) move up to root
      for (const c of [...m.children]) root.attach(c);
    }
    const mesh = new THREE.Mesh(merged, material);
    mesh.castShadow = b.castShadow; mesh.receiveShadow = b.receiveShadow;
    if (b.depth) mesh.customDepthMaterial = b.depth;
    root.add(mesh);
  }
  for (const n of named) mergeStatic(n);
  return root;
}

// Merge the meshes under `roots` that share a material into one mesh per material (and per shadow setting), baked into the space of `frame` and added to it; a node `skip` accepts is left alone with everything under it
// (the moving parts, the named things the game looks up). Unlike mergeStatic this goes across named parts and across several objects, so the many guns of one kind, or the many parts of a power station, make a few draw calls in all.
export function mergeAcross(roots, frame, { skip = () => false, okMaterial = () => true } = {}) {
  frame.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(frame.matrixWorld).invert(), buckets = new Map();
  for (const root of roots) {
    root.updateMatrixWorld(true);
    (function walk(node) {
      for (const c of node.children) {
        if (skip(c) || !c.visible) continue; // (a hidden part stays hidden: it is not merged in)
        if (c.isMesh && !c.isInstancedMesh && !Array.isArray(c.material) && c.geometry?.attributes?.position && okMaterial(c.material)) {
          const key = c.material.uuid + (c.castShadow ? 'c' : 'n') + (c.receiveShadow ? 'r' : 'n') + c.layers.mask, b = buckets.get(key) ?? buckets.set(key, { material: c.material, meshes: [], geos: [], cast: c.castShadow, recv: c.receiveShadow, mask: c.layers.mask }).get(key);
          b.meshes.push(c); b.geos.push(prepare(c, new THREE.Matrix4().multiplyMatrices(inv, c.matrixWorld)));
        }
        walk(c);
      }
    })(root);
  }
  let made = 0;
  for (const b of buckets.values()) {
    if (b.geos.length < 2) continue;
    const merged = BufferGeometryUtils.mergeBufferGeometries(b.geos); if (!merged) continue;
    for (const m of b.meshes) { m.parent?.remove(m); }
    const mesh = new THREE.Mesh(merged, b.material); mesh.castShadow = b.cast; mesh.receiveShadow = b.recv; mesh.layers.mask = b.mask; frame.add(mesh); made++;
  }
  return made;
}

// ---- Skinning the game's own moving parts -----------------------------------------------------------------------------------------------
// A soldier or a drone is a tree of named groups (legL, kneeL, armR, ...) that the game turns every frame, each holding a few meshes: a dozen or more draw calls
// a figure. skinify() makes those very groups the BONES of one SkinnedMesh per material: every vertex follows the group its mesh sat in, so the game keeps turning
// the same groups exactly as before and the figure is drawn in a handful of calls. Meshes that are transparent, multi-material or hidden are left as they were.
// Call it on a template at rest, at the origin; copies are made with root.clone(true), then rebindSkins(copy) gives each its own skeleton.
export function skinify(root, boneNames) {
  root.updateMatrixWorld(true);
  const bones = [root, ...boneNames.map(n => root.getObjectByName(n)).filter(Boolean)], idxOf = new Map(bones.map((b, i) => [b, i]));
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert(), buckets = new Map(), shown = n => { for (let q = n; q; q = q.parent) { if (!q.visible) return false; if (q === root) break; } return true; };
  const uses = new Map(); root.traverse(c => { if (c.isMesh && !Array.isArray(c.material)) uses.set(c.material, (uses.get(c.material) ?? 0) + 1); }); // (a transparent material shared by several meshes, such as a drone's blades, is skinned too: one used by a single mesh, with its own fade, is left as it is)
  root.traverse(c => {
    if (!c.isMesh || c.isSkinnedMesh || c.isInstancedMesh || Array.isArray(c.material) || c.material.userData?.snowBase || (c.material.transparent && uses.get(c.material) < 2) || !c.geometry?.attributes?.position || !shown(c)) return;
    let bone = 0; for (let q = c; q && q !== root; q = q.parent) if (idxOf.has(q)) { bone = idxOf.get(q); break; }
    const geo = prepare(c, new THREE.Matrix4().multiplyMatrices(inv, c.matrixWorld)), n = geo.attributes.position.count, si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) { si[i * 4] = bone; sw[i * 4] = 1; }
    geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4)); geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
    const key = c.material.uuid + c.layers.mask, b = buckets.get(key) ?? buckets.set(key, { material: c.material, meshes: [], geos: [], cast: false, recv: false, mask: c.layers.mask }).get(key);
    b.meshes.push(c); b.geos.push(geo); b.cast ||= c.castShadow; b.recv ||= c.receiveShadow;
  });
  const inverses = bones.map(b => new THREE.Matrix4().multiplyMatrices(inv, b.matrixWorld).invert()), names = bones.map((b, i) => i ? b.name : '');
  let made = 0;
  for (const b of buckets.values()) {
    const merged = BufferGeometryUtils.mergeBufferGeometries(b.geos); if (!merged) continue;
    merged.userData.boneNames = names; merged.userData.boneInverses = inverses; // (on the geometry: it is shared by every copy, while a copy's userData is JSON-cloned)
    b.material.skinning = true;
    for (const m of b.meshes) m.parent?.remove(m);
    const mesh = new THREE.SkinnedMesh(merged, b.material); mesh.castShadow = b.cast; mesh.receiveShadow = b.recv; mesh.layers.mask = b.mask; merged.computeBoundingSphere(); merged.boundingSphere.radius = merged.boundingSphere.radius * 1.3 + .6; /* (the bounds are those of the bind pose: padded to take in the limbs, arms and barrel as they move, so the mesh can be skipped when it is off screen) */
    root.add(mesh); mesh.updateMatrixWorld(true); mesh.bind(new THREE.Skeleton(bones, inverses.map(m => m.clone())), new THREE.Matrix4()); made++;
  }
  return made;
}

// A copy of a skinified template shares the template's skeleton; this gives it one of its own, over its own copies of the groups.
export function rebindSkins(obj) {
  obj.traverse(c => {
    if (!c.isSkinnedMesh) return;
    const ud = c.geometry.userData, bones = ud.boneNames.map((n, i) => i ? obj.getObjectByName(n) : obj);
    c.bind(new THREE.Skeleton(bones, ud.boneInverses.map(m => m.clone())), new THREE.Matrix4());
  });
}

// A skinned figure that has come to rest is turned back into plain static meshes in the pose it lies in (each vertex follows one bone: its position and normal are carried by that bone's change since the bind).
export function freezeSkin(root) {
  root.updateMatrixWorld(true);
  const list = []; root.traverse(c => { if (c.isSkinnedMesh) list.push(c); });
  const m4 = new THREE.Matrix4(), n3 = new THREE.Matrix3(), v = new THREE.Vector3();
  for (const sm of list) {
    const g = sm.geometry.clone(), pos = g.attributes.position, nor = g.attributes.normal, si = g.attributes.skinIndex, sk = sm.skeleton, mats = sk.bones.map((b, i) => new THREE.Matrix4().multiplyMatrices(sm.matrixWorld.clone().invert(), b.matrixWorld).multiply(sk.boneInverses[i]).multiply(sm.bindMatrix));
    // (bone matrices relative to the mesh: bindMatrixInverse * boneWorld * boneInverse * bindMatrix, with the mesh's own world matrix taken out)
    const norms = mats.map(m => new THREE.Matrix3().getNormalMatrix(m));
    for (let i = 0; i < pos.count; i++) {
      const bi = si.getX(i); v.fromBufferAttribute(pos, i).applyMatrix4(mats[bi]); pos.setXYZ(i, v.x, v.y, v.z);
      if (nor) { v.fromBufferAttribute(nor, i).applyMatrix3(norms[bi]).normalize(); nor.setXYZ(i, v.x, v.y, v.z); }
    }
    g.deleteAttribute('skinIndex'); g.deleteAttribute('skinWeight'); g.computeBoundingSphere();
    const m = new THREE.Mesh(g, sm.material); m.castShadow = sm.castShadow; m.receiveShadow = sm.receiveShadow; m.layers.mask = sm.layers.mask; m.userData = sm.userData; m.position.copy(sm.position); m.quaternion.copy(sm.quaternion); m.scale.copy(sm.scale);
    sm.parent.add(m); sm.parent.remove(sm);
  }
  return list.length;
}
