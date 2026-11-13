// Submarine (placeholder), after the NES sprite: a long, slim dark-grey cigar hull (13 m) that starts
// submerged, surfaces to show the top half of the hull and opens a single vertical launch hatch on the foredeck.
// Origin on the waterline at mid-length; the bow faces -Z.
// Named parts: `hull` (the whole boat, moves up/down), `hatch` (the silo cover), `rack` (lifts the loaded
// `missile0` out of the silo), `muzzle0` (launch point: local -Z points straight up), `foam` (ring of foam dots).
// Drive it with poseSubmarine(root, surface, hatch): surface 0 = submerged .. 1 = surfaced,
// hatch 0 = closed .. 1 = cover open and missile raised, ready to fire.
import * as THREE from 'three';
import { add, mat, cached, PI, roundedRect, canvasTexture, seededRandom } from './common.js';

const SUB_LEN = 13, SUB_R = .8, SURFACED_Y = -.1, DIVED_Y = -2.3;

// ---- procedural surface detail (canvas textures, kept subtle so the hull still reads as one smooth painted shell)
// The lathe's u runs round the hull (top at u = .5, waterline near .27/.73), v runs along it,
// so on the canvas x = round the hull and y = along it.
const HULL_NUMBERS = ['SSN 688', 'SSN 701', 'SSN 715', 'SSN 692'], HULL_PAINT = [['#16191c', '#07080a'], ['#1a1c20', '#0a0b0e'], ['#151a1a', '#060a0a'], ['#1c1b19', '#0b0a09']]; // the variants: each boat its own number and shade of paint (and its own weathering)
export const SUB_VARIANTS = HULL_NUMBERS.length;
function hullCanvas(bump, base = '#16191c', v = 0) {
  const W = 512, H = 2048, rnd = seededRandom(bump ? 7 : 7 + v * 13);
  const c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d');
  x.fillStyle = bump ? '#808080' : base; x.fillRect(0, 0, W, H);
  if (!bump) {
    for (let k = 0; k < 70; k++) {                                                         // soft, large-scale paint mottling
      const px = rnd() * W, py = rnd() * H, r = 60 + rnd() * 140, g = x.createRadialGradient(px, py, 0, px, py, r), v = rnd() > .5 ? 255 : 0;
      g.addColorStop(0, `rgba(${v},${v},${v},.05)`); g.addColorStop(1, `rgba(${v},${v},${v},0)`); x.fillStyle = g; x.fillRect(px - r, py - r, 2 * r, 2 * r);
    }
  }
  for (let i = 0; i < 50000; i++) {                                                        // very fine grain
    const v = rnd() > .5 ? 255 : 0; x.fillStyle = `rgba(${v},${v},${v},${bump ? .06 : .025})`; x.fillRect(rnd() * W, rnd() * H, 1, 1 + rnd() * 2);
  }
  // weathering: light scuffs (bare metal) mostly round the waterline and along the deck, pitted in the bump map.
  // Their places come from their own random stream, so the colour and bump maps agree.
  const wr = seededRandom(bump ? 23 : 23 + v * 29), chips = [];
  for (let k = 0; k < 40; k++) {
    const zone = wr(), cx = zone < .55 ? W * (wr() < .5 ? .27 : .73) + (wr() - .5) * W * .16 : zone < .75 ? W * .5 + (wr() - .5) * W * .3 : wr() * W;
    chips.push({ cx, cy: wr() * H, s: 1.5 + wr() * wr() * 8, rust: false, a: wr() });
  }
  for (const c of chips) {
    x.fillStyle = bump ? '#3c3c3c' : `rgba(120,128,128,${.15 + c.a * .2})`;
    for (let n = 0; n < 3; n++) x.fillRect(c.cx + (n - 1) * c.s * .5, c.cy + (n % 2) * c.s * .3, c.s * (1.2 - n * .25), c.s * (.5 + c.a * .5)); // (an irregular little cluster)
  }
  if (!bump) {
    for (let k = 0; k < 5; k++) {                                                         // faded patches of paint
      const px = wr() * W, py = wr() * H, r = 25 + wr() * 70, g = x.createRadialGradient(px, py, 0, px, py, r), dark = wr() < .4;
      g.addColorStop(0, dark ? 'rgba(0,0,0,.08)' : 'rgba(150,165,175,.07)'); g.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = g; x.fillRect(px - r, py - r, 2 * r, 2 * r);
    }
    for (let k = 0; k < 8; k++) {                                                         // dry salt stains just above the waterline
      const side = wr() < .5 ? .27 : .73, px = W * (side + (side < .5 ? 1 : -1) * wr() * .09), py = wr() * H, r = 6 + wr() * 22, g = x.createRadialGradient(px, py, 0, px, py, r);
      g.addColorStop(0, 'rgba(215,212,196,.14)'); g.addColorStop(1, 'rgba(215,212,196,0)'); x.fillStyle = g; x.fillRect(px - r, py - r, 2 * r, 2 * r);
    }
  }
  if (!bump) {
    x.save(); x.fillStyle = 'rgba(214,218,214,.85)'; x.font = 'bold 54px "Arial Narrow", Arial, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    for (const [cx, rot] of [[W * .36, Math.PI / 2], [W * .64, -Math.PI / 2]]) { x.save(); x.translate(cx, H * .42); x.rotate(rot); x.fillText(HULL_NUMBERS[v % HULL_NUMBERS.length], 0, 0); x.restore(); } // hull number
    x.restore();
  }
  if (!bump) {
    const wl = (cx, dir) => {                                                              // waterline: faint algae below, thin salt line on it
      const g = x.createLinearGradient(cx, 0, cx + dir * W * .2, 0);
      g.addColorStop(0, 'rgba(70,95,60,.14)'); g.addColorStop(1, 'rgba(70,95,60,0)'); x.fillStyle = g;
      x.fillRect(dir > 0 ? cx : cx - W * .2, 0, W * .2, H);
      x.fillStyle = 'rgba(200,196,180,.08)'; x.fillRect(cx - 3, 0, 6, H);
    };
    wl(W * .73, 1); wl(W * .27, -1);
    for (let k = 0; k < 6; k++) {                                                          // faint grime streaks running down the sides
      const side = rnd() > .5 ? 1 : -1, y = rnd() * H, len = W * (.06 + rnd() * .16), x0 = W / 2 + side * W * (.02 + rnd() * .1);
      const g = x.createLinearGradient(x0, 0, x0 + side * len, 0);
      g.addColorStop(0, 'rgba(0,0,0,.12)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = g; x.fillRect(Math.min(x0, x0 + side * len), y, len, 2 + rnd() * 4);
    }
  }
  return c;
}
// Everything else (fairing, sail, covers): a light, fine grain only, tinted by the material colour.
function skinCanvas(bump) {
  const S = 256, rnd = seededRandom(11);
  const c = document.createElement('canvas'); c.width = c.height = S; const x = c.getContext('2d');
  x.fillStyle = bump ? '#808080' : '#f4f4f4'; x.fillRect(0, 0, S, S);
  for (let i = 0; i < 6000; i++) { const v = rnd() > .5 ? 255 : 0; x.fillStyle = `rgba(${v},${v},${v},${bump ? .06 : .04})`; x.fillRect(rnd() * S, rnd() * S, 1 + rnd() * 2, 1 + rnd() * 2); }
  return c;
}
const srgb = t => { t.colorSpace = THREE.SRGBColorSpace; return t; }; // colour maps are sRGB; without this they render too bright
const skin = (hex, rough, metal) => new THREE.MeshStandardMaterial({
  color: hex, roughness: rough, metalness: metal,
  map: cached('subSkinMap', () => srgb(canvasTexture(skinCanvas(false), 3, 3))), bumpMap: cached('subSkinBump', () => canvasTexture(skinCanvas(true), 3, 3)), bumpScale: .25,
});
const smat = (c, r, m, o) => mat(c, r, m, Object.assign({ envMapIntensity: .35 }, o));
let bumpTex = null;
const mats = (ice = false, v = 0) => cached((ice ? 'subMatsIce' : 'subMats') + (v || ''), () => { const m = {
  hull: new THREE.MeshStandardMaterial({
    color: 0xffffff, roughness: .5, metalness: .25, bumpScale: .6,
    map: srgb(canvasTexture(hullCanvas(false, HULL_PAINT[v % HULL_PAINT.length][ice ? 1 : 0], v))), bumpMap: bumpTex ??= canvasTexture(hullCanvas(true)),
  }),
  skin: skin(0x1f2326, .55, .25), casing: skin(0x363a3d, .5, .3), dark: smat(0x121416, .7, .3),
  tube: smat(0x2a2d30, .6, .4, { side: THREE.DoubleSide }), glass: smat(0x101a1c, .15, .6),
  body: smat(0xcfd3c8, .45, .3), nose: smat(0xd04a2e, .5, .2), foam: new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false }),
};
  if (ice) for (const k of ['hull', 'skin', 'casing', 'dark', 'tube', 'glass', 'body', 'nose']) { // (the secret level's subs under the ice: matt, not shiny, and a darker paint, so the pale markings stand out through the ice)
    const q = m[k]; q.roughness = Math.min(1, q.roughness + .3); q.metalness = 0; q.envMapIntensity = .06;
    if (k !== 'hull' && k !== 'body' && k !== 'nose') q.color.multiplyScalar(.65);
  }
  return m; });
const smooth = x => { x = Math.min(1, Math.max(0, x)); return x * x * (3 - 2 * x); };

// A missile along -Z (nose at -Z), ~1.1 m long. Used in the rack and for the flying missile.
export function buildMissile() {
  const t = mats(), g = new THREE.Group(); g.name = 'missile';
  add(g, new THREE.CylinderGeometry(.07, .07, .8, 10), t.body).rotation.x = PI / 2;
  add(g, new THREE.ConeGeometry(.07, .28, 10), t.nose, 0, 0, -.54).rotation.x = -PI / 2;
  add(g, new THREE.BoxGeometry(.2, .012, .14), t.casing, 0, 0, .31);
  add(g, new THREE.BoxGeometry(.012, .2, .14), t.casing, 0, 0, .31);
  add(g, new THREE.CylinderGeometry(.073, .073, .04, 10), t.dark, 0, 0, -.2).rotation.x = PI / 2;
  add(g, new THREE.CylinderGeometry(.073, .073, .03, 10), t.casing, 0, 0, .1).rotation.x = PI / 2;
  add(g, new THREE.CylinderGeometry(.05, .06, .06, 8), t.dark, 0, 0, .42).rotation.x = PI / 2;
  return g;
}

export function buildSubmarine(opts = {}) { // opts.ice: the secret level's version, for gliding under the ice (a darker, matt paint)
  const v = opts.variant ?? 0, t = mats(!!opts.ice, v);
  const root = new THREE.Group(); root.name = 'submarine';
  const hull = new THREE.Group(); hull.name = 'hull'; root.add(hull);

  // pressure hull: a superellipse of revolution, blunt-pointed at both ends
  const pts = [];
  for (let i = 0; i <= 48; i++) {
    const u = -1 + 2 * i / 48, r = SUB_R * Math.pow(Math.max(0, 1 - Math.pow(Math.abs(u), 2.4)), 1 / 2.4);
    pts.push(new THREE.Vector2(Math.max(r, .002), u * SUB_LEN / 2));
  }
  const shell = add(hull, new THREE.LatheGeometry(pts, 32), t.hull); shell.rotation.x = PI / 2; shell.scale.set(1.21 * 1.1 * 1.15 * 1.1 * 1.1, 1.21, 1.21); // (21% bigger than the rest of the boat: the hatch, fairing and missile keep their size)

  // sail: an oval fin with periscopes (no crossbars); the ice version's stands further forward, as on a real boat, so the bow reads clearly as the front (the missile hatch is forward of it at z -3.4)
  const fin = new THREE.Group(); fin.name = 'sail'; fin.position.set(0, .65, opts.ice ? -1.2 : 1.4); fin.scale.set(1.38 * 1.2 * 1.2 * 1.1 * (1 + (v % 3 - 1) * .06), 1.38 * (1 + (v % 3 - 1) * .05), 1.38 * (1 + (v % 2) * .06)); hull.add(fin); // the whole sail 38% bigger, about its footing
  const sail = add(fin, new THREE.CylinderGeometry(.3, .4, .9, 20), t.skin, 0, .45, 0); sail.scale.z = 2.8;
  const roof = add(fin, new THREE.CylinderGeometry(.32, .32, .05, 20), t.casing, 0, .92, 0); roof.scale.z = 2.8;
  const band = add(fin, new THREE.CylinderGeometry(.315, .355, .12, 20), t.glass, 0, .63, 0); band.scale.z = 2.8;
  add(fin, new THREE.CylinderGeometry(.025, .025, .7, 6), t.dark, .12, 1.25, -.3);
  add(fin, new THREE.CylinderGeometry(.04, .04, .1, 8), t.dark, .12, 1.63, -.3);
  add(fin, new THREE.CylinderGeometry(.025, .025, .5, 6), t.dark, -.12, 1.17, .3);

  // stern: dive planes (at the waterline, so they only show when diving), rudder, ducted prop
  add(hull, new THREE.BoxGeometry(1.7, .05, .6), t.casing, 0, 0, 5.4);
  add(hull, new THREE.BoxGeometry(.05, .9, .6), t.casing, 0, .15, 5.5);
  add(hull, new THREE.TorusGeometry(.24, .045, 8, 18), t.dark, 0, 0, 6.3);
  add(hull, new THREE.CylinderGeometry(.07, .07, .3, 8), t.dark, 0, 0, 6.3).rotation.x = PI / 2;

  // foredeck missile casing: a low rounded-rectangle fairing (soft corners, bevelled top edge) that
  // sits on the hull, with a single flush hatch over one vertical launch silo
  const bz = -3.4; // (the launch unit's fairing, silo and hatch are 27.75% shorter along the hull than originally)
  const slab = (parent, w, d, r, depth, y0, material, bevel, x = 0, z = 0) => {
    const g = new THREE.ExtrudeGeometry(roundedRect(w, d, r), { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 4, curveSegments: 12 });
    const m = add(parent, g, material, x, y0, z); m.rotation.x = -PI / 2; return m;
  };
  slab(hull, .95 * 1.15, 1.7 * .7225 * 1.15, .26 * 1.15, .4, .45, t.skin, .1, 0, bz);                    // fairing, top at y = .95 (raised .15: the bigger hull is higher under it)
  slab(hull, .46 * 1.15, .64 * .7225 * 1.15, .07 * 1.15, .01, .95, t.dark, 0, 0, bz);                    // dark silo opening (hidden by the cover)
  const hatch = new THREE.Group(); hatch.name = 'hatch'; hatch.position.set(-.25 * 1.15, .98, bz); hatch.scale.setScalar(1.15); hull.add(hatch); // hinged on the port side
  slab(hatch, .5, .7 * .7225, .08, .03, 0, t.casing, .008, .25, 0);                // cover
  slab(hatch, .36, .52 * .7225, .05, .01, .04, t.skin, 0, .25, 0);                 // raised panel on the cover
  add(hatch, new THREE.BoxGeometry(.07, .06, .16), t.dark, -.02, .01, 0);   // hinge block
  const mz = new THREE.Object3D(); mz.name = 'muzzle0'; mz.position.set(0, 1, bz); mz.rotation.x = PI / 2; hull.add(mz); // fires straight up
  const rack = new THREE.Group(); rack.name = 'rack'; rack.position.set(0, 0, bz); hull.add(rack); // lifts the missile when the hatch opens
  const m = buildMissile(); m.name = 'missile0'; m.scale.setScalar(1.6);
  m.rotation.x = PI / 2; m.position.set(0, -.2, 0); rack.add(m);           // nose up, just under the cover

  // foam: a ring of white dots around the waterline, like the sprite's dotted outline
  const N = 100, dots = new THREE.InstancedMesh(new THREE.CircleGeometry(.07, 6), t.foam, N), d = new THREE.Object3D();
  for (let i = 0; i < N; i++) {
    const a = i / N * PI * 2, k = .75 + .5 * ((i * 37) % 7) / 7;
    d.position.set(Math.cos(a) * 1.12, .03, Math.sin(a) * (SUB_LEN / 2 + .2)); d.rotation.set(-PI / 2, 0, 0); d.scale.setScalar(k); d.updateMatrix();
    dots.setMatrixAt(i, d.matrix);
  }
  dots.name = 'foam'; dots.renderOrder = 3; root.add(dots);

  poseSubmarine(root, 0, 0);
  return root;
}

export function poseSubmarine(root, surface, hatch) {
  const g = n => root.getObjectByName(n), s = smooth(surface);
  g('hull').position.y = DIVED_Y + (SURFACED_Y - DIVED_Y) * s;
  const open = smooth(hatch / .45);                 // cover swings open first,
  g('hatch').rotation.z = open * 1.75;
  g('rack').position.y = smooth((hatch - .45) / .55) * .65; // then the missile rises out of the silo
  g('foam').material.opacity = Math.max(0, surface - .5) * 1.6;
}
