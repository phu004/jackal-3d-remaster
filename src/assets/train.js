// The stage 4 military train: one diesel locomotive and six flatcars, four carrying a 40-ft shipping container and two a light tank, coupled buffer to buffer.
// Asset contract: 1 unit = 1 m; the nose (the locomotive's front) faces -Z; origin on the TOP OF THE RAILS at the middle of the train's first vehicle, so the wheels' treads touch y = 0. Standard gauge:
// the wheels sit 1.422 m apart centre to centre (the railway's rail spacing, see game/railway.js). The whole train is about 86 m long, 2.7 m wide and 3.6 m tall (the cargo is full size): it clears the tunnel (5.2 x 5.6 m).
// buildLocomotive(), buildFlatcar(payload, variant) and buildTrain() each return a Group; every wheelset is a Group named 'wheelset' (spin it about X; the radius is in userData.radius) and
// train.userData.wheelsets lists them, train.userData.cars gives each vehicle's { z, length }, ready for a moving train.
import * as THREE from 'three';
import { add, mat, cached, PI, seededRandom, canvasTexture } from './common.js';
import { containerMaterials, CONTAINER } from './harbour-props.js';
import { buildLightTank } from './tank.js';
import { buildEnemyJeep } from './enemy-jeep.js';

const GAUGE = 1.422, WHEEL_R = .46; // (1.35 m between the rails' inner faces, plus a rail head: the railway's, see game/railway.js)
const S = .9;                // the rolling stock is drawn this much of the size it is modelled at (the cargo is not)
const G_IN = GAUGE / S;      // so the wheels are modelled this far apart: after the scale they sit on the rails
const PITCH = 12.4;          // m between the centres of neighbouring vehicles (buffers just touching)
const JEEP_SCALE = .81;       // the enemy jeeps' size in the game (player.js)
const LIGHT_TANK_SCALE = 1.1; // as in the game (tanks.js)

// ---- textures -------------------------------------------------------------------------------------------------------------------------------------------------------------------
function grimeCanvas(kind) { // near-white grain, vertical rain streaks and rust, tinted by the material colour
  const S = 256, rnd = seededRandom(kind === 'body' ? 11 : 12), c = document.createElement('canvas'); c.width = c.height = S; const x = c.getContext('2d');
  x.fillStyle = '#efefef'; x.fillRect(0, 0, S, S);
  for (let n = 0; n < 24; n++) { const px = rnd() * S, py = rnd() * S, r = 30 + rnd() * 70, g = x.createRadialGradient(px, py, 0, px, py, r), v = rnd() < .5 ? 255 : 0; g.addColorStop(0, `rgba(${v},${v},${v},.08)`); g.addColorStop(1, `rgba(${v},${v},${v},0)`); x.fillStyle = g; x.fillRect(px - r, py - r, r * 2, r * 2); }
  for (let n = 0; n < 40; n++) { const px = rnd() * S, w = 2 + rnd() * 9, l = 40 + rnd() * 160, py = rnd() * S * .6, g = x.createLinearGradient(0, py, 0, py + l); g.addColorStop(0, `rgba(40,32,26,${.1 + rnd() * .14})`); g.addColorStop(1, 'rgba(40,32,26,0)'); x.fillStyle = g; x.fillRect(px, py, w, l); }
  for (let n = 0; n < 30; n++) { const px = rnd() * S, py = rnd() * S, r = 2 + rnd() * 6, g = x.createRadialGradient(px, py, 0, px, py, r); g.addColorStop(0, 'rgba(120,64,30,.4)'); g.addColorStop(1, 'rgba(120,64,30,0)'); x.fillStyle = g; x.fillRect(px - r, py - r, r * 2, r * 2); } // rust spots
  for (let n = 0; n < 5000; n++) { const v = rnd() > .5 ? 255 : 0; x.fillStyle = `rgba(${v},${v},${v},.04)`; x.fillRect(rnd() * S, rnd() * S, 1 + rnd() * 2, 1 + rnd() * 2); }
  return c;
}
function deckCanvas() { // wooden deck planks running along the car (the box's top face: u across, v along)
  const S = 256, rnd = seededRandom(31), c = document.createElement('canvas'); c.width = c.height = S; const x = c.getContext('2d');
  for (let px = 0; px < S; px += 32) {
    const v = 100 + rnd() * 50; x.fillStyle = `rgb(${v * 1.15},${v * .92},${v * .66})`; x.fillRect(px + 1, 0, 30, S);
    for (let n = 0; n < 24; n++) { x.fillStyle = `rgba(40,26,14,${.08 + rnd() * .14})`; x.fillRect(px + 2 + rnd() * 26, rnd() * S, 1, 20 + rnd() * 90); } // grain
    x.fillStyle = 'rgba(25,18,10,.55)'; for (let py = 20; py < S; py += 84) { x.fillRect(px + 5, py, 3, 3); x.fillRect(px + 24, py + 5, 3, 3); } // nail heads
    if (rnd() < .5) { x.strokeStyle = 'rgba(25,18,10,.6)'; x.beginPath(); x.moveTo(px + 6 + rnd() * 20, rnd() * S); x.lineTo(px + 6 + rnd() * 20, rnd() * S); x.stroke(); } // a split
  }
  x.fillStyle = 'rgba(30,22,14,.5)'; for (let px = 0; px <= S; px += 32) x.fillRect(px - 1, 0, 2, S);
  for (let n = 0; n < 14; n++) { const px = rnd() * S, py = rnd() * S, r = 20 + rnd() * 50, g = x.createRadialGradient(px, py, 0, px, py, r); g.addColorStop(0, 'rgba(20,16,12,.2)'); g.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = g; x.fillRect(px - r, py - r, r * 2, r * 2); } // oil and wear
  return c;
}
function hazardCanvas() { // diagonal yellow and black warning stripes (the buffer beams)
  const c = document.createElement('canvas'); c.width = 256; c.height = 64; const x = c.getContext('2d');
  x.fillStyle = '#d4a417'; x.fillRect(0, 0, 256, 64); x.fillStyle = '#15130f';
  for (let i = -64; i < 320; i += 64) { x.beginPath(); x.moveTo(i, 64); x.lineTo(i + 32, 64); x.lineTo(i + 64, 0); x.lineTo(i + 32, 0); x.fill(); }
  const rnd = seededRandom(5); for (let n = 0; n < 1400; n++) { x.fillStyle = rnd() < .5 ? 'rgba(255,255,255,.07)' : 'rgba(0,0,0,.14)'; x.fillRect(rnd() * 256, rnd() * 64, 1 + rnd() * 2, 1); }
  return c;
}
const skin = (hex, rough, metal, kind = 'body') => new THREE.MeshStandardMaterial({ color: hex, roughness: rough, metalness: metal, envMapIntensity: .3, map: cached('trainGrime' + kind, () => canvasTexture(grimeCanvas(kind))) });
const M = () => cached('trainMats', () => ({
  body: skin(0x4c5532, .75, .15), roof: skin(0x353d24, .8, .1), dark: mat(0x1f201c, .8, .35), steel: mat(0x3a3a36, .6, .5), black: mat(0x121211, .85, .2), rust: mat(0x5e3822, .85, .35),
  yellow: mat(0xd2a41c, .6, .1), wheel: mat(0x2d2b28, .55, .65), tread: mat(0x77746c, .35, .8), glass: mat(0x1c2a33, .12, .5), lamp: mat(0xfff0c8, .3, .1, { emissive: 0x806a38 }), red: mat(0x8a2222, .5, .1),
  deck: new THREE.MeshStandardMaterial({ roughness: .95, metalness: 0, envMapIntensity: .15, map: cached('trainDeck', () => canvasTexture(deckCanvas())) }),
  hazard: new THREE.MeshStandardMaterial({ roughness: .7, metalness: .1, envMapIntensity: .2, map: cached('trainHazard', () => canvasTexture(hazardCanvas())) }),
  frame: skin(0x2c2d28, .8, .35, 'frame'), chain: mat(0x2a2a28, .5, .8),
}));

// ---- running gear ---------------------------------------------------------------------------------------------------------------------------------------------------------------
// One wheelset (axle and two disc wheels with flanges), axis along X, spinning with rotation.x.
function wheelset(parent, t, z) {
  const g = new THREE.Group(); g.name = 'wheelset'; g.position.set(0, WHEEL_R, z); g.userData.radius = WHEEL_R; parent.add(g);
  add(g, new THREE.CylinderGeometry(.09, .09, G_IN + .3, 12), t.steel).rotation.z = PI / 2; // the axle
  for (const s of [-1, 1]) {
    const x = s * G_IN / 2;
    add(g, new THREE.CylinderGeometry(WHEEL_R, WHEEL_R, .13, 20), t.tread, x - s * .02, 0, 0).rotation.z = PI / 2;               // the tread
    add(g, new THREE.CylinderGeometry(WHEEL_R + .045, WHEEL_R, .035, 20), t.tread, x - s * .09, 0, 0).rotation.z = PI / 2;        // the flange, on the inside
    add(g, new THREE.CylinderGeometry(WHEEL_R * .82, WHEEL_R * .82, .06, 16), t.wheel, x + s * .045, 0, 0).rotation.z = PI / 2;    // the dished web, outside
    add(g, new THREE.CylinderGeometry(.14, .14, .1, 8), t.steel, x + s * .1, 0, 0).rotation.z = PI / 2;                           // the hub
    // (the six bolts round each hub were 144 triangles a wheel, too small to see from the camera: left out)
  }
  return g;
}
// A two-axle bogie at z (along the vehicle): outside side frames, axleboxes, springs, a bolster, brake gear.
function bogie(parent, t, z, wheelbase = 1.9) {
  const g = new THREE.Group(); g.position.z = z; parent.add(g);
  for (const dz of [-wheelbase / 2, wheelbase / 2]) wheelset(g, t, dz);
  for (const s of [-1, 1]) {
    add(g, new THREE.BoxGeometry(.14, .3, wheelbase + .9), t.frame, s * 1.02, .68, 0);                                            // side frame
    for (const dz of [-wheelbase / 2, wheelbase / 2]) {
      add(g, new THREE.BoxGeometry(.24, .28, .34), t.steel, s * 1.0, WHEEL_R + .02, dz);                                             // axlebox
      add(g, new THREE.CylinderGeometry(.09, .09, .22, 10), t.rust, s * 1.02, .88, dz * .98);                                       // coil spring
      add(g, new THREE.BoxGeometry(.05, .2, .5), t.black, s * .7, .5, dz + (dz > 0 ? -.52 : .52));                                    // brake shoe
    }
  }
  add(g, new THREE.BoxGeometry(2.2, .22, .4), t.frame, 0, .72, 0);                                                                // transom
  add(g, new THREE.BoxGeometry(2.1, .2, .55), t.frame, 0, .96, 0);                                                                // bolster
  add(g, new THREE.CylinderGeometry(.22, .22, .12, 16), t.steel, 0, 1.1, 0);                                                      // centre pivot
  return g;
}
// A pair of buffers and a coupler at an end of a vehicle (z: the buffer beam's face, dir: +1 / -1 pointing out).
function ends(parent, t, z, dir, y = 1.2, hazard = false) {
  add(parent, new THREE.BoxGeometry(3.0, .5, .32), hazard ? [t.frame, t.frame, t.frame, t.frame, t.hazard, t.hazard] : t.frame, 0, y, z - dir * .0);  // the buffer beam
  for (const s of [-1, 1]) {
    add(parent, new THREE.CylinderGeometry(.14, .17, .5, 14), t.steel, s * 1.06, y, z + dir * .4).rotation.x = PI / 2;               // buffer stem
    add(parent, new THREE.CylinderGeometry(.22, .22, .06, 18), t.tread, s * 1.06, y, z + dir * .68).rotation.x = PI / 2;             // buffer head
  }
  add(parent, new THREE.BoxGeometry(.18, .2, .6), t.black, 0, y - .02, z + dir * .4);                                              // coupler shank
  add(parent, new THREE.BoxGeometry(.34, .26, .3), t.steel, 0, y - .02, z + dir * .75);                                            // coupler head
  add(parent, new THREE.CylinderGeometry(.05, .05, .5, 6), t.black, .5 * dir, y + .22, z + dir * .35).rotation.z = .6;              // an air hose
}

// ---- the locomotive -------------------------------------------------------------------------------------------------------------------------------------------------------------

// The locomotive's long hood: engine cover, radiator end, louvres, fan housing, exhaust, vent box, sand boxes (positions in the locomotive's own frame; also thrown as a piece when it is wrecked).
function buildHood(t) {
  const root = new THREE.Group();
  add(root, new THREE.BoxGeometry(2.55, 1.35, 6.4), t.body, 0, 2.35, -2.9);                                      // hood body
  add(root, new THREE.BoxGeometry(2.4, .12, 6.3), t.roof, 0, 3.08, -2.9);                                        // hood roof
  for (let i = 0; i < 9; i++) for (const s of [-1, 1]) add(root, new THREE.BoxGeometry(.06, .6, .3), t.dark, s * 1.29, 2.3, -5.4 + i * .62); // side louvres
  for (let i = 0; i < 5; i++) add(root, new THREE.BoxGeometry(1.6, .04, .08), t.dark, 0, 3.15, -5.1 + i * .6);    // roof louvres
  add(root, new THREE.BoxGeometry(2.4, 1.2, .35), t.body, 0, 2.35, -6.2);                                        // the radiator end
  add(root, new THREE.BoxGeometry(2.0, .8, .06), t.black, 0, 2.3, -6.4);                                         // its grille
  for (let i = 0; i < 7; i++) add(root, new THREE.BoxGeometry(1.9, .03, .02), t.steel, 0, 2.0 + i * .12, -6.44);
  add(root, new THREE.CylinderGeometry(.8, .8, .22, 24), t.dark, 0, 3.22, -5.4);                                  // radiator fan housing
  add(root, new THREE.CylinderGeometry(.16, .22, .9, 12), t.black, .55, 3.5, -1.2);                               // exhaust stack
  add(root, new THREE.CylinderGeometry(.26, .16, .12, 12), t.black, .55, 3.98, -1.2);
  add(root, new THREE.BoxGeometry(.9, .5, 1.4), t.body, -.7, 3.3, -1.1);                                         // a roof vent box
  for (const s of [-1, 1]) add(root, new THREE.BoxGeometry(.5, .4, .9), t.rust, s * 1.15, 1.9, -2.4);            // sand boxes
  return root;
}
// The locomotive's cab (origin at its centre, the roof, windows, ventilator, mirrors).
function buildCab(t) {
  const cab = new THREE.Group();
  add(cab, new THREE.BoxGeometry(3.0, 2.5, 4.2), t.body, 0, 2.9, 0);                                              // cab body
  add(cab, new THREE.BoxGeometry(3.25, .18, 4.45), t.roof, 0, 4.22, 0);                                          // cab roof, overhanging
  add(cab, new THREE.BoxGeometry(1.1, .22, 1.8), t.dark, 0, 4.4, .6);                                              // roof ventilator
  add(cab, new THREE.CylinderGeometry(.14, .14, .5, 10), t.steel, -.9, 4.5, -1.3);                                 // horn
  for (const [z, w, h] of [[-1.05, .02, .9], [.2, .02, .9], [1.45, .02, .9]]) for (const s of [-1, 1]) { // side windows
    add(cab, new THREE.BoxGeometry(.04, h, 1.0), t.glass, s * 1.51, 3.35, z + .1); add(cab, new THREE.BoxGeometry(.06, .06, 1.1), t.dark, s * 1.51, 3.35 + h / 2 + .03, z + .1);
  }
  add(cab, new THREE.BoxGeometry(2.4, .85, .04), t.glass, 0, 3.4, -2.12);                                          // the front windscreen
  for (const s of [-1, 1]) add(cab, new THREE.BoxGeometry(.5, .85, .04), t.glass, s * 1.12, 3.4, -2.12);
  add(cab, new THREE.BoxGeometry(2.4, .85, .04), t.glass, 0, 3.4, 2.12);                                           // the rear window
  for (const s of [-1, 1]) add(cab, new THREE.BoxGeometry(.5, 1.5, .5), t.dark, s * 1.52, 2.55, 0).scale.set(.2, 1, 1); // door handles / panel
  for (const s of [-1, 1]) { add(cab, new THREE.BoxGeometry(.12, .5, .4), t.steel, s * 1.62, 4.05, -2.1); add(cab, new THREE.BoxGeometry(.5, .3, .3), t.dark, s * 1.15, 2.1, 2.3); } // mirrors, rear step boxes
  return cab;
}

export function buildLocomotive() {
  const t = M(), car = new THREE.Group(), root = new THREE.Group(); car.name = 'locomotive'; root.scale.setScalar(S); car.add(root);
  const L = 12.2;                                   // frame length (as the flatcars')
  add(root, new THREE.BoxGeometry(2.9, .5, L), t.frame, 0, 1.25, 0);                                           // main frame
  add(root, new THREE.BoxGeometry(3.15, .1, L - .2), t.dark, 0, 1.55, 0);                                       // walkway plate
  add(root, new THREE.CylinderGeometry(.55, .55, 3.4, 20), t.steel, 0, .92, 0).rotation.x = PI / 2;             // fuel tank under the frame
  add(root, new THREE.CylinderGeometry(.18, .18, 1.2, 10), t.rust, .9, .95, 1.8).rotation.x = PI / 2;           // an air reservoir
  bogie(root, t, -3.9); bogie(root, t, 3.9);
  ends(root, t, -L / 2 - .1, -1, 1.25, true); ends(root, t, L / 2 + .1, 1, 1.25, true);
  // the long hood forward of the cab: engine and radiators
  root.add(buildHood(t));                                                                                           // the long hood forward of the cab (see buildHood)
  // the cab at the rear
  const cab = buildCab(t); cab.position.z = 2.6; root.add(cab);                                                      // the cab at the rear (see buildCab)
  // front lights and number boards on the radiator end; rear lights on the cab
  for (const s of [-1, 1]) { add(root, new THREE.CylinderGeometry(.17, .17, .12, 14), t.lamp, s * .8, 2.7, -6.45).rotation.x = PI / 2; add(root, new THREE.CylinderGeometry(.2, .2, .06, 14), t.dark, s * .8, 2.7, -6.42).rotation.x = PI / 2; }
  add(root, new THREE.BoxGeometry(.5, .42, .06), t.black, 0, 2.7, -6.45);                                           // a number board
  for (const s of [-1, 1]) add(root, new THREE.CylinderGeometry(.08, .08, .08, 10), t.red, s * 1.0, 1.8, 6.15).rotation.x = PI / 2; // tail lamps
  // handrails and steps
  for (const s of [-1, 1]) {
    for (let i = 0; i < 12; i++) add(root, new THREE.CylinderGeometry(.025, .025, .9, 6), t.yellow, s * 1.52, 2.05, -5.8 + i * 1.05);           // stanchions
    add(root, new THREE.CylinderGeometry(.03, .03, 11.6, 6), t.yellow, s * 1.52, 2.5, 0).rotation.x = PI / 2;                                    // the rail
  }
  for (const [x, z] of [[1.3, 5.2], [-1.3, 5.2], [1.3, -5.6], [-1.3, -5.6]]) { add(root, new THREE.BoxGeometry(.7, .06, .5), t.dark, x, 1.0, z); add(root, new THREE.BoxGeometry(.7, .06, .45), t.dark, x, .55, z); add(root, new THREE.BoxGeometry(.05, .9, .06), t.black, x - .3, .78, z); add(root, new THREE.BoxGeometry(.05, .9, .06), t.black, x + .3, .78, z); } // step ladders
  return car;
}

// ---- the flatcars -------------------------------------------------------------------------------------------------------------------------------------------------------------
// payload: 'container' or 'tank'. variant: picks the container's colour.
export function buildFlatcar(payload = 'container', variant = 0) {
  const t = M(), car = new THREE.Group(), root = new THREE.Group(); car.name = payload === 'tank' ? 'tankcar' : payload === 'jeeps' ? 'jeepcar' : 'containercar'; root.scale.setScalar(S); car.add(root);
  const L = 12.2, DECK = 1.45, DS = DECK * S; // (DS: the deck's height on the finished car, where the full-size cargo sits)
  for (const s of [-1, 1]) add(root, new THREE.BoxGeometry(.34, .36, L), t.frame, s * 1.0, 1.15, 0);                                  // the two main beams
  for (const z of [-5, -2.5, 0, 2.5, 5]) add(root, new THREE.BoxGeometry(2.4, .2, .24), t.frame, 0, 1.12, z);                         // cross-members
  add(root, new THREE.BoxGeometry(3.0, .16, L), t.deck, 0, DECK - .08, 0);                                                         // the wooden deck
  for (const s of [-1, 1]) add(root, new THREE.BoxGeometry(.1, .24, L), t.frame, s * 1.5, DECK - .1, 0);                              // the edge angle
  bogie(root, t, -4.3); bogie(root, t, 4.3);
  ends(root, t, -L / 2 - .1, -1, 1.3); ends(root, t, L / 2 + .1, 1, 1.3);
  for (let i = 0; i < 9; i++) for (const s of [-1, 1]) add(root, new THREE.BoxGeometry(.14, .22, .1), t.rust, s * 1.52, DECK + .02, -5.2 + i * 1.3); // stake pockets
  for (const s of [-1, 1]) for (const z of [-4.8, -1.6, 1.6, 4.8]) add(root, new THREE.TorusGeometry(.07, .015, 6, 10), t.chain, s * 1.4, DECK + .03, z).rotation.x = PI / 2; // lashing rings
  add(root, new THREE.CylinderGeometry(.05, .05, 1.0, 8), t.black, 1.35, DECK + .5, -5.6);                                           // the handbrake post
  add(root, new THREE.TorusGeometry(.26, .025, 6, 18), t.black, 1.35, DECK + 1.0, -5.6).rotation.x = PI / 2;                          // and its wheel
  add(root, new THREE.CylinderGeometry(.2, .2, 1.6, 12), t.steel, -.4, .95, 0).rotation.x = PI / 2;                                  // the brake cylinder under the deck
  add(root, new THREE.BoxGeometry(.05, .05, 5), t.black, -.4, .98, -.8);                                                           // brake rodding
  if (payload === 'container') {
    const { L: CL, W: CW, H: CH } = CONTAINER, frame = cached('trainTwist', () => mat(0x2a2a2a, .6, .6));
    const box = new THREE.Mesh(new THREE.BoxGeometry(CL, CH, CW), containerMaterials(variant, variant % 2)); box.rotation.y = PI / 2; box.position.set(0, DS + CH / 2 + .1, 0); box.castShadow = box.receiveShadow = true; car.add(box); // (full size)
    for (const a of [-1, 1]) for (const b of [-1, 1]) { add(car, new THREE.BoxGeometry(.3, .16, .3), t.steel, a * (CW / 2 - .15), DS + .08, b * (CL / 2 - .15)); add(car, new THREE.BoxGeometry(.24, .23, .24), frame, a * (CW / 2 - .09), DS + .2, b * (CL / 2 - .09)); } // twist locks, corner castings
  } else if (payload === 'jeeps') { // two enemy jeeps nose to tail, noses the way the train goes, chocked and chained down
    for (const z of [-2.7, 2.7]) {
      const jeep = buildEnemyJeep(); jeep.scale.setScalar(JEEP_SCALE); jeep.position.set(0, DS + .06, z); car.add(jeep);
      for (const s of [-1, 1]) for (const dz of [-1.35, 1.35]) add(car, new THREE.BoxGeometry(.14, .2, .4), t.rust, s * .8, DS + .1, z + dz * 1.25 * Math.sign(dz) / Math.abs(dz) * 1);
    }
    for (const s of [-1, 1]) for (const z of [-4.6, 0, 4.6]) { // chains from the hulls to the lashing rings, slack
      const a = new THREE.Vector3(s * .7, DS + .55, z * .85), b = new THREE.Vector3(s * 1.3, DS + .05, z), mid = a.clone().add(b).multiplyScalar(.5), len = a.distanceTo(b);
      const c = add(car, new THREE.CylinderGeometry(.028, .028, len, 6), t.chain, mid.x, mid.y - .05, mid.z); c.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    }
  } else {
    const tank = buildLightTank(); tank.scale.setScalar(LIGHT_TANK_SCALE); tank.position.set(0, DS + .06, 0); // (the tank's nose is -Z, the way the train goes)
    car.add(tank);
    for (const s of [-1, 1]) for (const z of [-2.5, 2.5]) { add(car, new THREE.BoxGeometry(.2, .3, .5), t.rust, s * 1.15, DS + .15, z); add(car, new THREE.BoxGeometry(.18, .26, .16), t.rust, s * 1.15, DS + .13, z + Math.sign(z) * .35).rotation.x = Math.sign(z) * .5; } // chocks
    for (const s of [-1, 1]) for (const z of [-1.8, 1.8]) { // chains from the hull to the lashing rings, slack
      const a = new THREE.Vector3(s * .95, DS + .8, z * .75), b = new THREE.Vector3(s * 1.3, DS + .05, z * 1.2), mid = a.clone().add(b).multiplyScalar(.5), len = a.distanceTo(b);
      const c = add(car, new THREE.CylinderGeometry(.028, .028, len, 6), t.chain, mid.x, mid.y - .05, mid.z); c.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    }
  }
  return car;
}

// ---- the train ------------------------------------------------------------------------------------------------------------------------------------------------------------------
// locomotive, then container, tank, container, container, tank, container, then a flatcar of two enemy jeeps. Vehicle i's centre is at z = i * PITCH (the train trails back toward +Z).
export function buildTrain() {
  const train = new THREE.Group(); train.name = 'train'; train.userData.cars = []; train.userData.wheelsets = []; train.userData.pitch = PITCH; train.userData.bogie = 4.3 * S; train.userData.halfLength = (6.2 + .68) * S;
  const PAINT_HEX = [0x2f6fb3, 0xb14a2b, 0xd6d4cc, 0x3f6b45, 0xc4932c, 0x7b8288, 0x7a2a26, 0x2a8a8a]; // (the containers' body colours: harbour-props.js)
  const order = ['loco', 'container', 'tank', 'container', 'container', 'tank', 'container', 'jeeps']; let cv = 0;
  order.forEach((kind, i) => {
    const variant = kind !== 'loco' ? cv++ * 3 + 1 : 0, // (the same colours as before: every flatcar counts)
       car = kind === 'loco' ? buildLocomotive() : buildFlatcar(kind, variant);
    car.position.z = i * PITCH; train.add(car);
    car.traverse(o => { if (o.name === 'wheelset') train.userData.wheelsets.push(o); });
    train.userData.cars.push({ kind, z: i * PITCH, length: PITCH, variant, colour: kind === 'container' ? PAINT_HEX[variant % 8] : undefined });
  });
  return train;
}


// ---- wreckage ---------------------------------------------------------------------------------------------------------------------------------------------------------------------
// The big pieces a destroyed car breaks into, made of the car's own parts and materials (its real bogies and wheels, the cab, the hood, the tank's own turret and hull, the container's own
// panels torn off), not generic fragments: a few convincing pieces rather than a lot of scraps. Returns [{ obj, at, rotY, rest, heavy }]: `at` where the piece's origin was in the car's frame
// (x across, y up from the rail tops, z along: -Z is the front), `rest` how high its origin sits when it lies on the ground, `heavy` 0..1 (heavy pieces are thrown less hard and tumble slower).
const jitterEnds = (geo, amount, seed) => { // tear the ends of a long box: its end vertices pushed about, so the edge is ragged
  const rnd = seededRandom(seed), p = geo.attributes.position, zmax = Math.max(...Array.from({ length: p.count }, (_, i) => Math.abs(p.getZ(i))));
  for (let i = 0; i < p.count; i++) if (Math.abs(p.getZ(i)) > zmax * .7) { const k = (Math.abs(p.getZ(i)) - zmax * .7) / (zmax * .3); p.setZ(i, p.getZ(i) - Math.sign(p.getZ(i)) * rnd() * amount * k); p.setY(i, p.getY(i) + (rnd() - .5) * amount * .15 * k); }
  geo.computeVertexNormals(); return geo;
};
// A sheet of a material's texture (the part uv = [u0, v0, u1, v1] of it), w x h metres, torn: its edges pulled in unevenly (one side badly), and bent and crumpled.
function tornSheet(w, h, material, uv, seed, curl = .5) {
  const rnd = seededRandom(seed), NX = 14, NY = 7, g = new THREE.PlaneGeometry(w, h, NX, NY), p = g.attributes.position, uvA = g.attributes.uv, tear = Math.floor(rnd() * 4);
  for (let i = 0; i < p.count; i++) {
    const ix = i % (NX + 1), iy = Math.floor(i / (NX + 1)); let x = p.getX(i), y = p.getY(i);
    uvA.setXY(i, uv[0] + uvA.getX(i) * (uv[2] - uv[0]), uv[1] + uvA.getY(i) * (uv[3] - uv[1]));
    const edgeX = ix === 0 || ix === NX, edgeY = iy === 0 || iy === NY;
    if (edgeX) x -= Math.sign(x) * rnd() * w * (.03 + ((tear === 0 && x < 0) || (tear === 1 && x > 0) ? .12 : 0));
    if (edgeY) y -= Math.sign(y) * rnd() * h * (.05 + ((tear === 2 && y < 0) || (tear === 3 && y > 0) ? .22 : 0));
    p.setXY(i, x, y);
    p.setZ(i, Math.sin((x / w + .5) * Math.PI) * curl + Math.sin(y * 2.3 + seed) * .06 + (rnd() - .5) * .05 + (y / h) * (x / w) * curl * .6); // bowed, and buckled along its length
  }
  g.computeVertexNormals();
  const m = material.clone(); m.side = THREE.DoubleSide; const mesh = new THREE.Mesh(g, m); mesh.castShadow = true; return mesh;
}
const charred = obj => { obj.traverse(o => { if (o.isMesh) { o.material = Array.isArray(o.material) ? o.material.map(m => m.clone()) : o.material.clone(); for (const m of [].concat(o.material)) m.color.multiplyScalar(.32); } }); return obj; }; // scorched

export function wreckPieces(kind, variant = 1) {
  const t = M(), out = [], piece = (obj, at, rest, heavy, rotY = 0) => out.push({ obj, at: new THREE.Vector3(...at), rotY, rest, heavy });
  const bog = z => { const g = new THREE.Group(), b = bogie(g, t, 0); g.scale.setScalar(S); return g; }; // (a whole bogie: its frames, springs and both wheelsets)
  const sections = (width, length, seed, mat = t.frame, h = .5) => new THREE.Mesh(jitterEnds(new THREE.BoxGeometry(width, h, length, 4, 1, 10), .5, seed), mat);
  piece(bog(), [0, 0, -3.87], .5, .85); piece(bog(), [0, 0, 3.87], .5, .85);                                          // both bogies, wheels and all
  if (kind === 'loco') {
    const cabG = new THREE.Group(), cab = buildCab(t); cab.position.y = -2.9; cabG.add(cab); cabG.scale.setScalar(S); piece(cabG, [0, 2.9 * S, 2.6 * S], 1.2, .8);   // the cab, whole, thrown by its centre
    const hoodG = new THREE.Group(), hood = buildHood(t); hood.position.set(0, -2.35, 2.9); hoodG.add(hood); hoodG.scale.setScalar(S); piece(hoodG, [0, 2.35 * S, -2.9 * S], .9, .8); // the hood
    const f1 = sections(2.9 * S, 5.2, 71); const f2 = sections(2.9 * S, 5.2, 72); piece(f1, [0, 1.25 * S, 2.6], .3, .7); piece(f2, [0, 1.25 * S, -3.2], .3, .7);               // two torn lengths of the frame
    const stack = new THREE.Mesh(new THREE.CylinderGeometry(.18, .24, 1.0, 12), t.black); stack.castShadow = true; piece(stack, [.55 * S, 3.5 * S, -1.2 * S], .45, .3); // the exhaust stack
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(.55 * S, .55 * S, 3.4 * S, 18).rotateX(PI / 2), t.steel); tank.castShadow = true; piece(tank, [0, .92 * S, 0], .55, .6); // the fuel tank
  } else {
    const deck = new THREE.Mesh(jitterEnds(new THREE.BoxGeometry(2.7, .15, 5.6, 4, 1, 10), .7, 31 + variant), t.deck); deck.castShadow = true; piece(deck, [0, 1.3, kind === 'tank' ? 2.5 : -2.5], .12, .6); // a torn length of the deck
    for (let k = 0; k < 2; k++) { const gp = new THREE.BoxGeometry(.34, .05, 2.4 + k * 1.2), uv = gp.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * .125 + k * .25, uv.getY(i) * 1.1); const pl = new THREE.Mesh(gp, t.deck); pl.castShadow = true; piece(pl, [(k ? .9 : -1.0), 1.4, k ? -3 : 3.2], .06, .15); } // loose planks
    for (let k = 0; k < 2; k++) { const beam = new THREE.Mesh(new THREE.BoxGeometry(.3, .34, 3.6), t.frame); beam.castShadow = true; piece(beam, [(k ? 1 : -1) * .95 * S, 1.15 * S, k ? 4.2 : -4.2], .2, .5); }   // beams
    if (kind === 'container') {
      const cm = containerMaterials(variant, variant % 2), DS = 1.45 * S;
      piece(tornSheet(5.4, 2.55, cm[4], [0, 0, .55, 1], 11 + variant, .55), [1.2, DS + 1.5, -1.8], .3, .2, PI / 2);          // one side of the container, torn off in a long sheet
      piece(tornSheet(5.0, 2.55, cm[5], [.5, 0, 1, 1], 12 + variant, .5), [-1.2, DS + 1.4, 2.2], .3, .2, PI / 2);             // the other
      const roof = tornSheet(2.4, 5.2, cm[2], [0, 0, 1, .55], 13 + variant, .4); roof.rotation.x = -PI / 2; const roofG = new THREE.Group(); roofG.add(roof); piece(roofG, [0, DS + 2.7, 0], .3, .3); // the roof
      piece(tornSheet(2.4, 2.5, cm[0], [0, 0, 1, 1], 14 + variant, .35), [0, DS + 1.4, -4.6], .35, .3);                       // the doors
    } else if (kind === 'jeeps') {
      for (const z of [-2.7, 2.7]) { const jeep = buildEnemyJeep(); jeep.scale.setScalar(JEEP_SCALE); charred(jeep); piece(jeep, [0, 1.45 * S + .06, z], .5, .75); } // both jeeps, scorched, thrown separately
    } else {
      const tank = buildLightTank(); tank.scale.setScalar(LIGHT_TANK_SCALE); const tur = tank.getObjectByName('turret'), tp = tur.position.clone().multiplyScalar(LIGHT_TANK_SCALE);
      tank.remove(tur); tur.scale.setScalar(LIGHT_TANK_SCALE); charred(tank); charred(tur);
      piece(tank, [0, 1.45 * S + .06, 0], .6, .9); piece(tur, [tp.x, 1.45 * S + .06 + tp.y, tp.z], .5, .6);                   // the tank's own hull and its turret, scorched, thrown separately
    }
  }
  return out;
}
