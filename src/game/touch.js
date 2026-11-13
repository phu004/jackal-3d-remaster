// Touch controls for phones and tablets. They appear at once on a phone or tablet, or the first time
// the screen is touched (so a desktop never shows them): a floating stick on the left half of the screen (put a thumb down
// anywhere there and drag), GUN and GRENADE buttons on the right (hold to keep firing, like the
// keys), and a PAUSE button in the top-right corner (the pause menu has saving, loading, graphics
// and full screen). GUN also does what Enter does (restart after GAME OVER).
// They feed Input (input.js) the same actions the keyboard does.
import { tr } from './lang.js';
const STICK_R = 56;     // px: how far the knob travels
const DEAD = .22;       // stick deflection (0..1) below which the jeep doesn't move
// The NES-style cheats for touch screens, entered with swipes of the stick (up, down, left, right) and taps on the buttons. A swipe counts once it is pushed this far (0..1);
// a step that comes more than CHEAT_GAP seconds after the last one starts the code over.
const CODES = {
  god: ['up', 'down', 'left', 'right', 'grenade', 'grenade', 'gun', 'gun'], // invulnerable on / off
  arms: ['left', 'right', 'up', 'down', 'gun', 'gun', 'grenade', 'grenade'], // the best launcher, and the score back to 0
}, FLICK = .6, CHEAT_GAP = 3, LONGEST = 8;

export const isTouchDevice = () => matchMedia('(pointer: coarse)').matches && navigator.maxTouchPoints > 0;

export function setupTouch(input, onCheat = () => {}) { // onCheat(name): called when a code (a key of CODES) is entered
  let built = false, entered = [], last = 0;
  const step = key => { // one step of a code: the last steps entered are checked against every code
    const now = performance.now(); if (now - last > CHEAT_GAP * 1000) entered = []; last = now;
    entered.push(key); if (entered.length > LONGEST) entered.shift();
    for (const [name, code] of Object.entries(CODES)) {
      if (entered.length >= code.length && code.every((k, i) => k === entered[entered.length - code.length + i])) { entered = []; onCheat(name); return; }
    }
  };
  const build = () => {
    if (built) return; built = true;
    input.touch.active = true;
    document.body.classList.add('touching');
    const layer = document.createElement('div'); layer.id = 'touch';
    layer.innerHTML = `
      <div class="t-stick-zone"></div>
      <div class="t-stick" hidden><div class="t-knob"></div></div>
      <button class="t-btn t-grenade" data-act="grenade">${tr('GRENADE')}</button>
      <button class="t-btn t-gun" data-act="gun">${tr('GUN')}</button>
      <button class="t-pause">II</button>`;
    document.body.appendChild(layer);
    const zone = layer.querySelector('.t-stick-zone'), stick = layer.querySelector('.t-stick'), knob = layer.querySelector('.t-knob');

    // the stick: wherever the thumb lands in the left half; its own pointer only
    let stickId = null, ox = 0, oy = 0, swipe = null;
    const move = e => {
      let dx = e.clientX - ox, dy = e.clientY - oy;
      const d = Math.hypot(dx, dy); if (d > STICK_R) { dx *= STICK_R / d; dy *= STICK_R / d; }
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
      const k = Math.min(1, d / STICK_R);
      if (k < DEAD) { input.touch.x = input.touch.z = 0; swipe = null; return; }
      if (k >= FLICK) { const dir = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : (dy < 0 ? 'up' : 'down'); if (dir !== swipe) { swipe = dir; step(dir); } } // (once per swipe)
      input.touch.x = dx / (Math.hypot(dx, dy) || 1); input.touch.z = dy / (Math.hypot(dx, dy) || 1); // full speed, any direction
    };
    zone.addEventListener('pointerdown', e => {
      if (stickId !== null) return;
      stickId = e.pointerId; zone.setPointerCapture(e.pointerId);
      ox = e.clientX; oy = e.clientY;
      Object.assign(stick.style, { left: `${ox}px`, top: `${oy}px` }); stick.hidden = false; knob.style.transform = '';
      e.preventDefault();
    });
    zone.addEventListener('pointermove', e => { if (e.pointerId === stickId) move(e); });
    const release = e => { if (e.pointerId !== stickId) return; stickId = null; swipe = null; stick.hidden = true; input.touch.x = input.touch.z = 0; };
    zone.addEventListener('pointerup', release); zone.addEventListener('pointercancel', release);

    // the buttons: held while a finger is on them
    for (const b of layer.querySelectorAll('.t-btn')) {
      const act = b.dataset.act;
      b.addEventListener('pointerdown', e => {
        e.preventDefault(); b.setPointerCapture(e.pointerId); b.classList.add('down');
        input.touch.held.add(act); input.touch.hit.add(act);
        if (act === 'gun') input.touch.hit.add('start');
        step(act);
      });
      const up = () => { b.classList.remove('down'); input.touch.held.delete(act); };
      b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up);
    }
    layer.querySelector('.t-pause').addEventListener('click', () => dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', key: 'Escape' })));
  };
  if (isTouchDevice()) build(); // a phone or tablet: straight away
  else addEventListener('touchstart', build, { once: true, passive: true });          // (a touch-screen laptop: on first touch)
}
