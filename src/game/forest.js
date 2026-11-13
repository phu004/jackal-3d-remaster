// Groves of pine trees (assets/pine.js), scattered over round areas. A few models of each kind are built once and every tree in the grove is an instance of one of them (the foliage and the wood
// each a handful of draw calls however many trees there are), with its own size, turn and lean. Trees keep clear of what `avoid(x, z)` says to avoid (roads, the landing spot, the water's edge...)
// and of one another, and each stands on the ground's height under it. The trunks block the jeep (a small box each).
import * as THREE from 'three';
import { buildPine } from '../assets/pine.js';

const MIX = [['spruce', .42], ['fir', .3], ['young', .16], ['scots', .12]]; // the share of each kind
const MODELS = 3; // distinct trees built per kind
const BLOCK = 12; // m: the trees are grouped in blocks this big; a block is drawn only when it is in view

// areas: [{ x, z, r, count, seed }] (a round grove) or [{ rect: [x0, x1, z0, z1], count, seed, spacing }] (a belt of trees, e.g. along a boundary), in world metres. The trees are grouped in blocks 12 m square and a
// block is only drawn when it is in view of the camera (cull(camera)), so a long belt costs only the part of it that can be seen. Returns { group, boxes (the trunks), count, cull }.
export function buildForests(scene, areas, { heightAt, avoid = () => false, spacing = 3.6, range = 78, noScots = false, snowBoost = 0 } = {}) { // snowBoost: more snow on every tree (the secret level's)
  const pool = {}; for (const [k] of MIX) pool[k] = Array.from({ length: MODELS }, (_, i) => ({ tree: buildPine(k, 11 + i * 37 + k.length, { snow: Math.min(1, .45 + .15 * i + snowBoost), lod: true }), chunks: {}, trees: [] }));
  for (const k of ['spruce', 'fir']) pool[k].push({ tree: buildPine(k, 97 + k.length, { snow: Math.min(1, .6 + snowBoost), lod: true, lift: k === 'spruce' ? 2.2 : 2.6 }), chunks: {}, trees: [] }); // (one lifted model each, for the trees in thick stands)
  const boxes = [], placed = [];
  for (const a of areas) {
    let st = ((a.seed ?? 1) * 7919 + 13) % 2147483647 || 1; const rnd = () => (st = (st * 16807) % 2147483647) / 2147483647;
    let made = 0;
    for (let tries = 0; made < a.count && tries < a.count * 60; tries++) {
      let x, z, d = 0, rr = a.r ?? 1; if (a.rect) { x = a.rect[0] + rnd() * (a.rect[1] - a.rect[0]); z = a.rect[2] + rnd() * (a.rect[3] - a.rect[2]); } else { const ang = rnd() * Math.PI * 2; d = Math.sqrt(rnd()) * a.r; x = a.x + Math.cos(ang) * d; z = a.z + Math.sin(ang) * d; }
      if (a.accept && rnd() > a.accept(x, z)) continue;
      const av = a.avoid ?? avoid; // (a chance to keep the spot, from the placement rule: groves in patches, thicker toward the mountain foot, singles between)
      if (av(x, z) || placed.some(p => Math.hypot(p[0] - x, p[1] - z) < (a.spacing ?? spacing) * p[2])) continue;
      let u = rnd(), kind = MIX[0][0]; for (const [k, w] of MIX) { if (u < w) { kind = k; break; } u -= w; }
      if (kind === 'scots' && (noScots || (a.scotsAt && a.scotsAt(x, z) < 1))) kind = 'fir'; // (where a grove says so, the tall bare-trunked Scots pine is a fir instead: a wide, full skirt of boughs, and low)
      const s = (.82 + rnd() * .4) * (1 - .22 * (d / rr)) * (a.scaleAt ? a.scaleAt(x, z) : 1) , m = new THREE.Matrix4().compose(new THREE.Vector3(x, heightAt(x, z) - .1, z), new THREE.Quaternion().setFromEuler(new THREE.Euler((rnd() - .5) * .05, rnd() * Math.PI * 2, (rnd() - .5) * .05)).premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -(a.lean ?? 0) * (.7 + .6 * Math.abs(Math.sin(x * 12.9898 + z * 78.233))))) /* (lean: the whole tree bent over downwind, east, by about this many radians) */, new THREE.Vector3(s * (.92 + .16 * rnd()), s * (.92 + .16 * rnd()), s * (.92 + .16 * rnd())));
      let P = pool[kind];
      if (a.heavySnow) P = pool['h_' + kind] ??= [...Array.from({ length: MODELS }, (_, i) => ({ tree: buildPine(kind, 11 + i * 37 + kind.length, { snow: 2, lod: true }), chunks: {}, trees: [] })), ...(kind === 'spruce' || kind === 'fir' ? [{ tree: buildPine(kind, 97 + kind.length, { snow: 2, lod: true, lift: kind === 'spruce' ? 2.2 : 2.6 }), chunks: {}, trees: [] }] : [])]; // (area.heavySnow: its own set of models, loaded with snow all over)
      let mi = Math.floor(rnd() * MODELS);
      if (P.length > MODELS) { // a tree in a thick stand is the lifted kind (a bare trunk under the crown: its lowest branches died for want of light); one in the open, or at the edge, keeps its skirt to the ground. (The choice comes from a hash of the spot, not from the random stream, so no tree moves.)
        let nb = 0; for (const q of placed) if (Math.abs(q[0] - x) < 7 && Math.abs(q[1] - z) < 7 && Math.hypot(q[0] - x, q[1] - z) < 7) nb++;
        const hsh = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453; if (hsh - Math.floor(hsh) < Math.min(.85, Math.max(0, (nb - 1) / 5))) mi = MODELS;
      }
      const cx = Math.floor(x / BLOCK) + ',' + Math.floor(z / BLOCK); (P[mi].chunks[cx] ??= []).push([m, z]); P[mi].trees.push({ m, x, z, y: m.elements[13] });
      if (!a.noBlock) boxes.push({ x, z, hw: .35 * s + .2, hd: .35 * s + .2 }); placed.push([x, z, .85 + .3 * rnd()]); made++;
    }
  }
  const group = new THREE.Group(); group.name = 'forest'; group.userData.noWater = true; // (kept out of the water's reflection and see-through passes: it is land, well back from the shore)
  const stats = { drawn: 0, seen: 0, total: placed.length };
  // The trees in view: per model, instanced meshes holding only the trees the main camera can see (packed again every frame in cull(), a few hundred matrices at most), not whole 12 m blocks.
  const viewSets = [];
  for (const k in pool) for (const p of pool[k]) if (p.trees.length) {
    const meshes = p.tree.children.map(src => { const im = new THREE.InstancedMesh(src.geometry, src.material, p.trees.length); im.name = src.name + '_' + k; im.castShadow = false; im.receiveShadow = true; im.frustumCulled = false; im.visible = false; if (src.customDepthMaterial) im.customDepthMaterial = src.customDepthMaterial; im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); group.add(im); return im; });
    viewSets.push({ trees: p.trees, meshes });
  }
  const shadowSets = []; // per model: its trees and shadow-only copies of its meshes (castShadow, drawn only in the shadow pass, holding just the trees whose shadow can reach the view)
  for (const k in pool) for (const p of pool[k]) if (p.trees.length) {
    const meshes = p.tree.children.map(src => { const sm = new THREE.InstancedMesh(src.geometry, src.material, p.trees.length); sm.name = 'shadow_' + src.name + '_' + k; sm.castShadow = true; sm.receiveShadow = false; sm.frustumCulled = false; sm.visible = false; if (src.customDepthMaterial) sm.customDepthMaterial = src.customDepthMaterial; group.add(sm); return sm; });
    shadowSets.push({ trees: p.trees, meshes });
  }
  scene.add(group);
  const frustum = new THREE.Frustum(), pm = new THREE.Matrix4();
  const viewProbe = new THREE.Sphere(new THREE.Vector3(), 6.6); // (a tree's bounds: a tall fir stands 12 m or more and its boughs spread 5 m; the sphere must hold all of it, or a tree at the edge of the view blinks out while a bit of it still shows: seen on the steep climbs, where the camera looks along the slope)
  const cull = camera => { // (before the main render, every frame)
    camera.updateMatrixWorld(); pm.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse); frustum.setFromProjectionMatrix(pm); let n = 0;
    for (const set of viewSets) {
      let c = 0;
      for (const t of set.trees) { viewProbe.center.set(t.x, t.y + 5.6, t.z); if (frustum.intersectsSphere(viewProbe)) { for (const im of set.meshes) im.setMatrixAt(c, t.m); c++; } }
      for (const im of set.meshes) { im.count = c; im.visible = c > 0; im.instanceMatrix.needsUpdate = true; }
      n += c;
    }
    stats.drawn = stats.seen = n;
  };

  // The shadow pass draws only the trees whose shadow can reach the main view: a tree's shadow lies along the ground away from the sun for (its height / tan(sun height)) metres, so a tree counts when the view meets a sphere round it
  // or round any point of that stretch of ground. Those trees are packed into the shadow-only meshes just before the shadow pass (and the meshes hidden after it).
  const mf = new THREE.Frustum(), mm = new THREE.Matrix4(), probe = new THREE.Sphere(new THREE.Vector3(), 5.2), away = new THREE.Vector3();
  const shadowPrep = (cam, sunPos, sunTarget) => {
    cam.updateMatrixWorld(); mm.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse); mf.setFromProjectionMatrix(mm);
    away.set(sunTarget.x - sunPos.x, 0, sunTarget.z - sunPos.z); const flat = away.length() || 1, reach = Math.min(30, 10 * flat / Math.max(.1, sunPos.y - sunTarget.y)); away.normalize();
    let n = 0;
    for (const set of shadowSets) {
      let c = 0;
      for (const t of set.trees) {
        let need = false;
        for (let i = 0; i <= 4 && !need; i++) { probe.center.set(t.x + away.x * reach * i / 4, t.y + 4.2, t.z + away.z * reach * i / 4); need = mf.intersectsSphere(probe); }
        if (need) { for (const sm of set.meshes) sm.setMatrixAt(c, t.m); c++; }
      }
      for (const sm of set.meshes) { sm.count = c; sm.visible = c > 0; sm.instanceMatrix.needsUpdate = true; }
      n += c;
    }
    stats.shadowN = n;
  };
  const shadowDone = () => { for (const set of shadowSets) for (const sm of set.meshes) sm.visible = false; };
  return { group, boxes, count: placed.length, cull, stats, shadowPrep, shadowDone };
}
