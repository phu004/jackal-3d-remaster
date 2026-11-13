// The twin walkers: two-legged assault mechs (the secret level's boss pair). About 6.5 m tall on a wide stance, so the legs read from the near-top-down camera.
// Facing -Z (north), origin on the ground between the feet. Built as a skeleton of named groups so the game can animate it:
//   root 'walker'
//     'hips' (y 4.05 standing)   the pelvis; the game bobs and lowers it (crouching for a dash or a volley)
//       'legL' / 'legR'          hip joints: rotation.x swings fore and aft, rotation.z swings out to the side
//         'kneeL' / 'kneeR'      knee joints (rotation.x bends them); 'footL' / 'footR' hang off the ankles
//       'torso'                  turns (rotation.y) to face the target independently of the hips
//         'gunR'                 the right arm's heavy machine gun (the game kicks it back along z on firing); 'muzzleR' an empty at its tip; 'mouthR' a glow blob (hidden)
//         'drillArm'             the left arm: a gauntlet with a drill in it; 'drillSlide' (position.z +2.0 in, -0.4 out) carries 'drillBit' (spins about z, with 'drillTip'); 'muzzleL' at the drill's tip
//         'pod'                  the rocket back-pack: 'podLidL' / 'podLidR' flaps, 'rocket1' .. 'rocket6' empties at the tube mouths (pointing straight up)
//         'eye'                  the visor strip inside the canopy (the game tints its material)
//   'shield'                     an invisible bubble round the torso: its shader (uHit[4]: xyz a unit direction in the walker's own frame, w the age in seconds, negative = unused) draws a hex-grid ripple
//                                spreading from each place the shield took a hit, so the shield shows only when it absorbs damage; uFlash, uColor, uTime, uAmt
// Detail: bevelled armour plates carrying a painted-metal texture (panel lines, rivets, scratches, grime), hydraulic rams on every limb, ball and ring joints, a glazed cockpit, rotary-barrel arm cannons, a vented rocket pod.
// buildWalker({ accent, callsign, glyph }) accent: the colour of the trim and the visor (the same for both walkers); callsign / glyph: what is stencilled on the cockpit roof and the shoulders to tell them apart (ALPHA / alpha, BETA / beta).
import * as THREE from 'three';

// ---------------------------------------------------------------- materials
// The armour: one painted-steel tile (1024 px, seamless: the panel seams run along its edges) drawn twice from the same layout, once as colour and once as a height map that is turned into a normal map, so the panels,
// bolts, vents and scratches have real relief under the light. Per panel: a bevelled inset, corner bolts, and one of: vent slots, a hazard-striped band, an access hatch with a handle, stencils (NO STEP, an arrow, a serial plate).
// Then wear: chips along the seams, scratches, rust running down from the bolts, grime in broad patches, soot round the vents.
let armorSet = null;
function armorTextures() {
  if (armorSet) return armorSet;
  const S = 1024, mk = () => { const c = document.createElement('canvas'); c.width = c.height = S; return [c, c.getContext('2d')]; };
  const [cc, cx] = mk(), [hc, hx] = mk();
  const layout = (x, mode) => {   // mode 'c': colour, 'h': height (grey level: 128 flat, higher is raised)
    let seed = 11; const rn = () => (seed = (seed * 16807) % 2147483647) / 2147483647, C = (col, h, a = 1) => mode === 'c' ? col.replace('A', a) : `rgba(${h},${h},${h},${a})`;
    x.fillStyle = mode === 'c' ? '#65717b' : 'rgb(128,128,128)'; x.fillRect(0, 0, S, S);
    if (mode === 'c') { const g = x.createLinearGradient(0, 0, S, S); g.addColorStop(0, '#707c86'); g.addColorStop(.5, '#626e78'); g.addColorStop(1, '#5a656f'); x.fillStyle = g; x.fillRect(0, 0, S, S); }
    const cols = [0, 512, S], rows = [0, 430, S], px = [];
    for (let r = 0; r < 2; r++) for (let c = 0; c < 2; c++) px.push({ x0: cols[c], x1: cols[c + 1], y0: rows[r], y1: rows[r + 1], i: r * 2 + c });
    for (const p of px) {
      const m = 22, ix = p.x0 + m, iy = p.y0 + m, iw = p.x1 - p.x0 - 2 * m, ih = p.y1 - p.y0 - 2 * m;
      x.fillStyle = C('rgba(110,122,132,A)', 146, .9); x.fillRect(ix, iy, iw, ih);                                                                          // the raised inset panel
      x.lineWidth = 3; x.strokeStyle = C('rgba(190,200,208,A)', 190, .8); x.beginPath(); x.moveTo(ix, iy + ih); x.lineTo(ix, iy); x.lineTo(ix + iw, iy); x.stroke();      // (a lit edge top and left)
      x.strokeStyle = C('rgba(24,30,36,A)', 70, .85); x.beginPath(); x.moveTo(ix + iw, iy); x.lineTo(ix + iw, iy + ih); x.lineTo(ix, iy + ih); x.stroke();          // (a shaded edge bottom and right)
      for (const [bx, by] of [[ix + 24, iy + 24], [ix + iw - 24, iy + 24], [ix + 24, iy + ih - 24], [ix + iw - 24, iy + ih - 24]]) {   // corner bolts with a highlight, a shadow and a rust streak
        x.fillStyle = C('rgba(42,48,54,A)', 215); x.beginPath(); x.arc(bx, by, 9, 0, 6.3); x.fill(); x.fillStyle = C('rgba(150,160,168,A)', 235, .9); x.beginPath(); x.arc(bx - 2, by - 2, 4, 0, 6.3); x.fill();
        const r1 = rn(), r2 = rn(), r3 = rn(); if (mode === 'c' && r1 < .7) { const g = x.createLinearGradient(0, by, 0, by + 60 + r2 * 90); g.addColorStop(0, 'rgba(130,70,30,.45)'); g.addColorStop(1, 'rgba(130,70,30,0)'); x.fillStyle = g; x.fillRect(bx - 3, by, 5 + r3 * 4, 150); }   // (the same random numbers are drawn in both passes, so the relief lines up with the paint)
      }
      const kind = p.i % 4, cx0 = p.x0 + (p.x1 - p.x0) / 2, cy0 = p.y0 + (p.y1 - p.y0) / 2;
      if (kind === 0) { for (let k = 0; k < 7; k++) { const vy = iy + 70 + k * 34; x.fillStyle = C('rgba(14,18,22,A)', 30); x.fillRect(ix + 90, vy, iw - 180, 16); x.fillStyle = C('rgba(150,158,166,A)', 170, .6); x.fillRect(ix + 90, vy + 16, iw - 180, 3); }
        if (mode === 'c') { const g = x.createLinearGradient(0, iy + 60, 0, iy + 330); g.addColorStop(0, 'rgba(20,18,16,.45)'); g.addColorStop(1, 'rgba(20,18,16,0)'); x.fillStyle = g; x.fillRect(ix + 80, iy + 60, iw - 160, 280); } }   // slots, and soot above them
      if (kind === 1) { const hy = p.y1 - m - 120; x.save(); x.beginPath(); x.rect(ix + 30, hy, iw - 60, 70); x.clip(); for (let k = -4; k < 22; k++) { x.fillStyle = k % 2 ? C('rgba(236,170,30,A)', 128) : C('rgba(28,30,32,A)', 128); x.beginPath(); x.moveTo(ix + 30 + k * 40, hy + 70); x.lineTo(ix + 30 + k * 40 + 40, hy + 70); x.lineTo(ix + 30 + k * 40 + 40 + 70, hy); x.lineTo(ix + 30 + k * 40 + 70, hy); x.fill(); } x.restore();
        x.fillStyle = C('rgba(24,28,32,A)', 80); x.font = 'bold 40px Arial'; x.fillText('DANGER', ix + 42, iy + 78); x.font = 'bold 22px Arial'; x.fillText('HIGH VOLTAGE', ix + 44, iy + 110); }
      if (kind === 2) { x.fillStyle = C('rgba(98,108,118,A)', 170); x.beginPath(); x.roundRect ? x.roundRect(ix + 90, iy + 70, iw - 180, ih - 190, 20) : x.rect(ix + 90, iy + 70, iw - 180, ih - 190); x.fill(); x.lineWidth = 5; x.strokeStyle = C('rgba(20,26,32,A)', 60); x.stroke();
        x.fillStyle = C('rgba(30,34,38,A)', 235); x.fillRect(cx0 - 60, cy0 + 70, 120, 26); x.fillStyle = C('rgba(190,196,202,A)', 245, .8); x.fillRect(cx0 - 56, cy0 + 72, 112, 6); for (const hx2 of [ix + 130, ix + iw - 130]) { x.fillStyle = C('rgba(30,34,38,A)', 235); x.fillRect(hx2 - 14, iy + 90, 28, 64); } }   // a hatch, its handle, hinges
      if (kind === 3) { x.fillStyle = C('rgba(232,228,214,A)', 160, .9); x.font = 'bold 54px Arial'; x.fillText('NO STEP', ix + 56, iy + 110); x.beginPath(); x.moveTo(cx0, iy + 170); x.lineTo(cx0 + 70, iy + 270); x.lineTo(cx0 + 24, iy + 270); x.lineTo(cx0 + 24, iy + 340); x.lineTo(cx0 - 24, iy + 340); x.lineTo(cx0 - 24, iy + 270); x.lineTo(cx0 - 70, iy + 270); x.closePath(); x.fill();
        x.fillStyle = C('rgba(26,30,34,A)', 100); x.fillRect(ix + iw - 220, iy + ih - 90, 180, 56); x.fillStyle = C('rgba(226,222,208,A)', 160, .9); x.font = 'bold 30px Arial'; x.fillText('WK-07-B', ix + iw - 208, iy + ih - 52); }   // a stencil, an arrow, a serial plate
    }
    // the seams between panels: dark grooves along the tile's edges and the inner seam, so it tiles into a panel grid
    x.strokeStyle = C('rgba(12,16,20,A)', 34, .95); x.lineWidth = 8; for (const cxx of cols) { x.beginPath(); x.moveTo(cxx, 0); x.lineTo(cxx, S); x.stroke(); } for (const ry of rows) { x.beginPath(); x.moveTo(0, ry); x.lineTo(S, ry); x.stroke(); }
    // wear: bare-metal chips along the seams, scratches, and (colour only) broad grime
    for (let i = 0; i < 260; i++) { const onX = rn() < .5, sx = onX ? cols[Math.floor(rn() * 3)] + (rn() - .5) * 18 : rn() * S, sy = onX ? rn() * S : rows[Math.floor(rn() * 3)] + (rn() - .5) * 18; x.fillStyle = C('rgba(188,194,198,A)', 190, .55 + rn() * .3); x.fillRect(sx, sy, 2 + rn() * 7, 2 + rn() * 5); }
    x.lineWidth = 1.2; for (let i = 0; i < 150; i++) { const sx = rn() * S, sy = rn() * S, a = rn() * 6.3, l = 12 + rn() * 70; x.strokeStyle = C('rgba(214,220,226,A)', 100, .3 + rn() * .3); x.beginPath(); x.moveTo(sx, sy); x.lineTo(sx + Math.cos(a) * l, sy + Math.sin(a) * l); x.stroke(); }
    if (mode === 'c') {
      for (let i = 0; i < 40; i++) { const gx = rn() * S, gy = rn() * S, r = 60 + rn() * 150, g = x.createRadialGradient(gx, gy, 0, gx, gy, r); g.addColorStop(0, `rgba(34,30,24,${.08 + rn() * .12})`); g.addColorStop(1, 'rgba(34,30,24,0)'); x.fillStyle = g; for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) { x.save(); x.translate(ox, oy); x.fillRect(gx - r, gy - r, 2 * r, 2 * r); x.restore(); } }   // (grime, wrapped round the tile's edges so it tiles)
      for (let i = 0; i < 30; i++) { const gx = rn() * S, g = x.createLinearGradient(0, 0, 0, S); g.addColorStop(0, 'rgba(26,22,18,0)'); g.addColorStop(1, `rgba(26,22,18,${.12 + rn() * .2})`); x.fillStyle = g; x.fillRect(gx, 0, 3 + rn() * 12, S); }                      // (streaks running down)
    }
  };
  layout(cx, 'c'); layout(hx, 'h');
  // paint speckle into both (the colour a little, the height a little more), then the height map becomes the normal map
  try {
    const cd = cx.getImageData(0, 0, S, S), hd = hx.getImageData(0, 0, S, S); let sd = 5; const r = () => (sd = (sd * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < S * S; i++) { const n = (r() - .5), k = i * 4; cd.data[k] = Math.max(0, Math.min(255, cd.data[k] + n * 18)); cd.data[k + 1] = Math.max(0, Math.min(255, cd.data[k + 1] + n * 18)); cd.data[k + 2] = Math.max(0, Math.min(255, cd.data[k + 2] + n * 18)); const hv = Math.max(0, Math.min(255, hd.data[k] + n * 26)); hd.data[k] = hd.data[k + 1] = hd.data[k + 2] = hv; }
    cx.putImageData(cd, 0, 0);
    const out = hx.createImageData(S, S), H = (xx, yy) => hd.data[(((yy + S) % S) * S + ((xx + S) % S)) * 4], K = 2.4;
    for (let yy = 0; yy < S; yy++) for (let xx = 0; xx < S; xx++) { const dx = (H(xx + 1, yy - 1) + 2 * H(xx + 1, yy) + H(xx + 1, yy + 1) - H(xx - 1, yy - 1) - 2 * H(xx - 1, yy) - H(xx - 1, yy + 1)) / 255 * K, dy = (H(xx - 1, yy + 1) + 2 * H(xx, yy + 1) + H(xx + 1, yy + 1) - H(xx - 1, yy - 1) - 2 * H(xx, yy - 1) - H(xx + 1, yy - 1)) / 255 * K, l = Math.hypot(dx, dy, 1), k = (yy * S + xx) * 4; out.data[k] = (-dx / l * .5 + .5) * 255; out.data[k + 1] = (dy / l * .5 + .5) * 255; out.data[k + 2] = (1 / l * .5 + .5) * 255; out.data[k + 3] = 255; }
    hx.putImageData(out, 0, 0);
  } catch (e) { /* (no pixel access: the colour map alone, without speckle or relief) */ }
  const map = new THREE.CanvasTexture(cc), normal = new THREE.CanvasTexture(hc);
  for (const t of [map, normal]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(.5, .5); t.anisotropy = 8; }
  map.encoding = THREE.sRGBEncoding;
  return (armorSet = { map, normal });
}
// a brushed-metal tile for the dark and steel parts: fine grain lines and speckle, with a matching relief
let metalSet = null;
function metalTextures() {
  if (metalSet) return metalSet;
  const S = 256, c = document.createElement('canvas'); c.width = c.height = S; const x = c.getContext('2d'); let seed = 3; const rn = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  x.fillStyle = '#8a9096'; x.fillRect(0, 0, S, S);
  for (let i = 0; i < 700; i++) { const y = rn() * S, l = 20 + rn() * 90, sx = rn() * S; x.strokeStyle = rn() < .5 ? 'rgba(255,255,255,.1)' : 'rgba(0,0,0,.14)'; x.lineWidth = 1; for (const ox of [-S, 0, S]) { x.beginPath(); x.moveTo(sx + ox, y); x.lineTo(sx + ox + l, y + (rn() - .5) * 2); x.stroke(); } }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; t.encoding = THREE.sRGBEncoding; return (metalSet = { map: t });
}
const guard = (fn, fallback) => { try { return fn(); } catch (e) { return fallback; } };   // (a texture that cannot be drawn leaves the plain colour: never a broken walker)
const mats = accent => {
  const A = guard(armorTextures, null), Mt = guard(metalTextures, null);
  return {
    armor: new THREE.MeshStandardMaterial({ map: A?.map ?? null, normalMap: A?.normal ?? null, normalScale: new THREE.Vector2(1.1, 1.1), color: 0xffffff, roughness: .52, metalness: .5 }),
    dark: new THREE.MeshStandardMaterial({ map: Mt?.map ?? null, color: 0x454c54, roughness: .55, metalness: .6 }),
    steel: new THREE.MeshStandardMaterial({ map: Mt?.map ?? null, color: 0x2c3238, roughness: .4, metalness: .75 }),
    chrome: new THREE.MeshStandardMaterial({ color: 0xaab4bd, roughness: .25, metalness: .9 }),
    trim: new THREE.MeshStandardMaterial({ color: accent, roughness: .5, metalness: .2 }),
    glass: new THREE.MeshStandardMaterial({ color: 0x0b2f38, roughness: .08, metalness: .9, emissive: 0x06303a, emissiveIntensity: .6, transparent: true, opacity: .62, side: THREE.DoubleSide }),
    glow: new THREE.MeshBasicMaterial({ color: accent }),
  };
};

// The callsign paint: stencilled lettering with flaked edges. A callsign in block capitals with a bar under it (for the cockpit roof), and a roundel with a Greek letter (for the shoulders).
function decalTexture(kind, text) {
  const W = kind === 'name' ? 1024 : 512, H = kind === 'name' ? 420 : 512, c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d'); let seed = text.length * 7 + 3; const rn = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  x.fillStyle = '#ece8d8'; x.strokeStyle = '#ece8d8'; x.textAlign = 'center'; x.textBaseline = 'middle';
  if (kind === 'name') {
    x.font = 'bold 250px "Arial Black", Arial, sans-serif'; x.fillText(text, W / 2, H * .42, W * .94); x.fillRect(W * .05, H * .78, W * .9, 22); x.fillRect(W * .05, H * .88, W * .55, 12);
    x.font = 'bold 44px Arial'; x.textAlign = 'right'; x.fillText('WK-07', W * .95, H * .96);
    x.globalCompositeOperation = 'destination-out'; for (let i = 0; i < 60; i++) { x.fillStyle = 'rgba(0,0,0,' + (.5 + rn() * .5) + ')'; x.beginPath(); x.arc(rn() * W, rn() * H, 2 + rn() * 7, 0, 6.3); x.fill(); } for (let i = 0; i < 20; i++) { x.strokeStyle = 'rgba(0,0,0,.8)'; x.lineWidth = 2; const sx = rn() * W, sy = rn() * H; x.beginPath(); x.moveTo(sx, sy); x.lineTo(sx + (rn() - .5) * 120, sy + (rn() - .5) * 40); x.stroke(); }
  } else {
    x.lineWidth = 22; x.beginPath(); x.arc(W / 2, H / 2, 218, 0, 6.3); x.stroke(); x.lineWidth = 6; x.beginPath(); x.arc(W / 2, H / 2, 188, 0, 6.3); x.stroke();
    x.font = 'bold 330px "Times New Roman", serif'; x.fillText(text, W / 2, H / 2 + 24);
    x.globalCompositeOperation = 'destination-out'; for (let i = 0; i < 70; i++) { x.fillStyle = 'rgba(0,0,0,' + (.5 + rn() * .5) + ')'; x.beginPath(); x.arc(rn() * W, rn() * H, 2 + rn() * 6, 0, 6.3); x.fill(); }
  }
  const t = new THREE.CanvasTexture(c); t.anisotropy = 8; t.encoding = THREE.sRGBEncoding; return t;
}
const decal = (kind, text, w, h, x, y, z, rx, ry, rz, order = 'XYZ') => {
  const tex = guard(() => decalTexture(kind, text), null); if (!tex) return new THREE.Group();
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: tex, transparent: true, alphaTest: .04, depthWrite: false, roughness: .7, metalness: .1, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  m.position.set(x, y, z); m.rotation.order = order; m.rotation.set(rx, ry, rz); m.receiveShadow = true; m.castShadow = false; m.name = 'decal'; return m;
};

// ---------------------------------------------------------------- shapes
function plateGeo(w, h, d, c = .12, bevel = .035) {   // a slab with chamfered corners and softened edges (cheap hard-surface armour); w across, h up, d deep
  const x = w / 2 - bevel, y = h / 2 - bevel, k = Math.min(c, x * .9, y * .9), s = new THREE.Shape();
  s.moveTo(-x + k, -y); s.lineTo(x - k, -y); s.lineTo(x, -y + k); s.lineTo(x, y - k); s.lineTo(x - k, y); s.lineTo(-x + k, y); s.lineTo(-x, y - k); s.lineTo(-x, -y + k); s.closePath();
  const dd = Math.max(.02, d - 2 * bevel), g = new THREE.ExtrudeGeometry(s, { depth: dd, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 1 }); g.translate(0, 0, -dd / 2); return g;
}
const mesh = (geo, m, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => { const k = new THREE.Mesh(geo, m); k.position.set(x, y, z); k.rotation.set(rx, ry, rz); k.castShadow = k.receiveShadow = true; return k; };
const plate = (w, h, d, m, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, c = .12) => mesh(plateGeo(w, h, d, c), m, x, y, z, rx, ry, rz);
const cyl = (rt, rb, h, m, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, seg = 12) => mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m, x, y, z, rx, ry, rz);
const grp = (name, x = 0, y = 0, z = 0) => { const g = new THREE.Group(); g.name = name; g.position.set(x, y, z); return g; };
// a hydraulic ram between two points (in the parent's frame): a thick cylinder and a thinner chrome rod sliding out of it, with a clevis at each end
function ram(a, b, r, M) {
  const g = new THREE.Group(), A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), d = B.clone().sub(A), len = d.length();
  g.position.copy(A.clone().add(B).multiplyScalar(.5)); g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  g.add(cyl(r, r, len * .55, M.steel, 0, -len * .2, 0, 0, 0, 0, 8), cyl(r * .55, r * .55, len * .5, M.chrome, 0, len * .22, 0, 0, 0, 0, 8), cyl(r * 1.3, r * 1.3, r * 1.2, M.dark, 0, -len * .5, 0, 0, 0, 0, 8), cyl(r * 1.2, r * 1.2, r * 1.2, M.dark, 0, len * .5, 0, 0, 0, 0, 8));
  g.children.forEach(k => { k.castShadow = true; }); return g;
}

function shieldMaterial() {
  return new THREE.ShaderMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    uniforms: { uHit: { value: Array.from({ length: 4 }, () => new THREE.Vector4(0, 1, 0, -1)) }, uFlash: { value: 0 }, uColor: { value: new THREE.Color(0x4ac8ff) }, uTime: { value: 0 }, uAmt: { value: 1 } },
    vertexShader: `varying vec3 vL; varying vec3 vN; varying vec3 vV;
      void main() { vL = normalize( position ); vN = normalize( normalMatrix * normal ); vec4 mv = modelViewMatrix * vec4( position, 1.0 ); vV = normalize( - mv.xyz ); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform vec4 uHit[4]; uniform float uFlash, uTime, uAmt; uniform vec3 uColor; varying vec3 vL; varying vec3 vN; varying vec3 vV;
      void main() {
        float rim = pow( 1.0 - abs( dot( normalize( vN ), normalize( vV ) ) ), 2.0 );
        vec3 q = abs( fract( vL * 7.0 ) - 0.5 ); float cell = smoothstep( 0.36, 0.5, max( q.x, max( q.y, q.z ) ) );          // (the cell walls of a hex-like energy lattice)
        float a = 0.0;
        for ( int i = 0; i < 4; i++ ) { vec4 h = uHit[ i ]; if ( h.w < 0.0 ) continue;
          float ang = acos( clamp( dot( normalize( vL ), h.xyz ), -1.0, 1.0 ) ), age = h.w;
          float wave = exp( - pow( ( ang - age * 3.4 ) * 4.5, 2.0 ) ), core = exp( - ang * ang * 7.0 ) * exp( - age * 9.0 ), fade = clamp( 1.0 - age / 0.9, 0.0, 1.0 );
          a += ( wave * ( 0.25 + 1.1 * cell ) * 0.9 + core * 1.6 + wave * rim * 0.6 ) * fade; }
        a = a * uAmt + uFlash * ( 0.12 + 0.6 * rim + 0.4 * cell );
        gl_FragColor = vec4( mix( uColor, vec3( 1.0 ), clamp( a * 0.35, 0.0, 0.7 ) ) * a, a );
      }` });
}

// The left arm: a heavy gauntlet with a drill folded away inside its sleeve. It is built extended (the drill out of its sleeve, 'drillSlide' at position.z -0.4; +2.0 would draw it back into the sleeve)
// and spins 'drillBit' about its own axis: a fluted cone of toothed rings with a hot tip. 'muzzleL' (at the drill's tip, moving with it) is where sparks fly from.
function buildDrillArm(M, accent) {
  const arm = grp('drillArm', -1.7, .75, -.3);
  arm.add(plate(.9, .95, 1.6, M.armor, 0, 0, -.3, 0, 0, 0, .12), plate(.95, .12, 1.4, M.trim, 0, .52, -.3), plate(.3, .55, .9, M.dark, .5, 0, -.4, 0, 0, 0, .05), plate(.3, .55, .9, M.dark, -.5, 0, -.4, 0, 0, 0, .05));   // the gauntlet's housing, a trim cap, side guards
  arm.add(cyl(.46, .46, 1.9, M.dark, 0, 0, -1.25, Math.PI / 2, 0, 0, 16), cyl(.54, .54, .16, M.chrome, 0, 0, -2.18, Math.PI / 2, 0, 0, 16), cyl(.5, .5, .07, M.trim, 0, 0, -.62, Math.PI / 2, 0, 0, 16));   // the sleeve, its chrome collar, a trim ring
  for (const d of [-.3, .3]) arm.add(ram([d, .56, -.2], [d, .32, -1.6], .06, M));                                                                                 // two rams along the top
  for (let i = 0; i < 5; i++) arm.add(mesh(new THREE.BoxGeometry(.05, .5, .08), M.steel, .47, 0, -.1 - i * .15));                                                  // vent slats on the housing
  const slide = grp('drillSlide', 0, 0, -.4); arm.add(slide);
  slide.add(cyl(.36, .36, 1.5, M.steel, 0, 0, -1.1, Math.PI / 2, 0, 0, 14), cyl(.42, .42, .12, M.chrome, 0, 0, -1.8, Math.PI / 2, 0, 0, 14), cyl(.39, .39, .12, M.dark, 0, 0, -.5, Math.PI / 2, 0, 0, 14));
  const bit = grp('drillBit', 0, 0, -1.9); slide.add(bit);
  bit.add(mesh(new THREE.ConeGeometry(.36, 2.0, 12), M.chrome, 0, 0, -1.0, -Math.PI / 2, 0, 0));                                                                       // the cone (the apex toward -z)
  for (let i = 0; i < 9; i++) { const z = -.2 - i * .2, r = .33 * (1 - i / 10) + .03; for (let t = 0; t < 3; t++) { const a = i * .75 + t * Math.PI * 2 / 3; bit.add(mesh(new THREE.BoxGeometry(.16, .06, .2), M.steel, Math.cos(a) * r, Math.sin(a) * r, z, 0, 0, a)); } }   // (a spiral flute: rings of teeth, each turned on from the last)
  const tip = mesh(new THREE.SphereGeometry(.09, 8, 6), new THREE.MeshBasicMaterial({ color: accent }), 0, 0, -2.0); tip.name = 'drillTip'; tip.castShadow = false; bit.add(tip);
  slide.add(grp('muzzleL', 0, 0, -4.1));
  const mouth = mesh(new THREE.SphereGeometry(.2, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff3010 }), 0, 0, -4.1); mouth.name = 'mouthL'; mouth.visible = false; mouth.castShadow = false; slide.add(mouth);
  return arm;
}

// ---------------------------------------------------------------- the walker
export function buildWalker({ accent = 0xff7a1a, callsign = 'ALPHA', glyph = 'α' } = {}) {
  const root = new THREE.Group(); root.name = 'walker'; const M = mats(accent);
  const hips = grp('hips', 0, 4.05, 0); root.add(hips);
  // the pelvis: a wide armoured girdle with a belly plate, a trim band across the front, side intakes and a rear exhaust vent
  hips.add(plate(2.9, .75, 2.1, M.armor, 0, 0, 0, 0, 0, 0, .2), plate(1.8, .4, 1.5, M.dark, 0, -.55, .1), plate(3.0, .14, 1.0, M.trim, 0, .26, -.45));
  for (const s of [-1, 1]) { hips.add(plate(.32, .5, 1.2, M.dark, s * 1.52, 0, .1), cyl(.18, .18, .2, M.steel, s * 1.64, 0, -.2, 0, 0, Math.PI / 2)); for (let i = 0; i < 4; i++) hips.add(mesh(new THREE.BoxGeometry(.05, .4, .06), M.steel, s * 1.7, 0, .0 + i * .2 - .15)); }
  for (let i = 0; i < 5; i++) hips.add(mesh(new THREE.BoxGeometry(1.2, .04, .05), M.steel, 0, .1 - i * .08, 1.04));

  const leg = side => {
    const s = side === 'L' ? -1 : 1, hip = grp('leg' + side, s * 1.4, -.1, 0); hips.add(hip);
    // hip joint: a housing, a big pin with end caps, a trim ring
    hip.add(plate(.95, .95, 1.15, M.dark, 0, 0, 0, 0, 0, 0, .18), cyl(.4, .4, 1.15, M.steel, 0, 0, 0, 0, 0, Math.PI / 2), cyl(.46, .46, .08, M.chrome, s * .62, 0, 0, 0, 0, Math.PI / 2), cyl(.3, .3, .08, M.trim, -s * .6, 0, 0, 0, 0, Math.PI / 2));
    // the thigh: an armoured shell with a trim band, side guards, and two rams from the hip down to the knee
    const thigh = new THREE.Group(); thigh.position.set(0, -.85, -.35); thigh.rotation.x = .38; hip.add(thigh);
    thigh.add(plate(.82, 1.8, .9, M.armor, 0, 0, 0, 0, 0, 0, .16), plate(.9, .3, 1.0, M.trim, 0, .45, 0), plate(.12, 1.5, .7, M.dark, s * .48, 0, 0, 0, 0, 0, .05), plate(.12, 1.5, .7, M.dark, -s * .48, 0, 0));
    thigh.add(ram([.0, .8, .55], [.0, -.75, .55], .1, M), plate(.5, .9, .1, M.dark, 0, -.1, -.5));
    // the knee: a ring joint, an armoured kneecap and a lamp
    const knee = grp('knee' + side, 0, -1.75, -.75); hip.add(knee);
    knee.add(cyl(.46, .46, 1.0, M.steel, 0, 0, 0, 0, 0, Math.PI / 2), cyl(.52, .52, .08, M.chrome, s * .56, 0, 0, 0, 0, Math.PI / 2), cyl(.52, .52, .08, M.chrome, -s * .56, 0, 0, 0, 0, Math.PI / 2));
    knee.add(plate(.8, .75, .3, M.armor, 0, .12, -.46, -.3, 0, 0, .18), plate(.7, .15, .34, M.trim, 0, .45, -.4, -.3));
    knee.add(mesh(new THREE.SphereGeometry(.07, 8, 6), M.glow, 0, .12, -.62));
    // the shin: a long tapered plate in front, a ram behind, calf armour
    const shin = new THREE.Group(); shin.position.set(0, -.95, .45); shin.rotation.x = -.42; knee.add(shin);
    shin.add(plate(.66, 2.05, .78, M.armor, 0, 0, 0, 0, 0, 0, .14), plate(.5, 1.2, .5, M.dark, 0, -.2, .55, 0, 0, 0, .06), plate(.14, 1.4, .6, M.dark, s * .38, -.1, 0), plate(.14, 1.4, .6, M.dark, -s * .38, -.1, 0));
    shin.add(ram([0, .65, .58], [0, -.8, .52], .09, M), plate(.7, .24, .84, M.trim, 0, .5, 0, 0, 0, 0, .06));
    // the ankle: a ball joint with an actuator, and the foot: a broad sole, three armoured toes with claws, a heel spur, a toe ram
    const foot = grp('foot' + side, 0, -2.0, .85); knee.add(foot);
    foot.add(mesh(new THREE.SphereGeometry(.36, 12, 10), M.chrome, 0, .22, 0), cyl(.16, .16, .7, M.steel, 0, .1, -.35, Math.PI / 2 - .5, 0, 0, 8));
    foot.add(plate(1.3, .26, 1.7, M.armor, 0, -.15, -.2, 0, 0, 0, .2));
    for (const tx of [-.46, 0, .46]) { foot.add(plate(.34, .24, .95, M.dark, tx, -.14, -1.2, 0, 0, 0, .07), mesh(new THREE.ConeGeometry(.17, .5, 5), M.steel, tx, -.16, -1.86, -Math.PI / 2, 0, 0)); }
    foot.add(mesh(new THREE.ConeGeometry(.2, .6, 5), M.steel, 0, -.12, .85, Math.PI / 2, 0, 0), plate(1.34, .06, .5, M.trim, 0, -.01, -.4));
    foot.add(ram([0, .28, -.1], [0, -.05, -1.0], .06, M));
    return hip;
  };
  leg('L'); leg('R');

  // ---- the torso: layered hull plates, a sloped front, a glazed cockpit with the visor strip, side skirts and shoulder pivots
  const torso = grp('torso', 0, .55, 0); hips.add(torso);
  torso.add(plate(2.4, 1.35, 2.3, M.armor, 0, .7, 0, 0, 0, 0, .22), plate(2.0, .5, 1.9, M.armor, 0, 1.55, .15, 0, 0, 0, .18), plate(2.5, .16, 2.4, M.trim, 0, .15, 0, 0, 0, 0, .2), plate(1.9, .35, 2.3, M.dark, 0, .0, 0));
  torso.add(plate(2.0, .95, .42, M.armor, 0, .95, -1.3, -.5, 0, 0, .2), plate(1.5, .5, .3, M.dark, 0, .55, -1.45, -.15), plate(1.0, .12, .5, M.trim, 0, 1.38, -1.1, -.5));   // the sloped glacis and its lower chin guard
  for (const s of [-1, 1]) { torso.add(plate(.34, 1.1, 1.9, M.armor, s * 1.28, .75, .05, 0, 0, 0, .1), plate(.36, .14, 1.4, M.trim, s * 1.28, 1.3, .05)); for (let i = 0; i < 5; i++) torso.add(mesh(new THREE.BoxGeometry(.04, .5, .08), M.steel, s * 1.46, .65, -.5 + i * .25)); }   // side skirts, trim, vent slats
  // the cockpit: an armoured module on the front of the roof with a raked three-pane windshield in a steel frame, side panes, an overhanging roof with a hatch and a periscope, a pilot's head and
  // seat showing dimly inside, and the visor strip glowing under the glass (the game tints it); a headlamp pair and wiper arms on the sill
  torso.add(plate(1.75, .34, 1.7, M.armor, 0, 1.85, -.4, 0, 0, 0, .16), plate(1.5, .12, .24, M.trim, 0, 2.04, -1.2, -.2, 0, 0));
  const pane = (w, h, x, y, z, rx, ry) => { const p = plate(w, h, .04, M.glass, x, y, z, rx, ry, 0, .06); p.castShadow = false; return p; };
  torso.add(pane(1.0, .56, 0, 2.27, -1.0, -.72, 0), pane(.62, .5, -.82, 2.25, -.82, -.62, .85), pane(.62, .5, .82, 2.25, -.82, -.62, -.85));   // the windshield and its two angled wings
  torso.add(pane(.7, .46, -.97, 2.25, -.35, 0, Math.PI / 2), pane(.7, .46, .97, 2.25, -.35, 0, -Math.PI / 2));                                     // the side panes
  for (const x of [-.5, .5, -1.07, 1.07]) torso.add(plate(.08, .62, .08, M.steel, x, 2.27, x < -1 || x > 1 ? -.62 : -1.12, -.5, 0, 0, .02));      // the frame's pillars
  torso.add(plate(1.9, .09, 1.5, M.armor, 0, 2.62, -.55, .08, 0, 0, .14), plate(1.95, .12, .2, M.trim, 0, 2.58, -1.28, .08), plate(1.55, .44, .12, M.armor, 0, 2.28, .2));   // the roof, its trim lip, the rear bulkhead
  torso.add(cyl(.3, .3, .07, M.chrome, 0, 2.68, -.45), cyl(.22, .22, .06, M.dark, 0, 2.72, -.45), cyl(.05, .05, .5, M.steel, .62, 2.9, -.2), mesh(new THREE.BoxGeometry(.12, .12, .2), M.dark, .62, 3.18, -.25));   // a roof hatch, a periscope
  torso.add(mesh(new THREE.SphereGeometry(.17, 10, 8), M.steel, 0, 2.22, -.35), plate(.5, .5, .1, M.dark, 0, 2.15, -.1), mesh(new THREE.BoxGeometry(.4, .06, .3), M.dark, 0, 2.0, -.3));   // the pilot's head, the seat back, a console
  const eye = mesh(new THREE.BoxGeometry(.8, .07, .04), M.glow, 0, 2.1, -.95); eye.name = 'eye'; eye.material = new THREE.MeshBasicMaterial({ color: accent }); eye.castShadow = false; torso.add(eye);
  for (const s of [-1, 1]) { torso.add(mesh(new THREE.SphereGeometry(.09, 8, 6), M.glow, s * .7, 1.9, -1.5), cyl(.015, .015, .5, M.steel, s * .45, 2.2, -1.2, 0, 0, .9 * s, 4)); }   // headlamps, wiper arms
  // shoulders and the arm cannons: a pauldron over a pivot, then a heavy autocannon: a receiver with an ejection port and a top rail, a ribbed cooling jacket, a long barrel in a recoil sleeve, a slotted muzzle brake,
  // a drum magazine on the outer side with a feed chute, two buffer rams along the jacket
  for (const s of [-1, 1]) {
    torso.add(plate(1.1, .55, 1.6, M.armor, s * 1.55, 1.4, .0, 0, 0, s * .12, .2), plate(1.15, .12, 1.65, M.trim, s * 1.55, 1.68, 0, 0, 0, s * .12), cyl(.34, .34, .55, M.steel, s * 1.5, .95, -.05, 0, 0, Math.PI / 2));
    if (s < 0) { torso.add(buildDrillArm(M, accent)); continue; }   // (the left arm is the drill; the right carries the machine gun)
    const gun = grp('gunR', s * 1.7, .75, -.3); torso.add(gun);
    gun.add(plate(.78, .86, 1.55, M.armor, 0, 0, -.3, 0, 0, 0, .1), plate(.8, .1, 1.3, M.trim, 0, .48, -.25), plate(.2, .3, .5, M.dark, -s * .4, .15, -.55, 0, 0, 0, .04));          // the receiver, a trim cap, the ejection port
    gun.add(plate(.12, .16, 1.2, M.steel, 0, .58, -.3), cyl(.07, .07, .3, M.steel, 0, .72, -.05, Math.PI / 2, 0, 0, 8), mesh(new THREE.SphereGeometry(.07, 8, 6), M.glow, 0, .72, .1));    // a top rail with a sight
    gun.add(cyl(.28, .28, 1.9, M.dark, 0, .05, -1.75, Math.PI / 2, 0, 0, 14));                                                                                                       // the cooling jacket
    for (let i = 0; i < 7; i++) gun.add(cyl(.33, .33, .07, M.steel, 0, .05, -1.0 - i * .26, Math.PI / 2, 0, 0, 14));                                                                 // (its ribs)
    gun.add(cyl(.14, .12, 2.6, M.steel, 0, .05, -3.2, Math.PI / 2, 0, 0, 10), cyl(.2, .2, .5, M.dark, 0, .05, -2.4, Math.PI / 2, 0, 0, 10));                                          // the barrel and its recoil sleeve
    gun.add(plate(.34, .34, .6, M.dark, 0, .05, -4.35, 0, 0, 0, .06)); for (const z of [-4.15, -4.35, -4.55]) { gun.add(mesh(new THREE.BoxGeometry(.4, .05, .07), M.steel, 0, .05, z)); gun.add(mesh(new THREE.BoxGeometry(.05, .4, .07), M.steel, 0, .05, z)); }   // the muzzle brake and its ports
    gun.add(cyl(.45, .45, .55, M.dark, s * .72, -.15, -.4, 0, 0, Math.PI / 2, 16), cyl(.4, .4, .06, M.trim, s * 1.02, -.15, -.4, 0, 0, Math.PI / 2, 16), plate(.5, .32, .3, M.steel, s * .45, -.05, -.62), plate(.3, .5, .2, M.dark, s * .55, .0, -.6));      // the drum magazine, its trim end, the feed chute
    for (const d of [-.16, .16]) gun.add(ram([d, -.1, -1.0], [d * 1.2, -.1, -2.2], .045, M));                                                                                        // the buffer rams
    gun.add(grp(s < 0 ? 'muzzleL' : 'muzzleR', 0, .05, -4.75));
    const mouth = mesh(new THREE.SphereGeometry(.28, 10, 8), new THREE.MeshBasicMaterial({ color: 0xff3010, transparent: true, opacity: .85, blending: THREE.AdditiveBlending, depthWrite: false }), 0, .05, -4.7); mouth.name = s < 0 ? 'mouthL' : 'mouthR'; mouth.castShadow = false; mouth.visible = false; gun.add(mouth);
  }
  // the callsign, stencilled on the cockpit roof (seen from above), and a roundel with the Greek letter on each shoulder: this is how the pair are told apart (both are painted alike)
  torso.add(decal('name', callsign, 1.7, .7, 0, 2.685, -.52, -Math.PI / 2 + .08, 0, 0));
  for (const s of [-1, 1]) torso.add(decal('roundel', glyph, .75, .75, s * 1.55, 1.7, 0, -Math.PI / 2, 0, s * .12, 'ZXY'));
  // the pod on the back: a vented housing with radiator fins, six launch tubes with dark mouths, two hinged lids, a trim stripe, an antenna array
  const pod = grp('pod', 0, 1.0, 1.5); torso.add(pod);
  pod.add(plate(2.1, 1.0, 1.15, M.armor, 0, 0, 0, 0, 0, 0, .16), plate(2.2, .14, 1.25, M.trim, 0, -.5, 0), plate(1.7, .4, .1, M.dark, 0, -.05, .6));
  for (let i = 0; i < 7; i++) pod.add(mesh(new THREE.BoxGeometry(1.5, .04, .06), M.steel, 0, -.3 + i * .09, .63));   // (the rear vent louvres)
  for (const s of [-1, 1]) for (let i = 0; i < 4; i++) pod.add(mesh(new THREE.BoxGeometry(.08, .7, .9), M.steel, s * (1.1 + i * .1) * (1), -.0, -.0));
  for (let i = 0; i < 6; i++) {
    const px = ((i % 3) - 1) * .62, pz = (Math.floor(i / 3) - .5) * .5;
    pod.add(cyl(.2, .22, .55, M.steel, px, .72, pz, 0, 0, 0, 12), cyl(.25, .25, .09, M.trim, px, .98, pz, 0, 0, 0, 12), cyl(.15, .15, .02, M.dark, px, 1.0, pz, 0, 0, 0, 12), grp('rocket' + (i + 1), px, 1.05, pz));
  }
  for (const s of [-1, 1]) { const hinge = grp(s < 0 ? 'podLidL' : 'podLidR', s * 1.0, .52, 0); hinge.add(plate(1.0, 1.12, .09, M.armor, -s * .5, 0, 0, Math.PI / 2, 0, 0, .1)); pod.add(hinge); }
  torso.add(cyl(.03, .03, 1.6, M.steel, -.8, 2.55, 1.2), cyl(.03, .03, 1.2, M.steel, .8, 2.3, 1.2), cyl(.22, .12, .1, M.chrome, .0, 1.9, .5, 0, 0, 0, 10), mesh(new THREE.BoxGeometry(.4, .22, .4), M.dark, .5, 1.88, .3));   // antennas, a dish, a sensor box
  for (const s of [-1, 1]) torso.add(plate(.12, .5, .9, M.trim, s * 1.2, 1.15, 1.2, 0, 0, 0, .04));

  // the shield: no bubble, only the ripples (see the shader)
  const shield = new THREE.Mesh(new THREE.SphereGeometry(3.6, 36, 22), shieldMaterial()); shield.name = 'shield'; shield.position.set(0, 5.0, 0); shield.renderOrder = 6; shield.frustumCulled = false; shield.visible = false; root.add(shield);
  const cg = new THREE.Group(); cg.name = 'chargeGlow'; cg.visible = false; root.add(cg);
  return root;
}
