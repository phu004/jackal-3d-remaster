// Stage 6's final boss, its attacks only (it stands still: no moving, no damage yet). One attack at a time from the main sequencer, picked at random, with a pause between; the two side guns run on their own clocks beside it.
// Every attack announces itself so it can be read from above:
//  - MAIN GUN, the scan-hit beam (a kill unless something solid stands between): the turret swings onto the jeep and a thin red sight line shows where it points (AIM), then the coils flare to full, the line fattens into a pulsing red
//    strip along the ground, with a siren (CHARGE), then the beam: instant, along the line to the jeep's place at that moment, stopped by any container, wall or building in the way. A container between the gun and the jeep is cover.
//  - SIDE GUNS: each turret turns onto the jeep, flares red at its muzzles, then fires three slow shells in turn (the game's usual shell: dodgeable by moving).
//  - MISSILES: the launcher's lid swings open (the warning, a second and more), then nine homing missiles climb out of the cells one after another and curve in on the jeep (the same missiles as stage 2's statues and stage 3's submarine: they can be shot down).
//  - MOVEMENT: it is not clever; all it wants is a clear shot. With one (the jeep in beam range and nothing tall between) it stands and fires. Without, it picks the nearest place it can drive to from which it would have one, plans a route
//    there over a grid of the map (every container, pile, wall and building, and the margin its size needs, closed), and drives it: turning on the spot when it is facing the wrong way, then forward, the tracks turning with it. It stands still
//    for the whole of the beam (aim, charge, fire). It is stopped by what it would touch, and then plans again. It crushes the jeep it drives into, as the tanks do.
//  - DRONES: the four bay lids lift, up to four drones climb out in turn and go for the jeep (stage 4's drones); they fly low enough to clear a stack of two containers, not a taller pile.
import * as THREE from 'three';
import { HALF_WID, HALF_LEN } from './player.js';
import { rectsOverlap } from './tanks.js';
import { sfx } from './sfx.js';
import { addToLayer, REFLECT } from './layers.js';
import { PUDDLE } from './puddles.js';
import { buildWallMarker } from './arena.js';
import { tr } from './lang.js';

const ACTIVE_R = 62;                       // m: the jeep this close (and the boss on screen or near it) and the boss fights
const FIRST_WAIT = 1.2, WAIT = [.4, .9]; // s before the first attack, and between two
const WEIGHTS = { laser: 7, missiles: 2, drones: 1.4 };
// the beam
const TURN_FOLLOW = 1.7;                   // rad/s: the main turret follows the jeep all the time, like a tank's, not only once the beam starts to charge
const AIM_T = 1.0, CHARGE_T = .65, FIRE_T = .45, COOL_T = .6, TURN_AIM = 1.3, TURN_CHARGE = 2.6; // s, s, s, s; rad/s the turret turns while aiming, and while charging (fast: it cannot be outrun)
const LASER_RANGE = 44, BEAM_REACH = 52,   // m: the main gun only starts a beam when the jeep is this close (about a screen), and the beam goes no further
   BEAM_BLOCKS = new Set(['container', 'containerpile', 'wall', 'barracks', 'tent', 'hut', 'gate', 'column', 'warship', 'rock']);
const TALL = new Set(['B', 'K', 'L', 'X', 'F', 'n']), SHELL_BLOCKS = new Set(['container', 'containerpile', 'wall', 'barracks', 'tent', 'hut', 'gate', 'column', 'warship', 'rock']);
// the side guns
const SIDE_AIM = .75, SIDE_GAP = .34, SIDE_RELOAD = [2.6, 3.6], SIDE_RANGE = 32, SIDE_TURN = 2.2, SIDE_LIMIT = 1.9;
// the missiles
const VLS_OPEN_T = 1.1, VLS_GAP = .27, VLS_CLOSE_T = .8, VLS_FLIGHT = 50, VLS_CLIMB = 3.6;
// the drones
const BAY_OPEN_T = .9, BAY_GAP = .45, BAY_CLOSE_T = .7, DRONE_MAX = 3, DRONE_CRUISE = 5.6, DRONE_BLOCK = 4; // m: a pile with its top above this stops them (one container, 2.6 m, they fly over; two stacked, 5.2 m, no)

// The beam's surface: seen edge-on a soft red fade, hot white toward its axis (the closer the surface faces you, the brighter), rings of energy running down it, a little flicker. uCore 1: the thin white-hot inner tube.
const beamMat = core => new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  uniforms: { uTime: { value: 0 }, uAmt: { value: 0 }, uCore: { value: core } },
  vertexShader: `varying vec3 vN; varying vec3 vV; varying float vZ;
    void main() { vZ = position.z; vN = normalize( normalMatrix * normal ); vec4 mv = modelViewMatrix * vec4( position, 1.0 ); vV = normalize( - mv.xyz ); gl_Position = projectionMatrix * mv; }`,
  fragmentShader: `uniform float uTime, uAmt, uCore; varying vec3 vN; varying vec3 vV; varying float vZ;
    void main() {
      float f = pow( abs( dot( normalize( vN ), normalize( vV ) ) ), mix( 1.6, 2.4, uCore ) );
      float rings = .8 + .2 * sin( vZ * 90.0 - uTime * 55.0 ) * ( 1.0 - uCore ) + .1 * sin( vZ * 31.0 - uTime * 90.0 );
      vec3 col = mix( vec3( 1.0, .12, .06 ), vec3( 1.0, .62, .4 ), smoothstep( .35, .9, f ) );
      col = mix( col, vec3( 1.0, .97, .92 ), uCore * .85 + smoothstep( .75, 1.0, f ) * .5 );
      float a = f * rings * uAmt * ( .55 + .45 * smoothstep( 0.0, .06, vZ ) ) * ( 1.0 - .35 * smoothstep( .85, 1.0, vZ ) );
      gl_FragColor = vec4( col * a * 1.6, clamp( a, 0.0, 1.0 ) );
    }` });
// The beam in damp air: the light is scattered by the mist and the rain along its whole length, so it has a soft wide halo that thins out unevenly (the haze drifts through it), not a hard line. haloMat is that halo, seen through the
// tube's own thickness (brightest where the tube faces the eye, dying smoothly to its edge), with the haze's patchiness running down it; groundMat is the light it throws on the wet ground underneath.
const haloMat = () => new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  uniforms: { uTime: { value: 0 }, uAmt: { value: 0 } },
  vertexShader: `varying vec3 vN; varying vec3 vV; varying float vZ;
    void main() { vZ = position.z; vN = normalize( normalMatrix * normal ); vec4 mv = modelViewMatrix * vec4( position, 1.0 ); vV = normalize( - mv.xyz ); gl_Position = projectionMatrix * mv; }`,
  fragmentShader: `uniform float uTime, uAmt; varying vec3 vN; varying vec3 vV; varying float vZ;
    void main() {
      float f = abs( dot( normalize( vN ), normalize( vV ) ) );
      float soft = f * f * f;
      float haze = .68 + .32 * sin( vZ * 23.0 - uTime * 6.0 ) * sin( vZ * 9.0 + uTime * 3.1 ) + .12 * sin( vZ * 61.0 - uTime * 17.0 );
      vec3 col = mix( vec3( 1.0, .10, .05 ), vec3( 1.0, .45, .32 ), smoothstep( .4, 1.0, f ) );
      float a = soft * haze * uAmt * ( .6 + .4 * smoothstep( 0.0, .08, vZ ) );
      gl_FragColor = vec4( col * a, clamp( a, 0.0, 1.0 ) );
    }` });
const groundMat = () => new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  uniforms: { uTime: { value: 0 }, uAmt: { value: 0 } },
  vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 ); }`,
  fragmentShader: `uniform float uTime, uAmt; varying vec2 vUv;
    void main() {
      float x = ( vUv.x - .5 ) * 2.0;
      float a = exp( - x * x * 5.0 ) * uAmt * ( .75 + .25 * sin( vUv.y * 140.0 - uTime * 20.0 ) ) * smoothstep( 0.0, .03, vUv.y );
      gl_FragColor = vec4( vec3( 1.0, .16, .08 ) * a, clamp( a, 0.0, 1.0 ) );
    }` });
// movement
const HL = 4.3, HW = 2.8;                      // m: its half length and half width (the footprint it must keep clear)
const SPEED = 4.6, TURN_RATE = 1.8, TURN_FIRST = 1.3;   // m/s forward; rad/s it turns; the heading error (rad) beyond which it turns on the spot first
const NAV_CELL = 3, NAV_R = 2.8, REPLAN = 10, STAND_OFF = [8, LASER_RANGE - 6];   // m: the map grid's cells; the circle that must be clear round a cell (a bit over its half width); s between plans; the distances from the jeep it will take a firing place at
// hit points and the end
const START_R = 40;   // m: the jeep this near wakes the boss: the fight starts (the arena shuts behind the jeep, the boss attacks and can be hurt; until then it sits idle and is immune)
const CLOSE_IN = 11;   // m: how near it comes to the jeep before it stands
const HP = 192, DEATH_T = 3.2;   // a grenade or a rocket's blast takes 4 (a rocket's own blast once, its split shots once in all: 8 a volley at most); bullets do nothing (bulletProof)
const rnd = (a, b) => a + Math.random() * (b - a);
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
const approach = (v, to, step) => v < to ? Math.min(to, v + step) : Math.max(to, v - step);
const ease = x => { x = Math.min(1, Math.max(0, x)); return x * x * (3 - 2 * x); };
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3();

export class BossFight {
  constructor(scene, world, fx, enemyFire, statues, dronePads, boss, southLimit = Infinity) { // southLimit: the boss stays north of this z (minus its size): the yard's gate
    Object.assign(this, { scene, world, fx, enemyFire, statues, dronePads, boss, southLimit, time: 0, seq: { name: 'idle', t: 0, phase: '' }, idleIn: FIRST_WAIT, last: '', drones: [], lid: 0, bays: 0 });
    const g = n => boss.getObjectByName(n);
    this.turret = g('turret'); this.barrel = g('mainBarrel'); this.muzzle = g('mainMuzzle'); this.lens = g('mainLens'); this.coils = [1, 2, 3].map(n => g('coil' + n));
    this.vlsLid = g('vlsLid'); this.vlsMuzzles = Array.from({ length: 9 }, (_, i) => g('vlsMuzzle' + (i + 1))); this.bayLids = [1, 2, 3, 4].map(n => g('droneLid' + n)); this.bayMuzzles = [1, 2, 3, 4].map(n => g('droneSpawn' + n));
    this.ob = world.obstacles.find(o => o.kind === 'blocker' && Math.abs(o.x - boss.position.x) < .5 && Math.abs(o.z - boss.position.z) < .5) ?? null; // (the boss's own solid box: it moves with it)
    this.belts = ['treadFL', 'treadFR', 'treadRL', 'treadRR'].map(n => g(n)); this.path = null; this.planIn = 0; this.holding = false; this.stuck = 0;
    this.sides = ['L', 'R'].map((c, i) => ({ c, turret: g('sideTurret' + c), gun: g('sideGun' + c), muzzles: [g('sideMuzzle' + c + '1')], baseZ: g('sideGun' + c).position.z, limit: c === 'L' ? [-.2, 1.9] : [-1.9, .2], yaw: 0, state: 'idle', reload: 1.5 + i * 1.3, t: 0, shots: 0, kick: 0 }));
    // the beam, its sight line and the strip on the ground: additive, hidden until used
    const box = new THREE.BoxGeometry(1, 1, 1).translate(0, 0, .5), add = c => new THREE.MeshBasicMaterial({ color: c, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const mk = (geo, mat, order) => { const m = new THREE.Mesh(geo, mat); m.visible = false; m.frustumCulled = false; m.renderOrder = order; m.userData.noWater = true; m.layers.enable(PUDDLE); scene.add(m); return m; };
    this.sight = mk(box, add(0xff2a18), 8);
    const tube = new THREE.CylinderGeometry(.5, .5, 1, 24, 1, true).rotateX(Math.PI / 2).translate(0, 0, .5);
    this.beamGlow = mk(tube, beamMat(0), 9); this.beamCore = mk(tube, beamMat(1), 10);
    this.beamHalo = mk(tube, haloMat(), 7); this.sightHalo = mk(tube, haloMat(), 7); // (the scattered light round the beam, and round the aiming line)
    this.beamGround = mk(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2).translate(0, 0, .5), groundMat(), 6); // (and the glow it throws on the wet ground)
    this.beamA = new THREE.Vector3(); this.beamB = new THREE.Vector3();
    // hit points: a target the player's shots find (its box follows it, see syncTarget)
    Object.assign(this, { hp: HP, dead: false, deadT: 0, nextBang: 0, finale: false, queue: [], smokeIn: 0, flameIn: 0, sparkIn: 0, blastIn: 2, hud: null, hudHide: 0, started: false });
    this.target = { object: boss, x: boss.position.x, z: boss.position.z, hw: HW, hd: HL, r: 3.4, hp: HP, score: 20000, oncePerVolley: 2, bulletProof: true, boom: true, solidWreck: true, obstacle: this.ob,
      onHurt: () => { this.hp = this.target.hp; }, wreck: (debris, fx) => this.destroy(debris, fx) };
    if (this.ob) this.ob.isTarget = true;
    world.targets.push(this.target);
  }

  // ---- geometry helpers
  muzzlePos(out = _a) { this.boss.updateMatrixWorld(true); return this.muzzle.getWorldPosition(out); }
  // the first solid thing along the ray from (x, z) in direction (dx, dz): distance to it, or `reach`
  // From the muzzle: 0 if the gun itself is inside a solid pile (the barrel pushed into it), else as rayBlock from the muzzle on
  // debug: window.__beamDbg() in the game frame's console: what lies along the main gun's line now
  dbg() {
    const mp = this.muzzlePos(new THREE.Vector3()), f = this.forward(this.turret), out = [];
    for (const o of this.world.obstacles) { const rx = o.x - mp.x, rz = o.z - mp.z, al = rx * f.x + rz * f.z, sd = Math.abs(-rx * f.z + rz * f.x); if (al > -3 && al < 55 && sd < Math.max(o.hw, o.hd) + 3) out.push({ kind: o.kind, top: o.top, hw: o.hw, hd: o.hd, alive: o.alive, at: [+o.x.toFixed(1), +o.z.toFixed(1)], inList: this.blockL?.includes(o) }); }
    console.log('muzzle', mp.x.toFixed(1), mp.z.toFixed(1), 'len', this.beamLen(mp, f), out);
  }
  beamLen(mp, f, reach = BEAM_REACH) {
    const pv = this.pivot(), n = Math.max(1, Math.ceil(Math.hypot(mp.x - pv.x, mp.z - pv.z) / .5));
    for (let i = 1; i <= n; i++) if (this.rayBlock(pv.x + (mp.x - pv.x) * i / n, pv.z + (mp.z - pv.z) * i / n, 1, 0, .01, .5, 0) < .01) return 0;
    return this.rayBlock(mp.x, mp.z, f.x, f.z, reach, .5, 0);
  }
  rayBlock(x, z, dx, dz, reach = BEAM_REACH, step = .5, t0 = 3) {
    if (this.blockN !== this.world.obstacles.length) { this.blockN = this.world.obstacles.length; this.blockL = this.world.obstacles.filter(o => BEAM_BLOCKS.has(o.kind) && !((o.kind === 'container' || o.kind === 'containerpile') && !(o.top > 0))); } // (a single container, top 0, is shot over; a pile of two or more stops it)
    for (let t = t0; t < reach; t += step) {
      const px = x + dx * t, pz = z + dz * t;
      if (TALL.has(this.world.tileAt(px, pz))) return t;
      for (const o of this.blockL) if (o.alive && Math.abs(px - o.x) < o.hw && Math.abs(pz - o.z) < o.hd) return t;
    }
    return reach;
  }
  // where the main turret turns (its own axis, which does not move as it turns; the muzzle does)
  pivot() { this.boss.updateMatrixWorld(true); return this.turret.getWorldPosition(this._pv ??= new THREE.Vector3()); }
  // turn `turret` (a Group in the boss) toward the world point (tx, tz) at most `rate` rad/s; returns the remaining error
  swing(turret, from, tx, tz, rate, dt, limit = Infinity, parentYaw = this.boss.rotation.y) { // parentYaw: the world turn of what the turret sits on (the side turrets sit on the main one)
    const want = Math.atan2(-(tx - from.x), -(tz - from.z)) - parentYaw;
    let d = wrap(want - turret.rotation.y); const step = Math.max(-rate * dt, Math.min(rate * dt, d * Math.min(1, dt * 7)));   // (eases in: it slows as it closes on the aim, instead of stepping back and forth across it)
    const lo = Array.isArray(limit) ? limit[0] : -limit, hi = Array.isArray(limit) ? limit[1] : limit;   // (a limit is a number, either way, or [least, most])
    turret.rotation.y = Math.max(lo, Math.min(hi, turret.rotation.y + step)); return Math.abs(d);
  }
  forward(turret) { const yaw = this.boss.rotation.y + turret.rotation.y; return _c.set(-Math.sin(yaw), 0, -Math.cos(yaw)); }

  update(dt, { player, cam, killPlayer }) {
    this.time += dt;
    this.cam = cam;
    if (this.dead) { this.dying(dt); if (this.deadT < DEATH_T) cam.kick(.25 + .5 * this.deadT / DEATH_T); this.updateMarker(dt, player); this.updateHud(player); return; }
    if (!this.started) { // asleep: still, and not to be hurt (shots from afar do nothing) until the jeep comes near
      this.target.immune = true; this.syncTarget();
      const bq = this.boss.position;
      if (player.enabled && !player.dead && Math.hypot(player.position.x - bq.x, player.position.z - bq.z) < START_R) { this.started = true; this.target.immune = false; }
      else { this.updateHud(player); return; }
    }
    this.hp = this.target.hp; this.hurtFx(dt); this.lockCheck(player, cam); this.updateMarker(dt, player);
    const bp = this.boss.position, can = player.enabled && !player.dead, near = can && Math.hypot(player.position.x - bp.x, player.position.z - bp.z) < ACTIVE_R;
    this.live = can;
    const kill = () => { if (!this.live || player.invulnerable) return; this.live = false; killPlayer(); };
    this.move(dt, near, player, kill);
    this.syncTarget();
    this.sequencer(dt, near, player, cam, kill);
    const sq = this.seq, beamTurning = sq.name === 'laser' && (sq.phase === 'aim' || sq.phase === 'charge' || sq.phase === 'fire');
    if (near && !beamTurning) this.swing(this.turret, this.pivot(), player.position.x, player.position.z, TURN_FOLLOW, dt);
    this.sideGuns(dt, near, player, cam);
    // lids glide toward where the attack wants them; the coils and lens glow as the charge asks
    const open = (lid, k, max, rate) => lid && (lid.rotation.x = approach(lid.rotation.x, k * max, rate * dt));
    open(this.vlsLid, this.lid, 1.9, 1.9 / VLS_OPEN_T); this.bayLids.forEach(l => open(l, this.bays, 1.5, 1.5 / BAY_OPEN_T));
    this.drones = this.drones.filter(d => d.state !== 'dead');
    if (this.barrel) this.barrel.position.z = approach(this.barrel.position.z, 0, 1.6 * dt);
    this.updateHud(player);
  }

  // ---- the arena shuts behind the jeep: once it is through the gate (open, its cannons down) and well inside, the red curtain comes back across the doorway and the jeep cannot go south of it, until the boss is down
  lockCheck(player, cam) {
    const g = this.gate; if (!g || !this.started || this.locked || this.released || !g.isOpen || !player.enabled || player.dead || player.position.z > g.z - HALF_LEN - 1.2) return;   // (the jeep is wholly through the doorway)
    this.locked = true; cam.southLimit = g.z - HALF_LEN - .1; sfx.siren?.(2.5);   // (the jeep's centre may go no further south: the hazard strip, as in the earlier stages, shows where)
    this.marker = buildWallMarker({ mouth: [-g.halfGap, g.halfGap], south: g.z }); this.marker.group.children.forEach((m, i) => { m.renderOrder = 5 + i; m.userData.noWater = true; });   // (drawn after the wet road's film, which would otherwise cover the strip)
    this.marker.group.children[0].scale.y = 2.4;   // (a broader strip than before)
    this.scene.add(this.marker.group); this.markT = 0; this.markOut = 0;
  }
  unlock(cam) { this.released = true; this.locked = false; cam.southLimit = null; }
  updateMarker(dt, player) {
    const m = this.marker, g = this.gate; if (!m) return;
    this.markT += dt; if (!this.locked) this.markOut += dt;
    const show = Math.min(1, this.markT / .8) * Math.max(0, 1 - this.markOut / 1.5), near = Math.min(1, Math.max(0, 1 - (g.z - player.position.z - HALF_LEN) / 6));
    m.update(this.markT, show, near); if (show <= 0) { this.scene.remove(m.group); this.marker = null; }
  }

  // ---- hit points
  syncTarget() { // the shots' hit box: the footprint as it stands now
    const p = this.boss.position, sn = Math.abs(Math.sin(this.boss.rotation.y)), cs = Math.abs(Math.cos(this.boss.rotation.y)), t = this.target;
    t.x = p.x; t.z = p.z; t.hw = sn * HL + cs * HW; t.hd = cs * HL + sn * HW;
  }
  at(x, y, z) { this.boss.updateMatrixWorld(); return this.boss.localToWorld(new THREE.Vector3(x, y, z)); }
  // battle damage, by how much armour is left: smoke from the engine deck, then sparks and a second plume, then flames, then now and then a small blast
  hurtFx(dt) {
    const f = this.hp / HP, fx = this.fx; if (f > .75) return;
    if ((this.smokeIn -= dt) <= 0) {
      this.smokeIn = f > .5 ? .3 : f > .3 ? .16 : .09;
      const dark = f < .5 ? 0x1c1a18 : 0x34312d;
      fx.puff(this.at(.5, 3.0, 3.2), { color: dark, size: .6, grow: 2.6, life: 1.5, opacity: .55, soft: true, vel: new THREE.Vector3(rnd(-.4, .4), 2, rnd(-.4, .4)) });
      if (f < .5) fx.puff(this.at(-.6, 3.3, .2), { color: 0x24211e, size: .5, grow: 2.4, life: 1.3, opacity: .5, soft: true, vel: new THREE.Vector3(rnd(-.4, .4), 2.2, rnd(-.4, .4)) });
    }
    if (f < .5 && (this.sparkIn -= dt) <= 0) { this.sparkIn = rnd(.25, .7); fx.spark(this.at(rnd(-1.8, 1.8), rnd(1.5, 3.2), rnd(-3, 3))); }
    if (f < .3 && (this.flameIn -= dt) <= 0) {
      this.flameIn = .07;
      for (const [x, y, z] of [[.6, 3.0, 3.0], [-1.5, 2.6, -1.2]]) fx.puff(this.at(x + rnd(-.3, .3), y, z + rnd(-.3, .3)), { color: Math.random() < .4 ? 0xffd070 : 0xff6a14, size: .8, grow: -.4, life: .4, opacity: .85, additive: true, soft: true, vel: new THREE.Vector3(rnd(-.3, .3), 3 + Math.random() * 2, rnd(-.3, .3)) });
    }
    if (f < .15 && (this.blastIn -= dt) <= 0) { this.blastIn = rnd(1.3, 2.4); fx.explosion(this.at(rnd(-1.8, 1.8), rnd(1.5, 3), rnd(-3, 3)), .6); }
  }

  // ---- the end: the armour gives way in a run of blasts over the hull, the turret goes up, and the whole thing goes in one last great fireball
  destroy(debris, fx) {
    if (this.dead) return;
    Object.assign(this, { dead: true, hp: 0, deadT: 0, nextBang: 0, finale: false, queue: [], debris, vel: 0, angVel: 0 });
    this.endAttack(); this.setCharge(0); this.lid = 0; this.bays = 0;
    for (const d of this.drones) { try { this.dronePads.explode(d, false); } catch (e) { /* (already gone) */ } }
    this.drones = [];
  }
  hullMat() { return this.chunkMat ??= new THREE.MeshStandardMaterial({ color: 0x2b2d30, roughness: .65, metalness: .55 }); }   // (the hull's own materials take their colour from vertex colours the lumps do not have: they came out white)
  dying(dt) {
    const T = (this.deadT += dt), fx = this.fx;
    for (let i = this.queue.length - 1; i >= 0; i--) if (T >= this.queue[i].t) this.queue.splice(i, 1)[0].fn();
    if (T < DEATH_T) {
      const k = T / DEATH_T;
      if ((this.nextBang -= dt) <= 0) {
        this.nextBang = Math.max(.07, .24 - .17 * k);
        const p = this.at(rnd(-2, 2), rnd(.8, 3.2), rnd(-4, 4)); fx.explosion(p, rnd(.7, 1.3) + k * .8, Math.random() < .25);
        fx.puff(p.clone().setY(p.y + .5), { color: 0x1c1a18, size: .8, grow: 3, life: 1.6, opacity: .6, soft: true, vel: new THREE.Vector3(rnd(-1, 1), 3, rnd(-1, 1)) });
        if (this.debris && Math.random() < .6) this.debris.chunk(p, this.hullMat(), rnd(.12, .3), 2);
      }
      if ((this.flameIn -= dt) <= 0) { this.flameIn = .05; fx.puff(this.at(rnd(-1.5, 1.5), 3.0, rnd(-3, 3)), { color: Math.random() < .4 ? 0xffd070 : 0xff6a14, size: .9, grow: -.4, life: .45, opacity: .9, additive: true, soft: true, vel: new THREE.Vector3(rnd(-.4, .4), 4 + Math.random() * 3, rnd(-.4, .4)) }); }
      this.turret.rotation.y += Math.sin(T * 40) * .012;   // the turret shudders
    } else if (!this.finale) this.finalBlast();
    else if ((this.smokeIn -= dt) <= 0) { this.smokeIn = .35; fx.puff(this.at(rnd(-1.5, 1.5), 2.6, rnd(-3, 3)), { color: 0x151413, size: .9, grow: 3, life: 2.4, opacity: .55, soft: true, vel: new THREE.Vector3(rnd(-.3, .3), 2.4, rnd(-.3, .3)) }); }
  }
  finalBlast() {
    this.finale = true; this.cam?.kick(2);
    const fx = this.fx, c = this.boss.position, at = new THREE.Vector3(c.x, 2.4, c.z);
    this.charred();
    // the turret is thrown up and away
    const t = this.turret; this.scene.attach(t);
    this.debris?.launch(t, new THREE.Vector3(rnd(-3, 3), 15, rnd(-3, 3)), new THREE.Vector3(rnd(-2, 2), rnd(-3, 3), rnd(-2, 2)), .9, true);
    fx.explosion(at, 3.1, true); fx.flash(at, 4.5);
    const bang = (dt, dx, dz, s) => this.queue.push({ t: this.deadT + dt, fn: () => fx.explosion(new THREE.Vector3(c.x + dx, 2.2, c.z + dz), s, true) });
    bang(.1, 2.6, -2, 1.8); bang(.18, -2.6, 2.2, 1.8); bang(.3, 1, 3.4, 1.6); bang(.42, -2, -3.4, 1.6); bang(.6, 0, 0, 2.2);
    // a shock ring running out over the ground, and a second, darker one behind it
    for (let i = 0; i < 36; i++) {
      const a = i / 36 * Math.PI * 2, d = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
      fx.puff(at.clone().setY(.8), { color: 0xffe0a8, size: 1.0, grow: 2.2, life: .5, opacity: .85, additive: true, soft: true, vel: d.clone().multiplyScalar(10) });
      fx.puff(at.clone().setY(.9), { color: 0x2a2622, size: 1.2, grow: 2.6, life: 1.3, opacity: .45, soft: true, vel: d.clone().multiplyScalar(6) });
    }
    for (let i = 0; i < 16; i++) fx.puff(at.clone(), { color: i % 3 ? 0xff7a1e : 0xffd070, size: .9, grow: 2.2, life: .6 + Math.random() * .3, opacity: .9, additive: true, soft: true, vel: new THREE.Vector3(rnd(-4, 4), rnd(5, 10), rnd(-4, 4)) });
    if (this.debris) for (let i = 0; i < 26; i++) this.queue.push({ t: this.deadT + i * .025, fn: () => this.debris.chunk(at.clone().add(new THREE.Vector3(rnd(-2, 2), rnd(0, 1.5), rnd(-3, 3))), this.hullMat(), rnd(.15, .45), 3) });   // (a few a frame: building the lumps all at once was a hitch)
    fx.smoke(at.clone().setY(2), 30);
    fx.fires?.start([at.clone().add(new THREE.Vector3(1.4, -1.4, 2.4)), at.clone().add(new THREE.Vector3(-1.4, -1.4, -2)), at.clone().add(new THREE.Vector3(0, -1.2, .2))], 1.3, 90);
    this.hudHide = 2.4; this.onDefeated?.();   // (the stage is won five seconds after this last blast)
  }
  // The wreck is burnt black: each part its own darkened copy of its material
  charred() {   // (each material darkened in place: they are the boss's own copies (see wetten), and a colour change needs no new shader, where a clone would compile one)
    const done = new Set();
    this.boss.traverse(o => { if (!o.isMesh) return; for (const m of [].concat(o.material)) if (m && !m.isShaderMaterial && !done.has(m)) { done.add(m); m.color?.multiplyScalar(.28); m.emissive?.multiplyScalar(.3); } });
  }


  // Saved games: the armour left (a destroyed boss stays a wreck)
  snapshot() { return { hp: this.dead ? 0 : this.target.hp }; }
  restore(data, fx) {
    if (!data || data.hp === undefined) return;
    this.target.hp = this.hp = data.hp;
    if (data.hp <= 0 && !this.dead) {
      Object.assign(this, { dead: true, deadT: 99, finale: true, queue: [], released: true, started: true }); this.endAttack(); this.charred(); this.turret.rotation.y += .7;
      if (this.ob) this.ob.isTarget = false;
      const c = this.boss.position; fx?.fires?.start([new THREE.Vector3(c.x + 1.4, 1, c.z + 2.4), new THREE.Vector3(c.x - 1.4, 1, c.z - 2)], 1.3, 90);
    }
  }

  // ---- the armour bar, pinned along the top of the screen once the jeep is near (or it has been hurt)
  updateHud(player) {
    if (this.dead && this.hudHide > 0) this.hudHide -= 1 / 60;
    const bp = this.boss.position, near = this.started || this.hp < HP;
    if (!near || (this.dead && this.hudHide <= 0)) { if (this.hud) this.hud.root.style.display = 'none'; return; }
    if (!this.hud) {
      const root = document.createElement('div');
      Object.assign(root.style, { position: 'fixed', zIndex: 5, pointerEvents: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '5px', top: '14px', left: '50%', transform: 'translateX(-50%)',
        font: '700 14px/1 "Courier New", monospace', color: '#ffe8b4', letterSpacing: '.22em', textShadow: '-1px -1px 0 #0b0e06, 1px -1px 0 #0b0e06, -1px 1px 0 #0b0e06, 1px 1px 0 #0b0e06, 0 2px 3px rgba(0,0,0,.8)' });
      const label = document.createElement('div'); label.textContent = tr('FINAL BOSS');
      const bar = document.createElement('div'); Object.assign(bar.style, { width: 'min(360px, 50vw)', height: '14px', background: 'rgba(11,14,6,.75)', border: '2px solid #e8b877', boxShadow: '0 0 0 2px #0b0e06', position: 'relative' });
      const fill = document.createElement('div'); Object.assign(fill.style, { position: 'absolute', left: 0, top: 0, bottom: 0, width: '100%', transition: 'width .25s, background .25s' });
      bar.appendChild(fill); root.append(label, bar); (document.getElementById('frame') ?? document.body).appendChild(root); this.hud = { root, fill };
    }
    this.hud.root.style.display = 'flex';
    const f = Math.max(0, this.hp / HP); this.hud.fill.style.width = (f * 100).toFixed(1) + '%'; this.hud.fill.style.background = 'hsl(' + (108 * f).toFixed(0) + ', 70%, 48%)';
  }

  // ---- movement
  // Drive toward a place with a clear shot (or stand if it has one). v: speed, w: turn rate, for the tracks.
  move(dt, near, player, kill) {
    const b = this.boss, p = b.position, s = this.seq, beamNow = false;   // (it drives and fires at once: the main gun's aiming, charging and firing no longer stop it)
    let v = 0, w = 0; this.vel ??= 0; this.angVel ??= 0;
    if (near && !beamNow) {
      const dist = Math.hypot(player.position.x - p.x, player.position.z - p.z), covered = this.beamCovered(player);
      this.hadShot = !covered;
      this.holding = !covered && dist < (this.holding ? CLOSE_IN + 2 : CLOSE_IN);   // (a clear shot is not enough: like a light tank it keeps closing in, and stands only once it is near; a little slack either way, or it would flick between standing and driving)
      this.rush = !covered;   // (with a clear shot it drives straight at the jeep; without, to the nearest place that has one)
      if (!this.holding && player.enabled && !player.dead) {
        this.planIn -= dt;
        // it commits to a route: a new plan only when it has none, has arrived, is stopped, the jeep has gone well away from where the plan was made, or after a long while (replanning every second sent it back and forth)
        const pj = this.planJeep, last = this.path?.[this.path.length - 1];
        const moved = pj ? Math.hypot(player.position.x - pj.x, player.position.z - pj.z) : 99, arrived = last && Math.hypot(last.x - p.x, last.z - p.z) < 2.5;
        if (!this.path || this.planIn <= 0 || moved > 14 || arrived) { this.planIn = REPLAN; this.planJeep = { x: player.position.x, z: player.position.z }; this.path = this.plan(player); }
        const t = this.steerPoint(p);
        if (t) {
          let want = Math.atan2(-(t.x - p.x), -(t.z - p.z)), stay = false;
          if (this.hadShot) {   // it has a shot: it may only drive on a heading that keeps it (the nearest to the planned one that does; sideways a little rather than twisting the hull about), else it stands still, hull and all
            let pick = null;
            if (this.ob) this.ob.alive = false;
            for (const dh of this.lastDh !== undefined ? [this.lastDh, 0, .3, -.3, .6, -.6, .9, -.9, 1.3, -1.3] : [0, .3, -.3, .6, -.6, .9, -.9, 1.3, -1.3]) { const h = want + dh, qx = p.x - Math.sin(h) * 3, qz = p.z - Math.cos(h) * 3; if (!this.world.blocked(qx, qz, (this.navR ?? NAV_R) - .9) && this.shotFrom(qx, qz, player)) { pick = h; this.lastDh = dh; break; } }   // (the offset it used last time is tried first, so it does not flip between two)
            if (this.ob) this.ob.alive = true;
            if (pick === null) stay = true; else want = pick;
          }
          // the heading it wants eases toward the new target rather than jumping (a new plan or a new spot never snaps the hull round: it swings there, and a target that flickers between two is averaged out)
          this.hd = this.hd === undefined || Math.abs(wrap(this.hd - b.rotation.y)) > 1.5 ? b.rotation.y : this.hd; this.hd += wrap(want - this.hd) * Math.min(1, dt * 2.2); want = this.hd;
          const err = wrap(want - b.rotation.y); this.lastErr = err;
          if (stay) { v = 0; w = 0; } else w = Math.max(-TURN_RATE, Math.min(TURN_RATE, err * 2));
          if (!stay) v = Math.abs(err) < TURN_FIRST ? SPEED * (1 - .6 * Math.abs(err) / TURN_FIRST) : 0;   // (it keeps driving through a bend, slower the sharper it is)
          if (Math.hypot(t.x - p.x, t.z - p.z) < 1.5) v = Math.min(v, SPEED * .5);
        }
      }
    }
    // still wedged after backing up: it picks the heading with the most open room (the wider-reaching of 16, a tighter margin than usual) and drives that way for a couple of seconds before it plans again
    if (this.unstickT > 0) {
      this.unstickT -= dt; const err = wrap(this.escapeYaw - b.rotation.y);
      w = Math.max(-TURN_RATE, Math.min(TURN_RATE, err * 2)); v = Math.abs(err) < .9 ? SPEED * .7 : 0; this.reverseT = 0;
    }
    // wedged (the way ahead refused several times running): it backs up a few metres, swinging its tail round, and plans afresh from there, as a driver would
    if (this.reverseT > 0 && !(this.unstickT > 0)) { this.reverseT -= dt; v = -SPEED * .6; w = this.revTurn * TURN_RATE * .7; }
    // pushed into a pile (it clipped one): it slides out toward the nearest clear ground before anything else, so it can never be wedged for good
    if (this.ob) this.ob.alive = false;
    if (this.world.blocked(p.x, p.z, 1.6)) {
      let e = null;
      for (const R of [1.5, 3, 4.5, 6, 8, 11]) { for (let k = 0; k < 16 && !e; k++) { const an = k / 16 * Math.PI * 2, x = p.x + Math.cos(an) * R, z = p.z + Math.sin(an) * R; if (!this.world.blocked(x, z, 2.2) && z < this.southLimit - 7) e = { x, z }; } if (e) break; }
      if (e) { const d = Math.hypot(e.x - p.x, e.z - p.z) || 1, st = Math.min(d, 2.6 * dt); p.x += (e.x - p.x) / d * st; p.z += (e.z - p.z) / d * st; this.stuck = 0; }
    }
    if (this.ob) this.ob.alive = true;
    // speeds ease toward what is wanted (it accelerates, brakes and turns gradually, and so moves in smooth curves)
    this.vel = approach(this.vel, v, (v > this.vel ? 3 : 5) * dt); this.angVel = approach(this.angVel, w, 3.4 * dt); v = this.vel; w = this.angVel;
    if (Math.abs(v) > .01 || Math.abs(w) > .01) {
      let yaw = b.rotation.y + w * dt, nx = p.x - Math.sin(yaw) * v * dt, nz = p.z - Math.cos(yaw) * v * dt;
      let free = true;
      if (v > 0 && this.hadShot && player.enabled && !player.dead && !this.shotFrom(nx, nz, player)) { yaw = b.rotation.y; v = 0; this.vel = 0; this.angVel = 0; }   // (it has a shot now, and the next step would lose it: it stays and keeps firing rather than drive into cover)
      else if (v !== 0) {
        if (this.ob) this.ob.alive = false;
        const R = this.unstickT > 0 ? 1.6 : (this.navR ?? NAV_R) - .9;
        free = (nz < this.southLimit - 6 || nz <= p.z) && (!this.world.blocked(nx, nz, R) || (this.world.blocked(p.x, p.z, R) && !this.world.blocked(nx, nz, 1.6)));   // (already pressed against something: it may still drive out, as long as it is not into it)   // (the same circle the planner and steering keep clear, so a route it planned is never refused)
        if (this.ob) this.ob.alive = true;
      }
      if (free) { if (v !== 0) { p.x = nx; p.z = nz; } b.rotation.y = yaw; this.stuck = 0; }
      else { b.rotation.y = yaw; v = 0; if (this.reverseT > 0) this.reverseT = 0; if (Math.abs(this.lastErr ?? 0) > .45 && !this.reverseT) this.stuck = 0;   // (the way along its present heading is shut but it is not yet pointing where it wants: it is only turning on the spot, not jammed)
      else if ((this.stuck += dt) > .9) { this.stuck = 0; this.planIn = 0; this.path = null; this.jam = (this.jam ?? 0) + 1; this.reverseT = 1.3; this.revTurn = this.jam % 2 ? 1 : -1;
        if (this.time - (this.lastJamT ?? -99) < 5) {   // (jammed again soon after: backing up was not enough)
          let bestD = -1, bestA = b.rotation.y; if (this.ob) this.ob.alive = false;
          for (let k = 0; k < 16; k++) { const h = k / 16 * Math.PI * 2; let d = 0; while (d < 12 && !this.world.blocked(p.x - Math.sin(h) * (d + 1.5), p.z - Math.cos(h) * (d + 1.5), 1.6) && p.z - Math.cos(h) * (d + 1.5) < this.southLimit - 6) d += 1.5; const toJeep = Math.cos(wrap(h - Math.atan2(-(player.position.x - p.x), -(player.position.z - p.z)))); if (d + toJeep > bestD) { bestD = d + toJeep; bestA = h; } }
          if (this.ob) this.ob.alive = true; this.escapeYaw = bestA; this.unstickT = 2.2; this.reverseT = 0;
        }
        this.lastJamT = this.time; if (this.jam % 3 === 0) console.log('boss jammed', { at: [+p.x.toFixed(1), +p.z.toFixed(1)], yaw: +b.rotation.y.toFixed(2) }); } }   // (stopped by something: it plans again)
      if (v > 0 && player.enabled && !player.dead && !player.invulnerable && rectsOverlap({ x: p.x, z: p.z, yaw: b.rotation.y, hl: HL, hw: HW }, { x: player.position.x, z: player.position.z, yaw: player.yaw, hl: HALF_LEN, hw: HALF_WID })) kill();   // (it drives over the jeep)
      p.y = this.world.heightAt ? this.world.heightAt(p.x, p.z) : 0;
    }
    if (this.ob) { const sn = Math.abs(Math.sin(b.rotation.y)), cs = Math.abs(Math.cos(b.rotation.y)); Object.assign(this.ob, { x: p.x, z: p.z, hw: sn * HL + cs * HW, hd: cs * HL + sn * HW }); }
    const left = v - w * 1.6, right = v + w * 1.6, k = dt * .45;   // the tracks turn with it (the belts' own direction may need flipping: see the sign)
    this.belts.forEach(m => { if (m) { const side = m.name.endsWith('L') ? left : right; m.material.map.offset.y = (m.material.map.offset.y + side * k) % 1; } });
  }

  // the place to drive to, and the way: a flood over a grid of 3 m cells (a cell is closed if a circle of NAV_R at its centre would touch anything), from the boss outward, cheapest first; the first cell in that order that is
  // between STAND_OFF from the jeep and has a clear beam line to it is the goal (failing that, the reachable cell nearest the jeep)
  plan(player) {
    let best = null;
    for (const R of [NAV_R, 2.5, 2.2, 2.0]) { // (the usual margin first; in a tight maze, tighter ones until some way through reaches a firing place)
      const r = this.planR(player, R); if (r.found && r.path.length) { this.navR = R; return this.smooth(r.path); }
      if (!best || (r.path.length && !best.path.length)) best = r;
    }
    this.navR = NAV_R; return best ? this.smooth(best.path) : [];
  }
  // a straight run from a to b with room for the hull all along?
  clearRun(a, b, R) {
    const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 1.5));
    for (let k = 1; k <= n; k++) { const qx = a.x + (b.x - a.x) * k / n, qz = a.z + (b.z - a.z) * k / n; if (qz > this.southLimit - 6 || this.world.blocked(qx, qz, R)) return false; }
    return true;
  }
  // the cell-to-cell route pulled tight: from where it is, on to the farthest point of the route it can drive straight to, and so on (a few long runs instead of a staircase of cells)
  smooth(raw) {
    if (!raw.length) return raw;
    const p = this.boss.position, R = (this.navR ?? NAV_R) - .9, out = [{ x: p.x, z: p.z }];
    if (this.ob) this.ob.alive = false;
    let anchor = out[0], i = 0;
    while (i < raw.length) {
      let j = raw.length - 1; while (j > i && !this.clearRun(anchor, raw[j], R)) j--;
      out.push(raw[j]); anchor = raw[j]; i = j + 1;
    }
    if (this.ob) this.ob.alive = true;
    this.segI = 0; return out;
  }
  planR(player, NAV_R) {
    const p = this.boss.position, C = NAV_CELL, PAD = LASER_RANGE;
    const x0 = Math.floor((Math.min(p.x, player.position.x) - PAD) / C) * C, z0 = Math.floor((Math.min(p.z, player.position.z) - PAD) / C) * C, W = Math.min(64, Math.ceil((Math.max(p.x, player.position.x) + PAD - x0) / C)), H = Math.min(64, Math.ceil((Math.max(p.z, player.position.z) + PAD - z0) / C));
    const closed = new Int8Array(W * H), cx = i => x0 + ((i % W) + .5) * C, cz = i => z0 + (Math.floor(i / W) + .5) * C;
    if (this.ob) this.ob.alive = false;
    // the arena's map is baked a cell at a time, as the boss first needs each (the grid is aligned to the world, so a cell is the same cell in every plan); kept a while, then forgotten, in case something has been blown up
    if (this.time - (this.navAt ?? -99) > 15) { this.navAt = this.time; this.navCache = new Map(); this.viewCache = new Map(); }
    const blocked = i => {
      if (closed[i] !== 0) return closed[i] === 1;
      const key = Math.round(cx(i) / C) * 4096 + Math.round(cz(i) / C) + '/' + NAV_R; let v = this.navCache.get(key);
      if (v === undefined) { v = (cz(i) > this.southLimit - 7 || this.world.blocked(cx(i), cz(i), NAV_R)) ? 1 : 2; this.navCache.set(key, v); }
      closed[i] = v; return v === 1;
    };
    const sc = Math.min(W - 1, Math.max(0, Math.floor((p.x - x0) / C))), sr = Math.min(H - 1, Math.max(0, Math.floor((p.z - z0) / C))), s0 = sr * W + sc;
    const g = new Float32Array(W * H).fill(Infinity), from = new Int32Array(W * H).fill(-1), done = new Uint8Array(W * H), order = [], heap = [];
    const push = (f, i) => { heap.push([f, i]); let a = heap.length - 1; while (a > 0) { const q = (a - 1) >> 1; if (heap[q][0] <= heap[a][0]) break; [heap[a], heap[q]] = [heap[q], heap[a]]; a = q; } };
    const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let a = 0; for (;;) { const l = a * 2 + 1, r = l + 1; let m = a; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === a) break; [heap[a], heap[m]] = [heap[m], heap[a]]; a = m; } } return top; };
    g[s0] = 0; push(0, s0);
    while (heap.length) {
      const [, i] = pop(); if (done[i]) continue; done[i] = 1; order.push(i);
      const ic = i % W, ir = Math.floor(i / W);
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
        if (!dr && !dc) continue; const c = ic + dc, r = ir + dr; if (c < 0 || c >= W || r < 0 || r >= H) continue; const j = r * W + c;
        if (done[j] || blocked(j)) continue;
        if (dr && dc && (blocked(ir * W + c) || blocked(r * W + ic))) continue;
        const ng = g[i] + (dr && dc ? Math.SQRT2 : 1); if (ng < g[j]) { g[j] = ng; from[j] = i; push(ng, j); }
      }
    }
    if (this.ob) this.ob.alive = true;
    const jx = player.position.x, jz = player.position.z;
    let goal = -1, tests = 0, nearest = s0, nd = Infinity, bestI = -1;
    const rush = !!this.rush;
    // a firing place: the line from the muzzle (about 4.5 m out) to the jeep clear, and how WIDE the view is: the same line shifted 1.2 and 2.4 m to either side (5 lines in all), so a place that only just grazes past a pile's corner scores low
    const jk = Math.round(jx / 1.5) * 4096 + Math.round(jz / 1.5);   // (a view is remembered for a jeep in the same 1.5 m square)
    const lineAt = (i, off) => {
      const key = Math.round(cx(i) / C) * 4096 + Math.round(cz(i) / C) + '|' + jk + '|' + off, hit = this.viewCache.get(key); if (hit !== undefined) return hit;
      const dx = jx - cx(i), dz = jz - cz(i), d = Math.hypot(dx, dz), ux = dx / d, uz = dz / d, r = this.rayBlock(cx(i) + ux * 4.5 - uz * off, cz(i) + uz * 4.5 + ux * off, ux, uz, d - 4.5, 1) >= d - 4.5 - 1; this.viewCache.set(key, r); return r;
    };
    const good = i => { const d = Math.hypot(jx - cx(i), jz - cz(i)); return i !== s0 && d >= STAND_OFF[0] && d <= STAND_OFF[1] && lineAt(i, 0); };
    const view = i => [-2.4, -1.2, 0, 1.2, 2.4].reduce((n, o) => n + (lineAt(i, o) ? 1 : 0), 0);
    // it keeps to the place it chose while that still gives a good view (the jeep moving a little does not send it somewhere else every plan)
    if (!rush && this.goalAt) { const gc = Math.floor((this.goalAt.x - x0) / C), gr = Math.floor((this.goalAt.z - z0) / C); if (gc >= 0 && gc < W && gr >= 0 && gr < H && done[gr * W + gc] && good(gr * W + gc) && view(gr * W + gc) >= 4) goal = gr * W + gc; }
    let firstG = -1, bestV = -1;
    for (const i of order) {
      const d = Math.hypot(jx - cx(i), jz - cz(i));
      if (d < nd && (!rush || d >= CLOSE_IN - 2)) { nd = d; nearest = i; }
      if (!rush && goal < 0 && tests < 500 && d >= STAND_OFF[0] && d <= STAND_OFF[1]) {   // (the first firing place in order of cost, and any within a few cells' more driving: the one with the widest view of them wins)
        if (firstG >= 0 && g[i] > firstG + 5) { if (bestI >= 0) break; }
        else { tests++; if (good(i)) { if (firstG < 0) firstG = g[i]; const v = view(i); if (v > bestV) { bestV = v; bestI = i; if (v === 5) break; } } }
      }
    }
    if (!rush && goal < 0 && bestI >= 0) goal = bestI;
    this.goalAt = goal >= 0 ? { x: cx(goal), z: cz(goal) } : null;
    const found = rush ? nearest !== s0 : goal >= 0; if (goal < 0) goal = nearest;
    const path = []; for (let i = goal; i >= 0 && i !== s0; i = from[i]) path.push({ x: cx(i), z: cz(i) });
    return { path: path.reverse(), found };
  }
  // where it steers now: a point a few metres further along its route (pure pursuit: it curves through the bends instead of aiming at each corner); the look-ahead shortens if the straight run to it is not clear
  steerPoint(p) {
    const r = this.path; if (!r || r.length < 2) return null;
    let k = Math.min(this.segI ?? 0, r.length - 2), bd = Infinity, bk = k, bt = 0;
    for (let q = k; q < Math.min(r.length - 1, k + 4); q++) {   // (the nearest of the next few legs, never going back)
      const ax = r[q].x, az = r[q].z, dx = r[q + 1].x - ax, dz = r[q + 1].z - az, L2 = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((p.x - ax) * dx + (p.z - az) * dz) / L2)), d = Math.hypot(ax + dx * t - p.x, az + dz * t - p.z);
      if (d < bd - .01) { bd = d; bk = q; bt = t; }
    }
    this.segI = bk;
    const at = L => {
      let q = bk, off = Math.hypot(r[bk + 1].x - r[bk].x, r[bk + 1].z - r[bk].z) * bt + L;
      for (; q < r.length - 1; q++) { const len = Math.hypot(r[q + 1].x - r[q].x, r[q + 1].z - r[q].z); if (off <= len || q === r.length - 2) { const t = Math.min(1, off / (len || 1)); return { x: r[q].x + (r[q + 1].x - r[q].x) * t, z: r[q].z + (r[q + 1].z - r[q].z) * t }; } off -= len; }
      return r[r.length - 1];
    };
    if (this.ob) this.ob.alive = false;
    let pick = at(1.5);
    for (const L of [9, 6, 3.5]) { const q = at(L); if (this.clearRun(p, q, (this.navR ?? NAV_R) - .9)) { pick = q; break; } }
    if (this.ob) this.ob.alive = true;
    return pick;
  }

  // ---- the main sequencer: idle -> one attack -> idle ...
  sequencer(dt, near, player, cam, kill) {
    const s = this.seq;
    if (!near) { if (s.name !== 'idle') this.endAttack(); this.idleIn = Math.max(this.idleIn, 1); this.setCharge(0); this.lid = 0; this.bays = 0; return; }
    if (s.name === 'idle') {
      this.lid = 0; this.bays = 0; this.setCharge(0);
      if ((this.idleIn -= dt) > 0) return;
      const covered = this.beamCovered(player);   // the jeep is behind a pile of two or more: the beam would be stopped, so the gun does not start one (once it is charging, it goes through with it)
      const bp = this.boss.position, inRange = Math.hypot(player.position.x - bp.x, player.position.z - bp.z) < LASER_RANGE;
      const options = Object.keys(WEIGHTS).filter(k => (k === 'laser' || k !== this.last) && (k !== 'drones' || this.drones.length < DRONE_MAX) && (k !== 'laser' || (!covered && inRange)));
      if (!options.length) { this.idleIn = .8; this.last = ''; return; }   // (nothing it can do just now: look again shortly)
      let r = Math.random() * options.reduce((t, k) => t + WEIGHTS[k], 0), pick = options[0];
      for (const k of options) { if ((r -= WEIGHTS[k]) <= 0) { pick = k; break; } }
      Object.assign(s, { name: pick, t: 0, phase: pick === 'laser' ? 'aim' : pick === 'missiles' ? 'open' : 'open', n: 0 }); this.last = pick;
      return;
    }
    s.t += dt;
    if (s.name === 'laser') this.laser(dt, player, kill);
    else if (s.name === 'missiles') this.missiles(dt, player);
    else if (s.name === 'drones') this.launchDrones(dt, player);
  }
  // Would a beam from the main gun to the jeep be stopped before it got there?
  // would the main gun have a clear line to the jeep from a boss standing at (x, z)? (tested from the muzzle, about 4.5 m out, as the gun itself fires)
  shotFrom(x, z, player) {
    const dx = player.position.x - x, dz = player.position.z - z, d = Math.hypot(dx, dz); if (d < 6) return true;
    return this.rayBlock(x + dx / d * 4.5, z + dz / d * 4.5, dx / d, dz / d, d - 4.5, 1) >= d - 4.5 - 1;
  }
  beamCovered(player) {
    const mp = this.muzzlePos(new THREE.Vector3()), dx = player.position.x - mp.x, dz = player.position.z - mp.z, d = Math.hypot(dx, dz) || 1;
    return this.beamLen(mp, { x: dx / d, z: dz / d }, d) < d - .5;
  }
  endAttack() { this.seq.name = 'idle'; this.seq.t = 0; this.idleIn = rnd(...WAIT); this.sight.visible = this.beamGlow.visible = this.beamCore.visible = this.beamHalo.visible = this.sightHalo.visible = this.beamGround.visible = false; this.lid = 0; this.bays = 0; }

  // coil / lens glow, 0 .. 1 of full
  setCharge(k) { const e = .3 + 4.2 * k; this.coils.forEach((c, i) => { if (c) c.material.emissiveIntensity = .3 + (e - .3) * Math.min(1, k * 1.4 - i * .12 + .12); }); if (this.lens) this.lens.material.emissiveIntensity = e; }

  // ---- the beam
  laser(dt, player, kill) {
    const s = this.seq, mp = this.muzzlePos(_a), px = player.position.x, pz = player.position.z;
    if (s.phase === 'aim' || s.phase === 'charge') {
      this.swing(this.turret, this.pivot(), px, pz, s.phase === 'aim' ? TURN_AIM : TURN_CHARGE, dt);
      const f = this.forward(this.turret), len = this.beamLen(mp, f), end = _b.set(mp.x + f.x * len, .4, mp.z + f.z * len);
      const charge = s.phase === 'aim' ? s.t / AIM_T * .35 : .35 + .65 * (s.t / CHARGE_T);
      this.setCharge(charge);
      // the sight: a thin line the whole way in AIM; in CHARGE it becomes a pulsing strip on the ground and the line brightens
      const pulse = s.phase === 'charge' ? .55 + .45 * Math.sin(this.time * 28) : 1;
      this.aimAt(this.sight, mp, end, s.phase === 'aim' ? .06 : .12, s.phase === 'aim' ? .35 : .5 * pulse + .3);
      this.aimAt(this.sightHalo, mp, end, s.phase === 'aim' ? .9 : 1.9, (s.phase === 'aim' ? .22 : .45 * pulse + .15)); this.sightHalo.material.uniforms.uTime.value = this.time % 100; // (the mist lights up along the aiming line)
      this.motes(dt, mp, end, s.phase === 'aim' ? 5 : 14, .7);
      if (s.phase === 'aim' && s.t >= AIM_T) { s.phase = 'charge'; s.t = 0; }
      else if (s.phase === 'charge' && s.t >= CHARGE_T) this.fireBeam(player, kill);
    } else if (s.phase === 'fire') {
      const k = s.t / FIRE_T; this.beamGlow.material.uniforms.uAmt.value = Math.min(1, s.t / .05) * (1 - k * k); this.beamCore.material.uniforms.uAmt.value = Math.min(1, s.t / .05) * Math.min(1, (1 - k) * 1.6); for (const m of [this.beamGlow, this.beamCore]) m.material.uniforms.uTime.value = this.time % 100; this.setCharge(Math.max(0, 1 - k * 2));
      this.beamGlow.scale.x = this.beamGlow.scale.y = this.beamGlow.userData.w * (1 - .5 * k); this.beamCore.scale.x = this.beamCore.scale.y = this.beamCore.userData.w * (1 - .6 * k);
      const env = Math.min(1, s.t / .05) * (1 - k * k), flick = 1 + .12 * Math.sin(this.time * 71) + .08 * Math.sin(this.time * 123); // (a slight flicker, as the mist crosses it)
      this.beamHalo.material.uniforms.uAmt.value = .85 * env * flick; this.beamHalo.material.uniforms.uTime.value = this.time % 100; this.beamHalo.scale.x = this.beamHalo.scale.y = this.beamHalo.userData.w * (1 - .35 * k);
      this.beamGround.material.uniforms.uAmt.value = .55 * env * flick; this.beamGround.material.uniforms.uTime.value = this.time % 100;
      this.motes(dt, this.beamA, this.beamB, 70, 1.6); // (droplets and haze caught in the light, flung about by it)
      if (s.t >= FIRE_T) { this.beamGlow.visible = this.beamCore.visible = this.beamHalo.visible = this.beamGround.visible = this.sightHalo.visible = false; s.phase = 'cool'; s.t = 0; }
    } else if (s.phase === 'cool') {
      this.setCharge(0); if (s.t >= COOL_T) this.endAttack();
    }
  }
  fireBeam(player, kill) {
    this.cam?.kick(.6);
    const s = this.seq, mp = this.muzzlePos(_a), px = player.position.x, pz = player.position.z;
    this.swing(this.turret, this.pivot(), px, pz, 99, 1);          // (a last snap onto the jeep: the beam is instant)
    const f = this.forward(this.turret).clone(), mpf = this.muzzlePos(new THREE.Vector3()), block = this.beamLen(mpf, f);
    const rx = px - mpf.x, rz = pz - mpf.z, along = rx * f.x + rz * f.z, side = Math.abs(rx * -f.z + rz * f.x);
    const hit = along > 0 && along < block && side < HALF_WID + .5;  // the jeep is on the line, and nothing solid is in front of it
    const len = block, end = new THREE.Vector3(mpf.x + f.x * len, 1.0, mpf.z + f.z * len), spot = hit ? new THREE.Vector3(mpf.x + f.x * along, .6, mpf.z + f.z * along) : end;   // (the beam runs its whole length at about the jeep's height, a screen long, through the jeep when it is hit, not down to the ground at it; the sparks and splash are where it strikes)
    this.sight.visible = false;
    this.aimAt(this.beamGlow, mpf, end, 1.7, 0); this.beamGlow.userData.w = 1.7; this.aimAt(this.beamCore, mpf, end, .5, 0); this.beamCore.userData.w = .5;
    this.sightHalo.visible = false; this.beamA.copy(mpf); this.beamB.copy(end);
    this.aimAt(this.beamHalo, mpf, end, 6.5, 0); this.beamHalo.userData.w = 6.5;   // (the halo: the mist scatters the light about three metres out from the beam)
    this.aimAt(this.beamGround, mpf.clone().setY(.05), end.clone().setY(.05), 5, 0);
    this.motes(0, mpf, end, 0, 1.6, 26, 1); // (a burst of haze along it as it fires)
    this.barrel.position.z = .6;                                    // recoil
    this.fx.cannonLight?.(mpf.clone(), f, true); this.fx.hitHard?.(spot);
    this.fx.holdLight?.(mpf.clone().lerp(end, .5), FIRE_T + .15, 9, 24); this.fx.holdLight?.(spot, FIRE_T + .1, 8, 18);   // (the beam lights the ground along its length, and where it ends)
    for (let n = 0; n < 12; n++) this.fx.puff(spot.clone().setY(.4), { color: Math.random() > .5 ? 0xffe0c0 : 0xff6040, size: .08 + Math.random() * .06, grow: 0, life: .3 + Math.random() * .4, opacity: 1, additive: true, reflect: false, gravity: 7, vel: new THREE.Vector3((Math.random() - .5) * 8, 1 + Math.random() * 4, (Math.random() - .5) * 8) });
    this.fx.puff(mpf.clone().addScaledVector(f, 1.2), { color: 0xffd8c0, size: 1.4, grow: -1.2, life: .2, opacity: .9, additive: true, soft: true, reflect: false });   // flare at the muzzle
    this.fx.puff(spot.clone().setY(.6), { color: 0xff5030, size: 2.4, grow: -1.6, life: .35, opacity: .9, additive: true, soft: true, reflect: false });          // splash where it ends
    this.fx.puff(spot.clone().setY(.5), { color: 0xfff0e0, size: 1.0, grow: -.8, life: .22, opacity: 1, additive: true, soft: true, reflect: false });
    sfx.enemyShot?.(mpf, true, true);
    if (hit) kill();
    s.phase = 'fire'; s.t = 0;
  }
  // Droplets and haze in the beam's light: `rate` lit specks a second (and `burst` at once) at random places along a to b, within `spread` m of it, drifting a little
  motes(dt, a, b, rate, spread, burst = 0, big = 0) {
    this.moteAcc = (this.moteAcc ?? 0) + dt * rate; let n = burst + Math.floor(this.moteAcc); this.moteAcc -= Math.floor(this.moteAcc);
    for (; n > 0; n--) {
      const u = Math.random(), x = a.x + (b.x - a.x) * u + (Math.random() - .5) * 2 * spread, z = a.z + (b.z - a.z) * u + (Math.random() - .5) * 2 * spread, y = (a.y + (b.y - a.y) * u) + (Math.random() - .3) * spread * .8;
      const hot = Math.random() < .5, v = new THREE.Vector3((Math.random() - .5) * 1.5, (Math.random() - .3) * 1.2, (Math.random() - .5) * 1.5);
      this.fx.puff(new THREE.Vector3(x, Math.max(.1, y), z), { color: hot ? 0xffd0c0 : 0xff4a2c, size: hot ? .07 + Math.random() * .06 : .5 + Math.random() * .6 * (big ? 1 : .5), grow: hot ? 0 : .9, life: hot ? .3 + Math.random() * .4 : .45 + Math.random() * .4, opacity: hot ? .95 : .16, additive: true, soft: !hot, reflect: false, vel: v });
    }
  }
  // place a beam-shaped mesh from a to b, `w` wide, at opacity o
  aimAt(mesh, a, b, w, o) { mesh.visible = true; mesh.position.copy(a); mesh.lookAt(b); mesh.scale.set(w, w, a.distanceTo(b)); if (mesh.material.uniforms) mesh.material.uniforms.uAmt.value = o; else mesh.material.opacity = o; }

  // ---- the missiles
  missiles(dt, player) {
    const s = this.seq;
    if (s.phase === 'open') {
      this.lid = 1; // the lid swings up: the warning
      if (Math.random() < dt * 14) { const m = this.vlsMuzzles[Math.floor(Math.random() * 9)].getWorldPosition(_b); this.fx.puff(m, { color: 0xff3a18, size: .22, grow: .5, life: .25, opacity: .8, additive: true, soft: true, reflect: false }); }
      if (s.t >= VLS_OPEN_T) { s.phase = 'volley'; s.t = 0; s.n = 0; this.nextShot = 0; }
    } else if (s.phase === 'volley') {
      this.nextShot -= dt;
      while (this.nextShot <= 0 && s.n < 9) {
        const from = this.vlsMuzzles[s.n].getWorldPosition(new THREE.Vector3()), at = this.enemyFire.aimAgo(.5, new THREE.Vector3());
        this.statues.shoot(from, Math.atan2(-(at.x - from.x), -(at.z - from.z)), at, this.world, VLS_FLIGHT, VLS_CLIMB, false, 1, 1, true);
        s.n++; this.nextShot += VLS_GAP;
      }
      if (s.n >= 9 && s.t > 9 * VLS_GAP + .4) { s.phase = 'close'; s.t = 0; }
    } else if (s.phase === 'close') { this.lid = 0; if (s.t >= VLS_CLOSE_T) this.endAttack(); }
  }

  // ---- the drones
  launchDrones(dt, player) {
    const s = this.seq;
    if (s.phase === 'open') {
      this.bays = 1;
      if (Math.random() < dt * 10) { const m = this.bayMuzzles[Math.floor(Math.random() * 4)].getWorldPosition(_b); this.fx.puff(m, { color: 0xffa020, size: .2, grow: .5, life: .25, opacity: .8, additive: true, soft: true, reflect: false }); }
      if (s.t >= BAY_OPEN_T) { s.phase = 'launch'; s.t = 0; s.n = 0; this.nextShot = 0; }
    } else if (s.phase === 'launch') {
      this.nextShot -= dt;
      while (this.nextShot <= 0 && s.n < 4) {
        if (this.drones.length < DRONE_MAX) {      // (never more than DRONE_MAX in the air at once)
          const p = this.bayMuzzles[s.n].getWorldPosition(new THREE.Vector3()), d = this.dronePads.release(p.x, p.y, p.z, s.n, Math.PI);
          d.cruise = DRONE_CRUISE; d.blockTall = DRONE_BLOCK; this.drones.push(d);
        }
        s.n++; this.nextShot += BAY_GAP;
      }
      if (s.n >= 4 && s.t > 4 * BAY_GAP + .3) { s.phase = 'close'; s.t = 0; }
    } else if (s.phase === 'close') { this.bays = 0; if (s.t >= BAY_CLOSE_T) this.endAttack(); }
  }

  // Is anything solid on the line from a to b that a shell would hit: a container (one high or more), a wall, a building, tall terrain?
  shellBlocked(a, b) {
    const d = Math.hypot(b.x - a.x, b.z - a.z), n = Math.ceil(d / .75);
    for (let i = 3; i < n; i++) {
      const k = i / n, x = a.x + (b.x - a.x) * k, z = a.z + (b.z - a.z) * k;
      if (TALL.has(this.world.tileAt(x, z))) return true;
      for (const o of this.world.obstacles) if (o.alive && SHELL_BLOCKS.has(o.kind) && Math.abs(x - o.x) < o.hw && Math.abs(z - o.z) < o.hd) return true;
    }
    return false;
  }

  // ---- the side guns: each its own clock, alongside whatever the main sequencer is doing
  sideGuns(dt, near, player, cam) {
    const aim = this.enemyFire.aim, bp = this.boss.position, py = this.boss.rotation.y + this.turret.rotation.y;
    for (const g of this.sides) {
      g.kick = Math.max(0, g.kick - dt / .26); g.gun.position.z = g.baseZ + .3 * g.kick * g.kick;
      const tp = g.turret.getWorldPosition(_b);
      const seen = near && cam.inPlayWindow(_c.set(bp.x, 1.5, bp.z), 1) && Math.hypot(player.position.x - tp.x, player.position.z - tp.z) < SIDE_RANGE
        && !this.shellBlocked(tp, player.position);   // (and a shell would reach the jeep: it holds its fire while the jeep is behind a container)
      if (g.state === 'idle') {
        if (!seen) { g.reload = Math.max(g.reload, .6); continue; }
        this.swing(g.turret, tp, aim.x, aim.z, SIDE_TURN, dt, g.limit, py);
        if ((g.reload -= dt) <= 0) { g.state = 'aim'; g.t = 0; }
      } else if (g.state === 'aim') {
        g.t += dt; this.swing(g.turret, tp, aim.x, aim.z, SIDE_TURN, dt, g.limit, py);
        if (Math.random() < dt * 30) g.muzzles.forEach(m => this.fx.puff(m.getWorldPosition(_a), { color: 0xff2a18, size: .16 + .1 * g.t / SIDE_AIM, grow: .3, life: .12, opacity: .9, additive: true, soft: true, reflect: false })); // the muzzles glow red: it is about to fire
        if (!seen) { g.state = 'idle'; g.reload = 1; } else if (g.t >= SIDE_AIM) { g.state = 'burst'; g.t = SIDE_GAP; g.shots = 0; }
      } else if (g.state === 'burst') {
        g.t += dt;
        if (g.t >= SIDE_GAP) {
          if (!seen) { g.state = 'idle'; g.reload = 1; continue; } // (the jeep ducked behind cover mid-burst: the rest of the burst is not fired)
          g.t -= SIDE_GAP; const m = g.muzzles[g.shots % g.muzzles.length]; this.boss.updateMatrixWorld(true);
          this.enemyFire.shoot(m.getWorldPosition(new THREE.Vector3()), SIDE_RANGE, this.enemyFire.aim, undefined, true); g.kick = 1; g.shots++;
          if (g.shots >= 3) { g.state = 'idle'; g.reload = rnd(...SIDE_RELOAD); }
        }
      }
    }
  }
}
