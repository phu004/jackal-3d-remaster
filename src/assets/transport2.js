// Tandem-rotor transport, second version: a lofted hull (smooth nose, tapered up-swept tail), curved glazing,
// engine pods, portholes and door panels. Ported from new_transport_heli.html. Same contract as transport.js
// (rotorFront / rotorRear with a child 'disc', ramp, rampOpening), but the ramp and cargo opening are empty
// groups: this version never shows them.
import * as THREE from 'three';
import { PI, add, mat, cached, canvasTexture, seededRandom, palette, tireMaterial, decal, rotorBlurMaterial } from './common.js';


function tCockpitMats() {
  return cached('transportCockpit', () => {
    // port glass: bomber.js's glass recipe, minus its own sky map (an equirect envMap met for the first time inside renderer.compile breaks it: it takes scene.environment instead)
    const glass = new THREE.MeshPhysicalMaterial({
      color: 0x9db8cc, roughness: .22, metalness: .08,
      clearcoat: .35, clearcoatRoughness: .35,
      envMapIntensity: .55,
      transparent: true, opacity: .5, depthWrite: false, side: THREE.DoubleSide,
    });
    const portGlass = glass.clone(); portGlass.opacity = .6; portGlass.color.setHex(0x7f96ab);
    // The cockpit panes use the MD-500's glass (heli.js m.glass): dark smoked tint, see-through where it reflects little and
    // mirroring the scene's sky where it catches it (no envMap of its own: it takes scene.environment).
    const canopy = new THREE.MeshPhysicalMaterial({
      color: 0x1c2832, roughness: .04, metalness: 0,
      transparent: true, transmission: .55, reflectivity: .8,
      clearcoat: 1, clearcoatRoughness: .03, envMapIntensity: 1.3,
      side: THREE.DoubleSide, depthWrite: false,
    });
    return {
      glass: canopy, portGlass,
      frame: mat(0x15171a, .5, .6, { envMapIntensity: .4 }),
      cabin: mat(0x0a0908, .95, 0, { emissive: 0x2a1e10, emissiveIntensity: .35 }),
      interior: mat(0x14171a, .9, .05),
    };
  });
}

// Hull skin: a generic three-colour woodland camouflage (soft-edged blotches, tiled seamlessly), matt, with the
// no panel lines. The pattern repeats every 12 m, so it doesn't read as a tile.
function camoMaterial(matt = false) { // matt: the same camouflage without the lacquer (the engine pods and the rotor pylons, which are the top of the aircraft and caught too much of the sky)
  if (matt) { const g = camoMaterial(), m = new THREE.MeshStandardMaterial({ color: 0xffffff, map: g.map, roughness: .8, metalness: .04, envMapIntensity: .3 }); return cached('transportCamoMatt', () => m); }
  return cached('transportCamo', () => {
    const S = 1024, c = document.createElement('canvas'); c.width = c.height = S; const x = c.getContext('2d'), rnd = seededRandom(154);
    x.fillStyle = '#52672f'; x.fillRect(0, 0, S, S); // olive base
    const blotch = (col, n, r0, r1) => {
      x.fillStyle = col;
      for (let i = 0; i < n; i++) {
        const cx = rnd() * S, cy = rnd() * S, r = r0 + rnd() * (r1 - r0), k = 7 + Math.floor(rnd() * 4), ph = rnd() * 6.28, st = .55 + rnd() * .5;
        for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) { // (wrapped: tiles seamlessly)
          x.beginPath();
          for (let a = 0; a <= k; a++) {
            const t = a / k * Math.PI * 2, w = 1 + .32 * Math.sin(t * 3 + ph) + .18 * Math.sin(t * 5 + ph * 2), px = cx + ox + Math.cos(t) * r * w * st * 1.5, py = cy + oy + Math.sin(t) * r * w;
            a ? x.lineTo(px, py) : x.moveTo(px, py);
          }
          x.closePath(); x.fill();
        }
      }
    };
    blotch('#385023', 26, 40, 95);   // dark green
    blotch('#82764c', 20, 30, 80);   // tan
    blotch('#4a3a24', 14, 22, 55);   // brown
    // weathering: sun-faded patches, grime, rain streaks, oil, chipped paint (all wrapped so the tile stays seamless)
    const wrap = f => { for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) f(ox, oy); };
    for (let i = 0; i < 16; i++) { const cx = rnd() * S, cy = rnd() * S, r = 90 + rnd() * 160; // faded
      wrap((ox, oy) => { const g = x.createRadialGradient(cx + ox, cy + oy, 0, cx + ox, cy + oy, r); g.addColorStop(0, `rgba(190,185,150,${.14 + rnd() * .1})`); g.addColorStop(1, 'rgba(190,185,150,0)'); x.fillStyle = g; x.fillRect(cx + ox - r, cy + oy - r, 2 * r, 2 * r); }); }
    for (let i = 0; i < 12; i++) { const cx = rnd() * S, cy = rnd() * S, r = 70 + rnd() * 140; // grime
      wrap((ox, oy) => { const g = x.createRadialGradient(cx + ox, cy + oy, 0, cx + ox, cy + oy, r); g.addColorStop(0, `rgba(25,20,12,${.16 + rnd() * .14})`); g.addColorStop(1, 'rgba(25,20,12,0)'); x.fillStyle = g; x.fillRect(cx + ox - r, cy + oy - r, 2 * r, 2 * r); }); }
    for (let i = 0; i < 70; i++) { const px = rnd() * S, py = rnd() * S, len = 80 + rnd() * 300, w = 2 + rnd() * 6, a = .12 + rnd() * .2; // rain streaks (run round the hull)
      wrap((ox, oy) => { const g = x.createLinearGradient(0, py + oy, 0, py + oy + len); g.addColorStop(0, `rgba(20,16,10,${a})`); g.addColorStop(1, 'rgba(20,16,10,0)'); x.fillStyle = g; x.fillRect(px + ox, py + oy, w, len); }); }
    for (let i = 0; i < 9; i++) { const cx = rnd() * S, cy = rnd() * S, r = 14 + rnd() * 30; // oil and exhaust stains
      wrap((ox, oy) => { const g = x.createRadialGradient(cx + ox, cy + oy, 0, cx + ox, cy + oy, r); g.addColorStop(0, 'rgba(10,8,5,.35)'); g.addColorStop(1, 'rgba(10,8,5,0)'); x.fillStyle = g; x.save(); x.translate(cx + ox, cy + oy); x.scale(1, 1.7); x.translate(-cx - ox, -cy - oy); x.fillRect(cx + ox - r, cy + oy - r, 2 * r, 2 * r); x.restore(); }); }
    for (let k = 0; k < 40; k++) { const cx = rnd() * S, cy = rnd() * S; // chipped paint, in clusters: bare metal with a rust edge
      for (let j = 0; j < 4 + rnd() * 8; j++) { const px = cx + (rnd() - .5) * 60, py = cy + (rnd() - .5) * 60, w = 2 + rnd() * 6, h = 1 + rnd() * 3;
        wrap((ox, oy) => { x.fillStyle = 'rgba(120,70,40,.55)'; x.fillRect(px + ox - 1, py + oy - 1, w + 2, h + 2); x.fillStyle = rnd() > .35 ? 'rgba(150,152,148,.8)' : 'rgba(40,40,38,.8)'; x.fillRect(px + ox, py + oy, w, h); }); } }
    for (let i = 0; i < 9000; i++) { x.fillStyle = rnd() > .5 ? 'rgba(255,255,230,.04)' : 'rgba(0,0,0,.05)'; x.fillRect(rnd() * S, rnd() * S, 2, 2); } // grain
    return new THREE.MeshPhysicalMaterial({ // (a little lacquer over the camouflage: a soft, broad sheen where the hull catches the sky and the sun; the paint itself is still matt, and the chipped patches take it with the rest)
      color: 0xffffff, map: canvasTexture(c, .083, .083),
      roughness: .55, metalness: .08, envMapIntensity: .75, clearcoat: .45, clearcoatRoughness: .32,
    });
  });
}

const tPow = (v, p) => Math.sign(v) * Math.pow(Math.abs(v), p);

function tProfile(keys) {
  const n = keys.length, slope = (i, k) => { const a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1); return (keys[b][k] - keys[a][k]) / (keys[b][0] - keys[a][0]); };
  return z => {
    z = Math.min(keys[n - 1][0], Math.max(keys[0][0], z));
    let i = 0; while (i < n - 2 && z > keys[i + 1][0]) i++;
    const h = keys[i + 1][0] - keys[i][0], t = (z - keys[i][0]) / h, t2 = t * t, t3 = t2 * t;
    const g = k => (2 * t3 - 3 * t2 + 1) * keys[i][k] + (t3 - 2 * t2 + t) * slope(i, k) * h + (-2 * t3 + 3 * t2) * keys[i + 1][k] + (t3 - t2) * slope(i + 1, k) * h;
    return { w: Math.max(.03, g(1)), top: g(2), bot: g(3), n: Math.max(2, g(4)) };
  };
}
function tBody(keys, cx = 0) {
  const f = tProfile(keys);
  const at = (z, p) => { const q = f(z), cy = (q.top + q.bot) / 2, h = (q.top - q.bot) / 2, e = 2 / q.n; return new THREE.Vector3(cx + q.w * tPow(Math.cos(p), e), cy + h * tPow(Math.sin(p), e), z); };
  const surf = (z, p) => ({ p: at(z, p), n: new THREE.Vector3().crossVectors(at(z, p + .002).sub(at(z, p - .002)), at(z + .02, p).sub(at(z - .02, p))).normalize() });
  return { at, surf };
}
function tBodyGeo(body, z0, z1, nz, nu) {
  const pos = [], nrm = [], uv = [], idx = [];
  for (let j = 0; j <= nz; j++) {
    const z = z0 + (z1 - z0) * (1 - Math.cos(PI * j / nz)) / 2; let arc = 0, prev = null;
    for (let i = 0; i <= nu; i++) {
      const s = body.surf(z, i / nu * PI * 2); if (prev) arc += s.p.distanceTo(prev); prev = s.p;
      pos.push(s.p.x, s.p.y, s.p.z); nrm.push(s.n.x, s.n.y, s.n.z); uv.push(z, arc);
    }
  }
  for (let j = 0; j < nz; j++) for (let i = 0; i < nu; i++) { const a = j * (nu + 1) + i, b = a + 1, c = a + nu + 1, d = c + 1; idx.push(a, b, c, b, d, c); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); return g;
}
function tCapGeo(body, z, dir, nu = 56) {
  const ring = [], c = new THREE.Vector3(); for (let i = 0; i < nu; i++) { const p = body.at(z, i / nu * PI * 2); ring.push(p); c.add(p); } c.divideScalar(nu);
  const pos = [c.x, c.y, c.z], uv = [c.x, c.y], nrm = [0, 0, dir], idx = [];
  ring.forEach(p => { pos.push(p.x, p.y, p.z); uv.push(p.x, p.y); nrm.push(0, 0, dir); });
  for (let i = 0; i < nu; i++) { const a = 1 + i, b = 1 + (i + 1) % nu; dir > 0 ? idx.push(0, a, b) : idx.push(0, b, a); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); return g;
}
function tPylonGeo(y0, y1, ring, nt = 20, nu = 44) {
  const P = (t, p) => { t = Math.min(1, Math.max(0, t)); const r = ring(t), e = 2 / r.n; return new THREE.Vector3(r.b * tPow(Math.cos(p), e), y0 + (y1 - y0) * t, r.zc + r.a * tPow(Math.sin(p), e)); };
  const pos = [], nrm = [], uv = [], idx = [];
  for (let j = 0; j <= nt; j++) {
    const t = j / nt; let arc = 0, prev = null;
    for (let i = 0; i <= nu; i++) {
      const p = i / nu * PI * 2, q = P(t, p), n = new THREE.Vector3().crossVectors(P(t + .01, p).sub(P(t - .01, p)), P(t, p + .002).sub(P(t, p - .002))).normalize();
      if (prev) arc += q.distanceTo(prev); prev = q; pos.push(q.x, q.y, q.z); nrm.push(n.x, n.y, n.z); uv.push(q.y, arc);
    }
  }
  for (let j = 0; j < nt; j++) for (let i = 0; i < nu; i++) { const a = j * (nu + 1) + i, b = a + 1, c = a + nu + 1, d = c + 1; idx.push(a, c, b, b, c, d); }
  const base = pos.length / 3, r1 = ring(1); pos.push(0, y1, r1.zc); nrm.push(0, 1, 0); uv.push(y1, 0);
  for (let i = 0; i <= nu; i++) { const q = P(1, i / nu * PI * 2); pos.push(q.x, q.y, q.z); nrm.push(0, 1, 0); uv.push(q.x, q.z); }
  for (let i = 0; i < nu; i++) idx.push(base, base + 2 + i, base + 1 + i);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); return g;
}

export const RAMP_CLOSED = -0.33, RAMP_OPEN = 0.27;
export const RAMP_HINGE = new THREE.Vector3(0, 0.7, 4.1);
export const RAMP_LENGTH = 2.6;

const HULL_KEYS = [
  [-7.10, .10, 1.32, 1.00, 2.0], [-7.02, .22, 1.40, .88, 2.0], [-6.94, .36, 1.48, .76, 2.0], [-6.86, .50, 1.56, .64, 2.02],
  [-6.76, .64, 1.65, .53, 2.05], [-6.58, .80, 1.87, .42, 2.1], [-6.38, .95, 2.10, .32, 2.15],
  [-6.15, 1.08, 2.38, .24, 2.25], [-5.90, 1.19, 2.62, .14, 2.35],
  [-5.62, 1.30, 2.79, .06, 2.45], [-5.45, 1.36, 2.84, .05, 2.5],
  [-5.00, 1.45, 2.83, .18, 2.5], [-3.50, 1.55, 2.89, .06, 2.7], [2.00, 1.55, 2.89, .05, 2.7], [4.00, 1.52, 2.87, .06, 2.6],
  [5.00, 1.46, 2.83, .27, 2.5], [6.00, 1.35, 2.69, .66, 2.4], [6.80, 1.20, 2.47, 1.10, 2.3], [7.35, 1.00, 2.27, 1.45, 2.3],
];
// Rounder nose: the width forward of the cockpit fills out faster (a blunter, more bulbous front, not a cone).
HULL_KEYS.forEach(k => {
  if (k[0] > -5.0) return;
  k[1] = 1.55 * Math.pow(k[1] / 1.55, .68);
  const cy = (k[2] + k[3]) / 2, h = (k[2] - k[3]) / 2, h2 = 1.42 * Math.pow(h / 1.42, .75); // (the side view fills out too)
  k[2] = cy + h2; k[3] = cy - h2;
});
const POD_KEYS = [
  [-1.40, .05, .55, .35, 2], [-1.05, .30, .78, .12, 2], [-.20, .52, .95, -.05, 2.2], [1.29, .62, 1.0, -.10, 2.2],
  [2.64, .55, .92, -.05, 2.2], [3.42, .30, .72, .15, 2], [3.70, .05, .55, .35, 2],
];

export function buildTransport2() {
  const { black: BLK, steel: STL, yellow: YEL } = palette();
  const GRN = camoMaterial(), DKG = mat(0x3a4c28, .8, .04), TIRE = tireMaterial(), G = tCockpitMats();

  const root = new THREE.Group(); root.name = 'transport';
  const H = new THREE.Group(); H.position.y = 0.82; root.add(H);
  const mesh = (g, m, x = 0, y = 0, z = 0, p = H) => add(p, g, m, x, y, z);
  const solid = (g, m) => { const o = new THREE.Mesh(g, m); o.castShadow = o.receiveShadow = true; H.add(o); return o; };

  const hull = tBody(HULL_KEYS);
  solid(tBodyGeo(hull, -7.10, 7.35, 130, 56), GRN);
  solid(tCapGeo(hull, -7.10, -1), GRN);
  solid(tCapGeo(hull, 7.35, 1), DKG);
  const MAT = camoMaterial(true);
  const HUB = cached('transportHub', () => mat(0x2b2f31, .75, .15, { envMapIntensity: .15 }));
  const HUBS = cached('transportHubSteel', () => mat(0x4a4f52, .6, .25, { envMapIntensity: .2 })); // (the lighter, bare-metal parts of the rotor head: matt enough not to flare)
  [-1, 1].forEach(s => solid(tBodyGeo(tBody(POD_KEYS, s * 1.75), -1.4, 3.7, 34, 28), MAT));
  solid(tPylonGeo(2.1, 5.05, t => { const k = Math.pow(t, .85); return { zc: 4.9 + .05 * k, a: 1.7 - .95 * k, b: 1.1 - .55 * k, n: 2.6 }; }), MAT);
  solid(tPylonGeo(2.2, 3.92, t => { const k = Math.pow(t, .9); return { zc: -3.7 - .5 * k, a: 1.75 - .95 * k, b: 1.1 - .5 * k, n: 2.6 }; }), MAT);

  const arcTo = (z, p) => { let a = 0, prev = hull.at(z, 0); const n = Math.max(2, Math.ceil(Math.abs(p) * 16)); for (let k = 1; k <= n; k++) { const q = hull.at(z, p * k / n); a += q.distanceTo(prev); prev = q; } return a; };
  const patch = (zA, zB, pA, pB, lift, m, opt = {}) => {
    const fa = typeof pA === 'function' ? pA : () => pA, fb = typeof pB === 'function' ? pB : () => pB, zm = (zA + zB) / 2;
    const nz = Math.max(2, Math.ceil((zB - zA) * 24)), nu = Math.max(2, Math.ceil((fb(zm) - fa(zm)) * 18)), u0 = opt.u0 ?? 0, u1 = opt.u1 ?? 1, pos = [], nrm = [], uv = [], idx = [];
    for (let j = 0; j <= nz; j++) {
      const z = zA + (zB - zA) * j / nz, pa = fa(z), pb = fb(z);
      for (let i = 0; i <= nu; i++) {
        const ph = pa + (pb - pa) * i / nu, sf = hull.surf(z, ph), a = u0 + (u1 - u0) * i / nu, b = j / nz;
        pos.push(sf.p.x + sf.n.x * lift, sf.p.y + sf.n.y * lift, sf.p.z + sf.n.z * lift); nrm.push(sf.n.x, sf.n.y, sf.n.z);
        if (opt.hullUV) uv.push(z, arcTo(z, ph));
        else if (opt.swap) { const v = opt.flipV ? 1 - i / nu : i / nu; uv.push(u0 + (u1 - u0) * b, v); } else uv.push(a, b);
      }
    }
    for (let j = 0; j < nz; j++) for (let i = 0; i < nu; i++) { const a = j * (nu + 1) + i, b = a + 1, c = a + nu + 1, d = c + 1; idx.push(a, b, c, b, d, c); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx); const o = new THREE.Mesh(g, m); o.receiveShadow = m !== G.glass && m !== G.portGlass; H.add(o); return o;
  };
  const phiAtY = (z, y, s) => {
    let lo = s > 0 ? -1.45 : PI + 1.45, hi = s > 0 ? 1.45 : PI - 1.45;
    for (let k = 0; k < 40; k++) { const mid = (lo + hi) / 2; if (hull.at(z, mid).y < y) lo = mid; else hi = mid; }
    return (lo + hi) / 2;
  };

  patch(-6.95, -4.6, .35, PI - .35, -.06, G.interior, { hullUV: true });
  patch(-6.6, -4.9, 1.0, PI - 1.0, -.045, G.cabin, { hullUV: true });

  const GZ0 = -6.50, GZ1 = GZ0 + .68;
  const FM = .042;
  const WZ0 = GZ0 - FM, WZ1 = GZ1 + FM;
  const FRM = .028, GLS = .038;
  const SILL = 1.5, SIDE_PHI = .65;
  const YTOP = (hull.at(GZ1, SIDE_PHI + .05).y - hull.at(GZ1, PI / 2).y) * 0.8 + hull.at(GZ1, PI / 2).y;
  const sill = z => Math.min(phiAtY(z, SILL, 1), .32);
  const top = z => Math.min(phiAtY(z, YTOP, 1), SIDE_PHI);
  const sideLo = s => (s > 0 ? sill : z => PI - top(z)), sideHi = s => (s > 0 ? top : z => PI - sill(z));

  const curvedGlass = (zA, zB, pA, pB, lift, m, bulge) => {
    const fa = typeof pA === 'function' ? pA : () => pA, fb = typeof pB === 'function' ? pB : () => pB;
    const nz = Math.max(4, Math.ceil((zB - zA) * 26)), nu = Math.max(4, Math.ceil((fb((zA + zB) / 2) - fa((zA + zB) / 2)) * 20));
    const pos = [], nrm = [], uv = [], idx = [];
    for (let j = 0; j <= nz; j++) {
      const tz = j / nz, z = zA + (zB - zA) * tz, pa = fa(z), pb = fb(z);
      for (let i = 0; i <= nu; i++) {
        const ti = i / nu, ph = pa + (pb - pa) * ti, sf = hull.surf(z, ph);
        const b = Math.sin(PI * tz) * Math.sin(PI * ti);
        const push = bulge * b;
        const px = sf.p.x + sf.n.x * lift - sf.n.x * push * .35;
        const py = sf.p.y + sf.n.y * lift - sf.n.y * push * .35;
        const pz = sf.p.z + sf.n.z * lift - push;
        pos.push(px, py, pz);
        const n = sf.n.clone(); n.z -= push * .5; n.normalize(); nrm.push(n.x, n.y, n.z);
        uv.push(ti, tz);
      }
    }
    for (let j = 0; j < nz; j++) for (let i = 0; i < nu; i++) { const a = j * (nu + 1) + i, b = a + 1, c = a + nu + 1, d = c + 1; idx.push(a, b, c, b, d, c); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx); const o = new THREE.Mesh(g, m); o.receiveShadow = false; H.add(o); return o;
  };

  patch(WZ0, WZ1, SIDE_PHI + .02, PI - SIDE_PHI - .02, FRM, G.frame);
  [-1, 1].forEach(s => patch(WZ0 - .005, -4.8 + FM, s > 0 ? z => sill(z) - FM * .8 : z => PI - top(z) - FM * .6, s > 0 ? z => top(z) + FM * .6 : z => PI - sill(z) + FM * .8, FRM, G.frame));
  patch(WZ1, WZ1 + .22, SIDE_PHI + .02, PI - SIDE_PHI - .02, FRM + .006, GRN, { hullUV: true });
  [[1.31, 1.83, .075], [.7, 1.25, .055], [1.89, 2.44, .075]].forEach(([a, b, bg]) => curvedGlass(GZ0, GZ1, a, b, GLS, G.glass, bg));
  [-1, 1].forEach(s => [[GZ0, -5.77], [-5.71, -4.8]].forEach(([a, b]) => patch(a, b, sideLo(s), sideHi(s), GLS, G.glass)));
  [1.42, 1.72].forEach((p, i) => {
    const sf = hull.surf(-6.46, p), T = hull.at(-6.38, p).sub(hull.at(-6.46, p)).normalize(), X = new THREE.Vector3().crossVectors(sf.n, T).normalize();
    const w = new THREE.Group(); w.position.copy(sf.p).addScaledVector(sf.n, .05); w.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(X, sf.n, T)); H.add(w);
    mesh(new THREE.BoxGeometry(.02, .012, .45), G.frame, 0, 0, .225, w).rotation.y = i ? -.14 : .14;
  });

  const dz = -2.875, SEAM = mat(0x0a2d14, .7, .1), DZ0 = -3.4, DZ1 = -2.35;
  const dp0 = phiAtY(dz, .5, 1), dp1 = phiAtY(dz, 2.15, 1);
  patch(DZ0, DZ1, dp0, dp1, .01, GRN, { hullUV: true });
  [[DZ0, DZ1, dp0, dp0 + .02], [DZ0, DZ1, dp1 - .02, dp1], [DZ0, DZ0 + .03, dp0, dp1], [DZ1 - .03, DZ1, dp0, dp1],
   [-2.62, -2.46, phiAtY(dz, 1.1, 1), phiAtY(dz, 1.2, 1)]].forEach(a => patch(...a, .014, SEAM));
  patch(-4.0, 4.0, 4.4, 5.02, .01, DKG);

  const onSkin = (z, y, s) => hull.surf(z, phiAtY(z, y, s));
  const porthole = (s, z) => {
    const sf = onSkin(z, 1.75, s), g = new THREE.Group(); g.position.copy(sf.p); g.lookAt(sf.p.clone().add(sf.n)); H.add(g);
    [[G.cabin, .006], [G.portGlass, .016]].forEach(([m, dz]) => { const o = new THREE.Mesh(new THREE.CircleGeometry(.165, 28), m); o.position.z = dz; g.add(o); });
    mesh(new THREE.TorusGeometry(.18, .03, 8, 28), G.frame, 0, 0, .012, g);
  };

  [-1, 1].forEach(s => {
    [-1.6, -.45, .7, 1.85, 3.0].forEach(z => porthole(s, z));
    if (s > 0) porthole(1, -2.875);
    mesh(new THREE.CylinderGeometry(.08, .08, .7, 12), STL, s * 2.15, -.15, 2.3);
    mesh(new THREE.CylinderGeometry(.4, .4, .34, 32), TIRE, s * 2.15, -.42, 2.3).rotation.z = PI / 2;
    mesh(new THREE.CylinderGeometry(.2, .2, .36, 20), STL, s * 2.15, -.42, 2.3).rotation.z = PI / 2;
    mesh(new THREE.CylinderGeometry(.32, .32, .16, 28), TIRE, s * .34, -.46, -5.0).rotation.z = PI / 2;
    mesh(new THREE.CylinderGeometry(.4, .3, 2.6, 32), MAT, s * .85, 3.5, 4.2).rotation.x = PI / 2;
    mesh(new THREE.CylinderGeometry(.24, .32, .5, 24), BLK, s * .85, 3.5, 5.7).rotation.x = PI / 2;
    const nl = onSkin(-5.9, 1.15, s);
    mesh(new THREE.SphereGeometry(.07, 12, 12), mat(s > 0 ? 0xff3030 : 0x30ff50, .3, .1, { emissive: s > 0 ? 0x660000 : 0x006615 }), nl.p.x + nl.n.x * .05, nl.p.y + nl.n.y * .05, nl.p.z + nl.n.z * .05);
  });
  mesh(new THREE.CylinderGeometry(.06, .06, .75, 12), STL, 0, -.05, -5.0);
  const ll = hull.surf(-6.85, PI * 1.5); mesh(new THREE.BoxGeometry(.24, .08, .24), YEL, 0, ll.p.y - .02, -6.85);
  mesh(new THREE.CylinderGeometry(.2, .28, .7, 24), DKG, 0, 3.7, -4.2);
  mesh(new THREE.CylinderGeometry(.22, .3, .6, 24), DKG, 0, 5.05, 4.85);

  const bs = new THREE.Shape(); bs.moveTo(.5, -.3); bs.lineTo(6.3, -.2); bs.quadraticCurveTo(6.55, 0, 6.3, .2); bs.lineTo(.5, .32); bs.closePath();
  const bg = new THREE.ExtrudeGeometry(bs, { depth: .07, bevelEnabled: true, bevelSize: .02, bevelThickness: .015, bevelSegments: 2 });
  const rotor = (name, y, z) => {
    const g = new THREE.Group(); g.name = name; g.position.set(0, y, z); H.add(g);
    mesh(new THREE.CylinderGeometry(.5, .58, .34, 6), HUB, 0, 0, 0, g); // the rotor hub: the plain disc it had, six-sided, in dark matt steel (bare steel flared to white from above)
    for (let i = 0; i < 3; i++) { // the blades
      const a = i * 2 * PI / 3, b = mesh(bg, BLK, 0, 0, 0, g); b.rotation.x = -PI / 2; b.rotation.z = a;
      mesh(new THREE.BoxGeometry(.55, .08, .32), YEL, Math.cos(a) * 6.0, .04, -Math.sin(a) * 6.0, g).rotation.y = a;
    }
    const d = new THREE.Mesh(new THREE.CircleGeometry(6.6, 64), rotorBlurMaterial());
    d.name = 'disc'; d.rotation.x = -PI / 2; g.add(d);
  };
  rotor('rotorFront', 4.1, -4.2);
  rotor('rotorRear', 5.45, 4.85);

  const hinge = new THREE.Group(); hinge.name = 'ramp'; hinge.position.set(RAMP_HINGE.x, RAMP_HINGE.y - H.position.y, RAMP_HINGE.z); H.add(hinge);
  const hole = new THREE.Group(); hole.name = 'rampOpening'; hole.visible = false; H.add(hole);

  [-1, 1].forEach(s => {
    const d = decal(1.8, .9, (x, w, hh) => {
      x.fillStyle = 'rgba(236,236,214,.93)'; x.font = 'bold 190px Impact,"Arial Black",sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('154', w / 2, hh * .4);
      for (let i = 0; i < 13; i++) { x.fillStyle = i % 2 ? 'rgba(20,20,20,.92)' : 'rgba(240,200,40,.95)'; x.fillRect(38 + i * 34, hh * .8, 34, hh * .14); }
    });
    const sf = onSkin(5.3, 1.65, s); d.position.copy(sf.p).addScaledVector(sf.n, .015); d.lookAt(sf.p.clone().add(sf.n)); H.add(d);
  });

  return root;
}
