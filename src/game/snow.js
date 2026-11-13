// Falling snow: one instanced mesh of soft, camera-facing flakes, all moved in the vertex shader (one draw call, no per-flake CPU work). Like rain.js the flakes are fixed to the world and wrap round the
// camera's focus. They drift sideways on a slow sine, and `wind` (0..1) leans the fall and thickens it toward a blizzard. Default layer only, so mirrors and the water pass leave them out.
import * as THREE from 'three';

const vertexShader = /* glsl */`
attribute vec4 aRand;   // x, z: the flake's column in the box (0..1); y: phase down the fall; w: speed / size factor
uniform float uTime, uHeight, uSpeed, uSize, uWind, uBase, uPhase, uGust; // uPhase: the distance the snow has fallen, added up a frame at a time on the CPU (so a change of speed changes the speed from then on, never the flakes' places); uGust: the wind's swell, 0..1 // uBase: the world height the box stands on (the camera's focus: up on the mountain the snow falls round the jeep, not down at sea level where the ground is above it)
uniform vec2 uFocus, uArea;
varying vec2 vUv;
varying float vFade;
varying float vLen;
float h1( float n ) { return fract( sin( n * 127.1 ) * 43758.5453 ); }
float vn( float x ) { float i = floor( x ), f = fract( x ); f = f * f * ( 3.0 - 2.0 * f ); return mix( h1( i ), h1( i + 1.0 ), f ); } // (smooth 1-D noise: wandering, never repeating, unlike a sine)
void main() {
  vUv = uv;
  vec2 col = mod( aRand.xy * uArea - uFocus, uArea ) + uFocus - uArea * .5;
  // the wind blows one way (west to east), and its strength wanders slowly over the whole area at once: a broad swell and lull every few seconds, not bands racing across
  float gk = uWind * uGust;
  float fall = mod( aRand.z * uHeight + uPhase * ( .75 + .5 * aRand.w ), uHeight );
  float ph = aRand.x * 40.0 + aRand.y * 23.0;
  float sp = uSpeed * ( .75 + .5 * aRand.w ) * ( 1.0 + .25 * gk ), lean = uWind * ( 14.0 + 8.0 * uGust ) * ( .8 + .4 * aRand.w ); // (big flakes are carried further: they have more to catch the wind)
  // turbulence: each flake is jostled by smooth noise of its own (side to side and in depth), more in a heavier wind
  float tx = vn( uTime * .7 + ph ) - .5, tz = vn( uTime * .6 + ph * 1.7 + 11.0 ) - .5;
  vec3 p = vec3( col.x + lean * fall / uHeight + ( tx * 1.0 + ( vn( uTime * 1.9 + ph * 3.0 ) - .5 ) * 1.4 * uWind ), uBase + uHeight - fall, col.y + tz * 1.0 + ( vn( uTime * 1.6 + ph * 2.3 ) - .5 ) * 1.4 * uWind );
  vec3 vel = vec3( lean * sp / uHeight, -sp, 0.0 );
  // the flake is a short streak along its own motion on the screen: the faster it moves the longer, so a blizzard's flakes are slanting lines, not dots
  vec4 v = viewMatrix * vec4( p, 1.0 );
  vec2 d = ( viewMatrix * vec4( vel, 0.0 ) ).xy * ( .018 + .06 * uWind ); // (the motion blur: a streak as long as the flake moves in about a twentieth of a second)
  float dl = length( d ); vec2 along = dl > 1e-4 ? d / dl : vec2( 0.0, 1.0 ), perp = vec2( -along.y, along.x );
  float sz = uSize * ( .6 + .8 * aRand.w ), len = sz + dl;
  v.xy += along * ( uv.x - .5 ) * len + perp * ( uv.y - .5 ) * sz;
  vLen = clamp( dl / ( sz + dl ), 0.0, 1.0 );
  vFade = smoothstep( 0.0, 1.5, uHeight - fall ) * smoothstep( 0.0, 2.0, fall ) * ( .9 + .25 * gk ); // (no pop at the top of the box or at the ground)
  gl_Position = projectionMatrix * v;
}`;
const fragmentShader = /* glsl */`
uniform float uOpacity;
varying vec2 vUv;
varying float vFade;
varying float vLen;
void main() {
  // a soft round head for a still flake, an elongated streak (bright at one end, tapering behind it) for a fast one
  float x = abs( vUv.x - .5 ) * 2.0, y = abs( vUv.y - .5 ) * 2.0, a;
  float head = smoothstep( 1.0, .2, length( vec2( x, y ) ) );
  float streak = smoothstep( 1.0, .0, y ) * smoothstep( 1.0, .15, x ) * ( .4 + .6 * vUv.x );
  a = mix( head, streak, vLen );
  gl_FragColor = vec4( .96, .98, 1.0, a * uOpacity * vFade );
}`;

export class Snow {
  // cfg: { count, area: [x, z] m, height m, speed m/s, size m, opacity }
  constructor(scene, cfg = {}) {
    const { count = 2400, area = [60, 46], height = 18, speed = 1.6, size = .13, opacity = .85 } = cfg;
    this.max = count; this.amount = 1; this.level = 1; this.cap = cfg.blizzardCap ?? 3; // (room for this many times the flakes, for the blizzard)
    const geo = new THREE.InstancedBufferGeometry(), plane = new THREE.PlaneGeometry(1, 1); geo.index = plane.index;
    geo.setAttribute('position', plane.attributes.position); geo.setAttribute('uv', plane.attributes.uv);
    const n = Math.round(count * this.cap), rand = new Float32Array(n * 4); for (let i = 0; i < rand.length; i++) rand[i] = Math.random();
    geo.setAttribute('aRand', new THREE.InstancedBufferAttribute(rand, 4));
    this.geo = geo; this.baseSpeed = speed; this.baseSize = size;
    this.uniforms = { uTime: { value: 0 }, uHeight: { value: height }, uSpeed: { value: speed }, uSize: { value: size }, uWind: { value: 0 }, uBase: { value: 0 }, uPhase: { value: 0 }, uGust: { value: .5 }, uFocus: { value: new THREE.Vector2() }, uArea: { value: new THREE.Vector2(...area) }, uOpacity: { value: opacity } };
    this.mesh = new THREE.Mesh(geo, new THREE.ShaderMaterial({ uniforms: this.uniforms, vertexShader, fragmentShader, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
    this.mesh.frustumCulled = false; this.mesh.renderOrder = 8; this.mesh.userData.noWater = true; scene.add(this.mesh); this.set(0, 0);
  }
  // density 0..1 (none .. steady snowfall), blizzard 0..1 (thicker still, and the wind leans it)
  set(density, blizzard = 0) { this.density = density; this.blizzard = blizzard; this.uniforms.uWind.value = blizzard; this.uniforms.uSpeed.value = this.baseSpeed * (1 + 1.7 * blizzard) * (1 + .18 * blizzard); this.uniforms.uSize.value = this.baseSize * (1 + .55 * blizzard) * (1 - .25 * blizzard); this.mesh.visible = density * this.amount > 0; this.geo.instanceCount = Math.round(this.max * density * this.amount * (1 + (this.cap - 1) * blizzard)); }
  setAmount(k) { this.amount = k; this.set(this.density, this.blizzard); } // the graphics level's share
  update(dt, focus) {
    this.t = (this.t ?? 0) + dt; const u = this.uniforms;
    const g = .5 + .5 * Math.sin(this.t * .52) * Math.sin(this.t * .21 + 1.3) * .5 + .25 * Math.sin(this.t * .33 + .4); // (the swell: smooth, slow, irregular)
    u.uGust.value += (Math.min(1, Math.max(0, g)) - u.uGust.value) * Math.min(1, dt * 1.2);
    u.uPhase.value += dt * u.uSpeed.value * (1 + .25 * u.uWind.value * u.uGust.value); // (the fall: its speed changes smoothly, the flakes never jump)
    u.uTime.value += dt; this.uniforms.uFocus.value.set(focus.x, focus.z); this.uniforms.uBase.value = focus.y ?? 0; }
}
