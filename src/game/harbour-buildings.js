// Stage 3's buildings: two-storey military office blocks over the map's 'K' cells (harbour.js).
// Walls of weathered cast-concrete panels in 4 m bays: a pilaster between bays, two windows a bay on
// each floor set in reveals with lintels and sills (some with blinds, ground-floor ones barred, the odd
// one boarded up), a plinth, a ledge between the floors and a cornice under the parapet, drainpipes,
// wall-mounted air-conditioning units; steel doors with canopies, lamps and building-number plates.
// A flat gravel-and-membrane roof with a parapet round its outer edge only (an L-shaped block reads as
// one building), and roof plant: solar arrays, satellite dishes, air-conditioning units, vents, hatches,
// skylights, fuel and water tanks, stair towers on the bigger roofs, a flagpole here and there. Solid and indestructible (the
// cells block). Roof plant keeps clear of `avoid`.
import * as THREE from 'three';
import { mergeStatic } from './optimize.js';

const FACADE_W = 16;   // metres of wall per facade texture repeat (four bays)
const BAY = 4;         // metres per bay
const PARAPET = .55;   // m above the roof
const PX_PER_M = 64;   // facade texture resolution

function canvasTex(w, h, draw, linear = false) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 16;
  return t;
}
function rng(seed) {
  return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}

// Where the windows are in a bay (metres): two a floor.
const WIN_W = .9, WIN_X = [1.15, 2.85];
const winY = H => [[1.365, 2.285], [H / 2 + .97, H / 2 + 1.93]]; // ground floor, upper floor: bottom, top (about 20% smaller than before, about the same centres)

// The facade (FACADE_W wide, the full height): colour and a matching bump map (joints and the window
// recesses low, ledges and sills high).
function facadeTextures(H) {
  const W = FACADE_W * PX_PER_M, Hp = Math.round(H * PX_PER_M), m = PX_PER_M, y = v => Hp - v * m;
  const plan = []; // each window: bay, slot, floor, kind
  const rnd = rng(311);
  for (let b = 0; b < FACADE_W / BAY; b++) for (let s = 0; s < 2; s++) for (let f = 0; f < 2; f++) {
    const r = rnd();
    plan.push({ x: b * BAY + WIN_X[s], f, kind: r < .06 ? 'boarded' : f === 0 && r < .5 ? 'barred' : r < .35 ? 'blinds' : 'plain', blind: .25 + rnd() * .5 });
  }
  const colour = canvasTex(W, Hp, x => {
    x.fillStyle = '#b5ae9b'; x.fillRect(0, 0, W, Hp);
    for (let i = 0; i < 9000; i++) { x.fillStyle = `rgba(${rnd() < .5 ? '60,55,45' : '255,250,235'},${rnd() * .05})`; x.fillRect(rnd() * W, rnd() * Hp, 2 + rnd() * 7, 1 + rnd() * 3); }
    for (let b = 0; b < FACADE_W / BAY; b++) { // pilasters (a lighter strip: the 3D pilaster sits over it) and panel joints
      x.fillStyle = '#bcb5a2'; x.fillRect(b * BAY * m, 0, .5 * m, Hp);
      x.fillStyle = 'rgba(50,45,38,.4)'; x.fillRect((b * BAY + 2) * m - 1, 0, 2, Hp);
    }
    x.fillStyle = 'rgba(50,45,38,.35)'; x.fillRect(0, y(H / 2) - 1, W, 2);
    for (const w of plan) {
      const [b0, t0] = winY(H)[w.f], wx = (w.x - WIN_W / 2) * m, wy = y(t0), ww = WIN_W * m, wh = (t0 - b0) * m;
      x.fillStyle = '#4a463e'; x.fillRect(wx - 5, wy - 5, ww + 10, wh + 10);                        // reveal (shadowed)
      x.fillStyle = '#8f897a'; x.fillRect(wx - 10, wy - 16, ww + 20, 11);                            // lintel
      x.fillStyle = '#cfc8b5'; x.fillRect(wx - 9, wy + wh + 4, ww + 18, 7);                           // sill
      if (w.kind === 'boarded') {
        x.fillStyle = '#7a5a36'; x.fillRect(wx, wy, ww, wh);
        for (let k = 0; k < 5; k++) { x.fillStyle = k % 2 ? '#6a4c2c' : '#86643c'; x.fillRect(wx, wy + k * wh / 5, ww, wh / 5 - 2); }
        continue;
      }
      const g = x.createLinearGradient(wx, wy, wx + ww, wy + wh); g.addColorStop(0, '#9db6c8'); g.addColorStop(.45, '#6b8396'); g.addColorStop(1, '#4a5f70'); // (lighter than a plain window: on a metal the colour tints the reflection)
      x.fillStyle = g; x.fillRect(wx, wy, ww, wh);
      x.fillStyle = 'rgba(200,215,225,.16)'; x.beginPath(); x.moveTo(wx, wy); x.lineTo(wx + ww * .45, wy); x.lineTo(wx, wy + wh * .5); x.fill(); // glint
      if (w.kind === 'blinds') { x.fillStyle = '#d9d3c2'; x.fillRect(wx, wy, ww, wh * w.blind); x.fillStyle = 'rgba(80,70,55,.35)'; for (let k = 0; k < wh * w.blind; k += 5) x.fillRect(wx, wy + k, ww, 1); }
      x.fillStyle = '#3a3833'; x.fillRect(wx + ww / 2 - 2, wy, 4, wh); x.fillRect(wx, wy + wh * .38, ww, 3);  // frame bars
      if (w.kind === 'barred') { x.fillStyle = '#2b2b2a'; for (let k = 1; k < 6; k++) x.fillRect(wx + k * ww / 6 - 1.5, wy - 3, 3, wh + 6); x.fillRect(wx - 3, wy + wh * .7, ww + 6, 3); }
      for (let k = 0; k < 2; k++) { const sx = wx + rnd() * ww, len = 25 + rnd() * 50, gg = x.createLinearGradient(0, wy + wh + 11, 0, wy + wh + 11 + len);
        gg.addColorStop(0, 'rgba(60,55,45,.25)'); gg.addColorStop(1, 'rgba(60,55,45,0)'); x.fillStyle = gg; x.fillRect(sx, wy + wh + 11, 3 + rnd() * 4, len); } // streaks under the sill
    }
    const g = x.createLinearGradient(0, y(1.4), 0, Hp); g.addColorStop(0, 'rgba(50,45,35,0)'); g.addColorStop(1, 'rgba(50,45,35,.35)'); x.fillStyle = g; x.fillRect(0, y(1.4), W, 1.4 * m); // grime at the foot
  });
  const bump = canvasTex(W, Hp, x => {
    x.fillStyle = '#808080'; x.fillRect(0, 0, W, Hp);
    for (let i = 0; i < 6000; i++) { x.fillStyle = `rgba(${rnd() < .5 ? '0,0,0' : '255,255,255'},${rnd() * .08})`; x.fillRect(rnd() * W, rnd() * Hp, 2, 2); }
    x.fillStyle = '#404040'; for (let b = 0; b < FACADE_W / BAY; b++) x.fillRect((b * BAY + 2) * m - 2, 0, 4, Hp); x.fillRect(0, y(H / 2) - 2, W, 4);
    for (const w of plan) {
      const [b0, t0] = winY(H)[w.f], wx = (w.x - WIN_W / 2) * m, wy = y(t0), ww = WIN_W * m, wh = (t0 - b0) * m;
      x.fillStyle = '#202020'; x.fillRect(wx - 5, wy - 5, ww + 10, wh + 10);   // the recess
      x.fillStyle = '#b8b8b8'; x.fillRect(wx - 10, wy - 16, ww + 20, 11); x.fillRect(wx - 9, wy + wh + 4, ww + 18, 7); // lintel, sill
    }
  });
  // Surface map for the glass (green: roughness, blue: metalness): the wall is rough and not metallic; the panes are smooth and almost fully metallic (so a nearby blast lights a pane with little but a small mirror glint, not the flat glow the wall gets), so they mirror the sky and the harbour
  // (the scene's environment); frame bars, blinds, boards and grilles stay matte.
  const MATTE = 'rgb(0,255,0)', PANE = 'rgb(0,8,245)';
  const surface = canvasTex(W, Hp, x => {
    x.fillStyle = MATTE; x.fillRect(0, 0, W, Hp);
    for (const w of plan) {
      if (w.kind === 'boarded') continue;
      const [b0, t0] = winY(H)[w.f], wx = (w.x - WIN_W / 2) * m, wy = y(t0), ww = WIN_W * m, wh = (t0 - b0) * m;
      x.fillStyle = PANE; x.fillRect(wx, wy, ww, wh);
      x.fillStyle = MATTE;
      if (w.kind === 'blinds') x.fillRect(wx, wy, ww, wh * w.blind);
      x.fillRect(wx + ww / 2 - 2, wy, 4, wh); x.fillRect(wx, wy + wh * .38, ww, 3); // frame bars
      if (w.kind === 'barred') { for (let k = 1; k < 6; k++) x.fillRect(wx + k * ww / 6 - 1.5, wy - 3, 3, wh + 6); x.fillRect(wx - 3, wy + wh * .7, ww + 6, 3); }
    }
  });
  return { colour, bump, surface };
}

// Roof: grey membrane in sheets, gravel, puddle stains.
function roofTexture() {
  return canvasTex(256, 256, (x, W, H) => {
    const rnd = rng(97);
    x.fillStyle = '#7a7771'; x.fillRect(0, 0, W, H);
    for (let i = 0; i < 6000; i++) { const v = rnd(); x.fillStyle = `rgba(${v < .5 ? '40,38,34' : '210,205,195'},${.08 + rnd() * .12})`; x.fillRect(rnd() * W, rnd() * H, 1.5, 1.5); }
    x.fillStyle = 'rgba(40,38,34,.35)'; for (let i = 0; i < W; i += 64) x.fillRect(i, 0, 2, H);
    for (let i = 0; i < 8; i++) { const px = rnd() * W, py = rnd() * H, r = 10 + rnd() * 30, g = x.createRadialGradient(px, py, 0, px, py, r);
      g.addColorStop(0, 'rgba(40,40,40,.25)'); g.addColorStop(1, 'rgba(40,40,40,0)'); x.fillStyle = g; x.fillRect(px - r, py - r, 2 * r, 2 * r); }
  });
}

// A building-number plate ("BLDG 14").
function plateMaterial(n) {
  const t = canvasTex(128, 48, (x, W, H) => {
    x.fillStyle = '#1f3a2a'; x.fillRect(0, 0, W, H); x.strokeStyle = '#e8e2cc'; x.lineWidth = 3; x.strokeRect(3, 3, W - 6, H - 6);
    x.fillStyle = '#e8e2cc'; x.font = '700 22px monospace'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(`BLDG ${n}`, W / 2, H / 2 + 1);
  });
  return new THREE.MeshStandardMaterial({ map: t, roughness: .6 });
}

// A box with its sides textured along the wall (u: metres / FACADE_W from each face's own corner, v:
// 0..1 up the full height) and its top in metres / 6 (the roof).
function buildingBox(w, h, d) {
  const g = new THREE.BoxGeometry(w, h, d), uv = g.attributes.uv;
  const along = [d, d, w, w, w, w]; // +x -x +y -y +z -z
  for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) {
    const i = f * 4 + k;
    if (f === 2 || f === 3) uv.setXY(i, uv.getX(i) * w / 6, uv.getY(i) * d / 6);
    else uv.setXY(i, uv.getX(i) * along[f] / FACADE_W, uv.getY(i));
  }
  return g;
}

// rects: the building cells as rectangles ({ r0, r1, c0, c1 }, already run on past the map's sides);
// isK(r, c): whether a cell is building; at(r, c): a cell's north-west corner (world); avoid: [{ x, z }].
// isL(r, c): a laser-maze wall cell (where one meets a building: a concrete pier, no facade detail).
// xLimit: roof plant stays within |x| <= xLimit (the roof past the map's sides is never on screen).
export function buildBuildings(group, rects, isK, at, cell, H, avoid = [], isL = () => false, xLimit = Infinity) {
  const { colour, bump, surface } = facadeTextures(H);
  const facade = new THREE.MeshStandardMaterial({ map: colour, bumpMap: bump, bumpScale: .06, roughness: .9, metalness: 1, roughnessMap: surface, metalnessMap: surface, envMapIntensity: .3 });
  // The glass (where the surface map says metal) is shaded as a mirror of a far-off sky: bands of light and dark laid on the SCREEN, not on the wall, so as the camera moves the panes sweep
  // across them and glint (a far-off reflection does just that); a blast or the sun still adds its own glint on top. The wall is left exactly as lit.
  facade.onBeforeCompile = sh => { sh.fragmentShader = sh.fragmentShader.replace('gl_FragColor = vec4( outgoingLight, diffuseColor.a );', `
    float pane = smoothstep( .5, .9, metalnessFactor );
    vec2 sp = gl_FragCoord.xy * .0045;
    float band = sin( ( sp.x + sp.y * 1.7 ) * 7.0 ) * .5 + .5, band2 = sin( ( sp.x * .6 - sp.y ) * 5.0 + 1.3 ) * .5 + .5;
    vec3 mir = mix( vec3( .015, .025, .04 ), vec3( .14, .235, .365 ), band * band ) + vec3( .35, .45, .55 ) * .7 * pow( band2, 14.0 );
    outgoingLight = mix( outgoingLight, mir + outgoingLight * .35, pane * .8 );
    gl_FragColor = vec4( outgoingLight, diffuseColor.a );`); };
  const roof = new THREE.MeshStandardMaterial({ map: roofTexture(), roughness: .95, envMapIntensity: .25 });
  const concrete = new THREE.MeshStandardMaterial({ color: 0xa69f8c, roughness: .92, envMapIntensity: .3 });
  const blank = new THREE.MeshStandardMaterial({ color: 0xaea792, roughness: .92, envMapIntensity: .3 }); // a blank wall panel: about the colour of the painted facade
  const plinth = new THREE.MeshStandardMaterial({ color: 0x8a8475, roughness: .95, envMapIntensity: .3 });
  const steel = new THREE.MeshStandardMaterial({ color: 0x8c908f, roughness: .5, metalness: .6, envMapIntensity: .5 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x2e3133, roughness: .6, metalness: .5 });
  const pipe = new THREE.MeshStandardMaterial({ color: 0x6f6a5e, roughness: .6, metalness: .4 });
  const door = new THREE.MeshStandardMaterial({ color: 0x4a5a48, roughness: .6, metalness: .4 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x5a7080, roughness: .15, metalness: .6, envMapIntensity: .8 });
  const lamp = new THREE.MeshStandardMaterial({ color: 0xfff2c8, emissive: 0xffe6a0, emissiveIntensity: .6 });
  const white = new THREE.MeshStandardMaterial({ color: 0xe6e6e0, roughness: .5, metalness: .2, envMapIntensity: .5, side: THREE.DoubleSide });
  const dishMetal = new THREE.MeshStandardMaterial({ color: 0xe4e9ec, roughness: .32, metalness: .65, envMapIntensity: .8, side: THREE.DoubleSide }); // a satellite dish: painted aluminium
  const tankMetal = new THREE.MeshStandardMaterial({ color: 0xaab3b9, roughness: .38, metalness: .7, envMapIntensity: .8 });                          // a water tank: galvanised steel
  // Both metals faintly give back the colour of the sky: what the surface faces (its mirror direction, up or toward the horizon) picks a deep blue overhead or a pale blue-white at the horizon,
  // added gently, and a little more at a grazing angle, then banded across the screen (not the object) so it moves as the camera does. (The scene's own reflection is mostly the tan horizon, which on these read as brown.)
  const skyTint = m => { m.onBeforeCompile = sh => { sh.fragmentShader = sh.fragmentShader.replace('gl_FragColor = vec4( outgoingLight, diffuseColor.a );', `
    vec3 skyDir = inverseTransformDirection( reflect( -geometry.viewDir, geometry.normal ), viewMatrix );
    vec3 skyCol = mix( vec3( .42, .54, .68 ), vec3( .10, .22, .45 ), smoothstep( .0, .85, skyDir.y ) );
    float graze = pow( 1.0 - clamp( dot( geometry.normal, geometry.viewDir ), 0.0, 1.0 ), 2.0 );
    vec2 sp = gl_FragCoord.xy * .005; // bands of light and shade laid on the screen: the object slides through them as the camera moves, so its reflection shifts and glints
    float sweep = sin( ( sp.x + sp.y * 1.5 ) * 6.0 ) * .5 + .5, streak = pow( sin( ( sp.x * .6 - sp.y * .8 ) * 4.0 + 1.0 ) * .5 + .5, 10.0 );
    outgoingLight += skyCol * ( .16 + .3 * graze ) * clamp( skyDir.y * 2.0 + .6, 0.0, 1.0 ) * ( .35 + .6 * sweep + .8 * streak );
    gl_FragColor = vec4( outgoingLight, diffuseColor.a );`); }; return m; };
  skyTint(dishMetal); skyTint(tankMetal);
  const alu = new THREE.MeshStandardMaterial({ color: 0xb8bcc0, roughness: .35, metalness: .8, envMapIntensity: .6 });
  const ballast = new THREE.MeshStandardMaterial({ color: 0x9a978e, roughness: .95 });
  const copper = new THREE.MeshStandardMaterial({ color: 0xa86a3a, roughness: .4, metalness: .8 });
  const flag = new THREE.MeshStandardMaterial({ map: canvasTex(96, 64, (x, W, Hh) => { // an olive field flag with a star
    x.fillStyle = '#4b5a32'; x.fillRect(0, 0, W, Hh); x.fillStyle = '#d8d0b0'; x.fillRect(0, Hh * .42, W, Hh * .16);
    x.fillStyle = '#e8e0c0'; x.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 7 : 16; x.lineTo(W * .5 + Math.cos(a) * r, Hh * .5 + Math.sin(a) * r); } x.fill();
  }), roughness: .9, side: THREE.DoubleSide });
  const acUnit = new THREE.MeshStandardMaterial({ map: canvasTex(128, 96, (x, W, Hh) => { // louvred casing
    x.fillStyle = '#b9bcbb'; x.fillRect(0, 0, W, Hh);
    x.fillStyle = 'rgba(40,42,44,.55)'; for (let y = 10; y < Hh - 8; y += 6) x.fillRect(8, y, W - 16, 2);
    x.fillStyle = 'rgba(255,255,255,.25)'; for (let y = 12; y < Hh - 8; y += 6) x.fillRect(8, y, W - 16, 1);
    x.strokeStyle = 'rgba(60,62,64,.6)'; x.lineWidth = 2; x.strokeRect(4, 4, W - 8, Hh - 8);
    const g = x.createLinearGradient(0, Hh * .6, 0, Hh); g.addColorStop(0, 'rgba(90,60,30,0)'); g.addColorStop(1, 'rgba(90,60,30,.25)'); x.fillStyle = g; x.fillRect(0, 0, W, Hh);
  }), roughness: .55, metalness: .5, envMapIntensity: .5 });
  const solar = new THREE.MeshStandardMaterial({ map: canvasTex(128, 192, (x, W, Hh) => { // photovoltaic cells in a silver frame
    x.fillStyle = '#c8ccd0'; x.fillRect(0, 0, W, Hh); x.fillStyle = '#16233a'; x.fillRect(5, 5, W - 10, Hh - 10);
    x.strokeStyle = 'rgba(150,170,200,.45)'; x.lineWidth = 1;
    for (let i = 1; i < 6; i++) { x.beginPath(); x.moveTo(5 + i * (W - 10) / 6, 5); x.lineTo(5 + i * (W - 10) / 6, Hh - 5); x.stroke(); }
    for (let i = 1; i < 10; i++) { x.beginPath(); x.moveTo(5, 5 + i * (Hh - 10) / 10); x.lineTo(W - 5, 5 + i * (Hh - 10) / 10); x.stroke(); }
    const g = x.createLinearGradient(0, 0, W, Hh); g.addColorStop(0, 'rgba(160,190,230,.25)'); g.addColorStop(.4, 'rgba(160,190,230,0)'); x.fillStyle = g; x.fillRect(5, 5, W - 10, Hh - 10);
  }), roughness: .25, metalness: .5, envMapIntensity: .9 });
  // The cells (the dark parts of the panel's texture) mirror the sky the same way the office windows do (see `facade`): bands laid on the screen that the panel slides through as the camera moves, bluer and brighter
  // since a panel tilted up gives back the sky itself; the silver frame and the grid lines between the cells are left as lit.
  solar.onBeforeCompile = sh => { sh.fragmentShader = sh.fragmentShader.replace('gl_FragColor = vec4( outgoingLight, diffuseColor.a );', `
    float cell = 1.0 - smoothstep( .3, .45, dot( diffuseColor.rgb, vec3( .3, .55, .15 ) ) );
    vec2 sp = gl_FragCoord.xy * .004;
    float band = sin( ( sp.x * .8 + sp.y * 1.5 ) * 6.0 + 2.0 ) * .5 + .5, band2 = sin( ( sp.x * .5 - sp.y * .9 ) * 4.0 ) * .5 + .5;
    vec3 sky = mix( vec3( .02, .04, .085 ), vec3( .12, .21, .35 ), band * band ) + vec3( .35, .5, .65 ) * .4 * pow( band2, 12.0 );
    outgoingLight = mix( outgoingLight, sky + outgoingLight * .3, cell * .7 );
    gl_FragColor = vec4( outgoingLight, diffuseColor.a );`); };
  const mats = [facade, facade, roof, roof, facade, facade];
  facade.shadowSide = roof.shadowSide = THREE.FrontSide; // (the shadow is drawn from the faces turned to the sun: no lit seam along the foot of a wall, see harbour.js crateMaterials)
  const extra = new THREE.Group(), rnd = rng(2024);
  const add = (geo, m, x, y, z, ry = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.rotation.y = ry; o.castShadow = o.receiveShadow = true; extra.add(o); return o; };
  const clear = (x, z, r) => avoid.every(a => Math.hypot(a.x - x, a.z - z) > r + 3.2);
  let number = 3 + Math.floor(rnd() * 9);

  for (const { r0, r1, c0, c1 } of rects) {
    const p0 = at(r0, c0), w = (c1 - c0 + 1) * cell, d = (r1 - r0 + 1) * cell, cx = p0.x + w / 2, cz = p0.z + d / 2;
    const box = new THREE.Mesh(buildingBox(w, H, d), mats); box.position.set(cx, H / 2, cz); box.castShadow = box.receiveShadow = true; group.add(box);
    const plate = plateMaterial(number); number += 1 + Math.floor(rnd() * 4);
    // the outside walls: runs of cells whose neighbour isn't building
    const runs = (side) => {
      const out = [], n = side[0] ? c1 - c0 + 1 : r1 - r0 + 1;
      let s = -1;
      for (let k = 0; k <= n; k++) {
        const r = side[0] ? (side[0] < 0 ? r0 : r1) : r0 + k, c = side[0] ? c0 + k : (side[1] < 0 ? c0 : c1);
        const open = k < n && !isK(r + side[0], c + side[1]) && !isL(r + side[0], c + side[1]);
        if (open && s < 0) s = k; if (!open && s >= 0) { out.push([s, k - 1]); s = -1; }
      }
      return out;
    };
    // each face's texture starts at one corner and runs one way (BoxGeometry's layout): where along
    // the wall a point is, in metres from that corner, so the 3D details line up with the painted bays
    const faces = { s: [1, 0, p0.x, 1], n: [-1, 0, p0.x + w, -1], e: [0, 1, p0.z + d, -1], w: [0, -1, p0.z, 1] }; // [dr, dc, origin, direction]
    // where a laser wall meets this building: a concrete pier up its face, the wall built into it
    for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const n = dr ? c1 - c0 + 1 : r1 - r0 + 1;
      for (let k = 0; k < n; k++) {
        const r = dr ? (dr < 0 ? r0 : r1) : r0 + k, c = dr ? c0 + k : (dc < 0 ? c0 : c1);
        if (!isL(r + dr, c + dc)) continue;
        let k2 = k; while (k2 + 1 < n && isL((dr ? r : r0 + k2 + 1) + dr, (dr ? c0 + k2 + 1 : c) + dc)) k2++;
        const along = dr !== 0, o = dr || dc, a = (along ? p0.x : p0.z) + k * cell, b = (along ? p0.x : p0.z) + (k2 + 1) * cell;
        const edge = along ? (dr < 0 ? p0.z : p0.z + d) : (dc < 0 ? p0.x : p0.x + w), len = b - a + .9, mid = (a + b) / 2;
        const [x, z] = along ? [mid, edge + o * .2] : [edge + o * .2, mid];
        add(new THREE.BoxGeometry(along ? len : .4, H + PARAPET, along ? .4 : len), concrete, x, (H + PARAPET) / 2, z);
        k = k2;
      }
    }
    let doorDone = false;
    for (const [dr, dc, origin, dir] of Object.values(faces)) for (const [k0, k1] of runs([dr, dc])) {
      const along = dr !== 0, o = dr || dc; // along X (south / north faces); o: outward
      const a = (along ? p0.x : p0.z) + k0 * cell, b = (along ? p0.x : p0.z) + (k1 + 1) * cell, len = b - a, mid = (a + b) / 2;
      const edge = along ? (dr < 0 ? p0.z : p0.z + d) : (dc < 0 ? p0.x : p0.x + w);
      if (!along && Math.abs(edge) > xLimit) continue; // an end wall out past the map's side: never seen
      const ry = along ? 0 : Math.PI / 2;
      const seen = u => !along || Math.abs(u) <= xLimit; // (along a south / north wall, u is x)
      const at3 = (u, out) => along ? [u, edge + o * out] : [edge + o * out, u]; // (along-the-wall coordinate, distance out) -> x, z
      const run = (h, y, out, m) => { const [x, z] = at3(mid, out / 2); add(new THREE.BoxGeometry(along ? len : out, h, along ? out : len), m, x, y, z); };
      { const [x, z] = at3(mid, -.15); add(new THREE.BoxGeometry(along ? len : .3, PARAPET + .1, along ? .3 : len), concrete, x, H + PARAPET / 2 - .05, z); } // parapet
      run(.6, .3, .1, plinth);                // plinth
      run(.22, H / 2 + .02, .2, concrete);    // ledge between the floors
      run(.32, H - .2, .26, concrete);        // cornice
      const sOf = u => (u - origin) * dir;    // along-the-wall coordinate -> metres from the face's texture corner
      const uOf = s => origin + s * dir;
      const s0 = Math.min(sOf(a), sOf(b)), s1 = Math.max(sOf(a), sOf(b));
      for (let s = Math.ceil(s0 / BAY) * BAY; s < s1 - .3; s += BAY) { // a pilaster at the start of each bay, a drainpipe every other
        if (s < s0 + .1 || !seen(uOf(s + .25))) continue;
        const [x, z] = at3(uOf(s + .25), .09); add(new THREE.BoxGeometry(along ? .5 : .18, H - .2, along ? .18 : .5), concrete, x, H / 2 - .1, z);
        if (Math.round(s / BAY) % 4 === 1) { const [px, pz] = at3(uOf(s + .7), .12); add(new THREE.CylinderGeometry(.07, .07, H - .3, 8), pipe, px, H / 2 - .15, pz); }
      }
      // The facade is painted in whole bays from the face's own corner, so where a wall ends mid-bay (a corner, or where another wall meets this one) a window can be cut in half by the
      // end of the wall. Any window the wall's end crosses is covered with a plain panel (its lintel and sill too) instead of showing as a fragment.
      for (let b = Math.floor(s0 / BAY) - 1; b * BAY < s1; b++) for (const wx of WIN_X) {
        const w0 = b * BAY + wx - WIN_W / 2 - .2, w1 = b * BAY + wx + WIN_W / 2 + .2; // (the window with its reveal, lintel and sill)
        if (w1 <= s0 || w0 >= s1 || (w0 >= s0 && w1 <= s1)) continue; // wholly off the wall, or wholly on it
        const lo = Math.max(w0, s0), hi = Math.min(w1, s1), [x, z] = at3(uOf((lo + hi) / 2), .04);
        if (!seen(uOf((lo + hi) / 2))) continue;
        add(new THREE.BoxGeometry(along ? hi - lo : .08, H - .96, along ? .08 : hi - lo), blank, x, .6 + (H - .96) / 2, z);
      }
      for (let s = Math.ceil(s0 / BAY) * BAY; s < s1 - BAY + .01; s += BAY) { // per bay: a wall-mounted AC unit now and then, a door now and then
        const r = rnd();
        if (!seen(uOf(s + .5 * BAY))) continue;
        if (r < .14) { const [x, z] = at3(uOf(s + WIN_X[1]), .3); add(new THREE.BoxGeometry(along ? .9 : .5, .55, along ? .5 : .9), steel, x, H / 2 + .45, z); } // under an upper window
        if ((!doorDone || r > .82) && s > s0 + 1) { // a door in place of a ground-floor window, with its canopy, lamp and number plate
          doorDone = true;
          const ds = s + WIN_X[0], [x, z] = at3(uOf(ds), .04);
          add(new THREE.BoxGeometry(along ? 1.25 : .08, 2.45, along ? .08 : 1.25), door, x, 1.225, z);
          { const [fx, fz] = at3(uOf(ds), .02); add(new THREE.BoxGeometry(along ? 1.45 : .06, 2.6, along ? .06 : 1.45), dark, fx, 1.3, fz); } // frame
          { const [kx, kz] = at3(uOf(ds), .55); add(new THREE.BoxGeometry(along ? 1.9 : 1.0, .1, along ? 1.0 : 1.9), steel, kx, 2.75, kz); } // canopy
          { const [lx, lz] = at3(uOf(ds), .1); add(new THREE.BoxGeometry(.25, .15, .2), lamp, lx, 2.95, lz); }       // lamp over it
          { const [nx, nz] = at3(uOf(ds + .85), .03); const pl = add(new THREE.PlaneGeometry(.42, .3), plate, nx, 1.9, nz, along ? (o > 0 ? 0 : Math.PI) : (o > 0 ? Math.PI / 2 : -Math.PI / 2)); pl.castShadow = false; } // number plate, between the door and the next window
        }
      }
    }
    // roof: a stair tower on the bigger roofs, then plant, each in its own spot (none overlapping),
    // kept back from the edges and off the lasers
    const area = w * d, taken = [];
    const spot = r => { // a free place for something of radius r on this roof, or null
      if (w < 2.8 + 2 * r || d < 2.8 + 2 * r) return null;
      const xLo = Math.max(p0.x + 1.4 + r, r - xLimit), xHi = Math.min(p0.x + w - 1.4 - r, xLimit - r);
      if (xHi < xLo) return null;
      for (let t = 0; t < 14; t++) {
        const x = xLo + rnd() * (xHi - xLo), z = p0.z + 1.4 + r + rnd() * (d - 2.8 - 2 * r);
        if (clear(x, z, r) && taken.every(q => Math.hypot(q.x - x, q.z - z) > q.r + r + .6)) { taken.push({ x, z, r }); return { x, z }; }
      }
      return null;
    };
    const grp = (x, y, z, rx = 0, ry = 0) => { const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.set(rx, ry, 0, 'YXZ'); extra.add(g); return g; };
    const put = (g, geo, m, x, y, z) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = o.receiveShadow = true; g.add(o); return o; };
    if (area > 260) {
      const q = spot(2.7);
      if (q) {
        add(new THREE.BoxGeometry(3.2, 2.8, 4.2), concrete, q.x, H + 1.4, q.z);
        add(new THREE.BoxGeometry(3.5, .2, 4.5), plinth, q.x, H + 2.9, q.z);
        const fz = q.z + 2.1; // the front wall's face
        const dg = grp(q.x, H, fz); dg.scale.setScalar(.75); // the door and what goes with it, drawn at 75% (local: x across, y up from the roof, z out from the wall)
        put(dg, new THREE.BoxGeometry(1.1, 2.1, .08), door, 0, 1.05, .04);
        put(dg, new THREE.BoxGeometry(1.32, 2.24, .05), dark, 0, 1.12, .015);                             // steel frame round it
        put(dg, new THREE.BoxGeometry(.9, .22, .02), steel, 0, .2, .09);                                  // kick plate
        put(dg, new THREE.BoxGeometry(.9, .22, .02), steel, 0, 1.0, .09);                                 // push plate
        put(dg, new THREE.BoxGeometry(.05, .3, .06), dark, .4, 1.05, .12);                                // handle
        for (let t = 0; t < 4; t++) put(dg, new THREE.BoxGeometry(.7, .03, .02), dark, 0, 1.55 + t * .09, .09); // a louvred panel in the upper door
        put(dg, new THREE.BoxGeometry(1.7, .12, .55), plinth, 0, .06, .27);                               // the step
        put(dg, new THREE.BoxGeometry(1.7, .08, .75), steel, 0, 2.42, .37);                               // canopy over the door
        for (const sx of [-.8, .8]) put(dg, new THREE.BoxGeometry(.05, .3, .05), steel, sx, 2.25, .08).rotation.x = .5; // its brackets
        put(dg, new THREE.BoxGeometry(.22, .12, .16), lamp, 0, 2.32, .2);                                 // lamp under it
        add(new THREE.CylinderGeometry(.03, .03, 2.8, 6), pipe, q.x + 1.42, H + 1.4, fz + .05);            // conduit up the wall
        add(new THREE.BoxGeometry(.7, .55, .04), dark, q.x - 1.05, H + 1.85, fz + .02);                    // a louvred vent
        for (let t = 0; t < 5; t++) add(new THREE.BoxGeometry(.66, .025, .05), steel, q.x - 1.05, H + 1.65 + t * .1, fz + .05);
        add(new THREE.CylinderGeometry(.14, .14, .5, 10), steel, q.x + .8, H + 3.15, q.z - 1);             // a vent stack through the tower roof
        add(new THREE.CylinderGeometry(.05, .26, .2, 12), steel, q.x + .8, H + 3.5, q.z - 1);
      }
    }
    const n = Math.floor(area / 45);
    for (let i = 0; i < n; i++) {
      const k = rnd();
      if (k < .22) { // a solar array: panels on aluminium A-frames, on concrete ballast blocks, a cable run
        const cols = 2 + Math.floor(rnd() * 3), rowsN = 1 + Math.floor(rnd() * 3), q = spot(Math.max(cols * 1.1, rowsN * 2.1) / 2 + .3);
        if (!q) continue;
        for (let b = 0; b < rowsN; b++) {
          const pz = q.z + (b - (rowsN - 1) / 2) * 2.1, span = cols * 1.08;
          for (let a = 0; a <= cols; a++) { // A-frames between the panels
            const fx = q.x + (a - cols / 2) * 1.08;
            const f = grp(fx, H, pz);
            put(f, new THREE.BoxGeometry(.05, .05, 1.5), alu, 0, .5, 0).rotation.x = -.5;      // the rail the panels sit on
            put(f, new THREE.BoxGeometry(.05, .85, .05), alu, 0, .45, -.62);                   // back leg
            put(f, new THREE.BoxGeometry(.05, .2, .05), alu, 0, .12, .62);                     // front leg
            put(f, new THREE.BoxGeometry(.3, .14, 1.7), ballast, 0, .07, 0);                   // ballast block
          }
          for (let a = 0; a < cols; a++) { // the panels, a hair apart
            const g = grp(q.x + (a - (cols - 1) / 2) * 1.08, H + .53, pz, -.5);
            put(g, new THREE.BoxGeometry(1.02, .04, 1.62), solar, 0, 0, 0);
            put(g, new THREE.BoxGeometry(1.04, .035, 1.64), alu, 0, -.02, 0);                  // frame edge under it
          }
          add(new THREE.BoxGeometry(span, .06, .12), dark, q.x, H + .05, pz + .9);            // cable tray
        }
      } else if (k < .36) { // a satellite dish: ballasted base frame, back bracket, rolled rim, tripod feed
        const R = .8 + rnd() * .8, q = spot(R + .5);
        if (!q) continue;
        for (const s of [-1, 1]) { add(new THREE.BoxGeometry(1.8, .08, .1), steel, q.x, H + .06, q.z + s * .8); add(new THREE.BoxGeometry(.1, .08, 1.7), steel, q.x + s * .85, H + .06, q.z); }
        for (const [a, b] of [[-.85, -.8], [.85, -.8], [-.85, .8], [.85, .8]]) add(new THREE.BoxGeometry(.35, .18, .35), ballast, q.x + a, H + .09, q.z + b);
        add(new THREE.CylinderGeometry(.08, .1, 1.0 + R * .3, 8), steel, q.x, H + (1.0 + R * .3) / 2, q.z);  // mast
        const g = grp(q.x, H + 1.1 + R * .3, q.z, -.85 - rnd() * .45, rnd() * Math.PI * 2);
        const f = R * .55, prof = [];
        for (let t = 0; t <= 12; t++) { const r = R * t / 12; prof.push(new THREE.Vector2(r, r * r / (4 * f))); }
        put(g, new THREE.LatheGeometry(prof, 28), dishMetal, 0, 0, 0);
        const rim = put(g, new THREE.TorusGeometry(R, .025, 6, 32), dishMetal, 0, R * R / (4 * f), 0); rim.rotation.x = Math.PI / 2; // rolled rim
        put(g, new THREE.BoxGeometry(.3, .25, .3), steel, 0, -.12, 0);                         // bracket behind it
        const feedY = f;                                                                        // the focus
        for (let t = 0; t < 3; t++) { // three struts from the rim to the feed
          const a = t / 3 * Math.PI * 2, rx = Math.cos(a) * R * .85, rz = Math.sin(a) * R * .85, ry = (R * .85) ** 2 / (4 * f);
          const from = new THREE.Vector3(rx, ry, rz), to = new THREE.Vector3(0, feedY, 0), len = from.distanceTo(to);
          const st = put(g, new THREE.CylinderGeometry(.015, .015, len, 5), steel, (rx) / 2, (ry + feedY) / 2, rz / 2);
          st.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), to.clone().sub(from).normalize());
        }
        put(g, new THREE.CylinderGeometry(.06, .05, .22, 10), dark, 0, feedY, 0);              // the feed horn
      } else if (k < .43) { // a horizontal fuel tank: rounded ends, saddles, a filler pipe
        const q = spot(1.8); if (!q) continue;
        const g = grp(q.x, H + .85, q.z, 0, rnd() < .5 ? 0 : Math.PI / 2);
        put(g, new THREE.CylinderGeometry(.6, .6, 2.4, 18), white, 0, 0, 0).rotation.z = Math.PI / 2;
        for (const s of [-1, 1]) { put(g, new THREE.SphereGeometry(.6, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), white, s * 1.2, 0, 0).rotation.z = -s * Math.PI / 2;
          put(g, new THREE.BoxGeometry(.2, .45, 1.0), dark, s * .8, -.6, 0); }                      // saddles
        put(g, new THREE.CylinderGeometry(.06, .06, .5, 8), steel, .4, .75, 0);                  // filler pipe
        put(g, new THREE.CylinderGeometry(.12, .12, .06, 10), dark, .4, 1.0, 0);                 // its cap
      } else if (k < .7) { // an air-conditioning unit: louvred sides, a guarded fan, on rails, pipes into the roof
        const q = spot(.9); if (!q) continue;
        const g = grp(q.x, H, q.z, 0, rnd() < .5 ? 0 : Math.PI / 2); g.scale.setScalar(.7); // (drawn at 70% of the size it is modelled)
        for (const s of [-.45, .45]) put(g, new THREE.BoxGeometry(1.9, .15, .1), dark, 0, .075, s); // rails
        put(g, new THREE.BoxGeometry(1.8, .95, 1.2), acUnit, 0, .63, 0);
        put(g, new THREE.CylinderGeometry(.42, .42, .03, 20), dark, -.35, 1.12, 0);              // fan well
        const guard = put(g, new THREE.TorusGeometry(.4, .02, 4, 20), steel, -.35, 1.14, 0); guard.rotation.x = Math.PI / 2;
        for (let t = 0; t < 4; t++) { const sp = put(g, new THREE.BoxGeometry(.8, .015, .02), steel, -.35, 1.14, 0); sp.rotation.y = t * Math.PI / 4; } // guard spokes
        for (const s of [-.15, .05]) put(g, new THREE.CylinderGeometry(.03, .03, .5, 6), copper, .7, .35, s);       // refrigerant pipes
        put(g, new THREE.BoxGeometry(.15, .12, .5), dark, .7, .06, -.05);                        // where they go into the roof
      } else if (k < .8) { // a vent pipe with a weather cowl
        const q = spot(.4); if (!q) continue;
        add(new THREE.CylinderGeometry(.15, .15, 1.0, 12), steel, q.x, H + .5, q.z);
        add(new THREE.CylinderGeometry(.06, .32, .22, 14), steel, q.x, H + 1.12, q.z);          // cowl
        add(new THREE.CylinderGeometry(.22, .22, .05, 12), dark, q.x, H + .03, q.z);            // flashing
      } else if (k < .86) { // a roof hatch: a curb, a lid with a handle (some propped open)
        const q = spot(.8); if (!q) continue;
        add(new THREE.BoxGeometry(1.1, .4, 1.1), plinth, q.x, H + .2, q.z);
        const open = rnd() < .3, g = grp(q.x, H + .42, q.z - .55, open ? -1.1 : 0);
        put(g, new THREE.BoxGeometry(1.15, .06, 1.15), steel, 0, 0, .575);
        put(g, new THREE.BoxGeometry(.3, .05, .05), dark, 0, .05, 1.0);                           // handle
      } else if (k < .93) { // a skylight: a raised curb, glass between glazing bars
        const q = spot(1.4); if (!q) continue;
        add(new THREE.BoxGeometry(2.4, .35, 1.5), plinth, q.x, H + .175, q.z);
        add(new THREE.BoxGeometry(2.2, .06, 1.3), glass, q.x, H + .38, q.z);
        for (let t = -2; t <= 2; t++) add(new THREE.BoxGeometry(.04, .08, 1.32), alu, q.x + t * .52, H + .4, q.z);
      } else if (k < .98) { // a water tank on a stand: banded, a hatch on top, a ladder
        const q = spot(1.3); if (!q) continue;
        add(new THREE.CylinderGeometry(1.1, 1.1, 1.7, 22), tankMetal, q.x, H + 1.55, q.z);
        for (const y of [1.0, 1.55, 2.1]) add(new THREE.CylinderGeometry(1.12, 1.12, .05, 22), dark, q.x, H + y, q.z); // bands
        add(new THREE.CylinderGeometry(.25, .25, .1, 12), dark, q.x + .4, H + 2.45, q.z);         // hatch
        for (const [a, b] of [[-.7, -.7], [.7, -.7], [-.7, .7], [.7, .7]]) add(new THREE.BoxGeometry(.12, .7, .12), dark, q.x + a, H + .35, q.z + b);
        for (const s of [-.18, .18]) add(new THREE.BoxGeometry(.04, 2.4, .04), steel, q.x + s, H + 1.2, q.z + 1.15); // ladder
        for (let y = .3; y < 2.4; y += .3) add(new THREE.BoxGeometry(.36, .03, .03), steel, q.x, H + y, q.z + 1.15);
      } else { // a flagpole with its flag
        const q = spot(.6); if (!q) continue;
        add(new THREE.CylinderGeometry(.04, .05, 6, 8), steel, q.x, H + 3, q.z);
        add(new THREE.SphereGeometry(.07, 8, 6), steel, q.x, H + 6.05, q.z);
        const fl = add(new THREE.PlaneGeometry(1.4, .9, 6, 1), flag, q.x + .72, H + 5.4, q.z); fl.castShadow = false;
        const fp = fl.geometry.attributes.position; for (let t = 0; t < fp.count; t++) fp.setZ(t, Math.sin(fp.getX(t) * 3) * .08 * (fp.getX(t) + .7)); // a ripple
        fl.geometry.computeVertexNormals();
      }
    }
  }
  group.add(mergeStatic(extra));
}
