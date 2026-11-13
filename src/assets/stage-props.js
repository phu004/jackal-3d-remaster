// Stage props — PLACEHOLDERS for everything found on the Stage 1 map.
// Each follows the asset contract (1 unit = 1 m, front toward -Z, origin on the ground at the centre),
// so any of them can be swapped for a Claude.ai-crafted version with the same name and moving parts.
// Footprints match the NES sprites at the game's scale (8 NES pixels = 1.25 m).
import * as THREE from 'three';
import { buildMossyRock } from './mossy-rock.js';
import { buildPalm, palmWind } from './palm.js';
export { buildPalm, palmWind };
import { PI, add, mat, cached, paint, palette, decal, seededRandom, roundedRect } from './common.js';

// Props get less sky reflection than the hero vehicles, or light colours wash out to white.
const pmat = (c, r, m, o) => mat(c, r, m, Object.assign({ envMapIntensity: .35 }, o));
// (concrete: shadowSide FrontSide, the shadow is drawn from the faces turned to the sun, so no lit seam along the far foot of a gate pillar or a block, as the crates and containers)
const mats = () => cached('propMats', () => ({
  concrete: pmat(0x62645e, .85, .05, { shadowSide: THREE.FrontSide }),
  concreteDark: pmat(0x42443f, .9, .05, { shadowSide: THREE.FrontSide }),
  rock: pmat(0x8a5a32, .95, 0, { flatShading: true }),
  rockDark: pmat(0x6a4224, .95, 0, { flatShading: true }),
  sandbag: pmat(0xb89a62, .95, 0, { flatShading: true }),
  canvas: pmat(0x8a5a2a, .9, 0, { flatShading: true }),
  canvasDark: pmat(0x5a3a1a, .9, 0, { flatShading: true }),
  drum: pmat(0x2a4aa8, .5, .5),
  drumTop: pmat(0xd06a20, .6, .3),
}));

// Scrub bush, ~1.5-2.5 m across: a clump of low-poly leafy blobs in mixed greens.
// Every bush is different; pass a seed to get the same bush every run.
export function buildBush(seed = Math.random() * 1e9) {
  const rand = seededRandom(seed), root = new THREE.Group(); root.name = 'bush';
  const greens = cached('bushMats', () => [0x2f5a22, 0x3d6a2a, 0x24481c, 0x4a6e30].map(c => pmat(c, .9, 0, { flatShading: true })));
  const n = 5 + Math.floor(rand() * 5), spread = .6 + rand() * .5;
  for (let i = 0; i < n; i++) {
    const a = rand() * PI * 2, d = rand() * spread, r = .45 + rand() * .55;
    const b = add(root, new THREE.IcosahedronGeometry(r, 0), greens[Math.floor(rand() * greens.length)], Math.cos(a) * d, r * .7 + rand() * .35, Math.sin(a) * d);
    b.rotation.set(rand() * 3, rand() * 3, rand() * 3); b.scale.y = .75 + rand() * .3;
  }
  return root;
}

// Desert boulder, ~4 m across.
export function buildRock(e) {
  if (e?.look === 'mossy') return buildMossyRock((e.x ?? 1) * 7 + (e.y ?? 1));
  if (e && typeof e.x === 'number') return buildMossyRock((e.x ?? 1) * 7 + (e.y ?? 1), 'dirt'); // (a rock placed on a map: the stage 1 look, sandstone with dirt; the jungle floor's boulders and the asset viewer build the plain one, below)
  const m = mats(), root = new THREE.Group(); root.name = 'rock';
  [[0, 0, 0, 1.5], [.9, 0, .5, 1], [-.8, 0, -.3, 1.1], [.2, .8, -.2, .9]].forEach(([x, y, z, s], i) => {
    const r = add(root, new THREE.DodecahedronGeometry(s, 0), i % 2 ? m.rockDark : m.rock, x, y + s * .55, z);
    r.rotation.set(i, i * 2, i * .5); r.scale.y = .75;
  });
  return root;
}

// A sandbag: a plump pillow, fat in the middle and gathered at the two tied ends, soft-cornered, a little lumpy (three variants), the underside left out. ~0.9 x 0.38 x 0.5 m.
export const bagGeometries = () => cached('sandbagGeos', () => Array.from({ length: 3 }, (_, k) => {
  const rnd = seededRandom(101 + k * 17), g = new THREE.BoxGeometry(.9, .38, .5, 4, 2, 2), pos = g.attributes.position, idx = Array.from(g.index.array), ny = g.groups[3];
  for (let v = 0; v < pos.count; v++) {
    let u = pos.getX(v) / .45, h = pos.getY(v) / .19, w = pos.getZ(v) / .25;
    const r = (Math.abs(u) ** 2.6 + Math.abs(h) ** 2.6 + Math.abs(w) ** 2.6) ** (1 / 2.6) || 1; u /= r; h /= r; w /= r; // pulled onto a rounded block
    const pinch = u * u; h *= 1 - .38 * pinch; w *= 1 - .3 * pinch;                                                       // the gathered ends
    pos.setXYZ(v, u * .45 + (rnd() - .5) * .03, h * .19 + (rnd() - .5) * .02 + (1 - Math.abs(u)) * (rnd() - .5) * .03, w * .25 + (rnd() - .5) * .03);
  }
  g.setIndex(idx.slice(0, ny.start).concat(idx.slice(ny.start + ny.count))); g.clearGroups(); g.computeVertexNormals();
  return g;
}));
// Burlap: a coarse weave of threads, mottled and dirty, with slack folds along the bag; near white, tinted by the material colour; the bump map carries the weave.
function sandbagTexture(bump) {
  const S = 256, c = document.createElement('canvas'); c.width = c.height = S; const x = c.getContext('2d'), rnd = seededRandom(bump ? 7 : 8);
  x.fillStyle = bump ? '#808080' : '#e8e6e0'; x.fillRect(0, 0, S, S);
  if (!bump) for (let n = 0; n < 40; n++) { const px = rnd() * S, py = rnd() * S, r = 20 + rnd() * 50, g = x.createRadialGradient(px, py, 0, px, py, r), v = rnd() > .5 ? '255,255,255' : '40,30,15'; g.addColorStop(0, `rgba(${v},.10)`); g.addColorStop(1, `rgba(${v},0)`); x.fillStyle = g; x.fillRect(px - r, py - r, 2 * r, 2 * r); }
  const T = 4; // thread pitch, px
  for (let y = 0; y < S; y += T) for (let xx = 0; xx < S; xx += T) { // over-under weave: every cell a short thread, horizontal or vertical
    const hz = ((xx / T) + (y / T)) % 2 === 0, k = (rnd() - .5) * (bump ? 40 : 26);
    x.fillStyle = bump ? `rgb(${hz ? 150 + k : 100 + k},${hz ? 150 + k : 100 + k},${hz ? 150 + k : 100 + k})` : `rgba(${hz ? 255 : 30},${hz ? 250 : 24},${hz ? 235 : 14},${hz ? .16 : .14})`;
    if (hz) x.fillRect(xx, y + 1, T, T - 1); else x.fillRect(xx + 1, y, T - 1, T);
  }
  for (let f = 0; f < 5; f++) { // slack folds
    const py = rnd() * S; x.strokeStyle = bump ? 'rgba(0,0,0,.45)' : 'rgba(40,30,15,.28)'; x.lineWidth = 2 + rnd() * 3; x.beginPath(); x.moveTo(0, py); x.bezierCurveTo(S * .3, py + (rnd() - .5) * 30, S * .7, py + (rnd() - .5) * 30, S, py + (rnd() - .5) * 20); x.stroke();
  }
  if (!bump) for (let n = 0; n < 500; n++) { x.fillStyle = `rgba(60,45,25,${.05 + rnd() * .14})`; x.fillRect(rnd() * S, rnd() * S, 1 + rnd() * 3, 1 + rnd() * 3); } // grit and dust
  return c;
}
export const sandbagMaterial = tint => cached('sandbagMat:' + tint, () => {
  const mk = bump => { const t = new THREE.CanvasTexture(sandbagTexture(bump)); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(2, 1); t.anisotropy = 8; return t; };
  return pmat(tint, .97, 0, { map: mk(false), bumpMap: mk(true), bumpScale: 1.1 });
});

// Sandbag foxhole: an arc of sandbags open to the north, ~5 x 3 m, two courses of plump bags, each a little off true.
export function buildFoxhole(look) { // look 'grey': greyer bags (stage 5)
  const root = new THREE.Group(), rand = seededRandom(3); root.name = 'foxhole';
  const bagMat = sandbagMaterial(look === 'grey' ? 0x77787a : 0xc4a76c), geos = bagGeometries();
  for (let layer = 0; layer < 2; layer++) {
    for (let i = 0; i <= 8; i++) {
      const a = PI * (i / 8) + (layer ? PI / 16 : 0);
      if (a > PI) continue;
      const b = add(root, geos[Math.floor(rand() * 3)], bagMat, Math.cos(a) * 2.1 + (rand() - .5) * .08, .18 + layer * .33 + (rand() - .5) * .02, Math.sin(a) * 1.3 + (rand() - .5) * .08);
      b.rotation.set((rand() - .5) * .08, -a + PI / 2 + (rand() - .5) * .18, (rand() - .5) * .1); b.scale.set(.95 + rand() * .1, .92 + rand() * .16, .95 + rand() * .1);
    }
  }
  return root;
}

// Weathered surface detail for the gun emplacement, tileable, near white (it multiplies the
// material's colour), with a matching bump map.
// concrete: cast concrete, blotchy with damp and age, pitted with air holes, fine aggregate, hairline
//   cracks and dark rain streaks.
// metal: painted armour plate, mottled and grimy, scratched, with paint chipped back to bare steel
//   and rust spots bleeding streaks.
const TURRET_TEX = 512;                                  // px
const TURRET_TILE = { concrete: 2.2, metal: 1.3 };       // metres per tile
function turretTexture(kind) {
  return cached('turretTex:' + kind, () => {
    const N = TURRET_TEX, rand = seededRandom(kind === 'metal' ? 41 : 17);
    const mk = () => { const c = document.createElement('canvas'); c.width = c.height = N; return [c, c.getContext('2d')]; };
    const [c, x] = mk(), [bc, b] = mk();
    const wrap = draw => { for (const ox of [-N, 0, N]) for (const oy of [-N, 0, N]) draw(ox, oy); };
    const blot = (ctx, cx, cy, r, col) => wrap((ox, oy) => {
      const g = ctx.createRadialGradient(cx + ox, cy + oy, 0, cx + ox, cy + oy, r); g.addColorStop(0, col); g.addColorStop(1, col.replace(/[\d.]+\)$/, '0)'));
      ctx.fillStyle = g; ctx.fillRect(cx + ox - r, cy + oy - r, r * 2, r * 2);
    });
    const metal = kind === 'metal';
    x.fillStyle = metal ? '#e2e2dc' : '#e6e4de'; x.fillRect(0, 0, N, N); b.fillStyle = '#808080'; b.fillRect(0, 0, N, N);
    for (let i = 0; i < 26; i++) blot(x, rand() * N, rand() * N, 40 + rand() * 110, rand() < .55 ? `rgba(70,66,56,${.06 + rand() * .1})` : `rgba(255,252,240,${.06 + rand() * .08})`); // mottling, damp, grime
    for (let i = 0; i < (metal ? 3000 : 9000); i++) { // fine grain: aggregate / paint texture
      const v = rand(); x.fillStyle = v < .5 ? `rgba(40,38,32,${.05 + rand() * .1})` : `rgba(255,255,250,${.04 + rand() * .08})`;
      const px = rand() * N, py = rand() * N, sz = 1 + rand() * (metal ? 1 : 2); x.fillRect(px, py, sz, sz);
      b.fillStyle = v < .5 ? 'rgba(0,0,0,.12)' : 'rgba(255,255,255,.1)'; b.fillRect(px, py, sz, sz);
    }
    if (!metal) {
      for (let i = 0; i < 420; i++) { // air holes in the cast surface
        const px = rand() * N, py = rand() * N, r = .8 + rand() * 2.4;
        wrap((ox, oy) => { x.fillStyle = 'rgba(40,38,34,.55)'; x.beginPath(); x.arc(px + ox, py + oy, r, 0, PI * 2); x.fill();
          b.fillStyle = 'rgba(0,0,0,.6)'; b.beginPath(); b.arc(px + ox, py + oy, r, 0, PI * 2); b.fill(); });
      }
      for (let i = 0; i < 14; i++) { // rain streaks running down
        const px = rand() * N, py = rand() * N, len = 60 + rand() * 180, w = 3 + rand() * 10;
        wrap((ox, oy) => { const g = x.createLinearGradient(0, py + oy, 0, py + oy + len); g.addColorStop(0, 'rgba(60,56,48,.18)'); g.addColorStop(1, 'rgba(60,56,48,0)');
          x.fillStyle = g; x.fillRect(px + ox, py + oy, w, len); });
      }
      for (let i = 0; i < 6; i++) { // hairline cracks
        let px = rand() * N, py = rand() * N, a = rand() * PI * 2; const pts = [[px, py]];
        for (let k = 0; k < 24; k++) { a += (rand() - .5) * .9; px += Math.cos(a) * 6; py += Math.sin(a) * 6; pts.push([px, py]); }
        for (const [ctx, col, w] of [[x, 'rgba(36,34,30,.7)', 1.2], [b, 'rgba(0,0,0,.8)', 1.5]]) wrap((ox, oy) => {
          ctx.strokeStyle = col; ctx.lineWidth = w; ctx.beginPath(); pts.forEach(([u, v], k) => k ? ctx.lineTo(u + ox, v + oy) : ctx.moveTo(u + ox, v + oy)); ctx.stroke(); });
      }
    } else {
      for (let i = 0; i < 70; i++) { // scratches: fine bright lines
        const px = rand() * N, py = rand() * N, a = rand() * PI, l = 8 + rand() * 40;
        wrap((ox, oy) => { x.strokeStyle = `rgba(255,255,250,${.15 + rand() * .2})`; x.lineWidth = .8; x.beginPath(); x.moveTo(px + ox, py + oy); x.lineTo(px + ox + Math.cos(a) * l, py + oy + Math.sin(a) * l); x.stroke(); });
      }
      for (let i = 0; i < 40; i++) { // chipped paint: a dark rim, bare steel inside
        const px = rand() * N, py = rand() * N, r = 2 + rand() * 7;
        const pts = Array.from({ length: 7 }, (_, k) => { const a = k / 7 * PI * 2, rr = r * (.5 + rand() * .7); return [Math.cos(a) * rr, Math.sin(a) * rr]; });
        const poly = (ctx, ox, oy, sc) => { ctx.beginPath(); pts.forEach(([u, v], k) => k ? ctx.lineTo(px + ox + u * sc, py + oy + v * sc) : ctx.moveTo(px + ox + u * sc, py + oy + v * sc)); ctx.fill(); };
        wrap((ox, oy) => { x.fillStyle = 'rgba(40,38,34,.6)'; poly(x, ox, oy, 1.25); x.fillStyle = 'rgba(250,250,246,.75)'; poly(x, ox, oy, 1);
          b.fillStyle = 'rgba(0,0,0,.35)'; poly(b, ox, oy, 1); });
      }
      for (let i = 0; i < 16; i++) { // rust spots, bleeding streaks downward
        const px = rand() * N, py = rand() * N, r = 3 + rand() * 9;
        blot(x, px, py, r * 1.6, 'rgba(150,80,36,.55)');
        wrap((ox, oy) => { const len = 20 + rand() * 70, g = x.createLinearGradient(0, py + oy, 0, py + oy + len);
          g.addColorStop(0, 'rgba(140,72,32,.4)'); g.addColorStop(1, 'rgba(140,72,32,0)'); x.fillStyle = g; x.fillRect(px + ox - r * .4, py + oy, r * .8, len); });
      }
    }
    const tex = cv => { const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; return t; };
    return { map: tex(c), bump: tex(bc) };
  });
}

// Box-projected UVs in the emplacement's own space for the textured meshes, so the detail has the
// same scale on every face (tile: metres per texture tile, per material).
function projectDetail(root, tiles) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert(), p = new THREE.Vector3(), n = new THREE.Vector3();
  root.traverse(m => {
    const tile = m.isMesh && tiles.get(m.material);
    if (!tile) return;
    const g = m.geometry = m.geometry.clone(), toRoot = new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld), nm = new THREE.Matrix3().getNormalMatrix(toRoot);
    const pos = g.attributes.position, nor = g.attributes.normal, uv = new Float32Array(pos.count * 2);
    for (let i = 0; i < pos.count; i++) {
      p.fromBufferAttribute(pos, i).applyMatrix4(toRoot); n.fromBufferAttribute(nor, i).applyMatrix3(nm);
      const ax = Math.abs(n.x), ay = Math.abs(n.y), az = Math.abs(n.z);
      const [u, v] = ax >= ay && ax >= az ? [p.z, p.y] : ay >= az ? [p.x, p.z] : [p.x, p.y];
      uv[i * 2] = u / tile; uv[i * 2 + 1] = v / tile;
    }
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  });
}

// Gun emplacement, ~5 m square, modelled on the NES sprite: a bevelled concrete block with a raised
// ribbed cross, vent slits in the corners, and a dark armoured housing carrying a single-barrel turret.
// Weathered: cast concrete (pitted, stained, cracked) and painted armour (chipped, scratched, rusting),
// bolted down round the housing.
// Named parts: turret (yaws on Y; its front is -Z), gun (the barrel, slides back along +Z in recoil), muzzle.
export function buildTurret() {
  const t = cached('turretMats', () => {
    const con = turretTexture('concrete'), met = turretTexture('metal');
    const c = (col, r, mt, x) => pmat(col, r, mt, { map: x.map, bumpMap: x.bump, bumpScale: .025 });
    const m = {
      block: c(0x727470, .9, .05, con), rib: c(0x8c8e87, .85, .05, con), slot: pmat(0x1c1d1a, .9, 0),
      housing: c(0x40433e, .65, .4, met), body: c(0x5c6056, .55, .45, met), barrel: c(0xa0a69e, .4, .65, met), bolt: pmat(0x2e302c, .5, .6),
    };
    for (const k of ['block', 'rib', 'housing']) m[k].shadowSide = THREE.FrontSide; // (the shadow is drawn from the faces turned to the sun: no lit seam along the far foot of the slab, as the crates and containers)
    return m;
  });
  const root = new THREE.Group(); root.name = 'turretBase';
  // bevelled concrete block, 4.6 m square
  const block = add(root, new THREE.ExtrudeGeometry(roundedRect(4.4, 4.4, .25),
    { depth: .45, bevelEnabled: true, bevelThickness: .12, bevelSize: .1, bevelSegments: 2 }), t.block);
  block.rotation.x = -PI / 2;
  const top = .57; // block height incl. bevel
  // raised cross of ribbed bands, each with two grooves
  [[4.2, .9], [.9, 4.2]].forEach(([w, d], i) => {
    add(root, new THREE.BoxGeometry(w, .14, d), t.rib, 0, top + .07, 0);
    [-.25, .25].forEach(o => add(root, i ? new THREE.BoxGeometry(.06, .03, d) : new THREE.BoxGeometry(w, .03, .06), t.slot,
      i ? o : 0, top + .15, i ? 0 : o));
  });
  // vent slits in the four corners
  [-1, 1].forEach(sx => [-1, 1].forEach(sz => add(root, new THREE.BoxGeometry(.75, .04, .14), t.slot, sx * 1.45, top + .01, sz * 1.7)));
  // armoured housing the turret sits in
  const housing = add(root, new THREE.ExtrudeGeometry(roundedRect(2.1, 2.3, .35),
    { depth: .25, bevelEnabled: true, bevelThickness: .06, bevelSize: .06, bevelSegments: 2 }), t.housing, 0, top + .14, 0);
  housing.rotation.x = -PI / 2;
  for (let i = 0; i < 12; i++) { // bolts round the housing
    const a = i / 12 * PI * 2; add(root, new THREE.CylinderGeometry(.045, .045, .05, 6), t.bolt, Math.sin(a) * 1.18, top + .43, Math.cos(a) * 1.28);
  }

  const turret = new THREE.Group(); turret.name = 'turret'; turret.position.y = top + .45; root.add(turret);
  const body = add(turret, new THREE.ExtrudeGeometry(roundedRect(1.3, 1.6, .45),
    { depth: .5, bevelEnabled: true, bevelThickness: .15, bevelSize: .12, bevelSegments: 3 }), t.body, 0, 0, .15);
  body.rotation.x = -PI / 2;
  add(turret, new THREE.CylinderGeometry(.32, .36, .2, 16), t.housing, 0, .72, .35);            // cupola
  add(turret, new THREE.CylinderGeometry(.22, .22, .05, 16), t.slot, 0, .84, .35);              // hatch
  [-1, 1].forEach(s => add(turret, new THREE.BoxGeometry(.05, .1, .45), t.slot, s * .74, .45, .1)); // vision slits
  add(turret, new THREE.BoxGeometry(.6, .5, .35), t.housing, 0, .35, -.75);                    // mantlet
  const gun = new THREE.Group(); gun.name = 'gun'; turret.add(gun);                            // the barrel, which recoils
  add(gun, new THREE.CylinderGeometry(.1, .12, 1.7, 12), t.barrel, 0, .38, -1.75).rotation.x = PI / 2;
  add(gun, new THREE.CylinderGeometry(.16, .16, .3, 12), t.housing, 0, .38, -2.7).rotation.x = PI / 2; // muzzle brake
  const muzzle = new THREE.Object3D(); muzzle.name = 'muzzle'; muzzle.position.set(0, .38, -2.9); gun.add(muzzle);
  [-1, 1].forEach(s => [-.35, .25].forEach(z => add(turret, new THREE.CylinderGeometry(.04, .04, .04, 6), t.bolt, s * .4, .78, z))); // roof bolts
  projectDetail(root, new Map([[t.block, TURRET_TILE.concrete], [t.rib, TURRET_TILE.concrete], [t.housing, TURRET_TILE.metal], [t.body, TURRET_TILE.metal], [t.barrel, TURRET_TILE.metal]]));
  root.traverse(o => { if (!o.isMesh) return; for (let p = o.parent; p; p = p.parent) if (p === turret) return; o.castShadow = false; }); // (the low concrete base casts no shadow worth the triangles: the gun and its housing on top still do)
  return root;
}

// ---- buildings with blow-out roofs ----

// Roof sheet texture: corrugated metal or 'ridge' planks (stripes along v), or 'planks' (along u).
function roofTexture(kind) {
  return cached('roofTex:' + kind, () => {
    const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d');
    const metal = kind !== 'planks'; // 'metal' and 'ridge' have stripes along v, 'planks' along u
    const grey = kind === 'grey', straw = kind === 'straw';
    x.fillStyle = grey ? '#8a8b86' : straw ? '#c4a466' : kind === 'metal' ? '#3f7a34' : '#7a5230'; x.fillRect(0, 0, 64, 64);
    for (let i = 0; i < 600; i++) {
      x.fillStyle = Math.random() > .5 ? 'rgba(255,255,255,.07)' : 'rgba(0,0,0,.1)';
      x.fillRect(Math.random() * 64, Math.random() * 64, metal ? 1 : 4, metal ? 3 : 1);
    }
    for (let i = 0; i < 64; i += 16) {
      x.fillStyle = grey ? '#4c4d49' : straw ? '#86683a' : kind === 'metal' ? '#22461c' : '#3e2814';
      metal ? x.fillRect(i, 0, 3, 64) : x.fillRect(0, i, 64, 3);
      x.fillStyle = grey ? 'rgba(225,226,220,.4)' : straw ? 'rgba(245,228,180,.4)' : kind === 'metal' ? 'rgba(140,200,120,.45)' : 'rgba(200,160,110,.35)';
      metal ? x.fillRect(i + 5, 0, 2, 64) : x.fillRect(0, i + 5, 64, 2);
    }
    const t = new THREE.CanvasTexture(c); t.anisotropy = 8;
    return t;
  });
}

// Where a building gets blown open: an irregular blob against one wall (`side`: front = -Z,
// east = +X, west = -X) that runs out past it, so the blast tears through that wall and the
// roof above it together. reach(x, z) < 1 means inside the blast. gapAt / gapHalf give the breach
// position along that wall.
function blastPlan(rand, w, d, side = 'front') {
  const j = rand() - .5;
  const { hx, hz, rx, rz } = side === 'front' ? { hx: j * w * .25, hz: -d / 2 + d * .2, rx: w * .3, rz: d * .45 }
    : side === 'back' ? { hx: j * w * .25, hz: d / 2 - d * .2, rx: w * .3, rz: d * .45 } // (the back wall: the south side, the one facing the camera)
    : { hx: (side === 'east' ? 1 : -1) * (w / 2 - w * .2), hz: j * d * .25, rx: w * .45, rz: d * .3 };
  const wob = Array.from({ length: 7 }, () => rand() * 6.28), amp = Array.from({ length: 7 }, () => rand() * .12);
  return {
    side, hx, hz, gapAt: side === 'front' || side === 'back' ? hx : hz, gapHalf: (side === 'front' || side === 'back' ? w : d) * .17,
    reach(x, z) {
      const a = Math.atan2((z - hz) / rz, (x - hx) / rx), e = Math.hypot((x - hx) / rx, (z - hz) / rz);
      return e / (1 + amp.reduce((s, A, i) => s + A * Math.sin((i + 2) * a + wob[i]), 0));
    },
  };
}

// A weathered roof sheet for one roof tile (several variants per kind, picked at random per tile, so a roof isn't one pattern
// repeated): the corrugation with shaded troughs and lit crests, sun-bleached and grimy patches and a row of fasteners on the crests. Stripes run along v (up the slope's width) like roofTexture.
function roofSheetTexture(kind, variant) {
  return cached('roofSheet:' + kind + ':' + variant, () => {
    const S = 128, c = document.createElement('canvas'); c.width = c.height = S; const x = c.getContext('2d'), rnd = seededRandom(kind.length * 977 + variant * 131 + 7);
    const grey = kind === 'grey', straw = kind === 'straw', wood = kind === 'ridge', brown = kind === 'brown';
    const base = brown ? ['#8c5c2c', '#825430', '#965f33', '#885a2c', '#8f5f30', '#7c5028'][variant % 6] // (stage 4's engineer huts: brown corrugated sheets, as the NES sprite's roof)
      : grey ? ['#8a8b86', '#80817c', '#94958f', '#878883', '#8e8f89', '#7c7d78'][variant % 6]
      : straw ? ['#a28450', '#987a46', '#aa8c56', '#9e8049', '#a68852', '#92743f'][variant % 6]
      : wood ? ['#7a5230', '#6e4a2a', '#835a36', '#74502e', '#7e5834', '#684428'][variant % 6]
      : ['#437a38', '#47803c', '#407636', '#4a8240', '#447b39', '#4e8645'][variant % 6]; // (the green sheets fade differently)
    const groove = brown ? '66,36,14' : grey ? '76,77,73' : straw ? '134,104,58' : wood ? '62,40,20' : '30,66,26', crest = brown ? '210,160,105' : grey ? '225,226,220' : straw ? '215,190,140' : wood ? '200,160,110' : '150,205,130';
        x.fillStyle = base; x.fillRect(0, 0, S, S);
    for (let i = 0; i < S; i += 32) { // corrugation: a shaded trough, then a lit crest
      let g = x.createLinearGradient(i, 0, i + 32, 0);
      g.addColorStop(0, `rgba(${groove},.7)`); g.addColorStop(.14, `rgba(${groove},.25)`); g.addColorStop(.4, `rgba(${crest},.0)`); g.addColorStop(.62, `rgba(${crest},.34)`); g.addColorStop(.8, `rgba(${crest},.0)`); g.addColorStop(1, `rgba(${groove},.5)`);
      x.fillStyle = g; x.fillRect(i, 0, 32, S);
    }
    for (let i = 0; i < 9; i++) { // sun-bleached and grimy blotches
      const px = rnd() * S, py = rnd() * S, r = 14 + rnd() * 34, light = rnd() < .5, g = x.createRadialGradient(px, py, 0, px, py, r);
      g.addColorStop(0, light ? `rgba(220,230,205,${.06 + rnd() * .07})` : `rgba(20,16,8,${.06 + rnd() * .08})`); g.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = g; x.fillRect(px - r, py - r, 2 * r, 2 * r);
    }
    if (wood) for (let i = 0; i < 40; i++) { x.strokeStyle = `rgba(30,18,8,${.1 + rnd() * .12})`; x.lineWidth = 1; const px = rnd() * S; x.beginPath(); x.moveTo(px, rnd() * 30); x.lineTo(px + (rnd() - .5) * 4, 60 + rnd() * 68); x.stroke(); } // grain
    for (let i = 0; i < S; i += 32) for (const py of [10, 118]) { // fasteners on the crests
      const px = i + 19 + (rnd() - .5) * 2; x.fillStyle = 'rgba(25,22,18,.6)'; x.beginPath(); x.arc(px, py, 1.8, 0, 7); x.fill(); x.fillStyle = 'rgba(255,255,240,.45)'; x.fillRect(px - 1, py - 1.5, 1.2, 1.2);
    }
    for (let i = 0; i < 700; i++) { x.fillStyle = rnd() > .5 ? 'rgba(255,255,255,.06)' : 'rgba(0,0,0,.09)'; x.fillRect(rnd() * S, rnd() * S, 1, 1 + rnd() * 2); }
    const t = new THREE.CanvasTexture(c); t.anisotropy = 8; return t;
  });
}

const roofMats = kind => cached('roofMat:' + kind, () => {
  const map = roofTexture(kind);
  return { ok: Array.from({ length: 6 }, (_, v) => pmat(0xffffff, .75, kind === 'metal' || kind === 'grey' || kind === 'brown' ? .3 : 0, { map: roofSheetTexture(kind, v) })), burnt: pmat(0x3a3530, .9, 0, { map }) }; // (six weathered variants, picked per tile)
});

// Roof tile in the intact roof, and (unless blasted away) in the broken one: charred and buckled
// near the hole's edge.
function roofTile(intact, broken, geo, m, plan, rand, x, y, z, rot) {
  const ok = m.ok[Math.floor(rand() * m.ok.length)];
  // each sheet sits a little off true (turned, shifted, a touch higher or lower), so the roof isn't a perfect grid of squares
  const jx = (rand() - .5) * .03, jz = (rand() - .5) * .03, jy = (rand() - .5) * .02, yaw = (rand() - .5) * .03, roll = (rand() - .5) * .016;
  const a = add(intact, geo, ok, x + jx, y + jy, z + jz); a.rotation.copy(rot); a.rotation.y += yaw; a.rotation.z += roll;
  const e = plan.reach(x, z);
  if (e <= 1) return;
  const t = add(broken, geo, e < 1.45 ? m.burnt : ok, x + jx, y + jy, z + jz);
  t.rotation.copy(rot); t.rotation.y += yaw; t.rotation.z += roll;
  if (e < 1.45) t.rotation.z += (rand() - .5) * .25;
}

// A shed roof (low edge at the front, -Z), in two versions: `roof` (intact) and `roofBroken`
// (hidden; the blast area removed). The game swaps them when the building is destroyed.
function shedRoof(root, { w, d, low, high, kind, plan, rand, back = 0 }) {
  const m = roofMats(kind);
  const NX = Math.round(w / .75), NZ = Math.round(d / .8), tw = w / NX, td = d / NZ;
  const rot = new THREE.Euler(-Math.atan2(high - low, d), 0, 0);
  const intact = new THREE.Group(); intact.name = 'roof';
  const broken = new THREE.Group(); broken.name = 'roofBroken'; broken.visible = false;
  const tile = new THREE.BoxGeometry(tw * 1.07, .1, td * 1.09), trim = new THREE.BoxGeometry(tw * 1.02, .2, .15);
  for (let i = 0; i < NX; i++) {
    const x = -w / 2 + (i + .5) * tw;
    for (let j = 0; j < NZ; j++) roofTile(intact, broken, tile, m, plan, rand, x, low + (j + .5) / NZ * (high - low), -d / 2 + (j + .5) * td, rot);
    // trim along the low (front) and high (back) edges; the broken trims have the blast gap too
    add(intact, trim, m.ok[2], x, low - .05, -d / 2); add(intact, trim, m.ok[2], x, high - .05, d / 2); // (the same sheet metal, not the dark charred stuff)
    if (plan.reach(x, d / 2 - td / 2) > 1) add(broken, trim, m.burnt, x, high - .05, d / 2);
    if (plan.reach(x, -d / 2 + td / 2) > 1) add(broken, trim, m.burnt, x, low - .05, -d / 2);
  }
  intact.position.z = broken.position.z = back; // shift back so the front edge is flush with the front wall
  root.add(intact, broken);
}

// A gable (^) roof with its ridge running front to back (along Z), in two versions like shedRoof.
// Gable-end walls close the triangles at the front and back.
function gableRoof(root, { w, d, eave, ridge, kind, plan, rand, wallMat, wallW, wallD, pitch = .75 }) { // pitch: the width of a sheet across the slope
  const m = roofMats(kind), half = w / 2, slope = Math.atan2(ridge - eave, half);
  const NX = Math.max(2, Math.round(half / pitch)), NZ = Math.round(d / .8), tw = half / NX, td = d / NZ;
  const intact = new THREE.Group(); intact.name = 'roof';
  const broken = new THREE.Group(); broken.name = 'roofBroken'; broken.visible = false;
  const tile = new THREE.BoxGeometry(tw / Math.cos(slope) * 1.08, .1, td * 1.09), cap = new THREE.BoxGeometry(.32, .14, td * 1.04);
  for (const s of [-1, 1]) {
    const rot = new THREE.Euler(0, 0, -s * slope);
    for (let i = 0; i < NX; i++) for (let j = 0; j < NZ; j++) {
      roofTile(intact, broken, tile, m, plan, rand, s * (i + .5) * tw, ridge - (i + .5) / NX * (ridge - eave), -d / 2 + (j + .5) * td, rot);
    }
  }
  for (let j = 0; j < NZ; j++) { // ridge cap
    const z = -d / 2 + (j + .5) * td;
    add(intact, cap, m.burnt, 0, ridge + .04, z);
    if (plan.reach(0, z) > 1) add(broken, cap, m.burnt, 0, ridge + .04, z);
  }
  const tri = new THREE.Shape(); tri.moveTo(-wallW / 2, 0); tri.lineTo(wallW / 2, 0); tri.lineTo(0, (ridge - eave) * wallW / w); tri.closePath();
  const gable = new THREE.ExtrudeGeometry(tri, { depth: .2, bevelEnabled: false });
  [-1, 1].forEach(s => add(root, gable, wallMat, 0, eave - .02, s * wallD / 2 - .1));
  root.add(intact, broken);
}

// Interior furniture, seen through the blast hole: plank floor, bunks along the side walls,
// crates, a table with stools. Anything inside the blast area is left out (blown away).
// The garage's floor: poured concrete, grey and speckled, saw-cut into slabs, with oil blots and old tyre marks (4 m tile).
function garageFloor(w, d) {
  return cached('garageFloor:' + w + 'x' + d, () => {
    const S = 512, c = document.createElement('canvas'); c.width = c.height = S; const x = c.getContext('2d'), rnd = seededRandom(31);
    x.fillStyle = '#6d6e69'; x.fillRect(0, 0, S, S);
    for (let i = 0; i < 18; i++) { const px = rnd() * S, py = rnd() * S, r = 40 + rnd() * 90, g = x.createRadialGradient(px, py, 0, px, py, r), v = rnd() > .5 ? '255,255,255' : '0,0,0'; g.addColorStop(0, `rgba(${v},.07)`); g.addColorStop(1, `rgba(${v},0)`); x.fillStyle = g; x.fillRect(px - r, py - r, 2 * r, 2 * r); }
    for (let i = 0; i < 9000; i++) { x.fillStyle = rnd() > .5 ? 'rgba(255,255,255,.05)' : 'rgba(0,0,0,.07)'; x.fillRect(rnd() * S, rnd() * S, 1 + rnd() * 2, 1 + rnd() * 2); }
    x.strokeStyle = 'rgba(25,25,24,.6)'; x.lineWidth = 3; for (const p of [0, S / 2]) { x.beginPath(); x.moveTo(0, p); x.lineTo(S, p); x.stroke(); x.beginPath(); x.moveTo(p, 0); x.lineTo(p, S); x.stroke(); } // saw cuts
    for (let k = 0; k < 3; k++) { x.strokeStyle = `rgba(14,13,12,${.28 - k * .06})`; x.lineWidth = 9 - k * 2; x.beginPath(); x.moveTo(S * (.28 + k * .05), 0); x.bezierCurveTo(S * .3, S * .35, S * .4, S * .65, S * (.36 + k * .06), S); x.stroke(); } // tyre marks
    for (let i = 0; i < 7; i++) { const px = rnd() * S, py = rnd() * S, r = 14 + rnd() * 34, g = x.createRadialGradient(px, py, 0, px, py, r); g.addColorStop(0, 'rgba(10,9,8,.7)'); g.addColorStop(.6, 'rgba(10,9,8,.4)'); g.addColorStop(1, 'rgba(10,9,8,0)'); x.fillStyle = g; x.fillRect(px - r, py - r, 2 * r, 2 * r); } // oil
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(w / 4, d / 4); t.anisotropy = 8;
    return pmat(0xffffff, .85, .05, { map: t });
  });
}
function furnish(root, { w, d, y0, plan, rand, garage = false }) {
  const f = cached('furniture', () => ({
    floor: pmat(0x8a7a66, .95, 0, { map: roofTexture('planks') }),
    wood: pmat(0x7a5a38, .9, 0, { map: roofTexture('planks') }),
    frame: pmat(0x3a3d3a, .6, .5), mattress: pmat(0x8a8460, 1, 0), blanket: pmat(0x4a5a3a, 1, 0),
  }));
  const fy = y0 + .04, clear = (x, z) => plan.reach(x, z) > 1.1;
  add(root, new THREE.BoxGeometry(w - .2, .04, d - .2), garage ? garageFloor(w, d) : f.floor, 0, y0 + .02, 0);
  if (garage) return; // (a garage has no bunks and crates: just the bay)
  // bunks along both side walls, head to the wall, running front to back
  const n = Math.max(1, Math.floor((d - 1.2) / 1.1));
  [-1, 1].forEach(s => {
    for (let i = 0; i < n; i++) {
      const z = -d / 2 + .9 + i * 1.1 + .45, x = s * (w / 2 - 1.15);
      if (!clear(x, z)) continue;
      add(root, new THREE.BoxGeometry(1.9, .08, .8), f.frame, x, fy + .45, z);
      add(root, new THREE.BoxGeometry(1.8, .14, .7), f.mattress, x, fy + .56, z);
      add(root, new THREE.BoxGeometry(1.1, .06, .72), f.blanket, x - s * .3, fy + .65, z);
      [-.9, .9].forEach(dx => [-.35, .35].forEach(dz => add(root, new THREE.BoxGeometry(.06, .5, .06), f.frame, x + dx, fy + .25, z + dz)));
    }
  });
  // crates stacked by the back wall
  for (let i = 0; i < 3; i++) {
    const x = (rand() - .5) * (w - 3);
    if (!clear(x, d / 2 - .6)) continue;
    add(root, new THREE.BoxGeometry(.7, .7, .7), f.wood, x, fy + .35 + (i === 2 ? .7 : 0), d / 2 - .6).rotation.y = (rand() - .5) * .5;
  }
  // table with two stools, a little off centre
  const tx = (rand() - .5) * w * .2, tz = (rand() - .2) * d * .2;
  add(root, new THREE.BoxGeometry(1.3, .08, .8), f.wood, tx, fy + .75, tz);
  [-.55, .55].forEach(dx => [-.3, .3].forEach(dz => add(root, new THREE.BoxGeometry(.07, .75, .07), f.wood, tx + dx, fy + .37, tz + dz)));
  [-1, 1].forEach(s => add(root, new THREE.CylinderGeometry(.2, .2, .45, 8), f.wood, tx + s * .95, fy + .22, tz + (rand() - .5) * .4));
}

// Only seen once the building is destroyed: a roof beam fallen across the room, charred floor
// patches and rubble scattered from the blast.
function wreckedInterior(g, { w, d, y0, plan, rand, burnt }) {
  const fy = y0 + .05;
  const beam = add(g, new THREE.BoxGeometry(Math.min(w, d) * .65, .22, .22), burnt, plan.hx * .5, fy + .6, plan.hz * .5);
  beam.rotation.set(0, (rand() - .5) * .8 + (plan.side === 'front' || plan.side === 'back' ? 0 : PI / 2), .25 + rand() * .2); // one end on the floor
  for (let i = 0; i < 4; i++) {
    add(g, new THREE.CircleGeometry(.5 + rand() * .6, 9), burnt, plan.hx + (rand() - .5) * w * .4, fy + .005, plan.hz + (rand() - .5) * d * .4)
      .rotation.x = -PI / 2;
  }
  for (let i = 0; i < 10; i++) {
    add(g, new THREE.DodecahedronGeometry(.1 + rand() * .15, 0), burnt, plan.hx + (rand() - .5) * w * .5, fy + .08, plan.hz + (rand() - .5) * d * .5)
      .rotation.set(rand() * 3, rand() * 3, rand() * 3);
  }
}

// Door and window details for a front wall facing -Z at `z`. trim: 'paint' (painted steel frames,
// barracks) or 'wood' (huts).
const detailMats = () => cached('detailMats', () => ({
  paint: pmat(0x2e3a26, .6, .3), wood: pmat(0x4a3220, .9, 0),
  plank: pmat(0x8a6a48, .9, 0, { map: roofTexture('ridge') }), iron: pmat(0x2a2a28, .45, .7),
  glass: pmat(0x1c2630, .12, .4, { envMapIntensity: 1.2 }), step: pmat(0x6a6c66, .9, .05),
}));
function doorway(node, x, y0, dh, z, trim, sc = 1) { // sc: a smaller door and frame (the engineer huts)
  dh *= sc; const m = detailMats(), frame = m[trim], dw = 1.1 * sc;
  add(node, new THREE.BoxGeometry(dw, dh, .06), m.plank, x, y0 + dh / 2, z - .04);                 // plank door
  [-1, 1].forEach(s => add(node, new THREE.BoxGeometry(.1, dh + .1, .12), frame, x + s * (dw / 2 + .05), y0 + dh / 2, z - .06)); // jambs
  add(node, new THREE.BoxGeometry(dw + .3, .12, .14), frame, x, y0 + dh + .05, z - .07);           // lintel
  [.25, .75].forEach(k => add(node, new THREE.BoxGeometry(dw * .6, .05, .02), m.iron, x - dw * .15, y0 + dh * k, z - .08)); // hinge straps
  add(node, new THREE.SphereGeometry(.04, 8, 6), m.iron, x + dw * .35, y0 + dh * .48, z - .1);    // handle
  add(node, new THREE.BoxGeometry(dw + .4, .12, .45), m.step, x, Math.max(.06, y0 - .06), z - .25); // step
}
// Dirt for the garage front, drawn once per kind: 'door' (oil runs, greasy hand smears, rust and scuffs on the shutter), 'wall' (mud splash and soot at the foot of the wall), 'apron' (tyre skid marks curving out of the bay, oil puddles, drips).
function garageGrime(kind) {
  return cached('garageGrime:' + kind, () => {
    const [W, H] = kind === 'door' ? [1024, 410] : kind === 'wall' ? [1024, 160] : [832, 256], c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d'), rnd = seededRandom(kind.length * 977 + 13);
    const blob = (cx, cy, rx, ry, col, a) => { const g = x.createRadialGradient(cx, cy, 0, cx, cy, Math.max(rx, ry)); g.addColorStop(0, `rgba(${col},${a})`); g.addColorStop(.6, `rgba(${col},${a * .6})`); g.addColorStop(1, `rgba(${col},0)`); x.save(); x.translate(cx, cy); x.scale(rx / Math.max(rx, ry), ry / Math.max(rx, ry)); x.translate(-cx, -cy); x.fillStyle = g; x.fillRect(cx - Math.max(rx, ry), cy - Math.max(rx, ry), 2 * Math.max(rx, ry), 2 * Math.max(rx, ry)); x.restore(); };
    if (kind === 'door') {
      const g = x.createLinearGradient(0, H * .5, 0, H); g.addColorStop(0, 'rgba(110,90,60,0)'); g.addColorStop(1, 'rgba(110,90,60,.5)'); x.fillStyle = g; x.fillRect(0, 0, W, H); // dust settled low on the shutter
      for (let i = 0; i < 26; i++) { // oil runs from the top edge and from the grooves
        const px = rnd() * W, py = rnd() < .5 ? 0 : Math.floor(rnd() * 8) * H / 8, l = 40 + rnd() * 190, w = 2 + rnd() * 6, gr = x.createLinearGradient(0, py, 0, py + l);
        gr.addColorStop(0, 'rgba(12,9,5,.5)'); gr.addColorStop(.8, 'rgba(12,9,5,.35)'); gr.addColorStop(1, 'rgba(12,9,5,0)'); x.fillStyle = gr; x.fillRect(px - w / 2, py, w, l);
        x.fillStyle = 'rgba(12,9,5,.4)'; x.beginPath(); x.arc(px, py + l * .86, w * .9, 0, 7); x.fill(); // the bead at the end of a run
      }
      for (let i = 0; i < 7; i++) blob(W * (.25 + rnd() * .5), H * (.35 + rnd() * .4), 30 + rnd() * 50, 18 + rnd() * 30, '14,10,6', .38); // greasy hand smears round the handle
      blob(W / 2, H * .88, 150, 40, '10,8,5', .5);                                                       // oil soaked into the bottom bar
      for (let i = 0; i < 70; i++) { x.fillStyle = `rgba(${120 + rnd() * 40 | 0},${64 + rnd() * 24 | 0},30,${.25 + rnd() * .3})`; const px = rnd() * W, py = H * (.55 + rnd() * .45), r = 1 + rnd() * 5; x.beginPath(); x.ellipse(px, py, r, r * .7, 0, 0, 7); x.fill(); } // rust specks
      for (let i = 0; i < 40; i++) { x.strokeStyle = 'rgba(220,225,225,.22)'; x.lineWidth = 1; const px = rnd() * W, py = rnd() * H; x.beginPath(); x.moveTo(px, py); x.lineTo(px + 12 + rnd() * 50, py + (rnd() - .5) * 14); x.stroke(); } // scuffs
    } else if (kind === 'wall') {
      const g = x.createLinearGradient(0, 0, 0, H); g.addColorStop(0, 'rgba(60,45,30,0)'); g.addColorStop(.55, 'rgba(60,45,30,.15)'); g.addColorStop(1, 'rgba(45,34,22,.62)'); x.fillStyle = g; x.fillRect(0, 0, W, H); // the foot of the wall: mud splashed up
      for (let i = 0; i < 220; i++) { x.fillStyle = `rgba(48,36,24,${.15 + rnd() * .35})`; const px = rnd() * W, py = H * (1 - Math.pow(rnd(), 1.8) * .85), r = 1 + rnd() * 4; x.beginPath(); x.arc(px, py, r, 0, 7); x.fill(); } // splatter
      for (let i = 0; i < 9; i++) blob(rnd() * W, H * (.2 + rnd() * .5), 40 + rnd() * 60, 14 + rnd() * 20, '20,16,12', .25);                             // soot and oil patches
    } else {
      blob(W / 2, H / 2, W * .5, H * .6, '70,58,42', .22);                                                // general dirt
      for (const [sx, dir] of [[-.17, -.25], [.17, .25]]) for (let k = 0; k < 4; k++) { // two pairs of tyre marks swinging out of the bay (the top of the canvas is away from the door)
        x.strokeStyle = `rgba(18,16,14,${.55 - k * .08})`; x.lineWidth = 7 - k; x.lineCap = 'round'; x.beginPath();
        const x0 = W * (.5 + sx) + k * 12 * Math.sign(sx || 1), y0 = H;
        x.moveTo(x0, y0); x.bezierCurveTo(x0 + W * dir * .1, H * .65, x0 + W * dir * .55, H * .35, x0 + W * dir * .95, H * (.05 + k * .03)); x.stroke();
      }
      for (const [px, py, r] of [[W * .36, H * .5, 46], [W * .62, H * .66, 36], [W * .22, H * .82, 26]]) { // oil puddles with a faint rainbow sheen
        blob(px, py, r * 1.3, r * .75, '12,12,14', .72); blob(px - r * .2, py - r * .15, r * .6, r * .3, '70,90,120', .35);
        for (let i = 0; i < 6; i++) { x.fillStyle = 'rgba(14,12,12,.55)'; x.beginPath(); x.arc(px + (rnd() - .5) * r * 3.2, py + (rnd() - .5) * r * 1.6, 1 + rnd() * 3, 0, 7); x.fill(); } // drips round them
      }
      for (let i = 0; i < 160; i++) { x.fillStyle = `rgba(30,26,22,${.1 + rnd() * .22})`; x.fillRect(rnd() * W, rnd() * H, 1 + rnd() * 3, 1 + rnd() * 3); }
    }
    const t = new THREE.CanvasTexture(c); t.anisotropy = 8;
    return new THREE.MeshStandardMaterial({ map: t, transparent: true, roughness: .8, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  });
}
// A vehicle bay in a hut's front wall: a wide steel roller shutter (horizontal slats, a bottom bar and a pull handle) in a heavy frame, a yellow-and-black striped lintel, a lamp over it and tyre-worn concrete in front.
function garageDoor(node, y0, dh, z, root = node, wallW = 7.9) { // root: what stays when the front wall is blown away (the apron, the drums, the tyres)
  const m = detailMats(), dw = 4.4, slat = cached('garageSlat', () => [pmat(0x6f7478, .55, .5), pmat(0x62676b, .55, .5)]), steel = cached('garageFrame', () => pmat(0x34383b, .6, .5));
  const n = 8, sh = (dh - .12) / n;
  for (let i = 0; i < n; i++) { add(node, new THREE.BoxGeometry(dw, sh * .88, .07), slat[i % 2], 0, y0 + .12 + sh * (i + .5), z - .05); add(node, new THREE.BoxGeometry(dw, sh * .12, .09), steel, 0, y0 + .12 + sh * (i + 1), z - .05); } // slats and the grooves between
  add(node, new THREE.BoxGeometry(dw, .12, .12), steel, 0, y0 + .06, z - .07);                         // the bottom bar
  add(node, new THREE.BoxGeometry(.5, .06, .08), m.iron, 0, y0 + .3, z - .12);                          // pull handle
  [-1, 1].forEach(sx => add(node, new THREE.BoxGeometry(.2, dh + .1, .16), steel, sx * (dw / 2 + .1), y0 + dh / 2, z - .07)); // frame posts
  add(node, new THREE.BoxGeometry(dw + .6, .24, .18), steel, 0, y0 + dh + .08, z - .08);                // lintel beam
  const stripe = cached('garageStripe', () => [pmat(0xc9a21c, .6, .1), pmat(0x1b1b1a, .7, .1)]);
  for (let i = 0; i < 12; i++) add(node, new THREE.BoxGeometry((dw + .6) / 12, .16, .02), stripe[i % 2], -(dw + .6) / 2 + (i + .5) * (dw + .6) / 12, y0 + dh + .08, z - .18); // hazard stripes
  add(node, new THREE.CylinderGeometry(.09, .12, .14, 8), m.iron, 0, y0 + dh + .4, z - .2).rotation.x = PI / 2; // lamp
  const ay = Math.max(.05, y0 - .1);
  add(root, new THREE.BoxGeometry(dw + .8, .1, 1.6), cached('garageApron', () => pmat(0x6a6a64, .95, 0)), 0, ay, z - .9); // concrete apron
  const decal = (w, h, kind, x, y, zz, flat, into = node) => { // a transparent dirt layer (oil, grease, skid marks), lying on the apron or hung on a wall
    const g = new THREE.Mesh(new THREE.PlaneGeometry(w, h), garageGrime(kind)); g.position.set(x, y, zz); if (flat) g.rotation.x = -PI / 2; g.renderOrder = 2; into.add(g); return g;
  };
  decal(dw - .1, dh - .06, 'door', 0, y0 + .12 + (dh - .06) / 2, z - .102);                          // oil runs, grease smears and rust on the shutter
  decal(wallW, 1.25, 'wall', 0, y0 + .62, z + .012);                                                    // mud splash and soot along the foot of the wall
  decal(dw + .8, 1.6, 'apron', 0, ay + .056, z - .9, true, root);                                          // skid marks, oil puddles and drips
  // what a garage has lying about: oil drums (one tipped over), a stack of tyres, a jerry can
  const drumMat = cached('garageDrums', () => [pmat(0x8a3b24, .6, .5), pmat(0x3d4f5a, .6, .5), pmat(0x1a1a1a, .9, 0)]);
  const drum = (x, zz, k, lying) => {
    const g = new THREE.Group(); g.position.set(x, ay + .05, zz); root.add(g);
    add(g, new THREE.CylinderGeometry(.28, .28, .85, 14), drumMat[k], 0, .425, 0);
    for (const ry of [.14, .425, .71]) add(g, new THREE.TorusGeometry(.285, .018, 5, 14), drumMat[2], 0, ry, 0).rotation.x = PI / 2;
    add(g, new THREE.CylinderGeometry(.2, .2, .03, 12), drumMat[2], 0, .86, 0);
    if (lying) { g.rotation.z = PI / 2; g.position.y += .28; g.position.x += .1; g.rotation.y = .5; }
    return g;
  };
  drum(-3.15, z - .6, 0); drum(-3.7, z - .55, 1); drum(-3.4, z - 1.5, 0, true);
  for (let i = 0; i < 3; i++) add(root, new THREE.TorusGeometry(.3, .12, 8, 16), drumMat[2], 3.2 + (i === 1 ? .04 : 0), ay + .17 + i * .24, z - .6).rotation.x = PI / 2; // the tyres
  add(root, new THREE.BoxGeometry(.36, .46, .16), cached('jerryCan', () => pmat(0x5d6b34, .6, .3)), 3.75, ay + .28, z - .45);                                 // jerry can
  add(root, new THREE.BoxGeometry(.12, .1, .06), drumMat[2], 3.75, ay + .55, z - .45);
}
function barredWindow(node, x, y, z, trim, sc = 1) {
  const m = detailMats(), frame = m[trim], ww = .9 * sc, wh = .6 * sc;
  add(node, new THREE.BoxGeometry(ww, wh, .04), m.glass, x, y, z - .03);
  add(node, new THREE.BoxGeometry(.04, wh, .05), frame, x, y, z - .05);                             // cross divider
  add(node, new THREE.BoxGeometry(ww, .04, .05), frame, x, y, z - .05);
  [-1, 1].forEach(s => {
    add(node, new THREE.BoxGeometry(.08, wh + .12, .08), frame, x + s * (ww / 2 + .04), y, z - .05); // frame sides
    add(node, new THREE.BoxGeometry(ww + .16, .08, .08), frame, x, y + s * (wh / 2 + .04), z - .05); // top / bottom
  });
  add(node, new THREE.BoxGeometry(ww + .3, .06, .18), frame, x, y - wh / 2 - .1, z - .1);           // sill
  for (let i = 0; i < 4; i++) add(node, new THREE.CylinderGeometry(.018, .018, wh + .04, 6), m.iron, x - ww * .375 + i * ww * .25, y, z - .11); // bars
}

// Wooden window with glass, a cross divider and a pair of open shutters (for the huts).
function shutteredWindow(node, x, y, z) {
  const m = detailMats(), ww = .8, wh = .65;
  add(node, new THREE.BoxGeometry(ww, wh, .04), m.glass, x, y, z - .03);
  add(node, new THREE.BoxGeometry(.04, wh, .05), m.wood, x, y, z - .05);
  add(node, new THREE.BoxGeometry(ww, .04, .05), m.wood, x, y, z - .05);
  [-1, 1].forEach(s => {
    add(node, new THREE.BoxGeometry(.08, wh + .12, .08), m.wood, x + s * (ww / 2 + .04), y, z - .05);
    add(node, new THREE.BoxGeometry(ww + .16, .08, .08), m.wood, x, y + s * (wh / 2 + .04), z - .05);
    const shutter = add(node, new THREE.BoxGeometry(ww / 2, wh + .1, .04), m.plank, x + s * (ww * .75 + .1), y, z - .12); // swung open
    shutter.rotation.y = s * .5;
  });
  add(node, new THREE.BoxGeometry(ww + .24, .06, .16), m.wood, x, y - wh / 2 - .09, z - .09); // sill
}

// Four wall panels around a plank floor. The wall the blast goes through (plan.side) comes in two
// versions: `breachWall` (intact) and `breachWallBroken` (hidden; a ragged gap down to the floor,
// broken charred sections either side, rubble spilling out). The front wall carries the door and
// windows. An `exit` marker sits on the ground outside the breach, for people coming out.
// The blown-out garage's inside: the floor scorched black and cracked, soot climbing the walls, roof sheets fallen in, a burnt-out drum and tyre, broken concrete.
function garageWreck(g, { w, d, y0, rand, burnt }) {
  const fy = y0 + .05, T = .2, ink = (key, W, H, draw) => cached('garageWreckTex:' + key, () => {
    const c = document.createElement('canvas'); c.width = W; c.height = H; draw(c.getContext('2d'), W, H);
    return new THREE.MeshStandardMaterial({ map: new THREE.CanvasTexture(c), transparent: true, roughness: .95, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
  });
  const r2 = seededRandom(77);
  const scorch = ink('floor', 512, 512, (x, W, H) => {
    for (let i = 0; i < 16; i++) { const px = W * (.2 + r2() * .6), py = H * (.2 + r2() * .6), r = 70 + r2() * 150, gr = x.createRadialGradient(px, py, 0, px, py, r); gr.addColorStop(0, `rgba(8,7,6,${.55 + r2() * .3})`); gr.addColorStop(.6, 'rgba(14,12,10,.4)'); gr.addColorStop(1, 'rgba(14,12,10,0)'); x.fillStyle = gr; x.fillRect(px - r, py - r, 2 * r, 2 * r); } // the burn
    x.strokeStyle = 'rgba(0,0,0,.65)'; x.lineWidth = 2; for (let i = 0; i < 9; i++) { let px = W * r2(), py = H * r2(); x.beginPath(); x.moveTo(px, py); for (let k = 0; k < 6; k++) { px += (r2() - .5) * 90; py += (r2() - .5) * 90; x.lineTo(px, py); } x.stroke(); } // cracks
    for (let i = 0; i < 260; i++) { x.fillStyle = `rgba(${r2() > .8 ? '90,60,30' : '10,9,8'},${.3 + r2() * .5})`; x.fillRect(W * r2(), H * r2(), 1 + r2() * 4, 1 + r2() * 4); } // cinders
  });
  const sootMat = ink('soot', 256, 256, (x, W, H) => {
    const gr = x.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, 'rgba(6,5,4,.88)'); gr.addColorStop(.55, 'rgba(10,9,8,.45)'); gr.addColorStop(1, 'rgba(12,10,8,.1)'); x.fillStyle = gr; x.fillRect(0, 0, W, H);
    for (let i = 0; i < 30; i++) { const px = r2() * W, l = 60 + r2() * 180, w = 3 + r2() * 14, g2 = x.createLinearGradient(0, H - l, 0, H); g2.addColorStop(0, 'rgba(4,3,3,0)'); g2.addColorStop(1, 'rgba(4,3,3,.5)'); x.fillStyle = g2; x.fillRect(px, H - l, w, l); } // flame tongues
    for (let i = 0; i < 160; i++) { x.fillStyle = `rgba(0,0,0,${.1 + r2() * .3})`; x.fillRect(r2() * W, r2() * H, 1 + r2() * 3, 1 + r2() * 5); }
  });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(w - .3, d - .3), scorch); floor.rotation.x = -PI / 2; floor.position.set(0, fy + .012, 0); g.add(floor);
  const wallH = 1.9, side = (x, z, ry, len) => { const p = new THREE.Mesh(new THREE.PlaneGeometry(len, wallH), sootMat); p.position.set(x, y0 + wallH / 2, z); p.rotation.y = ry; g.add(p); };
  side(-w / 2 + T + .01, 0, PI / 2, d - .4); side(w / 2 - T - .01, 0, -PI / 2, d - .4); side(0, d / 2 - T - .01, PI, w - .4); // soot up the side and back walls
  const sheet = new THREE.BoxGeometry(1.4, .05, .9);
  for (let i = 0; i < 9; i++) { // roof sheets fallen in, some leaning on the walls
    const m = add(g, sheet, i % 3 ? burnt : cached('garageSheetGrey', () => pmat(0x4a4c4c, .7, .5)), (rand() - .5) * (w - 2), fy + .06 + rand() * .1, (rand() - .5) * (d - 2));
    m.rotation.set((rand() - .5) * .5, rand() * 3, (rand() - .5) * .5);
    if (i > 5) { m.position.set((i % 2 ? 1 : -1) * (w / 2 - T - .3), fy + .7, (rand() - .5) * (d - 3)); m.rotation.set(0, PI / 2, (i % 2 ? 1 : -1) * 1.1); m.scale.set(1, 1, 1.3); }
  }
  const drum = add(g, new THREE.CylinderGeometry(.28, .28, .85, 12), burnt, (rand() - .5) * (w - 3), fy + .28, (rand() - .5) * (d - 3)); drum.rotation.set(PI / 2, 0, rand() * 3); // a burnt-out drum on its side
  add(g, new THREE.TorusGeometry(.3, .12, 8, 14), burnt, (rand() - .5) * (w - 3), fy + .13, d / 2 - 1.2).rotation.x = PI / 2;                                                 // a charred tyre
  for (let i = 0; i < 14; i++) add(g, new THREE.DodecahedronGeometry(.12 + rand() * .22, 0), i % 2 ? burnt : cached('garageChunk', () => pmat(0x6a6b66, .95, 0, { flatShading: true })), (rand() - .5) * (w - 1.4), fy + .08, (rand() - .5) * (d - 1.4)).rotation.set(rand() * 3, rand() * 3, rand() * 3); // broken concrete
}
function shell(root, { w, d, h, y0, mat, plan, rand, door, windows = [], trim = 'paint', garage = false, sc = 1 }) {
  const T = .2, burnt = cached('wallBurnt', () => pmat(0x2c2924, .95, 0));
  furnish(root, { w, d, y0, plan, rand, garage });
  const WALLS = { // length, centre position for offset t along the wall, rotation, outward direction
    front: { len: w, at: t => [t, -d / 2 + T / 2], rot: 0, out: [0, -1] },
    back: { len: w, at: t => [t, d / 2 - T / 2], rot: 0, out: [0, 1] },
    west: { len: d, at: t => [-w / 2 + T / 2, t], rot: PI / 2, out: [-1, 0] },
    east: { len: d, at: t => [w / 2 - T / 2, t], rot: PI / 2, out: [1, 0] },
  };
  const piece = (node, side, len, hh, m, t) => {
    const [x, z] = WALLS[side].at(t), b = add(node, new THREE.BoxGeometry(len, hh, T), m, x, y0 + hh / 2, z);
    b.rotation.y = WALLS[side].rot;
    return b;
  };
  for (const side of Object.keys(WALLS)) {
    let node = root;
    if (side === plan.side) { node = new THREE.Group(); node.name = 'breachWall'; root.add(node); }
    piece(node, side, WALLS[side].len, h, mat, 0);
    if (side === 'front') {
      const z = -d / 2 - .02;
      if (garage) garageDoor(node, y0, Math.min(1.75, h - .2), z, root, w);
      else doorway(node, door, y0, Math.min(1.7, h - .25), z, trim, sc);
      windows.forEach(x => barredWindow(node, x, y0 + h * .62, z, trim, sc));
    }
  }

  const broken = new THREE.Group(); broken.name = 'breachWallBroken'; broken.visible = false; root.add(broken);
  const wall = WALLS[plan.side], COL = .4, [ox, oz] = wall.out;
  for (let t = -wall.len / 2 + COL / 2; t < wall.len / 2; t += COL) {
    const dist = Math.abs(t - plan.gapAt) - (plan.gapHalf + (rand() - .5) * .5);
    if (dist < 0) continue; // the breach
    const near = dist < 1.1, b = piece(broken, plan.side, COL * 1.02, near ? h * (.25 + rand() * .55) : h, near ? burnt : mat, t);
    if (near) b.rotation.x = (rand() - .5) * .12;
  }
  const [gx, gz] = wall.at(plan.gapAt);
  for (let i = 0; i < 7; i++) { // rubble spilling out of the breach
    const along = (rand() - .5) * plan.gapHalf * 2.4, outward = .3 + rand() * 1.2;
    const r = add(broken, new THREE.DodecahedronGeometry(.2 + rand() * .25, 0), i % 2 ? burnt : mat,
      gx + ox * outward + Math.abs(oz) * along, y0 * .5 + .12, gz + oz * outward + Math.abs(ox) * along);
    r.rotation.set(rand() * 3, rand() * 3, rand() * 3); r.scale.y = .6;
  }
  wreckedInterior(broken, { w, d, y0, plan, rand, burnt });
  if (garage) garageWreck(broken, { w, d, y0, rand, burnt });
  const exit = new THREE.Object3D(); exit.name = 'exit'; exit.position.set(gx + ox * 1.5, 0, gz + oz * 1.5); root.add(exit);
}

// The garage's blast: the whole front wall and nearly all of the roof go, so the vehicle inside is plainly in view (a few burnt sheets are left in the corners).
function garagePlan(w, d) {
  const hx = 0, hz = -d / 2 + d * .55, rx = w * .5, rz = d * .62;
  return { side: 'front', hx, hz, gapAt: 0, gapHalf: w * .43, reach: (x, z) => Math.hypot((x - hx) / rx, (z - hz) / rz) };
}
// What is left of the roller shutter: torn slats on the ground in front of the bay, the frame posts bent over, the lintel fallen.
function mangledShutter(g, rand, d = 6.1) {
  const slat = cached('garageSlat', () => [pmat(0x6f7478, .55, .5), pmat(0x62676b, .55, .5)]), steel = cached('garageFrame', () => pmat(0x34383b, .6, .5)), burnt = cached('wallBurnt', () => pmat(0x2c2924, .95, 0));
  for (let i = 0; i < 7; i++) {
    const w = 1 + rand() * 1.6, b = add(g, new THREE.BoxGeometry(w, .06, .22), i % 3 ? slat[i % 2] : burnt, (rand() - .5) * 4.2, .1 + rand() * .1, -d / 2 - .15 - rand() * 1.1);
    b.rotation.set((rand() - .5) * .5, (rand() - .5) * 1.2, (rand() - .5) * .35);
  }
  for (const sx of [-1, 1]) {
    const p = add(g, new THREE.BoxGeometry(.2, 1.9, .16), steel, sx * 2.5, .95, -d / 2); p.rotation.z = sx * (.9 + rand() * .3); p.position.set(sx * 2.8, .6, -d / 2 - .15 - rand() * .4);
  }
  const l = add(g, new THREE.BoxGeometry(4.6, .24, .18), steel, .4, .2, -d / 2 - 1.15); l.rotation.set(.1, .25, .05);
}

// POW barracks, ~8.6 x 7 m: concrete foundation, walls, and a green corrugated-metal shed roof
// sloping toward the front (-Z). Named parts: roof / roofBroken, breachWall / breachWallBroken
// (swapped when destroyed), exit (where people come out once it's blown open).
// roof: 'garage' (stage 5's disguised vehicle bay: a grey hut with a roller shutter instead of the door), 'metal' (green corrugated, stage 1), 'grey' (grey corrugated, stage 2, with weathered grey walls) or 'brown' (brown corrugated on brown walls, stage 4).
export function buildBarracks(seed = Math.random() * 1e9, breach = 'front', roof = 'metal') {
  const garage = roof === 'garage'; if (garage) roof = 'grey';
  const m = mats(), rand = seededRandom(seed), root = new THREE.Group(); root.name = 'barracks';
  const wall = roof === 'grey' ? cached('barracksWallGrey', () => pmat(0x5e5e58, .9, 0)) : roof === 'brown' ? cached('barracksWallBrown', () => pmat(0x5a4426, .9, 0)) : cached('barracksWall', () => pmat(0x4a5238, .9, 0));
  if (roof === 'brown') root.userData.rubble = 0x5a4426; // (the wreck's pieces take the hut's own colour)
  if (roof === 'grey') root.userData.rubble = 0x55554f;
  const W = garage ? 9.2 : 7.9, D = garage ? 7.6 : 6.1; // (the garage is bigger: the medium tank parks in it nose to the door, gun and all)
  const plan = garage ? garagePlan(W, D) : blastPlan(rand, W, D, breach);
  if (garage) root.userData.garage = true; // (world.js: its blast lets the tank inside out, and frees no prisoner)
  add(root, new THREE.BoxGeometry(W + .5, .5, D + .5), m.concrete, 0, .25, 0);
  for (let i = -3; i <= 3; i++) add(root, new THREE.BoxGeometry(.6, .12, .05), m.concreteDark, i * 1.1 * W / 7.9, .27, -(D + .5) / 2 - .01); // vent slits
  shell(root, { w: W, d: D, h: 1.95, y0: .5, mat: wall, plan, rand, door: 1.8, windows: garage ? [-(W / 2 - .9), W / 2 - .9] : [-2.4, -.3], garage, sc: garage ? 1 : .82 }); // (the huts' doors and windows: a bit smaller, in every stage)
  shedRoof(root, { w: W + .2, d: D + .1, low: 2.5, high: 3.1, kind: roof, plan, rand, back: .1 });
  if (garage) mangledShutter(root.getObjectByName('breachWallBroken'), rand, D);
  return root;
}

// Compound hut, ~6 x 8 m: plank walls and a plank gable (^) roof running front to back, with a low
// post fence round it. `breach` picks the wall the blast tears through: 'front' (north), 'back' (south, the windowed side facing the camera), 'east' or 'west'.
// Named parts as for the barracks.
// look: 'brown' (stage 1) or 'straw' (light yellowish-brown planks and roof, stage 2).
// The POW huts' vertical plank wall material, for another building that should match them (the engineer hut in the snow level): `rep` boards tiles across a wall.
export function hutBoardsMaterial(rep = 4.6) {
  return cached('hutBoardsRep:' + rep, () => { const t = roofTexture('ridge').clone(); t.needsUpdate = true; t.wrapS = THREE.RepeatWrapping; t.repeat.set(rep, 1); return pmat(0xa08060, .9, 0, { map: t }); });
}

export function buildTent(seed = Math.random() * 1e9, breach = 'east', look = 'brown', windows = 'south', roofLook = null) { // roofLook: the roof sheets of another building (the engineer hut's 'brown' sheet metal); windows: which wall carries them: 'south' (the short end facing the camera, as in stage 1) or 'east' (a long side: a hut turned to face south)
  const m = mats(), rand = seededRandom(seed), root = new THREE.Group(); root.name = 'tent';
  const plan = blastPlan(rand, 5.2, 7.0, breach);
  const straw = look === 'straw', wallKind = straw ? 'straw' : 'ridge', roofKind = roofLook ?? wallKind;
  const boards = cached('hutBoards:' + look, () => { // vertical plank walls, about 0.45 m boards
    const t = roofTexture(wallKind).clone(); t.needsUpdate = true; t.wrapS = THREE.RepeatWrapping; t.repeat.set(3, 1);
    return pmat(straw ? 0xd2b888 : 0xa08060, .9, 0, { map: t });
  });
  shell(root, { w: 5.2, d: 7.0, h: 2.0, y0: 0, mat: boards, plan, rand, door: 0, trim: 'wood' });
  gableRoof(root, { w: 5.7, d: 7.3, eave: 2.0, ridge: 3.1, kind: roofKind, plan, rand, wallMat: boards, wallW: 5.2, wallD: 7.0, pitch: roofLook ? .48 : .75 });
  const wood = detailMats().wood;
  [-1, 1].forEach(sx => [-1, 1].forEach(sz => add(root, new THREE.BoxGeometry(.16, 2.05, .16), wood, sx * 2.6, 1.02, sz * 3.5))); // corner posts
  // the south side (facing the camera): two shuttered windows and a louvred vent in the gable
  if (windows === 'east') { // a long side: three shuttered windows along the east wall (turned to face south, the way the hut is placed)
    const side = new THREE.Group(); side.position.set(2.62, 0, 0); side.rotation.y = -PI / 2; (plan.side === 'east' ? root.getObjectByName('breachWall') : root).add(side);
    [-2.1, 0, 2.1].forEach(x => shutteredWindow(side, x, 1.2, 0));
  } else {
    const south = new THREE.Group(); south.position.set(0, 0, 3.52); south.rotation.y = PI; (plan.side === 'back' ? root.getObjectByName('breachWall') : root).add(south); // (on the south wall: with it, if that is the wall the blast goes through)
    [-1.3, 1.3].forEach(x => shutteredWindow(south, x, 1.2, 0));
    for (let i = 0; i < 4; i++) add(south, new THREE.BoxGeometry(.7 - i * .12, .05, .07), wood, 0, 2.3 + i * .14, -.16).rotation.x = .5;
  }
  // fence of short posts round the hut (the dashed border on the NES sprite), open in line with
  // the breach so the way out is clear
  const post = new THREE.BoxGeometry(.12, .5, .12), GATE = 1.4; // half-width of the opening
  const open = (sideX, sideZ, x, z) => plan.side === 'front' ? sideZ < 0 && Math.abs(x - plan.hx) < GATE
    : plan.side === 'back' ? sideZ > 0 && Math.abs(x - plan.hx) < GATE
    : (plan.side === 'east' ? sideX > 0 : sideX < 0) && Math.abs(z - plan.hz) < GATE;
  if (!roofLook) for (let i = 0; i <= 10; i++) [-1, 1].forEach(s => { // (no fence round the secret level's huts: roofLook is only given there)
    const x = -3.4 + i * .68, z = -4.35 + i * .87;
    if (!open(0, s, x, s * 4.35)) add(root, post, m.canvas, x, .25, s * 4.35);
    if (!open(s, 0, s * 3.4, z)) add(root, post, m.canvas, s * 3.4, .25, z);
  });
  if (straw) { // stage 2: the rest of the hut in matching light, sun-faded tones
    const d = detailMats(), swap = cached('strawSwap', () => new Map([
      [d.wood, pmat(0x8a6c42, .9, 0)],                                    // posts, frames, louvres, trim
      [d.plank, pmat(0xcdb27c, .9, 0, { map: roofTexture('straw') })],    // shutters and doors
      [m.canvas, pmat(0xb09060, .9, 0, { flatShading: true })],           // the fence
    ]));
    root.traverse(o => { if (o.isMesh && swap.has(o.material)) o.material = swap.get(o.material); });
  }
  return root;
}

// Harbour gate (stage 3), ~10 m wide: the other stages' concrete posts, with doors of weathered
// orange corrugated steel in a dark frame with cross-bracing and rust, and razor wire along their
// top like the walls'. Named parts:
// doorL, doorR (as buildGate).
function harbourDoorTexture() {
  return cached('harbourDoorTex', () => {
    const W = 256, H = 160, c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d');
    const rnd = seededRandom(77);
    x.fillStyle = '#b8601c'; x.fillRect(0, 0, W, H);
    for (let i = 0; i < W; i += 10) { x.fillStyle = 'rgba(255,220,170,.12)'; x.fillRect(i, 0, 3, H); x.fillStyle = 'rgba(40,15,0,.22)'; x.fillRect(i + 6, 0, 4, H); } // corrugations
    for (let i = 0; i < 40; i++) { // rust runs and grime
      const px = rnd() * W, len = 20 + rnd() * 100, g = x.createLinearGradient(0, 0, 0, len);
      g.addColorStop(0, 'rgba(90,35,10,.4)'); g.addColorStop(1, 'rgba(90,35,10,0)'); x.fillStyle = g; x.fillRect(px, rnd() * H * .5, 2 + rnd() * 4, len);
    }
    const g = x.createLinearGradient(0, H * .75, 0, H); g.addColorStop(0, 'rgba(40,30,20,0)'); g.addColorStop(1, 'rgba(40,30,20,.45)'); x.fillStyle = g; x.fillRect(0, 0, W, H);
    x.fillStyle = '#e8e2d0'; x.globalAlpha = .55; x.font = '700 18px monospace'; x.fillText('NO ENTRY', 70, 40); x.globalAlpha = 1; // stencil
    const t = new THREE.CanvasTexture(c); t.anisotropy = 8; return t;
  });
}
// The airbase gate's leaves: heavy steel plate painted orange (smooth gloss-worn paint, no grain or planks, so it reads as metal): a grid of riveted plates with recessed seams, a hazard stripe along the foot and the meeting edge,
// a stencilled number, rust and soot runs, and paint chipped away to bare gunmetal along the seams and edges. variant: the two leaves are not twins.
function airbaseGateTexture(variant) {
  return cached('airbaseGate:' + variant, () => {
    const W = 512, H = 288, c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d'), rnd = seededRandom(9100 + variant * 77);
    x.fillStyle = '#c4691f'; x.fillRect(0, 0, W, H); // orange paint
    for (let n = 0; n < 26; n++) { const px = rnd() * W, py = rnd() * H, r = 30 + rnd() * 60, g = x.createRadialGradient(px, py, 0, px, py, r); g.addColorStop(0, `rgba(${rnd() < .5 ? '110,48,10' : '246,160,84'},${.07 + rnd() * .09})`); g.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = g; x.fillRect(px - r, py - r, r * 2, r * 2); } // tonal patches
    const cols = 3, rows = 3, pw = W / cols, ph = (H - 26) / rows;
    for (let r = 0; r <= rows; r++) { x.fillStyle = 'rgba(54,22,6,.8)'; x.fillRect(0, r * ph - 2, W, 5); x.fillStyle = 'rgba(255,206,150,.26)'; x.fillRect(0, r * ph + 3, W, 2); }
    for (let q = 0; q <= cols; q++) { x.fillStyle = 'rgba(54,22,6,.8)'; x.fillRect(q * pw - 2, 0, 5, H - 26); x.fillStyle = 'rgba(255,206,150,.26)'; x.fillRect(q * pw + 3, 0, 2, H - 26); } // plate seams
    for (let r = 0; r < rows; r++) for (let q = 0; q < cols; q++) for (const [dx, dy] of [[12, 12], [pw - 12, 12], [12, ph - 12], [pw - 12, ph - 12], [pw / 2, 12], [pw / 2, ph - 12]]) { const px = q * pw + dx, py = r * ph + dy; x.fillStyle = 'rgba(60,26,8,.85)'; x.beginPath(); x.arc(px, py, 4.6, 0, 7); x.fill(); x.fillStyle = 'rgba(255,214,168,.55)'; x.beginPath(); x.arc(px - 1.2, py - 1.4, 2, 0, 7); x.fill(); } // rivets, domed and painted over
    for (let i = 0; i < 34; i++) { const px = rnd() * W, len = 20 + rnd() * 110, g = x.createLinearGradient(0, 0, 0, len); g.addColorStop(0, `rgba(${rnd() < .6 ? '104,44,14' : '30,24,20'},${.16 + rnd() * .2})`); g.addColorStop(1, 'rgba(0,0,0,0)'); x.save(); x.translate(px, rnd() * H * .55); x.fillStyle = g; x.fillRect(0, 0, 2 + rnd() * 5, len); x.restore(); } // rust and soot runs
    for (let i = 0; i < 90; i++) { // paint chipped away to the bare steel, mostly along the seams and the edges, each chip with a rim of rust
      const onSeam = rnd() < .7, px = onSeam ? (rnd() < .5 ? Math.round(rnd() * cols) * pw : rnd() * W) : rnd() * W, py = onSeam && px % pw === 0 ? rnd() * (H - 26) : (rnd() < .5 ? Math.round(rnd() * rows) * ph : rnd() * (H - 26)), r = 2 + rnd() * 6;
      x.beginPath(); for (let k = 0; k < 7; k++) { const a = k / 7 * 6.283, q = .6 + rnd() * .7; k ? x.lineTo(px + Math.cos(a) * r * q, py + Math.sin(a) * r * q * .8) : x.moveTo(px + Math.cos(a) * r * q, py + Math.sin(a) * r * q * .8); } x.closePath(); x.fillStyle = '#6a7279'; x.fill(); x.strokeStyle = 'rgba(112,52,18,.8)'; x.lineWidth = 1.4; x.stroke();
    }
    x.fillStyle = '#d6b020'; x.fillRect(0, H - 26, W, 26); x.fillStyle = '#161614'; for (let i = -2; i < 18; i++) { x.beginPath(); x.moveTo(i * 36, H); x.lineTo(i * 36 + 18, H); x.lineTo(i * 36 + 36, H - 26); x.lineTo(i * 36 + 18, H - 26); x.fill(); } // hazard stripe along the foot
    const meet = variant === 0 ? W - 22 : 0; x.fillStyle = '#d6b020'; x.fillRect(meet, 0, 22, H - 26); x.fillStyle = '#161614'; for (let i = -2; i < 12; i++) { x.beginPath(); x.moveTo(meet, i * 44); x.lineTo(meet + 22, i * 44 - 22); x.lineTo(meet + 22, i * 44 + 0); x.lineTo(meet, i * 44 + 22); x.fill(); } // and down the meeting edge
    x.fillStyle = 'rgba(244,238,224,.62)'; x.textAlign = 'center'; x.font = 'bold 54px Impact, "Arial Black", sans-serif'; x.fillText(variant ? '07' : 'A-1', W / 2, H * .5); // stencil
    for (let i = 0; i < 160; i++) { x.fillStyle = 'rgba(190,100,34,.8)'; x.fillRect(W / 2 + (rnd() - .5) * 150, H * .5 - 40 + rnd() * 50, 2 + rnd() * 6, 2 + rnd() * 3); } // (worn away)
    const e = x.createLinearGradient(0, 0, 0, H); e.addColorStop(0, 'rgba(0,0,0,.25)'); e.addColorStop(.12, 'rgba(0,0,0,0)'); e.addColorStop(.7, 'rgba(0,0,0,0)'); e.addColorStop(1, 'rgba(0,0,0,.2)'); x.fillStyle = e; x.fillRect(0, 0, W, H);
    const t = new THREE.CanvasTexture(c); t.anisotropy = 8; return t;
  });
}
// ---- the gate's textures ---------------------------------------------------------------------------------------------------------------------------------------------------------
// A leaf's painted steel: olive-drab paint over a faintly mottled, grimy sheet, chipped away along the edges and here and there to the dark primer (with a rim of rust), rust streaks running down
// from the straps and the top edge, and a yellow-and-black hazard stripe along the bottom edge. variant: which of the two (the leaves are not twins).
function gateDoorTexture(variant) {
  return cached('gateDoor:' + variant, () => {
    const W = 512, H = 288, c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d'), rnd = seededRandom(7001 + variant * 131);
    x.fillStyle = '#5b6538'; x.fillRect(0, 0, W, H); // olive drab
    for (let n = 0; n < 40; n++) { // mottled: broad light and dark patches in the paint
      const px = rnd() * W, py = rnd() * H, r = 30 + rnd() * 80, g = x.createRadialGradient(px, py, 0, px, py, r), light = rnd() < .5;
      g.addColorStop(0, light ? `rgba(150,160,95,${.05 + rnd() * .08})` : `rgba(25,30,12,${.06 + rnd() * .1})`); g.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = g; x.fillRect(px - r, py - r, r * 2, r * 2);
    }
    for (let n = 0; n < 1400; n++) { x.fillStyle = rnd() < .5 ? 'rgba(255,255,230,.05)' : 'rgba(0,0,0,.07)'; x.fillRect(rnd() * W, rnd() * H, 1 + rnd() * 2, 1 + rnd() * 3); } // grain
    const grime = x.createLinearGradient(0, H * .6, 0, H); grime.addColorStop(0, 'rgba(20,16,8,0)'); grime.addColorStop(1, 'rgba(20,16,8,.35)'); x.fillStyle = grime; x.fillRect(0, H * .6, W, H * .4); // dirt thrown up from the ground
    // rust streaks: down from the top edge and from the straps (at about .2, .5 and .8 of the height), a few to each, fading as they run
    for (let n = 0; n < 22; n++) {
      const sy = [0, H * .2, H * .5, H * .8][Math.floor(rnd() * 4)], sx = rnd() * W, len = 30 + rnd() * 110, w = 2 + rnd() * 6, g = x.createLinearGradient(0, sy, 0, sy + len);
      g.addColorStop(0, `rgba(135,72,30,${.35 + rnd() * .3})`); g.addColorStop(1, 'rgba(135,72,30,0)'); x.fillStyle = g;
      x.beginPath(); x.moveTo(sx, sy); x.lineTo(sx + w, sy); x.lineTo(sx + w * (.3 + rnd() * .5), sy + len); x.lineTo(sx + w * .2, sy + len * .9); x.closePath(); x.fill();
    }
    // chipped paint: ragged flakes, thickest along the edges, showing dark primer with a rusty rim
    for (let n = 0; n < 130; n++) {
      const edge = rnd() < .7, px = edge ? (rnd() < .5 ? rnd() * 26 : W - rnd() * 26) : rnd() * W, py = edge && rnd() < .5 ? rnd() * H : rnd() * H, r = 2 + rnd() * (edge ? 9 : 6);
      x.beginPath(); for (let a = 0; a < 7; a++) { const ang = a / 7 * 6.283, rr = r * (.55 + rnd() * .8); x[a ? 'lineTo' : 'moveTo'](px + Math.cos(ang) * rr * 1.4, py + Math.sin(ang) * rr); } x.closePath();
      x.fillStyle = 'rgba(122,74,34,.75)'; x.fill(); x.save(); x.translate(px, py); x.scale(.62, .62); x.translate(-px, -py);
      x.beginPath(); for (let a = 0; a < 7; a++) { const ang = a / 7 * 6.283, rr = r * (.55 + rnd() * .8); x[a ? 'lineTo' : 'moveTo'](px + Math.cos(ang) * rr * 1.4, py + Math.sin(ang) * rr); } x.closePath();
      x.fillStyle = 'rgba(46,44,38,.9)'; x.fill(); x.restore();
    }
    // the hazard stripe along the bottom edge: yellow and black diagonals, a black border, scuffed
    const hb = 44, y0 = H - hb; x.save(); x.beginPath(); x.rect(0, y0, W, hb); x.clip();
    x.fillStyle = '#d6b020'; x.fillRect(0, y0, W, hb); x.fillStyle = '#1a1a16';
    for (let sx = -hb; sx < W + hb; sx += 44) { x.beginPath(); x.moveTo(sx, y0 + hb); x.lineTo(sx + 22, y0 + hb); x.lineTo(sx + 22 + hb, y0); x.lineTo(sx + hb, y0); x.fill(); }
    x.fillRect(0, y0, W, 4); x.fillRect(0, H - 4, W, 4);
    for (let n = 0; n < 120; n++) { x.fillStyle = rnd() < .5 ? 'rgba(70,52,26,.45)' : 'rgba(255,240,180,.18)'; x.fillRect(rnd() * W, y0 + rnd() * hb, 1 + rnd() * 5, 1 + rnd() * 2); }
    x.restore();
    const t = new THREE.CanvasTexture(c); t.anisotropy = 8; return t;
  });
}

// Weathered concrete for the gate pylons. tall: a pylon's face (v up the pylon); otherwise a flat piece (base, cap): formwork seams with tie-bolt holes, mottling and aggregate, long water streaks
// from the cap and from the edges, white salt bloom, rust running down from under the steel bands, damp, grime and moss creeping up from the foot, cracks, and spalled corners with the aggregate
// (and a bit of rusting rebar) showing.
function gateConcreteTexture(tall, v = 0) { // v: which of the two (the pillars of a gate are not twins: v 0 is cracked and rust-stained, v 1 greener and more streaked, with fewer cracks)
  return cached('gateConcrete:' + tall + ':' + v, () => {
    const W = 256, H = tall ? 768 : 160, c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d'), rnd = seededRandom((tall ? 9101 : 9102) + v * 577);
    x.fillStyle = v ? '#8a8880' : '#918f88'; x.fillRect(0, 0, W, H);
    for (let n = 0; n < (tall ? 90 : 30); n++) { // mottling
      const px = rnd() * W, py = rnd() * H, r = 20 + rnd() * 70, g = x.createRadialGradient(px, py, 0, px, py, r), light = rnd() < .5;
      g.addColorStop(0, light ? `rgba(200,198,188,${.06 + rnd() * .1})` : `rgba(40,40,36,${.06 + rnd() * .12})`); g.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = g; x.fillRect(px - r, py - r, r * 2, r * 2);
    }
    for (let n = 0; n < (tall ? 5000 : 1600); n++) { x.fillStyle = rnd() < .5 ? 'rgba(235,232,220,.12)' : 'rgba(30,28,24,.16)'; const r = .6 + rnd() * 1.6; x.fillRect(rnd() * W, rnd() * H, r, r); } // aggregate
    if (tall) for (let sy = 128; sy < H; sy += 128) { // formwork seams and tie-bolt holes
      x.fillStyle = 'rgba(25,24,20,.35)'; x.fillRect(0, sy, W, 1.5); x.fillStyle = 'rgba(235,230,215,.14)'; x.fillRect(0, sy + 1.5, W, 1);
      for (const hx of [W * .25, W * .75]) { x.fillStyle = 'rgba(20,20,18,.6)'; x.beginPath(); x.arc(hx, sy - 64, 3.2, 0, 7); x.fill(); x.fillStyle = 'rgba(30,28,24,.25)'; x.beginPath(); x.arc(hx, sy - 64, 6.5, 0, 7); x.fill(); }
    }
    const streak = (sx, sy, len, w, rgb, a) => { const g = x.createLinearGradient(0, sy, 0, sy + len); g.addColorStop(0, `rgba(${rgb},${a})`); g.addColorStop(1, `rgba(${rgb},0)`); x.fillStyle = g; x.beginPath(); x.moveTo(sx, sy); x.lineTo(sx + w, sy); x.lineTo(sx + w * (.2 + rnd() * .5), sy + len); x.lineTo(sx + w * .1, sy + len * .92); x.closePath(); x.fill(); };
    for (let n = 0; n < (tall ? (v ? 56 : 30) : (v ? 14 : 7)); n++) streak(rnd() * W, rnd() * (tall ? H * .5 : H * .3), (tall ? 120 : 40) + rnd() * (tall ? 260 : 60), 3 + rnd() * 12, '28,26,22', .1 + rnd() * .16); // water streaks
    for (let n = 0; n < (tall ? 14 : 3); n++) streak(rnd() * W, rnd() * H * .4, 60 + rnd() * 150, 2 + rnd() * 8, '235,232,220', .12 + rnd() * .12);   // salt bloom
    if (tall) for (const by of [(1 - .4) * H, (1 - .72) * H]) for (let n = 0; n < 16; n++) streak(rnd() * W, by + 2, 40 + rnd() * 130, 2 + rnd() * 9, '150,80,34', .32 + rnd() * .3); // rust under the steel bands
    for (let n = 0; n < (tall ? (v ? 12 : 20) : (v ? 2 : 5)); n++) { // cracks: jagged, dark, with a pale lip (a few: the pillars are not shattered)
      let px = rnd() * W, py = rnd() * H, a = rnd() * 6.283; x.lineWidth = .7 + rnd() * 1.1; x.strokeStyle = 'rgba(18,17,14,.5)'; x.beginPath(); x.moveTo(px, py);
      for (let k = 0, m = 4 + Math.floor(rnd() * 9); k < m; k++) { a += (rnd() - .5) * 1.2; px += Math.cos(a) * (6 + rnd() * 16); py += Math.sin(a) * (6 + rnd() * 16); x.lineTo(px, py); } x.stroke();
    }
    for (let n = 0; n < (tall ? 26 : 8); n++) { // spalled patches, mostly at the edges and corners: dark aggregate, now and then a rusting bar
      const edge = rnd() < .75, px = edge ? (rnd() < .5 ? rnd() * 22 : W - rnd() * 22) : rnd() * W, py = rnd() * H, r = 4 + rnd() * 14;
      x.fillStyle = 'rgba(54,52,46,.85)'; x.beginPath(); for (let k = 0; k < 8; k++) { const ang = k / 8 * 6.283, rr = r * (.55 + rnd() * .75); x[k ? 'lineTo' : 'moveTo'](px + Math.cos(ang) * rr, py + Math.sin(ang) * rr * 1.2); } x.closePath(); x.fill();
      x.fillStyle = 'rgba(150,146,134,.5)'; for (let k = 0; k < 10; k++) x.fillRect(px + (rnd() - .5) * r * 1.4, py + (rnd() - .5) * r * 1.4, 1.5, 1.5);
      if (rnd() < .3) { x.strokeStyle = 'rgba(140,72,30,.9)'; x.lineWidth = 2; x.beginPath(); x.moveTo(px - r, py); x.lineTo(px + r, py + (rnd() - .5) * 4); x.stroke(); }
    }
    const foot = x.createLinearGradient(0, H * (tall ? .84 : .6), 0, H); foot.addColorStop(0, 'rgba(25,26,18,0)'); foot.addColorStop(1, 'rgba(22,24,16,.55)'); x.fillStyle = foot; x.fillRect(0, H * (tall ? .84 : .6), W, H * (tall ? .16 : .4)); // damp and grime at the foot
    for (let n = 0; n < (tall ? (v ? 70 : 30) : (v ? 22 : 10)); n++) { // moss and algae creeping up from it
      const px = rnd() * W, py = H - rnd() * (tall ? 150 : 50), r = 8 + rnd() * 26, g = x.createRadialGradient(px, py, 0, px, py, r);
      g.addColorStop(0, `rgba(72,92,40,${.25 + rnd() * .3})`); g.addColorStop(1, 'rgba(72,92,40,0)'); x.fillStyle = g; x.fillRect(px - r, py - r, r * 2, r * 2);
    }
    if (!tall) { // the tops (caps and steps): bird droppings, damp pools of dark stain, litter, and moss along the edges: each cap different
      for (let n = 0; n < (v ? 4 : 2); n++) { const px = rnd() * W, py = rnd() * H, r = 25 + rnd() * 45, g = x.createRadialGradient(px, py, 0, px, py, r); g.addColorStop(0, 'rgba(28,30,24,.4)'); g.addColorStop(.7, 'rgba(28,30,24,.16)'); g.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = g; x.fillRect(px - r, py - r, r * 2, r * 2); }
      for (let n = 0; n < (v ? 5 : 9); n++) { const px = rnd() * W, py = rnd() * H; x.fillStyle = 'rgba(238,236,226,.8)'; x.beginPath(); x.ellipse(px, py, 2 + rnd() * 5, 1.5 + rnd() * 3, rnd() * 3, 0, 7); x.fill(); x.fillStyle = 'rgba(238,236,226,.35)'; x.beginPath(); x.ellipse(px + 3, py + 2, 5 + rnd() * 7, 3 + rnd() * 4, rnd() * 3, 0, 7); x.fill(); }
      for (let n = 0; n < (v ? 40 : 14); n++) { x.fillStyle = rnd() < .5 ? 'rgba(92,100,50,.7)' : 'rgba(110,84,50,.7)'; x.fillRect(rnd() * W, rnd() * H, 2 + rnd() * 4, 1 + rnd() * 2); }
    }
    const t = new THREE.CanvasTexture(c); t.anisotropy = 8; return t;
  });
}

// A stencilled number in black paint on a transparent ground, with the gaps a stencil leaves and some wear.
function gateStencilTexture(text) {
  return cached('gateStencil:' + text, () => {
    const W = 256, H = 160, c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d'), rnd = seededRandom(31);
    x.fillStyle = 'rgba(24,24,22,.9)'; x.font = '900 130px "Arial Black", Impact, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(text, W / 2, H / 2 + 6);
    x.globalCompositeOperation = 'destination-out';
    for (const gy of [H * .36, H * .66]) x.fillRect(0, gy, W, 5); // the stencil's bridges
    for (let n = 0; n < 160; n++) { x.fillStyle = `rgba(0,0,0,${.3 + rnd() * .5})`; x.fillRect(rnd() * W, rnd() * H, 1 + rnd() * 4, 1 + rnd() * 4); } // wear
    const t = new THREE.CanvasTexture(c); t.anisotropy = 8; return t;
  });
}

// A soft round glow (for the floodlights).
function gateGlowTexture() {
  return cached('gateGlow', () => {
    const S = 64, c = document.createElement('canvas'); c.width = c.height = S; const x = c.getContext('2d'), g = x.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    g.addColorStop(0, 'rgba(255,240,190,1)'); g.addColorStop(.35, 'rgba(255,226,150,.4)'); g.addColorStop(1, 'rgba(255,220,140,0)'); x.fillStyle = g; x.fillRect(0, 0, S, S);
    return new THREE.CanvasTexture(c);
  });
}

// A heavy double gate, ~10 m wide: two tall concrete pylons on wide bases with plain flat tops, each with a floodlight, one stencilled with a number; two thick leaves hung on chunky hinges. Each leaf is a slab in a
// steel frame with three riveted straps, bolts round the border and a lighter diagonal brace; the leaves overlap at the middle and a steel meeting stile with a lock bar covers the join, so there is no seam
// down the centre. Named parts: doorL, doorR (they swing on Y about their outer edge); the stile and bar are part of doorR.
// leaf: the slab's material, or [left, right]; steel: the frame, straps and meeting stile; dark: hinges, lock bar; light: the brace and the bolts; post: the pylons' concrete; H: the leaves' height; extras(door, s).
function heavyGate({ leaf, steel, dark = steel, light = steel, post, H = 2.6, number = null, extras = null, pylons = true }) { // pylons: false = the leaves alone (stage 5's airbase gate hangs in the wall's own opening)
  const root = new THREE.Group(); root.name = 'gate';
  const PH = H + .9, L = 4.7; // pylon height; a leaf's length (it reaches 0.1 m past the middle: the two overlap)
  const pylonM = [0, 1].map(v => Array.isArray(post) ? post[v % post.length] : post ?? cached('gatePylonMat' + v, () => pmat(0xffffff, .9, .05, { map: gateConcreteTexture(true, v), shadowSide: THREE.FrontSide }))); // (post: the pylons' material, or one for each: the world gives the compound walls' own precast concrete)
  const lens = cached('gateLens', () => new THREE.MeshStandardMaterial({ color: 0xfff1c4, emissive: 0xffe29a, emissiveIntensity: .85, roughness: .3, metalness: .1 })); // (faintly glowing)
  const glow = cached('gateGlowMat', () => new THREE.MeshBasicMaterial({ map: gateGlowTexture(), color: 0xffe9b0, transparent: true, opacity: .32, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  [-1, 1].forEach(s => {
    const px = s * 5.25, v = s < 0 ? 0 : 1, pylon = pylonM[v]; // (the left pillar is variant 0, the right variant 1)
    if (pylons) {
    add(root, new THREE.BoxGeometry(1.25, PH + .3, 1.85), pylon, px, (PH + .3) / 2, 0);                // pylon: a plain block from the ground up, no base and no cap
    for (const f of [.4, .72]) add(root, new THREE.BoxGeometry(1.3, .16, 1.9), steel, px, PH * f + .3, 0); // steel bands
    // the floodlight: a bracket, a hooded housing tilted down toward the gate, a lens that glows a little, and a soft halo
    const fl = new THREE.Group(); fl.position.set(px, PH * .88 + .3, .92); root.add(fl);
    add(fl, new THREE.BoxGeometry(.16, .16, .3), dark, 0, 0, .12);
    const head = new THREE.Group(); head.position.set(0, -.04, .34); head.rotation.x = .5; fl.add(head);
    add(head, new THREE.BoxGeometry(.66, .38, .3), dark, 0, 0, 0);
    add(head, new THREE.BoxGeometry(.52, .27, .04), lens, 0, 0, .17);
    add(head, new THREE.BoxGeometry(.7, .04, .38), dark, 0, .22, .04);
    const halo = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.5), glow); halo.position.set(0, 0, .26); halo.renderOrder = 5; head.add(halo);
    if (number && s < 0) { // a stencilled number on this pylon's front face
      const plate = new THREE.Mesh(new THREE.PlaneGeometry(.92, .58), new THREE.MeshBasicMaterial({ map: gateStencilTexture(number), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, color: 0xc8c8c0 }));
      plate.position.set(px, PH * .46 + .3, .93); root.add(plate);
    }
    }
    const t = s < 0 ? .46 : .4;                                                                    // (the leaves differ a little in thickness: no faces level where they overlap)
    const d = new THREE.Group(); d.name = s < 0 ? 'doorL' : 'doorR'; d.position.set(s * 4.6, 0, 0); root.add(d);
    const cx = -s * L / 2, y0 = .14, hh = H - .1, mid = y0 + hh / 2, leafMat = Array.isArray(leaf) ? leaf[s < 0 ? 0 : 1] : leaf;
    add(d, new THREE.BoxGeometry(L - .04, hh - .06, t), leafMat, cx, mid, 0);                     // the slab (a hair smaller than the frame round it: no faces level with the rails' and stiles' tops, bottoms and ends)
    for (const y of [y0 + .09, y0 + hh - .09]) add(d, new THREE.BoxGeometry(L, .26, t + .1), steel, cx, y, 0); // top and bottom rails (a little taller than the slab)
    for (const x of [.12, L - .12]) add(d, new THREE.BoxGeometry(.24, hh + .13, t + .1), steel, -s * x, mid, 0);   // end stiles (taller than the rails)
    for (const f of [.2, .5, .8]) { // riveted straps
      const y = y0 + hh * f; add(d, new THREE.BoxGeometry(L - .4, .14, t + .08), steel, cx, y, 0);
      for (let i = 0; i < 7; i++) for (const side of [-1, 1]) add(d, new THREE.CylinderGeometry(.05, .05, .05, 6).rotateX(Math.PI / 2), light, -s * (.45 + i * (L - .9) / 6), y, side * (t + .08) / 2);
    }
    for (const y of [y0 + .09, y0 + hh - .09]) for (let i = 0; i < 8; i++) { // bolts along the top and bottom rails, front and back
      for (const side of [-1, 1]) add(d, new THREE.CylinderGeometry(.06, .06, .06, 6).rotateX(Math.PI / 2), light, -s * (.5 + i * (L - 1) / 7), y, side * (t + .1) / 2);
    }
    for (const y of [y0 + .6, y0 + hh * .5 + .4, y0 + hh - .7]) for (const side of [-1, 1]) add(d, new THREE.CylinderGeometry(.06, .06, .06, 6).rotateX(Math.PI / 2), light, -s * (L - .12), y, side * (t + .1) / 2); // and up the end stile
    const ang = Math.atan2(hh - .3, L - .3), brace = add(d, new THREE.BoxGeometry(Math.hypot(L - .3, hh - .3), .17, t + .1), light, cx, mid, 0); brace.rotation.z = -s * ang; // the lighter diagonal brace
    for (const y of [.55, mid, y0 + hh - .45]) { // chunky hinges on the pylon side
      add(d, new THREE.CylinderGeometry(.14, .14, .46, 10), dark, 0, y, 0);
      add(d, new THREE.BoxGeometry(1.0, .3, t + .14), dark, -s * .5, y, 0);
      for (const bx of [.25, .75]) add(d, new THREE.CylinderGeometry(.06, .06, .06, 6).rotateX(Math.PI / 2), light, -s * bx, y, (t + .14) / 2 + .02);
    }
    if (s > 0) { // doorR carries the meeting stile and the lock bar over the join in the middle
      add(d, new THREE.BoxGeometry(.42, hh + .14, t + .2), steel, -4.6, mid, 0);                  // meeting stile, straddling the middle
      add(d, new THREE.BoxGeometry(1.9, .26, .36), dark, -4.6, y0 + hh * .5, 0);                 // the locking bar across it
      for (const x of [-5.4, -3.8]) { add(d, new THREE.BoxGeometry(.22, .44, .52), dark, x, y0 + hh * .5, 0); add(d, new THREE.CylinderGeometry(.06, .06, .07, 6).rotateX(Math.PI / 2), light, x, y0 + hh * .5, .27); } // hasps, bolted
      for (const x of [-4.95, -4.25]) add(d, new THREE.CylinderGeometry(.07, .07, .07, 6).rotateX(Math.PI / 2), light, x, y0 + hh * .5, .19); // and bolts on the bar
    }
    extras?.(d, s);
  });
  return root;
}

function buildHarbourGate(pylonMat = null, pylons = true, tall = false, height = 3.6) { // tall: stage 5's airbase gate, as high as its wall (3.6 m) and without the razor wire
  const door = tall ? [0, 1].map(v => cached('airbaseGateLeaf:' + v, () => pmat(0xffffff, .4, .5, { map: airbaseGateTexture(v), envMapIntensity: .7 }))) : cached('harbourGateDoor', () => pmat(0xffffff, .7, .35, { map: harbourDoorTexture() }));
  const frame = tall ? cached('airbaseGateFrame', () => pmat(0x9a4a16, .38, .55, { envMapIntensity: .7 })) : cached('harbourGateFrame', () => pmat(0x3a2414, .6, .5));
  const wire = tall ? cached('airbaseGateBolt', () => pmat(0x9aa0a4, .35, .8, { envMapIntensity: .8 })) : cached('harbourGateWire', () => pmat(0x55585a, .45, .8));
  const H = tall ? height : 2.6;
  return heavyGate({ leaf: door, steel: frame, dark: frame, light: wire, post: pylonMat, H, pylons, extras: tall ? null : (d, s) => {
    for (let i = 0; i < 9; i++) { // razor wire coils along the top
      const coil = add(d, new THREE.TorusGeometry(.16, .015, 4, 10), wire, -s * (.25 + i * .5), H + .14, 0); coil.rotation.y = Math.PI / 2;
    }
  } });
}

// Compound gate, ~10 m wide. Named parts: doorL, doorR (swing on Y about their outer edge).
// color: the doors' paint (green on stages 1-2, brown on stage 4); style 'harbour': stage 3's (buildHarbourGate).
export function buildGate(color = '#5b6538', style = null, pylonMat = null) { // pylonMat: the pylons' concrete (the world passes the compound walls' own)
  if (style === 'harbour') { const g = buildHarbourGate(pylonMat); g.userData.doorColor = 0x6a3410; return g; }
  if (style === 'airbasePylons') { const g = buildHarbourGate(pylonMat, true, true, 2.6); g.userData.doorColor = g.userData.rubble = 0x8a4416; return g; } // (the same orange doors between the village gates' concrete pylons: the secret helipad's)
  if (style === 'airbase') { const g = buildHarbourGate(pylonMat, false, true); g.userData.doorColor = g.userData.rubble = 0x8a4416; return g; } // (stage 5's airbase gate: the orange doors, as high as the wall, with no pillars)
  if (style === 'steel') { // the wire fences' gates (stage 5): bare grey steel leaves in a darker grey frame, the same heavy gate
    const leaf = cached('gateLeafSteel', () => pmat(0x8a8f93, .55, .5)), steel = cached('gateSteelGrey', () => pmat(0x4a4e52, .5, .55)), dark = cached('gateDarkGrey', () => pmat(0x2a2d30, .5, .6)), light = cached('gateLightGrey', () => pmat(0xb4b8ba, .35, .8));
    const g = heavyGate({ leaf, steel, dark, light, post: pylonMat }); g.userData.doorColor = g.userData.rubble = 0x4a4e52; return g; // (the shards match how dark the leaves look in the light)
  }
  const m = mats();
  const leaf = [0, 1].map(v => cached('gateLeaf:' + v, () => pmat(0xffffff, .55, .45, { map: gateDoorTexture(v) })));  // painted olive-drab steel
  const steel = cached('gateSteel', () => pmat(0x3e4628, .5, .5)), dark = cached('gateDark', () => pmat(0x24282a, .5, .6)), light = cached('gateLight', () => pmat(0xa5abaa, .35, .8)); // the frame in darker paint, gunmetal fittings, bright galvanised brace and bolts
  const root = heavyGate({ leaf, steel, dark, light, post: pylonMat, number: '07' });
  root.userData.doorColor = 0x3e4628; // (the shattered doors' pieces: olive-drab steel)
  return root;
}

// Fuel drum, ~1.1 m tall.
export function buildDrum() {
  const m = mats(), root = new THREE.Group(); root.name = 'drum';
  add(root, new THREE.CylinderGeometry(.42, .42, 1.1, 14), m.drum, 0, .55, 0);
  add(root, new THREE.CylinderGeometry(.4, .4, .04, 14), m.drumTop, 0, 1.11, 0);
  return root;
}

// Heliport perimeter light: a small concrete footing, a frangible yellow-and-black post and a
// domed lens flashing red or blue, with a glow halo and a pool of light on the ground. Each light has its own glow
// materials so the ring can run a chase sequence (flashPadLights). buildPadLight(slot, count):
// this light's place round the ring, 0..count-1. Named part: `lens`.
const glowTex = cached('padGlowTex', () => {
  const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d');
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(.25, 'rgba(255,255,255,.55)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
});
const padLights = []; // { lens, halo, pool, at }: at = place round the ring, 0..1
export function buildPadLight(slot = 0, count = 1) {
  const root = new THREE.Group(); root.name = 'padLight';
  const k = cached('padLightMats', () => ({ foot: pmat(0x8a8880, .9, 0), yellow: pmat(0xe0b020, .55, .2), black: pmat(0x1c1c1a, .6, .3), metal: pmat(0x5a5c58, .4, .7) }));
  const g = {
    lens: new THREE.MeshStandardMaterial({ color: 0x5a0a08, emissive: 0xff2010, emissiveIntensity: 0, roughness: .2, metalness: .1 }),
    halo: new THREE.SpriteMaterial({ map: glowTex, color: 0xff3a20, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }),
    pool: new THREE.MeshBasicMaterial({ map: glowTex, color: 0xff3018, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }),
    at: slot / count, slot,
  };
  padLights.push(g);
  add(root, new THREE.CylinderGeometry(.32, .36, .12, 12), k.foot, 0, .06, 0);
  add(root, new THREE.CylinderGeometry(.06, .06, .5, 8), k.yellow, 0, .37, 0);
  for (const y of [.22, .42]) add(root, new THREE.CylinderGeometry(.065, .065, .07, 8), k.black, 0, y, 0); // hazard bands
  add(root, new THREE.CylinderGeometry(.13, .11, .1, 12), k.metal, 0, .66, 0);                       // lamp housing
  const lens = add(root, new THREE.SphereGeometry(.12, 14, 8, 0, PI * 2, 0, PI / 2), g.lens, 0, .71, 0);
  lens.name = 'lens'; lens.castShadow = false;
  const halo = new THREE.Sprite(g.halo); halo.scale.setScalar(1.2); halo.position.y = .78; root.add(halo);
  const pool = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.6), g.pool);
  pool.rotation.x = -PI / 2; pool.position.y = .13; pool.renderOrder = 1; root.add(pool);
  return root;
}
// Chase ("running rabbit") sequence like a real lead-in light ring: a bright pulse runs round the
// ring once every CHASE seconds, each light snapping on as it arrives and fading over the next few,
// so a short comet of light circles the pad. t = seconds.
const CHASE = 1.6, TRAIL = 4; // trail: how many lights behind the head are still glowing
// Neighbouring lights alternate red and blue, and they swap colours on every lap, so each light
// takes turns flashing red and blue.
const PAD_RED = { lens: new THREE.Color(0x5a0a08), glow: new THREE.Color(0xff2010), halo: new THREE.Color(0xff3a20) };
const PAD_BLUE = { lens: new THREE.Color(0x0a1a5a), glow: new THREE.Color(0x2050ff), halo: new THREE.Color(0x3a6aff) };
export function flashPadLights(t) {
  const head = (t / CHASE) % 1, n = padLights.length || 1;
  for (const g of padLights) {
    const lap = Math.floor(t / CHASE - ((head - g.at) % 1 + 1) % 1); // the lap in which the pulse last passed this light
    const c = (g.slot + lap) % 2 ? PAD_BLUE : PAD_RED;
    g.lens.color.copy(c.lens); g.lens.emissive.copy(c.glow); g.halo.color.copy(c.halo); g.pool.color.copy(c.glow);
    const behind = ((head - g.at) % 1 + 1) % 1 * n;          // how many light-steps ago the pulse passed it
    const on = behind < TRAIL ? (1 - behind / TRAIL) ** 2 : 0;
    g.lens.emissiveIntensity = .12 + 2.4 * on;
    g.halo.opacity = .85 * on;
    g.pool.opacity = .35 * on;
  }
}

// Helipad markings (the concrete slab itself comes from the terrain). ~17 x 12 m.
export function buildHelipadMarkings() {
  const root = new THREE.Group(); root.name = 'helipad';
  const d = decal(12, 12, (x, w, h) => {
    x.strokeStyle = x.fillStyle = 'rgba(235,235,225,.9)'; x.lineWidth = 16;
    x.beginPath(); x.arc(w / 2, h / 2, h * .3, 0, 7); x.stroke(); x.beginPath();
    for (let i = 0; i < 10; i++) { const a = -PI / 2 + i * PI / 5, r = i % 2 ? h * .09 : h * .24; x.lineTo(w / 2 + Math.cos(a) * r, h / 2 + Math.sin(a) * r); }
    x.fill();
    for (let i = 0; i < 4; i++) { const a = i * PI / 2 + PI / 4; x.fillRect(w / 2 + Math.cos(a) * h * .4 - 10, h / 2 + Math.sin(a) * h * .4 - 10, 20, 20); }
  }, 512, 512);
  d.rotation.x = -PI / 2; d.position.set(-3.75, .12, 0); root.add(d); // star sits left of centre, STOP strip on the right
  const stop = decal(4, 8, (x, w, h) => {
    x.fillStyle = 'rgba(235,235,225,.9)'; x.font = 'bold 110px Impact, sans-serif'; x.textAlign = 'center';
    x.save(); x.translate(w / 2, h / 2); x.rotate(-PI / 2); x.fillText('STOP', 0, 40); x.restore();
  }, 256, 512);
  stop.rotation.x = -PI / 2; stop.position.set(7.2, .12, 0); root.add(stop);
  return root;
}

// Weapon pickup star, floats ~1 m up. Named part: star (spins).
export function buildPickup() {
  const root = new THREE.Group(); root.name = 'pickup';
  const s = new THREE.Shape();
  for (let i = 0; i < 10; i++) { const a = -PI / 2 + i * PI / 5, r = i % 2 ? .3 : .75; i ? s.lineTo(Math.cos(a) * r, Math.sin(a) * r) : s.moveTo(Math.cos(a) * r, Math.sin(a) * r); }
  const star = add(root, new THREE.ExtrudeGeometry(s, { depth: .2, bevelEnabled: true, bevelSize: .05, bevelThickness: .05, bevelSegments: 1 }),
    mat(0xffffff, .3, .2, { emissive: 0x666655 }), 0, 1.2, 0);
  star.name = 'star';
  return root;
}
