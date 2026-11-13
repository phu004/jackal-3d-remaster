// Enemy tanks. buildTank: the main battle tank (the stage 1 boss fight): a long, low hull with armoured side skirts over seven
// road wheels, a wide angular turret with a long stowage rack round the back, a long gun with a
// bore evacuator and thermal sleeve, and roof machine guns, in tan / green / brown camouflage.
// Kept to the game's compressed scale: ~4.7 m long over the hull, 3.1 m wide.
// Origin on the ground at the hull centre, the front faces -Z. Named parts: `turret` (turns,
// carries `gun`, the barrel, which slides back in recoil and carries `muzzle`), `tracks` (the track treads; their material's texture scrolls as it drives,
// one material per tank).
// buildLightTank: the smaller light tank that rolls in between the gunboats: ~3.7 m long, 2.5 m
// wide, five big road wheels and return rollers in the open (no skirts), mudguards with stowage
// boxes, a small rounded turret with a short gun and muzzle brake, in olive / dark green camouflage.
// buildMediumTank: the medium tank, between the two in size: ~4.35 m long, 1.85 m between the tracks, six rubber-tyred road
// wheels with return rollers under green fenders, in the Russian style: a low, smooth cast dome turret with a long gun and
// bulbous fume extractor, searchlight, commander's AA machine gun, two fuel drums and a snorkel on the fenders and an
// unditching log on the back deck, in dark gunmetal grey like the sprite. Same named parts as the others: `turret`, `gun`, `muzzle`, `tracks`.
import * as THREE from 'three';
import { add, mat, cached, roundedRect, PI, poolPlain } from './common.js';
import { mergeStatic } from '../game/optimize.js';

const pmat = (c, r, m, o) => mat(c, r, m, Object.assign({ envMapIntensity: .35 }, o));

// Track belt texture: dark links with raised grousers, along v.
function trackTexture() {
  const c = document.createElement('canvas'); c.width = 32; c.height = 64; const x = c.getContext('2d');
  x.fillStyle = '#26231f'; x.fillRect(0, 0, 32, 64);
  for (let i = 0; i < 64; i += 16) {
    x.fillStyle = '#4a4540'; x.fillRect(0, i, 32, 6);  // grouser
    x.fillStyle = '#121110'; x.fillRect(0, i + 6, 32, 2);
    x.fillStyle = '#3a3631'; x.fillRect(13, i + 9, 6, 5); // guide horn
  }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
  return t;
}

// Three-colour camouflage: brownish sand base with large soft-edged olive and brown patches and a few dark
// streaks, seamless (blobs wrap round the edges). One tile covers CAMO_TILE metres.
const CAMO_TILE = 3.2;
const MBT_PALETTE = { base: '#a8835a', a: '#5f5c34', b: '#74452a', dark: '#2f2e26' };   // sand, olive, brown, black
const LIGHT_PALETTE = { base: '#6c6a40', a: '#3e4628', b: '#5c4a30', dark: '#262620' }; // olive drab, dark green, brown, black
function camoTexture(damaged = false, pal = MBT_PALETTE) {
  const S = 256, c = document.createElement('canvas'); c.width = c.height = S; const x = c.getContext('2d');
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  x.fillStyle = pal.base; x.fillRect(0, 0, S, S);
  const blob = (cx, cy, rad, col) => {
    const n = 9, pts = Array.from({ length: n }, (_, i) => { const a = i / n * PI * 2, rr = rad * (.6 + rnd() * .6); return [Math.cos(a) * rr, Math.sin(a) * rr * (.5 + rnd() * .5)]; });
    x.fillStyle = col;
    for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) { // wrap so the tile is seamless
      x.beginPath();
      pts.forEach(([px, py], i) => { const [qx, qy] = pts[(i + 1) % n]; const mx = (px + qx) / 2, my = (py + qy) / 2;
        i ? x.quadraticCurveTo(cx + px + ox, cy + py + oy, cx + mx + ox, cy + my + oy) : x.moveTo(cx + mx + ox, cy + my + oy); });
      x.closePath(); x.fill();
    }
  };
  for (let i = 0; i < 7; i++) blob(rnd() * S, rnd() * S, 30 + rnd() * 30, pal.a);
  for (let i = 0; i < 6; i++) blob(rnd() * S, rnd() * S, 24 + rnd() * 26, pal.b);
  for (let i = 0; i < 3; i++) blob(rnd() * S, rnd() * S, 10 + rnd() * 10, pal.dark);
  for (let i = 0; i < 2500; i++) { // dust and wear
    x.fillStyle = rnd() > .5 ? 'rgba(255,240,210,.06)' : 'rgba(40,30,20,.07)';
    x.fillRect(rnd() * S, rnd() * S, 2, 2);
  }
  if (damaged) { // battle damage: soot and scorch marks, scraped-off paint, rust and streaks of oil
    let s2 = 99; const rd = () => (s2 = (s2 * 16807) % 2147483647) / 2147483647;
    const soot = (cx, cy, rad, a) => {
      for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) {
        const g = x.createRadialGradient(cx + ox, cy + oy, 0, cx + ox, cy + oy, rad);
        g.addColorStop(0, `rgba(12,10,8,${a})`); g.addColorStop(.6, `rgba(20,16,12,${a * .6})`); g.addColorStop(1, 'rgba(20,16,12,0)');
        x.fillStyle = g; x.fillRect(cx + ox - rad, cy + oy - rad, rad * 2, rad * 2);
      }
    };
    x.fillStyle = 'rgba(30,24,18,.1)'; x.fillRect(0, 0, S, S); // lightly grimed over
    for (let i = 0; i < 6; i++) soot(rd() * S, rd() * S, 20 + rd() * 35, .45 + rd() * .2);
    for (let i = 0; i < 40; i++) { // scrapes down to bare metal, with rust round them
      const px = rd() * S, py = rd() * S, w = 4 + rd() * 16, h = 2 + rd() * 5;
      x.fillStyle = 'rgba(120,58,24,.7)'; x.fillRect(px - 2, py - 2, w + 4, h + 4);
      x.fillStyle = 'rgba(150,150,145,.85)'; x.fillRect(px, py, w, h);
    }
    for (let i = 0; i < 14; i++) { // oil / rust streaks running down
      const px = rd() * S, py = rd() * S, len = 20 + rd() * 60;
      const g = x.createLinearGradient(0, py, 0, py + len); g.addColorStop(0, 'rgba(40,22,10,.6)'); g.addColorStop(1, 'rgba(40,22,10,0)');
      x.fillStyle = g; x.fillRect(px, py, 2 + rd() * 4, len);
    }
  }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
  return t;
}

// Give every camo-painted mesh box-projected UVs in the tank's own space, so the pattern has the
// same scale on every panel and flows across neighbouring parts.
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

// Lay a top-view outline flat and extrude it upward from y0 (shape +y becomes -Z, the front).
function slab(parent, shape, depth, material, y0, bevel = .05) {
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2 });
  const m = add(parent, g, material, 0, y0 + bevel, 0);
  m.rotation.x = -PI / 2;
  return m;
}
const outline = pts => { const s = new THREE.Shape(); pts.forEach(([x, y], i) => i ? s.lineTo(x, y) : s.moveTo(x, y)); s.closePath(); return s; };

// Battle-damaged look, for a tank that has lost half its armour: the camouflage is swapped for a
// sooty, scraped, rusty version and every other part is darkened. Works on a built (and merged) tank.
export function damageTank(obj) {
  const dmg = cached('tankDamaged', () => ({ camo: new Map(), others: new Map() }));
  obj.traverse(o => {
    if (!o.isMesh || o.material.userData.damaged) return;
    const pal = o.material.userData.camo;
    if (pal) { // the camouflage: a sooty, scraped version of the same pattern
      let d = dmg.camo.get(pal);
      if (!d) { d = pmat(0xe4dcd2, .9, .25, { map: camoTexture(true, pal) }); d.userData.damaged = true; dmg.camo.set(pal, d); }
      o.material = d; return;
    }
    if (o.material.map || o.material.emissive?.getHex()) return; // treads (they scroll per tank)
    let d = dmg.others.get(o.material);
    if (!d) { d = o.material.clone(); d.color.multiplyScalar(.78); d.roughness = Math.min(1, d.roughness + .15); d.userData.damaged = true; dmg.others.set(o.material, d); }
    o.material = d;
  });
}

export function buildTank() {
  const m = cached('mbtMats', () => ({
    camo: Object.assign(pmat(0xffffff, .75, .2, { map: camoTexture() }), { userData: { camo: MBT_PALETTE } }),
    dark: pmat(0x2e2c26, .7, .35), metal: pmat(0x3c3a35, .5, .6), rubber: pmat(0x1c1b19, .9, .05),
    wheel: pmat(0x4e5236, .7, .3), light: pmat(0xd8d0a0, .3, .2), glass: pmat(0x1a2a30, .15, .6),
    rack: pmat(0x3a3a2c, .6, .5), bag: pmat(0x5e5a3a, .95, 0), bag2: pmat(0x6e6448, .95, 0),
  }));
  const root = new THREE.Group(); root.name = 'tank';
  const L = 4.6, W = 2.0, TW = .55, SK = W / 2 + TW + .04; // hull length, hull width between tracks, track width, skirt offset

  // running gear: track belts, seven road wheels, drive sprocket at the back and idler at the front
  const tex = trackTexture(); tex.repeat.set(1, L / .7);
  const treadMat = pmat(0xffffff, .9, .2, { map: tex });
  const tracks = new THREE.Group(); tracks.name = 'tracks'; root.add(tracks);
  [-1, 1].forEach(s => {
    const x = s * (W / 2 + TW / 2);
    const belt = add(root, new THREE.ExtrudeGeometry(roundedRect(L + .1, .7, .33), { depth: TW, bevelEnabled: false, curveSegments: 8 }), m.rubber, x - TW / 2, .36, 0);
    belt.rotation.y = PI / 2;
    add(tracks, new THREE.BoxGeometry(TW, .03, L - .4), treadMat, x, .72, 0);
    for (let i = 0; i < 7; i++) {
      add(root, new THREE.CylinderGeometry(.25, .25, .12, 14), m.wheel, s * (W / 2 + TW - .02), .3, -1.65 + i * .55).rotation.z = PI / 2;
      add(root, new THREE.CylinderGeometry(.09, .09, .14, 8), m.dark, s * (W / 2 + TW), .3, -1.65 + i * .55).rotation.z = PI / 2;
    }
    add(root, new THREE.CylinderGeometry(.3, .3, .14, 10), m.metal, s * (W / 2 + TW - .02), .46, 2.15).rotation.z = PI / 2;  // sprocket
    add(root, new THREE.CylinderGeometry(.26, .26, .14, 10), m.wheel, s * (W / 2 + TW - .02), .46, -2.2).rotation.z = PI / 2; // idler
    // armoured side skirt over the upper run and the top of the wheels, thicker plates at the front
    add(root, new THREE.BoxGeometry(.08, .42, L - .5), m.camo, s * SK, .72, .2);
    add(root, new THREE.BoxGeometry(.14, .5, 1.3), m.camo, s * (SK + .03), .7, -1.65);
    add(root, new THREE.BoxGeometry(.03, .04, L - .5), m.dark, s * (SK + .04), .53, .2); // skirt bottom edge
  });

  // hull: lower body, a wide deck out over the tracks, sloped glacis and an engine deck at the back
  add(root, new THREE.BoxGeometry(W, .5, L - .2), m.camo, 0, .6, 0);
  slab(root, outline([[-SK, -L / 2], [SK, -L / 2], [SK, L / 2 - .45], [SK - .25, L / 2], [-SK + .25, L / 2], [-SK, L / 2 - .45]]), .1, m.camo, .88, .03);
  const glacis = add(root, new THREE.BoxGeometry(W + .9, .1, .8), m.camo, 0, .8, -2.42); glacis.rotation.x = -.3;
  [-1, 1].forEach(s => {
    add(root, new THREE.BoxGeometry(.22, .14, .1), m.dark, s * 1.05, .9, -2.76);                    // headlight guard
    add(root, new THREE.CylinderGeometry(.06, .06, .06, 8), m.light, s * 1.05, .9, -2.82).rotation.x = PI / 2;
  });
  add(root, new THREE.BoxGeometry(.5, .04, .4), m.dark, -.55, 1.06, -1.85);                         // driver's hatch
  add(root, new THREE.BoxGeometry(1.7, .06, 1.1), m.dark, 0, 1.06, 1.65);                           // engine deck grilles
  for (let i = 0; i < 6; i++) add(root, new THREE.BoxGeometry(1.6, .03, .05), m.metal, 0, 1.1, 1.18 + i * .19);
  add(root, new THREE.BoxGeometry(1.6, .35, .08), m.dark, 0, .75, L / 2 + .02);                     // exhaust grille

  // turret: a wide, flat, angular turret; flat sloped cheeks at the front, long bustle at the back
  const turret = new THREE.Group(); turret.name = 'turret'; turret.position.set(0, .99, .15); root.add(turret);
  const tShape = sc => outline([[-.75, 1.05], [.75, 1.05], [1.25, .45], [1.25, -1.2], [1.0, -1.85], [-1.0, -1.85], [-1.25, -1.2], [-1.25, .45]].map(([x, y]) => [x * sc, y * sc - (1 - sc) * .4]));
  slab(turret, tShape(1), .38, m.camo, 0, .05);
  slab(turret, tShape(.9), .1, m.camo, .43, .04);                                                    // sloped roof edge
  // stowage rack round the bustle, with bags and boxes in it
  const rail = (w, d, x, z) => add(turret, new THREE.BoxGeometry(w, .04, d), m.rack, x, .75, z);
  rail(2.1, .04, 0, 2.15); [-1, 1].forEach(s => rail(.04, 1.1, s * 1.05, 1.6));
  for (const [x, z] of [[-1.05, 2.15], [0, 2.15], [1.05, 2.15], [-1.05, 1.1], [1.05, 1.1]]) add(turret, new THREE.BoxGeometry(.03, .28, .03), m.rack, x, .62, z); // posts
  add(turret, new THREE.BoxGeometry(.8, .3, .5), m.bag, -.45, .68, 1.75);
  add(turret, new THREE.BoxGeometry(.6, .26, .45), m.bag2, .5, .66, 1.85);
  add(turret, new THREE.CylinderGeometry(.16, .16, .7, 8), m.bag, .1, .66, 1.35).rotation.z = PI / 2; // bedroll
  // gun: mantlet, long barrel with a thermal sleeve, bore evacuator half way and a plain muzzle
  add(turret, new THREE.BoxGeometry(.7, .4, .3), m.camo, 0, .25, -1.12);
  const gun = new THREE.Group(); gun.name = 'gun'; turret.add(gun); // the barrel, which recoils (slides back along +Z)
  const tube = (r1, r2, len, z, mm) => add(gun, new THREE.CylinderGeometry(r1, r2, len, 14), mm, 0, .27, z).rotation.x = PI / 2;
  tube(.11, .12, 1.4, -1.95, m.camo);   // sleeve, painted
  tube(.15, .15, .55, -2.9, m.camo);    // bore evacuator
  tube(.095, .1, 1.5, -3.9, m.metal);   // barrel
  tube(.11, .11, .14, -4.62, m.dark);   // muzzle reference ring
  const muzzle = new THREE.Object3D(); muzzle.name = 'muzzle'; muzzle.position.set(0, .27, -4.75); gun.add(muzzle);
  // roof: commander's cupola with a heavy machine gun, sight box in front, loader's hatch and gun
  add(turret, new THREE.CylinderGeometry(.34, .38, .2, 14), m.camo, .55, .66, .3);
  add(turret, new THREE.CylinderGeometry(.26, .26, .05, 14), m.dark, .55, .78, .3);
  add(turret, new THREE.BoxGeometry(.06, .1, .7), m.metal, .55, .9, -.05);                          // heavy MG
  add(turret, new THREE.BoxGeometry(.16, .14, .3), m.metal, .55, .88, .2);
  add(turret, new THREE.BoxGeometry(.4, .32, .35), m.camo, .62, .68, -.45);                         // sight box
  add(turret, new THREE.BoxGeometry(.3, .14, .03), m.glass, .62, .72, -.63);
  add(turret, new THREE.CylinderGeometry(.24, .24, .05, 12), m.camo, -.55, .58, .4);                // loader's hatch
  add(turret, new THREE.BoxGeometry(.05, .08, .6), m.metal, -.55, .78, .05);                        // loader's MG
  add(turret, new THREE.BoxGeometry(.04, .2, .04), m.metal, -.55, .67, .3);
  add(turret, new THREE.CylinderGeometry(.015, .015, .5, 4), m.metal, -.85, .85, 1.0);             // wind sensor mast
  add(turret, new THREE.BoxGeometry(.08, .04, .2), m.metal, -.85, 1.1, 1.0);
  [-1, 1].forEach(s => { // smoke grenade launchers on the cheeks
    for (let i = 0; i < 3; i++) add(turret, new THREE.CylinderGeometry(.05, .05, .2, 8), m.dark, s * (1.05 - i * .1), .5, -.55 - i * .06).rotation.x = PI / 2.6;
  });

  projectCamo(root, m.camo);
  poolPlain(root);
  return root;
}

export function buildLightTank() {
  const m = cached('ltMats', () => ({
    camo: Object.assign(pmat(0xffffff, .75, .2, { map: camoTexture(false, LIGHT_PALETTE) }), { userData: { camo: LIGHT_PALETTE } }),
    dark: pmat(0x2a2a24, .7, .35), metal: pmat(0x3a3a34, .5, .6), rubber: pmat(0x1c1b19, .9, .05),
    wheel: pmat(0x3e4630, .7, .3), tyre: pmat(0x202020, .9, 0), light: pmat(0xd8d0a0, .3, .2), glass: pmat(0x1a2a30, .15, .6),
    box: pmat(0x4a4c30, .8, .2), bag: pmat(0x5e5a3a, .95, 0),
  }));
  const root = new THREE.Group(); root.name = 'tank';
  const L = 3.6, W = 1.5, TW = .42, FX = W / 2 + TW + .02; // hull length, hull width between tracks, track width, mudguard edge

  // running gear in the open: belt, five big rubber-tyred road wheels, three return rollers,
  // drive sprocket at the front (raised) and idler at the back
  const tex = trackTexture(); tex.repeat.set(1, L / .55);
  const treadMat = pmat(0xffffff, .9, .2, { map: tex });
  const tracks = new THREE.Group(); tracks.name = 'tracks'; root.add(tracks);
  [-1, 1].forEach(s => {
    const x = s * (W / 2 + TW / 2), xo = s * (W / 2 + TW - .01);
    const belt = add(root, new THREE.ExtrudeGeometry(roundedRect(L, .62, .3), { depth: TW, bevelEnabled: false, curveSegments: 8 }), m.rubber, x - TW / 2, .32, 0);
    belt.rotation.y = PI / 2;
    add(tracks, new THREE.BoxGeometry(TW, .03, L - .5), treadMat, x, .64, 0);
    for (let i = 0; i < 5; i++) {
      const z = -1.2 + i * .6;
      add(root, new THREE.CylinderGeometry(.27, .27, .16, 16), m.tyre, xo, .29, z).rotation.z = PI / 2;
      add(root, new THREE.CylinderGeometry(.21, .21, .18, 14), m.wheel, xo, .29, z).rotation.z = PI / 2;
      add(root, new THREE.CylinderGeometry(.07, .07, .2, 8), m.dark, xo, .29, z).rotation.z = PI / 2;
    }
    for (let i = 0; i < 3; i++) add(root, new THREE.CylinderGeometry(.09, .09, .12, 8), m.wheel, xo, .6, -.9 + i * .9).rotation.z = PI / 2; // return rollers
    add(root, new THREE.CylinderGeometry(.26, .26, .14, 10), m.metal, xo, .42, -1.7).rotation.z = PI / 2;  // sprocket
    add(root, new THREE.CylinderGeometry(.23, .23, .14, 10), m.wheel, xo, .36, 1.72).rotation.z = PI / 2;  // idler
    // mudguard over the track, with stowage boxes and a tool along it
    add(root, new THREE.BoxGeometry(TW + .1, .04, L - .3), m.camo, s * (W / 2 + TW / 2 + .03), .84, 0);
    add(root, new THREE.BoxGeometry(TW - .02, .26, .7), m.box, s * (W / 2 + TW / 2 + .02), .99, .75);
    add(root, new THREE.BoxGeometry(TW - .02, .2, .45), m.box, s * (W / 2 + TW / 2 + .02), .96, -.35);
    add(root, new THREE.BoxGeometry(.05, .05, .9), m.metal, s * (FX - .04), .89, -.95);                // shovel / pry bar
  });

  // hull: a narrow box with a steep sloped nose and a raised engine deck at the back
  add(root, new THREE.BoxGeometry(W, .55, L - .5), m.camo, 0, .6, .1);
  slab(root, outline([[-W / 2, -L / 2 + .45], [W / 2, -L / 2 + .45], [W / 2, L / 2 - .1], [-W / 2, L / 2 - .1]]), .08, m.camo, .82, .03);
  const nose = add(root, new THREE.BoxGeometry(W, .08, .75), m.camo, 0, .66, -1.62); nose.rotation.x = -.55;
  const lower = add(root, new THREE.BoxGeometry(W, .08, .4), m.camo, 0, .38, -1.72); lower.rotation.x = .7;
  [-1, 1].forEach(s => {
    add(root, new THREE.CylinderGeometry(.07, .07, .08, 8), m.light, s * .55, .84, -1.88).rotation.x = PI / 2; // headlights
    add(root, new THREE.BoxGeometry(.2, .12, .06), m.dark, s * .55, .84, -1.84);
  });
  add(root, new THREE.BoxGeometry(.36, .04, .32), m.dark, .38, .96, -1.2);                          // driver's hatch
  add(root, new THREE.BoxGeometry(.18, .06, .03), m.glass, .38, 1.0, -1.37);
  add(root, new THREE.BoxGeometry(1.25, .1, .9), m.camo, 0, .98, 1.15);                             // engine deck
  for (let i = 0; i < 5; i++) add(root, new THREE.BoxGeometry(1.1, .03, .05), m.metal, 0, 1.04, .8 + i * .17);
  add(root, new THREE.CylinderGeometry(.08, .08, .4, 8), m.dark, -.5, .78, 1.72).rotation.x = PI / 2; // exhaust
  add(root, new THREE.BoxGeometry(1.2, .3, .06), m.dark, 0, .66, L / 2 - .2);

  // turret: small and rounded (a domed octagon), set forward; short gun with a muzzle brake
  const turret = new THREE.Group(); turret.name = 'turret'; turret.position.set(0, .88, -.15); root.add(turret);
  const ring = (rx, rz, n = 10) => outline(Array.from({ length: n }, (_, i) => { const a = (i + .5) / n * PI * 2; return [Math.sin(a) * rx, Math.cos(a) * rz + (Math.cos(a) < 0 ? -.15 : 0)]; }));
  slab(turret, ring(.82, .9), .32, m.camo, 0, .06);
  slab(turret, ring(.66, .72), .1, m.camo, .38, .05);                                              // rounded roof
  add(turret, new THREE.BoxGeometry(.5, .36, .26), m.camo, 0, .25, -.88);                           // mantlet
  const gun = new THREE.Group(); gun.name = 'gun'; turret.add(gun); // the barrel, which recoils
  const tube = (r1, r2, len, z, mm) => add(gun, new THREE.CylinderGeometry(r1, r2, len, 12), mm, 0, .25, z).rotation.x = PI / 2;
  tube(.075, .085, 1.7, -1.85, m.metal);  // barrel
  tube(.11, .11, .26, -2.75, m.dark);     // muzzle brake
  add(gun, new THREE.BoxGeometry(.3, .05, .16), m.dark, 0, .25, -2.75);
  const muzzle = new THREE.Object3D(); muzzle.name = 'muzzle'; muzzle.position.set(0, .25, -2.9); gun.add(muzzle);
  add(turret, new THREE.CylinderGeometry(.22, .25, .14, 12), m.camo, -.32, .55, .15);               // commander's cupola
  add(turret, new THREE.CylinderGeometry(.18, .18, .04, 12), m.dark, -.32, .64, .15);
  add(turret, new THREE.BoxGeometry(.05, .07, .55), m.metal, -.32, .72, -.12);                      // MG
  add(turret, new THREE.BoxGeometry(.2, .16, .2), m.camo, .35, .52, -.35);                          // sight
  add(turret, new THREE.BoxGeometry(.16, .08, .02), m.glass, .35, .55, -.46);
  add(turret, new THREE.BoxGeometry(.9, .26, .3), m.bag, 0, .42, .95);                              // bedroll / stowage on the back
  add(turret, new THREE.CylinderGeometry(.012, .012, .9, 4), m.metal, .45, .85, .6);                // radio aerial

  projectCamo(root, m.camo);
  poolPlain(root);
  return root;
}

// Dark gunmetal grey for the medium tank (after the sprite): charcoal base with darker and lighter grey patches.
const MEDIUM_PALETTE = { base: '#4a4e52', a: '#383b3f', b: '#62676b', dark: '#1e2023' };

const MEDIUM_SCALE = 1.06; // whole-model scale: the parts below are laid out for a 4.1 m hull, this makes it ~4.35 m

const mediumMats = () => cached('medMats', () => ({
    camo: Object.assign(pmat(0xffffff, .75, .2, { map: camoTexture(false, MEDIUM_PALETTE) }), { userData: { camo: MEDIUM_PALETTE } }),
    dark: pmat(0x24262a, .7, .35), metal: pmat(0x3c3e42, .5, .6), rubber: pmat(0x1c1b19, .9, .05), tyre: pmat(0x202020, .9, 0),
    wheel: pmat(0x5c6165, .65, .35), light: pmat(0xe0e0d0, .3, .2), glass: pmat(0x1a2a30, .15, .6),
    wood: pmat(0x5a4630, .9, 0), bag: pmat(0x45484a, .95, 0), rim: pmat(0x90969a, .55, .35),
  }));

// The medium tank's hull, running gear and fenders (the flame tank's too): into `root`, with the materials of mediumMats().
function mediumHull(root, m) {
  const L = 4.1, W = 1.75, TW = .48; // hull length, hull width between tracks, track width

  // running gear: belt, six rubber-tyred road wheels, three return rollers, drive sprocket at the back and idler at
  // the front; green fenders over the tracks with a front mudguard, a stowage box, two fuel drums on the right
  // fender and a snorkel tube on the left
  const tex = trackTexture(); tex.repeat.set(1, L / .65);
  const treadMat = pmat(0xffffff, .9, .2, { map: tex });
  const tracks = new THREE.Group(); tracks.name = 'tracks'; root.add(tracks);
  [-1, 1].forEach(s => {
    const x = s * (W / 2 + TW / 2), xo = s * (W / 2 + TW - .02), fx = s * (W / 2 + TW / 2 + .02);
    const belt = add(root, new THREE.ExtrudeGeometry(roundedRect(L + .05, .66, .31), { depth: TW, bevelEnabled: false, curveSegments: 8 }), m.rubber, x - TW / 2, .34, 0);
    belt.rotation.y = PI / 2;
    add(tracks, new THREE.BoxGeometry(TW, .03, L - .4), treadMat, x, .68, 0);
    for (let i = 0; i < 6; i++) {
      const z = -1.25 + i * .5;
      add(root, new THREE.CylinderGeometry(.25, .25, .15, 16), m.tyre, xo, .3, z).rotation.z = PI / 2;
      add(root, new THREE.CylinderGeometry(.19, .19, .17, 14), m.wheel, xo, .3, z).rotation.z = PI / 2;
      add(root, new THREE.CylinderGeometry(.07, .07, .19, 8), m.dark, xo, .3, z).rotation.z = PI / 2;
    }
    for (let i = 0; i < 3; i++) add(root, new THREE.CylinderGeometry(.08, .08, .12, 8), m.wheel, xo, .62, -.9 + i * .9).rotation.z = PI / 2; // return rollers
    add(root, new THREE.CylinderGeometry(.28, .28, .14, 10), m.metal, xo, .42, 1.8).rotation.z = PI / 2;   // sprocket
    add(root, new THREE.CylinderGeometry(.25, .25, .14, 10), m.wheel, xo, .42, -1.85).rotation.z = PI / 2; // idler
    add(root, new THREE.BoxGeometry(TW + .06, .05, L - .15), m.camo, fx, .8, 0);                            // fender
    add(root, new THREE.BoxGeometry(.05, .1, L - .15), m.rim, s * (W / 2 + TW + .04), .85, 0);              // its raised outer lip, light grey like the sprite
    add(root, new THREE.BoxGeometry(TW + .06, .05, .45), m.camo, fx, .72, -L / 2 + .02).rotation.x = -.45;  // front mudguard
    add(root, new THREE.BoxGeometry(TW - .06, .22, .5), m.camo, fx, .94, -.55);                             // stowage box
    if (s > 0) for (let i = 0; i < 2; i++) { // external fuel drums, each with a strap band
      add(root, new THREE.CylinderGeometry(.16, .16, .62, 14), m.camo, fx, .985, .5 + i * .72).rotation.x = PI / 2;
      add(root, new THREE.CylinderGeometry(.165, .165, .05, 14), m.dark, fx, .985, .5 + i * .72).rotation.x = PI / 2;
    } else { // snorkel tube stowed along the left fender
      add(root, new THREE.CylinderGeometry(.055, .055, 1.5, 10), m.metal, fx, .93, .55).rotation.x = PI / 2;
      [-.05, 1.15].forEach(z => add(root, new THREE.BoxGeometry(.12, .1, .06), m.metal, fx, .86, z));
    }
  });

  // hull: low and wide, chamfered front corners, a long sloped glacis with a splash board, headlights, the driver's
  // hatch in the middle and an unditching log across the back deck
  add(root, new THREE.BoxGeometry(W, .5, L - .25), m.camo, 0, .58, .05);
  slab(root, outline([[-W / 2, -L / 2 + .3], [W / 2, -L / 2 + .3], [W / 2, L / 2 - .5], [W / 2 - .3, L / 2 - .1], [-W / 2 + .3, L / 2 - .1], [-W / 2, L / 2 - .5]]), .09, m.camo, .83, .03);
  const nose = add(root, new THREE.BoxGeometry(W - .1, .08, .8), m.camo, 0, .68, -1.84); nose.rotation.x = -.55;
  add(root, new THREE.BoxGeometry(.9, .2, .04), m.camo, 0, 1.02, -1.6).rotation.x = -.4;                  // splash board
  [-1, 1].forEach(s => {
    add(root, new THREE.BoxGeometry(.16, .1, .14), m.camo, s * .62, .96, -1.82);                           // headlight mount
    add(root, new THREE.CylinderGeometry(.06, .06, .06, 8), m.light, s * .62, .98, -1.92).rotation.x = PI / 2;
    add(root, new THREE.BoxGeometry(.1, .1, .06), m.metal, s * .75, .72, -L / 2 + .12);                    // towing eye
  });
  add(root, new THREE.CylinderGeometry(.2, .22, .07, 14), m.camo, 0, 1.0, -1.35);                          // driver's hatch
  add(root, new THREE.BoxGeometry(W - .1, .42, .06), m.camo, 0, .62, L / 2);                               // rear plate
  add(root, new THREE.CylinderGeometry(.13, .13, 1.35, 10), m.wood, 0, 1.1, 1.55).rotation.z = PI / 2;   // unditching log
  [-1, 1].forEach(s => add(root, new THREE.BoxGeometry(.08, .12, .3), m.metal, s * .6, 1.0, 1.55));       // its cradles
}

export function buildMediumTank() {
  const m = mediumMats();
  const root = new THREE.Group(); root.name = 'tank';
  mediumHull(root, m);

  // turret: a low, smooth cast dome with cheek bulges, a gun with a bulbous fume extractor, a searchlight beside the
  // gun, the commander's cupola with an anti-aircraft machine gun on the left, the gunner's hatch and sight on the
  // right, smoke launchers on the cheeks and a stowage bin at the back
  const turret = new THREE.Group(); turret.name = 'turret'; turret.position.set(0, .92, -.1); root.add(turret);
  add(turret, new THREE.CylinderGeometry(.9, .95, .22, 28), m.camo, 0, .11, .05).scale.z = 1.08;          // turret base
  const dome = add(turret, new THREE.SphereGeometry(1, 28, 14, 0, PI * 2, 0, PI / 2), m.camo, 0, .22, .05); dome.scale.set(.9, .34, 1.02);
  [-1, 1].forEach(s => add(turret, new THREE.SphereGeometry(.38, 16, 12), m.camo, s * .5, .2, -.65).scale.set(1, .7, 1.3)); // cheek bulges
  add(turret, new THREE.BoxGeometry(.55, .4, .3), m.camo, 0, .26, -1.0);                                   // mantlet
  add(turret, new THREE.BoxGeometry(1.0, .3, .34), m.camo, 0, .2, 1.0);                                    // rear stowage bin
  add(turret, new THREE.BoxGeometry(.8, .12, .3), m.bag, 0, .4, 1.0);                                      // tarp on top
  const gun = new THREE.Group(); gun.name = 'gun'; turret.add(gun); // the barrel, which recoils (slides back along +Z)
  const tube = (r1, r2, len, z, mm) => add(gun, new THREE.CylinderGeometry(r1, r2, len, 14), mm, 0, .26, z).rotation.x = PI / 2;
  tube(.1, .11, 2.2, -2.1, m.metal);      // barrel
  tube(.145, .145, .5, -2.0, m.camo);     // fume extractor
  tube(.115, .115, .1, -3.2, m.dark);     // muzzle ring
  const muzzle = new THREE.Object3D(); muzzle.name = 'muzzle'; muzzle.position.set(0, .26, -3.3); gun.add(muzzle);
  add(turret, new THREE.BoxGeometry(.34, .3, .36), m.camo, .6, .34, -1.05);                                // searchlight housing
  add(turret, new THREE.CylinderGeometry(.1, .1, .03, 12), m.glass, .6, .34, -1.245).rotation.x = PI / 2;
  add(turret, new THREE.CylinderGeometry(.27, .3, .16, 14), m.camo, -.4, .56, .25);                        // commander's cupola
  add(turret, new THREE.CylinderGeometry(.22, .22, .04, 14), m.dark, -.4, .66, .25);
  add(turret, new THREE.BoxGeometry(.08, .18, .08), m.metal, -.4, .76, .15);                               // AA gun mount
  add(turret, new THREE.CylinderGeometry(.03, .03, .75, 8), m.metal, -.4, .86, -.05).rotation.x = PI / 2; // AA machine gun
  add(turret, new THREE.BoxGeometry(.14, .12, .18), m.camo, -.52, .78, .25);                               // ammo box
  add(turret, new THREE.CylinderGeometry(.22, .22, .05, 14), m.camo, .4, .54, .3);                         // gunner's hatch
  add(turret, new THREE.BoxGeometry(.3, .12, .26), m.camo, .4, .56, -.12);                                 // sight box
  add(turret, new THREE.BoxGeometry(.2, .06, .03), m.glass, .4, .58, -.26);
  add(turret, new THREE.CylinderGeometry(.012, .012, .8, 4), m.metal, -.65, .95, .8);                      // radio aerial
  [-1, 1].forEach(s => { // smoke grenade launchers on the cheeks
    for (let i = 0; i < 3; i++) add(turret, new THREE.CylinderGeometry(.05, .05, .2, 8), m.dark, s * (.86 - i * .09), .36, -.3 - i * .12).rotation.x = PI / 2.6;
  });

  projectCamo(root, m.camo);
  root.scale.setScalar(MEDIUM_SCALE); // camo is projected in root space, so the pattern scales with the tank
  poolPlain(root);
  return root;
}

// ---- the flame tank's finish: positions in the tank's own space for every part, then shaders that use them (triplanar paint so no stretching on the round turret, caked mud up from the ground)
const FLAME_GLSL = `
float h3( vec3 p ) { p = fract( p * 0.3183099 + 0.1 ); p *= 17.0; return fract( p.x * p.y * p.z * ( p.x + p.y + p.z ) ); }
float vnoise( vec3 x ) { vec3 i = floor( x ), f = fract( x ); f = f * f * ( 3.0 - 2.0 * f );
  return mix( mix( mix( h3( i ), h3( i + vec3( 1, 0, 0 ) ), f.x ), mix( h3( i + vec3( 0, 1, 0 ) ), h3( i + vec3( 1, 1, 0 ) ), f.x ), f.y ),
              mix( mix( h3( i + vec3( 0, 0, 1 ) ), h3( i + vec3( 1, 0, 1 ) ), f.x ), mix( h3( i + vec3( 0, 1, 1 ) ), h3( i + vec3( 1, 1, 1 ) ), f.x ), f.y ), f.z ); }`;
function addRootAttrs(root) { // 'rpos' / 'rnor': each vertex's position and normal in the tank's own space (instanced meshes use their instance matrices instead)
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert(), p = new THREE.Vector3(), n = new THREE.Vector3();
  root.traverse(mesh => {
    if (!mesh.isMesh || mesh.isInstancedMesh) return;
    const g = mesh.geometry, toRoot = new THREE.Matrix4().multiplyMatrices(inv, mesh.matrixWorld), nm = new THREE.Matrix3().getNormalMatrix(toRoot), pos = g.attributes.position, nor = g.attributes.normal;
    const rp = new Float32Array(pos.count * 3), rn = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      p.fromBufferAttribute(pos, i).applyMatrix4(toRoot); n.fromBufferAttribute(nor, i).applyMatrix3(nm).normalize();
      rp.set([p.x, p.y, p.z], i * 3); rn.set([n.x, n.y, n.z], i * 3);
    }
    g.setAttribute('rpos', new THREE.BufferAttribute(rp, 3)); g.setAttribute('rnor', new THREE.BufferAttribute(rn, 3));
  });
}
// A copy of `base` that is painted triplanar from its map (if `triplanar`) and caked with mud from the ground up: more of it the lower the part, broken up by noise.
function muddied(base, { triplanar = false, mud = 1, mudColor = [.2, .13, .075], tile = 3.2, soot = null } = {}) { // soot: [z0, z1]: blackened from z0 (clean) to z1 (black) along the tank (the muzzle end)
  const m = base.clone();
  m.onBeforeCompile = sh => {
    sh.vertexShader = 'varying vec3 vRP;\nvarying vec3 vRN;\n#ifndef USE_INSTANCING\nattribute vec3 rpos;\nattribute vec3 rnor;\n#endif\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
	#ifdef USE_INSTANCING
	vRP = ( instanceMatrix * vec4( position, 1.0 ) ).xyz; vRN = mat3( instanceMatrix ) * normal;
	#else
	vRP = rpos; vRN = rnor;
	#endif`);
    sh.fragmentShader = 'varying vec3 vRP;\nvarying vec3 vRN;\n' + FLAME_GLSL + '\n' + sh.fragmentShader.replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n\troughnessFactor = mix( roughnessFactor, 0.97, caked );').replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\n\tmetalnessFactor *= 1.0 - caked;').replace('#include <map_fragment>', (triplanar ? `
	vec3 bw = pow( abs( normalize( vRN ) ), vec3( 4.0 ) ); bw /= ( bw.x + bw.y + bw.z );
	vec4 tx = texture2D( map, vRP.zy / ${tile.toFixed(2)} ) * bw.x + texture2D( map, vRP.xz / ${tile.toFixed(2)} ) * bw.y + texture2D( map, vRP.xy / ${tile.toFixed(2)} ) * bw.z;
	diffuseColor *= tx;` : '#include <map_fragment>') + `
	float nz = vnoise( vRP * 6.0 ) * 0.55 + vnoise( vRP * 17.0 ) * 0.45;
	float caked = ( 1.0 - smoothstep( 0.2, 0.95, vRP.y ) ) * 1.35 + ( nz - 0.5 ) * 0.9;
	caked = smoothstep( 0.42, 0.78, caked ) * ${mud.toFixed(2)};
	diffuseColor.rgb = mix( diffuseColor.rgb, vec3( ${mudColor.map(v => v.toFixed(3)).join(',')} ) * ( 0.7 + 0.6 * nz ), caked );` + (soot ? `
	float burnt = smoothstep( ${soot[0].toFixed(2)}, ${soot[1].toFixed(2)}, vRP.z ) * ( 0.8 + 0.2 * nz );
	diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.03, 0.027, 0.024 ), burnt * 0.96 );` : ''));
  };
  return m;
}
// buildFlameTank: the flame tank: the medium tank's hull under a long, smooth, loaf-shaped turret with a raised crown (hatches, periscopes, recessed panels, weld seams, a main sight), after the "FLAMM-01" concept: a slab-sided flame arm on each side
// of the turret, each on an armoured hinge housing with two hydraulic pistons, reaching past the nose of the hull and ending in two flared trumpet nozzles, sooted black toward the tips, each with a pilot flame. The tracks have modelled
// links with cleats, the drive sprockets have teeth, the return rollers are bracketed; everything low is caked in mud. In dirty, rusted orange paint, painted triplanar so it never stretches.
// Named parts: `turret` (turns; carries everything above it), `armL` / `armR` (the flame arms, which pivot at the hinge: rotation.x raises or lowers them) with `muzzleL` / `muzzleR` at the nozzle tips (-Z is forward),
// `muzzle` (between the arms' tips, for the game's aiming), `gun` (empty: kept so the game's recoil has something to move), `pilotL` / `pilotR` (a pilot flame on each arm: the material's emissiveIntensity can flicker), `tracks`.
// The flame tank's paint: a calm, worn orange: large soft light and dark washes, a few rust runs and chips, fine grain (seamless over 256 px)
function flamePaintTexture() {
  const S = 256, c = document.createElement('canvas'); c.width = c.height = S; const x = c.getContext('2d');
  let seed = 31; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  x.fillStyle = '#b4611f'; x.fillRect(0, 0, S, S);
  const wash = (cx, cy, r, col, a) => { for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) { const g = x.createRadialGradient(cx + ox, cy + oy, 0, cx + ox, cy + oy, r); g.addColorStop(0, `rgba(${col},${a})`); g.addColorStop(1, `rgba(${col},0)`); x.fillStyle = g; x.fillRect(cx + ox - r, cy + oy - r, r * 2, r * 2); } };
  for (let i = 0; i < 11; i++) wash(rnd() * S, rnd() * S, 38 + rnd() * 55, '74,32,12', .24);
  for (let i = 0; i < 4; i++) wash(rnd() * S, rnd() * S, 22 + rnd() * 24, '96,40,14', .3);
  for (let i = 0; i < 8; i++) wash(rnd() * S, rnd() * S, 40 + rnd() * 50, '228,152,72', .2);
  for (let i = 0; i < 10; i++) { const px = rnd() * S, py = rnd() * S, len = 30 + rnd() * 60, g = x.createLinearGradient(0, py, 0, py + len); g.addColorStop(0, 'rgba(96,42,14,.3)'); g.addColorStop(1, 'rgba(96,42,14,0)'); x.fillStyle = g; x.fillRect(px, py, 2 + rnd() * 4, len); }
  for (let i = 0; i < 70; i++) { x.fillStyle = rnd() > .4 ? 'rgba(70,30,12,.42)' : 'rgba(215,140,70,.32)'; x.fillRect(rnd() * S, rnd() * S, 2 + rnd() * 5, 1 + rnd() * 3); }
  for (let i = 0; i < 3500; i++) { x.fillStyle = rnd() > .5 ? 'rgba(255,220,170,.05)' : 'rgba(40,20,8,.07)'; x.fillRect(rnd() * S, rnd() * S, 1.5, 1.5); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; return t;
}
const FLAME_PALETTE = { base: '#b9611f', a: '#86391a', b: '#d58a3c', dark: '#3e2514' }; // dirty orange: worn orange paint with rust brown, faded patches and grime
// The flame tank at half health: its paint (the muddied orange) charred in dark scorched patches, scraped and duller; everything else a little darker. Variants are shared between tanks.
export function damageFlameTank(obj) {
  const mud = cached('flameMud', () => null), dmg = cached('flameDamaged', () => new Map());
  obj.traverse(o => {
    if (!o.isMesh || o.isInstancedMesh || o.material.userData.damaged || o.material.isShaderMaterial || o.material.emissive?.getHex()) return; // (the flame jets' own shaders and the pilot flames' glow keep their materials: they are animated)
    let d = dmg.get(o.material);
    if (!d) {
      const src = o.material, paint = src === mud.paint || src === mud.sootPaint;
      d = src.clone(); d.userData.damaged = true;
      if (paint) {
        d.roughness = .6; d.envMapIntensity = .7;
        d.onBeforeCompile = (sh, r) => {
          src.onBeforeCompile(sh, r);
          sh.fragmentShader = sh.fragmentShader.replace('#include <alphatest_fragment>', `#include <alphatest_fragment>
	float dn = vnoise( vRP * 5.0 ) * 0.7 + vnoise( vRP * 12.0 ) * 0.3;
	diffuseColor.rgb *= mix( 1.0, 0.68, smoothstep( 0.35, 0.85, dn ) );
	diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.06, 0.05, 0.045 ), smoothstep( 0.62, 0.95, vnoise( vRP * 2.5 + 7.0 ) ) * 0.6 );`);
        };
        d.customProgramCacheKey = () => 'flameDamaged' + (src === mud.sootPaint ? 'S' : 'P');
      } else if (d.color) d.color.multiplyScalar(.8);
      dmg.set(src, d);
    }
    o.material = d;
  });
}
export function buildFlameTank() {
  const base = mediumMats(), f = cached('flameMats', () => ({
    copper: pmat(0x9a6a3a, .35, .8), yellow: pmat(0xc9a21c, .55, .2), black: pmat(0x16171a, .7, .3), glassB: pmat(0x16303a, .15, .7), link: pmat(0x2c2b28, .55, .6), steel: pmat(0x55595c, .5, .7),
    sootMetal: pmat(0x77787a, .6, .6),
    pilot: new THREE.MeshStandardMaterial({ color: 0xeaf4ff, emissive: 0x7ab8ff, emissiveIntensity: 2.4, roughness: .3 }),
    paint: Object.assign(pmat(0xffffff, .48, .38, { map: flamePaintTexture(), envMapIntensity: .95 }), // (glossier paint: it picks up the sky; the mud on it stays matte, see muddied)
       { userData: { camo: FLAME_PALETTE } }),
  }));
  const mud = cached('flameMud', () => ({ // the materials of everything the mud reaches
    paint: muddied(f.paint, { triplanar: true, tile: 3.7 }), rubber: muddied(base.rubber), tyre: muddied(base.tyre), wheel: muddied(base.wheel), metal: muddied(base.metal), dark: muddied(base.dark), rim: muddied(base.rim),
    wood: muddied(base.wood), link: muddied(f.link), steel: muddied(f.steel), black: muddied(f.black),
    sootPaint: muddied(f.paint, { triplanar: true, tile: 3.7, soot: [-1.8, -3.1] }), sootMetal: muddied(f.sootMetal, { soot: [-2.4, -3.2] }),
  }));
  const m = { ...base, camo: f.paint }; // (the paint material is the one the hull and turret are built with, and swapped for the muddied copy at the end)
  const root = new THREE.Group(); root.name = 'tank';
  mediumHull(root, m);
  const L = 4.1, W = 1.75, TW = .48;

  // ---- tracks: modelled links with a cleat on every other one (instanced, round the belt's outline), the sprockets toothed, the return rollers on brackets
  const loop = (() => { // the belt's centre line in (z, y): top and bottom straights and the two rounded ends, evenly spaced
    const Lh = (L + .05) / 2, r = .31, cy = .34, straight = 2 * (Lh - r), arc = PI * r, total = 2 * straight + 2 * arc, n = Math.round(total / .105), out = [];
    for (let i = 0; i < n; i++) {
      let d = i / n * total, z, y, ang;
      if (d < straight) { z = -(Lh - r) + d; y = cy + r; ang = 0; }                                   // top run, rear-ward
      else if (d < straight + arc) { const a = (d - straight) / r; z = (Lh - r) + Math.sin(a) * r; y = cy + Math.cos(a) * r; ang = a; } // rear end, going round
      else if (d < 2 * straight + arc) { z = (Lh - r) - (d - straight - arc); y = cy - r; ang = PI; } // bottom run
      else { const a = (d - 2 * straight - arc) / r; z = -(Lh - r) - Math.sin(a) * r; y = cy - Math.cos(a) * r; ang = PI + a; } // front end
      out.push({ z, y, ang });
    }
    return out;
  })();
  // (the links' hidden faces are left out: the underside and the two ends, which butt against their neighbours: half the triangles of a box, and the same look from outside)
  const outerFaces = g => { const ix = g.index.array, keep = []; for (const f of [0, 1, 2]) for (let k = 0; k < 6; k++) keep.push(ix[f * 6 + k]); g.setIndex(keep); g.clearGroups(); return g; };
  const linkGeo = outerFaces(new THREE.BoxGeometry(TW - .05, .045, .098)), cleatGeo = new THREE.BoxGeometry(TW - .12, .035, .03);
  const links = new THREE.InstancedMesh(linkGeo, mud.link, loop.length * 2), cleats = new THREE.InstancedMesh(cleatGeo, mud.steel, loop.length);
  const mm = new THREE.Matrix4(), qq = new THREE.Quaternion(), e = new THREE.Euler(), pp = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
  let li = 0, ci = 0;
  for (const s of [-1, 1]) for (let i = 0; i < loop.length; i++) {
    const { z, y, ang } = loop[i], x = s * (W / 2 + TW / 2), nx = Math.sin(ang), ny = Math.cos(ang); // (ang: the turn from the top run; the outward normal is (ny up, ... in z-y))
    const dz = Math.cos(ang), dy = -Math.sin(ang); // tangent direction (z, y)
    qq.setFromEuler(e.set(Math.atan2(-dy, dz), 0, 0)); mm.compose(pp.set(x, y + .0, z), qq, one); links.setMatrixAt(li++, mm);
    if (i % 2 === 0 && s !== undefined) { // a cleat on the outer face of every other link
      const out = new THREE.Vector3(0, ny, nx).multiplyScalar(.035); mm.compose(pp.set(x, y + out.y, z + out.z), qq, one); cleats.setMatrixAt(ci++, mm);
    }
  }
  links.count = li; cleats.count = ci; links.castShadow = cleats.castShadow = false; links.receiveShadow = cleats.receiveShadow = true; root.add(links, cleats);
  for (const s of [-1, 1]) {
    const xo = s * (W / 2 + TW - .02);
    for (let i = 0; i < 12; i++) { const a = i / 12 * PI * 2; add(root, new THREE.BoxGeometry(.16, .07, .07), base.metal, xo + s * .04, .42 + Math.cos(a) * .3, 1.8 + Math.sin(a) * .3).rotation.x = -a; } // sprocket teeth
    add(root, new THREE.CylinderGeometry(.09, .09, .18, 10), base.dark, xo + s * .02, .42, 1.8).rotation.z = PI / 2;                                  // sprocket hub
    for (let i = 0; i < 6; i++) { const a = i / 6 * PI * 2; add(root, new THREE.CylinderGeometry(.018, .018, .2, 6), base.rim, xo + s * .03, .42 + Math.cos(a) * .17, 1.8 + Math.sin(a) * .17).rotation.z = PI / 2; } // its bolts
    for (let i = 0; i < 3; i++) { // return rollers: a rubber-tyred wheel on a bracket arm off the hull
      const z = -.9 + i * .9;
      add(root, new THREE.CylinderGeometry(.1, .1, .12, 12), base.tyre, xo, .62, z).rotation.z = PI / 2;
      add(root, new THREE.BoxGeometry(.08, .13, .08), base.metal, xo - s * .07, .73, z);
    }
  }

  // ---- the turret: a long, rounded shell (a rounded plan extruded, its top edges bevelled), a raised smooth crown on it, set toward the back of the hull
  const turret = new THREE.Group(); turret.name = 'turret'; turret.position.set(0, .92, -.1); root.add(turret);
  const V = (x, y, z) => new THREE.Vector3(x, y, z), Y0 = new THREE.Vector3(0, 1, 0);
  const rod = (parent, a, b, r, mt) => { // a straight tube from point a to point b
    const d = new THREE.Vector3().subVectors(b, a), len = d.length(), mesh = add(parent, new THREE.CylinderGeometry(r, r, len, 8), mt, (a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
    mesh.quaternion.setFromUnitVectors(Y0, d.normalize()); return mesh;
  };
  const shell = add(turret, new THREE.ExtrudeGeometry(roundedRect(1.7, 3.0, .7), { depth: .3, bevelEnabled: true, bevelThickness: .2, bevelSize: .17, bevelSegments: 3, curveSegments: 9 }), m.camo, 0, .02, .3);
  shell.rotation.x = -PI / 2;
  const DC = V(0, .5, .35), DR = V(.72, .3, 1.3); // the crown: a half ellipsoid standing on the shell's flat top (centre, radii)
  add(turret, new THREE.SphereGeometry(1, 24, 8, 0, PI * 2, 0, PI / 2), m.camo, DC.x, DC.y, DC.z).scale.set(DR.x, DR.y, DR.z);
  const domeY = (x, z) => DC.y + DR.y * Math.sqrt(Math.max(0, 1 - (x / DR.x) ** 2 - ((z - DC.z) / DR.z) ** 2));
  const onDome = (obj, x, z, lift = 0, yaw = 0) => { // set a part on the crown at (x, z), turned to the slope there
    const y = domeY(x, z), n = V(x / DR.x ** 2, (y - DC.y) / DR.y ** 2, (z - DC.z) / DR.z ** 2).normalize();
    obj.position.set(x, y + lift, z); obj.quaternion.setFromUnitVectors(Y0, n); obj.rotateY(yaw); return obj;
  };
  add(turret, new THREE.CylinderGeometry(.84, .88, .08, 28), m.dark, 0, .0, .3).scale.z = 1.7;                // the turret ring: a dark seam where the shell meets the hull
  // weld seams: a bead round the crown's foot, and two running across it
  const seam = pts => add(turret, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, pts[0].equals(pts[pts.length - 1])), 28, .011, 3, false), base.dark, 0, 0, 0);
  seam(Array.from({ length: 41 }, (_, i) => { const a = i / 40 * PI * 2; return V(Math.cos(a) * DR.x * .995, DC.y + .012, DC.z + Math.sin(a) * DR.z * .995); }));
  for (const z of [-.15, .75]) seam(Array.from({ length: 13 }, (_, i) => { const x = -DR.x * .93 + i / 12 * DR.x * 1.86; return V(x, domeY(x, z) + .008, z); }));
  // hatches: the commander's round one, with a rim and a hinge and handle; the loader's square one
  const cx = .3, cz = .5;
  onDome(add(turret, new THREE.CylinderGeometry(.25, .27, .06, 20), m.camo), cx, cz, .01);
  onDome(add(turret, new THREE.TorusGeometry(.26, .018, 6, 24), base.metal), cx, cz, .045).rotateX(PI / 2);
  onDome(add(turret, new THREE.CylinderGeometry(.17, .17, .035, 16), base.dark), cx, cz, .075);
  onDome(add(turret, new THREE.BoxGeometry(.14, .05, .05), base.metal), cx, cz + .22, .04);                   // hinge
  onDome(add(turret, new THREE.BoxGeometry(.18, .03, .03), base.metal), cx, cz - .05, .105);                  // handle
  const lx = -.3, lz = 1.0;
  onDome(add(turret, new THREE.BoxGeometry(.46, .05, .4), m.camo), lx, lz, .01);
  for (const [dx, dz, w, d] of [[0, .205, .48, .02], [0, -.205, .48, .02], [.235, 0, .02, .42], [-.235, 0, .02, .42]]) onDome(add(turret, new THREE.BoxGeometry(w, .035, d), base.metal), lx + dx, lz + dz, .03); // its frame
  onDome(add(turret, new THREE.BoxGeometry(.3, .03, .26), base.dark), lx, lz, .04);
  // periscopes round the commander's hatch (an armoured block each, a dark slit looking outward) and a main sight on the front of the shell
  for (let i = 0; i < 6; i++) {
    const a = PI * (1.0 + i * .2) - .1, px = cx + Math.cos(a) * .36, pz = cz + Math.sin(a) * .36, yaw = -a + PI / 2;
    const p = onDome(new THREE.Group(), px, pz, 0, yaw); turret.add(p);
    add(p, new THREE.BoxGeometry(.13, .09, .09), m.camo, 0, .05, 0); add(p, new THREE.BoxGeometry(.1, .035, .02), f.glassB, 0, .06, -.047); add(p, new THREE.BoxGeometry(.15, .02, .1), base.metal, 0, .1, 0);
  }
  const sight = new THREE.Group(); sight.position.set(0, .4, -1.32); turret.add(sight);                      // the main sight, on the front slope
  add(sight, new THREE.BoxGeometry(.5, .26, .24), m.camo, 0, 0, 0); add(sight, new THREE.BoxGeometry(.54, .05, .26), base.metal, 0, .15, 0);
  for (const sx of [-1, 1]) { add(sight, new THREE.CylinderGeometry(.075, .075, .1, 12), base.dark, sx * .13, 0, -.16).rotation.x = PI / 2; add(sight, new THREE.CylinderGeometry(.052, .052, .02, 12), f.glassB, sx * .13, 0, -.215).rotation.x = PI / 2; }
  add(sight, new THREE.BoxGeometry(.12, .1, .06), base.dark, 0, -.02, -.14);
  // recessed panels: a dark plate inside a thin frame, on the crown's back and the shell's sides; a vent grille; an aerial on its sprung mount
  const panel = (x, z, w, d) => {
    onDome(add(turret, new THREE.BoxGeometry(w, .02, d), base.dark), x, z, .015);
    for (const [dx, dz, ww, dd] of [[0, d / 2, w + .03, .025], [0, -d / 2, w + .03, .025], [w / 2, 0, .025, d], [-w / 2, 0, .025, d]]) onDome(add(turret, new THREE.BoxGeometry(ww, .03, dd), m.camo), x + dx, z + dz, .022);
  };
  panel(.0, 1.3, .55, .34); panel(.38, -.05, .26, .3); panel(-.35, .05, .24, .26);
  for (let i = 0; i < 5; i++) onDome(add(turret, new THREE.BoxGeometry(.3, .018, .028), base.metal), 0, 1.3 + (i - 2) * .06, .035);
  for (const [sx, zz] of [[1, -.6], [-1, -.6], [1, .5], [-1, 1.3]]) for (const dz of [-.18, .18]) add(turret, new THREE.BoxGeometry(.03, .22, .3), base.dark, sx * 1.045, .22, zz + dz * .0).scale.set(1, 1, .45); // side panel plates (partly under the arms)
  add(turret, new THREE.CylinderGeometry(.045, .05, .08, 8), base.metal, .55, domeY(.55, .0) + .02, .0);        // the aerial's mount
  add(turret, new THREE.CylinderGeometry(.008, .008, 1.0, 4), base.metal, .55, domeY(.55, .0) + .55, .0);
  add(turret, new THREE.BoxGeometry(.1, .3, .22), base.rim, -1.03, .3, .95);                                      // jerry can on the left side
  add(turret, new THREE.BoxGeometry(.06, .06, .14), base.metal, -1.07, .48, .95);
  const gun = new THREE.Group(); gun.name = 'gun'; turret.add(gun); // (nothing to see: the game moves it for recoil)

  // ---- the flame arms: a slab on each side of the turret, on an armoured hinge housing with two hydraulic pistons, windows, a sooted front and two trumpet nozzles
  for (const [name, s] of [['L', -1], ['R', 1]]) {
    const arm = new THREE.Group(); arm.name = 'arm' + name; arm.position.set(s * 1.15, .5, .75); turret.add(arm);
    // the hinge housing, fixed to the turret: an armoured block round the pivot, bolts, a thick pin, a cap
    add(turret, new THREE.BoxGeometry(.5, .62, .62), m.camo, s * 1.0, .5, .75);
    add(turret, new THREE.CylinderGeometry(.24, .24, .08, 18), base.dark, s * 1.275, .5, .75).rotation.z = PI / 2;
    for (let i = 0; i < 8; i++) { const a = i / 8 * PI * 2; add(turret, new THREE.CylinderGeometry(.02, .02, .05, 6), base.metal, s * 1.31, .5 + Math.cos(a) * .19, .75 + Math.sin(a) * .19).rotation.z = PI / 2; }
    add(turret, new THREE.CylinderGeometry(.09, .09, .22, 12), base.metal, s * 1.3, .5, .75).rotation.z = PI / 2;
    // two hydraulic pistons from brackets on the turret's flank to brackets on the arm: a thick sleeve, a thin chrome rod
    for (const [y0, y1, z0, z1] of [[.26, .34, .15, -.5], [.78, .7, .3, -.3]]) {
      const a = V(s * .98, y0, z0 + .0), b = V(s * 1.2, y1, z1), mid = a.clone().lerp(b, .5);
      add(turret, new THREE.BoxGeometry(.12, .14, .12), base.metal, a.x, a.y, a.z); add(turret, new THREE.BoxGeometry(.1, .12, .1), base.metal, b.x, b.y, b.z);
      rod(turret, a, mid, .052, base.dark); rod(turret, mid, b, .026, f.steel);
    }
    // the slab, its dark rail, spine and cap; windows and warning panels down the outer face; a name plate
    add(arm, new THREE.BoxGeometry(.34, .44, 3.0), m.camo, 0, 0, -1.1);
    add(arm, new THREE.BoxGeometry(.3, .08, 3.0), base.dark, 0, -.26, -1.1);
    add(arm, new THREE.BoxGeometry(.38, .1, 1.7), m.camo, 0, .24, -.6);
    add(arm, new THREE.BoxGeometry(.4, .46, .08), base.dark, 0, 0, .42);
    for (let i = 0; i < 4; i++) { add(arm, new THREE.BoxGeometry(.02, .15, .15), i % 2 ? f.yellow : f.black, s * .175, .05, -.1 - i * .5); add(arm, new THREE.BoxGeometry(.015, .17, .17), base.metal, s * .172, .05, -.1 - i * .5); }
    add(arm, new THREE.BoxGeometry(.02, .1, .6), base.dark, s * .175, -.15, -.5);
    // the front end: a shroud sooted from orange to black toward the tip, then two trumpet nozzles, sooted too, each with a pilot burner
    add(arm, new THREE.BoxGeometry(.36, .46, .6), mud.sootPaint, 0, 0, -2.88);
    for (const [k, y, dx, z] of [[0, .12, .02, -3.35], [1, -.12, -.02, -3.2]]) {
      const cone = add(arm, new THREE.CylinderGeometry(.05, .14, .45, 10), mud.sootMetal, dx, y, z); cone.rotation.x = -PI / 2; // (wide at the arm, narrow at the tip)
      const tube = add(arm, new THREE.CylinderGeometry(.04, .04, .6, 8), mud.sootMetal, dx, y, z - .5); tube.rotation.x = PI / 2;
      add(arm, new THREE.CylinderGeometry(.06, .06, .05, 8), mud.sootMetal, dx, y, z - .82).rotation.x = PI / 2;
      add(arm, new THREE.CylinderGeometry(.012, .012, .1, 6), base.metal, dx, y + .055, z - .84);                    // the pilot burner's pipe
      const pilot = add(arm, new THREE.ConeGeometry(.032, .14, 6), f.pilot, dx, y + .14, z - .84); pilot.rotation.x = PI / 2 + .35;
      if (k === 0) { pilot.name = 'pilot' + name; const mz = new THREE.Object3D(); mz.name = 'muzzle' + name; mz.position.set(dx, y, z - .9); arm.add(mz); }
    }
  }
  const muzzle = new THREE.Object3D(); muzzle.name = 'muzzle'; muzzle.position.set(0, .64, -3.7); turret.add(muzzle);

  // ---- finish: every part's position in the tank's space, then the muddy / triplanar copies of the materials in place of the plain ones
  addRootAttrs(root);
  const swap = new Map([[f.paint, mud.paint], [base.rubber, mud.rubber], [base.tyre, mud.tyre], [base.wheel, mud.wheel], [base.metal, mud.metal], [base.dark, mud.dark], [base.rim, mud.rim], [base.wood, mud.wood], [f.steel, mud.steel], [f.black, mud.black]]);
  root.traverse(o => { if (o.isMesh && !o.isInstancedMesh && swap.has(o.material)) o.material = swap.get(o.material); });
  root.traverse(o => { if (o.isMesh && o.parent?.name === 'tracks') o.material = Object.assign(muddied(o.material), { map: o.material.map }); }); // (the flat tread keeps its map, which scrolls)
  for (const n of ['armL', 'armR']) mergeStatic(root.getObjectByName(n)); // (the turret and its arms are named parts the game leaves alone: merge their plain pieces here, a draw call per material instead of one per piece)
  mergeStatic(turret);
  root.scale.setScalar(MEDIUM_SCALE);
  return root;
}
