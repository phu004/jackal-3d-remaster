// Stage 6's arena gate: a chain-link fence with razor wire across the whole width of the map that seals off the container arena at the north end; in the middle of it a doorway closed by a curtain of red
// energy (the same look as stage 3's laser maze, standing still, made brighter so it reads from afar, and mirrored in the wet road), between two small fortified towers, each carrying a laser cannon that is a remaster
// of the NES map's turret sprite. THE LOOK ONLY, for now: the fence and the towers stop the jeep and the curtain is just drawn (it does not hurt, the cannons do not fire yet).
//
//   cfg: { z, scale (the structure's size against its first design: .67), gap (the doorway's width, m), halfWidth (the fence runs out to this, m) }
//   named parts, per tower: `head` (the cannon's turning head: its front is +Z, the south, where the jeep comes from), `muzzle` (at the end of the barrel)
import * as THREE from 'three';
import { buildFences } from './fences.js';
import { laserCurtain } from './lasers.js';
import { mergeStatic, mergeAcross } from './optimize.js';

const concreteTexture = () => { // poured panels: grey with joints, tie-holes, water stains
  const S = 256, c = document.createElement('canvas'); c.width = c.height = S; const x = c.getContext('2d');
  x.fillStyle = '#6d7075'; x.fillRect(0, 0, S, S);
  for (let i = 0; i < 2600; i++) { x.fillStyle = Math.random() < .5 ? 'rgba(255,255,255,.05)' : 'rgba(0,0,0,.07)'; x.fillRect(Math.random() * S, Math.random() * S, 1 + Math.random() * 3, 1 + Math.random() * 3); }
  x.strokeStyle = 'rgba(25,27,30,.55)'; x.lineWidth = 2; x.strokeRect(0, 0, S, S); x.beginPath(); x.moveTo(0, S / 2); x.lineTo(S, S / 2); x.moveTo(S / 2, 0); x.lineTo(S / 2, S); x.stroke();
  for (const [hx, hy] of [[S / 4, S / 4], [S * .75, S / 4], [S / 4, S * .75], [S * .75, S * .75]]) { x.fillStyle = 'rgba(20,22,25,.6)'; x.beginPath(); x.arc(hx, hy, 4, 0, 7); x.fill(); }
  for (let i = 0; i < 14; i++) { const px = Math.random() * S, g = x.createLinearGradient(0, 0, 0, 40 + Math.random() * 150); g.addColorStop(0, 'rgba(35,30,25,.22)'); g.addColorStop(1, 'rgba(35,30,25,0)'); x.save(); x.translate(px, 0); x.fillStyle = g; x.fillRect(0, 0, 2 + Math.random() * 5, 190); x.restore(); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; return t;
};
const hazardTexture = () => { // red and white diagonal warning stripes, worn
  const W = 256, H = 64, c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d');
  x.fillStyle = '#d9d6cc'; x.fillRect(0, 0, W, H); x.fillStyle = '#b3201a';
  for (let i = -H; i < W + H; i += 48) { x.beginPath(); x.moveTo(i, H); x.lineTo(i + 24, H); x.lineTo(i + 24 + H, 0); x.lineTo(i + H, 0); x.closePath(); x.fill(); }
  for (let i = 0; i < 900; i++) { x.fillStyle = `rgba(30,25,20,${Math.random() * .09})`; x.fillRect(Math.random() * W, Math.random() * H, 2 + Math.random() * 3, 1 + Math.random() * 2); }
  const g = x.createLinearGradient(0, H * .6, 0, H); g.addColorStop(0, 'rgba(30,25,20,0)'); g.addColorStop(1, 'rgba(30,25,20,.35)'); x.fillStyle = g; x.fillRect(0, 0, W, H);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; return t;
};

// The curtain's materials add light and return an alpha of 1 everywhere. On the screen that does not matter, but the road's mirror keeps the alpha of what it draws, so every dark pixel (the gaps between the scan
// lines, the soft edges) was opaque black there. So the alpha follows the brightness, and the light is added with the same factors on colour and alpha.
const lightOnly = mat => {
  mat.blending = THREE.CustomBlending; mat.blendEquation = THREE.AddEquation; mat.blendSrc = THREE.OneFactor; mat.blendDst = THREE.OneFactor; mat.blendSrcAlpha = THREE.OneFactor; mat.blendDstAlpha = THREE.OneFactor;
  mat.fragmentShader = mat.fragmentShader.replace(/gl_FragColor = vec4\((.*), 1\.0\);/, (m, rgb) => `{ vec3 lc = ${rgb}; gl_FragColor = vec4(lc, clamp(max(lc.r, max(lc.g, lc.b)), 0.0, 1.0)); }`);
  mat.needsUpdate = true;
};

export class ArenaGate {
  constructor(scene, world, cfg) {
    const { z, scale: S = .67, halfWidth = 42, gap = 12, eastExtra = 0 } = cfg; // eastExtra: m the east fence runs on past the west one's length
    const halfGap = gap / 2, towerW = 5 * S, height = 4.8 * S;
    Object.assign(this, { scene, world, z, S, halfGap, towerW, halfWidth, height, time: 0, glows: [], beacons: [] });
    this.tune = { curtain: 1, ground: .6, reflection: .5, light: 1 }; // (the curtain's strength, its glow on the ground, how strongly the road mirrors it, and its red light on what is near)
    this.M = {
      concrete: new THREE.MeshStandardMaterial({ map: concreteTexture(), roughness: .85, metalness: .05, envMapIntensity: .3 }),
      hazard: new THREE.MeshStandardMaterial({ map: hazardTexture(), roughness: .7, metalness: .1, envMapIntensity: .3 }),
      steel: new THREE.MeshStandardMaterial({ color: 0x3d4348, roughness: .42, metalness: .75, envMapIntensity: .5 }),
      armour: new THREE.MeshStandardMaterial({ color: 0x4a5056, roughness: .38, metalness: .7, envMapIntensity: .55 }),
      silver: new THREE.MeshStandardMaterial({ color: 0xbcc0c6, roughness: .32, metalness: .65, envMapIntensity: .7 }),   // the cannon's: silver-white, as the NES draws it
      white: new THREE.MeshStandardMaterial({ color: 0xeceef0, roughness: .35, metalness: .4, envMapIntensity: .6 }),
      pylon: new THREE.MeshStandardMaterial({ map: (() => { const t = concreteTexture(); t.repeat.set(8, 2); return t; })(), color: 0xd4d8dc, roughness: .6, metalness: .2, envMapIntensity: .45 }),
      silver: new THREE.MeshStandardMaterial({ color: 0xbcc0c6, roughness: .32, metalness: .65, envMapIntensity: .7 }),
      white: new THREE.MeshStandardMaterial({ color: 0xeceef0, roughness: .35, metalness: .4, envMapIntensity: .6 }),
      dark: new THREE.MeshStandardMaterial({ color: 0x15171a, roughness: .6, metalness: .5 }),
      rail: new THREE.MeshStandardMaterial({ color: 0x9aa0a4, roughness: .35, metalness: .85, envMapIntensity: .6 }),
      red: new THREE.MeshStandardMaterial({ color: 0x300604, emissive: 0xff2a12, emissiveIntensity: 1.6, roughness: .2, metalness: .2 }),
    };
    // the fence, both sides of the gate, out past the map's edges
    const gx = halfGap + towerW;
    this.parts = []; // (everything the wet road mirrors: each its own group in the scene, standing at its own place)
    for (const f of buildFences(scene, { fences: [{ x0: -halfWidth, x1: -gx, z, h: 3.9 }, { x0: gx, x1: halfWidth + eastExtra, z, h: 3.9 }], heightAt: () => 0 })) {
      // the fence's pieces are placed in world coordinates round a group at the origin; the mirror switches off a whole group that is far from where the camera looks, judged by its position, so the group is moved to its own centre
      const c = new THREE.Box3().setFromObject(f).getCenter(new THREE.Vector3()); c.y = 0; for (const ch of f.children) ch.position.sub(c); f.position.add(c); this.parts.push(f);
    }
    this.root = scene; this.towerList = []; // (towerList: for the fight: each tower's group, side and obstacle, see gate-fight.js)
    for (const sg of [-1, 1]) {
      const hwid = halfWidth + (sg > 0 ? eastExtra : 0); world.obstacles.push({ x: sg * (gx + hwid) / 2, z, hw: (hwid - gx) / 2, hd: .35, alive: true, kind: 'barrier' }); // (the jeep and the men cannot pass; shots fly over, as the other fences')
      const t = this.tower(sg); t.scale.setScalar(S); t.position.set(sg * (halfGap + towerW / 2), 0, z); this.root.add(t); this.parts.push(t);
      const ob = { x: t.position.x, z, hw: towerW / 2, hd: towerW / 2, alive: true, kind: 'wall' }; world.obstacles.push(ob); this.towerList.push({ side: sg, group: t, obstacle: ob });
    }
    this.doorway();
    { const n0 = scene.children.length; mergeAcross(this.towerList.map(t => t.group), scene, { skip: n => n.name === 'head' }); for (const m of scene.children.slice(n0)) this.parts.push(m); } // (the two towers' static bodies, which use the same materials, are joined into one set of meshes: 16 draw calls become 8; the cannon heads, which turn, stay on their towers)
    for (const p of this.parts) world.flagMirror?.(p); // (the wet road mirrors the fence, the towers, the posts and the curtain)
  }

  box(g, w, h, d, mat, x, y, z, cast = true) { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); m.castShadow = cast; m.receiveShadow = true; g.add(m); return m; }

  // One tower (side -1 west, +1 east), built at 5 m across and shrunk by the caller: a squat armoured bunker, faceted like a fortress bastion: a low concrete plinth, an eight-sided gunmetal body with near-vertical walls,
  // buttress fins at its corners, red visor slits and bands of armour, a broad overhanging deck and the turret's slewing ring on top. On that, the cannon.
  tower(side) {
    const { M } = this, g = new THREE.Group(); g.name = 'gateTower';
    const oct = (r0, r1, h, y, mat) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, h, 8, 1), mat); m.position.y = y + h / 2; m.castShadow = m.receiveShadow = true; g.add(m); return m; };
    oct(2.75, 2.6, .35, 0, M.pylon);                                   // the concrete plinth
    oct(2.35, 2.2, .35, .35, M.steel);                                 // a stepped footing
    oct(2.15, 1.95, 3.3, .7, M.armour);                                // the body: eight flat walls, nearly upright
    oct(2.2, 2.2, .16, 1.9, M.steel); oct(2.2, 2.2, .16, 3.2, M.steel); // two heavy armour bands
    oct(1.95, 2.45, .3, 4.0, M.steel);                                 // the deck flaring out over the body
    oct(2.45, 2.45, .1, 4.3, M.rail);                                  // its rim
    oct(1.45, 1.35, .38, 4.4, M.dark);                                 // the turret's slewing ring
    for (let k = 0; k < 8; k++) {
      const a = k * Math.PI / 4, c = Math.sin(a), d = Math.cos(a);     // (corners at k*45 degrees) buttress fins up the corners, leaning in at the top
      const fin = this.box(g, .34, 3.0, .6, M.steel, c * 2.12, 2.25, d * 2.12); fin.rotation.y = a;
      const f2 = (k + .5) * Math.PI / 4, fc = Math.sin(f2), fd = Math.cos(f2); // (wall centres) a visor slit lit red on each wall
      const slit = new THREE.Mesh(new THREE.BoxGeometry(.9, .13, .06), M.red); slit.position.set(fc * 2.0, 2.65, fd * 2.0); slit.rotation.y = f2; g.add(slit); this.glows.push(slit);
    }
    for (let k = 0; k < 8; k++) { // detail on the walls (a wall's centre is at (k + .5) * 45 degrees; its plate, a lower and upper panel, rivets, and on some a vent)
      const f = (k + .5) * Math.PI / 4, c = Math.sin(f), d = Math.cos(f), at = (r, y, ox = 0) => [c * r + d * ox, y, d * r - c * ox];
      const hi = this.box(g, 1.25, .62, .08, M.rail, ...at(2.03, 3.55)); hi.rotation.y = f;                           // an upper armour plate
      const lo = this.box(g, 1.3, 1.05, .08, M.dark, ...at(2.05, 1.5)); lo.rotation.y = f;                             // a lower panel, dark
      for (const ox of [-.5, .5]) for (const y of [3.3, 3.8]) { const rv = this.box(g, .07, .07, .05, M.silver, ...at(2.09, y, ox), false); rv.rotation.y = f; } // rivets on the upper plate
      if (k % 2 === 0) { for (let n = 0; n < 4; n++) { const v = this.box(g, .9, .045, .06, M.steel, ...at(2.1, 1.25 + n * .13), false); v.rotation.y = f; } } // a louvred vent on the lower panel
      else { const hatch = this.box(g, .6, .6, .06, M.steel, ...at(2.09, 1.5), false); hatch.rotation.y = f; const wheel = new THREE.Mesh(new THREE.TorusGeometry(.14, .02, 6, 14), M.silver); wheel.position.set(...at(2.14, 1.5)); wheel.rotation.y = f; g.add(wheel); } // an access hatch with its wheel
    }
    for (let k = 0; k < 8; k++) { // concrete anchor blocks at the foot, and brackets holding the turret ring to the deck
      const a = (k + .5) * Math.PI / 4, blk = this.box(g, .9, .5, .5, M.pylon, Math.sin(a) * 2.7, .25, Math.cos(a) * 2.7); blk.rotation.y = a;
      const br = this.box(g, .18, .45, .4, M.steel, Math.sin(a + .4) * 1.5, 4.6, Math.cos(a + .4) * 1.5, false); br.rotation.y = a + .4;
    }
    for (const sx of [-1, 1]) { // sensor masts at the back corners of the deck, with a small red warning lamp each, and a floodlight facing the doorway
      const mx = sx * 1.9, mz = -1.25;
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(.03, .045, 1.5, 6), M.rail); mast.position.set(mx, 5.15, mz); g.add(mast);
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(.07, 8, 6), M.red); lamp.position.set(mx, 5.92, mz); g.add(lamp); this.glows.push(lamp);
      const fl = this.box(g, .3, .22, .3, M.dark, sx * 1.55, 4.65, 1.5); fl.rotation.y = -sx * .4;
    }
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.4, .045, 8, 40), M.red); ring.rotation.x = Math.PI / 2; ring.position.y = 4.62; g.add(ring); this.glows.push(ring);   // a thin red light round the turret ring
    this.cannon(g, 4.78, side);
    mergeStatic(g);
    return g;
  }

  // The cannon, after the NES map's turret sprite (seen from above) and unlike the roof turret: a white central housing with the one long barrel running south from it, a pair of curved silver armour wings either side,
  // side pods with dark vertical slits, flaps at the front, and four prongs standing at the back.
  cannon(g, y0, side) {
    const { M } = this, head = new THREE.Group(); head.name = 'head'; head.position.y = y0 + .05; g.add(head);
    this.box(head, 1.0, .95, 1.7, M.white, 0, .45, -.1);                                              // the white central housing
    this.box(head, .5, .5, .7, M.silver, 0, .98, -.3);                                                // a raised hatch on it
    const wing = sx => { // a curved armour wing: a crescent plate, thick at the middle, tapering to a tip at the front and the back
      const sh = new THREE.Shape(); sh.moveTo(0, -1.45); sh.quadraticCurveTo(1.55, -.9, 1.7, .1); sh.quadraticCurveTo(1.7, .9, .75, 1.35); sh.lineTo(.5, 1.0); sh.quadraticCurveTo(1.05, .5, .95, 0); sh.quadraticCurveTo(.9, -.55, 0, -.95); sh.closePath();
      const geo = new THREE.ExtrudeGeometry(sh, { depth: .45, bevelEnabled: true, bevelThickness: .05, bevelSize: .05, bevelSegments: 2 }); geo.rotateX(Math.PI / 2); // (the outline is laid flat: x across, z along; the depth is up)
      const m = new THREE.Mesh(geo, M.silver); m.position.set(0, .9, 0); m.scale.x = sx; m.castShadow = true; head.add(m);
    };
    wing(1); wing(-1);
    for (const sx of [-1, 1]) {
      this.box(head, .55, .75, 1.3, M.armour, sx * .95, .4, .35);                                      // side pods
      for (let k = 0; k < 3; k++) this.box(head, .05, .45, .06, M.dark, sx * (.85 + k * .12), .4, 1.02, false);                          // dark vertical slits on the pods' fronts
      const flap = this.box(head, 1.5, .12, .38, M.silver, sx * 1.05, .3, 1.45); flap.rotation.y = -sx * .38;                             // the flaps at the front
    }
    for (const px of [-1.05, -.35, .35, 1.05]) { const prong = this.box(head, .16, .6, .34, M.silver, px, .7, -1.55); prong.rotation.x = -.35; }  // the four prongs at the back
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(.2, .26, 3.4, 16), M.white); barrel.rotation.x = Math.PI / 2; barrel.position.set(0, .55, 2.45); barrel.castShadow = true; head.add(barrel);
    const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(.34, .34, 1.2, 16), M.silver); sleeve.rotation.x = Math.PI / 2; sleeve.position.set(0, .55, 1.15); sleeve.castShadow = true; head.add(sleeve);
    for (let k = 0; k < 3; k++) { const coil = new THREE.Mesh(new THREE.TorusGeometry(.27, .045, 8, 20), M.red); coil.position.set(0, .55, 2.2 + k * .5); head.add(coil); this.glows.push(coil); } // glowing coils: it is a laser
    const bell = new THREE.Mesh(new THREE.CylinderGeometry(.3, .22, .3, 16), M.dark); bell.rotation.x = Math.PI / 2; bell.position.set(0, .55, 4.25); head.add(bell);
    const lens = new THREE.Mesh(new THREE.SphereGeometry(.17, 14, 10), M.red); lens.position.set(0, .55, 4.42); head.add(lens); this.glows.push(lens);
    const mz = new THREE.Object3D(); mz.name = 'muzzle'; mz.position.set(0, .55, 4.55); head.add(mz);
    mergeStatic(head); // (the cannon's own pieces: a draw call a material, not a piece; its muzzle point stays a named part)
    head.rotation.y = side * .1; // (a touch inward: they cover the doorway)
  }

  // The doorway between the towers: an emitter post on each tower's inner face, and the red curtain between them (open to the sky: no roof over it).
  doorway() {
    const { M, halfGap, z, height, S } = this, g = new THREE.Group(), len = 2 * halfGap; g.name = 'gateDoor';
    for (const sg of [-1, 1]) {
      this.box(g, .6 * S, height, .6 * S, M.steel, sg * (halfGap - .3 * S), height / 2, 0);            // the emitter posts
      for (const hy of [.4, height * .5, height - .4]) { const l = new THREE.Mesh(new THREE.BoxGeometry(.18, .4 * S + .1, .7 * S), M.red); l.position.set(sg * (halfGap - .62 * S), hy, 0); g.add(l); this.glows.push(l); }
    }
    mergeStatic(g);
    g.position.z = z; this.root.add(g); this.parts.push(g);
    // the curtain: the maze lasers' own (stage 3's), standing still. It and its glow on the ground are drawn after the wet road's film, which would otherwise paint the container's reflection over them; and each is made fainter
    // when the road's mirror draws it (the mirror's camera is below the ground), by the slider.
    const w = len - 1.2 * S, T = this.tune;
    this.curtain = laserCurtain(w, [1, .1, .05], height - .15); this.curtain.group.position.set(0, 0, z); this.root.add(this.curtain.group); this.parts.push(this.curtain.group);
    lightOnly(this.curtain.field.material); lightOnly(this.curtain.glow.material);
    this.curtain.field.renderOrder = 6; this.curtain.glow.renderOrder = 5;
    const fieldMat = this.curtain.field.material, glowMat = this.curtain.glow.material; // (kept: the live profile swaps every mesh's material for a plain one, which has no uniforms)
    this.curtain.field.onBeforeRender = (r, sc, cam) => { fieldMat.uniforms.uAlpha.value = T.curtain * (cam.position.y < 0 ? T.reflection : 1); };
    this.curtain.glow.onBeforeRender = (r, sc, cam) => { glowMat.uniforms.uAlpha.value = T.curtain * T.ground * (cam.position.y < 0 ? T.reflection : 1); };
  }

  // The curtain's red light on what stands round it, as stage 3's laser maze does: the paint of the jeep and of any container close by takes a red diffuse term from the curtain (lasers.js), stronger the nearer and
  // only on the faces turned toward it. (The towers are too big for that: it lit all of one at once, so they are left out.) `lasers` is the game's Lasers; the curtain is added to its list of extra curtains, and each thing here is tracked by it.
  lightUp(lasers) {
    this.lasers = lasers; const w = 2 * this.halfGap - 1.2 * this.S;
    this.L = { from: new THREE.Vector3(-w / 2, 0, this.z), out: new THREE.Vector3(1, 0, 0), len: w, glow: 1, reach: 6 };
    (lasers.extra ??= []).push(this.L);
    this.lit = [];
    for (const o of this.scene.children) if (o.isGroup && (o.name === 'container' || o.name === 'containerPile') && Math.hypot(o.position.x, o.position.z - this.z) < 9) this.lit.push([o, o.position]);
    for (const [obj] of this.lit) if (obj) lasers.track(obj);
  }

  // The two cannons are down: the red curtain fades out and the way through is open.
  open() { if (this.opening === undefined) this.opening = 1; }
  // ...at once, with no fade (a saved game that was saved after the fight: the gate is open when it loads)
  openNow() { this.opening = 0; this.tune.curtain = 0; this.curtain.group.visible = false; const i = this.lasers?.extra?.indexOf(this.L) ?? -1; if (i >= 0) this.lasers.extra.splice(i, 1); this.L = null; this.isOpen = true; }

  // The curtain comes back (the jeep is inside, the fight is on): fades in across the doorway and lights the paint again.
  close() {
    this.opening = undefined; this.isOpen = false; this.closing = true; this.tune.curtain = 0; this.curtain.group.visible = true;
    if (!this.L && this.lasers) { const w = 2 * this.halfGap - 1.2 * this.S; this.L = { from: new THREE.Vector3(-w / 2, 0, this.z), out: new THREE.Vector3(1, 0, 0), len: w, glow: 1, reach: 6 }; (this.lasers.extra ??= []).push(this.L); }
  }

  update(dt) {
    this.time += dt;
    if (this.closing) { this.tune.curtain = Math.min(1, this.tune.curtain + dt / .8); if (this.tune.curtain >= 1) this.closing = false; }
    if (this.opening > 0) { // fading the curtain out, then it and its red light are gone
      this.opening = Math.max(0, this.opening - dt / 1.1); this.tune.curtain = this.opening;
      if (this.opening === 0) { this.curtain.group.visible = false; const i = this.lasers?.extra?.indexOf(this.L) ?? -1; if (i >= 0) this.lasers.extra.splice(i, 1); this.L = null; this.isOpen = true; }
    }
    if (this.L) { this.L.glow = Math.min(1.2, this.tune.curtain) * this.tune.light; for (const [obj, f] of this.lit) if (obj) this.lasers.expose(this.lasers.track(obj), f); }
    const k = .75 + .25 * Math.sin(this.time * 3.1) + .06 * (Math.random() - .5);   // the cannons' coils and the lights breathe
    for (const m of this.glows) m.material.emissiveIntensity = 1.2 + 1.2 * k;
    this.beacons.forEach((b, i) => { b.material.emissiveIntensity = Math.sin(this.time * 4 + i * 1.6) > .2 ? 3 : .3; }); // the beacons blink, round the platform in turn
    this.curtain.update(this.time, this.tune.curtain);
  }
}
