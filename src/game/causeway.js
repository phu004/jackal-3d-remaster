// Stage 2's causeway between the pools: a road of big rectangular limestone bricks in running bond
// (about 8 across, each row offset by half a brick, a few longer or half bricks per row), 1 px seams
// a shade darker than the stone, each brick its own tone with softly rounded edges.
// One texture covers the whole road (no tiling), and everything on it is placed at seeded random
// spots in world space, so no stretch of road matches another: bricks missing or broken through to
// dark soil, chipped corners, long hairline cracks, grime, lichen, water stains, weeds, bricks worn
// round and settled at slight tilts. Worn darker and smoother down the middle where vehicles ran.
// At each end the road gives out gradually: over the last rows bricks thin out (the ground shows
// through the gaps) and the ground's own sand drifts over the rest in speckles, thickening toward
// the end, so there is no hard edge. Low contrast, so bullets and pickups still read on it.
import * as THREE from 'three';

// ---- bricks ----
export const BRICK_W = 1.4;       // metres, across the road (fitted so a whole number of bricks span it)
export const BRICK_H = .7;        // metres, along it
export const BRICK_VARIANCE = .25; // share of bricks in a row laid long (1.5x) or as halves
const PX_PER_M = 80;              // texture resolution (rounded down to powers of two)
const ROUND = [.08, .26];         // metres of soft rounding at a brick's edge (worn more on some)
const TILT = 40;                  // bump: how far a settled brick tilts (bump levels across it)
const PITS = [0, 9];              // small weathering pits per brick
const CHIP = .14;                 // share of bricks with a chipped corner
// ---- damage and age, per 100 m² of road (placed at random over the whole road) ----
const BROKEN = 3;                 // bricks missing or broken through, showing soil
const LONG_CRACKS = 1;            // hairline cracks running across several bricks
const LICHEN = 12;                // lichen blotches (pale grey-green and ochre)
const STAINS = 7;                 // dark water stains
const WEEDS = 10;                 // weed tufts in the seams (plus one in each broken brick)
const AGED = .14;                 // share of bricks darker and greyer with age
// ---- look ----
const STONE = [182, 170, 152];    // warm grey-cream limestone (the ruins' family, a touch warmer)
const ALBEDO = .52;               // a little darker than the pool borders
const TONE_VAR = .06;             // per-brick brightness (±)
const SEAM_TONE = .86;            // the 1 px seams: only slightly darker than the brick
const SOIL = [70, 58, 44];        // dark soil where a brick is missing or broken
const GRIME = .14;                // low-frequency grime (darkening)
const GRIME_SCALE = [9, 3];       // metres: grime's two noise scales
const SEAM_MOSS = [74, 76, 54];   // where grime gathers, the seams fill with dirt and moss
const LANE_DARK = .08;            // the middle, where vehicles ran: this much darker
const MOTTLE = [.08, 7, 2.6];     // broad mottling in the shader: brightness amount, two scales in metres
// ---- ends ----
const FADE_ROWS = 3;              // rows over which the bricks thin out toward each end
const FADE_GONE = .85;            // chance the very last bricks are gone (falling to 0 FADE_ROWS in)
const SAND_ROWS = 3.5;            // rows the drifted sand reaches in from each end
const SAND_GRAIN = 2;             // sand mask pixels per texture pixel (lower res: coarser speckle)
const DETAIL_PERIOD = 6;          // metres per tile of the ground's sand detail (as the ground draws it)

function rng(seed) {
  let s = seed >>> 0;
  return () => { s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
// smooth seeded value noise over the plane, 0..1 (non-repeating)
function noise2(seed) {
  const h = (i, j) => { let n = Math.imul(i, 374761393) + Math.imul(j, 668265263) + Math.imul(seed, 1442695041) | 0; n = Math.imul(n ^ n >>> 13, 1274126177); return ((n ^ n >>> 16) >>> 0) / 4294967296; };
  return (x, y) => { const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    return (h(i, j) * (1 - sx) + h(i + 1, j) * sx) * (1 - sy) + (h(i, j + 1) * (1 - sx) + h(i + 1, j + 1) * sx) * sy; };
}
const pow2 = m => 2 ** Math.max(6, Math.min(12, Math.floor(Math.log2(m * PX_PER_M * 1.25))));

// The road's textures over its bounds b = {x0, z0, w, l} (canvas x = world x, canvas y = world z).
// endDist(X, Z): metres to the nearest road end (Infinity away from them).
function textures(b, endDist) {
  const rand = rng(64), TW = pow2(b.w), TL = pow2(b.l), sx = TW / b.w, sy = TL / b.l;
  const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; };
  const [c, x] = mk(TW, TL), [bc, bx] = mk(TW, TL), AW = TW / SAND_GRAIN, AL = TL / SAND_GRAIN, [ac, ax] = mk(AW, AL);
  const img = x.createImageData(TW, TL), d = img.data, bimg = bx.createImageData(TW, TL), bd = bimg.data, aimg = ax.createImageData(AW, AL), ad = aimg.data;
  const g1 = noise2(11), g2 = noise2(12), grime = (X, Z) => g1(X / GRIME_SCALE[0], Z / GRIME_SCALE[0]) * .65 + g2(X / GRIME_SCALE[1], Z / GRIME_SCALE[1]) * .35;
  const W = X => b.x0 + (X + .5) / sx, Zw = Y => b.z0 + (Y + .5) / sy; // pixel centre -> world
  // seams first: the stone a shade darker (dirt and moss where grime gathers)
  for (let Y = 0; Y < TL; Y++) for (let X = 0; X < TW; X++) {
    const i = (Y * TW + X) * 4, gr = grime(W(X), Zw(Y)), f = SEAM_TONE * (1 - GRIME * gr), m = Math.max(0, gr - .5) * 1.6;
    for (let ch = 0; ch < 3; ch++) d[i + ch] = STONE[ch] * f * (1 - m) + SEAM_MOSS[ch] * m;
    d[i + 3] = 255; bd[i] = bd[i + 1] = bd[i + 2] = 150; bd[i + 3] = 255;
  }
  for (let i = 0; i < AW * AL; i++) ad[i * 4 + 3] = 255;
  // lay the bricks (in metres from the road's corner)
  const perRow = Math.max(1, Math.round(b.w / BRICK_W)), bw = b.w / perRow, rows = Math.ceil(b.l / BRICK_H), bricks = [];
  for (let r = 0; r < rows; r++) {
    const lens = r % 2 ? [1] : []; let left = perRow * 2 - lens.length; // running bond: odd rows start with a half
    while (left > 0) { const roll = rand(); let l = roll < BRICK_VARIANCE / 2 ? 3 : roll < BRICK_VARIANCE ? 1 : 2; l = Math.min(l, left); lens.push(l); left -= l; }
    let xh = 0;
    for (const l of lens) { bricks.push({ x: xh * bw / 2, z: r * BRICK_H, w: l * bw / 2, h: BRICK_H }); xh += l; }
  }
  const area = b.w * b.l / 100, FADE = FADE_ROWS * BRICK_H, SAND = SAND_ROWS * BRICK_H;
  const endD = br => endDist(b.x0 + br.x + br.w / 2, b.z0 + br.z + br.h / 2);
  const inner = bricks.map((br, i) => i).filter(i => endD(bricks[i]) > FADE + BRICK_H), broken = new Set(), weedAt = [];
  while (broken.size < Math.min(inner.length, Math.round(BROKEN * area))) broken.add(inner[Math.floor(rand() * inner.length)]);
  bricks.forEach((br, bi) => {
    const de = endD(br), fade = Math.max(0, 1 - de / FADE);
    const k = (1 + (rand() - .5) * 2 * TONE_VAR) * (rand() < AGED ? .88 : 1), chip = rand() < CHIP + fade * .4 ? Math.floor(rand() * 4) : -1, chipR = .08 + rand() * .16;
    const gone = rand() < FADE_GONE * fade ** 1.4; // thinning out toward the road's end: the ground shows through
    const lost = broken.has(bi) && rand() < .5, cracked = broken.has(bi) && !lost; // missing altogether, or broken in two
    if (broken.has(bi)) weedAt.push([br.x + br.w * (.3 + rand() * .4), br.z + br.h * (.3 + rand() * .4), true]);
    const crackZ = br.h * (.3 + rand() * .4), crackA = (rand() - .5) * .5, wob = Array.from({ length: 3 }, () => rand() * 6);
    const rnd = ROUND[0] + rand() * rand() * (ROUND[1] - ROUND[0]), tx = (rand() - .5) * TILT, ty = (rand() - .5) * TILT; // worn round; settled at a tilt
    const pits = Array.from({ length: Math.floor(PITS[0] + rand() * rand() * (PITS[1] - PITS[0])) }, () => [rand() * br.w, rand() * br.h, .012 + rand() * .025]);
    const corner = [[0, 0], [br.w, 0], [br.w, br.h], [0, br.h]][chip];
    const X0 = Math.round(br.x * sx), X1 = Math.round((br.x + br.w) * sx), Y0 = Math.round(br.z * sy), Y1 = Math.round((br.z + br.h) * sy);
    if (gone) { // a gap: mark it (seams included) to be cut out of the road
      for (let Y = Y0; Y <= Math.min(Y1, TL - 1); Y++) for (let X = X0; X <= Math.min(X1, TW - 1); X++) ad[(Math.floor(Y / SAND_GRAIN) * AW + Math.floor(X / SAND_GRAIN)) * 4] = 255;
      return;
    }
    for (let Y = Y0 + 1; Y < Y1 && Y < TL; Y++) for (let X = X0 + 1; X < X1 && X < TW; X++) { // (the first row and column stay seam)
      const i = (Y * TW + X) * 4, px = (X + .5) / sx - br.x, pz = (Y + .5) / sy - br.z;
      const edge = Math.min(px, pz, br.w - px, br.h - pz);
      const irregular = Math.sin(px * 9 + wob[0]) * .04 + Math.sin(pz * 13 + wob[1]) * .04;
      const isSoil = (lost && edge > .03 + irregular)                                                                            // a hole with a broken, irregular outline
        || (cracked && Math.abs(pz - crackZ - (px - br.w / 2) * crackA - Math.sin(px * 7 + wob[2]) * .03) < .014)               // broken in two: soil in the break
        || (chip >= 0 && Math.abs(px - corner[0]) + Math.abs(pz - corner[1]) < chipR + Math.sin((px + pz) * 60) * .012);         // a chipped corner
      if (isSoil) { d[i] = SOIL[0]; d[i + 1] = SOIL[1]; d[i + 2] = SOIL[2]; bd[i] = bd[i + 1] = bd[i + 2] = 60; continue; }
      const round = Math.min(1, edge / rnd), sh = Math.sqrt(round * (2 - round)), Xw = b.x0 + br.x + px, Zw2 = b.z0 + br.z + pz;
      const pit = pits.some(([qx, qz, r]) => (px - qx) ** 2 + (pz - qz) ** 2 < r * r);
      const f = k * (.93 + .07 * sh) * (1 - GRIME * grime(Xw, Zw2)) * (1 + (rand() - .5) * .04) * (pit ? .72 : 1);
      d[i] = STONE[0] * f; d[i + 1] = STONE[1] * f; d[i + 2] = STONE[2] * f;
      bd[i] = bd[i + 1] = bd[i + 2] = Math.max(0, Math.min(255, 150 + 75 * sh + (px / br.w - .5) * tx * round + (pz / br.h - .5) * ty * round - (pit ? 50 : 0)));
    }
  });
  // drifted sand at the ends: speckles, thick at the end and thinning inward, in clumps
  const n1 = noise2(21), n2 = noise2(22);
  for (let Y = 0; Y < AL; Y++) for (let X = 0; X < AW; X++) {
    const Xw = b.x0 + (X + .5) * SAND_GRAIN / sx, Zw2 = b.z0 + (Y + .5) * SAND_GRAIN / sy, de = endDist(Xw, Zw2);
    if (de >= SAND * 1.4) continue;
    const s = Math.max(0, 1 - de / SAND), clump = n1(Xw / .9, Zw2 / .9) * .7 + n2(Xw / .25, Zw2 / .25) * .3;
    const cov = s ** 1.3 * 1.2 + (clump - .5) * .9 - .08;
    if (cov > rand()) ad[(Y * AW + X) * 4 + 1] = 255;
  }
  x.putImageData(img, 0, 0); bx.putImageData(bimg, 0, 0); ax.putImageData(aimg, 0, 0);
  // the rest is drawn in metres from the road's corner
  x.setTransform(sx, 0, 0, sy, 0, 0);
  const at = () => { for (let t = 0; t < 20; t++) { const X = rand() * b.w, Z = rand() * b.l; if (endDist(b.x0 + X, b.z0 + Z) > SAND) return [X, Z]; } return [rand() * b.w, b.l / 2]; };
  for (let k = 0; k < Math.round(LONG_CRACKS * area); k++) { // hairline cracks running across several bricks
    let [px, pz] = at(), a = rand() * Math.PI * 2; const pts = [[px, pz]];
    for (let s2 = 0; s2 < 50; s2++) { a += (rand() - .5) * .3; px += Math.cos(a) * .08; pz += Math.sin(a) * .08; pts.push([px, pz]); }
    for (const [col, w, off] of [['rgba(232,224,208,.25)', 1.4, .012], ['rgba(60,50,38,.55)', 1, 0]]) {
      x.strokeStyle = col; x.lineWidth = w / sx; x.beginPath(); pts.forEach(([a2, b2], i) => i ? x.lineTo(a2 + off, b2 + off) : x.moveTo(a2 + off, b2 + off)); x.stroke();
    }
  }
  const blob = (cx, cz, r, col, a) => { // a soft irregular blotch
    for (let k = 0; k < 5; k++) {
      const bx2 = cx + (rand() - .5) * r, bz = cz + (rand() - .5) * r, rr = r * (.35 + rand() * .45);
      const g = x.createRadialGradient(bx2, bz, 0, bx2, bz, rr); g.addColorStop(0, `rgba(${col},${a})`); g.addColorStop(1, `rgba(${col},0)`);
      x.fillStyle = g; x.beginPath(); x.arc(bx2, bz, rr, 0, Math.PI * 2); x.fill();
    }
  };
  for (let k = 0; k < Math.round(STAINS * area); k++) { const [cx, cz] = at(); blob(cx, cz, .5 + rand() * 1.1, '58,52,40', .09 + rand() * .07); } // water stains
  for (let k = 0; k < Math.round(LICHEN * area); k++) { // lichen: a pale crusty blotch made of specks
    const [cx, cz] = at(), r = .07 + rand() * .2, col = rand() < .6 ? '196,200,176' : '196,160,92';
    x.fillStyle = `rgba(${col},${.35 + rand() * .3})`;
    for (let n = 0; n < r * 600; n++) { const ang = rand() * Math.PI * 2, rr = r * Math.sqrt(rand()); x.fillRect(cx + Math.cos(ang) * rr, cz + Math.sin(ang) * rr, (1 + rand() * 2) / sx, (1 + rand() * 2) / sy); }
  }
  for (let k = 0; k < Math.round(WEEDS * area); k++) { // weeds where seams cross: snap to a brick corner
    const br = bricks[Math.floor(rand() * bricks.length)]; weedAt.push([br.x, br.z, false]);
  }
  for (const [px, pz, big] of weedAt) {
    const dry = rand() < .55, blades = (big ? 10 : 5) + rand() * 6;
    for (let n = 0; n < blades; n++) {
      const a = rand() * Math.PI * 2, l = (big ? .05 : .03) + rand() * (big ? .14 : .08);
      x.strokeStyle = dry ? `rgba(${150 + rand() * 30 | 0},${132 + rand() * 24 | 0},${82 + rand() * 16 | 0},.9)` : `rgba(${84 + rand() * 30 | 0},${100 + rand() * 30 | 0},${52 + rand() * 16 | 0},.9)`;
      x.lineWidth = (1 + rand()) / sx; x.beginPath(); x.moveTo(px, pz);
      x.quadraticCurveTo(px + Math.cos(a + .4) * l * .5, pz + Math.sin(a + .4) * l * .5, px + Math.cos(a) * l, pz + Math.sin(a) * l); x.stroke();
    }
  }
  const tex = cv => { const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.anisotropy = 16; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; return t; };
  return { map: tex(c), bump: tex(bc), aux: tex(ac) };
}

// cells: [[x0, z0, size, laneCorners]] (lane 0 at the road's sides .. 1 down its middle, per corner).
// ends: [[x, z, length, outward angle]] where the road meets the sand.
// sand: the ground's sand as the ground draws it: { detail (its detail texture), color (the sand
// colour before detail), origin ([ox, oz]: detail uv = (x + ox, oz - z) / DETAIL_PERIOD) }.
export function buildCauseway(scene, cells, y, ends, sand) {
  if (!cells.length) return;
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for (const [cx, cz, s] of cells) { x0 = Math.min(x0, cx); z0 = Math.min(z0, cz); x1 = Math.max(x1, cx + s); z1 = Math.max(z1, cz + s); }
  const b = { x0, z0, w: x1 - x0, l: z1 - z0 };
  const endDist = (X, Z) => { let m = Infinity; for (const [ex, ez, len] of ends) if (Math.abs(X - ex) <= len / 2 + 1e-6) m = Math.min(m, Math.abs(Z - ez)); return m; };
  const t = textures(b, endDist);
  const material = new THREE.MeshStandardMaterial({ map: t.map, bumpMap: t.bump, bumpScale: .35, color: new THREE.Color(ALBEDO, ALBEDO, ALBEDO), roughness: .9, envMapIntensity: .2 });
  material.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, { auxMap: { value: t.aux }, sandDetail: { value: sand.detail }, sandColor: { value: sand.color },
      sandOrigin: { value: new THREE.Vector2(...sand.origin) }, bounds: { value: new THREE.Vector4(b.x0, b.z0, b.w, b.l) } });
    sh.vertexShader = 'attribute float lane;\nvarying float vLane;\n' + sh.vertexShader.replace('#include <uv_vertex>', '#include <uv_vertex>\n\tvLane = lane;');
    sh.fragmentShader = `uniform sampler2D auxMap;
uniform sampler2D sandDetail;
uniform vec3 sandColor;
uniform vec2 sandOrigin;
uniform vec4 bounds;
varying float vLane;
float cwSand = 0.0;
float cwHash( vec2 p ) { return fract( sin( dot( p, vec2( 12.9898, 78.233 ) ) ) * 43758.5453 ); }
float cwNoise( vec2 p ) { vec2 i = floor( p ), f = fract( p ); f = f * f * ( 3.0 - 2.0 * f );
  return mix( mix( cwHash( i ), cwHash( i + vec2( 1.0, 0.0 ) ), f.x ), mix( cwHash( i + vec2( 0.0, 1.0 ) ), cwHash( i + 1.0 ), f.x ), f.y ); }
` + sh.fragmentShader
      .replace('#include <map_fragment>', `#include <map_fragment>
\tvec4 aux = texture2D( auxMap, vUv );
\tif ( aux.r > 0.5 ) discard; // a brick gone near the road's end: the ground shows
\tvec2 wp = vec2( bounds.x + vUv.x * bounds.z, bounds.y + ( 1.0 - vUv.y ) * bounds.w );
\tfloat mot = cwNoise( wp / ${MOTTLE[1].toFixed(2)} ) * 0.65 + cwNoise( wp / ${MOTTLE[2].toFixed(2)} + 13.1 ) * 0.35;
\tdiffuseColor.rgb *= ( 1.0 + ( mot - 0.5 ) * ${MOTTLE[0].toFixed(3)} ) * ( 1.0 - ${LANE_DARK.toFixed(3)} * vLane );
\t// drifted sand, coloured exactly as the ground draws it (two detail samples, see world.js)
\tvec2 dp = vec2( wp.x + sandOrigin.x, sandOrigin.y - wp.y ) / ${DETAIL_PERIOD.toFixed(1)};
\tvec2 dq = mat2( 0.8, -0.6, 0.6, 0.8 ) * dp * 0.43 + vec2( 0.31, 0.17 );
\tfloat dsum = texture2D( sandDetail, dp ).r + texture2D( sandDetail, dq ).r;
\tcwSand = aux.g;
\tdiffuseColor.rgb = mix( diffuseColor.rgb, sandColor * ( 1.0 + ( dsum - 1.0 ) * 1.3 ), cwSand );`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n\troughnessFactor = mix( roughnessFactor * ( 1.0 - .15 * vLane ), 1.0, cwSand );');
  };
  const pos = [], uv = [], lane = [], idx = [];
  for (const [cx, cz, s, l] of cells) {
    const n = pos.length / 3;
    [[0, 0], [s, 0], [s, s], [0, s]].forEach(([dx, dz], k) => { const X = cx + dx, Z = cz + dz; pos.push(X, y, Z); uv.push((X - b.x0) / b.w, 1 - (Z - b.z0) / b.l); lane.push(l[k]); });
    idx.push(n, n + 3, n + 1, n + 1, n + 3, n + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('lane', new THREE.Float32BufferAttribute(lane, 1));
  g.setIndex(idx); g.computeVertexNormals();
  const road = new THREE.Mesh(g, material); road.receiveShadow = true; scene.add(road);
}
