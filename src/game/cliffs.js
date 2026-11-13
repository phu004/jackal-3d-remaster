// Stage 4's cliffs: a steep, low-poly rock wall along every cliff edge of the grid (visual only; the cliff cells block like walls, see BLOCKING in world.js).
//
// The wall is a fine height field over the cliff area, built from a smoothed signed distance to the cliff's edge (so the NES's tile staircase becomes the long rounded
// zigzags of a real ridge). From the edge inward:  base (flat ground)  ->  face (a near-sheer slope, `slope` degrees)  ->  rim (flat-ish top).
//   - the face is pushed in by noise at two scales, big bulges and medium ledges (`roughness` scales both); the small chips are the normal map's;
//   - strata: the height is stepped into `strata` bands of rock, each with a slight shelf, tilted a little by the noise, and tinted alternately;
//   - the top edge is crowned with jutting rock chunks (instanced, low-poly) so the silhouette is jagged;
//   - smooth-shaded: a triplanar rock texture (grain, strata bands, erosion streaks) with its normal map on the face, a grit texture on the plateau and the dirt at the foot
//     (cliff-textures.js); the vertex colours only carry the low-frequency tint (strata hue, foot darkening, the plateau's grey).
// The face is displaced mostly *into* the cliff (never far out over the grass), so the collision edge stays at or in front of the rock.
import * as THREE from 'three';
import { cliffTextures } from './cliff-textures.js';

export const CLIFF_DEFAULTS = {
  height: 11,        // m, the rim's height above the ground
  slope: 65,         // degrees, the face's average steepness (a visual cheat: lower shows more face from the camera; the collision edge is unchanged)
  flare: .35,        // share of the face over which its foot eases into the ground (the slope there starts at 30% of the average)
  roughness: 1,      // scales the noise displacement of the face and the rim's unevenness
  strata: 9,         // bands of rock up the face
  chunkDensity: .7,  // jutting rocks per metre of cliff edge
  seed: 4,
  topTint: [1, 1, 1], // the plateau's colour, multiplied into its grit texture (stage 5: a greener top)
  scatter: 1,        // how much the plateau is scattered with rocks, pebbles and tufts (0: bare)
  lod: {             // how the mesh is spent (see the triangle budget in the notes at the top of the mesh section)
    res: .5,         // m per height sample
    fineUntil: 1,    // m behind the rim: full resolution up to here (the face), ...
    midUntil: 4,     // ... 2x coarser up to here, then 4x coarser; beyond it the plateau is capped by a few big flat quads (never seen)
    footUntil: .5,   // m: a block wholly outside this (the flared foot, under 30 cm high) is 2x coarser
    adaptive: true,  // false: everything up to midUntil at full resolution
    cap: true,       // false: no big flat quads
    proxy: true,     // a low-res invisible mesh casts the shadow; the detailed one does not
    maxChunks: 300,  // jutting rocks, at most
  },
};

const BLOCK = 4;          // samples per block: the unit that picks a resolution
const CAP = 4;            // blocks per side of a plateau cap quad (16 x 16 samples)
const TILE = 24;          // m: the meshes are square tiles about this big (each with its own bounds, so off-screen ones are skipped)
const FOOT_X = .8;        // m: the mesh starts this far outside the collision edge, so the foot can flare out to height 0 on the grass
const FOOT_T = .06;       // the face's height is zero below this share of its run: the foot lies flat on the ground
const FOOT_SINK = .15;    // m: the foot is buried this deep, so where it meets the ground the ground itself hides the mesh edge, along the smooth line where the heights cross zero (a flat foot on the ground drew its quads' staircase)
const FOOT_COL = [92, 66, 40]; // the foot's colour: the same earth as the dirt apron round it

// Smooth value noise, 0..1.
export function noise2(seed) {
  const hash = (x, y) => { let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) ^ seed; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
  return (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
}
export const rng = seed => () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
export const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// Distance (in samples) from every sample to the nearest sample where `inside` differs from `from`, by a two-pass chamfer; 0 where inside !== from.
export function chamfer(mask, w, h, from) {
  const D = new Float32Array(w * h), INF = 1e9, R2 = Math.SQRT2;
  for (let i = 0; i < D.length; i++) D[i] = mask[i] === from ? INF : 0;
  const get = (x, y) => x < 0 || y < 0 || x >= w || y >= h ? INF : D[y * w + x]; // (past the area: the same all the way out)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x; if (!D[i]) continue;
    D[i] = Math.min(D[i], get(x - 1, y) + 1, get(x, y - 1) + 1, get(x - 1, y - 1) + R2, get(x + 1, y - 1) + R2);
  }
  for (let y = h - 1; y >= 0; y--) for (let x = w - 1; x >= 0; x--) {
    const i = y * w + x; if (!D[i]) continue;
    D[i] = Math.min(D[i], get(x + 1, y) + 1, get(x, y + 1) + 1, get(x + 1, y + 1) + R2, get(x - 1, y + 1) + R2);
  }
  return D;
}

// Two box-blur passes in each direction: a smooth, nearly Gaussian blur of `r` samples.
export function blur(src, w, h, r) {
  let a = Float32Array.from(src), b = new Float32Array(src.length);
  const n = 2 * r + 1;
  for (let pass = 0; pass < 2; pass++) {
    for (let y = 0; y < h; y++) { // horizontal, a -> b
      let sum = 0; const row = y * w;
      for (let x = -r; x <= r; x++) sum += a[row + Math.min(w - 1, Math.max(0, x))];
      for (let x = 0; x < w; x++) { b[row + x] = sum / n; sum += a[row + Math.min(w - 1, x + r + 1)] - a[row + Math.max(0, x - r)]; }
    }
    for (let x = 0; x < w; x++) { // vertical, b -> a
      let sum = 0;
      for (let y = -r; y <= r; y++) sum += b[Math.min(h - 1, Math.max(0, y)) * w + x];
      for (let y = 0; y < h; y++) { a[y * w + x] = sum / n; sum += b[Math.min(h - 1, y + r + 1) * w + x] - b[Math.max(0, y - r) * w + x]; }
    }
  }
  return a;
}

// opts: the CLIFF_DEFAULTS. area: { x0, x1, z0, z1 } the world rectangle to cover. isCliff(x, z): is the ground here cliff?
// Returns { group, heightAt(x, z) }.
export function buildCliffs({ area, isCliff, ...o }) {
  const P = { ...CLIFF_DEFAULTS, ...o }, rand = rng(P.seed), LOD = { ...CLIFF_DEFAULTS.lod, ...o.lod }, RES = LOD.res, OFF = new Set((P.off ?? '').split(',')); // P.off (the page's ?cliffoff=proxy,shadow,decal,rocks,chunks): switches parts off to find what draws something odd
  if (OFF.has('proxy')) LOD.proxy = false;
  const TB = Math.max(CAP, Math.round(TILE / (RES * BLOCK) / CAP) * CAP), STEP = TB * BLOCK; // blocks and samples per tile side (a multiple of the cap's size)
  const W = Math.ceil((area.x1 - area.x0) / RES / STEP) * STEP, H = Math.ceil((area.z1 - area.z0) / RES / STEP) * STEP; // samples; the lattice has W + 1 by H + 1 points (a whole number of tiles)
  const at = (i, j) => [area.x0 + i * RES, area.z0 + j * RES];

  // --- signed distance to the edge (m, + inside the cliff), rounded by a blur ---
  const mask = new Uint8Array((W + 1) * (H + 1));
  for (let j = 0; j <= H; j++) for (let i = 0; i <= W; i++) mask[j * (W + 1) + i] = isCliff(...at(i, j)) ? 1 : 0;
  const din = chamfer(mask, W + 1, H + 1, 1), dout = chamfer(mask, W + 1, H + 1, 0), sd = new Float32Array(mask.length);
  for (let i = 0; i < sd.length; i++) sd[i] = (mask[i] ? din[i] - .5 : -(dout[i] - .5)) * RES;
  const dist = blur(sd, W + 1, H + 1, Math.round((P.edgeBlur ?? 1.1) / RES)); // sigma about 1 m: the staircase of cells becomes smooth runs and sharp ridge crests keep a hint of their point
  { // the edge meanders (no extra triangles: the same lattice, just moved): swells about 12 m long, bays and spurs about 4 m, and a fine ragged part, 0.25 m
    const nW1 = noise2(151 + P.seed), nW2 = noise2(163 + P.seed), nW3 = noise2(177 + P.seed);
    for (let j = 0; j <= H; j++) for (let i = 0; i <= W; i++) {
      const [x, z] = at(i, j), k = j * (W + 1) + i;
      dist[k] += ((nW1(x / 12, z / 12) - .5) * 2.2 + (nW2(x / 4, z / 4) - .5) * 1.1 + (nW3(x / 1.5, z / 1.5) - .5) * (P.fineWobble ?? .5)) * (P.wobble ?? 1);
    }
  }

  // --- the height field ---
  const RUN = P.height / Math.tan(P.slope * Math.PI / 180), band = P.height / P.strata;
  const nB = noise2(11 + P.seed), nM = noise2(23 + P.seed), nS = noise2(37 + P.seed), nR = noise2(53 + P.seed), nT = noise2(67 + P.seed); // (nS: only colour and the decals, no geometry: the normal map carries the small detail)
  const rough = P.roughness;
  const STRATA_TINT = [[122, 78, 40], [96, 60, 30], [138, 96, 52], [84, 52, 26]];
  const N = (W + 1) * (H + 1), hgt = new Float32Array(N), col = new Float32Array(N * 3), edge = new Float32Array(N); // edge: the displaced distance, for the chunks
  for (let j = 0; j <= H; j++) for (let i = 0; i <= W; i++) {
    const k = j * (W + 1) + i, d = dist[k];
    if (d < -FOOT_X - 1) { edge[k] = d; hgt[k] = -FOOT_SINK; col[k * 3] = FOOT_COL[0] / 255; col[k * 3 + 1] = FOOT_COL[1] / 255; col[k * 3 + 2] = FOOT_COL[2] / 255; continue; } // (far from the cliff: buried like the foot, never left as a black patch at ground level)
    const [x, z] = at(i, j);
    // two scales, each 0..1; biased so the face mostly sits behind the cell edge (never far out over the grass)
    const big = nB(x * .11, z * .11), med = nM(x * .35, z * .35);
    const fade = smooth(-1.5, .5, d) * (1 - smooth(RUN + 2, RUN + 5, d)); // the displacement acts on the face and fades toward the plateau
    const disp = -rough * (.45 * (1 - big) + .2 * (1 - med)) * fade; // mean about -.3 m (up to -.7): the foot sits at or just inside the collision edge
    const dd = d + disp; edge[k] = dd;
    const t = Math.min(1, Math.max(0, (dd + FOOT_X) / (RUN + FOOT_X))); // 0 at the foot (FOOT_X outside the edge), 1 at the rim
    if (t < FOOT_T) { hgt[k] = -FOOT_SINK; col[k * 3] = FOOT_COL[0] / 255; col[k * 3 + 1] = FOOT_COL[1] / 255; col[k * 3 + 2] = FOOT_COL[2] / 255; continue; } // flat, no strata or rim
    const t2 = (t - FOOT_T) / (1 - FOOT_T); // the face proper, from 0 at the foot's end
    let u = t2 * P.height * (.3 + .7 * smooth(0, P.flare, t2)); // the foot flares: it leaves the ground gently
    // strata: each band climbs steeply and then eases out onto a small shelf, a little tilted by the noise
    const f = Math.min(P.strata, Math.max(0, u + (nR(x * .22, z * .22) - .5) * band * .9 * rough * (P.smoothRim ? 1 - smooth(.55, .95, t2) : 1)) / band), whole = Math.floor(f), step = (whole + smooth(.55, 1, f - whole)) * band;
    const shelves = .65 * smooth(0, .08, t2) * (P.smoothRim ? 1 - smooth(.7, .97, t2) : 1); // (and the shelves fade out under the rim as they do at the foot) // the shelves fade out toward the foot, so it blends into the flat ground instead of stepping
    u = t >= 1 ? P.height : Math.max(0, u * (1 - shelves) + step * shelves) * smooth(-FOOT_X, .4, dd); // (and the foot eases to zero over the last stretch outside the edge: no vertical lip where rock meets grass)
    // the rim: flat-ish, a little uneven; the top is not one plane
    const rim = (nT(x * .18, z * .18) - .5) * .7 * rough;
    hgt[k] = (t >= 1 ? P.height + rim * smooth(RUN, RUN + 2.5, dd) : u * (t > 0 ? 1 : 0) + rim * .2 * t) - FOOT_SINK * (1 - smooth(FOOT_T, .3, t));
    // colour: stratum tint, darker at the foot (shadowed, damp), paler on shelves and on the rim, olive dust on the top
    const s = Math.min(P.strata - 1, Math.floor(f));
    let tint = STRATA_TINT[s % STRATA_TINT.length];
    if (P.softBands) { // (stage 5: the band tints melt into one another and pull toward their mean, so the dark and light layers don't show as blocky steps)
      const nx = STRATA_TINT[(s + 1) % STRATA_TINT.length], q = smooth(.05, .95, f - Math.floor(f)), mean = [110, 71, 37];
      tint = tint.map((v, c) => mean[c] + ((v + (nx[c] - v) * q) - mean[c]) * P.softBands);
    }
    const foot = 1 - .3 * (1 - smooth(0, P.height / 3, hgt[k])); // AO-style: the lower third of the face is darker // (one flat tint per band, no blending between bands; the facets' own jitter varies it below)
    let r = tint[0] * foot, g = tint[1] * foot, b = tint[2] * foot;
    const top = smooth(.97, 1, t), grey = 218 * (.88 + .12 * smooth(0, 2, dd - RUN)); // the plateau: a neutral tint (its colour is the grit texture's), a little darker within 2 m of the rim
    r += (grey - r) * top; g += (grey - g) * top; b += (grey - b) * top;
    const earth = 1 - smooth(FOOT_T, .3, t); r += (FOOT_COL[0] - r) * earth; g += (FOOT_COL[1] - g) * earth; b += (FOOT_COL[2] - b) * earth; // the foot's own earth, fading into the rock's tint
    col[k * 3] = r / 255; col[k * 3 + 1] = g / 255; col[k * 3 + 2] = b / 255;
  }

  // How far the foot of the rock is from the collision edge: cliff cells with no rock yet (a strip of grass the jeep can't reach), and rock standing over open ground.
  let bound = 0, bare = 0, bareMax = 0, over = 0, overMax = 0;
  for (let k = 0; k < N; k++) {
    if (mask[k] && din[k] <= 1.01) bound++;
    if (mask[k] && hgt[k] < .05 - FOOT_SINK && dist[k] > 0) { bare++; bareMax = Math.max(bareMax, din[k] * RES); }
    if (!mask[k] && hgt[k] > .05) { over++; overMax = Math.max(overMax, dout[k] * RES); }
  }
  console.log(`cliffs: gap between the foot and the cliff cells: mean ${(bare * RES * RES / Math.max(1, bound * RES)).toFixed(2)} m, max ${bareMax.toFixed(2)} m; rock over open ground: ${over} samples, up to ${overMax.toFixed(2)} m`);

  // --- the material: standard, with the rock and grit textures mapped triplanar (by world position and normal) ---
  const tex = cliffTextures();
  const U = { // tweakable at runtime (window.cliffUniforms in dev): U.uRockScale.value = 5 ...
    uRock: { value: tex?.rock.map }, uRockN: { value: tex?.rock.normal }, uGrit: { value: tex?.grit.map }, uGritN: { value: tex?.grit.normal },
    uRockScale: { value: 3.5 },     // m of cliff per tile of the rock texture
    uTopTint: { value: new THREE.Vector3(...P.topTint) }, // the plateau's tint
    uGritScale: { value: 2.5 },     // m per tile of the grit texture (plateau)
    uNormalStrength: { value: 1.2 }, // the normal maps' strength
    uBrighten: { value: 1.45 },     // the rock texture's brightness (it is multiplied with the vertex tint)
    uCliffH: { value: P.height },   // rim height, m (for the lip)
    uLip: { value: .2 },            // m: the narrow lip along the rim
    uLipBoost: { value: .3 },       // how much lighter it gets (the tan below is the most it can reach)
    uLipCap: { value: new THREE.Color(.42, .34, .22) }, // the lip's ceiling: a warm tan, never white
    uLipTint: { value: new THREE.Color(1, .8, .55) }, // the lip's warm tan (added in proportion: it lifts red most)
    uSatCut: { value: .34 },        // the face's saturation taken off
    uValCut: { value: .08 },        // and its value
    uTunO: { value: new THREE.Vector2() }, uTunD: { value: new THREE.Vector2(0, -1) }, uTun: { value: new THREE.Vector4(0, 0, 0, 0) }, // a tunnel cut into the rock (world.js sets it from the railway's portal): the point on its front plane, the direction in, and (opening radius, springline height, floor height, length); radius 0: none
    uSnow: { value: P.snow ?? 0 },  // snow cover: 0 none .. 1 (up-facing rock, the whole plateau and the ledges all white, the steep face streaked)
    uLineWeak: { value: .35 },      // how much of the texture's lines and grain remain where the lines are weak (about 40% of the face, in patches ~4 m across)
  };
  const rockify = (mat, topRock = false, byHeight = false) => { // byHeight: the face mesh only, where the plateau's top and the rock face are told apart by the height of the surface (one clean contour), not by its slope (which steps along the triangles) // topRock: the rock texture on the upward faces too (the plateau's stones), not the grit
    mat.onBeforeCompile = sh => {
      Object.assign(sh.uniforms, U);
      sh.vertexShader = 'varying vec3 vWPos;\nvarying vec3 vWN;\n' + sh.vertexShader
        .replace('#include <begin_vertex>', `#include <begin_vertex>
	vec4 wp = vec4( transformed, 1.0 );
	#ifdef USE_INSTANCING
	wp = instanceMatrix * wp;
	#endif
	vWPos = ( modelMatrix * wp ).xyz;`)
        .replace('#include <defaultnormal_vertex>', `#include <defaultnormal_vertex>
	vWN = normalize( ( vec4( transformedNormal, 0.0 ) * viewMatrix ).xyz );`); // (the world-space normal)
      sh.fragmentShader = `uniform sampler2D uRock, uRockN, uGrit, uGritN;
uniform float uSnow, uRockScale, uGritScale, uNormalStrength, uBrighten, uCliffH, uLip, uLipBoost, uSatCut, uValCut, uLineWeak;
uniform vec3 uLipTint, uLipCap, uTopTint;
uniform vec2 uTunO, uTunD;
uniform vec4 uTun;
varying vec3 vWPos;
varying vec3 vWN;
float rkH( vec2 p ) { return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453 ); }
float rkN( vec2 p ) { vec2 i = floor( p ), f = fract( p ); f = f * f * ( 3.0 - 2.0 * f );
	return mix( mix( rkH( i ), rkH( i + vec2( 1.0, 0.0 ) ), f.x ), mix( rkH( i + vec2( 0.0, 1.0 ) ), rkH( i + vec2( 1.0, 1.0 ) ), f.x ), f.y ); }
` + sh.fragmentShader
        .replace('#include <map_fragment>', `#include <map_fragment>
	if ( uTun.x > 0.0 ) { // the tunnel's opening: no rock inside the arch-shaped prism that runs into the cliff
		vec2 rel = vWPos.xz - uTunO; float along = dot( rel, uTunD ), across = dot( rel, vec2( -uTunD.y, uTunD.x ) ), up = vWPos.y - uTun.z;
		if ( along > -0.05 && along < uTun.w && up > -0.6 && ( up < uTun.y ? abs( across ) < uTun.x : length( vec2( across, up - uTun.y ) ) < uTun.x ) ) discard;
	}
	vec3 wn0 = normalize( vWN ), tw = pow( abs( wn0 ), vec3( 4.0 ) );
	tw /= tw.x + tw.y + tw.z;
	${byHeight ? `float topK = smoothstep( uCliffH - 0.95, uCliffH - 0.45, vWPos.y ); // 0 on the face, 1 on the plateau: a contour of the height, straight and clean
	{ vec3 ts = pow( abs( vec3( wn0.x, 0.0, wn0.z ) ), vec3( 4.0 ) ); ts /= max( ts.x + ts.z, 1e-4 ); tw = mix( ts, vec3( 0.0, 1.0, 0.0 ), topK ); }` : ''}
	vec3 pr = vWPos / uRockScale, pg = vWPos / uGritScale; // sides: rock, projected along x and z (v = height); top: grit
	mat2 gR = mat2( 0.8, 0.6, -0.6, 0.8 );
	float gMix = smoothstep( 0.3, 0.7, rkN( vWPos.xz / 7.0 + 9.0 ) );
	vec3 gritC = mix( texture2D( uGrit, pg.xz ).rgb, texture2D( uGrit, gR * pg.xz * 0.37 + 0.5 ).rgb, gMix );
	vec3 gritTint = vec3( 1.0 );
	if ( tw.y > 0.02 ) { // (the plateau only)
		vec2 gw = vWPos.xz + ( vec2( rkN( vWPos.xz / 9.0 ), rkN( vWPos.xz / 9.0 + 13.0 ) ) - 0.5 ) * 7.0; // (warped, so the patches wander and have no tidy outline)
		float n1 = rkN( gw / 24.0 + 7.0 ), n2 = rkN( gw / 12.0 + 31.0 ), n3 = rkN( gw / 7.0 + 50.0 );
		gritTint = mix( gritTint, vec3( 1.10, 1.03, 0.84 ), smoothstep( 0.35, 0.85, n1 ) ); // warm sand
		gritTint = mix( gritTint, vec3( 0.88, 0.94, 0.70 ), smoothstep( 0.35, 0.85, n2 ) * 0.8 ); // dry olive
		gritTint *= 1.0 - 0.28 * smoothstep( 0.45, 1.0, n3 ) * ( 0.6 + 0.4 * n1 ); // soil: only a slow darkening toward a warm brown, no edge
		gritTint = mix( gritTint, gritTint * vec3( 0.95, 0.88, 0.8 ), smoothstep( 0.45, 1.0, n3 ) * 0.6 );
		gritTint *= 0.92 + 0.16 * rkN( gw / 3.0 + 5.0 );
	}
	vec3 rockC = texture2D( uRock, pr.zy ).rgb * tw.x + texture2D( uRock, pr.xy ).rgb * tw.z;
	float lm = mix( uLineWeak, 1.0, smoothstep( 0.25, 0.75, rkN( vec2( vWPos.x + vWPos.y * 0.7, vWPos.z + vWPos.y * 0.3 ) / 12.0 ) ) ); // strong lines over about half the face, weak over the rest, in broad patches that fade into each other
	rockC = mix( vec3( 0.72, 0.70, 0.66 ) * ( tw.x + tw.z ), rockC, lm );
	vec2 q5 = vec2( vWPos.x + vWPos.y * 0.7, vWPos.z + vWPos.y * 0.3 ) / 5.0;
	float broken = smoothstep( 0.45, 0.6, rkN( q5 + 17.0 ) ); // some patches of the face are broken, the rest smooth
	float ledgeLine = 1.0 - smoothstep( 0.0, 0.05, abs( fract( ( vWPos.y + ( rkN( q5 * 1.7 + 5.0 ) - 0.5 ) * 1.4 ) / 3.7 + 0.5 ) - 0.5 ) ); // 2-3 wavering horizontal cracks up the wall
	rockC *= ( 1.0 + ( rkN( q5 + 41.0 ) - 0.5 ) * 0.3 ) * ( 1.0 - 0.4 * ledgeLine * broken ); // low-frequency albedo variation; the cracks only where it is broken // (weak lines: the texture eases toward its mean, but only as much as the rock texture is used here: none on the flat top)
	diffuseColor.rgb *= rockC * uBrighten + ${topRock ? 'texture2D( uRock, pr.xz ).rgb * uBrighten' : 'gritC * gritTint * uTopTint'} * tw.y; // (the plateau: two copies of the grit at different scale and angle blended by noise, so the tiling never shows, and broad colour patches: sandy, dry olive, dark soil)`)
        .replace('#include <color_fragment>', `#include <color_fragment>
	float side = ${byHeight ? '1.0 - topK' : '1.0 - smoothstep( 0.55, 0.85, wn0.y )'};
	{ float l = dot( diffuseColor.rgb, vec3( 0.299, 0.587, 0.114 ) ); diffuseColor.rgb = mix( vec3( l ), diffuseColor.rgb, 1.0 - uSatCut * side ) * ( 1.0 - uValCut * side ); } // the face: less saturated, a little darker
	{ float lip = smoothstep( uCliffH - uLip, uCliffH - 0.02, vWPos.y ) * side; vec3 boosted = diffuseColor.rgb * ( vec3( 1.0 ) + uLipBoost * uLipTint ); diffuseColor.rgb = mix( diffuseColor.rgb, min( boosted, max( diffuseColor.rgb, uLipCap ) ), lip ); } // the lip along the rim: a narrow warm tan, capped
	if ( uSnow > 0.0 ) { // snow: on everything that faces up (the plateau, ledges, the broken places), thinner and streaky on the steep face, thicker toward the top
		float nz = ( rkN( vWPos.xz / 2.2 + 3.0 ) - 0.5 ) * 0.5 + ( rkN( vWPos.xz / 0.6 ) - 0.5 ) * 0.2 + ( rkN( vec2( vWPos.x * 0.5 + vWPos.z * 0.3, vWPos.y * 1.5 ) ) - 0.5 ) * 0.35;
		float sk = smoothstep( 0.2, 0.7, wn0.y + nz + 0.25 * smoothstep( 0.0, uCliffH, vWPos.y ) ) * uSnow;
		diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.86, 0.9, 0.97 ) * ( 0.94 + 0.08 * rkN( vWPos.xz * 0.9 ) ), sk );
	}`)
        .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
	{ // triplanar normal map, whiteout blend
		vec4 gn2 = texture2D( uGritN, gR * pg.xz * 0.37 + 0.5 );
		vec3 gn = mix( texture2D( uGritN, pg.xz ).xyz * 2.0 - 1.0, vec3( ( gn2.xy * 2.0 - 1.0 ) * gR, gn2.z * 2.0 - 1.0 ), gMix ); // (the second copy's slopes turned back by its rotation)
		vec3 tx = texture2D( uRockN, pr.zy ).xyz * 2.0 - 1.0, ty = ${topRock ? 'texture2D( uRockN, pr.xz ).xyz * 2.0 - 1.0' : 'gn'}, tz = texture2D( uRockN, pr.xy ).xyz * 2.0 - 1.0;
		tx.xy *= uNormalStrength * lm; ty.xy *= uNormalStrength; tz.xy *= uNormalStrength * lm;
		tx = vec3( tx.xy + wn0.zy, abs( tx.z ) * wn0.x );
		ty = vec3( ty.xy + wn0.xz, abs( ty.z ) * wn0.y );
		tz = vec3( tz.xy + wn0.xy, abs( tz.z ) * wn0.z );
		vec3 wnn = normalize( tx.zyx * tw.x + ty.xzy * tw.y + tz.xyz * tw.z );
		normal = normalize( ( viewMatrix * vec4( wnn, 0.0 ) ).xyz );
	}`);
    };
    return mat;
  };
  const group = new THREE.Group();
  const faceMat = rockify(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, envMapIntensity: .2 }), false, !!P.smoothRim);
  const rockMat = rockify(new THREE.MeshStandardMaterial({ roughness: 1, envMapIntensity: .2 })); // for the chunks and the talus (tinted per instance)
  const stoneMat = rockify(new THREE.MeshStandardMaterial({ roughness: 1, envMapIntensity: .2 }), true); // for the plateau's rocks: rock texture all over
  if (!tex) { faceMat.onBeforeCompile = rockMat.onBeforeCompile = stoneMat.onBeforeCompile = () => {}; } // (no canvas: plain vertex colours)

  // --- the face and plateau: square tiles of a lattice of vertices, indexed where there is rock, at three resolutions picked per 4 x 4 block by the distance behind the rim:
  //     full (the face), 2x coarser (just behind the rim), 4x coarser (the plateau); the plateau beyond that is capped by 16 x 16 quads (nothing ever looks that deep). Where a block
  //     meets a coarser one its edge vertices are snapped onto the coarser edge, so there are no cracks. Smooth normals come from the height field (central differences), so tiles meet without a seam. ---
  const cols = W + 1, nbx = W / BLOCK, nby = H / BLOCK, hAt = (i, j) => hgt[Math.min(H, Math.max(0, j)) * cols + Math.min(W, Math.max(0, i))];
  const level = new Int8Array(nbx * nby), stride = new Uint8Array(nbx * nby), capped = new Uint8Array(nbx * nby);
  for (let bj = 0; bj < nby; bj++) for (let bi = 0; bi < nbx; bi++) {
    let lo = 1e9, hi = -1e9;
    for (let j = bj * BLOCK; j <= (bj + 1) * BLOCK; j++) for (let i = bi * BLOCK; i <= (bi + 1) * BLOCK; i++) { const d = dist[Math.min(H, j) * cols + Math.min(W, i)]; if (d < lo) lo = d; if (d > hi) hi = d; }
    const b = bj * nbx + bi;
    level[b] = hi < -FOOT_X ? -1 : !LOD.adaptive ? (lo < RUN + LOD.midUntil ? 0 : 2) : hi < LOD.footUntil ? 1 : lo < RUN + LOD.fineUntil ? 0 : lo < RUN + LOD.midUntil ? 1 : 2; // (the foot's flare, hardly raised, needs no fine mesh)
    stride[b] = level[b] === 0 ? 1 : level[b] === 1 ? 2 : 4;
  }
  if (LOD.cap) for (let cj = 0; cj < nby; cj += CAP) for (let ci = 0; ci < nbx; ci += CAP) { // 4 x 4 blocks all on the far plateau: one quad
    let all = true;
    for (let j = cj; j < cj + CAP && all; j++) for (let i = ci; i < ci + CAP; i++) if (level[j * nbx + i] !== 2) { all = false; break; }
    if (!all) continue;
    for (let j = cj; j < cj + CAP; j++) for (let i = ci; i < ci + CAP; i++) { capped[j * nbx + i] = 1; stride[j * nbx + i] = BLOCK * CAP; }
  }
  const hs = Float32Array.from(hgt); // the heights as drawn: hgt with the stitched edges
  const snapEdge = (fixed, from, vertical, sn) => { // vertices along one block edge (4 samples from `from`) onto the neighbour's coarser lattice (stride sn)
    for (let m = from; m <= from + BLOCK; m++) {
      if (m % sn === 0) continue;
      const a = Math.floor(m / sn) * sn, c = Math.min(vertical ? H : W, a + sn), w = (m - a) / sn;
      const ia = vertical ? a * cols + fixed : fixed * cols + a, ic = vertical ? c * cols + fixed : fixed * cols + c;
      hs[vertical ? m * cols + fixed : fixed * cols + m] = hgt[ia] + (hgt[ic] - hgt[ia]) * w;
    }
  };
  for (let bj = 0; bj < nby; bj++) for (let bi = 0; bi < nbx; bi++) {
    const b = bj * nbx + bi; if (level[b] < 0 || capped[b]) continue;
    const nb = (di, dj) => { const x = bi + di, y = bj + dj; return x < 0 || y < 0 || x >= nbx || y >= nby || level[y * nbx + x] < 0 ? 0 : stride[y * nbx + x]; };
    if (nb(1, 0) > stride[b]) snapEdge((bi + 1) * BLOCK, bj * BLOCK, true, nb(1, 0));
    if (nb(-1, 0) > stride[b]) snapEdge(bi * BLOCK, bj * BLOCK, true, nb(-1, 0));
    if (nb(0, 1) > stride[b]) snapEdge((bj + 1) * BLOCK, bi * BLOCK, false, nb(0, 1));
    if (nb(0, -1) > stride[b]) snapEdge(bj * BLOCK, bi * BLOCK, false, nb(0, -1));
  }
  const tiles = new Map(); // tile -> flat list of quads (4 vertex indices each)
  const addQuad = (bi, bj, i, j, st) => {
    const a = j * cols + i, b = a + st, c = a + st * cols, d = c + st;
    if (Math.max(hs[a], hs[b], hs[c], hs[d]) < -.04) return; // (each quad is culled on its own, and only once it is wholly buried)
    const key = Math.floor(bj / TB) * 1000 + Math.floor(bi / TB);
    (tiles.get(key) ?? tiles.set(key, []).get(key)).push(a, b, c, d);
  };
  for (let bj = 0; bj < nby; bj++) for (let bi = 0; bi < nbx; bi++) {
    const b = bj * nbx + bi; if (level[b] < 0) continue;
    if (capped[b]) { if (bi % CAP === 0 && bj % CAP === 0) addQuad(bi, bj, bi * BLOCK, bj * BLOCK, BLOCK * CAP); continue; }
    const st = stride[b];
    for (let j = bj * BLOCK; j < (bj + 1) * BLOCK; j += st) for (let i = bi * BLOCK; i < (bi + 1) * BLOCK; i += st) addQuad(bi, bj, i, j, st);
  }
  let faceTris = 0, tileCount = 0;
  for (const quads of tiles.values()) {
    const local = new Map(), pos = [], nor = [], colr = [], idx = [];
    const vert = k => {
      let v = local.get(k); if (v !== undefined) return v;
      const i = k % cols, j = (k - i) / cols, [x, z] = at(i, j), nx = -(hAt(i + 1, j) - hAt(i - 1, j)) / (2 * RES), nz = -(hAt(i, j + 1) - hAt(i, j - 1)) / (2 * RES), l = Math.hypot(nx, 1, nz);
      v = pos.length / 3; local.set(k, v);
      pos.push(x, hs[k], z); nor.push(nx / l, 1 / l, nz / l); colr.push(col[k * 3], col[k * 3 + 1], col[k * 3 + 2]);
      return v;
    };
    for (let q = 0; q < quads.length; q += 4) {
      const ka = quads[q], kb = quads[q + 1], kc = quads[q + 2], kd = quads[q + 3], a = vert(ka), b = vert(kb), c = vert(kc), d = vert(kd);
      if (P.smoothRim && Math.abs(hs[ka] - hs[kd]) < Math.abs(hs[kb] - hs[kc])) idx.push(a, c, d, a, d, b); // (each quad is cut along the diagonal that joins the two corners nearer in height: along the rim and the foot, not across them; one fixed diagonal made a saw-tooth where the surface turns fast)
      else idx.push(a, c, b, b, c, d);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(colr, 3)); g.setIndex(idx);
    g.computeBoundingSphere(); g.computeBoundingBox();
    if (OFF.has('face')) continue; // (to tell whether something odd is the cliff mesh at all)
    const m = new THREE.Mesh(g, faceMat); m.castShadow = !LOD.proxy && !OFF.has('shadow'); m.receiveShadow = true; group.add(m); // (with a proxy, this detailed mesh casts no shadow)
    faceTris += idx.length / 3; tileCount++;
  }

  // --- the shadow proxy: a low-res (1.25 m) mesh of the face and rim, drawn to no colour and no depth, that casts the shadow in the detailed mesh's place; it sits a hair lower so the face does not shadow itself ---
  let proxyTris = 0;
  if (LOD.proxy && !OFF.has('shadow')) {
    const PS = 1.25, nx = Math.ceil((area.x1 - area.x0) / PS), nz = Math.ceil((area.z1 - area.z0) / PS), px = (i) => area.x0 + i * PS, pz = j => area.z0 + j * PS;
    const bil = (arr, x, z) => { const fi = Math.min(W - 1e-3, Math.max(0, (x - area.x0) / RES)), fj = Math.min(H - 1e-3, Math.max(0, (z - area.z0) / RES)), i = Math.floor(fi), j = Math.floor(fj), tx = fi - i, ty = fj - j, g = (a, b) => arr[b * cols + a]; return (g(i, j) * (1 - tx) + g(i + 1, j) * tx) * (1 - ty) + (g(i, j + 1) * (1 - tx) + g(i + 1, j + 1) * tx) * ty; };
    const hv = new Float32Array((nx + 1) * (nz + 1)), dv = new Float32Array(hv.length);
    for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) {
      let lo = 1e9; // the lowest of the face's heights round this vertex, not their average: the coarse proxy then never rises above the detailed face in a notch or bay (it shaded those patches flat black)
      for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) lo = Math.min(lo, bil(hgt, px(i) + a * PS * .5, pz(j) + b * PS * .5));
      hv[j * (nx + 1) + i] = lo; dv[j * (nx + 1) + i] = bil(dist, px(i), pz(j));
    }
    { // the lowest-of-nine heights come out in blocks, and their shadows in stair-steps up the face: two passes of a 3 x 3 average make the proxy a smooth slope (and the shadow a smooth line), a hair lower to stay under the detailed face
      for (let pass = 0; pass < 2; pass++) {
        const src = hv.slice();
        for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) { let sum = 0, n = 0; for (let b = -1; b <= 1; b++) for (let a2 = -1; a2 <= 1; a2++) { const ii = Math.min(nx, Math.max(0, i + a2)), jj = Math.min(nz, Math.max(0, j + b)); sum += src[jj * (nx + 1) + ii]; n++; } hv[j * (nx + 1) + i] = Math.min(src[j * (nx + 1) + i] + .02, sum / n); }
      }
    }
    const local = new Map(), pos = [], idx = [];
    // (the low foot dips well under the ground: a caster lying on the ground would shade it with a hard black patch)
    const vert = k => { let v = local.get(k); if (v !== undefined) return v; const i = k % (nx + 1), j = (k - i) / (nx + 1); v = pos.length / 3; local.set(k, v); pos.push(px(i), Math.max(-.5, hv[k] - .12 - (hv[k] < .5 ? .4 : 0)), pz(j)); return v; };
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const a = j * (nx + 1) + i, b = a + 1, c = a + nx + 1, d = c + 1;
      if (Math.max(hv[a], hv[b], hv[c], hv[d]) < .3 || Math.min(dv[a], dv[b], dv[c], dv[d]) > RUN + 2) continue; // only where there is rock, and not deep in the plateau
      const va = vert(a), vb = vert(b), vc = vert(c), vd = vert(d); idx.push(va, vc, vb, vb, vc, vd);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeBoundingSphere();
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false })); m.castShadow = true; m.frustumCulled = false; group.add(m); proxyTris = idx.length / 3;
  }

  // --- the foot's dirt and contact shadow are in the ground's own material: a distance texture (the smoothed dist field, 8 bits over -4 .. +4 m, linearly filtered so it is smooth) that the
  //     ground shader samples by world position (patchGround, handed back for world.js to chain onto the ground material). No geometry, no alpha strip. ---
  const distBytes = new Uint8Array(N);
  for (let k = 0; k < N; k++) distBytes[k] = Math.round(Math.min(1, Math.max(0, (dist[k] + 4) / 8)) * 255);
  const distTex = new THREE.DataTexture(distBytes, W + 1, H + 1, THREE.LuminanceFormat, THREE.UnsignedByteType);
  distTex.minFilter = distTex.magFilter = THREE.LinearFilter; distTex.generateMipmaps = false; distTex.needsUpdate = true;
  const GU = { // tweakable at runtime like the rock's
    uApronD: { value: distTex },
    uApronRect: { value: new THREE.Vector4(area.x0, area.z0, RES, 0) }, uApronDim: { value: new THREE.Vector2(W + 1, H + 1) },
    uApronWidth: { value: 2.2 },                              // m from the foot over which the grass turns to dirt
    uApronDirt: { value: new THREE.Color(0x5a4a30) },         // the dirt
    uApronDry: { value: new THREE.Color(0x4d4a22) },          // the dry-grass tint on the apron's outer fringe
    uApronStrength: { value: .85 },                           // how far the albedo goes to dirt at the foot
    uApronAO: { value: .55 },                                 // the contact darkening at the wall
    uApronAOWidth: { value: .8 },                             // m it fades over
  };
  const patchGround = sh => {
    Object.assign(sh.uniforms, GU);
    sh.vertexShader = 'varying vec2 vApronXZ;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n\tvApronXZ = ( modelMatrix * vec4( transformed, 1.0 ) ).xz;');
    sh.fragmentShader = `uniform sampler2D uApronD; uniform vec4 uApronRect; uniform vec2 uApronDim;
uniform float uApronWidth, uApronStrength, uApronAO, uApronAOWidth; uniform vec3 uApronDirt, uApronDry;
varying vec2 vApronXZ;
float apH( vec2 p ) { return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453 ); }
float apN( vec2 p ) { vec2 i = floor( p ), f = fract( p ); f = f * f * ( 3.0 - 2.0 * f );
	return mix( mix( apH( i ), apH( i + vec2( 1.0, 0.0 ) ), f.x ), mix( apH( i + vec2( 0.0, 1.0 ) ), apH( i + vec2( 1.0, 1.0 ) ), f.x ), f.y ); }
` + sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
	{
		vec2 apUv = ( ( vApronXZ - uApronRect.xy ) / uApronRect.z + 0.5 ) / uApronDim;
		float d = texture2D( uApronD, apUv ).r * 8.0 - 4.0; // m, + inside the cliff
		if ( apUv.x < 0.0 || apUv.x > 1.0 || apUv.y < 0.0 || apUv.y > 1.0 ) d = -4.0; // (outside the cliff's area the texture only repeats its edge texel: no cliff there, no dark apron)
		d += ( apN( vApronXZ / 1.1 ) - 0.5 ) * 0.6 + ( apN( vApronXZ / 0.35 + 7.0 ) - 0.5 ) * 0.5; // two octaves: the edge is never a clean line
		d += ( apN( vApronXZ / 0.14 + 13.0 ) - 0.5 ) * 0.45; // the edge frays
		float wide = uApronWidth * mix( 0.5, 1.7, smoothstep( 0.25, 0.75, apN( vApronXZ / 6.0 + 3.0 ) ) ); // wide in places, narrow in others, over about 6 m
		float apron = 1.0 - smoothstep( 0.0, wide, -d );
		float fringe = smoothstep( 0.1, 0.22, apron ) * ( 1.0 - smoothstep( 0.22, 0.35, apron ) );
		diffuseColor.rgb = mix( diffuseColor.rgb, uApronDry, fringe * 0.5 );
		diffuseColor.rgb = mix( diffuseColor.rgb, uApronDirt, apron * uApronStrength );
		diffuseColor.rgb *= 1.0 - uApronAO * ( 1.0 - smoothstep( 0.0, uApronAOWidth, -d ) );
	}`);
  };

  // The lowest top height under a rock of radius r at (x, z), or -1 if any part of it would hang past the rim (or off the plateau): nothing is left floating over the face.
  const footing = (x, z, r) => {
    let low = 1e9;
    for (let a = -1; a < 8; a++) {
      const px = a < 0 ? x : x + Math.cos(a * .7854) * r, pz = a < 0 ? z : z + Math.sin(a * .7854) * r;
      const k = Math.min(H, Math.max(0, Math.round((pz - area.z0) / RES))) * (W + 1) + Math.min(W, Math.max(0, Math.round((px - area.x0) / RES)));
      if (edge[k] < RUN + .05 || hgt[k] < P.height * .9) return -1;
      low = Math.min(low, hgt[k]);
    }
    return low;
  };

  // --- jutting rock chunks along the top edge ---
  const angular = (detail, spread, flat = false, octa = false) => { // an icosahedron (or an octahedron) with each corner pushed in or out (the same way wherever it appears), smooth-shaded
    const g = octa ? new THREE.TetrahedronGeometry(1, detail) : new THREE.IcosahedronGeometry(1, detail), p = g.attributes.position, seen = new Map(), key = i => [p.getX(i), p.getY(i), p.getZ(i)].map(n => n.toFixed(3)).join();
    for (let i = 0; i < p.count; i++) {
      const k = key(i);
      if (!seen.has(k)) seen.set(k, [1 - spread + rand() * spread * 2, 1 - spread + rand() * spread * 2, 1 - spread + rand() * spread * 2]);
      const sc = seen.get(k); p.setXYZ(i, p.getX(i) * sc[0], p.getY(i) * sc[1], p.getZ(i) * sc[2]);
    }
    if (flat) { g.computeVertexNormals(); return g; } // (not indexed: each face keeps its own normal, so it stays angular)
    const acc = new Map(), a = new THREE.Vector3(), b = new THREE.Vector3(), n = new THREE.Vector3();
    for (let i = 0; i < p.count; i += 3) { // each corner's normal: the sum of the faces meeting there
      a.fromBufferAttribute(p, i + 1).sub(b.fromBufferAttribute(p, i)); n.fromBufferAttribute(p, i + 2).sub(b); n.crossVectors(a, n);
      for (let q = 0; q < 3; q++) { const k = key(i + q); (acc.get(k) ?? acc.set(k, new THREE.Vector3()).get(k)).add(n); }
    }
    const nor = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) { const v = acc.get(key(i)).clone().normalize(); nor[i * 3] = v.x; nor[i * 3 + 1] = v.y; nor[i * 3 + 2] = v.z; }
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); return g;
  };
  const variants = [0, 1, 2, 3].map(() => angular(0, .4));
  const tintOf = (n, k = 1) => { const t = STRATA_TINT[n % STRATA_TINT.length]; return [t[0] / 255 * k, t[1] / 255 * k, t[2] / 255 * k]; };
  const placed = variants.map(() => []), nG = noise2(83 + P.seed);
  const gradAt = (i, j) => [(edge[j * (W + 1) + Math.min(W, i + 1)] - edge[j * (W + 1) + Math.max(0, i - 1)]), (edge[Math.min(H, j + 1) * (W + 1) + i] - edge[Math.max(0, j - 1) * (W + 1) + i])];
  // Clusters of 3-6 rocks, only where a slow noise is high: it opens gaps of 4-8 m along the edge with none at all.
  const seedProb = P.chunkDensity / 4.5 / 2.56 * 2;
  for (let j = 2; j < H - 2; j += 2) for (let i = 2; i < W - 2; i += 2) {
    const d = edge[j * (W + 1) + i], [x, z] = at(i, j), gate = smooth(.5, .62, nG(x * .1, z * .1));
    if (d < RUN + .4 || d > RUN + 1.4 || !gate || rand() > seedProb * gate) continue;
    const [gx, gz] = gradAt(i, j), gl = Math.hypot(gx, gz) || 1, n = 3 + Math.floor(rand() * 4);
    for (let q = 0; q < n; q++) {
      const size = (rand() < .05 ? .8 + rand() * .4 : .2 + rand() * rand() * .6) * (.8 + .4 * rough), sy = .55 + rand() * .55, sink = .4 + rand() * .2;
      const px = x + (rand() - .5) * 2.2, pz = z + (rand() - .5) * 2.2, low = footing(px, pz, size * 1.15);
      if (low < 0) continue; // (all of it on the plateau, none hanging over the edge)
      placed[Math.floor(rand() * variants.length)].push({ x: px, z: pz, y: low + size * sy * (1 - 2 * sink), size, sy, yaw: rand() * 6.283, rgb: tintOf(P.strata - 1, .85 + rand() * .15) });
    }
  }
  const total = placed.reduce((n, l) => n + l.length, 0), keep = Math.min(1, LOD.maxChunks / Math.max(1, total)); // (at most maxChunks of them: thinned at random)
  if (keep < 1) placed.forEach((l, n) => { placed[n] = l.filter(() => rand() < keep); });
  const dummy = new THREE.Object3D(), c = new THREE.Color();
  variants.forEach((g, n) => {
    const list = placed[n]; if (!list.length || OFF.has('chunks')) return;
    const im = new THREE.InstancedMesh(g, rockMat, list.length);
    list.forEach((p, q) => {
      dummy.position.set(p.x, p.y, p.z); dummy.rotation.set((rand() - .5) * .6, p.yaw, (rand() - .5) * .6); dummy.scale.set(p.size, p.size * p.sy, p.size * (.7 + rand() * .5)); dummy.updateMatrix();
      im.setMatrixAt(q, dummy.matrix); im.setColorAt(q, c.setRGB(...p.rgb));
    });
    im.castShadow = false; im.receiveShadow = true; im.frustumCulled = false; group.add(im); // (no shadows: the clusters' little shadows made the cliff's shadow edge bumpy)
  });

  // --- talus: about 500 small rocks (0.08-0.4 m, mostly small) in the dirt's colour, in clumps by noise, denser at the concave corners of the foot (where the grass is pocketed
  //     between two walls), within 1.5 m of the wall, sunk 30-60% into the ground; no shadows ---
  let talusCount = 0;
  {
    const dirt = new THREE.Color(0x5a4a30), tal = [angular(0, .35), angular(0, .35)], list = tal.map(() => []), nC = noise2(97 + P.seed), cand = [];
    let sum = 0;
    for (let j = 1; j < H; j++) for (let i = 1; i < W; i++) {
      const k = j * cols + i, d = dist[k];
      if (d > .3 || d < -1.5) continue;
      const [x, z] = at(i, j), near = 1 - smooth(0, 1.5, Math.max(0, -d)), cluster = smooth(.42, .66, nC(x * .4, z * .4)); // clumps a few metres across
      const lap = (dist[k - 1] + dist[k + 1] + dist[k - cols] + dist[k + cols] - 4 * d) / (RES * RES), concave = smooth(.05, .5, lap); // (the field's curvature: positive in a pocket)
      const w = near * near * cluster * (1 + 4 * concave); if (w <= 0) continue;
      cand.push(x, z, w); sum += w;
    }
    const scale = 500 / Math.max(1e-6, sum);
    for (let q = 0; q < cand.length; q += 3) {
      if (rand() > cand[q + 2] * scale) continue;
      const size = .08 + Math.pow(rand(), 3) * .32, k = .8 + rand() * .4; // (mostly small)
      list[rand() < .5 ? 0 : 1].push({ x: cand[q] + (rand() - .5) * RES, z: cand[q + 1] + (rand() - .5) * RES, size, sy: .5 + rand() * .5, sink: .3 + rand() * .3, rgb: [dirt.r * k, dirt.g * k, dirt.b * k] });
    }
    tal.forEach((g, n) => {
      if (!list[n].length || OFF.has('rocks')) return;
      const im = new THREE.InstancedMesh(g, rockMat, list[n].length); talusCount += list[n].length;
      list[n].forEach((p, q) => {
        const h = p.size * p.sy; // half the rock's height: its centre sits (1 - 2 sink) of that above the ground, so sink of it is below
        dummy.position.set(p.x, h * (1 - 2 * p.sink), p.z); dummy.rotation.set(rand() * 6, rand() * 6, rand() * 6); dummy.scale.set(p.size, h, p.size * (.7 + rand() * .5)); dummy.updateMatrix();
        im.setMatrixAt(q, dummy.matrix); im.setColorAt(q, c.setRGB(...p.rgb));
      });
      im.castShadow = false; im.receiveShadow = true; im.frustumCulled = false; group.add(im);
    });
  }
  // --- the plateau scatter. Clusters whose centres are picked by slow noise and kept 8-10 m apart (so there are bare gaps between them): 4-10 rocks each within 20 m of the rim, 2-4 further
  //     back (about 1 rock per 4 m^2 inside a cluster near the rim, 1 per 15 m^2 far back). A power-law mix of sizes: 70% 0.15-0.35 m, 25% 0.4-0.8 m, 5% 0.9-1.3 m. The biggest are angular
  //     (corners jittered 0.6-1.4, scaled unevenly, tilted up to 15 degrees) and stay 1.5 m back from the rim; mid-size ones 1.2 m; only the small ones may sit at the edge. The face's rock
  //     texture at its own brightness (x 0.9-1.1) with grey and sandy ones: a little lighter or darker than the ground, never black. Each is sunk 30-50% with a soft tint under it.
  //     Round every cluster, dense tiny pebbles; between clusters, a few tufts of dry grass and patches of dark soil. Drawn in 24 m tiles of instances, each with its own bounds. ---
  let outcropCount = 0, pebbleCount = 0, tuftCount = 0, outcropTris = 0;
  {
    // Everything is baked into a few merged meshes per 16 m tile (not instances: one draw call each, bounds fitted to what is in it): the rocks, the big rocks (they cast shadows), the
    // tufts, and the soft tints. Only the plateau within 26 m of the rim is scattered: further back the camera never looks.
    const SC = P.scatter, TILE_R = 16, dummyO = new THREE.Object3D();
    const bigV = [0, 1, 2].map(() => angular(0, .4, true)), smallV = [0, 1].map(() => angular(0, .3)), pebV = [0, 1].map(() => angular(0, .3, true, true)), allV = [...bigV, ...smallV];
    const tuftG = new THREE.ConeGeometry(.05, .3, 4, 1, true).translate(0, .15, 0);
    const buckets = new Map(), nm = new THREE.Matrix3(), v3 = new THREE.Vector3();
    const bucket = (x, z) => {
      const key = Math.floor((x - area.x0) / TILE_R) * 1000 + Math.floor((z - area.z0) / TILE_R); let b = buckets.get(key);
      if (!b) buckets.set(key, b = { stone: { pos: [], nor: [], col: [] }, big: { pos: [], nor: [], col: [] }, tuft: { pos: [], nor: [], col: [] }, decal: { pos: [], nor: [], col: [] } });
      return b;
    };
    const bake = (dst, geom, m, rgb) => { // one copy of `geom`, transformed by m, appended to dst
      nm.getNormalMatrix(m); const pa = geom.attributes.position, na = geom.attributes.normal, idx = geom.index, count = idx ? idx.count : pa.count;
      for (let q = 0; q < count; q++) {
        const i = idx ? idx.getX(q) : q;
        v3.fromBufferAttribute(pa, i).applyMatrix4(m); dst.pos.push(v3.x, v3.y, v3.z);
        v3.fromBufferAttribute(na, i).applyMatrix3(nm).normalize(); dst.nor.push(v3.x, v3.y, v3.z);
        dst.col.push(...rgb);
      }
    };
    const nO = noise2(131 + P.seed), cand = [];
    for (let j = 2; j < H - 2; j += 4) for (let i = 2; i < W - 2; i += 4) {
      const k = j * cols + i, dd = edge[k] - RUN; if (dd < 1.5 || dd > 26) continue;
      const [x, z] = at(i, j); cand.push({ k, x, z, dd, gate: smooth(.28, .48, nO(x * .06, z * .06)) * (dd < 14 ? 1 : 1 - .75 * smooth(14, 26, dd)) });
    }
    for (let q = cand.length - 1; q > 0; q--) { const r = Math.floor(rand() * (q + 1)); [cand[q], cand[r]] = [cand[r], cand[q]]; } // (shuffled: the centres are thrown in random order)
    const centres = [], SPACING = 9 / Math.sqrt(Math.max(.01, SC)); // (a bigger `scatter` packs the clusters closer)
    for (const cd of cand) { // dart throwing: a centre where the noise allows it and no other is close
      if (rand() > cd.gate) continue;
      if (centres.some(o => Math.hypot(o.x - cd.x, o.z - cd.z) < SPACING * (.9 + rand() * .2))) continue;
      centres.push(cd);
    }
    const tints = [[.62, .55, .43], [.56, .54, .5], [.5, .38, .26], [.66, .6, .5], [.4, .34, .28]]; // sandy, grey, warm brown, pale sand, a darker one
    const tintOf = () => { const t = tints[Math.floor(Math.pow(rand(), 1.3) * tints.length)], k = .9 + rand() * .2; return [t[0] * k, t[1] * k, t[2] * k]; };
    const topAt = (x, z) => edge[Math.min(H, Math.max(0, Math.round((z - area.z0) / RES))) * cols + Math.min(W, Math.max(0, Math.round((x - area.x0) / RES)))] - RUN; // (distance behind the rim)
    const putRock = (x, z, width) => {
      const dd = topAt(x, z), top = footing(x, z, width / 2 * 1.3); // (top: the lowest ground under it; -1 if any of it would hang over the rim)
      if (top < 0 || dd < (width < .6 ? .1 : width < 1.8 ? 1.6 : 2.5)) return;
      const r = width / 2, big = width >= 1.8, sink = .3 + rand() * .2, sx = r * (.6 + rand() * .8), sz = r * (.6 + rand() * .8), h = r * (.5 + rand() * .7), tilt = big ? .26 : .35;
      dummyO.position.set(x, top + h * (1 - 2 * sink), z); dummyO.rotation.set((rand() - .5) * 2 * tilt, rand() * 6.283, (rand() - .5) * 2 * tilt); dummyO.scale.set(sx, h, sz); dummyO.updateMatrix();
      const b = bucket(x, z), v = width >= .8 ? Math.floor(rand() * bigV.length) : bigV.length + Math.floor(rand() * smallV.length);
      bake(big ? b.big : b.stone, allV[v], dummyO.matrix, tintOf()); outcropCount++; outcropTris += 20;
      dummyO.position.set(x, top + .03, z); dummyO.rotation.set(0, 0, 0); dummyO.scale.set(Math.max(sx, sz) * 3.2, 1, Math.max(sx, sz) * 3.2); dummyO.updateMatrix();
      bake(b.decal, flatG, dummyO.matrix, [.12, .08, .04, .42]); outcropTris += 2; // (the soft tint under it)
    };
    const flatG = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    for (const cd of centres) {
      const far = cd.dd > 14, n = Math.max(1, Math.round((far ? 2 + Math.floor(rand() * 3) : 5 + Math.floor(rand() * 8)) * SC)), R = Math.sqrt(n * (far ? 30 : 10) / Math.PI);
      for (let m = 0; m < n; m++) {
        const a = rand() * 6.283, rad = R * Math.sqrt(rand()), roll = rand(); // 60% small (.15-.35 m), 35% mid (.4-.8 m), 5% big (.9-1.3 m)
        putRock(cd.x + Math.cos(a) * rad, cd.z + Math.sin(a) * rad, roll < .5 ? .4 + rand() * .4 : roll < .9 ? .9 + rand() * .8 : 1.8 + rand() * 1.2); // 50% small (.4-.8 m), 40% mid (.9-1.7 m), 10% big (1.8-3 m)
      }
      for (let m = Math.round((far ? 3 + rand() * 3 : 8 + rand() * 9) * SC); m > 0; m--) { // tiny pebbles, dense round the cluster
        const a = rand() * 6.283, rad = R * 1.4 * Math.sqrt(rand()), x = cd.x + Math.cos(a) * rad, z = cd.z + Math.sin(a) * rad, top = footing(x, z, .09);
        if (top < 0) continue;
        const r = (.06 + rand() * .1) / 2; dummyO.position.set(x, top - r * .2, z); dummyO.rotation.set(rand() * 6, rand() * 6.283, rand() * 6); dummyO.scale.set(r, r * (.5 + rand() * .5), r); dummyO.updateMatrix();
        bake(bucket(x, z).stone, pebV[Math.floor(rand() * pebV.length)], dummyO.matrix, tintOf()); pebbleCount++; outcropTris += 4;
      }
    }
    for (let q = 0; q < 200 * SC; q++) { // between clusters: dry-grass tufts (a few blades together) and patches of dark soil
      const cd = cand[Math.floor(rand() * cand.length)]; if (!cd || cd.gate <= 0 || cd.dd > 22) continue;
      if (centres.some(o => Math.hypot(o.x - cd.x, o.z - cd.z) < 4.5)) continue;
      const top = footing(cd.x, cd.z, .5); if (top < 0) continue;
      if (rand() < .55) for (let m = 4 + Math.floor(rand() * 4); m > 0; m--) {
        const t = .85 + rand() * .3, s2 = .7 + rand() * .8, x = cd.x + (rand() - .5) * .5, z = cd.z + (rand() - .5) * .5, lean = (rand() - .5) * .5;
        dummyO.position.set(x, top, z); dummyO.rotation.set(lean, rand() * 6.283, lean * .7); dummyO.scale.set(s2, s2, s2); dummyO.updateMatrix();
        bake(bucket(x, z).tuft, tuftG, dummyO.matrix, [.62 * t, .55 * t, .3 * t]); tuftCount++; outcropTris += 8;
      } else {
        const r2 = 1 + rand() * 1.4; dummyO.position.set(cd.x, top + .025, cd.z); dummyO.rotation.set(0, 0, 0); dummyO.scale.set(r2 * 2, 1, r2 * 2); dummyO.updateMatrix();
        bake(bucket(cd.x, cd.z).decal, flatG, dummyO.matrix, [.27, .2, .12, .5]); outcropTris += 2;
      }
    }
    const stoneVMat = rockify(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, envMapIntensity: .2 }), true); // (rock texture all over, the colour in the vertices)
    const tuftMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, side: THREE.DoubleSide, envMapIntensity: .15 });
    if (!tex) stoneVMat.onBeforeCompile = () => {};
    let decalMat = null;
    if (tex) { // a soft round gradient for the tints: no hard edge
      const c2 = document.createElement('canvas'); c2.width = c2.height = 64; const x2 = c2.getContext('2d'), gr = x2.createRadialGradient(32, 32, 3, 32, 32, 32);
      gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(.55, 'rgba(255,255,255,.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); x2.fillStyle = gr; x2.fillRect(0, 0, 64, 64);
      decalMat = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c2), vertexColors: true, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    }
    const make = (d, material, shadow, nc) => {
      if (!d.pos.length || OFF.has('rocks')) return;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(d.pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(d.nor, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(d.col, nc)); g.computeBoundingSphere();
      const m = new THREE.Mesh(g, material); m.castShadow = shadow; m.receiveShadow = true; group.add(m); return m;
    };
    for (const b of buckets.values()) {
      make(b.stone, stoneVMat, false, 3); make(b.big, stoneVMat, true, 3); make(b.tuft, tuftMat, false, 3);
      if (decalMat) { const m = make(b.decal, decalMat, false, 4); if (m) m.renderOrder = 3; }
    }
    if (!decalMat) outcropTris -= 0;
  }
  const chunkCount = placed.reduce((n, l) => n + l.length, 0), TRI0 = 20; // (detail 0: 20 triangles each)
  group.userData.stats = { faceTris, tiles: tileCount, proxyTris, chunks: chunkCount, talus: talusCount, outcrops: outcropCount, pebbles: pebbleCount, tufts: tuftCount, rockTris: (chunkCount + talusCount) * TRI0 + outcropTris, total: faceTris + (chunkCount + talusCount) * TRI0 + outcropTris };
  console.log('cliffs: triangles drawn in the main pass (the proxy draws none; it only casts the shadow, ' + proxyTris + ' triangles): ' + JSON.stringify(group.userData.stats));

  // The rock's height under a point (bilinear), for anything that wants to sit on it.
  const heightAt = (x, z) => {
    const fi = (x - area.x0) / RES, fj = (z - area.z0) / RES, i = Math.min(W - 1, Math.max(0, Math.floor(fi))), j = Math.min(H - 1, Math.max(0, Math.floor(fj))), tx = fi - i, ty = fj - j, g = (a, b) => hgt[b * (W + 1) + a];
    return (g(i, j) * (1 - tx) + g(i + 1, j) * tx) * (1 - ty) + (g(i, j + 1) * (1 - tx) + g(i + 1, j + 1) * tx) * ty;
  };
  return { group, heightAt, uniforms: { ...U, ...GU }, patchGround };
}
