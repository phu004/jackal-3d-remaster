// Shared building blocks for procedural assets.
// Most of this is lifted straight from the Claude.ai artifacts so ported code keeps working.
import * as THREE from 'three';

export const PI = Math.PI;

export const mat = (color, roughness, metalness, extra) =>
  new THREE.MeshStandardMaterial(Object.assign({ color, roughness, metalness }, extra));

export function add(parent, geo, material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  m.castShadow = m.receiveShadow = true;
  parent.add(m);
  return m;
}

// Repeatable random numbers in 0..1, so a prop built with the same seed looks the same every run.
export function seededRandom(seed) {
  let s = Math.floor(seed) | 0;
  return () => { s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}

// Materials/textures are cached so spawning ten jeeps doesn't build ten sets of canvases.
const cache = new Map();
export function cached(key, make) {
  if (!cache.has(key)) cache.set(key, make());
  return cache.get(key);
}

export function canvasTexture(canvas, rx = 1, ry = 1) {
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rx, ry);
  t.anisotropy = 8;
  return t;
}

function noise(x, n, a) {
  for (let i = 0; i < n; i++) {
    x.fillStyle = Math.random() > .5 ? `rgba(255,255,255,${a})` : `rgba(0,0,0,${a})`;
    x.fillRect(Math.random() * 512, Math.random() * 512, 2, 2);
  }
}

// Panel seams, rivets and weathering streaks. bump=true draws the matching bump map.
export function panelCanvas(base, bump) {
  const c = document.createElement('canvas'); c.width = c.height = 512; const x = c.getContext('2d');
  x.fillStyle = bump ? '#808080' : base; x.fillRect(0, 0, 512, 512); if (!bump) noise(x, 4000, .015);
  if (!bump) for (let i = 0; i < 16; i++) {
    const px = Math.random() * 512, py = Math.random() * 380, g = x.createLinearGradient(0, py, 0, py + 40 + Math.random() * 130);
    g.addColorStop(0, 'rgba(0,0,0,.1)'); g.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = g; x.fillRect(px, py, 3 + Math.random() * 9, 170);
  }
  const seam = (a, b, c2, d, w) => { x.strokeStyle = bump ? '#000' : 'rgba(5,30,10,.5)'; x.lineWidth = w; x.beginPath(); x.moveTo(a, b); x.lineTo(c2, d); x.stroke(); };
  [0, 256].forEach(p => { seam(0, p, 512, p, 3); seam(p, 0, p, 512, 3); }); [128, 384].forEach(p => seam(0, p, 512, p, 1)); [170, 340].forEach(p => seam(p, 0, p, 256, 1));
  x.fillStyle = bump ? '#fff' : 'rgba(120,230,130,.28)';
  for (let i = 0; i < 512; i += 32) [0, 256].forEach(p => { [[i, p + 7], [i, p - 7], [p + 7, i], [p - 7, i]].forEach(([a, b]) => { x.beginPath(); x.arc(a, b, 2.3, 0, 7); x.fill(); }); });
  x.strokeStyle = bump ? '#222' : 'rgba(5,30,10,.4)'; x.lineWidth = 2; x.strokeRect(300, 60, 110, 70); x.strokeRect(60, 300, 80, 110);
  return c;
}

// Painted, panelled metal. `repeat` = texture tiles per metre (0.2 → one panel sheet every 5 m).
export function paint(hex, roughness, metalness, repeat = .2) {
  return cached(`paint:${hex}:${roughness}:${metalness}:${repeat}`, () => {
    const bump = cached(`panelBump:${repeat}`, () => canvasTexture(panelCanvas(0, true), repeat, repeat));
    return new THREE.MeshStandardMaterial({
      color: 0xffffff, map: canvasTexture(panelCanvas(hex), repeat, repeat),
      bumpMap: bump, bumpScale: .6, roughness, metalness,
    });
  });
}

export function tireMaterial() {
  return cached('tire', () => {
    const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d');
    x.fillStyle = '#1c1c1c'; x.fillRect(0, 0, 64, 64); x.fillStyle = '#050505';
    [0, 32].forEach(p => x.fillRect(p, 0, 7, 64)); x.fillRect(0, 28, 64, 8);
    const t = canvasTexture(c, 12, 1);
    return new THREE.MeshStandardMaterial({ color: 0xffffff, map: t, bumpMap: t, bumpScale: 2, roughness: .9, metalness: .05 });
  });
}

export const palette = () => cached('palette', () => ({
  black: mat(0x121212, .65, .35),
  steel: mat(0x8d948c, .35, .8),
  yellow: mat(0xe8d24a, .5, .1),
  glass: new THREE.MeshPhysicalMaterial({ color: 0x8fb8d8, roughness: .05, metalness: .1, transparent: true, opacity: .75, clearcoat: 1 }),
}));

export function roundedRect(w, h, r) {
  const s = new THREE.Shape(), x = w / 2, y = h / 2;
  s.moveTo(-x + r, -y); s.lineTo(x - r, -y); s.quadraticCurveTo(x, -y, x, -y + r); s.lineTo(x, y - r);
  s.quadraticCurveTo(x, y, x - r, y); s.lineTo(-x + r, y); s.quadraticCurveTo(-x, y, -x, y - r);
  s.lineTo(-x, -y + r); s.quadraticCurveTo(-x, -y, -x + r, -y);
  return s;
}

// Extrude a side profile (shape x = along the vehicle, y = up) across its width.
// Profile -x ends up at -Z, i.e. the nose.
export function extrudeProfile(parent, shape, depth, bevelThickness, bevelSize, material, x = 0, y = 0, z = 0) {
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness, bevelSize, bevelSegments: 6, curveSegments: 32 });
  g.translate(0, 0, -depth / 2);
  const m = add(parent, g, material, x, y, z);
  m.rotation.y = -PI / 2;
  return m;
}

// Flat canvas-textured plane for stencils, insignia, numbers.
export function decal(w, h, draw, cw = 512, ch = 256) {
  const c = document.createElement('canvas'); c.width = cw; c.height = ch; draw(c.getContext('2d'), cw, ch);
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({
    map: new THREE.CanvasTexture(c), transparent: true, roughness: .7,
    polygonOffset: true, polygonOffsetFactor: -2, depthWrite: false,
  }));
}

// Motion blur for a fast-turning three-blade rotor, drawn on a disc that turns with the rotor (blades
// at 0, 120 and 240 degrees in the disc's plane). Each blade leaves a soft smear that fades away
// behind and ahead of it, darker toward the tips, with a faint ring where the yellow tips sweep
// round; the hub area stays clear. Each disc gets its own material: callers fade it in with the
// rotor speed via material.opacity (0 = invisible when idling).
export function rotorBlurMaterial() {
  const tex = cached('rotorBlurTex', () => {
    const S = 512, c = document.createElement('canvas'); c.width = c.height = S; const x = c.getContext('2d');
    const cx = S / 2, R = S / 2 - 2, img = x.createImageData(S, S), d = img.data;
    for (let py = 0; py < S; py++) for (let px = 0; px < S; px++) {
      const dx = px - cx, dy = cy(py), r = Math.hypot(dx, dy) / R;
      if (r > 1) continue;
      const a = Math.atan2(dy, dx);
      let blade = 0; // closeness to the nearest blade, 1 on it, fading out ~70 degrees either side
      for (let k = 0; k < 3; k++) {
        let da = a - k * 2 * Math.PI / 3; da = Math.atan2(Math.sin(da), Math.cos(da));
        blade = Math.max(blade, Math.exp(-(da * da) / .28));
      }
      const radial = Math.min(1, Math.max(0, (r - .12) / .25)) * (.55 + .45 * r) * Math.min(1, (1 - r) / .03); // clear hub, soft rim
      let alpha = (.02 + .08 * blade) * radial; // light: the blades should still read through it
      let col = [28, 30, 32];
      const tip = Math.exp(-((r - .955) ** 2) / .0004); // the tips' yellow sweeping round
      if (tip > .01) { col = col.map((v, i) => v + ([232, 192, 64][i] - v) * tip * .6); alpha = Math.max(alpha, .06 * tip * (.5 + .5 * blade)); }
      const i = (py * S + px) * 4;
      d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = alpha * 255;
    }
    function cy(py) { return cx - py; } // canvas y down -> disc +y up
    x.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(c); t.anisotropy = 8;
    return t;
  });
  return new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false });
}

// Fewer materials, the same look. A tank is made of a dozen plain materials (dark, metal, rubber, wheel, tyre ...), each its own draw call in every group of the model, in every pass. The plain ones that shade alike (roughness and
// metalness within a step) share one material instead, and each piece keeps its own colour as a vertex colour. Textured paint, glowing and shader-patched materials are left as they are.
const SHARED_PLAIN = new Map();
export function poolPlain(root, step = .2) { // step: how close roughness and metalness must be for two materials to count as alike
  const seen = new Set();
  root.traverse(o => {
    if (!o.isMesh || o.isInstancedMesh || Array.isArray(o.material) || seen.has(o.geometry)) return;
    const m = o.material; seen.add(o.geometry);
    if (!m.isMeshStandardMaterial || m.map || m.bumpMap || m.normalMap || m.emissive.getHex() || m.transparent || m.vertexColors || m.userData.camo || m.userData.damaged || m.onBeforeCompile !== THREE.Material.prototype.onBeforeCompile) return;
    const key = `${Math.round(m.roughness / step)}:${Math.round(m.metalness / step)}:${Math.round(m.envMapIntensity / .5)}:${m.side}`;
    let shared = SHARED_PLAIN.get(key); if (!shared) { shared = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: m.roughness, metalness: m.metalness, envMapIntensity: m.envMapIntensity, side: m.side, vertexColors: true }); SHARED_PLAIN.set(key, shared); }
    const g = o.geometry, n = g.attributes.position.count, col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { col[i * 3] = m.color.r; col[i * 3 + 1] = m.color.g; col[i * 3 + 2] = m.color.b; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3)); o.material = shared;
  });
}
