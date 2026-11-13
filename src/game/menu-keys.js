// Keyboard for the HTML menus (title and pause): up / down (or W / S) move between the open panel's
// buttons, Enter presses the one picked (the first, if none is), wrapping round at the ends.
// openPanel(): the panel showing now, or null when no menu is up (the keys are left alone then).
import { capture } from './keybinds.js';

export function menuKeys(openPanel) {
  addEventListener('keydown', e => {
    if (e.target instanceof HTMLInputElement || capture.on) return; // typing a save name / picking a key on the CONTROLS page
    const open = openPanel(); if (!open) return;
    const buttons = [...open.querySelectorAll('button')].filter(usable);
    if (!buttons.length) return;
    const i = buttons.indexOf(document.activeElement);
    const move = d => { // the button in the next row up / down, the one nearest across (so a grid keeps its column)
      e.preventDefault(); e.stopImmediatePropagation();
      if (i < 0) return buttons[d > 0 ? 0 : buttons.length - 1].focus();
      const tops = [...new Set(buttons.map(b => b.offsetTop))].sort((a, b) => a - b);
      const row = buttons.filter(b => b.offsetTop === tops[(tops.indexOf(buttons[i].offsetTop) + d + tops.length) % tops.length]);
      const mid = b => b.offsetLeft + b.offsetWidth / 2;
      row.reduce((best, b) => Math.abs(mid(b) - mid(buttons[i])) < Math.abs(mid(best) - mid(buttons[i])) ? b : best).focus();
    };
    if (e.code === 'ArrowDown' || e.code === 'KeyS') move(1);
    else if (e.code === 'ArrowUp' || e.code === 'KeyW') move(-1);
    else if ((e.code === 'ArrowLeft' || e.code === 'ArrowRight' || e.code === 'KeyA' || e.code === 'KeyD') && i >= 0) {
      const row = buttons.filter(b => Math.abs(b.offsetTop - buttons[i].offsetTop) < 4 && b.offsetParent === buttons[i].offsetParent); // buttons side by side (APPLY / BACK, the key slots)
      if (row.length < 2) return;
      e.preventDefault(); e.stopImmediatePropagation();
      row[(row.indexOf(buttons[i]) + (e.code === 'ArrowLeft' || e.code === 'KeyA' ? -1 : 1) + row.length) % row.length].focus();
    }
    else if ((e.code === 'Enter' || e.code === 'NumpadEnter') && !e.repeat) {
      e.preventDefault(); e.stopImmediatePropagation(); // (not also a game key press)
      (i < 0 ? buttons[0] : buttons[i]).click();
    }
  }, true); // (capture: before the game's own key handling)
}

const usable = b => !b.hidden && !b.disabled && b.offsetParent !== null; // (shown, and can be pressed)

// Put the keyboard on a panel's first button (or `which`, if given).
export function focusFirst(panel, which) {
  (which ?? [...panel.querySelectorAll('button')].find(usable))?.focus();
}
