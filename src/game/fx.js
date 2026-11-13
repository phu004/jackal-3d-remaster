// Cheap particle effects: each puff is a small mesh that grows, drifts, falls and fades.
import { sfx } from './sfx.js';
import * as THREE from 'three';
import { addToLayer, REFLECT, UNDERWATER } from './layers.js';
import { PUDDLE } from './puddles.js';

const puffGeo = new THREE.IcosahedronGeometry(1, 1), clodGeo = new THREE.IcosahedronGeometry(1, 0); // (clodGeo: a chunky faceted lump, for flung snow)
const ringGeo = new THREE.RingGeometry(.7, 1, 24);
const markGeo = new THREE.PlaneGeometry(2, 2);
let markTex = null, foamTex = null;
// Foam: a soft round patch with blotchy bubbles, fading out to the edge (no hard corners).
function foamTexture() {
  if (foamTex) return foamTex;
  const N = 128, c = document.createElement('canvas'); c.width = c.height = N; const x = c.getContext('2d');
  const g = x.createRadialGradient(N / 2, N / 2, 0, N / 2, N / 2, N / 2);
  g.addColorStop(0, 'rgba(255,255,255,.9)'); g.addColorStop(.6, 'rgba(255,255,255,.45)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, N, N);
  x.globalCompositeOperation = 'destination-out'; // punch bubbly holes so it isn't a flat disc
  for (let i = 0; i < 70; i++) {
    const a = Math.random() * Math.PI * 2, d = Math.random() * N * .45;
    x.fillStyle = `rgba(0,0,0,${.3 + Math.random() * .5})`;
    x.beginPath(); x.arc(N / 2 + Math.cos(a) * d, N / 2 + Math.sin(a) * d, 2 + Math.random() * 6, 0, Math.PI * 2); x.fill();
  }
  return (foamTex = new THREE.CanvasTexture(c));
}
// Bullet scorch: an irregular burnt spot with soft edges, a darker core and a few radial streaks.
function scorchTexture() {
  if (markTex) return markTex;
  const N = 128, c = document.createElement('canvas'); c.width = c.height = N; const x = c.getContext('2d');
  // (all soft: a wide fading base and a ring of overlapping soft blobs of uneven size, so the edge is ragged but never a hard line; nothing is drawn right out to the canvas edge)
  const g = x.createRadialGradient(N / 2, N / 2, 0, N / 2, N / 2, N * .46);
  g.addColorStop(0, 'rgba(25,14,6,.85)'); g.addColorStop(.3, 'rgba(40,26,12,.6)'); g.addColorStop(.7, 'rgba(55,36,18,.18)'); g.addColorStop(1, 'rgba(60,38,18,0)');
  x.fillStyle = g; x.fillRect(0, 0, N, N);
  for (let i = 0; i < 14; i++) {
    const a = Math.random() * Math.PI * 2, d = N * (.08 + Math.random() * .24), rr = N * (.08 + Math.random() * .12), px = N / 2 + Math.cos(a) * d, py = N / 2 + Math.sin(a) * d;
    const b = x.createRadialGradient(px, py, 0, px, py, rr); b.addColorStop(0, `rgba(30,18,8,${.18 + Math.random() * .2})`); b.addColorStop(1, 'rgba(30,18,8,0)');
    x.fillStyle = b; x.fillRect(px - rr, py - rr, rr * 2, rr * 2);
  }
  return (markTex = new THREE.CanvasTexture(c));
}
const r = () => (Math.random() - .5) * 2;

const STILL = new THREE.Vector3(); // a puff's default velocity (read only)
const _v0 = new THREE.Vector3();
const _e = new THREE.Euler(), _m = new THREE.Matrix4();

export class Fx {
  constructor(scene) {
    this.scene = scene; this.parts = []; this.emitters = []; this.batches = new Map(); this.free = [];
    // A fixed pool of lights for explosion flashes, idle at intensity 0. The light count must never
    // change at runtime: in three.js that recompiles every material and causes a stutter.
    this.lights = Array.from({ length: 4 }, () => {
      const l = new THREE.PointLight(0xff9a40, 0, 16, 2);
      scene.add(addToLayer(l, REFLECT, UNDERWATER)); // (every view must have the same lights, or each view switch re-picks every material's shader)
      return { l, age: 1, life: 1, peak: 0 };
    });
    // The machine gun's own light: flares at the muzzle on every shot, lighting the jeep and the sand.
    this.gunLight = { l: new THREE.PointLight(0xffc860, 0, 9, 2), age: 1, life: .07, peak: 0 };
    scene.add(addToLayer(this.gunLight.l, REFLECT, UNDERWATER));
    // A rocket's exhaust light: follows a missile climbing out of its silo, lighting the hull, the water and the quay round it.
    this.exhaustLight = { l: new THREE.PointLight(0xffa850, 0, 13, 2), age: 1, life: .12, peak: 0 };
    scene.add(addToLayer(this.exhaustLight.l, REFLECT, UNDERWATER));
  }

  // Call each frame a missile is launching: the light sits at its tail and dies away if the calls stop.
  exhaust(pos, peak = 5) {
    const s = this.exhaustLight;
    s.l.position.copy(pos); s.age = 0; s.peak = peak;
  }

  // Bright orange flare at an explosion that flickers and dies away, lighting up the surroundings.
  flash(pos, scale = 1) {
    const slot = this.lights.reduce((a, b) => (b.age / b.life > a.age / a.life ? b : a)); // most-finished light
    slot.l.position.copy(pos).setY(pos.y + 1.5);
    slot.l.distance = 12 + 8 * scale;
    slot.age = 0; slot.life = .45 + .2 * scale; slot.peak = 3.5 * scale;
  }

  // Options: additive (glows), stretch (per-axis scale, e.g. a flame along -Z), flat (lies on the
  // ground, for rings and marks), geo (custom geometry).
  // Puffs are not meshes: all the puffs of one kind (blending, sidedness, texture, geometry, in the water's reflection or not) are
  // the instances of one InstancedMesh, so any number of them is one draw call per kind in every view (main, reflection, ...).
  // Each instance carries its colour and opacity (aTint) and its own matrix; the batch is rewritten each frame in update().
  // A finished puff's record is recycled by the next one, so steady smoke and sparks make no garbage.
  puff(pos, { color = 0xd9a060, size = .5, grow = 2, life = .8, vel = STILL, opacity = .6, gravity = 0,
    additive = false, stretch = null, flat = false, geo = puffGeo, map = null, yaw = null, reflect = true, soft = false, mirror = true } = {}) { // soft: fades out at the rim, a glow rather than a ball // reflect: false = not drawn in the water's reflection // mirror: false = not drawn in stage 6's puddles either (a long smoke trail mirrored there smears into a thick white band)
    if (this.wet && (color === 0xb07a48 || color === 0xc8925a)) return; // (a wet day: no dust from the wheels and tracks, for now)
    if (this.snowy && (color === 0xb07a48 || color === 0xc8925a || color === 0xd0b080 || color === 0xd9a060)) return; // (the snow level: no dust from wheels, tracks and feet at all: the tracks left in the snow are enough)
    const key = (additive ? 'a' : 'n') + (flat ? 'f' : '') + (reflect ? '' : 'x') + (mirror ? '' : 'm') + (soft ? 's' : '') + geo.uuid + (map ? map.uuid : '');
    let b = this.batches.get(key);
    if (!b) this.batches.set(key, b = this.makeBatch(key, 128, { geo, map, additive, flat, reflect, soft, mirror }));
    if (++b.live > b.cap) this.growBatch(b);
    const p = this.free.pop() ?? { pos: new THREE.Vector3(), vel: new THREE.Vector3(), quat: new THREE.Quaternion(), scale: new THREE.Vector3(), color: new THREE.Color() };
    p.pos.copy(pos); p.color.set(color); p.batch = b;
    p.quat.setFromEuler(_e.set(flat ? -Math.PI / 2 : 0, yaw ?? 0, flat ? Math.random() * Math.PI * 2 : 0, 'XYZ'));
    Object.assign(p, { size, grow, life, age: 0, opacity, gravity, stretch, floor: flat ? pos.y : 0 }); p.vel.copy(vel);
    this.scale(p, 0);
    this.parts.push(p);
  }

  makeBatch(key, cap, spec) {
    const geometry = spec.geo.clone(), tint = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4).setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute('aTint', tint);
    const material = new THREE.MeshBasicMaterial({
      map: spec.map, transparent: true, depthWrite: false, side: spec.flat ? THREE.DoubleSide : THREE.FrontSide,
      blending: spec.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    const soft = !!spec.soft, SV = soft ? '\nvarying vec3 vSN;\nvarying vec3 vSV;' : '';
    material.onBeforeCompile = sh => { // colour and opacity per instance (soft: and a see-through rim)
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec4 aTint;\nvarying vec4 vTint;' + SV).replace('#include <begin_vertex>', '#include <begin_vertex>\nvTint = aTint;' + (soft ? '\nvSN = mat3(modelViewMatrix) * mat3(instanceMatrix) * normal;\nvSV = -(modelViewMatrix * instanceMatrix * vec4(position, 1.)).xyz;' : ''));
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec4 vTint;' + SV).replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor *= vTint;' + (soft ? '\nfloat sf = abs(dot(normalize(vSN), normalize(vSV))); diffuseColor.a *= sf * sf;' : ''));
    };
    material.customProgramCacheKey = () => soft ? 'fxPuffSoft' : 'fxPuff';
    const mesh = new THREE.InstancedMesh(geometry, material, cap);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false; mesh.count = 0; mesh.visible = false; mesh.castShadow = mesh.receiveShadow = false;
    mesh.renderOrder = spec.flat ? 2 : spec.additive ? 4 : 3; // after the water and the other transparent things (order 0), before the flames (5, fire.js): flat marks, then smoke, then glows
    mesh.userData.fxBatch = true; // (not a scene thing to cull by position: see world.js)
    if (!spec.flat && spec.mirror !== false) mesh.layers.enable(PUDDLE); // (every glow, smoke and spark is mirrored in stage 6's puddles, whatever the sea's reflection does with it)
    if (!spec.flat && spec.reflect) mesh.layers.enable(REFLECT); // (flat marks and foam lie on the surface: their mirror image is edge-on, nothing to draw)
    // (glows added to the mirror image of the wet road came out much fainter than the real ones: a glow is mostly brightness, and the mirror's picture is drawn smaller and mixed with the sky. Drawn for the mirror's camera, which is under the
    // ground, they are brightened.)
    if (spec.additive) mesh.onBeforeRender = (r, sc, cam) => { material.color.setScalar(cam.position.y < 0 ? 2.6 : 1); };
    this.scene.add(mesh);
    return { key, spec, mesh, tint, cap, live: 0, n: 0 };
  }

  growBatch(b) { // more puffs than room: a bigger mesh (every puff is rewritten into it in the next update)
    const old = b.mesh, bigger = this.makeBatch(b.key, b.cap * 2, b.spec);
    this.scene.remove(old); old.geometry.dispose(); old.material.dispose(); old.dispose();
    Object.assign(b, { mesh: bigger.mesh, tint: bigger.tint, cap: bigger.cap });
  }

  scale(p, k) {
    const s = p.size * (1 + p.grow * k);
    if (p.stretch) p.scale.set(s * p.stretch.x, s * p.stretch.y, s * p.stretch.z); else p.scale.setScalar(s);
  }

  // ---- the named effects, each a handful of puffs
  dust(pos, dir, strength = 1) {
    this.puff(pos, { color: 0xe0a868, size: .6 * strength, grow: 2.5, life: 1.1, opacity: .45, vel: dir.clone().multiplyScalar(6 * strength).setY(1) });
  }
  spark(pos) {
    this.puff(pos, { color: 0xfff0a0, size: .15, grow: 1.5, life: .12, opacity: 1 });
  }

  // The player's machine gun: a flash at the muzzle, a stretched flame ahead of it and a spent casing flung out.
  muzzleFlash(pos) {
    const l = this.gunLight;
    l.l.position.copy(pos); l.age = 0; l.peak = 2.2 + Math.random() * .8;
    this.puff(pos, { color: 0xfff4c0, size: .22, grow: .6, life: .05, opacity: 1, additive: true });
    this.puff(pos.clone().add(new THREE.Vector3(0, 0, -.45)), { color: 0xffb040, size: .22, grow: .4, life: .06, opacity: .9, additive: true,
      stretch: new THREE.Vector3(.8 + Math.random() * .4, .8, 2.6 + Math.random()) });
    this.puff(pos.clone().add(new THREE.Vector3(.15, -.1, .35)), { color: 0xd8a640, size: .06, grow: 0, life: .7, opacity: 1, gravity: 22,
      vel: new THREE.Vector3(3 + Math.random() * 2, 3 + Math.random() * 2, 1 + r()) });
  }

  // Enemy turret firing: a fireball out of the muzzle along `dir` and a puff of gun smoke.
  turretFlash(pos, dir) {
    const yaw = Math.atan2(-dir.x, -dir.z);
    this.puff(pos.clone().addScaledVector(dir, .35), { color: 0xffe0a0, size: .16, grow: .4, life: .05, opacity: 1, additive: true,
      stretch: new THREE.Vector3(1, 1, 3.2), yaw });
    this.puff(pos.clone().addScaledVector(dir, .55), { color: 0xff8a30, size: .14, grow: .5, life: .07, opacity: .8, additive: true,
      stretch: new THREE.Vector3(1.2, 1, 3.8), yaw });
    for (let i = 0; i < 3; i++) {
      this.puff(pos.clone().addScaledVector(dir, .2 + i * .15), { color: 0x6a6560, size: .12, grow: 2, life: .45, opacity: .25,
        vel: new THREE.Vector3(r() * .4, .8 + Math.random() * .6, r() * .4).addScaledVector(dir, .4) });
    }
  }

  // A cannon's own light: a brief, tight orange flare just over the muzzle, lighting the hull and turret that fired (one of the explosion lights, so the light count stays fixed).
  cannonLight(pos, dir, heavy = false) {
    const slot = this.lights.reduce((a, b) => (b.age / b.life > a.age / a.life ? b : a));
    slot.l.position.copy(pos).addScaledVector(dir, -.4).setY(pos.y + .7);
    slot.l.distance = heavy ? 11 : 8;
    slot.age = 0; slot.life = heavy ? .2 : .13; slot.peak = heavy ? 6 : 4.5;
  }

  // A light that lasts: from the pool, a given reach, strength and time (the boss's beam lights the ground along its length).
  holdLight(pos, life, peak, distance) {
    const slot = this.lights.reduce((a, b) => (b.age / b.life > a.age / a.life ? b : a));
    slot.l.position.copy(pos).setY(Math.max(pos.y, .8)); slot.l.distance = distance; slot.age = 0; slot.life = life; slot.peak = peak;
  }

  // Bullet striking armour or stone: a flash, sparks and a puff of grey smoke.
  hitHard(pos) {
    this.puff(pos, { color: 0xfff0b0, size: .3, grow: .5, life: .06, opacity: 1, additive: true });
    for (let i = 0, n = 5 + Math.floor(Math.random() * 4); i < n; i++) {
      this.puff(pos, { color: 0xffd060, size: .06, grow: 0, life: .2 + Math.random() * .25, opacity: 1, additive: true, gravity: 16,
        vel: new THREE.Vector3(r() * 7, 2 + Math.random() * 6, 2 + Math.random() * 6) });
    }
    this.puff(pos, { color: 0x7a746a, size: .2, grow: 2.2, life: .6, opacity: .45, vel: new THREE.Vector3(r() * .5, 1.2, r() * .5) });
  }

  // The rotor's downwash blowing dust (or snow) outward round `centre`. strength 0..1, dt in s.
  rotorWash(centre, strength, dt, snow = false) { // snow: spray over water; this.snowy (the snow level): the downwash lifts powder snow, not dust
    if (strength <= 0) return;
    if (this.snowy) return this.snowWash(centre, strength, dt);
    const count = a => Math.floor(a * strength * dt + Math.random()), cloud = snow ? 0xe6eef5 : 0xd8a468, grain = snow ? 0xffffff : 0x8a5a2a;
    for (let n = count(40); n > 0; n--) {
      const a = Math.random() * Math.PI * 2, dir = new THREE.Vector3(Math.cos(a), 0, Math.sin(a)), d = 2.5 + Math.random() * 6;
      this.puff(centre.clone().addScaledVector(dir, d).setY(.4), { color: cloud, size: .7 + Math.random() * .6, grow: 2.5, life: 1.3,
        opacity: (snow ? .35 : .45) * strength, vel: dir.multiplyScalar(7 + Math.random() * 6).setY(.6 + Math.random()) });
    }
    for (let n = count(30); n > 0; n--) {
      const a = Math.random() * Math.PI * 2, dir = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
      this.puff(centre.clone().addScaledVector(dir, 1.5 + Math.random() * 4).setY(.2), { color: grain, size: .05 + Math.random() * .05, grow: 0,
        life: .8, opacity: 1, gravity: 20, vel: dir.multiplyScalar(9 + Math.random() * 6).setY(2 + Math.random() * 3) });
    }
    if (Math.random() < 2.5 * strength * dt) {
      this.puff(centre.clone().setY(.06), { color: cloud, size: 2.5, grow: 3.5, life: .9, opacity: .35 * strength, flat: true, geo: ringGeo });
    }
  }

  // The downwash on snow: a low, billowing white cloud of powder blown out from under the rotors in swirls (it rolls out and lifts, the larger puffs thin and fade), a fine spray of flakes flung out, some
  // carried up into the air and drifting down slowly, and a ring spreading over the ground.
  snowWash(centre, strength, dt) {
    const count = a => Math.floor(a * strength * dt + Math.random()), pow = [0xf6f9fc, 0xe9f0f7, 0xdde7f1];
    for (let n = count(34); n > 0; n--) { // the billows: they leave in a spiral (the rotor's swirl), not straight out
      const a = Math.random() * Math.PI * 2, d = 2 + Math.random() * 5, dir = new THREE.Vector3(Math.cos(a), 0, Math.sin(a)), sw = new THREE.Vector3(-dir.z, 0, dir.x);
      this.puff(centre.clone().addScaledVector(dir, d).setY(centre.y + .3 + Math.random() * .4), { color: pow[Math.floor(Math.random() * 3)], size: 1.0 + Math.random() * .9, grow: 2.6, life: 1.7 + Math.random() * .7,
        opacity: .5 * strength, soft: true, vel: dir.clone().multiplyScalar(5 + Math.random() * 5).addScaledVector(sw, 3 + Math.random() * 3).setY(.5 + Math.random() * 1.3) });
    }
    for (let n = count(36); n > 0; n--) { // flakes thrown out low and fast
      const a = Math.random() * Math.PI * 2, dir = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
      this.puff(centre.clone().addScaledVector(dir, 1.2 + Math.random() * 4).setY(centre.y + .15), { color: 0xffffff, size: .06 + Math.random() * .08, grow: 0, life: .7 + Math.random() * .5, opacity: 1, gravity: 14,
        vel: dir.multiplyScalar(8 + Math.random() * 7).setY(1.5 + Math.random() * 3) });
    }
    for (let n = count(9); n > 0; n--) { // flurries lifted into the air: small soft puffs that rise and drift down
      const a = Math.random() * Math.PI * 2, dir = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
      this.puff(centre.clone().addScaledVector(dir, 2 + Math.random() * 6).setY(centre.y + .5), { color: 0xf8fbff, size: .22 + Math.random() * .2, grow: .6, life: 2.4 + Math.random(), opacity: .6 * strength, soft: true, gravity: -.4,
        vel: dir.multiplyScalar(3 + Math.random() * 3).setY(3 + Math.random() * 3) });
    }
  }

  // Bullet striking jungle: shredded leaves fluttering down and a puff of green debris.
  hitLeaves(pos) {
    this.puff(pos, { color: 0x4a6a2a, size: .25, grow: 1.8, life: .5, opacity: .5, vel: new THREE.Vector3(r() * .5, .8, r() * .5) });
    for (let i = 0; i < 6; i++) {
      this.puff(pos, { color: Math.random() > .5 ? 0x2f5a1c : 0x5a7a2a, size: .08, grow: 0, life: .8 + Math.random() * .5, opacity: 1, gravity: 4,
        vel: new THREE.Vector3(r() * 2.5, 1 + Math.random() * 2, 1 + Math.random() * 2), stretch: new THREE.Vector3(1.6, .3, 1) });
    }
  }

  // Bullet striking sand: a puff of dust, flung grains and a scorch mark that stays.
  hitSand(pos) {
    const at = pos.clone().setY(.05);
    this.puff(at, { color: 0xd9a060, size: .25, grow: 2.4, life: .55, opacity: .55, vel: new THREE.Vector3(r() * .6, 1.6, r() * .6) });
    for (let i = 0; i < 4; i++) {
      this.puff(at, { color: 0x9a6430, size: .07, grow: 0, life: .5, opacity: 1, gravity: 22, vel: new THREE.Vector3(r() * 2.5, 3 + Math.random() * 3, r() * 2.5) });
    }
    this.puff(pos.clone().setY(.02), { color: 0xffffff, map: scorchTexture(), size: .3 + Math.random() * .2, grow: .15, life: 4, opacity: .85, flat: true, geo: markGeo });
  }

  // Bullet striking water: drops thrown up and a ring spreading out.
  hitWater(pos) {
    const at = pos.clone().setY(.08);
    for (let i = 0; i < 6; i++) {
      this.puff(at, { color: 0xe8f4ff, size: .07, grow: 0, life: .55, opacity: .9, gravity: 18, vel: new THREE.Vector3(r() * 1.5, 4 + Math.random() * 3, r() * 1.5) });
    }
    this.puff(at, { color: 0xe8f4ff, size: .25, grow: 4, life: .6, opacity: .7, flat: true, geo: ringGeo });
  }

  // A shell or grenade landing in water: a column of spray, rising mist, three spreading rings and a foam patch.
  waterBlast(pos, scale = 1) {
    const at = pos.clone().setY(.08);
    for (let i = 0; i < 22; i++) {
      const a = Math.random() * Math.PI * 2, sp = Math.random() * 3.5;
      this.puff(at, { color: 0xf2f8ff, size: .08 + Math.random() * .1, grow: .5, life: .9 + Math.random() * .4, opacity: .95, gravity: 18,
        vel: new THREE.Vector3(Math.cos(a) * sp * .7, 6 + Math.random() * 5, Math.sin(a) * sp * .7).multiplyScalar(scale) });
    }
    for (let i = 0; i < 7; i++) {
      this.puff(at.clone().setY(.6), { color: 0xe8f0f6, size: .55 * scale, grow: 2.5, life: 1.3 + Math.random() * .5, opacity: .5,
        vel: new THREE.Vector3(r() * 2, 2 + Math.random() * 2, r() * 2) });
    }
    [[3, 1.1], [5, 1.5], [7, 1.9]].forEach(([grow, life]) => {
      this.puff(at, { color: 0xf4f8fb, size: .7 * scale, grow, life, opacity: .6, flat: true, geo: ringGeo });
    });
    this.puff(at.clone().setY(.07), { color: 0xffffff, map: foamTexture(), size: 1.4 * scale, grow: 1, life: 3, opacity: .7, flat: true, geo: markGeo }); // foam patch
  }

  // A boat's wake: one foam patch (call every few metres).
  wake(pos, size = .6, life = 1.6) {
    this.puff(pos.clone().setY(.06), { color: 0xffffff, map: foamTexture(), size, grow: 1.5, life, opacity: .5, flat: true, geo: markGeo });
  }

  // A scorch mark on the ground where something stood (raised on a terrace).
  scorch(pos, size) {
    this.puff(pos.clone().setY(pos.y + .02), { color: 0xffffff, map: scorchTexture(), size, grow: 0, life: 40, opacity: .9, flat: true, geo: markGeo });
  }

  // Column of dark smoke rising from a wreck for `duration` seconds, thinning out as it goes.
  _smokeTex() { // the cloudy texture the chimney smoke uses (made once)
    if (!this._smokeMap) {
      const W = 128, c = document.createElement('canvas'); c.width = c.height = W; const x = c.getContext('2d'); x.fillStyle = '#8f8f8f'; x.fillRect(0, 0, W, W);
      let sd = 11; const rn = () => (sd = (sd * 16807) % 2147483647) / 2147483647;
      for (let i = 0; i < 70; i++) { const px = rn() * W, py = rn() * W, rr = 8 + rn() * 26, g = x.createRadialGradient(px, py, 0, px, py, rr), v = rn() < .5 ? 255 : 40; g.addColorStop(0, `rgba(${v},${v},${v},${.18 + rn() * .2})`); g.addColorStop(1, `rgba(${v},${v},${v},0)`); x.fillStyle = g; for (const ox of [-W, 0, W]) { x.save(); x.translate(ox, 0); x.fillRect(px - rr, py - rr, rr * 2, rr * 2); x.restore(); } }
      const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; this._smokeMap = t; this._smokeGeo = new THREE.IcosahedronGeometry(1, 2);
    }
  }
  stackSmoke(pos, wind = [1.1, .15]) { // a power station's flue: big, slow, pale grey puffs that climb and lean away down the wind, spreading as they go
    this._smokeTex(); const g = .5 + Math.random() * .1;
    this.puff(pos, { color: new THREE.Color(g, g * .99, g * .97), map: this._smokeMap, geo: this._smokeGeo, soft: true, reflect: false, mirror: false, yaw: Math.random() * 6.28, size: .7 + Math.random() * .25, grow: 2.2 + Math.random() * .5, life: 11 + Math.random() * 3, opacity: .5, vel: new THREE.Vector3(wind[0] * (.8 + Math.random() * .4), 1.3 + Math.random() * .4, wind[1] * (.8 + Math.random() * .4)) });
  }
  chimneySmoke(pos) { // one puff of woodsmoke: a smooth, finely divided ball with a cloudy texture and a see-through rim (soft), small at the flue, spreading and thinning as it climbs and drifts
    this._smokeTex();
    const g = .27 + Math.random() * .1, t = performance.now() / 1000;
    this.puff(pos, { color: new THREE.Color(g, g * .99, g * .97), map: this._smokeMap, geo: this._smokeGeo, soft: true, reflect: false, mirror: false, yaw: Math.random() * 6.28, size: .2 + Math.random() * .06, grow: 2.9 + Math.random() * .6, life: 6.2 + Math.random() * 1.4, opacity: .7,
      vel: new THREE.Vector3(.35 + .5 * Math.sin(t * .8) + .25 * Math.sin(t * 2.1 + 1) + Math.random() * .2, 1.5 + .35 * Math.sin(t * 1.3) + Math.random() * .3, .4 * Math.sin(t * .6 + 2) + .2 * Math.sin(t * 1.7) + (Math.random() - .5) * .25) }); // (a wandering breeze: the plume bends and snakes as it climbs, not a straight column)
  }
  smoke(pos, duration = 6) { this.emitters.push({ pos: pos.clone(), t: 0, dur: duration, next: 0 }); }

  explosion(pos, scale = 1, big = false) { // big: sounds like a building coming down
    this.crater?.(pos, scale); // (the snow level: a blast that lands on the ground leaves a crater there: set by the game)
    this.flash(pos, scale); sfx.explosion(scale, pos, big);
    for (let i = 0; i < 10; i++) {
      this.puff(pos, { color: i < 4 ? 0xfff2a0 : 0xff8a1e, size: .5 * scale, grow: 3.5 * scale, life: .35 + Math.random() * .2, opacity: .95,
        vel: new THREE.Vector3(r() * 4, 2 + Math.random() * 4, r() * 4).multiplyScalar(scale) });
    }
    for (let i = 0; i < 8; i++) {
      this.puff(pos.clone().setY(pos.y + .5), { color: 0x4a3a30, size: .6 * scale, grow: 3 * scale, life: 1.2 + Math.random() * .6, opacity: .55,
        vel: new THREE.Vector3(r() * 2, 2.5 + Math.random() * 2, r() * 2).multiplyScalar(scale) });
    }
    for (let i = 0; i < 6; i++) { // debris
      this.puff(pos, { color: 0x2a1a10, size: .12, grow: 0, life: .9, opacity: 1, gravity: 22,
        vel: new THREE.Vector3(r() * 7, 6 + Math.random() * 6, r() * 7).multiplyScalar(scale) });
    }
  }

  update(dt) {
    for (let i = this.emitters.length - 1; i >= 0; i--) {
      const e = this.emitters[i];
      e.t += dt; e.next -= dt;
      if (e.t > e.dur) { this.emitters.splice(i, 1); continue; }
      for (; e.next <= 0; e.next += .14) {
        const k = 1 - e.t / e.dur;
        this.puff(e.pos, { color: 0x34302b, size: .45 + Math.random() * .2, grow: 3, life: 2.2, opacity: .5 * k + .1,
          vel: new THREE.Vector3(r() * .3 + .4, 2.2 + Math.random(), r() * .3 - .3) }); // drifts a little with the breeze
      }
    }
    for (const s of [...this.lights, this.gunLight, this.exhaustLight]) {
      if (s.age >= s.life) { s.l.intensity = 0; s.l.position.y = -500; continue; }   // (idle: parked far below the ground, so no pixel is within its reach and the shader's per-light work is skipped everywhere; every use sets its position again)
      s.age += dt;
      const k = Math.min(1, s.age / s.life);
      s.l.intensity = s.peak * (1 - k) * (1 - k) * (.75 + Math.random() * .5); // fade with a flicker
    }
    for (const b of this.batches.values()) b.n = 0;
    let j = 0;
    for (let i = 0; i < this.parts.length; i++) {
      const p = this.parts[i];
      p.age += dt;
      const k = p.age / p.life, b = p.batch;
      if (k >= 1) { b.live--; this.free.push(p); continue; } // done: its record is recycled
      p.vel.y -= p.gravity * dt;
      p.vel.multiplyScalar(p.gravity ? 1 : Math.max(0, 1 - dt * 2));
      p.pos.addScaledVector(p.vel, dt);
      if (p.pos.y < p.floor) p.pos.y = p.floor;
      if (this.cullFocus && Math.hypot(p.pos.x - this.cullFocus.x, p.pos.z - this.cullFocus.z) > this.cullR) { this.parts[j++] = p; continue; } // (far off the screen: it still ages and drifts, but is not sent to the graphics card: a burning wreck on the other side of the map cost 80 triangles a puff, three passes over)
      this.scale(p, k);
      _m.compose(p.pos, p.quat, p.scale); b.mesh.setMatrixAt(b.n, _m);
      b.tint.setXYZW(b.n, p.color.r, p.color.g, p.color.b, p.opacity * (1 - k)); b.n++;
      this.parts[j++] = p;
    }
    this.parts.length = j;
    for (const b of this.batches.values()) { b.mesh.count = b.n; b.mesh.visible = b.n > 0; b.mesh.instanceMatrix.needsUpdate = true; b.tint.needsUpdate = true; }
  }
}
