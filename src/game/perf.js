// Performance overlay (toggle with P): percentiles of frame / CPU / GPU time, where the frame goes (see frame-profiler.js), then draw calls, triangles,
// resolution and GPU name. Counts are summed over every render pass in a frame, and averaged over
// the frames in each half-second report (some passes don't run every frame at low quality).
import { FrameProfiler, gpuTimer } from './frame-profiler.js';
// Draw calls per pass this frame (water.js adds the water views; the shadow map is counted here).
export const passCalls = { shadow: 0, reflect: 0, refract: 0 };
// Processor time (ms) per step this frame: the shadow map, the two water views, the main view, and
// the per-frame sorting (water check, reflection and main-view culling), and the walk over every object that updates their matrices (not part of `shadow`). Filled in by world.js / water.js.
export const passTime = { shadow: 0, reflect: 0, refract: 0, main: 0, prep: 0, walk: 0 };
// The live profile's GPU-aware pass timer (live-profile.js): while `on`, each pass ends with mark(name), which waits for the GPU to finish everything drawn so far (reading one pixel of the
// screen; a multisampled target can't be read, so the screen is bound first) and adds the time since the last mark to that pass's total. Off, mark() costs nothing.
export const profile = {
  on: false, renderer: null, px: new Uint8Array(4), last: 0, t: {},
  begin() { this.t = {}; this.last = performance.now(); },
  mark(name) {
    gpuTimer.mark(name); // (the frame profiler's GPU timer: a no-op unless the P overlay is up)
    if (!this.on) return;
    const r = this.renderer, gl = r.getContext(); r.setRenderTarget(null); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, this.px);
    const n = performance.now(); this.t[name] = (this.t[name] ?? 0) + n - this.last; this.last = n;
  },
};

export class PerfHud {
  constructor(renderer) {
    this.renderer = renderer;
    renderer.info.autoReset = false; // we reset once per frame, so all passes are counted
    this.el = document.createElement('div');
    Object.assign(this.el.style, {
      position: 'fixed', right: '12px', top: '12px', padding: '8px 10px', background: 'rgba(0,0,0,.65)', color: '#9f9',
      font: '12px/1.45 "Courier New", monospace', whiteSpace: 'pre', pointerEvents: 'none', borderRadius: '4px', display: 'none', zIndex: 10,
    });
    this.prof = new FrameProfiler(renderer);
    this.text = document.createElement('div');
    this.el.append(this.text);
    document.body.appendChild(this.el);
    const gl = renderer.getContext(), ext = gl.getExtension('WEBGL_debug_renderer_info');
    this.gpu = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'unknown (hidden by browser)';
    this.frames = 0; this.sum = 0; this.worst = 0; this.logic = 0; this.render = 0; this.elapsed = 0;
    this.last = performance.now();
    const shadowMap = renderer.shadowMap, render = shadowMap.render; // count the shadow map's draw calls
    shadowMap.render = function (...a) { const c0 = renderer.info.render.calls; render.apply(this, a); passCalls.shadow += renderer.info.render.calls - c0; };
    this.pass = { shadow: 0, reflect: 0, refract: 0 }; this.time = { shadow: 0, reflect: 0, refract: 0, main: 0, prep: 0, walk: 0 };
  }

  toggle() {
    this.el.style.display = this.el.style.display === 'none' ? 'block' : 'none';
    if (this.panel) this.panel.style.display = this.el.style.display;
    this.prof.setEnabled(this.visible);
  }


  // A tuning slider under the overlay (shown with it), for trying values live. onInput(value).
  slider(label, min, max, step, value, onInput) {
    if (!this.panel) {
      this.panel = document.createElement('div');
      Object.assign(this.panel.style, { position: 'fixed', right: '12px', top: '210px', padding: '8px 10px', background: 'rgba(0,0,0,.65)', color: '#9f9',
        font: '12px/1.6 "Courier New", monospace', borderRadius: '4px', display: this.el.style.display, zIndex: 10, width: '300px' });
      document.body.appendChild(this.panel);
    }
    const row = document.createElement('label');
    Object.assign(row.style, { display: 'grid', gridTemplateColumns: '120px 1fr 44px', alignItems: 'center', gap: '6px' });
    const name = document.createElement('span'); name.textContent = label;
    const input = document.createElement('input'); Object.assign(input, { type: 'range', min, max, step, value });
    const out = document.createElement('span'); out.textContent = value; out.style.textAlign = 'right';
    input.addEventListener('input', () => { out.textContent = input.value; onInput(+input.value); });
    input.addEventListener('keydown', e => e.stopPropagation()); // (arrow keys move the slider, not the jeep)
    row.append(name, input, out); this.panel.appendChild(row);
  }
  get visible() { return this.el.style.display !== 'none'; }

  // Shows a long text (a report) in a box over the game, with COPY and CLOSE buttons.
  showText(text) {
    this.report?.remove();
    const p = this.report = document.createElement('div');
    Object.assign(p.style, { position: 'fixed', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', width: 'min(94vw, 1100px)', boxSizing: 'border-box', padding: '12px 16px', zIndex: 30, background: 'rgba(8,12,4,.95)', border: '3px solid #e8b877' });
    for (const ev of ['mousedown', 'mouseup', 'click', 'keydown', 'keyup', 'pointerdown', 'pointerup', 'wheel']) p.addEventListener(ev, e => e.stopPropagation()); // (the game never sees clicks and keys in it)
    const box = document.createElement('textarea'); box.value = text; box.readOnly = true; box.rows = 34; Object.assign(box.style, { width: '100%', boxSizing: 'border-box', background: '#141a0c', color: '#f0e6c0', border: '2px solid #5a6040', font: '13px/1.35 "Courier New", monospace', whiteSpace: 'pre', resize: 'vertical' });
    const bar = document.createElement('div'); bar.style.marginTop = '8px';
    const btn = (label, fn) => { const b = document.createElement('button'); b.textContent = label; Object.assign(b.style, { margin: '0 10px 0 0', padding: '7px 16px', font: '700 14px "Courier New", monospace', cursor: 'pointer', background: '#e8b877', color: '#1a1406', border: 0 }); b.addEventListener('click', () => fn(b)); bar.appendChild(b); };
    btn('COPY', b => { box.focus(); box.select(); let ok = false; try { ok = document.execCommand('copy'); } catch { /* not allowed */ } b.textContent = ok ? 'COPIED' : 'PRESS CTRL+C'; });
    btn('CLOSE', () => { p.remove(); this.report = null; });
    p.append(box, bar); document.body.appendChild(p);
  }

  // A button under the overlay (shown with it).
  button(label, onClick) {
    this.slider('', 0, 0, 1, 0, () => {}); this.panel.lastChild.remove(); // (makes the panel if it is not there yet)
    const b = document.createElement('button'); b.textContent = label; Object.assign(b.style, { margin: '6px 0 2px', padding: '6px 10px', font: '700 13px "Courier New", monospace', cursor: 'pointer', background: '#e8b877', color: '#1a1406', border: 0 });
    b.addEventListener('click', onClick); b.addEventListener('keydown', e => e.stopPropagation()); this.panel.appendChild(b);
  }

  // Call at the very start of a frame.
  begin() {
    const now = performance.now(), ft = now - this.last;
    this.last = now; this.prof.begin(ft);
    this.frames++; this.sum += ft; this.worst = Math.max(this.worst, ft); this.elapsed += ft;
    const info = this.renderer.info.render; this.calls = (this.calls ?? 0) + info.calls; this.tris = (this.tris ?? 0) + info.triangles; // (the frame just drawn)
    for (const k in passCalls) { this.pass[k] += passCalls[k]; passCalls[k] = 0; }
    for (const k in passTime) { this.time[k] += passTime[k]; passTime[k] = 0; }
    this.renderer.info.reset();
    this.t0 = now;
  }
  // Call between game logic and rendering, then after rendering.
  mark() { this.t1 = performance.now(); this.prof.mid(this.t1 - this.t0); }
  end() {
    const t2 = performance.now();
    this.logic += this.t1 - this.t0; this.render += t2 - this.t1;
    this.prof.end(t2 - this.t1);
    if (this.elapsed < 500) return;
    { const n = this.frames; this.avg = { fps: 1000 * n / this.elapsed, frame: this.sum / n, logic: this.logic / n, render: this.render / n, calls: this.calls / n, tris: this.tris / n }; } // (the last half second, for the live profile)
    if (this.visible) {
      const n = this.frames, r = this.renderer, info = r.info;
      const w = r.domElement.width, h = r.domElement.height; // drawing-buffer size in real pixels
      this.text.style.whiteSpace = 'pre';
      this.text.textContent = [
        ...this.prof.lines(), '',
        `SCENE   draw calls ${(this.calls / n).toFixed(0)}   triangles ${(this.tris / n / 1000).toFixed(0)}k`,
        `  calls   shadow ${(this.pass.shadow / n).toFixed(0)}  reflect ${(this.pass.reflect / n).toFixed(0)}  see-through ${(this.pass.refract / n).toFixed(0)}  main ${((this.calls - this.pass.shadow - this.pass.reflect - this.pass.refract) / n).toFixed(0)}`,
        `  cpu ms  walk ${(this.time.walk / n).toFixed(1)}  shadow ${(this.time.shadow / n).toFixed(1)}  reflect ${(this.time.reflect / n).toFixed(1)}  see-through ${(this.time.refract / n).toFixed(1)}  main ${(this.time.main / n).toFixed(1)}  prep ${(this.time.prep / n).toFixed(1)}`,
        ...(this.extra ? [this.extra()] : []),
        `  geometries ${info.memory.geometries}  textures ${info.memory.textures}  programs ${info.programs.length}`,
        `  ${w}x${h} (pixel ratio ${r.getPixelRatio()})  ${this.gpu}`,
      ].join('\n');
      if (this.panel) this.panel.style.top = `${this.el.offsetHeight + 22}px`; // (the tuning panel sits under the overlay)
    }
    this.frames = 0; this.sum = 0; this.worst = 0; this.logic = 0; this.render = 0; this.elapsed = 0; this.calls = 0; this.tris = 0;
    this.pass = { shadow: 0, reflect: 0, refract: 0 }; this.time = { shadow: 0, reflect: 0, refract: 0, main: 0, prep: 0, walk: 0 };
  }
}
