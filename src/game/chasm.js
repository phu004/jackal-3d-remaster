// Stage 5's chasms: deep valleys cut into the ground (the NES drew them as plain black). Visual only; the chasm cells block like walls (see BLOCKING in world.js).
//
// Like the cliffs (cliffs.js) in reverse: a height field over a fine lattice, built from the smoothed signed distance to the chasm's edge (+ inside the chasm), so the NES's tile staircase
// becomes the ragged line of a real fault. From the rim inward: a crumbling lip  ->  a near-sheer wall in bands of rock (`strata`) with shelves  ->  a floor of broken rock, `depth` metres down.
//   - the ground mesh is not drawn inside the chasm: its shader discards what lies over it (patchGround, a distance texture of the same field), so the mesh below shows through;
//   - the light gets dimmer the deeper it goes (vertex colours: 1 at the rim, a fifth of that on the floor, cooler in tone), but the floor stays plain to see;
//   - smooth-shaded, the cliffs' rock texture mapped triplanar (cliff-textures.js); boulders and fallen rock lie on the floor.
import * as THREE from 'three';
import { cliffTextures } from './cliff-textures.js';
import { noise2, chamfer, blur, rng, smooth } from './cliffs.js';
import { hazeify } from './bridge.js';

export const CHASM_DEFAULTS = {
  depth: 14,        // m, from the rim to the floor
  slope: 76,        // degrees, the wall's average steepness
  strata: 7,        // bands of rock down the wall
  roughness: 1,     // how far the wall's bulges and ledges reach
  floorDark: .24,   // the floor's brightness against the rim's
  trees: 0,         // bare, gnarled trees growing out of the walls, at most
  boulders: 1100,   // fallen rocks on the floor, at most
  seed: 5,
  rerolls: [],      // [{ z0, z1, dx, dz }]: strips (z, m) whose noise is read shifted by (dx, dz)
  haze: null,       // [r, g, b] 0..1: the colour the depths fade into (instead of darkness); null = none
  hazeAmount: 1,
  res: .6,          // m per height sample
};

const TILE = 20;    // samples per mesh tile side (each its own bounds, so tiles off screen are skipped)
const FOOT = .6;    // m: the mesh starts this far outside the rim (under the ground, hidden)
const STRATA_TINT = [[150, 128, 98], [126, 106, 80], [164, 142, 108], [110, 93, 72]]; // pale limestone, as the plateaus' faces

// opts: CHASM_DEFAULTS, area: { x0, x1, z0, z1 } (m), isChasm(x, z). Returns { group, patchGround(sh), uniforms } (or null if there is no chasm).
export function buildChasm({ area, isChasm, avoid = null, ...o }) { // avoid(x, z): spots the wall trees keep clear of (the bridges)
  const P = { ...CHASM_DEFAULTS, ...o }, rand = rng(P.seed), RES = P.res;
  const W = Math.ceil((area.x1 - area.x0) / RES), H = Math.ceil((area.z1 - area.z0) / RES), cols = W + 1, N = cols * (H + 1);
  const at = (i, j) => [area.x0 + i * RES, area.z0 + j * RES];
  const reroll = (x, z) => { let dx = 0, dz = 0; for (const q of P.rerolls) { const w = smooth(q.z0, q.z0 + 10, z) * (1 - smooth(q.z1 - 10, q.z1, z)); dx += q.dx * w; dz += q.dz * w; } return [x + dx, z + dz]; }; // (the noise is read from another place over these strips of the map: the same chasm, its ragged edge and wall drawn afresh)
  const mask = new Uint8Array(N); let any = false;
  for (let j = 0; j <= H; j++) for (let i = 0; i <= W; i++) { const m = isChasm(...at(i, j)) ? 1 : 0; mask[j * cols + i] = m; if (m) any = true; }
  if (!any) return null;

  // --- signed distance to the rim (m, + inside), rounded by a blur, the edge wavering ---
  const din = chamfer(mask, cols, H + 1, 1), dout = chamfer(mask, cols, H + 1, 0), sd = new Float32Array(N);
  for (let k = 0; k < N; k++) sd[k] = (mask[k] ? din[k] - .5 : -(dout[k] - .5)) * RES;
  const dist = blur(sd, cols, H + 1, Math.round(.9 / RES));
  const nW1 = noise2(211 + P.seed), nW2 = noise2(223 + P.seed), nW3 = noise2(239 + P.seed);
  for (let j = 0; j <= H; j++) for (let i = 0; i <= W; i++) {
    const [x0, z0] = at(i, j), [x, z] = reroll(x0, z0);
    dist[j * cols + i] += (nW1(x / 11, z / 11) - .5) * 1.8 + (nW2(x / 3.6, z / 3.6) - .5) * .9 + (nW3(x / 1.3, z / 1.3) - .5) * .35;
  }

  // --- the height field: 0 at the rim, down the wall, to the floor at -depth ---
  const ROUND = 6, ROUND_DROP = 9.5, FOOT_RUN = 2.4, RUN = ROUND + FOOT_RUN, rough = P.roughness; // the profile: from the rim a quarter-ellipse, level at the rim and curving down to near-vertical after ROUND m and ROUND_DROP m of fall; then the wall's last stretch to the floor over FOOT_RUN m
  const nB = noise2(11 + P.seed), nM = noise2(23 + P.seed), nR = noise2(53 + P.seed), nF1 = noise2(71 + P.seed), nF2 = noise2(83 + P.seed), nF3 = noise2(97 + P.seed);
  const hgt = new Float32Array(N), col = new Float32Array(N * 3), soilW = new Float32Array(N); // soilW: how much of the ground's own dirt a vertex still is (1 at the rim, 0 in the rock)
  for (let j = 0; j <= H; j++) for (let i = 0; i <= W; i++) {
    const k = j * cols + i, d = dist[k];
    if (d < -FOOT - .4) { hgt[k] = 0; col[k * 3] = col[k * 3 + 1] = col[k * 3 + 2] = .3; continue; } // (no mesh here: never drawn)
    const [x, z] = reroll(...at(i, j));
    // the wall bulges and sets back: two scales of noise move where it lies (nothing at the rim itself, so the ground's cut-out and the mesh meet)
    const disp = ((nB(x * .13, z * .13) - .5) * 2.2 + (nM(x * .45, z * .45) - .5) * 1.0) * rough * smooth(.05, 1.8, d) + (nM(x * 1.3 + 4, z * 1.3) - .5) * .7 * smooth(0, 1, d) * smooth(2.5, .8, d);
    const dd = d + disp, t = Math.min(1, Math.max(0, dd / RUN));
    // the profile: the ground curves over the rim (an ellipse quarter: level where it meets the ground, near-vertical at its end), the wall drops on to the floor and eases into the rubble at its foot
    const y0 = dd <= 0 ? 0 : dd < ROUND ? -ROUND_DROP * (1 - Math.sqrt(1 - (dd / ROUND) * (dd / ROUND))) : -ROUND_DROP - (P.depth - ROUND_DROP) * (1 - Math.pow(1 - Math.min(1, (dd - ROUND) / FOOT_RUN), 1.8));
    const a = Math.min(1, -y0 / P.depth);
    const f = Math.min(P.strata, Math.max(0, a * P.strata + (nR(x * .21, z * .21) - .5) * .8 * rough)), whole = Math.floor(f);
    const lip = -.15 * smooth(0, .8, d) * (1 - smooth(.8, 2.4, d)) * (.6 + .8 * nR(x * .7 + 3, z * .7)); // (a little crumble at the rim)
    // the floor: broken rock, ridges and humps
    const fl = ((nF1(x * .11, z * .11) - .5) * 2.4 + (nF2(x * .38, z * .38) - .5) * 1.3 + Math.abs(nF3(x * .22, z * .22) - .5) * -1.8 + .5) * smooth(.65, 1.15, Math.max(0, (dd - ROUND) / FOOT_RUN));
    const y = y0 + lip + fl;
    hgt[k] = y - .05; // (sunk a hair: where the mesh runs on under the ground it must not fight it)
    // colour: the stratum's tint, darker the deeper, cooler in the dark
    const s = Math.min(P.strata - 1, Math.floor(f)), tint = STRATA_TINT[s % STRATA_TINT.length], depthK = smooth(0, 1, Math.min(1, -y / P.depth));
    const k2 = 1 - (1 - P.floorDark) * Math.pow(depthK, .8), cool = depthK * .16, jit = .94 + (nM(x * .9 + 7, z * .9) - .5) * .12;
    col[k * 3] = tint[0] / 255 * k2 * (1 - cool * .9) * jit; col[k * 3 + 1] = tint[1] / 255 * k2 * (1 - cool * .35) * jit; col[k * 3 + 2] = tint[2] / 255 * k2 * (1 + cool * .5) * jit;
    if (P.haze) { const hz = Math.pow(smooth(.08, 1, depthK), 1.1) * P.hazeAmount; for (let c = 0; c < 3; c++) col[k * 3 + c] += (P.haze[c] - col[k * 3 + c]) * hz; } // the depths fill with a brownish haze: the wall dissolves into it, no floor to be seen
    const soil = soilW[k] = 1 - smooth(0, 1, Math.pow(t, .8)); // (the lip is the ground's own dirt, crumbling into rock a little way down)
    if (soil > 0) { const dirt = [.41, .3, .185]; for (let c = 0; c < 3; c++) col[k * 3 + c] += (dirt[c] * (.9 + (nM(x * .8, z * .8) - .5) * .3) - col[k * 3 + c]) * soil; }
  }

  // --- the material: standard, vertex colours for the tone, the cliffs' rock texture triplanar ---
  const tex = cliffTextures();
  const G = { glsl: '' }; // the ground's own dust-and-mud colour function, set by the world before the first draw
  const U = {
    uNorthLift: { value: 0.09 }, uSouthLift: { value: 0.22 }, uSideLift: { value: 0.16 }, uGMap: { value: null }, uDetail: { value: null }, uDetailOn: { value: 0 }, uDetailK: { value: new THREE.Vector4(1 / 6, -1 / 6, 0, 0) }, uGUv: { value: new THREE.Vector4(1, -1, 0, 0) }, uHaze: { value: new THREE.Color(...(P.haze ?? [0, 0, 0])) }, uHazeTop: { value: -1.2 }, uHazeBot: { value: -P.depth * .72 }, uRock: { value: tex?.rock.map }, uRockN: { value: tex?.rock.normal }, uRockScale: { value: 3.5 }, uNormalStrength: { value: 1.1 }, uBrighten: { value: 1.45 }, uDustSkip: { value: 0 }, // (uDustSkip: 1 = the dirt without its dust and mud patches, LOW: see world.js)
  };
  const rockify = mat => {
    mat.onBeforeCompile = sh => {
      Object.assign(sh.uniforms, U);
      sh.vertexShader = 'attribute float soil;\nvarying float vSoil;\nvarying vec3 vWPos;\nvarying vec3 vWN;\n' + sh.vertexShader
        .replace('#include <begin_vertex>', `#include <begin_vertex>
	vec4 wp = vec4( transformed, 1.0 );
	vWPos = ( modelMatrix * wp ).xyz;`)
        .replace('#include <defaultnormal_vertex>', `#include <defaultnormal_vertex>
	vWN = normalize( ( vec4( transformedNormal, 0.0 ) * viewMatrix ).xyz );
	vSoil = soil;`);
      sh.fragmentShader = `uniform sampler2D uRock, uRockN;
uniform float uRockScale, uNormalStrength, uBrighten, uHazeTop, uHazeBot, uDetailOn, uNorthLift, uSouthLift, uSideLift;
uniform sampler2D uDetail, uGMap; uniform vec4 uDetailK, uGUv;
uniform vec3 uHaze;
${G.glsl || 'vec3 shDust( vec3 c, vec2 dp, float keep ) { return c; }'}
varying vec3 vWPos;
varying vec3 vWN;
varying float vSoil;
` + sh.fragmentShader
        .replace('#include <map_fragment>', `#include <map_fragment>
	vec3 wn0 = normalize( vWN ), tw = pow( abs( wn0 ), vec3( 4.0 ) );
	tw /= tw.x + tw.y + tw.z;
	vec3 pr = vWPos / uRockScale;
	vec3 rockC = texture2D( uRock, pr.zy ).rgb * tw.x + texture2D( uRock, pr.xz ).rgb * tw.y + texture2D( uRock, pr.xy ).rgb * tw.z;
	vec3 rockMul = mix( vec3( 0.72, 0.70, 0.66 ), rockC, 0.65 ) * uBrighten;
	diffuseColor.rgb *= mix( rockMul, vec3( 1.0 ) + ( rockMul - 1.0 ) * 0.2, vSoil ); // (near the rim the rock texture fades out: it is still the ground's dirt)`)
        .replace('#include <color_fragment>', `#include <color_fragment>
	if ( uDetailOn > 0.5 ) { // near the rim the surface is the ground's own, computed as the ground computes it (its colour map, its detail texture, its dust and mud patches): no seam where the two meet
		vec2 gdp = vec2( vWPos.x * uDetailK.x + uDetailK.z, vWPos.z * uDetailK.y + uDetailK.w ), gdq = mat2( 0.8, -0.6, 0.6, 0.8 ) * gdp * 0.43 + vec2( 0.31, 0.17 );
		vec3 gc = texture2D( uGMap, vec2( vWPos.x * uGUv.x + uGUv.z, vWPos.z * uGUv.y + uGUv.w ) ).rgb * 0.6588;
		gc *= 1.0 + ( texture2D( uDetail, gdp ).r + texture2D( uDetail, gdq ).r - 1.0 ) * 1.3;
		diffuseColor.rgb = mix( diffuseColor.rgb, shDust( gc, gdp, 1.0 - smoothstep( 0.0, 0.8, vSoil ) ), smoothstep( 0.0, 1.0, vSoil ) );
		// the slope turns from the sun and the sky, so the dirt where it meets the ground is lifted to even that out: one value for each side of the chasm, each its own (the weights partition: a north-rim fragment moves only with the north value, and so on)
		{ vec2 hn = normalize( vWN ).xz; float tilt = smoothstep( 0.0, 0.05, length( hn ) ), dz = hn.y / max( length( hn ), 0.001 ); // dz: +1 where the slope falls away to the south (the chasm's north rim), -1 to the north (its south rim)
		  float wN = smoothstep( 0.3, 0.7, dz ), wS = smoothstep( 0.3, 0.7, -dz ), wE = max( 0.0, 1.0 - wN - wS );
		  diffuseColor.rgb *= 1.0 + ( uNorthLift * wN + uSouthLift * wS + uSideLift * wE ) * tilt * smoothstep( 0.0, 0.9, vSoil ); }
	}`)
        .replace('#include <fog_fragment>', `gl_FragColor.rgb = mix( gl_FragColor.rgb, uHaze, smoothstep( uHazeTop, uHazeBot, vWPos.y ) ); // the depths dissolve into a brown haze, whatever the light there
#include <fog_fragment>`)
        .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
	{
		vec3 tx = texture2D( uRockN, pr.zy ).xyz * 2.0 - 1.0, ty = texture2D( uRockN, pr.xz ).xyz * 2.0 - 1.0, tz = texture2D( uRockN, pr.xy ).xyz * 2.0 - 1.0;
		tx.xy *= uNormalStrength; ty.xy *= uNormalStrength; tz.xy *= uNormalStrength;
		tx = vec3( tx.xy + wn0.zy, abs( tx.z ) * wn0.x );
		ty = vec3( ty.xy + wn0.xz, abs( ty.z ) * wn0.y );
		tz = vec3( tz.xy + wn0.xy, abs( tz.z ) * wn0.z );
		vec3 wnn = normalize( tx.zyx * tw.x + ty.xzy * tw.y + tz.xyz * tw.z );
		normal = normalize( mix( normal, normalize( ( viewMatrix * vec4( wnn, 0.0 ) ).xyz ), 1.0 - vSoil * 0.9 ) );
	}`);
    };
    return mat;
  };
  const mat = rockify(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, envMapIntensity: .15, polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 2 })); // (pushed back a little in depth: where the rock under the lip runs beneath the ground, the ground wins, so it never shows through as grey patches on a phone's coarser depth buffer)
  if (!tex) mat.onBeforeCompile = () => {};
  const group = new THREE.Group();

  // --- the mesh: square tiles of the lattice, wherever the rim is within reach ---
  const hAt = (i, j) => hgt[Math.min(H, Math.max(0, j)) * cols + Math.min(W, Math.max(0, i))];
  let tris = 0;
  for (let tj = 0; tj < H; tj += TILE) for (let ti = 0; ti < W; ti += TILE) {
    const local = new Map(), pos = [], nor = [], colr = [], sol = [], idx = [];
    const vert = k => {
      let v = local.get(k); if (v !== undefined) return v;
      const i = k % cols, j = (k - i) / cols, [x, z] = at(i, j), nx = -(hAt(i + 1, j) - hAt(i - 1, j)) / (2 * RES), nz = -(hAt(i, j + 1) - hAt(i, j - 1)) / (2 * RES), l = Math.hypot(nx, 1, nz);
      v = pos.length / 3; local.set(k, v); pos.push(x, hgt[k], z); nor.push(nx / l, 1 / l, nz / l); colr.push(col[k * 3], col[k * 3 + 1], col[k * 3 + 2]); sol.push(soilW[k]);
      return v;
    };
    const jEnd = Math.min(H, tj + TILE), iEnd = Math.min(W, ti + TILE), SK = 4, covered = new Uint8Array(TILE * TILE); // (SK: out on the floor, hazed to a flat colour and never seen, 4 x 4 cells are one quad)
    for (let j = tj; j < jEnd; j++) for (let i = ti; i < iEnd; i++) {
      if (covered[(j - tj) * TILE + (i - ti)]) continue;
      if ((j - tj) % SK === 0 && (i - ti) % SK === 0 && j + SK <= jEnd && i + SK <= iEnd) { // a block of the deep floor?
        let lo = 1e9; for (let jj = j; jj <= j + SK; jj++) for (let ii = i; ii <= i + SK; ii++) lo = Math.min(lo, dist[jj * cols + ii]);
        if (lo > RUN + 2) { const a = j * cols + i, b = a + SK, c = a + SK * cols, d = c + SK, va = vert(a), vb = vert(b), vc = vert(c), vd = vert(d); idx.push(va, vc, vb, vb, vc, vd); for (let jj = 0; jj < SK; jj++) for (let ii = 0; ii < SK; ii++) covered[(j - tj + jj) * TILE + (i - ti + ii)] = 1; continue; }
      }
      const a = j * cols + i, b = a + 1, c = a + cols, d = c + 1;
      if (Math.max(dist[a], dist[b], dist[c], dist[d]) < -FOOT) continue;
      const va = vert(a), vb = vert(b), vc = vert(c), vd = vert(d); idx.push(va, vc, vb, vb, vc, vd);
    }
    if (!idx.length) continue;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(colr, 3)); g.setAttribute('soil', new THREE.Float32BufferAttribute(sol, 1)); g.setIndex(idx);
    g.computeBoundingSphere(); g.computeBoundingBox();
    const m = new THREE.Mesh(g, mat); m.castShadow = false; m.receiveShadow = true; group.add(m); tris += idx.length / 3; // (no shadows from the chasm: they would fall on nothing, and the shadow pass would draw all of it)
  }

  // --- boulders on the floor: angular rocks, big and small, in clumps; baked into one mesh per tile (colours carry the floor's darkness) ---
  let rocks = 0;
  {
    const nC = noise2(131 + P.seed), cand = [], STEP = 1.5;
    for (let j = 2; j < H - 2; j++) for (let i = 2; i < W - 2; i++) {
      const k = j * cols + i; if (dist[k] < RUN + 1 || (i % 2) || (j % 2)) continue;
      const [x, z] = at(i, j), g = smooth(.45, .7, nC(x * .12, z * .12)); // clumps
      if (g > 0 && rand() < g * .09) cand.push({ k, x, z });
    }
    for (let q = cand.length - 1; q > 0; q--) { const r = Math.floor(rand() * (q + 1)); [cand[q], cand[r]] = [cand[r], cand[q]]; }
    const base = new THREE.IcosahedronGeometry(1, 0), variants = [0, 1, 2, 3].map(() => {
      const g = base.clone(), p = g.attributes.position, seen = new Map(), key = n => [p.getX(n), p.getY(n), p.getZ(n)].map(v => v.toFixed(3)).join();
      for (let n = 0; n < p.count; n++) { const kk = key(n); if (!seen.has(kk)) seen.set(kk, [.62 + rand() * .76, .62 + rand() * .76, .62 + rand() * .76]); const s = seen.get(kk); p.setXYZ(n, p.getX(n) * s[0], p.getY(n) * s[1], p.getZ(n) * s[2]); }
      g.computeVertexNormals(); return g; // (not indexed: each face keeps its own normal, so it stays angular)
    });
    const buckets = new Map(), mtx = new THREE.Matrix4(), q4 = new THREE.Quaternion(), eu = new THREE.Euler(), pv = new THREE.Vector3(), sc = new THREE.Vector3(), v3 = new THREE.Vector3(), nm = new THREE.Matrix3();
    for (const c of cand.slice(0, P.boulders)) {
      const roll = rand(), size = roll < .08 ? 1.5 + rand() * 1.4 : roll < .4 ? .7 + rand() * .7 : .25 + rand() * .45, var_ = variants[Math.floor(rand() * variants.length)];
      const y = hgt[c.k] + size * .22, shade = (.7 + rand() * .45) * (1 - (1 - P.floorDark) * .92);
      mtx.compose(pv.set(c.x, y, c.z), q4.setFromEuler(eu.set((rand() - .5) * .8, rand() * 6.283, (rand() - .5) * .8)), sc.set(size, size * (.55 + rand() * .4), size * (.7 + rand() * .5))); nm.getNormalMatrix(mtx);
      const key = Math.floor((c.x - area.x0) / 24) * 1000 + Math.floor((c.z - area.z0) / 24); let b = buckets.get(key); if (!b) buckets.set(key, b = { pos: [], nor: [], col: [] });
      const pa = var_.attributes.position, na = var_.attributes.normal, tint = STRATA_TINT[Math.floor(rand() * STRATA_TINT.length)];
      for (let n = 0; n < pa.count; n++) {
        v3.fromBufferAttribute(pa, n).applyMatrix4(mtx); b.pos.push(v3.x, v3.y, v3.z); v3.fromBufferAttribute(na, n).applyMatrix3(nm).normalize(); b.nor.push(v3.x, v3.y, v3.z);
        b.col.push(tint[0] / 255 * shade, tint[1] / 255 * shade, tint[2] / 255 * shade * 1.06);
      }
      rocks++;
    }
    for (const b of buckets.values()) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(b.nor, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(b.col, 3)); g.computeBoundingSphere();
      const m = new THREE.Mesh(g, mat); m.castShadow = false; m.receiveShadow = true; group.add(m); tris += b.pos.length / 9;
    }
  }
  // --- bare trees growing out of the wall: a gnarled trunk out of a crack in the rock, curving up toward the light, a few dead branches; no leaves; baked per block, in the haze with the wall ---
  let treeCount = 0;
  if (P.trees > 0) {
    const nT = noise2(167 + P.seed), cand = [], bark = [[.34, .27, .2], [.28, .23, .19], [.4, .32, .24], [.3, .26, .22]];
    for (let j = 3; j < H - 3; j += 2) for (let i = 3; i < W - 3; i += 2) {
      const k = j * cols + i, y = hgt[k]; if (y > -2.2 || y < -11) continue;
      const gx = (hgt[k + 1] - hgt[k - 1]) / (2 * RES), gz = (hgt[k + cols] - hgt[k - cols]) / (2 * RES), steep = Math.hypot(gx, gz); if (steep < 1.2) continue; // (only where the wall is steep)
      const [x, z] = at(i, j); if (avoid?.(x, z)) continue;
      const g = smooth(.4, .65, nT(x * .08, z * .08)); if (g > 0 && rand() < g * .3 * (gz < 0 ? 2.6 : 1)) cand.push({ x: x + (rand() - .5) * 1.5, z: z + (rand() - .5) * 1.5, y, ox: -gx / steep, oz: -gz / steep });
    }
    for (let q = cand.length - 1; q > 0; q--) { const r = Math.floor(rand() * (q + 1)); [cand[q], cand[r]] = [cand[r], cand[q]]; }
    const blocks = new Map(), UP = new THREE.Vector3(0, 1, 0), tmp = new THREE.Vector3();
    // a tapering tube along a curve, appended to a block's arrays
    const tube = (b, curve, r0, r1, col, seg = 6, rad = 5) => {
      const base = b.pos.length / 3, pts = curve.getPoints(seg);
      pts.forEach((pt, n) => {
        const t = n / seg, T = curve.getTangent(Math.min(1, t)), A = (Math.abs(T.y) > .9 ? new THREE.Vector3(1, 0, 0) : UP).clone().cross(T).normalize(), B = T.clone().cross(A).normalize(), r = r0 + (r1 - r0) * t;
        for (let a = 0; a < rad; a++) {
          const th = a / rad * Math.PI * 2, dx = Math.cos(th), dy = Math.sin(th), nx = A.x * dx + B.x * dy, ny = A.y * dx + B.y * dy, nz = A.z * dx + B.z * dy;
          b.pos.push(pt.x + nx * r, pt.y + ny * r, pt.z + nz * r); b.nor.push(nx, ny, nz); const sh = .85 + rand() * .3; b.col.push(col[0] * sh, col[1] * sh, col[2] * sh);
        }
      });
      for (let n = 0; n < seg; n++) for (let a = 0; a < rad; a++) { const a2 = (a + 1) % rad, v0 = base + n * rad + a, v1 = base + n * rad + a2, v2 = base + (n + 1) * rad + a, v3 = base + (n + 1) * rad + a2; b.idx.push(v0, v2, v1, v1, v2, v3); }
    };
    const taken = new Map(), SPACE = 3.6; // (no two closer than this: no lines of them)
    const free = c => { const cx = Math.floor(c.x / SPACE), cz = Math.floor(c.z / SPACE); for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) for (const o of taken.get((cx + dx) + ',' + (cz + dz)) ?? []) if (Math.hypot(o.x - c.x, o.z - c.z) < SPACE) return false; const k = cx + ',' + cz; (taken.get(k) ?? taken.set(k, []).get(k)).push(c); return true; };
    for (const c of cand) {
      if (treeCount >= P.trees) break; if (!free(c)) continue;
      const key = Math.floor((c.x - area.x0) / 24) * 1000 + Math.floor((c.z - area.z0) / 24); let b = blocks.get(key); if (!b) blocks.set(key, b = { pos: [], nor: [], col: [], idx: [] });
      const big = rand() < .3, len = (1.6 + rand() * 2.2) * (big ? 1.4 : 1), r0 = (.17 + rand() * .16) * (big ? 1.3 : 1), col = bark[Math.floor(rand() * bark.length)];
      const lean = (rand() - .5) * 1.3, ca = Math.cos(lean), sa = Math.sin(lean), ox = c.ox * ca - c.oz * sa, oz = c.ox * sa + c.oz * ca; // (the trunk leans off the wall's normal, along it too)
      const out = new THREE.Vector3(ox, 0, oz), side = new THREE.Vector3(-oz, 0, ox);
      const root = new THREE.Vector3(c.x, c.y, c.z).addScaledVector(out, -.35);
      const bend = (rand() - .5) * 1.4, up = .1 + rand() * .55, P1 = root.clone().addScaledVector(out, len * .4).addScaledVector(side, bend * .3).addScaledVector(UP, len * .03), P2 = root.clone().addScaledVector(out, len * .75).addScaledVector(side, bend * .8).addScaledVector(UP, len * up * .5), P3 = root.clone().addScaledVector(out, len * (.9 + rand() * .2)).addScaledVector(side, bend * 1.2).addScaledVector(UP, len * up);
      const trunk = new THREE.CatmullRomCurve3([root, P1, P2, P3]);
      tube(b, trunk, r0, r0 * .3, col, 7, 5);
      for (let n = 0, nb = 3 + Math.floor(rand() * 4); n < nb; n++) { // dead branches, fanning out from the trunk in all directions (they must read from above)
        const t = .25 + rand() * .7, at0 = trunk.getPoint(t), T = trunk.getTangent(t), phi = (rand() - .5) * 2.6, dir = out.clone().multiplyScalar(Math.cos(phi) * .6).addScaledVector(side, Math.sin(phi)).addScaledVector(T, .3).addScaledVector(UP, .1 + rand() * .45).normalize(), bl = (.7 + rand() * 1.2) * (big ? 1.3 : 1), br = r0 * (.5 - t * .25);
        const mid = at0.clone().addScaledVector(dir, bl * .5).addScaledVector(side, (rand() - .5) * .3), end = at0.clone().addScaledVector(dir, bl).addScaledVector(UP, (rand() - .4) * .25);
        tube(b, new THREE.CatmullRomCurve3([at0, mid, end]), br, .02, col, 4, 4);
        if (rand() < .7) for (let f = 0, nf = 1 + Math.floor(rand() * 2); f < nf; f++) { // forks and twigs
          const tt = .4 + rand() * .5, p0 = new THREE.CatmullRomCurve3([at0, mid, end]).getPoint(tt), d2 = dir.clone().addScaledVector(side, (rand() < .5 ? -1 : 1) * (.5 + rand() * .7)).addScaledVector(UP, rand() * .3).normalize(), e2 = p0.clone().addScaledVector(d2, bl * (.35 + rand() * .3));
          tube(b, new THREE.CatmullRomCurve3([p0, p0.clone().lerp(e2, .5).addScaledVector(UP, .04), e2]), br * .5, .01, col, 3, 3);
        }
      }
      treeCount++;
    }
    const treeMat = hazeify(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: false, envMapIntensity: .1 }), U);
    for (const b of blocks.values()) {
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(b.nor, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(b.col, 3)); g.setIndex(b.idx); g.computeBoundingSphere();
      const m = new THREE.Mesh(g, treeMat); m.castShadow = true; m.receiveShadow = true; group.add(m); tris += b.idx.length / 3;
    }
  }
  console.log(`chasm: ${tris} triangles, ${rocks} boulders, ${treeCount} trees`);

  // --- the ground's cut-out: the ground shader samples the same distance field (8 bits over -4 .. +4 m, linearly filtered) and does not draw where it is inside the chasm ---
  const bytes = new Uint8Array(N);
  for (let k = 0; k < N; k++) bytes[k] = Math.round(Math.min(1, Math.max(0, (dist[k] + 4) / 8)) * 255);
  const distTex = new THREE.DataTexture(bytes, cols, H + 1, THREE.LuminanceFormat, THREE.UnsignedByteType);
  distTex.minFilter = distTex.magFilter = THREE.LinearFilter; distTex.generateMipmaps = false; distTex.needsUpdate = true;
  const GU = { uChasmD: { value: distTex }, uChasmRect: { value: new THREE.Vector4(area.x0, area.z0, RES, 0) }, uChasmDim: { value: new THREE.Vector2(cols, H + 1) } };
  const patchGround = sh => {
    Object.assign(sh.uniforms, GU);
    sh.vertexShader = 'varying vec2 vChasmXZ;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n\tvChasmXZ = ( modelMatrix * vec4( transformed, 1.0 ) ).xz;');
    sh.fragmentShader = `uniform sampler2D uChasmD; uniform vec4 uChasmRect; uniform vec2 uChasmDim;
varying vec2 vChasmXZ;
` + sh.fragmentShader.replace('#include <map_fragment>', `float chasmD = texture2D( uChasmD, ( ( vChasmXZ - uChasmRect.xy ) / uChasmRect.z + 0.5 ) / uChasmDim ).r * 8.0 - 4.0; // (the signed distance to the rim, m: + inside the chasm)
if ( chasmD > 0.0 ) discard; // over a chasm: no ground
#include <map_fragment>`);
  };
  // the surface's height under (x, z) (m, 0 or below): where things that fall into the chasm come to rest
  const surfaceAt = (x, z) => {
    const fx = (x - area.x0) / RES, fz = (z - area.z0) / RES; if (fx < 0 || fz < 0 || fx >= W || fz >= H) return 0;
    const i = Math.floor(fx), j = Math.floor(fz), tx = fx - i, tz = fz - j, h = (a, b) => hgt[b * cols + a];
    return Math.min(0, (h(i, j) * (1 - tx) + h(i + 1, j) * tx) * (1 - tz) + (h(i, j + 1) * (1 - tx) + h(i + 1, j + 1) * tx) * tz + .05);
  };
  return { group, surfaceAt, patchGround, ground: G, uniforms: { ...U, ...GU }, depth: P.depth + 6 }; // (the world's backdrop plane and the bridges' bodies sit this far down: below the floor's lowest humps, or the plane shows through as bright patches)
}
