// A profile of the REAL game, run on whatever is on screen (the stage 3 boss fight, say), to find what a slow device is bound by. Press P for the performance overlay, then RUN LIVE PROFILE.
// It first notes how the game was running (fps, how long the game logic takes), then freezes the scene, so every test draws exactly the same picture, and draws it again and again with ONE
// thing changed at a time (shadows, the soft-shadow filter, the shadow map's size, the water views, resolution, lighting and textures, the lights, grass, effects, wreckage, enemies,
// antialiasing), then with everything switched off one piece at a time to show what an EMPTY frame costs and what that is made of. Each frame ends by waiting for the GPU, so the time is CPU
// + GPU; every pass of the frame (the shadow map, the water's two views, the main view, the final copy) is timed the same way, so the first and the empty frame can be broken down.
// About a minute; the game is frozen meanwhile and nothing can hurt the jeep.
import * as THREE from 'three';
import { profile } from './perf.js';
import { setShadowSamples } from './soft-shadows.js';

const WARM = 1100, TIME = 1500; // ms: after changing something (shaders may recompile), then measured for this long
const SLOW_WARM = 2800;         // ms: for the changes that recompile every shader
const med = a => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };

export class LiveProfile {
  // env: { renderer, scene, world, quality, setAA(on), fx, debris, soldiers, tanks, resize, perf }
  constructor(env) { this.env = env; this.running = false; this.panel = null; }

  // mode 'stage4': a shorter run just for stage 4, with a baseline measured again after every few tests (so a machine that slows down mid-run shows up) and each test compared with its neighbours.
  start(mode = 'full') {
    if (this.running) return;
    this.mode = mode;
    const e = this.env, pf = e.perf, r = e.renderer, sun = e.world.light.sun, q = e.quality;
    this.live = { fps: pf.avg?.fps ?? 0, logic: pf.avg?.logic ?? 0, render: pf.avg?.render ?? 0, calls: pf.avg?.calls ?? 0, tris: pf.avg?.tris ?? 0 };
    this.gl = r.getContext(); this.px = new Uint8Array(4);
    { // what machine this is: a fixed bit of JavaScript (about 575 ms on the developer's desktop), cores, memory, and whether it is on battery; and a GPU timer if the browser lets us have one
      let t0 = performance.now(), x = 0; for (let i = 0; i < 6e6; i++) x += Math.sin(i) * Math.sqrt(i); this.js = performance.now() - t0 + (x > 1e30 ? 1 : 0);
      this.battery = null; navigator.getBattery?.().then(b => { this.battery = `${b.charging ? 'plugged in' : 'ON BATTERY'} ${(b.level * 100).toFixed(0)}%`; }).catch(() => {});
      this.timer = this.gl.getExtension('EXT_disjoint_timer_query_webgl2') ?? null;
    }
    const st = { objects: 0, meshes: 0, instanced: 0, reflect: 0, hiddenParts: 0 }; e.scene.traverse(o => { st.objects++; if (o.isMesh) st.meshes++; if (o.isInstancedMesh) st.instanced++; if (o.layers.mask & 2) st.reflect++; if (!o.visible) st.hiddenParts++; }); this.stats = st;
    const lights = { sun: 0, point: 0, other: 0 }; e.scene.traverse(o => { if (o.isLight) { if (o.isDirectionalLight) lights.sun++; else if (o.isPointLight) lights.point++; else lights.other++; } }); this.lights = lights;
    const hidden = new Map(), hide = list => { for (const o of list) if (o && o.visible) { hidden.set(o, true); o.visible = false; } }, restore = () => { for (const o of hidden.keys()) o.visible = true; hidden.clear(); };
    const touchMaterials = () => e.scene.traverse(o => { if (o.material) for (const m of [].concat(o.material)) m.needsUpdate = true; });
    let pr = r.getPixelRatio();
    // the switches: each has on() and off(); a phase is one of them, or several together
    const P = {
      shadows: { on() { this.was = sun.castShadow; sun.castShadow = false; }, off() { sun.castShadow = this.was; } }, // (back to what it was: at the lite level they are off anyway)
      cheapFilter: { slow: true, on() { setShadowSamples(-2, sun.shadow.mapSize.x); touchMaterials(); }, off() { setShadowSamples(q.level.samples, q.level.shadow); touchMaterials(); } },
      smallMap: { on() { sun.shadow.mapSize.set(1024, 1024); sun.shadow.map?.dispose(); sun.shadow.map = null; }, off() { sun.shadow.mapSize.set(q.level.shadow, q.level.shadow); sun.shadow.map?.dispose(); sun.shadow.map = null; } },
      water: { on() { e.world.setWaterReflect(false); }, off() { e.world.setWaterReflect(q.level.reflect); } }, // (the reflection; the see-through view can't be switched off alone)
      half: { on() { pr = r.getPixelRatio(); r.setPixelRatio(pr * .5); e.resize(); }, off() { r.setPixelRatio(pr); e.resize(); } },
      // (one grey material per kind of mesh: three r128 keeps ONE shader per material, so a single override for everything crashes on instanced meshes with and without instance colours)
      flat: { slow: true, on() { const mk = () => new THREE.MeshBasicMaterial({ color: 0x808080 }), kinds = [mk(), mk(), mk()]; this.was = new Map(); e.scene.traverse(o => { if (!o.isMesh || !o.material) return; this.was.set(o, o.material); o.material = kinds[o.isInstancedMesh ? (o.instanceColor ? 2 : 1) : 0]; }); }, off() { for (const [o, m] of this.was) o.material = m; this.was = null; } },
      pointLights: { slow: true, on() { const l = []; e.scene.traverse(o => { if (o.isPointLight) l.push(o); }); hide(l); }, off: restore },
      grass: { on() { const l = []; e.scene.traverse(o => { if (o.name === 'grass') l.push(o); }); hide(l); }, off: restore },
      fx: { on() { const l = []; e.scene.traverse(o => { if (o.userData.fxBatch) l.push(o); }); hide(l); }, off: restore },
      wreck: { on() { hide(e.debris.pieces.map(p => p.obj)); }, off: restore },
      enemies: { on() { hide([...e.soldiers.list.map(s => s.obj), ...e.tanks.tanks.map(t => t.obj), ...e.world.turrets.map(t => t.base)]); }, off: restore },
      lasers: { on() { hide(e.lasers.list.flatMap(L => [L.field, L.glowMesh, L.wallMesh, L.obj])); }, off: restore }, // (the whole force-field maze: curtains, glows, emitters)
      by: test => ({ on() { const l = []; e.scene.traverse(o => { if (o.isMesh && o.visible && !o.userData.fxBatch && [].concat(o.material).some(test)) l.push(o); }); hide(l); }, off: restore }), // (every mesh whose material passes the test)
      aa: { on() { e.setAA(false); }, off() { e.setAA(q.level.aa); } },
      all: { on() { hide(e.scene.children.filter(o => !o.isLight)); }, off: restore },
    };
    P.instanced = { on() { const l = []; e.scene.traverse(o => { if (o.isInstancedMesh && o.visible && !o.userData.fxBatch) l.push(o); }); hide(l); }, off: restore };
    P.big = { on() { const l = []; e.scene.traverse(o => { if (!o.isMesh || !o.visible || o.userData.fxBatch || o.isInstancedMesh) return; const g = o.geometry; if (!g.boundingSphere) g.computeBoundingSphere(); if (g.boundingSphere.radius * Math.max(o.scale.x, o.scale.z) > 25) l.push(o); }); hide(l); }, off: restore }; // (the ground, the water, long walls: what covers a lot of the screen)
    P.small = { on() { const l = []; e.scene.traverse(o => { if (!o.isMesh || !o.visible || o.userData.fxBatch || o.isInstancedMesh) return; const g = o.geometry; if (!g.boundingSphere) g.computeBoundingSphere(); if (g.boundingSphere.radius * Math.max(o.scale.x, o.scale.z) <= 25) l.push(o); }); hide(l); }, off: restore };
    P.standard = P.by(m => m.isMeshStandardMaterial); P.phong = P.by(m => m.isMeshPhongMaterial || m.isMeshLambertMaterial); P.basic = P.by(m => m.isMeshBasicMaterial);
    P.quarter = { on() { pr = r.getPixelRatio(); r.setPixelRatio(pr * .25); e.resize(); }, off() { r.setPixelRatio(pr); e.resize(); } };
    P.noSun = { slow: true, on() { this.was = sun.visible; sun.visible = false; }, off() { sun.visible = this.was; } };
    P.noFog = { slow: true, on() { this.was = e.scene.fog; e.scene.fog = null; }, off() { e.scene.fog = this.was; } };
    const domHide = pick => ({ on() { this.was = pick().map(el => [el, el.style.display]); for (const [el] of this.was) el.style.display = 'none'; }, off() { for (const [el, d] of this.was) el.style.display = d; } }); // (page elements, not scene things: the browser draws them over the canvas, outside what the GPU timer sees)
    // stage 6's own switches: the rain (streaks, splashes), the wet road (the film, its mirror pass, its cheaper levels), the container yard, the gate, tanks, glossy (physical) materials
    P.rainStreaks = { on() { hide([e.rain?.mesh]); }, off: restore }; P.rainSplash = { on() { hide([e.rain?.splash]); }, off: restore };
    P.mirror = { on() { e.world.puddleMirrorSkip?.(true); }, off() { e.world.puddleMirrorSkip?.(false); } };
    P.roadOld = { slow: true, on() { e.world.puddleRoad?.(false); }, off() { e.world.puddleRoad?.(true); } }; // (the wet road drawn the old way: the rough layer, not the water shader)
    for (const n of [1, 2, 3, 4, 5]) P['cut' + n] = { on() { e.world.puddleCut?.(n); }, off() { e.world.puddleCut?.(0); } }; // (the wet-road film cut off at a stage: see uCut in puddles.js)
    P.rainRip = { slow: true, on() { e.world.puddleRainRip?.(false); }, off() { e.world.puddleRainRip?.(true); } }; // (the raindrop rings on the puddles: the loop over the grid of drops)
    P.roadRough = { slow: true, on() { e.world.puddleRough?.(false); }, off() { e.world.puddleRough?.(true); } }; // (the rough road reflection and the road-mode water look together: only the puddles and the soaked darkening left)
    P.puddleDamp = { slow: true, on() { e.world.setPuddles?.('damp'); }, off() { e.world.setPuddles?.(q.level.puddles ?? 'full'); } };
    P.puddleLite = { slow: true, on() { e.world.setPuddles?.('lite'); }, off() { e.world.setPuddles?.(q.level.puddles ?? 'full'); } };
    P.tanksOnly = { on() { hide(e.tanks.tanks.map(t => t.obj)); }, off: restore };
    P.physical = P.by(m => m.isMeshPhysicalMaterial); // (the container paint and the jeep: a clearcoat layer each)
    P.shipHud = domHide(() => [document.querySelector('.wsh-box')?.parentElement].filter(Boolean));
    P.pageHud = domHide(() => [...document.querySelectorAll('body *')].filter(el => el.parentElement && el !== el.ownerDocument.body && getComputedStyle(el).position === 'fixed' && getComputedStyle(el).display !== 'none' && !el.querySelector('canvas') && el.tagName !== 'CANVAS' && !el.closest('[data-profile-ui]') && !el.querySelector('textarea') && el.tagName !== 'TEXTAREA'));
    const named = re => ({ on() { hide(e.scene.children.filter(o => re.test(o.name))); }, off: restore }); // (top-level things by name: stage 4's swamp trees, plants, the train ...)
    P.yard = named(/^container/); P.gate = named(/^gate/);
    P.swampTrees = named(/^swampTree/); P.swampPlants = named(/^swamp(Cattails|Lotus|Pads)/); P.idle = named(/^(train|mi24|drone|m270)/); P.buildings = named(/^(tent|barracks|railway)/);
    P.water2 = P.by(m => m.uniforms?.uSwamp); P.transparent = P.by(m => m.transparent); P.custom = P.by(m => m.isShaderMaterial);
    const phase = (name, ...parts) => ({ name, parts: parts.map(k => P[k]), slow: parts.some(k => P[k].slow), group: 1 });
    const byPass = (name, ...parts) => ({ ...phase(name, ...parts), marks: true, group: 0 }); // (same scene, but each pass ends with a wait for the GPU, to time it: see profile.mark)
    this.phases = [
      phase('as it runs'), byPass('as it runs, by pass'),
      phase('no shadows', 'shadows'), phase('cheap shadow filter (2 taps)', 'cheapFilter'), phase('shadow map 1024 (smaller)', 'smallMap'),
      phase('no water views', 'water'), phase('half resolution', 'half'), phase('flat grey shading', 'flat'), phase('no pooled point lights', 'pointLights'),
      phase('no grass and flowers', 'grass'), phase('no effects (smoke, shells)', 'fx'), phase('no wreckage', 'wreck'), phase('no enemies', 'enemies'), phase('no laser maze', 'lasers'), phase('no water surface', 'water2'), phase('no see-through things', 'transparent'), phase('no custom-shader things', 'custom'),
      phase('no ship HUD (page overlay)', 'shipHud'), phase('no fixed page overlays (HUD, hints)', 'pageHud'), phase('no instanced meshes', 'instanced'), phase('no big meshes (ground, water, long walls)', 'big'), phase('only big meshes', 'small'),
      phase('no standard-material things', 'standard'), phase('no phong/lambert things', 'phong'), phase('no basic-material things', 'basic'),
      phase('no sun light', 'noSun'), phase('no fog', 'noFog'), phase('quarter resolution', 'quarter'), phase('no antialiasing', 'aa'),
      { ...phase('NOTHING drawn', 'all'), group: 2 }, { ...byPass('NOTHING drawn, by pass', 'all') }, { ...phase('  + no shadows', 'all', 'shadows'), group: 2 }, { ...phase('  + no water views', 'all', 'shadows', 'water'), group: 2 },
      { ...phase('  + no antialiasing', 'all', 'shadows', 'water', 'aa'), group: 2 }, { ...phase('  + half resolution', 'all', 'shadows', 'water', 'aa', 'half'), group: 2 },
    ];
    if (mode === 'stage4' || mode === 'stage6' || mode === 'wet') { // each batch of three tests sits between two baselines
      const base = () => ({ ...phase('baseline'), base: true }), test = (name, ...k) => ({ ...phase(name, ...k), test: true });
      const tests = mode === 'wet' ? [
        test('A  film hidden altogether (damp darkening only)', 'puddleDamp'), test('B  film: blend and overdraw only (exits at once)', 'cut1'), test('C  film: + the wetness field and the cut-off', 'cut2'),
        test('D  film: + pebble, pool and tilt work', 'cut3'), test('E  film: + the rough layer (no water shader)', 'cut4'), test('F  film complete but no mirror reads', 'cut5'),
        test('G  mirror pass (geometry redrawn)', 'mirror'), test('H  raindrop rings', 'rainRip'), test('I  road drawn the old way (rough layer)', 'roadOld'),
      ] : mode === 'stage6' ? [
        test('rain streaks', 'rainStreaks'), test('rain splashes', 'rainSplash'), test('all the rain', 'rainStreaks', 'rainSplash'),
        test('wet road: the new water-shader look (vs the old rough layer)', 'roadOld'), test('wet road: no road reflection at all (puddles only)', 'roadRough'),
        test('raindrop rings on the puddles (the ripple loop)', 'rainRip'), test('the puddles mirror pass', 'mirror'), test('wet road, damp only (no puddles, no mirror)', 'puddleDamp'), test('wet road, lite (half-size mirror)', 'puddleLite'),
        test('container yard', 'yard'), test('glossy (clearcoat) materials: containers, jeep', 'physical'), test('arena gate (towers, fence, curtain)', 'gate'),
        test('tanks', 'tanksOnly'), test('all enemies', 'enemies'), test('effects (smoke, sparks, flames)', 'fx'),
        test('shadows', 'shadows'), test('instanced meshes (barricades, drums...)', 'instanced'), test('ground and big meshes', 'big'),
        test('half resolution', 'half'), test('flat grey shading', 'flat'), test('NOTHING drawn (the fixed cost)', 'all'),
      ] : [
        test('swamp trees', 'swampTrees'), test('swamp plants (cattails, lotus, pads)', 'swampPlants'), test('grass and flowers', 'grass'),
        test('water surface', 'water2'), test('water reflection view', 'water'), test('shadows', 'shadows'),
        test('ground and big meshes', 'big'), test('instanced meshes (all)', 'instanced'), test('enemies (soldiers, tanks, turrets)', 'enemies'),
        test('waiting things (train, helicopter, drones, launchers)', 'idle'), test('buildings (tents, barracks, railway)', 'buildings'), test('standard-material things', 'standard'),
        test('half resolution', 'half'), test('flat grey shading', 'flat'), test('NOTHING drawn (the fixed cost)', 'all'),
      ];
      this.phases = []; tests.forEach((t, i) => { if (i % 3 === 0) this.phases.push(base()); this.phases.push(t); }); this.phases.push(base());
    }
    { // how long one wait for the GPU costs by itself (an almost empty frame, then reading a pixel): it is part of every pass's time, so it is taken off them
      const L = []; r.setRenderTarget(null); for (let i = 0; i < 16; i++) { const t0 = performance.now(); r.clear(); this.gl.readPixels(0, 0, 1, 1, this.gl.RGBA, this.gl.UNSIGNED_BYTE, this.px); L.push(performance.now() - t0); }
      this.latency = med(L);
    }
    this.pending = []; this.i = -1; this.running = true; profile.on = false; profile.renderer = r;
    this.say('LIVE PROFILE running: the game is frozen for about a minute ...'); this.next();
  }

  next() {
    const prev = this.phases[this.i]; if (prev) for (const p of [...prev.parts].reverse()) p.off();
    this.i++;
    if (this.i >= this.phases.length) return this.finish();
    const p = this.phases[this.i]; if (prev?.slow) p.slow = true; // (undoing a change that recompiled the shaders recompiles them again: that phase needs the long warm-up too)
    profile.on = !!p.marks; for (const x of p.parts) x.on(); p.samples = []; p.submit = []; p.gpu = []; p.passes = []; this.t = performance.now();
    this.say(`LIVE PROFILE ${this.i + 1}/${this.phases.length}: ${p.name.trim()} ...`);
  }

  // Called every frame instead of the game's own while the profile runs: draws the frozen scene, waits for the GPU, times it, and each pass.
  frame(draw) {
    const gl = this.gl, T = this.timer, q = T ? gl.createQuery() : null;
    profile.begin(); const a = performance.now();
    if (q) gl.beginQuery(T.TIME_ELAPSED_EXT, q);
    draw();
    if (q) gl.endQuery(T.TIME_ELAPSED_EXT);
    const b = performance.now(); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, this.px); const c = performance.now();
    const p = this.phases[this.i]; if (q && p) this.pending.push({ q, p });
    if (T && this.pending.length) { // (a query's result is ready a frame or two later: collect whatever is)
      const disjoint = gl.getParameter(T.GPU_DISJOINT_EXT);
      for (let k = this.pending.length - 1; k >= 0; k--) { const e = this.pending[k]; if (gl.getQueryParameter(e.q, gl.QUERY_RESULT_AVAILABLE)) { if (!disjoint) e.p.gpu.push(gl.getQueryParameter(e.q, gl.QUERY_RESULT) / 1e6); gl.deleteQuery(e.q); this.pending.splice(k, 1); } }
    }
    let gpu = null;
    if (!p) return; const el = c - this.t, warm = p.slow ? SLOW_WARM : WARM;
    if (el > warm) { p.samples.push(c - a); p.submit.push(b - a); if (gpu !== null) p.gpu.push(gpu); p.passes.push({ ...profile.t }); }
    if (el > warm + TIME && p.samples.length >= 5) {
      p.ms = med(p.samples); p.cpu = med(p.submit); p.gpuMs = p.gpu.length ? med(p.gpu) : null;
      p.pass = {}; for (const k of new Set(p.passes.flatMap(o => Object.keys(o)))) p.pass[k] = med(p.passes.map(o => o[k] ?? 0)); this.next();
    }
  }

  // Stage 4's report: what each test saves compared with the baselines measured just before and after it.
  finishStage4() {
    this.running = false; profile.on = false;
    const P = this.phases, f = v => v.toFixed(1), live = this.live, w = this.env.renderer.domElement, Lat = this.latency;
    const gpuOk = P.every(p => p.gpuMs !== null && p.gpuMs !== undefined), val = p => gpuOk ? p.gpuMs : Math.max(.1, p.ms - Lat);
    const bases = P.filter(p => p.base).map(val), lo = Math.min(...bases), hi = Math.max(...bases), spread = (hi - lo) / lo;
    const noise = Math.max(.4, (hi - lo) * .5);
    const rows = P.map((p, i) => {
      if (!p.test) return null;
      const before = P.slice(0, i).reverse().find(x => x.base), after = P.slice(i + 1).find(x => x.base), ref = (val(before) + val(after)) / 2;
      return { name: p.name, now: val(p), ref, saving: ref - val(p), cpu: p.cpu };
    }).filter(Boolean);
    const floor = rows.find(r => r.name.startsWith('NOTHING')), list = rows.filter(r => r !== floor).sort((a, b) => b.saving - a.saving);
    const L = [`${this.mode === 'wet' ? 'WET ROAD' : 'STAGE ' + (this.mode === 'stage6' ? 6 : 4)} PROFILE   ${w.width}x${w.height}  graphics ${this.env.quality.label}`,
      `before freezing: ${live.fps.toFixed(0)} fps, game logic ${f(live.logic)} ms, ${live.calls.toFixed(0)} draw calls, ${(live.tris / 1000).toFixed(0)}k triangles`,
      `machine: ${navigator.hardwareConcurrency ?? '?'} cores, JavaScript yardstick ${f(this.js)} ms (a fast desktop does it in about 45), ${this.battery ?? 'power: unknown'}`,
      `numbers are ${gpuOk ? 'GPU milliseconds per frame (from the GPU timer)' : 'milliseconds per frame, CPU + GPU, the wait for the GPU taken off (no GPU timer here)'}`, '',
      `BASELINE (the untouched scene, measured between the tests): ${P.filter(p => p.base).map(p => f(val(p))).join('  ')}`,
      spread > .15 ? `  !! it drifted ${(spread * 100).toFixed(0)}%: the machine slowed or sped up during the run (power saving? heat?). Savings below are rough.` : `  steady (${(spread * 100).toFixed(0)}% drift): the numbers below can be trusted`,
      `  each test is compared with the baselines just before and after it; under ${f(noise)} ms is noise`, '',
      'WHAT EACH THING COSTS (what switching it off saves, biggest first)', `${'switched off'.padEnd(56)}  with it   without   saving  share`];
    for (const r of list) L.push(`${r.name.padEnd(56)}  ${f(r.ref).padStart(7)}  ${f(r.now).padStart(8)}  ${(r.saving >= 0 ? '-' : '+') + f(Math.abs(r.saving))}`.padEnd(98).trimEnd() + `  ${(r.saving / r.ref * 100).toFixed(0).padStart(3)}%${Math.abs(r.saving) < noise ? '  (noise)' : ''}`);
    if (floor) L.push('', `an EMPTY frame costs ${f(floor.now)} ms (${(floor.now / floor.ref * 100).toFixed(0)}% of the frame): the fixed cost, mostly the walk over every object and the machine's floor`);
    const top = list.filter(r => r.saving >= noise).slice(0, 4);
    L.push('', 'VERDICT', top.length ? `biggest costs: ${top.map(r => `${r.name} (${f(r.saving)} ms)`).join(', ')}` : 'nothing stands out above the noise: the cost is spread over everything');
    this.say(L.join('\n'), true); console.log(L.join('\n'));
  }

  finish() {
    if (this.mode === 'stage4' || this.mode === 'stage6' || this.mode === 'wet') return this.finishStage4();
    this.running = false; profile.on = false;
    const P = this.phases, f = v => v.toFixed(1), live = this.live, w = this.env.renderer.domElement, L = this.latency, by = n => P.find(p => p.name === n);
    const adj = p => Math.max(.1, p.ms - L); // (every timing ends with one wait for the GPU, which costs L by itself: taken off)
    const base = adj(by('as it runs')), single = P.filter(p => p.group === 1), built = P.filter(p => p.group === 2);
    const lines = [`LIVE PROFILE   ${w.width}x${w.height}  graphics ${this.env.quality.label}`,
      `before freezing: ${live.fps.toFixed(0)} fps, game logic ${f(live.logic)} ms, ${live.calls.toFixed(0)} draw calls, ${(live.tris / 1000).toFixed(0)}k triangles`,
      `scene: ${this.stats.objects} objects, ${this.stats.meshes} meshes (${this.stats.instanced} instanced), ${this.stats.reflect} on the reflection layer`,
      `lights in the scene: ${this.lights.sun} sun, ${this.lights.other} sky/fill, ${this.lights.point} point${this.env.quality.level.lite ? ' (switched off at this level)' : ' (every pixel is shaded against all of them)'}`,
      `machine: ${navigator.hardwareConcurrency ?? '?'} cores, ${navigator.deviceMemory ?? '?'} GB, JavaScript yardstick ${f(this.js)} ms (a fast desktop does it in about 45), ${this.battery ?? 'power: unknown'}`,
      `GPU timer: ${this.timer ? 'available' : 'NOT available in this browser (no GPU column)'}`,
      `one wait for the GPU costs ${f(L)} ms by itself; it is taken off every number below`,
      `(ms to draw one frame, CPU + GPU: lower is better; "-x" = what that saves; changes under about ${f(Math.max(2, base * .08))} ms are noise)`, '', 'ONE THING SWITCHED OFF AT A TIME'];
    for (const p of single) lines.push(`${p.name.padEnd(30)} ${f(adj(p)).padStart(6)}${p === single[0] ? `   (${(1000 / adj(p)).toFixed(0)} fps)` : `   ${adj(p) <= base ? '-' : '+'}${f(Math.abs(base - adj(p))).padEnd(5)}`}   cpu ${f(p.cpu).padStart(5)}  gpu ${p.gpuMs === null ? '  ?  ' : f(p.gpuMs).padStart(5)}`);
    lines.push('', 'AN EMPTY FRAME, BUILT UP (what the fixed cost is made of)');
    for (const p of built) lines.push(`${p.name.padEnd(30)} ${f(adj(p)).padStart(6)}`);
    const table = (title, ph, n) => { // each pass's time and share of the frame, the wait for the GPU taken off each
      const names = Object.keys(ph.pass).sort((a, b) => ph.pass[b] - ph.pass[a]), vals = names.map(k => Math.max(0, ph.pass[k] - L)), sum = vals.reduce((a, b) => a + b, 0);
      lines.push('', title);
      names.forEach((k, i) => lines.push(`${k.padEnd(36)} ${f(vals[i]).padStart(6)}  ${(vals[i] / sum * 100).toFixed(0).padStart(3)}%`));
      lines.push(`${'total'.padEnd(36)} ${f(sum).padStart(6)}`);
    };
    table('THE FRAME AS IT RUNS, BY PASS', by('as it runs, by pass')); table('THE EMPTY FRAME, BY PASS', by('NOTHING drawn, by pass'));
    const half = adj(by('half resolution')), flat = adj(by('flat grey shading')), noSh = adj(by('no shadows')), cheap = adj(by('cheap shadow filter (2 taps)')), small = adj(by('shadow map 1024 (smaller)')), noPt = adj(by('no pooled point lights'));
    const empty = adj(by('NOTHING drawn')), emptyAll = adj(by('  + half resolution'));
    const b0 = by('as it runs');
    lines.push('', 'VERDICT');
    lines.push(`where the time goes, as it runs: the CPU spends ${f(b0.cpu)} ms submitting the frame (JavaScript + the browser's graphics layer)${b0.gpuMs === null ? '' : `, the GPU itself is busy ${f(b0.gpuMs)} ms`}, and the frame takes ${f(b0.ms)} ms in all`);
    const frameMs = adj(b0); lines.push(b0.cpu > frameMs * .6 ? 'CPU-BOUND: the processor, not the graphics chip, is the limit (draw calls and per-draw work): fewer draw calls and simpler materials will help, a lower resolution will not' : b0.cpu < frameMs * .4 ? `GPU-BOUND: submitting the frame takes only ${f(b0.cpu)} of its ${f(frameMs)} ms; the rest is the graphics chip (shading, pixels): cheaper materials and fewer pixels are what help` : 'mixed: neither side dominates');
    const gains = single.slice(1).map(p => ({ name: p.name, gain: base - adj(p) })).sort((a, b) => b.gain - a.gain);
    lines.push(`biggest savings: ${gains.slice(0, 3).map(g => `${g.name} (${f(g.gain)})`).join(', ')}`);
    lines.push(half < base * .65 ? `PIXEL-BOUND: half resolution saves ${((1 - half / base) * 100).toFixed(0)}% (a lower resolution scale is the fix)` : `not mainly pixel-bound: half resolution saves ${((1 - half / base) * 100).toFixed(0)}%`);
    lines.push(flat < base * .65 ? `SHADER / DRAW-BOUND: flat shading saves ${((1 - flat / base) * 100).toFixed(0)}% (lighting, textures, shadow lookups, and the uniforms every draw call sends)` : `lighting and textures: flat shading saves ${((1 - flat / base) * 100).toFixed(0)}%`);
    lines.push(`shadows: ${f(base - noSh)} ms in all = ${f(base - cheap)} the soft filter + ${f(cheap - noSh)} the map and a cheap lookup; a 1024 map saves ${f(base - small)}`);
    lines.push(`the ${this.lights.point} pooled point lights cost ${f(base - noPt)} ms (${((base - noPt) / base * 100).toFixed(0)}%)`);
    lines.push(`an EMPTY frame costs ${f(empty)} ms (${(empty / base * 100).toFixed(0)}% of the frame); ${f(emptyAll)} ms with shadows, water, antialiasing and resolution all stripped: that last part is the machine's own floor`);
    lines.push(live.logic > base * .4 ? `GAME LOGIC is heavy: ${f(live.logic)} ms per frame of CPU` : `game logic is light (${f(live.logic)} ms)`);
    this.say(lines.join('\n'), true); console.log(lines.join('\n'));
  }

  // The panel: a progress line while it runs; at the end the whole report in a text box (select it, or press COPY) with a CLOSE button. It stays until CLOSE: clicking in it, selecting text and
  // letting go of the mouse does nothing else.
  say(text, final = false) {
    if (!this.panel) {
      this.panel = document.createElement('div');
      Object.assign(this.panel.style, { position: 'fixed', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', width: 'min(92vw, 900px)', maxHeight: '92vh', overflow: 'auto', boxSizing: 'border-box', padding: '16px 20px', zIndex: 30,
        background: 'rgba(8,12,4,.95)', color: '#f0e6c0', border: '3px solid #e8b877', font: '700 17px/1.45 "Courier New", monospace', userSelect: 'text', pointerEvents: 'auto', cursor: 'auto' });
      for (const ev of ['mousedown', 'mouseup', 'click', 'keydown', 'keyup', 'pointerdown', 'pointerup', 'touchstart', 'touchend']) this.panel.addEventListener(ev, e => e.stopPropagation()); // (the game's own input never sees clicks and keys in it)
      document.body.appendChild(this.panel);
    }
    const p = this.panel; p.textContent = '';
    if (!final) { const pre = document.createElement('pre'); pre.textContent = text; Object.assign(pre.style, { margin: 0, whiteSpace: 'pre-wrap' }); p.appendChild(pre); return; }
    const box = document.createElement('textarea'); box.value = text; box.readOnly = true; box.rows = Math.min(34, text.split('\n').length + 1);
    Object.assign(box.style, { width: '100%', boxSizing: 'border-box', background: '#141a0c', color: '#f0e6c0', border: '2px solid #5a6040', font: '700 15px/1.4 "Courier New", monospace', resize: 'vertical', userSelect: 'text' });
    box.addEventListener('focus', () => box.select());
    const bar = document.createElement('div'); bar.style.marginTop = '10px';
    const btn = (label, fn) => { const b = document.createElement('button'); b.textContent = label; Object.assign(b.style, { margin: '0 10px 0 0', padding: '9px 20px', font: '900 17px/1 Impact, "Arial Black", sans-serif', letterSpacing: '.08em', color: '#1a1406', background: '#e8b877', border: 0, boxShadow: '0 3px 0 #7a4a10', cursor: 'pointer' }); b.addEventListener('click', () => fn(b)); bar.appendChild(b); return b; };
    btn('COPY', b => { // (the clipboard API where it is allowed; otherwise the old way, through the text box)
      box.focus(); box.select(); let ok = false;
      try { ok = document.execCommand('copy'); } catch { /* not allowed */ }
      if (!ok && navigator.clipboard) navigator.clipboard.writeText(text).then(() => { b.textContent = 'COPIED'; }, () => { b.textContent = 'PRESS CTRL+C'; });
      else b.textContent = ok ? 'COPIED' : 'PRESS CTRL+C';
    });
    btn('CLOSE', () => { p.remove(); this.panel = null; });
    p.append(box, bar); box.focus(); box.select();
  }
}
