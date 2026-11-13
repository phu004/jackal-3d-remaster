// Stage 5's boss (the airbase at the top of the map): four garages, two either side of the energy gate, keep rolling vehicles out onto the ground in front of the wall.
//
//   - A garage opens its heavy door now and then (a random one, never in turn) and sends out an enemy jeep, a light tank, a heavy (medium) tank, stage 1's boss tank or, more rarely, a flame tank. At
//     most MAX_OUT of them are on the map at once. The door sinks into the floor to let it out and is shut again a few seconds later.
//   - A garage can be hurt only while its door is open: three grenades (or rockets) blow it up. The door shows the damage (scorched, buckled, then blown off).
//   - One power generator stands behind the gate, with cables to the garages and the gate. It is destroyed when the last garage is, which switches off every energy field: the gate's
//     (it can be shot down from then on, which ends the stage) and, later, any other the map has.
//
// The models are placeholders built here from boxes; their named parts ('door', 'lamp') are what the animation uses.
// setup(world, stage.airbase, onClear): cfg { doorZ, depth, bayW, bays: [x], blocks: [{ x0, x1 }], gate: { x, z, w }, generator: { x, z } } (metres).
import * as THREE from 'three';
import { sfx } from './sfx.js';
import { shardGeometry } from './debris.js';
import { mergeStatic } from './optimize.js';
import { TANK_FOOTPRINT, LIGHT_FOOTPRINT } from './tanks.js';
import { laserCurtain } from './lasers.js';
import { params } from './nav.js';
import { chainLink } from './fences.js';

const MAX_OUT = 4;            // vehicles from the garages on the map at once
const GARAGE_HP = 20;         // five grenades (a grenade does 4); the fourth leaves it burning
const OPEN_T = 1.5, HOLD_T = 5.5, CLOSE_T = 1.3; // s: the door going down, standing open, coming up
const VULNERABLE = .6;        // how far down the door is (0..1) before the garage can be hurt
const START_RANGE = 44;       // m: the fight starts once the jeep is this close to the wall
const GAP = [2.5, 5];         // s between one door starting to open and the next
const KINDS = [['jeep', .24], ['light', .26], ['medium', .26], ['boss', .14], ['flame', .1]]; // (the flame tank is the rarest; 'boss': stage 1's boss tank, twice the armour)
const HALF_LEN_JEEP = 1.7; // (about half an enemy jeep's length)
const DOOR_H = 4.5, ROOF_Y = 7.7, PILLAR = 2.5; // the doors are 4.5 m; the roof is 7.7 m up: a hall of one and a half storeys, with windows in the upper half
const rand = ([a, b]) => a + Math.random() * (b - a);
// The wall's look is drawn from a seeded generator, so it is the same on every load (seed 8, picked by eye): ?wallseed=N picks another (the number is logged to the console).
const WALL_SEED = Math.round(+params.get('wallseed')) || 8;
const DBG = params.get('dbg') ?? ''; // ?dbg=decals (no decals laid on the roofs and ground), roofplain (a plain roof material), noshadow (the building takes no shadows): trials for a seam seen on a roof

const seeded = seed => { let t = seed * 2654435761 >>> 0; return () => { t += 0x6D2B79F5; let r = Math.imul(t ^ t >>> 15, 1 | t); r ^= r + Math.imul(r ^ r >>> 7, 61 | r); return ((r ^ r >>> 14) >>> 0) / 4294967296; }; };
const rnd = seeded(WALL_SEED), rnd2 = seeded(WALL_SEED + 1000); // (rnd2: the moss and soil at the foot, drawn last, so adding it left the rest of the wall as it was)
console.log('airbase wall seed', WALL_SEED, '(add ?wallseed=N to the address to try another)');
const TRACK_SEED = Math.round(+params.get('trackseed')) || 8, trackRnd = seeded(TRACK_SEED + 5000); // the vehicle tracks outside and inside the garage doors are drawn from this seed: ?trackseed=N picks another look
console.log('airbase track seed', TRACK_SEED, '(add ?trackseed=N to the address to try another)');

let doorTex = null, sootTex = null, hazardTex = null;
function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; }
function doorTexture() { // heavy blast-door plate: dark green steel slats, rivets, a hazard band along the foot
  if (doorTex) return doorTex;
  const [c, x] = canvas(256, 256); x.fillStyle = '#2e4535'; x.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 7; i++) { const y = 8 + i * 34; x.fillStyle = 'rgba(0,0,0,.55)'; x.fillRect(0, y, 256, 5); x.fillStyle = 'rgba(180,220,190,.18)'; x.fillRect(0, y + 5, 256, 2); for (let k = 0; k < 16; k++) { x.fillStyle = '#1b2a20'; x.beginPath(); x.arc(8 + k * 16, y + 20, 2.6, 0, 7); x.fill(); } }
  for (let i = 0; i < 400; i++) { x.fillStyle = Math.random() < .5 ? 'rgba(255,255,255,.04)' : 'rgba(0,0,0,.07)'; x.fillRect(Math.random() * 256, Math.random() * 256, 1 + Math.random() * 8, 1); }
  x.fillStyle = '#d8b21c'; x.fillRect(0, 232, 256, 24); x.fillStyle = '#1a1a18'; for (let i = -2; i < 12; i++) { x.beginPath(); x.moveTo(i * 24, 256); x.lineTo(i * 24 + 12, 256); x.lineTo(i * 24 + 24, 232); x.lineTo(i * 24 + 12, 232); x.fill(); }
  doorTex = new THREE.CanvasTexture(c); doorTex.anisotropy = 8; return doorTex;
}
function hazardTexture() { // yellow-black stripes for the lintels
  if (hazardTex) return hazardTex;
  const [c, x] = canvas(64, 16); x.fillStyle = '#d8b21c'; x.fillRect(0, 0, 64, 16); x.fillStyle = '#1a1a18';
  for (let i = -1; i < 5; i++) { x.beginPath(); x.moveTo(i * 16, 16); x.lineTo(i * 16 + 8, 16); x.lineTo(i * 16 + 16, 0); x.lineTo(i * 16 + 8, 0); x.fill(); }
  hazardTex = new THREE.CanvasTexture(c); hazardTex.wrapS = THREE.RepeatWrapping; return hazardTex;
}
function sootTexture() { // scorch and cracks on a door that has been hit
  if (sootTex) return sootTex;
  const [c, x] = canvas(256, 256);
  for (let i = 0; i < 60; i++) { const g = x.createRadialGradient(0, 0, 0, 0, 0, 1), px = 128 + (Math.random() - .5) * 190, py = 128 + (Math.random() - .5) * 190, r = 18 + Math.random() * 44; x.save(); x.translate(px, py); x.scale(r, r * (.6 + Math.random() * .8)); g.addColorStop(0, 'rgba(10,8,6,.5)'); g.addColorStop(1, 'rgba(10,8,6,0)'); x.fillStyle = g; x.beginPath(); x.arc(0, 0, 1, 0, 7); x.fill(); x.restore(); }
  x.strokeStyle = 'rgba(0,0,0,.85)'; x.lineWidth = 2.4;
  for (let k = 0; k < 5; k++) { let px = 128 + (Math.random() - .5) * 120, py = 128 + (Math.random() - .5) * 120; x.beginPath(); x.moveTo(px, py); for (let i = 0; i < 7; i++) { px += (Math.random() - .5) * 40; py += (Math.random() - .3) * 30; x.lineTo(px, py); } x.stroke(); }
  sootTex = new THREE.CanvasTexture(c); return sootTex;
}

let wallVars = null;
const WALL_LEVELS = [.15, .25, .4, .55, .7, .9, 1]; // wall slab textures, from untouched to ruined: 0-1 lightly marked, 2-4 weathered, 5-6 heavily damaged (see wallVariants)
export function wallVariants() { // seven 6 m x 3.6 m slabs of neutral grey (#8a8c88) concrete at 85 px a metre both ways; each is its own mix of natural weathering (no dots, no holes): rain runoff, damp and lime stains, scrapes, cracks, chips and spalls at the edges and in the face
  if (wallVars) return wallVars;
  const H = 307, R = (a = 1, o = 0) => o + rnd() * a;
  const make = (dmg, W = 512) => { // W: the texture's width in px (85 a metre)
    const LIM = H * .75, [c, x] = canvas(W, H), [cb, b] = canvas(W, H), n = (k, lo = 0) => Math.round(lo + dmg * k * (.5 + rnd())); // n: how many of a feature this slab has
    x.fillStyle = '#8a8c88'; x.fillRect(0, 0, W, H); b.fillStyle = '#808080'; b.fillRect(0, 0, W, H);
    const blob = (ctx, px, py, rx, ry, k = 9) => { ctx.beginPath(); for (let i = 0; i < k; i++) { const a = i / k * 6.283, r = .65 + rnd() * .6; i ? ctx.lineTo(px + Math.cos(a) * rx * r, py + Math.sin(a) * ry * r) : ctx.moveTo(px + Math.cos(a) * rx * r, py + Math.sin(a) * ry * r); } ctx.closePath(); }; // an irregular outline
    for (let i = 0; i < 40; i++) { const px = R(W), py = R(H), r = R(110, 40), g = x.createRadialGradient(px, py, 0, px, py, r), k = rnd() < .5 ? '60,60,58' : '210,210,208'; g.addColorStop(0, `rgba(${k},${R(.07, .02)})`); g.addColorStop(1, `rgba(${k},0)`); x.fillStyle = g; x.fillRect(px - r, py - r, r * 2, r * 2); } // cloudy mottling
    for (const f of [1 / 3, 2 / 3]) { // formwork grooves every 1.2 m, grime packed in
      const y = Math.round(H * f), gg = x.createLinearGradient(0, y - 6, 0, y + 7); gg.addColorStop(0, 'rgba(50,46,40,0)'); gg.addColorStop(.5, 'rgba(50,46,40,.22)'); gg.addColorStop(1, 'rgba(50,46,40,0)'); x.fillStyle = gg; x.fillRect(0, y - 6, W, 13);
      x.fillStyle = 'rgba(30,30,28,.22)'; x.fillRect(0, y, W, 2); x.fillStyle = 'rgba(255,255,255,.06)'; x.fillRect(0, y + 2, W, 1.5); b.fillStyle = '#6e6e6e'; b.fillRect(0, y, W, 2);
    }
    for (let i = 0; i < 70 + dmg * 40; i++) { // rain runoff: dark soft streaks, mostly from the top lip, some from the grooves and the slab edges
      const from = rnd(), y0 = from < .65 ? 0 : from < .82 ? Math.round(H / 3) : Math.round(2 * H / 3), sx = from > .93 ? (rnd() < .5 ? R(10) : W - R(10)) : R(W), len = R(H * (y0 ? .35 : .85), 40), w = R(6, 1.6), dark = rnd() < .88;
      const g = x.createLinearGradient(0, y0, 0, y0 + len); g.addColorStop(0, `rgba(${dark ? '40,40,38' : '225,225,222'},${R(.16, .04)})`); g.addColorStop(1, `rgba(${dark ? '40,40,38' : '225,225,222'},0)`); x.fillStyle = g; x.fillRect(sx - w / 2, y0, w, len);
    }
    for (let i = 0; i < 2200; i++) { x.fillStyle = `rgba(38,38,36,${R(.05, .015)})`; x.fillRect(R(W), R(H), R(1.6, .6), R(80, 15)); } // fine drips
    for (const ex of [0, W - 12]) { const g = x.createLinearGradient(ex, 0, ex + 12, 0); g.addColorStop(ex ? 1 : 0, 'rgba(45,42,38,.1)'); g.addColorStop(ex ? 0 : 1, 'rgba(45,42,38,0)'); x.fillStyle = g; x.fillRect(ex, 0, 12, H); } // dirt in the joints between slabs
    // ---- weathering, more of each the higher dmg
    for (let k = 0, m = n(3, 1); k < m; k++) { const px = R(W), py = R(H * .7), rx = R(90, 40), ry = R(70, 30), g = x.createRadialGradient(px, py, 0, px, py, rx); g.addColorStop(0, `rgba(45,45,43,${R(.14, .05)})`); g.addColorStop(1, 'rgba(45,45,43,0)'); x.save(); x.translate(px, py); x.scale(1, ry / rx); x.translate(-px, -py); x.fillStyle = g; x.fillRect(px - rx, py - rx, rx * 2, rx * 2); x.restore(); } // damp, darker patches
    for (let k = 0, m = n(3); k < m; k++) { // lime (efflorescence): pale deposits with drips below them
      const px = R(W), py = R(H * .6), w = R(50, 20), g = x.createRadialGradient(px, py, 0, px, py, w); g.addColorStop(0, 'rgba(232,232,226,.2)'); g.addColorStop(1, 'rgba(232,232,226,0)'); x.fillStyle = g; x.fillRect(px - w, py - w, w * 2, w * 2);
      for (let i = 0; i < 5; i++) { const dx = px + R(w, -w / 2), len = R(80, 20), g2 = x.createLinearGradient(0, py, 0, py + len); g2.addColorStop(0, 'rgba(232,232,226,.16)'); g2.addColorStop(1, 'rgba(232,232,226,0)'); x.fillStyle = g2; x.fillRect(dx, py, R(3.6, 1.2), len); }
    }
    for (let k = 0, m = n(2); k < m; k++) { const px = R(W), py = R(H * .5), len = R(110, 40), g = x.createLinearGradient(0, py, 0, py + len); g.addColorStop(0, 'rgba(120,76,46,.16)'); g.addColorStop(1, 'rgba(120,76,46,0)'); x.fillStyle = g; x.fillRect(px - R(3, 1), py, R(7, 2.5), len); } // rust stains from a bar inside
    for (let k = 0, m = n(3); k < m; k++) { // scrapes: groups of pale scratches where something dragged along the wall
      const px = R(W - 120, 20), py = R(LIM - 80, 20), a = R(1.2, -.6), cnt = R(5, 2) | 0;
      for (let i = 0; i < cnt; i++) { const ox = R(10, -5), oy = i * R(6, 3), len = R(110, 40); x.strokeStyle = `rgba(215,215,210,${R(.18, .06)})`; x.lineWidth = R(1.8, .7); x.beginPath(); x.moveTo(px + ox, py + oy); x.lineTo(px + ox + Math.cos(a) * len, py + oy + Math.sin(a) * len * .3 + R(6, -3)); x.stroke(); }
    }
    const crack = (px, py, len, w, branch, dir = R(1.2, 1.9)) => { // a crack wandering along `dir`, sometimes branching
      for (let i = 0; i < len; i++) {
        const nx = px + Math.cos(dir + R(.9, -.45)) * R(20, 8), ny = py + Math.sin(dir + R(.9, -.45)) * R(20, 8);
        if (ny > LIM) break; // (nothing marks the lowest quarter of the wall)
        for (const [ctx, col, lw] of [[x, `rgba(34,34,32,${.3 + dmg * .22})`, w], [b, '#707070', w + .4]]) { ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(nx, ny); ctx.stroke(); }
        x.strokeStyle = 'rgba(255,255,255,.06)'; x.lineWidth = .8; x.beginPath(); x.moveTo(px + 1.5, py); x.lineTo(nx + 1.5, ny); x.stroke();
        if (branch && rnd() < .22) crack(nx, ny, Math.max(2, len - i - 3), Math.max(.8, w - .5), false, dir + R(1.4, -.7));
        px = nx; py = ny;
      }
    };
    for (let k = 0, m = n(4, 1); k < m; k++) crack(R(W), R(H * .5), R(12, 5) | 0, R(1.4, .8), dmg > .4);
    for (let k = 0, m = n(1.4); k < m; k++) { const px = R(W - 80, 40), py = R(LIM - 100, 50); for (let i = 0, r = R(5, 3) | 0; i < r; i++) crack(px, py, R(6, 3) | 0, R(1.4, .8), false, i / r * 6.283 + R(.6)); } // an impact: cracks radiating from a point
    const chip = (px, py, rx, ry, depth) => { // concrete broken away: fresh paler concrete in the break, a shadow under its upper lip, a lit lower edge
      blob(x, px, py, rx, ry); x.fillStyle = `rgba(${150 + depth * 20},${152 + depth * 20},${148 + depth * 20},.95)`; x.fill();
      const g = x.createLinearGradient(0, py - ry, 0, py + ry); g.addColorStop(0, 'rgba(20,20,18,.22)'); g.addColorStop(.45, 'rgba(20,20,18,0)'); g.addColorStop(1, 'rgba(255,255,255,.06)'); blob(x, px, py, rx, ry); x.fillStyle = g; x.fill();
      blob(x, px, py, rx, ry); x.strokeStyle = 'rgba(40,40,38,.3)'; x.lineWidth = 1.2; x.stroke();
      blob(b, px, py, rx, ry); b.fillStyle = depth > .6 ? '#626262' : '#6c6c6c'; b.fill();
      if (depth > .7 && rnd() < .6) { x.strokeStyle = 'rgba(122,72,40,.85)'; x.lineWidth = 2.4; x.beginPath(); x.moveTo(px - rx * .7, py + R(4, -2)); x.lineTo(px + rx * .7, py + R(4, -2)); x.stroke(); } // a rusted bar bared
    };
    const bite = (side, t, r, depth) => { // a chunk gone from the edge of the slab: the top lip, the foot or a vertical joint
      const px = side === 'l' ? 0 : side === 'r' ? W : t, py = side === 't' ? 0 : side === 'b' ? H : t; chip(px, py, r * 1.3, r, depth);
    };
    for (let k = 0, m = n(4, 1); k < m; k++) chip(R(W - 120, 60), R(LIM - 90, 45), R(26, 10), R(18, 8), rnd());
    for (let k = 0, m = n(3, 1); k < m; k++) { bite('t', R(W - 140, 70), R(30, 8), rnd()); }
    for (let k = 0, m = n(1.6); k < m; k++) chip(R(W - 220, 110), R(LIM - 130, 60), R(48, 24), R(32, 16), .8 + rnd() * .2); // big spalls
    for (let k = 0, m = n(2); k < m; k++) { const px = R(W - 90, 40), py = R(LIM - 90, 40), rx = R(60, 25), ry = R(40, 20); blob(x, px, py, rx, ry, 11); x.fillStyle = 'rgba(165,166,162,.22)'; x.fill(); for (let i = 0; i < 40; i++) { b.fillStyle = `rgba(${rnd() < .5 ? 70 : 190},${rnd() < .5 ? 70 : 190},128,.25)`; b.fillRect(px + R(rx * 2, -rx), py + R(ry * 2, -ry), R(5, 1.5), R(4, 1.2)); } } // weathered-away skin: paler and rough
    { // moss and soil on the foot of the wall: a dirt band and small firm tufts, only on the lowest few centimetres
      const r = rnd2, tuft = (px, py, rr, a) => { const cl = r() < .5 ? ['56,72,32', '86,106,50'] : ['70,88,40', '106,126,60'], pts = Array.from({ length: 8 }, (_, k) => { const t = k / 8 * 6.283, q = .6 + r() * .6; return [px + Math.cos(t) * rr * q, py + Math.sin(t) * rr * q * .75]; }); x.fillStyle = `rgba(${cl[0]},${a})`; x.beginPath(); pts.forEach(([u, v], k) => (k ? x.lineTo(u, v) : x.moveTo(u, v))); x.closePath(); x.fill(); x.fillStyle = `rgba(${cl[1]},${a * .7})`; x.beginPath(); x.arc(px - rr * .15, py - rr * .25, rr * .45, 0, 7); x.fill(); };
      const dirt = x.createLinearGradient(0, H * .9, 0, H); dirt.addColorStop(0, 'rgba(78,62,46,0)'); dirt.addColorStop(1, 'rgba(78,62,46,.34)'); x.fillStyle = dirt; x.fillRect(0, H * .9, W, H * .1);
      for (let i = 0; i < W / 9; i++) tuft(r() * W, H - r() * r() * H * .07 - 1, 2 + r() * 5, .5 + r() * .4);
      for (let i = 0; i < W / 70; i++) { const px = r() * W, len = 6 + r() * 22, g = x.createLinearGradient(0, H, 0, H - len); g.addColorStop(0, 'rgba(70,90,42,.45)'); g.addColorStop(1, 'rgba(70,90,42,0)'); x.fillStyle = g; x.fillRect(px, H - len, 1.5 + r() * 2, len); } // a little creeping up
    }
    const ao = x.createLinearGradient(0, H * .8, 0, H); ao.addColorStop(0, 'rgba(25,25,24,0)'); ao.addColorStop(.5, 'rgba(25,25,24,.12)'); ao.addColorStop(1, 'rgba(25,25,24,.45)'); x.fillStyle = ao; x.fillRect(0, H * .8, W, H * .2); // occlusion at the foot
    const tp = x.createLinearGradient(0, 0, 0, H * .14); tp.addColorStop(0, 'rgba(20,20,19,.4)'); tp.addColorStop(1, 'rgba(20,20,19,0)'); x.fillStyle = tp; x.fillRect(0, 0, W, H * .14); // the parapet lip's shadow
    const grain = (ctx, amp) => { const d = ctx.getImageData(0, 0, W, H), q = d.data; for (let i = 0; i < q.length; i += 4) { const g = (rnd() - .5) * amp; q[i] += g; q[i + 1] += g; q[i + 2] += g; } ctx.putImageData(d, 0, 0); };
    grain(x, 7); grain(b, 14); // fine grain on every pixel
    const map = new THREE.CanvasTexture(c), bump = new THREE.CanvasTexture(cb); for (const t of [map, bump]) t.anisotropy = 8;
    return { map, bump };
  };
  wallVars = WALL_LEVELS.map(d => make(d)); wallVars.end = make(.35, 290); return wallVars; // (.end: the cut end of the wall, 3.4 m deep)
}

let dashTex = null, arrowTex = null;
function wearPaint(ctx, w, h, n) { ctx.globalCompositeOperation = 'destination-out'; for (let i = 0; i < n; i++) { ctx.fillStyle = `rgba(0,0,0,${.3 + Math.random() * .6})`; ctx.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 4, 1 + Math.random() * 3); } ctx.globalCompositeOperation = 'source-over'; } // paint worn away by wheels
function dashTexture() { // a dashed white line: one dash and one gap, 2.1 m long
  if (dashTex) return dashTex;
  const [c, x] = canvas(256, 32); x.fillStyle = '#d9d9d2'; x.fillRect(0, 0, 140, 32); wearPaint(x, 140, 32, 260);
  dashTex = new THREE.CanvasTexture(c); dashTex.wrapS = THREE.RepeatWrapping; dashTex.anisotropy = 8; return dashTex;
}
function arrowTexture() { // a white road arrow, tip up (north)
  if (arrowTex) return arrowTex;
  const [c, x] = canvas(128, 256); x.fillStyle = '#d9d9d2'; x.beginPath(); x.moveTo(64, 4); x.lineTo(124, 110); x.lineTo(86, 110); x.lineTo(86, 252); x.lineTo(42, 252); x.lineTo(42, 110); x.lineTo(4, 110); x.closePath(); x.fill(); wearPaint(x, 128, 256, 700);
  arrowTex = new THREE.CanvasTexture(c); arrowTex.anisotropy = 8; return arrowTex;
}

let checkerTex = null;
function checkerTexture() { // steel tread plate: a field of small raised lozenges at right angles, 0.5 m a tile
  if (checkerTex) return checkerTex;
  const [c, x] = canvas(128, 128); x.fillStyle = '#9a9fa3'; x.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) for (const [dx, dy, rot] of [[8, 8, .785], [24, 24, -.785]]) { const px = i * 32 + dx, py = j * 32 + dy; x.save(); x.translate(px, py); x.rotate(rot); x.fillStyle = 'rgba(255,255,255,.28)'; x.fillRect(-9, -2.6, 18, 5.2); x.fillStyle = 'rgba(0,0,0,.3)'; x.fillRect(-9, 2.6, 18, 2); x.restore(); }
  for (let i = 0; i < 200; i++) { x.fillStyle = `rgba(0,0,0,${.04 + Math.random() * .06})`; x.fillRect(Math.random() * 128, Math.random() * 128, 2, 2); }
  checkerTex = new THREE.CanvasTexture(c); checkerTex.wrapS = checkerTex.wrapT = THREE.RepeatWrapping; checkerTex.anisotropy = 8; return checkerTex;
}

let roofDeck = null;
function roofDeckTexture() { // a flat roof's membrane, drawn at a scale the eye can see from the game camera: 2 m strips with bold seams and lapped edges, repair patches of other tones, tar-sealed cracks, ponding stains with a pale rim, pebbles; 4 m x 4 m, tiles both ways
  if (roofDeck) return roofDeck;
  const [c, x] = canvas(512, 512), R = (a = 1, o = 0) => o + Math.random() * a;
  x.fillStyle = '#585c5e'; x.fillRect(0, 0, 512, 512);
  const wrapBlob = (px, py, r, col, a) => { for (const dx of [-512, 0, 512]) for (const dy of [-512, 0, 512]) { const g = x.createRadialGradient(px + dx, py + dy, 0, px + dx, py + dy, r); g.addColorStop(0, `rgba(${col},${a})`); g.addColorStop(1, `rgba(${col},0)`); x.fillStyle = g; x.fillRect(px + dx - r, py + dy - r, r * 2, r * 2); } };
  for (let i = 0; i < 22; i++) wrapBlob(R(512), R(512), R(120, 50), ['40,46,52', '92,96,88', '70,62,52', '120,124,126'][i % 4], R(.18, .07)); // big tonal patches: cool, warm, pale, dark
  for (let i = 0; i < 2; i++) { const y = i * 256; x.fillStyle = 'rgba(14,16,16,.6)'; x.fillRect(0, y, 512, 12); x.fillStyle = 'rgba(176,178,176,.24)'; x.fillRect(0, y + 12, 512, 22); x.fillStyle = 'rgba(0,0,0,.12)'; x.fillRect(0, y + 34, 512, 12); } // 2 m strips: a bold groove, a pale lapped edge, a soft shadow under it
  for (let k = 0; k < 6; k++) { const px = R(380, 20), py = R(380, 20), w = R(130, 60), h = R(110, 50), t = Math.random() < .5 ? 'rgba(130,134,136,.28)' : 'rgba(30,34,38,.28)'; x.fillStyle = t; x.fillRect(px, py, w, h); x.strokeStyle = 'rgba(14,16,16,.55)'; x.lineWidth = 5; x.strokeRect(px, py, w, h); x.strokeStyle = 'rgba(200,202,200,.2)'; x.lineWidth = 2; x.strokeRect(px + 4, py + 4, w - 8, h - 8); } // repair patches
  for (let k = 0; k < 6; k++) { let px = R(512), py = R(512); x.strokeStyle = `rgba(10,10,10,${R(.7, .45)})`; x.lineWidth = R(7, 4); x.lineJoin = 'round'; x.beginPath(); x.moveTo(px, py); for (let i = 0; i < 6; i++) { px += R(60, -30); py += R(60, -30); x.lineTo(px, py); } x.stroke(); } // tar-sealed cracks
  for (let k = 0; k < 5; k++) { const px = R(512), py = R(512), r = R(60, 26); x.save(); x.translate(px, py); x.scale(1, R(.6, .5)); x.fillStyle = 'rgba(30,34,38,.34)'; x.beginPath(); x.arc(0, 0, r, 0, 7); x.fill(); x.strokeStyle = 'rgba(205,205,196,.28)'; x.lineWidth = 4; x.stroke(); x.restore(); } // ponding: a dark stain with a pale tide-line
  for (let i = 0; i < 700; i++) { const k = 70 + Math.random() * 110 | 0, r = R(3.4, 1.6); x.fillStyle = `rgba(${k},${k},${k - 2},${R(.6, .2)})`; x.beginPath(); x.arc(R(512), R(512), r, 0, 7); x.fill(); } // pebbles
  for (let i = 0; i < 14; i++) { const px = R(512), len = R(240, 80), w = R(14, 4), g = x.createLinearGradient(0, 0, 0, len); g.addColorStop(0, 'rgba(18,18,16,.3)'); g.addColorStop(1, 'rgba(18,18,16,0)'); x.save(); x.translate(px, R(512)); x.fillStyle = g; x.fillRect(0, 0, w, len); x.restore(); } // rain streaks
  roofDeck = new THREE.CanvasTexture(c); roofDeck.wrapS = roofDeck.wrapT = THREE.RepeatWrapping; roofDeck.anisotropy = 8; return roofDeck;
}

let winTex = null;
function windowTexture() { // the muntin grid of a factory window (4 x 3 panes): white panes (the material's colour and the sky reflection show through) with dark steel bars and a faint darkening at the top of each pane
  if (winTex) return winTex;
  const [c, x] = canvas(256, 192);
  x.fillStyle = '#ffffff'; x.fillRect(0, 0, 256, 192);
  for (let r = 0; r < 3; r++) for (let q = 0; q < 4; q++) { const g = x.createLinearGradient(0, r * 64, 0, r * 64 + 64); g.addColorStop(0, 'rgba(0,0,0,.14)'); g.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = g; x.fillRect(q * 64, r * 64, 64, 64); }
  x.fillStyle = '#1d1f20'; for (let i = 0; i < 5; i++) x.fillRect(i * 64 - 3, 0, 6, 192); for (let i = 0; i < 4; i++) x.fillRect(0, i * 64 - 3, 256, 6); // the muntins
  winTex = new THREE.CanvasTexture(c); winTex.anisotropy = 8; return winTex;
}

let plateBump = null;
function plateTextures(hex, rnd3) { // sheet-metal plates for the equipment housings: the colour baked in, panel seams with bolts, an ambient-occlusion gradient (lighter at the top, dark at the foot), grit and rain streaks; 'side' also carries a high-voltage warning triangle, a data plate and a caution stripe along the foot, 'top' is plain
  const R = (a = 1, o = 0) => o + rnd3() * a, col = '#' + hex.toString(16).padStart(6, '0'), S = 256;
  const draw = side => {
    const [c, x] = canvas(S, S); x.fillStyle = col; x.fillRect(0, 0, S, S);
    for (let i = 0; i < 14; i++) { const px = R(S), py = R(S), r = R(70, 30), g = x.createRadialGradient(px, py, 0, px, py, r), k = R(2) < 1 ? '0,0,0' : '255,255,255'; g.addColorStop(0, `rgba(${k},${R(.06, .02)})`); g.addColorStop(1, `rgba(${k},0)`); x.fillStyle = g; x.fillRect(px - r, py - r, r * 2, r * 2); } // soft mottling (no fine grit: it shimmers when the camera moves)
    for (let i = 0; i < 9; i++) { const px = R(S), len = R(120, 30), g = x.createLinearGradient(0, 0, 0, len); g.addColorStop(0, `rgba(20,20,18,${R(.18, .05)})`); g.addColorStop(1, 'rgba(20,20,18,0)'); x.save(); x.translate(px, R(60)); x.fillStyle = g; x.fillRect(0, 0, R(5, 1.5), len); x.restore(); } // streaks
    if (side) { // (plate seams and bolts on the side faces only: on the tops, seen from far above, their thin highlights flicker)
    const ys = [96, 176], xs = [128]; // plate seams: two rows, a column
    for (const y of ys) { x.fillStyle = 'rgba(10,10,10,.7)'; x.fillRect(0, y, S, 5); x.fillStyle = 'rgba(255,255,255,.16)'; x.fillRect(0, y + 5, S, 3); }
    for (const xx of xs) { x.fillStyle = 'rgba(10,10,10,.7)'; x.fillRect(xx, 0, 5, S); x.fillStyle = 'rgba(255,255,255,.16)'; x.fillRect(xx + 5, 0, 3, S); }
    for (const y of [0, 96, 176]) for (const xx of [0, 128]) for (const [dx, dy] of [[14, 12], [114, 12], [14, 80], [114, 80]]) { const px = xx + dx, py = y + dy + (y === 176 ? 0 : 0); if (py > S - 6) continue; x.fillStyle = 'rgba(15,15,15,.7)'; x.beginPath(); x.arc(px, py, 5.5, 0, 7); x.fill(); x.fillStyle = 'rgba(255,255,255,.3)'; x.beginPath(); x.arc(px - 1.2, py - 1.5, 2.4, 0, 7); x.fill(); } // bolts: big enough to survive the distance
    }
    { // (on the top faces too: the camera looks down on them)
      const s0 = 22, cx = R(40, 44), cy = 48; x.fillStyle = '#d6b020'; x.beginPath(); x.moveTo(cx, cy - s0); x.lineTo(cx + s0 * .9, cy + s0 * .7); x.lineTo(cx - s0 * .9, cy + s0 * .7); x.closePath(); x.fill(); x.fillStyle = '#161614'; x.beginPath(); x.moveTo(cx, cy - s0 * .72); x.lineTo(cx + s0 * .65, cy + s0 * .55); x.lineTo(cx - s0 * .65, cy + s0 * .55); x.closePath(); x.fill();
      x.fillStyle = '#d6b020'; x.beginPath(); x.moveTo(cx + 3, cy - 9); x.lineTo(cx - 6, cy + 2); x.lineTo(cx - 1, cy + 2); x.lineTo(cx - 4, cy + 11); x.lineTo(cx + 6, cy - 2); x.lineTo(cx + 1, cy - 2); x.closePath(); x.fill(); // the triangle and its bolt
      x.fillStyle = 'rgba(205,205,198,.85)'; x.fillRect(150, 112, 70, 34); x.fillStyle = 'rgba(30,30,28,.75)'; for (let i = 0; i < 4; i++) x.fillRect(156, 118 + i * 7, 58 - (i % 2) * 14, 2); // a data plate
      x.fillStyle = '#d6b020'; x.fillRect(0, 232, S, 24); x.fillStyle = '#161614'; for (let i = -1; i < 7; i++) { x.beginPath(); x.moveTo(i * 48, 256); x.lineTo(i * 48 + 24, 256); x.lineTo(i * 48 + 48, 232); x.lineTo(i * 48 + 24, 232); x.fill(); } // caution stripes along the foot (wide ones: thin stripes alias)
      wearPaint(x, S, S, 90);
    }
    const g = x.createLinearGradient(0, 0, 0, S); g.addColorStop(0, side ? 'rgba(255,255,255,.1)' : 'rgba(255,255,255,.16)'); g.addColorStop(.55, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.4)'); x.fillStyle = g; x.fillRect(0, 0, S, S); // top light, foot dark
    const t = new THREE.CanvasTexture(c); t.anisotropy = 8; return t;
  };
  if (!plateBump) { // one height map for all of them: the seams and bolts sunk
    const [c, x] = canvas(S, S); x.fillStyle = '#909090'; x.fillRect(0, 0, S, S); x.fillStyle = '#505050'; for (const y of [96, 176]) x.fillRect(0, y, S, 6); x.fillRect(128, 0, 6, S);
    for (const y of [0, 96, 176]) for (const xx of [0, 128]) for (const [dx, dy] of [[14, 12], [114, 12], [14, 80], [114, 80]]) { if (y + dy > S - 6) continue; x.fillStyle = '#b0b0b0'; x.beginPath(); x.arc(xx + dx, y + dy, 5, 0, 7); x.fill(); }
    plateBump = new THREE.CanvasTexture(c);
  }
  const mk = side => new THREE.MeshStandardMaterial({ map: draw(side), bumpMap: side ? plateBump : null, bumpScale: .4, roughness: .4, metalness: .65, envMapIntensity: .7 }) /* (painted steel, as the stage 3 rooftop metals: smoother, metallic, reflecting the sky) */, sideM = mk(true), topM = mk(false);
  return { side: sideM, top: topM, arr: [sideM, sideM, topM, topM, sideM, sideM] }; // arr: the six faces of a box (+x -x +y -y +z -z)
}

let scorchTex = null;
function scorchTexture() { // soot on an interior surface: blackest low down and in the middle, ragged at the edge, with flame-lick streaks climbing it, a little ash and a brown heat-stain halo; transparent round the rim
  if (scorchTex) return scorchTex;
  const [c, x] = canvas(256, 256), R = (a = 1, o = 0) => o + Math.random() * a;
  const halo = x.createRadialGradient(128, 150, 20, 128, 150, 140); halo.addColorStop(0, 'rgba(70,46,26,.5)'); halo.addColorStop(1, 'rgba(70,46,26,0)'); x.fillStyle = halo; x.fillRect(0, 0, 256, 256); // heat-browned
  for (let i = 0; i < 26; i++) { const px = 128 + (Math.random() - .5) * 150, py = 120 + Math.random() * 100, r = R(60, 26), g = x.createRadialGradient(px, py, 0, px, py, r); g.addColorStop(0, `rgba(8,7,6,${R(.5, .4)})`); g.addColorStop(1, 'rgba(8,7,6,0)'); x.fillStyle = g; x.fillRect(px - r, py - r, r * 2, r * 2); } // the soot
  for (let i = 0; i < 40; i++) { const px = 128 + (Math.random() - .5) * 170, len = R(130, 40), g = x.createLinearGradient(0, 256, 0, 256 - len); g.addColorStop(0, `rgba(10,9,8,${R(.5, .2)})`); g.addColorStop(1, 'rgba(10,9,8,0)'); x.fillStyle = g; x.fillRect(px, 256 - len, R(8, 2), len); } // flame licks
  for (let i = 0; i < 10; i++) { const px = R(240, 8), py = R(200, 40), r = R(30, 10), g = x.createRadialGradient(px, py, 0, px, py, r); g.addColorStop(0, 'rgba(88,84,78,.22)'); g.addColorStop(1, 'rgba(88,84,78,0)'); x.fillStyle = g; x.fillRect(px - r, py - r, r * 2, r * 2); } // ash
  x.globalCompositeOperation = 'destination-in'; const m = x.createRadialGradient(128, 140, 60, 128, 140, 132); m.addColorStop(0, 'rgba(0,0,0,1)'); m.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = m; x.fillRect(0, 0, 256, 256); x.globalCompositeOperation = 'source-over'; // fade out toward the rim
  scorchTex = new THREE.CanvasTexture(c); scorchTex.anisotropy = 4; return scorchTex;
}

let floorDmgTex = null;
function floorDamageTexture() { // a blasted garage floor, 6 m x 9.8 m (the top of the canvas is the back of the bay, the bottom the door): a dark scorch with a soft crater, cracks running out in every direction, spalled chips, black skid marks of tracks leading out to the door, ash
  if (floorDmgTex) return floorDmgTex;
  const W = 300, H = 490, [c, x] = canvas(W, H), R = (a = 1, o = 0) => o + Math.random() * a;
  for (let i = 0; i < 26; i++) { const px = W / 2 + R(150, -75), py = H * .55 + R(240, -120), r = R(70, 30), g = x.createRadialGradient(px, py, 0, px, py, r); g.addColorStop(0, `rgba(10,9,8,${R(.5, .35)})`); g.addColorStop(1, 'rgba(10,9,8,0)'); x.fillStyle = g; x.fillRect(px - r, py - r, r * 2, r * 2); } // scorch
  const cx = W / 2 + R(40, -20), cy = H * .5 + R(60, -30); x.save(); x.translate(cx, cy); x.scale(1, 1.25); const cr = x.createRadialGradient(0, 0, 8, 0, 0, 62); cr.addColorStop(0, 'rgba(6,5,5,.95)'); cr.addColorStop(.8, 'rgba(14,12,11,.85)'); cr.addColorStop(1, 'rgba(14,12,11,0)'); x.fillStyle = cr; x.beginPath(); for (let k = 0; k < 14; k++) { const a = k / 14 * 6.283, q = 50 + R(22); k ? x.lineTo(Math.cos(a) * q, Math.sin(a) * q) : x.moveTo(Math.cos(a) * q, Math.sin(a) * q); } x.closePath(); x.fill(); x.restore(); // the crater (soft-edged: no outline)
  const crack = (px, py, n, w, dir, branch) => { for (let i = 0; i < n; i++) { const nx = px + Math.cos(dir + R(.8, -.4)) * R(26, 10), ny = py + Math.sin(dir + R(.8, -.4)) * R(26, 10); x.strokeStyle = `rgba(8,8,7,${R(.4, .55)})`; x.lineWidth = w; x.lineCap = 'round'; x.beginPath(); x.moveTo(px, py); x.lineTo(nx, ny); x.stroke(); if (branch && Math.random() < .28) crack(nx, ny, Math.max(2, n - i - 2), Math.max(1, w - 1.4), dir + R(1.6, -.8), false); px = nx; py = ny; } };
  for (let k = 0; k < 14; k++) crack(cx + R(30, -15), cy + R(30, -15), 9 + R(8) | 0, 4.5, k / 14 * 6.283 + R(.4), true); // cracks out of the crater
  for (let k = 0; k < 10; k++) crack(R(W), R(H), 5 + R(6) | 0, 2.4, R(6.283), true); // and elsewhere
  for (let i = 0; i < 10; i++) { const px = R(W - 60, 30), py = R(H - 60, 30), rx = R(22, 8), ry = R(16, 6); x.beginPath(); for (let k = 0; k < 9; k++) { const a = k / 9 * 6.283, q = .65 + Math.random() * .6; k ? x.lineTo(px + Math.cos(a) * rx * q, py + Math.sin(a) * ry * q) : x.moveTo(px + Math.cos(a) * rx * q, py + Math.sin(a) * ry * q); } x.closePath(); x.fillStyle = 'rgba(86,83,78,.9)'; x.fill(); x.strokeStyle = 'rgba(12,12,11,.7)'; x.lineWidth = 1.5; x.stroke(); } // spalled chips, the floor broken up
  for (const tx of [W * .3, W * .7]) { const g = x.createLinearGradient(0, H * .35, 0, H); g.addColorStop(0, 'rgba(6,6,5,0)'); g.addColorStop(.4, 'rgba(6,6,5,.55)'); g.addColorStop(1, 'rgba(6,6,5,.75)'); x.fillStyle = g; x.fillRect(tx - 14, H * .35, 28, H * .65); } // skid marks to the door
  for (let i = 0; i < 400; i++) { x.fillStyle = `rgba(${Math.random() < .5 ? '70,68,64' : '12,12,11'},${R(.5, .15)})`; x.fillRect(R(W), R(H), R(3, 1), R(3, 1)); } // ash
  x.globalCompositeOperation = 'destination-in'; x.save(); x.translate(W / 2, H / 2); x.scale(W / 2, H / 2); const fade = x.createRadialGradient(0, 0, 0, 0, 0, 1); fade.addColorStop(0, 'rgba(0,0,0,1)'); fade.addColorStop(.75, 'rgba(0,0,0,1)'); fade.addColorStop(1, 'rgba(0,0,0,.25)'); x.fillStyle = fade; x.fillRect(-1, -1, 2, 2); x.restore(); x.globalCompositeOperation = 'source-over';
  floorDmgTex = new THREE.CanvasTexture(c); floorDmgTex.anisotropy = 8; return floorDmgTex;
}

let ashTex = null;
function ashTexture() { // the burnt patch the substation leaves on the roof: an irregular, ragged blot of soot with blast rays running out from the middle, paler ash, a few glowing cracks; 6 m x 8.8 m, transparent round the edge
  if (ashTex) return ashTex;
  const W = 300, H = 440, [c, x] = canvas(W, H), R = (a = 1, o = 0) => o + Math.random() * a;
  for (let i = 0; i < 36; i++) { const a = R(6.283), d = Math.sqrt(Math.random()), px = W / 2 + Math.cos(a) * 105 * d, py = H / 2 + Math.sin(a) * 170 * d, r = R(70, 34), g = x.createRadialGradient(px, py, 0, px, py, r); g.addColorStop(0, `rgba(12,11,10,${R(.5, .45)})`); g.addColorStop(1, 'rgba(12,11,10,0)'); x.fillStyle = g; x.fillRect(px - r, py - r, r * 2, r * 2); } // the soot, in overlapping blots
  for (let i = 0; i < 90; i++) { const a = R(6.283), r0 = R(60, 20), r1 = r0 + R(150, 40); x.strokeStyle = `rgba(14,13,12,${R(.3, .08)})`; x.lineWidth = R(3, .8); x.beginPath(); x.moveTo(W / 2 + Math.cos(a) * r0, H / 2 + Math.sin(a) * r0 * 1.6); x.lineTo(W / 2 + Math.cos(a + R(.1, -.05)) * r1, H / 2 + Math.sin(a + R(.1, -.05)) * r1 * 1.6); x.stroke(); } // blast rays
  for (let i = 0; i < 14; i++) { const px = R(W - 80, 40), py = R(H - 120, 60), r = R(40, 16), g = x.createRadialGradient(px, py, 0, px, py, r); g.addColorStop(0, 'rgba(95,92,86,.22)'); g.addColorStop(1, 'rgba(95,92,86,0)'); x.fillStyle = g; x.fillRect(px - r, py - r, r * 2, r * 2); } // ash
  for (let k = 0; k < 9; k++) { let px = R(W - 100, 50), py = R(H - 160, 80); x.strokeStyle = `rgba(255,${80 + R(60) | 0},20,${R(.55, .25)})`; x.lineWidth = R(1.6, .8); x.beginPath(); x.moveTo(px, py); for (let i = 0; i < 5; i++) { px += R(24, -12); py += R(20, -4); x.lineTo(px, py); } x.stroke(); } // glowing cracks
  x.globalCompositeOperation = 'destination-in'; x.save(); x.translate(W / 2, H / 2); x.scale(W / 2, H / 2); const fade = x.createRadialGradient(0, 0, 0, 0, 0, 1); fade.addColorStop(0, 'rgba(0,0,0,1)'); fade.addColorStop(.6, 'rgba(0,0,0,1)'); fade.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = fade; x.fillRect(-1, -1, 2, 2); x.restore(); x.globalCompositeOperation = 'source-over'; // fades to nothing before the canvas edge: the blots used to run right off it, so the decal ended in a straight line
  ashTex = new THREE.CanvasTexture(c); ashTex.anisotropy = 8; return ashTex;
}

let warnTex = null;
function warnTexture() { // the substation deck's paint: a hazard-striped border, DANGER / HIGH VOLTAGE, warning triangles with a bolt in them (the top of the canvas is the north side); 6 m x 8.8 m
  if (warnTex) return warnTex;
  const W = 300, H = 440, [c, x] = canvas(W, H), B = 18;
  x.fillStyle = '#d6b020'; x.fillRect(0, 0, W, B); x.fillRect(0, H - B, W, B); x.fillRect(0, 0, B, H); x.fillRect(W - B, 0, B, H);
  x.fillStyle = '#1a1a18'; for (let i = -H; i < W + H; i += 36) { for (const [ox, oy, w, h] of [[0, 0, W, B], [0, H - B, W, B], [0, 0, B, H], [W - B, 0, B, H]]) { x.save(); x.beginPath(); x.rect(ox, oy, w, h); x.clip(); x.beginPath(); x.moveTo(i, 0); x.lineTo(i + 18, 0); x.lineTo(i + 18 + H, H); x.lineTo(i + H, H); x.fill(); x.restore(); } }
  const tri = (cx, cy, s) => { x.fillStyle = '#d6b020'; x.beginPath(); x.moveTo(cx, cy - s); x.lineTo(cx + s * .9, cy + s * .7); x.lineTo(cx - s * .9, cy + s * .7); x.closePath(); x.fill(); x.fillStyle = '#1a1a18'; x.beginPath(); x.moveTo(cx, cy - s * .7); x.lineTo(cx + s * .66, cy + s * .55); x.lineTo(cx - s * .66, cy + s * .55); x.closePath(); x.fill();
    x.fillStyle = '#d6b020'; x.beginPath(); x.moveTo(cx + s * .12, cy - s * .38); x.lineTo(cx - s * .22, cy + s * .08); x.lineTo(cx - s * .02, cy + s * .08); x.lineTo(cx - s * .14, cy + s * .42); x.lineTo(cx + s * .24, cy - s * .08); x.lineTo(cx + s * .04, cy - s * .08); x.closePath(); x.fill(); }; // a lightning bolt in a triangle
  tri(70, 380, 38); tri(230, 380, 38);
  x.fillStyle = '#d9d9d2'; x.textAlign = 'center'; x.font = 'bold 40px Impact, "Arial Black", sans-serif'; x.fillText('DANGER', W / 2, 395); x.font = 'bold 24px Impact, "Arial Black", sans-serif'; x.fillText('HIGH VOLTAGE', W / 2, 424);
  tri(W / 2, 70, 30);
  wearPaint(x, W, H, 1800);
  warnTex = new THREE.CanvasTexture(c); warnTex.anisotropy = 8; return warnTex;
}

function treadPlan() { // the passes of one garage door, shared by the tracks outside and inside it, so they line up: [alpha, gauge (m), length (m), x at the door (m from the bay's middle), heading (0 = straight out), curvature]. Heavy tanks (wide gauge, strong), lighter vehicles (narrow gauge), some swinging well out to the sides; the first three are the ones that go on into the bay.
  const R = (a = 1, o = 0) => o + trackRnd() * a;
  const plan = [[1, 2.7, R(8, 5), R(1.2, -.6), R(.12, -.06), R(.05, -.025)], [.9, 2.6, R(9, 5), R(1.4, -.7), R(.2, -.1), R(.06, -.03)], [.8, 1.9, R(10, 5), R(2.4, -1.2), R(.3, -.15), R(.1, -.05)], [.7, 1.9, R(11, 6), R(2.6, -1.3), R(.5, -.25), R(.12, -.06)], [.6, 2.7, R(12, 6), R(1.4, -.7), trackRnd() < .5 ? R(.5, .25) : -R(.5, .25), R(.07, -.035)]];
  plan.push([.65, 1.9, R(9, 4), R(2.8, -1.4), -(R(.4, .2)), R(.1, -.05)], [.55, 2.7, R(10, 4), R(1.6, -.8), R(.3, -.15), -R(.09, .03)]);
  return plan.slice(0, 5 + (trackRnd() * 3 | 0));
}
function treadTextures(plan) { // vehicle tracks churned into dry earth, after a photo: many passes leaving the doors on different curves, some sweeping a long way out to the side and crossing the others; narrow ruts (0.42 m) with fine herringbone tread, a dark compacted bed with deeper edge lines, lighter ridges of loose soil along both edges and flecks of thrown dirt. Two pictures of the same marks: `mul` (white, darker where the earth is packed: drawn with a MULTIPLY blend, so it darkens the ground and its shadows) and `ridge` (transparent, with the pale ridges: drawn normally). 14 m x 14 m at 52 px a metre; the top of the canvas is the door's side. A new pair for every door.
  const PM = 52, W = 728, H = 728, [mc, m] = canvas(W, H), [rc, r2] = canvas(W / 2, H / 2), [bc, b2] = canvas(W / 2, H / 2), R = (a = 1, o = 0) => o + trackRnd() * a, cx = W / 2;
  r2.scale(.5, .5); b2.fillStyle = '#808080'; b2.fillRect(0, 0, W / 2, H / 2); b2.scale(.5, .5); // b2: the height map (mid grey: level; dark: the ruts, sunk; light: the ridges and pebbles, raised)
  const pass = (alpha, gauge, len, dx0, th0, kappa, wob) => {
    const pts = []; let px = cx + dx0 * PM, py = 4, th = th0, total = 0; // the heading th: 0 is straight out (south); it turns by kappa a metre
    for (let k = 0; total < len * PM; k++) { const ds = 2; th += (kappa + Math.sin(k * .06 + wob) * .012) * ds / PM; pts.push({ x: px, y: py, tx: Math.sin(th), ty: Math.cos(th), t: total / (len * PM) }); px += Math.sin(th) * ds; py += Math.cos(th) * ds; total += ds; }
    const TW = 32, gx = gauge * PM / 2; // (0.62 m wide)
    for (const side of [-1, 1]) {
      let dist = 0, prev = null;
      for (const p of pts) {
        const nx = -p.ty, ny = p.tx, fade = Math.pow(Math.max(0, 1 - p.t / .97), 1.1) * alpha * (.78 + .22 * Math.sin(p.t * 37 + side * 3)), ax = p.x + nx * gx * side, ay = p.y + ny * gx * side;
        if (prev) {
          m.lineCap = 'butt'; m.strokeStyle = `rgba(66,42,24,${.16 * fade})`; m.lineWidth = TW + 14; m.beginPath(); m.moveTo(prev.x, prev.y); m.lineTo(ax, ay); m.stroke(); // a soft shoulder, so the bed has no hard side
          m.strokeStyle = `rgba(66,42,24,${.5 * fade})`; m.lineWidth = TW; m.beginPath(); m.moveTo(prev.x, prev.y); m.lineTo(ax, ay); m.stroke();                                 // the rut's bed
          r2.lineCap = b2.lineCap = 'butt'; r2.strokeStyle = `rgba(112,78,48,${.3 * fade})`; r2.lineWidth = TW; r2.beginPath(); r2.moveTo(prev.x, prev.y); r2.lineTo(ax, ay); r2.stroke(); // (the lit layer carries the bed too, so its light and shade show in the rut)
          b2.strokeStyle = `rgba(48,48,48,${.85 * fade})`; b2.lineWidth = TW; b2.beginPath(); b2.moveTo(prev.x, prev.y); b2.lineTo(ax, ay); b2.stroke(); // the rut is sunk
          for (const e of [-1, 1]) { m.strokeStyle = `rgba(44,28,16,${.32 * fade})`; m.lineWidth = 3.4; m.beginPath(); m.moveTo(prev.x + prev.nx * e * (TW / 2 - 1), prev.y + prev.ny * e * (TW / 2 - 1)); m.lineTo(ax + nx * e * (TW / 2 - 1), ay + ny * e * (TW / 2 - 1)); m.stroke();   // deeper at the edges
            const br = .35 + .65 * Math.max(0, Math.sin(p.t * 23 + e * 4 + side * 2) * .5 + .5), jo = Math.sin(p.t * 41 + e) * 3; r2.strokeStyle = `rgba(226,190,146,${.15 * fade * br})`; r2.lineWidth = 9; r2.shadowColor = 'rgba(226,190,146,.6)'; r2.shadowBlur = 8; r2.beginPath(); r2.moveTo(prev.x + prev.nx * e * (TW / 2 + 6 + jo), prev.y + prev.ny * e * (TW / 2 + 6 + jo)); r2.lineTo(ax + nx * e * (TW / 2 + 6 + jo), ay + ny * e * (TW / 2 + 6 + jo)); r2.stroke(); r2.shadowBlur = 0;
            b2.strokeStyle = `rgba(220,220,220,${.55 * fade * br})`; b2.lineWidth = 9; b2.shadowColor = 'rgba(220,220,220,.8)'; b2.shadowBlur = 8; b2.beginPath(); b2.moveTo(prev.x + prev.nx * e * (TW / 2 + 6 + jo), prev.y + prev.ny * e * (TW / 2 + 6 + jo)); b2.lineTo(ax + nx * e * (TW / 2 + 6 + jo), ay + ny * e * (TW / 2 + 6 + jo)); b2.stroke(); b2.shadowBlur = 0; }  // (a faint, soft, uneven ridge: no crisp pale line; raised in the height map)              // a pale ridge of loose soil beside each
          m.strokeStyle = `rgba(40,26,15,${.3 * fade})`; m.lineWidth = 1.6; m.beginPath(); m.moveTo(prev.x, prev.y); m.lineTo(ax, ay); m.stroke(); // the line down the middle of the tread
          if (trackRnd() < .06) { const bx2 = ax + R(TW * 1.6, -TW * .8), by2 = ay + R(16, -8), rr = R(15, 7), gg = m.createRadialGradient(bx2, by2, 0, bx2, by2, rr); gg.addColorStop(0, `rgba(52,34,20,${.3 * fade})`); gg.addColorStop(1, 'rgba(52,34,20,0)'); m.fillStyle = gg; m.fillRect(bx2 - rr, by2 - rr, rr * 2, rr * 2); } // churned-up patches beside it
          if (trackRnd() < .12) { const sx = ax + R(TW * 1.8, -TW * .9), sy = ay + R(20, -10), rr = R(3.4, 1.4); m.fillStyle = `rgba(34,22,12,${.5 * fade})`; m.beginPath(); m.arc(sx, sy, rr, 0, 7); m.fill(); r2.fillStyle = `rgba(228,192,150,${.55 * fade})`; r2.beginPath(); r2.arc(sx - 1, sy - 1.4, rr * .6, 0, 7); r2.fill(); b2.fillStyle = `rgba(235,235,235,${.9 * fade})`; b2.beginPath(); b2.arc(sx, sy, rr, 0, 7); b2.fill(); } // pebbles pressed out of the track, each with a shadow and a lit side
          dist += Math.hypot(ax - prev.x, ay - prev.y);
          while (dist >= 8) { dist -= 8; // fine herringbone: a V of thin bars every 15 cm, the point leading
            const hw = TW / 2 - 3, cxp = ax - p.tx * dist, cyp = ay - p.ty * dist;
            m.strokeStyle = `rgba(30,18,10,${.66 * fade})`; m.lineWidth = 2.8; m.beginPath(); m.moveTo(cxp - nx * hw - p.tx * 6, cyp - ny * hw - p.ty * 6); m.lineTo(cxp, cyp); m.lineTo(cxp + nx * hw - p.tx * 6, cyp + ny * hw - p.ty * 6); m.stroke();
            b2.strokeStyle = `rgba(10,10,10,${.9 * fade})`; b2.lineWidth = 3; b2.beginPath(); b2.moveTo(cxp - nx * hw - p.tx * 6, cyp - ny * hw - p.ty * 6); b2.lineTo(cxp, cyp); b2.lineTo(cxp + nx * hw - p.tx * 6, cyp + ny * hw - p.ty * 6); b2.stroke(); // each tread bar cut into the rut
            m.strokeStyle = `rgba(30,18,10,${.34 * fade})`; m.lineWidth = 1.4; m.beginPath(); m.moveTo(cxp - nx * hw * .55 - p.tx * 3, cyp - ny * hw * .55 - p.ty * 3); m.lineTo(cxp, cyp - p.ty * 0); m.lineTo(cxp + nx * hw * .55 - p.tx * 3, cyp + ny * hw * .55 - p.ty * 3); m.stroke(); // (a second, finer chevron inside the first)
            if (trackRnd() < .045) { r2.fillStyle = `rgba(214,176,128,${.5 * fade})`; r2.beginPath(); r2.arc(cxp + R(34, -17), cyp + R(34, -17), R(3, 1), 0, 7); r2.fill(); } // thrown flecks of soil
          }
        }
        p.nx = nx; p.ny = ny; prev = { x: ax, y: ay, nx, ny };
      }
    }
  };
  for (const [a, g, len, dx0, th0, k] of plan) pass(a, g, len, dx0, th0, k, R(6)); // (the passes: see treadPlan)
  for (let i = 0; i < 7; i++) { const ang = R(1.6, -.8), rad = R(70, 26); m.strokeStyle = `rgba(48,30,17,${R(.28, .14)})`; m.lineWidth = R(18, 8); m.lineCap = 'round'; m.beginPath(); m.arc(cx + R(160, -80), R(90, 24), rad, ang, ang + R(1.6, .6)); m.stroke(); } // scuffs where vehicles swung round by the door
  m.globalCompositeOperation = 'destination-out'; for (let i = 0; i < 280; i++) { m.fillStyle = `rgba(0,0,0,${R(.45, .2)})`; m.beginPath(); m.arc(R(W), R(H), R(5, 1.5), 0, 7); m.fill(); } m.globalCompositeOperation = 'source-over'; // worn away in places
  const [c, x] = canvas(W, H); x.fillStyle = '#ffffff'; x.fillRect(0, 0, W, H); x.drawImage(mc, 0, 0); // the marks on white
  const rg = x.createRadialGradient(cx, 8, 150, cx, 8, 540); rg.addColorStop(0, 'rgba(255,255,255,0)'); rg.addColorStop(1, 'rgba(255,255,255,1)'); x.fillStyle = rg; x.fillRect(0, 0, W, H); // fading to white with distance from the door: nothing reaches the canvas's edge
  const [rc2, rx] = canvas(W / 2, H / 2); rx.drawImage(rc, 0, 0); rx.globalCompositeOperation = 'destination-out'; const rg2 = rx.createRadialGradient(cx / 2, 4, 75, cx / 2, 4, 270); rg2.addColorStop(0, 'rgba(0,0,0,0)'); rg2.addColorStop(1, 'rgba(0,0,0,1)'); rx.fillStyle = rg2; rx.fillRect(0, 0, W / 2, H / 2);
  const [bc2, bx3] = canvas(W / 2, H / 2); bx3.drawImage(bc, 0, 0); const bg = bx3.createRadialGradient(cx / 2, 4, 75, cx / 2, 4, 270); bg.addColorStop(0, 'rgba(128,128,128,0)'); bg.addColorStop(1, 'rgba(128,128,128,1)'); bx3.fillStyle = bg; bx3.fillRect(0, 0, W / 2, H / 2); // the height map fades to level
  const mul = new THREE.CanvasTexture(c), ridge = new THREE.CanvasTexture(rc2), bump = new THREE.CanvasTexture(bc2); mul.anisotropy = ridge.anisotropy = bump.anisotropy = 8;
  return { mul, ridge, bump };
}

function interiorTrackTextures(plan) { // the tracks carried on into the bay: dirt the vehicles brought in, lying on the dark floor and across the steel threshold plates, fading with depth (6 m of floor). Two passes to three, a pair of 0.62 m tracks each, with the same chevron tread; dirt-coloured, drawn normally. Returns { floor, plate }: the floor part (5 m, deep end at the canvas top) and the part over the plates (1.7 m).
  const PM = 52, W = 310, H = Math.round(6.71 * PM), [c0, x0] = canvas(W, H), [h0, y0h] = canvas(W, H), R = (a = 1, o = 0) => o + trackRnd() * a, cx = W / 2, DOOR = Math.round(.71 * PM); // (drawn with the door at the top, then flipped)
  const pass = (alpha, gauge, len, dx, th0, kappa) => {
    const pts = []; let px = cx + dx * PM, py = 0, th = th0, total = 0; // (from the plates' outer edge: the marks run across the front plate, the slot and the rear plate)
    for (let k = 0; total < len * PM; k++) { th += kappa * 2 / PM; pts.push({ x: px, y: py, tx: Math.sin(th), ty: Math.cos(th), t: total / (len * PM) }); px += Math.sin(th) * 2; py += Math.cos(th) * 2; total += 2; }
    const TW = 32, gx = gauge * PM / 2;
    for (const side of [-1, 1]) {
      let dist = 0, prev = null;
      for (const p of pts) {
        const nx = -p.ty, ny = p.tx, fade = Math.pow(Math.max(0, 1 - p.t), 1.3) * alpha * (.8 + .2 * Math.sin(p.t * 29 + side)), ax = p.x + nx * gx * side, ay = p.y + ny * gx * side;
        if (prev) {
          x0.lineCap = 'butt'; x0.strokeStyle = `rgba(58,42,28,${.5 * fade})`; x0.lineWidth = TW; x0.beginPath(); x0.moveTo(prev.x, prev.y); x0.lineTo(ax, ay); x0.stroke();
          y0h.lineCap = 'butt'; y0h.strokeStyle = `rgba(52,52,52,${.85 * fade})`; y0h.lineWidth = TW; y0h.beginPath(); y0h.moveTo(prev.x, prev.y); y0h.lineTo(ax, ay); y0h.stroke(); // (the rut sunk in the height map)
          for (const e of [-1, 1]) { y0h.strokeStyle = `rgba(220,220,220,${.5 * fade * (.35 + .65 * Math.max(0, Math.sin(p.t * 23 + e * 4 + side * 2) * .5 + .5))})`; y0h.lineWidth = 9; y0h.shadowColor = 'rgba(220,220,220,.8)'; y0h.shadowBlur = 8; y0h.beginPath(); y0h.moveTo(prev.x + prev.nx * e * (TW / 2 + 6), prev.y + prev.ny * e * (TW / 2 + 6)); y0h.lineTo(ax + nx * e * (TW / 2 + 6), ay + ny * e * (TW / 2 + 6)); y0h.stroke(); y0h.shadowBlur = 0; } // (the ridges beside it raised)                       // dirt in the rut
          x0.strokeStyle = `rgba(58,42,28,${.12 * fade})`; x0.lineWidth = TW + 14; x0.beginPath(); x0.moveTo(prev.x, prev.y); x0.lineTo(ax, ay); x0.stroke();                                   // soft shoulder
          dist += Math.hypot(ax - prev.x, ay - prev.y);
          while (dist >= 8) { dist -= 8; const hw = TW / 2 - 3, cxp = ax - p.tx * dist, cyp = ay - p.ty * dist;
            x0.strokeStyle = `rgba(24,16,10,${.75 * fade})`; x0.lineWidth = 2.8; x0.beginPath(); x0.moveTo(cxp - nx * hw - p.tx * 6, cyp - ny * hw - p.ty * 6); x0.lineTo(cxp, cyp); x0.lineTo(cxp + nx * hw - p.tx * 6, cyp + ny * hw - p.ty * 6); x0.stroke();
            y0h.strokeStyle = `rgba(10,10,10,${.9 * fade})`; y0h.lineWidth = 3; y0h.beginPath(); y0h.moveTo(cxp - nx * hw - p.tx * 6, cyp - ny * hw - p.ty * 6); y0h.lineTo(cxp, cyp); y0h.lineTo(cxp + nx * hw - p.tx * 6, cyp + ny * hw - p.ty * 6); y0h.stroke(); // (each tread bar cut in)
            if (trackRnd() < .05) { x0.fillStyle = `rgba(80,60,42,${.4 * fade})`; x0.beginPath(); const fx = cxp + R(34, -17), fy = cyp + R(30, -15), fr = R(2.6, 1); x0.arc(fx, fy, fr, 0, 7); x0.fill(); y0h.fillStyle = `rgba(235,235,235,${.9 * fade})`; y0h.beginPath(); y0h.arc(fx, fy, fr, 0, 7); y0h.fill(); } }
        }
        prev = { x: ax, y: ay };
      }
    }
  };
  y0h.fillStyle = '#808080'; y0h.fillRect(0, 0, W, H); // (height map: level)
  for (const [a, g, , dx0, th0] of plan.slice(0, 3)) pass(a, g, 6 + R(.8, -.4), dx0, -th0, 0); // (the same tracks run on straight into the bay: same place at the door, same heading, gauge and strength)
  x0.globalCompositeOperation = 'destination-out'; for (let i = 0; i < 120; i++) { x0.fillStyle = `rgba(0,0,0,${R(.45, .2)})`; x0.beginPath(); x0.arc(R(W), R(H), R(5, 1.5), 0, 7); x0.fill(); } x0.globalCompositeOperation = 'source-over';
  const [c1, x1] = canvas(W, H); x1.translate(0, H); x1.scale(1, -1); x1.drawImage(c0, 0, 0); // door at the bottom now: the deep end is the top
  const [h1, y1] = canvas(W, H); y1.translate(0, H); y1.scale(1, -1); y1.drawImage(h0, 0, 0);
  const crop = (src, sy, sh) => { const [cc, xc] = canvas(W, sh); xc.drawImage(src, 0, sy, W, sh, 0, 0, W, sh); const t = new THREE.CanvasTexture(cc); t.anisotropy = 4; return t; };
  const split = Math.round(H - 1.67 * PM); // rows above this are floor, below it the plates
  return { floor: crop(c1, 0, split), plate: crop(c1, split, H - split), floorBump: crop(h1, 0, split), plateBump: crop(h1, split, H - split) };
}

let footTex = null;
function footDecalTexture() { // the ground where the wall meets it: a thin band of dark soil against the wall, small moss tufts with firm edges (densest at the wall, gone within 0.5 m), a few grass blades. 12 m x 0.8 m at 170 px a metre; the top of the canvas is the wall's side
  if (footTex) return footTex;
  const W = 2048, H = 136, [c, x] = canvas(W, H), r = rnd2;
  const tuft = (px, py, rr, base, hi, a) => { for (const dx of [-W, 0, W]) { // an irregular clump, drawn a tile over each way so it wraps
    const pts = Array.from({ length: 9 }, (_, k) => { const t = k / 9 * 6.283, q = .6 + r() * .6; return [px + dx + Math.cos(t) * rr * q, py + Math.sin(t) * rr * q * .8]; });
    x.fillStyle = `rgba(${base},${a})`; x.beginPath(); pts.forEach(([u, v], k) => (k ? x.lineTo(u, v) : x.moveTo(u, v))); x.closePath(); x.fill();
    x.fillStyle = `rgba(${hi},${a * .8})`; x.beginPath(); pts.forEach(([u, v], k) => (k ? x.lineTo(px + dx + (u - px - dx) * .55 - rr * .15, py + (v - py) * .55 - rr * .2) : x.moveTo(px + dx + (u - px - dx) * .55 - rr * .15, py + (v - py) * .55 - rr * .2))); x.closePath(); x.fill(); } }; // (a darker body with a lighter top)
  const soil = x.createLinearGradient(0, 0, 0, H * .3); soil.addColorStop(0, 'rgba(58,48,36,.55)'); soil.addColorStop(1, 'rgba(58,48,36,0)'); x.fillStyle = soil; x.fillRect(0, 0, W, H * .3); // soil hugging the wall
  for (let i = 0; i < 1500; i++) { const py = H * Math.pow(r(), 2.2) * .62, cl = r() < .5 ? ['56,72,32', '84,104,48'] : ['70,88,40', '104,124,60']; tuft(r() * W, py, 3 + r() * 8, cl[0], cl[1], .55 + r() * .4); } // tufts of moss
  for (let i = 0; i < 900; i++) { const px = r() * W, py = H * Math.pow(r(), 2) * .55, l = 5 + r() * 12, a = -1.9 + r() * .8; x.strokeStyle = `rgba(${r() < .5 ? '66,88,38' : '92,112,50'},${.5 + r() * .4})`; x.lineWidth = 1 + r() * .6; x.beginPath(); x.moveTo(px, py); x.lineTo(px + Math.cos(a) * l * .5, py + Math.sin(a) * l); x.stroke(); } // blades
  x.globalCompositeOperation = 'destination-out'; const f = x.createLinearGradient(0, H * .5, 0, H * .72); f.addColorStop(0, 'rgba(0,0,0,0)'); f.addColorStop(1, 'rgba(0,0,0,1)'); x.fillStyle = f; x.fillRect(0, 0, W, H); x.globalCompositeOperation = 'source-over'; // gone by half a metre out
  footTex = new THREE.CanvasTexture(c); footTex.wrapS = THREE.RepeatWrapping; footTex.anisotropy = 8; return footTex;
}

// A slow, wall-wide variation in colour and grime, from the world position (not the texture), so no two stretches of the wall are alike and nothing lines up from slab to slab.
let facadeTex = null;
function facadeTexture() { // weathered concrete for the garage building, 6 m x 8 m at 85 px a metre, tiling both ways: soft mottling, long rain streaks, damp patches, lime and rust runs, a few chips and hairline cracks, fine grain. (The dirt at the foot comes from the shader, by height.)
  if (facadeTex) return facadeTex;
  const W = 512, H = 683, [c, x] = canvas(W, H), R = (a = 1, o = 0) => o + Math.random() * a;
  const wrap = f => { for (const dx of [-W, 0, W]) for (const dy of [-H, 0, H]) f(dx, dy); };
  x.fillStyle = '#7f8286'; x.fillRect(0, 0, W, H);
  for (let i = 0; i < 40; i++) { const px = R(W), py = R(H), r = R(120, 40), k = Math.random() < .5 ? '60,60,58' : '215,215,210', a = R(.08, .02); wrap((dx, dy) => { const g = x.createRadialGradient(px + dx, py + dy, 0, px + dx, py + dy, r); g.addColorStop(0, `rgba(${k},${a})`); g.addColorStop(1, `rgba(${k},0)`); x.fillStyle = g; x.fillRect(px + dx - r, py + dy - r, r * 2, r * 2); }); } // cloudy mottling
  for (let i = 0; i < 120; i++) { const sx = R(W), y0 = R(H), len = R(380, 60), w = R(8, 1.6), dark = Math.random() < .85, a = R(.2, .05); wrap((dx, dy) => { const g = x.createLinearGradient(0, y0 + dy, 0, y0 + dy + len); g.addColorStop(0, `rgba(${dark ? '38,38,36' : '230,230,225'},${a})`); g.addColorStop(1, `rgba(${dark ? '38,38,36' : '230,230,225'},0)`); x.fillStyle = g; x.fillRect(sx + dx - w / 2, y0 + dy, w, len); }); } // rain streaks, any length, wrapping
  for (let i = 0; i < 9; i++) { const px = R(W), py = R(H), r = R(70, 30); wrap((dx, dy) => { x.save(); x.translate(px + dx, py + dy); x.scale(1, R(1.6, .8)); const g = x.createRadialGradient(0, 0, 0, 0, 0, r); g.addColorStop(0, `rgba(36,34,30,${R(.2, .08)})`); g.addColorStop(1, 'rgba(36,34,30,0)'); x.fillStyle = g; x.fillRect(-r, -r, r * 2, r * 2); x.restore(); }); } // damp patches
  for (let i = 0; i < 12; i++) { const px = R(W), py = R(H), len = R(110, 40), w = R(5, 1.5); wrap((dx, dy) => { const g = x.createLinearGradient(0, py + dy, 0, py + dy + len); g.addColorStop(0, 'rgba(225,225,218,.22)'); g.addColorStop(1, 'rgba(225,225,218,0)'); x.fillStyle = g; x.fillRect(px + dx, py + dy, w, len); }); } // lime runs
  for (let i = 0; i < 7; i++) { const px = R(W), py = R(H), len = R(160, 50); wrap((dx, dy) => { const g = x.createLinearGradient(0, py + dy, 0, py + dy + len); g.addColorStop(0, 'rgba(120,74,44,.2)'); g.addColorStop(1, 'rgba(120,74,44,0)'); x.fillStyle = g; x.fillRect(px + dx - 1.5, py + dy, R(6, 2.5), len); }); } // rust runs
  for (let i = 0; i < 8; i++) { let px = R(W), py = R(H); const dir = R(1.2, 1.9); x.strokeStyle = `rgba(30,30,28,${R(.55, .3)})`; x.lineWidth = R(1.6, .8); x.beginPath(); x.moveTo(px, py); for (let k = 0; k < R(10, 4); k++) { px += Math.cos(dir + R(.9, -.45)) * R(24, 8); py += Math.sin(dir + R(.9, -.45)) * R(24, 8); x.lineTo(px, py); } x.stroke(); } // hairline cracks
  for (let i = 0; i < 7; i++) { const px = R(W - 80, 40), py = R(H - 80, 40), rx = R(26, 10), ry = R(18, 8); x.beginPath(); for (let k = 0; k < 9; k++) { const a = k / 9 * 6.283, q = .65 + Math.random() * .6; k ? x.lineTo(px + Math.cos(a) * rx * q, py + Math.sin(a) * ry * q) : x.moveTo(px + Math.cos(a) * rx * q, py + Math.sin(a) * ry * q); } x.closePath(); x.fillStyle = 'rgba(158,160,156,.92)'; x.fill(); x.strokeStyle = 'rgba(40,40,38,.35)'; x.lineWidth = 1.2; x.stroke(); } // a few chips, fresh concrete in the break
  const d = x.getImageData(0, 0, W, H), q = d.data; for (let i = 0; i < q.length; i += 4) { const g = (Math.random() - .5) * 7; q[i] += g; q[i + 1] += g; q[i + 2] += g; } x.putImageData(d, 0, 0); // fine grain
  facadeTex = new THREE.CanvasTexture(c); facadeTex.wrapS = facadeTex.wrapT = THREE.RepeatWrapping; facadeTex.anisotropy = 8; return facadeTex;
}
function patchFacadeMaterial(m, tex, base = 0) { // the texture is read by world position (x/y on a front face, z/y on a side, x/z on a top), plus dirt and damp at the foot, and the slow grime variation
  m.onBeforeCompile = sh => {
    sh.uniforms.facadeMap = { value: tex };
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vFacW; varying vec3 vFacN;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvFacW = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz; vFacN = normalize( mat3( modelMatrix ) * objectNormal );');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
uniform sampler2D facadeMap; varying vec3 vFacW; varying vec3 vFacN;
float facH( vec2 p ) { return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453 ); }
float facN( vec2 p ) { vec2 i = floor( p ), f = fract( p ); f = f * f * ( 3.0 - 2.0 * f ); return mix( mix( facH( i ), facH( i + vec2( 1.0, 0.0 ) ), f.x ), mix( facH( i + vec2( 0.0, 1.0 ) ), facH( i + vec2( 1.0, 1.0 ) ), f.x ), f.y ); }`)
      .replace('#include <map_fragment>', `#include <map_fragment>
	{ vec3 an = abs( vFacN ); vec2 uv = an.z > 0.5 ? vFacW.xy : ( an.x > 0.5 ? vFacW.zy : vFacW.xz );
	  vec3 t = texture2D( facadeMap, uv / vec2( 6.0, 8.0 ) ).rgb;
	  float h = max( vFacW.y - ${base.toFixed(2)}, 0.0 ), foot = an.y > 0.5 ? 1.0 : smoothstep( 0.0, 1.6, h );
	  float n = facN( uv * vec2( 0.09, 0.22 ) ) * 0.55 + facN( uv * vec2( 0.31, 0.7 ) + 5.0 ) * 0.3 + facN( uv * 1.7 + 11.0 ) * 0.15;
	  diffuseColor.rgb *= t * mix( 0.9, 1.08, n ) * mix( vec3( 0.66, 0.62, 0.56 ), vec3( 1.0 ), foot ); }`);
  };
  return m;
}

let edgeGrime = null;
function edgeGrimeTexture() { // dirt along the inside of a roof's parapet: dark at the edge, fading in about 0.7 m, broken into streaks (the top of the canvas is the parapet side); 6 m x 0.7 m
  if (edgeGrime) return edgeGrime;
  const W = 512, H = 64, [c, x] = canvas(W, H);
  const g = x.createLinearGradient(0, 0, 0, H); g.addColorStop(0, 'rgba(24,22,20,.55)'); g.addColorStop(1, 'rgba(24,22,20,0)'); x.fillStyle = g; x.fillRect(0, 0, W, H);
  x.globalCompositeOperation = 'destination-out'; for (let i = 0; i < 70; i++) { const px = Math.random() * W, w = 4 + Math.random() * 26, len = 10 + Math.random() * 50, gg = x.createLinearGradient(0, H - len, 0, H); gg.addColorStop(0, 'rgba(0,0,0,0)'); gg.addColorStop(1, `rgba(0,0,0,${.3 + Math.random() * .5})`); x.fillStyle = gg; x.fillRect(px, 0, w, H); } x.globalCompositeOperation = 'source-over';
  for (let i = 0; i < 40; i++) { const px = Math.random() * W, len = 14 + Math.random() * 46, gg = x.createLinearGradient(0, 0, 0, len); gg.addColorStop(0, `rgba(20,18,16,${.15 + Math.random() * .25})`); gg.addColorStop(1, 'rgba(20,18,16,0)'); x.fillStyle = gg; x.fillRect(px, 0, 2 + Math.random() * 5, len); }
  edgeGrime = new THREE.CanvasTexture(c); edgeGrime.wrapS = THREE.RepeatWrapping; edgeGrime.anisotropy = 8; return edgeGrime;
}

export function patchWallMaterial(m, tinted = true, edge = null, burn = null) { // burn: { y, uBurn, uBurnK }: up to two burnt patches on the roof's top face (x, z, radii; strength), darkened and charred here in the shader (not with a decal laid over the roof: its edge could show as a seam) // edge: { x0, x1, z0, z1 }: a roof's edges in world metres: it is dirtied and darkened within 0.9 m of them (done here, in the shader, not with decals laid over it)
  m.onBeforeCompile = sh => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWallW; varying vec3 vWallT;' + (tinted ? ' attribute vec3 rpos;' : '')).replace('#include <begin_vertex>', '#include <begin_vertex>\nvWallW = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz; vWallT = ' + (tinted ? 'rpos' : 'vec3( 1.0 )') + ';');
    if (burn) { sh.uniforms.uBurn = burn.uBurn; sh.uniforms.uBurnK = burn.uBurnK; }
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
${burn ? 'uniform vec4 uBurn[2]; uniform float uBurnK[2];' : ''}
varying vec3 vWallW; varying vec3 vWallT;
float wallH( vec2 p ) { return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453 ); }
float wallN( vec2 p ) { vec2 i = floor( p ), f = fract( p ); f = f * f * ( 3.0 - 2.0 * f ); return mix( mix( wallH( i ), wallH( i + vec2( 1.0, 0.0 ) ), f.x ), mix( wallH( i + vec2( 0.0, 1.0 ) ), wallH( i + vec2( 1.0, 1.0 ) ), f.x ), f.y ); }`)
      .replace('#include <map_fragment>', `#include <map_fragment>
	{ vec2 q = vec2( vWallW.x, vWallW.y + vWallW.z ); // (the wall's face is x / y, its roof x / z)
	  float n = wallN( q * vec2( 0.09, 0.22 ) ) * 0.55 + wallN( q * vec2( 0.31, 0.7 ) + 5.0 ) * 0.3 + wallN( q * 1.7 + 11.0 ) * 0.15;
	  diffuseColor.rgb *= vWallT * mix( 0.88, 1.08, n ) * mix( vec3( 1.0 ), vec3( 0.97, 0.97, 0.96 ), wallN( q * vec2( 0.05, 0.4 ) + 3.0 ) );` + (edge ? `
	  float de = min( min( vWallW.x - ${edge.x0.toFixed(3)}, ${edge.x1.toFixed(3)} - vWallW.x ), min( vWallW.z - ${edge.z0.toFixed(3)}, ${edge.z1.toFixed(3)} - vWallW.z ) );
	  diffuseColor.rgb *= mix( 0.62, 1.0, smoothstep( 0.1, 0.9, de + ( wallN( q * 3.0 ) - 0.5 ) * 0.5 ) );` : '') + (burn ? `
	  if ( vWallW.y > ${burn.y.toFixed(3)} ) for ( int i = 0; i < 2; i++ ) { // burnt patches: a ragged oval, black in the middle, thinning to brown ash and then to the roof
	    vec2 dd = ( vWallW.xz - uBurn[i].xy ) / uBurn[i].zw; float r = length( dd ) + ( wallN( vWallW.xz * 2.2 + float( i ) * 7.0 ) - 0.5 ) * 0.55 + ( wallN( vWallW.xz * 7.0 ) - 0.5 ) * 0.16;
	    float k = smoothstep( 1.15, 0.4, r ) * uBurnK[i]; diffuseColor.rgb *= mix( vec3( 1.0 ), vec3( 0.2, 0.185, 0.17 ), k ); }` : '') + ` }`);
  };
  return m;
}

let topTex = null;
export function wallTopTexture() { // the wall's roof, 6 m x 3.4 m: poured concrete with a tarred expansion joint, drain scuppers, patched cracks, stains, painted edge lines and wear
  if (topTex) return topTex;
  const [c, x] = canvas(512, 288); x.fillStyle = '#85878a'; x.fillRect(0, 0, 512, 288);
  for (let i = 0; i < 2600; i++) { const g = 110 + rnd() * 60 | 0; x.fillStyle = `rgba(${g},${g},${g + 3},.22)`; x.fillRect(rnd() * 512, rnd() * 288, 1 + rnd() * 3, 1 + rnd() * 3); } // aggregate
  for (let i = 0; i < 26; i++) { const g = x.createRadialGradient(0, 0, 0, 0, 0, 1), px = rnd() * 512, py = rnd() * 288, r = 14 + rnd() * 50; x.save(); x.translate(px, py); x.scale(r * (1 + rnd()), r * (.5 + rnd() * .5)); g.addColorStop(0, `rgba(${rnd() < .5 ? '60,52,44' : '170,172,170'},.22)`); g.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = g; x.beginPath(); x.arc(0, 0, 1, 0, 7); x.fill(); x.restore(); } // stains and bleached patches
  x.fillStyle = 'rgba(25,24,22,.8)'; x.fillRect(0, 0, 6, 288); x.fillStyle = 'rgba(255,255,255,.12)'; x.fillRect(6, 0, 2, 288); // the expansion joint where the next slab begins
  x.fillStyle = 'rgba(20,20,20,.35)'; x.fillRect(0, 0, 512, 5); x.fillRect(0, 283, 512, 5); // the shadow under each parapet lip
  x.fillStyle = '#c9a928'; x.fillRect(0, 22, 512, 6); x.fillRect(0, 260, 512, 6); // painted edge lines (worn)
  for (let i = 0; i < 160; i++) { x.fillStyle = 'rgba(110,110,108,.55)'; x.fillRect(rnd() * 512, rnd() < .5 ? 22 : 260, 2 + rnd() * 14, 6); } // (the paint chipped away)
  x.strokeStyle = 'rgba(15,14,12,.75)'; x.lineWidth = 1.6; for (let k = 0; k < 9; k++) { let px = rnd() * 512, py = 40 + rnd() * 200; x.beginPath(); x.moveTo(px, py); for (let i = 0; i < 8; i++) { px += (rnd() - .3) * 34; py += (rnd() - .5) * 26; x.lineTo(px, py); } x.stroke(); } // cracks
  x.fillStyle = 'rgba(30,29,27,.7)'; for (let k = 0; k < 5; k++) x.fillRect(40 + rnd() * 420, 50 + rnd() * 180, 26 + rnd() * 30, 10 + rnd() * 14); // tar patches
  for (const sx of [150, 380]) { x.fillStyle = '#2a2c2d'; x.fillRect(sx, 120, 30, 30); x.strokeStyle = 'rgba(150,152,150,.6)'; x.lineWidth = 1.5; for (let i = 0; i < 6; i++) { x.beginPath(); x.moveTo(sx + 2 + i * 5, 122); x.lineTo(sx + 2 + i * 5, 148); x.stroke(); } x.strokeStyle = 'rgba(40,36,30,.5)'; x.lineWidth = 6; x.beginPath(); x.moveTo(sx + 15, 150); x.lineTo(sx + 15 + (rnd() - .5) * 20, 200); x.stroke(); } // drain scuppers, each with its rust streak
  topTex = new THREE.CanvasTexture(c); topTex.wrapS = THREE.RepeatWrapping; topTex.anisotropy = 8; return topTex;
}

export class AirbaseBoss {
  constructor(scene, fx, debris, tanks, enemyJeeps) { this.scene = scene; this.fx = fx; this.debris = debris; this.tanks = tanks; this.enemyJeeps = enemyJeeps; this.garages = []; this.out = []; this.state = 'idle'; }

  setup(world, cfg, onClear, arena = null) {
    if (!cfg) return;
    this.arena = arena; this.world = world; this.cfg = cfg; this.onClear = onClear; this.state = 'wait'; this.t = 0; this.nextIn = 1.5; this.powered = true; this.time = 0;
    const gy = x => world.heightAt?.(x, cfg.doorZ) ?? 0, y0 = gy(cfg.gate.x);
    const concrete = new THREE.MeshStandardMaterial({ color: 0x74777a, roughness: .9 }), dark = new THREE.MeshStandardMaterial({ color: 0x2b2d2f, roughness: .85 }), steel = new THREE.MeshStandardMaterial({ color: 0x8a8e92, roughness: .5, metalness: .5 });
    const stripe = hazardTexture().clone(); stripe.needsUpdate = true;
    this.mats = { concrete, dark, steel }; this.bayGlass = {};
    // ---- the garage blocks: pillars, roof, lintels over every door, back walls
    const facadeMat = patchFacadeMaterial(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .95, envMapIntensity: .2 }), facadeTexture(), y0); // the building's concrete: weathered
    for (const b of cfg.blocks) {
      const concrete = facadeMat; // (shadows the plain concrete above, for the pillars, the lintels and the walls of this block)
      const g = new THREE.Group(); g.position.y = y0;
      const box = (w, h, d, mat, x, y, z, cast = true) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); m.castShadow = cast; m.receiveShadow = DBG !== 'noshadow'; g.add(m); return m; };
      const zc = cfg.doorZ - cfg.depth / 2;
      const pillars = [b.x0 + PILLAR / 2, (b.x0 + b.x1) / 2, b.x1 - PILLAR / 2];
      for (const px of pillars) { box(PILLAR, ROOF_Y + .1, cfg.depth + .3, concrete, px, (ROOF_Y + .1) / 2, zc); box(PILLAR + .2, .25, cfg.depth + .5, steel, px, ROOF_Y + .22, zc, false); box(PILLAR - .6, 1.1, .12, dark, px, 2.3, cfg.doorZ + .22, false); }
      const burn = { y: y0 + ROOF_Y + .15, uBurn: { value: [new THREE.Vector4(0, 0, 1, 1), new THREE.Vector4(0, 0, 1, 1)] }, uBurnK: { value: [0, 0] }, block: b }; (this.burns ??= []).push(burn); // (the burnt patches the destroyed substations leave)
      const roofMat = DBG === 'roofplain' ? new THREE.MeshStandardMaterial({ color: 0x777b7d, roughness: .95 }) : patchWallMaterial(new THREE.MeshStandardMaterial({ map: roofDeckTexture().clone(), roughness: .95, envMapIntensity: .2 }), false, { x0: b.x0, x1: b.x1, z0: cfg.doorZ - cfg.depth, z1: cfg.doorZ }, burn); if (roofMat.map) { roofMat.map.needsUpdate = true; roofMat.map.repeat.set((b.x1 - b.x0) / 4, (cfg.depth + .3) / 4); }
      box(b.x1 - b.x0 + .06, .55, cfg.depth + .36, roofMat, (b.x0 + b.x1) / 2, ROOF_Y - .1, zc); /* (3 cm proud of the pillars all round: level faces flicker) */ // roof: a flat deck with a membrane and gravel
      for (const bx of cfg.bays.filter(x => x > b.x0 && x < b.x1)) {
        box(cfg.bayW, .55, .5, concrete, bx, DOOR_H + .55, cfg.doorZ + .05);                        // lintel
        const band = box(cfg.bayW, .3, .08, new THREE.MeshStandardMaterial({ map: stripe, roughness: .6 }), bx, DOOR_H + .12, cfg.doorZ + .32, false); band.material.map.repeat.set(cfg.bayW / 1.2, 1);
        box(cfg.bayW, ROOF_Y - .35, .35, dark, bx, (ROOF_Y - .35) / 2, cfg.doorZ - cfg.depth + .2);   // back wall
        box(cfg.bayW, .05, cfg.depth, dark, bx, .03, zc, false);                                    // floor
        for (const sx of [-1, 1]) box(.12, .04, cfg.depth - .6, steel, bx + sx * 1.5, .07, zc, false);   // guide rails along the floor, out through the door
        const gz = cfg.doorZ - 4.5, yel = this.craneMat ??= new THREE.MeshStandardMaterial({ color: 0xc9981a, roughness: .6, metalness: .4 }), lamp = this.shopLight ??= new THREE.MeshBasicMaterial({ color: 0xffe6b8 });
        const cy = ROOF_Y - 1.9;
        box(cfg.bayW - .2, .4, .4, yel, bx, cy, gz, false);                                          // an overhead crane: its beam across the bay
        for (const sx of [-1, 1]) box(.5, .5, .8, dark, bx + sx * (cfg.bayW / 2 - .35), cy, gz, false); // the end trucks on its rails
        box(.8, .5, .7, dark, bx + .8, cy - .35, gz, false); box(.07, 2.1, .07, steel, bx + .8, cy - 1.4, gz, false); box(.22, .3, .22, dark, bx + .8, cy - 2.5, gz, false); // trolley, chain and hook
        for (const sx of [-1, 1]) { box(.25, .06, cfg.depth - 2, lamp, bx + sx * 1.9, ROOF_Y - .75, zc, false); box(.05, .4, .05, steel, bx + sx * 1.9, ROOF_Y - .55, zc, false); } // work lights hung from the ceiling
      }
      { // the upper storey: the wall over each door is built round two identical wide openings (a pair filling the bay); each has its glass set back in the wall in a 4 x 2 grid of panes, flush concrete frames and steel bars in front. Two framed windows on each end of the block.
        const mx = (b.x0 + b.x1) / 2, lintelTop = DOOR_H + .825, roofBot = ROOF_Y - .375, wallH = roofBot - lintelTop;
        // (the glass: the original dark blue, no glow of its own, but less mirror-like and a little diffuse, so a nearby blast lights it; a near-perfect mirror shows only a pin-point highlight)
        const glass = this.winGlass ??= new THREE.MeshStandardMaterial({ color: 0x1b2d3d, roughness: .16, metalness: .65, envMapIntensity: 1.9 }), bars = this.winBars ??= new THREE.MeshStandardMaterial({ color: 0x0c0d0e, roughness: .5, metalness: .6 }); // (dark glass with a blue tint, reflecting the sky)
        const frameC = this.winConcrete ??= new THREE.MeshStandardMaterial({ color: 0x8a8c88, roughness: .95, envMapIntensity: .15 }); // (the frames: weathered concrete grey, not white)
        const WW = 2.45, WH = 1.2, SILL = .35, HEAD = wallH - SILL - WH, wy = lintelTop + SILL + WH / 2, zw = cfg.doorZ - .05, FZ = cfg.doorZ + .1, FD = .2;
        const panes = (cx, cy, w, h, z, alongZ = false) => { // the window's steel bars, which divide the glass into panes and guard it
          const g2 = (bw, bh, bd, x, y, zz) => alongZ ? box(bd, bh, bw, bars, x, y, zz, false) : box(bw, bh, bd, bars, x, y, zz, false); // (a bar: width along the window, height, depth out of the wall)
          const at = (u, v, d) => alongZ ? [cx + d, cy + v, z + u] : [cx + u, cy + v, z + d];
          for (let k = 1; k < 4; k++) g2(.06, h, .06, ...at(-w / 2 + k * w / 4, 0, .02)); // a grid of four columns by two rows of panes: three steel bars up...
          g2(w, .06, .06, ...at(0, 0, .02));                                              // ...and one across: they are the grille too (no second set of thin bars)
        };
        for (const bx of cfg.bays.filter(x => x > b.x0 && x < b.x1)) {
          const pier = (cfg.bayW - 2 * WW) / 3; let x = bx - cfg.bayW / 2;
          box(cfg.bayW, HEAD, .35, concrete, bx, lintelTop + wallH - HEAD / 2, zw); box(cfg.bayW, SILL, .35, concrete, bx, lintelTop + SILL / 2, zw);          // the header and the sill band, with openings between them
          for (let k = 0; k < 3; k++) { box(pier, WH, .35, concrete, x + pier / 2, wy, zw); x += pier; if (k < 2) { // a pier, then a window
            const cx = x + WW / 2;
            { const gl = box(WW, WH, .04, glass, cx, wy, cfg.doorZ - .02, false); gl.name = 'glass'; (this.bayGlass[bx] ??= []).push({ mesh: gl, w: WW, h: WH }); } // (named: left out of the merge, so it can be shattered)                                                                       // the glass, set back in the wall
            panes(cx, wy, WW, WH, cfg.doorZ + .0);
            box(WW + .36, .24, FD, frameC, cx, wy + WH / 2 + .12, FZ); box(WW + .36, .2, FD, frameC, cx, wy - WH / 2 - .1, FZ);              // a head and a sill exactly as wide and as deep as the jambs: nothing overhangs to throw a shadow
            for (const sx of [-1, 1]) box(.18, WH + .44, FD, frameC, cx + sx * (WW / 2 + .09), wy, FZ);
            x += WW; } }
        }
        for (const ex of [b.x0, b.x1]) for (const wz of [cfg.doorZ - 3, cfg.doorZ - 7]) { // the ends of the block: a flush frame with the glass sunk in it
          const o = ex === b.x0 ? -1 : 1, W2 = 1.4, fx = ex + o * .09;
          box(FD, .24, W2 + .36, frameC, fx, wy + WH / 2 + .12, wz); box(FD, .2, W2 + .36, frameC, fx, wy - WH / 2 - .1, wz); for (const sz of [-1, 1]) box(FD, WH + .44, .18, frameC, fx, wy, wz + sz * (W2 / 2 + .09)); // head, sill, jambs
          box(.04, WH, W2, glass, ex + o * .03, wy, wz, false);
          panes(ex + o * .05, wy, W2, WH, wz, true);
        }
      }
      this.roofDeck(g, box, b, cfg, { steel, dark });
      this.scene.add(mergeStatic(g));
    }
    // ---- the wall: thick concrete across the whole map and on well past its sides, flush with the garages' fronts, with the gate's gap and the garage blocks left out
    {
      const T = 3.4, H = 3.6, zc = cfg.doorZ + .3 - T / 2, EXT = 75, gate = cfg.gate, cut = [...cfg.blocks.map(b => [b.x0, b.x1]), [gate.x - gate.w / 2, gate.x + gate.w / 2]].sort((a, b) => a[0] - b[0]);
      const pieces = []; let x = -EXT; for (const [a, b] of cut) { if (a > x) pieces.push([x, a]); x = Math.max(x, b); } if (x < EXT) pieces.push([x, EXT]);
      const g = new THREE.Group(); g.position.y = y0;
      const vars = wallVariants(), SLAB = 6, JOINT = .04;
      const sideMats = vars.map(v => patchWallMaterial(new THREE.MeshStandardMaterial({ map: v.map, bumpMap: v.bump, bumpScale: .4, roughness: .92, envMapIntensity: .3 })));
      const topMat = patchWallMaterial(new THREE.MeshStandardMaterial({ map: wallTopTexture(), roughness: .95, envMapIntensity: .2 })), jointMat = new THREE.MeshStandardMaterial({ color: 0x6a6c6a, roughness: .95 }), endMat = patchWallMaterial(new THREE.MeshStandardMaterial({ map: vars.end.map, bumpMap: vars.end.bump, bumpScale: .4, roughness: .92, envMapIntensity: .3 })) /* the cut ends of the wall */;
      const lipMat = new THREE.MeshStandardMaterial({ color: 0x6f7273, roughness: .9 }), hatchMat = new THREE.MeshStandardMaterial({ color: 0x4a4e50, roughness: .6, metalness: .5 });
      let last = false;
      for (const [a, b] of pieces) {
        const mx = (a + b) / 2, w = b - a;
        for (let k = 0, n = Math.max(1, Math.round((b - a) / SLAB)); k < n; k++) { // the piece in equal slabs of about 6 m (never a short one: no cropping, so no chip is ever cut by a texture's edge), each one of seven textures (a heavily damaged one only now and then, never two in a row), flipped on every other slab
          const sw = (b - a) / n, sx = a + k * sw, r = rnd(), heavy = r < .2 && !last, tier = heavy ? [5, 6] : r < .85 ? [2, 3, 4] : [0, 1], v = tier[rnd() * tier.length | 0]; last = heavy;
          const geo = new THREE.BoxGeometry(sw, H, T), uv = geo.attributes.uv, tb = 1 + (rnd() - .5) * .1, tint = [tb * (1 + (rnd() - .5) * .03), tb, tb * (1 + (rnd() - .5) * .03)]; // (tint: this slab's brightness, +-5%)
          geo.setAttribute('rpos', new THREE.Float32BufferAttribute(Array.from({ length: geo.attributes.position.count }, () => tint).flat(), 3));
          if (k % 2) for (const f of [2, 4, 5]) for (let i = 0; i < 4; i++) uv.setX(f * 4 + i, 1 - uv.getX(f * 4 + i)); // (top and both faces, mirrored)
          const slab = new THREE.Mesh(geo, [endMat, endMat, topMat, sideMats[v], sideMats[v], sideMats[v]]); slab.position.set(sx + sw / 2, H / 2, zc); slab.castShadow = slab.receiveShadow = true; g.add(slab);
          if (k > 0) { const j = new THREE.Mesh(new THREE.BoxGeometry(JOINT, H - .012, T + .01), jointMat); j.position.set(sx, (H - .012) / 2, zc); // (a hair below the wall's top: level with it, its top face flickered against the roof of the wall)
           j.receiveShadow = true; g.add(j); } // the joint between two slabs
        }
        for (const sz of [-1, 1]) { const lip = new THREE.Mesh(new THREE.BoxGeometry(w, .3, .24), lipMat); lip.position.set(mx, H + .15, zc + sz * (T / 2 - .12)); lip.castShadow = lip.receiveShadow = true; g.add(lip); } // a parapet lip along each edge of the roof
        for (let px = a + 4; px < b - 2 && b - a >= 8; px += 12) { // roof hatches and vents (not on the short pieces beside the gate: a gun stands there)
          const hatch = new THREE.Mesh(new THREE.BoxGeometry(1.3, .3, 1.1), hatchMat); hatch.position.set(px, H + .15, zc - .5); hatch.castShadow = true; g.add(hatch);
          const lid = new THREE.Mesh(new THREE.BoxGeometry(1.1, .06, .9), dark); lid.position.set(px, H + .33, zc - .5); g.add(lid);
          const vent = new THREE.Mesh(new THREE.CylinderGeometry(.26, .3, .5, 10), hatchMat); vent.position.set(px + 2.4, H + .25, zc + .6); vent.castShadow = true; g.add(vent);
          const cap = new THREE.Mesh(new THREE.CylinderGeometry(.4, .4, .06, 10), dark); cap.position.set(px + 2.4, H + .53, zc + .6); g.add(cap);
        }
      }
      { // the power run along the wall top: from each garage block to an emitter housing on the end of the wall at the gate (its lens glows with the field)
        const emit = this.emitMat = new THREE.MeshStandardMaterial({ color: 0x3a1c08, emissive: 0xff8a1a, emissiveIntensity: 2, roughness: .4 }), cz = zc + 1.1;
        for (const sgn of [-1, 1]) {
          const xe = gate.x + sgn * gate.w / 2, xb = sgn < 0 ? cfg.blocks[0].x1 : cfg.blocks[1].x0, xa = Math.min(xe, xb), xz = Math.max(xe, xb);
          const c = new THREE.Mesh(new THREE.CylinderGeometry(.1, .1, xz - xa, 8).rotateZ(Math.PI / 2), dark); c.position.set((xa + xz) / 2, H + .35, cz); c.castShadow = true; g.add(c);
          for (let px = xa + .8; px < xz - .4; px += 2) { const post = new THREE.Mesh(new THREE.BoxGeometry(.1, .35, .1), steel); post.position.set(px, H + .18, cz); g.add(post); }
          const box2 = new THREE.Mesh(new THREE.BoxGeometry(.9, .8, 1.3), dark); box2.position.set(xe + sgn * .45, H + .4, zc); box2.castShadow = true; g.add(box2);   // the emitter housing
          const lens = new THREE.Mesh(new THREE.BoxGeometry(.06, .4, .8), emit); lens.position.set(xe + sgn * .45 - sgn * .46, H + .45, zc); g.add(lens);                    // its lens, facing the field
        }
      }
      this.scene.add(mergeStatic(g));
      // moss and soil on the ground where the wall meets it
      const segs = pieces; // (the wall only: not the garages, not the gate)
      for (const [a, b] of segs) {
        const len = b - a, tex = footDecalTexture().clone(); tex.needsUpdate = true; tex.repeat.set(len / 12, 1); tex.offset.x = rnd2();
        const mat = new THREE.MeshStandardMaterial({ map: tex, transparent: true, depthWrite: false, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
        const strip = new THREE.Mesh(new THREE.PlaneGeometry(len, .8).rotateX(-Math.PI / 2), mat); strip.position.set((a + b) / 2, y0 + .035, cfg.doorZ + .3 + .3); strip.receiveShadow = true; strip.renderOrder = 1; this.scene.add(strip);
      }
      for (const sgn of [-1, 1]) { // ...and along the cut ends of the wall at the gate, on the ground beside each jamb
        const xe = gate.x + sgn * gate.w / 2, tex = footDecalTexture().clone(); tex.needsUpdate = true; tex.repeat.set(T / 12, 1); tex.offset.x = rnd2();
        const mat = new THREE.MeshStandardMaterial({ map: tex, transparent: true, depthWrite: false, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
        const strip = new THREE.Mesh(new THREE.PlaneGeometry(T, .8).rotateX(-Math.PI / 2).rotateY(-sgn * Math.PI / 2), mat); strip.position.set(xe - sgn * .3, y0 + .035, zc); strip.receiveShadow = true; strip.renderOrder = 1; this.scene.add(strip);
      }
    }
    // ---- the road markings on the paved ground behind the wall (after the NES map): the gate's road, two arrows pointing north, and a dashed line along the wall's far side
    {
      const gate = cfg.gate, y = y0 + .03, zl = cfg.doorZ - 11.7, half = 3.15, mk = (map, w, d, x, z, rep) => { // (a flat decal: w along X, d along Z)
        const tex = map.clone(); tex.needsUpdate = true; if (rep) tex.repeat.set(rep, 1);
        const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: tex, transparent: true, depthWrite: false, roughness: .85, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }));
        m.position.set(x, y, z); m.renderOrder = 1; m.receiveShadow = true; this.scene.add(m); return m;
      };
      for (const [a, b] of [[-58, gate.x - half], [gate.x + half, 58]]) mk(dashTexture(), b - a, .22, (a + b) / 2, zl, (b - a) / 2.1); // the dashed line across the pavement, left and right of the road
      for (const sx of [-1, 1]) { // the road's two edges, running from that line to the wall (turned: the dash runs along Z)
        const m = mk(dashTexture(), Math.abs(cfg.doorZ - 3.9 - zl), .22, gate.x + sx * half, (zl + cfg.doorZ - 3.9) / 2, Math.abs(cfg.doorZ - 3.9 - zl) / 2.1);
        m.rotation.y = Math.PI / 2;
      }
      for (const sx of [-1, 1]) mk(arrowTexture(), 1.4, 3.4, gate.x + sx * 1.85, cfg.doorZ - 9.3, 0);
    }
    // ---- the four garages
    cfg.bays.forEach((bx, i) => this.garages.push(this.buildGarage(i, bx, cfg, gy(bx))));
    for (const g of this.garages) this.buildTransformer(g, cfg, g.y0);
    const treadPlans = {}; // each door's passes, shared by the tracks outside and inside it
    for (const bx of cfg.bays) { // vehicle tracks leading out of each door: a multiply layer (the packed ruts) and a normal one (the pale ridges and flecks), the same marks
      const plan = treadPlans[bx] = treadPlan(), tx = treadTextures(plan), mk = (mat, dy, order) => { const t = new THREE.Mesh(new THREE.PlaneGeometry(14, 14).rotateX(-Math.PI / 2), mat); t.position.set(bx, y0 + dy, cfg.doorZ + .5 + 7); t.renderOrder = order === 2 ? 1 : order; t.receiveShadow = true; t.visible = DBG !== 'decals'; this.scene.add(t); };
      mk(new THREE.MeshBasicMaterial({ map: tx.mul, transparent: true, blending: THREE.MultiplyBlending, premultipliedAlpha: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }), .045, 1);
      mk(new THREE.MeshStandardMaterial({ map: tx.ridge, bumpMap: tx.bump, bumpScale: 3.2, roughness: 1, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -5, polygonOffsetUnits: -5 }), .05, 2); // (lit, with the height map: the sun and the shade catch the sides of the ruts, the ridges and the pebbles)
    }
    for (const bx of cfg.bays) { // the tracks go on into the bay, over the threshold plates and on the floor, fading with depth
      const it = interiorTrackTextures(treadPlans[bx]), mk = (tex, bump, w, d, y, zc) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: tex, bumpMap: bump, bumpScale: 3.2, roughness: 1, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 })); /* (lit and bumped like the outside ruts; the colours are dark so the light does not wash them out) */ m.position.set(bx, y0 + y, zc); m.renderOrder = 1; m.receiveShadow = true; m.visible = DBG !== 'decals'; this.scene.add(m); }; // (renderOrder 1: drawn before the smoke, explosions and flames, which are 3 and above: floor decals must not paint over them)
      const w = cfg.bayW - .35;
      mk(it.floor, it.floorBump, w, 5.04, .062, cfg.doorZ - .96 - 2.52);   // the floor, from the plates inward
      mk(it.plate, it.plateBump, w, 1.67, .102, cfg.doorZ - .96 + .835);   // the threshold plates (a little above them)
    }
    // ---- the generator, its cables, the gate's energy field
    // this.buildGenerator(cfg, y0); // (the generator and its cables: to come back later; the field goes out without it for now)
    const gate = cfg.gate;
    this.gateT = world.targets.find(t => t.object && Math.hypot(t.x - gate.x, t.z - gate.z) < 3 && t.bulletProof) ?? null;
    if (this.gateT) this.gateT.immune = true; // the energy field: nothing hurts the gate while the generator stands
    this.field = laserCurtain(gate.w - .2, [1, .5, .06]); this.field.group.position.set(gate.x, y0, gate.z + .45); this.scene.add(this.field.group); this.fieldK = 1; // (the stage 3 laser's curtain, in orange: a barrier that hurts nothing)
    const sg = cfg.secretGate; // the secret helipad's gate: protected by the same energy: its field goes out with the main one's, and then its doors open
    if (sg) {
      this.sgT = world.targets.find(t => t.object && Math.hypot(t.x - sg.x, t.z - sg.z) < 3 && t.bulletProof) ?? null; if (this.sgT) this.sgT.immune = true;
      this.sgOb = world.obstacles.find(o => o.kind === 'gate' && Math.hypot(o.x - sg.x, o.z - sg.z) < 3) ?? null;
      this.field2 = laserCurtain(sg.w - .2, [1, .5, .06], 2.6); this.field2.group.rotation.y = Math.PI / 2; this.field2.group.position.set(sg.x + .3, y0, sg.z); this.scene.add(this.field2.group);
    }
    this.buildHud();
  }

  // The roof's edge and cabling: a parapet all round, and a heavy cable along the front joining the transformers of the block (and, from its ends, running along the wall top to the gate's emitters).
  roofDeck(g, box, b, cfg, { steel, dark }) {
    const D = cfg.depth, zc = cfg.doorZ - D / 2, top = ROOF_Y + .175, W = b.x1 - b.x0, mx = (b.x0 + b.x1) / 2, lip = this.mats.lip ??= new THREE.MeshStandardMaterial({ color: 0x6f7273, roughness: .9 });
    box(W, .3, .24, lip, mx, top + .15, cfg.doorZ + .02); box(W, .3, .24, lip, mx, top + .15, cfg.doorZ - D - .02); // front and back parapet
    for (const sx of [b.x0 + .12, b.x1 - .12]) box(.24, .3, D, lip, sx, top + .15, zc);                              // and the two sides
    const cable = (xa, xb, y, z, r) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, xb - xa, 8).rotateZ(Math.PI / 2), dark); m.position.set((xa + xb) / 2, y, z); m.castShadow = true; g.add(m); };
    cable(b.x0 + 1, b.x1 - 1, top + .55, cfg.doorZ - 1.0, .1);
    for (let px = b.x0 + 1.5; px < b.x1 - 1; px += 2.2) box(.12, .5, .12, steel, px, top + .27, cfg.doorZ - 1.0, false);                    // its standoffs
    const glass = this.mats.roofGlass ??= new THREE.MeshStandardMaterial({ color: 0x8fb0c4, emissive: 0xffd6a0, emissiveIntensity: .5, roughness: .2, metalness: .3 }), conc = this.mats.concrete;
    [b.x0 + PILLAR / 2, mx, b.x1 - PILLAR / 2].forEach((px, i) => { // what stands on the roof over the pillars (the bays' own equipment is in the middle of each bay)
      for (const vz of [cfg.doorZ - 3, cfg.doorZ - 6.2]) { const v = new THREE.Mesh(new THREE.CylinderGeometry(.5, .56, .5, 14), steel); v.position.set(px, top + .25, vz); v.castShadow = true; g.add(v); const c = new THREE.Mesh(new THREE.CylinderGeometry(.42, .42, .06, 14), dark); c.position.set(px, top + .53, vz); g.add(c); const bl = new THREE.Mesh(new THREE.BoxGeometry(.9, .04, .12), dark); bl.position.set(px, top + .57, vz); g.add(bl); } // exhaust fans: housing, dark cap, a blade
      box(1.3, .4, 1.1, steel, px, top + .2, cfg.doorZ - 8.9); box(1.1, .06, .9, dark, px, top + .43, cfg.doorZ - 8.9, false); box(.4, .05, .06, dark, px, top + .47, cfg.doorZ - 8.5, false); // an access hatch with its handle
      if (i === 1) { box(1.7, .4, 1.1, conc, px, top + .2, cfg.doorZ - 1.9); box(1.45, .05, .85, glass, px, top + .42, cfg.doorZ - 1.9, false); } // a skylight over the middle pillar
      box(.3, .5, .3, steel, px + .9, top + .25, cfg.doorZ - 4.6);                                                  // a vent stack
    });
    for (let z = cfg.doorZ - 2; z > cfg.doorZ - D + 1; z -= .8) for (const px of [b.x0 + .9, b.x1 - .9]) box(.7, .05, .5, conc, px, top + .03, z, false); // a walkway of concrete pavers along each end of the roof
  }

  // The substation on the roof above a bay, laid out as three working sections along its length (not mirrored): at the back the PRIMARY step-down, two big transformers of different size; in the middle the SWITCHGEAR, a lineup of cabinets
  // and a capacitor bank; at the front DISTRIBUTION, small units and the conduit drops that feed down through the roof. Bus bars run on insulators over gantry frames, joined to the bushings by jumpers; cable trays on supports join the
  // sections; the pads stand inside a safety fence with a warning-painted deck. Each garage has its own, varied by seed (and every second one is laid out the other way round). It burns with the garage; the status lamp shows the garage's state.
  buildTransformer(g, cfg, y0) {
    const top = ROOF_Y + .175, r = seeded(WALL_SEED + 2000 + g.i * 17), pick = a => a[r() * a.length | 0], rr = (a, b) => a + r() * (b - a), zc = cfg.doorZ - 5.6, flip = g.i % 2 ? -1 : 1, grp = new THREE.Group(); grp.position.set(g.x, y0 + top, zc);
    const P = this.mats.xf ??= { body: (() => { const r3 = seeded(WALL_SEED + 3000); return [0x59615a, 0x6c7175, 0x4b5560, 0x6b6a58, 0x7a7f7c].map(c => plateTextures(c, r3)); })(), fin: new THREE.MeshStandardMaterial({ color: 0x3f4640, roughness: .42, metalness: .6, envMapIntensity: .6 }),
      porcelain: [0xb69b76, 0xd3d5d0].map(c => new THREE.MeshStandardMaterial({ color: c, roughness: .18, metalness: .1, envMapIntensity: .7 })), metal: new THREE.MeshStandardMaterial({ color: 0x2c2f31, roughness: .38, metalness: .8, envMapIntensity: .6 }), copper: new THREE.MeshStandardMaterial({ color: 0xa8643a, roughness: .28, metalness: .9, envMapIntensity: .8 }),
      yellow: new THREE.MeshStandardMaterial({ color: 0xd6b020, roughness: .45, metalness: .3, envMapIntensity: .4 }), cable: new THREE.MeshStandardMaterial({ color: 0x151515, roughness: .35, metalness: .4, envMapIntensity: .4 }), galv: new THREE.MeshStandardMaterial({ color: 0x9aa0a4, roughness: .35, metalness: .8, envMapIntensity: .8 }), cap: new THREE.MeshStandardMaterial({ color: 0x7f9bb0, roughness: .3, metalness: .45, envMapIntensity: .6 }) };
    const fenceMat = this.mats.fence ??= (() => { const t = new THREE.CanvasTexture(chainLink()); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(2.1 / 1.04, 1 / 1.04); t.anisotropy = 8; return new THREE.MeshStandardMaterial({ map: t, alphaTest: .3, alphaToCoverage: true, side: THREE.DoubleSide, roughness: .4, metalness: .7, envMapIntensity: .6 }); })();
    const X = x => x * flip, V = (x, y, z) => new THREE.Vector3(X(x), y, z);
    const addRaw = (o, geo, mat, x, y, z, cast = true) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = cast; m.receiveShadow = true; o.add(m); return m; };
    const add = (o, geo, mat, x, y, z, cast = true) => addRaw(o, geo, mat, X(x), y, z, cast); // (x here is the design's; the layout may be mirrored)
    const link = (a, b, rad = .05, mat = P.cable) => { const d = b.clone().sub(a), len = d.length(), m = new THREE.Mesh(new THREE.CylinderGeometry(rad, rad, len, 6), mat); m.position.copy(a).add(b).multiplyScalar(.5); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()); m.castShadow = true; grp.add(m); }; // a cable or jumper between two points
    const bushing = (ad, mat, x, y, z, h, sheds) => { ad(new THREE.CylinderGeometry(.06, .08, h, 8), mat, x, y + h / 2, z, false); for (let k = 0; k < sheds; k++) ad(new THREE.CylinderGeometry(.15, .15, .035, 10), mat, x, y + .2 + k * (h - .3) / Math.max(1, sheds - 1), z, false); ad(new THREE.CylinderGeometry(.09, .09, .08, 8), P.metal, x, y + h + .04, z, false); };
    const BAR_Y = 3.5, tops = [];                                                                       // the bus bars' height; the bushing caps the jumpers start from
    // ---- pads: one under each section, a little raised
    for (const [z0, z1] of [[-3.7, -1.2], [-.5, 1.6], [2.2, 3.7]]) add(grp, new THREE.BoxGeometry(5.5, .14, z1 - z0), this.mats.concrete, 0, .07, (z0 + z1) / 2, false);
    // ---- PRIMARY (back): two big pad-mount transformers, one larger than the other
    for (const [x, k] of [[-1.35, rr(1.25, 1.4)], [1.55, rr(1.05, 1.2)]]) {
      const u = new THREE.Group(); u.position.set(X(x), .14, -2.45); u.scale.setScalar(k); grp.add(u);
      const body = pick(P.body), por = pick(P.porcelain), ad = (geo, mat, x2, y, z, cast = true) => { const m = new THREE.Mesh(geo, mat); m.position.set(x2, y, z); m.castShadow = cast; m.receiveShadow = true; u.add(m); };
      ad(new THREE.BoxGeometry(1.5, .95, 1.0), body.arr, 0, .52, 0);
      for (let i = 0, n = 8 + (r() * 4 | 0); i < n; i++) for (const sz of [-1, 1]) ad(new THREE.BoxGeometry(.06, .75, .2), P.fin, -.65 + i * 1.3 / (n - 1), .52, sz * .6, false);
      for (const sx of [-1, 1]) { for (let i = 0; i < 9; i++) ad(new THREE.BoxGeometry(.05, .8, .42), P.fin, sx * .98, .55, -.4 + i * .1, false); for (const y of [.14, .97]) ad(new THREE.BoxGeometry(.16, .08, .95), P.metal, sx * .98, y, 0, false); } // a radiator bank of vertical ribs at each end, with its headers
      ad(new THREE.CylinderGeometry(.22, .22, 1.4, 12).rotateZ(Math.PI / 2), body.side, 0, 1.3, -.3); for (const sx of [-.5, .5]) ad(new THREE.BoxGeometry(.1, .35, .1), P.metal, sx, 1.0, -.3, false); // the conservator
      for (let i = 0; i < 3; i++) { const bx = -.45 + i * .45; bushing(ad, por, bx, 1.0, .25, .55, 3); tops.push(new THREE.Vector3(bx, 1.64, .25).multiplyScalar(k).add(u.position)); } // (the caps, in the roof group's space)
    }
    // ---- gantries over the middle of the pad (posts, a cross beam, insulator posts), and the three bus bars on them, running the whole length
    const gz = [-1.0, 2.0], bars = [-.55, 0, .55].map(x => x + .1);
    for (const z of gz) {
      for (const sx of [-2.65, 2.65]) add(grp, new THREE.BoxGeometry(.14, 3.0, .14), P.galv, sx, 1.5, z); // the two posts
      add(grp, new THREE.BoxGeometry(5.4, .14, .14), P.galv, 0, 3.0, z); for (const sx of [-1, 1]) link(V(sx * 2.65, 2.0, z), V(sx * 1.9, 3.0, z), .035, P.galv); // the beam and a brace at each end
      for (const bx of bars) { add(grp, new THREE.CylinderGeometry(.07, .09, .45, 8), pick(P.porcelain), bx, 3.3, z, false); for (const dy of [3.18, 3.3, 3.42]) add(grp, new THREE.CylinderGeometry(.14, .14, .03, 10), P.porcelain[0], bx, dy, z, false); } // insulator posts
    }
    for (const bx of bars) link(V(bx, BAR_Y, -2.7), V(bx, BAR_Y, 3.4), .06);  // the bus bars, black, on the insulators
    tops.sort((a, b) => a.x - b.x).forEach((t, i) => { const bar = V(bars[i % 3], BAR_Y, -2.7 + (i < 3 ? 0 : .5)); link(t, new THREE.Vector3(t.x, BAR_Y - .15, t.z), .04); link(new THREE.Vector3(t.x, BAR_Y - .15, t.z), bar, .045); }); // jumpers from the bushings up to the bars
    // ---- SWITCHGEAR (middle): a lineup of tall cabinets, and a capacitor bank in a frame
    const nCab = 3 + (r() * 2 | 0); let cx = -2.45;
    for (let i = 0; i < nCab; i++) { const w = rr(.9, 1.15); add(grp, new THREE.BoxGeometry(w, 1.9, .8), pick(P.body).arr, cx + w / 2, 1.09, .55); for (let k = 0; k < 5; k++) add(grp, new THREE.BoxGeometry(w - .25, .05, .05), P.fin, cx + w / 2, .55 + k * .12, .96, false); add(grp, new THREE.BoxGeometry(.04, 1.7, .05), P.metal, cx + w / 2, 1.09, .96, false); if (r() < .6) add(grp, new THREE.BoxGeometry(.2, .2, .03), P.yellow, cx + w / 2 + w * .25, 1.7, .97, false); cx += w + .04; }
    const capX = 1.55, capCols = 2 + (r() * 2 | 0); // a capacitor bank: a steel frame of two shelves holding rows of blue cylinders
    for (const sx of [-1, 1]) for (const sz of [-.55, .55]) add(grp, new THREE.BoxGeometry(.07, 1.5, .07), P.galv, capX + sx * .7, .89, .55 + sz, false);
    for (const y of [.5, 1.1]) add(grp, new THREE.BoxGeometry(1.5, .06, 1.2), P.galv, capX, y, .55, false);
    for (const y of [.5, 1.1]) for (let i = 0; i < 4; i++) for (let j = 0; j < capCols; j++) add(grp, new THREE.CylinderGeometry(.14, .14, .5, 10), P.cap, capX - .55 + i * .37, y + .28, .55 - .4 + j * (.8 / Math.max(1, capCols - 1)), false);
    for (const [bx, cxp] of [[bars[0], -1.4], [bars[1], -.4], [bars[2], capX]]) link(V(bx, BAR_Y, .55), V(cxp, 2.2 + (cxp > 1 ? -.55 : 0), .55), .05); // drops from the bars to the equipment
    // ---- DISTRIBUTION (front): a few small units (a pad-mount tank, a drum, a cabinet), and the roof penetrations the cables go down through
    add(grp, new THREE.BoxGeometry(1.5, .85, .9), pick(P.body).arr, -1.7, .56, 3.0); for (let i = 0; i < 6; i++) for (const sz of [-1, 1]) add(grp, new THREE.BoxGeometry(.06, .65, .2), P.fin, -2.25 + i * .22, .56, 3.0 + sz * .55, false);
    add(grp, new THREE.CylinderGeometry(.45, .45, .9, 14), pick(P.body).side, -.1, .9, 3.0); bushing((geo, mat, x, y, z, c) => add(grp, geo, mat, x, y, z, c), pick(P.porcelain), -.1, 1.35, 3.0, .6, 3);
    for (const [px, pz] of [[1.0, 2.9], [1.75, 3.15], [2.25, 2.8]]) { // roof penetrations: a curb, a flange and a pipe sleeve where the cable goes down
      add(grp, new THREE.BoxGeometry(.6, .32, .6), this.mats.concrete, px, .16, pz); add(grp, new THREE.CylinderGeometry(.2, .2, .1, 12), P.metal, px, .37, pz, false); add(grp, new THREE.CylinderGeometry(.13, .13, .7, 10), P.metal, px, .75, pz, false);
      link(V(px, 1.1, pz), V(px, 1.5, pz - .4), .05); // the cable bending into the sleeve
    }
    // ---- raised cable trays on supports: a long one down the right edge, a branch at each section
    const tray = (xa, za, xb, zb, y) => {
      const alongX = Math.abs(xb - xa) > Math.abs(zb - za), len = alongX ? Math.abs(xb - xa) : Math.abs(zb - za), cxm = (xa + xb) / 2, czm = (za + zb) / 2, W = .5;
      for (const s of [-1, 1]) add(grp, alongX ? new THREE.BoxGeometry(len, .12, .05) : new THREE.BoxGeometry(.05, .12, len), P.galv, cxm + (alongX ? 0 : s * W / 2), y, czm + (alongX ? s * W / 2 : 0), false); // side rails
      for (let t = .2; t < len; t += .45) add(grp, alongX ? new THREE.BoxGeometry(.04, .03, W) : new THREE.BoxGeometry(W, .03, .04), P.galv, alongX ? Math.min(xa, xb) + t : cxm, y - .03, alongX ? czm : Math.min(za, zb) + t, false); // rungs
      link(alongX ? V(Math.min(xa, xb) + .1, y + .06, czm) : V(cxm, y + .06, Math.min(za, zb) + .1), alongX ? V(Math.max(xa, xb) - .1, y + .06, czm) : V(cxm, y + .06, Math.max(za, zb) - .1), .035); // the cable lying in it
      for (let t = .3; t < len; t += 1.6) for (const s of [-1, 1]) add(grp, new THREE.BoxGeometry(.05, y, .05), P.galv, alongX ? Math.min(xa, xb) + t : cxm + s * W / 2, y / 2, alongX ? czm + s * W / 2 : Math.min(za, zb) + t, false);
    };
    tray(2.5, -3.3, 2.5, 3.4, .5); tray(-2.4, 1.55, 2.5, 1.55, .45); tray(.4, 2.45, 2.5, 2.45, .45);
    // ---- the safety fence round the equipment: posts, two yellow rails and chain-link panels, a gap at the front for the way in
    const fx0 = -2.95, fx1 = 2.95, fz0 = -3.95, fz1 = 3.85;
    const panel = (xa, za, xb, zb) => { const len = Math.hypot(xb - xa, zb - za), n = Math.max(1, Math.round(len / 2.1)); for (let i = 0; i < n; i++) { const t0 = i / n, t1 = (i + 1) / n, xm = xa + (xb - xa) * (t0 + t1) / 2, zm = za + (zb - za) * (t0 + t1) / 2, seg = len / n;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(seg, 1.0), fenceMat); m.position.set(X(xm), .62, zm); m.rotation.y = Math.abs(xb - xa) > Math.abs(zb - za) ? 0 : Math.PI / 2; grp.add(m);
      for (const t of [t0, t1]) add(grp, new THREE.BoxGeometry(.07, 1.15, .07), P.yellow, xa + (xb - xa) * t, .6, za + (zb - za) * t, false);
      for (const y of [.55, 1.15]) add(grp, alongXy(xb - xa, zb - za, seg), P.yellow, xm, y, zm, false); } };
    const alongXy = (dx, dz, len) => Math.abs(dx) > Math.abs(dz) ? new THREE.BoxGeometry(len, .05, .05) : new THREE.BoxGeometry(.05, .05, len);
    panel(fx0, fz0, fx1, fz0); panel(fx0, fz0, fx0, fz1); panel(fx1, fz0, fx1, fz1); panel(fx0, fz1, -.75, fz1); panel(.75, fz1, fx1, fz1); // (the front is open between x -0.75 and 0.75)
    // ---- the status lamp on its post at the fence corner
    add(grp, new THREE.CylinderGeometry(.05, .05, 1.0, 6), P.metal, fx0, .5, fz1, false);
    g.xfLamp = new THREE.MeshStandardMaterial({ color: 0x103018, emissive: 0x30ff60, emissiveIntensity: 1.6, roughness: .3 });
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(.13, 10, 8), g.xfLamp); lamp.name = 'lamp'; lamp.position.set(X(fx0), 1.1, fz1); grp.add(lamp);
    this.scene.add(mergeStatic(grp)); g.xf = grp; g.flip = flip; g.xfAt = new THREE.Vector3(g.x, y0 + top + 1.2, zc);
    // ---- high-voltage warning paint on the deck: a hazard-striped border, DANGER / HIGH VOLTAGE and warning triangles
    const dm = new THREE.MeshStandardMaterial({ map: warnTexture(), transparent: true, depthWrite: false, roughness: .9, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
    const deck = new THREE.Mesh(new THREE.PlaneGeometry(6.0, 8.8).rotateX(-Math.PI / 2), dm); deck.position.set(g.x, y0 + top + .018, zc + .1); deck.renderOrder = 2; if (DBG === 'decals') deck.visible = false; deck.receiveShadow = true; this.scene.add(deck); g.deck = deck;
  }

  // What is left of garage g's substation once it has burnt: a scorched deck, split transformer husks, burnt cabinets, capacitor cans lying about, a gantry fallen with its bus bars drooping, shards of porcelain, a bent fence and glowing embers.
  ruin(g) {
    const roofY = g.xfAt.y - 1.2, f = g.flip ?? 1, R = (a = 1, o = 0) => o + Math.random() * a, grp = new THREE.Group(); grp.position.set(g.x, roofY, g.xfAt.z);
    const M = this.mats.ruin ??= { char: new THREE.MeshStandardMaterial({ color: 0x1d1c1b, roughness: .85, metalness: .35 }), burnt: new THREE.MeshStandardMaterial({ color: 0x302b27, roughness: .9, metalness: .25 }), rust: new THREE.MeshStandardMaterial({ color: 0x55321f, roughness: .85, metalness: .4 }),
      inner: new THREE.MeshStandardMaterial({ color: 0x3b3531, roughness: .95 }), por: [0xb0a07f, 0x6e6657].map(c => new THREE.MeshStandardMaterial({ color: c, roughness: .6 })), green: new THREE.MeshStandardMaterial({ color: 0x3e5a4a, roughness: .6, metalness: .6 }),
      blue: new THREE.MeshStandardMaterial({ color: 0x283038, roughness: .6, metalness: .4 }), yellow: new THREE.MeshStandardMaterial({ color: 0x7a6414, roughness: .7 }), ember: new THREE.MeshStandardMaterial({ color: 0x301000, emissive: 0xff5a10, emissiveIntensity: 2, roughness: .8 }) };
    const bx = (w, h, d, mat, x, y, z, rx = 0, ry = 0, rz = 0) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x * f, y, z); m.rotation.set(rx, ry, rz); m.castShadow = m.receiveShadow = true; grp.add(m); return m; };
    const cyl = (r0, r1, h, mat, x, y, z, rx = 0, ry = 0, rz = 0) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(r0, r1, h, 8), mat); m.position.set(x * f, y, z); m.rotation.set(rx, ry, rz); m.castShadow = true; grp.add(m); return m; };
    for (const [z0, z1] of [[-3.7, -1.2], [-.5, 1.6], [2.2, 3.7]]) bx(5.4 + R(.2), .08, z1 - z0 - .1, M.burnt, R(.3, -.15), .06, (z0 + z1) / 2, 0, R(.06, -.03), 0); // the pads, scorched and a little shifted
    for (const x of [-1.35, 1.55]) { // the two big transformers: a split husk each: a floor, one side blown flat, one hanging, the end gone, a blackened core, a ring of burnt winding
      bx(1.7, .1, 1.1, M.char, x, .14, -2.45); bx(1.5, .9, .06, M.burnt, x, .32, -1.55, -1.15, 0, R(.1, -.05)); bx(1.5, .85, .06, M.burnt, x + .2, .1, -3.4, 1.5, R(.2, -.1), 0); bx(.06, .9, 1.0, M.burnt, x - .85, .5, -2.45, 0, 0, .28 * (x > 0 ? 1 : -1));
      bx(1.1, .5, .7, M.inner, x, .4, -2.45, R(.2, -.1), R(.4, -.2), R(.2, -.1)); for (let k = 0; k < 2; k++) { const t = new THREE.Mesh(new THREE.TorusGeometry(.3 + k * .06, .07, 6, 14), k ? M.green : M.rust); t.position.set((x + R(.5, -.25)) * f, .3, -2.45 + R(.4, -.2)); t.rotation.set(Math.PI / 2 + R(.4, -.2), 0, R(1)); t.castShadow = true; grp.add(t); }
      for (let k = 0; k < 6; k++) bx(.05, .55, .38, M.char, x + R(2.2, -1.1), .35, -2.45 + R(2.4, -1.2), R(1.4, -.7), R(1), R(1.4, -.7)); // bent cooling ribs
    }
    for (const x of [-2.2, -1.15, -.1]) { bx(.9, .15, .7, M.char, x, .12, .55); bx(.85, 1.1, .7, M.inner, x + R(.1, -.05), .62, .45, R(.2, -.1), R(.3, -.15), R(.3, -.15)); bx(.8, 1.5, .05, M.burnt, x + .2, .55, 1.15, -1.0 - R(.4), R(.3, -.15), 0); } // the cabinets: burnt shells with their doors hanging
    bx(1.5, .06, 1.2, M.char, 1.55, .13, .55, .1, 0, .16); // the capacitor shelf, tilted
    for (let i = 0; i < 9; i++) { const lying = Math.random() < .65; cyl(.14, .14, lying ? .5 : .28, M.blue, 1.0 + R(1.2), lying ? .16 : .17, .0 + R(1.2), lying ? Math.PI / 2 : 0, 0, lying ? R(3) : R(.3, -.15)); } // the cans: most knocked flat
    bx(.14, 3.0, .14, M.char, .3, .15, -1.0, 0, 0, Math.PI / 2 - .06); bx(.14, 1.1, .14, M.burnt, 2.65, .55, 2.0, 0, 0, .22); bx(5.4, .14, .14, M.burnt, -.2, .4, 2.2, .08, .35, .2); bx(.14, 1.6, .14, M.char, -2.65, .8, -1.0, 0, 0, -.5); // the gantry down: a post lying across, one stump, the beam fallen at an angle
    for (const bxp of [-.45, .1, .65]) { const a = new THREE.Vector3(bxp * f, 2.4, -2.7), m = new THREE.Vector3((bxp + R(.8, -.4)) * f, 1.0, -.4), b = new THREE.Vector3((bxp + R(1.6, -.8)) * f, .12, 2.6 + R(.8)); const t = new THREE.Mesh(new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(a, m, b), 16, .06, 5), M.char); t.castShadow = true; grp.add(t); } // bus bars hanging from their broken ends to the deck
    for (let i = 0; i < 18; i++) { const sh = new THREE.Mesh(shardGeometry(R(.3, .1), R(.07, .03), R(.25, .1)), M.por[Math.random() < .5 ? 0 : 1]); sh.position.set(R(5.2, -2.6) * f, .08 + R(.1), R(7.2, -3.6)); sh.rotation.set(R(3), R(3), R(3)); sh.castShadow = true; grp.add(sh); } // porcelain shards
    for (let i = 0; i < 6; i++) cyl(.08, .1, R(.4, .12), M.por[1], (i % 2 ? -1.35 : 1.55) + R(1.1, -.55), .25, -2.2 + R(.9, -.45), R(.3, -.15), 0, R(.3, -.15)); // snapped bushing stumps
    for (let i = 0; i < 9; i++) { const px = i < 4 ? -2.95 : i < 7 ? 2.95 : R(5.4, -2.7), pz = i < 4 ? -3.9 + i * 2.6 : i < 7 ? -3.2 + (i - 4) * 3 : R(1) < .5 ? -3.95 : 3.85, tall = Math.random() < .4; bx(.07, tall ? 1.15 : .4, .07, M.yellow, px, tall ? .55 : .2, pz, 0, 0, R(1.2, -.6)); } // fence posts, bent, snapped or standing
    for (const [px, pz] of [[-2.9, -1.5], [2.7, 1.0]]) { const pn = new THREE.Mesh(new THREE.PlaneGeometry(2.1, 1.0), this.mats.fence); pn.position.set(px * f, .12, pz); pn.rotation.set(-Math.PI / 2 + R(.2, -.1), 0, R(.4, -.2)); pn.castShadow = false; grp.add(pn); } // two chain-link panels flat on the deck
    for (let i = 0; i < 16; i++) bx(R(.3, .12), R(.18, .06), R(.3, .12), M.ember, R(5, -2.5), .12 + R(.1), R(7, -3.5), R(3), R(3), R(3)); // embers, still glowing
    this.scene.add(mergeStatic(grp)); g.ruinGroup = grp;
    { // the burnt patch on the roof: set in the roof's shader (see patchWallMaterial), growing in over a second or so
      const bl = (this.burns ?? []).find(q => g.x > q.block.x0 && g.x < q.block.x1), idx = bl ? this.cfg.bays.filter(x => x > bl.block.x0 && x < bl.block.x1).indexOf(g.x) : -1;
      if (bl && idx >= 0) { bl.uBurn.value[idx].set(g.x, g.xfAt.z + .1, 3.1, 4.5); g.burnRef = { bl, idx }; g.burnK = 0; }
    }
    return M;
  }

  // The inside of a destroyed garage: the floor broken and blackened (cracks, a crater, chips, pools, skid marks), rubble and burnt slabs lying about, the crane's beam come down, rails bent up, a few glowing embers.
  bayRuin(g) {
    const cfg = this.cfg, D = cfg.depth, zc = cfg.doorZ - D / 2, M = this.mats.ruin, R = (a = 1, o = 0) => o + Math.random() * a, grp = new THREE.Group(); grp.position.set(g.x, g.y0, zc);
    const crane = this.mats.craneBurnt ??= new THREE.MeshStandardMaterial({ color: 0x5a4710, roughness: .75, metalness: .4 });
    const add = (geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); m.castShadow = m.receiveShadow = true; grp.add(m); return m; };
    for (let i = 0; i < 14; i++) { const c = add(new THREE.DodecahedronGeometry(R(.28, .08), 0), [M.char, M.burnt, M.inner][i % 3], R(5, -2.5), .12, R(8.2, -4.1)); c.scale.set(1, R(.8, .4), R(.6, .6)); c.rotation.set(R(3), R(3), R(3)); } // chunks of concrete and brick
    for (let i = 0; i < 5; i++) add(new THREE.BoxGeometry(R(1.2, .6), .07, R(.8, .4)), i % 2 ? M.burnt : M.char, R(4.6, -2.3), .1 + R(.1), R(7, -3.5), R(.25, -.12), R(3), R(.25, -.12)); // burnt ceiling panels, come down
    add(new THREE.BoxGeometry(cfg.bayW - .8, .4, .4), crane, .2, .45, cfg.doorZ - 4.5 - zc, R(.1, -.05), R(.5, -.25), .08); // the crane beam, fallen across the bay
    add(new THREE.BoxGeometry(.8, .5, .7), M.char, 1.2, .3, cfg.doorZ - 3.6 - zc, .2, .4, .1); add(new THREE.CylinderGeometry(.05, .05, 2.2, 6), M.char, -.8, .15, cfg.doorZ - 5.6 - zc, 0, 0, Math.PI / 2 - .1); // its trolley and chain
    for (const sx of [-1.5, 1.5]) add(new THREE.BoxGeometry(.12, .06, 3.2), M.char, sx + R(.4, -.2), .12, R(2, -1), R(.25, -.1), R(.3, -.15), 0); // guide rails, bent up
    for (let i = 0; i < 9; i++) add(new THREE.BoxGeometry(R(.2, .08), R(.14, .06), R(.2, .08)), M.ember, R(5, -2.5), .1 + R(.06), R(8, -4), R(3), R(3), R(3)); // embers
    this.scene.add(mergeStatic(grp));
    const fl = new THREE.Mesh(new THREE.PlaneGeometry(cfg.bayW - .2, D - .4).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: floorDamageTexture(), transparent: true, depthWrite: false, roughness: .7, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }));
    fl.position.set(g.x, g.y0 + .08, zc); fl.renderOrder = 1; if (DBG === 'decals') fl.visible = false; fl.receiveShadow = true; this.scene.add(fl);
  }

  buildGarage(i, x, cfg, y0) {
    const W = cfg.bayW - .35, g = { i, x, y0, state: 'closed', p: 0, t: 0, hits: 0, dead: false, hold: 0 };
    const doorMat = new THREE.MeshStandardMaterial({ map: doorTexture(), roughness: .55, metalness: .55 }), beamMat = new THREE.MeshStandardMaterial({ color: 0x3d4a40, roughness: .5, metalness: .6 });
    const door = new THREE.Group(); door.name = 'door'; door.position.set(x, y0, cfg.doorZ - .15); this.scene.add(door); g.door = door;
    { // the slot the door sinks into: a dark recess (a slab just above the ground, which hides the door below it) between raised steel threshold plates with hazard edges, so the door goes down into a pit and not into solid ground
      const sw = cfg.bayW - .25, slot = new THREE.Group(); slot.position.set(x, y0, cfg.doorZ - .15);
      const pm = this.mats.tread ??= new THREE.MeshStandardMaterial({ map: checkerTexture(), roughness: .5, metalness: .6, envMapIntensity: .5 }), dk = this.mats.slotDark ??= new THREE.MeshStandardMaterial({ color: 0x07080a, roughness: .9 });
      const hz = this.mats.slotHazard ??= new THREE.MeshStandardMaterial({ map: hazardTexture(), roughness: .6 });
      const pb = (w, h, d, mat, px, py, pz, rep) => { const geo = new THREE.BoxGeometry(w, h, d); if (rep) { const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w / .5, uv.getY(i) * d / .5); } const m = new THREE.Mesh(geo, mat); m.position.set(px, py, pz); m.receiveShadow = true; m.castShadow = true; slot.add(m); return m; };
      pb(sw, .024, .62, dk, 0, .012, 0);                                                          // the recess: dark, flush with the plates' lower edge
      pb(sw + .5, .08, .55, pm, 0, .04, .31 + .275, true); pb(sw + .5, .08, .5, pm, 0, .04, -.31 - .25, true); // threshold plates in front of and behind it
      for (const sx of [-1, 1]) pb(.25, .08, .62, pm, sx * (sw / 2 + .125), .04, 0, true);        // and at its ends
      for (const [pz, wz] of [[.31 + .02, .1], [-.31 - .02, .1]]) { const hm = pb(sw, .012, wz, hz, 0, .086, pz, false); hm.material = hz; hm.geometry.attributes.uv.array.forEach((v, i) => { if (i % 2 === 0) hm.geometry.attributes.uv.array[i] = v * sw / 1.2; }); hm.castShadow = false; } // hazard stripes along its two edges
      this.scene.add(mergeStatic(slot));
    }
    const slab = new THREE.Mesh(new THREE.BoxGeometry(W, DOOR_H, .5), doorMat); slab.position.y = DOOR_H / 2; slab.castShadow = slab.receiveShadow = true; door.add(slab);
    for (const yy of [.55, DOOR_H / 2, DOOR_H - .45]) { const r = new THREE.Mesh(new THREE.BoxGeometry(W + .1, .22, .12), beamMat); r.position.set(0, yy, .3); r.castShadow = true; door.add(r); } // reinforcing beams across the face
    for (const sx of [-1, 1]) { const r = new THREE.Mesh(new THREE.BoxGeometry(.28, DOOR_H, .16), beamMat); r.position.set(sx * (W / 2 - .12), DOOR_H / 2, .32); r.castShadow = true; door.add(r); }
    const soot = new THREE.Mesh(new THREE.PlaneGeometry(W - .2, DOOR_H - .2), new THREE.MeshBasicMaterial({ map: sootTexture(), transparent: true, opacity: 0, depthWrite: false })); soot.position.set(0, DOOR_H / 2, .4); soot.name = 'soot'; door.add(soot);
    g.slab = slab; g.soot = soot; g.doorMat = doorMat;
    g.lampMat = new THREE.MeshStandardMaterial({ color: 0x401010, emissive: 0xff2010, emissiveIntensity: 0, roughness: .4 });
    g.lamps = [-1, 1].map(s => { const l = new THREE.Mesh(new THREE.SphereGeometry(.2, 10, 8), g.lampMat); l.name = 'lamp'; l.position.set(x + s * (W / 2 - .5), y0 + DOOR_H + .55, cfg.doorZ + .43); this.scene.add(l); const hs = new THREE.Mesh(new THREE.CylinderGeometry(.26, .26, .12, 12).rotateX(Math.PI / 2), this.mats.dark); hs.position.set(l.position.x, l.position.y, cfg.doorZ + .36); this.scene.add(hs); return l; }); // (on the lintel's face, below the windows' sill, each with a dark housing)
    g.mouth = { x, z: cfg.doorZ - .2, hw: W / 2, hd: .5, alive: true, kind: 'blocker' }; this.world.obstacles.push(g.mouth); // (the bay's mouth: nothing drives in. It is opened only while a vehicle of its own rolls out, and shut again behind it)
    this.world.obstacles.push({ x, z: cfg.doorZ - .2, hw: W / 2, hd: .5, alive: true, kind: 'blocker', playerOnly: true }); // (the mouth of the bay: the player's jeep never drives in, door open, door gone or not; the vehicles from inside pass)
    g.blocker = { x, z: cfg.doorZ - .15, hw: W / 2, hd: .4, alive: true, kind: 'blocker' }; this.world.obstacles.push(g.blocker); // (the shut door: nothing drives through it)
    g.target = { object: door, x, z: cfg.doorZ + .6, hw: W / 2, hd: 1.2, r: 2.6, hp: GARAGE_HP, score: 1000, immune: true, bulletProof: true, boom: true, oncePerVolley: true, // (oncePerVolley: a rocket and the shots it splits into hurt a garage once, not each)
      
      onHurt: () => this.hurt(g), wreck: () => this.destroy(g) };
    this.world.targets.push(g.target);
    { // the bay's soot: floor, back wall, both side walls and the ceiling, invisible until the garage is hit
      const D = cfg.depth, zc = cfg.doorZ - D / 2, H = ROOF_Y - .4, tx = scorchTexture();
      const mk = (w, h, rot, px, py, pz) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: tx, transparent: true, opacity: 0, depthWrite: false, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })); rot(m); m.position.set(px, py, pz); m.renderOrder = 1; this.scene.add(m); return m; };
      g.scorch = [mk(cfg.bayW - .2, D - .4, m => m.rotation.x = -Math.PI / 2, x, y0 + .07, zc),                         // floor
        mk(cfg.bayW - .2, H, () => {}, x, y0 + H / 2, cfg.doorZ - D + .39),                                              // back wall
        mk(D - .4, H, m => m.rotation.y = Math.PI / 2, x - cfg.bayW / 2 + .02, y0 + H / 2, zc),                          // left wall (facing in)
        mk(D - .4, H, m => m.rotation.y = -Math.PI / 2, x + cfg.bayW / 2 - .02, y0 + H / 2, zc),                         // right wall
        mk(cfg.bayW - .2, D - .4, m => m.rotation.x = Math.PI / 2, x, y0 + ROOF_Y - .39, zc)];                           // ceiling
    }
    return g;
  }

  buildGenerator(cfg, y0) {
    const { generator: gn, gate, bays } = cfg, grp = new THREE.Group(); grp.position.set(gn.x, y0, gn.z);
    const { concrete, dark, steel } = this.mats;
    const copper = new THREE.MeshStandardMaterial({ color: 0x8a5a36, roughness: .4, metalness: .8 });
    this.coilMat = new THREE.MeshStandardMaterial({ color: 0x103040, emissive: 0x33ccff, emissiveIntensity: 1.6, roughness: .3 });
    const add = (geo, mat, x, y, z, cast = true) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = cast; m.receiveShadow = true; grp.add(m); return m; };
    add(new THREE.BoxGeometry(5, .6, 4), concrete, 0, .3, 0);                                   // plinth
    add(new THREE.CylinderGeometry(1.5, 1.7, 2.4, 20), dark, 0, 1.8, 0);                       // the dynamo's drum
    for (let k = 0; k < 4; k++) add(new THREE.TorusGeometry(1.62, .09, 6, 24), steel, 0, 1.1 + k * .6, 0).rotation.x = Math.PI / 2; // cooling rings
    add(new THREE.CylinderGeometry(.5, .6, 1.6, 14), copper, 0, 3.8, 0);                       // the coil's core
    for (let k = 0; k < 3; k++) { const c = add(new THREE.TorusGeometry(.62 + k * .02, .1, 8, 18), this.coilMat, 0, 3.2 + k * .5, 0, false); c.rotation.x = Math.PI / 2; } // the glowing windings
    for (const sx of [-1, 1]) { add(new THREE.CylinderGeometry(.18, .26, 2.8, 8), steel, sx * 2, 1.9, 1.2); add(new THREE.SphereGeometry(.34, 12, 10), this.coilMat, sx * 2, 3.5, 1.2, false); } // two insulator posts
    this.scene.add(mergeStatic(grp)); this.gen = grp;
    this.genTop = new THREE.Vector3(gn.x, y0 + 4.2, gn.z);
    // cables: from the generator over the wall to each garage block's roof and to the gate's two posts, glowing while there is power
    this.cableMat = new THREE.MeshStandardMaterial({ color: 0x0b2030, emissive: 0x33ccff, emissiveIntensity: 1.2, roughness: .4 });
    const run = (a, b) => { const mid = a.clone().lerp(b, .5); mid.y += 1.2; const c = new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(a, mid, b), 18, .09, 6); const m = new THREE.Mesh(c, this.cableMat); m.castShadow = false; this.scene.add(m); };
    for (const b of cfg.blocks) run(this.genTop.clone().add(new THREE.Vector3(0, -.3, 0)), new THREE.Vector3((b.x0 + b.x1) / 2, y0 + ROOF_Y + .6, cfg.doorZ - cfg.depth / 2));
    for (const sx of [-1, 1]) run(this.genTop.clone().add(new THREE.Vector3(sx * .3, -.3, .5)), new THREE.Vector3(gate.x + sx * (gate.w / 2 - .7), y0 + 3.6, gate.z));
  }

  // ---- HUD: the garages still standing and the power
  buildHud() {
    const root = document.createElement('div');
    Object.assign(root.style, { position: 'fixed', zIndex: 5, pointerEvents: 'none', top: '14px', left: '50%', transform: 'translateX(-50%)', display: 'none', flexDirection: 'column', alignItems: 'center', gap: '6px',
      font: '700 14px/1 "Courier New", monospace', color: '#ffe8b4', letterSpacing: '.18em', textShadow: '-1px -1px 0 #0b0e06, 1px -1px 0 #0b0e06, -1px 1px 0 #0b0e06, 1px 1px 0 #0b0e06, 0 2px 3px rgba(0,0,0,.8)' });
    const row = document.createElement('div'), power = document.createElement('div');
    row.style.display = 'flex'; row.style.gap = '10px'; power.style.fontSize = '12px';
    const cells = this.garages.map((g, i) => { const c = document.createElement('div'); Object.assign(c.style, { width: 'min(70px, 12vw)', height: '12px', background: 'rgba(11,14,6,.75)', border: '2px solid #e8b877', boxShadow: '0 0 0 2px #0b0e06', position: 'relative' }); const f = document.createElement('div'); Object.assign(f.style, { position: 'absolute', inset: 0, transition: 'width .25s, background .25s' }); c.appendChild(f); const slot = document.createElement('div'), label = document.createElement('div'); Object.assign(slot.style, { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }); label.textContent = `GARAGE ${i + 1}`; label.style.fontSize = '12px'; slot.append(c, label); row.appendChild(slot); f._slot = slot; f._label = label; return f; }); // (each bar with its name under it)
    root.append(row); (document.getElementById('frame') ?? document.body).appendChild(root); this.hud = { root, cells, power };
  }
  updateHud() {
    const h = this.hud; if (!h) return;
    h.root.style.display = this.state === 'wait' || this.state === 'done' ? 'none' : 'flex';
    this.garages.forEach((g, i) => { const f = g.dead ? 0 : Math.max(0, g.target.hp / GARAGE_HP); h.cells[i].style.width = (f * 100).toFixed(0) + '%'; h.cells[i].style.background = `hsl(${(108 * f).toFixed(0)}, 70%, 48%)`; h.cells[i]._slot.style.opacity = g.dead ? '.45' : '1'; h.cells[i]._label.style.textDecoration = g.dead ? 'line-through' : 'none'; });
  }

  // How many hostile vehicles are on the ground in front of the garages right now: the ones the garages sent out, and any other tank or jeep the level put there (a light tank waits in this arena): the cap counts them all.
  activeCount() {
    const z1 = this.cfg.doorZ + 38, z0 = this.cfg.doorZ - 12, inside = o => o.parent && o.position.z > z0 && o.position.z < z1;
    return (this.tanks.tanks ?? []).filter(t => t.state !== 'dead' && t.state !== 'wait' && inside(t.obj)).length + (this.enemyJeeps.jeeps ?? []).filter(j => j.state !== 'dead' && j.state !== 'wait' && inside(j.obj)).length;
  }

  // ---- a vehicle rolls out of garage g
  release(g) {
    const cfg = this.cfg, at = new THREE.Vector3(g.x, 0, cfg.doorZ - cfg.depth + 2.5), goal = new THREE.Vector3(g.x, 0, cfg.doorZ + 7);
    let r = Math.random() * KINDS.reduce((s, k) => s + k[1], 0), kind = KINDS[0][0]; for (const [k, w] of KINDS) { if ((r -= w) <= 0) { kind = k; break; } }
    if (kind === 'jeep') {
      const j = this.enemyJeeps.add(at, Math.PI); j.state = 'drive'; j.target.asleep = false; j.fastBury = true; j.script = { x: g.x, z: cfg.doorZ + 5 + HALF_LEN_JEEP }; this.out.push({ kind, ref: j }); // (straight out, 5 m clear of the door, before it goes for the player)
    } else {
      // (heavy must be true for the medium tank too: passing heavy: false would override its default and give it the small shells)
      const t = this.tanks.add(at, Math.PI, { light: kind === 'light', medium: kind === 'medium', flame: kind === 'flame', heavy: kind === 'boss' || kind === 'medium', hp: kind === 'flame' || kind === 'boss' ? 8 : 4 }); // ('boss': the stage 1 boss tank: the plain tank model firing heavy shells, 8 hp)
      if (kind === 'boss') t.target.shardProof = true; // (the rocket's split shots pass it by, as they do the stage 1 boss tanks)
      t.script = { goal: new THREE.Vector3(g.x, 0, cfg.doorZ + 5 + (t.hl ?? 3.5)) }; t.gun.mob = true; t.gun.fastBury = true; t.gun.fullView = kind === 'light' ? LIGHT_FOOTPRINT : TANK_FOOTPRINT; // (script: straight out until its middle is 5 m beyond the door, plus half its length; mob: not counted in the kill rate; fullView: no firing until wholly in view)
      this.tanks.activate(t); this.out.push({ kind, ref: t });
    }
    g.mouth.alive = false; g.exiting = this.out[this.out.length - 1].ref; // (the mouth stays open until it is clear of the door)
    this.fx.smoke(new THREE.Vector3(g.x, g.y0 + .5, cfg.doorZ + .5), 2.5);
  }

  // Sparks off the power grid above garage g: n bursts at random points over the grid, each one made like a bullet striking metal (fx.hitHard), in electric colours: a white-blue flash, a fan of gold sparks flung out and falling, now and then a wisp of smoke.
  sparkShower(g, n) {
    const fx = this.fx, r = () => (Math.random() - .5) * 2;
    for (let b = 0; b < n; b++) {
      const at = g.xfAt.clone().add(new THREE.Vector3(r() * 2.5, Math.random() * 2.4 - .6, r() * 3.5));
      fx.puff(at, { color: 0xd8eaff, size: .45, grow: .8, life: .07, opacity: 1, additive: true });
      fx.puff(at, { color: 0xfff0b0, size: .25, grow: .4, life: .1, opacity: 1, additive: true });
      for (let i = 0, k = 7 + Math.floor(Math.random() * 6); i < k; i++) fx.puff(at, { color: i % 4 === 0 ? 0xfff4d8 : 0xffd060, size: .05 + Math.random() * .03, grow: 0, life: .25 + Math.random() * .4, opacity: 1, additive: true, gravity: 16, vel: new THREE.Vector3(r() * 6, 1.5 + Math.random() * 6, r() * 6) });
      if (Math.random() < .35) fx.puff(at, { color: 0x6c6862, size: .15, grow: 1.6, life: .6, opacity: .35, vel: new THREE.Vector3(r() * .4, 1.1, r() * .4) });
    }
  }


  // ---- damage: the door shows it
  hurt(g) {
    g.hits++;
    const at = new THREE.Vector3(g.x, g.y0 + 1.6, this.cfg.doorZ + .8);
    this.fx.explosion(at, .7);
    g.soot.material.opacity = Math.min(.95, .3 + g.hits * .17); g.doorMat.color.setScalar(Math.max(.34, 1 - g.hits * .16));
    g.lampMat.color.setHex(0x080404); // the beacons are knocked out
    for (const d of g.scorch) d.material.opacity = Math.min(.8, .15 + g.hits * .17); // the inside of the bay darkens with soot as it is hit
    g.xfLamp.color.setHex(g.hits < 3 ? 0x302008 : 0x300808); g.xfLamp.emissive.setHex(g.hits < 3 ? 0xffb020 : 0xff2010); // the transformer's lamp: amber, then red
    if (g.hits >= 3) { // buckled: the door hangs crooked
      g.door.rotation.z = .05; g.door.userData.skew = .05;
    }
    for (let i = 0; i < 5; i++) this.fx.spark(at.clone().add(new THREE.Vector3((Math.random() - .5) * 3, Math.random() * 1.5, 0)));
    this.sparkShower(g, 3 + g.hits * 2); // the grid on the roof above spits a flurry of sparks
    { const n = 2 + (g.hits >= 3 ? 1 : 0), sp = Array.from({ length: n }, () => new THREE.Vector3(g.xfAt.x + (Math.random() - .5) * 4.4, g.xfAt.y - .7, g.xfAt.z + (Math.random() - .5) * 6.4)); (g.flames ??= []).push(this.fx.fires.start(sp, .26 + g.hits * .05)); } // small flames take hold, more of them as it gets worse
    this.fx.smoke(new THREE.Vector3(g.x, g.y0 + 1, this.cfg.doorZ - 1), 6);
  }
  destroy(g) { // the third grenade: the door is blown off, the bay burns for good
    g.dead = true; g.state = 'dead'; g.blocker.alive = false;
    this.warpPulse = 1; sfx.fieldPulse?.(new THREE.Vector3(this.cfg.gate.x, 2, this.cfg.gate.z)); this.startShock(new THREE.Vector3(g.xfAt.x, g.xfAt.y + 2.4, g.xfAt.z), .55, .8, .45, .05); // (centred on the top of the power grid) // (the field jolts: a pulse of distortion)
    this.debris.burying = true; this.debris.fast = true; // (everything thrown off by the garage and its roof sinks into the ground within seconds and is removed: the fight must not pile up wreckage)
    const cfg = this.cfg, at = new THREE.Vector3(g.x, g.y0 + 1.5, cfg.doorZ - .3), r = () => (Math.random() - .5) * 2;
    this.fx.explosion(at, 1.6, true); this.fx.scorch(new THREE.Vector3(g.x, g.y0, cfg.doorZ + 2), 5);
    g.door.visible = false;
    for (const gl of this.bayGlass[g.x] ?? []) { // the windows over the bay shatter: the pane goes, a spray of glass flies out and falls, a glint
      const wp = gl.mesh.getWorldPosition(new THREE.Vector3()), gm = this.mats.shard ??= new THREE.MeshStandardMaterial({ color: 0x6f93aa, roughness: .1, metalness: .6, transparent: true, opacity: .7, side: THREE.DoubleSide });
      gl.mesh.visible = false;
      setTimeout(() => { this.fx.puff(wp, { color: 0xe8f4ff, size: .8, grow: 1.4, life: .12, opacity: .9, additive: true });
        this.debris.burying = true; this.debris.fast = true; // (this runs after destroy() has finished: the glass sinks away too)
        for (let i = 0; i < 16; i++) { const sh = new THREE.Mesh(shardGeometry(.1 + Math.random() * .22, .012, .08 + Math.random() * .18), gm); sh.position.copy(wp).add(new THREE.Vector3((Math.random() - .5) * gl.w, (Math.random() - .5) * gl.h, .2)); sh.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3); this.scene.add(sh);
          this.debris.launch(sh, new THREE.Vector3(r() * 3, 1 + Math.random() * 3, 2 + Math.random() * 5), new THREE.Vector3(r() * 12, r() * 12, r() * 12), .02); }
        this.debris.burying = false; this.debris.fast = false;
        for (let i = 0; i < 6; i++) this.fx.puff(wp.clone().add(new THREE.Vector3(r() * gl.w / 2, r() * gl.h / 2, .2)), { color: 0xffffff, size: .06, grow: 0, life: .5, opacity: 1, additive: true, gravity: 8, vel: new THREE.Vector3(r() * 2, 1 + Math.random() * 2, 1 + Math.random() * 3) }); // glints
      }, 40 + Math.random() * 220); // (each window goes a moment apart)
    }
    { // the power plant on the roof goes with it: blasts across the grid, then burnt black stumps and a charred deck, burning
      const xa = g.xfAt, roofY = xa.y - 1.2; g.xf.visible = false; g.deck.visible = false; this.fx.explosion(xa.clone().setY(xa.y + .5), 1.8, true);
      for (const fl of g.flames ?? []) fl.life = fl.age; // (the small flames of the damage stage die down: the big fires take over)
      for (const col of [-1.35, 1.35]) for (const row of [-3.1, 0, 3.1]) { const at = new THREE.Vector3(xa.x + col, roofY, xa.z + row); setTimeout(() => this.fx.explosion(at.clone().setY(roofY + .8), .8), 120 + Math.random() * 500); } // (the blasts ripple across the grid)
      this.ruin(g); g.ruined = true; this.bayRuin(g);
      for (let i = 0; i < 9; i++) { const m = new THREE.Mesh(shardGeometry(.4 + Math.random() * .6, .08, .3 + Math.random() * .4), this.mats.dark); m.position.copy(xa).add(new THREE.Vector3(r() * 2.4, .4 + Math.random(), r() * 3.2)); m.rotation.set(r() * 3, r() * 3, r() * 3); this.scene.add(m);
        this.debris.launch(m, new THREE.Vector3(r() * 6, 5 + Math.random() * 5, 2 + Math.random() * 7), new THREE.Vector3(r() * 10, r() * 10, r() * 10), .06); } // pieces thrown out over the apron
      this.fx.fires.start([[-1.3, -3], [1.3, -1], [-1.3, 1.5], [1.3, 3.2]].map(([dx, dz]) => new THREE.Vector3(xa.x + dx, roofY + .4, xa.z + dz)), .9); this.fx.smoke(new THREE.Vector3(xa.x, roofY + 1, xa.z), 16);
    }
    for (let i = 0; i < 12; i++) { // the door in pieces, thrown out over the apron
      const m = new THREE.Mesh(shardGeometry(.6 + Math.random() * 1.1, .1 + Math.random() * .12, .5 + Math.random() * .9), i % 3 ? g.slab.material : this.mats.dark); m.castShadow = true;
      m.position.copy(at).add(new THREE.Vector3(r() * 2.4, r() * 1.2, .3)); m.rotation.set(r() * 3, r() * 3, r() * 3); this.scene.add(m);
      this.debris.launch(m, new THREE.Vector3(r() * 5, 5 + Math.random() * 6, 3 + Math.random() * 7), new THREE.Vector3(r() * 10, r() * 10, r() * 10), .06);
    }
    for (let i = 0; i < 6; i++) this.debris.chunk(at.clone(), this.mats.concrete, .2 + Math.random() * .3, 4);
    for (const d of g.scorch) d.material.opacity = 1; // the interior: scorched black, like a blown-open hut (no flames inside: the fire is on the roof)
    this.fx.smoke(new THREE.Vector3(g.x, g.y0 + 1, cfg.doorZ - 1), 5);
    g.lampMat.emissiveIntensity = 0; g.lamps.forEach(l => { l.visible = false; });
    this.debris.burying = false; this.debris.fast = false;
    if (this.garages.every(k => k.dead)) { this.state = 'powerdown'; this.t = 0; } // the generator goes after the last one
  }

  // The energy field failing: at the front of the break (it travels down the curtain), bursts of sparks like a bullet on metal, cinders dropping off the edge, thin arcs of electricity jumping between the emitters and the
  // curtain, and a puff of heat; pr is how far the collapse has got, 0..1.
  collapseFx(dt, pr) {
    const gate = this.cfg.gate, y0 = this.garages[0]?.y0 ?? 0, H = 3.4, fx = this.fx, r = () => (Math.random() - .5) * 2, hf = Math.max(.1, H * (1 - pr * 1.05)), zf = gate.z + .45, w = gate.w - .6;
    this.fxAcc = (this.fxAcc ?? 0) + dt * (14 + 26 * pr);
    while (this.fxAcc >= 1) { this.fxAcc -= 1;
      const at = new THREE.Vector3(gate.x + r() * w / 2, y0 + hf + Math.random() * .5, zf);
      fx.puff(at, { color: 0xfff0b0, size: .3, grow: .5, life: .07, opacity: 1, additive: true });
      for (let i = 0, n = 5 + Math.floor(Math.random() * 4); i < n; i++) fx.puff(at, { color: Math.random() < .3 ? 0xfff4d8 : 0xffd060, size: .06, grow: 0, life: .22 + Math.random() * .3, opacity: 1, additive: true, gravity: 15, vel: new THREE.Vector3(r() * 5, 1 + Math.random() * 4, 1 + Math.random() * 4) });
      if (Math.random() < .5) fx.puff(at.clone().setY(at.y - Math.random() * .6), { color: 0xff8a2a, size: .1 + Math.random() * .06, grow: 0, life: .7 + Math.random() * .5, opacity: .9, additive: true, gravity: 5, vel: new THREE.Vector3(r() * .6, -.2, .3 + Math.random() * .6) }); // cinders dropping off the broken edge
      if (Math.random() < .2) fx.puff(at, { color: 0x6c6862, size: .15, grow: 1.6, life: .8, opacity: .3, vel: new THREE.Vector3(r() * .4, 1.2, r() * .4) });
    }
    if (!this.arcs) { this.arcs = Array.from({ length: 4 }, () => { const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(Array.from({ length: 14 }, () => new THREE.Vector3())), new THREE.LineBasicMaterial({ color: 0xffe2a8, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false })); l.frustumCulled = false; l.renderOrder = 4; this.scene.add(l); return l; }); this.arcIn = 0; }
    if ((this.arcIn -= dt) <= 0) { // new bolts every few frames: from an emitter on one side, across to a random point on the curtain, jagged
      this.arcIn = .06;
      for (const a of this.arcs) {
        a.visible = Math.random() < .75 * (1 - pr * .5);
        if (!a.visible) continue;
        const side = Math.random() < .5 ? -1 : 1, from = new THREE.Vector3(gate.x + side * gate.w / 2, y0 + 3.4 - Math.random() * 2.6, zf), to = new THREE.Vector3(gate.x + r() * w / 2, y0 + Math.random() * H, zf), pos = a.geometry.attributes.position;
        for (let i = 0; i < pos.count; i++) { const t = i / (pos.count - 1), j = i === 0 || i === pos.count - 1 ? 0 : .32; pos.setXYZ(i, from.x + (to.x - from.x) * t + r() * j, from.y + (to.y - from.y) * t + r() * j, zf + r() * .08); }
        pos.needsUpdate = true;
      }
    }
  }
  // A shockwave rippling across the screen from a world point, through msaa.js's final pass: a ring spreading outward that pushes the picture aside at its front, with fading ripples after it. k: strength, dur: seconds, maxR: how far it spreads (screen heights), w: its width.
  startShock(pos, k, dur, maxR, w) { this.shock = { pos: pos.clone(), t: 0, k, dur, maxR, w }; }
  updateShock(dt, cam) {
    const s = this.shock; if (!s || !this.msaa) return;
    s.t += dt; const p = s.t / s.dur;
    if (p >= 1) { this.shock = null; this.msaa.shock(.5, .5, 0, .1, 0); return; }
    const v = s.pos.clone().project(cam.camera), e = 1 - (1 - p) * (1 - p);
    this.msaa.shock(v.x * .5 + .5, v.y * .5 + .5, s.maxR * e, s.w * (1 + p * 1.5), s.k * Math.pow(1 - p, 1.2));
  }

  openSecretGate() { // the energy is off everywhere: the secret helipad's gate can be hurt now (a rocket or grenade, like the boss gate); when it is blown, onSecretGate() starts the way out (secret-exit.js)
    if (this.sgT) { this.sgT.immune = false; this.sgArmed = true; }
  }

  collapseEnd() { // the last of the field goes: a shower of sparks along the whole gate (no expanding flash: the curtain has just been drawn in to a line)
    const gate = this.cfg.gate, y0 = this.garages[0]?.y0 ?? 0;
    this.startShock(new THREE.Vector3(gate.x, y0 + 1.7, gate.z + .5), 1, 1.15, 1.25, .07); // (the burst of the field's power: a shockwave across the screen)
    for (let i = 0; i < 7; i++) { const at = new THREE.Vector3(gate.x + (i / 6 - .5) * (gate.w - 1), y0 + .6 + Math.random() * 2, gate.z + .5); for (let k = 0; k < 8; k++) this.fx.puff(at, { color: 0xffd060, size: .07, grow: 0, life: .3 + Math.random() * .4, opacity: 1, additive: true, gravity: 14, vel: new THREE.Vector3((Math.random() - .5) * 6, 1 + Math.random() * 5, 1 + Math.random() * 4) }); }
  }

  update(dt, player, cam) {
    if (!this.cfg || this.state === 'idle') return;
    this.time += dt; this.field.update(this.time, this.fieldK); this.field2?.update(this.time, this.fieldK);
    if (this.sgArmed && !this.sgFired && this.sgT.hp <= 0) { this.sgFired = true; this.onSecretGate?.(); } // (the secret gate is blown)
    this.updateShock(dt, cam);
    if (this.warpPulse > 0) { this.warpPulse = Math.max(0, this.warpPulse - dt * 1.3); if (this.state !== 'powerdown' && this.state !== 'down') this.field.setWarp(this.warpPulse * .25); } // (a lost garage's jolt dies away)
    const pulse = this.powered ? .9 + .35 * Math.sin(this.time * 7) : 0;
    if (this.coilMat) { this.coilMat.emissiveIntensity = pulse * 1.6; this.cableMat.emissiveIntensity = pulse * 1.2; }
    this.updateHud();
    if (this.powered && this.state === 'powerdown') this.fieldK = Math.random() < .3 ? 1 : .15; // (the last garage is down: it gutters for a moment)
    else if (this.powered) { // the field runs on the garages' transformers: it flickers harder as they go
      const k = this.garages.filter(q => !q.dead).length / 4; this.fieldK = k >= 1 ? 1 : (Math.random() < (1 - k) * .3 ? .55 : 1); // (each garage lost makes it flicker more often, but it never gets fainter than that)
      if (this.emitMat) this.emitMat.emissiveIntensity = this.fieldK * 2.2;
    } else if (this.emitMat) this.emitMat.emissiveIntensity = this.fieldK * 2.2;
    if (this.mats.ruin) this.mats.ruin.ember.emissiveIntensity = 1.3 + Math.sin(this.time * 5) * .5 + Math.random() * .5; // the embers of a burnt-out substation flicker
    for (const g of this.garages) if (!g.dead && g.xfLamp) { // the transformers' lamps and sparks
      if (g.hits >= 1) { g.xfLamp.emissiveIntensity = g.hits >= 3 ? (Math.sin(this.time * 14) > 0 ? 2.4 : .2) : 1.6; g.sparkAcc = (g.sparkAcc ?? 0) + dt * (g.hits >= 3 ? 5 : g.hits >= 2 ? 3 : 1.5); while (g.sparkAcc >= 1) { g.sparkAcc -= 1; this.sparkShower(g, 1); } } // sparks keep flying off a damaged grid, more of them the worse it is
      else g.xfLamp.emissiveIntensity = 1.6;
    }
    if (this.state === 'wait') { // the fight starts as the jeep nears the wall
      if (this.arena?.box ? this.arena.state === 'fight' : player.enabled && !player.dead && player.position.z < this.cfg.doorZ + START_RANGE) this.state = 'fight'; // (the arena's own start: the jeep crossing its line, the siren and the pan)
      return;
    }
    if (this.state === 'fight') {
      this.out = this.out.filter(o => o.ref.state !== 'dead');
      if ((this.nextIn -= dt) <= 0) {
        const free = this.garages.filter(g => !g.dead && g.state === 'closed');
        if (this.activeCount() < MAX_OUT && free.length) { const g = free[Math.floor(Math.random() * free.length)]; g.state = 'opening'; g.t = 0; g.sent = false; this.nextIn = rand(GAP); sfx.doorServo?.(new THREE.Vector3(g.x, 1, this.cfg.doorZ), OPEN_T); }
        else this.nextIn = .5;
      }
    }
    for (const g of this.garages) if (g.burnRef && g.burnK < 1) { g.burnK = Math.min(1, g.burnK + dt * .9); g.burnRef.bl.uBurnK.value[g.burnRef.idx] = g.burnK; } // (the burn spreads in)
    if (this.state === 'powerdown' && !this.opened) { this.opened = true; this.arena?.release(cam); this.onBossDown?.(); } // (the garages are down: the barrier across the fence's gate goes)
    for (const g of this.garages) {
      if (g.exiting && (g.exiting.state === 'dead' || g.exiting.obj.position.z > this.cfg.doorZ + 1.2 + (g.exiting.hl ?? 2.5))) { g.mouth.alive = true; g.exiting = null; if (g.state === 'open') g.t = Math.max(g.t, HOLD_T - 1.2); } // the vehicle is clear: the door will close 1.2 s from now (instead of waiting out the whole 5.5 s it stays open) // the vehicle is clear (its whole length, not just its middle: the mouth must not close on its tail): the mouth shuts behind it
      if (g.dead) continue;
      if (g.state === 'opening') { g.t += dt; g.p = Math.min(1, g.t / OPEN_T); if (g.p >= .35 && !g.sent) { g.sent = true; if (this.activeCount() < MAX_OUT) this.release(g); } if (g.p >= 1) { g.state = 'open'; g.t = 0; } }
      else if (g.state === 'open') { g.t += dt; if (g.t >= HOLD_T) { g.state = 'closing'; g.t = 0; sfx.doorServo?.(new THREE.Vector3(g.x, 1, this.cfg.doorZ), CLOSE_T, true); } }
      else if (g.state === 'closing') { g.t += dt; g.p = Math.max(0, 1 - g.t / CLOSE_T); if (g.p <= 0) { g.state = 'closed'; g.p = 0; } }
      const ease = g.p * g.p * (3 - 2 * g.p);
      g.door.position.y = g.y0 - ease * (DOOR_H + .3) + (g.state !== 'closed' && g.p > 0 && g.p < 1 && g.hits > 2 ? Math.sin(this.time * 40) * .04 : 0); // (a buckled door shudders)
      g.blocker.alive = g.p < .5; g.target.immune = !(g.p >= VULNERABLE);
      if (g.state === 'opening' || g.state === 'closing') { g.dustAcc = (g.dustAcc ?? 0) + dt * 14; while (g.dustAcc >= 1) { g.dustAcc -= 1; this.fx.puff(new THREE.Vector3(g.x + (Math.random() - .5) * (this.cfg.bayW - .6), g.y0 + .15, this.cfg.doorZ + .25), { color: 0xb5ad9e, size: .18, grow: 1.5, life: .6 + Math.random() * .4, opacity: .32, vel: new THREE.Vector3((Math.random() - .5) * .8, .5 + Math.random() * .6, .3 + Math.random() * .8) }); } } // (dust and grit puffing out of the slot as the door moves)
      g.lampMat.emissiveIntensity = g.hits ? 0 : g.state === 'closed' ? 0 : (Math.sin(this.time * 12) > 0 ? 2.2 : .3); // the beacons flash while the door is open
    }
    if (this.state === 'powerdown') { // the last garage is down: a moment, then the generator goes up and the field with it
      this.t += dt;
      if (this.t > 1.2 && this.powered) {
        this.powered = false;
        if (this.gen) {
          const gp = this.genTop.clone(); this.fx.explosion(gp.clone().setY(gp.y - 1.5), 2.2, true); this.fx.explosion(gp, 1.4);
          this.fx.fires.start([new THREE.Vector3(this.gen.position.x - 1, this.gen.position.y, this.gen.position.z), new THREE.Vector3(this.gen.position.x + 1, this.gen.position.y, this.gen.position.z)], 1.2);
          this.fx.smoke(this.gen.position.clone().setY(this.gen.position.y + 1), 14);
          for (let i = 0; i < 4; i++) this.debris.chunk(gp.clone().setY(gp.y - 1), this.mats.dark, .3 + Math.random() * .3, 5);
          this.coilMat.emissiveIntensity = 0; this.cableMat.emissiveIntensity = 0;
        }
        sfx.fieldDown?.(new THREE.Vector3(this.cfg.gate.x, 2, this.cfg.gate.z), 2.3);
      }
      if (!this.powered) {
        const pr = Math.min(1, (this.t - 1.2) / 2.1); // how far the collapse has got
        this.field.setDissolve(pr * 1.2); this.field2?.setDissolve(pr * 1.2); this.fieldK = pr < .88 ? (Math.random() < .2 ? .6 : 1) : Math.max(0, (1 - pr) / .12); // (the cells of the curtain go out from the top down: see lasers.js; a flicker as it goes)
        this.field.setWarp(.12 + pr * .35); this.field.setPinch(pr > .86 ? (pr - .86) / .14 : 0); this.field2?.setWarp(.12 + pr * .35); this.field2?.setPinch(pr > .86 ? (pr - .86) / .14 : 0); // (the curtain is distorted more and more, then draws in to a thin line and is gone)
        this.collapseFx(dt, pr);
        if (pr >= 1) { this.state = 'down'; this.fieldK = 0; this.field.setDissolve(0); this.field.setWarp(0); this.field.setPinch(0); this.field2?.setDissolve(0); this.field2?.setWarp(0); this.field2?.setPinch(0); this.openSecretGate(); if (this.arcs) this.arcs.forEach(a => { a.visible = false; }); if (this.gateT) this.gateT.immune = false; this.collapseEnd(); }
      }
    }
    if (this.state === 'down' && this.gateT && this.gateT.hp <= 0) { this.state = 'done'; this.onClear?.(); } // the gate is blown: the way on is open
  }
}
