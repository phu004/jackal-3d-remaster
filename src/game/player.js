import { sfx } from './sfx.js';
import * as THREE from 'three';
import { buildJeep } from '../assets/jeep.js';
import { wetten, wetSlide } from './wet-look.js';
import { LEVEL } from './world.js';
import { addToLayer, REFLECT, SHADOW_ONLY } from './layers.js';
import { mergeStatic, dropTinyShadows, oneShadow, shadowTwin } from './optimize.js';

const SPEED = 9.9, TURN_RATE = 13, WHEEL_R = .42;
export const JEEP_SCALE = .81;                                  // model drawn at 81% of the asset's size
export const HALF_LEN = 2.05 * JEEP_SCALE, HALF_WID = 1.15 * JEEP_SCALE; // footprint for collision and hits (~3.3 x 1.9 m)
const GUN_TURN = 12, GUN_HOLD = .35; // gun swivel speed; seconds it stays aimed north after the last shot

export class Player {
  constructor(scene, opts = {}) {
    this.object = mergeStatic(buildJeep());
    // (stage 6 used to give the jeep the rain-soaked clearcoat look, wet-look.js: the improvement could not be seen and it cost a clearcoat shader, so the jeep is built as on every other stage; opts.wet is kept for what else might use it)
    // if (opts.wet) { wetten(this.object, opts.envMap); this.wet = true; }
    this.object.scale.setScalar(JEEP_SCALE);
    dropTinyShadows(this.object);
    this.object.rotation.order = 'YXZ';
    scene.add(addToLayer(this.object, REFLECT));
    // The shadow pass: each wheel casts only its tyre, the gun only its bigger pieces, and the body's static pieces are one mesh that casts the shadow (~20 draw calls fewer; made after the reflection layer so the twin stays out of it)
    for (const n of ['wheelFL', 'wheelFR', 'wheelRL', 'wheelRR']) oneShadow(this.object.getObjectByName(n));
    dropTinyShadows(this.object.getObjectByName('gun'), .8);
    shadowTwin(this.object, SHADOW_ONLY);
    this.wheels = ['wheelFL', 'wheelFR', 'wheelRL', 'wheelRR'].map(n => this.object.getObjectByName(n));
    this.gun = this.object.getObjectByName('gun');
    this.gunRest = this.gun.position.clone();
    this.kick = 0; // recoil, pushed back along the barrel
    this.enabled = false;
    this.yaw = 0; // 0 = facing north (-Z)
    this.last = this.object.position.clone();
    this.sinceShot = 99;
    this.dead = false;
    this.invuln = 0; // seconds of blinking invulnerability left after a respawn
  }

  get invulnerable() { return this.invuln > 0; }
  die() { this.dead = true; this.object.visible = false; sfx.engine(0, false); }
  respawn(x, z) {
    this.dead = false; this.invuln = 3; // seconds of blinking invulnerability
    this.object.position.set(x, 0, z); this.last.copy(this.object.position);
    this.yaw = 0; this.object.rotation.set(0, 0, 0); this.gun.rotation.y = 0;
  }

  get position() { return this.object.position; }

  // Driving: dust thrown up behind the rear wheels, more the faster it goes. (Needs this.fx, set by the game.)
  kickUp(speed, dt) {
    const f = Math.min(1, speed / SPEED), back = this.facing().negate(), side = new THREE.Vector3(-back.z, 0, back.x), p = this.position;
    const j = () => (Math.random() - .5);
    this.dustIn = (this.dustIn ?? 0) - dt;
    if (f > .25 && this.dustIn <= 0) {
      this.dustIn = .02;
      for (const s of [-1, 1]) {
        const at = p.clone().addScaledVector(back, HALF_LEN - .2).addScaledVector(side, s * HALF_WID * .75).setY(.25);
        this.fx.puff(at, { color: 0xb07a48, size: .09 + .05 * f, grow: 1.6 + .8 * f, life: .3 + .2 * f, opacity: .35 + .2 * f, // short, dense trail
          vel: back.clone().multiplyScalar(.6 + .9 * f).add(new THREE.Vector3(j() * .3, .3 + Math.random() * .3, j() * .3)) });
      }
    }
  }

  // Driving through a puddle: a pale spray and mist thrown up behind the rear wheels and drifting off, instead of dust; thicker and longer-lived than the dust, more the faster it goes.
  spray(speed, dt) {
    const f = Math.min(1, speed / SPEED), back = this.facing().negate(), side = new THREE.Vector3(-back.z, 0, back.x), p = this.position;
    const j = () => (Math.random() - .5);
    this.sprayIn = (this.sprayIn ?? 0) - dt;
    if (f > .12 && this.sprayIn <= 0) {
      this.sprayIn = .035;
      for (const s of [-1, 1]) {
        const at = p.clone().addScaledVector(back, HALF_LEN - .1).addScaledVector(side, s * HALF_WID * .75).setY(.2);
        this.fx.puff(at, { color: 0xd4dde6, size: .14 + .1 * f, grow: 2.4 + 1.4 * f, life: .55 + .5 * f, opacity: .3 + .22 * f,
          vel: back.clone().multiplyScalar(.5 + 1.1 * f).add(new THREE.Vector3(j() * .5, .6 + Math.random() * .7 * (.5 + f), j() * .5)) });
      }
    }
  }

  // Driving through the swamp: rings spreading from the wheels over the surface, and murky water thrown up and falling back, instead of dust.
  wade(speed, dt, world) {
    const f = Math.min(1, speed / SPEED), back = this.facing().negate(), side = new THREE.Vector3(-back.z, 0, back.x), p = this.position;
    if (f < .08) { // standing still: the engine's vibration still shakes the water, a faint ring now and then from one wheel or another
      if ((this.idleRing = (this.idleRing ?? 0) - dt) <= 0) { this.idleRing = .5 + Math.random() * .5; world.ripple(p.clone().addScaledVector(back, (Math.random() - .5) * HALF_LEN * 1.6).addScaledVector(side, (Math.random() < .5 ? -1 : 1) * HALF_WID * .8), .3); }
      return;
    }
    this.wadeIn = (this.wadeIn ?? 0) - dt;
    if (this.wadeIn <= 0) {
      this.wadeIn = .11;
      const ahead = back.clone().negate(); // (the rings are only their forward halves: a wake has no back half)
      for (const s of [-1, 1]) world.ripple(p.clone().addScaledVector(back, HALF_LEN * .4).addScaledVector(side, s * HALF_WID * .8), .65 + .75 * f, ahead);
      world.ripple(p.clone().addScaledVector(back, HALF_LEN), .8 + .65 * f, ahead); // (the wake behind)
    }
    this.dustIn = (this.dustIn ?? 0) - dt;
    if (this.dustIn <= 0) {
      this.dustIn = .03;
      for (const s of [-1, 1]) {
        const at = p.clone().addScaledVector(back, HALF_LEN - .3).addScaledVector(side, s * HALF_WID * .8).setY(.15);
        this.fx.puff(at, { color: 0x4d5a30, size: .08 + .05 * f, grow: 1.2, life: .45, opacity: .6, gravity: 9,
          vel: back.clone().multiplyScalar(.4 + .6 * f).add(new THREE.Vector3((Math.random() - .5) * .8, 1.6 + Math.random() * 1.6, (Math.random() - .5) * .8)) });
      }
    }
  }

  alignTo(yaw) { this.alignYaw = yaw; this.alignT = .3; } // (called when aim assist turns a shot: see weapons.js)
    facing() { return new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)); }
  // Where bullets start: the gun's pivot plus the barrel length, pointing north. Independent of
  // where the gun is currently turned, so the first shot is right even mid-swivel.
  muzzlePosition() { return this.gun.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, .02, -1.3 * JEEP_SCALE)); }
  recoil() { this.sinceShot = 0; this.kick = .18; }

  update(dt, input, bounds, world) {
    const p = this.object.position;
    if (this.wet) wetSlide.value.set(p.x * .05 + this.yaw * .45, p.z * .05); // (the wet paint's mirrored sky slides as the jeep drives and turns, see wet-look.js)
    if (this.dead) return;
    if (this.invuln > 0) { // blink while invulnerable
      this.invuln -= dt;
      this.object.visible = this.invuln <= 0 || Math.floor(this.invuln * 10) % 2 === 0;
    }
    if (this.enabled) {
      const a = input.axis();
      if (a.x || a.z) {
        const len = Math.hypot(a.x, a.z);
        // turn smoothly toward the stick direction (the short way round). If swinging round would
        // push a corner of the jeep into something, nudge the jeep up to 45 cm clear to make room;
        // only if that fails does it keep its heading.
        const target = Math.atan2(-a.x, -a.z);
        let d = target - this.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
        const yaw = this.yaw + d * Math.min(1, TURN_RATE * dt);
        const fits = (x, z) => (world.xOk ? world.xOk(x, z) : Math.abs(x) <= LEVEL.halfWidth - LEVEL.edgeMargin) && z <= bounds.south && z >= bounds.north
          && !world.blockedRect(x, z, yaw, HALF_LEN, HALF_WID, true);
        if (fits(p.x, p.z)) this.yaw = yaw;
        else {
          search: for (const r of [.15, .3, .45]) for (let i = 0; i < 8; i++) {
            const nx = p.x + Math.cos(i * Math.PI / 4) * r, nz = p.z + Math.sin(i * Math.PI / 4) * r;
            if (fits(nx, nz)) { p.x = nx; p.z = nz; this.yaw = yaw; break search; }
          }
        }
        // NES rule: if the move would hit anything (terrain, objects or the map edge), the jeep
        // doesn't move at all, so there's no sliding along walls or edges
        const k = world?.speedAt ? world.speedAt(p.x, p.z) : 1, nx = p.x + a.x / len * SPEED * k * dt, nz = p.z + a.z / len * SPEED * k * dt; // (k: half speed in stage 4's swamp)
        const inside = (world?.xOk ? world.xOk(nx, nz) : Math.abs(nx) <= LEVEL.halfWidth - LEVEL.edgeMargin) && nz <= bounds.south && nz >= bounds.north;
        if (inside && !world.blockedRect(nx, nz, this.yaw, HALF_LEN, HALF_WID, true)) { p.x = nx; p.z = nz; }
      }
      if (this.alignT > 0) { // aim assist bent a shot: the jeep swings round to face the way it went (if there is room to turn)
        this.alignT -= dt;
        let d = this.alignYaw - this.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
        const yaw = this.yaw + d * Math.min(1, TURN_RATE * dt);
        if (world && !world.blockedRect(p.x, p.z, yaw, HALF_LEN, HALF_WID, true)) this.yaw = yaw;
      }
      this.object.rotation.y = this.yaw;
    }
    const mk = world?.mudK?.(p.x, p.z) ?? 0; // how deep in stage 4's mud it is (0 on the bank)
    { const cv = world?.conveyorAt?.(p.x, p.z) ?? 0; // (stage 6's conveyor belts carry the jeep south; the side rails keep it on)
      if (cv) { const nz = p.z + cv * dt; if (!world.blockedRect(p.x, nz, this.yaw, HALF_LEN, HALF_WID, true)) p.z = nz; } }
    const gy = (x, z) => { const h = world.heightAt(x, z); return world.seaFrozen && h < 0 ? 0 : h; }; // (a frozen sea: the jeep rides on the ice, at the water's level, not on the sea bed under it)
    p.y = (world?.heightAt ? gy(p.x, p.z) : 0) - .2 * mk; // on the drawn ground (stage 2's terraces and ramps are raised); in the mud it sinks a little more still
    this.mudRock = (this.mudRock ?? 0) + (mk - (this.mudRock ?? 0)) * Math.min(1, dt * 4);
    this.object.rotation.x = Math.sin(performance.now() * .0017) * .014 * this.mudRock; this.object.rotation.z = Math.sin(performance.now() * .0021 + 1) * .02 * this.mudRock; // (and wallows: a slow rock, easing in and out)
    const LEAN = world?.snowBumps ? 1 : (world?.leanSlopes ?? 0); // (the secret level's slopes at full strength; stage 2's stairs: a lighter lean, its `leanSlopes`)
    if (LEAN && world.heightAt) { // the secret level's slopes: the jeep leans to the ground under it, nose up on a climb and down on a descent, and rolls across a camber; its position is left alone
      const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw), rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw), L = 1.5, Wd = .85, hF = gy(p.x + fx * L, p.z + fz * L), hB = gy(p.x - fx * L, p.z - fz * L), hR = gy(p.x + rx * Wd, p.z + rz * Wd), hL = gy(p.x - rx * Wd, p.z - rz * Wd);
      const tp = Math.max(-.7, Math.min(.7, Math.atan2(hF - hB, 2 * L))), tr = Math.max(-.5, Math.min(.5, Math.atan2(hR - hL, 2 * Wd))), k = this.slopeP === undefined ? 1 : Math.min(1, dt * 9);
      this.slopeP = (this.slopeP ?? 0) + (tp - (this.slopeP ?? 0)) * k; this.slopeR = (this.slopeR ?? 0) + (tr - (this.slopeR ?? 0)) * k;
      this.object.rotation.order = 'YXZ'; this.object.rotation.x += this.slopeP * LEAN; this.object.rotation.z += this.slopeR * LEAN; // (the lean only: the jeep's position, its height included, is as it was)
    }
    if (world?.snowBumps) { // the snow is uneven: the jeep pitches, rolls and bobs a little over it, more the faster it goes. The bumps belong to the ground (a function of where it is), so the same stretch always shakes it the same way.
      const sp = Math.min(1, Math.hypot(p.x - this.last.x, p.z - this.last.z) / Math.max(dt, 1e-4) / SPEED), bump = (x, z) => Math.sin(x * 1.9 + z * 1.3) * .5 + Math.sin(x * 4.1 - z * 3.3 + 1.7) * .3 + Math.sin(x * 8.7 + z * 7.1 + 4) * .2;
      const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw), sx = fz, sz = -fx, L = 1.1, h0 = bump(p.x, p.z);
      const pitch = (bump(p.x + fx * L, p.z + fz * L) - bump(p.x - fx * L, p.z - fz * L)) * .5, roll = (bump(p.x + sx * L * .6, p.z + sz * L * .6) - bump(p.x - sx * L * .6, p.z - sz * L * .6)) * .5;
      this.object.rotation.order = 'YXZ'; this.bumpK = (this.bumpK ?? 0) + (sp - (this.bumpK ?? 0)) * Math.min(1, dt * 6);
      this.object.rotation.x += -pitch * .05 * this.bumpK; this.object.rotation.z += roll * .06 * this.bumpK; p.y += h0 * .035 * this.bumpK;
    }
    // wheels roll by distance travelled (works during the scripted intro too)
    const dist = Math.hypot(p.x - this.last.x, p.z - this.last.z);
    const swamp = !!world?.swampAt?.(p.x, p.z);
    if (this.fx && this.object.visible) { if (swamp) this.wade(dist / Math.max(dt, 1e-4), dt, world); else if (!this.inPuddle) this.kickUp(dist / Math.max(dt, 1e-4), dt); } // (in standing water it throws nothing: no dust, no spray)
    this.wheels.forEach(w => { w.rotation.x -= dist / WHEEL_R; });
    sfx.engine(Math.min(1, dist / Math.max(dt, 1e-4) / SPEED), dist > 1e-3); // the engine hum: only while it moves, faster the quicker it goes
    this.last.copy(p);
    // gun swivels to face north (where it fires) while shooting, then back to the jeep's heading
    this.sinceShot += dt;
    const aiming = this.enabled && (input.held('gun') || this.sinceShot < GUN_HOLD);
    let gd = (aiming ? -this.yaw : 0) - this.gun.rotation.y; gd = Math.atan2(Math.sin(gd), Math.cos(gd));
    this.gun.rotation.y += gd * Math.min(1, GUN_TURN * dt);
    this.kick *= Math.max(0, 1 - dt * 20);
    const ry = this.gun.rotation.y;
    this.gun.position.set(this.gunRest.x + Math.sin(ry) * this.kick, this.gunRest.y, this.gunRest.z + Math.cos(ry) * this.kick);
  }
}
