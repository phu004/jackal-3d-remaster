// Boss arena (NES): the clearing at the top of the stage. When the jeep, inside it, comes within TRIGGER_RANGE of a boss tank, the game
// freezes for INTRO seconds where the jeep is while the camera
// pans up to where it'll be following it from, then play carries on as usual. An invisible
// wall along the arena's south edge (the mouth of the corridor) stops the jeep leaving.
// The battle: two heavy tanks (twice a normal tank's armour) wait in the north-west and north-east
// corners and attack once play resumes. When the first of them is knocked out, or after a while,
// two more come up the corridor from below the screen. Destroying all four clears the stage.
// Stage 2 (boss 'statues'): the four sandstone busts at the top of the arena fire missiles (statues.js,
// with twice the reach). The fight starts once the jeep is STATUE_TRIGGER metres into the arena; they
// can't be hurt before then. While they stand, light tanks come up the causeway one at a time: the
// first as the fight starts, each next one RAID_COOLDOWN seconds after the last is knocked out.
// Destroying all four busts clears the stage.
import { sfx } from './sfx.js';
import * as THREE from 'three';
import { HALF_LEN } from './player.js';
import { TANK_FOOTPRINT, LIGHT_FOOTPRINT } from './tanks.js';
import { tr } from './lang.js';

const INTRO = 2;     // seconds frozen
const PAN = 1.4;     // seconds the camera pan takes (then a short hold)
const LOOK_AHEAD = 6; // m further north than normal following that the pan ends
const HEAVY = 8;            // arena tanks' hp: twice a normal tank (two grenades or rockets)
const REINFORCE_AFTER = 25; // s into the fight the reinforcements come anyway, if no tank has been knocked out yet
const TRIGGER_RANGE = 27; // the freeze starts once the jeep, inside the arena, is this close (m) to either boss tank (it stays where it is).
                          // Beyond the reach of the jeep's grenades and rockets; the tanks can't be hurt before then anyway.
const BOSS_COUNT = 4;       // boss tanks to defeat: the two waiting in the corners and the two reinforcements
const BOSS_ROW = 9 - 1.25; // m south of the arena's north edge the first two tanks wait
const RAID_COOLDOWN = 10;  // stage 2: s after a light tank is knocked out before the next comes up the causeway
const STATUE_TRIGGER = 30; // stage 2: how far (m) into the arena the jeep must come for the busts' fight to start

// Ground the jeep can drive on at ground level (stage 1 sand, stage 2 sand / grass / causeway / ramps).
const OPEN = new Set(['.', '"', '^', 'C', 'H', '=']);

// The arena: the first band of wide-open rows at the top of the map. Returns its bounds in world
// metres ({ x0, x1, north, south }) or null.
function findArena(grid, CELL, W, L, southZ) { // southZ: where the arena ends instead (the barrier goes there; its width is the gap in the wall on that row)
  const open = r => [...grid[r]].filter(ch => OPEN.has(ch)).length;
  let r0 = 0; while (r0 < grid.length && open(r0) < 30) r0++;
  let r1 = r0; while (r1 + 1 < grid.length && open(r1 + 1) >= 30) r1++;
  if (r0 >= grid.length) return null;
  if (southZ !== undefined) r1 = Math.round((southZ + L) / CELL) - 1;
  let c0 = Infinity, c1 = -Infinity;
  for (let r = r0; r <= r1; r++) for (let c = 0; c < grid[r].length; c++) if (OPEN.has(grid[r][c])) { c0 = Math.min(c0, c); c1 = Math.max(c1, c); }
  // the corridor's mouth: the open cells in the row just south of the arena
  let m0 = Infinity, m1 = -Infinity;
  if (r1 + 1 < grid.length) for (let c = 0; c < grid[r1 + 1].length; c++) if (OPEN.has(grid[r1 + 1][c])) { m0 = Math.min(m0, c); m1 = Math.max(m1, c); }
  const mouth = m0 <= m1 ? [-W / 2 + m0 * CELL, -W / 2 + (m1 + 1) * CELL] : [-W / 2 + c0 * CELL, -W / 2 + (c1 + 1) * CELL];
  return { x0: -W / 2 + c0 * CELL, x1: -W / 2 + (c1 + 1) * CELL, north: -L + r0 * CELL, south: -L + (r1 + 1) * CELL, mouth };
}

// The invisible wall's marker across the corridor mouth: a band of red-and-white hazard stripes on
// the ground, and above it a faint red energy curtain with rising scan lines that brightens as the
// jeep comes close.
export function buildWallMarker(a) {
  const [x0, x1] = a.mouth, w = x1 - x0 + 2, cx = (x0 + x1) / 2, group = new THREE.Group();
  const c = document.createElement('canvas'); c.width = 64; c.height = 16; const x = c.getContext('2d');
  x.fillStyle = '#e8e4da'; x.fillRect(0, 0, 64, 16);
  x.fillStyle = '#c4201a'; for (let i = -16; i < 64; i += 16) { x.beginPath(); x.moveTo(i, 16); x.lineTo(i + 8, 16); x.lineTo(i + 16, 0); x.lineTo(i + 8, 0); x.fill(); }
  const tex = new THREE.CanvasTexture(c); tex.wrapS = THREE.RepeatWrapping; tex.repeat.set(w / 1.6, 1); tex.anisotropy = 8;
  const stripeMat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  const stripe = new THREE.Mesh(new THREE.PlaneGeometry(w, .45), stripeMat);
  stripe.rotation.x = -Math.PI / 2; stripe.position.set(cx, .04, a.south); group.add(stripe);
  const curtainMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { uTime: { value: 0 }, uAlpha: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 ); }',
    fragmentShader: `
      uniform float uTime, uAlpha; varying vec2 vUv;
      void main() {
        float fade = pow( 1.0 - vUv.y, 1.6 );                                  // strongest at the ground
        float scan = 0.55 + 0.45 * sin( vUv.y * 40.0 - uTime * 6.0 );          // scan lines rising
        float edge = smoothstep( 0.0, 0.04, vUv.x ) * smoothstep( 1.0, 0.96, vUv.x );
        gl_FragColor = vec4( vec3( 1.0, 0.18, 0.1 ) * fade * scan * edge * uAlpha, 1.0 );
      }`,
  });
  const curtain = new THREE.Mesh(new THREE.PlaneGeometry(w, 2.2), curtainMat);
  curtain.position.set(cx, 1.1, a.south); curtain.renderOrder = 2; group.add(curtain);
  return {
    group,
    // t: seconds since it closed; show: 0..1 (fading in / out); near: 0..1, how close the jeep is
    update(t, show, near) {
      stripeMat.opacity = show * (.75 + .25 * Math.sin(t * 4));
      curtainMat.uniforms.uTime.value = t;
      curtainMat.uniforms.uAlpha.value = show * (.18 + .62 * near);
    },
  };
}

export class BossArena {
  constructor() { this.state = 'open'; this.t = 0; }

  // tanks: the Tanks manager; statues: stage 2's boss busts ([{ obj, target }], see statues.js);
  // onClear(): called once when the last boss is destroyed.
  setup(stage, LEVEL, tanks, statues, onClear, scene) {
    const grid = stage.terrain, CELL = LEVEL.length / grid.length;
    this.box = stage.arena === false ? null : findArena(grid, CELL, LEVEL.halfWidth * 2, LEVEL.length, stage.bossBarrierZ); // (stage.arena false: no boss arena at all, whatever the top of the map looks like)
    this.tanks = tanks; this.onClear = onClear; this.fighters = [];
    this.boss = stage.boss === undefined ? 'tanks' : stage.boss; // per stage: 'tanks' (stage 1), 'statues' (stage 2), 'custom' (stage 4: the arena shuts at lockZ and nothing else is built in) or null
    const a = this.box;
    if (a && stage.bossBarrierExact && stage.bossBarrierZ !== undefined) a.south = stage.bossBarrierZ + HALF_LEN + .1; // (stage 4: the jeep's centre may go exactly this far south and no further (see cam.southLimit below); the barrier stands just behind its tail)
    this.lockZ = stage.bossLockZ; // (stage 3: the arena shuts behind the jeep once it passes this z, even though the boss isn't built yet)
    if (!a) return;
    this.wall = buildWallMarker(a); this.wall.group.visible = false; scene.add(this.wall.group);
    // the first two wait in the north-west and north-east corners, facing south
    if (this.boss === 'tanks') for (const x of [a.x0 + 12, a.x1 - 12]) this.fighters.push(tanks.add(new THREE.Vector3(x, 0, a.north + BOSS_ROW), Math.PI, { hp: HEAVY, shown: true, heavy: true }));
    // stage 2: the busts, as fighters the health bars can read (dead once their target is)
    if (this.boss === 'statues') for (const s of statues ?? []) this.fighters.push({ target: s.target, maxHp: s.target.hp, get state() { return s.target.hp <= 0 ? 'dead' : 'fight'; } });
    this.fighters.forEach(t => { t.arena = true; t.target.immune = true; if (this.boss === 'tanks') t.target.shardProof = true; }); // (stage 1's boss tanks: the rocket's split shots pass them by, as on the NES) // (saved games leave the boss fight to start afresh; no hurting them before it starts)
    this.hud = null;
  }

  // The boss's armour is gone (before the stage is won: the ship takes seconds to go down): everything hostile in the arena is destroyed at once, so nothing can kill the jeep in the meantime.
  bossDown() { this.onDown?.(); }

  // Stage 5: the garages are down: the way back opens, but the stage is not won yet (the gate is still to be blown): the barrier goes and the fight cannot start again.
  release(cam) {
    if (this.released) return;
    this.released = true; this.state = 'open'; cam.southLimit = null; if (this.wall) this.wall.group.visible = false;
  }

  // Stage 3: the warship is sunk: the stage is won (the way back opens, the stage's clear sequence runs). cam: the GameCamera.
  win(cam) {
    if (this.state === 'clear') return;
    if (this.raider && this.raider.state !== 'dead') { this.raider.target.hp = 0; this.tanks.wreck(this.raider); } // (a light tank still about is blown up with the ship)
    this.state = 'clear'; cam.southLimit = null; this.onClear?.();
  }

  // Two more tanks drive up the corridor from below the screen, a moment apart.
  reinforce() {
    const a = this.box, cx = (a.x0 + a.x1) / 2;
    this.reinforced = true;
    [-3.5, 3.5].forEach((dx, i) => setTimeout(() => {
      const t = this.tanks.add(new THREE.Vector3(cx + dx, 0, a.south + 24 + i * 7), 0, { hp: HEAVY, heavy: true }); t.arena = true; t.target.shardProof = true;
      t.gun.fullView = TANK_FOOTPRINT; // fair warning: no firing until it's wholly in view (see EnemyFire)
      this.tanks.activate(t); this.fighters.push(t);
    }, i * 1500));
  }

  // Stage 2: a light tank drives up the causeway from below the screen into the arena.
  raid() {
    const [m0, m1] = this.box.mouth, x = (m0 + m1) / 2, z = this.box.south + 24;
    const t = this.tanks.add(new THREE.Vector3(x, 0, z), 0, { light: true }); t.arena = true; // (facing north; saved games leave it out, as the fight starts afresh)
    t.gun.fullView = LIGHT_FOOTPRINT; // fair warning: no firing until it's wholly in view (see EnemyFire)
    t.gun.mob = true; // (spawned without end: not counted in the stage's kill rate)
    this.tanks.activate(t); this.raider = t;
  }

  // Where a jeep saved during the boss fight comes back: just outside the arena's mouth, facing in,
  // so it drives in and the fight starts afresh.
  get entrance() { const a = this.box, [m0, m1] = a.mouth; return new THREE.Vector3((m0 + m1) / 2, 0, a.south + 4); }

  // The boss tanks' armour, pinned along the top of the screen while the arena is shut: one bar per
  // tank to defeat (BOSS_COUNT), so it's clear from the start how many there are. A bar runs from
  // green through yellow to red as its tank's armour goes; tanks still on their way show as dashed
  // "incoming" slots; a destroyed tank's slot is struck out.
  updateHud() {
    const show = (this.boss === 'tanks' || this.boss === 'statues') && (this.state === 'intro' || this.state === 'fight');
    const count = this.boss === 'tanks' ? BOSS_COUNT : this.fighters.length, name = this.boss === 'tanks' ? 'TANK' : 'STATUE';
    if (!show) { if (this.hud) this.hud.root.style.display = 'none'; return; }
    if (!this.hud) {
      const root = document.createElement('div');
      const side = this.boss === 'statues'; // stage 2: stacked in the top left, under the score line (the busts sit along the top of the view)
      Object.assign(root.style, { position: 'fixed', zIndex: 5, pointerEvents: 'none',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', font: '700 14px/1 "Courier New", monospace', color: '#ffe8b4',
        letterSpacing: '.18em', textShadow: '-1px -1px 0 #0b0e06, 1px -1px 0 #0b0e06, -1px 1px 0 #0b0e06, 1px 1px 0 #0b0e06, 0 2px 3px rgba(0,0,0,.8)', // (outlined: readable on pale stone too)
        ...(side ? { left: '16px', top: '56px', alignItems: 'flex-start', padding: '8px 10px', background: 'rgba(11,14,6,.55)', borderRadius: '4px' } // (a dark panel behind: stage 2's paving is pale)
          : { top: '14px', left: '50%', transform: 'translateX(-50%)' }) });
      const title = document.createElement('div'); title.textContent = tr('BOSS');
      const row = document.createElement('div'); Object.assign(row.style, { display: 'flex', flexDirection: side ? 'column' : 'row', gap: side ? '14px' : '10px' });
      const slots = Array.from({ length: count }, (_, i) => {
        const slot = document.createElement('div');
        Object.assign(slot.style, { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', fontSize: '12px' });
        const label = document.createElement('div'); label.textContent = tr(name) + ' ' + (i + 1);
        const bar = document.createElement('div');
        Object.assign(bar.style, { width: 'min(120px, 20vw)', height: '12px', background: 'rgba(11,14,6,.75)', border: '2px solid #e8b877', boxShadow: '0 0 0 2px #0b0e06', position: 'relative' });
        const fill = document.createElement('div'); Object.assign(fill.style, { position: 'absolute', left: 0, top: 0, bottom: 0, width: '100%', transition: 'width .25s, background .25s' });
        bar.appendChild(fill); slot.append(label, bar);
        row.appendChild(slot);
        return { slot, label, bar, fill };
      });
      root.append(title, row); (document.getElementById('frame') ?? document.body).appendChild(root); // (inside the game view)
      this.hud = { root, slots };
    }
    this.hud.root.style.display = 'flex';
    this.hud.slots.forEach((s, i) => {
      const t = this.fighters[i];
      if (!t) { // still to come
        s.slot.style.opacity = '.55'; s.bar.style.borderStyle = 'dashed'; s.fill.style.width = '0%'; s.label.textContent = tr('INCOMING'); s.label.style.textDecoration = 'none';
        return;
      }
      const f = t.state === 'dead' ? 0 : Math.max(0, t.target.hp / t.maxHp);
      s.bar.style.borderStyle = 'solid'; s.label.textContent = tr(name) + ' ' + (i + 1);
      s.fill.style.width = (f * 100).toFixed(1) + '%';
      s.fill.style.background = `hsl(${(108 * f).toFixed(0)}, 70%, 48%)`; // green -> yellow -> red
      s.slot.style.opacity = t.state === 'dead' ? '.45' : '1'; s.label.style.textDecoration = t.state === 'dead' ? 'line-through' : 'none';
    });
  }

  get frozen() { return this.state === 'intro'; }   // gameplay paused for the pan
  get active() { return this.state !== 'open'; }   // the jeep is shut in

  update(dt, player, cam) {
    const a = this.box;
    if (!a) return;
    this.updateHud();
    if (this.wall.group.visible) { // the barrier fades in as it closes, and glows brighter the nearer the jeep comes
      this.wallT += dt;
      const near = Math.min(1, Math.max(0, 1 - (a.south - player.position.z - HALF_LEN) / 6));
      const show = Math.min(1, this.wallT / .8) * (this.state === 'clear' ? Math.max(0, 1 - (this.clearT = (this.clearT ?? 0) + dt) / 1.5) : 1);
      this.wall.update(this.wallT, show, near);
      if (show <= 0) this.wall.group.visible = false;
    }
    if (this.state === 'open') {
      if (this.released) return; // (the fight was fought: it stays open)
      if (!this.boss && this.lockZ === undefined) return; // (a stage whose boss isn't built yet and has no lock line: the way stays open)
      const p = player.position;
      if (!player.enabled || player.dead || p.z > a.south - HALF_LEN - .3 || p.x < a.x0 || p.x > a.x1) return; // wholly inside
      const near = () => this.fighters.some(t => t.state !== 'dead' && Math.hypot(t.obj.position.x - p.x, t.obj.position.z - p.z) <= TRIGGER_RANGE);
      if (!this.boss && p.z > this.lockZ) return; // (no boss yet, but the way back shuts once the jeep is this far north)
      if (this.boss === 'custom' && p.z > this.lockZ) return; // (a stage with its own boss: the arena just shuts at the line; nothing here spawns or ends the fight: the stage's own code does, and calls win())
      if (this.boss === 'tanks' && (this.lockZ !== undefined ? p.z > this.lockZ : !near())) return; // (tanks: close to one of them, or, where the stage gives a trigger line (stage 4), once the jeep is north of it; the statues' fighters have no object of their own)
      if (this.boss === 'statues' && p.z > a.south - HALF_LEN - STATUE_TRIGGER) return; // (stage 2: well into the arena)
      // well inside: freeze (the jeep stays where it is), pan the camera up, close the way back
      this.state = 'intro'; this.t = 0; sfx.siren(3.75); // (the alarm as the way back shuts)
      this.from = p.clone(); this.to = p.clone();
      player.enabled = false; // (the jeep's own update still rolls its wheels)
      // the pan ends a little further up than normal following; once play resumes the camera eases
      // back to its usual view of the jeep
      cam.lockTo(cam.followTarget(this.to).add(new THREE.Vector3(0, 0, -LOOK_AHEAD)), PAN);
      cam.southLimit = a.south - HALF_LEN - .1; // the invisible wall: the jeep's centre may not go further south
      this.wall.group.visible = true; this.wallT = 0;
    } else if (this.state === 'intro') {
      this.t += dt; // (the jeep waits where it stopped while the camera pans)
      if (this.t >= INTRO) { // back to normal play: the battle starts
        this.state = 'fight'; this.fightT = 0; cam.lock = null; player.enabled = true; this.raidIn = this.boss ? 0 : 12; // (stage 2: the first light tank comes at once; stage 3: after a while)
        this.fighters.forEach(t => { if (this.boss === 'tanks') this.tanks.activate(t); t.target.immune = false; });
      }
    } else if (this.state === 'fight' && this.boss === 'tanks') {
      this.fightT += dt;
      const dead = this.fighters.filter(t => t.state === 'dead').length;
      if (!this.reinforced && (dead > 0 || this.fightT > REINFORCE_AFTER)) this.reinforce();
      if (this.reinforced && this.fighters.length === 4 && dead === 4) { this.state = 'clear'; cam.southLimit = null; this.onClear?.(); } // won: the way back opens
    } else if (this.state === 'fight' && !this.boss && this.lockZ !== undefined) { // stage 3 (the warship): a light tank drives in from the corridor now and then, one at a time, as in stage 2
      if (this.raider?.state === 'dead') { this.raider = null; this.raidIn = RAID_COOLDOWN * 1.5; }
      if (!this.raider && (this.raidIn -= dt) <= 0) this.raid();
    } else if (this.state === 'fight' && this.boss === 'statues') {
      if (this.raider?.state === 'dead') { this.raider = null; this.raidIn = RAID_COOLDOWN; }
      if (!this.raider && (this.raidIn -= dt) <= 0) this.raid();
      if (this.fighters.every(t => t.state === 'dead')) { // all four busts down: won (a light tank still about is blown up with them)
        if (this.raider && this.raider.state !== 'dead') { this.raider.target.hp = 0; this.tanks.wreck(this.raider); }
        this.state = 'clear'; cam.southLimit = null; this.onClear?.();
      }
    }
  }
}
