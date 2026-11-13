// The frame profiler behind the P overlay: where one frame's time really goes, on the CPU and on the GPU, without ever stalling either.
// - GPU time comes from hardware timer queries (EXT_disjoint_timer_query_webgl2). Every profile.mark(name) in the render code (perf.js) closes one query and opens the next, so each pass of
//   the frame (shadow map, water views, main view, antialias) gets its own GPU time. Results arrive a few frames later and are matched to their frame; nothing waits for the GPU.
//   The browser's compositing of the page over the canvas is outside what these queries see.
// - CPU time is the game logic and the render submission (JavaScript + the browser's graphics layer), taken with performance.now().
// - The frame interval is what the player gets. Interval minus CPU time is idle / vsync wait / browser work; max(CPU, GPU) is what the machine needs per frame, so 1000 / that is how fast it
//   would run without the display's cap.
// Everything runs only while the overlay is up. Last N frames are kept; percentiles are worked out twice a second.
const N = 600;

const SHORT = { 'scene matrices (every object)': 'scene matrices', 'antialias + colour grade to screen': 'AA + grade to screen', 'cleanup after the views': 'cleanup', 'reflection culling': 'reflection cull', 'main culling': 'main cull' };

// GPU timer queries, one TIME_ELAPSED query per segment; queries can't nest, so a mark ends one and starts the next. perf.js's profile.mark() calls mark().
export const gpuTimer = {
  gl: null, ext: null, frame: null, open: null, pending: [], free: [],
  init(renderer) {
    this.gl = renderer.capabilities.isWebGL2 ? renderer.getContext() : null;
    this.ext = this.gl?.getExtension('EXT_disjoint_timer_query_webgl2') ?? null;
    return !!this.ext;
  },
  begin(id) { if (!this.ext) return; if (this.frame) this.abort(); this.frame = { id, qs: [] }; this.start(); },
  start() { const gl = this.gl, q = this.free.pop() ?? gl.createQuery(); gl.beginQuery(this.ext.TIME_ELAPSED_EXT, q); this.open = { q, name: '' }; this.frame.qs.push(this.open); },
  stop(name) { this.gl.endQuery(this.ext.TIME_ELAPSED_EXT); this.open.name = name; this.open = null; },
  mark(name) { if (!this.frame) return; this.stop(name); this.start(); }, // (what was drawn since the last mark is called `name`)
  end() { if (!this.frame) return; this.stop('other'); this.pending.push(this.frame); this.frame = null; if (this.pending.length > 10) this.discard(this.pending.shift()); },
  abort() { if (this.frame) { this.gl.endQuery(this.ext.TIME_ELAPSED_EXT); this.discard(this.frame); this.frame = this.open = null; } for (const f of this.pending) this.discard(f); this.pending.length = 0; },
  discard(f) { for (const s of f.qs) this.gl.deleteQuery(s.q); },
  // Hands every finished frame to sink(id, [[name, ms], ...]); the rest stay for later.
  collect(sink) {
    const gl = this.gl; if (!this.pending.length) return;
    const disjoint = gl.getParameter(this.ext.GPU_DISJOINT_EXT); // (the GPU was reset or throttled: those times mean nothing)
    while (this.pending.length) {
      const f = this.pending[0];
      if (!gl.getQueryParameter(f.qs[f.qs.length - 1].q, gl.QUERY_RESULT_AVAILABLE)) break; // (queries finish in order)
      this.pending.shift();
      if (!disjoint) sink(f.id, f.qs.map(s => [s.name, gl.getQueryParameter(s.q, gl.QUERY_RESULT) / 1e6]));
      for (const s of f.qs) this.free.push(s.q);
    }
  },
};

function stat(vals) {
  const n = vals.length; if (!n) return null;
  const s = Float64Array.from(vals).sort(); let sum = 0; for (const v of s) sum += v;
  const at = p => s[Math.min(n - 1, Math.floor(p * n))], worst = Math.max(1, Math.ceil(n * .01)); let w = 0; for (let i = n - worst; i < n; i++) w += s[i];
  return { n, avg: sum / n, p50: at(.5), p95: at(.95), p99: at(.99), max: s[n - 1], low1: 1000 / (w / worst) }; // (low1: fps over the slowest 1% of frames)
}
const f1 = (v, w = 5) => v.toFixed(1).padStart(w);
const wrap = (text, w = 46, pad = ' ') => { const out = []; let line = ''; for (const word of text.split(' ')) { if ((line + ' ' + word).length > w && line) { out.push(pad + line); line = word; } else line = line ? line + ' ' + word : word; } out.push(pad + line); return out; };

export class FrameProfiler {
  constructor(renderer) {
    this.timer = gpuTimer.init(renderer);
    this.enabled = false; this.reset();
  }
  reset() {
    this.n = 0; this.slot = 0;
    this.interval = new Float32Array(N); this.logic = new Float32Array(N); this.submit = new Float32Array(N); this.gpu = new Float32Array(N).fill(NaN);
    this.pass = new Map(); // pass name -> Float32Array(N) of GPU ms
    gpuTimer.abort();
  }
  setEnabled(on) { if (on === this.enabled) return; this.enabled = on; if (on) this.reset(); else gpuTimer.abort(); }

  // PerfHud calls these three each frame: at the start (ft = ms since the previous frame started), between logic and render, and after render.
  begin(ft) {
    if (!this.enabled) return;
    const id = this.n++, s = this.slot = id % N;
    this.interval[s] = ft; this.logic[s] = 0; this.submit[s] = 0; this.gpu[s] = NaN; for (const a of this.pass.values()) a[s] = 0;
    this.id = id;
  }
  mid(logicMs) { if (!this.enabled) return; this.logic[this.slot] = logicMs; gpuTimer.begin(this.id); }
  end(submitMs) {
    if (!this.enabled) return;
    this.submit[this.slot] = submitMs; gpuTimer.end();
    if (this.timer) gpuTimer.collect((id, segs) => this.gpuIn(id, segs));
  }
  gpuIn(id, segs) {
    if (id <= this.n - 1 - N) return; // (its slot has been reused)
    const s = id % N; let total = 0;
    for (const [name, ms] of segs) { let a = this.pass.get(name); if (!a) this.pass.set(name, a = new Float32Array(N)); a[s] += ms; total += ms; }
    this.gpu[s] = total;
  }

  // The stats over the kept frames: { count, seconds, frame, cpu, gpu, passes: [[name, avg ms]], hitches, logic, submit, idle }.
  stats() {
    const count = Math.min(this.n, N); if (count < 20) return null;
    const iv = [], cpu = [], gp = [], valid = [];
    for (let i = 0; i < count; i++) {
      iv.push(this.interval[i]); cpu.push(this.logic[i] + this.submit[i]);
      if (!Number.isNaN(this.gpu[i])) { gp.push(this.gpu[i]); valid.push(i); }
    }
    const frame = stat(iv), cp = stat(cpu), gpu = valid.length >= 10 ? stat(gp) : null;
    const mean = a => { let s = 0; for (const v of a) s += v; return s / a.length; };
    const passes = gpu ? [...this.pass].map(([name, a]) => [name, valid.reduce((s, i) => s + a[i], 0) / valid.length]).sort((a, b) => b[1] - a[1]) : [];
    const logic = mean(Array.from(this.logic.subarray(0, count))), submit = mean(Array.from(this.submit.subarray(0, count)));
    const limit = frame.p50 * 1.5 + 2; let hitches = 0; for (const v of iv) if (v > limit) hitches++;
    return { count, seconds: iv.reduce((a, b) => a + b, 0) / 1000, frame, cpu: cp, gpu, passes, hitches, logic, submit, idle: Math.max(0, frame.avg - logic - submit) };
  }

  // The overlay's text lines.
  lines() {
    const st = this.stats(); if (!st) return ['collecting frames ...'];
    const { frame, cpu, gpu } = st, L = [];
    L.push(`RENDER COST ${f1(Math.max(cpu.avg, gpu?.avg ?? 0), 0)} ms per frame (${gpu ? (gpu.avg >= cpu.avg ? 'GPU' : 'CPU') : 'CPU only: no GPU timer'})`, '');
    L.push(`${(1000 / frame.avg).toFixed(0)} FPS  ${f1(frame.avg, 0)} ms/frame   1% low ${frame.low1.toFixed(0)} fps   (last ${st.seconds.toFixed(0)} s)`);
    L.push('ms per frame     avg   p50   p95   p99   max');
    const row = (label, s) => L.push(`${label.padEnd(13)} ${s ? [s.avg, s.p50, s.p95, s.p99, s.max].map(v => f1(v)).join(' ') : '  n/a  (no GPU timer in this browser)'}`);
    row('frame (shown)', frame); row('CPU busy', cpu); row('GPU busy', gpu);
    L.push(`hitches (frame > 1.5x typical): ${st.hitches} of ${st.count}`, '');
    const full = Math.max(frame.avg, 1), bar = v => '█'.repeat(Math.max(v > .05 ? 1 : 0, Math.round(Math.min(1, v / full) * 18)));
    L.push(`WHERE A ${f1(frame.avg, 0)} ms FRAME GOES (average)`);
    L.push(`${'game logic'.padEnd(20)}${f1(st.logic)} ${bar(st.logic)}`, `${'render submit (CPU)'.padEnd(20)}${f1(st.submit)} ${bar(st.submit)}`, `${'idle / vsync / browser'.padEnd(20)}${f1(st.idle)} ${bar(st.idle)}`);
    if (gpu) {
      L.push(`${'GPU busy (overlaps)'.padEnd(20)}${f1(gpu.avg)} ${bar(gpu.avg)}`);
      const shown = st.passes.filter(p => p[1] >= .05).slice(0, 7), rest = st.passes.reduce((s, p) => s + p[1], 0) - shown.reduce((s, p) => s + p[1], 0);
      for (const [name, ms] of shown) L.push(`  ${(SHORT[name] ?? name).slice(0, 18).padEnd(18)}${f1(ms)} ${bar(ms)}`);
      if (rest >= .05) L.push(`  ${'(smaller passes)'.padEnd(18)}${f1(rest)}`);
    }
    L.push('', 'VERDICT');
    const work = Math.max(cpu.avg, gpu?.avg ?? 0), spare = frame.avg - work;
    if (!gpu) L.push(...wrap(`GPU time unknown. CPU is busy ${f1(cpu.avg, 0)} of ${f1(frame.avg, 0)} ms${cpu.avg > frame.avg * .85 ? ': CPU-BOUND' : ': the CPU has room, so the GPU or the display is the limit'}.`));
    else if (work > 14 && work < 24 && frame.avg > 18) L.push(...wrap(`JUST OVER THE 60 FPS BUDGET: the machine needs ${f1(work, 0)} ms (${gpu.avg >= cpu.avg ? 'GPU' : 'CPU'} side) but a 60 fps frame has 16.7. Frames that miss a refresh wait for the next one (33 ms), so the average lands near ${(1000 / frame.avg).toFixed(0)} fps. Cutting ${f1(work - 14, 0)}+ ms would bring it back to a steady 60.`));
    else if (spare > Math.max(1.5, frame.avg * .2)) L.push(...wrap(`DISPLAY-LIMITED: the machine needs ${f1(work, 0)} ms (${gpu.avg >= cpu.avg ? 'GPU' : 'CPU'} side), the frame lasts ${f1(frame.avg, 0)}. ${f1(spare, 0)} ms spare; at best ~${(1000 / work).toFixed(0)} fps uncapped (if CPU and GPU overlap perfectly; integrated graphics won't).`));
    else if (gpu.avg >= cpu.avg * .85 && gpu.avg > frame.avg * .8) L.push(...wrap(`GPU-BOUND: the GPU is busy ${f1(gpu.avg, 0)} of ${f1(frame.avg, 0)} ms (${(gpu.avg / frame.avg * 100).toFixed(0)}%). Cheaper shading / fewer pixels help; fewer draw calls will not.`));
    else L.push(...wrap(`CPU-BOUND: the CPU is busy ${f1(cpu.avg, 0)} of ${f1(frame.avg, 0)} ms, the GPU only ${f1(gpu.avg, 0)}. Fewer draw calls / less logic help. (Submit time includes waits on a GPU that is behind.)`));
    return L;
  }
}
