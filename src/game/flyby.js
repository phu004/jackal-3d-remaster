// Evac helicopter (NES): when the jeep gets about a screen and a half from the helipad, a light
// helicopter flies across the screen from the bottom to the top, on its way to the pad. It lands
// in the pad's circle facing north and waits with its rotor turning at flight speed; the jeep's rescued prisoners
// are dropped off to it (see main.js). Then it lifts off and flies away north (depart()).
// Scenery otherwise: it can't be shot and doesn't shoot, but once down the jeep can't drive through it.
import { sfx } from './sfx.js';
import * as THREE from 'three';
import { buildLightHeli } from '../assets/light-heli.js';
import { mergeStatic } from './optimize.js';
import { addToLayer, REFLECT } from './layers.js';

const SCALE = 1.065;      // drawn a bit under real size, like the other vehicles
const TRIGGER = 75;      // the jeep this close (m) south of the helipad sets it off (~1.5 screens)
const ALT = 13, SPEED = 24, SUMMIT_ALT = 11; // (SUMMIT_ALT: the height above the ground it flies at on its way to the secret level's summit pad)
const ROTOR_SPEED = 40, TAIL_SPEED = 210; // rad/s: ~390 rpm main rotor, ~2000 rpm tail rotor (light single-engine helicopter)
const START_BEHIND = 28; // m south of the camera's focus it appears (just below the screen at this height)
const SLOW = 22, DESCEND = 16; // starts slowing / coming down this far (m) from the pad
const LAND_YAW = 0;            // parked facing north
const CIRCLE = new THREE.Vector3(-3.75, 0, 0); // fallback circle centre from the pad's origin, if the world has no helipadCircle
const MAST_BACK = -1.2;        // the mast sits this far north of the circle's centre, so the cabin and boom are centred on it
const BODY = 2.39;             // the fuselage's middle is this far behind the mast (scaled)

const smooth = t => t * t * (3 - 2 * t);

export class Flyby {
  constructor(scene, fx) { this.scene = scene; this.fx = fx; this.state = 'wait'; this.t = 0; }

  // triggerZ: where the helicopter sets off, as a world z the jeep passes going north (a stage's own: `heliTriggerZ`), instead of TRIGGER m south of the pad.
  // exit: which way it leaves, 'north' (straight on, as in stages 1-3) or 'south' (a tall cliff stands north of stage 4's pad: it turns right round and leaves down the middle of the valley).
  setup(world, triggerZ, exit = 'north') {
    this.world = world; this.exit = exit;
    const circle = world.helipadCircle ?? world.helipad?.clone().add(CIRCLE);
    if (circle) this.pad = circle.clone().add(new THREE.Vector3(0, 0, MAST_BACK)); // where the mast comes down
    this.padY = world.summitPad && this.pad ? world.heightAt(this.pad.x, this.pad.z) : 0;
    this.landYaw = world.summitPad ? Math.PI / 2 : LAND_YAW; // (the summit pad: parked facing west, leaving north) // (the secret level's summit pad stands 33 m up: the helicopter arrives, lands and leaves at that height)
    this.trigger = this.pad && triggerZ !== undefined ? triggerZ - this.pad.z : TRIGGER; // (m south of the pad)
    // The helicopter is built now and waits hidden in the scene: building it (and compiling its shaders, glass and all, and again for the firelights) the moment the jeep passes the trigger
    // stalled the game then. The loading screen's compile pass takes in hidden objects too (see Fires.prewarm).
    if (this.pad) { this.spare = this.build(); this.spare.visible = false; this.scene.add(this.spare); }
  }
  hullBox(h, alive) { // the landed helicopter's blocking box: 10 m long, 2.6 m wide, along its heading (north, or west when it is parked on the summit)
    const y = h.rotation.y, sn = Math.sin(y), cs = Math.cos(y);
    return { x: h.position.x + sn * BODY, z: h.position.z + cs * BODY, hw: Math.abs(cs) * 1.3 + Math.abs(sn) * 5, hd: Math.abs(cs) * 5 + Math.abs(sn) * 1.3, alive, kind: 'heli' };
  }
  build() { const h = mergeStatic(buildLightHeli()); h.scale.setScalar(SCALE); addToLayer(h, REFLECT); return h; }
  take() { const h = this.spare ?? this.build(); this.spare = null; if (h.parent) h.parent.remove(h); h.visible = true; return h; } // (the waiting one, or a new one)

  get landed() { return this.state === 'landed'; }
  // how far a point is from the middle of its fuselage (on the ground)
  distanceTo(p) {
    const h = this.heli.position;
    const yaw = this.heli.rotation.y, mx = h.x + Math.sin(yaw) * BODY, mz = h.z + Math.cos(yaw) * BODY;
    return Math.hypot(p.x - mx, p.z - mz);
  }

  // Everyone's aboard (or the jeep has gone on without stopping): lift off and fly away north.
  depart() {
    if (this.state !== 'landed') return;
    this.state = 'depart'; this.t = 0; this.obstacle.alive = false; this.onDepart?.(); // (the secret level: the sea freezes as it lifts off)
  }

  // where passengers from `from` climb in: on the ground by the nearer cabin door
  doorPosition(from) {
    const [l, r] = ['doorL', 'doorR'].map(n => this.heli.getObjectByName(n).getWorldPosition(new THREE.Vector3()).setY(0));
    return l.distanceTo(from) < r.distanceTo(from) ? l : r;
  }

  // Saved games: where the evac helicopter is in its story. On loading, one that was on its way is
  // simply on the pad already; one that has left stays gone.
  snapshot() {
    if (!this.heli || this.state === 'wait' || this.state === 'gone') return { st: this.state };
    const h = this.heli, r = v => Math.round(v * 1000) / 1000;
    return { st: this.state, t: r(this.t), p: [r(h.position.x), r(h.position.y), r(h.position.z)], rot: [r(h.rotation.x), r(h.rotation.y), r(h.rotation.z)] };
  }
  restore(d) {
    const st = typeof d === 'string' ? d : d?.st; // (older saves kept only the state)
    if (!this.pad || !st || st === 'wait') return;
    if (st === 'gone') { this.state = 'gone'; return; }
    const h = this.heli = this.take();
    this.rotor = h.getObjectByName('rotor'); this.tail = h.getObjectByName('tailRotor');
    h.rotation.order = 'YXZ';
    if (d.p) { h.position.set(...d.p); h.rotation.set(...d.rot); this.t = d.t; } // mid-flight, landed or leaving: exactly as it was
    else { h.rotation.set(0, this.landYaw, 0); h.position.copy(this.pad); h.position.y = this.padY; }
    this.scene.add(h); this.state = d.p ? st : 'landed';
    if (this.state === 'landed' || this.state === 'depart') {
      this.obstacle = this.hullBox(h, this.state === 'landed');
      this.world.obstacles.push(this.obstacle);
    }
  }

  update(dt, player, cam) {
    if (!this.pad) return;
    if (this.state === 'wait') {
      const ht = this.world.heliTrigger, near = this.padY ? (ht ? Math.hypot(player.position.x - ht.x, player.position.z - ht.z) < ht.r : Math.hypot(player.position.x - this.pad.x, player.position.z - this.pad.z) < 40 && player.position.y > this.padY - 5) : !(player.position.z - this.pad.z > this.trigger || player.position.z < this.pad.z); // (an ordinary pad: the jeep comes north to it; the summit's: the jeep has reached the level's trigger point (heliTrigger: x, z and a radius), where the mountain road begins: the helicopter flies in)
      if (!player.enabled || !near) return;
      const h = this.heli = this.take();
      this.rotor = h.getObjectByName('rotor'); this.tail = h.getObjectByName('tailRotor');
      if (this.padY) { h.position.set(cam.focus.x + 90, SUMMIT_ALT + this.world.heightAt(cam.focus.x + 90, cam.focus.z - 10), cam.focus.z - 10); this.leg1 = true; this.wpX = this.pad.x + 36; } else h.position.set(cam.focus.x + 5, ALT, cam.focus.z + START_BEHIND); // (the summit: it appears off the screen's north-east corner and flies on toward the pad up on the mountain)
      h.rotation.order = 'YXZ'; h.rotation.set(-.12, this.padY ? Math.PI / 2 : 0, 0); // nose down in forward flight (the summit's approach: already facing west, the way it comes in, so it does not swing round on arrival)
      this.hx = -1; this.hz = 0;
      this.scene.add(h); this.state = 'fly';
    }
    if (this.state === 'wait') return;
    const h = this.heli;
    this.t += dt;
    if (this.state === 'gone') return;
    // the rotor keeps turning at flight speed while it waits on the pad, ready to go (as real ones do)
    sfx.chopper('evac', h.position, 13); // (the rotor turns as fast on the pad as in the air: the same sound throughout) // (the blades' beat, ~390 rpm x 2 blades)
    this.rotor.rotation.y += ROTOR_SPEED * dt;
    this.tail.rotation.x += TAIL_SPEED * dt;
    this.rotor.getObjectByName('disc').material.opacity = 1;
    if (this.state === 'depart') { this.departing(dt, cam); return; }
    if (this.state === 'landed') return;

    // fly toward the pad, slowing and settling onto it, turning to face north over the last stretch
    const dx = this.pad.x - h.position.x, dz = this.pad.z - h.position.z, dist = Math.hypot(dx, dz);
    if (this.leg1 && h.position.x <= this.wpX) this.leg1 = false; // (the summit's approach: first due west, then a turn toward the pad)
    let ax = this.leg1 ? -1 : dx / (dist || 1), az = this.leg1 ? 0 : dz / (dist || 1); // (the way it is heading)
    if (this.padY && this.hx !== undefined) { // (the summit's approach: the heading swings round toward where it wants to go gradually, so the turn from the westward leg onto the pad is one wide, smooth arc, not a corner)
      const k = dist < 16 ? 1 : Math.min(1, dt * 1.1); this.hx += (ax - this.hx) * k; this.hz += (az - this.hz) * k; const hl = Math.hypot(this.hx, this.hz) || 1; this.hx /= hl; this.hz /= hl; ax = this.hx; az = this.hz;
    }
    const speed = SPEED * Math.min(1, .08 + dist / SLOW) * (this.padY && dist > 50 ? 1.215 : 1); // (the summit's long approach is flown faster, until it nears the pad)
    const step = Math.min(dist, speed * dt);
    if (dist > 1e-3) { h.position.x += ax * step; h.position.z += az * step; }
    const low = smooth(Math.min(1, dist / DESCEND));
    { const ty = (this.padY ? this.world.heightAt(h.position.x, h.position.z) : 0) + (this.padY ? SUMMIT_ALT : ALT) * low + Math.sin(this.t * 1.3) * .25 * low; h.position.y = this.padY ? h.position.y + (ty - h.position.y) * Math.min(1, dt * 2.5) : ty; } // (the summit pad: it flies ALT m above the ground under it, rising with the mountain, not at the pad's height from the start)
    const travel = Math.atan2(-ax, -az), want = dist < 12 ? this.landYaw : travel;
    let d = want - h.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d));
    h.rotation.y += d * Math.min(1, dt * (dist < 12 ? 1.5 : 2.5));
    h.rotation.x = -.12 * Math.min(1, speed / SPEED) + .1 * (1 - low) * Math.min(1, dist / 4); // nose down, then a flare to land
    h.rotation.z = -d * .3;                                                                    // banks into turns
    if (low < 1) { // downwash kicking up dust round the pad as it comes down
      const ground = h.position.clone().setY(this.padY);
      this.fx.rotorWash(ground, Math.max(0, 1 - (h.position.y - this.padY) / 11), dt, this.world.tileAt(ground.x, ground.z) === '~');
    }
    if (dist < .05 && h.position.y < this.padY + .02) {
      h.position.y = this.padY; h.rotation.x = 0; h.rotation.z = 0; this.state = 'landed';
      // block the jeep from driving through it (the fuselage runs south from the mast when facing north)
      this.obstacle = this.hullBox(h, true);
      this.world.obstacles.push(this.obstacle);
    }
  }

  // Lift-off: straight up to ~4 m, then nose down and away north, climbing, until well off screen.
  departing(dt, cam) {
    if (this.exit === 'south') { this.departingSouth(dt, cam); return; }
    if (this.exit === 'southwest') { this.departingSouth(dt, cam, Math.PI * 2 / 3); return; } // (heading 8 o'clock: 120 degrees round from north, by way of west)
    const h = this.heli, t = this.t, up = Math.min(1, t / 2.5);
    const speed = SPEED * smooth(Math.min(1, Math.max(0, (t - 1.8) / 3)));
    h.position.y = this.padY + 4 * smooth(up) + Math.max(0, t - 2.5) * 2.5;
    if (this.landYaw) h.rotation.y = this.landYaw * (1 - smooth(Math.min(1, Math.max(0, (t - 1.0) / 3.5)))); // (parked facing west: it swings round to face north as it climbs, then leaves that way)
    h.position.z -= speed * dt;
    h.rotation.x = -.15 * Math.min(1, speed / 6);
    const ground = h.position.clone().setY(this.padY);
    if (h.position.y - this.padY < 11) this.fx.rotorWash(ground, 1 - (h.position.y - this.padY) / 11, dt, this.world.tileAt(ground.x, ground.z) === '~');
    if (h.position.z < cam.focus.z - 70) { this.scene.remove(h); this.state = 'gone'; }
  }

  // Lift-off for a pad with a cliff to its north: straight up, then it swings round 180 degrees on the spot, nose over, and flies south down the middle of the valley, climbing, until off screen.
  departingSouth(dt, cam, turnTo = Math.PI) { // turnTo: the heading it swings round to (PI: due south; 2PI/3: south-west)
    const h = this.heli, t = this.t, up = Math.min(1, t / 2.5);
    // the turn: a long, eased swing (smootherstep: the turn rate rises and falls gently, no jolt at either end) while it is already creeping forward, so it sweeps round in a wide arc instead of spinning on the spot
    const u = Math.min(1, Math.max(0, (t - 1.4) / 4.4)), turn = u * u * u * (u * (u * 6 - 15) + 10), rate = u > 0 && u < 1 ? turnTo * 30 * u * u * (1 - u) * (1 - u) / 4.4 : 0; // (rad/s)
    h.rotation.y = turnTo * turn; // 0 = facing north, PI = facing south
    const speed = SPEED * smooth(Math.min(1, Math.max(0, (t - 2.6) / 4.5)));
    h.position.y = this.padY + 4 * smooth(up) + Math.max(0, t - 3) * 2.3;
    h.position.x += -Math.sin(h.rotation.y) * speed * dt + (this.exit === 'south' ? (0 - h.position.x) * Math.min(1, dt * .3) * Math.min(1, speed / 8) : 0); // (south: drifting toward the middle of the valley as it goes)
    h.position.z += -Math.cos(h.rotation.y) * speed * dt;
    this.roll = (this.roll ?? 0) + (-rate * .17 - (this.roll ?? 0)) * Math.min(1, dt * 2.5); // banks into the turn, easing in and out with it
    this.pitch = (this.pitch ?? 0) + (-.15 * Math.min(1, speed / 6) - (this.pitch ?? 0)) * Math.min(1, dt * 2.5);
    h.rotation.x = this.pitch; h.rotation.z = this.roll;
    const ground = h.position.clone().setY(this.padY);
    if (h.position.y - this.padY < 11) this.fx.rotorWash(ground, 1 - (h.position.y - this.padY) / 11, dt, this.world.tileAt(ground.x, ground.z) === '~');
    if (this.exit === 'south' ? h.position.z > cam.focus.z + 70 : Math.hypot(h.position.x - cam.focus.x, h.position.z - cam.focus.z) > 75) { this.scene.remove(h); this.state = 'gone'; }
  }
}
