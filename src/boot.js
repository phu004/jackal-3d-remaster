// Entry point: the title screen (plain HTML in index.html) is already showing, with its menu:
// NEW GAME, LOAD GAME (a saved slot, if any), SELECT STAGE, GRAPHICS (pick the level main.js starts at,
// see quality.js), FULL SCREEN and CONTROLS.
// Arrow keys and Enter work as well as the mouse. A link that already names a stage (moving on to the
// next stage, loading a save, debug links) skips the menu. Once a choice is made it shows the loading
// bar and loads the game; main.js moves the bar on as it builds the stage (loading.js) and fades the
// screen out once it's drawing.
import { readSlots, renderSlots, play, CARRY_KEY, readCleared, secretUnlocked } from './game/saves.js';
import { params, go } from './game/nav.js';
import { fullscreenButton } from './game/fullscreen.js';
import { isTouchDevice } from './game/touch.js';
import { BIND, ACTIONS, rebind, resetBinds, canBind, keyName, capture } from './game/keybinds.js';
import { menuKeys } from './game/menu-keys.js';
import { menuSounds, volumeSliders } from './game/sfx.js';
import { applyUiScale } from './game/ui-scale.js';
import { GFX_INFO } from './game/gfx-info.js';
import { tr, stageName, secretName, translate, isZh } from './game/lang.js';
import { loadStep } from './game/loading.js';

const STAGE_COUNT = 6;
const GRAPHICS = ['ULTRA', 'HIGH', 'MEDIUM', 'LOW']; // quality.js's levels, by name (kept here so the title screen loads without three.js)
const QUALITY_KEY = 'jackal.quality';

const $ = s => document.querySelector(s);

function start() {
  for (const p of document.querySelectorAll('#loading .choice, #loading .slots')) p.hidden = true;
  const status = $('#loading .status');
  $('#loading .bar').hidden = false; status.hidden = false; status.textContent = tr('LOADING'); status.classList.remove('still');
  loadStep('code').then(() => import('./main.js')).catch(err => { // (the bar moves on as main.js builds the stage)
    console.error(err);
    status.textContent = tr('FAILED TO LOAD (SEE CONSOLE)');
  });
}

applyUiScale(); // (before anything shows: the loading screen of a stage link / next stage / loaded save was full size until main.js applied it, then shrank mid-load)
const debugLink = ['stage', 'z', 'intro', 'load'].some(k => params.has(k));
if (debugLink) start();
else {
  const status = $('#loading .status'), panels = { main: $('#menu-main'), stages: $('#menu-stages'), settings: $('#menu-settings'), volume: $('#menu-volume'), graphics: $('#menu-graphics'), controls: $('#menu-controls'), slots: $('#loading .slots') };
  let shown = 'main', shownTitle = 'MAIN MENU';
  const show = (name, title) => {
    shown = name; shownTitle = title;
    for (const [k, el] of Object.entries(panels)) el.hidden = k !== name;
    $('#loading .bar').hidden = true; status.hidden = true; status.classList.add('still'); // (no sub-title over the menus: the buttons say what they are)
    panels[name].querySelector('input, button:not([hidden])')?.focus();
  };
  const menu = () => show('main', 'MAIN MENU');

  // LOAD GAME only when there's something to load
  const slots = readSlots();
  $('#load-slots').hidden = !slots.some(Boolean);
  $('#load-slots').onclick = () => { show('slots', 'LOAD GAME'); renderSlots($('#loading .slot-list'), 'load', (i, s) => play(s)); };

  // NEW GAME: pick the stage to start on: stage 1 always, and one further stage for each stage cleared (the others are hidden)
  const list = $('#menu-stages .list');
  const stageButtons = [];
  for (let n = 1; n <= STAGE_COUNT; n++) {
    const b = document.createElement('button'); stageButtons.push(b);
    b.onclick = () => { try { sessionStorage.removeItem(CARRY_KEY); } catch {} if (n === 1) start(); else go(`stage=${n}`); };
    list.appendChild(b);
  }
  const secretBtn = document.createElement('button'); secretBtn.onclick = () => { try { sessionStorage.removeItem(CARRY_KEY); } catch {} go('stage=secret'); }; list.appendChild(secretBtn); // (after the last stage: shown once the secret level has been found)
  const unlockStages = () => { secretBtn.hidden = !secretUnlocked(); secretBtn.textContent = secretName(); const open = readCleared() + 1; stageButtons.forEach((b, i) => { b.hidden = i + 1 > open; b.textContent = stageName(i + 1); }); }; // (a stage not yet reached is not shown at all)
  unlockStages();
  $('#load-new').onclick = () => { unlockStages(); show('stages', 'NEW GAME'); };

  // GRAPHICS: a list of the levels, the one in use lit; picking one saves it (applied when the game
  // loads; the pause menu has the same list)
  const gfx = $('#load-graphics'), gfxList = $('#menu-graphics .list');
  let pending = 0; // the level picked in the list, not yet applied (APPLY keeps it; BACK drops it)
  const info = document.createElement('p'); info.className = 'gfx-desc';
  const apply = document.createElement('button'); apply.textContent = tr('APPLY'); apply.className = 'apply';
  const actions = document.createElement('div'); actions.className = 'gfx-actions'; $('#menu-graphics .back').before(actions); actions.append(apply, $('#menu-graphics .back')); // (APPLY and BACK side by side)
  const readTier = () => { try { const t = JSON.parse(localStorage.getItem(QUALITY_KEY))?.tier; return GRAPHICS[t] ? t : 1; } catch { return 1; } }; // (HIGH, until a level is picked: the same default as quality.js)
  const gfxButtons = GRAPHICS.map((name, i) => {
    const b = document.createElement('button'); b.textContent = tr(name);
    b.onclick = () => { pending = i; label(); };
    gfxList.appendChild(b); return b;
  });
  const label = () => {
    const t = readTier(); gfx.textContent = `${tr('GRAPHICS')}${isZh() ? '：' : ': '}${tr(GRAPHICS[t])}`;
    gfxButtons.forEach((b, i) => { b.classList.toggle('on', i === t); b.classList.toggle('sel', i === pending); });
    gfxButtons[pending].after(info); // (the text sits right under the level it describes)
    info.textContent = tr(GFX_INFO[pending]); apply.textContent = tr('APPLY'); apply.disabled = pending === t;
  };
  apply.onclick = () => { try { localStorage.setItem(QUALITY_KEY, JSON.stringify({ tier: pending })); } catch {} label(); };
  gfx.onclick = () => { pending = readTier(); label(); show('graphics', 'GRAPHICS'); gfxButtons[pending].focus(); };
  label();

  const fullLabel = fullscreenButton($('#load-fullscreen'), tr);

  // The language (English, or Chinese with ?lang=cn; lang.js) for this menu and the score line in play
  const relabel = () => {
    translate($('#loading'));
    unlockStages();
    gfxButtons.forEach((b, i) => { b.textContent = tr(GRAPHICS[i]); });
    label(); fullLabel();
    document.documentElement.lang = isZh() ? 'zh-CN' : 'en';
  };
  relabel();
  // CONTROLS: each action has two keys; click one, then press the new key (Esc cancels, Backspace clears it)
  const ACTION_NAMES = { up: 'MOVE UP', down: 'MOVE DOWN', left: 'MOVE LEFT', right: 'MOVE RIGHT', gun: 'MACHINE GUN', grenade: 'GRENADE / ROCKET', fly: 'FLY CAMERA', perf: 'PERFORMANCE' };
  const keymap = $('#menu-controls .keymap'), keyButtons = [];
  const drawKeys = () => keyButtons.forEach(({ b, action, slot }) => { b.textContent = keyName(BIND[action][slot]); b.classList.remove('waiting'); });
  for (const action of ACTIONS) {
    const dt = document.createElement('dt'); dt.textContent = tr(ACTION_NAMES[action]); dt.dataset.tr = ACTION_NAMES[action]; keymap.append(dt);
    for (const slot of [0, 1]) {
      const b = document.createElement('button'); keyButtons.push({ b, action, slot }); keymap.append(b);
      b.onclick = () => {
        if (b.classList.contains('waiting')) return; // (already listening)
        drawKeys(); b.textContent = '...'; b.classList.add('waiting'); capture.on = true;
        const done = () => { removeEventListener('keydown', onKey, true); b.removeEventListener('blur', cancel); setTimeout(() => { capture.on = false; }, 0); drawKeys(); };
        const cancel = () => done();
        const onKey = e => {
          e.preventDefault(); e.stopImmediatePropagation(); if (e.repeat) return;
          if (e.code === 'Escape') return done();
          if (e.code === 'Backspace' || e.code === 'Delete') rebind(action, slot, null);
          else if (canBind(e.code)) rebind(action, slot, e.code);
          else return;
          done();
        };
        addEventListener('keydown', onKey, true); b.addEventListener('blur', cancel);
      };
    }
  }
  const pauseRow = document.createElement('dt'); pauseRow.textContent = tr('PAUSE, SAVE, LOAD'); pauseRow.dataset.tr = 'PAUSE, SAVE, LOAD';
  const pauseKey = document.createElement('dd'); pauseKey.className = 'fixed'; pauseKey.textContent = 'ESC'; keymap.append(pauseRow, pauseKey);
  $('#keys-reset').onclick = () => { resetBinds(); drawKeys(); };
  drawKeys();

  const settings = () => show('settings', 'SETTINGS');
  $('#load-settings').onclick = settings;
  $('#load-volume').onclick = () => show('volume', 'VOLUME');
  $('#load-controls').onclick = () => show('controls', 'CONTROLS');
  // a touch screen shows its controls on screen, so there's no CONTROLS page for it
  const touchOnly = () => { $('#load-controls').hidden = true; };
  if (isTouchDevice()) touchOnly(); else addEventListener('touchstart', touchOnly, { once: true, passive: true });
  for (const b of document.querySelectorAll('#loading .back')) b.onclick = b.closest('#menu-graphics, #menu-controls, #menu-volume') ? settings : menu; // (graphics / controls go back to SETTINGS)

  // keyboard: up / down between the buttons, Enter presses (see menu-keys.js), Esc goes back
  const openPanel = () => { const bar = $('#loading .bar'); return !bar || !bar.hidden ? null : Object.values(panels).find(p => !p.hidden) ?? null; }; // (none while loading, or once the game is up)
  menuKeys(openPanel); menuSounds(); volumeSliders($('#menu-volume'));
  addEventListener('keydown', e => { const open = openPanel(); if (e.code === 'Escape' && open && open !== panels.main) (open === panels.graphics || open === panels.controls || open === panels.volume ? settings : menu)(); });
  menu();
}
