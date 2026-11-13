// The secret level's ending: when both walkers are down, a transport flies in from the north-east and lands in the south-east of the boss plateau, nose to the north, ramp (at its tail) open to the south, rotors turning, and waits. The jeep stays in the player's hands. Drive up to it and the ending
// takes the jeep out of their hands: it drives itself up the ramp and into the bay, the ramp shuts, the transport lifts off, swings round and flies away; then done() is called (main.js: the stage-clear screen).
// call() sends for the transport; update(dt) runs every frame after the player's own update (once the jeep is aboard it sets the jeep's place itself). `boarding` is true while the jeep is being carried off (it cannot be hurt then).
import * as THREE from 'three';
import { buildTransport2, RAMP_CLOSED, RAMP_OPEN, RAMP_HINGE, RAMP_LENGTH } from '../assets/transport2.js';
import { addToLayer, REFLECT } from './layers.js';
import { mergedModel } from './optimize.js';
import { sfx } from './sfx.js';

const HELI_SCALE = .8415, ROTOR_SPEED = 23.6, DRIVE_SPEED = 6.5, LEAD_IN = 1, CLOSE_T = 1.2, T = { arrive: 6, touchdown: 7.4, rampDown: 8.6 }, BOARD_R = 8;   // m: the jeep this near the ramp's foot (or the transport's middle) starts the ending
const clamp01 = v => Math.min(1, Math.max(0, v)), smooth = v => { v = clamp01(v); return v * v * (3 - 2 * v); }, lerp = THREE.MathUtils.lerp;

export class PlateauExit {
  constructor(scene, player, fx, world, pad, cam) {
    Object.assign(this, { scene, player, fx, world, pad, cam, state: 'idle', t: 0, active: false, boarding: false, done: false, onDone: null });
  }

  // send for the transport
  call() {
    if (this.state !== 'idle') return;
    const h = this.heli = mergedModel('transport', buildTransport2); h.scale.setScalar(HELI_SCALE); h.rotation.order = 'YXZ'; this.scene.add(addToLayer(h, REFLECT)); h.userData.noWater = true;
    // shadows: the transport casts the sun's shadow (and keeps it however far it flies from the camera: the game switches the shadows of far things off, which took this one away within a second of lift-off; keepShadow exempts it, as the
    // intro's transport is), but not the hut window's spotlight's: its depth material throws away every fragment when the shadow camera sits at that light
    const spot = this.scene.getObjectByName('windowLight'), spotAt = spot ? spot.getWorldPosition(new THREE.Vector3()) : new THREE.Vector3(0, 1e6, 0);
    const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking }); depth.customProgramCacheKey = () => 'transportDepthNoSpot';
    depth.onBeforeCompile = sh => { sh.uniforms.uSpot = { value: spotAt }; sh.fragmentShader = 'uniform vec3 uSpot;' + String.fromCharCode(10) + sh.fragmentShader.replace('void main() {', 'void main() { if ( distance( cameraPosition, uSpot ) < 1.5 ) discard;'); };
    h.traverse(o => { if (o.isMesh) { o.castShadow = o.name !== 'disc'; o.userData.keepShadow = true; if (o.castShadow) o.customDepthMaterial = depth; } });
    this.rotors = [h.getObjectByName('rotorFront'), h.getObjectByName('rotorRear')]; this.ramp = h.getObjectByName('ramp'); this.opening = h.getObjectByName('rampOpening');
    this.base = this.world.heightAt(this.pad.x, this.pad.z); this.state = 'arrive'; this.t = 0; this.active = true; h.position.set(this.pad.x + 16, this.base + 24, this.pad.z - 52); h.visible = true;
  }

  // The jeep's way to the tail ramp, whichever way it comes: a smooth curve from where it stands, round the fuselage by the shorter side if the straight line would run through it (past the nose-side and tail-side corners of a box a little
  // wider than the helicopter), to a point behind the tail, in line with the ramp, and then straight on up it. (A jeep already beside the helicopter first steps out from it.)
  board() {
    const { x, z } = this.pad, p = this.player, o = p.object, B = this.base;
    this.state = 'drive'; this.boarding = true; p.enabled = false; o.visible = true; this.cam.lockTo(new THREE.Vector3(x, B, z + 4), 2.2);
    const hy = RAMP_HINGE.y * HELI_SCALE, hingeZ = z + RAMP_HINGE.z * HELI_SCALE, footZ = hingeZ + Math.cos(RAMP_OPEN) * RAMP_LENGTH * HELI_SCALE, stage = { x, z: footZ + 3.6 };
    const R = { x0: x - 3.6, x1: x + 3.6, z0: z - 9, z1: hingeZ + 1.2 }, M = 1.5;   // (the box the route keeps out of; M: how far outside its corners the route turns)
    const hits = (a, b) => { let t0 = 0, t1 = 1; const dx = b.x - a.x, dz = b.z - a.z;   // (does the segment cross the box?)
      for (const [q, d, lo, hi] of [[a.x, dx, R.x0 + .05, R.x1 - .05], [a.z, dz, R.z0 + .05, R.z1 - .05]]) { if (Math.abs(d) < 1e-6) { if (q < lo || q > hi) return false; } else { let q0 = (lo - q) / d, q1 = (hi - q) / d; if (q0 > q1) [q0, q1] = [q1, q0]; t0 = Math.max(t0, q0); t1 = Math.min(t1, q1); if (t0 > t1) return false; } } return true; };
    let start = { x: o.position.x, z: o.position.z }; const lead = [];
    if (start.x > R.x0 && start.x < R.x1 && start.z > R.z0 && start.z < R.z1) { const ex = start.x < x ? R.x0 - .3 : R.x1 + .3; lead.push({ x: ex, z: THREE.MathUtils.clamp(start.z, R.z0 - 1, R.z1 + 1) }); start = lead[0]; }   // (right beside it: out from its side first)
    let best = null, bestLen = Infinity;
    for (const side of [-1, 1]) {
      const sx = side < 0 ? R.x0 - M : R.x1 + M, nose = { x: sx, z: R.z0 - M }, tail = { x: sx, z: R.z1 + M };
      for (const via of [[], [nose], [tail], [nose, tail]]) {
        const pts = [start, ...via, stage]; let ok = true, len = 0;
        for (let k = 0; k < pts.length - 1; k++) { if (hits(pts[k], pts[k + 1])) { ok = false; break; } len += Math.hypot(pts[k + 1].x - pts[k].x, pts[k + 1].z - pts[k].z); }
        if (ok && len < bestLen) { bestLen = len; best = via; }
      }
    }
    const ground = [new THREE.Vector3(o.position.x, o.position.y, o.position.z), ...lead.map(q => new THREE.Vector3(q.x, B, q.z)), ...(best ?? []).map(q => new THREE.Vector3(q.x, B, q.z)), new THREE.Vector3(stage.x, B, stage.z), new THREE.Vector3(x, B, footZ)];
    this.curve = new THREE.CatmullRomCurve3(ground, false, 'centripetal'); this.curveLen = this.curve.getLength();
    const ramp = [new THREE.Vector3(x, B, footZ), new THREE.Vector3(x, B + hy, hingeZ), new THREE.Vector3(x, B + hy, z + 1.6)];   // (up the tail ramp into the bay)
    this.rampLegs = ramp.slice(1).map((b, i) => b.distanceTo(ramp[i])); this.ramp3 = ramp; this.total = this.curveLen + this.rampLegs.reduce((a, b) => a + b, 0); this.d = 0;
    this.yaw = p.yaw; this.speed = 0; this.driveT = 0;
  }

  update(dt) {
    if (!this.active || this.done) return;
    this.t += dt;
    const t = this.t, h = this.heli, { x: px, z: pz } = this.pad, B = this.base, p = this.player, o = p.object;
    let x = px, y = B, z = pz, yaw = 0, pitch = 0, rampOpen = 0, roll = 0, rotorK = 1;
    if (this.state === 'arrive') {   // in from the north-east: the nose swings round to west as it comes down; the ramp lowers once it is down
      const s = clamp01(t / T.arrive), e = 1 - Math.pow(1 - s, 3);
      x = lerp(px + 16, px, e); z = lerp(pz - 52, pz, e); y = B + (t < T.arrive ? lerp(24, 3, smooth(s)) : lerp(3, 0, smooth((t - T.arrive) / (T.touchdown - T.arrive))));
      yaw = lerp(Math.PI, 0, smooth((s - .25) / .75));   // (it swings round through west to face north)
      pitch = -.12 * (1 - s) + .2 * Math.sin(clamp01((s - .55) / .45) * Math.PI);
      rampOpen = smooth((t - T.touchdown) / (T.rampDown - T.touchdown));
      if (t >= T.rampDown) { this.state = 'wait'; this.waitT = 0; }
    }
    if (this.state === 'wait') {   // down, ramp open, rotors turning: waiting for the jeep
      rampOpen = 1; this.waitT += dt;
      const hingeZ = pz + RAMP_HINGE.z * HELI_SCALE, footZ = hingeZ + Math.cos(RAMP_OPEN) * RAMP_LENGTH * HELI_SCALE;
      if (p.enabled && !p.dead && (Math.hypot(p.position.x - px, p.position.z - footZ) < BOARD_R || Math.hypot(p.position.x - px, p.position.z - pz) < BOARD_R)) this.board();
    }
    if (this.state === 'drive') {
      rampOpen = 1; this.driveT += dt;
      this.speed = Math.min(DRIVE_SPEED, this.speed + dt * DRIVE_SPEED / LEAD_IN); this.d = Math.min(this.total, this.d + this.speed * (this.vk ?? 1) * dt);
      let want, onRamp = false;
      if (this.d < this.curveLen) { const u = this.d / this.curveLen; o.position.copy(this.curve.getPointAt(u)); const tg = this.curve.getTangentAt(u); want = Math.atan2(-tg.x, -tg.z); }
      else { onRamp = true; let left = this.d - this.curveLen, leg = 0; while (leg < this.rampLegs.length - 1 && left > this.rampLegs[leg]) left -= this.rampLegs[leg++];
        const a = this.ramp3[leg], b = this.ramp3[leg + 1], k = this.rampLegs[leg] > 0 ? left / this.rampLegs[leg] : 1; o.position.lerpVectors(a, b, k); want = 0; this.onRampLeg = leg; }
      let dy = want - this.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); const lim = 3.2 * dt; this.yaw += THREE.MathUtils.clamp(dy * Math.min(1, 7 * dt), -lim, lim); this.vk = Math.max(.3, 1 - Math.abs(dy) / 2.2);   // (it turns at a car's pace, and slows while it is still pointing the wrong way)
      o.rotation.order = 'YXZ'; o.rotation.y = p.yaw = this.yaw; o.rotation.x = onRamp && this.onRampLeg === 0 ? Math.abs(RAMP_OPEN) : 0; o.rotation.z = 0;   // (nose up on the ramp)
      o.visible = !(onRamp && this.onRampLeg >= 1 && o.position.z < pz + 2.4);                                  // (hidden only once it is up the ramp and inside the bay: not by where it happens to stand, which hid it at once when it came from the north)
      if (this.d >= this.total) { this.state = 'close'; this.closeT = 0; o.visible = false; }
    } else if (this.state === 'close') {
      rampOpen = 1 - smooth((this.closeT += dt) / CLOSE_T);
      if (this.closeT >= CLOSE_T + .5) { this.state = 'lift'; this.u = 0; this.dep = { x: 0, z: 0, yaw: 0, roll: 0 }; }
    }
    if (this.state === 'lift') {   // straight up, the nose swings round to north-east, then away climbing to the north-east, until it is off the screen
      this.u += dt; const u = this.u, d = this.dep, speed = Math.min(24, Math.max(0, u - 2.2) * 8), prev = d.yaw;
      d.yaw = -(Math.PI / 4) * smooth((u - 2.2) / 2);   // (the nose swings round to the north-east, and away)
      d.x += -Math.sin(d.yaw) * speed * dt; d.z += -Math.cos(d.yaw) * speed * dt; x = px + d.x; z = pz + d.z; yaw = d.yaw;
      d.roll += (THREE.MathUtils.clamp((dt > 0 ? (d.yaw - prev) / dt : 0) * .5, -.6, .6) * clamp01(speed / 6) - d.roll) * Math.min(1, dt * 4); roll = d.roll;
      y = B + 12 * smooth(u / 2.7) + Math.pow(Math.max(0, u - 3), 1.6) * 3; pitch = -.2 * clamp01((u - 2.4) / 1.5);
      if (u > 3 && this.gone === undefined && !this.cam.inPlayWindow(h.position, 1.1)) this.gone = 0;   // (off the screen: the clear screen comes up two seconds later)
      if (this.gone !== undefined) { this.gone += dt; if (this.gone >= 2 && !this.doneCalled) { this.doneCalled = true; this.onDone?.(); } } // (the clear screen comes up two seconds after it has left the screen; the helicopter flies on a while longer, so its shadow is not cut off while it is still on the screen)
      if ((this.gone !== undefined && this.gone >= 7) || u > 20) { this.scene.remove(h); this.done = true; this.active = false; this.boarding = false; if (!this.doneCalled) { this.doneCalled = true; this.onDone?.(); } return; }
    }
    h.position.set(x, y, z); h.rotation.set(pitch, yaw, roll + Math.sin(t * 1.3) * .015 * (y > B + .1 ? 1 : 0));
    this.ramp.rotation.x = lerp(RAMP_CLOSED, RAMP_OPEN, rampOpen); this.opening.visible = rampOpen > .02;
    sfx.chopper('transport', h.position, 11, true);
    this.rotors[0].rotation.y += ROTOR_SPEED * dt * rotorK; this.rotors[1].rotation.y -= ROTOR_SPEED * dt * rotorK;
    this.rotors.forEach(r => { r.getObjectByName('disc').material.opacity = 1; });
    this.fx.rotorWash(new THREE.Vector3(x, B, z), clamp01(1 - (y - B) / 11), dt, false);
  }
}
