// Stage 3's ground: worn harbour concrete and asphalt. Two pieces, both baked once at load:
//  - pavementDetail(rand): the fine tiling texture multiplied over the ground (like world.js's sand detail): aggregate grain, pebbles,
//    crazing cracks, repair patches, oil stains and tyre scuffs, all drawn wrapped so the tile stays seamless;
//  - pavementMottle(x, z): a slow, big-scale tone variation used while painting the ground's colour map: resurfaced patches,
//    damp or oily darker areas, so no two stretches of road look the same.
import * as THREE from 'three';
import { canvasTexture } from '../assets/common.js';

const TAU = Math.PI * 2;

export function pavementDetail(rand, dark = false) { // dark: the lighter parts (pale chips, pale crack edges, the lighter slab, the bright half of the grain) are toned down
  const L = dark ? .35 : 1, N = 512, c = document.createElement('canvas'); c.width = c.height = N;
  const x = c.getContext('2d'), img = x.createImageData(N, N);
  // slow mottling (wrapped sines: tileable) + fine grain
  const f = [[2, 1, 0], [1, 3, 1.7], [3, 2, 4.1], [4, 5, 2.3]].map(([a, b, p]) => [a, b, p + rand() * 6]);
  for (let py = 0; py < N; py++) for (let px = 0; px < N; px++) {
    let m = 0; for (const [a, b, p] of f) m += Math.sin(TAU * (a * px + b * py) / N + p);
    const v = Math.min(dark ? 132 : 255, 128 + m * 2.6 + (rand() - .5 - (dark ? .12 : 0)) * 26), i = (py * N + px) * 4;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  const wrap = fn => { for (const ox of [-N, 0, N]) for (const oy of [-N, 0, N]) fn(ox, oy); };
  // oil and fuel stains: soft dark clusters
  for (let i = 0; i < 2; i++) { // (few, big and faint: they repeat across the whole ground, so more reads as polka dots)
    const cx = rand() * N, cy = rand() * N;
    for (let k = 0; k < 4; k++) {
      const px = cx + (rand() - .5) * 90, py = cy + (rand() - .5) * 60, r = 30 + rand() * 50;
      wrap((ox, oy) => { const g = x.createRadialGradient(px + ox, py + oy, 0, px + ox, py + oy, r); g.addColorStop(0, `rgba(0,0,0,${.05 + rand() * .05})`); g.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = g; x.fillRect(px + ox - r, py + oy - r, 2 * r, 2 * r); });
    }
  }
  // repair patches: slightly lighter or darker slabs of newer material, with a thin dark seam round them
  for (let i = 0; i < 2; i++) {
    const w = 50 + rand() * 120, h = 40 + rand() * 90, px = rand() * N, py = rand() * N, light = rand() < .5;
    wrap((ox, oy) => {
      x.fillStyle = light ? `rgba(255,255,255,${.05 * L})` : 'rgba(0,0,0,.06)'; x.fillRect(px + ox, py + oy, w, h);
      x.strokeStyle = 'rgba(0,0,0,.18)'; x.lineWidth = 1; x.strokeRect(px + ox, py + oy, w, h);
    });
  }
  // tyre scuffs: long soft dark arcs
  for (let i = 0; i < 4; i++) {
    const px = rand() * N, py = rand() * N, len = 120 + rand() * 200, ang = rand() * TAU, bend = (rand() - .5) * 90;
    wrap((ox, oy) => {
      for (const off of [0, 9]) { x.strokeStyle = 'rgba(0,0,0,.1)'; x.lineWidth = 5; x.beginPath(); x.moveTo(px + ox, py + oy + off); x.quadraticCurveTo(px + ox + Math.cos(ang) * len / 2 - Math.sin(ang) * bend, py + oy + off + Math.sin(ang) * len / 2 + Math.cos(ang) * bend, px + ox + Math.cos(ang) * len, py + oy + off + Math.sin(ang) * len); x.stroke(); }
    });
  }
  // aggregate: pebbles and chips, light and dark
  for (let i = 0; i < 1500; i++) {
    const px = rand() * N, py = rand() * N, r = .5 + rand() * 1.7, l = rand() > .5;
    x.fillStyle = l ? `rgba(255,255,255,${(.2 + rand() * .25) * L})` : `rgba(0,0,0,${.2 + rand() * .3})`;
    wrap((ox, oy) => { x.beginPath(); x.arc(px + ox, py + oy, r, 0, TAU); x.fill(); });
  }
  // cracks: meandering dark lines with a few branches, and a faint light edge beside them
  const crack = (px, py, ang, steps, w) => {
    const pts = [[px, py]];
    for (let s = 0; s < steps; s++) { ang += (rand() - .5) * .9; px += Math.cos(ang) * (6 + rand() * 9); py += Math.sin(ang) * (6 + rand() * 9); pts.push([px, py]); if (rand() < .08 && w > .8) crack(px, py, ang + (rand() < .5 ? 1 : -1) * (.6 + rand() * .6), Math.floor(steps / 2), w * .7); }
    wrap((ox, oy) => {
      x.strokeStyle = `rgba(255,255,255,${.14 * L})`; x.lineWidth = w + 1.2; x.beginPath(); pts.forEach(([a, b], i) => i ? x.lineTo(a + ox + .8, b + oy + .8) : x.moveTo(a + ox + .8, b + oy + .8)); x.stroke();
      x.strokeStyle = 'rgba(0,0,0,.42)'; x.lineWidth = w; x.beginPath(); pts.forEach(([a, b], i) => i ? x.lineTo(a + ox, b + oy) : x.moveTo(a + ox, b + oy)); x.stroke();
    });
  };
  for (let i = 0; i < 9; i++) crack(rand() * N, rand() * N, rand() * TAU, 10 + Math.floor(rand() * 16), .8 + rand() * .9);
  return canvasTexture(c, 1, 1);
}

// Slow tone variation over the ground colour (about 1.0 = unchanged): resurfaced patches, darker damp or oily areas.
export function pavementMottle(n1, n2, n3, cx, cy) {
  const sm = t => { t = Math.min(1, Math.max(0, t)); return t * t * (3 - 2 * t); }, p = n1(cx * .045 + 12, cy * .045);
  const patch = 1 + .07 * sm((p - .55) / .12) - .07 * sm((.36 - p) / .12); // broad resurfaced (lighter) and worn (darker) areas, soft-edged
  const soft = 1 + (n2(cx * .09 + 5, cy * .09 + 3) - .5) * .16;
  const grain = 1 + (n3(cx * .8, cy * .8) - .5) * .09;
  const oil = Math.max(0, n3(cx * .12 + 70, cy * .12 + 20) - .8) / .2; // a few big, faint damp areas where the noise peaks
  return patch * soft * grain * (1 - oil * .12);
}
