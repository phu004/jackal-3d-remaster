// The stage 3 boss's warship. It lies off-screen in the sea at the top of the map until the boss arena shuts behind the jeep (arena.js);
// then it sails in from the west, bow first, and slows to a stop in the middle of the arena, rocking gently on the swell.
// While it comes in its two gun turrets fire at the jeep like the ordinary static turrets (they are entries in world.turrets, so EnemyFire
// aims and fires them: same range, bursts, reload and shells).
// What can be hurt: the two gun turrets and the four vertical launchers (each its own target). The rest of the hull is a solid obstacle
// that stops the player's grenades and rockets (they burst on it); bullets fly over it and hit the targets.
// When all six hurtable parts are destroyed the ship blows up and goes down by the stern, its bow left above the water (sinking, below), and the stage is won (arena.win).
// The launchers behave like the submarines' (submarines.js): while the jeep is within FIRE_RANGE and the cell is on screen, a lid swings open (the warning;
// it can be hurt only while it is open), the missile rises, and it launches like the boss statues' missile: straight up, then homing on where the jeep was half a
// second ago, flying as far as theirs. The lid closes, the cell reloads, and it goes again. Each of the four has its own clock.
import { uiScale } from './ui-scale.js';
import { tr, isZh } from './lang.js';
import * as THREE from 'three';
import { shardGeometry } from './debris.js';
import { buildWarship, poseVls } from '../assets/warship.js';
import { addToLayer, REFLECT, SHADOW_ONLY } from './layers.js';
import { dropTinyShadows, mergedModel, oneShadow, shadowTwin } from './optimize.js';
import { BOSS_MISSILE_FLIGHT } from './statues.js';

const SIZE = 1.1;        // how much bigger than modelled it is drawn (hit boxes and its wake follow)
const SPEED = 10;         // m/s while under way
const EASE = 22;          // m before the stopping place that it starts to slow
const HALF_LEN = 20.7 * .99 * SIZE; // m: bow and stern, for its wake (the ship is 43.6 m long: the model's 44 m drawn .99 times over, see assets/warship.js)
const RIPPLE_EVERY = .22; // s between the ripples it leaves
const DRAFT = -1.1;       // m: sits this much lower in the water than modelled
const HULL = { hw: 21 * .99 * SIZE, hd: 2.8 * .99 * SIZE }; // the hull's solid box (seen from above, the ship lying east-west)
const BOX_W = 124, BOX_H = 36; // px: the tactical readout boxes
const HUD_OFFSET = [[44, -72], [-44, -72], [-34, -72], [-14, 80], [-34, -72], [-14, 80]]; // px, from a part's spot on the screen to its box's anchor (above: dy < 0, the box's bottom edge; below: its top edge): forward gun, aft gun, then launchers 1-4 (1 and 3 on the port side, the upper one on the screen)
const GUN_RECOIL = 1.0, GUN_RECOIL_TIME = .55; // m the big guns' barrels slide back when they fire, and s they take to ease home
const FIRE_EARLY = 16; // m from its stopping place: the launchers start working this far out, while it is still easing in
const GUN = { hp: 16, score: 800, hit: 1.5 * .99 * SIZE }, VLS = { hp: 12, score: 500, hit: 1.15 * .99 * SIZE, reach: 2.5 * .99 * SIZE }; // a gun has 16 hp (four grenades or rockets, or sixteen bullets); a launcher 12 (three, or twelve): grenades and rockets do 4, bullets 1. hit: half-size of the hit box, m; reach: how far from its centre a blast catches it (a launcher in the far row must be caught by a grenade or rocket that bursts on the hull's near side, 4 m off)
const GUN_RANGE = 34, GUN_TURN = 7; // m its shells reach (ordinary turrets: 28), and how fast the guns swing round (theirs: 3)
const FIRE_RANGE = 48;       // m: a cell opens and fires with the jeep this near (and the cell on screen); further than the submarines' 34, so the cells start while the ship is still sailing in
const OPEN_TIME = 2.6, CLOSE_TIME = 1.0; // s: the lid and missile rising (the warning: the cell can be hurt for the second half of it), and the lid closing (still open, so still hurtable, at first)
const FIRST = [.5, 1], STAGGER = .7, RELOAD = [3.2, 4.4]; // s: before a cell's first launch (plus STAGGER per cell), and between launches
const HURT_ABOVE = .45;      // open this far (0..1: the lid is fully up at .45) and the cell can be hurt
const AIM_DELAY = .5, CLIMB = 7; // as the submarines: the missile homes on where the jeep was this long ago; it climbs this far straight up first
const rand = ([a, b]) => a + Math.random() * (b - a);
const SINK_TIME = 10, WIN_AT = 9.5; // s: the ship goes down; s into it that the stage is won (the results follow a couple of seconds later)
const DROP = 4.5, PITCH = .38; // m the ship settles lower, and rad its bow lifts (the stern, 21 m back, goes ~7 m further down; the bow ends up well above the water)
const smooth = t => t * t * (3 - 2 * t);
const _p = new THREE.Vector3(), _a = new THREE.Vector3();

export class Warship {
  constructor(scene, fx, debris, statues) { this.scene = scene; this.fx = fx; this.debris = debris; this.statues = statues; this.obj = null; }

  // spec: { z, fromX } from the stage: where it lies (its centre line) and how far west it starts. arena: the BossArena (its box says where the middle is).
  setup(world, spec, arena) {
    if (!spec) return;
    this.world = world; this.arena = arena; this.z = spec.z; this.fromX = spec.fromX ?? -75;
    const obj = this.obj = mergedModel('warship', buildWarship);
    obj.scale.setScalar(SIZE); obj.rotation.order = 'YXZ'; obj.rotation.y = -Math.PI / 2; // (bow is -Z: turned to face east)
    dropTinyShadows(obj);
    addToLayer(obj, REFLECT);
    // The camera looks steeply down, so the hull's own side hides the deck from the mirrored view: leave the deck, what lies flat on it and the four launchers out of the reflection (the guns, deckhouse and mast stay in).
    obj.traverse(o => { if (o.isMesh && [].concat(o.material).every(m => m.userData.noReflect)) o.layers.disable(REFLECT); });
    for (let n = 0; n < 4; n++) obj.getObjectByName('vls' + n).traverse(o => o.layers.disable(REFLECT));
    // The shadow pass: the mast, each lid and each loaded missile cast only their biggest piece, and the hull and deckhouse's static pieces are one mesh that casts it (~55 draw calls fewer)
    oneShadow(obj.getObjectByName('mast'));
    for (let n = 0; n < 4; n++) { oneShadow(obj.getObjectByName(`vls${n}_lid0`)); oneShadow(obj.getObjectByName(`vls${n}_missile0`)); }
    shadowTwin(obj.getObjectByName('hull'), SHADOW_ONLY, ['midSection']);
    this.scene.add(obj); // (not in the see-through view: the deck hides the hull under water from above, and it is ~70 draw calls a view)
    this.hull = { x: 0, z: 0, hw: HULL.hw, hd: HULL.hd, alive: false, kind: 'warship' }; world.obstacles.push(this.hull);
    this.parts = []; // each hurtable part: { node, anchor, target }
    for (const [name, muzzle] of [['gun', 'gunMuzzle'], ['gunAft', 'gunAftMuzzle']]) {
      const top = obj.getObjectByName(name), anchor = new THREE.Object3D(), part = { node: top, anchor, kind: 'gun' };
      top.rotation.set(0, name === 'gunAft' ? Math.PI : 0, 0); // (the merge leaves the aft gun's turn as x = z = PI: tracking only sets y)
      part.target = this.target(top, GUN, () => this.wreckGun(part));
      part.barrel = top.getObjectByName(name + 'Barrel'); part.barrelZ = part.barrel.position.z; part.kick = 0;
      world.turrets.push({ top, base: anchor, target: part.target, muzzle: top.getObjectByName(muzzle), noRecoil: true, onFire: () => { part.kick = 1; }, range: GUN_RANGE, turnRate: GUN_TURN, burstSize: 1, cannon: 'heavy', spread: [-.6, -.3, 0, .3, .6] }); // (EnemyFire aims and fires it from `anchor`: the gun's own place and the ship's heading)
      this.parts.push(part);
    }
    for (let n = 0; n < 4; n++) {
      const node = obj.getObjectByName('vls' + n), part = { node, anchor: new THREE.Object3D(), kind: 'vls', n, state: 'closed', k: 0, reload: rand(FIRST) + n * STAGGER, missile: obj.getObjectByName(`vls${n}_missile0`) };
      part.target = this.target(node, VLS, () => this.wreckVls(part));
      // a blast hurts only the launcher it bursts nearest (its reach is long so the far row can be caught from the hull's near side, but one blast must not take out both launchers of a column)
      part.target.blastHit = (at, radius) => {
        const d = Math.hypot(at.x - part.target.x, at.z - part.target.z);
        if (d >= radius + part.target.r) return false;
        return !this.parts.some(q => q !== part && q.kind === 'vls' && q.target.hp > 0 && !q.target.immune && Math.hypot(at.x - q.target.x, at.z - q.target.z) < d);
      };
      world.turrets.push({ top: new THREE.Group(), base: part.anchor, target: part.target, range: 0 }); // (counts toward the kill rate; fires nothing yet)
      this.parts.push(part);
    }
    this.buildHud();
    this.time = 0; this.rippleIn = 0; this.deckFires = [];
    this.reset();
  }

  // The six hurtable parts' armour as a holographic tactical display: each part has a translucent red readout panel (corner brackets, scan lines, a sweeping bright line, a faint
  // flicker; its name and a segmented armour bar) joined by an animated dashed beam to a pulsing target ring on the part. A destroyed part's panel dims and says OFFLINE; when the
  // whole ship is down the display goes out. The look is in the stylesheet below (classes wsh-*).
  buildHud() {
    if (!document.getElementById('wsh-style')) {
      const st = document.createElement('style'); st.id = 'wsh-style';
      st.textContent = `
.wsh-box { position: absolute; left: 0; top: 0; box-sizing: border-box; padding: 5px 8px 6px; overflow: hidden; color: #ffd0c6; font: 700 11px/1.15 "Courier New", monospace; letter-spacing: .16em;
  text-shadow: 0 0 6px rgba(255,80,60,.95), 1px 0 0 rgba(0,255,255,.38), -1px 0 0 rgba(255,0,70,.38);
  background: linear-gradient(180deg, rgba(255,70,55,.24), rgba(255,70,55,.07)), repeating-linear-gradient(0deg, rgba(255,150,130,.10) 0 1px, transparent 1px 3px);
  border: 1px solid rgba(255,74,58,.32); box-shadow: 0 0 14px rgba(255,74,58,.45), inset 0 0 12px rgba(255,74,58,.2); animation: wshFlick 3.1s infinite; }
.wsh-box::before { content: ''; position: absolute; inset: -1px; pointer-events: none;
  background:
    linear-gradient(#ff5a46, #ff5a46) 0 0 / 9px 2px no-repeat, linear-gradient(#ff5a46, #ff5a46) 0 0 / 2px 9px no-repeat,
    linear-gradient(#ff5a46, #ff5a46) 100% 0 / 9px 2px no-repeat, linear-gradient(#ff5a46, #ff5a46) 100% 0 / 2px 9px no-repeat,
    linear-gradient(#ff5a46, #ff5a46) 0 100% / 9px 2px no-repeat, linear-gradient(#ff5a46, #ff5a46) 0 100% / 2px 9px no-repeat,
    linear-gradient(#ff5a46, #ff5a46) 100% 100% / 9px 2px no-repeat, linear-gradient(#ff5a46, #ff5a46) 100% 100% / 2px 9px no-repeat; }
.wsh-sweep { position: absolute; left: 0; right: 0; top: 0; height: 2px; pointer-events: none; background: linear-gradient(90deg, transparent, rgba(255,170,150,.85), transparent); opacity: .7; animation: wshSweep 2.6s linear infinite; }
.wsh-head { display: flex; justify-content: space-between; gap: 6px; position: relative; }
.wsh-bar { position: relative; margin-top: 4px; height: 7px; background: rgba(0,0,0,.55); border: 1px solid rgba(255,74,58,.55); box-shadow: 0 0 5px rgba(255,74,58,.35); }
.wsh-fill { position: absolute; left: 0; top: 0; bottom: 0; width: 100%; transition: width .15s, background .15s; filter: drop-shadow(0 0 3px currentColor); }
.wsh-bar::after { content: ''; position: absolute; inset: 0; pointer-events: none; background: repeating-linear-gradient(90deg, rgba(10,0,0,.8) 0 2px, transparent 2px 7px); }
.wsh-box.dead { animation: none; opacity: .55; color: #b58a82; text-shadow: none; background: rgba(40,10,8,.4); border-color: rgba(124,74,68,.6); box-shadow: none; }
.wsh-box.dead::before, .wsh-box.dead .wsh-sweep { display: none; }
.wsh-line { stroke: #ff5a46; stroke-width: 1.3; stroke-dasharray: 5 4; filter: drop-shadow(0 0 3px #ff4a3a); animation: wshDash .7s linear infinite; }
.wsh-ring { fill: none; stroke: #ff5a46; stroke-width: 1.5; filter: drop-shadow(0 0 3px #ff4a3a); transform-box: fill-box; transform-origin: center; animation: wshPulse 1.4s ease-out infinite; }
.wsh-core { fill: #ff8a78; filter: drop-shadow(0 0 4px #ff4a3a); }
/* LOW graphics: still, no glows or filters. Page elements drawn over the canvas are redrawn by the browser every frame; the animated glows cost an integrated GPU ~18 ms a frame (live profile, stage 3) */
.wsh-lite .wsh-box, .wsh-lite .wsh-line, .wsh-lite .wsh-ring, .wsh-lite .wsh-core, .wsh-lite .wsh-fill, .wsh-lite .wsh-bar { animation: none !important; filter: none !important; text-shadow: none !important; box-shadow: none !important; transition: none !important; }
.wsh-lite .wsh-sweep { display: none; }
.wsh-lite .wsh-ring { opacity: .8; }
@keyframes wshSweep { from { top: -3px; } to { top: 100%; } }
@keyframes wshDash { to { stroke-dashoffset: -9; } }
@keyframes wshPulse { 0% { transform: scale(.6); opacity: 1; } 100% { transform: scale(1.7); opacity: 0; } }
@keyframes wshFlick { 0%, 100% { opacity: 1; } 46% { opacity: .96; } 48% { opacity: .78; } 50% { opacity: 1; } 82% { opacity: .93; } 83% { opacity: 1; } }`;
      document.head.appendChild(st);
    }
    const root = document.createElement('div');
    Object.assign(root.style, { position: 'fixed', left: 0, top: 0, width: '100%', height: '100%', zIndex: 5, pointerEvents: 'none', display: 'none' });
    const NS = 'http://www.w3.org/2000/svg', svg = document.createElementNS(NS, 'svg');
    Object.assign(svg.style, { position: 'absolute', left: 0, top: 0, width: '100%', height: '100%', overflow: 'visible' });
    root.appendChild(svg);
    this.bars = this.parts.map((p, i) => {
      const box = document.createElement('div'); box.className = 'wsh-box'; box.style.width = BOX_W + 'px'; box.style.display = 'none'; box.style.animationDelay = (-i * .7) + 's';
      const sweep = document.createElement('div'); sweep.className = 'wsh-sweep'; sweep.style.animationDelay = (-i * .43) + 's';
      const head = document.createElement('div'); head.className = 'wsh-head';
      const label = document.createElement('span'); label.textContent = p.kind === 'gun' ? tr(i === 0 ? 'GUN FWD' : 'GUN AFT') : tr('VLS') + ' ' + (i - 1);
      if (isZh()) label.style.fontSize = '14px'; // (Chinese glyphs read small at the 11px the Latin text uses)
      const num = document.createElement('span'); head.append(label, num);
      const bar = document.createElement('div'); bar.className = 'wsh-bar';
      const fill = document.createElement('div'); fill.className = 'wsh-fill';
      bar.appendChild(fill); box.append(sweep, head, bar); root.appendChild(box);
      const line = document.createElementNS(NS, 'line'), ring = document.createElementNS(NS, 'circle'), core = document.createElementNS(NS, 'circle');
      line.setAttribute('class', 'wsh-line'); ring.setAttribute('class', 'wsh-ring'); ring.setAttribute('r', '8'); core.setAttribute('class', 'wsh-core'); core.setAttribute('r', '2.6');
      svg.append(line, ring, core);
      return { box, label, num, fill, line, ring, core, max: p.target.hp, pos: new THREE.Vector3() };
    });
    (document.getElementById('frame') ?? document.body).appendChild(root); this.hud = root; this.setLite(this.lite);
  }
  setLite(on) { this.lite = !!on; this.hud?.classList.toggle('wsh-lite', this.lite); }
  // Called by main.js after the camera has moved for the frame (the dots are projected through it: before that they lag a frame behind a panning camera).
  // Each box keeps a fixed place relative to its part on the screen (above the ship or below it, a little out toward its end): nothing is shuffled or squeezed to stay in view.
  updateHud(cam) {
    if (!this.hud) return;
    const shown = this.state !== 'wait' && this.state !== 'sinking' && this.state !== 'wrecked' && cam; // (the display goes out the moment the last part is destroyed)
    this.hud.style.display = shown ? 'block' : 'none';
    if (!shown) return;
    cam.camera.updateMatrixWorld(); this.obj.updateMatrixWorld(true);
    const canvas = document.getElementById('c'), rect = canvas ? canvas.getBoundingClientRect() : { left: 0, top: 0, width: innerWidth, height: innerHeight };
    const ui = uiScale(), origin = this.hud.getBoundingClientRect(); // (the overlay's own corner: if a parent is transformed or offset, the numbers below are relative to it, not to the page)
    this.parts.forEach((p, i) => {
      const b = this.bars[i], hp = Math.max(0, p.target.hp), f = hp / b.max, dead = hp <= 0;
      p.node.getWorldPosition(b.pos); b.pos.y += i === 3 || i === 5 ? .5 : i === 2 || i === 4 ? 1 : 1.6; // (the four launchers: the ring sits lower than on the guns; the two on the lower side of the screen lowest)
      const v = b.pos.clone().project(cam.camera);
      const sx = rect.left + (v.x * .5 + .5) * rect.width - origin.left, sy = rect.top + (-v.y * .5 + .5) * rect.height - origin.top;
      const on = v.z < 1 && Math.abs(v.x) < 1.05 && Math.abs(v.y) < 1.05, [dx, dy] = HUD_OFFSET[i], top = dy < 0;
      b.box.style.display = on ? 'block' : 'none';
      const h = b.h ??= (b.box.offsetHeight || BOX_H), cx = sx + dx * ui, ay = sy + dy * ui; // (ui: the box is drawn smaller on a short screen, shrinking toward its edge facing the part; cx, ay: where that edge's middle is)
      const bx = cx - BOX_W / 2, by = top ? ay - h : ay, hw = BOX_W * ui / 2;
      b.box.style.transformOrigin = top ? '50% 100%' : '50% 0'; b.box.style.transform = `translate(${bx.toFixed(1)}px, ${by.toFixed(1)}px)` + (ui < 1 ? ` scale(${ui})` : ''); // (moved by transform, not left/top: no layout each frame)
      b.fill.style.width = (f * 100).toFixed(1) + '%'; const hue = (108 * f).toFixed(0); b.fill.style.background = `hsl(${hue}, 80%, 52%)`; b.fill.style.color = `hsl(${hue}, 90%, 55%)`; // (the bar keeps the green-yellow-red scale, whatever the HUD's own colour)
      b.num.textContent = dead ? 'OFFLINE' : '';
      b.box.classList.toggle('dead', dead);
      // the leader: from the box's corner nearest the part (a lower corner of a box above it, an upper one of a box below) to a ring on the part
      const ex = sx < cx ? cx - hw : cx + hw, ey = ay;
      b.line.setAttribute('x1', ex); b.line.setAttribute('y1', ey); b.line.setAttribute('x2', sx); b.line.setAttribute('y2', sy);
      b.ring.setAttribute('cx', sx); b.ring.setAttribute('cy', sy); b.core.setAttribute('cx', sx); b.core.setAttribute('cy', sy);
      for (const e of [b.line, b.ring, b.core]) e.style.display = on && !dead ? '' : 'none';
    });
  }

  target(node, K, wreck) {
    const t = { object: node, x: 0, z: 0, hw: K.hit, hd: K.hit, r: K.reach ?? K.hit, hp: K.hp, score: K.score, immune: true, passWhenImmune: true, wreck }; // (passWhenImmune: while a part can't be hurt, shots go by it: a closed launcher doesn't shield an open one behind it)
    this.world.targets.push(t); return t;
  }

  reset() { this.state = 'wait'; this.prevX = undefined; this.drop = this.roll = this.pitch = 0; this.x = this.fromX; this.obj.visible = false; this.place(); }

  // Put the ship at (x, z) and its hit boxes where its parts are.
  place() {
    const o = this.obj, live = this.state !== 'wait';
    o.position.set(this.x, DRAFT - (this.drop ?? 0) + Math.sin(this.time * 1.25 + 2) * .09, this.z); // (a slow heave as well)
    o.rotation.z = (Math.sin(this.time * .9) * .026 + Math.sin(this.time * 1.7 + 1) * .008) + (this.roll ?? 0); o.rotation.x = (Math.sin(this.time * .7 + 1) * .017 + Math.sin(this.time * 1.3) * .005) + (this.pitch ?? 0); // (rides the swell; going down it lists and the bow lifts)
    o.updateMatrixWorld(true);
    this.hull.x = this.x; this.hull.z = this.z; this.hull.alive = live;
    const dx = this.x - (this.prevX ?? this.x); this.prevX = this.x; // the fires on wrecked parts travel with the ship
    if (dx) for (const f of this.deckFires) { for (const m of f.flames) m.position.x += dx; f.centre.x += dx; }
    for (const p of this.parts) {
      p.node.getWorldPosition(_p);
      p.anchor.position.set(_p.x, 0, _p.z); p.anchor.rotation.y = o.rotation.y;
      p.target.x = _p.x; p.target.z = _p.z;
      if (p.kind === 'gun') p.target.immune = !live; else if (!live) p.target.immune = true; // (a launcher can be hurt only while its lid is open: see launchers)
    }
  }

  update(dt, player, cam) {
    const o = this.obj;
    if (!o) return;
    const box = this.arena.box;
    if (this.state === 'wait') {
      if (!this.arena.active || !box) return;
      this.state = 'sail'; o.visible = true; // the way back has shut: here it comes
    } else if (!this.arena.active) { this.reset(); return; } // (a saved game puts the fight back to the start)
    this.time += dt;
    for (const p of this.parts) if (p.kind === 'gun' && p.kick > 0) { // the big guns' recoil: the barrel is thrown back into its housing at once, then eases home
      p.kick = Math.max(0, p.kick - dt / GUN_RECOIL_TIME);
      const k = p.kick * p.kick; p.barrel.position.z = p.barrelZ + (p.target.hp > 0 ? GUN_RECOIL * k : 0);
    }
    if (this.state === 'wrecked') return; // (the wreck stays where it lies)
    if (this.state !== 'sinking' && this.parts.every(p => p.target.hp <= 0)) { this.state = 'sinking'; this.sinkT = 0; this.boomIn = 0; this.bigDone = 0; this.arena.bossDown?.(); }
    if (this.state === 'sinking') { this.sinking(dt, cam); this.place(); return; }
    const stop = (box.x0 + box.x1) / 2, left = this.stopLeft = stop - this.x;
    if (this.state === 'sail') {
      const v = SPEED * Math.min(1, Math.max(.04, left / EASE));
      this.x = Math.min(stop, this.x + v * dt);
      if (left < .03) this.state = 'moored';
      if ((this.rippleIn -= dt) <= 0) { // a bow wave, and a churned wake astern
        this.rippleIn = RIPPLE_EVERY;
        const k = v / SPEED;
        for (const e of [HALF_LEN, -HALF_LEN]) { _p.set(this.x + e, 0, this.z); this.world.ripple?.(_p, .8 * (e > 0 ? 1.2 : 1) * (.4 + k)); this.fx.wake(_p.clone(), (e > 0 ? 1.4 : 1.1) * (.4 + k), 2.2); }
        for (const s of [-1, 1]) this.fx.wake(_p.set(this.x + HALF_LEN - 2, 0, this.z + s * 2.4).clone(), .9 * k, 1.2);
      }
    }
    this.place(); this.launchers(dt, player, cam);
  }

  // The four missile cells, each on its own clock (submarines.js, hunt / ready / open / close).
  launchers(dt, player, cam) {
    const canShoot = player.enabled && !player.dead && !this.arena.frozen && (this.state === 'moored' || (this.state === 'sail' && this.stopLeft < FIRE_EARLY)); // (missiles once it has nearly stopped, not only when it has)
    for (const p of this.parts) {
      if (p.kind !== 'vls' || p.state === 'dead' || p.target.hp <= 0) continue;
      const dist = Math.hypot(player.position.x - p.target.x, player.position.z - p.target.z);
      if (p.state === 'closed') {
        if (canShoot && dist <= FIRE_RANGE && cam.inPlayWindow(_p.set(p.target.x, 1, p.target.z), 1) && (p.reload -= dt) <= 0) p.state = 'open';
      } else if (p.state === 'open') { // the lid swings up and the missile rises (the warning): it launches whatever the jeep does now
        p.k = Math.min(1, p.k + dt / OPEN_TIME);
        if (p.k >= 1) { if (canShoot) this.launch(p); p.state = 'close'; p.missile.visible = false; }
      } else if (p.state === 'close') {
        p.k = Math.max(0, p.k - dt / CLOSE_TIME);
        if (p.k <= 0) { p.missile.visible = true; p.state = 'closed'; p.reload = rand(RELOAD); }
      }
      poseVls(this.obj, p.n, p.k);
      p.target.immune = p.k < HURT_ABOVE; // shut (or not yet open enough), a launcher takes no damage
    }
  }

  // The missile leaves the cell (straight up) and homes on where the jeep was half a second ago, like the boss statues'.
  launch(p) {
    const from = p.missile.getWorldPosition(new THREE.Vector3()).setY(this.obj.position.y + 4), at = this.statues.enemyFire.aimAgo(AIM_DELAY, _a);
    this.statues.shoot(from, Math.atan2(-(at.x - from.x), -(at.z - from.z)), at, this.world, BOSS_MISSILE_FLIGHT, CLIMB);
    this.fx.smoke(from.clone(), 1.5);
  }

  // The end: explosions rip along the deck, two big ones (the magazines), burning oil on the water, and the ship lists, lifts its bow and goes down by the stern.
  sinking(dt, cam) {
    this.sinkT += dt;
    const t = this.sinkT, k = Math.min(1, t / SINK_TIME), along = () => this.x + (Math.random() - .5) * 38, at = () => new THREE.Vector3(along(), 2.5 + Math.random() * 2, this.z + (Math.random() - .5) * 3.5);
    this.drop = DROP * smooth(k); this.roll = .16 * smooth(k); this.pitch = PITCH * smooth(k); // (the stern goes under, the bow lifts and stays out)
    for (const f of this.deckFires) { // the flames on the wrecked parts go down with the deck, and are out (a puff of steam and smoke) as the water reaches them
      if (f.y0 === undefined) { f.y0 = f.flames.map(m => m.position.y); f.cy0 = f.centre.y; }
      if (f.cy0 - this.drop + (f.centre.x - this.x) * Math.sin(this.pitch) <= .25) { const c = this.fx.fires.douse(f); this.fx.smoke(c.clone().setY(.4), 9); this.fx.puff(c.clone().setY(.5), { color: 0xe8e8e8, size: 1.4, grow: 3, life: 1.8, opacity: .5, vel: new THREE.Vector3(0, 1.6, 0) }); f.out = true; continue; }
      const lift = x => (x - this.x) * Math.sin(this.pitch); // (the flames ride with the deck: down at the stern, up at the bow)
      f.flames.forEach((m, i) => { m.position.y = f.y0[i] - this.drop + lift(m.position.x); }); f.centre.y = f.cy0 - this.drop + lift(f.centre.x);
    }
    this.deckFires = this.deckFires.filter(f => !f.out);
    const burnt = this.burntMat ??= new THREE.MeshStandardMaterial({ color: 0x1c1c1a, roughness: .9, flatShading: true });
    if (t < 6.5 && (this.boomIn -= dt) <= 0) { // a string of blasts along the deck
      this.boomIn = .18 + Math.random() * .22;
      const p = at(); this.fx.explosion(p, .85 + Math.random() * .9); this.fx.smoke(p.clone(), 3);
      for (let i = 0; i < 8; i++) this.debris.chunk(p.clone(), burnt, .15 + Math.random() * .35, 3);
      this.plates(p, 2);
      this.world.ripple?.(_p.set(p.x, 0, p.z), 1.4);
      if (Math.random() < .35) this.fx.waterBlast(_p.clone().setZ(this.z + (Math.random() < .5 ? -4.5 : 4.5)), 1.0);
    }
    const BIG = [[1.5, 2.8, 8], [3.8, 2.3, -8], [5.8, 2.0, -2]]; // [s, size, along the ship (m)]: the forward magazine, the aft, then the last of her
    for (const [i, [when, size, off]] of BIG.entries()) if (t >= when && this.bigDone === i) {
      this.bigDone++;
      const c = new THREE.Vector3(this.x + off, 3, this.z);
      this.fx.explosion(c, size); this.fx.explosion(c.clone().add(new THREE.Vector3(2, 1.5, 0)), size * .6); this.fx.smoke(c.clone(), 14);
      this.fx.waterBlast(_p.set(c.x, 0, this.z - 4), 2.1); this.fx.waterBlast(_p.set(c.x, 0, this.z + 4), 2.1); this.world.ripple?.(_p.set(c.x, 0, this.z), 3.2);
      for (let i = 0; i < 40; i++) this.debris.chunk(c.clone(), burnt, .18 + Math.random() * .4, 4);
      this.plates(c, 14);
      if (this.fx.fires) { const spots = []; for (let i = 0; i < 6; i++) spots.push(new THREE.Vector3(c.x + (Math.random() - .5) * 14, .25, this.z + (Math.random() - .5) * 5)); this.fx.fires.start(spots, 1.5, 14); } // burning oil on the water
    }
    if (t >= WIN_AT && this.arena.state !== 'clear') this.arena.win(cam); // the stage is won as she goes down
    if (k > .3 && (this.rippleIn -= dt) <= 0) { this.rippleIn = .3; this.world.ripple?.(_p.set(this.x + (Math.random() - .5) * 30, 0, this.z), 1.6); this.fx.wake(_p.clone(), 2.2, 2.6); }
    if (t >= SINK_TIME + 1) { this.state = 'wrecked'; this.hull.alive = false; } // (not hidden: the bow stays above the water)
  }

  // Hull plates and torn fittings flung high from `c`, tumbling.
  plates(c, n) {
    const plate = this.plateMat ??= new THREE.MeshStandardMaterial({ color: 0x5c656a, roughness: .7, metalness: .3, flatShading: true }), r = () => (Math.random() - .5) * 2;
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(shardGeometry(.5 + Math.random() * 1.4, .06 + Math.random() * .08, .4 + Math.random() * .9), plate); m.castShadow = true;
      m.position.copy(c).add(new THREE.Vector3(r() * 1.5, Math.random() * 1.5, r() * 1.5)); this.scene.add(m);
      this.debris.launch(m, new THREE.Vector3(r() * 11, 9 + Math.random() * 9, r() * 11), new THREE.Vector3(r() * 12, r() * 12, r() * 12), .06);
    }
  }

  // Burn out a part: every mesh of it darkened (each with its own copy of the material: the merged model's are shared).
  char(node) {
    node.traverse(m => { if (!m.isMesh) return; const burn = x => { x = x.clone(); x.color?.multiplyScalar(.28); return x; }; m.material = Array.isArray(m.material) ? m.material.map(burn) : burn(m.material); });
  }
  burn(at, n = 4, scale = 1, lift = 0, ring = 1.4) { // lift: the main blaze burns this far above `at` (clear of a turret's body); ring: how far the others are spread round it
    this.fx.smoke(at.clone().setY(at.y + .6), 6);
    if (this.fx.fires) { const spots = [at.clone().setY(at.y + lift)]; for (let i = 0; i < n; i++) spots.push(at.clone().add(new THREE.Vector3((Math.random() - .5) * ring, 0, (Math.random() - .5) * ring))); this.deckFires.push(this.fx.fires.start(spots, scale, 60)); }
  }

  // A gun turret knocked out: scorched, the barrel drooping, the deck round it ablaze.
  wreckGun(part) {
    const at = part.node.getWorldPosition(new THREE.Vector3()), bar = part.node.children.find(c => /Barrel$/.test(c.name));
    this.char(part.node); if (bar) bar.rotation.x = .45;
    const burnt = new THREE.MeshStandardMaterial({ color: 0x1c1c1a, roughness: .9, flatShading: true });
    for (let i = 0; i < 6; i++) this.debris.chunk(at.clone().setY(at.y + 1), burnt, .12 + Math.random() * .2, 3);
    this.burn(at, 4, 1, 1.1, 3.4); // (the flames above the turret's roof and round its foot: from inside the turret they were hidden by it)
  }

  // A vertical launcher knocked out: the lid blown open, the cell burnt out and ablaze.
  wreckVls(part) {
    part.state = 'dead'; part.missile.visible = true;
    const at = part.node.getWorldPosition(new THREE.Vector3());
    poseVls(this.obj, part.n, .45); // (lid up, the missile still down in its cell)
    this.char(part.node);
    this.burn(at.clone().setY(at.y + .3), 1, .5, .6, .9); // (a small fire in the cell, its blaze raised clear of the rim and the open lid)
  }
}
