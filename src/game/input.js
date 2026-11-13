import { BIND } from './keybinds.js'; // (the player's own keys, see the CONTROLS page)

export class Input {
  constructor() {
    this.down = new Set(); this.hit = new Set();
    this.touch = { active: false, x: 0, z: 0, held: new Set(), hit: new Set() }; // fed by the touch controls (touch.js)
    addEventListener('keydown', e => {
      if (e.target instanceof HTMLInputElement) return; // typing a save name
      if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
      if (!this.down.has(e.code)) this.hit.add(e.code);
      this.down.add(e.code);
    });
    addEventListener('keyup', e => this.down.delete(e.code));
    addEventListener('blur', () => this.down.clear());
  }
  held(action) { return BIND[action].some(c => this.down.has(c)) || this.touch.held.has(action); }
  pressed(action) { return BIND[action].some(c => this.hit.has(c)) || this.touch.hit.has(action); }
  axis() {
    if (this.touch.x || this.touch.z) return { x: this.touch.x, z: this.touch.z }; // the touch stick
    return { x: this.held('right') - this.held('left'), z: this.held('down') - this.held('up') };
  }
  endFrame() { this.hit.clear(); this.touch.hit.clear(); }
}
