// River gunboats (NES): two wait up the river from each bridge. When the jeep comes near the
// bridge they sail down the middle of the channel (the first only once the jeep is nearly at the bridge); the first pulls in by the west bank just
// upstream of the bridge, the second parks further up the river. They shoot (on the way in too) at the jeep like a turret (same shells, bursts and fair-play rules,
// see EnemyFire). One grenade or four bullets wreck it.
// Patrol boats (stage 3, set in the level data: { x, z, triggerZ, sail }) are the same boat: moored at (x, z), they sail `sail` m
// south and park once the jeep passes the triggerZ line.
import * as THREE from 'three';
import { buildGunboat } from '../assets/gunboat.js';
import { buildPatrolBoat } from '../assets/patrolboat.js';
import { mergeStatic, dropTinyShadows } from './optimize.js';
import { addToLayer, REFLECT, UNDERWATER } from './layers.js';

const BOAT_RANGE = 33; // m: how far a gunboat's shells reach (turrets and tanks: 28, see enemies.js)

// Per boat: park = m north of the bridge's north edge where it stops; upstream = m north of the
// bridge where it waits, out of sight; side = how far across the river it parks from the west bank
// (0 = bank, 0.5 = middle, 1 = east bank).
// trigger = how close (m) south of the bridge's south edge the jeep sets it off.
const BOATS = [{ park: 7, upstream: 35, side: .35, trigger: 12 }, { park: 52, upstream: 88, side: .3, trigger: 40, tank: true }]; // tank: a tank rolls in as this boat comes into view (see Tanks)
const SPEED = 7;      // m/s cruising
const SCALE = 1.33;     // model size
const SINK_TIME = 4;
// Patrol boats go after the jeep once parked: they close in until it is within CLOSE_IN of their range, as long as there is
// water to do it in, and give up for good if the jeep gets further than GIVE_UP away.
const CHASE_SPEED = 5, TURN_RATE = 1.4, CLOSE_IN = .75, GIVE_UP = 70;
const HALF_LEN = 3.8 * SCALE, HALF_WID = 1.3 * SCALE; // (the hull's footprint, for keeping it off the quay)

const r = () => (Math.random() - .5) * 2;
const smooth = t => t * t * (3 - 2 * t);

// The middle of the river from `upstream` m north of the bridge down to the parking spot, as points
// running downstream. Follows the run of water across each 1 m step, starting at the bridge.
function riverPath(world, b, { park, upstream, side }) {
  const north = b.z - b.d / 2, water = (x, z) => world.tileAt(x, z) === '~';
  const pts = [];
  let cx = b.x;
  for (let z = north - 1; z > north - upstream; z -= 1) {
    if (!water(cx, z)) { // lost the channel: look either side for it
      let found = null;
      for (let d = .25; d < 8 && found === null; d += .25) found = water(cx - d, z) ? cx - d : water(cx + d, z) ? cx + d : null;
      if (found === null) break;
      cx = found;
    }
    let x0 = cx, x1 = cx;
    while (water(x0 - .25, z) && x0 > cx - 30) x0 -= .25;
    while (water(x1 + .25, z) && x1 < cx + 30) x1 += .25;
    cx = (x0 + x1) / 2;
    pts.push({ x: cx, z, x0, x1 });
  }
  if (pts.length < 15) return null;
  pts.splice(0, park - 1); // (traced from the bridge so the channel is found; the boat stops at `park`)
  if (pts.length < 15) return null;
  for (let pass = 0; pass < 3; pass++) { // smooth out the cell steps
    const xs = pts.map(p => p.x);
    pts.forEach((p, i) => { let s = 0, n = 0; for (let k = -3; k <= 3; k++) { const q = xs[i + k]; if (q !== undefined) { s += q; n++; } } p.x = s / n; });
  }
  // over the last 15 m it eases across to its side of the river
  pts.forEach((p, i) => { const k = smooth(Math.max(0, 1 - i / 15)); p.x += (p.x0 + (p.x1 - p.x0) * side - p.x) * k; });
  pts.reverse(); // downstream
  const path = pts.map(p => new THREE.Vector3(p.x, 0, p.z)), len = [0];
  for (let i = 1; i < path.length; i++) len.push(len[i - 1] + path[i].distanceTo(path[i - 1]));
  return { path, len, total: len[len.length - 1] };
}

export class Gunboats {
  constructor(scene, fx, debris) { this.scene = scene; this.fx = fx; this.debris = debris; this.boats = []; this.time = 0; }

  setup(world, patrols = []) {
    this.world = world; world.boatSolid.fn = (x, z) => this.solidAt(x, z); // (the player's jeep cannot drive through a boat frozen in the ice)
    const jobs = [];
    for (const b of world.bridges) for (const spec of BOATS) { const route = riverPath(world, b, spec); if (route) jobs.push({ b, spec, route, build: buildGunboat }); }
    for (const p of patrols) { // `sail` m south, curving `veer` m west over the last 70% (to follow the quay), turning as it goes
      const path = [], len = [0], n = Math.round(p.sail);
      for (let i = 0; i <= n; i++) {
        const u = Math.max(0, (i / n - .3) / .7);
        path.push(new THREE.Vector3(p.x - (p.veer ?? 0) * u * u, 0, p.z + i * p.sail / n));
        if (i) len.push(len[i - 1] + path[i].distanceTo(path[i - 1]));
      }
      jobs.push({ b: null, spec: { triggerZ: p.triggerZ, near: p.near, chase: true }, route: { path, len, total: len[n] }, build: buildPatrolBoat });
    }
    for (const { b, spec, route, build } of jobs) {
      const obj = mergeStatic(build()); obj.scale.setScalar(SCALE); dropTinyShadows(obj);
      obj.updateMatrixWorld(true); const bb = new THREE.Box3().setFromObject(obj), foot = { hl: (bb.max.z - bb.min.z) / 2, hw: (bb.max.x - bb.min.x) / 2, cx: (bb.max.x + bb.min.x) / 2, cz: (bb.max.z + bb.min.z) / 2 }; // (the hull's real footprint, measured on the model, in its own axes: the jeep cannot drive through it once the sea is frozen)
      obj.position.copy(route.path[0]); obj.rotation.y = Math.PI; // facing downstream (south)
      this.scene.add(addToLayer(obj, REFLECT, UNDERWATER));
      const boat = { obj, foot, hull: obj.getObjectByName('hull'), route, bridge: b, spec, park: route.path[route.path.length - 1], s: 0, speed: 0, state: 'wait', wakeIn: 0, phase: Math.random() * 6 };
      boat.target = { object: obj, x: obj.position.x, z: obj.position.z, hw: 1.3 * SCALE, hd: 3.3 * SCALE, r: 2.4 * SCALE, hp: 4, score: 500, asleep: true,
        wreck: () => this.sink(boat) };
      world.targets.push(boat.target);
      world.turrets.push({ top: obj.getObjectByName('turret'), base: obj, target: boat.target, range: BOAT_RANGE, cannon: true }); // aims and fires as a turret
      this.boats.push(boat);
    }
  }

  // The sea has frozen over: every boat that is still afloat is locked in the ice where it lies, and becomes a gun turret (on = false: open water again).
  freeze(on) { this.iced = !!on; }

  // Is (x, z) inside the hull of a boat frozen in the ice (the boat's footprint, a little roomy)? Only the player's jeep asks.
  solidAt(x, z) {
    for (const b of this.boats) { // (always, not only once the ice has set: a hull is solid for the jeep whenever it could be anywhere near one)
      const o = b.obj, a = o.rotation.y, dx = x - o.position.x, dz = z - o.position.z, f = b.foot; // (a destroyed boat's hull stays where it settled: it is an obstacle too)
      if (Math.abs(dx) > f.hl + 4 || Math.abs(dz) > f.hl + 4) continue;
      const lx = dx * Math.cos(a) - dz * Math.sin(a), lz = dx * Math.sin(a) + dz * Math.cos(a); // (the point in the boat's own axes)
      if (Math.abs(lx - f.cx) < f.hw + .3 && Math.abs(lz - f.cz) < f.hl + .3) return true;
    }
    return false;
  }

  update(dt, player) {
    this.time += dt;
    const t = this.time;
    for (const b of this.boats) {
      const o = b.obj;
      if (b.state === 'sinking') { this.sinking(b, dt); continue; }
      if (this.iced) { b.speed = 0; if (b.state !== 'parked') b.state = 'parked'; b.target.asleep = false; b.target.x = o.position.x; b.target.z = o.position.z; b.hull.position.y = 0; b.hull.rotation.set(0, 0, 0); continue; } // (frozen in: it cannot move, turn or sail, but it is awake and its guns work: a turret on the ice)
      // (spec.near: it wakes when the jeep comes within that many metres of it, wherever the jeep is on the map)
      if (b.state === 'wait' && player.enabled && (b.spec.near ? Math.hypot(player.position.x - o.position.x, player.position.z - o.position.z) < b.spec.near : player.position.z < (b.spec.triggerZ ?? b.bridge.z + b.bridge.d / 2 + b.spec.trigger))) { b.state = 'sail'; b.target.asleep = false; } // armed from the moment it sets off
      if (b.state === 'sail') {
        const { path, len, total } = b.route, left = total - b.s;
        const want = SPEED * Math.min(1, .12 + left / 10); // slows as it comes in to park
        b.speed += (want - b.speed) * Math.min(1, dt * 1.5);
        b.s = Math.min(total, b.s + b.speed * dt);
        let i = 1; while (i < len.length - 1 && len[i] < b.s) i++;
        const k = (b.s - len[i - 1]) / (len[i] - len[i - 1] || 1);
        o.position.lerpVectors(path[i - 1], path[i], k);
        const ahead = path[Math.min(path.length - 1, i + 2)], dx = ahead.x - o.position.x, dz = ahead.z - o.position.z;
        if (dx * dx + dz * dz > .01) { let d = Math.atan2(-dx, -dz) - o.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d)); o.rotation.y += d * Math.min(1, dt * 2); }
        if (left < .05) { b.state = 'parked'; b.speed = 0; }
        // foam: a trail off the stern and a little spray at the bow
        this.foam(b, dt);
      } else if (b.state === 'parked' && b.spec.chase && (!b.gaveUp || (b.spec.near && player.enabled && Math.hypot(player.position.x - o.position.x, player.position.z - o.position.z) < b.spec.near * .8 && (b.gaveUp = false, true)))) { // (a boat that woke by distance picks the chase up again when the jeep comes back within reach)
        this.chase(b, dt, player);
      } else if (b.state === 'parked' && (b.wakeIn -= dt) <= 0) { // water lapping round the hull
        b.wakeIn = .5 + Math.random() * .4;
        this.fx.wake(o.position.clone().add(new THREE.Vector3(r() * 1.3, 0, r() * 3)), .4, 1.4);
      }
      b.target.x = o.position.x; b.target.z = o.position.z;
      // ride the water: bob and roll, bow lifted while under way
      const f = b.speed / SPEED;
      b.hull.position.y = Math.sin(t * 1.7 + b.phase) * .05;
      b.hull.rotation.z = Math.sin(t * 1.3 + b.phase) * .03;
      b.hull.rotation.x = Math.sin(t * 1.1 + b.phase * 2) * .015 + .05 * f;
    }
  }

  // Foam: a trail off the stern and a little spray at the bow, while under way.
  foam(b, dt) {
    const o = b.obj;
    if ((b.wakeIn -= dt) > 0 || b.speed <= .5) return;
    b.wakeIn = .07;
    const fwd = new THREE.Vector3(-Math.sin(o.rotation.y), 0, -Math.cos(o.rotation.y)), side = new THREE.Vector3(-fwd.z, 0, fwd.x);
    const f = b.speed / SPEED;
    this.fx.wake(o.position.clone().addScaledVector(fwd, -3.6 * SCALE).addScaledVector(side, r() * .5), .5 + .4 * f, 1.2 + 1.2 * f);
    for (const s of [-1, 1]) this.fx.wake(o.position.clone().addScaledVector(fwd, 2.4 * SCALE).addScaledVector(side, s * 1.2 * SCALE), .25 * f, .6);
  }

  // Is the hull, at (x, z) heading a (rotation.y), wholly in the water?
  hullClear(x, z, a) {
    const fx = -Math.sin(a), fz = -Math.cos(a), sx = -fz, sz = fx;
    for (const [l, w] of [[0, 0], [HALF_LEN, 0], [-HALF_LEN, 0], [HALF_LEN, HALF_WID], [HALF_LEN, -HALF_WID], [-HALF_LEN, HALF_WID], [-HALF_LEN, -HALF_WID]])
      { const px = x + fx * l + sx * w, pz = z + fz * l + sz * w; if (!this.world.waterAt(px, pz) || this.onPier(px, pz)) return false; }
    return true;
  }
  // Is (x, z) on a pier (its deck and posts, with a margin)? A hull can't sail through one.
  onPier(x, z) {
    for (const pr of this.world.piers ?? []) {
      const dx = pr.x1 - pr.x0, dz = pr.z1 - pr.z0, len2 = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((x - pr.x0) * dx + (z - pr.z0) * dz) / len2));
      if (Math.hypot(x - (pr.x0 + dx * t), z - (pr.z0 + dz * t)) < pr.width / 2 + .6) return true;
    }
    return false;
  }

  // Would a hull of boat b at (x, z) heading a overlap another boat's? Each hull is three circles along its length.
  boatHit(b, x, z, a) {
    const fx = -Math.sin(a), fz = -Math.cos(a), R = HALF_WID + .45;
    for (const o of this.boats) {
      if (o === b || o.target.hp <= 0) continue;
      const q = o.obj.position, oa = o.obj.rotation.y, ofx = -Math.sin(oa), ofz = -Math.cos(oa);
      if (Math.hypot(q.x - x, q.z - z) > HALF_LEN * 2 + 2) continue;
      for (const l of [-.6, 0, .6]) for (const m of [-.6, 0, .6]) if (Math.hypot(q.x + ofx * HALF_LEN * m - (x + fx * HALF_LEN * l), q.z + ofz * HALF_LEN * m - (z + fz * HALF_LEN * l)) < R * 2) return o;
    }
    return null;
  }

  // A parked patrol boat goes after the jeep: it turns towards it and closes in, steering round whatever shore is in the way.
  chase(b, dt, player) {
    const o = b.obj, p = o.position, dx = player.position.x - p.x, dz = player.position.z - p.z, d = Math.hypot(dx, dz);
    if (d > GIVE_UP) { b.gaveUp = true; b.chasing = false; }
    else if (d > BOAT_RANGE * .95) b.chasing = player.enabled;
    else if (d < BOAT_RANGE * CLOSE_IN) b.chasing = false;
    let want = 0;
    if (b.chasing) {
      // the heading nearest the jeep's bearing that has water for the next few metres
      const bearing = Math.atan2(-dx, -dz);
      let aim = null;
      for (const off of [0, .4, -.4, .8, -.8, 1.2, -1.2, 1.6, -1.6, 2.2, -2.2]) {
        const a = bearing + off;
        if (this.hullClear(p.x - Math.sin(a) * 6, p.z - Math.cos(a) * 6, a) && this.hullClear(p.x - Math.sin(a) * 3, p.z - Math.cos(a) * 3, a)) { aim = a; break; } // (water for the next 6 m, not just 4: it turns away from a shore in good time)
      }
      b.lowT = b.speed < .45 ? (b.lowT ?? 0) + dt : 0; // (barely moving while chasing: wedged against the shore, or turning on the spot against it)
      if (!b.escape && ((b.stuck ?? 0) > .8 || b.lowT > 1.8)) { // break away: head for the direction with the most open water, nearest the jeep's bearing among the good ones, and sail it for a couple of seconds
        let bestA = null, bestS = -1e9;
        for (let k = 0; k < 24; k++) {
          const a = k / 24 * Math.PI * 2; let run = 0;
          for (let r = 4; r <= 28; r += 4) { const ex = p.x - Math.sin(a) * r, ez = p.z - Math.cos(a) * r; if (this.hullClear(ex, ez, a) && !this.boatHit(b, ex, ez, a)) run = r; else break; }
          let da = a - bearing; da = Math.abs(Math.atan2(Math.sin(da), Math.cos(da)));
          const score = Math.min(run, 16) * 2 - da * 3; if (run >= 8 && score > bestS) { bestS = score; bestA = a; }
        }
        if (bestA !== null) { b.escape = { a: bestA, t: 2.4 }; b.stuck = 0; b.lowT = 0; }
      }
      if (b.escape) { aim = b.escape.a; if ((b.escape.t -= dt) <= 0) b.escape = null; }
      if (aim !== null) {
        let turn = aim - o.rotation.y; turn = Math.atan2(Math.sin(turn), Math.cos(turn));
        o.rotation.y += Math.max(-TURN_RATE * dt, Math.min(TURN_RATE * dt, turn));
        want = CHASE_SPEED * Math.max(b.escape ? .55 : 0, Math.cos(turn)); // (comes round first, then picks up speed; breaking away it keeps moving while it turns)
      }
    }
    b.speed += (want - b.speed) * Math.min(1, dt * 1.5);
    if (b.speed > .05) {
      const step = b.speed * dt, a = o.rotation.y, nx = p.x - Math.sin(a) * step, nz = p.z - Math.cos(a) * step;
      if (this.hullClear(nx, nz, a) && !this.boatHit(b, nx, nz, a)) { p.x = nx; p.z = nz; b.stuck = 0; }
      else { // shore ahead: it does not stop dead: it slides off along the shore, trying a slightly different heading each way until one is clear, so a boat never sticks fast to the coast
        let moved = false;
        for (const off of [.25, -.25, .5, -.5, .8, -.8, 1.2, -1.2]) { const a2 = a + off, mx = p.x - Math.sin(a2) * step, mz = p.z - Math.cos(a2) * step; if (this.hullClear(mx, mz, a2) && !this.boatHit(b, mx, mz, a2)) { p.x = mx; p.z = mz; o.rotation.y += off * Math.min(1, dt * 3); moved = true; break; } }
        if (!moved) { b.speed *= .5; b.stuck = (b.stuck ?? 0) + dt; }
      }
    }
    if (!this.hullClear(p.x, p.z, o.rotation.y) || ((b.stuck ?? 0) > 1.2 && !b.escape)) { // aground (a turn swung the stern onto the shore, or it is wedged): ease it out toward open water, then it carries on
      let best = null, bd = 1e9;
      for (let k = 0; k < 16; k++) { const ang = k / 16 * Math.PI * 2, ex = p.x + Math.cos(ang) * 3.5, ez = p.z + Math.sin(ang) * 3.5; if (this.hullClear(ex, ez, o.rotation.y)) { const dd = Math.hypot(ex - player.position.x, ez - player.position.z); if (dd < bd) { bd = dd; best = [Math.cos(ang), Math.sin(ang)]; } } }
      if (best) { p.x += best[0] * 2.2 * dt; p.z += best[1] * 2.2 * dt; if (this.hullClear(p.x, p.z, o.rotation.y)) b.stuck = 0; }
    }
    const other = this.boatHit(b, p.x, p.z, o.rotation.y); // (two hulls overlapping: ease them apart, so they never sit inside one another)
    if (other) { const ox = p.x - other.obj.position.x, oz = p.z - other.obj.position.z, dd = Math.hypot(ox, oz) || 1, nx2 = p.x + ox / dd * 2.5 * dt, nz2 = p.z + oz / dd * 2.5 * dt; if (this.hullClear(nx2, nz2, o.rotation.y)) { p.x = nx2; p.z = nz2; } }
    this.foam(b, dt);
  }

  // Where a boat is after sailing s metres down its route (and which way it's heading).
  placeAt(b, s) {
    const { path, len } = b.route;
    let i = 1; while (i < len.length - 1 && len[i] < s) i++;
    const k = (s - len[i - 1]) / (len[i] - len[i - 1] || 1);
    b.obj.position.lerpVectors(path[i - 1], path[i], k);
    const a = path[i - 1], c = path[i];
    b.obj.rotation.y = Math.atan2(-(c.x - a.x), -(c.z - a.z));
  }

  // Saved games: each boat's state, how far down the river it got and its armour.
  snapshot() { return this.boats.map(b => ({ st: b.state, s: Math.round(b.s * 100) / 100, hp: b.target.hp, ...(b.spec.chase ? { x: b.obj.position.x, z: b.obj.position.z, ry: b.obj.rotation.y, gu: b.gaveUp } : {}) })); }
  restore(data) {
    (data ?? []).forEach((d, i) => {
      const b = this.boats[i];
      if (!b || d.st === 'wait') return;
      b.s = d.s; this.placeAt(b, d.st === 'parked' ? b.route.total : d.s);
      if (d.x !== undefined) { b.obj.position.x = d.x; b.obj.position.z = d.z; b.obj.rotation.y = d.ry; b.gaveUp = d.gu; } // (a patrol boat that has moved since it parked)
      b.target.hp = d.hp; b.target.asleep = false; b.target.x = b.obj.position.x; b.target.z = b.obj.position.z;
      if (d.st === 'sinking') { // already a wreck: settled half-sunk, scorched
        b.target.hp = 0; b.state = 'sinking'; b.sinkT = 99; b.pitch0 = 0; b.roll0 = 0; b.speed = 0;
        b.obj.traverse(m => { if (m.isMesh) { m.material = m.material.clone(); m.material.color.multiplyScalar(.58); } });
      } else b.state = d.st;
    });
  }

  // Blown up: scorched, a fireball and splash, then it settles stern first, half sunk.
  sink(b) {
    const at = b.obj.position.clone();
    b.state = 'sinking'; b.sinkT = 0; b.speed = 0; b.pitch0 = b.hull.rotation.x; b.roll0 = b.hull.rotation.z;
    b.obj.traverse(m => { if (m.isMesh) { m.material = m.material.clone(); m.material.color.multiplyScalar(.58); } });
    if (!this.iced) { this.fx.waterBlast(at, 1.4); this.world.ripple(at, 1.6); } // (frozen in: no splash)
    this.fx.smoke(at.clone().setY(1.2), 14); // keeps smouldering after it has settled
    if (this.fx.fires) { // the wreck burns: flames along the deck, for a minute, then they die down (every gunboat, manned or not, ends the same way)
      const f = b.foot, ang = b.obj.rotation.y, fx = -Math.sin(ang), fz = -Math.cos(ang);
      this.fx.fires.start([-.55, -.05, .5].map(k => new THREE.Vector3(at.x + fx * k * f.hl * 1.5, .55, at.z + fz * k * f.hl * 1.5)), .6, 60);
    }
    const burnt = new THREE.MeshStandardMaterial({ color: 0x3c4838, roughness: .9, flatShading: true });
    for (let i = 0; i < 8; i++) this.debris.chunk(at.clone().setY(1.2), burnt, .12 + Math.random() * .2, 3);
  }

  // Settles over SINK_TIME seconds into a half-sunk wreck: stern under, bow up and listing to one
  // side, then stays there, rocking gently, with the odd bubble of foam round it.
  sinking(b, dt) {
    const o = b.obj, t = this.time, k = Math.min(1, (b.sinkT += dt) / SINK_TIME), e = 1 - (1 - k) ** 3;
    const sk = this.iced ? .12 : 1, rock = this.iced ? 0 : 1; // (frozen in the ice, the wreck settles only a little: it cannot sink, and it does not rock)
    o.position.y = -.75 * e * sk + Math.sin(t * 1.2 + b.phase) * .03 * e * sk * rock;
    b.hull.rotation.x = b.pitch0 + (.16 * sk - b.pitch0) * e + Math.sin(t * .9 + b.phase) * .01 * sk * rock; // bow lifts as the stern floods
    b.hull.rotation.z = b.roll0 + (.13 * sk - b.roll0) * e + Math.sin(t * 1.1 + b.phase) * .012 * sk * rock; // lists to port
    if (!this.iced && (b.wakeIn -= dt) <= 0) { // (no bubbling foam on ice)
      b.wakeIn = k < 1 ? .15 : 1 + Math.random() * 1.5; // bubbling while it floods, then just the odd one
      this.fx.wake(o.position.clone().setY(0).add(new THREE.Vector3(r() * 1.5, 0, r() * 3)), k < 1 ? .5 : .35, 1.5);
    }
  }
}
