// Stage 6's conveyor belts: a long belt of dark ribbed rubber between two raised side rails, carrying the jeep south. Built to the asset contract: metres, origin on the ground at the centre, the belt running along Z
// (its far end at -Z, north; things ride toward +Z, south). The belt's ribs are one shared texture (beltTexture) that world.js scrolls south each frame, so the surface visibly moves with whatever rides on it.
import * as THREE from 'three';

export const RAIL = 1.1;       // m: each side rail's width (the NES draws them 7 px wide)
export const RIB = 1.0;        // m of belt per rib (the texture's repeat)

export const BELT_REPEAT = 6.4; // m of belt per texture repeat (sixteen cleats of 0.4 m, each one different)

let tex = null, bumpTex = null;
function drawBelt(x, W, H, bump) { // pass: colour or the matching bump (height: light = raised)
  let seed = bump ? 4243 : 4242; const r = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const N = 16, P = H / N; // sixteen cleats a repeat
  x.fillStyle = bump ? '#4a4a4a' : '#2c2e32'; x.fillRect(0, 0, W, H);
  for (let k = 0; k < N; k++) { // a raised cleat across the belt every 0.4 m, its face a herringbone of grip ridges, a smooth lip at the leading edge and a groove behind: each one worn its own way
    const y0 = k * P, wear = r(), tone = (r() - .5) * 16, ph = r() * .8, ridge = (.7 + r() * .6) * Math.max(2, W / 80), skew = (r() - .5) * .12;
    x.fillStyle = bump ? `rgb(${190 + Math.round(wear * 30)},${190 + Math.round(wear * 30)},${190 + Math.round(wear * 30)})` : `rgb(${58 + tone | 0},${61 + tone | 0},${66 + tone | 0})`; x.fillRect(0, y0 + P * .12, W, P * .62);
    x.fillStyle = bump ? '#f0f0f0' : `rgb(${88 + tone * 1.4 | 0},${92 + tone * 1.4 | 0},${98 + tone * 1.4 | 0})`; x.fillRect(0, y0 + P * .12, W, P * .07);
    x.fillStyle = bump ? '#101010' : '#17181a'; x.fillRect(0, y0 + P * .78, W, P * .12);
    x.save(); x.beginPath(); x.rect(0, y0 + P * .2, W, P * .5); x.clip();
    x.lineWidth = ridge; x.strokeStyle = bump ? `rgb(${120 + Math.round(wear * 40)},${120 + Math.round(wear * 40)},${120 + Math.round(wear * 40)})` : '#25272b';
    const pitch = W / (11 + Math.floor(r() * 7)); // the ridge spacing differs a little from cleat to cleat
    for (let i = -2; i <= 20; i++) {
      if (r() < .05 + wear * .08) continue; // a worn-away ridge here and there
      const cx = i * pitch + ph * pitch; x.beginPath(); x.moveTo(cx, y0 + P * (.7 + skew)); x.lineTo(cx + pitch / 2, y0 + P * .2); x.lineTo(cx + pitch, y0 + P * (.7 - skew)); x.stroke();
    }
    x.restore();
    if (!bump && r() < .3) { x.fillStyle = `rgba(14,14,14,${.18 + r() * .25})`; x.fillRect(r() * W * .6, y0 + P * .12, W * (.15 + r() * .35), P * .62); }   // a dirty, rubbed patch across part of a cleat
    if (!bump && r() < .18) { x.fillStyle = 'rgba(70,74,80,.5)'; const px = r() * (W - 60), py = y0 + P * .2; x.fillRect(px, py, 30 + r() * 30, P * .4); x.strokeStyle = 'rgba(0,0,0,.5)'; x.lineWidth = 1; x.strokeRect(px, py, 30 + r() * 30, P * .4); } // a bolted repair plate
  }
  if (!bump) {
    for (let i = 0; i < 6000; i++) { x.fillStyle = `rgba(${r() < .5 ? '8,8,10' : '150,154,160'},${.05 + r() * .16})`; x.fillRect(r() * W, r() * H, 1 + r() * 2.5, 1 + r() * 2); } // grit and scuffs
    for (let i = 0; i < 9; i++) { const sx = r() * W, len = 120 + r() * 380, y1 = r() * (H - len), g = x.createLinearGradient(0, y1, 0, y1 + len); g.addColorStop(0, 'rgba(10,10,12,0)'); g.addColorStop(.4, `rgba(10,10,12,${.12 + r() * .14})`); g.addColorStop(1, 'rgba(10,10,12,0)'); x.fillStyle = g; x.fillRect(sx, y1, 4 + r() * 16, len); } // rubber scuff trails along the belt
    for (let i = 0; i < 26; i++) { const px = r() * W, py = r() * H, rr = 20 + r() * 60, gg = x.createRadialGradient(px, py, 0, px, py, rr); gg.addColorStop(0, `rgba(12,12,12,${.2 + r() * .3})`); gg.addColorStop(1, 'rgba(12,12,12,0)'); x.fillStyle = gg; x.fillRect(px - rr, py - rr, rr * 2, rr * 2); } // oil and dirt
    for (let i = 0; i < 18; i++) { x.fillStyle = `rgba(${110 + r() * 30 | 0},${62 + r() * 20 | 0},38,${.1 + r() * .14})`; x.fillRect(r() * W, r() * H, 4 + r() * 16, 3 + r() * 9); } // rust
    const g = x.createLinearGradient(0, 0, W, 0); g.addColorStop(0, 'rgba(0,0,0,.28)'); g.addColorStop(.12, 'rgba(0,0,0,0)'); g.addColorStop(.88, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.28)'); x.fillStyle = g; x.fillRect(0, 0, W, H); // the edges in shade
  }
}
export function beltTexture() { // the belt's cleated tread (colour map), wrapping along its length; BELT_REPEAT metres a repeat
  if (tex) return tex;
  const c = document.createElement('canvas'); c.width = 512; c.height = 1024; drawBelt(c.getContext('2d'), 512, 1024, false);
  tex = new THREE.CanvasTexture(c); tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.anisotropy = 8; return tex;
}
function beltBump() { // and its relief
  if (bumpTex) return bumpTex;
  const c = document.createElement('canvas'); c.width = 512; c.height = 1024; drawBelt(c.getContext('2d'), 512, 1024, true);
  bumpTex = new THREE.CanvasTexture(c); bumpTex.wrapS = bumpTex.wrapT = THREE.RepeatWrapping; bumpTex.anisotropy = 8; return bumpTex;
}

// w: the whole width including the rails (m); l: the length (m)
export function buildConveyor(w, l) {
  const root = new THREE.Group(); root.name = 'conveyor';
  const inner = w - 2 * RAIL;
  const belt = beltTexture().clone(), bump = beltBump().clone(); belt.needsUpdate = bump.needsUpdate = true;
  for (const t of [belt, bump]) { t.repeat.set(1, l / BELT_REPEAT); t.wrapS = t.wrapT = THREE.RepeatWrapping; } // (clones: their own scroll offsets; world.js moves both together, see root.userData.belts)
  const beltM = new THREE.MeshStandardMaterial({ map: belt, bumpMap: bump, bumpScale: 2.2, roughness: .82, metalness: .1, envMapIntensity: .22 });
  const concrete = new THREE.MeshStandardMaterial({ color: 0xb9b6a6, roughness: .9, envMapIntensity: .3 });
  const steel = new THREE.MeshStandardMaterial({ color: 0x6e7479, roughness: .5, metalness: .65, envMapIntensity: .5 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1d1f22, roughness: .8, metalness: .2 });
  const hazard = new THREE.MeshStandardMaterial({ color: 0xa98f33, roughness: .8 });
  const box = (m, sx, sy, sz, x, y, z) => { const o = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), m); o.position.set(x, y, z); o.castShadow = o.receiveShadow = true; root.add(o); return o; };

  // the bed the belt runs in, a little sunk, then the belt a hair above it
  box(dark, inner + .1, .12, l, 0, .06, 0);
  const surface = new THREE.Mesh(new THREE.PlaneGeometry(inner, l), beltM); surface.rotation.x = -Math.PI / 2; surface.position.y = .125; surface.receiveShadow = true; root.add(surface);
  root.userData.belts = [belt, bump]; // world.js scrolls these textures
  // the side rails: a concrete kerb with a steel cap and a hazard-yellow band at its foot, tall enough that a jeep can't climb it
  for (const s of [-1, 1]) {
    const x = s * (inner / 2 + RAIL / 2);
    box(concrete, RAIL, .75, l, x, .375, 0);
    box(steel, RAIL * .55, .08, l, x, .79, 0);
    box(hazard, .06, .2, l, s * (inner / 2 + .03), .24, 0); // a hazard band along the foot of its inner face
    // a guard-rail along the outer edge of the kerb: square-tube posts every 1.6 m, a top rail and a mid rail through them, a toe-plate at the foot, and heavier end posts with caps
    const rx = x + s * RAIL * .32, yTop = 1.36, yMid = 1.08;
    for (let z = -l / 2 + .25; z <= l / 2 - .2; z += 1.6) box(steel, .075, yTop - .8, .075, rx, .8 + (yTop - .8) / 2, z);
    for (const z of [-l / 2 + .12, l / 2 - .12]) { box(steel, .13, yTop - .78, .13, rx, .79 + (yTop - .78) / 2, z); box(dark, .17, .05, .17, rx, yTop + .02, z); }
    box(steel, .06, .06, l - .1, rx, yTop, 0);  // the top rail
    box(steel, .05, .05, l - .1, rx, yMid, 0);  // the mid rail
    box(steel, .02, .14, l - .1, rx, .87, 0);   // the toe-plate
    for (let z = -l / 2 + 1.05; z < l / 2 - .4; z += 1.6) box(steel, .12, .035, .08, rx, yTop + .005, z); // clamps where the top rail meets each post
  }
  // the head and tail rollers
  for (const z of [-l / 2 + .15, l / 2 - .15]) {
    const roll = new THREE.Mesh(new THREE.CylinderGeometry(.16, .16, inner, 14), steel); roll.rotation.z = Math.PI / 2; roll.position.set(0, .18, z); roll.castShadow = true; root.add(roll);
  }
  // chevrons on the rail tops pointing the way it carries you (south)
  for (const s of [-1, 1]) for (let z = -l / 2 + 2; z < l / 2 - 1; z += 3.2) {
    const x = s * (inner / 2 + RAIL / 2), ch = new THREE.Mesh(new THREE.ConeGeometry(.2, .34, 3), hazard); ch.rotation.x = Math.PI / 2; ch.position.set(x, .86, z); ch.scale.set(1, 1, .35); root.add(ch);
  }
  return root;
}
