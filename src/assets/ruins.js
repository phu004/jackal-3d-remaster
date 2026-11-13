// Desert-ruin props for stage 2 (placeholders): weathered sandstone columns, fallen column drums,
// great carved busts and statues standing in the pools. Origin on the ground, front faces -Z.
import * as THREE from 'three';
import { add, mat, cached, seededRandom, PI } from './common.js';

// Weathered stone: blotchy, pitted and grainy; streaks: dark grime running down (sandstone), off for
// the limestone / marble the columns are carved from (on a fluted shaft they read as wood grain).
function sandstoneTexture(seed, base = '#d6bd8a', streaks = true) {
  return cached('sandstone:' + seed + base + streaks, () => {
    const S = 256, c = document.createElement('canvas'); c.width = c.height = S; const x = c.getContext('2d'), rnd = seededRandom(seed);
    x.fillStyle = base; x.fillRect(0, 0, S, S);
    for (let i = 0; i < 90; i++) { // blotches
      const px = rnd() * S, py = rnd() * S, r = 10 + rnd() * 40, g = x.createRadialGradient(px, py, 0, px, py, r), d = rnd() < .5;
      g.addColorStop(0, d ? 'rgba(90,64,30,.16)' : 'rgba(255,240,205,.14)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = g; x.fillRect(px - r, py - r, r * 2, r * 2);
    }
    for (let i = 0; i < (streaks ? 26 : 0); i++) { // grime streaks running down
      const px = rnd() * S, py = rnd() * S, len = 30 + rnd() * 120, g = x.createLinearGradient(0, py, 0, py + len);
      g.addColorStop(0, 'rgba(70,50,30,.22)'); g.addColorStop(1, 'rgba(70,50,30,0)');
      x.fillStyle = g; x.fillRect(px, py, 2 + rnd() * 5, len);
    }
    for (let i = 0; i < 2200; i++) { // pits and grain
      x.fillStyle = rnd() < .6 ? `rgba(60,42,22,${.1 + rnd() * .2})` : `rgba(255,245,220,${.1 + rnd() * .15})`;
      x.fillRect(rnd() * S, rnd() * S, 1 + rnd() * 2, 1 + rnd() * 2);
    }
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 16;
    return t;
  });
}
export const stone = (seed = 1, tint = 0xffffff, base) => cached(`stoneMat:${seed}:${tint}:${base}`, () =>
  mat(tint, .93, 0, { map: sandstoneTexture(seed, base), envMapIntensity: .3 }));
// The pool statues' darker, water-stained stone (bust and pedestal).
export const statueStone = () => stone(5, 0x9fb0b4, '#b8b4a6');
// Pale, weathered limestone / marble for the columns (warm grey, no streaks).
export const limestone = (seed = 1, base = '#c9c0ae') => cached(`limeMat:${seed}:${base}`, () =>
  mat(0xffffff, .9, 0, { map: sandstoneTexture(seed + 40, base, false), envMapIntensity: .3 }));

// Old, weathered masonry stone (stairs, rails): darker and dirtier than the columns, with grime
// blotches and runs, hairline cracks, olive lichen and pits. The texture covers 2 m (see boxUV).
export const weathered = (seed = 1, base = '#958d7e') => cached(`weathered:${seed}:${base}`, () => {
  const S = 256, c = document.createElement('canvas'); c.width = c.height = S; const x = c.getContext('2d'), rnd = seededRandom(seed * 7 + 3);
  x.drawImage(sandstoneTexture(seed + 60, base, false).image, 0, 0);
  const blot = (px, py, r, col) => { for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) {
    const g = x.createRadialGradient(px + ox, py + oy, 0, px + ox, py + oy, r); g.addColorStop(0, col); g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g; x.fillRect(px + ox - r, py + oy - r, r * 2, r * 2); } };
  for (let i = 0; i < 26; i++) blot(rnd() * S, rnd() * S, 15 + rnd() * 50, 'rgba(46,40,30,.32)');   // grime
  for (let i = 0; i < 14; i++) blot(rnd() * S, rnd() * S, 8 + rnd() * 22, 'rgba(96,100,60,.28)');   // lichen
  for (let i = 0; i < 12; i++) { // runs of grime
    const px = rnd() * S, len = 30 + rnd() * 100, g = x.createLinearGradient(0, 0, 0, len);
    g.addColorStop(0, 'rgba(40,34,26,.3)'); g.addColorStop(1, 'rgba(40,34,26,0)'); x.fillStyle = g; x.fillRect(px, rnd() * S, 2 + rnd() * 6, len);
  }
  for (let i = 0; i < 8; i++) { // hairline cracks
    let px = rnd() * S, py = rnd() * S, a = rnd() * PI * 2; x.strokeStyle = 'rgba(30,26,20,.55)'; x.lineWidth = 1; x.beginPath(); x.moveTo(px, py);
    for (let k = 0; k < 8; k++) { a += (rnd() - .5) * .7; px += Math.cos(a) * 7; py += Math.sin(a) * 7; x.lineTo(px, py); } x.stroke();
  }
  for (let i = 0; i < 400; i++) { x.fillStyle = `rgba(30,24,18,${.15 + rnd() * .3})`; x.fillRect(rnd() * S, rnd() * S, 1 + rnd() * 3, 1 + rnd() * 2); } // pits and chips
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 16;
  return mat(0xffffff, .95, 0, { map: t, envMapIntensity: .25 });
});

// Scale a box's texture coordinates to its real size (one texture tile per `tile` metres), so the
// texture isn't stretched along long blocks.
export function boxUV(geo, w, h, d, tile = 2) {
  const uv = geo.attributes.uv, dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]]; // faces: +x -x +y -y +z -z
  for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) {
    const i = f * 4 + k; uv.setXY(i, uv.getX(i) * dims[f][0] / tile, uv.getY(i) * dims[f][1] / tile);
  }
  return geo;
}

// Soft contact shadow under a heavy stone thing: a dark blot on the ground, fading out.
const blotTex = cached('aoBlot', () => {
  const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d');
  const g = x.createRadialGradient(32, 32, 4, 32, 32, 32); g.addColorStop(0, 'rgba(0,0,0,.55)'); g.addColorStop(.6, 'rgba(0,0,0,.25)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
});
const blotMat = cached('aoBlotMat', () => new THREE.MeshBasicMaterial({ map: blotTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
function contactShadow(parent, w, d) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), blotMat);
  m.rotation.x = -PI / 2; m.position.y = .015; m.renderOrder = 1; parent.add(m);
}

// A fluted column shaft: the radius dips in 16 grooves; a broken top is jagged and tilted.
function shaft(radius, height, broken, rnd) {
  const g = new THREE.CylinderGeometry(radius * .94, radius, height, 48, 6, false);
  const p = g.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const a = Math.atan2(v.z, v.x), r = Math.hypot(v.x, v.z);
    if (r > 1e-3) { const k = 1 - .07 * Math.pow(Math.abs(Math.sin(a * 8)), .6); v.x *= k; v.z *= k; }
    if (broken && v.y > height / 2 - 1e-3) v.y -= rnd() * .35 + (v.x / radius) * .25; // jagged, sloping break
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

// Standing column on a stepped plinth (~2.6 m square). height: shaft height in metres; broken:
// snapped-off top, else a capital (capital: false leaves a flat drum joint on top instead: the stump
// of a column whose upper drums are a separate piece, see buildColumnDrums). Named part: none (static).
const columnStone = seed => limestone(1 + (seed % 3), ['#b8af9d', '#b1aa99', '#bdb4a1'][seed % 3]);
export function buildColumn(seed = 1, height = 4, broken = true, capital = !broken) {
  const rnd = seededRandom(seed), root = new THREE.Group(); root.name = 'column';
  const m = columnStone(seed), dark = limestone(7, '#9c927f'); // ~8% darker than before
  contactShadow(root, 3.6, 3.6);
  add(root, new THREE.BoxGeometry(2.6, .35, 2.6), dark, 0, .175, 0);          // footing
  add(root, new THREE.BoxGeometry(2.1, .3, 2.1), m, 0, .5, 0);                // plinth
  add(root, new THREE.CylinderGeometry(.92, .98, .25, 32), m, 0, .77, 0);     // base moulding (torus-like step)
  const s = add(root, shaft(.72, height, broken, rnd), m, 0, .9 + height / 2, 0);
  s.rotation.y = rnd() * PI;
  if (!broken && capital) { // capital: a flared echinus and a square abacus
    add(root, new THREE.CylinderGeometry(.95, .7, .35, 32), m, 0, .9 + height + .17, 0);
    add(root, new THREE.BoxGeometry(2, .3, 2), m, 0, .9 + height + .5, 0);
  } else if (broken) {
    if (rnd() < .6) for (let i = 0, n = 2 + Math.floor(rnd() * 3); i < n; i++) { // rubble from the broken top
      const a = rnd() * PI * 2, r = 1.5 + rnd() * .9, sz = .16 + rnd() * .28;
      const chunk = add(root, new THREE.DodecahedronGeometry(sz, 0), m, Math.cos(a) * r, sz * .55, Math.sin(a) * r);
      chunk.rotation.set(rnd() * 3, rnd() * 3, rnd() * 3); chunk.scale.set(1.2, .7, 1);
    }
    if (rnd() < .25) { // a fallen drum lying beside it
      const len = .8 + rnd() * .5, a = rnd() * PI * 2, drum = add(root, shaft(.66, len, false, rnd), m, Math.cos(a) * 2.2, .62, Math.sin(a) * 2.2);
      drum.rotation.z = PI / 2; drum.rotation.y = rnd() * PI;
    }
  }
  return root;
}

// The upper drums of a column, as one piece that can come away (stage 2's toppling pillar): a shaft
// `len` long in the same stone as buildColumn(seed), with its snapped-off top (broken) or a capital.
// Origin at the middle of its flat bottom face; it stands up +Y.
export function buildColumnDrums(seed = 1, len = 3, broken = true) {
  const rnd = seededRandom(seed * 7 + 1), root = new THREE.Group(); root.name = 'drums';
  const m = columnStone(seed);
  add(root, shaft(.72, len, broken, rnd), m, 0, len / 2, 0).rotation.y = rnd() * PI;
  if (!broken) {
    add(root, new THREE.CylinderGeometry(.95, .7, .35, 32), m, 0, len + .17, 0);
    add(root, new THREE.BoxGeometry(2, .3, 2), m, 0, len + .5, 0);
  }
  return root;
}

// The jagged top left on a column's stump where its upper drums broke away (stage 2's toppling
// pillar): a short broken length of shaft, set on the stump's flat joint (origin at its middle), with
// a few chips of stone lying on the break. m: the column's stone.
export function buildBreakCap(seed = 1, m = columnStone(seed), radius = .68) {
  const rnd = seededRandom(seed * 13 + 5), root = new THREE.Group(); root.name = 'breakCap';
  add(root, shaft(radius, .7, true, rnd), m).rotation.y = rnd() * PI;
  for (let i = 0; i < 3; i++) { // chips left lying on the break
    const a = rnd() * PI * 2, r = rnd() * radius * .6, sz = .07 + rnd() * .08;
    const c = add(root, new THREE.DodecahedronGeometry(sz, 0), m, Math.cos(a) * r, .05, Math.sin(a) * r);
    c.rotation.set(rnd() * 3, rnd() * 3, rnd() * 3);
  }
  return root;
}

// A toppled column: two or three drums lying in a line where they fell, half sunk in the sand.
export function buildFallenColumn(seed = 1) {
  const rnd = seededRandom(seed), root = new THREE.Group(); root.name = 'fallenColumn';
  const m = limestone(2 + (seed % 2));
  contactShadow(root, 6, 2.2);
  const n = 2 + Math.floor(rnd() * 2);
  let x = -2.2;
  for (let i = 0; i < n; i++) {
    const len = 1.4 + rnd() * .6, d = add(root, shaft(.62, len, i === n - 1, rnd), m, x + len / 2, .5, (rnd() - .5) * .3);
    d.rotation.z = PI / 2 + (rnd() - .5) * .12; d.rotation.x = (rnd() - .5) * .3;
    x += len + .08 + rnd() * .15;
  }
  return root;
}

// ---- Bust ------------------------------------------------------------------------------------
// Proportions (metres, bust local space; the whole bust is ~3.7 m with hair).
const HEAD = { y: 2.7, rx: .66, ry: .86, rz: .72 };
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const gauss = (lon, lat, cx, cy, sx, sy) => Math.exp(-(((lon - cx) / sx) ** 2 + ((lat - cy) / sy) ** 2) / 2);

// The face is ONE mesh: a high-res sphere whose vertices are pushed in/out by smooth Gaussian bumps
// placed by (longitude, latitude) on the front, so brow, nose, lips and chin blend into the skull.
// Features mirror left/right via |lon|. amp is in unit-sphere radii.
// Widths (sLon/sLat) are tuned to the head grid (~.056 rad lon x ~.044 rad lat): nothing is narrower
// than ~1.5 cells, so every feature is sampled instead of aliasing into a jagged edge.
const FACE = [ // [lon, lat, sLon, sLat, amp]
  [.52, .05, .20, .11, -.20],   // eye orbits: deep sockets the eyeballs sit in
  [.19, .02, .07, .07, -.04],   // inner eye corners
  [.55, .25, .26, .13,  .055],   // brow ridge (each side)
  [0,   .22, .14, .18, -.025], // slight dip between the brows (no centre bump)   // brow centre
  [.98, .15, .22, .22, -.05],   // hollow at the temples
  [0,  -.20, .11, .15,  .14],   // nose bridge
  [0,  -.34, .18, .14,  .22],   // nose tip
  [.19,-.39, .12, .09,  .07],   // nostril wings
  [.80,-.22, .32, .17,  .06],   // cheekbones, running back toward the ear
  [.60,-.46, .20, .15,  .035],  // cheek fullness
  [.30,-.52, .09, .20, -.035],  // fold from nostril to mouth corner
  [0,  -.51, .07, .07, -.03],   // groove under the nose
  [0,  -.57, .24, .075, .08],   // upper lip
  [0,  -.74, .22, .085, .09],   // lower lip
  [0,  -.655,.30, .045,-.11],   // mouth slot (deep groove between the lips)
  [.33,-.66, .08, .075,-.03],   // mouth corners
  [0,  -.90, .30, .065,-.04],   // dip under the lower lip
  [0,  -1.0, .24, .15,  .17],   // chin
  [1.0,-.80, .22, .15,  .04],   // jaw angle
];
// Painted-in shading (vertex colours, 1 = stone, 0 = black): the mouth slot and eye sockets read dark,
// like the NES sprite, even in flat light.
const DARK = [ // [lon, lat, sLon, sLat, strength]
  [0,  -.655, .26, .045, .85],   // mouth
  [.14,-.41, .06, .045, .45],    // nostrils
];
// Squareness: pulls a sphere's diagonals out toward a rounded box (superellipsoid, exponent N), blended
// by SQUARE (0 = round egg, 1 = fully boxy). Hair uses it too, so curls follow the squarer skull.
const SQUARE = .5, N = 3.2;
const squareness = (x, y, z) => { const l = Math.hypot(x, y, z) || 1; x /= l; y /= l; z /= l;
  return 1 + SQUARE * (Math.pow(Math.pow(Math.abs(x), N) + Math.pow(Math.abs(y), N) + Math.pow(Math.abs(z), N), -1 / N) - 1); };
// Deterministic (never touches rnd) and identical for every bust, so it's built once and shared.
function headGeometry() {
  const g = new THREE.SphereGeometry(1, 112, 72), p = g.attributes.position, u = new THREE.Vector3(), col = new Float32Array(p.count * 3), sd = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    u.fromBufferAttribute(p, i).normalize();
    sd[i * 3] = u.x; sd[i * 3 + 1] = u.y; sd[i * 3 + 2] = u.z;
    let d = 0, shade = 1;
    if (u.z < 0) {
      const lon = Math.abs(Math.atan2(u.x, -u.z)), lat = Math.asin(u.y), w = sstep(0, .35, -u.z);
      for (const [cx, cy, sx, sy, a] of FACE) d += a * gauss(lon, lat, cx, cy, sx, sy) * w;
      for (const [cx, cy, sx, sy, k] of DARK) shade -= k * gauss(lon, lat, cx, cy, sx, sy) * w;
    }
    col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = Math.max(0, shade);
    const r = 1 + d, down = Math.max(0, -u.y), lat0 = Math.asin(u.y);
    // width profile: full at the cheekbones, a squarer jaw, then closing in to the chin
    const taper = 1 - .05 * sstep(0, .35, down) - .2 * sstep(.4, 1, down);
    // depth: forehead slopes back, jaw is flatter, the back of the skull bulges out
    const zf = u.z < 0 ? (1 - .1 * down) * (1 - .03 * sstep(.3, 1.2, lat0)) : 1 + .05 * u.z * (1 - .5 * down);
    const f = squareness(u.x, u.y, u.z);
    p.setXYZ(i, u.x * f * r * HEAD.rx * taper, u.y * f * r * HEAD.ry, u.z * f * r * HEAD.rz * zf);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('sdir', new THREE.BufferAttribute(sd, 3));
  g.computeVertexNormals();
  return g;
}

// Sloped shoulders and chest: a half-ellipsoid whose outer parts droop.
function shouldersGeometry() {
  const g = new THREE.SphereGeometry(1, 32, 16, 0, PI * 2, 0, PI / 2), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) * 1.35, y = p.getY(i), z = p.getZ(i) * .7;
    p.setXYZ(i, x, y * (1 - .3 * sstep(.4, 1.35, Math.abs(x))), z);
  }
  g.computeVertexNormals();
  return g;
}

// A great carved head and shoulders on a block: sculpted face, long curly hair, toga drape.
// root.userData.setEyes(0..1) lights the eyes (glowing red, seen from any angle: the pool statues' warning).
// root.userData.setMouth(0..1) opens/closes the mouth (a dark hole); root.userData.mouth is that mesh,
// whose -Z direction is where a missile comes out. `scale` defaults to the yellow sandstone bust size
// (1.15 * 1.10 = 1.265); buildStatue passes its own pedestal scale so the two don't compound.
// A soft round glow (for the eyes), drawn over everything.
const eyeGlowMat = () => cached('eyeGlowMat', () => {
  const S = 64, c = document.createElement('canvas'); c.width = c.height = S; const x = c.getContext('2d');
  const g = x.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, 'rgba(255,240,200,1)'); g.addColorStop(.18, 'rgba(255,120,60,.95)'); g.addColorStop(.5, 'rgba(255,40,10,.35)'); g.addColorStop(1, 'rgba(255,0,0,0)');
  x.fillStyle = g; x.fillRect(0, 0, S, S);
  return new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false });
});

export function buildBust(seed = 1, m = stone(4), scale = 1.15 * 1.10) {
  const rnd = seededRandom(seed), root = new THREE.Group(); root.name = 'bust';
  add(root, new THREE.BoxGeometry(2.8, .9, 2.4), m, 0, .45, 0);                         // block
  add(root, shouldersGeometry(), m, 0, .9, 0);                                           // shoulders and chest
  // toga: two diagonal folds from the left shoulder down across the chest
  const path = [[-.75, 1.65], [-.35, 1.5], [.1, 1.3], [.55, 1.12], [.95, .98]];
  [[0, .13], [-.22, .1]].forEach(([dy, r]) => {
    const pts = path.map(([x, yw]) => {
      const y = yw + dy, f = 1 - .3 * sstep(.4, 1.35, Math.abs(x)), ny = (y - .9) / f, nx = x / 1.35;
      return new THREE.Vector3(x, y, -.7 * Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny)) - .02);
    });
    pts[0].z += .15; pts[pts.length - 1].z += .15; // ends sink into the cloth so the folds don't stop like fingers
    add(root, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 18, r, 6), m);
  });
  add(root, new THREE.CylinderGeometry(.36, .47, .8, 16), m, 0, 1.95, 0);               // neck
  const hg = new THREE.Group(); hg.position.z = -.12; root.add(hg);                       // head sits forward of the chest, as on a real neck                       // head sits forward of the chest, as on a real neck
  const headMat = m.clone(); headMat.vertexColors = true;                                // same stone, plus painted shading
  const hgeo = cached('bustHeadGeo', headGeometry); add(hg, hgeo, headMat, 0, HEAD.y, 0); // head (one shared buffer for every bust)
  // eyes: real eyeballs under upper and lower lids, set on the surface found in the head mesh
  const eyeGeo = new THREE.SphereGeometry(1, 12, 8);
  const glows = [], glowMat = eyeGlowMat().clone(), eyeBack = new THREE.Vector3(0, 0, -1), eyeZ = new THREE.Vector3(0, 0, 1), eyeN = new THREE.Vector3();
  const sdir = hgeo.attributes.sdir, hpos = hgeo.attributes.position, hnor = hgeo.attributes.normal;
  for (const s of [-1, 1]) {
    const lon = .52, lat = .05, ex0 = s * Math.sin(lon) * Math.cos(lat), ey0 = Math.sin(lat), ez0 = -Math.cos(lon) * Math.cos(lat);
    let best = -2, bi = 0;
    for (let i = 0; i < sdir.count; i++) { const dt = sdir.getX(i) * ex0 + sdir.getY(i) * ey0 + sdir.getZ(i) * ez0; if (dt > best) { best = dt; bi = i; } }
    const eye = new THREE.Group();
    eye.position.set(hpos.getX(bi), HEAD.y + hpos.getY(bi), hpos.getZ(bi));
    eyeN.set(hnor.getX(bi), hnor.getY(bi), hnor.getZ(bi));
    eye.quaternion.setFromUnitVectors(eyeBack, eyeN).multiply(new THREE.Quaternion().setFromAxisAngle(eyeZ, s * .12)); // outer corners a touch higher
    // local -Z points out of the face; the eyeball sits half in the orbit
    add(eye, eyeGeo, m, 0, 0, .04).scale.set(.1, .1, .1);                // eyeball
    hg.add(eye);
    const glow = new THREE.Sprite(glowMat); glow.name = 'eyeGlow'; glow.renderOrder = 10; glow.visible = false; // (named: kept apart by mergeStatic)
    glow.position.copy(eye.position).addScaledVector(eyeN, .12); // just out in front of the eye
    hg.add(glow); glows.push(glow);
  }
  for (const s of [-1, 1]) { // ears
    const ear = add(hg, new THREE.SphereGeometry(.2, 10, 7), m, s * HEAD.rx * .95, HEAD.y - .07, .1);
    ear.scale.set(.32, 1.3, .7); ear.rotation.z = -s * .12; // from brow line to nose base
  }
  // mouth hole: hidden while closed; a dark ellipse that grows taller when the statue opens its mouth
  const hole = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), new THREE.MeshBasicMaterial({ color: 0x030303 }));
  hole.position.set(0, HEAD.y - .55, -.66); hole.visible = false; hg.add(hole);
  root.userData.mouth = hole;
  root.userData.setEyes = o => { for (const g of glows) { g.visible = o > .02; g.scale.setScalar(.25 + .55 * o); g.material.opacity = Math.min(1, o * 1.4); } };
  root.userData.setMouth = o => { hole.visible = o > .02; hole.scale.set(.2, .004 + .1 * o, .04); };
  // hair: overlapping flattened curls hugging the skull, long down the sides and back to the neck
  const curlGeo = new THREE.SphereGeometry(1, 8, 5), up = new THREE.Vector3(0, 1, 0), n = new THREE.Vector3();
  const ex = HEAD.rx * 1.03, ey = HEAD.ry * 1.02, ez = HEAD.rz * 1.03;
  const curl = (e, th, size, long = 1) => {
    const ce = e < 0 ? Math.max(Math.cos(e), .82) : Math.cos(e);  // below the ears the hair keeps its width instead of tapering
    const dx = ce * Math.sin(th), dy = Math.sin(e), dz = -ce * Math.cos(th);
    const f = squareness(Math.cos(e) * Math.sin(th), Math.sin(e), -Math.cos(e) * Math.cos(th));
    const c = add(hg, curlGeo, m, dx * ex * f, HEAD.y + dy * ey * f, dz * ez * f);
    n.set(dx / ex, dy / ey, dz / ez).normalize();
    c.quaternion.setFromUnitVectors(up, n).multiply(new THREE.Quaternion().setFromAxisAngle(up, th * .6 + (rnd() - .5) * 1.2));
    c.scale.set(size * 1.5, size * .75, size * 1.15 * long);
  };
  const wrap = th => Math.abs(Math.atan2(Math.sin(th), Math.cos(th)));
  const hairline = th => { const c = (1 + Math.cos(th)) / 2; return -1.2 + 2.1 * Math.pow(c, 2.2); }; // low on the forehead, long at the sides and back
  [[1.45, 1], [1.15, 6], [.85, 11], [.55, 15], [.25, 18], [-.05, 18], [-.3, 16], [-.55, 12]].forEach(([e, cnt]) => {
    for (let i = 0; i < cnt; i++) {
      const th = cnt === 1 ? 0 : (i / cnt) * PI * 2 + (rnd() - .5) * .25 + e;
      if (e < hairline(th) - .05) continue;
      if (wrap(th) < 1.5 && e < 1.0) continue;                     // keep the face and forehead clear
      curl(e + (rnd() - .5) * .12, th, (.14 + rnd() * .05), 1);
    }
  });
  for (let i = 0; i < 9; i++) curl(.92 + rnd() * .06, -.85 + i * .21, .13 + rnd() * .03, 1.4); // fringe curls along a high hairline (forehead stays visible)
  for (const s of [-1, 1]) for (let k = 0; k < 4; k++) curl(.35 - k * .3, s * (1.65 + rnd() * .1), .15 + rnd() * .04, 1.4); // locks framing the face
  root.scale.setScalar(scale);                                                          // yellow sandstone bust: 26.5% up on the authored metres
  return root;
}

// What's left of a statue's bust once it's blown off (see wreck in world.js): the stump of its block,
// snapped off unevenly (low on one side), its broken top the same stone with a few soot patches, a
// jagged shard still standing on the high side and a few loose fragments lying on the break.
// Same footprint and scale as the bust's block (pass the bust's stone and scale).
export function buildStatueRuin(seed = 1, m = statueStone(), scale = .85 * 1.15 * 1.10) {
  const rnd = seededRandom(seed), root = new THREE.Group(); root.name = 'ruin';
  const W = 2.8, H = .9, D = 2.4, a = rnd() * PI * 2, ax = Math.cos(a), az = Math.sin(a);
  const hash = (x, z, k) => { const s = Math.sin(x * 127.1 + z * 311.7 + seed * 74.7 + k * 19.3) * 43758.5453; return s - Math.floor(s); };
  // the break: lower toward one side, with a rough step to it (same value for the same spot, so the faces meet)
  const breakAt = (x, z) => {
    const slope = .5 + .5 * (x * ax + z * az) / Math.hypot(W / 2, D / 2);
    return Math.min(H, .28 + .45 * slope + .22 * hash(Math.round(x * 20), Math.round(z * 20), 1));
  };
  const g = new THREE.BoxGeometry(W, H, D, 8, 3, 7); g.translate(0, H / 2, 0);
  const pos = g.attributes.position, col = [], c = new THREE.Color(), soot = new THREE.Color(0x2a2622);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i), h = breakAt(x, z), up = y / H;
    pos.setY(i, up * h);
    const k = Math.round(x * 20), q = Math.round(z * 20);
    if (up > .99) { // the broken top: the statue's own stone (a touch uneven), scorched in patches
      c.setScalar(.96 + .08 * hash(k, q, 2)); if (hash(k, q, 3) < .12) c.lerp(soot, .3);
    } else { c.setScalar(1); c.lerp(soot, up * up * .4 * hash(k, q, 4)); } // soot streaks running down from the break
    col.push(c.r, c.g, c.b);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  const rough = m.clone(); rough.vertexColors = true; rough.flatShading = true;
  const stump = new THREE.Mesh(g.toNonIndexed(), rough); stump.geometry.computeVertexNormals();
  stump.castShadow = stump.receiveShadow = true; root.add(stump);
  const frag = m.clone(); frag.flatShading = true; // (plain stone: no vertex colours)
  // a jagged shard of the block still standing on the high side
  const sx = ax * (W / 2 - .35), sz = az * (D / 2 - .35);
  const shard = add(root, new THREE.DodecahedronGeometry(.42, 0), frag, sx, breakAt(sx, sz) + .25, sz);
  shard.scale.set(.8, 1.5, .6); shard.rotation.set((rnd() - .5) * .5, rnd() * PI, (rnd() - .5) * .5);
  // loose fragments lying on the break
  for (let i = 0; i < 6; i++) {
    const r = .12 + rnd() * .16, x = (rnd() - .5) * (W - .6), z = (rnd() - .5) * (D - .6);
    const f = add(root, new THREE.DodecahedronGeometry(r, 0), frag, x, breakAt(x, z) + r * .4, z);
    f.scale.set(1, .55 + rnd() * .3, .8 + rnd() * .4); f.rotation.set(rnd() * PI, rnd() * PI, rnd() * PI);
  }
  root.scale.setScalar(scale);
  return root;
}

// A statue standing in a pool: the bust on a weathered two-tier pedestal rising out of the water,
// in a darker, water-stained stone (the NES draws them blue). Its mouth opens to fire a missile:
// root.userData.setMouth(0..1), root.userData.mouth.
export function buildStatue(seed = 1) {
  const root = new THREE.Group(); root.name = 'statue';
  const m = statueStone(), base = stone(6, 0x8a9294, '#a8a294');
  add(root, new THREE.BoxGeometry(3.2, 1.6, 3.2), base, 0, -.2, 0);       // footing, rising from the pool bed
  add(root, new THREE.BoxGeometry(2.7, .3, 2.7), base, 0, .75, 0);        // cap
  const b = buildBust(seed, m, .85 * 1.15 * 1.10);                        // pedestal scale passed in, so it doesn't compound
  b.position.y = .9;                                                      // seat it on the cap (top face at y = .9)
  root.add(b);
  root.userData.mouth = b.userData.mouth; root.userData.setMouth = b.userData.setMouth; root.userData.setEyes = b.userData.setEyes;
  return root;
}