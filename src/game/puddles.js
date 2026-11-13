// Stage 6's rain: a wet road. Not separate puddles but a wetness field laid over the whole road by world position (smooth noise at several scales):
//  - the road is darkened everywhere by wetness (the road's own colour times a factor, so concrete, cracks and the painted arrows stay visible, just soaked);
//  - on the wet road a rough, smeared reflection of the surroundings (the mirror image blurred, streaked, broken up by the asphalt's grit), stronger where it is wetter;
//  - where the wetness peaks, standing water: a feathered, solid mirror, sharp and bright, with a faint glint along its edge.
// The mirror image comes from the scene drawn again from a camera reflected in the road's surface (half resolution; buildings, tanks, the jeep and the barricades show in it).
import * as THREE from 'three';
import { REFLECT, SHADOW_ONLY } from './layers.js';
import { params } from './nav.js'; // (the page's parameters: the URL's query string is not always there, see nav.js)

// The puddles' layout comes from this seed. To choose one: open the game with ?puddleseed=N, or add ?seedpick=1 and press [ and ] to step through seeds (the number is shown in the page title), then put the one you like here.
const PUDDLE_SEED = 20240671;
let seedNow = Number(params.get('puddleseed')) || PUDDLE_SEED; const lattices = [];
function fillLattice(t) { const d = t.image.data; let seed = seedNow >>> 0; for (let i = 0; i < 256 * 256; i++) { seed = (seed * 1664525 + 1013904223) >>> 0; d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = seed >>> 24; d[i * 4 + 3] = 255; } t.needsUpdate = true; }
if (params.has('seedpick')) addEventListener('keydown', e => {
  const k = e.key === ']' ? 1 : e.key === '[' ? -1 : 0; if (!k) return;
  seedNow += k * (e.shiftKey ? 10 : 1); for (const t of lattices) fillLattice(t); document.title = 'puddle seed ' + seedNow; console.log('puddle seed', seedNow);
});
const MIRROR_REACH = 52; // m (was 55, before that more: the screen is about 25 m wide and 40 m tall, and a model reflects only about its own height beyond itself: the models farther than this from where the camera looks are left out of the mirror pass, a draw call or ten each)
const mirrorFrustum = new THREE.Frustum(), mirrorM4 = new THREE.Matrix4(), mirrorBox = new THREE.Box3(), mirrorSph = new THREE.Sphere(), mirrorBound = new WeakMap(); // (the mirror pass's culling: see where the models are switched off)
const SKY_SPAN = 400, SKY_RES = 512, SKY_EVERY = .1;   // the baked sky: the stretch of the sky plane it covers (the reflected ray's cp ranges about +-190), its size in texels, and seconds between redraws
if (typeof window !== 'undefined') window.__mirrorWhy = 'puddles.js loaded, no mirror frame yet';
const dir = new THREE.Vector3(), focus = new THREE.Vector3();
export const PUDDLE = 4; // the layer for the static things the road mirrors (the dynamic ones are on REFLECT)

// A flat wet layer with its own mirror, at height y. opts: { W, L (the map's size, m), y, geometry (the surface it covers: the whole road by default), off (shifts the wetness pattern),
// shift (raises the bar for standing water: higher = fewer pools), damp (false: don't darken the surface), sheen (0: no rough reflection on the damp surface) }.
export function buildPuddles(scene, opts) {
  const { W, L, y = .035, off = [0, 0], shift = 0, damp: darken = true, sheen = 1, tileAt = null, cell = 1.25, exclude = [], holes = null, boost = [], vlsHoles = null, blobs = [] } = opts;
  let geo = opts.geometry;
  if (!geo) { geo = new THREE.PlaneGeometry(W + 60, L + 40); geo.rotateX(-Math.PI / 2); geo.translate(0, y, -L / 2 - 8); } // (a little past the map's sides and ends)
  const uOff = { value: new THREE.Vector2(off[0], off[1]) };
  // Water gathers beside buildings (the walls shed rain, and the road dips there): a map of how close each spot is to a building, 1 at the wall fading to 0 about 6.5 m out, that raises the wetness there.
  const bCols = Math.ceil(W / cell), bRows = Math.ceil(L / cell), bData = new Uint8Array(bCols * bRows * 4);
  if (tileAt) {
    const solid = new Uint8Array(bCols * bRows), R = 5;
    for (let r = 0; r < bRows; r++) for (let c = 0; c < bCols; c++) solid[r * bCols + c] = tileAt(-W / 2 + (c + .5) * cell, -L + (r + .5) * cell) === 'K' ? 1 : 0;
    for (let r = 0; r < bRows; r++) for (let c = 0; c < bCols; c++) {
      let best = 99;
      if (!solid[r * bCols + c]) for (let dr = -R; dr <= R; dr++) for (let dc = -R; dc <= R; dc++) {
        const rr = r + dr, cc = c + dc; if (rr < 0 || rr >= bRows || cc < 0 || cc >= bCols || !solid[rr * bCols + cc]) continue;
        best = Math.min(best, Math.hypot(dr, dc));
      }
      const v = Math.pow(Math.max(0, 1 - best * cell / 6.5), 1.4), i = (r * bCols + c) * 4; bData[i] = bData[i + 1] = bData[i + 2] = Math.round(v * 255); bData[i + 3] = 255;
    }
  }
  // Wet blobs painted into the same map: { x, z, r, r0?, k }: full strength k out to r0, fading to nothing at r. They raise the wetness the way a wall does (the shader reads this map as `near`), so puddles gather in
  // and round them, at no cost per pixel: the containers (big, deep puddles all round them) and the stretch of new road that has no buildings to shed rain onto it.
  for (const b of blobs) {
    const r0 = b.r0 ?? 0, span = Math.max(.01, b.r - r0), c0 = Math.floor((b.x + W / 2) / cell), q0 = Math.floor((b.z + L) / cell), n = Math.ceil(b.r * (b.wild ? 1.8 : 1) / cell) + 1, ph = b.wild ? [b.x * 1.3, b.z * .7, b.x * .4 + b.z] : null, cr = Math.cos(b.rot ?? 0), sr = Math.sin(b.rot ?? 0);
    for (let q = q0 - n; q <= q0 + n; q++) for (let c = c0 - n; c <= c0 + n; c++) {
      if (q < 0 || q >= bRows || c < 0 || c >= bCols) continue;
      const dx = -W / 2 + (c + .5) * cell - b.x, dz = -L + (q + .5) * cell - b.z;
      let d = Math.hypot(dx, dz);
      if (b.wild) { // a ragged, stretched shape: an ellipse turned to its own angle, its outline pushed in and out by a few waves of different sizes
        const ex = dx * cr + dz * sr, ez = -dx * sr + dz * cr, a = Math.atan2(ez, ex);
        d = Math.hypot(ex / (b.ex ?? 1), ez / (b.ez ?? 1)) / (1 + .26 * Math.sin(2 * a + ph[0]) + .18 * Math.sin(3 * a + ph[1]) + .1 * Math.sin(5 * a + ph[2]) + .06 * Math.sin(9 * a + ph[0] * 2));
      }
      const v = d <= r0 ? b.k : b.k * Math.pow(Math.max(0, 1 - (d - r0) / span), 1.4), i = (q * bCols + c) * 4, u = Math.round(Math.min(1, v) * 255);
      if (u > bData[i]) bData[i] = bData[i + 1] = bData[i + 2] = u;
    }
  }
  const buildTex = new THREE.DataTexture(bData, bCols, bRows, THREE.RGBAFormat); buildTex.magFilter = buildTex.minFilter = THREE.LinearFilter; buildTex.needsUpdate = true;
  const uHoles = holes ? { uHoles: holes } : { uHoles: { value: [new THREE.Vector3()] } }; // (camouflaged guns' open pits: (x, z, radius), radius 0 = shut: the film is not drawn over an open hole)
  const nHoles = uHoles.uHoles.value.length;
  const uVls = { uVls: vlsHoles ?? { value: [new THREE.Vector4()] } }, nVls = uVls.uVls.value.length; // (the road launchers' open shafts: (x, z, half width, half depth))
  const latTex = (() => { // random numbers for the puddle noise, from a fixed seed (computed with whole numbers, so it is the same on every machine; the shader reads it unfiltered)
    const t = new THREE.DataTexture(new Uint8Array(256 * 256 * 4), 256, 256, THREE.RGBAFormat); t.minFilter = t.magFilter = THREE.NearestFilter; t.generateMipmaps = false; t.wrapS = t.wrapT = THREE.RepeatWrapping;
    fillLattice(t); lattices.push(t); return t;
  })();
  const uBuild = { tBuild: { value: buildTex }, tLat: { value: latTex }, uBoost: { value: (boost.length ? boost : [{ x: 0, z: 0, r: 0 }]).map(b => new THREE.Vector4(b.x, b.z, b.r, b.k ?? .2)) }, uMap: { value: new THREE.Vector4(-W / 2, -L, bCols * cell, bRows * cell) } };
  // Where standing water can lie, worked out once on the CPU with the shader's own formula (same noise, same seeded table, same shift), as a coarse grid of blocks. The mirror pass is the biggest cost of the
  // puddles and is only ever READ where there is standing water, so a frame whose view holds none of it skips the pass altogether.
  const BLK = 4, WX0 = -W / 2 - 30, WZ0 = -L - 30, wbCols = Math.ceil((W + 60) / BLK), wbRows = Math.ceil((L + 45) / BLK), waterBlock = new Uint8Array(wbCols * wbRows);
  let wetnessCPU = null, rendererRef = null, lastScene = null;   // (wetnessCPU: the wetness at a point worked out on the CPU, see below)
  {
    const lat = latTex.image.data, hc = (x, y) => lat[((((Math.floor(y + .5) % 256) + 256) % 256) * 256 + (((Math.floor(x + .5) % 256) + 256) % 256)) * 4] / 255;
    const vn = (px, py) => { const ix = Math.floor(px), iy = Math.floor(py); let fx = px - ix, fy = py - iy; fx = fx * fx * fx * (fx * (fx * 6 - 15) + 10); fy = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
      const a = hc(ix, iy), b = hc(ix + 1, iy), c = hc(ix, iy + 1), d = hc(ix + 1, iy + 1); return (a + (b - a) * fx) + ((c + (d - c) * fx) - (a + (b - a) * fx)) * fy; };
    const ss = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
    const nearAt = (x, z) => { const c = (x + W / 2) / cell - .5, r = (z + L) / cell - .5; let m = 0;
      for (const rr of [Math.floor(r), Math.floor(r) + 1]) for (const cc of [Math.floor(c), Math.floor(c) + 1]) if (rr >= 0 && rr < bRows && cc >= 0 && cc < bCols) m = Math.max(m, bData[(rr * bCols + cc) * 4] / 255); return m; };
    // The wetness at a world point, worked out exactly as the shader does (wetField, plus the building map's value read bilinearly as the texture is, minus the shift), so the game can ask "is the jeep in standing water?"
    // without a GPU readback (a readback makes the CPU wait for the whole frame's drawing to finish). The old readback stays as gpuProbe (?gpuprobe=1 uses it; __probeCheck() in the console compares the two).
    const nearBi = (x, z) => { const c = (x + W / 2) / cell - .5, r = (z + L) / cell - .5, c0 = Math.floor(c), r0 = Math.floor(r), fc = c - c0, fr = r - r0;
      const g = (rr, cc) => bData[(Math.min(bRows - 1, Math.max(0, rr)) * bCols + Math.min(bCols - 1, Math.max(0, cc))) * 4] / 255;
      const a = g(r0, c0) + (g(r0, c0 + 1) - g(r0, c0)) * fc, b = g(r0 + 1, c0) + (g(r0 + 1, c0 + 1) - g(r0 + 1, c0)) * fc; return a + (b - a) * fr; };
    wetnessCPU = (wx, wz) => {
      const px = wx + off[0], py = wz + off[1]; let f = 0;
      for (const b of boost) {
        if (!(b.r > 0)) continue;
        const ex = wx - b.x, ez = wz - b.z, ang = b.x * 3.7 + b.z * 1.9, dx = Math.cos(ang), dz = Math.sin(ang);
        const d = Math.hypot((ex * dx + ez * dz) / 1.5, (-ex * dz + ez * dx) * 1.25) + (vn(px * .55 + b.x, py * .55 + b.z) - .5) * b.r * .9 + (vn(px * 1.7 + 4, py * 1.7 + 4) - .5) * b.r * .4;
        f += ss(b.r, -b.r * .15, d) * (b.k ?? .2);
      }
      f += vn((.8 * px + .6 * py) * .05, (-.6 * px + .8 * py) * .05) * .5 + vn((.36 * px + .93 * py) * .13 + 11, (-.93 * px + .36 * py) * .13 + 11) * .22
        + vn((-.6 * px + .8 * py) * .38 + 3, (-.8 * px - .6 * py) * .38 + 3) * .2 + vn((.8 * px + .6 * py) * 1.1 + 17, (-.6 * px + .8 * py) * 1.1 + 17) * .08;
      f += nearBi(wx, wz) * .7 - shift;
      return Math.min(1, Math.max(0, f));
    };
    for (let gz = 0; gz < wbRows * BLK; gz++) for (let gx = 0; gx < wbCols * BLK; gx++) {
      const wx = WX0 + gx + .5, wz = WZ0 + gz + .5, bi = Math.floor(gz / BLK) * wbCols + Math.floor(gx / BLK); if (waterBlock[bi]) continue;
      const px = wx + off[0], py = wz + off[1]; let f = 0;
      for (const b of boost) f += (Math.hypot(wx - b.x, wz - b.z) < b.r * 1.9 ? (b.k ?? .2) : 0); // (every spot a boost's stretched, ragged shape can reach: more than it covers, never less)
      f += vn((.8 * px + .6 * py) * .05, (-.6 * px + .8 * py) * .05) * .5 + vn((.36 * px + .93 * py) * .13 + 11, (-.93 * px + .36 * py) * .13 + 11) * .22
        + vn((-.6 * px + .8 * py) * .38 + 3, (-.8 * px - .6 * py) * .38 + 3) * .2 + vn((.8 * px + .6 * py) * 1.1 + 17, (-.6 * px + .8 * py) * 1.1 + 17) * .08;
      f += nearAt(wx, wz) * .7 - shift;
      if (f > .64) waterBlock[bi] = 1;
    }
  }
  const WATER_VIEW = 32; // m: how far from where the camera looks a puddle can still be on screen
  const waterNear = (x, z) => { const c0 = Math.floor((x - WATER_VIEW - WX0) / BLK), c1 = Math.floor((x + WATER_VIEW - WX0) / BLK), r0 = Math.floor((z - WATER_VIEW - WZ0) / BLK), r1 = Math.floor((z + WATER_VIEW - WZ0) / BLK);
    for (let r = Math.max(0, r0); r <= Math.min(wbRows - 1, r1); r++) for (let c = Math.max(0, c0); c <= Math.min(wbCols - 1, c1); c++) if (waterBlock[r * wbCols + c]) return true; return false; };

  const size = new THREE.Vector2(), rtOpts = { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter };
  let target = new THREE.WebGLRenderTarget(512, 512, rtOpts), msaaDone = false;
  // The grit and the glints come from a small noise TEXTURE (with mipmaps) instead of a hash computed per pixel: the hardware filters it, so as the view scrolls it stays steady. Noise computed at
  // the size of a pixel flickered (the pattern re-sampled differently every frame).
  const noiseTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 256; const x = c.getContext('2d'), im = x.createImageData(256, 256);
    let seed = 1234567; const r = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    for (let i = 0; i < 256 * 256; i++) { const v = Math.floor((r() + r() + r()) / 3 * 255); im.data[i * 4] = im.data[i * 4 + 1] = im.data[i * 4 + 2] = v; im.data[i * 4 + 3] = 255; } // (a sum of three: a softer spread than raw static)
    x.putImageData(im, 0, 0);
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; return t;
  })();
  const textureMatrix = new THREE.Matrix4();
  const vertexShader = `
    uniform mat4 textureMatrix; varying vec4 vProj; varying vec3 vWorld;
    void main() { vWorld = position; vProj = textureMatrix * vec4( position, 1.0 ); gl_Position = projectionMatrix * viewMatrix * vec4( position, 1.0 ); }`;
  const field = `
    uniform sampler2D tLat; // the lattice values: a small table filled from a fixed seed (see latTex), read exactly, so every machine gets the same puddles
    float hash( vec2 p ) { return texture2D( tLat, ( mod( floor( p + .5 ), 256.0 ) + .5 ) / 256.0 ).r; }
    float vnoise( vec2 p ) { vec2 i = floor( p ), f = fract( p ); f = f * f * f * ( f * ( f * 6.0 - 15.0 ) + 10.0 ); return mix( mix( hash( i ), hash( i + vec2( 1.0, 0.0 ) ), f.x ), mix( hash( i + vec2( 0.0, 1.0 ) ), hash( i + vec2( 1.0, 1.0 ) ), f.x ), f.y ); }
    // how wet the road is here, 0 .. 1: broad wet and drier regions, patches of a few metres, and fine mottling
    // places the wet layer must not touch (a conveyor belt runs there: its own surface, drawn above the road, would z-fight with the layer)
    uniform vec3 uHoles[${nHoles}];
    uniform vec4 uVls[${nVls}];
    bool excluded( vec2 p ) { for ( int i = 0; i < ${nVls}; i ++ ) { vec4 v = uVls[ i ]; if ( v.z > 0.0 && abs( p.x - v.x ) < v.z && abs( p.y - v.y ) < v.w ) return true; } for ( int i = 0; i < ${nHoles}; i ++ ) { vec3 h = uHoles[ i ]; if ( h.z > 0.0 && length( p - h.xy ) < h.z ) return true; } return ${exclude.length ? exclude.map(r => `( p.x > ${r.x0.toFixed(3)} && p.x < ${r.x1.toFixed(3)} && p.y > ${r.z0.toFixed(3)} && p.y < ${r.z1.toFixed(3)} )`).join(' || ') : 'false'}; }
    uniform vec4 uBoost[${Math.max(1, boost.length)}]; // (places that stand wetter: x, z, radius)
    float zig( float t, float n, float seed ) { float x = t * n, i = floor( x ); return mix( hash( vec2( i, seed ) ), hash( vec2( i + 1.0, seed ) ), fract( x ) ) - .5; } // (straight runs with sharp corners: a zigzag, for the lightning)
    // Lightning drawn as a real broken line. A stroke from a to b is n short straight segments, each joint thrown sideways (and a little along) by chance, on top of a slow meander: so it turns sharply, doubles back and
    // wanders like the real thing, which a line merely offset sideways from a straight one cannot do. jp: the i-th joint; boltPoly: the distance to the line, and how far along it (0 .. 1) the nearest point is; boltPt: the point at joint f.
    vec2 jp( vec2 a, vec2 b, float seed, float n, float i ) {
      vec2 d = b - a; float L = length( d ); vec2 dir = d / L, nr = vec2( - dir.y, dir.x );
      float e = clamp( min( i, n - i ), 0.0, 1.0 );
      float lat = ( hash( vec2( i, seed ) ) - .5 ) * L * 3.4 / n + zig( i / n, 3.0, seed + 4.0 ) * .22 * L, lon = ( hash( vec2( i + 60.0, seed ) ) - .5 ) * L / n * .7;
      return a + dir * ( L * i / n + lon * e ) + nr * lat * e;
    }
    vec2 boltPt( vec2 a, vec2 b, float seed, float n, float f ) { float i = floor( f ); return mix( jp( a, b, seed, n, i ), jp( a, b, seed, n, i + 1.0 ), f - i ); }
    vec2 boltPoly( vec2 p, vec2 a, vec2 b, float seed, float n ) {
      float best = 1e9, bt = 0.0; vec2 prev = a;
      for ( int i = 1; i <= 24; i ++ ) {
        if ( float( i ) > n ) break;
        vec2 cur = jp( a, b, seed, n, float( i ) ), ba = cur - prev, pa = p - prev; float h = clamp( dot( pa, ba ) / dot( ba, ba ), 0.0, 1.0 ), d = length( pa - ba * h );
        if ( d < best ) { best = d; bt = ( float( i - 1 ) + h ) / n; }
        prev = cur;
      }
      return vec2( best, bt );
    }
    float wetField( vec2 w ) { // (each octave on a differently turned and offset grid, so no lattice line shows through)
      mat2 a = mat2( .8, -.6, .6, .8 ), b = mat2( .36, -.93, .93, .36 ), c = mat2( -.6, -.8, .8, -.6 );
      float extra = 0.0; for ( int i = 0; i < ${Math.max(1, boost.length)}; i ++ ) { vec4 b = uBoost[ i ]; if ( b.z > 0.0 ) {
          // not a round patch: stretched along a direction of its own, with its edge pushed in and out by noise
          vec2 p = w - uOff - b.xy; float ang = b.x * 3.7 + b.y * 1.9; vec2 dir = vec2( cos( ang ), sin( ang ) );
          float d = length( vec2( dot( p, dir ) / 1.5, dot( p, vec2( - dir.y, dir.x ) ) * 1.25 ) ) + ( vnoise( w * .55 + b.xy ) - .5 ) * b.z * .9 + ( vnoise( w * 1.7 + 4.0 ) - .5 ) * b.z * .4;
          extra += smoothstep( b.z, -b.z * .15, d ) * b.w; // (it fades out right across its whole radius: no flat lake with a rim, but wetter and wetter toward the middle, the puddles joining up there)
        } }
      return extra + vnoise( a * w * .05 ) * .5 + vnoise( b * w * .13 + 11.0 ) * .22 + vnoise( c * w * .38 + 3.0 ) * .2 + vnoise( a * w * 1.1 + 17.0 ) * .08; }
    // the same field, read from the map baked once (see bakeField): the road's film then costs one texture read per pixel, not sixteen and a loop
    uniform sampler2D tField; uniform vec4 uBox; uniform float uHave;
    float fieldAt( vec2 p ) { return uHave > .5 ? texture2D( tField, ( p - uBox.xy ) / uBox.zw ).r : wetField( p + uOff ); }`;

  const uField = { tField: { value: null }, uBox: { value: new THREE.Vector4() }, uHave: { value: 0 } };   // (the baked wetness map: tField, the world box it covers, and whether it is ready)
  // 1) the darkening: it multiplies what is already drawn (road, cracks, paint)
  const damp = new THREE.ShaderMaterial({
    uniforms: { uOff, ...uBuild, ...uHoles, ...uVls, ...uField, uDampOn: { value: 1 } }, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.DstColorFactor, blendDst: THREE.ZeroFactor,
    blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3, vertexShader,
    fragmentShader: `
      varying vec3 vWorld; uniform float uDampOn; uniform vec2 uOff; uniform sampler2D tBuild; uniform vec4 uMap; ${field}
      void main() {
        if ( excluded( vWorld.xz ) ) discard;
        float near = texture2D( tBuild, ( vWorld.xz - uMap.xy ) / uMap.zw ).r; // (closeness to a building)
        float wetness = smoothstep( .18, .7, fieldAt( vWorld.xz ) + near * .7 );   // soaked where the field is high, damp elsewhere, never fully dry
        gl_FragColor = vec4( mix( vec3( .78, .79, .82 ), vec3( .42, .44, .49 ), wetness ) * uDampOn + vec3( 1.0 - uDampOn ), 1.0 ); // the road's own colour times this
      }`,
  });

  // 2) the reflections: rough over the wet road, a mirror in the standing water
  const mat = new THREE.ShaderMaterial({
    uniforms: { uOff, ...uBuild, ...uHoles, ...uVls, ...uField, uRip: { value: Array.from({ length: 12 }, () => new THREE.Vector4(0, 0, -99, 0)) }, uRipDir: { value: Array.from({ length: 12 }, () => new THREE.Vector2()) }, uTime: { value: 0 }, uShift: { value: shift }, uSheen: { value: sheen }, tReflect: { value: target.texture }, tSky: { value: null }, uRoughRoad: { value: params.get('roughroad') === '0' ? 0 : 1 }, uPR: { value: 1 }, uPeb: { value: 1 }, uPool: { value: 1 }, uRoad: { value: params.get('roadwater') === '0' || opts.near ? 0 : 1 }, uRainRip: { value: 1 }, uCut: { value: 0 }, uPhase: { value: 0 }, uBigT: { value: 0 }, uDbgBand: { value: params.has('showband') ? 1 : 0 }, uLite: { value: 0 }, uFlash: { value: 0 }, uStorm: { value: 0 }, uBolt: { value: new THREE.Vector4(0, -40, 0, -100) }, uBoltSeed: { value: 0 }, uAll: { value: params.has('allwater') ? 1 : 0 }, tNoise: { value: noiseTex }, textureMatrix: { value: textureMatrix }, uSky: { value: new THREE.Color(0x9db0c6) }, uSun: { value: new THREE.Vector3(-9, 18, 10).normalize() } },
    transparent: true, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, vertexShader,
    fragmentShader: `
      uniform float uTime; uniform vec4 uRip[12]; uniform vec2 uRipDir[12]; uniform sampler2D tBuild; uniform vec4 uMap; uniform sampler2D tReflect; uniform float uLite; uniform float uFlash; uniform float uStorm; uniform vec4 uBolt; uniform float uBoltSeed; uniform float uAll; uniform sampler2D tNoise; uniform vec3 uSky; uniform vec3 uSun; uniform vec2 uOff; uniform float uShift; uniform float uSheen; uniform float uPhase; uniform float uBigT; uniform sampler2D tSky; uniform float uRoughRoad; uniform float uDbgBand; uniform float uPR; uniform float uPeb; uniform float uPool; uniform float uRoad; uniform float uRainRip; uniform float uCut; varying vec4 vProj; varying vec3 vWorld; ${field}
      // how wet the road is at p (world metres): the baked field plus the wall's boost, less the shift: the same as the film's own f below. Used to check that water lies between a ripple's centre and a pixel
      float wetAt( vec2 p ) { return fieldAt( p ) + texture2D( tBuild, ( p - uMap.xy ) / uMap.zw ).r * .7 - uShift; }
      // 1 if standing water (about) lies a third and two thirds of the way from a ripple's centre c to the pixel w (both in the shifted frame), else 0: a ripple does not run across dry road into another puddle
      float rippleReach( vec2 w, vec2 c ) { return min( smoothstep( .45, .56, wetAt( mix( w, c, .33 ) - uOff ) ), smoothstep( .45, .56, wetAt( mix( w, c, .67 ) - uOff ) ) ); }
      void main() {
        if ( excluded( vWorld.xz ) ) discard;
        if ( uCut == 1.0 ) { gl_FragColor = vec4( 0.0 ); return; } // (profile only, setCut: the film stops here: what drawing a blended layer over the road costs by itself)
        vec2 w = vWorld.xz + uOff;
        float f = fieldAt( vWorld.xz ) + texture2D( tBuild, ( vWorld.xz - uMap.xy ) / uMap.zw ).r * .7 - uShift; // (wetter beside buildings)
        float wet = smoothstep( .18, .7, f ); if ( f <= ( uRoughRoad > .5 ? .0 : .64 ) && uAll < .5 ) { gl_FragColor = vec4( 0.0 ); return; }   // (no standing water here, which is most of the road: out before the pebble, tilt and grit reads; the same picture as below, which also drew nothing)
        if ( uCut == 2.0 ) { gl_FragColor = vec4( 0.0 ); return; } // (profile: stops after the wetness field and the cut-off)
        // The water gets shallower toward its edge, and the road's pebbles and grit stand up out of it: wherever a pebble is taller than the water over it, that spot is not water (the road shows through,
        // not reflective, rough). So the edge is bumpy: bare pebble tops in the shallows, fewer and fewer farther in, none in the deep middle. The pebbles' heights come from the same steady noise texture as the grit.
        float depthW = smoothstep( .63, .82, f );                           // 0 at the edge .. 1 in the deep middle
        float pebble = mix( .5, clamp( ( texture2D( tNoise, w / 5.5 ).r * .55 + texture2D( tNoise, w / 2.4 + .3 ).r * .45 - .3 ) / .4, 0.0, 1.0 ), .8 );
        float covered = smoothstep( pebble * .9 - .15, pebble * .9 + .15, depthW ); covered = mix( 1.0, covered, uPeb ); covered = mix( covered, 1.0, uRoad ); // (wet-road mode: no pebble holes in the rim, the water just thins out smoothly)  // 1 where the water is deeper than the pebble is tall
        float pool = smoothstep( .64, .74, f ) * covered;
        // Pebbles do more than hide the water: where one lies just under the surface, the surface is tilted over it, and the reflection there comes from another direction. A tilt (from the pebble field), strongest
        // at the rim, fading to nothing in the deep middle, and in only some spots (a second noise picks which) the tilt is strong.
        vec2 pv = vec2( pebble, texture2D( tNoise, w / 2.4 + .7 ).r ) - .5;
        float pick = smoothstep( .45, .7, texture2D( tNoise, w / 3.1 + .9 ).r );
        vec2 edgeTilt = pv * mix( 1.0, .04, depthW ) * covered * ( .3 + 1.0 * pick ) * .8 * uPR * uPeb * mix( 1.0, .31, uRoad );
        if ( uCut == 3.0 ) { gl_FragColor = vec4( 0.0 ); return; } // (profile: stops after the pebble, pool and tilt work)
        if ( wet <= 0.0 ) { gl_FragColor = vec4( 0.0 ); return; } // (dry road: nothing to draw)                                  // standing water where the field peaks: a feathered, solid mirror
        float realPool = pool; if ( uAll > .5 ) pool = 1.0; // (debugging, ?allwater=1: every wet bit of road is as much a mirror as the standing water)
        vec3 V = normalize( cameraPosition - vWorld ); float fresnel = pow( 1.0 - clamp( V.y, 0.0, 1.0 ), 5.0 );
        float grit = texture2D( tNoise, w / 7.0 ).r * .6 + texture2D( tNoise, w / 3.3 + .37 ).r * .4;           // the asphalt's grit: it breaks the rough reflection up, so the road shows through it
        // The wet road outside the puddles is NOT dry glass-less asphalt: the whole surface reflects, only rougher. A continuous gloss g (0 dry .. 1 at the puddle's rim, from the same wetness field) sets how rough: the
        // rougher the surface, the weaker and more broken (by the grit) its reflection of the sky and, nearer the puddles, the smeared scene. So the puddle is the glossiest part of one surface, not a pasted-on layer.
        float g = uRoughRoad > .5 ? smoothstep( .0, .64, f ) : 0.0, vk = smoothstep( .1, .55, 1.0 - V.y );
        vec3 rough = vec3( 0.0 ); float roughA = 0.0;
        if ( g > 0.0 ) {
          roughA = .9 * pow( g, 1.15 ) * smoothstep( .3, .62, .449 + .551 * vk ) * mix( 1.0, .25, vk ) * mix( 1.0, smoothstep( .25, .8, grit ), .1 * ( 1.0 - g ) ) * mix( .7, 1.0, uSheen );   // dry-ish asphalt: the grit lets the road through; wetter: more of the sheen
        }
        if ( g > 0.0 && uRoad < .5 ) { // (the old rough layer's colour: not worked out in the wet-road water mode, where the water shader below paints the road and only the strength above is used)
          // bumpy, not glassy: the asphalt's unevenness tilts the surface (low-frequency noise, strong in some spots and weak in others, like the puddle rim's pebbles; calmer the wetter, so it settles toward the puddle), and the tilt bends both the sky and the scene it mirrors
          vec2 bv = vec2( texture2D( tNoise, w / 2.2 + .6 ).r, texture2D( tNoise, w / 5.0 + .11 ).r ) - .5;
          float bp = smoothstep( .45, .7, texture2D( tNoise, w / 3.1 + .9 ).r );
          vec2 tilt = pv * ( .3 + 1.0 * pick ) * ( 1.0 - .6 * g ) * mix( .2, 1.0, uSheen ); // (the puddle rim's own pebble bumps, laid over the whole wet road; the old, smoother tilt was: bv * ( .3 + 1.1 * bp ) * ( 1.0 - .6 * g ) * .45)
          vec3 R0 = reflect( -V, vec3( 0.0, 1.0, 0.0 ) ); R0 = normalize( R0 + vec3( tilt.x, 0.0, tilt.y ) * 3.5 );
          vec3 sky0 = texture2D( tSky, ( w * .0015 + R0.xz / max( R0.y, .2 ) * 38.0 ) / ${SKY_SPAN.toFixed(1)} + .5 ).rgb * .73 + vec3( .05, .05, .045 ) * ( 1.0 - smoothstep( .3, .85, R0.y ) );
          sky0 += vec3( .8, .88, 1.0 ) * uFlash * .4;
          vec4 r2 = vec4( 0.0 ); float tw = smoothstep( .03, .42, g );   // the smeared scene (buildings, tanks) only where the road is wet enough, fading in with the gloss
          if ( tw > 0.0 && uLite < .5 && uRoad < .5 ) { vec2 jt = bv * .8 * mix( .2, 1.0, uSheen ); r2 = texture2DProj( tReflect, vec4( vProj.x + ( jt.x * .03 + tilt.x * .17 ) * vProj.w, vProj.y + ( jt.y * .03 + tilt.y * .17 ) * vProj.w, vProj.z, vProj.w ) ) * tw; }
          rough = ( r2.rgb * .9 + sky0 * ( 1.0 - clamp( r2.a, 0.0, 1.0 ) ) ) * .9;
          if ( uDbgBand > .5 ) { rough = tw > 0.0 ? vec3( 0.0, .2, 1.0 ) : vec3( 0.0, .75, .2 ); roughA = 1.0; }   // (debug, [ key or ?showband=1: solid blue where the smeared scene is mixed in, solid green where only the sky is)
        }
        if ( uCut == 4.0 ) { gl_FragColor = vec4( rough, roughA ); return; } // (profile: the rough layer only, none of the water shader)
        float road = 0.0; // (1: this pixel is wet road drawn with the water's own shader, see below; fades to 0 across the puddle's edge)
        if ( pool <= 0.0 ) {
          if ( g <= 0.0 || uRoad < .5 ) { gl_FragColor = vec4( rough, roughA ); return; }
          // the wet road outside the puddles goes through the same water shader as the puddle's rim: the rim's pebble tilt over all of it, the same sky and mirror image, but only one read of the mirror and no ripples (rain or jeep)
          road = 1.0;
        }
        if ( uRoad > .5 ) { road = 1.0 - smoothstep( .72, .8, f ); pool = max( pool, road ); } // (the road's single-read, ripple-free water look fades out smoothly into the puddle's own, so nothing switches at the rim) // (no standing water here: the rough reflection only, none of the cloud tilt, ripple and mirror work below)
        // The sky the water shows where nothing stands over it: an overcast sky of layered cloud. The reflected ray is followed up to a cloud layer high overhead, so the cloud pattern shifts across the
        // map as the water does (a different patch of sky in each puddle), soft grey cloud masses with darker rain-bearing patches and lighter gaps, a paler band toward the horizon and a hint of blue overhead.
        vec3 Rr = reflect( -V, vec3( 0.0, 1.0, 0.0 ) );
        Rr = normalize( Rr + vec3( edgeTilt.x, 0.0, edgeTilt.y ) * 9.0 ); // (the tilted edge turns the sky's reflection wildly: from a bit of the edge a patch of cloud overhead can be mirrored where the next bit mirrors the blue gap beside it)
        vec2 cp = w * .0015 + Rr.xz / max( Rr.y, .2 ) * 38.0; // (the sky is far away: it depends on the direction of the reflected ray, hardly at all on where on the ground the puddle is)
        // the sky is baked (see bakeSky): a map of the cloud over the reflected ray's place in the sky (cp), redrawn a few times a second; here it is one read
        vec4 skyTex = texture2D( tSky, cp / ${SKY_SPAN.toFixed(1)} + .5 ); float patchK = skyTex.a; vec3 sky = skyTex.rgb;
        vec2 wind = vec2( 1.0, .4 ) * uTime * .2;
        sky += vec3( .07, .07, .06 ) * ( 1.0 - smoothstep( .3, .85, Rr.y ) );        // paler toward the horizon
        vec4 p = vProj;
        // Ripples from a vehicle driving through the water, made the way stage 4's swamp makes its wake (water.js): a wave packet (a few crests, cos(3x) inside a soft envelope) travelling outward at 4.5 m/s and
        // fading over a few seconds, and only the half of the ring AHEAD of the way the vehicle was going (a wake has no back half). The ring's slope pushes the mirror image. Only in the deep water of the
        // bigger puddles: the shallows and the small puddles stay calm.
        vec2 vSlope = vec2( 0.0 ); float vLight = 0.0;
        float bigPool = 0.0; if ( depthW > .0 && road < .99 ) bigPool = smoothstep( .5, .95, depthW ) * ( .3 + .7 * smoothstep( .46, .62, vnoise( mat2( .8, -.6, .6, .8 ) * w * .05 ) ) ) * ( 1.0 - road ); // (not worked out on the road, where it is 0 anyway)
        if ( bigPool > 0.0 ) for ( int i = 0; i < 12; i ++ ) {
          vec4 rp = uRip[ i ]; float age = uTime - rp.z;
          if ( rp.w <= 0.0 || age < 0.0 || age > 1.9 ) continue;
          vec2 dv = w - rp.xy; float d = length( dv ) + 1e-4, x = d - age * 3.4;
          float env = exp( -x * x * 1.3 ) * exp( -age * 1.8 ) * rp.w;
          if ( env < .02 ) continue; env *= rippleReach( w, rp.xy );
          vec2 rd = uRipDir[ i ]; float ahead = dot( rd, rd ) > .01 ? smoothstep( -.15, .45, dot( dv / d, rd ) ) : 1.0;
          vSlope += dv / d * cos( x * 7.5 ) * env * 1.1 * ahead; // (the jeep's wake: strong enough to see clearly)
        }
        vec2 wakeS = vSlope; // (the jeep's wake so far: kept apart, the shading below leaves it out)
        // (the big puddles used to send out soft rings of their own now and then: dropped, the raindrop rings below say well enough where there is water)
        // Raindrops landing on the water (the falling rain's own splashes), after Ctrl-Alt-Test's rain shader: a grid of small cells (.6 m), one drop in most of them at its own spot and beat, each sending a short
        // packet of fine rings (sin(31 d) inside a soft envelope) out about 70 cm while it dies away as (1 - t)^2. The ring's slope bends the mirror image. In every puddle, shallow ones too, and not on MEDIUM.
        vec2 rs = vec2( 0.0 );
        if ( uLite < .5 && road < .99 && uRainRip > .5 ) {
          vec2 ru = w * 1.33, c0 = floor( ru );
          for ( int j = -1; j <= 1; j ++ ) for ( int i = -1; i <= 1; i ++ ) {
            vec2 pc = c0 + vec2( float( i ), float( j ) );
            if ( hash( pc + 101.0 ) < .16 ) continue;
            vec2 v = pc + vec2( hash( pc + 13.0 ), hash( pc + 37.0 ) ) - ru;
            float t = fract( uPhase + hash( pc + 59.0 ) ), d = length( v ) - 1.2 * t, h = 1e-3, d1 = d - h, d2 = d + h;
            float r1 = sin( 31.0 * d1 ) * smoothstep( -.6, -.3, d1 ) * smoothstep( 0.0, -.3, d1 ), r2 = sin( 31.0 * d2 ) * smoothstep( -.6, -.3, d2 ) * smoothstep( 0.0, -.3, d2 );
            rs += .5 * v / ( length( v ) + 1e-4 ) * ( ( r2 - r1 ) / ( 2.0 * h ) * pow( 1.0 - t, 2.0 ) );
          }
          rs *= .09 * ( 1.0 + .6 * uStorm ) * ( 1.0 - road );
        }
        vSlope = vSlope * bigPool + rs * min( 1.0, pool * 3.5 ); vLight = length( vSlope );
        p.xy += vSlope * .0115 * p.w;
        p.xy += edgeTilt * .11 * p.w; // (and the mirror image: it comes from a different direction at the tilted spots)
        // rough reflection: the mirror image smeared (streaked along the view, as on a wet road) and broken by the grit
        float smear = mix( .024, .003 * uPR, pool ); // (water is a mirror: only a hair of blur. The wide smear flattened every horizontal line of the wall into a band and left the vertical joints sharp)
        // Never a perfect mirror: a very fine, steady unevenness of the surface (the road under it is not flat), so even the middle of a big puddle breaks its reflection up a little
        vec2 fine = vec2( texture2D( tNoise, w / 1.3 + .21 ).r, texture2D( tNoise, w / 1.1 + .67 ).r ) - .5;
        p.xy += fine * .0018 * p.w * pool;
        vec4 r = vec4( 0.0 );
        float wob = ( vnoise( w * 5.0 + 41.0 ) * .6 + vnoise( w * 13.0 + 7.0 ) * .4 - .5 ) * .009; // a very small vertical wobble, smooth: rows of the reflection bend a little instead of staying dead level
        float taps = 1.0; if ( pool > 0.0 && uCut != 5.0 ) { taps = 0.0; for ( int k = -2; k <= 2; k ++ ) { if ( ( uLite > .5 || road > .5 ) && k != 0 ) continue; taps += 1.0; r += texture2DProj( tReflect, vec4( p.x + ( grit - .5 ) * .007 * uPR * ( 1.0 - .5 * pool ) * p.w, p.y + ( float( k ) * smear + wob * uPR * ( 1.0 - .5 * pool ) ) * p.w, p.z, p.w ) ); } } // (the mirror image is only read where there is standing water: the damp road around it shows the sky alone)
        r /= taps; // (MEDIUM, uLite: one read of the mirror image, not five)
        sky += vec3( .8, .88, 1.0 ) * uFlash * ( .5 + .5 * patchK ); // (lightning: the whole sky lights up, the thin cloud most)
        r.rgb *= .97 + uFlash * 1.3; sky *= .73;
        // The lightning bolt, drawn in the sky plane (cp) like the cloud: a line from uBolt.xy to uBolt.zw whose sideways offset is noise at three scales (big sweeps, kinks, fine jitter), a hot thin core and a
        // soft glow round it, two branches that leave it part of the way down, and a flash of the whole sky behind it. It widens a little with distance from its start (nearer the ground, seen in perspective).
        // the bolt in the mirror is smudged: its position wobbles with a soft noise (so the line wanders like it is seen through disturbed water), and every distance to it is scaled down, which widens the core, glow and halo alike
        vec2 cpB = cp + ( vec2( vnoise( cp * 7.0 + 3.0 ), vnoise( cp * 7.0 + 17.0 ) ) - .5 ) * .3;
        if ( uFlash > .02 ) {
          float bl = length( uBolt.zw - uBolt.xy ); vec2 mdir = ( uBolt.zw - uBolt.xy ) / bl, mn = vec2( - mdir.y, mdir.x );
          vec2 md = boltPoly( cpB, uBolt.xy, uBolt.zw, uBoltSeed, 24.0 ); md.x *= .55; float bt = md.y, bw = .12 + bt * .22;   // (it widens a little toward the ground, nearer to us)
          float flick = .65 + .7 * vnoise( vec2( bt * 38.0, uBoltSeed ) );                                      // (beads of light along the channel)
          float core = exp( - md.x * md.x / ( bw * bw ) ) * flick, glow = exp( - md.x * md.x / ( bw * bw * 22.0 ) ), halo = exp( - md.x * md.x / ( bw * bw * 420.0 ) );
          // forks leave the main stroke at different heights and lean on down it, each throwing off twigs, all of them broken lines too, thinner and fainter toward their tips
          for ( int k = 0; k < 7; k ++ ) {
            float fk = float( k ), s0 = .08 + fk * .12 + hash( vec2( uBoltSeed + fk, 5.0 ) ) * .07, side = mod( fk + floor( uBoltSeed ), 2.0 ) < 1.0 ? 1.0 : -1.0;
            vec2 from = boltPt( uBolt.xy, uBolt.zw, uBoltSeed, 24.0, s0 * 24.0 );
            float ang = ( .25 + .6 * hash( vec2( fk, uBoltSeed ) ) ) * side, sl = bl * ( .2 + .28 * hash( vec2( fk + 7.0, uBoltSeed ) ) );
            vec2 to = from + normalize( mdir + mn * ang ) * sl, fd = to - from;
            float fs = uBoltSeed + 9.0 + fk * 4.0;
            vec2 bd = boltPoly( cpB, from, to, fs, 10.0 ); bd.x *= .55; float fade = 1.0 - bd.y * .8, sw = ( .08 + bd.y * .05 ) * ( 1.0 - bd.y * .5 );
            core = max( core, exp( - bd.x * bd.x / ( sw * sw ) ) * fade * .85 ); glow = max( glow, exp( - bd.x * bd.x / ( sw * sw * 22.0 ) ) * fade * .65 ); halo = max( halo, exp( - bd.x * bd.x / ( sw * sw * 300.0 ) ) * fade * .4 );
            for ( int m = 0; m < 2; m ++ ) { // twigs off the fork
              float tt = .3 + float( m ) * .35, ts = m == 0 ? -side : side;
              vec2 f2 = boltPt( from, to, fs, 10.0, tt * 10.0 ), t2 = f2 + normalize( fd + vec2( - fd.y, fd.x ) * ts * .9 ) * sl * ( .38 - float( m ) * .08 );
              vec2 td = boltPoly( cpB, f2, t2, uBoltSeed + 21.0 + fk * 3.0 + float( m ) * 5.0, 5.0 ); td.x *= .55; float tf = ( 1.0 - td.y ) * ( 1.0 - bd.y * .3 ), tw = .055 * ( 1.0 - td.y * .6 );
              core = max( core, exp( - td.x * td.x / ( tw * tw ) ) * tf * .7 ); glow = max( glow, exp( - td.x * td.x / ( tw * tw * 22.0 ) ) * tf * .45 );
            }
          }
          // white-hot in the core, blue-violet in the glow, a wide pale-blue light in the cloud round it
          sky += ( vec3( 1.0, 1.0, 1.0 ) * core * 4.0 + vec3( .55, .68, 1.0 ) * glow * 1.8 + vec3( .32, .4, .85 ) * halo * .9 ) * uFlash;
        } // (lightning: whatever is in the mirror, the bolt above all, is pushed brighter than the 8-bit mirror image can hold) // (the reflected scene a touch darker)
        // (the mirror image is premultiplied: what was drawn into it already carries its own coverage, and glowing things (flames, sparks) add light without adding coverage; so it is laid over the sky as
        // image + sky * ( 1 - coverage), not mixed by coverage again, which dimmed smoke twice and left a flame nearly invisible)
        
        
        // the water: a clear, bright mirror
        vec3 water = mix( vec3( dot( r.rgb, vec3( .299, .587, .114 ) ) ), r.rgb, 1.35 ) * .95 + sky * ( 1.0 - clamp( r.a * .95, 0.0, 1.0 ) ); // (a touch more colour in the reflected things only, saturation 1.35: not the sky)
        water += vec3( .85, .92, 1.0 ) * vLight * .15 * pool;
        // The rings are also SHADED, not only bent: the side of a ring that faces the light is brighter and the far side darker, so they read in any picture, not just where the mirror image has contrast to bend (a plain grey sky showed nothing)
        float emb = dot( vSlope - wakeS * bigPool, normalize( uSun.xz ) ); // (the rain's rings and the drops that land in the big puddles, not the jeep's wake)
        water *= 1.0 + clamp( emb * .5, -.3, .3 ) * pool;
        water += vec3( .85, .92, 1.0 ) * max( emb, 0.0 ) * .1 * pool;
        vec3 R = reflect( -V, vec3( 0.0, 1.0, 0.0 ) ); float nh = max( dot( R, normalize( uSun ) ), 0.0 );
        if ( road < .99 ) water += vec3( 1.0, .97, .9 ) * ( pow( nh, 700.0 ) * 8.0 + pow( nh, 60.0 ) * .2 ) * pool * ( 1.0 - road );
        // The bright rim, the way water does it: no white added. Right at the boundary the surface is the smoothest (roughness ~0.01), so it mirrors the bright sky most strongly there; the asphalt's coarse
        // bumps (fine noise standing in for the road's normal map) tilt that mirror, so the rim breaks into tiny sharp glints of sky instead of a solid ribbon.
        float edgeZone = smoothstep( .7, .72, f ) * ( 1.0 - smoothstep( .74, .8, f ) );
        float glint = 0.0; if ( edgeZone > 0.0 ) { float bump = texture2D( tNoise, w / 5.0 + .11 ).r * .6 + texture2D( tNoise, w / 2.2 + .6 ).r * .4; glint = smoothstep( .54, .86, bump ); } // (the glint's two noise reads only where the rim is)                       // the bumps that happen to face the sky
        water = mix( water, sky * ( 1.0 + .2 * glint ), edgeZone * ( .3 + .2 * fresnel ) * mix( 1.0, .5, uRoad ) );
        water = mix( vec3( .25, .27, .3 ), water, uPool ); // (uPool 0, the = key: no reflection, no ripples, no glints in the water: a plain dark film, to see what the water layer does on its own)
        // Water reflects according to the angle it is seen at (the Fresnel effect): looking almost straight down into it you see through to the bottom, the road's texture, and only a weak reflection; at a wide,
        // glancing angle the surface reflects strongly and hides the bottom. So the water layer's cover follows the view angle (viewK: 0 looking straight down .. 1 near grazing), and only the shallow
        // rim keeps a firmer film whatever the angle.
        float viewK = smoothstep( .1, .55, 1.0 - V.y );
        float Rf = .449 + .551 * viewK;
        float cover = smoothstep( .3, .62, Rf );   // how much of the road is hidden: it falls away fast once the reflection dominates (the white lines and cracks must not show through a strong mirror), but a weak reflection lets it through
        float poolA = min( pool * mix( max( cover, .7 ), cover, depthW ), .9 ); // (never fully opaque: at the widest angle the road underneath still shows faintly)
        gl_FragColor = vec4( uRoad > .5 ? water : mix( rough, water, pool ), mix( max( roughA, poolA ), roughA, road ) * ( uAll > .5 && realPool <= 0.0 ? .5 : 1.0 ) ); // (the debug view: the real puddles at full strength, the rest at half)
      }`,
  });
  // A probe: the same wetness (the exact formula the water is drawn with, run for one spot into a one-pixel target and read back) so the game knows where the water really is, e.g. whether the jeep is in a puddle.
  const probeRT = new THREE.WebGLRenderTarget(1, 1), probeBuf = new Uint8Array(4), probeScene = new THREE.Scene(), probeCam = new THREE.Camera();
  const probeMat = new THREE.ShaderMaterial({
    uniforms: { uPos: { value: new THREE.Vector2() }, uOff, uShift: { value: shift }, ...uBuild }, depthTest: false, depthWrite: false,
    vertexShader: 'void main() { gl_Position = vec4( position.xy, 0.0, 1.0 ); }',
    fragmentShader: `uniform vec2 uPos; uniform vec2 uOff; uniform float uShift; uniform sampler2D tBuild; uniform vec4 uMap; ${field}
      void main() { float f = wetField( uPos + uOff ) + texture2D( tBuild, ( uPos - uMap.xy ) / uMap.zw ).r * .7 - uShift; gl_FragColor = vec4( clamp( f, 0.0, 1.0 ), 0.0, 0.0, 1.0 ); }`,
  });
  probeScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), probeMat));
  // The wetness field (wetField) depends on the position alone, so it is worked out ONCE into a map (half floats, 0.2 m a texel or coarser for a very big surface) and both layers read that: it was the biggest cost of the road,
  // run twice for every pixel of it (sixteen texture reads and the boost loop each time).
  const bakeField = renderer => {
    geo.computeBoundingBox(); const bb = geo.boundingBox, sx = bb.max.x - bb.min.x, sz = bb.max.z - bb.min.z, texel = Math.max(.2, Math.sqrt(sx * sz / 6e6));
    const w = Math.min(4096, Math.ceil(sx / texel)), h = Math.min(4096, Math.ceil(sz / texel));
    const rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, format: THREE.RGBAFormat, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false });
    const box = new THREE.Vector4(bb.min.x, bb.min.z, sx, sz);
    const bm = new THREE.ShaderMaterial({ uniforms: { uOff, ...uBuild, ...uHoles, ...uVls, ...uField, uSize: { value: new THREE.Vector2(w, h) }, uBake: { value: box } }, depthTest: false, depthWrite: false,
      vertexShader: 'void main() { gl_Position = vec4( position.xy, 0.0, 1.0 ); }',
      fragmentShader: `uniform vec2 uSize; uniform vec4 uBake; uniform vec2 uOff; uniform sampler2D tBuild; uniform vec4 uMap; ${field}
        void main() { vec2 world = uBake.xy + gl_FragCoord.xy / uSize * uBake.zw; gl_FragColor = vec4( wetField( world + uOff ), 0.0, 0.0, 1.0 ); }` });
    const sc = new THREE.Scene(), q = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), bm); q.frustumCulled = false; sc.add(q);
    const prev = renderer.getRenderTarget(), ac = renderer.autoClear; renderer.autoClear = false; renderer.setRenderTarget(rt); renderer.render(sc, new THREE.Camera()); renderer.setRenderTarget(prev); renderer.autoClear = ac;
    bm.dispose(); q.geometry.dispose();
    uField.tField.value = rt.texture; uField.uBox.value.copy(box); uField.uHave.value = 1;
  };
  // The cloud sky, baked: it depends on cp alone (where the reflected ray meets the cloud layer) and the time, not on the pixel, yet was worked out for every pixel of every puddle (eleven layers of noise and nine cells of gap search).
  // It is drawn into a small map instead, a few times a second (the drift is slow), and the film reads it.
  let skyRT = null, skyQ = null, skyScene = null, skyAt = -9;
  const bakeSky = renderer => {
    const now = mat.uniforms.uTime.value; if (skyRT && now - skyAt < SKY_EVERY) return; skyAt = now;
    if (!skyRT) {
      skyRT = new THREE.WebGLRenderTarget(SKY_RES, SKY_RES, { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false });
      const sm = new THREE.ShaderMaterial({ uniforms: { uOff, ...uBuild, ...uHoles, ...uVls, ...uField, uTime: mat.uniforms.uTime, uLite: mat.uniforms.uLite }, depthTest: false, depthWrite: false,
        vertexShader: 'void main() { gl_Position = vec4( position.xy, 0.0, 1.0 ); }',
        fragmentShader: `uniform float uTime; uniform float uLite; uniform vec2 uOff; uniform sampler2D tBuild; uniform vec4 uMap; ${field}
          void main() {
            vec2 cp = ( gl_FragCoord.xy / ${SKY_RES.toFixed(1)} - .5 ) * ${SKY_SPAN.toFixed(1)};
        // Detailed cloud: five layers of noise from big masses down to fine wisps, each drifting on the wind at its own speed (the big ones slowly), so the sky keeps changing even when the view stands still.
        vec2 wind = vec2( 1.0, .4 ) * uTime * .2; // (the drift's overall pace)
        float clLo = vnoise( ( cp + wind * 4.0 ) * .024 ) * .22 + vnoise( ( cp + wind * 6.0 ) * .052 + 3.0 ) * .26, clHi = vnoise( ( cp + wind * 8.5 ) * .11 + 9.0 ) * .24 + vnoise( ( cp + wind * 11.0 ) * .24 + 15.0 ) * .18 + vnoise( ( cp + wind * 14.0 ) * .5 + 27.0 ) * .10;
        float cl = clLo + clHi;
        cl = .5 + ( cl - .5 ) * 1.11; // (the weight moved to the finer layers, which narrows the spread of values; this puts it back, so the share of cloud to blue stays the same, but the patches are smaller and mixed: no long run of one or the other)
        float cloud = smoothstep( .35, .54, cl );
        // Gaps spread evenly: one clear hole of random size in every cell of a loose grid (nearest-point cells), cut out of the cloud, so the blue shows up regularly across the cloud instead of clumping
        vec2 gq = ( cp + wind * 6.0 ) * .05 + ( vec2( vnoise( cp * .035 + 2.0 ), vnoise( cp * .035 + 8.0 ) ) - .5 ) * .7, gi = floor( gq ), gf = fract( gq ); float gd = 1.0;
        for ( int j = -1; j <= 1; j ++ ) for ( int i = -1; i <= 1; i ++ ) { vec2 gg = vec2( float( i ), float( j) ); vec2 go = vec2( hash( gi + gg + 7.0 ), hash( gi + gg + 31.0 ) ); gd = min( gd, length( gg + go - gf ) / ( .23 + .17 * hash( gi + gg + 53.0 ) ) ); }
        cloud *= 1.0 - ( 1.0 - smoothstep( .6, 1.0, gd ) ) * .85;                              // partly cloudy: a firmer edge, so there is clear sky between the clouds
        // lit cloud: the same cloud sampled a little toward the sun; where it is thicker toward the sun the near edge is in shade, where it is thinner it is lit: a soft volume on every mass
        vec2 toSun = vec2( -9.0, 10.0 );
        float cl2 = vnoise( ( cp + toSun + wind * 4.0 ) * .024 ) * .22 + vnoise( ( cp + toSun * .6 + wind * 6.0 ) * .052 + 3.0 ) * .26 + vnoise( ( cp + toSun * .3 + wind * 8.5 ) * .11 + 9.0 ) * .24;
        float lightSide = uLite > .5 ? .5 : clamp( .5 + ( cl - cl2 * 1.0 ) * 2.4, 0.0, 1.0 );
        // A partly cloudy sky: blue between the clouds (deeper overhead, paler toward the horizon), and white cumulus with grey bellies where the cloud is thick and a lit, bright edge toward the sun
        // An overcast sky made of cloud patches, a dark white and a light white mixed: the thick cloud is the darker grey-white, thin cloud and the old gaps the lighter white, and the cloud's own brightness
        // varies finely too, so no patch is one flat tone. No blue at all.
        float thick = smoothstep( .3, .55, .5 + ( clHi - .26 ) * 1.7 + ( clLo - .24 ) * .2 ); // (driven by the finer layers: the broad ones, which made one big dark or bright stretch, hardly count)
        float patchK = clamp( .78 - thick * .8 + ( 1.0 - cloud ) * .2 + ( vnoise( ( cp + wind * 9.0 ) * .11 + 5.0 ) - .5 ) * .5, 0.0, 1.0 );
        vec3 sky = mix( vec3( .55, .57, .62 ), vec3( .774, .782, .808 ), patchK );
        sky = mix( sky, sky * vec3( .66, .7, .78 ), cloud * ( 1.0 - lightSide ) * smoothstep( .55, .8, cl ) * .9 ); // (the shaded undersides of the thicker clouds)
        // Dark storm cloud: a few big, low-frequency masses of heavy grey-blue cloud that slide across, darkening whatever is under them (the clouds more than the clear sky), with a lit edge toward the sun
        float stormN = vnoise( ( cp + wind * 2.5 ) * .04 + 40.0 ) * .5 + vnoise( ( cp + wind * 4.0 ) * .085 + 7.0 ) * .3 + vnoise( ( cp + wind * 6.0 ) * .19 + 19.0 ) * .2; // (higher frequencies than before: the dark patches are smaller too)
        float storm = uLite > .5 ? 0.0 : smoothstep( .5, .72, stormN );
        sky = mix( sky, vec3( .25, .28, .33 ) * ( .8 + .45 * lightSide ), storm * ( .4 + .3 * cloud ) );
            gl_FragColor = vec4( clamp( sky * .9, 0.0, 1.0 ), patchK );
          }` });
      skyScene = new THREE.Scene(); skyQ = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), sm); skyQ.frustumCulled = false; skyScene.add(skyQ);
      mat.uniforms.tSky.value = skyRT.texture;
    }
    const prev = renderer.getRenderTarget(), ac = renderer.autoClear; renderer.autoClear = false; renderer.setRenderTarget(skyRT); renderer.render(skyScene, new THREE.Camera()); renderer.setRenderTarget(prev); renderer.autoClear = ac;
  };
  const matte = [];
  const meshDamp = new THREE.Mesh(geo, damp), mesh = new THREE.Mesh(geo, mat), meshes = darken ? [meshDamp, mesh] : [mesh];
  for (const m of meshes) { m.receiveShadow = false; m.frustumCulled = false; m.userData.noWater = true; scene.add(m); }
  if (params.has('debug')) addEventListener('keydown', e => { if (e.key === '\\' && !e.repeat) { mat.uniforms.uAll.value = 1 - mat.uniforms.uAll.value; console.log('every wet road a mirror:', !!mat.uniforms.uAll.value); } }); // (debugging: the backslash key switches every wet bit of road to a full mirror and back, to see where the real puddles are)
  const dbg = params; // (debugging: ?nowet=1 hides the wet layer altogether, ?nomirror=1 skips the mirror image)
  if (dbg.has('nowet')) for (const m of meshes) m.visible = false;
  meshDamp.renderOrder = -1; mesh.renderOrder = 2.5; // (the darkening goes first, under the road paint: the arrows and lines are drawn over the wet road at full strength) // (the wet film comes after the flat marks (2) but BEFORE the smoke (3) and glows (4): at 4 it was drawn over the smoke, and covered every trail where the road was wet)

  // The mirror: a camera reflected in the road's surface, with an oblique near plane on it so nothing below the road is drawn (the same as water.js).
  const mirrorCam = new THREE.PerspectiveCamera();
  const normal = new THREE.Vector3(0, 1, 0), surface = new THREE.Vector3(0, y, 0), camPos = new THREE.Vector3(), rot = new THREE.Matrix4(), view = new THREE.Vector3(), lookAt = new THREE.Vector3(), target3 = new THREE.Vector3();
  const plane = new THREE.Plane(), clip = new THREE.Vector4(), qv = new THREE.Vector4(), clearColor = new THREE.Color();
  function updateMirror(camera) {
    camera.updateMatrixWorld(); camPos.setFromMatrixPosition(camera.matrixWorld);
    view.subVectors(surface, camPos);
    if (view.dot(normal) > 0) return false;
    view.reflect(normal).negate().add(surface);
    rot.extractRotation(camera.matrixWorld);
    lookAt.set(0, 0, -1).applyMatrix4(rot).add(camPos);
    target3.subVectors(surface, lookAt).reflect(normal).negate().add(surface);
    mirrorCam.position.copy(view); mirrorCam.up.set(0, 1, 0).applyMatrix4(rot).reflect(normal); mirrorCam.lookAt(target3); mirrorCam.far = camera.far; mirrorCam.updateMatrixWorld();
    mirrorCam.projectionMatrix.copy(camera.projectionMatrix);
    textureMatrix.set(.5, 0, 0, .5, 0, .5, 0, .5, 0, 0, .5, .5, 0, 0, 0, 1).multiply(mirrorCam.projectionMatrix).multiply(mirrorCam.matrixWorldInverse);
    plane.setFromNormalAndCoplanarPoint(normal, surface).applyMatrix4(mirrorCam.matrixWorldInverse);
    clip.set(plane.normal.x, plane.normal.y, plane.normal.z, plane.constant);
    const e = mirrorCam.projectionMatrix.elements;
    qv.set((Math.sign(clip.x) + e[8]) / e[0], (Math.sign(clip.y) + e[9]) / e[5], -1, (1 + e[10]) / e[14]);
    clip.multiplyScalar(2 / clip.dot(qv));
    e[2] = clip.x; e[6] = clip.y; e[10] = clip.z + 1 - .003; e[14] = clip.w;
    return true;
  }
  let flatMirror = params.get('flatmirror') === '1' || params.get('flatmirror') === 'test'; const twins = new WeakMap(), FLAT_DARK = .82;   // (off by default: it loses the containers' bump-mapped ridges and looked blurrier; ?flatmirror=1 turns it on, M toggles it live)
  if (params.has('debug')) addEventListener('keydown', e => { if (e.key === '[' && !e.repeat) { mat.uniforms.uDbgBand.value = 1 - mat.uniforms.uDbgBand.value; console.log('rough road bands painted (blue: scene reflection mixed in, green: sky only):', !!mat.uniforms.uDbgBand.value); } });
  { const flip = (u, what) => { u.value = 1 - u.value; console.log(what + ':', !!u.value); }; // runtime switches for the layers: ' soaked-road darkening, / pebble shallows at the rim, - the puddle's bumpiness (off = a smooth mirror); ; is the rough reflection of the road (above)
    if (params.has('debug')) addEventListener('keydown', e => { if (e.repeat) return; if (e.key === "'") flip(damp.uniforms.uDampOn, 'soaked-road darkening'); else if (e.key === '/') flip(mat.uniforms.uPeb, 'pebble shallows at the puddle rim'); else if (e.key === '-') flip(mat.uniforms.uPR, 'puddle bumpiness'); else if (e.key === '`') flip(mat.uniforms.uRoad, 'wet road drawn with the water shader'); else if (e.key === '=') flip(mat.uniforms.uPool, 'puddle reflection and ripples'); }); }
  if (params.has('debug')) addEventListener('keydown', e => { if (e.key === ';' && !e.repeat) { mat.uniforms.uRoughRoad.value = 1 - mat.uniforms.uRoughRoad.value; console.log('rough reflective road:', !!mat.uniforms.uRoughRoad.value); } });
  if (params.has('debug')) addEventListener('keydown', e => { if ((e.key === 'm' || e.key === 'M') && !e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey) { flatMirror = !flatMirror; console.log(flatMirror ? 'reflection: CHEAP (flat materials)' : 'reflection: NORMAL (full materials)'); } });   // (M: switch the cheap mirror on and off while playing, to compare)
  const flatTwin = m => {
    if (!(m.isMeshStandardMaterial || m.isMeshPhongMaterial || m.isMeshLambertMaterial) || m.userData.noFlat) return m;
    let t = twins.get(m);
    if (!t) { t = new THREE.MeshBasicMaterial({ vertexColors: m.vertexColors, transparent: m.transparent, opacity: m.opacity, alphaTest: m.alphaTest, side: m.side, depthWrite: m.depthWrite }); if (m.map) t.map = m.map; if (m.alphaMap) t.alphaMap = m.alphaMap; twins.set(m, t); }
    if (params.get('flatmirror') === 'test') t.color.set(0xff00ff); else t.color.copy(m.color).multiplyScalar(FLAT_DARK); return t;   // (?flatmirror=test: every swapped material magenta, to see where the swap shows)   // (kept in step each frame: a hull that is charred, a lamp that changes colour)
  };
  let noMirror = false, oldCull = false;
  let mode = 'full'; // the graphics level's say: 'full' (everything mirrored), 'lite' (MEDIUM: a half-size mirror read once, a plainer sky), 'damp' (LOW: only the road darkened by wet, no puddles, no mirror)
  return {
    mesh,
    setNoMirror(v) { noMirror = v; }, // (the live profile: skip the mirror image's pass, to time it)
    setOldCull(v) { oldCull = !!v; }, // (the stage switches panel: the old way of leaving models out of the mirror, by distance from the middle of the view, to compare with the new)
    setFlash(v) { mat.uniforms.uFlash.value = v; },
    setStorm(v) { for (const m of [mat]) m.uniforms.uStorm.value = v; },
    setBolt(ax, az, bx, bz, seed) { mat.uniforms.uBolt.value.set(ax, az, bx, bz); mat.uniforms.uBoltSeed.value = seed; },
    setCut(n) { mat.uniforms.uCut.value = n; }, setRainRip(on) { mat.uniforms.uRainRip.value = on ? 1 : 0; }, setRoad(on) { mat.uniforms.uRoad.value = on ? 1 : 0; }, setRough(on) { mat.uniforms.uRoughRoad.value = on ? 1 : 0; }, // (for the profile: the wet-road water look, and the rough layer, on or off)
    setMode(m) { mode = m; mat.uniforms.uLite.value = m === 'lite' ? 1 : 0; if (!opts.near) mat.uniforms.uRoad.value = m === 'full' && params.get('roadwater') !== '0' ? 1 : 0; // (the wet road drawn with the water shader only at the full level: the lite level keeps the cheaper rough layer)
      for (const x of meshes) x.visible = !dbg.has('nowet') && (m === 'full' || m === 'lite' || (m === 'damp' && x === meshDamp)); },
    // Mark what the mirror should show: every tall static thing in the scene (call once the level is built).
    flag(root) {
      root.traverse(o => { if (o.isMesh) for (const m of [].concat(o.material)) if (m?.userData?.mirrorMatte && !matte.includes(m)) matte.push(m); }); // (materials drawn matte in the mirror)
      const box = new THREE.Box3(), v = new THREE.Vector3();
      for (const o of root.children) {
        if (meshes.includes(o) || o.isLight || o.userData.fxBatch || o.userData.noWater || (o.isInstancedMesh && !o.userData.mirror)) continue; // (instanced props are left out unless marked userData.mirror: the barricades are, a few draw calls a kind whatever their number)
        box.setFromObject(o); if (box.isEmpty()) continue; box.getSize(v);
        if (!o.userData.mirror && (v.y < 1.2 || (v.x > 300 && v.z > 300))) continue; // (flat things and the ground itself; the marked barricades are low but wanted)
        o.traverse(m => { if (m.layers.mask !== 1 << SHADOW_ONLY) m.layers.enable(PUDDLE); }); // (not the plain white twins that only cast the containers' shadows: they would show in the mirror as white boxes)
      }
    },
    // Draw the mirror image (before the scene's own passes).
    // How wet the road is at (x, z), 0..1 (above about .7 is standing water, as drawn): read back from the GPU, so call it sparingly (a few times a second).
    probe(renderer, x, z) {
      rendererRef = renderer;
      if (!window.__probeCheck) window.__probeCheck = (n = 300) => { let worst = 0, agree = 0, wet = 0; for (let i = 0; i < n; i++) { const px = (Math.random() - .5) * W * .9, pz = -Math.random() * L, a = wetnessCPU(px, pz), g = this.gpuProbe(rendererRef, px, pz); worst = Math.max(worst, Math.abs(a - g)); if ((a > .72) === (g > .72)) agree++; if (g > .72) wet++; } console.log('probe check over ' + n + ' random points: largest difference ' + worst.toFixed(3) + ', same wet/dry answer at ' + agree + ', of which standing water ' + wet); };
      if (wetnessCPU && !params.has('gpuprobe')) return wetnessCPU(x, z);
      return this.gpuProbe(renderer, x, z);
    },
    gpuProbe(renderer, x, z) {
      probeMat.uniforms.uPos.value.set(x, z);
      const prev = renderer.getRenderTarget();
      renderer.setRenderTarget(probeRT); renderer.render(probeScene, probeCam); renderer.readRenderTargetPixels(probeRT, 0, 0, 1, 1, probeBuf); renderer.setRenderTarget(prev);
      return probeBuf[0] / 255;
    },
    // A ripple at (x, z): the oldest of the twelve slots is reused. amp ~1 for a jeep at speed.
    addRipple(x, z, amp = 1, dir = null) { // dir: { x, z } the way the vehicle was heading (only the half ring ahead of it is drawn); leave it out for a whole ring
      const slots = mat.uniforms.uRip.value; let i = 0;
      slots.forEach((sl, k) => { if (sl.z < slots[i].z) i = k; });
      slots[i].set(x, z, performance.now() / 1000, amp);
      const len = dir ? Math.hypot(dir.x, dir.z) : 0, d = mat.uniforms.uRipDir.value[i];
      if (len > 1e-4) d.set(dir.x / len, dir.z / len); else d.set(0, 0);
    },
    render(renderer, scene, camera) {
      if (!uField.uHave.value && !dbg.has('nobake')) bakeField(renderer);
      mat.uniforms.uTime.value = performance.now() / 1000; // (the clouds' drift)
      { // the rain's rings are timed by phases ADDED UP a frame at a time, not by rate x time: the storm's strength changes as the jeep drives north, and a rate that moves multiplied by a time of hundreds of seconds threw every drop's phase about, frame to frame (flicker)
        const nowS = performance.now() / 1000, dtS = Math.min(.1, Math.max(0, nowS - (mat.userData.lastT ?? nowS))), st = mat.uniforms.uStorm.value; mat.userData.lastT = nowS;
        mat.uniforms.uPhase.value += dtS * (.85 + .9 * st); mat.uniforms.uBigT.value += dtS / (1 - .55 * st);
      }
      window.__mirrorWhy = 'render called, mode ' + mode + ' (this road: ' + (mat.userData?.name ?? '?') + ')';
      if (mode === 'none' || mode === 'damp' || dbg.has('nomirror') || dbg.has('nowet') || noMirror) return;
      camera.getWorldDirection(dir); { const reach = dir.y < -.05 ? -camera.position.y / dir.y : 60; focus.copy(camera.position).addScaledVector(dir, Math.min(reach, 200)); }
      if (opts.near && !opts.near.some(r => focus.x > r.x0 - WATER_VIEW && focus.x < r.x1 + WATER_VIEW && focus.z > r.z0 - WATER_VIEW && focus.z < r.z1 + WATER_VIEW)) { window.__mirrorWhy += ' / skipped: no roof near the view'; return; } // (a surface limited to the roofs: no mirror image unless one is in view)
      if (!mat.uniforms.uAll.value && mat.uniforms.uRoad.value < .5 && !params.has('seedpick') && !waterNear(focus.x, focus.z)) { window.__mirrorWhy += ' / skipped: no standing water near the view'; return; } // (no standing water in view: nothing would read the mirror image)
      lastScene = scene;
      window.__mirrorWho ??= (r = 45) => { // (a debugging aid: __mirrorWho() in the console lists the containers within r m of where the camera looks, and whether each is in the puddle mirror and, if not, why)
        const bb = new THREE.Box3(), sz = new THREE.Vector3(), ct = new THREE.Vector3(), rows = [];
        for (const o of lastScene.children) { const e = o.userData?.ent; if (!e || !/^container/.test(e.type)) continue; bb.setFromObject(o); bb.getCenter(ct); bb.getSize(sz); const d = Math.hypot(ct.x - focus.x, ct.z - focus.z); if (d > r) continue;
          const inLayer = !!(o.layers.mask & (1 << PUDDLE)), why = !inLayer ? (o.userData.noWater ? 'noWater flag' : sz.y < 1.2 ? 'too low (' + sz.y.toFixed(2) + ' m)' : 'never flagged (not in the mirror layer)') : d > MIRROR_REACH ? 'beyond the reach (' + d.toFixed(0) + ' m)' : o.visible ? 'IN THE MIRROR' : 'hidden';
          rows.push({ type: e.type, x: +ct.x.toFixed(1), z: +ct.z.toFixed(1), height: +sz.y.toFixed(1), dist: +d.toFixed(0), status: why }); }
        console.table(rows.sort((a, b) => a.dist - b.dist)); return rows.length + ' containers within ' + r + ' m of the view (focus ' + focus.x.toFixed(0) + ', ' + focus.z.toFixed(0) + ')'; };
      bakeSky(renderer);
      if (!updateMirror(camera)) { window.__mirrorWhy += ' / skipped: camera below the road'; return; }
      renderer.getDrawingBufferSize(size); const w = Math.max(1, Math.round(size.x * (mode === 'lite' ? .5 : .75))), h = Math.max(1, Math.round(size.y * (mode === 'lite' ? .5 : .75))); // (three quarters of the screen's resolution: half was too coarse for a wall's fine lines)
      if (!msaaDone) { // (once: the mirror image drawn with 4x multisampling where the browser allows it, so thin lines and edges in it don't crawl as the view scrolls)
        msaaDone = true;
        if (renderer.capabilities.isWebGL2) { const t = new THREE.WebGLMultisampleRenderTarget(w, h, rtOpts); t.samples = mode === 'lite' ? 2 : 4; mat.uniforms.tReflect.value = t.texture; target.dispose(); target = t; }
      }
      if (target.width !== w || target.height !== h) target.setSize(w, h);
      const bg = scene.background, clear = renderer.getClearColor(clearColor), clearA = renderer.getClearAlpha(), prevTarget = renderer.getRenderTarget();
      // Moving models (tanks, jeeps, turrets, soldiers) far from the view can't show in a puddle on screen, so for this pass any more than MIRROR_REACH metres from where the camera looks are switched off
      // (only whole models, never part of one: clipping the far end of the mirror's view instead was tried, and drew streaks; and never the level's own big meshes).
      const culled = [];
      // Judged by where its REFLECTION falls, not by how far it stands from the middle of the view: the road is a mirror, so a model's image lies under the road, its mirror image, and shows only if that image is inside the camera's view.
      // (The view is a tilted perspective one: a model just off the bottom of the screen can be much nearer the middle than one well inside it, and its image falls up into the view, so distance from the middle cannot tell them apart.)
      camera.updateMatrixWorld(); mirrorFrustum.setFromProjectionMatrix(mirrorM4.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
      for (const o of scene.children) {
        if (!o.isGroup || !o.visible || o.userData.fxBatch || !(o.layers.mask & ((1 << REFLECT) | (1 << PUDDLE)))) continue;
        if (oldCull) { if (Math.hypot(o.position.x - focus.x, o.position.z - focus.z) > MIRROR_REACH) { o.visible = false; culled.push(o); } continue; } // (the old way: by distance from where the camera looks)
        let bd = mirrorBound.get(o);
        if (!bd) { mirrorBox.setFromObject(o); if (mirrorBox.isEmpty()) bd = { empty: true }; else { mirrorBox.getBoundingSphere(mirrorSph); bd = { off: mirrorSph.center.clone().sub(o.position), r: mirrorSph.radius + mirrorSph.center.clone().sub(o.position).length() }; } mirrorBound.set(o, bd); } // (its size and where its middle lies, worked out once; the radius takes in the middle's offset, so a model turning on the spot stays inside it)
        if (bd.empty) continue;
        mirrorSph.center.set(o.position.x, -(o.position.y + bd.off.y), o.position.z); mirrorSph.radius = bd.r + 2; // (its image: the same place, as far under the road as the model's middle stands over it)
        if (!mirrorFrustum.intersectsSphere(mirrorSph)) { o.visible = false; culled.push(o); }
      }
      (window.__mirrorCull ??= {})[meshes.length ? 'road' : 'roof'] = { left_out: culled.length, of: scene.children.filter(o => o.isGroup && o.userData && !o.userData.fxBatch && (o.layers.mask & ((1 << REFLECT) | (1 << PUDDLE)))).length, method: oldCull ? 'old (distance)' : 'new (image in view)' }; // (type __mirrorCull in the console: how many models this mirror left out this frame, of how many it could draw)
      for (const m of meshes) m.visible = false; scene.background = null; renderer.setClearColor(0x000000, 0);
      mirrorCam.layers.set(REFLECT); mirrorCam.layers.enable(PUDDLE);
      // The mirror looks at the walls and roofs from another angle than the camera, where their wet gloss (streaks of sky reflection) would flare white: patterns the real surfaces don't show from here. So while
      // the mirror image is drawn they are matte (only numbers change, nothing recompiles).
      const saved = matte.map(m => [m.roughness, m.envMapIntensity]); for (const m of matte) { m.roughness = 3; m.envMapIntensity = .06; }
      const info = renderer.info.render, c0 = info.calls, t0 = info.triangles;
      let trace = null, hooked = null;
      if (window.__mirrorTraceOn) { // (the profile: count every call of this pass by the top-level model it belongs to; see __mirrorTrace in main.js)
        trace = new Map(); hooked = [];
        scene.traverse(o => { if (!(o.isMesh || o.isPoints || o.isLine || o.isSprite)) return; let root = o; while (root.parent && root.parent !== scene) root = root.parent;
          const label = (root.name || (root.isMesh ? 'mesh ' + root.geometry.attributes.position.count + 'v' + (root.isInstancedMesh ? ' instanced' : '') : root.type)) + (root.visible ? '' : ' (hidden)'), before = o.onBeforeRender;
          hooked.push([o, before]); o.onBeforeRender = function (...a) { trace.set(label, (trace.get(label) ?? 0) + 1); before.apply(this, a); }; });
      }
      // (what the mirror shows is blurred and broken up anyway, so for this pass the lit materials (PBR, clearcoat, bump) are swapped for flat unlit twins of the same colour and texture, a little darker to stand in for the shading: far cheaper to draw. ?flatmirror=0 turns this off)
      const flatSwapped = [];
      if (flatMirror) for (const o of scene.children) {
        if (!o.visible || o.userData.fxBatch || meshes.includes(o) || !(o.layers.mask & ((1 << REFLECT) | (1 << PUDDLE)))) continue;
        o.traverse(m => {
          if (!m.isMesh || m.isSkinnedMesh || !m.visible) return;
          const orig = m.material, one = x => flatTwin(x), twin = Array.isArray(orig) ? orig.map(one) : one(orig);
          if (Array.isArray(orig) ? twin.some((t, i) => t !== orig[i]) : twin !== orig) { flatSwapped.push(m, orig); m.material = twin; }
        });
      }
      window.__flatMirror = { on: flatMirror, swapped: flatSwapped.length / 2 };   // (type __flatMirror in the console: is the flat swap on, and how many meshes it swapped this frame)
      renderer.setRenderTarget(target); renderer.clear(); renderer.render(scene, mirrorCam);
      for (let i = 0; i < flatSwapped.length; i += 2) flatSwapped[i].material = flatSwapped[i + 1];
      if (trace) { for (const [o, b] of hooked) o.onBeforeRender = b; (window.__mirrorTraceResult ??= []).push({ calls: [...trace.values()].reduce((t, n) => t + n, 0), kept: scene.children.filter(o => o.visible && (o.layers.mask & ((1 << REFLECT) | (1 << PUDDLE)))).length, rows: [...trace.entries()].sort((x, y) => y[1] - x[1]).slice(0, 30) }); }
      { // (for the profile: what the mirror pass drew, by top-level model; type __mirrorStats in the console)
        const by = {}; const cull = o => o.visible && !o.userData.fxBatch; let n = 0;
        scene.children.forEach(o => { if (!cull(o) || !(o.layers.mask & ((1 << REFLECT) | (1 << PUDDLE)))) return; let calls = 0; o.traverse(m => { if (m.isMesh && m.visible && (m.layers.mask & ((1 << REFLECT) | (1 << PUDDLE)))) calls++; }); if (calls) { const k = o.name || (o.isMesh ? 'mesh' : 'group'); by[k] = (by[k] ?? 0) + calls; n += calls; } });
        window.__mirrorStats = { calls: renderer.info.autoReset ? info.calls : info.calls - c0, triangles: renderer.info.autoReset ? info.triangles : info.triangles - t0, meshesByModel: Object.fromEntries(Object.entries(by).sort((a, b) => b[1] - a[1])) };
      }
      matte.forEach((m, i) => { m.roughness = saved[i][0]; m.envMapIntensity = saved[i][1]; });
      renderer.setRenderTarget(prevTarget); scene.background = bg; renderer.setClearColor(clear, clearA); for (const m of meshes) m.visible = true; for (const o of culled) o.visible = true;
    },
  };
}

// The surface of a set of roofs: one flat quad each ({ x0, x1, z0, z1 }), at height y.
export function roofGeometry(roofs, y) {
  const pos = [];
  for (const { x0, x1, z0, z1 } of roofs) pos.push(x0, y, z0, x1, y, z0, x1, y, z1, x0, y, z0, x1, y, z1, x0, y, z1);
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  return g;
}
