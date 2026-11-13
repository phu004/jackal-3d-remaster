// Stage 4's loose boulders (NES): four rocks sit on the island's plateau, right at the lip of the cliff. When the jeep comes up
// on their side they shudder (dust and grit: the warning), tip over the edge and come down the rock face, bouncing and
// rolling on across the grass. Anything under or in the way of a rolling boulder is crushed, so get out of the way. Once it
// stops it blocks like a wall, but the jeep's weapons can break it up (a grenade, rocket or split shot, or a few bullets).
// Gameplay stays 2D: what counts is where the boulder is over the ground. Each starts at its spot in the stage data
// (world.rockSpots, on the plateau) and is moved to the nearest edge of the cliff, turned to fall straight out from it.
import * as THREE from 'three';
import { BufferGeometryUtils } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { cliffTextures } from './cliff-textures.js';
import { sfx } from './sfx.js';

const R = 1.6;                 // m: the boulder's radius
const TRIGGER = 17;            // m: the jeep this close, on the side the boulder falls to, sets it off
const CRACK = .9;              // s of shuddering before it goes
const G = 24;                  // pull (a heavy, brisk fall)
const PUSH = 1.6;              // m/s it is nudged off with
const BOUNCE = .32, DRAG = .55, STOP_SPEED = .7; // energy kept on a bounce; rolling drag on level ground (1/s); below this speed on the ground it stops
const CRUSH_SPEED = 2.2, CRUSH_PAD = .15; // m/s: crushes the jeep above this speed, if this far outside its outline
const HP = 4, SCORE = 100;     // one grenade / rocket / split shot, or four bullets
const SHOW_SOUTH = 28 / 45;    // a point this high shows on screen this much further south per metre (GameCamera's slant)
const MAX_FALL = 9;            // s: it is put down where it is after this long, whatever it is doing

const _v = new THREE.Vector3(), _q = new THREE.Quaternion(), _n = new THREE.Vector3();

// A boulder: a finely divided sphere, its radius pushed about by three scales of noise and cut by a few flat planes (so it has broken faces and edges,
// not a lumpy ball), smooth-shaded; coloured per vertex (faint strata, patches, dust on top, dark underneath), with the cliff's rock texture mapped on by
// whichever axis each face looks along.
function boulderGeometry(seed, detail = 4) {
  let s = seed * 9301 + 49297; const rnd = () => (s = (s * 9301 + 49297) % 233280) / 233280;
  const hash = (x, y, z) => { let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(z, 1274126177) + seed * 7919; h = Math.imul(h ^ (h >>> 13), 1103515245); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
  const noise3 = (x, y, z) => {
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), fx = x - xi, fy = y - yi, fz = z - zi, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy), w = fz * fz * (3 - 2 * fz);
    const l = (a, b, t) => a + (b - a) * t;
    return l(l(l(hash(xi, yi, zi), hash(xi + 1, yi, zi), u), l(hash(xi, yi + 1, zi), hash(xi + 1, yi + 1, zi), u), v), l(l(hash(xi, yi, zi + 1), hash(xi + 1, yi, zi + 1), u), l(hash(xi, yi + 1, zi + 1), hash(xi + 1, yi + 1, zi + 1), u), v), w);
  };
  const cuts = []; for (let i = 0; i < 6; i++) { const n = new THREE.Vector3(rnd() - .5, rnd() - .5, rnd() - .5).normalize(); cuts.push({ n, d: .62 + rnd() * .22 }); } // (flat faces: the rock is no farther than d from its centre along each normal)
  const g = new THREE.IcosahedronGeometry(1, detail), p = g.attributes.position, dir = new THREE.Vector3(), o = seed * 13.7;
  for (let i = 0; i < p.count; i++) {
    dir.fromBufferAttribute(p, i).normalize();
    let r = .9 + (noise3(dir.x * 1.3 + o, dir.y * 1.3, dir.z * 1.3) - .5) * .5 + (noise3(dir.x * 3.1 + o, dir.y * 3.1, dir.z * 3.1) - .5) * .22 + (noise3(dir.x * 8 + o, dir.y * 8, dir.z * 8) - .5) * .07;
    for (const c of cuts) { const k = dir.dot(c.n); if (k > .01) r = Math.min(r, c.d / k + .04 * (r - c.d / k > 0 ? 0 : 1)); } // (clipped by each plane, the corners left a little rounded)
    p.setXYZ(i, dir.x * r, dir.y * r * .9, dir.z * r);
  }
  g.deleteAttribute('uv'); g.deleteAttribute('normal');
  const m = BufferGeometryUtils.mergeVertices(g); m.computeVertexNormals();
  const ng = m.toNonIndexed(), pos = ng.attributes.position, nor = ng.attributes.normal, n = pos.count, uv = new Float32Array(n * 2), col = new Float32Array(n * 3), a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), fn = new THREE.Vector3();
  for (let i = 0; i < n; i += 3) {
    a.fromBufferAttribute(pos, i); b.fromBufferAttribute(pos, i + 1); c.fromBufferAttribute(pos, i + 2);
    fn.crossVectors(b.clone().sub(a), c.clone().sub(a)); const ax = Math.abs(fn.x), ay = Math.abs(fn.y), az = Math.abs(fn.z), SC = .6; // (one projection per face, along the axis it looks most along)
    for (let j = 0; j < 3; j++) {
      const q = j ? (j === 1 ? b : c) : a;
      const [u, v] = ax >= ay && ax >= az ? [q.z, q.y] : ay >= az ? [q.x, q.z] : [q.x, q.y];
      uv[(i + j) * 2] = u * SC; uv[(i + j) * 2 + 1] = v * SC;
      const ny = nor.getY(i + j), band = .5 + .5 * Math.sin(q.y * 9 + noise3(q.x * 2, q.y * 2, q.z * 2) * 5), patch = noise3(q.x * 2.2 + 40, q.y * 2.2, q.z * 2.2 + 9), spot = noise3(q.x * 7, q.y * 7, q.z * 7);
      let k = .8 + band * .14 + (patch - .5) * .3 + (spot - .5) * .1; // base brightness
      const rr = 1, gg = .93, bb = .84;
      let R_ = rr * k, G_ = gg * k, B_ = bb * k;
      const dust = Math.max(0, ny - .35) * 1.3 * (.6 + spot * .6); // dust and grit lying on the upward faces
      R_ = R_ + (.78 - R_) * dust * .45; G_ = G_ + (.7 - G_) * dust * .45; B_ = B_ + (.5 - B_) * dust * .45;
      const low = Math.max(0, -ny) * .35; R_ *= 1 - low; G_ *= 1 - low; B_ *= 1 - low; // darker underneath
      const soil = Math.min(1, Math.max(0, (.15 - q.y) / .5)) * .7 * (.7 + spot * .6); // the foot of it, where it sits in the ground, takes on the soil's colour
      R_ += (.5 - R_) * soil; G_ += (.4 - G_) * soil; B_ += (.28 - B_) * soil;
      col[(i + j) * 3] = R_; col[(i + j) * 3 + 1] = G_; col[(i + j) * 3 + 2] = B_;
    }
  }
  ng.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); ng.setAttribute('color', new THREE.BufferAttribute(col, 3)); ng.computeBoundingSphere();
  return ng;
}

export class FallingRocks {
  // enemyFire: for its jeep hit test; debris: for the broken pieces.
  constructor(scene, fx, debris, enemyFire) { this.scene = scene; this.fx = fx; this.debris = debris; this.enemyFire = enemyFire; this.rocks = []; }

  setup(world) {
    this.world = world;
    const tex = cliffTextures(); // (the cliff's own rock: the boulder is the same stone)
    this.mat = new THREE.MeshStandardMaterial({ color: 0xb08a62, roughness: 1, vertexColors: true, map: tex?.rock.map ?? null, normalMap: tex?.rock.normal ?? null, normalScale: new THREE.Vector2(.9, .9), envMapIntensity: .2 });
    if (typeof document !== 'undefined') { // a soft dark patch of soil under and round it (no hard edge)
      const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'), gr = x.createRadialGradient(32, 32, 6, 32, 32, 32);
      gr.addColorStop(0, 'rgba(46,32,18,.8)'); gr.addColorStop(.5, 'rgba(60,44,26,.5)'); gr.addColorStop(1, 'rgba(70,52,30,0)'); x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
      this.soilMat = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    }
    this.stoneG = [boulderGeometry(91, 1), boulderGeometry(92, 1), boulderGeometry(93, 2)]; // (small stones, cheap)
    this.tuftG = new THREE.ConeGeometry(.06, .4, 4, 1, true).translate(0, .2, 0); this.tuftMat = new THREE.MeshStandardMaterial({ color: 0xa89a58, roughness: 1, side: THREE.DoubleSide, envMapIntensity: .15 });
    this.chipMat = new THREE.MeshStandardMaterial({ color: 0x8a6a48, roughness: 1, flatShading: true, envMapIntensity: .2 }); // the loose chips
    this.rainG = [boulderGeometry(201), boulderGeometry(202), boulderGeometry(203)]; // (for rain(): built now, behind the loading screen)
    for (const [i, spot] of (world.rockSpots ?? []).entries()) {
      const top = world.cliffHeightAt(spot.x, spot.z); if (top < 4) continue; // (not on the cliff's top: nothing to fall from)
      let best = null; // the nearest edge: march out in every direction until the rock's top falls away
      for (let a = 0; a < 360; a += 6) {
        const dx = Math.cos(a * Math.PI / 180), dz = Math.sin(a * Math.PI / 180);
        for (let r = 0; r < 40; r += .25) if (world.cliffHeightAt(spot.x + dx * r, spot.z + dz * r) < top * .8) { if (!best || r < best.r) best = { r, dx, dz }; break; }
      }
      if (!best) continue;
      const dir = new THREE.Vector3(best.dx, 0, best.dz), at = spot.clone().addScaledVector(dir, best.r - 1.1); // (just inside the lip, a good part of it hanging out over it)
      if (spot.turn) { const c = Math.cos(spot.turn), s = Math.sin(spot.turn); dir.set(dir.x * c - dir.z * s, 0, dir.x * s + dir.z * c); } // (a boulder whose stage data says `turn`: it falls this many radians round from the straight-out line, e.g. a little north of west, to land clear of something)
      const mesh = new THREE.Mesh(boulderGeometry(i + 1), this.mat); mesh.castShadow = true; mesh.receiveShadow = true;
      mesh.scale.set(R * (1 + (i % 2) * .08), R, R * (.95 + (i % 3) * .05)); mesh.rotation.set(i, i * 2.1, 0);
      this.rocks.push({ mesh, dir, home: at.clone(), pos: at.clone(), vel: new THREE.Vector3(), state: 'wait', t: 0, key: i, dragK: spot.dragK ?? 1, gravK: spot.gravK ?? 1 }); // (dragK: more rolling drag, so it comes to rest sooner; gravK: it falls faster: the railway's two)
      this.rest(this.rocks[this.rocks.length - 1]);
      this.settleIn(this.rocks[this.rocks.length - 1], top);
      this.scene.add(mesh);
    }
  }

  // Make it look as if it had always been there: a patch of dark soil, small stones and tufts of dry grass round its foot, all on the cliff's top (none over the edge).
  settleIn(k, top) {
    const y0 = this.floor(k.pos.x, k.pos.z), onTop = (x, z) => this.world.cliffHeightAt(x, z) > top * .93, rnd = (() => { let s = (k.key + 5) * 7919; return () => (s = (s * 9301 + 49297) % 233280) / 233280; })();
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sc = new THREE.Vector3(), p = new THREE.Vector3(), col = new THREE.Color();
    if (this.soilMat) {
      const d = new THREE.Mesh(new THREE.PlaneGeometry(R * 5.5, R * 5.5).rotateX(-Math.PI / 2), this.soilMat); d.position.set(k.pos.x, y0 + .05, k.pos.z); d.rotation.y = rnd() * 6; d.renderOrder = 3; this.scene.add(d); k.decal = d;
    }
    const stones = [], tufts = [];
    for (let i = 0; i < 26; i++) { // small stones, thick near it, a few further out
      const a = rnd() * 6.283, rad = R * (.85 + rnd() * rnd() * 2.2), x = k.pos.x + Math.cos(a) * rad, z = k.pos.z + Math.sin(a) * rad;
      if (!onTop(x, z) || !onTop(x + Math.cos(a) * .4, z + Math.sin(a) * .4)) continue;
      stones.push({ x, z, s: R * (.05 + Math.pow(rnd(), 2.2) * .22), g: Math.floor(rnd() * 3), t: .8 + rnd() * .4 });
    }
    for (let i = 0; i < 12; i++) { const a = rnd() * 6.283, rad = R * (.9 + rnd() * 2.6), x = k.pos.x + Math.cos(a) * rad, z = k.pos.z + Math.sin(a) * rad; if (onTop(x, z) && onTop(x + Math.cos(a) * .4, z + Math.sin(a) * .4)) tufts.push({ x, z }); }
    const byG = [[], [], []]; stones.forEach(t => byG[t.g].push(t));
    byG.forEach((list, gi) => {
      if (!list.length) return;
      const im = new THREE.InstancedMesh(this.stoneG[gi], this.mat, list.length);
      list.forEach((t, j) => {
        sc.set(t.s * (.8 + rnd() * .5), t.s * (.55 + rnd() * .4), t.s * (.8 + rnd() * .5)); p.set(t.x, this.floor(t.x, t.z) - t.s * .15, t.z);
        m.compose(p, q.setFromEuler(e.set((rnd() - .5) * .8, rnd() * 6.283, (rnd() - .5) * .8)), sc); im.setMatrixAt(j, m); im.setColorAt(j, col.setScalar(t.t));
      });
      im.castShadow = false; im.receiveShadow = true; im.frustumCulled = false; this.scene.add(im);
    });
    if (tufts.length) {
      const im = new THREE.InstancedMesh(this.tuftG, this.tuftMat, tufts.length * 5);
      tufts.forEach((t, j) => { for (let b = 0; b < 5; b++) { const s = .7 + rnd() * .9, lean = (rnd() - .5) * .5; p.set(t.x + (rnd() - .5) * .4, this.floor(t.x, t.z), t.z + (rnd() - .5) * .4); m.compose(p, q.setFromEuler(e.set(lean, rnd() * 6.283, lean * .7)), sc.set(s, s, s)); im.setMatrixAt(j * 5 + b, m); } });
      im.frustumCulled = false; this.scene.add(im);
    }
  }

  floor(x, z) { return Math.max(this.world.heightAt(x, z), this.world.cliffHeightAt(x, z)); }

  // On its spot, sunk into the ground a little.
  rest(k) { k.pos.y = this.floor(k.pos.x, k.pos.z) + R * .45; k.mesh.position.copy(k.pos); }

  update(dt, player, onHit) {
    for (const k of this.rocks) {
      this.debris.burying = !!k.temp; // (a boss's boulder: the chips it throws sink into the ground once they settle, so they don't pile up)
      if (k.state === 'wait') {
        const jp = player.position, dx = jp.x - k.pos.x, dz = jp.z - k.pos.z;
        if (!player.enabled || player.dead || Math.hypot(dx, dz) > TRIGGER || dx * k.dir.x + dz * k.dir.z <= 0) continue;
        k.state = 'crack'; k.t = 0; this.addTarget(k); sfx.rockCrack(k.pos); // (shootable from the first shudder)
      } else if (k.state === 'crack') { // shudders, grit and dust spilling from under it
        k.t += dt;
        const f = Math.min(1, k.t / CRACK), s = Math.sin(k.t * 60) * .03 * (.3 + f);
        k.mesh.position.set(k.pos.x + s, k.pos.y + Math.abs(s) * .5 + f * f * R * .4, k.pos.z + s * .6); // (working itself up out of its seat)
        k.mesh.rotation.z += Math.sin(k.t * 47) * .004; // (rocking on its seat)
        if (Math.random() < 9 * dt) this.fx.puff(_v.set(k.pos.x + (Math.random() - .5) * 2, k.pos.y - R * .5, k.pos.z + (Math.random() - .5) * 2), { color: 0x8a6c48, size: .4, grow: 2.5, life: 1, opacity: .5, vel: new THREE.Vector3((Math.random() - .5), -.3, (Math.random() - .5)) });
        if (Math.random() < 6 * dt) this.debris.chunk(_v.set(k.pos.x + k.dir.x * R, k.pos.y - R * .6, k.pos.z + k.dir.z * R), this.chipMat, .06 + Math.random() * .08, 1);
        if (k.t >= CRACK) {
          if (k.temp) { // a boulder let loose by the boss: it sets off for where the jeep is now, as fast as it needs to get there
            const jp = player.position, a = this.arenaBox, tx = THREE.MathUtils.clamp(jp.x + (Math.random() - .5) * 8, a.x0 + 3, a.x1 - 3), tz = THREE.MathUtils.clamp(jp.z + (Math.random() - .5) * 8, a.north + 3, a.south - 3);
            k.dir.set(tx - k.pos.x, 0, tz - k.pos.z); k.temp.D = k.dir.length(); k.dir.normalize();
          }
          k.state = 'fall'; k.t = 0; k.vel.copy(k.dir).multiplyScalar(k.temp ? THREE.MathUtils.clamp(k.temp.D / 2.4, 3, 9) : PUSH); k.air = 0; k.rollIn = 0; sfx.rockFall(k.pos);
        }
      } else if (k.state === 'fall') {
        k.t += dt;
        const n = 3, h = dt / n;
        for (let s = 0; s < n && k.state === 'fall'; s++) this.step(k, h);
        k.mesh.position.copy(k.pos);
        if (k.vel.lengthSq() > .1) { // turn about the axis it rolls on
          const sp = Math.hypot(k.vel.x, k.vel.z), ax = _v.set(k.vel.z, 0, -k.vel.x);
          if (sp > .05) k.mesh.quaternion.premultiply(_q.setFromAxisAngle(ax.normalize(), sp * dt / R * (k.air > 0 ? 1.6 : 1)));
        }
        if (k.state === 'fall' && Math.hypot(k.vel.x, k.vel.y, k.vel.z) > CRUSH_SPEED && player.enabled && !player.dead && !player.invulnerable
          && k.pos.y < this.floor(k.pos.x, k.pos.z) + R * 2.5 && this.enemyFire.hitsJeep(k.pos, player, R * .7 + CRUSH_PAD)) onHit();
        if (k.state === 'fall' && k.air === 0 && k.t > 1.4 && Math.hypot(k.vel.x, k.vel.z) > 2 && (k.rollIn -= dt) <= 0) { k.rollIn = .14; sfx.rockRoll(k.pos, Math.hypot(k.vel.x, k.vel.z)); } // (rolling on the grass: a grinding rumble)
        if (k.state === 'fall' && k.temp && k.air === 0 && Math.hypot(k.pos.x - k.temp.start.x, k.pos.z - k.temp.start.z) >= k.temp.D) this.shatter(k); // (it has got where it was going: it breaks up)
        if (k.state === 'fall' && k.t > MAX_FALL) this.stop(k);
      }
      if (k.target && k.target.hp > 0 && k.state !== 'wait' && k.state !== 'gone') this.placeTarget(k);
    }
    this.debris.burying = false;
    if (this.rocks.some(k => k.temp && k.state === 'gone')) this.rocks = this.rocks.filter(k => !(k.temp && k.state === 'gone'));
  }

  // A boulder for the boss fight, loosened on the cliff top outside the arena on one side ('east', 'north' or 'west') at a random spot along it: it shudders for a moment (the warning), then
  // rolls off the lip toward wherever the jeep is, and breaks up when it gets there (or stops, or is shot). Like the stage's own boulders in every other way (it crushes the jeep, shots break it).
  rain(box, side) {
    const w = this.world, f = Math.random(); this.arenaBox = box;
    const [sx, sz, dx, dz] = side === 'east' ? [box.x1 - 1, box.north + 5 + f * (box.south - box.north - 10), 1, 0] : side === 'west' ? [box.x0 + 1, box.north + 5 + f * (box.south - box.north - 10), -1, 0] : [box.x0 + 5 + f * (box.x1 - box.x0 - 10), box.north + 1, 0, -1];
    let top = 0; for (let r = 0; r < 50; r += .5) top = Math.max(top, w.cliffHeightAt(sx + dx * r, sz + dz * r));
    if (top < 4) return null; // (no cliff there)
    let r0 = 0; while (r0 < 50 && w.cliffHeightAt(sx + dx * r0, sz + dz * r0) < top * .95) r0 += .5; // (where it starts: back on the cliff top, off the edge of the screen, so it is seen rolling out over the lip and down the face)
    let back = 16; while (back > 3 && w.cliffHeightAt(sx + dx * (r0 + back), sz + dz * (r0 + back)) < top * .8) back -= 1; // (as far back as there is still cliff top to stand on)
    const n = this.rainN = (this.rainN ?? 0) + 1, pos = new THREE.Vector3(sx + dx * (r0 + back), 0, sz + dz * (r0 + back)), mesh = new THREE.Mesh(this.rainG[n % 3], this.mat);
    mesh.castShadow = mesh.receiveShadow = true; mesh.scale.set(R * (1 + (n % 2) * .08), R, R * (.95 + (n % 3) * .05)); mesh.rotation.set(n, n * 2.1, 0);
    const k = { mesh, dir: new THREE.Vector3(-dx, 0, -dz), home: pos.clone(), pos, vel: new THREE.Vector3(), state: 'crack', t: 0, key: 1000 + n, dragK: 1.9, gravK: 1, temp: { start: pos.clone(), D: 0 } };
    this.rest(k); this.addTarget(k); this.scene.add(mesh); this.rocks.push(k); sfx.rockCrack(pos);
    return k;
  }

  // One small step of the fall: gravity, then the ground (the rock face included): bounces off it along its slope, drags on level ground.
  step(k, h) {
    k.vel.y -= G * k.gravK * h; if (k.t < 1.2) k.vel.addScaledVector(k.dir, 4 * h * k.gravK); // (a heave over the lip while it is still up there)
    const px = k.pos.x, pz = k.pos.z;
    k.pos.addScaledVector(k.vel, h);
    if (this.hitsSolid(k)) { // a building, a wall, a tree: it stops dead against it (back to where it was, the sideways speed gone, a thud and a puff of dust), then settles
      const sp = Math.hypot(k.vel.x, k.vel.z); k.pos.x = px; k.pos.z = pz; k.vel.x *= -.12; k.vel.z *= -.12;
      if (sp > 2.5 && k.t - (k.lastThud ?? -1) > .15) { k.lastThud = k.t; sfx.rockThud(k.pos, sp); this.fx.puff(_v.set(k.pos.x, k.pos.y - R * .5, k.pos.z), { color: 0x8a6c48, size: .9, grow: 3, life: 1.1, opacity: .5, vel: new THREE.Vector3(0, 1, 0) }); }
    }
    const gy = this.floor(k.pos.x, k.pos.z) + R * .85;
    k.air = k.pos.y - gy;
    if (k.air >= 0) return;
    k.pos.y = gy; k.air = 0;
    const e = .4, hx = this.floor(k.pos.x + e, k.pos.z) - this.floor(k.pos.x - e, k.pos.z), hz = this.floor(k.pos.x, k.pos.z + e) - this.floor(k.pos.x, k.pos.z - e);
    _n.set(-hx / (2 * e), 1, -hz / (2 * e)).normalize(); // (the ground's normal)
    const vn = k.vel.dot(_n);
    if (vn < 0) {
      if (vn < -4) this.thud(k, -vn); else if (vn < -2 && k.t - (k.lastThud ?? -1) > .15) { k.lastThud = k.t; sfx.rockThud(k.pos, -vn * 1.5); } // (a small bounce: a softer thud, not more than a few a second)
      k.vel.addScaledVector(_n, -(1 + BOUNCE) * vn);
      if (_n.y > .97 && !(k.temp && this.floor(k.pos.x, k.pos.z) > 1.2)) k.vel.x *= Math.exp(-DRAG * k.dragK * h), k.vel.z *= Math.exp(-DRAG * k.dragK * h); // (level: it slows)
    }
    if (_n.y > .97 && k.vel.length() < STOP_SPEED && this.floor(k.pos.x, k.pos.z) < 1.2) this.stop(k); // (only down on the grass, never up on the cliff)
  }

  // Is the boulder (low enough to hit it) inside a solid object: a building, a wall, a tree, another boulder? (Not the sandbags, the invisible blockers or the palms: things it rolls over or through.)
  hitsSolid(k) {
    if (k.pos.y > this.floor(k.pos.x, k.pos.z) + 3.2) return false; // (still high in the air, falling from the cliff: over the roofs)
    const r = R * .8;
    return this.world.obstacles.some(o => o.alive && o !== k.block && o.kind !== 'palm' && o.kind !== 'blocker' && o.kind !== 'foxhole' && o.kind !== 'barrier' && o.kind !== 'warship'
      && Math.max(Math.abs(k.pos.x - o.x) - o.hw, 0) ** 2 + Math.max(Math.abs(k.pos.z - o.z) - o.hd, 0) ** 2 < r * r);
  }

  // A hard landing: dust and a few chips.
  thud(k, speed) {
    const at = _v.set(k.pos.x, this.floor(k.pos.x, k.pos.z) + .2, k.pos.z);
    if (k.t - (k.lastThud ?? -1) > .15) { k.lastThud = k.t; sfx.rockThud(k.pos, speed); }
    this.fx.puff(at, { color: 0x8a6c48, size: .9, grow: 3, life: 1.2, opacity: .5, vel: new THREE.Vector3((Math.random() - .5) * 2, 1, (Math.random() - .5) * 2) });
    for (let i = 0; i < Math.min(5, speed * .5); i++) this.debris.chunk(at, this.chipMat, .05 + Math.random() * .1, 1.2);
  }

  // Come to rest: it blocks like a wall and can be shot up.
  stop(k, quiet = false) { // quiet: a saved game being put back
    if (k.temp) { this.shatter(k); return; } // (a boss's boulder breaks up where it stops)
    k.state = 'down'; k.vel.set(0, 0, 0); k.pos.y = this.floor(k.pos.x, k.pos.z) + R * .7; k.mesh.position.copy(k.pos); if (!quiet) sfx.rockThud(k.pos, 5);
    this.addBlock(k);
    if (!k.target) this.addTarget(k);
  }
  addBlock(k) {
    k.block = { x: k.pos.x, z: k.pos.z, hw: R * .9, hd: R * .9, alive: true, kind: 'column' }; // (kind: stops rockets like standing stonework)
    this.world.obstacles.push(k.block);
  }
  addTarget(k) { // a target the jeep's weapons can hit, from the first shudder: while it falls and rolls too (it follows the boulder)
    k.target = { object: k.mesh, x: 0, z: 0, hw: R * 1.1, hd: R * 1.1, r: R * 1.3, hp: HP, score: SCORE, die: () => this.shatter(k) };
    this.world.targets.push(k.target); this.placeTarget(k);
  }
  placeTarget(k) { k.target.x = k.pos.x; k.target.z = k.pos.z + k.pos.y * SHOW_SOUTH; }

  // Broken up by the jeep's weapons (shuddering, falling, rolling or lying there): pieces of rock and a cloud of dust; the way is clear.
  shatter(k) {
    const at = k.pos.clone(), r = () => (Math.random() - .5) * 2;
    sfx.rockSmash(at); this.debris.burying = !!k.temp; // (a boss's boulder: its pieces sink into the ground once they settle)
    for (let i = 0; i < 3; i++) this.fx.puff(at.clone().add(new THREE.Vector3(r() * .6, .2 + Math.random() * .5, r() * .6)), { color: i % 2 ? 0x7a5c38 : 0x9a7a52, size: .45 + Math.random() * .25, grow: 1.1, life: .8 + Math.random() * .4, opacity: .4, vel: new THREE.Vector3(r() * .7, .5 + Math.random() * .5, r() * .7) }); // just a little brownish dust: the pieces flying are the show
    for (let i = 0; i < 9; i++) this.debris.chunk(_v.copy(at).add(new THREE.Vector3(r() * .6, Math.random() * .8, r() * .6)), this.chipMat, .15 + Math.random() * .3, 1.5);
    this.debris.burying = false;
    this.scene.remove(k.mesh);
    if (k.block) k.block.alive = false;
    const i = this.world.targets.indexOf(k.target); if (i >= 0) this.world.targets.splice(i, 1);
    k.state = 'gone';
  }

  // Saved games: still on its edge, lying where it stopped, or broken up (one caught on its way is put down where it is).
  snapshot() {
    const r = v => Math.round(v * 100) / 100;
    return this.rocks.filter(k => !k.temp).map(k => k.state === 'wait' || k.state === 'crack' ? { st: 'wait' } : k.state === 'gone' ? { st: 'gone' } : { st: 'down', x: r(k.pos.x), z: r(k.pos.z), hp: k.target?.hp ?? HP });
  }
  restore(list) {
    this.rocks.forEach((k, i) => {
      const d = list?.[i]; if (!d || k.state !== 'wait') return;
      if (d.st === 'gone') { this.scene.remove(k.mesh); k.state = 'gone'; }
      else if (d.st === 'down') { k.pos.set(d.x, 0, d.z); this.stop(k, true); k.target.hp = d.hp; }
    });
  }
}
