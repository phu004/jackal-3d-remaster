// Stage 5's bridges over the chasms: old stone arch bridges in warm red sandstone, after the Karl Theodor Bridge in Heidelberg (the NES drew them as plain stone-brick strips).
//   - the roadway of granite setts in running courses, a kerb and a flagstone footway each side, worn and weedy, the dirt of the ground drifting onto both ends;
//   - a parapet wall with a coping, and a pilaster (the old bridge's refuges) every few metres;
//   - under the deck, the elevation of a masonry arch bridge: abutments at the rim, piers on the chasm floor with pointed cutwaters (stone-capped, as the old bridge's), segmental arches between;
//   - at each end a pair of square gate posts with a cornice and a pyramid cap, the old bridge gate's little cousins.
// Solid: the parapet cells are walls for the jeep (world.js: 'Y' and 'y'), the deck cells drive like the ground (deck flush with it).
import * as THREE from 'three';
import { mergeStatic } from './optimize.js';

const rng = seed => () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const STONE = [150, 150, 146];   // grey granite (the walls, arch and posts)
const DECK_STONE = [146, 144, 138]; // the footways' flags: grey like the rest of the stonework
const TILE_M = 3;               // metres of wall per tile of the ashlar texture
const DECK_Y = .04;             // the deck's surface: a hair over the ground
const PARAPET_H = .95, PARAPET_T = .4, FOOTWAY = .55; // m
const PIER_W = 2.3, ABUT = 1.8; // m: a pier's thickness along the bridge; the solid abutment at each rim

// The stone's texture is laid in world metres: a mesh's uvs come from where its faces stand (faces toward the sides: along the bridge and up; toward the ends: across and up; the tops: across and along).
function worldUv(m) {
  const uv = m.geometry.attributes.uv, p = m.geometry.attributes.position, n = m.geometry.attributes.normal;
  for (let i = 0; i < uv.count; i++) {
    const X = p.getX(i) + m.position.x, Y = p.getY(i) + m.position.y, Z = p.getZ(i) + m.position.z, nx = Math.abs(n.getX(i)), ny = Math.abs(n.getY(i));
    uv.setXY(i, ny > .7 ? X : nx > .5 ? Z : X, ny > .7 ? Z : Y);
  }
  return m;
}

let ashlarTex = null, ashlarBump = null;
function ashlar() { // courses of dressed granite blocks: every block its own grey, bevelled edges catching the light, grain, chips, weathering; a matching bump map gives the joints and bevels relief. Tiles every TILE_M metres
  if (ashlarTex) return ashlarTex;
  const S = 1024, mk = () => { const c = document.createElement('canvas'); c.width = c.height = S; return c; }, c = mk(), hb = mk(), x = c.getContext('2d'), h = hb.getContext('2d'), rand = rng(77), px = S / TILE_M;
  x.fillStyle = '#625f59'; x.fillRect(0, 0, S, S); h.fillStyle = '#505050'; h.fillRect(0, 0, S, S); // (the joints: dark and low)
  const courses = [.36, .42, .34, .4, .38, .44, .36, .4]; let y = 0, ci = 0, total = courses.reduce((a, b) => a + b, 0), k = TILE_M / total;
  const block = (bx, by, bw, bh) => {
    const tone = .8 + rand() * .32, warm = (rand() - .5) * .1, r = STONE[0] * tone * (1 + warm), g = STONE[1] * tone, b = STONE[2] * tone * (1 - warm * .8), j = 1.5; // j: the joint's half-width (px)
    const x0 = bx + j, y0 = by + j, w = bw - 2 * j, hh = bh - 2 * j;
    const grad = x.createLinearGradient(x0, y0, x0 + w * .4, y0 + hh); grad.addColorStop(0, `rgb(${r * 1.08 | 0},${g * 1.08 | 0},${b * 1.08 | 0})`); grad.addColorStop(1, `rgb(${r * .9 | 0},${g * .9 | 0},${b * .9 | 0})`);
    x.fillStyle = grad; x.fillRect(x0, y0, w, hh); h.fillStyle = '#8a8a8a'; h.fillRect(x0, y0, w, hh);
    for (let i = 0, n = w * hh / 90; i < n; i++) { // the grain: fine light and dark speckle
      const sx = x0 + rand() * w, sy = y0 + rand() * hh, d = rand() < .5; x.fillStyle = d ? 'rgba(20,20,20,.22)' : 'rgba(255,255,250,.2)'; x.fillRect(sx, sy, 1 + rand() * 1.8, 1 + rand() * 1.8);
      if (rand() < .35) { h.fillStyle = d ? 'rgba(0,0,0,.35)' : 'rgba(255,255,255,.25)'; h.fillRect(sx, sy, 1.5, 1.5); }
    }
    for (let i = 0; i < 2; i++) { const bxm = x0 + rand() * w, bym = y0 + rand() * hh, rr = (.12 + rand() * .3) * px, gg = x.createRadialGradient(bxm, bym, 0, bxm, bym, rr); gg.addColorStop(0, `rgba(${rand() < .5 ? '40,34,28' : '210,205,195'},${.1 + rand() * .12})`); gg.addColorStop(1, 'rgba(0,0,0,0)'); x.save(); x.beginPath(); x.rect(x0, y0, w, hh); x.clip(); x.fillStyle = gg; x.fillRect(bxm - rr, bym - rr, rr * 2, rr * 2); x.restore(); } // mottling
    x.fillStyle = 'rgba(255,255,255,.09)'; x.fillRect(x0, y0, w, 2); x.fillRect(x0, y0, 2, hh); x.fillStyle = 'rgba(0,0,0,.14)'; x.fillRect(x0, y0 + hh - 2.5, w, 2.5); x.fillRect(x0 + w - 2.5, y0, 2.5, hh); // bevel: lit top and left, shaded bottom and right
    h.fillStyle = '#a8a8a8'; h.fillRect(x0 + 2, y0 + 2, w - 4, 2); h.fillRect(x0 + 2, y0 + 2, 2, hh - 4); h.fillStyle = '#6a6a6a'; h.fillRect(x0, y0 + hh - 3, w, 3); h.fillRect(x0 + w - 3, y0, 3, hh);
    if (rand() < .22) { x.strokeStyle = 'rgba(20,18,16,.5)'; x.lineWidth = 1; h.strokeStyle = 'rgba(0,0,0,.6)'; h.lineWidth = 1.4; let cx = x0 + rand() * w, cy = y0, a = Math.PI / 2 + (rand() - .5) * .8; for (const ctx of [x, h]) { ctx.beginPath(); ctx.moveTo(cx, cy); let qx = cx, qy = cy, qa = a; for (let s2 = 0; s2 < 14; s2++) { qa += (rand() - .5) * .9; qx += Math.cos(qa) * hh / 14; qy += Math.sin(qa) * hh / 14; ctx.lineTo(qx, qy); } ctx.stroke(); } } // a hairline crack
    if (rand() < .18) { const cx = x0 + rand() * w, cy = y0 + hh * (.5 + rand() * .5), rr = .1 * px + rand() * .1 * px; x.fillStyle = 'rgba(30,26,22,.35)'; x.beginPath(); x.moveTo(cx - rr, cy); x.lineTo(cx, cy - rr * .9); x.lineTo(cx + rr, cy + rr * .2); x.lineTo(cx, cy + rr); x.fill(); h.fillStyle = 'rgba(0,0,0,.5)'; h.fill(); } // a chipped corner
  };
  while (y < TILE_M - 1e-6) {
    const hgt = courses[ci++ % courses.length] * k; let xx = -rand() * .5;
    while (xx < TILE_M) { const w = .55 + rand() * .7; block(Math.round(xx * px), Math.round(y * px), Math.round(w * px), Math.round(hgt * px)); xx += w; }
    y += hgt;
  }
  for (let i = 0; i < 260; i++) { x.fillStyle = rand() < .5 ? 'rgba(235,230,220,.1)' : 'rgba(40,36,30,.12)'; const r = .8 + rand() * 3; x.beginPath(); x.arc(rand() * S, rand() * S, r, 0, 7); x.fill(); } // weathering
  for (let i = 0; i < 10; i++) { x.fillStyle = 'rgba(86,98,56,.2)'; x.beginPath(); x.ellipse(rand() * S, rand() * S, 10 + rand() * 26, 5 + rand() * 11, rand() * 3, 0, 7); x.fill(); } // moss and lichen
  for (let i = 0; i < 14; i++) { const sx = rand() * S, g2 = x.createLinearGradient(sx, 0, sx, 160 + rand() * 260); g2.addColorStop(0, 'rgba(34,30,26,.3)'); g2.addColorStop(1, 'rgba(34,30,26,0)'); x.fillStyle = g2; x.fillRect(sx, 0, 6 + rand() * 14, 420); } // rain streaks
  const soften = src => { // a touch of blur takes the hard edge off every joint and bevel (drawn wrapped, so the tile still joins up)
    const o = mk(), ox = o.getContext('2d'); ox.filter = 'blur(1.1px)'; for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) ox.drawImage(src, dx * S, dy * S); return o;
  };
  const cs = soften(c), hs = soften(hb);
  const t = new THREE.CanvasTexture(cs); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; t.repeat.set(1 / TILE_M, 1 / TILE_M);
  ashlarBump = new THREE.CanvasTexture(hs); ashlarBump.wrapS = ashlarBump.wrapT = THREE.RepeatWrapping; ashlarBump.anisotropy = 8; ashlarBump.repeat.set(1 / TILE_M, 1 / TILE_M);
  return ashlarTex = t;
}

// The deck's texture over a rectangle w x l metres (x across, z along): setts on the roadway between x = roadX0 .. roadX1 (metres from the rectangle's west edge), flagstones outside it.
function deckTexture(w, l, roadX0, roadX1, seed) {
  const PXM = 34, TW = Math.round(w * PXM), TL = Math.round(l * PXM), c = document.createElement('canvas'); c.width = TW; c.height = TL;
  const x = c.getContext('2d'), rand = rng(seed);
  x.fillStyle = '#3a3128'; x.fillRect(0, 0, TW, TL); // the joints
  const R0 = roadX0 * PXM, R1 = roadX1 * PXM;
  // setts: granite, courses along the bridge's width (rows across), about 22 x 13 cm, laid in running bond
  const sw = .41 * PXM, sh = .265 * PXM;
  for (let row = 0, yy = 0; yy < TL; row++, yy += sh) {
    let xx = R0 - (row % 2 ? sw * .5 : 0) - rand() * 2;
    for (; xx < R1; xx += sw * (.9 + rand() * .25)) {
      const t = .62 + rand() * .42, w2 = sw * (.88 + rand() * .1), h2 = sh * .92, warm = (rand() - .5) * .1;
      const gx = Math.max(R0, xx), gw = Math.min(R1, xx + w2) - gx; if (gw <= 1) continue;
      x.fillStyle = `rgb(${128 * t * (1 + warm) | 0},${122 * t | 0},${112 * t * (1 - warm) | 0})`; x.fillRect(gx, yy + 1, gw, h2);
      if (rand() < .12) { x.fillStyle = 'rgba(0,0,0,.22)'; x.fillRect(gx, yy + 1, gw, h2); } // a dark stone
    }
  }
  // the kerbs (long dressed stones) either side of the roadway, and the footways of sandstone flags
  const kerb = .46 * PXM, fl = [1.27 * PXM, .92 * PXM];
  const flags = (xa, xb) => { for (let yy = 0, row = 0; yy < TL; yy += fl[1], row++) for (let xx = xa - (row % 2 ? fl[0] * .5 : 0); xx < xb; xx += fl[0]) {
    const gx = Math.max(xa, xx), gw = Math.min(xb, xx + fl[0]) - gx - 1.5; if (gw <= 1) continue; const t = .86 + rand() * .22;
    x.fillStyle = `rgb(${DECK_STONE[0] * t * 1.04 | 0},${DECK_STONE[1] * t * 1.02 | 0},${DECK_STONE[2] * t | 0})`; x.fillRect(gx, yy + 1, gw, fl[1] - 2.4); } };
  flags(0, R0 - kerb); flags(R1 + kerb, TW);
  for (const [xa, xb] of [[R0 - kerb, R0], [R1, R1 + kerb]]) for (let yy = 0; yy < TL;) { const len = (.9 + rand() * 1.1) * PXM, t = .9 + rand() * .15; x.fillStyle = `rgb(${158 * t | 0},${156 * t | 0},${150 * t | 0})`; x.fillRect(xa + 1, yy + 1, xb - xa - 2, len - 2); yy += len; }
  // wear and age: a dark lane where the wheels ran, dust drifts, weeds in the joints, cracks, a few lost setts
  const lane = (cx, wd) => { const g = x.createLinearGradient(cx - wd, 0, cx + wd, 0); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(.5, 'rgba(20,14,8,.20)'); g.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = g; x.fillRect(cx - wd, 0, wd * 2, TL); };
  lane(R0 + (R1 - R0) * .3, (R1 - R0) * .13); lane(R0 + (R1 - R0) * .7, (R1 - R0) * .13);
  for (let i = 0; i < Math.round(w * l * .5); i++) { const px = rand() * TW, py = rand() * TL, r = (.15 + rand() * .5) * PXM, g = x.createRadialGradient(px, py, 0, px, py, r); g.addColorStop(0, 'rgba(120,92,60,.28)'); g.addColorStop(1, 'rgba(120,92,60,0)'); x.fillStyle = g; x.beginPath(); x.arc(px, py, r, 0, 7); x.fill(); }
  for (let i = 0; i < Math.round(w * l * .35); i++) { const px = R0 + rand() * (R1 - R0), py = rand() * TL, r = (.07 + rand() * .12) * PXM; x.fillStyle = '#2b2118'; x.beginPath(); x.ellipse(px, py, r, r * .7, rand() * 3, 0, 7); x.fill(); } // lost setts: bare earth
  for (let i = 0; i < Math.round(w * l * 1.4); i++) { // weeds
    const px = rand() * TW, py = rand() * TL, dry = rand() < .55; x.strokeStyle = dry ? `rgba(${150 + rand() * 30 | 0},${130 + rand() * 24 | 0},${80 + rand() * 16 | 0},.9)` : `rgba(${80 + rand() * 30 | 0},${100 + rand() * 30 | 0},${50 + rand() * 16 | 0},.9)`; x.lineWidth = 1 + rand();
    for (let b = 0, n = 3 + rand() * 4; b < n; b++) { const a = -Math.PI / 2 + (rand() - .5) * 1.6, ln = (.05 + rand() * .12) * PXM; x.beginPath(); x.moveTo(px, py); x.lineTo(px + Math.cos(a) * ln, py + Math.sin(a) * ln); x.stroke(); }
  }
  for (let i = 0; i < Math.round(w * l * .06); i++) { // hairline cracks across the setts and flags
    let px = rand() * TW, py = rand() * TL, a = rand() * 6.283; x.strokeStyle = 'rgba(20,14,10,.55)'; x.lineWidth = 1; x.beginPath(); x.moveTo(px, py);
    for (let s = 0; s < 30; s++) { a += (rand() - .5) * .5; px += Math.cos(a) * 3; py += Math.sin(a) * 3; x.lineTo(px, py); } x.stroke();
  }
  // both ends give out into the ground's dirt: speckles thickening toward the end
  const END = 1.6 * PXM;
  for (const end of [0, 1]) for (let i = 0; i < 2600; i++) {
    const d = Math.pow(rand(), 1.7) * END, py = end ? TL - d : d, px = rand() * TW;
    x.fillStyle = `rgba(${96 + rand() * 30 | 0},${70 + rand() * 20 | 0},${40 + rand() * 14 | 0},${.5 + rand() * .4})`; x.fillRect(px, py, 1 + rand() * 2.4, 1 + rand() * 2.4);
  }
  // the ends blend into the ground: the stone's alpha frays out over the last couple of metres (the dirt shows through, ragged)
  const img = x.getImageData(0, 0, TW, TL), d8 = img.data, FADE = 2.3 * PXM;
  for (let py = 0; py < TL; py++) {
    const e = Math.min(py, TL - 1 - py); if (e >= FADE) continue;
    for (let px = 0; px < TW; px++) {
      const f = e / FADE, n = (Math.sin(px * .31 + py * .17 + seed) + Math.sin(px * .09 - py * .23) + rand() * 1.6) / 3.6 * .5 + .5;
      d8[(py * TW + px) * 4 + 3] *= Math.min(1, Math.max(0, (f - (1 - n) * .5) * 2.4));
    }
  }
  x.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c); t.anisotropy = 8; t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

// An elevation of the bridge's body (a Shape in (z along the bridge, y)): the whole span from end to end, the arches cut out of it down to below the floor.
function bodyShape(zA, zB, spanA, spanB, depth, nArch) {
  const bot = -depth - 2.5, s = new THREE.Shape();
  s.moveTo(zA, bot); s.lineTo(zB, bot); s.lineTo(zB, -.12); s.lineTo(zA, -.12); s.lineTo(zA, bot);
  const clear = (spanB - spanA) - 2 * ABUT - (nArch - 1) * PIER_W, w = clear / nArch, spring = -depth * .5, rise = Math.min(w * .3, depth - 3); // (one span: the arch springs from the two cliffs, low in the chasm)
  const R = (w * w / 4 + rise * rise) / (2 * rise), crownY = -2.6;
  for (let a = 0; a < nArch; a++) {
    const zl = spanA + ABUT + a * (w + PIER_W), zr = zl + w, zm = (zl + zr) / 2, cy = crownY - R, hole = new THREE.Path(), pts = [];
    const top = Math.min(crownY, spring + rise); // (the crown, if the wall is tall enough)
    const half = Math.asin(Math.min(1, (w / 2) / R));
    for (let i = 0; i <= 18; i++) { const th = -half + i / 18 * 2 * half; pts.push([zm + Math.sin(th) * R, cy + Math.cos(th) * R]); }
    hole.moveTo(zl, bot + .1); hole.lineTo(zl, pts[0][1]); for (const [pz, py] of pts) hole.lineTo(pz, py); hole.lineTo(zr, pts[pts.length - 1][1]); hole.lineTo(zr, bot + .1); hole.lineTo(zl, bot + .1);
    s.holes.push(hole);
  }
  return { shape: s, w, nArch };
}

// spec: { x0, x1 } the drivable deck's edges, { zN, zS } the chasm's north and south edges along it (m), cell (the parapet's width), ext (the approach's length over the ground at each end),
// depth (the chasm's), seed. Adds the bridge to the scene and returns its group.
// The stone below the rim dissolves into the chasm's haze, as the cliffs do (chasm.js: the same colour and depths, from its uniforms).
export function hazeify(mat, hz) {
  if (!hz) return mat;
  mat.onBeforeCompile = sh => {
    sh.uniforms.uHaze = hz.uHaze; sh.uniforms.uHazeTop = hz.uHazeTop; sh.uniforms.uHazeBot = hz.uHazeBot;
    sh.vertexShader = `varying float vHazeY;
${sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
	vHazeY = ( modelMatrix * vec4( transformed, 1.0 ) ).y;`)}`;
    sh.fragmentShader = `uniform vec3 uHaze;
uniform float uHazeTop, uHazeBot;
varying float vHazeY;
${sh.fragmentShader.replace('#include <fog_fragment>', `gl_FragColor.rgb = mix( gl_FragColor.rgb, uHaze, smoothstep( uHazeTop, uHazeBot, vHazeY ) );
#include <fog_fragment>`)}`;
  };
  return mat;
}

export function buildBridge(scene, { x0, x1, zN, zS, cell, ext, depth, seed = 1, haze = null }) {
  const g = new THREE.Group(), stoneTex = ashlar();
  const stone = new THREE.MeshStandardMaterial({ map: stoneTex, bumpMap: ashlarBump, bumpScale: .6, roughness: .92, envMapIntensity: .2 });
  const capStone = new THREE.MeshStandardMaterial({ map: stoneTex, bumpMap: ashlarBump, bumpScale: .6, color: 0xe4e4e2, roughness: .88, envMapIntensity: .2 });
  hazeify(stone, haze); hazeify(capStone, haze);
  const roof = new THREE.MeshStandardMaterial({ color: 0x56595c, roughness: .85, envMapIntensity: .2, flatShading: true });
  const xo0 = x0 - cell, xo1 = x1 + cell, Wt = xo1 - xo0, zA = zN - ext, zB = zS + ext, L = zB - zA;
  const box = (w, h, d, mat, px, py, pz) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(px, py, pz); m.castShadow = m.receiveShadow = true; g.add(worldUv(m)); return m; };
  const part = (geo, mat, px, py, pz) => { const m = new THREE.Mesh(geo, mat); m.position.set(px, py, pz); m.castShadow = m.receiveShadow = true; g.add(m); return m; };

  // --- the deck ---
  const deck = new THREE.Mesh(new THREE.PlaneGeometry(Wt, L), new THREE.MeshStandardMaterial({ map: deckTexture(Wt, L, cell, Wt - cell, seed), roughness: .95, envMapIntensity: .15, transparent: true }));
  deck.rotation.x = -Math.PI / 2; deck.position.set((xo0 + xo1) / 2, DECK_Y, (zA + zB) / 2); deck.receiveShadow = true; g.add(deck);

  // --- parapets with copings, and a pilaster every few metres ---
  const nP = Math.max(2, Math.round(L / 8)), pilZ = i => zA + 1.2 + i * (L - 2.4) / (nP - 1);
  for (const side of [-1, 1]) {
    const wx = side < 0 ? xo0 + PARAPET_T / 2 : xo1 - PARAPET_T / 2;
    box(PARAPET_T, PARAPET_H, L, stone, wx, PARAPET_H / 2, (zA + zB) / 2);
    box(PARAPET_T + .14, .12, L + .1, capStone, wx, PARAPET_H + .06, (zA + zB) / 2);
    for (let i = 0; i < nP; i++) {
      const pz = pilZ(i), d = .62, px = side < 0 ? xo0 + d / 2 : xo1 - d / 2, h = PARAPET_H + .3;
      box(d, h, .62, stone, px, h / 2, pz); box(d + .14, .12, .76, capStone, px, h + .06, pz);
      part(new THREE.SphereGeometry(.15, 8, 6), capStone, px, h + .12 + .1, pz);
    }
  }

  // --- the body under the deck: the arches' elevation, extruded across the bridge ---
  const nArch = 1, { shape } = bodyShape(zA, zB, zN, zS, depth, nArch);
  const bodyG = new THREE.ExtrudeGeometry(shape, { depth: Wt, bevelEnabled: false, curveSegments: 18 });
  bodyG.rotateY(-Math.PI / 2); bodyG.translate(xo1, 0, 0); // (the shape's x runs along the bridge: z; its extrusion across: -x)
  const bodyM = part(bodyG, stone, 0, 0, 0);
  { const uv = bodyG.attributes.uv, p = bodyG.attributes.position, n = bodyG.attributes.normal; for (let i = 0; i < uv.count; i++) { const nx = Math.abs(n.getX(i)), ny = Math.abs(n.getY(i)); uv.setXY(i, ny > .7 ? p.getX(i) : nx > .5 ? p.getZ(i) : p.getX(i), ny > .7 ? p.getZ(i) : p.getY(i)); } }
  void bodyM;
  // a pointed cutwater on both faces of each pier, capped with a little stone pyramid
  const clear = (zS - zN) - 2 * ABUT - (nArch - 1) * PIER_W, w = clear / nArch;
  for (let p = 0; p < nArch - 1; p++) {
    const zc = zN + ABUT + (p + 1) * w + p * PIER_W + PIER_W / 2;
    for (const side of [-1, 1]) {
      const tri = new THREE.Shape(); tri.moveTo(-PIER_W / 2, 0); tri.lineTo(PIER_W / 2, 0); tri.lineTo(0, 1.9); tri.lineTo(-PIER_W / 2, 0);
      const h = depth + 2.5 - 1.4, geo = new THREE.ExtrudeGeometry(tri, { depth: h, bevelEnabled: false });
      geo.rotateX(-Math.PI / 2); // up the extrusion; the shape's y (the point) now runs along -z
      geo.rotateY(side < 0 ? Math.PI / 2 : -Math.PI / 2); // the point out to the west (side -1) or east
      const m = part(geo, stone, side < 0 ? xo0 : xo1, -depth - 2.5, zc);
      { const uv = geo.attributes.uv, pp = geo.attributes.position, n = geo.attributes.normal; for (let i = 0; i < uv.count; i++) { const ny = Math.abs(n.getY(i)); uv.setXY(i, ny > .7 ? pp.getX(i) + m.position.x : pp.getX(i) + pp.getZ(i) + m.position.z, ny > .7 ? pp.getZ(i) + m.position.z : pp.getY(i) + m.position.y); } }
      const cone = part(new THREE.ConeGeometry(1.5, 1.5, 4, 1), capStone, side < 0 ? xo0 - .6 : xo1 + .6, -1.2, zc); cone.rotation.y = Math.PI / 4;
    }
  }

  mergeStatic(g);
  scene.add(g);
  return g;
}
