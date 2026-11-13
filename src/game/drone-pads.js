// Stage 4's drone platform (the NES had a rocket launcher on the cliff top here; the cliff would swallow every shot at it, and the game has plenty of homing missiles already). Instead a steel
// landing deck is bolted to the cliff's south face, a few metres up, with two camouflaged quadcopters folded on it. The deck itself can't be hurt. When the jeep comes within RANGE of it from the
// south, the drones wake: arms unfold, rotors spin up, they lift off one after the other and dive at the jeep to blow up on it (one hit is lethal, as for every enemy shot).
// They are not homing missiles: a drone is quick but heavy on the controls (limited acceleration, so a hard sideways move leaves it overshooting and swinging round for another go), and it has a
// small hit box. A machine-gun burst, a grenade or a rocket's blast brings it down. Gameplay stays 2D: the hit tests are on the ground plane; only the drawing has height.
// Where the deck goes comes from the stage data (world.dronePads: a point on the open ground south of the cliff; the deck is put on the rock face found north of it).
import * as THREE from 'three';
import { buildDrone, poseDrone } from '../assets/drone.js';
import { addToLayer, REFLECT } from './layers.js';
import { add, mat, cached, canvasTexture } from '../assets/common.js';
import { mergeStatic, dropTinyShadows, skinify } from './optimize.js';
import { shardGeometry } from './debris.js';
import { sfx } from './sfx.js';

const RANGE = 30;            // m: the jeep this near the deck (and south of it) and the drones are released
const DECK_UP = 7.5;         // m: the deck's height above the ground at the foot of the cliff
const DECK_W = 5.2, DECK_D = 2.8; // m: the deck's size (across, and out from the cliff)
const SLOPE = 65 * Math.PI / 180; // the cliff face's steepness there (stage data's cliff.slope)
const SCALE = 1.65;          // the model is drawn this much larger than life (it is 0.8 m across unfolded: lost from the camera's height)
const STAGGER = .7;          // s between the two lifting off
const UNFOLD = .55, RISE = .8; // s: arms and rotors opening, then climbing off the deck
const CRUISE_SPEED = 6, RUSH_SPEED = 16, RUSH_RANGE = 5, MAX_SPEED = 20; // m/s: it creeps in at cruise speed and only floors it once the jeep is within RUSH_RANGE m (the rush is faster than the jeep's 9.9)
const ACCEL = 17;            // m/s^2: it cannot turn on a coin
const ROCKET_SEE = 20, ROCKET_REACH = 3.4, GRENADE_SEE_T = 1.3, GRENADE_CLEAR = 3.1, BIG_KICK = 13, BIG_GAP = .22; // rockets and grenades: how far / how wide a rocket is seen, how soon before landing a grenade is (s), the clearance from a burst (m: blast 1.8 + the drone's reach), the sidestep kick (m/s), the pause
const DODGE_SPEED = 8.5, DODGE_GAP = .3, DODGE_SEE = 10, DODGE_REACT = .9; // sidestep kick (m/s), the pause between sidesteps (s), how far ahead it sees a shot coming (m), the odds it reacts to one
const FLANK = 8;            // m: how far to the side of the jeep each drone aims while it is far off (one swings west, the other east), closing to the jeep itself by RUSH_RANGE + FLANK_FADE
const FLANK_FADE = 10;
const WANDER_SPEED = 3.5;    // m/s: how fast a drone drifts north while the jeep is down
const CRUISE = 7;            // m above the ground the drone hovers at while it closes in (clear of bushes, rocks and walls)
const DIVE_REST = 2;         // s at cruise speed after a missed dive before it tries again
const DIVE_Y = .8;           // m above the ground it dives to (the jeep's height)
const DIVE_ACCEL = 90, DIVE_MAX = 22; // m/s^2 and m/s: how hard it drops once it dives
const HW_DIVE = 1.2, HD_DIVE = 1.3; // m: and its hit box while it dives
const HW = .85, HD = .9;      // m: its hit box's half-width and half-depth (the jeep's bullets move 0.75 m a frame: the depth keeps them from skipping through it)
const HP = 1, SCORE = 200;
const STRIKE_PAD = .3;       // m: how far beyond the jeep's outline it counts as a hit
const _v = new THREE.Vector3();
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
const ease = x => { x = Math.min(1, Math.max(0, x)); return x * x * (3 - 2 * x); };

const deckMats = () => cached('dronePadMats', () => {
  const plate = (() => { // diamond-plate steel
    const S = 128, c = document.createElement('canvas'); c.width = c.height = S; const x = c.getContext('2d');
    x.fillStyle = '#6c7378'; x.fillRect(0, 0, S, S);
    for (let gy = 0; gy < 4; gy++) for (let gx = 0; gx < 4; gx++) for (const o of [0, 1]) {
      const cx = gx * 32 + 8 + o * 16, cy = gy * 32 + 8 + o * 16; x.save(); x.translate(cx, cy); x.rotate(o ? -.8 : .8);
      x.fillStyle = 'rgba(255,255,255,.22)'; x.fillRect(-7, -1.6, 14, 3.2); x.fillStyle = 'rgba(0,0,0,.28)'; x.fillRect(-7, 1.6, 14, 1.2); x.restore();
    }
    for (let i = 0; i < 900; i++) { x.fillStyle = Math.random() > .5 ? 'rgba(255,255,255,.05)' : 'rgba(0,0,0,.08)'; x.fillRect(Math.random() * S, Math.random() * S, 2, 2); }
    return canvasTexture(c, 7, 4);
  })();
  const hazard = (() => { // yellow and black warning stripes
    const c = document.createElement('canvas'); c.width = 128; c.height = 16; const x = c.getContext('2d');
    x.fillStyle = '#d8b020'; x.fillRect(0, 0, 128, 16); x.fillStyle = '#1a1a1a';
    for (let i = -1; i < 9; i++) { x.beginPath(); x.moveTo(i * 16, 16); x.lineTo(i * 16 + 8, 16); x.lineTo(i * 16 + 16, 0); x.lineTo(i * 16 + 8, 0); x.fill(); }
    return canvasTexture(c, 3, 1);
  })();
  return {
    plate: mat(0xffffff, .55, .45, { map: plate }), hazard: mat(0xffffff, .6, .2, { map: hazard }), steel: mat(0x4b5258, .6, .5), dark: mat(0x23272b, .7, .4),
    rail: mat(0xc9a21c, .55, .35), pad: mat(0x2a2f33, .8, .3), ring: mat(0xe6e6dc, .7, 0), box: mat(0x59635a, .65, .35),
  };
});

// The deck: out from the cliff along +Z, its top surface at y = 0 and its back edge at z = -DECK_D / 2 (sunk into the rock). Returns { group, beacons: [materials] }.
function buildDeck() {
  const M = deckMats(), g = new THREE.Group(), B = (x, y, z) => new THREE.BoxGeometry(x, y, z), beacons = [];
  const W = DECK_W, D = DECK_D;
  add(g, B(W, .14, D), M.plate, 0, -.07, 0);
  add(g, B(W + .1, .12, .3), M.hazard, 0, .0, D / 2 - .1).material = M.hazard; // the front edge, in stripes
  add(g, B(.1, .12, D), M.steel, -W / 2 + .05, .06, 0); add(g, B(.1, .12, D), M.steel, W / 2 - .05, .06, 0); // raised side lips
  for (const x of [-2, 0, 2]) add(g, B(.16, .24, D), M.steel, x, -.26, 0); // beams under it
  add(g, B(W, .18, .14), M.steel, 0, -.24, D / 2 - .25);
  // backing plate down the rock face (leaning with it), and diagonal struts from the deck's front down onto it
  const up = new THREE.Vector3(0, Math.sin(SLOPE), -Math.cos(SLOPE)), top = new THREE.Vector3(0, -.1, -D / 2 + .4), PL = 3.6;
  const plate = add(g, B(W * .94, PL, .16), M.steel, 0, 0, 0); plate.position.copy(top).addScaledVector(up, -PL / 2 + .1); plate.rotation.x = -(Math.PI / 2 - SLOPE);
  for (let i = 0; i < 2; i++) for (let k = 0; k < 4; k++) { // bolts along the plate
    const b = add(g, new THREE.CylinderGeometry(.08, .08, .08, 8), M.dark, 0, 0, 0); b.castShadow = false;
    b.position.copy(top).addScaledVector(up, -.5 - k * .8).add(new THREE.Vector3((i ? 1 : -1) * (W / 2 - .35), 0, .12)); b.rotation.x = plate.rotation.x + Math.PI / 2;
  }
  for (const x of [-2, 0, 2]) {
    const A = new THREE.Vector3(x, -.35, D / 2 - .25), Bp = top.clone().addScaledVector(up, -2.7).add(new THREE.Vector3(x, 0, .1)), d = Bp.clone().sub(A), len = d.length();
    const s = add(g, new THREE.CylinderGeometry(.075, .075, len, 8), M.steel, 0, 0, 0); s.position.copy(A).addScaledVector(d, .5);
    s.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
    add(g, new THREE.BoxGeometry(.4, .4, .12), M.dark, Bp.x, Bp.y, Bp.z + .02).rotation.x = plate.rotation.x; // the strut's foot plate
  }
  // railing: posts and two rails along the front and both sides
  const post = (x, z) => add(g, B(.07, 1.05, .07), M.rail, x, .52, z);
  const rail = (x0, z0, x1, z1, y) => { const len = Math.hypot(x1 - x0, z1 - z0), r = add(g, B(.05, .05, len), M.rail, (x0 + x1) / 2, y, (z0 + z1) / 2); r.rotation.y = Math.atan2(x1 - x0, z1 - z0); };
  const fz = D / 2 - .06, sx = W / 2 - .06, xs = [-sx, -sx / 2, 0, sx / 2, sx];
  xs.forEach(x => post(x, fz));
  [.5, 1.02].forEach(y => rail(-sx, fz, sx, fz, y));
  for (const s of [-1, 1]) { post(s * sx, 0); post(s * sx, -D / 2 + .4); [.5, 1.02].forEach(y => rail(s * sx, fz, s * sx, -D / 2 + .4, y)); }
  // landing spots for the two drones
  for (const x of [-1.2, 1.2]) {
    const disc = add(g, new THREE.CircleGeometry(.62, 28).rotateX(-Math.PI / 2), M.pad, x, .008, .2); disc.castShadow = false;
    const ring = add(g, new THREE.RingGeometry(.62, .72, 32).rotateX(-Math.PI / 2), M.ring, x, .012, .2); ring.castShadow = false;
  }
  // a control box, an antenna and two warning beacons on the back corners (they flash while the drones are out)
  add(g, B(.8, .9, .5), M.box, 2.0, .45, -.95); add(g, B(.55, .1, .35), M.dark, 2.0, .93, -.95);
  add(g, new THREE.CylinderGeometry(.025, .025, 1.5, 6), M.dark, 2.3, 1.6, -1.05);
  for (const [i, x] of [-1, 1].entries()) {
    const m = new THREE.MeshStandardMaterial({ color: 0x401010, emissive: 0xff2010, emissiveIntensity: .25, roughness: .4 });
    add(g, new THREE.CylinderGeometry(.05, .05, .5, 6), M.dark, x * 2.3, .25, -.55);
    const lamp = add(g, new THREE.SphereGeometry(.13, 12, 8), m, x * 2.3, .6, -.55); lamp.name = 'beacon' + i; lamp.castShadow = false; beacons.push(m);
  }
  g.traverse(o => { if (o.isMesh) o.receiveShadow = true; });
  return { group: mergeStatic(g), beacons };
}

export class DronePads {
  // enemyFire: for the jeep's hit test; debris: for what is left of a drone.
  constructor(scene, fx, debris, enemyFire) { this.scene = scene; this.fx = fx; this.debris = debris; this.enemyFire = enemyFire; this.pads = []; this.free = []; this.time = 0; this.weapons = null; } // weapons: set by main, so the drones can see the jeep's shots coming

  setup(world) {
    this.world = world;
    for (const spot of world.dronePads ?? []) {
      // the cliff face: walk north from the open ground until the rock is as high as the deck
      let z = spot.z + 4; const x = spot.x;
      while (z > spot.z - 40 && world.cliffHeightAt(x, z) < DECK_UP) z -= .1;
      const ground = world.heightAt(x, z + 3), deckY = ground + DECK_UP, zc = z - .4 + DECK_D / 2; // (the back edge sinks 0.4 m into the rock)
      const { group, beacons } = buildDeck(); group.position.set(x, deckY, zc); this.scene.add(group);
      dropTinyShadows(group, .25);
      const pad = { x, z: zc, deckY, group, beacons, state: 'asleep', t: 0, drones: [] };
      // the blocker keeps the jeep from driving under the deck (it would vanish behind it); shots pass it by
      world.obstacles.push({ x, z: zc, hw: DECK_W / 2, hd: DECK_D / 2, alive: true, kind: 'blocker' });
      [-1.2, 1.2].forEach((dx, i) => pad.drones.push(this.makeDrone(pad, x + dx, zc + .2, i)));
      this.pads.push(pad);
    }
  }

  makeDrone(pad, x, z, i) {
    const obj = mergeStatic(buildDrone(true));   // (its 102 pieces become about twenty: each named moving part keeps its own) obj.scale.setScalar(SCALE); obj.position.set(x, pad.deckY + .2 * SCALE, z); obj.rotation.y = Math.PI; // (nose south, toward the jeep)
    skinify(obj, ['airframe', 'camera', 'arm0', 'arm1', 'arm2', 'arm3', 'prop0', 'prop1', 'prop2', 'prop3', 'blade00', 'blade01', 'blade10', 'blade11', 'blade20', 'blade21', 'blade30', 'blade31']); // (the parts poseDrone turns are the bones: the whole drone is drawn in about ten calls, not fifty)
    obj.traverse(o => { if (o.isMesh) o.castShadow = o.geometry.type !== "CircleGeometry"; }); dropTinyShadows(obj, .1);
    poseDrone(obj, 0, 0, 0, .6, 0, 1); addToLayer(obj, REFLECT); this.scene.add(obj);   // (REFLECT: seen in the puddles' mirror)
    return { obj, i, home: { x, z }, state: 'perched', t: 0, delay: i * STAGGER, vel: new THREE.Vector3(), yaw: Math.PI, spin: 0, life: 0, target: null, roll: 0 };
  }

  update(dt, world, player, killPlayer) {
    this.time += dt;
    const canHit = player.enabled && !player.dead;
    for (const pad of this.pads) {
      if (pad.state === 'asleep' && canHit && player.position.z > pad.z && Math.hypot(player.position.x - pad.x, player.position.z - pad.z) < RANGE) { pad.state = 'alert'; pad.t = 0; }
      if (pad.state === 'alert') {
        pad.t += dt;
        const on = (Math.floor(this.time * 6) & 1) === 0;
        for (const m of pad.beacons) m.emissiveIntensity = on ? 2.2 : .15;
        for (const d of pad.drones) if (d.state === 'perched' && pad.t >= d.delay) { d.state = 'unfold'; d.t = 0; }
        if (pad.drones.every(d => d.state === 'dead' || d.state === 'chase' || d.state === 'fall')) pad.state = 'spent';
      } else if (pad.state === 'spent') { for (const m of pad.beacons) m.emissiveIntensity = .25; pad.state = 'done'; }
      for (const d of pad.drones) this.step(d, pad, dt, world, player, canHit, killPlayer);
    }
    for (let i = this.free.length - 1; i >= 0; i--) { // drones let go by something else (the boss helicopter)
      const f = this.free[i]; this.step(f.d, f.pad, dt, world, player, canHit, killPlayer);
      if (f.d.state === 'dead') this.free.splice(i, 1);
    }
  }

  // A drone dropped from the air at (x, y, z), heading yaw: it spins up where it is and goes for the jeep like the deck's. Returns it (d.state is 'dead' once it is gone).
  // A drone built ahead of time, hidden, so the loading screen's shader compile builds its (skinned) shaders too: building the first one in the middle of a fight stalled the game for a second or two. The next release takes it.
  makeSpare() { this.spare = this.makeDrone({ x: 0, z: 0, deckY: -60 }, 0, 0, 0); this.spare.obj.position.set(0, -60, 0); this.spare.obj.visible = false; }
  release(x, y, z, i, yaw) {
    const pad = { x, z, deckY: y - 1.5, drones: [] }; let d;
    if (this.spare) { d = this.spare; this.spare = null; d.obj.visible = true; d.i = i; d.home = { x, z }; } else d = this.makeDrone(pad, x, z, i);
    d.obj.position.set(x, y, z); d.obj.rotation.y = d.yaw = yaw; d.state = 'unfold'; d.t = 0; d.delay = 0;
    this.free.push({ d, pad }); return d;
  }
  // The kill rate counts the drones on the cliff decks (not the ones the boss releases): all of them, and those shot down.
  get total() { return this.pads.reduce((n, p) => n + p.drones.length, 0); }
  get kills() { return this.pads.reduce((n, p) => n + p.drones.filter(d => d.shot).length, 0); }

  // Every released drone blows up where it is.
  popFree() { for (const f of this.free.slice()) if (f.d.state !== 'dead') this.explode(f.d, false, true); this.free.length = 0; }

  step(d, pad, dt, world, player, canHit, killPlayer) {
    if (d.state === 'dead' || d.state === 'perched') return;
    const o = d.obj, p = o.position;
    d.t += dt; d.spin += dt * 70;
    if (d.state === 'unfold') { // arms open, rotors wind up
      const k = d.t / UNFOLD; poseDrone(o, d.spin * ease(k), 0, 0, .6 - .5 * ease(k), ease(k), 1 - ease(k));
      if (d.t >= UNFOLD) { d.state = 'rise'; d.t = 0; this.arm(d, world); }
      return;
    }
    d.life += dt;
    const grounded = world.heightAt(p.x, p.z), floor = Math.max(grounded, world.cliffHeightAt?.(p.x, p.z) ?? 0);
    if (d.state === 'rise') { // straight up off the deck, then away
      const k = Math.min(1, d.t / RISE);
      p.y += (pad.deckY + 1.5 - p.y) * Math.min(1, dt * 3);
      d.target.x = p.x; d.target.z = p.z;
      poseDrone(o, d.spin, 0, 0, .1, 1, 0);
      if (k >= 1) { d.state = 'chase'; d.t = 0; sfx.quad?.({ x: p.x, z: p.z }); }
      return;
    }
    if (d.state === 'fall') { // battery flat: it drops
      d.vel.y -= 20 * dt; p.addScaledVector(d.vel, dt); o.rotation.z += dt * 6;
      if (p.y <= floor + .3) { this.explode(d, false); }
      return;
    }
    if (!canHit) { // the jeep is down: it has lost its target and drifts off north at a hover, an easy shot for the jeep coming back (it fires north)
      d.diving = false; d.vy = 0;
      const sway = Math.sin(this.time * .9 + d.i * 3) * 1.2, ax = sway - d.vel.x, az = -WANDER_SPEED - d.vel.z, al = Math.hypot(ax, az), st = Math.min(al, ACCEL * dt);
      if (al > 1e-4) { d.vel.x += ax / al * st; d.vel.z += az / al * st; }
      p.x += d.vel.x * dt; p.z += d.vel.z * dt;
      p.y += (Math.max(grounded + CRUISE, floor + 1.5) - p.y) * Math.min(1, dt * 2.5);
      d.yaw += wrap(Math.atan2(-d.vel.x, -d.vel.z) - d.yaw) * Math.min(1, dt * 4); o.rotation.y = d.yaw;
      poseDrone(o, d.spin, Math.min(.5, Math.hypot(d.vel.x, d.vel.z) * .045), 0, .5, 1, 0);
      d.target.x = p.x; d.target.z = p.z; sfx.quad?.({ x: p.x, z: p.z });
      return;
    }
    // chase: steer toward the jeep with a limited acceleration, so a sharp sideways move makes it overshoot
    const jp = player.position;
    const flank = (d.i ? 1 : -1) * FLANK * Math.min(1, Math.max(0, (Math.hypot(jp.x - p.x, jp.z - p.z) - RUSH_RANGE) / FLANK_FADE)); // (the two come in from opposite sides, then both dive on the jeep)
    let dx = jp.x + flank - p.x, dz = jp.z - p.z, routed = false;
    if (d.blockTall && this.tallBetween(world, d.blockTall, p.x, p.z, jp.x, jp.z, .6)) { // a tall pile between it and the jeep: it flies round (a path over the map's cells), and does not dive while the jeep is out of sight behind it
      const w = this.route(d, p, jp, world, dt); routed = true; d.diving = false;
      if (w) { dx = w.x - p.x; dz = w.z - p.z; } else { dx = dz = 0; } // (no way round: it hovers)
    } else d.route = null;
    const dist = Math.hypot(dx, dz) || 1;
    dx /= dist; dz /= dist;
    d.calm = Math.max(0, (d.calm ?? 0) - dt);
    const SPEED = !routed && dist < RUSH_RANGE && d.calm <= 0 ? RUSH_SPEED : CRUISE_SPEED, wantX = dx * SPEED * (routed && dx === 0 && dz === 0 ? 0 : 1), wantZ = dz * SPEED * (routed && dx === 0 && dz === 0 ? 0 : 1);
    if (!d.diving) this.dodge(d, p, dt); // (once it has committed to the dive it no longer sidesteps)
    const ax = wantX - d.vel.x, az = wantZ - d.vel.z, al = Math.hypot(ax, az), step = Math.min(al, ACCEL * dt);
    if (al > 1e-4) { d.vel.x += ax / al * step; d.vel.z += az / al * step; }
    const sp = Math.hypot(d.vel.x, d.vel.z); if (sp > MAX_SPEED) { d.vel.x *= MAX_SPEED / sp; d.vel.z *= MAX_SPEED / sp; }
    const lat = (ax * -Math.cos(d.yaw) + az * Math.sin(d.yaw)); // acceleration across its heading, for the lean
    const px0 = p.x, pz0 = p.z;
    p.x += d.vel.x * dt; p.z += d.vel.z * dt;
    if (d.blockTall) this.slideOff(d, p, px0, pz0, world); // (the boss's drones cannot cross a pile taller than they fly)
    const jd = Math.hypot(jp.x - p.x, jp.z - p.z);
    if (!d.diving && !routed && jd < RUSH_RANGE && d.calm <= 0) d.diving = true;
    else if (d.diving && jd > RUSH_RANGE + .5) { d.diving = false; d.calm = DIVE_REST; } // (a miss: the jeep got more than 5 m away, so it climbs back to hover height and sets up again; the half metre stops it flicking between the two)
    if (d.target) { d.target.hw = d.diving ? HW_DIVE : HW; d.target.hd = d.diving ? HD_DIVE : HD; } // (a bigger target while it dives)
    if (d.diving) { d.vy = Math.max(-DIVE_MAX, (d.vy ?? 0) - DIVE_ACCEL * dt); p.y = Math.max(grounded + DIVE_Y, p.y + d.vy * dt); } // accelerating downward onto the jeep
    else { d.vy = 0; p.y += (Math.max(grounded + (d.cruise ?? CRUISE), floor + 1.5) - p.y) * Math.min(1, dt * 2.5); } // hovering at 5 m, higher over rock
    if (sp > 1) d.yaw += wrap(Math.atan2(-d.vel.x, -d.vel.z) - d.yaw) * Math.min(1, dt * 9);
    d.roll += (THREE.MathUtils.clamp(lat * .035, -.5, .5) - d.roll) * Math.min(1, dt * 8);
    o.rotation.y = d.yaw;
    poseDrone(o, d.spin, Math.min(.5, sp * .045), d.roll, .5, 1, 0);
    d.target.x = p.x; d.target.z = p.z;
    sfx.quad?.({ x: p.x, z: p.z });
    if (canHit && !player.invulnerable && !routed && this.enemyFire.hitsJeep(p, player, STRIKE_PAD)) { this.explode(d, true); killPlayer(); return; }
  }

  // Sees the jeep's shots coming and kicks itself sideways, out of the way. Bullets: off their line, reacting to most of them. Rockets: off their line by more than the blast reaches, every time, seen
  // from further away. Grenades: it works out where each will come down and gets clear of the burst (and of the path to it). Each kind has its own pause, so a bullet dodge doesn't leave it
  // open to a rocket.
  dodge(d, p, dt) {
    const w = this.weapons; if (!w) return;
    d.dodgeIn = (d.dodgeIn ?? 0) - dt; d.dodgeBig = (d.dodgeBig ?? 0) - dt;
    const kick = (dx, dz, v) => { const l = Math.hypot(dx, dz) || 1; d.vel.x += dx / l * v; d.vel.z += dz / l * v; };
    if (d.dodgeBig <= 0) {
      for (const r of w.rockets) { // a rocket flies straight: across its line, far enough that the blast (BLAST_PAD) misses
        const ux = r.dir.x, uz = r.dir.z, rx = p.x - r.m.position.x, rz = p.z - r.m.position.z, along = rx * ux + rz * uz, side = rx * -uz + rz * ux;
        if (along < -1 || along > ROCKET_SEE || Math.abs(side) > ROCKET_REACH) continue;
        d.dodgeBig = BIG_GAP; const dir = Math.abs(side) < .05 ? (Math.random() < .5 ? 1 : -1) : Math.sign(side);
        kick(-uz * dir, ux * dir, BIG_KICK); return;
      }
      for (const g of w.grenades) { // a grenade: where it comes down (ground height from its own arc), and out of range of that point
        const v = g.vel, pos = g.m.position, ground = this.world.heightAt(pos.x + v.x * .5, pos.z + v.z * .5);
        const disc = v.y * v.y + 56 * (pos.y - ground); if (disc < 0) continue;
        const t = (v.y + Math.sqrt(disc)) / 28, lx = pos.x + v.x * t, lz = pos.z + v.z * t;
        if (t > GRENADE_SEE_T) continue;
        const ox = p.x - lx, oz = p.z - lz, off = Math.hypot(ox, oz);
        const sp = Math.hypot(v.x, v.z) || 1, ux = v.x / sp, uz = v.z / sp, rx = p.x - pos.x, rz = p.z - pos.z, along = rx * ux + rz * uz, side = rx * -uz + rz * ux;
        const onPath = along > 0 && along < sp * t && Math.abs(side) < 1.1; // (a grenade bursts on the first enemy it passes over: the drone itself)
        if (off > GRENADE_CLEAR && !onPath) continue;
        d.dodgeBig = BIG_GAP;
        if (off > .4 && !onPath) kick(ox, oz, BIG_KICK); else { const dir = Math.abs(side) < .05 ? (Math.random() < .5 ? 1 : -1) : Math.sign(side); kick(-uz * dir, ux * dir, BIG_KICK); }
        return;
      }
    }
    if (d.dodgeIn > 0) return;
    for (const b of w.bullets) {
      const x = b.m.position.x, z = b.m.position.z, vx = b.vx, vz = b.vz, sp = Math.hypot(vx, vz); if (sp < 1) continue;
      const ux = vx / sp, uz = vz / sp, rx = p.x - x, rz = p.z - z, along = rx * ux + rz * uz, side = rx * -uz + rz * ux; // (side > 0: the drone is to the shot's left)
      if (along < 0 || along > DODGE_SEE || Math.abs(side) > .9) continue;
      d.dodgeIn = DODGE_GAP; if (Math.random() > DODGE_REACT) return;
      const dir = Math.abs(side) < .05 ? (Math.random() < .5 ? 1 : -1) : Math.sign(side);
      kick(-uz * dir, ux * dir, DODGE_SPEED); // (across the shot's line, away from it)
      return;
    }
  }

  // ---- going round tall piles (the boss's drones). A pile counts as tall when its top is above `k` (the drones' limit); one container high is flown over.
  tallOf(world, k) {
    if (this.tallK !== k || this.tallN !== world.obstacles.length) { this.tallK = k; this.tallN = world.obstacles.length; this.tallL = world.obstacles.filter(o => o.top > k); }
    return this.tallL;
  }
  inTall(list, x, z, m) { for (const o of list) if (o.alive && Math.abs(x - o.x) < o.hw + m && Math.abs(z - o.z) < o.hd + m) return true; return false; }
  // Is a tall pile on the straight line from (x0, z0) to (x1, z1), seen with `m` metres of margin?
  tallBetween(world, k, x0, z0, x1, z1, m = .5) {
    const list = this.tallOf(world, k), n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, z1 - z0)));
    for (let i = 1; i <= n; i++) { const t = i / n; if (this.inTall(list, x0 + (x1 - x0) * t, z0 + (z1 - z0) * t, m)) return true; }
    return false;
  }
  // A path from p to the jeep over a grid of 1.5 m cells, the tall piles (and a margin of .9 m round them) closed: A*, eight ways, no cutting corners. Returns the cells' centres from the start on, or null.
  findPath(world, k, p, jp) {
    const C = 1.5, M = .9, PAD = 14, list = this.tallOf(world, k);
    const x0 = Math.min(p.x, jp.x) - PAD, z0 = Math.min(p.z, jp.z) - PAD, W = Math.min(110, Math.ceil((Math.max(p.x, jp.x) + PAD - x0) / C)), H = Math.min(110, Math.ceil((Math.max(p.z, jp.z) + PAD - z0) / C));
    const blocked = new Uint8Array(W * H);
    for (const o of list) {
      if (!o.alive) continue;
      const c0 = Math.max(0, Math.floor((o.x - o.hw - M - x0) / C)), c1 = Math.min(W - 1, Math.floor((o.x + o.hw + M - x0) / C)), r0 = Math.max(0, Math.floor((o.z - o.hd - M - z0) / C)), r1 = Math.min(H - 1, Math.floor((o.z + o.hd + M - z0) / C));
      for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) blocked[r * W + c] = 1;
    }
    const cell = (x, z) => [Math.min(W - 1, Math.max(0, Math.floor((x - x0) / C))), Math.min(H - 1, Math.max(0, Math.floor((z - z0) / C)))];
    const free = (c, r, reach) => { // the nearest open cell to (c, r), by rings
      if (!blocked[r * W + c]) return r * W + c;
      for (let R = 1; R <= reach; R++) for (let dr = -R; dr <= R; dr++) for (let dc = -R; dc <= R; dc++) {
        if (Math.max(Math.abs(dr), Math.abs(dc)) !== R) continue; const cc = c + dc, rr = r + dr; if (cc >= 0 && cc < W && rr >= 0 && rr < H && !blocked[rr * W + cc]) return rr * W + cc;
      }
      return -1;
    };
    const [sc, sr] = cell(p.x, p.z), [gc, gr] = cell(jp.x, jp.z), s0 = free(sc, sr, 3), g0 = free(gc, gr, 6);
    if (s0 < 0 || g0 < 0) return null;
    const N = W * H, g = new Float32Array(N).fill(Infinity), from = new Int32Array(N).fill(-1), closed = new Uint8Array(N), heap = [];
    const hx = i => Math.abs((i % W) - (g0 % W)), hz = i => Math.abs(Math.floor(i / W) - Math.floor(g0 / W)), h = i => (hx(i) + hz(i) + (Math.SQRT2 - 2) * Math.min(hx(i), hz(i)));
    const push = (f, i) => { heap.push([f, i]); let a = heap.length - 1; while (a > 0) { const b = (a - 1) >> 1; if (heap[b][0] <= heap[a][0]) break; [heap[a], heap[b]] = [heap[b], heap[a]]; a = b; } };
    const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let a = 0; for (;;) { let l = a * 2 + 1, r = l + 1, m = a; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === a) break; [heap[a], heap[m]] = [heap[m], heap[a]]; a = m; } } return top; };
    g[s0] = 0; push(h(s0), s0);
    while (heap.length) {
      const [, i] = pop(); if (closed[i]) continue; closed[i] = 1;
      if (i === g0) break;
      const ic = i % W, ir = Math.floor(i / W);
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
        if (!dr && !dc) continue; const c = ic + dc, r = ir + dr; if (c < 0 || c >= W || r < 0 || r >= H) continue; const j = r * W + c; if (blocked[j] || closed[j]) continue;
        if (dr && dc && (blocked[ir * W + c] || blocked[r * W + ic])) continue;      // (no squeezing between two diagonal corners)
        const ng = g[i] + (dr && dc ? Math.SQRT2 : 1); if (ng < g[j]) { g[j] = ng; from[j] = i; push(ng + h(j), j); }
      }
    }
    if (!closed[g0]) return null;
    const path = []; for (let i = g0; i >= 0 && i !== s0; i = from[i]) path.push({ x: x0 + ((i % W) + .5) * C, z: z0 + (Math.floor(i / W) + .5) * C });
    return path.reverse();
  }
  // Where the drone steers while a pile stands between it and the jeep: the farthest point of its path that it can fly straight to (the path is made again twice a second).
  route(d, p, jp, world, dt) {
    d.routeIn = (d.routeIn ?? 0) - dt;
    if (!d.route || d.routeIn <= 0) { d.routeIn = .5; d.route = this.findPath(world, d.blockTall, p, jp); }
    const r = d.route; if (!r || !r.length) return null;
    for (let i = Math.min(r.length - 1, 14); i >= 0; i--) if (!this.tallBetween(world, d.blockTall, p.x, p.z, r[i].x, r[i].z, .7)) return r[i];
    return r[0];
  }

  // A drone that flies at `d.cruise` metres (the boss's: low enough to clear a stack of two containers, not three) cannot cross a pile taller than `d.blockTall`: it is stopped at its edge and slides along it.
  slideOff(d, p, px0, pz0, world) {
    const tall = (x, z) => world.obstacles.some(o => o.alive && o.top > d.blockTall && Math.abs(x - o.x) < o.hw && Math.abs(z - o.z) < o.hd);
    if (!tall(p.x, p.z)) return;
    if (!tall(px0, p.z)) { p.x = px0; d.vel.x = 0; } else if (!tall(p.x, pz0)) { p.z = pz0; d.vel.z = 0; } else { p.x = px0; p.z = pz0; d.vel.x = d.vel.z = 0; }
  }

  // The drone becomes a target (the jeep's shots stop at it and can kill it) from the moment it lifts off.
  arm(d, world) {
    d.target = { object: d.obj, x: d.obj.position.x, z: d.obj.position.z, hw: HW, hd: HD, r: 1.1, hp: HP, score: SCORE, die: () => this.explode(d, false, true) };
    world.targets.push(d.target);
  }

  // Gone: a flash and a cloud (it flew into the jeep: `strike`) or shot down: its rotors and arms flung off.
  explode(d, strike, shot = false) {
    if (d.state === 'dead') return;
    d.state = 'dead'; d.shot = shot;
    const i = this.world.targets.indexOf(d.target); if (i >= 0) this.world.targets.splice(i, 1);
    const at = d.obj.position.clone(); this.scene.remove(d.obj);
    this.fx.explosion(at.clone().setY(Math.max(at.y, .5)), strike ? 1.1 : .8);
    if (!this.debris) return;
    const r = () => (Math.random() - .5) * 2, panel = cached('droneBits', () => new THREE.MeshStandardMaterial({ color: 0x3d4630, roughness: .7, metalness: .3, flatShading: true }));
    for (let k = 0; k < 5; k++) {
      const m = new THREE.Mesh(shardGeometry(.18 + Math.random() * .25, .04, .12 + Math.random() * .2), panel); m.position.copy(at).add(_v.set(r() * .3, r() * .2, r() * .3)); this.scene.add(m);
      this.debris.launch(m, new THREE.Vector3(r() * 4, 2 + Math.random() * 3, r() * 4), new THREE.Vector3(r() * 14, r() * 14, r() * 14), .03);
    }
    this.fx.smoke?.(at.clone().setY(Math.max(at.y, .5)), 1.5);
  }

  // Saved games: each drone's state ('p' still on the deck, 'c' flying (and where), 'd' gone).
  snapshot() {
    const r = v => Math.round(v * 100) / 100;
    return this.pads.map(p => ({ s: p.state, d: p.drones.map(d => d.state === 'dead' ? 'd' : d.state === 'perched' ? 'p' : [r(d.obj.position.x), r(d.obj.position.y), r(d.obj.position.z)]) }));
  }
  restore(list) {
    (list ?? []).forEach((s, i) => {
      const pad = this.pads[i]; if (!pad || !s) return;
      pad.state = s.s === 'asleep' ? 'asleep' : 'done'; // (those still on the deck wake again the usual way)
      s.d.forEach((v, k) => {
        const d = pad.drones[k]; if (!d || v === 'p') return;
        if (v === 'd') { this.scene.remove(d.obj); d.state = 'dead'; d.shot = true; return; }
        d.obj.position.set(v[0], v[1], v[2]); this.arm(d, this.world); d.state = 'chase'; d.life = 0; d.t = 0; // (a drone in flight carries on from where it was)
      });
      if (pad.state === 'done') for (const m of pad.beacons) m.emissiveIntensity = .25;
      if (s.s !== 'asleep' && pad.drones.some(d => d.state === 'perched')) pad.state = 'alert';
    });
  }
}
