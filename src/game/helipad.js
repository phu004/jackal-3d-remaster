// The helipad slab's top: one texture over all the 'H' cells of the level, with weathered concrete
// panels, stains, cracks and repairs, and the markings: a yellow edge line, a white landing-area
// square, a yellow touchdown circle with the white star (NES), corner markers, a weight-limit box
// and the STOP apron. (The slab's sides are the plain concrete boxes the world builds for 'H'.)
import * as THREE from 'three';

function rng(seed) {
  let s = seed >>> 0;
  return () => { s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}

// grid: terrain rows; CELL: metres per cell; W, L: level width and length. Adds the slab top to the
// scene and returns the centre of the touchdown circle (or null if the level has no helipad).
export function buildHelipadSlab(scene, grid, CELL, W, L) {
  const rows = grid.length, cols = grid[0].length, cells = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) if (grid[r][c] === 'H') cells.push([r, c]);
  if (!cells.length) return null;
  const r0 = Math.min(...cells.map(q => q[0])), c0 = Math.min(...cells.map(q => q[1]));
  const r1 = Math.max(...cells.map(q => q[0])), c1 = Math.max(...cells.map(q => q[1]));
  const RES = 40, wM = (c1 - c0 + 1) * CELL, hM = (r1 - r0 + 1) * CELL, x0 = -W / 2 + c0 * CELL, z0 = -L + r0 * CELL;
  const cw = Math.round(wM * RES), ch = Math.round(hM * RES);
  const X = v => (v - x0) * RES, Z = v => (v - z0) * RES, M = v => v * RES; // world -> canvas pixels
  const isH = (r, c) => r >= 0 && r < rows && c >= 0 && c < cols && grid[r][c] === 'H';
  const top = cells.filter(q => q[0] === r0).map(q => q[1]); // the landing square: the full-height part
  const sq = { x0: -W / 2 + Math.min(...top) * CELL, x1: -W / 2 + (Math.max(...top) + 1) * CELL, z0, z1: z0 + hM };
  const cc = new THREE.Vector3((sq.x0 + sq.x1) / 2, 0, (sq.z0 + sq.z1) / 2);
  const rand = rng(4242), rr = (a, b) => a + rand() * (b - a);
  const cellRect = ([r, c]) => [X(-W / 2 + c * CELL), Z(-L + r * CELL), M(CELL)];
  const canvas = document.createElement('canvas'); canvas.width = cw; canvas.height = ch; const x = canvas.getContext('2d');
  const blob = (ctx, gx, gz, gr, inner, outer = 'rgba(0,0,0,0)') => {
    const g = ctx.createRadialGradient(gx, gz, 0, gx, gz, gr); g.addColorStop(0, inner); g.addColorStop(1, outer);
    ctx.fillStyle = g; ctx.fillRect(gx - gr, gz - gr, gr * 2, gr * 2);
  };

  // --- concrete ---
  x.save(); x.beginPath(); cells.forEach(q => { const [px, pz, s] = cellRect(q); x.rect(px, pz, s, s); }); x.clip();
  x.fillStyle = '#93918a'; x.fillRect(0, 0, cw, ch);
  const PANEL = 2.5; // cast in 2.5 m panels, each a slightly different tone
  for (let px = 0; px < wM; px += PANEL) for (let pz = 0; pz < hM; pz += PANEL) {
    const v = rr(-14, 14); x.fillStyle = v > 0 ? `rgba(255,250,235,${v / 140})` : `rgba(40,35,28,${-v / 140})`;
    x.fillRect(M(px), M(pz), M(PANEL), M(PANEL));
  }
  for (let i = 0; i < 70; i++) blob(x, rr(0, cw), rr(0, ch), rr(20, 90), rand() < .55 ? 'rgba(50,45,38,.10)' : 'rgba(255,250,235,.08)'); // mottling
  for (let i = 0; i < 14000; i++) { // aggregate
    x.fillStyle = rand() < .5 ? `rgba(40,36,30,${rr(.08, .25)})` : `rgba(235,230,215,${rr(.08, .22)})`;
    x.fillRect(rr(0, cw), rr(0, ch), rr(1, 2.5), rr(1, 2.5));
  }
  for (let i = 0; i < 3; i++) { // repair patches
    const w = M(rr(.8, 2)), h = M(rr(.6, 1.5)), px = rr(0, cw - w), pz = rr(0, ch - h);
    x.fillStyle = 'rgba(70,66,58,.18)'; x.fillRect(px, pz, w, h);
    x.strokeStyle = 'rgba(40,36,30,.35)'; x.lineWidth = 1.5; x.strokeRect(px, pz, w, h);
  }
  const joints = (style, width, shift) => {
    x.strokeStyle = style; x.lineWidth = width;
    for (let px = PANEL; px < wM; px += PANEL) { x.beginPath(); x.moveTo(M(px) + shift, 0); x.lineTo(M(px) + shift, ch); x.stroke(); }
    for (let pz = PANEL; pz < hM; pz += PANEL) { x.beginPath(); x.moveTo(0, M(pz) + shift); x.lineTo(cw, M(pz) + shift); x.stroke(); }
  };
  joints('rgba(45,42,36,.55)', 2, 0); joints('rgba(230,225,210,.18)', 1, 2); // sawn joints with a lit edge
  for (let i = 0; i < 9; i++) { // hairline cracks
    let px = rr(0, cw), pz = rr(0, ch), a = rr(0, Math.PI * 2);
    x.strokeStyle = `rgba(35,32,27,${rr(.35, .6)})`; x.lineWidth = rr(.8, 1.6); x.beginPath(); x.moveTo(px, pz);
    for (let k = 0, n = rr(6, 16); k < n; k++) { a += rr(-.6, .6); px += Math.cos(a) * 9; pz += Math.sin(a) * 9; x.lineTo(px, pz); }
    x.stroke();
  }
  for (let i = 0; i < 7; i++) { // oil and fuel stains, mostly round the touchdown area
    const a = rr(0, Math.PI * 2), d = M(rr(0, 4)), gx = X(cc.x) + Math.cos(a) * d, gz = Z(cc.z) + Math.sin(a) * d, gr = M(rr(.3, 1.1));
    for (let k = 0; k < 4; k++) blob(x, gx + rr(-.4, .4) * gr, gz + rr(-.4, .4) * gr, gr * rr(.5, 1), 'rgba(25,22,18,.26)');
  }
  for (let i = 0; i < 4; i++) { // tyre scuffs from vehicles crossing to the apron
    x.strokeStyle = `rgba(30,28,24,${rr(.08, .16)})`; x.lineWidth = M(.22);
    const pz = Z(rr(sq.z0 + 2, sq.z1 - 2)), bend = rr(-60, 60);
    for (const off of [0, M(1.5)]) { x.beginPath(); x.moveTo(X(sq.x0 + rr(2, 5)), pz + off); x.quadraticCurveTo(X(sq.x1), pz + off + bend, cw, pz + off + bend * .5); x.stroke(); }
  }

  // --- markings (on their own layer, then worn) ---
  const mk = document.createElement('canvas'); mk.width = cw; mk.height = ch; const m = mk.getContext('2d');
  const WHITE = 'rgba(238,236,228,.95)', YELLOW = 'rgba(232,186,40,.95)';
  m.fillStyle = YELLOW; // edge line just inside every outside edge of the slab
  for (const [r, c] of cells) {
    const [px, pz, s] = cellRect([r, c]), o = M(.25), w = M(.2);
    if (!isH(r - 1, c)) m.fillRect(px, pz + o, s, w);
    if (!isH(r + 1, c)) m.fillRect(px, pz + s - o - w, s, w);
    if (!isH(r, c - 1)) m.fillRect(px + o, pz, w, s);
    if (!isH(r, c + 1)) m.fillRect(px + s - o - w, pz, w, s);
  }
  m.strokeStyle = WHITE; m.lineWidth = M(.22); // landing-area square
  m.strokeRect(X(sq.x0 + .8), Z(sq.z0 + .8), M(sq.x1 - sq.x0 - 1.6), M(sq.z1 - sq.z0 - 1.6));
  m.strokeStyle = YELLOW; m.lineWidth = M(.35); // touchdown circle
  m.beginPath(); m.arc(X(cc.x), Z(cc.z), M(3.5), 0, Math.PI * 2); m.stroke();
  m.fillStyle = WHITE; m.beginPath(); // the star
  for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rad = M(i % 2 ? 1.1 : 2.8); m.lineTo(X(cc.x) + Math.cos(a) * rad, Z(cc.z) + Math.sin(a) * rad); }
  m.closePath(); m.fill();
  for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + Math.PI / 4; m.fillRect(X(cc.x) + Math.cos(a) * M(4.3) - M(.2), Z(cc.z) + Math.sin(a) * M(4.3) - M(.2), M(.4), M(.4)); }
  const bx = X(sq.x0 + 1.3), bz = Z(sq.z1 - 2.2), bw = M(1.5), bh = M(.9); // weight-limit box, south-west corner
  m.strokeStyle = WHITE; m.lineWidth = M(.1); m.strokeRect(bx, bz, bw, bh);
  m.fillStyle = WHITE; m.font = `bold ${M(.62)}px Arial, sans-serif`; m.textAlign = 'center'; m.textBaseline = 'middle';
  m.fillText('5.7', bx + bw / 2, bz + bh / 2 + 1);
  const apron = cells.filter(([, c]) => { const x = -W / 2 + c * CELL; return x >= sq.x1 - 1e-6 || x < sq.x0 - 1e-6; }); // the STOP apron beside the square (either side)
  if (apron.length) {
    const ax0 = Math.min(...apron.map(q => cellRect(q)[0])), ax1 = Math.max(...apron.map(q => cellRect(q)[0] + M(CELL)));
    const az0 = Math.min(...apron.map(q => cellRect(q)[1])), az1 = Math.max(...apron.map(q => cellRect(q)[1] + M(CELL)));
    m.fillStyle = YELLOW; // dashed hold line where the apron meets the square
    const west = ax1 <= X(sq.x0) + 1, holdX = west ? ax1 - M(.53) : ax0 + M(.35); // the hold line runs along the side against the square
    for (let pz = az0 + M(.6); pz < az1 - M(.6); pz += M(.9)) m.fillRect(holdX, pz, M(.18), M(.5));
    m.save(); m.translate((ax0 + ax1) / 2 + (west ? -M(.3) : M(.3)), (az0 + az1) / 2); m.rotate(west ? Math.PI / 2 : -Math.PI / 2);
    m.fillStyle = WHITE; m.font = `bold ${M(1.9)}px Impact, "Arial Black", sans-serif`; m.fillText('STOP', 0, 0); m.restore();
  }
  m.globalCompositeOperation = 'destination-out'; // wear: flecks and scuffs worn off the paint
  for (let i = 0; i < 9000; i++) { m.fillStyle = `rgba(0,0,0,${rr(.2, .9)})`; m.fillRect(rr(0, cw), rr(0, ch), rr(1, 3), rr(1, 3)); }
  for (let i = 0; i < 40; i++) blob(m, rr(0, cw), rr(0, ch), rr(8, 30), 'rgba(0,0,0,.45)');
  x.drawImage(mk, 0, 0);

  // --- grime along the outside edges, and sand blown in over them ---
  for (const [r, c] of cells) {
    const [px, pz, s] = cellRect([r, c]), e = M(.5);
    const edge = (gx0, gz0, gx1, gz1, rx, rz, rw, rh) => {
      const g = x.createLinearGradient(gx0, gz0, gx1, gz1); g.addColorStop(0, 'rgba(70,52,34,.45)'); g.addColorStop(1, 'rgba(70,52,34,0)');
      x.fillStyle = g; x.fillRect(rx, rz, rw, rh);
    };
    const n = !isH(r - 1, c), so = !isH(r + 1, c), w = !isH(r, c - 1), ea = !isH(r, c + 1);
    if (n) edge(0, pz, 0, pz + e, px, pz, s, e);
    if (so) edge(0, pz + s, 0, pz + s - e, px, pz + s - e, s, e);
    if (w) edge(px, 0, px + e, 0, px, pz, e, s);
    if (ea) edge(px + s, 0, px + s - e, 0, px + s - e, pz, e, s);
    for (let i = 0; i < 60; i++) { // sand grains near the edges
      const sx = px + rr(0, s), sz = pz + rr(0, s);
      const near = Math.min(n ? sz - pz : 1e9, so ? pz + s - sz : 1e9, w ? sx - px : 1e9, ea ? px + s - sx : 1e9);
      if (near < M(.8) && rand() > near / M(.8)) { x.fillStyle = `rgba(196,112,48,${rr(.3, .7)})`; x.fillRect(sx, sz, rr(1, 3), rr(1, 3)); }
    }
  }
  x.restore();

  const tex = new THREE.CanvasTexture(canvas); tex.anisotropy = 8;
  const slab = new THREE.Mesh(new THREE.PlaneGeometry(wM, hM),
    new THREE.MeshStandardMaterial({ map: tex, color: 0xa4a4a4, alphaTest: .5, roughness: .92, envMapIntensity: .25 })); // tinted down: weathered concrete, not bright paper
  slab.rotation.x = -Math.PI / 2; slab.position.set(x0 + wM / 2, .102, z0 + hM / 2); slab.receiveShadow = true;
  scene.add(slab);
  cc.square = sq; cc.apronWest = apron.length > 0 && apron.every(([, c]) => -W / 2 + c * CELL < sq.x0); // for the light ring
  return cc;
}
