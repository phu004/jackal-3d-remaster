// Burning wrecks: shader flames, rising embers, smoke and a flickering firelight. Fires burn
// forever, surging and settling in slow gusts.
//
// Each flame is a camera-facing quad whose fragment shader builds the fire procedurally: two
// layers of noise scroll upward at different speeds, the shape tapers from a wide base into
// licking tongues, and the colour ramps white-yellow -> orange -> deep red. Drawn additively.
import { PUDDLE } from './puddles.js';
import * as THREE from 'three';
import { addToLayer, REFLECT, UNDERWATER } from './layers.js';

const vertexShader = /* glsl */`
attribute float aSeed;  // per flame (instanced): its noise seed and how hard it's burning
attribute float aPower;
attribute float aTint;  // 0: the usual orange fire; 1: a cold teal-blue one (the gate cannons' plasma)
varying vec2 vUv;
varying float vSeed;
varying float vPower;
varying float vTint;
void main() {
  vUv = uv; vSeed = aSeed; vPower = aPower; vTint = aTint;
  // billboard: keep the quad's centre, but lay it out in view space so it always faces the camera
  vec4 mv = modelViewMatrix * instanceMatrix * vec4( 0.0, 0.0, 0.0, 1.0 );
  vec3 scale = vec3( length( instanceMatrix[0].xyz ), length( instanceMatrix[1].xyz ), 1.0 );
  float up = ( viewMatrix * vec4( 0.0, 1.0, 0.0, 0.0 ) ).y < 0.0 ? -1.0 : 1.0; // (the puddle mirror's camera is upside down: the flame must still grow toward world-up, not into the ground)
  // the flame's up is mostly the world's up as the camera sees it (not always screen-up): seen from a high angle, a flame away from the middle of the screen leans outward, like anything standing on the ground; a quarter of
  // screen-up is kept so that it doesn't get squashed flat. Its width runs across that, facing the camera.
  vec3 wu = normalize( ( viewMatrix * vec4( 0.0, 1.0, 0.0, 0.0 ) ).xyz );
  vec3 upV = normalize( mix( vec3( 0.0, up, 0.0 ), wu, 0.75 ) );
  vec3 rightV = normalize( cross( normalize( mv.xyz ), upV ) );
  mv.xyz += rightV * position.x * scale.x + upV * position.y * scale.y;
  mv.z += 0.9; // nudged toward the camera, so a flame standing in a cell doesn't slice through the lid or rim beside it
  gl_Position = projectionMatrix * mv;
}`;

const fragmentShader = /* glsl */`
uniform float uTime;
varying vec2 vUv;
varying float vSeed;
varying float vPower;   // 0..1, how hard it's burning
varying float vTint;

float hash( vec2 p ) { return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453 ); }
float noise( vec2 p ) {
  vec2 i = floor( p ), f = fract( p ), u = f * f * ( 3.0 - 2.0 * f );
  return mix( mix( hash( i ), hash( i + vec2( 1.0, 0.0 ) ), u.x ), mix( hash( i + vec2( 0.0, 1.0 ) ), hash( i + vec2( 1.0, 1.0 ) ), u.x ), u.y );
}
float fbm( vec2 p ) {
  float v = 0.0, a = 0.5;
  for ( int i = 0; i < 4; i++ ) { v += a * noise( p ); p *= 2.1; a *= 0.5; }
  return v;
}

void main() {
  float t = uTime, y = vUv.y, x = ( vUv.x - 0.5 ) * 2.0;   // x -1..1 across, y 0 (base) .. 1 (tip)
  // Hot air carries the fire up in rolling turbulence: two layers of noise scroll upward, the second one bent by the first (domain warping), so the tongues curl and fold instead of sliding past
  // as a fixed pattern. The flame is also swayed as a whole by a slow gust, more toward the top.
  vec2 p = vec2( x * 1.3 + vSeed * 7.0, y * 2.0 - t * 2.3 );
  float w1 = fbm( p * 0.9 + vec2( 0.0, vSeed ) );
  float w2 = fbm( p * 2.1 + vec2( 5.2, - t * 1.7 ) - w1 * 1.6 );
  float sway = ( fbm( vec2( y * 1.5 - t * 0.8, vSeed * 3.0 ) ) - 0.5 ) * 1.25 * y + ( w1 - 0.5 ) * 0.35 * y;
  float qx = x - sway;
  // a body that narrows to the tip, hotter in the middle, cooled and eaten away by the turbulence with height: licking tongues, holes and flicks that break off near the top
  float width = mix( 0.85, 0.14, pow( y, 0.75 ) );
  float body = 1.0 - abs( qx ) / width;
  float heat = body * 1.3 + ( w2 - 0.45 ) * ( 0.7 + 1.5 * y ) - y * 0.6;
  heat *= vPower * smoothstep( 0.0, 0.07, y );
  // a soft glow hugging the base, where the fuel is
  float glow = exp( - length( vec2( x * 0.8, ( y - 0.1 ) * 1.7 ) ) * 3.2 ) * 0.4 * vPower;
  // the blackbody colour ramp: dull red at the cooling edges, orange, yellow, and a pale white-yellow core
  vec3 col = vec3( 0.32, 0.03, 0.0 );
  col = mix( col, vec3( 1.0, 0.3, 0.02 ), smoothstep( 0.1, 0.4, heat ) );
  col = mix( col, vec3( 1.0, 0.72, 0.16 ), smoothstep( 0.4, 0.72, heat ) );
  col = mix( col, vec3( 1.0, 0.95, 0.72 ), smoothstep( 0.72, 1.05, heat ) * ( 1.0 - y * 0.5 ) );
  if ( vTint > 0.5 && vTint < 1.5 ) { // the same flame in cold colours: deep blue at the cooling edges, teal, cyan, and a white-cyan core
    col = vec3( 0.0, 0.07, 0.3 );
    col = mix( col, vec3( 0.0, 0.5, 0.8 ), smoothstep( 0.1, 0.4, heat ) );
    col = mix( col, vec3( 0.12, 0.92, 0.95 ), smoothstep( 0.4, 0.72, heat ) );
    col = mix( col, vec3( 0.85, 1.0, 1.0 ), smoothstep( 0.72, 1.05, heat ) * ( 1.0 - y * 0.5 ) );
  }
  if ( vTint > 1.5 ) { // a road flare: a hard, deep red burn with a pink-white heart
    col = vec3( 0.28, 0.0, 0.0 );
    col = mix( col, vec3( 1.0, 0.07, 0.02 ), smoothstep( 0.1, 0.4, heat ) );
    col = mix( col, vec3( 1.0, 0.3, 0.2 ), smoothstep( 0.4, 0.72, heat ) );
    col = mix( col, vec3( 1.0, 0.8, 0.72 ), smoothstep( 0.72, 1.05, heat ) * ( 1.0 - y * 0.5 ) );
  }
  float a = clamp( smoothstep( 0.05, 0.3, heat ) + glow, 0.0, 1.0 );
  gl_FragColor = vec4( col * a * 1.3, a );
}`;

const quad = new THREE.PlaneGeometry(1, 1).translate(0, .5, 0); // base at the origin
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3();
const BURN_OUT = 8; // s a fire with a limited life takes to die down
const LIGHT_RANGE = 36; // m: a fire this close to the camera focus gets a light (the screen reaches about 22 m from the focus, and the light itself 14 m beyond a fire)
const PARTICLE_RANGE = 70; // only fires this close to the camera spawn embers and smoke

export class Fires {
  constructor(scene, fx) {
    this.scene = scene; this.fx = fx; this.fires = []; this.time = 0; this.cap = 8; this.count = 0;
    // Every flame of every fire is one instance of one mesh (one draw call, however many burn): see update()
    this.flameMat = new THREE.ShaderMaterial({ uniforms: { uTime: { value: 0 } }, vertexShader, fragmentShader, transparent: true, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
    this.makeFlameMesh(64);
    // A pool of firelights (idle at 0), handed to the nearest fires; how many are switched on is the graphics level's say (setLights).
    // Adding or removing lights at runtime would recompile every material, so the pool is fixed and the spare ones are just hidden.
    this.lights = Array.from({ length: 16 }, (_, i) => i).map(() => { const l = new THREE.PointLight(0xff7a2a, 0, 14, 2); l.visible = false; scene.add(addToLayer(l, REFLECT, UNDERWATER)); return l; }); // (in every view: see fx.js)
    this.show(this.cap); // (on from the start, at zero brightness: see setLights)
  }

  // The graphics level's ceiling on firelights. While a burning fire is within reach of the camera all of them are visible, otherwise none (a visible light costs every pixel
  // of everything at least its distance check, so a fire left behind in the level costs nothing). Going from none to all recompiles the materials the first time
  // (a short stutter once; three.js keeps the programs after that. Doing it behind the loading screen too made every load slower).
  setLights(n) { this.cap = n; this.show(n); } // (the lights stay switched on at zero brightness whether or not a fire is near: a light switched on or off changes every lit material's shader, a stall of most of a second when it is first met in play)
  show(n) { this.count = n; this.lights.forEach((l, i) => { l.visible = i < n; }); }

  makeFlameMesh(cap) {
    if (this.flameMesh) { this.scene.remove(this.flameMesh); this.flameMesh.geometry.dispose(); this.flameMesh.dispose(); }
    const g = quad.clone();
    this.seedAttr = new THREE.InstancedBufferAttribute(new Float32Array(cap), 1).setUsage(THREE.DynamicDrawUsage);
    this.powerAttr = new THREE.InstancedBufferAttribute(new Float32Array(cap), 1).setUsage(THREE.DynamicDrawUsage);
    this.tintAttr = new THREE.InstancedBufferAttribute(new Float32Array(cap), 1).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('aSeed', this.seedAttr); g.setAttribute('aPower', this.powerAttr); g.setAttribute('aTint', this.tintAttr);
    const m = this.flameMesh = new THREE.InstancedMesh(g, this.flameMat, cap);
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.renderOrder = 5; m.frustumCulled = false; m.count = 0; m.visible = false; m.userData.fxBatch = true; // (everywhere at once: not culled by position, see world.js)
    m.layers.enable(PUDDLE); m.layers.enable(REFLECT); // (the flames are mirrored in stage 6's puddles, and in the water and the ice)
    this.flameCap = cap; this.scene.add(m);
  }

  // Set something burning: `spots` are world positions for the flames (on the floor of the wreck).
  start(spots, scale = 1, life = Infinity, tint = 0, burnOut = BURN_OUT, lightOnly = false) { // lightOnly: no flames, embers or smoke: only the firelight (the gate cannons' plasma, which draws itself) // tint 1: a teal-blue fire (no smoke); burnOut: how long it takes to die down once its life is up // scale: how big the flames and smoke are (1 = a wrecked building; the warship's launchers burn smaller)
    const flames = lightOnly ? [] : spots.flatMap((p, i) => [0, 1].map(layer => {
      // one main blaze, smaller ones round it; each spot has a wide and a narrower, taller flame
      const big = (i === 0 ? 1.3 : .8 + Math.random() * .5) * (layer ? .8 : 1) * scale;
      return { // (position is read and moved by the caller, as a mesh's would be)
        position: p.clone().add(new THREE.Vector3((Math.random() - .5) * .5 * layer, 0, (Math.random() - .5) * .5 * layer)),
        userData: { size: new THREE.Vector2((layer ? 1.1 : 1.7) * big, (layer ? 2.9 : 2.3) * big), gust: Math.random() * 10, seed: Math.random() * 100, tint },
      };
    }));
    const centre = spots.reduce((a, p) => a.add(p), new THREE.Vector3()).multiplyScalar(1 / spots.length);
    const fire = { flames, centre, age: 0, ember: 0, smoke: 0, scale, life, tint, burnOut, lightOnly };
    this.fires.push(fire);
    return fire;
  }

  // Draw a fire's parts once behind the loading screen, so their shaders are built there and not at the first blaze (that cost a stall of nearly a second: the flames' shader and the
  // two kinds of puff a fire gives off, embers and smoke, which only exist once something burns). The fire is 1.5 km away: flames are drawn wherever they are (never culled), it is out of
  // reach of the firelights and the smoke (so nothing else switches on), and it is gone again after BURN_OUT seconds.
  async prewarm(renderer, scene, camera, compile = async () => renderer.compile(scene, camera)) { // compile: builds the scene's shaders (main.js: in steps, showing a count)
    const far = new THREE.Vector3(0, 0, 1500), once = { size: .1, grow: 0, life: .05, opacity: .01, reflect: false };
    this.start([far], 1, 0);
    this.fx.puff(far, { ...once, additive: true }); this.fx.puff(far, once); // (the ember batch and the smoke batch)
    this.fx.update(.001); this.update(.001, null);
    // compiled now, not left to the first frames: everything in the level at once, even what is hidden until the jeep comes near (a material first seen mid-game is built then, a stall), with the
    // firelights off and then on (the materials are built for the number of lights, so the first blaze rebuilt every one in view)
    const hid = []; scene.traverse(o => { if (!o.visible && !o.isLight) { hid.push(o); o.visible = true; } });
    await compile('FIRE SHADERS 1/2');
    this.show(this.cap); await compile('FIRE SHADERS 2/2');
    this.show(this.cap); for (const o of hid) o.visible = false;
    this.fires.length = 0; this.update(.001, null);
  }

  // Put a fire out (it has gone under water, say): its flames taken away. Returns where it was.
  douse(f) {
    const i = this.fires.indexOf(f);
    if (i < 0) return f.centre;
    this.fires.splice(i, 1);
    return f.centre;
  }

  update(dt, focus) {
    this.time += dt;
    let near = 0; // fires giving off smoke and embers this frame: with many, each gives off less (every puff is a draw call in each view)
    for (const f of this.fires) if (!focus || f.centre.distanceTo(focus) < PARTICLE_RANGE) near++;
    const crowd = Math.max(1, near / 2);
    near = 0;
    let total = 0; for (const f of this.fires) total += f.flames.length;
    if (total > this.flameCap) this.makeFlameMesh(Math.max(total, this.flameCap * 2));
    this.flameMat.uniforms.uTime.value = this.time;
    let n = 0; // flames written into the instanced mesh this frame
    for (let i = this.fires.length - 1; i >= 0; i--) {
      const f = this.fires[i];
      f.age += dt;
      // flare up fast, then burn on, surging and settling in slow gusts
      const out = (f.age - f.life) / (f.burnOut ?? BURN_OUT); // a fire given a life dies down over BURN_OUT s once that is up, and is taken away
      if (out >= 1) { this.fires.splice(i, 1); continue; }
      const power = Math.min(1, f.age / .6) * (out > 0 ? 1 - out : 1);
      f.power = power;
      for (const m of f.flames) {
        const g = m.userData.gust;
        const gust = .85 + .1 * Math.sin(this.time * .7 + g) + .06 * Math.sin(this.time * 1.9 + g * 2);
        const s = m.userData.size, k = (.4 + .6 * power) * gust;
        _m.compose(m.position, _q, _s.set(s.x * k, s.y * k, 1)); this.flameMesh.setMatrixAt(n, _m);
        this.seedAttr.setX(n, m.userData.seed); this.powerAttr.setX(n, power * Math.min(1, gust + .1)); this.tintAttr.setX(n, m.userData.tint ?? 0); n++;
      }
      f.near = !focus || f.centre.distanceTo(focus) < PARTICLE_RANGE;
      if (f.near) near++;
      if (!f.near || f.lightOnly) continue; // far away: flames only, no embers or smoke (and a fire that is only a light has none)
      // embers drifting up and smoke while it burns
      f.ember -= dt;
      for (; f.ember <= 0; f.ember += .13 * crowd / Math.max(power, .05)) {
        const from = f.flames[Math.floor(Math.random() * f.flames.length)].position;
        this.fx.puff(from.clone().add(new THREE.Vector3((Math.random() - .5) * 1.2, .5 + Math.random(), (Math.random() - .5) * 1.2)), {
          color: f.tint === 2 ? (Math.random() > .35 ? 0xff2a14 : 0xff7a66) : f.tint === 1 ? (Math.random() > .3 ? 0x30d8ff : 0xc0ffff) : Math.random() > .3 ? 0xffa040 : 0xffe080, size: .05 + Math.random() * .04, grow: 0, life: 1 + Math.random() * 1.2, opacity: 1,
          additive: true, reflect: false, gravity: -1.5, vel: new THREE.Vector3((Math.random() - .5) * 1.2 + .3, 2 + Math.random() * 2.5, (Math.random() - .5) * 1.2 - .2),
        });
      }
      // The flame's particle layers, pooled in the fx batches (one draw call a kind, however many burn): a short-lived bright core, orange body tongues that flicker upward, and red wisps at the edges that
      // die in a fraction of a second. They shrink as they rise. With many fires each gives fewer (crowd), and a fire far from the view gives none (this block is the near fires' only).
      f.tongue = (f.tongue ?? 0) - dt;
      for (; f.tongue <= 0; f.tongue += .075 * crowd / Math.max(power, .1)) {
        const from = f.flames[Math.floor(Math.random() * f.flames.length)].position, k = f.scale * (.6 + .5 * power), j = () => (Math.random() - .5) * 2;
        const at = (h, spread) => from.clone().add(new THREE.Vector3(j() * spread * k, h * k, j() * spread * k));
        this.fx.puff(at(.3, .35), { color: f.tint === 2 ? (Math.random() > .35 ? 0xff2a14 : 0xff7a66) : f.tint === 1 ? 0xd8ffff : 0xfff0b0, size: .36 * k, grow: -.6, life: .3 + Math.random() * .25, opacity: .85, additive: true, soft: true, reflect: false, gravity: -1, vel: new THREE.Vector3(j() * .2, .8 + Math.random() * .8, j() * .2) });
        if (Math.random() < .85) this.fx.puff(at(.5, .55), { color: f.tint === 2 ? (Math.random() > .35 ? 0xff2a14 : 0xff7a66) : f.tint === 1 ? (Math.random() > .5 ? 0x20c8ff : 0x30a8ff) : Math.random() > .5 ? 0xff7a18 : 0xff9a2a, size: (.4 + Math.random() * .25) * k, grow: -.55, life: .55 + Math.random() * .4, opacity: .55, additive: true, soft: true, reflect: false, gravity: -1.6, vel: new THREE.Vector3(j() * .5, 1.4 + Math.random() * 1.4, j() * .5) });
        if (Math.random() < .6) this.fx.puff(at(.9, .7), { color: f.tint === 2 ? (Math.random() > .35 ? 0xff2a14 : 0xff7a66) : f.tint === 1 ? 0x2040d8 : 0xc4200a, size: (.16 + Math.random() * .13) * k, grow: -.4, life: .25 + Math.random() * .25, opacity: .8, additive: true, soft: true, reflect: false, gravity: -2.2, vel: new THREE.Vector3(j() * .9, 2.2 + Math.random() * 1.6, j() * .9) });
      }
      f.smoke -= dt;
      if (f.tint === 1) f.smoke = 1; // (a cold fire gives off no smoke)
      else for (; f.smoke <= 0; f.smoke += .3 * crowd) {
        const k = power;
        this.fx.puff(f.centre.clone().add(new THREE.Vector3((Math.random() - .5) * 1.5, 2.5, (Math.random() - .5) * 1.5)), {
          reflect: false, soft: true, color: Math.random() > .4 ? 0x2c2824 : 0x4a4640, size: (.75 + Math.random() * .35) * f.scale, grow: 3.0, life: 2.6, opacity: .6 * k, // (fewer, bigger puffs: each one is a draw call in every view)
          vel: new THREE.Vector3(.5 + (Math.random() - .5) * .4, 2.4 + Math.random(), -.35 + (Math.random() - .5) * .4),
        });
      }
    }
    const fm = this.flameMesh;
    fm.count = n; fm.visible = n > 0; fm.instanceMatrix.needsUpdate = true; this.seedAttr.needsUpdate = true; this.powerAttr.needsUpdate = true; this.tintAttr.needsUpdate = true;
    // firelights go to the fires nearest the camera, flickering
    const lit = this.fires.filter(f => {
      if (f.power <= 0 || !focus) return false;
      return (f.lit = f.centre.distanceTo(focus) < (f.lit ? LIGHT_RANGE + 4 : LIGHT_RANGE)); // (a little slack on the way out, so a fire at the edge doesn't flip the count back and forth)
    }).sort((a, b) => a.centre.distanceTo(focus) - b.centre.distanceTo(focus));
    const want = this.cap; // (always all of them: unlit ones are at intensity 0, and out of reach they cost almost nothing, see light-cull.js; see setLights)
    if (want !== this.count) this.show(want);
    this.lights.forEach((l, i) => {
      const f = lit[i];
      if (!f || i >= this.count) { l.intensity = 0; return; }
      l.position.copy(f.centre).setY(f.centre.y + 1.8);
      const flicker = .72 + .22 * Math.sin(this.time * 17 + i * 3) * Math.sin(this.time * 7.3 + i) + .1 * Math.sin(this.time * 41 + i * 5) + Math.random() * .12;
      l.intensity = 2.2 * f.power * flicker * (f.tint === 1 ? 1.15 : 1) * (f.lightK ?? 1);
      if (f.tint === 2) l.color.setHSL(.995, 1, .5); else if (f.tint) l.color.setHSL(.58, 1, .55); else l.color.setHSL(.055 + .02 * flicker, 1, .52); // (tint 2, a road flare: a deep red light) // (warmer and redder as it dims, yellower at the peaks)
      l.position.x += Math.sin(this.time * 9 + i * 2) * .25; l.position.z += Math.cos(this.time * 7 + i) * .25; // (a flickering fire throws its light from a wandering spot)
    });
  }
}
