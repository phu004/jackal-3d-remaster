// An enemy light helicopter squad (the MD-500 attack helicopter, assets/heli.js), guarding stage 6's helipad. Two helicopters in all, one at a time: the first comes in when the jeep enters the helipad area; if it is shot down while
// the jeep is still in the area a second comes in after a short pause; when that one is down too, no more come.
// Each is very agile: it darts to a firing position round the jeep, turns to face it, hovers a moment, fires a spread of five bullets at it, then immediately breaks away to another position; and so on.
// Gameplay stays 2D (the hit box is on the ground plane, where the camera sees the helicopter); its height is only for the drawing and where its bullets start.
import * as THREE from 'three';
import { buildHelicopter } from '../assets/heli.js';
import { shardGeometry } from './debris.js';
import { sfx } from './sfx.js';
import { addToLayer, REFLECT } from './layers.js';

const SCALE = 1.394;           // drawn this much of the model's size (1.328 was the size before it was made 5% bigger) (the MD-500 is 7.1 m long over the rotor)
const ALT = 7.5;               // m: hovering height
const HP = 4;                  // a bullet does 1, a grenade or a rocket's blast 4: one grenade or four machine-gun bullets bring it down
const SCORE = 3000;
const HIT_W = 1.365, HIT_L = 2.73, HIT_R = 1.89;      // m: the hit box's half width and half length (the cabin as drawn) and the blast reach
const SPEED = 14.5;            // m/s: brisk (17 was too agile)
const RING = [13, 21];         // m: how far from the jeep it takes its firing positions
const FAN = [-.28, -.14, 0, .14, .28], RANGE = 46; // the spread of five bullets (radians either side of the aim) and their reach
const AIM = .46;               // s it hovers facing the jeep before the burst
const REST = .4;               // s after the burst before it breaks away
const MAX_HELIS = 2;
const FALL = 1.7;              // s it spins down, burning, before it hits the ground
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
const _v = new THREE.Vector3(), _a = new THREE.Vector3(), _m = new THREE.Vector3();
const r = () => (Math.random() - .5) * 2;

export class LightHeliSquad {
  constructor(scene, fx, debris, enemyFire, opts = {}) {
    Object.assign(this, { scene, fx, debris, enemyFire });
    this.key = opts.key; this.maxHelis = opts.max ?? MAX_HELIS; this.slots = []; this.spawned = 0; this.active = null; this.respawnIn = 0;
  }

  // zone: { x0, x1, z0, z1 } the helipad area (the jeep inside it brings the helicopters); delay: s after a helicopter is shot down before the next comes
  setup(world, zone, delay = 2.8) {
    this.world = world; this.zone = zone; this.delay = delay;
    for (let i = 0; i < this.maxHelis; i++) { // (both built now and parked far out of sight, but not hidden: the loading screen compiles their shaders then, not at the first sight of one)
      const obj = buildHelicopter(); obj.scale.setScalar(SCALE); obj.position.set(0, 0, 900 + i * 40); this.scene.add(addToLayer(obj, REFLECT)); // (REFLECT: the puddles mirror it)
      obj.traverse(o => { if (o.isMesh) o.castShadow = o.geometry.type !== 'CircleGeometry'; }); // (the rotors' blur discs are only a faint look: no shadow)
      const h = { i, obj, rotor: obj.getObjectByName('rotor'), tail: obj.getObjectByName('tailRotor'), state: 'parked', pos: new THREE.Vector3(), vel: new THREE.Vector3(), yaw: Math.PI, pitch: 0, roll: 0, spin: 0, alt: ALT, t: 0,
        goal: new THREE.Vector3(), target: null };
      h.target = { object: obj, x: 0, z: 0, hw: HIT_W, hd: HIT_L, r: HIT_R, hp: HP, score: SCORE, immune: true, die: () => this.die(h) };
      world.targets.push(h.target);
      h.podL = obj.getObjectByName('weaponPodL'); h.podR = obj.getObjectByName('weaponPodR'); this.slots.push(h);
    }
  }

  get total() { return this.slots.length; }                                    // both helicopters count as enemies for the stage's kill rate, whether or not they have appeared
  get kills() { return this.slots.filter(h => h.target.hp <= 0).length; }      // and each one shot down as a kill

  // Saved games: which helicopters have been shot down. One in the air when the game is saved is not kept: it counts as not yet come, and attacks afresh when the jeep next enters the area.
  snapshot() { return { dead: this.slots.map(h => (h.state === 'dead' || h.state === 'dying') ? 1 : 0) }; }
  restore(d) {
    if (!d) return;
    this.spawned = 0; this.active = null; this.respawnIn = 0;
    this.slots.forEach((h, i) => {
      if (d.dead?.[i]) { h.state = 'dead'; h.obj.visible = false; h.target.hp = 0; h.target.immune = true; this.spawned = Math.max(this.spawned, i + 1); }
      else { h.state = 'parked'; h.obj.visible = true; h.obj.position.set(0, 0, 900 + i * 40); h.target.hp = HP; h.target.immune = true; }
    });
  }

  inZone(p) { const z = this.zone; if (z.r) return Math.hypot(p.x - z.x, p.z - z.z) < z.r; /* (a round zone { x, z, r }: an ambush spot) */ return p.x > z.x0 && p.x < z.x1 && p.z > z.z0 && p.z < z.z1; }

  spawn(player) {
    const h = this.slots[this.spawned++]; this.active = h;
    h.state = 'enter'; h.t = 0; h.target.hp = HP; h.target.immune = false; h.burst = 0; h.phase = 'move';
    const side = Math.random() < .5 ? -1 : 1; // in from over the top of the screen, a little to one side
    h.pos.set(player.position.x + side * (8 + Math.random() * 10), 0, player.position.z - 52); h.vel.set(0, 0, 0); h.yaw = Math.PI; h.alt = ALT + 6;
    h.obj.visible = true; this.pick(h, player);
  }

  // A new firing position: a spot on a ring round the jeep, not too near where it is now, kept inside the helipad area's width
  pick(h, player) {
    for (let k = 0; k < 8; k++) {
      const a = Math.random() * Math.PI * 2, d = RING[0] + Math.random() * (RING[1] - RING[0]), x = player.position.x + Math.cos(a) * d, z = player.position.z + Math.sin(a) * d * .8;
      if (Math.hypot(x - h.pos.x, z - h.pos.z) < 7 && k < 7) continue;
      h.goal.set(this.zone.r ? x : THREE.MathUtils.clamp(x, this.zone.x0 - 4, this.zone.x1 + 4), 0, z); return;
    }
    h.goal.set(player.position.x, 0, player.position.z - 12);
  }

  fly(h, dt, top) { // eases toward the goal at up to `top` m/s (brisk: it brakes and turns hard), the nose toward the jeep, leaning into its acceleration
    const dx = h.goal.x - h.pos.x, dz = h.goal.z - h.pos.z, d = Math.hypot(dx, dz), want = Math.min(top, d * 2.0), k = Math.min(1, dt * 3.3);
    h.vel.x += ((d > .01 ? dx / d * want : 0) - h.vel.x) * k; h.vel.z += ((d > .01 ? dz / d * want : 0) - h.vel.z) * k;
    h.pos.x += h.vel.x * dt; h.pos.z += h.vel.z * dt;
    return d;
  }

  update(dt, world, player, killPlayer, cam) {
    if (!this.slots.length) return;
    const canHit = player.enabled && !player.dead;
    // who is in the air, and who comes next
    if (this.active && this.active.state === 'dead') { this.active = null; this.respawnIn = this.delay; }
    if (!this.active && this.spawned < this.maxHelis && canHit && this.inZone(player.position)) {
      if (this.spawned === 0 || (this.respawnIn -= dt) <= 0) this.spawn(player);
    }
    for (const h of this.slots) {
      if (h.state === 'parked' || h.state === 'dead') continue;
      const o = h.obj; h.t += dt; h.spin += dt * 40;
      if (h.state === 'dying') { this.dying(h, dt); continue; }
      sfx.chopper((this.key ?? 'lightHeli') + h.i, h.pos, 17, false, 1);
      const toJeep = Math.atan2(-(player.position.x - h.pos.x), -(player.position.z - h.pos.z));
      if (h.state === 'enter') {
        const d = this.fly(h, dt, SPEED * 1.1); h.yaw += wrap(toJeep - h.yaw) * Math.min(1, dt * 4);
        h.alt += (ALT - h.alt) * Math.min(1, dt * 1.2);
        if (d < 2.5) { h.state = 'fight'; h.phase = 'aim'; h.t = 0; h.target.immune = false; }
      } else if (h.state === 'fight') {
        h.yaw += wrap(toJeep - h.yaw) * Math.min(1, dt * 5.2); // (it always faces the jeep: it is the nose that shoots)
        if (h.phase === 'move') { // darting to the next position
          if (this.fly(h, dt, SPEED) < 1.8) { h.phase = 'aim'; h.t = 0; }
        } else if (h.phase === 'aim') { // hovering, settling, taking aim
          this.fly(h, dt, SPEED);
          if (h.t >= AIM) { if (canHit) this.burst(h, player); h.phase = 'rest'; h.t = 0; }
        } else if (h.phase === 'rest') { // the recoil, then away
          this.fly(h, dt, SPEED);
          if (h.t >= REST) { this.pick(h, player); h.phase = 'move'; h.t = 0; }
        }
        h.alt += (ALT + Math.sin(h.spin * .05) * .25 - h.alt) * Math.min(1, dt * 2);
      }
      this.pose(h, dt, cam);
    }
  }

  // The burst: five bullets in a fan, each aimed at where the jeep was a moment ago, spread either side of that line
  burst(h, player) {
    const o = h.obj; o.updateMatrixWorld(true);
    const pods = [h.podL, h.podR].map(p => p ? p.getWorldPosition(new THREE.Vector3()) : _m.set(h.pos.x - Math.sin(h.yaw) * 2, o.position.y + .6, h.pos.z - Math.cos(h.yaw) * 2).clone()); // (the bullets leave the two gun pods, alternately)
    const mid = pods[0].clone().add(pods[1]).multiplyScalar(.5), aim = this.enemyFire.aimAgo(.15, _a), base = Math.atan2(aim.z - mid.z, aim.x - mid.x), dist = Math.max(8, Math.hypot(aim.x - mid.x, aim.z - mid.z));
    FAN.forEach((off, i) => this.enemyFire.shoot(pods[i % 2], RANGE, new THREE.Vector3(mid.x + Math.cos(base + off) * dist, 0, mid.z + Math.sin(base + off) * dist)));
    h.kick = 1;
  }

  pose(h, dt, cam) {
    const o = h.obj, ground = this.world.heightAt ? this.world.heightAt(h.pos.x, h.pos.z) : 0;
    const fwd = h.vel.x * -Math.sin(h.yaw) + h.vel.z * -Math.cos(h.yaw), side = h.vel.x * Math.cos(h.yaw) + h.vel.z * -Math.sin(h.yaw);
    h.pitch += (THREE.MathUtils.clamp(fwd * .02, -.34, .34) - h.pitch) * Math.min(1, dt * 5); h.roll += (THREE.MathUtils.clamp(side * .028, -.4, .4) - h.roll) * Math.min(1, dt * 5);
    h.kick = Math.max(0, (h.kick ?? 0) - dt * 4);
    o.position.set(h.pos.x, ground + h.alt, h.pos.z); o.rotation.order = 'YXZ'; o.rotation.set(-h.pitch + h.kick * .06, h.yaw, -h.roll);
    if (h.rotor) h.rotor.rotation.y = h.spin; if (h.tail) h.tail.rotation.x = h.spin * 1.6;
    // the hit box sits where the model is SEEN (the point on the ground on the camera's line of sight to the cabin), as the Hind's
    const c = cam.camera.position, mid = _v.set(o.position.x - Math.sin(h.yaw) * .5, o.position.y + 1.4 * SCALE, o.position.z - Math.cos(h.yaw) * .5), kk = (1 - c.y) / (mid.y - c.y), t = h.target;
    const sn = Math.abs(Math.sin(h.yaw)), cs = Math.abs(Math.cos(h.yaw));
    t.x = c.x + (mid.x - c.x) * kk; t.z = c.z + (mid.z - c.z) * kk; t.hw = cs * HIT_W + sn * HIT_L; t.hd = sn * HIT_W + cs * HIT_L; t.r = Math.max(t.hw, t.hd) - .8;
  }

  // Shot down: it spins, trailing black smoke and fire, and drops
  die(h) {
    if (h.state === 'dying' || h.state === 'dead') return;
    h.target.hp = 0; h.target.immune = true; h.state = 'dying'; h.t = 0; h.spinRate = 6 + Math.random() * 4; h.shed = 0; h.crashed = false;
  }
  dying(h, dt) {
    const o = h.obj, fall = Math.min(1, h.t / FALL), ground = this.world.heightAt ? this.world.heightAt(h.pos.x, h.pos.z) : 0;
    h.yaw += h.spinRate * dt; h.alt = Math.max(0, h.alt - (3 + fall * 14) * dt); h.pos.x += h.vel.x * dt * .6; h.pos.z += h.vel.z * dt * .6; h.vel.multiplyScalar(Math.exp(-dt));
    o.position.set(h.pos.x, ground + h.alt, h.pos.z); o.rotation.set(-.35 * fall, h.yaw, .5 * fall); if (h.rotor) h.rotor.rotation.y = h.spin; if (h.tail) h.tail.rotation.x = h.spin;
    sfx.chopper((this.key ?? 'lightHeli') + h.i, h.pos, 12 + fall * 6, false, .8);
    const at = o.position.clone().add(_v.set(0, 1.2, 0));
    if (Math.random() < dt * 22) this.fx.puff(at, { color: 0x181512, size: .7, grow: 3, life: 1.8, opacity: .6, vel: new THREE.Vector3(r() * .5, 1.2, r() * .5) });
    if (Math.random() < dt * 14) this.fx.puff(at.clone(), { color: Math.random() < .5 ? 0xff8a1e : 0xffd060, size: .5, grow: 2, life: .3, opacity: .85, additive: true, vel: new THREE.Vector3(r() * .6, .8, r() * .6) });
    if ((h.shed -= dt) <= 0) { h.shed = .22; const m = new THREE.Mesh(shardGeometry(.35 + Math.random() * .4, .06, .25 + Math.random() * .3), new THREE.MeshStandardMaterial({ color: Math.random() < .5 ? 0xb39a6f : 0x7a5535, roughness: .6, metalness: .3 }));
      m.castShadow = true; m.position.copy(at); this.scene.add(m); this.debris.launch(m, new THREE.Vector3(r() * 5, 2 + Math.random() * 4, r() * 5), new THREE.Vector3(r() * 9, r() * 9, r() * 9), .05); }
    if (h.alt <= .05 && !h.crashed) { // it hits the ground: the blast, a burst of wreckage, a scorch and a fire; then it is gone
      h.crashed = true; const gp = new THREE.Vector3(h.pos.x, .6, h.pos.z);
      this.fx.explosion(gp, 1.6, true); this.fx.scorch?.(gp, 5); this.fx.smoke?.(gp.clone().setY(1.5), 8);
      for (let i = 0; i < 12; i++) { const m = new THREE.Mesh(shardGeometry(.4 + Math.random() * .5, .07, .3 + Math.random() * .4), new THREE.MeshStandardMaterial({ color: [0xb39a6f, 0x7a5535, 0x26282a][i % 3], roughness: .6, metalness: .3 }));
        m.castShadow = true; m.position.copy(gp); m.position.y = 1; this.scene.add(m); this.debris.launch(m, new THREE.Vector3(r() * 8, 5 + Math.random() * 7, r() * 8), new THREE.Vector3(r() * 10, r() * 10, r() * 10), .05); }
      this.fx.fires?.start([gp.clone().setY(.1)]);
      o.visible = false; h.state = 'dead';
    }
  }
}
