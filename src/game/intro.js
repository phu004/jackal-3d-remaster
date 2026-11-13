// Stage-start cutscene: the transport flies in from the north, lands, drops the ramp, the jeep
// rolls out, then the chopper lifts off, banks hard round to the north-west and runs low up the
// coast over the sea (so its reflection shows) before climbing away. Up to lift-off every pose is a pure function of the timeline `t`, so
// skipping just jumps `t` forward; the departure is integrated so it can turn smoothly.
import { sfx } from './sfx.js';
import * as THREE from 'three';
import { buildTransport2 as buildTransport, RAMP_CLOSED, RAMP_OPEN, RAMP_HINGE, RAMP_LENGTH } from '../assets/transport2.js';
import { addToLayer, REFLECT } from './layers.js';
import { mergedModel } from './optimize.js';

const T = { arrive: 6, touchdown: 7.5, rampDown: 8.5, jeepOut: 10.5, rampUp: 11.5, gone: 23 };
const ROTOR_SPEED = 23.6; // rad/s: a Chinook's rotors turn at ~225 rpm
const HELI_SCALE = .8415; // the transport is drawn at 84.2% of the asset's size

const _h = new THREE.Vector3(), _t = new THREE.Vector3(), _o = new THREE.Vector3();
const clamp01 = v => Math.min(1, Math.max(0, v));
const smooth = v => { v = clamp01(v); return v * v * (3 - 2 * v); };
const lerp = THREE.MathUtils.lerp;

export class Intro {
  constructor(scene, player, fx, origin, tileAt = () => '.', { angle = 0, turn = -3 * Math.PI / 4, approach = null, fly = null } = {}) { // angle: the whole scene turned about the landing spot (radians: 0 = in from the north, the jeep out to the north; PI / 4 = in from the north-west, the jeep out to the north-west); turn: how far the nose swings at lift-off
    this.phi = angle; this.phiA = approach ?? angle; // (angle: the way it faces when it lands and the jeep drives out; approach: the direction it comes in from, if that is a different one: it turns to face `angle` just before it lands)
     this.turn = turn; this.scene = scene; this.player = player; this.fx = fx; this.t = 0; this.tileAt = tileAt;
    this.origin = origin.clone(); // landing spot; everything below is relative to it
    // fly: { start: [x, z, alt], over: [x, z, alt], time }: a long flight in before the usual landing run: it comes in from `start`, passes over `over` (the secret level: the island and its power station, so the player sees them first), and
    // goes on down the line to the landing spot; the camera starts on `over`, picks the helicopter up as it passes, and settles on the landing zone (cameraFocus below). The timeline is all pushed back by fly.time.
    this.fly = fly; let tA = 0, dB = 6;
    if (fly) { const cpA = Math.cos(this.phiA), spA = Math.sin(this.phiA); this.curve = new THREE.CatmullRomCurve3([new THREE.Vector3(fly.start[0], fly.start[2], fly.start[1]), new THREE.Vector3(fly.over[0], fly.over[2], fly.over[1]), new THREE.Vector3(origin.x - 75 * spA, 17, origin.z - 75 * cpA)]); this.rest = null; this.camF = new THREE.Vector3(fly.look[0], 0, fly.look[1]);
      const len = this.curve.getLength(); tA = len / fly.speed; dB = 3 * 75 / fly.speed; // (a steady speed the whole way in, and the landing run (the old one: 75 m, slowing smoothly to a stop over it) is stretched so that it begins at that same speed: no jump)
      let best = 1e9, bu = 0; for (let i = 0; i <= 300; i++) { const q = this.curve.getPointAt(i / 300), d = Math.hypot(q.x - fly.over[0], q.z - fly.over[1]); if (d < best) { best = d; bu = i / 300; } }
      this.tOver = bu * tA; // (when it is over the island: the camera takes it up then)
      fly.time = tA;
    }
    const sh = tA + dB - 6; // (everything after the approach is pushed back by this)
    this.T = { arrive: T.arrive + sh, touchdown: T.touchdown + sh, rampDown: T.rampDown + sh, jeepOut: T.jeepOut + sh, rampUp: T.rampUp + sh, gone: T.gone + sh };
    this.heli = mergedModel('transport', buildTransport);
    this.heli.scale.setScalar(HELI_SCALE);
    this.heli.rotation.order = 'YXZ';
    this.heli.rotation.y = Math.PI + this.phi; // nose south, so the ramp faces north (up the screen); turned with the scene
    this.heli.traverse(o => { if (o.isMesh) { o.castShadow = o.name !== 'disc'; o.userData.keepShadow = true; } }); // (but not the rotors' translucent spin discs: they threw a solid disc of shadow) // (the transport always casts its shadow: the far-shadow culling leaves it alone)
    scene.add(addToLayer(this.heli, REFLECT));
    this.rotors = [this.heli.getObjectByName('rotorFront'), this.heli.getObjectByName('rotorRear')];
    this.ramp = this.heli.getObjectByName('ramp');
    this.opening = this.heli.getObjectByName('rampOpening');
    this.done = false;
  }

  get playerReady() { return this.t >= this.T.jeepOut; }

  skip() { if (this.t < this.T.jeepOut) this.t = this.T.jeepOut; }

  // Where the camera looks during the fly-in (writes into `out` and returns true), or false when the camera is the game's own: it starts on the island, takes up the helicopter as it passes over, and has settled on the landing zone by touchdown.
  cameraFocus(out, dt = 0) {
    if (!this.fly || this.done || !this.rest || this.t >= this.T.jeepOut) return false; // (once the jeep is let go the game's own camera takes over and follows it)
    const t = this.t, h = this.heli.position, tl = this.T.arrive - 5, w2 = smooth((t - tl) / (this.T.touchdown - tl)), look = _h.set(this.fly.look[0], 0, this.fly.look[1]);
    // the camera starts on the power station and goes over to the helicopter gradually, over about 4.5 s, beginning before it reaches the island (the weight eases in and out, so there is no moment at which it lurches); after that the helicopter is in the middle of the screen, a little to the east and with room above it, so its tail is not cut off by the top edge; both offsets fade out as the camera settles on the landing zone
    const w1 = smooth((t - (this.tOver - 2.2)) / 4.5);
    _t.set(h.x, 0, h.z).lerp(this.rest, w2).add(_o.set(-8, 0, -7 * (1 - w2)));
    this.camF.copy(look).lerp(_t, w1); out.copy(this.camF); return true;
  }

  // Saved games: where the drop-off is up to (its timeline, and the departure flight so far).
  snapshot() { return this.done ? null : { t: this.t, dep: this.dep ? { ...this.dep } : null, released: !!this.released }; }
  restore(d) {
    this.t = d.t; if (d.dep) this.dep = { ...d.dep };
    if (d.released) { this.released = true; this.player.object.visible = true; this.player.enabled = true; }
    this.update(0);
  }

  // Later stages: no transport, the jeep is already on the ground at the start, ready to go.
  startWithout() {
    this.scene.remove(this.heli); this.done = true; this.released = true; this.t = this.T.gone + 1;
    const o = this.origin;
    this.player.object.position.set(o.x, 0, o.z - 4); this.player.object.rotation.set(0, 0, 0);
    this.player.object.visible = true; this.player.enabled = true;
  }

  update(dt) {
    if (this.done) return;
    this.t += dt;
    const T = this.T, t = this.t, h = this.heli;

    // --- chopper flight path ---
    let x = 0, y = 0, z = 0, pitch = 0, yaw = Math.PI + this.phi, roll = 0; const cp = Math.cos(this.phi), sp = Math.sin(this.phi), rot = (a, b) => [a * cp + b * sp, -a * sp + b * cp], cpA = Math.cos(this.phiA), spA = Math.sin(this.phiA), rotA = (a, b) => [a * cpA + b * spA, -a * spA + b * cpA]; // (rot: an offset in the scene's own frame, turned into the world) // pitch > 0 = nose up; yaw PI = nose south
    let wp = null; // (the fly-in's position in the world, not relative to the landing spot)
    const tA = this.fly ? this.fly.time : 0;
    if (t < tA) {
      const u = clamp01(t / tA), pt = this.curve.getPointAt(u), tg = this.curve.getTangentAt(u), ny = Math.atan2(-tg.x, -tg.z);
      wp = { x: pt.x, z: pt.z }; y = pt.y; pitch = -.12; const py = this.pyaw ?? ny; let dy = ny - py; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); this.pyaw = ny; yaw = ny; roll = THREE.MathUtils.clamp(dt > 0 ? -dy / dt * .6 : 0, -.4, .4);
    } else if (t < T.arrive) {
      const s = (t - tA) / (T.arrive - tA);
      z = lerp(-75, 0, 1 - Math.pow(1 - s, 3));
      y = lerp(this.fly ? 17 : 22, 3, smooth(s)); // (the fly-in comes down the line at 17 m)
      pitch = -.12 * (1 - s) + .2 * Math.sin(clamp01((s - .55) / .45) * Math.PI); // cruise nose-down, flare at the end
      yaw = Math.PI + this.phiA + (this.phi - this.phiA) * smooth((s - .5) / .45); // (nose along the way it is flying; then it swings round to face the way it will land)
    } else if (t < T.rampUp) {
      y = lerp(3, 0, smooth((t - T.arrive) / (T.touchdown - T.arrive)));
    } else {
      // lift off, swing the nose hard round to the north-west (yaw PI/4) while dipping it and
      // accelerating, run low over the sea, then climb away
      const u = t - T.rampUp, d = this.dep ??= { x: 0, z: 0, yaw: Math.PI + this.phi, roll: 0 };
      const prevYaw = d.yaw;
      d.yaw = Math.PI + this.phi + this.turn * smooth((u - 2.2) / 2); // turns once it's up near 12 m
      const speed = Math.min(24, Math.max(0, u - 2.4) * 9);
      d.x += -Math.sin(d.yaw) * speed * dt; d.z += -Math.cos(d.yaw) * speed * dt;
      const turnRate = dt > 0 ? (d.yaw - prevYaw) / dt : 0;
      d.roll += (THREE.MathUtils.clamp(turnRate * .5, -.6, .6) * clamp01(speed / 6) - d.roll) * Math.min(1, dt * 4);
      x = d.x; z = d.z; yaw = d.yaw; roll = d.roll;
      y = 12 * smooth(u / 2.7) + 2 * smooth((u - 2.7) / 2) + Math.pow(Math.max(0, u - 7.8), 1.6) * 3; // straight up to ~12 m, ~14 m over the water, then climb
      pitch = -.2 * clamp01((u - 2.4) / 1.5);
    }
    const o = this.origin; if (t < T.rampUp && !wp) [x, z] = rotA(x, z); // (the approach and the landing turned; the departure is already in world directions)
    h.position.set(wp ? wp.x : o.x + x, y, wp ? wp.z : o.z + z);
    h.rotation.set(pitch, yaw, roll + Math.sin(t * 1.3) * .015 * (y > .1 ? 1 : 0));
    // rotors run at a constant flight speed throughout, on the ground too (as on a real Chinook:
    // lift comes from blade pitch, not rotor speed)
    sfx.chopper('transport', h.position, 11, true, 1, this.fly && t < T.arrive ? 200 : 55); // (the long fly-in over the island: heard from afar, not only once it is near the landing; the rotors turn as fast on the ground as in the air: the same sound throughout)
    this.rotors[0].rotation.y += ROTOR_SPEED * dt;
    this.rotors[1].rotation.y -= ROTOR_SPEED * dt;
    this.rotors.forEach(r => { r.getObjectByName('disc').material.opacity = 1; });

    // rotor downwash: dust clouds, flung dirt and shockwave rings (spray over water), stronger when low
    const ground = new THREE.Vector3(h.position.x, 0, h.position.z);
    this.fx.rotorWash(ground, clamp01(1 - y / 11), dt, this.tileAt(ground.x, ground.z) === '~');

    // --- ramp ---
    const open = t < T.jeepOut ? smooth((t - T.touchdown) / (T.rampDown - T.touchdown))
      : 1 - smooth((t - T.jeepOut) / (T.rampUp - T.jeepOut));
    this.ramp.rotation.x = lerp(RAMP_CLOSED, RAMP_OPEN, open);
    this.opening.visible = open > .02;

    // --- jeep rolls out (world -Z = chopper's local +Z because it's turned around) ---
    if (t < T.jeepOut) {
      this.player.object.visible = t >= T.touchdown; // hidden inside the chopper until it lands
      const jz = lerp(-1, -10, smooth((t - T.rampDown) / (T.jeepOut - T.rampDown)));
      const rampStart = -RAMP_HINGE.z * HELI_SCALE, rampEnd = rampStart - Math.cos(RAMP_OPEN) * RAMP_LENGTH * HELI_SCALE;
      const along = clamp01((rampStart - jz) / (rampStart - rampEnd));
      const hy = RAMP_HINGE.y * HELI_SCALE, jy = jz > rampStart ? hy : lerp(hy, 0, along);
      const [jx2, jz2] = rot(0, jz); this.player.object.position.set(o.x + jx2, jy, o.z + jz2); this.player.object.rotation.y = this.phi; this.player.object.rotation.x = along > 0 && along < 1 ? -RAMP_OPEN : 0;
    } else if (!this.released) { // hand the jeep to the player once
      const [rx, rz] = rot(0, -10); this.player.object.position.set(o.x + rx, 0, o.z + rz); this.player.object.rotation.x = 0; this.player.object.rotation.y = this.phi; this.player.yaw = this.phi;
      this.player.object.visible = true; // also covers skipping the intro while it was still hidden
      this.player.enabled = true;
      this.released = true;
    }

    if (t > T.gone) { this.scene.remove(h); this.done = true; }
  }
}
