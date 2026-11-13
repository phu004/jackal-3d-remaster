// Page-level navigation: which stage to load, and going to another one.
//
// Normally this is the URL's query string (?stage=2&load=1). Some hosts (e.g. a Claude artifact,
// which runs the page in a sandboxed frame) drop the query string, so go() also leaves the query
// in sessionStorage and reloads; the next page load picks it up from there (once).
import { rememberFullscreen } from './fullscreen.js';

const KEY = 'jackal.nav';

let query = location.search.replace(/^\?/, '');
try {
  const stored = sessionStorage.getItem(KEY);
  if (stored !== null) { query = stored; sessionStorage.removeItem(KEY); }
} catch { /* storage blocked: the URL is all there is */ }

// The current page's parameters (read once per page load).
export const params = new URLSearchParams(query);

// Load the game again with these parameters ('' = plain start), e.g. go('stage=2').
export function go(q) {
  for (const key of ['canopy', 'lang', 'wallseed', 'trackseed', 'shadowtop', 'dbg', 'flatmirror', 'nobake', 'nomirror']) { const v = params.get(key); if (v && !new RegExp(`(^|&)${key}=`).test(q)) q += (q ? '&' : '') + `${key}=${v}`; } // (a trial setting, the language and the airbase wall's seed survive the reload)
  rememberFullscreen(); // (without the shell, see shell.js, the reload leaves full screen: the next key press or click puts it back)
  try { sessionStorage.setItem(KEY, q); } catch { /* fall back to the URL alone */ }
  try { history.replaceState(null, '', location.pathname + (q ? '?' + q : '') + location.hash); } catch { /* sandboxed: the stored copy carries it */ }
  location.reload();
}
