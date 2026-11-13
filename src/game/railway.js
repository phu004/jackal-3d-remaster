// Stage 4's railway (the NES map's track): a main line running down the valley from a tunnel in the cliff to the south, where it bends west and runs off the map, and a spur
// branching east off it to a buffer stop. Built from the stage data's centre lines (stage.rails: lines and arcs in map pixels): a gravel bed (a ribbon over the ground, roughened and
// painted per vertex), timber sleepers (instanced, each a little different and slightly off true), steel tie plates, two I-section rails swept along each line (rust-brown with a
// worn bright head), fishplates at the rail joints, weeds along the edges of the bed, and a timber buffer stop at the spur's end. Scenery only: the jeep drives over it.
// railPaths(stage, toWorld, tileAt): the centre lines as arrays of world points (stopped where the cliff begins: the tunnel's mouth). buildRailway(scene, paths, { heightAt }).
import * as THREE from 'three';
import { BufferGeometryUtils } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { cliffTextures } from './cliff-textures.js';

const HEAD = .072;           // m: the rail head's width
const GAUGE = 1.35 + HEAD;   // m between the rails' centres: 1.35 m between their inner faces (narrowed from standard gauge, 1.435 m)
const SLEEPER_GAP = .64;     // m between sleepers
const SLEEPER = { len: 2.1, w: .23, h: .14 };
const BED_TOP = 1.05, BED_FOOT = 1.5, BED_H = .14; // m: half-width of the flat top, of the foot, and the bed's height
const RAIL_H = .165;         // m: the rail's height (sitting on the sleepers)
const FOOT_RISE = .5;        // m: the tunnel portal stands where the cliff has risen this high

const hash = (x, y) => { let h = Math.imul(Math.floor(x * 7.3), 374761393) + Math.imul(Math.floor(y * 7.3), 668265263); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const mix = (a, b, t) => a + (b - a) * t;
const smoothS = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const PORTAL_S = 4.45;       // m along the main line from its far (inside-the-rock) end to the portal's front: the bed flares out over the last 4 m before it

// A line that goes straight into a curve (or a curve into a line) turns at full rate the moment the curve starts, which shows as a sudden change of angle in a train running over it.
// The centre line is resampled every metre and averaged over a window of +-WIN m, twice (beyond its two ends it carries on straight, so the ends stay put and keep their direction):
// the turn now builds up and dies away over a few tens of metres, like a railway's transition curves.
const EASE_STEP = 1, EASE_WIN = 9;
function easeBends(pts) {
  if (pts.length < 3) return pts;
  const len = pts.reduce((l, p, i) => l + (i ? p.distanceTo(pts[i - 1]) : 0), 0), n = Math.max(2, Math.round(len / EASE_STEP));
  let line = [], acc = 0, seg = 1; const cum = [0]; for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + pts[i].distanceTo(pts[i - 1]));
  for (let i = 0; i <= n; i++) {
    const d = len * i / n; while (seg < pts.length - 1 && cum[seg] < d) seg++;
    const k = (d - cum[seg - 1]) / Math.max(1e-6, cum[seg] - cum[seg - 1]); line.push(pts[seg - 1].clone().lerp(pts[seg], Math.min(1, Math.max(0, k))));
  }
  const step = len / n, w = Math.round(EASE_WIN / step);
  const t0 = line[1].clone().sub(line[0]).normalize(), t1 = line[n].clone().sub(line[n - 1]).normalize();
  for (let pass = 0; pass < 2; pass++) {
    const at = j => j < 0 ? line[0].clone().addScaledVector(t0, j * step) : j > n ? line[n].clone().addScaledVector(t1, (j - n) * step) : line[j];
    line = line.map((_, i) => { const s = new THREE.Vector3(); for (let j = -w; j <= w; j++) s.add(at(i + j)); return s.multiplyScalar(1 / (2 * w + 1)); });
  }
  return line;
}

// The stage's rails as world-point arrays. Each rail is a list of { line: [x0, y0, x1, y1] } / { arc: { cx, cy, r, from, to } } parts in map pixels (angles in degrees, y down).
export function railPaths(stage, toWorld, tileAt) {
  const out = [];
  for (const rail of stage.rails ?? []) {
    const pts = [];
    for (const part of rail.parts) {
      if (part.line) {
        const [x0, y0, x1, y1] = part.line, a = toWorld(x0, y0), b = toWorld(x1, y1), n = Math.max(1, Math.ceil(a.distanceTo(b) / 2));
        for (let i = 0; i <= n; i++) pts.push(a.clone().lerp(b, i / n));
      } else if (part.bezier) { // a cubic curve: [x0, y0, x1, y1, x2, y2, x3, y3] (two end points and their two handles), eased round at a gentle radius
        const [x0, y0, x1, y1, x2, y2, x3, y3] = part.bezier, n = 48;
        for (let i = 0; i <= n; i++) { const u = i / n, a = (1 - u) ** 3, b = 3 * u * (1 - u) ** 2, c = 3 * u * u * (1 - u), d = u ** 3; pts.push(toWorld(a * x0 + b * x1 + c * x2 + d * x3, a * y0 + b * y1 + c * y2 + d * y3)); }
      } else {
        const { cx, cy, r, from, to } = part.arc, n = Math.max(3, Math.ceil(Math.abs(to - from) / 4));
        for (let i = 0; i <= n; i++) { const a = (from + (to - from) * i / n) * Math.PI / 180; pts.push(toWorld(cx + Math.cos(a) * r, cy + Math.sin(a) * r)); }
      }
    }
    const clean = easeBends(pts.filter((p, i) => !i || p.distanceTo(pts[i - 1]) > .01));
    let first = 0; while (first < clean.length && tileAt(clean[first].x, clean[first].z) === 'X') first++; // (the tunnel: the line stops at the cliff)
    let last = clean.length - 1; while (last > first && tileAt(clean[last].x, clean[last].z) === 'X') last--;
    out.push(clean.slice(first, last + 1));
  }
  // A branch starts on the main line: easing the main line's bends moved it a little, so the branch's first point is put back onto it, the shift dying away over the branch's first 30 m.
  const main = out[0];
  if (main && main.length > 1) for (let r = 1; r < out.length; r++) {
    const br = out[r]; if (!br.length) continue;
    let best = null, bd = Infinity;
    for (let i = 1; i < main.length; i++) {
      const a = main[i - 1], b = main[i], dx = b.x - a.x, dz = b.z - a.z, l2 = dx * dx + dz * dz, t = l2 ? Math.min(1, Math.max(0, ((br[0].x - a.x) * dx + (br[0].z - a.z) * dz) / l2)) : 0;
      const q = a.clone().lerp(b, t), d = Math.hypot(q.x - br[0].x, q.z - br[0].z); if (d < bd) { bd = d; best = q; }
    }
    if (!best || bd > 6) continue; // (not a branch of the main line)
    const shift = best.clone().sub(br[0]); let run = 0;
    br.forEach((p, i) => { if (i) run += p.distanceTo(br[i - 1]); const k = Math.min(1, run / 30); p.addScaledVector(shift, 1 - k * k * (3 - 2 * k)); });
  }
  return out;
}

// A function (x, z) -> is it on the line's bed (within `margin` m of a centre line)? For keeping scatter off the track.
export function nearRail(paths, margin = 2) {
  const segs = []; for (const p of paths) for (let i = 1; i < p.length; i++) segs.push([p[i - 1], p[i]]);
  return (x, z) => segs.some(([a, b]) => {
    const dx = b.x - a.x, dz = b.z - a.z, l2 = dx * dx + dz * dz, t = l2 ? Math.min(1, Math.max(0, ((x - a.x) * dx + (z - a.z) * dz) / l2)) : 0;
    return Math.hypot(x - (a.x + dx * t), z - (a.z + dz * t)) < margin;
  });
}

// path resampled every `step` m: [{ p, t (unit tangent), s (distance along) }]
function resample(path, step) {
  const out = []; let carried = 0, s = 0; const total = path.reduce((l, p, i) => l + (i ? p.distanceTo(path[i - 1]) : 0), 0);
  const at = d => { let acc = 0; for (let i = 1; i < path.length; i++) { const l = path[i].distanceTo(path[i - 1]); if (acc + l >= d || i === path.length - 1) { const k = l ? Math.min(1, (d - acc) / l) : 0; return { p: path[i - 1].clone().lerp(path[i], k), t: path[i].clone().sub(path[i - 1]).setY(0).normalize() }; } acc += l; } };
  for (let d = 0; d <= total + 1e-6; d += step) out.push({ ...at(Math.min(d, total)), s: d });
  return out;
}

// canvas textures (tileable, drawn once)
let gravelTex = null, woodTex = null;
function textures() {
  if (gravelTex || typeof document === 'undefined') return { gravelTex, woodTex };
  let sd = 31; const rnd = () => (sd = (sd * 9301 + 49297) % 233280) / 233280;
  const mk = S => { const c = document.createElement('canvas'); c.width = c.height = S; return [c, c.getContext('2d')]; };
  const wrap = (S, f) => { for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) f(ox, oy); };
  { // gravel: stones of every grey and brown, each with a dark rim and a pale highlight
    const S = 256, [c, x] = mk(S); x.fillStyle = 'rgb(150,146,138)'; x.fillRect(0, 0, S, S);
    for (let n = 0; n < 1400; n++) {
      const px = rnd() * S, py = rnd() * S, rx = 2 + rnd() * 5, ry = rx * (.6 + rnd() * .4), a = rnd() * 3, v = 90 + rnd() * 120, tint = rnd() < .3 ? [1.08, 1, .85] : rnd() < .5 ? [1, 1, 1.05] : [1.02, .98, .92];
      wrap(S, (ox, oy) => { x.fillStyle = `rgb(${v * tint[0]},${v * tint[1]},${v * tint[2]})`; x.beginPath(); x.ellipse(px + ox, py + oy, rx, ry, a, 0, 6.283); x.fill(); x.strokeStyle = 'rgba(25,22,18,.5)'; x.lineWidth = .8; x.stroke(); x.fillStyle = 'rgba(255,255,245,.22)'; x.beginPath(); x.ellipse(px + ox - rx * .25, py + oy - ry * .3, rx * .4, ry * .3, a, 0, 6.283); x.fill(); });
    }
    gravelTex = new THREE.CanvasTexture(c); gravelTex.wrapS = gravelTex.wrapT = THREE.RepeatWrapping; gravelTex.anisotropy = 8;
  }
  { // wood: long grain, knots, cracks and weathering streaks
    const S = 256, [c, x] = mk(S); x.fillStyle = 'rgb(190,178,160)'; x.fillRect(0, 0, S, S);
    for (let n = 0; n < 260; n++) { const py = rnd() * S, w = 1 + rnd() * 3; x.fillStyle = rnd() < .5 ? `rgba(60,45,30,${.1 + rnd() * .18})` : `rgba(255,245,225,${.06 + rnd() * .1})`; x.fillRect(0, py, S, w); } // grain along the length (across the texture)
    for (let n = 0; n < 14; n++) { const px = rnd() * S, py = rnd() * S, r = 3 + rnd() * 6; wrap(S, (ox, oy) => { x.strokeStyle = 'rgba(45,32,20,.45)'; x.lineWidth = 1.2; for (let k = 1; k < 4; k++) { x.beginPath(); x.ellipse(px + ox, py + oy, r * k * .5, r * k * .25, 0, 0, 6.283); x.stroke(); } }); } // knots
    x.strokeStyle = 'rgba(30,22,14,.6)'; x.lineWidth = 1.1; for (let n = 0; n < 7; n++) { let px = rnd() * S, py = rnd() * S; x.beginPath(); x.moveTo(px, py); for (let k = 0; k < 6; k++) { px += 10 + rnd() * 30; py += (rnd() - .5) * 6; x.lineTo(px, py); } x.stroke(); } // splits along the grain
    for (let n = 0; n < 3000; n++) { x.fillStyle = rnd() < .5 ? 'rgba(255,255,255,.07)' : 'rgba(0,0,0,.1)'; x.fillRect(rnd() * S, rnd() * S, 1 + rnd() * 2, 1); }
    woodTex = new THREE.CanvasTexture(c); woodTex.wrapS = woodTex.wrapT = THREE.RepeatWrapping; woodTex.anisotropy = 8;
  }
  return { gravelTex, woodTex };
}

// A swept profile: polygon `outline` ([across, up] points, closed) swept along `samples` (each { p, t }), non-indexed (flat faces), coloured by colour(u, v, s).
function sweep(samples, outline, offset, colour, base = 0) {
  const pos = [], col = [], n = outline.length, ring = (sm, k) => { const nx = -sm.t.z, nz = sm.t.x; return [sm.p.x + nx * (offset + outline[k][0]), sm.p.y + base + outline[k][1], sm.p.z + nz * (offset + outline[k][0])]; };
  for (let i = 0; i + 1 < samples.length; i++) {
    const a = samples[i], b = samples[i + 1];
    for (let k = 0; k < n; k++) {
      const k2 = (k + 1) % n, p0 = ring(a, k), p1 = ring(a, k2), p2 = ring(b, k2), p3 = ring(b, k);
      pos.push(...p0, ...p1, ...p2, ...p0, ...p2, ...p3);
      const c = colour(outline[k][0], outline[k][1], a.s, outline[k2][1]);
      for (let v = 0; v < 6; v++) col.push(...c);
    }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.computeVertexNormals();
  return g;
}

// Weathered masonry for the portal's rim: big blocks of grey-brown stone, mortar joints, stains and chips (one texel row = a course; a block about 0.6 m wide at the geometry's metre uvs).
let stoneTex = null;
function masonry() {
  if (stoneTex || typeof document === 'undefined') return stoneTex;
  let sd = 77; const rnd = () => (sd = (sd * 9301 + 49297) % 233280) / 233280;
  const S = 256, c = document.createElement('canvas'); c.width = c.height = S; const x = c.getContext('2d');
  x.fillStyle = 'rgb(58,52,46)'; x.fillRect(0, 0, S, S); // mortar
  const rows = 4, per = 2, bh = S / rows, bw = S / per;
  for (let r = 0; r < rows; r++) for (let k = -1; k <= per; k++) {
    const bx = k * bw + (r % 2 ? bw / 2 : 0), v = 118 + rnd() * 52, warm = rnd(); x.fillStyle = `rgb(${v * (1.05 + warm * .08)},${v * (.97 + warm * .05)},${v * (.84 + warm * .06)})`; x.fillRect(bx + 3, r * bh + 3, bw - 6, bh - 6);
    x.fillStyle = 'rgba(255,248,230,.1)'; x.fillRect(bx + 3, r * bh + 3, bw - 6, 4); x.fillStyle = 'rgba(0,0,0,.22)'; x.fillRect(bx + 3, r * bh + bh - 8, bw - 6, 5);
    for (let n = 0; n < 5; n++) { x.fillStyle = `rgba(30,24,18,${.06 + rnd() * .1})`; x.beginPath(); x.ellipse(bx + rnd() * bw, r * bh + rnd() * bh, 5 + rnd() * 16, 3 + rnd() * 8, rnd() * 3, 0, 6.283); x.fill(); } // weathering stains
  }
  for (let n = 0; n < 30; n++) { const px = rnd() * S, py = rnd() * S, r = 12 + rnd() * 30, g = x.createRadialGradient(px, py, 0, px, py, r); g.addColorStop(0, rnd() < .5 ? 'rgba(20,16,12,.3)' : 'rgba(86,104,56,.24)'); g.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = g; x.fillRect(px - r, py - r, r * 2, r * 2); } // soot and moss
  for (let n = 0; n < 3000; n++) { x.fillStyle = rnd() < .5 ? 'rgba(255,255,255,.06)' : 'rgba(0,0,0,.1)'; x.fillRect(rnd() * S, rnd() * S, 1 + rnd() * 2, 1 + rnd() * 2); }
  stoneTex = new THREE.CanvasTexture(c); stoneTex.wrapS = stoneTex.wrapT = THREE.RepeatWrapping; stoneTex.anisotropy = 8;
  return stoneTex;
}

// A big, irregular wall texture for the tunnel barrel (one tile covers about 2 m, with many fine blocks in it): ashlar blocks of many widths and heights in staggered courses, each its own tone, with broad
// colour patches, vertical stains, cracks and lichen laid over the top so no two stretches of the wall look alike.
let bigTex = null;
function masonryBig() {
  if (bigTex || typeof document === 'undefined') return bigTex;
  let sd = 4242; const rnd = () => (sd = (sd * 9301 + 49297) % 233280) / 233280;
  const S = 512, c = document.createElement('canvas'); c.width = c.height = S; const x = c.getContext('2d');
  const wrap = f => { for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) f(ox, oy); };
  x.fillStyle = 'rgb(52,47,41)'; x.fillRect(0, 0, S, S); // mortar
  let y = 0;
  while (y < S) { // courses of uneven height, blocks of uneven width, each course offset
    const ch = Math.min(S - y, 32 + Math.floor(rnd() * 44)); let bx = -Math.floor(rnd() * 100);
    while (bx < S) {
      const bw = 48 + Math.floor(rnd() * 130), v = 100 + rnd() * 70, warm = rnd(), tone = rnd() < .18 ? [.95, 1.0, .9] : rnd() < .5 ? [1.07, .98, .84] : [1.02, .97, .9];
      const gx = x.createLinearGradient(bx, y, bx, y + ch); gx.addColorStop(0, `rgb(${v * tone[0] * 1.08},${v * tone[1] * 1.08},${v * tone[2] * 1.08})`); gx.addColorStop(1, `rgb(${v * tone[0] * .86},${v * tone[1] * .86},${v * tone[2] * .86})`);
      x.fillStyle = gx; x.fillRect(bx + 3, y + 3, bw - 6, ch - 6);
      for (let n = 0; n < 4; n++) { x.fillStyle = `rgba(30,24,18,${.05 + rnd() * .1})`; x.beginPath(); x.ellipse(bx + rnd() * bw, y + rnd() * ch, 6 + rnd() * 24, 3 + rnd() * 10, rnd() * 3, 0, 6.283); x.fill(); } // stains on the block
      if (rnd() < .3) { x.strokeStyle = 'rgba(25,20,15,.5)'; x.lineWidth = 1; x.beginPath(); let px = bx + 6 + rnd() * (bw - 12), py = y + 4; x.moveTo(px, py); for (let k = 0; k < 4; k++) { px += (rnd() - .5) * 14; py += ch / 4; x.lineTo(px, py); } x.stroke(); } // a crack
      bx += bw;
    }
    y += ch;
  }
  for (let n = 0; n < 26; n++) { const px = rnd() * S, py = rnd() * S, r = 50 + rnd() * 130, dark = rnd() < .55; wrap((ox, oy) => { const g = x.createRadialGradient(px + ox, py + oy, 0, px + ox, py + oy, r); g.addColorStop(0, dark ? 'rgba(25,20,15,.2)' : 'rgba(255,245,225,.14)'); g.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = g; x.fillRect(px + ox - r, py + oy - r, r * 2, r * 2); }); } // broad patches
  for (let n = 0; n < 14; n++) { const px = rnd() * S, w = 6 + rnd() * 26, l = 120 + rnd() * 300, g = x.createLinearGradient(0, 0, 0, l); g.addColorStop(0, `rgba(30,24,18,${.12 + rnd() * .16})`); g.addColorStop(1, 'rgba(30,24,18,0)'); x.fillStyle = g; x.fillRect(px, rnd() * S * .6, w, l); } // vertical stains
  for (let n = 0; n < 40; n++) { const px = rnd() * S, py = rnd() * S, r = 3 + rnd() * 9; x.fillStyle = 'rgba(122,132,100,.22)'; x.beginPath(); x.ellipse(px, py, r, r * .7, rnd() * 3, 0, 6.283); x.fill(); } // lichen
  for (let n = 0; n < 7000; n++) { x.fillStyle = rnd() < .5 ? 'rgba(255,255,255,.06)' : 'rgba(0,0,0,.1)'; x.fillRect(rnd() * S, rnd() * S, 1 + rnd() * 2, 1 + rnd() * 2); }
  bigTex = new THREE.CanvasTexture(c); bigTex.wrapS = bigTex.wrapT = THREE.RepeatWrapping; bigTex.anisotropy = 8; bigTex.repeat.set(.5, .5); // (uvs are in metres: one tile about 2 m)
  return bigTex;
}

// The tunnel portal at `at`, the line running in the direction `d` (into the cliff). Local +z faces the way the line comes from, -z is into the rock.
//  - the barrel: an arch-section tube (an extrusion with the opening as its hole) in the cliff's own rock texture and colour (#4A3B2B), run well into the slope, pitched down a little toward the rear so its
//    roof sinks into the mountain, painted per vertex: dry dirt over the upper outside (more toward the rear) with only a hint of moss, and the inside darkening with depth to black;
//  - a layer of dirt and moss over the barrel's roof, lumpy, where it meets the slope;
//  - the rim: a low-poly ring of grey-brown masonry round the opening at the front, with a keystone;
//  - inside the mouth, layers of increasing black take the view into pitch dark.
function tunnelPortal(at, d, rockTex) {
  const g = new THREE.Group(); g.position.copy(at); g.rotation.y = Math.atan2(-d.x, -d.z);
  const IN = 2.6, SPRING = 3.0, OUT = 3.75, DEPTH = 6.4, FRONT = .35, PITCH = -.045;
  const noise3 = (a, b, c) => { const xi = Math.floor(a), yi = Math.floor(b), zi = Math.floor(c), fx = a - xi, fy = b - yi, fz = c - zi, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy), w = fz * fz * (3 - 2 * fz), h = (i, j, k) => hash(i, j, k), l = (p, q, t) => p + (q - p) * t; return l(l(l(h(xi, yi, zi), h(xi + 1, yi, zi), u), l(h(xi, yi + 1, zi), h(xi + 1, yi + 1, zi), u), v), l(l(h(xi, yi, zi + 1), h(xi + 1, yi, zi + 1), u), l(h(xi, yi + 1, zi + 1), h(xi + 1, yi + 1, zi + 1), u), v), w); };
  const arch = r => { const s = new THREE.Shape(); s.moveTo(-r, -.4); s.lineTo(-r, SPRING); s.absarc(0, SPRING, r, Math.PI, 0, true); s.lineTo(r, -.4); s.lineTo(-r, -.4); return s; };
  const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const hash = (a, b, c) => { let h = Math.imul(Math.floor(a * 9), 374761393) + Math.imul(Math.floor(b * 9), 668265263) + Math.imul(Math.floor(c * 9), 1274126177); h = Math.imul(h ^ (h >>> 13), 1103515245); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

  // ---- the barrel
  const outer = arch(OUT); outer.holes.push(new THREE.Path(arch(IN).getPoints(24)));
  const tube = new THREE.ExtrudeGeometry(outer, { depth: DEPTH, bevelEnabled: false, curveSegments: 20 }); tube.translate(0, 0, -DEPTH); // front face at z = 0 (it is moved to FRONT below)
  { // vertex colours
    const p = tube.attributes.position, col = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i), t = Math.min(1, Math.max(0, -z / DEPTH)), rr = y > SPRING ? Math.hypot(x, y - SPRING) : Math.abs(x), inner = rr < IN + .12, n = hash(x * .6, y * .6, z * .6);
      let c;
      if (inner) { const dark = Math.pow(1 - sm(0, .8, t), 1.6); c = [dark * (.85 + n * .25), dark * (.82 + n * .25), dark * (.78 + n * .25)]; }
      else { const lo = noise3(x * .28, y * .28, z * .28), mid = noise3(x * .9 + 7, y * .9, z * .9 + 3), k = .8 + lo * .38 + (mid - .5) * .18; c = [k * (.96 + n * .08), k * (.92 + n * .08 - lo * .05), k * (.86 + n * .08 - lo * .08)];
        const top = sm(SPRING * .05, SPRING + OUT * .25, y), patch = sm(.22, .44, noise3(x * .5 + 31, y * .5, z * .5 + 17)), fine = .8 + .2 * noise3(x * 3 + 5, y * 3, z * 3), right = sm(-1.8, 3.2, x), moss = Math.min(1, top * (.3 + .7 * patch) * fine * (.8 + .2 * t) * (.12 + .88 * right) * 1.0) * .82; // (local +x is the viewer's right: the moss gathers on the right side of the roof) // moss: only on the upper outside, in patches, more toward the rear
        c = [c[0] + (.5 * k - c[0]) * moss, c[1] + (.78 * k - c[1]) * moss, c[2] + (.24 * k - c[2]) * moss]; } // (big, slow patches of lighter and darker stone, so the texture's tile does not read)
      col[i * 3] = c[0]; col[i * 3 + 1] = c[1]; col[i * 3 + 2] = c[2];
    }
    tube.setAttribute('color', new THREE.BufferAttribute(col, 3));
  }
  const st = masonry(), big = masonryBig(), stoneMat = new THREE.MeshStandardMaterial({ map: big, bumpMap: big, bumpScale: 1.4, vertexColors: true, color: new THREE.Color(1.0, .95, .9), roughness: .95, envMapIntensity: .15, shadowSide: THREE.FrontSide });
    const barrel = new THREE.Group(); barrel.position.set(0, 0, FRONT); barrel.rotation.x = PITCH; g.add(barrel); // (the rear dips into the mountain)
  const tm = new THREE.Mesh(tube, stoneMat); tm.castShadow = tm.receiveShadow = true; barrel.add(tm);

  // ---- the rim: a low-poly masonry ring round the opening, standing out of the barrel's front
  const rimMat = new THREE.MeshStandardMaterial({ map: st, bumpMap: st, bumpScale: 1.1, color: new THREE.Color(1.0, .95, .9), roughness: .95, envMapIntensity: .15 });
  const ring = arch(IN + .85); ring.holes.push(new THREE.Path(arch(IN).getPoints(14)));
  const rim = new THREE.ExtrudeGeometry(ring, { depth: .5, bevelEnabled: true, bevelThickness: .05, bevelSize: .05, bevelSegments: 1, curveSegments: 10 });
  const rm = new THREE.Mesh(rim, rimMat); rm.position.z = FRONT; rm.castShadow = rm.receiveShadow = true; g.add(rm);
  const kt = st ? st.clone() : null; if (kt) { kt.repeat.set(.5, .5); kt.needsUpdate = true; }
  const key = new THREE.Mesh(new THREE.BoxGeometry(.8, 1.0, .6), new THREE.MeshStandardMaterial({ map: kt, color: new THREE.Color(1.1, 1.05, .98), roughness: .95, envMapIntensity: .15 })); key.position.set(0, SPRING + IN + .4, FRONT + .35); key.castShadow = true; g.add(key); // a keystone

  // ---- inside the mouth: layers of increasing black
  const shapeGeo = new THREE.ShapeGeometry(arch(IN - .02), 18);
  [[-1.5, .12], [-2.6, .28], [-3.7, .5], [-4.8, .75], [-5.9, 1]].forEach(([z, a], i) => {
    const q = new THREE.Mesh(shapeGeo, new THREE.MeshBasicMaterial({ color: 0x050403, transparent: a < 1, opacity: a, depthWrite: a >= 1, fog: false })); q.position.z = z; q.renderOrder = 3 + i; g.add(q);
  });
  g.userData.portal = { front: new THREE.Vector3(at.x - d.x * FRONT, at.y, at.z - d.z * FRONT), d, radius: IN - .03, spring: SPRING, y0: at.y, length: 12 }; // (the bore is cut only a little way in: the train is hidden 4 m inside, and a long cut came out again through the next bulge of the cliff, leaving a hole in the rock)
  return g;
}

export function buildRailway(scene, paths, { heightAt, cliffAt = () => 0 }) {
  const { gravelTex: gTex, woodTex: wTex } = textures();
  const group = new THREE.Group(); group.name = 'railway';
  // The north end: the line runs on into the cliff. The portal stands where the rock's foot begins (found by marching north from the line's end until the cliff stands this high), so
  // its arch meets the rock and is not left standing apart from it.
  const mainP = paths[0], tunnel = mainP && mainP.length > 1 ? (() => {
    const d = mainP[0].clone().sub(mainP[1]).setY(0).normalize(); let s = 0; while (s < 14 && cliffAt(mainP[0].x + d.x * s, mainP[0].z + d.z * s) < FOOT_RISE) s += .1;
    return { d, s };
  })() : null;
  const laid = paths.map((p, i) => i === 0 && tunnel ? [p[0].clone().addScaledVector(tunnel.d, tunnel.s + 4), ...p] : p); // (the rails and bed run in through the portal, a few metres into the rock)
  const dense = laid.filter(p => p.length > 1).map(p => resample(p, .6).map(s => ({ ...s, p: s.p.clone().setY(heightAt(s.p.x, s.p.z)) })));
  if (tunnel && dense[0]) dense[0].flare = true; // (the main line: its bed flares out into the portal)
  const up = new THREE.Vector3(0, 1, 0), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), pos = new THREE.Vector3(), sc = new THREE.Vector3(), col = new THREE.Color();

  // ---- the gravel bed: a ribbon (flat top, sloping sides), roughened and painted per vertex
  const across = [-BED_FOOT, -BED_TOP, -BED_TOP * .5, 0, BED_TOP * .5, BED_TOP, BED_FOOT];
  const bedGeos = dense.map(path => {
    const pos = [], col = [], uv = [], rows = path.length;
    const vtx = (i, k) => { // (the main line's bed widens toward the portal, and smooths out, so it fills the floor under the arch with no gap at the sides)
      const s = path[i], ft = path.flare ? 1 + .95 * (1 - smoothS(PORTAL_S, PORTAL_S + 4, s.s)) : 1, calm = path.flare ? smoothS(PORTAL_S, PORTAL_S + 4, s.s) : 1;
      const u = across[k] * ft, top = BED_TOP * ft, foot = BED_FOOT * ft, nx = -s.t.z, nz = s.t.x, edge = Math.abs(u) > top ? 1 : 0, n = hash(i * 1.7 + k, i * .3 + k * 5);
      const y = Math.abs(u) > top ? BED_H * (1 - (Math.abs(u) - top) / (foot - top)) - .02 : BED_H + (Math.abs(u) < .6 ? .02 : 0) + (n - .5) * .045 * calm;
      return { x: s.p.x + nx * u + (edge ? (hash(i, k) - .5) * .25 * calm : 0), y: s.p.y + y, z: s.p.z + nz * u + (edge ? (hash(k, i) - .5) * .25 * calm : 0), n, u, edge, s: s.s }; };
    for (let i = 0; i + 1 < rows; i++) for (let k = 0; k + 1 < across.length; k++) {
      const v = [vtx(i, k), vtx(i, k + 1), vtx(i + 1, k + 1), vtx(i + 1, k)];
      for (const [a, b, c2] of [[0, 1, 2], [0, 2, 3]]) for (const j of [a, b, c2]) {
        const w = v[j], tone = .72 + w.n * .34 - (w.edge ? .12 : 0); // (a little darker and earthier at the foot)
        pos.push(w.x, w.y, w.z); col.push(tone * (.96 + w.n * .08), tone * (.93 + w.n * .08), tone * (.86 + w.n * .08)); uv.push(w.u / 2.2, w.s / 2.2);
      }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.computeVertexNormals();
    return g;
  });
  if (bedGeos.length) {
    const bed = new THREE.Mesh(BufferGeometryUtils.mergeBufferGeometries(bedGeos), new THREE.MeshStandardMaterial({ vertexColors: true, map: gTex, bumpMap: gTex, bumpScale: 1.4, roughness: 1, envMapIntensity: .15, color: gTex ? new THREE.Color(1.2, 1.2, 1.2) : 0xffffff }));
    bed.name = 'railBed'; bed.receiveShadow = true; bed.castShadow = false; group.add(bed);
  }

  // ---- sleepers, tie plates (one pair per sleeper) and weeds, instanced
  const sleepers = [], rails = [];
  dense.forEach(path => {
    const tot = path[path.length - 1].s;
    for (let d = SLEEPER_GAP * .5; d < tot; d += SLEEPER_GAP) {
      const i = Math.min(path.length - 2, Math.floor(d / .6)), a = path[i], b = path[i + 1], k = (d - a.s) / Math.max(.001, b.s - a.s);
      const p = a.p.clone().lerp(b.p, Math.min(1, Math.max(0, k))), t = a.t.clone().lerp(b.t, k).normalize(), j = hash(d, p.x);
      sleepers.push({ p, yaw: Math.atan2(-t.z, t.x) + (j - .5) * .05, along: (hash(d, 3) - .5) * .06, lift: (hash(d, 9) - .5) * .02, tilt: (hash(d, 5) - .5) * .03, tone: .65 + hash(d, 7) * .55, split: hash(d, 11) });
    }
    rails.push(path);
  });
  if (sleepers.length) {
    const wood = new THREE.MeshStandardMaterial({ map: wTex, bumpMap: wTex, bumpScale: .8, roughness: .95, envMapIntensity: .15, color: new THREE.Color(.62, .5, .4) });
    const sl = new THREE.InstancedMesh(new THREE.BoxGeometry(SLEEPER.w, SLEEPER.h, SLEEPER.len), wood, sleepers.length); sl.name = 'railSleepers';
    const plate = new THREE.InstancedMesh(new THREE.BoxGeometry(.18, .016, .26), new THREE.MeshStandardMaterial({ color: 0x3a2a20, roughness: .6, metalness: .7, envMapIntensity: .3 }), sleepers.length * 2); plate.name = 'railPlates';
    const eu = new THREE.Euler();
    sleepers.forEach((s, i) => { // (a box's z is its long side: turned so that it lies across the track, its x along it)
      pos.set(s.p.x, s.p.y + BED_H + SLEEPER.h / 2 - .02 + s.lift, s.p.z);
      m4.compose(pos, q.setFromEuler(eu.set(s.tilt, s.yaw, 0, 'YXZ')), sc.set(1, 1, 1));
      sl.setMatrixAt(i, m4); sl.setColorAt(i, col.setScalar(s.tone));
      const nx = Math.sin(s.yaw), nz = Math.cos(s.yaw); // across the track
      for (const side of [-1, 1]) {
        pos.set(s.p.x + nx * side * GAUGE / 2, s.p.y + BED_H + SLEEPER.h - .01, s.p.z + nz * side * GAUGE / 2);
        m4.compose(pos, q.setFromEuler(eu.set(0, s.yaw, 0, 'YXZ')), sc.set(1, 1, 1));
        plate.setMatrixAt(i * 2 + (side > 0 ? 1 : 0), m4);
      }
    });
    for (const im of [sl, plate]) { im.castShadow = true; im.receiveShadow = true; im.frustumCulled = false; group.add(im); }
  }

  // ---- the rails: an I-section swept along each line, one each side; rust on the web and foot, a worn bright head
  const profile = [[-.065, 0], [.065, 0], [.065, .022], [.014, .03], [.014, .11], [.04, .125], [.04, .165], [-.04, .165], [-.04, .125], [-.014, .11], [-.014, .03], [-.065, .022]].map(([u, v]) => [u * .9, v]); // (10% narrower than the first version)
  const railGeos = [];
  dense.forEach(path => {
    const coarse = path.filter((_, i) => i % 2 === 0 || i === path.length - 1);
    for (const side of [-1, 1]) railGeos.push(sweep(coarse.map(s => ({ ...s, p: s.p.clone().setY(s.p.y + BED_H + SLEEPER.h - .02) })), profile, side * GAUGE / 2,
      (u, v, s, v2) => { const n = hash(s * .9, side * 3 + u * 40), streak = .75 + n * .5; return v > .12 ? (v2 > .16 ? [.52 * streak, .5 * streak, .47 * streak] : [.34 * streak, .27 * streak, .22 * streak]) : v > .025 ? [.42 * streak, .22 * streak, .12 * streak] : [.27 * streak, .17 * streak, .11 * streak]; }));
  });
  if (railGeos.length) { const rm = new THREE.Mesh(BufferGeometryUtils.mergeBufferGeometries(railGeos), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .5, metalness: .75, envMapIntensity: .45, flatShading: true })); rm.name = 'rails'; rm.castShadow = true; rm.receiveShadow = true; group.add(rm); }

  // ---- fishplates every 12 m of rail, both rails
  const plates = [];
  dense.forEach(path => { const tot = path[path.length - 1].s; for (let d = 6; d < tot - 2; d += 12) { const i = Math.min(path.length - 1, Math.round(d / .6)); plates.push(path[i]); } });
  if (plates.length) {
    const fp = new THREE.InstancedMesh(new THREE.BoxGeometry(.04, .09, .55), new THREE.MeshStandardMaterial({ color: 0x4a3a30, roughness: .55, metalness: .7, envMapIntensity: .3 }), plates.length * 2); fp.name = 'railPlates2';
    plates.forEach((s, i) => [-1, 1].forEach((side, j) => {
      const nx = -s.t.z, nz = s.t.x; pos.set(s.p.x + nx * side * GAUGE / 2, s.p.y + BED_H + SLEEPER.h + .075, s.p.z + nz * side * GAUGE / 2);
      m4.compose(pos, new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.atan2(s.t.x, s.t.z), 0, 'YXZ')), sc.set(1, 1, 1)); fp.setMatrixAt(i * 2 + j, m4);
    }));
    fp.castShadow = true; fp.frustumCulled = false; group.add(fp);
  }

  // ---- weeds along the edges of the bed and a few between the sleepers
  const blade = (() => { const pos = [], nor = [], col = []; for (let b = 0; b < 6; b++) { const a = b / 6 * 6.283, h = .16 + hash(b, 2) * .2, w = .02, lean = .08; const bx = Math.cos(a) * .03, bz = Math.sin(a) * .03, sx = -Math.sin(a) * w, sz = Math.cos(a) * w; pos.push(bx - sx, 0, bz - sz, bx + sx, 0, bz + sz, bx + Math.cos(a) * lean, h, bz + Math.sin(a) * lean); for (let v = 0; v < 3; v++) nor.push(0, 1, 0); col.push(.28, .32, .12, .28, .32, .12, .6, .62, .28); } const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); return g; })();
  const weeds = [];
  dense.forEach(path => path.forEach((s, i) => { if (i % 2) return; for (let n = 0; n < 2; n++) { const r = hash(i, n), u = (r < .75 ? (hash(i, n + 9) < .5 ? -1 : 1) * (BED_TOP * .7 + hash(i, n + 5) * (BED_FOOT - BED_TOP * .7)) : (hash(i, n + 13) - .5) * 2.2); if (r > .8) continue; weeds.push({ x: s.p.x - s.t.z * u, z: s.p.z + s.t.x * u, y: s.p.y + (Math.abs(u) > BED_TOP ? .05 : BED_H), s: .7 + hash(i, n + 3) * .9, yaw: hash(i, n + 1) * 6.283 }); } }));
  if (weeds.length) {
    const wm = new THREE.InstancedMesh(blade, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, side: THREE.DoubleSide, envMapIntensity: .1 }), weeds.length); wm.name = 'railWeeds';
    weeds.forEach((w, i) => { pos.set(w.x, w.y, w.z); m4.compose(pos, q.setFromAxisAngle(up, w.yaw), sc.set(w.s, w.s, w.s)); wm.setMatrixAt(i, m4); wm.setColorAt(i, col.setScalar(.85 + hash(i, 4) * .3)); });
    wm.frustumCulled = false; group.add(wm);
  }

  // ---- the buffer stop at the end of the spur (the last path): two posts, a heavy beam across them, braces and a stack of sleepers behind
  const spur = dense[1];
  if (spur) {
    const e = spur[spur.length - 1], t = e.t, nx = -t.z, nz = t.x, y0 = e.p.y + BED_H, timber = new THREE.MeshStandardMaterial({ map: wTex, color: new THREE.Color(.5, .38, .3), roughness: .95, envMapIntensity: .15 }), red = new THREE.MeshStandardMaterial({ color: 0x7a2a20, roughness: .8, envMapIntensity: .15 });
    const stop = new THREE.Group(); stop.position.set(e.p.x + t.x * .5, y0, e.p.z + t.z * .5); stop.rotation.y = Math.atan2(t.x, t.z);
    const part = (w, h, d, x, y, z, mat, rz = 0) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); m.rotation.z = rz; m.castShadow = m.receiveShadow = true; stop.add(m); return m; };
    for (const s of [-1, 1]) { part(.28, 1.0, .28, s * .78, .5, 0, timber); part(.12, .8, .12, s * .78, .28, -.45, timber).rotation.x = .75; } // posts and their rear braces
    part(2.0, .28, .3, 0, .9, 0, timber); part(2.0, .14, .32, 0, .9, .02, red);                                   // the beam, a red band on it
    for (let i = 0; i < 4; i++) part(1.9, .14, .22, 0, .08 + i * .14, .5 + (i % 2) * .05, timber);                  // sleepers stacked behind
    group.add(stop);
  }

  // ---- the tunnel portal at the north end of the main line: the line disappears into the dark
  if (tunnel) { const p = mainP[0].clone().addScaledVector(tunnel.d, tunnel.s - .1); const portal = tunnelPortal(p.setY(heightAt(p.x, p.z)), tunnel.d, cliffTextures()); group.add(portal); group.userData.portal = portal.userData.portal; }
  // where a train can stand: the main line's point and direction at distance s (m) from its far end inside the rock, and how high the rail heads are above the ground
  if (dense[0]) {
    const main = dense[0], total = main[main.length - 1].s;
    group.userData.railTop = BED_H + SLEEPER.h - .02 + .165;
    group.userData.portalS = PORTAL_S; group.userData.trackLength = total;
    group.userData.trackAt = (s, out = { p: new THREE.Vector3(), t: new THREE.Vector3() }) => { // (past either end of the line it carries on straight, so a train can come in from, or run out to, beyond it; `out`: an object to fill in, so a per-frame caller makes no garbage)
      if (s > total) { const e = main[main.length - 1]; out.p.copy(e.p).addScaledVector(e.t, s - total); out.t.copy(e.t); return out; }
      if (s < 0) { const e = main[0]; out.p.copy(e.p).addScaledVector(e.t, s); out.t.copy(e.t); return out; }
      const k = Math.min(main.length - 1.0001, s / .6), i = Math.floor(k), f = k - i, a = main[i], b = main[i + 1]; out.p.copy(a.p).lerp(b.p, f); out.t.copy(a.t).lerp(b.t, f).normalize(); return out;
    };
  }
  scene.add(group);
  return group;
}
