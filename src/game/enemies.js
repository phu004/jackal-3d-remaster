// Enemy fire: turrets shoot slow, long-range shells at the jeep, in bursts of three, but only while
// they're inside the play window. One hit is lethal. Turrets aim at where the jeep was AIM_DELAY seconds ago, so keeping on the move dodges them.
import { sfx } from './sfx.js';
import * as THREE from 'three';
import { HALF_LEN, HALF_WID } from './player.js';
import { followGround } from './lift.js';
import { addToLayer, REFLECT } from './layers.js'; // shells show in the water (only near it)

const FIRE_RANGE = 28, SHELL_SPEED = 13.5, SHELL_LIFE = FIRE_RANGE / SHELL_SPEED; // ~28 m reach (player's gun: ~22.5 m)
const RELOAD_MIN = 2.4, RELOAD_VAR = .8, AIM_TOLERANCE = .2; // radians off target it will still fire
const BURST = 3, BURST_GAP = .28, AIM_DELAY = 1;
export const HEAVY_SHELL = { size: 1.8, pad: .15, speed: 1.3 }; // the medium tank's and the M270's shells: big, orange, quick
// (a gun can also have reloadK: its reload times are this many times the usual: the M270's less frequent volleys)
// Recoil (gun emplacements and tanks: anything whose turret has a `gun`): the barrel slams back this
// far (m) and the turret rocks back a little, then both ease home over RECOIL_TIME seconds.
const RECOIL = .45, RECOIL_ROCK = .07, RECOIL_TIME = .26;
const FULL_VIEW_WAIT = 1;                                  // s a fullView gun waits once wholly on screen before it may fire
const HIT_PAD = -.25;                                       // shells must land this far inside the jeep's outline (forgiving)

// Shell: a small, solid red-hot round with a tight glow and a thin tracer streak behind it
// (built along -Z, the direction of travel; the group is turned to face where it's going).
const coreGeo = new THREE.SphereGeometry(.12, 10, 8).scale(1, 1, 1.5), glowGeo = new THREE.SphereGeometry(.19, 10, 8).scale(1, 1, 1.4);
const trailGeo = new THREE.CylinderGeometry(.02, .09, 1.1, 6).rotateX(Math.PI / 2).translate(0, 0, .6);
const coreMat = new THREE.MeshBasicMaterial({ color: 0xffd8a0 });
const glowMat = new THREE.MeshBasicMaterial({ color: 0xff4010, transparent: true, opacity: .55, blending: THREE.AdditiveBlending, depthWrite: false });
const trailMat = new THREE.MeshBasicMaterial({ color: 0xff5a18, transparent: true, opacity: .45, blending: THREE.AdditiveBlending, depthWrite: false });
// Heavy shells (the medium tank's, drawn bigger): a deep orange round in a red glow, with a red-orange trail.
const heavyCoreMat = new THREE.MeshBasicMaterial({ color: 0xff8a1c });
const heavyGlowMat = new THREE.MeshBasicMaterial({ color: 0xff2a06, transparent: true, opacity: .6, blending: THREE.AdditiveBlending, depthWrite: false });
const heavyTrailMat = new THREE.MeshBasicMaterial({ color: 0xff3c0c, transparent: true, opacity: .5, blending: THREE.AdditiveBlending, depthWrite: false });
// A shell is only a place and a heading (an Object3D that is never in the scene); every shell in flight is drawn as one instance of each of three
// InstancedMeshes (core, glow, trail), one set for the normal shells and one for the heavy: six draw calls in all, however many are flying.
const makeShell = () => new THREE.Object3D();
const SHELL_CAP = 128;
function shellBatch(heavy) {
  return [[coreGeo, heavy ? heavyCoreMat : coreMat, 5], [glowGeo, heavy ? heavyGlowMat : glowMat, 4], [trailGeo, heavy ? heavyTrailMat : trailMat, 4]].map(([geo, mat, order]) => {
    const m = new THREE.InstancedMesh(geo, mat, SHELL_CAP);
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.frustumCulled = false; m.count = 0; m.visible = false; m.renderOrder = order; m.userData.fxBatch = true;
    return m;
  });
}

const _a = new THREE.Vector3(); // scratch for the per-frame tests (no garbage)
const TALL = new Set(['B', 'K', 'L', 'X', 'F', 'n']); // terrain shells don't fly over (stage 3: crates, buildings, laser walls; stage 4: cliffs)
const tallAt = (world, x, z) => { const t = world.tileAt(x, z); return TALL.has(t) && !(t === 'X' && world.shotOverRock); }; // (rock cells stop shells, except on the secret level, where the mountain's own shape does)

export class EnemyFire {
  constructor(scene, fx) {
    this.scene = scene; this.fx = fx; this.shells = [];
    this.batches = [shellBatch(false), shellBatch(true)];
    for (const b of this.batches) for (const m of b) scene.add(addToLayer(m, REFLECT)); // (shells show in the water)
    this.time = 0; this.trail = []; // recent jeep positions: { t, x, z }
    this.aim = new THREE.Vector3();  // where the jeep was AIM_DELAY seconds ago (what turrets aim at)
  }

  // Record the jeep's path and work out where it was AIM_DELAY seconds ago.
  track(dt, player) {
    this.time += dt;
    if (player.dead || !player.enabled) { this.trail.length = 0; this.aim.copy(player.position); return; }
    this.trail.push({ t: this.time, x: player.position.x, z: player.position.z });
    while (this.trail.length > 2 && this.trail[1].t < this.time - AIM_DELAY) this.trail.shift();
    const a = this.trail[0], b = this.trail[1] ?? a, want = this.time - AIM_DELAY;
    const k = b.t > a.t ? Math.min(1, Math.max(0, (want - a.t) / (b.t - a.t))) : 0;
    this.aim.set(a.x + (b.x - a.x) * k, 0, a.z + (b.z - a.z) * k);
  }

  // Where the jeep was `delay` seconds ago (up to AIM_DELAY), into `out` (e.g. the statues' missiles: half a second).
  aimAgo(delay, out = new THREE.Vector3()) {
    const tr = this.trail, want = this.time - delay;
    if (!tr.length) return out.copy(this.aim);
    let i = tr.length - 1;
    while (i > 0 && tr[i - 1].t >= want) i--; // tr[i] is the first entry at or after `want`
    const b = tr[i], a = tr[Math.max(0, i - 1)], k = b.t > a.t ? Math.min(1, Math.max(0, (want - a.t) / (b.t - a.t))) : 1;
    return out.set(a.x + (b.x - a.x) * k, 0, a.z + (b.z - a.z) * k);
  }

  // turrets: [{ top, base, target }] from the world. onHit() is called when a shell hits the jeep.
  update(dt, world, player, onHit, cam) {
    this.world = world; // (shoot() needs the ground's height under the muzzle)
    this.track(dt, player);
    const ap = this.aim, canShoot = player.enabled && !player.dead;
    // Fair play: a turret only shoots while it's inside the play window, which is the same for every
    // screen shape (see GameCamera), so a wide monitor never exposes you to extra fire.
    // Counts as visible if its body or its barrel tip is inside (no margin): if you can see it, it can shoot.
    const onScreen = t => cam.inPlayWindow(_a.copy(t.base.position).setY(1.4), 1)
      || cam.inPlayWindow((t.muzzle ??= t.top.getObjectByName('muzzle')).getWorldPosition(_a), 1);
    for (const t of world.turrets) if (t.kick > 0 && t.target.hp > 0) { // recoil: back at once, then easing home (not once wrecked: the turret may be flying off)
      t.kick = Math.max(0, t.kick - dt / RECOIL_TIME);
      const k = t.kick * t.kick, gun = t.top.getObjectByName('gun');
      if (gun) gun.position.z = RECOIL * k;
      { const th = t.top.rotation.y, d = RECOIL_ROCK * k; t.top.position.x = (t.topX ?? 0) + Math.sin(th) * d; t.top.position.z = (t.topZ ?? 0) + Math.cos(th) * d; } // (the whole turret rocks back along its own barrel's line, not along the hull's axis)
    }
    for (const t of world.turrets) {
      if (t.target.hp <= 0 || t.target.asleep) continue; // (asleep: e.g. a gunboat still on its way)
      if (t.fullView && !t.armed) { // e.g. tanks coming up from behind: hold fire until wholly on screen, and a moment more
        const b = t.base, c = Math.cos(b.rotation.y), sn = Math.sin(b.rotation.y), { hl, hw } = t.fullView;
        const whole = cam && [[1, 1], [1, -1], [-1, 1], [-1, -1]].every(([u, v]) =>
          cam.inPlayWindow(new THREE.Vector3(b.position.x - sn * u * hl + c * v * hw, 1, b.position.z - c * u * hl - sn * v * hw), .92));
        t.seenFor = whole ? (t.seenFor ?? 0) + dt : 0;
        if (t.seenFor < FULL_VIEW_WAIT) { t.burst = 0; continue; }
        t.armed = true;
      }
      const at = t.live ? player.position : ap; // tanks aim at where the jeep is now, not where it was
      const dx = at.x - t.base.position.x, dz = at.z - t.base.position.z, dist = Math.hypot(dx, dz);
      const now = Math.hypot(player.position.x - t.base.position.x, player.position.z - t.base.position.z);
      const range = t.range ?? FIRE_RANGE; // (gunboats reach a little further)
      if (!canShoot || dist > range || now > range || (cam && !onScreen(t))) { // out of range or off screen (the jeep must be in range now, not just a second ago)
        if (t.burst > 0) { t.burst = 0; t.reload = (RELOAD_MIN + Math.random() * RELOAD_VAR) * (t.reloadK ?? 1); } // a burst cut short still needs its full reload (else a gun on the screen's edge fires again each time it flickers back into view)
        else t.reload = Math.max(0, (t.reload ?? Math.random()) - dt); // keeps reloading, so it can fire the moment the jeep enters
        continue;
      }
      if (t.burst > 0) { // mid-burst: next shell when the gap is up
        if ((t.gap -= dt) > 0) continue;
        if (!t.lofted && (() => { const nw = performance.now(); if (nw - (t.mzAt ?? -1e9) > 200) { t.mzAt = nw; t.mzOk = this.muzzleClear(world, t, player.position); } return !t.mzOk; })()) { t.burst = 0; t.reload = (RELOAD_MIN + Math.random() * RELOAD_VAR) * (t.reloadK ?? 1); continue; } // (the tank has rolled up to a wall mid-burst)
        this.fire(t, player);
        t.gap = t.burstGap ?? BURST_GAP;
        if (--t.burst === 0) t.reload = (RELOAD_MIN + Math.random() * RELOAD_VAR) * (t.reloadK ?? 1);
        continue;
      }
      t.reload = (t.reload ?? 0) - dt;
      if (t.reload > 0) continue;
      if (!t.lofted) { const nw = performance.now(); if (nw - (t.losAt ?? -1e9) > 200) { t.losAt = nw; t.losOk = this.clearLine(world, t.base.position, player.position) && this.muzzleClear(world, t, player.position); } if (!t.losOk) continue; } /* (the clear-line tests walk the whole line against every obstacle: redone five times a second per gun, not every frame) */ // (a lofted gun, on a wall, fires over buildings and walls: nothing is in its way) // a wall, crate or building in the way (or the muzzle poking through one): holds its fire till it has a shot
      // start a burst once the barrel is lined up with the (delayed) aim point
      const facing = t.base.rotation.y + t.top.rotation.y;
      let err = Math.atan2(-dx, -dz) - facing; err = Math.atan2(Math.sin(err), Math.cos(err));
      if (Math.abs(err) > AIM_TOLERANCE) continue;
      t.burst = t.burstSize ?? BURST; t.gap = 0; // (tanks fire pairs)
    }

    for (let i = this.shells.length - 1; i >= 0; i--) {
      const s = this.shells[i], p = s.m.position;
      p.addScaledVector(s.vel, dt); s.life -= dt;
      const above = followGround(s, p, world, dt);
      const gnd = p.y - above; // (the height of the ground under it: everything below is measured from there, not from zero: on the secret level's plateau, 50 m up, a shell dived to a height of 1 m above sea level, which is under the ground, and was gone at once)
      if (s.hitY !== undefined) { // a shell from a gun up high: it dives so as to be at the jeep's height by the time it reaches the jeep, wherever the jeep has got to (steepening as it closes: never left hovering over it, never flying over it)
        const d = Math.hypot(p.x - player.position.x, p.z - player.position.z);
        s.d0 ??= Math.max(d, 1); s.h0 ??= Math.max(above, 1); s.dMin = Math.min(s.dMin ?? d, d);
        p.y = Math.min(p.y, gnd + 1 + (s.h0 - 1) * Math.pow(Math.min(1, s.dMin / s.d0), 1.5));
      }
      let done = false;
      if (s.cover === undefined && s.lofted) s.cover = [[0, 0], [2.5, 0], [-2.5, 0], [0, 2.5], [0, -2.5]].some(([dx, dz]) => tallAt(world, p.x + dx, p.z + dz)); // (a gun on a roof: its shell is let out of the roof it stands on, even from the roof's edge, then buildings and walls beyond stop it)
      if (s.cover !== false) s.cover = s.cover === undefined ? tallAt(world, p.x, p.z) : tallAt(world, p.x, p.z); // (a shell that starts inside such a tile, e.g. a gun standing in the scrub, is let out of it: true while it is still in that tile, then false for good)
      if (canShoot && !player.invulnerable && (s.hitY === undefined || p.y - gnd < s.hitY) && this.hitsJeep(p, player, s.pad)) { onHit(); done = true; } // (hitY: a shell from high up, e.g. the helicopter's, hurts only once it is down to the jeep's height)
      else if (world.tileAt(p.x, p.z) === 'T') { this.fx.hitLeaves(p); done = true; }
      else if (tallAt(world, p.x, p.z) && (s.lofted ? s.cover !== true && p.y < (world.buildingTop?.(p.x, p.z) ?? 0) : s.cover !== true)) { this.fx.hitHard(p); done = true; } // stage 3's crates, buildings and laser walls (s.cover: see below). A lofted shell (from a gun on a roof) clears a building only while it is above that building's roof: coming down behind a wall, it hits the concrete
      else if (world.facesAhead?.(p.x, p.z, s.vel.x, s.vel.z)) { this.fx.hitHard(p); done = true; } // (the secret level: a shell stops on a mountain face in its way, not on ground that falls away beside it)
      else if (!s.lofted && world.obstacles.some(o => o.alive && o.kind !== 'palm' && o.kind !== 'turret' && o.kind !== 'm270' && o.kind !== 'parkedjeep' && o.kind !== 'f35' && o.kind !== 'warship' && o.kind !== 'blocker' && o.kind !== 'foxhole' && o.kind !== 'barrier' // enemy fire passes through enemies (and over barriers)
        && Math.abs(p.x - o.x) < o.hw && Math.abs(p.z - o.z) < o.hd)) { this.fx.hitHard(p); done = true; }
      else if (above <= 0) { // end of its range: strikes the ground
        (world.tileAt(p.x, p.z) === '~' || world.swampAt?.(p.x, p.z)) ? this.fx.hitWater(p) : this.fx.hitSand(p); done = true;
      }
      if (done) this.shells.splice(i, 1);
    }
    this.drawShells();
  }

  drawShells() { // every shell in flight into its batch
    for (const [h, b] of this.batches.entries()) {
      let n = 0;
      for (const s of this.shells) { if (!!s.heavy !== !!h || n >= SHELL_CAP) continue; s.m.updateMatrix(); for (const m of b) m.setMatrixAt(n, s.m.matrix); n++; }
      for (const m of b) { m.count = n; m.visible = n > 0; m.instanceMatrix.needsUpdate = true; }
    }
  }

  // Nothing a shell would hit (stage 3's walls, crates, buildings; solid objects) on the straight line from a to b?
  clearLine(world, a, b, ends = false, skip = 0) { // ends: the points a and b themselves count too; skip: metres from a that are not tested (a gun on top of a wall: the wall under it is not in its way)
    const d = Math.hypot(b.x - a.x, b.z - a.z), n = Math.ceil(d / .75);
    for (let i = ends ? 0 : 1; i < (ends ? n + 1 : n); i++) {
      if (i / n * d < skip) continue;
      const k = n ? i / n : 0, x = a.x + (b.x - a.x) * k, z = a.z + (b.z - a.z) * k, tile = world.tileAt(x, z);
      if (TALL.has(tile)) return false;
      if (world.obstacles.some(o => o.alive && (o.kind === 'wall' || o.kind === 'container' || o.kind === 'building' || o.kind === 'gate') && Math.abs(x - o.x) < o.hw && Math.abs(z - o.z) < o.hd)) return false;
    }
    return true;
  }

  // A gun whose muzzle has poked through a wall (a tank nosed up against it) must not shoot over it: hull to muzzle and muzzle to jeep must both be clear.
  muzzleClear(world, t, target) {
    const m = t.muzzle ?? t.top.getObjectByName('muzzle');
    if (!m) return true;
    const from = m.getWorldPosition(new THREE.Vector3());
    return this.clearLine(world, t.base.position, from, true) && this.clearLine(world, from, target, true);
  }

  // One shell from turret t toward the current (delayed) aim point.
  fire(t, player) {
    const from = (t.muzzle ?? t.top.getObjectByName('muzzle')).getWorldPosition(new THREE.Vector3()), range = t.range ?? FIRE_RANGE, at = t.live ? player.position : this.aim;
    if (t.spread) { // a fan of shells (angles from the line to the jeep, in radians), each as far as the line would reach
      const a = Math.atan2(at.z - from.z, at.x - from.x), dist = Math.max(8, Math.hypot(at.x - from.x, at.z - from.z));
      for (const off of t.spread) this.shoot(from, range, new THREE.Vector3(from.x + Math.cos(a + off) * dist, 0, from.z + Math.sin(a + off) * dist), t.shell, t.cannon, t.lofted);
    } else if (t.scatter) { // a ripple: each shell of the volley goes off a little differently from the line to the jeep (random, up to `scatter` radians either side)
      const a = Math.atan2(at.z - from.z, at.x - from.x) + (Math.random() * 2 - 1) * t.scatter, dist = Math.max(8, Math.hypot(at.x - from.x, at.z - from.z)) * (.85 + Math.random() * .3);
      this.shoot(from, range, new THREE.Vector3(from.x + Math.cos(a) * dist, 0, from.z + Math.sin(a) * dist), t.shell, t.cannon, t.lofted);
    } else this.shoot(from, range, at, t.shell, t.cannon, t.lofted);
    t.onFire?.(); // (a gun that animates its own recoil, e.g. the warship's)
    if (!t.noRecoil && t.top.getObjectByName('gun')) { if (!(t.kick > 0)) { t.topZ = t.top.position.z; t.topX = t.top.position.x; } t.kick = 1; } // gun emplacements and tanks recoil
  }

  // A shell from `muzzle` toward the (delayed) aim point, reaching `range` metres. Any enemy can use it.
  // heavy: { size, pad, speed } for a bigger, orange shell (the medium tank's): drawn `size` times over, flying
  // `speed` times as fast (same reach), and it hits the jeep within `pad` m of its outline (normal shells must
  // land HIT_PAD inside it).
  shoot(muzzle, range, aim = this.aim, heavy, cannon = false, lofted = false) { // lofted: a shell from a gun up on a wall: it flies over walls and buildings (they do not stop it)
    // cannon: the recorded cannon report (static turrets and tanks) instead of the synthesized gun; 'heavy': the deeper recording of the heavy shells
    const speed = SHELL_SPEED * (heavy?.speed ?? 1), life = range / speed;
    const dir = new THREE.Vector3(aim.x - muzzle.x, 0, aim.z - muzzle.z).normalize();
    // drops gently so it strikes the ground at the end of its range, like the player's bullets
    // (a gun high up, e.g. on a roof: the shell comes down steeply to meet the jeep at the aim point, at its own height, and only hurts it once it is down there: a hit shows as a hit, not as a shell hovering overhead)
    // (on the secret level's sloped ground the muzzle's height is the ground's plus the gun's: the drop must be worked out from the height ABOVE the ground, or the shell dives into the slope long before the end of its range)
    const mh = this.world?.slopedShots ? muzzle.y - (this.world.shotHeightAt?.(muzzle.x, muzzle.z) ?? 0) : muzzle.y;
    const elevated = mh > 3, flightTime = Math.max(.15, Math.hypot(aim.x - muzzle.x, aim.z - muzzle.z) / speed);
    const vel = dir.clone().multiplyScalar(speed).setY(elevated ? -(mh - 1) / flightTime : -mh / life); // clone: `dir` must stay unit length for the flash
    const shell = makeShell(!!heavy); shell.position.copy(muzzle); if (heavy) shell.scale.setScalar(heavy.size);
    shell.rotation.order = 'YXZ'; shell.rotation.set(Math.atan2(vel.y, speed), Math.atan2(-dir.x, -dir.z), 0);
    this.shells.push({ m: shell, vel, life, size: heavy?.size ?? 1, pad: heavy?.pad ?? HIT_PAD, heavy: !!heavy, lofted, hitY: elevated ? 2.4 : undefined }); this.drawShells();
    this.fx.turretFlash(muzzle, dir); if (cannon) this.fx.cannonLight?.(muzzle, dir, !!heavy); sfx.enemyShot(muzzle, !!heavy || cannon === 'heavy', !!cannon); // (cannon: 'heavy' = the heavy recording on an ordinary shell: the warship's guns)
  }

  // Saved games: shells in flight, each gun's burst / reload / warning state and where its turret
  // points (by its place in world.turrets), and the jeep's recent track the guns aim along.
  snapshot(world) {
    const r = v => Math.round(v * 1000) / 1000;
    return {
      shells: this.shells.map(s => [r(s.m.position.x), r(s.m.position.y), r(s.m.position.z), r(s.vel.x), r(s.vel.y), r(s.vel.z), r(s.life), s.size, s.pad]),
      guns: world.turrets.map(t => [t.burst ?? 0, r(t.gap ?? 0), r(t.reload ?? 0), t.armed ? 1 : 0, r(t.seenFor ?? 0), r(t.top.rotation.y)]),
      trail: this.trail.map(p => [r(this.time - p.t), r(p.x), r(p.z)]), // ages, not times
    };
  }
  restore(d, world) {
    if (!d) return;
    for (const [x, y, z, vx, vy, vz, life, size = 1, pad = HIT_PAD] of d.shells) { // (older saves: normal shells)
      const vel = new THREE.Vector3(vx, vy, vz), shell = makeShell(size > 1);
      shell.position.set(x, y, z); shell.rotation.order = 'YXZ'; shell.scale.setScalar(size);
      shell.rotation.set(Math.atan2(vy, Math.hypot(vx, vz)), Math.atan2(-vx, -vz), 0);
      this.shells.push({ m: shell, vel, life, size, pad, heavy: size > 1 });
    }
    this.drawShells();
    d.guns.forEach(([burst, gap, reload, armed, seenFor, aim], i) => {
      const t = world.turrets[i];
      if (!t) return;
      Object.assign(t, { burst, gap, reload, armed: !!armed, seenFor }); t.top.rotation.y = aim;
    });
    this.time = 10; this.trail = d.trail.map(([age, x, z]) => ({ t: this.time - age, x, z }));
  }

  hitsJeep(p, player, pad = HIT_PAD) {
    const dx = p.x - player.position.x, dz = p.z - player.position.z, y = player.yaw;
    const u = dx * -Math.sin(y) + dz * -Math.cos(y), v = dx * Math.cos(y) + dz * -Math.sin(y); // along / across the jeep
    return Math.abs(u) < HALF_LEN + pad && Math.abs(v) < HALF_WID + pad;
  }

  // Every shell in the air gone (pop: each with a little burst where it was, e.g. when the boss falls).
  clear(pop = false) { for (const s of this.shells) { if (pop) this.fx.hitHard(s.m.position); } this.shells.length = 0; this.drawShells(); }
}
