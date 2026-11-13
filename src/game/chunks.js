// Spatial chunking for the level's static scenery, so the renderer can skip what's off screen.
//
// Scatter is drawn as InstancedMeshes (jungle canopy, bushes, cacti, wall blocks, pool stones...),
// which three.js r128 never culls (an InstancedMesh starts with frustumCulled off, since its
// geometry's bounds know nothing of where the instances are). So every one of them
// was drawn whole in every pass (shadow map, water reflection, water refraction, main view) even
// though only a sliver of the stage is ever on screen. The ground and other big level meshes are
// one mesh each, so they're always drawn whole too.
//
// chunkStatic() splits both into blocks of CHUNK_X by CHUNK_Z metres (about a screen's width by a
// little under its height, a balance between culling well and not multiplying draw calls), each
// with bounds that cover just its own part, and turns culling on. Nothing about how they look changes: the pieces share the original
// geometry's vertex buffers and materials, and every instance keeps its matrix and colour.
// Call it once the level's static meshes are all in the scene, and only on meshes nothing else keeps
// a reference to (it replaces them).
import * as THREE from 'three';

const CHUNK_X = 40, CHUNK_Z = 28; // m: block size across / along the stage
const MIN_TRIANGLES = 2500; // plain meshes smaller than this are left whole

const MIN_CHUNK = 1500;    // triangles: a block with fewer is merged with its neighbours along its row (sparse scatter, the far margins)
const keyOf = (x, z) => Math.floor(x / CHUNK_X) + ',' + Math.floor(z / CHUNK_Z);

// Blocks -> lists of items, merging thin blocks with their neighbours in the same row until each
// holds at least MIN_CHUNK triangles (each item weighing `per`).
function groupCells(cells, per) {
  const rows = new Map();
  for (const [k, ids] of cells) { const [cx, cz] = k.split(',').map(Number); (rows.get(cz) ?? rows.set(cz, []).get(cz)).push([cx, ids]); }
  const out = [];
  for (const row of rows.values()) {
    row.sort((a, b) => a[0] - b[0]);
    let acc = [];
    for (const [, ids] of row) { acc = acc.concat(ids); if (acc.length * per >= MIN_CHUNK) { out.push(acc); acc = []; } }
    if (acc.length) out.push(acc);
  }
  return out;
}

// A geometry sharing src's vertex buffers (and morph/attribute setup), with its own index and bounds.
function view(src, index, sphere) {
  const g = new THREE.BufferGeometry();
  for (const k of Object.keys(src.attributes)) g.setAttribute(k, src.attributes[k]);
  if (index) g.setIndex(index);
  for (const gr of src.groups) g.addGroup(gr.start, gr.count, gr.materialIndex);
  g.boundingSphere = sphere;
  g.boundingBox = null;
  return g;
}

function copyLook(from, to) {
  to.castShadow = from.castShadow; to.receiveShadow = from.receiveShadow; to.renderOrder = from.renderOrder;
  to.customDepthMaterial = from.customDepthMaterial; to.customDistanceMaterial = from.customDistanceMaterial;
  to.layers.mask = from.layers.mask; to.visible = from.visible; to.userData = from.userData;
  to.position.copy(from.position); to.quaternion.copy(from.quaternion); to.scale.copy(from.scale);
}

// One stage-long InstancedMesh -> one per chunk, each culled by the instances it holds.
function splitInstanced(mesh) {
  const src = mesh.geometry; // (its own bounds from its vertices: the stored ones may have been widened to cover the instances)
  const own = new THREE.Box3().setFromBufferAttribute(src.attributes.position).getBoundingSphere(new THREE.Sphere()), r0 = own.radius, c0 = own.center;
  const m = new THREE.Matrix4(), p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3(), cells = new Map();
  for (let i = 0; i < mesh.count; i++) {
    mesh.getMatrixAt(i, m);
    p.copy(c0).applyMatrix4(m); // (in the mesh's own space)
    const k = keyOf(p.x, p.z); (cells.get(k) ?? cells.set(k, []).get(k)).push(i);
  }
  const groups = groupCells(cells, (src.index ? src.index.count : src.attributes.position.count) / 3); // (even one group: it gets real bounds, and culling)
  const out = [];
  for (const ids of groups) {
    const box = new THREE.Box3();
    for (const i of ids) {
      mesh.getMatrixAt(i, m); m.decompose(p, q, s);
      const r = r0 * Math.max(s.x, s.y, s.z), c = c0.clone().applyMatrix4(m);
      box.expandByPoint(c.clone().addScalar(r)); box.expandByPoint(c.clone().subScalar(r));
    }
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    const part = new THREE.InstancedMesh(view(src, src.index, sphere), mesh.material, ids.length);
    ids.forEach((i, j) => {
      mesh.getMatrixAt(i, m); part.setMatrixAt(j, m);
      if (mesh.instanceColor) { const col = new THREE.Color(); mesh.getColorAt(i, col); part.setColorAt(j, col); }
    });
    copyLook(mesh, part); part.frustumCulled = true;
    out.push(part);
  }
  return out;
}

// One big plain mesh -> one per chunk, each drawing the triangles whose centre falls in it.
function splitMesh(mesh) {
  const src = mesh.geometry, pos = src.attributes.position;
  if (src.groups.length > 1 || Array.isArray(mesh.material)) return null; // (multi-material: leave it)
  const idx = src.index ? src.index.array : null, nTri = (idx ? idx.length : pos.count) / 3;
  const at = k => idx ? idx[k] : k;
  mesh.updateMatrix();
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), cells = new Map();
  for (let t = 0; t < nTri; t++) {
    a.fromBufferAttribute(pos, at(t * 3)); b.fromBufferAttribute(pos, at(t * 3 + 1)); c.fromBufferAttribute(pos, at(t * 3 + 2));
    a.add(b).add(c).divideScalar(3).applyMatrix4(mesh.matrix); // centre, placed as the mesh is (it sits directly in the scene)
    const k = keyOf(a.x, a.z); (cells.get(k) ?? cells.set(k, []).get(k)).push(t);
  }
  const groups = groupCells(cells, 1);
  if (groups.length < 2) return null;
  const out = [], Index = pos.count > 65535 ? Uint32Array : Uint16Array;
  for (const tris of groups) {
    const ix = new Index(tris.length * 3), box = new THREE.Box3();
    tris.forEach((t, j) => { for (let v = 0; v < 3; v++) { const k = at(t * 3 + v); ix[j * 3 + v] = k; box.expandByPoint(a.fromBufferAttribute(pos, k)); } });
    const part = new THREE.Mesh(view(src, new THREE.BufferAttribute(ix, 1), box.getBoundingSphere(new THREE.Sphere())), mesh.material);
    copyLook(mesh, part); part.frustumCulled = true;
    out.push(part);
  }
  return out;
}

// Splits the given plain meshes (already scene children) into culled blocks like chunkStatic does for the level (used for the wreckage
// laid down when a saved game is loaded: one merged mesh spread over the whole stage would be drawn in full, in every pass, wherever the
// camera is).
export function chunkMeshes(scene, meshes, minTriangles = 1500) {
  for (const mesh of meshes) {
    const tris = (mesh.geometry.index ? mesh.geometry.index.count : mesh.geometry.attributes.position.count) / 3;
    if (!mesh.isMesh || mesh.isInstancedMesh || mesh.name || Array.isArray(mesh.material) || tris < minTriangles) continue;
    const parts = splitMesh(mesh); if (!parts) continue;
    scene.remove(mesh); parts.forEach(p => scene.add(p));
  }
}

export function chunkStatic(scene) {
  let before = 0, after = 0;
  for (const mesh of [...scene.children]) {
    if (!mesh.isMesh || mesh.name || mesh.material.isShaderMaterial) continue; // named / custom-shaded things may be looked up or animated
    const tris = (mesh.geometry.index ? mesh.geometry.index.count : mesh.geometry.attributes.position.count) / 3;
    let parts = null;
    if (mesh.isInstancedMesh) parts = splitInstanced(mesh);
    else if (tris >= MIN_TRIANGLES) parts = splitMesh(mesh);
    if (!parts) continue;
    scene.remove(mesh); parts.forEach(p => scene.add(p));
    before++; after += parts.length;
  }
  // The railway's sleepers, plates, rails and ballast are children of its group (which sits at the origin), a whole stage long: the same split, in place
  // ...and the same for any unnamed group sitting at the origin (what mergeStatic makes of scenery spread over the stage: its merged meshes had one stage-wide bound each)
  for (const group of scene.children) {
    const railway = group.name === 'railway', loose = group.isGroup && !group.name && group.position.lengthSq() === 0 && group.quaternion.w === 1 && group.scale.x === 1 && group.scale.y === 1 && group.scale.z === 1;
    if (!railway && !loose) continue;
    for (const mesh of [...group.children]) {
      if (!mesh.isMesh || mesh.material.isShaderMaterial || (!railway && mesh.name)) continue; // (named ones may be looked up or animated)
      const tris = (mesh.geometry.index ? mesh.geometry.index.count : mesh.geometry.attributes.position.count) / 3;
      const parts = mesh.isInstancedMesh ? splitInstanced(mesh) : tris >= MIN_TRIANGLES ? splitMesh(mesh) : null;
      if (!parts) continue;
      group.remove(mesh); parts.forEach(p => group.add(p));
      before++; after += parts.length;
    }
  }
  return { before, after };
}

// The instanced parts of models (a launcher's or carrier's track cleats, say): three.js r128 never culls an InstancedMesh unless asked, and these were drawn in every
// pass wherever their model stood, however far. Each gets bounds that cover its own instances (in the mesh's own space, so they follow the model as it moves) and culling on.
export function cullModelInstances(scene) {
  const m = new THREE.Matrix4(), p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
  scene.traverse(o => {
    if (!o.isInstancedMesh || o.parent === scene || o.frustumCulled || o.userData.fxBatch || o.userData.cullDone || !o.count || o.material.isShaderMaterial) return;
    const src = o.geometry, own = new THREE.Box3().setFromBufferAttribute(src.attributes.position).getBoundingSphere(new THREE.Sphere()), box = new THREE.Box3();
    for (let i = 0; i < o.count; i++) {
      o.getMatrixAt(i, m); m.decompose(p, q, s);
      const r = own.radius * Math.max(s.x, s.y, s.z), c = own.center.clone().applyMatrix4(m);
      box.expandByPoint(c.clone().addScalar(r)); box.expandByPoint(c.clone().subScalar(r));
    }
    const pad = box.getBoundingSphere(new THREE.Sphere()); pad.radius += .3; // (a little to spare: a track's cleats move along their loop)
    o.geometry = view(src, src.index, pad); o.frustumCulled = true; o.userData.cullDone = true;
  });
}
