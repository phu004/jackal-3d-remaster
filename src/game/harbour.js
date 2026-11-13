// Stage 3 (the harbour): the solid scenery that comes straight from the map's terrain, and the
// storage yard beyond the map's sides.
//  - stacked wooden crates ('B'): each run of crate cells is filled with separate crates of mixed
//    size, wood and wear, stacked one to three high, a little out of line, as a real stack would be
//  - warehouses / long buildings ('K'): boxes over their cells
//  - the yard: rows and stacks of shipping containers and piles of crates on both sides of the map,
//    clear of the water, so the harbour doesn't stop at the playfield's edge
// All solid, none can be destroyed (the terrain itself blocks: see BLOCKING in world.js). Crates and
// the yard's containers are instanced (one draw call per kind).
import { SHADOW_ONLY } from './layers.js';
import { regroup } from './optimize.js';
import * as THREE from 'three';
import { containerMaterials, CONTAINER, CONTAINER_VARIANTS } from '../assets/harbour-props.js';
import { buildBuildings } from './harbour-buildings.js';
import { buildFortress } from './fortress-buildings.js';

export const CRATE_H = 3.2, BUILDING_H = 7.5; // metres (crate stacks vary round CRATE_H)
const LASER_WALL_H = 4.5, LASER_PANEL = 3;      // the laser maze's concrete walls: height, and metres per cast panel
const CRATE_STEP = 4;                         // cells per crate (32 NES px = 5 m)

function rng(seed) {
  return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}

// Rectangles covering every cell of `ch` (greedy: widest run in a row, then as far down as it goes).
function rects(grid, ch) {
  const rows = grid.length, cols = grid[0].length, used = Array.from({ length: rows }, () => new Uint8Array(cols)), out = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    if (grid[r][c] !== ch || used[r][c]) continue;
    let c2 = c; while (c2 + 1 < cols && grid[r][c2 + 1] === ch && !used[r][c2 + 1]) c2++;
    let r2 = r;
    while (r2 + 1 < rows) { let ok = true; for (let k = c; k <= c2; k++) if (grid[r2 + 1][k] !== ch || used[r2 + 1][k]) { ok = false; break; } if (!ok) break; r2++; }
    for (let rr = r; rr <= r2; rr++) for (let k = c; k <= c2; k++) used[rr][k] = 1;
    out.push({ r0: r, r1: r2, c0: c, c1: c2 });
  }
  return out;
}

function canvasTex(size, draw, repeat = false) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c); t.anisotropy = 8;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// ---- crates ----
// Four woods: fresh pine, weathered grey-brown, army green paint, red-stained hardwood. Sides are
// planks between corner battens, with grain, nails and stencilled markings; the lid is X-braced
// (as the NES draws them). A bump map gives the planks their grooves.
const WOODS = [
  { plank: '#c98a44', dark: '#8a5824', batten: '#9a6230' },
  { plank: '#8f7a62', dark: '#5a4a3a', batten: '#6e5c48' },
  { plank: '#6b7348', dark: '#434a2c', batten: '#545b38' },
  { plank: '#9a4e2e', dark: '#5e2c18', batten: '#743a20' },
];
function crateMaterials(v) {
  const w = WOODS[v], rnd = rng(v * 31 + 7), S = 256;
  const planks = (x, boards) => {
    x.fillStyle = w.plank; x.fillRect(0, 0, S, S);
    const bh = S / boards;
    for (let b = 0; b < boards; b++) {
      const tone = (rnd() - .5) * .18;
      x.fillStyle = tone > 0 ? `rgba(255,240,210,${tone})` : `rgba(40,20,5,${-tone})`; x.fillRect(0, b * bh, S, bh);
      for (let g = 0; g < 7; g++) { x.strokeStyle = `rgba(60,30,10,${.08 + rnd() * .12})`; x.lineWidth = 1; x.beginPath(); const y = b * bh + rnd() * bh; x.moveTo(0, y); x.bezierCurveTo(S * .3, y + (rnd() - .5) * 6, S * .7, y + (rnd() - .5) * 6, S, y + (rnd() - .5) * 4); x.stroke(); } // grain
      x.fillStyle = 'rgba(30,15,5,.55)'; x.fillRect(0, b * bh, S, 2); // gap between boards
    }
  };
  const battens = x => { x.fillStyle = w.batten; for (const [a, b, c, d] of [[0, 0, S * .1, S], [S * .9, 0, S * .1, S], [0, 0, S, S * .08], [0, S * .92, S, S * .08]]) x.fillRect(a, b, c, d);
    x.fillStyle = 'rgba(20,10,0,.45)'; x.fillRect(S * .1, 0, 2, S); x.fillRect(S * .9 - 2, 0, 2, S);
    x.fillStyle = 'rgba(60,60,60,.8)'; for (const px of [S * .05, S * .95]) for (let k = 0; k < 6; k++) x.fillRect(px - 1.5, S * (.12 + k * .15), 3, 3); }; // nails
  const stencil = x => {
    if (rnd() < .35) return;
    x.globalAlpha = .55; x.fillStyle = rnd() < .5 ? '#1e1a14' : '#f0ead8'; x.font = `700 ${22 + rnd() * 10}px monospace`; x.textAlign = 'center';
    x.fillText(['FRAGILE', 'NO HOOKS', 'MACHINERY', 'THIS SIDE UP', 'KEEP DRY', 'EXPORT'][Math.floor(rnd() * 6)], S / 2, S * (.4 + rnd() * .2));
    x.font = '700 14px monospace'; x.fillText(`LOT ${Math.floor(rnd() * 9000 + 1000)}-${'ABCDKMRX'[Math.floor(rnd() * 8)]}`, S / 2, S * .72);
    x.globalAlpha = 1;
  };
  const wear = x => { for (let i = 0; i < 60; i++) { const px = rnd() * S, py = rnd() * S, r = 3 + rnd() * 14, g = x.createRadialGradient(px, py, 0, px, py, r);
    g.addColorStop(0, `rgba(30,20,10,${rnd() * .18})`); g.addColorStop(1, 'rgba(30,20,10,0)'); x.fillStyle = g; x.fillRect(px - r, py - r, 2 * r, 2 * r); } };
  const side = canvasTex(S, x => { planks(x, 6); battens(x); stencil(x); wear(x); });
  const top = canvasTex(S, x => {
    planks(x, 5);
    x.strokeStyle = w.batten; x.lineWidth = S * .1; x.beginPath(); x.moveTo(S * .12, S * .12); x.lineTo(S * .88, S * .88); x.moveTo(S * .88, S * .12); x.lineTo(S * .12, S * .88); x.stroke();
    x.strokeStyle = 'rgba(20,10,0,.4)'; x.lineWidth = 2; x.stroke();
    x.strokeStyle = w.batten; x.lineWidth = S * .1; x.strokeRect(S * .05, S * .05, S * .9, S * .9);
    wear(x);
  });
  const bump = canvasTex(S, x => { x.fillStyle = '#909090'; x.fillRect(0, 0, S, S); x.fillStyle = '#303030'; for (let b = 0; b <= 6; b++) x.fillRect(0, b * S / 6 - 1, S, 3);
    x.fillStyle = '#c8c8c8'; x.fillRect(0, 0, S * .1, S); x.fillRect(S * .9, 0, S * .1, S); });
  // shadowSide FrontSide: the shadow map is drawn from the faces turned to the sun, not the far ones. By default it is the far faces, and the ground right beside a crate's far side then sits within the depth
  // bias of the shadow caster and shows a thin lit seam; the near face is a whole crate away, so there the shadow is solid.
  const m = map => new THREE.MeshStandardMaterial({ map, bumpMap: bump, bumpScale: .04, roughness: .9, envMapIntensity: .3, shadowSide: THREE.FrontSide });
  const s = m(side), t = m(top);
  return [s, s, t, s, s, s];
}

// Crates to fill an area x0..x1, z0..z1 (metres), on a CRATE_STEP-cell grid: each its own size, a
// little out of line, stacked one to three high. Pushed as instances into `out` ([variant][] of matrices).
function fillWithCrates(out, x0, z0, x1, z1, step, rnd) {
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
  for (let x = x0; x < x1 - .5; x += step) for (let z = z0; z < z1 - .5; z += step) {
    const tw = Math.min(step, x1 - x), td = Math.min(step, z1 - z);
    if (tw < .8 || td < .8) continue; // (a thin strip still gets small crates: nothing solid left bare)
    let w = tw * (.8 + rnd() * .16), d = td * (.8 + rnd() * .16), y = 0;
    let cx = x + tw / 2 + (rnd() - .5) * (tw - w), cz = z + td / 2 + (rnd() - .5) * (td - d);
    const high = 1 + (rnd() < .55 ? 1 : 0) + (rnd() < .15 ? 1 : 0);
    for (let k = 0; k < high; k++) {
      const h = 1.5 + rnd() * 1.1, v = Math.floor(rnd() * WOODS.length);
      q.setFromAxisAngle(up, (rnd() - .5) * (k ? .3 : .16));
      m4.compose(new THREE.Vector3(cx, y + h / 2, cz), q, new THREE.Vector3(w, h, d));
      out[v].push(m4.clone());
      y += h;
      w *= .78 + rnd() * .18; d *= .78 + rnd() * .18; cx += (rnd() - .5) * .5; cz += (rnd() - .5) * .5; // the one above: a bit smaller, set down off-centre
    }
  }
}

// ---- the laser maze's walls ----
// Cast concrete panels with seams, tie holes and rain streaks, a dark weathered top and a hazard band
// at the foot. One texture repeat = one panel (LASER_PANEL wide, the full height).
function laserWallMaterials() {
  const side = canvasTex(256, (x, S) => {
    const rnd = rng(55), m = S / LASER_WALL_H; // (square texture over a panel; stretched to its width)
    x.fillStyle = '#a7a59c'; x.fillRect(0, 0, S, S);
    for (let i = 0; i < 1500; i++) { x.fillStyle = `rgba(${rnd() < .5 ? '50,48,42' : '240,238,228'},${rnd() * .07})`; x.fillRect(rnd() * S, rnd() * S, 2 + rnd() * 5, 1 + rnd() * 3); }
    x.fillStyle = 'rgba(40,38,34,.55)'; x.fillRect(0, 0, 3, S); x.fillRect(S - 3, 0, 3, S);           // seams between panels
    x.fillStyle = 'rgba(30,28,25,.6)'; for (const ty of [.3, .65]) for (const tx of [.25, .75]) { x.beginPath(); x.arc(tx * S, ty * S, 3, 0, Math.PI * 2); x.fill(); } // tie holes
    for (let i = 0; i < 14; i++) { const px = rnd() * S, len = S * (.2 + rnd() * .5), g = x.createLinearGradient(0, 0, 0, len);
      g.addColorStop(0, 'rgba(45,42,36,.35)'); g.addColorStop(1, 'rgba(45,42,36,0)'); x.fillStyle = g; x.fillRect(px, 0, 2 + rnd() * 5, len); } // streaks from the top
    const band = .45 * m; // hazard band at the foot
    x.save(); x.beginPath(); x.rect(0, S - band, S, band); x.clip();
    x.fillStyle = '#c4801a'; x.fillRect(0, S - band, S, band); x.fillStyle = '#1e1c19';
    for (let k = -S; k < S * 2; k += 28) { x.beginPath(); x.moveTo(k, S); x.lineTo(k + 14, S); x.lineTo(k + 14 + band, S - band); x.lineTo(k + band, S - band); x.fill(); }
    x.restore();
    const g = x.createLinearGradient(0, S - band - 30, 0, S - band); g.addColorStop(0, 'rgba(40,36,30,0)'); g.addColorStop(1, 'rgba(40,36,30,.3)'); x.fillStyle = g; x.fillRect(0, S - band - 30, S, 30);
  }, true);
  const top = canvasTex(128, (x, S) => { const rnd = rng(9); x.fillStyle = '#8a877e'; x.fillRect(0, 0, S, S);
    for (let i = 0; i < 800; i++) { x.fillStyle = `rgba(40,38,34,${rnd() * .12})`; x.fillRect(rnd() * S, rnd() * S, 2, 2); } }, true);
  const m = t => new THREE.MeshStandardMaterial({ map: t, roughness: .92, envMapIntensity: .3 });
  const s = m(side), t = m(top);
  return [s, s, t, t, s, s];
}
function laserWallBox(w, h, d) { // sides: u in panels, v the full height; top: metres / 4
  const g = new THREE.BoxGeometry(w, h, d), uv = g.attributes.uv, along = [d, d, w, w, w, w];
  for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) {
    const i = f * 4 + k;
    if (f === 2 || f === 3) uv.setXY(i, uv.getX(i) * w / 4, uv.getY(i) * d / 4);
    else uv.setXY(i, uv.getX(i) * along[f] / LASER_PANEL, uv.getY(i));
  }
  return g;
}

// ---- the yard beyond the map's sides ----
// Along each side, from the map's edge out to YARD m: blocks of containers (rows side by side,
// stacked one to three high, some out of line) and piles of crates, with lanes between, skipping
// wherever the map's edge is water.
const CRATE_RUN = 8; // cells a crate stack reaching the map's side carries on past it (then the yard)
function yard(containersOut, cratesOut, grid, W, L, cell, rnd, margin) {
  const rows = grid.length, cols = grid[0].length, { L: CL, W: CW, H: CH } = CONTAINER;
  // what meets this edge between z0 and z1 (with a little to spare): the yard stays clear of water,
  // quays, buildings and walls (they carry on past the edge themselves), and starts beyond crates
  const edgeHas = (z0, z1, col, chars) => {
    const r0 = Math.max(0, Math.floor((z0 + L) / cell) - 4), r1 = Math.min(rows - 1, Math.ceil((z1 + L) / cell) + 4);
    for (let r = r0; r <= r1; r++) for (let c = col - 2; c <= col + 2; c++) if (chars.includes(grid[r][Math.max(0, Math.min(cols - 1, c))])) return true;
    return false;
  };
  const wet = (z0, z1, col) => edgeHas(z0, z1, col, '~QKW');
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1);
  for (const side of [-1, 1]) {
    const col = side < 0 ? 0 : cols - 1;
    for (let z = -L - 8; z < 6;) {
      const kind = rnd(), len = kind < .62 ? CL + 1.2 : kind < .85 ? 8 + rnd() * 6 : 4 + rnd() * 6; // a block of containers, a crate pile or a gap
      if (wet(z, z + len, col) || kind > .93) { z += len; continue; }
      const edge = side * (W / 2 + (edgeHas(z, z + len, col, 'B') ? CRATE_RUN * cell : 0)); // (beyond the crates that run on past the edge)
      if (kind < .62) { // containers, end-on to the map (long axis east-west), in rows going outwards
        const n = 3 + Math.floor(rnd() * 4), across = n * (CW + .15);
        const room = margin * cell - (Math.abs(edge) - W / 2); // metres of yard out to the margin's end
        for (let i = 0; i < n; i++) for (let row = 0; row < 3; row++) { // up to three rows going outwards, while there's room
          const zz = z + .6 + i * (CW + .15) + CW / 2;
          const out = 1 + rnd() * 3 + row * (CL + 2.5), xx = edge + side * (out + CL / 2), high = 1 + Math.floor(rnd() * 3);
          if (out + CL > room - 1 || (row && rnd() < .2)) continue;
          for (let k = 0; k < high; k++) {
            const v = Math.floor(rnd() * CONTAINER_VARIANTS);
            q.setFromAxisAngle(up, (rnd() - .5) * .04 + (side > 0 ? Math.PI : 0)); // (doors toward the playfield)
            m4.compose(new THREE.Vector3(xx + (rnd() - .5) * .4, k * (CH + .03) + CH / 2 + (k ? .02 : 0), zz + (rnd() - .5) * .2), q, one); // (a hair apart, one stacked on another: no flicker; the bottom one stands right on the ground, no gap under it for the sun)
            if (row === 0) containersOut[v].push(m4.clone()); // (only the row nearest the playfield is kept: the outer rows lie beyond what the camera ever shows; they are still worked out, so the random numbers and every kept container stay as they were)
          }
        }
        z += Math.max(len, across) + 1.5 + rnd() * 4;
      } else if (kind < .85) { // a pile of crates
        const out = 1 + rnd() * 2, w = Math.min(6 + rnd() * 14, margin * cell - Math.abs(edge) + W / 2 - 4);
        fillWithCrates(cratesOut, side < 0 ? edge - out - w : edge + out, z, side < 0 ? edge - out : edge + out + w, z + len, 4.5, rnd);
        z += len + 2;
      } else z += len;
    }
  }
}

// A box's faces regrouped so each material is drawn once (a face per material is 6 draw calls a box in every pass),
// without the underside (never seen: crates and containers stand on the ground or on each other).
function compact(geo, mats, drop = [3]) {
  const idx = geo.index.array, byMat = new Map(), out = [], g2 = geo.clone();
  geo.groups.forEach((g, i) => { if (!drop.includes(i)) { const m = mats[g.materialIndex]; (byMat.get(m) ?? byMat.set(m, []).get(m)).push(g); } });
  g2.clearGroups();
  const list = [...byMat.keys()];
  list.forEach((m, mi) => { const start = out.length; for (const g of byMat.get(m)) for (let k = 0; k < g.count; k++) out.push(idx[g.start + k]); g2.addGroup(start, out.length - start, mi); });
  g2.setIndex(out);
  return [g2, list];
}

// grid: the stage's terrain rows; at(r, c): world position of a cell's north-west corner; cell: its
// size (m); W, L: the map's width and length (m).
export function buildHarbour(scene, grid, at, cell, W, L, margin = 16, avoid = [], fortressFromRow = Infinity, wet = false) { // avoid: [{ x, z }] kept clear on the roofs (the lasers) // margin: the cells painted round the map at its sides
  const group = new THREE.Group(), rnd = rng(1993);
  // crates on the map
  const crates = WOODS.map(() => []);
  const cols = grid[0].length;
  for (const { r0, r1, c0, c1 } of rects(grid, 'B')) { // (a stack reaching the map's side carries on past it a way)
    const p0 = at(r0, c0 === 0 ? -CRATE_RUN : c0), p1 = at(r1 + 1, (c1 === cols - 1 ? cols - 1 + CRATE_RUN : c1) + 1);
    fillWithCrates(crates, p0.x, p0.z, p1.x, p1.z, CRATE_STEP * cell, rnd);
  }
  // buildings
  // the laser maze's walls
  const lmats = laserWallMaterials();
  for (const m of new Set(lmats)) m.shadowSide = THREE.FrontSide; // (as the crates: the shadow is drawn from the faces turned to the sun)
  for (const { r0, r1, c0, c1 } of rects(grid, 'L')) {
    const p0 = at(r0, c0), w = (c1 - c0 + 1) * cell, d = (r1 - r0 + 1) * cell;
    const wall = new THREE.Mesh(laserWallBox(w, LASER_WALL_H, d), lmats);
    wall.position.set(p0.x + w / 2, LASER_WALL_H / 2, p0.z + d / 2); wall.castShadow = wall.receiveShadow = true; group.add(wall);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(w + .3, .3, d + .3), lmats[2]); // coping, a little proud of the faces
    cap.position.set(wall.position.x, LASER_WALL_H + .15, wall.position.z); cap.castShadow = true; group.add(cap);
  }
  // (a building reaching the map's side runs on out of sight)
  const krects = rects(grid, 'K').map(({ r0, r1, c0, c1 }) => ({ r0, r1, c0: c0 === 0 ? -margin : c0, c1: c1 === cols - 1 ? cols - 1 + margin : c1 }));
  const isK = (r, c) => r >= 0 && r < grid.length && grid[r][Math.max(0, Math.min(cols - 1, c))] === 'K'; // (past the sides: as the edge)
  const keeps = krects.filter(k => k.r0 >= fortressFromRow); // stage 6: the fortress blocks (the starting area for now) are drawn as keeps, the rest as office blocks
  const fort = keeps.length ? buildFortress(group, keeps, isK, at, cell, 6.5, W / 2 + 2, wet) : null;
  buildBuildings(group, krects.filter(k => k.r0 < fortressFromRow), isK, at, cell, BUILDING_H, avoid, (r, c) => r >= 0 && r < grid.length && c >= 0 && c < cols && grid[r][c] === 'L', W / 2 + 2); // (roof plant only where the camera can see: the map's width and a little over)
  // the yard round the map
  const containers = Array.from({ length: CONTAINER_VARIANTS }, () => []);
  yard(containers, crates, grid, W, L, cell, rnd, margin);
  // instanced: one mesh per crate wood, one per container colour
  const twins = new Map();
  const instanced = (geo, mats, list, mirror = false) => {
    if (!list.length) return;
    const [g, ms] = compact(geo, mats);
    const mesh = new THREE.InstancedMesh(g, ms, list.length);
    list.forEach((m, i) => mesh.setMatrixAt(i, m));
    mesh.castShadow = mesh.receiveShadow = true; mesh.frustumCulled = false; if (mirror) mesh.userData.mirror = true; // (mirror: the puddles reflect it: instanced meshes are left out of the mirror unless marked, see puddles.js)
    // The shadow pass draws a mesh once per material (and every instanced mesh whether or not any of it is in view): one single-material twin
    // per shape, with the instances of every variant of it, casts the shadow instead (same buffers; only in the shadow map's view, see SHADOW_ONLY)
    mesh.castShadow = false;
    const tw = twins.get(geo) ?? twins.set(geo, { g, list: [] }).get(geo); tw.list.push(...list);
    group.add(mesh);
  };
  const unit = new THREE.BoxGeometry(1, 1, 1);
  crates.forEach((list, v) => instanced(unit, crateMaterials(v), list));
  const cbox = new THREE.BoxGeometry(CONTAINER.L, CONTAINER.H, CONTAINER.W);
  containers.forEach((list, v) => { const ms = containerMaterials(v, wet ? [1, 0, 3, 2, 1, 2, 3, 0][v % 8] : v % 2, wet); for (const m of [].concat(ms)) m.shadowSide = THREE.FrontSide; instanced(cbox, ms, list, true); }); // (shadowSide: as the crates, see crateMaterials)
  for (const { g, list } of twins.values()) {
    const sg = new THREE.BufferGeometry(); sg.index = g.index; sg.attributes = g.attributes;
    const twin = new THREE.InstancedMesh(sg, new THREE.MeshBasicMaterial({ shadowSide: THREE.FrontSide }), list.length);
    list.forEach((m, i) => twin.setMatrixAt(i, m));
    twin.castShadow = true; twin.frustumCulled = false; twin.layers.set(SHADOW_ONLY); group.add(twin);
  }
  // Straight into the scene, each mesh on its own (where it is in the world): the world's chunking
  // (chunks.js) only splits the scene's own meshes into culled blocks, so inside a group all of this
  // was drawn whole in every pass, wherever the camera was.
  scene.add(group); group.updateMatrixWorld(true);
  const meshes = []; group.traverse(o => { if (o.isMesh) meshes.push(o); });
  for (const m of meshes) { if (Array.isArray(m.material)) regroup(m); scene.attach(m); } // (walls and buildings: one call per distinct material, not per face)
  scene.remove(group);
  group.userData.notches = fort?.notches; group.userData.roofs = fort?.roofs; group.userData.tops = fort?.tops; // (cells under the fortress's diagonal wall pieces: solid, see world.js)
  return group;
}
