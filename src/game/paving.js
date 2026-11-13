// Ancient stone paving for stage 2's terraces: weathered limestone slabs in running bond, after
// excavated Greek / Roman sites, a thousand years on. The slab layout is generated first (courses of
// a few slab sizes), then every pixel is shaded from it through a slow noise warp, so seams wobble,
// pinch and widen, never run quite straight or parallel, and meet in T-junctions; slab edges are
// hand-cut, rounded, chipped and worn back into the stone; each slab sits a little proud or sunken
// (one edge lit, the other shaded); the seams are packed sand and dirt, pooling in the wide gaps,
// with weeds. Then a few long jagged cracks (clustered near corners, often running on into the next
// slab) and short hairlines, with chipped, spalled rims. A bump map follows all of it. Near a
// terrace's edge the paving fades into drifted sand (per-vertex, see buildPaving).
// Everything tunable is in the constants below.
import * as THREE from 'three';

// ---- layout (tile size, slab sizes) ----
export const TILE = 12;                  // metres per texture tile (it repeats seamlessly)
const TEX = 2048;                        // texture size, px (power of two: mipmaps)
const COURSES = [.9, 1.2];               // course depths, metres (each course picks one)
const SLABS = [.9, 1.35, 1.8];           // slab lengths, metres (two or three sizes, running bond)
// ---- palette ----
const PALETTE = {                        // warm grey, tan, dark grey, sand, olive only
  stone: [[176, 173, 165], [183, 177, 166], [169, 166, 159], [179, 173, 161]], // grey-cream (desaturated)
  seamDeep: [84, 74, 60], seam: [170, 154, 126], // pale sand / dirt; dark only in deep spots
  sand: [176, 150, 112], grime: [60, 54, 46], moss: [104, 106, 70],
};
const JITTER = .06;                      // per-slab brightness / hue jitter (±)
// ---- seams ----
const WARP = 4.5;                        // px: how far seam lines wander (slow noise warp)
const WARP_FREQ = 22;                    // wobbles per tile
const SEAM_WIDTHS = [[.7, .5, 1], [.25, 2, 3], [.05, 4, 5]]; // [share, min, max] px half-width: most seams 1-2 px, some 4-6, a few real gaps
const SEAM_PINCH = .9;                   // how much a seam pinches / widens along its length
const DARK_LINE = .2;                    // share of a seam's length with a thin dark line down its middle
const CORNER_R = [2, 9];                 // px: rounded-off corners
const ERODE = [3, 5];                    // px: edge tone fading toward the seam colour (per slab)
const ERODE_STRONG = .2;                 // share of slabs worn twice as far
const LIP = 9;                           // px: width of the lit / shaded band of a proud or sunken slab
const LIP_AMT = .08;                     // brightness of that band (±): low
const POOL = 1.9;                        // px half-width above which sand pools in the seam
const WEED_CHANCE = .0035;               // chance a wide-seam pixel grows a weed tuft
const MISSING_CHANCE = .012;             // share of slabs lost altogether (sand-filled)
// ---- cracks ----
const LONG_CRACKS = 10;                  // long cracks per tile (crossing whole slabs)
const HAIRLINES = 4;                     // single-slab hairline cracks per tile
const CRACK_FORKS = 2;                   // most forks a crack may have
const FORK_CHANCE = .35;                 // chance of each possible fork
const SPANNING = 5;                      // long cracks guaranteed to cross two or more slabs
const BIG_SLABS = .15;                   // share of slabs merged with 1-2 neighbours along the course (2-3x larger, no seam between)
const CRACK_WIDTH = 2.4;                 // px at the thickest (middle) of a long crack
const SPALL_CHANCE = .5;                 // chance of a spalled chip where a crack meets a seam
// ---- sand at the terrace edges ----
export const SAND_EDGE = 1.3;            // cells from the edge over which drifted sand fades out (it was 2.2: the grey floor faded into the yellow too far in)

function rng(seed) {
  let s = seed >>> 0;
  return () => { s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
const pick = (arr, rand) => arr[Math.floor(rand() * arr.length)];

// Smooth, tileable value noise (period P cells).
function tileNoise(P, rand) {
  const g = Float32Array.from({ length: P * P }, rand);
  return (u, v) => {
    const x = Math.floor(u), y = Math.floor(v), fx = u - x, fy = v - y, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const at = (a, b) => g[((b % P + P) % P) * P + ((a % P + P) % P)];
    return (at(x, y) * (1 - sx) + at(x + 1, y) * sx) * (1 - sy) + (at(x, y + 1) * (1 - sx) + at(x + 1, y + 1) * sx) * sy;
  };
}

// A seam's half-width, px: mostly narrow, some wide, a few real gaps (see SEAM_WIDTHS).
function seamWidth(rand) {
  let r = rand();
  for (const [share, lo, hi] of SEAM_WIDTHS) { if ((r -= share) < 0) return lo + rand() * (hi - lo); }
  return SEAM_WIDTHS[0][1];
}

// Pieces from `sizes` (with a seeded shuffle) filling `total` exactly; the last piece takes up the slack.
function fill(total, sizes, rand) {
  const out = []; let left = total;
  while (left > Math.max(...sizes) * 1.4) { const v = pick(sizes, rand); out.push(v); left -= v; }
  if (left > Math.min(...sizes) * 1.3) { out.push(left / 2); out.push(left / 2); } else out.push(left);
  return out;
}

export function pavingTextures() {
  const N = TEX, PX = N / TILE, rand = rng(1234);

  // 1. layout: courses (rows), each cut into slabs whose joints are staggered against the course above
  const rows = [];
  let y = 0, prev = [];
  for (const h of fill(TILE, COURSES, rand)) {
    let x0 = rand() * TILE;
    if (prev.some(j => Math.abs(((x0 - j) % TILE + TILE) % TILE) < .3)) x0 += .45; // no joints lining up: T-junctions
    const slabs = [], starts = [];
    for (const w of fill(TILE, SLABS, rand)) {
      const [r, g, b] = pick(PALETTE.stone, rand), k = 1 + (rand() - .5) * 2 * JITTER, hue = (rand() - .5) * 2 * JITTER;
      const ta = rand() * Math.PI * 2, tilt = rand(); // which way it leans, and how much
      slabs.push({ x: (x0 % TILE) * PX, w: w * PX, col: [r * k * (1 + hue), g * k, b * k * (1 - hue)], lost: rand() < MISSING_CHANCE,
        seam: seamWidth(rand), erode: (ERODE[0] + rand() * (ERODE[1] - ERODE[0])) * (rand() < ERODE_STRONG ? 2 : 1),
        corner: CORNER_R[0] + rand() * (CORNER_R[1] - CORNER_R[0]), tx: Math.cos(ta) * tilt, ty: Math.sin(ta) * tilt });
      starts.push(x0 % TILE); x0 += w;
    }
    slabs.sort((a, b) => a.x - b.x);
    for (let k = 0; k < slabs.length - 1; k++) { // big slabs: absorb the next one or two (their seams vanish)
      if (rand() >= BIG_SLABS) continue;
      for (let m = 0, n = rand() < .5 ? 1 : 2; m < n && k + 1 < slabs.length - 1; m++) slabs[k].w += slabs.splice(k + 1, 1)[0].w;
    }
    rows.push({ y0: y * PX, y1: (y + h) * PX, slabs });
    prev = starts; y += h;
  }
  const rowAt = py => rows.find(r => py >= r.y0 && py < r.y1) ?? rows[rows.length - 1];
  const slabAt = (row, px) => { // the slab covering px (wrapping round the tile), and its left edge unwrapped
    const sl = row.slabs;
    for (let i = sl.length - 1; i >= 0; i--) if (px >= sl[i].x) return [sl[i], sl[i].x];
    const last = sl[sl.length - 1]; return [last, last.x - N];
  };

  // 2. every pixel from the warped layout: seam or slab, how far from the slab's edge, which edge
  const warpX = tileNoise(WARP_FREQ, rand), warpY = tileNoise(WARP_FREQ, rand), pinch = tileNoise(64, rand), grain = tileNoise(160, rand);
  const big = tileNoise(5, rand), mid = tileNoise(20, rand), fine = tileNoise(80, rand), darkLine = tileNoise(48, rand);
  const c = document.createElement('canvas'); c.width = c.height = N; const ctx = c.getContext('2d');
  const bc = document.createElement('canvas'); bc.width = bc.height = N; const bctx = bc.getContext('2d');
  const img = ctx.createImageData(N, N), d = img.data, bimg = bctx.createImageData(N, N), bd = bimg.data;
  const seamMask = new Uint8Array(N * N); // 1 = seam (for cracks / weeds)
  const weeds = [];
  const [dr, dg, db] = PALETTE.seamDeep, [mr2, mg2, mb2] = PALETTE.seam, [sr, sg, sb] = PALETTE.sand;
  const [gr, gg, gb] = PALETTE.grime, [mor, mog, mob] = PALETTE.moss;
  for (let py = 0; py < N; py++) for (let px = 0; px < N; px++) {
    const u = px / N, v = py / N, i = (py * N + px) * 4;
    let wx = px + (warpX(u * WARP_FREQ, v * WARP_FREQ) - .5) * 2 * WARP, wy = py + (warpY(u * WARP_FREQ, v * WARP_FREQ) - .5) * 2 * WARP;
    wx = (wx + N) % N; wy = (wy + N) % N;
    const row = rowAt(wy), [s0, left] = slabAt(row, wx);
    const dl = wx - left, dRt = left + s0.w - wx, dt = wy - row.y0, dbm = row.y1 - wy;
    let dist = Math.min(dl, dRt, dt, dbm), nx = 0, ny = 0;
    if (dist === dl) nx = -1; else if (dist === dRt) nx = 1; else if (dist === dt) ny = -1; else ny = 1;
    const cx = Math.min(dl, dRt), cy = Math.min(dt, dbm), R = s0.corner; // round the corners off
    if (cx < R && cy < R) dist = Math.min(dist, R - Math.hypot(R - cx, R - cy));
    const hw = s0.seam * (1 - SEAM_PINCH / 2 + SEAM_PINCH * pinch(u * 64, v * 64)); // pinching and widening along the seam
    if (s0.lost || dist < hw) { // seam: sandy dirt; a thin dark line down the middle only here and there; sand pooling in the wide gaps
      const t = s0.lost ? 1 : Math.max(0, dist / hw), pool = s0.lost ? 1 : Math.max(0, Math.min(1, (hw - POOL) / .8));
      let R0 = mr2, G0 = mg2, B0 = mb2;
      const line = darkLine(u * 48, v * 48) > 1 - DARK_LINE ? Math.max(0, 1 - t / .4) * (1 - pool) : 0;
      R0 += (dr - R0) * line; G0 += (dg - G0) * line; B0 += (db - B0) * line;
      const sandK = Math.max(pool, .25) * (.55 + .45 * grain(u * 160, v * 160));
      R0 += (sr - R0) * sandK; G0 += (sg - G0) * sandK; B0 += (sb - B0) * sandK;
      d[i] = R0; d[i + 1] = G0; d[i + 2] = B0; d[i + 3] = 255;
      const bv = 110 + 40 * t - line * 40; bd[i] = bd[i + 1] = bd[i + 2] = bv; bd[i + 3] = 255;
      seamMask[py * N + px] = 1;
      if (hw > POOL && rand() < WEED_CHANCE) weeds.push([px, py]);
      continue;
    }
    // slab: tone, weathering, worn edge, and the lit / shaded lip of a slab sitting proud or sunken
    const n = big(u * 5, v * 5), m = mid(u * 20, v * 20), f = fine(u * 80, v * 80);
    let k = .9 + (m - .5) * .14 + (f - .5) * .1 + (grain(u * 160, v * 160) - .5) * .06;
    let R1 = s0.col[0] * k, G1 = s0.col[1] * k, B1 = s0.col[2] * k;
    const grime = Math.max(0, .42 - n) * 1.4;
    R1 += (gr - R1) * grime; G1 += (gg - G1) * grime; B1 += (gb - B1) * grime;
    const moss = Math.max(0, m - .72) * 1.6 * (1 - n);
    R1 += (mor - R1) * moss; G1 += (mog - G1) * moss; B1 += (mob - B1) * moss;
    const e = 1 - Math.min(1, (dist - hw) / s0.erode); // worn edge: the stone's tone fades into the seam's
    const wear = e * e * (3 - 2 * e);
    R1 += (mr2 - R1) * wear * .75; G1 += (mg2 - G1) * wear * .75; B1 += (mb2 - B1) * wear * .75;
    const lipBand = 1 - Math.min(1, (dist - hw) / LIP), lip = (nx * s0.tx + ny * s0.ty) * lipBand * LIP_AMT; // proud edge lit, sunken shaded
    const L = 1 + lip;
    d[i] = Math.min(255, R1 * L); d[i + 1] = Math.min(255, G1 * L); d[i + 2] = Math.min(255, B1 * L); d[i + 3] = 255;
    const bv = 165 + 70 * Math.min(1, (dist - hw) / s0.erode) + lip * 90; bd[i] = bd[i + 1] = bd[i + 2] = Math.max(0, Math.min(255, bv)); bd[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0); bctx.putImageData(bimg, 0, 0);
  const wrap = draw => { for (const ox of [-N, 0, N]) for (const oy of [-N, 0, N]) draw(ox, oy); };

  // 3. weeds and moss tufts in the wide seams
  for (const [px, py] of weeds) {
    const dry = rand() < .65, blades = 4 + rand() * 6;
    wrap((ox, oy) => {
      for (let k = 0; k < blades; k++) {
        const a = rand() * Math.PI * 2, l = 2 + rand() * 7;
        ctx.strokeStyle = dry ? `rgba(${150 + rand() * 30 | 0},${132 + rand() * 24 | 0},${88 + rand() * 16 | 0},.9)` : `rgba(${mor},${mog},${mob},.9)`;
        ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(px + ox, py + oy); ctx.lineTo(px + ox + Math.cos(a) * l, py + oy + Math.sin(a) * l); ctx.stroke();
      }
    });
  }

  // 4. cracks: a jagged random walk (drifting, with sharp kinks), at most CRACK_FORKS forks, thick in
  // the middle tapering to hairline ends; dark core with a dusty, chipped rim on one side; spalled
  // chips where a crack meets a seam. Long ones start near slab corners and run on across seams.
  const isSeam = (x, y) => seamMask[((Math.round(y) % N + N) % N) * N + ((Math.round(x) % N + N) % N)] === 1;
  const spall = (x, y) => wrap((ox, oy) => { // a small irregular chip: dark hollow, light broken edge
    const r = 2 + rand() * 4, pts = Array.from({ length: 6 }, (_, k) => { const a = k / 6 * Math.PI * 2, rr = r * (.5 + rand() * .7); return [x + ox + Math.cos(a) * rr, y + oy + Math.sin(a) * rr]; });
    for (const [cx2, fill2, dx] of [[ctx, `rgba(${PALETTE.seamDeep},.8)`, 0], [ctx, 'rgba(232,224,206,.35)', 1.2], [bctx, '#3a3a3a', 0]]) {
      cx2.fillStyle = fill2; cx2.beginPath(); pts.forEach(([a, b], k) => k ? cx2.lineTo(a + dx, b + dx) : cx2.moveTo(a + dx, b + dx)); cx2.fill();
    }
  });
  const drawCrack = (pts, width) => {
    const n = pts.length;
    wrap((ox, oy) => {
      for (let k = 1; k < n; k++) {
        const t = k / (n - 1), w = Math.max(.5, width * Math.sin(Math.PI * Math.min(.98, Math.max(.02, t)))); // taper
        const [a, b] = pts[k - 1], [c2, e2] = pts[k];
        ctx.strokeStyle = 'rgba(232,224,206,.35)'; ctx.lineWidth = w * .9; ctx.beginPath(); ctx.moveTo(a + ox + w * .7, b + oy + w * .7); ctx.lineTo(c2 + ox + w * .7, e2 + oy + w * .7); ctx.stroke(); // dusty rim
        ctx.strokeStyle = `rgba(${PALETTE.seamDeep},.9)`; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(a + ox, b + oy); ctx.lineTo(c2 + ox, e2 + oy); ctx.stroke();  // dark core
        bctx.strokeStyle = '#303030'; bctx.lineWidth = w + .6; bctx.beginPath(); bctx.moveTo(a + ox, b + oy); bctx.lineTo(c2 + ox, e2 + oy); bctx.stroke();
      }
    });
  };
  const walk = (x0, y0, a, len, step, chips = true) => {
    const pts = [[x0, y0]]; let x = x0, y2 = y0, wasSeam = false;
    for (let s2 = 0; s2 < len; s2 += step) {
      a += (rand() - .5) * .35; if (rand() < .08) a += (rand() - .5) * 1.6; // drift, and now and then a sharp kink
      x += Math.cos(a) * step; y2 += Math.sin(a) * step; pts.push([x, y2]);
      const seamNow = isSeam(x, y2);
      if (chips && seamNow && !wasSeam && rand() < SPALL_CHANCE) spall(x, y2);
      wasSeam = seamNow;
    }
    return pts;
  };
  const slabsAll = rows.flatMap(r => r.slabs.map(s0 => ({ ...s0, y0: r.y0, y1: r.y1 }))).filter(s0 => !s0.lost);
  for (let k = 0; k < LONG_CRACKS; k++) {
    const sl = pick(slabsAll, rand), cxr = rand() < .5 ? 0 : 1, cyr = rand() < .5 ? 0 : 1; // start near a corner
    const x0 = sl.x + cxr * sl.w + (cxr ? -1 : 1) * (6 + rand() * 30), y0 = sl.y0 + cyr * (sl.y1 - sl.y0) + (cyr ? -1 : 1) * (6 + rand() * 30);
    const a = Math.atan2(cyr ? -1 : 1, cxr ? -1 : 1) + (rand() - .5) * 1.2; // heading into the slab, and maybe on beyond
    const pts = walk(x0, y0, a, k < SPANNING ? 380 + rand() * 260 : 160 + rand() * 200, 7); // the first few run on across several slabs
    drawCrack(pts, CRACK_WIDTH * (.7 + rand() * .5)); spall(x0, y0);
    let forks = 0; for (let f3 = 0; f3 < CRACK_FORKS; f3++) if (rand() < FORK_CHANCE) forks++;
    for (let f2 = 0; f2 < forks; f2++) {
      const [bx, by] = pts[Math.floor(pts.length * (.3 + rand() * .5))];
      drawCrack(walk(bx, by, a + (rand() < .5 ? 1 : -1) * (.5 + rand() * .7), 40 + rand() * 120, 6), CRACK_WIDTH * .55);
    }
  }
  for (let k = 0; k < HAIRLINES; k++) { // a few hairlines, each within one slab (it stops at the seam)
    const sl = pick(slabsAll, rand);
    const pts = walk(sl.x + sl.w * (.2 + rand() * .6), sl.y0 + (sl.y1 - sl.y0) * (.2 + rand() * .6), rand() * Math.PI * 2, 60 + rand() * 120, 5, false);
    const stop = pts.findIndex(([x, y2]) => isSeam(x, y2));
    drawCrack(stop > 2 ? pts.slice(0, stop) : pts, .8);
  }

  // 5. fine dust and pitting
  for (let i = 0; i < 90000; i++) {
    const v = rand();
    ctx.fillStyle = v < .55 ? `rgba(${PALETTE.grime},${.05 + rand() * .1})` : v < .85 ? `rgba(236,230,216,${.04 + rand() * .06})` : `rgba(${PALETTE.sand},${.1 + rand() * .15})`;
    ctx.fillRect(rand() * N, rand() * N, 1 + rand() * 1.5, 1 + rand() * 1.5);
  }
  const tex = cv => { const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 16; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; return t; };
  return { map: tex(c), bump: tex(bc), macro: tex(macroNoise(rand)) };
}

// A small tileable cloud of weathering (grime / bleaching), laid over the paving at scales unrelated
// to the slab tile so the repeat never shows.
function macroNoise(rand) {
  const S = 256, c = document.createElement('canvas'); c.width = c.height = S; const x = c.getContext('2d');
  const a = tileNoise(4, rand), b2 = tileNoise(9, rand), f = tileNoise(23, rand), img = x.createImageData(S, S);
  for (let py = 0; py < S; py++) for (let px = 0; px < S; px++) {
    const u = px / S, v = py / S, n = a(u * 4, v * 4) * .55 + b2(u * 9, v * 9) * .3 + f(u * 23, v * 23) * .15, i = (py * S + px) * 4;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = n * 255; img.data[i + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  return c;
}

// Lay the macro weathering over a paving material (two samples at unrelated scales and angles), and
// fade it into drifted sand near the terrace edges (the per-vertex `sand` attribute from buildPaving).
export function addMacro(material, macro) {
  const [sr, sg, sb] = PALETTE.sand.map(v => (v / 255).toFixed(3));
  material.onBeforeCompile = sh => {
    sh.uniforms.macroMap = { value: macro };
    sh.vertexShader = 'attribute float sand;\nvarying float vSand;\n' + sh.vertexShader.replace('#include <uv_vertex>', '#include <uv_vertex>\n\tvSand = sand;');
    sh.fragmentShader = 'uniform sampler2D macroMap;\nvarying float vSand;\n' + sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
\tvec2 wuv = vUv * ${TILE.toFixed(1)};
\tfloat mA = texture2D( macroMap, wuv / 41.0 ).r, mB = texture2D( macroMap, mat2( .8, -.6, .6, .8 ) * wuv / 17.0 + .37 ).r;
\tdiffuseColor.rgb *= .8 + mA * .3 + ( mB - .5 ) * .14;
\tfloat drift = smoothstep( 0.0, 1.0, vSand * ( .55 + mB * .9 ) );
\tdiffuseColor.rgb = mix( diffuseColor.rgb, vec3( ${sr}, ${sg}, ${sb} ) * 1.15, drift * .55 );`);
  };
  return material;
}

// One mesh of flat quads, one per terrace cell, at height y. cells: [[x0, z0, size, sandCorners, w?, h?]]
// (cell corner, size in metres, and the drifted-sand amount 0..1 at its four corners). UVs are
// world-aligned; a gentle per-vertex tint varies the stone in patches.
export function buildPaving(cells, y, material) {
  const pos = [], uv = [], col = [], sand = [], idx = [];
  const tint = (x, z) => {
    const v = Math.sin(x * .13 + Math.sin(z * .07) * 2) * .5 + Math.sin(z * .11 + Math.cos(x * .05) * 2) * .5
      + Math.sin(x * .031 - z * .047 + Math.sin(x * .02) * 3) * .6;
    return .94 + v * .05;
  };
  for (const [x0, z0, s, sc, w = s, h = s] of cells) { // (w, h: a cell trimmed short of a wall)
    const n = pos.length / 3;
    [[0, 0], [w, 0], [w, h], [0, h]].forEach(([dx, dz], k) => {
      const X = x0 + dx, Z = z0 + dz, t = tint(X, Z);
      pos.push(X, y, Z); uv.push(X / TILE, -Z / TILE); col.push(t, t, t * .99); sand.push(sc ? sc[k] : 0);
    });
    idx.push(n, n + 3, n + 1, n + 1, n + 3, n + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('sand', new THREE.Float32BufferAttribute(sand, 1));
  g.setIndex(idx); g.computeVertexNormals();
  const m = new THREE.Mesh(g, material);
  m.receiveShadow = true;
  return m;
}
