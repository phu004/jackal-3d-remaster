// Stage 4's mossy boulders: a cluster of four rounded, weathered stones (the stage 1 rock's layout), overgrown. Each stone is a finely divided sphere pushed about by three scales of noise
// and clipped by a few flat planes (so it has broken faces and soft edges), smooth-shaded. Its colour is painted per vertex: grey-brown stone with strata, pale lichen, then moss over
// the upward faces and creeping down the sides in patches and over the foot, where the moss also stands proud of the stone in lumps. Six cushions of moss are heaped on the tops and
// shoulders, and tufts of grass round the base. A fine tiling grain / fibre texture is multiplied over it (and used as a bump map), mapped on by whichever axis each face looks along.
// One mesh, one material, so the level's mesh merging (which would drop the vertex colours) leaves it alone.
import * as THREE from 'three';
import { BufferGeometryUtils } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => a + (b - a) * t;

// Tileable grain: soft blotches, short fibres at every angle, pits and grit; near grey, averaging about .8 (the vertex colours carry the hue); also the bump map.
let detail = null;
function detailTexture() {
  if (detail || typeof document === 'undefined') return detail;
  const S = 512, c = document.createElement('canvas'); c.width = c.height = S; const x = c.getContext('2d');
  let sd = 11; const rnd = () => (sd = (sd * 9301 + 49297) % 233280) / 233280;
  x.fillStyle = 'rgb(205,205,205)'; x.fillRect(0, 0, S, S);
  const wrap = f => { for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) f(ox, oy); };
  for (let n = 0; n < 140; n++) { const px = rnd() * S, py = rnd() * S, r = 14 + rnd() * 40, light = rnd() < .5; wrap((ox, oy) => { const g = x.createRadialGradient(px + ox, py + oy, 0, px + ox, py + oy, r); g.addColorStop(0, light ? 'rgba(255,255,255,.07)' : 'rgba(40,40,40,.09)'); g.addColorStop(1, 'rgba(128,128,128,0)'); x.fillStyle = g; x.fillRect(px + ox - r, py + oy - r, r * 2, r * 2); }); }
  for (let n = 0; n < 4200; n++) { // fibres
    const px = rnd() * S, py = rnd() * S, a = rnd() * 6.283, l = 4 + rnd() * 11, light = rnd() < .5;
    x.strokeStyle = light ? `rgba(255,255,255,${.1 + rnd() * .14})` : `rgba(30,30,30,${.12 + rnd() * .16})`; x.lineWidth = .5 + rnd() * .7;
    wrap((ox, oy) => { x.beginPath(); x.moveTo(px + ox, py + oy); x.quadraticCurveTo(px + ox + Math.cos(a) * l * .5 + Math.sin(a) * 3, py + oy + Math.sin(a) * l * .5 - Math.cos(a) * 3, px + ox + Math.cos(a) * l, py + oy + Math.sin(a) * l); x.stroke(); });
  }
  for (let n = 0; n < 700; n++) { const px = rnd() * S, py = rnd() * S, r = .8 + rnd() * 2.2; wrap((ox, oy) => { x.fillStyle = 'rgba(25,25,25,.22)'; x.beginPath(); x.arc(px + ox, py + oy, r, 0, 6.283); x.fill(); x.fillStyle = 'rgba(255,255,255,.1)'; x.beginPath(); x.arc(px + ox + r * .5, py + oy + r * .5, r * .6, 0, 6.283); x.fill(); }); } // pits
  for (let n = 0; n < 9000; n++) { const px = rnd() * S, py = rnd() * S; x.fillStyle = rnd() < .5 ? 'rgba(255,255,255,.12)' : 'rgba(0,0,0,.15)'; wrap((ox, oy) => x.fillRect(px + ox, py + oy, 1 + rnd(), 1 + rnd())); } // grit
  detail = new THREE.CanvasTexture(c); detail.wrapS = detail.wrapT = THREE.RepeatWrapping; detail.anisotropy = 8;
  return detail;
}
let material = null;
const getMaterial = () => material ??= (() => { const d = detailTexture(); return new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, side: THREE.DoubleSide, envMapIntensity: .2, map: d, bumpMap: d, bumpScale: .7, color: d ? new THREE.Color(1.25, 1.25, 1.25) : 0xffffff }); })();

// kind 'moss' (stage 4: grey stone, green moss) or 'dirt' (stage 1: warm sandstone, drifts and crusts of dry earth, dead grass): the same shapes, painted differently.
const PALETTES = {
  moss: { stone: [.46, .44, .39], warm: [.05, .02, -.02], lichen: [.62, .66, .5], coverDark: [.12, .25, .06], coverRange: [.1, .14, .04], coverBright: [.34, .5, .15], coverBrightRange: [.08, .1, .05], soil: [.26, .2, .12], blade: [[.14, .27, .08], [.2, .36, .11], [.34, .5, .2]], tufts: 70, scale: 1.25 },
  dirt: { stone: [.56, .39, .23], warm: [.07, .03, -.03], lichen: [.76, .63, .43], coverDark: [.34, .24, .14], coverRange: [.08, .06, .04], coverBright: [.58, .45, .28], coverBrightRange: [.07, .07, .05], soil: [.3, .2, .12], blade: [[.34, .27, .12], [.5, .42, .2], [.66, .58, .32]], tufts: 26, scale: 1.1 },
};

// low: a much cheaper copy (a fifth of the triangles, few cushions and tufts) for the many boulders instanced over the jungle floor.
export function buildMossyRock(seed = 1, kind = 'moss', low = false) {
  const P = PALETTES[kind];
  let s = seed * 9301 + 49297; const rnd = () => (s = (s * 9301 + 49297) % 233280) / 233280;
  const hash = (x, y, z) => { let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(z, 1274126177) + seed * 7919; h = Math.imul(h ^ (h >>> 13), 1103515245); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
  const noise3 = (x, y, z) => {
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), fx = x - xi, fy = y - yi, fz = z - zi, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy), w = fz * fz * (3 - 2 * fz);
    return mix(mix(mix(hash(xi, yi, zi), hash(xi + 1, yi, zi), u), mix(hash(xi, yi + 1, zi), hash(xi + 1, yi + 1, zi), u), v), mix(mix(hash(xi, yi, zi + 1), hash(xi + 1, yi, zi + 1), u), mix(hash(xi, yi + 1, zi + 1), hash(xi + 1, yi + 1, zi + 1), u), v), w);
  };
  const parts = [], _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _f = new THREE.Vector3();

  // The paint: [r, g, b] at q (rock space) with the surface normal n; `all` forces moss everywhere (the cushions).
  const paint = (q, n, all = false) => {
    const ny = n.y, h = noise3(q.x * 7, q.y * 7, q.z * 7), h2 = noise3(q.x * 1.8 + 9, q.y * 1.8, q.z * 1.8), spot = noise3(q.x * 19, q.y * 19, q.z * 19), band = .5 + .5 * Math.sin(q.y * 7 + noise3(q.x * 2, q.y * 2, q.z * 2) * 5);
    const k = .78 + band * .14 + (h2 - .5) * .3 + (spot - .5) * .12, warm = noise3(q.x * 1.2 + 30, q.y, q.z * 1.2);
    let c = [(P.stone[0] + P.warm[0] * warm) * k, (P.stone[1] + P.warm[1] * warm) * k, (P.stone[2] + P.warm[2] * warm) * k]; // the stone
    const lich = sm(.66, .82, noise3(q.x * 3.3 + 50, q.y * 3.3, q.z * 3.3)) * .6; // pale grey-green lichen patches
    c = [mix(c[0], P.lichen[0], lich), mix(c[1], P.lichen[1], lich), mix(c[2], P.lichen[2], lich)];
    const top = sm(.02, .5, ny + (h2 - .5) * .9 + (h - .5) * .35), side = sm(.6, 0, q.y) * (.35 + .65 * h) * .85, patches = sm(.58, .75, noise3(q.x * 2.4 + 70, q.y * 2.4, q.z * 2.4)) * .8;
    const m = all ? 1 : Math.min(1, Math.max(top, side, patches * sm(-.4, .2, ny))) * (ny < -.3 ? .3 : 1);
    const dark = [P.coverDark[0] + P.coverRange[0] * h, P.coverDark[1] + P.coverRange[1] * h2, P.coverDark[2] + P.coverRange[2] * spot], bright = [P.coverBright[0] + P.coverBrightRange[0] * spot, P.coverBright[1] + P.coverBrightRange[1] * h, P.coverBright[2] + P.coverBrightRange[2] * h2], t = sm(.3, .75, h2 * .6 + spot * .4);
    const g = [mix(dark[0], bright[0], t), mix(dark[1], bright[1], t), mix(dark[2], bright[2], t)];
    c = [mix(c[0], g[0], m * .95), mix(c[1], g[1], m * .95), mix(c[2], g[2], m * .95)];
    const low = Math.max(0, -ny) * .35, soil = Math.min(1, Math.max(0, (.18 - q.y) / .5)) * .6 * (.7 + spot * .6); // darker underneath; the foot takes on the soil's colour
    return [mix(c[0] * (1 - low), P.soil[0], soil), mix(c[1] * (1 - low), P.soil[1], soil), mix(c[2] * (1 - low), P.soil[2], soil)];
  };

  // geo (already placed and turned): smooth normals, then split into triangles with each one's texture coordinates (projected along the axis it looks most along) and vertex colours.
  const finish = (geo, all = false) => {
    geo.deleteAttribute('uv'); geo.deleteAttribute('normal');
    const w = BufferGeometryUtils.mergeVertices(geo); w.computeVertexNormals();
    let g = w.toNonIndexed(); // (the part under the ground is never seen: its triangles are dropped, a third of a stone's)
    { const p0 = g.attributes.position, keep = []; for (let i = 0; i < p0.count; i += 3) if (Math.max(p0.getY(i), p0.getY(i + 1), p0.getY(i + 2)) > .04) keep.push(i, i + 1, i + 2);
      const pa = new Float32Array(keep.length * 3), na = new Float32Array(keep.length * 3); const n0 = g.attributes.normal; keep.forEach((v, k) => { pa[k * 3] = p0.getX(v); pa[k * 3 + 1] = p0.getY(v); pa[k * 3 + 2] = p0.getZ(v); na[k * 3] = n0.getX(v); na[k * 3 + 1] = n0.getY(v); na[k * 3 + 2] = n0.getZ(v); });
      g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pa, 3)); g.setAttribute('normal', new THREE.BufferAttribute(na, 3)); }
    const pos = g.attributes.position, nor = g.attributes.normal, n = pos.count, uv = new Float32Array(n * 2), col = new Float32Array(n * 3), SC = .9;
    for (let i = 0; i < n; i += 3) {
      _a.fromBufferAttribute(pos, i); _b.fromBufferAttribute(pos, i + 1); _c.fromBufferAttribute(pos, i + 2); _f.crossVectors(_b.clone().sub(_a), _c.clone().sub(_a));
      const ax = Math.abs(_f.x), ay = Math.abs(_f.y), az = Math.abs(_f.z);
      for (let j = 0; j < 3; j++) {
        const q = [_a, _b, _c][j], [u, v] = ax >= ay && ax >= az ? [q.z, q.y] : ay >= az ? [q.x, q.z] : [q.x, q.y], nn = new THREE.Vector3(nor.getX(i + j), nor.getY(i + j), nor.getZ(i + j)), c = paint(q, nn, all);
        uv[(i + j) * 2] = u * SC; uv[(i + j) * 2 + 1] = v * SC; col[(i + j) * 3] = c[0]; col[(i + j) * 3 + 1] = c[1]; col[(i + j) * 3 + 2] = c[2];
      }
    }
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.setAttribute('color', new THREE.BufferAttribute(col, 3)); parts.push(g);
  };

  // A stone: unit sphere (divided `detail` times), its radius wandering with noise, clipped by flat planes, then squashed, turned and set down.
  const stone = (x, z, r, detail, lift = 0) => {
    const g = new THREE.IcosahedronGeometry(1, detail), p = g.attributes.position, dir = new THREE.Vector3(), o = rnd() * 40;
    const cuts = []; for (let i = 0; i < 5; i++) cuts.push({ n: new THREE.Vector3(rnd() - .5, rnd() - .5, rnd() - .5).normalize(), d: .66 + rnd() * .2 });
    for (let i = 0; i < p.count; i++) {
      dir.fromBufferAttribute(p, i).normalize();
      let rr = .92 + (noise3(dir.x * 1.3 + o, dir.y * 1.3, dir.z * 1.3) - .5) * .4 + (noise3(dir.x * 3.4 + o, dir.y * 3.4, dir.z * 3.4) - .5) * .18 + (noise3(dir.x * 9 + o, dir.y * 9, dir.z * 9) - .5) * .06;
      for (const c of cuts) { const k = dir.dot(c.n); if (k > .01) rr = Math.min(rr, c.d / k + .06 * (rr - c.d / k > 0 ? 0 : 1)); }
      rr += sm(.1, .6, dir.y + (noise3(dir.x * 2 + o, dir.y * 2, dir.z * 2) - .5) * .9) * (.02 + .05 * noise3(dir.x * 15 + o, dir.y * 15, dir.z * 15)); // (moss stands a little proud of the stone, in lumps)
      p.setXYZ(i, dir.x * rr, dir.y * rr, dir.z * rr);
    }
    g.scale(r, r * .75, r); g.rotateY(rnd() * 6.283); g.translate(x, r * .55 + lift, z);
    finish(g);
  };
  const m1 = 1.5 * (.9 + rnd() * .25), m2 = 1 * (.85 + rnd() * .3), m3 = 1.1 * (.85 + rnd() * .3);
  if (low) { stone(0, 0, m1, 3); stone(.95, .5, m2, 2); stone(-.85, -.3, m3, 2); stone(.2, -.2, .85 + rnd() * .2, 2, .75); }
  else { stone(0, 0, m1, 8); stone(.95, .5, m2, 6); stone(-.85, -.3, m3, 7); stone(.2, -.2, .85 + rnd() * .2, 6, .75); }

  for (let i = 0, nc = low ? 2 : 6; i < nc; i++) { // cushions of moss lumped on the tops and shoulders
    const r = .3 + rnd() * .35, a = rnd() * 6.283, d = rnd() * 1.1, g = new THREE.IcosahedronGeometry(1, low ? 1 : 4), p = g.attributes.position, dir = new THREE.Vector3(), o = rnd() * 40;
    for (let k = 0; k < p.count; k++) { dir.fromBufferAttribute(p, k).normalize(); const rr = 1 + (noise3(dir.x * 4 + o, dir.y * 4, dir.z * 4) - .5) * .35 + (noise3(dir.x * 13 + o, dir.y * 13, dir.z * 13) - .5) * .12; p.setXYZ(k, dir.x * rr, dir.y * rr, dir.z * rr); }
    g.scale(r, r * .45, r * (.8 + rnd() * .4)); g.rotateY(rnd() * 6.283); g.translate(Math.cos(a) * d, .75 + (1 - d / 1.4) * .55 + rnd() * .25, Math.sin(a) * d);
    finish(g, true);
  }

  // tufts of grass round the foot: curved blades, dark at the root, paler at the tip, lit as if facing up
  const pos = [], nor = [], col = [], uv = [];
  for (let i = 0, nt = low ? Math.ceil(P.tufts / 4) : P.tufts; i < nt; i++) {
    const a = rnd() * 6.283, d = 1.2 + rnd() * 1.7, bx = Math.cos(a) * d, bz = Math.sin(a) * d, tuft = 3 + Math.floor(rnd() * 3);
    for (let b = 0; b < tuft; b++) {
      const ba = rnd() * 6.283, off = rnd() * .12, x0 = bx + Math.cos(ba) * off, z0 = bz + Math.sin(ba) * off, h = .25 + rnd() * .4, w = .035 + rnd() * .03, lean = .1 + rnd() * .22, ta = rnd() * 6.283, k = .8 + rnd() * .4;
      const sx = -Math.sin(ta) * w, sz = Math.cos(ta) * w, mx = x0 + Math.cos(ta) * lean * h * .9, mz = z0 + Math.sin(ta) * lean * h * .9, tx = x0 + Math.cos(ta) * lean * h * 2.4, tz = z0 + Math.sin(ta) * lean * h * 2.4;
      pos.push(x0 - sx, 0, z0 - sz, x0 + sx, 0, z0 + sz, mx - sx * .6, h * .55, mz - sz * .6, x0 + sx, 0, z0 + sz, mx + sx * .6, h * .55, mz + sz * .6, mx - sx * .6, h * .55, mz - sz * .6, mx - sx * .6, h * .55, mz - sz * .6, mx + sx * .6, h * .55, mz + sz * .6, tx, h, tz);
      for (let v = 0; v < 9; v++) { nor.push(0, 1, 0); uv.push(0, 0); }
      const [lo, mid, hi] = P.blade; for (const [r, g, b2] of [lo, lo, mid, lo, mid, mid, mid, mid, hi]) col.push(r * k, g * k, b2 * k);
    }
  }
  const blades = new THREE.BufferGeometry();
  blades.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); blades.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); blades.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); blades.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  if (pos.length) parts.push(blades); // (none on the dirt rocks)

  const all = BufferGeometryUtils.mergeBufferGeometries(parts); all.scale(P.scale, P.scale, P.scale); // (the NES sprite: moss rocks a good 5 m across, the stage 1 ones 4)
  const mesh = new THREE.Mesh(all, getMaterial()); mesh.castShadow = mesh.receiveShadow = true;
  const root = new THREE.Group(); root.name = 'rock'; root.add(mesh);
  return root;
}
