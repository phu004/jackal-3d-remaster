// Pine and spruce trees of a cold landscape, built to the same standard as the bushes (bush.js): real tapered trunks and branches, and the foliage as alpha-cut cards painted with
// sprigs of individual needles (some of them snow-laden), hung along each branch and lying nearly flat so the crown looks full from above. Lighting is baked into the vertex colours
// (dark inside, bright on the outside and top), the normals are blended toward a rounded crown, and the foliage sways in the same wind as the bushes. Every tree is under 2000 triangles.
//
// Variants (PINE_VARIANTS): 'spruce' (tall, narrow, many whorls), 'fir' (broad, full, drooping boughs), 'scots' (tall, bare reddish trunk, a few ragged clumps of boughs up top), 'young' (a small sapling).
// Metres: 2.8 to 10.5 m tall, 2.2 to 4.4 m across. Origin on the ground at the foot of the trunk.
//
//   buildPine(variant, seed, { snow })   one tree (a Group with `foliage` and `wood` meshes); the same seed gives the same tree every run; snow: 0 none .. 1 heavily loaded (default .6)
//   pineTriangles(object)                triangle count of a tree (instances counted)
import * as THREE from 'three';
import { bushWind } from './bush.js';

export const PINE_VARIANTS = ['spruce', 'fir', 'scots', 'young'];
const BUDGET = 1990;
const PI = Math.PI, V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z), lerp = (a, b, t) => a + (b - a) * t, clamp01 = x => Math.min(1, Math.max(0, x));
const ss = (a, b, x) => { const k = clamp01((x - a) / (b - a)); return k * k * (3 - 2 * k); };
const seeded = seed => { let s = (Math.floor(seed) * 9301 + 49297) % 233280 || 1; return () => (s = (s * 9301 + 49297) % 233280) / 233280; };

// ---------------------------------------------------------------- the needle sprays: one atlas, a green sprig on the left half and the same sprig loaded with snow on the right
const rgb = a => 'rgb(' + a.map(v => Math.max(0, Math.min(255, Math.round(v)))).join(',') + ')';
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
function needle(x, bx, by, ex, ey, w, c) { // one tapered needle: a thin curved blade, broad at its base and fine at the tip, so the silhouette is feathery and sharp, not a row of uniform strokes
  const dx = ex - bx, dy = ey - by, l = Math.hypot(dx, dy) || 1, nx = -dy / l, ny = dx / l, cx = bx + dx * .5 + nx * l * .06, cy = by + dy * .5 + ny * l * .06;
  x.fillStyle = rgb(c); x.beginPath(); x.moveTo(bx + nx * w * .5, by + ny * w * .5); x.quadraticCurveTo(cx + nx * w * .32, cy + ny * w * .32, ex, ey); x.quadraticCurveTo(cx - nx * w * .32, cy - ny * w * .32, bx - nx * w * .5, by - ny * w * .5); x.closePath(); x.fill();
}
function paintSprig(x, ox, snowy, rnd, heavy = false) { // heavy: far more snow, in finer pieces: many small clumps and a fine dusting of flakes over the needles themselves   // drawn at 256 x 256 per sprig (the canvas is twice that, scaled up, so the needles are finer)
  const W = 256, H = 256, cx = ox + W / 2, dark = [32, 78, 40], mid = [68, 128, 58], light = [130, 186, 96];
  x.lineCap = 'round';
  x.strokeStyle = 'rgb(62,44,30)'; x.lineWidth = 4.2; x.beginPath(); x.moveTo(cx, H - 2); x.quadraticCurveTo(cx + 6, H * .5, cx, 10); x.stroke();
  for (let k = 0; k < 7; k++) { const t = .12 + k * .12, y = H - 6 - t * (H - 22), sd = k % 2 ? 1 : -1; x.strokeStyle = 'rgb(70,50,34)'; x.lineWidth = 2; x.beginPath(); x.moveTo(cx, y); x.quadraticCurveTo(cx + sd * 22, y - 14, cx + sd * (50 + rnd() * 16), y - 34 - rnd() * 12); x.stroke(); } // (little side shoots)
  const layer = (n, aMin, aMax, lenK, cA, cB, w, skip) => { // a layer of needles along the stem and the side shoots: pairs fanning out and forward
    for (let k = 0; k < n; k++) {
      const t = k / (n - 1), y = H - 12 - t * (H - 26), L = 120 * lenK * (1 - .5 * t) * (.78 + rnd() * .44), tx = cx + Math.sin(t * 3) * 3;
      for (const sd of [-1, 1]) for (let f = -1; f <= 1; f++) {
        if (rnd() < skip) continue;
        const a = (aMin + (aMax - aMin) * rnd() + f * 9) * PI / 180, l = L * (f === 0 ? 1 : .8) * (.9 + rnd() * .2), ex = tx + sd * Math.sin(a) * l, ey = y - Math.cos(a) * l + l * .1;
        needle(x, tx, y, ex, ey, w * (.85 + rnd() * .3), mix(cA, cB, clamp01(t * .3 + rnd() * .55)));
      }
    }
  };
  layer(30, 38, 56, 1.05, dark, mid, 3.1, .12);              // the back layer: longer, darker, lying flatter: depth behind the front needles
  layer(46, 58, 78, 1.0, mid, light, 2.7, .1);               // the front layer: brighter, more upright, with bright tips
  for (let f = -2; f <= 2; f++) { const a = f * 17 * PI / 180, l = 36 + rnd() * 12; needle(x, cx, 24, cx + Math.sin(a) * l, 24 - Math.cos(a) * l, 3, mix(mid, light, .6)); } // (the tuft at the tip)
  for (let i = 0; i < 40; i++) { const t = rnd(), y = H - 12 - t * (H - 26), sd = rnd() < .5 ? -1 : 1, l = 14 + rnd() * 16, a = (50 + rnd() * 35) * PI / 180; needle(x, cx + sd * (4 + rnd() * 30 * (1 - t)), y, cx + sd * (4 + rnd() * 30 * (1 - t)) + sd * Math.sin(a) * l, y - Math.cos(a) * l, 2.3, mix(dark, mid, rnd())); } // (short needles filling the gaps)
  if (snowy) { // snow stuck along the sprig: soft-edged clumps lying on the upper side of the needles, bluish underneath, with the odd needle poking through
    const NC = heavy ? 34 : 13;
    for (let i = 0; i < NC; i++) {
      const t = .06 + .88 * (i + rnd() * .6) / NC, y = H - 12 - t * (H - 26), px = cx + (rnd() - .5) * (heavy ? 120 : 70) * (1 - .4 * t), rx = heavy ? 12 + rnd() * 16 * (1 - .3 * t) : 26 + rnd() * 24 * (1 - .3 * t), ry = heavy ? 5 + rnd() * 6 : 10 + rnd() * 9;
      const g = x.createRadialGradient(px, y - ry * .3, 1, px, y, Math.max(rx, ry)); g.addColorStop(0, 'rgba(252,253,255,1)'); g.addColorStop(.62, 'rgba(231,240,251,1)'); g.addColorStop(.88, 'rgba(186,206,230,1)'); g.addColorStop(1, 'rgba(170,196,224,0)');
      x.save(); x.translate(px, y); x.rotate((rnd() - .5) * .5); x.scale(rx / Math.max(rx, ry), ry / Math.max(rx, ry)); x.translate(-px, -y); x.fillStyle = g; x.beginPath(); x.arc(px, y, Math.max(rx, ry), 0, PI * 2); x.fill(); x.restore();
    }
    for (let i = 0; i < 16; i++) { const t = rnd(), y = H - 12 - t * (H - 26), sd = rnd() < .5 ? -1 : 1, a = (55 + rnd() * 18) * PI / 180, l = 30 + rnd() * 14; needle(x, cx + sd * 6, y, cx + sd * (6 + Math.sin(a) * l), y - Math.cos(a) * l + 6, 2.6, mix(mid, light, rnd())); }
    if (heavy) { // the fine snow: flakes and small caps stuck on the needles themselves (source-atop: only where a needle already is), so the whole sprig is frosted, not just clumped
      x.save(); x.beginPath(); x.rect(ox, 0, W, H); x.clip(); x.globalCompositeOperation = 'source-atop';
      for (let i = 0; i < 1500; i++) {
        const t = rnd(), y = H - 8 - t * (H - 20), px = cx + (rnd() + rnd() - 1) * 108 * (1 - .5 * t), r = .8 + rnd() * rnd() * 3.6, a = .55 + rnd() * .45;
        x.fillStyle = rnd() < .8 ? `rgba(250,252,255,${a})` : `rgba(205,222,243,${a})`; x.beginPath(); x.ellipse(px, y, r * 1.5, r, (rnd() - .5) * 1.2, 0, PI * 2); x.fill();
      }
      x.restore();
    }
  }
}
let atlas = null, atlasH = null;
const sprigTexture = (heavy = false) => heavy ? (atlasH ??= makeAtlas(true)) : (atlas ??= makeAtlas(false));
const makeAtlas = heavy => (() => {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 512; const x = c.getContext('2d'); x.scale(2, 2); // (twice the size, drawn at the same coordinates: the same sprig with twice the detail, and no more triangles)
  if (heavy) { paintSprig(x, 0, true, seeded(17), true); paintSprig(x, 256, true, seeded(29), true); } else { paintSprig(x, 0, false, seeded(17)); paintSprig(x, 256, true, seeded(29)); } // (the heavy atlas: a frosted sprig in both halves)
  const t = new THREE.CanvasTexture(c); t.anisotropy = 8; t.colorSpace = THREE.SRGBColorSpace; t.encoding = THREE.sRGBEncoding; return t;
})();

// ---------------------------------------------------------------- materials (as the bushes': per-vertex lighting, one lighting for both sides of a card, wind sway)
function addSway(material, k = 1, bias = 0) { // k: how hard it sways; bias: a steady push downwind (east) on the boughs, so a tree under a gale holds its crown bent
  material.onBeforeCompile = sh => {
    sh.uniforms.uWind = bushWind;
    sh.vertexShader = 'uniform float uWind;\nattribute float aSway;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
	float swPh = dot( modelMatrix[3].xz, vec2( 0.37, 0.21 ) ) + dot( position.xz, vec2( 1.7, 2.3 ) );
	#ifdef USE_INSTANCING
	swPh += dot( instanceMatrix[3].xz, vec2( 0.37, 0.21 ) );
	#endif
	transformed.x += ( ( sin( uWind * 1.4 + swPh ) * 0.09 + sin( uWind * 3.9 + swPh * 2.1 ) * 0.025 ) * ${k.toFixed(2)} + ${bias.toFixed(3)} ) * aSway;
	transformed.z += ( sin( uWind * 1.1 + swPh * 1.3 ) * 0.08 + sin( uWind * 3.3 + swPh * 1.7 ) * 0.02 ) * ${k.toFixed(2)} * aSway;
	transformed.y += sin( uWind * 5.0 + swPh * 3.0 ) * 0.015 * ${k.toFixed(2)} * aSway;`);
  };
  return material;
}
const PINE_SNOW = .5, PINE_SNOW_FROM = .45, PINE_SNOW_TO = .85, PINE_TRANS = .35; // (the foliage shader's snow cover (how white the upward-facing needles go), where it starts and is full (how far a card faces up), and how strongly the needles pass the sun's light on)
let foliageM = null, foliageH = null, woodM = null;
const foliageMat = (heavy = false) => heavy ? (foliageH ??= makeFoliage(true)) : (foliageM ??= makeFoliage(false));
const makeFoliage = heavy => (() => { // heavy: a snow blanket: every needle but the steepest-hanging goes nearly white, dark ones too
  const map = sprigTexture(heavy), m = new THREE.MeshLambertMaterial({ map, vertexColors: true, alphaTest: .5, alphaToCoverage: true, side: THREE.DoubleSide });
  m.userData.depth = addSway(new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map, alphaTest: .5 }), heavy ? 2.4 : 1, heavy ? .07 : 0);
  addSway(m, heavy ? 2.4 : 1, heavy ? .07 : 0); const sway = m.onBeforeCompile;
  m.onBeforeCompile = sh => {
    sway(sh);
    sh.vertexShader = ['varying vec3 vPnV;', 'varying vec3 vPvd;', ''].join(String.fromCharCode(10)) + sh.vertexShader.replace('#include <defaultnormal_vertex>', ['#include <defaultnormal_vertex>', 'vPnV = transformedNormal;'].join(String.fromCharCode(10))).replace('#include <project_vertex>', ['#include <project_vertex>', 'vPvd = - mvPosition.xyz;'].join(String.fromCharCode(10))); // (the card's normal and the way to the eye, in view space)
    sh.fragmentShader = ['varying vec3 vPnV;', 'varying vec3 vPvd;', ''].join(String.fromCharCode(10)) + sh.fragmentShader.replace(/gl_FrontFacing/g, 'true').replace(/\* getShadowMask\(\)/g, '* pShadow')
      .replace('#include <alphatest_fragment>', `#include <alphatest_fragment>
	vec3 pN = normalize( vPnV ); // (1. snow settles on the cards that face up, on the paler needles: it follows the angle of the card, not only the painted snow)
	vec3 pUp = normalize( ( viewMatrix * vec4( 0.0, 1.0, 0.0, 0.0 ) ).xyz );
	float pLum = dot( diffuseColor.rgb, vec3( 0.3, 0.59, 0.11 ) );
	float pSnow = smoothstep( ${PINE_SNOW_FROM.toFixed(2)}, ${PINE_SNOW_TO.toFixed(2)}, dot( pN, pUp ) ) * smoothstep( 0.1, 0.34, pLum ) * ${PINE_SNOW.toFixed(2)};
	diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.88, 0.93, 1.0 ), pSnow );`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
	float pShadow = getShadowMask(); // (worked out once, here, and shared with the lighting below: the soft shadow is the dearest lookup in the shader)
	#if NUM_DIR_LIGHTS > 0
	{ // 2. light through the needles: cards turned away from the sun, and the ones the eye looks at against the sun, glow a warm green (a thin leaf passes light on), where the sun is not shadowed
	  vec3 pL = normalize( directionalLights[ 0 ].direction );
	  float pThru = clamp( - dot( pN, pL ) * 0.6 + 0.25, 0.0, 1.0 ) + pow( clamp( - dot( normalize( vPvd ), pL ), 0.0, 1.0 ), 3.0 ) * 0.6;
	  totalEmissiveRadiance += diffuseColor.rgb * vec3( 0.7, 0.9, 0.35 ) * directionalLights[ 0 ].color * pThru * ${PINE_TRANS.toFixed(2)} * pShadow;
	}
	#endif`);
  };
  m.customProgramCacheKey = () => heavy ? 'pineLambertOneLightSnowThruHeavy' : 'pineLambertOneLightSnowThru'; return m;
})();
const woodMat = () => woodM ??= new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0, envMapIntensity: .15 });

// ---------------------------------------------------------------- the trees
const SPEC = { // whorls: rings of branches up the trunk; per: branches per ring (lowest .. highest); R: reach of the lowest branches; droop: how far a branch sags; sprays: cards per branch; trunk: bare trunk before the first ring
  spruce: { h: 8.6, trunk: 1.0, whorls: 14, per: [6, 3], R: 1.75, droop: .32, sprays: 7, size: 1.0, top: .9, rb: .22, fill: 3, under: true },
  fir: { h: 6.8, trunk: .7, whorls: 10, per: [7, 4], R: 2.25, droop: .5, sprays: 8, size: 1.15, top: .8, rb: .24, fill: 3, under: true },
  scots: { h: 10.5, trunk: 4.8, whorls: 8, per: [4, 3], R: 2.1, droop: .2, sprays: 12, size: 1.1, top: .7, rb: .26, ragged: true, reddish: true, fill: 4 },
  young: { h: 2.9, trunk: .35, whorls: 9, per: [5, 3], R: 1.15, droop: .25, sprays: 6, size: .75, top: .5, rb: .07, fill: 3 },
};
const BARK = [.15, .115, .09], BARK_UP = [.22, .17, .13], BARK_RED = [.46, .27, .17];

export function buildPine(variant = 'spruce', seed = 1, { snow = .6, lod = false, lift = 0 } = {}) { // lod: for a crowd of trees seen from far above: the thin branches (a third of the wood's triangles) are left out; the needle cards, the part you see, are all there
  const sp = { ...(SPEC[variant] ?? SPEC.spruce) }, rnd = seeded(seed);
  if (lift) sp.R *= .68; // (and a narrower crown: a tree grown in a thick wood has a slim crown, and from above this is what shows)
  sp.h += lift; sp.trunk += lift; // (lift: a longer bare trunk under the same crown, like a tree grown in a thick wood, whose lowest branches died for want of light)
  const wood = { pos: [], col: [], idx: [] }, fol = { pos: [], uv: [], col: [], sw: [], idx: [], cards: [] }; let tris = 0;
  const h = sp.h, shade = (p, rr) => clamp01(lerp(.46, 1, ss(.04, .95, rr))) * (.7 + .3 * clamp01(p.y / h)) * (.92 + rnd() * .14); // (canopy occlusion baked into the vertex colours: dark deep inside and in the lower tiers, bright at the branch tips and toward the top)

  // the trunk: a tapered column of seven sides, leaning a little, reaching up into the leader
  { const sides = 7, segs = variant === 'young' ? 3 : 5, lean = V((rnd() - .5) * .35, 0, (rnd() - .5) * .35), vc = 0, tp = [];
    { const rad = sp.rb * 1.35 * 1.25 * .95, c = sp.reddish ? BARK_RED.map((v, k) => lerp(BARK[k], v, 0)) : BARK.slice(); // (a buried foot: the trunk goes on a metre and a half below the ground, so on a slope or a lean its bottom never shows as a cut end above the snow)
      for (let j = 0; j <= sides; j++) { const a = j / sides * PI * 2, w = .9 + .2 * Math.sin(j * 2.3); wood.pos.push(Math.cos(a) * rad * w, -1.5, Math.sin(a) * rad * w); wood.col.push(c[0] * .7, c[1] * .7, c[2] * .7); } }
    for (let i = 0; i <= segs; i++) {
      const t = i / segs, y = t * (h - sp.top * .3), rad = lerp(sp.rb * 1.35, .03, Math.pow(t, .85)) * (i === 0 ? 1.25 : 1), c = sp.reddish ? BARK_RED.map((v, k) => lerp(BARK[k], v, ss(.35, .75, t))) : BARK.map((v, k) => lerp(v, BARK_UP[k], t));
      for (let j = 0; j <= sides; j++) { const a = j / sides * PI * 2, w = .9 + .2 * Math.sin(j * 2.3 + i * 1.7); wood.pos.push(lean.x * t * t + Math.cos(a) * rad * w, y, lean.z * t * t + Math.sin(a) * rad * w); wood.col.push(c[0] * (.85 + .3 * rnd()), c[1] * (.85 + .3 * rnd()), c[2] * (.85 + .3 * rnd())); }
      tp.push([lean.x * t * t, y, lean.z * t * t]);
    }
    for (let i = 0; i < segs + 1; i++) for (let j = 0; j < sides; j++) { const a = i * (sides + 1) + j, b = a + sides + 1; wood.idx.push(a, b, a + 1, a + 1, b, b + 1); } tris += (segs + 1) * sides * 2;
    sp.axis = (y) => { const t = clamp01(y / (h - sp.top * .3)); return [lean.x * t * t, lean.z * t * t]; };
  }
  const baseOf = () => wood.pos.length / 3;
  // a thin branch, a three-sided tube along a curve
  const tube = (p0, p1, p2, r0, r1) => {
    const curve = new THREE.QuadraticBezierCurve3(p0, p1, p2); if (lod) return curve;
    const b = baseOf(), segs = 2, sides = 3;
    for (let i = 0; i <= segs; i++) { const t = i / segs, c = curve.getPointAt(t), r = lerp(r0, r1, t); for (let j = 0; j < sides; j++) { const a = j / sides * PI * 2; wood.pos.push(c.x + Math.cos(a) * r, c.y + Math.sin(a) * r * .8, c.z + Math.sin(a) * r * .6 + Math.cos(a) * r * .2); const k = lerp(.9, 1.2, t); wood.col.push(BARK[0] * k, BARK[1] * k, BARK[2] * k); } }
    for (let i = 0; i < segs; i++) for (let j = 0; j < sides; j++) { const a = b + i * sides + j, a2 = b + i * sides + (j + 1) % sides, c = a + sides, c2 = a2 + sides; wood.idx.push(a, c, a2, a2, c, c2); }
    tris += segs * sides * 2; return curve;
  };
  // a needle card: from `p` along `dir`, `len` long and `wid` across, lying nearly flat; snowy cards take the snow-laden half of the atlas
  const _X = V(), _Y = V(), _Z = V();
  const card = (p, dir, len, wid, snowy, rr, roll = 0) => {
    if (tris + 2 > BUDGET) return;
    _Z.copy(dir).normalize(); _X.set(0, 1, 0).cross(_Z); if (_X.lengthSq() < 1e-4) _X.set(1, 0, 0); _X.normalize(); _Y.crossVectors(_Z, _X);
    const cr = Math.cos(roll), sr = Math.sin(roll), Xr = _X.clone().multiplyScalar(cr).addScaledVector(_Y, sr), base = fol.pos.length / 3, half = snowy ? .5 : 0;
    const nrm = V().crossVectors(_Z, Xr).normalize(), lift = ((fol.cards.length * .6180339) % 1 - .5) * .1; // (every card sits a little off its neighbours' plane, by its own amount: two cards lying nearly flat over each other (one snowy, one not) no longer share a depth, so they stop fighting and the snow no longer flickers on and off)
    for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) {
      const w = V().copy(p).addScaledVector(nrm, lift).addScaledVector(_Z, i * len).addScaledVector(Xr, (j - .5) * wid * (i ? .8 : 1)); w.y -= .05 * i * len;
      fol.pos.push(w.x, w.y, w.z); fol.uv.push(half + j * .5 * .96 + .02, i); const b = Math.min(1.25, shade(w, rr) * (snowy ? 1.16 : 1.38)); fol.col.push(Math.min(1.25, b), Math.min(1.25, b), Math.min(1.25, b));
      fol.sw.push(Math.pow(clamp01(w.y / h), 1.3) * (.4 + .6 * i));
    }
    fol.idx.push(base, base + 2, base + 1, base + 1, base + 2, base + 3); fol.cards.push(base); tris += 2;
  };

  // whorls of branches up the trunk, longest at the bottom, shorter toward the leader; each branch is a thin tube that sags, with needle cards hung along it
  const top = h - sp.top, y0 = sp.trunk;
  for (let w = 0; w < sp.whorls; w++) {
    const t = w / (sp.whorls - 1 || 1), y = lerp(y0, top - .25, t) + (sp.ragged ? (rnd() - .5) * .9 : 0), nb = Math.round(lerp(sp.per[0], sp.per[1], t)), a0 = rnd() * PI * 2, [ax, az] = sp.axis(y);
    const reachT = Math.pow(1 - t, sp.ragged ? .5 : .9) * .93 + .09;
    for (let b = 0; b < nb; b++) {
      const a = a0 + b / nb * PI * 2 + (rnd() - .5) * .7, ca = Math.cos(a), sa = Math.sin(a), L = sp.R * reachT * (sp.ragged ? .55 + rnd() * .6 : .88 + rnd() * .24), sag = sp.droop * L * (1 - .45 * t);
      const p0 = V(ax + ca * .05, y, az + sa * .05), p1 = V(ax + ca * L * .5, y + .02 * L - sag * .45, az + sa * L * .5), p2 = V(ax + ca * L, y + .08 * L - sag, az + sa * L);
      const curve = tube(p0, p1, p2, .035 + .02 * (1 - t), .008);
      if (sp.under && t < .75) { const pu = curve.getPointAt(.55), tu = curve.getTangentAt(.55); card(pu.clone().add(V(0, -.12, 0)), V(tu.x, tu.y - .35, tu.z), Math.max(.8, L * .6) * sp.size, Math.max(.8, L * .6) * sp.size * 1.1, rnd() < snow * .35, .55, (rnd() - .5) * .4); } // (a lower card, hanging below the bough: the underside of the tier, seen from the sides)
      const ns = sp.ragged && w < sp.whorls - 1 ? sp.sprays + 1 : sp.sprays;
      for (let s = 0; s < ns; s++) {
        const u = lerp(.3, 1, (s + .4 + rnd() * .4) / ns), p = curve.getPointAt(u), tg = curve.getTangentAt(u), len = Math.max(.8, L * .62) * sp.size * (.85 + rnd() * .3), wid = len * 1.2;
        const rr = Math.hypot(p.x - ax, p.z - az) / Math.max(.4, sp.R * reachT), snowy = snow > 1 ? true : rnd() < Math.min(1, snow * 1.5) * (.35 + .65 * ss(.1, 1, y / h)) * (1 - .25 * (1 - u)); // (snow > 1: a blanket, every card snow-laden)
        card(p.clone().addScaledVector(tg, -.05), V(tg.x, tg.y * .6, tg.z).add(V((rnd() - .5) * .35, 0, (rnd() - .5) * .35)), len, wid, snowy, rr, (rnd() - .5) * .5);
      }
    }
  }
  // fill: cards close to the trunk, pointing out and up, so the middle of the crown is not empty
  for (let w = 0; w < sp.whorls; w++) for (let q = 0; q < (sp.fill ?? 0); q++) {
    const t = w / (sp.whorls - 1 || 1), y = lerp(y0, top - .3, t) + .15, a = rnd() * PI * 2, [ax, az] = sp.axis(y), rr = sp.R * (Math.pow(1 - t, .9) * .93 + .09) * .42, ca = Math.cos(a), sa = Math.sin(a);
    card(V(ax + ca * rr * .2, y, az + sa * rr * .2), V(ca, .18, sa), Math.max(.7, rr * 1.5) * sp.size, Math.max(.7, rr * 1.5) * sp.size * 1.1, (snow > 1 || rnd() < snow * .6), .5, (rnd() - .5) * .5);
  }
  // the leader: three needle cards crossed, pointing up
  for (let i = 0; i < 3; i++) { const a = i / 3 * PI + rnd(); card(V(sp.axis(top)[0], top - .1, sp.axis(top)[1]), V(Math.cos(a) * .35, 1, Math.sin(a) * .35), sp.top + .45, .75, snow > .4 && i === 0, .5, a); }
  if (variant === 'scots') for (let i = 0; i < 4; i++) { const a = rnd() * PI * 2; card(V(sp.axis(top - .6)[0], top - .6, sp.axis(top - .6)[1]), V(Math.cos(a), .5 + rnd() * .5, Math.sin(a)), 1.1, 1.0, rnd() < snow, .6); } // (a ragged tuft at the very top)

  const gw = new THREE.BufferGeometry(); gw.setAttribute('position', new THREE.Float32BufferAttribute(wood.pos, 3)); gw.setAttribute('color', new THREE.Float32BufferAttribute(wood.col, 3)); gw.setIndex(wood.idx); gw.computeVertexNormals();
  const gf = new THREE.BufferGeometry(); gf.setAttribute('position', new THREE.Float32BufferAttribute(fol.pos, 3)); gf.setAttribute('uv', new THREE.Float32BufferAttribute(fol.uv, 2)); gf.setAttribute('color', new THREE.Float32BufferAttribute(fol.col, 3)); gf.setAttribute('aSway', new THREE.Float32BufferAttribute(fol.sw, 1)); gf.setIndex(fol.idx); gf.computeVertexNormals();
  { // each card's normal chosen once for the whole card (outward and up), then blended toward a rounded crown so the tree shades as one soft mass
    const Pp = gf.attributes.position, N = gf.attributes.normal, cy = h * .55, rx = sp.R * 1.1, ry = h * .5, n = V(), r = V();
    for (const base of fol.cards) { let sum = 0; for (let i = base; i < base + 4; i++) { r.set(Pp.getX(i), Pp.getY(i) - cy, Pp.getZ(i)).normalize(); sum += N.getX(i) * r.x + N.getY(i) * (r.y + 1) + N.getZ(i) * r.z; } if (sum < 0) for (let i = base; i < base + 4; i++) N.setXYZ(i, -N.getX(i), -N.getY(i), -N.getZ(i)); }
    for (let i = 0; i < Pp.count; i++) { r.set(Pp.getX(i) / rx ** 2, (Pp.getY(i) - cy) / ry ** 2, Pp.getZ(i) / rx ** 2).normalize(); n.fromBufferAttribute(N, i).multiplyScalar(.4).addScaledVector(r, .6); n.y += .25; n.normalize(); N.setXYZ(i, n.x, n.y, n.z); }
  }
  const root = new THREE.Group(); root.name = 'pine_' + variant;
  const f = new THREE.Mesh(gf, foliageMat(snow > 1)); f.name = 'foliage'; f.castShadow = f.receiveShadow = true; f.customDepthMaterial = foliageMat(snow > 1).userData.depth; root.add(f);
  const wd = new THREE.Mesh(gw, woodMat()); wd.name = 'wood'; wd.castShadow = wd.receiveShadow = true; root.add(wd);
  root.userData = { variant, seed, triangles: tris, radius: sp.R, height: h };
  return root;
}

export function pineTriangles(obj) { let n = 0; obj.traverse(o => { if (o.isMesh && o.geometry.index) n += o.geometry.index.count / 3 * (o.isInstancedMesh ? o.count : 1); }); return Math.round(n); }
