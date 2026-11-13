// Light attack helicopter (MD-500 Defender style): a small teardrop fuselage with a big
// greenhouse canopy, exposed skids, a lathe-tapered tail boom with a T-tail, stub-arm
// weapon pylons carrying short gun pods, and a chin sensor turret. Kept to the game's
// compressed scale: 7.1 m long over the rotor, 2.5 m wide over the skids.
//
// Origin on the ground at the fuselage centreline, the nose faces -Z. Named parts:
//   `rotor`       — the main rotor group (spins about Y, carries `rotorBlade`s and a blur disc)
//   `tailRotor`   — the tail rotor group (spins about X, mounted on the fin's +X side)
//   `sensor`      — the chin turret (aims, small ball under the nose)
//   `tailAssembly`— fin + stabiliser + tail rotor + tail skid, tilted back as a unit
//
// Cab ellipsoid: C = 2.90 m long, H = 0.55 × C tall, W = 0.45 × C wide. The camo
// is a tan/sand/brown desert scheme drawn to a 2.6 m tile, box-projected across
// every mesh in the tank's own space so the pattern flows seamlessly.
//
// The glass is a partial sphere over the front-upper cabin, split into four panes
// by three vertical frame posts (body camo) and a horizontal beltline rail.
import * as THREE from 'three';
import { add, mat, cached, PI } from './common.js';

const pmat = (c, r, m, o) => mat(c, r, m, Object.assign({ envMapIntensity: .35 }, o));

// Three-colour desert camouflage: tan base with light-sand and brown patches, and a
// few dark accents. Seamless: patches wrap round the tile edges. One tile = CAMO_TILE m.
const CAMO_TILE = 2.6;
const HELI_PALETTE = {
  base: '#b39a6f',   // tan
  a:    '#d4c098',   // light sand
  b:    '#7a5535',   // brown
  dark: '#3a2e20',   // dark brown
};

function camoTexture(pal = HELI_PALETTE) {
  const S = 256, c = document.createElement('canvas'); c.width = c.height = S;
  const x = c.getContext('2d');
  let seed = 31; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  x.fillStyle = pal.base; x.fillRect(0, 0, S, S);
  const blob = (cx, cy, rad, col) => {
    const n = 9, pts = Array.from({ length: n }, (_, i) => {
      const a = i / n * PI * 2, rr = rad * (.6 + rnd() * .6);
      return [Math.cos(a) * rr, Math.sin(a) * rr * (.5 + rnd() * .5)];
    });
    x.fillStyle = col;
    for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) {   // wrap so the tile is seamless
      x.beginPath();
      pts.forEach(([px, py], i) => {
        const [qx, qy] = pts[(i + 1) % n];
        const mx = (px + qx) / 2, my = (py + qy) / 2;
        i ? x.quadraticCurveTo(cx + px + ox, cy + py + oy, cx + mx + ox, cy + my + oy)
          : x.moveTo(cx + mx + ox, cy + my + oy);
      });
      x.closePath(); x.fill();
    }
  };
  for (let i = 0; i < 7; i++) blob(rnd() * S, rnd() * S, 26 + rnd() * 26, pal.a);
  for (let i = 0; i < 5; i++) blob(rnd() * S, rnd() * S, 20 + rnd() * 22, pal.b);
  for (let i = 0; i < 2; i++) blob(rnd() * S, rnd() * S,  8 + rnd() * 10, pal.dark);
  for (let i = 0; i < 1800; i++) {                              // dust and sun-fade speckle
    x.fillStyle = rnd() > .5 ? 'rgba(255,240,210,.07)' : 'rgba(60,40,20,.06)';
    x.fillRect(rnd() * S, rnd() * S, 2, 2);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
  return t;
}

// Give every camo-painted mesh box-projected UVs in the heli's own space, so the
// pattern has the same scale on every panel and flows across neighbouring parts.
function projectCamo(root, camo, tile) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const p = new THREE.Vector3(), n = new THREE.Vector3();
  root.traverse(m => {
    if (!m.isMesh || m.material !== camo) return;
    const g = m.geometry;
    const toRoot = new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld);
    const nm = new THREE.Matrix3().getNormalMatrix(toRoot);
    const pos = g.attributes.position, nor = g.attributes.normal;
    const uv = new Float32Array(pos.count * 2);
    for (let i = 0; i < pos.count; i++) {
      p.fromBufferAttribute(pos, i).applyMatrix4(toRoot);
      n.fromBufferAttribute(nor, i).applyMatrix3(nm);
      const ax = Math.abs(n.x), ay = Math.abs(n.y), az = Math.abs(n.z);
      const [u, v] = ax >= ay && ax >= az ? [p.z, p.y] : ay >= az ? [p.x, p.z] : [p.x, p.y];
      uv[i * 2] = u / tile; uv[i * 2 + 1] = v / tile;
    }
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  });
}

// Rotor blur: a fixed 4-blade smear drawn on a disc that rides with the rotor.
// Callers set opacity to fade it in with rotor speed (0 = invisible when idling).
function rotorBlurMaterial() {
  const tex = cached('heliRotorBlur', () => {
    const S = 512, c = document.createElement('canvas'); c.width = c.height = S;
    const x = c.getContext('2d');
    const cx = S / 2, R = S / 2 - 2, img = x.createImageData(S, S), d = img.data;
    const cy = (py) => cx - py;
    for (let py = 0; py < S; py++) for (let px = 0; px < S; px++) {
      const dx = px - cx, dy = cy(py), r = Math.hypot(dx, dy) / R;
      if (r > 1) continue;
      const a = Math.atan2(dy, dx);
      let blade = 0;
      for (let k = 0; k < 4; k++) {
        let da = a - k * 2 * Math.PI / 4;
        da = Math.atan2(Math.sin(da), Math.cos(da));
        blade = Math.max(blade, Math.exp(-(da * da) / 0.28));
      }
      const radial = Math.min(1, Math.max(0, (r - 0.12) / 0.25)) *
                     (0.55 + 0.45 * r) * Math.min(1, (1 - r) / 0.03);
      let alpha = (0.02 + 0.12 * blade) * radial;
      let col = [28, 30, 32];
      const tip = Math.exp(-((r - 0.955) ** 2) / 0.0004);
      if (tip > 0.01) {
        col = col.map((v, i) => v + ([232, 192, 64][i] - v) * tip * 0.5);
        alpha = Math.max(alpha, 0.05 * tip * (0.5 + 0.5 * blade));
      }
      const i = (py * S + px) * 4;
      d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = alpha * 255;
    }
    x.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(c); t.anisotropy = 8;
    return t;
  });
  return new THREE.MeshBasicMaterial({
    map: tex, transparent: true, opacity: 0,
    side: THREE.DoubleSide, depthWrite: false,
  });
}

// A tapered blade extending from local Z=0 (root) to Z=-length (tip).
function taperedBladeGeo(rootW, tipW, length, thickness) {
  const shape = new THREE.Shape();
  shape.moveTo(-rootW / 2, 0);
  shape.lineTo( rootW / 2, 0);
  shape.lineTo( tipW  / 2, length);
  shape.lineTo(-tipW  / 2, length);
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false });
  geo.rotateX(-PI / 2);
  geo.translate(0, -thickness / 2, 0);
  return geo;
}

// A flat arm with a tapered outer end and a swept leading edge.
//   Extends from local X=0 (root) to X=length (tip), thin along Y, width in Z.
//   sweep = how far the leading edge sweeps back (along +Z).
function sweptArmGeo(length, rootW, tipW, thickness, sweep) {
  const shape = new THREE.Shape();
  shape.moveTo(0, -rootW / 2);
  shape.lineTo(length, -tipW / 2 + sweep);
  shape.lineTo(length,  tipW / 2 + sweep);
  shape.lineTo(0, rootW / 2);
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false });
  geo.rotateX(-PI / 2);
  geo.translate(0, -thickness / 2, 0);
  return geo;
}

// A sphere section matching the cabin's rear taper, so every shell piece lines up.
function cabinSectionGeo(phiStart, phiLength, thetaStart, thetaLength,
                         phiSegs = 32, thetaSegs = 24) {
  const geo = new THREE.SphereGeometry(1, phiSegs, thetaSegs, phiStart, phiLength, thetaStart, thetaLength);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const z = pos.getZ(i);
    if (z > 0) {                            // rear half (local +Z = tail side)
      const t = z;
      pos.setX(i, pos.getX(i) * (1 - 0.55 * t));
      pos.setY(i, pos.getY(i) * (1 - 0.35 * t));
      pos.setZ(i, z * 1.02);
    }
  }
  pos.needsUpdate = true; geo.computeVertexNormals();
  return geo;
}

// ---------------------------------------------------------------------
//  Build the helicopter
// ---------------------------------------------------------------------
//  Scale reference (metres):
//    cabin length C = 2.90, height H = 0.55 × C = 1.595, width = 0.45 × C = 1.305
//    overall length ≈ 7.1 over the lathe tail + tail rotor
//    main rotor radius = 1.1 × C = 3.19 (diameter 6.38)
//    skid track 1.55, skid length 3.20
//  Origin on the ground at the fuselage centreline, nose pointing -Z.
// ---------------------------------------------------------------------
export function buildHelicopter() {
  const m = cached('heliMats', () => ({
    camo:   Object.assign(pmat(0xffffff, .65, .15, { map: camoTexture() }),
              { userData: { camo: HELI_PALETTE }, side: THREE.DoubleSide }),
    dark:   pmat(0x22201c, .7, .3),
    metal:  pmat(0x55524a, .45, .7),
    // Clear glass that still mirrors the sky. A plain low opacity would fade the reflection
    // along with the tint, so use r128's transmission stub instead: alpha = 1 - transmission
    // + luminance(specular), so the pane stays see-through where it reflects little and turns
    // opaque where it catches the sky / sun. reflectivity 1 raises F0 from 4% to 16% so the
    // sky shows from the top-down camera, not only at grazing angles.
    glass:  new THREE.MeshPhysicalMaterial({
              color: 0x1c2832, roughness: .04, metalness: 0,      // dark smoked tint
              transparent: true, transmission: .55, reflectivity: .8,
              clearcoat: 1, clearcoatRoughness: .03, envMapIntensity: 1.3,
              side: THREE.FrontSide, depthWrite: false,
            }),
    interior: mat(0x1a1a1e, .9, .05, { side: THREE.BackSide }),
    seat:   pmat(0x2e2b26, .9, 0),
    rocket: pmat(0x4a4838, .6, .35),
    screen: pmat(0x1a3a44, .25, .6),
  }));

  const root = new THREE.Group(); root.name = 'helicopter';

  // ---- Key dimensions ----
  const C = 2.90;
  const H = C * 0.55;                          // 1.595
  const CABIN_L = C;
  const CABIN_H = H;
  const CABIN_W = C * 0.45;                    // 1.305
  const CABIN_CY = 0.80;
  const CABIN_BOTTOM = CABIN_CY - CABIN_H / 2; // 0.0025
  const CABIN_TOP    = CABIN_CY + CABIN_H / 2; // 1.5975
  const CABIN_CZ = -0.65;
  const CABIN_NOSE_Z = CABIN_CZ - CABIN_L / 2; // -2.10
  const CABIN_REAR_Z = CABIN_CZ + CABIN_L / 2; //  0.80

  const SX = CABIN_W / 2, SY = CABIN_H / 2, SZ = CABIN_L / 2;

  const TH_TOP = 0.15 * PI;                    // roof cap edge (top of the glass)
  const TH_BOT = 0.58 * PI;                    // beltline (bottom of the main glass)

  // -------------------------------------------------------------
  //  1. CABIN — 6 camo shell sections
  //     The front-upper quadrant is left open and filled by the glass panes.
  // -------------------------------------------------------------
  const roof = add(root, cabinSectionGeo(0, PI * 2, 0, TH_TOP), m.camo, 0, CABIN_CY, CABIN_CZ);
  roof.scale.set(SX, SY, SZ); roof.name = 'cabinRoofCap';

  const rearUpper = add(root, cabinSectionGeo(0, PI, TH_TOP, TH_BOT - TH_TOP), m.camo, 0, CABIN_CY, CABIN_CZ);
  rearUpper.scale.set(SX, SY, SZ); rearUpper.name = 'cabinRearUpper';

  const lowerRear = add(root, cabinSectionGeo(0, PI, TH_BOT, PI - TH_BOT), m.camo, 0, CABIN_CY, CABIN_CZ);
  lowerRear.scale.set(SX, SY, SZ); lowerRear.name = 'cabinLowerRear';

  const NOSE_PHI_START = 1.40 * PI;
  const NOSE_PHI_END   = 1.60 * PI;
  const PANE_NOSE_BOT  = 0.68 * PI;

  const lowerFrontRight = add(root, cabinSectionGeo(PI, NOSE_PHI_START - PI, TH_BOT, PI - TH_BOT), m.camo, 0, CABIN_CY, CABIN_CZ);
  lowerFrontRight.scale.set(SX, SY, SZ); lowerFrontRight.name = 'cabinLowerFrontRight';

  const lowerFrontLeft = add(root, cabinSectionGeo(NOSE_PHI_END, 2 * PI - NOSE_PHI_END, TH_BOT, PI - TH_BOT), m.camo, 0, CABIN_CY, CABIN_CZ);
  lowerFrontLeft.scale.set(SX, SY, SZ); lowerFrontLeft.name = 'cabinLowerFrontLeft';

  const lowerFrontCentre = add(root, cabinSectionGeo(NOSE_PHI_START, NOSE_PHI_END - NOSE_PHI_START, PANE_NOSE_BOT, PI - PANE_NOSE_BOT), m.camo, 0, CABIN_CY, CABIN_CZ);
  lowerFrontCentre.scale.set(SX, SY, SZ); lowerFrontCentre.name = 'cabinLowerFrontCentre';

  // -------------------------------------------------------------
  //  2. GLASS PANES + frame strips
  //     Four panes (right side, right windscreen, left windscreen, left side)
  //     plus a small lower nose panel; three vertical posts and a beltline rail.
  // -------------------------------------------------------------
  const FRAME_PHI = 0.08, FRAME_TH = 0.10, FRAME_SCALE = 1.008;

  const PHI_BACK_RIGHT = 1.00 * PI;
  const PHI_R_SPLIT    = 1.30 * PI;
  const PHI_CENTRE     = 1.50 * PI;
  const PHI_L_SPLIT    = 1.70 * PI;
  const PHI_BACK_LEFT  = 2.00 * PI;

  const PANE_TH_TOP = TH_TOP;
  const PANE_TH_LEN = (TH_BOT - TH_TOP) - FRAME_TH / 2;

  const paneDefs = [
    ['glassPaneRightSide', PHI_BACK_RIGHT + 0.04 / 2, (PHI_R_SPLIT - PHI_BACK_RIGHT) - 0.04],
    ['glassPaneRightWS',   PHI_R_SPLIT    + 0.04 / 2, (PHI_CENTRE  - PHI_R_SPLIT)    - 0.04],
    ['glassPaneLeftWS',    PHI_CENTRE     + 0.04 / 2, (PHI_L_SPLIT - PHI_CENTRE)     - 0.04],
    ['glassPaneLeftSide',  PHI_L_SPLIT    + 0.04 / 2, (PHI_BACK_LEFT - PHI_L_SPLIT)  - 0.04],
  ];
  for (const [name, phiStart, phiLen] of paneDefs) {
    const geo = new THREE.SphereGeometry(1, 16, 12, phiStart, phiLen, PANE_TH_TOP, PANE_TH_LEN);
    const pane = add(root, geo, m.glass, 0, CABIN_CY, CABIN_CZ);
    pane.scale.set(SX, SY, SZ);
    pane.castShadow = false; pane.receiveShadow = false;
    pane.name = name;
  }
  // Lower nose panel — small pane above the sensor ball
  {
    const phiStart = NOSE_PHI_START + 0.04 / 2;
    const phiLen   = (NOSE_PHI_END - NOSE_PHI_START) - 0.04;
    const thStart  = TH_BOT + 0.05 / 2;
    const thLen    = (PANE_NOSE_BOT - TH_BOT) - 0.05;
    const geo = new THREE.SphereGeometry(1, 12, 8, phiStart, phiLen, thStart, thLen);
    const pane = add(root, geo, m.glass, 0, CABIN_CY, CABIN_CZ);
    pane.scale.set(SX, SY, SZ);
    pane.castShadow = false; pane.receiveShadow = false;
    pane.name = 'glassNosePanel';
  }
  // Frame posts — 3 vertical strips just outside the glass
  for (const [name, phiC] of [
    ['framePostRight',  PHI_R_SPLIT],
    ['framePostCentre', PHI_CENTRE],
    ['framePostLeft',   PHI_L_SPLIT],
  ]) {
    const geo = new THREE.SphereGeometry(1, 6, 12, phiC - FRAME_PHI / 2, FRAME_PHI, TH_TOP, TH_BOT - TH_TOP);
    const post = add(root, geo, m.camo, 0, CABIN_CY, CABIN_CZ);
    post.scale.set(SX * FRAME_SCALE, SY * FRAME_SCALE, SZ * FRAME_SCALE);
    post.name = name;
  }
  // Beltline rail — horizontal strip at the bottom of the glass
  {
    const geo = new THREE.SphereGeometry(1, 32, 6, PHI_BACK_RIGHT, PI, TH_BOT - FRAME_TH / 2, FRAME_TH);
    const rail = add(root, geo, m.camo, 0, CABIN_CY, CABIN_CZ);
    rail.scale.set(SX * FRAME_SCALE, SY * FRAME_SCALE, SZ * FRAME_SCALE);
    rail.name = 'frameBeltlineRail';
  }

  // -------------------------------------------------------------
  //  3. INTERIOR + CREW — two low-poly pilots and a dashboard
  // -------------------------------------------------------------
  const intRear = new THREE.Mesh(cabinSectionGeo(0, PI, TH_TOP, TH_BOT - TH_TOP), m.interior);
  intRear.position.set(0, CABIN_CY, CABIN_CZ);
  intRear.scale.set(SX * 0.97, SY * 0.97, SZ * 0.97);
  intRear.castShadow = false; intRear.receiveShadow = false;
  root.add(intRear);

  const intLower = new THREE.Mesh(cabinSectionGeo(0, PI * 2, TH_BOT, PI - TH_BOT), m.interior);
  intLower.position.set(0, CABIN_CY, CABIN_CZ);
  intLower.scale.set(SX * 0.97, SY * 0.97, SZ * 0.97);
  intLower.castShadow = false; intLower.receiveShadow = false;
  root.add(intLower);

  const crew = new THREE.Group(); crew.name = 'crew'; root.add(crew);
  [-.25, .25].forEach(x => {
    add(crew, new THREE.BoxGeometry(0.32, 0.15, 0.34), m.seat, x, 0.13, CABIN_CZ - 0.15);
    add(crew, new THREE.BoxGeometry(0.32, 0.40, 0.10), m.seat, x, 0.40, CABIN_CZ + 0.02);
    add(crew, new THREE.CylinderGeometry(0.11, 0.13, 0.30, 8), m.seat, x, 0.45, CABIN_CZ - 0.05);
    add(crew, new THREE.SphereGeometry(0.14, 10, 8), m.dark, x, 0.72, CABIN_CZ - 0.02);
  });
  add(crew, new THREE.BoxGeometry(0.90, 0.40, 0.18), m.dark, 0, 0.40, CABIN_NOSE_Z + 0.50);

  // -------------------------------------------------------------
  //  4. REAR FAIRING + BOOM — one LatheGeometry, no joint
  //     Axis runs along Z, tilted +2° toward the tail. Front end starts
  //     0.2 × C inside the cabin and is closed by a buried sphere.
  // -------------------------------------------------------------
  const BOOM_ROOT_Y = CABIN_BOTTOM + 0.70 * H;
  const BOOM_TILT   = 2 * PI / 180;
  const OVERLAP     = 0.2 * C;
  const BOOM_L      = C;
  const LATHE_LEN   = BOOM_L + OVERLAP;

  const R_FRONT = 0.14 * H;
  const R_REAR  = 0.15 * H;
  const R_TIP   = 0.05 * H;
  const t_rear  = OVERLAP / LATHE_LEN;
  const r0      = R_REAR - R_TIP;

  const N_PROFILE = 14;
  const profilePts = [];
  for (let i = 0; i < N_PROFILE; i++) {
    const t = i / (N_PROFILE - 1);
    let r;
    if (t <= t_rear) {
      const u = t / t_rear;
      r = R_FRONT + (R_REAR - R_FRONT) * u;
    } else {
      const s = (t - t_rear) / (1 - t_rear);
      r = r0 * Math.pow(1 - s, 0.8) + R_TIP;
    }
    profilePts.push(new THREE.Vector2(Math.max(r, 0.001), t * LATHE_LEN));
  }

  const latheGeo = new THREE.LatheGeometry(profilePts, 20);
  const rearFairingBoom = new THREE.Mesh(latheGeo, m.camo);
  rearFairingBoom.name = 'rearFairingBoom';
  rearFairingBoom.rotation.x = PI / 2 + BOOM_TILT;
  rearFairingBoom.position.set(0, BOOM_ROOT_Y, CABIN_REAR_Z - OVERLAP);
  rearFairingBoom.castShadow = true;
  rearFairingBoom.receiveShadow = true;
  root.add(rearFairingBoom);

  const frontCap = add(root, new THREE.SphereGeometry(R_FRONT * 0.98, 12, 8), m.camo,
    0, BOOM_ROOT_Y, CABIN_REAR_Z - OVERLAP + 0.02);
  frontCap.name = 'rearFairingCap';

  const tipZ = CABIN_REAR_Z - OVERLAP + LATHE_LEN * Math.cos(BOOM_TILT);
  const tipY = BOOM_ROOT_Y   + LATHE_LEN * Math.sin(BOOM_TILT);

  // -------------------------------------------------------------
  //  5. TAIL ASSEMBLY — slim fin, level stabiliser with upturned tips,
  //     tail rotor (4 blades), and a small tail skid. Leans back 25°.
  // -------------------------------------------------------------
  const FIN_H = C * 0.5;
  const FIN_T = 0.05;
  const FIN_CHORD = 0.35;
  const STAB_SPAN = C * 0.45;
  const STAB_CHORD = 0.26;
  const STAB_T = 0.04;
  const TR_R = C * 0.4 / 2;
  const TILT = 25 * PI / 180;

  const tailAssembly = new THREE.Group();
  tailAssembly.name = 'tailAssembly';
  tailAssembly.position.set(0, tipY, tipZ);
  tailAssembly.rotation.x = TILT;
  root.add(tailAssembly);

  const finCentreY = FIN_H / 2 - FIN_H / 3;
  const finBaseY_local = finCentreY - FIN_H / 2;
  const finTopY_local  = finCentreY + FIN_H / 2;
  const finLocalZ = FIN_CHORD / 2;
  const fin = add(tailAssembly, new THREE.BoxGeometry(FIN_T, FIN_H, FIN_CHORD), m.camo,
    0, finCentreY, finLocalZ);
  fin.name = 'fin';

  const stab = add(tailAssembly, new THREE.BoxGeometry(STAB_SPAN, STAB_T, STAB_CHORD), m.camo,
    0, finTopY_local, finLocalZ);
  stab.name = 'stabiliser';
  [-1, 1].forEach(s => {
    add(tailAssembly, new THREE.BoxGeometry(0.05, 0.12, STAB_CHORD), m.camo,
      s * (STAB_SPAN / 2 - 0.025), finTopY_local + 0.06, finLocalZ);
  });

  const tailRotor = new THREE.Group(); tailRotor.name = 'tailRotor';
  tailRotor.position.set(FIN_T / 2 + 0.05, finCentreY, finLocalZ);
  tailAssembly.add(tailRotor);
  add(tailRotor, new THREE.CylinderGeometry(0.05, 0.05, 0.10, 10), m.dark, 0, 0, 0)
    .rotation.z = PI / 2;
  for (let i = 0; i < 4; i++) {
    const b = new THREE.Group();
    b.rotation.x = (i / 4) * PI * 2;
    tailRotor.add(b);
    add(b, new THREE.BoxGeometry(0.02, TR_R, 0.08), m.dark, 0, -TR_R / 2 - 0.02, 0);
    add(b, new THREE.BoxGeometry(0.02, TR_R, 0.08), m.dark, 0,  TR_R / 2 + 0.02, 0);
  }
  const trBlur = new THREE.Mesh(new THREE.CircleGeometry(TR_R, 32), rotorBlurMaterial());
  trBlur.material.opacity = 0.75;
  trBlur.rotation.y = PI / 2;
  trBlur.position.set(-0.02, 0, 0);
  trBlur.castShadow = false; trBlur.receiveShadow = false;
  tailRotor.add(trBlur);

  const skid = add(tailAssembly, new THREE.CylinderGeometry(0.022, 0.022, 0.55, 8), m.metal,
    0, finBaseY_local + 0.10, finLocalZ - 0.10);
  skid.rotation.x = 0.55;

  // -------------------------------------------------------------
  //  6. MAIN ROTOR — ROTOR_R = 1.1 × C
  //     Short slim mast on the cabin top, hub at the top of the mast,
  //     tapered blades attached to the hub (roots overlap the hub radius),
  //     and a blur disc that rides with the rotor.
  // -------------------------------------------------------------
  const ROTOR_R = C * 1.1;
  const MAST_H = 0.15;
  const MAST_R_TOP = 0.032, MAST_R_BOT = 0.038;
  const MAST_BASE_Y = CABIN_TOP - 0.02;
  const MAST_TOP_Y  = MAST_BASE_Y + MAST_H;
  const MAST_Z = CABIN_CZ;
  add(root, new THREE.CylinderGeometry(MAST_R_TOP, MAST_R_BOT, MAST_H, 12), m.metal,
    0, MAST_BASE_Y + MAST_H / 2, MAST_Z).name = 'mast';

  const HUB_R = 0.14, HUB_H = 0.10;
  const rotor = new THREE.Group(); rotor.name = 'rotor';
  rotor.position.set(0, MAST_TOP_Y + HUB_H / 2 - 0.01, MAST_Z);
  root.add(rotor);
  add(rotor, new THREE.CylinderGeometry(HUB_R, HUB_R, HUB_H, 14), m.dark, 0, 0, 0);
  add(rotor, new THREE.CylinderGeometry(0.05, 0.05, 0.14, 8), m.metal, 0, 0.06, 0);

  const BLADE_ROOT_W = 0.24, BLADE_TIP_W = 0.12, BLADE_THICK = 0.025;
  const BLADE_ROOT_R = 0.10;
  const BLADE_LEN = ROTOR_R - BLADE_ROOT_R;
  const bladeGeo = taperedBladeGeo(BLADE_ROOT_W, BLADE_TIP_W, BLADE_LEN, BLADE_THICK);
  for (let i = 0; i < 4; i++) {
    const b = new THREE.Group();
    b.rotation.y = (i / 4) * PI * 2;
    rotor.add(b);
    const blade = new THREE.Mesh(bladeGeo, m.dark);
    blade.position.set(0, 0, -BLADE_ROOT_R);
    blade.rotation.z = 0.06;
    blade.castShadow = true;
    b.add(blade);
  }
  const mainBlur = new THREE.Mesh(new THREE.CircleGeometry(ROTOR_R, 48), rotorBlurMaterial());
  mainBlur.material.opacity = 0.85;
  mainBlur.rotation.x = -PI / 2;
  mainBlur.position.set(0, -0.02, 0);
  mainBlur.castShadow = false; mainBlur.receiveShadow = false;
  rotor.add(mainBlur);

  // -------------------------------------------------------------
  //  7. WEAPON SUPPORTS — one per side, mirrored exactly
  //     Arm: thin, tapered, swept-back; reach 0.22 × C beyond the cabin surface.
  //     Pod: 0.3 × C long, hangs under the outer end of the arm, points -Z.
  // -------------------------------------------------------------
  const ARM_Y       = CABIN_BOTTOM + 0.4 * H;    // 0.6405
  const ARM_LEN     = 0.22 * C;                  // 0.638
  const ARM_TH      = 0.025 * C;                 // 0.0725
  const ARM_ROOT_W  = 0.09 * C;                  // 0.261
  const ARM_TIP_W   = ARM_ROOT_W * 0.65;         // ≈ 0.170
  const SWEEP       = Math.tan(15 * PI / 180) * ARM_LEN;
  const ARM_Z       = CABIN_CZ;
  const ARM_X_INNER = 0.58;
  const ARM_X_OUTER = ARM_X_INNER + ARM_LEN;

  const ARM_GEO = sweptArmGeo(ARM_LEN, ARM_ROOT_W, ARM_TIP_W, ARM_TH, SWEEP);

  const POD_LEN   = 0.3 * C;
  const POD_R     = 0.04 * C;
  const POD_CAP_L = 0.06;
  const POD_CAP_R = 0.052;
  const POD_X     = ARM_X_OUTER - 0.08;
  const POD_Y     = ARM_Y - ARM_TH / 2 - POD_R;
  const POD_Z     = ARM_Z;

  [-1, 1].forEach(s => {
    // Arm — mirrored by flipping rotation.y for the left side, so both arms
    // share one geometry instance and are exact mirrors of each other.
    const arm = new THREE.Mesh(ARM_GEO, m.camo);
    arm.position.set(s * ARM_X_INNER, ARM_Y, ARM_Z + SWEEP / 2);
    arm.rotation.y = (s < 0) ? PI : 0;
    arm.castShadow = true;
    arm.receiveShadow = true;
    arm.name = s < 0 ? 'weaponArmL' : 'weaponArmR';
    root.add(arm);

    // Diagonal brace — from the arm underside back to the cabin's lower side
    const braceTopX = s * (ARM_X_INNER + ARM_LEN * 0.55);
    const braceTopY = ARM_Y - ARM_TH / 2;
    const braceBotX = s * (ARM_X_INNER - 0.02);
    const braceBotY = CABIN_BOTTOM + 0.15;
    const braceZ   = ARM_Z;
    const bdx = braceBotX - braceTopX;
    const bdy = braceBotY - braceTopY;
    const blen = Math.hypot(bdx, bdy);
    const brace = new THREE.Mesh(new THREE.CylinderGeometry(0.030, 0.030, blen, 8), m.camo);
    brace.position.set((braceTopX + braceBotX) / 2, (braceTopY + braceBotY) / 2, braceZ);
    brace.rotation.z = -Math.atan2(bdx, bdy);
    brace.castShadow = true;
    brace.name = s < 0 ? 'weaponBraceL' : 'weaponBraceR';
    root.add(brace);

    // Gun pod under the outer end of the arm
    const pod = add(root, new THREE.CylinderGeometry(POD_R, POD_R, POD_LEN, 14), m.rocket,
      s * POD_X, POD_Y, POD_Z);
    pod.rotation.x = PI / 2;
    pod.name = s < 0 ? 'weaponPodL' : 'weaponPodR';

    add(root, new THREE.CylinderGeometry(POD_CAP_R, POD_CAP_R, POD_CAP_L, 14), m.dark,
      s * POD_X, POD_Y, POD_Z - POD_LEN / 2 - POD_CAP_L / 2 + 0.005).rotation.x = PI / 2;
    add(root, new THREE.CylinderGeometry(POD_R * 0.9, POD_R, 0.04, 14), m.dark,
      s * POD_X, POD_Y, POD_Z + POD_LEN / 2 + 0.02).rotation.x = PI / 2;
  });

  // -------------------------------------------------------------
  //  8. CHIN SENSOR + small details
  // -------------------------------------------------------------
  const sensorZ = CABIN_NOSE_Z + 0.40;
  const sensor = new THREE.Group(); sensor.name = 'sensor';
  sensor.position.set(0, 0.32, sensorZ);
  root.add(sensor);
  add(sensor, new THREE.CylinderGeometry(0.13, 0.15, 0.12, 12), m.dark, 0, -0.04, 0);
  const sball = add(sensor, new THREE.SphereGeometry(0.14, 12, 10), m.metal, 0, -0.16, 0);
  sball.scale.set(1, 0.9, 1.1);
  const lens = add(sensor, new THREE.SphereGeometry(0.055, 10, 8), m.screen, 0, -0.16, -0.12);
  lens.scale.set(1, 1, 0.4);

  add(root, new THREE.BoxGeometry(0.05, 0.20, 0.04), m.dark,
    0, CABIN_TOP - 0.05, CABIN_CZ + 0.10);
  add(root, new THREE.BoxGeometry(0.02, 0.50, 0.02), m.metal,
    0.30, CABIN_TOP - 0.10, CABIN_CZ + 0.40);
  add(root, new THREE.CylinderGeometry(0.075, 0.085, 0.28, 10), m.dark,
    0, BOOM_ROOT_Y + 0.22, CABIN_REAR_Z + 0.10).rotation.x = 0.45;

  // -------------------------------------------------------------
  //  9. SKIDS
  // -------------------------------------------------------------
  const skids = new THREE.Group(); skids.name = 'skids'; root.add(skids);
  const SKID_TRACK = 1.55, SKID_L = 3.20, SKID_Y = 0.10, SKID_Z = CABIN_CZ + 0.05;
  [-1, 1].forEach(s => {
    const sx = s * SKID_TRACK / 2;
    const tube = add(skids, new THREE.CylinderGeometry(0.035, 0.035, SKID_L, 10), m.metal,
      sx, SKID_Y, SKID_Z);
    tube.rotation.x = PI / 2;
    add(skids, new THREE.SphereGeometry(0.045, 8, 6), m.metal, sx, SKID_Y, SKID_Z - SKID_L / 2);
    add(skids, new THREE.SphereGeometry(0.045, 8, 6), m.metal, sx, SKID_Y, SKID_Z + SKID_L / 2);
    [SKID_Z - 0.70, SKID_Z + 0.70].forEach(strutZ => {
      const topX = s * (CABIN_W / 2 * 0.85);
      const topY = 0.30, botX = sx, botY = SKID_Y;
      const dx = botX - topX, dy = botY - topY;
      const len = Math.hypot(dx, dy);
      const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, len, 8), m.metal);
      strut.position.set((topX + botX) / 2, (topY + botY) / 2, strutZ);
      strut.rotation.z = -Math.atan2(dx, dy);
      strut.castShadow = true;
      skids.add(strut);
    });
  });
  [SKID_Z - 0.70, SKID_Z + 0.70].forEach(crossZ => {
    add(skids, new THREE.CylinderGeometry(0.028, 0.028, SKID_TRACK, 8), m.metal,
      0, SKID_Y + 0.01, crossZ).rotation.z = PI / 2;
  });

  // Apply camo UVs
  projectCamo(root, m.camo, CAMO_TILE);
  root.scale.setScalar(1.5);

  return root;
}