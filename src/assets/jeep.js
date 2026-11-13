// Player jeep — with a purpose-built painted canvas texture (deep olive drab, weathered, dusty),
// rather than the tank's generic panel painter.
//
// Contract: ~4.1 m long, ~2.5 m wide over the wheels, origin on the ground at the centre, nose toward -Z.
// Named parts:
//   wheelFL / wheelFR / wheelRL / wheelRR  roll on X
//   gun                                   the mounted machine gun (recoil kicks on +Z); child 'muzzle' marks the barrel tip
// Crew: a driver at the wheel (front left) and a gunner standing behind the gun, mounted on `gun` so
// he turns with it.
import * as THREE from 'three';
import { PI, add, mat, cached, palette, tireMaterial, decal, roundedRect } from './common.js';

const crewMats = () => cached('crewMats', () => ({
  uniform: mat(0x5a6a3a, .9, 0, { envMapIntensity: .4 }),
  webbing: mat(0x3e4a28, .9, 0, { envMapIntensity: .4 }),
  helmet: mat(0x3c4a2a, .6, .2, { envMapIntensity: .4 }),
  skin: mat(0xc89a72, .8, 0, { envMapIntensity: .4 }),
  boot: mat(0x2a2620, .8, 0),
}));
const limb = (rTop, rBottom, len) => new THREE.CylinderGeometry(rTop, rBottom, len, 10).translate(0, -len / 2, 0);

// ---------------------------------------------------------------------
//  Jeep paint texture — deep olive drab with subtle weathering
// ---------------------------------------------------------------------
//  A canvas that produces a soft, believable military-vehicle surface at jeep scale:
//  flat base coat, subtle mottling, a couple of horizontal panel seams, faint dust
//  and grime streaks, and slight edge scuffing. It reads as painted metal rather
//  than bare sheet. The bump map mirrors the same canvas so the surface has a
//  gentle tooth without looking like brushed steel.
function jeepPaint(hex, roughness = .5, metalness = .1) {
  const key = `jeepPaint:${hex}:${roughness}:${metalness}`;
  return cached(key, () => {
    const S = 512;
    const c = document.createElement('canvas'); c.width = c.height = S;
    const x = c.getContext('2d');

    // Deterministic RNG so the pattern is stable per colour.
    let seed = 0;
    const h = hex.replace('#', '');
    for (let i = 0; i < h.length; i++) seed = (seed * 31 + h.charCodeAt(i)) | 0;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

    // ---- 1. Base coat ----
    x.fillStyle = hex;
    x.fillRect(0, 0, S, S);

    // ---- 2. Faded / bleached patches — subtle, fewer than before ----
    for (let i = 0; i < 16; i++) {
      const cx = rnd() * S, cy = rnd() * S;
      const rad = 40 + rnd() * 90;
      const g = x.createRadialGradient(cx, cy, 0, cx, cy, rad);
      const lighter = rnd() > .5;
      // Weaker highlights, slightly stronger shadows — keeps the surface reading darker overall.
      g.addColorStop(0, lighter ? 'rgba(200,190,150,.06)' : 'rgba(15,12,5,.12)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = g;
      x.beginPath(); x.arc(cx, cy, rad, 0, 7); x.fill();
    }

    // ---- 3. A couple of faint horizontal panel lines ----
    x.strokeStyle = 'rgba(15,12,5,.30)';
    x.lineWidth = 2;
    [0.32, 0.68].forEach(fy => {
      const y = fy * S;
      x.beginPath();
      for (let i = 0; i <= S; i += 16) {
        const yy = y + (rnd() - .5) * 1.5;
        i === 0 ? x.moveTo(i, yy) : x.lineTo(i, yy);
      }
      x.stroke();
    });

    // ---- 4. Sparse rivet heads along the seams ----
    x.fillStyle = 'rgba(15,12,5,.38)';
    for (let i = 20; i < S; i += 40) {
      [0.32, 0.68].forEach(fy => {
        const y = fy * S + (rnd() - .5) * 1.5;
        x.beginPath(); x.arc(i, y, 1.8, 0, 7); x.fill();
      });
    }

    // ---- 5. Faint dust and grime streaks ----
    for (let i = 0; i < 45; i++) {
      const cx = rnd() * S;
      const cy = rnd() * S * .4;
      const len = 40 + rnd() * 200;
      const w = 2 + rnd() * 6;
      const g = x.createLinearGradient(0, cy, 0, cy + len);
      const dark = rnd() > .5;
      g.addColorStop(0, dark ? 'rgba(15,12,5,.16)' : 'rgba(180,160,120,.06)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = g;
      x.fillRect(cx, cy, w, len);
    }

    // ---- 6. Fine dust speckle — weaker than before ----
    for (let i = 0; i < 4000; i++) {
      x.fillStyle = rnd() > .5 ? 'rgba(180,160,120,.035)' : 'rgba(15,12,5,.045)';
      x.fillRect(rnd() * S, rnd() * S, 1, 1);
    }

    // ---- 7. Small edge scuffs ----
    for (let i = 0; i < 24; i++) {
      const cx = rnd() * S, cy = rnd() * S;
      const w = 4 + rnd() * 12, h = 2 + rnd() * 5;
      x.fillStyle = 'rgba(10,8,4,.22)';
      x.fillRect(cx, cy, w, h);
      x.fillStyle = 'rgba(180,170,140,.06)';
      x.fillRect(cx + 1, cy + 1, w - 2, h - 2);
    }

    const map = new THREE.CanvasTexture(c);
    map.wrapS = map.wrapT = THREE.RepeatWrapping;
    map.repeat.set(1, 1);
    map.anisotropy = 8;

    const bump = map.clone();
    bump.needsUpdate = true;

    return new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map,
      bumpMap: bump,
      bumpScale: .15,
      roughness,
      metalness,
    });
  });
}

function upperBody(parent, m, x, y, z, lean) {
  const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.x = lean; parent.add(g);
  const torso = add(g, new THREE.CylinderGeometry(.2, .16, .52, 12), m.uniform, 0, .27, 0); torso.scale.z = .72;
  const belt = add(g, new THREE.CylinderGeometry(.17, .17, .06, 12), m.webbing, 0, .02, 0); belt.scale.z = .74;
  [-1, 1].forEach(s => { add(g, new THREE.BoxGeometry(.045, .52, .02), m.webbing, 0, .29, -.15).rotation.z = s * .5; });
  add(g, new THREE.CylinderGeometry(.06, .065, .08, 10), m.skin, 0, .57, 0);
  add(g, new THREE.SphereGeometry(.11, 14, 10), m.skin, 0, .68, 0);
  const hel = add(g, new THREE.SphereGeometry(.15, 16, 10, 0, PI * 2, 0, PI / 2), m.helmet, 0, .69, .005); hel.scale.y = .8;
  add(g, new THREE.CylinderGeometry(.17, .17, .02, 18), m.helmet, 0, .69, .005);
  return g;
}

function arm(parent, m, x, y, z, lift, tilt, bend) {
  const sh = new THREE.Group(); sh.position.set(x, y, z); sh.rotation.set(lift, 0, tilt); parent.add(sh);
  add(sh, new THREE.SphereGeometry(.07, 10, 8), m.uniform);
  add(sh, limb(.062, .055, .28), m.uniform);
  const el = new THREE.Group(); el.position.y = -.28; el.rotation.x = bend; sh.add(el);
  add(el, limb(.052, .045, .26), m.uniform);
  add(el, new THREE.SphereGeometry(.048, 10, 8), m.skin, 0, -.28, 0);
}

const DRIVER_SEAT_Y = 1.32;
function driver(root, x) {
  const m = crewMats(), g = new THREE.Group(); root.add(g);
  [-.1, .1].forEach(dx => {
    add(g, new THREE.CylinderGeometry(.08, .072, .46, 10).rotateX(PI / 2), m.uniform, x + dx, DRIVER_SEAT_Y + .02, -.1);
    add(g, limb(.068, .058, .30), m.uniform, x + dx, DRIVER_SEAT_Y + .02, -.33);
    add(g, new THREE.BoxGeometry(.14, .1, .24), m.boot, x + dx, DRIVER_SEAT_Y - .25, -.38);
  });
  const body = upperBody(g, m, x, DRIVER_SEAT_Y + .02, .14, .12);
  arm(body, m, -.22, .48, 0, 1.05, .15, .55);
  arm(body, m, .22, .48, 0, 1.05, -.15, .55);
  scaleAbout(g, new THREE.Vector3(x, DRIVER_SEAT_Y, .02));
}

const CREW_SCALE = 1.25;
function scaleAbout(g, at) { g.scale.setScalar(CREW_SCALE); g.position.copy(at).multiplyScalar(1 - CREW_SCALE); }

function gunner(gun) {
  const m = crewMats(), floor = -1.42, z = .55, g = new THREE.Group(); gun.add(g);
  [-.11, .11].forEach(dx => {
    add(g, new THREE.BoxGeometry(.14, .1, .25), m.boot, dx, floor + .05, z - .04);
    add(g, limb(.085, .06, .78), m.uniform, dx, floor + .86, z);
  });
  const body = upperBody(g, m, 0, floor + .86, z, -.15);
  arm(body, m, -.23, .48, 0, 1.15, .25, .45);
  arm(body, m, .23, .48, 0, 1.15, -.25, .45);
  scaleAbout(g, new THREE.Vector3(0, floor, z));
}

// A curved mudguard built for a wheel that spins about X.
function mudguardGeo(rInner, rOuter, sweepDeg, width) {
  const half = (sweepDeg * PI / 180) / 2;
  const N = 20;
  const shape = new THREE.Shape();
  for (let i = 0; i <= N; i++) {
    const a = -half + (i / N) * (2 * half);
    const x = Math.sin(a) * rOuter, y = Math.cos(a) * rOuter;
    if (i === 0) shape.moveTo(x, y); else shape.lineTo(x, y);
  }
  for (let i = N; i >= 0; i--) {
    const a = -half + (i / N) * (2 * half);
    shape.lineTo(Math.sin(a) * rInner, Math.cos(a) * rInner);
  }
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth: width, bevelEnabled: false, curveSegments: 4 });
  geo.translate(0, 0, -width / 2);
  geo.rotateY(PI / 2);
  return geo;
}

// ---- Body colours: deeper olive drab, no more "baby green" ----
export function buildJeep({ color = '#4d5824', trim = '#2b3514' } = {}) {
  const { black: BLK, steel: STL, yellow: YEL, glass: GLS } = palette();
  const BODY = jeepPaint(color, .62, .12);
  const TRIM = jeepPaint(trim, .70, .10);
  const TIRE = tireMaterial();

  const root = new THREE.Group(); root.name = 'jeep';
  const mesh = (g, m, x = 0, y = 0, z = 0, p = root) => add(p, g, m, x, y, z);

  // ---- Body ----
  const HULL_W = 1.72, HULL_LEN = 3.95, HULL_FLOOR_Y = 0.50, HULL_TOP_Y = 1.20;

  mesh(new THREE.BoxGeometry(HULL_W, .05, HULL_LEN), BODY, 0, HULL_FLOOR_Y, 0);
  [-1, 1].forEach(s => {
    mesh(new THREE.BoxGeometry(.06, HULL_TOP_Y - HULL_FLOOR_Y, HULL_LEN), BODY,
      s * (HULL_W / 2 - .03), (HULL_TOP_Y + HULL_FLOOR_Y) / 2, 0);
  });
  mesh(new THREE.BoxGeometry(HULL_W, HULL_TOP_Y - HULL_FLOOR_Y, .08), BODY,
    0, (HULL_TOP_Y + HULL_FLOOR_Y) / 2, -HULL_LEN / 2 + .04);
  mesh(new THREE.BoxGeometry(HULL_W, HULL_TOP_Y - HULL_FLOOR_Y, .08), BODY,
    0, (HULL_TOP_Y + HULL_FLOOR_Y) / 2, HULL_LEN / 2 - .04);

  const hood = mesh(new THREE.BoxGeometry(HULL_W, .05, 1.35), BODY, 0, 1.14, -1.35);
  hood.rotation.x = -.08;
  mesh(new THREE.BoxGeometry(HULL_W, .05, .30), BODY, 0, 1.20, -0.80);
  mesh(new THREE.BoxGeometry(HULL_W, .05, .45), BODY, 0, 1.20, 1.85);
  [-1, 1].forEach(s => {
    mesh(new THREE.BoxGeometry(.06, .35, .10), BODY, s * (HULL_W / 2 - .03), 1.05, -0.90);
  });

  // ---- Windshield ----
  const WSH_LEAN = 0.18;
  const WSH_H = 0.62, WSH_W = 1.62;
  const FRAME_BAR = 0.06, FRAME_DEPTH = 0.05, GLASS_INSET = 0.005;
  const WSH_HINGE_Y = 1.22, WSH_HINGE_Z = -0.82;

  const windshield = new THREE.Group();
  windshield.name = 'windshield';
  windshield.position.set(0, WSH_HINGE_Y, WSH_HINGE_Z);
  windshield.rotation.x = WSH_LEAN;
  root.add(windshield);

  const halfW = WSH_W / 2, halfH = WSH_H / 2;

  const barBottom = new THREE.Mesh(new THREE.BoxGeometry(WSH_W, FRAME_BAR, FRAME_DEPTH), BLK);
  barBottom.position.set(0, FRAME_BAR / 2, 0);
  barBottom.castShadow = barBottom.receiveShadow = true;
  windshield.add(barBottom);

  const barTop = new THREE.Mesh(new THREE.BoxGeometry(WSH_W, FRAME_BAR, FRAME_DEPTH), BLK);
  barTop.position.set(0, WSH_H - FRAME_BAR / 2, 0);
  barTop.castShadow = barTop.receiveShadow = true;
  windshield.add(barTop);

  const barLeft = new THREE.Mesh(new THREE.BoxGeometry(FRAME_BAR, WSH_H - FRAME_BAR * 2, FRAME_DEPTH), BLK);
  barLeft.position.set(-halfW + FRAME_BAR / 2, halfH, 0);
  barLeft.castShadow = barLeft.receiveShadow = true;
  windshield.add(barLeft);

  const barRight = new THREE.Mesh(new THREE.BoxGeometry(FRAME_BAR, WSH_H - FRAME_BAR * 2, FRAME_DEPTH), BLK);
  barRight.position.set(halfW - FRAME_BAR / 2, halfH, 0);
  barRight.castShadow = barRight.receiveShadow = true;
  windshield.add(barRight);

  const divider = new THREE.Mesh(new THREE.BoxGeometry(FRAME_BAR * .6, WSH_H - FRAME_BAR * 2, FRAME_DEPTH), BLK);
  divider.position.set(0, halfH, 0);
  divider.castShadow = divider.receiveShadow = true;
  windshield.add(divider);

  const glassW = halfW - FRAME_BAR;
  const glassH = WSH_H - FRAME_BAR * 2;
  const glassT = 0.015;
  [-1, 1].forEach(side => {
    const cx = side * (FRAME_BAR / 2 + glassW / 2 + FRAME_BAR * .15);
    [-1, 1].forEach(face => {
      const g = new THREE.Mesh(new THREE.BoxGeometry(glassW, glassH, glassT), GLS);
      g.position.set(cx, halfH, face * (FRAME_DEPTH / 2 + GLASS_INSET + glassT / 2));
      g.castShadow = false; g.receiveShadow = false;
      windshield.add(g);
    });
  });

  // grille + headlights
  for (let i = -3; i <= 3; i++) mesh(new THREE.BoxGeometry(.08, .45, .05), BLK, i * .16, .8, -2.02);
  [-.62, .62].forEach(x => {
    mesh(new THREE.CylinderGeometry(.13, .13, .08, 16), YEL, x, .95, -2.02).rotation.x = PI / 2;
  });

  // ---- Wheels + mudguards ----
  const WHEEL_R = .42;
  const WHEEL_W = .36;
  const WHEEL_X = 1.05;
  const WHEEL_Y = .42;
  const FENDER_GAP = .03;
  const FENDER_THICK = .05;
  const FENDER_SWEEP = 200;
  const FENDER_WIDTH = WHEEL_W + .12;

  const fenderGeo = mudguardGeo(
    WHEEL_R + FENDER_GAP,
    WHEEL_R + FENDER_GAP + FENDER_THICK,
    FENDER_SWEEP,
    FENDER_WIDTH
  );

  [['FL', -1, -1.35], ['FR', 1, -1.35], ['RL', -1, 1.35], ['RR', 1, 1.35]].forEach(([n, s, z]) => {
    const w = new THREE.Group(); w.name = 'wheel' + n; w.position.set(s * WHEEL_X, WHEEL_Y, z); root.add(w);
    mesh(new THREE.CylinderGeometry(WHEEL_R, WHEEL_R, WHEEL_W, 28), TIRE, 0, 0, 0, w).rotation.z = PI / 2;
    mesh(new THREE.CylinderGeometry(.2, .2, WHEEL_W + .02, 16), STL, 0, 0, 0, w).rotation.z = PI / 2;

    const fender = new THREE.Mesh(fenderGeo, TRIM);
    fender.name = 'fender' + n;
    fender.position.set(s * WHEEL_X, WHEEL_Y, z);
    fender.castShadow = fender.receiveShadow = true;
    root.add(fender);
  });

  // spare tyre
  mesh(new THREE.CylinderGeometry(.36, .36, .22, 24), TIRE, 0, .92, 2.15).rotation.x = PI / 2;

  // tub floor, seats, rear bench
  mesh(new THREE.BoxGeometry(1.5, .04, 2.1), TRIM, 0, 1.25, .75);
  [-.42, .42].forEach(x => {
    mesh(new THREE.BoxGeometry(.6, .18, .55), BLK, x, 1.36, .05);
    mesh(new THREE.BoxGeometry(.6, .55, .12), BLK, x, 1.6, .38);
  });
  mesh(new THREE.BoxGeometry(1.5, .18, .5), BLK, 0, 1.36, 1.5);

  // gun
  mesh(new THREE.CylinderGeometry(.06, .08, .7, 12), STL, 0, 1.6, 1.0);
  const gun = new THREE.Group(); gun.name = 'gun'; gun.position.set(0, 1.98, 1.0); root.add(gun);
  mesh(new THREE.BoxGeometry(.18, .2, .7), BLK, 0, 0, -.1, gun);
  mesh(new THREE.BoxGeometry(.16, .2, .22), TRIM, .17, -.02, -.05, gun);
  mesh(new THREE.CylinderGeometry(.04, .05, .9, 10), BLK, 0, .02, -.85, gun).rotation.x = PI / 2;
  const muzzle = new THREE.Object3D(); muzzle.name = 'muzzle'; muzzle.position.set(0, .02, -1.3); gun.add(muzzle);
  mesh(new THREE.BoxGeometry(.05, .14, .06), BLK, -.08, -.08, .22, gun);
  mesh(new THREE.BoxGeometry(.05, .14, .06), BLK, .08, -.08, .22, gun);

  // steering wheel + column
  const STEER_X = -.42;
  const STEER_WHEEL_Y = 1.50, STEER_WHEEL_Z = -.32;
  const DASH_Y = 1.30, DASH_Z = -.68;
  const SWHEEL_R = .17;

  const colTop = new THREE.Vector3(STEER_X, STEER_WHEEL_Y, STEER_WHEEL_Z);
  const colBot = new THREE.Vector3(STEER_X, DASH_Y, DASH_Z);
  const colDir = new THREE.Vector3().subVectors(colBot, colTop);
  const colLen = colDir.length();
  const column = new THREE.Mesh(new THREE.CylinderGeometry(.025, .025, colLen, 8), BLK);
  column.position.copy(colTop).addScaledVector(colDir, 0.5);
  column.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), colDir.clone().normalize());
  column.castShadow = column.receiveShadow = true;
  root.add(column);

  const wheelGroup = new THREE.Group();
  wheelGroup.name = 'steering';
  wheelGroup.position.set(STEER_X, STEER_WHEEL_Y, STEER_WHEEL_Z);
  wheelGroup.rotation.x = -0.55;
  root.add(wheelGroup);

  const wheelMesh = new THREE.Mesh(new THREE.TorusGeometry(SWHEEL_R, .022, 8, 24), BLK);
  wheelMesh.castShadow = wheelMesh.receiveShadow = true;
  wheelGroup.add(wheelMesh);
  for (let i = 0; i < 3; i++) {
    const spoke = new THREE.Mesh(new THREE.BoxGeometry(SWHEEL_R * 2 - .02, .022, .022), BLK);
    spoke.rotation.z = i * PI / 3;
    wheelGroup.add(spoke);
  }
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(.03, .03, .06, 10), BLK);
  hub.rotation.x = PI / 2;
  wheelGroup.add(hub);

  driver(root, -.42);
  gunner(gun);

  const star = decal(.9, .9, (x, w, h) => {
    x.strokeStyle = x.fillStyle = 'rgba(240,240,225,.92)'; x.lineWidth = 14;
    x.beginPath(); x.arc(w / 2, h / 2, h * .44, 0, 7); x.stroke(); x.beginPath();
    for (let i = 0; i < 10; i++) { const a = -PI / 2 + i * PI / 5, r = i % 2 ? h * .16 : h * .4; x.lineTo(w / 2 + Math.cos(a) * r, h / 2 + Math.sin(a) * r); }
    x.fill();
  }, 256, 256);
  star.position.set(0, 1.22, -1.55); star.rotation.x = -PI / 2; root.add(star);

  return root;
}