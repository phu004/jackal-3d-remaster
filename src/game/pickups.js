// Hidden star items (NES): invisible until the player's fire hits their spot (a bullet or rocket
// passing over it, or a blast within reach). Then the star pops up out of the ground with a flash
// and floats there, spinning, until the jeep drives over it to collect it: it upgrades the
// launcher straight to ROCKET III, or gives an extra life if it's already there. Stars are the
// stage's secrets (counted on the results screen).
import { sfx } from './sfx.js';
import * as THREE from 'three';
import { HALF_LEN } from './player.js';

const REVEAL_R = 1.4;  // fire passing this close to its spot reveals it
const COLLECT_R = HALF_LEN + .6;

export class Pickups {
  constructor(scene, fx) { this.scene = scene; this.fx = fx; this.list = []; this.fxList = []; }

  setup(world) {
    for (const obj of world.pickups) {
      obj.visible = false;
      this.list.push({ obj, star: obj.getObjectByName('star'), state: 'hidden', t: 0, base: obj.position.y }); // base: the ground under it (raised on stage 2's terraces)
    }
  }

  // The player's fire is at p (a blast reaches r metres): reveal any hidden star there. Returns
  // whether one was revealed (a bullet or rocket that finds one stops there, as if it hit the tile).
  poke(p, r = 0) {
    let found = false;
    for (const k of this.list) {
      if (k.state !== 'hidden' || Math.hypot(p.x - k.obj.position.x, p.z - k.obj.position.z) > REVEAL_R + r) continue;
      k.state = 'pop'; k.t = 0; k.obj.visible = true; found = true;
      const at = k.obj.position.clone().setY(k.base + 1);
      this.fx.flash(at, .6);
      for (let i = 0; i < 14; i++) { // sparkles bursting out
        const a = Math.random() * Math.PI * 2, v = 2 + Math.random() * 3;
        this.fx.puff(at, { color: 0xfff6c0, size: .08, grow: 0, life: .6, opacity: 1, additive: true, gravity: 6,
          vel: new THREE.Vector3(Math.cos(a) * v, 2 + Math.random() * 3, Math.sin(a) * v) });
      }
      this.fx.puff(at, { color: 0xfff0a0, size: .5, grow: 3, life: .35, opacity: .8, additive: true });
    }
    return found;
  }

  // Saved games: each star hidden, out (revealed) or taken.
  snapshot() { return this.list.map(k => k.state === 'hidden' ? 'hidden' : k.state === 'taken' || k.state === 'collect' ? 'taken' : 'shown'); }
  restore(data) {
    (data ?? []).forEach((st, i) => {
      const k = this.list[i];
      if (!k || st === 'hidden') return;
      if (st === 'taken') { k.state = 'taken'; this.scene.remove(k.obj); return; }
      k.state = 'shown'; k.obj.visible = true; k.star.scale.setScalar(1);
    });
  }

  // onCollect(): gives the reward and returns its name, shown rising over the jeep.
  update(dt, player, onCollect) {
    for (const k of this.list) {
      if (k.state === 'hidden' || k.state === 'taken') continue;
      k.t += dt;
      if (k.state === 'collect') { this.zip(k, dt, player); continue; }
      if (k.state === 'pop') { // springs up from the ground, overshoots a little and settles
        const e = Math.min(1, k.t / .5);
        k.star.scale.setScalar(e < 1 ? e * (1.3 - .3 * e) : 1);
        if (e >= 1) k.state = 'shown';
      }
      k.obj.position.y = k.base + Math.sin(k.t * 3) * .12; // bobbing
      if (k.state === 'shown' && player.enabled && !player.dead
        && Math.hypot(player.position.x - k.obj.position.x, player.position.z - k.obj.position.z) < COLLECT_R) {
        k.state = 'collect'; k.t = 0; k.from = k.obj.position.clone(); sfx.star();
        this.celebrate(player, onCollect());
      }
    }
    for (let i = this.fxList.length - 1; i >= 0; i--) if (!this.fxList[i](dt)) this.fxList.splice(i, 1);
  }

  // The star spins up fast, hops and zips into the jeep, shrinking as it goes.
  zip(k, dt, player) {
    const e = Math.min(1, k.t / .4), to = player.position.clone().setY(1.2);
    k.obj.position.lerpVectors(k.from, to, e * e).setY(k.from.y + Math.sin(e * Math.PI) * 1.4 + e * 1.2);
    k.star.rotation.y += dt * (12 + e * 30);
    k.star.scale.setScalar(1 - e * .85);
    if (e >= 1) { k.state = 'taken'; this.scene.remove(k.obj); }
  }

  // Something good happened: a golden ring pulses out round the jeep, gold sparkles drift up out of
  // it, a warm glow, and the reward's name floats up and fades.
  celebrate(player, label) {
    const at = player.position.clone();
    const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xffd860, transparent: true, opacity: .9, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2; ring.position.copy(at).setY(at.y + .15); this.scene.add(ring);
    const ring2 = ring.clone(); ring2.material = ring.material.clone(); this.scene.add(ring2);
    let t = 0;
    this.fxList.push(dt => { // two rings, one just behind the other, swelling and fading
      t += dt;
      [[ring, t], [ring2, t - .18]].forEach(([m, tt]) => {
        const k = Math.min(1, Math.max(0, tt / .7));
        m.scale.setScalar(.6 + k * 4.5); m.material.opacity = tt < 0 ? 0 : .9 * (1 - k) * (1 - k);
        m.position.copy(player.position).setY(player.position.y + .15);
      });
      if (t > .9) { this.scene.remove(ring, ring2); ring.material.dispose(); ring2.material.dispose(); return false; }
      return true;
    });
    for (let i = 0; i < 26; i++) { // sparkles rising round the jeep
      const a = Math.random() * Math.PI * 2, r = .5 + Math.random() * 1.6;
      this.fx.puff(at.clone().add(new THREE.Vector3(Math.cos(a) * r, .3 + Math.random() * .8, Math.sin(a) * r)), {
        color: i % 3 ? 0xffe27a : 0xffffff, size: .07 + Math.random() * .06, grow: 0, life: .8 + Math.random() * .7, opacity: 1, additive: true,
        gravity: -1.5, vel: new THREE.Vector3(Math.cos(a) * .4, 1.2 + Math.random() * 1.8, Math.sin(a) * .4) });
    }
    this.fx.puff(at.clone().setY(at.y + 1), { color: 0xffe9a0, size: 1.2, grow: 1.5, life: .5, opacity: .35, additive: true }); // soft warm glow
    if (!label) return;
    const sp = new THREE.Sprite(labelMaterial(label)); sp.scale.set(label.length * .55 + 1, 1.2, 1); sp.renderOrder = 999; // (drawn last: it ignores depth, so a transparent bridge deck drawn after it painted over half of it)
    this.scene.add(sp);
    let lt = 0;
    this.fxList.push(dt => { // the reward's name pops up over the jeep, rises and fades
      lt += dt;
      const pop = Math.min(1, lt / .15);
      sp.position.copy(player.position).setY(player.position.y + 3 + lt * 1.1);
      sp.material.opacity = Math.min(1, 1.6 - lt) * pop;
      sp.scale.set((label.length * .55 + 1) * (.6 + .4 * pop), 1.2 * (.6 + .4 * pop), 1);
      if (lt > 1.6) { this.scene.remove(sp); sp.material.map.dispose(); sp.material.dispose(); return false; }
      return true;
    });
  }

  get found() { return this.list.filter(k => k.state === 'taken' || k.state === 'collect').length; }
}

const ringGeo = new THREE.RingGeometry(.82, 1, 48);

// Chunky gold lettering with a dark outline, like the HUD.
function labelMaterial(text) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 112; const x = c.getContext('2d');
  x.font = '900 72px Impact, "Arial Black", sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.lineJoin = 'round'; x.lineWidth = 12; x.strokeStyle = '#3a2208'; x.strokeText(text, 256, 58);
  const g = x.createLinearGradient(0, 20, 0, 96); g.addColorStop(0, '#fff6c0'); g.addColorStop(1, '#ffc23a');
  x.fillStyle = g; x.fillText(text, 256, 58);
  const t = new THREE.CanvasTexture(c);
  return new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false, depthTest: false });
}
