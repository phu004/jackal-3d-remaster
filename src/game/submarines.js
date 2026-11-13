// Missile submarines (stage 3). One lies submerged in the water until the jeep comes near, then it hunts: it
// shuttles back and forth along its lane (it never turns: it only goes up and down the screen, where there is water) under
// water, ripples on the surface showing where it is going, until it is within firing range and on screen, then surfaces, opens its hatch (the warning, as the pool statues' mouths do) and launches a missile
// like the boss statues': it homes on where the jeep was half a second ago and flies as far as theirs (see Statues).
// Once the hatch has closed it reloads and fires again. If the jeep gets too close it dives again (never in the
// middle of opening the hatch: that launch always goes) and swims away along its lane, surfacing again once the jeep
// is back in the firing band. (With no room left to get away it surfaces and fires anyway rather than hide for ever.) Under water it takes no damage; surfaced, it is as tough as HP says.
import * as THREE from 'three';
import { buildSubmarine, poseSubmarine, SUB_VARIANTS } from '../assets/submarine.js';
import { addToLayer, REFLECT, UNDERWATER } from './layers.js';
import { dropTinyShadows, mergedModel } from './optimize.js';
import { BOSS_MISSILE_FLIGHT } from './statues.js';
import { shardGeometry } from './debris.js';
import { sfx } from './sfx.js';

const AMBUSH_RISE = 3.2, RISE_UNDER = 4.6, CRACK_V = 1.6, CRACK = RISE_UNDER + CRACK_V, DEEP = 3.2 + 5 / 1.53, NEAR2 = 30, AMBUSH_LIFT = 1.2, WRECK_LEVEL = .72; // CRACK: s the ice takes to break up over an ambush sub, once the jeep is near; AMBUSH_LIFT: how far up under the ice it lies (m, before scale); WRECK_LEVEL: how far up it floats once wrecked (0 under .. 1 surfaced)
let iceMats = null; // the broken ice: clear, glossy, blue-green plates with bright edges (not matt white: that looks like polystyrene)
const iceLook = () => iceMats ??= { plate: new THREE.MeshPhysicalMaterial({ color: 0xe2f1f5, roughness: .1, metalness: 0, clearcoat: 1, clearcoatRoughness: .05, emissive: 0x2a3a40, emissiveIntensity: .35, side: THREE.DoubleSide, flatShading: true }), edge: new THREE.LineBasicMaterial({ color: 0xeafcff, transparent: true, opacity: .9 }) };
const iceShard = (w, d, thick = .2) => new THREE.Mesh(shardGeometry(w, thick, d), iceLook().plate); // (no separate edge lines: the settled pieces are merged into one mesh, which would drop them, and the plates would turn colourless all at once)
const smoothT = x => { x = Math.min(1, Math.max(0, x)); return x * x * (3 - 2 * x); };
const SALVO = 3, VOLLEY_GAP = 1.5, AMBUSH_FIRE = 62; // an ambush sub: SALVO missiles each time its hatch opens, VOLLEY_GAP s apart (the next one rises from the silo with the cover still open), and it fires at the jeep from as far as AMBUSH_FIRE m, off screen too
const AMBUSH_RANGE = 30; // (the climb under the ice begins here; the cracking and the break wait for the jeep to come within NEAR2)     // m: an ambush sub (one under the frozen sea, see ambush below) breaks the ice with the jeep this close, once the power station is down
const ALERT = 65;            // m: the jeep this close wakes it
const GIVE_UP = 90;          // m: ... and it goes back to sleep if the jeep gets further than this
const FIRE_RANGE = 34;       // m: it surfaces and fires with the jeep this near (and on screen)
const TOO_CLOSE = 14;        // m: nearer than this, it dives (unless its hatch is opening)
const RESURFACE = 19;        // m: ... and stays under until the jeep is at least this far
const SPEED = 4.5, FLEE_SPEED = 6.5;  // m/s under water (it swims faster backing off)
const CORNERED = 1.5, RIPPLE_EVERY = .3; // s boxed in at the end of its lane before it fights from where it is; s between the ripples it leaves
const RISE_TIME = 1.6, DIVE_TIME = .8, OPEN_TIME = 1.1, CLOSE_TIME = .6; // s
const FIRST = [.5, 1], RELOAD = [3.2, 4.4];   // s: after surfacing, and between launches
const HURT_ABOVE = .7;       // surfaced this much (0..1) and it can be hurt
const HP = 12, SCORE = 800; // three grenades or twelve bullets
const SINK_TIME = 4, BUBBLE_AFTER = 2.5; // s going down, and s more of bubbles once it has gone
const markPlane = new THREE.PlaneGeometry(1, 1);
let markTex = null;
// Three damage-mark textures (drawn once): a soot cloud ringed with blistered paint, bare metal showing through torn paint with scratches, and a scorched streak.
function markTextures() {
  return markTex ??= [0, 1, 2].map(v => {
    const S = 128, c = document.createElement('canvas'); c.width = c.height = S; const x = c.getContext('2d'), rnd = (a, b) => a + Math.random() * (b - a);
    const blob = (cx, cy, r, col, a) => { const g = x.createRadialGradient(cx, cy, 0, cx, cy, r); g.addColorStop(0, `rgba(${col},${a})`); g.addColorStop(1, `rgba(${col},0)`); x.fillStyle = g; x.fillRect(cx - r, cy - r, r * 2, r * 2); };
    if (v === 0) { for (let i = 0; i < 26; i++) { const a = rnd(0, 6.3), d = rnd(0, 34); blob(64 + Math.cos(a) * d, 64 + Math.sin(a) * d, rnd(10, 26), '12,10,8', rnd(.12, .3)); } for (let i = 0; i < 9; i++) { const a = rnd(0, 6.3), d = rnd(18, 36); blob(64 + Math.cos(a) * d, 64 + Math.sin(a) * d, rnd(3, 7), '70,62,50', .5); } }
    if (v === 1) { for (let i = 0; i < 7; i++) { const cx = rnd(30, 98), cy = rnd(30, 98), r = rnd(8, 20); blob(cx, cy, r, '150,148,140', .9); blob(cx + rnd(-3, 3), cy + rnd(-3, 3), r * .6, '95,92,86', .6); }
      x.strokeStyle = 'rgba(190,188,178,.85)'; x.lineWidth = 1.2; for (let i = 0; i < 9; i++) { const cx = rnd(20, 108), cy = rnd(20, 108), a = rnd(0, 6.3), l = rnd(8, 26); x.beginPath(); x.moveTo(cx, cy); x.lineTo(cx + Math.cos(a) * l, cy + Math.sin(a) * l); x.stroke(); }
      for (let i = 0; i < 8; i++) blob(rnd(14, 114), rnd(14, 114), rnd(8, 16), '10,8,6', .35); }
    if (v === 2) { for (let i = 0; i < 18; i++) blob(rnd(30, 98), 18 + i * 5, rnd(8, 18), '14,10,8', rnd(.2, .4)); blob(64, 64, 22, '60,36,16', .5); for (let i = 0; i < 5; i++) blob(rnd(30, 98), rnd(30, 98), rnd(4, 9), '200,120,40', .35); }
    const t = new THREE.CanvasTexture(c); return t;
  });
}
const SCALE = 1.265, SLIM = .82; // SLIM: the hull drawn this much narrower across than along
const HIT_LEN = 7.6 * .92 * SCALE, HIT_WID = 1.27 * 1.15 * 1.1 * .88 * SCALE; // half length / half width of its hit box: the slim hull itself (bullets and grenades add their own small pad) // the model is drawn this much over its modelled size
const FOOTPRINT = [[0, 1.07], [3.5, 1.05], [-3.5, 1.05], [6.5, .66], [-6.5, .66], [7.6, .28], [-7.6, .28]].map(([l, w]) => [l * SCALE, w * 1.15 * 1.1 * SCALE]); // [along, half width] m: the hull's outline, for keeping all of it over water (it lies along a quay rather than across it)
const AIM_DELAY = .5;
const CLIMB = 7; // m: the missile goes straight up out of the silo this far before it turns toward the jeep (a vertical launch system)
const rand = ([a, b]) => a + Math.random() * (b - a);
const smooth = t => t * t * (3 - 2 * t);
const _p = new THREE.Vector3(), _m = new THREE.Vector3();

export class Submarines {
  constructor(scene, fx, debris, statues) { this.scene = scene; this.fx = fx; this.debris = debris; this.statues = statues; this.subs = []; this.time = 0; }

  setup(world, specs = []) {
    this.world = world;
    for (const { x, z, yaw = Math.PI, ambush = false } of specs) { // ambush: it lies under the ice, and when the jeep comes near (after the power station has gone down) it breaks up through it, and from then on never moves again: it fires its missiles from where it is, and if it is destroyed its burning wreck stays as a permanent obstacle. yaw: which way it lies (bow -Z; PI = bow toward the south)
      const vr = this.subs.length % SUB_VARIANTS, obj = mergedModel('submarine' + vr, () => buildSubmarine({ variant: vr })); obj.position.set(x, 0, z); obj.rotation.y = yaw; const K = ambush ? 1.21 : 1; obj.scale.set(SCALE * SLIM * K, SCALE * K, SCALE * K); dropTinyShadows(obj); // (K: an ambush sub is drawn as large as the ones that cruise under the ice)
      obj.getObjectByName('foam').visible = false; // (no ring of white dots round the hull)
      if (!ambush) for (let d = 0; d < 12; d += .1) { // (if it was placed over a quay or past the end of the water: it lies just clear of it, along its lane first, else sideways)
        const spot = [[x, z], [x, z + d], [x, z - d], [x - d, z], [x + d, z]].find(([sx, sz]) => this.clear(sx, sz, yaw));
        if (spot) { obj.position.x = spot[0]; obj.position.z = spot[1]; break; }
      }
      this.scene.add(addToLayer(obj, REFLECT, UNDERWATER));
      const sub = { obj, hull: obj.getObjectByName('hull'), muzzle: obj.getObjectByName('muzzle0'), missile: obj.getObjectByName('missile0'),
        ambush, k: K, state: 'idle', surface: 0, hatch: 0, reload: 0, speed: 0, rippleIn: 0, phase: Math.random() * 6, sinkT: 0 };
      sub.target = { object: obj, x, z, hw: -1, hd: -1, r: -50, hp: HP, score: SCORE, immune: true, wreck: () => this.sink(sub), onHurt: () => { if (!sub.scuffed && sub.target.hp <= HP * 2 / 3) { sub.scuffed = true; this.scuff(sub); } if (!sub.hurt && sub.target.hp <= HP / 2) { sub.hurt = true; this.blow(sub); } },
        // a blast catches it if it lands within its radius of the hull's line (not of its middle: it is 14 m long and 2 m wide)
        blastHit: (at, radius) => {
          if (sub.target.immune) return false;
          const a = sub.obj.rotation.y, p = sub.obj.position, fx = -Math.sin(a), fz = -Math.cos(a);
          const K = sub.k, along = Math.max(-(HIT_LEN - HIT_WID) * K, Math.min((HIT_LEN - HIT_WID) * K, (at.x - p.x) * fx + (at.z - p.z) * fz));
          return Math.hypot(at.x - (p.x + fx * along), at.z - (p.z + fz * along)) < radius + HIT_WID * K;
        } };
      sub.target.within = (x, z, pad) => { if (sub.target.hw <= 0) return false; const a = sub.obj.rotation.y, p = sub.obj.position, dx = x - p.x, dz = z - p.z; return Math.abs(-dx * Math.sin(a) - dz * Math.cos(a)) < HIT_LEN * sub.k + pad && Math.abs(dx * Math.cos(a) - dz * Math.sin(a)) < HIT_WID * sub.k + pad; }; // (the long thin box along the way it lies, not the rectangle round it)
      if (ambush && !this.bm) this.makeBubbles();
      if (ambush) { sub.dim = []; obj.traverse(m => { if (m.isMesh && m.material && !Array.isArray(m.material)) { m.material = m.material.clone(); sub.dim.push({ m: m.material, c: m.material.color.clone(), e: m.material.envMapIntensity ?? 1, r: m.material.roughness ?? .5 }); } }); } // (its own materials: dimmed while it is under the ice, as the patrol subs' darker ones are, see dimUnder)
      if (ambush) { poseSubmarine(obj, 0, 0); obj.updateMatrixWorld(true); const top = new THREE.Box3().setFromObject(obj).max.y; sub.lift = Math.max(-1.5, Math.min(1.2, (-.8 - top) / (SCALE * K))); } // (it lies so its highest point, the sail, is just under the ice)
      world.targets.push(sub.target);
      world.turrets.push({ top: new THREE.Group(), base: obj, target: sub.target, range: 0 }); // (counts toward the kill rate; it fires its own way, not as a turret: a stand-in `top`, as the world swings a turret's top round to face the jeep)
      this.subs.push(sub);
    }
  }

  // Is the hull wholly over water at (x, z), heading a?
  clear(x, z, a) {
    const fx = -Math.sin(a), fz = -Math.cos(a), sx = -fz, sz = fx;
    for (const [l, hw] of FOOTPRINT) for (const w of [-hw, hw])
      if (!this.world.waterAt(x + fx * l + sx * w, z + fz * l + sz * w)) return false;
    return true;
  }

  // Swim along its lane (the way it lies) toward (dir = 1) or away from (-1) the jeep. Returns false if the lane is closed that way.
  swim(s, dt, player, dir) {
    const o = s.obj, p = o.position, yaw = o.rotation.y, fz = -Math.cos(yaw), dz = player.position.z - p.z;
    let go = Math.sign(dz) * Math.sign(fz) * dir; // +1: along its heading, -1: astern
    if (!go) go = s.lastGo ?? 1;
    if (Math.abs(dz) < 1.5 && dir > 0) go = 0; // level with the jeep: no nearer by going on
    if (dir < 0 && !(this.clear(p.x, p.z + go * fz * 10, yaw))) { // no room that way: the other
      if (this.clear(p.x, p.z - go * fz * 10, yaw)) go = -go;
    }
    s.lastGo = go || s.lastGo;
    const want = go * (dir < 0 ? FLEE_SPEED : SPEED);
    s.speed += (want - s.speed) * Math.min(1, dt * 2);
    let free = true;
    if (Math.abs(s.speed) > .05) {
      const nz = p.z + Math.sign(s.speed) * fz * Math.abs(s.speed) * dt;
      if (this.clear(p.x, nz, yaw)) {
        p.z = nz;
        if ((s.rippleIn -= dt) <= 0) { // ripples at both ends of the hull: you can see where it is
          s.rippleIn = RIPPLE_EVERY;
          for (const e of [-7 * SCALE, 7 * SCALE]) { const at = _m.set(p.x, 0, p.z + e * fz); this.world.ripple?.(at, .55); this.fx.wake(at.clone(), .5, 1.6); }
        }
      } else { s.speed = 0; free = false; }
    }
    return free;
  }

  update(dt, world, player, onHit, cam) {
    this.time += dt;
    const canShoot = player.enabled && !player.dead;
    for (const s of this.subs) {
      const o = s.obj, p = o.position;
      if (s.state === 'dead') continue;
      if (s.ambush && s.state === 'idle') { const wait = !world.seaFrozen || !!world.powerPlantAlive?.(); o.visible = !wait; if (wait) continue; } // (an ambush sub is not there at all until the power station is down)
      if (s.state === 'sink') { this.sinking(s, dt); continue; }
      if (s.state === 'wreck') { this.wreckStep(s, dt); continue; }
      if (s.target.hp <= HP / 2) this.smoulder(s, dt);
      const dist = Math.hypot(player.position.x - p.x, player.position.z - p.z);
      switch (s.state) {
        case 'idle': // asleep, submerged
          if (s.ambush) { if (canShoot && dist < AMBUSH_RANGE && world.seaFrozen && !world.powerPlantAlive?.()) { this.startCrack(s); } break; } // (an ambush sub: it waits under the ice, in plain sight through it, until the plant has gone down and the jeep is near)
          if (canShoot && dist < ALERT) { s.state = 'hunt'; world.ripple?.(p, 1.2); this.fx.wake(p.clone(), 1.2, 2); s.cornered = false; } // alerted: a swirl on the surface
          break;
        case 'crack': // the ice over it is breaking up (the shader shows it); then it gives way and the boat rises
          if (s.crackT < RISE_UNDER || dist <= NEAR2) s.crackT += dt; // (stage 1 goes on at once; stage 2 waits for the jeep to come near)
          if (s.crackT >= RISE_UNDER && dist <= NEAR2 && (s.kickIn = (s.kickIn ?? 0) - dt) <= 0) { s.kickIn = .35 + Math.random() * .35; cam?.kick?.(.12 + .3 * (s.crackT - RISE_UNDER) / CRACK_V); this.chip(s); } // (stage 2: each new fracture shudders the ice, and splinters jump)
          if (s.crackT >= CRACK) { this.breakIce(s, cam); s.state = 'rise'; if (canShoot && !player.invulnerable) { const yw = o.rotation.y, dx = player.position.x - p.x, dz = player.position.z - p.z; if (Math.abs(-dx * Math.sin(yw) - dz * Math.cos(yw)) < HIT_LEN * s.k * 1.1 + 1 && Math.abs(dx * Math.cos(yw) - dz * Math.sin(yw)) < 2.4 + 1) onHit(); } /* (the jeep on top of it when the ice goes: blown up with it) */ }
          break;
        case 'hunt': // under water: closing in, or backing off if the jeep is too near
          if (!canShoot || dist > GIVE_UP) { s.state = 'idle'; s.speed = 0; break; }
          if (dist < RESURFACE && !s.cornered) {
            if (this.swim(s, dt, player, -1)) s.boxed = 0; else if ((s.boxed = (s.boxed ?? 0) + dt) > CORNERED) s.cornered = true; // nowhere left to go: it will fight from here
          } else if (dist > FIRE_RANGE * .85) { this.swim(s, dt, player, 1); s.boxed = 0; }
          else s.speed *= .9;
          if (dist > RESURFACE + 4) s.cornered = false;
          if (dist <= FIRE_RANGE && (dist >= RESURFACE || s.cornered)) { s.state = 'rise'; s.speed = 0; }
          break;
        case 'rise':
          s.surface = Math.min(1, s.surface + dt / (s.ambush ? AMBUSH_RISE : RISE_TIME));
          if (dist < TOO_CLOSE && !s.cornered) s.state = 'dive'; // (the hatch is still shut)
          else if (s.ambush && canShoot && s.surface >= .72) { s.state = 'open'; s.hatch = 0; s.shots = 0; } // (an ambush sub opens its hatch as it breaks the surface, and fires at once)
          else if (s.surface >= 1) { s.state = 'ready'; s.reload = s.ambush ? .1 : rand(FIRST); }
          break;
        case 'ready': // surfaced, hatch shut, reloading
          if (!s.ambush && (!canShoot || (dist < TOO_CLOSE && !s.cornered) || dist > FIRE_RANGE + 8)) { s.state = 'dive'; break; }
          if (canShoot && dist <= (s.ambush ? AMBUSH_FIRE : FIRE_RANGE + 2) && (s.reload -= dt) <= 0) { s.state = 'open'; s.hatch = 0; s.shots = 0; }
          break;
        case 'open': // the cover swings up, the missile rises (the warning): it launches whatever the jeep does now
          s.hatch = Math.min(1, s.hatch + dt / OPEN_TIME);
          if (s.hatch >= 1) this.fireNext(s, canShoot, world);
          break;
        case 'volley': // the cover stays open: the next missile rises into the silo, and when it is up it goes
          s.hatch = Math.min(1, s.hatch + dt * .55 / VOLLEY_GAP);
          if (s.hatch >= 1) this.fireNext(s, canShoot, world);
          break;
        case 'close':
          s.hatch = Math.max(0, s.hatch - dt / CLOSE_TIME);
          if (s.hatch <= 0) { s.missile.visible = true; s.state = 'ready'; s.reload = rand(RELOAD); }
          break;
        case 'dive':
          s.surface = Math.max(0, s.surface - dt / DIVE_TIME);
          this.bubbles(s, dt, 1);
          if (s.surface <= 0) s.state = canShoot && dist < GIVE_UP ? 'hunt' : 'idle';
          break;
      }
      if (s.ambush && s.surface < 1 && s.state !== 'idle' && s.state !== 'crack' && s.state !== 'rise') s.surface = Math.min(1, s.surface + dt / AMBUSH_RISE); // (it goes on rising while its hatch opens)
      poseSubmarine(o, s.surface, s.hatch);
      s.hull.rotation.z = 0;
      if (s.ambush && s.state === 'crack') s.hull.rotation.x = .17 * Math.sin(Math.PI * smoothT(s.crackT / RISE_UNDER));
      if (s.ambush && s.state === 'crack' && s.crackT > RISE_UNDER) { const sh = smoothT((s.crackT - RISE_UNDER) / CRACK_V); s.hull.rotation.z = Math.sin(this.time * 47) * .035 * sh; s.hull.rotation.x += Math.sin(this.time * 61) * .02 * sh; } // (stage 2: the hull strains against the ice, a shudder that grows) // (the bow lifts as it climbs, and it levels off just under the ice)
      if (s.ambush) this.dimUnder(s);
      if (s.ambush && (s.state === 'crack' || (s.state === 'rise' && s.surface < .85))) { const rate = s.state === 'rise' ? 14 : s.crackT < RISE_UNDER ? 6 + 12 * smoothT(s.crackT / RISE_UNDER) : 36; s.bubAcc = (s.bubAcc ?? 0) + rate * dt; const n = Math.floor(s.bubAcc); s.bubAcc -= n; if (n) this.hullBubbles(s, n); } // (the climb stirs up bubbles: a trickle, then a stream, then a rush as the ice breaks)
      if (s.ambush) { const up = s.state === 'crack' ? smoothT(s.crackT / RISE_UNDER) : s.state === 'idle' ? 0 : 1, heave = s.state === 'crack' ? smoothT((s.crackT - RISE_UNDER) / CRACK_V) * .6 : s.state === 'idle' ? 0 : .6; s.hull.position.y += (s.lift + heave) * (1 - s.surface) - DEEP * (1 - up) * (1 - s.surface); } // (it lies up under the sheet, where it can be seen through it)
      s.hull.position.y += Math.sin(this.time * 1.6 + s.phase) * .03 * s.surface; // rides the swell
      s.hull.rotation.z += Math.sin(this.time * 1.2 + s.phase) * .025 * s.surface;
      // under water nothing touches it: shots and blasts pass over (no hit box at all), and it can't be hurt
      const hurt = s.surface >= HURT_ABOVE, sn = Math.abs(Math.sin(o.rotation.y)), cs = Math.abs(Math.cos(o.rotation.y));
      s.target.immune = !hurt;
      s.target.x = p.x; s.target.z = p.z;
      s.target.hw = hurt ? (sn * HIT_LEN + cs * HIT_WID) * s.k : -1; s.target.hd = hurt ? (cs * HIT_LEN + sn * HIT_WID) * s.k : -1; // (a long thin box along the way it lies)
      s.target.r = hurt ? HIT_LEN * s.k : -50;
    }
    this.stepBubbles(dt);
    if (world.setIceBreaks) { // the ice over each ambush sub, for the water's shader: how far it has cracked, and how far it has opened
      const L = [];
      for (const s of this.subs) if (s.ambush) { const crack = s.state === 'crack' ? (s.crackT < RISE_UNDER ? .2 * s.crackT / RISE_UNDER : .2 + .8 * smoothT((s.crackT - RISE_UNDER) / CRACK_V)) : s.state === 'idle' ? 0 : 1; s.open = s.opening ? Math.min(1, (s.open ?? 0) + dt / .35) : 0; L.push({ x: s.obj.position.x, z: s.obj.position.z, yaw: s.obj.rotation.y, hl: HIT_LEN * s.k * 1.1, hw: 2.4, stress: crack, open: s.open }); }
      world.setIceBreaks(L);
    }
  }

  // A missile away; an ambush sub then lets the next rise (up to SALVO a time) with the hatch still open, any other closes.
  fireNext(s, canShoot, world) {
    if (canShoot) this.launch(s, world);
    s.missile.visible = false;
    if (s.ambush && (s.shots = (s.shots ?? 0) + 1) < SALVO) { s.hatch = .45; s.missile.visible = true; s.state = 'volley'; } // (the cover is open from .45 of the hatch's travel: the next missile's rack rises over the rest)
    else { s.shots = 0; s.state = 'close'; }
  }
  // The missile leaves the silo (straight up) and homes on where the jeep was half a second ago.
  launch(s, world) {
    const from = s.muzzle.getWorldPosition(new THREE.Vector3()), at = this.statues.enemyFire.aimAgo(AIM_DELAY, _p);
    this.statues.shoot(from, Math.atan2(-(at.x - from.x), -(at.z - from.z)), at, world, BOSS_MISSILE_FLIGHT, CLIMB);
    this.fx.smoke(from.clone(), 1.5);
  }

  // Blown up while surfaced: it goes down by the stern, burning, and is gone.
  sink(s) {
    if (s.ambush) { this.ruin(s); return; } // (an ambush sub does not go down: it burns where it lies)
    if (s.fire) { this.fx.fires.douse(s.fire); s.fire = null; }
    s.state = 'sink'; s.sinkT = 0; s.target.immune = false; s.speed = 0;
    const at = s.obj.position.clone();
    this.fx.waterBlast(at, 1.6); this.world.ripple?.(at, 1.8);
    this.fx.smoke(at.clone().setY(1), 12);
    const burnt = new THREE.MeshStandardMaterial({ color: 0x1c241a, roughness: .9, flatShading: true });
    for (let i = 0; i < 8; i++) this.debris.chunk(at.clone().setY(1), burnt, .12 + Math.random() * .2, 3);
    this.fx.explosion(at.clone().setY(1.2), 1.5, true);
    for (let i = 0; i < 14; i++) this.debris.chunk(at.clone().setY(1.5), burnt, .1 + Math.random() * .22, 6);
    s.burnt = burnt; s.blastIn = .25;
  }
  // An ambush sub under the ice, the jeep near: the ice over it cracks, more and more (the water's shader draws it: world.setIceBreaks), for CRACK s, while it lies up under the sheet. Then the ice gives way (breakIce).
  // Bubbles for an ambush sub's climb: pale spheres that stream up off the hull toward the ice and gather under it, seen through the ice (the see-through view only).
  makeBubbles() {
    const N = 480; this.NB = N;
    this.bm = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshBasicMaterial({ color: 0x9fd0e2, transparent: true, opacity: .62, depthWrite: false }), N);
    this.bm.frustumCulled = false; this.bm.castShadow = false; this.bm.renderOrder = -1; addToLayer(this.bm, UNDERWATER); this.bm.layers.disable(0); this.scene.add(this.bm);
    this.bub = Array.from({ length: N }, () => ({ life: 0, age: 0, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, size: 0 })); this.bi = 0; this.bd = new THREE.Object3D(); this.bz = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < N; i++) this.bm.setMatrixAt(i, this.bz);
  }
  bubble(x, y, z, big = 1) { const b = this.bub[this.bi++ % this.NB], r = () => Math.random() - .5; b.x = x + r() * .6; b.y = y + r() * .4; b.z = z + r() * .6; b.vx = r() * .35; b.vz = r() * .35; b.vy = .7 + Math.random() * 1.1; b.age = 0; b.life = 3.5 + Math.random() * 3.5; b.size = (.12 + Math.random() * .3) * big; }
  stepBubbles(dt) {
    if (!this.bm) return;
    const d = this.bd;
    for (let i = 0; i < this.NB; i++) {
      const b = this.bub[i]; if (b.life <= 0) continue;
      b.age += dt; if (b.age >= b.life) { b.life = 0; this.bm.setMatrixAt(i, this.bz); continue; }
      b.x += b.vx * dt; b.z += b.vz * dt; b.vy += (.25 - b.vy) * Math.min(1, dt * .6); b.y = Math.min(b.y + b.vy * dt, -.28); // (they rise, easing to a drift, and gather against the underside of the ice)
      const k = b.age / b.life; d.position.set(b.x, b.y, b.z); d.scale.setScalar(b.size * Math.min(1, b.age * 4) * (1 - k * k * k)); d.updateMatrix(); this.bm.setMatrixAt(i, d.matrix);
    }
    this.bm.count = Math.min(this.NB, this.bi); this.bm.instanceMatrix.needsUpdate = true;
  }
  // Along the hull, off its top and sides: n bubbles
  hullBubbles(s, n, big = 1) {
    const yaw = s.obj.rotation.y, fx_ = -Math.sin(yaw), fz_ = -Math.cos(yaw), p = s.obj.position, L = HIT_LEN * s.k * .9, y0 = s.hull.getWorldPosition(this._bp ??= new THREE.Vector3()).y;
    for (let i = 0; i < n; i++) { const al = (Math.random() * 2 - 1) * L, ac = (Math.random() * 2 - 1) * 1.1; this.bubble(p.x + fx_ * al - fz_ * ac, y0 + .5 + Math.random() * .6, p.z + fz_ * al + fx_ * ac, big); }
  }
  // Seen through the ice a hull is lifted by the ice shader, so under the ice an ambush sub's paint is darkened, matt and nearly unlit by the sky, as the patrol subs' own materials are; it fades back to the normal look as it comes up.
  dimUnder(s) {
    const k = s.state === 'wreck' ? 1 : Math.min(1, Math.max(0, (s.surface - .05) / .6)); if (s.dimK === k) return; s.dimK = k;
    const f = .58 + .72 * k; // (and lighter than the original paint once surfaced: 1.3 times)
    for (const d of s.dim) { d.m.color.copy(d.c).multiplyScalar(f); d.m.envMapIntensity = d.e * (.06 + .94 * k * k); d.m.roughness = Math.min(1, d.r + .2 * (1 - k)); }
  }
  startCrack(s) { s.state = 'crack'; s.crackT = 0; s.cornered = true; sfx.ping(.55); } // (a sonar ping: something is coming up)
  chip(s) { const p = s.obj.position, yaw = s.obj.rotation.y, al = (Math.random() - .5) * HIT_LEN * s.k * 2, ac = (Math.random() - .5) * 4, m = iceShard(.25 + Math.random() * .4, .2 + Math.random() * .3, .1);
    m.position.set(p.x - Math.sin(yaw) * al - Math.cos(yaw) * ac * -1, .1, p.z - Math.cos(yaw) * al - Math.sin(yaw) * ac); this.scene.add(m); this.debris.launch(m, new THREE.Vector3((Math.random() - .5) * 2, 2.5 + Math.random() * 2.5, (Math.random() - .5) * 2), new THREE.Vector3((Math.random() - .5) * 12, (Math.random() - .5) * 12, (Math.random() - .5) * 12), .05); }
  // The sheet over it gives way: the ragged hole opens (the shader turns that patch of ice to open water), plates fly up and out, spray, and the boat rises through the gap. From now on its hull is in the jeep's way.
  breakIce(s, cam) {
    const p = s.obj.position, yaw = s.obj.rotation.y, rnd = (u, v) => u + Math.random() * (v - u), k = s.k, HW = 2.4, HL = HIT_LEN * k * 1.1;
    const fx_ = -Math.sin(yaw), fz_ = -Math.cos(yaw), at = (along, across) => new THREE.Vector3(p.x + fx_ * along - fz_ * across, 0, p.z + fz_ * along + fx_ * across);
    const grp = new THREE.Group(); this.scene.add(grp); s.iceFx = grp;
    // the sheet shatters: the patch over the hull is a mosaic of plates, which heave up and tumble apart as the hull comes through (the water under them is seen through, the shader's open water)
    for (let al = -HL; al <= HL; al += 1.7) for (let ac = -HW * 1.15; ac <= HW * 1.15; ac += 1.7) {
      const e = Math.pow(Math.pow(Math.abs(al) / HL, 3) + Math.pow(Math.abs(ac) / (HW * 1.15), 3), 1 / 3); if (e > 1.02) continue;
      const pt = at(al + rnd(-.4, .4), ac + rnd(-.4, .4)), m = iceShard(rnd(1.2, 2.0), rnd(1.2, 2.0), rnd(.18, .3)); m.position.set(pt.x, .03, pt.z); m.rotation.y = rnd(0, 6.28); m.castShadow = true; this.scene.add(m);
      const out = Math.atan2(pt.z - p.z, pt.x - p.x) + rnd(-.5, .5), sp = rnd(.6, 2.6) * (1 + Math.abs(ac) / HW * .5);
      this.debris.launch(m, new THREE.Vector3(Math.cos(out) * sp, rnd(2.5, 6), Math.sin(out) * sp), new THREE.Vector3(rnd(-6, 6), rnd(-6, 6), rnd(-6, 6)), .05);
    }
    for (let i = 0; i < 14; i++) { // and splinters, flung higher
      const pt = at(rnd(-HL, HL), (Math.random() < .5 ? -1 : 1) * HW), m = iceShard(rnd(.3, .9), rnd(.25, .7), .12); m.position.set(pt.x, .2, pt.z); this.scene.add(m);
      const out = Math.atan2(pt.z - p.z, pt.x - p.x) + rnd(-.6, .6), sp = rnd(2, 5); this.debris.launch(m, new THREE.Vector3(Math.cos(out) * sp, rnd(4, 8), Math.sin(out) * sp), new THREE.Vector3(rnd(-10, 10), rnd(-10, 10), rnd(-10, 10)), .05);
    }
    for (const al of [-HL * .6, 0, HL * .6]) this.fx.waterBlast?.(at(al, 0), .9); // (water slops up through the gap)
    cam?.kick?.(.5);
    const sn = Math.abs(Math.sin(yaw)), cs = Math.abs(Math.cos(yaw));
    const half = HIT_WID * k + .3; s.obsts = []; // (the hull is a row of squares along its length: the jeep's blocking boxes cannot be turned, so a hull lying at an angle is a staircase of them, not one big box round it)
    for (let a = -(HIT_LEN * k - half); a <= HIT_LEN * k - half + .01; a += half * 1.1) { const o = { x: p.x + fx_ * a, z: p.z + fz_ * a, hw: half, hd: half, alive: true, isTarget: true, kind: 'subhull' }; s.obsts.push(o); this.world.obstacles.push(o); }
    s.opening = true; this.hullBubbles(s, 24, 1.5); // (the break: a burst of big bubbles)
  }
  // A loaded game: an ambush sub that had broken through is up again where it lay (the ice open round it, its hull solid, its hit points as they were), or, if it had been destroyed, a wreck, half sunk and burning, as it was left.
  reEmerge(s, hp, wrecked) {
    const yaw = s.obj.rotation.y, k = s.k, sn = Math.abs(Math.sin(yaw)), cs = Math.abs(Math.cos(yaw)), half = HIT_WID * k + .3, fx_ = -Math.sin(yaw), fz_ = -Math.cos(yaw), p = s.obj.position;
    s.opening = true; s.open = 1; s.surface = 1; s.hatch = 0; s.state = 'ready'; s.reload = 2; s.cornered = true; s.target.hp = hp; s.target.immune = false;
    s.obsts = []; for (let a = -(HIT_LEN * k - half); a <= HIT_LEN * k - half + .01; a += half * 1.1) { const o = { x: p.x + fx_ * a, z: p.z + fz_ * a, hw: half, hd: half, alive: true, isTarget: !wrecked, kind: 'subhull' }; s.obsts.push(o); this.world.obstacles.push(o); }
    this.dimUnder(s);
    if (wrecked || hp <= 0) { s.target.hp = 0; this.ruin(s, true); }
  }
  // An ambush sub destroyed: it stays where it is, burning, with a chain of blasts along it, and settles half under in the open water, its hull solid for good.
  ruin(s, quiet = false) { // quiet: a wreck put back by a loaded game: no blasts, no smoke, no flying chunks
    if (s.fire) { this.fx.fires.douse(s.fire); s.fire = null; }
    s.state = 'wreck'; s.target.immune = false; s.hatch = 0; s.missile.visible = false; s.settle = 0; s.sinkFrom = s.surface;
    s.obj.traverse(m => { if (m.isMesh && m.material && !Array.isArray(m.material)) { m.material = m.material.clone(); m.material.color.multiplyScalar(.32); } });
    const at = s.obj.position.clone(), fx_ = -Math.sin(s.obj.rotation.y), fz_ = -Math.cos(s.obj.rotation.y), kk = SCALE * s.k;
    s.burnt = new THREE.MeshStandardMaterial({ color: 0x1c241a, roughness: .9, flatShading: true }); s.blastIn = .1; s.blastsLeft = quiet ? 0 : 11; if (quiet) s.settle = 1;
    s.wreckFire = this.fx.fires?.start([-5, -2, 1.5, 4.5].map(k => new THREE.Vector3(at.x + fx_ * k * kk, .9, at.z + fz_ * k * kk)), .85, Infinity);
    if (!quiet) { this.fx.smoke(at.clone().setY(1.2), 140); this.fx.explosion(at.clone().setY(1.2), 1.5, true); for (let i = 0; i < 18; i++) this.debris.chunk(at.clone().setY(1.5), s.burnt, .1 + Math.random() * .25, 7); } else this.fx.smoke(at.clone().setY(1.2), 140);
    for (const o of s.obsts ?? []) o.isTarget = false; // (the hull no longer has a target to catch the shots: it is a wall)
  }
  wreckStep(s, dt) {
    s.settle = Math.min(1, s.settle + dt / 7); const k = s.settle * s.settle * (3 - 2 * s.settle); // (it goes down by the stern over a few seconds, and rests half under, canted over)
    poseSubmarine(s.obj, s.sinkFrom + (WRECK_LEVEL - s.sinkFrom) * k, 0); s.hull.rotation.x = .02 + .1 * k; s.hull.rotation.z = .16 * k; s.hull.position.y += Math.sin(this.time * 1.1 + s.phase) * .02;
    if (s.blastsLeft > 0 && (s.blastIn -= dt) <= 0) {
      s.blastsLeft--; s.blastIn = .2 + Math.random() * .22;
      const p = s.obj.position, fx_ = -Math.sin(s.obj.rotation.y), fz_ = -Math.cos(s.obj.rotation.y), along = (Math.random() - .5) * 20 * s.k, at = new THREE.Vector3(p.x + fx_ * along + (Math.random() - .5) * 1.6, .8 + Math.random() * .8, p.z + fz_ * along + (Math.random() - .5) * 1.6);
      this.fx.explosion(at, .8 + Math.random() * .8, Math.random() < .3);
      for (let i = 0; i < 6; i++) this.fx.spark(at.clone().add(new THREE.Vector3((Math.random() - .5) * 2, Math.random() * 1.5, (Math.random() - .5) * 2)));
      for (let i = 0; i < 4; i++) this.debris.chunk(at.clone(), s.burnt, .08 + Math.random() * .18, 5);
    }
  }
  // A third of its armour gone: a small blast on the hull, a puff of sparks and a few scorch marks on the deck (no fire yet: that comes at half, see blow).
  scuff(s) {
    const p = s.obj.position, fz = -Math.cos(s.obj.rotation.y), at = new THREE.Vector3(p.x, 1.2, p.z + (Math.random() - .5) * 6 * SCALE * fz);
    this.fx.explosion(at, .55);
    for (let i = 0; i < 5; i++) this.fx.spark(at.clone().add(new THREE.Vector3((Math.random() - .5) * 2, Math.random() * 1.5, (Math.random() - .5) * 2)));
    this.markHull(s, 5);
  }
  // Half its armour gone: a blast on the hull, plating flung off, scorch marks and torn paint on the deck, and a fire that burns on it from then on (see smoulder).
  blow(s) {
    s.hurt = true;
    const p = s.obj.position, fz = -Math.cos(s.obj.rotation.y), at = new THREE.Vector3(p.x, 1.2, p.z + (Math.random() - .5) * 6 * SCALE * fz);
    this.fx.explosion(at, 1);
    const burnt = new THREE.MeshStandardMaterial({ color: 0x2a2f28, roughness: .9, flatShading: true });
    for (let i = 0; i < 5; i++) this.debris.chunk(at.clone(), burnt, .1 + Math.random() * .15, 4);
    this.markHull(s);
  }
  // Soot, blistered paint with bare metal showing, and scratches laid on the deck in the places a ray from above finds the hull (they ride on it and go down with it).
  markHull(s, count = 12) {
    const tex = markTextures(), ray = new THREE.Raycaster(), down = new THREE.Vector3(0, -1, 0), o = s.obj, n = new THREE.Vector3(), q = new THREE.Quaternion();
    o.updateMatrixWorld(true);
    for (let i = 0; i < count; i++) {
      const lz = (Math.random() - .5) * 11, lx = (Math.random() - .5) * .8, w = o.localToWorld(new THREE.Vector3(lx / SLIM, 3, lz));
      ray.set(w, down); const hit = ray.intersectObject(o, true)[0]; if (!hit) continue;
      const m = new THREE.Mesh(markPlane, new THREE.MeshBasicMaterial({ map: tex[i % tex.length], transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
      const size = (.6 + Math.random() * 1) * SCALE; m.scale.set(size * (.8 + Math.random() * .6), size, 1);
      n.copy(hit.face.normal).transformDirection(hit.object.matrixWorld);
      q.setFromUnitVectors(new THREE.Vector3(0, 0, 1), n); m.quaternion.copy(q); m.rotateZ(Math.random() * 6.3);
      m.position.copy(hit.point).addScaledVector(n, .03);
      s.hull.attach(m); m.renderOrder = 2; (s.marks ??= []).push(m);
    }
  }
  // Damaged: a burning patch on the deck that moves with it, and sparks, while it is surfaced (the fire goes out as it dives and comes back when it rises).
  smoulder(s, dt) {
    const up = s.surface >= .3, p = s.obj.position, fz = -Math.cos(s.obj.rotation.y);
    if (up && !s.fire && this.fx.fires) {
      s.fireAt = [new THREE.Vector3(0, 1.05, 0), new THREE.Vector3(0, 1.05, 2.4 * SCALE), new THREE.Vector3(0, 1.05, -2.4 * SCALE)];
      s.fire = this.fx.fires.start(s.fireAt.map(v => v.clone()), .5);
    } else if (!up && s.fire) { this.fx.fires.douse(s.fire); s.fire = null; }
    if (s.fire) {
      s.fire.flames.forEach((f, i) => f.position.set(p.x, 1.05, p.z + s.fireAt[Math.floor(i / 2)].z));
      s.fire.centre.set(p.x, 1.05, p.z);
    }
    if (up && Math.random() < dt * 3) this.fx.spark(new THREE.Vector3(p.x + (Math.random() - .5) * SCALE, 1.2, p.z + (Math.random() - .5) * 8 * SCALE * fz));
  }
  // A chain of secondary blasts along the hull (fireballs, sparks, a spout of water and flung wreckage) as it goes down.
  blasts(s, dt) {
    if ((s.blastIn -= dt) > 0) return;
    s.blastIn = .22 + Math.random() * .2;
    const p = s.obj.position, fz = -Math.cos(s.obj.rotation.y);
    const at = new THREE.Vector3(p.x + (Math.random() - .5) * 1.6 * SCALE, 1 + Math.random() * .8, p.z + (Math.random() - .5) * 12 * SCALE * fz);
    this.fx.explosion(at, .8 + Math.random() * .7, Math.random() < .3);
    for (let i = 0; i < 6; i++) this.fx.spark(at.clone().add(new THREE.Vector3((Math.random() - .5) * 2, Math.random() * 1.5, (Math.random() - .5) * 2)));
    if (Math.random() < .6) this.fx.waterBlast(at.clone().setY(0), .7 + Math.random() * .6);
    for (let i = 0; i < 4; i++) this.debris.chunk(at.clone(), s.burnt, .08 + Math.random() * .18, 5);
  }
  // Takes a wrecked submarine out of the scene for good and frees its geometry (the shared materials and textures stay).
  dispose(s) {
    this.scene.remove(s.obj);
    s.obj.traverse(o => o.geometry?.dispose());
  }

  sinking(s, dt) {
    s.sinkT += dt;
    const k = Math.min(1, s.sinkT / SINK_TIME), o = s.obj, p = o.position, fz = -Math.cos(o.rotation.y);
    if (k < 1) {
      poseSubmarine(o, 1 - smooth(k), 0);
      s.hull.rotation.x = .25 * smooth(k); // bow lifts as the stern goes
    } else if (o.parent) this.dispose(s); // all the way under: out of the scene, so it costs no draw calls
    if (k < .85) this.blasts(s, dt);
    // ripples spreading over it and bubbles breaking the surface, while it goes down and for a while after
    if ((s.rippleIn -= dt) <= 0) {
      s.rippleIn = .35;
      this.world.ripple?.(_m.set(p.x, 0, p.z + (Math.random() - .5) * 13 * SCALE * fz), .7);
    }
    if ((s.bubbleIn = (s.bubbleIn ?? 0) - dt) <= 0) {
      s.bubbleIn = .06;
      const fade = 1 - Math.max(0, s.sinkT - SINK_TIME) / BUBBLE_AFTER; // (thinning out once it has gone)
      for (let i = 0; i < 3; i++) if (Math.random() < fade) {
        const at = _m.set(p.x + (Math.random() - .5) * 1.8 * SCALE, .05, p.z + (Math.random() - .5) * 11 * SCALE * fz);
        this.fx.puff(at.clone(), { color: 0xf2f8ff, size: .1 + Math.random() * .14, grow: .6, life: .5 + Math.random() * .5, opacity: .8, gravity: 3,
          vel: new THREE.Vector3((Math.random() - .5) * .5, .6 + Math.random() * .6, (Math.random() - .5) * .5) });
      }
      if (Math.random() < .25 * fade) this.fx.wake(_m.clone().setY(0), .9, 1.8); // a patch of foam where they burst
    }
    if (s.sinkT >= SINK_TIME + BUBBLE_AFTER) s.state = 'dead';
  }

  // Bubbles breaking the surface over the hull (and a patch of foam now and then) while it dives to evade.
  bubbles(s, dt, fade) {
    if ((s.bubbleIn = (s.bubbleIn ?? 0) - dt) > 0) return;
    s.bubbleIn = .06;
    const p = s.obj.position, fz = -Math.cos(s.obj.rotation.y);
    for (let i = 0; i < 3; i++) if (Math.random() < fade) {
      const at = _m.set(p.x + (Math.random() - .5) * 1.8 * SCALE, .05, p.z + (Math.random() - .5) * 11 * SCALE * fz);
      this.fx.puff(at.clone(), { color: 0xf2f8ff, size: .1 + Math.random() * .14, grow: .6, life: .5 + Math.random() * .5, opacity: .8, gravity: 3,
        vel: new THREE.Vector3((Math.random() - .5) * .5, .6 + Math.random() * .6, (Math.random() - .5) * .5) });
    }
    if (Math.random() < .25 * fade) this.fx.wake(_m.clone().setY(0), .9, 1.8);
  }

  // Saved games: whether it is awake, its place and its armour (it starts submerged again).
  snapshot() {
    const r = v => Math.round(v * 100) / 100;
    // (an ambush sub: 0 under the ice, 3 up through it and firing, 4 wrecked where it lies; any other sub: 0 asleep, 1 awake)
    return this.subs.map(s => [s.ambush ? (s.state === 'wreck' ? 4 : ['rise', 'ready', 'open', 'volley', 'close'].includes(s.state) ? 3 : 0) : (s.state === 'idle' ? 0 : 1), r(s.obj.position.x), r(s.obj.position.z), r(s.obj.rotation.y), s.target.hp]);
  }
  restore(data) {
    (data ?? []).forEach(([awake, x, z, yaw, hp], i) => {
      const s = this.subs[i]; if (!s) return;
      if (s.ambush) { s.state = 'idle'; s.surface = 0; s.hatch = 0; s.target.hp = HP; s.cornered = false; for (const o of s.obsts ?? []) o.alive = false; s.obsts = null; if (s.iceFx) { this.scene.remove(s.iceFx); s.iceFx = null; } s.opening = false; s.open = 0; s.crackT = 0; if (s.wreckFire) { this.fx.fires.douse(s.wreckFire); s.wreckFire = null; } poseSubmarine(s.obj, 0, 0); if (awake >= 3) this.reEmerge(s, hp, awake === 4); return; } // (an ambush sub goes back under the ice, unless it had come up: then it is up again, firing or wrecked as it was)
      if (awake) { s.obj.position.set(x, 0, z); s.obj.rotation.y = yaw; s.target.x = x; s.target.z = z; } // (one still asleep stays where the stage puts it, so moving it in the level data also moves it in old saves)
      s.target.hp = hp;
      if (hp <= 0) { s.state = 'dead'; s.target.immune = false; this.dispose(s); return; }
      s.state = awake ? 'hunt' : 'idle'; s.surface = 0; s.hatch = 0; poseSubmarine(s.obj, 0, 0);
    });
  }
}
