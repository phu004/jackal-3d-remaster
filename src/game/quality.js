// Graphics quality levels, for slower GPUs (integrated graphics), chosen from the pause menu. Each
// level trades a little sharpness for speed where it costs most: the drawing resolution, the soft
// shadows' sample count, shadow map size and the area it covers, the resolution of the water's
// views, and at the lowest level how often the shadow map and water view are redrawn, the water's
// reflections and the shadows of small plants; from MEDIUM down, wreckage casts no shadows, and at LOW
// only about half the loose wreckage is thrown. ULTRA is the full look.
//
// The level is remembered; a first visit starts at ULTRA. Changing the shadow
// settings recompiles every shader, which can stall a slow machine for a few seconds, so a notice is
// put up (and drawn) first. Antialiasing switches along with the rest (msaa.js: the canvas's own
// could only be chosen when the page loads).
import { setShadowSamples } from './soft-shadows.js';
import { tr } from './lang.js';
import { params } from './nav.js';
import { setWreckShadows, setDebrisAmount } from './debris.js';

// (The area the shadow map covers is fitted to the view at every level: SHADOW_BOX in soft-shadows.js.)
// every: the water's see-through view is redrawn every n frames (the shadow map is every frame).
// samples: soft shadows' samples per pass (negative: cheap shadows with that many taps, see soft-shadows.js).
// wreckShadows: debris and fallen wreckage cast shadows (debris.js). debris: share of the loose wreckage pieces thrown.
// fireLights: how many burning wrecks light their surroundings (the nearest ones; LOW has no point lights at all).
// reflectAA: multisampling of the water's reflection (0 or left out: none).
// seeThrough: the water keeps its see-through view at the lite level (LOW), redrawn every `every` frames; the page address's ?plainwater=1 takes it away again, to compare the cost.
// noEnv: no image-based lighting (the sky map every lit surface samples; LOW has it off with the rest of `lite`).
// plainHud: the warship's page overlay without its animations, filters and glows (they cost old GPUs/browsers a lot, see warship.js).
// aniso: the most anisotropic filtering any texture gets (null: as each was made, up to 16).
export const TIERS = [
  { name: 'ULTRA', ratio: 2, shadow: 4096, aniso: null, samples: 16, water: 1, aa: true, every: 1, reflect: true, reflectAA: 4, fireLights: 8, baseShadows: true, plantShadows: true, wreckShadows: true, debris: 1 },
  { name: 'HIGH', rain: .8, ratio: 2, shadow: 2048, aniso: null, samples: 8, water: .6, aa: true, every: 1, reflect: true, fireLights: 5, plantShadows: true, wreckShadows: true, debris: 1 },
  { name: 'MEDIUM', rain: .5, ratio: 1, shadow: 1024, aniso: 4, samples: -8, water: .5, aa: false, every: 1, reflect: true, fireLights: 3, plantShadows: true, wreckShadows: false, debris: 1, plainHud: true, noEnv: true, puddles: 'lite' },
  { name: 'LOW', rain: 1, ratio: 1, shadow: 1024, aniso: 1, samples: -2, water: .35, aa: false, every: 2, reflect: false, plantShadows: false, wreckShadows: false, debris: .5, puddles: 'damp', lite: true, shadows: true, plainHud: true, seeThrough: true }, // (lite: no pooled point lights, no image-based lighting, water without its see-through view: see world.setLite; shadows: two-tap, 1024 map)
];
const KEY = 'jackal.quality';
export const DEFAULT_TIER = 1; // HIGH, until the player picks one
const ANISO0 = new WeakMap(); // texture -> the anisotropy it was made with
const TEX_SLOTS = ['map', 'bumpMap', 'normalMap', 'roughnessMap', 'metalnessMap', 'alphaMap', 'aoMap', 'emissiveMap'];

const nextFrame = () => new Promise(r => requestAnimationFrame(() => r()));

export class Quality {
  constructor() {
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(KEY)); } catch { /* none */ }
    this.tier = TIERS[saved?.tier] ? saved.tier : DEFAULT_TIER;
    this.busy = false;
    setShadowSamples(this.level.samples, this.level.shadow); // before anything is compiled
    this.note = document.createElement('div'); // the "adjusting" notice
    Object.assign(this.note.style, { position: 'fixed', inset: 0, zIndex: 20, display: 'none', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(10,12,6,.45)', color: '#e8b877', font: '900 26px/1.3 Impact, "Arial Black", sans-serif', letterSpacing: '.12em', textAlign: 'center', pointerEvents: 'none' });
    document.body.appendChild(this.note);
    this.listeners = [];
  }
  // A stage may make some levels cheaper than they are by default (stage.shadowTiers: { ULTRA: { shadow, samples }, HIGH: { ... } }): stage 6 is overcast, its shadows faint and soft, so the finest shadow map and
  // the many-tap filter would be wasted there. `cap` is set by main.js before anything compiles.
  get level() { const t = TIERS[this.tier]; return this.cap?.[t.name] ? { ...t, ...this.cap[t.name] } : t; }
  get label() { return this.level.name; }
  onChange(f) { this.listeners.push(f); }
  save() { try { localStorage.setItem(KEY, JSON.stringify({ tier: this.tier })); } catch { /* not kept */ } }

  // ctx: { renderer, scene, sun, setWaterScale(k), setEvery(n), setReflect(on), setAA(on), resize() }
  bind(ctx) { this.ctx = ctx; this.applyNow(); }
  applyNow() {
    const t = this.level, { renderer, scene, sun, setWaterScale, setEvery, setReflect, setAA, resize } = this.ctx;
    renderer.setPixelRatio(Math.min(devicePixelRatio, t.ratio));
    if (sun.shadow.mapSize.x !== t.shadow) { sun.shadow.mapSize.set(t.shadow, t.shadow); sun.shadow.map?.dispose(); sun.shadow.map = null; }
    setWaterScale(t.water); setEvery(t.every); setReflect(t.reflect); this.ctx.setReflectAA?.(t.reflectAA ?? 0); setAA(t.aa); this.ctx.setLite?.(!!t.lite, !!t.shadows, !!(t.lite || t.noEnv), !!t.lite && !(t.seeThrough && !params.has('plainwater')));
    this.ctx.setRain?.(t.rain ?? 1); // (stage 6's falling rain: a share of its streaks)
    this.ctx.setPuddles?.(t.puddles ?? 'full'); // (stage 6's wet road: LOW keeps only the wet darkening)
    this.ctx.setFireLights?.(t.lite ? 0 : t.fireLights ?? 0); // (after setLite, which shows or hides every point light)
    const recompile = setShadowSamples(t.samples, t.shadow);
    setWreckShadows(t.wreckShadows, scene); // (also for pieces thrown from now on)
    setDebrisAmount(t.debris);
    scene.traverse(o => {
      if (o.userData.baseShadow) o.castShadow = !!t.baseShadows; // the gun emplacements' concrete base: its shadow only at ULTRA
      if (o.userData.plant) o.castShadow = t.plantShadows; // small plants (bushes, cacti): see their tags
      if (!o.material) return;
      for (const m of [].concat(o.material)) {
        if (recompile) m.needsUpdate = true;
        for (const k of TEX_SLOTS) { // anisotropic filtering: capped per level (a change re-uploads the texture)
          const tex = m[k]; if (!tex) continue;
          if (!ANISO0.has(tex)) ANISO0.set(tex, tex.anisotropy); // (r128 textures have no userData)
          const a0 = ANISO0.get(tex), a = t.aniso ? Math.min(a0, t.aniso) : a0;
          if (tex.anisotropy !== a) { tex.anisotropy = a; tex.needsUpdate = true; }
        }
      }
    });
    resize();
  }

  // The pause menu's GRAPHICS choices: switch to level `tier` (an index into TIERS), with the
  // notice up while shaders rebuild (it's drawn before the stall).
  async select(tier) {
    if (this.busy || !TIERS[tier] || tier === this.tier) return;
    this.busy = true;
    this.tier = tier; this.save();
    this.note.innerHTML = `${tr('ADJUSTING GRAPHICS')}<br><span style="font-size:16px;letter-spacing:.2em">${tr(this.label)}</span>`;
    this.note.style.display = 'flex';
    await nextFrame(); await nextFrame(); // the notice is on screen
    this.applyNow();
    this.listeners.forEach(f => f(this.label));
    await nextFrame(); await nextFrame(); await nextFrame(); // the frames that recompile have been drawn
    this.note.style.display = 'none';
    this.busy = false;
  }
}
