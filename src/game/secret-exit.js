// Stage 5's secret way out: the energy is off and the player has blown the secret gate. The jeep is taken out of their hands; the camera pans to the helipad beyond the gate, the transport flies in from the
// north-east and lands (nose west, its ramp toward the gate), the jeep drives itself in through the broken gate and up the ramp, the ramp shuts, and the transport lifts off and flies away west. Then done() is called
// (main.js: the stage-clear screen). start(cam, done) begins it; update(dt) is called every frame after the player's own update (it sets the jeep's place itself).
import * as THREE from 'three';
import { buildTransport2, RAMP_CLOSED, RAMP_OPEN, RAMP_HINGE, RAMP_LENGTH } from '../assets/transport2.js';
import { addToLayer, REFLECT } from './layers.js';
import { mergedModel } from './optimize.js';
import { sfx } from './sfx.js';

const HELI_SCALE = .8415, ROTOR_SPEED = 23.6, DRIVE_SPEED = 6.5, LEAD_IN = 1, CLOSE_T = 1.2, T = { arrive: 5.5, touchdown: 6.8, rampDown: 7.8 };
const clamp01 = v => Math.min(1, Math.max(0, v)), smooth = v => { v = clamp01(v); return v * v * (3 - 2 * v); }, lerp = THREE.MathUtils.lerp;

export class SecretExit {
  constructor(scene, player, fx, pad, gateX) {
    this.scene = scene; this.player = player; this.fx = fx; this.pad = pad; this.gateX = gateX; this.active = false; this.done = false;
  }

  start(cam, done) {
    if (this.active) return;
    const { x, z } = this.pad, p = this.player, o = p.object;
    this.active = true; this.cam = cam; this.onDone = done; this.t = 0; this.phase = 'arrive'; p.enabled = false;
    cam.lockTo(new THREE.Vector3(x + 18, 0, z - 3), 2.2); // (the camera pans over to the helipad and stays there)
    const h = this.heli = mergedModel('transport', buildTransport2); h.scale.setScalar(HELI_SCALE); h.rotation.order = 'YXZ'; this.scene.add(addToLayer(h, REFLECT)); h.traverse(o => { if (o.isMesh) o.userData.keepShadow = true; }); // (the game switches the shadows of far things off: this one keeps its own however far it flies, as the other transports do)
    this.rotors = [h.getObjectByName('rotorFront'), h.getObjectByName('rotorRear')]; this.ramp = h.getObjectByName('ramp'); this.opening = h.getObjectByName('rampOpening');
    // the jeep's way: from where it is, to the gate, along the pad's middle line to the ramp's foot, up the ramp and into the bay
    const hy = RAMP_HINGE.y * HELI_SCALE, hingeX = x + RAMP_HINGE.z * HELI_SCALE, footX = hingeX + Math.cos(RAMP_OPEN) * RAMP_LENGTH * HELI_SCALE;
    this.way = [new THREE.Vector3(o.position.x, 0, o.position.z), new THREE.Vector3(this.gateX + 3, 0, z), new THREE.Vector3(footX, 0, z), new THREE.Vector3(hingeX, hy, z), new THREE.Vector3(x + 1.6, hy, z)];
    this.legs = this.way.slice(1).map((b, i) => b.distanceTo(this.way[i])); this.total = this.legs.reduce((a, b) => a + b, 0); this.d = 0; this.hy = hy; this.footLeg = 2; // (leg 2 is the ramp)
    this.yaw = p.yaw; this.speed = 0;
  }

  update(dt) {
    if (!this.active || this.done) return;
    this.t += dt;
    const t = this.t, h = this.heli, { x: px, z: pz } = this.pad, p = this.player, o = p.object;
    let x = px, y = 0, z = pz, yaw = Math.PI / 2, pitch = 0, rampOpen = 0, roll = 0;
    if (this.phase === 'arrive') { // in from the north-east: the nose swings round to west as it comes down
      const s = clamp01(t / T.arrive), e = 1 - Math.pow(1 - s, 3);
      x = lerp(px + 16, px, e); z = lerp(pz - 52, pz, e); y = t < T.arrive ? lerp(24, 3, smooth(s)) : lerp(3, 0, smooth((t - T.arrive) / (T.touchdown - T.arrive)));
      yaw = lerp(Math.PI, Math.PI / 2, smooth((s - .25) / .75));
      pitch = -.12 * (1 - s) + .2 * Math.sin(clamp01((s - .55) / .45) * Math.PI);
      rampOpen = smooth((t - T.touchdown) / (T.rampDown - T.touchdown));
      if (t >= T.rampDown) { this.phase = 'drive'; this.driveT = 0; }
    }
    if (this.phase === 'drive') {
      rampOpen = 1; this.driveT += dt;
      this.speed = Math.min(DRIVE_SPEED, this.speed + dt * DRIVE_SPEED / LEAD_IN); this.d = Math.min(this.total, this.d + this.speed * dt);
      let left = this.d, leg = 0; while (leg < this.legs.length - 1 && left > this.legs[leg]) left -= this.legs[leg++];
      const a = this.way[leg], b = this.way[leg + 1], k = this.legs[leg] > 0 ? left / this.legs[leg] : 1;
      o.position.lerpVectors(a, b, k); o.position.y = a.y + (b.y - a.y) * k; // (the drawn ground is flat here)
      const want = Math.atan2(-(b.x - a.x), -(b.z - a.z)); let dy = want - this.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); this.yaw += dy * Math.min(1, 6 * dt);
      o.rotation.y = p.yaw = this.yaw; o.rotation.x = 0; o.rotation.z = leg === this.footLeg ? -RAMP_OPEN : 0; // (nose up on the ramp)
      if (o.position.x < px + 2.4) o.visible = false;                                                      // inside the bay
      if (this.d >= this.total) { this.phase = 'close'; this.closeT = 0; o.visible = false; }
    } else if (this.phase === 'close') {
      this.closeT += dt; rampOpen = 1 - smooth(this.closeT / CLOSE_T);
      if (this.closeT >= CLOSE_T + .5) { this.phase = 'lift'; this.u = 0; this.dep = { x: 0, z: 0, yaw: Math.PI / 2, roll: 0 }; }
    }
    if (this.phase === 'lift') { // straight up, the nose swings round to north-west, then away climbing, until it is off the screen
      this.u += dt; const u = this.u, d = this.dep, speed = Math.min(24, Math.max(0, u - 2.2) * 8), prev = d.yaw;
      d.yaw = Math.PI / 2 - (Math.PI / 4) * smooth((u - 2.2) / 2);
      d.x += -Math.sin(d.yaw) * speed * dt; d.z += -Math.cos(d.yaw) * speed * dt; x = px + d.x; z = pz + d.z; yaw = d.yaw;
      d.roll += (THREE.MathUtils.clamp((dt > 0 ? (d.yaw - prev) / dt : 0) * .5, -.6, .6) * clamp01(speed / 6) - d.roll) * Math.min(1, dt * 4); roll = d.roll;
      y = 12 * smooth(u / 2.7) + Math.pow(Math.max(0, u - 3), 1.6) * 3; pitch = -.2 * clamp01((u - 2.4) / 1.5);
      if (u > 3 && !this.gone && !this.cam.inPlayWindow(h.position, 1.1)) this.gone = 0; // (off the screen: the stage-clear screen comes up two seconds later)
      if (this.gone !== undefined && this.gone !== null) { this.gone += dt; if (this.gone >= 2 && !this.doneCalled) { this.doneCalled = true; this.onDone?.(); } } // (two seconds after it has left the screen the clear screen comes up; the helicopter flies on a while longer, so its shadow is not cut off while it is still on the screen)
      if ((this.gone !== undefined && this.gone !== null && this.gone >= 7) || u > 20) { this.scene.remove(h); this.done = true; this.active = false; if (!this.doneCalled) { this.doneCalled = true; this.onDone?.(); } return; }
    }
    h.position.set(x, y, z); h.rotation.set(pitch, yaw, roll + Math.sin(t * 1.3) * .015 * (y > .1 ? 1 : 0));
    this.ramp.rotation.x = lerp(RAMP_CLOSED, RAMP_OPEN, rampOpen); this.opening.visible = rampOpen > .02;
    sfx.chopper('transport', h.position, 11, true);
    this.rotors[0].rotation.y += ROTOR_SPEED * dt; this.rotors[1].rotation.y -= ROTOR_SPEED * dt;
    this.rotors.forEach(r => { r.getObjectByName('disc').material.opacity = 1; });
    this.fx.rotorWash(new THREE.Vector3(x, 0, z), clamp01(1 - y / 11), dt, false);
  }
}
