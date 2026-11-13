// Saved games, kept in the browser's local storage (they survive restarts until site data is cleared).
//  - the checkpoint: written automatically when a stage is cleared (the start of the next stage)
//  - six slots the player saves to from the pause menu (Esc), at any moment
// A checkpoint holds the stage and the jeep (lives, launcher level, score) and starts that stage from
// its beginning; a slot also holds a snapshot of the whole stage (see takeSnapshot in main.js), so
// loading it carries on from exactly where it was saved. Plain DOM, no three.js, so the title screen (boot.js) can use it.
import { go } from './nav.js';
import { tr, stageName } from './lang.js';

// The furthest stage cleared so far (kept for good, whatever is loaded or saved): the title menu's NEW GAME opens the stages up to the one after it.
const CLEARED_KEY = 'jackal.cleared';
export const readCleared = () => { try { return Math.max(0, parseInt(localStorage.getItem(CLEARED_KEY), 10) || 0); } catch { return 0; } };
export const markCleared = n => { try { if (n > readCleared()) localStorage.setItem(CLEARED_KEY, String(n)); } catch { /* not kept */ } };
// The secret level (off stage 5's helicopter exit): once the jeep has flown out that way it can be picked from NEW GAME.
const SECRET_KEY = 'jackal.secretUnlocked';
export const secretUnlocked = () => { try { return localStorage.getItem(SECRET_KEY) === '1'; } catch { return false; } };
export const unlockSecret = () => { try { localStorage.setItem(SECRET_KEY, '1'); } catch { /* not kept */ } };
// What each stage of the current run scored (kill rate, POWs, time, secrets, score): kept as the stages are cleared, shown as a table on the last stage's results.
const RUN_KEY = 'jackal.run';
export const readRun = () => { try { return JSON.parse(localStorage.getItem(RUN_KEY)) || {}; } catch { return {}; } };
export const writeRun = (n, rec) => { try { const r = readRun(); if (n === null) localStorage.removeItem(RUN_KEY); else if (rec) { r[n] = rec; localStorage.setItem(RUN_KEY, JSON.stringify(r)); } else { delete r[n]; localStorage.setItem(RUN_KEY, JSON.stringify(r)); } } catch { /* not kept */ } };
export const SAVE_KEY = 'jackal.save', SLOTS_KEY = 'jackal.slots', CARRY_KEY = 'jackal.carry', SLOT_COUNT = 6;
const WEAPONS = ['GRENADE', 'ROCKET', 'ROCKET II', 'ROCKET III'];

const read = (store, key) => { try { return JSON.parse(store.getItem(key)); } catch { return null; } };
export const readCheckpoint = () => read(localStorage, SAVE_KEY);
export function readSlots() {
  const s = read(localStorage, SLOTS_KEY);
  return Array.from({ length: SLOT_COUNT }, (_, i) => (Array.isArray(s) && s[i]) || null);
}
export function writeSlot(i, data) {
  const s = readSlots(); s[i] = { ...data, savedAt: Date.now() };
  try { localStorage.setItem(SLOTS_KEY, JSON.stringify(s)); return true; } catch { return false; }
}

// Start a saved game: hand the jeep over to the stage (main.js picks it up) and load that stage.
export function play(save) {
  try { sessionStorage.setItem(CARRY_KEY, JSON.stringify({ stage: save.stage, lives: save.lives, level: save.level, score: save.score, snap: save.snap, start: save.start, totalTime: save.totalTime })); } catch {} // (start: the jeep as the stage began, for RETRY)
  go(`stage=${save.stage}&load=1`); // load=1: use the carried jeep even on stage 1
}

const pad = n => String(n).padStart(2, '0');
function when(t) {
  const d = new Date(t);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// Fill `list` with the six slot buttons. mode 'save': any slot, then a box to name the save
// (Enter / SAVE confirms, Esc / CANCEL backs out); mode 'load': only used slots.
// onPick(i, slot, name) is called with the choice (name: only when saving).
// defaultName: suggested name for a new save.
export function renderSlots(list, mode, onPick, defaultName = '') {
  list.replaceChildren();
  readSlots().forEach((s, i) => {
    const b = document.createElement('button');
    b.className = 'slot' + (s ? '' : ' empty');
    b.innerHTML = s
      ? `<b>${tr('SLOT')} ${i + 1}</b><span>${esc(s.name || stageName(s.stage))}</span>`
        + `<small>${stageName(s.stage)} &middot; ${tr(WEAPONS[s.level] ?? '')} &middot; ${tr('JEEP')} x${s.lives} &middot; ${s.score} &middot; ${when(s.savedAt)}</small>`
      : `<b>${tr('SLOT')} ${i + 1}</b><span>&mdash; ${tr('EMPTY')} &mdash;</span><small></small>`;
    if (mode === 'load' && !s) b.disabled = true;
    b.onclick = () => mode === 'save' ? nameEntry(list, i, s, defaultName, name => onPick(i, s, name), () => renderSlots(list, mode, onPick, defaultName))
      : onPick(i, s);
    list.appendChild(b);
  });
}

// The naming step: replaces the list with a text box for slot i (pre-filled with its current name,
// or the suggestion), plus SAVE and CANCEL.
function nameEntry(list, i, s, suggestion, done, cancel) {
  list.replaceChildren();
  const box = document.createElement('div'); box.className = 'name-entry';
  box.innerHTML = `<label>${tr('NAME FOR SLOT')} ${i + 1}${s ? ` <small>(${tr('REPLACES THE SAVE THERE')})</small>` : ''}</label>
    <input type="text" maxlength="24" spellcheck="false" autocomplete="off">
    <div><button class="ok">${tr('SAVE')}</button><button class="cancel">${tr('CANCEL')}</button></div>`;
  list.appendChild(box);
  const input = box.querySelector('input');
  input.value = (s && s.name) || suggestion;
  const ok = () => done(input.value.trim() || suggestion);
  box.querySelector('.ok').onclick = ok;
  box.querySelector('.cancel').onclick = cancel;
  input.addEventListener('keydown', e => {
    e.stopPropagation(); // typing doesn't drive the jeep or toggle the pause menu
    if (e.key === 'Enter') ok();
    else if (e.key === 'Escape') cancel();
  });
  input.focus(); input.select();
}
