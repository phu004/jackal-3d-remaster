// Jackal rules: the machine gun always fires "up the screen" (north); grenades go the way the jeep faces.
// Grenades fly over natural obstacles (rocks, palms, jungle, walls) but burst on the first enemy or
// destructible object they pass over, judged on the ground plane like the NES's 2D logic.
// Bullets fly past palms, but stop on targets, walls, rocks and jungle,
// and otherwise drop gently to hit the ground at the end of their range.
// Launcher upgrades (each rescued engineer raises the level): 0 grenade, 1 rocket, 2 rocket that
// splits into 2 sideways shots on detonation, 3 rocket that splits 4 ways. Rockets fly straight and
// low at twice the grenade's speed with the same range, kill soldiers without stopping, and detonate
// on walls and buildings. The split shots pass through all terrain, and through tanks without hurting them (NES).
import * as THREE from 'three';
import { buildGrenade } from '../assets/grenade.js';
import { buildRocket } from '../assets/rocket.js';
import { followGround } from './lift.js';
import { hazeify } from './bridge.js';
import { sfx } from './sfx.js';
import { addToLayer, REFLECT } from './layers.js'; // projectiles show in the water (only near it)

const NORTH = new THREE.Vector3(0, 0, -1), BULLET_SPEED = 45, BULLET_LIFE = .5, GUN_COOLDOWN = .11; // range ~22.5 m
const GRENADE_RANGE = 21, GRENADE_SPEED = 25, GRENADE_LIFT = 10, GRAVITY = 28, GRENADE_COOLDOWN = .8, BLAST_RADIUS = 1.8; // range ~21 m; blast: hits targets whose own radius comes within 1.8 m
const GUN_SPREAD = .035; // max sideways drift of a tracer, per unit travelled (about 2°)
const CHASM_DRAG = 2.2; // 1/s: how fast a grenade past the rim loses its forward speed as it falls
const BULLET_DAMAGE = 1, GRENADE_DAMAGE = 4; // a turret (4 hp) takes 1 grenade or 4 bullets
const ROCKET_SPEED = GRENADE_SPEED * 2, ROCKET_RANGE = 21, ROCKET_HEIGHT = 1.4, ROCKET_SCALE = 1.32; // the player's rocket is drawn 32% larger (two rounds of 15%: 1.15 x 1.15)
const SHARD_SPEED = 30, SHARD_RANGE = 12, SHARD_BLAST = 1.78; // the split shots
const ASSIST_ANGLE = .4, ASSIST_MIN = 2; // aim assist: a shot lined up with an enemy to within about 23 degrees is bent onto it (and only if it would miss); not for targets nearer than this (m)
export const WEAPON_NAMES = ['GRENADE', 'ROCKET', 'ROCKET II', 'ROCKET III'];
const TALL = new Set(['B', 'K', 'L', 'X', 'F', 'n']); // stage 3's crate stacks, buildings and laser walls, stage 4's cliffs: shots don't go over them
const tallAt = (world, x, z) => { const t = world.tileAt(x, z); return TALL.has(t) && !(t === 'X' && world.shotOverRock); }; // (rock cells stop shots, except on the secret level, where the mountain's own shape does)
const STOPS_ROCKETS = new Set(['wall', 'barracks', 'tent', 'gate', 'turret', 'column', 'bust', 'statue', 'hut', 'warship', 'container', 'containerpile', 'rock']); // walls, buildings, standing stonework

const shardGeo = new THREE.SphereGeometry(.16, 10, 8), shardGlowGeo = new THREE.SphereGeometry(.34, 10, 8);
const shardMat = new THREE.MeshBasicMaterial({ color: 0xfff0b0 });
const shardGlowMat = new THREE.MeshBasicMaterial({ color: 0xff7020, transparent: true, opacity: .55, blending: THREE.AdditiveBlending, depthWrite: false });

// Tracer: a white-hot core inside a longer orange glow that trails behind (bullets travel -Z).
// The glow is a tapered streak (fat at the head, a thread at the tail) whose colour cools from yellow-white to deep red and fades to nothing; a small hot bead rides at the tip.
const TRAIL = 2.2;
const coreGeo = new THREE.CylinderGeometry(.012, .035, .7, 6, 1, true).rotateX(Math.PI / 2).translate(0, 0, .3);
const glowGeo = (() => {
  const g = new THREE.CylinderGeometry(.01, .09, TRAIL, 8, 4, true).rotateX(Math.PI / 2).translate(0, 0, TRAIL / 2 - .1), pos = g.attributes.position, col = new Float32Array(pos.count * 3), c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const t = THREE.MathUtils.clamp((pos.getZ(i) + .1) / TRAIL, 0, 1); // 0 at the head .. 1 at the tail end
    c.setRGB(1, 1 - .75 * t, .55 * (1 - t) ** 2).multiplyScalar((1 - t) ** 1.6);
    col.set([c.r, c.g, c.b], i * 3);
  }
  return g.setAttribute('color', new THREE.BufferAttribute(col, 3));
})();
const beadGeo = new THREE.SphereGeometry(.07, 8, 6), haloGeo = new THREE.SphereGeometry(.2, 8, 6);
const coreMat = new THREE.MeshBasicMaterial({ color: 0xfffbe0 });
const glowMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
const haloMat = new THREE.MeshBasicMaterial({ color: 0xff8a28, transparent: true, opacity: .35, blending: THREE.AdditiveBlending, depthWrite: false });
function makeTracer() {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(coreGeo, coreMat), new THREE.Mesh(glowGeo, glowMat), new THREE.Mesh(beadGeo, coreMat), new THREE.Mesh(haloGeo, haloMat));
  g.scale.z = .85 + Math.random() * .4; // the streaks vary a little in length
  return g;
}

// Is (x, z) inside target t's hit box (grown by pad)?
// Grenades, rockets and split shots find foot soldiers with a hit box 25% larger than bullets do.
const softPad = t => t.hw * .25;
const inTarget = (t, x, z, pad = 0) => t.hp > 0 && (t.within ? t.within(x, z, pad) : Math.abs(x - t.x) < t.hw + pad && Math.abs(z - t.z) < t.hd + pad); // (t.within: a target with its own shape, e.g. a submarine lying at an angle)
const secondClimb = (world, p) => !!world.slopedShots && p.z < -240; // the secret level's second ascent (the north, z < -240): its shots fly level off a plateau edge and past a cliff; the first climb and the rest keep the old ground-following
// A shot stops on a target it is in, unless the target can't be hurt right now and says shots pass it by (the warship's closed launchers: they must not shield the open one behind them).
const stops = (t, x, z, pad = 0) => inTarget(t, x, z, pad) && !(t.immune && t.passWhenImmune);

export class Weapons {
  constructor(scene, fx, debris) {
    this.scene = scene; this.fx = fx; this.debris = debris;
    this.bullets = []; this.grenades = []; this.rockets = []; this.shards = [];
    this.gunTimer = 0; this.grenadeTimer = 0;
    this.level = 0; // launcher upgrade level, 0..3
  }

  upgrade() { this.level = Math.min(3, this.level + 1); return this.level; }

  // Aim assist (touch screens above all): a shot leaving `from` along `dir` (unit, on the ground plane) that is more or less lined up with an enemy within `range` is turned to head
  // for the middle of it, so a roughly right aim still hits. Only a shot that would miss is touched, and only toward a target inside a narrow cone, the best lined up first.
  // `bullet`: for a machine-gun bullet (buildings and gates are ignored; not used now: the gun is not assisted). Returns { dir, dist } (dist: to the target it chose, or 0 if there is none).
  assist(world, from, dir, range, bullet = false, player = null) {
    let best = null, bestScore = 1e9;
    for (const t of world.targets) {
      if (t.hp <= 0 || t.immune || t.asleep || t.hw <= 0 || t.hd <= 0 || (bullet && t.bulletProof)) continue;
      const dx = t.x - from.x, dz = t.z - from.z, dist = Math.hypot(dx, dz), along = dx * dir.x + dz * dir.z;
      if (along < ASSIST_MIN || dist > range + Math.max(t.hw, t.hd)) continue;
      const side = dx * -dir.z + dz * dir.x;                       // how far off the line it lies (m)
      const ang = Math.abs(Math.atan2(side, along));
      if (ang > ASSIST_ANGLE) continue;
      if (Math.abs(side) < Math.min(t.hw, t.hd) * .8) return { dir, dist: Math.min(dist, range) }; // (already on line with something: leave the shot alone)
      const score = ang + dist * .004;
      if (score < bestScore) { bestScore = score; best = { dx, dz, dist }; }
    }
    if (!best) return { dir, dist: 0 };
    const turned = new THREE.Vector3(best.dx / best.dist, 0, best.dz / best.dist);
    if (player) player.alignTo(Math.atan2(-turned.x, -turned.z)); // the jeep follows the bent shot round
    return { dir: turned, dist: Math.min(best.dist, range) };
  }

  update(dt, input, player, world, onKill) {
    const targets = world.targets;
    this.gunTimer -= dt; this.grenadeTimer -= dt;
    if (player.enabled && !player.dead) {
      if (input.held('gun') && this.gunTimer <= 0) {
        this.gunTimer = GUN_COOLDOWN;
        const m = makeTracer(), muzzle = player.muzzlePosition();
        m.position.copy(muzzle);
        const vy = -(world.slopedShots ? muzzle.y - (world.shotHeightAt?.(muzzle.x, muzzle.z) ?? 0) : muzzle.y) / BULLET_LIFE; // drop so it meets the ground at the end of its range (on a slope: from the height above the ground, not above zero)
        const aim = NORTH; // (the machine gun always fires north: no aim assist)
        m.rotation.order = 'YXZ'; m.rotation.x = Math.atan2(vy, BULLET_SPEED); m.rotation.y = Math.atan2(-aim.x, -aim.z);
        const spread = (Math.random() - .5) * 2 * GUN_SPREAD; // visual only: the tracer drifts sideways by `spread` per unit of travel; hits are still tested on the straight path
        m.rotation.y -= Math.atan(spread);
        this.scene.add(addToLayer(m, REFLECT)); this.bullets.push({ m, vy, vx: aim.x * BULLET_SPEED, vz: aim.z * BULLET_SPEED, spread, z0: muzzle.z, dx: 0 });
        this.fx.muzzleFlash(muzzle); player.recoil(); sfx.gun();
      }
      if (input.held('grenade') && this.grenadeTimer <= 0 && this.level > 0) { // upgraded: fire a rocket
        this.grenadeTimer = GRENADE_COOLDOWN;
        const dir = this.assist(world, player.position, player.facing(), ROCKET_RANGE, false, player).dir, m = buildRocket(); // (aim assist)
        m.position.copy(player.position).addScaledVector(dir, 1.6).setY(player.position.y + ROCKET_HEIGHT); // above the ground the jeep is on (a raised terrace too)
        m.rotation.y = Math.atan2(-dir.x, -dir.z); m.scale.setScalar(ROCKET_SCALE);
        this.scene.add(addToLayer(m, REFLECT));
        this.rockets.push({ m, dir, travelled: 0, flame: m.getObjectByName('flame'), volley: this.volleySeq = (this.volleySeq ?? 0) + 1 }); // (volley: one rocket and its split shots share a number, see blast)
        this.fx.puff(m.position.clone().addScaledVector(dir, -.6), { color: 0xb0a898, size: .3, grow: 3, life: .8, opacity: .5 }); // launch smoke
        this.fx.cannonLight(player.position.clone().setY(m.position.y - .7), dir, true); // (the launch flash lights the jeep and the ground round it for a moment)
        sfx.rocket();
      } else if (input.held('grenade') && this.grenadeTimer <= 0) { // hold to keep throwing, one per cooldown
        this.grenadeTimer = GRENADE_COOLDOWN;
        const m = buildGrenade();
        m.traverse(o => { if (o.isMesh && !o.material.userData.lit) { o.material.userData.lit = true; o.material.color.multiplyScalar(1.5); o.material.emissive?.copy(o.material.color).multiplyScalar(.12); } }); // (a brighter grenade, as stage 6 had it, for contrast with a dark background: now on every stage)
        if (world.chasmHaze) m.traverse(o => { if (o.isMesh && !o.material.userData.hazed) { o.material.userData.hazed = true; hazeify(o.material, world.chasmHaze); o.material.needsUpdate = true; } }); // (stage 5: it dissolves into the chasm's haze as it falls)
        m.position.copy(player.position).setY(player.position.y + 1.6);
        const a = this.assist(world, player.position, player.facing(), GRENADE_RANGE, false, player); // (aim assist: only turned toward the target; the throw's strength and reach are unchanged)
        m.rotation.order = 'YXZ'; m.rotation.y = Math.atan2(-a.dir.x, -a.dir.z); // so it tumbles end over end along the throw direction
        this.scene.add(addToLayer(m, REFLECT));
        this.grenades.push({ m, vel: a.dir.clone().multiplyScalar(GRENADE_SPEED).setY(GRENADE_LIFT) });
        sfx.grenade();
      }
    }

    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i], p = b.m.position;
      p.x -= b.dx || 0; // (back to the true path for movement and collision; the visual drift is re-applied below)
      p.x += b.vx * dt; p.z += b.vz * dt; p.y += b.vy * dt;
      const above = followGround(b, p, world, dt);
      if (this.statues?.shootDown(p, world)) { this.scene.remove(b.m); this.bullets.splice(i, 1); continue; } // a statue's missile shot out of the air
      const hit = targets.find(t => stops(t, p.x, p.z, .15));
      const solid = !hit && world.obstacles.some(o => // walls, rocks... (targets' own boxes are handled by `hit`)
        o.alive && !o.isTarget && o.kind !== 'palm' && o.kind !== 'blocker' && o.kind !== 'foxhole' && o.kind !== 'barrier' && o.kind !== 'warship' && o.kind !== 'pierrail' && Math.abs(p.x - o.x) < o.hw && Math.abs(p.z - o.z) < o.hd); // (shots go over the harbour's barriers)
      if (hit) { this.fx.hitHard(p); if (!hit.bulletProof) { hit.hitAt = p; this.damage(hit, BULLET_DAMAGE * (hit.bulletK ?? 1), onKill); } } // buildings & gate: grenades only
      else if (solid || tallAt(world, p.x, p.z)) this.fx.hitHard(p);
      else if (world.tileAt(p.x, p.z) === 'T') this.fx.hitLeaves(p);
      else if (above <= 0 && world.chasmAt?.(p.x, p.z)) { /* over a chasm: nothing to strike, no mark: it is simply gone */ }
      else if (above <= 0) { // end of its range: strikes the ground, where the tracer has drifted to (the mark follows the visual path)
        if (b.spread) p.x += b.spread * (b.z0 - p.z);
        (world.tileAt(p.x, p.z) === '~' || world.swampAt?.(p.x, p.z)) ? this.fx.hitWater(p) : this.fx.hitSand(p);
      }
      else if (this.pickups?.poke(p)) this.fx.hitHard(p); // found a hidden star: the bullet stops there
      else { if (b.spread) { b.dx = b.spread * (b.z0 - p.z); p.x += b.dx; } continue; }
      this.scene.remove(b.m); this.bullets.splice(i, 1);
    }

    for (let i = this.grenades.length - 1; i >= 0; i--) {
      const g = this.grenades[i];
      const prev = g.m.position.clone();
      g.vel.y -= GRAVITY * dt; g.m.position.addScaledVector(g.vel, dt);
      g.m.rotation.x += dt * 10;
      const pos = g.m.position, hy = pos.y, g0 = g.g; let above = followGround(g, pos, world, dt);
      const hg = world.shotHeightAt?.(pos.x, pos.z) ?? 0, drop = secondClimb(world, pos) && g0 !== undefined && g.g < g0;
      if (drop) { pos.y = hy; g.g = g0; above = pos.y - hg; } // (the second ascent: past a plateau's edge it keeps its natural arc and falls on to the real ground below, further than on the flat; it does not sink with the ground)
      // soft targets (foot soldiers) are killed outright as the grenade passes and don't stop it (NES)
      // Soft targets (foot soldiers) are judged the way you see it: a grenade high in its arc appears
      // further up the screen than the spot beneath it, so also test where the camera's line of sight
      // through the grenade meets chest height. Checked at this frame's and the in-between position.
      const mid = prev.clone().lerp(pos, .5), probes = [pos, mid];
      if (this.camera) for (const q of [pos, mid]) {
        const c = this.camera.position, d = q.clone().sub(c);
        if (d.y < -1e-3) probes.push(c.clone().addScaledVector(d, (1 - c.y) / d.y)); // where the sight line hits y = 1 m
      }
      for (const t of targets) if (t.soft && probes.some(q => inTarget(t, q.x, q.z, softPad(t)))) this.damage(t, GRENADE_DAMAGE, onKill);
      const struck = targets.some(t => !t.soft && stops(t, pos.x, pos.z)) || !!this.statues?.shootDown(pos, world) // (statues' missiles too: NES)
        || pos.y < (world.buildingTop?.(pos.x, pos.z) ?? 0) // a building (stage 6): it bursts on the wall
        || world.obstacles.some(o => o.alive && o.top > 0 && pos.y < o.top && Math.abs(pos.x - o.x) < o.hw && Math.abs(pos.z - o.z) < o.hd) // a pile of containers more than one high (stage 6): it bursts on it; one container is let through
        || (world.tileAt(pos.x, pos.z) === 'X' && (!world.shotOverRock || world.heightAt(pos.x, pos.z) > pos.y - .2)) // a cliff: it bursts on the rock face (stage 4; the arc is only a few metres high, the cliffs 11)
        || !!world.facesAhead?.(pos.x, pos.z, g.vel.x, g.vel.z) // a mountain face in its way (the secret level): it bursts on it; ground that drops away beside the road is not in its way
        || world.obstacles.some(o => o.alive && o.kind === 'warship' && pos.y < 7 && Math.abs(pos.x - o.x) < o.hw && Math.abs(pos.z - o.z) < o.hd); // the warship's hull: it bursts on it
      if (above > 0 && !struck) continue;
      if (!struck && world.chasmAt?.(pos.x, pos.z)) { // lost in a chasm: it falls on, forward speed bleeding off, small and smaller, and is gone; it never goes off
        g.vel.x *= Math.exp(-CHASM_DRAG * dt); g.vel.z *= Math.exp(-CHASM_DRAG * dt);
        g.m.scale.setScalar(Math.max(.05, 1 + pos.y / 10));
        if (pos.y < -9) { this.scene.remove(g.m); this.grenades.splice(i, 1); }
        continue;
      }
      this.blast(pos.clone().setY(drop ? Math.max(hg, pos.y) : Math.max(g.g, pos.y)), BLAST_RADIUS, .8, world, onKill);
      this.scene.remove(g.m); this.grenades.splice(i, 1);
    }

    // rockets: straight and low; soldiers die as it passes; walls, buildings and jungle stop it
    for (let i = this.rockets.length - 1; i >= 0; i--) {
      const r = this.rockets[i], p = r.m.position, step = ROCKET_SPEED * dt, prev = p.clone();
      p.addScaledVector(r.dir, step); r.travelled += step;
      { const hy = p.y, g0 = r.g; followGround(r, p, world, dt); if (secondClimb(world, p) && g0 !== undefined && r.g < g0) { p.y = hy; r.g = g0; } } // over the terraces: it climbs with them but never sinks when the ground falls away (off a plateau's edge it flies straight on)
      r.flame.scale.setScalar(.8 + Math.random() * .5);
      this.smokeTrail(r, prev, p);
      const mid = prev.clone().lerp(p, .5);
      for (const t of targets) if (t.soft && (inTarget(t, p.x, p.z, softPad(t)) || inTarget(t, mid.x, mid.z, softPad(t)))) this.damage(t, GRENADE_DAMAGE, onKill);
      const struck = !!this.pickups?.poke(p) || targets.some(t => !t.soft && stops(t, p.x, p.z)) || !!this.statues?.shootDown(p, world) // (statues' missiles too: NES)
        || world.obstacles.some(o => o.alive && STOPS_ROCKETS.has(o.kind) && Math.abs(p.x - o.x) < o.hw && Math.abs(p.z - o.z) < o.hd) // incl. gutted buildings
        || world.tileAt(p.x, p.z) === 'T' || tallAt(world, p.x, p.z) || !!world.facesAhead?.(p.x, p.z, r.dir.x, r.dir.z); // jungle / bushes, like bullets; crates and buildings; a mountain face in its way (the secret level)
      if (!struck && r.travelled < ROCKET_RANGE) continue;
      const at = p.clone().setY(struck ? p.y : r.g);
      this.blast(at, BLAST_RADIUS, .8, world, onKill, false, r.volley);
      if (this.level >= 2) this.split(at, r.dir, this.level, r.g ?? 0, r.volley, targets, onKill);
      this.scene.remove(r.m); this.rockets.splice(i, 1);
    }

    // split shots: fly through all terrain; soldiers die as they pass, other targets set them off
    for (let i = this.shards.length - 1; i >= 0; i--) {
      const sh = this.shards[i], p = sh.m.position, step = SHARD_SPEED * dt;
      p.addScaledVector(sh.dir, step); sh.travelled += step;
      if (!secondClimb(world, p)) followGround(sh, p, world, dt); else if (sh.g === undefined) sh.g = p.y - 1.1; // (split shots fly dead level at their launch height: no climbing a cliff face on a slant, no sinking off an edge)
      if (Math.random() < .6) this.fx.puff(p.clone(), { color: 0xff8a30, size: .12, grow: 1.5, life: .25, opacity: .7, additive: true });
      for (const t of targets) if (t.soft && inTarget(t, p.x, p.z, softPad(t))) this.damage(t, GRENADE_DAMAGE, onKill);
      const struck = targets.some(t => !t.soft && !t.shardProof && !sh.ignore?.has(t) && stops(t, p.x, p.z)) || !!this.statues?.shootDown(p, world); // (they pass through tanks, and through the target they started inside; statues' missiles stop them)
      if (!struck && sh.travelled < SHARD_RANGE) continue;
      this.blast(p.clone().setY(sh.g), SHARD_BLAST, .5, world, onKill, true, sh.volley);
      this.scene.remove(sh.m); this.shards.splice(i, 1);
    }
  }

  // Rocket exhaust trail, laid every ~0.35 m along the path covered this frame so it's continuous:
  // a hot glow right behind the nozzle, then white-grey smoke that starts dense and billows out,
  // rising and drifting with the breeze, with the odd darker puff and a spark now and then.
  smokeTrail(r, from, to) {
    const tail = d => d.clone().addScaledVector(r.dir, -.75), seg = to.clone().sub(from), len = seg.length();
    const j = () => (Math.random() - .5) * .25;
    let k = r.trailLeft ?? 0;
    for (; k < len; k += .35) {
      const at = tail(from.clone().addScaledVector(seg, k / len)).add(new THREE.Vector3(j(), j(), j()));
      const dark = Math.random() < .2, shade = dark ? 0x7a746c : 0xd8d4cc;
      this.fx.puff(at, { color: shade, size: .12 + Math.random() * .06, grow: 4 + Math.random() * 2, life: 1.2 + Math.random() * .8,
        opacity: dark ? .4 : .5, vel: new THREE.Vector3(.35 + j(), .5 + Math.random() * .4, -.25 + j()), }); // rises, drifts with the breeze
    }
    r.trailLeft = k - len; // carry the spacing over to the next frame
    this.fx.puff(tail(to), { color: 0xffb050, size: .2, grow: 1.2, life: .09, opacity: .9, additive: true }); // hot glow
    if (Math.random() < .25) this.fx.puff(tail(to), { color: 0xffd080, size: .04, grow: 0, life: .35, opacity: 1, additive: true, gravity: 8,
      vel: r.dir.clone().multiplyScalar(-6).add(new THREE.Vector3(j() * 8, 1 + Math.random() * 2, j() * 8)) }); // spark
  }

  // Detonation at `at`: fireball (or a splash on water) and damage to everything within `radius`.
  blast(at, radius, size, world, onKill, shard = false, volley) { // shard: a split shot's, which tanks shrug off; volley: which rocket (and its split shots) it comes from: a target marked oncePerVolley is hurt by one blast of a volley, not by each of them
    this.pickups?.poke(at, radius);
    if (world.tileAt(at.x, at.z) === '~' || world.swampAt?.(at.x, at.z)) { // on the water (or the swamp): smaller fireball, big splash and ripple
      const w = at.clone().setY(0);
      this.fx.explosion(w, size * .7); this.fx.waterBlast(w, size / .8); world.ripple(w, size / .8);
    } else this.fx.explosion(at, size);
    while (this.statues?.shootDown(at, world, radius)) { /* every statue missile caught in the blast goes up too */ }
    // (a target with oncePerVolley: true takes one blast of a rocket's volley in all; oncePerVolley 2, the gate's cannons: the rocket's own blast once and its split shots once, so 8 in all)
    world.targets.forEach(t => { if (t.hp > 0 && !(shard && t.shardProof) && (t.blastHit ? t.blastHit(at, radius) : Math.hypot(t.x - at.x, t.z - at.z) < radius + t.r || (t.boom && Math.hypot(Math.max(Math.abs(at.x - t.x) - t.hw, 0), Math.max(Math.abs(at.z - t.z) - t.hd, 0)) < radius))) { if (volley !== undefined && t.oncePerVolley && !t.immune) { const vk = t.oncePerVolley === 2 ? (shard ? 'volleyShard' : 'volleyMain') : 'volleyHit'; if (t[vk] === volley) return; t[vk] = volley; } t.hitAt = at; this.damage(t, GRENADE_DAMAGE * (shard ? t.shardK ?? 1 : 1), onKill); } }); // (hitAt: where the blast was, so the wreck's debris can be thrown away from it) (blastHit: a long thin target, e.g. the submarine, judges the blast by its own shape)
  }

  // Rocket split (levels 2-3): shots fly off sideways (level 2) or in all four directions (level 3).
  split(at, dir, level, ground = 0, volley, targets = [], onKill = () => {}) { // ground: the height of the (drawn) ground there; targets: the shots do not go off on one they start inside (a rocket bursts on the edge of a big target, e.g. the gate's cannons, and its split shots would otherwise burst on the spot, unseen)
    // a big target the rocket burst on (the gate's cannons): the split shots start inside it and fly on, so their one blow on it (a tick of 4 a volley) is dealt here, at once
    for (const t of targets) if (t.oncePerVolley === 2 && volley !== undefined && t.hp > 0 && !t.soft && stops(t, at.x, at.z) && t.volleyShard !== volley) { t.volleyShard = volley; this.damage(t, GRENADE_DAMAGE * (t.shardK ?? 1), onKill); }
    const side = new THREE.Vector3(-dir.z, 0, dir.x);
    const dirs = level >= 3 ? [dir, dir.clone().negate(), side, side.clone().negate()] : [side, side.clone().negate()];
    for (const d of dirs) {
      const m = new THREE.Group(); m.add(new THREE.Mesh(shardGeo, shardMat), new THREE.Mesh(shardGlowGeo, shardGlowMat));
      m.position.copy(at).setY(ground + 1.1); this.scene.add(addToLayer(m, REFLECT));
      this.shards.push({ m, dir: d.clone().normalize(), travelled: 0, volley, ignore: new Set(targets.filter(t => !t.soft && stops(t, at.x, at.z))) });
    }
  }

  // Saved games: every shot in flight (bullets, grenades, rockets, split shots) and the cooldowns.
  snapshot() {
    const r = v => Math.round(v * 1000) / 1000, P = o => [r(o.position.x), r(o.position.y), r(o.position.z)];
    return {
      gun: r(this.gunTimer), nade: r(this.grenadeTimer),
      bullets: this.bullets.map(b => [...P(b.m), r(b.vy), r(b.vx), r(b.vz)]),
      grenades: this.grenades.map(g => [...P(g.m), r(g.vel.x), r(g.vel.y), r(g.vel.z), r(g.m.rotation.y), r(g.m.rotation.x)]),
      rockets: this.rockets.map(k => [...P(k.m), r(k.dir.x), r(k.dir.z), r(k.travelled)]),
      shards: this.shards.map(k => [...P(k.m), r(k.dir.x), r(k.dir.z), r(k.travelled)]),
    };
  }
  restore(d) {
    if (!d) return;
    this.gunTimer = d.gun; this.grenadeTimer = d.nade;
    for (const [x, y, z, vy, vx = 0, vz = -BULLET_SPEED] of d.bullets) {
      const m = makeTracer(); m.position.set(x, y, z); m.rotation.order = 'YXZ'; m.rotation.x = Math.atan2(vy, BULLET_SPEED); m.rotation.y = Math.atan2(-vx, -vz);
      this.scene.add(addToLayer(m, REFLECT)); this.bullets.push({ m, vy, vx, vz });
    }
    for (const [x, y, z, vx, vy, vz, ry, rx] of d.grenades) {
      const m = buildGrenade(); m.position.set(x, y, z); m.rotation.order = 'YXZ'; m.rotation.y = ry; m.rotation.x = rx;
      this.scene.add(addToLayer(m, REFLECT)); this.grenades.push({ m, vel: new THREE.Vector3(vx, vy, vz) });
    }
    for (const [x, y, z, dx, dz, travelled] of d.rockets) {
      const m = buildRocket(), dir = new THREE.Vector3(dx, 0, dz);
      m.position.set(x, y, z); m.rotation.y = Math.atan2(-dx, -dz); m.scale.setScalar(ROCKET_SCALE);
      this.scene.add(addToLayer(m, REFLECT)); this.rockets.push({ m, dir, travelled, flame: m.getObjectByName('flame') });
    }
    for (const [x, y, z, dx, dz, travelled] of d.shards) {
      const m = new THREE.Group(); m.add(new THREE.Mesh(shardGeo, shardMat), new THREE.Mesh(shardGlowGeo, shardGlowMat));
      m.position.set(x, y, z); this.scene.add(addToLayer(m, REFLECT));
      this.shards.push({ m, dir: new THREE.Vector3(dx, 0, dz), travelled });
    }
  }

  damage(t, amount, onKill) {
    if (t.immune) return; // (e.g. the boss tanks, until the arena closes)
    t.hp -= amount;
    if (t.hp > 0) { t.onHurt?.(); return; } // (e.g. tanks show battle damage)
    if (t.die) { t.die(); onKill(t); return; } // e.g. soldiers: their own death, no big explosion
    this.fx.explosion(new THREE.Vector3(t.x, .6, t.z), 1.1, !!t.boom); // (t.boom: a building: the heavier explosion sound)
    if (t.obstacle && !t.solidWreck) t.obstacle.alive = false; // most wrecks can be driven over; gutted buildings still block
    else if (t.obstacle) t.obstacle.isTarget = false; // ...and stop bullets, now that there is no target there to catch them
    t.wreck(this.debris, this.fx, t.hitAt);
    if (t.reveals) this.pickups?.poke(new THREE.Vector3(t.x, 0, t.z)); // (the star hidden in it comes out)
    onKill(t);
  }
}
