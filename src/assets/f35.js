import * as THREE from 'three';
import { PI, add, mat, cached, seededRandom } from './common.js';

// Static ground asset: the Lockheed Martin F-35A Lightning II, parked on its gear. It is never meant to fly, so the
// landing gear is permanently down and there is no moving flight hardware. Real-world scale: ~15.7 m long,
// 10.7 m wingspan, ~4.3 m tall to the fin tips.
// Origin on the fuselage axis at mid-length, the nose faces -Z (the tail is at +Z), +Y is up. The wheels touch
// the ground at y = `f35.groundY` (negative), so set the group's position.y to -groundY to stand it on y = 0.
// Named parts: `fuselage`, `wingL`/`wingR`, `finL`/`finR` (canted twin tails), `stabL`/`stabR` (all-moving tailplanes),
// `intakeL`/`intakeR`, `canopy` (a low teardrop group hinged at its rear tip; call `f35.setCanopyOpen(true)` to raise it),
// `gear` (nose + both main legs, with doors), `boomL`/`boomR` (tail booms), `spineShroud` (fairing over the nozzle), `nozzle` (recessed) and `eots` (chin sensor window).
// Everything is built from lofted sections (flat-shaded stealth panels on the wings and tails, a smooth blended
// fuselage), which keeps it at roughly 5-6k triangles.



const pmat = (c, r, m, o) => mat(c, r, m, Object.assign({ envMapIntensity: .35 }, o));
const V = (x, y, z) => new THREE.Vector3(x, y, z);

// Low-visibility grey paint (the F-35's own gunmetal-silver): a smooth satin finish, cloudy and uneven where the coating has aged, a few fine panel lines that wander and stop short (no regular grid), flush fasteners,
// scuffs, and soot and rain streaks. No camouflage. One tile covers SKIN_TILE metres (the tile is large, so a repeat is not noticed over a 15 m jet).
const SKIN_TILE = 9.0;
function skinTexture() {
  const S = 1024, c = document.createElement('canvas'); c.width = c.height = S; const x = c.getContext('2d');
  const rnd = seededRandom(35);
  x.fillStyle = '#6f757b'; x.fillRect(0, 0, S, S);
  const blob = (cx, cy, rad, col, alpha) => { // soft cloudy variation in the paint, seamless across the tile
    for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) {
      const g = x.createRadialGradient(cx + ox, cy + oy, 0, cx + ox, cy + oy, rad); g.addColorStop(0, col.replace('A', alpha)); g.addColorStop(1, col.replace('A', 0));
      x.fillStyle = g; x.fillRect(cx + ox - rad, cy + oy - rad, rad * 2, rad * 2);
    }
  };
  for (let i = 0; i < 40; i++) blob(rnd() * S, rnd() * S, 90 + rnd() * 180, 'rgba(200,208,216,A)', .10);
  for (let i = 0; i < 40; i++) blob(rnd() * S, rnd() * S, 80 + rnd() * 160, 'rgba(60,66,72,A)', .11);
  const line = (x0, y0, len, horiz, a) => { // a panel line: straight, a little off true, and it stops where a neighbouring panel takes over
    x.strokeStyle = `rgba(48,52,58,${a})`; x.lineWidth = 1.2 + rnd() * .8; x.beginPath();
    let px = x0, py = y0; x.moveTo(px, py);
    for (let d = 0; d < len; d += 40) { px += horiz ? 40 : (rnd() - .5) * 2; py += horiz ? (rnd() - .5) * 2 : 40; x.lineTo(px, py); }
    x.stroke();
    x.fillStyle = `rgba(48,52,58,${a * .8})`; // the fastener row beside it
    for (let d = 8; d < len; d += 26) { x.beginPath(); x.arc(horiz ? x0 + d : x0 + 6, horiz ? y0 + 6 : y0 + d, .9, 0, 7); x.fill(); }
  };
  for (let i = 0; i < 11; i++) line(rnd() * S * .6, rnd() * S, 160 + rnd() * 420, true, .3 + rnd() * .2);
  for (let i = 0; i < 11; i++) line(rnd() * S, rnd() * S * .6, 160 + rnd() * 420, false, .3 + rnd() * .2);
  for (let i = 0; i < 5; i++) { // a few rounded access hatches, faint
    const hx = rnd() * (S - 140), hy = rnd() * (S - 100), hw = 50 + rnd() * 70, hh = 36 + rnd() * 50, r = 8;
    x.strokeStyle = 'rgba(48,52,58,.32)'; x.lineWidth = 1.4; x.beginPath(); x.moveTo(hx + r, hy); x.arcTo(hx + hw, hy, hx + hw, hy + hh, r); x.arcTo(hx + hw, hy + hh, hx, hy + hh, r); x.arcTo(hx, hy + hh, hx, hy, r); x.arcTo(hx, hy, hx + hw, hy, r); x.stroke();
  }
  for (let i = 0; i < 90; i++) { // streaks running down: exhaust soot and rain
    const px = rnd() * S, py = rnd() * S, len = 40 + rnd() * 220, g = x.createLinearGradient(0, py, 0, py + len);
    g.addColorStop(0, `rgba(40,42,46,${.06 + rnd() * .12})`); g.addColorStop(1, 'rgba(40,42,46,0)');
    x.fillStyle = g; x.fillRect(px, py, 1 + rnd() * 4, len);
  }
  for (let i = 0; i < 50; i++) { x.fillStyle = `rgba(${215 + rnd() * 30 | 0},${220 + rnd() * 30 | 0},${225 + rnd() * 30 | 0},.3)`; x.fillRect(rnd() * S, rnd() * S, 2 + rnd() * 5, 1 + rnd() * 1.5); } // scuffs
  for (let i = 0; i < 9000; i++) { x.fillStyle = rnd() > .5 ? 'rgba(255,255,255,.04)' : 'rgba(20,24,28,.07)'; x.fillRect(rnd() * S, rnd() * S, 2, 2); } // fine grain
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
  return t;
}

// Brushed-metal panel texture for struts and fittings.
function metalTexture() {
  const S = 256, c = document.createElement('canvas'); c.width = c.height = S; const x = c.getContext('2d');
  const rnd = seededRandom(11);
  x.fillStyle = '#8e9296'; x.fillRect(0, 0, S, S);
  for (let i = 0; i < 400; i++) { x.strokeStyle = `rgba(255,255,255,${rnd() * .05})`; x.beginPath(); const y = rnd() * S; x.moveTo(0, y); x.lineTo(S, y + (rnd() - .5) * 4); x.stroke(); }
  x.strokeStyle = 'rgba(40,40,40,.5)'; x.lineWidth = 1;
  for (let i = 0; i < S; i += 32) { x.beginPath(); x.moveTo(0, i); x.lineTo(S, i); x.stroke(); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
  return t;
}

// The lifting surfaces' texture, mapped over their own planform (u root to tip, v leading edge to trailing edge): a light silver-grey border of radar-absorbent tape all round (the leading and trailing edges, the tip),
// a darker inset panel inside it, a hinge line and rib where the flap and aileron split, access hatches, fastener rows and light wear.
function wingTexture() {
  const W = 512, H = 512, c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d');
  const rnd = seededRandom(77), P = (u, v) => [u * W, (1 - v) * H]; // (canvas y runs down: v 0 at the bottom of the canvas is the leading edge)
  x.fillStyle = '#868c93'; x.fillRect(0, 0, W, H); // the tape
  const poly = (pts, fill, stroke, lw = 2) => { x.beginPath(); pts.forEach(([u, v], i) => { const [px, py] = P(u, v); i ? x.lineTo(px, py) : x.moveTo(px, py); }); x.closePath(); if (fill) { x.fillStyle = fill; x.fill(); } if (stroke) { x.strokeStyle = stroke; x.lineWidth = lw; x.stroke(); } };
  const U0 = -.05, U1 = .9, V0 = .19, V1 = .85, ch = .05; // the inset panel (it runs on into the fuselage at the root), its outer corners chamfered
  poly([[U0, V0], [U1 - ch, V0], [U1, V0 + ch * 1.2], [U1, V1 - ch * 1.2], [U1 - ch, V1], [U0, V1]], '#565d64', 'rgba(30,34,38,.7)', 2);
  const seg = (a, b, col = 'rgba(28,32,36,.75)', lw = 1.6) => { x.strokeStyle = col; x.lineWidth = lw; x.beginPath(); x.moveTo(...P(...a)); x.lineTo(...P(...b)); x.stroke(); };
  seg([.04, .56], [.84, .56]); seg([.46, .56], [.46, V1]); seg([.04, .66], [.84, .66], 'rgba(28,32,36,.4)', 1); // hinge line, the rib between flap and aileron, a second line behind it
  for (const [u0, v0, u1, v1] of [[.12, .27, .3, .43], [.36, .3, .5, .42], [.62, .26, .78, .38]]) { // access hatches
    poly([[u0, v0], [u1, v0], [u1, v1], [u0, v1]], 'rgba(150,157,164,.18)', 'rgba(28,32,36,.6)', 1.4);
  }
  x.fillStyle = 'rgba(25,28,32,.55)'; // fastener rows along the inset's edge
  for (let u = U0 + .03; u < U1 - .03; u += .035) for (const v of [V0 + .016, V1 - .016]) { const [px, py] = P(u, v); x.beginPath(); x.arc(px, py, 1.1, 0, 7); x.fill(); }
  x.fillStyle = 'rgba(25,28,32,.4)'; // and along the tape's outer edge
  for (let u = .02; u < .98; u += .04) for (const v of [.03, .97]) { const [px, py] = P(u, v); x.beginPath(); x.arc(px, py, 1, 0, 7); x.fill(); }
  for (let i = 0; i < 24; i++) { // soft wear and soot
    const [px, py] = P(rnd(), rnd()), r = 30 + rnd() * 60, g = x.createRadialGradient(px, py, 0, px, py, r), dark = rnd() < .6;
    g.addColorStop(0, dark ? 'rgba(20,24,28,.12)' : 'rgba(210,216,222,.1)'); g.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = g; x.fillRect(px - r, py - r, r * 2, r * 2);
  }
  for (let i = 0; i < 2500; i++) { x.fillStyle = rnd() > .5 ? 'rgba(255,255,255,.04)' : 'rgba(20,24,28,.07)'; x.fillRect(rnd() * W, rnd() * H, 2, 2); }
  const t = new THREE.CanvasTexture(c); t.anisotropy = 8;
  return t;
}

// Give every skin-painted mesh box-projected UVs in the aircraft's own space, so the texture has the same scale on
// every panel and flows across neighbouring parts.
function projectSkin(root, skin) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert(), p = new THREE.Vector3(), n = new THREE.Vector3();
  root.traverse(m => {
    if (!m.isMesh || (Array.isArray(m.material) ? m.material[0] : m.material) !== skin) return;
    const g = m.geometry, toRoot = new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld), nm = new THREE.Matrix3().getNormalMatrix(toRoot);
    const pos = g.attributes.position, nor = g.attributes.normal, uv = new Float32Array(pos.count * 2);
    for (let i = 0; i < pos.count; i++) {
      p.fromBufferAttribute(pos, i).applyMatrix4(toRoot); n.fromBufferAttribute(nor, i).applyMatrix3(nm);
      const ax = Math.abs(n.x), ay = Math.abs(n.y), az = Math.abs(n.z);
      const [u, v] = ax >= ay && ax >= az ? [p.z, p.y] : ay >= az ? [p.x, p.z] : [p.x, p.y];
      uv[i * 2] = u / SKIN_TILE; uv[i * 2 + 1] = v / SKIN_TILE;
    }
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  });
}

// Loft a closed tube through rings of equal point counts (Vector3 each) and cap both ends. Winding is fixed up
// automatically (signed volume), so mirrored parts just pass mirrored points. smooth=false gives flat facets.
function loft(rings, smooth, uvs) { // uvs: optionally one [u, v] per ring point, in the same layout (the lifting surfaces' own planform mapping)
  const n = rings[0].length, m = rings.length, pos = [], idx = [], uv = [];
  for (const r of rings) for (const p of r) pos.push(p.x, p.y, p.z);
  if (uvs) for (const r of uvs) for (const q of r) uv.push(q[0], q[1]);
  for (let i = 0; i < m - 1; i++) for (let j = 0; j < n; j++) {
    const a = i * n + j, b = i * n + (j + 1) % n, c = (i + 1) * n + (j + 1) % n, d = (i + 1) * n + j;
    idx.push(a, b, c, a, c, d);
  }
  const cap = (i, end) => {
    const base = pos.length / 3; let cx = 0, cy = 0, cz = 0;
    for (let j = 0; j < n; j++) { const p = rings[i][j]; cx += p.x; cy += p.y; cz += p.z; }
    pos.push(cx / n, cy / n, cz / n); if (uvs) uv.push(.5, .5);
    for (let j = 0; j < n; j++) { const a = i * n + j, b = i * n + (j + 1) % n; end ? idx.push(base, a, b) : idx.push(base, b, a); }
  };
  cap(0, false); cap(m - 1, true);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(); let vol = 0;
  for (let t = 0; t < idx.length; t += 3) {
    a.fromArray(pos, idx[t] * 3); b.fromArray(pos, idx[t + 1] * 3); c.fromArray(pos, idx[t + 2] * 3);
    vol += a.dot(b.cross(c));
  }
  if (vol < 0) for (let t = 0; t < idx.length; t += 3) { const k = idx[t + 1]; idx[t + 1] = idx[t + 2]; idx[t + 2] = k; }
  let g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3)); g.setIndex(idx); if (uvs) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uv), 2));
  if (!smooth) g = g.toNonIndexed();
  g.computeVertexNormals();
  return g;
}

// A thin faceted lifting surface: root and tip sections, each a stealth-wedge profile between a leading-edge
// point and a trailing-edge point, thickened along `n` (the surface normal) by t0 at the root and t1 at the tip.
// (the leading and trailing facets are each cut in two at the same slope: the shape is the plain wedge, with more points to map the wing texture along)
const PROFILE = [[0, 0], [.09, .16], [.28, .5], [.8, .34], [.9, .205], [1, .07], [1, -.07], [.9, -.205], [.8, -.34], [.28, -.5], [.09, -.16]];
function panel(rLE, rTE, tLE, tTE, n, t0, t1) {
  const ring = (LE, TE, t) => PROFILE.map(([u, v]) => new THREE.Vector3().lerpVectors(LE, TE, u).addScaledVector(n, v * t));
  return loft([ring(rLE, rTE, t0), ring(tLE, tTE, t1)], false, [0, 1].map(i => PROFILE.map(([u]) => [i, u]))); // (u across the span, root to tip; v along the chord, leading edge to trailing edge: the wing texture's own planform)
}

// A flat polygon (triangle fan from the centroid), for the dark intake mouths.
function polyFace(pts) {
  const c = new THREE.Vector3(); pts.forEach(p => c.add(p)); c.multiplyScalar(1 / pts.length);
  const pos = [c.x, c.y, c.z], idx = [];
  pts.forEach((p, i) => { pos.push(p.x, p.y, p.z); idx.push(0, 1 + i, 1 + (i + 1) % pts.length); });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3)); g.setIndex(idx); g.computeVertexNormals();
  return g;
}

// Fuselage stations: [z, half-width at the chine, roof height above the axis line, belly depth below it, axis-line y,
// chine y relative to the axis line]. Each cross-section is a wide, flat roof and a rounder belly meeting at a SHARP
// chine edge (x = +-w), which runs the length of the forebody and blends into the wing roots.
const ST = [
  [-7.85, .02, .02, .02, -.08, 0], [-7.55, .18, .13, .11, -.06, 0], [-7.0, .36, .23, .19, -.04, -.01],
  [-6.2, .58, .34, .27, -.02, -.03], [-5.2, .76, .44, .34, 0, -.05], [-4.0, .90, .52, .40, .02, -.06],
  [-2.8, 1.02, .56, .46, 0, -.08], [-1.2, 1.10, .62, .50, .02, -.08], [.5, 1.10, .70, .52, .04, -.06],
  [2.2, 1.04, .72, .50, .04, -.04], [3.4, .92, .64, .48, 0, -.02], [4.9, .80, .64, .52, -.02, 0], [5.8, .74, .64, .54, -.02, 0],
];
const cr = (p0, p1, p2, p3, t) => .5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t);
function stationAt(z) {
  let i = 0; while (i < ST.length - 2 && z > ST[i + 1][0]) i++;
  const t = Math.min(1, Math.max(0, (z - ST[i][0]) / (ST[i + 1][0] - ST[i][0])));
  const g = j => cr(ST[Math.max(i - 1, 0)][j], ST[i][j], ST[i + 1][j], ST[Math.min(i + 2, ST.length - 1)][j], t);
  return { w: Math.max(.005, g(1)), ht: Math.max(.005, g(2)), hb: Math.max(.005, g(3)), yc: g(4), yk: g(5) };
}
// Roof and belly profiles across the section (r = |x| / w): the roof is a flat dome that leaves the chine at ~25 degrees.
const roof = r => 1 - 1.625 * r * r + .625 * r * r * r * r, belly = r => 1 - 1.4 * r * r + .4 * r * r * r * r;
const yRoof = (s, x) => s.yc + s.yk + (s.ht - s.yk) * roof(Math.min(1, Math.abs(x) / s.w));
const yBelly = (s, x) => s.yc + s.yk + (-s.hb - s.yk) * belly(Math.min(1, Math.abs(x) / s.w));
const topY = (z, x = 0) => yRoof(stationAt(z), x);
const botY = (z, x = 0) => yBelly(stationAt(z), x);
const sp = (v, e) => Math.sign(v) * Math.pow(Math.abs(v), 2 / e);

export function buildF35(envMap) {
  const m = cached('f35Mats', () => ({
    skin: pmat(0xffffff, .36, .6, { map: skinTexture(), envMapIntensity: .55 }), // (a darker, metallic gunmetal: not too glossy, or it reflects the tan ground and turns the tail surfaces brown)
    glass: new THREE.MeshPhysicalMaterial({ color: 0x1a2128, roughness: .06, metalness: .75, transparent: true, opacity: .9, clearcoat: 1, clearcoatRoughness: .05,
      reflectivity: .9, envMap: envMap || null, envMapIntensity: 1.2, emissive: 0x40505c, emissiveIntensity: .2, // (a faint cool grey-blue sheen of its own: the game's warm light reflected in it turned it orange)
       side: THREE.DoubleSide, depthWrite: false }),
    wing: pmat(0xffffff, .4, .5, { map: wingTexture(), envMapIntensity: .5 }), // the wings, tailplanes and fins: a darker inset panel in a lighter border of radar-absorbent tape
    eots: pmat(0x16222e, .1, .9, { envMapIntensity: 1.2 }),
    metal: pmat(0xffffff, .45, .75, { map: metalTexture() }),
    dark: pmat(0x1c1e21, .7, .25), frame: pmat(0x15171a, .6, .3),
    intake: pmat(0x060708, .9, .05, { side: THREE.DoubleSide }),
    nozzle: pmat(0x3d4044, .55, .6, { side: THREE.DoubleSide }), nozzleIn: pmat(0x0c0b0b, .8, .3, { side: THREE.DoubleSide }),
    seat: pmat(0x2e2e2a, .9, 0), panel: pmat(0x1a1c1a, .6, .3), hud: pmat(0x50ff90, .2, .4, { emissive: 0x103020, emissiveIntensity: .8 }),
    tyre: pmat(0x121212, .95, 0), hub: pmat(0x6c7075, .4, .8),
    navR: pmat(0xff2020, .4, 0, { emissive: 0xff0000, emissiveIntensity: 1 }), navG: pmat(0x20ff40, .4, 0, { emissive: 0x00ff30, emissiveIntensity: 1 }),
  }));
  const root = new THREE.Group(); root.name = 'f35';
  const GROUND = -1.65; // wheels touch down here, relative to the fuselage axis
  const nameOf = (s, a, b) => s < 0 ? a : b;

  // fuselage: lofted sections, Catmull-Rom smoothed between stations. The chine point is doubled in every ring, so the
  // roof and belly keep their own normals there and the edge stays crisp while the rest shades smoothly.
  { const zs = [], M = 14;
    for (let i = 0; i < ST.length - 1; i++) for (let k = 0; k < 3; k++) zs.push(ST[i][0] + (ST[i + 1][0] - ST[i][0]) * k / 3);
    zs.push(ST[ST.length - 1][0]);
    const rings = zs.map(z => { const s = stationAt(z), r = [];
      for (let i = 0; i <= M; i++) { const x = s.w * Math.cos(i / M * PI); r.push(V(x, yRoof(s, x), z)); }
      for (let j = 0; j <= M; j++) { const x = -s.w * Math.cos(j / M * PI); r.push(V(x, yBelly(s, x), z)); }
      return r; });
    add(root, loft(rings, true), m.skin).name = 'fuselage'; }

  // wings: low, thin wedge sections. Planform angles are shared with the tailplanes and fins: leading edges swept back
  // 35 degrees, trailing edges swept forward 15 degrees, so the edges line up across the aircraft.
  const TAN_LE = Math.tan(35 * PI / 180), TAN_TE = Math.tan(15 * PI / 180);
  const wLE = x => -2.35 + (x - 1) * TAN_LE, wTE = x => 3.1 - (x - 1) * TAN_TE, WX0 = .6, WX1 = 5.35;
  [-1, 1].forEach(s => {
    const g = panel(V(s * WX0, -.22, wLE(WX0)), V(s * WX0, -.22, wTE(WX0)), V(s * WX1, -.17, wLE(WX1)), V(s * WX1, -.17, wTE(WX1)), V(0, 1, 0), .34, .07);
    add(root, g, m.wing).name = nameOf(s, 'wingL', 'wingR');
    add(root, new THREE.BoxGeometry(.05, .05, .14), s < 0 ? m.navR : m.navG, s * (WX1 - .02), -.17, (wLE(WX1) + wTE(WX1)) / 2).castShadow = false;
  });

  // rear structure: two wide tail booms flank the engine, the nozzle open between them.
  // Fins stand on the booms (canted 20 degrees outward) and the tailplanes grow out of the booms' sides. Same 35 / -15
  // degree edge sweeps as the wing.
  const BOOM = [[2.2, .60, .98, -.18, .30], [2.6, .62, 1.10, -.38, .55], [4.1, .66, 1.06, -.44, .62], [5.9, .66, .96, -.42, .56], [6.95, .66, .90, -.34, .48]];
  const boomRing = (s, [z, xi, xo, y0, y1]) => { const c = .12;
    return [[xi, y0 + c], [xi + c, y0], [xo - c, y0], [xo, y0 + c], [xo, y1 - c], [xo - c, y1], [xi + c, y1], [xi, y1 - c]].map(([x, y]) => V(s * x, y, z)); };
  [-1, 1].forEach(s => add(root, loft(BOOM.map(b => boomRing(s, b)), false), m.skin).name = nameOf(s, 'boomL', 'boomR'));
  const CANT = 25 * PI / 180, FIN_H = 2.3;
  [-1, 1].forEach(s => {
    const c = V(s * Math.sin(CANT), Math.cos(CANT), 0), rLE = V(s * .94, .5, 2.7), rTE = V(s * .92, .46, 6.3);
    const tLE = rLE.clone().addScaledVector(c, FIN_H).add(V(0, 0, FIN_H * TAN_LE)), tTE = rTE.clone().addScaledVector(c, FIN_H).add(V(0, 0, -FIN_H * TAN_TE));
    add(root, panel(rLE, rTE, tLE, tTE, V(Math.cos(CANT), -s * Math.sin(CANT), 0), .22, .05), m.wing).name = nameOf(s, 'finL', 'finR');
    const x0 = .8, x1 = 3.15, dx = x1 - x0, tipTE = 6.2, tipLE = tipTE - .8;
    add(root, panel(V(s * x0, -.02, tipLE - dx * TAN_LE), V(s * x0, -.02, tipTE + dx * TAN_TE), V(s * x1, -.2, tipLE), V(s * x1, -.2, tipTE), V(0, 1, 0), .2, .05), m.wing).name = nameOf(s, 'stabL', 'stabR');
  });

  // diverterless supersonic inlets: a trapezoidal cheek scoop on each side below the cockpit, its lip swept forward at the
  // outboard edge, a dark mouth, and the DSI bump on the fuselage side just ahead of and inboard of the opening.
  [-1, 1].forEach(s => {
    const zF = x => -3.15 - (x - .82) * .85;
    const front = [[.82, .04], [1.36, .04], [1.28, -.48], [.88, -.5]].map(([x, y]) => V(s * x, y, zF(x)));
    const back = [[.95, 0], [1.16, 0], [1.14, -.3], [.97, -.32]].map(([x, y]) => V(s * x, y, -1.0));
    add(root, loft([front, back], false), m.skin).name = nameOf(s, 'intakeL', 'intakeR');
    const c = new THREE.Vector3(); front.forEach(p => c.add(p)); c.multiplyScalar(1 / front.length);
    const nrm = V(-s * .66, 0, -.75).multiplyScalar(.015);
    add(root, polyFace(front.map(p => p.clone().sub(c).multiplyScalar(.84).add(c).add(nrm))), m.intake).castShadow = false;
    add(root, new THREE.SphereGeometry(1, 10, 6), m.skin, s * .9, -.13, -3.45).scale.set(.15, .3, .8);
  });

  // canopy: a teardrop lofted from the fuselage surface. Low windscreen at the nose, peak over the pilot, then a long
  // taper that fades into the spine; its lower edge follows the fuselage skin, so it reads as one blended shape.
  // The group is hinged at the rear tip: setCanopyOpen() swings the nose up.
  const BZ = -4.0, CZF = -5.15, HZ = -2.3, CAN_H = .5, CAN_W = .56, HY = topY(HZ) - .02;
  const canopy = new THREE.Group(); canopy.name = 'canopy'; canopy.position.set(0, HY, HZ); root.add(canopy);
  const canRing = (t, arcOnly) => {
    const z = CZF + (HZ - CZF) * t, k = Math.pow(t, .756), sh = Math.sin(PI * k);
    const h = CAN_H * Math.pow(sh, .85), w = Math.max(.03, CAN_W * Math.pow(sh, .45)), top = topY(z) + h, wf = stationAt(z).w * .98, r = [];
    for (let i = 0; i <= 14; i++) { const a = i / 14 * PI, c = Math.cos(a), sn = Math.sin(a), x = w * sp(c, 2.4);
      const ye = topY(z, Math.min(Math.abs(x), wf)) - .03;
      r.push(V(x, ye + (top - ye) * Math.pow(sn, .85), z - HZ).setY(ye + (top - ye) * Math.pow(sn, .85) - HY)); }
    if (!arcOnly) { r.push(V(-w * .98, r[14].y - .15, z - HZ)); r.push(V(w * .98, r[0].y - .15, z - HZ)); }
    return r;
  };
  { const rings = []; for (let i = 0; i <= 22; i++) rings.push(canRing(i / 22));
    const glass = add(canopy, loft(rings, true), m.glass); glass.name = 'canopyGlass'; glass.castShadow = glass.receiveShadow = false; }
  [[.1, .034], [.42, .026], [.78, .024]].forEach(([t, r]) => {
    const curve = new THREE.CatmullRomCurve3(canRing(t, true));
    add(canopy, new THREE.TubeGeometry(curve, 14, r, 4, false), m.frame).castShadow = false;
  });
  const iy = topY(BZ) - .1;
  add(root, new THREE.BoxGeometry(.6, .12, .08), m.panel, 0, iy + .06, BZ - .55);
  add(root, new THREE.BoxGeometry(.3, .06, .02), m.hud, 0, iy + .16, BZ - .5);
  add(root, new THREE.BoxGeometry(.34, .09, .38), m.seat, 0, iy + .05, BZ);
  add(root, new THREE.BoxGeometry(.34, .42, .08), m.seat, 0, iy + .24, BZ + .2);
  add(root, new THREE.BoxGeometry(.2, .12, .07), m.seat, 0, iy + .42, BZ + .22);
  add(root, new THREE.BoxGeometry(.26, .3, .16), m.dark, 0, iy + .18, BZ + .06);
  add(root, new THREE.SphereGeometry(.1, 12, 10), m.dark, 0, iy + .38, BZ + .04);
  root.setCanopyOpen = open => { canopy.rotation.x = open ? .95 : 0; };

  // nose and spine details: EOTS chin window, gun port on the left shoulder, blade antennas
  { const z = -5.6; add(root, new THREE.BoxGeometry(.46, .12, .5), m.eots, 0, botY(z) + .02, z).name = 'eots'; }
  add(root, new THREE.BoxGeometry(.18, .05, .08), m.dark, -.5, topY(-4.7, .5) - .02, -4.7);
  add(root, new THREE.BoxGeometry(.03, .3, .22), m.metal, 0, topY(2.3) + .12, 2.3).rotation.x = .2;
  add(root, new THREE.BoxGeometry(.03, .26, .2), m.metal, 0, botY(-1.5) - .1, -1.5).rotation.x = -.2;

  // exhaust: burnt-titanium nozzle, a sawtooth rim of 24 tabs, a dark inner liner and a back plate
  const nz = new THREE.Group(); nz.name = 'nozzle'; nz.position.set(0, -.02, -.9); root.add(nz);
  { const prof = [[.58, 6.3], [.6, 6.7], [.55, 7.05]].map(([r, z]) => new THREE.Vector2(r, z));
    const g = new THREE.LatheGeometry(prof, 24); g.rotateX(PI / 2); add(nz, g, m.nozzle);
    const pos = [], R = .55, T = 24, w = PI * 2 / T * .5;
    for (let i = 0; i < T; i++) { const a = i / T * PI * 2;
      pos.push(Math.cos(a - w) * R, Math.sin(a - w) * R, 7.05, Math.cos(a + w) * R, Math.sin(a + w) * R, 7.05, Math.cos(a) * (R - .03), Math.sin(a) * (R - .03), 7.35); }
    const tg = new THREE.BufferGeometry(); tg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3)); tg.computeVertexNormals(); add(nz, tg, m.nozzle);
    const inner = new THREE.CylinderGeometry(.5, .42, .7, 20, 1, true); inner.rotateX(PI / 2); add(nz, inner, m.nozzleIn, 0, 0, 6.9);
    add(nz, new THREE.CircleGeometry(.55, 20), m.nozzleIn, 0, 0, 6.73); }

  // landing gear (always down): twin-wheel nose leg and two single-wheel main legs, with their doors
  const gear = new THREE.Group(); gear.name = 'gear'; root.add(gear);
  const door = (parent, x, y, z, len, h, ang) => { const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.z = ang; parent.add(g); add(g, new THREE.BoxGeometry(.03, h, len), m.skin, 0, -h / 2, 0); };
  const wheel = (parent, r, w, x, y) => {
    add(parent, new THREE.CylinderGeometry(r, r, w, 18), m.tyre, x, y, 0).rotation.z = PI / 2;
    add(parent, new THREE.CylinderGeometry(r * .58, r * .58, w + .02, 12), m.hub, x, y, 0).rotation.z = PI / 2;
  };
  { const zN = -3.9, ng = new THREE.Group(); ng.name = 'noseGear'; ng.position.set(0, botY(zN) + .05, zN); gear.add(ng);
    const ax = GROUND + .25 - ng.position.y;
    add(ng, new THREE.CylinderGeometry(.08, .08, .5, 10), m.metal, 0, -.25, 0);
    add(ng, new THREE.CylinderGeometry(.05, .05, -ax - .5 + .04, 8), m.metal, 0, (-.45 + ax) / 2, 0);
    add(ng, new THREE.CylinderGeometry(.035, .035, .38, 8), m.metal, 0, ax, 0).rotation.z = PI / 2;
    wheel(ng, .25, .15, -.17, ax); wheel(ng, .25, .15, .17, ax);
    add(ng, new THREE.BoxGeometry(.03, .24, .04), m.dark, 0, -.5, .07).rotation.x = .4;
    add(ng, new THREE.BoxGeometry(.18, .04, .06), m.dark, 0, -.1, -.1);
    [-1, 1].forEach(s => door(ng, s * .36, -.02, .05, .95, .5, s * .18));
    add(ng, new THREE.BoxGeometry(.7, .03, 1.0), m.intake, 0, .0, 0).castShadow = false; }
  [-1, 1].forEach(s => {
    const mg = new THREE.Group(); mg.name = nameOf(s, 'gearL', 'gearR'); mg.position.set(s * 1.45, -.36, 1.0); gear.add(mg);
    const ax = GROUND + .34 - mg.position.y;
    add(mg, new THREE.CylinderGeometry(.09, .09, .5, 10), m.metal, 0, -.25, 0);
    add(mg, new THREE.CylinderGeometry(.06, .06, -ax - .45, 8), m.metal, 0, (-.45 + ax) / 2, 0);
    add(mg, new THREE.CylinderGeometry(.04, .04, .5, 8), m.metal, 0, ax, 0).rotation.z = PI / 2;
    wheel(mg, .34, .26, 0, ax);
    add(mg, new THREE.BoxGeometry(.03, .22, .05), m.dark, 0, -.5, .08).rotation.x = .4;
    door(mg, s * .4, -.02, 0, 1.0, .75, s * .18);
  });

  projectSkin(root, m.skin);
  root.groundY = GROUND;
  return root;
}
