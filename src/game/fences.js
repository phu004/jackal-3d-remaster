// Stage 5's wire fences (the NES's chain-link, in three places) and their steel gates.
//
//   - a fence: steel posts every couple of metres, a rail along the top and the bottom, and chain-link between them (a diamond lattice on a see-through panel, seen from either side);
//     the jeep and the men cannot pass it, shots go through;
//   - a gate: two stout pillars, a pair of riveted steel leaves with a crenellated top, and a dark seam between them; it stops everything.
//
// buildFences(scene, { fences: [{ x0, x1, z, thick }], gates: [...same], heightAt }): x0..x1 and z in metres (the run's two ends, the centre line across it).
import * as THREE from 'three';
import { mergeStatic } from './optimize.js';

const FENCE_H0 = 2.6, POST_SPACING = 2.4, GATE_H = 3.0; // (the compound walls' own height: 2.6 m)

let plateTex = null;
export function chainLink(C = 128) { // a tile of 4 x 4 diamonds (C px a diamond), each wire its own grey, a few rusted, and a dark edge to every wire; see-through between the wires
  const N = 4, S = N * C, k = C / 64, c = document.createElement('canvas'); c.width = c.height = S; const x = c.getContext('2d');
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647; // (the same wires at every size)
  const wire = (x0, y0, x1, y1, col) => { x.strokeStyle = 'rgba(30,32,36,.85)'; x.lineWidth = 5.2 * k; x.beginPath(); x.moveTo(x0, y0 + 1.5 * k); x.lineTo(x1, y1 + 1.5 * k); x.stroke(); x.strokeStyle = col; x.lineWidth = 3.2 * k; x.beginPath(); x.moveTo(x0, y0); x.lineTo(x1, y1); x.stroke(); x.strokeStyle = 'rgba(255,255,255,.28)'; x.lineWidth = k; x.beginPath(); x.moveTo(x0, y0 - k); x.lineTo(x1, y1 - k); x.stroke(); }; // (a dark underside, the wire, a glint)
  const tone = () => { const rust = rnd() < .14, g = 150 + rnd() * 50; return rust ? `rgb(${130 + rnd() * 40 | 0},${88 + rnd() * 30 | 0},${60 + rnd() * 20 | 0})` : `rgb(${g | 0},${g + 3 | 0},${g + 8 | 0})`; };
  const e = 3 * k;
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { // the two diagonals of every diamond cell, run on a little into the next so the wires join
    const x0 = i * C, y0 = j * C; wire(x0 - e, y0 - e, x0 + C + e, y0 + C + e, tone()); wire(x0 - e, y0 + C + e, x0 + C + e, y0 - e, tone());
  }
  return c;
}
function steelPlate() { // a riveted steel leaf: grey, a border, rivets, a few scratches and rust streaks
  if (plateTex) return plateTex;
  const S = 256, c = document.createElement('canvas'); c.width = c.height = S; const x = c.getContext('2d');
  x.fillStyle = '#8b8f92'; x.fillRect(0, 0, S, S);
  for (let i = 0; i < 700; i++) { x.fillStyle = Math.random() < .5 ? 'rgba(255,255,255,.05)' : 'rgba(0,0,0,.06)'; x.fillRect(Math.random() * S, Math.random() * S, 2 + Math.random() * 6, 1); }
  x.strokeStyle = 'rgba(40,42,44,.8)'; x.lineWidth = 4; x.strokeRect(10, 10, S - 20, S - 20); x.strokeStyle = 'rgba(210,214,216,.4)'; x.lineWidth = 2; x.strokeRect(14, 14, S - 28, S - 28);
  for (let i = 0; i < 8; i++) for (const yy of [22, S - 22]) { x.fillStyle = '#5c6062'; x.beginPath(); x.arc(22 + i * (S - 44) / 7, yy, 3, 0, 7); x.fill(); x.fillStyle = 'rgba(255,255,255,.35)'; x.fillRect(21 + i * (S - 44) / 7, yy - 2, 2, 2); }
  for (let i = 0; i < 5; i++) { const sx = 30 + Math.random() * (S - 60), g = x.createLinearGradient(sx, 20, sx, 120 + Math.random() * 110); g.addColorStop(0, 'rgba(110,70,40,.35)'); g.addColorStop(1, 'rgba(110,70,40,0)'); x.fillStyle = g; x.fillRect(sx, 20, 5 + Math.random() * 9, 230); }
  plateTex = new THREE.CanvasTexture(c); plateTex.anisotropy = 8;
  return plateTex;
}

const WIRE_R = .24, WIRE_PITCH = .32; // the razor-wire coil, as on the compound walls
export function razorCoil(g, x0, x1, y, z, mat) {
  const len = x1 - x0, helix = new THREE.Curve();
  helix.getPoint = t => { const a = t * len / WIRE_PITCH * Math.PI * 2; return new THREE.Vector3(x0 + t * len, y + Math.sin(a) * WIRE_R, z + Math.cos(a) * WIRE_R); };
  const wire = new THREE.Mesh(new THREE.TubeGeometry(helix, Math.ceil(len / WIRE_PITCH * 5), .014, 3, false), mat); wire.castShadow = false; g.add(wire);
}

export function buildFences(scene, { fences = [], gates = [], heightAt = () => 0 }) {
  const steel = new THREE.MeshStandardMaterial({ color: 0x8a8e92, roughness: .55, metalness: .5, envMapIntensity: .3 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x3a3d40, roughness: .7, metalness: .4 });
  const concrete = new THREE.MeshStandardMaterial({ color: 0x61656a, roughness: .9 }); // (a cool grey: the warm light turned the old one sandy)
  const wireMat = new THREE.MeshStandardMaterial({ color: 0x55585a, roughness: .45, metalness: .8, envMapIntensity: .6 });
  const plate = new THREE.MeshStandardMaterial({ map: steelPlate(), roughness: .6, metalness: .35, envMapIntensity: .3 });
  const out = [];
  const make = () => {
    const g = new THREE.Group();
    g.box = (w, h, d, mat, x, y, z, cast = true) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); m.castShadow = cast; m.receiveShadow = true; g.add(m); return m; };
    return g;
  };
  const finish = g => { mergeStatic(g); scene.add(g); out.push(g); }; // (one merged mesh per run: each is culled on its own)

  for (const f of fences) {
    const g = make(), box = g.box, len = f.x1 - f.x0, cx = (f.x0 + f.x1) / 2, y0 = heightAt(cx, f.z), FENCE_H = f.h ?? FENCE_H0; // (f.h: a taller fence than the usual)
    const mat = new THREE.MeshStandardMaterial({ map: new THREE.CanvasTexture(chainLink()), alphaTest: .3, alphaToCoverage: true, side: THREE.DoubleSide, // (alphaToCoverage: with antialiasing on, the wires' edges fade smoothly instead of cutting hard; the low alphaTest still cuts them without it)
       roughness: .5, metalness: .6, envMapIntensity: .3 });
    mat.map.wrapS = mat.map.wrapT = THREE.RepeatWrapping; mat.map.anisotropy = 16; mat.map.repeat.set(len / 1.04, (FENCE_H - .3) / 1.04);
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(len, FENCE_H - .3), mat); panel.position.set(cx, y0 + .2 + (FENCE_H - .3) / 2, f.z); panel.castShadow = false; g.add(panel);
    box(len, .07, .07, steel, cx, y0 + FENCE_H - .06, f.z); box(len, .05, .05, steel, cx, y0 + .2, f.z); box(len, .04, .04, steel, cx, y0 + FENCE_H * .5, f.z, false); // top, bottom and middle rails
    box(len, .22, .46, concrete, cx, y0 + .11, f.z); // a concrete footing strip the fence stands in
    const n = Math.max(1, Math.round(len / POST_SPACING));
    for (let i = 0; i <= n; i++) {
      const px = f.x0 + len * i / n, end = i === 0 || i === n, w = end ? .22 : .14;
      box(w, FENCE_H + .1, w, steel, px, y0 + (FENCE_H + .1) / 2, f.z); box(w + .08, .06, w + .08, dark, px, y0 + FENCE_H + .1, f.z, false); // post and cap
      for (const hy of [.55, FENCE_H * .5, FENCE_H - .45]) box(w + .05, .05, w + .05, dark, px, y0 + hy, f.z, false); // collars the wire is tied to
      box(.05, .62, .05, dark, px, y0 + FENCE_H + .1 + .3, f.z, false); // the post the razor wire is hung from
      if (!end) box(.34, .4, .34, concrete, px, y0 + .2, f.z); // the post's concrete foot
    }
    for (const [pa, pb] of [[f.x0, f.x0 + len / n], [f.x1, f.x1 - len / n]]) { // a diagonal brace in the end bays
      const dx = pb - pa, dy = FENCE_H - .45, L = Math.hypot(dx, dy), b = box(L, .035, .035, steel, (pa + pb) / 2, y0 + .2 + dy / 2, f.z + .02, false); b.rotation.z = Math.atan2(dy, dx);
    }
    razorCoil(g, f.x0, f.x1, y0 + FENCE_H + .42, f.z, wireMat); // the coiled razor wire along the top, as on the concrete walls
    finish(g);
  }

  for (const gt of gates) {
    const g = make(), box = g.box, len = gt.x1 - gt.x0, cx = (gt.x0 + gt.x1) / 2, y0 = heightAt(cx, gt.z), P = 1.3;
    for (const sx of [gt.x0 + P / 2, gt.x1 - P / 2]) { box(P, GATE_H + .5, 1.2, concrete, sx, y0 + (GATE_H + .5) / 2, gt.z); box(P + .2, .22, 1.4, steel, sx, y0 + GATE_H + .5 + .11, gt.z); } // pillars, with caps
    const leaf = (len - 2 * P) / 2 - .05;
    for (const k of [-1, 1]) { // the two leaves
      const lx = cx + k * (leaf / 2 + .05), m = new THREE.Mesh(new THREE.BoxGeometry(leaf, GATE_H - .1, .3), plate); m.position.set(lx, y0 + (GATE_H - .1) / 2 + .05, gt.z); m.castShadow = m.receiveShadow = true; g.add(m);
      for (let i = 0, nt = Math.max(3, Math.round(leaf / .55)); i < nt; i++) box(.3, .22, .32, steel, lx - leaf / 2 + (i + .5) * leaf / nt, y0 + GATE_H + .05, gt.z); // the crenellated top
      box(leaf, .1, .36, dark, lx, y0 + GATE_H * .5, gt.z, false); box(leaf, .1, .36, dark, lx, y0 + .5, gt.z, false); // cross-braces
    }
    box(.14, GATE_H - .2, .36, dark, cx, y0 + (GATE_H - .2) / 2 + .05, gt.z); // the seam between the leaves
    box(.4, .5, .12, dark, cx - .45, y0 + GATE_H * .45, gt.z + .24); box(.4, .5, .12, dark, cx + .45, y0 + GATE_H * .45, gt.z + .24, false);
    finish(g);
  }
  return out;
}
