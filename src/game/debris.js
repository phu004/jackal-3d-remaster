// Simple rigid debris: pieces fly, tumble, bounce with energy loss, then settle and stay. A piece
// coming down on water splashes in, sinks out of sight and is gone. Pieces thrown while `burying` is
// set (the wreckage of the light tanks that keep coming in stage 2's boss fight) sink slowly into the
// ground a while after they settle and are removed, so it doesn't pile up and slow the game down.
import * as THREE from 'three';
import { REFLECT } from './layers.js';
import { mergeGeometries } from './optimize.js';
import { PUDDLE } from './puddles.js';

const GRAVITY = 25, MAX_PIECES = 250;
const BURY_AFTER_FAST = 1.5, BURY_SPEED_FAST = .6; // (the airbase boss fight's wreckage, which keeps coming: lies 1.5 s, then sinks 5 times as fast)
const BURY_AFTER = 6, BURY_SPEED = .12; // s lying there before it starts to sink into the ground, and m/s it sinks
const _box = new THREE.Box3(), _sz = new THREE.Vector3();
const BAKE_AT = 16, BAKE_EVERY = 1.5, CELL = 30; // pieces lying still before they're merged into static meshes; how often that's checked (s); size (m) of the blocks they're merged by
const SINK_SPEED = .9, SINK_DEPTH = 2.5; // m/s down through the water, and how deep it goes before it's removed

// Wreckage shadows: on at the higher graphics levels; at MEDIUM and LOW the flying and fallen
// pieces cast none (a lot of shadow-map drawing for little to see). Set by quality.js.
let wreckShadows = true, amount = 1;
let smallShadowR = .3, smallMirrorR = 0;   // radius (m) under which a piece casts no shadow; under which a loose piece is not mirrored in stage 6's wet road either (0: all are). Set by setSmallDebris.
export function setSmallDebris(shadowR, mirrorR) { smallShadowR = shadowR; smallMirrorR = mirrorR; }
// How much loose wreckage is thrown (1 = all; LOW graphics: about half). Set by quality.js.
export function setDebrisAmount(k) { amount = k; }
export function setWreckShadows(on, scene) {
  wreckShadows = on;
  scene?.traverse(o => { if (o.userData.wreck) o.castShadow = on && o.userData.wreck.cast; });
}
// Tag every mesh in `obj` as wreckage (remembering whether it casts a shadow at all) and apply the setting.
export function markWreckage(obj) {
  obj.traverse(o => {
    if (!o.isMesh) return;
    if (!o.userData.wreck) { // (a piece under 30 cm across has no shadow worth a draw call in the shadow pass)
      const g = o.geometry; g.boundingSphere ?? g.computeBoundingSphere();
      o.userData.wreck = { cast: o.castShadow && g.boundingSphere.radius * Math.max(o.scale.x, o.scale.y, o.scale.z) >= smallShadowR };
    }
    o.castShadow = wreckShadows && o.userData.wreck.cast;
  });
}

// A torn piece of plating about w x d across and h thick (not a neat box): a jagged 3-6 sided plate, often bent or twisted, or a wedge / a sliver.
export function shardGeometry(w, h, d) {
  const r = Math.random, kind = r();
  let g;
  if (kind < .2) { // wedge: a plate that thickens to one edge
    g = new THREE.BoxGeometry(w, h * 2.2, d, 1, 1, 1); const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { if (p.getX(i) > 0) p.setY(i, p.getY(i) * .25); p.setZ(i, p.getZ(i) * (1 - .35 * (p.getX(i) / w + .5) * r())); }
  } else { // jagged outline, extruded
    const n = 3 + Math.floor(r() * 4), s = new THREE.Shape(), a0 = r() * 6.283;
    for (let i = 0; i < n; i++) {
      const a = a0 + (i + (r() - .5) * .7) / n * 6.283, k = .45 + r() * .55, x = Math.cos(a) * w * .5 * k, y = Math.sin(a) * d * .5 * k;
      i ? s.lineTo(x, y) : s.moveTo(x, y);
    }
    g = new THREE.ExtrudeGeometry(s, { depth: h, bevelEnabled: false }); g.rotateX(-Math.PI / 2); g.translate(0, -h / 2, 0); // (flat in XZ, thickness along Y)
    const p = g.attributes.position, bend = (r() - .5) * 1.6 / Math.max(w, d), twist = r() < .35 ? (r() - .5) * 1.4 : 0;
    if (r() < .7) for (let i = 0; i < p.count; i++) { // bent along one axis, sometimes twisted
      const x = p.getX(i), z = p.getZ(i), t = twist * x;
      p.setY(i, p.getY(i) + bend * x * x * .6 + Math.sin(t) * z * .5); p.setZ(i, z * Math.cos(t));
    }
  }
  g.computeVertexNormals(); g.computeBoundingSphere();
  return g;
}

export class Debris {
  // groundAt(x, z): how high the drawn ground is there (stage 2's terraces are raised).
  // water: { at(x, z): is it water there, splash(pos, size) } (pieces landing in it sink).
  // burying: pieces thrown while it's set sink into the ground once settled and are removed (see Tanks.wreck).
  constructor(scene, groundAt = () => 0, water = null) { this.scene = scene; this.groundAt = groundAt; this.water = water; this.pieces = []; this.burying = false; this.fast = false; this.keeping = false; this.bakeIn = BAKE_EVERY; }

  // Throw `obj` (already in the scene) with velocity `vel` and spin `spin` (rad/s per axis).
  // `rest` is how high its origin sits when lying on the ground.
  launch(obj, vel, spin, rest = .1, keep = false, reflect = keep) { // keep: a big piece (a flung turret) that is never the one dropped when there are too many; reflect: it shows in the water's and the wet road's reflection (only the big pieces by default: a mirror image of every shard of wreckage cost a lot of draw calls)
    if (obj.isMesh && amount < 1 && Math.random() > amount) { obj.parent?.remove(obj); return; } // thinned out (single pieces only: a flung turret always flies)
    obj.traverse(o => { if (reflect) o.layers.enable(REFLECT); else o.layers.disable(REFLECT); }); // (a piece cut from a model that is mirrored comes with that layer on: it is taken off)
    if (!reflect && smallMirrorR > 0) { _box.setFromObject(obj); if (_box.getSize(_sz).length() < smallMirrorR * 2) obj.traverse(o => o.layers.disable(PUDDLE)); }   // (a small loose piece is not mirrored in the wet road either: stage 6's setting)
    markWreckage(obj);
    this.pieces.push({ obj, vel: vel.clone(), spin: spin.clone(), rest, settled: false, bury: this.burying, fast: this.fast, keep: keep || this.keeping });
    if (this.pieces.length > MAX_PIECES) { const i = Math.max(0, this.pieces.findIndex(p => !p.keep)); this.scene.remove(this.pieces.splice(i, 1)[0].obj); } // the oldest small piece goes
  }

  // Stop tracking a piece (its owner removes it from the scene).
  forget(obj) { const i = this.pieces.findIndex(p => p.obj === obj); if (i >= 0) this.pieces.splice(i, 1); }

  // Convenience: a lump of rubble of the given material, thrown out from `at`.
  chunk(at, material, size, spread = 1) {
    const geo = [THREE.DodecahedronGeometry, THREE.TetrahedronGeometry, THREE.OctahedronGeometry, THREE.IcosahedronGeometry][Math.floor(Math.random() * 4)];
    const g = new geo(size, 0), p = g.attributes.position, k = new Map(); // (corners knocked about: no two lumps alike; shared corners move together)
    for (let i = 0; i < p.count; i++) {
      const key = p.getX(i).toFixed(3) + p.getY(i).toFixed(3) + p.getZ(i).toFixed(3); if (!k.has(key)) k.set(key, 1 + (Math.random() - .5) * .6);
      p.setXYZ(i, p.getX(i) * k.get(key), p.getY(i) * k.get(key), p.getZ(i) * k.get(key));
    }
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, material);
    m.castShadow = true;
    m.position.copy(at).add(new THREE.Vector3((Math.random() - .5) * spread, Math.random() * .5, (Math.random() - .5) * spread));
    m.scale.set(1, .6 + Math.random() * .5, .8 + Math.random() * .4);
    this.scene.add(m);
    const r = () => (Math.random() - .5) * 2;
    this.launch(m, new THREE.Vector3(r() * 6, 5 + Math.random() * 7, r() * 6), new THREE.Vector3(r() * 9, r() * 9, r() * 9), size * .5);
  }

  // Wreckage that has settled for good is merged into a few static meshes (one per material and 30 m block): every loose piece is a
  // draw call in the main, shadow and reflection passes, and a long fight leaves hundreds of them lying about.
  bake() {
    const ready = this.pieces.filter(p => p.settled && !p.bury && p.buryTo === undefined && p.obj.isMesh && !p.obj.isInstancedMesh && !Array.isArray(p.obj.material));
    if (ready.length < BAKE_AT) return;
    const cells = new Map();
    for (const p of ready) {
      const o = p.obj; o.updateMatrixWorld(true);
      const key = Math.floor(o.position.x / CELL) + ',' + Math.floor(o.position.z / CELL), byMat = cells.get(key) ?? cells.set(key, new Map()).get(key);
      const list = byMat.get(o.material) ?? byMat.set(o.material, []).get(o.material);
      list.push({ geo: (o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone()).applyMatrix4(o.matrixWorld), p });
    }
    for (const byMat of cells.values()) for (const [material, list] of byMat) {
      const merged = mergeGeometries(list.map(e => e.geo));
      if (!merged) continue; // (odd geometry: those pieces just stay as they are)
      const mesh = new THREE.Mesh(merged, material); mesh.castShadow = list.some(e => e.p.obj.userData.wreck?.cast ?? e.p.obj.castShadow); mesh.receiveShadow = false;
      markWreckage(mesh); this.scene.add(mesh);
      for (const { p } of list) { this.scene.remove(p.obj); p.obj.geometry.dispose(); this.pieces.splice(this.pieces.indexOf(p), 1); }
    }
  }

  update(dt) {
    if ((this.bakeIn -= dt) <= 0) { this.bakeIn = BAKE_EVERY; this.bake(); }
    for (let i = this.pieces.length - 1; i >= 0; i--) {
      const p = this.pieces[i], o = p.obj;
      if (p.settled) {
        if (p.belt) { const v = this.conveyorAt?.(o.position.x, o.position.z) ?? 0; if (v) o.position.z += v * dt; } // (carried south on the belt)
        if (p.buryTo === undefined) continue; // (stays for good)
        if ((p.buryIn -= dt) > 0) continue;
        o.position.y -= (p.fast ? BURY_SPEED_FAST : BURY_SPEED) * dt; // into the ground, then gone
        if (o.position.y < p.buryTo) { this.scene.remove(o); this.pieces.splice(i, 1); }
        continue;
      }
      if (p.sinking) { // drifting down through the water, slowing its tumble, until it's out of sight
        o.position.y -= SINK_SPEED * dt; o.position.x += p.vel.x * dt; o.position.z += p.vel.z * dt;
        p.vel.multiplyScalar(Math.exp(-3 * dt)); p.spin.multiplyScalar(Math.exp(-2 * dt));
        o.rotation.x += p.spin.x * dt; o.rotation.y += p.spin.y * dt; o.rotation.z += p.spin.z * dt;
        if (o.position.y < p.sinkTo) { this.scene.remove(o); this.pieces.splice(i, 1); }
        continue;
      }
      p.vel.y -= GRAVITY * dt;
      o.position.addScaledVector(p.vel, dt);
      o.rotation.x += p.spin.x * dt; o.rotation.y += p.spin.y * dt; o.rotation.z += p.spin.z * dt;
      const floor = p.rest + this.groundAt(o.position.x, o.position.z);
      if (o.position.y < floor && this.water?.at(o.position.x, o.position.z)) { // into the water: a splash, then it sinks
        o.traverse(m => { m.layers.disable(REFLECT); m.castShadow = false; }); // (under the surface: no reflection of it, no shadow)
        p.sinking = true; p.sinkTo = floor - p.rest - SINK_DEPTH; p.vel.y = 0; p.vel.x *= .3; p.vel.z *= .3;
        this.water.splash?.(o.position.clone().setY(floor - p.rest), p.rest);
        continue;
      }
      if (o.position.y < floor) { // hit the ground: bounce, lose energy, eventually stop
        o.position.y = floor;
        if (Math.abs(p.vel.y) < 2.5) {
          p.settled = true;
          if (!p.bury && this.conveyorAt?.(o.position.x, o.position.z)) { p.bury = true; p.fast = true; p.belt = true; } // landed on a conveyor belt: it will be carried along and sunk into it
          if (!p.bury && this.pitAt?.(o.position.x, o.position.z)) { p.bury = true; p.fast = true; o.traverse(m => { m.layers.disable(REFLECT); m.castShadow = false; }); } // (came to rest on a chasm's floor, stage 5: it sinks in and goes soon, not lying there for the rest of the stage)
          if (p.bury) { // to be buried: deep enough that its top ends up below the ground
            _box.setFromObject(o);
            p.buryIn = (p.fast ? BURY_AFTER_FAST : BURY_AFTER) * (.8 + Math.random() * .4); p.buryTo = o.position.y - (_box.max.y - floor + p.rest) - .05;
          }
          continue;
        }
        p.vel.y *= -.35; p.vel.x *= .55; p.vel.z *= .55; p.spin.multiplyScalar(.5);
      }
    }
  }
}
