// River gunboat (placeholder). A ~6.8 m green patrol boat with a pointed bow, a small wheelhouse
// aft and a twin-barrelled deck gun on the foredeck, after the NES sprite.
// Origin on the waterline at mid-length; the bow faces -Z. Named parts: `hull` (the whole boat, rocks on
// the water) containing `turret` (turns, carries `muzzle`).
import * as THREE from 'three';
import { add, mat, cached, PI, canvasTexture, seededRandom } from './common.js';

const LEN = 6.8, BEAM = 2.4;
const pmat = (c, r, m, o) => mat(c, r, m, Object.assign({ envMapIntensity: .35 }, o));

// Top-view outline: square-ish transom at y = -LEN/2, curving into a point at y = +LEN/2 (the bow).
function hullShape(len, beam) {
  const s = new THREE.Shape(), x = beam / 2, y = len / 2;
  s.moveTo(-x + .25, -y);
  s.lineTo(x - .25, -y); s.quadraticCurveTo(x, -y, x, -y + .25);
  s.lineTo(x, y * .15);
  s.quadraticCurveTo(x, y * .75, 0, y);
  s.quadraticCurveTo(-x, y * .75, -x, y * .15);
  s.lineTo(-x, -y + .25); s.quadraticCurveTo(-x, -y, -x + .25, -y);
  return s;
}
// Lay a top-view extrusion flat: shape +y becomes -Z (the bow), the extrusion runs upward from y0.
function slab(parent, shape, depth, material, y0, bevel = .06) {
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 16 });
  const m = add(parent, g, material, 0, y0, 0);
  m.rotation.x = -PI / 2;
  return m;
}

// ---- camouflage: soft-edged olive / brown / tan / dark-green blotches on an olive base, tiling (blobs are drawn again over each edge); UVs are in metres on the hull and deck, 0..1 on a box face ----
export const CAMO_GREEN = { seed: 5, base: '#4a7a34', blobs: [['#2f5a26', 4, 95], ['#6a9648', 3, 80], ['#6b5a3a', 2, 70]] };
function camoCanvas(bump, pal) {
  const S = 512, c = document.createElement('canvas'); c.width = c.height = S; const x = c.getContext('2d'), rnd = seededRandom(pal.seed);
  x.fillStyle = bump ? '#808080' : pal.base; x.fillRect(0, 0, S, S);
  if (!bump) {
    const blob = (cx, cy, r, col) => {
      const pts = Array.from({ length: 9 }, (_, k) => { const a = k / 9 * 6.283, rr = r * (.55 + rnd() * .75); return [Math.cos(a) * rr, Math.sin(a) * rr * (.6 + rnd() * .5)]; });
      for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) {
        x.fillStyle = col; x.beginPath();
        pts.forEach((q, k) => { const n = pts[(k + 1) % pts.length], mx = cx + ox + (q[0] + n[0]) / 2, my = cy + oy + (q[1] + n[1]) / 2; if (k === 0) x.moveTo(mx, my); else x.quadraticCurveTo(cx + ox + q[0], cy + oy + q[1], mx, my); });
        x.closePath(); x.fill();
      }
    };
    for (const [col, n, r] of pal.blobs) for (let k = 0; k < n; k++) blob(rnd() * S, rnd() * S, r * (.7 + rnd() * .6), col);
  }
  for (let k = 0; k < 9000; k++) { x.fillStyle = rnd() > .5 ? 'rgba(255,255,255,.04)' : 'rgba(0,0,0,.05)'; x.fillRect(rnd() * S, rnd() * S, 1 + rnd() * 2, 1 + rnd() * 2); }
  return c;
}
// a camouflaged material for a palette (rx, ry: texture repeats per metre on the hull and deck, per face on a box)
export const camoMaterial = (pal, rx, ry, rough, metal) => {
  const map = canvasTexture(camoCanvas(false, pal), rx, ry), bump = canvasTexture(camoCanvas(true, pal), rx, ry);
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, map, bumpMap: bump, bumpScale: .6, roughness: rough, metalness: metal, envMapIntensity: .35 });
  m.userData.camo = [rx, ry, rough, metal]; return m;
};
const textured = (make, rx, ry, rough, metal) => camoMaterial(CAMO_GREEN, rx, ry, rough, metal);

export function buildGunboat() {
  const t = cached('gunboatMats', () => ({
    hull: textured(null, .3, .3, .7, .15), bottom: pmat(0x1c2a1c, .8, .1), deck: textured(null, .3, .3, .85, .05),
    trim: pmat(0xd8dccb, .6, .15), cabin: textured(null, 1, 1, .7, .15), glass: pmat(0x101a1c, .15, .6),
    dark: pmat(0x1e221e, .7, .3), gun: pmat(0x4a4f4a, .4, .7), barrel: pmat(0x8a908a, .35, .75),
    tyre: pmat(0x151515, .9, 0), shield: (() => { const m = textured(null, 1, 1, .7, .15); m.side = THREE.DoubleSide; return m; })(),
  }));
  const root = new THREE.Group(); root.name = 'gunboat';
  const hull = new THREE.Group(); hull.name = 'hull'; root.add(hull); // rocks on the water as one piece

  // hull: dark bottom below the waterline, green sides, a pale rubbing strake and the deck
  slab(hull, hullShape(LEN - .3, BEAM - .3), .5, t.bottom, -.6);
  slab(hull, hullShape(LEN, BEAM), .75, t.hull, -.15);
  slab(hull, hullShape(LEN + .06, BEAM + .06), .06, t.trim, .5, .03);
  slab(hull, hullShape(LEN - .35, BEAM - .35), .04, t.deck, .67, 0); // sits just above the hull's top face (.66), no z-fighting

  // wheelhouse aft of midships, with dark windows round it and a mast on top
  add(hull, new THREE.BoxGeometry(1.5, .95, 1.7), t.cabin, 0, 1.15, .9);
  add(hull, new THREE.BoxGeometry(1.7, .08, 1.9), t.cabin, 0, 1.66, .85);                     // roof
  add(hull, new THREE.BoxGeometry(1.36, .3, .04), t.glass, 0, 1.35, .04);                    // front windows
  [-1, 1].forEach(s => add(hull, new THREE.BoxGeometry(.04, .3, 1.2), t.glass, s * .76, 1.35, .95));
  add(hull, new THREE.CylinderGeometry(.03, .04, 1.2, 6), t.dark, .4, 2.3, 1.2);             // mast
  add(hull, new THREE.BoxGeometry(.5, .04, .04), t.dark, .4, 2.55, 1.2);                     // yard
  add(hull, new THREE.CylinderGeometry(.18, .18, .12, 12), t.trim, -.35, 1.76, 1.3);         // searchlight

  // engine hatch and twin outboard housings at the stern
  add(hull, new THREE.BoxGeometry(1.4, .14, .8), t.dark, 0, .72, 2.5);
  [-.5, .5].forEach(x => {
    add(hull, new THREE.BoxGeometry(.4, .55, .45), t.dark, x, .55, LEN / 2 + .1);
    add(hull, new THREE.BoxGeometry(.12, .7, .18), t.dark, x, -.1, LEN / 2 + .2);
  });
  // rails along both sides of the foredeck, fenders (old tyres) over the sides
  [-1, 1].forEach(s => {
    for (let z = -2.2; z <= .1; z += .55) add(hull, new THREE.CylinderGeometry(.02, .02, .35, 5), t.trim, s * (BEAM / 2 - .2) * (z < -1.5 ? .8 : 1), .82, z);
    const rail = add(hull, new THREE.CylinderGeometry(.022, .022, 2.4, 5), t.trim, s * (BEAM / 2 - .22), .99, -1.05);
    rail.rotation.x = PI / 2;
    [-.6, 1.6].forEach(z => {
      const f = add(hull, new THREE.TorusGeometry(.17, .07, 6, 12), t.tyre, s * (BEAM / 2 + .06), .2, z);
      f.rotation.y = PI / 2;
    });
  });

  // deck gun on the foredeck: a ring mount, a shield and twin barrels
  add(hull, new THREE.CylinderGeometry(.5, .55, .2, 16), t.dark, 0, .74, -1.5);
  const turret = new THREE.Group(); turret.name = 'turret'; turret.position.set(0, .84, -1.5); hull.add(turret);
  add(turret, new THREE.CylinderGeometry(.38, .42, .35, 14), t.gun, 0, .18, 0);
  const shield = add(turret, new THREE.CylinderGeometry(.55, .55, .5, 14, 1, true, -PI * .45, PI * .9), t.shield, 0, .45, 0);
  shield.rotation.y = PI; // open at the back, wrapped round the front
  [-.12, .12].forEach(x => {
    add(turret, new THREE.CylinderGeometry(.05, .06, 1.3, 8), t.barrel, x, .45, -.85).rotation.x = PI / 2;
    add(turret, new THREE.CylinderGeometry(.08, .08, .14, 8), t.dark, x, .45, -1.5).rotation.x = PI / 2;
  });
  const muzzle = new THREE.Object3D(); muzzle.name = 'muzzle'; muzzle.position.set(0, .45, -1.6); turret.add(muzzle);
  return root;
}
