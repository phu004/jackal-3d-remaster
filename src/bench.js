// Jackal benchmark: a short series of synthetic tests (about 30 seconds) that each stress ONE part of the graphics pipeline, so the numbers say where a slow device is bottlenecked, and print
// a short scoreboard on screen. Every time is the median over many frames, of CPU + GPU work (each frame ends with a read-back of one pixel, which waits for the GPU to finish), at a fixed
// 1280 x 720 whatever the window, so results compare between devices. The shadow tests use the game's own shadow code (game/soft-shadows.js) at the game's four graphics levels.
import * as THREE from 'three';
import { setShadowSamples } from './game/soft-shadows.js';
import { STOCK, CULLED } from './game/light-cull.js';
THREE.ShaderChunk.lights_fragment_begin = STOCK; // (the game's patch is switched on only for the lights test below)

const W = 1280, H = 720;
const out = document.getElementById('out'), startBtn = document.getElementById('start'), copyBtn = document.getElementById('copy');
const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(1); renderer.setSize(W, H, false);
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const gl = renderer.getContext(), pixel = new Uint8Array(4);
const sync = () => gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel); // (waits until the GPU has finished everything so far)
const tick = () => new Promise(r => setTimeout(r, 0));
const median = a => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };

const lines = []; let live = '';
const show = () => { out.textContent = lines.join('\n') + (live ? '\n' + live : ''); };
const say = (t = '') => { lines.push(t); live = ''; show(); };

// Time frame(i): the median of (CPU submit, CPU + GPU) over about `ms` milliseconds.
async function bench(label, frame, ms = 900) {
  live = label + ' ...'; show(); await tick();
  for (let i = 0; i < 3; i++) { frame(i); sync(); }
  const total = [], cpu = []; const t0 = performance.now(); let i = 0;
  while ((performance.now() - t0 < ms || total.length < 6) && total.length < 300) {
    const a = performance.now(); frame(i++); const b = performance.now(); sync(); const c = performance.now();
    cpu.push(b - a); total.push(c - a); await tick();
  }
  return { ms: median(total), cpu: median(cpu) };
}
const f1 = v => v >= 100 ? v.toFixed(0) : v.toFixed(1);

// ---- scenes -------------------------------------------------------------------------------------------------------------------------------------------------------------------
const ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, -1, 1);
const quadScene = (material, layers = 1) => { const s = new THREE.Scene(); for (let i = 0; i < layers; i++) s.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material)); return s; };
const persp = new THREE.PerspectiveCamera(40, W / H, .1, 2000);

function noiseTexture() { const n = 2048, d = new Uint8Array(n * n * 4); for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 255) | 0; const t = new THREE.DataTexture(d, n, n, THREE.RGBAFormat); t.minFilter = THREE.LinearFilter; t.magFilter = THREE.LinearFilter; t.needsUpdate = true; return t; }

// The scene used for the shadow and resolution tests: lit ground, 400 box casters and 6 detailed ones (about 120k triangles), one sun with a shadow map: a small stand-in for the game.
function shadowScene() {
  const s = new THREE.Scene(); s.background = new THREE.Color(0x7c8456);
  const sun = new THREE.DirectionalLight(0xffffff, 1.2); sun.position.set(30, 60, 20); sun.castShadow = true;
  const c = sun.shadow.camera; c.left = -40; c.right = 40; c.top = 30; c.bottom = -30; c.near = 1; c.far = 150; sun.shadow.bias = -.0004; sun.shadow.normalBias = .05;
  s.add(sun, sun.target, new THREE.HemisphereLight(0xa4ac6c, 0x3d3d22, .5));
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200, 1, 1).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x3a6a2a, roughness: 1 })); ground.receiveShadow = true; s.add(ground);
  const box = new THREE.BoxGeometry(1, 1, 1), mat = new THREE.MeshStandardMaterial({ color: 0x8a7a5a, roughness: .9 });
  for (let i = 0; i < 400; i++) { const m = new THREE.Mesh(box, mat); m.position.set((Math.random() - .5) * 70, .5 + Math.random() * 2, (Math.random() - .5) * 50); m.scale.set(1 + Math.random() * 2, 1 + Math.random() * 3, 1 + Math.random() * 2); m.castShadow = m.receiveShadow = true; s.add(m); }
  const sph = new THREE.IcosahedronGeometry(2.5, 40);
  for (let i = 0; i < 6; i++) { const m = new THREE.Mesh(sph, mat); m.position.set(-25 + i * 10, 3, (i % 2 ? 8 : -8)); m.castShadow = m.receiveShadow = true; s.add(m); }
  const cam = new THREE.PerspectiveCamera(35, W / H, 1, 400); cam.position.set(0, 70, 40); cam.lookAt(0, 0, 0);
  return { scene: s, camera: cam, sun, materials: [ground.material, mat] };
}
function setShadow(sc, size, samples, on = true) { // (the game's four graphics levels: map size and sample count)
  const l = sc.sun; l.castShadow = on; l.shadow.mapSize.set(size, size); l.shadow.map?.dispose(); l.shadow.map = null;
  if (setShadowSamples(samples, size)) for (const m of sc.materials) m.needsUpdate = true;
  renderer.shadowMap.needsUpdate = true;
}

// The lights test: lit ground (one big mesh, like the game's ground and water) and 400 boxes, n point lights (range 14 m, like the game's) scattered over it, no shadows.
// 'all': one scene, every light for every object (three.js's way). 'object': the objects are grouped by which lights reach them (a light reaches an object when its range touches the
// object's bounding sphere) and each group is drawn with only those lights: what a per-object light list would do (the big ground mesh is reached by every light, so it gets them all).
function lightRig(n) {
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const lights = Array.from({ length: n }, () => new THREE.Vector3((rnd() - .5) * 70, 2.5, (rnd() - .5) * 50));
  const ground = new THREE.PlaneGeometry(200, 200).rotateX(-Math.PI / 2), box = new THREE.BoxGeometry(1, 1, 1);
  const objs = [{ geo: ground, at: new THREE.Vector3(), scale: new THREE.Vector3(1, 1, 1), r: 1e4, color: 0x3a6a2a }];
  for (let i = 0; i < 400; i++) {
    const scale = new THREE.Vector3(1 + rnd() * 2, 1 + rnd() * 3, 1 + rnd() * 2);
    objs.push({ geo: box, at: new THREE.Vector3((rnd() - .5) * 70, scale.y / 2, (rnd() - .5) * 50), scale, r: scale.length() / 2, color: 0x8a7a5a });
  }
  return { lights, objs };
}
function lightScenes(rig, mode, chunk) {
  THREE.ShaderChunk.lights_fragment_begin = chunk;
  const groups = new Map();
  for (const o of rig.objs) {
    const ids = rig.lights.map((l, i) => i).filter(i => mode === 'all' || rig.lights[i].distanceTo(o.at) < 14 + o.r);
    const key = mode === 'all' ? 'all' : ids.join(',');
    if (!groups.has(key)) groups.set(key, { ids, objs: [] }); groups.get(key).objs.push(o);
  }
  const scenes = [], mats = [];
  for (const g of groups.values()) {
    const s = new THREE.Scene(); s.add(new THREE.HemisphereLight(0xa4ac6c, 0x3d3d22, .8), new THREE.DirectionalLight(0xffffff, .6));
    for (const i of g.ids) { const l = new THREE.PointLight(0xff9a40, 3, 14, 2); l.position.copy(rig.lights[i]); s.add(l); }
    const byColor = new Map();
    for (const o of g.objs) {
      if (!byColor.has(o.color)) { const m = new THREE.MeshStandardMaterial({ color: o.color, roughness: .9 }); byColor.set(o.color, m); mats.push(m); }
      const m = new THREE.Mesh(o.geo, byColor.get(o.color)); m.position.copy(o.at); m.scale.copy(o.scale); s.add(m);
    }
    scenes.push(s);
  }
  return { scenes, mats };
}
async function lightTest(label, rig, mode, chunk) {
  const { scenes, mats } = lightScenes(rig, mode, chunk), cam = new THREE.PerspectiveCamera(35, W / H, 1, 400); cam.position.set(0, 70, 40); cam.lookAt(0, 0, 0);
  renderer.autoClear = false;
  const r = await bench(label, () => { renderer.clear(); for (const s of scenes) renderer.render(s, cam); }, 1000);
  renderer.autoClear = true; for (const m of mats) m.dispose();
  return { ...r, draws: scenes.length };
}

// ---- the run ------------------------------------------------------------------------------------------------------------------------------------------------------------------
async function run() {
  startBtn.disabled = true; copyBtn.hidden = true; lines.length = 0;
  const dbg = gl.getExtension('WEBGL_debug_renderer_info'), gpu = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
  const R = {};
  say('JACKAL BENCH v1   (1280x720, ms per frame: lower is better)');
  say(`GPU: ${String(gpu).replace(/ANGLE \(|, or similar\)|Direct3D11.*|\)$/g, '').slice(0, 60)}`);
  say(`WebGL${renderer.capabilities.isWebGL2 ? '2' : '1'}  maxTex ${renderer.capabilities.maxTextureSize}  aniso ${renderer.capabilities.getMaxAnisotropy()}  dpr ${devicePixelRatio}  cores ${navigator.hardwareConcurrency ?? '?'}  mem ${navigator.deviceMemory ?? '?'}GB`);
  say('');

  say('-- GPU, one thing at a time --');
  { // fill rate: 8 full-screen layers blended over each other
    const s = quadScene(new THREE.MeshBasicMaterial({ color: 0x101010, transparent: true, blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false }), 8);
    R.fill = await bench('fill', () => renderer.render(s, ortho)); const mp = 8 * W * H / 1e6 / (R.fill.ms / 1000);
    say(`fill 8 layers      ${f1(R.fill.ms).padStart(6)} ms   ${mp.toFixed(0)} Mpix/s`); R.mpix = mp;
  }
  { // shader arithmetic: a loop of sin / cos in every pixel
    const s = quadScene(new THREE.ShaderMaterial({ vertexShader: 'void main(){ gl_Position = vec4(position.xy, 0., 1.); }', fragmentShader: 'void main(){ vec2 p = gl_FragCoord.xy * .001; float a = 0.; for (int i = 0; i < 64; i++) a += sin(p.x * float(i) + a) * cos(p.y * float(i) - a); gl_FragColor = vec4(vec3(a * .01), 1.); }' }));
    R.alu = await bench('alu', () => renderer.render(s, ortho)); say(`shader maths x64    ${f1(R.alu.ms).padStart(6)} ms`);
  }
  { // texture sampling: 16 fetches per pixel from a 2048 texture
    const tex = noiseTexture(), s = quadScene(new THREE.ShaderMaterial({ uniforms: { t: { value: tex } }, vertexShader: 'varying vec2 u; void main(){ u = uv; gl_Position = vec4(position.xy, 0., 1.); }', fragmentShader: 'uniform sampler2D t; varying vec2 u; void main(){ vec4 c = vec4(0.); for (int i = 0; i < 16; i++) c += texture2D(t, u * (1. + float(i) * .37) + float(i) * .013); gl_FragColor = c / 16.; }' }));
    R.tex = await bench('tex', () => renderer.render(s, ortho)); say(`texture 16 taps     ${f1(R.tex.ms).padStart(6)} ms`); tex.dispose();
  }
  { // triangles: 600k lit triangles, tiny on screen (vertex work, almost no pixels)
    const s = new THREE.Scene(), g = new THREE.IcosahedronGeometry(1, 172), tris = g.attributes.position.count / 3;
    s.add(new THREE.DirectionalLight(0xffffff, 1)); const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial()); m.position.z = -60; s.add(m);
    R.tri = await bench('tris', () => renderer.render(s, persp)); say(`${Math.round(tris / 1000)}k triangles      ${f1(R.tri.ms).padStart(6)} ms   ${(tris / 1e6 / (R.tri.ms / 1000)).toFixed(0)} Mtri/s`);
    g.dispose();
  }
  { // blended particles: 2500 additive quads, each about 40 pixels across
    const s = new THREE.Scene(), im = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0x080808, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }), 2500), m4 = new THREE.Matrix4();
    for (let i = 0; i < 2500; i++) { m4.makeScale(1.2, 1.2, 1).setPosition((Math.random() - .5) * 20, (Math.random() - .5) * 11, -20); im.setMatrixAt(i, m4); } s.add(im);
    R.part = await bench('particles', () => renderer.render(s, persp)); say(`2500 particles      ${f1(R.part.ms).padStart(6)} ms`);
  }

  say(''); say('-- CPU: how many things can be drawn --');
  {
    const s = new THREE.Scene(); s.add(new THREE.DirectionalLight(0xffffff, 1)); const g = new THREE.BoxGeometry(.5, .5, .5), m = new THREE.MeshStandardMaterial({ color: 0x888888 });
    for (let i = 0; i < 1500; i++) { const o = new THREE.Mesh(g, m); o.position.set((i % 50 - 25) * .8, (Math.floor(i / 50) - 15) * .8, -40); s.add(o); }
    R.calls = await bench('draws', () => renderer.render(s, persp)); say(`1500 draw calls     ${f1(R.calls.ms).padStart(6)} ms   (CPU submit ${f1(R.calls.cpu)} ms)`);
    const s2 = new THREE.Scene(); s2.add(new THREE.DirectionalLight(0xffffff, 1)); const im = new THREE.InstancedMesh(g, m, 1500), m4 = new THREE.Matrix4();
    for (let i = 0; i < 1500; i++) { m4.setPosition((i % 50 - 25) * .8, (Math.floor(i / 50) - 15) * .8, -40); im.setMatrixAt(i, m4); } s2.add(im);
    R.inst = await bench('instanced', () => renderer.render(s2, persp)); say(`same, instanced     ${f1(R.inst.ms).padStart(6)} ms   (CPU submit ${f1(R.inst.cpu)} ms)`);
  }
  { // plain JavaScript speed, and the scene graph
    let t = performance.now(), x = 0; for (let i = 0; i < 6e6; i++) x += Math.sin(i) * Math.sqrt(i); const arr = []; for (let i = 0; i < 3e5; i++) arr.push([i, i * 2, { a: i }]); R.js = performance.now() - t + (x > 1e30 ? 1 : 0);
    const g = new THREE.Group(); for (let i = 0; i < 4000; i++) { const o = new THREE.Object3D(); o.position.set(i, 0, 0); g.add(o); }
    t = performance.now(); for (let k = 0; k < 10; k++) { g.position.x = k; g.updateMatrixWorld(true); } R.graph = (performance.now() - t) / 10;
    say(`JavaScript          ${f1(R.js).padStart(6)} ms   scene graph 4000 objects ${f1(R.graph)} ms`);
  }

  say(''); say('-- shadows: the game\'s own code, at its four graphics levels --');
  const sc = shadowScene(); renderer.setPixelRatio(1); renderer.setSize(W, H, false);
  const tiers = [['off', 1024, 16, false], ['LOW', 1024, -2, true], ['MEDIUM', 1024, -8, true], ['HIGH', 2048, 8, true], ['ULTRA', 4096, 16, true]]; R.sh = {};
  for (const [name, size, samples, on] of tiers) {
    setShadow(sc, size, samples, on); R.sh[name] = await bench('shadows ' + name, () => { renderer.shadowMap.needsUpdate = true; renderer.render(sc.scene, sc.camera); }, 1200);
  }
  say(tiers.map(([n]) => `${n} ${f1(R.sh[n].ms)}`).join('  |  '));

  say(''); say('-- the same scene (HIGH shadows) at lower resolution --');
  setShadow(sc, 2048, 8, true); R.res = {};
  for (const r of [1, .75, .5]) { renderer.setPixelRatio(r); renderer.setSize(W, H, false); R.res[r] = await bench('res ' + r, () => { renderer.shadowMap.needsUpdate = true; renderer.render(sc.scene, sc.camera); }, 1200); }
  renderer.setPixelRatio(1); renderer.setSize(W, H, false);
  say(`100% ${f1(R.res[1].ms)}   75% ${f1(R.res[.75].ms)}   50% ${f1(R.res[.5].ms)}   (ms; fps ${(1000 / R.res[1].ms).toFixed(0)} / ${(1000 / R.res[.75].ms).toFixed(0)} / ${(1000 / R.res[.5].ms).toFixed(0)})`);

  say(''); say('-- lights: what skipping the ones that do not reach costs / saves (no shadows; ms) --');
  R.lt = {};
  for (const n of [5, 14]) {
    const rig = lightRig(n), base = await lightTest('lights none', lightRig(0), 'all', STOCK);
    const A = await lightTest(`${n} lights, stock`, rig, 'all', STOCK), B = await lightTest(`${n} lights, per pixel`, rig, 'all', CULLED);
    const C = await lightTest(`${n} lights, per object`, rig, 'object', STOCK), D = await lightTest(`${n} lights, object + pixel`, rig, 'object', CULLED);
    R.lt[n] = { base, A, B, C, D };
    say(`${n} lights: none ${f1(base.ms)} | stock ${f1(A.ms)} | per pixel (the game now) ${f1(B.ms)} | per object ${f1(C.ms)} (${C.draws} draws) | both ${f1(D.ms)}`);
  }
  renderer.setPixelRatio(1); renderer.setSize(W, H, false);

  // ---- what it adds up to ----
  say(''); say('-- verdict --');
  const none = R.sh.off.ms, low = R.sh.LOW.ms, high = R.sh.HIGH.ms, ultra = R.sh.ULTRA.ms;
  say(`fill rate ${R.mpix.toFixed(0)} Mpix/s: ${R.mpix > 3000 ? 'good' : R.mpix > 1200 ? 'ok' : 'LOW (this is the likely limit)'}`);
  say(`shadows cost: LOW +${f1(low - none)} ms, HIGH +${f1(high - none)} ms, ULTRA +${f1(ultra - none)} ms over no shadows (scene without them: ${f1(none)} ms)`);
  say(`resolution: 50% is ${(R.res[1].ms / R.res[.5].ms).toFixed(1)}x faster than 100% -> ${R.res[1].ms / R.res[.5].ms > 1.6 ? 'PIXEL-BOUND (a lower resolution scale will help a lot)' : 'NOT mainly pixel-bound (geometry / CPU / shadows)'}`);
  say(`draw calls: ${R.calls.cpu > 6 ? 'CPU-BOUND here: 1500 calls cost ' + f1(R.calls.cpu) + ' ms of CPU' : 'cheap (' + f1(R.calls.cpu) + ' ms for 1500)'}; instancing ${R.inst.ms < R.calls.ms ? 'saves ' + f1(R.calls.ms - R.inst.ms) + ' ms' : 'does not help'}`);
  for (const n of [5, 14]) {
    const { base, A, B, C, D } = R.lt[n], cost = A.ms - base.ms;
    say(`${n} lights cost ${f1(cost)} ms stock; the per-pixel skip (in the game) saves ${f1(A.ms - B.ms)} (${(100 * (A.ms - B.ms) / Math.max(cost, .01)).toFixed(0)}%); per-object lists would save a further ${f1(B.ms - D.ms)} ms on top -> ${B.ms - D.ms > 1.5 && B.ms - D.ms > .25 * (B.ms - base.ms) ? 'worth considering' : 'not worth the work'}`);
  }
  say(`playable? 60 fps needs 16.7 ms; 30 fps needs 33 ms. This scene at LOW: ${f1(low)} ms (${(1000 / low).toFixed(0)} fps), at HIGH: ${f1(high)} ms (${(1000 / high).toFixed(0)} fps)`);
  say(''); say('(send me this block)');
  startBtn.disabled = false; startBtn.textContent = 'RUN AGAIN'; copyBtn.hidden = false;
}
startBtn.onclick = run;
copyBtn.onclick = () => { try { navigator.clipboard.writeText(out.textContent); copyBtn.textContent = 'COPIED'; } catch { const r = document.createRange(); r.selectNodeContents(out); getSelection().removeAllRanges(); getSelection().addRange(r); copyBtn.textContent = 'SELECTED: PRESS CTRL+C'; } };
say('Press START. It takes about 40 seconds; the screen will be busy. Close other tabs for the cleanest numbers.');
