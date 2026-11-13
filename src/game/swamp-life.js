// The swamp's own life, so it doesn't lie still like paint on the ground: near the camera, bubbles of marsh gas rise and break the surface every second or so (a small
// ring spreads from each, a few pale bubbles pop), now and then something larger stirs the mud (a wider ring and a puff of damp haze), and a few are seen in bursts.
// Only within a screen's reach of the camera, and only where the swamp is, so it costs nothing elsewhere.
import * as THREE from 'three';
import { sfx } from './sfx.js';

const REACH = 24;  // m from the camera focus
export class SwampLife {
  // world: swampAt, disturb; fx: puff.
  constructor(world, fx) { this.world = world; this.fx = fx; this.t = 1; this.burst = 0; this.trees = world.treeSpots?.() ?? []; this.treeAt = new Map(); }
  // The water round a tree is never still: roots and rotting wood let out gas, so each tree near the camera stirs the water round its trunk every second or two (more often than the open swamp does).
  nearTrees(dt, focus) {
    const w = this.world;
    this.trees.forEach((tr, i) => {
      if (Math.hypot(tr.x - focus.x, tr.z - focus.z) > REACH + 14) return;
      const left = (this.treeAt.get(i) ?? Math.random() * 1.5) - dt; if (left > 0) { this.treeAt.set(i, left); return; }
      this.treeAt.set(i, .9 + Math.random() * 1.6);
      const a = Math.random() * 6.283, d = .9 + Math.random() * 2.2, bx = tr.x + Math.cos(a) * d, bz = tr.z + Math.sin(a) * d;
      if (!(w.swampWet ? w.swampWet(bx, bz) : w.swampAt(bx, bz))) return;
      w.disturb(bx, bz, .7 + Math.random() * .6);
      for (let k = 0, n = 1 + Math.floor(Math.random() * 3); k < n; k++) this.fx.puff(new THREE.Vector3(bx + (Math.random() - .5) * .5, .06, bz + (Math.random() - .5) * .5), { color: 0xcfc8a0, size: .07 + Math.random() * .06, grow: .6, life: .35 + Math.random() * .25, opacity: .7, vel: new THREE.Vector3(0, .15, 0) });
      if (Math.random() < .3) sfx.bubble({ x: bx, z: bz });
    });
  }

  update(dt, focus) {
    this.nearTrees(dt, focus);
    if ((this.t -= dt) > 0) return;
    const w = this.world, big = Math.random() < .12;
    for (let tries = 0; tries < 14; tries++) {
      const a = Math.random() * 6.283, r = REACH * Math.sqrt(Math.random()), x = focus.x + Math.cos(a) * r, z = focus.z + Math.sin(a) * r * .7 - 4;
      if (!(w.swampWet ? w.swampWet(x, z) : w.swampAt(x, z))) continue; // (on the water as drawn, a little in from its edge)
      w.disturb(x, z, big ? 1.5 : .55 + Math.random() * .5);
      if (big) this.fx.puff(new THREE.Vector3(x, .12, z), { color: 0x9a8c5c, size: .9, grow: 2.2, life: 1.8, opacity: .22, vel: new THREE.Vector3(0, .25, 0) }); // (a belch of damp haze)
      else for (let i = 0; i < 2 + Math.floor(Math.random() * 3); i++) this.fx.puff(new THREE.Vector3(x + (Math.random() - .5) * .5, .06, z + (Math.random() - .5) * .5), { color: 0xcfc8a0, size: .07 + Math.random() * .06, grow: .6, life: .35 + Math.random() * .25, opacity: .7, vel: new THREE.Vector3(0, .15, 0) }); // (bubbles popping)
      if (Math.random() < .15) this.burst = 2 + Math.floor(Math.random() * 2); // (several in a row: a patch of marsh gas)
      break;
    }
    this.t = this.burst > 0 ? .06 + Math.random() * .1 : .45 + Math.random() * .9; // (twice as often as before)
    if (this.burst > 0) this.burst--;
  }
}
