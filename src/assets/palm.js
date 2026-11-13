// Palm tree (Stage 1 and the palms in every other stage): bark, fronds, the wind sway and buildPalm. Self-contained; stage-props.js re-exports it.
import * as THREE from 'three';
import { PI, add, cached, seededRandom } from './common.js';

// ---- palm tree ----

// Pinnate leaf: a central rib with broad, overlapping leaflets sweeping out to both edges, on a
// transparent background. Leaflets are filled tapered shapes so the frond reads full, not fern-like.
function frondTexture(dead) {
  const c = document.createElement('canvas'); c.width = 128; c.height = 512; const x = c.getContext('2d');
  const base = dead === 'dry' ? [196, 178, 46] : dead ? [120, 84, 40] : [42, 95, 32], tip = dead === 'dry' ? [246, 232, 96] : dead ? [150, 110, 60] : [90, 136, 42]; // 'dry': a yellowing frond, between the green and the brown
  const N = 54;
  for (let i = 0; i < N; i++) {
    const v = i / N, y = 504 - v * 494, len = 62 * Math.sin(PI * Math.min(1, v * 1.12 + .06)) ** .55;
    const k = v * v, col = base.map((b, j) => Math.round(b + (tip[j] - b) * k + (Math.random() - .5) * 24));
    for (const sd of [-1, 1]) {
      if (Math.random() < .05) continue; // the odd gap breaks up the outline
      const rise = 18 + Math.random() * 10, maxW = 6 + Math.random() * 2;
      // leaflet centreline: quadratic curve from the rib out to the tip
      const P = t => [64 + sd * len * (t * (1 - t) + t * t), y - 6 * 2 * t * (1 - t) - rise * t * t];
      const left = [], right = [];
      for (let j = 0; j <= 8; j++) {
        const t = j / 8, [px, py] = P(t), [qx, qy] = P(Math.min(1, t + .01));
        const dx = qx - px, dy = qy - py, l = Math.hypot(dx, dy) || 1, nx = -dy / l, ny = dx / l;
        const w = maxW / 2 * Math.sin(PI * (t * .88 + .12));
        left.push([px + nx * w, py + ny * w]); right.push([px - nx * w, py - ny * w]);
      }
      x.fillStyle = `rgb(${col})`; x.beginPath(); x.moveTo(...left[0]);
      left.forEach(q => x.lineTo(...q)); right.reverse().forEach(q => x.lineTo(...q)); x.closePath(); x.fill();
      x.strokeStyle = `rgba(${col.map(c => Math.min(255, c + 45))},.5)`; x.lineWidth = 1; // leaflet midrib
      x.beginPath(); x.moveTo(...P(0)); x.quadraticCurveTo(64 + sd * len * .5, y - 6, ...P(1)); x.stroke();
    }
  }
  x.strokeStyle = dead === 'dry' ? '#a89428' : dead ? '#5a3c1c' : '#4a6a22'; x.lineWidth = 4;
  x.beginPath(); x.moveTo(64, 512); x.lineTo(64, 6); x.stroke();
  const t = new THREE.CanvasTexture(c); t.anisotropy = 8;
  return t;
}

// Leaf materials in a few shades; each gets a cut-out depth material so shadows show the leaflets.
// Breeze: shared clock for every palm frond. Advance it each frame (seconds) to animate them.
export const palmWind = { value: 0 };

// Bends a frond material in the vertex shader. uv.y runs 0 at the base to 1 at the tip, so the
// tip moves most. The phase comes from the palm's transform and the vertex position, so palms and
// fronds sway out of step (this still works after a palm's fronds are merged into one mesh).
function addSway(material) {
  material.onBeforeCompile = sh => {
    sh.uniforms.uWind = palmWind;
    sh.vertexShader = 'uniform float uWind;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
	float swayK = uv.y * uv.y;
	float swayPh = dot( modelMatrix[3].xz, vec2( 0.37, 0.21 ) ) + modelMatrix[2].x * 2.0 + dot( position.xz, vec2( 0.9, 1.3 ) );
	transformed.y += sin( uWind * 1.8 + swayPh ) * 0.32 * swayK;
	transformed.x += sin( uWind * 2.4 + swayPh * 1.3 ) * 0.2 * swayK;
	transformed.y += sin( uWind * 7.5 + swayPh * 3.0 + uv.y * 6.0 ) * 0.045 * swayK;`);
  };
  return material;
}

const frondMats = () => cached('frondMats', () => {
  const live = frondTexture(false), dead = frondTexture(true), dry = DRY_SHARE > 0 ? frondTexture('dry') : null;
  const make = (map, color) => {
    const m = new THREE.MeshStandardMaterial({ map, color, alphaTest: .5, side: THREE.DoubleSide, roughness: .7, envMapIntensity: .35 });
    m.userData.depth = addSway(new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map, alphaTest: .5 }));
    return addSway(m);
  };
  return { live: [make(live, 0xffffff), make(live, 0xd8e8c0), make(live, 0xb8d0a0)], dry: dry && make(dry, 0xffffff), dead: make(dead, 0xffffff) };
});

// Palm bark: rough, matte rings of overlapping leaf-scar "shingles". Sizes, spacing and colour
// vary ring to ring so it reads as wood, not a machined coil. Canvas x runs along the trunk
// (one tile = 2 m), y around it (one tile = full circumference); drawn wrapped so it tiles.
// Returns { map, bump }.
const barkTextures = () => cached('bark', () => {
  const W = 256, H = 128, rand = seededRandom(4242);
  // ring positions along the tile, irregularly spaced (~20-32 px apart), plus per-ring tone
  const rings = [];
  for (let gx = 0; gx < W - 14;) { rings.push({ x: gx, tone: rand(), n: 5 + Math.floor(rand() * 3) }); gx += 20 + rand() * 12; }
  const scars = rings.flatMap((r, i) => Array.from({ length: r.n }, (_, k) => ({
    x: r.x + (rand() - .5) * 4, y: (k + (i % 2) * .5 + (rand() - .5) * .3) / r.n * H,
    w: 9 + rand() * 6, h: H / r.n * (.45 + rand() * .2), tone: r.tone,
  })));
  const fibres = Array.from({ length: 120 }, () => ({ x: rand() * W, y: rand() * H, l: 6 + rand() * 20, d: rand() > .5 }));
  const specks = Array.from({ length: 2500 }, () => ({ x: rand() * W, y: rand() * H, l: rand() > .5 }));
  const draw = bump => {
    const c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d');
    x.fillStyle = bump ? '#808080' : '#6e5a44'; x.fillRect(0, 0, W, H);
    const wrap = (fn, px, py) => { for (const ox of [-W, 0, W]) for (const oy of [-H, 0, H]) fn(px + ox, py + oy); };
    for (const r of rings) { // broad tone band per ring: some greyer, some browner
      const g = Math.round(r.tone * 40);
      x.fillStyle = bump ? 'rgba(128,128,128,0)' : `rgba(${90 + g},${78 + g * .8},${62 + g * .5},.45)`;
      x.fillRect(r.x, 0, 26, H);
    }
    for (const sc of scars) wrap((px, py) => { // shingle: soft shadowed underside, muted top edge
      x.fillStyle = bump ? 'rgba(30,30,30,.7)' : 'rgba(42,32,22,.55)';
      x.beginPath(); x.ellipse(px + sc.w * .55, py, sc.w * .55, sc.h, 0, -PI / 2, PI / 2); x.fill();
      x.fillStyle = bump ? 'rgba(200,200,200,.6)' : `rgba(${130 + sc.tone * 30},${112 + sc.tone * 26},${88 + sc.tone * 20},.5)`;
      x.beginPath(); x.ellipse(px + sc.w * .3, py, sc.w * .35, sc.h * .85, 0, -PI / 2, PI / 2); x.fill();
    }, sc.x, sc.y);
    for (const f of fibres) wrap((px, py) => {
      x.strokeStyle = f.d ? (bump ? 'rgba(0,0,0,.25)' : 'rgba(40,30,20,.35)') : (bump ? 'rgba(255,255,255,.2)' : 'rgba(150,130,100,.25)');
      x.lineWidth = 1; x.beginPath(); x.moveTo(px, py); x.lineTo(px + f.l, py + (f.d ? 1 : -1)); x.stroke();
    }, f.x, f.y);
    for (const k of specks) {
      x.fillStyle = k.l ? (bump ? 'rgba(255,255,255,.15)' : 'rgba(160,140,110,.2)') : (bump ? 'rgba(0,0,0,.15)' : 'rgba(30,22,14,.2)');
      x.fillRect(k.x, k.y, 1.5, 1.5);
    }
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
    return t;
  };
  return { map: draw(false), bump: draw(true) };
});

// An arching frond strip pointing along +Z: folded into a shallow V so it reads as 3D from above.
function frondGeometry(len, width, elev, droop, N = 10) { // N: segments along it (fewer: a lighter frond)
  const pos = [], uv = [], idx = [];
  for (let i = 0; i <= N; i++) {
    const s = i / N, d = s * len, along = d * Math.cos(elev), up = d * Math.sin(elev) - droop * d * d;
    const w = width * Math.sin(PI * Math.min(1, s * 1.1 + .05)) ** .6;
    pos.push(-w / 2, up - w * .25, along, 0, up, along, w / 2, up - w * .25, along);
    uv.push(0, s, .5, s, 1, s);
    if (i < N) { const a = i * 3; idx.push(a, a + 3, a + 1, a + 1, a + 3, a + 4, a + 1, a + 4, a + 2, a + 2, a + 4, a + 5); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}

const DRY_SHARE = 0; // the share of a palm's living fronds that are yellowing (none: only the old brown hanging ones; raise it to bring yellow fronds back)
// One trunk + crown, growing from `base`. lean/dir/bend shape the curve (see buildPalm).
function palmTrunk(root, rand, base, height, lean, dir, bend, forceDead, lite) { // lite: fewer segments in the trunk and fronds (for palms drawn by the hundred) // forceDead: how many old brown fronds to hang (else drawn at random)
  const fm = frondMats();
  const lx = Math.cos(dir) * lean, lz = Math.sin(dir) * lean;
  const curve = new THREE.QuadraticBezierCurve3(base.clone(),
    base.clone().add(new THREE.Vector3(lx * bend, height * .6, lz * bend)), base.clone().add(new THREE.Vector3(lx, height, lz)));
  const SEG = lite ? 8 : 14, RAD = lite ? 9 : 12, tube = new THREE.TubeGeometry(curve, SEG, .2, RAD, false), p = tube.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i <= SEG; i++) { // taper from the base to the crown
    const centre = curve.getPointAt(i / SEG), k = 1.25 - .55 * (i / SEG);
    for (let j = 0; j <= RAD; j++) {
      const n = i * (RAD + 1) + j; v.fromBufferAttribute(p, n).sub(centre).multiplyScalar(k).add(centre); p.setXYZ(n, v.x, v.y, v.z);
    }
  }
  tube.computeVertexNormals();
  const bt = barkTextures(), tile = t => { const c = t.clone(); c.needsUpdate = true; c.repeat.set(height / 2, 1); c.offset.y = rand(); return c; };
  add(root, tube, new THREE.MeshStandardMaterial({ map: tile(bt.map), bumpMap: tile(bt.bump), bumpScale: .6, roughness: 1, metalness: 0, envMapIntensity: .15 }));

  // crown of fronds, tilted a little with the trunk
  const crown = new THREE.Group(); crown.position.copy(curve.getPointAt(1)); root.add(crown);
  crown.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), curve.getTangentAt(1).lerp(new THREE.Vector3(0, 1, 0), .6).normalize());
  const count = 8 + Math.floor(rand() * 5), shade = fm.live[Math.floor(rand() * fm.live.length)];
  for (let i = 0; i < count; i++) {
    const yellowing = Math.abs(Math.sin(i * 12.9898 + height * 78.233) * 43758.5453) % 1 < DRY_SHARE, frondMat = yellowing ? fm.dry : shade; // (hashed from the frond's number: no draw from rand, so palm shapes stay the same)
    const f = add(crown, frondGeometry(2.6 + rand() * 1.4, 1.0 + rand() * .4, .25 + rand() * .55, .1 + rand() * .07, lite ? 6 : 10), frondMat);
    f.customDepthMaterial = frondMat.userData.depth;
    f.rotation.y = i / count * PI * 2 + (rand() - .5) * .5;
  }
  const dr = rand(), dead = forceDead ?? (dr < .15 ? 1 : dr < .5 ? 2 : dr < .8 ? 3 : 4); // most palms have two or three old brown fronds hanging
  for (let i = 0; i < dead; i++) { // old fronds hanging down
    const f = add(crown, frondGeometry(2 + rand(), .8, -.9 - rand() * .4, .05, lite ? 5 : 10), fm.dead);
    f.customDepthMaterial = fm.dead.userData.depth;
    f.rotation.y = rand() * PI * 2; f.position.y = -.2;
  }
  for (let i = 0, n = 2 + Math.floor(rand() * 4); i < n; i++) { rand(); rand(); } // (the coconuts, hidden under the fronds, are gone; their random draws stay so every palm keeps its shape)
}

// Palm tree, 5-8 m tall. Every palm is different; pass a seed to get the same palm every run.
// About a third grow as a clump: 2-3 trunks from one root, splaying outward at steeper angles.
export function buildPalm(seed = Math.random() * 1e9, forceDead, lite = false) { // forceDead: give every trunk this many old brown fronds
  const rand = seededRandom(seed);
  const root = new THREE.Group(); root.name = 'palm';
  if (rand() < .35) {
    const n = 2 + (rand() < .3 ? 1 : 0), dir0 = rand() * PI * 2;
    for (let i = 0; i < n; i++) {
      const dir = dir0 + i / n * PI * 2 + (rand() - .5) * .8;
      const base = new THREE.Vector3(Math.cos(dir) * .25, 0, Math.sin(dir) * .25);
      // splay out from the shared root: bend > .5 makes the trunk lean early, then rise
      palmTrunk(root, rand, base, 4.5 + rand() * 3, 1.8 + rand() * 1.6, dir, .55 + rand() * .25, forceDead, lite);
    }
  } else {
    // solo palm: rises fairly upright, then bends; rand() squared keeps most leans gentle
    palmTrunk(root, rand, new THREE.Vector3(), 5 + rand() * 3, .3 + rand() * rand() * 1.4, rand() * PI * 2, .1 + rand() * .25, forceDead, lite);
  }
  return root;
}
