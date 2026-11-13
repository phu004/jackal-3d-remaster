// A wall-mounted gun: a low, armoured turret on a swivel collar, built to sit on top of a wall (stage 5's airbase). It is meant to look elegant and dangerous: a faceted wedge of gunmetal armour with sloped cheek plates,
// orange chevrons, a slim sensor pod with a glowing red lens, and one long barrel in a heat sleeve with a slotted muzzle brake. It fires and behaves like the ground gun emplacement (buildTurret in stage-props.js), with the
// same named parts: `turret` (yaws on Y; its front is -Z), `gun` (the barrel: slides back along +Z in recoil; it sits at the turret's origin, its pieces positioned inside it) and `muzzle` (inside `gun`).
// 1 unit = 1 m. Origin at the foot of the collar, on the wall's top. About 1.8 m across, 0.9 m high, the barrel reaching 2.8 m out.
import * as THREE from 'three';

const PI = Math.PI;
let bTex = null;
const bunkerTex = () => bTex ??= (() => { const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d'); g.fillStyle = '#8c8982'; g.fillRect(0, 0, 128, 128); let s = 5; const r = () => (s = s * 16807 % 2147483647) / 2147483647; for (let i = 0; i < 900; i++) { const v = r() < .5 ? 0 : 255; g.fillStyle = `rgba(${v},${v},${v},.06)`; g.fillRect(r() * 128, r() * 128, 2, 2); } g.strokeStyle = 'rgba(30,28,25,.45)'; g.lineWidth = 2; g.beginPath(); for (const x of [0, 64]) { g.moveTo(x, 0); g.lineTo(x, 128); } g.moveTo(0, 64); g.lineTo(128, 64); g.stroke(); for (let i = 0; i < 6; i++) { const x = r() * 128, l = 30 + r() * 70, q = g.createLinearGradient(0, 0, 0, l); q.addColorStop(0, 'rgba(45,38,30,.35)'); q.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = q; g.fillRect(x, 0, 4, l); } const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(2, 1); t.encoding = THREE.sRGBEncoding; return t; })();
let wtMats = null, wtBunker = null; // (the materials are shared by every gun, so their static bases can be merged into a few meshes: world.js, mergeAcross)
const std = (color, roughness, metalness, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness, metalness, envMapIntensity: .6, ...extra });

export function buildWallTurret(ent) {
  const ped = ent?.pedestal ?? 0; // (metres of plinth under the collar, raising the whole gun: stage 6's roof guns)
  const root = new THREE.Group(); root.name = 'wallTurretBase';
  const M = wtMats ??= {
    gun: std(0x2a2e32, .38, .85), armor: std(0x3a4046, .42, .78), plate: std(0x4c535a, .36, .85), orange: std(0xc4691f, .45, .45), dark: std(0x131518, .6, .5), steel: std(0x9aa0a4, .3, .9),
    lens: new THREE.MeshStandardMaterial({ color: 0x300808, emissive: 0xff2a14, emissiveIntensity: 1.7, roughness: .2, metalness: .3 }),
  };
  const add = (parent, geo, mat, x = 0, y = 0, z = 0, cast = true) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = cast; m.receiveShadow = true; parent.add(m); return m; };

  // ---- the mount: an eight-sided collar with a bolt ring, and a slewing ring the turret turns on
  add(root, new THREE.CylinderGeometry(.92, 1.0, .22, 8), M.dark, 0, .11, 0);
  add(root, new THREE.CylinderGeometry(.8, .86, .1, 8), M.plate, 0, .27, 0);
  for (let i = 0; i < 8; i++) { const a = i / 8 * PI * 2 + PI / 8; add(root, new THREE.CylinderGeometry(.045, .045, .05, 6), M.steel, Math.cos(a) * .93, .24, Math.sin(a) * .93, false); } // bolts
  add(root, new THREE.TorusGeometry(.72, .045, 6, 24), M.steel, 0, .34, 0, false).rotation.x = PI / 2;
  for (let i = 0; i < 4; i++) { const a = i / 4 * PI * 2 + PI / 4; add(root, new THREE.BoxGeometry(.5, .18, .06), M.orange, Math.cos(a) * .95, .1, Math.sin(a) * .95, false).rotation.y = -a; } // orange chevron tabs round the collar

  // ---- the turret
  const turret = new THREE.Group(); turret.name = 'turret'; turret.position.y = .36; root.add(turret);
  const hull = new THREE.Shape(); // the plan of the hull, a wedge narrowing to the front (shape y is forward: it ends up along -Z)
  [[-.66, -.72], [.66, -.72], [.78, -.1], [.4, .78], [-.4, .78], [-.78, -.1]].forEach(([x, y], i) => (i ? hull.lineTo(x, y) : hull.moveTo(x, y)));
  const hullGeo = new THREE.ExtrudeGeometry(hull, { depth: .34, bevelEnabled: true, bevelThickness: .07, bevelSize: .07, bevelSegments: 2 }); hullGeo.rotateX(-PI / 2);
  add(turret, hullGeo, M.armor, 0, 0, 0);
  add(turret, new THREE.BoxGeometry(1.0, .07, .9), M.plate, 0, .52, -.05).rotation.x = -.1;                      // the sloped roof plate
  for (const s of [-1, 1]) { // cheek armour: angled slabs along each side, with an orange chevron stripe
    add(turret, new THREE.BoxGeometry(.1, .34, 1.12), M.plate, s * .8, .3, -.02).rotation.z = s * .38;
    add(turret, new THREE.BoxGeometry(.04, .06, .9), M.orange, s * .87, .36, -.02, false).rotation.z = s * .38;
    for (let k = 0; k < 3; k++) { const c = add(turret, new THREE.BoxGeometry(.04, .05, .2), M.orange, s * .82, .22, -.3 + k * .3, false); c.rotation.z = s * .38; c.rotation.x = .5; }
  }
  add(turret, new THREE.BoxGeometry(.82, .26, .42), M.dark, 0, .32, .72);                                              // the counterweight and ammunition housing at the back
  add(turret, new THREE.BoxGeometry(.7, .05, .34), M.orange, 0, .47, .72, false);
  add(turret, new THREE.BoxGeometry(.56, .38, .24), M.gun, 0, .32, -.74);                                              // the mantlet, where the barrel comes out
  for (const s of [-1, 1]) add(turret, new THREE.BoxGeometry(.1, .3, .26), M.plate, s * .36, .32, -.7, false).rotation.y = s * .4;
  // the sensor pod on the right shoulder: a housing, a hood, the lens glowing red, and a slim mast with a whip aerial
  add(turret, new THREE.CylinderGeometry(.15, .17, .22, 12), M.gun, .46, .66, .02);
  add(turret, new THREE.BoxGeometry(.28, .06, .2), M.dark, .46, .79, -.06, false);
  add(turret, new THREE.CylinderGeometry(.095, .095, .06, 14), M.lens, .46, .68, -.19, false).rotation.x = PI / 2;
  add(turret, new THREE.CylinderGeometry(.015, .015, .75, 5), M.steel, -.46, .85, .5, false);
  add(turret, new THREE.SphereGeometry(.05, 8, 6), M.lens, -.46, 1.24, .5, false);                                      // a red light at the tip
  for (const s of [-1, 1]) add(turret, new THREE.BoxGeometry(.3, .04, .06), M.dark, s * .2, .58, .15, false);                // vents

  // ---- the gun: at the turret's origin, so the recoil (gun.position.z) slides the whole of it; its pieces are placed inside
  const gun = new THREE.Group(); gun.name = 'gun'; turret.add(gun);
  const barrel = (r0, r1, len, z, mat) => { const m = add(gun, new THREE.CylinderGeometry(r0, r1, len, 12), mat, 0, .33, z); m.rotation.x = PI / 2; return m; };
  barrel(.075, .09, 2.05, -1.65, M.gun);                                                                              // the barrel
  barrel(.14, .14, .74, -1.16, M.plate);                                                                             // the heat sleeve
  for (let k = 0; k < 5; k++) barrel(.152, .152, .035, -.88 - k * .14, M.steel);                                      // its cooling rings
  barrel(.12, .12, .34, -2.62, M.armor);                                                                             // the muzzle brake: a block,
  for (let k = 0; k < 3; k++) add(gun, new THREE.BoxGeometry(.3, .05, .05), M.dark, 0, .33, -2.5 - k * .1, false);     // with slots across it
  add(gun, new THREE.CylinderGeometry(.045, .045, .3, 6), M.orange, 0, .5, -1.5, false).rotation.x = PI / 2;           // an orange sight rail on top
  const muzzle = new THREE.Object3D(); muzzle.name = 'muzzle'; muzzle.position.set(0, .33, -2.8); gun.add(muzzle);
  if (ped > 0 && ent?.base === 'bunker') { // a gun on open ground (the secret level's island guards): a concrete slab, a stepped octagonal plinth with an orange hazard band and bolts, a ring of sandbags round it (open at the back) with snow on top, and ammunition crates
    for (const c of root.children) c.position.y += ped;
    const { conc, bag, snow, crate } = wtBunker ??= { conc: std(0x8c8982, .95, .02, { map: bunkerTex(), envMapIntensity: .3 }), bag: std(0x9a8f6a, 1, 0, { envMapIntensity: .2 }), snow: std(0xeef2f6, 1, 0, { envMapIntensity: .2 }), crate: std(0x4a5a3a, .8, .1, { envMapIntensity: .3 }) };
    add(root, new THREE.CylinderGeometry(1.5, 1.6, .3, 8), conc, 0, .15, 0);                                           // the foundation slab
    add(root, new THREE.CylinderGeometry(1.12, 1.25, .22, 8), conc, 0, .41, 0);                                           // its first step
    add(root, new THREE.CylinderGeometry(1.0, 1.15, ped - .52, 8), conc, 0, .52 + (ped - .52) / 2, 0);                  // the plinth
    add(root, new THREE.CylinderGeometry(1.02, 1.04, .14, 8), M.orange, 0, .52 + (ped - .52) * .55, 0, false);         // the hazard band
    add(root, new THREE.CylinderGeometry(1.08, 1.0, .1, 8), M.plate, 0, ped - .05, 0);                                  // the cap the collar sits on
    for (let k = 0; k < 8; k++) { const a = k / 8 * PI * 2 + PI / 8; add(root, new THREE.CylinderGeometry(.07, .07, .06, 6), M.steel, Math.cos(a) * .88, ped + .02, Math.sin(a) * .88, false); }
    const nb = 13; // the sandbag wall: two courses, round at radius 1.3, with a gap behind (towards +z: the gun's back)
    for (let course = 0; course < 2; course++) for (let k = 0; k < nb; k++) {
      const a = (k + (course ? .5 : 0)) / nb * PI * 2; if (Math.abs(Math.atan2(Math.sin(a - PI / 2), Math.cos(a - PI / 2))) < .55) continue;
      const bg = add(root, new THREE.BoxGeometry(.58, .24, .34), bag, Math.cos(a) * 1.3, .43 + course * .25, Math.sin(a) * 1.3); bg.rotation.y = -a + PI / 2 + (k % 3 - 1) * .05; bg.scale.set(1, 1, .9 + (k % 4) * .05);
      if (course) { const sn = add(root, new THREE.BoxGeometry(.52, .06, .28), snow, Math.cos(a) * 1.3, .58, Math.sin(a) * 1.3, false); sn.rotation.y = bg.rotation.y; }
    }
    for (const [a, w] of [[PI / 2 - .9, 1], [PI / 2 + .95, .8]]) { const cr = add(root, new THREE.BoxGeometry(.7 * w, .4, .45), crate, Math.cos(a) * 1.22, .5, Math.sin(a) * 1.22); cr.rotation.y = -a + PI / 2; add(root, new THREE.BoxGeometry(.72 * w, .05, .47), M.dark, Math.cos(a) * 1.22, .72, Math.sin(a) * 1.22, false).rotation.y = cr.rotation.y; }
  } else if (ped > 0) {
    for (const c of root.children) c.position.y += ped;
    add(root, new THREE.CylinderGeometry(.8, .92, ped, 8), M.armor, 0, ped / 2, 0);
    add(root, new THREE.CylinderGeometry(.98, .98, .06, 8), M.dark, 0, .03, 0);
  }
  return root;
}
