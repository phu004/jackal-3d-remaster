// Stage 4's hidden missile launchers (NES): three in the middle of the mud ponds. There is nothing to see of one but the water itself: a spot that never stops stirring, sending rings
// across the surface and letting out bubbles, a hint that something is wrong there. When the jeep comes within range and on screen it works itself up (the rings come harder and
// faster, the bubbling grows frantic: the warning, for a second or so), then a missile bursts out of the mud, climbs straight up about 10 m and homes on the jeep (the same missile
// as the stage 2 bosses' and the submarines': Statues.shoot, with a thin, faint trail). It reloads and fires again while the jeep stays in range.
// Machine-gun bullets do nothing to it; a grenade, a rocket or any other blast destroys it (a geyser of mud and a wave). Its missile can be shot down once it has left the mud.
import * as THREE from 'three';
import { sfx } from './sfx.js';
import { BOSS_MISSILE_FLIGHT } from './statues.js';
import { shardGeometry } from './debris.js';
import { buildMissile } from '../assets/submarine.js';

const RANGE = 34;               // m: it fires with the jeep this near (and on screen)
const FIRST = [.6, 1.3], RELOAD = [3.6, 5]; // s: after the jeep comes in range, and between launches
const WARN = 1.1, RECOVER = .7; // s: the build-up before a launch, and the settling after it
const CLIMB = 10;               // m: straight up before it turns toward the jeep
const SPEED_K = .72, CLIMB_K = 1.35; // its missile's flight speed as a share of the stage 2 bosses' (.72), and its climb out of the mud (a quick, 1.35: about 12 m/s)
const AIM_DELAY = .5;           // s: it homes on where the jeep was this long ago
const DRY_WARN = 1.5;           // s: a hatch cell's build-up: the lid swings open, the missile rises, then it fires
const HP = 4, SCORE = 800;      // one grenade or rocket (like a turret); score for it
const SPREAD = 1.7;             // m: how far from its middle the bubbles break
const HIT = 1.5;                // m: half-width of its hit box
const rand = ([a, b]) => a + Math.random() * (b - a);
const _p = new THREE.Vector3(), _a = new THREE.Vector3();

export class MudLaunchers {
  // statues: the Statues manager (its missile flight is used, and its enemyFire for the jeep's track).
  constructor(scene, fx, statues, debris) {
    this.scene = scene; this.fx = fx; this.statues = statues; this.debris = debris; this.list = []; this.time = 0;
    this.metal = new THREE.MeshStandardMaterial({ color: 0x4a4d4a, roughness: .55, metalness: .5, flatShading: true });
    this.rust = new THREE.MeshStandardMaterial({ color: 0x6a3a1c, roughness: .8, metalness: .3, flatShading: true });
    this.mud = new THREE.MeshStandardMaterial({ color: 0x4a3a22, roughness: 1, flatShading: true });
    const m = (c, rough, metal) => new THREE.MeshStandardMaterial({ color: c, roughness: rough, metalness: metal, flatShading: true });
    this.lidM = { lid: m(0x59616a, .55, .4), trim: m(0x8a9092, .5, .3), frame: m(0x2e3438, .7, .4), dark: m(0x1e2124, .7, .3), rail: m(0xa0a8aa, .5, .5) }; // (the warship's launcher-lid greys, a little dirtied by the mud)
    this.dryCount = 0; this.pending = []; // things set to happen a moment later: { t (s left), fn }
  }

  setup(world) {
    this.world = world;
    for (const spot of world.launcherSpots ?? []) {
      const group = new THREE.Group(); group.position.set(spot.x, 0, spot.z); this.scene.add(group); // (nothing drawn: only the target's stand-in)
      const l = { x: spot.x, z: spot.z, dry: !!spot.dry, group, state: 'idle', t: 0, reload: null, agit: .15, bubbleIn: Math.random(), rippleIn: Math.random() * .4, dead: false };
      l.target = { object: group, x: spot.x, z: spot.z, hw: HIT, hd: HIT, r: HIT + .3, hp: HP, score: SCORE, bulletProof: !l.dry, die: () => this.destroy(l) }; // (bullets stop at it but do nothing; a blast kills it)
      if (l.dry) { this.buildCell(l); l.target.immune = true; }
      world.targets.push(l.target);
      world.turrets.push({ top: new THREE.Group(), base: group, target: l.target, range: 0 }); // (counts toward the kill rate; it fires its own way: a stand-in `top`, as for the submarines)
      this.list.push(l);
    }
  }

  update(dt, world, player, cam) {
    this.time += dt;
    for (let i = this.pending.length - 1; i >= 0; i--) { const e = this.pending[i]; if ((e.t -= dt) <= 0) { this.pending.splice(i, 1); e.fn(); } }
    const canShoot = player.enabled && !player.dead;
    for (const l of this.list) {
      if (l.dead) continue;
      const jx = player.position.x - l.x, jz = player.position.z - l.z, near = Math.hypot(jx, jz) < 48;
      const ready = canShoot && Math.hypot(jx, jz) <= RANGE && cam.inPlayWindow(_p.set(l.x, 1.5, l.z), 1);
      if (l.state === 'idle') {
        l.agit += (.15 - l.agit) * Math.min(1, dt * 3);
        if (!ready) { if (l.reload !== null) l.reload = Math.max(0, l.reload - dt); }
        else { l.reload ??= rand(FIRST); if ((l.reload -= dt) <= 0) { l.state = 'warn'; l.t = 0; } }
      } else if (l.state === 'warn') { // working itself up: harder rings, frantic bubbling
        l.t += dt; l.agit += (1 - l.agit) * Math.min(1, dt * 6);
        if (l.dry) this.poseCell(l, l.t / DRY_WARN);
        if (l.t >= (l.dry ? DRY_WARN : WARN)) { if (canShoot) this.launch(l, world); l.state = 'recover'; l.t = 0; }
      } else if (l.state === 'recover') {
        l.t += dt; l.agit += (.5 - l.agit) * Math.min(1, dt * 3);
        if (l.dry) this.poseCell(l, 0, 1 - l.t / RECOVER); // (the lid swings shut)
        if (l.t >= RECOVER) { l.state = 'idle'; l.reload = rand(RELOAD); }
      }
      if (!near || l.dry) continue; // (a dry one, under a road: nothing stirs, nothing shows until it fires) (far from the jeep: it stirs too far away to matter)
      // forever stirring the water: a ring now and then from the spot, and bubbles breaking (more, the more worked up it is)
      if ((l.rippleIn -= dt) <= 0) { l.rippleIn = .5 - .3 * l.agit + Math.random() * .2; world.ripple?.({ x: l.x, z: l.z }, .55 + 1.1 * l.agit); }
      if ((l.bubbleIn -= dt) <= 0) {
        l.bubbleIn = (.5 - .38 * l.agit) * (.6 + Math.random() * .8);
        const a = Math.random() * 6.283, d = Math.random() * SPREAD, bx = l.x + Math.cos(a) * d, bz = l.z + Math.sin(a) * d;
        world.disturb?.(bx, bz, .8 + l.agit);
        for (let i = 0, n = 1 + Math.floor(Math.random() * 3); i < n; i++) this.fx.puff(_a.set(bx + (Math.random() - .5) * .5, .1, bz + (Math.random() - .5) * .5), { color: 0xcfc8a0, size: .1 + Math.random() * .08, grow: .7, life: .35 + Math.random() * .25, opacity: .7, vel: new THREE.Vector3(0, .18, 0) });
        if (Math.random() < .35) sfx.bubble({ x: bx, z: bz });
      }
    }
  }

  // The missile bursts out of the mud: mud thrown up, a big ring, then it climbs 10 m and homes on where the jeep was a moment ago.
  launch(l, world) {
    const from = new THREE.Vector3(l.x, l.dry ? 1.3 : .3, l.z), at = this.statues.enemyFire.aimAgo(AIM_DELAY, _a);
    this.statues.shoot(from, Math.atan2(-(at.x - l.x), -(at.z - l.z)), { x: at.x, z: at.z }, world, BOSS_MISSILE_FLIGHT, CLIMB, true, SPEED_K, CLIMB_K);
    if (l.dry) { if (l.rack) l.rack.visible = false; this.fx.puff(from, { color: 0xb8b8b4, size: 1.2, grow: 3, life: .9, opacity: .6, vel: new THREE.Vector3(0, 1.2, 0) }); } else this.mudBurst(l, 1);
  }

  mudBurst(l, size) {
    for (let i = 0; i < 8 * size; i++) { const a = Math.random() * 6.283, v = 1.5 + Math.random() * 2.5; this.fx.puff(_a.set(l.x, .2, l.z), { color: l.dry ? 0x6c6c6a : 0x5a4628, size: .5 + Math.random() * .5, grow: 2.2, life: .9 + Math.random() * .6, opacity: .65, gravity: 4, vel: new THREE.Vector3(Math.cos(a) * v, 2.5 + Math.random() * 2.5 * size, Math.sin(a) * v) }); }
    this.world.ripple?.({ x: l.x, z: l.z }, 1.8 * size); this.world.disturb?.(l.x, l.z, 2);
    sfx.mudBurst({ x: l.x, z: l.z });
  }

  // Blown up: a geyser of mud and water, a wave; it is gone for good (the water there goes still).
  destroy(l, quiet = false) {
    if (l.dead) return;
    l.dead = true; l.state = 'dead';
    const i = this.world.targets.indexOf(l.target); if (i >= 0) this.world.targets.splice(i, 1);
    if (l.dry) { l.lidPivots?.forEach(p => p.visible = false); if (l.rack) l.rack.visible = false; }
    if (l.dry) { l.hole?.set(l.x, l.z, 1.5, .8); this.burn(l); } // (a wrecked cell: the shaft is open, and it burns)
    if (quiet) return;
    this.mudBurst(l, 2.2);
    if (l.dry) this.fx.explosion(new THREE.Vector3(l.x, .8, l.z), 1.4); else this.fx.waterBlast(new THREE.Vector3(l.x, 0, l.z), 1.3);
    this.world.ripple?.({ x: l.x, z: l.z }, 2.6); sfx.explosion(.9, { x: l.x, z: l.z });
    this.debrisBurst(l);
    const at = new THREE.Vector3(l.x, 0, l.z), pos = { x: l.x, z: l.z }; // (the aftershocks: a second flash under the surface, then waves going out one after another)
    this.pending.push({ t: .12, fn: () => this.fx.explosion(at.clone().setY(.8), 1.3) }, { t: .35, fn: () => { this.world.ripple?.(pos, 2.2); this.fx.waterBlast(at, 1.1); } }, { t: .75, fn: () => this.world.ripple?.(pos, 1.5) }, { t: 1.3, fn: () => this.world.ripple?.(pos, 1) });
  }

  // A road-level launcher like the warship's missile cell (stage 6), as the NES draws it: a wide rectangle outlined in white on the road, with a pair of hatch leaves shut over a dark opening, painted and worn like the wet road
  // (the road's grey, a fine speckle and a wet sheen). Leaves open and the missile rises: see poseCell.
  roadMats() {
    if (this.roadM) return this.roadM;
    const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d');
    x.fillStyle = '#4c4e50'; x.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 1800; i++) { const v = 56 + Math.random() * 40 | 0; x.fillStyle = `rgba(${v},${v},${v - 3},${.18 + Math.random() * .3})`; x.fillRect(Math.random() * 128, Math.random() * 128, 1 + Math.random() * 2, 1 + Math.random() * 2); } // speckle, as the pavement's
    for (let i = 0; i < 14; i++) { x.fillStyle = `rgba(20,24,28,${.1 + Math.random() * .14})`; x.beginPath(); x.ellipse(Math.random() * 128, Math.random() * 128, 10 + Math.random() * 26, 6 + Math.random() * 14, Math.random() * 3, 0, 7); x.fill(); } // damp patches
    const tex = new THREE.CanvasTexture(c); tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
    const wet = (color, rough, map) => new THREE.MeshStandardMaterial({ color, map, roughness: rough, metalness: 0, envMapIntensity: .6, flatShading: true });
    return this.roadM = { slab: wet(0xd8dadc, .26, tex), frame: wet(0xd0d2d4, .34, tex), paint: wet(0x8c8b84, .3), dark: new THREE.MeshStandardMaterial({ color: 0x0c0e10, roughness: .5, metalness: .2 }), steel: wet(0x3c4044, .3), liner: new THREE.MeshStandardMaterial({ color: 0x24282b, roughness: .6, metalness: .45, flatShading: true }) };
  }

  // The hatch leaf's top, drawn in detail (seam side: `seam` is 'right' or 'left' of the picture): worn steel plate with a diamond tread, a stepped border, rivets, welded seams, hazard stripes along the middle seam,
  // a stencilled number, scratches, rust streaks and damp. Dark, to sit in the wet road. The same picture serves as a bump map for the tread and rivets.
  leafTexture(seam) {
    const W = 512, c = document.createElement('canvas'); c.width = c.height = W; const x = c.getContext('2d'), rnd = Math.random;
    const bump = document.createElement('canvas'); bump.width = bump.height = W; const b = bump.getContext('2d');
    x.fillStyle = '#44484b'; x.fillRect(0, 0, W, W); b.fillStyle = '#808080'; b.fillRect(0, 0, W, W);
    for (let i = 0; i < 9000; i++) { const v = 52 + rnd() * 40 | 0; x.fillStyle = `rgba(${v},${v + 2},${v + 4},${.2 + rnd() * .3})`; x.fillRect(rnd() * W, rnd() * W, 1 + rnd() * 2, 1 + rnd() * 2); } // grain
    x.save(); x.beginPath(); x.rect(30, 30, W - 60, W - 60); x.clip(); // diamond tread plate inside the border
    for (let gy = 0; gy < W; gy += 14) for (let gx = 0; gx < W; gx += 14) { const o = ((gy / 14) & 1) * 7, px = gx + o, py = gy; x.fillStyle = 'rgba(120,126,130,.32)'; x.beginPath(); x.ellipse(px, py, 5, 2, ((gx / 14 + gy / 14) & 1) ? .8 : -.8, 0, 7); x.fill(); b.fillStyle = 'rgba(255,255,255,.55)'; b.beginPath(); b.ellipse(px, py, 5, 2, ((gx / 14 + gy / 14) & 1) ? .8 : -.8, 0, 7); b.fill(); }
    x.restore();
    x.strokeStyle = 'rgba(14,16,18,.9)'; x.lineWidth = 5; x.strokeRect(18, 18, W - 36, W - 36); x.strokeStyle = 'rgba(150,154,156,.35)'; x.lineWidth = 2; x.strokeRect(24, 24, W - 48, W - 48); // stepped border
    b.strokeStyle = '#000'; b.lineWidth = 5; b.strokeRect(18, 18, W - 36, W - 36);
    const sx0 = seam === 'right' ? W - 78 : 14; // hazard stripes along the middle seam
    x.save(); x.beginPath(); x.rect(sx0, 40, 64, W - 80); x.clip(); x.fillStyle = 'rgba(26,28,30,.9)'; x.fillRect(sx0, 40, 64, W - 80); x.fillStyle = 'rgba(150,120,30,.78)';
    for (let k = -2; k < 20; k++) { x.beginPath(); x.moveTo(sx0, 40 + k * 44); x.lineTo(sx0 + 64, 40 + k * 44 - 40); x.lineTo(sx0 + 64, 40 + k * 44 - 8); x.lineTo(sx0, 40 + k * 44 + 32); x.fill(); } x.restore();
    for (const [rx, ry] of [[40, 40], [W - 40, 40], [40, W - 40], [W - 40, W - 40], [W / 2, 40], [W / 2, W - 40], [40, W / 2], [W - 40, W / 2]]) { // rivets
      x.fillStyle = 'rgba(10,12,14,.9)'; x.beginPath(); x.arc(rx + 1.5, ry + 1.5, 7, 0, 7); x.fill(); x.fillStyle = 'rgba(128,134,138,.9)'; x.beginPath(); x.arc(rx, ry, 6, 0, 7); x.fill(); x.fillStyle = 'rgba(200,206,210,.6)'; x.beginPath(); x.arc(rx - 2, ry - 2, 2.2, 0, 7); x.fill();
      b.fillStyle = '#fff'; b.beginPath(); b.arc(rx, ry, 7, 0, 7); b.fill(); }
    x.strokeStyle = 'rgba(16,18,20,.8)'; x.lineWidth = 3; for (const ly of [W * .34, W * .68]) { x.beginPath(); x.moveTo(30, ly); x.lineTo(W - 30, ly); x.stroke(); x.strokeStyle = 'rgba(160,164,166,.18)'; x.lineWidth = 2; x.beginPath(); x.moveTo(30, ly + 3); x.lineTo(W - 30, ly + 3); x.stroke(); x.strokeStyle = 'rgba(16,18,20,.8)'; x.lineWidth = 3; } // welded panel seams
    x.save(); x.translate(W * (seam === 'right' ? .42 : .58), W * .52); x.rotate(-Math.PI / 2); x.font = 'bold 54px monospace'; x.textAlign = 'center'; x.fillStyle = 'rgba(190,188,176,.55)'; x.fillText('VLS-0' + (1 + (rnd() * 3 | 0)), 0, 0); x.restore(); // stencil
    for (let i = 0; i < 40; i++) { x.strokeStyle = `rgba(${150 + rnd() * 60 | 0},${150 + rnd() * 60 | 0},${150 + rnd() * 60 | 0},${.08 + rnd() * .14})`; x.lineWidth = 1; x.beginPath(); const sx = rnd() * W, sy = rnd() * W, a = rnd() * 6.28, l = 14 + rnd() * 50; x.moveTo(sx, sy); x.lineTo(sx + Math.cos(a) * l, sy + Math.sin(a) * l); x.stroke(); } // scratches
    for (let i = 0; i < 16; i++) { const rx = 30 + rnd() * (W - 60), ry = 30 + rnd() * 120, g = x.createLinearGradient(0, ry, 0, ry + 90 + rnd() * 160); g.addColorStop(0, 'rgba(112,64,30,.32)'); g.addColorStop(1, 'rgba(112,64,30,0)'); x.fillStyle = g; x.fillRect(rx, ry, 5 + rnd() * 9, 250); } // rust streaks running down
    for (let i = 0; i < 12; i++) { x.fillStyle = `rgba(10,14,18,${.12 + rnd() * .14})`; x.beginPath(); x.ellipse(rnd() * W, rnd() * W, 20 + rnd() * 50, 10 + rnd() * 26, rnd() * 3, 0, 7); x.fill(); } // damp
    const map = new THREE.CanvasTexture(c); map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 8;
    const bumpMap = new THREE.CanvasTexture(bump); bumpMap.anisotropy = 4;
    return new THREE.MeshStandardMaterial({ color: 0xe0e2e4, map, bumpMap, bumpScale: 1.6, roughness: .3, metalness: .1, envMapIntensity: .6 });
  }

  buildCell(l) {
    const R = this.roadMats(), g = new THREE.Group(), HX = 1.5, HZ = .8, add = (geo, mat, x, y, z) => { const o = new THREE.Mesh(geo, mat); o.position.set(x, y, z); o.castShadow = o.receiveShadow = true; g.add(o); return o; };
    const B = (x, y, z) => new THREE.BoxGeometry(x, y, z);
    g.position.set(l.x, this.world.heightAt?.(l.x, l.z) ?? 0, l.z); this.scene.add(g);
    [-1, 1].forEach(e => { // the frame round the opening: concrete kerb, and the white line painted on it (the NES's outline)
      add(B(2 * HX + .6, .1, .3), R.frame, 0, .05, e * (HZ + .15)); add(B(.3, .1, 2 * HZ), R.frame, e * (HX + .15), .05, 0);
      add(B(2 * HX + .6, .012, .07), R.paint, 0, .106, e * (HZ + .2)).castShadow = false; add(B(.07, .012, 2 * HZ + .4), R.paint, e * (HX + .2), .106, 0).castShadow = false;
    });
    // the shaft: the road is not drawn over the opening while the leaves are open (world.vlsHoles, the camouflaged guns' trick), so these walls and the floor below show through
    const wall = (w, h, d, x, y, z) => add(B(w, h, d), R.liner, x, y, z).castShadow = false;
    [-1, 1].forEach(e => { wall(2 * HX, 2.7, .04, 0, -1.35, e * (HZ - .02)); wall(.04, 2.7, 2 * HZ, e * (HX - .02), -1.35, 0); [-.5, -1.2, -1.9].forEach(y => { wall(2 * HX - .08, .05, .08, 0, y, e * (HZ - .08)); wall(.08, .05, 2 * HZ - .2, e * (HX - .08), y, 0); }); }); // liner and ledges
    wall(2 * HX, .05, 2 * HZ, 0, -2.7, 0); // the floor
    [-1, 1].forEach(e => wall(.9, .12, .5, e * .9, -2.62, 0)); // machinery under the missile
    l.hole = this.world.vlsHoles?.value[this.dryCount++];
    const rack = new THREE.Group(); rack.position.y = -1.5; g.add(rack); // the missile, down under the road until the leaves are open
    const m = buildMissile(); m.scale.setScalar(1.6); m.rotation.x = Math.PI / 2; rack.add(m);
    const pivots = [-1, 1].map(sx => { // two leaves, hinged on the short outer edges
      const pv = new THREE.Group(); pv.position.set(sx * HX, .14, 0); g.add(pv);
      const leaf = (geo, mat, x, y, z) => { const o = new THREE.Mesh(geo, mat); o.position.set(x, y, z); o.castShadow = true; pv.add(o); return o; }, cx = -sx * HX / 2;
      leaf(B(HX, .09, 2 * HZ - .04), (this.leafM ??= [this.leafTexture('right'), this.leafTexture('left')])[sx < 0 ? 0 : 1], cx, 0, 0);
      leaf(B(HX - .04, .04, 2 * HZ - .08), R.dark, cx, -.06, 0).castShadow = false; // the dark underside
      leaf(B(.5, .04, .08), R.steel, cx + sx * .1, .06, 0); // a lifting handle near the middle seam
      leaf(new THREE.CylinderGeometry(.05, .05, 2 * HZ - .2, 8).rotateX(Math.PI / 2), R.steel, 0, .02, 0); // hinge barrel
      return pv;
    });
    Object.assign(l, { cell: g, rack, lidPivots: pivots });
  }

  // The wreck burns: flames up out of the open shaft, for good.
  burn(l) {
    const y = (this.world.heightAt?.(l.x, l.z) ?? 0) - .3;
    this.fx.fires?.start([new THREE.Vector3(l.x, y, l.z), new THREE.Vector3(l.x - .8, y, l.z), new THREE.Vector3(l.x + .8, y, l.z)], 1.5);
  }

  // open: 0 shut .. 1 lid wide and the missile up (the lid opens first, then the missile rises); lid: the lid's own share while closing again
  poseCell(l, open, lidK = open) {
    const sm = x => { x = Math.min(1, Math.max(0, x)); return x * x * (3 - 2 * x); };
    l.lidPivots[0].rotation.z = sm(lidK / .45) * 1.75; l.lidPivots[1].rotation.z = -sm(lidK / .45) * 1.75;
    l.hole?.set(l.x, l.z, lidK > .01 ? 1.5 : 0, .8);
    if (l.target) l.target.immune = sm(lidK / .45) < .35; // (invulnerable while the lid is shut, or not yet far enough open) // (the road gives way over the shaft while the leaves are open)
    l.rack.visible = true; l.rack.position.y = -1.5 + sm((open - .4) / .6) * 2.3; // (the missile rises up the middle between the open leaves)
  }

  // The hatch cover over the launcher: a square steel lid like the warship's missile cells' (assets/warship.js): a plate with a raised border (one plain panel, no cross ribs), a bolt at each corner, a lifting
  // lug on the far edge, a hinge barrel with brackets along the near one, and a dark underside; about 1.4 m across, the warship's own size.
  buildLid() {
    const g = new THREE.Group(), M = this.lidM, add = (geo, mat, x, y, z) => { const o = new THREE.Mesh(geo, mat); o.position.set(x, y, z); g.add(o); return o; };
    const B = (x, y, z) => new THREE.BoxGeometry(x, y, z);
    add(B(1.92, .07, 1.92), M.lid, 0, 0, 0);
    [-1, 1].forEach(e => { add(B(1.92, .045, .06), M.trim, 0, .055, e * .93); add(B(.06, .045, 1.8), M.trim, e * .93, .055, 0); }); // raised border
    [-1, 1].forEach(a => [-1, 1].forEach(b => add(new THREE.CylinderGeometry(.055, .055, .03, 8), M.dark, a * .66, .08, b * .66))); // corner bolts
    add(B(.14, .07, .4), M.rail, .76, .1, 0); // the lifting lug
    add(new THREE.CylinderGeometry(.075, .075, 1.9, 8).rotateX(Math.PI / 2), M.frame, -.96, .03, 0); // the hinge barrel
    [-.7, 0, .7].forEach(z => add(B(.2, .1, .14), M.dark, -1.02, .01, z)); // and its brackets
    add(B(1.8, .02, 1.8), M.dark, 0, -.05, 0); // the dark underside
    add(B(1.46, .016, 1.46), M.trim, 0, .045, 0); // and the lighter panel on top
    g.scale.setScalar(.75);
    return g;
  }

  // What was down there comes up, with force: the launcher's hatch cover blown clean out of the water, tumbling a dozen metres into the air; twisted plates and pipes of its hardware, bits of
  // missile and clods of mud thrown high after it; a column of water and mud, and a spray going up and coming down again. All of it falls back into the water with splashes and sinks.
  debrisBurst(l) {
    if (!this.debris) return;
    const r = () => (Math.random() - .5) * 2, at = new THREE.Vector3(l.x, .1, l.z);
    const fling = (obj, up, out, rest, spin = 12) => { // thrown up and outward, tumbling
      const a = Math.random() * 6.283, v = out * (.4 + Math.random() * .8);
      obj.position.copy(at).add(new THREE.Vector3(r() * .6, Math.random() * .4, r() * .6)); obj.traverse(o => { if (o.isMesh) o.castShadow = true; }); this.scene.add(obj);
      this.debris.launch(obj, new THREE.Vector3(Math.cos(a) * v, up * (.7 + Math.random() * .6), Math.sin(a) * v), new THREE.Vector3(r() * spin, r() * spin, r() * spin), rest);
    };
    const lid = this.buildLid(); lid.position.copy(at).setY(.2); this.scene.add(lid); // the hatch cover itself: the biggest piece, straight up, turning over slowly as it climbs
    this.debris.launch(lid, new THREE.Vector3(r() * 2, 25, r() * 2), new THREE.Vector3(3 + Math.random() * 2, r() * 2, 2 + Math.random() * 2), .1);
    for (let i = 0; i < 14; i++) fling(new THREE.Mesh(shardGeometry(.3 + Math.random() * .8, .06, .25 + Math.random() * .6), Math.random() < .35 ? this.rust : this.metal), 19, 8, .05); // torn plating
    for (let i = 0; i < 6; i++) { const len = .5 + Math.random() * .9; fling(new THREE.Mesh(new THREE.CylinderGeometry(.07, .07, len, 7).rotateZ(Math.PI / 2), Math.random() < .5 ? this.rust : this.metal), 17, 7, .08); } // pipes
    for (let i = 0; i < 4; i++) fling(new THREE.Mesh(new THREE.ConeGeometry(.12, .4, 6).rotateZ(Math.PI / 2), this.metal), 20, 6, .1); // bits of missile: nose cones
    for (let i = 0; i < 16; i++) this.debris.chunk(at.clone().setY(.3), this.mud, .12 + Math.random() * .35, 1.4); // clods of mud
    for (let i = 0; i < 7; i++) this.fx.puff(at.clone().setY(.4 + i * 1.3), { color: i % 2 ? 0xc8d0c0 : 0x8a7650, size: .8 + i * .22, grow: 2, life: 1.1 + i * .08, opacity: .55, vel: new THREE.Vector3(r() * .4, 7 + i * .6, r() * .4) }); // the column of water and mud
    for (let i = 0; i < 26; i++) { const a = Math.random() * 6.283, v = 1 + Math.random() * 3.5; this.fx.puff(at.clone().setY(.4), { color: i % 3 ? 0x5a4628 : 0xa8b4a0, size: .1 + Math.random() * .12, grow: .5, life: 1.6 + Math.random() * .9, opacity: .75, gravity: 14, vel: new THREE.Vector3(Math.cos(a) * v, 9 + Math.random() * 7, Math.sin(a) * v) }); } // the spray going up and coming down again
  }

  // Saved games: which are destroyed.
  snapshot() { return this.list.map(l => l.dead ? 1 : 0); }
  restore(d) { (d ?? []).forEach((dead, i) => { if (dead && this.list[i]) this.destroy(this.list[i], true); }); }
}
