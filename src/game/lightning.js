// Lightning, for stormy stages: every so often a few quick pulses of cold light, and a thunderclap that arrives a moment later.
//  - the pulses: an ambient light and a cool directional light flare and die (two lights added once, at zero, so the light count never changes), and the puddles' sky brightens too;
//  - the bolt itself: drawn by the puddle shader into the sky it reflects (see puddles.js), so from above you see the flash, and the bolt in the water;
//  - the thunder: a crack and a rolling rumble, synthesized (sfx.thunder).
import * as THREE from 'three';
import { sfx } from './sfx.js';
import { SHADOW_BOX, SHADOW_UP } from './soft-shadows.js';

const PULSES = [[0, 1], [.08, .5], [.17, .9], [.34, .4]]; // [seconds after the start, strength]: a main stroke, a flicker, a bigger return stroke, a trailing one
const rnd = (a, b) => a + Math.random() * (b - a);
const seeded = seed => () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; // (a seeded random sequence: one seed is one strike, always the same)

export class Lightning {
  // cfg: { every: [min, max] seconds between strikes }; setPuddleFlash(v): lights the puddles' sky
  constructor(scene, cfg = {}, setPuddleFlash = null, setBolt = null) {
    this.seeds = cfg.seeds ?? null; this.seed = 0; // seeds: the strikes worth keeping; when there are some, only these are ever struck (pick them with the L key, see trigger)
    this.every = cfg.every ?? [9, 22]; this.storm = 0; // (storm: 0 .. 1, the strikes come that much sooner, see setStorm)
    this.setPuddleFlash = setPuddleFlash; this.setBolt = setBolt;
    this.ambient = new THREE.AmbientLight(0xc8d6ff, 0); this.key = new THREE.DirectionalLight(0xe8f0ff, 0);
    // The strike's own light casts a second set of shadows, over the sun's, which stay as they are: its own, smaller shadow map, the box fitted to the view as the sun's is, and drawn only on the frames of a flash
    // (autoUpdate off, needsUpdate set then). It is invisible between strikes; prewarm() builds the materials for both light counts behind the loading screen, so the first strike doesn't stall.
    this.key.castShadow = true; this.key.shadow.mapSize.set(1024, 1024); this.key.shadow.bias = -.0006; this.key.shadow.normalBias = .05; this.key.shadow.autoUpdate = false;
    Object.assign(this.key.shadow.camera, SHADOW_BOX, { near: 1, far: 150 }); this.key.shadow.camera.up.set(...SHADOW_UP); this.key.visible = false;
    scene.add(this.ambient, this.key, this.key.target);
    this.t = -1; this.wait = rnd(...this.every) * .5; this.flash = 0; this.claps = []; this.camera = null;
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._d = new THREE.Vector3(); this._s = new THREE.Vector3(); this._p = new THREE.Vector3(); this._up = new THREE.Vector3(0, 1, 0);
  }

  // A new bolt. It is part of the SKY now, not an object: the puddle shader draws it into the sky it reflects, so it lies where it should for every puddle and every angle, and the mirror image's own objects
  // pass in front of it. Here it is only described, in the sky plane's own coordinates (the ones the cloud is made in): where it starts, where it ends (it runs out from its start the way a vertical bolt
  // seen in a reflection does, along the line from where the camera is), and a seed for its kinks.
  strike(r) { // r: the strike's own random sequence
    const R = (a, b) => a + r() * (b - a);
    // The part of the sky plane the puddles show on this screen: the four corners of the view, cast down to the ground; the sky plane's coordinates of a ground point are 38 x (its offset from the camera) / (the camera's height).
    // The bolt is put inside that, so it is on the screen (it used to be put at fixed coordinates, which are off the screen most of the time).
    let x0 = -22, x1 = 22, y0 = -50, y1 = -12; // (a guess, if there is no camera)
    const cam = this.camera;
    if (cam) {
      cam.updateMatrixWorld(); const p = this._p, c = cam.position; x0 = y0 = 1e9; x1 = y1 = -1e9;
      for (const [nx, ny] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        p.set(nx, ny, .5).unproject(cam).sub(c); const t = p.y < -1e-3 ? -c.y / p.y : 60 / Math.max(1e-3, c.y), gx = (p.x * t) * 38 / c.y, gz = (p.z * t) * 38 / c.y;
        x0 = Math.min(x0, gx); x1 = Math.max(x1, gx); y0 = Math.min(y0, gz); y1 = Math.max(y1, gz);
      }
    }
    const w = x1 - x0, h = y1 - y0;
    const ax = R(x0 + .15 * w, x1 - .15 * w), az = y1 - h * R(.08, .3),                                   // (the start: low on the screen)
    dir = new THREE.Vector2(ax * .45 + R(-6, 6), az).normalize(); if (dir.y > -.2) { dir.y = -.5; dir.normalize(); } // (the bolt runs on from there, away from the camera's foot: up the screen)
    const len = Math.max(12, (az - (y0 + h * .06)) / -dir.y * R(.8, 1));
    this.boltData = [ax, az, ax + dir.x * len, az + dir.y * len, r() * 50];
    this.setBolt?.(...this.boltData);
  }

  // A strike now. The L key calls this: with no seed it picks one (from `seeds` when the stage lists some, otherwise any), and shows it on screen, so a good-looking strike can be written down and kept; Shift+L
  // strikes the same seed again. A seed fixes everything about the strike: the bolt's place, heading, length and kinks, the direction its light and shadows come from, and the thunder's delay.
  trigger(camera, seed = null, show = false) {
    seed ??= !show && this.seeds?.length ? this.seeds[Math.floor(Math.random() * this.seeds.length)] : Math.floor(Math.random() * 100000); // (the L key, show = true, tries any seed; the stage's own strikes use its list)
    this.seed = seed; const r = seeded(seed), R = (a, b) => a + r() * (b - a);
    this.t = 0; this.camera = camera; this.strike(r); this.claps.push(R(.4, 2.6)); // (each strike's thunder is its own clap, counting down on its own: it still comes if the next strike does first)
    // where the light comes from this time: a different compass direction from the sun's (it is at about 132 degrees), at least 60 degrees round, so every shadow in the scene swings to a new set
    this.az = 132 + (r() < .5 ? -1 : 1) * R(60, 105); this.h = 38; this.setDir();
    if (show) this.say('lightning seed ' + seed);
  }
  setDir() { const a = this.az * Math.PI / 180; this.dir = new THREE.Vector3(Math.cos(a) * 34, this.h, Math.sin(a) * 34); } // (the light's compass angle, and how high it stands)
  // Test mode: the lightning stays on, steadily, so its light, shadows and reflection can be looked at; turn() and raise() then move the light about in real time.
  toggleHold(camera) {
    this.hold = !this.hold;
    if (this.hold) { if (!this.dir) this.trigger(camera, null, true); this.claps.length = 0; this.t = -1; this.say(`lightning held on: angle ${Math.round(this.az)}, height ${Math.round(this.h)} (, . turn it, Shift for fine; [ ] raise and lower it; K off)`); }
    else { this.wait = rnd(...this.every); this.apply(0); this.say('lightning back to normal'); }
  }
  turn(deg) { if (!this.dir) return; this.az = (this.az + deg + 360) % 360; this.setDir(); this.say(`light angle ${Math.round(this.az)}, height ${Math.round(this.h)}`); }
  raise(d) { if (!this.dir) return; this.h = Math.min(80, Math.max(12, this.h + d)); this.setDir(); this.say(`light angle ${Math.round(this.az)}, height ${Math.round(this.h)}`); }
  replay(camera) { this.trigger(camera, this.seed, true); }
  say(text) { // a line of text at the foot of the screen for a few seconds
    console.log(text);
    if (typeof document === 'undefined') return;
    let el = this.label; if (!el) { el = this.label = document.createElement('div'); el.style.cssText = 'position:fixed;left:50%;bottom:14px;transform:translateX(-50%);padding:4px 10px;background:rgba(0,0,0,.6);color:#cfe0ff;font:700 14px monospace;z-index:9;pointer-events:none'; document.body.appendChild(el); }
    el.textContent = text; el.style.display = 'block'; clearTimeout(this.labelTimer); this.labelTimer = setTimeout(() => { el.style.display = 'none'; }, 5000);
  }

  setStorm(k) { this.storm = k; }
  gap() { return rnd(...this.every) * (1 - .75 * this.storm); } // s to the next strike

  update(dt, camera, focus) {
    this.focus = focus;
    if (this.storm > 0 && this.wait > this.every[1] * (1 - .75 * this.storm)) this.wait = this.every[1] * (1 - .75 * this.storm); // (the storm closing in cuts a long wait short)
    if (this.hold) { this.apply(1); return; } // (test mode: steady full light)
    for (let i = this.claps.length - 1; i >= 0; i--) if ((this.claps[i] -= dt) <= 0) { this.claps.splice(i, 1); sfx.thunder?.(0, 1); } // (the thunders: counted down all the time, also between strikes: it used to be counted only while a strike's flashes lasted (1.2 s), so a long delay was never heard)
    if (this.t < 0) {
      if ((this.wait -= dt) <= 0) this.trigger(camera); else { if (this.flash) this.apply(0); return; }
    } else this.t += dt;
    let f = 0;
    for (const [t0, p] of PULSES) if (this.t >= t0) f = Math.max(f, p * Math.exp(-(this.t - t0) * 9));
    if (this.t > 1.2) { this.t = -1; this.wait = this.gap(); f = 0; }
    this.apply(f);
  }

  // Build the materials for both light counts (with the strike's light and without) before the game starts.
  async prewarm(renderer, scene, camera, compile = async () => renderer.compile(scene, camera)) { this.key.visible = true; await compile('LIGHTNING SHADERS'); this.key.visible = false; await compile('LIGHTNING SHADERS'); }
  // ...and with the strike's light on while the firelights are on too (a strike while a wreck burns): a combination of its own, which compiled at the first such strike (22 shader programs: a stall of over two seconds)
  async prewarmWithFires(renderer, scene, camera, fires, compile = async () => renderer.compile(scene, camera)) { fires.show(fires.cap); this.key.visible = true; await compile('FIRE + LIGHTNING SHADERS'); this.key.visible = false; fires.show(0); }

  apply(f) {
    this.flash = f;
    this.ambient.intensity = f * .99; this.key.intensity = f * 2.86; this.key.visible = f > .01; if (f > .01) this.key.shadow.needsUpdate = true;
    if (f > .01 && this.dir) { const c = this.focus ?? this.camera.position; this.key.target.position.set(c.x, 0, c.z - 8); this.key.position.copy(this.key.target.position).add(this.dir); } // (the shadow box lies where the sun's does: on the view)
    this.setPuddleFlash?.(f * 1.1);
  }
}
