// Enemy jeeps (enemy-jeep.js: the player's jeep in grey, unarmed but for the driver's bombs). Each
// waits where the level puts it until it comes into view, then drives at the jeep: much quicker and
// nimbler than a tank, and once close it circles round it (reversing its circle when something is
// in the way), every few seconds lobbing a bomb at where the jeep is. A bomb is slow and goes
// straight through anything it passes over: only its explosion, where it lands, can hurt (unlike
// the player's grenades), so keep moving. Three bullets or one grenade / rocket / split shot
// destroy it. Running into it (or it into you) wrecks both jeeps (a tank, by contrast, just crushes
// yours). Gameplay stays 2D: the bomb's arc is for looks; it counts where it lands.
import * as THREE from 'three';
import { shardGeometry } from './debris.js';
import { buildEnemyJeep } from '../assets/enemy-jeep.js';
import { buildGrenade } from '../assets/grenade.js';
import { JEEP_SCALE, HALF_LEN, HALF_WID } from './player.js';
import { LEVEL } from './world.js';
import { addToLayer, REFLECT } from './layers.js';
import { mergeStatic, dropTinyShadows } from './optimize.js';
import { rectsOverlap } from './tanks.js';

const SPEED = 8.5, TURN = 3.2;       // m/s (a tank: 4.4), rad/s
const WHEEL_R = .42 * JEEP_SCALE;
const CHASE = 17, ORBIT = 12;        // m: drives straight at the jeep from further than CHASE; circles it at ORBIT
const LEAD = .8;                     // rad round the circle ahead of where it is that it steers for
const HP = 3, SCORE = 300;           // three bullets (one grenade / rocket / split shot: 4)
const THROW_RANGE = 18;              // m: lobs bombs when this close (and on screen)
const RELOAD = [2.2, 3.2], FIRST = [1, 1.6]; // s between bombs, and before the first once in range
const BOMB_TIME = 1.4, BOMB_ARC = 4.5; // s in the air (slow), and how high its lob goes
const BLAST_PAD = .8;                // m: the jeep within this of where a bomb goes off is caught by it
const STUCK = .5, BACK_UP = .6;      // s with no headway before it backs up (for BACK_UP s) and circles the other way

const rand = ([a, b]) => a + Math.random() * (b - a);
const _v = new THREE.Vector3();

// the bomb: a grenade drawn bigger and in dark grey, so it's clearly not one of yours
let bombMats = null;
function makeBomb() {
  const g = buildGrenade(); g.scale.setScalar(1.05);
  bombMats ??= new Map();
  g.traverse(o => { if (!o.isMesh) return;
    if (!bombMats.has(o.material)) { const m = o.material.clone(); m.color.multiplyScalar(.45); bombMats.set(o.material, m); }
    o.material = bombMats.get(o.material); o.castShadow = true; });
  return addToLayer(g, REFLECT);
}

const IDLE_DIST = 85; // m from the jeep: farther than this the enemy jeep sits idle
export class EnemyJeeps {
  // enemyFire: for its jeep hit test; debris: for its wreckage.
  constructor(scene, fx, debris, enemyFire) { this.scene = scene; this.fx = fx; this.debris = debris; this.enemyFire = enemyFire; this.jeeps = []; this.bombs = []; }

  // spawns: jeeps brought in by the script (stage.jeepSpawns): [{ x, z, trigger: { z } }]: one appears at
  // (x, z), already driving, once the player's jeep has come north to the trigger's z.
  setup(world, spawns = []) {
    this.world = world; this.spawns = spawns; this.fired = []; // fired: which spawns have gone, in the order they did
    for (const p of world.jeepSpots ?? []) this.add(p, Math.PI); // parked facing south, into the screen
  }

  spawn(i, live = true) {
    const s = this.spawns[i], at = new THREE.Vector3(s.x, 0, s.z);
    const j = this.add(at, s.yaw ?? 0); // (facing north, the way the jeep's going, unless the spawn says otherwise)
    if (s.road && this.world.summitRoad) { j.route = this.world.summitRoad; j.ri = 0; let best = 1e9; j.route.forEach((q, k) => { const d = Math.hypot(q[0] - s.x, q[1] - s.z); if (d < best) { best = d; j.ri = k; } }); } // (it starts from the road point nearest where it appears, not from the road's far end) // (the secret level: it follows the summit road up, then chases the jeep on the plateau)
    if (j.route) this.clearOnRoad(j); // (the spot the level names may not do: a jeep set down where the road is too steep, or something stands, never drives off; it is moved down the road to the first place that is clear)
    this.fired.push(i);
    if (live) { j.state = 'drive'; j.target.asleep = false; }
  }

  // Moves a jeep set down on the summit road to the nearest place down the road where it fits: no wall, rock or tree in its way, no slope too steep to climb, no tank or jeep on it.
  clearOnRoad(j) {
    const R = j.route, w = this.world, fits = (k, yaw) => { const q = R[k]; if (w.blockedRect(q[0], q[1], yaw, HALF_LEN, HALF_WID)) return false; if (w.steepAt?.(q[0], q[1], .55)) return false;
      for (const o of this.jeeps) if (o !== j && o.state !== 'dead' && Math.hypot(o.obj.position.x - q[0], o.obj.position.z - q[1]) < HALF_LEN * 2.2) return false;
      for (const t of this.tanks?.tanks ?? []) if (t.state !== 'dead' && t.obj.parent && Math.hypot(t.obj.position.x - q[0], t.obj.position.z - q[1]) < HALF_LEN + t.hl + .5) return false; return true; };
    for (let k = j.ri; k >= Math.max(0, j.ri - 60); k--) {
      const n = R[Math.min(R.length - 1, k + 1)], q = R[k], yaw = Math.atan2(-(n[0] - q[0]), -(n[1] - q[1]));
      if (!fits(k, yaw)) continue;
      j.ri = k; j.yaw = yaw; j.obj.position.set(q[0], this.groundAt({ x: q[0], z: q[1] }), q[1]); j.obj.rotation.y = yaw; j.target.x = q[0]; j.target.z = q[1]; j.home.set(q[0], 0, q[1]);
      return;
    }
  }

  // A jeep brought in by a script at (x, z), already driving, and after the player's jeep wherever it is, however far: it does not wait for it to come near. (The secret level's ice chase.)
  spawnChaser(x, z, yaw = 0) {
    const w = this.world, free = (px, pz) => !w.blockedRect(px, pz, yaw, HALF_LEN + .8, HALF_WID + .8) && !this.jeeps.some(o => o.state !== 'dead' && Math.hypot(o.obj.position.x - px, o.obj.position.z - pz) < HALF_LEN * 2.2);
    if (!free(x, z)) search: for (let r = 1.5; r <= 15; r += 1.5) for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2, px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r; if (free(px, pz)) { x = px; z = pz; break search; } } // (the spot is taken by a turret, a wall or another jeep: the nearest clear place, so it is not born stuck against it)
    const j = this.add(new THREE.Vector3(x, 0, z), yaw); j.state = 'drive'; j.target.asleep = false; j.chase = true;
    return j;
  }

  // One built ahead of time and kept hidden, so the loading screen's shader compile builds its (clearcoat) shaders: the first jeep to come in during play stalled the game for most of a second while they were built.
  makeSpare() { const o = mergeStatic(buildEnemyJeep()); o.scale.setScalar(JEEP_SCALE); dropTinyShadows(o); o.rotation.order = 'YXZ'; o.position.set(0, -60, 0); o.visible = false; this.scene.add(addToLayer(o, REFLECT)); this.spare = o; }

  add(pos, yaw) {
    let obj = this.spare; if (obj) { this.spare = null; obj.visible = true; } else { obj = mergeStatic(buildEnemyJeep()); obj.scale.setScalar(JEEP_SCALE); dropTinyShadows(obj); obj.rotation.order = 'YXZ'; }
    obj.position.copy(pos); obj.position.y = this.groundAt(pos); obj.rotation.y = yaw;
    this.scene.add(addToLayer(obj, REFLECT));
    const j = { obj, home: pos.clone(), yaw, state: 'wait', wheels: ['wheelFL', 'wheelFR', 'wheelRL', 'wheelRR'].map(n => obj.getObjectByName(n)).filter(Boolean),
      orbit: Math.random() < .5 ? 1 : -1, reload: null, stuckFor: 0, backUp: 0, dustIn: 0 };
    j.target = { object: obj, x: pos.x, z: pos.z, hw: HALF_LEN * 1.1, hd: HALF_LEN * 1.1, r: HALF_LEN * 1.2, hp: HP, score: SCORE, asleep: true, wreck: () => this.wreck(j) };
    this.world.targets.push(j.target);
    this.jeeps.push(j);
    return j;
  }

  groundAt(p) { return this.world.heightAt ? this.world.heightAt(p.x, p.z) : 0; }

  // Would jeep j fit at (x, z) facing yaw? Terrain, objects, the map's sides, the player's jeep, the
  // other enemy jeeps and the tanks (this.tanks, set by the game). One it's already jammed against
  // doesn't count so long as the move takes it no closer, so the two can work themselves apart.
  blocked(j, x, z, yaw, player) {
    if (Math.abs(x) > LEVEL.halfWidth - LEVEL.edgeMargin - 1) return true;
    if (this.world.blockedRect(x, z, yaw, HALF_LEN, HALF_WID)) return true;
    if (!player.dead && Math.hypot(x - player.position.x, z - player.position.z) < HALF_LEN * 2 + .3) return true; // (keeps off the jeep)
    const p = j.obj.position, me = { x, z, yaw, hl: HALF_LEN + .2, hw: HALF_WID + .2 }, now = { ...me, x: p.x, z: p.z, yaw: j.yaw };
    const hits = (q, them) => rectsOverlap(me, them) && (!rectsOverlap(now, them) || Math.hypot(x - q.x, z - q.z) < Math.hypot(p.x - q.x, p.z - q.z) - 1e-4);
    for (const o of this.jeeps) if (o !== j && o.state !== 'dead') { const q = o.obj.position; if (hits(q, { x: q.x, z: q.z, yaw: o.yaw, hl: HALF_LEN, hw: HALF_WID })) return true; }
    for (const t of this.tanks?.tanks ?? []) if (t.state !== 'dead' && t.obj.parent) { const q = t.obj.position; if (hits(q, { x: q.x, z: q.z, yaw: t.obj.rotation.y, hl: t.hl, hw: t.hw })) return true; }
    return false;
  }

  update(dt, world, player, cam, onHit) {
    const alive = player.enabled && !player.dead;
    if (alive) this.spawns.forEach((s, i) => { if (!this.fired.includes(i) && (s.trigger.summit ? player.position.y >= s.trigger.y : player.position.z <= s.trigger.z)) this.spawn(i); }); // (a trigger: the jeep north of a z, or, on the secret level, up at the summit: higher than trigger.y)
    for (const j of this.jeeps) {
      if (j.state === 'dead') continue;
      const o = j.obj, p = o.position;
      if (j.state === 'wait') { // parked till it comes into view
        if (!player.enabled || !cam.inPlayWindow(_v.copy(p).setY(1), 1.1)) continue;
        j.state = 'drive'; j.target.asleep = false;
      }
      // where to head: straight for the jeep from afar; close in, a point a little way round a circle about it
      const jp = player.position, dx = p.x - jp.x, dz = p.z - jp.z, d = Math.hypot(dx, dz);
      if (alive && d > IDLE_DIST && !j.route && !j.chase) continue; // (far from the jeep: it just sits there, no route finding; one coming up the summit road is always on its way)
      let gx = jp.x, gz = jp.z;
      if (j.route) { // up the summit road: it follows the road's points, a few metres ahead of where it is, and is let loose on the jeep once it is up on the plateau
        const R = j.route; while (j.ri < R.length - 1 && Math.hypot(R[j.ri][0] - p.x, R[j.ri][1] - p.z) < 6) j.ri++;
        if (j.ri >= R.length - 6) j.route = null; else { const q = R[Math.min(R.length - 1, j.ri + 2)]; gx = q[0]; gz = q[1]; }
      }
      if (j.route) {} else if (j.script) { if (p.z > j.script.z) j.script = null; else { gx = j.script.x; gz = p.z + 10; } } // (rolling out of a garage: straight on, whatever the player's jeep does, until it is well clear of the door)
      else if (!alive) { gx = j.home.x; gz = j.home.z; }
      else if (d < CHASE) { const a = Math.atan2(dz, dx) + j.orbit * LEAD; gx = jp.x + Math.cos(a) * ORBIT; gz = jp.z + Math.sin(a) * ORBIT; }
      let want = Math.atan2(-(gx - p.x), -(gz - p.z)), reverse = false;
      if (j.backUp > 0) { j.backUp -= dt; reverse = true; want = j.yaw; }
      else if (!j.script) { // steer round anything in the way: straight on first, then wider and wider (not while rolling out of a garage: it goes straight, or waits)
        for (const off of [0, .5, -.5, 1, -1, 1.6, -1.6, 2.4, -2.4]) {
          const a = want + j.orbit * off;
          if (!this.blocked(j, p.x - Math.sin(a) * 2.5, p.z - Math.cos(a) * 2.5, a, player)) { want = a; break; }
        }
      }
      let err = want - j.yaw; err = Math.atan2(Math.sin(err), Math.cos(err));
      j.yaw += Math.sign(err) * Math.min(Math.abs(err), TURN * dt);
      const dir = reverse ? -1 : 1, step = SPEED * (world.speedAt?.(p.x, p.z) ?? 1) * dt * (reverse ? .5 : 1 - Math.min(1, Math.abs(err) / Math.PI) * .6); // (half speed in stage 4's swamp)
      const nx = p.x - Math.sin(j.yaw) * step * dir, nz = p.z - Math.cos(j.yaw) * step * dir;
      let moved = 0;
      if (!this.blocked(j, nx, nz, j.yaw, player)) { p.x = nx; p.z = nz; moved = step; if (world.swampAt?.(p.x, p.z) && (j.wadeIn = (j.wadeIn ?? 0) - dt) <= 0) { j.wadeIn = .11; world.ripple(p, .95, { x: -Math.sin(j.yaw) * dir, z: -Math.cos(j.yaw) * dir }); } } // (rings spread from its wheels: the half ahead)
      if (!reverse && !moved && !j.script && (j.stuckFor += dt) > STUCK) { j.stuckFor = 0; j.backUp = BACK_UP; j.orbit = -j.orbit; } // wedged: back up and go round the other way
      else if (moved) j.stuckFor = 0;
      { const bv = world.conveyorAt?.(p.x, p.z) ?? 0; if (bv) { const nz = p.z + bv * dt; if (!this.blocked(j, p.x, nz, j.yaw, player)) p.z = nz; } } // (a conveyor belt carries it south)
      if (moved && world.groundTrail) world.groundTrail.wheels(p, j.yaw, HALF_LEN, HALF_WID, .55, true, j); // (the secret level: its tyres leave lasting tracks in the snow, like the player's jeep: one record per jeep)
      o.rotation.y = j.yaw; p.y = this.groundAt(p) - .2 * (world.mudK?.(p.x, p.z) ?? 0); // (sunk a little in stage 4's mud)
      if (world.snowBumps && world.heightAt) { // (the secret level's slopes: the model leans to the ground, nose up on a climb, down on a descent, and rolls across a camber; its position is left alone)
        const fx = -Math.sin(j.yaw), fz = -Math.cos(j.yaw), rx = Math.cos(j.yaw), rz = -Math.sin(j.yaw), L = 1.5, Wd = .85, hF = world.heightAt(p.x + fx * L, p.z + fz * L), hB = world.heightAt(p.x - fx * L, p.z - fz * L), hR = world.heightAt(p.x + rx * Wd, p.z + rz * Wd), hL = world.heightAt(p.x - rx * Wd, p.z - rz * Wd);
        const tp = Math.max(-.7, Math.min(.7, Math.atan2(hF - hB, 2 * L))), tr = Math.max(-.5, Math.min(.5, Math.atan2(hR - hL, 2 * Wd))), k = j.slopeP === undefined ? 1 : Math.min(1, dt * 9);
        j.slopeP = (j.slopeP ?? 0) + (tp - (j.slopeP ?? 0)) * k; j.slopeR = (j.slopeR ?? 0) + (tr - (j.slopeR ?? 0)) * k; o.rotation.x = j.slopeP; o.rotation.z = j.slopeR;
      }
      if (!moved && world.swampAt?.(p.x, p.z) && (j.idleRing = (j.idleRing ?? Math.random()) - dt) <= 0) { j.idleRing = .5 + Math.random() * .5; world.ripple({ x: p.x + (Math.random() - .5) * 2.4, z: p.z + (Math.random() - .5) * 2.4 }, .3); } // (idling: a faint ring now and then)
      for (const w of j.wheels) w.rotation.x -= moved * dir / WHEEL_R;
      if (moved && (j.dustIn -= dt) <= 0) { // dust behind the rear wheels
        j.dustIn = .05;
        const back = new THREE.Vector3(Math.sin(j.yaw), 0, Math.cos(j.yaw)), side = new THREE.Vector3(back.z, 0, -back.x);
        const mud = !!world.swampAt?.(p.x, p.z); // (in the swamp: a little mud spray instead of dust, no smoke trail)
        for (const s of [-1, 1]) this.fx.puff(p.clone().addScaledVector(back, HALF_LEN - .2).addScaledVector(side, s * HALF_WID * .75).setY(Math.max(p.y, 0) + .25),
          mud ? { color: 0x4d5a30, size: .09, grow: 1.2, life: .45, opacity: .6, gravity: 9, vel: back.clone().multiplyScalar(.5).setY(1.4 + Math.random()) } : { color: 0xb07a48, size: .12, grow: 2, life: .45, opacity: .4, vel: back.clone().multiplyScalar(1.2).setY(.5) });
      }
      j.target.x = p.x; j.target.z = p.z;
      // a collision with the jeep: both are wrecked
      if (alive && !player.invulnerable && rectsOverlap({ x: p.x, z: p.z, yaw: j.yaw, hl: HALF_LEN, hw: HALF_WID },
        { x: jp.x, z: jp.z, yaw: player.yaw, hl: HALF_LEN, hw: HALF_WID })) {
        j.target.hp = 0; this.fx.explosion(p.clone().setY(p.y + .6), 1.1); this.wreck(j);
        onHit();
        continue;
      }
      // bombs: when close and on screen, every few seconds
      if (alive && d <= THROW_RANGE && cam.inPlayWindow(_v.copy(p).setY(1), .95)) {
        j.reload ??= rand(FIRST);
        if ((j.reload -= dt) <= 0) { this.throwBomb(j, jp); j.reload = rand(RELOAD); }
      }
    }
    this.fly(dt, world, player, onHit);
  }

  // A bomb lobbed from the driver's seat at `at` (where the jeep is now).
  throwBomb(j, at) {
    const from = j.obj.position.clone().setY(j.obj.position.y + 1.4), to = new THREE.Vector3(at.x, this.groundAt(at), at.z);
    const m = makeBomb(); m.position.copy(from); this.scene.add(m);
    this.bombs.push({ m, from, to, t: 0, spin: new THREE.Vector3((Math.random() - .5) * 8, (Math.random() - .5) * 4, (Math.random() - .5) * 8) });
  }

  fly(dt, world, player, onHit) {
    for (let i = this.bombs.length - 1; i >= 0; i--) {
      const b = this.bombs[i]; b.t += dt;
      const k = Math.min(1, b.t / BOMB_TIME);
      b.m.position.lerpVectors(b.from, b.to, k); b.m.position.y += Math.sin(k * Math.PI) * BOMB_ARC; // a slow, high lob
      b.m.rotation.x += b.spin.x * dt; b.m.rotation.y += b.spin.y * dt; b.m.rotation.z += b.spin.z * dt;
      if (k < 1) continue; // (passes over anything: it only goes off where it lands)
      const at = b.to;
      if (world.tileAt(at.x, at.z) === '~') { this.fx.explosion(at.clone().setY(0), .8); this.fx.waterBlast(at.clone().setY(0), 1); world.ripple?.(at, .8); }
      else this.fx.explosion(at.clone().setY(at.y + .4), .8); // (a blast like the player's grenade: no scorch mark left behind)
      this.scene.remove(b.m); this.bombs.splice(i, 1);
      if (player.enabled && !player.dead && !player.invulnerable && this.enemyFire.hitsJeep(at, player, BLAST_PAD)) onHit();
    }
  }

  // Knocked out: it blows apart, grey panels and wheels flung about (no mark left on the ground).
  wreck(j) {
    j.state = 'dead';
    const at = j.obj.position.clone(), r = () => (Math.random() - .5) * 2;
    this.scene.remove(j.obj);
    if (j.fastBury) { this.debris.burying = true; this.debris.fast = true; } // (a jeep from the airbase's garages: its wreckage sinks away quickly)
    const panel = new THREE.MeshStandardMaterial({ color: 0x3a3a3e, roughness: .8, metalness: .3, flatShading: true });
    const tyre = new THREE.MeshStandardMaterial({ color: 0x1c1c1c, roughness: .9, flatShading: true });
    for (let i = 0; i < 8; i++) {
      const g = new THREE.Mesh(shardGeometry(.4 + Math.random() * .7, .06, .3 + Math.random() * .6), panel);
      g.position.copy(at).add(new THREE.Vector3(r(), .8, r())); g.rotation.set(r() * 3, r() * 3, r() * 3); g.castShadow = true; this.scene.add(g);
      this.debris.launch(g, new THREE.Vector3(r() * 6, 5 + Math.random() * 5, r() * 6), new THREE.Vector3(r() * 10, r() * 10, r() * 10), .04);
    }
    for (let i = 0; i < 3; i++) {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(WHEEL_R, WHEEL_R, .22, 12), tyre);
      w.position.copy(at).add(new THREE.Vector3(r(), .5, r())); w.castShadow = true; this.scene.add(w);
      this.debris.launch(w, new THREE.Vector3(r() * 5, 4 + Math.random() * 4, r() * 5), new THREE.Vector3(r() * 8, r() * 8, r() * 8), .12);
    }
    this.debris.burying = false; this.debris.fast = false;
    this.fx.smoke(at.clone().setY(at.y + .6), 3); // (no scorch mark: just the wreckage lying about)
  }

  // Saved games: where each is, which way it faces, its armour, or that it's been destroyed.
  // (and which scripted ones have appeared: they're brought back first, so the list lines up)
  snapshot() {
    const r = v => Math.round(v * 100) / 100;
    return { fired: [...this.fired], jeeps: this.jeeps.map(j => j.state === 'dead' ? { st: 'dead' } : { st: j.state, x: r(j.obj.position.x), z: r(j.obj.position.z), yaw: r(j.yaw), hp: j.target.hp }) };
  }
  restore(data) {
    if (Array.isArray(data)) data = { jeeps: data }; // (older saves: just the list)
    for (const i of data?.fired ?? []) if (this.spawns[i] && !this.fired.includes(i)) this.spawn(i, false);
    (data?.jeeps ?? []).forEach((d, i) => {
      const j = this.jeeps[i]; if (!j || !d) return;
      if (d.st === 'dead') { j.state = 'dead'; j.target.hp = 0; this.scene.remove(j.obj); return; }
      if (d.st === 'wait') return;
      j.state = 'drive'; j.target.asleep = false; j.yaw = d.yaw; j.target.hp = d.hp;
      j.obj.position.set(d.x, 0, d.z); j.obj.position.y = this.groundAt(j.obj.position); j.obj.rotation.y = d.yaw;
      j.target.x = d.x; j.target.z = d.z;
    });
  }
}
