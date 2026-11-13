// "Quiet" effects for restoring a saved game: lets a wreck routine (turret, building, gate, tank)
// run again without the show. No blast, no smoke, nothing flying: each piece it would have thrown
// is laid straight on the ground about where it would have landed, and everything it scatters is
// merged into one static mesh at the end (finish()). Scorch marks and burning fires are kept.
import * as THREE from 'three';
import { mergeStatic } from './optimize.js';
import { markWreckage } from './debris.js';
import { chunkMeshes } from './chunks.js';

export function quietEffects(scene, fx, heightAt = () => 0, isWater = () => false) { // isWater(x, z): pieces landing there have sunk
  const pile = new THREE.Group(), box = new THREE.Box3();
  const lay = o => { // rest it on the ground with a random spin, the right way up-ish
    o.rotation.set((Math.random() - .5) * .7, Math.random() * Math.PI * 2, (Math.random() - .5) * .7);
    o.updateMatrixWorld(true);
    box.setFromObject(o);
    o.position.y += heightAt(o.position.x, o.position.z) - box.min.y - .02;
  };
  return {
    fx: { puff() {}, smoke() {}, explosion() {}, flash() {}, hitSand() {}, scorch: (p, s) => fx.scorch(p, s), fires: fx.fires, pows: null },
    debris: {
      launch(o, vel) { // where a thrown piece would have come down: about a second's travel away
        const t = .5 + Math.random() * .6;
        o.position.x += vel.x * t; o.position.z += vel.z * t;
        if (isWater(o.position.x, o.position.z)) { o.parent?.remove(o); return; } // (sunk)
        lay(o); pile.attach(o);
      },
      chunk(at, material, size, spread = 1) { // a lump of rubble near the wreck
        if (Math.random() < .4) return;
        const m = new THREE.Mesh(new THREE.DodecahedronGeometry(size, 0), material);
        const a = Math.random() * Math.PI * 2, r = .6 + Math.random() * spread * 1.6;
        m.position.set(at.x + Math.cos(a) * r, 0, at.z + Math.sin(a) * r); m.castShadow = true;
        if (isWater(m.position.x, m.position.z)) return; // (sunk)
        scene.add(m); lay(m); pile.attach(m);
      },
      forget() {},
    },
    finish() {
      if (!pile.children.length) return;
      scene.add(pile); pile.updateMatrixWorld(true); mergeStatic(pile); markWreckage(pile);
      const meshes = pile.children.filter(c => c.isMesh); // (the merged wreckage: one mesh per material, stage-wide; split into blocks so off-screen wreckage isn't drawn)
      meshes.forEach(m => scene.attach(m));
      chunkMeshes(scene, meshes);
    },
  };
}
