// Stage 2's pool borders: flat paving of square stone blocks round the pools, flush with the ground,
// one NES stone (2 x 2 cells) wide. Warm grey-cream limestone a shade darker than the terrace floor,
// each block chunky and rounded at its edges with an uneven, broken outline, the odd broken
// corner or hairline crack, grime and sand in the seams; a soft contact shadow and a thin, ragged fade of the
// ground's sand along the land side; a crisp edge against the water, which sits a little below.
// No shadow cast, no backing mesh.
import * as THREE from 'three';

// ---- shape ----
const LIP = .12;                  // metres the stones stand above the ground (the water sits this far below)
const GAP = .02;                  // metres between stones (they nearly touch)
// ---- look ----
const STONE = [172, 164, 150];    // warm grey-cream limestone
const ALBEDO = .58;               // a shade darker than the floor
const TONE_VAR = .05;             // per-stone brightness (±)
const RIM = 34;                   // px (of TEX): width of the chunky, rounded, darker edge
const RIM_DARK = .3;              // how much darker the edge gets (never lighter: no bright chamfer)
const OUTLINE = 9;                // px: how far the broken outline wanders in from the edge
const TEX = 256;
const NORMAL = .6;                // strength of the relief (low: lit edges stay soft)
const ERODE = .12;                // how uneven the weathered face is (height)
const PITS = 90;                  // small erosion pits per stone
const GRIME = .22;                // broad grime stains (darkening)
const LICHEN = 7;                 // spots of olive lichen per stone
const CHIPS = .45;                // chance a corner is broken
const CRACKED = .1;               // share of stones with one hairline crack
const SEAM_COLOR = 0x564b3e;      // grime in the seams
const SEAM_SAND = .3;             // share of seams with sand worked into them
// ---- grounding ----
const AO_WIDTH = .7;              // metres of soft contact shadow on the ground along the land side
const AO_STRENGTH = .45;
const SAND_FADE = .35;            // metres of sand fading in over a stone's land-side edge

function rng(seed) {
  let s = seed >>> 0;
  return () => { s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}

// The stone's face: limestone grain and a chunky, rounded edge that darkens (never lightens) toward
// an uneven, broken outline, where the seam's grime bites into the stone; corners broken off in
// irregular chunks (chips: bitmask of corners); cracked: one hairline crack. A normal map from the same
// height field gives the rounding its shape.
function stoneTextures(rand, chips, cracked) {
  const c = document.createElement('canvas'); c.width = c.height = TEX; const x = c.getContext('2d');
  const nc = document.createElement('canvas'); nc.width = nc.height = TEX; const nx = nc.getContext('2d');
  const height = new Float32Array(TEX * TEX), broken = new Uint8Array(TEX * TEX);
  const noise = P => { const g = Float32Array.from({ length: P * P }, rand); return (u, v) => { // smooth value noise over the stone
    const x2 = u * (P - 1), y2 = v * (P - 1), ix = Math.min(P - 2, Math.floor(x2)), iy = Math.min(P - 2, Math.floor(y2)), fx = x2 - ix, fy = y2 - iy;
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy), at = (a, b) => g[b * P + a];
    return (at(ix, iy) * (1 - sx) + at(ix + 1, iy) * sx) * (1 - sy) + (at(ix, iy + 1) * (1 - sx) + at(ix + 1, iy + 1) * sx) * sy; }; };
  const n1 = noise(5), n2 = noise(13), n3 = noise(4), n4 = noise(9);
  const erosion = (u, v) => n1(u, v) * .6 + n2(u, v) * .4;             // the face's rolling unevenness
  const grime = (u, v) => Math.max(0, n3(u, v) * .7 + n4(u, v) * .3 - .45) * 2; // broad stains
  const wob = Array.from({ length: 4 }, () => Array.from({ length: 9 }, () => rand())); // per side: the outline's unevenness
  const wobble = (side, t) => { const w = wob[side], f = t * 8, k = Math.floor(f), u = f - k, a = w[k], b = w[Math.min(8, k + 1)]; return (a + (b - a) * u * u * (3 - 2 * u)) * OUTLINE; };
  const chipShape = [0, 1, 2, 3].map(() => [22 + rand() * 30, 22 + rand() * 30, rand()]); // per corner: size along each side, bulge
  for (let py = 0; py < TEX; py++) for (let px = 0; px < TEX; px++) {
    const u = px / TEX, v = py / TEX;
    const dl = px - wobble(0, v), dr = TEX - 1 - px - wobble(1, v), dt = py - wobble(2, u), db = TEX - 1 - py - wobble(3, u);
    let edge = Math.min(dl, dr, dt, db);
    [[0, 0], [TEX, 0], [TEX, TEX], [0, TEX]].forEach(([cx, cy], k) => { // a broken corner: an irregular chunk gone
      if (!(chips >> k & 1)) return;
      const [a, b, bulge] = chipShape[k], fx = Math.abs(px - cx) / a, fy = Math.abs(py - cy) / b;
      const cut = fx + fy - (1 + bulge * .4 * Math.sin(fx * 6 + fy * 4));
      if (cut < 0) edge = Math.min(edge, cut * 12);
    });
    const i2 = py * TEX + px;
    if (edge < 0) { broken[i2] = 1; height[i2] = 0; continue; }
    const t = Math.min(1, edge / RIM);
    height[i2] = .35 + .65 * Math.sqrt(t * (2 - t)) - ERODE * erosion(u, v); // a rounded, chunky profile, its face eroded uneven
  }
  for (let k = 0; k < PITS; k++) { // small pits, worn into the face
    const cx = rand() * TEX, cy = rand() * TEX, r = 1.5 + rand() * 4.5, depth = .08 + rand() * .14;
    for (let py = Math.max(0, cy - r | 0); py < Math.min(TEX, cy + r + 1); py++) for (let px = Math.max(0, cx - r | 0); px < Math.min(TEX, cx + r + 1); px++) {
      const dd = Math.hypot(px - cx, py - cy) / r; if (dd < 1) height[py * TEX + (px | 0)] -= depth * (1 - dd * dd);
    }
  }
  const img = x.createImageData(TEX, TEX), d = img.data, nimg = nx.createImageData(TEX, TEX), nd = nimg.data;
  for (let py = 0; py < TEX; py++) for (let px = 0; px < TEX; px++) {
    const i2 = py * TEX + px, h = height[i2];
    const hx = height[py * TEX + Math.min(TEX - 1, px + 1)] - height[py * TEX + Math.max(0, px - 1)];
    const hy = height[Math.min(TEX - 1, py + 1) * TEX + px] - height[Math.max(0, py - 1) * TEX + px];
    let vx = -hx * NORMAL * 8, vy = hy * NORMAL * 8, vz = 1; const l = Math.hypot(vx, vy, vz); vx /= l; vy /= l; vz /= l;
    nd[i2 * 4] = (vx * .5 + .5) * 255; nd[i2 * 4 + 1] = (vy * .5 + .5) * 255; nd[i2 * 4 + 2] = (vz * .5 + .5) * 255; nd[i2 * 4 + 3] = 255;
    if (broken[i2]) { const g = new THREE.Color(SEAM_COLOR); d[i2 * 4] = g.r * 255; d[i2 * 4 + 1] = g.g * 255; d[i2 * 4 + 2] = g.b * 255; d[i2 * 4 + 3] = 255; continue; }
    const shade = (1 - Math.max(0, 1 - h) / .65 * RIM_DARK) * (1 + (rand() - .5) * .07) * (1 - GRIME * grime(px / TEX, py / TEX)); // full tone on the face, darker toward the edge, in pits and stains
    d[i2 * 4] = STONE[0] * shade; d[i2 * 4 + 1] = STONE[1] * shade; d[i2 * 4 + 2] = STONE[2] * shade; d[i2 * 4 + 3] = 255;
  }
  x.putImageData(img, 0, 0); nx.putImageData(nimg, 0, 0);
  for (let i2 = 0; i2 < 700; i2++) { x.fillStyle = `rgba(236,230,216,${.04 + rand() * .06})`; x.fillRect(rand() * TEX, rand() * TEX, 1 + rand() * 2, 1 + rand() * 2); }
  for (let k = 0; k < LICHEN; k++) { // olive lichen, in soft-edged clusters of dots
    const cx = rand() * TEX, cy = rand() * TEX, r = 5 + rand() * 12;
    for (let j = 0; j < 24; j++) { const a = rand() * Math.PI * 2, rr = Math.sqrt(rand()) * r; x.fillStyle = `rgba(104,106,70,${.15 + rand() * .25})`; x.beginPath(); x.arc(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, .8 + rand() * 2, 0, 7); x.fill(); }
  }
  for (let k = 0; k < 5; k++) { // fine scratches
    const x0 = rand() * TEX, y0 = rand() * TEX, a = rand() * Math.PI, l = 10 + rand() * 30;
    x.strokeStyle = 'rgba(60,52,40,.25)'; x.lineWidth = .8; x.beginPath(); x.moveTo(x0, y0); x.lineTo(x0 + Math.cos(a) * l, y0 + Math.sin(a) * l); x.stroke();
  }
  for (let k = 0; k < 6; k++) { // sun-bleached patches
    const cx = rand() * TEX, cy = rand() * TEX, r = 15 + rand() * 30, g = x.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, 'rgba(240,234,220,.12)'); g.addColorStop(1, 'rgba(240,234,220,0)'); x.fillStyle = g; x.fillRect(cx - r, cy - r, r * 2, r * 2);
  }
  if (cracked) { // one hairline crack, with a pale rim
    let px = rand() * TEX, py = 0, a = Math.PI / 2 + (rand() - .5) * .7; const pts = [[px, py]];
    while (py < TEX && px > 0 && px < TEX) { a += (rand() - .5) * .35; px += Math.cos(a) * 7; py += Math.sin(a) * 7; pts.push([px, py]); }
    for (const [col, w, off] of [['rgba(232,226,212,.35)', 1.6, 1], ['rgba(54,46,36,.7)', 1, 0]]) {
      x.strokeStyle = col; x.lineWidth = w; x.beginPath(); pts.forEach(([a2, b2], k) => k ? x.lineTo(a2 + off, b2 + off) : x.moveTo(a2 + off, b2 + off)); x.stroke();
    }
  }
  const tex = cv => { const t = new THREE.CanvasTexture(cv); t.anisotropy = 16; return t; };
  return { map: tex(c), normal: tex(nc) };
}

// A soft gradient strip: dark (or opaque) at v = 0 fading to nothing at v = 1, ragged along u.
function fadeTexture(rand, ragged) {
  const W = 128, H = 32, c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d');
  const img = x.createImageData(W, H), d = img.data;
  for (let px = 0; px < W; px++) {
    const reach = ragged ? .55 + .45 * Math.abs(Math.sin(px * .19) * Math.cos(px * .07 + 1.3)) + (rand() - .5) * .2 : 1;
    for (let py = 0; py < H; py++) {
      const t = py / H / reach, a = t >= 1 ? 0 : Math.pow(1 - t, 1.6) * (ragged ? (rand() < .8 ? 1 : .4) : 1), i = (py * W + px) * 4;
      d[i] = d[i + 1] = d[i + 2] = a * 255; d[i + 3] = 255; // (an alpha map reads the green channel)
    }
  }
  x.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c); t.wrapS = THREE.RepeatWrapping;
  return t;
}

// cells: the rim cells [[r, c]]; cellXZ(r, c): a cell's north-west corner; CELL: cell size; isWater /
// isLand(r, c); sandMat: the ground's sand material (its map and colour are reused).
export function buildPoolBorders(scene, cells, cellXZ, CELL, isWater, isLand, sandMat) {
  if (!cells.length) return;
  const rand = rng(17), set = new Set(cells.map(([r, c]) => r + ',' + c)), used = new Set(), stones = [];
  const has = (r, c) => set.has(r + ',' + c) && !used.has(r + ',' + c);
  // group into NES stones: 2 x 2 where the rim is two cells deep, single cells elsewhere
  for (const [r, c] of [...cells].sort((a, b) => a[0] - b[0] || a[1] - b[1])) {
    if (!has(r, c)) continue;
    const n = has(r, c + 1) && has(r + 1, c) && has(r + 1, c + 1) ? 2 : 1;
    for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) used.add((r + a) + ',' + (c + b));
    stones.push({ r, c, n });
  }
  // a few variants: different corners chipped, and one with a hairline crack
  const variants = [0, 1, 2, 3].map(() => stoneTextures(rand, [0, 1, 2, 4, 8, 3, 12][Math.floor(rand() * 7)] * (rand() < CHIPS * 2 ? 1 : 0), false));
  variants.push(stoneTextures(rand, 0, true));
  const mats = variants.map(t => new THREE.MeshStandardMaterial({ map: t.map, normalMap: t.normal, normalScale: new THREE.Vector2(.8, .8),
    color: new THREE.Color(ALBEDO, ALBEDO, ALBEDO), roughness: .95, envMapIntensity: .2 }));
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), col = new THREE.Color();
  const lists = mats.map(() => []);
  const edges = [], seams = []; // land-side edges: [x, z, length, outward angle]; seams between stones: [x, z, length, along x?]
  stones.forEach((s, i) => {
    const [x0, z0] = cellXZ(s.r, s.c), size = s.n * CELL;
    const side = (dr, dc) => { // does this side face water / land (any cell along it)?
      const cellsAlong = Array.from({ length: s.n }, (_, k) => dr ? [dr > 0 ? s.r + s.n : s.r - 1, s.c + k] : [s.r + k, dc > 0 ? s.c + s.n : s.c - 1]);
      return { water: cellsAlong.some(([a, b]) => isWater(a, b)), land: cellsAlong.some(([a, b]) => isLand(a, b)) };
    };
    const W = side(0, -1), E = side(0, 1), N = side(-1, 0), S = side(1, 0);
    // every stone square on the grid, so the seams run straight and line up on all four sides
    lists[rand() < CRACKED ? 4 : Math.floor(rand() * 4)].push({ x: x0 + size / 2, z: z0 + size / 2, size, k: 1 + (rand() - .5) * 2 * TONE_VAR });
    if (!E.water && !E.land && rand() < SEAM_SAND) seams.push([x0 + size, z0 + size / 2, size, false]);
    if (!S.water && !S.land && rand() < SEAM_SAND) seams.push([x0 + size / 2, z0 + size, size, true]);
    if (W.land) edges.push([x0, z0 + size / 2, size, Math.PI]);
    if (E.land) edges.push([x0 + size, z0 + size / 2, size, 0]);
    if (N.land) edges.push([x0 + size / 2, z0, size, -Math.PI / 2]);
    if (S.land) edges.push([x0 + size / 2, z0 + size, size, Math.PI / 2]);
  });
  lists.forEach((list, k) => {
    if (!list.length) return;
    const tiles = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mats[k], list.length);
    list.forEach((o, i) => { m4.compose(new THREE.Vector3(o.x, LIP / 2, o.z), q.identity(), new THREE.Vector3(o.size - GAP, LIP, o.size - GAP)); tiles.setMatrixAt(i, m4); tiles.setColorAt(i, col.setScalar(o.k)); });
    tiles.castShadow = false; tiles.receiveShadow = true; tiles.frustumCulled = false; scene.add(tiles);
  });
  // grime in the seams: a dark bed under each stone, exactly its own square (nothing sticks out)
  const bed = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: SEAM_COLOR, roughness: 1, envMapIntensity: .1 }), stones.length);
  stones.forEach((s, i) => { const [x0, z0] = cellXZ(s.r, s.c), size = s.n * CELL; bed.setMatrixAt(i, m4.compose(new THREE.Vector3(x0 + size / 2, LIP * .6, z0 + size / 2), q.identity(), new THREE.Vector3(size, 1, size))); });
  bed.receiveShadow = true; bed.frustumCulled = false; scene.add(bed);
  if (!edges.length) return;
  // along the land side: a soft contact shadow on the ground, and sand fading in over the stone's edge
  const strip = (tex, material, y, width, inward) => {
    const mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), material, edges.length);
    edges.forEach(([x, z, len, ang], i) => {
      const ox = Math.cos(ang), oz = Math.sin(ang), off = inward ? -width / 2 : width / 2; // out from the edge, or in over the stone
      m4.compose(new THREE.Vector3(x + ox * off, y, z + oz * off), q.setFromEuler(e.set(0, -ang + Math.PI / 2, 0)), new THREE.Vector3(len, 1, width));
      mesh.setMatrixAt(i, m4);
    });
    mesh.receiveShadow = true; mesh.frustumCulled = false; mesh.renderOrder = 1; scene.add(mesh);
  };
  const aoTex = fadeTexture(rand, false); // dark at the stone, fading outward
  strip(aoTex, new THREE.MeshBasicMaterial({ color: 0x000000, alphaMap: aoTex, transparent: true, opacity: AO_STRENGTH, depthWrite: false }), .015, AO_WIDTH, false);
  const sandTex = sandMat.map ? sandMat.map.clone() : null; if (sandTex) { sandTex.needsUpdate = true; sandTex.repeat.set(.6, .2); }
  const fade = fadeTexture(rand, true); fade.center.set(.5, .5); fade.rotation = Math.PI; // thickest at the stone's edge, thinning inward
  const sandFade = new THREE.MeshStandardMaterial({ map: sandTex, color: sandMat.color, alphaMap: fade, transparent: true, depthWrite: false, roughness: 1, envMapIntensity: .3 });
  strip(fade, sandFade, LIP + .004, SAND_FADE, true);
  if (seams.length) { // sand worked into some of the seams, thin and ragged
    const ms = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), sandFade, seams.length);
    seams.forEach(([x, z, len, alongX], i) => { m4.compose(new THREE.Vector3(x, LIP + .003, z), q.setFromEuler(e.set(0, alongX ? 0 : Math.PI / 2, 0)), new THREE.Vector3(len * (.5 + rand() * .4), 1, .14)); ms.setMatrixAt(i, m4); });
    ms.frustumCulled = false; ms.renderOrder = 1; scene.add(ms);
  }
}
