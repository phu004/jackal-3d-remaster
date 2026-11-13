// Prisoners of war, freed by blowing open buildings.
//  - Green-roof barracks: one prisoner (green-reddish fatigues) walks out through the breach,
//    stands facing south waving for help, and hurries to the jeep once it's close.
//  - Brown-roof huts: one prisoner in green comes out and waves at the breach. As soon as the jeep is near he jumps in,
//    and as each hops aboard the next of the four is already coming out of the breach for the jeep. If the jeep drives off
//    part way through, the one who has come out takes the leader's place: he stands at the breach waving for help, and
//    jumps in the moment the jeep is near again, and the rest follow in the same way.
// Driving up to a prisoner picks him up: he hops aboard and is counted.
// At the helipad, the prisoners on board climb out of the jeep and run to the waiting helicopter (evacuate).
import { REFLECT } from './layers.js';
import { sfx } from './sfx.js';
import * as THREE from 'three';
import { buildPOW } from '../assets/pow.js';
import { mergedModel } from './optimize.js';
import { HALF_LEN, HALF_WID } from './player.js';

const WALK = 2.2, HURRY = 3.2, EMERGE = 4.2,  STRIDE = 1.3, TURN = 6;
const CALL = 6, PICKUP_PAD = .7, RADIUS = .35; // waiting prisoners come to the jeep once it's this close
const BARRACKS_POW = { shirt: 0x6a4428, trousers: 0x3a5a8a, engineer: true, size: .85 }; // an engineer: brown jumper, blue jeans; 15% smaller than the other prisoners
const rand = (a, b) => a + Math.random() * (b - a);

// "HELP!" label over a waiting prisoner, as on the NES: chunky white letters with a black outline,
// kept pixel-crisp. One shared texture; each prisoner gets a sprite that always faces the camera.
let helpMat = null;
function helpSprite() {
  if (!helpMat) {
    const c = document.createElement('canvas'); c.width = 128; c.height = 40; const x = c.getContext('2d');
    x.font = 'bold 30px "Courier New", monospace'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.lineJoin = 'round'; x.lineWidth = 8; x.strokeStyle = '#000'; x.strokeText('HELP!', 64, 21);
    x.fillStyle = '#fff'; x.fillText('HELP!', 64, 21);
    const t = new THREE.CanvasTexture(c); t.magFilter = THREE.NearestFilter; t.minFilter = THREE.LinearFilter;
    helpMat = new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false });
  }
  const sp = new THREE.Sprite(helpMat); sp.scale.set(3.4, 1.08, 1); sp.position.set(0, 3.0, 0); sp.visible = false;
  return sp;
}

const _toJeep = new THREE.Vector3(); // scratch for the per-frame loop (no garbage)

export class POWs {
  constructor(scene, fx) { this.scene = scene; this.fx = fx; this.list = []; }

  // A building has been blown open: barracks free one prisoner; huts free a waving leader whose
  // three comrades come out when the jeep arrives.
  release(building) {
    building.updateMatrixWorld(true);
    const inside = building.position.clone(), exit = building.getObjectByName('exit').getWorldPosition(new THREE.Vector3());
    const out = exit.clone().sub(inside).setY(0).normalize(), side = new THREE.Vector3(-out.z, 0, out.x);
    const door = { inside, exit, out, side, floor: building.name === 'barracks' ? .55 : 0 };
    if (building.name === 'barracks') this.spawn(door, { delay: .4, kind: 'engineer' });
    else this.spawn(door, { delay: .4, group: { door, pending: 3 } }); // the leader, at the breach; three comrades are still inside
  }

  // One prisoner walking out of `door`. group: he's a hut's leader; follower: he follows one.
  // kind: 'engineer' (from barracks) or 'green'. from/to override the walk (used when scattering).
  spawn(door, { delay = 0, kind = 'green', group = null, from: fromAt = null, to: toAt = null, wanders = false, evac = null }) {
    const { inside, exit, out, side, floor } = door;
    const obj = mergedModel(kind === 'engineer' ? 'pow-engineer' : 'pow', () => buildPOW(kind === 'engineer' ? BARRACKS_POW : undefined));
    const from = fromAt ? fromAt.clone() : inside.clone().addScaledVector(side, rand(-1, 1)).addScaledVector(out, rand(-.8, .2));
    obj.position.copy(from).setY(floor); obj.rotation.order = 'YXZ'; obj.visible = false;
    obj.traverse(c => { if (c.isMesh) { c.castShadow = true; c.layers.enable(REFLECT); } }); // (prisoners show in puddles and water; not the help bubble)
    const help = helpSprite(); obj.add(help);
    this.scene.add(obj);
    const outside = toAt ? toAt.clone()
      : group ? exit.clone().addScaledVector(out, .6).add(new THREE.Vector3(0, 0, -1.2)) // whoever is the hut's leader at the moment waits by the breach, a little north
      : exit.clone().addScaledVector(out, rand(.5, 2)).addScaledVector(side, rand(-1.2, 1.2));
    this.list.push({
      obj, help, state: 'wait', delay, from, to: outside, evac, floor: fromAt ? 0 : floor, group, kind, wanders,
      heading: Math.atan2(-out.x, -out.z), walk: Math.random() * 6, gait: 0, wave: Math.random() * 6,
      legL: obj.getObjectByName('legL'), legR: obj.getObjectByName('legR'), kneeL: obj.getObjectByName('kneeL'), kneeR: obj.getObjectByName('kneeR'),
      armL: obj.getObjectByName('armL'), armR: obj.getObjectByName('armR'), elbowL: obj.getObjectByName('elbowL'), elbowR: obj.getObjectByName('elbowR'),
    });
  }

  update(dt, world, player, onBoard) {
    const jeep = player.position, canPick = player.enabled && !player.dead;
    for (const q of this.list) q.obj.position.y -= q.gy ?? 0; // (the ground's height under each prisoner is added back after the pass: all the logic below works relative to flat ground)
    for (let i = this.list.length - 1; i >= 0; i--) {
      const s = this.list[i], o = s.obj, p = o.position;
      let moving = false, speed = WALK;
      if (s.state === 'wait') { // still inside, waiting for his turn
        if ((s.delay -= dt) <= 0) { s.state = s.evac ? 'evac' : 'emerge'; o.visible = true; if (s.evac) sfx.hop(p); }
        continue;
      }
      if (s.state === 'evac') { // hop down from the jeep, run to the helicopter door and climb in
        const d = s.to.clone().sub(p).setY(0), dl = d.length();
        s.t = (s.t ?? 0) + dt;
        p.y = Math.max(0, Math.sin(Math.min(1, s.t / .3) * Math.PI) * .8); // the jump down
        if (s.t > .35 && (s.stepIn = (s.stepIn ?? 0) - dt) <= 0) { s.stepIn = .2; sfx.step(p); } // footfalls as he runs
        if (dl < .3) {
          this.scene.remove(o); this.list.splice(i, 1); s.evac(); sfx.board(p);
          this.fx.puff(p.clone().setY(.3), { color: 0xd0b080, size: .3, grow: 2, life: .5, opacity: .4 });
          continue;
        }
        this.face(s, Math.atan2(-d.x, -d.z), dt);
        p.addScaledVector(d.normalize(), Math.min(HURRY * 1.2 * dt, dl));
        s.walk += dt * HURRY * 1.2 / STRIDE * Math.PI * 2;
        this.pose(s, true, dt);
        continue;
      }
      if (s.state === 'board') { // hopping into the jeep
        s.t += dt;
        const k = Math.min(1, s.t / .25);
        p.lerpVectors(s.from, jeep, k); p.y = Math.sin(k * Math.PI) * 1.2 + k * .9;
        o.scale.setScalar(1 - k * .5);
        if (k >= 1) {
          this.scene.remove(o); this.list.splice(i, 1); onBoard(s.kind);
        }
        continue;
      }

      const toJeep = _toJeep.subVectors(jeep, p).setY(0), dist = toJeep.length(); // (scratch: only used in this pass of the loop)
      const g = s.group;
      if (s.state !== 'emerge' && canPick && this.touchesJeep(p, player)) { // picked up (a hut's leader too: he jumps in as soon as the jeep is near, no waiting for the rest)
        s.state = 'board'; s.t = 0; s.from = p.clone(); s.help.visible = false; sfx.pow();
        if (g && g.pending > 0) { g.pending--; this.spawn(g.door, { delay: 0, group: g }); } // as he hops in, the next of the hut's prisoners is already on his way out: he becomes the one at the breach if the jeep leaves now
        this.fx.puff(p.clone().setY(.3), { color: 0xd0b080, size: .3, grow: 2, life: .5, opacity: .5 });
        continue;
      }

      if (s.state === 'emerge') { // walk out through the breach (scripted: ignores the building's walls)
        const d = s.to.clone().sub(p).setY(0);
        if (d.length() < .2) { s.state = 'roam'; p.y = 0; }
        else {
          this.face(s, Math.atan2(-d.x, -d.z), dt);
          const pace = speed = EMERGE; // running out of the burning building (the stride follows)
          p.addScaledVector(d.normalize(), Math.min(pace * dt, d.length()));
          const total = s.to.clone().sub(s.from).setY(0).length() || 1;
          p.y = s.floor * Math.min(1, d.length() / total); // step down off the barracks floor
          moving = true;
        }
      } else if (canPick && dist < CALL) { // hurry to the jeep
        speed = HURRY; s.shuffleTo = null;
        moving = this.step(s, Math.atan2(-toJeep.x, -toJeep.z), speed, dt, world);
      } else if (s.wanders && s.state === 'roam') { // on his own (left behind / crash survivor): shuffling about now and then
        if (s.shuffleTo) {
          const d = s.shuffleTo.clone().sub(p).setY(0);
          if (d.length() < .2 || !(moving = this.step(s, Math.atan2(-d.x, -d.z), WALK * .7, dt, world))) s.shuffleTo = null;
        } else if ((s.shuffleIn = (s.shuffleIn ?? rand(3, 6)) - dt) <= 0) {
          s.shuffleIn = rand(3, 6);
          s.shuffleTo = this.clearSpot(p, world, s);
        }
      }
      if (s.state === 'roam' && !moving) { // waiting to be rescued: faces south with a slight sway, waving
        this.face(s, Math.PI + Math.sin(s.wave * .2) * .18, dt * .5);
      }
      if (moving) s.walk += dt * speed / STRIDE * Math.PI * 2;
      if (world?.groundTrail) { const lp = s.lastP; if (lp && moving) { const mx = p.x - lp.x, mz = p.z - lp.z, md = Math.hypot(mx, mz); if (md > 1e-4 && md < 1) { s.stepD = (s.stepD ?? 0) + md; if (s.stepD > .68 && Math.hypot(p.x - jeep.x, p.z - jeep.z) < 55) { s.stepD = 0; s.foot = -(s.foot ?? 1); world.groundTrail.footprint(p.x, p.z, Math.atan2(-mx, -mz), s.foot); } } } s.lastP = { x: p.x, z: p.z }; } // (the snow level: freed prisoners leave footprints too)
      // blinking HELP! while he stands waiting to be rescued
      s.help.visible = s.state === 'roam' && !moving && Math.sin(s.wave * .55) > -.2;
      this.pose(s, moving, dt);
    }
    for (const q of this.list) { q.gy = world?.liftPOWs && world.heightAt ? world.heightAt(q.obj.position.x, q.obj.position.z) : 0; q.obj.position.y += q.gy; } // (on the snow slope of the secret level: stand on the ground, not at height 0)
  }

  // Saved games: prisoners out in the world (freed, not yet picked up), as [kind, x, z].
  // A hut's leader also carries his group: how many comrades are still inside, and the hut's door
  // they'll come out of when the jeep arrives.
  snapshot() {
    const r = v => Math.round(v * 100) / 100, v2 = v => [r(v.x), r(v.z)];
    return this.list.filter(s => s.state !== 'board' && s.state !== 'evac').map(s => {
      const p = s.state === 'wait' ? s.to : s.obj.position, out = [s.kind, r(p.x), r(p.z)];
      const g = s.group;
      if (g && g.pending > 0) { const d = g.door; out.push({ pending: g.pending, door: [v2(d.inside), v2(d.exit), v2(d.out), v2(d.side), d.floor] }); }
      return out;
    });
  }
  // Put them back standing where they were, waiting for the jeep (loners shuffling about). A hut's
  // leader waits by the breach as before, and his comrades still come out one at a time.
  restore(data) {
    const V = ([x, z]) => new THREE.Vector3(x, 0, z);
    for (const [kind, x, z, grp] of data ?? []) {
      const at = new THREE.Vector3(x, 0, z);
      if (grp) {
        const [inside, exit, out, side, floor] = grp.door;
        const door = { inside: V(inside), exit: V(exit), out: V(out), side: V(side), floor };
        this.spawn(door, { kind, from: at, to: at, group: { door, pending: grp.pending } });
        continue;
      }
      const door = { inside: at, exit: at, out: new THREE.Vector3(0, 0, 1), side: new THREE.Vector3(1, 0, 0), floor: 0 };
      this.spawn(door, { kind, from: at, to: at, wanders: true });
    }
  }

  // The jeep was destroyed: these prisoners (kinds) survived the crash at `at`. They scatter from the
  // wreck to clear spots 2-5 m away, then wander, waving for help, until picked up again.
  scatter(at, kinds, world) {
    for (const kind of kinds) {
      let to = null;
      for (let tries = 0; tries < 16 && !to; tries++) {
        const a = rand(0, Math.PI * 2), r = rand(2, 5), q = at.clone().add(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r)).setY(0);
        if (!world.blocked(q.x, q.z, .6) && !this.list.some(o => (o.to ?? o.obj.position).distanceTo(q) < 1.8)) to = q;
      }
      const door = { inside: at, exit: at, out: new THREE.Vector3(0, 0, 1), side: new THREE.Vector3(1, 0, 0), floor: 0 };
      this.spawn(door, { kind, from: at.clone().setY(0), to: to ?? at.clone().setY(0), wanders: true, delay: Math.random() * .3 });
    }
  }

  // A prisoner of `kind` climbs out of the jeep at `from` and runs to `to` (the helicopter's door);
  // onAboard() is called as he climbs in.
  evacuate(from, kind, to, onAboard) {
    const door = { inside: from, exit: from, out: new THREE.Vector3(0, 0, -1), side: new THREE.Vector3(1, 0, 0), floor: 0 };
    this.spawn(door, { kind, from: from.clone().setY(.8), to: to.clone().setY(0), evac: onAboard });
  }

  // A spot 3-6 m away on walkable ground, at least 2.5 m from every other prisoner and from where the
  // others are heading, so they don't bunch up or overlap. null if none found this time.
  clearSpot(p, world, self) {
    for (let tries = 0; tries < 12; tries++) {
      const a = rand(0, Math.PI * 2), r = rand(3, 6), q = p.clone().add(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r));
      if (world.blocked(q.x, q.z, .6)) continue;
      if (this.list.some(o => o !== self && (o.obj.position.distanceTo(q) < 2.5 || (o.shuffleTo && o.shuffleTo.distanceTo(q) < 2.5)))) continue;
      return q;
    }
    return null;
  }

  // Walk toward heading; slide along obstacles. Returns whether he moved.
  step(s, heading, speed, dt, world) {
    this.face(s, heading, dt);
    const p = s.obj.position, st = speed * dt, nx = p.x - Math.sin(s.heading) * st, nz = p.z - Math.cos(s.heading) * st;
    const free = (x, z) => !world.blocked(x, z, RADIUS);
    if (free(nx, nz)) { p.x = nx; p.z = nz; return true; }
    if (free(nx, p.z)) { p.x = nx; return true; }
    if (free(p.x, nz)) { p.z = nz; return true; }
    return false;
  }

  face(s, heading, dt) {
    let d = heading - s.heading; d = Math.atan2(Math.sin(d), Math.cos(d));
    s.heading += d * Math.min(1, TURN * dt);
    s.obj.rotation.y = s.heading;
  }

  // Walking: legs swing, knees bend, arms swing loosely. Standing: waving one arm for help.
  pose(s, walking, dt) {
    s.gait += ((walking ? 1 : 0) - s.gait) * Math.min(1, dt * 6);
    const g = s.gait, ph = s.walk, sw = Math.sin(ph), cw = Math.cos(ph), body = s.obj.children[0];
    s.legL.rotation.x = sw * .55 * g; s.legR.rotation.x = -sw * .55 * g;
    s.kneeL.rotation.x = -Math.max(0, cw) * .9 * g; s.kneeR.rotation.x = -Math.max(0, -cw) * .9 * g;
    body.position.y = -Math.abs(sw) * .06 * g;
    // standing: the right arm waves overhead (as on the NES sprite), the left hangs at his side
    s.wave += dt * 7;
    const up = 1 - g, w = Math.sin(s.wave) * .45;
    s.armL.rotation.set(-sw * .5 * g, 0, -.12);
    s.armR.rotation.set(sw * .5 * g, 0, (2.6 - w) * up + .12 * g);
    s.elbowL.rotation.z = 0; s.elbowR.rotation.z = (.3 + w * .5) * up;
  }

  touchesJeep(p, player) {
    const dx = p.x - player.position.x, dz = p.z - player.position.z, y = player.yaw;
    const u = dx * -Math.sin(y) + dz * -Math.cos(y), v = dx * Math.cos(y) + dz * -Math.sin(y);
    return Math.abs(u) < HALF_LEN + PICKUP_PAD && Math.abs(v) < HALF_WID + PICKUP_PAD;
  }
}
