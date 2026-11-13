// Stage 4's boss: a Mi-24 "Hind" gunship (assets/mi24.js), fought in three rounds. It hovers over the middle of the arena and sweeps a fan of bullets across it, one after another, and lowers
// six soldiers on ropes from its side doors. At two thirds armour it flies off the screen (and can't be hurt on the way); a little later it comes back from the other side with a new weapon:
// homing missiles from its sides. At one third it leaves again and returns with drones as well: two at a time, a fresh pair 8 s after the last pair is gone. Out of armour it blows up and
// rains wreckage; the arena is won (onDefeat).
// Gameplay stays 2D (the hit boxes are on the ground plane); the helicopter's height is only for the drawing and for where its shots and its rope drops start.
import * as THREE from 'three';
import { buildMi24, poseMi24 } from '../assets/mi24.js';
import { shardGeometry } from './debris.js';
import { BOSS_MISSILE_FLIGHT } from './statues.js';
import { sfx } from './sfx.js';
import { tr } from './lang.js';

const SCALE = .75;            // the model is drawn this much of life size (17.8 m long: the screen is not much wider)
const HOVER_Y = 9;            // m above the ground
const FLY_Y = 17;             // m: flying in and out it is above the cliffs round the arena
const HP = 134;               // a grenade or a rocket's blast does 4, a bullet 1
const SCORE = 10000;
const HIT_L = 4.2, HIT_W = 1.6, HIT_R = 2.2; // m: the hit box's half length and half width (the cabin as drawn: not the rotor or the tail boom) and the blast reach
const ENTER_SPEED = 13, LEAVE_SPEED = 14, HOVER_SPEED = 3.5; // m/s
const SPIN_T = 2.4;           // s it spins out of control, shedding wreckage, before the blast that ends it
const AWAY = 4.5;             // s off the screen between rounds
const FAN = 160 * Math.PI / 180, SHOTS = 9, SHOT_GAP = .2, SHELL_RANGE = 40; // the gun's sweep: the angle it covers, the bullets in it and the time between them
const TROOPS = 6, TROOP_GAP = .42; // soldiers lowered, once in each round, and the pause between them
const ROCKS = 9, ROCK_GAP = .85; // boulders loosened from the cliffs (east, north, west in turn) while it is away, to keep the jeep busy
const MISSILES = 4, MISSILE_GAP = .38;
const DRONE_FIRST = 2.5, DRONE_AGAIN = 8; // s into the last round before the first pair, and after a pair is gone before the next
const PAUSE = [2.3, 1.8, 1.4], GUN_PAUSE = [2.8, 2.4, 2.0]; // s between specials, and between the gun's sweeps
// The rotors' blur: a disc that fades out to a soft edge and in from the hub, with arcs of every length and darkness swept round it (the blades smeared), a faint ring of rust where
// the painted blade tips go round, and a few slow streaks; it turns with the rotor, so the smears shimmer. Drawn once.
let blurTex = null;
function bladeBlurTexture() {
  if (blurTex) return blurTex;
  const S = 512, c = document.createElement('canvas'); c.width = c.height = S; const x = c.getContext('2d'), C = S / 2; let sd = 7; const rnd = () => (sd = (sd * 9301 + 49297) % 233280) / 233280;
  const body = x.createRadialGradient(C, C, C * .1, C, C, C); // (the haze: clear at the hub, thickest about a third of the way out, thinning to nothing at the rim)
  body.addColorStop(0, 'rgba(36,42,34,0)'); body.addColorStop(.14, 'rgba(36,42,34,.10)'); body.addColorStop(.4, 'rgba(36,42,34,.2)'); body.addColorStop(.85, 'rgba(36,42,34,.12)'); body.addColorStop(1, 'rgba(36,42,34,0)');
  x.fillStyle = body; x.fillRect(0, 0, S, S);
  x.lineCap = 'round';
  for (let i = 0; i < 520; i++) { // arcs: a blade's smear round part of the circle
    const r = C * (.16 + Math.pow(rnd(), .8) * .8), a0 = rnd() * 6.283, len = .15 + rnd() * .9, edge = 1 - Math.abs(r / C - .55) * .9;
    x.strokeStyle = `rgba(${28 + rnd() * 22},${34 + rnd() * 22},${28 + rnd() * 16},${(.03 + rnd() * .07) * edge})`; x.lineWidth = 1 + rnd() * 3.5;
    x.beginPath(); x.arc(C, C, r, a0, a0 + len); x.stroke();
  }
  const tip = x.createRadialGradient(C, C, C * .86, C, C, C * .985); // (the tips: a thin ring, brightest at the blade tips' radius)
  tip.addColorStop(0, 'rgba(176,84,40,0)'); tip.addColorStop(.55, 'rgba(176,84,40,.20)'); tip.addColorStop(1, 'rgba(176,84,40,0)'); x.fillStyle = tip; x.fillRect(0, 0, S, S);
  for (let k = 0; k < 5; k++) { // (five faint spokes, one per blade, a little brighter where the blade itself last was)
    x.save(); x.translate(C, C); x.rotate(k * 6.283 / 5 + .3); const g = x.createLinearGradient(C * .15, 0, C * .97, 0); g.addColorStop(0, 'rgba(30,34,28,0)'); g.addColorStop(.5, 'rgba(30,34,28,.16)'); g.addColorStop(1, 'rgba(30,34,28,0)');
    x.fillStyle = g; x.fillRect(C * .15, -3, C * .82, 6); x.restore();
  }
  blurTex = new THREE.CanvasTexture(c); blurTex.anisotropy = 4; return blurTex;
}
const UNDER = 5; // m: a jeep this close (seen from above) to the gun is shot at directly
const BLUR = .95; // the discs' opacity (the texture carries the rest)
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
const ease = x => { x = Math.min(1, Math.max(0, x)); return x * x * (3 - 2 * x); };
const _v = new THREE.Vector3(), _m = new THREE.Vector3();
const r = () => (Math.random() - .5) * 2;

export class HindBoss {
  constructor(scene, fx, debris, enemyFire, statues, dronePads, soldiers, rocks) {
    Object.assign(this, { scene, fx, debris, enemyFire, statues, dronePads, soldiers, rocks });
    this.state = 'idle'; this.hits = 0;
  }

  // box: the arena's bounds; onDefeat(): the fight is won (the stage's clear sequence)
  setup(world, box, onDefeat) {
    this.world = world; this.box = box; this.onDefeat = onDefeat;
    const obj = this.obj = buildMi24(); obj.scale.setScalar(SCALE); obj.position.set(box.x0, 0, box.north - 600); // (parked far out of sight but not hidden: the loading screen compiles its shaders then, not at the first sight of it)
    this.parts = obj.userData.parts;
    for (const m of [this.parts.mainBlur, this.parts.tailBlur]) { m.map = bladeBlurTexture(); m.color.set(0xffffff); m.needsUpdate = true; } // (a drawn blur in place of the plain grey disc)
    obj.traverse(o => { if (o.isMesh) o.castShadow = o.material !== this.parts.mainBlur && o.material !== this.parts.tailBlur; }); this.scene.add(obj); // (the rotors' blur discs are only a faint look: not a solid shadow)
    const body = this.body = obj.getObjectByName('body'), at = (x, y, z) => { const a = new THREE.Object3D(); a.position.set(x, y, z); body.add(a); return a; }; // (in the body's own, ground-level, coordinates)
    this.skin = []; // (the painted hull pieces: their vertex colours are the paint, and are weathered from a copy of the original as the armour goes)
    obj.traverse(o => { if (o.isMesh && [].concat(o.material).some(m => m.vertexColors && m.color.getHex() === 0xffffff) && o.geometry.attributes.color) { const c = o.geometry.attributes.color; if (!o.geometry.userData.base) { o.geometry.userData.base = c.array.slice(); this.skin.push(o); } } });
    this.doorL = at(-1.3, .98, -.2); this.doorR = at(1.3, .98, -.2); // (the doors' sills: where the ropes hang from)
    this.podL = at(-2.6, .95, -.9); this.podR = at(2.6, .95, -.9); // (the wing stations)
    this.engL = at(-.52, 3.1, 1.2); this.engR = at(.52, 3.1, 1.2); // (the exhausts: where the smoke comes out)
    this.bellyL = at(-.7, .7, -.6); this.bellyR = at(.7, .7, -.6);
    this.home = new THREE.Vector3((box.x0 + box.x1) / 2, 0, box.north + (box.south - box.north) * .42);
    this.pos = new THREE.Vector3(); this.vel = new THREE.Vector3(); this.yaw = Math.PI; this.pitch = 0; this.roll = 0; this.spin = 0; this.doorOpen = 0; this.gunYaw = 0; this.sweepDir = 1;
    // (target.bulletK: machine-gun bullets do this share of their usual damage)
    this.target = { object: obj, x: 0, z: 0, hw: HIT_W, hd: HIT_L, r: HIT_R, hp: HP, score: SCORE, immune: true, passWhenImmune: true, bulletK: .4, shardK: .4, die: () => this.die() };
  }

  // The fight starts: it comes in over the arena's north edge.
  begin() {
    if (this.state !== 'idle') return;
    this.phase = 0; this.rockN = ROCKS; this.rockIn = 0; this.t = 0; this.atk = null; this.pause = 1; this.gun = null; this.gunPause = 1; this.alt = FLY_Y; this.troopsDone = false; this.dronesIn = null; this.drones = []; this.dronesSent = 0;
    this.pos.set(this.home.x, 0, this.box.north - 40); this.vel.set(0, 0, 0); this.state = 'enter'; this.obj.visible = true;
    this.world.targets.push(this.target); this.buildHud();
  }

  buildHud() { // a tall bar down the left of the screen, draining from the top, with the thirds marked
    const root = document.createElement('div');
    Object.assign(root.style, { position: 'fixed', zIndex: 5, pointerEvents: 'none', left: '18px', top: '36%', transform: 'translateY(-50%)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px',
      font: '700 14px/1 "Courier New", monospace', color: '#ffe8b4', letterSpacing: '.18em', textShadow: '-1px -1px 0 #0b0e06, 1px -1px 0 #0b0e06, -1px 1px 0 #0b0e06, 1px 1px 0 #0b0e06, 0 2px 3px rgba(0,0,0,.8)' });
    const title = document.createElement('div'); title.textContent = tr('BOSS');
    const bar = document.createElement('div'); Object.assign(bar.style, { width: '14px', height: 'min(320px, 50vh)', background: 'rgba(11,14,6,.75)', border: '2px solid #e8b877', boxShadow: '0 0 0 2px #0b0e06', position: 'relative' });
    const fill = document.createElement('div'); Object.assign(fill.style, { position: 'absolute', left: 0, right: 0, bottom: 0, height: '100%', transition: 'height .2s, background .2s' }); bar.appendChild(fill);
    for (const k of [1 / 3, 2 / 3]) { const n = document.createElement('div'); Object.assign(n.style, { position: 'absolute', left: 0, right: 0, bottom: (k * 100) + '%', height: '2px', background: '#0b0e06' }); bar.appendChild(n); } // (the thirds: where it flies off)
    root.append(title, bar); (document.getElementById('frame') ?? document.body).appendChild(root); this.hud = { root, fill };
  }
  updateHud() {
    if (!this.hud) return; const f = Math.max(0, this.target.hp / HP);
    this.hud.fill.style.height = (f * 100).toFixed(1) + '%'; this.hud.fill.style.background = `hsl(${(108 * f).toFixed(0)}, 70%, 48%)`;
  }

  die() { if (this.state === 'dying' || this.state === 'dead') return; this.target.hp = 0; this.state = 'dying'; this.t = 0; this.dieAt = 0; this.blown = false; this.shedIn = 0; this.blastIn = .1; this.pops = [.14, .28, .42, .62, .85]; } // (the wreck is made in update: this is called from inside the weapons' loops)

  // ---- motion
  fly(dt, tx, tz, top, face) { // eases toward (tx, tz) at up to `top` m/s; the nose toward `face` (a heading) with the lean of its acceleration
    const dx = tx - this.pos.x, dz = tz - this.pos.z, d = Math.hypot(dx, dz), want = Math.min(top, d * 1.3);
    const k = Math.min(1, dt * 1.7), vx = d > .01 ? dx / d * want : 0, vz = d > .01 ? dz / d * want : 0;
    this.vel.x += (vx - this.vel.x) * k; this.vel.z += (vz - this.vel.z) * k;
    this.pos.x += this.vel.x * dt; this.pos.z += this.vel.z * dt;
    this.yaw += wrap(face - this.yaw) * Math.min(1, dt * 1.6);
    const fwd = this.vel.x * -Math.sin(this.yaw) + this.vel.z * -Math.cos(this.yaw), side = this.vel.x * Math.cos(this.yaw) + this.vel.z * -Math.sin(this.yaw);
    this.pitch += (THREE.MathUtils.clamp(fwd * .018, -.3, .3) - this.pitch) * Math.min(1, dt * 3);
    this.roll += (THREE.MathUtils.clamp(side * .025, -.35, .35) - this.roll) * Math.min(1, dt * 3);
    return d;
  }
  towardJeep(player) { return Math.atan2(-(player.position.x - this.pos.x), -(player.position.z - this.pos.z)); }
  immune(on) { this.target.immune = on; }

  update(dt, world, player, killPlayer, cam) {
    if (this.state === 'idle' || this.state === 'dead') return;
    const o = this.obj, canHit = player.enabled && !player.dead;
    this.t += dt; this.spin += dt * 36;
    if (this.state === 'dying') { this.dying(dt); return; }
    if (this.state !== 'away') sfx.chopper('hind', this.pos, 14, true, 1);
    let top = HOVER_SPEED;
    if (this.state === 'enter') {
      const far = Math.hypot(this.home.x - this.pos.x, this.home.z - this.pos.z);
      const d = this.fly(dt, this.home.x, this.home.z, ENTER_SPEED, far > 9 ? Math.atan2(-(this.home.x - this.pos.x), -(this.home.z - this.pos.z)) : this.towardJeep(player));
      if (d < .8) { this.state = 'fight'; this.t = 0; this.immune(false); this.pause = 1.2; this.gunPause = 1.5; }
    } else if (this.state === 'leave') {
      const d = this.fly(dt, this.exit.x, this.exit.z, LEAVE_SPEED, Math.atan2(-(this.exit.x - this.pos.x), -(this.exit.z - this.pos.z)));
      if (d < 3) { this.state = 'away'; this.t = 0; o.visible = false; this.vel.set(0, 0, 0); }
    } else if (this.state === 'away') {
      if (this.t >= AWAY) { // back, from the far side
        this.phase++; const west = this.phase % 2 === 1; // (the first time it went east, so it returns from the west; then the other way round)
        this.pos.set(west ? this.box.x0 - 55 : this.box.x1 + 55, 0, this.box.north - 25); this.vel.set(0, 0, 0); this.yaw = Math.atan2(-(this.home.x - this.pos.x), -(this.home.z - this.pos.z));
        this.state = 'enter'; this.t = 0; this.troopsDone = false; this.atk = null; this.gun = null; this.alt = FLY_Y; o.visible = true;
      }
    } else if (this.state === 'fight') {
      const hold = this.atk && this.atk.kind === 'troops';
      const tx = this.home.x + (hold ? 0 : Math.sin(this.t * .33) * (this.box.x1 - this.box.x0) * .16), tz = this.home.z + (hold ? 0 : Math.sin(this.t * .5 + 1) * 2.5);
      this.fly(dt, hold ? this.pos.x : tx, hold ? this.pos.z : tz, top, this.towardJeep(player));
      this.fight(dt, player, canHit);
    }

    if ((this.state === 'leave' || this.state === 'away') && this.rockN < ROCKS && canHit && (this.rockIn -= dt) <= 0) { this.rockIn = ROCK_GAP; this.rocks.rain(this.box, ['east', 'north', 'west'][this.rockN++ % 3]); }
    const wantAlt = this.state === 'fight' || (this.state === 'enter' && Math.hypot(this.home.x - this.pos.x, this.home.z - this.pos.z) < 16) ? HOVER_Y : FLY_Y; // (down only once over the arena)
    this.alt += (wantAlt - this.alt) * Math.min(1, dt * .9);
    // ---- pose
    const ground = world.heightAt ? world.heightAt(this.pos.x, this.pos.z) : 0;
    o.position.set(this.pos.x, ground + this.alt + Math.sin(this.t * 1.7) * .22, this.pos.z); o.rotation.y = this.yaw;
    this.doorOpen += (((this.atk && this.atk.kind === 'troops' && this.atk.open) ? 1 : 0) - this.doorOpen) * Math.min(1, dt * 2.6);
    poseMi24(o, this.spin, this.pitch, this.roll, .8, this.gunYaw, .55, 1, this.doorOpen);
    this.parts.mainBlur.opacity = BLUR; this.parts.tailBlur.opacity = BLUR; // (the rotors' blur discs: clearly there, still no shadow)
    const sn = Math.abs(Math.sin(this.yaw)), cs = Math.abs(Math.cos(this.yaw)), t = this.target;
    // the hit box sits where the model is SEEN, not under it: the spot on the ground (at the shots' height) that lies on the camera's line of sight to the cabin, a little toward the nose
    const c = cam.camera.position, mid = _v.set(o.position.x - Math.sin(this.yaw) * .6, o.position.y + 1.6 * SCALE, o.position.z - Math.cos(this.yaw) * .6), kk = (1 - c.y) / (mid.y - c.y);
    t.x = c.x + (mid.x - c.x) * kk; t.z = c.z + (mid.z - c.z) * kk; t.hw = cs * HIT_W + sn * HIT_L; t.hd = sn * HIT_W + cs * HIT_L; t.r = Math.max(t.hw, t.hd) - 1.2; // (a grenade bursts the moment it is over the box's edge, and its blast is 1.8 m: the target's own reach must cover the rest, or a hit there does nothing)
    this.updateHud();
    // hurt: below two thirds of its armour one engine smokes, below one third both pour black smoke and burn; crossing each line it is rocked by a blast that flings plating off
    const f = t.hp / HP, level = f < 1 / 3 ? 2 : f < 2 / 3 ? 1 : 0;
    if (level > (this.hurt ?? 0) && this.state !== 'away') this.damageBurst(level);
    this.hurt = Math.max(this.hurt ?? 0, level);
    if (level && this.state !== 'away') {
      for (const [k, eng] of [this.engL, this.engR].entries()) {
        if (level === 1 && k) continue;
        if (Math.random() > dt * (level === 1 ? 9 : 16)) continue;
        const e = eng.getWorldPosition(new THREE.Vector3());
        this.fx.puff(e, { color: level === 1 ? 0x4a4642 : 0x16130f, size: level === 1 ? .6 : .85, grow: 3, life: 2.4, opacity: level === 1 ? .5 : .7, vel: new THREE.Vector3(r() * .5 + this.vel.x * -.3, 1.2, r() * .5 + this.vel.z * -.3 + .6) });
        if (level === 2 && Math.random() < .6) this.fx.puff(e.clone(), { color: Math.random() < .5 ? 0xff8a1e : 0xffd060, size: .55, grow: 2, life: .3, opacity: .85, additive: true, vel: new THREE.Vector3(r() * .6, .8, r() * .6) });
      }
      if (level === 2 && Math.random() < dt * 5) this.fx.puff(this.engL.getWorldPosition(new THREE.Vector3()).add(_v.set(r(), r() * .5, r())), { color: 0xfff0b0, size: .1, grow: 0, life: .5, opacity: 1, additive: true, gravity: 10, vel: new THREE.Vector3(r() * 3, 2 + Math.random() * 3, r() * 3) }); // (sparks)
    }
  }
  // Soot and scorching worked into the paint (its vertex colours), by position on the airframe so it never repeats: smooth blotches, streaks swept back along the fuselage, and a heavy scorch round the engines.
  weather(level) {
    const body = this.body; this.obj.updateMatrixWorld(true);
    const inv = new THREE.Matrix4(), p = new THREE.Vector3(), e = [this.engL, this.engR].map(o => body.worldToLocal(o.getWorldPosition(new THREE.Vector3())));
    inv.copy(body.matrixWorld).invert();
    const hash = (x, y, z) => { const h = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return h - Math.floor(h); };
    const lerp = (a, b, t) => a + (b - a) * t, fade = t => t * t * (3 - 2 * t);
    const noise = (x, y, z) => { const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z), fx = fade(x - ix), fy = fade(y - iy), fz = fade(z - iz); let v = 0;
      for (let i = 0; i < 8; i++) { const dx = i & 1, dy = (i >> 1) & 1, dz = (i >> 2) & 1; v += hash(ix + dx, iy + dy, iz + dz) * (dx ? fx : 1 - fx) * (dy ? fy : 1 - fy) * (dz ? fz : 1 - fz); } return v; };
    const fbm = (x, y, z) => noise(x, y, z) * .6 + noise(x * 2.3, y * 2.3, z * 2.3) * .4;
    const sm = (a, b, t) => fade(Math.min(1, Math.max(0, (t - a) / (b - a))));
    for (const o of this.skin) {
      const c = o.geometry.attributes.color, base = o.geometry.userData.base, pos = o.geometry.attributes.position, m = new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld);
      for (let i = 0; i < pos.count; i++) {
        p.fromBufferAttribute(pos, i).applyMatrix4(m);
        const blot = sm(.5, .75, fbm(p.x * .8 + 3, p.y * .8, p.z * .8)), streak = sm(.55, .8, fbm(p.x * 2.2, p.y * 2.2 + 9, p.z * .3)); // (streaks are stretched along the fuselage)
        let burn = 0; for (const q of e) burn = Math.max(burn, 1 - sm(.4, 3.2, Math.hypot(p.x - q.x, p.y - q.y, (p.z - q.z) * .5)));
        const soot = Math.min(1, (blot * .55 + streak * .45) * (.5 + level * .35) + burn * (.35 + level * .35)), warm = burn * .5; // (darker toward black, a brown cast in the hottest places)
        const k = 1 - soot * .78;
        for (let j = 0; j < 3; j++) { const v = base[i * c.itemSize + j] * k * (j === 0 ? 1 : 1 - warm * (j === 1 ? .12 : .3)); c.array[i * c.itemSize + j] = v; }
      }
      c.needsUpdate = true;
    }
  }
  // It has just fallen below a line: a blast at an engine, and plating torn off and thrown clear.
  damageBurst(level) {
    this.weather(level);
    const at = (level === 1 ? this.engL : this.engR).getWorldPosition(new THREE.Vector3());
    this.fx.explosion(at.clone(), .9 + level * .2); this.fx.smoke?.(at.clone(), 3);
    const mat = new THREE.MeshStandardMaterial({ color: 0x4b5836, roughness: .7, metalness: .3, flatShading: true, side: THREE.DoubleSide });
    for (let k = 0; k < 5 + level * 3; k++) {
      const m = new THREE.Mesh(shardGeometry(.5 + Math.random() * .5, .06, .4 + Math.random() * .4), mat); m.position.copy(at).add(_v.set(r() * .5, r() * .3, r() * .5)); m.castShadow = true; this.scene.add(m);
      this.debris.launch(m, new THREE.Vector3(r() * 7, 3 + Math.random() * 5, r() * 7), new THREE.Vector3(r() * 14, r() * 14, r() * 14), .05);
    }
  }

  // ---- the fight: the gun sweeps all the time (a pause between sweeps); alongside it one special at a time: the six soldiers first, then (from the second round) missiles, the thirds, the drones
  fight(dt, player, canHit) {
    const t = this.target, ph = this.phase;
    if (ph < 2 && t.hp <= HP * (1 - (ph + 1) / 3)) { this.leave(); return; }
    if (ph === 2) this.droneWave(dt, canHit);
    if (!canHit) { this.gunYaw += (0 - this.gunYaw) * Math.min(1, dt * 4); return; }
    const g = this.gun;
    if (g) { // a sweep in progress
      g.t += dt; while (g.n < SHOTS && g.t >= g.n * SHOT_GAP) this.shootFan(g, g.n++);
      if (g.n >= SHOTS && g.t > SHOTS * SHOT_GAP + .2) { this.gun = null; this.gunPause = GUN_PAUSE[ph]; }
    } else {
      this.gunYaw += (0 - this.gunYaw) * Math.min(1, dt * 4);
      if (!(this.atk && this.atk.kind === 'missiles') && (this.gunPause -= dt) <= 0) { // (never at the same time as a missile salvo)
        const j = this.enemyFire.aimAgo(.2, _m); this.sweepDir = -this.sweepDir; // (one sweep goes left to right, the next back)
        this.gun = { t: 0, n: 0, base: Math.atan2(j.z - this.pos.z, j.x - this.pos.x), dir: this.sweepDir };
      }
    }
    if (!this.atk) {
      if ((this.pause -= dt) > 0) return;
      const kind = !this.troopsDone ? 'troops' : ph >= 1 ? 'missiles' : null; // (the six soldiers come once in each round)
      if (!kind || (kind === 'missiles' && this.gun)) return; // (a salvo waits for the sweep in progress to finish)
      if (kind === 'troops') this.troopsDone = true;
      this.atk = { kind, t: 0, n: 0, open: false };
    }
    const a = this.atk; a.t += dt;
    if (a.kind === 'troops') {
      a.open = a.t < .7 + TROOPS * TROOP_GAP + .5; // (doors open, the ropes go down one by one, then the doors shut)
      while (a.n < TROOPS && a.t >= .8 + a.n * TROOP_GAP) { this.soldiers.arenaBox = this.box; this.soldiers.lower(a.n % 2 ? this.doorR : this.doorL, 4, 3.2, a.n * Math.PI * 2 / TROOPS + Math.random() * .4); a.n++; } // (each runs off in his own direction on landing)
      if (a.t > .8 + TROOPS * TROOP_GAP + .9) this.endAttack();
    } else if (a.kind === 'missiles') {
      while (a.n < MISSILES && a.t >= .5 + a.n * MISSILE_GAP) this.launchMissile(a.n++);
      if (a.t > .5 + MISSILES * MISSILE_GAP + .6) this.endAttack();
    }
  }
  endAttack() { this.atk = null; this.pause = PAUSE[this.phase]; }

  muzzle(out) { this.obj.updateMatrixWorld(true); return this.parts.gp.localToWorld(out.set(0, 0, -1)); }
  shootFan(a, i) { // bullet i of the sweep: its angle runs across FAN, either way round
    const ang = a.base + a.dir * (-FAN / 2 + FAN * i / (SHOTS - 1)), m = this.muzzle(new THREE.Vector3());
    this.gunYaw = THREE.MathUtils.clamp(wrap(Math.atan2(-Math.cos(ang), -Math.sin(ang)) - this.yaw), -1.2, 1.2); // (the turret follows the sweep, as far as it turns)
    // the bullet comes down to the jeep's height just as it reaches the jeep's distance (a little past, to the ground), and only hurts it down there: no hit while it is still high overhead
    const j = this.enemyFire.aimAgo(.2, _m), range = Math.max(3, Math.hypot(j.x - m.x, j.z - m.z) * 1.125);
    const near = Math.hypot(j.x - m.x, j.z - m.z) < UNDER; // (the jeep right underneath: the fan would pass it by, so each bullet is aimed straight at it: where it is now, led by the way it is moving, scattered a little, and the bullet counts as a hit from further out)
    if (near) {
      const now = this.enemyFire.aimAgo(0, new THREE.Vector3()), was = this.enemyFire.aimAgo(.25, new THREE.Vector3()), fly = Math.hypot(now.x - m.x, now.z - m.z) / 13.5 + .1;
      const tx = now.x + (now.x - was.x) * 4 * fly + r() * .5, tz = now.z + (now.z - was.z) * 4 * fly + r() * .5;
      this.enemyFire.shoot(m, Math.max(1.5, Math.hypot(tx - m.x, tz - m.z) * 1.1), _v.set(tx, 0, tz));
      this.enemyFire.shells[this.enemyFire.shells.length - 1].pad = .9;
    } else this.enemyFire.shoot(m, range, _v.set(m.x + Math.cos(ang) * 40, 0, m.z + Math.sin(ang) * 40));
    this.enemyFire.shells[this.enemyFire.shells.length - 1].hitY = 2;
  }
  launchMissile(n) { // from the wing station (port, starboard, port...), leaving sideways and then turning in on the jeep
    const side = n % 2 ? 1 : -1, from = (side < 0 ? this.podL : this.podR).getWorldPosition(new THREE.Vector3()); // (side: -1 port, +1 starboard; the nose is -Z, a heading's yaw turns it)
    this.obj.updateMatrixWorld(true);
    const at = this.enemyFire.aimAgo(.5, new THREE.Vector3()); // (it leaves toward its side but already half toward the jeep, and turns hard: a jeep standing still is caught, not circled)
    this.statues.shoot(from, Math.atan2(-(at.x - from.x), -(at.z - from.z)) - side * 55 * Math.PI / 180, at, this.world, BOSS_MISSILE_FLIGHT);
    this.statues.missiles[this.statues.missiles.length - 1].turn = 3.2;
  }

  droneWave(dt, canHit) { // two at a time: the next pair 8 s after the last is gone
    this.drones = this.drones.filter(d => d.state !== 'dead');
    if (this.drones.length || !canHit) return;
    if (this.dronesIn === null) this.dronesIn = this.dronesSent ? DRONE_AGAIN : DRONE_FIRST;
    if ((this.dronesIn -= dt) > 0) return;
    this.dronesIn = null; this.dronesSent++;
    for (const [i, belly] of [this.bellyL, this.bellyR].entries()) { const p = belly.getWorldPosition(new THREE.Vector3()); this.drones.push(this.dronePads.release(p.x, p.y, p.z, i, this.yaw)); }
  }

  leave() {
    this.state = 'leave'; this.t = 0; this.atk = null; this.gun = null; this.rockN = 0; this.rockIn = .3; this.immune(true); this.gunYaw = 0;
    const east = this.phase % 2 === 0; this.exit = { x: east ? this.box.x1 + 55 : this.box.x0 - 55, z: this.box.north - 25 };
  }

  // ---- the end: it spins out of control for a couple of seconds, shedding wreckage and burning, then blows apart
  dying(dt) {
    this.dieAt += dt; const T = this.dieAt, o = this.obj;
    if (!this.cleared) { // the moment its armour is gone everything hostile in the arena goes with it (it must not kill the jeep as it falls): shells, missiles, drones, soldiers on the ground and on their ropes, boulders
      this.cleared = true; this.enemyFire.clear(true); this.statues.clear(this.world); this.dronePads.popFree(); this.onDown?.();
    }
    if (!this.blown) {
      const k = Math.min(1, T / SPIN_T), world = this.world;
      this.yaw += (3 + 8 * k * k) * dt; this.alt -= (1.1 + 2.2 * k) * dt; // (turning faster and faster, sinking)
      this.pos.x += this.vel.x * dt; this.pos.z += this.vel.z * dt; this.vel.multiplyScalar(1 - dt * .4);
      this.pitch = .3 * Math.sin(T * 3.1) + .3 * k; this.roll = .75 * Math.sin(T * 4.3 + 1) * (.4 + k);
      const ground = world.heightAt ? world.heightAt(this.pos.x, this.pos.z) : 0;
      o.position.set(this.pos.x, ground + Math.max(2.5, this.alt), this.pos.z); o.rotation.y = this.yaw;
      this.spin += dt * 20; poseMi24(o, this.spin, this.pitch, this.roll, .8, 0, .55, 1, 0);
      this.shed ??= new Set(); this.parts.mainBlur.opacity = BLUR * (1 - k * .6); this.parts.tailBlur.opacity = this.shed.has(this.parts.tail) ? 0 : BLUR * (1 - k * .6); // (the blur fades as the blades slow and break)
      this.obj.updateMatrixWorld(true);
      if (T > .9 && !this.shed.has(this.parts.tail)) this.shedPart(this.parts.tail);
      if (T > 1.5) for (const d of this.parts.doors) if (!this.shed.has(d.up)) { this.shedPart(d.up); this.shedPart(d.rp); }
      if ((this.shedIn -= dt) <= 0) { // plates torn off, flung out as it turns
        this.shedIn = .06 + Math.random() * .06;
        const mats = this.shardMats ??= ['0x4b5836', '0x3d4630', '0x1c1d1b', '0x6a5a3b', '0x8a8d90'].map(c => new THREE.MeshStandardMaterial({ color: +c, roughness: .7, metalness: .3, flatShading: true, side: THREE.DoubleSide }));
        const a = Math.random() * 6.283, sz = .3 + Math.random() * .6, m = new THREE.Mesh(shardGeometry(sz * 1.3, .07, sz), mats[Math.floor(Math.random() * mats.length)]);
        m.position.copy(o.position).add(_v.set(Math.cos(a) * 2.5, r() * .8, Math.sin(a) * 2.5)); this.scene.add(m);
        this.debris.launch(m, new THREE.Vector3(Math.cos(a + 1.2) * (6 + Math.random() * 8), 1 + Math.random() * 6, Math.sin(a + 1.2) * (6 + Math.random() * 8)), new THREE.Vector3(r() * 16, r() * 16, r() * 16), .05);
      }
      if ((this.blastIn -= dt) <= 0) { this.blastIn = .28 + Math.random() * .22; this.fx.explosion(o.position.clone().add(_v.set(r() * 2.5, 1 + r() * .8, r() * 2.5)), .6 + Math.random() * .6); } // (blasts going off in it)
      for (const eng of [this.engL, this.engR]) {
        if (Math.random() > dt * 22) continue; const e = eng.getWorldPosition(new THREE.Vector3()); // (a trail of black smoke and flame behind it)
        this.fx.puff(e, { color: 0x16130f, size: .9, grow: 3, life: 2.4, opacity: .7, vel: new THREE.Vector3(r() * .6, 1, r() * .6) });
        if (Math.random() < .7) this.fx.puff(e.clone(), { color: Math.random() < .5 ? 0xff8a1e : 0xffd060, size: .6, grow: 2.2, life: .35, opacity: .9, additive: true, vel: new THREE.Vector3(r() * .8, .6, r() * .8) });
      }
      if (T >= SPIN_T) { this.blown = true; this.blowUp(); this.dieAt = 0; }
      return;
    }
    this.immune(true);
    while (this.pops.length && T >= this.pops[0]) { // the fireball goes on: blasts all over where it was
      this.pops.shift(); this.fx.explosion(_v.set(this.blastAt.x + r() * 3.5, this.blastAt.y + r() * 1.8, this.blastAt.z + r() * 3.5).clone(), 1.2 + Math.random() * .8);
    }
    if (T > 1.4) { this.state = 'dead'; this.hud?.root.remove(); this.hud = null; this.onDefeat?.(); }
  }
  shedPart(p) { this.shed.add(p); this.scene.attach(p); this.debris.launch(p, new THREE.Vector3(r() * 9, 4 + Math.random() * 6, r() * 9), new THREE.Vector3(r() * 12, r() * 12, r() * 12), .25); }
  blowUp() {
    const o = this.obj, at = this.blastAt = o.position.clone(); at.y += 1.2; this.drones.length = 0;
    const i = this.world.targets.indexOf(this.target); if (i >= 0) this.world.targets.splice(i, 1);
    this.fx.explosion(at.clone(), 3, true); this.fx.flash?.(at.clone(), 5); this.fx.smoke(at.clone().setY(at.y - 1), 10);
    // the big parts fly off whole: the main rotor, tail rotor, chin gun and the doors
    const big = [this.parts.rotor, this.parts.tail, this.parts.gun, ...this.parts.doors.flatMap(d => [d.up, d.rp])].filter(p => !this.shed?.has(p)); // (the tail and doors may be gone already)
    this.parts.mainBlur.opacity = this.parts.tailBlur.opacity = 0;
    for (const p of big) {
      this.scene.attach(p); this.debris.launch(p, new THREE.Vector3(r() * 11, 7 + Math.random() * 9, r() * 11), new THREE.Vector3(r() * 12, r() * 12, r() * 12), .25);
    }
    // and the rest of it in plates and lumps of every size: olive, dark and bare metal
    const mats = ['0x4b5836', '0x3d4630', '0x1c1d1b', '0x6a5a3b', '0x8a8d90'].map(c => new THREE.MeshStandardMaterial({ color: +c, roughness: .7, metalness: .3, flatShading: true, side: THREE.DoubleSide }));
    for (let k = 0; k < 90; k++) {
      const s = (k < 14 ? 1.1 : k < 40 ? .6 : .3) * (.6 + Math.random() * .8), m = new THREE.Mesh(shardGeometry(s * 1.3, .07 + Math.random() * .1, s), mats[k % mats.length]);
      m.position.copy(at).add(_v.set(r() * 3.5, r() * 1.4, r() * 4.5)); m.castShadow = k < 40; this.scene.add(m);
      const a = Math.random() * 6.283, v = 5 + Math.random() * 13;
      this.debris.launch(m, new THREE.Vector3(Math.cos(a) * v, 4 + Math.random() * 12, Math.sin(a) * v), new THREE.Vector3(r() * 16, r() * 16, r() * 16), .05);
    }
    o.visible = false; this.scene.remove(o);
    this.enemyFire.clear(true); this.statues.clear(this.world); this.dronePads.popFree();
  }
}
