// Stage 4's swamp trees: dead bald-cypress trunks standing in the mud water, after the Left 4 Dead swamp. Bare: no limbs, no crown. Each is a tall, fluted trunk with a wide
// flared foot of buttress roots, and cypress "knees" poking up out of the water round it. Some are snapped off partway up: a jagged, splintered break, and the upper part
// hanging down from it to lie in the water. Procedural: four variants (two whole, two broken) are built, then placed instanced, each turned and scaled a little differently and
// tinted. They stand where the water is deep enough to hold them (a margin in from the shore), spaced out so the jeep can wind between them; the trunks block the jeep and
// stop shots (returned as boxes). They are mirrored in the water, and cast shadows.
import * as THREE from 'three';
import { BufferGeometryUtils } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { REFLECT, SHADOW_ONLY } from './layers.js';

const H = 9;            // m: a whole tree's height before its own scale (.85-1.25)
const TRUNK_HALF = .55; // m: half-width of the box a trunk blocks (at the foot, before scale)
const MAX_TREES = 22;
const BROKEN = [4.3, 6.2]; // m: how high the two broken variants snap (variants 2 and 3)

const hash = (x, y, seed) => { let h = Math.imul(Math.floor(x), 374761393) + Math.imul(Math.floor(y), 668265263) + seed; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const vnoise = (x, y, seed) => { const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy); const a = hash(xi, yi, seed), b = hash(xi + 1, yi, seed), c = hash(xi, yi + 1, seed), d = hash(xi + 1, yi + 1, seed); return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v; };
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// geo transformed by m, made non-indexed with its normals kept, coloured per vertex by colour(x, y, z, nx, ny, nz) -> [r, g, b]; only position, normal and color kept.
function part(geo, m, colour, cylindrical = false) {
  let g = geo.clone(); g.deleteAttribute('uv'); if (!g.attributes.normal) g.computeVertexNormals();
  g.applyMatrix4(m); if (g.index) g = g.toNonIndexed();
  const p = g.attributes.position, n = g.attributes.normal, col = new Float32Array(p.count * 3), uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) { const c = colour(p.getX(i), p.getY(i), p.getZ(i), n.getX(i), n.getY(i), n.getZ(i)); col[i * 3] = c[0]; col[i * 3 + 1] = c[1]; col[i * 3 + 2] = c[2]; }
  // uvs for the detail texture: round the trunk (cylindrical, each triangle unwrapped so none stretches across the seam), planar for the small parts
  for (let i = 0; i < p.count; i += 3) {
    const us = [0, 1, 2].map(k => cylindrical ? Math.atan2(p.getZ(i + k), p.getX(i + k)) / 6.2832 * 12 : p.getX(i + k) * 3.2 + p.getZ(i + k) * 2.1);
    if (cylindrical) { const lo = Math.min(...us), hi = Math.max(...us); if (hi - lo > 6) for (let k = 0; k < 3; k++) if (us[k] < 0) us[k] += 12; } // (crossing the seam)
    for (let k = 0; k < 3; k++) { uv[(i + k) * 2] = us[k]; uv[(i + k) * 2 + 1] = p.getY(i + k) * 2.6; }
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

// A fine, tileable detail texture multiplied over the vertex colours (it averages about 1): moss as fuzzy fibres and tiny clumps, bark as grain, with soft dark hollows; also used as the bump map.
function mossDetailTexture() {
  if (typeof document === 'undefined') return null;
  const S = 256, c = document.createElement('canvas'); c.width = c.height = S; const x = c.getContext('2d');
  let sd = 5; const rnd = () => (sd = (sd * 9301 + 49297) % 233280) / 233280;
  x.fillStyle = 'rgb(205,205,205)'; x.fillRect(0, 0, S, S);
  const wrap = f => { for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) f(ox, oy); }; // (drawn wrapped, so the tile has no seams)
  for (let n = 0; n < 90; n++) { const px = rnd() * S, py = rnd() * S, r = 10 + rnd() * 26, light = rnd() < .5; wrap((ox, oy) => { const g = x.createRadialGradient(px + ox, py + oy, 0, px + ox, py + oy, r); g.addColorStop(0, light ? 'rgba(255,255,255,.06)' : 'rgba(40,40,40,.08)'); g.addColorStop(1, 'rgba(128,128,128,0)'); x.fillStyle = g; x.fillRect(px + ox - r, py + oy - r, r * 2, r * 2); }); } // clumps and hollows
  for (let n = 0; n < 1600; n++) { // fibres: short curved strokes at every angle, light and dark
    const px = rnd() * S, py = rnd() * S, a = rnd() * 6.283, l = 3 + rnd() * 7, light = rnd() < .5;
    x.strokeStyle = light ? `rgba(255,255,255,${.12 + rnd() * .14})` : `rgba(30,30,30,${.14 + rnd() * .16})`; x.lineWidth = .5 + rnd() * .6;
    wrap((ox, oy) => { x.beginPath(); x.moveTo(px + ox, py + oy); x.quadraticCurveTo(px + ox + Math.cos(a) * l * .5 + Math.sin(a) * 2, py + oy + Math.sin(a) * l * .5 - Math.cos(a) * 2, px + ox + Math.cos(a) * l, py + oy + Math.sin(a) * l); x.stroke(); });
  }
  for (let n = 0; n < 2500; n++) { const px = rnd() * S, py = rnd() * S; x.fillStyle = rnd() < .5 ? 'rgba(255,255,255,.12)' : 'rgba(0,0,0,.15)'; wrap((ox, oy) => x.fillRect(px + ox, py + oy, 1 + rnd(), 1 + rnd())); } // grit
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; return t;
}

// A trunk's profile (radius by height), from the flared foot up; cut off at `top` (m).
const PROFILE = [[.98, -.7], [.82, 0], [.64, .6], [.47, 1.5], [.36, 3], [.3, 5], [.255, 7], [.21, 8.5], [.13, 9]]; // (slim: a cypress dead for years, the foot still flared)
const radiusAt = y => { for (let i = 1; i < PROFILE.length; i++) if (y <= PROFILE[i][1]) { const [r0, y0] = PROFILE[i - 1], [r1, y1] = PROFILE[i]; return r0 + (r1 - r0) * (y - y0) / (y1 - y0); } return .2; };
const profileTo = (top, n) => { const pts = []; for (let i = 0; i <= n; i++) { const y = -.7 + (top + .7) * Math.pow(i / n, 1.3); pts.push(new THREE.Vector2(radiusAt(y), y)); } return pts; }; // (finely divided, closer together toward the foot)
const ridge = (a, y, seed) => Math.pow(.5 + .5 * Math.sin(a * 8 + vnoise(a * 2 + 3, y * .5, seed) * 4), 1.5); // the bark's furrows: 0 in a groove, 1 on a ridge, wandering up the trunk

// variant: 0, 1 whole; 2, 3 broken (at BROKEN[variant - 2]). low: a much cheaper copy (a thin ten-sided trunk and the hanging part, no stubs, knees or splinters) for the shadow map and the
// reflection, which cannot show the detail.
function buildVariant(variant, low = false) {
  const seed = variant + 1; let s = seed * 7919 + 13; const rnd = () => (s = (s * 9301 + 49297) % 233280) / 233280;
  const ph = rnd() * 6.283, lean = (rnd() - .5) * .22, I = new THREE.Matrix4(), bark = [];
  const hb = variant >= 2 ? BROKEN[variant - 2] : null, top = hb ?? H;

  // the trunk: a lathe profile with a wide flared foot, ridged and lobed into buttresses, a little crooked
  let tg = new THREE.LatheGeometry(profileTo(top, low ? 9 : 20), low ? 10 : 18); tg.deleteAttribute('uv'); tg.deleteAttribute('normal');
  const tp = tg.attributes.position;
  for (let i = 0; i < tp.count; i++) {
    const x = tp.getX(i), y = tp.getY(i), z = tp.getZ(i), a = Math.atan2(z, x), r = Math.hypot(x, z);
    const lobe = Math.pow(Math.max(0, Math.sin(a * 6 + ph)), 3) * Math.max(0, (3 - y) / 3) * .5; // (buttress roots: narrow ridges running up the foot, deep valleys between)
    const flute = Math.sin(a * 9 + ph * 2) * .03 + (vnoise(a * 2 + 5, y * .8, seed) - .5) * .07;
    const knot = Math.max(0, hash(Math.floor(a * 2.2), Math.floor(y * 1.6), seed + 11) - .9) * 7 * Math.sin(Math.PI * ((y * 1.6) % 1)) * Math.sin(Math.PI * ((a * 2.2 + 8) % 1)) * .05; // (a few knots and burls)
    let r2 = r * (1 + flute) + lobe + (ridge(a, y, seed) - .5) * (.045 - .02 * smooth(0, 3, y)) + knot;
    if (hb && y > hb - .9) r2 *= 1 - .45 * smooth(hb - .9, hb, y) * (.5 + .5 * Math.sin(a * 3 + ph)); // (the break: ragged, the wood torn thin on one side)
    const bend = Math.sin(y * .35 + ph) * .18 * (y / H) + lean * y * y * .05;
    const yy = hb && y > hb - .6 ? y - .55 * smooth(hb - .6, hb, y) * (.5 + .5 * Math.sin(a * 2 + ph * 3)) : y; // (and the top edge torn unevenly: one side lower)
    tp.setXYZ(i, Math.cos(a) * r2 + bend, yy, Math.sin(a) * r2 + lean * y * .12);
  }
  tg = BufferGeometryUtils.mergeVertices(tg); tg.computeVertexNormals();
  const barkColour = (x, y, z) => {
    const a = Math.atan2(z, x), rg = ridge(a, y, seed), groove = .7 + .4 * rg, streak = .75 + .5 * vnoise(a * 7 + 1, y * .5, seed + 3), wet = smooth(-.3, .8, y) * .5 + .5; // (grooves darker, ridges paler, long streaks, dark and wet at the water)
    const patch = vnoise(a * 2 + 9, y * .6, seed + 21), k = groove * streak * wet;
    let c = [.27 * k, .23 * k, .19 * k];
    const peel = smooth(.66, .8, patch) * smooth(.4, 1.2, y) * (1 - smooth(6, 8.5, y)); // paler grey where the bark has peeled and the weathered wood shows
    c = [c[0] + (.46 * groove - c[0]) * peel * .8, c[1] + (.42 * groove - c[1]) * peel * .8, c[2] + (.36 * groove - c[2]) * peel * .8];
    const lich = smooth(.7, .85, vnoise(a * 5 + 17, y * 1.4, seed + 31)) * smooth(.8, 2, y); // small pale-green lichen patches
    c = [c[0] + (.42 - c[0]) * lich * .45, c[1] + (.46 - c[1]) * lich * .45, c[2] + (.32 - c[2]) * lich * .45];
    const mn = vnoise(a * 1.6 + ph, y * .9, seed + 7), mn2 = vnoise(a * 4 + 3, y * 3, seed + 17); // moss: patches up the lower trunk, and the roots well covered but not buried, uneven
    let mo = smooth(.42, .72, mn) * (1 - smooth(2.1, 4.6, y)) * smooth(-.4, .3, y);
    mo = Math.min(1, Math.max(mo, (1 - smooth(.4, 1.5, y)) * (.55 + .3 * mn2)));
    const mk = .8 + .4 * mn2;
    return [c[0] + (.2 * mk - c[0]) * mo * .95, c[1] + (.34 * mk - c[1]) * mo * .95, c[2] + (.1 * mk - c[2]) * mo * .95];
  };
  bark.push(part(tg, I, barkColour, true));

  const tmp = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
  // the stumps of dead limbs: short broken stubs standing out of the trunk, some with a splintered end
  for (let i = 0, n = low ? 0 : 3 + Math.floor(rnd() * 3); i < n; i++) {
    const hh = 2.2 + rnd() * ((hb ?? H) - 3.2), a = rnd() * 6.283, len = .3 + rnd() * .7, r = .045 + rnd() * .05, rr = radiusAt(hh) * .85;
    if (hh > (hb ?? H) - .8) continue;
    const g = new THREE.CylinderGeometry(r * .55, r, len, 5, 1, false).translate(0, len / 2, 0), e = .9 + rnd() * .5;
    tmp.compose(new THREE.Vector3(Math.cos(a) * rr, hh, Math.sin(a) * rr), q.setFromUnitVectors(up, new THREE.Vector3(Math.cos(a) * Math.sin(e), Math.cos(e), Math.sin(a) * Math.sin(e))), new THREE.Vector3(1, 1, 1));
    bark.push(part(g, tmp, (x, y, z) => { const k = .75 + .4 * hash(x * 30, z * 30 + y * 7, seed); return [.3 * k, .25 * k, .2 * k]; }));
  }
  if (hb) {
    // splinters standing up from the break: thin pale spikes of torn wood, tilted every way
    const rb = radiusAt(hb) * .8;
    for (let i = 0, n = low ? 0 : 7 + Math.floor(rnd() * 4); i < n; i++) {
      const a = rnd() * 6.283, h = .3 + rnd() * rnd() * 1.4, r = .05 + rnd() * .09, d = rb * (.2 + rnd() * .75);
      const g = new THREE.ConeGeometry(r, h, 4, 1, true).translate(0, h / 2, 0);
      tmp.compose(new THREE.Vector3(Math.cos(a) * d, hb - .5, Math.sin(a) * d), q.setFromEuler(new THREE.Euler((rnd() - .5) * .7, rnd() * 6, (rnd() - .5) * .7)), new THREE.Vector3(1, 1, 1));
      bark.push(part(g, tmp, (x, y) => { const k = .85 + .3 * hash(x * 40, y * 40, seed); return [.52 * k, .44 * k, .32 * k]; })); // (pale: the wood inside)
    }
    // the upper part: snapped, but still hanging by a strip of bark, it swings down out over the water and lies in it, its far end under the surface
    const len = (H - hb) * 1.15, r0 = radiusAt(hb) * .95, a = ph + 1.1;
    const g = new THREE.CylinderGeometry(.2, r0, len, low ? 6 : 9, low ? 2 : 5, true).translate(0, len / 2, 0), gp = g.attributes.position;
    for (let i = 0; i < gp.count; i++) { const y = gp.getY(i), f = 1 + (vnoise(Math.atan2(gp.getZ(i), gp.getX(i)) * 2, y * 1.2, seed + 5) - .5) * .25; gp.setX(i, gp.getX(i) * f); gp.setZ(i, gp.getZ(i) * f); }
    g.computeVertexNormals();
    const dy = hb - .25; // (how far down it has to reach to lie in the water)
    const dir = (len > dy ? new THREE.Vector3(Math.cos(a) * Math.sqrt(len * len - dy * dy), -dy, Math.sin(a) * Math.sqrt(len * len - dy * dy)) // (long enough: it reaches the water and lies in it)
      : new THREE.Vector3(Math.cos(a) * len * .45, -len * .9, Math.sin(a) * len * .45)).normalize(); // (too short to reach: it dangles from the break, hanging steeply; the cylinder's wide end is its base, at the break)
    q.setFromUnitVectors(up, dir);
    tmp.compose(new THREE.Vector3(Math.cos(a) * .3, hb - .35, Math.sin(a) * .3), q, new THREE.Vector3(1, 1, 1));
    bark.push(part(g, tmp, barkColour));
  }

  // cypress knees: little cones standing out of the water round the foot
  for (let i = 0, n = low ? 0 : 8 + Math.floor(rnd() * 4); i < n; i++) {
    const a = rnd() * 6.283, d = 1.2 + rnd() * rnd() * 3.2, h = .3 + rnd() * .7, r = .07 + rnd() * .09;
    const g = new THREE.ConeGeometry(r, h, 5, 1, true).translate(0, h / 2, 0); tmp.compose(new THREE.Vector3(Math.cos(a) * d, -.2, Math.sin(a) * d), q.setFromEuler(new THREE.Euler((rnd() - .5) * .2, rnd() * 6, (rnd() - .5) * .2)), new THREE.Vector3(1, 1, 1));
    bark.push(part(g, tmp, (x, y) => { const k = .8 + .4 * hash(x * 50, y * 50, seed), mo = (1 - smooth(-.1, .55, y)) * .75; return [(.32 * k) * (1 - mo) + .2 * k * mo, (.27 * k) * (1 - mo) + .34 * k * mo, (.21 * k) * (1 - mo) + .1 * k * mo]; })); // (knees: bark above, moss round the foot)
  }
  return BufferGeometryUtils.mergeBufferGeometries(bark);
}

// bounds: the swamp's extent; wet(x, z, margin): is that point on the water, margin px in from its edge; avoid: [{ x, z, r }] spots to keep clear (the start).
// Returns { boxes (for obstacles), update(dt) }.
export function buildSwampTrees(scene, { bounds, wet, avoid = [], seed = 77 }) {
  let sd = seed; const rnd = () => (sd = (sd * 9301 + 49297) % 233280) / 233280;
  const spots = [];
  for (let tries = 0; tries < 1500 && spots.length < MAX_TREES; tries++) {
    const x = bounds.x0 + rnd() * (bounds.x1 - bounds.x0), z = bounds.z0 + rnd() * (bounds.z1 - bounds.z0);
    if (!wet(x, z, 12)) continue;
    if (avoid.some(a => Math.hypot(a.x - x, a.z - z) < a.r)) continue;
    const near = spots.reduce((d, p) => Math.min(d, Math.hypot(p.x - x, p.z - z)), 1e9);
    if (near < 7.5) continue; // (spaced out: the jeep can wind between them)
    spots.push({ x, z });
  }
  if (!spots.length) return { boxes: [], update() {} };

  const detail = mossDetailTexture();
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, envMapIntensity: .12, map: detail, bumpMap: detail, bumpScale: .3, color: detail ? new THREE.Color(1.22, 1.22, 1.22) : 0xffffff }); // (the detail texture averages about .8: the colour makes up for it)
  const variants = [0, 1, 2, 3].map(v => buildVariant(v)), lows = [0, 1, 2, 3].map(v => buildVariant(v, true)), lists = variants.map(() => []);
  const lowMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, envMapIntensity: .12, shadowSide: THREE.FrontSide }); // (the low copy: the reflection's and the shadow map's)
  spots.forEach((p, i) => lists[(i % 2) * 2 + (Math.floor(i / 2) % 2)].push(p)); // exactly half whole (variants 0, 1) and half broken (2, 3), alternating through the (randomly scattered) spots
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), pos = new THREE.Vector3(), sc = new THREE.Vector3(), col = new THREE.Color(), up = new THREE.Vector3(0, 1, 0), boxes = [];
  const bs = new THREE.Box3(new THREE.Vector3(bounds.x0 - 14, -3, bounds.z0 - 14), new THREE.Vector3(bounds.x1 + 14, H * 1.3 + 3, bounds.z1 + 14)).getBoundingSphere(new THREE.Sphere());
  variants.forEach((geo, vi) => {
    const list = lists[vi]; if (!list.length) return;
    geo.boundingSphere = bs; lows[vi].boundingSphere = bs; // (the instances are placed in world coordinates: one sphere over the whole swamp, so the trees are skipped while it is off screen)
    const im = new THREE.InstancedMesh(geo, mat, list.length), lo = new THREE.InstancedMesh(lows[vi], lowMat, list.length); im.name = 'swampTree-' + vi; lo.name = 'swampTree-low-' + vi;
    list.forEach((p, j) => {
      const k = .85 + rnd() * .4; boxes.push({ x: p.x, z: p.z, hw: TRUNK_HALF * k, hd: TRUNK_HALF * k, alive: true, kind: 'swamptree' });
      pos.set(p.x, 0, p.z); q.setFromAxisAngle(up, rnd() * 6.283); sc.set(k, k, k); m.compose(pos, q, sc); col.setScalar(.88 + rnd() * .22);
      im.setMatrixAt(j, m); im.setColorAt(j, col); lo.setMatrixAt(j, m); lo.setColorAt(j, col);
    });
    im.castShadow = false; im.receiveShadow = true; im.frustumCulled = true; scene.add(im); // (seen in the main view only)
    lo.castShadow = true; lo.receiveShadow = false; lo.frustumCulled = true; lo.layers.set(REFLECT); lo.layers.enable(SHADOW_ONLY); scene.add(lo); // (the water's reflection and the shadow map only)
  });
  return { boxes, update() {} };
}
