// The loading bar: real progress through the steps of building a stage. Building is one long run of
// work the page can't draw during, so it's cut into steps (loadStep) with a pause for the browser to
// paint between them. Each step's share of the bar is how long it took last time (kept in
// localStorage; a first visit uses rough guesses), so the bar moves at an even pace on any machine.
// While a step runs, the bar creeps toward that step's end over the time it's expected to take: a
// CSS transform transition, which keeps moving while the page is busy.
// No three.js here: boot.js (the title screen) uses it too.

import { tr } from './lang.js';

const STEPS = [ // [name, label, guessed ms]
  ['code', 'LOADING CODE', 800],
  ['ground', 'PAINTING TERRAIN', 900],
  ['jungle', 'PLANTING SCENERY', 500],
  ['walls', 'POURING CONCRETE', 300],
  ['structures', 'BUILDING WALLS AND BRIDGES', 300],
  ['props', 'PLACING OBJECTS', 1200],
  ['chunks', 'OPTIMISING', 300],
  ['actors', 'PREPARING THE JEEP', 200],
  ['troops', 'DEPLOYING TROOPS', 200],
  ['world2', 'SETTING THE WEATHER', 100],
  ['units', 'PLACING PICKUPS', 50],
  ['subs', 'LAUNCHING SUBMARINES', 150],
  ['defences', 'ARMING DEFENCES', 150],
  ['bosses', 'WAKING THE BOSSES', 100],
  ['compile', 'COMPILING SHADERS', 1500],
  ['compile2', 'COMPILING SHADERS', 400],
  ['draw', 'FIRST FRAMES', 800],
  ['draw2', 'FIRST FRAMES', 400],
  ['draw3', 'FIRST FRAMES', 400],
];
const KEY = 'jackal.loadTimes';

let times = {}, current = null, since = 0;
try { times = JSON.parse(localStorage.getItem(KEY)) || {}; } catch { /* first visit */ }
const weight = ([name, , guess]) => times[name] > 0 ? times[name] : guess;
const total = () => STEPS.reduce((s, st) => s + weight(st), 0);
const at = k => `translateX(${(k - 1) * 100}%)`; // the fill slides in from the left (stripes stay undistorted)
const paint = () => new Promise(r => requestAnimationFrame(() => setTimeout(r, 0)));

// Each step is drawn as a two-part creep (Web Animations: transforms, which keep running while the page is busy). The first part is the step's expected time, to 90% of its share; then the creep carries on four
// times slower to 99%, so a step that runs longer than last time slows down but never stops dead, and the last jump when it ends is a sliver, not a stall at 95% and then a leap.
const FIRST = .9, LAST = .99, STRETCH = 4; // (the second part lasts three more expected-times: the whole animation is STRETCH times the expected time)
function creep(el, from, to1, to2, ms) {
  el._anim?.cancel();
  if (!el.animate) { el.style.transform = at(to1); return; }
  el._anim = el.animate([{ transform: at(from), easing: 'linear' }, { transform: at(to1), offset: 1 / STRETCH, easing: 'linear' }, { transform: at(to2) }], { duration: Math.max(50, ms) * STRETCH, fill: 'forwards' });
}

function show(i) {
  const fill = document.querySelector('#loading .bar .fill'), status = document.querySelector('#loading .status');
  if (!fill) return;
  const all = total(), before = STEPS.slice(0, i).reduce((s, st) => s + weight(st), 0);
  if (i >= STEPS.length) { fill._anim?.cancel(); fill.style.transition = 'transform .25s ease-out'; fill.style.transform = at(1); return; } // done
  const w = weight(STEPS[i]);
  fill.style.transition = 'none'; creep(fill, before / all, (before + w * FIRST) / all, (before + w * LAST) / all, w);
  if (status) status.textContent = tr(STEPS[i][1]); // (the name of the step: the bar says how far along it all is)
}

// Step `name` starts now (the previous one has finished): move the bar on and let the page paint.
export async function loadStep(name) {
  const now = performance.now();
  if (current) { times[current] = Math.round(now - since); if (times[current] > 250) console.log('load step ' + current + ' took ' + times[current] + ' ms'); } // (a step that took long is named in the console)
  current = name; since = now;
  show(STEPS.findIndex(s => s[0] === name));
  await paint();
  since = performance.now(); // (the pause to paint isn't the step's own time)
}

// Let the page paint before a long piece of work (the arguments are kept for the callers: the step's name and its percentage already say what is going on).
export async function loadProgress() {
  await paint();
}

// Everything is built and drawing: fill the bar and remember how long each step took.
export function loadDone() {
  if (current) times[current] = Math.round(performance.now() - since);
  current = null;
  show(STEPS.length);
  try { localStorage.setItem(KEY, JSON.stringify(times)); } catch { /* not kept */ }
  console.log('LOAD TIMES (ms): ' + Object.entries(times).map(([k, v]) => k + ' ' + v).join(', ') + '  | total ' + Object.values(times).reduce((a, b) => a + b, 0)); // (where the wait went: press F12 to read it)
}
