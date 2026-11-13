// Keyboard bindings: each action has two keys (key codes, as KeyboardEvent.code), kept in localStorage
// so they survive a reload. input.js reads BIND; the CONTROLS page (boot.js) edits it with rebind().
// Kept free of three.js so the title screen can load it.
const KEY = 'jackal.keys';

export const DEFAULTS = {
  up: ['KeyW', 'ArrowUp'], down: ['KeyS', 'ArrowDown'], left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'],
  gun: ['KeyJ', 'KeyZ'], grenade: ['KeyK', 'KeyX'], start: ['Enter', 'Space'],
  fly: ['KeyF', null], fast: ['ShiftLeft', 'ShiftRight'], perf: ['KeyP', null],
};
export const ACTIONS = ['up', 'down', 'left', 'right', 'gun', 'grenade', 'fly', 'perf']; // the ones the CONTROLS page lets you change
const RESERVED = new Set(['Escape', 'Enter', 'NumpadEnter', 'KeyG', 'KeyC']); // pause / menus / debug toggles

const copy = b => Object.fromEntries(Object.entries(b).map(([k, v]) => [k, [...v]]));
export const BIND = copy(DEFAULTS);
try {
  const saved = JSON.parse(localStorage.getItem(KEY));
  if (saved) for (const a of ACTIONS) if (Array.isArray(saved[a])) BIND[a] = [saved[a][0] ?? null, saved[a][1] ?? null];
} catch { /* none saved, or storage blocked */ }
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(Object.fromEntries(ACTIONS.map(a => [a, BIND[a]])))); } catch {} };

// Set while the CONTROLS page waits for a key, so the menu keys leave that key alone.
export const capture = { on: false };

export const canBind = code => !RESERVED.has(code);

// Put `code` on slot (0 or 1) of an action; the key comes off whatever else had it. code null clears the slot.
export function rebind(action, slot, code) {
  if (code) for (const a of ACTIONS) BIND[a] = BIND[a].map(c => c === code ? null : c);
  BIND[action][slot] = code; save();
}
export function resetBinds() { for (const a of ACTIONS) BIND[a] = [...DEFAULTS[a]]; save(); }

export function keyName(code) {
  if (!code) return '-';
  return code.replace(/^Key/, '').replace(/^Digit/, '').replace(/^Arrow/, '').replace(/^Numpad/, 'NUM ')
    .replace(/(Left|Right)$/, ' $1').replace(/^(Shift|Control|Alt) /, '$1 ').toUpperCase();
}
