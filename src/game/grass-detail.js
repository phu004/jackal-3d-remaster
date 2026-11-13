// Stage 4's grass, so the big meadow doesn't read as one tiled green: two layers.
//  patchGrass(sh, ...): the ground shader's grass look. Where the ground is green (not the mud, the cliff's dirt or bare earth) its colour is varied at several scales instead of
//    just tiling the detail texture: broad patches of lush dark green and dry straw, mid-size clumps, a fine blade streak, scattered bare-soil patches, and tiny wild flowers (white,
//    yellow, violet) among it.
//  buildGrassScatter(...): thousands of little tufts of blades (and a few stones, and the wild flowers) scattered over the meadow, thick in some places and sparse or bare in others, clumped, in three
//    sizes and a range of greens and straws, swaying a little in the wind. Everything is baked into 16 m blocks, each ONE static mesh per kind (tufts, flowers, stones) with its own tight bounds:
//    a few draw calls, and the blocks off screen are skipped, so little more than the screen's worth is drawn (the level's own chunking is coarser, 40 x 28 m). Instanced: the level's chunking (chunks.js) splits them into blocks that are culled, so only the screen's
//    worth is ever drawn. Kept off the swamp's mud and the cliffs' foot.
import * as THREE from 'three';

// LOW skips the ground's grass look altogether (setGrassDetail(false), from world.setLite): its noise is a lot of arithmetic on every green pixel, and a slow GPU feels it. A uniform, so the
// shader's branch skips the work with no recompile.
let grassDetail = true; const skipUniforms = [];
export function setGrassDetail(on) { grassDetail = on; for (const u of skipUniforms) u.value = on ? 0 : 1; }

// ---- the ground shader --------------------------------------------------------------------------------------------------------------------------------------------------------
export function patchGrass(sh, { WE, LE, off = '' }) { // off: ?grassoff=patches,soil,flowers,streaks,tufts switches parts off, to find which one looks wrong
  const on = k => off.split(',').includes(k) ? 0 : 1;
  sh.uniforms.uGrassSize = { value: new THREE.Vector2(WE, LE) };
  const skip = sh.uniforms.uGrassSkip = { value: grassDetail ? 0 : 1 }; skipUniforms.push(skip);
  sh.uniforms.uGrassOn = { value: new THREE.Vector4(on('patches'), on('soil'), on('flowers'), on('streaks')) };
  sh.fragmentShader = `uniform vec2 uGrassSize;
uniform vec4 uGrassOn;
uniform float uGrassSkip;
float gH( vec2 p ) { return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453 ); }
float gN( vec2 p ) { vec2 i = floor( p ), f = fract( p ); f = f * f * ( 3.0 - 2.0 * f );
	return mix( mix( gH( i ), gH( i + vec2( 1.0, 0.0 ) ), f.x ), mix( gH( i + vec2( 0.0, 1.0 ) ), gH( i + vec2( 1.0, 1.0 ) ), f.x ), f.y ); }
` + sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
	{
		vec3 gc = diffuseColor.rgb;
		float gate = smoothstep( 0.02, 0.10, gc.g - max( gc.r, gc.b ) * 1.05 ); // (grass only: not the mud, the cliff's dirt or bare ground)
		if ( gate > 0.001 && uGrassSkip < 0.5 ) {
			vec2 gp = vUv * uGrassSize; // metres
			float a1 = gN( gp * 0.03 + 3.0 ), a2 = gN( gp * 0.09 + 11.0 ), a3 = gN( gp * 0.33 + 5.0 ), a4 = gN( gp * 1.5 ), a5 = gN( gp * 5.7 + 9.0 );
			vec3 g = gc;
			g = mix( g, vec3( 0.40, 0.46, 0.18 ), smoothstep( 0.58, 0.85, a1 ) * 0.3 * uGrassOn.x );                                  // broad patches of dry straw
			g *= mix( vec3( 1.0 ), vec3( 0.8, 0.9, 0.78 ), smoothstep( 0.5, 0.82, a2 * 0.7 + a1 * 0.3 ) * 0.5 * uGrassOn.x );       // and of lush, darker grass
			g *= mix( vec3( 1.0 ), vec3( 0.95, 1.06, 0.9 ), smoothstep( 0.55, 0.8, gN( gp * 0.14 + 40.0 ) ) * 0.4 * uGrassOn.x );      // fresher yellow-green here and there
			g *= 0.92 + 0.16 * a3;                                                                                         // clumps, a few metres across
			g *= mix( 1.0, 0.94 + 0.12 * gN( vec2( gp.x * 8.0, gp.y * 2.6 ) + a3 * 3.0 ), uGrassOn.w );                                          // a fine streak of blades
			g *= mix( 1.0, 0.96 + 0.08 * a5, uGrassOn.w );
			float soil = smoothstep( 0.8, 0.88, gN( gp * 0.17 + 70.0 ) * 0.6 + a4 * 0.4 ) * 0.35 * uGrassOn.y;                          // scattered patches of bare earth
			g = mix( g, vec3( 0.36, 0.28, 0.17 ) * ( 0.8 + 0.4 * a5 ), soil );
			// (the tiny wild flowers that were computed here were multiplied by 0 since the real ones became instanced geometry, see buildGrassScatter: removed, they cost every grass pixel several hashes for nothing)
			diffuseColor.rgb = mix( gc, g, gate );
		}
	}`);
}

// ---- the tufts ----------------------------------------------------------------------------------------------------------------------------------------------------------------
// A tuft: n blades, each a tapering triangle leaning out from the base, dark green at the root, paler at the tip.
function tuftGeometry(seed, n, height) {
  let s = seed * 9301 + 49297; const rnd = () => (s = (s * 9301 + 49297) % 233280) / 233280;
  const pos = [], nor = [], col = [];
  for (let i = 0; i < n; i++) {
    const a = rnd() * 6.283, r = rnd() * .06, bx = Math.cos(a) * r, bz = Math.sin(a) * r, h = height * (.55 + rnd() * .6), w = .04 + rnd() * .045, lean = .05 + rnd() * .16, ta = a + (rnd() - .5) * 1.2;
    const sx = -Math.sin(ta) * w, sz = Math.cos(ta) * w, tx = bx + Math.cos(ta) * lean * h * 2.2, tz = bz + Math.sin(ta) * lean * h * 2.2, k = .8 + rnd() * .4;
    pos.push(bx - sx, 0, bz - sz, bx + sx, 0, bz + sz, tx, h, tz);
    for (let v = 0; v < 3; v++) nor.push(0, 1, 0); // (lit as if the blades faced up: soft, no hard facets)
    col.push(.2 * k, .36 * k, .13 * k, .2 * k, .36 * k, .13 * k, .34 * k, .5 * k, .2 * k);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeBoundingSphere();
  return g;
}

// A wild flower: a thin green stem and a flat head just above it, tilted a little by its instance. kind: 'daisy' (white petals round a yellow eye), 'buttercup' (five broad yellow
// petals), 'dandelion' (a full yellow puff), 'clover' (a small white ball). The heads are drawn larger than life (the camera is high): about 12-20 cm across.
function flowerGeometry(kind) {
  const pos = [], col = [], tri = (a, b, c, ca, cb = ca, cc = ca) => { pos.push(...a, ...b, ...c); col.push(...ca, ...cb, ...cc); };
  const stem = [.2, .38, .12], H = kind === 'dandelion' ? .2 : kind === 'clover' ? .1 : kind === 'lace' ? .3 : .24;
  tri([-.008, 0, 0], [.008, 0, 0], [0, H, 0], [.14, .26, .08], [.14, .26, .08], stem);
  const ring = (n, r0, r1, halfW, rot, c0, c1) => { for (let i = 0; i < n; i++) { const a = rot + i / n * 6.283, ca = Math.cos(a), sa = Math.sin(a), px = -sa, pz = ca; tri([ca * r0 + px * halfW * .5, H, sa * r0 + pz * halfW * .5], [ca * r0 - px * halfW * .5, H, sa * r0 - pz * halfW * .5], [ca * r1, H + .012, sa * r1], c0, c0, c1); } };
  const disc = (n, r, y, c0, c1, cx = 0, cz = 0) => { for (let i = 0; i < n; i++) { const a = i / n * 6.283, b = (i + 1) / n * 6.283; tri([cx, y, cz], [cx + Math.cos(a) * r, y, cz + Math.sin(a) * r], [cx + Math.cos(b) * r, y, cz + Math.sin(b) * r], c0, c1, c1); } };
  if (kind === 'daisy') { ring(9, .035, .1, .06, 0, [.82, .82, .7], [.98, .98, .95]); disc(6, .045, H + .018, [.98, .8, .1], [.9, .62, .05]); }
  else if (kind === 'buttercup') { ring(5, .02, .085, .11, .3, [.9, .62, .05], [1, .86, .12]); disc(6, .03, H + .014, [.8, .5, .04], [.95, .7, .08]); }
  else if (kind === 'dandelion') { ring(12, .02, .095, .052, 0, [.9, .62, .04], [1, .84, .1]); ring(7, .01, .06, .07, .2, [.95, .75, .06], [1, .92, .25]); }
  else if (kind === 'anemone') { ring(6, .02, .09, .13, .2, [.86, .86, .8], [1, 1, 1]); disc(6, .022, H + .014, [.9, .85, .4], [.95, .9, .55]); } // (a few broad white petals round a pale eye)
  else if (kind === 'chamomile') { ring(13, .035, .1, .046, 0, [.84, .84, .78], [1, 1, 1]); disc(6, .042, H + .022, [.98, .84, .12], [.92, .68, .06]); } // (many thin petals round a raised yellow dome)
  else if (kind === 'lace') { disc(5, .028, H, [.92, .94, .9], [1, 1, 1]); for (let i = 0; i < 6; i++) { const a = i / 6 * 6.283; disc(4, .034, H - .005 + (i % 2) * .008, [.9, .92, .88], [1, 1, 1], Math.cos(a) * .075, Math.sin(a) * .075); } } // (a flat head of tiny white florets, like Queen Anne's lace)
  else if (kind === 'star') { ring(6, .008, .105, .04, .5, [.9, .92, .8], [1, 1, 1]); disc(5, .02, H + .014, [.8, .85, .35], [.9, .9, .5]); } // (six narrow pointed petals)
  else { disc(8, .06, H, [.9, .92, .86], [.97, .98, .95]); disc(5, .03, H + .02, [.85, .9, .8], [.98, .99, .96]); }
  const g = new THREE.BufferGeometry(), nor = new Float32Array(pos.length); for (let i = 1; i < nor.length; i += 3) nor[i] = 1;
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeBoundingSphere();
  return g;
}

// area: { x0, x1, z0, z1 }; tileAt(x, z) -> the map's tile ('.' = plain grass); heightAt(x, z). Returns { update(dt) }.
export function buildGrassScatter(scene, { area, tileAt, heightAt, off = '', noFlowers = [], mines = [], skip = null, patches = [], thin = [], dry = false }) { // noFlowers: [{ x0, x1, z0, z1 }] rectangles (m) where no wild flowers grow (the village inside its walls); mines: [{ x, z }] (m): thick flowers round each, bare ground on the spot
  if (off.split(',').includes('tufts')) return { update() {}, count: 0 };
  let sd = 2024; const rnd = () => (sd = (sd * 9301 + 49297) % 233280) / 233280;
  const hash = (x, y) => { let h = Math.imul(x, 374761393) + Math.imul(y, 668265263); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
  const noise = (x, y) => { const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy); const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1); return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v; };
  const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const ring = []; for (let i = 0; i < 8; i++) ring.push([Math.cos(i * .785) * 2.6, Math.sin(i * .785) * 2.6]);
  const grassAt = (x, z) => tileAt(x, z) === '.' && ring.every(([dx, dz]) => tileAt(x + dx, z + dz) === '.'); // (away from the swamp's edge and the cliffs' foot)
  const MINE_BARE = 1.3, MINE_FIELD_IN = 6, MINE_FIELD_OUT = 11; // m: nothing grows this close to a mine; the flower field is full to the first distance and fades out by the second
  // (in a mine's flower field the flowers may grow right up to a wall or cliff: grassAt keeps 2.6 m clear of them, which left the field half-empty where a mine stands by the village wall)
  const mineDist = (x, z) => mines.reduce((d, mn) => Math.min(d, Math.hypot(mn.x - x, mn.z - z)), 1e9);
  const CELL = dry ? 1.05 : 1.5, sizes = [.44, .66, 1.0], lists = sizes.map(() => []), stones = [];
  for (let z = area.z0; z < area.z1; z += CELL) for (let x = area.x0; x < area.x1; x += CELL) {
    const px = x + rnd() * CELL, pz = z + rnd() * CELL;
    if (!grassAt(px, pz) || (mines.length && mineDist(px, pz) < MINE_BARE) || skip?.(px, pz)) continue; // (the mine's own spot: bare)
    const dens = .17 + .7 * smooth(.3, .62, noise(px * .045 + 5, pz * .045)); // (thick in some places, sparse or bare in others)
    if (rnd() > dens) continue;
    if (dry) { // the NES map's dirt has no grass: it is pocked all over with small rounded pebbles, lone ones and little groups
      const n = noise(px * .3, pz * .3 + 9) > .6 ? 2 + Math.floor(rnd() * 3) : 1;
      for (let c = 0; c < n; c++) stones.push({ x: px + (c ? (rnd() - .5) * .9 : 0), z: pz + (c ? (rnd() - .5) * .9 : 0), s: .05 + Math.pow(rnd(), 2.2) * .2, yaw: rnd() * 6.283 });
      continue;
    }
    const clump = noise(px * .3, pz * .3 + 9) > .62 ? 2 + Math.floor(rnd() * 3) : 1; // (some in little clusters)
    for (let c = 0; c < clump; c++) {
      const tx = px + (rnd() - .5) * 1.1 * (c ? 1 : 0), tz = pz + (rnd() - .5) * 1.1 * (c ? 1 : 0), roll = rnd(), size = roll < .55 ? 0 : roll < .92 ? 1 : 2;
      lists[size].push({ x: tx, z: tz, s: .8 + rnd() * .5, yaw: rnd() * 6.283, tone: rnd() });
    }
    if (rnd() < (dry ? .1 : .05)) stones.push({ x: px, z: pz, s: .07 + Math.pow(rnd(), 2) * .2, yaw: rnd() * 6.283 });
  }
  const U = { value: 0 };
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, side: THREE.DoubleSide, envMapIntensity: .1 });
  const lit = THREE.ShaderChunk.normal_fragment_begin.replace('gl_FrontFacing ? 1.0 : - 1.0', '1.0'); // (a double-sided blade seen from behind would get its normal flipped to point down, and be lit by the dark ground colour of the sky light: they are all lit as if facing up, from either side)
  mat.onBeforeCompile = sh => { // the blades sway a little, more toward their tips
    sh.uniforms.uTime = U;
    sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>', lit);
    sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
	float sw = clamp( position.y * 2.4, 0.0, 1.0 );
	float ph = position.x * 0.6 + position.z * 0.9; // (baked in world coordinates: the phase follows where it stands)
	transformed.x += ( sin( uTime * 1.6 + ph ) * 0.05 + sin( uTime * 3.1 + ph * 1.7 ) * 0.015 ) * sw;
	transformed.z += cos( uTime * 1.3 + ph ) * 0.035 * sw;`);
  };
  const tints = dry ? [[2, 1.3, 1.2], [2.2, 1.4, 1.1], [1.7, 1.2, 1.3], [2.1, 1.25, 1.5], [1.85, 1.35, 1]] : [[1, 1, 1], [1.2, 1.08, .85], [.9, 1, .9], [1.1, 1.05, .8], [.95, 1.04, .92]]; // (greens and straws; dry: the Texas stage's sun-baked straw)

  // wild flowers: in drifts (a slow noise gates where they grow), each drift mostly one colour: white ones (daisies, clover) or yellow ones (buttercups, dandelions), a few of the other
  const kinds = ['daisy', 'buttercup', 'dandelion', 'clover', 'anemone', 'chamomile', 'lace', 'star'], fl = kinds.map(() => []), FC = 1.1;
  const WHITES = [[0, .22], [3, .12], [4, .2], [5, .2], [6, .14], [7, .12]], YELLOWS = [[1, .5], [2, .5]];
  const pick = list => { let r = rnd(); for (const [k, w] of list) { if ((r -= w) < 0) return k; } return list[0][0]; };
  const whiteTints = [[1, 1, 1], [1, .97, .88], [1, .93, .95], [.95, .98, 1], [1, 1, .94]]; // (white, cream, a blush of pink, cool, a hint of yellow)
  for (let z = area.z0; z < area.z1; z += FC) for (let x = area.x0; x < area.x1; x += FC) {
    const px = x + rnd() * FC, pz = z + rnd() * FC, md = mines.length ? mineDist(px, pz) : 1e9, mf = 1 - smooth(MINE_FIELD_IN, MINE_FIELD_OUT, md), pf = patches.reduce((m, q) => Math.max(m, q.k * (1 - smooth(q.r * .35, q.r, Math.hypot(q.x - px, q.z - pz)))), 0), field = Math.max(mf, pf); // (field: 1 in a mine's flower field, 0 away from it; pf: a gentler patch of flowers where the stage data asks for one)
    const drift = Math.max(smooth(.5, .72, noise(px * .055 + 80, pz * .055 + 3)), field);
    if (drift <= 0 || rnd() > Math.max(.22 * drift + .004, .95 * field) || !(field > .05 ? tileAt(px, pz) === '.' : grassAt(px, pz)) || md < MINE_BARE + .2 || skip?.(px, pz) || noFlowers.some(r => px > r.x0 && px < r.x1 && pz > r.z0 && pz < r.z1)) continue;
    const white = field > .3 ? rnd() < .5 : noise(px * .035 + 200, pz * .035) > .5; // (in the field, white and yellow mixed, like a meadow in bloom)
    for (let i = 0, n = 2 + Math.floor(rnd() * 5) + Math.round(field * 5); i < n; i++) {
      const fx = px + (rnd() - .5) * 1.3, fz = pz + (rnd() - .5) * 1.3, r = rnd();
      if (mines.length && mineDist(fx, fz) < MINE_BARE) continue;
      if (skip?.(fx, fz)) continue;
      const kind = r < .9 ? pick(white ? WHITES : YELLOWS) : pick(white ? YELLOWS : WHITES); // (a drift is mostly one colour, a tenth the other)
      fl[kind].push({ x: fx, z: fz, s: (1.2 + rnd() * .55) * .8, tint: kind === 1 || kind === 2 ? [1, 1, 1] : whiteTints[Math.floor(rnd() * whiteTints.length)], yaw: rnd() * 6.283, tx: (rnd() - .5) * .4, tz: (rnd() - .5) * .4 });
    }
  }
  const flowerMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, side: THREE.DoubleSide, envMapIntensity: .1, emissive: 0x1a1a0a });
  flowerMat.onBeforeCompile = sh => { sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>', lit); }; // (lit like the blades, but they stand still: no sway)
  const stoneMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true, envMapIntensity: .15 });

  // ---- bake it all into BLOCK-metre blocks: for each, one mesh of tufts, one of flowers, one of stones (a few draw calls), with exact bounds so a block off screen is skipped.
  const BLOCK = 16, blocks = new Map(), m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), sc = new THREE.Vector3(), v = new THREE.Vector3(), nm = new THREE.Matrix3();
  const bucket = (x, z, kind) => {
    const key = Math.floor((x - area.x0) / BLOCK) + ',' + Math.floor((z - area.z0) / BLOCK), b = blocks.get(key) ?? blocks.set(key, {}).get(key);
    return b[kind] ?? (b[kind] = { pos: [], nor: [], col: [] });
  };
  const bake = (dst, geo, tint) => { // geo transformed by m (its normals by the rotation), its vertex colours (or the plain tint) times the tint
    nm.getNormalMatrix(m); const pa = geo.attributes.position, na = geo.attributes.normal, ca = geo.attributes.color, idx = geo.index, count = idx ? idx.count : pa.count;
    for (let i = 0; i < count; i++) {
      const j = idx ? idx.getX(i) : i;
      v.fromBufferAttribute(pa, j).applyMatrix4(m); dst.pos.push(v.x, v.y, v.z);
      v.fromBufferAttribute(na, j).applyMatrix3(nm).normalize(); dst.nor.push(v.x, v.y, v.z);
      if (ca) dst.col.push(ca.getX(j) * tint[0], ca.getY(j) * tint[1], ca.getZ(j) * tint[2]); else dst.col.push(tint[0], tint[1], tint[2]);
    }
  };
  // (thin: [{ x0, x1, z0, z1, keep }] regions where only a share `keep` of the tufts, stones and flowers is kept, picked by a hash of where each stands, so the rest of the scatter is unchanged: fewer triangles where the railway and the village are)
  const keepIt = (x, z) => thin.every(r => !(x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1) || hash(Math.floor(x * 37), Math.floor(z * 37)) < r.keep);
  const tuftG = sizes.map((h, si) => tuftGeometry(si + 1, 6 + si * 2, h));
  lists.forEach((list, si) => list.forEach(t => {
    if (!keepIt(t.x, t.z)) return;
    m.compose(p.set(t.x, heightAt(t.x, t.z) - .01, t.z), q.setFromEuler(e.set(0, t.yaw, 0)), sc.set(t.s, t.s, t.s));
    bake(bucket(t.x, t.z, 'tuft'), tuftG[si], tints[Math.floor(t.tone * tints.length)]);
  }));
  const stoneG = new THREE.IcosahedronGeometry(1, 0);
  const stoneVars = !dry ? [stoneG] : [0, 1, 2, 3].map(() => { // dry: angular broken stones: an icosahedron with each corner pushed about, flat-faced, a few of them
    const g = stoneG.clone(), pa = g.attributes.position, seen = new Map(), key = n => [pa.getX(n), pa.getY(n), pa.getZ(n)].map(v => v.toFixed(3)).join();
    for (let n = 0; n < pa.count; n++) { const kk = key(n); if (!seen.has(kk)) seen.set(kk, [.7 + rnd() * .6, .6 + rnd() * .5, .7 + rnd() * .6]); const f = seen.get(kk); pa.setXYZ(n, pa.getX(n) * f[0], pa.getY(n) * f[1], pa.getZ(n) * f[2]); }
    g.computeVertexNormals(); return g; // (not indexed: every face keeps its own normal)
  });
  for (const t of stones) {
    if (!keepIt(t.x, t.z)) continue;
    m.compose(p.set(t.x, heightAt(t.x, t.z) + t.s * .12, t.z), q.setFromEuler(e.set(rnd() * .4, t.yaw, rnd() * .4)), sc.set(t.s * 1.2, t.s * .55, t.s)); const g = .55 + rnd() * .35;
    if (dry) { m.compose(p.set(t.x, heightAt(t.x, t.z) + t.s * .05, t.z), q.setFromEuler(e.set((rnd() - .5) * .5, t.yaw, (rnd() - .5) * .5)), sc.set(t.s * (1 + rnd() * .4), t.s * (.55 + rnd() * .35), t.s * (.8 + rnd() * .4))); const k = .36 + rnd() * .34, w = rnd() * .06; bake(bucket(t.x, t.z, 'stone'), stoneVars[Math.floor(rnd() * 4)], [k * (1 + w), k * .97, k * (.92 - w)]); continue; } // (neutral greys, a touch warm, no pale shell tones)
    bake(bucket(t.x, t.z, 'stone'), stoneG, [g * .9, g * .86, g * .78]);
  }
  let flowers = 0;
  if (!dry && !off.split(',').includes('flowers')) { // (dry: no meadow flowers)
    const flowerG = kinds.map(flowerGeometry);
    fl.forEach((list, ki) => list.forEach(t => {
      if (!keepIt(t.x, t.z)) return;
      m.compose(p.set(t.x, heightAt(t.x, t.z) - .01, t.z), q.setFromEuler(e.set(t.tx, t.yaw, t.tz)), sc.set(t.s, t.s, t.s)); flowers++;
      bake(bucket(t.x, t.z, 'flower'), flowerG[ki], t.tint);
    }));
  }
  const mats = { tuft: mat, flower: flowerMat, stone: stoneMat };
  for (const b of blocks.values()) for (const [kind, d] of Object.entries(b)) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(d.pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(d.nor, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(d.col, 3));
    g.computeBoundingSphere();
    const mesh = new THREE.Mesh(g, mats[kind]); mesh.name = 'grass'; mesh.userData.noWater = true; // (named: chunks.js leaves it; noWater: no reflection copies, see sortIntoWaterLayers)
    mesh.castShadow = false; mesh.receiveShadow = kind === 'stone'; mesh.frustumCulled = true; scene.add(mesh);
  }
  return { update(dt) { U.value += dt; }, count: lists.reduce((n, l) => n + l.length, 0), flowers };
}
