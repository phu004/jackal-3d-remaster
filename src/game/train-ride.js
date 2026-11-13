// Stage 4's train (assets/train.js: a locomotive and six flatcars) arriving: it waits out of sight until the jeep drives north past the trigger line (stage.train.triggerZ), then it
// runs in from beyond the map's west edge along the railway (the cars each sit on their two bogies' points of the line, so it follows the bend), up the valley and into the tunnel,
// the wheels turning, each car hidden as it goes fully into the tunnel, and the whole train gone once the last one is inside. The railway gives it its track (world.trainRig:
// trackAt(s) is the point and direction s metres from the line's far end inside the rock, so the train's nose runs from a large s down to the tunnel's portal).
// The jeep is destroyed if it touches any car (unless invulnerable). Every car is a target (the jeep's grenades and rockets, not its bullets): a destroyed car blows apart, and the blast sets
// off the rest in a chain reaction, each a moment after the last, nearest first. The train brakes as it goes, and every piece thrown out keeps the train's velocity at that moment
// (plus the blast's push): the wreckage carries on up the line with the momentum it had, bouncing and sliding to a stop (debris.js).
import * as THREE from 'three';
import { sfx } from './sfx.js';
import { HALF_LEN, HALF_WID } from './player.js';
import { wreckPieces } from '../assets/train.js';
import { mergeStatic } from './optimize.js';

const CRUISE = 20.6, ACCEL = 6.05;      // m/s: its running speed, and how quickly it gets there
const BRAKE = 9;                   // m/s^2: how fast it slows once a car has been destroyed
const FADE = 3.5;                  // s: the sound dies away over this long once the last car has gone into the tunnel (it is still rumbling in there)
const GONE_DEPTH = 4;              // m inside the portal's front plane: a car whose tail is this far in has entered the tunnel (it is dark there) and is hidden
const START_AHEAD = 30;
const CAR_HL = 6.2, CAR_HW = 1.5, PAD = .1; // m: half the length and width of a car's body as the jeep meets it (buffers and the wheels' flanges included), and a little give
const CHAIN_GAP = .32;             // s between one car going up and the next one it sets off
const HP = 4, SCORE = { loco: 1000, container: 500, tank: 700, jeeps: 700 };
const _f = new THREE.Vector3(), _pf = { p: new THREE.Vector3(), t: new THREE.Vector3() }, _pr = { p: new THREE.Vector3(), t: new THREE.Vector3() }; // (scratch: the per-frame placing makes no garbage)
// Do two rectangles on the ground overlap? (a: centre, yaw, half length, half width; yaw as the cars' and the jeep's: the front is (-sin, -cos); separating axis test)
function rectsOverlap(ax, az, ay, ahl, ahw, bx, bz, by, bhl, bhw) {
  const axes = [[-Math.sin(ay), -Math.cos(ay)], [Math.cos(ay), -Math.sin(ay)], [-Math.sin(by), -Math.cos(by)], [Math.cos(by), -Math.sin(by)]], dx = bx - ax, dz = bz - az;
  for (const [ux, uz] of axes) {
    const ra = ahl * Math.abs(ux * -Math.sin(ay) + uz * -Math.cos(ay)) + ahw * Math.abs(ux * Math.cos(ay) + uz * -Math.sin(ay)), rb = bhl * Math.abs(ux * -Math.sin(by) + uz * -Math.cos(by)) + bhw * Math.abs(ux * Math.cos(by) + uz * -Math.sin(by));
    if (Math.abs(dx * ux + dz * uz) > ra + rb) return false;
  }
  return true;
}

export class TrainRide {
  // fx, debris: for the explosions and the wreckage.
  constructor(world, fx, debris) {
    this.world = world; this.fx = fx; this.debris = debris; this.rig = world.trainRig ?? null; this.count = this.rig ? this.rig.train.children.length : 0; this.state = 'wait'; this.speed = 0;
    this.sc = []; this.v = []; this.brake = []; // (per car: where its middle is along the line, how fast it goes, whether it is braking: a train that is hit parts in two)
    this.targets = []; this.dead = []; this.pending = []; this.after = []; this.crashed = false; // (after: effects set to happen a moment later, { t (s left), fn })
  }

  // where each car sits (its middle at distance sc[i] m along the line)
  place() {
    const { train, trackAt, railTop, portalS } = this.rig, { bogie, halfLength } = train.userData;
    train.children.forEach((car, i) => {
      if (this.dead[i]) return;
      const sc = this.sc[i], pf = trackAt(sc - bogie, _pf), pr = trackAt(sc + bogie, _pr);
      car.visible = sc + halfLength > portalS - GONE_DEPTH; // (a car that has gone into the tunnel is not drawn: the tunnel is only cut into the front of the cliff, so it would show running on through the rock)
      car.position.set((pf.p.x + pr.p.x) / 2, (pf.p.y + pr.p.y) / 2 + railTop, (pf.p.z + pr.p.z) / 2);
      _f.copy(pf.p).sub(pr.p).setY(0).normalize(); car.rotation.y = Math.atan2(-_f.x, -_f.z);
      const t = this.targets[i]; if (t) { // (the target follows the car; its box is the rectangle's bounds on the axes)
        const sn = Math.abs(Math.sin(car.rotation.y)), cs = Math.abs(Math.cos(car.rotation.y));
        t.x = car.position.x; t.z = car.position.z; t.hw = CAR_HL * sn + CAR_HW * cs; t.hd = CAR_HL * cs + CAR_HW * sn;
        if (!car.visible) t.hp = 0; // (inside the tunnel: out of reach)
      }
    });
  }

  // Once the train is gone (all inside the tunnel, or wrecked) it takes nothing from the game any more: out of the scene, its geometry freed on the graphics card, nothing of it kept. (Its materials
  // and textures are shared with the wreckage pieces and the asset viewer, so they stay.)
  release() {
    const r = this.rig; if (!r?.train) return;
    r.train.parent?.remove(r.train); // (three r128: no removeFromParent)
    r.train.traverse(o => { if (o.isMesh) o.geometry.dispose(); });
    r.train.clear(); r.train = null; this.wheels = null; this.pending.length = 0; this.sc = []; this.v = []; this.brake = [];
  }

  // every car a target: the jeep's grenades and rockets (4 hp: one grenade) destroy it; its bullets do nothing
  arm() {
    const { train } = this.rig;
    this.targets = train.children.map((car, i) => {
      const kind = train.userData.cars[i].kind, t = { object: car, x: car.position.x, z: car.position.z, hw: CAR_HL, hd: CAR_HL, r: 3.6, hp: HP, score: SCORE[kind] ?? 500, bulletProof: true, die: () => this.destroyCar(i, true) };
      this.world.targets.push(t); return t;
    });
  }
  disarm() { for (const t of this.targets) { const k = this.world.targets.indexOf(t); if (k >= 0) this.world.targets.splice(k, 1); } this.targets = []; }

  // Destroy car i: it blows apart (nothing of it stays), its pieces thrown with the train's own velocity and the blast's push, and the cars behind it still standing are set off one after another (the ones ahead go on).
  destroyCar(i, byJeep = false) {
    if (this.dead[i]) return;
    const { train } = this.rig, car = train.children[i], kind = train.userData.cars[i].kind;
    this.dead[i] = true; car.visible = false; if (this.targets[i]) this.targets[i].hp = 0;
    const at = car.position.clone(), fwd = new THREE.Vector3(-Math.sin(car.rotation.y), 0, -Math.cos(car.rotation.y)), v0 = fwd.clone().multiplyScalar(this.v[i]); // (the momentum: forward, at this car's speed now)
    this.fx.explosion(at.clone().setY(at.y + 1.4), kind === 'loco' ? 2.5 : 2.1, true);
    this.fx.scorch(at, 4); this.fx.smoke(at.clone().setY(at.y + .8), 12);
    this.fx.fires?.start([at.clone().addScaledVector(fwd, 1.5), at.clone().addScaledVector(fwd, -1.8), at.clone()], .9, 30);
    this.drama(at, fwd, v0, kind === 'loco' ? 1.25 : 1);
    this.throwPieces(car, v0, kind, train.userData.cars[i].variant);
    this.crashed = true;
    if (kind === 'loco') sfx.trainStop(); // (the locomotive is gone: the horn and the whole train's noise cut off at once)
    for (let j = i + 1; j < train.children.length; j++) { // the chain reaction, through the cars behind it only, nearest first; the cars ahead are coupled to the locomotive and pull away unharmed
      if (this.dead[j] || !train.children[j].visible) continue;
      this.brake[j] = true; // (the cars behind lose their pull: they slow as the chain reaches them)
      const delay = Math.abs(j - i) * CHAIN_GAP + Math.random() * .12, p = this.pending.find(q => q.j === j);
      if (p) p.t = Math.min(p.t, delay); else this.pending.push({ j, t: delay });
    }
  }

  // The extra drama of a car going up: a blinding flash and a shockwave ring, a rolling fireball column, blasts down the car's length one after another, a spray of burning fragments thrown out
  // and dust kicked out along the ground.
  drama(at, fwd, v0, k) {
    const fx = this.fx, rnd = () => (Math.random() - .5) * 2, V = (x, y, z) => new THREE.Vector3(x, y, z);
    fx.flash?.(at.clone().setY(at.y + 1.6), 2.2 * k);
    fx.puff(at.clone().setY(at.y + .3), { color: 0xffe0a0, size: .8, grow: 9, life: .4, opacity: .5, additive: true, flat: true }); // the shockwave ring's glare
    for (let i = 0; i < 10; i++) { const a = i / 10 * 6.283; fx.puff(at.clone().setY(at.y + .35), { color: 0xb8a078, size: .7, grow: 3.5, life: 1.1, opacity: .5, vel: V(Math.cos(a) * 6.5, .6, Math.sin(a) * 6.5) }); } // dust blown out in a ring
    for (let i = 0; i < 9; i++) fx.puff(at.clone().setY(at.y + 1 + i * .9), { color: i < 4 ? 0xffa030 : 0x3a3430, size: .9 + i * .15, grow: 2.4, life: 1.2 + i * .12, opacity: i < 4 ? .75 : .6, additive: i < 4, vel: V(rnd() * .8, 5 + i * .5, rnd() * .8) }); // the fireball column, ending in black smoke
    for (let i = 0; i < 23 * k; i++) { // burning fragments in the air
      const a = Math.random() * 6.283, v = 3 + Math.random() * 9;
      fx.puff(at.clone().setY(at.y + 1.5), { color: Math.random() < .5 ? 0xffb040 : 0xff6a20, size: .16 + Math.random() * .2, grow: .4, life: .8 + Math.random() * 1, opacity: .95, additive: true, gravity: 12, vel: V(Math.cos(a) * v + v0.x * .5, 7 + Math.random() * 11, Math.sin(a) * v + v0.z * .5) });
    }
    for (const [d, t] of [[-3.2, .12], [3.4, .2], [-1.4, .3], [1.6, .42], [5.2, .55], [-5, .62]]) this.after.push({ t, fn: () => { // secondary blasts, one after another along the car
      const q = at.clone().addScaledVector(fwd, d).setY(at.y + .8 + Math.random() * 1.2); fx.explosion(q, (1.2 + Math.random() * .8) * k);
      for (let n = 0; n < 4; n++) fx.puff(q, { color: 0x2e2a28, size: .8, grow: 3, life: 1.6, opacity: .6, vel: V(rnd() * 1.5, 3 + Math.random() * 3, rnd() * 1.5) });
    } });
  }

  // The pieces of a car (assets/train.js wreckPieces: its own bogies, cab, hood, deck, torn container sheets, the tank's turret and hull), each starting where it was on the car and moving with the
  // train's velocity v0 (momentum), plus a push away from the middle that is less for the heavy ones; a few big pieces rather than a lot of scraps.
  throwPieces(car, v0, kind, variant) {
    const phi = car.rotation.y, c = Math.cos(phi), sn = Math.sin(phi), scene = this.world.scene, rnd = () => (Math.random() - .5) * 2;
    for (const p of wreckPieces(kind, variant)) {
      const o = p.obj, { x, y, z } = p.at, wx = car.position.x + x * c + z * sn, wz = car.position.z - x * sn + z * c;
      if (o.isGroup) { o.traverse(n => { n.name = ''; }); mergeStatic(o); } // (an assembly like a bogie is a few dozen small parts: merged into a few meshes, as it will lie there for good)
      o.position.set(wx, car.position.y + y, wz); o.rotation.set(0, phi + p.rotY, 0); scene.add(o);
      const away = new THREE.Vector3(wx - car.position.x, 0, wz - car.position.z).normalize().multiplyScalar((2.5 + Math.random() * 4) * (1.1 - p.heavy * .6));
      const vel = v0.clone().add(away).setY((3 + Math.random() * 6) * (1.15 - p.heavy * .7)), k = 1.6 - p.heavy;
      this.debris.launch(o, vel, new THREE.Vector3(rnd() * 3 * k, rnd() * 2.4 * k, rnd() * 3 * k), p.rest);
    }
  }

  update(dt, player, onHit) {
    const r = this.rig; if (!r) return;
    for (let i = this.after.length - 1; i >= 0; i--) { const e = this.after[i]; if ((e.t -= dt) <= 0) { this.after.splice(i, 1); e.fn(); } }
    if (this.state === 'fade') { // all of it inside (and the train itself freed): the noise from the tunnel mouth eases away
      this.fade += dt; const k = Math.min(1, this.fade / FADE), level = 1 - k * k * (3 - 2 * k), at = r.trackAt(r.portalS - 3).p;
      sfx.train(at, this.speed / CRUISE, level);
      if (this.fade >= FADE) this.state = 'done';
      return;
    }
    if (!r.train) return; // (no train: it has gone, and nothing of it is left)
    const cars = r.train.children, { pitch, halfLength } = r.train.userData;
    if (this.state === 'wait') {
      if (!player.enabled || player.dead || !(player.position.z < r.triggerZ)) return;
      this.state = 'run'; this.hornedAgain = false; this.crashed = false; this.speed = 0;
      this.sc = cars.map((_, j) => r.trackLength + START_AHEAD + halfLength + j * pitch); this.v = cars.map(() => 0); this.brake = cars.map(() => false); // (the whole train off the end of the line, coupled: all at one speed)
      this.wheels = cars.map(c => { const w = []; c.traverse(o => { if (o.name === 'wheelset') w.push(o); }); return w; });
      r.train.visible = true; this.place(); this.arm(); sfx.trainHorn(cars[0].position); // (the horn at once, from the locomotive)
    }
    if (this.state !== 'run') return;
    this.speed = 0;
    for (let j = 0; j < cars.length; j++) { // (each car on its own: the locomotive and the cars ahead of a hit car carry on at full speed; the cars behind it brake)
      if (this.dead[j]) continue;
      this.v[j] = this.brake[j] ? Math.max(0, this.v[j] - BRAKE * dt) : Math.min(CRUISE, this.v[j] + ACCEL * dt);
      this.sc[j] -= this.v[j] * dt; this.speed = Math.max(this.speed, this.v[j]);
      const spin = this.v[j] / .46 * dt; for (const w of this.wheels[j]) w.rotation.x -= spin; // (rolling: radians per frame at the wheels' radius)
    }
    for (let q = this.pending.length - 1; q >= 0; q--) { // (the chain: each waits its turn)
      const p = this.pending[q]; if ((p.t -= dt) <= 0) { this.pending.splice(q, 1); this.destroyCar(p.j, false); }
    }
    this.place();
    if (onHit && player.enabled && !player.dead && !player.invulnerable) for (let i = 0; i < cars.length; i++) { // (any part of any car that is still on the line)
      const car = cars[i]; if (!this.dead[i] && car.visible && rectsOverlap(car.position.x, car.position.z, car.rotation.y, CAR_HL + PAD, CAR_HW + PAD, player.position.x, player.position.z, player.yaw, HALF_LEN, HALF_WID)) { onHit(); break; }
    }
    let near = null, nd = 1e9; for (let i = 0; i < cars.length; i++) if (!this.dead[i] && cars[i].visible) { const d = Math.hypot(cars[i].position.x - player.position.x, cars[i].position.z - player.position.z); if (d < nd) { nd = d; near = cars[i]; } }
    if (near && !this.dead[0]) sfx.train(near.position, this.speed / CRUISE); // (the sound comes from the nearest car, so it swells as the train passes the jeep)
    if (!this.hornedAgain && !this.crashed && this.sc[0] - halfLength < r.portalS + 40) { this.hornedAgain = true; sfx.trainHorn(cars[0].position); } // (a second blast as it nears the tunnel)
    if (cars.every((c, i) => this.dead[i] || !c.visible)) { // the last car is in the tunnel, or gone
      const some = cars.some((c, i) => !this.dead[i]); // (asked before release() empties the list)
      r.train.visible = false; this.disarm(); this.release();
      if (some) { this.state = 'fade'; this.fade = 0; } else { this.state = 'done'; sfx.trainStop(); } // (some went into the tunnel: its rumble eases away; all wrecked: quiet)
    }
  }

  // For the results screen: the locomotive and carriages count as enemies (all of them, however they were destroyed: shot, or set off in the chain reaction), and a car that got away into the tunnel does not count as a kill.
  get total() { return this.count; }
  get kills() { return this.dead.filter(Boolean).length; }

  // Saved games: not yet arrived, on its way (where each car is, how fast, which are gone, which are about to go in the chain), or gone.
  snapshot() { const r1 = v => Math.round(v * 10) / 10; return { st: this.state, sc: this.sc.map(r1), v: this.v.map(r1), br: this.brake.map(Boolean), dead: this.dead.map(Boolean), crashed: this.crashed, pending: this.pending.map(p => ({ j: p.j, t: Math.round(p.t * 100) / 100 })) }; }
  restore(d) {
    const r = this.rig; if (!r || !d) return;
    this.disarm(); this.pending = []; this.after = []; this.dead = (d.dead ?? []).map(Boolean); this.crashed = !!d.crashed; // (whatever the train is doing now is thrown away)
    this.state = d.st === 'fade' ? 'done' : d.st;
    if (this.state === 'done') { this.release(); return; } // (already gone when this was saved: it is not built into the scene)
    if (!r.train) r.train = r.makeTrain(); // (it had gone since: build it again)
    const cars = r.train.children; cars.forEach(c => { c.visible = true; });
    if (this.state === 'wait') { r.train.visible = false; this.dead = []; this.sc = []; this.v = []; this.brake = []; this.speed = 0; return; }
    r.train.visible = true;
    this.sc = d.sc ?? []; this.v = d.v ?? []; this.brake = d.br ?? cars.map(() => false); this.speed = Math.max(0, ...this.v);
    this.hornedAgain = this.sc[0] - r.train.userData.halfLength < r.portalS + 40;
    this.wheels = cars.map(c => { const w = []; c.traverse(o => { if (o.name === 'wheelset') w.push(o); }); return w; });
    this.arm(); this.dead.forEach((x, i) => { if (x) { cars[i].visible = false; this.targets[i].hp = 0; } });
    this.pending = (d.pending ?? []).map(q => ({ j: q.j, t: q.t })); // (the chain carries on from where it was)
    this.place();
  }
}
