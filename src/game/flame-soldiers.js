// Flame-thrower soldiers (stage 5's helipad): a man with a fuel pack who walks up to the jeep and burns it with one jet, the
// flame tank's attack in small: a pilot flare, a short burst of flame the jeep must not stay in, then a pause. Shot, grenaded or
// run over, his fuel pack goes up in a single burst of flame, and he is left charred.
import { PUDDLE } from './puddles.js';
import * as THREE from 'three';
import { buildFlameSoldier } from '../assets/flamesoldier.js';
import { makeFlameJet } from './tanks.js';
import { HALF_LEN, HALF_WID } from './player.js';
import { sfx } from './sfx.js';
import { mergeStatic, dropTinyShadows } from './optimize.js';

const S = {
  wake: 32, stand: 7, back: 4,   // m: he wakes when the jeep is this near (or on screen), closes in to `stand`, backs off if it comes nearer than `back`
  start: 10.5, len: 9.5, rad: .36,       // m: he lights up inside `start`; the jet is `len` long and `rad` wide at its far end
  warn: .45, burn: 1.0, cool: [2, 3.4], // s: pilot flare, the burst, the pause after
  walk: 2.0, turn: 4, sweep: .7, kill: .2, hide: 70,
};
const r = () => (Math.random() - .5) * 2;
let template = null; // the model with its static pieces merged into a few meshes per part (the named parts stay apart), built once and copied for each man
const model = () => template ??= dropTinyShadows((() => { const m = buildFlameSoldier(); mergeStatic(m); return m; })());
const _fw = new THREE.Vector3(), _mu = new THREE.Vector3(), _mid = new THREE.Vector3();

const IDLE_DIST = 85; // m from the jeep: farther than this the enemies stand idle
export class FlameSoldiers {
  constructor(scene, fx, debris) { this.scene = scene; this.fx = fx; this.debris = debris; this.list = []; this.all = []; } // all: every one the level put out, in order, dead or alive (saved games)

  setup(world) {
    this.world = world;
    for (const p of world.flameSoldierSpots ?? []) this.add(p);
  }

  add(p) {
    const obj = model().clone(true); obj.position.copy(p); obj.rotation.order = 'YXZ'; obj.rotation.y = Math.random() * 6.28; obj.traverse(c => c.layers.enable(PUDDLE)); this.scene.add(obj);
    const jet = makeFlameJet(); jet.scale.set(.5, .5, .01); obj.getObjectByName('muzzle').add(jet);
    const s = {
      obj, jet, body: obj.getObjectByName('body'), muzzle: obj.getObjectByName('muzzle'), pilot: obj.getObjectByName('pilot'), home: p.clone(), heading: obj.rotation.y,
      legL: obj.getObjectByName('legL'), legR: obj.getObjectByName('legR'), kneeL: obj.getObjectByName('kneeL'), kneeR: obj.getObjectByName('kneeR'), gait: 0, walk: Math.random() * 6,
      awake: false, goal: null, idle: 0, speed: .85 + Math.random() * .3, stand: S.stand - 1 + Math.random() * 2, flank: (Math.random() < .5 ? -1 : 1) * (.3 + Math.random() * .6), wander: 0, wanderIn: 0,
      st: 'idle', t: 0, cool: 1 + Math.random(), err: 1, hit: 0, age: 0, puffIn: 0, sparkIn: 0, dead: false,
    };
    s.target = { object: obj, x: p.x, z: p.z, hw: 1.1, hd: 1.1, r: 1.1, hp: 1, score: 200, soft: true, die: () => this.kill(s, false) };
    this.world.targets.push(s.target);
    this.list.push(s); this.all.push(s);
  }

  // Saved games: each soldier dead (0) or alive [x, z, heading, awake].
  snapshot() {
    const r = v => Math.round(v * 100) / 100;
    return this.all.map(s => s.dead ? 0 : [r(s.obj.position.x), r(s.obj.position.z), r(s.heading), s.awake ? 1 : 0]);
  }
  restore(data) {
    if (!data) return;
    data.forEach((d, i) => {
      const s = this.all[i]; if (!s) return;
      if (d === 0) { // killed before the save: gone, as if the wreck had cleared
        s.dead = true; s.target.hp = 0; this.scene.remove(s.obj);
        const k = this.list.indexOf(s); if (k >= 0) this.list.splice(k, 1);
        const t = this.world.targets.indexOf(s.target); if (t >= 0) this.world.targets.splice(t, 1);
        return;
      }
      s.obj.position.set(d[0], s.obj.position.y, d[1]); s.heading = d[2]; s.obj.rotation.y = d[2]; s.awake = !!d[3]; s.target.x = d[0]; s.target.z = d[1];
    });
  }

  // Is the way from a to b clear of buildings, crates and walls (wire fences and sandbags don't stop a jet of flame)?
  clear(a, b) {
    const d = Math.hypot(b.x - a.x, b.z - a.z), n = Math.ceil(d / 1);
    for (let i = 1; i < n; i++) { const k = i / n; if (this.world.flameBlocked(a.x + (b.x - a.x) * k, a.z + (b.z - a.z) * k)) return false; }
    return true;
  }

  pose(s, walking, dt) { // (the soldier's walk cycle)
    s.gait += ((walking ? 1 : 0) - s.gait) * Math.min(1, dt * 6);
    const g = s.gait, sw = Math.sin(s.walk), cw = Math.cos(s.walk);
    s.legL.rotation.x = sw * .5 * g; s.legR.rotation.x = -sw * .5 * g;
    s.kneeL.rotation.x = -Math.max(0, cw) * .9 * g; s.kneeR.rotation.x = -Math.max(0, -cw) * .9 * g;
    s.body.position.y = -Math.abs(sw) * .06 * g; s.body.rotation.set(-.07 * g, sw * .07 * g, sw * .035 * g);
  }

  face(s, heading, rate, dt) {
    let d = heading - s.heading; d = Math.atan2(Math.sin(d), Math.cos(d));
    s.heading += Math.sign(d) * Math.min(Math.abs(d), rate * dt); s.obj.rotation.y = s.heading; return Math.abs(d);
  }

  update(dt, world, player, cam, killPlayer, addScore) {
    const time = performance.now() / 1000, active = player.enabled && !player.dead;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const s = this.list[i], o = s.obj, p = o.position;
      if (s.dead) { this.list.splice(i, 1); const ti = world.targets.indexOf(s.target); if (ti >= 0) world.targets.splice(ti, 1); continue; }
      p.y = world.heightAt ? world.heightAt(p.x, p.z) : 0;
      for (const q of this.list) { // keep apart: pushed away from any other within 2.4 m
        if (q === s || q.dead) continue;
        const sx = p.x - q.obj.position.x, sz = p.z - q.obj.position.z, sd = Math.hypot(sx, sz);
        if (sd < 2.4) { const k = (2.4 - sd) / 2.4 * 2.2 * dt / Math.max(sd, .1), nx = p.x + sx * k, nz = p.z + sz * k; if (!world.blocked(nx, nz, .45)) { p.x = nx; p.z = nz; } }
      }
      const dx = player.position.x - p.x, dz = player.position.z - p.z, dist = Math.hypot(dx, dz);
      o.visible = cam.focus.distanceTo(p) < S.hide;
      if (dist > IDLE_DIST) { s.awake = false; s.target.x = p.x; s.target.z = p.z; continue; } // (far from the jeep: idle, no wandering and no route finding)
      if (!s.awake) {
        if (active && (dist < S.wake || cam.inPlayWindow(_mu.copy(p).setY(1), 1))) { s.awake = true; s.cool = .8 + Math.random(); s.goal = null; }
        else { if (o.visible) this.amble(s, world, dt); s.target.x = p.x; s.target.z = p.z; continue; }
      }
      if (active && this.underJeep(p, player)) { this.kill(s, true); addScore?.(s.target.score); continue; }
      const los = active && this.clear(p, player.position);
      const toward = Math.atan2(-dx, -dz);
      let walking = false;
      if (s.st === 'idle') {
        s.err = active ? this.face(s, toward, S.turn, dt) : 1;
        if ((s.wanderIn -= dt) <= 0) { s.wanderIn = .8 + Math.random() * 1.6; s.wander = (Math.random() - .5) * .8; }
        if (active && (dist > s.stand || !los)) walking = this.step(s, world, toward + s.wander + s.flank * Math.min(1, (dist - s.stand) / 10), S.walk * s.speed, dt); // (each comes in at his own angle, drifting a little, closing up as he nears)
        else if (active && dist < S.back) walking = this.step(s, world, toward + Math.PI, S.walk * s.speed * .6, dt, true);
        s.cool -= dt;
        if (active && los && dist < S.start && s.err < .3 && s.cool <= 0) { s.st = 'warn'; s.t = S.warn; sfx.flameIgnite?.(s.muzzle.getWorldPosition(_mu)); }
      } else {
        s.err = active ? this.face(s, toward, s.st === 'burn' ? S.sweep : S.turn, dt) : 1; // (he turns slowly while he burns, so a jeep that keeps moving can get out of the jet)
        if (s.st === 'warn') {
          s.t -= dt;
          if (!active) s.st = 'idle'; else if (s.t <= 0) { s.st = 'burn'; s.t = S.burn; s.age = 0; s.hit = 0; sfx.flameBurst?.(s.muzzle.getWorldPosition(_mu), S.burn); }
        } else {
          s.age += dt; s.t -= dt;
          if (s.t <= 0 || !active) { s.st = 'idle'; s.cool = S.cool[0] + Math.random() * (S.cool[1] - S.cool[0]); }
        }
      }
      this.pose(s, walking, dt);
      s.target.x = p.x; s.target.z = p.z;
      this.flame(s, dt, player, world, time, killPlayer);
    }
  }

  // Walk along `heading`, round whatever is in the way (sliding along one axis, or trying a side step).
  step(s, world, heading, speed, dt, back = false) {
    const p = s.obj.position;
    for (const off of [0, .7, -.7, 1.4, -1.4]) {
      const h = heading + off, nx = p.x - Math.sin(h) * speed * dt, nz = p.z - Math.cos(h) * speed * dt;
      if (!world.blocked(nx, nz, .45)) { p.x = nx; p.z = nz; s.walk += dt * speed / 1.4 * Math.PI * 2 * (back ? -1 : 1); return true; }
    }
    return false;
  }

  amble(s, world, dt) { // before the jeep comes near: strolls about his post
    const p = s.obj.position;
    if (s.idle > 0) { s.idle -= dt; this.pose(s, false, dt); return; }
    if (!s.goal) { const a = Math.random() * 6.28, d = 1 + Math.random() * 2.5; s.goal = [s.home.x + Math.sin(a) * d, s.home.z + Math.cos(a) * d]; }
    const gx = s.goal[0] - p.x, gz = s.goal[1] - p.z;
    if (Math.hypot(gx, gz) < .3) { s.goal = null; s.idle = .8 + Math.random() * 1.5; this.pose(s, false, dt); return; }
    this.face(s, Math.atan2(-gx, -gz), S.turn, dt);
    const v = S.walk * .45, nx = p.x - Math.sin(s.heading) * v * dt, nz = p.z - Math.cos(s.heading) * v * dt;
    if (world.blocked(nx, nz, .45)) { s.goal = null; s.idle = .4; this.pose(s, false, dt); return; }
    p.x = nx; p.z = nz; s.walk += dt * v / 1.4 * Math.PI * 2; this.pose(s, true, dt);
  }

  underJeep(p, player) {
    const dx = p.x - player.position.x, dz = p.z - player.position.z, y = player.yaw;
    const u = dx * -Math.sin(y) + dz * -Math.cos(y), v = dx * Math.cos(y) + dz * -Math.sin(y);
    return Math.abs(u) < HALF_LEN + .45 && Math.abs(v) < HALF_WID + .45;
  }

  // The jet, its light, embers and puffs, and the burn on the jeep: the flame tank's, with one nozzle.
  flame(s, dt, player, world, time, killPlayer) {
    const o = s.obj, fx = this.fx, burning = s.st === 'burn';
    o.updateMatrixWorld(true); s.muzzle.getWorldPosition(_mu);
    _fw.set(-Math.sin(s.heading), 0, -Math.cos(s.heading));
    const ext = burning ? Math.min(1, s.age / .07) * Math.min(1, s.t / .1) : 0;
    let reach = S.len; // the jet stops at the first wall or building in its way
    if (burning) for (let d = .6; d <= S.len; d += .6) if (world.flameBlocked(_mu.x + _fw.x * d, _mu.z + _fw.z * d)) { reach = Math.max(.3, d - .3); break; }
    const len = Math.min(S.len * ext, reach);
    s.jet.visible = ext > 0; for (const c of s.jet.children) { const mt = c.material; mt.uniforms.uTime.value = time % 120; mt.uniforms.uAmt.value = ext; }
    s.jet.scale.set(.5, .5, Math.max(.01, len / 1.023)); // (the soldier's body is drawn at 1.023)
    s.pilot.scale.setScalar(s.st === 'warn' ? 2.4 + Math.sin(time * 40) * .6 : 1);
    if (burning || s.st === 'warn') {
      _mid.copy(_mu).addScaledVector(_fw, burning ? len * .45 : .3); _mid.y = o.position.y + 1.3;
      fx.exhaust?.(_mid, burning ? 6 * ext : 1.6 + Math.sin(time * 35) * .6);
    }
    if (burning && (s.sparkIn -= dt) <= 0) {
      s.sparkIn = .07;
      fx.puff(_mu.clone().addScaledVector(_fw, Math.random() * len).setY(o.position.y + 1.2), { color: Math.random() < .5 ? 0xffe090 : 0xff9a40, size: .05 + Math.random() * .05, grow: 0, life: .4 + Math.random() * .4, opacity: 1, additive: true, gravity: 5,
        vel: new THREE.Vector3(r() * 1.6, 1 + Math.random() * 2, r() * 1.6).addScaledVector(_fw, 2 + Math.random() * 2) });
    }
    if ((s.puffIn -= dt) <= 0 && (burning || s.st === 'warn')) {
      s.puffIn = burning ? .05 : .1;
      const k = burning ? Math.pow(Math.random(), .7) : 0, at = _mu.clone().addScaledVector(_fw, burning ? k * len : .2).setY(o.position.y + 1.2 + Math.random() * .1);
      const col = !burning ? 0xff8a30 : k < .25 ? 0xfff0b0 : k < .55 ? 0xffc050 : k < .8 ? 0xff7a20 : 0xc83a10;
      fx.puff(at, { color: col, size: burning ? .25 + k * .35 : .15, grow: burning ? 1.8 : 1.2, life: burning ? .3 + k * .15 : .2, opacity: burning ? .7 : .8, additive: true, soft: true, vel: new THREE.Vector3(r() * .4, .5 + k * 1.2, r() * .4).addScaledVector(_fw, burning ? 2.5 : 0) });
      if (burning && Math.random() < .25) fx.puff(at.clone().setY(at.y + .3 + k), { color: 0x2a2724, size: .4, grow: 2.2, life: 1.0, opacity: .35, soft: true, vel: new THREE.Vector3(r() * .5, 1.4, r() * .5) });
    }
    if (burning && ext > .5 && player.enabled && !player.dead && !player.invulnerable) { // the jeep in the jet (a narrow cone, plus the jeep's own width)
      const rx = player.position.x - _mu.x, rz = player.position.z - _mu.z, along = rx * _fw.x + rz * _fw.z, side = Math.abs(rx * _fw.z - rz * _fw.x);
      const inside = along > 0 && along < len && side < .1 + S.rad * (along / S.len) + HALF_WID * .75;
      s.hit = inside ? s.hit + dt : Math.max(0, s.hit - dt * 2);
      if (s.hit > S.kill) killPlayer();
    } else s.hit = 0;
  }

  // His fuel pack goes up in one burst of flame; he is left charred on the ground.
  kill(s, runover) {
    if (s.dead) return; s.dead = true;
    s.target.hp = 0; // (taken off the lists in update(): this can run while the weapons loop over the targets)
    const o = s.obj, fx = this.fx, at = o.position.clone().setY(o.position.y + 1.2);
    s.jet.visible = false;
    fx.explosion(at, 1.2);
    for (let k = 0; k < 9; k++) { // the burst: a ball of flame, yellow-white in the middle, red at the edge
      const c = Math.random();
      fx.puff(at.clone().add(new THREE.Vector3(r() * .4, r() * .3, r() * .4)), { color: c < .3 ? 0xfff0b0 : c < .65 ? 0xffa030 : 0xd04a14, size: .7 + Math.random() * .5, grow: 2, life: .45 + Math.random() * .3, opacity: .85, additive: true, soft: true, vel: new THREE.Vector3(r() * 2.5, 1 + Math.random() * 2.5, r() * 2.5) });
    }
    for (let k = 0; k < 6; k++) fx.puff(at, { color: 0xff9a30, size: .18, grow: 0, life: .6 + Math.random() * .5, opacity: 1, additive: true, gravity: 9, vel: new THREE.Vector3(r() * 6, 3 + Math.random() * 5, r() * 6) });
    fx.fires?.start([o.position.clone().setY(o.position.y + .1)], .45, 5); // a few seconds of flame where he fell
    fx.scorch(o.position.clone(), 1.6);
    const pack = o.getObjectByName('pack');
    if (pack && this.debris) { // the canisters are flung off
      pack.updateWorldMatrix(true, false); this.scene.attach(pack);
      this.debris.launch(pack, new THREE.Vector3(r() * 3, 4 + Math.random() * 3, r() * 3), new THREE.Vector3(r() * 8, r() * 8, r() * 8), .1);
    }
    const gun = o.getObjectByName('nozzle'); gun?.parent?.remove(gun);
    // charred, and down: dark paint, lying on his back or face-down
    const seen = new Map();
    o.traverse(m => { if (!m.isMesh) return; if (!seen.has(m.material)) { const c = m.material.clone(); c.color?.multiplyScalar(.28); c.emissive?.setScalar(0); seen.set(m.material, c); } m.material = seen.get(m.material); m.castShadow = false; });
    o.rotation.x = (Math.random() < .5 ? 1 : -1) * 1.45; o.rotation.y = Math.random() * 6.28;
    s.legL.rotation.x = -.75; s.legR.rotation.x = -.3; s.body.position.y = 0; s.body.rotation.set(0, 0, 0);
    o.getObjectByName('armL')?.rotation.set(-.9, 0, 1.15); o.getObjectByName('armR')?.rotation.set(-1.25, 0, -.85);
  }
}
