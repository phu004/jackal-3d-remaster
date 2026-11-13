// Bushes (the canopy / undergrowth in a level): real branch geometry carrying leaf sprays, in six distinct variants, every one under 1000 triangles.
// Self-contained, in the same style as palm.js (alpha-cut canvas textures, wind sway in the vertex shader, cut-out shadows).
//
// How it stays cheap but doesn't look like a low-poly blob:
//  - the wood is real tapered branches (a few 3-4 sided tubes) and every leaf spray sprouts from one of them;
//  - the foliage is hundreds of leaves drawn into a handful of alpha-cut sprays (4-16 triangles each), so the silhouette is leafy, not faceted;
//  - lighting is baked into vertex colours (dark inside, bright on the outside and top) and the normals are blended toward a rounded volume,
//    so a bush shades like one soft mass instead of a pile of flat cards;
//  - the cards on top lie flat, so it still reads as full foliage from a high top-down camera.
//
// Variants (BUSH_VARIANTS): 'leafy' (dense rounded shrub), 'flowering' (rounded, pink/white blossoms), 'willow' (tall, arching, drooping narrow leaves),
// 'scrub' (low, wide, sparse dry brush with bare twigs), 'fern' (a fan of arching fronds, no wood), 'juniper' (dark conical evergreen).
// Sizes are metres: ~3-4 m across and 1.2-3 m tall. Origin on the ground at the middle of the bush.
//
//   buildBush(variant, seed)       one bush (a Group with `foliage` and `wood` meshes); the same seed gives the same bush every run
//   scatterBushes(area, count, o)  hundreds of them in a few draw calls (InstancedMesh), for filling a canopy area
//   bushWind.value = seconds       advance every frame to animate the sway
//   bushTriangles(object)          triangle count of a bush or of a scatter
import * as THREE from 'three';
import { PI, cached, seededRandom } from './common.js';

export const bushWind = { value: 0 };
export const BUSH_VARIANTS = ['leafy', 'flowering', 'willow', 'scrub', 'fern', 'juniper'];
const BUDGET = 900;                                   // triangles per bush (the spray budget); the hard limit is 1000. The models are built with flat one-segment sprays and 3-sided branches, so a bush comes to about 0.4-0.55k

const lerp = (a, b, t) => a + (b - a) * t, pick = (r, u) => lerp(r[0], r[1], u), V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const clamp01 = x => Math.min(1, Math.max(0, x));
const ss = (a, b, x) => { const k = clamp01((x - a) / (b - a)); return k * k * (3 - 2 * k); };

// ---------------------------------------------------------------- leaf-spray textures (transparent background)
const rgb = a => 'rgb(' + a.map(v => Math.max(0, Math.min(255, Math.round(v)))).join(',') + ')';
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t), vary = (a, rnd, s) => a.map(v => v + (rnd() - .5) * s);

function leaf(x, ox, oy, ang, len, wid, c0, c1) {      // pointed leaf from its base outward, darker base to lighter tip, with a midrib, side veins, a lit edge and a soft shadow under it so the layers separate
  const shape = (dy = 0, k = 1) => { x.beginPath(); x.moveTo(0, dy); x.bezierCurveTo(len * .25, dy - wid * .9 * k, len * .75, dy - wid * .7 * k, len, dy); x.bezierCurveTo(len * .75, dy + wid * .7 * k, len * .25, dy + wid * .9 * k, 0, dy); };
  x.save(); x.translate(ox, oy); x.rotate(ang);
  x.fillStyle = 'rgba(8,18,6,.3)'; shape(wid * .16, 1.04); x.fill();                                   // the shadow it casts on the leaves behind
  const g = x.createLinearGradient(0, 0, len, 0); g.addColorStop(0, rgb(c0)); g.addColorStop(1, rgb(c1));
  x.fillStyle = g; shape(); x.fill();
  const lit = x.createLinearGradient(0, -wid, 0, wid); lit.addColorStop(0, 'rgba(255,255,220,.16)'); lit.addColorStop(.5, 'rgba(255,255,220,0)'); lit.addColorStop(1, 'rgba(0,0,0,.14)'); // lighter on one side, darker on the other
  x.fillStyle = lit; shape(); x.fill();
  x.strokeStyle = 'rgba(0,0,0,.22)'; x.lineWidth = 1; shape(); x.stroke();
  x.strokeStyle = rgb(mix(c1, [255, 255, 255], .25)); x.globalAlpha = .45; x.lineWidth = 1.2;
  x.beginPath(); x.moveTo(0, 0); x.lineTo(len * .92, 0); x.stroke();
  x.globalAlpha = .22; x.lineWidth = .9;                                                               // side veins
  for (let k = 1; k <= 4; k++) { const vx = len * (.12 + k * .18), vy = wid * (.55 - k * .08); x.beginPath(); x.moveTo(vx - len * .1, 0); x.lineTo(vx + len * .05, vy); x.moveTo(vx - len * .1, 0); x.lineTo(vx + len * .05, -vy); x.stroke(); }
  x.restore();
}
function twig(x, pts, w, col) { x.strokeStyle = col; x.lineWidth = w; x.lineCap = 'round'; x.beginPath(); x.moveTo(...pts[0]); x.quadraticCurveTo(...pts[1], ...pts[2]); x.stroke(); }
function blossom(x, ox, oy, r, col) {
  x.fillStyle = rgb(col); for (let p = 0; p < 5; p++) { const a = p / 5 * PI * 2; x.beginPath(); x.arc(ox + Math.cos(a) * r * .55, oy + Math.sin(a) * r * .55, r * .5, 0, PI * 2); x.fill(); }
  x.fillStyle = 'rgb(248,208,70)'; x.beginPath(); x.arc(ox, oy, r * .3, 0, PI * 2); x.fill();
}
const TEX_SIZE = { broad: [256, 256], flower: [256, 256], dry: [256, 256], narrow: [128, 384], fern: [128, 512], feather: [256, 256] };
const TEX_SEED = { broad: 11, flower: 23, dry: 37, narrow: 41, fern: 53, feather: 67 };
const PAINT = {
  broad(x, W, H, rnd) {                                 // broad ovate leaves in pairs along a twig
    twig(x, [[W / 2, H - 3], [W / 2 + 8, H * .5], [W / 2, 12]], 5, 'rgb(86,64,40)');
    for (let k = 0, n = 12; k < n; k++) {
      const t = k / (n - 1), y = H - 16 - t * (H - 52);
      for (const sd of [-1, 1]) {
        if (rnd() < .06) continue;
        const len = 88 * (1 - .5 * t) * (.85 + rnd() * .3), ang = -PI / 2 + sd * (1.3 - .5 * t + (rnd() - .5) * .3);
        leaf(x, W / 2 + (rnd() - .5) * 5, y + (rnd() - .5) * 8, ang, len, len * .4, vary(mix([36, 86, 30], [58, 112, 40], t), rnd, 18), vary(mix([70, 120, 44], [112, 156, 58], t), rnd, 20));
      }
    }
    leaf(x, W / 2, 28, -PI / 2, 58, 23, [60, 112, 40], [116, 160, 60]);
  },
  flower(x, W, H, rnd) {                                // smaller leaves plus clusters of blossoms
    twig(x, [[W / 2, H - 3], [W / 2 - 8, H * .5], [W / 2, 12]], 4, 'rgb(86,64,40)');
    for (let k = 0, n = 11; k < n; k++) {
      const t = k / (n - 1), y = H - 16 - t * (H - 50);
      for (const sd of [-1, 1]) {
        const len = 70 * (1 - .45 * t) * (.85 + rnd() * .3), ang = -PI / 2 + sd * (1.25 - .45 * t + (rnd() - .5) * .3);
        leaf(x, W / 2, y + (rnd() - .5) * 6, ang, len, len * .38, vary(mix([34, 88, 40], [54, 108, 52], t), rnd, 16), vary(mix([66, 120, 62], [104, 150, 78], t), rnd, 18));
      }
    }
    const pal = [[240, 128, 168], [250, 236, 240], [222, 70, 120]];
    for (let c = 0; c < 7; c++) {
      const cx = (c % 2 ? 150 : 106) + (c % 2 ? 1 : -1) * rnd() * 70 * (c % 2 ? 1 : 1) + (c % 2 ? 0 : 0), cy = 30 + (c + rnd()) / 7 * H * .62, col = pal[Math.floor(rnd() * 3)];
      for (let f = 0; f < 4; f++) blossom(x, cx + (rnd() - .5) * 36, cy + (rnd() - .5) * 36, 9 + rnd() * 4, vary(col, rnd, 16));
    }
  },
  dry(x, W, H, rnd) {                                   // bare twigs with a few dry leaves
    const wood = 'rgb(106,82,52)', ends = [];
    twig(x, [[W / 2, H - 3], [W / 2 + 10, H * .5], [W / 2 - 4, 10]], 5, wood);
    for (let i = 0; i < 6; i++) {
      const t = .15 + i * .13, sy = H - 3 - t * (H - 20), sd = i % 2 ? 1 : -1, ex = W / 2 + sd * (46 + rnd() * 50), ey = sy - 30 - rnd() * 50;
      twig(x, [[W / 2 + 4 * sd, sy], [W / 2 + sd * 30, sy - 8], [ex, ey]], 3.2, wood); ends.push([ex, ey, sd]);
    }
    ends.push([W / 2 - 4, 10, 0]);
    const pal = [[186, 150, 62], [142, 126, 52], [206, 126, 48], [120, 96, 44]];
    for (const [ex, ey, sd] of ends) for (let k = 0; k < 5; k++) {
      if (rnd() < .2) continue;
      const len = 30 + rnd() * 16, c = pal[Math.floor(rnd() * 4)];
      leaf(x, ex - sd * k * 5, ey + k * 7, -PI / 2 + sd * .5 + (rnd() - .5) * 1.8, len, len * .38, vary(c, rnd, 20), vary(mix(c, [230, 210, 120], .3), rnd, 20));
    }
  },
  narrow(x, W, H, rnd) {                                // long thin willow leaves
    twig(x, [[W / 2, H - 3], [W / 2 + 6, H * .5], [W / 2, 10]], 3.5, 'rgb(96,78,48)');
    for (let k = 0, n = 24; k < n; k++) {
      const t = k / (n - 1), y = H - 14 - t * (H - 34), sd = k % 2 ? 1 : -1, len = 96 * (1 - .4 * t) * (.85 + rnd() * .3);
      leaf(x, W / 2, y, -PI / 2 + sd * (.5 + .35 * rnd()), len, len * .1, vary(mix([96, 128, 46], [118, 150, 58], t), rnd, 14), vary(mix([146, 174, 76], [176, 198, 94], t), rnd, 14));
    }
  },
  fern(x, W, H, rnd) {                                  // pinnate frond: a rib with leaflets sweeping out to both edges
    const base = [52, 118, 40], tip = [116, 170, 62], N = 46;
    for (let i = 0; i < N; i++) {
      const v = i / N, y = H - 8 - v * (H - 18), len = (W / 2 - 4) * Math.sin(PI * Math.min(1, v * 1.12 + .06)) ** .55, col = mix(base, tip, v * v);
      for (const sd of [-1, 1]) {
        if (rnd() < .05) continue;
        const rise = 14 + rnd() * 10, P = t => [W / 2 + sd * len * (t * (1 - t) + t * t), y - 12 * t * (1 - t) - rise * t * t], c = vary(col, rnd, 22);
        x.strokeStyle = rgb(c); x.lineCap = 'round'; x.lineWidth = 7 * (1 - v * .35); x.beginPath(); x.moveTo(...P(0)); x.quadraticCurveTo(W / 2 + sd * len * .5, y - 6, ...P(1)); x.stroke();
      }
    }
    x.strokeStyle = 'rgb(58,96,34)'; x.lineWidth = 4; x.beginPath(); x.moveTo(W / 2, H); x.lineTo(W / 2, 6); x.stroke();
  },
  feather(x, W, H, rnd) {                               // juniper / cypress: feathery sprays of small overlapping scale leaflets
    x.strokeStyle = 'rgb(54,70,44)'; x.lineWidth = 4; x.beginPath(); x.moveTo(W / 2, H - 2); x.lineTo(W / 2, 10); x.stroke();
    const dark = [28, 62, 34], light = [96, 134, 66], ell = (px, py, rx, ry, rot, c) => { x.fillStyle = rgb(c); x.beginPath(); x.ellipse(px, py, rx, ry, rot, 0, PI * 2); x.fill(); };
    for (let k = 0; k < 10; k++) {
      const t = k / 9, y = H - 18 - t * (H - 60);
      for (const sd of [-1, 1]) {
        const ang = -PI / 2 + sd * (.85 - .2 * t) + (rnd() - .5) * .15, len = 90 * (1 - .55 * t);
        for (let m = 0; m < 8; m++) {
          const u = m / 7, px = W / 2 + Math.cos(ang) * len * u, py = y + Math.sin(ang) * len * u, c = vary(mix(dark, light, u * .8 + t * .2), rnd, 14), r = 15 * (1 - .45 * u);
          ell(px + 1.5, py + 2, r, r * .46, ang + .7, mix(c, [0, 0, 0], .5)); ell(px, py, r, r * .46, ang + .7, c); ell(px, py, r, r * .46, ang - .7, vary(c, rnd, 10)); ell(px, py, r * .9, r * .4, ang, vary(mix(c, light, .2), rnd, 10)); ell(px - r * .1, py - r * .12, r * .45, r * .14, ang, mix(c, [255, 255, 200], .22));
        }
      }
    }
  },
};
const leafTexture = kind => cached('bushTex:' + kind, () => {
  const [W, H] = TEX_SIZE[kind], c = document.createElement('canvas'); c.width = W; c.height = H;
  PAINT[kind](c.getContext('2d'), W, H, seededRandom(TEX_SEED[kind]));
  const t = new THREE.CanvasTexture(c); t.anisotropy = 8; t.colorSpace = THREE.SRGBColorSpace; return t;
});

// ---------------------------------------------------------------- materials, with wind sway
// uv-free sway: the strength rides in a per-vertex attribute (aSway: 0 at the stem, 1 at the free tips and the top). The phase comes from the bush's
// transform (or its instance's), so bushes and leaves sway out of step.
function addSway(material) {
  material.onBeforeCompile = sh => {
    sh.uniforms.uWind = bushWind;
    sh.vertexShader = 'uniform float uWind;\nattribute float aSway;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
	float swPh = dot( modelMatrix[3].xz, vec2( 0.37, 0.21 ) ) + dot( position.xz, vec2( 1.7, 2.3 ) );
	#ifdef USE_INSTANCING
	swPh += dot( instanceMatrix[3].xz, vec2( 0.37, 0.21 ) );
	#endif
	transformed.x += ( sin( uWind * 1.9 + swPh ) * 0.13 + sin( uWind * 4.3 + swPh * 2.1 ) * 0.035 ) * aSway;
	transformed.z += ( sin( uWind * 1.5 + swPh * 1.3 ) * 0.11 + sin( uWind * 3.7 + swPh * 1.7 ) * 0.03 ) * aSway;
	transformed.y += sin( uWind * 6.0 + swPh * 3.0 ) * 0.022 * aSway;`);
  };
  return material;
}
const foliageMat = kind => cached('bushMat:' + kind, () => {
  const map = leafTexture(kind);
  const m = new THREE.MeshLambertMaterial({ map, vertexColors: true, alphaTest: .5, alphaToCoverage: true, side: THREE.DoubleSide }); // (lit per vertex, not per pixel: the shading is baked into the vertex colours anyway, and a thick wood of overlapping cards costs a great deal more with the full PBR shader once explosions and fires switch lights on)
  m.userData.depth = addSway(new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map, alphaTest: .5 }));
  addSway(m);
  const sway = m.onBeforeCompile;
  m.onBeforeCompile = sh => { // a double-sided Lambert material lights the back of a card with the opposite normal (vLightBack), so which face the camera saw decided whether a frond was bright or black: one lighting for both sides instead
    sway(sh); sh.fragmentShader = sh.fragmentShader.replace(/gl_FrontFacing/g, 'true');
  };
  m.customProgramCacheKey = () => 'bushLambertOneLight';
  return m;
});
const woodMat = () => cached('bushWood', () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0, envMapIntensity: .15 }));

// ---------------------------------------------------------------- geometry builders
const CFG = {
  leafy:     { mode: 'dome',  tex: 'broad',   R: [1.6, 2.0], H: [1.7, 2.2], stems: 6, perStem: 15, top: 40, twigs: 8,  reach: [.45, .75], rise: [.55, .85], leaf: [1.0, .95], segs: 1, cols: 2, droop: .2,  blend: .65 },
  flowering: { mode: 'dome',  tex: 'flower',  R: [1.3, 1.7], H: [1.3, 1.7], stems: 5, perStem: 14, top: 34, twigs: 6,  reach: [.45, .75], rise: [.55, .85], leaf: [.9, .85],  segs: 1, cols: 2, droop: .16, blend: .65 },
  scrub:     { mode: 'dome',  tex: 'dry',     R: [1.6, 2.1], H: [1.1, 1.5], stems: 9, perStem: 8,  top: 14, twigs: 14, reach: [.55, .9],  rise: [.35, .65], leaf: [.95, .85], segs: 1, cols: 2, droop: .1,  blend: .45, ao: .55 },
  willow:    { mode: 'arch',  tex: 'narrow',  R: [1.6, 2.0], H: [2.6, 3.2], stems: 8, perStem: 9,  top: 26, leaf: [1.5, .56], segs: 2, cols: 2, droop: .28, blend: .5 },
  fern:      { mode: 'fan',   tex: 'fern',    R: [1.7, 2.1], H: [1.0, 1.3], fronds: 32, segs: 2, cols: 3, droop: .14, blend: .2, ao: .72, lift: .5 },
  juniper:   { mode: 'cone',  tex: 'feather', R: [1.1, 1.4], H: [2.4, 3.0], stems: 4, sprays: 150, leaf: [.85, .7], segs: 1, cols: 2, droop: .2, blend: .6, ao: .8, lift: .3 },
};

function newCtx(cfg, rand) {
  return { cfg, rand, wood: [], tris: 0, pos: [], uv: [], col: [], sw: [], idx: [], centre: V(), radii: V(1, 1, 1), height: 1,
    tint: [.94 + rand() * .12, .96 + rand() * .08, .92 + rand() * .14] };   // a slight per-bush colour shift (the material is shared)
}
const jit = (c, s) => V(c.rand() - .5, c.rand() - .5, c.rand() - .5).multiplyScalar(s);

// A tapered branch along a quadratic curve; radius r0 at the start, r1 at the end. Returns the curve so sprays can be hung along it.
function stem(c, p0, p1, p2, r0, r1, segs = 2, rad = 3) {
  const curve = new THREE.QuadraticBezierCurve3(p0, p1, p2), g = new THREE.TubeGeometry(curve, segs, 1, rad, false), P = g.attributes.position, v = V(), cen = V();
  const col = new Float32Array(P.count * 3);
  for (let i = 0; i <= segs; i++) {
    const t = i / segs, k = lerp(r0, r1, t); curve.getPointAt(t, cen);
    for (let j = 0; j <= rad; j++) {
      const n = i * (rad + 1) + j; v.fromBufferAttribute(P, n).sub(cen).multiplyScalar(k).add(cen); P.setXYZ(n, v.x, v.y, v.z);
      col[n * 3] = .1 + .09 * t; col[n * 3 + 1] = .075 + .07 * t; col[n * 3 + 2] = .05 + .04 * t;      // dark bark at the base, lighter toward the twigs
    }
  }
  g.computeVertexNormals(); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  c.wood.push(g); c.tris += segs * rad * 2; return curve;
}

// A leaf spray: a card (or a small fan of cards' worth of rows) growing from `p` along `dir`, bending down under gravity. Its vertex colours carry the baked
// shading: dark deep inside the bush, bright on the outside and top, a little darker at the stem end.
const _x0 = V(), _y0 = V(), _X = V(), _Y = V(), _Z = V(), _w = V();
function spray(c, p, dir, len, wid, o = {}) {
  const segs = o.segs ?? c.cfg.segs, cols = o.cols ?? c.cfg.cols, droop = o.droop ?? c.cfg.droop, roll = o.roll ?? c.rand() * PI * 2, bright = o.bright ?? .9 + c.rand() * .2;
  const t = segs * (cols - 1) * 2; if (c.tris + t > BUDGET) return false;
  _Z.copy(dir).normalize();
  if (Math.abs(_Z.y) > .96) _x0.set(1, 0, 0); else _x0.set(0, 1, 0).cross(_Z).normalize();
  _y0.crossVectors(_Z, _x0); const cr = Math.cos(roll), sr = Math.sin(roll);
  _X.copy(_x0).multiplyScalar(cr).addScaledVector(_y0, sr); _Y.copy(_y0).multiplyScalar(cr).addScaledVector(_x0, -sr);
  const base = c.pos.length / 3;
  for (let i = 0; i <= segs; i++) {
    const s = i / segs, d = s * len, w = o.taper ? wid * Math.max(.03, Math.sin(PI * Math.min(1, s * 1.1 + .05)) ** .6) : wid;   // (a hair of width at the tip: no zero-area triangles)
    for (let j = 0; j < cols; j++) {
      const x = cols === 2 ? (j ? .5 : -.5) * w : (j - 1) * .5 * w, fold = cols === 3 ? -Math.abs(x) * .4 : 0;
      _w.copy(p).addScaledVector(_Z, d).addScaledVector(_X, x).addScaledVector(_Y, fold); _w.y -= droop * d * d;
      const rr = Math.hypot((_w.x - c.centre.x) / c.radii.x, (_w.y - c.centre.y) / c.radii.y, (_w.z - c.centre.z) / c.radii.z);
      const b = lerp(c.cfg.ao ?? .4, 1, ss(.25, 1.0, rr)) * (.8 + .2 * s) * (.86 + .14 * clamp01(_w.y / c.height)) * bright;
      c.pos.push(_w.x, _w.y, _w.z); c.uv.push(cols === 2 ? j : j * .5, s);
      c.col.push(Math.min(1, b * c.tint[0]), Math.min(1, b * c.tint[1]), Math.min(1, b * c.tint[2]));
      c.sw.push(Math.pow(clamp01(_w.y / c.height), 1.3) * (.35 + .65 * s));
    }
    if (i < segs) { const a = base + i * cols, e = cols === 2 ? [a, a + 2, a + 1, a + 1, a + 2, a + 3] : [a, a + 3, a + 1, a + 1, a + 3, a + 4, a + 1, a + 4, a + 2, a + 2, a + 4, a + 5]; c.idx.push(...e); }
  }
  (c.cards ??= []).push([base, (segs + 1) * cols]); // (this card's vertices, so its shading normal can be chosen once for the whole card, see foliageGeometry)
  c.tris += t; return true;
}

// Which way a spray points around a bush: partly outward, partly sideways, up a little, never straight out (a card pointing at the viewer is foreshortened).
function sprayDir(c, pos) {
  const rad = V(pos.x - c.centre.x, 0, pos.z - c.centre.z).normalize(), tan = V(-rad.z, 0, rad.x).multiplyScalar(c.rand() < .5 ? -1 : 1);
  return rad.multiplyScalar(.4).addScaledVector(tan, .45).add(V(0, .15 + .4 * clamp01(pos.y / c.height), 0)).add(jit(c, .35));
}
const SPRAYS = .72, LEAF_UP = 1 / Math.sqrt(SPRAYS); // a quarter fewer sprays, each that much larger in both directions: the same amount of foliage for fewer triangles
const n_ = k => Math.max(1, Math.round(k * SPRAYS));
const leafSize = c => [c.cfg.leaf[0] * LEAF_UP * (.8 + c.rand() * .4), c.cfg.leaf[1] * LEAF_UP * (.8 + c.rand() * .4)];

const GEN = {
  dome(c) {                                              // rounded shrub: branches fan out, leaf sprays on them, a layer of flat cards on top for top-down views
    const { cfg, rand: r } = c, R = pick(cfg.R, r()), H = pick(cfg.H, r()), zf = .85 + r() * .3;
    c.centre.set(0, H * .5, 0); c.radii.set(R, H * .5, R * zf); c.height = H;
    for (let s = 0; s < cfg.stems; s++) {
      const a = s / cfg.stems * PI * 2 + (r() - .5) * .8, reach = R * pick(cfg.reach, r()), top = H * pick(cfg.rise, r()), ca = Math.cos(a), sa = Math.sin(a) * zf;
      const curve = stem(c, V(ca * .1, 0, sa * .1), V(ca * reach * .3, top * .75, sa * reach * .3), V(ca * reach, top, sa * reach), .08, .028);
      const nt = Math.round((s + 1) * cfg.twigs * SPRAYS / cfg.stems) - Math.round(s * cfg.twigs * SPRAYS / cfg.stems);
      for (let k = 0; k < nt; k++) {                      // side twigs, each ending in a spray
        const t = .4 + .4 * r(), p = curve.getPointAt(t), d = sprayDir(c, p), len = .5 + .4 * r(), end = p.clone().addScaledVector(d.clone().normalize(), len);
        stem(c, p, p.clone().addScaledVector(d.clone().normalize(), len * .5).add(V(0, .1, 0)), end, .03, .012, 2, 3);
        const [l, w] = leafSize(c); spray(c, end, d, l, w);
      }
      const per = n_(cfg.perStem);
      for (let k = 0; k < per; k++) {
        const t = .3 + .7 * (k + r()) / per, p = curve.getPointAt(t), [l, w] = leafSize(c);
        spray(c, p, sprayDir(c, p), l * (.8 + .3 * t), w * (.8 + .3 * t), { roll: (r() - .5) * 2.4 });
      }
    }
    for (let k = 0, nTop = n_(cfg.top); k < nTop; k++) {                   // flat cards across the top, lying nearly horizontal so the crown looks full from above
      const a = r() * PI * 2, rr = Math.sqrt(r()) * R * .6, surf = H * .5 + H * .5 * Math.sqrt(Math.max(0, 1 - (rr / R) ** 2));
      const p = V(Math.cos(a) * rr, surf * (.8 + .18 * r()), Math.sin(a) * rr * zf), ha = r() * PI * 2, [l, w] = leafSize(c);
      spray(c, p, V(Math.cos(ha), .12 + .15 * r(), Math.sin(ha)), l, w, { roll: (r() - .5) * .6, bright: 1 });
    }
  },
  arch(c) {                                              // willow: stems arch up and over, narrow leaves hang from the outer part
    const { cfg, rand: r } = c, R = pick(cfg.R, r()), H = pick(cfg.H, r());
    c.centre.set(0, H * .5, 0); c.radii.set(R, H * .5, R); c.height = H;
    for (let s = 0; s < cfg.stems; s++) {
      const a = s / cfg.stems * PI * 2 + (r() - .5) * .6, reach = R * (.8 + .2 * r()), apex = H * (.85 + .15 * r()), ca = Math.cos(a), sa = Math.sin(a);
      const curve = stem(c, V(ca * .1, 0, sa * .1), V(ca * reach * .15, apex * 1.25, sa * reach * .15), V(ca * reach, H * (.22 + .2 * r()), sa * reach), .08, .022, 3, 3);
      const per = n_(cfg.perStem);
      for (let k = 0; k < per; k++) {
        const t = .3 + .7 * (k + r()) / per, p = curve.getPointAt(t), tg = curve.getTangentAt(t), [l, w] = leafSize(c);
        spray(c, p, tg.multiplyScalar(.45).add(V(0, -.6, 0)).add(jit(c, .4)), l, w);
      }
    }
    for (let k = 0, nTop = n_(cfg.top); k < nTop; k++) {                   // a drooping canopy layer over the crown, so it looks full (and hides the stems) from above
      const a = r() * PI * 2, rr = R * (.1 + .6 * r()), y = H * (.95 - .45 * Math.pow(rr / R, 1.5)), [l, w] = leafSize(c);
      spray(c, V(Math.cos(a) * rr * .5, y, Math.sin(a) * rr * .5), V(Math.cos(a) * .9, -.15, Math.sin(a) * .9), l * .65, w * .65, { segs: 2, roll: (r() - .5) * .8, droop: .3 });
    }
  },
  fan(c) {                                               // fern: no wood, a fan of arching fronds from the base
    const { cfg, rand: r } = c, R = pick(cfg.R, r()), H = pick(cfg.H, r());
    c.centre.set(0, H * .45, 0); c.radii.set(R, H * .9, R); c.height = H;
    for (let i = 0, nf = n_(cfg.fronds); i < nf; i++) {
      const yaw = i / nf * PI * 2 * 1.618 + (r() - .5) * .4, el = .3 + r() * .8, len = R * (.75 + .45 * r()) * (i % 4 === 3 ? .6 : 1), ce = Math.cos(el);
      spray(c, V(Math.cos(yaw) * .05, .1 + r() * .15, Math.sin(yaw) * .05), V(Math.cos(yaw) * ce, Math.sin(el), Math.sin(yaw) * ce), len, (1.0 + r() * .4) * LEAF_UP,
        { taper: true, roll: 0, droop: cfg.droop + r() * .08, bright: .95 + r() * .1 });
    }
  },
  cone(c) {                                              // juniper: a short trunk and tiers of feathery sprays, pointing out and down
    const { cfg, rand: r } = c, R = pick(cfg.R, r()), H = pick(cfg.H, r());
    c.centre.set(0, H * .45, 0); c.radii.set(R, H * .5, R); c.height = H;
    stem(c, V(0, 0, 0), V(.05, H * .5, .02), V(.03, H * .96, 0), .1, .02, 3, 4);
    for (let s = 0; s < cfg.stems; s++) {
      const a = s / cfg.stems * PI * 2 + r(), y = H * (.2 + .15 * r());
      stem(c, V(0, y * .5, 0), V(Math.cos(a) * R * .2, y + .2, Math.sin(a) * R * .2), V(Math.cos(a) * R * .45, y + .5 + r() * .4, Math.sin(a) * R * .45), .045, .015, 2, 3);
    }
    for (let k = 0, nS = n_(cfg.sprays); k < nS; k++) {
      const y = H * (.06 + .88 * Math.pow(r(), .9)), a = r() * PI * 2, rr = R * Math.pow(Math.max(0, 1 - y / H), .85) + .08, ca = Math.cos(a), sa = Math.sin(a);
      const p = V(ca * rr * (.2 + .5 * r()), y, sa * rr * (.2 + .5 * r())), tight = .7 + .5 * (1 - y / H);
      spray(c, p, V(ca, -.1 + r() * .35, sa).add(jit(c, .3)), cfg.leaf[0] * LEAF_UP * tight * (.85 + r() * .3), cfg.leaf[1] * LEAF_UP * tight * (.85 + r() * .3));
    }
  },
};

function mergeWood(list) {
  const pos = [], nor = [], col = [], idx = []; let vc = 0;
  for (const g of list) {
    const P = g.attributes.position, N = g.attributes.normal, C = g.attributes.color, I = g.index.array;
    for (let i = 0; i < P.count; i++) { pos.push(P.getX(i), P.getY(i), P.getZ(i)); nor.push(N.getX(i), N.getY(i), N.getZ(i)); col.push(C.getX(i), C.getY(i), C.getZ(i)); }
    for (let i = 0; i < I.length; i++) idx.push(I[i] + vc);
    vc += P.count; g.dispose();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setIndex(idx); return g;
}

function foliageGeometry(c) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(c.pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(c.uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(c.col, 3)); g.setAttribute('aSway', new THREE.Float32BufferAttribute(c.sw, 1)); g.setIndex(c.idx);
  g.computeVertexNormals();
  // blend each normal toward a rounded volume (facing outward), so the bush shades as one soft mass instead of a pile of flat cards
  const P = g.attributes.position, N = g.attributes.normal, k = c.cfg.blend, n = V(), r = V();
  const R = Float32Array.from({ length: P.count * 3 }); // each vertex's outward direction
  for (let i = 0; i < P.count; i++) {
    r.set((P.getX(i) - c.centre.x) / c.radii.x ** 2, (P.getY(i) - c.centre.y) / c.radii.y ** 2, (P.getZ(i) - c.centre.z) / c.radii.z ** 2).normalize(); R[i * 3] = r.x; R[i * 3 + 1] = r.y; R[i * 3 + 2] = r.z;
  }
  // Which side of a card is "out": decided once per card (outward and up, over all its vertices). Decided per vertex, as before, the two ends of one frond could disagree,
  // and a frond came out lit at one end and black at the other, or black all over.
  for (const [base, count] of c.cards ?? []) {
    let sum = 0;
    for (let i = base; i < base + count; i++) sum += N.getX(i) * R[i * 3] + N.getY(i) * (R[i * 3 + 1] + 1) + N.getZ(i) * R[i * 3 + 2];
    if (sum < 0) for (let i = base; i < base + count; i++) N.setXYZ(i, -N.getX(i), -N.getY(i), -N.getZ(i));
  }
  for (let i = 0; i < P.count; i++) {
    r.set(R[i * 3], R[i * 3 + 1], R[i * 3 + 2]); n.fromBufferAttribute(N, i);
    n.multiplyScalar(1 - k).addScaledVector(r, k); n.y += c.cfg.lift ?? 0; n.normalize(); N.setXYZ(i, n.x, n.y, n.z);
  }
  return g;
}

// One bush. The same variant + seed always gives the same bush.
export function buildBush(variant = 'leafy', seed = Math.random() * 1e9) {
  const cfg = CFG[variant] ?? CFG.leafy, rand = seededRandom(seed), c = newCtx(cfg, rand);
  GEN[cfg.mode](c);
  const root = new THREE.Group(); root.name = 'bush_' + (CFG[variant] ? variant : 'leafy');
  const f = new THREE.Mesh(foliageGeometry(c), foliageMat(cfg.tex)); f.name = 'foliage'; f.castShadow = f.receiveShadow = true; f.customDepthMaterial = f.material.userData.depth; root.add(f);
  if (c.wood.length) { const w = new THREE.Mesh(mergeWood(c.wood), woodMat()); w.name = 'wood'; w.castShadow = w.receiveShadow = true; root.add(w); }
  root.userData = { variant, seed, triangles: c.tris, radius: Math.max(c.radii.x, c.radii.z), height: c.height };
  return root;
}

// Triangle count of a bush, or of a whole scatter (instances counted).
export function bushTriangles(object) {
  let n = 0;
  object.traverse(o => { if (o.isMesh && o.geometry.index) n += o.geometry.index.count / 3 * (o.isInstancedMesh ? o.count : 1); });
  return n;
}

// Fill an area with bushes in a handful of draw calls. area = { minX, maxX, minZ, maxZ }. Options:
//   seed, variants (default all), weights ({ leafy: 3, fern: 1, ... }), models (different bushes built per variant, default 3),
//   minDist (spacing between bush centres, default 1.8 m), scale [min, max], groundY (x, z) => height, mask (x, z) => 0..1 chance to keep a point
//   (use it to shape the canopy: 1 inside, 0 outside).
export function scatterBushes(area, count, { seed = 1, variants = BUSH_VARIANTS, weights = {}, models = 3, minDist = 1.8, scale = [.8, 1.35], groundY = () => 0, mask = () => 1 } = {}) {
  const rand = seededRandom(seed), pool = [];
  variants.forEach((v, vi) => { for (let m = 0; m < models; m++) pool.push({ variant: v, bush: buildBush(v, seed * 977 + vi * 131 + m * 17), w: (weights[v] ?? 1) / models, list: [] }); });
  const total = pool.reduce((s, p) => s + p.w, 0), cell = minDist, grid = new Map(), placed = [];
  for (let tries = 0; placed.length < count && tries < count * 40; tries++) {
    const x = lerp(area.minX, area.maxX, rand()), z = lerp(area.minZ, area.maxZ, rand());
    if (rand() > mask(x, z)) continue;
    const gx = Math.floor(x / cell), gz = Math.floor(z / cell);
    let ok = true; for (let i = -1; i <= 1 && ok; i++) for (let j = -1; j <= 1 && ok; j++) for (const q of grid.get((gx + i) + ',' + (gz + j)) ?? []) if (Math.hypot(q[0] - x, q[1] - z) < minDist) { ok = false; break; }
    if (!ok) continue;
    const key = gx + ',' + gz; if (!grid.has(key)) grid.set(key, []); grid.get(key).push([x, z]);
    let u = rand() * total, pick_ = pool[0]; for (const p of pool) { u -= p.w; if (u <= 0) { pick_ = p; break; } }
    const s = lerp(scale[0], scale[1], rand()), m = new THREE.Matrix4().compose(V(x, groundY(x, z), z), new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), rand() * PI * 2), V(s * (.92 + .16 * rand()), s * (.9 + .2 * rand()), s));
    pick_.list.push(m); placed.push([x, z]);
  }
  const group = new THREE.Group(); group.name = 'bushes';
  for (const p of pool) {
    if (!p.list.length) continue;
    p.bush.children.forEach(src => {
      const im = new THREE.InstancedMesh(src.geometry, src.material, p.list.length); im.name = src.name + '_' + p.variant;
      p.list.forEach((m, i) => im.setMatrixAt(i, m)); im.castShadow = im.receiveShadow = true; if (src.customDepthMaterial) im.customDepthMaterial = src.customDepthMaterial;
      im.instanceMatrix.needsUpdate = true; im.computeBoundingSphere?.(); group.add(im); // (three r128's InstancedMesh has no computeBoundingSphere: see scrub.js for per-block bounds)
    });
  }
  group.userData = { placed: placed.length, positions: placed };
  return group;
}
