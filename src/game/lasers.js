// Stage 3's laser maze: each emitter on a maze wall (harbour-props.js) throws a vertical curtain of
// red energy straight out across its corridor, to the next wall or building in its way. It cycles:
// off, a short warning (the lens flickers, sparks spit, the curtain flickers faintly: harmless), then
// on, a crackling field that destroys the jeep the instant it touches it. The emitters are staggered
// so the maze pulses in a rhythm. They can't be destroyed. Gameplay stays 2D: the curtain is a line
// on the ground the jeep mustn't cross while it's live.
import { sfx } from './sfx.js';
import * as THREE from 'three';

const TINT_REACH = 7; // m: how far from a curtain the jeep takes its red

const OFF = 2.6, WARN = .8, ON = 1.6;   // s of each part of the cycle
const STAGGER = .9;                      // s between neighbouring emitters' cycles
const FIELD_H = 3.4, MAX_LEN = 30;       // m: the curtain's height, and the furthest it reaches
const FIELD_W = .25;                     // m: the curtain's thickness (so it reads from any angle)
const HIT_PAD = .15 + FIELD_W / 2;       // m: the jeep this far outside its outline still touches it
const CYCLE = OFF + WARN + ON;

const vertexShader = `uniform float uWarp, uTime; varying vec2 vUv; varying float vTop;
void main() { vUv = uv; vTop = abs(normal.y); vec3 p = position;
  p.z += uWarp * 0.14 * sin(p.x * 3.2 - uTime * 22.0 + p.y * 2.1) * (0.4 + 0.6 * sin(uTime * 9.0 + p.y)); // (a curtain whose power fails ripples and shudders: the surface itself is displaced...
  p.x += uWarp * 0.1 * sin(p.y * 5.0 + uTime * 17.0);                                                   //  ...and its pattern slides sideways in waves)
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0); }`;
const fragmentShader = `
uniform float uTime, uAlpha, uDis, uWarp; uniform vec3 uColor; varying vec2 vUv; varying float vTop;
float dh( vec2 p ) { return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453 ); }
float dn( vec2 p ) { vec2 i = floor( p ), f = fract( p ); f = f * f * ( 3.0 - 2.0 * f ); return mix( mix( dh( i ), dh( i + vec2( 1.0, 0.0 ) ), f.x ), mix( dh( i + vec2( 0.0, 1.0 ) ), dh( i + vec2( 1.0, 1.0 ) ), f.x ), f.y ); }
float fieldK( float x, float y ) { // red, with scan lines climbing it and ripples running along it (no bright flecks or seams)
  float scan = 0.55 + 0.45 * sin(y * 70.0 - uTime * 18.0);
  float flow = 0.6 + 0.4 * sin(x * 55.0 + uTime * 26.0 + sin(y * 9.0 + uTime * 4.0) * 2.0);
  return vTop > 0.5 ? 0.6 + 0.4 * sin(x * 55.0 + uTime * 26.0)                                    // top: ripples along it
                    : (scan * 0.55 + flow * 0.45) * smoothstep(0.0, 0.06, y) * smoothstep(1.0, 0.75, y);
}
void main() {
  float x = vUv.x, y = vUv.y;
  vec3 col;
  if (uWarp > 0.0) { // distorted: wavy bends, bands torn sideways in glitches, and the colour channels pulled apart at the edges of the pattern
    float band = floor(y * 16.0), step20 = floor(uTime * 20.0);
    x += uWarp * 0.05 * sin(y * 22.0 + uTime * 30.0);
    x += uWarp * step(0.78, dn(vec2(band, step20))) * (dn(vec2(band * 3.1, step20 + 5.0)) - 0.5) * 0.4;
    y += uWarp * 0.02 * sin(x * 30.0 - uTime * 25.0);
    float o = 0.022 * uWarp, k0 = fieldK(x, y), kr = fieldK(x + o, y), kb = fieldK(x - o, y);
    col = vec3(uColor.r * kr, uColor.g * k0, uColor.b * kb) + vec3(0.0, 0.35, 0.85) * max(0.0, kb - k0) * uWarp * 0.9; // a cold blue fringe where the pattern is pulled away
  } else col = uColor * fieldK(x, y);
  if (uDis > 0.0) { // dissolving (uDis 0..1.2: a curtain whose power fails): ragged cells go out, the top first, with a hot white-orange edge on the front of the break, and crackling streaks left behind it
    float v = dn(vec2(x * 30.0, y * 7.0 + uTime * 1.5)) * 0.5 + dn(vec2(x * 90.0, y * 26.0 - uTime * 3.0)) * 0.2 + (1.0 - y) * 0.45;
    float live = step(uDis, v), band = smoothstep(uDis, uDis + 0.03, v) * (1.0 - smoothstep(uDis + 0.03, uDis + 0.13, v));
    float crackle = step(0.93, dn(vec2(x * 60.0 + floor(uTime * 16.0) * 5.0, y * 4.0))) * step(uDis, v + 0.25);
    col = col * live * (0.65 + 0.35 * dn(vec2(x * 14.0, uTime * 8.0))) + vec3(1.0, 0.86, 0.5) * band * 2.2 + uColor * band + vec3(1.0, 0.9, 0.6) * crackle * 0.9;
  }
  gl_FragColor = vec4(col * uAlpha, 1.0);
}`;

// The curtain's glow on the ground: a long soft strip along its foot, brightest under the curtain and fading to nothing either side and at the ends. A line, not a point.
const glowFragment = `
uniform float uAlpha; uniform vec3 uColor; varying vec2 vUv;
void main() { float across = 1.0 - abs(vUv.y - 0.5) * 2.0; // (no fade at the ends: the strip runs on into the walls, which hide the overrun)
  gl_FragColor = vec4(uColor * 0.8 * pow(across, 2.2) * uAlpha, 1.0); }`;
const glowVertex = `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const GLOW_W = 5;                        // m: the strip's width across the curtain
const WALL_REACH = 6, WALL_H = 3.4;      // m: how far from the curtain a wall still takes its light; how high the glow climbs a wall

// The curtain's light on the walls: upright strips laid just in front of a wall's face, brighter where the wall is near the curtain, fading toward the top.
// aW: strength (side walls); aS: metres sideways from the beam (end walls, where aE is 1). On an end wall the glow is a soft bell round the beam, a tight bright core in a wide halo, with
// no hard edge at the sides or the top; on a side wall it just fades up the wall.
const wallVertex = `attribute float aW; attribute float aS; attribute float aE; varying vec2 vUv; varying float vW, vS, vE; void main() { vUv = uv; vW = aW; vS = aS; vE = aE; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const wallFragment = `
uniform float uAlpha; varying vec2 vUv; varying float vW, vS, vE;
void main() {
  float h = vUv.y * ${WALL_H.toFixed(2)};
  float bell = 0.7 * exp(-vS * vS / 0.5) + 0.4 * exp(-vS * vS / 2.6);
  float endK = bell * (1.0 - smoothstep(1.6, ${WALL_H.toFixed(2)}, h)) * smoothstep(0.0, 0.25, h + 0.25);
  float sideK = vW * (1.0 - smoothstep(0.0, ${WALL_H.toFixed(2)}, h) * 0.8);
  gl_FragColor = vec4(vec3(1.0, 0.08, 0.03) * mix(sideK, endK, vE) * uAlpha, 1.0);
}`;

// A curtain of the same energy as a maze laser, in any colour, standing still: `len` m along X, centred on the origin of the returned group. Always on while its `alpha` is 1 (it hurts nothing: it is just
// the look). Call update(time, alpha) each frame. The airbase's energy gate (airbase-boss.js) is one, in orange.
export function laserCurtain(len, color = [1, .1, .05], height = FIELD_H) {
  const group = new THREE.Group(), col = new THREE.Vector3(...color);
  const mat = new THREE.ShaderMaterial({ vertexShader, fragmentShader, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, uniforms: { uTime: { value: 0 }, uAlpha: { value: 1 }, uDis: { value: 0 }, uWarp: { value: 0 }, uColor: { value: col } } });
  const field = new THREE.Mesh(new THREE.BoxGeometry(len, height, FIELD_W, Math.max(1, Math.round(len * 5)), 14, 1), mat); field.position.y = height / 2; field.renderOrder = 3; field.frustumCulled = false; group.add(field);
  const glowMat = new THREE.ShaderMaterial({ vertexShader: glowVertex, fragmentShader: glowFragment, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uAlpha: { value: 1 }, uColor: { value: col.clone().multiplyScalar(.8) } } });
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(len + 2, GLOW_W).rotateX(-Math.PI / 2), glowMat); glow.position.y = .07; glow.renderOrder = 2; glow.frustumCulled = false; group.add(glow);
  return { group, field, glow, setDissolve(d) { mat.uniforms.uDis.value = d; }, setWarp(w) { mat.uniforms.uWarp.value = w; }, setPinch(p) { field.scale.x = glow.scale.x = Math.max(.015, 1 - p); }, // (warp: distortion 0..1; pinch: 0..1 draws the curtain in to a thin line)
   update(time, alpha) { mat.uniforms.uTime.value = time; mat.uniforms.uAlpha.value = alpha; glowMat.uniforms.uAlpha.value = alpha; field.visible = glow.visible = alpha > .004; } };
}

export class Lasers {
  // enemyFire: for its jeep hit test.
  constructor(scene, fx, enemyFire) { this.scene = scene; this.fx = fx; this.enemyFire = enemyFire; this.list = []; this.t = 0; this.tracked = new WeakMap(); this.tint = { uLaserPosA: { value: new THREE.Vector3() }, uLaserKA: { value: 0 }, uLaserPosB: { value: new THREE.Vector3() }, uLaserKB: { value: 0 } }; }

  setup(world) {
    this.world = world;
    const sorted = [...(world.lasers ?? [])].sort((a, b) => a.position.z - b.position.z || a.position.x - b.position.x);
    sorted.forEach((obj, i) => {
      obj.updateMatrixWorld(true);
      const from = (obj.getObjectByName('muzzle') ?? obj).getWorldPosition(new THREE.Vector3());
      const out = new THREE.Vector3(-Math.sin(obj.rotation.y), 0, -Math.cos(obj.rotation.y)); // its front, in the world
      const len = this.reach(from, out);
      const mat = new THREE.ShaderMaterial({ vertexShader, fragmentShader, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
        uniforms: { uTime: { value: 0 }, uAlpha: { value: 0 }, uColor: { value: new THREE.Vector3(1, .1, .05) } } });
      const field = new THREE.Mesh(new THREE.BoxGeometry(len, FIELD_H, FIELD_W), mat); // (a thin slab, not a sheet)
      field.position.set(from.x + out.x * len / 2, FIELD_H / 2, from.z + out.z * len / 2);
      field.rotation.y = Math.atan2(out.x, out.z) - Math.PI / 2; // (the plane's width along `out`)
      field.visible = false; this.scene.add(field);
      const glowMat = new THREE.ShaderMaterial({ vertexShader: glowVertex, fragmentShader: glowFragment, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uAlpha: { value: 0 }, uColor: { value: new THREE.Vector3(1, .1, .04) } } });
      const glow = new THREE.Mesh(new THREE.PlaneGeometry(len + 2, GLOW_W).rotateX(-Math.PI / 2), glowMat); // (flat on the ground along the curtain)
      glow.position.set(field.position.x, .07, field.position.z); glow.rotation.y = field.rotation.y; glow.visible = false; glow.renderOrder = 2; this.scene.add(glow); // (a metre longer at each end)
      const wallMat = new THREE.ShaderMaterial({ vertexShader: wallVertex, fragmentShader: wallFragment, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, uniforms: { uAlpha: { value: 0 } } });
      const wallGlow = this.wallGlow(from, out, len); wallGlow.material = wallMat; wallGlow.visible = false; wallGlow.renderOrder = 2; wallGlow.frustumCulled = false; this.scene.add(wallGlow);
      const lens = obj.getObjectByName('lens');
      if (lens) lens.material = lens.material.clone(); // (each glows on its own)
      this.list.push({ obj, from: from.clone().setY(0), out, len, field, mat, lens, phase: -i * STAGGER, sparkIn: 0, glow: 0, glowMesh: glow, wallMesh: wallGlow });
    });
  }

  // Things in the maze (the jeep, the foot soldiers, the light tanks) take the curtains' red from their own shading, not from a light (a point light would also throw a wide red blob on the
  // ground and through the walls): their paint is patched to add a red diffuse term from the nearest visible curtain point, so only the faces turned toward the curtain are lit, and
  // stronger the nearer. Only a curtain the thing can see (no wall between) counts. Each mesh sets the shared uniforms just before it is drawn, so one patched material can be shared by
  // things that are lit differently.
  patchMaterial(m) {
    if (m.userData.laserPatched || !(m.isMeshStandardMaterial || m.isMeshPhongMaterial)) return;
    m.userData.laserPatched = true;
    const prev = m.onBeforeCompile;
    m.onBeforeCompile = (sh, r) => {
      prev?.call(m, sh, r); Object.assign(sh.uniforms, this.tint);
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vLaserWPos;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvLaserWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform vec3 uLaserPosA, uLaserPosB; uniform float uLaserKA, uLaserKB; varying vec3 vLaserWPos;')
        .replace('gl_FragColor = vec4( outgoingLight, diffuseColor.a );', `{ vec3 wn = inverseTransformDirection(normal, viewMatrix); vec3 toA = uLaserPosA - vLaserWPos, toB = uLaserPosB - vLaserWPos; // (up to two curtains at once)
          float lam = clamp((dot(wn, normalize(toA)) + 0.25) / 1.25, 0.0, 1.0) * uLaserKA + clamp((dot(wn, normalize(toB)) + 0.25) / 1.25, 0.0, 1.0) * uLaserKB; // (a little wrap, so a face edge-on to the curtain still takes some)
          outgoingLight += vec3(1.0, 0.12, 0.05) * (0.2 + dot(diffuseColor.rgb, vec3(0.33))) * lam; }
          gl_FragColor = vec4( outgoingLight, diffuseColor.a );`);
    };
    const key = m.customProgramCacheKey; m.customProgramCacheKey = () => (key ? key.call(m) : '') + 'laserjeep'; m.needsUpdate = true;
  }

  // Start lighting `obj` (every mesh in it; meshes added later are picked up on the next call): returns its entry, which holds the exposure `update` works out for it.
  // own: give each of its meshes materials of its own first. three.js only sends a plain material's uniforms again when the material changes between two draws, so two things drawn one
  // after the other with a shared material (the tanks') would both get the first one's values; with a material each, every draw sends its own.
  track(obj, own = false) {
    let e = this.tracked.get(obj); if (!e) { e = { pos: [new THREE.Vector3(), new THREE.Vector3()], k: [0, 0] }; this.tracked.set(obj, e); }
    const T = this.tint;
    obj.traverse(mesh => {
      if (!mesh.isMesh || mesh.userData.laserLit) return;
      mesh.userData.laserLit = true;
      if (own) mesh.material = Array.isArray(mesh.material) ? mesh.material.map(m => m.clone()) : mesh.material.clone();
      for (const m of [].concat(mesh.material)) this.patchMaterial(m);
      const before = mesh.onBeforeRender, after = mesh.onAfterRender;
      mesh.onBeforeRender = function (r, s, c, g, m, gr) { before.call(this, r, s, c, g, m, gr); if (m.userData.laserPatched) { T.uLaserPosA.value.copy(e.pos[0]); T.uLaserKA.value = e.k[0]; T.uLaserPosB.value.copy(e.pos[1]); T.uLaserKB.value = e.k[1]; m.uniformsNeedUpdate = true; } };
      mesh.onAfterRender = function (r, s, c, g, m, gr) { after.call(this, r, s, c, g, m, gr); if (m.userData.laserPatched) { T.uLaserKA.value = 0; T.uLaserKB.value = 0; m.uniformsNeedUpdate = true; } };
    });
    return e;
  }

  // The red `e` takes at `f` from the glowing curtains it can see: the two strongest, each its own light (so a thing between two curtains is lit from both sides).
  expose(e, f) {
    e.k[0] = e.k[1] = 0;
    for (const L of this.list.concat(this.extra ?? [])) { // (extra: curtains that something else draws and updates, e.g. stage 6's arena gate: each { from, out, len, glow, reach })
      if (L.glow < .01) continue;
      const reach = L.reach ?? TINT_REACH, t = Math.min(L.len, Math.max(0, (f.x - L.from.x) * L.out.x + (f.z - L.from.z) * L.out.z)), x = L.from.x + L.out.x * t, z = L.from.z + L.out.z * t, d = Math.hypot(x - f.x, z - f.z);
      if (d > reach) continue;
      const v = L.glow * Math.pow(1 - d / reach, 1.5) * 2.4; if (v <= e.k[1]) continue;
      let seen = true; for (let s = .5; s < d && seen; s += .5) seen = !this.blocksSight(x + (f.x - x) * s / d, z + (f.z - z) * s / d);
      if (!seen) continue;
      const slot = v > e.k[0] ? 0 : 1; if (slot === 0) { e.k[1] = e.k[0]; e.pos[1].copy(e.pos[0]); }
      e.k[slot] = v; e.pos[slot].set(x, 3.2, z);
    }
  }

  // The jeep and `others` (a list of objects: the soldiers' and the light tanks').
  light(player, others, owned = []) {
    if (!this.list.length && !this.extra?.length) return; // (no lasers on this stage: nothing's paint is touched)
    this.expose(this.track(player.object), player.position);
    for (const o of others) this.expose(this.track(o), o.position);
    for (const o of owned) this.expose(this.track(o, true), o.position);
  }

  // Does a wall or building stand here? (Not a tank or a crate: a tank's own box would otherwise hide the curtain from the tank itself.)
  blocksSight(x, z) {
    const w = this.world;
    return w.solidTile(w.tileAt(x, z)) || w.obstacles.some(b => b.alive && (b.kind === 'wall' || b.kind === 'container' || b.kind === 'building' || b.kind === 'blocker') && Math.abs(x - b.x) < b.hw && Math.abs(z - b.z) < b.hd);
  }

  solidAt(x, z) {
    const w = this.world;
    return w.solidTile(w.tileAt(x, z)) || w.obstacles.some(b => b.alive && b.kind !== 'soldier' && Math.abs(x - b.x) < b.hw && Math.abs(z - b.z) < b.hd);
  }

  // How far a curtain from `from` along `out` reaches before something solid stops it.
  reach(from, out) {
    for (let d = .5; d < MAX_LEN; d += .25) if (this.solidAt(from.x + out.x * d, from.z + out.z * d)) return d;
    return MAX_LEN;
  }

  // The upright strips of light on the walls round a curtain: the wall it ends on and the one its emitter stands on (brightest at the curtain, fading to the sides), and any wall running
  // alongside it (brighter the nearer). A mesh of vertical quads with a per-vertex strength; its material is set by the caller.
  wallGlow(from, out, len) {
    const perp = new THREE.Vector3(-out.z, 0, out.x), pos = [], uv = [], str = [], lat = [], endf = [], idx = [];
    const quad = (a, b, sa, sb, la = 0, lb = 0, e = 0) => { // a, b: the bottom corners (Vector3); sa, sb: their strength; la, lb: their distance sideways from the beam; e: 1 on an end wall
      const i = pos.length / 3;
      pos.push(a.x, 0, a.z, b.x, 0, b.z, b.x, WALL_H, b.z, a.x, WALL_H, a.z); uv.push(0, 0, 1, 0, 1, 1, 0, 1); str.push(sa, sb, sb, sa); lat.push(la, lb, lb, la); endf.push(e, e, e, e); idx.push(i, i + 1, i + 2, i, i + 2, i + 3);
    };
    const at = (t, s) => from.clone().addScaledVector(out, t).addScaledVector(perp, s);
    const HALF = 3.4, N = 17; // the strip across an end wall: 2 * HALF m wide, in N pieces (finely, so the bell is smooth)
    const ends = [];
    for (let d = 0; d < 1.5; d += .1) if (this.solidAt(from.x - out.x * d, from.z - out.z * d)) { ends.push(-d + .12); break; } // (the emitter's wall: march back to it)
    ends.push(len - .12);
    for (const t of ends) for (let i = 0; i < N; i++) {
      const s0 = -HALF + 2 * HALF * i / N, s1 = -HALF + 2 * HALF * (i + 1) / N;
      quad(at(t, s0), at(t, s1), 0, 0, s0, s1, 1);
    }
    for (const side of [-1, 1]) for (let t = 0; t < len; t += 1) { // walls alongside: found by marching out from the curtain
      const wall = tt => { for (let d = .5; d < WALL_REACH; d += .25) if (this.solidAt(from.x + out.x * tt + perp.x * side * d, from.z + out.z * tt + perp.z * side * d)) return d; return null; };
      const d0 = wall(t), d1 = wall(Math.min(len, t + 1)); if (d0 == null || d1 == null) continue;
      quad(at(t, side * (d0 - .12)), at(t + 1, side * (d1 - .12)), Math.pow(1 - d0 / WALL_REACH, 1.5), Math.pow(1 - d1 / WALL_REACH, 1.5));
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setAttribute('aW', new THREE.Float32BufferAttribute(str, 1)); g.setAttribute('aS', new THREE.Float32BufferAttribute(lat, 1)); g.setAttribute('aE', new THREE.Float32BufferAttribute(endf, 1)); g.setIndex(idx);
    return new THREE.Mesh(g);
  }

  update(dt, player, onHit, others = [], owned = []) {
    this.t += dt;
    for (const L of this.list) {
      const t = ((this.t + L.phase) % CYCLE + CYCLE) % CYCLE;
      let alpha = 0, glow = .6, live = false;
      if (t >= OFF && t < OFF + WARN) { // warning: flickering, harmless
        const k = (t - OFF) / WARN;
        alpha = (Math.random() < .35 + k * .4 ? .25 : .04) * k; glow = 1.4 + Math.random() * 2.5 * k;
        if ((L.sparkIn -= dt) <= 0) { L.sparkIn = .07; this.spark(L); }
      } else if (t >= OFF + WARN) { // live
        const k = t - OFF - WARN, fade = Math.min(1, k / .08) * Math.min(1, (ON - k) / .15);
        alpha = (.85 + Math.random() * .15) * fade; glow = 4; live = fade > .5;
        if ((L.sparkIn -= dt) <= 0) { L.sparkIn = .12; this.spark(L, true); }
      }
      const stage = t < OFF ? 0 : t < OFF + WARN ? 1 : 2; // (a change of stage starts its sound)
      if (stage !== L.stage) { if (stage === 1) sfx.laserCharge(L.from, WARN); else if (stage === 2) sfx.laserOn(L.from, ON); L.stage = stage; }
      L.glow = live ? alpha : alpha * .5; // (the warning's flicker lights the maze faintly; the live field fully)
      L.field.visible = alpha > .01; L.glowMesh.visible = L.glow > .01; L.glowMesh.material.uniforms.uAlpha.value = L.glow * .58; L.wallMesh.visible = L.glow > .01; L.wallMesh.material.uniforms.uAlpha.value = L.glow * 1;
      L.mat.uniforms.uAlpha.value = alpha; L.mat.uniforms.uTime.value = this.t;
      if (L.lens) L.lens.material.emissiveIntensity = glow;
      if (live && player.enabled && !player.dead && !player.invulnerable && this.touches(L, player)) onHit();
    }
    this.light(player, others, owned);
  }

  // The jeep touching the curtain's line on the ground?
  touches(L, player) {
    for (let d = 0; d <= L.len; d += .4) {
      const p = new THREE.Vector3(L.from.x + L.out.x * d, 0, L.from.z + L.out.z * d);
      if (this.enemyFire.hitsJeep(p, player, HIT_PAD)) return true;
    }
    return false;
  }

  // Sparks spitting from the emitter (and, when live, crackling where the curtain meets the far wall).
  spark(L, live = false) {
    const at = L.obj.getObjectByName('muzzle')?.getWorldPosition(new THREE.Vector3()) ?? L.obj.position.clone();
    const ends = live ? [at, L.from.clone().addScaledVector(L.out, L.len).setY(.3 + Math.random() * 2.5)] : [at];
    for (const p of ends) {
      const v = new THREE.Vector3((Math.random() - .5) * 3, 1 + Math.random() * 2, (Math.random() - .5) * 3);
      this.fx.puff(p, { color: 0xff8050, size: .06, grow: 0, life: .35, opacity: 1, additive: true, gravity: 9, vel: v });
    }
  }
}
