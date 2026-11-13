// Full screen on and off, for the FULL SCREEN buttons (title menu and pause menu). The browser only
// allows it from a click or key press, and some (phones, some embedded views) not at all: there the
// buttons are hidden. Esc normally leaves full screen too (the browser's own rule); where the browser
// allows it (Chrome / Edge: the Keyboard Lock API) the game takes Esc for itself while in full screen,
// so a tap opens the pause menu and only holding Esc leaves full screen. Elsewhere main.js opens the
// pause menu when full screen is left, so Esc still brings the menu up.
//
// The game normally runs in a frame inside the page (see shell.js), so that reloading it (another
// stage, a save, back to the title) doesn't leave full screen: it's the outer page that goes full
// screen. Run on its own (no shell, or the shell out of reach), the game's own page does.
const host = (() => {
  if (window.name !== 'jackal-game' || window.parent === window) return document;
  try { return window.parent.document.documentElement ? window.parent.document : document; } catch { return document; } // (another origin: out of reach)
})();
const shelled = host !== document;

// Listen on the host page; a listener from this frame is taken off again when the frame reloads.
const listen = (types, f) => {
  for (const t of types) host.addEventListener(t, f);
  if (shelled) addEventListener('pagehide', () => { for (const t of types) host.removeEventListener(t, f); });
};
const CHANGE = ['fullscreenchange', 'webkitfullscreenchange'];

export const canFullscreen = () => !!(host.fullscreenEnabled || host.webkitFullscreenEnabled);
const isFull = () => !!(host.fullscreenElement || host.webkitFullscreenElement);

const lockEsc = () => {
  const kb = host.defaultView?.navigator.keyboard; if (!kb?.lock) return;
  if (isFull()) kb.lock(['Escape']).catch(() => {}); else kb.unlock();
};
listen(CHANGE, lockEsc);

// Without the shell, going to another stage or back to the title reloads the page, which always
// leaves full screen, and a page may only ask for it back from a key press or click. So go() (nav.js)
// notes that it was on, and after the reload the first key press (not Esc) or click turns it on again.
const WAS_FULL_KEY = 'jackal.fullscreen';
export function rememberFullscreen() { try { sessionStorage.setItem(WAS_FULL_KEY, !shelled && isFull() ? '1' : ''); } catch {} }
try {
  if (sessionStorage.getItem(WAS_FULL_KEY) && canFullscreen()) {
    sessionStorage.removeItem(WAS_FULL_KEY);
    const back = e => {
      if (e.type === 'keydown' && e.code === 'Escape') return; // (Esc doesn't count as a go-ahead)
      for (const t of ['keydown', 'pointerdown']) removeEventListener(t, back, true);
      if (!isFull() && !e.target?.closest?.('#load-fullscreen, [data-act="fullscreen"]')) toggleFullscreen(); // (a FULL SCREEN button does it itself)
    };
    for (const t of ['keydown', 'pointerdown']) addEventListener(t, back, true);
  }
} catch { /* storage blocked */ }

// Call f(isFull) whenever full screen is entered or left.
export function onFullscreenChange(f) { listen(CHANGE, () => f(isFull())); }

export function toggleFullscreen() {
  const el = host.documentElement, full = isFull();
  const req = full ? (host.exitFullscreen || host.webkitExitFullscreen) : (el.requestFullscreen || el.webkitRequestFullscreen);
  try { const p = req?.call(full ? host : el); p?.catch?.(() => {}); } catch { /* refused */ }
}

// Keep a button's label in step ("FULL SCREEN" / "EXIT FULL SCREEN"), and hide it where it can't work.
// text: translates the label (the title menu's language, see lang.js). Returns a function that relabels it.
export function fullscreenButton(btn, text = s => s) {
  if (!btn) return () => {};
  if (!canFullscreen()) { btn.hidden = true; return () => {}; }
  const label = () => { btn.textContent = text(isFull() ? 'EXIT FULL SCREEN' : 'FULL SCREEN'); };
  btn.addEventListener('click', toggleFullscreen);
  listen(CHANGE, label);
  label();
  return label;
}
