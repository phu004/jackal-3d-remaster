import { Lightning } from './game/lightning.js';
import { swingDoors } from './assets/harbour-props.js';
import { wetFlash } from './game/wet-look.js';
import { Rain } from './game/rain.js';
import { Snow } from './game/snow.js';
import * as THREE from 'three';
// The summit's mist is the scene's fog with its thickness bent to a gentle rule: the fog's near is how thick the mist is (0..1, set by the jeep's climb), and the fog grows with the distance from the camera, from 48 m (nothing) to 100 m (all of it) times that thickness. The thickness rises smoothly from the foot of the road to the top, and the near ground stays clear all the way. It only runs where a stage sets scene.fog.
THREE.ShaderChunk.fog_fragment = ['#ifdef USE_FOG', '  float fogFactor = fogNear * smoothstep( 48.0, 100.0, fogDepth );', '  gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );', '#endif'].join('\n');
import { dropTinyShadows } from './game/optimize.js';
import './game/soft-shadows.js'; // must patch the shadow shader before anything is drawn
import './game/light-cull.js'; // ... and the point-light loop (skip the lighting for a light that doesn't reach the pixel)
import { createWorld, LEVEL } from './game/world.js';
import { Fx } from './game/fx.js';
import { Debris, setSmallDebris } from './game/debris.js';
import { Fires } from './game/fire.js';
import { EnemyFire } from './game/enemies.js';
import { Statues } from './game/statues.js';
import { Submarines } from './game/submarines.js';
import { IceSub } from './game/ice-sub.js';
import { PowerPlantFight } from './game/power-plant.js';
import { CamoTurrets } from './game/camo-turrets.js';
import { Landmines } from './game/landmines.js';
import { DronePads } from './game/drone-pads.js';
import { TrainRide } from './game/train-ride.js';
import { Warship } from './game/warship.js';
import { Apcs } from './game/apcs.js';
import { BomberRaid } from './game/bomber-raid.js';
import { Toppling } from './game/toppling.js';
import { FallingRocks } from './game/falling-rocks.js';
import { SwampLife } from './game/swamp-life.js';
import { MudLaunchers } from './game/mud-launchers.js';
import { EnemyJeeps } from './game/enemy-jeeps.js';
import { Lasers } from './game/lasers.js';
import { ArenaGate } from './game/arena-gate.js';
import { Soldiers, soldierFire } from './game/soldiers.js';
import { POWs } from './game/pows.js';
import { Gunboats } from './game/gunboats.js';
import { Tanks } from './game/tanks.js';
import { FlameSoldiers } from './game/flame-soldiers.js';
import { cullModelInstances } from './game/chunks.js';
import { Flyby } from './game/flyby.js';
import { BossArena } from './game/arena.js';
import { HindBoss } from './game/hind-boss.js';
import { LightHeliSquad } from './game/light-heli-squad.js';
import { AirbaseBoss } from './game/airbase-boss.js';
import { SecretExit } from './game/secret-exit.js';
import { Pickups } from './game/pickups.js';
import { SAVE_KEY, CARRY_KEY, renderSlots, writeSlot, play, markCleared, unlockSecret, readRun, writeRun } from './game/saves.js';
import { Input } from './game/input.js';
import { Player, HALF_LEN, HALF_WID } from './game/player.js';
import { Weapons, WEAPON_NAMES } from './game/weapons.js';
import { tr, translate, isZh, stageName, stageClear as stageClearTitle } from './game/lang.js';
const weaponName = level => tr(WEAPON_NAMES[level]); // (the score line's language: lang.js)
import { Intro } from './game/intro.js';
import { GameCamera } from './game/camera.js';
import { PerfHud } from './game/perf.js';
import { LiveProfile } from './game/live-profile.js';
import { openToggles } from './game/stage-toggles.js';
import { GateFight } from './game/gate-fight.js';
import { BossFight } from './game/boss-fight.js';
import { Walkers } from './game/walkers.js';
import { PlateauExit } from './game/plateau-exit.js';
import { wetten } from './game/wet-look.js';
import stage1 from './levels/stage1/index.js';
import stage2 from './levels/stage2/index.js';
import stage3 from './levels/stage3/index.js';
import stage4 from './levels/stage4/index.js';
import stage5 from './levels/stage5/index.js';
import stage6 from './levels/stage6/index.js';
import secretStage from './levels/secret/index.js';
import { params as navParams, go } from './game/nav.js';
import { Quality, TIERS } from './game/quality.js';
import { setShadowSamples } from './game/soft-shadows.js';
import { GFX_INFO } from './game/gfx-info.js';
import { fullscreenButton, onFullscreenChange } from './game/fullscreen.js';
import { setupTouch } from './game/touch.js';
import { createMsaa } from './game/msaa.js';
import { loadStep, loadDone, loadProgress } from './game/loading.js';
import { menuKeys, focusFirst } from './game/menu-keys.js';
import { sfx, menuSounds, volumeSliders } from './game/sfx.js';
import { applyUiScale } from './game/ui-scale.js';

// ?stage=2 picks the stage (the results screen's NEXT STAGE button goes on to the next one).
const STAGES = [stage1, stage2, stage3, stage4, stage5, stage6];
const SECRET_NO = STAGES.length + 1;
// Where the game logic's time goes (a debugging aid): lap('name') after each part of the frame's update adds the time since the last lap to that name; __lapReport() in the console prints the average ms per frame of each, biggest first, and starts over.
let lapLast = 0, lapFrames = 0; const lapT = {}; const lapWorst = { n: '', v: 0, sum: 0 }; const lap = name => { const n = performance.now(), d = n - lapLast; lapT[name] = (lapT[name] || 0) + d; lapWorst.sum += d; if (d > lapWorst.v) { lapWorst.v = d; lapWorst.n = name; } lapLast = n; };
window.__lapReport = () => { const rows = Object.entries(lapT).sort((a, b) => b[1] - a[1]).slice(0, 14).map(([k, v]) => k.padEnd(16) + (v / Math.max(1, lapFrames)).toFixed(2) + ' ms'); console.log('game logic, ms per frame over ' + lapFrames + ' frames:' + String.fromCharCode(10) + rows.join(String.fromCharCode(10))); for (const k in lapT) delete lapT[k]; lapFrames = 0; }; // the secret level (?stage=secret or ?stage=7): not part of the main run, so STAGES (and 'the last stage') stay as they are
const stageNo = ['secret', String(SECRET_NO)].includes(navParams.get('stage')) ? SECRET_NO : Math.min(STAGES.length, Math.max(1, +navParams.get('stage') || 1));
const stage = stageNo === SECRET_NO ? secretStage : STAGES[stageNo - 1];

const canvas = document.getElementById('c');
const quality = new Quality(); // graphics level (see quality.js): sets the soft shadows up before anything compiles
if (stage.shadowTiers) { quality.cap = stage.shadowTiers; setShadowSamples(quality.level.samples, quality.level.shadow); } // (a stage with faint shadows has cheaper ones at the top levels)
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' }); // (laptops with two GPUs: the faster one)
const msaa = createMsaa(renderer); // antialiasing, switchable while playing (the canvas's own can't be: see msaa.js)
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const world = await createWorld(renderer, stage, loadStep); // (pauses between its parts to move the loading bar on)
await loadStep('actors');
const { scene } = world;
const fx = new Fx(scene); fx.snowy = !!stage.isSecretLevel; fx.wet = !!stage.puddles;
fx.crater = (p, size) => { const gt = world?.groundTrail; if (!gt || size < .35) return; if ((world.tileAt(p.x, p.z) === 'S' && !world.seaFrozen) || p.y > world.heightAt(p.x, p.z) + 2.5) return; gt.crater(p.x, p.z, .8 + size * 1.1, Math.min(1, .55 + size * .3)); }; // (explosions on the snow leave craters: ground-trail.js; one in the air or on the sea leaves none) // (stage 6: no dust from the wheels and tracks)
const input = new Input();
setupTouch(input, name => name === 'god' ? toggleGod() : giveArms()); // on-screen controls, shown once the screen is touched (and the touch cheat codes: invulnerable on / off; all weapons)
const player = new Player(scene, { wet: !!stage.puddles, envMap: world.wetEnv });
let lastPlayerPos = null, rippleIn = 0, puddleProbeIn = 0; // (the jeep's wake in stage 6's puddles)
sfx.follow(player.position); menuSounds(); applyUiScale(); // (sound effects: explosions fade with distance from the jeep; ticks and chirps on the menus)
player.fx = fx; // dust and exhaust behind the jeep
const debris = new Debris(scene, world.debrisGround ?? world.heightAt, { // wreckage coming down on water sinks (debris.js)
  at: (x, z) => world.tileAt(x, z) === '~' || (!!stage.isSecretLevel && world.tileAt(x, z) === 'S' && !world.seaFrozen) || !!world.swampAt?.(x, z), // (stage 4's mud swallows wreckage too)
  splash: (p, size) => { world.ripple(p, Math.min(1, .3 + size)); if (size > .08) fx.puff(p, { color: world.swampAt?.(p.x, p.z) ? 0x6a5632 : 0xe8f2f4, size: .2 + size, grow: 2.5, life: .5, opacity: .7, vel: new THREE.Vector3(0, 1.5, 0) }); },
});
if (stage.puddles) setSmallDebris(.6, .6); // (stage 6: loose pieces under about a metre across cast no shadow and are not mirrored in the wet road: a draw call each in two more passes for nothing you can see)
debris.pitAt = stage.chasm ? (x, z) => world.tileAt(x, z) === 'V' : null; // (stage 5: what comes to rest on a chasm's floor is sunk away, not left lying there)
debris.conveyorAt = world.conveyorAt; // (loose wreckage that lands on stage 6's conveyor belts rides them and sinks in)
fx.fires = new Fires(scene, fx); // burning wrecks
const enemyFire = new EnemyFire(scene, fx);
const statues = new Statues(scene, fx, enemyFire, world.statues); // stage 2's pool statues fire missiles
const bombers = [].concat(stage.bomber ?? []).map(spot => { const b = new BomberRaid(scene, fx, enemyFire); b.setup(spot, debris); return b; }); // stage 2: bombers dive on the jeep, each once
// Stage 2's boss fight: a bomber comes in every so often while a bust still stands (sooner as fewer remain), alternating the corner it comes from; not counted in the kill rate.
const RAID_FIRST = 5, RAID_GAPS = [0, 7, 9, 11, 13], RAID_FROM = ['ne', 'nw', 'e'];
const raiders = []; let raidIn = RAID_FIRST, raidNo = 0;
// Stage 1's boss fight: foot soldiers step out of the jungle along the arena's two sides every few seconds (a few at a time, not counted in the kill rate).
const TROOP_EVERY = [5, 8], TROOP_MAX = 4; let troopIn = 3;
function bossTroops(dt) {
  if (stage.boss !== undefined && stage.boss !== 'tanks' || stage.noBossTroops || arena.state !== 'fight' || stageClear || !player.enabled || player.dead || (troopIn -= dt) > 0) return;
  troopIn = TROOP_EVERY[0] + Math.random() * (TROOP_EVERY[1] - TROOP_EVERY[0]);
  if (soldiers.list.filter(s => s.extra && !s.dead).length >= TROOP_MAX) return;
  const a = arena.box;
  soldiers.arenaBox = a; // (he walks through the trees, so he can start right in them)
  const x = Math.random() < .5 ? a.x0 + .5 : a.x1 - .5, z = a.north + 6 + Math.random() * (a.south - a.north - 24);
  soldiers.spawn(new THREE.Vector3(x, world.heightAt ? world.heightAt(x, z) : 0, z));
}
function bossRaids(dt) {
  for (let i = raiders.length - 1; i >= 0; i--) { const r = raiders[i]; r.update(dt, world, player, cam, killPlayer); if (r.state === 'done' && !r.bombs.length) raiders.splice(i, 1); } /* (a raid stays until its last bomb has landed: removed sooner, the bombs still falling hung in the air) */
  if (stage.boss !== 'statues' || arena.state !== 'fight' || stageClear || !player.enabled || player.dead) return;
  const left = world.statues.filter(s => s.boss && s.target.hp > 0).length; if (!left || (raidIn -= dt) > 0 || raiders.length) return;
  const b = new BomberRaid(scene, fx, enemyFire); b.setup({ from: RAID_FROM[raidNo++ % RAID_FROM.length] }, debris); b.start(cam, player, world); raiders.push(b);
  raidIn = RAID_GAPS[Math.min(left, 4)];
}
const arenaGate = stage.arenaGate ? new ArenaGate(scene, world, stage.arenaGate) : null; // stage 6: the fence across the map with the red energy door and its two cannon towers (the look only, for now)
window.__gateInfo = () => { const rows = []; for (const p of arenaGate?.parts ?? []) { const ms = []; p.traverse(o => { if (o.isMesh) ms.push(o); }); rows.push({ part: p.name || p.type, meshes: ms.length, materials: new Set(ms.map(m => m.material.uuid)).size, calls: ms.reduce((n, m) => n + (Array.isArray(m.material) ? m.material.length : 1), 0), verts: ms.reduce((n, m) => n + m.geometry.attributes.position.count, 0) }); } console.table(rows); return rows.reduce((n, r) => n + r.calls, 0); }; // (type __gateInfo() in the console: the arena gate's parts, and the draw calls each costs)
const lasers = new Lasers(scene, fx, enemyFire); lasers.setup(world); arenaGate?.lightUp(lasers); // (the north gate's curtain is lit by its own red point light, see world.js; the maze-style paint patch is not used: with it every tank and soldier on this level went black) // (stage 6: the gate's curtain lights what is near it red, as the maze's do) // stage 3's force-field maze
const enemyJeeps = new EnemyJeeps(scene, fx, debris, enemyFire); enemyJeeps.setup(world, stage.jeepSpawns); if (stage.jeepSpawns?.length || stage.iceBombers) enemyJeeps.makeSpare(); // grey jeeps that circle the player lobbing bombs
const topplings = world.topplers.map(p => { const t = new Toppling(scene, fx, debris, enemyFire); t.setup(world, p); return t; }); // stage 2: pillars break and their tops come down at the jeep
await loadStep('troops');
const soldiers = new Soldiers(scene, fx, enemyFire, debris, { ...soldierFire(stageNo), ...stage.difficulty?.soldier }); // (they fire a little more often each stage)
soldiers.populate(world); // the stage's garrison, idle until the jeep comes near
const gunboats = new Gunboats(scene, fx, debris);
gunboats.setup(world, stage.patrolBoats); // two up the river from each bridge, sail down when the jeep comes near
const tanks = new Tanks(scene, fx, debris);
const gateFight = arenaGate ? new GateFight(arenaGate, world, scene) : null; // stage 6: the gate's two cannons are enemies (gate-fight.js)
enemyJeeps.tanks = tanks; // (the enemy jeeps keep off the tanks)
tanks.setup(world, gunboats, stage.tankSpawns); // rolls in as the second boat comes into view
await loadStep('world2');
const lightning = stage.lightning ? new Lightning(scene, stage.lightning, v => { world.puddleFlash(v); wetFlash.value = v; }, (...a) => world.puddleBolt(...a)) : null; // stage 6: storm flashes (lightning.js)
if (lightning) addEventListener('keydown', e => { if (e.repeat && !/^(Comma|Period|BracketLeft|BracketRight)$/.test(e.code)) return; if (e.key === 'l') lightning.trigger(cam.camera, navParams.has('lightseed') ? +navParams.get('lightseed') : null, true); else if (e.key === 'L') lightning.replay(cam.camera); else if (e.key === 'k') lightning.toggleHold(cam.camera); else if (e.code === 'Comma') lightning.turn(e.shiftKey ? -1 : -5); else if (e.code === 'Period') lightning.turn(e.shiftKey ? 1 : 5); else if (e.code === 'BracketLeft') lightning.raise(-4); else if (e.code === 'BracketRight') lightning.raise(4); }); // (K: hold the lightning on; , and . turn its light, [ and ] raise and lower it) // (L: a strike now, its seed shown; Shift+L: the same one again; ?lightseed=N fixes the seed)
const rain = stage.rain ? new Rain(scene, stage.rain) : null; // stage 6: falling rain (rain.js)
let blizzard = 0; // (0: steady snowfall, 1: a full blizzard: thicker and driven sideways, see snow.js)
// The summit road: the weather follows the jeep's climb (its height up the road): steady snow at the foot, a moderate blizzard at the top, the wind rising, and the air thickening into a whiteout that closes in from the edges of the screen.
const summitCfg = stage.mountains?.summit, summitCfg2 = stage.mountains?.summit2; let climbK = 0, climbBliz = 0, arenaK = 0, summitEntered = false; // (summitEntered: the jeep is in the passage to the summit)
if (summitCfg) scene.fog = new THREE.Fog(0xccd4e0, 0, 1); // (no mist until the jeep climbs: see the climb code below)
const whiteout = summitCfg ? Object.assign(document.createElement('div'), { id: 'whiteout' }) : null;
if (whiteout) { Object.assign(whiteout.style, { position: 'fixed', inset: '0', pointerEvents: 'none', zIndex: '1', opacity: '0', background: 'radial-gradient(ellipse at 50% 55%, rgba(205,212,224,.10) 0%, rgba(205,212,224,.32) 50%, rgba(208,215,226,.9) 100%)' }); document.body.appendChild(whiteout); }
const snow = stage.plan ? new Snow(scene) : null; // the secret level: falling snow, from none on the sunny beach to a blizzard at the far end (snow.js)
const RAIN_TOPS = { f35: 2.4, sandbags: 1.0, hedgehog: 1.2, drumstack: 1.4, cratestack: 1.5, displaytank: 2.1, tent: 3, barracks: 3, hut: 2.5, powhut: 2.5, gate: 3.5, conveyor: .8, wallturret: 1.2 }; // (m: how high the things the rain can land on stand, by kind)
rain?.setHeights((x, z) => world.buildingTop(x, z), world.mapSize, [...world.obstacles.filter(o => RAIN_TOPS[o.kind]).map(o => ({ x: o.x, z: o.z, hw: o.hw, hd: o.hd, h: RAIN_TOPS[o.kind] })), ...world.rainTops]); // (its splashes land on the roofs and on these too)
const flameSoldiers = new FlameSoldiers(scene, fx, debris); flameSoldiers.setup(world); // stage 5's helipad guards
const iceRaids = [], iceRaidQueue = []; let iceRaidStart = null, iceRaidWave = 0; // the secret level's bomber attacks on the way across the ice to the island: three waves of two planes
window.__ice = () => ({ iceT, iceGo, seaFrozen: world.seaFrozen, bombWave: iceRaidWave, bombStart: iceRaidStart }); // (type __ice() in the console to see how far the sea has frozen)
let stackT = 0; // (the power station's smoke)
let iceT = 0, iceGo = false; // the secret level's sea: how far it has frozen (0 to 1), from the helicopter lifting off the summit
const flyby = new Flyby(scene, fx);
flyby.setup(world, stage.heliTriggerZ, stage.heliExit); flyby.onDepart = () => { if (stage.isSecretLevel) iceGo = true; };
if (stage.isSecretLevel && navParams.get('ice') === 'on') { iceGo = true; iceT = 1; gunboats.freeze(true); } // (open water until the helicopter lifts off; ?ice=on: frozen from the start, to work on it) // a helicopter crosses the screen as the jeep nears the helipad, then waits there
const arena = new BossArena();
arena.setup(stage, LEVEL, tanks, world.statues.filter(s => s.boss), () => { enemyFire.clear(true); statues.clear(world); defeatArena(); stageClear = true; addScore(STAGE_BONUS); markCleared(stageNo); saveProgress(); setTimeout(showResults, 2500); }, scene); // the boss fight at the top; results once the last blast has played out
const warship = new Warship(scene, fx, debris, statues); warship.lite = !!quality.level.plainHud; warship.setup(world, stage.warship, arena); // stage 3: the boss's warship sails in once the arena shuts
fx.garageOpen = obj => tanks.openGarage(obj.position); // (stage 5's garage hut: the tank inside rolls out)
fx.pows = new POWs(scene, fx); // prisoners released from blown-open barracks
const weapons = new Weapons(scene, fx, debris);
const INTRO_ANGLE = Math.PI, INTRO_FROM = 3 * Math.PI / 4; // the secret level's drop-off: the transport comes in from the south-west (INTRO_FROM), turns to face north before it lands (INTRO_ANGLE), and the jeep drives out of its rear, to the south
const dropSpot = world.start.clone(); if (stageNo === 1) dropSpot.x -= 10; // (the secret level: the jeep rolls 10 m north off the ramp and stops on world.start)
 // the opening drop-off lands 10 m further west; the camera still starts where it always did (world.start)
const PS = stage.powerStation, FLY_IN = stageNo === SECRET_NO && PS && navParams.get('flyin') !== 'off'; // (the secret level opens with a long flight in over the island and its power station, so the player sees them before anything else: ?flyin=off for the old short drop-off)
const intro = new Intro(scene, player, fx, dropSpot, world.tileAt, stageNo === SECRET_NO ? { angle: INTRO_ANGLE, approach: FLY_IN ? Math.atan2(dropSpot.x - (PS.x - 10), dropSpot.z - (PS.z + 8)) : INTRO_FROM, turn: -.5, fly: FLY_IN ? { start: [PS.x + 52, PS.z - 70, 24], over: [PS.x - 10, PS.z + 8, 19], look: [PS.x - 5, PS.z - 8], speed: 24 } : null } : {});
if (stageNo > 1 && stageNo !== SECRET_NO) intro.startWithout(); // only stage 1 and the secret level open with the transport drop-off
const cam = new GameCamera(world.start); if (stageNo === SECRET_NO) { cam.focus.copy(cam.followTarget(world.start)); cam.place(); } /* (the secret level: the camera holds still where it would be with the jeep at the landing spot, through the whole drop-off) */ cam.secret = stage.secret ?? null; sfx.screen(cam.focus); // (stage 5: the secret land beyond the left edge: the camera may scroll on there)
if (stageNo === SECRET_NO && stage.mountains?.summit) { cam.followHeight = true; cam.secret = { areas: [{ z0: -216, z1: -98, x1: -66 }], focusMin: -131 }; } // (the summit road in the west: the camera rises with the jeep and follows it on into the mountains)
if (intro.fly) intro.rest = cam.focus.clone(); // (the fly-in's camera ends on the landing zone, where the camera has always started)
weapons.camera = cam.camera; // grenades judge hits on soldiers the way they look on screen
await loadStep('units');
const pickups = new Pickups(scene, fx);
pickups.setup(world);
weapons.pickups = pickups; // shots reveal hidden stars
let iceSub = null; // (the secret level: a harmless sub under the ice)
await loadStep('subs');
const submarines = new Submarines(scene, fx, debris, statues); submarines.setup(world, [...(stage.submarines ?? []), ...(stage.ambushSubs ?? []).map(a => ({ ...a, ambush: true }))]); // stage 3: missile submarines in the harbour water
await loadStep('defences');
const swampLife = stage.mood && !stage.noSwamp ? new SwampLife(world, fx) : null; // stage 4: bubbles and stirrings in the swamp
const mudLaunchers = new MudLaunchers(scene, fx, statues, debris); mudLaunchers.setup(world); // stage 4: hidden missile launchers in the mud ponds
const fallingRocks = new FallingRocks(scene, fx, debris, enemyFire); fallingRocks.setup(world); // stage 4: boulders on the cliff's lip drop when the jeep comes near
const landmines = new Landmines(scene, fx, enemyFire); landmines.setup(world); // stage 4: mines in the meadow
const dronePads = new DronePads(scene, fx, debris, enemyFire); dronePads.setup(world); dronePads.weapons = weapons; // stage 4: the cliff-face platform whose two drones dive at the jeep
if (stage.powerStation) dronePads.makeSpare();
const plantFight = stage.powerStation ? new PowerPlantFight(scene, fx, debris, dronePads, world) : null; // the secret level's power station: its hit points, its drones, its fires and its end
const bossTank = scene.getObjectByName('bossTank'); if (bossTank) dropTinyShadows(bossTank, 1.3); // (its small fittings, lamps, bolts, rings: no shadow of their own, as the big pieces cast it)
if (bossTank && stage.puddles) wetten(bossTank, world.wetEnv, false, true); // (stage 6: the boss, rain-soaked like the jeep: darker, glossier paint under a film of mirrored sky)
const bossFight = bossTank ? new BossFight(scene, world, fx, enemyFire, statues, dronePads, bossTank, stage.arenaGate ? stage.arenaGate.z : Infinity) : null; // stage 6's final boss: its attacks (boss-fight.js)
if (bossFight) window.__beamDbg = () => bossFight.dbg();
// type __offscreen() in the console: of the meshes the main view would draw, how many lie wholly outside the screen (a draw call spent on nothing), and which ones (the ones three.js cannot cull itself: frustumCulled off)
await loadStep('bosses');
window.__offscreen = () => {
  const f = new THREE.Frustum(), m = new THREE.Matrix4().multiplyMatrices(cam.camera.projectionMatrix, cam.camera.matrixWorldInverse), box = new THREE.Box3(), sph = new THREE.Sphere(), rows = new Map(); f.setFromProjectionMatrix(m);
  let drawn = 0, outside = 0, tris = 0, trisOut = 0;
  scene.traverse(o => {
    if (!(o.isMesh || o.isPoints || o.isLine) || !o.visible || !(o.layers.mask & 1)) return;
    for (let p = o.parent; p; p = p.parent) if (!p.visible) return;
    const g = o.geometry; if (!g) return; if (!g.boundingBox) g.computeBoundingBox();
    const t = (g.index ? g.index.count : g.attributes.position.count) / 3 * (o.isInstancedMesh ? o.count : 1);
    const seen = o.frustumCulled ? f.intersectsObject(o) : true; if (!seen) return;   // (three.js skips it already)
    drawn++; tris += t;
    box.copy(g.boundingBox).applyMatrix4(o.matrixWorld);
    if (o.isInstancedMesh) return;   // (its instances are spread out: the whole box says nothing)
    if (!f.intersectsBox(box)) { outside++; trisOut += t; const k = (o.name || o.parent?.name || o.material?.name || o.type) + (o.frustumCulled ? '' : ' [culling off]'); rows.set(k, (rows.get(k) ?? 0) + 1); }
  });
  console.log('drawn', drawn, 'of which wholly off screen', outside, '| triangles', Math.round(tris), 'wasted', Math.round(trisOut), [...rows].sort((a, b) => b[1] - a[1]).slice(0, 12));
};
if (bossFight) { // the arena is locked behind the jeep (the gate's curtain, see BossFight.lockCheck); five seconds after the boss goes the stage is won: the way back opens and the results roll
  bossFight.gate = arenaGate;
  bossFight.onDefeated = () => setTimeout(() => { bossFight.unlock(cam); if (stageClear) return; enemyFire.clear(true); statues.clear(world); stageClear = true; addScore(STAGE_BONUS); markCleared(stageNo); saveProgress(); setTimeout(showResults, 2500); }, 2500);
}
const walkers = stage.walkers && navParams.get('walkers') !== 'off' ? new Walkers(scene, world, fx, enemyFire, debris, stage.walkers) : null; // the secret level's boss: the twin walkers (walkers.js; ?walkers=off leaves them out)
const plateauExit = walkers && stage.extraction ? new PlateauExit(scene, player, fx, world, stage.extraction, cam) : null; // the way out of the boss plateau: the transport that comes for the jeep (plateau-exit.js)
if (walkers) { window.__walkers = walkers;
  const clearStage = () => { if (stageClear) return; enemyFire.clear(true); stageClear = true; addScore(STAGE_BONUS); markCleared(stageNo); saveProgress(); setTimeout(showResults, 500); };
  walkers.onDefeated = () => setTimeout(() => { enemyFire.clear(true); if (plateauExit) { plateauExit.onDone = clearStage; plateauExit.call(); } else clearStage(); }, 2500); // (both are down: the transport comes; the clear screen follows the jeep's flight out)
}
const hind = stage.hindBoss && arena.box ? new HindBoss(scene, fx, debris, enemyFire, statues, dronePads, soldiers, fallingRocks) : null; // stage 4's boss: a Mi-24 gunship, in three rounds
hind?.setup(world, arena.box, () => arena.win(cam));
const lightHelis = stage.lightHelis && !navParams.has('nohelis') ? new LightHeliSquad(scene, fx, debris, enemyFire) : null; // (debugging: ?nohelis=1 leaves the helicopters out) // stage 6: two light helicopters guard the helipad, one at a time
lightHelis?.setup(world, stage.lightHelis);
const heliAmbush = stage.heliAmbush && !navParams.has('nohelis') ? new LightHeliSquad(scene, fx, debris, enemyFire, { key: 'ambushHeli' }) : null; // (stage 6: a second pair, set off by the jeep coming within r m of a spot)
heliAmbush?.setup(world, stage.heliAmbush);
const heliFinal = stage.heliFinal && !navParams.has('nohelis') ? new LightHeliSquad(scene, fx, debris, enemyFire, { key: 'finalHeli', max: 1 }) : null; // (stage 6: a single helicopter, when the jeep crosses a line near the end)
heliFinal?.setup(world, stage.heliFinal);
const airbase = stage.airbase ? new AirbaseBoss(scene, fx, debris, tanks, enemyJeeps) : null; airbase?.setup(world, stage.airbase, () => arena.onClear?.(), arena); if (airbase) airbase.msaa = msaa; if (airbase) airbase.onBossDown = () => { enemyFire.clear(true); defeatArena(t => t === airbase.gateT); }; // (the last garage falls: shells in the air and every enemy still in the arena go at once, but not the gate: that is for the player to blow) (airbase.msaa, set above: the final pass, for the shockwave when the energy field fails) // stage 5's boss: four garages, the generator and the gate's energy field (airbase-boss.js); the stage is won when the gate is blown
const secretExit = airbase && world.secretPad ? new SecretExit(scene, player, fx, world.secretPad, airbase.cfg.secretGate.x) : null; // stage 5's secret way out: the transport takes the jeep away once the secret gate is blown
let superSecret = false; // stage 5's super secret: counted only when the jeep has left through the secret helipad's transport (not just found the passage)
if (secretExit) airbase.onSecretGate = () => { enemyFire.clear(true); secretExit.start(cam, () => { superSecret = true; unlockSecret(); arena.onClear?.(); }); };
arena.onDown = () => { tanks.keepWrecks = true; enemyFire.clear(true); statues.clear(world); defeatArena(); markCleared(stageNo); }; // (the boss's armour is gone: shells and missiles in the air and every enemy in the arena go at once, whichever stage's boss it is)
if (hind) hind.onDown = arena.onDown; // (the boss's armour is gone: the rest of the arena's enemies are destroyed at once)
const trainRide = new TrainRide(world, fx, debris); // stage 4: the train that arrives when the jeep passes a line
const camoTurrets = new CamoTurrets(scene, fx, debris, enemyFire); camoTurrets.setup(world); // stage 3: guns hidden flush in the road markings
const apcs = new Apcs(scene, fx, debris, soldiers); apcs.setup(world, stage.apcs); // stage 3: an armoured carrier that drives to the helipad and unloads soldiers
weapons.statues = statues; // bullets shoot the statues' missiles down
let chimneyT = 0; const chimneyAt = new THREE.Vector3();
const perf = new PerfHud(renderer);
{ const sm = renderer.shadowMap, r0 = sm.render; sm.render = function (l, sc, cam) { world.forestShadowPrep?.(cam); r0.call(this, l, sc, cam); world.forestShadowDone?.(); }; } // (the shadow pass draws only the trees whose shadow can reach the view: forest.js)
perf.extra = () => { const f = world?.forestStats; return f ? `  trees   on screen ${f.seen}   main pass ${f.drawn}   shadow pass ${f.shadowN ?? 0}   (of ${f.total}; a tree is 1-2k triangles)` : '  trees   none'; };
{ // tuning: the shadow box's edges (metres in the sun's view, see SHADOW_BOX in soft-shadows.js). Shrink
  // them until shadows go missing at the screen edges; then the values go into SHADOW_BOX. (The soft
  // shadows' blur width is worked out for SHADOW_BOX, so it's a little off while these differ.)
  const sc = world.light.sun.shadow.camera;
  for (const [edge, min, max] of [['left', -60, -10], ['right', 10, 60], ['bottom', -50, -10], ['top', 10, 50]])
    perf.slider(`shadow ${edge}`, min, max, 1, sc[edge], v => { sc[edge] = v; sc.updateProjectionMatrix(); });
  // the main view's culling: 1 = exactly what's on screen; higher drops things near the edges sooner (pop-in)
  perf.slider('main cull', .8, 2, .05, 1, v => world.setMainCull(v));
  perf.button('LIST DRAWN OBJECTS (what is wasted)', () => perf.showText(world.drawnObjects(renderer))); // (per pass: what is drawn although outside the view or too small to show: see world.js)
  if (stageNo === 6) perf.button('STAGE SWITCHES (tick boxes: take things out of the scene)', () => openToggles({ renderer, scene, world, rain, debris, soldiers, tanks, enemyJeeps, player, perf })); // (what each kind of thing costs, found by hand: see stage-toggles.js)
  if (stageNo === 6) perf.button('RUN WET ROAD PROFILE (freezes the game ~40 s)', () => liveProfile.start('wet'));
  if (stageNo === 6) perf.button('RUN STAGE 6 PROFILE (freezes the game ~1 min)', () => liveProfile.start('stage6')); // (what the storm, the wet road and the arena cost, with the baseline re-measured between tests: see live-profile.js)
  if (stageNo === 4) perf.button('RUN STAGE 4 PROFILE (freezes the game ~1 min)', () => liveProfile.start('stage4')); // (what each swamp thing costs, with the baseline re-measured between tests: see live-profile.js)
  perf.button('RUN LIVE PROFILE (freezes the game ~25 s)', () => liveProfile.start()); // (what a slow device is bound by, on the scene on screen: see live-profile.js)
}

// Debug: ?intro=9 starts the cutscene 9 seconds in.
const params = navParams;
if (params.has('intro')) intro.t = +params.get('intro');
// Debug: ?z=200 skips the intro and starts the jeep 200 m up the stage (optional &x=).
if (params.has('z')) {
  intro.t = 30; intro.update(0);
  player.position.set(+params.get('x') || 0, 0, -params.get('z'));
  cam.focus.set(player.position.x, 0, player.position.z - 4);
}


// The shadow pass tests every shadow-casting mesh in the stage against the sun's box each frame, however far away it is (1600 of them in stage 4, a dozen drawn).
// Every few frames the ones that stand well outside the shadow box (and their shadows' reach) stop casting, and start again as the jeep nears them.
const SHADOW_FAR = 78; // m from the camera's focus: the shadow box's far corner is about 50 m out, plus the tallest caster's shadow
const farCasters = []; let farTick = 0; const _c = new THREE.Vector3(), _s = new THREE.Vector3();
function cullFarShadows(focus) {
  if (farTick++ % 10) return;
  if (farTick % 200 === 1) { farCasters.length = 0; scene.traverse(o => { if (o.isMesh && !o.isInstancedMesh && (o.castShadow || o.userData.farOff) && o.geometry) farCasters.push(o); }); } // (the list is rebuilt now and then: wreckage and new things join in)
  for (const o of farCasters) {
    if (o.userData.keepShadow) continue;
    const g = o.geometry; if (!g.boundingSphere) g.computeBoundingSphere();
    _c.copy(g.boundingSphere.center).applyMatrix4(o.matrixWorld); o.matrixWorld.decompose(_s, _q, _sc);
    const near = Math.hypot(_c.x - focus.x, _c.z - focus.z) - g.boundingSphere.radius * Math.max(_sc.x, _sc.y, _sc.z) < SHADOW_FAR;
    if (near && o.userData.farOff) { o.castShadow = true; o.userData.farOff = false; }
    else if (!near && o.castShadow) { o.castShadow = false; o.userData.farOff = true; }
  }
}
const _q = new THREE.Quaternion(), _sc = new THREE.Vector3();
{ // F9: show what each render pass draws right now (draw-call debugging), on screen
  const box = document.createElement('pre');
  box.style.cssText = 'position:fixed;left:8px;top:8px;margin:0;padding:8px;background:rgba(0,0,0,.85);color:#7f7;font:11px monospace;z-index:99;display:none;white-space:pre;max-height:calc(100vh - 32px);overflow:auto'; // (scrolls with the mouse wheel over it);
  document.body.appendChild(box);
  addEventListener('keydown', e => {
    if (e.key !== 'F9') return; e.preventDefault();
    if (box.style.display !== 'none') { box.style.display = 'none'; return; }
    const rep = world.drawReport();
    box.textContent = Object.entries(rep).map(([k, v]) => `${k}: ${v.total} calls, ${Math.round(v.tris / 1000)}k tris\n` + v.top.map(g => `  ${String(g.calls).padStart(4)} calls ${String(Math.round(g.tris / 1000)).padStart(4)}k tris ${String(g.items).padStart(3)} obj  ${g.key}  ${g.at}`).join('\n') + '\n  -- most triangles --\n' + v.heavy.map(g => `  ${String(Math.round(g.tris / 1000)).padStart(4)}k tris ${String(g.calls).padStart(4)} calls  ${g.key}  ${g.at}`).join('\n') + '\n  -- calls by model --\n' + v.owners.map(w => `  ${String(w.calls).padStart(4)} calls ${String(w.models).padStart(3)} models  ${w.label}`).join('\n')).join('\n\n');
    box.textContent += '\n\n' + world.shadowBench(renderer);
    { const sizes = scene.children.map(c => { let n = 0; c.traverse(() => n++); return [(c.name || c.type) + (c.isInstancedMesh ? ' (instanced)' : '') + (c.children.length ? ' [' + c.children.slice(0, 2).map(k => k.name || k.type).join(',') + ']' : ''), n, c.matrixAutoUpdate]; }).sort((x, y) => y[1] - x[1]);
      box.textContent += '\nobjects by top-level child (name, objects below it, matrixAutoUpdate): ' + sizes.slice(0, 18).map(([k, v, au]) => `${k} ${v}${au ? '' : ' (frozen)'}`).join(', ') + `   [${scene.children.length} top-level children]\n`; }
    { let n = 0, meshes = 0, casters = 0; const by = new Map(); scene.traverse(o => { n++; if (o.isMesh) { meshes++; if (o.castShadow) { casters++; let p = o, who = ''; while (p && !who) { who = p.name; p = p.parent; } const k = (who || 'unnamed') + (o.isInstancedMesh ? ' (instanced)' : ''); by.set(k, (by.get(k) ?? 0) + 1); } } }); box.textContent += `

scene objects: ${n}  meshes: ${meshes}  shadow casters: ${casters}
most casters by name: ` + [...by].sort((x, y) => y[1] - x[1]).slice(0, 12).map(([k, v]) => `${k} ${v}`).join(', '); }
    box.textContent += `

APCs: ` + (apcs.list.map(a => { let n = 0; a.obj.traverse(m => { if (m.isMesh) n++; }); return `${a.state} at ${a.obj.position.x.toFixed(1)},${a.obj.position.z.toFixed(1)} in scene=${!!a.obj.parent} visible=${a.obj.visible} meshes=${n} obstacle alive=${a.ob.alive}`; }).join(' | ') || 'none');
    box.style.display = 'block';
  });
}
if (import.meta.env.DEV) window.game ={ world, player, cam, intro, setBlizzard: k => { blizzard = Math.min(1, Math.max(0, k)); } }; // poke at it from the browser console

// Dev only: F toggles fly-through mode. WASD pans (Shift = fast), the mouse wheel zooms.
// Pressing F again drops the jeep where the camera is looking, so you can test things there.
let flying = false;
function toggleFly() {
  if (!import.meta.env.DEV) return;
  if (!flying) {
    intro.skip();
    flying = true; player.enabled = false;
  } else {
    const f = cam.focus;
    let spot = null; // nearest spot the jeep fits
    for (let r = 0; r < 40 && !spot; r += 1.25) {
      for (let i = 0; i < 16; i++) {
        const a = i / 16 * Math.PI * 2, x = f.x + Math.cos(a) * r, z = f.z + Math.sin(a) * r;
        if (!world.blockedRect(x, z, player.yaw, HALF_LEN + .15, HALF_WID + .15)) { spot = { x, z }; break; } // room for the whole jeep
      }
    }
    if (spot) player.position.set(spot.x, 0, spot.z);
    cam.zoom = 1; cam.focus.set(player.position.x, 0, player.position.z - 4);
    flying = false; player.enabled = true;
  }
  hud.fly.hidden = !flying;
}
addEventListener('wheel', e => {
  if (flying) cam.zoom = THREE.MathUtils.clamp(cam.zoom * (e.deltaY > 0 ? 1.15 : 1 / 1.15), .4, 6);
}, { passive: true });

const hud = {
  score: document.getElementById('score'), fly: document.getElementById('fly'),
  lives: document.getElementById('lives'), gameOver: document.getElementById('gameover'), pows: document.getElementById('pows'),
  weapon: document.getElementById('weapon'), clear: document.getElementById('clear'),
};
let score = 0;
// stage stats for the results screen
let playTime = 0, stageClear = false, rescued = 0;
let totalTime = 0; // s played over the whole game so far: carried from stage to stage, kept in saves, not wound back by RETRY
const STAGE_BONUS = 10000;
for (const id of ['top', 'pause', 'clear', 'gameover']) translate(document.getElementById(id)); // the score line, pause menu and stage results in the title menu's language (lang.js)
const addScore = n => { if (god) return; score += n; hud.score.textContent = score; }; // (invulnerable: the score stays put, the stage bonus and the pickups' too)
// The boss is down: every enemy still standing in the boss arena (tanks, gun emplacements, soldiers...) is destroyed, one after another over about a second, and counts as a kill.
let awaitSound = false, bossFell = false, bossFaded = false; // (the boss's health has run out: its music fades away, leaving silence until the results)
for (const b of [bossFight, walkers]) if (b?.onDefeated) { const was = b.onDefeated; b.onDefeated = () => { bossFell = true; was(); }; }
if (arena.onDown) { const was = arena.onDown; arena.onDown = () => { bossFell = true; was(); }; if (hind) hind.onDown = arena.onDown; }
const bossIsDown = () => bossFell || arena.state === 'clear' || warship.state === 'sinking' || (airbase && ['powerdown', 'down', 'done'].includes(airbase.state));
let startPlayedAt = stageNo === 1 && navParams.has('load') ? -1e9 : null, startJingle = stageNo === 1 && !navParams.has('load') && !intro.done; // (a loaded game or a retry of stage 1 skips the jingle: its music plays at once) // (game start: stage 1's opening jingle, until it has played)
function bossMusic() { // (the boss fight's track: from the arena's siren, or the final boss's gate closing, or the twin walkers waking, until the stage is won)
  if (gameOver) return 'gameover'; // (out of lives: the game-over jingle, once)
  if (resultsShown) return 'clear'; // (the results panel is up: the clear jingle, once)
  if (bossFight?.locked) return 'finalBoss';
  if (arena.state === 'intro' || arena.state === 'fight' || (walkers?.started && !walkers.walkers.every(w => w.dead))) return 'boss';
  return null;
}
function defeatArena(skip = () => false) { // skip: targets to leave alone (stage 5: the energy gate, which the player must still blow)
  const a = arena.box; if (!a) return;
  const M = 4, inside = t => t.x > a.x0 - M && t.x < a.x1 + M && t.z > a.north - M && t.z < a.south + M;
  for (const t of world.targets.filter(t => t.hp > 0 && inside(t) && !skip(t))) setTimeout(() => { if (t.hp > 0) { t.immune = false; weapons.damage(t, 9999, t => addScore(t.score)); } }, 150 + Math.random() * 1100);
}
let carried = []; // prisoners on board, by kind ('engineer' / 'green')
const EVAC_RANGE = 9, EVAC_SCORE = 1000, HALF_SCREEN = 25; // m
let evacIn = 0, evacPending = 0; const lastJeepPos = new THREE.Vector3();
const showCarried = () => { hud.pows.textContent = carried.length; };

writeRun(stageNo === 1 && !navParams.has('load') ? null : stageNo); // (a new game forgets the last run's table; replaying a stage forgets that stage's line)
// --- lives: one enemy hit destroys the jeep; it respawns nearby after a moment, blinking ---
let lives = 30 /* (TEMPORARY: 30 lives for this run; the normal start is 4) */, respawnIn = 0, gameOver = false, gameOverPending = false, resultsShown = false, carriedStart = null; hud.lives.textContent = lives; // (the counter on screen starts at what index.html says, 4: it only changed when a life was lost)
if (stageNo > 1 || navParams.has('load')) { // arriving from the previous stage (or a saved game): same lives, launcher and score
  let carry = null;
  try { carry = JSON.parse(sessionStorage.getItem(CARRY_KEY)); } catch {}
  if (carry && carry.stage === stageNo) {
    lives = carry.lives; weapons.level = carry.level; score = carry.score;
    carriedStart = carry.start ?? null; // (a saved game: what the jeep had when this stage began)
    totalTime = carry.totalTime ?? 0;
    hud.lives.textContent = lives; hud.weapon.textContent = weaponName(weapons.level); hud.score.textContent = score;
    if (carry.snap) restoreSnapshot(carry.snap); // a game saved mid-stage: everything back as it was
  }
}
// what the jeep had as this stage began: RETRY starts it again with this. A saved game keeps it too
// (start, in the slot), so loading one mid-stage and retrying still goes back to the stage's real start.
const stageStart = carriedStart?.stage === stageNo ? carriedStart : { stage: stageNo, lives, level: weapons.level, score };

// Saved games (Doom style): the whole stage as it is right now. Enemies, buildings, prisoners, boats,
// tanks, stars and the evac helicopter each save and restore their own part. (A save made during the
// boss fight puts the jeep at the arena's mouth, so the fight starts afresh.)
function takeSnapshot() {
  const at = arena.active && !stageClear ? arena.entrance : player.position;
  const r = v => Math.round(v * 100) / 100;
  return {
    jeep: { x: r(at.x), z: r(at.z), yaw: arena.active ? 0 : r(player.yaw) },
    carried: [...carried], rescued, playTime: r(playTime), visited: !!flyby.visited, ice: iceT, plant: plantFight?.snapshot() ?? null, iceRaid: [iceRaidWave, iceRaidStart],
    world: world.snapshot(), soldiers: soldiers.snapshot(), flameSoldiers: flameSoldiers.snapshot(), pows: fx.pows.snapshot(), boats: gunboats.snapshot(),
    tanks: tanks.snapshot(), pickups: pickups.snapshot(), flyby: flyby.snapshot(), gateFight: gateFight?.snapshot(), bossFight: bossFight?.snapshot(),
    shots: weapons.snapshot(), enemyFire: enemyFire.snapshot(world), statues: statues.snapshot(), subs: submarines.snapshot(), camo: camoTurrets.snapshot(), helis: lightHelis?.snapshot(), helis2: heliAmbush?.snapshot(), helis3: heliFinal?.snapshot(), mines: landmines.snapshot(), train: trainRide.snapshot(), rocks: fallingRocks.snapshot(), launchers: mudLaunchers.snapshot(), drones: dronePads.snapshot(), apcs: apcs.snapshot(), bomber: bombers.map(b => b.snapshot()), jeeps: enemyJeeps.snapshot(), toppling: Object.fromEntries(topplings.map(t => [t.key, t.snapshot()])), intro: intro.snapshot(), // (pillars by where each stands: adding pillars mustn't shuffle them)
  };
}
function restoreSnapshot(snap) {
  if (snap.intro) intro.restore(snap.intro); // saved during the drop-off: the transport carries on from there
  else intro.startWithout(); // no transport: the jeep is where it was
  player.position.set(snap.jeep.x, 0, snap.jeep.z); player.yaw = snap.jeep.yaw; player.object.rotation.y = snap.jeep.yaw;
  cam.focus.copy(cam.followTarget(player.position));
  world.restore(snap.world, fx); soldiers.restore(snap.soldiers, world); flameSoldiers.restore(snap.flameSoldiers); fx.pows.restore(snap.pows);
  gateFight?.restore(snap.gateFight, fx); bossFight?.restore(snap.bossFight, fx); gunboats.restore(snap.boats); tanks.restore(snap.tanks); pickups.restore(snap.pickups); flyby.restore(snap.flyby);
  flyby.visited = snap.visited;
  plantFight?.restore(snap.plant); // (the power station: down, or hurt, as it was)
  if (snap.iceRaid) { iceRaidWave = snap.iceRaid[0] ?? 0; iceRaidStart = snap.iceRaid[1] ?? null; } // (the ice bombers and the chase jeeps that come with them: the waves already sent are not sent again)
  iceT = snap.ice ?? 0; iceGo = iceT > 0; world.setIce(iceT); world.setSeaFrozen(iceT >= 1); gunboats.freeze(iceT >= .55); // (the sea as it was at the checkpoint)
  lightHelis?.restore(snap.helis); heliAmbush?.restore(snap.helis2); heliFinal?.restore(snap.helis3);
  weapons.restore(snap.shots); enemyFire.restore(snap.enemyFire, world); statues.restore(snap.statues); submarines.restore(snap.subs); camoTurrets.restore(snap.camo); landmines.restore(snap.mines); trainRide.restore(snap.train); fallingRocks.restore(snap.rocks); mudLaunchers.restore(snap.launchers); dronePads.restore(snap.drones); apcs.restore(snap.apcs); [].concat(snap.bomber ?? []).forEach((d, i) => bombers[i]?.restore(d)); enemyJeeps.restore(snap.jeeps); if (snap.toppling && !Array.isArray(snap.toppling)) for (const t of topplings) t.restore(snap.toppling[t.key]); // (older saves kept them in a list that no longer lines up: those pillars start afresh) // nothing in the air vanishes on loading
  carried = snap.carried ?? []; showCarried(); rescued = snap.rescued ?? 0; playTime = snap.playTime ?? 0;
}
const jeepRubble = new THREE.MeshStandardMaterial({ color: 0x4a5a26, roughness: .8, flatShading: true });
// TEMPORARY (testing): the jeep can't be destroyed. G toggles it; set GOD_MODE back to false for normal play.
const GOD_MODE = false;
let god = GOD_MODE;
const godTag = document.createElement('div');
godTag.className = 'hud'; Object.assign(godTag.style, { right: '16px', top: '12px', color: '#9ff' }); godTag.textContent = 'INVULNERABLE'; // (G on a keyboard; the touch code on a phone)
document.getElementById('frame').appendChild(godTag); godTag.hidden = !god;
function toggleGod() { god = !god; godTag.hidden = !god; (god ? sfx.star : sfx.menuBack)(); } // (a chime on, the back blip off: a phone has no key to confirm it)
addEventListener('keydown', e => { if (e.code === 'KeyG' && !e.repeat) toggleGod(); });
if (params.has('debug') && stage.puddles && stage.containerSeed !== undefined) { // N / B: the next / the previous look for the container yard (a hand-picked seed, like the lightning's L key); the number goes into the stage's containerSeed
  let seed = stage.containerSeed, label = null, hide = 0;
  const show = text => { if (!label) { label = document.createElement('div'); label.style.cssText = 'position:fixed;left:50%;bottom:14px;transform:translateX(-50%);padding:4px 10px;background:rgba(0,0,0,.6);color:#cfe0ff;font:700 14px monospace;z-index:9;pointer-events:none'; document.body.appendChild(label); } label.textContent = text; label.style.display = 'block'; clearTimeout(hide); hide = setTimeout(() => { label.style.display = 'none'; }, 6000); console.log(text); };
  addEventListener('keydown', e => {
    if (e.repeat || (e.code !== 'KeyN' && e.code !== 'KeyB')) return;
    seed += e.code === 'KeyN' ? 1 : -1; const n = world.rerollContainers(seed); show(`container yard seed ${seed} (${n} boxes; N next, B back; put containerSeed: ${seed} in stage 6's index.js)`);
  });
}
// The touch cheat for the best launcher (touch.js): rocket III, and the score back to 0 so a run that used it doesn't count as a high one. (The gun's ammo is never short.)
function giveArms() { weapons.level = 3; hud.weapon.textContent = weaponName(3); score = 0; hud.score.textContent = score; sfx.star(); }
// TEMPORARY (testing): where the jeep is, in world metres (x: east, z: north is negative), and in fly
// mode where the view is centred; C toggles it. For giving positions in the level (e.g. stage data).
const coordTag = document.createElement('div');
coordTag.className = 'hud'; Object.assign(coordTag.style, { right: '16px', top: '34px', color: '#9ff', textAlign: 'right' });
coordTag.hidden = true; // (off by default: C shows it)
document.getElementById('frame').appendChild(coordTag);
addEventListener('keydown', e => { if (e.code === 'KeyC' && !e.repeat) coordTag.hidden = !coordTag.hidden; }); // (always on now, not only with ?debug)
let mouseAt = null; const _ray = new THREE.Raycaster(), _ndc = new THREE.Vector2(), _plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), _hit = new THREE.Vector3();
addEventListener('pointermove', e => { mouseAt = { x: e.clientX, y: e.clientY }; });
function showCoords() {
  if (coordTag.hidden) return;
  const p = player.position, f = cam.focus, n = v => v.toFixed(1);
  if (flying && mouseAt) { // fly mode: the ground point under the mouse (found by casting the pointer's ray down to the ground, twice over so the terrain's height is allowed for)
    const r = canvas.getBoundingClientRect(), camera = cam.camera; camera.updateMatrixWorld();
    _ray.setFromCamera(_ndc.set((mouseAt.x - r.left) / r.width * 2 - 1, -((mouseAt.y - r.top) / r.height) * 2 + 1), camera);
    let y = 0, hit = null;
    for (let i = 0; i < 3; i++) { _plane.constant = -y; hit = _ray.ray.intersectPlane(_plane, _hit); if (!hit) break; y = world.heightAt ? world.heightAt(hit.x, hit.z) : 0; }
    if (hit) { coordTag.textContent = `MOUSE x ${n(hit.x)}  z ${n(hit.z)}  (VIEW ${n(f.x)}, ${n(f.z)}) (C)`; return; }
  }
  coordTag.textContent = flying ? `VIEW x ${n(f.x)}  z ${n(f.z)} (C)` : `JEEP x ${n(p.x)}  z ${n(p.z)} (C)`;
}

function killPlayer() {
  if (god || secretExit?.active || plateauExit?.boarding || player.dead) return; // (testing) shells, rockets and tanks can't hurt it; and a jeep already destroyed this frame is not destroyed again (that cost two lives)
  const at = player.position.clone();
  fx.explosion(at.clone().setY(.8), 1.5); fx.scorch(at, 3); fx.smoke(at.clone().setY(.8), 5);
  for (let i = 0; i < 12; i++) debris.chunk(at.clone().setY(1), jeepRubble, .12 + Math.random() * .2, 2);
  player.die();
  // half the prisoners aboard (rounded down) survive the crash, picked at random, and scatter waving for help
  const keep = Math.floor(carried.length / 2); // half, rounded down: 1 aboard -> none, 3 -> 1
  const survivors = [...carried].sort(() => Math.random() - .5).slice(0, keep);
  if (survivors.length) fx.pows.scatter(at, survivors, world);
  carried = []; showCarried();
  weapons.level = 0; hud.weapon.textContent = weaponName(0); // the launcher upgrade is lost with the jeep
  lives--; hud.lives.textContent = lives;
  if (lives <= 0) { gameOverPending = true; sfx.stopMusic(.08); setTimeout(() => { gameOver = true; hud.gameOver.hidden = false; document.getElementById('retry').focus(); }, 2000); } else respawnIn = 2.5; // (the last life: the music cuts off, two seconds of silence, then the game-over message and its jingle) // (Enter presses it)
}
function respawn() {
  const from = player.position;
  for (let r = 0; r < 40; r += 1.25) { // nearest clear spot, preferring a little south of where it died
    for (let i = 0; i < 16; i++) {
      const a = i / 16 * Math.PI * 2, x = from.x + Math.cos(a) * r, z = from.z + 4 + Math.sin(a) * r;
      const b = cam.bounds();
      if (Math.abs(x) < LEVEL.halfWidth - LEVEL.edgeMargin - 2 && z < b.south && z > b.north && !world.blockedRect(x, z, 0, 2.3, 1.4)) {
        player.respawn(x, z); return;
      }
    }
  }
  player.respawn(from.x, from.z);
}

// The game view is always the camera's 16:9 play window, as large as fits, centred with dark bars
// round it: every screen shape sees the same area of the field (see GameCamera).
const frame = document.getElementById('frame');
function resize() {
  const w = Math.round(Math.min(innerWidth, innerHeight * 16 / 9)), h = Math.round(w * 9 / 16);
  Object.assign(frame.style, { left: `${(innerWidth - w) / 2}px`, top: `${(innerHeight - h) / 2}px`, width: `${w}px`, height: `${h}px` });
  renderer.setSize(w, h, false); cam.resize(w, h); world.resize(); msaa.resize();
}
addEventListener('resize', resize);
quality.bind({ renderer, scene, sun: world.light.sun, setWaterScale: world.setWaterScale, setEvery: world.setRedrawEvery, setReflect: world.setWaterReflect, setReflectAA: world.setWaterReflectAA, setLite: world.setLite, setFireLights: n => fx.fires.setLights(n), setPuddles: m => world.setPuddles(m), setRain: k => { rain?.setAmount(k); snow?.setAmount(k); },
  setAA: on => { msaa.set(on); world.setOutput(msaa.target); }, resize }); // (sizes everything)
if (stage.mood?.grade) { msaa.setGrade(stage.mood.grade); world.setOutput(msaa.target); } // stage 4: the colour grade is a pass on the way to the screen (msaa.js)
// the pause menu's GRAPHICS button shows the current level and opens a list of them (the one in use lit)
const gfxBtn = document.querySelector('#pause [data-act="graphics"]'), gfxList = document.querySelector('#pause .gfx .menu');
fullscreenButton(document.querySelector('#pause [data-act="fullscreen"]'), tr); // (it handles its own clicks)
const tierButtons = TIERS.map((t, i) => {
  const b = document.createElement('button'); b.textContent = tr(t.name); b.dataset.act = 'tier'; b.dataset.tier = i;
  gfxList.appendChild(b); return b;
});
let pendingTier = quality.tier; // the level picked in the list, not applied until APPLY
const gfxInfo = Object.assign(document.createElement('p'), { className: 'gfx-desc' }), gfxApply = document.querySelector('#pause [data-act="apply"]');
const showGfx = label => {
  if (gfxBtn) gfxBtn.textContent = tr('GRAPHICS') + (isZh() ? '：' : ': ') + tr(label);
  tierButtons.forEach((b, i) => { b.classList.toggle('on', i === quality.tier); b.classList.toggle('sel', i === pendingTier); });
  tierButtons[pendingTier].after(gfxInfo); // (the text sits right under the level it describes)
  gfxInfo.textContent = tr(GFX_INFO[pendingTier]); gfxApply.disabled = pendingTier === quality.tier || quality.busy;
};
showGfx(quality.label); quality.onChange(showGfx); quality.onChange(() => warship.setLite(quality.level.plainHud));

// Compile every shader now, behind the loading screen, rather than stalling on the first frames.
lasers.light(player, soldiers.list.filter(s => !s.dead).map(s => s.obj), tanks.tanks.map(t => t.obj)); // (stage 3: the soldiers', tanks' and jeep's paint is patched for the curtains' red light on the first frame, which changes their shaders: do it now, so the compile below builds the shaders that will be used)
// The shaders are built a few at a time, each step reporting a count (COMPILING SHADERS 12/62) so the player can see it is working: one mesh of each kind (a material and the way its mesh is drawn) stands for the others,
// and each step shows only a few of those to renderer.compile (the lights stay as they are, so the programs are the ones the game will use).
const compileAll = async (label = null) => {
  // One compile call for the whole scene. (It used to be built a few meshes at a time, but this renderer's compile() goes over every material in the scene on every call, whichever meshes are hidden, so the first call
  // already built everything and the other 350 or so only went over the materials again, 16 ms each: about half the load, to build nothing.)
  const t0 = performance.now();
  await loadProgress('0/1', label);                                   // (paint the loading screen first, so it shows what is going on while the browser is busy)
  const np0 = renderer.info.programs?.length ?? 0;
  renderer.compile(scene, cam.camera);
  await loadProgress('1/1', label);
  console.log('shader pass ' + (label ?? 'main') + ': ' + Math.round(performance.now() - t0) + ' ms, ' + ((renderer.info.programs?.length ?? 0) - np0) + ' new programs');
};
await loadStep('compile');
// (no link check while compiling: three.js asks the driver whether each program linked the moment it is built, which makes the page wait for the GPU process on every one, one after another; unasked, the driver links them side by side in the background, and the page stays alive and the other tabs are not starved. The check is put back once the stage is up, see below)
renderer.debug.checkShaderErrors = false;
const breathe = () => new Promise(r => setTimeout(r, 0));
cullModelInstances(scene); // (the models' instanced parts get real bounds, so they are skipped when off screen)
{ const _tc = performance.now(); await compileAll(); console.log('shader compile: ' + Math.round(performance.now() - _tc) + ' ms, ' + renderer.info.programs.length + ' programs'); }
await loadStep('compile2'); // (the lightning's and the fires' shader passes)
await lightning?.prewarm(renderer, scene, cam.camera, compileAll); await breathe();
await fx.fires.prewarm(renderer, scene, cam.camera, compileAll); await breathe(); for (const c of world.campfires ?? []) fx.fires.start([c], .45); for (const f of world.flares ?? []) { const fl = fx.fires.start([f], .55, Infinity, 2); fl.lightK = 2.2; } // (three red road flares on the summit, marking the landing spot) // (the campfires burn from the start, small flames, thin smoke) // (the flames' and the fire smoke's shaders, and every material for the firelights' light count, get built here, behind the loading screen)
await lightning?.prewarmWithFires(renderer, scene, cam.camera, fx.fires, compileAll); await breathe(); // (and for a lightning strike while a fire burns: lights from both)
await loadStep('draw'); // (the first frames: from here to the third)
{ const _tw = performance.now(), _p0 = renderer.info.programs?.length ?? 0; world.prewarmWater?.(cam.camera); await breathe(); console.log('water views prewarmed: ' + Math.round(performance.now() - _tw) + ' ms, ' + ((renderer.info.programs?.length ?? 0) - _p0) + ' new programs'); } // (the water's reflection and see-through views, built now, behind the loading screen, not when the sea first comes into view)
window.__groups = () => { // which unnamed top-level groups are made of many small meshes (type __groups() in the console)
  const rows = scene.children.filter(o => o.children.length > 30).map(g => { const ms = g.children.filter(m => m.isMesh), vs = new Map(), bb = new THREE.Box3(); for (const m of ms) { const n = m.geometry?.attributes?.position?.count ?? 0; vs.set(n, (vs.get(n) ?? 0) + 1); bb.expandByObject(m); } const c = bb.getCenter(new THREE.Vector3()), z = bb.getSize(new THREE.Vector3()); return { name: g.name || '(unnamed)', meshes: ms.length, materials: new Set(ms.map(m => m.material?.uuid)).size, vertexCounts: [...vs].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([n, k]) => n + 'v x' + k).join(', '), centre: c.x.toFixed(0) + ',' + c.z.toFixed(0), size: z.x.toFixed(0) + ' x ' + z.z.toFixed(0) }; });
  console.table(rows); return rows.length;
};
const loading = document.getElementById('loading');
let framesDrawn = 0, trisLogged = 0;

// Results screen: the game blurs behind a panel; the lines appear one by one, numbers counting up,
// then the button on to the next stage (not wired up yet).
const hms = s => { const h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, ss = String(Math.floor(s % 60)).padStart(2, '0'); return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`; }; // h:mm:ss / m:ss
function showResults() {
  resultsShown = true;
  player.enabled = false; // the jeep stops where it is
  cam.swayOn = true; // (and the view begins to sway behind the results panel)
  const counted = world.turrets.filter(t => !t.mob); // (not the light tanks that keep coming in stage 2's boss fight)
  const raiders = bombers.filter(b => b.state !== 'none'); // stage 2's bombers: each plane is an enemy to shoot down
  const enemies = counted.length + world.soldierSpots.length + apcs.crewTotal + raiders.length + trainRide.total + dronePads.total + (lightHelis?.total ?? 0) + (heliAmbush?.total ?? 0) + (heliFinal?.total ?? 0); // turrets, gunboats, tanks + foot soldiers (+ those the carriers hold) + bombers + the train's locomotive and carriages
  const kills = counted.filter(t => t.target.hp <= 0).length + soldiers.kills + apcs.crewLost + raiders.filter(b => b.killed).length + trainRide.kills + dronePads.kills + (lightHelis?.kills ?? 0) + (heliAmbush?.kills ?? 0) + (heliFinal?.kills ?? 0);
  const rate = enemies ? Math.round(kills / enemies * 100) : 100;
  const mm = Math.floor(playTime / 60), ss = Math.floor(playTime % 60);
  const el = id => document.getElementById(id);
  el('r-kills').textContent = `(${kills}/${enemies})`;
  el('r-time').textContent = `${mm}:${String(ss).padStart(2, '0')}`;
  el('r-total').textContent = hms(totalTime); // the whole game so far
  el('r-title').textContent = stageNo === SECRET_NO ? tr('SECRET STAGE CLEAR') : stageClearTitle(stageNo);
  const last = stageNo >= STAGES.length && stageNo !== SECRET_NO; // (the secret level is not the end: it goes on to stage 6) the last stage so far: no next stage to go on to, a line saying so, and the way back to the title menu
  el('next').hidden = last; el('more').hidden = !last; el('clear-menu').hidden = !last;
  hud.clear.hidden = false; void hud.clear.offsetWidth; /* (forces the browser to lay the screen out first, as hidden: without this the 'show' class was added before its first frame and the fade never ran: it popped in) */ requestAnimationFrame(() => hud.clear.classList.add('show'));
  const count = (id, to, fmt = v => v) => { // a number counting up over ~0.7 s
    const t0 = performance.now();
    const tick = () => { const k = Math.min(1, (performance.now() - t0) / 700); el(id).textContent = fmt(Math.round(to * k)); if (k < 1) requestAnimationFrame(tick); };
    tick();
  };
  writeRun(stageNo, { rate, kills, enemies, pows: rescued, time: Math.floor(playTime), found: pickups.found, total: pickups.list.length, score });
  const tg = el('r-toggle'), panel = hud.clear.querySelector('.panel'); panel.classList.remove('table'); el('r-table').hidden = true; tg.hidden = !last; tg.textContent = tr('ALL STAGES');
  if (last) { // the last stage: a button swaps this stage's lines for a table of every stage cleared this run
    const run = readRun(), order = [1, 2, 3, 4, 5, SECRET_NO, 6].filter(n => run[n]), body = el('r-table').querySelector('tbody'), mmss = s => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    body.replaceChildren(...order.map(n => { const r = run[n], tr_ = document.createElement('tr'); tr_.innerHTML = `<td>${n === SECRET_NO ? tr('SECRET') : stageName(n)}</td><td>${r.rate}%</td><td>${r.pows}</td><td>${mmss(r.time)}</td><td>${r.total ? r.found + '/' + r.total : '-'}</td><td>${r.score}</td>`; return tr_; }),
      Object.assign(document.createElement('tr'), { className: 'sum', innerHTML: `<td>${tr('TOTAL')}</td><td>${Math.round(order.reduce((a, n) => a + run[n].rate, 0) / order.length)}%</td><td>${order.reduce((a, n) => a + run[n].pows, 0)}</td><td>${hms(totalTime)}</td><td>${order.reduce((a, n) => a + run[n].found, 0)}/${order.reduce((a, n) => a + run[n].total, 0)}</td><td>${score}</td>` }));
    tg.onclick = () => { const on = panel.classList.toggle('table'); el('r-table').hidden = !on; tg.textContent = tr(on ? 'THIS STAGE' : 'ALL STAGES'); };
  }
  el('r-secrets').textContent = `${pickups.found} / ${pickups.list.length}`;
  el('r-secrets').closest('.row').hidden = !pickups.list.length;
  el('row-super').hidden = !secretExit; el('r-super').textContent = superSecret ? '1 / 1' : '? / 1'; // (only on the stage with the secret passage: a teaser of '?' until the jeep has left by the helicopter)
  const steps = [() => count('r-kill', rate, v => v + '%'), () => count('r-pows', rescued), () => {}, () => {}, () => {}, () => {},
    () => count('r-bonus', STAGE_BONUS), () => count('r-score', score)]; // in the order of the rows
  [...hud.clear.querySelectorAll('.row')].forEach((row, i) => setTimeout(() => { row.classList.add('in'); steps[i](); }, 900 + i * 450)); // (the rows start as the panel comes in)
  setTimeout(() => { for (const id of last ? ['more', 'clear-menu', 'r-toggle'] : ['next']) el(id).classList.add('in'); }, 500 + steps.length * 450 + 300);
}
// Checkpoint: clearing a stage saves the start of the next one with the jeep as it is now.
// Which stage comes next: usually the following one; from stage 5, having left by the secret helipad's transport (the super secret), the secret level.
const nextStageNo = () => stageNo === SECRET_NO ? 6 : superSecret && secretExit ? SECRET_NO : stageNo + 1; // (from the secret level, which opens off stage 5: on to stage 6)
function saveProgress() {
  if (stageNo >= STAGES.length && stageNo !== SECRET_NO) return; // nothing further to continue to (yet)
  try { localStorage.setItem(SAVE_KEY, JSON.stringify({ stage: nextStageNo(), lives, level: weapons.level, score, totalTime, savedAt: Date.now() })); } catch {}
}
document.getElementById('next').addEventListener('click', () => { // on to the next stage (a fresh page load builds it)
  if (stageNo >= STAGES.length && stageNo !== SECRET_NO) return;
  // the jeep's lives, launcher upgrade and score carry over to the next stage
  const dest = nextStageNo();
  try { sessionStorage.setItem(CARRY_KEY, JSON.stringify({ stage: dest, lives, level: weapons.level, score, totalTime })); } catch {}
  go(`stage=${dest === SECRET_NO ? 'secret' : dest}`);
});

// Pause menu (Esc): the game freezes behind it. SAVE GAME stores the stage and the jeep in one of six
// slots (loading one restarts that stage with that jeep); LOAD GAME picks a slot; QUIT goes back to
// the title screen.
document.getElementById('to-menu').addEventListener('click', () => go('')); // game over: back to the title menu
document.getElementById('clear-menu').addEventListener('click', () => go('')); // the last stage's results: back to the title menu too
addEventListener('keydown', e => { // Enter on the results screen goes on, once the button has appeared
  if (e.code !== 'Enter' || e.repeat || !stageClear || hud.clear.hidden) return;
  const b = ['next', 'clear-menu'].map(id => document.getElementById(id)).find(b => !b.hidden && b.classList.contains('in'));
  if (b) { e.preventDefault(); b.click(); }
});
menuKeys(() => gameOver ? hud.gameOver : null); // arrows / Enter on the game-over buttons
// this stage again from its start, with what the jeep had then (lives, launcher, score): game over's and the pause menu's RETRY
const retryStage = () => { try { sessionStorage.setItem(CARRY_KEY, JSON.stringify({ ...stageStart, totalTime })); } catch {} go(`stage=${stageNo}&load=1`); }; // (the clock carries on)
document.getElementById('retry').addEventListener('click', retryStage);
const pauseEl = document.getElementById('pause'), pauseNote = pauseEl.querySelector('.note');
volumeSliders(pauseEl.querySelector('.volume'));
let paused = false;
function setPaused(on) {
  if (on && (gameOver || gameOverPending || stageClear || flying)) return; // not over the results / game-over screens
  paused = on; pauseEl.hidden = !on;
  const save = pauseEl.querySelector('[data-act="save"]'), boss = arena.active && !stageClear; // no saving in the middle of a boss fight
  save.disabled = boss; save.textContent = tr(boss ? 'SAVE GAME (NOT IN BOSS FIGHT)' : 'SAVE GAME');
  showPanel('.menu'); pauseNote.textContent = '';
  if (!on) document.activeElement?.blur?.(); // (so Enter doesn't press a menu button in play)
}
// one of the pause panel's parts at a time: '.menu' (the buttons), '.slots' (save / load) or '.gfx' (graphics levels)
function showPanel(sel) { for (const p of ['.menu', '.settings', '.volume', '.slots', '.gfx']) pauseEl.querySelector(p).hidden = p !== sel; if (!pauseEl.hidden) focusFirst(pauseEl.querySelector(sel)); }
let backTo = '.menu'; // where BACK goes from the slots / graphics lists
function showSlots(mode) {
  backTo = '.menu';
  showPanel('.slots');
  pauseEl.querySelector('.slots h2').textContent = tr(mode === 'save' ? 'SAVE GAME' : 'LOAD GAME');
  const mm = Math.floor(playTime / 60), ss = String(Math.floor(playTime % 60)).padStart(2, '0');
  renderSlots(pauseEl.querySelector('.slot-list'), mode, (i, slot, name) => {
    if (mode === 'load') { play(slot); return; }
    const ok = writeSlot(i, { name, stage: stageNo, lives: Math.max(1, lives), level: weapons.level, score, snap: takeSnapshot(), start: stageStart, totalTime: Math.round(totalTime * 10) / 10 });
    pauseNote.textContent = ok ? `${tr('SAVED TO SLOT')} ${i + 1}  (${stageName(stageNo)})` : tr('COULD NOT SAVE (STORAGE BLOCKED?)');
    showSlots('save');
  }, `${stageName(stageNo)} - ${mm}:${ss}`); // suggested name: stage and play time
  focusFirst(pauseEl.querySelector('.slots')); // (the list is new)
}
pauseEl.addEventListener('click', e => {
  const act = e.target.closest('button')?.dataset.act;
  if (act === 'resume') setPaused(false);
  else if (act === 'save' || act === 'load') { pauseNote.textContent = ''; showSlots(act); }
  else if (act === 'back') showPanel(backTo);
  else if (act === 'settings') { pauseNote.textContent = ''; showPanel('.settings'); }
  else if (act === 'volume') { backTo = '.settings'; showPanel('.volume'); }
  else if (act === 'back-settings') showPanel('.menu');
  else if (act === 'quit') go('');
  else if (act === 'retry') retryStage();
  else if (act === 'graphics') { pauseNote.textContent = ''; backTo = '.settings'; pendingTier = quality.tier; showGfx(quality.label); showPanel('.gfx'); }
  else if (act === 'tier') { pendingTier = +e.target.closest('button').dataset.tier; showGfx(quality.label); }
  else if (act === 'apply') quality.select(pendingTier);
});
menuKeys(() => paused ? [...pauseEl.querySelectorAll('.menu, .settings, .volume, .slots, .gfx')].find(p => !p.hidden) ?? null : null); // arrows / Enter in the pause menu
addEventListener('keydown', e => { if (e.code === 'Escape' && !e.repeat) setPaused(!paused); }); // (not key repeat: holding Esc leaves full screen)
// Leaving full screen (Esc, where the browser keeps Esc for that: see fullscreen.js) brings the pause menu up.
onFullscreenChange(full => { if (!full && !paused) setPaused(true); });

const setAA = on => { msaa.set(on); world.setOutput(msaa.target); }; // (as the graphics menu does it: the water's output follows the antialiased target)
window.__mirrorTrace = () => { window.__mirrorTraceResult = []; window.__mirrorTraceOn = true; return new Promise(res => setTimeout(() => { window.__mirrorTraceOn = false; const t = JSON.stringify(window.__mirrorTraceResult); console.log(t); res(t); }, 400)); }; // (type await __mirrorTrace() in the console, in the game's frame: what each mirror pass draws)
window.__callsByModel = () => { const t = world.callsByModel(renderer); console.log(t); return t; }; // (type __callsByModel() in the console, in the game's frame: the main view's real draw calls by model)
const liveProfile = new LiveProfile({ renderer, scene, world, rain, lasers, setAA, quality, fx, debris, soldiers, tanks, resize, perf }); // (RUN LIVE PROFILE under the P overlay)
const clock = new THREE.Clock();
// Adaptive resolution (the lite level only): holds the frame rate above 30 by trading pixels for speed. The frame time is averaged (every frame the browser shows costs a multiple of the 60 Hz tick, so
// the average is what tells); when it is too slow the render scale steps down, and when there has been headroom for a few seconds it steps back up, never past the level's own setting.
const drs = { ema: 16.7, ratio: null, wait: 3 };
quality.onChange(() => { drs.ratio = null; drs.wait = 3; drs.ema = 16.7; });
function adaptResolution(rawDt) {
  return; // (disabled: the render scale stays at the quality level's own setting)
  if (!quality.level.lite || stageClear) return;
  drs.ema += (rawDt * 1000 - drs.ema) * .04; if ((drs.wait -= rawDt) > 0) return;
  const top = quality.level.ratio, floor = .4; drs.ratio ??= top;
  let r = drs.ratio;
  if (drs.ema > 36 && r > floor) { r = Math.max(floor, r - .05); drs.wait = 1.5; } // (slower than about 28 fps)
  else if (drs.ema < 19 && r < top + .1) { r = Math.min(top + .1, r + .05); drs.wait = 5; } // (running at 60: there is room for more pixels, up to a notch above the level's own setting)
  if (r !== drs.ratio) { drs.ratio = r; renderer.setPixelRatio(Math.min(devicePixelRatio, r)); resize(); drs.ema = 25; }
}
renderer.setAnimationLoop(() => {
  const tickT0 = performance.now(), raw = clock.getDelta(), dt = Math.min(raw, 1 / 20); // clamp so a tab switch doesn't teleport things
  { // (a stall of more than a third of a second is written to the console, with what changed: the number of shader programs, and whether the lightning's light is on)
    const np = renderer.info.programs?.length ?? 0, last = window.__hitchLast ?? { np, t: 0 };
    const PN = ['precision', 'isWebGL2', 'supportsVertexTextures', 'outputEncoding', 'instancing', 'instancingColor', 'map', 'mapEncoding', 'matcap', 'matcapEncoding', 'envMap', 'envMapMode', 'envMapEncoding', 'envMapCubeUV', 'lightMap', 'lightMapEncoding', 'aoMap', 'emissiveMap', 'emissiveMapEncoding', 'bumpMap', 'normalMap', 'objectSpaceNormalMap', 'tangentSpaceNormalMap', 'clearcoatMap', 'clearcoatRoughnessMap', 'clearcoatNormalMap', 'displacementMap', 'specularMap', 'roughnessMap', 'metalnessMap', 'gradientMap', 'alphaMap', 'combine', 'vertexColors', 'vertexAlphas', 'vertexTangents', 'vertexUvs', 'uvsVertexOnly', 'fog', 'useFog', 'fogExp2', 'flatShading', 'sizeAttenuation', 'logarithmicDepthBuffer', 'skinning', 'maxBones', 'useVertexTexture', 'morphTargets', 'morphNormals', 'premultipliedAlpha', 'numDirLights', 'numPointLights', 'numSpotLights', 'numHemiLights', 'numRectAreaLights', 'numDirLightShadows', 'numPointLightShadows', 'numSpotLightShadows', 'shadowMapEnabled', 'shadowMapType', 'toneMapping', 'physicallyCorrectLights', 'alphaTest', 'doubleSided', 'flipSided', 'numClippingPlanes', 'numClipIntersection', 'depthPacking', 'dithering', 'sheen', 'transmissionMap'];
    const whatChanged = () => { // for each program built since the last frame: how it differs from the nearest one that already existed (which setting)
      const all = renderer.info.programs ?? [], old = all.filter(q => last.ids?.has(q.id)), out = [];
      for (const q of all.filter(q => last.ids && !last.ids.has(q.id))) {
        const t = String(q.cacheKey).split(','), p0 = t.indexOf('highp'); let best = null, bd = 1e9;
        for (const o of old) { const u = String(o.cacheKey).split(','); if (u[0] !== t[0] || u.length !== t.length) continue; let d = 0; for (let i = 0; i < t.length; i++) if (t[i] !== u[i]) d++; if (d < bd) { bd = d; best = u; } }
        if (!best) { out.push(q.name + ': nothing like it before'); continue; }
        out.push(q.name + ' #' + q.id + ': ' + t.map((x, i) => x !== best[i] ? (PN[i - p0] ?? ('tok' + i)) + ' ' + best[i] + '->' + x : '').filter(Boolean).join('; '));
      }
      return out;
    };
    const owners = () => { // which objects use the programs built since the last frame
      const fresh = new Set((renderer.info.programs ?? []).filter(q => last.ids && !last.ids.has(q.id)).map(q => q.id)), names = new Map();
      scene.traverse(o => { if (!o.isMesh || !o.material) return; for (const m of [].concat(o.material)) { const pr = renderer.properties.get(m)?.currentProgram; if (pr && fresh.has(pr.id)) { let top = o; while (top.parent && top.parent !== scene) top = top.parent; const k = (top.name || top.type) + '/' + (o.name || o.parent?.name || '') + ' #' + pr.id; names.set(k, (names.get(k) ?? 0) + 1); } } });
      return [...names].map(([k, n]) => k + ' x' + n).join(', ');
    };
    const physical = () => { const names = new Map(); scene.traverse(o => { if (o.isMesh && o.material && !Array.isArray(o.material) && o.material.isMeshPhysicalMaterial) { let top = o; while (top.parent && top.parent !== scene) top = top.parent; const k = (top.name || top.type) + (o.visible && top.visible ? '' : ' (hidden)'); names.set(k, (names.get(k) ?? 0) + 1); } }); return [...names].map(([k, n]) => k + ' x' + n).join(', '); }; // (which objects are painted with the clearcoat material)
    const fresh = () => (renderer.info.programs ?? []).filter(q => last.ids && !last.ids.has(q.id)).map(q => q.name + ' #' + q.id + ' {' + String(q.cacheKey ?? '').slice(0, 150) + '}'); // (the names of the shader programs built since the last frame)
    if (raw > .07 && raw <= .35) console.log('SLOW FRAME ' + (raw * 1000).toFixed(0) + ' ms', { game: +lapWorst.sum.toFixed(1) + ' ms in game logic', worst: lapWorst.n + ' ' + lapWorst.v.toFixed(1) + ' ms', newPrograms: np - last.np, built: fresh().map(x => x.slice(0, 40)).join(', '), physicalObjects: physical(), newGeometries: renderer.info.memory.geometries - (last.geo ?? 0), newTextures: renderer.info.memory.textures - (last.tex ?? 0), pixelRatio: last.ratio + ' -> ' + drs.ratio, at: player.position.x.toFixed(0) + ', ' + player.position.z.toFixed(0) }); // (a smaller stall: what the game logic spent, which part was the worst, any new shader programs, and where the jeep was)
    if (raw > .35 && raw < 5) console.log('HITCH ' + (raw * 1000).toFixed(0) + ' ms', { lastFrameCpu: window.__frameParts ? 'update ' + window.__frameParts.logic.toFixed(0) + ' ms, draw calls ' + window.__frameParts.render.toFixed(0) + ' ms' : '-', audio: sfx.state?.() ?? '-', intro: intro.done ? 'done' : 't ' + intro.t.toFixed(1) + ' s', game: +lapWorst.sum.toFixed(1) + ' ms in game logic', worst: lapWorst.n + ' ' + lapWorst.v.toFixed(1) + ' ms', built: fresh().map(x => x.slice(0, 40)).join(', '), physicalObjects: physical(), changed: whatChanged().join(' | '), owners: owners(), newGeometries: renderer.info.memory.geometries - (last.geo ?? 0), newTextures: renderer.info.memory.textures - (last.tex ?? 0), pixelRatio: last.ratio + ' -> ' + drs.ratio, at: player.position.x.toFixed(0) + ', ' + player.position.z.toFixed(0), programsBefore: last.np, programsNow: np, newPrograms: np - last.np, flash: +(lightning?.flash ?? 0).toFixed(2), keyOn: lightning?.key.visible, struckAgo: lightning?.t, sinceLoad: +(performance.now() / 1000).toFixed(1) + ' s' });
    window.__hitchLast = { np, ids: np !== last.np || !last.ids ? new Set((renderer.info.programs ?? []).map(q => q.id)) : last.ids, t: performance.now(), geo: renderer.info.memory.geometries, tex: renderer.info.memory.textures, ratio: drs.ratio };
  }
  if (!paused && !liveProfile.running && raw < .5) adaptResolution(raw);
  if (liveProfile.running) { liveProfile.frame(() => { world.render(renderer, cam.camera); msaa.present(); }); input.endFrame(); return; } // (the profile draws the frozen scene again and again, changing one thing at a time)
  if (paused || awaitSound) { sfx.engine(0, false); world.render(renderer, cam.camera); msaa.present(); input.endFrame(); return; } // frozen behind the pause menu
  perf.begin(); lapLast = performance.now(); lapFrames++; lapWorst.n = ''; lapWorst.v = 0; lapWorst.sum = 0;
  showCoords(); // (testing)
  lap('showCoords');
  if (input.pressed('perf')) perf.toggle();

  if (input.pressed('fly')) toggleFly();
  { // (a transport climbing away goes up past the sun's shadow camera, which stands about 56 m off the view: behind its near plane it casts nothing, so its shadow vanished all at once. While one is leaving, the near plane is pulled back 150 m to take it in)
    const sc = world.light.sun.shadow.camera, leaving = plateauExit?.active || secretExit?.active || (!intro.done && intro.t > intro.T.rampUp);
    sc.userData.baseNear ??= sc.near; const want = sc.userData.baseNear - (leaving ? 150 : 0); if (sc.near !== want) { sc.near = want; sc.updateProjectionMatrix(); }
  }
  if (startJingle && sfx.musicEnded('start')) { startJingle = false; startPlayedAt = performance.now(); } // (stage 1's opening jingle has played out: the stage's music follows)
  if (startJingle) sfx.playMusic('start'); // (stage 1 only, once, from the first moment: over the flight in and the drop-off)
  else if (bossIsDown() && !resultsShown && !gameOver) { if (!bossFaded) { bossFaded = true; sfx.stopMusic(2.5); } } // (the boss is down: its music fades out and nothing replaces it until the results)
  else if (gameOverPending && !gameOver) { /* (the silence before the game-over message) */ } else if (stageClear && !resultsShown) { /* (won, the results not up yet: whatever is playing carries on) */ } else if (stage.music && !(startPlayedAt !== null && performance.now() - startPlayedAt < 1500) && (startPlayedAt !== null || intro.done || (stageNo === SECRET_NO && intro.playerReady) || (intro.playerReady && (intro.t >= intro.T.gone - 2.5 || (intro.t > intro.T.rampUp + 1 && !cam.inPlayWindow(intro.heli.position, .8)))))) sfx.playMusic(bossMusic() ?? stage.music); // (a boss fight has its own music (see bossMusic); otherwise the stage's own music: not during the flight in and the drop-off, but once the transport, lifting away after releasing the jeep, is almost off the screen (or has gone); and once the browser lets sound start)
  if (intro.playerReady && !stageClear) { playTime += dt; totalTime += dt; }
  arena.update(dt, player, cam);
  lap('arena');
  warship.update(dt, player, cam); // (also while the camera pans: it starts sailing the moment the way back shuts)
  lap('warship');
  if (arena.frozen) player.update(dt, input, cam.bounds(), world); // the jeep drives itself in: wheels roll
  lap('player(frozen)');
  if (!arena.frozen) { // the boss arena's intro freezes the game while the camera pans over
    intro.update(dt);
    player.update(dt, input, cam.bounds(), world);
    lap('player');
    world.groundTrail?.fade(dt); // (the snow slowly covers the tracks again)
    if (world.groundTrail && player.enabled && !player.dead) world.groundTrail.wheels(player.position, player.yaw, HALF_LEN, HALF_WID, .55, !flying); // (the jeep's tracks in the snow: they stay)
    secretExit?.update(dt); // (after the jeep's own update: it places the jeep itself)
    plateauExit?.update(dt); // (the same, for the boss plateau's transport)
    lap('secretExit');
    weapons.update(dt, input, player, world, t => addScore(t.score));
    lap('weapons');
    enemyFire.update(dt, world, player, killPlayer, cam);
    lap('enemyFire');
    statues.update(dt, world, player, killPlayer, cam);
    lap('statues');
    submarines.update(dt, world, player, killPlayer, cam);
    if (stage.isSecretLevel && iceT >= .6 && params.get('icesub') !== 'off') { // the sea has frozen over: while the power plant on the island still stands, submarines cruise round the island, and a few more in the open sea
      if (!iceSub && (world.powerPlantAlive ? world.powerPlantAlive() : true)) iceSub = new IceSub(scene, world, { ...stage.iceSubs, above: params.get('icesub') === 'above', avoid: (stage.patrolBoats ?? []).map(b => [b.x, b.z]) }); // (the plant is not built yet: world.powerPlantAlive() is the hook; until then it counts as standing)
      if (iceSub && !iceSub.dead && world.powerPlantAlive && !world.powerPlantAlive()) iceSub.dispose(); // the plant is down: the patrolling subs leave
      iceSub?.update(dt, player);
    }
    if (stage.iceBombers && iceT >= 1 && player.enabled && !player.dead && params.get('bombers') !== 'off') { // the bomber attacks: once the sea has frozen and the jeep is out on the ice heading for the island, each time it has covered another quarter of the way to the island's middle, a wave of two planes comes in
      const B = stage.iceBombers, d = Math.hypot(player.position.x - B.x, player.position.z - B.z);
      if (iceRaidStart === null) { if (world.tileAt(player.position.x, player.position.z) === 'S') iceRaidStart = d; } // (it has left the shore: this is how far it has to go)
      else if (iceRaidWave < B.at.length && 1 - d / iceRaidStart >= B.at[iceRaidWave]) {
        if (B.jeepsAt === iceRaidWave) { // two enemy jeeps drive out of the island, on the side facing the player's jeep, and give chase across the ice
          const dxp = player.position.x - B.x, dzp = player.position.z - B.z, dl = Math.hypot(dxp, dzp) || 1, ux = dxp / dl, uz = dzp / dl; let rr = 4; while (rr < 80 && world.tileAt(B.x + ux * rr, B.z + uz * rr) === '.') rr += 1; rr = Math.max(0, rr - 5);
          for (const side of [-1, 1]) enemyJeeps.spawnChaser(B.x + ux * rr - uz * side * 2.6, B.z + uz * rr + ux * side * 2.6, Math.atan2(-ux, -uz));
        }
        const froms = B.from[iceRaidWave % B.from.length]; froms.forEach((f, i) => iceRaidQueue.push({ at: performance.now() + i * (B.gap ?? 1600), from: f }));
        iceRaidWave++;
      }
    }
    for (let i = iceRaidQueue.length - 1; i >= 0; i--) if (performance.now() >= iceRaidQueue[i].at) { const q = iceRaidQueue.splice(i, 1)[0], b = new BomberRaid(scene, fx, enemyFire); b.setup({ from: q.from, lead: 1 }, debris); b.start(cam, player, world); iceRaids.push(b); }
    for (let i = iceRaids.length - 1; i >= 0; i--) { const r = iceRaids[i]; r.update(dt, world, player, cam, killPlayer); if (r.state === 'done' && !r.bombs.length) iceRaids.splice(i, 1); }
    lap('submarines');
    mudLaunchers.update(dt, world, player, cam);
    lap('mudLaunchers');
    camoTurrets.update(dt, world, player, killPlayer, cam);
    lap('camoTurrets');
    apcs.update(dt, world, player);
    lap('apcs');
    for (const b of bombers) b.update(dt, world, player, cam, killPlayer);
    lap('bombers');
    bossRaids(dt);
    lap('bossRaids');
    bossTroops(dt);
    lap('bossTroops');
    enemyJeeps.update(dt, world, player, cam, killPlayer);
    lap('enemyJeeps');
    arenaGate?.update(dt);
    lap('arenaGate');
    gateFight?.update(dt, { player, cam, killPlayer, fx, debris, tanks });
    lap('gateFight');
    bossFight?.update(dt, { player, cam, killPlayer });
    walkers?.update(dt, { player, cam, killPlayer });
    lap('bossFight');
    lasers.update(dt, player, killPlayer, soldiers.list.filter(s => !s.dead).map(s => s.obj), tanks.tanks.map(t => t.obj)); // (the red of the curtains falls on the soldiers and tanks in the maze too)
    for (const g of world.gateCurtains ?? []) { // the north gate's curtain destroys the jeep that touches it, as the maze's lasers do
      if (g.userData.curtainDead || g.userData.curtainA < .5 || !player.enabled || player.dead || player.invulnerable) continue;
      const len = g.userData.curtainLen, cz = g.position.z + .35; let hit = false;
      for (let d = -len / 2; d <= len / 2 && !hit; d += .4) hit = enemyFire.hitsJeep(new THREE.Vector3(g.position.x + d, 0, cz), player, .275);
      if (hit) killPlayer();
    }
    lap('lasers');
    for (const t of topplings) t.update(dt, player, killPlayer);
    lap('topplings');
    fallingRocks.update(dt, player, killPlayer);
    lap('fallingRocks');
    landmines.update(dt, player, killPlayer);
    lap('landmines');
    dronePads.update(dt, world, player, killPlayer);
    plantFight?.update(dt, player, cam);
    lap('dronePads');
    airbase?.update(dt, player, cam);
    lap('airbase');
    if (hind) { if (arena.state === 'fight') hind.begin(); hind.update(dt, world, player, killPlayer, cam); }
    lap('hind');
    lightHelis?.update(dt, world, player, killPlayer, cam); heliAmbush?.update(dt, world, player, killPlayer, cam); heliFinal?.update(dt, world, player, killPlayer, cam);
    lap('helis');
    trainRide.update(dt, player, killPlayer);
    lap('trainRide');
    soldiers.update(dt, world, player, cam, addScore);
    lap('soldiers');
    fx.pows.update(dt, world, player, kind => {
      carried.push(kind); showCarried();
      if (kind === 'engineer') hud.weapon.textContent = weaponName(weapons.upgrade()); // engineers upgrade the launcher
    });
    if (respawnIn > 0 && (respawnIn -= dt) <= 0) respawn();
    gunboats.update(dt, player);
    lap('gunboats');
    tanks.update(dt, world, player, cam, killPlayer);
    lap('tanks');
    flameSoldiers.update(dt, world, player, cam, killPlayer, addScore);
    lap('flameSoldiers');
    flyby.update(dt, player, cam);
    if (iceGo && iceT < 1) { iceT = 1; /* (at once: the summit is out of sight of the sea, there is no freezing to watch) */ world.setIce(iceT); if (iceT >= .55) gunboats.freeze(true); if (iceT >= 1) world.setSeaFrozen(true); } // (the sea freezes over eight seconds, from the shore out; the boats lock in half way, and the jeep may drive on it once it is done)
    lap('flyby');
    pickups.update(dt, player, () => { // the star: straight to ROCKET III, or an extra life if you have it already
      if (weapons.level < 3) { weapons.level = 3; hud.weapon.textContent = weaponName(3); return WEAPON_NAMES[3]; }
      lives++; hud.lives.textContent = lives; return '1UP';
    });
    // evac: with the helicopter down, parking next to it drops off the prisoners on board, one at a
    // time; each hops off, runs to the helicopter and scores EVAC_SCORE as he climbs in. It leaves once
    // they're all aboard, or when the jeep has gone half a screen past the pad.
    const jeepSpeed = player.position.distanceTo(lastJeepPos) / Math.max(dt, 1e-4); lastJeepPos.copy(player.position);
    if (flyby.landed) {
      const parked = player.enabled && !player.dead && jeepSpeed < .5 && flyby.distanceTo(player.position) < EVAC_RANGE;
      if (parked) flyby.visited = true;
      if (parked && carried.length && (evacIn -= dt) <= 0) {
        evacIn = .6;
        const kind = carried.pop(); showCarried(); evacPending++;
        fx.pows.evacuate(player.position, kind, flyby.doorPosition(player.position), () => { addScore(EVAC_SCORE); evacPending--; rescued++; });
      }
      const allAboard = flyby.visited && !carried.length, passed = !world.summitPad && player.position.z < world.helipad.z - HALF_SCREEN; // (an ordinary pad: the jeep drives on north past it. The summit pad is reached from the north and is the end of the road, so there the helicopter leaves only when the jeep has stopped by it and nobody is left to load)
      if (!evacPending && (allAboard || passed)) flyby.depart();
    }
  }
  world.update(dt, player, enemyFire.aim);
  lap('world.update');
  world.cullBushes(cam.camera);
  lap('cullBushes');
  cullFarShadows(cam.focus);
  lap('cullFarShadows');
  if (summitCfg2 && world.setSeaOff) { world.setSeaOff(player.position.y > summitCfg2.h1 - 4); world.setPlateau(player.position.y > summitCfg2.h1 - 4 && player.position.z < -403.9); } // (up on the second plateau the sea is hidden by the mist: no water, no reflection)
  fx.cullFocus = cam.focus; fx.cullR = 85 * Math.max(1, cam.zoom ?? 1); // (puffs further than this from the view's middle are simulated but not drawn)
  fx.update(dt);
  lap('fx.update');
  swampLife?.update(dt, cam.focus);
  lap('swampLife');
  debris.update(dt);
  lap('debris');
  fx.fires.update(dt, cam.focus);
  if (world.chimneys?.length) { chimneyT -= dt; if (chimneyT <= 0) { chimneyT = .3; const now = performance.now() / 1000; for (const c of world.chimneys) { c.userData.ph ??= Math.random() * 5; if ((now + c.userData.ph) % 5 > 1.5) continue; c.getWorldPosition(chimneyAt); if (Math.hypot(chimneyAt.x - cam.focus.x, chimneyAt.z - cam.focus.z) > 45) continue; chimneyAt.y += 2.15; fx.chimneySmoke(chimneyAt); } } } // (puffs in bursts: five puffs, then a pause of 3.5 s, each chimney on its own beat; a few puffs alive at a time)
  if (world.powerStacks) { stackT -= dt; if (stackT <= 0) { stackT = .45; for (const s of world.powerStacks()) if (Math.hypot(s.x - cam.focus.x, s.z - cam.focus.z) < 140) fx.stackSmoke(s); } } // (the power station's chimneys smoke while it stands: a plume that leans away down the wind)
  lap('fires');
  if (stage.storm) { // stage 6: from z0 on, the storm thickens the further north the jeep goes (to its full by z1): heavier rain, more splashes and ripples, more lightning
    const sk = Math.min(1, Math.max(0, (stage.storm.z0 - player.position.z) / (stage.storm.z0 - stage.storm.z1))), sm = sk * sk * (3 - 2 * sk);
    rain?.setStorm(sm); lightning?.setStorm(sm); world.puddleStorm?.(sm);
  }
  if (stage.storm && rain) { const sk2 = Math.min(1, Math.max(0, (stage.storm.z0 - player.position.z) / (stage.storm.z0 - stage.storm.z1))); swingDoors(dt, rain.uniforms.uTime.value, Math.min(1, Math.max(0, (sk2 - .45) / .55))); } // (the open container doors rock in the storm's wind, the end of the map)
  if (summitCfg) { // (the climb: 0 at the foot of the road .. 1 at the summit)
    summitEntered = false; for (const R of [world.summitRoad, world.summitRoad2]) if (R) { const px = player.position.x, pz = player.position.z; for (let i = 10; i < R.length; i++) if (Math.hypot(R[i][0] - px, R[i][1] - pz) < 4.5) { summitEntered = true; break; } } // (either road) // (the jeep is on the summit road, from the passage on: the weather is at least half strength there, and eases back off when it drives down off the road)
    const climbOf = c => c ? Math.pow(Math.min(1, Math.max(0, (player.position.y - c.h0) / (c.h1 - c.h0))), .5) : 0, want = Math.max(summitEntered ? .5 : 0, climbOf(summitCfg), climbOf(summitCfg2)); // (the second ascent counts its own height range: the weather is the same up there) // (the sky darkens and the blizzard builds a little faster than the climb itself: the weather leads the height)
    climbK += (want - climbK) * Math.min(1, dt * .9); climbBliz = .92 * Math.pow(climbK, 1.15);
    whiteout.style.opacity = String(.78 * climbK * climbK); sfx.wind(.12 + .88 * climbK);
    { const sc = world.light.sun.shadow.camera, b = -30 - 11 * climbK; if (Math.abs(sc.bottom - b) > .05) { sc.bottom = b; sc.updateProjectionMatrix(); } } // (the shadow box's bottom edge: -30 at the foot, -41 at the summit: the view takes in more ground toward the camera as the jeep climbs)
    { const L = world.light; L.dim ??= { sun: L.sun.intensity, hemi: L.hemi.intensity, fill: L.fill.intensity }; // (the higher the jeep, the dimmer the daylight: the storm closes in, and the red flares stand out against it)
      const k = climbK * climbK * (3 - 2 * climbK); arenaK += ((summitCfg2 && player.position.y > summitCfg2.h1 - 4 && player.position.z < -403.9 ? 1 : 0) - arenaK) * Math.min(1, dt * 1.2); L.sun.intensity = L.dim.sun * (1 - .5 * k - .2 * arenaK); L.hemi.intensity = L.dim.hemi * (1 - .2 * k + .06 * arenaK); /* (arenaK: on the boss plateau the sun is dimmer still, the shadows fainter in the storm, and the ambient up a little to hold the brightness) */ L.fill.intensity = L.dim.fill * (1 - .2 * k); // (the sun fades faster than the ambient: the shadows grow fainter in the storm, the ambient stays up)
      const fb = 1 - .45 * k; if (scene.fog) scene.fog.color.setRGB(.8 * fb, .83 * fb, .88 * fb); if (whiteout) whiteout.style.filter = 'brightness(' + fb.toFixed(3) + ')'; } // (the mist darkens with the daylight: at the top it is a dull grey, not a bright white that gives the distance away)
    if (world.flares?.length) { const t = performance.now() / 1000; world.flareGlows.forEach((gl, i) => { gl.material.opacity = (.5 + .12 * Math.sin(t * 17 + i * 3) + .08 * Math.sin(t * 41 + i)) * (.7 + .5 * climbK); }); // (the pools of red light flicker, and show more as it gets darker)
      if (Math.random() < 60 * dt) { const f = world.flares[Math.floor(Math.random() * world.flares.length)]; fx.puff(f.clone().add(new THREE.Vector3(.2, .12, 0)), { color: 0xff7a50, size: .045, grow: 0, life: .4 + Math.random() * .5, opacity: 1, additive: true, reflect: false, gravity: 8, vel: new THREE.Vector3((Math.random() - .5) * 3, 2.5 + Math.random() * 3.5, (Math.random() - .5) * 3) }); } } // (sparks thrown off the flare)
    if (scene.fog) { scene.fog.near = climbK * (.35 + .65 * climbK); scene.fog.far = 1; } // (the summit's mist: its thickness grows with the climb from the very foot of the road, slowly at first; see the fog rule at the top of this file)
  }
  if (snow) { snow.set(1, Math.max(blizzard, climbBliz)); snow.update(dt, cam.focus); } // (steady snowfall all over the map; `blizzard` (0 .. 1) is the trigger point's to raise later: set it with game.setBlizzard(k))
  rain?.update(dt, cam.focus);
  lap('rain');
  lightning?.update(dt, cam.camera, cam.focus);
  lap('lightning');
  if (flying) {
    cam.fly(dt, input.axis(), input.held('fast'));
    if (scene.fog && !summitCfg) { scene.fog.near = 60 * cam.zoom; scene.fog.far = 130 * cam.zoom; } // keep the view clear when zoomed out
  } else {
    intro.cameraFocus(cam.focus, dt);
    cam.update(dt, player);
    lap('cam');
    if (navParams.get('dbg') === 'bases') { // (a bug hunt: log whenever a wall gun's base, the camera or the focus changes, with their numbers)
      const D = window.__dbg ??= { last: '', n: 0 }; const snap = [];
      for (const t of world.turrets) if (t.base?.name === 'wallTurretBase') { t.base.updateMatrixWorld(true); const e = t.base.matrixWorld.elements; snap.push([e[12], e[13], e[14], e[0], e[5], t.target.hp > 0 ? 1 : 0, t.top.parent === t.base ? t.top.position.y : 'off']); }
      const c = cam.camera.position, str = JSON.stringify({ b: snap.map(r => r.map(v => typeof v === 'number' ? +v.toFixed(4) : v)), c: [c.x, c.y, c.z].map(v => +v.toFixed(4)), f: [cam.focus.x, cam.focus.y, cam.focus.z].map(v => +v.toFixed(4)), fov: cam.camera.fov, z: cam.zoom });
      if (str !== D.last) { if (D.last && D.n++ < 60) console.log('DBG changed', str); D.last = str; }
    }
    if (scene.fog && !summitCfg) { scene.fog.near = 60; scene.fog.far = 130; } // (the stage 4 experiment above has none)
  }
  world.light.follow(cam.focus);
  lap('light.follow');
  if (!window.__noProbe && (puddleProbeIn -= dt) <= 0) { puddleProbeIn = .1; player.inPuddle = (world.puddleWetness?.(renderer, player.position.x, player.position.z) ?? 0) > .72; } // (is the jeep in standing water: it raises no dust there)
  lap('puddleProbe');
  { const p = player.position, mx = lastPlayerPos ? p.x - lastPlayerPos.x : 0, mz = lastPlayerPos ? p.z - lastPlayerPos.z : 0, sp = Math.hypot(mx, mz) / Math.max(dt, 1e-3); // the jeep's speed, m/s, and which way it moved
    lastPlayerPos = lastPlayerPos ? lastPlayerPos.copy(p) : p.clone();
    if (sp > .6 && sp < 30 && (rippleIn -= dt) <= 0) { // a wake ring (as the swamp's, stage 4) every ~0.16 s while it moves, heading the way it moves
      rippleIn = .11; world.puddleRipple?.(p.x, p.z, Math.min(1.5, .6 + sp * .07), { x: mx, z: mz });
    } }

  perf.mark();
  warship.updateHud(cam); // (after the camera has moved)
  plantFight?.updateHud(cam, player);
  const tRender0 = performance.now(); world.render(renderer, cam.camera); msaa.present(); window.__frameParts = { logic: tRender0 - tickT0, render: performance.now() - tRender0 }; // (for the hitch log: where the last frame's time went on the CPU: the whole update, and the draw calls)
  if (import.meta.env.DEV && ++trisLogged === 240) console.log('triangles in a frame (all passes, normal gameplay view):', renderer.info.render.triangles); // (perf.js keeps the counters running across passes)
  perf.end();
  if (loading && framesDrawn === 0) loadStep('draw2'); else if (loading && framesDrawn === 1) loadStep('draw3'); // (the first frames are steps of their own: the first is by far the longest, and each is timed, so the figure follows them)
  if (loading && ++framesDrawn === 3) { // the stage is up: fade the loading screen out (but if the browser is still blocking sound, wait for a click or key first: a reloaded stage has had none, and would start without a sound)
    renderer.debug.checkShaderErrors = true;   // (the link check is back: a shader that fails to build is reported again)
    const status = loading.querySelector('.status'), reveal = () => { awaitSound = false; status.textContent = tr('READY'); loading.classList.add('done'); setTimeout(() => loading.remove(), 800); };
    loadDone(); status.textContent = tr('READY'); awaitSound = true; sfx.prime();
    setTimeout(() => {
      if (sfx.running) return reveal();
      status.textContent = tr('CLICK OR PRESS ANY KEY TO START');
      const go = () => { removeEventListener('pointerdown', go, true); removeEventListener('keydown', go, true); setTimeout(reveal, 120); };
      addEventListener('pointerdown', go, true); addEventListener('keydown', go, true);
    }, 350);
  }
  input.endFrame();
});
