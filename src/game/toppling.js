// Stage 2's toppling pillar (NES): when the jeep comes up to a spot (stage.toppling.trigger), a tall
// pillar ahead cracks (it shudders, dust and grit spill from the joint: the warning) and its upper
// drums come away: they tip over southward, drop clear over the pillar standing in front, twisting
// to land lying across the way, and roll on south about ROLL metres, slowing, until they stop (or hit
// something solid). Rolling or landing on the jeep crushes it, so get out of the way. Once stopped
// they block like a wall, but the jeep's weapons can break them up at any point from the crack on
// (a grenade, rocket or split shot, or a few bullets). Gameplay stays 2D: what counts is where the
// drums are over the ground; their hit box follows where they show on screen. The stump stays
// standing. The pillar is built split in world.js (toppler).
import * as THREE from 'three';
import { buildBreakCap } from '../assets/ruins.js';

const TRIGGER_X = 14;          // m either side of the trigger point the jeep may be
const CRACK = .3;              // s of shuddering before it goes
const G = 22;                  // the fall's pull (brisk: the whole fall is over in well under a second)
const THROW = 5;               // m/s south it carries off the stump as it drops (clear of the pillar in front)
const ROLL = 15;               // m it rolls once down
const ROLL_SPEED = 10;         // m/s it starts rolling at (slowing evenly, so it covers ROLL)
const RADIUS = .72;            // the drums' radius (buildColumnDrums)
const CRUSH_PAD = .2;          // m: crushes the jeep if this far outside its outline
const HP = 4, SCORE = 200;     // one grenade / rocket / split shot, or four bullets
const SHOW_SOUTH = 28 / 45;    // a point this high shows on screen this much further south per metre (GameCamera's slant)

const UP = new THREE.Vector3(0, 1, 0);
const _v = new THREE.Vector3(), _q = new THREE.Quaternion();

export class Toppling {
  // enemyFire: for its jeep hit test; debris: for the grit and the broken drums.
  constructor(scene, fx, debris, enemyFire) { this.scene = scene; this.fx = fx; this.debris = debris; this.enemyFire = enemyFire; this.state = 'none'; }

  // p: one of world.topplers (its pillar, and spec: its entry in the stage data).
  setup(world, p) {
    this.world = world; this.p = p; this.spec = p?.spec;
    this.key = p ? `${p.at.x.toFixed(1)},${p.at.z.toFixed(1)}` : ''; // (saved games find it by where it stands)
    if (!this.p || !this.spec?.trigger) return; // (trigger: one, or a list)
    this.state = 'wait';
    // which way it falls and rolls: south, or turned spec.roll degrees from south (+: toward the east)
    const a = (this.spec.roll ?? 0) * Math.PI / 180;
    this.dir = new THREE.Vector3(Math.sin(a), 0, Math.cos(a)); this.side = new THREE.Vector3(this.dir.z, 0, -this.dir.x); // (side: its axis once lying across the way)
    this.stone = null; this.p.drums.traverse(o => { if (!this.stone && o.isMesh) this.stone = o.material; });
  }

  update(dt, player, onHit) {
    const st = this.state;
    if (st === 'wait') {
      // trigger (or a list of them, any one will do): { x, z, r? } (the jeep up to z, within r, default
      // TRIGGER_X, of x), { x0, x1, z } (up to z, between x0 and x1) or { near } (within `near` m of the pillar)
      const jp = player.position;
      const hit = tr => tr.near !== undefined ? Math.hypot(jp.x - this.p.at.x, jp.z - this.p.at.z) <= tr.near
        : tr.x0 !== undefined ? jp.z <= tr.z && jp.x >= tr.x0 && jp.x <= tr.x1
        : jp.z <= tr.z + 1.5 && Math.abs(jp.x - tr.x) <= (tr.r ?? TRIGGER_X);
      if (!player.enabled || player.dead || ![].concat(this.spec.trigger).some(hit)) return;
      if (this.spec.aim) this.aimAt(jp); // (spec.aim: it falls toward where the jeep is now)
      this.state = 'crack'; this.t = 0;
      this.addTarget();
    } else if (st === 'crack') { // shudders, grit and dust spilling from the joint
      this.t += dt;
      const k = Math.min(1, this.t / CRACK);
      this.tip(Math.sin(this.t * 55) * .02 * (.4 + k) + .02 * k);
      if (Math.random() < 8 * dt) this.fx.puff(this.joint(), { color: 0xd8ccb0, size: .35, grow: 2.5, life: 1, opacity: .5, vel: new THREE.Vector3((Math.random() - .5), -.4, (Math.random() - .5)) });
      if (Math.random() < 5 * dt && this.stone) this.debris.chunk(this.joint(), this.stone, .06 + Math.random() * .08, 1.2);
      if (this.t >= CRACK) { this.state = 'tip'; this.angle = .15; this.spin = 1.2; this.breakStump(); } // (a good shove: no slow start)
    } else if (st === 'tip') { // tips over the joint's edge on that side, gathering speed, until it's lying flat (pointing that way)
      this.spin += 2.5 * G / this.p.length * Math.sin(this.angle) * dt;
      this.angle = Math.min(Math.PI / 2, this.angle + this.spin * dt);
      this.tip(this.angle);
      if (this.angle >= Math.PI / 2) { // off the stump: flies on, falling, twisting round to lie across the way
        const d = this.p.drums;
        this.c = d.position.clone().addScaledVector(this.dir, this.p.length / 2); // its middle
        this.vel = this.dir.clone().multiplyScalar(THROW); this.q0 = d.quaternion.clone(); this.t = 0;
        this.state = 'fly';
      }
    } else if (st === 'fly') {
      this.t += dt; this.vel.y -= G * dt; this.c.addScaledVector(this.vel, dt);
      const k = Math.min(1, this.t / .4), q = this.q0.clone().slerp(this.lyingAcross(0), k * k * (3 - 2 * k));
      const floor = this.groundAt(this.c) + RADIUS;
      if (this.c.y <= floor) { // down: dust all along it; it bounces into a roll
        this.c.y = floor; this.rolled = 0; this.speed = ROLL_SPEED; this.turn = 0;
        this.place(this.lyingAcross(0)); this.dust(1);
        this.state = 'roll';
        if (this.crushes(player)) onHit();
      } else this.place(q);
    } else if (st === 'roll') { // rolls on, slowing evenly, till it stops or meets something solid
      const step = this.speed * dt;
      if (this.blockedAhead(step)) this.speed = 0;
      else { this.c.addScaledVector(this.dir, step); this.rolled += step; this.turn += step / RADIUS; this.c.y = this.groundAt(this.c) + RADIUS; }
      this.speed = Math.max(0, this.speed - ROLL_SPEED * ROLL_SPEED / (2 * ROLL) * dt);
      this.place(this.lyingAcross(this.turn));
      if (Math.random() < 10 * dt * (this.speed / ROLL_SPEED)) this.dust(.4);
      if (this.speed > .5 && this.crushes(player)) onHit();
      if (this.speed <= 0) { this.state = 'down'; this.addBlocks(); }
    }
    if (this.target && this.target.hp > 0 && this.state !== 'gone') this.placeTarget();
  }

  // The stump's top, once the drums are off: a jagged break (instead of the clean drum joint), a burst
  // of grit from it.
  breakStump(quiet = false) { // quiet: a saved game being put back
    const cap = buildBreakCap(Math.round(this.p.at.x * 7 + this.p.at.z * 3), this.stone ?? undefined);
    cap.position.set(this.p.at.x, this.p.base, this.p.at.z);
    let mask = 1; this.p.drums.traverse(o => { if (o.isMesh) mask = o.layers.mask; }); cap.traverse(o => { o.layers.mask = mask; });
    this.scene.add(cap);
    if (quiet) return;
    if (this.stone) for (let i = 0; i < 6; i++) this.debris.chunk(this.joint(), this.stone, .06 + Math.random() * .1, 1.5);
    for (let i = 0; i < 3; i++) this.fx.puff(this.joint(), { color: 0xd8ccb0, size: .5, grow: 3, life: 1.2, opacity: .55, vel: new THREE.Vector3(0, .6, .5) });
  }

  // Fall (and roll) toward p instead.
  aimAt(p) {
    const dx = p.x - this.p.at.x, dz = p.z - this.p.at.z, len = Math.hypot(dx, dz) || 1;
    this.dir.set(dx / len, 0, dz / len); this.side.set(this.dir.z, 0, -this.dir.x);
  }

  // Lying across its way (its axis along this.side), turned `roll` radians about that axis.
  lyingAcross(roll, out = new THREE.Quaternion()) { return out.setFromAxisAngle(this.side, roll).multiply(_q.setFromUnitVectors(UP, this.side)); }

  // Upright drums tilted `angle` toward this.dir, pivoting on the joint's edge on that side.
  tip(angle) {
    const d = this.p.drums, out = RADIUS * (1 - Math.cos(angle));
    d.quaternion.setFromAxisAngle(this.side, angle); // turns +Y (up) toward this.dir
    d.position.set(this.p.at.x + this.dir.x * out, this.p.base + RADIUS * Math.sin(angle), this.p.at.z + this.dir.z * out);
  }

  // Lying drums turned q, their middle at this.c (the model's origin is at one end of its axis).
  place(q) {
    const d = this.p.drums;
    d.quaternion.copy(q);
    d.position.copy(this.c).addScaledVector(_v.copy(UP).applyQuaternion(q), -this.p.length / 2);
  }

  // Points along it on the ground, one every `step` metres.
  along(step = .5) {
    const d = this.p.drums, ax = _v.copy(UP).applyQuaternion(d.quaternion).setY(0), pts = [];
    for (let s = 0; s <= this.p.length + 1e-3; s += step) pts.push(new THREE.Vector3(d.position.x + ax.x * s, 0, d.position.z + ax.z * s));
    return pts;
  }

  crushes(player) {
    if (!player.enabled || player.dead || player.invulnerable) return false;
    return this.along().some(q => this.enemyFire.hitsJeep(q, player, CRUSH_PAD + RADIUS * .5));
  }

  // Something solid (terrain or an object) just ahead of its leading side?
  blockedAhead(step) {
    const w = this.world, inside = (b, x, z) => Math.abs(x - b.x) < b.hw && Math.abs(z - b.z) < b.hd;
    return this.along(.6).some(q => {
      const ax = q.x + this.dir.x * (RADIUS + step), az = q.z + this.dir.z * (RADIUS + step);
      return w.solidTile(w.tileAt(ax, az))
        || w.obstacles.some(b => b.alive && !this.blocks?.includes(b) && inside(b, ax, az) && !inside(b, q.x, q.z)); // (not one it's already overlapping)
    });
  }

  dust(amount) {
    for (const q of this.along(1)) if (Math.random() < amount) this.fx.puff(q.setY(this.groundAt(q) + .3),
      { color: 0xd8ccb0, size: .6, grow: 3, life: 1.2, opacity: .5, vel: new THREE.Vector3((Math.random() - .5) * 2, .8, (Math.random() - .5) * 2) });
  }

  joint() { return new THREE.Vector3(this.p.at.x + (Math.random() - .5) * 1.2, this.p.base, this.p.at.z + (Math.random() - .5) * 1.2); }
  groundAt(p = this.p.at) { return this.world.heightAt ? this.world.heightAt(p.x, p.z) : 0; }

  // Stopped, it blocks like a wall: a chain of small boxes along it.
  addBlocks() {
    this.blocks = this.along(1.2).map(q => ({ x: q.x, z: q.z, hw: .75, hd: .75, alive: true, kind: 'column' })); // (kind: stops rockets like standing stonework)
    this.world.obstacles.push(...this.blocks);
  }

  // Shootable from the moment it cracks: one box round where it shows on screen.
  addTarget() {
    this.target = { object: this.p.drums, x: 0, z: 0, hw: 1, hd: 1, r: 1.5, hp: HP, score: SCORE, die: () => this.shatter() };
    this.world.targets.push(this.target);
    this.placeTarget();
  }
  placeTarget() {
    const d = this.p.drums, ax = _v.copy(UP).applyQuaternion(d.quaternion), L = this.p.length, t = this.target;
    const a = d.position, bx = a.x + ax.x * L, bz = a.z + ax.z * L, by = a.y + ax.y * L;
    const az = a.z + a.y * SHOW_SOUTH, bzs = bz + by * SHOW_SOUTH; // where its ends show on screen
    t.x = (a.x + bx) / 2; t.z = (az + bzs) / 2;
    t.hw = Math.abs(bx - a.x) / 2 + .9; t.hd = Math.abs(bzs - az) / 2 + .9;
  }

  // Broken up by the jeep's weapons: it falls apart into pieces of drum and stone, in a cloud of dust
  // (no blast of its own: just the weapon's), and the way is clear.
  shatter() {
    const d = this.p.drums, ax = _v.copy(UP).applyQuaternion(d.quaternion).clone(), L = this.p.length, r = () => (Math.random() - .5) * 2;
    for (let s = .3; s <= L; s += .6) {
      const at = d.position.clone().addScaledVector(ax, s);
      this.fx.puff(at, { color: 0xd8ccb0, size: .8, grow: 3, life: 1.4, opacity: .55, vel: new THREE.Vector3(r() * .5, .7, r() * .5) });
      if (!this.stone) continue;
      // a slice of the drum, tumbling off, and lumps of stone
      const slice = new THREE.Mesh(new THREE.CylinderGeometry(RADIUS * (.6 + Math.random() * .35), RADIUS * (.7 + Math.random() * .3), .25 + Math.random() * .3, 9), this.stone);
      slice.position.copy(at); slice.quaternion.copy(d.quaternion); slice.castShadow = true; this.scene.add(slice);
      this.debris.launch(slice, new THREE.Vector3(r() * 3, 2 + Math.random() * 3, r() * 3), new THREE.Vector3(r() * 6, r() * 6, r() * 6), .2);
      for (let i = 0; i < 3; i++) this.debris.chunk(at, this.stone, .1 + Math.random() * .2, 1.6);
    }
    this.scene.remove(d);
    for (const b of this.blocks ?? []) b.alive = false;
    const i = this.world.targets.indexOf(this.target); if (i >= 0) this.world.targets.splice(i, 1);
    this.state = 'gone';
  }

  // Saved games: still standing, lying where it stopped, or broken up. One caught on its way is
  // put down where it would stop.
  snapshot() {
    if (this.state === 'none' || this.state === 'wait' || this.state === 'gone') return { st: this.state };
    const r = v => Math.round(v * 100) / 100;
    const dir = [r(this.dir.x), r(this.dir.z)]; // (which way it went: an aimed one can go any way)
    if (this.state === 'down') return { st: 'down', c: [r(this.c.x), r(this.c.z)], dir, hp: this.target?.hp ?? HP };
    const left = this.c ? (this.state === 'roll' ? this.speed * this.speed / (2 * ROLL_SPEED * ROLL_SPEED / (2 * ROLL)) : ROLL) : 3 + ROLL; // (how much further it goes)
    const from = this.c ?? this.p.at, at = from.clone().addScaledVector(this.dir, left);
    return { st: 'down', c: [r(at.x), r(at.z)], dir, hp: this.target?.hp ?? HP };
  }
  restore(d) {
    if (!d || this.state !== 'wait') return;
    if (d.st === 'gone') { this.scene.remove(this.p.drums); this.breakStump(true); this.state = 'gone'; return; }
    if (d.st !== 'down') return;
    this.breakStump(true);
    if (d.dir) this.aimAt(new THREE.Vector3(this.p.at.x + d.dir[0], 0, this.p.at.z + d.dir[1]));
    this.c = new THREE.Vector3(d.c[0], 0, d.c[1]); this.c.y = this.groundAt(this.c) + RADIUS;
    this.place(this.lyingAcross(0));
    this.state = 'down'; this.addBlocks(); this.addTarget(); this.target.hp = d.hp;
  }
}
