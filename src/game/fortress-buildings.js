// Stage 6's enemy base blocks over the map's 'K' cells (harbour.js; the NES map paints them green).
// A modern hardened base: flat-roofed blocks of olive reinforced concrete with a low plinth, ribbon windows behind steel
// blast shutters, roll-up vehicle bay doors and armoured personnel doors, floodlights, cameras and cable trays on the walls, and on the
// roof a radar dome, satellite dishes, lattice masts, condensers and camouflage netting. Solid and indestructible (the cells block).
import * as THREE from 'three';
import { mergeStatic } from './optimize.js';

const WALL_W = 8;       // metres of wall per texture repeat
const PX_PER_M = 64;
const LIP = .4;         // the roof's concrete coping above the roof

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 16;
  return t;
}
function rng(seed) {
  return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}

// Green concrete cast in boards: 2 m panels with dark joints, tie-bolt dots, mottled paint, rain streaks and a sooty foot.
function wallTextures(H) {
  const W = WALL_W * PX_PER_M, Hp = Math.round(H * PX_PER_M), m = PX_PER_M, rnd = rng(606);
  const colour = canvasTex(W, Hp, x => {
    x.fillStyle = '#646a5f'; x.fillRect(0, 0, W, Hp);
    for (let i = 0; i < 260; i++) { x.fillStyle = `rgba(${rnd() < .5 ? '42,46,38' : '130,136,114'},${.05 + rnd() * .09})`; const r = 14 + rnd() * 50; x.beginPath(); x.ellipse(rnd() * W, rnd() * Hp, r, r * (.4 + rnd() * .5), rnd() * 3, 0, 7); x.fill(); } // mottled paint
    for (let i = 0; i < 9000; i++) { x.fillStyle = `rgba(${rnd() < .5 ? '30,36,22' : '200,205,170'},${rnd() * .06})`; x.fillRect(rnd() * W, rnd() * Hp, 1 + rnd() * 3, 1 + rnd() * 2); }
    for (let b = 0; b < WALL_W / 2; b++) { x.fillStyle = 'rgba(24,27,20,.55)'; x.fillRect(b * 2 * m - 1, 0, 2, Hp); }                                  // vertical panel joints
    for (let y = 1.5; y < H; y += 1.5) { x.fillStyle = 'rgba(24,27,20,.3)'; x.fillRect(0, y * m, W, 1.5); }                                          // board lines
    for (let b = 0; b < WALL_W / 2; b++) for (let y = .75; y < H; y += 1.5) { x.fillStyle = 'rgba(22,28,16,.6)'; x.beginPath(); x.arc((b * 2 + .5) * m, y * m, 2.5, 0, 7); x.arc((b * 2 + 1.5) * m, y * m, 2.5, 0, 7); x.fill(); } // tie-bolt holes
    for (let i = 0; i < 14; i++) { const sx = rnd() * W, len = 60 + rnd() * 170, g = x.createLinearGradient(0, 0, 0, len); // rain streaks
      g.addColorStop(0, 'rgba(32,35,28,.0)'); g.addColorStop(.3, 'rgba(32,35,28,.22)'); g.addColorStop(1, 'rgba(32,35,28,0)');
      x.save(); x.translate(sx, rnd() * (Hp - len)); x.fillStyle = g; x.fillRect(0, 0, 3 + rnd() * 6, len); x.restore(); }
    const g = x.createLinearGradient(0, Hp - 1.6 * m, 0, Hp); g.addColorStop(0, 'rgba(30,28,20,0)'); g.addColorStop(1, 'rgba(30,28,20,.4)'); x.fillStyle = g; x.fillRect(0, Hp - 1.6 * m, W, 1.6 * m);
  });
  const bump = canvasTex(W, Hp, x => {
    x.fillStyle = '#808080'; x.fillRect(0, 0, W, Hp);
    for (let i = 0; i < 6000; i++) { x.fillStyle = `rgba(${rnd() < .5 ? '0,0,0' : '255,255,255'},${rnd() * .09})`; x.fillRect(rnd() * W, rnd() * Hp, 2, 2); }
    x.fillStyle = '#383838'; for (let b = 0; b < WALL_W / 2; b++) x.fillRect(b * 2 * m - 2, 0, 4, Hp);
    for (let y = 1.5; y < H; y += 1.5) x.fillRect(0, y * m - 1.5, W, 3);
  });
  const rough = canvasTex(W, Hp, x => { // roughness: 1 = matte. Mostly damp-matte, with glossy runs where rainwater streams down the face and a wetter band near the foot
    const r2 = rng(808);
    x.fillStyle = '#a8a8a8'; x.fillRect(0, 0, W, Hp);
    for (let i = 0; i < 46; i++) { const sx = r2() * W, len = 90 + r2() * 300, y0 = r2() * (Hp - len), g = x.createLinearGradient(0, y0, 0, y0 + len), wd = 4 + r2() * 14;
      g.addColorStop(0, 'rgba(60,60,60,0)'); g.addColorStop(.2, 'rgba(60,60,60,.7)'); g.addColorStop(1, 'rgba(60,60,60,0)'); x.fillStyle = g; x.fillRect(sx, y0, wd, len); }
    const g = x.createLinearGradient(0, Hp - 1.8 * m, 0, Hp); g.addColorStop(0, 'rgba(70,70,70,0)'); g.addColorStop(1, 'rgba(70,70,70,.55)'); x.fillStyle = g; x.fillRect(0, Hp - 1.8 * m, W, 1.8 * m);
  });
  return { colour, bump, rough };
}

const ROOF_M = 12; // metres of roof per texture repeat (the roof's texture is laid by WORLD position, so neighbouring blocks' roofs line up)
function roofTextures() { // a weathered concrete deck: big soft tone drift, tar-and-gravel patches, bare gravel, wandering hairline cracks and a few irregular expansion joints; everything wraps so it repeats cleanly
  const S = 1024;
  const draw = (x, pass) => { // pass 0: colour, 1: bump
    const rnd = rng(61), P = pass === 1;
    const wrap = fn => { for (const dx of [-S, 0, S]) for (const dy of [-S, 0, S]) { x.save(); x.translate(dx, dy); fn(); x.restore(); } };
    const blob = (px, py, r, sq, rot, grow = 1) => { // a rounded, uneven patch: a smooth closed curve through points at slightly different radii
      const n = 9, pts = []; for (let k = 0; k < n; k++) { const a = k / n * 6.283, rr = r * grow * (.8 + .3 * Math.sin(k * 2.1 + px * .13) * Math.cos(k * 1.3 + py * .11) + (((k * 7 + Math.floor(px)) % 5) - 2) * .03); pts.push([px + Math.cos(a + rot) * rr, py + Math.sin(a + rot) * rr * sq]); }
      x.beginPath(); const mid = (i, j) => [(pts[i][0] + pts[j][0]) / 2, (pts[i][1] + pts[j][1]) / 2], m0 = mid(n - 1, 0); x.moveTo(m0[0], m0[1]);
      for (let k = 0; k < n; k++) { const m = mid(k, (k + 1) % n); x.quadraticCurveTo(pts[k][0], pts[k][1], m[0], m[1]); } x.closePath(); };
    x.fillStyle = P ? '#808080' : '#686a62'; x.fillRect(0, 0, S, S);
    if (!P) for (let i = 0; i < 70; i++) { const px = rnd() * S, py = rnd() * S, r = 60 + rnd() * 150, tone = rnd() < .5 ? '30,32,28' : '160,162,150', al = .05 + rnd() * .08; // low-frequency tone drift
      wrap(() => { const g = x.createRadialGradient(px, py, 0, px, py, r); g.addColorStop(0, `rgba(${tone},${al})`); g.addColorStop(1, `rgba(${tone},0)`); x.fillStyle = g; x.fillRect(px - r, py - r, 2 * r, 2 * r); }); }
    for (let i = 0; i < 5; i++) { // tar-and-gravel patches: a dark bitumen blob with a pale gravel dusting
      const px = rnd() * S, py = rnd() * S, r = 55 + rnd() * 90, sq = .5 + rnd() * .5, rot = rnd() * 3, seed = rnd() * 99;
      const lobes = Array.from({ length: 3 }, () => [px + (rnd() - .5) * r * 1.1, py + (rnd() - .5) * r * .9, r * (.5 + rnd() * .35), .35 + rnd() * .6, rnd() * 3]); // (three overlapping lobes: an uneven spill, not one oval)
      wrap(() => { for (const gr of [1.1, .95, .8, .65]) for (const [lx, ly, lr, lsq, lrot] of lobes) { blob(lx, ly, lr, lsq, lrot, gr); x.fillStyle = P ? 'rgba(160,160,160,.2)' : 'rgba(58,58,52,.1)'; x.fill(); } // (feathered: a few nested layers, so the edge fades instead of ending hard)
        x.save(); blob(px, py, r * 1.0, sq, rot); x.clip(); const q = rng(seed | 0); for (let k = 0; k < 900; k++) { x.fillStyle = P ? `rgba(255,255,255,${q() * .4})` : `rgba(${q() < .5 ? '170,172,160' : '85,86,80'},${.18 + q() * .3})`; x.fillRect(px + (q() - .5) * 2.4 * r, py + (q() - .5) * 2.4 * r, 1.5 + q() * 2, 1.5 + q() * 2); } x.restore(); });
    }
    for (let i = 0; i < 4; i++) { // bare gravel: scattered stones thickening toward the middle of a loose patch
      const px = rnd() * S, py = rnd() * S, r = 50 + rnd() * 80, seed = rnd() * 99;
      wrap(() => { const q = rng(seed | 0); for (let k = 0; k < 700; k++) { const a = q() * 6.283, d2 = Math.sqrt(q()) * r; x.fillStyle = P ? `rgba(255,255,255,${.2 + q() * .5})` : `rgba(${q() < .5 ? '175,176,166' : '55,57,52'},${.2 + q() * .4})`; x.fillRect(px + Math.cos(a) * d2, py + Math.sin(a) * d2 * .8, 1.5 + q() * 3, 1.5 + q() * 2.5); } });
    }
    // (no drawn lines: cracks and joints read as scribbles from above. The surface is broken up with soft areas instead: faintly different slabs, damp rings where water has stood, and grime.)
    for (let i = 0; i < 26; i++) { // slab-sized areas that weathered a little differently: soft-edged, barely lighter or darker
      const px = rnd() * S, py = rnd() * S, w = 140 + rnd() * 200, h = 120 + rnd() * 160, lit = rnd() < .5;
      wrap(() => { x.save(); if (!P) x.filter = 'blur(26px)'; x.fillStyle = P ? 'rgba(128,128,128,.06)' : (lit ? 'rgba(150,152,140,.09)' : 'rgba(36,38,32,.09)'); x.fillRect(px, py, w, h); x.restore(); });
    }
    if (!P) for (let i = 0; i < 12; i++) { // damp stains where water has run and dried: uneven, stretched along the fall of the roof, no rim, fading out
      const px = rnd() * S, py = rnd() * S, r = 30 + rnd() * 60, parts = Array.from({ length: 4 }, () => [px + (rnd() - .5) * r * 1.6, py + (rnd() - .5) * r * 2.4, r * (.35 + rnd() * .4), .35 + rnd() * .5, (rnd() - .5) * .5 + 1.57]);
      wrap(() => { for (const gr of [1.15, .95, .75, .55]) for (const [lx, ly, lr, lsq, lrot] of parts) { blob(lx, ly, lr, lsq, lrot, gr); x.fillStyle = 'rgba(40,42,36,.035)'; x.fill(); } });
    }
    if (!P) {
      for (let i = 0; i < 14; i++) { const px = 60 + rnd() * (S - 120), py = 60 + rnd() * (S - 120), r = 7 + rnd() * 16, g = x.createRadialGradient(px, py, 0, px, py, r); // oil and rust spots
        g.addColorStop(0, rnd() < .5 ? 'rgba(14,12,10,.5)' : 'rgba(110,56,26,.45)'); g.addColorStop(1, 'rgba(14,12,10,0)'); x.fillStyle = g; x.fillRect(px - r, py - r, 2 * r, 2 * r); }
      for (let i = 0; i < 12000; i++) { const v = rnd(); x.fillStyle = `rgba(${v < .5 ? '25,28,22' : '195,198,184'},${.04 + rnd() * .09})`; x.fillRect(rnd() * S, rnd() * S, 1.5 + rnd(), 1.5 + rnd()); } // grit
    } else for (let i = 0; i < 12000; i++) { x.fillStyle = `rgba(${rnd() < .5 ? '0,0,0' : '255,255,255'},${rnd() * .12})`; x.fillRect(rnd() * S, rnd() * S, 2, 2); }
  };
  const rough = canvasTex(S, S, x => { // roughness: matte damp deck with smooth glossy wet patches where water lies
    const r2 = rng(909);
    x.fillStyle = '#aaaaaa'; x.fillRect(0, 0, S, S);
    for (let i = 0; i < 26; i++) { const px = r2() * S, py = r2() * S, r = 50 + r2() * 130, sq = .5 + r2() * .5, rot = r2() * 3;
      for (const dx of [-S, 0, S]) for (const dy of [-S, 0, S]) { x.save(); x.translate(px + dx, py + dy); x.rotate(rot); x.scale(1, sq);
        const g = x.createRadialGradient(0, 0, 0, 0, 0, r); g.addColorStop(0, 'rgba(34,34,34,.9)'); g.addColorStop(.6, 'rgba(34,34,34,.55)'); g.addColorStop(1, 'rgba(34,34,34,0)'); x.fillStyle = g; x.beginPath(); x.arc(0, 0, r, 0, 6.283); x.fill(); x.restore(); } }
  });
  return { colour: canvasTex(S, S, x => draw(x, 0)), bump: canvasTex(S, S, x => draw(x, 1)), rough };
}

function gratingTexture() { // a steel mesh walkway: dark gaps seen between a lighter grid of bars
  return canvasTex(64, 64, (x, W, Hh) => {
    x.fillStyle = '#1c1f1a'; x.fillRect(0, 0, W, Hh);
    x.fillStyle = '#8f8a74'; for (let i = 0; i < W; i += 8) { x.fillRect(i, 0, 3, Hh); x.fillRect(0, i, W, 2); }
  });
}

// A box with its sides textured along the wall (u: metres / WALL_W, v: 0..1 the full height) and its top laid by world position
// (metres / ROOF_M from the map's origin, so the roofs of neighbouring blocks share one set of sheets and seams).
function wallBox(w, h, d, cx, cz) {
  const g = new THREE.BoxGeometry(w, h, d), uv = g.attributes.uv, pos = g.attributes.position, along = [d, d, w, w, w, w];
  for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) {
    const i = f * 4 + k;
    if (f === 2 || f === 3) uv.setXY(i, (cx + pos.getX(i)) / ROOF_M, (cz + pos.getZ(i)) / ROOF_M);
    else uv.setXY(i, uv.getX(i) * along[f] / WALL_W, uv.getY(i));
  }
  return g;
}

// rects: the building cells as rectangles ({ r0, r1, c0, c1 }, already run on past the map's sides); isK(r, c): whether a cell is
// building; at(r, c): a cell's north-west corner (world). xLimit: details stay within |x| <= xLimit (past the map's sides is never seen).
export function buildFortress(group, rects, isK, at, cell, H, xLimit = Infinity, noRailShadows = false) { // noRailShadows: the roof-edge handrails cast no shadow (stage 6)
  const { colour, bump, rough } = wallTextures(H);
  // Rain-wet: a touch darker, with the glossy runs and wet patches from the roughness maps catching the sky (the environment light, not a true mirror)
  const wall = new THREE.MeshStandardMaterial({ map: colour, bumpMap: bump, bumpScale: .08, roughnessMap: rough, roughness: 1, color: 0xb4b8bb, envMapIntensity: .4 });
  const rt = roofTextures(), roof = new THREE.MeshStandardMaterial({ map: rt.colour, bumpMap: rt.bump, bumpScale: .08, roughnessMap: rt.rough, roughness: 1, color: 0xb4b8bb, envMapIntensity: .42 });
  wall.shadowSide = roof.shadowSide = THREE.FrontSide;
  const plinth = new THREE.MeshStandardMaterial({ color: 0x4f514a, roughness: .97, envMapIntensity: .2 });
  const trim = new THREE.MeshStandardMaterial({ color: 0x8e9388, roughness: .93, envMapIntensity: .25 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x16222a, roughness: .12, metalness: .7, envMapIntensity: .8 });
  const door = new THREE.MeshStandardMaterial({ color: 0x40463d, roughness: .55, metalness: .55, envMapIntensity: .4 });
  const steel = new THREE.MeshStandardMaterial({ color: 0x70787a, roughness: .5, metalness: .6, envMapIntensity: .45 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x23271f, roughness: .65, metalness: .4 });
  const lamp = new THREE.MeshStandardMaterial({ color: 0xfff2c8, emissive: 0xffe6a0, emissiveIntensity: .7 });
  const white = new THREE.MeshStandardMaterial({ color: 0xdfe2dc, roughness: .5, metalness: .15, envMapIntensity: .5, side: THREE.DoubleSide });
  const grating = new THREE.MeshStandardMaterial({ map: gratingTexture(), roughness: .6, metalness: .5, envMapIntensity: .3 });
  const pipeM = new THREE.MeshStandardMaterial({ color: 0xc9cdc6, roughness: .5, metalness: .35, envMapIntensity: .5 });
  const rungM = new THREE.MeshStandardMaterial({ color: 0xc19a1c, roughness: .55, metalness: .3 });
  const para = new THREE.MeshStandardMaterial({ color: 0x66695f, roughness: .95, envMapIntensity: .2 });
  const wood = new THREE.MeshStandardMaterial({ color: 0x7b6342, roughness: .9 });
  const drums = [0x4a5230, 0x2f4d78, 0x8c4c2a].map(c => new THREE.MeshStandardMaterial({ color: c, roughness: .55, metalness: .5, envMapIntensity: .4 }));
  const toolRed = new THREE.MeshStandardMaterial({ color: 0xa32c22, roughness: .5, metalness: .3 });
  const cableM = new THREE.MeshStandardMaterial({ color: 0xc2661e, roughness: .7 });
  const beacon = new THREE.MeshStandardMaterial({ color: 0xff2a1a, emissive: 0xff1000, emissiveIntensity: 1.2 });
  const wire = new THREE.MeshStandardMaterial({ color: 0x1b1d1c, roughness: .6, metalness: .6 });
  const stainM = new THREE.MeshStandardMaterial({ map: canvasTex(64, 64, (x, W, Hh) => { const g = x.createRadialGradient(W / 2, Hh / 2, 2, W / 2, Hh / 2, W / 2); g.addColorStop(0, 'rgba(25,18,12,.75)'); g.addColorStop(.5, 'rgba(60,40,24,.35)'); g.addColorStop(1, 'rgba(60,40,24,0)'); x.fillStyle = g; x.fillRect(0, 0, W, Hh); }),
    transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, roughness: 1 }); // oil and rust round machinery exhausts
  const grimeM = new THREE.MeshStandardMaterial({ map: canvasTex(8, 64, (x, W, Hh) => { const g = x.createLinearGradient(0, 0, 0, Hh); g.addColorStop(0, 'rgba(20,18,14,.7)'); g.addColorStop(.35, 'rgba(30,26,20,.3)'); g.addColorStop(1, 'rgba(30,26,20,0)'); x.fillStyle = g; x.fillRect(0, 0, W, Hh);
    for (let i = 0; i < 40; i++) { x.fillStyle = `rgba(10,10,8,${Math.random() * .25})`; x.fillRect(Math.random() * W, Math.random() * Hh * .5, 1, 1 + Math.random() * 3); } }),
    transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, roughness: 1 }); // dirt that gathers where the roof meets the parapet
  const dripM = new THREE.MeshStandardMaterial({ map: canvasTex(32, 64, (x, W, Hh) => { const g = x.createLinearGradient(0, 0, 0, Hh); g.addColorStop(0, 'rgba(120,58,26,.7)'); g.addColorStop(.5, 'rgba(70,36,20,.35)'); g.addColorStop(1, 'rgba(70,36,20,0)'); x.fillStyle = g; x.fillRect(W * .3, 0, W * .4, Hh); x.fillRect(W * .1, 0, W * .12, Hh * .6); x.fillRect(W * .8, 0, W * .1, Hh * .45); }),
    transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, roughness: 1 }); // rust running from a drum's seam
  // The marking at the foot of the bay door: a diagonal yellow-and-black hazard stripe, faded and scuffed (paint worn off in patches, dirt, tyre rubber), not a flat bright yellow bar
  const hazard = new THREE.MeshStandardMaterial({ map: canvasTex(256, 64, (x, W, Hh) => {
    const r2 = rng(5150);
    x.fillStyle = '#2b2c27'; x.fillRect(0, 0, W, Hh);
    x.fillStyle = '#a89038'; for (let i = -Hh; i < W + Hh; i += 44) { x.beginPath(); x.moveTo(i, Hh); x.lineTo(i + 22, Hh); x.lineTo(i + 22 + Hh, 0); x.lineTo(i + Hh, 0); x.fill(); } // 45-degree stripes
    for (let i = 0; i < 700; i++) { x.fillStyle = `rgba(${r2() < .5 ? '40,40,34' : '150,140,110'},${.1 + r2() * .35})`; x.fillRect(r2() * W, r2() * Hh, 1 + r2() * 4, 1 + r2() * 3); } // worn paint and grit
    for (let i = 0; i < 9; i++) { const g = x.createRadialGradient(0, 0, 0, 0, 0, 1); x.save(); x.translate(r2() * W, r2() * Hh); x.scale(14 + r2() * 30, 8 + r2() * 14); g.addColorStop(0, 'rgba(36,34,28,.55)'); g.addColorStop(1, 'rgba(36,34,28,0)'); x.fillStyle = g; x.beginPath(); x.arc(0, 0, 1, 0, 6.283); x.fill(); x.restore(); } // dirt and tyre rubber
    x.fillStyle = 'rgba(20,20,18,.45)'; x.fillRect(0, 0, W, 3); x.fillRect(0, Hh - 3, W, 3);
  }), roughness: .85, envMapIntensity: .2 });
  for (const m of [wall, roof, door, glass, steel, dark, white, grating, pipeM, wire, trim, plinth, para, hazard]) m.userData.mirrorMatte = true; // (the puddle mirror draws these matte: their wet gloss would flare white in the mirror's angle of view, see puddles.js)
  const mats = [wall, wall, roof, roof, wall, wall];
  const extra = new THREE.Group(), rnd = rng(1986);
  const add = (geo, m, x, y, z, ry = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.rotation.y = ry; o.castShadow = o.receiveShadow = true; extra.add(o); return o; };
  const box = (w, h, d, m, x, y, z, ry = 0) => add(new THREE.BoxGeometry(w, h, d), m, x, y, z, ry);
  const railSteel = noRailShadows ? steel.clone() : steel; railSteel.userData.mirrorMatte = true; // (the handrails: when they cast no shadow they need a material of their own, because the static merge joins every mesh of one material into one that casts a shadow if ANY piece of it does)

  const gratingBox = (w, d, x, y, z) => { // a mesh walkway panel: the bars' pattern runs at a fixed size whatever its length
    const g = new THREE.BoxGeometry(w, .08, d), uv = g.attributes.uv;
    for (let i = 8; i < 16; i++) uv.setXY(i, uv.getX(i) * w / .6, uv.getY(i) * d / .6);
    const o = new THREE.Mesh(g, grating); o.position.set(x, y, z); o.castShadow = o.receiveShadow = true; extra.add(o); return o;
  };
  const cyl = (r, len, m, x, y, z, rx = 0, rz = 0) => { const o = add(new THREE.CylinderGeometry(r, r, len, 10), m, x, y, z); o.rotation.set(rx, 0, rz); return o; };
  // The NES draws some blocks with diagonal edges, which the map cells render as one-cell staircases. Each step's empty corner cell (a "notch") is filled with a wedge: a flat diagonal wall between the two
  // outer corners, with a roof triangle behind it and its own plinth, ledges and parapet, so the edge reads as one smooth diagonal wall. (The cells still block as before: the jeep can't reach into a notch anyway.)
  const inKeep = (r, c) => rects.some(q => r >= q.r0 && r <= q.r1 && c >= q.c0 && c <= q.c1);
  const notches = new Map();
  { const rLo = Math.min(...rects.map(q => q.r0)) - 2, rHi = Math.max(...rects.map(q => q.r1)) + 2, cLo = Math.max(0, Math.min(...rects.map(q => q.c0))), cHi = Math.max(...rects.map(q => q.c1)) + 2;
    for (let r = rLo; r <= rHi; r++) for (let c = cLo; c <= cHi; c++) {
      if (isK(r, c)) continue;
      for (const [sr, sc] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        if (isK(r - sr, c) && isK(r, c - sc) && isK(r - sr, c - sc) && !isK(r - sr, c + sc) && !isK(r + sr, c - sc) && inKeep(r - sr, c) && inKeep(r, c - sc)) { notches.set(`${r},${c}`, { r, c, sr, sc }); break; }
      }
    } }
  const tops = []; // things standing on the roofs that the rain lands on (the camouflage nets), for the rain's splashes
  const roofs = []; // each block's roof: the rectangle the roof puddles lie on (kept off the parapet along an outer edge)
  const bodies = new THREE.Group(); // every block's body: merged at the end into one mesh per material (a body a box was two draw calls, in every pass)
  let doorsLeft = 99;
  for (const { r0, r1, c0, c1 } of rects) {
    const p0 = at(r0, c0), w = (c1 - c0 + 1) * cell, d = (r1 - r0 + 1) * cell, cx = p0.x + w / 2, cz = p0.z + d / 2;
    const body = new THREE.Mesh(wallBox(w, H, d, cx, cz), mats); body.position.set(cx, H / 2, cz); body.castShadow = body.receiveShadow = true; bodies.add(body);
    const runs = side => { // the outside walls: runs of cells whose neighbour isn't building
      const out = [], n = side[0] ? c1 - c0 + 1 : r1 - r0 + 1;
      let s = -1;
      for (let k = 0; k <= n; k++) {
        const r = side[0] ? (side[0] < 0 ? r0 : r1) : r0 + k, c = side[0] ? c0 + k : (side[1] < 0 ? c0 : c1);
        const open = k < n && !isK(r + side[0], c + side[1]) && !notches.has(`${r + side[0]},${c + side[1]}`);
        if (open && s < 0) s = k; if (!open && s >= 0) { out.push([s, k - 1]); s = -1; }
      }
      return out;
    };
    const faces = { s: [1, 0], n: [-1, 0], e: [0, 1], w: [0, -1] };
    { const ins = .4, nR = r1 - r0 + 1, nC = c1 - c0 + 1; // (an edge shared with another block is not inset: the roof goes on across it)
      const joined = edge => edge === 'w' ? [...Array(nR)].some((_, k) => isK(r0 + k, c0 - 1)) : edge === 'e' ? [...Array(nR)].some((_, k) => isK(r0 + k, c1 + 1)) : edge === 'n' ? [...Array(nC)].some((_, k) => isK(r0 - 1, c0 + k)) : [...Array(nC)].some((_, k) => isK(r1 + 1, c0 + k));
      roofs.push({ x0: p0.x + (joined('w') ? 0 : ins), x1: p0.x + w - (joined('e') ? 0 : ins), z0: p0.z + (joined('n') ? 0 : ins), z1: p0.z + d - (joined('s') ? 0 : ins) }); }
    let doorDone = false;
    for (const [dr, dc] of Object.values(faces)) for (const [k0, k1] of runs([dr, dc])) {
      const along = dr !== 0, o = dr || dc;
      const a = (along ? p0.x : p0.z) + k0 * cell, b = (along ? p0.x : p0.z) + (k1 + 1) * cell, len = b - a, mid = (a + b) / 2;
      const edge = along ? (dr < 0 ? p0.z : p0.z + d) : (dc < 0 ? p0.x : p0.x + w);
      if (!along && Math.abs(edge) > xLimit) continue; // an end wall out past the map's side: never seen
      const at3 = (u, out) => along ? [u, edge + o * out] : [edge + o * out, u];
      const seen = u => !along || Math.abs(u) <= xLimit;
      const run = (h, y, out, m, l = len, u = mid) => { const [x, z] = at3(u, out / 2); box(along ? l : out, h, along ? out : l, m, x, y, z); };
      { // the roof edge: a parapet wall and its cap. At a convex corner the two walls simply meet (the cap carries on by its overhang, .1 m, so the corner is one clean mitre); at a concave corner each run reaches .2 m
        // on past where it ends, so the inside corner is filled and the edge turns without a gap
        const face = along ? (dr < 0 ? r0 : r1) : (dc < 0 ? c0 : c1);
        const beyondA = along ? isK(face, c0 + k0 - 1) : isK(r0 + k0 - 1, face), beyondB = along ? isK(face, c0 + k1 + 1) : isK(r0 + k1 + 1, face);
        const ext = (e, concave) => concave ? .2 : e; // (convex: e)
        const pa = ext(0, beyondA), pb = ext(0, beyondB), ca = ext(.1, beyondA), cb = ext(.1, beyondB);
        const lp = len + pa + pb, up = mid + (pb - pa) / 2, lc = len + ca + cb, uc = mid + (cb - ca) / 2;
        const [x, z] = at3(up, -.1);
        box(along ? lp : .2, .3, along ? .2 : lp, para, x, H + .15, z);                                       // the parapet wall, flush with the face
        const [cx2, cz2] = at3(uc, -.05); box(along ? lc : .3, .1, along ? .3 : lc, trim, cx2, H + .35, cz2); // its precast cap, overhanging the face a little
        const [dx, dz] = at3(uc, .1); box(along ? lc : .03, .04, along ? .03 : lc, dark, dx, H + .3, dz);    // the drip groove under the cap's lip
        { const n = Math.max(1, Math.round(lp / 2.4)); // a safety handrail along the roof edge: posts and two rails standing on the cap
          for (let i = 0; i <= n; i++) { const [px, pz] = at3(up - lp / 2 + i * lp / n, -.12); if (along && Math.abs(px) > xLimit + 1) continue; box(.05, .85, .05, railSteel, px, H + .825, pz).castShadow = !noRailShadows; }
          for (const y of [H + .85, H + 1.22]) { const [rx, rz] = at3(up, -.12); box(along ? lp : .04, .04, along ? .04 : lp, railSteel, rx, y, rz).castShadow = !noRailShadows; }
          if (!along ? Math.abs(edge) <= xLimit : true) { // a strip of grime along the inner foot of the parapet, darkest at the wall, fading into the roof
            const WID = 1.0, [gx, gz] = at3(up, -.3 - WID / 2), geo = new THREE.PlaneGeometry(lp, WID); geo.rotateX(-Math.PI / 2); if (!along) geo.rotateY(Math.PI / 2); geo.translate(gx, H + .014, gz);
            const gp = geo.attributes.position, guv = geo.attributes.uv;
            for (let i = 0; i < gp.count; i++) { const dist = along ? -o * (gp.getZ(i) - edge) : -o * (gp.getX(i) - edge); guv.setY(i, 1 - Math.min(1, Math.max(0, (dist - .3) / WID))); guv.setX(i, 1); }
            const gm = new THREE.Mesh(geo, grimeM); gm.receiveShadow = true; extra.add(gm); } }
        for (let t = -lc / 2 + 1.5; t < lc / 2 - .3; t += 3) { const [jx, jz] = at3(uc + t, -.05); box(along ? .03 : .32, .11, along ? .32 : .03, dark, jx, H + .35, jz); } // joints between the cap sections
        for (let t = -lc / 2 + 2.6; t < lc / 2 - .6; t += 6) { const [ix, iz] = at3(uc + t, -.21); box(along ? .24 : .03, .08, along ? .03 : .24, dark, ix, H + .1, iz); } // weep holes on the roof side
      }
      run(.25, H - .25, .18, trim);            // a drip course under it
      run(.18, H * .52, .1, trim);             // a string course between the floors
      const keepOut = []; // stretches of this wall already taken by the pipes and ladder: nothing else goes there
      if (len > 9 && rnd() < .55) { // two big exhaust pipes up the wall on clamps, and a steel ladder beside them to the roof, in the plain wall between two windows
        const gaps = []; // (a window spans 3.2 m with its hood, every 6 m from a + 1.1: 2.8 m of plain wall between)
        for (let g0 = a + 4.5; g0 + 2.3 < b - .3; g0 += 6) if (!(dr > 0 && g0 < mid + 4.4 && g0 + 2.3 > mid - 4.6)) gaps.push(g0); // (not on the south wall's doors)
        const u0 = gaps.length ? gaps[Math.floor(rnd() * gaps.length)] + .45 : null;
        if (u0 !== null && seen(u0 + 1.8)) {
          keepOut.push([u0 - .6, u0 + 2.2]);
          for (const du of [0, .6]) { const [x, z] = at3(u0 + du, .6); cyl(.22, H - .7, pipeM, x, (H - .7) / 2 + .35, z);
            for (const y of [1.2, H * .5, H - 1.4]) cyl(.27, .1, dark, x, y, z); }
          const [tx, tz] = at3(u0 + .3, .6); box(along ? 1.4 : .12, .12, along ? .12 : 1.4, pipeM, tx, H - .5, tz); // a bracket tying the pair
          const lu = u0 + 1.7;
          for (const du of [-.22, .22]) { const [x, z] = at3(lu + du, .45); box(.06, H + .9, .06, rungM, x, (H + .9) / 2, z); // the rails, held off the wall on stand-offs
            for (const y of [1.0, H * .52 + .5, H - 1.1]) { const [sx, sz] = at3(lu + du, .22); box(along ? .05 : .46, .06, along ? .46 : .05, steel, sx, y, sz); } }
          for (let y = .4; y < H + .7; y += .32) { const [x, z] = at3(lu, .45); box(along ? .5 : .06, .05, along ? .06 : .5, rungM, x, y, z); }
        } }
      for (let u = a + 1.2; u < b - 4.2; u += 6) { // a ribbon window in each bay: dark glass behind a steel blast-shutter frame, with a hood
        const wu = u + 1.5;
        if (!seen(wu)) continue;
        const [fx, fz] = at3(wu, .06), [gx, gz] = at3(wu, .1), [hx, hz] = at3(wu, .3);
        box(along ? 3.0 : .1, 1.3, along ? .1 : 3.0, steel, fx, 4.7, fz);
        box(along ? 2.7 : .1, .95, along ? .1 : 2.7, glass, gx, 4.7, gz);
        for (const t of [-.9, 0, .9]) { const [bx, bz] = at3(wu + t, .13); box(along ? .06 : .05, .95, along ? .05 : .06, dark, bx, 4.7, bz); } // bars
        box(along ? 3.2 : .5, .12, along ? .5 : 3.2, trim, hx, 5.45, hz);               // concrete hood over it
      }
      if (rnd() < .5) for (let u = a + 3.2; u < b - 3; u += 12) { // a floodlight on a bracket
        if (!seen(u) || keepOut.some(([k0, k1]) => u > k0 - .6 && u < k1 + .6)) continue;
        const [x, z] = at3(u, .45), [lx, lz] = at3(u, .62), [bx, bz] = at3(u, .22);
        box(.5, .22, .3, dark, x, H - .9, z, along ? 0 : Math.PI / 2); box(.3, .1, .1, lamp, lx, H - .98, lz); box(.08, .08, .5, steel, bx, H - .95, bz, along ? 0 : Math.PI / 2);
      }
      if (len > 5 && rnd() < .6) { const u = a + 1.8 + rnd() * Math.max(0, len - 3.6); if (seen(u) && !keepOut.some(([k0, k1]) => u > k0 - .5 && u < k1 + .5)) { // a cable tray up the wall, and a camera on a stalk at the top
        const [x, z] = at3(u, .1), [kx, kz] = at3(u, .6);
        box(.3, H - 1.6, .06, dark, x, (H + .8) / 2 - .4, z, along ? 0 : Math.PI / 2);
        box(.2, .2, .45, dark, kx, H - .6, kz, along ? 0 : Math.PI / 2); } }
      if (!doorDone && len > 8 && doorsLeft > 0 && dr > 0) { // the south face: a roll-up vehicle bay door and an armoured personnel door
        doorDone = true; doorsLeft--;
        const bay = mid - 2.2, man = mid + 2.8;
        { // the vehicle bay: a dark recess, slim steel guide channels, a roll-up shutter of slats, a coil housing and a lintel above, a hazard-yellow sill
          const P = (u, out) => at3(u, out), seg = (wA, hh, dA, m, u, y, out) => { const [x, z] = P(u, out); box(along ? wA : dA, hh, along ? dA : wA, m, x, y, z); };
          seg(3.7, 3.4, .1, dark, bay, 1.7, .05);                                                                    // the opening, in shadow
          for (const sd of [-1.85, 1.85]) seg(.14, 3.4, .16, steel, bay + sd, 1.7, .08);                              // guide channels
          seg(3.6, 3.2, .06, door, bay, 1.65, .08);                                                                  // the shutter
          for (let y = .45; y < 3.2; y += .3) seg(3.5, .04, .05, dark, bay, y, .12);                                 // its slats
          seg(3.9, .55, .36, steel, bay, 3.62, .18);                                                                 // the coil housing over it
          seg(4.1, .2, .22, trim, bay, 4.0, .11);                                                                    // the concrete lintel
          seg(4.1, .16, .72, plinth, bay, .08, .36);                                                                  // a concrete apron in front of the door
          seg(3.7, .035, .42, steel, bay, .178, .3);                                                                 // a steel threshold plate
          { const [hx, hz] = at3(bay, .52), hg = new THREE.BoxGeometry(3.7, .02, .3), huv = hg.attributes.uv; for (let i = 8; i < 16; i++) huv.setX(i, huv.getX(i) * 3.7 / 1.7); // (the stripes' repeat: a fixed size whatever the length)
            add(hg, hazard, hx, .172, hz, along ? 0 : Math.PI / 2); } }                                               // and a worn hazard stripe painted along the apron's edge
        { // the personnel door: slim steel frame in a recess, a leaf with a vision slit, kick plate and handle, a flat canopy on brackets and a lamp
          const P = (u, out) => at3(u, out), seg = (wA, hh, dA, m, u, y, out) => { const [x, z] = P(u, out); box(along ? wA : dA, hh, along ? dA : wA, m, x, y, z); };
          seg(1.3, 2.7, .1, dark, man, 1.35, .05);
          for (const sd of [-.62, .62]) seg(.07, 2.7, .12, steel, man + sd, 1.35, .07);                               // jambs
          seg(1.3, .08, .12, steel, man, 2.7, .07);                                                                  // head
          seg(1.12, 2.55, .06, door, man, 1.28, .08);                                                                // the leaf
          seg(.3, .5, .02, glass, man, 1.85, .12);                                                                   // vision slit
          seg(1.0, .25, .02, steel, man, .2, .12);                                                                   // kick plate
          seg(.05, .3, .06, steel, man + .42, 1.15, .13);                                                            // handle
          seg(1.6, .08, .55, steel, man, 2.95, .32);                                                                 // the canopy
          for (const sd of [-.6, .6]) seg(.05, .3, .05, steel, man + sd, 2.78, .1);                                   // its brackets
          seg(.3, .1, .2, lamp, man, 2.86, .45); }
      }
    }
    // roof plant
    const area = w * d, taken = [];
    const spot = r => {
      if (w < 6 + 2 * r || d < 6 + 2 * r) return null;
      const xLo = Math.max(p0.x + 2.2 + r, r - xLimit), xHi = Math.min(p0.x + w - 2.2 - r, xLimit - r);
      if (xHi < xLo) return null;
      for (let t = 0; t < 14; t++) {
        const x = xLo + rnd() * (xHi - xLo), z = p0.z + 2.2 + r + rnd() * (d - 4.4 - 2 * r);
        if (taken.every(q => Math.hypot(q.x - x, q.z - z) > q.r + r + .6)) { taken.push({ x, z, r }); return { x, z }; }
      }
      return null;
    };
    if (area > 150) spot(2.4); // (the radar dome that stood here is gone; its spot is still claimed, so the rest of the roof keeps its layout)
    if (area > 150) spot(2.2); // (the spot the camouflage net used to take is still claimed, so the rest of the roof keeps its layout)
    const drip = (x, z, len = 1.3) => { const o = new THREE.Mesh(new THREE.PlaneGeometry(.8, len), dripM); o.rotation.set(-Math.PI / 2, 0, rnd() * 6.28); o.position.set(x, H + .013, z); o.receiveShadow = true; extra.add(o); }; // a rust streak running off something
    const stain = (x, z, r) => { const o = new THREE.Mesh(new THREE.PlaneGeometry(r * 2, r * 2), stainM); o.rotation.set(-Math.PI / 2, 0, rnd() * 6.28); o.position.set(x, H + .012, z); o.receiveShadow = true; extra.add(o); };
    const wireBetween = (a, b, r = .014) => { const from = new THREE.Vector3(...a), to = new THREE.Vector3(...b), len = from.distanceTo(to);
      const o = add(new THREE.CylinderGeometry(r, r, len, 4), wire, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2); o.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), to.sub(from).normalize()); o.castShadow = false; return o; };
    const spotLine = (half, r) => { // a place for a row of things along x, half a length each way of its middle, r deep
      if (w < 2 * half + 4.4 || d < 6 + 2 * r) return null;
      const xLo = Math.max(p0.x + 2.2 + half, half - xLimit), xHi = Math.min(p0.x + w - 2.2 - half, xLimit - half);
      if (xHi < xLo) return null;
      for (let t = 0; t < 14; t++) {
        const x = xLo + rnd() * (xHi - xLo), z = p0.z + 2.2 + r + rnd() * (d - 4.4 - 2 * r), offs = []; for (let o = -half; o <= half + .01; o += 1.6) offs.push(o);
        if (offs.every(o => taken.every(q => Math.hypot(q.x - (x + o), q.z - z) > q.r + r + .6))) { for (const o of offs) taken.push({ x: x + o, z, r }); return { x, z }; }
      }
      return null;
    };
    const acUnit = (x, z) => { // a big air-conditioning unit: a casing on rails with two guarded fans, a louvred front, and the rust and oil it breathes onto the roof
      for (const sz of [-.5, .5]) box(3.0, .12, .12, dark, x, H + .06, z + sz);
      box(2.9, .75, 1.5, white, x, H + .5, z);
      for (const sx of [-.7, .7]) { cyl(.5, .05, dark, x + sx, H + .9, z);
        const g = add(new THREE.TorusGeometry(.52, .035, 6, 20), steel, x + sx, H + .94, z); g.rotation.x = Math.PI / 2;
        for (let t = 0; t < 3; t++) box(1.0, .02, .03, steel, x + sx, H + .95, z, t * Math.PI / 3);
        cyl(.1, .1, steel, x + sx, H + .94, z); }
      for (let y = .3; y < .8; y += .1) box(2.7, .03, .02, dark, x, H + .12 + y, z + .76);
      stain(x + .2, z + 1.0, 1.5); drip(x - .8, z + 1.2, 1.1); drip(x + .9, z + 1.1, 1.4);
    };
    // a mesh catwalk across the longer way of a big roof, on posts with rails, a white pipe run beside it and an elbow dropping through the roof
    if (Math.max(w, d) > 16 && Math.min(w, d) > 7) {
      const alongX = w >= d, L = (alongX ? w : d) - 7, off = (rnd() - .5) * ((alongX ? d : w) - 7) * .5;
      const start = (alongX ? p0.x : p0.z) + 3.5, mid = start + L / 2;
      const [wx, wz] = alongX ? [mid, cz + off] : [cx + off, mid];
      if (!alongX || (Math.abs(start) < xLimit && Math.abs(start + L) < xLimit)) {
        gratingBox(alongX ? L : 1.1, alongX ? 1.1 : L, wx, H + .55, wz);
        for (let t = 0; t <= L + .01; t += 3) for (const sd of [-.55, .55]) { // posts and rails
          const [x, z] = alongX ? [start + t, wz + sd] : [wx + sd, start + t]; box(.06, .55, .06, steel, x, H + .275, z); box(.05, 1.0, .05, steel, x, H + 1.0, z); }
        for (const sd of [-.55, .55]) box(alongX ? L : .05, .05, alongX ? .05 : L, steel, wx + (alongX ? 0 : sd), H + 1.5, wz + (alongX ? sd : 0));
        for (let t = 0; t <= L; t += 2.2) taken.push({ x: alongX ? start + t : wx, z: alongX ? wz : start + t, r: 1.2 });
        const sd = (off > 0 ? -1 : 1) * 2.0; // the pipe run, on the side with more room
        const px = alongX ? wx : wx + sd, pz = alongX ? wz + sd : wz, run = L * .7;
        cyl(.2, run, pipeM, px, H + .55, pz, alongX ? 0 : Math.PI / 2, alongX ? Math.PI / 2 : 0);
        for (let t = -run / 2; t <= run / 2; t += 3) { box(alongX ? .12 : .5, .4, alongX ? .5 : .12, dark, alongX ? px + t : px, H + .2, alongX ? pz : pz + t); taken.push({ x: alongX ? px + t : px, z: alongX ? pz : pz + t, r: .8 }); } // saddles
        const ex = alongX ? px + run / 2 : px, ez = alongX ? pz : pz + run / 2;
        add(new THREE.SphereGeometry(.22, 10, 8), pipeM, ex, H + .55, ez); cyl(.2, .55, pipeM, ex, H + .27, ez); // an elbow dropping through the roof
        stain(ex, ez, 1.0);
      }
    }
    // utility clusters (an air-conditioning bank, or a cooling tower with its pump skid), a comms array, skylights, hatches, penthouses, vents and clutter, each in its own free place
    const kinds = ['hvac', 'tower', 'comms', 'skylight', 'hatch', 'vent', 'penthouse', 'hvac', 'comms'];
    const count = Math.max(2, Math.floor(area / 45));
    for (let i = 0; i < count; i++) {
      const k = kinds[Math.floor(rnd() * kinds.length)];
      if (k === 'hvac') { const n2 = 2 + Math.floor(rnd() * 2), half = n2 * 1.6 + .4, q = spotLine(half, 2.1); if (!q) continue;
        const xs = Array.from({ length: n2 }, (_, j) => q.x + (j - (n2 - 1) / 2) * 3.2);
        xs.forEach(x => acUnit(x, q.z));
        const x0 = xs[0] - 1.45, x1 = xs[n2 - 1] + 1.45;
        cyl(.14, x1 - x0, pipeM, (x0 + x1) / 2, H + 1.15, q.z + 1.05, 0, Math.PI / 2);                                   // a service pipe along the backs of the units
        for (const x of xs) { cyl(.1, .5, pipeM, x, H + 1.0, q.z + 1.05); add(new THREE.SphereGeometry(.14, 8, 6), pipeM, x, H + 1.15, q.z + 1.05); }
        cyl(.14, .8, pipeM, x1, H + .75, q.z + 1.05); add(new THREE.SphereGeometry(.18, 8, 6), pipeM, x1, H + 1.15, q.z + 1.05); // its riser down to the roof
        box(x1 - x0 + .6, .1, .24, dark, (x0 + x1) / 2, H + .05, q.z - 1.15);                                             // a conduit tray in front
        box(.45, .5, .22, dark, x0 - .1, H + .25, q.z - 1.15); cyl(.04, .6, wire, x0 - .1, H + .55, q.z - 1.15);        // its junction box and a conduit up
        const fan = q.x + (n2 * 1.6 + 1.0) * (rnd() < .5 ? 1 : -1); // an extract fan beyond the bank
        if (Math.abs(fan - q.x) < half + 1.2) { cyl(.5, .8, steel, fan, H + .4, q.z); cyl(.52, .06, dark, fan, H + .83, q.z); const g = add(new THREE.TorusGeometry(.5, .03, 6, 18), steel, fan, H + .88, q.z); g.rotation.x = Math.PI / 2; stain(fan, q.z, 1.1); }
      } else if (k === 'tower') { const q = spotLine(3.4, 1.7); if (!q) continue;
        const tx = q.x - 1.2, px = q.x + 1.9;
        box(2.2, 2.4, 2.2, white, tx, H + 1.2, q.z);                                                                      // the cooling tower: a boxed case
        for (let y = .5; y < 2.2; y += .22) for (const sd of [-1, 1]) { box(1.9, .05, .03, dark, tx, H + y, q.z + sd * 1.12); box(.03, .05, 1.9, dark, tx + sd * 1.12, H + y, q.z); } // louvres on every side
        cyl(.85, .45, steel, tx, H + 2.6, q.z); cyl(.8, .05, dark, tx, H + 2.84, q.z);
        { const g = add(new THREE.TorusGeometry(.82, .04, 6, 20), steel, tx, H + 2.86, q.z); g.rotation.x = Math.PI / 2; }
        for (let t = 0; t < 4; t++) box(1.6, .03, .06, steel, tx, H + 2.87, q.z, t * Math.PI / 4);
        box(1.5, .3, 1.1, dark, px, H + .15, q.z); cyl(.3, .5, drums[1], px - .3, H + .55, q.z); cyl(.3, .5, drums[1], px + .3, H + .55, q.z); // a pump skid
        cyl(.12, 2.4, pipeM, (tx + px) / 2 + .1, H + .9, q.z + .6, 0, Math.PI / 2); cyl(.12, 2.4, pipeM, (tx + px) / 2 + .1, H + .6, q.z - .6, 0, Math.PI / 2); // feed and return between them
        stain(tx + 1.4, q.z + 1.3, 1.5); stain(px, q.z + 1.0, 1.0);
      } else if (k === 'comms') { const q = spot(3.1); if (!q) continue;
        box(1.2, .8, .9, dark, q.x + .3, H + .4, q.z + 1.2);                                                              // equipment cabinet
        for (const [dx, dz] of [[-.45, 0], [0, 0], [.45, 0]]) box(.3, .25, .15, steel, q.x - .4 + dx + .9, H + .95, q.z + 1.55 + dz); // junction boxes along it
        cyl(.04, 3, wire, q.x + .9, H + 1.5, q.z + 1.55);                                                                  // conduit up the mast
        for (const [a, b] of [[-.25, -.25], [.25, -.25], [-.25, .25], [.25, .25]]) add(new THREE.CylinderGeometry(.03, .03, 7, 5), steel, q.x + a, H + 3.5, q.z + b);
        for (let y = .6; y < 7; y += .9) box(.55, .03, .03, steel, q.x, H + y, q.z - .25);
        for (const y of [4.6, 6.0]) box(1.5, .05, .05, steel, q.x, H + y, q.z);
        for (const [y, sd] of [[4.7, -1], [5.9, 1]]) { const dsh = add(new THREE.SphereGeometry(.5, 14, 6, 0, Math.PI * 2, 0, .8), white, q.x + sd * .85, H + y, q.z); dsh.rotation.set(.35, 0, sd * Math.PI / 2 * .8 - sd * .6); } // two small receiver dishes on arms
        add(new THREE.SphereGeometry(.12, 10, 8), beacon, q.x, H + 7.15, q.z); box(.5, .05, .05, steel, q.x, H + 7.0, q.z);   // the warning beacon
        for (const h of [3.2, 5.6]) for (const [ax, az] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) { // guy-wires from the mast to ballast blocks round it
          wireBetween([q.x, H + h, q.z], [q.x + ax * 2.3, H + .2, q.z + az * 2.3]); }
        for (const [ax, az] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) box(.45, .3, .45, plinth, q.x + ax * 2.3, H + .15, q.z + az * 2.3);
      } else if (k === 'skylight') { const q = spot(1.6); if (!q) continue;
        box(2.6, .45, 1.6, trim, q.x, H + .22, q.z); box(2.3, .06, 1.3, glass, q.x, H + .5, q.z);                          // a raised skylight: curb and glazing
        for (let t = -2; t <= 2; t++) box(.04, .1, 1.32, steel, q.x + t * .52, H + .54, q.z); box(2.4, .06, .1, steel, q.x, H + .52, q.z);
        box(2.7, .06, 1.7, trim, q.x, H + .47, q.z);
      } else if (k === 'hatch') { const q = spot(.9); if (!q) continue; // a weather-sealed roof hatch: a tall curb, a gasketed lid, hinges and a wheel
        box(1.5, .45, 1.5, trim, q.x, H + .22, q.z); box(1.55, .04, 1.55, dark, q.x, H + .47, q.z); box(1.3, .12, 1.3, door, q.x, H + .55, q.z);
        for (const sx of [-.45, .45]) box(.2, .1, .08, steel, q.x + sx, H + .55, q.z - .68);
        cyl(.14, .05, steel, q.x, H + .64, q.z + .1); box(.3, .03, .04, steel, q.x, H + .67, q.z + .1);
      } else if (k === 'penthouse') { const q = area > 200 && spot(2.5); if (!q) continue; // an access penthouse: a small block over the stairs, with a door, louvres and a lamp
        box(3.6, 2.7, 3.0, para, q.x, H + 1.35, q.z); box(3.9, .22, 3.3, trim, q.x, H + 2.8, q.z);
        box(1.1, 2.1, .06, door, q.x - .6, H + 1.05, q.z + 1.52); box(1.3, 2.25, .05, dark, q.x - .6, H + 1.12, q.z + 1.5);
        box(.3, .12, .3, steel, q.x - .6, H + 2.35, q.z + 1.7); box(.14, .12, .2, lamp, q.x - .6, H + 2.28, q.z + 1.62);
        for (let y = 1.0; y < 2.0; y += .14) box(.8, .05, .03, dark, q.x + .95, H + y, q.z + 1.52);
        cyl(.14, .8, steel, q.x + 1.2, H + 3.3, q.z - .8); box(.4, .1, .4, steel, q.x + 1.2, H + 3.75, q.z - .8);
        stain(q.x + 1.2, q.z - .8, .9);
        // detail, so the block isn't a plain box: a plinth, corner pilasters and a seam band, a lip round the roof slab, a hatch and a vent on it, an aerial, a downspout, conduit and a junction box
        box(3.75, .3, 3.15, plinth, q.x, H + .15, q.z);
        for (const sx of [-1.78, 1.78]) for (const sz of [-1.5, 1.5]) box(.2, 2.55, .2, trim, q.x + sx, H + 1.4, q.z + sz);
        box(3.66, .1, 3.06, trim, q.x, H + 1.55, q.z);
        for (const sz of [-1.62, 1.62]) box(3.9, .14, .1, trim, q.x, H + 2.98, q.z + sz);
        for (const sx of [-1.9, 1.9]) box(.1, .14, 3.3, trim, q.x + sx, H + 2.98, q.z);
        box(.9, .14, .9, dark, q.x - .9, H + 3.0, q.z - .5); box(.7, .06, .7, steel, q.x - .9, H + 3.1, q.z - .5);
        box(.5, .35, .5, white, q.x + .6, H + 3.07, q.z + .2); box(.56, .05, .56, steel, q.x + .6, H + 3.27, q.z + .2);
        cyl(.03, 1.7, steel, q.x + 1.4, H + 3.8, q.z + .6); box(.7, .03, .03, steel, q.x + 1.4, H + 4.3, q.z + .6); box(.45, .03, .03, steel, q.x + 1.4, H + 4.05, q.z + .6);
        cyl(.05, 2.6, steel, q.x + 1.82, H + 1.5, q.z + 1.35); box(.14, .14, .14, steel, q.x + 1.82, H + 2.85, q.z + 1.35);
        box(.06, .06, 1.2, dark, q.x + 1.84, H + 2.2, q.z + .55); box(.3, .4, .16, steel, q.x + 1.84, H + 1.5, q.z + 1.2);
        box(1.5, .12, .55, plinth, q.x - .6, H + .06, q.z + 1.8); // (a step at the door)
      } else if (k === 'vent') { const q = spot(.5); if (!q) continue; // a vent stack with a cowl, and its soot
        add(new THREE.CylinderGeometry(.18, .18, 1.2, 10), steel, q.x, H + .6, q.z); add(new THREE.CylinderGeometry(.06, .36, .26, 12), steel, q.x, H + 1.33, q.z); stain(q.x, q.z, .9);
      }
    }
  }
  for (const { r, c, sr, sc } of notches.values()) {
    const I = at(r + (sr > 0 ? 0 : 1), c + (sc > 0 ? 0 : 1));
    if (Math.abs(I.x) > xLimit + 2) continue;
    const A = { x: I.x + sc * cell, z: I.z }, B = { x: I.x, z: I.z + sr * cell }, mx = (A.x + B.x) / 2, mz = (A.z + B.z) / 2;
    const Ld = cell * Math.SQRT2, nx = sc / Math.SQRT2, nz = sr / Math.SQRT2, th = Math.atan2(nx, nz);
    const face = new THREE.PlaneGeometry(Ld, H), fuv = face.attributes.uv; for (let i = 0; i < fuv.count; i++) fuv.setX(i, fuv.getX(i) * Ld / WALL_W);
    add(face, wall, mx, H / 2, mz, th);
    const cross = (A.z - I.z) * (B.x - I.x) - (A.x - I.x) * (B.z - I.z), [P1, P2] = cross >= 0 ? [A, B] : [B, A];
    const tri = new THREE.BufferGeometry();
    tri.setAttribute('position', new THREE.BufferAttribute(new Float32Array([I.x, H, I.z, P1.x, H, P1.z, P2.x, H, P2.z]), 3));
    tri.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([I.x / ROOF_M, I.z / ROOF_M, P1.x / ROOF_M, P1.z / ROOF_M, P2.x / ROOF_M, P2.z / ROOF_M]), 2));
    tri.setAttribute('normal', new THREE.BufferAttribute(new Float32Array([0, 1, 0, 0, 1, 0, 0, 1, 0]), 3));
    add(tri, roof, 0, 0, 0);
    const at2 = (out, y, wd, hh, dd, m) => box(wd, hh, dd, m, mx + nx * out, y, mz + nz * out, th);
    at2(.09, H - .25, Ld, .25, .18, trim);                   // drip course
    at2(.05, H * .52, Ld, .18, .1, trim);                    // string course
    at2(-.1, H + .15, Ld + .1, .3, .2, para);                // parapet
    at2(-.05, H + .35, Ld + .12, .1, .3, trim);              // its cap
    at2(.1, H + .3, Ld, .04, .03, dark);                     // the drip groove
  }
  group.add(mergeStatic(extra));
  group.add(mergeStatic(bodies));
  return { notches, roofs, tops }; // (notches: the empty corner cells filled by diagonal wall pieces, which the world makes solid too; roofs: for the roof puddles)
}
