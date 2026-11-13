// Falling rain: one instanced mesh of thin, camera-facing streaks, every one falling in the vertex shader (no per-drop work on the CPU), so the whole rainfall is a single draw call.
// After Unseen's WebGL Rain demo (billboard streaks wrapped in a box that follows the view), minus its refracted scene copy: ours are pale, soft, slightly transparent lines. The streaks are fixed to the
// world and wrap round the camera's focus, so moving doesn't make the rain slide with the view. They are on the default layer only, so the puddles' mirror leaves them out.
import * as THREE from 'three';

const vertexShader = /* glsl */`
attribute vec4 aRand;   // x, z (0..1) the streak's column in the box, y its phase down the fall, w its speed (about 1)
uniform float uTime, uHeight, uSpeed, uLength, uWidth;
uniform vec2 uFocus, uArea, uSlant, uView; // uView: the drawing buffer's size in pixels
varying vec2 vUv;
varying float vK;
void main() {
  vUv = uv;
  // the column wrapped round the focus: it stays where it is in the world until it leaves the box, then reappears on the other side
  vec2 col = mod( aRand.xy * uArea - uFocus, uArea ) + uFocus - uArea * .5;
  float fall = mod( aRand.z * uHeight + uTime * uSpeed * aRand.w, uHeight );
  vec3 head = vec3( col.x + uSlant.x * fall, uHeight - fall, col.y + uSlant.y * fall );
  vec3 dir = normalize( vec3( uSlant.x, -1.0, uSlant.y ) );
  vec4 ca = projectionMatrix * viewMatrix * vec4( head, 1.0 ), cb = projectionMatrix * viewMatrix * vec4( head - dir * uLength, 1.0 ); // (the tail is above the head: the drop is falling)
  // the streak is drawn at least 2.4 pixels wide, with its opacity cut in proportion (the same amount of light): a hairline of one pixel or less can only be sampled as stair-steps and dots, 4x multisampling or not;
  // at this width the soft fade across the streak is a proper antialias
  vec2 sa = ca.xy / ca.w * uView * .5, sb = cb.xy / cb.w * uView * .5, axis = sb - sa; float len = length( axis ); axis = len > 1e-3 ? axis / len : vec2( 0.0, 1.0 );
  float natural = uWidth * projectionMatrix[1][1] / abs( ca.w ) * uView.y * .5, wPx = max( natural, 2.4 );
  vK = natural / wPx;
  vec4 c = mix( ca, cb, uv.y );
  c.xy += vec2( - axis.y, axis.x ) * ( uv.x - .5 ) * wPx * 2.0 / uView * c.w;
  gl_Position = c;
}`;
const fragmentShader = /* glsl */`
uniform float uOpacity;
varying vec2 vUv;
varying float vK;
void main() {
  float across = 1.0 - abs( vUv.x * 2.0 - 1.0 ), along = smoothstep( 0.0, .25, vUv.y ) * smoothstep( 1.0, .5, vUv.y ); // (soft at the sides and at both ends, brightest toward the head)
  gl_FragColor = vec4( vec3( .84, .9, 1.0 ), uOpacity * across * along * vK );
}`;

// Splashes where the rain lands, on the ground and on the roofs (the height map says how high the surface is under each spot): a flat ring spreading out and a few tiny droplets thrown up and falling back.
// Each splash instance lands a new drop at a new spot every period; it is only on screen for the first part of it (the rest of the time its quad is clipped away).
const splashVertex = /* glsl */`
attribute vec4 aRand;
uniform float uTime, uPeriod, uSize, uHmax;
uniform vec2 uFocus, uArea;
uniform vec4 uMap;
uniform sampler2D tHeight;
varying vec2 vUv;
varying float vAge, vSeed;
float hash( float n ) { return fract( sin( n * 127.1 ) * 43758.5453 ); }
void main() {
  vUv = uv;
  float cyc = uTime / uPeriod + aRand.z, age = fract( cyc ), id = floor( cyc );
  vAge = age / .32; vSeed = aRand.w + id * .731;
  vec2 col = mod( aRand.xy * uArea - uFocus, uArea ) + uFocus - uArea * .5 + vec2( hash( id + aRand.w * 31.0 ), hash( id * 1.7 + aRand.w * 17.0 ) ) * 3.0 - 1.5; // (a new spot each time)
  float h = texture2D( tHeight, ( col - uMap.xy ) / uMap.zw ).r * uHmax;
  vec4 c = viewMatrix * vec4( col.x, h + .1, col.y, 1.0 );
  c.xy += ( uv - .5 ) * uSize;
  gl_Position = age > .32 ? vec4( 2.0, 2.0, 2.0, 1.0 ) : projectionMatrix * c; // (out of the picture while there is no splash)
}`;
const splashFragment = /* glsl */`
uniform float uOpacity;
varying vec2 vUv;
varying float vAge, vSeed;
float hash( float n ) { return fract( sin( n * 127.1 ) * 43758.5453 ); }
void main() {
  vec2 p = ( vUv - .5 ) * 2.0; float t = vAge;
  float ring = abs( length( vec2( p.x, p.y * 2.2 ) ) - .12 - t * .6 );
  float a = smoothstep( .1, .0, ring ) * ( 1.0 - t ) * .55;
  for ( int k = 0; k < 5; k ++ ) {
    float fk = float( k ), ang = 6.283 * hash( fk + vSeed * 7.0 ), sp = .3 + .4 * hash( fk + vSeed * 3.0 + 9.0 ), hgt = .5 + .5 * hash( fk + vSeed * 5.0 + 4.0 );
    vec2 d = vec2( cos( ang ) * t * sp, sin( ang ) * t * sp * .3 + ( t * 1.2 - t * t * 1.9 ) * hgt );
    a += smoothstep( .1, .025, length( p - d ) ) * ( 1.0 - t );
  }
  gl_FragColor = vec4( vec3( .88, .93, 1.0 ), clamp( a, 0.0, 1.0 ) * uOpacity );
}`;

export class Rain {
  // cfg: { count, area: [x, z] m, height m, speed m/s, slant: [x, z] (m sideways per m fallen), length m, width m, opacity }
  constructor(scene, cfg = {}) {
    const { count = 1600, area = [84, 64], height = 22, speed = 20, slant = [.12, .05], length = 1.7, width = .045, opacity = .38 } = cfg;
    this.max = count; this.amount = 1; this.storm = 0; this.baseOpacity = opacity; this.baseSlant = slant[0];
    const CAP = cfg.stormCap ?? 1; this.cap = CAP; // (stormCap: room for that many times the streaks and splashes, so the storm can thicken the rain; see setStorm)
    const geo = new THREE.InstancedBufferGeometry(); geo.index = new THREE.PlaneGeometry(1, 1).index;
    const plane = new THREE.PlaneGeometry(1, 1); geo.setAttribute('position', plane.attributes.position); geo.setAttribute('uv', plane.attributes.uv); geo.instanceCount = count;
    const rand = new Float32Array(Math.round(count * CAP) * 4); for (let i = 0; i < rand.length; i += 4) { rand[i] = Math.random(); rand[i + 1] = Math.random(); rand[i + 2] = Math.random(); rand[i + 3] = .85 + Math.random() * .3; }
    geo.setAttribute('aRand', new THREE.InstancedBufferAttribute(rand, 4));
    this.uniforms = { uTime: { value: 0 }, uHeight: { value: height }, uSpeed: { value: speed }, uLength: { value: length }, uWidth: { value: width }, uFocus: { value: new THREE.Vector2() }, uArea: { value: new THREE.Vector2(area[0], area[1]) },
      uSlant: { value: new THREE.Vector2(slant[0], slant[1]) }, uOpacity: { value: opacity }, uView: { value: new THREE.Vector2(1680, 945) } };
    this.geo = geo;
    this.mesh = new THREE.Mesh(geo, new THREE.ShaderMaterial({ uniforms: this.uniforms, vertexShader, fragmentShader, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
    this.mesh.onBeforeRender = r => { r.getDrawingBufferSize(this._sz ??= new THREE.Vector2()); this.uniforms.uView.value.copy(this._sz); }; // (the streaks' width in pixels needs the drawing buffer's size)
    this.mesh.frustumCulled = false; this.mesh.renderOrder = 8; this.mesh.userData.noWater = true; scene.add(this.mesh);
    // the splashes
    const n = cfg.splashes ?? 2880; this.maxSplash = n; const nCap = Math.round(n * CAP);
    const sg = new THREE.InstancedBufferGeometry(); sg.index = plane.index; sg.setAttribute('position', plane.attributes.position); sg.setAttribute('uv', plane.attributes.uv); sg.instanceCount = n;
    const sr = new Float32Array(nCap * 4); for (let i = 0; i < sr.length; i++) sr[i] = Math.random();
    sg.setAttribute('aRand', new THREE.InstancedBufferAttribute(sr, 4));
    this.heightTex = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1, THREE.RGBAFormat); this.heightTex.needsUpdate = true;
    this.sUniforms = { uTime: this.uniforms.uTime, uFocus: this.uniforms.uFocus, uArea: this.uniforms.uArea, uPeriod: { value: height / speed }, uSize: { value: .69 }, uHmax: { value: 12 }, uMap: { value: new THREE.Vector4(0, 0, 1, 1) },
      tHeight: { value: this.heightTex }, uOpacity: { value: cfg.splashOpacity ?? .7 } };
    this.sGeo = sg;
    this.splash = new THREE.Mesh(sg, new THREE.ShaderMaterial({ uniforms: this.sUniforms, vertexShader: splashVertex, fragmentShader: splashFragment, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
    this.splash.frustumCulled = false; this.splash.renderOrder = 9; this.splash.userData.noWater = true; scene.add(this.splash);
  }
  // fn(x, z): how high the surface is there (the roofs; 0 on the ground). size: { W, L, cell } of the map.
  setHeights(fn, { W, L, cell }, boxes = []) { // boxes: { x, z, hw, hd, h } other things the rain lands on (jets, crates, sandbags...)
    const cols = Math.ceil(W / cell), rows = Math.ceil(L / cell), d = new Uint8Array(cols * rows * 4);
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) { const h = Math.min(12, fn(-W / 2 + (c + .5) * cell, -L + (r + .5) * cell)), i = (r * cols + c) * 4; d[i] = d[i + 1] = d[i + 2] = Math.round(h / 12 * 255); d[i + 3] = 255; }
    for (const b of boxes) {
      // (the cells whose CENTRE lies under the box, so the ground beside it keeps its own height; a box smaller than a cell still marks the one it stands in)
      let c0 = Math.max(0, Math.ceil((b.x - b.hw + W / 2) / cell - .5)), c1 = Math.min(cols - 1, Math.floor((b.x + b.hw + W / 2) / cell - .5)), r0 = Math.max(0, Math.ceil((b.z - b.hd + L) / cell - .5)), r1 = Math.min(rows - 1, Math.floor((b.z + b.hd + L) / cell - .5));
      if (c1 < c0) c0 = c1 = Math.min(cols - 1, Math.max(0, Math.floor((b.x + W / 2) / cell))); if (r1 < r0) r0 = r1 = Math.min(rows - 1, Math.max(0, Math.floor((b.z + L) / cell)));
      const v = Math.round(Math.min(12, b.h) / 12 * 255);
      for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) { const i = (r * cols + c) * 4; if (d[i] < v) d[i] = d[i + 1] = d[i + 2] = v; }
    }
    const t = new THREE.DataTexture(d, cols, rows, THREE.RGBAFormat); t.minFilter = t.magFilter = THREE.NearestFilter; t.needsUpdate = true;
    this.sUniforms.tHeight.value = t; this.sUniforms.uMap.value.set(-W / 2, -L, cols * cell, rows * cell);
  }
  // The graphics level's share of the rain: 0 none, 1 all of it.
  setAmount(k) { this.amount = k; this.mesh.visible = k > 0; this.splash.visible = k > 0; this.count(); }
  // The storm (0 .. 1): more streaks, heavier and slanting harder, and more splashes where they land.
  setStorm(k) { if (Math.abs(k - this.storm) < .004) return; this.storm = k; this.uniforms.uOpacity.value = this.baseOpacity * (1 + .4 * k); this.uniforms.uSlant.value.x = this.baseSlant * (1 + 1.2 * k); this.count(); }
  count() { const m = 1 + (this.cap - 1) * this.storm; this.geo.instanceCount = Math.round(this.max * this.amount * m); this.sGeo.instanceCount = Math.round(this.maxSplash * this.amount * m); }
  update(dt, focus) { this.uniforms.uTime.value += dt; this.uniforms.uFocus.value.set(focus.x, focus.z); }
}
