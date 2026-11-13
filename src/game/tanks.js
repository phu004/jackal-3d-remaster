// Enemy tanks (NES). A light tank rolls in from the north just as the second gunboat at a bridge is about
// to come into view; others stand where the level data puts them (types 'lighttank' and 'mediumtank') and move off once on screen; more fight in the boss arena (see BossArena, which places them with add()).
// A tank drives toward the jeep, steering round anything in its way (other tanks included), and
// stops a few metres short; it fires on the move. Its gun fires pairs of shells at where the jeep is
// now (turret rules otherwise, see EnemyFire). A normal tank is as tough as a turret: one grenade or
// four bullets; arena tanks take twice that, and look battle-damaged once they're down to half.
// Touching a tank destroys the jeep outright.
import * as THREE from 'three';
import { shardGeometry } from './debris.js';
import { mergeGeometries, worldGeometry } from './optimize.js';
import { buildTank, buildLightTank, buildMediumTank, buildFlameTank, damageTank, damageFlameTank } from '../assets/tank.js';
import { mergeStatic, dropTinyShadows } from './optimize.js';
import { quietEffects } from './quiet.js';
import { HALF_LEN, HALF_WID } from './player.js';
import { HEAVY_SHELL } from './enemies.js';
import { addToLayer, REFLECT } from './layers.js';
import { PUDDLE } from './puddles.js';
import { sfx } from './sfx.js';

const SPEED = 4.4, TURN = .85;       // m/s, rad/s (the hull turns slowly; the turret swings much faster)
const STAND = 9;                      // backs off if the jeep gets closer than this
const ENGAGE = 20;                    // closes in only until the jeep is this near (well inside its 28 m reach), then holds the distance
const ENGAGE_SLACK = 4;               // ... and only closes in again once the jeep is this much further off
const SHIFT_EVERY = [2.5, 4.5];       // s between repositioning moves while holding the distance
const SHIFT_DIST = [4, 7];            // m it moves sideways (across the line to the jeep) each time
const ARENA_SHIFT = { every: [.2, .7], dist: [6, 11] }; // boss arena tanks: barely pause, and move further (no sitting ducks)
const SHIFT_TIME = 4;                 // s it gives up a move after (blocked, or taking too long)
// Path finding: A* over a grid of PLAN_CELL m squares, PLAN_HALF m round the tank, keeping the hull
// clear of terrain and objects; re-planned every REPLAN s. A tank that makes no headway for STUCK s
// backs up for BACK_UP s and plans again.
// A tank only stops closing in once it has a clear line to the jeep (nothing solid between them) for LOS_HOLD s:
// behind crates or a container it keeps driving round them, however near the jeep is.
const PLAN_CELL = 1, PLAN_HALF = 34, PLAN_MAX = 60, REPLAN = .8, STUCK = 1, BACK_UP = .9;
const LOS_EVERY = .25, LOS_HOLD = .5;
const TOLERANCE = .2, WEDGED_TOLERANCE = [.2, .5, .5, 1]; // m the hull may overlap a wall by in the collision tests; a tank that jams again and again gets more (and finally turns freely) to work itself loose
const TIGHT_COST = 14, FIT_MARGIN = .5, FIT_RING = [[1, 0], [-1, 0], [0, 1], [0, -1], [.7, .7], [-.7, .7], [.7, -.7], [-.7, -.7]];
const NEAR_COST = 6; // a cell where the hull would scrape something costs this many times more (it can still pass, e.g. to get away from a river bank)
const HL = 2.35, HW = 1.55;           // half length / width (collision): the main battle tank
const LIGHT_SCALE = 1.1;              // the light tank's model is drawn this much over its modelled size
const LIGHT = { hl: 1.85 * LIGHT_SCALE, hw: 1.25 * LIGHT_SCALE, size: .78 * LIGHT_SCALE }; // the light tank: half length / width, and its hit box against the main tank's
// The medium tank (its model is already drawn at 1.06 times, see MEDIUM_SCALE in tank.js; Tanks makes it 5% larger again): light-tank AI, but its
// gun fires heavy shells, bigger and easier to be hit by (see EnemyFire.shoot).
const MEDIUM_SCALE = 1.05; // the medium tank is drawn 5% larger, its collision and hit boxes with it
const MEDIUM = { hl: 2.2 * MEDIUM_SCALE, hw: 1.45 * MEDIUM_SCALE, size: .9 * MEDIUM_SCALE };

// ---- the flame tank (stage 5): it rolls up close, stops, flares its pilot flames, then sends a jet of fire from each nozzle for a second or so and cools down. The jeep is lost if it stays in a jet.
export const FLAME = {
  hold: 8.1, back: 3.8,       // m: it closes in until the jeep is this near (it starts again a little further off), and backs away if the jeep gets nearer than `back`
  start: 16, len: 12.5, rad: .62, // m: it lights up inside `start` (from its middle: the nozzles are 3.7 m ahead), the jets are `len` long and `rad` wide at the far end
  warn: .2, burn: 1.0, cool: [2.2, 3.4], // s: pilot flare before, the burst, and the pause after
  turn: 2.2, sweep: .65,      // rad/s: how fast the turret follows the jeep while it is waiting, and while it is burning
  kill: .22,                  // s in a jet before the jeep is lost
};
let _jetGeos = null;
const JET_GLSL = `
float jh( vec3 p ) { p = fract( p * 0.3183099 + 0.1 ); p *= 17.0; return fract( p.x * p.y * p.z * ( p.x + p.y + p.z ) ); }
float jn( vec3 x ) { vec3 i = floor( x ), f = fract( x ); f = f * f * ( 3.0 - 2.0 * f );
  return mix( mix( mix( jh( i ), jh( i + vec3( 1, 0, 0 ) ), f.x ), mix( jh( i + vec3( 0, 1, 0 ) ), jh( i + vec3( 1, 1, 0 ) ), f.x ), f.y ),
              mix( mix( jh( i + vec3( 0, 0, 1 ) ), jh( i + vec3( 1, 0, 1 ) ), f.x ), mix( jh( i + vec3( 0, 1, 1 ) ), jh( i + vec3( 1, 1, 1 ) ), f.x ), f.y ), f.z ); }
float jf( vec3 p ) { return jn( p ) * 0.55 + jn( p * 2.1 + 3.7 ) * 0.3 + jn( p * 4.3 + 8.1 ) * 0.15; }`;
export function makeFlameJet() { // a jet of fire along -Z from its own origin: a wide, ragged outer flame and a short, narrow, white-hot core inside it, both drawn by a shader (tongues of flame streaming out of the nozzle, torn at the edges)
  const R = FLAME.rad / 1.113;
  _jetGeos ??= [R, R * .42].map(r => new THREE.CylinderGeometry(r, .04, 1, 18, 8, true).rotateX(-Math.PI / 2).translate(0, 0, -.5));
  const g = new THREE.Group(); g.visible = false; g.userData.mats = [];
  [0, 1].forEach(core => {
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, uniforms: { uTime: { value: 0 }, uAmt: { value: 0 }, uCore: { value: core }, uSeed: { value: Math.random() * 40 } },
      vertexShader: `varying vec2 vUv; varying vec3 vN; varying vec3 vV;
        void main() { vUv = uv; vN = normalize( normalMatrix * normal ); vec4 mv = modelViewMatrix * vec4( position, 1.0 ); vV = normalize( -mv.xyz ); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: JET_GLSL + `
        uniform float uTime; uniform float uAmt; uniform float uCore; uniform float uSeed; varying vec2 vUv; varying vec3 vN; varying vec3 vV;
        void main() {
          float v = vUv.y, a = vUv.x * 6.2831853;
          vec3 q = vec3( cos( a ) * 1.7, sin( a ) * 1.7, v * ( 3.2 - uCore * 1.2 ) - uTime * ( 7.0 + uCore * 3.0 ) + uSeed );
          float tongues = jf( q ), wisps = jf( q * 1.9 + vec3( 4.0, 1.0, - uTime * 3.0 ) );
          float edge = pow( abs( dot( normalize( vN ), normalize( vV ) ) ), 1.1 );
          float reach = 1.0 - v;
          float d = ( tongues * 0.85 + wisps * 0.45 ) * ( 0.35 + 0.9 * edge ) * ( 0.25 + 1.25 * reach ) - v * 0.55 * ( 1.0 - uCore * 0.4 );
          float alpha = smoothstep( 0.12, 0.5, d ) * ( 1.0 - smoothstep( 0.85, 1.0, v ) ) * smoothstep( 0.0, 0.05, v + 0.04 );
          vec3 col = mix( vec3( 0.75, 0.1, 0.02 ), vec3( 1.0, 0.5, 0.08 ), smoothstep( 0.18, 0.5, d ) );
          col = mix( col, vec3( 1.0, 0.88, 0.45 ), smoothstep( 0.45, 0.85, d ) );
          col = mix( col, vec3( 1.0, 0.98, 0.9 ), uCore * smoothstep( 0.1, 0.5, reach ) );
          gl_FragColor = vec4( col * ( 1.15 + uCore * 0.6 ), alpha * ( uCore > 0.5 ? 0.9 : 0.75 ) * uAmt );
        }` });
    const m = new THREE.Mesh(_jetGeos[core], mat); m.frustumCulled = false; m.renderOrder = 6 + core; if (core) m.scale.z = .72; m.layers.enable(PUDDLE); g.add(m); g.userData.mats.push(mat); // (the jet is mirrored in stage 6's puddles)
  });
  return g;
}
const _fw = new THREE.Vector3(), _mw = new THREE.Vector3();
const SPAWN_AHEAD = 10;               // m north of the boat's parking spot it starts, just off screen
const r = () => (Math.random() - .5) * 2;

// Do two rectangles (centre x/z, yaw, half length / width) overlap? Separating-axis test.
export function rectsOverlap(a, b) {
  const axes = [a.yaw, a.yaw + Math.PI / 2, b.yaw, b.yaw + Math.PI / 2];
  const corners = q => {
    const fx = -Math.sin(q.yaw), fz = -Math.cos(q.yaw), rx = Math.cos(q.yaw), rz = -Math.sin(q.yaw);
    return [[1, 1], [1, -1], [-1, 1], [-1, -1]].map(([u, v]) => [q.x + fx * u * q.hl + rx * v * q.hw, q.z + fz * u * q.hl + rz * v * q.hw]);
  };
  const ca = corners(a), cb = corners(b);
  for (const ang of axes) {
    const ax = Math.cos(ang), az = -Math.sin(ang);
    const pa = ca.map(([x, z]) => x * ax + z * az), pb = cb.map(([x, z]) => x * ax + z * az);
    if (Math.max(...pa) < Math.min(...pb) || Math.max(...pb) < Math.min(...pa)) return false;
  }
  return true;
}

export const TANK_FOOTPRINT = { hl: HL, hw: HW }, LIGHT_FOOTPRINT = { hl: LIGHT.hl, hw: LIGHT.hw };

const _idle = new THREE.Vector3();
const IDLE_DIST = 85; // m from the jeep: farther than this the tanks stand idle
// (a debugging aid: where the tanks' update time goes; __tankReport() in the console prints it per frame and starts over)
const TT = { frames: 0, total: 0, line: 0, lineN: 0, steer: 0, blocked: 0, blockedN: 0, seen: 0, driving: 0 };
window.__tankReport = () => { const f = Math.max(1, TT.frames), m = k => (TT[k] / f).toFixed(2) + ' ms'; console.log(['tanks per frame over ' + TT.frames + ' frames:', 'total update   ' + m('total'), 'blocked()      ' + m('blocked') + '  (' + (TT.blockedN / f).toFixed(1) + ' calls)', 'lineClear      ' + m('line') + '  (' + (TT.lineN / f).toFixed(2) + ' calls)', 'steerTo (plan) ' + m('steer'), 'seen (4 projects) ' + m('seen') + '  (' + (TT.driving / f).toFixed(1) + ' driving tanks)'].join(String.fromCharCode(10))); for (const k in TT) TT[k] = 0; };
export class Tanks {
  constructor(scene, fx, debris) { this.scene = scene; this.fx = fx; this.debris = debris; this.tanks = []; this.spawns = []; this.fired = []; }

  setup(world, gunboats, spawns = []) {
    this.world = world; this.spawns = spawns; this.fired = [];
    for (const boat of gunboats.boats) {
      if (!boat.spec.tank) continue;
      const spot = this.findSpawn(world, boat);
      if (!spot) { console.warn('no room for a tank near', boat.park); continue; }
      this.add(spot, Math.PI, { trigger: boat.park, light: true }); // facing south, into the screen
    }
    for (const { p, kind } of world.displayTanks ?? []) this.add(p, Math.PI, { shown: true, inert: true, light: kind === 'light', flame: kind === 'flame', medium: kind === 'medium' || kind === 'flame' }); // unmanned tanks: parked facing south, they can be destroyed but never move, aim or fire, and aren't counted in the stage's kills
    this.mergeDisplay();
    // light tanks placed in the level data: parked facing south, rolling out once they come into view
    // (added after the gunboats' tanks, so saved games still line up)
    for (const { p, kind, hidden, yaw } of world.tankSpots ?? []) { // (kind 'flame': the flame tank, tougher: 6 hits) // (hidden: parked inside a garage, under its roof, until the walls come down: see openGarage; yaw: how it is parked, default facing south)
      const t = this.add(p, yaw ?? Math.PI, { trigger: hidden ? null : p, shown: true, light: kind === 'light', medium: kind === 'medium', flame: kind === 'flame', hp: kind === 'flame' ? 8 : 4 }); if (hidden) { t.garaged = p.clone(); t.target.immune = true; } // (immune: the blast that brings the garage down must not take the tank with it)
    }
  }

  // The unmanned tanks (parked for show, never moving) are drawn together: their hulls, turrets and guns are joined, material by material, into a few meshes for all of them, and their own parts are kept, hidden, as they were. (The treads scroll per
  // tank, so they stay as they are.) A tank that is hit, or destroyed, goes back to its own parts (unproxy): its share of the joined meshes is emptied, and its own parts show again, with the damage and the wreck done the way they always were.
  mergeDisplay() {
    const list = this.tanks.filter(t => t.inert && t.obj.parent); if (list.length < 2) return;
    const buckets = new Map();
    for (const t of list) {
      t.obj.updateMatrixWorld(true); t.proxy = { parts: [], ranges: [] };
      t.obj.traverse(m => {
        if (!m.isMesh || m.isInstancedMesh || Array.isArray(m.material) || m.material.transparent || !m.visible) return;
        for (let q = m; q && q !== t.obj; q = q.parent) if (q.name === 'tracks') return; // (the treads scroll per tank)
        const key = m.material.uuid + (m.castShadow ? 'c' : 'n') + (m.receiveShadow ? 'r' : 'n') + m.layers.mask, b = buckets.get(key) ?? buckets.set(key, { material: m.material, cast: m.castShadow, recv: m.receiveShadow, mask: m.layers.mask, geos: [], owners: [] }).get(key);
        const geo = worldGeometry(m); b.geos.push(geo); b.owners.push({ t, m, n: geo.attributes.position.count });
      });
    }
    for (const b of buckets.values()) {
      const merged = mergeGeometries(b.geos); if (!merged) { for (const o of b.owners) o.t.proxy.failed = true; continue; }
      const mesh = new THREE.Mesh(merged, b.material); mesh.castShadow = b.cast; mesh.receiveShadow = b.recv; mesh.layers.mask = b.mask; this.scene.add(mesh); (this.displayMeshes ??= []).push(mesh);
      let off = 0; for (const o of b.owners) { o.t.proxy.ranges.push({ geo: merged, start: off, end: off + o.n }); o.t.proxy.parts.push(o.m); o.m.visible = false; off += o.n; }
    }
    for (const t of list) if (t.proxy.failed) this.unproxy(t); // (a set that could not be joined: those tanks are drawn as they were)
  }
  unproxy(t) {
    const p = t.proxy; if (!p) return; t.proxy = null;
    for (const r of p.ranges) { const pos = r.geo.attributes.position; pos.array.fill(0, r.start * 3, r.end * 3); pos.needsUpdate = true; } // (their share of the joined meshes: collapsed to nothing)
    for (const m of p.parts) m.visible = true;
  }

  // A tank at pos facing yaw. hp: 4 = a normal tank. trigger: it appears and attacks when this point
  // is about to come into view; without one it waits (shown or hidden) until activate().
  // light: the light tank (smaller) rather than the main battle tank; medium: the medium tank (heavy shells).
  add(pos, yaw, { hp = 4, trigger = null, shown = false, light = false, flame = false, medium = flame, heavy = medium && !flame, inert = false } = {}) { // heavy: fires the big shells (the medium tank always does; stage 1's boss tanks too)
    const obj = mergeStatic(light ? buildLightTank() : flame ? buildFlameTank() : medium ? buildMediumTank() : buildTank()), k = light ? LIGHT.size : medium ? MEDIUM.size : 1;
    if (light) obj.scale.setScalar(LIGHT_SCALE); else if (medium) obj.scale.multiplyScalar(MEDIUM_SCALE); // (on top of the model's own 1.06)
    dropTinyShadows(obj);
    obj.position.copy(pos); obj.position.y = this.groundY(pos.x, pos.z); obj.rotation.y = yaw; addToLayer(obj, REFLECT);
    let treads = null; obj.getObjectByName('tracks').traverse(o => { if (o.isMesh) treads = o.material.map; });
    const tank = { obj, top: obj.getObjectByName('turret'), treads, trigger, state: 'wait', dustIn: 0, smokeIn: 0, damaged: false, maxHp: hp,
      hl: light ? LIGHT.hl : medium ? MEDIUM.hl : HL, hw: light ? LIGHT.hw : medium ? MEDIUM.hw : HW, light, medium, flameTank: flame };
    if (flame && !this.warmed) { // the damaged paint is a shader of its own: a hidden damaged copy in the scene gets it compiled with the rest, behind the loading screen, not at the first hit
      this.warmed = obj.clone(); damageFlameTank(this.warmed); this.warmed.visible = false; this.scene.add(this.warmed);
    }
    tank.target = { object: obj, x: pos.x, z: pos.z, hw: 1.9 * k, hd: 1.9 * k, r: 2.2 * k, hp, score: 500 * hp / 4, asleep: true,
      // (the rocket's split shots hurt every tank but stage 1's boss tanks: arena.js marks those shardProof)
      wreck: () => this.wreck(tank),
      onHurt: () => { if (!tank.damaged && tank.target.hp <= hp / 2) { tank.damaged = true; this.unproxy(tank); (flame ? damageFlameTank : damageTank)(obj); } } };
    this.world.targets.push(tank.target);
    tank.gun = flame ? { top: tank.top, base: obj, target: tank.target, range: 0, noRecoil: true } // (never fires a shell: it burns, see flameUpdate)
      : { top: tank.top, base: obj, target: tank.target, burstSize: 2, live: true, turnRate: 4, cannon: true, shell: heavy ? HEAVY_SHELL : undefined };
    if (flame) { // two jets of fire at the nozzles, off until it burns, and the pilot flames to flare
      tank.fl = { st: 'idle', t: 0, cool: 1.2, err: 1, hit: 0, age: 0, puffIn: 0 };
      tank.jets = ['muzzleL', 'muzzleR'].map(n => { const j = makeFlameJet(); obj.getObjectByName(n).add(j); return j; });
      tank.pilots = ['pilotL', 'pilotR'].map(n => obj.getObjectByName(n));
    }
    tank.inert = inert;
    if (inert) tank.target.asleep = false; // (hittable, but its gun is left out of the turrets: it never tracks or fires, and isn't one of the stage's enemies to count)
    else this.world.turrets.push(tank.gun); // fires pairs at the jeep as it is now; its turret swings a third faster than a fixed one
    if (shown) this.scene.add(obj);
    this.tanks.push(tank);
    return tank;
  }

  // The drawn ground under (x, z): stage 2's terraces and ramps are raised (visual only, see heightAt in world.js).
  groundY(x, z) { return this.world?.heightAt ? this.world.heightAt(x, z) : 0; }

  // The garage at `at` has been blown open: the tank inside starts up, and the wreck's back wall is all that still blocks the way (the front is gone).
  openGarage(at) {
    const t = this.tanks.find(k => k.garaged && k.state === 'wait' && Math.hypot(k.garaged.x - at.x, k.garaged.z - at.z) < 4);
    console.log('garage opened at', at.x.toFixed(1), at.z.toFixed(1), '- tank found:', !!t, '- hidden tanks:', this.tanks.filter(k => k.garaged).map(k => [k.garaged.x.toFixed(1), k.garaged.z.toFixed(1), k.state]));
    if (!t) return;
    const hut = this.world.obstacles.find(o => o.alive && o.kind === 'barracks' && Math.hypot(o.x - at.x, o.z - at.z) < 1);
    if (hut) t.script = { goal: new THREE.Vector3(t.obj.position.x, 0, hut.z + hut.hd + 4.2) }; // (scripted: straight out of the door, then its own judgement)
    if (hut) { const keep = Math.min(hut.hd, .2); hut.z -= hut.hd - keep; hut.hd = keep; } // (the hut faces south: only a strip along its back wall stays solid)
    console.log('garage: hut blocker', hut ? [hut.x.toFixed(1), hut.z.toFixed(1), hut.hd.toFixed(2)] : 'none found');
    t.releaseIn = .7; t.immuneFor = 1.8; t.garaged = null; // (it can be hurt again 1.8 s after the blast: the tank is out of the smoke by then)
  }

  activate(t) {
    if (t.state !== 'wait') return;
    if (t.releaseIn !== undefined) console.log('garage tank starts at', t.obj.position.x.toFixed(1), t.obj.position.z.toFixed(1));
    if (!t.obj.parent) this.scene.add(t.obj);
    t.state = 'drive'; t.target.asleep = false;
  }

  // Open ground on the west bank, a little north of the boat's parking spot.
  findSpawn(world, boat) {
    for (let dz = 0; dz < 20; dz += 2) for (let dx = 4; dx < 30; dx += 1) {
      const x = boat.park.x - dx, z = boat.park.z - SPAWN_AHEAD - dz;
      if (!world.blockedRect(x, z, Math.PI, HL + .8, HW + .8, false, true) && !world.blockedRect(x, z + 5, Math.PI, HL + .5, HW + .5, false, true)) return new THREE.Vector3(x, 0, z);
    }
    return null;
  }

  // What a map cell is for a tank of this size: 2 inside something solid, 3 too tight for the hull, 1 the hull would touch something, 0 free. Worked out the first time a plan asks and kept (per tank size, on the world's
  // whole-metre grid), so the next plan, of this tank or another of its size, finds most of its map done: a plan used to work every one of its thousands of cells out again, scanning the obstacles for each. The kept
  // cells are thrown away every 1.5 s and whenever an obstacle is destroyed, so something that has moved (an APC) is soon seen in its new place.
  navCls(t, clear) {
    const w = this.world, now = performance.now(), C = PLAN_CELL;
    let alive = 0; for (const o of w.obstacles) if (o.alive) alive++;
    if (!this.nav || now - this.nav.t > 1500 || alive !== this.nav.alive) this.nav = { t: now, alive, by: new Map() };
    const key = t.hl.toFixed(2) + ',' + t.hw.toFixed(2); let cls = this.nav.by.get(key);
    if (!cls) {
      const ms = w.mapSize, gx0 = Math.ceil((ms.W / 2 + 140) / C), gz0 = Math.ceil((ms.L + 140) / C), NX = gx0 * 2 + 1, NZ = gz0 + Math.ceil(140 / C) + 1, kept = new Uint8Array(NX * NZ).fill(255);
      const fit = t.hw + FIT_MARGIN, grid = !!w.obstaclesNear && Math.max(clear, fit) <= 2.9; // (the grid's boxes cover 3 m round their cells: enough unless the tank is very big)
      cls = (x, z) => {
        const gx = Math.round(x / C) + gx0, gz = Math.round(z / C) + gz0, inside = gx >= 0 && gx < NX && gz >= 0 && gz < NZ, idx = gz * NX + gx;
        if (inside && kept[idx] !== 255) return kept[idx];
        const v = this.classify(x, z, clear, fit, grid ? w.obstaclesNear(x, z) : w.obstacles);
        if (inside) kept[idx] = v;
        return v;
      };
      this.nav.by.set(key, cls);
    }
    return cls;
  }
  classify(x, z, clear, fit, list) {
    const w = this.world, dist2 = b => { const dx = Math.max(Math.abs(x - b.x) - b.hw, 0), dz = Math.max(Math.abs(z - b.z) - b.hd, 0); return dx * dx + dz * dz; };
    if (w.solidTile(w.tileAt(x, z)) || list.some(b => b.alive && dist2(b) < .25)) return 2; // in it
    let tight = list.some(b => b.alive && dist2(b) < fit * fit); // (too tight for the hull: within its half width + a margin of anything solid)
    if (!tight) for (const [ax, az] of FIT_RING) if (w.solidTile(w.tileAt(x + ax * fit, z + az * fit)) || w.solidTile(w.tileAt(x + ax * fit * .5, z + az * fit * .5))) { tight = true; break; }
    if (tight) return 3;
    let hit = list.some(b => b.alive && dist2(b) < clear * clear);
    if (!hit) for (const [ax, az] of [[clear, 0], [-clear, 0], [0, clear], [0, -clear], [clear * .7, clear * .7], [-clear * .7, clear * .7], [clear * .7, -clear * .7], [-clear * .7, -clear * .7]])
      if (w.solidTile(w.tileAt(x + ax, z + az))) { hit = true; break; }
    return hit ? 1 : 0; // 1: the hull would touch something
  }

  // A path for tank t from where it is to `goal` round terrain and objects: an array of points (the
  // first is the next one to head for), or null if there's none. If the goal can't be reached, it goes
  // as near as it can. Each cell is tested with a circle of the tank's size: cells whose centre is in
  // terrain or an object are impassable, cells where only the hull would touch something are allowed
  // but costly, so it keeps clear where it can yet can always drive out from against a bank or wall.
  // Cells too tight for the hull (nearer than its half width + a margin to anything solid) cost TIGHT_COST each: it will
  // squeeze through a gap if that is the only way, but takes a long way round rather than jam in a notch or a narrow lane.
  // The map covers both the tank and the jeep (up to PLAN_MAX m round), so a long way round is found, and its choice of
  // route doesn't flip as it moves.
  plan(t, goal) {
    const w = this.world, p = t.obj.position, C = PLAN_CELL;
    const gap = Math.hypot(goal.x - p.x, goal.z - p.z), half = Math.min(PLAN_MAX, Math.max(PLAN_HALF, gap / 2 + 18)), n = Math.round(half * 2 / C) + 1;
    const mid = Math.min(.5, (half - 8) / Math.max(gap, 1)), cx = p.x + (goal.x - p.x) * mid, cz = p.z + (goal.z - p.z) * mid;
    const ox = Math.floor((cx - half) / C) * C, oz = Math.floor((cz - half) / C) * C, clear = (t.hl + t.hw) / 2 + .2; // (the cells sit on the world's whole-metre grid, so what is worked out for one plan serves the next)
    const cls = this.navCls(t, clear); // (what each cell is for a tank of this size: worked out once and kept, see navCls)
    const solid = new Uint8Array(n * n);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) solid[j * n + i] = cls(ox + i * C, oz + j * C);
    const cl = v => Math.max(0, Math.min(n - 1, Math.round(v)));
    const si = cl((p.x - ox) / C), sj = cl((p.z - oz) / C), gi = cl((goal.x - ox) / C), gj = cl((goal.z - oz) / C);
    const start = sj * n + si;
    let end = gj * n + gi;
    if (solid[end] === 2) { // the goal is inside something (the jeep against a crate): aim for the nearest free cell
      let bestD = Infinity;
      for (let j = Math.max(0, gj - 5); j <= Math.min(n - 1, gj + 5); j++) for (let i = Math.max(0, gi - 5); i <= Math.min(n - 1, gi + 5); i++)
        if (solid[j * n + i] !== 2 && (i - gi) ** 2 + (j - gj) ** 2 < bestD) { bestD = (i - gi) ** 2 + (j - gj) ** 2; end = j * n + i; }
    }
    solid[start] = 0; // (it's already there)
    const g = new Float32Array(n * n).fill(Infinity), from = new Int32Array(n * n).fill(-1), done = new Uint8Array(n * n);
    const ei = end % n, ej = Math.floor(end / n);
    const h = k => { const dx = Math.abs(k % n - ei), dz = Math.abs(Math.floor(k / n) - ej); return Math.max(dx, dz) + .414 * Math.min(dx, dz); };
    const heap = [], push = (k, f) => { heap.push([f, k]); let i = heap.length - 1; while (i) { const q = i - 1 >> 1; if (heap[q][0] <= heap[i][0]) break; [heap[q], heap[i]] = [heap[i], heap[q]]; i = q; } };
    const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const a = 2 * i + 1, b = a + 1; let m = i;
      if (a < heap.length && heap[a][0] < heap[m][0]) m = a; if (b < heap.length && heap[b][0] < heap[m][0]) m = b; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top[1]; };
    g[start] = 0; push(start, h(start));
    let best = start, bestH = h(start);
    while (heap.length) {
      const k = pop(); if (done[k]) continue; done[k] = 1;
      if (k === end) { best = k; break; }
      const hk = h(k); if (hk < bestH) { bestH = hk; best = k; }
      const i = k % n, j = Math.floor(k / n);
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const a = i + di, b = j + dj; if (a < 0 || b < 0 || a >= n || b >= n) continue;
        const q = b * n + a; if (solid[q] === 2 || done[q]) continue;
        if (di && dj && (solid[j * n + a] === 2 || solid[b * n + i] === 2)) continue; // no cutting corners
        const ng = g[k] + (di && dj ? 1.414 : 1) * (solid[q] === 3 ? TIGHT_COST : solid[q] ? NEAR_COST : 1);
        if (ng < g[q]) { g[q] = ng; from[q] = k; push(q, ng + h(q)); }
      }
    }
    if (best === start) return null;
    const pts = [];
    for (let k = best; k !== start && k >= 0; k = from[k]) pts.push(new THREE.Vector3(ox + (k % n) * C, 0, oz + Math.floor(k / n) * C));
    pts.reverse();
    if (best === end && end === gj * n + gi) pts[pts.length - 1] = new THREE.Vector3(goal.x, 0, goal.z);
    return pts;
  }

  // Is there nothing solid (terrain, crates, containers, buildings) on the straight line from a to b?
  lineClear(a, b, flame = false) { const _a = performance.now(), r = this.lineClear0(a, b, flame); TT.line += performance.now() - _a; TT.lineN++; return r; }
  lineClear0(a, b, flame = false) { // flame: a jet of fire, which passes wire fences and sandbags (world.flameBlocked)
    const d = Math.hypot(b.x - a.x, b.z - a.z), n = Math.ceil(d / 1);
    for (let i = 1; i < n; i++) { const k = i / n, x = a.x + (b.x - a.x) * k, z = a.z + (b.z - a.z) * k; if (flame ? this.world.flameBlocked(x, z) : this.world.blockedRect(x, z, 0, .4, .4, false, true)) return false; }
    return true;
  }

  // Where tank t should head for now on its way to `goal`: a point a few metres along its planned path.
  steerTo(t, goal, dt) { const _a = performance.now(), r = this.steerTo0(t, goal, dt); TT.steer += performance.now() - _a; return r; }
  steerTo0(t, goal, dt) {
    const p = t.obj.position;
    if (!t.path || (t.planIn -= dt) <= 0 || !t.planGoal || t.planGoal.distanceTo(goal) > 2) {
      t.path = this.plan(t, goal); t.planIn = REPLAN; t.planGoal = goal.clone();
    }
    if (!t.path) return goal;
    while (t.path.length > 1 && Math.hypot(t.path[0].x - p.x, t.path[0].z - p.z) < 2.5) t.path.shift();
    return t.path[Math.min(t.path.length - 1, 1)]; // a little ahead, so it cuts the grid's corners smoothly
  }

  // Would tank t fit at (x, z) facing yaw? Terrain, objects and the other tanks on the field. A tank
  // already jammed against another (e.g. one swung its hull into it) may still move or turn so long
  // as it doesn't close in on it, so the two can work themselves apart instead of locking up.
  blocked(t, x, z, yaw) { const _a = performance.now(), r = this.blocked0(t, x, z, yaw); TT.blocked += performance.now() - _a; TT.blockedN++; return r; }
  blocked0(t, x, z, yaw) {
    const tol = WEDGED_TOLERANCE[Math.min(t.wedged ?? 0, 3)];
    if (this.world.blockedRect(x, z, yaw, t.hl - tol, t.hw - tol, false, true)) return true;
    const p = t.obj.position, me = { x, z, yaw, hl: t.hl + .3, hw: t.hw + .3 }, now = { ...me, x: p.x, z: p.z, yaw: t.obj.rotation.y };
    return this.tanks.some(o => {
      if (o === t || o.state === 'dead' || !o.obj.parent) return false;
      const q = o.obj.position, them = { x: q.x, z: q.z, yaw: o.obj.rotation.y, hl: o.hl, hw: o.hw };
      if (!rectsOverlap(me, them)) return false;
      return !rectsOverlap(now, them) || Math.hypot(x - q.x, z - q.z) < Math.hypot(p.x - q.x, p.z - q.z) - 1e-4;
    });
  }

  update(dt, world, player, cam, onCrush) { TT.frames++; const _u0 = performance.now(); try { this.update0(dt, world, player, cam, onCrush); } finally { TT.total += performance.now() - _u0; } }
  // A tank that appears when a trigger is met (spawns: [{ x, z, yaw, road, medium, hp, trigger: { summit: true, y } or { z } }]): `road` has it drive up the summit road's points, the way the enemy jeeps do, and let loose on the jeep once it is up on the plateau.
  spawnRoad(s) {
    const t = this.add(new THREE.Vector3(s.x, 0, s.z), s.yaw ?? 0, { medium: s.medium ?? true, hp: s.hp ?? 4, shown: true });
    if (s.road && this.world.summitRoad) { t.route = this.world.summitRoad; t.routeGoal = new THREE.Vector3(); t.ri = 0; let best = 1e9; t.route.forEach((q, k) => { const d = Math.hypot(q[0] - s.x, q[1] - s.z); if (d < best) { best = d; t.ri = k; } }); }
    this.activate(t);
  }
  update0(dt, world, player, cam, onCrush) {
    if (this.spawns.length) this.spawns.forEach((s, i) => { if (!this.fired.includes(i) && player.enabled && (s.trigger.summit ? player.position.y >= s.trigger.y : player.position.z <= s.trigger.z)) { if (s.delay && (s.waited = (s.waited ?? 0) + dt) < s.delay) return; /* (s.delay: seconds after the trigger: the summit's tank starts out after the enemy jeep, which would otherwise be stuck behind it on the road) */ this.fired.push(i); this.spawnRoad(s); } });
    for (const t of this.tanks) {
      const o = t.obj, p = o.position;
      { const bv = t.state !== 'dead' && t.state !== 'dying' ? this.world?.conveyorAt?.(p.x, p.z) ?? 0 : 0; // stage 6's conveyor belts carry a tank south, wherever it is heading
        if (bv) { const nz = p.z + bv * dt; if (!this.world.blockedRect(p.x, nz, o.rotation.y, t.hl - .3, t.hw - .3, false, true)) { p.z = nz; t.target.z = nz; } } }
      if (t.damaged && t.state !== 'dead' && o.parent && (t.smokeIn -= dt) <= 0) { // a damaged tank trails smoke from its engine deck
        t.smokeIn = .2;
        const back = new THREE.Vector3(Math.sin(o.rotation.y), 0, Math.cos(o.rotation.y));
        this.fx.puff(p.clone().addScaledVector(back, 1.6).setY(p.y + 1.3), { color: 0x2c2824, size: .35, grow: 3, life: 1.6, opacity: .45,
          vel: new THREE.Vector3(r() * .3 + .3, 1.6 + Math.random(), r() * .3) });
      }
      if (t.immuneFor > 0 && (t.immuneFor -= dt) <= 0) t.target.immune = false;
      if (t.releaseIn > 0 && (t.releaseIn -= dt) <= 0) this.activate(t); // (a garage tank, a moment after the blast)
      if (t.state === 'wait') {
        if (!t.trigger || !player.enabled || !cam.inPlayWindow(t.trigger, 1.25)) continue; // e.g. the boat is about to come into view
        this.activate(t);
      }
      if (t.state !== 'drive') continue;
      const dx = player.position.x - p.x, dz = player.position.z - p.z, dist = Math.hypot(dx, dz);
      if (dist > IDLE_DIST && !t.route) continue; // (far from the jeep: the tank stays where it is: no route finding, no driving)
      // (it fires on the move: the turret tracks the jeep whatever the hull is doing)
      // Close in until the jeep is within ENGAGE, then hold that distance: every few seconds shift a
      // few metres sideways (across the line to the jeep), backing up rather than turning round when
      // the spot is behind it, and reverse away if the jeep gets too close.
      // (off screen it can't fire, so it keeps closing in until the whole hull is well inside the view:
      // stricter than EnemyFire's own tests, incl. the reinforcements' 'wholly in view' rule)
      const c = Math.cos(o.rotation.y), sn = Math.sin(o.rotation.y);
      const _s0 = performance.now(); const seen = [[1, 1], [1, -1], [-1, 1], [-1, -1]].every(([u, v]) =>
        cam.inPlayWindow(new THREE.Vector3(p.x - sn * u * t.hl + c * v * t.hw, 1, p.z - c * u * t.hl - sn * v * t.hw), .86));
      TT.seen += performance.now() - _s0; TT.driving++;
      if ((t.losIn = (t.losIn ?? 0) - dt) <= 0) { t.losIn = LOS_EVERY; t.losFor = this.lineClear(p, player.position, t.flameTank) ? (t.losFor ?? 0) + LOS_EVERY : 0; }
      const los = (t.losFor ?? 0) >= LOS_HOLD;
      if (dist > ENGAGE + ENGAGE_SLACK || !seen || !los) t.closing = true;
      else if (dist < ENGAGE) t.closing = false;
      if (t.flameTank) t.closing = dist > (t.closing ? FLAME.hold : FLAME.hold + 1.5) || !los; // (the flame tank wants to be close: it runs up to the jeep and stops there)
      const free = !player.dead;
      let goal = null, reverse = false;
      if (free && t.closing) { goal = player.position; t.shift = null; }
      else if (free && dist < (t.flameTank ? FLAME.back : STAND)) { reverse = true; t.shift = null; } // too close: back away, nose still toward the jeep
      else if (free && !t.flameTank) {
        const every = t.arena ? ARENA_SHIFT.every : SHIFT_EVERY, far = t.arena ? ARENA_SHIFT.dist : SHIFT_DIST;
        if (t.shift && ((t.shift.time -= dt) <= 0 || Math.hypot(t.shift.x - p.x, t.shift.z - p.z) < 1)) { t.shift = null; t.shiftIn = every[0] + Math.random() * (every[1] - every[0]); }
        if (!t.shift && (t.shiftIn = (t.shiftIn ?? (t.arena ? .3 : 1.5)) - dt) <= 0) { // pick a spot to one side (angled a little toward or away from the jeep), still in range and on screen
          const sides = Math.random() < .5 ? [1, -1, 1, -1] : [-1, 1, -1, 1];
          for (const sd of sides) {
            const a = Math.atan2(dx, dz) + sd * (Math.PI / 2 + (Math.random() - .5) * 1.1), d = far[0] + Math.random() * (far[1] - far[0]);
            const x = p.x + Math.sin(a) * d, z = p.z + Math.cos(a) * d;
            const left = Math.hypot(player.position.x - x, player.position.z - z);
            if (left > STAND + 1 && left < ENGAGE + 2 && cam.inPlayWindow(new THREE.Vector3(x, 1, z), .9) && !this.blocked(t, x, z, o.rotation.y)) { t.shift = { x, z, time: SHIFT_TIME }; break; }
          }
          if (!t.shift) t.shiftIn = t.arena ? .3 : 1; // nowhere to go: try again shortly
        }
        if (t.shift) goal = new THREE.Vector3(t.shift.x, 0, t.shift.z);
      }
      if (t.route) { // up the summit road: the road's points a few metres ahead (the route finder takes it round the bends), whatever the jeep does, until it is up on the plateau
        const R = t.route; while (t.ri < R.length - 1 && Math.hypot(R[t.ri][0] - p.x, R[t.ri][1] - p.z) < 6) t.ri++;
        if (t.ri >= R.length - 6) t.route = null; else { const q = R[Math.min(R.length - 1, t.ri + 3)]; t.routeGoal.set(q[0], 0, q[1]); goal = t.routeGoal; reverse = false; t.closing = true; t.shift = null; }
      }
      if (t.backUp > 0) { t.backUp -= dt; goal = null; reverse = true; } // wedged: backing up before trying again
      if (t.script) { // rolling out of the garage: straight ahead to a point clear of the door, whatever the jeep does (the turret is free all the while: it is driven by the gun list, not by this)
        if (Math.hypot(p.x - t.script.goal.x, p.z - t.script.goal.z) < 1) t.script = null;
        else { goal = t.script.goal; reverse = false; t.closing = true; t.shift = null; t.backUp = 0; }
      }
      if (t.flameTank && t.fl.st !== 'idle') { goal = null; reverse = false; } // (it stands still to light up and to burn)
      const go = !!goal, aimAt = goal && !t.closing ? goal : goal ? this.steerTo(t, goal, dt) : null;
      let want = aimAt ? Math.atan2(-(aimAt.x - p.x), -(aimAt.z - p.z)) : o.rotation.y;
      if (goal && !t.closing) { // a short move: drive backwards if the spot is behind, rather than turning round
        let e = want - o.rotation.y; e = Math.atan2(Math.sin(e), Math.cos(e));
        if (Math.abs(e) > Math.PI / 2) { reverse = true; want += Math.PI; }
      }
      if (go && !reverse) { // steer round anything not planned for (other tanks): straight on first, then wider and wider
        for (const off of [0, .5, -.5, 1, -1, 1.6, -1.6, 2.4, -2.4]) {
          const a = want + off;
          if (!this.blocked(t, p.x - Math.sin(a) * 2.5, p.z - Math.cos(a) * 2.5, a)) { want = a; break; }
        }
      }
      let err = want - o.rotation.y; err = Math.atan2(Math.sin(err), Math.cos(err));
      let turned = false;
      if (go) { // the hull turns only to drive: stopped, just the turret tracks the jeep
        const yaw = o.rotation.y + Math.sign(err) * Math.min(Math.abs(err), TURN * dt);
        if (t.wedged >= 3 || !this.blocked(t, p.x, p.z, yaw) || this.world.blockedRect(p.x, p.z, o.rotation.y, t.hl - TOLERANCE, t.hw - TOLERANCE, false, true)) { turned = yaw !== o.rotation.y; o.rotation.y = yaw; } // not swinging into another tank (already against a wall: let it turn free)
        err = want - o.rotation.y; err = Math.atan2(Math.sin(err), Math.cos(err));
      }
      let moved = 0;
      if ((go || reverse) && Math.abs(err) < .6) {
        const dir = reverse ? -1 : 1, step = SPEED * (t.flameTank ? 1.15 : 1) * (this.world.speedAt?.(p.x, p.z) ?? 1) * (reverse ? .6 : 1) * dt * (1 - Math.abs(err) / .6 * .6); // (half speed in stage 4's swamp)
        const nx = p.x - Math.sin(o.rotation.y) * step * dir, nz = p.z - Math.cos(o.rotation.y) * step * dir;
        if (!this.blocked(t, nx, nz, o.rotation.y)) { p.x = nx; p.z = nz; moved = step * dir; if (this.world.swampAt?.(p.x, p.z) && (t.wadeIn = (t.wadeIn ?? 0) - dt) <= 0) { t.wadeIn = .16; this.world.ripple(p, 1.25, { x: -Math.sin(o.rotation.y) * dir, z: -Math.cos(o.rotation.y) * dir }); } } // (and rings spread from its tracks: the half ahead)
        else if (t.shift) t.shift.time = 0; // blocked: give this move up
      }
      // no headway while trying to drive: back up a little, then plan afresh
      if (go && !reverse && !moved && (Math.abs(err) < .6 || !turned)) { // (or can't even turn: hemmed in by another tank)
        if ((t.stuckFor = (t.stuckFor ?? 0) + dt) > STUCK) { t.stuckFor = 0; t.backUp = BACK_UP; t.path = null; t.wedged = (t.wedged ?? 0) + 1; t.freeRun = 0; }
      } else if (moved) { t.stuckFor = 0; if ((t.freeRun = (t.freeRun ?? 0) + Math.abs(moved)) > 4) t.wedged = 0; } // (a few metres of free driving: no longer jammed)
      if (moved) {
        t.treads.offset.y += moved / .7; // (backwards when reversing)
        { const gt = this.world.groundTrail; if (gt) { gt.wheels(p, o.rotation.y, t.hl, t.hw, t.hw * .55, true, t, 0, t.hw - .45, true); } } // (the secret level: the tracks the treads leave in the snow, with their own memory of the path per tank)
        if ((t.dustIn -= dt) <= 0) { // dust kicked up behind the tracks (at the end the tank is moving away from)
          t.dustIn = .12;
          const back = new THREE.Vector3(Math.sin(o.rotation.y), 0, Math.cos(o.rotation.y)).multiplyScalar(moved < 0 ? -1 : 1), side = new THREE.Vector3(back.z, 0, -back.x); // (`back`: the end it is moving away from: its rear when driving, its front when reversing)
          const mud = !!this.world.swampAt?.(p.x, p.z); // in the swamp the tracks throw up a little dark mud spray, not dust, and no smoke trails behind
          for (const s of [-1, 1]) this.fx.puff(p.clone().addScaledVector(back, t.hl).addScaledVector(side, s * (t.hw - .3)).setY(Math.max(p.y, 0) + .3),
            mud ? { color: 0x4d5a30, size: .2, grow: 1.6, life: .6, opacity: .55, gravity: 6, vel: back.clone().multiplyScalar(.6).setY(1.4 + Math.random()) } : { color: 0xc8925a, size: .35, grow: 2.5, life: .9, opacity: .35, vel: back.clone().multiplyScalar(.8).setY(.6) });
        }
      }
      o.position.y = this.groundY(p.x, p.z) - .2 * (this.world.mudK?.(p.x, p.z) ?? 0) + (moved ? Math.sin(performance.now() * .03) * .015 : 0); // on the drawn ground (up stage 2's ramps), with engine judder
      if (this.world.snowBumps && this.world.heightAt) { // (the secret level's slopes: the hull leans to the ground, nose up on a climb, down on a descent, and rolls across a camber; its position is left alone)
        const yw = o.rotation.y, fx = -Math.sin(yw), fz = -Math.cos(yw), rx = Math.cos(yw), rz = -Math.sin(yw), L = t.hl * .75, Wd = t.hw * .7, hg = this.world.heightAt, hF = hg(p.x + fx * L, p.z + fz * L), hB = hg(p.x - fx * L, p.z - fz * L), hR = hg(p.x + rx * Wd, p.z + rz * Wd), hL = hg(p.x - rx * Wd, p.z - rz * Wd);
        const tp = Math.max(-.6, Math.min(.6, Math.atan2(hF - hB, 2 * L))), tr = Math.max(-.4, Math.min(.4, Math.atan2(hR - hL, 2 * Wd))), k = t.slopeP === undefined ? 1 : Math.min(1, dt * 7);
        t.slopeP = (t.slopeP ?? 0) + (tp - (t.slopeP ?? 0)) * k; t.slopeR = (t.slopeR ?? 0) + (tr - (t.slopeR ?? 0)) * k; o.rotation.order = 'YXZ'; o.rotation.x = t.slopeP; o.rotation.z = t.slopeR;
      }
      if (!moved && this.world.swampAt?.(p.x, p.z) && (t.idleRing = (t.idleRing ?? Math.random()) - dt) <= 0) { t.idleRing = .55 + Math.random() * .5; this.world.ripple(_idle.set(p.x + (Math.random() - .5) * t.hw * 1.6, 0, p.z + (Math.random() - .5) * t.hl * 1.6), .35); } // (idling: the engine's vibration sends a faint ring out now and then)
      t.target.x = p.x; t.target.z = p.z;
      if (t.flameTank) this.flameUpdate(t, dt, player, dist, los, onCrush);
      // running into it (or it into you) destroys the jeep
      if (player.enabled && !player.dead && !player.invulnerable
        && rectsOverlap({ x: p.x, z: p.z, yaw: o.rotation.y, hl: t.hl, hw: t.hw },
          { x: player.position.x, z: player.position.z, yaw: player.yaw, hl: HALF_LEN, hw: HALF_WID })) onCrush();
    }
  }

  // The flame tank: the turret follows the jeep; in range and lined up it flares its pilot flames, then burns: a jet from each nozzle, which the jeep must not stay in; then it rests.
  flameUpdate(t, dt, player, dist, los, onCrush) {
    const o = t.obj, p = o.position, fl = t.fl, free = player.enabled && !player.dead, time = performance.now() / 1000;
    if (free) { // the turret swings round after the jeep (slowly while it burns, so a jeep that keeps moving can get out of the jet)
      const want = Math.atan2(-(player.position.x - p.x), -(player.position.z - p.z)) - o.rotation.y; let d = want - t.top.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d));
      t.top.rotation.y += Math.sign(d) * Math.min(Math.abs(d), (fl.st === 'burn' ? FLAME.sweep : FLAME.turn) * dt); fl.err = Math.abs(d);
    }
    t.top.updateMatrixWorld(true); t.top.getWorldDirection(_fw); _fw.negate().setY(0).normalize(); // (where the nozzles point)
    const muzzles = t.jets.map(j => j.parent.getWorldPosition(new THREE.Vector3()));
    if (fl.st === 'idle') {
      fl.cool -= dt;
      if (free && los && dist < FLAME.start && fl.err < .3 && fl.cool <= 0) { fl.st = 'warn'; fl.t = FLAME.warn; sfx.flameIgnite?.(muzzles[0]); }
    } else if (fl.st === 'warn') {
      fl.t -= dt;
      if (!free) fl.st = 'idle'; else if (fl.t <= 0) { fl.st = 'burn'; fl.t = FLAME.burn; fl.age = 0; fl.hit = 0; sfx.flameBurst?.(muzzles[0], FLAME.burn); this.fx.cannonLight?.(muzzles[0].clone().addScaledVector(_fw, 1.5), _fw); }
    } else if (fl.st === 'burn') {
      fl.age += dt; fl.t -= dt;
      if (fl.t <= 0 || !free) { fl.st = 'idle'; fl.cool = FLAME.cool[0] + Math.random() * (FLAME.cool[1] - FLAME.cool[0]); }
    }
    const burning = fl.st === 'burn', ext = burning ? Math.min(1, fl.age / .07) * Math.min(1, fl.t / .1) : 0;
    let reach = FLAME.len; // the jet stops at the first wall, building or crate in its way: it neither shows through them nor burns what is behind them
    if (burning) for (let s = .6; s <= FLAME.len; s += .6) if (this.world.flameBlocked(muzzles[0].x + _fw.x * s, muzzles[0].z + _fw.z * s)) { reach = Math.max(.3, s - .3); break; }
    const len = Math.min(FLAME.len * ext, reach);
    t.jets.forEach((j, i) => {
      // (the shader's noise hashes the time: left to grow over a long session it loses its precision and the flame goes blank, so it is kept small)
      j.visible = ext > 0; for (const c of j.children) { const mt = c.material; mt.uniforms.uTime.value = time % 120; mt.uniforms.uAmt.value = ext; }
      j.scale.set(1, 1, Math.max(.01, len / o.scale.x));
    });
    t.pilots.forEach(pl => pl.scale.setScalar(fl.st === 'warn' ? 2.4 + Math.sin(time * 40) * .6 : 1));
    if (burning || fl.st === 'warn') { // the fire lights the ground, the hulls and the jeep round it (the spare missile-exhaust light: one light, so the light count never changes), flickering
      const mid = _mw.copy(muzzles[0]).add(muzzles[1]).multiplyScalar(.5).addScaledVector(_fw, burning ? len * .45 : .5); mid.y = p.y + 1.7;
      this.fx.exhaust?.(mid, burning ? 8.5 * ext : 2.2 + Math.sin(time * 35) * .8);
    }
    if (burning && (fl.sparkIn = (fl.sparkIn ?? 0) - dt) <= 0) { // embers flung up and out of the jets
      fl.sparkIn = .045;
      for (const m of muzzles) this.fx.puff(m.clone().addScaledVector(_fw, Math.random() * len).setY(p.y + 1.3), { color: Math.random() < .5 ? 0xffe090 : 0xff9a40, size: .07 + Math.random() * .06, grow: 0, life: .5 + Math.random() * .5, opacity: 1, additive: true, gravity: 5, vel: new THREE.Vector3(r() * 2.4, 1.5 + Math.random() * 2.5, r() * 2.4).addScaledVector(_fw, 2 + Math.random() * 3) });
    }
    if ((fl.puffIn -= dt) <= 0 && (burning || fl.st === 'warn')) { // sparks, fire and dark smoke along the jets, and a flare at the nozzles while it lights
      fl.puffIn = burning ? .035 : .09;
      muzzles.forEach(m => {
        const k = burning ? Math.pow(Math.random(), .7) : 0, at = m.clone().addScaledVector(_fw, burning ? k * len : .3).setY(p.y + 1.3 + Math.random() * .2);
        // soft glowing blobs: white-yellow at the nozzle, through orange, to dark red at the tip, widening and rising as they go
        const col = !burning ? 0xff8a30 : k < .25 ? 0xfff0b0 : k < .55 ? 0xffc050 : k < .8 ? 0xff7a20 : 0xc83a10;
        this.fx.puff(at, { color: col, size: burning ? .35 + k * .5 : .22, grow: burning ? 1.8 : 1.2, life: burning ? .3 + k * .15 : .22, opacity: burning ? .7 : .8, additive: true, soft: true, vel: new THREE.Vector3(r() * .5, .6 + k * 1.6, r() * .5).addScaledVector(_fw, burning ? 3 : 0) });
        if (burning && Math.random() < .3) this.fx.puff(at.clone().setY(at.y + .3 + k), { color: 0x2a2724, size: .5, grow: 2.2, life: 1.0, opacity: .4, soft: true, vel: new THREE.Vector3(r() * .5, 1.5, r() * .5) });
      });
    }
    if (burning && ext > .5 && free && !player.invulnerable) { // the jeep in either jet (a jet is a narrow cone: wider with distance, plus the jeep's own width)
      let inside = false;
      for (const m of muzzles) {
        const rx = player.position.x - m.x, rz = player.position.z - m.z, along = rx * _fw.x + rz * _fw.z, side = Math.abs(rx * _fw.z - rz * _fw.x);
        if (along > 0 && along < len && side < .12 + FLAME.rad * (along / FLAME.len) + HALF_WID * .75) inside = true;
      }
      fl.hit = inside ? fl.hit + dt : Math.max(0, fl.hit - dt * 2);
      if (fl.hit > FLAME.kill) onCrush();
    } else fl.hit = 0;
  }

  // Saved games: every tank except the arena's (the boss fight starts afresh): state, place, armour.
  snapshot() {
    const r = v => Math.round(v * 100) / 100;
    return this.tanks.filter(t => !t.arena).map(t => ({ st: t.state, x: r(t.obj.position.x), z: r(t.obj.position.z), yaw: r(t.obj.rotation.y), hp: t.target.hp }));
  }
  restore(data) {
    const mine = this.tanks.filter(t => !t.arena);
    (data ?? []).forEach((d, i) => {
      const t = mine[i];
      if (!t || d.st === 'wait') return;
      if (d.st === 'dead') { // its wreckage lies scattered where it was knocked out
        t.obj.position.set(d.x, this.groundY(d.x, d.z), d.z); t.obj.rotation.y = d.yaw; t.target.hp = 0;
        const quiet = quietEffects(this.scene, this.fx, this.world.heightAt, (x, z) => this.world.tileAt(x, z) === '~'), keep = [this.fx, this.debris];
        [this.fx, this.debris] = [quiet.fx, quiet.debris];
        this.wreck(t);
        [this.fx, this.debris] = keep; quiet.finish();
        return;
      }
      this.activate(t);
      t.obj.position.set(d.x, this.groundY(d.x, d.z), d.z); t.obj.rotation.y = d.yaw; t.target.x = d.x; t.target.z = d.z; t.target.hp = d.hp;
      if (d.hp <= t.maxHp / 2 && d.hp < t.maxHp) { t.damaged = true; this.unproxy(t); (t.flameTank ? damageFlameTank : damageTank)(t.obj); }
    });
  }

  // The flame tank's fuel tanks go up: a rolling fireball, hull and turret torn into burning shards, burning fuel thrown out.
  fuelBlast(at, yaw) {
    const fx = this.fx, c = at.clone().setY(at.y + 1.2), orange = new THREE.MeshStandardMaterial({ color: 0xc8581a, roughness: .6, metalness: .3, flatShading: true, emissive: 0x401400 });
    this.debris.keeping = true;
    for (let i = 0; i < 16; i++) { // turret and hull plates, flung hard in every direction
      const g = new THREE.Mesh(shardGeometry(.4 + Math.random() * .9, .08, .4 + Math.random() * .8), i % 3 ? orange : new THREE.MeshStandardMaterial({ color: 0x2a2724, roughness: .9, flatShading: true }));
      g.castShadow = true; g.position.copy(c).add(new THREE.Vector3(r() * 1.2, r() * .8, r() * 1.8)); g.rotation.set(r() * 3, yaw + r(), r() * 3); this.scene.add(g);
      const a = Math.random() * Math.PI * 2, v = 6 + Math.random() * 9;
      this.debris.launch(g, new THREE.Vector3(Math.cos(a) * v, 7 + Math.random() * 10, Math.sin(a) * v), new THREE.Vector3(r() * 14, r() * 14, r() * 14), .05);
    }
    for (let i = 0; i < 14; i++) this.debris.chunk(c.clone(), orange, .1 + Math.random() * .25, 5);
    this.debris.keeping = false;
    fx.explosion(c, 2.2, true);
    for (let i = 0; i < 2; i++) fx.explosion(c.clone().add(new THREE.Vector3(r() * 1.8, r() * .5, r() * 1.8)), 1.3);
    this.fx.fires?.start([-1.2, -.4, .4, 1.2].map(d => at.clone().add(new THREE.Vector3(d * Math.cos(yaw) + r() * .45, .3, -d * Math.sin(yaw) + r() * .65))), .8, 10); // the wreck burns on (the burning-house flames), scattered
    for (let i = 0; i < 16; i++) { // the fireball: big soft additive blobs rolling up and out, yellow-white at the core to dark red at the edge
      const k = Math.random();
      fx.puff(c.clone().add(new THREE.Vector3(r() * 1.2, r() * .6, r() * 1.2)), { color: k < .3 ? 0xfff0b0 : k < .65 ? 0xffa030 : 0xd04a14, size: .9 + Math.random() * .7, grow: 1.7, life: .5 + Math.random() * .4, opacity: .85, additive: true, soft: true,
        vel: new THREE.Vector3(r() * 3, 1.5 + Math.random() * 3.5, r() * 3) });
    }
    for (let i = 0; i < 12; i++) fx.puff(c.clone(), { color: 0xff9a30, size: .25, grow: 0, life: .7 + Math.random() * .6, opacity: 1, additive: true, gravity: 9, vel: new THREE.Vector3(r() * 9, 5 + Math.random() * 8, r() * 9) }); // burning fuel
    for (let i = 0; i < 8; i++) fx.puff(c.clone().setY(c.y + .8), { color: 0x1c1a18, size: 1.2, grow: 3, life: 2 + Math.random(), opacity: .6, soft: true, vel: new THREE.Vector3(r() * 2.5, 3 + Math.random() * 3, r() * 2.5) });
  }

  // Knocked out: the tank is blown apart. The turret is flung high, hull plates, track links and
  // road wheels are scattered about, and nothing is left standing in the way.
  wreck(t) {
    this.unproxy(t); // (an unmanned tank drawn as part of the merged set goes back to its own parts first)
    if (t.inert) for (const o of this.world.obstacles) if (o.kind === 'blocker' && Math.abs(o.x - t.obj.position.x) < 1.5 && Math.abs(o.z - t.obj.position.z) < 1.5) o.alive = false; // (the invisible block the level put under an unmanned tank goes with it)
    const o = t.obj, at = o.position.clone(), yaw = o.rotation.y;
    t.state = 'dead'; t.jets?.forEach(j => j.parent?.remove(j)); if (t.fl) t.fl.st = 'dead'; // (a flame tank's jets go out with it)
    const bury = !!t.gun?.mob && !this.keepWrecks; // (one of the light tanks that keep coming in stage 2's boss fight: its wreckage sinks away)
    if (bury) { this.debris.burying = true; this.debris.fast = !!t.gun?.fastBury; } // (fastBury: the airbase's garage vehicles: sink away quickly)
    this.debris.keeping = true; // (everything a tank throws off is kept when the pool overflows: see Debris.launch)
    const top = t.top, wp = new THREE.Vector3(), wq = new THREE.Quaternion();
    top.getWorldPosition(wp); top.getWorldQuaternion(wq);
    top.parent.remove(top);
    if (!t.flameTank) { // (the flame tank's fuel goes up with it: the turret is torn apart below, nothing is flung whole)
      this.scene.add(top); top.position.copy(wp); top.quaternion.copy(wq); top.scale.multiplyScalar(o.scale.x); // (keeps the light tank's size)
      top.traverse(m => { if (m.isMesh) { m.material = m.material.clone(); m.material.color.multiplyScalar(.55); } });
      this.debris.launch(top, new THREE.Vector3(r() * 4, 11 + Math.random() * 3, r() * 4), new THREE.Vector3(r() * 8, r() * 6, r() * 8), .15, true);
    }
    this.scene.remove(o);
    const plate = new THREE.MeshStandardMaterial({ color: 0x5a3e28, roughness: .85, metalness: .3, flatShading: true });
    const track = new THREE.MeshStandardMaterial({ color: 0x34312c, roughness: .9, metalness: .3, flatShading: true });
    const piece = (geo, m, y, speed, up) => {
      const g = new THREE.Mesh(geo, m); g.castShadow = true;
      g.position.copy(at).add(new THREE.Vector3(r() * 1.2, y, r() * 1.8)); g.rotation.set(r() * 3, yaw + r(), r() * 3); this.scene.add(g);
      const a = Math.random() * Math.PI * 2, v = speed * (.5 + Math.random() * .7);
      this.debris.launch(g, new THREE.Vector3(Math.cos(a) * v, up * (.6 + Math.random() * .7), Math.sin(a) * v), new THREE.Vector3(r() * 12, r() * 12, r() * 12), .05);
    };
    for (let i = 0; i < 7; i++) piece(shardGeometry(.5 + Math.random() * .9, .08, .4 + Math.random() * .7), plate, .9, 7, 9);   // hull plates
    for (let i = 0; i < 6; i++) piece(new THREE.BoxGeometry(.5, .05, .25 + Math.random() * .5), track, .4, 6, 6);                     // track links
    for (let i = 0; i < 4; i++) piece(new THREE.CylinderGeometry(.3, .3, .1, 10), track, .4, 8, 8);                                     // road wheels
    for (let i = 0; i < 8; i++) this.debris.chunk(at.clone().setY(at.y + 1), plate, .1 + Math.random() * .2, 3);
    if (bury) { this.debris.burying = false; this.debris.fast = false; }
    this.debris.keeping = false;
    if (t.flameTank) this.fuelBlast(at, yaw);
    else this.fx.explosion(at.clone().setY(at.y + 1), 1.6);
    this.fx.smoke(at.clone().setY(at.y + .6), t.flameTank ? 12 : 8); // (no scorch mark: just the wreckage lying about)
  }
}
