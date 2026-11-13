// The secret level's power station as a fight (the model, its target and its ruin are built in world.js; assets/powerstation.js). It has 28 hit points: a grenade or a rocket's own blast takes 4, so seven direct hits bring it down (bullets and
// the rocket's split shots do nothing to it). The first blow sets it off: from then on it launches combat drones from hatches on its roof at the player's jeep, one every 2.5 s, never more than four flying at once. As it is hurt it burns:
// smoke, then fires, spreading across the roofs and the tank farm. When the last point goes it blows up in a chain of explosions, the model is swapped for its ruin (a caved-in hall, a snapped chimney, burnt tanks) and the wreck burns on.
// While the player's jeep is within 20 m of the building a health bar hangs over it; drive away (past 26 m) and it is withdrawn.
import * as THREE from 'three';
import { tr, isZh } from './lang.js';
import { shardGeometry } from './debris.js';

const APPROACH = 55, MAX_DRONES = 4, COOLDOWN = 2.5, SHOW = 20, HIDE = 26, STEP = 4; // STEP: hit points a direct hit takes
const HATCHES = [-10, -4, 4, 10]; // the boiler houses' roofs (local x): each has a launch bay, a little to one side of its middle, at local z -5.65
const rubble = new THREE.MeshStandardMaterial({ color: 0x3a3a34, roughness: .95, flatShading: true });
const rnd = (a, b) => a + Math.random() * (b - a);

export class PowerPlantFight {
  constructor(scene, fx, debris, dronePads, world) {
    this.scene = scene; this.fx = fx; this.debris = debris; this.dronePads = dronePads; this.world = world; this.info = world.powerPlantInfo?.() ?? null;
    this.off = !this.info || !this.info.target; if (this.off) return;
    Object.assign(this, { started: false, cool: .6, drones: [], hatchNo: 0, fires: [], stage: 0, hurt: 0, ending: null, barOn: false, time: 0 });
    this.info.onHurt = () => { this.hurt++; };
    this.info.onWreck = (debris, fx, at) => this.begin(at);
    this.makeHud();
    this.bays = HATCHES.map((lx, i) => ({ lx, L: this.info.model.getObjectByName('droneBayL' + i), R: this.info.model.getObjectByName('droneBayR' + i), t: 99, pending: false })); // (the launch bays' sliding doors, on the model)
  }

  // Saved games: whether the plant is down, and how much it has taken. A downed plant comes back down (the ruin, the curtain out, the wreck burning); a hurt one comes back hurt.
  snapshot() { if (this.off) return null; return { dead: !this.info.alive, hp: this.info.target.hp }; }
  restore(d) {
    if (this.off || !d) return;
    const T = this.info.target, I = this.info;
    if (d.dead) {
      this.world.destroyPowerPlant(true); T.hp = 0; this.ending = { t: 99, swapped: true, shots: [] }; this.hud.style.opacity = 0;
      for (const [lx, ly, lz, sc] of [[10, 1.4, -6, .9], [-5, 1.2, 10.5, 1], [5, 1.2, 10.5, 1], [0, 1, -13, .8], [-10, 1, -6, .7], [-14, 1, 2, .6], [-7, 1, -6, .8]]) { const f = this.fx.fires?.start([I.wp(lx, ly, lz)], sc, 110); if (f) this.fires.push(f); }
      for (const [lx, lz] of [[-7, -6], [10, -6], [0, -13], [-5, 10], [5, 10], [14, 10]]) this.fx.smoke(I.wp(lx, 3, lz), 180);
    } else { T.hp = d.hp; if (d.hp < T.maxHp) this.started = true; } // (its fires come back by themselves on the next frame, from its hit points; the drones start again)
  }

  makeHud() { // pinned at the top middle of the screen, like the final boss's bar
    const root = document.createElement('div');
    Object.assign(root.style, { position: 'fixed', zIndex: 5, pointerEvents: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '5px', top: '14px', left: '50%', transform: 'translateX(-50%)', opacity: 0, transition: 'opacity .3s',
      font: '700 14px/1 "Courier New", monospace', color: '#ffe8b4', letterSpacing: '.22em', textShadow: '-1px -1px 0 #0b0e06, 1px -1px 0 #0b0e06, -1px 1px 0 #0b0e06, 1px 1px 0 #0b0e06, 0 2px 3px rgba(0,0,0,.8)' });
    const label = document.createElement('div'); label.textContent = tr('POWER STATION');
    const bar = document.createElement('div'); Object.assign(bar.style, { width: 'min(360px, 50vw)', height: '14px', background: 'rgba(11,14,6,.75)', border: '2px solid #e8b877', boxShadow: '0 0 0 2px #0b0e06', position: 'relative' });
    const fill = document.createElement('div'); Object.assign(fill.style, { position: 'absolute', left: 0, top: 0, bottom: 0, width: '100%', transition: 'width .25s, background .25s' }); bar.appendChild(fill);
    const n = Math.ceil(this.info.target.maxHp / STEP); for (let k = 1; k < n; k++) { const t = document.createElement('div'); Object.assign(t.style, { position: 'absolute', top: 0, bottom: 0, left: (k / n * 100) + '%', width: '2px', background: '#0b0e06' }); bar.appendChild(t); } // (a notch for each direct hit)
    root.append(label, bar); (document.getElementById('frame') ?? document.body).appendChild(root); this.hud = root; this.fill = fill;
  }

  // Each frame: the weather of the fight (drones, the damage as it shows, the ending).
  update(dt, player, cam) {
    if (this.off) return;
    this.time += dt; const T = this.info.target, I = this.info;
    if (this.ending) { this.runEnding(dt, cam); return; }
    if (!I.alive) return;
    if (this.hurt > 0) { // a blow landed: a burst somewhere on it, a jolt
      this.hurt = 0; this.started = true;
      const p = this.randomPoint(); this.fx.explosion(p, 1.1, true); cam?.kick(.35); this.throwDebris(p, 8, 4);
    }
    const hits = Math.ceil((T.maxHp - T.hp) / STEP);
    while (this.stage < Math.min(hits, 6)) this.damageStage(++this.stage);
    // the drones: launched from the roof hatches one at a time, four flying at once at most
    const near = player.enabled && !player.dead && this.nearBy(player, this.near ? HIDE : SHOW); this.near = near; // (the drones fly out while the jeep is within the distance the health bar shows at, and stop once it has gone past where the bar is withdrawn)
    if (near && player.enabled && !player.dead) {
      this.drones = this.drones.filter(d => d.state !== 'dead'); this.cool -= dt;
      if (this.cool <= 0 && this.drones.length < MAX_DRONES) {
        this.cool = COOLDOWN; const bay = this.bays[this.hatchNo++ % this.bays.length]; bay.t = 0; bay.pending = true; // its doors open, and a moment later the drone rises out
      }
    }
    for (const bay of this.bays) this.stepBay(bay, dt, player);
  }

  // A launch bay: the doors slide apart (0.4 s), the drone is let go from the well, then they close again.
  stepBay(bay, dt, player) {
    if (!bay.L) { if (bay.pending) { bay.pending = false; this.launch(bay, player); } return; }
    bay.t += dt; const ease = x => { x = Math.min(1, Math.max(0, x)); return x * x * (3 - 2 * x); };
    const open = bay.t < 1.9 ? ease(bay.t / .45) : 1 - ease((bay.t - 1.9) / .55);
    bay.L.position.x = -.5 - open * .95; bay.R.position.x = .5 + open * .95;
    if (bay.pending && bay.t >= .5) { bay.pending = false; this.launch(bay, player); }
  }

  launch(bay, player) {
    const I = this.info, p = I.wp(bay.lx - .6, 14.5, -5.65), dx = player.position.x - p.x, dz = player.position.z - p.z;
    this.drones.push(this.dronePads.release(p.x, p.y, p.z, this.hatchNo, Math.atan2(-dx, -dz)));
    this.fx.puff?.(p.clone().setY(p.y + .3), { color: 0x888888, size: .5, grow: 2.2, life: 1.1, opacity: .5, vel: new THREE.Vector3(0, 1.5, 0) }); // (a puff of dust as it lifts out)
  }

  nearBy(player, r) { const T = this.info.target, dx = Math.max(Math.abs(player.position.x - T.x) - T.hw, 0), dz = Math.max(Math.abs(player.position.z - T.z) - T.hd, 0); return Math.hypot(dx, dz) <= r; }

  randomPoint() { const I = this.info; return I.wp(rnd(-18, 18), rnd(2, 12), rnd(-14, 14)); }

  // As it takes its n-th hit: another place to smoulder or burn.
  damageStage(n) {
    const I = this.info, fire = (lx, ly, lz, sc) => { const f = this.fx.fires?.start([I.wp(lx, ly, lz)], sc, Infinity); if (f) this.fires.push(f); }, smoke = (lx, ly, lz) => this.fx.smoke(I.wp(lx, ly, lz), 160);
    if (n === 1) smoke(-4, 14.5, -6);
    if (n === 2) { smoke(4, 14.5, -6); fire(-4, 14.4, -6, .55); }
    if (n === 3) { fire(8, 7.8, -13, .6); smoke(8, 8, -13); }
    if (n === 4) { fire(-5, 7.6, 10.5, .6); smoke(-5, 8, 10.5); smoke(-7, 21, .2); }
    if (n === 5) { fire(10, 14.4, -6, .8); fire(-14, 3.6, 1, .6); smoke(10, 15, -6); }
    if (n === 6) { fire(5, 8, 10.5, .8); fire(-10, 14.4, -6, .9); fire(-2, 7.8, -13, .7); smoke(0, 8, 8); smoke(14, 8, 10.5); }
  }

  // Wreckage thrown off at p: n pieces (flung chunks and, among them, big slabs that tumble) out as far as `reach` m.
  throwDebris(p, n, reach) {
    const D = this.debris; if (!D) return;
    for (let i = 0; i < n; i++) D.chunk(p.clone(), rubble, .2 + Math.random() * .55, reach);
    for (let i = 0; i < Math.ceil(n / 4); i++) {
      const m = new THREE.Mesh(shardGeometry(.5 + Math.random() * .9, .12, .35 + Math.random() * .7), rubble); m.position.copy(p).add(new THREE.Vector3(rnd(-1.5, 1.5), rnd(0, 1.5), rnd(-1.5, 1.5))); m.castShadow = true; this.scene.add(m);
      const a = Math.random() * Math.PI * 2, sp = rnd(3, 9); D.launch(m, new THREE.Vector3(Math.cos(a) * sp, rnd(5, 11), Math.sin(a) * sp), new THREE.Vector3(rnd(-12, 12), rnd(-12, 12), rnd(-12, 12)), .05);
    }
  }

  // The last point: the explosions begin (at: where the killing blast was).
  begin(at) {
    if (this.ending) return;
    this.ending = { t: 0, shots: Array.from({ length: 16 }, (_, i) => ({ at: .12 + i * .17 + Math.random() * .1, done: false })), swapped: false };
    for (const d of this.drones) { try { this.dronePads.explode(d, false); } catch (e) { /* already gone */ } } this.drones.length = 0;
    this.hud.style.opacity = 0;
  }

  runEnding(dt, cam) {
    const E = this.ending, I = this.info; E.t += dt;
    for (const s of E.shots) if (!s.done && E.t >= s.at) { s.done = true; const p = this.randomPoint(); this.fx.explosion(p, rnd(1.0, 1.8), true); cam?.kick(.6); this.throwDebris(p, 14, 5); }
    if (!E.swapped && E.t >= 1.3) { // the building comes down: the ruin takes its place, with the great fireball
      E.swapped = true; this.world.destroyPowerPlant();
      for (const f of this.fires) this.fx.fires?.douse(f); this.fires.length = 0;
      const c = I.wp(0, 3, -4); this.fx.explosion(c.clone().setY(c.y + 3), 2.5, true); this.fx.scorch?.(I.wp(0, 0, 0), 15); cam?.kick(1);
      for (let k = 0; k < 8; k++) this.throwDebris(I.wp(rnd(-16, 16), rnd(3, 12), rnd(-12, 12)), 16, 7);
      for (const [lx, ly, lz, sc] of [[10, 1.4, -6, .9], [-5, 1.2, 10.5, 1], [5, 1.2, 10.5, 1], [0, 1, -13, .8], [-10, 1, -6, .7], [-14, 1, 2, .6], [-7, 1, -6, .8]]) { const f = this.fx.fires?.start([I.wp(lx, ly, lz)], sc, 110); if (f) this.fires.push(f); }
      for (const [lx, lz] of [[-7, -6], [10, -6], [0, -13], [-5, 10], [5, 10], [14, 10]]) this.fx.smoke(I.wp(lx, 3, lz), 180);
    }
  }

  // The bar: shown while the jeep is within 20 m of the building, withdrawn once it is past 26 m.
  updateHud(cam, player) {
    if (this.off || !this.hud) return;
    const I = this.info, T = I.target, alive = I.alive && !this.ending;
    const dx = Math.max(Math.abs(player.position.x - T.x) - T.hw, 0), dz = Math.max(Math.abs(player.position.z - T.z) - T.hd, 0), d = Math.hypot(dx, dz);
    this.barOn = alive && player.enabled && !player.dead && d <= (this.barOn ? HIDE : SHOW);
    this.hud.style.opacity = this.barOn ? 1 : 0;
    const f = Math.max(0, T.hp) / T.maxHp; this.fill.style.width = (f * 100).toFixed(1) + '%'; this.fill.style.background = 'hsl(' + (108 * f).toFixed(0) + ', 70%, 48%)';
  }
}
