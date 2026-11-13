// Stage 2's pool statues: each opens its mouth and launches a single missile at the jeep. On the NES
// the missile always flies to the same spot (down and to the right); here it homes on where the jeep
// was half a second ago (from the jeep's track kept by EnemyFire), curving round if it has to, and
// blows up when it gets there. A jeep that keeps moving stays ahead of it and it bursts behind; one
// that sits still gets hit. The mouth opens a moment before each launch, and its eyes glow red, easy
// to see from above (the warning). They fire only while on screen, with the jeep within about the
// reach of its own rockets. One hit is lethal, like the guns' shells (gameplay stays 2D: the
// missile's height is only for looks).
import { sfx } from './sfx.js';
import * as THREE from 'three';
import { addToLayer, REFLECT } from './layers.js';
import { buildRocket } from '../assets/rocket.js';
import { buildMissile as buildSubMissile } from '../assets/submarine.js';
import { mergeStatic, oneShadow } from './optimize.js';

const RANGE = 27.5;                    // m: the jeep must be this close (further than the player's rocket: 21 m)
const RELOAD = [3.2, 4.4];            // s between launches (random in this range)
const FIRST = [.8, 1.6];              // s before a statue's first launch once the jeep is in range
const OPEN_TIME = 1, CLOSE_TIME = .45; // s: the mouth opening and eyes lighting before a launch (the warning), and closing / fading after
const SPEED = 13, TURN = 1.6;          // m/s, rad/s it can turn toward its target spot
const MAX_FLIGHT = SPEED * 2.3;       // m: it blows up after flying this far (~2.3 s), wherever it is: it can't chase the jeep for ever
const BOSS_FLIGHT = SPEED * 6.06;     // m: the boss busts' missiles fly further (~6 s)
const BOSS_REACH = 2;                 // stage 2's boss busts (arena.js): twice the range
const SHOOT_DOWN = 1.1;               // m: a jeep's shot passing this close to a missile (seen from above) shoots it down
const AIM_DELAY = .5;                 // s: it homes on where the jeep was this long ago
const HIT_PAD = -.15;                 // m: must touch this far inside the jeep's outline
const BLAST_PAD = .5;                 // m: its blast at the target spot catches the jeep this far outside its outline
const ARC_RATE = 1.7, ARC_ACCEL = 8;  // rad/s the nose swings over after the climb, and m/s^2 it speeds up to cruising speed meanwhile
const CLIMB_SPEED = 9;                // m/s: a missile out of a vertical silo (the submarine's) climbs straight up this fast, then pitches over toward its target
const ARC_NEAR = 16, SUB_TURN = 3.2;  // m: inside this the submarine's missile pitches over faster; rad/s it can turn (tighter than the statues', so it can still catch a jeep close by)
const CRUISE = .7;                   // m above the ground at the target spot

// The missile: the player's rocket in white (rocket.js), very slightly smaller.
const MISSILE_SCALE = .96 * 1.15, MISSILE_STRETCH = 1.15; // (and 15% longer)
function makeMissile() {
  const g = oneShadow(mergeStatic(buildRocket({ white: true }))); g.scale.set(MISSILE_SCALE, MISSILE_SCALE, MISSILE_SCALE * MISSILE_STRETCH);
  g.rotation.order = 'YXZ';
  return addToLayer(g, REFLECT);
}

// The submarine's missile (vertical launch, see shoot): the same model as the one in its hatch, with an exhaust flame.
const subFlameMat = new THREE.MeshBasicMaterial({ color: 0xffb040, transparent: true, opacity: .9, blending: THREE.AdditiveBlending, depthWrite: false });
function makeSubMissile() {
  const g = oneShadow(mergeStatic(buildSubMissile())); g.scale.setScalar(SUB_MISSILE_SCALE);
  const flame = new THREE.Mesh(new THREE.ConeGeometry(.07, .4, 10).rotateX(Math.PI / 2), subFlameMat);
  flame.name = 'flame'; flame.position.z = .62; g.add(flame);
  g.rotation.order = 'YXZ';
  return addToLayer(g, REFLECT);
}
const SUB_MISSILE_SCALE = 1.6; // (as it sits in the hatch)

const rand = ([a, b]) => a + Math.random() * (b - a);
const _p = new THREE.Vector3();

export const BOSS_MISSILE_FLIGHT = BOSS_FLIGHT; // (the submarine's missiles fly as far)

export class Statues {
  // statues: [{ obj, target, boss }] from the world (boss: one of stage 2's boss busts, held until the
  // fight starts: their targets are immune till then, see arena.js). enemyFire: for its jeep hit test.
  constructor(scene, fx, enemyFire, statues) {
    this.scene = scene; this.fx = fx; this.enemyFire = enemyFire; this.missiles = [];
    this.list = statues.map(s => ({ ...s, state: 'idle', t: 0, reload: null, mouth: s.obj.userData.mouth, setMouth: s.obj.userData.setMouth, setEyes: s.obj.userData.setEyes ?? (() => {}),
      range: RANGE * (s.boss ? BOSS_REACH : 1), flight: s.boss ? BOSS_FLIGHT : MAX_FLIGHT }));
  }

  update(dt, world, player, onHit, cam) {
    const canShoot = player.enabled && !player.dead;
    for (const s of this.list) {
      if (s.target.hp <= 0 || !s.setMouth || s.target.immune) continue; // (immune: a boss before its fight)
      if (s.state === 'idle') {
        if (s.boss) continue; // (the boss busts take turns: see bossTurns below)
        if (!this.ready(s, player, cam)) { // out of reach or off screen: keeps reloading
          if (s.reload !== null) s.reload = Math.max(0, s.reload - dt);
          continue;
        }
        s.reload ??= rand(FIRST);
        if ((s.reload -= dt) > 0) continue;
        s.state = 'open'; s.t = 0; // the mouth opens: the warning
      } else if (s.state === 'open') {
        s.t += dt; s.setMouth(Math.min(1, s.t / OPEN_TIME)); s.setEyes(Math.min(1, s.t / OPEN_TIME) * (.85 + .15 * Math.random())); // the eyes light up (flickering): the warning you can see from above
        if (s.t >= OPEN_TIME) { if (canShoot) this.launch(s, this.enemyFire.aimAgo(AIM_DELAY, _p), world); s.state = 'close'; s.t = 0; }
      } else if (s.state === 'close') {
        s.t += dt; s.setMouth(Math.max(0, 1 - s.t / CLOSE_TIME)); s.setEyes(Math.max(0, 1 - s.t / CLOSE_TIME));
        if (s.t >= CLOSE_TIME) { s.state = 'idle'; s.reload = rand(RELOAD); }
      }
    }
    this.bossTurns(dt, player, cam, canShoot);

    for (let i = this.missiles.length - 1; i >= 0; i--) {
      const m = this.missiles[i], o = m.obj, p = o.position, k = m.k ?? 1; // (k: its speed as a share of the usual: the hidden mud launchers' are slower)
      if (m.up > 0) { // out of a vertical silo: straight up first, nose to the sky, with a trail
        const climb = Math.min(m.up, CLIMB_SPEED * (m.kc ?? k) * dt); // (kc: the climb's own speed factor, if it differs from the flight's)
        p.y += climb; m.up -= climb; m.pitch = Math.PI / 2; o.rotation.set(m.pitch, m.yaw, 0);
        o.getObjectByName('flame').scale.setScalar(1 + Math.random() * .6);
        this.subTrail(m);
        this.fx.exhaust(p, 5); // (its exhaust lights up the surroundings while it climbs)
        if (m.up <= 0) { m.arc = true; m.v = CLIMB_SPEED * k; } // (next: it arcs over toward the target)
        continue;
      }
      if (canShoot) { // the spot it homes on: where the jeep was half a second ago (it keeps the last one once the jeep is gone)
        const a = this.enemyFire.aimAgo(AIM_DELAY, _p); m.tx = a.x; m.tz = a.z; m.ty = (world.heightAt ? world.heightAt(a.x, a.z) : 0) + CRUISE;
      }
      // steer toward it, as hard as it can turn
      const want = Math.atan2(-(m.tx - p.x), -(m.tz - p.z));
      let err = want - m.yaw; err = Math.atan2(Math.sin(err), Math.cos(err));
      m.yaw += Math.sign(err) * Math.min(Math.abs(err), (m.sub ? SUB_TURN : m.turn ?? TURN) * dt);
      const dx = -Math.sin(m.yaw), dz = -Math.cos(m.yaw);
      let step, left;
      if (m.arc) { // after a vertical climb: the nose swings over at a steady rate while it speeds up, flying along wherever it points, until it is angled toward the target
        m.v = Math.min(SPEED * k, m.v + ARC_ACCEL * k * dt);
        left = Math.hypot(m.tx - p.x, m.tz - p.z);
        const aim = Math.max(-.7, Math.min(.5, Math.atan2(m.ty - p.y, Math.max(left, 4))));
        const rate = ARC_RATE * Math.max(1, ARC_NEAR / Math.max(left, 4)); // (the nearer the jeep, the harder it pitches over, or it would sail past before coming down)
        m.pitch += Math.max(-rate * dt, Math.min(rate * dt, aim - m.pitch));
        step = m.v * dt * Math.cos(m.pitch);
        p.x += dx * step; p.z += dz * step; p.y += m.v * dt * Math.sin(m.pitch); m.flown += step;
        left = Math.hypot(m.tx - p.x, m.tz - p.z);
        if (Math.abs(aim - m.pitch) < .05) { m.arc = false; m.y0 = p.y; m.d0 = Math.max(1, left); } // (from here it comes down toward the target)
        o.rotation.set(m.pitch, m.yaw, 0);
      } else {
        step = SPEED * k * dt;
        p.x += dx * step; p.z += dz * step; m.flown += step;
        // and down from the mouth toward cruising height over the spot as it closes in
        left = Math.hypot(m.tx - p.x, m.tz - p.z);
        const y = m.ty + (m.y0 - m.ty) * Math.min(1, left / m.d0), vy = (y - p.y) / Math.max(dt, 1e-4);
        // (the statues' missiles only tilt a little, for looks; the submarine's nose points exactly along its path, the pitch following the real flight angle closely)
        m.pitch = m.sub ? (m.pitch ?? 0) + (Math.atan2(vy, SPEED * k) - (m.pitch ?? 0)) * Math.min(1, dt * 14)
          : (m.pitch ?? 0) + (Math.atan2(vy, SPEED * k) * .6 - (m.pitch ?? 0)) * Math.min(1, dt * 4);
        p.y = y; o.rotation.set(m.pitch, m.yaw, 0);
      }
      o.getObjectByName('flame').scale.setScalar(.8 + Math.random() * .5);
      if (m.sub) this.subTrail(m); // (as dense as on the climb)
      else if (Math.random() < .5) this.fx.puff(p.clone().addScaledVector(new THREE.Vector3(dx, 0, dz), -.75), { color: 0xe4e2dc, size: .08, grow: 2.5, life: .7, opacity: .14, mirror: false, // a very faint trail
        vel: new THREE.Vector3(.3, .5, -.2) });
      const isBox = b => b.kind === 'container' || b.kind === 'containerpile';
      if (m.over && world.obstacles.some(b => b.alive && isBox(b) && !(b.top > 0) && Math.abs(p.x - b.x) < b.hw && Math.abs(p.z - b.z) < b.hd)) p.y = Math.max(p.y, 2.9); // (the boss's missiles sail over a single container, 2.6 m: lifted over it, not through it)
      let boom = false, hit = false;
      if (canShoot && !player.invulnerable && this.enemyFire.hitsJeep(p, player, HIT_PAD)) { boom = hit = true; }
      else if (world.tileAt(p.x, p.z) === 'T' || world.obstacles.some(b => b.alive && b.kind !== 'statue' && b.kind !== 'bust' && b.kind !== 'palm' && b.kind !== 'turret' && b.kind !== 'm270' && b.kind !== 'parkedjeep' && b.kind !== 'warship' && b.kind !== 'swamptree' && b.kind !== 'subhull'
        && b.kind !== 'blocker' && b.kind !== 'foxhole' && b.kind !== 'barrier' && !(m.light && (b.kind === 'wall' || b.kind === 'gate')) && !(m.over && isBox(b) && !(b.top > 0 && p.y < b.top)) && Math.abs(p.x - b.x) < b.hw && Math.abs(p.z - b.z) < b.hd)) boom = true; // (enemy fire passes through enemies)
      else if (left < Math.max(.4, step) || m.flown > m.flight) { // there: it blows up, catching the jeep if it's (nearly) on the spot
        boom = true; hit = canShoot && !player.invulnerable && this.enemyFire.hitsJeep(p, player, BLAST_PAD);
      }
      if (!boom) continue;
      this.explode(i, world);
      if (hit) onHit();
    }
  }

  // Could statue s fire now: the jeep alive, within its range, and it on screen?
  ready(s, player, cam) {
    const p = s.obj.position;
    return player.enabled && !player.dead && Math.hypot(player.position.x - p.x, player.position.z - p.z) <= s.range
      && cam.inPlayWindow(_p.copy(p).setY(p.y + 2.5), 1);
  }

  // Stage 2's boss busts fire in turn rather than each on its own clock (which would have them all go
  // at once, then all reload together): one launch every RELOAD / (busts standing), going round them
  // in order and skipping any that can't fire just now, so each still fires about as often as a
  // pool statue and the pressure is steady.
  bossTurns(dt, player, cam, canShoot) {
    const bosses = this.list.filter(s => s.boss && s.target.hp > 0 && !s.target.immune && s.setMouth);
    if (!bosses.length || !canShoot) return;
    this.bossIn = (this.bossIn ?? rand(FIRST)) - dt;
    if (this.bossIn > 0) return;
    const all = this.list.filter(s => s.boss), n = all.length;
    for (let k = 1; k <= n; k++) { // the next one round after the last to fire
      const s = all[((this.bossLast ?? -1) + k) % n];
      if (s.target.hp <= 0 || s.target.immune || s.state !== 'idle' || !this.ready(s, player, cam)) continue;
      s.state = 'open'; s.t = 0; this.bossLast = all.indexOf(s);
      this.bossIn = rand(RELOAD) / bosses.length;
      return;
    }
    this.bossIn = .3; // none can fire just now: try again shortly
  }

  // Missile i blows up where it is (and is gone).
  explode(i, world) {
    const p = this.missiles[i].obj.position;
    if (world.tileAt(p.x, p.z) === '~') { const w = p.clone().setY(0); this.fx.explosion(w, .6); this.fx.waterBlast(w, .7); world.ripple?.(w, .7); }
    else this.fx.explosion(p.clone(), .8);
    this.scene.remove(this.missiles[i].obj); this.missiles.splice(i, 1);
  }

  // Every missile in the air blows up where it is (the boss has fallen).
  clear(world) { while (this.missiles.length) this.explode(this.missiles.length - 1, world); }

  // A jeep's shot at p (bullet, grenade, rocket or split shot: on the NES any of them will do) shoots
  // down a missile it passes close to (seen from above); `reach`: a blast's radius. True if it did.
  shootDown(p, world, reach = SHOOT_DOWN) {
    const i = this.missiles.findIndex(m => !(m.up > 0) && Math.hypot(m.obj.position.x - p.x, m.obj.position.z - p.z) < reach); // (a missile still climbing out of its silo can't be shot down)
    if (i < 0) return false;
    this.explode(i, world);
    return true;
  }

  // The dense smoke trail of a submarine missile, from its tail wherever it is pointing (climbing, arcing or cruising).
  subTrail(m) {
    if (m.light && Math.random() > .3) return; // (a thin, intermittent trail)
    const p = m.obj.position, cp = Math.cos(m.pitch ?? 0);
    const tail = _p.set(p.x + Math.sin(m.yaw) * cp, p.y - Math.sin(m.pitch ?? 0), p.z + Math.cos(m.yaw) * cp).multiplyScalar(1); // (one metre astern)
    this.fx.puff(tail.clone(), { color: 0xe4e2dc, size: (m.light ? .09 : .14) * (m.over ? .7 : 1), grow: m.over ? 2 : 2.5, life: m.light ? .6 : .8, opacity: m.light ? .13 : .3, mirror: false, vel: new THREE.Vector3((Math.random() - .5) * .6, -.4, (Math.random() - .5) * .6) });
  }

  // A missile out of statue s's mouth, aimed at `at` (where the jeep was half a second ago).
  launch(s, at, world) { this.shoot(s.mouth.getWorldPosition(new THREE.Vector3()), s.obj.rotation.y, at, world, s.flight); }

  // A missile from `from` (leaving at yaw, then turning), aimed at `at`, blowing up after `flight` m.
  shoot(from, yaw, at, world, flight, up = 0, light = false, speed = 1, climbSpeed = speed, over = false) { // over: the boss's: it flies over a single container and is stopped only by a pile of two or more // up: m it climbs straight up first (vertical launch); light: only a thin, faint smoke trail (the hidden mud launchers')
    const tx = at.x, tz = at.z, ty = (world.heightAt ? world.heightAt(tx, tz) : 0) + CRUISE;
    const m = { obj: up > 0 ? makeSubMissile() : makeMissile(), sub: up > 0, yaw, tx, tz, ty, y0: from.y, d0: Math.max(1, Math.hypot(tx - from.x, tz - from.z)), flown: 0, flight, up, light, over, k: speed, kc: climbSpeed, pitch: up > 0 ? Math.PI / 2 : 0 }; // leaves the mouth straight out, then turns
    if (over) m.obj.scale.multiplyScalar(.8); // (the boss's missiles: a little smaller, and a thinner trail, see subTrail)
    m.obj.position.copy(from); m.obj.rotation.set(m.pitch, m.yaw, 0);
    this.scene.add(m.obj); this.missiles.push(m);
    const dir = new THREE.Vector3(-Math.sin(m.yaw), 0, -Math.cos(m.yaw));
    sfx.enemyMissile(from, up > 0);
    if (up > 0) this.fx.exhaust(from, 7); else this.fx.turretFlash(from, dir); // (a vertical launch has no sideways muzzle flash)
  }

  // Saved games: each statue's mouth / reload state and the missiles in flight.
  snapshot() {
    const r = v => Math.round(v * 1000) / 1000;
    return {
      statues: this.list.map(s => s.boss ? null : [s.state, r(s.t), s.reload === null ? null : r(s.reload)]), // (the boss fight starts afresh)
      missiles: this.missiles.map(m => [r(m.obj.position.x), r(m.obj.position.y), r(m.obj.position.z), r(m.yaw), r(m.tx), r(m.tz), r(m.ty), r(m.y0), r(m.d0), r(m.flown), r(m.flight), r(m.up ?? 0), r(m.pitch ?? 0), m.arc ? 1 : 0, r(m.v ?? 0), m.sub ? 1 : 0]),
    };
  }
  restore(d) {
    if (!d) return;
    d.statues?.forEach((e, i) => {
      const s = this.list[i]; if (!e || !s || s.boss || s.target.hp <= 0) return;
      const [state, t, reload] = e;
      Object.assign(s, { state, t, reload });
      const o = state === 'open' ? Math.min(1, t / OPEN_TIME) : state === 'close' ? Math.max(0, 1 - t / CLOSE_TIME) : 0;
      s.setMouth?.(o); s.setEyes(o);
    });
    for (const [x, y, z, yaw, tx, tz, ty, y0, d0, flown, flight = MAX_FLIGHT, up = 0, pitch = 0, arc = 0, v = 0, sub = 0] of d.missiles ?? []) {
      const m = { obj: sub ? makeSubMissile() : makeMissile(), sub: !!sub, yaw, tx, tz, ty, y0, d0, flown, flight, up, pitch: up > 0 ? Math.PI / 2 : pitch, arc: !!arc, v };
      m.obj.position.set(x, y, z); m.obj.rotation.set(m.pitch, yaw, 0);
      this.scene.add(m.obj); this.missiles.push(m);
    }
  }
}
