// Page entry. Going to another stage, loading a save or quitting to the title reloads the game (see
// nav.js), and a reload always leaves full screen. So the page itself stays put as a shell holding
// full screen, and runs the game in a frame filling it: a copy of this very page (srcdoc, the same
// origin and base URL), which is what reloads. The frame is told apart by its name; fullscreen.js
// then puts the shell's page in and out of full screen. Where there's no full screen to keep, the
// game just runs in the page as it is.
const GAME_FRAME = 'jackal-game', NAV_KEY = 'jackal.nav'; // (nav.js's key)

function shell() {
  if (window.name === GAME_FRAME) return false; // (this is the game's frame)
  if (!document.fullscreenEnabled && !document.webkitFullscreenEnabled) return false;
  const html = '<!DOCTYPE html>' + document.documentElement.outerHTML; // (before anything changes it)
  // the frame has no query string of its own: hand it ours (?stage=2 etc.) the way nav.js carries one over a reload
  try { if (sessionStorage.getItem(NAV_KEY) === null) sessionStorage.setItem(NAV_KEY, location.search.replace(/^\?/, '')); } catch { /* storage blocked: a plain start */ }
  const frame = document.createElement('iframe');
  frame.name = GAME_FRAME; frame.allow = 'fullscreen; autoplay; gamepad'; frame.srcdoc = html;
  frame.style.cssText = 'position: fixed; inset: 0; width: 100%; height: 100%; border: 0; display: block; background: #090b06;';
  const focusGame = () => { try { frame.contentWindow?.focus(); } catch {} };
  frame.addEventListener('load', focusGame); // (each reload: the keyboard goes to the game)
  addEventListener('focus', focusGame); addEventListener('pointerdown', focusGame);
  document.body.replaceChildren(frame);
  return true;
}

if (!shell()) import('./boot.js');
