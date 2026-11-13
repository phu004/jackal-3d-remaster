// Bomber raid (stage 2): once, when the jeep comes up to a spot given in the stage data (bomber: {
// x, z }), a Super Tucano (bomber.js) comes in from the top-right corner of the screen in a shallow
// dive, steering for the jeep, and lets go its four bombs in a quick stick timed to land on it,
// then pulls up and flies off the bottom-left. The bombs keep the plane's speed as they fall, so
// a jeep that keeps moving (across the plane's track especially) gets clear. Its shadow sweeping
// over the ground gives warning. The plane can be shot down (NES) by anything the jeep fires: one
// grenade, rocket or split shot, or a few bullets; its hit box is where it shows on screen (see
// target in start). One bomb is lethal (gameplay stays 2D: a bomb counts where it lands).
import { sfx } from './sfx.js';
import * as THREE from 'three';
import { shardGeometry } from './debris.js';
import { buildTucano } from '../assets/bomber.js';
import { addToLayer, REFLECT } from './layers.js';
import { mergedModel } from './optimize.js';

const SCALE = .85;             // drawn a little under its modelled size, like the other vehicles
const AHEAD = 14;              // the raid starts once the jeep is this far (m) south of the spot, or further north (unless the raid says otherwise: ahead)
const START = new THREE.Vector3(46, 26, -46);  // where it appears, from the camera's focus: off the top-right corner, high (from: 'nw', the top-left; 'e', the right-hand side)
const SPEED = 22;              // m/s
const TURN = .7;               // rad/s it can turn toward the jeep in its dive
const DROP_ALT = 12.5;         // m above the ground it lets go of the bombs (clear of the tallest columns, ~9-10 m)
const CLIMB = 9, TOP = 34;     // m/s it climbs away afterwards, up to this height
const PULL_UP = .9, LOW = 11;   // s it keeps diving after it starts letting go of the bombs (down to LOW m off the ground), before pulling up
const GRAVITY = 12;            // the bombs' fall: they take ~1.4 s to come down (it was 7, ~1.9 s: a little quicker now)
const DRAG = 1.2;              // /s: the bombs lose their forward speed as they fall, so they come down steeply where you can see them
const BOMB_GAP = .13;          // s between bombs in the stick
const BOMB_PAD = .8;           // m: a bomb landing this far outside the jeep's outline still gets it (it was .3: felt too small for the blast)
const GONE = 110;              // m from the camera's focus where it's taken away
const PROP_SPEED = 60;         // rad/s
const HP = 4, SCORE = 500;     // one grenade / rocket / split shot, or four bullets
const HIT_HALF = 3.2;          // m: half the size of its hit box (round the fuselage and inner wings)
const SHOW_SOUTH = 28 / 45;    // a point this high shows on screen this much further south per metre of height (the camera's slant: GameCamera's OFFSET)

const _v = new THREE.Vector3();

export class BomberRaid {
  // enemyFire: for its jeep hit test.
  constructor(scene, fx, enemyFire) { this.scene = scene; this.fx = fx; this.enemyFire = enemyFire; this.state = 'wait'; this.bombs = []; }

  // debris: for the wreckage when it's shot down.
  // spot: one raid from the stage data, { z, x?, ahead?, from? ('ne', 'nw' or 'e': where it comes in from) }.
  setup(spot, debris) { this.spot = spot ?? null; this.debris = debris; if (!this.spot) this.state = 'none'; }

  update(dt, world, player, cam, onHit) {
    if (this.state === 'wait') {
      if (!player.enabled || player.dead || (this.spot.r ? Math.hypot(player.position.x - this.spot.x, player.position.z - this.spot.z) > this.spot.r : player.position.z > this.spot.z + (this.spot.ahead ?? AHEAD))) return; // (spot.r: it starts when the jeep comes within r m of (x, z))
      if ((this.waited = (this.waited ?? 0) + dt) < (this.spot.delay ?? 0)) return; // (spot.delay: seconds after the trigger, so a raid's planes come one after another)
      this.start(cam, player, world);
    }
    if (this.plane) this.fly(dt, world, player, cam);
    this.fall(dt, world, player, onHit);
  }

  start(cam, player, world) {
    const p = mergedModel('tucano', buildTucano); p.scale.setScalar(SCALE); p.rotation.order = 'YXZ';
    p.traverse(o => { if (o.isMesh && o.name !== 'propBlur' && o.name !== 'canopy') o.castShadow = true; }); // (its shadow sweeping over the ground is the warning)
    p.position.copy(cam.focus).add(START);
    if (this.spot.from === 'nw') p.position.x -= 2 * START.x; // (the top-left corner instead)
    else if (this.spot.from === 'e') p.position.z -= START.z + 6; // (off the right-hand side, a little above the middle)
    this.yaw = Math.atan2(-(player.position.x - p.position.x), -(player.position.z - p.position.z));
    this.y0 = p.position.y; this.d0 = null; this.vy = 0; this.roll = 0;
    this.scene.add(addToLayer(p, REFLECT));
    this.plane = p; this.prop = p.getObjectByName('propeller');
    this.loaded = []; p.traverse(o => { if (o.name === 'bomb') this.loaded.push(o); });
    this.state = 'dive'; this.dropIn = 0;
    this.world = world;
    // shootable: a target the jeep's weapons can hit (moved along with it, see placeTarget)
    this.target = { object: p, x: 0, z: 0, hw: HIT_HALF, hd: HIT_HALF, r: HIT_HALF, hp: HP, score: SCORE, die: () => this.shotDown() };
    this.placeTarget(); world.targets.push(this.target);
  }

  // The hit box goes where the plane shows: over the ground point it appears above from the camera.
  placeTarget() { const p = this.plane.position; this.target.x = p.x; this.target.z = p.z + p.y * SHOW_SOUTH; }
  dropTarget() { const i = this.world.targets.indexOf(this.target); if (i >= 0) this.world.targets.splice(i, 1); }

  // Shot down: it blows apart in the air, wreckage raining down; any bombs still aboard go with it.
  shotDown() {
    const p = this.plane; if (!p) return;
    const at = p.position.clone();
    this.fx.explosion(at, 2.2); this.fx.smoke(at, 8);
    const m = new THREE.MeshStandardMaterial({ color: 0x2f3524, roughness: .8, metalness: .3, flatShading: true }), r = () => (Math.random() - .5) * 2;
    for (let i = 0; i < 22; i++) {
      const g = new THREE.Mesh(shardGeometry(.4 + Math.random() * 1.2, .08, .3 + Math.random() * .8), m);
      g.position.copy(at).add(new THREE.Vector3(r() * 2, r(), r() * 2)); g.castShadow = true; this.scene.add(g);
      this.debris?.launch(g, new THREE.Vector3(-Math.sin(this.yaw) * SPEED * .5 + r() * 6, 2 + Math.random() * 5, -Math.cos(this.yaw) * SPEED * .5 + r() * 6),
        new THREE.Vector3(r() * 8, r() * 8, r() * 8), .05);
    }
    for (let i = 0; i < 10; i++) this.debris?.chunk(at, m, .12 + Math.random() * .2, 3); // and smaller bits
    this.scene.remove(p); this.plane = null; this.loaded = []; this.state = 'done'; this.killed = true; // (counts in the stage's kill rate)
    this.dropTarget();
  }

  // The plane: dives at the jeep, drops, then climbs away and is gone.
  fly(dt, world, player, cam) {
    const p = this.plane, pos = p.position, ground = world.heightAt ? world.heightAt(pos.x, pos.z) : 0;
    this.prop.rotation.z += PROP_SPEED * dt; sfx.plane(pos);
    let turn = 0;
    if (this.state === 'dive') {
      const jp = player.position;
      // where to let go: the bombs carry on at its speed while they fall, so the middle of the stick lands on the aim point
      const fallH = Math.min(30, Math.max(4, DROP_ALT + ground - (world.heightAt ? world.heightAt(jp.x, jp.z) : 0))); // (the plane flies DROP_ALT over the ground under IT; the bomb falls to the ground under the JEEP: a bridge deck is higher than the chasm it crosses)
      const fallT = Math.sqrt(2 * fallH / GRAVITY), carry = SPEED * (1 - Math.exp(-DRAG * fallT)) / DRAG; // how far ahead a bomb lands
      const release = carry + SPEED * BOMB_GAP * 1.5;
      // the aim point: the jeep itself, or (spot.lead = 1: full lead) where it will be when the middle bomb lands, if it keeps its present velocity: the time to the release point (at the plane's own speed) plus the fall, solved a few times over because the aim point itself moves
      const v = this.jv ??= new THREE.Vector3(); if (this.jLast && dt > 0) { _v.set((jp.x - this.jLast.x) / dt, 0, (jp.z - this.jLast.z) / dt); v.lerp(_v, Math.min(1, dt * 8)); } (this.jLast ??= new THREE.Vector3()).copy(jp);
      let ax = jp.x, az = jp.z; const lead = this.spot?.lead ?? 0;
      if (lead > 0 && !player.dead) {
        let h = fallT + .3;
        for (let k = 0; k < 4; k++) h = Math.min(4, Math.max(0, (Math.hypot(jp.x + v.x * h - pos.x, jp.z + v.z * h - pos.z) - release) / SPEED) + fallT);
        ax += v.x * h * lead; az += v.z * h * lead;
      }
      const dx = ax - pos.x, dz = az - pos.z, d = Math.hypot(dx, dz);
      if (!player.dead) { // steer for the jeep
        let err = Math.atan2(-dx, -dz) - this.yaw; err = Math.atan2(Math.sin(err), Math.cos(err));
        turn = Math.sign(err) * Math.min(Math.abs(err), TURN * dt); this.yaw += turn;
      }
      this.d0 ??= Math.max(d, release + 1);
      const k = Math.min(1, Math.max(0, (d - release) / (this.d0 - release)));
      const want = ground + DROP_ALT + (this.y0 - ground - DROP_ALT) * k; // down toward bombing height as it closes in
      // eased toward it: the sink rate changes smoothly (as in the pull-up), so the nose doesn't twitch with every step the jeep takes
      const wantVy = Math.max(-9, Math.min(3, (want - pos.y) * 2.5));
      this.vy += (wantVy - this.vy) * Math.min(1, dt * 3); pos.y += this.vy * dt;
      if (d <= release || player.dead) { this.state = 'drop'; this.dropIn = 0; this.pullIn = PULL_UP; }
    } else { // 'drop' and 'away': straight on, still diving a while, then pulling up
      if ((this.pullIn -= dt) > 0) this.vy = pos.y > ground + LOW ? Math.max(-3, this.vy - 6 * dt) : Math.min(0, this.vy + 12 * dt); // (levels out at LOW)
      else this.vy = Math.min(CLIMB, this.vy + 10 * dt); // a gentler pull-up
      pos.y = Math.min(TOP, Math.max(ground + LOW * .8, pos.y + this.vy * dt));
      if (this.state === 'drop' && (this.dropIn -= dt) <= 0) {
        this.release();
        this.dropIn = BOMB_GAP;
        if (!this.loaded.length) this.state = 'away';
      }
    }
    pos.x += -Math.sin(this.yaw) * SPEED * dt; pos.z += -Math.cos(this.yaw) * SPEED * dt;
    this.roll += ((-turn / Math.max(dt, 1e-4)) * .9 - this.roll) * Math.min(1, dt * 3); // banks into its turns
    p.rotation.set(Math.atan2(this.vy, SPEED), this.yaw, this.roll);
    this.placeTarget();
    if (this.state === 'away' && Math.hypot(pos.x - cam.focus.x, pos.z - cam.focus.z) > GONE) { // off and away
      this.scene.remove(p); this.plane = null; this.state = 'done'; this.dropTarget();
    }
  }

  // One bomb off its pylon: it keeps the plane's speed and falls.
  release() {
    const b = this.loaded.shift(); if (!b) return;
    sfx.bombWhistle(b.getWorldPosition(new THREE.Vector3()));
    this.scene.attach(b); // (keeps where it is and how it's turned)
    this.bombs.push({ obj: b, vel: new THREE.Vector3(-Math.sin(this.yaw) * SPEED, 0, -Math.cos(this.yaw) * SPEED) }); // (dropped, not thrown: no share of the dive)
  }

  fall(dt, world, player, onHit) {
    for (let i = this.bombs.length - 1; i >= 0; i--) {
      const b = this.bombs[i], o = b.obj, pos = o.position;
      b.vel.y -= GRAVITY * dt; const k = Math.exp(-DRAG * dt); b.vel.x *= k; b.vel.z *= k; pos.addScaledVector(b.vel, dt);
      o.lookAt(_v.copy(pos).sub(b.vel)); // nose along its path (the model's nose is -Z)
      const ground = world.heightAt ? world.heightAt(pos.x, pos.z) : 0;
      if (pos.y > ground) continue;
      const at = pos.clone().setY(ground);
      if (world.tileAt(at.x, at.z) === '~') { this.fx.explosion(at, 1); this.fx.waterBlast(at, 1.2); world.ripple?.(at, 1); }
      else { this.fx.explosion(at.clone().setY(ground + .4), 1.3); this.fx.smoke(at.clone().setY(ground + .6), 4); } // (no scorch mark left behind)
      this.scene.remove(o); this.bombs.splice(i, 1);
      if (player.enabled && !player.dead && !player.invulnerable && this.enemyFire.hitsJeep(at, player, BOMB_PAD)) onHit();
    }
  }

  // Saved games: whether the raid has happened (one under way when saved counts as done).
  snapshot() { return { done: this.state !== 'wait', killed: !!this.killed }; }
  restore(d) { if (d?.done && this.state === 'wait') this.state = 'done'; if (d?.killed) this.killed = true; }
}
