// Asset registry — everything listed here shows up in the asset viewer (viewer.html).
// `lift: true` makes the viewer raise the model so its lowest point rests on the ground.
import { buildTransport } from './transport.js';
import { buildTransport2 } from './transport2.js';
import { buildJeep } from './jeep.js';
import { buildGrenade } from './grenade.js';
import { buildRocket } from './rocket.js';
import { buildTrain, buildLocomotive, buildFlatcar } from './train.js';
import { buildSoldier } from './soldier.js';
import { buildPOW } from './pow.js';
import { buildGunboat } from './gunboat.js';
import { buildPatrolBoat } from './patrolboat.js';
import { buildSubmarine, buildMissile, poseSubmarine } from './submarine.js';
import { buildWarship } from './warship.js';
import { buildTank, buildLightTank, buildMediumTank, buildFlameTank } from './tank.js';
import { buildBossTank } from './boss-tank.js';
import { buildWalker } from './walker.js';
import { buildLightHeli } from './light-heli.js';
import { buildHelicopter } from './heli.js';
import { buildTucano } from './bomber.js';
import { buildEnemyJeep } from './enemy-jeep.js';
import { buildWallTurret } from './wallturret.js';
import { buildF35 } from './f35.js';
import {
  buildPalm, buildBush, buildRock, buildFoxhole, buildTurret, buildBarracks, buildTent, buildGate, buildDrum,
  buildHelipadMarkings, buildPickup,
} from './stage-props.js';

import { buildPine, PINE_VARIANTS } from './pine.js';

export const ASSETS = {
  transport: { title: 'Tandem-rotor transport', build: buildTransport },
  ...Object.fromEntries(PINE_VARIANTS.map((v, i) => ['pine_' + v, { title: 'Pine tree: ' + v + ' (snowy, under 1000 triangles)', build: () => buildPine(v, 3 + i, { snow: .7 }) }])),
  transport2: { title: 'Tandem-rotor transport v2 (candidate)', build: buildTransport2 },
  jeep: { title: 'Player jeep (placeholder)', build: buildJeep },
  enemyJeep: { title: 'Enemy jeep', build: () => buildEnemyJeep() },
  grenade: { title: 'Hand grenade (placeholder)', build: buildGrenade },
  rocket: { title: 'Rocket (placeholder)', build: buildRocket },
  soldier: { title: 'Enemy foot soldier (placeholder)', build: buildSoldier },
  pow: { title: 'Prisoner of war (placeholder)', build: buildPOW },
  engineer: { title: 'Engineer POW from barracks (placeholder)', build: () => buildPOW({ shirt: 0x6a4428, trousers: 0x3a5a8a, engineer: true }) },
  turret: { title: 'Gun emplacement (placeholder)', build: buildTurret },
  wallTurret: { title: 'Wall-mounted gun (stage 5 airbase)', build: buildWallTurret },
  gunboat: { title: 'River gunboat (placeholder)', build: buildGunboat },
  patrolboat: { title: 'Patrol boat (placeholder)', build: buildPatrolBoat },
  submarine: { title: 'Missile submarine', build: () => { const s = buildSubmarine(); poseSubmarine(s, 1, 0); return s; } }, // (built diving; the viewer's ground would hide it)
  warship: { title: 'Stage 3 boss warship', build: buildWarship },
  subMissile: { title: 'Submarine missile', build: buildMissile },
  tank: { title: 'Enemy main battle tank (boss)', build: buildTank },
  lighttank: { title: 'Enemy light tank', build: buildLightTank },
  mediumtank: { title: 'Enemy medium tank', build: buildMediumTank },
  flametank: { title: 'Enemy flame tank (medium hull, two flame arms)', build: buildFlameTank },
  walker: { title: 'Twin walker boss (two-legged assault mech: arm cannons, rocket pod, energy shield)', build: () => buildWalker(), lift: true },
  bosstank: { title: 'Final boss tank (four treads, charged main gun, side guns, missile launcher, drone bays)', build: buildBossTank },
  lightHeli: { title: 'Light helicopter (placeholder)', build: buildLightHeli },
  md500: { title: 'MD-500 attack helicopter', build: buildHelicopter },
  tucano: { title: 'Super Tucano bomber', build: () => buildTucano(), lift: true }, // origin is on the fuselage axis
  f35: { title: 'F-35A Lightning II (parked, stage 6)', build: () => buildF35(), lift: true }, // origin on the fuselage axis, wheels 1.65 m down
  barracks: { title: 'POW barracks (placeholder)', build: buildBarracks },
  tent: { title: 'Compound hut (placeholder)', build: buildTent },
  gate: { title: 'Compound gate (placeholder)', build: buildGate },
  palm: { title: 'Palm tree (placeholder)', build: buildPalm },
  bush: { title: 'Scrub bush (placeholder)', build: buildBush },
  rock: { title: 'Boulder (placeholder)', build: buildRock },
  foxhole: { title: 'Sandbag foxhole (placeholder)', build: buildFoxhole },
  drum: { title: 'Fuel drum (placeholder)', build: buildDrum },
  helipad: { title: 'Helipad markings (placeholder)', build: buildHelipadMarkings },
  pickup: { title: 'Weapon pickup (placeholder)', build: buildPickup },
  train: { title: 'Military train (locomotive, 4 container cars, 2 light-tank cars, 1 car of two enemy jeeps)', build: () => buildTrain() }, // ~92 m long: nose toward -Z, origin on the rails
  locomotive: { title: 'Diesel locomotive', build: () => buildLocomotive() },
  tankcar: { title: 'Flatcar with a light tank', build: () => buildFlatcar('tank') },
  containercar: { title: 'Flatcar with a container', build: () => buildFlatcar('container', 1) },
};