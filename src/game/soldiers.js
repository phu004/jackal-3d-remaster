// Enemy foot soldiers. The stage has a fixed garrison (from the level data): each soldier ambles
// about near his post until the jeep comes near, then hunts it, routing round obstacles with a flow
// field, stopping now and then to fire a lethal shell. One bullet, a grenade or the jeep running
// him over kills him. Bodies stay where they fall (baked into a few meshes once they've settled).
import { sfx } from './sfx.js';
import * as THREE from 'three';
import { buildSoldier } from '../assets/soldier.js';
import { LEVEL } from './world.js';
import { PUDDLE } from './puddles.js';
import { HALF_LEN, HALF_WID } from './player.js';
import { mergeStatic, dropTinyShadows, mergeGeometries, skinify, rebindSkins, freezeSkin } from './optimize.js';

const RUN_OFF = 4.7; // m/s: a soldier off his rope runs this fast for a moment to get clear of the others
const ropeGeo = new THREE.CylinderGeometry(.025, .025, 1, 5), ropeMat = new THREE.MeshBasicMaterial({ color: 0x3a3226 }), _hook = new THREE.Vector3(); // (a helicopter's rope: one metre long, stretched to fit)

// Behaviour tuning. Each stage can override any of these (stage data: difficulty.soldier), so later
// stages can be made harder: faster, more trigger-happy, more direct.
export const SOLDIER_DEFAULTS = {
  walk: 1.7,              // m/s
  range: 22,              // shooting range, m
  reload: [8, 12],        // seconds between shots
  firstShot: [3, 5],      // delay before the first shot after waking
  wander: .35,            // max drift off the ideal path, radians
  wanderEvery: [.8, 1.8], // seconds between picking a new drift
  pause: 0,               // chance per drift change that he stops and looks around instead
};
// How often soldiers fire, by stage: stage 1's gentle pace, a little quicker (FIRE_RAMP shorter
// waits) with each stage after. A stage's own difficulty.soldier can still override it.
const FIRE_BASE = { reload: [15, 22], firstShot: [5, 8] }, FIRE_RAMP = .75;
export function soldierFire(stageNo = 1) {
  const k = Math.pow(FIRE_RAMP, Math.max(0, stageNo - 1)), sc = ([a, b]) => [a * k, b * k];
  return { reload: sc(FIRE_BASE.reload), firstShot: sc(FIRE_BASE.firstShot) };
}
const TURN = 5;                                            // turn rate
const STRIDE = 1.4;                                        // metres per full walk cycle (two steps)
const STAND = 7, BACK_OFF = 5, DODGE = 6;                  // close-range only: stand, back away, sidestep a jeep driving at him
const AIM_STOP = 1.1, WARN = .75;                          // he stops, flashes for WARN seconds as a warning, then fires
const AMBLE = 3, AMBLE_SPEED = .45;                        // before waking: wanders within this many metres of his post, at this fraction of his walk
const WAKE = 34, SLEEP = 80, HIDE = 65;                    // wake when the jeep's this close; idle again / hidden when this far
const RADIUS = .45, SCORE = 100, CELL = 1.25;
const rand = (a, b) => a + Math.random() * (b - a);

// Flow field: walking distance (in cells) from every cell near the jeep to the jeep, going round
// jungle, water, walls, rocks and buildings. Soldiers just step to whichever neighbour is closer.
// (a debugging aid: __soldierReport() in the console: what the route field costs, how often it starts over, how many soldiers are awake)
const blockedFoot = (w, x, z, r) => w.blocked(x, z, r) || !!w.steepAt?.(x, z); // (a foot soldier is also stopped by steep ground: the mountain's faces)
const ST = { frames: 0, build: 0, builds: 0, refills: 0, total: 0, awake: 0, ground: 0, amble: 0, sight: 0 }; let blockedBase = null;
window.__soldierReport = () => { const f = Math.max(1, ST.frames), B = window.__blockedT ?? { n: 0, t: 0 }; console.log(['soldiers over ' + ST.frames + ' frames:', 'update total     ' + (ST.total / f).toFixed(2) + ' ms', 'flow.build       ' + (ST.build / f).toFixed(2) + ' ms  (' + ST.builds + ' builds, ' + ST.refills + ' cache refills)', 'world.blocked    ' + (B.t / f).toFixed(2) + ' ms  (' + (B.n / f).toFixed(1) + ' calls per frame, all callers)', 'awake soldiers   ' + (ST.awake / f).toFixed(1), 'ground height   ' + (ST.ground / f).toFixed(2) + ' ms', 'amble (patrol)  ' + (ST.amble / f).toFixed(2) + ' ms', 'line of sight   ' + (ST.sight / f).toFixed(2) + ' ms'].join(String.fromCharCode(10))); for (const k in ST) ST[k] = 0; if (window.__blockedT) { window.__blockedT.n = 0; window.__blockedT.t = 0; } };
class FlowField {
  constructor(world) {
    this.world = world;
    this.cols = Math.round(LEVEL.halfWidth * 2 / CELL); this.rows = Math.round(LEVEL.length / CELL);
    this.dist = new Float32Array(this.cols * this.rows).fill(Infinity);
    this.walk = new Int8Array(this.cols * this.rows).fill(-1); // -1 unknown, 0 blocked, 1 walkable (cached)
    this.alive = -1; // how many obstacles stood when the walkable cache was filled
  }
  cellOf(x, z) { return [Math.floor((z + LEVEL.length) / CELL), Math.floor((x + LEVEL.halfWidth) / CELL)]; }
  centre(r, c) { return [-LEVEL.halfWidth + (c + .5) * CELL, -LEVEL.length + (r + .5) * CELL]; }
  walkable(r, c) {
    if (r < 0 || r >= this.rows || c < 0 || c >= this.cols) return false;
    const i = r * this.cols + c;
    if (this.walk[i] < 0) { const [x, z] = this.centre(r, c); this.walk[i] = blockedFoot(this.world, x, z, .5) ? 0 : 1; }
    return this.walk[i] === 1;
  }
  // Breadth-first from the jeep's cell, within `span` rows of it (8 directions, no corner cutting).
  build(target, dt, span = 45) {
    // obstacles only change when something is destroyed (a gutted building may open a way through):
    // then the walkable cache is re-checked. (Re-testing every cell against every obstacle is costly:
    // stage 2's colonnades are hundreds of obstacles.)
    let alive = 0; for (const o of this.world.obstacles) if (o.alive) alive++;
    if (alive !== this.alive) { this.alive = alive; this.walk.fill(-1); ST.refills++; }
    this.dist.fill(Infinity);
    const [tr, tc] = this.cellOf(target.x, target.z), r0 = tr - span, r1 = tr + span, q = [];
    if (tr < 0 || tr >= this.rows || tc < 0 || tc >= this.cols) return;
    this.dist[tr * this.cols + tc] = 0; q.push(tr, tc);
    for (let h = 0; h < q.length; h += 2) {
      const r = q[h], c = q[h + 1], d = this.dist[r * this.cols + c] + 1;
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
        if (!dr && !dc) continue;
        const nr = r + dr, nc = c + dc;
        if (nr < r0 || nr > r1 || !this.walkable(nr, nc) || this.dist[nr * this.cols + nc] <= d) continue;
        if (dr && dc && !(this.walkable(r + dr, c) && this.walkable(r, c + dc))) continue; // no cutting corners
        this.dist[nr * this.cols + nc] = d; q.push(nr, nc);
      }
    }
  }
  // Centre of the neighbouring cell that's closest to the jeep, or null if this cell isn't connected.
  next(x, z) {
    const [r, c] = this.cellOf(x, z);
    if (r < 0 || r >= this.rows || c < 0 || c >= this.cols) return null;
    let best = this.dist[r * this.cols + c], pick = null;
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      const nr = r + dr, nc = c + dc;
      if (nr < 0 || nr >= this.rows || nc < 0 || nc >= this.cols) continue;
      const d = this.dist[nr * this.cols + nc];
      if (d < best) { best = d; pick = [nr, nc]; }
    }
    return pick && this.centre(...pick);
  }
}

// The soldier model with each part's static pieces merged into a few meshes (the named body, joints, launcher and markers stay apart, so
// the walk, aim and launcher drop still work), built once and copied per soldier. Checked against the plain model: if the merge comes
// out empty or a different size, the plain model is used and a warning logged.
let soldierTemplate = null;
function soldierModel() {
  if (soldierTemplate) return soldierTemplate;
  const plain = buildSoldier(), probe = plain.clone(true), want = new THREE.Box3().setFromObject(plain);
  try {
    mergeStatic(probe);
    const got = new THREE.Box3().setFromObject(probe), a = want.getSize(new THREE.Vector3()), b = got.getSize(new THREE.Vector3());
    let meshes = 0; probe.traverse(m => { if (m.isMesh) meshes++; });
    if (meshes && b.y > 0 && Math.abs(a.x - b.x) < .05 && Math.abs(a.y - b.y) < .05 && Math.abs(a.z - b.z) < .05 && probe.children[0]?.name === 'body') { try { skinify(probe, ['body', 'legL', 'legR', 'kneeL', 'kneeR', 'armL', 'armR', 'launcher']); } catch (e) { console.warn('Soldier skinning failed:', e); } return soldierTemplate = dropTinyShadows(probe); } // (skinified: one skinned mesh per material over the same named groups, a few draw calls a soldier)
    console.warn('Soldier merge rejected: size before', a.toArray(), 'after', b.toArray(), 'meshes', meshes);
  } catch (e) { console.warn('Soldier merge failed:', e); }
  return soldierTemplate = dropTinyShadows(plain);
}

const _toJeep = new THREE.Vector3(), _at = new THREE.Vector3(); // scratch for the per-frame loop (no garbage)

const IDLE_DIST = 85; // m from the jeep: farther than this the enemies stand idle, no wandering and no route finding
export class Soldiers {
  constructor(scene, fx, enemyFire, debris, tuning = {}) {
    this.cfg = this.baseCfg = { ...SOLDIER_DEFAULTS, ...tuning };
    this.scene = scene; this.fx = fx; this.enemyFire = enemyFire; this.debris = debris; this.list = []; this.flowIn = 0; this.kills = 0;
    this.jeepAt = new THREE.Vector3();
  }

  // Place the garrison from the level data.
  populate(world) {
    this.world = world;
    this.flow = new FlowField(world);
    for (const p of world.soldierSpots) this.add(p, world);
    const P = world.soldierPatrol; if (P) for (const s of this.list) if (Math.hypot(s.home.x - P.x, s.home.z - P.z) < P.r) s.patrol = P; // (a level's patrol: these soldiers walk the whole area instead of standing at their posts)
    this.all = [...this.list]; // the garrison by spawn order (saved games refer to soldiers by it)
  }

  // A reinforcement stepping out of the trees at p, already awake and coming for the jeep (not counted in the kill rate).
  spawn(p, stageNo = 3, leaves = true) { // behaves as the soldiers of stage `stageNo` do (how often they fire; the default drift)
    this.add(p, this.world); const s = this.list[this.list.length - 1];
    s.cfg = { ...SOLDIER_DEFAULTS, ...soldierFire(stageNo) }; s.extra = true; s.awake = true; s.reload = rand(...s.cfg.firstShot) * s.nerve * .5; s.heading = Math.atan2(-(this.jeepAt.x - p.x), -(this.jeepAt.z - p.z));
    if (leaves) this.fx.hitLeaves(p.clone().setY(1));
    return s;
  }

  // A reinforcement lowered on a rope from `anchor` (an Object3D: a helicopter's door) to the ground at its foot, then off at the jeep. He can be shot on the way down.
  lower(anchor, stageNo = 4, speed = 3.2, runOff = null) { // runOff: a heading (radians on the ground) he runs along for a moment on landing, so a group spreads out
    const from = anchor.getWorldPosition(new THREE.Vector3()), s = this.spawn(from.clone().setY(this.world.heightAt?.(from.x, from.z) ?? 0), stageNo, false);
    const rope = new THREE.Mesh(ropeGeo, ropeMat); rope.castShadow = false; this.scene.add(rope);
    s.drop = { anchor, y: from.y - 1.1, speed, rope, runOff, dx: rand(-.5, .5), dz: rand(-.5, .5) }; s.obj.position.y = s.drop.y; s.reload += 1.5; s.target.immune = s.target.passWhenImmune = true; // (untouchable, and shots pass him by, until his feet are on the ground) // (he starts shooting only once he is down, or nearly)
    return s;
  }
  endDrop(s) { if (!s.drop) return; s.target.immune = false; s.target.passWhenImmune = false; this.scene.remove(s.drop.rope); s.drop = null; }
  // one frame of a soldier on his rope: it hangs straight down from the door (which drifts), he slides down it; once his feet are on the ground he lets go
  dropStep(s, world, dt) {
    const d = s.drop, p = s.obj.position, a = d.anchor.getWorldPosition(_hook), ground = world.heightAt ? world.heightAt(p.x, p.z) : 0;
    p.x = a.x + d.dx; p.z = a.z + d.dz; d.y = Math.max(ground, d.y - d.speed * dt); p.y = d.y;
    s.target.x = p.x; s.target.z = p.z; this.pose(s, false, dt);
    const top = a.y, r = d.rope; r.position.set(p.x, (top + p.y + 1.7) / 2, p.z); r.scale.set(1, Math.max(.01, top - p.y - 1.7), 1); r.visible = top > p.y + 1.7;
    if (d.y <= ground) { if (d.runOff !== null) s.scatter = { x: Math.cos(d.runOff), z: Math.sin(d.runOff), t: rand(1.0, 1.6) }; this.endDrop(s); }
  }

  update(dt, world, player, cam, addScore) { ST.frames++; const _u = performance.now(); try { this.update0(dt, world, player, cam, addScore); } finally { ST.total += performance.now() - _u; ST.awake += this.list.reduce((n, s) => n + (s.awake && !s.dead ? 1 : 0), 0); } }
  update0(dt, world, player, cam, addScore) {
    const active = player.enabled && !player.dead;
    this.jeepAt.copy(player.position); this.jeepYaw = player.yaw;
    if ((this.flowIn -= dt) <= 0 && active) { this.flowIn = .5; if (this.list.some(s => s.awake && !s.dead)) { const _b = performance.now(); this.flow.build(player.position, .5); ST.build += performance.now() - _b; ST.builds++; } } // (the route field is only worked out while somebody is hunting)

    if ((this.sweepIn = (this.sweepIn ?? 2) - dt) <= 0) { this.sweepIn = 2; this.sweepBodies(); }
    for (let i = this.list.length - 1; i >= 0; i--) {
      const s = this.list[i], o = s.obj, p = o.position;
      this.cfg = s.cfg ?? this.baseCfg; // (a reinforcement has his own, keener than the stage's)
      if (s.dead) { // (its target is dropped here, not in kill(): kill() can run while weapons loop over the targets)
        this.dropTarget(s, world); this.animateDeath(s, dt);
        if (s.sunk) { // gone under the water
          this.scene.remove(o);
          if (s.launcher && this.inWater(s.launcher.position)) { this.scene.remove(s.launcher); this.debris.forget(s.launcher); }
          else if (s.launcher) this.bake({ launcher: s.launcher }); // landed on dry ground: it stays
          this.list.splice(i, 1);
        } else if (!s.sinking && (s.how === 'shot' ? s.t > 1.5 : s.rested)) { this.bake(s); this.list.splice(i, 1); } // settled: a permanent corpse
        continue;
      }
      if (s.drop) { this.dropStep(s, world, dt); continue; } // (on a rope from a helicopter: no walking yet)
      if (s.scatter && (s.scatter.t -= dt) > 0) { // just landed: runs off along his own heading to spread the group out, before the usual hunt
        const sc = s.scatter, box = this.arenaBox, nx = p.x + sc.x * RUN_OFF * dt, nz = p.z + sc.z * RUN_OFF * dt;
        if (!blockedFoot(world, nx, nz, RADIUS) && (!box || (nx > box.x0 && nx < box.x1 && nz > box.north && nz < box.south))) { p.x = nx; p.z = nz; }
        s.walk += dt * RUN_OFF / STRIDE * Math.PI * 2; p.y = world.heightAt ? world.heightAt(p.x, p.z) : 0; s.heading = Math.atan2(-sc.x, -sc.z); o.rotation.y = s.heading; this.pose(s, true, dt); s.target.x = p.x; s.target.z = p.z; continue;
      }
      { const bv = world.conveyorAt?.(p.x, p.z) ?? 0; if (bv) { const nz = p.z + bv * dt; if (!blockedFoot(world, p.x, nz, RADIUS)) p.z = nz; } } // (a conveyor belt carries him south)
      { const _g = performance.now(); if (p.x !== s.gx || p.z !== s.gz) { s.gx = p.x; s.gz = p.z; s.gy = (world.heightAt ? world.heightAt(p.x, p.z) : 0) - .2 * (world.mudK?.(p.x, p.z) ?? 0); } p.y = s.gy; ST.ground += performance.now() - _g; } /* (the ground under him is looked up only when he has moved) */ // standing on the drawn ground (stage 2's terraces are raised); wading through stage 4's mud he sinks to the knees
      if (world.swampAt?.(p.x, p.z) && (s.idleRing = (s.idleRing ?? Math.random()) - dt) <= 0) { s.idleRing = .9 + Math.random() * .8; world.ripple(p, .18); } // (even standing still, a faint ring now and then round his legs)
      const fromCam = p.distanceTo(cam.focus);
      o.visible = fromCam < HIDE;                       // far away: not drawn at all
      const toJeep = _toJeep.subVectors(player.position, p).setY(0), dist = toJeep.length(); // (scratch: only used in this pass of the loop)
      const _s0 = performance.now(); let sees = false; if (dist < this.cfg.range) { if ((s.sightIn = (s.sightIn ?? Math.random() * .2) - dt) <= 0) { s.sightIn = .2; s.sightVal = this.lineOfSight(world, p, player.position); } sees = !!s.sightVal; } else s.sightIn = 0; ST.sight += performance.now() - _s0; /* (the clear-line test walks the whole line against every obstacle: it is redone five times a second per soldier, not every frame) */ // walls, buildings, rocks, jungle block it
      if (!s.awake) { // ambling about his post until the jeep comes near
        if (active && (dist < WAKE || cam.inPlayWindow(_at.copy(p).setY(1), 1))) { s.awake = true; s.reload = rand(...this.cfg.firstShot) * s.nerve + s.react; s.idle = 0; s.goal = null; }
        else { if (o.visible && (dist < IDLE_DIST || s.patrol)) { const _a = performance.now(); this.amble(s, world, dt); ST.amble += performance.now() - _a; } s.target.x = p.x; s.target.z = p.z; continue; } // (far from the jeep: he just stands, no wandering)
      }
      if (fromCam > SLEEP) { s.awake = false; continue; } // left far behind: back to idle

      if (active && this.underJeep(p, player)) { this.kill(s, 'runover'); addScore(SCORE); continue; }

      s.reload -= dt; s.stop -= dt;
      if (s.stop > 0) { // standing to shoot: face the target
        this.face(s, Math.atan2(-toJeep.x, -toJeep.z), dt);
      } else if (active && s.reload <= 0 && sees && cam.inPlayWindow(_at.copy(p).setY(1.5), 1)) { // only fires with a clear line
        s.reload = rand(...this.cfg.reload) * s.nerve; s.stop = AIM_STOP; s.fireAt = WARN; // stop and flash, then fire
      } else if (active) { // follow the flow field toward the jeep, wandering a little
        if ((s.wanderIn -= dt) <= 0) {
          s.wanderIn = rand(...this.cfg.wanderEvery); s.wander = rand(-this.cfg.wander, this.cfg.wander);
          if (Math.random() < .4) s.side = -s.side; // (which way he circles when close)
          if (Math.random() < this.cfg.pause) s.idle = rand(.8, 1.8); // stop and look around for a moment
        }
        if (s.idle > 0) { // pausing: glance about, then carry on
          s.idle -= dt; this.face(s, s.heading + Math.sin(s.idle * 3) * .02, dt); this.pose(s, false, dt);
          s.target.x = p.x; s.target.z = p.z; continue;
        }
        let heading;
        if (s.recentre > 0) { // stuck on a corner: step back to the middle of this cell, where the route is clear
          s.recentre -= dt;
          const [r, c] = this.flow.cellOf(p.x, p.z), [cx, cz] = this.flow.centre(r, c);
          heading = Math.atan2(-(cx - p.x), -(cz - p.z));
        } else {
          // NES-simple from a distance: just walk toward the jeep and shoot. Only up close does he avoid
          // walking under it: sidestep if it's driving straight at him, back away if it's very near,
          // otherwise circle round it, keeping his distance.
          const toward = Math.atan2(-toJeep.x, -toJeep.z), wander = s.blockedFor > 0 ? 0 : s.wander; // no wandering into walls
          const f = player.facing(), ahead = -(f.x * toJeep.x + f.z * toJeep.z) / Math.max(dist, 1e-3); // 1 = right in front of it
          // (the close-range rules only apply when he can actually see the jeep; behind a wall he keeps
          // following the route round it)
          if (!sees) {
            const next = s.extra ? null : this.flow.next(p.x, p.z); // (a reinforcement walks straight at the jeep)
            heading = next ? Math.atan2(-(next[0] - p.x), -(next[1] - p.z)) + wander : toward + wander * 2;
          } else if (dist < DODGE * s.mind && ahead > .8) { // it's driving at me: sidestep off its line
            const cross = f.x * toJeep.z - f.z * toJeep.x; // > 0: I'm to the jeep's left
            heading = player.yaw + (cross > 0 ? 1 : -1) * Math.PI / 2;
          } else if (dist < BACK_OFF * s.mind) heading = toward + Math.PI;
          else if (dist < STAND * s.mind) heading = toward + s.side * Math.PI / 2; // circle round it
          else {
            const next = s.extra ? null : this.flow.next(p.x, p.z); // (a reinforcement walks straight at the jeep)
            heading = next ? Math.atan2(-(next[0] - p.x), -(next[1] - p.z)) + wander : toward + wander * 2;
            if (s.flank) heading += s.flank * Math.min(1, (dist - STAND) / 14); // angles in from the side, straightening up as he closes
          }
          s.holding = s.hold && sees && dist < this.cfg.range * .85; // his ground: faces the jeep and lets it come
          if (s.holding) heading = toward;
        }
        const embedded = !s.extra && blockedFoot(world, p.x, p.z, RADIUS); // (standing inside a sandbag or a wall: every step would be "blocked", so he never moves)
        if (embedded) { // walk out by the nearest way: the first direction, trying them round the circle from the way he wants to go, that has open ground within 1.6 m
          const out = [.6, 1.1, 1.6].flatMap(d => Array.from({ length: 16 }, (_, k) => ({ d, h: heading + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * Math.PI / 8 }))).find(({ d, h }) => !blockedFoot(world, p.x - Math.sin(h) * d, p.z - Math.cos(h) * d, RADIUS));
          if (out) heading = out.h;
        }
        if (s.recentre <= 0 && !s.holding && !s.extra && !embedded) { // (the close-range rules above head straight at, away from or round the jeep, whatever stands between: a soldier in a sandbag arc would press against it forever)
          const clear = h => !blockedFoot(world, p.x - Math.sin(h) * 1.1, p.z - Math.cos(h) * 1.1, RADIUS);
          if (!clear(heading)) {
            const next = this.flow.next(p.x, p.z), route = next ? Math.atan2(-(next[0] - p.x), -(next[1] - p.z)) : null; // the way round, from the flow field
            const pick = [route, heading + s.side * 1.1, heading - s.side * 1.1].find(h => h != null && clear(h));
            if (pick != null) heading = pick; else s.side = -s.side;
          }
        }
        if (!s.holding && !s.extra) { // stuck? walking for over a second and hardly moved: for a moment, head for the open ground (the longest clear run) whatever the rules above say
          s.moveT = (s.moveT ?? 0) + dt;
          if (s.moveT > 1.2) {
            const mk = s.mark ?? p, moved = Math.hypot(p.x - mk.x, p.z - mk.z); s.moveT = 0; s.mark = { x: p.x, z: p.z };
            if (moved < .35 && !s.unstick) {
              let best = -1, bestH = heading;
              for (let k = 0; k < 16; k++) {
                const h = k * Math.PI / 8; let run = 0; while (run < 4 && !blockedFoot(world, p.x - Math.sin(h) * (run + .4), p.z - Math.cos(h) * (run + .4), RADIUS)) run += .4;
                const score = run - Math.abs(Math.atan2(Math.sin(h - heading), Math.cos(h - heading))) * .3; // (the longest run, a little favouring the way he wanted to go)
                if (score > best) { best = score; bestH = h; }
              }
              s.escapeH = bestH; s.unstick = 1.4;
            }
          }
          if (s.unstick > 0) { s.unstick -= dt; heading = s.escapeH; if (s.unstick <= 0) s.unstick = 0; }
        }
        this.face(s, heading, dt);
        if (embedded) s.holding = false; // (a held post inside a sandbag: he has to get out first)
        const step = (s.holding ? 0 : this.cfg.walk * s.speed) * dt, nx = p.x - Math.sin(s.heading) * step, nz = p.z - Math.cos(s.heading) * step;
        const box = s.extra && this.arenaBox, free = box ? (x, z) => x > box.x0 - 1 && x < box.x1 + 1 && z > box.north - 1 && z < box.south + 1 : embedded ? () => true : (x, z) => !blockedFoot(world, x, z, RADIUS); // (a reinforcement walks through the trees: only the arena's edge holds him)
        // full step, else slide along whichever axis is free, else go back to the cell centre for a moment
        if (free(nx, nz)) { p.x = nx; p.z = nz; s.blockedFor = Math.max(0, s.blockedFor - dt); }
        else if (free(nx, p.z)) { p.x = nx; s.blockedFor = .5; }
        else if (free(p.x, nz)) { p.z = nz; s.blockedFor = .5; }
        else { s.recentre = .5; s.blockedFor = .5; s.side = -s.side; }
        s.walk += dt * (s.holding ? 0 : this.cfg.walk * s.speed) / STRIDE * Math.PI * 2;
        if (world.groundTrail && step > 0 && !s.extra) { s.stepD = (s.stepD ?? 0) + step; if (s.stepD > .72 && Math.hypot(p.x - player.position.x, p.z - player.position.z) < 55) { s.stepD = 0; s.foot = -(s.foot ?? 1); world.groundTrail.footprint(p.x, p.z, s.heading, s.foot); } } // (the snow level: a footprint every step, left and right in turn, for the soldiers near the jeep)
        if (world.swampAt?.(p.x, p.z) && !s.holding && (s.wadeIn = (s.wadeIn ?? 0) - dt) <= 0) { s.wadeIn = .25 + Math.random() * .15; world.ripple(p, .5, { x: -Math.sin(s.heading), z: -Math.cos(s.heading) }); } // (rings spreading from his legs: the half ahead of him)
      }
      if (s.fireAt !== undefined && (s.fireAt -= dt) <= 0) {
        s.fireAt = undefined;
        if (active) {
          this.enemyFire.shoot(s.muzzle.getWorldPosition(new THREE.Vector3()), this.cfg.range);
          // back-blast out of the rear of the launcher
          const back = s.breech.getWorldPosition(new THREE.Vector3()), dir = back.clone().sub(s.muzzle.getWorldPosition(new THREE.Vector3())).setY(0).normalize();
          for (let k = 0; k < 4; k++) this.fx.puff(back, { color: 0xb8b0a0, size: .15, grow: 3, life: .7 + Math.random() * .3, opacity: .5,
            vel: dir.clone().multiplyScalar(3 + Math.random() * 3).add(new THREE.Vector3((Math.random() - .5) * 1.5, .6, (Math.random() - .5) * 1.5)) });
        }
      }
      // warning flash while lining up a shot: three quick red blinks (as on the NES)
      const warn = s.fireAt !== undefined ? (WARN - s.fireAt) / WARN : -1;
      const glow = warn >= 0 && Math.sin(warn * Math.PI * 6) > 0 ? .9 : 0;
      if (glow !== s.glow) { s.glow = glow; for (const m of s.mats) m.emissive.setRGB(glow, glow * .08, glow * .05); }
      this.pose(s, s.stop <= 0 && active && !s.holding, dt);
      s.target.x = p.x; s.target.z = p.z; // keep the hit box on him
    }
    this.cfg = this.baseCfg;
  }

  // Before the jeep comes near: stroll to a spot within AMBLE metres of his post, stand there a moment,
  // pick another. Anything in the way just makes him pick a new spot.
  // The open spots of a patrol's ground (no building, bunker or steep face on them): picked at random once, kept, and shared by every soldier of the patrol.
  patrolSpots(P, world) {
    if (P.spots) return P.spots;
    P.spots = []; let sd = 7;
    for (let i = 0; i < 160 && P.spots.length < 40; i++) { sd = (sd * 16807) % 2147483647; const a = sd / 2147483647 * Math.PI * 2; sd = (sd * 16807) % 2147483647; const r = 3 + sd / 2147483647 * (P.r - 3), x = P.x + Math.sin(a) * r, z = P.z + Math.cos(a) * r; if (!blockedFoot(world, x, z, RADIUS + .4)) P.spots.push([x, z]); }
    return P.spots;
  }
  amble(s, world, dt) {
    const p = s.obj.position;
    if (s.idle > 0) { s.idle -= dt; this.pose(s, false, dt); return; }
    if (!s.goal) { // (a patrolling soldier picks his next stop from the patrol's ready-made list of open spots; the list is worked out once, see patrolSpots)
      const P = s.patrol;
      if (P) { const spots = this.patrolSpots(P, world); let g = spots[Math.floor(Math.random() * spots.length)]; if (g && Math.hypot(g[0] - p.x, g[1] - p.z) < 3) g = spots[Math.floor(Math.random() * spots.length)]; s.goal = g ? [g[0], g[1]] : [p.x, p.z]; }
      else { const a = Math.random() * Math.PI * 2, r = rand(1, AMBLE); s.goal = [s.home.x + Math.sin(a) * r, s.home.z + Math.cos(a) * r]; }
    }
    const dx = s.goal[0] - p.x, dz = s.goal[1] - p.z;
    if (Math.hypot(dx, dz) < .3) { s.goal = null; s.idle = s.patrol ? rand(.2, .9) : rand(.8, 2); this.pose(s, false, dt); return; } // there: stand a moment
    this.face(s, Math.atan2(-dx, -dz), dt);
    const v = this.cfg.walk * (s.patrol ? .6 : AMBLE_SPEED), sx = -Math.sin(s.heading), sz = -Math.cos(s.heading), nx = p.x + sx * v * dt, nz = p.z + sz * v * dt;
    if (s.patrol) { // (the way ahead is tested a few times a second, half a metre on, not every frame: each test is a costly look at the ground and the obstacles)
      if (s.freeT > 0) s.freeT -= dt; // (caught in something, a bunker's footing: he walks free of the tests for a moment, out toward a spot of the open ground)
      else if ((s.chkIn = (s.chkIn ?? 0) - dt) <= 0) { s.chkIn = .12; if (blockedFoot(world, p.x + sx * .5, p.z + sz * .5, RADIUS)) { s.blockedN = (s.blockedN ?? 0) + 1; if (s.blockedN > 4) { s.blockedN = 0; s.freeT = 1.5; } else { s.goal = null; s.idle = .15; this.pose(s, false, dt); return; } } else s.blockedN = 0; }
    } else if (blockedFoot(world, nx, nz, RADIUS)) { s.goal = null; s.idle = .4; this.pose(s, false, dt); return; }
    p.x = nx; p.z = nz; s.walk += dt * v / STRIDE * Math.PI * 2;
    this.pose(s, true, dt);
  }

  // Walk cycle. The gait blends in and out (no snapping between walking and standing); legs swing
  // from the hip, each knee bends as its leg swings forward, the body dips when the legs are spread
  // and rises as they pass, and the torso rolls and counter-twists a little with each step.
  pose(s, walking, dt = 1 / 60) {
    s.gait += ((walking ? 1 : 0) - s.gait) * Math.min(1, dt * 6);
    const g = s.gait, ph = s.walk, sw = Math.sin(ph), cw = Math.cos(ph), body = s.obj.children[0];
    s.legL.rotation.x = sw * .5 * g; s.legR.rotation.x = -sw * .5 * g;
    s.kneeL.rotation.x = -Math.max(0, cw) * .9 * g; s.kneeR.rotation.x = -Math.max(0, -cw) * .9 * g;
    body.position.y = -Math.abs(sw) * .06 * g;
    body.rotation.set(-.07 * g, sw * .07 * g, sw * .035 * g); // lean forward, counter-twist, roll
  }

  face(s, heading, dt) {
    let d = heading - s.heading; d = Math.atan2(Math.sin(d), Math.cos(d));
    s.heading += d * Math.min(1, TURN * dt);
    s.obj.rotation.y = s.heading;
  }

  add(p, world) {
    const obj = soldierModel().clone(true); rebindSkins(obj); dropTinyShadows(obj, .36); obj.position.copy(p); obj.rotation.order = 'YXZ'; obj.traverse(c => c.layers.enable(PUDDLE)); this.scene.add(obj); // (a copy of the merged template: far fewer draw calls) (PUDDLE: stage 6's wet road mirrors him)
    const mats = [];
    obj.traverse(c => { // own copies of the materials, so only this soldier lights up when he flashes
      if (!c.isMesh) return;
      c.userData.baseMat = c.material; c.material = c.material.clone(); c.material.skinning = !!c.isSkinnedMesh; mats.push(c.material);
    });
    const s = {
      mats, glow: 0,
      // personality: his own pace, how close he likes to get, how keen he is to shoot, and how he approaches
      speed: rand(.8, 1.2), nerve: rand(.75, 1.35), react: rand(0, 2.5), flank: 0, hold: false,
      mind: { rush: rand(.5, .8), normal: rand(.9, 1.15), wary: rand(1.3, 1.7) }[['rush', 'normal', 'normal', 'wary'][Math.floor(Math.random() * 4)]],
      obj, home: p.clone(), goal: null, side: Math.random() < .5 ? -1 : 1, heading: 0, wander: 0, wanderIn: 0, blockedFor: 0, recentre: 0, idle: 0, walk: Math.random() * 6, reload: 0, stop: 0, dead: false, awake: false,
      legL: obj.getObjectByName('legL'), legR: obj.getObjectByName('legR'), kneeL: obj.getObjectByName('kneeL'), kneeR: obj.getObjectByName('kneeR'), gait: 0, armL: obj.getObjectByName('armL'), armR: obj.getObjectByName('armR'), muzzle: obj.getObjectByName('muzzle'), breech: obj.getObjectByName('breech'),
    };
    // a target for the player's weapons; it moves with him (see update)
    s.target = { object: obj, x: p.x, z: p.z, hw: 1.125, hd: 1.125, r: 1.125, hp: 1, score: SCORE, soft: true, die: () => this.kill(s, 'shot') };
    world.targets.push(s.target);
    const r = Math.random(); // a third come at the jeep from the side, a fifth stand their ground and shoot
    if (r < .33) s.flank = (Math.random() < .5 ? -1 : 1) * rand(.35, .7); else if (r < .53) s.hold = true;
    this.list.push(s);
  }

  // Saved games: each soldier dead (0) or alive [x, z, heading, awake], plus the kill count.
  snapshot() {
    const r = v => Math.round(v * 100) / 100;
    return { kills: this.kills, list: this.all.map(s => s.dead ? (s.sinking || s.sunk ? 0 : ['d', r(s.obj.position.x), r(s.obj.position.z)]) // a body
      : [r(s.obj.position.x), r(s.obj.position.z), r(s.heading), s.awake ? 1 : 0, r(s.reload ?? 0), r(s.fireAt ?? -1)]) };
  }
  restore(data, world) {
    if (!data) return;
    this.kills = data.kills ?? 0;
    data.list.forEach((d, i) => {
      const s = this.all[i];
      if (!s) return;
      if (d === 0 || d[0] === 'd') { // killed before the save: gone under the water, or lying where he fell
        s.dead = true; s.target.hp = 0; this.dropTarget(s, world);
        const k = this.list.indexOf(s); if (k >= 0) this.list.splice(k, 1);
        if (d === 0) { this.scene.remove(s.obj); return; }
        this.layBody(s, d[1], d[2], world);
        return;
      }
      s.obj.position.set(d[0], 0, d[1]); s.heading = d[2]; s.obj.rotation.y = d[2]; s.awake = !!d[3];
      if (d[4] !== undefined) { s.reload = d[4]; s.fireAt = d[5] >= 0 ? d[5] : undefined; } // mid-warning stays mid-warning
      s.target.x = d[0]; s.target.z = d[1];
    });
  }

  // A body for a restored game: the shot-death pose, fallen back or sideways with a twist, legs
  // buckled and arms flung out, baked into the ground like the others.
  // A body lying flat on the ground casts no shadow (too low and small to see; it saves a few
  // draw calls in the shadow map for every soldier down).
  flatten(s) { s.obj.traverse(m => { if (m.isMesh) m.castShadow = false; }); }

  layBody(s, x, z, world) {
    this.flatten(s);
    const o = s.obj, fall = Math.random() < .12 ? Math.PI + rand(-.5, .5) : rand(-1.1, 1.1), ang = 1.45;
    o.position.set(x, world.heightAt ? world.heightAt(x, z) : 0, z);
    o.rotation.y = rand(0, Math.PI * 2); o.rotation.x = Math.cos(fall) * ang; o.rotation.z = Math.sin(fall) * ang;
    s.legL.rotation.x = -.75; s.legR.rotation.x = -.3;
    s.armL.rotation.set(-.9, 0, 1.15); s.armR.rotation.set(-1.25, 0, -.85);
    for (const m of s.mats) m.emissive.setScalar(0);
    this.bake(s);
  }

  underJeep(p, player) {
    const dx = p.x - player.position.x, dz = p.z - player.position.z, y = player.yaw;
    const u = dx * -Math.sin(y) + dz * -Math.cos(y), v = dx * Math.cos(y) + dz * -Math.sin(y);
    return Math.abs(u) < HALF_LEN + RADIUS && Math.abs(v) < HALF_WID + RADIUS;
  }

  kill(s, how) {
    if (s.dead) return;
    if (s.drop) { this.endDrop(s); s.obj.position.y = this.world.heightAt?.(s.obj.position.x, s.obj.position.z) ?? 0; } // (shot on his rope: he drops)
    s.dead = true; s.how = how; s.t = 0; s.target.hp = 0; s.fireAt = undefined; s.landed = false;
    if (!s.extra) this.kills++; // (for the stage results; reinforcements aren't in the garrison's total)
    s.h0 = s.obj.position.y; // the ground he fell on (raised on a terrace)
    for (const m of s.mats) m.emissive.setScalar(0);
    const at = s.obj.position.clone().setY(.4), away = at.clone().sub(this.jeepAt).setY(0).normalize();
    this.fx.puff(at, { color: 0xc8a070, size: .4, grow: 2.5, life: .8, opacity: .55, vel: new THREE.Vector3(0, 1, 0) });
    // the launcher is knocked out of his hands and tumbles away
    const rl = s.obj.getObjectByName('launcher');
    if (rl && this.debris) {
      this.scene.attach(rl); s.launcher = rl; // remembered so it's baked along with his body
      this.debris.launch(rl, away.clone().multiplyScalar(rand(1.5, 3.5)).add(new THREE.Vector3(rand(-1.5, 1.5), rand(3, 5), rand(-1.5, 1.5))),
        new THREE.Vector3(rand(-6, 6), rand(-6, 6), rand(-6, 6)), .1);
    }
    if (how === 'runover') {
      sfx.crush();
      // thrown along the jeep's direction of travel and off to the side he was on, tumbling head over heels
      const fx = -Math.sin(this.jeepYaw), fz = -Math.cos(this.jeepYaw), rx = -fz, rz = fx; // forward, right
      const side = Math.sign(away.x * rx + away.z * rz) || 1;
      const dir = new THREE.Vector3(fx + rx * side * .7, 0, fz + rz * side * .7).normalize();
      s.vel = dir.multiplyScalar(rand(7, 10)).setY(rand(3.5, 5));
      s.throwYaw = Math.atan2(-s.vel.x, -s.vel.z); s.tumble = 0; s.spin = rand(9, 13); s.roll = rand(-.4, .4);
      s.bounces = 0; s.flying = true; s.rested = false; s.dustIn = 0;
      s.obj.children[0].position.y = -1.05; s.obj.position.y = 1.15 + s.h0; // tumble about his hips, not his feet
      this.fx.hitSand(s.obj.position.clone().setY(0));
      return;
    }
    // shot: thrown back away from the jeep, falling mostly backward or sideways, now and then forward
    s.deathAt = s.obj.position.clone();
    s.push = away.multiplyScalar(rand(.6, 1.2));
    s.fallDir = Math.random() < .12 ? Math.PI + rand(-.5, .5) : rand(-1.1, 1.1); // 0 = straight back
    s.twist = rand(-.8, .8);
  }

  // Shot: jerks back and is shoved away, knees buckle and arms fling out, then he drops with a
  // twist, accelerating into the ground, bounces slightly and lies still.
  // Run over: thrown through the air tumbling with limbs flailing, lands, bounces once, then skids
  // to a stop in a trail of dust and settles on his back or front.
  animateDeath(s, dt) {
    s.t += dt;
    const t = s.t, o = s.obj;
    { const bv = this.world?.conveyorAt?.(o.position.x, o.position.z) ?? 0; // a body that lands on a conveyor belt is carried south on it, and sinks into it (like into water, but quietly) until it is gone
      if (bv && t > .6) { o.position.z += bv * dt; if (s.deathAt) s.deathAt.z += bv * dt; if (!s.sinking) { s.sinking = true; s.sinkT = 0; s.flying = false; } } }
    if (!s.sinking && this.world?.chasmAt?.(o.position.x, o.position.z) && !(s.how === 'runover' && s.flying && s.vel.y > 0)) { // over a chasm: he falls (gravity), down into the haze, and is gone
      s.fallV = Math.min(30, (s.fallV ?? 0) + 25 * dt); o.position.y -= s.fallV * dt; s.chasmFall = true;
      if (o.position.y < -11) s.sunk = true;
      if (s.how === 'shot' || !s.flying) { o.rotation.x += dt * 2.5; return; }
    }
    if (s.sinking) { // slowly going under, bobbing and tilting, until he's below the surface
      s.sinkT += dt;
      o.position.y -= dt * (.5 + s.sinkT * .4);
      o.position.y += Math.sin(s.sinkT * 5) * .01;
      o.rotation.z += dt * .3;
      if (s.launcher && this.inWater(s.launcher.position)) s.launcher.position.y -= dt * 1.2;
      if (o.position.y < -3) s.sunk = true;
      return;
    }
    if (s.how === 'runover' && !s.rested) {
      const p = o.position;
      if (s.flying) {
        s.vel.y -= 25 * dt;
        s.tumble += s.spin * dt;
        const flail = Math.sin(t * 22);
        s.legL.rotation.x = .9 * flail; s.legR.rotation.x = -.9 * flail;
        s.armL.rotation.set(-1.4 + flail * .6, 0, 1.0); s.armR.rotation.set(-1.2 - flail * .6, 0, -1.0);
      }
      const nx = p.x + s.vel.x * dt, nz = p.z + s.vel.z * dt, w = this.world;
      const solid = w && (w.tileAt(nx, nz) === 'T' || w.obstacles.some(b => b.alive && Math.abs(nx - b.x) < b.hw + .3 && Math.abs(nz - b.z) < b.hd + .3));
      if (solid) { s.vel.x *= -.2; s.vel.z *= -.2; } // thrown into something: stops dead (water and shore don't stop him)
      else { p.x = nx; p.z = nz; }
      p.y += s.vel.y * dt;
      if (s.flying && !s.chasmFall && p.y <= .22 + s.h0 && s.vel.y < 0) { // hits the ground (hips just above it when lying)
        p.y = .22 + s.h0;
        if (this.inWater(p)) { this.startSinking(s); return; }
        this.fx.puff(p.clone().setY(.2), { color: 0xc8a070, size: .5, grow: 2.6, life: .9, opacity: .55, vel: new THREE.Vector3(0, .8, 0) });
        if (s.bounces++ < 1) { s.vel.y *= -.3; s.vel.x *= .6; s.vel.z *= .6; s.spin *= .5; }
        else { s.flying = false; s.vel.y = 0; s.settle = Math.round((s.tumble - Math.PI / 2) / Math.PI) * Math.PI + Math.PI / 2; } // lie on back or front
      }
      if (!s.flying) { // skid to a stop, dust trailing
        const k = Math.max(0, 1 - dt * 4.5); s.vel.x *= k; s.vel.z *= k;
        s.tumble += (s.settle - s.tumble) * Math.min(1, dt * 10);
        s.legL.rotation.x *= k; s.legR.rotation.x *= k;
        if ((s.dustIn -= dt) <= 0 && Math.hypot(s.vel.x, s.vel.z) > 1) {
          s.dustIn = .05;
          this.fx.puff(p.clone().setY(.15), { color: 0xd0a868, size: .25, grow: 2, life: .6, opacity: .45 });
        }
        if (Math.hypot(s.vel.x, s.vel.z) < .15) s.rested = true;
      }
      o.rotation.set(s.tumble, s.throwYaw, s.roll);
      return;
    }
    if (s.how === 'shot') {
      const k = Math.min(1, t / .55);
      let ang = k * k * 1.45; // ~83 degrees, accelerating like a real fall
      if (t > .55) ang = 1.45 + Math.sin((t - .55) * 20) * .09 * Math.exp(-(t - .55) * 9); // bounce on landing
      o.rotation.y = s.heading + s.twist * Math.min(1, t / .5);
      o.rotation.x = Math.cos(s.fallDir) * ang;
      o.rotation.z = Math.sin(s.fallDir) * ang;
      const kb = 1 - Math.pow(1 - Math.min(1, t / .45), 3); // shove, easing out
      o.position.x = s.deathAt.x + s.push.x * kb; o.position.z = s.deathAt.z + s.push.z * kb;
      const b = Math.min(1, t / .3); // knees buckle unevenly, arms fling up and out
      s.legL.rotation.x = -.75 * b; s.legR.rotation.x = -.3 * b;
      s.armL.rotation.set(1.0 - 1.9 * b, 0, .55 + .6 * b);
      s.armR.rotation.set(.25 - 1.5 * b, 0, -.05 - .8 * b);
      if (!s.landed && t > .55 && this.inWater(o.position)) { s.landed = true; this.startSinking(s); return; }
      if (!s.landed && t > .55) { // hits the ground
        s.landed = true; this.flatten(s);
        this.fx.puff(o.position.clone().setY(.2), { color: 0xc8a070, size: .5, grow: 2.8, life: .9, opacity: .5, vel: new THREE.Vector3(0, .6, 0) });
      }
    }
  }

  // Clear line between a and b? Sampled every half metre; blocked by jungle and solid objects (walls,
  // buildings, rocks, turrets), not by water, shore or palms.
  lineOfSight(world, a, b) {
    const d = Math.hypot(b.x - a.x, b.z - a.z), n = Math.ceil(d / .5);
    for (let i = 1; i < n; i++) {
      const k = i / n, x = a.x + (b.x - a.x) * k, z = a.z + (b.z - a.z) * k;
      const tile = world.tileAt(x, z);
      if (tile === 'T' || tile === 'B' || tile === 'K' || tile === 'L') return false; // (stage 3's crates, buildings and laser walls)
      if (world.obstacles.some(o => o.alive && o.kind !== 'palm' && o.kind !== 'blocker' && o.kind !== 'foxhole' && Math.abs(x - o.x) < o.hw && Math.abs(z - o.z) < o.hd)) return false;
    }
    return true;
  }

  // Water under a body: at the spot, or within a body's reach of it (one lying on the very edge is half over the water, so it goes under too).
  inWater(p) {
    const w = this.world; if (!w) return false;
    const wet = (x, z) => (w.waterAt ?? ((a, b) => w.tileAt(a, b) === '~'))(x, z);
    return wet(p.x, p.z) || [[.4, 0], [-.4, 0], [0, .4], [0, -.4]].filter(([dx, dz]) => wet(p.x + dx, p.z + dz)).length >= 2;
  }

  // Falling into the water: a splash and a ripple, then he sinks (see animateDeath).
  startSinking(s) {
    const p = s.obj.position;
    s.sinking = true; s.sinkT = 0; s.flying = false;
    this.fx.waterBlast(p.clone().setY(0), .45);
    this.fx.hitWater(p.clone().setY(0));
    this.world.ripple(p, .6);
  }

  // A settled body (and his dropped launcher) is baked into one mesh per material, back on the shared
  // materials, without shadows: ~40 draw calls per pass become a handful, so bodies can stay forever.
  bake(s) {
    if (s.obj) freezeSkin(s.obj); // (a skinned body comes to rest as plain meshes, as he lies)
    for (const obj of [s.obj, s.launcher]) {
      if (!obj) continue;
      if (obj === s.launcher) this.debris.forget(obj); // stop moving it, it stays where it landed
      obj.traverse(c => { if (c !== obj) c.name = ''; if (c.isMesh && c.userData.baseMat) c.material = c.userData.baseMat; });
      mergeStatic(obj);
      obj.traverse(c => { if (c.isMesh) c.castShadow = false; });
      (this.bakedObjs ??= []).push(obj);
    }
  }

  // The settled bodies and launchers, each already a handful of meshes, are merged further: one mesh per material per 30 m block, for all of them together. A field of the dead was a few draw calls a body; now it is a few draw calls in all.
  sweepBodies() {
    const list = this.bakedObjs; if (!list || list.length < 4) return;
    const cells = new Map(), done = [];
    for (const o of list) {
      if (!o.parent) continue; o.updateMatrixWorld(true);
      const key = Math.floor(o.position.x / 30) + ',' + Math.floor(o.position.z / 30), byMat = cells.get(key) ?? cells.set(key, new Map()).get(key);
      o.traverse(m => { if (!m.isMesh || Array.isArray(m.material) || m.isInstancedMesh) return; const arr = byMat.get(m.material) ?? byMat.set(m.material, []).get(m.material); arr.push({ m, geo: (m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone()).applyMatrix4(m.matrixWorld) }); });
      done.push(o);
    }
    let ok = true;
    const made = [];
    for (const byMat of cells.values()) for (const [material, arr] of byMat) {
      const merged = mergeGeometries(arr.map(e => e.geo)); if (!merged) { ok = false; continue; }
      const mesh = new THREE.Mesh(merged, material); mesh.castShadow = false; mesh.receiveShadow = true; /* (a body lying on the snow takes the shadows of what stands over it) */ mesh.layers.mask = arr[0].m.layers.mask; made.push(mesh);
    }
    if (!ok) { for (const g of made) g.geometry.dispose(); this.bakedObjs = []; return; } // (odd geometry somewhere: leave the bodies as they are)
    for (const g of made) this.scene.add(g);
    for (const o of done) this.scene.remove(o); // (their geometry may be shared with live soldiers: not disposed)
    this.bakedObjs = [];
  }

  dropTarget(s, world) { const i = world.targets.indexOf(s.target); if (i >= 0) world.targets.splice(i, 1); }
}
