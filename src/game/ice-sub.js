// Harmless submarines gliding under the ice (atmosphere for the frozen sea; ?icesub=off removes them). Each swims a closed loop (an oval), always forward, its heading following the curve of the loop, so it turns the way a boat does: in a wide
// arc, never reversing or spinning on the spot. They are in the see-through layers only, so they are seen through the ice, and they cast no shadow and cannot be hit.
//   island: { x, z, rings: [{ rx, rz, count, speed, dir }] }  rings of subs cruising round the island (the power plant's guard: they are spawned while the plant stands)
//   ambient: how many more loops to put in the open sea (a few, so the sea has some life without being infested)
import * as THREE from 'three';
import { buildSubmarine, SUB_VARIANTS } from '../assets/submarine.js';
import { addToLayer, REFLECT, UNDERWATER } from './layers.js';
import { mergedModel } from './optimize.js';
import { sfx } from './sfx.js';

const SCALE = 1.265, MAX_BUBBLES = 640;

export class IceSub {
  constructor(scene, world, { island = null, ambient = 2, shore = 8, avoid = [], above = false } = {}) {
    this.t = 0; this.subs = []; this.scene = scene; this.above = above; this.makeBubbles(above); // above: the subs float over the ice, in plain view, to look at their paint (?icesub=under puts them back under it)
    let st = 7919; const rnd = () => (st = (st * 16807) % 2147483647) / 2147483647; // (fixed seed: the same loops every run)
    const MAX_X = 124, MIN_Z = -269, MAX_Z = -1;                                                       // (the map: beyond it is open sea, not coast)
    const isSea = (x, z) => x < -124.5 || x > 124.5 || z < -269.5 || z > -0.5 || world.tileAt(x, z) === 'S';
    const piers = (world.piers ?? []).map(p => ({ ...p, hw: (p.width ?? 3) / 2 }));
    const segD = (x, z, p) => { const ax = p.x0, az = p.z0, bx = p.x1 - ax, bz = p.z1 - az, t = Math.max(0, Math.min(1, ((x - ax) * bx + (z - az) * bz) / (bx * bx + bz * bz || 1))); return Math.hypot(x - (ax + bx * t), z - (az + bz * t)) - p.hw; };
    const clearance = (x, z, need) => { // how far (m, up to `need`) this spot is from the coast, the island's shore, a pier or a moored boat: a deep-sea vessel keeps well clear of all of them
      if (Math.abs(x) > MAX_X || z < MIN_Z || z > MAX_Z) return need;
      if (world.tileAt(x, z) !== 'S') return 0;
      let best = need;
      for (const p of piers) best = Math.min(best, segD(x, z, p) - 12);                              // (12 m wider of a pier than its own length of shore)
      for (const [bx, bz] of avoid) best = Math.min(best, Math.hypot(x - bx, z - bz) - 14);
      for (let r = 1.25; r < best; r += 1.25) for (let k = 0; k < 16; k++) { const a = k / 16 * Math.PI * 2; if (!isSea(x + Math.cos(a) * r, z + Math.sin(a) * r)) return Math.min(best, r); }
      return best;
    };
    const loopOk = (cx, cz, rx, rz, tilt) => { // the whole loop (and a little either side of it) keeps `shore` metres off everything
      const c = Math.cos(tilt), si = Math.sin(tilt);
      for (let k = 0; k < 40; k++) { const a = k / 40 * Math.PI * 2, ox = Math.cos(a) * rx, oz = Math.sin(a) * rz; if (clearance(cx + ox * c - oz * si, cz + ox * si + oz * c, shore) < shore) return false; }
      return true;
    };
    if (island) for (const r of island.rings ?? []) {
      let k = 1; while (k < 1.7 && !loopOk(island.x, island.z, r.rx * k, r.rz * k, 0)) k += .06;      // (a ring that would pass too near the island's shore is widened until it does not)
      if (!loopOk(island.x, island.z, r.rx * k, r.rz * k, 0)) continue;
      for (let i = 0; i < r.count; i++) this.add({ cx: island.x, cz: island.z, rx: r.rx * k, rz: r.rz * k, tilt: 0, speed: r.speed, dir: r.dir ?? 1, phase: i / r.count * Math.PI * 2 + (r.dir < 0 ? Math.PI / r.count : 0), depth: 6.0 + rnd() * 1.2 });
    }
    const loops = [];
    for (let tries = 0; tries < 700 && loops.length < ambient; tries++) { // open-sea loops, wholly over deep sea and well apart
      const cx = -15 + rnd() * 120, cz = -215 + rnd() * 125, rx = 14 + rnd() * 8, rz = 8 + rnd() * 4, tilt = rnd() * Math.PI;
      if (!loopOk(cx, cz, rx, rz, tilt)) continue;
      if (loops.some(l => Math.hypot(l.cx - cx, l.cz - cz) < 50) || (island && Math.hypot(cx - island.x, cz - island.z) < 110)) continue;
      loops.push({ cx, cz }); this.add({ cx, cz, rx, rz, tilt, speed: 2.6 + rnd() * .8, dir: rnd() < .5 ? 1 : -1, phase: rnd() * 6.28, depth: 6.0 + rnd() * 1.2 });
    }
  }
  makeBubbles(above) { // the bubbles each sub leaves: small pale spheres that drift up toward the ice and fade, a faint trail that shows where it has been
    this.bm = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshBasicMaterial({ color: 0x7fb4c8, transparent: true, opacity: .55, depthWrite: false }), MAX_BUBBLES);
    this.bm.frustumCulled = false; this.bm.castShadow = false; this.scene.add(addToLayer(this.bm, UNDERWATER)); if (above) this.bm.layers.enable(0); else this.bm.layers.disable(0); this.bm.renderOrder = -1; // (not in the main view at all: they are seen through the ice, in the see-through pass; and if they are drawn there, they are drawn before the ice, never over it)
    this.bub = Array.from({ length: MAX_BUBBLES }, () => ({ life: 0, age: 0, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, size: 0 })); this.bi = 0; this._d = new THREE.Object3D();
    this._z = new THREE.Matrix4().makeScale(0, 0, 0); for (let i = 0; i < MAX_BUBBLES; i++) this.bm.setMatrixAt(i, this._z);
  }
  bubble(x, y, z) { const b = this.bub[this.bi++ % MAX_BUBBLES]; b.x = x + (Math.random() - .5) * .8; b.y = y + (Math.random() - .5) * .5; b.z = z + (Math.random() - .5) * .8; b.vx = (Math.random() - .5) * .12; b.vz = (Math.random() - .5) * .12; b.vy = .12 + Math.random() * .22; b.age = 0; b.life = 5 + Math.random() * 3; b.size = .14 + Math.random() * .26; }
  add(s) {
    const vr = (this.n = (this.n ?? -1) + 1) % SUB_VARIANTS, o = mergedModel('submarineIce' + vr, () => buildSubmarine({ ice: true, variant: vr })); o.scale.set(SCALE * 1.21 * .82, SCALE * 1.21, SCALE * 1.21);
    o.traverse(m => { if (m.isMesh) m.castShadow = this.above; });
    const foam = o.getObjectByName('foam'); if (foam) foam.visible = false;
    const box = new THREE.Box3().setFromObject(o); const stern = box.max.z * .97; // (how far back the tail ends from its middle, measured on the model itself: the bubbles start exactly there)
    this.scene.add(addToLayer(o, REFLECT, UNDERWATER)); o.traverse(m => this.above ? m.layers.enable(0) : m.layers.disable(0)); // (under the ice they are only drawn in the see-through pass; above it, they are in the main view too)
    this.subs.push({ obj: o, bob: s.phase * 3, stern, ...s });
  }
  dispose() { for (const s of this.subs) this.scene.remove(s.obj); this.subs.length = 0; this.scene.remove(this.bm); this.bm.dispose(); this.dead = true; } // (the power plant is down: the patrols are gone)
  update(dt, player = null) {
    if (this.dead) return;
    this.t += dt; this.pingIn = (this.pingIn ?? 0) - dt;
    for (const s of this.subs) {
      const c = Math.cos(s.tilt), si = Math.sin(s.tilt), wob = 1; // (the loop breathes a little: no two laps alike)
      const pose = ph => { // where it is on its loop at phase ph, and the way it is heading
        const ex = Math.cos(ph) * s.rx * wob, ez = Math.sin(ph) * s.rz * wob, tx = -Math.sin(ph) * s.rx * s.dir, tz = Math.cos(ph) * s.rz * s.dir;
        return { x: s.cx + ex * c - ez * si, z: s.cz + ex * si + ez * c, dx: tx * c - tz * si, dz: tx * si + tz * c };
      };
      s.phase += s.dir * s.speed / ((s.rx + s.rz) * .5) * dt;                                              // (a steady speed along it, near enough)
      const q = pose(s.phase);
      s.obj.position.set(q.x, (this.above ? 1.4 : -s.depth) + Math.sin(this.t * .5 + s.bob) * .1, q.z);
      // (the heading, in the world: the bow points along the loop, so it turns in a smooth arc)
      s.obj.rotation.y = Math.atan2(-q.dx, -q.dz);
      if (player && player.enabled && !player.dead) { // a sub passing near the jeep pings: a faint sonar tone, louder the nearer it is, one at a time and a few seconds apart
        const dd = Math.hypot(s.obj.position.x - player.position.x, s.obj.position.z - player.position.z);
        if ((s.pingAt = (s.pingAt ?? 2 + Math.random() * 6) - dt) <= 0) {
          if (dd < 36 && this.pingIn <= 0) { s.pingAt = 8 + Math.random() * 6; this.pingIn = 3; sfx.ping(.32 * Math.pow(1 - dd / 36, 1.2)); }
          else s.pingAt = 1;                                                                                  // (too far to be heard, or another has just pinged: try again soon)
        }
      }
      if ((s.emit = (s.emit ?? 0) - dt) <= 0) { // bubbles from the stern, a few a second
        s.emit = .2 + Math.random() * .08; const back = s.stern - 1.2, fx = -Math.sin(s.obj.rotation.y), fz = -Math.cos(s.obj.rotation.y), p = s.obj.position;
        for (let n = Math.random() < .45 ? 2 : 1; n > 0; n--) this.bubble(p.x - fx * back, p.y - 1.05, p.z - fz * back);
      }
    }
    const d = this._d;
    for (let i = 0; i < MAX_BUBBLES; i++) {
      const b = this.bub[i]; if (b.life <= 0) continue;
      b.age += dt; if (b.age >= b.life) { b.life = 0; this.bm.setMatrixAt(i, this._z); continue; }
      b.x += b.vx * dt; b.z += b.vz * dt; b.y = Math.min(b.y + b.vy * dt, -.28);                              // (it drifts up until it meets the underside of the ice, and stays there)
      const k = b.age / b.life; d.position.set(b.x, b.y, b.z); d.scale.setScalar(b.size * Math.min(1, b.age * 3) * (1 - k * k)); d.updateMatrix(); this.bm.setMatrixAt(i, d.matrix);
    }
    this.bm.count = Math.min(MAX_BUBBLES, this.bi); // (only the bubbles ever started are drawn: the empty ones, scaled to nothing, still cost their vertices)
    this.bm.instanceMatrix.needsUpdate = true;
  }
}
