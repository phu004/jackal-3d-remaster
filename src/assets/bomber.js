// Player / ally aircraft. buildTucano: the EMB-314 Super Tucano (A-29B), a single-engine turboprop attack plane: low
// straight wing with four bombs on pylons, a long slim fuselage with an ogive spinner and five scimitar blades, a
// two-seat bubble canopy, a swept fin with dorsal fillet and a small tailplane, in the Brazilian air force
// green / olive camouflage over a pale grey underside. Kept to the game's compressed scale: ~11.4 m long,
// ~11.2 m wingspan.
// Origin on the fuselage axis at mid-length, the nose faces -Z (the tail is at +Z), +Y is up. Named parts:
// `propeller` (spins about Z; add to its rotation.z each frame), `gear` (landing gear, hidden by default; call
// `tucano.setGearDown(true)` to show it), `bombs` (the four wing bombs, a group you can hide when they are
// dropped) and `muzzle` (an empty at the gun pod's mouth, where tracer rounds start).
import * as THREE from 'three';
import { add, mat, cached, PI } from './common.js';

const pmat = (c, r, m, o) => mat(c, r, m, Object.assign({ envMapIntensity: .35 }, o));

// Seamless-ish camouflage tile: pale grey underside band (top 30 %), olive upper surfaces with dark soft-edged
// patches, panel lines, rivets, streaks and wear. One tile covers CAMO_TILE metres.
const CAMO_TILE = 3.0;
const PAL = { under: '#a8aca6', base: '#425030', dark: '#2f3a22', deep: '#232b18' };
function camoTexture() {
  const S = 512, c = document.createElement('canvas'); c.width = c.height = S; const x = c.getContext('2d');
  let seed = 47; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  x.fillStyle = PAL.under; x.fillRect(0, 0, S, S * .3);
  for (let i = 0; i < 400; i++) { x.fillStyle = `rgba(120,130,120,${rnd() * .15})`; x.fillRect(rnd() * S, rnd() * S * .3, 3, 3); }
  x.fillStyle = PAL.base; x.fillRect(0, S * .3, S, S * .7);
  const blob = (cx, cy, rad, col, alpha) => {
    const n = 11, pts = Array.from({ length: n }, (_, i) => { const a = i / n * PI * 2, rr = rad * (.55 + rnd() * .65); return [Math.cos(a) * rr, Math.sin(a) * rr * (.5 + rnd() * .6)]; });
    x.globalAlpha = alpha; x.fillStyle = col;
    for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) { // wrap so the tile is seamless
      x.beginPath();
      pts.forEach(([px, py], i) => { const [qx, qy] = pts[(i + 1) % n]; const mx = (px + qx) / 2, my = (py + qy) / 2;
        i ? x.quadraticCurveTo(cx + px + ox, cy + py + oy, cx + mx + ox, cy + my + oy) : x.moveTo(cx + mx + ox, cy + my + oy); });
      x.closePath(); x.fill();
    }
    x.globalAlpha = 1;
  };
  for (let i = 0; i < 9; i++) blob(rnd() * S, S * .3 + rnd() * S * .7, 55 + rnd() * 70, PAL.dark, .85);
  for (let i = 0; i < 4; i++) blob(rnd() * S, S * .3 + rnd() * S * .7, 30 + rnd() * 40, PAL.deep, .55);
  x.strokeStyle = 'rgba(15,22,10,.55)'; x.lineWidth = 1.4; // panel lines
  for (let i = 0; i <= S; i += 64) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, S); x.stroke(); x.beginPath(); x.moveTo(0, i); x.lineTo(S, i); x.stroke(); }
  x.fillStyle = 'rgba(20,28,12,.5)'; // rivets
  for (let i = 8; i < S; i += 16) for (let j = 0; j < S; j += 64) { x.beginPath(); x.arc(i, j, 1.3, 0, 7); x.fill(); x.beginPath(); x.arc(j, i, 1.3, 0, 7); x.fill(); }
  x.strokeStyle = 'rgba(18,26,12,.7)'; x.lineWidth = 2; // access hatches
  x.strokeRect(120, S * .55, 90, 60); x.strokeRect(340, S * .65, 70, 55); x.strokeRect(70, S * .4, 100, 70);
  for (let i = 0; i < 80; i++) { // streaks running down
    const px = rnd() * S, py = S * .3 + rnd() * S * .7, len = 20 + rnd() * 120, g = x.createLinearGradient(0, py, 0, py + len);
    g.addColorStop(0, `rgba(10,15,5,${.12 + rnd() * .18})`); g.addColorStop(1, 'rgba(10,15,5,0)');
    x.fillStyle = g; x.fillRect(px, py, 1 + rnd() * 3, len);
  }
  for (let i = 0; i < 100; i++) { x.fillStyle = `rgba(${150 + rnd() * 60 | 0},${150 + rnd() * 50 | 0},${130 + rnd() * 40 | 0},.65)`; x.fillRect(rnd() * S, S * .3 + rnd() * S * .7, 2 + rnd() * 4, 1 + rnd() * 2); } // paint chips
  for (let i = 0; i < 5000; i++) { x.fillStyle = rnd() > .5 ? 'rgba(230,225,200,.04)' : 'rgba(10,15,5,.06)'; x.fillRect(rnd() * S, rnd() * S, 2, 2); } // dust
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
  return t;
}

// Brushed-metal panel texture for struts and fittings.
function metalTexture() {
  const S = 256, c = document.createElement('canvas'); c.width = c.height = S; const x = c.getContext('2d');
  x.fillStyle = '#8e9296'; x.fillRect(0, 0, S, S);
  for (let i = 0; i < 400; i++) { x.strokeStyle = `rgba(255,255,255,${Math.random() * .05})`; x.beginPath(); const y = Math.random() * S; x.moveTo(0, y); x.lineTo(S, y + (Math.random() - .5) * 4); x.stroke(); }
  x.strokeStyle = 'rgba(40,40,40,.5)'; x.lineWidth = 1;
  for (let i = 0; i < S; i += 32) { x.beginPath(); x.moveTo(0, i); x.lineTo(S, i); x.stroke(); }
  x.fillStyle = 'rgba(60,60,60,.5)';
  for (let i = 8; i < S; i += 16) for (let j = 8; j < S; j += 16) { x.beginPath(); x.arc(i, j, 1, 0, 7); x.fill(); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
  return t;
}

// Give every camo-painted mesh box-projected UVs in the aircraft's own space, so the pattern has the same scale
// on every panel and flows across neighbouring parts.
function projectCamo(root, camo) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert(), p = new THREE.Vector3(), n = new THREE.Vector3();
  root.traverse(m => {
    if (!m.isMesh || m.material !== camo) return;
    const g = m.geometry, toRoot = new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld), nm = new THREE.Matrix3().getNormalMatrix(toRoot);
    const pos = g.attributes.position, nor = g.attributes.normal, uv = new Float32Array(pos.count * 2);
    for (let i = 0; i < pos.count; i++) {
      p.fromBufferAttribute(pos, i).applyMatrix4(toRoot); n.fromBufferAttribute(nor, i).applyMatrix3(nm);
      const ax = Math.abs(n.x), ay = Math.abs(n.y), az = Math.abs(n.z);
      const [u, v] = ax >= ay && ax >= az ? [p.z, p.y] : ay >= az ? [p.x, p.z] : [p.x, p.y];
      uv[i * 2] = u / CAMO_TILE; uv[i * 2 + 1] = v / CAMO_TILE;
    }
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  });
}

// A scimitar propeller blade along +X: wide at the root, tapering, tip swept back (+Y is the trailing side).
function bladeGeo(len, rootC, tipC) {
  const s = new THREE.Shape();
  s.moveTo(0, -rootC / 2);
  s.bezierCurveTo(len * .35, -rootC * .55, len * .8, -tipC / 2 + .02, len, -tipC / 2 + .12);
  s.lineTo(len, tipC / 2 + .12);
  s.bezierCurveTo(len * .8, tipC / 2 + .1, len * .4, rootC * .45, 0, rootC / 2);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: .02, bevelEnabled: false });
  g.translate(0, 0, -.01); g.computeVertexNormals();
  return g;
}

// A flat tapered surface (wing / tailplane) from a top-view quad; +X is the span, rootLE/rootTE etc. are Z offsets.
function planform(pts, thick, bevel) {
  const s = new THREE.Shape(); pts.forEach(([x, y], i) => i ? s.lineTo(x, y) : s.moveTo(x, y)); s.closePath();
  return new THREE.ExtrudeGeometry(s, { depth: thick, bevelEnabled: bevel > 0, bevelThickness: bevel * .7, bevelSize: bevel, bevelSegments: 2 });
}

// Capsule along Y (radius r, straight length len): a stand-in for THREE.CapsuleGeometry, which r128 lacks.
function capsule(r, len, capSegs, radial) {
  const pts = [];
  for (let i = 0; i <= capSegs; i++) { const a = -PI / 2 + i / capSegs * PI / 2; pts.push(new THREE.Vector2(r * Math.cos(a), -len / 2 + r * Math.sin(a))); }
  for (let i = 0; i <= capSegs; i++) { const a = i / capSegs * PI / 2; pts.push(new THREE.Vector2(r * Math.cos(a), len / 2 + r * Math.sin(a))); }
  pts[0].x = pts[pts.length - 1].x = 0; // close the poles exactly
  return new THREE.LatheGeometry(pts, radial);
}

export function buildTucano(envMap) {
  const m = cached('tucanoMats', () => ({
    camo: pmat(0xffffff, .7, .2, { map: camoTexture(), envMapIntensity: .3 }),
    glass: Object.assign(new THREE.MeshPhysicalMaterial({ color: 0x0a141c, roughness: .1, metalness: .85, transparent: true, opacity: .88, clearcoat: 1, clearcoatRoughness: .05,
      reflectivity: .9, envMap: envMap || null, envMapIntensity: 3, side: THREE.DoubleSide, depthWrite: false }), {}),
    metal: pmat(0xffffff, .45, .75, { map: metalTexture() }),
    dark: pmat(0x1f211c, .7, .25), canopyFrame: pmat(0x1e211c, .6, .3), prop: pmat(0x181a17, .55, .35), propTip: pmat(0xe8d24a, .5, .1),
    hub: pmat(0x2a2c2a, .55, .6), intake: pmat(0x0a0a0a, .9, .05), exhaust: pmat(0x0e0e0e, .55, .4),
    seat: pmat(0x3a3630, .9, 0), panel: pmat(0x1a1c1a, .6, .3), hud: pmat(0x50ff90, .2, .4, { emissive: 0x103020, emissiveIntensity: .8 }),
    tyre: pmat(0x121212, .95, 0), bombBody: pmat(0x4a5040, .75, .25), bombStripe: pmat(0xc8a028, .6, .15), bombNose: pmat(0x2a2c28, .55, .4),
  }));
  const root = new THREE.Group(); root.name = 'tucano';

  const L = 11.4, HALF_L = L / 2;
  const FUS_D = .12 * L, FUS_W = .10 * L, FUS_D_FIN = .08 * L, FUS_D_FIN_TE = .052 * L, FUS_TIP = .024 * L; // fuselage depth / width and tail depths
  const wRatio = FUS_W / FUS_D;
  const CANOPY_LEN = .33 * L, CANOPY_H = .07 * L, CANOPY_HALF_W = .4 * FUS_W, CANOPY_SINK = .025 * L;
  const FIN_H = .17 * L, FIN_ROOT = .15 * L, FIN_TIPC = .08 * L, FIN_SWEEP = Math.tan(30 * PI / 180) * FIN_H;
  const SPAN = .98 * L, HALF_SPAN = SPAN / 2, W_ROOT = .2 * L, W_TIP = .5 * W_ROOT, W_DIH = 3;
  const W_SWEEP = Math.tan(6 * PI / 180) * HALF_SPAN, W_DIH_RISE = Math.tan(W_DIH * PI / 180) * HALF_SPAN, W_THICK = .13, W_Y = -.06;
  const WING_Z = -HALF_L + .3 * L + W_ROOT / 2;
  const HS_HALF = .34 * SPAN / 2, HS_ROOT = .1 * L, HS_TIPC = .5 * HS_ROOT, HS_SWEEP = Math.tan(15 * PI / 180) * HS_HALF;
  const FIN_BASE_Z = .42 * L, FIN_TE_Z = FIN_BASE_Z + FIN_ROOT / 2, TAIL_Z = FIN_TE_Z + .05 * L;
  const noseZ = -HALF_L, SPINNER_LEN = .07 * L, SPIN_R = .3;

  // fuselage: one lathe from the spinner base to the tail, squashed to its width. The cowl is part of it, so the
  // profile flows from cowl lip to cockpit without steps (monotone cubic through the depth stops).
  const FUS_START = noseZ + SPINNER_LEN, zToT = z => (z - FUS_START) / (TAIL_Z - FUS_START);
  const stops = [[0, SPIN_R * 2.16], [zToT(noseZ + .12 * L), .8], [zToT(noseZ + .2 * L), .98], [zToT(noseZ + .3 * L), FUS_D],
    [zToT(noseZ + .6 * L), FUS_D * .82], [zToT(FIN_BASE_Z), FUS_D_FIN], [zToT(FIN_TE_Z), FUS_D_FIN_TE], [1, FUS_TIP]];
  const N = stops.length, sh = [], sd = [], sm = [];
  for (let i = 0; i < N - 1; i++) { sh[i] = stops[i + 1][0] - stops[i][0]; sd[i] = (stops[i + 1][1] - stops[i][1]) / sh[i]; }
  sm[0] = sd[0]; for (let i = 1; i < N - 1; i++) sm[i] = sd[i - 1] * sd[i] <= 0 ? 0 : (sd[i - 1] + sd[i]) / 2; sm[N - 1] = sd[N - 2];
  const depthAt = t => {
    for (let i = 0; i < N - 1; i++) if (t <= stops[i + 1][0] || i === N - 2) {
      const k = Math.min(1, Math.max(0, (t - stops[i][0]) / sh[i])), k2 = k * k, k3 = k2 * k;
      return (2 * k3 - 3 * k2 + 1) * stops[i][1] + (k3 - 2 * k2 + k) * sh[i] * sm[i] + (-2 * k3 + 3 * k2) * stops[i + 1][1] + (k3 - k2) * sh[i] * sm[i + 1];
    }
  };
  const prof = []; for (let i = 0; i <= 64; i++) { const t = i / 64; prof.push(new THREE.Vector2(Math.max(depthAt(t) / 2, .001), FUS_START + t * (TAIL_Z - FUS_START))); }
  const fusGeo = new THREE.LatheGeometry(prof, 32); fusGeo.rotateX(PI / 2);
  { const pos = fusGeo.attributes.position; for (let i = 0; i < pos.count; i++) pos.setX(i, pos.getX(i) * wRatio); pos.needsUpdate = true; fusGeo.computeVertexNormals(); }
  add(root, fusGeo, m.camo, 0, .3, 0).name = 'fuselage';
  const lip = add(root, new THREE.CircleGeometry(SPIN_R * 1.08, 24), m.intake, 0, .3, FUS_START + .01); // dark disc closing the cowl lip, behind the spinner
  lip.rotation.y = PI; lip.scale.x = wRatio; lip.castShadow = false;
  const tailY = .3 + FUS_D_FIN / 2 - .1;

  // canopy: a glass bubble sunk into the spine, three hoop frames, instrument panel, HUD and two seats with pilots
  const cz = noseZ + (.19 * L + .52 * L) / 2, cy = .3 + FUS_D / 2 - CANOPY_SINK;
  const bubble = new THREE.SphereGeometry(1, 48, 24, 0, PI * 2, 0, PI / 2); bubble.scale(CANOPY_HALF_W, CANOPY_H, CANOPY_LEN / 2);
  { const pos = bubble.attributes.position; for (let i = 0; i < pos.count; i++) { const z = pos.getZ(i); if (z > 0) pos.setZ(i, z * .72); } pos.needsUpdate = true; bubble.computeVertexNormals(); }
  const canopy = add(root, bubble, m.glass, 0, cy, cz); canopy.name = 'canopy'; canopy.castShadow = canopy.receiveShadow = false;
  const hoop = (t, r) => {
    const zn = t <= .5 ? t / .5 - 1 : (t - .5) / .5, zp = cz + zn * CANOPY_LEN / 2 * (t <= .5 ? 1 : .72), sh2 = Math.sqrt(Math.max(.05, 1 - zn * zn));
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1, r, 10, 48, PI), m.canopyFrame);
    ring.scale.set(CANOPY_HALF_W * sh2 * .99, CANOPY_H * sh2 * .99, 1); ring.position.set(0, cy, zp); root.add(ring);
  };
  hoop(.03, .028); hoop(.5, .032); hoop(.97, .026);
  const iy = .62 - CANOPY_SINK + .02;
  add(root, new THREE.BoxGeometry(.55, .14, .09), m.panel, 0, iy, cz - CANOPY_LEN * .42);
  add(root, new THREE.BoxGeometry(.28, .07, .02), m.hud, 0, iy + .06, cz - CANOPY_LEN * .44);
  [cz - CANOPY_LEN * .18, cz + CANOPY_LEN * .2].forEach(z => {
    add(root, new THREE.BoxGeometry(.34, .09, .36), m.seat, 0, iy - .02, z);
    add(root, new THREE.BoxGeometry(.34, .36, .08), m.seat, 0, iy + .18, z + .16);
    add(root, new THREE.BoxGeometry(.22, .1, .07), m.seat, 0, iy + .37, z + .18);
    add(root, new THREE.BoxGeometry(.26, .26, .16), m.dark, 0, iy + .16, z + .02);
    add(root, new THREE.SphereGeometry(.1, 12, 10), m.dark, 0, iy + .32, z).scale.set(1, 1.05, 1);
    add(root, new THREE.BoxGeometry(.16, .06, .02), m.panel, 0, iy + .32, z - .1);
  });

  // nose: ogive spinner (tip at the nose), chin intake under the cowl, three swept exhaust stacks each side
  const sp = []; for (let i = 0; i <= 16; i++) { const u = i / 16; sp.push(new THREE.Vector2(Math.max(.001, SPIN_R * Math.pow(Math.sin(u * PI / 2), .75)), u * SPINNER_LEN)); }
  const spGeo = new THREE.LatheGeometry(sp, 32); spGeo.rotateX(PI / 2);
  add(root, spGeo, m.hub, 0, .3, noseZ).name = 'spinner';
  { const z = FUS_START + .65; add(root, new THREE.CylinderGeometry(.09, .09, .16, 16), m.intake, 0, .3 - depthAt(zToT(z)) / 2 * .95, z).rotation.x = PI / 2; }
  [-1, 1].forEach(s => { for (let i = 0; i < 3; i++) {
    const z = FUS_START + .25 + i * .14, r = depthAt(zToT(z)) / 2 * .92;
    add(root, new THREE.CylinderGeometry(.022, .03, .22, 10), m.exhaust, s * r * wRatio, .36 - i * .03, z).rotation.set(PI / 2 + .3, 0, s * .5);
  } });

  // wings: low, straight, slightly swept and with a little dihedral; mirrored left / right
  [-1, 1].forEach(s => {
    const g = planform([[0, -W_ROOT / 2], [HALF_SPAN, -W_TIP / 2 + W_SWEEP], [HALF_SPAN, W_TIP / 2 + W_SWEEP], [0, W_ROOT / 2]], W_THICK, .018);
    g.translate(0, 0, -W_THICK / 2); g.rotateX(-PI / 2); g.rotateY(PI); g.computeVertexNormals();
    const w = add(root, g, m.camo, 0, W_Y, WING_Z); w.name = s < 0 ? 'wingL' : 'wingR';
    if (s < 0) w.scale.x = -1;
    w.rotation.z = s * (W_DIH * PI / 180);
  });

  // fin with a dorsal fillet, tailplane and elevators
  const finS = new THREE.Shape(); finS.moveTo(-FIN_ROOT / 2, 0); finS.lineTo(FIN_ROOT / 2, 0); finS.lineTo(FIN_TIPC / 2 + FIN_SWEEP, FIN_H); finS.lineTo(-FIN_TIPC / 2 + FIN_SWEEP, FIN_H); finS.closePath();
  const finG = new THREE.ExtrudeGeometry(finS, { depth: .07, bevelEnabled: true, bevelThickness: .008, bevelSize: .015, bevelSegments: 2 });
  finG.translate(0, 0, -.035); finG.rotateY(-PI / 2); finG.computeVertexNormals();
  add(root, finG, m.camo, 0, tailY, FIN_BASE_Z).name = 'fin';
  { const f = new THREE.Shape(); f.moveTo(-.55, 0); f.lineTo(.05, .18); f.lineTo(.4, .18); f.lineTo(.4, 0); f.closePath();
    const g = new THREE.ExtrudeGeometry(f, { depth: .1, bevelEnabled: false }); g.translate(0, 0, -.05); g.rotateY(-PI / 2); g.computeVertexNormals();
    add(root, g, m.camo, 0, tailY - .02, L * .36).name = 'dorsalFillet'; }
  [-1, 1].forEach(s => {
    const g = planform([[0, -HS_ROOT / 2], [HS_HALF, -HS_TIPC / 2 + HS_SWEEP], [HS_HALF, HS_TIPC / 2 + HS_SWEEP], [0, HS_ROOT / 2]], .07, .012);
    g.translate(0, 0, -.035); g.rotateX(PI / 2); g.computeVertexNormals();
    const hs = add(root, g, m.camo, 0, tailY, L * .42); hs.name = s < 0 ? 'stabL' : 'stabR'; if (s < 0) hs.scale.x = -1;
    const e = new THREE.Shape(); e.moveTo(0, HS_ROOT / 2 - .15); e.lineTo(HS_HALF, HS_TIPC / 2 + HS_SWEEP - .12); e.lineTo(HS_HALF, HS_TIPC / 2 + HS_SWEEP); e.lineTo(0, HS_ROOT / 2); e.closePath();
    const eg = new THREE.ExtrudeGeometry(e, { depth: .05, bevelEnabled: false }); eg.translate(0, 0, -.025); eg.rotateX(PI / 2);
    const el = add(root, eg, m.camo, 0, tailY + .005, L * .42); el.name = s < 0 ? 'elevatorL' : 'elevatorR'; if (s < 0) el.scale.x = -1;
  });

  // propeller: hub at the spinner base, five pitched scimitar blades with yellow tips, and a faint blur disc
  const PROP_R = .125 * L, HUB_R = SPIN_R * .9, bLen = PROP_R - HUB_R;
  const prop = new THREE.Group(); prop.name = 'propeller'; prop.position.set(0, .3, noseZ + SPINNER_LEN); root.add(prop);
  add(prop, new THREE.CylinderGeometry(HUB_R, HUB_R, .1, 20), m.hub, 0, 0, .02).rotation.x = PI / 2;
  const bg = bladeGeo(bLen, .3, .12);
  for (let i = 0; i < 5; i++) {
    const b = new THREE.Group(); b.rotation.z = i / 5 * PI * 2; prop.add(b);
    const bm = add(b, bg, m.prop, HUB_R, 0, 0); bm.rotation.x = .35;
    add(bm, new THREE.BoxGeometry(.1, .12, .026), m.propTip, bLen - .05, .12, 0);
  }
  const blur = add(prop, new THREE.CircleGeometry(PROP_R, 32), new THREE.MeshBasicMaterial({ color: 0x2a2c2a, transparent: true, opacity: .1, side: THREE.DoubleSide, depthWrite: false }), 0, 0, 0);
  blur.name = 'propBlur'; blur.castShadow = blur.receiveShadow = false;

  // landing gear (hidden by default): nose leg and two main legs with doors
  const gear = new THREE.Group(); gear.name = 'gear'; gear.visible = false; root.add(gear);
  const WR = .16, WW = .12, NS = .06 * L;
  const ng = new THREE.Group(); ng.name = 'noseGear'; ng.position.set(0, -.1, noseZ + .3 * L); gear.add(ng);
  add(ng, new THREE.CylinderGeometry(.04, .04, NS, 10), m.metal, 0, -NS / 2, 0);
  add(ng, new THREE.CylinderGeometry(.055, .055, .055, 10), m.dark, 0, -NS, 0);
  add(ng, new THREE.CylinderGeometry(WR, WR, WW, 18), m.tyre, 0, -NS - WR + .02, 0).rotation.z = PI / 2;
  add(ng, new THREE.CylinderGeometry(.08, .08, WW + .01, 12), m.metal, 0, -NS - WR + .02, 0).rotation.z = PI / 2;
  [-1, 1].forEach(s => {
    const mg = new THREE.Group(); mg.name = s < 0 ? 'gearL' : 'gearR'; mg.position.set(s * .5, -.18, WING_Z + .1); gear.add(mg);
    add(mg, new THREE.CylinderGeometry(.055, .055, .7, 10), m.metal, s * .14, -.36, 0);
    add(mg, new THREE.CylinderGeometry(.08, .08, .075, 10), m.dark, s * .14, -.7, 0);
    add(mg, new THREE.CylinderGeometry(WR, WR, WW, 18), m.tyre, s * .14, -.78, 0).rotation.z = PI / 2;
    add(mg, new THREE.CylinderGeometry(.08, .08, WW + .01, 12), m.metal, s * .14, -.78, 0).rotation.z = PI / 2;
    add(mg, new THREE.BoxGeometry(.5, .05, .55), m.camo, s * .26, -.14, 0).name = s < 0 ? 'gearDoorL' : 'gearDoorR';
  });

  // four bombs on wing pylons, with a yellow band and tail fins
  const bombs = new THREE.Group(); bombs.name = 'bombs'; root.add(bombs);
  const BL = .1 * L, BR = BL * .12;
  for (const x of [1.2, 2.4, -1.2, -2.4]) {
    const t = Math.abs(x) / HALF_SPAN, zAt = WING_Z + W_SWEEP * t, pylonCy = W_Y + W_DIH_RISE * t - W_THICK / 2 - .14 - .05;
    add(bombs, new THREE.BoxGeometry(.09, .1, .42), m.dark, x, pylonCy, zAt).name = 'pylon';
    add(bombs, new THREE.BoxGeometry(.07, .05, .34), m.dark, x, pylonCy - .075, zAt);
    const b = new THREE.Group(); b.name = 'bomb'; b.position.set(x, pylonCy - .05 - .05 - .06 - BR, zAt); bombs.add(b);
    const body = capsule(BR, BL - BR * 2, 6, 14); body.rotateX(PI / 2); add(b, body, m.bombBody);
    add(b, new THREE.SphereGeometry(BR, 14, 12), m.bombNose, 0, 0, -BL / 2 + BR * .5).scale.set(1, 1, 1.25);
    for (let k = 0; k < 4; k++) { const fg = new THREE.Group(); fg.rotation.z = k / 4 * PI * 2; b.add(fg); add(fg, new THREE.BoxGeometry(BR * 2.2, .02, BL * .24), m.bombNose, BR * 1.3, 0, BL / 2 - BL * .1); }
    add(b, new THREE.CylinderGeometry(BR * 1.05, BR * 1.05, .05, 14), m.bombStripe, 0, 0, -BL * .08).rotation.x = PI / 2;
  }

  // pitot tubes on the cowl flanks and a gun pod under the fuselage with a muzzle point at its mouth
  [-1, 1].forEach(s => add(root, new THREE.CylinderGeometry(.01, .01, .45, 6), m.metal, s * .28, -.02, noseZ + 1.8).rotation.x = PI / 2);
  add(root, new THREE.CylinderGeometry(.11, .11, .9, 12), m.dark, 0, -.32, -L * .05).rotation.x = PI / 2;
  const muzzle = new THREE.Object3D(); muzzle.name = 'muzzle'; muzzle.position.set(0, -.32, -L * .05 - .5); root.add(muzzle);

  projectCamo(root, m.camo);
  root.setGearDown = down => { gear.visible = !!down; };
  return root;
}
