// The twin walkers (the secret level's boss pair): two fast two-legged mechs that fight together on the boss plateau.
// Each has 30 armour and a 20-point energy shield (50 effective hit points): the shield takes the damage first, and comes back after SHIELD_DELAY s without a hit.
// They fire while strafing (the torso twists on the hips to keep the cannons on the jeep (up to 100 degrees each way) while the chassis walks the way it is going), and each has three attacks, every one announced so it can be read from above:
//  - SPREAD (machine gun): the cannons glow, then a thin red laser comes on, one straight line from the machine gun down to the ground, and follows the jeep with a delay: it points where the jeep was a moment ago, so a jeep that keeps moving
//    is never quite under it. After 1.5 s the laser goes out and the gun fires like the player's own: a stream of fast tracer bullets, a little scattered, flying along the barrel, which keeps swinging after where the jeep was. A bullet
//    is a real round: it flies (about as fast as the player's), and ends on the ground, a solid, or the jeep, which it kills if it passes through it low enough.
//  - DASH: a crouch with a red strip laid on the ground toward the jeep (it locks onto the jeep's place a moment before the run), then a headlong charge, quick and dead straight along the line it locked: the jeep is crushed if it is still in the way.
//    Afterwards the walker stands, out of breath and open to fire.
//  - ROCKET VOLLEY: it plants its feet and goes still for about 2.5 s, the back-pack opens and fires its rockets straight up. Each rocket's landing place is marked at once by a laser dot with a small ring that
//    closes in on it, a few metres from the jeep's place (the first two on where it is heading). About 3 s after launch the rockets come down on the dots, each a blast that kills the jeep inside it.
// A director drives the pair as a team: one is the ASSAULT (closes in, bursts and dashes), the other the SUPPORT (hangs back on the far side of the jeep, so it is caught between them, and plants for the rocket volley).
// They swap parts after a volley. When one falls the other goes berserk: quicker, shorter pauses, a faster shield, a bigger volley, and it chains attacks.
import { tr } from './lang.js';
import * as THREE from 'three';
import { buildWalker } from '../assets/walker.js';
import { buildRocket } from '../assets/rocket.js';
import { sfx } from './sfx.js';
import { addToLayer, REFLECT } from './layers.js';
import { skinify, mergeStatic, mergeAcross } from './optimize.js';
import { HALF_LEN } from './player.js';
import { buildWallMarker } from './arena.js';

// the moving groups of the model: skinified, so that every material is one skinned mesh over these bones (a walker is about 300 small meshes otherwise: its shadow and its picture were over half of the scene's draw calls)
const BONES = ['hips', 'torso', 'legL', 'legR', 'kneeL', 'kneeR', 'footL', 'footR', 'drillArm', 'drillSlide', 'drillBit', 'gunR', 'pod', 'podLidL', 'podLidR'];

const ACCENT = 0xff7a1a;                            // the trim and the visor: the same on both walkers (the callsigns tell them apart)
const SCALE = .85;                                   // the model's size on the field (about 6 m tall)
const RAW_HP = 30, SHIELD_HP = 20;                   // 50 effective: a grenade or a rocket's blast takes 4
const SHIELD_DELAY = 5, SHIELD_RATE = 4, SHIELD_DELAY_B = 3, SHIELD_RATE_B = 8; // s without a hit before it recharges; points a second (the berserk survivor's too)
const SPEED = 6.2, TURN = 2.2, ACCEL = 14;          // m/s strafing; rad/s the chassis turns
const TORSO_MAX = 1.75, TORSO_RATE = 5;               // rad: how far the torso can twist either way on the hips (100 degrees); rad/s it swings to follow the jeep
const BODY_R = 2.1, CONTACT_R = 2.2;                 // m: the keep-out radius round a walker for obstacles; the jeep's centre this close to a walker is crushed
const BERSERK = { speed: 1.35, cool: .5, volley: 8 };
// spread: rapid sweeps, as the Hind's gun does
const BURST_AIM = .45, BEAM_T = 1.5, LAG = .4, SHOTS = 22, SHOT_GAP = .06, BULLET_SPEED = 40, JITTER_YAW = .05, JITTER_PITCH = .016, BULLET_LIFE = 1.1, BULLET_MAX = 48;   // s of warning; s the laser tracks before the stream; s behind the jeep the aim is; rounds in the stream and the gap between; m/s a round's speed; its scatter (rad, sideways and up and down); s it flies at most; the most in the air
// dash
const DASH_WIND = .8, DASH_LOCK = .25, DASH_SPEED = 17.5, DASH_TIME = 1.5, DASH_RECOVER = .95;   // (the recovery is a skid now, so it is a little longer)
// volley
const V_PLANT = .6, V_GAP = .2, V_STILL = 2.6, V_N = 6, V_FLIGHT = 3.0, V_FALL = .45, V_BLAST = 1.9; // s, s, s (still in all), rockets, s from launch to the strike, s of the final drop (visible), m the blast kills within
const SPAWN_R = 4;                                   // m: landing places are at least this far from each other
const rnd = (a, b) => a + Math.random() * (b - a);
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
const approach = (v, to, step) => v < to ? Math.min(to, v + step) : Math.max(to, v - step);
const ease = x => { x = Math.min(1, Math.max(0, x)); return x * x * (3 - 2 * x); };
const _q = new THREE.Quaternion(), _up = new THREE.Vector3(0, 1, 0), _v = new THREE.Vector3(), _w = new THREE.Vector3(), _red = new THREE.Color(1, .1, .05);

export class Walkers {
  // cfg: { spawns: [{ x, z, accent }], bounds: { x0, x1, z0, z1 }, trigger: { x, z, r } }
  constructor(scene, world, fx, enemyFire, debris, cfg) {
    Object.assign(this, { scene, world, fx, enemyFire, debris, cfg, time: 0, started: false, won: false, onDefeated: null, rain: [], markers: [], jv: new THREE.Vector3(), lastP: null, assault: 0, swapIn: 14, heavyUntil: 0, hud: null, wake: 0 });
    const B = cfg.bounds, near = o => o.x > B.x0 - 10 && o.x < B.x1 + 10 && o.z > B.z0 - 10 && o.z < B.z1 + 10;
    this.solids = world.obstacles.filter(o => o.alive && near(o) && (o.kind === 'building' || o.kind === 'wall' || o.kind === 'blocker' || o.kind === 'column'));   // (what a walker keeps out of: the hut, the radar, the generator, rocks)
    this.walkers = cfg.spawns.map((sp, i) => this.makeWalker(sp, i));
    for (let i = 0; i < 12; i++) this.markers.push(this.makeMarker());
  }

  makeWalker(sp, i) {
    const model = buildWalker({ accent: ACCENT, callsign: i ? 'BETA' : 'ALPHA', glyph: i ? 'β' : 'α' }), w = { i, name: i ? 'BETA' : 'ALPHA', model };
    const eye = model.getObjectByName('eye'), tip = model.getObjectByName('drillTip');   // (these two are plain meshes of their own material: skinify takes them off the model, but their materials, which the game recolours, live on in the skinned meshes)
    skinify(model, BONES);   // (at rest, at the origin, before it is scaled and placed)
    model.scale.setScalar(SCALE); model.userData.noWater = true;
    this.scene.add(addToLayer(model, REFLECT));
    const g = n => model.getObjectByName(n);
    Object.assign(w, { hips: g('hips'), torso: g('torso'), legs: [g('legL'), g('legR')], knees: [g('kneeL'), g('kneeR')], feet: [g('footL'), g('footR')], guns: [g('drillArm'), g('gunR')], slide: g('drillSlide'), bit: g('drillBit'), tip, muzzles: [g('muzzleL'), g('muzzleR')], mouths: [g('mouthL'), g('mouthR')],
      tubes: Array.from({ length: 6 }, (_, k) => g('rocket' + (k + 1))), lids: [g('podLidL'), g('podLidR')], eye, shield: g('shield'), glow: g('chargeGlow') });
    w.eyeMat = w.eye.material; w.accent = new THREE.Color(ACCENT); w.shieldMat = w.shield.material;
    w.pos = model.position; w.pos.set(sp.x, this.world.heightAt(sp.x, sp.z), sp.z); w.yaw = Math.PI; model.rotation.y = w.yaw;
    Object.assign(w, { raw: RAW_HP, shieldHp: SHIELD_HP, lastHp: RAW_HP + SHIELD_HP, noHit: 99, flash: 0, vel: new THREE.Vector3(), phase: Math.random() * 6, dead: false, state: 'idle', t: 0, atk: null, cool: rnd(1.2, 2.2), dashCool: 3, volleyCool: 5,
      strafe: Math.random() < .5 ? 1 : -1, strafeIn: rnd(1.5, 3), crouch: 0, kick: [0, 0], burst: 0, lock: new THREE.Vector3(), dashT: 0, lidOpen: 0, fired: 0, dyingT: 0, nextBang: 0, shieldDown: false, prevCos: [0, 0], hits: Array.from({ length: 4 }, () => ({ dir: new THREE.Vector3(0, 1, 0), age: -1 })), hitN: 0 });
    w.target = { object: model, x: sp.x, z: sp.z, hw: 1.9, hd: 1.9, r: 2.4, hp: RAW_HP + SHIELD_HP, score: 15000, oncePerVolley: 2, boom: true, immune: true, hitAt: null,
      bulletK: 1 / 3, shardK: .5, onHurt: () => { /* (the shield and armour are worked out in syncHealth: the target's own hp is the two added together) */ }, wreck: () => this.destroy(w) };
    this.world.targets.push(w.target);
    return w;
  }

  // ---- the landing marks: a laser dot, a ring that closes in on it, the blast's footprint and a thin column of light up into the sky
  makeMarker() {
    const add = (map, o) => new THREE.MeshBasicMaterial({ map, color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, side: THREE.DoubleSide, ...o });
    const g = new THREE.Group(); g.visible = false; g.renderOrder = 9; g.userData.noWater = true;
    const tex = this.markTex ??= this.makeMarkTextures(), size = V_BLAST * 2.3, quad = () => new THREE.PlaneGeometry(size, size).rotateX(-Math.PI / 2);
    const fill = new THREE.Mesh(new THREE.CircleGeometry(V_BLAST, 36).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xff2010, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, side: THREE.DoubleSide }));
    const dot = new THREE.Mesh(quad(), add(tex.reticle)), dial = new THREE.Mesh(quad(), add(tex.dial)), ring = new THREE.Mesh(quad(), add(tex.ring));   // (dot: the reticle at the middle; dial: the tick ring turning round it; ring: a thin ring that closes in on it as the strike nears)
    for (const m of [fill, dial, ring, dot]) { m.renderOrder = 9; m.frustumCulled = false; g.add(m); }
    g.userData.parts = { dot, fill, dial, ring }; this.scene.add(g); return g;
  }
  // The three drawings of the mark (a canvas each: thin red-orange linework with a hot white core, glowing, additive on the ground)
  makeMarkTextures() {
    const mk = draw => { const c = document.createElement('canvas'); c.width = c.height = 256; const x = c.getContext('2d'); x.translate(128, 128); x.lineCap = 'butt'; draw(x); const t = new THREE.CanvasTexture(c); t.anisotropy = 4; return t; };
    const hot = 'rgba(255,230,210,1)', red = 'rgba(255,70,40,1)', glow = x => { x.shadowColor = 'rgba(255,40,20,1)'; x.shadowBlur = 8; };
    const reticle = mk(x => {
      glow(x); x.strokeStyle = red; x.lineWidth = 3;
      for (let i = 0; i < 4; i++) { x.save(); x.rotate(i * Math.PI / 2); x.beginPath(); x.moveTo(0, -22); x.lineTo(0, -58); x.stroke(); x.beginPath(); x.moveTo(-14, -112); x.lineTo(-14, -98); x.lineTo(14, -98); x.lineTo(14, -112); x.stroke(); x.restore(); }   // (four gapped crosshair arms, and a bracket beyond each)
      x.lineWidth = 2; x.beginPath(); x.arc(0, 0, 14, 0, Math.PI * 2); x.stroke();
      x.shadowBlur = 14; x.fillStyle = hot; x.beginPath(); x.arc(0, 0, 4.5, 0, Math.PI * 2); x.fill();
    });
    const dial = mk(x => {
      glow(x); x.strokeStyle = red; x.lineWidth = 3;
      for (let i = 0; i < 4; i++) { x.beginPath(); x.arc(0, 0, 118, i * Math.PI / 2 + .18, i * Math.PI / 2 + Math.PI / 2 - .18); x.stroke(); }   // (a circle broken into four arcs)
      x.lineWidth = 2; for (let i = 0; i < 48; i++) { const a = i / 48 * Math.PI * 2, r0 = i % 4 === 0 ? 100 : 108; x.beginPath(); x.moveTo(Math.cos(a) * r0, Math.sin(a) * r0); x.lineTo(Math.cos(a) * 114, Math.sin(a) * 114); x.stroke(); }   // (tick marks inside it)
    });
    const ring = mk(x => { glow(x); x.shadowBlur = 12; x.strokeStyle = 'rgba(255,120,90,1)'; x.lineWidth = 2.5; x.beginPath(); x.arc(0, 0, 124, 0, Math.PI * 2); x.stroke(); });
    return { reticle, dial, ring };
  }

  // ---- helpers
  alive() { return this.walkers.filter(w => !w.dead); }
  other(w) { return this.walkers.find(o => o !== w && !o.dead) ?? null; }
  berserk(w) { return !this.other(w); }
  groundAt(x, z) { return this.world.heightAt(x, z); }
  blocked(x, z) { const B = this.cfg.bounds; if (x < B.x0 || x > B.x1 || z < B.z0 || z > B.z1) return true; for (const o of this.solids) if (o.alive && Math.abs(x - o.x) < o.hw + BODY_R && Math.abs(z - o.z) < o.hd + BODY_R) return true; return false; }
  // Steering round what stands in the way: if the straight line ahead (a few strides) passes through a solid (the hut, the generator, the radar, a rock) it picks the corner of that solid, a stride's margin out, that it can see and that
  // costs the shortest way round toward where it is heading, and walks to it first (kept until it is there, so it does not dither at the wall); then on to the goal. Walking into a wall and sliding along it is the last resort only.
  avoid(w, vx, vz, dt) {
    const len = Math.hypot(vx, vz); if (len < .2) return [vx, vz];
    const p = w.pos, ux = vx / len, uz = vz / len, M = BODY_R + 1.1;
    const hit = (x0, z0, x1, z1, o, m) => { const lx = o.x - o.hw - m, hx = o.x + o.hw + m, lz = o.z - o.hd - m, hz = o.z + o.hd + m; let t0 = 0, t1 = 1; const dx = x1 - x0, dz = z1 - z0;
      for (const [a, d, lo, hi] of [[x0, dx, lx, hx], [z0, dz, lz, hz]]) { if (Math.abs(d) < 1e-6) { if (a < lo || a > hi) return false; } else { let q0 = (lo - a) / d, q1 = (hi - a) / d; if (q0 > q1) [q0, q1] = [q1, q0]; t0 = Math.max(t0, q0); t1 = Math.min(t1, q1); if (t0 > t1) return false; } } return true; };
    if (w.via) { w.viaT -= dt; if (Math.hypot(w.via.x - p.x, w.via.z - p.z) < 2.2 || w.viaT <= 0) w.via = null; else { const dx = w.via.x - p.x, dz = w.via.z - p.z, d = Math.hypot(dx, dz) || 1; return [dx / d * len, dz / d * len]; } }
    const L = Math.min(18, 5 + len * 1.8), ex = p.x + ux * L, ez = p.z + uz * L; let best = null, bestD = 1e9;
    for (const o of this.solids) { if (!o.alive) continue; if (!hit(p.x, p.z, ex, ez, o, M)) continue; const d = Math.hypot(o.x - p.x, o.z - p.z); if (d < bestD) { bestD = d; best = o; } }
    if (!best) return [vx, vz];
    const o = best, gx = p.x + ux * 40, gz = p.z + uz * 40, m2 = M + .9; let pick = null, score = 1e9;
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { const cx = o.x + sx * (o.hw + m2), cz = o.z + sz * (o.hd + m2); if (this.blocked(cx, cz) || hit(p.x, p.z, cx, cz, o, M - .6)) continue; const sc = Math.hypot(cx - p.x, cz - p.z) + Math.hypot(cx - gx, cz - gz); if (sc < score) { score = sc; pick = { x: cx, z: cz }; } }
    if (!pick) return [vx, vz];
    w.via = pick; w.viaT = 4; const dx = pick.x - p.x, dz = pick.z - p.z, d = Math.hypot(dx, dz) || 1; return [dx / d * len, dz / d * len];
  }
  forward(w) { return _v.set(-Math.sin(w.yaw), 0, -Math.cos(w.yaw)); }
  muzzleWorld(w, k, out = new THREE.Vector3()) { w.model.updateMatrixWorld(true); return w.muzzles[k].getWorldPosition(out); }
  setEye(w, k) { w.eyeMat.color.copy(w.accent).lerp(_red, k).multiplyScalar(1 + k * .6); }

  // ---- shield and armour: the target's hp is the sum; a drop in it is damage, taken from the shield first
  syncHealth(w, dt, ber) {
    const t = w.target, hit = w.lastHp - t.hp;
    if (hit > 0) {
      const s = Math.min(w.shieldHp, hit), wasUp = w.shieldHp > 0; w.shieldHp -= s; w.raw -= hit - s; w.noHit = 0;
      if (wasUp) this.absorb(w, t.hitAt, w.shieldHp <= 0);
      if (w.shieldHp <= 0) w.shieldDown = true;
    } else w.noHit += dt;
    if (w.noHit > (ber ? SHIELD_DELAY_B : SHIELD_DELAY) && w.shieldHp < SHIELD_HP) { const was = w.shieldHp; w.shieldHp = Math.min(SHIELD_HP, w.shieldHp + (ber ? SHIELD_RATE_B : SHIELD_RATE) * dt); if (w.shieldHp > 3) w.shieldDown = false; if (was < SHIELD_HP && w.shieldHp >= SHIELD_HP) this.ripple(w, _w.set(0, 1, 0), .6); }   // (full again: one soft ripple from the crown)
    t.hp = w.lastHp = w.raw + w.shieldHp;
    // the shield is not drawn: only the ripples where it takes a blow (the bubble's shader shows them), fading in under a second
    let live = false; const u = w.shieldMat.uniforms;
    for (let i = 0; i < 4; i++) { const h = w.hits[i]; if (h.age >= 0) { h.age += dt; if (h.age > .9) h.age = -1; else live = true; } u.uHit.value[i].set(h.dir.x, h.dir.y, h.dir.z, h.age); }
    w.flash = Math.max(0, w.flash - dt * 2.6); u.uFlash.value = w.flash; u.uTime.value = this.time; u.uColor.value.setHex(ber ? 0xff6a40 : 0x4ac8ff);
    w.shield.visible = live || w.flash > .01;
  }
  // a hit on the shield: the blow's direction (from the walker's middle toward where it landed, lifted so it shows on the side the camera sees) into the walker's own frame, and a ripple starts there
  absorb(w, at, broke) {
    const c = _v.set(w.pos.x, w.pos.y + 5 * SCALE, w.pos.z), from = at ?? this.lastP ?? c, d = _w.set(from.x - c.x, (from.y - c.y) * .5 + 1.6, from.z - c.z).normalize();
    this.ripple(w, d, 1, true);
    if (broke) { w.flash = 1; for (let k = 1; k < 4; k++) this.ripple(w, _w.set(Math.cos(w.yaw + k * 2.1), .5, -Math.sin(w.yaw + k * 2.1)).normalize(), 1); this.fx.explosion(c.clone(), .6); }
  }
  ripple(w, dirWorld, k = 1, sparks = false) {
    const cs = Math.cos(w.yaw), sn = Math.sin(w.yaw), h = w.hits[w.hitN++ % 4]; h.dir.set(dirWorld.x * cs - dirWorld.z * sn, dirWorld.y, dirWorld.x * sn + dirWorld.z * cs).normalize(); h.age = 0;   // (into the model's frame: undo its turn)
    if (sparks) { const p = new THREE.Vector3(w.pos.x + dirWorld.x * 3.2 * SCALE, w.pos.y + 5 * SCALE + dirWorld.y * 3.2 * SCALE, w.pos.z + dirWorld.z * 3.2 * SCALE);
      this.fx.puff(p, { color: 0x7fdcff, size: .9, grow: -2.2, life: .28, opacity: .9, additive: true, soft: true }); for (let i = 0; i < 3; i++) this.fx.spark(p.clone()); }
  }
  // a foot comes down: a dent in the snow's memory (it fills in again with the tracks) and a puff of powder; stomp: both feet together, harder
  plant(w, k, power = 1) {
    w.model.updateMatrixWorld(true); const p = w.feet[k].getWorldPosition(_v), fx = -Math.sin(w.yaw), fz = -Math.cos(w.yaw), gt = this.world.groundTrail;
    if (gt) { // the print is the foot's own shape (assets/walker.js: a broad sole, three armoured toes, a claw on each, and a heel spur), each part its own steep-walled pit; foot-local x to the right, z backward (forward is -z)
      const rx = Math.cos(w.yaw), rz = -Math.sin(w.yaw), at = (lx, lz) => [p.x + rx * lx - fx * lz, p.z + rz * lx - fz * lz];
      let q = at(0, -.2); gt.stamp(q[0], q[1], w.yaw, 1.1, 1.05, .8, .72);                                          // (the sole)
      for (const tx of [-.46, 0, .46]) {
        q = at(tx * 1.08, -1.2); gt.stamp(q[0], q[1], w.yaw + tx * .45, .34, .95, 1, .72);                           // (a toe: the outer two splay a little)
        q = at(tx * 1.2, -1.85); gt.stamp(q[0], q[1], w.yaw + tx * .45, .16, .55, 1, .8);                            // (and its claw, the deepest point)
      }
      q = at(0, .85); gt.stamp(q[0], q[1], w.yaw, .2, .5, 1, .8);                                                      // (the heel spur)
    }
    this.fx.puff(_w.set(p.x, p.y + .2, p.z), { color: 0xeef3f8, size: .45 * power, grow: 2.4, life: .7, opacity: .5, soft: true, vel: new THREE.Vector3(rnd(-.5, .5), .9, rnd(-.5, .5)) });
  }
  stomp(w) { this.plant(w, 0, 2); this.plant(w, 1, 2); }

  // ---- the arena shuts behind the jeep when the battle begins: a horizontal line across the road's exit (cfg.seal: z, and the strip drawn from x0 to x1). The jeep's centre may go no further south than it (the camera's south limit, as in the
  // other arenas); the same red-and-white strip and red curtain are laid along it, in short pieces so each lies on the ground there (the road climbs). It opens again when both walkers are down.
  sealArena(cam) {
    const S = this.cfg.seal; this.cam = cam; if (!S || this.sealMarks) return;
    cam.southLimit = S.z - HALF_LEN - .1;
    this.sealMarks = []; for (let cx = S.x0 + 1; cx < S.x1 + 1; cx += 2) {
      const m = buildWallMarker({ mouth: [cx, cx], south: S.z }); m.group.position.y = this.groundAt(cx, S.z) + .02;
      m.group.children.forEach((c, i) => { c.renderOrder = 5 + i; c.userData.noWater = true; }); m.group.children[0].scale.y = 2.4; this.scene.add(m.group); this.sealMarks.push(m);
    }
    this.sealT = 0; this.sealOut = 0; this.sealOpen = false; sfx.siren?.(1.2);
  }
  unseal() { if (!this.sealMarks || this.sealOpen) return; this.sealOpen = true; if (this.cam) this.cam.southLimit = null; }
  updateSeal(dt, player) {
    const S = this.cfg.seal; if (!this.sealMarks) return;
    this.sealT += dt; if (this.sealOpen) this.sealOut += dt;
    const show = Math.min(1, this.sealT / .8) * Math.max(0, 1 - this.sealOut / 1.5), near = THREE.MathUtils.clamp(1 - (S.z - player.position.z - HALF_LEN) / 6, 0, 1);
    for (const m of this.sealMarks) m.update(this.sealT, show, near);
    if (show <= 0) { for (const m of this.sealMarks) this.scene.remove(m.group); this.sealMarks = null; }
  }

  // ---- the director
  // Once, when one walker is down to its last three-fifths of health (and the other is clearly healthier): the healthy one takes the main attack at once, with a dash to close the distance, and the weakened one backs away,
  // facing the jeep, to take the support part (roles held for a long while after).
  checkLow() {
    if (this.lowDone) return; const [a, b] = this.walkers; if (a.dead || b.dead) return;
    const fa = (a.raw + a.shieldHp) / (RAW_HP + SHIELD_HP), fb = (b.raw + b.shieldHp) / (RAW_HP + SHIELD_HP), weak = fa < fb ? a : b, strong = weak === a ? b : a, fw = Math.min(fa, fb), fs = Math.max(fa, fb);
    if (fw >= .6 || fs < fw + .15) return;
    this.lowDone = true; this.assault = strong.i; this.lockRoles = this.time + 45; this.swapIn = 45; strong.forceDash = true; strong.dashFocus = true; weak.retreat = 8; weak.cool = Math.max(weak.cool, 3);
  }
  start(player, cam) {
    this.started = true; this.sealArena(cam); this.wake = 0; for (const w of this.walkers) { w.target.immune = false; w.state = 'move'; w.t = 0; w.cool = rnd(1.4, 2.4); }   // (the alarm sounds and they are on their way at once, striding toward the jeep; the first attack comes a moment later)
    sfx.siren?.(1.6); this.directorIn = 1.5;
  }
  pick(w, player) {
    if (w.forceDash) { w.forceDash = false; this.begin(w, 'dash', 1); return; }   // (the healthy walker's dash in, when its partner is nearly down)
    const o = this.other(w), ber = !o, d = Math.hypot(player.position.x - w.pos.x, player.position.z - w.pos.z), role = ber ? 'both' : (this.walkers[this.assault] === w ? 'assault' : 'support'), t = this.time;
    const heavyFree = t >= this.heavyUntil, otherBusy = o && ['dashWind', 'dashRun', 'volleyPlant', 'volleyFire', 'volleyHold'].includes(o.state), K = ber ? BERSERK.cool : 1;
    const can = a => ({ burst: d < 38, dash: heavyFree && !(o && ['dashWind', 'dashRun'].includes(o.state)) && w.dashCool <= 0 && d > 6 && d < 30, volley: heavyFree && !otherBusy && w.volleyCool <= 0 && d > 9 })[a];
    let choice = null;
    if (role === 'support') choice = can('volley') && Math.random() < .8 ? 'volley' : (can('burst') && Math.random() < .55 ? 'burst' : null);
    else if (role === 'assault') choice = can('dash') && Math.random() < (w.dashFocus ? .85 : .5) ? 'dash' : (can('burst') ? 'burst' : null);
    else choice = can('volley') && Math.random() < .35 ? 'volley' : can('dash') && Math.random() < .5 ? 'dash' : can('burst') ? 'burst' : null;   // (berserk: anything)
    if (!choice) { w.cool = rnd(.5, 1) * K; return; }
    this.begin(w, choice, K);
  }
  begin(w, name, K = 1) {
    w.atk = name; w.t = 0; w.fired = 0; w.burst = 0;
    if (name === 'burst') w.state = 'burstAim';
    else if (name === 'dash') { w.state = 'dashWind'; this.heavyUntil = this.time + 1.6; w.dashCool = (w.dashFocus ? rnd(2, 3) : rnd(6, 8)) * K; w.lock.set(0, 0, 0); }
    else { w.state = 'volleyPlant'; this.heavyUntil = this.time + 2.0; w.volleyCool = rnd(9, 12) * K; }
  }
  endAttack(w, pause = [1.6, 2.6]) {
    if (w.dashFocus) pause = [pause[0] * .5, pause[1] * .5];   // (the walker covering its partner presses on: half the pause)
    const ber = this.berserk(w), K = ber ? BERSERK.cool : 1;
    w.state = 'move'; w.t = 0; w.cool = rnd(pause[0], pause[1]) * K; w.atk = null;
    if (w.lastAtk === 'volley' && this.time >= (this.lockRoles ?? 0)) { this.assault = this.walkers.indexOf(w); this.swapIn = rnd(12, 17); } w.lastAtk = null;   // (the support has had its volley: it takes the assault's part, and the other hangs back)
  }

  // ---- the frame
  update(dt, { player, cam, killPlayer }) {
    this.time += dt;
    const can = player.enabled && !player.dead; if (this.lastP) { if (can) this.jv.lerp(_v.set((player.position.x - this.lastP.x) / Math.max(dt, 1e-3), 0, (player.position.z - this.lastP.z) / Math.max(dt, 1e-3)), Math.min(1, dt * 5)); } this.lastP = (this.lastP ?? new THREE.Vector3()).copy(player.position);
    if (!this.started) {
      const c = this.cfg.trigger; if (can && Math.hypot(player.position.x - c.x, player.position.z - c.z) < c.r && player.position.z < c.z + 20) this.start(player, cam);
      for (const w of this.walkers) { this.idlePose(w, dt); w.target.x = w.pos.x; w.target.z = w.pos.z; }
      this.updateHud(); return;
    }
    this.live = can; const kill = () => { if (!this.live || player.invulnerable) return; this.live = false; killPlayer(); };
    if ((this.swapIn -= dt) <= 0) { this.swapIn = rnd(12, 17); const o = this.other(this.walkers[this.assault]); if (o) this.assault = this.walkers.indexOf(o); }
    this.checkLow();
    for (const w of this.walkers) { if (w.dead) { this.dying(w, dt, cam); continue; } this.syncHealth(w, dt, this.berserk(w)); this.step(w, dt, player, cam, kill); }
    this.updateRain(dt, player, cam, kill); this.updateBullets(dt, player, kill); this.updateWreck(dt); this.updateSeal(dt, player);
    // two walkers do not stand on one another
    const [a, b] = this.walkers; if (!a.dead && !b.dead) { const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z, d = Math.hypot(dx, dz) || 1; if (d < 7) { const p = (7 - d) / 2; for (const [w, s] of [[a, -1], [b, 1]]) { const nx = w.pos.x + dx / d * p * s, nz = w.pos.z + dz / d * p * s; if (!this.blocked(nx, nz)) { w.pos.x = nx; w.pos.z = nz; } } } }
    if (!this.won && this.walkers.every(w => w.dead && w.dyingT > 3.4)) { this.won = true; this.unseal(); this.onDefeated?.(); }
    this.updateHud();
  }

  idlePose(w, dt) {
    w.hips.position.y = 4.05 + Math.sin(this.time * 1.2 + w.i) * .03; this.setEye(w, 0); w.eyeMat.color.multiplyScalar(.15); w.shield.visible = false;
    w.guns.forEach(g => { g.rotation.x = .12; });
    for (let k = 0; k < 2; k++) { w.legs[k].rotation.set(0, 0, k ? .09 : -.09); w.knees[k].rotation.x = 0; }
  }

  step(w, dt, player, cam, kill) {
    const ber = this.berserk(w), spd = SPEED * (ber ? BERSERK.speed : 1), pp = player.position, dx = pp.x - w.pos.x, dz = pp.z - w.pos.z, d = Math.hypot(dx, dz) || 1, toYaw = Math.atan2(-dx, -dz);
    w.t += dt; w.cool -= dt; w.dashCool -= dt; w.volleyCool -= dt; w.strafeIn -= dt; w.retreat = Math.max(0, (w.retreat ?? 0) - dt);
    const aimErr = Math.abs(wrap(toYaw - (w.yaw + w.torso.rotation.y))), wantV = new THREE.Vector3(); let chMode = 'player', torsoFree = true, torsoAim = null; let turn = TURN * (ber ? 1.25 : 1), face = true, speedK = 1, eyeK = 0, crouchTo = 0, gait = 1;
    const unit = (x, z) => { const l = Math.hypot(x, z) || 1; return [x / l, z / l]; };
    const moveBehaviour = k => { // strafe and keep a distance: the assault circles in close; the support goes round to the far side of the jeep and stays well back
      const o = this.other(w), isSupport = o && this.walkers[this.assault] !== w, R = isSupport ? 25 : 13.5;
      if (w.strafeIn <= 0) { w.strafe = -w.strafe; w.strafeIn = rnd(1.6, 3.4); }
      const [ux, uz] = unit(dx, dz), tx = -uz * w.strafe, tz = ux * w.strafe;
      let vx = tx * .75, vz = tz * .75, rad = THREE.MathUtils.clamp((d - R) * .35, -1, 1);
      if (isSupport && o) { const ox = pp.x - o.pos.x, oz = pp.z - o.pos.z, [fx, fz] = unit(ox, oz), gx = pp.x + fx * R, gz = pp.z + fz * R, [hx, hz] = unit(gx - w.pos.x, gz - w.pos.z), far = Math.hypot(gx - w.pos.x, gz - w.pos.z); vx = hx * Math.min(1, far / 8) + tx * .3; vz = hz * Math.min(1, far / 8) + tz * .3; rad *= .5; }   // (flank: take the place opposite the assault)
      if (w.retreat > 0) { vx = tx * .25; vz = tz * .25; rad = -1; }   // (the weakened walker backs away from the jeep, still facing it: the chassis walks backwards)
      wantV.set(vx + ux * rad, 0, vz + uz * rad); if (wantV.length() > 1) wantV.normalize(); wantV.multiplyScalar(spd * k);
    };
    switch (w.state) {
      case 'wake': { eyeK = 0; w.hips.position.y = 4.05; this.setEye(w, 0); if (w.t > .9) { w.state = 'move'; w.t = 0; w.cool = rnd(.8, 1.6); } face = false; break; }
      case 'move': {
        moveBehaviour(1); if (w.cool <= 0 || w.forceDash) { this.pick(w, player); }
        break;
      }
      case 'burstAim': { moveBehaviour(.6); eyeK = w.t / BURST_AIM; if (w.t >= BURST_AIM && (aimErr < .3 || w.t > BURST_AIM + 1.2)) { w.state = 'burstFire'; w.t = 0; w.vol = null; } break; }
      case 'burstFire': {
        moveBehaviour(.6); eyeK = 1;
        const V = w.vol ??= { t: 0, k: 1, shooting: false, shots: 0, aim: new THREE.Vector3(pp.x, 0, pp.z) };
        V.t += dt;
        const lag = this.enemyFire.aimAgo(LAG, new THREE.Vector3()); V.aim.lerp(lag, Math.min(1, dt * 14)); V.aim.y = 0;   // (the aim: where the jeep was LAG seconds ago, followed smoothly)
        torsoAim = Math.atan2(-(V.aim.x - w.pos.x), -(V.aim.z - w.pos.z));
        if (!V.shooting) {
          const pulse = V.t > BEAM_T - .3 ? .95 : .55 + .2 * Math.abs(Math.sin(this.time * 18)), from = this.muzzleWorld(w, V.k, new THREE.Vector3()), L = this.lineFrom(from, this.muzzleDir(w), 0);
          this.setBar(this.bar(0), from, L.e, V.t > BEAM_T - .3 ? .09 : .06, pulse, 0xff2a18);   // (the laser: one straight line from the cannon to the ground)
          this.setBar(this.bar(1), from, L.e, V.t > BEAM_T - .3 ? .5 : .32, pulse * .16, 0xff2a18);   // (the mist round it: a wide, very faint bar under the line)
          const ramp = Math.min(1, V.t / .35), hot = V.t > BEAM_T - .3 ? 1.35 : 1, flick = 1 + .1 * Math.sin(this.time * 60);
          this.setGlow(this.glow(0, true), from, (.32 + .15 * pulse) * hot, .55 * ramp);                              // (the starburst at the muzzle)
          this.setGlow(this.glow(1, false), _w.copy(L.e).setY(L.e.y + .12), (1.3 + .45 * pulse) * hot * flick, (.55 + .45 * pulse) * ramp);   // (the bloom where it lands: on the jeep, if it is there)
          if (V.t >= BEAM_T) { V.shooting = true; V.t = 0; this.hideBars(); }
        } else {
          while (V.shots < SHOTS && V.t >= V.shots * SHOT_GAP) this.shoot(w, V, V.shots++, player, kill);
          if (V.shots >= SHOTS && V.t > SHOTS * SHOT_GAP + .25) { w.vol = null; this.hideBars(); w.lastAtk = 'burst'; if (ber && Math.random() < .4 && w.dashCool <= 0 && this.time >= this.heavyUntil) this.begin(w, 'dash', BERSERK.cool); else this.endAttack(w, [1.2, 2]); }
        }
        break;
      }
      case 'dashWind': {
        speedK = 0; crouchTo = 1; eyeK = 1; face = true; wantV.set(0, 0, 0);
        chMode = 'lock'; torsoFree = false; turn = 4.5; const lockAt = DASH_WIND - DASH_LOCK; if (w.t < lockAt) w.lock.set(pp.x, 0, pp.z);   // (it follows the jeep with its eyes; for the last moments the aim is fixed: a sidestep beats it)
        if (Math.random() < dt * 30) this.fx.puff(_v.set(w.pos.x + rnd(-1.5, 1.5), w.pos.y + .2, w.pos.z + rnd(-1.5, 1.5)), { color: 0xdfe6ee, size: .5, grow: 2.5, life: .8, opacity: .5, soft: true, vel: new THREE.Vector3(rnd(-1, 1), .8, rnd(-1, 1)) });
        if (w.t >= DASH_WIND) { w.state = 'dashRun'; w.t = 0; w.dashDir = Math.atan2(-(w.lock.x - w.pos.x), -(w.lock.z - w.pos.z)); w.runV = 0; sfx.rocket?.(); this.stomp(w); }
        break;
      }
      case 'dashRun': {
        face = false; torsoFree = false; eyeK = 1; crouchTo = .55; gait = .85; // (the legs cycle about 2.3 times a second at 15.5 m s: a stride of ~6.7 m, in step with the ground it covers; 2.2 had them scissoring at 6 a second, a stride of 2.6 m)
        w.runV = approach(w.runV, DASH_SPEED * (ber ? 1.2 : 1), 55 * dt); wantV.set(-Math.sin(w.dashDir), 0, -Math.cos(w.dashDir)).multiplyScalar(w.runV); turn = 6;
        w.yaw += wrap(w.dashDir - w.yaw) * Math.min(1, dt * 10);
        if (Math.random() < dt * 40) this.fx.puff(_v.set(w.pos.x + rnd(-1, 1), w.pos.y + .3, w.pos.z + rnd(-1, 1)), { color: 0xe8eef4, size: .6, grow: 3, life: .7, opacity: .55, soft: true, vel: new THREE.Vector3(rnd(-1, 1), 1, rnd(-1, 1)) });
        cam?.kick?.(.06);
        if (w.t >= DASH_TIME || w.blockedNow) { w.state = 'dashRecover'; w.t = 0; w.blockedNow = false; w.lastAtk = 'dash'; w.skidDir = Math.random() < .5 ? -1 : 1; w.skidA = 0; w.skidIn = 0; cam?.kick?.(.12); }
        break;
      }
      case 'dashRecover': { // the skid: like a car drifting to a stop on snow, it keeps sliding on its braced feet, the chassis swinging round sideways and the body leaning back, throwing up a fan of powder, then straightens out
        const T = DASH_RECOVER * (ber ? .6 : 1), sv = Math.hypot(w.vel.x, w.vel.z), sf = Math.min(1, sv / 12), u = Math.min(1, w.t / T), bump = Math.sin(Math.PI * Math.pow(u, .75));   // (bump: 0 to 1 and back to 0 over the recovery, smooth at both ends, peaking a little early)
        face = false; speedK = 0; wantV.set(0, 0, 0); gait = .2; eyeK = 0; crouchTo = .5 * bump; w.skidLean = .3 * bump;
        torsoFree = true; torsoAim = w.yaw + .55 * bump * w.skidDir;   // (the chassis keeps its heading, as the feet slide: it is the torso that swings out and comes back, one smooth sweep)
        if (sf > .05) {
          const vx = w.vel.x / (sv || 1), vz = w.vel.z / (sv || 1), sx = -vz * w.skidDir, sz = vx * w.skidDir;   // (the side it is swinging out to, and the spray flies out to)
          for (let n = dt * 110 * sf, c = 0; c < n || Math.random() < n - Math.floor(n) && c < 1; c++) this.fx.puff(_v.set(w.pos.x + rnd(-1.4, 1.4) + sx * 1.2, w.pos.y + .25, w.pos.z + rnd(-1.4, 1.4) + sz * 1.2), { color: 0xf0f5fa, size: .7, grow: 3.2, life: 1, opacity: .55, soft: true, vel: new THREE.Vector3(sx * rnd(3, 7) - vx * 2, rnd(.8, 2.2), sz * rnd(3, 7) - vz * 2) });
          if ((w.skidIn -= dt) <= 0) { w.skidIn = .1; this.plant(w, w.skidK = 1 - (w.skidK ?? 0), 1.3); }   // (the braced feet dig in, left and right)
          cam?.kick?.(.05 * sf);
        }
        if (w.t >= T) this.endAttack(w, [1.2, 2]); break; }
      case 'volleyPlant': {
        speedK = 0; wantV.set(0, 0, 0); crouchTo = ease(w.t / V_PLANT) * .8; w.lidOpen = ease(w.t / V_PLANT); eyeK = .4;
        if (w.t >= V_PLANT) { this.stomp(w); w.state = 'volleyFire'; w.t = 0; w.fired = 0; w.targets = this.pickTargets(w, player, ber ? BERSERK.volley : V_N); }
        break;
      }
      case 'volleyFire': {
        speedK = 0; wantV.set(0, 0, 0); crouchTo = .8; w.lidOpen = 1; eyeK = .6; const n = w.targets.length;
        while (w.fired < n && w.t >= w.fired * V_GAP * (ber ? .8 : 1)) { this.launch(w, w.fired, w.targets[w.fired]); w.fired++; }
        if (w.fired >= n) { w.state = 'volleyHold'; w.t = 0; }
        break;
      }
      case 'volleyHold': {
        speedK = 0; wantV.set(0, 0, 0); crouchTo = .8; w.lidOpen = 1; eyeK = .3; const still = Math.max(.3, V_STILL - (w.targets.length * V_GAP * (ber ? .8 : 1)) - V_PLANT);
        if (w.t >= (ber ? still * .75 : still)) { w.lastAtk = 'volley'; w.lidOpen = 0; this.endAttack(w, [1.4, 2.2]); }
        break;
      }
      default: break;
    }
    if ((w.state === 'move' || w.state === 'burstAim' || w.state === 'burstFire') && wantV.lengthSq() > .04) { const [ax, az] = this.avoid(w, wantV.x, wantV.z, dt); wantV.set(ax, 0, az); } else w.via = null;   // (round the hut, not into it)
    if (w.state !== 'volleyPlant' && w.state !== 'volleyFire' && w.state !== 'volleyHold') w.lidOpen = approach(w.lidOpen, 0, dt * 2);
    // velocity and position: toward the wanted velocity, stopped by what stands in the way (it slides along it)
    const accK = w.state === 'dashRun' ? 2 : w.state === 'dashRecover' ? 1.7 : 1;   // (the skid: it brakes harder than it first did: a slide of about 6 m, not 10)
    w.vel.x = approach(w.vel.x, wantV.x, ACCEL * dt * accK); w.vel.z = approach(w.vel.z, wantV.z, ACCEL * dt * accK);
    const nx = w.pos.x + w.vel.x * dt, nz = w.pos.z + w.vel.z * dt; let moved = false;
    if (!this.blocked(nx, nz)) { w.pos.x = nx; w.pos.z = nz; moved = true; } else if (!this.blocked(nx, w.pos.z)) { w.pos.x = nx; moved = true; w.vel.z *= .3; } else if (!this.blocked(w.pos.x, nz)) { w.pos.z = nz; moved = true; w.vel.x *= .3; } else { w.vel.multiplyScalar(.3); }
    if (!moved) { w.strafe = -w.strafe; w.strafeIn = rnd(1.2, 2.2); if (w.state === 'dashRun') w.blockedNow = true; }
    w.pos.y = this.groundAt(w.pos.x, w.pos.z);
    if (face) { // the chassis walks the way it is going (backwards, if that is the way back from the jeep) but never turns so far from the jeep that the torso cannot make up the difference
      let ch = toYaw; const sp = Math.hypot(w.vel.x, w.vel.z);
      if (chMode === 'lock') ch = Math.atan2(-(w.lock.x - w.pos.x), -(w.lock.z - w.pos.z));
      else if (sp > 1.8) { ch = Math.atan2(-w.vel.x, -w.vel.z); if (Math.abs(wrap(ch - toYaw)) > 1.9) ch += Math.PI; }
      const off = wrap(ch - toYaw), lim = TORSO_MAX * .8; if (chMode !== 'lock' && Math.abs(off) > lim) ch = toYaw + Math.sign(off) * lim;
      // A walker does not slew round like a tank. Walking, its legs are stepping anyway and the chassis follows the way it goes; standing, a small difference is made up by the torso alone (which twists 100 degrees either way), and
      // only a big one is turned out with the legs: a step, the body swinging round over it, and then a short pause (a dash's lock-on, where the torso is kept square, turns the whole way in quicker, smaller steps).
      const lock = chMode === 'lock', err = wrap(ch - w.yaw);
      if (sp > 1.2 && !w.tstep) w.yaw += THREE.MathUtils.clamp(err, -turn * dt, turn * dt);
      else {
        if (!w.tstep && (w.tpause = (w.tpause ?? 0) - dt) <= 0 && Math.abs(err) > (lock ? .12 : 1.0)) { const d = err - Math.sign(err) * (lock ? 0 : .3); w.tstep = { t: 0, T: Math.max(lock ? .22 : .4, Math.abs(d) / (lock ? 5 : 2.2)), d, done: 0 }; }
        if (w.tstep) { const S = w.tstep; S.t += dt; const e = ease(Math.min(1, S.t / S.T)); w.yaw += S.d * (e - S.done); S.done = e; if (S.t >= S.T) { w.tstep = null; w.tpause = lock ? 0 : .15; } }
      }
    } else w.tstep = null;
    { const want = torsoFree && w.state !== 'wake' ? THREE.MathUtils.clamp(wrap((torsoAim ?? toYaw) - w.yaw), -TORSO_MAX, TORSO_MAX) : 0, cur = w.torso.rotation.y, step = TORSO_RATE * dt; w.torso.rotation.y = cur + THREE.MathUtils.clamp(want - cur, -step, step); }   // (the torso swings to the jeep, or back to square for a dash)
    w.model.rotation.y = w.yaw;
    { const tr = dt > 0 ? wrap(w.yaw - (w.prevYawT ?? w.yaw)) / dt : 0; w.prevYawT = w.yaw; w.turnRate = (w.turnRate ?? 0) + (tr - (w.turnRate ?? 0)) * Math.min(1, dt * 10); }   // (rad/s: the legs step to it)
    { // the machine gun arm swings on its own pivot onto the aim point (turned and tipped down to the ground there); out of a burst it comes back to rest. The laser and the shots leave along this barrel.
      const gun = w.guns[1], V = w.vol; gun.rotation.order = 'YXZ'; let ty = 0, tx = .12;
      if (w.state === 'burstFire' && V) {
        w.model.updateMatrixWorld(true); const A = w.torso.worldToLocal(new THREE.Vector3(V.aim.x, this.groundAt(V.aim.x, V.aim.z) + .3, V.aim.z)), vx = A.x - gun.position.x, vy = A.y - gun.position.y, vz = A.z - gun.position.z;
        ty = THREE.MathUtils.clamp(Math.atan2(-vx, -vz), -.7, .7); tx = THREE.MathUtils.clamp(Math.atan2(vy, Math.hypot(vx, vz)), -.95, .3);
      }
      const rate = 9 * dt; gun.rotation.y += THREE.MathUtils.clamp(ty - gun.rotation.y, -rate, rate); gun.rotation.x += THREE.MathUtils.clamp(tx - gun.rotation.x, -rate, rate);
    }
    // contact: the jeep under a walker's feet is crushed (a dash is the way to bring it there)
    if (this.live && Math.hypot(pp.x - w.pos.x, pp.z - w.pos.z) < CONTACT_R) kill();
    this.pose(w, dt, crouchTo, eyeK, gait);
    w.target.x = w.pos.x; w.target.z = w.pos.z;
  }

  // ---- the body: legs swing with the velocity (forward and sideways, each leg half a cycle apart), the hips bob and drop, the guns kick back, the pod lids swing
  pose(w, dt, crouchTo, eyeK, gait) {
    w.crouch = approach(w.crouch, crouchTo, dt * 3.2);
    const fwd = _v.set(-Math.sin(w.yaw), 0, -Math.cos(w.yaw)), lf = w.vel.x * fwd.x + w.vel.z * fwd.z, ls = w.vel.x * Math.cos(w.yaw) - w.vel.z * Math.sin(w.yaw), sp0 = Math.hypot(w.vel.x, w.vel.z), tv = Math.abs(w.turnRate ?? 0) * 2.4, sp = Math.max(sp0, tv), mag = Math.min(1, sp / 7);   // (tv: the speed of a foot as the chassis turns on it; turning on the spot the legs step in place)
    w.phase += dt * (3 + sp * .9) * gait * (sp > .3 ? 1 : 0);
    for (let k = 0; k < 2; k++) {
      const ph = w.phase + (k ? Math.PI : 0), s = Math.sin(ph), c = Math.cos(ph), fwdK = sp0 >= tv ? lf / Math.max(1, sp) : .75, sideK = sp0 >= tv ? ls / Math.max(1, sp) : 0, out = k ? .09 : -.09;
      w.legs[k].rotation.x = s * .55 * mag * fwdK + w.crouch * .5 * (1 - fwdK * fwdK * .0);
      w.legs[k].rotation.z = out * (1 + w.crouch * 1.6) + s * .45 * mag * sideK * (k ? 1 : 1);
      w.knees[k].rotation.x = -(.1 + .85 * mag * Math.max(0, c) + w.crouch * .9);
      if (w.prevCos[k] > 0 && c <= 0 && mag > .12) this.plant(w, k, 1); w.prevCos[k] = c;   // (the foot comes down: a print in the snow)
    }
    w.hips.position.y = 4.05 - w.crouch * 1.1 + Math.abs(Math.cos(w.phase)) * .12 * mag;
    w.hips.rotation.x = -(lf / 22) * .5 + (w.state === 'dashRun' ? .18 : 0) - (w.state === 'dashRecover' ? (w.skidLean ?? 0) : 0);   // (it leans into a run)
    w.torso.rotation.z = -(ls / 22) * .4;
    for (let k = 0; k < 2; k++) { w.kick[k] = Math.max(0, w.kick[k] - dt * 5); w.guns[k].position.z = -.3 + w.kick[k] * .5; }
    w.lids[0].rotation.z = w.lidOpen * 1.15; w.lids[1].rotation.z = -w.lidOpen * 1.15;
    this.setEye(w, eyeK);
    const charging = w.state === 'burstAim' || (w.state === 'burstFire' && w.vol && !w.vol.shooting);
    w.mouths[0].visible = false; w.mouths[1].visible = charging; if (charging) w.mouths[1].scale.setScalar(.5 * (1 + Math.sin(this.time * 40) * .2 + (w.state === 'burstAim' ? w.t / BURST_AIM * 2 : 1)));   // (half the size it was: the glow on the gun's tip was too much)
    // the left arm is a drill, always out: idle it turns over slowly, and for a dash it spins up as the walker crouches, runs on at full speed and heats at the tip, then winds down
    const drillWant = w.state === 'dashWind' || w.state === 'dashRun' ? 1 : 0; w.drill = approach(w.drill ?? 0, drillWant, dt * (drillWant ? 2.4 : 1.2)); w.spin = (w.spin ?? 0) + dt * (1.2 + 40 * w.drill);
    w.slide.position.z = -.4; w.bit.rotation.z = w.spin; w.tip.material.color.copy(w.accent).lerp(_red, w.drill).multiplyScalar(1 + w.drill); w.guns[0].rotation.x = .12 - .17 * ease(w.drill);
  }

  // ---- spread: the laser and the stream. A line is one straight bar in space, from the muzzle down to a point on the ground
  bar(slot) { this.bars ??= []; return this.bars[slot] ??= (() => { this.barGeo ??= new THREE.BoxGeometry(1, 1, 1).translate(0, 0, .5); const m = new THREE.Mesh(this.barGeo, new THREE.MeshBasicMaterial({ color: 0xff2a18, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false })); m.renderOrder = 8; m.frustumCulled = false; m.userData.noWater = true; m.visible = false; this.scene.add(m); return m; })(); }
  setBar(m, a, b, wid, op, color) { const d = _w.copy(b).sub(a), len = d.length(); m.position.copy(a); m.lookAt(b); m.scale.set(wid, wid, Math.max(.01, len)); m.material.opacity = op; m.material.color.setHex(color); m.visible = true; }
  hideBars() { if (this.bars) for (const m of this.bars) m.visible = false; if (this.glows) for (const g of this.glows) g.visible = false; }
  // The glow of the laser: a hot spot where it lands (a soft red bloom, white at its heart) and a small starburst at the muzzle, like a real laser pointer's: additive sprites that always face the camera
  glow(slot, star) {
    this.glows ??= []; if (this.glows[slot]) return this.glows[slot];
    this.glowTex ??= {}; const key = star ? 'star' : 'soft';
    if (!this.glowTex[key]) {
      const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d'), r = x.createRadialGradient(64, 64, 0, 64, 64, 64);
      r.addColorStop(0, 'rgba(255,240,225,1)'); r.addColorStop(.12, 'rgba(255,150,120,.95)'); r.addColorStop(.35, 'rgba(255,50,30,.45)'); r.addColorStop(.7, 'rgba(255,20,10,.1)'); r.addColorStop(1, 'rgba(255,0,0,0)');
      x.fillStyle = r; x.fillRect(0, 0, 128, 128);
      if (star) for (const a of [0, Math.PI / 2, Math.PI / 4, -Math.PI / 4]) { x.save(); x.translate(64, 64); x.rotate(a); const g = x.createLinearGradient(-64, 0, 64, 0); g.addColorStop(0, 'rgba(255,60,40,0)'); g.addColorStop(.5, 'rgba(255,200,180,' + (a % (Math.PI / 2) === 0 ? .8 : .4) + ')'); g.addColorStop(1, 'rgba(255,60,40,0)'); x.fillStyle = g; x.fillRect(-64, -1.3, 128, 2.6); x.restore(); }
      this.glowTex[key] = new THREE.CanvasTexture(c);
    }
    const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex[key], transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, opacity: 0 }));
    m.renderOrder = 9; m.frustumCulled = false; m.userData.noWater = true; m.visible = false; this.scene.add(m); return this.glows[slot] = m;
  }
  setGlow(m, at, size, op) { m.position.copy(at); m.scale.set(size, size, 1); m.material.opacity = Math.min(1, op); m.visible = true; }
  rayEnd(x, z, dx, dz, len) { for (let t = 3; t < len; t += .5) { const px = x + dx * t, pz = z + dz * t; for (const o of this.solids) if (o.alive && Math.abs(px - o.x) < o.hw && Math.abs(pz - o.z) < o.hd) return t; } return len; }   // (a hut, the radar or a rock stops a line)
  // where the barrel points now, in the world (the machine gun arm's own orientation, not the walker's body): the muzzle's forward direction
  muzzleDir(w) { w.model.updateMatrixWorld(true); return new THREE.Vector3(0, 0, -1).applyQuaternion(w.muzzles[1].getWorldQuaternion(new THREE.Quaternion())); }
  // the line a shot or the laser follows: out of the muzzle along `dir` (turned `off` radians about the vertical), straight, until it meets the ground (or a solid, or 42 m): its end on the ground, and the stretch of the ground it crosses
  // (from 2 m out to a metre and a half past its end: whatever it is drawn through, it hits)
  lineFrom(from, dir, off) {
    const d = off ? dir.clone().applyAxisAngle(_up, off) : dir, pl = Math.hypot(d.x, d.z) || 1e-6, ux = d.x / pl, uz = d.z / pl;
    let L = 42; if (d.y < -.02) { for (let it = 0; it < 2; it++) { const gx = from.x + ux * (it ? L : 12), gz = from.z + uz * (it ? L : 12), t = (from.y - this.groundAt(gx, gz) - .3) / -d.y; L = THREE.MathUtils.clamp(t * pl, 5, 42); } }   // (a barrel tipped up never meets the ground: 42 m)
    L = this.rayEnd(from.x, from.z, ux, uz, L); const ex = from.x + ux * L, ez = from.z + uz * L, eg = this.groundAt(ex, ez);
    return { e: new THREE.Vector3(ex, eg + .3, ez), a: { x: from.x + ux * Math.min(2, L * .5), z: from.z + uz * Math.min(2, L * .5) }, b: { x: ex + ux * 1.5, z: ez + uz * 1.5 } };
  }
  shoot(w, V, i, player, kill) {   // a round out of the machine gun along the barrel, scattered a little, fast, with a tracer
    const from = this.muzzleWorld(w, 1, new THREE.Vector3()), dir = this.muzzleDir(w).applyAxisAngle(_up, (Math.random() - .5) * 2 * JITTER_YAW);
    dir.y += (Math.random() - .5) * 2 * JITTER_PITCH; dir.normalize();
    this.bulletProto ??= (() => {   // a round: a white-hot core in an orange sheath, a bright head with a soft halo, and a tapering tail that fades (three cones, each longer, thinner and fainter); +z is forward, the head at the origin
      const mat = (c, o) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, blending: THREE.AdditiveBlending, depthWrite: false }), g = new THREE.Group(), part = (geo, m, z) => { const k = new THREE.Mesh(geo, m); k.position.z = z; k.frustumCulled = false; g.add(k); return k; };
      const cylZ = (r, l) => new THREE.CylinderGeometry(r, r, l, 6).rotateX(Math.PI / 2), tail = (r, l) => new THREE.ConeGeometry(r, l, 6).rotateX(-Math.PI / 2);
      part(cylZ(.032, .55), mat(0xffffff, 1), -.15); part(cylZ(.07, .65), mat(0xff9a30, .5), -.2); part(new THREE.SphereGeometry(.1, 8, 6), mat(0xffe6b0, .85), .08); part(new THREE.SphereGeometry(.26, 8, 6), mat(0xff7a20, .22), .0);
      part(tail(.09, 1.0), mat(0xffa040, .6), -.5); part(tail(.06, 2.1), mat(0xff7a20, .3), -1.05); part(tail(.035, 3.4), mat(0xff5a10, .15), -1.7);
      return g; })();
    const bl = this.bullets ??= [], m = this.bulletProto.clone(); m.userData.noWater = true; m.position.copy(from); m.lookAt(from.clone().add(dir)); this.scene.add(m);
    bl.push({ m, v: dir.multiplyScalar(BULLET_SPEED), life: BULLET_LIFE }); if (bl.length > BULLET_MAX) { this.scene.remove(bl.shift().m); }
    this.fx.puff(from.clone(), { color: 0xffc060, size: .8, grow: -4, life: .08, opacity: 1, additive: true }); w.kick[1] = Math.min(1, w.kick[1] + .35); sfx.enemyShot?.(from, false, false);
  }
  updateBullets(dt, player, kill) {
    const bl = this.bullets; if (!bl?.length) return;
    for (let i = bl.length - 1; i >= 0; i--) {
      const b = bl[i], p = b.m.position; p.addScaledVector(b.v, dt); b.life -= dt; const g = this.groundAt(p.x, p.z); let done = b.life <= 0;
      if (!done && this.live && p.y - g < 2.6 && this.enemyFire.hitsJeep(p, player, .15)) { kill(); done = true; this.fx.hitHard(p.clone()); }
      else if (!done && p.y <= g + .1) { this.fx.hitSand?.(p.clone()); this.fx.spark(p.clone()); done = true; }
      else if (!done && p.y - g < 4 && this.solids.some(o => o.alive && Math.abs(p.x - o.x) < o.hw && Math.abs(p.z - o.z) < o.hd)) { this.fx.hitHard(p.clone()); done = true; }
      if (done) { this.scene.remove(b.m); bl.splice(i, 1); }
    }
  }

  // ---- the rocket volley: where they will come down, one rocket up out of a tube, and the strikes
  pickTargets(w, player, n) {
    const pts = [], pp = player.position, lead = this.jv, ok = (x, z) => pts.every(p => Math.hypot(p.x - x, p.z - z) > SPAWN_R);
    for (let i = 0; i < n; i++) {
      let x, z, tries = 0;
      if (i < 2) { x = pp.x + lead.x * (1.6 + i * .9) + rnd(-1.2, 1.2); z = pp.z + lead.z * (1.6 + i * .9) + rnd(-1.2, 1.2); }   // (the first two: where the jeep is heading)
      else do { const a = rnd(0, 6.28), r = rnd(2.5, 11); x = pp.x + Math.cos(a) * r; z = pp.z + Math.sin(a) * r; } while (!ok(x, z) && ++tries < 12);
      const B = this.cfg.bounds; x = THREE.MathUtils.clamp(x, B.x0 - 4, B.x1 + 4); z = THREE.MathUtils.clamp(z, B.z0 - 4, B.z1 + 4);
      pts.push({ x, z, y: this.groundAt(x, z) });
    }
    return pts;
  }
  launch(w, k, tgt) {
    const tube = w.tubes[k % w.tubes.length], from = tube.getWorldPosition(new THREE.Vector3()), m = buildRocket(); m.scale.setScalar(1.7); m.rotation.x = Math.PI / 2; m.position.copy(from);
    this.scene.add(addToLayer(m, REFLECT));
    const mk = this.markers.find(g => !g.visible); const R = { m, tgt, t: 0, state: 'up', vy: 8, flame: m.getObjectByName('flame'), mark: mk ?? null, from };
    if (mk) { mk.visible = true; mk.position.set(tgt.x, tgt.y + .15, tgt.z); mk.userData.t = 0; }
    this.rain.push(R); sfx.rocket?.(); this.fx.puff(from.clone(), { color: 0xd8d2c8, size: .7, grow: 3.5, life: 1.0, opacity: .6, soft: true, vel: new THREE.Vector3(0, 2, 0) }); this.fx.flash?.(from, 1.2);
    for (let i = 0; i < 3; i++) this.fx.spark(from.clone().add(new THREE.Vector3(rnd(-.4, .4), .2, rnd(-.4, .4))));
  }
  updateRain(dt, player, cam, kill) {
    for (let i = this.rain.length - 1; i >= 0; i--) {
      const R = this.rain[i], p = R.m.position; R.t += dt;
      if (R.state === 'up') {
        R.vy = Math.min(46, R.vy + 58 * dt); p.y += R.vy * dt; if (R.flame) R.flame.scale.setScalar(.9 + Math.random() * .5);
        this.fx.puff(_v.set(p.x, p.y - 1, p.z), { color: 0xcfcac2, size: .35, grow: 3, life: 1.2, opacity: .5, soft: true, vel: new THREE.Vector3(rnd(-.3, .3), -.5, rnd(-.3, .3)) });
        if (R.t > 1.25) { R.state = 'wait'; R.m.visible = false; }
      } else if (R.state === 'wait') {
        if (R.t >= V_FLIGHT - V_FALL) { R.state = 'down'; R.m.visible = true; p.set(R.tgt.x + rnd(-1, 1), R.tgt.y + 24, R.tgt.z + rnd(-1, 1)); R.m.rotation.x = -Math.PI / 2; R.fall = (p.y - R.tgt.y) / V_FALL; }   // (no second launch sound as they come down)
      } else {
        p.y -= R.fall * dt; p.x += (R.tgt.x - p.x) * Math.min(1, dt * 8); p.z += (R.tgt.z - p.z) * Math.min(1, dt * 8); if (R.flame) R.flame.scale.setScalar(.9 + Math.random() * .5);
        this.fx.puff(_v.set(p.x, p.y + 1, p.z), { color: 0xcfcac2, size: .3, grow: 2.5, life: .8, opacity: .5, soft: true, vel: new THREE.Vector3(0, .5, 0) });
        if (p.y <= R.tgt.y + .3) this.strike(R, player, cam, kill), this.rain.splice(i, 1);
      }
      // the mark: a dot, a ring that closes in on it as the strike nears, the footprint, the column of light
      if (R.mark) {
        const f = Math.min(1, R.t / V_FLIGHT), parts = R.mark.userData.parts, pulse = .6 + .4 * Math.sin(this.time * (8 + 22 * f));
        const lock = Math.min(1, f * 1.6);   // (it locks on as the strike nears: the reticle settles from a larger size, and the closing ring tightens round it)
        parts.dot.material.opacity = .75 + .25 * pulse; parts.dot.scale.setScalar(1.45 - .45 * lock); parts.dot.rotation.y = (1 - lock) * 1.2;
        parts.dial.material.opacity = .55 + .35 * f; parts.dial.rotation.y = -this.time * (.7 + 1.6 * f);
        parts.ring.material.opacity = .25 + .6 * f; parts.ring.scale.setScalar(1.7 - .75 * f * f);
        parts.fill.material.opacity = .04 + .14 * f * f;
      }
    }
  }
  strike(R, player, cam, kill) {
    const at = new THREE.Vector3(R.tgt.x, R.tgt.y + .3, R.tgt.z); R.m.parent?.remove(R.m);
    this.fx.explosion(at, 1.2); for (let i = 0; i < 8; i++) this.fx.spark(at.clone().add(new THREE.Vector3(rnd(-1.5, 1.5), rnd(0, 1.5), rnd(-1.5, 1.5))));
    this.fx.puff(at.clone(), { color: 0x2c2926, size: 1.2, grow: 4, life: 1.8, opacity: .6, soft: true, vel: new THREE.Vector3(0, 2.2, 0) });
    cam?.kick?.(.35);
    if (R.mark) { R.mark.visible = false; for (const m of Object.values(R.mark.userData.parts)) m.material.opacity = 0; }
    if (this.live && Math.hypot(player.position.x - R.tgt.x, player.position.z - R.tgt.z) < V_BLAST) kill();
  }

  // ---- the end of a walker: the legs give way, a run of blasts, and the last fireball; the survivor goes berserk (see ber in update)
  destroy(w) {
    if (w.dead) return; w.dead = true; w.dyingT = 0; if (w.vol) { w.vol = null; this.hideBars(); } w.tstep = null; /* (killed in the middle of aiming: its laser, and the glows on it, go out with it) */ w.raw = 0; w.shieldHp = 0; w.lastHp = 0;   // (the killing blow lands before the health is worked out: both bars go to nothing here) w.nextBang = 0; w.target.immune = true; w.target.hw = w.target.hd = -1; w.target.r = -50; w.shield.visible = false; w.mouths.forEach(m => { m.visible = false; });
    this.setEye(w, 0); w.eyeMat.color.multiplyScalar(.1);
  }
  dying(w, dt, cam) {
    const T = (w.dyingT += dt), fx = this.fx, e = ease;
    w.vel.multiplyScalar(Math.max(0, 1 - dt * 4)); w.pos.x += w.vel.x * dt; w.pos.z += w.vel.z * dt;
    // the collapse, in order: a shudder; one leg buckles at the knee; the arms droop; the other leg gives way; the torso pitches forward onto the hips as they drop
    const b0 = e((T - .5) / 1.4), b1 = e((T - 1.3) / 1.5), sag = e((T - 2.0) / 1.2), shake = Math.max(0, 1 - T / .9);
    w.knees[0].rotation.x = -.1 - 1.35 * b0; w.legs[0].rotation.x = .5 * b0; w.legs[0].rotation.z = -.09 - .22 * b0;
    w.knees[1].rotation.x = -.1 - 1.35 * b1; w.legs[1].rotation.x = .5 * b1; w.legs[1].rotation.z = .09 + .22 * b1;
    w.hips.position.y = 4.05 - 1.1 * (b0 + b1) / 2 * 2 - 1.0 * sag + Math.sin(T * 50) * .05 * shake; w.hips.rotation.x = .28 * e(T / 3) + .0; w.hips.rotation.z = .14 * (b0 - b1);
    w.torso.rotation.x = .85 * e((T - .9) / 2.1); w.torso.rotation.z = Math.sin(T * 38) * .05 * shake + .12 * (b1 - b0);
    w.guns[0].rotation.x = .12 + .75 * e((T - .4) / 1.5); w.guns[1].rotation.x = .12 + .65 * e((T - .8) / 1.5); w.drill = Math.max(0, (w.drill ?? 0) - dt); w.spin = (w.spin ?? 0) + dt * 12 * Math.max(0, 1 - T / 1.5); w.bit.rotation.z = w.spin;
    w.eyeMat.color.copy(w.accent).multiplyScalar(T < 2.4 ? (Math.random() < .45 ? .12 : 1.2) : .08);   // (the visor stutters, then dies)
    w.model.rotation.y = w.yaw;
    if (T < 3.2) {
      w.model.updateMatrixWorld(true); const joints = [w.knees[0], w.knees[1], w.torso, w.guns[0], w.guns[1], w.hips, w.legs[0], w.legs[1]];
      if ((w.nextBang -= dt) <= 0) { w.nextBang = rnd(.2, .38); const at = joints[(w.bangN = (w.bangN ?? -1) + 1) % joints.length].getWorldPosition(new THREE.Vector3()); fx.explosion(at.clone(), rnd(.3, .55)); for (let i = 0; i < 4; i++) fx.spark(at.clone()); }   // (a small blast at each joint in turn)
      if (Math.random() < dt * 16) fx.puff(joints[Math.floor(Math.random() * joints.length)].getWorldPosition(_v).clone(), { color: 0xff8a30, size: .45, grow: -1, life: .28, opacity: .8, additive: true, vel: new THREE.Vector3(rnd(-.4, .4), 1.5, rnd(-.4, .4)) });   // (flickers of fire)
      if (Math.random() < dt * 4) fx.puff(joints[Math.floor(Math.random() * joints.length)].getWorldPosition(_v).clone(), { color: 0x57534e, size: .3, grow: 1.8, life: 1, opacity: .2, soft: true, vel: new THREE.Vector3(rnd(-.3, .3), 1.6, rnd(-.3, .3)) });   // (and a thin wisp of smoke: not a cloud over the wreck)
      if (Math.random() < dt * 5) fx.spark(joints[Math.floor(Math.random() * joints.length)].getWorldPosition(_v).clone());
      cam?.kick?.(.15 + .3 * T / 3.2);
    }
    if (T >= 3.2 && !w.finale) {
      w.finale = true; const at = new THREE.Vector3(w.pos.x, w.pos.y + 3.5, w.pos.z); fx.explosion(at, 2.4, true); cam?.kick?.(.9);
      for (let i = 0; i < 14; i++) fx.spark(at.clone().add(new THREE.Vector3(rnd(-2, 2), rnd(-1, 2), rnd(-2, 2))));
      this.breakUp(w, at);   // (the walker comes apart into its big pieces: legs, arms, the pod, the torso and the hips)
      w.model.visible = false;
    }
  }

  // ---- the wreck: a fresh, unskinned copy of the model is taken apart at the joints into its big pieces (each merged to a few meshes), every piece set where the live one was, scorched, and thrown out of the blast to tumble, bounce and lie
  breakUp(w, at) {
    const fresh = buildWalker({ accent: ACCENT, callsign: w.name, glyph: w.i ? '\u03b2' : '\u03b1' }); w.model.updateMatrixWorld(true);
    const parts = [['pod', 1.1, 5], ['gunR', 1.2, 8], ['drillArm', 1.2, 8], ['legL', 1.9, 9], ['legR', 1.9, 9], ['torso', 1.7, 7], ['hips', 1.5, 4]];   // (name, the size it lies on the ground by, how hard it is thrown; the children first, so a part leaves its parent behind)
    this.wreck ??= []; const burnt = new Map();
    for (const [name, r, kick] of parts) {
      const node = fresh.getObjectByName(name), live = w.model.getObjectByName(name); if (!node || !live) continue;
      node.parent?.remove(node); node.position.set(0, 0, 0); node.quaternion.identity(); node.scale.set(1, 1, 1);
      const h = new THREE.Group(); live.matrixWorld.decompose(h.position, h.quaternion, h.scale); h.add(node);
      h.traverse(m => { if (m.isMesh && m.material) { let b = burnt.get(m.material); if (!b) { b = m.material.clone(); b.color?.multiplyScalar(.42); burnt.set(m.material, b); } m.material = b; } });   // (scorched: one burnt copy of each material, shared, so that parts can be merged)
      h.updateMatrixWorld(true); mergeAcross([h], h);   // (all of a piece's parts that share a material are one mesh: a few draw calls a piece, not dozens)
      const out = _w.set(h.position.x - at.x, 0, h.position.z - at.z); if (out.lengthSq() < .01) out.set(Math.random() - .5, 0, Math.random() - .5); out.normalize();
      this.scene.add(addToLayer(h, REFLECT));
      this.wreck.push({ h, r, v: new THREE.Vector3(out.x * kick * rnd(.6, 1.2), kick * rnd(.9, 1.5) + 3, out.z * kick * rnd(.6, 1.2)), spin: new THREE.Vector3(rnd(-3, 3), rnd(-2, 2), rnd(-3, 3)), owner: w.i, rest: false, smoke: name === 'torso' || name === 'hips' || name === 'pod' ? 11 : 4 });
    }
  }
  // once every piece of a walker lies still, the pieces are merged into a handful of meshes in the world (the pieces keep their places for the smoke): two wrecks cost about a dozen draw calls, not a hundred and fifty
  bakeWreck(i) {
    const mine = this.wreck.filter(f => f.owner === i); if (!mine.length || !mine.every(f => f.rest) || (this.baked ??= {})[i]) return;
    this.baked[i] = true; const frame = new THREE.Group(); frame.name = 'walkerWreck'; this.scene.add(addToLayer(frame, REFLECT)); frame.userData.noWater = true;
    for (const f of mine) f.h.updateMatrixWorld(true); mergeAcross(mine.map(f => f.h), frame); for (const f of mine) this.scene.remove(f.h);
  }
  updateWreck(dt) {
    if (!this.wreck?.length) return;
    for (const i of [0, 1]) if (this.wreck.some(f => f.owner === i)) this.bakeWreck(i);
    for (const f of this.wreck) {
      const p = f.h.position;
      if (!f.rest) {
        f.v.y -= 24 * dt; p.addScaledVector(f.v, dt);
        const sp = f.spin.length(); if (sp > 1e-3) f.h.quaternion.premultiply(_q.setFromAxisAngle(_w.copy(f.spin).normalize(), sp * dt));
        const g = this.groundAt(p.x, p.z);
        if (p.y - f.r * .55 < g) {   // (down: bounce a little, lose speed and spin, then slide to a stop)
          p.y = g + f.r * .55;
          if (f.v.y < -3) { f.v.y *= -.26; f.v.x *= .65; f.v.z *= .65; f.spin.multiplyScalar(.6); this.fx.puff(_v.set(p.x, g + .3, p.z), { color: 0xeef3f8, size: f.r * .6, grow: 3, life: .9, opacity: .6, soft: true, vel: new THREE.Vector3(0, 1.5, 0) }); this.fx.explosion?.(_v.set(p.x, g + .5, p.z), .35); }
          else { f.v.y = 0; const k = Math.exp(-3.2 * dt); f.v.x *= k; f.v.z *= k; f.spin.multiplyScalar(k); if (f.v.lengthSq() < .08 && f.spin.lengthSq() < .05) f.rest = true; }
        }
      }
      if (f.smoke > 0) { f.smoke -= dt; if (Math.random() < dt * 3) this.fx.puff(_v.set(p.x + rnd(-.6, .6), p.y + 1, p.z + rnd(-.6, .6)), { color: 0x3a3835, size: .5, grow: 2.2, life: 1.4, opacity: .28, soft: true, vel: new THREE.Vector3(rnd(-.3, .3), 2, rnd(-.3, .3)) }); if (Math.random() < dt * 2) this.fx.spark(_v.set(p.x, p.y + .5, p.z)); }
    }
  }

  // ---- the health bars: a shield bar over an armour bar for each walker
  updateHud() {
    const show = this.started && !this.walkers.every(w => w.dead && w.dyingT > 4.5);
    if (!show) { if (this.hud) this.hud.root.style.display = 'none'; return; }
    if (!this.hud) {
      const root = document.createElement('div');
      Object.assign(root.style, { position: 'fixed', zIndex: 5, pointerEvents: 'none', display: 'flex', gap: '26px', top: '14px', left: '50%', transform: 'translateX(-50%)', font: '700 13px/1 "Courier New", monospace', color: '#ffe8b4', letterSpacing: '.2em', textShadow: '-1px -1px 0 #0b0e06, 1px -1px 0 #0b0e06, -1px 1px 0 #0b0e06, 1px 1px 0 #0b0e06' });
      const rows = this.walkers.map(w => {
        const col = document.createElement('div'); Object.assign(col.style, { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' });
        const label = document.createElement('div'); label.textContent = tr('WALKER') + ' ' + tr(w.name);
        const mk = (c, h) => { const bar = document.createElement('div'); Object.assign(bar.style, { width: 'min(220px, 28vw)', height: h, background: 'rgba(11,14,6,.75)', border: '2px solid #e8b877', boxShadow: '0 0 0 2px #0b0e06', position: 'relative' }); const f = document.createElement('div'); Object.assign(f.style, { position: 'absolute', left: 0, top: 0, bottom: 0, width: '100%', background: c, transition: 'width .2s' }); bar.appendChild(f); return [bar, f]; };
        const [sb, sf] = mk('#44c8ff', '8px'), [hb, hf] = mk('#e8a030', '12px'); col.append(label, sb, hb); root.appendChild(col); return { sf, hf, col };
      });
      (document.getElementById('frame') ?? document.body).appendChild(root); this.hud = { root, rows };
    }
    this.hud.root.style.display = 'flex';
    this.walkers.forEach((w, i) => { const r = this.hud.rows[i]; r.sf.style.width = (100 * Math.max(0, w.shieldHp) / SHIELD_HP).toFixed(1) + '%'; r.hf.style.width = (100 * Math.max(0, w.raw) / RAW_HP).toFixed(1) + '%'; r.col.style.opacity = w.dead ? .35 : 1; });
  }
}
