// Camouflaged turrets (stage 3, in the hatched squares by the boss). A thin round lid set in the road, painted with the road's own texture and stripes so it cannot be told from it, lies there until the
// jeep is near and the gun is on screen. Then it lifts a little and splits open down the middle, the gun pod rises, and it fires a fan of shells (two
// volleys), sinks back and the lid closes and settles back while it reloads, and so on. Only while it is out can it be hurt.
import { mergeStatic, dropTinyShadows } from './optimize.js';
import * as THREE from 'three';
import { add, mat, cached, PI, roundedRect } from '../assets/common.js';

const ACTIVE_BEYOND = -385.8; // the jeep must have driven north past this z before they wake (they stay hidden till then; a stage can set its own: camoBeyond)
const WAKE = 30;             // m: the jeep this near (and the gun on screen) and it comes up
const RANGE = 26;            // m: its shells' reach
const OPEN_TIME = .45, RISE_TIME = .5, SINK_TIME = .4, CLOSE_TIME = .4; // s
const VOLLEYS = 1, VOLLEY_GAP = .5, SPREAD = [-.6, -.3, 0, .3, .6]; // rad: the fan of shells in each volley
const FIRST = .35, RELOAD = [2.6, 3.6]; // s: out before the first volley, and shut away between bursts
const HOLD = .5;             // s the gun stays out after its last volley
const HURT_ABOVE = .6;       // out this far (0..1) and it can be hurt
const HP = 4, SCORE = 300, SINK = 1.7; // m the pod lies below the road
const HIT_R = 1.7; // half-size of its hit box when out
const AIM_DELAY = .6;
const rand = ([a, b]) => a + Math.random() * (b - a);
const smooth = t => t * t * (3 - 2 * t);
const _m = new THREE.Vector3(), _d = new THREE.Vector3();

const PIT_DEPTH = 2.0; // m the hole goes down (the gun's pod lies in it)
const LID_R = 1.3, LID_H = .3, LID_TOP = .1, LIFT = .16, LIFT_TIME = .35; // m: the lid is a thin cylinder set in the road (30 cm thick, its top 10 cm above the road: a hint that something is there); it lifts this far before splitting

// Machinery: dark steel plates with seams, rivets, a gear and some pipework (for the hole's floor and the gun's body).
function machineryTexture() {
  return cached('camoMachinery', () => {
    const c = document.createElement('canvas'); c.width = c.height = 256; const x = c.getContext('2d');
    x.fillStyle = '#5a6064'; x.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 1400; i++) { x.fillStyle = Math.random() > .5 ? 'rgba(255,255,255,.08)' : 'rgba(0,0,0,.12)'; x.fillRect(Math.random() * 256, Math.random() * 256, 1 + Math.random() * 3, 1); } // brushed grain
    for (let gx = 0; gx < 256; gx += 64) for (let gy = 0; gy < 256; gy += 64) { // plates: a bevel, and a rivet in each corner
      x.fillStyle = (gx + gy) % 128 ? '#6a7074' : '#565c60'; x.fillRect(gx + 2, gy + 2, 60, 60);
      x.strokeStyle = 'rgba(0,0,0,.7)'; x.lineWidth = 2; x.strokeRect(gx + 1, gy + 1, 62, 62);
      x.strokeStyle = 'rgba(200,210,215,.18)'; x.lineWidth = 1; x.strokeRect(gx + 3.5, gy + 3.5, 57, 57);
      for (const [rx, ry] of [[7, 7], [57, 7], [7, 57], [57, 57]]) { x.fillStyle = '#1b1d1e'; x.beginPath(); x.arc(gx + rx, gy + ry, 2.6, 0, 6.3); x.fill(); x.fillStyle = 'rgba(210,215,220,.35)'; x.fillRect(gx + rx - 1, gy + ry - 1.5, 1.5, 1); }
    }
    x.fillStyle = '#7a8286'; x.beginPath(); x.arc(64, 64, 26, 0, 6.3); x.fill(); // a gear
    for (let i = 0; i < 12; i++) { const a = i / 12 * 6.283; x.fillRect(64 + Math.cos(a) * 26 - 3.5, 64 + Math.sin(a) * 26 - 3.5, 7, 7); }
    x.fillStyle = '#3a3e41'; x.beginPath(); x.arc(64, 64, 15, 0, 6.3); x.fill(); x.fillStyle = '#8a9296'; x.beginPath(); x.arc(64, 64, 6, 0, 6.3); x.fill();
    for (const [py, col] of [[160, '#9a7a3a'], [176, '#3f8a90']]) { // pipes across the lower half, with collars
      x.fillStyle = col; x.fillRect(0, py, 256, 10); x.fillStyle = 'rgba(255,255,255,.2)'; x.fillRect(0, py + 2, 256, 2); x.fillStyle = 'rgba(0,0,0,.35)'; x.fillRect(0, py + 7, 256, 3);
      for (let cx = 20; cx < 256; cx += 70) { x.fillStyle = '#23262a'; x.fillRect(cx, py - 3, 8, 16); }
    }
    x.fillStyle = '#17191a'; for (let i = 0; i < 5; i++) x.fillRect(150 + i * 10, 20, 5, 36); // vent slots
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
    return t;
  });
}

// The lid's top: the ground's own material and texture coordinates, with the markings image painted over it as on the road, so while it lies in the road it is the road.
function lidTopMaterial(world, at) {
  const m = world.groundMat.clone(), crop = world.markingCrop(at.x, at.z, LID_R + .4);
  m.polygonOffset = true; m.polygonOffsetFactor = -1; m.polygonOffsetUnits = -1;
  m.onBeforeCompile = sh => {
    world.groundBase(sh); // (the road's fine grain, without the holes)
    if (!crop) return;
    sh.uniforms.markMap = { value: crop.tex }; sh.uniforms.markRect = { value: new THREE.Vector4(...crop.rect) };
    sh.fragmentShader = 'uniform sampler2D markMap;\nuniform vec4 markRect;\n' + sh.fragmentShader.replace('diffuseColor.rgb *= 1.0 + ( dsum - 1.0 ) * 1.3;',
      `diffuseColor.rgb *= 1.0 + ( dsum - 1.0 ) * 1.3;
	vec4 mk = texture2D( markMap, ( vUv - markRect.xy ) / markRect.zw );
	diffuseColor.rgb = mix( diffuseColor.rgb, mk.rgb, step( 0.5, mk.a ) );`);
  };
  return m;
}

// The model: a pit under two half-lids (thin half-cylinders), and the pod (a stalk with a head and three barrels) that rises out of it.
function buildCamoTurret(world, at) {
  const m = cached('camoTurretMats', () => ({
    edge: mat(0x55585a, .6, .5), // the lid's edge, seen once it has lifted
    pod: mat(0xc8ced2, .55, .45, { map: machineryTexture() }), head: mat(0x202325, .35, .6), trim: mat(0x3a3f43, .4, .65), barrel: mat(0x2a2d30, .3, .75), chrome: mat(0xc4cacf, .2, .9), slot: mat(0x050505, .9, 0), // (the gun itself stays dark, polished metal)
    accent: mat(0xc89a20, .5, .3), eye: new THREE.MeshStandardMaterial({ color: 0x300606, emissive: 0xff2410, emissiveIntensity: 1.6, roughness: .3 }),
  }));
  const top = lidTopMaterial(world, at); top.userData.noDim = true; top.userData.lidTop = true; // (the road is not dimmed in stage 6's overcast light, so neither is its lid)
  const lidTop = world.wetRoad ? .02 : LID_TOP; // (stage 6's wet road: its film lies 3.5 cm above the ground, and the lid's top must lie below it, so the lid is darkened and wetted with the road round it, not left bare and pale on top of it)
  const root = new THREE.Group(); root.name = 'camoTurret';
  // The hole is a real recess: the ground is not drawn inside its opening while it is open (a fragment test in the ground's shader, not a cut in the mesh), see world.camoHoles.
  const pit = new THREE.Group(); pit.name = 'pit'; root.add(pit);
  const dk = world.wetRoad ? .3 : 1; // (stage 6's overcast, wet road: the pit is deep and in shadow, dark like the road round it, not a pale disc)
  const pitMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(0x80868a).multiplyScalar(dk), map: machineryTexture(), roughness: .8, metalness: .3, envMapIntensity: .2 });
  const wallTex = machineryTexture().clone(); wallTex.repeat.set(5, 3); wallTex.needsUpdate = true;
  const wallMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(0x90969a).multiplyScalar(dk), map: wallTex, side: THREE.BackSide, vertexColors: true, roughness: .8, metalness: .3, envMapIntensity: .2 });
  const wallGeo = new THREE.CylinderGeometry(LID_R, LID_R - .05, PIT_DEPTH, 28, 1, true), wc = [];
  for (let i = 0; i < wallGeo.attributes.position.count; i++) { const k = .35 + .65 * (wallGeo.attributes.position.getY(i) / PIT_DEPTH + .5); wc.push(k, k, k); } // (darker toward the bottom)
  wallGeo.setAttribute('color', new THREE.Float32BufferAttribute(wc, 3));
  const walls = add(pit, wallGeo, wallMat, 0, -PIT_DEPTH / 2, 0), floor = add(pit, new THREE.CircleGeometry(LID_R - .05, 28).rotateX(-PI / 2), pitMat, 0, -PIT_DEPTH, 0);
  walls.castShadow = floor.castShadow = false;
  if (world.wetRoad) { // the wet film hides the lids' pale colour, so the opening has to read by itself: a dark steel collar round the hole, and a near-black pit
    const collar = add(pit, new THREE.RingGeometry(LID_R - .05, LID_R + .14, 32).rotateX(-PI / 2), new THREE.MeshStandardMaterial({ color: 0x1b1d1f, roughness: .6, metalness: .5 }), 0, .022, 0); collar.castShadow = false; collar.name = 'collar';
  }
  const lids = new THREE.Group(); lids.name = 'lids'; root.add(lids); // (lifts as one, then the halves slide apart)
  for (const s of [-1, 1]) {
    const geo = new THREE.CylinderGeometry(LID_R, LID_R, LID_H, 28, 1, false, s < 0 ? PI : 0, PI), pos = geo.attributes.position, uv = geo.attributes.uv;
    for (let i = 0; i < pos.count; i++) { const [u, v] = world.groundUv(at.x + pos.getX(i), at.z + pos.getZ(i)); uv.setXY(i, u, v); } // (the top's coordinates are where it lies on the ground)
    const half = new THREE.Group(); half.name = s < 0 ? 'lidL' : 'lidR'; lids.add(half);
    const mesh = new THREE.Mesh(geo, [m.edge, top, m.edge]); mesh.position.y = lidTop - LID_H / 2; mesh.receiveShadow = true; half.add(mesh);
    add(half, new THREE.BoxGeometry(.02, LID_H, LID_R * 2), m.edge, 0, lidTop - LID_H / 2, 0).castShadow = false; // the flat cut face
  }
  const pod = new THREE.Group(); pod.name = 'pod'; root.add(pod);
  add(pod, new THREE.CylinderGeometry(.45, .55, 1.4, 20), m.pod, 0, .3, 0);                       // the stalk
  add(pod, new THREE.CylinderGeometry(.78, .78, .12, 24), m.trim, 0, .98, 0);                      // swivel collar
  add(pod, new THREE.TorusGeometry(.78, .04, 6, 24), m.chrome, 0, 1.05, 0).rotation.x = PI / 2;
  for (const sx of [-1, 1]) { // hydraulic rams either side
    add(pod, new THREE.CylinderGeometry(.07, .07, .8, 10), m.chrome, sx * .55, .45, .32);
    add(pod, new THREE.CylinderGeometry(.11, .11, .4, 10), m.trim, sx * .55, .15, .32);
  }
  const head = new THREE.Group(); head.name = 'head'; head.position.y = 1.35; pod.add(head);
  add(head, new THREE.CylinderGeometry(.62, .7, .16, 24), m.trim, 0, -.2, 0);                      // turntable
  const body = add(head, new THREE.ExtrudeGeometry(roundedRect(1.3, 1.2, .32), { depth: .3, bevelEnabled: true, bevelThickness: .09, bevelSize: .08, bevelSegments: 3 }), m.head, 0, -.12, 0);
  body.rotation.x = -PI / 2;                                                                         // armoured body
  add(head, new THREE.SphereGeometry(.32, 18, 10, 0, PI * 2, 0, PI / 2), m.head, 0, .27, .18);   // sensor dome
  add(head, new THREE.SphereGeometry(.085, 12, 10), m.eye, 0, .38, -.05);                          // its red eye
  add(head, new THREE.BoxGeometry(.9, .2, .1), m.slot, 0, .08, -.62);                              // gun port
  for (const sx of [-1, 1]) {
    const cheek = add(head, new THREE.BoxGeometry(.1, .34, .85), m.trim, sx * .72, .06, .05); cheek.rotation.z = sx * .18; // side armour
    add(head, new THREE.BoxGeometry(.3, .3, .52), m.trim, sx * .42, .3, .36);                       // ammunition boxes
    add(head, new THREE.BoxGeometry(.32, .06, .1), m.accent, sx * .42, .3, .26);                     // with a yellow band
    add(head, new THREE.BoxGeometry(.32, .06, .1), m.accent, sx * .42, .3, .46);
  }
  for (const [i, a] of [-.17, 0, .17].entries()) { // three shrouded barrels, splayed a little
    const g = new THREE.Group(); g.name = 'barrel' + i; g.rotation.y = a; head.add(g); const x = (i - 1) * .3; // (named: the merge leaves it as a group of its own, the wreck bends it)
    add(g, new THREE.CylinderGeometry(.115, .125, .55, 14), m.trim, x, 0, -.85).rotation.x = PI / 2;      // shroud
    add(g, new THREE.CylinderGeometry(.055, .065, 1.4, 12), m.barrel, x, 0, -1.1).rotation.x = PI / 2;
    add(g, new THREE.CylinderGeometry(.09, .09, .22, 12), m.chrome, x, 0, -1.75).rotation.x = PI / 2;      // muzzle brake
    add(g, new THREE.CylinderGeometry(.095, .095, .04, 12), m.slot, x, 0, -1.72).rotation.x = PI / 2;
  }
  const muzzle = new THREE.Object3D(); muzzle.name = 'muzzle'; muzzle.position.set(0, 0, -1.95); head.add(muzzle);
  return root;
}

export class CamoTurrets {
  constructor(scene, fx, debris, enemyFire) { this.scene = scene; this.fx = fx; this.debris = debris; this.enemyFire = enemyFire; this.list = []; }

  setup(world) {
    this.world = world;
    for (const p of world.camoSpots ?? []) {
      const obj = mergeStatic(buildCamoTurret(world, p)); obj.position.set(p.x, world.heightAt ? world.heightAt(p.x, p.z) : 0, p.z); dropTinyShadows(obj);
      this.scene.add(obj);
      const c = { obj, pit: obj.getObjectByName('pit'), lids: obj.getObjectByName('lids'), lidL: obj.getObjectByName('lidL'), lidR: obj.getObjectByName('lidR'), pod: obj.getObjectByName('pod'), head: obj.getObjectByName('head'),
        muzzle: obj.getObjectByName('muzzle'), state: 'shut', lift: 0, open: 0, up: 0, t: 0, reload: rand(RELOAD) * .5, volley: 0 };
      c.target = { object: obj, x: p.x, z: p.z, hw: -1, hd: -1, r: -50, hp: HP, score: SCORE, immune: true, wreck: () => this.wreck(c) };
      world.targets.push(c.target);
      world.turrets.push({ top: new THREE.Group(), base: obj, target: c.target, range: 0 }); // (counts toward the kill rate; it fires its own way)
      c.wet = !!world.wetRoad; c.rims = []; c.collar = c.pit.getObjectByName('collar'); c.lids.traverse(m => { if (m.isMesh && m.material?.userData?.lidTop) c.top = m.material; }); if (c.top) c.topBase = c.top.color.clone(); // (stage 6: the lid darkens as it lifts out from under the wet film, see pose)
      c.gap = world.camoGaps?.value[this.list.length]; c.hole = world.camoHoles?.value[this.list.length]; this.pose(c);
      this.list.push(c);
    }
  }

  pose(c) {
    const o = smooth(c.open), u = smooth(c.up);
    c.lids.position.y = (c.wet ? 0 : LIFT) * smooth(c.lift); // (on stage 6's wet road the lid never lifts: it stays under the wet film, so it looks like the road the whole time; it only slides apart)
    c.lidL.position.x = -1.35 * o; c.lidR.position.x = 1.35 * o;
    for (const r of c.rims) r.visible = c.open > 0;
    if (c.collar) c.collar.visible = c.state !== 'shut'; // (the steel collar round the hole shows while it is open, not as the lids close over it)
    c.pit.visible = c.open > 0; // (the full hole under the covers, which close over it)
    if (c.hole) c.hole.set(c.obj.position.x, c.obj.position.z, c.open > 0 ? LID_R : 0);
    if (c.gap) c.gap.set(c.obj.position.x, c.obj.position.z, c.open > 0 ? 1.35 * o : 0); // the road markings give way over the gap
    c.pod.position.y = -SINK + SINK * u; c.pod.visible = c.up > 0;
  }

  update(dt, world, player, onHit, cam) {
    const canShoot = player.enabled && !player.dead;
    for (const c of this.list) {
      if (c.state === 'dead') continue;
      const p = c.obj.position, dist = Math.hypot(player.position.x - p.x, player.position.z - p.z);
      switch (c.state) {
        case 'shut':
          if (c.open > 0) { c.open = Math.max(0, c.open - dt / CLOSE_TIME); break; } // (closes, then settles back into the road)
          if (c.lift > 0) { c.lift = Math.max(0, c.lift - dt / LIFT_TIME); break; }
          if (!canShoot || player.position.z > (world.camoBeyond ?? ACTIVE_BEYOND) || dist > WAKE || !cam.inPlayWindow(_m.copy(p).setY(1), 1)) break; // (stays asleep until it could be seen)
          if ((c.reload -= dt) <= 0) c.state = 'lifting';
          break;
        case 'lifting': // the lid rises a little out of the road, showing its edge
          c.lift = Math.min(1, c.lift + dt / LIFT_TIME);
          if (c.lift >= 1) c.state = 'opening';
          break;
        case 'opening':
          c.open = Math.min(1, c.open + dt / OPEN_TIME);
          if (c.open >= 1) c.state = 'rising';
          break;
        case 'rising':
          c.up = Math.min(1, c.up + dt / RISE_TIME);
          if (c.up >= 1) { c.state = 'out'; c.t = FIRST; c.volley = 0; }
          break;
        case 'out':
          if (canShoot) this.turn(c, dt);
          if ((c.t -= dt) > 0) break;
          if (c.volley < VOLLEYS && canShoot) { this.volley(c); c.volley++; c.t = c.volley < VOLLEYS ? VOLLEY_GAP : HOLD; }
          else c.state = 'sinking';
          break;
        case 'sinking':
          c.up = Math.max(0, c.up - dt / SINK_TIME);
          if (c.up <= 0) { c.state = 'shut'; c.reload = rand(RELOAD); }
          break;
      }
      this.pose(c);
      const hurt = c.up >= HURT_ABOVE;
      c.target.immune = !hurt;
      c.target.hw = c.target.hd = hurt ? HIT_R : -1; c.target.r = hurt ? HIT_R : -50;
    }
  }

  // Swing the head round toward the jeep.
  turn(c, dt) {
    const at = this.enemyFire.aim, p = c.obj.position;
    let d = Math.atan2(-(at.x - p.x), -(at.z - p.z)) - c.head.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d));
    c.head.rotation.y += d * Math.min(1, dt * 8);
  }

  // A fan of shells toward where the jeep was a moment ago.
  volley(c) {
    const from = c.muzzle.getWorldPosition(new THREE.Vector3()), at = this.enemyFire.aimAgo(AIM_DELAY, _m);
    const dx = at.x - from.x, dz = at.z - from.z, dist = Math.max(8, Math.hypot(dx, dz)), a = Math.atan2(dz, dx);
    for (const off of SPREAD) { _d.set(from.x + Math.cos(a + off) * dist, 0, from.z + Math.sin(a + off) * dist); this.enemyFire.shoot(from, RANGE, _d); }
    _d.set(Math.cos(a), 0, Math.sin(a)); this.fx.cannonLight?.(from, _d); // (one flare for the whole volley, lighting the gun head and the road round it)
  }

  // Blown up: the pod is wrecked and stays sunk; the lid is left open and scorched.
  wreck(c) {
    c.state = 'dead'; c.lift = c.open = 1; c.up = .5; this.pose(c); // the gun jammed half out of its hole
    const at = c.obj.position.clone(), burnt = new THREE.MeshStandardMaterial({ color: 0x1c1c1a, roughness: .9, flatShading: true });
    c.obj.traverse(o => { // charred (the lids' meshes have a list of materials); the hole itself keeps its look
      if (!o.isMesh || o.parent === c.pit) return;
      const burn = m => { m = m.clone(); m.color?.multiplyScalar(.35); m.onBeforeCompile = () => {}; return m; };
      o.material = Array.isArray(o.material) ? o.material.map(burn) : burn(o.material);
    });
    c.pod.rotation.set(.1, 0, -.3); c.head.rotation.x = .35; c.head.rotation.z = .3; c.lidR.rotation.z = .2; // buckled: the pod leans, the head droops, a lid half propped on the rim
    c.head.getObjectByName('muzzle').parent.children.filter(g => g.isGroup).forEach((g, i) => { g.rotation.x = (i - 1) * .22; }); // barrels bent every which way
    for (let i = 0; i < 8; i++) this.debris.chunk(at.clone().setY(.8), burnt, .12 + Math.random() * .2, 3);
    this.fx.scorch(at, 3); this.fx.smoke(at.clone().setY(.6), 8);
    if (this.fx.fires) { // a blaze in the hole and flames licking round the wreck
      const spots = [at.clone().setY(.2)], r = () => (Math.random() - .5) * 2;
      for (let i = 0; i < 4; i++) spots.push(at.clone().add(new THREE.Vector3(r() * .9, .1 + Math.random() * .6, r() * .9)));
      this.fx.fires.start(spots);
    }
  }

  snapshot() { return this.list.map(c => c.target.hp); }
  restore(data) {
    (data ?? []).forEach((hp, i) => { const c = this.list[i]; if (!c) return; c.target.hp = hp; if (hp <= 0) this.wreck(c); });
  }
}
