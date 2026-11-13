// Stage 6's gate fight: the two cannon towers of the arena gate (arena-gate.js) are enemies. Each takes seven hits of an explosive (grenade or rocket, 4 of its 28 hit points a blast; bullets do nothing) and is not a boss: nothing locks.
//  - the cannons turn to follow the jeep and, when it is on screen, charge (their coils flare) and fire a plasma bolt at it, a teal-white bolt that flies straight at the place the jeep is heading and comes down on the ground;
//  - a bolt that touches the jeep destroys it; one that lands burns a patch of plasma fire there for about six seconds (a cold blue-violet column of flame, nothing like the orange of burning wreckage) and the jeep is destroyed on touching it;
//  - while the red curtain is up it destroys the jeep on contact;
//  - once the jeep has driven past z -458, light tanks come up from below the screen to help, never more than two of them alive at once, until both cannons are down;
//  - both down: the curtain fades out and the gate is open.
// The two armour bars of the cannons are pinned along the top of the screen from when the jeep comes near.
import * as THREE from 'three';
import { HALF_LEN, HALF_WID } from './player.js';
import { LIGHT_FOOTPRINT } from './tanks.js';
import { addToLayer, REFLECT } from './layers.js';
import { PUDDLE } from './puddles.js';
import { sfx } from './sfx.js';
import { tr } from './lang.js';

const HP = 28, BLAST = 4, RELOAD = [2.0, 3.0], AIM_LEAD = .3, RESPAWN_WAIT = [10, 14], CHARGE = .65, BOLT_SPEED = 32, RANGE = 46, TURN = 2.6, AIM_LIMIT = 1.35;
const FIRE_LIFE = 6, FIRE_R = 1.7, SUMMON_Z = -458, SUMMON_MAX = 2, SUMMON_EVERY = [4, 7], HUD_Z = -440;

// ---- the plasma impact, after a micro-plasma burst: a ring of glowing embers on the road; at its heart a white-hot core, pink and violet at the rim, and from it a spire of thin electric tendrils, cyan and violet, writhing upward; a soft glow on the road and sparks drifting off it.
const NOISE = /* glsl */`
float ph( vec2 p ) { return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453 ); }
float pn( vec2 p ) { vec2 i = floor( p ), f = fract( p ), u = f * f * ( 3.0 - 2.0 * f ); return mix( mix( ph( i ), ph( i + vec2( 1.0, 0.0 ) ), u.x ), mix( ph( i + vec2( 0.0, 1.0 ) ), ph( i + vec2( 1.0, 1.0 ) ), u.x ), u.y ); }
float fbm( vec2 p ) { float v = 0.0, a = 0.5; for ( int i = 0; i < 4; i++ ) { v += a * pn( p ); p *= 2.1; a *= 0.5; } return v; }`;
const BILLBOARD = `varying vec2 vUv;
  void main() {
    vUv = uv;
    vec4 mv = modelViewMatrix * vec4( 0.0, 0.0, 0.0, 1.0 );
    vec3 sc = vec3( length( modelMatrix[0].xyz ), length( modelMatrix[1].xyz ), 1.0 );
    float up = ( viewMatrix * vec4( 0.0, 1.0, 0.0, 0.0 ) ).y < 0.0 ? -1.0 : 1.0; // (the puddle mirror's camera is upside down: the spire still grows toward world-up)
    mv.xy += vec2( position.x, position.y * up ) * sc.xy; mv.z += 0.6;
    gl_Position = projectionMatrix * mv;
  }`;
const shaderMat = fragment => new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  uniforms: { uTime: { value: 0 }, uAmt: { value: 0 }, uSeed: { value: Math.random() * 30 } }, vertexShader: BILLBOARD, fragmentShader: NOISE + 'uniform float uTime, uAmt, uSeed; varying vec2 vUv;\n' + fragment });
// the spire: six thin filaments that wander about the axis, bright and narrow low down, fading and swaying wider toward the tip. Its motion is a flame's, not a wave's: the shape of each filament is fixed and only flutters sideways
// (turbulence, stronger toward the tip); lighter and darker patches of plasma RISE along it, so it looks to flow upward; and the tips lick, each one growing and shortening at its own pace.
const spireMat = () => shaderMat(`void main() {
  float y = vUv.y, x = ( vUv.x - .5 ) * 2.0, env = smoothstep( 0.0, .05, y ), acc = 0.0, hot = 0.0;
  for ( int k = 0; k < 6; k ++ ) {
    float fk = float( k ), ph0 = uSeed + fk * 1.7, amp = ( .1 + .55 * y ) * ( .55 + .45 * pn( vec2( fk * 3.1, uSeed ) ) );
    float turb = ( fbm( vec2( y * 2.2 + fk * 9.0, uTime * 2.4 + ph0 ) ) - .45 ) * 1.5 * pow( y, 1.1 );   // sideways flutter, wide and not periodic
    float gust = ( fbm( vec2( uTime * 1.2 + uSeed, 3.0 ) ) - .5 ) * 1.0 * y;                              // the whole spire leaning with a gust, all together
    float ph1 = ph0 + ( pn( vec2( uTime * .6 + fk * 2.1, uSeed ) ) - .5 ) * 4.2;                       // each filament's curl slowly changes shape (a drift in its phase, not a wave running up it)
    float cx = sin( y * ( 5.0 + fk * 1.3 ) + ph1 ) * amp + turb + gust;
    float w = ( .04 + .05 * ( 1.0 - y ) ) * ( 1.0 + .25 * pn( vec2( uTime * 4.0 + fk, ph0 ) ) ), d = abs( x - cx );
    float rise = .4 + .8 * smoothstep( .25, .75, fbm( vec2( fk * 7.0 + 3.0, y * 3.2 - uTime * 2.4 + ph0 ) ) );      // patches of brighter plasma flowing up the filament
    float tip = .6 + .36 * pn( vec2( fk * 5.3, uTime * .9 + uSeed ) ), life = 1.0 - smoothstep( tip - .3, tip, y );    // its tip, licking
    acc += exp( - d * d / ( w * w ) ) * rise * life; hot += exp( - d * d / ( w * w * 18.0 ) ) * .35 * life;
  }
  float a = clamp( ( acc * .9 + hot ) * env * uAmt, 0.0, 1.0 );
  vec3 col = mix( vec3( .35, .2, 1.0 ), vec3( .2, .85, 1.0 ), clamp( acc, 0.0, 1.0 ) ); col = mix( col, vec3( 1.0, .92, 1.0 ), clamp( acc - .6, 0.0, 1.0 ) );
  gl_FragColor = vec4( col * a * 1.5, a );
}`);
// the core: white-hot at the middle, pink then violet toward the rim, a halo round it, flickering
const coreMat = () => shaderMat(`void main() {
  vec2 p = ( vUv - .5 ) * 2.0; float r = length( p ), fl = .85 + .15 * sin( uTime * 23.0 + uSeed ) + .1 * pn( vec2( uTime * 6.0, uSeed ) );
  float core = exp( - r * r * 7.0 ), halo = exp( - r * r * 1.8 );
  vec3 col = mix( vec3( .5, .22, 1.0 ), vec3( 1.0, .62, .95 ), smoothstep( .1, .6, core ) ); col = mix( col, vec3( 1.0, .97, 1.0 ), smoothstep( .55, 1.0, core ) );
  float a = ( core * 1.1 + halo * .45 ) * uAmt * fl;
  gl_FragColor = vec4( col * a * 1.4, clamp( a, 0.0, 1.0 ) );
}`);
const glowMatGround = () => new THREE.ShaderMaterial({ // the light on the road: soft all the way out
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uTime: { value: 0 }, uAmt: { value: 0 }, uSeed: { value: Math.random() * 30 } },
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 ); }',
  fragmentShader: NOISE + `uniform float uTime, uAmt, uSeed; varying vec2 vUv;
    void main() {
      vec2 p = ( vUv - .5 ) * 2.0; float r = length( p ), n = .75 + .25 * pn( p * 3.0 + vec2( uTime * 1.5, uSeed ) );
      float a = exp( - r * r * 3.0 ) * n * uAmt * .55;
      gl_FragColor = vec4( mix( vec3( 1.0, .55, .95 ), vec3( .4, .15, 1.0 ), smoothstep( .05, .75, r ) ) * a, a );
    }` });
// the ring of glowing embers on the road (hot orange-yellow, broken, a few variants), painted once
const CRATER_R = 2.7; // m
const craterTextures = [];
function craterTexture(variant) {
  if (craterTextures[variant]) return craterTextures[variant];
  let seed = 977 + variant * 131; const r = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const S = 384, c = document.createElement('canvas'); c.width = c.height = S; const rx = c.getContext('2d'), C = S / 2;
  for (let k = 0; k < 240; k++) {
    const a = r() * Math.PI * 2, rad = C * (.3 + (r() - .5) * .08 + (r() < .3 ? r() * .05 : 0)), on = Math.sin(a * 7 + variant) + Math.sin(a * 3.3) * .6 > -.5; if (!on && r() < .8) continue;
    const px = C + Math.cos(a) * rad, py = C + Math.sin(a) * rad, rr = 1.4 + r() * 3.4, hot = r();
    const gg = rx.createRadialGradient(px, py, 0, px, py, rr * 2.2); gg.addColorStop(0, hot > .6 ? 'rgba(255,230,140,1)' : 'rgba(255,150,40,1)'); gg.addColorStop(.4, 'rgba(255,110,20,.55)'); gg.addColorStop(1, 'rgba(255,90,10,0)'); rx.fillStyle = gg; rx.fillRect(px - rr * 2.2, py - rr * 2.2, rr * 4.4, rr * 4.4);
  }
  const t = new THREE.CanvasTexture(c); t.anisotropy = 4;
  return (craterTextures[variant] = { ring: t });
}
const craterGeo = new THREE.PlaneGeometry(CRATER_R * 2, CRATER_R * 2).rotateX(-Math.PI / 2);
const flatGeo = new THREE.PlaneGeometry(1, 1).translate(0, .5, 0), centredGeo = new THREE.PlaneGeometry(1, 1), groundGeo = new THREE.PlaneGeometry(FIRE_R * 3.6, FIRE_R * 3.6).rotateX(-Math.PI / 2);

// ---- the bolt: a white-hot core in a violet glow, with a streak behind it
const boltCore = new THREE.MeshBasicMaterial({ color: 0xf2ffff }), boltGlow = new THREE.MeshBasicMaterial({ color: 0x18b8f0, transparent: true, opacity: .7, blending: THREE.AdditiveBlending, depthWrite: false });
const boltTrail = new THREE.MeshBasicMaterial({ color: 0x38e8ff, transparent: true, opacity: .55, blending: THREE.AdditiveBlending, depthWrite: false });
const coreGeo = new THREE.SphereGeometry(.2, 12, 10), glowGeo = new THREE.SphereGeometry(.52, 12, 10), trailGeo = new THREE.CylinderGeometry(.02, .28, 3.2, 10, 1, true).rotateX(Math.PI / 2).translate(0, 0, 1.7);

const rnd = (a, b) => a + Math.random() * (b - a);

export class GateFight {
  // gate: the ArenaGate; world: the level; scene
  constructor(gate, world, scene) {
    this.gate = gate; this.world = world; this.scene = scene;
    this.bolts = []; this.fires = []; this.summoned = []; this.summonIn = 0; this.done = false; this.hud = null; this.prev = null; this.vel = new THREE.Vector3(); this.time = 0; this.hudHide = 0;
    this.cannons = gate.towerList.map(({ side, group, obstacle }, i) => {
      const head = group.getObjectByName('head'), c = { i, side, group, head, muzzle: head.getObjectByName('muzzle'), hp: HP, maxHp: HP, dead: false, reload: rnd(1, 2.4), charge: 0, aim: 0, smokeIn: 0 };
      const R = gate.towerW / 2 + .3;
      c.target = { object: group, x: group.position.x, z: gate.z, hw: R, hd: R, r: 2.3, hp: HP, score: 3000, bulletProof: true, oncePerVolley: 2, boom: true, solidWreck: true, obstacle, asleep: false,
        onHurt: () => { c.hp = c.target.hp; },
        wreck: (debris, fx) => this.destroyCannon(c, debris, fx) };
      obstacle.isTarget = true;
      world.targets.push(c.target);
      return c;
    });
  }

  alive() { return this.cannons.filter(c => !c.dead).length; }

  // Saved games: each cannon's hit points (a destroyed one stays destroyed) and whether the gate is open. Tanks, bolts and fires in flight are not kept: the fight carries on from its state.
  snapshot() { return { cannons: this.cannons.map(c => ({ hp: c.dead ? 0 : c.target.hp })), done: this.done }; }
  restore(data, fx) {
    if (!data) return;
    data.cannons?.forEach((d, i) => {
      const c = this.cannons[i]; if (!c) return;
      c.target.hp = d.hp; c.hp = d.hp;
      if (d.hp <= 0) { // destroyed: as it ends up (the cannon gone from its tower, a stump burning), without the blast and the flying plates
        c.dead = true; c.charge = 0; c.head.visible = false; c.target.obstacle.isTarget = false;
        const at = c.head.getWorldPosition(new THREE.Vector3()); fx?.fires?.start([at.clone().setY(at.y - .2)], .9, 30);
      }
    });
    if (data.done) { this.done = true; this.gate.openNow(); }
  }

  // ---- one frame. env: { player, cam, killPlayer, fx, debris, tanks, sfx }
  update(dt, env) {
    const { player, cam, killPlayer, fx, tanks } = env; this.fx = fx; this.debris = env.debris;
    this.time += dt;
    const can = player.enabled && !player.dead, z = player.position.z, g = this.gate;
    // the jeep can be destroyed once a frame at most: the curtain, a bolt in flight and a fire may all catch it in the same frame, and each would take a life
    this.live = can; const kill = () => { if (!this.live) return; this.live = false; killPlayer(); };
    if (can) { // the jeep's velocity, smoothed: where the bolts are aimed ahead of it
      if (this.prev) { const k = Math.min(1, dt * 6); this.vel.x += ((player.position.x - this.prev.x) / Math.max(dt, 1e-3) - this.vel.x) * k; this.vel.z += ((player.position.z - this.prev.z) / Math.max(dt, 1e-3) - this.vel.z) * k; }
      this.prev = (this.prev ?? new THREE.Vector3()).copy(player.position);
    } else { this.prev = null; this.vel.set(0, 0, 0); }

    // the curtain kills on contact
    if (can && !g.isOpen && g.opening === undefined && Math.abs(z - g.z) < HALF_LEN * .8 && Math.abs(player.position.x) < g.halfGap - .2 && !player.invulnerable) kill();

    for (const c of this.cannons) this.updateCannon(c, dt, player, cam, can);
    this.updateBolts(dt, player, kill);
    this.updateFires(dt, player, kill);

    // light tanks from below the screen once the jeep is past z -458, until both cannons are down
    if (!this.done && this.alive() === 0) { this.done = true; g.open(); this.hudHide = 2.2; }
    if (!this.done && can && z < SUMMON_Z) {
      const before = this.summoned.length; this.summoned = this.summoned.filter(t => t.state !== 'dead');
      if (this.summoned.length < before) this.summonIn = Math.max(this.summonIn, rnd(...RESPAWN_WAIT)); // (a tank was destroyed: the next one comes after a longer wait)
      if ((this.summonIn -= dt) <= 0 && this.summoned.length < SUMMON_MAX) { this.summon(tanks, player, cam); this.summonIn = rnd(...SUMMON_EVERY); }
    }
    this.updateHud(player);
  }

  updateCannon(c, dt, player, cam, can) {
    if (c.dead) return;
    c.hp = c.target.hp;
    // aim: follow the jeep (south of the tower only), turning at a limited rate
    const tp = c.group.position, dx = player.position.x - tp.x, dz = player.position.z - tp.z;
    const want = Math.max(-AIM_LIMIT, Math.min(AIM_LIMIT, Math.atan2(dx, Math.max(dz, .5)))); let d = want - c.head.rotation.y;
    if (can || c.charge > 0) c.head.rotation.y += Math.sign(d) * Math.min(Math.abs(d), TURN * dt);
    // damaged below half: it smokes
    if (c.hp <= c.maxHp * .5 && (c.smokeIn -= dt) <= 0 && this.fx) { c.smokeIn = .22; this.fx.puff(c.head.getWorldPosition(new THREE.Vector3()).setY(5.2), { color: 0x2a2724, size: .5, grow: 2.4, life: 1.2, opacity: .5, soft: true, vel: new THREE.Vector3(rnd(-.3, .3), 1.6, rnd(-.3, .3)) }); }
    const mw = c.muzzle.getWorldPosition(new THREE.Vector3()), dist = Math.hypot(dx, dz);
    const seen = can && dist < RANGE && (!cam || cam.inPlayWindow(mw.clone().setY(1.4), 1) || cam.inPlayWindow(new THREE.Vector3(tp.x, 1.4, tp.z), 1));
    if (c.charge > 0) { // the coils flare, then it fires
      c.charge -= dt;
      if (!can) c.charge = 0;
      else if (c.charge <= 0) { this.fireBolt(c, player, mw); c.reload = rnd(...RELOAD); }
    } else if (seen) { if ((c.reload -= dt) <= 0 && Math.abs(want - c.head.rotation.y) < .25) { c.charge = CHARGE; this.fx?.cannonLight?.(mw, new THREE.Vector3(Math.sin(c.head.rotation.y), 0, Math.cos(c.head.rotation.y)), false); } }
    else c.reload = Math.max(c.reload, .8);
  }

  fireBolt(c, player, from) {
    const speed = BOLT_SPEED, dist0 = Math.hypot(player.position.x - from.x, player.position.z - from.z), T0 = Math.max(.35, dist0 / speed);
    // aimed a little ahead of the jeep (AIM_LEAD of the way to where it will be: not so far that it is hard to dodge)
    const to = new THREE.Vector3(player.position.x + this.vel.x * T0 * AIM_LEAD, 0, player.position.z + this.vel.z * T0 * AIM_LEAD);
    const gy = this.world.heightAt?.(to.x, to.z) ?? 0; to.y = gy;
    const T = Math.max(.3, Math.hypot(to.x - from.x, to.z - from.z) / speed);
    const m = new THREE.Group(); m.add(new THREE.Mesh(glowGeo, boltGlow), new THREE.Mesh(coreGeo, boltCore), new THREE.Mesh(trailGeo, boltTrail));
    m.position.copy(from); m.lookAt(to.x, to.y, to.z); m.rotateY(Math.PI); // (the streak trails behind: the group's +z is where it came from)
    this.scene.add(addToLayer(m, REFLECT)); m.traverse(o => o.layers.enable(PUDDLE));
    this.bolts.push({ m, from: from.clone(), to, T, t: 0 });
    sfx.enemyShot?.(from, true, true);
    this.fx?.turretFlash?.(from, new THREE.Vector3(to.x - from.x, 0, to.z - from.z).normalize());
  }

  updateBolts(dt, player, killPlayer) {
    for (let i = this.bolts.length - 1; i >= 0; i--) {
      const b = this.bolts[i]; b.t += dt; const k = Math.min(1, b.t / b.T);
      b.m.position.lerpVectors(b.from, b.to, k); b.m.position.y = b.from.y + (b.to.y + .15 - b.from.y) * k;
      let hit = false;
      if (this.live && !player.invulnerable && b.m.position.y < 2.4 && Math.hypot(b.m.position.x - player.position.x, b.m.position.z - player.position.z) < HALF_WID + .55) hit = true; // (it strikes the jeep in flight)
      if (hit) { killPlayer(); }
      if (hit || k >= 1) { this.impact(b.m.position.clone().setY(b.to.y)); this.scene.remove(b.m); this.bolts.splice(i, 1); }
    }
  }

  // The bolt comes down: a flash, a scorch on the road, and a patch of plasma fire that burns for about four seconds.
  impact(at) {
    const fx = this.fx; if (fx) { fx.hitHard?.(at.clone().setY(.4)); fx.scorch?.(at, 2.2); }
    const tex = craterTexture(Math.floor(Math.random() * 3)), y = at.y;
    const ring = new THREE.Mesh(craterGeo, new THREE.MeshBasicMaterial({ map: tex.ring, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })); ring.position.copy(at).setY(y + .06); ring.rotation.y = Math.random() * 6.28; ring.renderOrder = 6;
    const glow = new THREE.Mesh(groundGeo, glowMatGround()); glow.position.copy(at).setY(y + .07); glow.renderOrder = 6;
    const core = new THREE.Mesh(centredGeo, coreMat()); core.position.copy(at).setY(y + .8); core.userData.size = [2.6, 2.6]; core.renderOrder = 8;
    const flames = [[0, 0, 1.7, 3.8], [.25, -.2, 1.4, 3.0]].map(([dx, dz, w, h]) => { const m = new THREE.Mesh(flatGeo, spireMat()); m.position.set(at.x + dx, y + .3, at.z + dz); m.userData.size = [w, h]; m.renderOrder = 7; return m; });
    const meshes = [ring, glow, core, ...flames];
    for (const o of meshes) { o.frustumCulled = false; o.layers.enable(PUDDLE); o.userData.noWater = true; this.scene.add(o); }
    fx?.fires?.start([at.clone()], 1, FIRE_LIFE - .8, 1, .8, true); // (a blue light over the road and what stands on it, as long as the plasma burns: fire.js's firelight, no flames of its own)
    this.fires.push({ meshes, ring, at: at.clone(), t: 0, spark: 0 });
  }

  updateFires(dt, player, killPlayer) {
    const time = (performance.now() / 1000) % 120;
    for (let i = this.fires.length - 1; i >= 0; i--) {
      const f = this.fires[i]; f.t += dt;
      const grow = Math.min(1, f.t / .22), fade = Math.min(1, Math.max(0, (FIRE_LIFE - f.t) / .9)), amt = grow * fade, k = (.3 + .7 * grow) * (.5 + .5 * fade);
      f.meshes.forEach((o, n) => {
        const u = o.material.uniforms; if (!u) return;
        u.uTime.value = time; u.uAmt.value = amt * (.94 + .06 * Math.sin(f.t * 29 + n * 2));
        if (o.userData.size) o.scale.set(o.userData.size[0] * k, o.userData.size[1] * k, 1); // (no bobbing of its height)
      });
      f.ring.material.opacity = Math.min(1, amt * 1.1) * (.8 + .2 * Math.sin(f.t * 9)); // (the embers pulse and die with the fire)
      // sparks off it: cyan and violet up from the core, orange from the ring
      if (this.fx && fade > .3 && (f.spark -= dt) <= 0) {
        f.spark = .06; const a = Math.random() * 6.28, orange = Math.random() < .4, rad = orange ? CRATER_R * .3 : Math.random() * .5;
        this.fx.puff(f.at.clone().add(new THREE.Vector3(Math.cos(a) * rad, orange ? .1 : .5 + Math.random() * .6, Math.sin(a) * rad)), { color: orange ? 0xffa040 : Math.random() > .5 ? 0x60e8ff : 0xc9a0ff, size: .05 + Math.random() * .04, grow: 0, life: .8 + Math.random() * .8, opacity: 1, additive: true, reflect: false, gravity: -1.2, vel: new THREE.Vector3(rnd(-.4, .4), 1.4 + Math.random() * 1.8, rnd(-.4, .4)) });
      }
      // sparks like two bits of hot metal struck together: tiny, white-yellow to orange, thrown out all round in short bursts from a point on the spire, fast and falling quickly; each burst with a small white flash where they struck
      if (this.fx && fade > .3 && (f.zap = (f.zap ?? 0) - dt) <= 0) {
        f.zap = .1 + Math.random() * .25;
        const h = .5 + Math.random() * 2.8, a0 = Math.random() * 6.28, hit = f.at.clone().add(new THREE.Vector3(Math.cos(a0) * .3, h, Math.sin(a0) * .3));
        this.fx.puff(hit, { color: 0xfffff0, size: .2, grow: 1.2, life: .08, opacity: 1, additive: true, reflect: false });
        for (let n = 0, m = 7 + Math.floor(Math.random() * 8); n < m; n++) {
          const a = Math.random() * 6.28, up = (Math.random() - .35) * 1.6, sp = 3 + Math.random() * 7, hot = Math.random();
          this.fx.puff(hit, { color: hot > .66 ? 0xfff6d0 : hot > .3 ? 0xffd25a : 0xff8c2a, size: .045 + Math.random() * .04, grow: 0, life: .2 + Math.random() * .35, opacity: 1, additive: true, reflect: false, gravity: 9, vel: new THREE.Vector3(Math.cos(a) * sp, up * sp * .6, Math.sin(a) * sp) });
        }
      }
      if (this.live && !player.invulnerable && f.t < FIRE_LIFE - .3 && Math.hypot(player.position.x - f.at.x, player.position.z - f.at.z) < FIRE_R * .9 + HALF_WID * .6) killPlayer();
      if (f.t >= FIRE_LIFE) { this.scene.remove(...f.meshes); for (const o of f.meshes) o.material.dispose(); this.fires.splice(i, 1); }
    }
  }

  // A cannon is blown off its tower: fireballs, torn plates, a burning stump.
  destroyCannon(c, debris, fx) {
    c.dead = true; c.charge = 0; c.hp = 0;
    const at = c.head.getWorldPosition(new THREE.Vector3()), mat = this.gate.M.armour;
    c.head.visible = false;
    fx.explosion(at.clone().setY(at.y + .6), 2.3, true); setTimeout(() => fx.explosion(at.clone().add(new THREE.Vector3(rnd(-1, 1), .2, rnd(-1, 1))), 1.6, true), 160);
    for (let n = 0; n < 16; n++) debris.chunk(at.clone().add(new THREE.Vector3(rnd(-.6, .6), rnd(0, .8), rnd(-.6, .6))), mat, rnd(.12, .34), 3.5);
    fx.smoke(at.clone().setY(at.y), 10); fx.fires?.start([at.clone().setY(at.y - .2)], .9, 30);
  }

  // Light tanks arrive from below the view (facing north), hold fire until wholly on screen, and are not counted in the stage's kill rate.
  summon(tanks, player, cam) {
    const w = this.world; let pos = null;
    for (let tries = 0; tries < 12 && !pos; tries++) {
      const x = rnd(-24, 24); let z = player.position.z + 30;
      for (let k = 0; k < 12 && cam && cam.inPlayWindow(new THREE.Vector3(x, 1, z), 1); k++) z += 4; // (until it is out of the play window)
      if (z > -20 || w.blockedRect(x, z, 0, 2.4, 1.6)) continue;
      pos = new THREE.Vector3(x, 0, z);
    }
    if (!pos) return;
    const t = tanks.add(pos, 0, { light: true }); t.gun.fullView = LIGHT_FOOTPRINT; t.gun.mob = true; t.summoned = true; tanks.activate(t); this.summoned.push(t);
  }

  // ---- the cannons' armour bars, pinned along the top of the screen from when the jeep comes near
  updateHud(player) {
    const show = !this.done || this.hudHide > 0;
    if (this.done && this.hudHide > 0) this.hudHide -= 1 / 60;
    const near = player.position.z < HUD_Z || !this.done && this.cannons.some(c => c.hp < c.maxHp);
    if (!(show && near)) { if (this.hud) this.hud.root.style.display = 'none'; return; }
    if (!this.hud) {
      const root = document.createElement('div');
      Object.assign(root.style, { position: 'fixed', zIndex: 5, pointerEvents: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', top: '14px', left: '50%', transform: 'translateX(-50%)',
        font: '700 14px/1 "Courier New", monospace', color: '#ffe8b4', letterSpacing: '.18em', textShadow: '-1px -1px 0 #0b0e06, 1px -1px 0 #0b0e06, -1px 1px 0 #0b0e06, 1px 1px 0 #0b0e06, 0 2px 3px rgba(0,0,0,.8)' });
      const row = document.createElement('div'); Object.assign(row.style, { display: 'flex', gap: '10px' });
      const slots = this.cannons.map((c, i) => {
        const slot = document.createElement('div'); Object.assign(slot.style, { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', fontSize: '12px' });
        const bar = document.createElement('div'); Object.assign(bar.style, { width: 'min(120px, 20vw)', height: '12px', background: 'rgba(11,14,6,.75)', border: '2px solid #e8b877', boxShadow: '0 0 0 2px #0b0e06', position: 'relative' });
        const label = document.createElement('div'); label.textContent = tr('CANNON') + ' ' + (i + 1);
        const fill = document.createElement('div'); Object.assign(fill.style, { position: 'absolute', left: 0, top: 0, bottom: 0, width: '100%', transition: 'width .25s, background .25s' });
        bar.appendChild(fill); slot.append(label, bar); row.appendChild(slot); return { slot, label, fill };
      });
      root.append(row); (document.getElementById('frame') ?? document.body).appendChild(root); this.hud = { root, slots };
    }
    this.hud.root.style.display = 'flex';
    this.hud.slots.forEach((s, i) => { const c = this.cannons[i], f = c.dead ? 0 : Math.max(0, c.target.hp / c.maxHp);
      s.fill.style.width = (f * 100).toFixed(1) + '%'; s.fill.style.background = `hsl(${(108 * f).toFixed(0)}, 70%, 48%)`; s.slot.style.opacity = c.dead ? '.45' : '1'; s.label.style.textDecoration = c.dead ? 'line-through' : 'none'; });
  }
}
