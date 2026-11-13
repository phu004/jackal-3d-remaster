// Armoured personnel carriers (stage 3). One waits behind the laser maze; when the jeep gets to the maze's east
// turn (the trigger spot in the level data) it drives to the helipad's apron and stops at the STOP sign, lowers its
// rear ramp and lets out its crew of foot soldiers one by one (they hunt the jeep like any other). Then it sits there:
// a solid obstacle (four bullets, or a grenade or rocket, blow it to pieces) that counts toward the kills.
import * as THREE from 'three';
import { shardGeometry } from './debris.js';
import { buildApc, poseApc } from '../assets/apc.js';
import { addToLayer, REFLECT } from './layers.js';
import { Tanks } from './tanks.js';
import { mergeStatic, dropTinyShadows } from './optimize.js';

let planner = null; // (the tanks' route planner, borrowed: a Tanks-shaped object with only the world, so the planner's own cache of map cells (navCls) lives on it)

const HL = 2.4, HW = 1.35;            // half length / width of the hull (m)
const SPEED = 5, TURN = .9;           // m/s, rad/s
const REPLAN = .8, STUCK = 1.2, ARRIVE = 1.2; // s between route plans; s without headway before it plans afresh; m from the stop at which it has arrived
const DOOR_TIME = 1.1;               // s: the personnel door in the rear ramp swings open (the ramp itself stays up)
const CREW_EVERY = 1.3;               // s between one soldier stepping out and the next
const HP = 4, SCORE = 1000;           // four machine-gun bullets, or one grenade, blow it apart

// The model's materials are shared (and some meshes carry several): tone them down once for the game's lighting (the tan hull
// was glaring), and give a wreck its own scorched copies.
const eachMat = (obj, fn) => obj.traverse(m => { if (m.isMesh) m.material = Array.isArray(m.material) ? m.material.map(fn) : fn(m.material); });
// The carrier with its ~110 static pieces merged into a handful of meshes (the named hull, ramp, door and cupola stay apart). Checked
// against the unmerged model: if the merge comes out empty or a different size, the plain model is used and a warning logged.
function mergedApc() {
  const plain = buildApc(); tone(plain);
  const probe = plain.clone(true), want = new THREE.Box3().setFromObject(plain);
  try {
    mergeStatic(probe);
    const got = new THREE.Box3().setFromObject(probe), a = want.getSize(new THREE.Vector3()), b = got.getSize(new THREE.Vector3());
    let meshes = 0; probe.traverse(m => { if (m.isMesh) meshes++; });
    if (meshes && b.x > 0 && Math.abs(a.x - b.x) < .1 && Math.abs(a.y - b.y) < .1 && Math.abs(a.z - b.z) < .1) return probe;
    console.warn('APC merge rejected: size before', a.toArray(), 'after', b.toArray(), 'meshes', meshes);
  } catch (e) { console.warn('APC merge failed:', e); }
  return plain;
}
function tone(obj) {
  eachMat(obj, mat => {
    if (!mat.userData.toned) { mat.userData.toned = true; mat.envMapIntensity = .3; mat.color?.multiplyScalar(.82); }
    return mat;
  });
}

export class Apcs {
  constructor(scene, fx, debris, soldiers) { this.scene = scene; this.fx = fx; this.debris = debris; this.soldiers = soldiers; this.list = []; }

  // The number of soldiers the stage's carriers hold in all (for the stage's kill rate), and those lost with a carrier wrecked before it unloaded.
  get crewTotal() { return this.list.reduce((n, a) => n + a.crew, 0); }
  get crewLost() { return this.list.reduce((n, a) => n + a.lost, 0); }

  setup(world, specs = []) {
    this.world = world;
    for (const spec of specs) {
      const obj = mergedApc(); dropTinyShadows(obj, .85); obj.position.set(spec.x, 0, spec.z); obj.rotation.y = spec.yaw ?? spec.stop.yaw;
      this.scene.add(addToLayer(obj, REFLECT));
      const a = { spec, obj, crew: spec.crew ?? 7, out: 0, lost: 0, state: 'wait', ramp: 0, door: 0, path: null, planIn: 0, stuckFor: 0, crewIn: 0, t: 0 };
      a.ob = { x: spec.x, z: spec.z, hw: HW, hd: HL, alive: true, kind: 'apc', isTarget: true };
      world.obstacles.push(a.ob);
      a.target = { object: obj, x: spec.x, z: spec.z, hw: HW, hd: HL, r: HL, hp: HP, score: SCORE, obstacle: a.ob, wreck: () => this.wreckIt(a) };
      world.targets.push(a.target);
      world.turrets.push({ top: new THREE.Group(), base: obj, target: a.target, range: 0 }); // (counts toward the kill rate; it never fires)
      this.list.push(a);
    }
  }

  update(dt, world, player) {
    const canGo = player.enabled && !player.dead;
    for (const a of this.list) {
      const o = a.obj, p = o.position, { stop, trigger } = a.spec;
      if (a.state === 'dead') continue;
      if (a.state === 'wait') {
        if (canGo && Math.hypot(player.position.x - trigger.x, player.position.z - trigger.z) < trigger.r) a.state = 'drive';
      } else if (a.state === 'drive') {
        const goal = _g.set(stop.x, 0, stop.z);
        if (p.distanceTo(goal) < ARRIVE) a.state = 'park';
        else { a.ob.alive = false; this.drive(a, dt, goal, player); a.ob.alive = true; } // (its own solid box mustn't block it)
      } else if (a.state === 'park') { // onto the spot, round to the way it should face
        p.x += (stop.x - p.x) * Math.min(1, dt * 2); p.z += (stop.z - p.z) * Math.min(1, dt * 2);
        let err = stop.yaw - o.rotation.y; err = Math.atan2(Math.sin(err), Math.cos(err));
        o.rotation.y += Math.sign(err) * Math.min(Math.abs(err), TURN * dt);
        if (Math.abs(err) < .02 && p.distanceTo(_g.set(stop.x, 0, stop.z)) < .15) { a.state = 'unload'; a.t = 0; }
      } else if (a.state === 'unload') {
        a.t += dt;
        a.door = Math.min(1, a.t / DOOR_TIME);
        poseApc(o, 0, a.door);
        if (a.door >= 1 && a.out < a.crew && (a.crewIn -= dt) <= 0) { a.crewIn = CREW_EVERY; this.letOut(a, world); }
        if (a.out >= a.crew) a.state = 'idle';
      }
      this.sync(a);
    }
  }

  // Drive along a planned route round whatever is in the way, easing the speed down with the turn.
  drive(a, dt, goal, player) {
    const o = a.obj, p = o.position, w = this.world;
    if (!a.path || (a.planIn -= dt) <= 0) { a.path = (planner ??= Object.assign(Object.create(Tanks.prototype), { world: w })).plan({ obj: o, hl: HL, hw: HW }, goal); a.planIn = REPLAN; }
    while (a.path && a.path.length > 1 && Math.hypot(a.path[0].x - p.x, a.path[0].z - p.z) < 2.5) a.path.shift();
    const aim = a.path ? a.path[Math.min(a.path.length - 1, 1)] : goal;
    const want = Math.atan2(-(aim.x - p.x), -(aim.z - p.z));
    let err = want - o.rotation.y; err = Math.atan2(Math.sin(err), Math.cos(err));
    const yaw = o.rotation.y + Math.sign(err) * Math.min(Math.abs(err), TURN * dt);
    if (!w.blockedRect(p.x, p.z, yaw, HL - .2, HW - .2, false, true)) o.rotation.y = yaw;
    err = want - o.rotation.y; err = Math.atan2(Math.sin(err), Math.cos(err));
    let moved = false;
    if (Math.abs(err) < .6) {
      const step = SPEED * (w.speedAt?.(p.x, p.z) ?? 1) * dt * (1 - Math.abs(err) / .6 * .6), nx = p.x - Math.sin(o.rotation.y) * step, nz = p.z - Math.cos(o.rotation.y) * step;
      const jeepAhead = Math.hypot(player.position.x - nx, player.position.z - nz) < HL + 2.2; // (waits for the jeep to move out of its way)
      if (!jeepAhead && !w.blockedRect(nx, nz, o.rotation.y, HL - .2, HW - .2, false, true)) { p.x = nx; p.z = nz; moved = true; if (w.swampAt?.(p.x, p.z) && (a.wadeIn = (a.wadeIn ?? 0) - dt) <= 0) { a.wadeIn = .16; w.ripple(p, 1.25, { x: -Math.sin(o.rotation.y), z: -Math.cos(o.rotation.y) }); } }
    }
    if (!moved && w.swampAt?.(p.x, p.z) && (a.idleRing = (a.idleRing ?? Math.random()) - dt) <= 0) { a.idleRing = .55 + Math.random() * .5; w.ripple({ x: p.x + (Math.random() - .5) * 3, z: p.z + (Math.random() - .5) * 3 }, .35); } // (idling: a faint ring now and then)
    if (!moved && Math.abs(err) < .6) { if ((a.stuckFor += dt) > STUCK) { a.stuckFor = 0; a.path = null; } } else a.stuckFor = 0;
    if (moved && Math.random() < dt * 9) { // dust off the tracks
      const back = _g.set(Math.sin(o.rotation.y), 0, Math.cos(o.rotation.y));
      this.fx.puff(p.clone().addScaledVector(back, HL).setY(.3), { color: 0xc8925a, size: .4, grow: 2.5, life: .9, opacity: .3, vel: back.clone().multiplyScalar(.8).setY(.6) });
    }
  }

  // The next soldier steps out of the rear.
  letOut(a, world) {
    // out of the rear door: the nearest spot behind it that is clear of the carrier's own (axis-aligned) solid box and everything else, so he can walk off
    const o = a.obj, fwd = new THREE.Vector3(Math.sin(o.rotation.y), 0, Math.cos(o.rotation.y)), side = new THREE.Vector3(fwd.z, 0, -fwd.x), lateral = (Math.random() - .5) * .7;
    const free = (x, z) => !world.blockedRect(x, z, 0, .5, .5, false, true) && !world.obstacles.some(b => b.alive && Math.abs(x - b.x) < b.hw + .5 && Math.abs(z - b.z) < b.hd + .5);
    let at = o.position.clone().addScaledVector(fwd, HL + 1.2).addScaledVector(side, lateral).setY(0);
    for (let d = HL + 1.2; d < HL + 7 && !free(at.x, at.z); d += .25) at = o.position.clone().addScaledVector(fwd, d).addScaledVector(side, lateral).setY(0);
    this.soldiers.add(at, world); // (he wakes like any soldier once the jeep is near)
    a.out++;
  }

  // Keeps the hit box and the solid obstacle with the hull.
  sync(a) {
    const o = a.obj, p = o.position, sn = Math.abs(Math.sin(o.rotation.y)), cs = Math.abs(Math.cos(o.rotation.y));
    const k = 1 - .15 * Math.min(sn, cs) * 2, hw = (sn * HL + cs * HW) * k, hd = (cs * HL + sn * HW) * k; // (a box round a carrier turned diagonally is too big: pulled in a little)
    a.target.x = a.ob.x = p.x; a.target.z = a.ob.z = p.z; a.target.hw = a.ob.hw = hw; a.target.hd = a.ob.hd = hd;
  }

  // Blown apart: the cupola is flung high, hull plates, track links and road wheels scatter, and nothing is left standing.
  // Crew still inside die with it.
  wreckIt(a, quiet = false) {
    if (a.state === 'dead') return;
    if (a.out < a.crew) { a.lost = a.crew - a.out; a.out = a.crew; }
    a.state = 'dead'; a.path = null; a.ob.alive = false;
    const o = a.obj, at = o.position.clone(), yaw = o.rotation.y;
    if (quiet) { this.scene.remove(o); return; }
    const r = () => (Math.random() - .5) * 2;
    const cup = o.getObjectByName('cupola'), wp = new THREE.Vector3(), wq = new THREE.Quaternion();
    if (cup) {
      cup.getWorldPosition(wp); cup.getWorldQuaternion(wq);
      cup.parent.remove(cup); this.scene.add(cup); cup.position.copy(wp); cup.quaternion.copy(wq);
      cup.traverse(m => { if (m.isMesh) { m.material = Array.isArray(m.material) ? m.material.map(x => x.clone()) : m.material.clone(); } });
      this.debris.launch(cup, new THREE.Vector3(r() * 4, 11 + Math.random() * 3, r() * 4), new THREE.Vector3(r() * 8, r() * 6, r() * 8), .15);
    }
    this.scene.remove(o);
    const plate = new THREE.MeshStandardMaterial({ color: 0x4a3c24, roughness: .85, metalness: .3, flatShading: true });
    const track = new THREE.MeshStandardMaterial({ color: 0x1c1a17, roughness: .9, metalness: .3, flatShading: true });
    const piece = (geo, m, y, speed, up) => {
      const g = new THREE.Mesh(geo, m); g.castShadow = true;
      g.position.copy(at).add(new THREE.Vector3(r() * 1.4, y, r() * 2)); g.rotation.set(r() * 3, yaw + r(), r() * 3); this.scene.add(g);
      const ang = Math.random() * Math.PI * 2, v = speed * (.5 + Math.random() * .7);
      this.debris.launch(g, new THREE.Vector3(Math.cos(ang) * v, up * (.6 + Math.random() * .7), Math.sin(ang) * v), new THREE.Vector3(r() * 12, r() * 12, r() * 12), .05);
    };
    for (let i = 0; i < 9; i++) piece(shardGeometry(.6 + Math.random() * 1.1, .08, .5 + Math.random() * .8), plate, 1.2, 7, 9);   // hull plates
    for (let i = 0; i < 7; i++) piece(new THREE.BoxGeometry(.5, .05, .25 + Math.random() * .5), track, .4, 6, 6);                      // track links
    for (let i = 0; i < 5; i++) piece(new THREE.CylinderGeometry(.3, .3, .1, 10), track, .4, 8, 8);                                      // road wheels
    for (let i = 0; i < 10; i++) this.debris.chunk(at.clone().setY(1.2), plate, .12 + Math.random() * .25, 3.5);
    this.fx.explosion(at.clone().setY(1.2), 2);
    this.fx.smoke(at.clone().setY(.8), 9);
  }

  // Saved games: where it is, how far it got and its armour (a crew already out is not saved).
  snapshot() {
    const r = v => Math.round(v * 100) / 100;
    return this.list.map(a => [a.state === 'wait' ? 0 : a.state === 'dead' ? 2 : a.state === 'idle' || a.state === 'unload' ? 3 : 1, r(a.obj.position.x), r(a.obj.position.z), r(a.obj.rotation.y), a.target.hp, a.out]);
  }
  restore(data) {
    (data ?? []).forEach(([st, x, z, yaw, hp, out = 0], i) => {
      const a = this.list[i]; if (!a) return;
      a.obj.position.set(x, 0, z); a.obj.rotation.y = yaw; a.target.hp = hp; a.out = out;
      if (st === 2) { a.state = 'idle'; this.wreckIt(a, true); return; }
      a.state = st === 0 ? 'wait' : st === 3 ? 'idle' : 'drive';
      if (st === 3) { a.out = a.crew; poseApc(a.obj, 0, 1); } // (it had unloaded)
      this.sync(a);
    });
  }
}

const _g = new THREE.Vector3();
