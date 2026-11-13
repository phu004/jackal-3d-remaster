// Stage 4's land mines (NES): the orange dots on the map. The NES blinked them in and out of sight; here each sits plainly on the ground, coloured like the meadow, in a bare spot in a
// field of flowers (see grass-detail.js). The jeep driving onto one sets it off: it blows up under the jeep, which is destroyed. Gameplay stays 2D: what counts is where the mine is
// on the ground. Where they are comes from the stage data (world.mines).
import * as THREE from 'three';
import { buildLandmine } from '../assets/landmine.js';
import { buildMineSign } from '../assets/minesign.js';

const TRIGGER_PAD = -.1; // m: the jeep's outline has to reach this far over the mine's centre (negative: a little in from the mine's edge) to set it off
const R = .5;            // m: the mine's radius

export class Landmines {
  // enemyFire: for its jeep hit test.
  constructor(scene, fx, enemyFire) { this.scene = scene; this.fx = fx; this.enemyFire = enemyFire; this.list = []; }

  setup(world) {
    for (const [i, p] of (world.mines ?? []).entries()) {
      const mesh = buildLandmine(i + 1, world.mineBeacon ? 'orange' : 'olive'); mesh.position.set(p.x, world.heightAt(p.x, p.z), p.z); if (p.small) mesh.scale.setScalar(.8); this.scene.add(mesh); // (the permanent field's mines are drawn a fifth smaller; the trigger is as it was)
      this.list.push({ x: p.x, z: p.z, mesh, live: true, keep: !!p.keep, cool: 0 });
    }
    for (const q of world.mineSigns ?? []) { const sg = buildMineSign(); sg.position.set(q.x, world.heightAt(q.x, q.z), q.z); sg.scale.setScalar(.8); this.scene.add(sg); } // (warning signs round a minefield)
  }

  update(dt, player, onHit) {
    if (!this.list.length || !player.enabled || player.dead) return;
    for (const m of this.list) {
      if (m.cool > 0) { m.cool -= dt; continue; }
      if (!m.live || !this.enemyFire.hitsJeep(m, player, R * .6 + TRIGGER_PAD)) continue;
      this.detonate(m); if (!player.invulnerable) onHit();
    }
  }

  detonate(m) {
    if (m.keep) m.cool = 2; else { m.live = false; this.scene.remove(m.mesh); } // (a permanent mine goes off but stays: it cannot be cleared)
    const at = m.mesh.position.clone();
    this.fx.explosion(at.clone().setY(at.y + .4), 1.3); this.fx.scorch(at, 1.8);
    for (let i = 0; i < 6; i++) this.fx.puff(at.clone().setY(at.y + .2), { color: 0x4a3a24, size: .25 + Math.random() * .2, grow: 2.2, life: .9, opacity: .6, vel: new THREE.Vector3((Math.random() - .5) * 5, 2 + Math.random() * 4, (Math.random() - .5) * 5), gravity: 9 }); // (a spray of earth)
  }

  // Saved games: which have gone off.
  snapshot() { return this.list.map(m => m.live); }
  restore(list) { this.list.forEach((m, i) => { if (list?.[i] === false && m.live) { m.live = false; this.scene.remove(m.mesh); } }); }
}
