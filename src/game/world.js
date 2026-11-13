// Builds a playable 3D stage from level data (terrain grid + entity list, see tools/map_to_level.py).
import { params as navParams } from './nav.js'; // (the page's parameters: the stage menu reloads the page and the query string would be lost)
import * as THREE from 'three';
import { shardGeometry } from './debris.js';
import { canvasTexture } from '../assets/common.js';
import { createWater } from './water.js';
import { buildSwampMist } from './swamp-mist.js';
import { buildSwampShore } from './swamp-shore.js';
import { buildSwampTrees } from './swamp-trees.js';
import { buildSwampPlants } from './swamp-plants.js';
import { patchGrass, buildGrassScatter, setGrassDetail } from './grass-detail.js';
import { buildMossyRock } from '../assets/mossy-rock.js';
import { railPaths, nearRail, buildRailway } from './railway.js';
import { buildTrain } from '../assets/train.js';
import { mergeStatic, mergeGeometries, dropTinyShadows, mergeAcross, skinify, worldGeometry } from './optimize.js';
import {
  buildPalm, buildBush, buildRock, buildFoxhole, buildTurret, buildBarracks, buildTent, buildGate, buildDrum, hutBoardsMaterial,
  buildHelipadMarkings, buildPickup, palmWind, buildPadLight, flashPadLights,
} from '../assets/stage-props.js';
import { buildWallTurret } from '../assets/wallturret.js';
import { buildColumn, buildColumnDrums, buildFallenColumn, buildBust, buildStatue, buildStatueRuin, statueStone, stone, limestone } from '../assets/ruins.js';
import { buildHelipadSlab } from './helipad.js';
import { buildMountains } from './mountains.js';
import { buildPier, snowCoat } from './pier.js';
import { GroundTrail } from './ground-trail.js';
import { buildForests } from './forest.js';
import { buildCampfire } from '../assets/campfire.js';
import { buildSummitPad } from '../assets/summitpad.js';
import { buildSummitArena } from '../assets/summit-arena.js';
import { laserCurtain } from './lasers.js';
import { buildPatrolBoat } from '../assets/patrolboat.js';
import { buildPowerStation } from '../assets/powerstation.js';
import { SNOW_GLSL, SNOW_TILT, SNOW_GROUND_K } from './snow-surface.js';
import { buildSecretPad } from './secret-pad.js';
import { quietEffects } from './quiet.js';
import { pavingTextures, buildPaving, addMacro, SAND_EDGE } from './paving.js';
import { buildTerraceWalls, edgeRuns } from './terrace-wall.js';
import { buildRampStairs } from './ramp-stairs.js';
import { buildPoolBorders } from './pool-border.js';
import { buildCauseway } from './causeway.js';
import { chunkStatic } from './chunks.js';
import { addToLayer, REFLECT, UNDERWATER, SHADOW_ONLY } from './layers.js';
import { SHADOW_BOX, SHADOW_UP } from './soft-shadows.js';
import { passTime, passCalls, profile } from './perf.js';
import { buildHarbour } from './harbour.js';
import { buildPuddles, roofGeometry } from './puddles.js';
import { buildConveyor, RAIL, BELT_REPEAT } from '../assets/conveyor.js';
import { buildCliffs } from './cliffs.js';
import { buildChasm } from './chasm.js';
import { buildFences } from './fences.js';
import { buildBridge } from './bridge.js';
import { buildScrub } from './scrub.js';
import { bushWind, buildBush as buildBushAsset } from '../assets/bush.js';
import { pavementDetail, pavementMottle } from './pavement.js';
import { wetten } from './wet-look.js';
import { buildContainer, buildContainerPile, buildBarrier, buildLaser } from '../assets/harbour-props.js';
import { buildBossTank } from '../assets/boss-tank.js';
import { buildF35 } from '../assets/f35.js';
import { buildHedgehog, buildSandbagWall, buildDrumStack, buildCrateStack } from '../assets/barricades.js';
import { buildEnemyJeep } from '../assets/enemy-jeep.js';
import { buildM270 } from '../assets/m270.js';
import { HEAVY_SHELL } from './enemies.js';

export const BG = 0xe8b877;
export const PX = 1.25 / 8;  // metres per NES pixel: one 8x8 NES cell = 1.25 m
// Filled in by createWorld from the stage size. Camera and player read it.
export const LEVEL = { halfWidth: 40, length: 450, cameraRangeX: 12, edgeMargin: 0 }; // edgeMargin: metres in from the side edges the jeep may not go

// Jungle, water and the dark shoreline band (part of the water on the NES) block the jeep.
// Walls are thin boxes in `obstacles`, see thinWalls().
// Stage 2: terrace edges ('E') and pool rims ('R') block too; terraces only *look* raised.
const RAIL_LIFT = 1.2; // m: how far above a parapet cell's ground a shot is drawn (the parapet is 0.95 m high)
const CHASM_LITE_LIFT = .4; // (see setLite)
const FLAME_PASS = new Set(['pierrail', 'palm', 'turret', 'm270', 'parkedjeep', 'warship', 'blocker', 'foxhole', 'barrier', 'sandbags']); // (obstacles a flame jet passes through: enemies, sandbags, bridge edges)
const BLOCKING = new Set(['T', '~', ',', 'E', 'R', 'B', 'K', 'Q', 'L', 'X', 'V', 'Y', 'y', 'F', 'N', 'n']); // (stage 3: crates, buildings, quay edges, the laser maze's walls; stage 4: cliffs; stage 5: chasms, bridge parapets, scrub)
export const TERRACE_H = 1.5; // metres: how high stage 2's stone terraces are drawn (visual only, see heightAt)
const WATER_DEPTH = 2.5; // metres, deepest point of the sea / river bed
const SWAMP_DEPTH = .3; // stage 4's swamp: the jeep wades in, the bed only dips this much (reached within about 3 m of the bank: it drops away quickly, the water sits low)

// Gradient sky sphere (tan horizon -> blue zenith) that the reflection environment is baked from.
// Exported so the asset viewer can show the same sky the reflections come from.
export function skyDome(r, loC = 0xd9a05a, hiC = 0x8fc0ff) {
  const sky = new THREE.Mesh(new THREE.SphereGeometry(r, 32, 16), new THREE.MeshBasicMaterial({ side: THREE.BackSide, vertexColors: true, fog: false }));
  const pos = sky.geometry.attributes.position, cols = [];
  const lo = new THREE.Color(loC), hi = new THREE.Color(hiC);
  for (let i = 0; i < pos.count; i++) {
    const c = new THREE.Color().lerpColors(lo, hi, Math.min(1, Math.max(0, pos.getY(i) / r * 1.4 + .35)));
    cols.push(c.r, c.g, c.b);
  }
  sky.geometry.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  return sky;
}

// Lighting + reflection environment, matching the Claude.ai artifacts so assets look the same in game.
export function setupLighting(scene, renderer, mood = null, sunShadows = true) { // mood: a stage's own lighting ({ sun: [colour, intensity], hemi: [sky, ground, intensity], fill: [colour, intensity] }), or the default
  const hemi = new THREE.HemisphereLight(...(mood?.hemi ?? [0xfff2e0, 0x9a6a3a, 0.5]));
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(...(mood?.sun ?? [0xfff4e6, 1.15]));
  // Shadow box: fitted to the view (see SHADOW_BOX in soft-shadows.js); 4096 texels keeps it ~2 cm per texel.
  sun.castShadow = sunShadows; sun.shadow.mapSize.set(4096, 4096); sun.shadow.bias = -0.0004; sun.shadow.normalBias = .05;
  Object.assign(sun.shadow.camera, SHADOW_BOX, { near: 1, far: 150 }); sun.shadow.camera.up.set(...SHADOW_UP);
  scene.add(sun, sun.target);
  const fill = new THREE.DirectionalLight(...(mood?.fill ?? [0xbcd4ff, 0.35])); fill.position.set(9, 5, -11); scene.add(fill);

  const pm = new THREE.PMREMGenerator(renderer), envS = new THREE.Scene();
  const sky = skyDome(50, ...(mood?.skyColors ?? [])); // (mood.skyColors: [horizon, zenith], the sky the reflections and the ambient light are baked from)
  envS.add(sky);
  const sunBall = new THREE.Mesh(new THREE.SphereGeometry(6, 16, 16), new THREE.MeshBasicMaterial({ color: 0xffffff }));
  sunBall.position.set(-20, 40, 25); envS.add(sunBall);
  scene.environment = pm.fromScene(envS).texture;
  // An overcast sky for wet things to mirror (the player's jeep, wet-look.js): flat cool greys, brighter overhead, with none of the amber the default sky has at its horizon (which turned the dark rubber yellow)
  const greyS = new THREE.Scene(), greySky = skyDome(50); { const c = greySky.geometry.attributes.color, lo = new THREE.Color(0x7c838b), hi = new THREE.Color(0xc2cad4), t = new THREE.Color(); for (let i = 0; i < c.count; i++) { const k = Math.min(1, Math.max(0, greySky.geometry.attributes.position.getY(i) / 50 * 1.4 + .35)); t.lerpColors(lo, hi, k); c.setXYZ(i, t.r, t.g, t.b); } } greyS.add(greySky);
  const wetEnv = pm.fromScene(greyS).texture;

  // Keep the shadow box centred on what the camera sees. The view is wider toward the top of the
  // screen (further away), so the box is pushed a little north of the focus point.
  const offset = new THREE.Vector3(...(mood?.sunOffset ?? [-9, 18, 10])).multiplyScalar(2.5), centre = new THREE.Vector3();
  if (mood?.sunDistance) { // (the secret level: tall mountains toward the sun. The shadow camera stands this far from the view, so peaks up to ~85 m up the sun's ray are in front of it and are drawn into the shadow map; at the usual 43 m they stood behind it and cast nothing. The depth range stays 149 m)
    offset.setLength(mood.sunDistance); const near = mood.sunDistance - 85; Object.assign(sun.shadow.camera, { near, far: near + 149 }); sun.shadow.camera.updateProjectionMatrix();
  } // (mood.sunOffset: where the sun stands, relative to what the camera sees: lower = longer shadows)
  return {
    sun, hemi, fill, wetEnv,
    follow(p) { centre.copy(p).add(new THREE.Vector3(0, 0, -8)); sun.target.position.copy(centre); sun.position.copy(centre).add(offset); },
  };
}

// Tiny seeded RNG so the scenery is the same every run.
function rng(seed) {
  return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}

// Per-stage look. classes: ground colour of each paint class (before lighting, which brightens a
// lot): 0 sand, 1 bank / grass, 2 water bed, 3 jungle floor, 4 concrete, 5 wall, 6 stone paving.
// offMapWall: what a wall tile turns into past the map edge (jungle carries on in stage 1).
const THEMES = {
  jungle: {
    classes: [[192, 106, 42], [104, 66, 28], [130, 100, 60], [38, 52, 16], [120, 120, 114], [96, 96, 90], [150, 140, 120]],
    outer: 0x26340f, offMapWall: 'T',
  },
  ruins: { // pale desert sand, dry scrub grass in the old field, sandstone paving
    classes: [[200, 160, 104], [112, 112, 58], [120, 104, 80], [38, 52, 16], [120, 120, 114], [110, 100, 86], [176, 156, 120]],
    outer: 0x8a6c44, offMapWall: null,
  },
  harbour: { // grey tarmac everywhere (crisp, man-made), deep harbour water
    classes: [[132, 133, 130], [132, 133, 130], [30, 44, 66], [38, 52, 16], [132, 133, 130], [110, 110, 106], [132, 133, 130]],
    outer: 0x1c2c48, offMapWall: null, classMap: { '.': 4, 'B': 4, 'K': 4, 'Q': 4, 'W': 4, 'L': 4 },
    pavement: true, // worn concrete: its own fine detail texture and big-scale mottling (pavement.js)
    margin: [28, 12], // (cells) wider at the sides: the yard and what runs off the map's edges carry on out of sight
  },
  mountain: { // grass in a valley, steep rock cliffs round it (raised), murky swamp (S) in the meadow
    mud: [62, 50, 30], // the thin wet mud band along the swamp's waterline
    classes: [[58, 112, 44], [58, 112, 44], [30, 34, 18], [96, 70, 40], [120, 120, 114], [96, 96, 90], [150, 140, 120]],
    outer: 0x5a4628, offMapWall: null, classMap: { '.': 0, 'S': 2, 'X': 3 }, // (the swamp is painted and drawn as shallow water: a murky, opaque one, see water.js)
  },
  snow: { // the secret level (the snow itself is the mesh of mountains.js: what the ground's own paint shows is only the shore's strip under the water, painted dark sand like the beach) (the sea is still the swamp's shallow water, a placeholder for the ice)
    classes: [[104, 100, 93], [104, 100, 93], [40, 70, 100], [200, 210, 228], [190, 198, 214], [176, 184, 200], [196, 206, 224]],
    outer: 0x34495a, /* (also what the water's see-through view finds under the land, which it bends into the shallows: the colour of the sea bed, so it fades into the sea) */ offMapWall: null, classMap: { '.': 0, 'S': 2, 'X': 3 },
  },
  texas: { // stage 5: dry hill-country earth, scrub woods at the edges, low plateaus and deep chasms (it shares the mountain's cliffs, and its grass scatter, dry)
    classes: [[150, 108, 66], [134, 104, 60], [60, 50, 40], [74, 70, 40], [128, 128, 122], [96, 96, 90], [150, 140, 120]],
    margin: [48, 12], // (cells: wider than the usual 16, for the secret land mass beyond the left edge, see stage.extend: 42 cells out)
    outer: 0x3a2c1c, offMapWall: null, valley: true, dry: true, classMap: { '.': 0, 'F': 3, 'X': 0, 'V': 3, 'K': 4, 'G': 0, 'g': 0, 'Y': 0, 'y': 0, 'N': 0, 'n': 0 },
  },
};

// Smooth 2D value noise in 0..1.
function valueNoise(seed) {
  const hash = (x, y) => {
    let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) ^ seed;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  return (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
}

// Terrain classes used for painting. Bridges paint as water (the deck mesh sits on top).
const CLASS = { '.': 0, ',': 1, '"': 1, '~': 2, '=': 2, 'T': 3, 'H': 4, 'W': 0, // walls are built as thin meshes on sand
  'P': 6, 'E': 6, '^': 6, 'C': 0, 'R': 6 }; // stage 2: terraces, their edges, ramps, pool rims; the causeway is sand under its cobbles

// Paints the terrain colour map and water mask at 8 px per cell, including a margin of `mx` / `my`
// cells around the map where the edge terrain simply carries on (so the sea doesn't stop dead at
// the map's edge). Each pixel blends the nearby cells with smooth weights, which rounds the NES
// tile staircase into curves; a little noise warp keeps the shapes organic. Concrete and walls
// keep their straight edges.
// How the ground colour passes from land to water along a shore: reach = how far (cells) a pixel looks for water to blend in (wider = a softer, broader
// band); the water covers a pixel once its share of water passes wetFrom, fully at wetFrom + wetSpan. Stage 3 (a quay, crisp stripes) is tight, the other stages soft.
const SHORE_SWAMP = { reach: 1.5, wetFrom: .45, wetSpan: .05 }; // stage 4's swamp: a thin, nearly crisp waterline (the dark mud band lies just inland of it, below)
const SHORE_TIGHT = { reach: 1.5, wetFrom: .4, wetSpan: .2 }, SHORE_SOFT = SHORE_TIGHT; // (a reach beyond 1.5 makes the 3 x 3 neighbourhood count in full, so the colour switch at its edge follows the tile grid: a staircase)
const WET_REACH = 3.2, WET_TINT = [.17, .19, .2]; // stages 1 and 2: the wet sand reaches this many cells (~4 m) inland from the water, fading out smoothly; how much each of R, G, B it takes off at the waterline
const WET_EASE = .5; // stages 1 and 2: the dark wet-sand shade eases in over this share of nearby water (wider = a longer, smoother fade from the dry sand)
function paintTerrain(grid, mx, my, theme, overlay = null, ext = null) { // overlay: an image painted over the map, 1 px per NES pixel (stage 3's road markings)
  const CLASS_RGB = theme.classes, SHORE = overlay ? SHORE_TIGHT : theme.mud ? SHORE_SWAMP : SHORE_SOFT; // (an overlay is stage 3's)
  const rows = grid.length, cols = grid[0].length, S = 8;
  const ec = cols + 2 * mx, er = rows + 2 * my, w = ec * S, h = er * S;
  const cls = new Uint8Array(ec * er);
  for (let r = 0; r < er; r++) for (let c = 0; c < ec; c++) {
    const sr = Math.min(rows - 1, Math.max(0, r - my)), sc = Math.min(cols - 1, Math.max(0, c - mx));
    const off = sr !== r - my || sc !== c - mx; let ch = grid[sr][sc];
    if (ext && c - mx < 0 && r - my >= ext.r0 && r - my <= ext.r1) ch = -(c - mx) - 1 < ext.cols ? ext.rows[r - my - ext.r0][-(c - mx) - 1] : 'F'; // (the extension, left of the map)
    const k = off && ch === 'W' && theme.offMapWall ? theme.offMapWall : ch;
    cls[r * ec + c] = theme.classMap?.[k] ?? CLASS[k] ?? 0; // walls don't carry on past the map edge (stage 1: jungle does)
  }
  const clsAt = (r, c) => cls[Math.min(er - 1, Math.max(0, r)) * ec + Math.min(ec - 1, Math.max(0, c))];
  // water against a pool's stone rim: a straight, crisp edge, deep right up to the stones (stage 2)
  const rimWater = new Uint8Array(ec * er);
  for (let r = 0; r < er; r++) for (let c = 0; c < ec; c++) {
    if (cls[r * ec + c] !== 2) continue;
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      const sr = Math.min(rows - 1, Math.max(0, r + dr - my)), sc = Math.min(cols - 1, Math.max(0, c + dc - mx));
      if (grid[sr][sc] === 'R' || grid[sr][sc] === 'Q') rimWater[r * ec + c] = 1; // (stage 3's quays too)
    }
  }

  // Water depth per cell, 0 at the shore to 1 well offshore. Depth follows the distance to the
  // nearest land (two-pass chamfer distance, in cells), easing down over BANK cells so the banks
  // slope gently and a ~19 m river only reaches full depth around its middle.
  const BANK = 5; // cells (~6 m) from the waterline to full depth
  const dist = Float32Array.from(cls, k => k === 2 ? 1e9 : 0), D2 = Math.SQRT2;
  const relax = (r, c, dr, dc, k) => {
    const rr = r + dr, cc = c + dc;
    if (rr < 0 || rr >= er || cc < 0 || cc >= ec) return; // past the margin: open sea carries on
    const v = dist[rr * ec + cc] + k; if (v < dist[r * ec + c]) dist[r * ec + c] = v;
  };
  for (let r = 0; r < er; r++) for (let c = 0; c < ec; c++) if (dist[r * ec + c]) {
    relax(r, c, -1, 0, 1); relax(r, c, 0, -1, 1); relax(r, c, -1, -1, D2); relax(r, c, -1, 1, D2);
  }
  for (let r = er - 1; r >= 0; r--) for (let c = ec - 1; c >= 0; c--) if (dist[r * ec + c]) {
    relax(r, c, 1, 0, 1); relax(r, c, 0, 1, 1); relax(r, c, 1, 1, D2); relax(r, c, 1, -1, D2);
  }
  let wf = dist.map(d => { const t = Math.min(1, Math.max(0, (d - .5) / BANK)); return t * t * (3 - 2 * t); });
  const blurPass = (src, horizontal) => {
    const out = new Float32Array(src.length), R = 2;
    for (let r = 0; r < er; r++) for (let c = 0; c < ec; c++) {
      let sum = 0;
      for (let d = -R; d <= R; d++) {
        const rr = horizontal ? r : Math.min(er - 1, Math.max(0, r + d)), cc = horizontal ? Math.min(ec - 1, Math.max(0, c + d)) : c;
        sum += src[rr * ec + cc];
      }
      out[r * ec + c] = sum / (2 * R + 1);
    }
    return out;
  };
  wf = blurPass(blurPass(wf, true), false); // soften the chamfer creases
  const WIDE = 11; // cells (~14 m): the distance map's longer reach, in the blue channel, for the second layer of the swell (the depth map above is full by ~6 m)
  const wideCells = blurPass(blurPass(dist.map(d => Math.min(1, d / WIDE)), true), false);
  for (let i = 0; i < wf.length; i++) if (rimWater[i]) wf[i] = Math.max(wf[i], .75); // a pool is deep right up to its stone sides
  // Distance (in cells) from each cell to the nearest water: for the wet sand's broad, smooth fade into the dry (stages 1 and 2)
  const wdist = Float32Array.from(cls, k => k === 2 ? 0 : 1e9);
  const relaxW = (r, c, dr, dc, k) => { const rr = r + dr, cc = c + dc; if (rr < 0 || rr >= er || cc < 0 || cc >= ec) return; const v = wdist[rr * ec + cc] + k; if (v < wdist[r * ec + c]) wdist[r * ec + c] = v; };
  for (let r = 0; r < er; r++) for (let c = 0; c < ec; c++) if (wdist[r * ec + c]) { relaxW(r, c, -1, 0, 1); relaxW(r, c, 0, -1, 1); relaxW(r, c, -1, -1, D2); relaxW(r, c, -1, 1, D2); }
  for (let r = er - 1; r >= 0; r--) for (let c = ec - 1; c >= 0; c--) if (wdist[r * ec + c]) { relaxW(r, c, 1, 0, 1); relaxW(r, c, 0, 1, 1); relaxW(r, c, 1, 1, D2); relaxW(r, c, 1, -1, D2); }
  const wdistAt = (fy, fx) => { // bilinear, in cell-centre coordinates
    const r = Math.floor(fy), c = Math.floor(fx), ty = fy - r, tx = fx - c;
    const g = (rr, cc) => Math.min(50, wdist[Math.min(er - 1, Math.max(0, rr)) * ec + Math.min(ec - 1, Math.max(0, cc))]);
    return (g(r, c) * (1 - tx) + g(r, c + 1) * tx) * (1 - ty) + (g(r + 1, c) * (1 - tx) + g(r + 1, c + 1) * tx) * ty;
  };
  const depthCells = wf;
  const wideAt = (fy, fx) => { const r = Math.floor(fy), c = Math.floor(fx), ty = fy - r, tx = fx - c, g = (rr, cc) => wideCells[Math.min(er - 1, Math.max(0, rr)) * ec + Math.min(ec - 1, Math.max(0, cc))]; return (g(r, c) * (1 - tx) + g(r, c + 1) * tx) * (1 - ty) + (g(r + 1, c) * (1 - tx) + g(r + 1, c + 1) * tx) * ty; };
  const depthAt = (fy, fx) => { // bilinear, in cell-centre coordinates
    const r = Math.floor(fy), c = Math.floor(fx), ty = fy - r, tx = fx - c;
    const g = (rr, cc) => depthCells[Math.min(er - 1, Math.max(0, rr)) * ec + Math.min(ec - 1, Math.max(0, cc))];
    return (g(r, c) * (1 - tx) + g(r, c + 1) * tx) * (1 - ty) + (g(r + 1, c) * (1 - tx) + g(r + 1, c + 1) * tx) * ty;
  };
  const n1 = valueNoise(11), n2 = valueNoise(23), n3 = valueNoise(37);
  const colour = document.createElement('canvas'); colour.width = w; colour.height = h;
  const water = document.createElement('canvas'); water.width = w; water.height = h;
  const ci = colour.getContext('2d').createImageData(w, h), wi = water.getContext('2d').createImageData(w, h);
  const acc = new Float32Array(4);
  // landMix: for each land class a per-cell mask (water and man-made cells count as sand), box-blurred ~3.5 cells (about 4-5 m
  // sigma) so a pixel's share of each class changes slowly with distance; sampled bilinearly in cell-centre coordinates.
  const landMask = [0, 1, 2, 3].map(() => new Float32Array(ec * er));
  for (let r = 0; r < er; r++) for (let c = 0; c < ec; c++) { const k = cls[r * ec + c]; if (k !== 2) landMask[k >= 4 ? 0 : k][r * ec + c] = 1; }
  {
    const tmpL = new Float32Array(ec * er), RL = 3;
    const pass = (src, dst, horizontal) => {
      for (let r = 0; r < er; r++) for (let c = 0; c < ec; c++) {
        let sum = 0;
        for (let d = -RL; d <= RL; d++) sum += horizontal ? src[r * ec + Math.min(ec - 1, Math.max(0, c + d))] : src[Math.min(er - 1, Math.max(0, r + d)) * ec + c];
        dst[r * ec + c] = sum / (2 * RL + 1);
      }
    };
    for (const k of [0, 1, 3]) for (let i = 0; i < 3; i++) { pass(landMask[k], tmpL, true); pass(tmpL, landMask[k], false); }
  }
  const landAt = (k, fy, fx) => {
    const r = Math.floor(fy), c = Math.floor(fx), ty = fy - r, tx = fx - c, a = landMask[k];
    const g = (rr, cc) => a[Math.min(er - 1, Math.max(0, rr)) * ec + Math.min(ec - 1, Math.max(0, cc))];
    return (g(r, c) * (1 - tx) + g(r, c + 1) * tx) * (1 - ty) + (g(r + 1, c) * (1 - tx) + g(r + 1, c + 1) * tx) * ty;
  };
  // The smooth shore (stages 1 and 2): the share of water round a point, from the water mask blurred about 1.6 cells (four box passes), sampled bilinearly at a point warped at
  // several scales (long meanders, bays and headlands, small wobbles). Its half-way contour is the waterline: the rounded, irregular curve of a real shore, where the plain
  // tile neighbourhood gave straight runs and 45-degree steps that followed the grid.
  let waterShareAt = null;
  if (!overlay && (theme === THEMES.jungle || theme === THEMES.mountain)) { // (stages 1 and 4: stage 2 keeps the tile-based shore)
    let a = new Float32Array(ec * er), b = new Float32Array(ec * er);
    for (let i = 0; i < a.length; i++) a[i] = cls[i] === 2 ? 1 : 0;
    for (let n = 0; n < 4; n++) {
      for (let r = 0; r < er; r++) for (let c = 0; c < ec; c++) b[r * ec + c] = (a[r * ec + Math.max(0, c - 1)] + a[r * ec + c] + a[r * ec + Math.min(ec - 1, c + 1)]) / 3;
      for (let r = 0; r < er; r++) for (let c = 0; c < ec; c++) a[r * ec + c] = (b[Math.max(0, r - 1) * ec + c] + b[r * ec + c] + b[Math.min(er - 1, r + 1) * ec + c]) / 3;
    }
    const sm = a;
    waterShareAt = (fy, fx) => {
      const r = Math.floor(fy), c = Math.floor(fx), ty = fy - r, tx = fx - c;
      const g = (rr, cc) => sm[Math.min(er - 1, Math.max(0, rr)) * ec + Math.min(ec - 1, Math.max(0, cc))];
      return (g(r, c) * (1 - tx) + g(r, c + 1) * tx) * (1 - ty) + (g(r + 1, c) * (1 - tx) + g(r + 1, c + 1) * tx) * ty;
    };
  }
  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      const cx = (px + .5) / S, cy = (py + .5) / S, i = (py * w + px) * 4;
      const own = clsAt(Math.floor(cy), Math.floor(cx));
      let R, G, B, wet;
      if (own === 2 && rimWater[Math.floor(cy) * ec + Math.floor(cx)]) { [R, G, B] = CLASS_RGB[2]; wet = 255; } // water against a stone rim: crisp
      else if (own >= 4) { // concrete / wall: crisp
        [R, G, B] = CLASS_RGB[own]; wet = 0;
      } else {
        // sample point, gently warped, in cell-centre coordinates
        const gx = cx - .5 + (n1(cx * .3, cy * .3) - .5) * .8 + (n2(cx * 1.2, cy * 1.2) - .5) * .25;
        const gy = cy - .5 + (n2(cx * .3 + 40, cy * .3) - .5) * .8 + (n1(cx * 1.2, cy * 1.2 + 40) - .5) * .25;
        const r0 = Math.round(gy), c0 = Math.round(gx);
        acc.fill(0);
        let total = 0;
        for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
          const d = Math.hypot(gx - (c0 + dc), gy - (r0 + dr)), t = Math.max(0, SHORE.reach - d), wgt = t * t;
          const k = clsAt(r0 + dr, c0 + dc);
          acc[k >= 4 ? 0 : k] += wgt; total += wgt; // man-made neighbours blend as sand
        }
        R = G = B = 0;
        for (let k = 0; k < 4; k++) { const f = acc[k] / total; R += CLASS_RGB[k][0] * f; G += CLASS_RGB[k][1] * f; B += CLASS_RGB[k][2] * f; }
        let m = acc[2] / total; // share of water nearby -> anti-aliased shoreline
        if (waterShareAt) { // stages 1 and 2: the smooth, irregular shore instead (see above); the colours follow it
          const sx = cx - .5 + (n1(cx * .14 + 5, cy * .14) - .5) * 2.2 + (n2(cx * .45, cy * .45 + 9) - .5) * 1.0 + (n3(cx * 1.5, cy * 1.5) - .5) * .32;
          const sy = cy - .5 + (n2(cx * .14 + 60, cy * .14 + 20) - .5) * 2.2 + (n1(cx * .45 + 30, cy * .45) - .5) * 1.0 + (n3(cx * 1.5 + 70, cy * 1.5) - .5) * .32;
          m = waterShareAt(sy, sx);
          const others = total - acc[2];
          R = G = B = 0;
          for (let k = 0; k < 4; k++) { const f = k === 2 ? m : others > 1e-6 ? (1 - m) * acc[k] / others : k === 0 ? 1 - m : 0; R += CLASS_RGB[k][0] * f; G += CLASS_RGB[k][1] * f; B += CLASS_RGB[k][2] * f; }
        }
        if (m < .02 || !overlay) { // away from water: the land colours blend over a very wide band (see landMix), so sand eases into the forest floor
          let f0 = landAt(0, gy, gx), f1 = landAt(1, gy, gx), f3 = landAt(3, gy, gx); const ft = f0 + f1 + f3;
          if (ft > 1e-4) {
            f0 /= ft; f1 /= ft; f3 /= ft;
            const LR = CLASS_RGB[0][0] * f0 + CLASS_RGB[1][0] * f1 + CLASS_RGB[3][0] * f3, LG = CLASS_RGB[0][1] * f0 + CLASS_RGB[1][1] * f1 + CLASS_RGB[3][1] * f3, LB = CLASS_RGB[0][2] * f0 + CLASS_RGB[1][2] * f1 + CLASS_RGB[3][2] * f3;
            // stages 1 and 2: the wet sand eases in from the dry over a share of water m = 0 .. WET_EASE (it used to switch at .02, a visible edge to the dark band); stage 3 keeps its switch
            let e = overlay ? (m < .02 ? 0 : 1) : Math.min(1, m / WET_EASE); e = e * e * (3 - 2 * e);
            R = LR + (R - LR) * e; G = LG + (G - LG) * e; B = LB + (B - LB) * e;
          }
        }
        if (!overlay) { // the wet sand: darkest at the waterline, fading smoothly out over WET_REACH cells (the edge of it wavering a little)
          const dd = waterShareAt ? 0 : wdistAt(gy, gx) + (n2(cx * .22 + 7, cy * .22) - .5) * 1.4 - .5, // (stage 2: the distance to the water, tile-based)
            t = waterShareAt ? Math.min(1, Math.max(0, m / .5)) : 1 - Math.min(1, Math.max(0, dd / WET_REACH)), w = t * t * (3 - 2 * t); // (stage 1 follows the smooth shore: strongest at the waterline, gone about 3 cells inland)
          if (theme.mud) { // stage 4: the wet mud along the waterline, nothing like an even stripe: where its grass-side edge lies wanders at three scales (long bays and spurs, ~4 m bumps, a ragged fringe), so the band swells to a metre in places and pinches to almost nothing in others;
            // its colour mottles (damper darker patches, drier paler ones); beyond the band a patchy fringe of scuffed earth reaches into the grass in places, and in others the grass comes right down to the water
            const wob = (n1(cx * .22 + 40, cy * .22) - .5) * .16 + (n3(cx * .9 + 3, cy * .9) - .5) * .09 + (n2(cx * 3.2, cy * 3.2 + 7) - .5) * .045,
              lo = .38 + wob, u = Math.min(1, Math.max(0, (m - lo) / .035)), damp = n2(cx * .5 + 20, cy * .5 + 20),
              mw = u * u * (3 - 2 * u) * (.72 + (n2(cx * 3, cy * 3) - .5) * .3);
            const ek = Math.min(1, Math.max(0, (m - lo) / Math.max(.02, .45 - lo))), mk = (1.15 - .4 * ek) * (.82 + damp * .4); // (a slightly drier lip on the outer edge, darkest at the water: the bank drops into it)
            R += (theme.mud[0] * mk - R) * mw; G += (theme.mud[1] * mk - G) * mw; B += (theme.mud[2] * mk - B) * mw;
            const fr = Math.min(1, Math.max(0, (lo - m) / .12)) * Math.min(1, Math.max(0, (m - lo + .16) / .08)), patch = Math.min(1, Math.max(0, (n1(cx * 1.4 + 9, cy * 1.4) * .6 + n3(cx * 4.5, cy * 4.5) * .4 - .52) / .12)), fk = fr * patch * .55;
            R += (theme.mud[0] * 1.6 - R) * fk; G += (theme.mud[1] * 1.55 - G) * fk; B += (theme.mud[2] * 1.4 - B) * fk; // (the scuffed fringe: a paler, drier earth than the mud itself)
          }
          else { R *= 1 - w * WET_TINT[0]; G *= 1 - w * WET_TINT[1]; B *= 1 - w * WET_TINT[2]; }
        }
        wet = 255 * Math.min(1, Math.max(0, (m - SHORE.wetFrom) / SHORE.wetSpan));
      }
      let k = (1 + (n3(cx * .12, cy * .12) - .5) * .22 + (n1(cx * .6 + 90, cy * .6) - .5) * .08) * (theme.pavement ? pavementMottle(n1, n2, n3, cx, cy) : 1); // broad colour patches
      if (theme.darkHighlights) k = (k > .9 ? .9 + (k - .9) * .15 : k) * .96; // (the lighter patches are squeezed down toward the average, and all of it a touch darker)
      ci.data[i] = Math.min(255, R * k); ci.data[i + 1] = Math.min(255, G * k); ci.data[i + 2] = Math.min(255, B * k); ci.data[i + 3] = 255;
      wi.data[i] = 255 * depthAt(cy - .5, cx - .5); wi.data[i + 1] = wet; wi.data[i + 2] = 255 * wideAt(cy - .5, cx - .5); wi.data[i + 3] = 255;
    }
  }
  colour.getContext('2d').putImageData(ci, 0, 0);
  if (overlay) colour.getContext('2d').drawImage(overlay, mx * S, my * S); // (8 canvas px per cell = 1 per NES pixel)
  water.getContext('2d').putImageData(wi, 0, 0);
  const map = canvasTexture(colour, 1, 1);
  map.wrapS = map.wrapT = THREE.ClampToEdgeWrapping;
  return { map, water: new THREE.CanvasTexture(water), depthCells, ec, er };
}

// Tileable fine-detail texture (sand grain, wind ripples, pebbles), mid-grey = no change.
function detailTexture(rand) {
  const N = 512, c = document.createElement('canvas'); c.width = c.height = N;
  const x = c.getContext('2d'), img = x.createImageData(N, N), TAU = Math.PI * 2;
  for (let py = 0; py < N; py++) for (let px = 0; px < N; px++) {
    const ripple = Math.sin(TAU * (3 * px + 7 * py) / N + 1.5 * Math.sin(TAU * 2 * px / N)) * 4
      + Math.sin(TAU * (5 * px - 2 * py) / N) * 2;
    const v = 128 + ripple + (rand() - .5) * 34, i = (py * N + px) * 4;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  for (let i = 0; i < 700; i++) { // pebbles, drawn wrapped so the tile stays seamless
    const px = rand() * N, py = rand() * N, r = .8 + rand() * 2.2, l = rand() > .5;
    x.fillStyle = l ? 'rgba(255,255,255,.35)' : 'rgba(0,0,0,.35)';
    for (const ox of [-N, 0, N]) for (const oy of [-N, 0, N]) { x.beginPath(); x.arc(px + ox, py + oy, r, 0, TAU); x.fill(); }
  }
  return canvasTexture(c, 1, 1);
}

// Bounding boxes of 4-connected runs of one terrain char.
function regions(grid, ch) {
  const rows = grid.length, cols = grid[0].length, seen = new Set(), out = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    if (grid[r][c] !== ch || seen.has(r * cols + c)) continue;
    const box = { r0: r, r1: r, c0: c, c1: c }, stack = [[r, c]]; seen.add(r * cols + c);
    while (stack.length) {
      const [y, x] = stack.pop();
      box.r0 = Math.min(box.r0, y); box.r1 = Math.max(box.r1, y); box.c0 = Math.min(box.c0, x); box.c1 = Math.max(box.c1, x);
      for (const [yy, xx] of [[y + 1, x], [y - 1, x], [y, x + 1], [y, x - 1]]) {
        if (yy >= 0 && yy < rows && xx >= 0 && xx < cols && grid[yy][xx] === ch && !seen.has(yy * cols + xx)) { seen.add(yy * cols + xx); stack.push([yy, xx]); }
      }
    }
    out.push(box);
  }
  return out;
}

// A column's shaft height (metres, cosmetic): taller where the NES draws it taller, plus a good deal of
// its own variation, so a colonnade is a ragged skyline of broken stumps and tall survivors.
const COLUMN_H = [3, 9]; // range
function columnHeight(e) {
  const nes = Math.min(1, Math.max(0, (e.tall - 40) / 40)), own = ((Math.sin(e.x * 12.9898 + e.y * 78.233) * 43758.5453) % 1 + 1) % 1;
  return COLUMN_H[0] + (COLUMN_H[1] - COLUMN_H[0]) * (.3 * nes + .7 * own * own * (3 - 2 * own));
}

// What each entity type turns into. block = solid footprint scale; target = destructible.
const tall = g => { g.scale.y = 1.35; return g; }; // stage 6's barricades stand 35% taller (only up: the footprint is what blocks the road)
const beltTextures = []; // the conveyor belts' ribbed textures: scrolled south each frame (stage 6)
// A shipping container (or a pile of them) turned by `rot` degrees: its collision box can only be square-on, so a turned one is a row of five squares along its length (the box is 9.8 m by 5 m: half a side 2.4 m, one every 1.25 m)
function containerBlocks(p, e) {
  if (!e.rot) return [];
  const a = e.rot * Math.PI / 180, dx = Math.cos(a), dz = -Math.sin(a); // (the way its length runs: + rot is counter-clockwise seen from above)
  return [-2.5, -1.25, 0, 1.25, 2.5].map(k => ({ x: p.x + dx * k, z: p.z + dz * k, hw: 2.4, hd: 2.4, top: containerTop(e) }));
}
// How high a grenade must be to clear it: a single container is let through (0: grenades fly over it); a pile more than one high stops them up to its full height
function containerTop(e) { const n = e.type === 'containerpile' ? (e.tiers ?? 3) : 1; return n > 1 ? n * 2.62 : 0; }
let emitterMats = null;
const buildCurtainEmitter = sg => { // a curtain emitter column, bolted flat to a pylon's inner face (it faces -x for the right pylon, sg = 1): a back plate, three round emitter heads with glowing lenses and cooling fins, status lights, and a conduit down the side
  const M = emitterMats ??= { steel: new THREE.MeshStandardMaterial({ color: 0x2c3035, roughness: .45, metalness: .8 }), light: new THREE.MeshStandardMaterial({ color: 0x8c939a, roughness: .35, metalness: .85 }), dark: new THREE.MeshStandardMaterial({ color: 0x0d0e10, roughness: .6, metalness: .4 }),
    lens: new THREE.MeshStandardMaterial({ color: 0x300604, emissive: 0xff2a12, emissiveIntensity: 2.6, roughness: .2, metalness: .2 }), core: new THREE.MeshStandardMaterial({ color: 0xffd8c8, emissive: 0xffb090, emissiveIntensity: 3, roughness: .2 }),
    green: new THREE.MeshStandardMaterial({ color: 0x082010, emissive: 0x30ff70, emissiveIntensity: 2, roughness: .3 }), hazard: new THREE.MeshStandardMaterial({ color: 0xc8a020, roughness: .6, metalness: .3 }) };
  const g = new THREE.Group(); g.name = 'curtainLens'; // (named so the gate's destruction can remove it)
  const add = (geo, m, x, y, z) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = o.receiveShadow = true; g.add(o); return o; };
  const ax = geo => geo.rotateZ(Math.PI / 2); // (a cylinder lying along x)
  // x runs out from the pylon face toward the curtain (the group is turned for the left pylon)
  add(new THREE.BoxGeometry(.1, 3.1, .85), M.steel, .05, 1.9, 0);                                                              // back plate, flat on the pylon face
  for (const sz of [-1, 1]) add(new THREE.BoxGeometry(.14, 3.1, .07), M.light, .07, 1.9, sz * .4);                              // edge rails
  for (const y of [.55, 1.9, 3.25]) { // three emitter heads
    add(ax(new THREE.CylinderGeometry(.27, .27, .12, 20)), M.steel, .16, y, 0);                                               // mounting ring
    add(ax(new THREE.CylinderGeometry(.22, .25, .3, 20)), M.light, .37, y, 0);                                                // the barrel, slightly tapered
    for (const dx of [.3, .38, .46]) add(ax(new THREE.CylinderGeometry(.27, .27, .03, 20)), M.steel, dx, y, 0);                // cooling fins
    add(ax(new THREE.CylinderGeometry(.19, .19, .08, 20)), M.dark, .56, y, 0);                                                // the bezel
    add(ax(new THREE.CylinderGeometry(.15, .15, .06, 20)), M.lens, .59, y, 0);                                                // the glowing lens
    add(ax(new THREE.CylinderGeometry(.06, .06, .05, 12)), M.core, .62, y, 0);                                                // its hot centre
    for (const sz of [-.34, .34]) add(new THREE.BoxGeometry(.06, .06, .06), M.green, .12, y + .12, sz * .9);                  // status lights
  }
  add(new THREE.CylinderGeometry(.05, .05, 3.1, 8), M.dark, .16, 1.9, -.36);                                                   // a conduit down the side
  for (const y of [1.2, 2.6]) add(ax(new THREE.CylinderGeometry(.1, .1, .1, 10)), M.steel, .15, y, -.36);                       // its clamps
  add(new THREE.CylinderGeometry(.1, .1, .2, 12), M.light, .16, .27, -.36); add(new THREE.CylinderGeometry(.075, .075, .1, 12), M.dark, .16, .13, -.36); // the cable gland at the conduit's foot: the power cable leaves from here
  for (let i = 0; i < 5; i++) add(new THREE.BoxGeometry(.04, .07, .2), M.hazard, .12, .12 + i * .05, .27 + (i % 2) * 0);        // a hazard tag at the foot
  if (sg > 0) g.rotation.y = Math.PI; // (the group's +x points at the curtain: for the right pylon that is -x)
  return mergeStatic(g);
};
const gateCurtains = []; // gates with a curtain of red energy
const chimneys = []; // each hut's chimney, so a thread of smoke can rise from it (main.js)
let brickTex = null;
const chimneyBricks = () => brickTex ??= (() => { // weathered red-brown brick courses with pale mortar and sooty streaks
  const W = 128, H = 256, c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d'); x.fillStyle = '#b9b0a2'; x.fillRect(0, 0, W, H);
  let sd = 7; const rn = () => (sd = (sd * 16807) % 2147483647) / 2147483647;
  for (let row = 0; row < 16; row++) for (let col = -1; col < 4; col++) { const bx = col * 34 + (row % 2 ? 17 : 0), by = row * 16, k = rn(); x.fillStyle = `rgb(${128 + k * 50 | 0},${64 + k * 24 | 0},${50 + k * 18 | 0})`; x.fillRect(bx + 1.5, by + 1.5, 31, 13); }
  for (let i = 0; i < 40; i++) { x.fillStyle = `rgba(30,24,20,${.05 + rn() * .1})`; x.fillRect(rn() * W, rn() * H * .5, 2 + rn() * 5, 20 + rn() * 90); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; return t;
})();
const addChimney = h => { // a brick stack on the slope of the roof, below the ridge: flashing at its foot, a stone crown with a drip edge, a flue, and snow banked on the crown and against the uphill side
  const tex = chimneyBricks(), brick = new THREE.MeshStandardMaterial({ map: tex, roughness: .95 }), stone = new THREE.MeshStandardMaterial({ color: 0x8c8a86, roughness: .9 }), snow = new THREE.MeshStandardMaterial({ color: 0xf2f5fa, roughness: 1 }), c = new THREE.Group(); c.name = 'chimney'; c.position.set(1.15, 2.4, -1.4);
  const mesh = (g, m, y, cast = true) => { const o = new THREE.Mesh(g, m); o.position.y = y; o.castShadow = cast; o.receiveShadow = true; c.add(o); return o; };
  const sides = new THREE.BoxGeometry(.58, 1.6, .58); const uv = sides.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * .75, uv.getY(i) * .56);
  mesh(sides, brick, .8); // the stack, brick courses on every side
  mesh(new THREE.BoxGeometry(.7, .16, .7), new THREE.MeshStandardMaterial({ color: 0x4a4a4c, roughness: .6, metalness: .5 }), .06); // lead flashing at the foot
  mesh(new THREE.BoxGeometry(.8, .12, .8), stone, 1.66); mesh(new THREE.BoxGeometry(.72, .06, .72), stone, 1.58); // the crown and its drip edge
  const flue = new THREE.Mesh(new THREE.CylinderGeometry(.19, .19, .02, 16), new THREE.MeshBasicMaterial({ color: 0x100c0a })); flue.position.y = 1.735; c.add(flue); // the opening
  const rim = new THREE.Mesh(new THREE.TorusGeometry(.2, .035, 6, 16), stone); rim.rotation.x = Math.PI / 2; rim.position.y = 1.735; c.add(rim);
  const plate = (w, hgt, x, y, z, ry, d = .1) => { const o = mesh(new THREE.SphereGeometry(1, 16, 10), snow, y, false); o.scale.set(d, hgt, w); o.position.set(x, y, z); o.rotation.y = ry; return o; }; // snow stuck to a face: a rounded drift pressed against the brick (the south face is the one the camera sees)
  let sd = 5 + chimneys.length * 131; const rn = () => (sd = (sd * 16807) % 2147483647) / 2147483647; // (each chimney has its own pattern)
  const nPatch = 3 + Math.floor(rn() * 3);
  for (let i = 0; i < nPatch; i++) { const y = .85 + rn() * .62, w = .1 + rn() * .14, hh = .2 + rn() * .35, face = rn(); // snow clings high up, mostly on the south face the camera sees, some on its sides
    if (face < .55) plate(w, hh, (rn() - .5) * .34, y, .3, Math.PI / 2, .08 + rn() * .07); else if (face < .8) plate(w, hh, .3, y, (rn() * .5 - .1), 0, .07 + rn() * .06); else plate(w, hh, -.3, y, (rn() * .5 - .1), 0, .07 + rn() * .06); }
  const drift = mesh(new THREE.SphereGeometry(.34, 14, 8), snow, .3, false); drift.scale.set(.9 + rn() * .6, .5 + rn() * .35, .9 + rn() * .5); drift.position.set(-.25 + rn() * .4, .26, .28 + rn() * .08); // piled at the foot, on the visible side
  h.add(c); chimneys.push(c);
};
// Merge a hut's roof sheets (one mesh each, a hundred or more a roof and the same again for the broken roof) into a few meshes: one per sheet material, kind (sheet or ridge cap) and, on a gable roof, side. Each vertex keeps its position in its own sheet
// (aLoc), which the snow pattern is laid out in (snowCoat, loc).
const mergeRoof = (h, gable) => {
  const v = new THREE.Vector3();
  for (const name of ['roof', 'roofBroken']) {
    const g = h.getObjectByName(name); if (!g) continue;
    const buckets = new Map();
    for (const m of g.children) if (m.isMesh && m.geometry.attributes.position) { const cap = m.geometry.parameters?.width === .32, side = gable ? (m.position.x > 0 ? '+' : '-') : '', key = m.material.uuid + (cap ? 'c' : 't') + side; if (!buckets.has(key)) buckets.set(key, { cap, side, list: [] }); buckets.get(key).list.push(m); }
    for (const { cap, side, list } of buckets.values()) {
      let n = 0, ni = 0; for (const m of list) { n += m.geometry.attributes.position.count; ni += m.geometry.index.count; }
      const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2), loc = new Float32Array(n * 3), idx = new Uint32Array(ni); let o = 0, oi = 0;
      for (const m of list) {
        m.updateMatrix(); const ge = m.geometry, P = ge.attributes.position, N = ge.attributes.normal, U = ge.attributes.uv;
        for (let i = 0; i < P.count; i++) {
          v.fromBufferAttribute(P, i); loc.set([v.x, v.y, v.z], (o + i) * 3); v.applyMatrix4(m.matrix); pos.set([v.x, v.y, v.z], (o + i) * 3);
          v.fromBufferAttribute(N, i).transformDirection(m.matrix); nor.set([v.x, v.y, v.z], (o + i) * 3); uv.set([U.getX(i), U.getY(i)], (o + i) * 2);
        }
        for (let i = 0; i < ge.index.count; i++) idx[oi + i] = ge.index.getX(i) + o; oi += ge.index.count; o += P.count;
      }
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); geo.setAttribute('aLoc', new THREE.BufferAttribute(loc, 3)); geo.setIndex(new THREE.BufferAttribute(idx, 1));
      if (cap) geo.parameters = { width: .32 }; // (snowHut tells the ridge caps by this)
      const mesh = new THREE.Mesh(geo, list[0].material); mesh.castShadow = list[0].castShadow; mesh.receiveShadow = list[0].receiveShadow; mesh.userData.side = side;
      for (const m of list) g.remove(m); g.add(mesh);
    }
  }
};
const mergeBody = h => { const roofs = ['roof', 'roofBroken'].map(n => h.getObjectByName(n)).filter(Boolean).map(g => [g, g.parent]); roofs.forEach(([g, p]) => p.remove(g)); mergeStatic(h); roofs.forEach(([g, p]) => p.add(g)); }; // (the walls, posts, windows and the rest merged by material before they get their snow: the roofs are left, their sheets are merged by mergeRoof)
const snowHut = (h, fine = 0, gable = false) => { const roof = h.getObjectByName('roof'), broken = h.getObjectByName('roofBroken'), inRoof = o => { for (let q = o; q; q = q.parent) if (q === roof || q === broken) return true; return false; };
        h.traverse(o => { if (o.isMesh && !inRoof(o) && o.material?.isMeshStandardMaterial) o.material = snowCoat(o.material.clone(), { up: 5, cling: 5, base: .8, bare: 1, edge: .09, grain: .1, tilt: .5, bright: 1.02 }); }); // (the walls: snow banked round the foot, ragged along its top, on every side)
        for (const rg of [roof, broken]) rg?.traverse(o => { if (o.isMesh) o.material = snowCoat(o.material.clone(), o.geometry.parameters?.width === .32 ? { up: .62, rough: 1.4, bright: 1.02, tilt: .5, grain: .08, edge: .16 } : fine ? { bright: gable ? 1.12 : 1.3, tilt: 0, grain: gable ? .05 : .02, edge: .03, desat: .5, bare: .95, fine: 0, tiles: gable ? ((o.userData.side ?? (o.position.x > 0 ? '+' : '-')) === '+' ? '-x' : 'x') : true, loc: !!o.geometry.attributes.aLoc, rep: gable ? 1.8 : 1, repV: gable ? 1.15 : 0 } : { cling: .2, up: .78, rough: 1.2, bright: 1.02, tilt: .45, grain: .08, edge: .13, desat: .9 }); }); /* (the secret level: the roof's own sheets carry snow; ridge caps on their own; the broken roof that shows after a breach carries it too) */
      };
let WET_ENV = null; // (the overcast sky the wet things mirror: set once the lighting is made)
const SPAWN = {
  palm: { build: e => buildPalm(e.x * 7919 + e.y * 104729), block: .6 }, // 3 m: solid (NES); 5 m-apart palms leave 2 m, under the jeep's width
  bush: { build: e => buildBushAsset(e.variant ?? 'leafy', e.x * 7 + e.y * 13) }, // (bush.js: leaf sprays on branches; e.variant: leafy, flowering, willow, scrub, fern or juniper)
  rock: { build: buildRock, block: .8 },
  // the sandbag arc (open to the north) blocks driving; a chain of small boxes follows it, leaving the inside free
  foxhole: { build: e => buildFoxhole(e.look), blocks: p => Array.from({ length: 7 }, (_, i) => { const a = i / 6 * Math.PI;
    return { x: p.x + Math.cos(a) * 2.1, z: p.z + Math.sin(a) * 1.3, hw: .45, hd: .45 }; }) },
  turret: { build: e => { const t = buildTurret(e); if (e.snowRoof) { mergeStatic(t); const top = t.getObjectByName('turret'), inTop = o => { for (let q = o; q; q = q.parent) if (q === top) return true; return false; }; t.updateMatrixWorld(true); const invTop = top ? new THREE.Matrix4().copy(top.matrixWorld).invert() : null; t.traverse(o => { if (o.isMesh && o.material?.isMeshStandardMaterial && !inTop(o)) { o.material = snowCoat(o.material.clone(), inTop(o) ? { up: 1.1, rough: 1.5, cling: 1.5, edge: .1, grain: .1, tilt: .5, bright: 1.02, local: true } : { up: 1.1, rough: 1.5, cling: 1.5, bare: 1, edge: .1, grain: .1, tilt: .5, bright: 1.02, rim: [2.0, .6] }); if (inTop(o) && invTop) o.material.userData.snowM.value.multiplyMatrices(invTop, o.matrixWorld); } }); } /* (the secret level: the pad's snow in world coordinates (so it is one continuous drift across the plates, with no straight seams), the turning gun's in its own, so it turns with it) */ return t; }, /* (the secret level: the gun and its base carry snow; the patterns follow the turret as it turns) */ block: .9, collide: .65, face: Math.PI, target: { hp: 4, score: 300 } },
  wallturret: { build: buildWallTurret, lift: 3.62, blocks: (p, ent) => ent.base === 'bunker' ? [{ x: p.x, z: p.z, hw: 1.6, hd: 1.6, kind: 'bunker' }] : [], /* (a gun on a concrete base on open ground: the base and its sandbags are in the way of a vehicle; shots are not stopped by them) */ face: Math.PI, hit: { hw: 1.0, hd: 1.0, dz: .9, r: 1.3 }, target: { hp: 1, score: 300 } }, // (hit: a small hit box, moved .9 m toward the wall's front so shots from the south still reach it before the wall's tiles stop them) // stage 5's wall-mounted guns: on top of the airbase wall (lift: the wall's height), one hit; the gun is the same as the emplacement's (see the turrets list below)
  m270: { build: () => { const m = buildM270(); m.scale.setScalar(.8); return m; }, block: .9, target: { hp: 4, score: 400 } }, // stage 4's rocket launcher truck: it never moves, but its launcher turns and fires a fan of heavy shells (see the turrets list below)
  barracks: { build: e => { const h = buildBarracks(e.x * 31 + e.y * 17, 'front', e.look === 'brown' ? 'brown' : e.look === 'grey' ? 'grey' : e.look === 'garage' ? 'garage' : 'metal'); if (e.look !== 'garage') h.scale.setScalar(e.scale ?? 1.2); if (e.snowRoof) { const boards = hutBoardsMaterial(4.6); h.traverse(o => { if (o.isMesh && o.material?.color?.getHex?.() === 0x5a4426) o.material = boards; }); /* (the walls: the POW huts' vertical planks, not a flat brown) */ mergeRoof(h, false); mergeBody(h); snowHut(h, 1); } return h; }, block: e => e.look === 'garage' ? .9 : .9 * (e.scale ?? 1.2), // (20% bigger, like every hut a prisoner comes out of; a garage stays as it was) // (look 'brown': stage 4's engineer huts have brown roofs and walls)
     face: Math.PI, target: { hp: 4, score: 500, solidWreck: true, bulletProof: true } }, // 1 grenade; walls stay up
  tent: { build: e => { const h = buildTent(e.x * 31 + e.y * 17, e.breach, e.look, e.windows, e.snowRoof ? 'brown' : null); h.scale.setScalar(e.scale ?? 1.2); if (e.snowRoof) { addChimney(h); mergeRoof(h, true); mergeBody(h); snowHut(h, 1, true); } return h; }, block: 1.08, target: { hp: 4, score: 200, solidWreck: true, bulletProof: true } }, // breach side from the level data
  gate: { build: e => { const g = e.look === 'airbase' ? buildGate(undefined, e.pylons ? 'airbasePylons' : 'airbase', gatePylonMats()) : e.look === 'orange' ? buildGate(undefined, 'harbour', gatePylonMats()) : e.look === 'steel' ? buildGate(undefined, 'steel', gatePylonMats()) : buildGate(undefined, null, gatePylonMats()); if (e.snowRoof) mergeStatic(g); if (e.snowRoof) g.traverse(o => { if (o.isMesh && o.material?.isMeshStandardMaterial) o.material = snowCoat(o.material.clone(), { up: .55, cling: .5, base: .55, bare: 1, edge: .09, grain: .1, tilt: .5, bright: 1.02 }); }); if (e.curtain) { // the secret level's village gate: no doors, a curtain of red energy between the posts (stage 6's arena gate has the same), switched off when the gate is destroyed
      for (const n of ['doorL', 'doorR']) { const d = g.getObjectByName(n); if (d) d.parent.remove(d); }
      const len = 2 * (4.625 - .6), cu = laserCurtain(len, [1, .1, .05], 3.3); // (it runs between the emitters' lenses)
      cu.group.name = 'curtain'; cu.group.position.z = .35; g.add(cu.group); cu.group.remove(cu.glow); const red = new THREE.PointLight(0xff2a12, 3.2, 9, 2); red.position.set(0, 1.7, .35); red.name = 'curtainLight'; g.add(red); g.userData.light = red; g.userData.curtainLen = len; // (a real red light: it lights the pylons and the snow, instead of a flat glowing sheet on the ground)
      for (const sg of [-1, 1]) { const em = buildCurtainEmitter(sg); em.position.set(sg * 4.625, 0, .35); g.add(em); } // (flat against each pylon's inner face: the pylons stand 5.25 m out, 1.25 m wide)
      g.userData.curtain = cu; g.userData.curtainA = 1; gateCurtains.push(g);
    }
    return g; }, block: 1, // (olive-drab painted steel doors in every stage, see stage-props.js)
  depth: .7, // depth: as deep as its posts (in line with the wall), not its sprite
    target: { hp: 4, score: 500, bulletProof: true } }, // 1 grenade; bullets don't hurt it
  pickup: { build: buildPickup },
  blocker: { build: () => new THREE.Group(), block: 1 }, // invisible: plugs a gap the NES blocks
  // stage 2 (desert ruins)
  column: { build: e => buildColumn(e.x * 31 + e.y * 7, columnHeight(e), (e.x * 13 + e.y) % 5 !== 0),
    block: .55 }, // footprint = the plinth; most are broken off, one in five keeps its capital
  fallen: { build: e => buildFallenColumn(e.x * 17 + e.y), block: .8 },
  bust: { build: e => buildBust(e.x), face: Math.PI, block: .9, // stage 2's boss: the four sandstone busts at the top of the map fire missiles (statues.js, arena.js)
    target: { hp: 12, score: 1000, solidWreck: true, bulletProof: true, shardProof: true, boss: true } }, // three grenades or rockets each (the rocket's split shots pass by: NES); the block stays
  statue: { build: e => buildStatue(e.x + e.y), face: Math.PI, block: .9, // one grenade, rocket or split shot blows the bust off; bullets just chip it
    target: { hp: 4, score: 300, solidWreck: true, bulletProof: true } }, // (the pedestal stays standing in the pool)
  hut: { build: e => { const h = buildBarracks(e.x * 31 + e.y * 17, 'front', 'grey'); h.scale.setScalar(1.2); return h; }, block: 1.08, face: Math.PI, // grey roof and walls, as on the NES map
    target: { hp: 4, score: 500, solidWreck: true, bulletProof: true } },
  ramp: { build: () => new THREE.Group() }, // the slope is in the ground itself
  // stage 3 (the harbour)
  container: { build: e => buildContainer(e.x + e.y + (e.seedOff ?? 0), !!e.wet), block: e => e.rot ? 0 : .95, blocks: containerBlocks, top: containerTop }, // shipping container: solid, can't be destroyed (turned by rot: a row of squares along it, see containerBlocks)
  containerpile: { build: e => buildContainerPile(e.x * 3 + e.y + (e.seedOff ?? 0), e.tiers ?? 3, !!e.wet), block: e => e.rot ? 0 : .95, blocks: containerBlocks, top: containerTop }, // a pile of them, stacked up crooked: solid
  bosstank: { build: () => buildBossTank(), block: 1, kind: 'blocker', face: Math.PI }, // stage 6's final boss (boss-tank.js): the model only for now, facing south, solid
  barrier: { build: e => { const b = buildBarrier((e.w ?? 64) * PX * .95); b.scale.setScalar(1.15); return b; }, block: .75, depth: .3 }, // (depth: just about its rails, not its sprite) // drawn 15% over size, blocking a smaller box than its sprite; can't be driven through, shots go over (weapons.js)
  // stage 6 (the fortress): the enemy's last line of obstacles. Low ones count as 'barrier' (shots and flames go over them), the stacks of drums and crates are solid like the containers
  f35: { build: () => { const j = buildF35(); j.traverse(o => { if (o !== j) o.name = ''; }); j.scale.setScalar(.8); return j; }, lift: 1.32, block: .75 }, // stage 6's parked jets, drawn at 80% (12.6 m long): the wheels are 1.32 m under the fuselage axis; the part names go so the model merges into a few meshes. The level gives w and h as the turned jet's box
  conveyor: { build: e => { const g = buildConveyor(e.w * PX, e.h * PX); beltTextures.push(...g.userData.belts); return g; }, blocks: (p, e) => { // stage 6's belts: two solid side rails (the jeep rides between them and can't leave the sides; the ends are open)
      const W = e.w * PX, Ln = e.h * PX, inner = W - 2 * RAIL;
      return [-1, 1].map(s => ({ x: p.x + s * (inner / 2 + RAIL / 2), z: p.z, hw: RAIL / 2, hd: Ln / 2, kind: 'barrier' }));
    } },
  hedgehog: { build: e => tall(buildHedgehog(e.x * 7 + e.y)), block: .95, kind: 'barrier' },
  sandbags: { build: e => tall(buildSandbagWall(e.x * 5 + e.y * 3, e.look)), block: 1, depth: .6, kind: 'barrier' },
  drumstack: { build: e => tall(buildDrumStack(e.x * 3 + e.y)), block: .9, kind: 'barrier' }, // (a barrier: everyone's shots fly over it, like the hedgehogs and sandbags)
  cratestack: { build: e => tall(buildCrateStack(e.x + e.y * 5)), block: 1, kind: 'barrier' },
  laser: { build: () => buildLaser('wall'), lift: 2.6, face: Math.PI }, // bolted to the south face of a laser-maze wall (the wall blocks); can't be destroyed
  parkedjeep: { build: () => { const j = buildEnemyJeep(); j.getObjectByName('driver').visible = false; j.scale.setScalar(.81); return j; }, block: .85,
    target: { hp: 3, score: 100 } }, // empty, parked: three bullets or one grenade (star: the hidden star is inside)
  powhut: { build: e => { // the prisoners' hut from the earlier stages, blown open on e.breach's side
      const h = buildTent(e.x * 31 + e.y * 17, e.breach ?? 'back', 'brown');
      // the prisoners come out through the breach: their meeting point is just outside the breach wall
      // as the model has it, straight out from the hut's middle
      const wall = new THREE.Box3().setFromObject(h.getObjectByName('breachWall')).getCenter(new THREE.Vector3()).setY(0);
      const out = wall.clone().normalize();
      h.getObjectByName('exit').position.copy(wall).addScaledVector(out, 1.6);
      h.scale.setScalar(e.scale ?? 1.2); // (drawn 10% bigger; the exit marker is inside, so it moves out with the wall)
      return h;
    }, block: 1.08, // (.9 of its level footprint, scaled up with the hut)
    target: { hp: 4, score: 200, solidWreck: true, bulletProof: true } }, // a group of prisoners comes out
};

// T-wall panel texture (one panel, 1.5 m x 2.6 m): concrete with two lifting holes near the top,
// rain stains, chipped edges, a cold joint line, dirt at the base and, on variant 0, a faded
// stencilled panel number. Three variants differ in tint and wear. Returns { map, bump }.
// The gate pylons are the compound walls' own precast concrete (two of the panel variants, the ones without the stencilled number).
let gatePylons = null;
function gatePylonMats() {
  return gatePylons ??= [1, 2].map(v => { const t = panelTextures(v); return new THREE.MeshStandardMaterial({ map: t.map, bumpMap: t.bump, bumpScale: .9, roughness: .92, envMapIntensity: .3, shadowSide: THREE.FrontSide }); });
}
const panelTexCache = {};
const PANEL_VARIANTS = 8;
function panelTextures(variant) {
  if (panelTexCache[variant]) return panelTexCache[variant];
  const TW = 256, TH = 448, rand = rng(101 + variant * 17);
  const tint = ['#8f8e86', '#868580', '#96938a', '#8a8c86', '#928d82', '#84847f', '#9a978c', '#8d8a84'][variant % 8];
  const R = (a, b) => a + rand() * (b - a);
  // Everything is planned once (the same for the colour map and the bump map, so the damage lines up), then drawn twice.
  const blotches = Array.from({ length: 16 }, () => ({ x: rand() * TW, y: rand() * TH, r: R(25, 80), light: rand() < .5, a: R(.05, .11) }));            // broad tone variation
  const specks = Array.from({ length: 6500 }, () => ({ x: rand() * TW, y: rand() * TH, l: rand() > .5, s: R(1, 2.2) }));                                 // aggregate grain
  const pits = Array.from({ length: 140 }, () => ({ x: rand() * TW, y: rand() * TH, r: R(.8, 2.6) }));                                                    // air holes
  const boards = Array.from({ length: 5 }, () => ({ y: rand() * TH, a: R(.04, .09), w: R(1, 2.2) }));                                                     // form-board joints
  const streaks = Array.from({ length: 16 }, () => ({ x: rand() * TW, w: R(2, 11), l: R(70, 300), a: R(.07, .2), rust: false }));                           // rain streaks
  const posts = [TW * .5, TW * (.2 + rand() * .6)].slice(0, 1 + (variant % 2)).map(x => ({ x: x + R(-6, 6), w: R(3, 7), l: R(90, 230), a: R(.25, .45), rust: true })); // rust bleeding down from the wire posts
  const salt = Array.from({ length: 7 }, () => ({ x: rand() * TW, y: TH * R(.7, .97), w: R(20, 70), h: R(8, 22), a: R(.12, .25) }));                       // white salt crust near the foot
  const spalls = Array.from({ length: 3 + Math.floor(rand() * 4) }, () => { // chips out of the edges and corners: a ragged polygon, some with rusty rebar showing
    const edge = Math.floor(rand() * 4), t = rand(), r = R(6, 20), cx = edge === 0 ? t * TW : edge === 1 ? TW : edge === 2 ? t * TW : 0, cy = edge === 0 ? 0 : edge === 1 ? t * TH : edge === 2 ? TH : t * TH * .6;
    return { cx, cy, pts: Array.from({ length: 7 }, (_, i) => [cx + Math.cos(i / 7 * 6.283) * r * R(.5, 1.2), cy + Math.sin(i / 7 * 6.283) * r * R(.5, 1.2)]), rebar: rand() < .35, r };
  });
  const cracks = Array.from({ length: 2 + (variant % 3) }, () => { // each a wandering path, with a branch or two
    const pts = []; let x = R(TW * .15, TW * .85), y = R(TH * .1, TH * .6); const n = 5 + Math.floor(rand() * 6);
    for (let i = 0; i < n; i++) { pts.push([x, y]); x += R(-22, 22); y += R(10, 34); }
    const branches = Array.from({ length: Math.floor(rand() * 3) }, () => { const [bx, by] = pts[Math.floor(rand() * (pts.length - 1))]; return [[bx, by], [bx + R(-30, 30), by + R(8, 30)], [bx + R(-50, 50), by + R(25, 60)]]; });
    return { pts, branches };
  });
  const pockN = variant % 3 === 1 ? 14 : variant % 3 === 2 ? 6 : 0, pcx = R(TW * .2, TW * .8), pcy = R(TH * .15, TH * .65);
  const pocks = Array.from({ length: pockN }, () => ({ x: pcx + R(-24, 24), y: pcy + R(-30, 30), r: R(1.3, 3) })); // a cluster of old bullet pocks
  const mildew = rand() < .5 ? [{ x: R(0, TW), w: R(30, 80) }] : [];                                                                                   // greenish damp at the foot
  const stencil = variant % 3 === 0 ? 'T-' + (10 + Math.floor(rand() * 89)) : null;                                                                       // a faded number on a third of them
  const draw = bump => {
    const c = document.createElement('canvas'); c.width = TW; c.height = TH; const x = c.getContext('2d');
    const blot = (cx, cy, r, rgba) => { const g = x.createRadialGradient(cx, cy, 0, cx, cy, r); g.addColorStop(0, rgba); g.addColorStop(1, rgba.replace(/[\d.]+\)$/, '0)')); x.fillStyle = g; x.fillRect(cx - r, cy - r, r * 2, r * 2); };
    if (bump) { x.fillStyle = '#808080'; x.fillRect(0, 0, TW, TH); } else { const gr = x.createLinearGradient(0, 0, 0, TH); gr.addColorStop(0, tint); gr.addColorStop(1, '#6f6d66'); x.fillStyle = gr; x.fillRect(0, 0, TW, TH); }
    if (!bump) for (const b of blotches) blot(b.x, b.y, b.r, b.light ? `rgba(255,250,235,${b.a})` : `rgba(40,36,30,${b.a})`);
    for (const k of specks) { x.fillStyle = bump ? (k.l ? 'rgba(255,255,255,.07)' : 'rgba(0,0,0,.09)') : (k.l ? 'rgba(255,255,255,.10)' : 'rgba(0,0,0,.13)'); x.fillRect(k.x, k.y, k.s, k.s); }
    for (const p of pits) { x.fillStyle = bump ? '#303030' : 'rgba(20,18,15,.5)'; x.beginPath(); x.arc(p.x, p.y, p.r, 0, 6.283); x.fill(); if (!bump) { x.fillStyle = 'rgba(255,255,255,.14)'; x.beginPath(); x.arc(p.x + p.r * .5, p.y + p.r * .6, p.r * .6, 0, 6.283); x.fill(); } }
    for (const b of boards) { x.fillStyle = bump ? `rgba(0,0,0,${b.a * 3})` : `rgba(0,0,0,${b.a})`; x.fillRect(0, b.y, TW, b.w); }
    x.fillStyle = bump ? 'rgba(0,0,0,.3)' : 'rgba(0,0,0,.08)'; x.fillRect(0, TH * .55, TW, 2); // cold joint
    if (!bump) for (const st of [...streaks, ...posts]) {
      const gr = x.createLinearGradient(0, 0, 0, st.l), col = st.rust ? '125,70,35' : '45,40,32'; gr.addColorStop(0, `rgba(${col},${st.a})`); gr.addColorStop(1, `rgba(${col},0)`);
      x.fillStyle = gr; x.beginPath(); x.moveTo(st.x - st.w / 2, 0); x.lineTo(st.x + st.w / 2, 0); x.lineTo(st.x + st.w * .15, st.l); x.lineTo(st.x - st.w * .15, st.l); x.fill();
    }
    if (!bump) { for (const m of salt) blot(m.x, m.y, Math.max(m.w, m.h), `rgba(238,234,222,${m.a})`); for (const m of mildew) blot(m.x, TH - 8, m.w, 'rgba(70,86,48,.35)'); }
    if (!bump) { const gr = x.createLinearGradient(0, TH, 0, TH - 90); gr.addColorStop(0, 'rgba(95,62,30,.55)'); gr.addColorStop(1, 'rgba(95,62,30,0)'); x.fillStyle = gr; x.fillRect(0, TH - 90, TW, 90); } // sand and damp at the foot
    [TW * .3, TW * .7].forEach(hx => { // lifting holes
      x.fillStyle = bump ? '#101010' : '#26241f'; x.beginPath(); x.arc(hx, TH * .07, 7, 0, 6.283); x.fill();
      if (!bump) { x.strokeStyle = 'rgba(110,70,40,.5)'; x.lineWidth = 2.5; x.beginPath(); x.moveTo(hx, TH * .07 + 7); x.lineTo(hx + 1, TH * .07 + 38); x.stroke(); }
    });
    for (const sp of spalls) { // chips: the paler fresh concrete, a dark rim, rusty rebar in some
      x.fillStyle = bump ? '#383838' : 'rgba(168,164,152,.9)'; x.beginPath(); sp.pts.forEach(([px, py], i) => i ? x.lineTo(px, py) : x.moveTo(px, py)); x.closePath(); x.fill();
      x.strokeStyle = bump ? '#151515' : 'rgba(35,31,26,.6)'; x.lineWidth = 1.2; x.stroke();
      if (sp.rebar && !bump) { x.strokeStyle = 'rgba(120,62,28,.9)'; x.lineWidth = 1.6; x.beginPath(); x.moveTo(sp.cx - sp.r * .6, sp.cy); x.lineTo(sp.cx + sp.r * .6, sp.cy + 2); x.stroke(); }
    }
    for (const k of cracks) {
      x.strokeStyle = bump ? '#151515' : 'rgba(30,26,22,.6)'; x.lineWidth = 1.4; x.beginPath(); k.pts.forEach(([px, py], i) => i ? x.lineTo(px, py) : x.moveTo(px, py)); x.stroke();
      x.lineWidth = .9; for (const br of k.branches) { x.beginPath(); br.forEach(([px, py], i) => i ? x.lineTo(px, py) : x.moveTo(px, py)); x.stroke(); }
    }
    for (const k of pocks) { x.fillStyle = bump ? '#202020' : 'rgba(25,22,18,.7)'; x.beginPath(); x.arc(k.x, k.y, k.r, 0, 6.283); x.fill(); if (!bump) { x.fillStyle = 'rgba(190,186,174,.6)'; x.beginPath(); x.arc(k.x, k.y, k.r * 1.7, 0, 6.283); x.arc(k.x, k.y, k.r, 0, 6.283, true); x.fill(); } }
    if (stencil && !bump) { x.fillStyle = 'rgba(25,25,22,.4)'; x.font = 'bold 38px Impact, "Arial Black", sans-serif'; x.textAlign = 'center'; x.fillText(stencil, TW / 2, TH * .42); }
    if (!bump) for (const [x0, x1] of [[0, 14], [TW, TW - 14]]) { const g = x.createLinearGradient(x0, 0, x1, 0); g.addColorStop(0, 'rgba(0,0,0,.22)'); g.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = g; x.fillRect(Math.min(x0, x1), 0, 14, TH); } // darker at the joints between panels
    const t = new THREE.CanvasTexture(c); t.anisotropy = 8;
    return t;
  };
  return (panelTexCache[variant] = { map: draw(false), bump: draw(true) });
}

// Bridge deck: one texture painted for the whole deck (`len` m along by `wid` m across), so nothing
// repeats. One continuous weathered concrete surface with soft broad tone variation, repair patches,
// oil and water stains, cracks, sand drifted along both kerbs and scattered pebbles. No markings or joints.
function bridgeDeckTexture(len, wid, seed) {
  const PXM = 48, W = Math.min(2048, Math.round(len * PXM)), H = Math.round(wid * PXM), sx = W / len;
  const c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d'), rand = rng(seed);
  x.fillStyle = 'rgb(92,87,78)'; x.fillRect(0, 0, W, H); // one continuous surface
  for (let i = 0; i < W * H / 25; i++) { x.fillStyle = rand() > .5 ? 'rgba(255,240,220,.05)' : 'rgba(0,0,0,.08)'; x.fillRect(rand() * W, rand() * H, 2, 2); } // grain
  const blob = (cx, cy, r, rgba) => { const g = x.createRadialGradient(cx, cy, 0, cx, cy, r); g.addColorStop(0, rgba); g.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = g; x.fillRect(cx - r, cy - r, r * 2, r * 2); };
  for (let i = 0; i < len; i++) blob(rand() * W, rand() * H, (1.5 + rand() * 2.5) * sx, rand() > .5 ? 'rgba(255,245,230,.06)' : 'rgba(0,0,0,.07)'); // broad tone variation
  for (let i = 0; i < len / 3; i++) { // repair patches: squarish, slightly different concrete
    const pw = (1 + rand() * 1.5) * sx, ph = (.8 + rand() * 1.2) * sx;
    x.fillStyle = `rgba(${rand() > .5 ? '70,66,60' : '110,104,94'},.6)`; x.fillRect(rand() * (W - pw), H * .15 + rand() * (H * .7 - ph), pw, ph);
  }
  for (let i = 0; i < len / 2; i++) blob(rand() * W, H * (.2 + rand() * .6), (.4 + rand() * .9) * sx, `rgba(15,12,10,${.15 + rand() * .2})`); // oil stains
  for (let i = 0; i < len / 2; i++) blob(rand() * W, rand() < .5 ? rand() * H * .2 : H - rand() * H * .2, (.5 + rand()) * sx, 'rgba(40,36,30,.18)'); // water stains near the kerbs
  x.strokeStyle = 'rgba(20,18,15,.45)'; x.lineWidth = 1.3;
  for (let k = 0; k < len * .8; k++) { // cracks, all different
    let px = rand() * W, py = rand() * H; x.beginPath(); x.moveTo(px, py);
    for (let i = 0, n = 3 + Math.floor(rand() * 6); i < n; i++) { px += (rand() - .5) * 34; py += (rand() - .5) * 22; x.lineTo(px, py); }
    x.stroke();
  }
  for (const edge of [0, 1]) for (let i = 0; i < len * 4; i++) { // sand drifted along both kerbs
    const d = Math.pow(rand(), 2) * H * .22, cy = edge ? H - d : d;
    blob(rand() * W, cy, (.2 + rand() * .5) * sx, `rgba(185,125,65,${.12 + rand() * .2})`);
  }
  for (let i = 0; i < len * 30; i++) { // pebbles and grit
    x.fillStyle = rand() > .5 ? 'rgba(150,140,125,.6)' : 'rgba(40,36,30,.6)'; x.fillRect(rand() * W, rand() * H, 1.5 + rand() * 2, 1.5 + rand() * 2);
  }
  const t = new THREE.CanvasTexture(c); t.anisotropy = 8;
  return t;
}

// Worn dirt at a bridge end. One texture spans 10 m along the road: u 0..0.3 lies on the deck, where
// dirt builds up toward the edge; u 0.3 is the bridge edge (solid); beyond it the dirt fades out into
// the sand. The fade follows ragged, noisy edges so it reads as a natural worn patch, not a rectangle.
let trackTex = null;
function dirtTrackTexture() {
  if (trackTex) return trackTex;
  const W = 256, H = 128, rand = rng(88), n1 = valueNoise(5), n2 = valueNoise(9);
  const c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d'), img = x.createImageData(W, H);
  for (let py = 0; py < H; py++) for (let px = 0; px < W; px++) {
    const u = px / W, v = py / H, i = (py * W + px) * 4;
    const along = u < .3 ? Math.pow(u / .3, 1.5) : 1 - Math.pow((u - .3) / .7, .8); // builds up on the deck, fades over the land
    const across = Math.min(1, Math.min(v, 1 - v) / .18);                             // soft sides
    const ragged = .55 + .9 * (n1(px * .05, py * .05) - .5) + .4 * (n2(px * .15, py * .15) - .5);
    const a = Math.max(0, Math.min(1, along * across * 1.4 + (ragged - .55) * 1.1 - .1));
    const grain = .92 + rand() * .16;
    img.data[i] = 168 * grain; img.data[i + 1] = 108 * grain; img.data[i + 2] = 58 * grain; img.data[i + 3] = 255 * a;
  }
  x.putImageData(img, 0, 0);
  trackTex = new THREE.CanvasTexture(c);
  return trackTex;
}

// --- destruction ---
const rubbleMats = {};
const rubble = (color) => rubbleMats[color] ??= new THREE.MeshStandardMaterial({ color, roughness: .95, flatShading: true, envMapIntensity: .3 });
const RUBBLE = { wallturret: 0x3a4046, turret: 0x5a5c56, barracks: 0x2f5a30, tent: 0x6a4a2a, gate: 0x2f4a2a };

// Blacken an object: every mesh gets its own darkened copy of its material.
function char(obj, k = .3) {
  obj.traverse(o => { if (o.isMesh) { o.material = o.material.clone(); o.material.color.multiplyScalar(k); if (o.isSkinnedMesh) o.material.skinning = true; } });
}

// What's left behind when a target is destroyed (the explosion itself is done by the caller).
function wreck(scene, type, obj, debris, fx, from = null) { // from: where the blast that did it was (the rubble of a building is thrown away from there; without it, out through the breach)
  const at = obj.position.clone(), r = () => (Math.random() - .5) * 2;
  if (type === 'm270') { // the truck is blown to pieces: nothing of the hull is left, only panels, wheels and launcher tubes flung about, and a scorch on the ground
    obj.visible = false;
    const olive = rubble(0x4a5236), dark = rubble(0x25261f), metal = rubble(0x4b4a42), rubberM = rubble(0x181816);
    for (let i = 0; i < 18; i++) { // armour plates and skirt panels
      const g = new THREE.Mesh(shardGeometry(.5 + Math.random() * .9, .07, .3 + Math.random() * .7), i % 4 ? olive : dark); g.castShadow = true;
      g.position.copy(at).add(new THREE.Vector3(r() * 1.2, .8 + Math.random() * 1.4, r() * 2)); g.rotation.set(r() * 3, r() * 3, r() * 3); scene.add(g);
      debris.launch(g, new THREE.Vector3(r() * 8, 6 + Math.random() * 7, r() * 8), new THREE.Vector3(r() * 12, r() * 12, r() * 12), .04);
    }
    for (let i = 0; i < 6; i++) { // road wheels
      const w = new THREE.Mesh(new THREE.CylinderGeometry(.34, .34, .26, 12), rubberM); w.castShadow = true;
      w.position.copy(at).add(new THREE.Vector3(r() * 1.5, .6, r() * 2)); scene.add(w);
      debris.launch(w, new THREE.Vector3(r() * 6, 5 + Math.random() * 5, r() * 6), new THREE.Vector3(r() * 9, r() * 9, r() * 9), .12);
    }
    for (let i = 0; i < 5; i++) { // pieces of the launcher box and its tubes
      const g = new THREE.Mesh(i % 2 ? new THREE.CylinderGeometry(.12, .12, .5 + Math.random() * .6, 8) : new THREE.BoxGeometry(.5 + Math.random() * .6, .35, .5 + Math.random() * .6), metal); g.castShadow = true;
      g.position.copy(at).add(new THREE.Vector3(r(), 1.8 + Math.random(), r())); g.rotation.set(r() * 3, r() * 3, r() * 3); scene.add(g);
      debris.launch(g, new THREE.Vector3(r() * 7, 8 + Math.random() * 6, r() * 7), new THREE.Vector3(r() * 10, r() * 10, r() * 10), .08);
    }
    for (let i = 0; i < 8; i++) debris.chunk(at.clone().setY(1), rubble(0x3a3a34), .15 + Math.random() * .25, 4);
    fx.explosion(at.clone().setY(at.y + 1.4), 1.8);
    fx.scorch(at, 3.4); fx.smoke(at.clone().setY(1), 8);
    return;
  }
  if (type === 'turret' || type === 'm270' || type === 'wallturret') {
    // the turret is blown off its mount, tumbles through the air and lands as a burnt-out shell
    const top = obj.getObjectByName('turret'), wp = new THREE.Vector3(), wq = new THREE.Quaternion();
    top.getWorldPosition(wp); top.getWorldQuaternion(wq);
    obj.remove(top); scene.add(top); top.position.copy(wp); top.quaternion.copy(wq);
    char(top, .55); // the turret is scorched; the concrete base keeps its colour
    debris.launch(top, new THREE.Vector3(r() * 3, 10 + Math.random() * 3, r() * 3), new THREE.Vector3(r() * 6, r() * 4, r() * 6), .15, true);
  } else if (obj.getObjectByName('roofBroken')) {
    // building: the blast tears through the front wall and the front of the roof (as on the NES)
    for (const [ok, bad] of [['roof', 'roofBroken'], ['breachWall', 'breachWallBroken']]) {
      const o = obj.getObjectByName(ok), x = obj.getObjectByName(bad);
      if (o && x) { o.visible = false; x.visible = true; }
    }
    // rubble blown out through the breach, toward the `exit` side
    const exit = obj.getObjectByName('exit').getWorldPosition(new THREE.Vector3());
    const exitOut = exit.clone().sub(at).setY(0).normalize(), out = from && Math.hypot(at.x - from.x, at.z - from.z) > .3 ? at.clone().sub(from).setY(0).normalize() : exit.clone().sub(at).setY(0).normalize(); // (away from the blast: the way the force went)
    for (let i = 0; i < 8; i++) {
      const c = new THREE.Mesh(new THREE.DodecahedronGeometry(.15 + Math.random() * .2, 0), rubble(obj.userData.rubble ?? RUBBLE[type] ?? 0x5a5c56));
      c.castShadow = true; c.position.copy(at).addScaledVector(out, 2).setY(at.y + 1); scene.add(c);
      debris.launch(c, out.clone().multiplyScalar(6 + Math.random() * 6).add(new THREE.Vector3(r() * 3, 3 + Math.random() * 4, r() * 3)),
        new THREE.Vector3(r() * 9, r() * 9, r() * 9), .1);
    }
    fx.puff(exit.clone().setY(at.y + 1), { color: 0x6a5a48, size: 1.2, grow: 2.5, life: 1.4, opacity: .6, vel: out.clone().multiplyScalar(3).setY(1) }); // dust burst out of the breach
    if (obj.userData.garage) fx.garageOpen?.(obj); // the garage: the tank inside rolls out (tanks.js), no prisoner
    else if (fx.pows) fx.pows.release(obj); // prisoners come out (barracks: one; huts: a group, see POWs)
    // set the wreck on fire: a main blaze in the blasted part, smaller flames round it
    if (fx.fires) {
      const floorY = type === 'barracks' ? .55 : .1, base = at.clone().addScaledVector(exitOut, 1.2).setY(at.y + floorY); // (on the ground where the building stands: on the snow slope the ground is well above 0) // (the blaze stays by the breach)
      const spots = [base];
      for (let i = 0, n = 3 + Math.floor(Math.random() * 3); i < n; i++) {
        spots.push(base.clone().add(new THREE.Vector3(r() * 1.8, 0, r() * 1.8)));
      }
      fx.fires.start(spots);
    }
    const burnt = rubble(0x2e2a24);
    for (let i = 0; i < 8; i++) { // burnt roof sheets thrown up out of the hole
      const m = new THREE.Mesh(shardGeometry(.5 + Math.random() * .5, .08, .35 + Math.random() * .35), burnt); m.castShadow = true;
      m.position.copy(at).add(new THREE.Vector3(r() * 1.5, 2.8, r() * 1.5)); scene.add(m);
      debris.launch(m, new THREE.Vector3(r() * 5, 8 + Math.random() * 6, r() * 5), new THREE.Vector3(r() * 10, r() * 10, r() * 10), .05);
    }
    for (let i = 0; i < 6; i++) debris.chunk(at.clone().setY(2.6), rubble(obj.userData.rubble ?? RUBBLE[type] ?? 0x5a5c56), .12 + Math.random() * .18, 2);
    fx.smoke(at.clone().setY(2.6), 9);
    return;
  } else if (type === 'statue' || type === 'bust') {
    // the bust is blown clean off: lumps of its stone thrown out and coming down round it, leaving
    // the snapped-off stump of its block (buildStatueRuin) on the pool statue's pedestal, or on the
    // ground where a sandstone bust (stage 2's boss) stood
    const pool = type === 'statue', bust = pool ? obj.getObjectByName('bust') : obj;
    const top = at.clone().setY(at.y + (pool ? 2.6 : 1.8)), m = pool ? statueStone() : stone(4);
    if (bust) {
      const ruin = buildStatueRuin(Math.round(at.x * 7 + at.z * 3), m, pool ? bust.scale.x : 1); // (a bust's own scale already applies to its children)
      let mask = 1; bust.traverse(o => { if (o.isMesh) mask = o.layers.mask; }); // (in the water's views like the bust was: layers.js)
      ruin.traverse(o => { o.layers.mask = mask; });
      if (pool) { ruin.position.copy(bust.position); obj.remove(bust); }
      else for (const c of obj.children) c.visible = false; // (the bust is the object itself: hide all of it)
      obj.add(ruin);
    }
    for (let i = 0; i < 9; i++) { // big pieces of head and shoulders
      const s = .25 + Math.random() * .3, c = new THREE.Mesh(new THREE.DodecahedronGeometry(s, 0), m);
      c.castShadow = true; c.scale.set(1, .6 + Math.random() * .5, .8 + Math.random() * .4);
      c.position.copy(top).add(new THREE.Vector3(r() * .8, r() * .9, r() * .8)); scene.add(c);
      debris.launch(c, new THREE.Vector3(r() * 6, 4 + Math.random() * 6, r() * 6), new THREE.Vector3(r() * 9, r() * 9, r() * 9), s * .5);
    }
    for (let i = 0; i < 10; i++) debris.chunk(top, m, .1 + Math.random() * .15, 2);
    if (pool) fx.waterBlast?.(at.clone().setY(0), 1.4); else fx.scorch(at, 3);
    fx.smoke(top, 7);
    return;
  } else if (type === 'gate') {
    // both doors shatter and the pieces are flung into the compound, leaving the posts and a clear gateway
    const panel = new THREE.BoxGeometry(.9, .7, .12), green = rubble(obj.userData.doorColor ?? 0x22361f); // (in the doors' own colour)
    const axis = new THREE.Vector3(1, 0, 0).applyQuaternion(obj.quaternion).setY(0).normalize(); // (along the gate, whichever way it is turned)
    if (obj.userData.curtain) obj.userData.curtainDead = true; // (the curtain fades out and the way is open)
    ['doorL', 'doorR'].forEach((n, i) => {
      const door = obj.getObjectByName(n); if (!door) return; const dPos = door.getWorldPosition(new THREE.Vector3());
      obj.remove(door);
      for (let k = 0; k < 6; k++) {
        const m = new THREE.Mesh(panel, green); m.castShadow = true;
        m.position.copy(dPos).addScaledVector(axis, (i ? -1 : 1) * (.5 + Math.random() * 3.5)).add(new THREE.Vector3(0, .5 + Math.random() * 1.8, 0)); scene.add(m);
        const sp = 5 + Math.random() * 9, ang = Math.random() * Math.PI * 2; // (the pieces fly off in every direction: the same for every blast, from whichever side)
        debris.launch(m, new THREE.Vector3(Math.cos(ang) * sp, 5 + Math.random() * 5, Math.sin(ang) * sp),
          new THREE.Vector3(r() * 10, r() * 10, r() * 10), .06);
      }
    });
  } else if (type === 'parkedjeep') { // an empty parked jeep: blown apart, grey panels and wheels flung about (no mark left)
    obj.visible = false;
    const panel = rubble(0x3a3a3e), tyre = rubble(0x1c1c1c);
    for (let i = 0; i < 8; i++) {
      const g = new THREE.Mesh(shardGeometry(.4 + Math.random() * .7, .06, .3 + Math.random() * .6), panel); g.castShadow = true;
      g.position.copy(at).add(new THREE.Vector3(r(), .8, r())); g.rotation.set(r() * 3, r() * 3, r() * 3); scene.add(g);
      debris.launch(g, new THREE.Vector3(r() * 6, 5 + Math.random() * 5, r() * 6), new THREE.Vector3(r() * 10, r() * 10, r() * 10), .04);
    }
    for (let i = 0; i < 3; i++) {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(.34, .34, .22, 12), tyre); w.castShadow = true;
      w.position.copy(at).add(new THREE.Vector3(r(), .5, r())); scene.add(w);
      debris.launch(w, new THREE.Vector3(r() * 5, 4 + Math.random() * 4, r() * 5), new THREE.Vector3(r() * 8, r() * 8, r() * 8), .12);
    }
    fx.smoke(at.clone().setY(at.y + .6), 3);
    return;
  } else {
    char(obj); obj.scale.y *= .35; // burnt and collapsed
  }
  if (type !== 'wallturret') for (let i = 0; i < 10; i++) debris.chunk(at.clone().setY(1), rubble(obj.userData.rubble ?? RUBBLE[type] ?? 0x5a5c56), .15 + Math.random() * .25, 3);
  fx.scorch(at, type === 'turret' ? 3.2 : 4);
  fx.smoke(at.clone().setY(1), 7);
}

// step(name): the loading bar's progress (loading.js); awaited between the big parts so the page can paint.
export async function createWorld(renderer, stage, step = async () => {}) {
  await step('ground');
  const scene = new THREE.Scene();
  const mood = navParams.get('mood') === 'off' ? null : stage.mood ?? null; // stage 4: a damp, dim, yellow-green haze (fog and background alike, dimmer lights; the colour grade is in main.js)
  scene.background = new THREE.Color(mood?.background ?? (mood?.fog ? mood.fog.color : BG));
  scene.fog = null; // (no fog on any stage: it made no visible difference and costs shader work. Was: mood.fog ? FogExp2(mood.fog.color, mood.fog.density) : Fog(BG, 60, 130). The mood's fog colour still tints the background and the water's sky.)
  const sunShadows = !stage.lightning; // (stage 6, the storm: the sun casts no shadows; the only shadows are the lightning's own, lightning.js, on the frames of a flash)
  const light = setupLighting(scene, renderer, mood, sunShadows); WET_ENV = light.wetEnv; const envTexture = scene.environment, hemiBase = light.hemi.intensity; // (kept to put back: the lite look has neither)
  if (stage.theme === 'ruins') light.sun.color.set(0xfffbf4); // a whiter, less golden sun over the stone ruins
  const rand = rng(1988);

  const grid = stage.terrain, rows = grid.length, cols = grid[0].length, theme = stage.puddles ? { ...THEMES[stage.theme ?? 'jungle'], darkHighlights: true } : THEMES[stage.theme ?? 'jungle']; // (stage 6, the wet road: the lighter parts of the road's colour and texture are toned down)
  const CELL = stage.meta.cell * PX, W = cols * CELL, L = rows * CELL;
  // stage.extend: { r0, r1, cols, rows: [...] }: a land mass beyond the map's LEFT edge, over the rows r0..r1: rows[i][j] is the tile i rows below r0 and j columns out from the edge (j = 0 touches the map). Beyond it, in those rows, is forest.
  const EXT = stage.extend ? { ...stage.extend, z0: -L + stage.extend.r0 * CELL, z1: -L + (stage.extend.r1 + 1) * CELL, xMin: -W / 2 - stage.extend.cols * CELL } : null;
  LEVEL.halfWidth = W / 2; LEVEL.length = L; LEVEL.edgeMargin = stage.edgeMargin ?? 0; LEVEL.cameraRangeX = stage.cameraRangeX ?? 12; // (cameraRangeX: how far the camera follows the jeep sideways: the usual 80 m wide stage scrolls only +-12 m; a wide map sets its own, about half the width less the half-view of 28 m)
  const toWorld = (px, py) => new THREE.Vector3((px - stage.meta.width / 2) * PX, 0, (py - stage.meta.height) * PX);
  const cellCentre = (r, c) => new THREE.Vector3(-W / 2 + (c + .5) * CELL, 0, -L + (r + .5) * CELL);
  // Off the map, the nearest edge tile carries on (sea stays sea, jungle stays jungle).
  const wedgeCells = new Set(); // stage 6: empty corner cells the fortress fills with a diagonal wall piece: they count as building (filled in after the buildings are made)
  const tileRC = (r, c) => {
    if (wedgeCells.size && r >= 0 && r < rows && c >= 0 && c < cols && wedgeCells.has(r * cols + c)) return 'K';
    if (EXT && c < 0 && r >= EXT.r0 && r <= EXT.r1) return -c - 1 < EXT.cols ? EXT.rows[r - EXT.r0][-c - 1] : 'F'; // (beyond the left edge, in the extension's rows)
    const sr = Math.min(rows - 1, Math.max(0, r)), sc = Math.min(cols - 1, Math.max(0, c)), t = grid[sr][sc];
    return t === 'W' && (sr !== r || sc !== c) && theme.offMapWall ? theme.offMapWall : t; // walls don't carry on past the map edge (stage 1: jungle does)
  };
  const tileAt = (x, z) => tileRC(Math.floor((z + L) / CELL), Math.floor((x + W / 2) / CELL));
  const [MX, MY] = theme.margin ?? [16, 12]; // painted margin around the map, in cells
  const [padX, padY] = stage.meta.pad ?? [0, 0]; // (stage 3: its markings and water images reach this far, in NES px, past the map's edges)
  const WE = W + 2 * MX * CELL, LE = L + 2 * MY * CELL;

  // --- ground + water (with margins), and a plain floor beyond for the far distance ---
  const loadImage = url => url ? new Promise(res => { const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = url; }) : null;
  const overlay = await loadImage(stage.markings), waterMask = await loadImage(stage.waterMask); // (stage 3)
  const terrain = paintTerrain(grid, MX, MY, theme, null, EXT), detail = theme.pavement ? pavementDetail(rand, !!theme.darkHighlights) : detailTexture(rand);
  // Stage 5's airbase (stage.paved): the ground behind the wall is paved with stage 3's pavement look, and in front of the gate the dirt eases into it over a few metres. A mask (1 = paved) at 4 px a cell,
  // read by the ground's shader, which swaps the dirt's detail for the pavement's and pulls the colour to the paving's grey by that much. It only costs the pixels where the mask is set.
  let pave = null;
  if (stage.paved) {
    const P = stage.paved, K = 4, mw = (cols + 2 * MX) * K, mh = (rows + 2 * MY) * K, c = document.createElement('canvas'); c.width = mw; c.height = mh;
    const ctx = c.getContext('2d'), id = ctx.createImageData(mw, mh), sm = (a, b, v) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
    for (let py = 0; py < mh; py++) for (let px = 0; px < mw; px++) {
      const x = -W / 2 + ((px + .5) / K - MX) * CELL, z = -L + ((py + .5) / K - MY) * CELL;
      const hs = (a, b) => { const q = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return q - Math.floor(q); }, vn = (a, b) => { const ia = Math.floor(a), ib = Math.floor(b), fa = a - ia, fb = b - ib, u = fa * fa * (3 - 2 * fa), w = fb * fb * (3 - 2 * fb); return (hs(ia, ib) * (1 - u) + hs(ia + 1, ib) * u) * (1 - w) + (hs(ia, ib + 1) * (1 - u) + hs(ia + 1, ib + 1) * u) * w; };
      const wob = (vn(x * .55, z * .55) - .5) * 2.2 + (vn(x * 1.7 + 9, z * 1.7) - .5) * .8; // (the edge wanders: a ragged, uneven blend, not a smooth line)
      const v = z <= P.z0 ? 1 : (1 - sm(0, P.depth, z - P.z0 + wob)) * (1 - sm(P.half, P.half + P.fade, Math.abs(x - P.x) + wob));
      const i = (py * mw + px) * 4; id.data[i] = id.data[i + 1] = id.data[i + 2] = Math.round(v * 255); id.data[i + 3] = 255;
    }
    ctx.putImageData(id, 0, 0);
    const mask = new THREE.CanvasTexture(c); mask.generateMipmaps = false; mask.minFilter = mask.magFilter = THREE.LinearFilter; mask.wrapS = mask.wrapT = THREE.ClampToEdgeWrapping;
    let seed = 4177; pave = { mask, detail: pavementDetail(() => (seed = (seed * 16807) % 2147483647) / 2147483647) }; // (its own random numbers: the rest of the stage is unchanged)
  }
  // A crop of the markings image round (x, z), r metres each way, with where it lies in the ground's texture: so a cover can carry the very same stripes as the road under it.
  function markingCrop(x, z, r) {
    if (!overlay) return null;
    const k = overlay.width / (stage.meta.width + 2 * padX), mpp = PX / k, cx = x / mpp + overlay.width / 2, cy = (z + L + padY * PX) / mpp, rp = r / mpp, n = Math.ceil(rp * 2);
    const c = document.createElement('canvas'); c.width = c.height = n;
    c.getContext('2d').drawImage(overlay, cx - rp, cy - rp, rp * 2, rp * 2, 0, 0, n, n);
    const tex = new THREE.CanvasTexture(c); tex.generateMipmaps = false; tex.minFilter = THREE.LinearFilter;
    return { tex, rect: [(x - r) / WE + .5, (-(z + r) - L / 2) / LE + .5, 2 * r / WE, 2 * r / LE] };
  }
  const camoGaps = { value: Array.from({ length: 8 }, () => new THREE.Vector3()) };
  if (overlay) groundMarkings(overlay); // stage 3: road markings and quay stripes, crisp, just over the ground
  let waterPx = null; // stage 3: the mask's pixels
  if (waterMask) { // stage 3: the water's edge pixel by pixel (to the quays' stripes), not cell by cell
    const ctx = terrain.water.image.getContext('2d'), ox = MX * 8 - padX, oy = MY * 8 - padY, w = waterMask.width, h = waterMask.height;
    const mc = document.createElement('canvas'); mc.width = w; mc.height = h; mc.getContext('2d').drawImage(waterMask, 0, 0);
    const m = mc.getContext('2d').getImageData(0, 0, w, h).data, id = ctx.getImageData(ox, oy, w, h), px = id.data;
    for (let i = 0; i < px.length; i += 4) { px[i + 1] = m[i]; if (m[i]) px[i] = 255; } // cover; and deep right up to the quay (a naval port: no shelving shore)
    ctx.putImageData(id, ox, oy); terrain.water.needsUpdate = true;
    waterPx = { m, w, h };
  }
  const isWet = (x, z) => { const t = tileAt(x, z); return t === '~' || t === 'S'; }; // where the water mesh is drawn (stage 4's swamp counts)
  const waterAt = (x, z) => { // is there water here? (stage 3: to the pixel, so boats keep clear of the quays)
    if (waterPx) {
      const u = Math.floor(x / PX + stage.meta.width / 2 + padX), v = Math.floor(z / PX + stage.meta.height + padY);
      if (u >= 0 && v >= 0 && u < waterPx.w && v < waterPx.h) return waterPx.m[(v * waterPx.w + u) * 4] > 127;
    }
    return tileAt(x, z) === '~' || (stage.isSecretLevel && tileAt(x, z) === 'S' && !seaFrozen); // (the secret level's sea is 'S'; once it is frozen it is ice: not water, so nobody falls in or sinks, and nothing splashes)
  };
  // Is the ground solid here? Tiles, except along stage 3's quays: there the water's edge is known to the pixel, so a vehicle can
  // come right up to the stripe (the quay-edge tiles 'Q' and water tiles only block where there really is water).
  const SCRUB_SOFT = .5, EDGE = .2, EDGE_PAD = [[EDGE, 0], [-EDGE, 0], [0, EDGE], [0, -EDGE], [EDGE * .7, EDGE * .7], [-EDGE * .7, EDGE * .7], [EDGE * .7, -EDGE * .7], [-EDGE * .7, -EDGE * .7]];
  const pierBoatAt = (x, z) => { for (const f of pierBoatFoot) { const o = f.boat, a = o.rotation.y, dx = x - o.position.x, dz = z - o.position.z; if (Math.abs(dx) > f.hl + 4 || Math.abs(dz) > f.hl + 4) continue; const lx = dx * Math.cos(a) - dz * Math.sin(a), lz = dx * Math.sin(a) + dz * Math.cos(a); if (Math.abs(lx - f.cx) < f.hw + .3 && Math.abs(lz - f.cz) < f.hl + .3) return true; } return false; };
  const boatSolid = { fn: null }; // (gunboats.js: is a point inside a boat frozen in the ice? the player's jeep cannot drive through one)
  let seaFrozen = false; // the secret level: the sea has frozen over (after the helicopter lifts off the summit): the player's jeep can drive on it; foot soldiers, tanks and the rest still cannot
  let mtHeightAt = null; // the secret level: the snow mesh's slope (mountains.js), which everything standing on the open ground rises with
  const steepFor = (x, z) => { const e = .5; return Math.hypot(mtHeightAt(x + e, z) - mtHeightAt(x - e, z), mtHeightAt(x, z + e) - mtHeightAt(x, z - e)) > .85 * 2 * e; }; // (the secret level: a vehicle cannot climb a face steeper than about 40 degrees: the mountain's cliffs; the summit road's grade is far gentler)
  const solidAt = (x, z, noIce = false) => { // noIce: tanks and APCs, which cannot cross a frozen sea (the jeeps, the foot soldiers and the player can)
    const t = tileAt(x, z);
    if (waterMask && (t === '~' || t === 'Q')) {
      if (waterAt(x, z)) return true;
      for (const [dx, dz] of EDGE_PAD) if (waterAt(x + dx, z + dz)) return true; // (a little margin: water within EDGE m of the point counts)
      return false;
    }
    if (t === 'F') { // scrub: the woods' outer bushes are drawn well in from the cell's edge, so a cell blocks only its inner part where it borders open ground (the jeep can nose in among the outer bushes)
      const fx = (x + W / 2) / CELL, fz = (z + L) / CELL, c = Math.floor(fx), r = Math.floor(fz), u = (fx - c) * CELL, v = (fz - r) * CELL, S = EXT && z >= EXT.z0 && z <= EXT.z1 && x < -W / 2 + 10 ? SCRUB_SOFT + .25 : SCRUB_SOFT, open = (rr, cc) => tileRC(rr, cc) !== 'F' && !BLOCKING.has(tileRC(rr, cc));
      if ((u < S && open(r, c - 1)) || (u > CELL - S && open(r, c + 1)) || (v < S && open(r - 1, c)) || (v > CELL - S && open(r + 1, c))) return false;
      return true;
    }
    if (t === 'S' && stage.isSecretLevel) return !(seaFrozen && !noIce) && !pierList.some(pr => pr.deckAt(x, z) !== null); // (the sea here is not drivable: only a pier over it is)
    return BLOCKING.has(t);
  };
  const groundMat = new THREE.MeshStandardMaterial({ map: terrain.map, color: theme === THEMES.snow ? 0xa0a0a0 : 0xa8a8a8, roughness: 1, envMapIntensity: theme === THEMES.snow ? .3 : .4 });
  groundMat.onBeforeCompile = sh => { // multiply a fine tiling detail texture over the terrain colours
    sh.uniforms.detailMap = { value: detail };
    if (pave) { sh.uniforms.paveMask = { value: pave.mask }; sh.uniforms.paveMap = { value: pave.detail }; }
    sh.uniforms.detailRepeat = { value: new THREE.Vector2(WE / 6, LE / 6) }; // one detail tile per 6 m
    // Two samples of the same tile, the second rotated ~37 degrees and scaled to a ~14 m period.
    // Their sum never lines up the same way twice, which hides the tiling grid.
    // Stage 1 (the sand): the first sample is also "de-tiled". A slow noise picks which of two random shifts of the tile each spot shows and blends between them (the tile's
    // contrast kept in the blend), so the pebbles and speckles no longer come back at the same distance in a regular grid.
    const detile = theme === THEMES.jungle;
    sh.fragmentShader = 'uniform sampler2D detailMap;\nuniform vec2 detailRepeat;\n' + (pave ? 'uniform sampler2D paveMask, paveMap;\n' : '') + (detile ? `
float hash12( vec2 p ) { return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453 ); }
float vnoise2( vec2 p ) { vec2 i = floor( p ), f = fract( p ); f = f * f * ( 3.0 - 2.0 * f );
	return mix( mix( hash12( i ), hash12( i + vec2( 1.0, 0.0 ) ), f.x ), mix( hash12( i + vec2( 0.0, 1.0 ) ), hash12( i + vec2( 1.0, 1.0 ) ), f.x ), f.y ); }
vec2 shiftOf( float n ) { return vec2( hash12( vec2( n, 3.7 ) ), hash12( vec2( n, 9.1 ) ) ); }
` : '') + sh.fragmentShader.replace(
      '#include <map_fragment>', `#include <map_fragment>
	vec2 dp = vUv * detailRepeat;
	vec2 dq = mat2( 0.8, -0.6, 0.6, 0.8 ) * dp * 0.43 + vec2( 0.31, 0.17 );
	` + (detile ? `float kk = vnoise2( dp * 0.11 ) * 6.0 + vnoise2( dp * 0.37 + 11.0 ) * .8, ki = floor( kk ), kf = smoothstep( 0.3, 0.7, fract( kk ) );
	float d1a = texture2D( detailMap, dp + shiftOf( ki ) ).r, d1b = texture2D( detailMap, dp + shiftOf( ki + 1.0 ) ).r;
	float d1 = 0.5 + ( mix( d1a, d1b, kf ) - 0.5 ) / sqrt( kf * kf + ( 1.0 - kf ) * ( 1.0 - kf ) );
	float dsum = d1 + texture2D( detailMap, dq ).r;` : `float dsum = texture2D( detailMap, dp ).r + texture2D( detailMap, dq ).r;`) + `
	` + (pave ? `{ float pm = texture2D( paveMask, vUv ).r;
	  if ( pm > 0.003 ) { dsum = mix( dsum, texture2D( paveMap, dp ).r + texture2D( paveMap, dq ).r, pm ); diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.502, 0.502, 0.478 ) * 0.659, pm ); } }
	` : '') + `diffuseColor.rgb *= ${theme === THEMES.snow ? '1.0' : '1.0 + ( dsum - 1.0 ) * 1.3'};`); // (the snow has none of the detail texture's speckle: its look is the mountain skirt's, below)
    if (theme === THEMES.snow && navParams.get('snowfx') !== 'off') sh.fragmentShader = SNOW_GLSL + sh.fragmentShader.replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
	{ // the snow's relief: the mountain's own (snow-surface.js)
		normal = normalize( normal - snowTilt( vec3( dp.x * 6.0, 0.37, dp.y * 6.0 ), normal ) * ${SNOW_TILT.toFixed(3)} );
	}`)
	.replace('#include <color_fragment>', `#include <color_fragment>
	diffuseColor.rgb *= snowShade( vec3( dp.x * 6.0, 0.37, dp.y * 6.0 ) ) * ${SNOW_GROUND_K.toFixed(3)}; // (the mountain snow's crust)${navParams.has('snowdbg') ? ' diffuseColor.rgb = vec3( 0.85, 0.1, 0.1 );' : ''}
	`)
	.replace('#include <emissivemap_fragment>', navParams.get('snowfx') === 'nosparkle' ? '#include <emissivemap_fragment>' : `#include <emissivemap_fragment>
	{ // sparkle: tiny glints (ice crystals) that flash as the view moves over them
		vec2 sc = floor( dp * 150.0 ); float hh = fract( sin( dot( sc, vec2( 127.1, 311.7 ) ) ) * 43758.5453 );
		float tw = fract( hh * 13.0 + dot( normalize( vViewPosition ), vec3( 5.3, 7.1, 0.0 ) ) );
		totalEmissiveRadiance += vec3( 0.85, 0.92, 1.0 ) * step( 0.996, hh ) * smoothstep( 0.7, 0.98, tw ) * 0.18;
	}`);
  };
  // The camouflaged guns' holes (camo-turrets.js): where one is open the ground, a fragment at a time, is not drawn inside its round opening (the mesh itself is untouched), so the
  // walls, floor and gun below show through by the ordinary depth test. camoHoles: (x, z, radius) each, radius 0 = shut. The lids use groundBase: the road's look without that.
  const vlsHoles = { value: Array.from({ length: 4 }, () => new THREE.Vector4()) }; // (the road launchers' open shafts, see mud-launchers.js: (x, z, half width, half depth) each, half width 0 = shut)
  const camoHoles = { value: Array.from({ length: 8 }, () => new THREE.Vector3()) }, groundBase = groundMat.onBeforeCompile;
  if (stage.entities.some(e => e.type === 'camoturret')) groundMat.onBeforeCompile = sh => { // (only a stage with such a gun: the other stages' ground shader is untouched)
    groundBase(sh);
    sh.uniforms.camoHoles = camoHoles; sh.uniforms.vlsHoles = vlsHoles;
    sh.vertexShader = 'varying vec2 vHoleXZ;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n\tvHoleXZ = ( modelMatrix * vec4( transformed, 1.0 ) ).xz;');
    sh.fragmentShader = 'varying vec2 vHoleXZ;\nuniform vec3 camoHoles[8];\nuniform vec4 vlsHoles[4];\n' + sh.fragmentShader.replace('#include <map_fragment>', `for ( int i = 0; i < 8; i ++ ) { vec3 h = camoHoles[ i ]; if ( h.z > 0.0 && length( vHoleXZ - h.xy ) < h.z ) discard; }
	for ( int i = 0; i < 4; i ++ ) { vec4 v = vlsHoles[ i ]; if ( v.z > 0.0 && abs( vHoleXZ.x - v.x ) < v.z && abs( vHoleXZ.y - v.y ) < v.w ) discard; }
#include <map_fragment>`);
  };
  // one vertex per cell corner, lowered under water so the sea and river have a sloping bed
  const COARSE = stage.coarseGround ? 6 : 1; // (stage 6: dead flat, so its ground is a coarse grid, one quad to 6 x 6 cells: the colours come from the texture, not the vertices)
  const groundGeo = new THREE.PlaneGeometry(WE, LE, Math.ceil(terrain.ec / COARSE), Math.ceil(terrain.er / COARSE)), gp = groundGeo.attributes.position;
  const cellDepth = (r, c) => terrain.depthCells[Math.min(terrain.er - 1, Math.max(0, r)) * terrain.ec + Math.min(terrain.ec - 1, Math.max(0, c))];
  const heights = terraceHeights(); // stage 2's raised terraces (visual only; stage 4's cliffs are their own mesh, cliffs.js)
  if (!stage.coarseGround) for (let iy = 0, n = 0; iy <= terrain.er; iy++) for (let ix = 0; ix <= terrain.ec; ix++, n++) {
    const d = (cellDepth(iy - 1, ix - 1) + cellDepth(iy - 1, ix) + cellDepth(iy, ix - 1) + cellDepth(iy, ix)) / 4;
    let z = -(theme === THEMES.mountain ? Math.min(1, d * 3.5) * SWAMP_DEPTH : d * WATER_DEPTH) + heights[n];
    if (waterMask) { // stage 3: a naval port. The quays drop straight into deep water: the bed is at full
      // depth wherever there's only water round it; at the quays the ground sits just under the water's
      // level, so the exact (per-pixel) shoreline is the water's own edge, never the ground poking through
      const r = iy - MY, c = ix - MX;
      let open = true, wet = false;
      for (let a = r - 3; a <= r + 2 && open; a++) for (let b = c - 3; b <= c + 2; b++) { if (tileRC(a, b) !== '~') { open = false; break; } }
      for (const [a, b] of [[r - 1, c - 1], [r - 1, c], [r, c - 1], [r, c]]) { const t = tileRC(a, b); if (t === '~' || t === 'Q') wet = true; }
      z = open ? -WATER_DEPTH : wet ? -.08 : z;
    }
    gp.setZ(n, z);
    if (theme === THEMES.mountain) heights[n] -= Math.min(1, d * 3.5) * SWAMP_DEPTH; // stage 4: heightAt (what the jeep, the enemies and everything else stands on) follows the bed too: they wade into the mud instead of riding on the surface
  }

  // Height of the drawn ground at each cell corner (same layout as the ground mesh's vertices).
  // A corner is raised when all four cells round it are terrace ('P' / 'E'), so the step down
  // falls inside the edge cells, which block anyway; on a ramp it follows the slope across the ramp.
  function terraceHeights() {
    const out = new Float32Array((terrain.ec + 1) * (terrain.er + 1));
    const raised = ch => ch === 'P' || ch === 'E';
    const ramps = regions(grid, '^').map(b => {
      const mid = Math.floor((b.r0 + b.r1) / 2), east = tileRC(mid, b.c1 + 1);
      return { ...b, x0: -W / 2 + b.c0 * CELL, x1: -W / 2 + (b.c1 + 1) * CELL, highEast: raised(east) };
    });
    const rampAt = (r, c) => ramps.find(b => r >= b.r0 - 1 && r <= b.r1 + 1 && c >= b.c0 && c <= b.c1);
    for (let iy = 0, n = 0; iy <= terrain.er; iy++) for (let ix = 0; ix <= terrain.ec; ix++, n++) {
      const cells = [[iy - 1, ix - 1], [iy - 1, ix], [iy, ix - 1], [iy, ix]].map(([r, c]) => [r - MY, c - MX]);
      const ramp = cells.map(([r, c]) => tileRC(r, c) === '^' && rampAt(r, c)).find(Boolean);
      if (ramp) {
        const x = -WE / 2 + ix * CELL, t = Math.min(1, Math.max(0, (x - ramp.x0) / (ramp.x1 - ramp.x0)));
        out[n] = TERRACE_H * (ramp.highEast ? t : 1 - t);
      } else if (cells.every(([r, c]) => raised(tileRC(r, c)))) out[n] = TERRACE_H;
    }
    return out;
  }
  // Height of the drawn ground under (x, z): what things standing there are lifted by.
  let chasmSurface = null, chasmHaze = null, chasmGroup = null; // stage 5: the chasm's own surface (chasm.js): what falls into it comes to rest there, not in mid-air over the drop
  let forestShadow = null; let forestStats = null; let forestUpdate = null; // shows only the blocks of trees near the player (forest.js)
  const pierBoatFoot = []; // the footprints of the boats moored at the piers (measured on the model): once the sea is frozen the jeep cannot drive through one, afloat or wrecked
  const mooredBoats = []; // the boats moored at the piers: they rock on the water (see update)
  const pierList = []; // wooden piers (pier.js): the deck's height under them is the ground's height there
  let mtGroup = null, mtCast = [], terrainShadowOff = false, mtHid = false; const mtFrustum = new THREE.Frustum(), mtPM = new THREE.Matrix4();
  const mtTopCull = () => { // (up on the second plateau, north of z -403.9: the whole ascent, the snow mesh's blocks south of the plateau's edge, is not drawn: nothing of it can be seen from up there)
    if (!mtGroup) return; if (!terrainShadowOff) { if (mtHid) { for (const o of mtGroup.children) o.visible = true; mtHid = false; } return; }
    for (const o of mtGroup.children) { o.geometry.boundingBox ?? o.geometry.computeBoundingBox(); o.visible = o.geometry.boundingBox.min.z < -388; } mtHid = true;
  };
  let mtShadow = null; // (the mountains' coarse shadow-pass copy: shown only while the shadow map is drawn)
  let mountainFog = null; // (the summit mist's uniforms: main.js)
  const groundTrail = stage.isSecretLevel ? new GroundTrail(renderer, { x0: -W / 2 - 20, x1: W / 2 + 20, z0: -L - 20, z1: 20 }) : null; if (groundTrail) { if (navParams.has('gtlife')) groundTrail.life = +navParams.get('gtlife'); groundTrail.flip = navParams.has('gtflip'); /* (the tracks' height, which way up: default is the first way; ?gtflip is the other) */ groundTrail.debug = navParams.has('gtdebug'); groundTrail.berm = navParams.has('gtberm') ? +navParams.get('gtberm') : .03; } // (?gtflip: the tracks' height the other way up: to tell a groove from a ridge by the light) // (the secret level: tracks that last, drawn by the jeep's wheels)
  if (theme === THEMES.snow && navParams.get('mt') !== 'off') { const mt = buildMountains({ groundTrail, area: { x0: -W / 2 - 80, x1: WE / 2 + 2, z0: -L - MY * CELL, z1: MY * CELL }, isRock: (x, z) => tileAt(x, z) === 'X', isWater: (x, z) => tileAt(x, z) === 'S', coarse: !navParams.has('nocoarse'), trails: (stage.trails ?? []).map(t => t.map(([c, r, w, wp]) => [-W / 2 + (c + .5) * CELL, -L + (r + .5) * CELL, w ?? 1, wp ?? 1])), debug: navParams.has('snowdbg'), ...stage.mountains, cast: navParams.get('mtshadow') !== 'off' && (navParams.get('mtshadow') === 'on' || !!stage.mountains?.cast), }); mt.group.userData.noWater = true; /* (kept out of the water's reflection and see-through views: it is the land, and it was drawn three times over) */ scene.add(mt.group); mtHeightAt = mt.heightAt; mountainFog = mt.fog; mtShadow = mt.proxy; mtGroup = mt.group; mtCast = mt.group.children.filter(o => o.castShadow); scene.add(mt.proxy); } // the secret level's snow mountains (mountains.js; visual only, the 'X' cells block)
  function heightAt(x, z, flat = false) { // flat: the shots' reference (they fly over a chasm level, not down into it)
    const fx = (x + WE / 2) / CELL, fy = (z + L + MY * CELL) / CELL, n1 = terrain.ec + 1;
    const ix = Math.min(terrain.ec - 1, Math.max(0, Math.floor(fx))), iy = Math.min(terrain.er - 1, Math.max(0, Math.floor(fy)));
    const tx = Math.min(1, Math.max(0, fx - ix)), ty = Math.min(1, Math.max(0, fy - iy));
    const h = (a, b) => heights[b * n1 + a];
    let base = (h(ix, iy) * (1 - tx) + h(ix + 1, iy) * tx) * (1 - ty) + (h(ix, iy + 1) * (1 - tx) + h(ix + 1, iy + 1) * tx) * ty + (mtHeightAt ? mtHeightAt(x, z) : 0);
    if (seaFrozen && base < 0 && stage.isSecretLevel && tileAt(x, z) === 'S') base = 0; // (a frozen sea: whatever stands on it stands on the ice, at the water's level, not down on the sea bed)
    for (const pr of pierList) { const dh = pr.deckAt(x, z); if (dh !== null && dh > base) base = dh; } // (on a pier: the deck)
    if (flat && chasmSurface) { const t = tileAt(x, z); if (t === 'Y' || t === 'y') return base + RAIL_LIFT; } // (a shot is drawn lifted over a bridge's parapet, so it glides over the rail instead of through it: see lift.js)
    return chasmSurface && !flat && tileAt(x, z) === 'V' ? Math.min(base, chasmSurface(x, z)) : base; // (over a chasm cell: down at the chasm's surface; the bridge's cells stay at the deck)
  }
  let seaOff = false;
  let groundIndexFor = () => {}; // (set below on the secret level: swaps the ground's index between the whole sea bed and the land only)
  if (mtHeightAt) { // the secret level: the snow mesh (mountains.js) is the ground over the land, so the ground's own quads there are not drawn (only the last couple of metres at the shore, the sea bed and the margins beyond the mesh)
    const gx = Math.ceil(terrain.ec / COARSE), gy = Math.ceil(terrain.er / COARSE), g1 = gx + 1, keep = [], R = 1, mx0 = -W / 2 - 77, mx1 = WE / 2 - 1, mz0 = -L - MY * CELL + 3, mz1 = MY * CELL - 3;
    for (let iy = 0; iy <= gy; iy++) for (let ix = 0; ix <= gx; ix++) { // (the ground's land vertices drop out of sight under the snow mesh: the strip of ground kept at the shore must not poke up through it)
      let land = true; for (const [a, b] of [[-1, -1], [-1, 0], [0, -1], [0, 0]]) if (tileRC(iy - MY + a, ix - MX + b) === 'S') { land = false; break; }
      if (land) { const n = ix + g1 * iy; gp.setZ(n, gp.getZ(n) - .3); }
    }
    const merged = new Set(); // the sea bed lies under the water, nobody sees its shape: wherever it is nearly level and well under, 16 x 16, 8 x 8 or 4 x 4 cells of it are just two triangles
    for (const N of [16, 8, 4]) for (let by = 0; by + N <= gy; by += N) for (let bx = 0; bx + N <= gx; bx += N) {
      if (merged.has(by * gx + bx)) continue; // (inside a bigger block already)
      let lo = Infinity, hi = -Infinity; for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) { const z = gp.getZ(bx + i + g1 * (by + j)); if (z < lo) lo = z; if (z > hi) hi = z; }
      if (hi > -.6 || hi - lo > .15) continue;
      const a = bx + g1 * by, b = bx + g1 * (by + N), c = bx + N + g1 * (by + N), d = bx + N + g1 * by; keep.push(a, b, d, b, c, d);
      for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) merged.add((by + j) * gx + bx + i);
    }
    for (let iy = 0; iy < gy; iy++) for (let ix = 0; ix < gx; ix++) {
      if (merged.has(iy * gx + ix)) continue;
      const x = -WE / 2 + (ix + .5) * CELL, z = -L - MY * CELL + (iy + .5) * CELL; let drop = x > mx0 && x < mx1 && z > mz0 && z < mz1;
      for (let a = -R; drop && a <= R; a++) for (let b = -R; b <= R; b++) if (tileRC(iy - MY + a, ix - MX + b) === 'S') { drop = false; break; }
      if (drop) continue;
      const a = ix + g1 * iy, b = ix + g1 * (iy + 1), c = ix + 1 + g1 * (iy + 1), d = ix + 1 + g1 * iy; keep.push(a, b, d, b, c, d);
    }
    groundGeo.setIndex(keep);
    const keepFrozen = []; // the ground as it is with the sea frozen: the sea's quads are left out (the ice is opaque and covers them); the shore's strip, which lies on land cells, stays
    for (let t = 0; t < keep.length; t += 3) { const n0 = keep[t], n1 = keep[t + 1], n2 = keep[t + 2], ix = Math.floor((n0 % g1 + n1 % g1 + n2 % g1) / 3), iy = Math.floor((Math.floor(n0 / g1) + Math.floor(n1 / g1) + Math.floor(n2 / g1)) / 3); if (tileRC(iy - MY, ix - MX) !== 'S') keepFrozen.push(n0, n1, n2); }
    const idxAll = new THREE.BufferAttribute(new Uint32Array(keep), 1), idxFrozen = new THREE.BufferAttribute(new Uint32Array(keepFrozen), 1);
    groundIndexFor = on => groundGeo.setIndex(on ? idxFrozen : idxAll);
  }
  groundGeo.computeVertexNormals();
  // Stage 6: how high a building's roof is over a cell (0 off the buildings): the fortress blocks 6.5 m, the old office blocks 7.5 m. Wreckage comes to rest on it, shots and grenades stop below it.
  const roofAt = (x, z) => { // (the laser maze's walls, stage 3: 4.8 m with their coping)
    if (!stage.grenadesHitBuildings) return 0;
    const t = tileAt(x, z);
    return t === 'L' ? 4.8 : t !== 'K' ? 0 : Math.floor((z + L) / CELL) >= (stage.fortressFromRow ?? Infinity) ? 6.5 : 7.5;
  };
  const debrisGround = (x, z) => heightAt(x, z) + roofAt(x, z);
  const groundUv = (x, z) => [x / WE + .5, (-z - L / 2) / LE + .5]; // where a spot in the world lies in the ground's texture (for covers that must look exactly like the road)
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.rotation.x = -Math.PI / 2; ground.position.z = -L / 2; ground.receiveShadow = true; scene.add(ground);
  window.__groundShadow = on => { ground.receiveShadow = !!on; groundMat.needsUpdate = true; const list = []; const bb = new THREE.Box3(), sz = new THREE.Vector3(); scene.traverse(o => { if (!o.isMesh || o === ground || !o.geometry) return; bb.setFromObject(o); bb.getSize(sz); if (sz.y < .4 && sz.x * sz.z > 300) { o.receiveShadow = !!on; (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => { m.needsUpdate = true; }); list.push((o.name || o.type) + ' ' + sz.x.toFixed(0) + 'x' + sz.z.toFixed(0)); } }); console.log('shadows on the road:', !!on, '| other big flat surfaces switched too:', list.length, list.slice(0, 12)); }; // (a debugging test: __groundShadow(false) in the console switches the shadows on the road and on every other big flat surface off, to see what they cost; the shaders rebuild once, so a hitch)
  const outer = new THREE.Mesh(new THREE.PlaneGeometry(W + 240, L + 240), new THREE.MeshStandardMaterial({ color: theme.outer, roughness: 1 }));
  outer.rotation.x = -Math.PI / 2; outer.position.set(0, -WATER_DEPTH - .5, -L / 2); outer.receiveShadow = true; scene.add(outer); // below the deepest bed
  const water = createWater(renderer, terrain.water, WE, LE, theme === THEMES.mountain);
  if (mood?.fog) water.setSky(mood.fog.color);
  if (groundTrail) water.setTrails(groundTrail); // (the tracks show in the snow on the ice)
  water.setReflectAll(navParams.get('icerefl') !== 'off'); // (?icerefl=off: the ice mirrors only what the water mirrors)
  water.setReflectHide([ground, outer]); const bigCache = new WeakMap(), hiddenBig = []; // the frozen sea: the see-through view under the ice must not draw the sea bed, nor anything else the size of the map (the ground, the far floor, whatever else was laid under the sea): every top-level thing over 90 m across is left out of it, found once and remembered
  water.hooks.before = () => {
    ground.visible = false; outer.visible = false;
    for (const o of scene.children) {
      if (o === water.mesh || !o.visible) continue;
      let big = bigCache.get(o); if (big === undefined) { const b = new THREE.Box3().setFromObject(o); big = !b.isEmpty() && Math.max(b.max.x - b.min.x, b.max.z - b.min.z) > 90; bigCache.set(o, big); }
      if (big) { o.visible = false; hiddenBig.push(o); }
    }
  };
  water.hooks.after = () => { ground.visible = true; outer.visible = true; for (const o of hiddenBig) o.visible = true; hiddenBig.length = 0; }; // (the frozen sea: the mirror leaves the ground out, and the see-through view under the ice does not draw the sea bed at all)
  water.setClouds(mood?.sky === 'partly');
  if (mood?.waterColors) water.setWaterColors(...mood.waterColors); // (the sea's own colours: shallow, deep)
  if (mood?.waterSpec !== undefined) water.setSpec(mood.waterSpec); // (less sun glitter on a dull day)
  if (stage.isSecretLevel && navParams.get('ice') === 'on') { water.setIce(1); seaFrozen = true; groundIndexFor(true); } // (open water until the helicopter lifts off the summit; ?ice=on: the sea frozen from the start, to work on it)
  if (mood?.sunOffset) water.setSun(...mood.sunOffset); // (the sea's glitter follows the sun)
  if (stage.surf) { water.setSurf(true); water.setWL(WE, LE); } // (swell breaking on the shore)
  if (mood?.skyColors) water.setSkyColors(...mood.skyColors); // (the sky the sea mirrors)
  let grassLife = null, swampMist = null, swampTrees = null, swampWet = () => false; // swampWet(x, z): is that point on the swamp's water as it is drawn (the water mask, not the tiles)?
  const minesW = (stage.mines ?? []).map(m => { const q = toWorld(m.x, m.y); return { x: q.x, z: q.z, keep: !!stage.minesPermanent, small: !!stage.minesSmall }; }), mineSignsW = (stage.mineSigns ?? []).map(m => { const q = toWorld(m.x, m.y); return { x: q.x, z: q.z }; }); // stage 4: the land mines' spots (world metres)
  const rails = theme === THEMES.mountain && stage.rails ? railPaths(stage, toWorld, tileAt) : []; // stage 4: the railway's centre lines (the scatter keeps off its bed)
  if (theme === THEMES.mountain || theme.valley) grassLife = buildGrassScatter(scene, { area: { x0: -W / 2 - 14, x1: W / 2 + 14, z0: -L, z1: 0 }, // (14 m past each side of the map too: the camera sees that far, and the flowers and tufts must not stop at the map's edge)
     tileAt, heightAt, off: navParams.get('grassoff') ?? '', noFlowers: stage.noFlowers ?? [], mines: minesW, patches: stage.flowerPatches ?? [], thin: stage.scatterThin ?? [], skip: rails.length ? nearRail(rails) : null, dry: !!theme.dry }); // stage 4: tufts and stones over the meadow
  if (theme === THEMES.mountain) { // stage 4: ground mist over the swamp's extent
    const b = { x0: 1e9, x1: -1e9, z0: 1e9, z1: -1e9 };
    for (let z = -L; z < 0; z += CELL) for (let x = -W / 2; x < W / 2; x += CELL) if (tileAt(x, z) === 'S') { b.x0 = Math.min(b.x0, x); b.x1 = Math.max(b.x1, x + CELL); b.z0 = Math.min(b.z0, z); b.z1 = Math.max(b.z1, z + CELL); }
    const cv = terrain.water.image, wmask = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
    swampWet = (x, z, margin = 3) => { // (margin: px of water needed all round it, so a point is never at the very edge)
      const px = Math.round((x / WE + .5) * cv.width - .5), py = Math.round(((z + L / 2) / LE + .5) * cv.height - .5);
      for (const [dx, dy] of [[0, 0], [margin, 0], [-margin, 0], [0, margin], [0, -margin]]) {
        const u = px + dx, v = py + dy; if (u < 0 || v < 0 || u >= cv.width || v >= cv.height || wmask[(v * cv.width + u) * 4 + 1] < 128) return false;
      }
      return true;
    };
    if (b.x1 > b.x0) { swampMist = buildSwampMist(scene, b, { tex: terrain.water, WE, LE, L }, mood?.fog?.color); buildSwampShore(scene, b, { tex: terrain.water, WE, LE, L, heightAt });
      const st = stage.entities.find(e => e.type === 'start'), sp = st ? toWorld(st.x, st.y) : null; // (cypresses stand in the water; none on top of the start)
      swampTrees = buildSwampTrees(scene, { bounds: b, wet: swampWet, avoid: sp ? [{ x: sp.x, z: sp.z, r: 14 }] : [] });
      buildSwampPlants(scene, { bounds: b, wet: swampWet, boxes: swampTrees.boxes }); } // (lily pads, duckweed, lotus and cattails on the water; reeds and debris along the shore)
  }
  water.mesh.position.set(0, theme === THEMES.mountain ? .01 : .03, -L / 2); scene.add(water.mesh); if (navParams.has('nowater')) water.mesh.userData.hidden = true; // (?nowater: a look at what lies under the sea) // (stage 4: level with the land's edge: a lower surface left a dark strip of bank standing out of it)
  let trainRig = null; // stage 4's train and the line it runs on, for TrainRide
  let cliffU = null; // (the cliff shader's uniforms: the railway's tunnel is cut into the rock through them)
  let cliffHeightAt = () => 0; // stage 4: how high the rock stands under a point (the ground's own heightAt does not include it)
  let bushCull = null; // (scrub.js: which bushes cast shadows this frame)
  if (theme.valley) { // stage 5: the chasms' cut-out in the ground, the bridges over them, the scrub woods (the cliffs below do the plateaus)
    const area = { x0: -WE / 2 - 3, x1: WE / 2 + 3, z0: -L - MY * CELL, z1: MY * CELL }; // (just wider than the painted ground, which ends 20 m past the map: a chasm that meets the map edge runs on to there, so its end is never seen)
    const edgeX = x => x; // (tileAt clamps to the map's edge tile itself, except in the left extension's rows)
    const chasm = buildChasm({ area, isChasm: (x, z) => 'VGY'.includes(tileAt(edgeX(x), z)), avoid: (x, z) => [-3, 0, 3].some(dx => [-4, 0, 4].some(dz => 'GgYy'.includes(tileAt(edgeX(x + dx), z + dz)))), ...stage.chasm });
    if (chasm) {
      if (navParams.get('tune') !== null) { // ?tune=1: sliders for the rim's lift (a tuning aid)
        const box = document.createElement('div'); box.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:99;background:rgba(0,0,0,.65);color:#fff;font:12px sans-serif;padding:8px 10px;border-radius:6px';
        for (const [key, label, min, max] of [['uNorthLift', 'north rim lift', -1, 1], ['uSouthLift', 'south rim lift', -1, 1], ['uSideLift', 'east/west walls lift', -1, 1]]) {
          const row = document.createElement('div'), out = document.createElement('span'), inp = document.createElement('input'); inp.type = 'range'; inp.min = min; inp.max = max; inp.step = .01; inp.value = chasm.uniforms[key].value; inp.style.cssText = 'width:200px;vertical-align:middle';
          const show = () => { out.textContent = ` ${label}: ${(+inp.value).toFixed(2)}`; }; inp.oninput = () => { chasm.uniforms[key].value = +inp.value; show(); }; show(); row.append(inp, out); box.append(row);
        }
        document.body.append(box);
      }
      chasm.uniforms.uGMap.value = terrain.map; chasm.uniforms.uGUv.value.set(1 / WE, -1 / LE, .5, .5 - L / (2 * LE));
      Object.assign(chasm.uniforms.uDetail, { value: detail }); chasm.uniforms.uDetailOn.value = 1; chasm.uniforms.uDetailK.value.set(1 / 6, -1 / 6, WE / 12, (LE - L) / 12); // (the rim's dirt wears the ground's own detail, in the same place)
      outer.material = new THREE.MeshBasicMaterial({ color: chasm.uniforms.uHaze.value, fog: false }); // (the plane far below is the haze's own colour, unlit: any crack in the chasm's floor shows the haze, not a lit patch)
      chasmGroup = chasm.group; chasmSurface = chasm.surfaceAt; chasmHaze = chasm.uniforms; // (chasmHaze: the haze's colour and depths, for what falls into the chasm)
      scene.add(chasm.group); outer.position.y = -chasm.depth - 1.5; // (the plain floor far below, under the chasms' own)
      const groundSh0 = groundMat.onBeforeCompile; groundMat.onBeforeCompile = sh => { groundSh0(sh); chasm.patchGround(sh); };
      regions(grid, 'G').forEach((b, i) => buildBridge(scene, { x0: -W / 2 + b.c0 * CELL, x1: -W / 2 + (b.c1 + 1) * CELL, zN: -L + b.r0 * CELL, zS: -L + (b.r1 + 1) * CELL, cell: CELL, ext: (stage.bridgeExt ?? 2) * CELL, depth: chasm.depth, seed: i + 1, haze: chasm.uniforms }));
    }
    { // the dirt is not one colour: patches of pale dried dust where it lies undisturbed, shading through the plain earth to dark, packed, damp soil and mud
      // (as one function, shared with the chasm's rim: the rim's dirt has to be coloured exactly as the ground beside it)
      const DUST = `uniform float uDustSkip;
float sh5h( vec2 p ) { return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453 ); }
float sh5n( vec2 p ) { vec2 i = floor( p ), f = fract( p ); f = f * f * ( 3.0 - 2.0 * f ); return mix( mix( sh5h( i ), sh5h( i + vec2( 1.0, 0.0 ) ), f.x ), mix( sh5h( i + vec2( 0.0, 1.0 ) ), sh5h( i + vec2( 1.0, 1.0 ) ), f.x ), f.y ); }
float sh5f( vec2 p ) { return sh5n( p ) * 0.55 + sh5n( p * 2.07 + 7.3 ) * 0.3 + sh5n( p * 4.3 + 1.9 ) * 0.15; }
vec3 shDust( vec3 c, vec2 dp, float keep ) { // keep: 1 = the full patches, 0 = none (the ground by a chasm and the rim's dirt: no dark or pale patch is left at the very edge)
	if ( uDustSkip > 0.5 ) return c;
	float zv = sh5f( dp * 0.16 + 3.1 ) * 0.72 + sh5f( dp * 0.55 ) * 0.28;
	float dust = smoothstep( 0.52, 0.68, zv ) * keep, mud = ( 1.0 - smoothstep( 0.30, 0.44, zv ) ) * keep;
	float grain = sh5n( dp * 9.0 ) * 0.5 + 0.5;
	c = mix( c, c * vec3( 1.2, 1.2, 1.24 ) + vec3( 0.035, 0.03, 0.02 ), dust * ( 0.75 + 0.25 * grain ) ); // pale, dry, a little dusty
	c *= mix( vec3( 1.0 ), vec3( 0.72, 0.68, 0.66 ) * ( 0.92 + 0.16 * grain ), mud ); // dark, packed and damp
	return c;
}`;
      chasm.ground.glsl = DUST;
      const groundSh1 = groundMat.onBeforeCompile;
      groundMat.onBeforeCompile = sh => {
        groundSh1(sh);
        sh.uniforms.uDustSkip = chasm.uniforms.uDustSkip;
        sh.fragmentShader = sh.fragmentShader.replace('void main() {', `${DUST}
void main() {`).replace('diffuseColor.rgb *= 1.0 + ( dsum - 1.0 ) * 1.3;', `diffuseColor.rgb *= 1.0 + ( dsum - 1.0 ) * 1.3;
	diffuseColor.rgb = shDust( diffuseColor.rgb, dp, 1.0 - smoothstep( -4.0, -0.5, chasmD ) );`);
      };
    }
    { // stage 5's wire fences and their steel gates (the cells 'N' and 'n': see fences.js)
      const run = b => ({ x0: -W / 2 + b.c0 * CELL - (b.c0 === 0 ? 14 : 0), x1: -W / 2 + (b.c1 + 1) * CELL + (b.c1 === grid[0].length - 1 ? 14 : 0), z: -L + (b.r0 + b.r1 + 1) / 2 * CELL });
      buildFences(scene, { fences: regions(grid, 'N').map(run), gates: regions(grid, 'n').map(run), heightAt });
    }
    bushCull = buildScrub(scene, { area: { x0: -W / 2 - (EXT ? EXT.cols * CELL + 8 : 14), x1: W / 2 + 14, z0: -L, z1: 12 }, isScrub: (x, z) => tileAt(x, Math.min(z, -.01)) === 'F' && (x >= -W / 2 - 14 || (EXT && z >= EXT.z0 && z <= EXT.z1)), // (left of the map only in the secret land's rows: nowhere else is it ever seen) // (z1 12: the woods run on 12 m past the map's south edge, as the last row of scrub does)
     heightAt, off: navParams.get('grassoff') ?? '', clear: stage.entities.filter(e => e.type === 'camoturret').map(e => ({ ...toWorld(e.x, e.y), r: 4 }))  }).cull ?? null;
  }
  if (theme === THEMES.mountain || theme.valley) { const cl = buildCliffs({ area: theme.valley ? { x0: -WE / 2 + 4, x1: W / 2 + 16 * CELL - 7, z0: -L - MY * CELL, z1: MY * CELL } : { x0: -WE / 2, x1: WE / 2, z0: -L - MY * CELL, z1: MY * CELL }, isCliff: theme.valley ? (x, z) => x > (EXT && z >= EXT.z0 && z <= EXT.z1 ? -WE / 2 + 6 : -W / 2 - 16 * CELL + 6) && x < W / 2 + 16 * CELL - 6 && tileAt(x, z) === 'X' : // (the usual 16-cell margin's reach: the plateau runs on past the map's side only as far as it always did, though the painted margin is wider on stage 5; only the left extension's rows reach further)
       // (the lattice is rounded up to whole tiles, so it ran well past the area on the east: the plateau now ends at the same distance on both sides)
       (x, z) => tileAt(x, z) === 'X', ...stage.cliff, off: navParams.get('cliffoff') }); scene.add(cl.group); cliffHeightAt = cl.heightAt; cliffU = cl.uniforms; const groundSh = groundMat.onBeforeCompile; groundMat.onBeforeCompile = sh => { groundSh(sh); cl.patchGround(sh); if (!theme.dry) patchGrass(sh, { WE, LE, off: navParams.get('grassoff') ?? '' }); }; groundMat.needsUpdate = true; if (import.meta.env.DEV) { window.cliffUniforms = cl.uniforms; window.cliffGroup = cl.group; } } // stage 4: the steep rock walls (visual; the cells block)
  if (rails.length) { // stage 4's railway (after the cliffs: its tunnel portal stands where the rock begins, and the rock is cut away inside its opening)
    const railway = buildRailway(scene, rails, { heightAt, cliffAt: cliffHeightAt }), portal = railway.userData.portal;
    if (stage.train && railway.userData.trackAt) { // the train (assets/train.js), hidden until it arrives (TrainRide, train-ride.js)
      const makeTrain = () => { const train = buildTrain(); train.children.forEach(car => { mergeStatic(car); dropTinyShadows(car); }); train.visible = false; scene.add(train); return train; }; // (it can be built again: a saved game from before it arrived, loaded after it had gone)
      trainRig = { train: makeTrain(), makeTrain, ...railway.userData, triggerZ: stage.train.triggerZ };
    }
    if (portal && cliffU) { cliffU.uTunO.value.set(portal.front.x, portal.front.z); cliffU.uTunD.value.set(portal.d.x, portal.d.z); cliffU.uTun.value.set(portal.radius, portal.spring, portal.y0, portal.length); }
  }

  await step('jungle');
  // --- jungle: low-poly canopies, extending past the map edges, in 20 m bands ---
  // Each band is its own instanced mesh with a bounding sphere around its trees, so bands off
  // screen (or outside the shadow / reflection views) are skipped. r128 would otherwise cull an
  // instanced mesh by its base geometry alone, which is why it can't be one big mesh.
  // Canopies next to a compound wall shrink (or are skipped) so they never poke through it.
  const wallBoxes = computeWallBoxes();
  const PALM = navParams.get('canopy') !== 'cloud'; // the jungle is drawn as palm trees (below); ?canopy=cloud brings back the old low-poly cloud canopies
  const BAND = 20, bands = new Map();
  const UNSEEN_X = 50, UNSEEN_Z = 12, UNSEEN_S = 16; let culled = 0; // m: further than this from the middle of the map sideways (the camera sits within 12 m of it and shows ~32 m each way on 16:9), beyond its northern end, or past its southern one is never seen
  // Thinned so canopies don't pile up on each other (every pixel of the jungle used to be drawn 3-4 times over): a candidate
  // is dropped if it'd sit within OVERLAP of its sizes of one already placed, so each spot is covered about twice.
  const OVERLAP = .95, HASH = 5, placed = new Map();
  const hashKey = (x, z) => Math.floor(x / HASH) + ',' + Math.floor(z / HASH);
  for (let r = -MY; r < rows + MY; r++) for (let c = -MX; c < cols + MX; c++) {
    if (tileRC(r, c) !== 'T' || rand() > .9) continue;
    const p = cellCentre(r, c).add(new THREE.Vector3((rand() - .5) * CELL, 0, (rand() - .5) * CELL));
    let size = (1.5 + rand() * .9) * (PALM ? 1.5 : 1); // (palms at full size: about 5 m apart, like the map's own)
    for (const w of wallBoxes) {
      const d = Math.hypot(Math.max(Math.abs(p.x - w.x) - w.hw - .06, 0), Math.max(Math.abs(p.z - w.z) - w.hd - .06, 0));
      size = Math.min(size, d - .05);
    }
    if (size < .6) continue;
    // Stage 1: nothing is planted where the camera can never see: the camera follows the jeep within 12 m of the middle and shows about 32 m each way (16:9; a wider
    // screen shows more), so the jungle much further out than that, past the map's edges (the map is 40 m either side of the middle), is never on screen.
    if (theme === THEMES.jungle && (Math.abs(p.x) > UNSEEN_X || p.z < -L - UNSEEN_Z || p.z > UNSEEN_S)) { culled++; continue; }
    let crowded = false;
    for (let gx = -1; gx <= 1 && !crowded; gx++) for (let gz = -1; gz <= 1 && !crowded; gz++)
      for (const o of placed.get(hashKey(p.x + gx * HASH, p.z + gz * HASH)) ?? []) if (Math.hypot(o.x - p.x, o.z - p.z) < (o.size + size) * OVERLAP) { crowded = true; break; }
    if (crowded) continue;
    p.size = size;
    const hk = hashKey(p.x, p.z); if (!placed.has(hk)) placed.set(hk, []); placed.get(hk).push(p);
    const k = Math.floor(p.z / BAND);
    if (!bands.has(k)) bands.set(k, []);
    bands.get(k).push(p);
  }
  if (culled) console.info(`jungle: ${culled} spots beyond the camera's reach left unplanted`);
  // Jungle canopies as stylised cloud-like clusters, flat-shaded with crisp facets, colour baked into the vertices (no textures). Each of
  // CLOUDS shared meshes is 3-5 lopsided blobs of different sizes merged into one irregular mass:
  //  - every blob is a squashed, stretched sphere bent out of round by a slow noise (so it loses its sphere profile),
  //  - its facets are big on top and small towards the rim (rings of 6 / 9 / 14 points, zipped together), so large flat
  //    planes catch the light on the crown and the edges are broken up finely,
  //  - faces buried inside a neighbouring blob, and the underside, are left out,
  //  - the colour runs from light olive on top to dark forest green below.
  // Instances pick one of the clouds at random, then vary in size, turn and height (see the loop below).
  const CLOUDS = 5, RINGS = [[0, 1], [.6, 5], [1.12, 8], [1.45, 11], [1.72, 11]]; // [polar angle (rad), points]: crown to rim, then a little under it
  const cloudGeometry = () => {
    const T = [], V = (x, y, z) => new THREE.Vector3(x, y, z), c = new THREE.Color(); // T: the triangles, each with the point it faces away from
    const dark = new THREE.Color(.03, .085, .03), light = new THREE.Color(.26, .34, .09);
    const tri = (a, b, d, t, from) => { c.copy(dark).lerp(light, Math.min(1, Math.max(0, t))); T.push({ a, b, d, r: c.r, g: c.g, bl: c.b, from }); };
    const grad = (y, jit) => (y + .35) / 1.3 + jit * (rand() - .5); // 0 at the base, 1 at the crown
    const blobs = [], n = 3 + Math.floor(rand() * 3); // 3-5 blobs: a big one, the rest smaller and off to the sides, at different heights
    blobs.push({ x: (rand() - .5) * .2, y: .1, z: (rand() - .5) * .2, rx: .85 + rand() * .2, ry: .6 + rand() * .15, rz: .85 + rand() * .2 });
    for (let i = 1; i < n; i++) { const a = (i / (n - 1) + rand() * .35) * Math.PI * 2, d = .6 + rand() * .45; blobs.push({ x: Math.cos(a) * d, y: -.1 + rand() * .4, z: Math.sin(a) * d, rx: .4 + rand() * .3, ry: .3 + rand() * .22, rz: .4 + rand() * .3 }); }
    const s1 = rand() * 6, s2 = rand() * 6, s3 = rand() * 6;
    const bend = u => (Math.sin(u.x * 1.9 + s1) + Math.sin(u.y * 2.3 + s2) + Math.sin(u.z * 1.7 + s3)) / 3 * .5; // slow noise, about +-.17
    const inside = (p, self) => blobs.some(o => o !== self && ((p.x - o.x) / o.rx) ** 2 + ((p.y - o.y) / o.ry) ** 2 + ((p.z - o.z) / o.rz) ** 2 < .62);
    for (const b of blobs) {
      const off = rand() * 6.3, ring = RINGS.map(([th, m], k) => Array.from({ length: m }, (_, j) => {
        const ph = off + (j + (rand() - .5) * .3) / m * Math.PI * 2 + k * .4, u = V(Math.sin(th) * Math.cos(ph), Math.cos(th), Math.sin(th) * Math.sin(ph));
        const k2 = (1 + bend(u) + (rand() - .5) * .1) * (th === 0 ? 1.04 : 1);
        return V(b.x + u.x * b.rx * k2, b.y + u.y * b.ry * k2, b.z + u.z * b.rz * k2);
      }));
      const face = (p, q, r) => { const mid = p.clone().add(q).add(r).divideScalar(3); if (mid.y < -.3 || inside(mid, b)) return; tri(p, q, r, grad(mid.y, .22), b); };
      for (let j = 0; j < ring[1].length; j++) face(ring[0][0], ring[1][j], ring[1][(j + 1) % ring[1].length]); // the crown: a fan of big faces
      for (let k = 1; k < ring.length - 1; k++) { // zip each ring to the next (their point counts differ)
        const A = ring[k], B = ring[k + 1], na = A.length, nb = B.length;
        for (let i = 0, j = 0; i < na || j < nb;) {
          if (i < na && (j >= nb || (i + 1) / na <= (j + 1) / nb)) { face(A[i % na], A[(i + 1) % na], B[j % nb]); i++; } else { face(A[i % na], B[(j + 1) % nb], B[j % nb]); j++; }
        }
      }
    }
    // Hard facets: every triangle keeps its own flat colour and normal (the material is flat-shaded).
    const pos = [], col = [];
    for (const t of T) for (const v of [t.a, t.b, t.d]) { pos.push(v.x, v.y, v.z); col.push(t.r, t.g, t.bl); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.computeVertexNormals(); g.userData.tris = pos.length / 9; return g;
  };
  const cloudGeos = Array.from({ length: CLOUDS }, cloudGeometry);
  const canopyMat = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: .88, flatShading: true, side: THREE.DoubleSide, envMapIntensity: .3 });
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(), col = new THREE.Color();
  if (PALM) { // the experiment: instanced palms (PALMS shapes, merged to a few meshes each), the same placement as the canopies; bands still culled as a whole
    // Fewer draw calls: three shapes, not four; every trunk shares one bark material and each shape's trunks (a clump has two or three) are one mesh, so a shape is
    // trunk + live fronds + dead fronds = 3 draws; the meshes are named so chunks.js leaves them in my 20 m bands (it would cut each into 40 x 28 m blocks: several times the calls).
    const PALMS = 3; let sharedBark = null;
    const templates = Array.from({ length: PALMS }, (_, i) => {
      const g = buildPalm(1000 + i * 7919, 2 + i % 2, true); // (each shape with two or three old brown fronds; lite: fewer segments in trunk and fronds, ~40% fewer triangles)
      mergeStatic(g); g.updateMatrixWorld(true);
      const parts = []; g.traverse(o => { if (o.isMesh) parts.push(o); });
      const trunks = parts.filter(o => !o.material.alphaTest), out = parts.filter(o => o.material.alphaTest);
      sharedBark ??= trunks[0].material;
      if (trunks.length) out.unshift({ geometry: mergeGeometries(trunks.map(o => o.geometry)), material: sharedBark, castShadow: true, receiveShadow: true });
      return out;
    });
    let palms = 0, tris = 0;
    const pm4 = new THREE.Matrix4(), pq = new THREE.Quaternion(), pe = new THREE.Euler(), ps = new THREE.Vector3();
    for (const trees of bands.values()) {
      const groups = Array.from({ length: PALMS }, () => []);
      for (const p of trees) groups[Math.floor(rand() * PALMS)].push(p);
      groups.forEach((list, gi) => {
        if (!list.length) return;
        const box = new THREE.Box3(), mats = list.map(p => {
          const k = .92 + rand() * .2; // (the same size as the palms placed in the map)
          pm4.compose(new THREE.Vector3(p.x, 0, p.z), pq.setFromEuler(pe.set(0, rand() * 6.3, 0)), ps.set(k, k * (.95 + rand() * .12), k));
          box.expandByPoint(new THREE.Vector3(p.x - 5, 0, p.z - 5)).expandByPoint(new THREE.Vector3(p.x + 5, 9, p.z + 5));
          return pm4.clone();
        });
        for (const part of templates[gi]) {
          const geo = part.geometry.clone(), mesh = new THREE.InstancedMesh(geo, part.material, list.length);
          mats.forEach((m, i) => mesh.setMatrixAt(i, m));
          geo.boundingSphere = box.getBoundingSphere(new THREE.Sphere());
          mesh.castShadow = part.castShadow; mesh.receiveShadow = part.receiveShadow;
          if (part.customDepthMaterial) mesh.customDepthMaterial = part.customDepthMaterial;
          mesh.name = 'palmGrove'; mesh.frustumCulled = true; mesh.userData.plant = true; scene.add(mesh); // (plant: the LOW graphics level drops their shadows, see quality.js)
          tris += list.length * (geo.index ? geo.index.count : geo.attributes.position.count) / 3;
        }
        palms += list.length;
      });
    }
    console.info(`canopy (palm experiment): ${palms} palms, ${PALMS} shapes, ${(tris / 1000).toFixed(0)}k triangles in all`);
  }
  // A few boulders over the jungle floor between the trees, so the dark ground under the canopy isn't bare: the same boulder as in the main part of the map (buildRock: a cluster of
  // faceted lumps in the stage's mud-brown), drawn a little smaller, instanced per 20 m band like the palms (named so chunks.js leaves them whole).
  // (stage 1 only: the other stages' jungle is left as it was)
  if (!stage.theme || stage.theme === 'jungle') {
    let seed = 90210; const rr = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296; // (its own random stream: the rest of the stage's placement is untouched)
    const parts = [1, 2, 3].map(v => buildMossyRock(v * 31, 'dirt', true).children[0]); // (three cheap variants of the dirt-covered sandstone boulder, so they are not all alike)
    const rbands = new Map(); let rocks = 0;
    const EDGE = 6, NEAR = Math.ceil(5 / CELL); // m: kept this far in from the map's side edges; cells: a boulder must have open ground this close (it is seen from the open ground: deeper in, the canopy hides it)
    const nearOpen = (r, c) => { for (let a = -NEAR; a <= NEAR; a++) for (let b = -NEAR; b <= NEAR; b++) if (tileRC(r + a, c + b) !== 'T') return true; return false; };
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) { // (only inside the map itself: not out in the jungle that goes on past its edges)
      if (tileRC(r, c) !== 'T' || rr() > .27) continue;
      const cc = cellCentre(r, c), x = cc.x + (rr() - .5) * CELL, z = cc.z + (rr() - .5) * CELL, size = .5 + rr() * .5, reach = 2.2 * size; // (size: of the boulder's ~4 m)
      if (Math.abs(x) > LEVEL.halfWidth - EDGE || !nearOpen(r, c)) continue;
      if (wallBoxes.some(w => Math.abs(x - w.x) < w.hw + reach && Math.abs(z - w.z) < w.hd + reach)) continue;
      let onTrunk = false; // (not on a palm's foot)
      for (let ax = -1; ax <= 1 && !onTrunk; ax++) for (let az = -1; az <= 1 && !onTrunk; az++)
        for (const o of placed.get(hashKey(x + ax * HASH, z + az * HASH)) ?? []) if (Math.hypot(o.x - x, o.z - z) < 1 + reach) { onTrunk = true; break; }
      if (onTrunk) continue;
      const k = Math.floor(z / BAND); if (!rbands.has(k)) rbands.set(k, []);
      rbands.get(k).push({ x, z, size, yaw: rr() * 6.3, v: Math.floor(rr() * 3) });
    }
    const rm = new THREE.Matrix4(), rq = new THREE.Quaternion(), re = new THREE.Euler(), rp = new THREE.Vector3(), rs = new THREE.Vector3();
    for (const list of rbands.values()) {
      const box = new THREE.Box3(), mats = list.map(o => {
        box.expandByPoint(rp.set(o.x - o.size * 3, 0, o.z - o.size * 3)).expandByPoint(rp.set(o.x + o.size * 3, o.size * 3, o.z + o.size * 3));
        return rm.clone().compose(new THREE.Vector3(o.x, heightAt(o.x, o.z) - .1, o.z), rq.setFromEuler(re.set(0, o.yaw, 0)), rs.set(o.size, o.size * (.85 + rr() * .3), o.size));
      });
      for (const [vi, part] of parts.entries()) {
        const keep = mats.filter((m, i) => list[i].v === vi);
        if (!keep.length) continue;
        const geo = part.geometry.clone(), mesh = new THREE.InstancedMesh(geo, part.material, keep.length);
        keep.forEach((m, i) => mesh.setMatrixAt(i, m));
        geo.boundingSphere = box.getBoundingSphere(new THREE.Sphere());
        mesh.castShadow = false; mesh.receiveShadow = true; mesh.name = 'jungleRocks'; // (no shadow of their own: small, under the canopy, and a good third of the shadow pass's triangles. Not tagged 'plant' either: quality.js would turn their shadow back on)
        mesh.frustumCulled = true; scene.add(mesh);
      }
      rocks += list.length;
    }
    console.info(`jungle floor: ${rocks} boulders`);
  }
  for (const trees of PALM ? [] : bands.values()) {
    const box = new THREE.Box3(), groups = Array.from({ length: CLOUDS }, () => []);
    for (const p of trees) groups[Math.floor(rand() * CLOUDS)].push(p);
    groups.forEach((list, gi) => {
      if (!list.length) return;
      const geo = cloudGeos[gi].clone(), canopy = new THREE.InstancedMesh(geo, canopyMat, list.length), gbox = new THREE.Box3();
      list.forEach((p, i) => {
        // The roof's height: slow swells (rolling peaks and valleys) plus a big random lift of its own, so neighbouring
        // crowns sit at quite different heights and the odd one dips deep into a gap.
        const swell = .55 * Math.sin(p.x * .23 + 1.3) * Math.cos(p.z * .19) + .4 * Math.sin(p.x * .07 + p.z * .11 + 2) + .3 * Math.sin(p.z * .31 - p.x * .13);
        const k = p.size * (.9 + rand() * .3), y = 1.9 + swell * 1.4 + (rand() - .4) * 1.5, hue = rand();
        m4.compose(new THREE.Vector3(p.x, y, p.z), q.setFromEuler(e.set((rand() - .5) * .2, rand() * 6.3, (rand() - .5) * .2)), s.set(k, k * (.75 + rand() * .45), k)); // (turned about the vertical: the crown stays on top)
        canopy.setMatrixAt(i, m4);
        canopy.setColorAt(i, hue < .2 ? col.setRGB(1.15, 1.1, .78) : hue < .35 ? col.setRGB(.75, .9, .85) : col.setRGB(.88 + rand() * .28, .9 + rand() * .22, .85 + rand() * .2)); // (a few drier / darker ones)
        const ext = new THREE.Vector3(p.x - 3.2, 0, p.z - 3.2); gbox.expandByPoint(ext).expandByPoint(new THREE.Vector3(p.x + 3.2, y + 3.2, p.z + 3.2));
      });
      geo.boundingSphere = gbox.getBoundingSphere(new THREE.Sphere());
      canopy.castShadow = canopy.receiveShadow = true;
      scene.add(canopy);
    });
  }

  // Contact shadow under the forest edge: a baked, soft, dark gradient laid on the ground. The jungle's tile mask is blurred (a
  // few box-blur passes: about a Gaussian) into an alpha map that is darkest under the trees and fades out over ~3 m of open
  // ground, so the canopy sits in the terrain instead of floating on it. One plane the size of the map, one draw call.
  {
    const PXC = 4, ec = cols + 2 * MX, er = rows + 2 * MY, tw = ec * PXC, th = er * PXC; // texture px per tile; the size (map plus its margins, where the jungle carries on) in texels
    let mask = new Float32Array(tw * th), any = false;
    for (let r = 0; r < er; r++) for (let c = 0; c < ec; c++) if (tileRC(r - MY, c - MX) === 'T') {
      any = true; for (let y = 0; y < PXC; y++) for (let x = 0; x < PXC; x++) mask[(r * PXC + y) * tw + c * PXC + x] = 1;
    }
    if (any) {
      const R0 = Math.round(5.5 / (CELL / PXC) / 2), tmp = new Float32Array(mask.length); // (radius per pass, texels; 3 passes ~ a 7 m blur)
      const box = (src, dst, horizontal, R = R0) => {
        const len = horizontal ? tw : th, lines = horizontal ? th : tw, step = horizontal ? 1 : tw, stride = horizontal ? tw : 1;
        for (let l = 0; l < lines; l++) {
          const base = l * stride; let sum = 0;
          for (let i = -R; i <= R; i++) sum += src[base + Math.min(len - 1, Math.max(0, i)) * step];
          for (let i = 0; i < len; i++) {
            dst[base + i * step] = sum / (2 * R + 1);
            sum += src[base + Math.min(len - 1, i + R + 1) * step] - src[base + Math.max(0, i - R) * step];
          }
        }
      };
      for (let pass = 0; pass < 3; pass++) { box(mask, tmp, true); box(tmp, mask, false); }
      const cv = document.createElement('canvas'); cv.width = tw; cv.height = th;
      const cx = cv.getContext('2d'), img = cx.createImageData(tw, th);
      for (let i = 0; i < mask.length; i++) { img.data[i * 4] = 4; img.data[i * 4 + 1] = 10; img.data[i * 4 + 2] = 2; img.data[i * 4 + 3] = Math.round(255 * Math.min(.5, mask[i] * 1.3)); }
      cx.putImageData(img, 0, 0);
      const tex = new THREE.CanvasTexture(cv); tex.anisotropy = 4;
      const shade = new THREE.Mesh(new THREE.PlaneGeometry(ec * CELL, er * CELL), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
      shade.name = 'canopyShadow'; shade.rotation.x = -Math.PI / 2; shade.position.set(0, .05, -L / 2); shade.renderOrder = 1; shade.castShadow = shade.receiveShadow = false;
      scene.add(shade);
    }
  }

  await step('walls');
  // --- walls and concrete pads as instanced boxes ---
  const boxes = (ch, h, y, color) => {
    const cells = [];
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) if (grid[r][c] === ch) cells.push(cellCentre(r, c));
    if (!cells.length) return;
    const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(CELL, h, CELL), new THREE.MeshStandardMaterial({ color, roughness: .85, envMapIntensity: .3, shadowSide: THREE.FrontSide }), cells.length);
    cells.forEach((p, i) => mesh.setMatrixAt(i, m4.makeTranslation(p.x, y, p.z)));
    mesh.castShadow = mesh.receiveShadow = true; mesh.frustumCulled = false; scene.add(mesh);
  };
  boxes('H', .1, .05, 0x5e5e58);

  // Stage 3: the markings image (stage.markings, several px per NES pixel) laid over the map as decals,
  // in slices no texture is too big for. Cut-out (alphaTest), so they take shadows like the ground.
  function groundMarkings(img) {
    const SLICE = 2048, k = img.width / (stage.meta.width + 2 * padX), mpp = PX / k; // image px per NES pixel, metres per image px
    for (let y0 = 0; y0 < img.height; y0 += SLICE) for (let x0 = 0; x0 < img.width; x0 += SLICE) { // (tiles: an image 8 px per NES pixel is wider than a texture may be; tiles with no paint in them are not made)
      const h = Math.min(SLICE, img.height - y0), w = Math.min(SLICE, img.width - x0), c = document.createElement('canvas'); c.width = w; c.height = h;
      const cx = c.getContext('2d'); cx.drawImage(img, x0, y0, w, h, 0, 0, w, h);
      if (!cx.getImageData(0, 0, w, h).data.some((v, i) => i % 4 === 3 && v)) continue;
      const map = new THREE.CanvasTexture(c); map.anisotropy = 16;
      const mat = new THREE.MeshStandardMaterial({ map, alphaTest: stage.softMarkings ? .02 : .5, transparent: !!stage.softMarkings, depthWrite: !stage.softMarkings, roughness: .8, envMapIntensity: .3, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
      mat.userData.noDim = true; // (the road paint is not dimmed with the assets: it must stay readable)
      mat.onBeforeCompile = sh => { // the camouflaged guns' holes (camo-turrets.js): no stripes across the gap where the cover has slid open. camoGaps: (x, z, half gap) each
        sh.uniforms.camoGaps = camoGaps;
        sh.vertexShader = 'varying vec2 vCamoXZ;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n\tvCamoXZ = ( modelMatrix * vec4( transformed, 1.0 ) ).xz;');
        sh.fragmentShader = 'varying vec2 vCamoXZ;\nuniform vec3 camoGaps[8];\n' + sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
	for ( int i = 0; i < 8; i ++ ) { vec3 g = camoGaps[ i ]; if ( g.z > 0.0 && abs( vCamoXZ.x - g.x ) < g.z && length( vCamoXZ - g.xy ) < 1.3 ) discard; }`);
      };
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(w * mpp, h * mpp), mat);
      plane.rotation.x = -Math.PI / 2; plane.position.set((x0 + w / 2 - img.width / 2) * mpp, .02, -L - padY * PX + (y0 + h / 2) * mpp);
      plane.receiveShadow = true; if (stage.softMarkings) plane.renderOrder = 1; scene.add(plane);
    }
  }
  const rainTops = []; // { x, z, hw, hd, h }: surfaces the rain lands on besides the ground and the roofs (rain.js); filled as things are placed
  let harbourRoofs = null; // the fortress roofs (a few puddles lie on them, below)
  if (stage.theme === 'harbour') { const hb = buildHarbour(scene, grid, (r, c) => new THREE.Vector3(-W / 2 + c * CELL, 0, -L + r * CELL), CELL, W, L, MX,
    stage.entities.filter(e => e.type === 'laser').map(e => toWorld(e.x, e.y)), stage.fortressFromRow, !!stage.puddles); // stage 3: crates and buildings
    for (const { r, c } of hb.userData.notches?.values() ?? []) wedgeCells.add(r * cols + c);
    harbourRoofs = hb.userData.roofs ?? null; rainTops.push(...(hb.userData.tops ?? [])); }
  let puddleMirror = null; // stage 6: the rain puddles and their mirror pass (puddles.js)
  // Where the road stands wetter (puddles.js blobs): all round every container and pile (big and strong), and, in the stretch of map north of the old end where no buildings shed rain, scattered patches in a jittered grid, so it
  // is as puddled as the rest of the road (stage.puddleFill: the length in metres, from the map's north end, to fill)
  const puddleBlobs = () => {
    const out = stage.entities.filter(e => e.type === 'container' || e.type === 'containerpile').map(e => { const c = toWorld(e.x, e.y); return { x: c.x, z: c.z, r: e.type === 'containerpile' ? 15 : 13, r0: e.type === 'containerpile' ? 6.5 : 5.5, k: 1 }; });
    out.push({ x: -20.8, z: -463.6, r: 8.5, r0: 4.5, k: 1.2, wild: true, ex: 1.35, ez: .8, rot: .45 }, { x: 21.7, z: -460.8, r: 8.5, r0: 4.5, k: 1.2, wild: true, ex: 1.3, ez: .85, rot: -.6 }); // (two big, irregular puddles by the skull in front of the arena gate: about 12 m long)
    if (stage.arenaGate) out.push({ x: 0, z: stage.arenaGate.z + 5, r: 15, r0: 7, k: 1 }); // (a big puddle in front of the arena gate, to mirror the red curtain)
    if (stage.puddleFill) {
      let seed = 4711; const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
      for (let z = -L + 6; z < -L + stage.puddleFill; z += 12) for (let x = -W / 2 + 4; x < W / 2; x += 12) out.push({ x: x + (rnd() - .5) * 10, z: z + (rnd() - .5) * 10, r: 5 + rnd() * 6, r0: 0, k: .35 + rnd() * .4 });
    }
    return out;
  };
  if (stage.puddles) { const road = buildPuddles(scene, { vlsHoles, tileAt, W, L, cell: CELL, exclude: stage.entities.filter(e => e.type === 'conveyor').map(e => { const c = toWorld(e.x, e.y); return { x0: c.x - e.w * PX / 2, x1: c.x + e.w * PX / 2, z0: c.z - e.h * PX / 2, z1: c.z + e.h * PX / 2 }; }), shift: -.03, blobs: puddleBlobs(), boost: stage.entities.filter(e => e.type === 'f35').map(e => { const c = toWorld(e.x, e.y); return { x: c.x, z: c.z, r: 8 }; }), count: stage.puddles, entities: stage.entities.map(e => { const v = toWorld(e.x, e.y); return { x: v.x, z: v.z }; }) }); // stage 6: the wet road
    const roof = harbourRoofs?.length ? buildPuddles(scene, { W, L, y: 6.53, geometry: roofGeometry(harbourRoofs, 6.53), near: harbourRoofs, off: [137, 59], shift: -.02, damp: false, sheen: 0 }) : null; // a few clear puddles on the roofs, their own mirror at roof height; the roof itself is not darkened
    puddleMirror = { flag: r => road.flag(r), setRoad: v => road.setRoad(v), setCut: n => road.setCut(n), setRainRip: v => road.setRainRip(v), setRough: v => road.setRough(v), render: (...a) => { road.render(...a); roof?.render(...a); }, ripple: (x, z, a, d) => road.addRipple(x, z, a, d), wetness: (r, x, z) => road.probe(r, x, z), setMode: m => { road.setMode(m); roof?.setMode(m); }, setFlash: v => { road.setFlash(v); roof?.setFlash(v); }, setStorm: v => { road.setStorm(v); roof?.setStorm(v); }, setBolt: (...a) => { road.setBolt(...a); roof?.setBolt(...a); }, skip: v => { road.setNoMirror(v); roof?.setNoMirror(v); }, oldCull: v => { road.setOldCull(v); roof?.setOldCull?.(v); } }; }
  poolBorders(); // stage 2: flat carved-stone borders round the pools
  causewayRoad();

  // Stage 2: the causeway is a brick road (see causeway.js), giving out gradually into the sand at its ends.
  function causewayRoad() {
    const isLand = t => t === '.' || t === '"', isRoad = (r, c) => r >= 0 && r < rows && c >= 0 && c < cols && grid[r][c] === 'C';
    const road = [];
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) if (grid[r][c] === 'C') road.push([r, c]);
    if (!road.length) return;
    const across = (r, c) => { // 0 at the road's sides .. 1 down its middle (across its width, in this row)
      let a = c, b = c; while (isRoad(r, a - 1)) a--; while (isRoad(r, b + 1)) b++;
      const w = b - a + 1; return w < 2 ? 0 : 1 - Math.abs(c + .5 - (a + b + 1) / 2) / (w / 2);
    };
    const laneAt = (r, c) => { const v = [[r - 1, c - 1], [r - 1, c], [r, c - 1], [r, c]].filter(([a, b]) => isRoad(a, b)).map(([a, b]) => across(a, b));
      return v.length ? Math.max(0, Math.min(1, v.reduce((x, y) => x + y, 0) / v.length * 1.4 - .2)) : 0; };
    const cells = road.map(([r, c]) => [-W / 2 + c * CELL, -L + r * CELL, CELL, [laneAt(r, c), laneAt(r, c + 1), laneAt(r + 1, c + 1), laneAt(r + 1, c)]]);
    const ends = [];
    for (const [r, c] of road) for (const [dr, ang] of [[-1, -Math.PI / 2], [1, Math.PI / 2]]) {
      if (r + dr >= 0 && r + dr < rows && isLand(grid[r + dr][c])) ends.push([-W / 2 + (c + .5) * CELL, -L + (r + (dr > 0 ? 1 : 0)) * CELL, CELL, ang]);
    }
    const [sr, sg, sb] = theme.classes[0], k = 0xa8 / 255; // the sand as the ground draws it (groundMat), for the drift over the ends
    buildCauseway(scene, cells, .02, ends, { detail, color: new THREE.Color(sr / 255 * k, sg / 255 * k, sb / 255 * k), origin: [WE / 2, LE / 2 - L / 2] });
  }

  // The desert sand as the ground draws it (its colour and fine grain), for sand drifted over things.
  function groundSand() {
    const [sr, sg, sb] = theme.classes[0], t = detail.clone(); t.needsUpdate = true;
    return new THREE.MeshStandardMaterial({ map: t, color: new THREE.Color(sr / 255 * .66 * 1.9, sg / 255 * .66 * 1.9, sb / 255 * .66 * 1.9), roughness: 1, envMapIntensity: .3 });
  }
  function poolBorders() {
    const cells = [];
    for (let r = -MY; r < rows + MY; r++) for (let c = -MX; c < cols + MX; c++) if (tileRC(r, c) === 'R') cells.push([r, c]); // past the map's edges too
    buildPoolBorders(scene, cells, (r, c) => [-W / 2 + c * CELL, -L + r * CELL], CELL,
      (r, c) => tileRC(r, c) === '~', (r, c) => { const t = tileRC(r, c); return t === '.' || t === '"'; }, groundSand());
  }
  terraceRims();
  let pavingCache = null;
  const pavingTex = () => pavingCache ??= pavingTextures(); // made once, shared by the paving and the ramps
  terracePaving();
  rampStairs();

  // Stage 2: the ramps up onto the terraces are worn flights of stone steps (see ramp-stairs.js).
  function rampStairs() {
    const flights = regions(grid, '^').map(b => {
      const mid = Math.floor((b.r0 + b.r1) / 2);
      return { x0: -W / 2 + b.c0 * CELL, x1: -W / 2 + (b.c1 + 1) * CELL, z0: -L + b.r0 * CELL, z1: -L + (b.r1 + 1) * CELL,
        highEast: (t => t === 'P' || t === 'E')(tileRC(mid, b.c1 + 1)) };
    });
    if (!flights.length) return;
    scene.add(mergeStatic(buildRampStairs(flights, TERRACE_H, { sand: groundSand() })));
  }

  // Stage 2: the terraces' tops are paved with big worn stone slabs (see paving.js), laid just over
  // the raised ground.
  function terracePaving() {
    // drifted sand: 1 next to the terrace's edge, fading out over SAND_EDGE cells (breadth-first from the edges)
    const R0 = -MY, C0 = -MX, NR = rows + 2 * MY, NC = cols + 2 * MX, dist = new Float32Array(NR * NC).fill(1e9), queue = [];
    const paved = t => t === 'P' || t === 'E'; // the paving runs out over the edge cells to the wall
    for (let r = 0; r < NR; r++) for (let c = 0; c < NC; c++) if (!paved(tileRC(r + R0, c + C0))) { dist[r * NC + c] = 0; queue.push(r * NC + c); }
    for (let qi = 0; qi < queue.length; qi++) {
      const i = queue[qi], r = Math.floor(i / NC), c = i % NC;
      for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const rr2 = r + dr, cc = c + dc, j = rr2 * NC + cc;
        if (rr2 < 0 || rr2 >= NR || cc < 0 || cc >= NC || dist[j] <= dist[i] + 1) continue;
        dist[j] = dist[i] + 1; queue.push(j);
      }
    }
    const sandOf = (r, c) => { // a corner: the cells round it, sand 1 where it isn't paving
      let t = 0;
      for (const [a, b] of [[r - 1, c - 1], [r - 1, c], [r, c - 1], [r, c]]) {
        const d = a < 0 || a >= NR || b < 0 || b >= NC ? 0 : dist[a * NC + b];
        t += Math.max(0, Math.min(1, 1 - (d - 1) / SAND_EDGE));
      }
      return t / 4;
    };
    const cells = [];
    for (let r = 0; r < NR; r++) for (let c = 0; c < NC; c++) {
      if (dist[r * NC + c] === 0) continue;
      let x0 = -W / 2 + (c + C0) * CELL, z0 = -L + (r + R0) * CELL, w = CELL, h = CELL;
      if (tileRC(r + R0, c + C0) === 'E') { // an edge cell: stop short of the wall's face on its low sides
        const low = (dr, dc) => { const t2 = tileRC(r + R0 + dr, c + C0 + dc); return t2 === '.' || t2 === '"'; }, IN = .4;
        if (low(0, -1)) { x0 += IN; w -= IN; } if (low(0, 1)) w -= IN; if (low(-1, 0)) { z0 += IN; h -= IN; } if (low(1, 0)) h -= IN;
      }
      cells.push([x0, z0, CELL, [sandOf(r, c), sandOf(r, c + 1), sandOf(r + 1, c + 1), sandOf(r + 1, c)], w, h]);
    }
    if (!cells.length) return;
    const t = pavingTex();
    const mat = new THREE.MeshStandardMaterial({ map: t.map, bumpMap: t.bump, bumpScale: .6, vertexColors: true, color: 0xb8b2a8, roughness: .95, envMapIntensity: .2, shadowSide: THREE.FrontSide }); // (shadowSide: the shadow is drawn from the faces turned to the sun, so no lit seam along the far foot of a wall: see harbour.js crateMaterials)
    scene.add(buildPaving(cells, TERRACE_H + .012, addMacro(mat, t.macro)));
  }

  // Stage 2: each terrace stands on a retaining wall of stone blocks along its edges, with sand and
  // scrub at its foot (see terrace-wall.js). The paving runs over the edge cells up to the wall.
  function terraceRims() {
    const isLow = t => t === '.' || t === '"';
    const runs = edgeRuns(tileRC, -MY, rows + MY, -MX, cols + MX, c => -W / 2 + c * CELL, r => -L + r * CELL, CELL, isLow);
    if (!runs.length) return;
    const [sr, sg, sb] = theme.classes[0]; // the desert sand, as the ground draws it
    buildTerraceWalls(scene, runs, TERRACE_H + .1, () => 0, new THREE.Color(sr / 255 * .66, sg / 255 * .66, sb / 255 * .66));
  }
  const helipadCircle = buildHelipadSlab(scene, grid, CELL, W, L); // detailed concrete and markings on top
  const secretPad = stage.secretPad ? buildSecretPad(scene, stage.secretPad, CELL, (x, z) => 0) : null;
  // (stage 5: the transport helicopter's pad on the secret land beyond the left edge; its compound wall is built with the others, see thinWalls)

  await step('structures');
  // --- compound walls: thin concrete walls along the wall tiles' centre lines ---
  // On the NES sprites the top and bottom walls look 4 tiles thick, but that's the wall's front
  // face drawn below its top to fake depth. Here every wall is 0.7 m thick: horizontal bands
  // collapse to their centre line, and the one-tile side walls run on to meet them.
  let curtainGateInfo; // the laser fence's gate (stage entity with `curtain`): where it stands, half its width, and the highest ground under it
  const getCurtainGate = () => {
    if (curtainGateInfo !== undefined) return curtainGateInfo;
    const e = (stage.entities ?? []).find(q => q.type === 'gate' && q.curtain); if (!e) return curtainGateInfo = null;
    const p = toWorld(e.x, e.y), hw = (e.w || 56) * PX / 2; let top = -1e9, low = 1e9;
    for (let u = -hw - .5; u <= hw + .51; u += .5) for (const v of [-1, 0, 1]) { const h = heightAt(p.x + u, p.z + v); top = Math.max(top, h); low = Math.min(low, h); }
    return curtainGateInfo = { x: p.x, z: p.z, hw, y: top + .02, low };
  };
  function computeWallBoxes() {
    const T = 1.3, isW = (r, c) => r >= 0 && r < rows && c >= 0 && c < cols && grid[r][c] === 'W'; // T = footing width
    const hRun = (r, c) => { let a = c, b = c; while (isW(r, a - 1)) a--; while (isW(r, b + 1)) b++; return b - a + 1; };
    const band = (r, c) => isW(r, c) && hRun(r, c) >= 3;
    const bandZ = (r, c) => { let a = r, b = r; while (band(a - 1, c)) a--; while (band(b + 1, c)) b++; return -L + (a + b + 1) / 2 * CELL; };
    const out = [];
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols;) { // horizontal walls
      if (!band(r, c) || band(r - 1, c)) { c++; continue; }
      const z = bandZ(r, c);
      let c2 = c;
      while (band(r, c2 + 1) && !band(r - 1, c2 + 1) && bandZ(r, c2 + 1) === z) c2++;
      // (stage 3: a wall reaching the map's side runs on out of sight, rather than stopping at the edge)
      const ca = theme.margin && c === 0 ? -MX : c, cb = theme.margin && c2 === cols - 1 ? cols - 1 + MX : c2;
      out.push({ x: -W / 2 + (ca + cb + 1) / 2 * CELL, z, hw: (cb - ca + 1) * CELL / 2, hd: T / 2 });
      c = c2 + 1;
    }
    for (let c = 0; c < cols; c++) for (let r = 0; r < rows;) { // vertical walls, run on to the bands they meet
      if (!isW(r, c) || band(r, c)) { r++; continue; }
      let r2 = r;
      while (isW(r2 + 1, c) && !band(r2 + 1, c)) r2++;
      const z0 = band(r - 1, c) ? bandZ(r - 1, c) : -L + r * CELL, z1 = band(r2 + 1, c) ? bandZ(r2 + 1, c) : -L + (r2 + 1) * CELL;
      out.push({ x: -W / 2 + (c + .5) * CELL, z: (z0 + z1) / 2, hw: T / 2, hd: (z1 - z0) / 2 });
      r = r2 + 1;
    }
    return out;
  }

  // Precast T-wall blast panels (1.5 m wide, with a wide footing) in three concrete tints, seams
  // between them, and coiled razor wire along the top on small posts.
  function thinWalls(wallBoxes, solid = true) { // solid: false for walls whose blocking is already done by their map cells (the secret compound's)
    const H = 2.6, PANEL = 1.5, TH = .5, rand = rng(31);
    const panelMats = Array.from({ length: PANEL_VARIANTS }, (_, v) => v).map(v => { const t = panelTextures(v); return new THREE.MeshStandardMaterial({ map: t.map, bumpMap: t.bump, bumpScale: .9, roughness: .92, envMapIntensity: .3, shadowSide: THREE.FrontSide }); });
    const footMat = new THREE.MeshStandardMaterial({ map: panelTextures(0).map, color: 0x9a988f, roughness: .95, envMapIntensity: .3, shadowSide: THREE.FrontSide });
    if (stage.isSecretLevel) { panelMats.forEach(m => snowCoat(m, { cling: .3 })); snowCoat(footMat, { cling: .15 }); } // (the secret level: the wall's own concrete is coated in snow)
    const wireMat = new THREE.MeshStandardMaterial({ color: 0x55585a, roughness: .45, metalness: .8, envMapIntensity: .6 });
    const g = new THREE.Group();
    if (stage.isSecretLevel) wallBoxes = wallBoxes.flatMap(b => { // (the snow ground slopes up toward the cliff: each wall is cut into 6 m runs, each standing on the highest ground under it, so no uphill snow buries its foot)
      if (b.ang !== undefined) return [b];
      const alongX = b.hw > b.hd, total = 2 * (alongX ? b.hw : b.hd), n = Math.max(1, Math.ceil(total / 6)), out = [];
      for (let k = 0; k < n; k++) {
        const sub = { ...b }; if (alongX) { sub.hw = b.hw / n; sub.x = b.x - b.hw + (k + .5) * 2 * b.hw / n; } else { sub.hd = b.hd / n; sub.z = b.z - b.hd + (k + .5) * 2 * b.hd / n; }
        let top = -1e9; for (let u = -1; u <= 1.001; u += .25) for (const v of [-.8, 0, .8]) top = Math.max(top, alongX ? heightAt(sub.x + u * sub.hw, sub.z + v) : heightAt(sub.x + v, sub.z + u * sub.hd));
        sub.y = top + .02; const cgt = getCurtainGate(); if (cgt && Math.abs(sub.z - cgt.z) < 2 && Math.abs(sub.x - cgt.x) < cgt.hw + 9) sub.y = Math.max(sub.y, cgt.y); // (the runs by the gate stand as high as the gate's posts, so they join them)
        out.push(sub);
      }
      return out;
    });
    for (const b of wallBoxes) {
      const ang = b.ang !== undefined, alongX = b.hw > b.hd, len = ang ? 2 * b.half : 2 * (alongX ? b.hw : b.hd), n = Math.max(1, Math.round(len / PANEL)), pw = len / n;
      const seg = new THREE.Group(); seg.position.set(b.x, b.y ?? 0, b.z); seg.rotation.y = ang ? b.ang : alongX ? 0 : Math.PI / 2; g.add(seg); // (b.ang: a wall at any angle, b.half its half length)
      for (let i = 0; i < n; i++) {
        const u = -len / 2 + (i + .5) * pw, m = panelMats[Math.floor(rand() * PANEL_VARIANTS)];
        const panel = new THREE.Mesh(new THREE.BoxGeometry(pw - .06, H, TH), m); panel.position.set(u, H / 2, 0);
        const top = new THREE.Mesh(new THREE.BoxGeometry(pw - .06, .16, TH * .6), m); top.position.set(u, H + .08, 0);       // chamfered crown
        const foot = new THREE.Mesh(new THREE.BoxGeometry(pw - .06, .32, 1.3), footMat); foot.position.set(u, .16, 0);        // T-wall footing
        for (const o of [panel, top, foot]) { o.castShadow = o.receiveShadow = true; seg.add(o); }
        if (stage.isSecretLevel && !ang) { // a plinth down to the lowest ground under the panel, so the downhill side shows no gap
          const px = alongX ? b.x + u : b.x, pz = alongX ? b.z : b.z - u; let low = 1e9; for (const d of [-pw / 2, 0, pw / 2]) for (const v of [-.8, 0, .8]) low = Math.min(low, alongX ? heightAt(px + d, pz + v) : heightAt(px + v, pz + d));
          const drop = (b.y ?? 0) - low + .25; if (drop > .3) { const plinth = new THREE.Mesh(new THREE.BoxGeometry(pw - .06, drop, 1.3), footMat); plinth.position.set(u, .32 - drop / 2, 0); plinth.castShadow = plinth.receiveShadow = true; seg.add(plinth); }
        }
        if (i % 2 === 0) { // razor-wire posts
          const post = new THREE.Mesh(new THREE.BoxGeometry(.04, .55, .04), wireMat); post.position.set(u, H + .4, 0); seg.add(post);
        }
      }
      // coiled razor wire: a helix of thin wire running along the top
      const R = .24, PITCH = .32, yc = H + .42;
      const helix = new THREE.Curve();
      helix.getPoint = t => { const a = t * len / PITCH * Math.PI * 2; return new THREE.Vector3(-len / 2 + t * len, yc + Math.sin(a) * R, Math.cos(a) * R); };
      const wire = new THREE.Mesh(new THREE.TubeGeometry(helix, Math.ceil(len / PITCH * 5), .014, 3, false), wireMat); // (5 segments a turn: as round as it needs to be from up here)
      wire.castShadow = !stage.puddles; seg.add(wire); // (its shadow along the wall looks good; it is some 14k triangles in the shadow pass, so it is the first thing to drop if that pass needs trimming)
      if (solid) obstacles.push({ ...b, alive: true, kind: 'wall' });
    }
    { // the compound walls and their razor wire, straight into the scene (not as one group): the level chunking then splits the stage-long wire mesh into culled blocks
      const merged = mergeStatic(g); scene.add(merged); merged.updateMatrixWorld(true);
      for (const m of [...merged.children]) if (m.isMesh) scene.attach(m);
      scene.remove(merged);
    }
  }

  // --- bridges: a steel arch bridge. Weathered paved deck, a steel arch along each side with
  // hangers down to the deck, a low guard rail, piers in the river, and dirt-track approaches that
  // fade into the sand at both ends (so the road runs onto the bridge instead of stopping at an edge).
  const bm = {
    edge: new THREE.MeshStandardMaterial({ color: 0x8a8678, roughness: .95, envMapIntensity: .25, shadowSide: THREE.FrontSide }),
    arch: new THREE.MeshStandardMaterial({ color: 0x5a3c30, roughness: .55, metalness: .5, envMapIntensity: .45 }),
    rail: new THREE.MeshStandardMaterial({ color: 0x9a9c98, roughness: .5, metalness: .6, envMapIntensity: .5 }),
    pier: new THREE.MeshStandardMaterial({ color: 0x5e5a50, roughness: .95, envMapIntensity: .25, shadowSide: THREE.FrontSide }),
    track: new THREE.MeshStandardMaterial({ map: dirtTrackTexture(), color: 0xa8a8a8, transparent: true, depthWrite: false, roughness: 1,
      envMapIntensity: .4, polygonOffset: true, polygonOffsetFactor: -1 }), // lit like the ground, so it matches the sand
  };
  const bridges = []; // { x, z, w, d }: centre and size, for the gunboats
  regions(grid, '=').forEach(b => {
    const a = cellCentre(b.r0, b.c0), z = cellCentre(b.r1, b.c1), w = (b.c1 - b.c0 + 1) * CELL, d = (b.r1 - b.r0 + 1) * CELL;
    const cx = (a.x + z.x) / 2, cz = (a.z + z.z) / 2, g = new THREE.Group(), top = .1; // (the deck stands 7 cm above the water, which is at .03: a 1 cm gap made them fight in the depth buffer on a phone)
    bridges.push({ x: cx, z: cz, w, d });
    const box = (sx, sy, sz, m, x, y, zz) => { const o = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), m); o.position.set(x, y, zz); o.castShadow = o.receiveShadow = true; g.add(o); return o; };
    box(w, .6, d, bm.edge, 0, top - .3, 0);                                                    // deck slab
    const deckMat = new THREE.MeshStandardMaterial({ map: bridgeDeckTexture(w, d - .7, b.c0 * 31 + b.r0), roughness: .95, envMapIntensity: .25 });
    const deck = new THREE.Mesh(new THREE.PlaneGeometry(w, d - .7), deckMat);             // one texture for the whole deck
    deck.rotation.x = -Math.PI / 2; deck.position.y = top + .005; deck.receiveShadow = true;
    g.add(deck);
    const RISE = 4.2, SPAN = w * .92, arcY = x => top + .3 + RISE * (1 - (2 * x / SPAN) ** 2); // arch height above x
    for (const sd of [-1, 1]) {
      const ez = sd * (d / 2 - .2);
      box(w, .14, .25, bm.edge, 0, top + .07, sd * (d / 2 - .45));                              // kerb
      // steel arch along this side, with hangers down to the deck
      const pts = Array.from({ length: 25 }, (_, i) => { const x = -SPAN / 2 + i / 24 * SPAN; return new THREE.Vector3(x, arcY(x), ez); });
      const arch = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 48, .17, 8, false), bm.arch);
      arch.castShadow = true; g.add(arch);
      for (let x = -SPAN / 2 + 2; x < SPAN / 2 - 1.5; x += 2) {
        const h = arcY(x) - top;
        const hanger = new THREE.Mesh(new THREE.CylinderGeometry(.045, .045, h, 6), bm.arch);
        hanger.position.set(x, top + h / 2, ez); hanger.castShadow = true; g.add(hanger);
      }
      // low guard rail along the outer edge
      for (let x = -w / 2 + .3; x <= w / 2; x += 2) box(.08, .8, .08, bm.rail, x, top + .4, ez + sd * .25);
      for (const h of [.45, .8]) {
        const r = new THREE.Mesh(new THREE.CylinderGeometry(.035, .035, w, 6), bm.rail);
        r.rotation.z = Math.PI / 2; r.position.set(0, top + h, ez + sd * .25); g.add(r);
      }
      box(w, .7, .3, bm.edge, 0, top - .8, sd * (d / 2 - .9));                                  // edge beam under the deck
    }
    const piers = Math.max(1, Math.round(w / 8) - 1); // piers standing in the river
    for (let i = 1; i <= piers; i++) {
      const x = -w / 2 + i * w / (piers + 1);
      box(1.2, .4, d - .8, bm.pier, x, top - 1.2, 0);
      for (const sd of [-1, 1]) box(.9, 2.6, .9, bm.pier, x, top - 2.7, sd * (d / 2 - 1.4));
    }
    for (const sx of [-1, 1]) {
      box(1.4, 1.6, d + .3, bm.pier, sx * (w / 2 + .5), -.85, 0);                              // abutments, sunk below the ground
      // worn dirt across the bridge end: builds up over the last 3 m of deck, then fades into the sand over 7 m
      const LEN = 10, ON_DECK = 3, tr = new THREE.Mesh(new THREE.PlaneGeometry(LEN, d - .4), bm.track);
      tr.rotation.x = -Math.PI / 2; tr.rotation.z = sx > 0 ? 0 : Math.PI; // the texture's u runs from the deck outward
      tr.position.set(sx * (w / 2 - ON_DECK + LEN / 2), top + .015, 0); tr.receiveShadow = true; g.add(tr);
    }
    g.position.set(cx, 0, cz);
    scene.add(mergeStatic(g));
  });

  await step('props');
  // --- entities ---
  const conveyors = []; // stage 6's belts: { x, z, hw, hd, v } the part a jeep rides on, and how fast it carries it south (m/s)
  const obstacles = []; // axis-aligned boxes the jeep can't drive through: {x, z, hw, hd, alive, kind}
  // A coarse grid of the obstacles, so a collision test looks at the few boxes near its point instead of the whole list (a tank's rectangle is ~50 points, and each scanned every obstacle in the stage: the biggest
  // part of the game logic's CPU time). Rebuilt at most once a frame (world.update starts a new frame) and whenever one is added; the tests still read each box's own live numbers, and each box covers its cells
  // with OM metres to spare, so one that has moved a little since (the APCs, the warship) is still found. Points the test is asked about must be within OM of what they test (the circle tests: r <= OM).
  const OG = 6, OM = 3, OEMPTY = []; let ogCells = new Map(), ogFrame = -1, ogN = -1, obsFrame = 0;
  const ogKey = (cx, cz) => (cx + 4096) * 8192 + cz + 4096;
  const ogBuild = () => {
    ogCells = new Map();
    for (const b of obstacles) {
      const x0 = Math.floor((b.x - b.hw - OM) / OG), x1 = Math.floor((b.x + b.hw + OM) / OG), z0 = Math.floor((b.z - b.hd - OM) / OG), z1 = Math.floor((b.z + b.hd + OM) / OG);
      for (let cx = x0; cx <= x1; cx++) for (let cz = z0; cz <= z1; cz++) { const k = ogKey(cx, cz); let a = ogCells.get(k); if (!a) ogCells.set(k, a = []); a.push(b); }
    }
    ogFrame = obsFrame; ogN = obstacles.length;
  };
  const ogAt = (x, z) => { if (ogFrame !== obsFrame || ogN !== obstacles.length) ogBuild(); return ogCells.get(ogKey(Math.floor(x / OG), Math.floor(z / OG))) ?? OEMPTY; };
  if (swampTrees) obstacles.push(...swampTrees.boxes); // stage 4: the cypress trunks in the swamp
  const targets = [];   // destructible: {object, x, z, hw, hd (hit box), r (blast reach), hp, score, obstacle, wreck}
  thinWalls(wallBoxes); // compound walls (adds their boxes to `obstacles`)
  if (stage.forests?.length) { // the secret level's pine groves: one merged mesh; kept off the roads, the landing spot, the water's edge and the pier roots
    const trailPts = []; for (const t of stage.trails ?? []) for (let i = 0; i + 1 < t.length; i++) { const ax = -W / 2 + (t[i][0] + .5) * CELL, az = -L + (t[i][1] + .5) * CELL, bx = -W / 2 + (t[i + 1][0] + .5) * CELL, bz = -L + (t[i + 1][1] + .5) * CELL, n = Math.ceil(Math.hypot(bx - ax, bz - az) / 2); for (let k = 0; k <= n; k++) trailPts.push([ax + (bx - ax) * k / n, az + (bz - az) * k / n]); }
    const st0 = stage.entities.find(e => e.type === 'start'), sp0 = st0 ? toWorld(st0.x, st0.y) : { x: 0, z: 0 };
    const keep = (x, z) => tileAt(x, z) !== '.' || Math.hypot(x - sp0.x, z - (sp0.z + 10)) < 9 || trailPts.some(q => Math.hypot(q[0] - x, q[1] - z) < 8) || Math.hypot(x - sp0.x, z - sp0.z) < 14 || [[1, 0], [-1, 0], [0, 1], [0, -1], [.7, .7], [-.7, .7], [.7, -.7], [-.7, -.7], [.92, .38], [.38, .92], [-.38, .92], [-.92, .38], [-.92, -.38], [-.38, -.92], [.38, -.92], [.92, -.38], [.98, .2], [.98, -.2], [-.98, .2], [-.98, -.2], [.2, .98], [-.2, .98], [.2, -.98], [-.2, -.98], [.8, .6], [.6, .8], [-.6, .8], [-.8, .6], [-.8, -.6], [-.6, -.8], [.6, -.8], [.8, -.6]].some(([dx, dz]) => [4, 7, 10, 13, 15.5].some(d => tileAt(x + dx * d, z + dz * d) === 'S')) || [[-2.5, 0], [2.5, 0], [0, -2.5], [0, 2.5]].some(([dx, dz]) => tileAt(x + dx, z + dz) === 'X'); // (not on a road, not at the landing spot, not within 15 m of the sea, not on the rock itself: the foot of the mountain is fine)
    // keep clear of the village (its walls, its inside), the piers and their roads' ends
    const vw = stage.angledWalls ?? [], vpts = vw.flatMap(([a, b, c, d]) => [[a, b], [c, d]]), segDist = (px, pz, [x0, z0, x1, z1]) => { const dx = x1 - x0, dz = z1 - z0, t = Math.max(0, Math.min(1, ((px - x0) * dx + (pz - z0) * dz) / (dx * dx + dz * dz || 1))); return Math.hypot(px - (x0 + dx * t), pz - (z0 + dz * t)); };
    const inVillage = (x, z) => { if (!vpts.length) return false; const xs = vpts.map(q => q[0]), zs = vpts.map(q => q[1]); if (x < Math.min(...xs) - 9 || x > Math.max(...xs) + 9 || z < Math.min(...zs) - 9 || z > Math.max(...zs) + 9) return false; return vw.some(sg => segDist(x, z, sg) < 7) || (() => { let c = false; const P = [vpts[0], vpts[3], vpts[5], vpts[8]].filter(Boolean); for (let i = 0, j = P.length - 1; i < P.length; j = i++) if ((P[i][1] > z) !== (P[j][1] > z) && x < (P[j][0] - P[i][0]) * (z - P[i][1]) / (P[j][1] - P[i][1]) + P[i][0]) c = !c; return c; })(); };
    const nearPier = (x, z) => (stage.piers ?? []).some(pr => segDist(x, z, [pr.x0 - 4, pr.z0, pr.x1 + 4, pr.z1]) < 9);
    // natural placement: groves in patches (a slow noise), thicker toward the foot of the mountains, with a few singles between; none out in the open beach
    const h2 = (i, j) => { const q = Math.sin(i * 127.1 + j * 311.7) * 43758.5453; return q - Math.floor(q); }, vn = (px, pz) => { const i = Math.floor(px), j = Math.floor(pz), fx = px - i, fz = pz - j, u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz); return (h2(i, j) * (1 - u) + h2(i + 1, j) * u) * (1 - v) + (h2(i, j + 1) * (1 - u) + h2(i + 1, j + 1) * u) * v; };
    const footDist = (x, z) => { for (let d = 3; d <= 75; d += 4) for (const [dx, dz] of [[-1, 0], [-1, -.5], [-1, .5], [-.5, -1], [-.5, 1]]) if (tileAt(x + dx * d, z + dz * d) === 'X') return d; return 99; }; // (how far to the rock: the mountains lie along the west)
    const natural = (x, z) => { const patch = Math.min(1, Math.max(0, (vn(x / 34 + 7, z / 34) * .7 + vn(x / 12 + 3, z / 12) * .3 - .45) / .25)), f = 1 - Math.min(1, Math.max(0, (footDist(x, z) - 8) / 60)); let dsea = 60; for (let q = 0; q < 16 && dsea > 18; q++) { const a = q / 16 * Math.PI * 2, dx = Math.cos(a), dz = Math.sin(a); for (let d = 18; d < dsea && d <= 46; d += 4) if (tileAt(x + dx * d, z + dz * d) === 'S') { dsea = d; break; } } const wet = .1 + .9 * Math.min(1, Math.max(0, (dsea - 18) / 26)); // (the soil near the sea is wet: stands thin out within about 45 m of it, and are rare within 20 m)
    const clear = ([cx, cz, r0, r1]) => 1 - .9 * (1 - Math.min(1, Math.max(0, (Math.hypot(x - cx, z - cz) - r0) / r1))), thin = wet * clear([-27, -188.2, 10, 14]) * clear([-30.7, -117.4, 12, 16]); return Math.min(1, (.015 + patch * .07 + f * f * (.5 + .5 * patch)) * thin); }; // (pines grow up to and onto the foot of the rock: thick there, thinning fast with distance; out in the open only a rare stand or a lone tree)
    // pines on the mountain's lower slopes: they climb from the foot up the gentler ground, thickest in the sheltered gullies and low down, thinning and shrinking with height (the stunted trees of a tree line), none on the steep rock
    const slopeAt = (x, z) => Math.hypot(heightAt(x + 1.2, z) - heightAt(x - 1.2, z), heightAt(x, z + 1.2) - heightAt(x, z - 1.2)) / 2.4;
    const intoRock = (x, z) => { for (let d = 0; d <= 26; d += 2) if (tileAt(x + d, z) !== 'X') return d; return 99; }; // (how far inside the rock, measured east to the foot)
    const summitPts = stage.mountains?.summit?.pts, summitPl = stage.mountains?.summit?.plateau; // (no trees near the summit road: they will be placed by hand)
    const nearSummit = (x, z) => summitPts && (summitPts.some(q => Math.hypot(q[0] - x, q[1] - z) < 24) || Math.hypot(x - Math.min(Math.max(x, summitPl.x2 ?? summitPl.x), summitPl.x), z - Math.min(Math.max(z, summitPl.z), summitPl.z2 ?? summitPl.z)) < summitPl.r + 22);
    const farSW = (x, z) => { // in the south-west corner, trees more than 30 m from any ground the jeep can drive on are never seen (the camera reaches about 28 m past the jeep): left out
      if (x > -58 || z < -62) return false;
      for (let q = 0; q < 16; q++) { const a = q / 16 * Math.PI * 2, dx = Math.cos(a), dz = Math.sin(a); for (let d = 0; d <= 30; d += 5) if (tileAt(x + dx * d, z + dz * d) === '.') return false; }
      return true;
    };
    const clips = (x, z) => { const h0 = heightAt(x, z); for (let q = 0; q < 8; q++) { const a = q / 8 * Math.PI * 2, dx = Math.cos(a), dz = Math.sin(a); for (const r of [1.6, 2.6, 3.6]) if (heightAt(x + dx * r, z + dz * r) - h0 > .9 + r * .12) return true; } return false; }; // (a tree's crown reaches about 3.5 m out from the trunk, from about a metre up: ground rising that fast beside it would cut into the foliage)
    const cliffAvoid = (x, z) => nearSummit(x, z) || clips(x, z) || farSW(x, z) || bldgs.some(b => Math.hypot(b.x - x, b.z - z) < 11) || tileAt(x, z) !== 'X' || intoRock(x, z) > 24 || slopeAt(x, z) > .5 || trailPts.some(q => Math.hypot(q[0] - x, q[1] - z) < 8);
    const cliffAccept = (x, z) => { const h = heightAt(x, z), low = 1 - Math.min(1, Math.max(0, (h - 2.5) / 12)), gully = Math.min(1, Math.max(0, (vn(z / 5 + 40, x / 38) - .35) / .35)); return Math.min(1, low * (.25 + .75 * gully) * .95 + .02); };
    const cliffScale = (x, z) => 1 - .5 * Math.min(1, Math.max(0, (heightAt(x, z) - 3) / 12));
    // trees around the landing spot: stands of varying size at a comfortable distance from it (none on the landing zone or the jeep's way out), thickening outward, patchy, never in a ring
    const aroundStart = (x, z) => { const d = Math.hypot(x - sp0.x, z - sp0.z), patch = Math.min(1, Math.max(0, (vn(x / 15 + 31, z / 15 + 9) * .65 + vn(x / 6 + 4, z / 6) * .35 - .42) / .26)); return Math.min(1, (.06 + patch * .9) * Math.min(1, Math.max(0, (d - 16) / 16))); };
    const southOfRoad = (x, z) => z < -12 && z > -50 && trailPts.some(q => Math.abs(q[0] - x) < 10 && q[1] < z); // (the boundary belt at the south edge is not touched)
    const thin = f => (x, z) => f(x, z) * (southOfRoad(x, z) ? .4 : 1);
    const areas = stage.forests.map(a => a.natural ? { ...a, accept: thin(natural) } : a.aroundStart ? { ...a, accept: thin(aroundStart) } : a.cliff ? { ...a, accept: cliffAccept, avoid: cliffAvoid, scaleAt: cliffScale, noBlock: true } : a);
    const onIsland = (x, z) => ((x - 93.4) / 36.5) ** 2 + ((z + 223.6) / 39.5) ** 2 < 1; // (the island in the north-east: no trees there)
    const bldgs = stage.entities.filter(e => ['barracks', 'tent', 'turret', 'gate', 'helipad', 'mediumtank', 'lighttank', 'm270'].includes(e.type)).map(e => toWorld(e.x, e.y)); // (no trees on a hut, a gun or a gate)
    const keep2 = (x, z) => keep(x, z) || nearSummit(x, z) || farSW(x, z) || (z > -54.8 && Math.abs(x - 67.3) < 14 && trailPts.some(q => Math.abs(q[0] - x) < 10 && q[1] > z)) || inVillage(x, z) || nearPier(x, z) || onIsland(x, z) || bldgs.some(b => Math.hypot(b.x - x, b.z - z) < 9);
    const smt = stage.mountains?.summit, padAt = (x, z) => stage.summitPad && Math.hypot(x - stage.summitPad.x, z - stage.summitPad.z) < (stage.summitPad.r ?? 6.2) + 3;
    if (smt) for (const t of stage.summitTrees ?? []) areas.push({ rect: t.rect, count: t.count, seed: t.seed, spacing: t.spacing ?? 4.4, noBlock: true, avoid: (x, z) => { let bd = 1e9, bx = 0; for (const q of smt.pts) { const d = Math.hypot(q[0] - x, q[1] - z); if (d < bd) { bd = d; bx = q[0]; } } return bd < (t.clear ?? 5.6) || (t.westOnly && x > bx) || padAt(x, z) || bldgs.some(b => Math.hypot(b.x - x, b.z - z) < 6); } }); // (trees on the summit's slopes and along its road: kept off the road and the pad)
    const smt2 = stage.mountains?.summit2; // the second ascent: a few pines along its road, in loose groups that thin out with height, none on the steep slopes, the road, the plateau or the mines' ground
    if (smt2) for (const t of stage.summit2Trees ?? []) { const p2 = smt2.plateau, pl2 = (x, z) => Math.hypot(x - Math.min(Math.max(x, p2.x2), p2.x), z - Math.min(Math.max(z, p2.z), p2.z2));
      areas.push({ ...(t.rect ? { rect: t.rect } : { x: t.x, z: t.z, r: t.r }), count: t.count, seed: t.seed, spacing: t.spacing ?? 4, noBlock: true, heavySnow: !!t.heavySnow, lean: t.lean ?? 0, ...(t.scale ? { scaleAt: () => t.scale } : {}), avoid: (x, z) => { let bd = 1e9; for (let q = 0; q < smt2.pts.length; q += 2) { const d = Math.hypot(smt2.pts[q][0] - x, smt2.pts[q][1] - z); if (d < bd) bd = d; }
        const h = heightAt(x, z), alt = Math.min(1, Math.max(0, h / (t.treeline ?? 40))), groups = vn(x / 17 + 11, z / 17) * .65 + vn(x / 6 + 3, z / 6) * .35; // (groups: a slow noise gives clumps and clearings, a fast one frays their edges)
        if (t.fixed) return bd < Math.max(t.clear ?? 5.2, smt2.halfW + 1.3) || slopeAt(x, z) > .62; // (a hand-placed group: no clumping noise, no treeline)
        return bd < Math.max(t.clear ?? 5.2, smt2.halfW + 1.3) || bd > 40 || pl2(x, z) < p2.r + 7 || tileAt(x, z) === 'S' || slopeAt(x, z) > .62 || groups < .42 + .3 * alt || (h > (t.treeline ?? 40)); } }); }
    const forest = buildForests(scene, areas, { heightAt, avoid: keep2, noScots: !!stage.isSecretLevel, snowBoost: stage.isSecretLevel ? .3 : 0 });
    for (const b of forest.boxes) obstacles.push({ ...b, alive: true, kind: 'tree' });
    forestUpdate = forest.cull; forestStats = forest.stats; forestShadow = forest;
  }
  // The secret level's power station on the island (stage.powerStation: { x, z, scale, rot }): the oil-fired plant with its tank farm and fuel pier (assets/powerstation.js), snow on its roofs and tanks, solid to the jeep and the soldiers, with its ruined version ready for when it is destroyed
  let powerPlant = null;
  if (stage.powerStation) {
    const ps = stage.powerStation, S = ps.scale ?? .85, base = heightAt(ps.x, ps.z), snowMats = [];
    const model = buildPowerStation({ snow: (m, k) => { const c = snowCoat(m, k === 'roof' || k === 'band' || k === 'tank' ? { up: .8, rough: 1.2, cling: .3, bare: .95, edge: .1, grain: .08, tilt: .45, bright: 1.05 } : { up: .5, rough: 1.2, cling: 1.2, bare: .95, edge: .1, grain: .08, tilt: .45, bright: 1.02, base: .9 }); snowMats.push(c); return c; } });
    const intact = model.getObjectByName('intact'), ruin = model.getObjectByName('ruin'); mergeStatic(intact); mergeStatic(ruin);
    for (const part of [intact, ruin]) mergeAcross([part], part, { skip: n => /^droneBay|^coreGlow/.test(n.name), okMaterial: m => !m.userData.snowBase && !m.transparent }); // (the parts that are plain, not snow-coated or glass, are merged across the named parts too: a few draw calls for all of them)
    model.scale.setScalar(S); model.position.set(ps.x, base + .05, ps.z); model.rotation.y = (ps.rot ?? 0) * Math.PI / 180; model.updateMatrixWorld(true);
    for (const m of snowMats) { m.userData.snowBase.value = base; m.userData.snowCenter.value.set(ps.x, ps.z); }
    model.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } }); dropTinyShadows(model, 1.4); // (the small pipes, rails and fittings cast no shadow: that was over a hundred draw calls in the shadow pass)
    model.userData.noWater = true; scene.add(model); // (not in the water's reflection or see-through views: from the game camera its mirror image is never in view, so it is not drawn there)
    const a = model.rotation.y, ca = Math.cos(a), sa = Math.sin(a), place = (x0, x1, z0, z1) => { const cx = (x0 + x1) / 2 * S, cz = (z0 + z1) / 2 * S; obstacles.push({ x: ps.x + cx * ca + cz * sa, z: ps.z - cx * sa + cz * ca, hw: Math.abs(x1 - x0) / 2 * S, hd: Math.abs(z1 - z0) / 2 * S, alive: true, kind: 'powerplant' }); }; // (axis-aligned boxes: the plant is not turned)
    [[-15.3, 15.3, -16.3, -9.7], [-13.3, 13.3, -10.3, -1.7], [-8.6, -5.4, -1.3, 1.7], [5.4, 8.6, -1.3, 1.7], [16, 21.6, -15, -7], [-21, -19, -12, -10], [-18.8, -15.2, -13.5, 2.6], [-16.4, -11.6, -.7, 2.7], [-20.3, 20.3, 4.7, 16.3], [-2.2, 2.2, 15.5, 36]].forEach(b => place(...b));
    const stacks = [-7, 7].map(lx => new THREE.Vector3(ps.x + lx * S * ca + .2 * S * sa, base + 23.2 * S, ps.z - lx * S * sa + .2 * S * ca)); // (the tops of the two chimneys: where the smoke comes out)
    powerPlant = { model, intact, ruin, alive: true, stacks };
    { // the plant as a target: 28 hit points, a grenade or a rocket's own blast is 4 of them (so 7 direct hits); bullets and the rocket's split shots do nothing to it (powerplant.js handles what happens as it is hurt, and when it goes)
      const a0 = model.rotation.y, wy0 = (lx, lz) => new THREE.Vector3(ps.x + (lx * Math.cos(a0) + lz * Math.sin(a0)) * S, 0, ps.z + (-lx * Math.sin(a0) + lz * Math.cos(a0)) * S), cen = wy0(.3, 0);
      const target = { x: cen.x, z: cen.z, hw: 21.3 * S, hd: 16.3 * S, r: 2, hp: 28, maxHp: 28, score: 3000, boom: true, shardProof: true, bulletProof: true, solidWreck: true, onHurt: () => powerPlant.onHurt?.(), wreck: (debris, fx, at) => powerPlant.onWreck?.(debris, fx, at) };
      targets.push(target);
      Object.assign(powerPlant, { target, wp: (lx, ly, lz) => { const v = wy0(lx, lz); v.y = base + ly * S; return v; }, S });
    }
    { // the cable that feeds the laser gate (the one that runs off the end of its wall and into the sea) comes up out of the water on the island's west shore, crosses the beach and the snow, and ends at a junction box by the transformer yard's fence: the plant's end of it
      const zc = -243.6, cableMat = new THREE.MeshStandardMaterial({ color: 0x17181a, roughness: .55, metalness: .25 }), clampMat = new THREE.MeshStandardMaterial({ color: 0x7a7f84, roughness: .4, metalness: .8 }), tagMat = new THREE.MeshStandardMaterial({ color: 0xc8a020, roughness: .6 }), cable = new THREE.Group(); cable.name = 'plantCable';
      let xs = ps.x - 40; while (xs < ps.x && tileAt(xs, zc) !== '.') xs += .5;                                  // (where the shore is, on the gate cable's line)
      const yw = (x, z) => heightAt(x, z) + .1, a = model.rotation.y, wy = (lx, lz) => new THREE.Vector3(ps.x + (lx * Math.cos(a) + lz * Math.sin(a)) * S, 0, ps.z + (-lx * Math.sin(a) + lz * Math.cos(a)) * S);
      const endP = wy(22.6, -11), pts = [new THREE.Vector3(xs - 6, -.55, zc + .2), new THREE.Vector3(xs - 3.5, -.32, zc - .1), new THREE.Vector3(xs - 1.2, -.08, zc)];  // (coming up out of the water)
      { // over the beach and the snow to the yard: if a gun's base stands in the way, the cable passes north of it (between the gun and the shore), then comes down the yard's fence to the junction box
        const guns = stage.entities.filter(e => e.type === 'wallturret').map(e => toWorld(e.x, e.y)), gp = guns.filter(g => Math.hypot(g.x - (xs + endP.x) / 2, g.z - (zc + endP.z) / 2) < 12).sort((u, v) => Math.hypot(u.x - endP.x, u.z - endP.z) - Math.hypot(v.x - endP.x, v.z - endP.z))[0];
        const ctl = [new THREE.Vector3(xs + 1.3, 0, zc)];
        if (gp) ctl.push(new THREE.Vector3(gp.x - 3.2, 0, gp.z - 5.6), new THREE.Vector3(gp.x + 1.6, 0, gp.z - 4.5), new THREE.Vector3(endP.x - .1, 0, gp.z - 1.4));
        else ctl.push(new THREE.Vector3((xs + endP.x) / 2, 0, (zc + endP.z) / 2 - 1));
        ctl.push(new THREE.Vector3(endP.x, 0, endP.z));
        const cv = new THREE.CatmullRomCurve3(ctl, false, 'catmullrom', .5);
        for (let i = 0; i < 26; i++) { const q = cv.getPoint(i / 26), w = Math.sin(i * 1.3) * .12 * Math.min(1, i / 4, (26 - i) / 4); pts.push(new THREE.Vector3(q.x, yw(q.x, q.z + w), q.z + w)); } // (with a little give in it: no ruler-straight line)
      }
      pts.push(new THREE.Vector3(endP.x, yw(endP.x, endP.z) + .05, endP.z));
      cable.add(Object.assign(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, false, 'catmullrom', .35), 80, .09, 8, false), cableMat), { castShadow: true }));
      for (let i = 4; i < pts.length - 2; i += 3) { const q = pts[i]; const c = new THREE.Mesh(new THREE.BoxGeometry(.2, .2, .3), clampMat); c.position.copy(q).setY(q.y + .02); cable.add(c); const t2 = new THREE.Mesh(new THREE.BoxGeometry(.22, .05, .12), tagMat); t2.position.copy(q).setY(q.y + .14); cable.add(t2); } // (clamps with warning tags, as on the gate's end)
      const e = pts[pts.length - 1], jb = new THREE.Mesh(new THREE.BoxGeometry(.9, .7, .6), new THREE.MeshStandardMaterial({ color: 0x56635b, roughness: .6, metalness: .3 })); jb.position.set(e.x - .5, e.y + .3, e.z); jb.castShadow = true; cable.add(jb); // (the junction box at the yard's fence)
      const rise = new THREE.Mesh(new THREE.CylinderGeometry(.07, .07, 1.4, 8), cableMat); rise.position.set(e.x - .05, e.y + .75, e.z); cable.add(rise);                                              // (and the cable rising to the fence)
      const ring = new THREE.Mesh(new THREE.TorusGeometry(.6, .05, 6, 16), new THREE.MeshStandardMaterial({ color: 0xc4561a, roughness: .7 })); ring.rotation.x = Math.PI / 2; ring.position.set(xs - 3.5, -.02, zc); cable.add(ring); // (an orange marker ring where it surfaces)
      scene.add(addToLayer(mergeStatic(cable), REFLECT));
    }
    if (navParams.get('plantruin')) { intact.visible = false; ruin.visible = true; powerPlant.alive = false; }
  }
  if (stage.summitPad && stage.summitPad.lights !== false) { const sp0 = stage.summitPad, g = buildSummitPad(sp0.r ?? 6.2); g.position.set(sp0.x, heightAt(sp0.x, sp0.z), sp0.z); scene.add(g); } // the summit's helipad (assets/summitpad.js)
  const flares = (stage.summitFlares ?? []).map(([x, z]) => new THREE.Vector3(x, heightAt(x, z) + .08, z)); // road flares burning on the snow (main.js starts them)
  const flareGlows = []; // each flare: the burnt-down stick lying on the snow with its white-hot tip, and a red pool of light on the ground that flickers (main.js)
  if (flares.length) {
    const gc = document.createElement('canvas'); gc.width = gc.height = 128; const gx = gc.getContext('2d'), gg = gx.createRadialGradient(64, 64, 0, 64, 64, 64);
    gg.addColorStop(0, 'rgba(255,120,90,1)'); gg.addColorStop(.25, 'rgba(255,40,20,.7)'); gg.addColorStop(.6, 'rgba(200,10,0,.25)'); gg.addColorStop(1, 'rgba(160,0,0,0)'); gx.fillStyle = gg; gx.fillRect(0, 0, 128, 128);
    const glowTex = new THREE.CanvasTexture(gc), stickMat = new THREE.MeshStandardMaterial({ color: 0x8a1410, roughness: .7 }), tipMat = new THREE.MeshStandardMaterial({ color: 0xffe0d0, emissive: 0xff8060, emissiveIntensity: 3, roughness: .3 });
    flares.forEach((p, i) => {
      const g = new THREE.Group(); g.position.copy(p); g.rotation.y = i * 2.1 + .7;
      const stick = new THREE.Mesh(new THREE.CylinderGeometry(.035, .04, .4, 8), stickMat); stick.rotation.z = Math.PI / 2 - .12; stick.position.set(0, .05, 0); stick.castShadow = true; g.add(stick);
      const tip = new THREE.Mesh(new THREE.SphereGeometry(.05, 8, 6), tipMat); tip.position.set(.21, .07, 0); g.add(tip);
      const glow = new THREE.Mesh(new THREE.PlaneGeometry(6, 6), new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: .55, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }));
      glow.rotation.x = -Math.PI / 2; glow.position.y = .03; glow.renderOrder = 4; g.add(glow); g.rotation.y = 0; scene.add(g); flareGlows.push(glow);
    });
  }
  if (stage.summitArena) { const arena = buildSummitArena(stage.summitArena, heightAt); scene.add(arena.group); for (const b of arena.boxes) obstacles.push({ ...b, alive: true }); } // (the second summit's plateau: its outpost, rocks, ice crystals, wreck and frozen patch: assets/summit-arena.js)
  const campfires = []; // where fires burn (main.js starts them: flames, sparks, smoke and light, see fire.js)
  (stage.campfires ?? []).forEach((c, i) => { const y = heightAt(c.x, c.z), g = buildCampfire(i + 1); g.position.set(c.x, y, c.z); g.rotation.y = c.rot ?? 0; scene.add(g); obstacles.push({ x: c.x, z: c.z, hw: 1.0, hd: 1.0, alive: true, kind: 'campfire' }); campfires.push(new THREE.Vector3(c.x, y + .3, c.z)); });
  for (const pr of stage.piers ?? []) { // piers over the water: drawn, the jeep drives onto them (the deck's height is the ground's there), the rails and the far end keep it on
    const pier = buildPier({ ...pr, groundAt: heightAt(pr.x0, pr.z0) }); mergeStatic(pier.group); /* (the deck's planks, the piles, beams and rail posts: hundreds of pieces become a few meshes, one per material) */ scene.add(pier.group); pierList.push(pier);
    for (const b of pier.rails) obstacles.push({ ...b, alive: true, kind: 'pierrail' }); // (a handrail: it keeps the jeep on the pier, but rockets, bullets and flames pass over it)
    const moor = (bx, bz, rotY) => { // the stage 3 patrol boat moored at (bx, bz), nose along rotY: nobody aboard, it just sits; and it can be shot: one grenade or four bullets sink it (it burns, half under, tilted, blackened)
      const boat = mergeStatic(buildPatrolBoat()); boat.scale.setScalar(1.33); boat.updateMatrixWorld(true); const bb = new THREE.Box3().setFromObject(boat); pierBoatFoot.push({ boat, hl: (bb.max.z - bb.min.z) / 2, hw: (bb.max.x - bb.min.x) / 2, cx: (bb.max.x + bb.min.x) / 2, cz: (bb.max.z + bb.min.z) / 2 }); boat.position.set(bx, .02, bz); boat.rotation.y = rotY; scene.add(addToLayer(boat, REFLECT));
      const mb = { hull: boat.getObjectByName('hull'), phase: Math.random() * 6.28, dead: false }; if (mb.hull) mooredBoats.push(mb);
      const sideways = Math.abs(Math.sin(rotY)) > .7; // (a boat lying east-west: its hit box runs along x)
      targets.push({ id: 'pierboat' + targets.length, object: boat, x: boat.position.x, z: boat.position.z, r: 4.2, hw: sideways ? 5.2 : 1.9, hd: sideways ? 1.9 : 5.2, hp: 4, score: 500, boom: true,
        wreck: (debris, fx) => {
          mb.dead = true; const at = boat.position.clone(); char(boat, .35); boat.position.y -= .9; boat.rotation.z = .13; boat.rotation.x = -.06;
          fx.explosion(at.clone().setY(1.4), 2.2); fx.scorch?.(at, 4); fx.smoke(at.clone().setY(1.2), 8);
          for (let i = 0; i < 10; i++) debris.chunk(at.clone().setY(1.2), rubble(0x3a3a34), .15 + Math.random() * .3, 4);
          fx.fires?.start([at.clone().setY(.3), at.clone().add(new THREE.Vector3(1.2, 0, 2)).setY(.3), at.clone().add(new THREE.Vector3(-1, 0, -2.5)).setY(.3)]);
        } });
    };
    if (pr.boat) moor(pr.x1 + (pr.width ?? 3.2) / 2 + 2.6, pr.z1 + 2.5, 0); // (alongside the far end)
    if (pr.boats) { // boats moored along the sides of the pier: { at: metres from its shore end, side: +1 / -1 }, lying parallel to it, nose toward its far end
      const L = Math.hypot(pr.x1 - pr.x0, pr.z1 - pr.z0), ux = (pr.x1 - pr.x0) / L, uz = (pr.z1 - pr.z0) / L, off = (pr.width ?? 3.2) / 2 + 2.3;
      for (const q of pr.boats) { if (q.end) moor(pr.x1 + q.end[0], pr.z1 + q.end[1], q.rot ?? 0); /* (one moored at the far end, at an offset from its tip, with its own heading) */ else moor(pr.x0 + ux * q.at - uz * q.side * off, pr.z0 + uz * q.at + ux * q.side * off, Math.atan2(-ux, -uz)); }
    }
  }
  if (stage.angledWalls?.length) { // the secret level's POW village: compound walls at an angle. Drawn as the same panels, turned; blocked by a row of small boxes along each (the obstacle boxes are axis-aligned)
    const pieces = []; // (each wall is cut into short pieces, each stood on the snow slope where it is: the ground rises toward the mountain, and a wall laid flat at height 0 sank into it)
    for (const [x0, z0, x1, z1] of stage.angledWalls) {
      const len = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.round(len / 3)), ang = Math.atan2(-(z1 - z0), x1 - x0);
      for (let i = 0; i < n; i++) { const t = (i + .5) / n, x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t; pieces.push({ x, y: heightAt(x, z) - .08, z, hw: 1, hd: 1, ang, half: len / n / 2 + .02 }); }
    }
    thinWalls(pieces, false);
    for (const [x0, z0, x1, z1] of stage.angledWalls) { const len = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.ceil(len / 1.1)); for (let i = 0; i <= n; i++) obstacles.push({ x: x0 + (x1 - x0) * i / n, z: z0 + (z1 - z0) * i / n, hw: .75, hd: .75, alive: true, kind: 'wall' }); }
  }
  const sp = stage.secretPad;
  if (sp?.walls) { // the secret helipad's compound: the same precast wall, a square round the pad with a gap in its east side (facing the map) for the energy gate
    const { x0, x1, z0, z1 } = sp.walls, h = .65, g = sp.gate;
    thinWalls([{ x: (x0 + x1) / 2, z: z0, hw: (x1 - x0) / 2 + h, hd: h }, { x: (x0 + x1) / 2, z: z1, hw: (x1 - x0) / 2 + h, hd: h }, { x: x0, z: (z0 + z1) / 2, hw: h, hd: (z1 - z0) / 2 + h },
      { x: x1, z: (z0 + g.z0) / 2 - h / 2, hw: h, hd: (g.z0 - z0) / 2 + h / 2 }, { x: x1, z: (z1 + g.z1) / 2 + h / 2, hw: h, hd: (z1 - g.z1) / 2 + h / 2 }], false);
  }
  let clock = 0; // drives the pad lights' flashing
  const pickups = [];
  const topplers = []; // stage 2's toppling pillars: { drums, at, base (its height), length, spec (the stage's entry) }
  const skinMats = new Map(); // (the wall guns' skinned tops: their own copies of the materials, see below)
  const turrets = [], spinners = [], statues = [], lasers = []; // lasers: stage 3's force-field emitters (lasers.js) // turrets: { top (rotating part), base, target }; statues: { obj, target } (statues.js)
  let start = new THREE.Vector3(), helipad = null, paintedPad = null; // (paintedPad: stage 6's pad, painted on the road: its circle is at the entity's own spot)
  const camoSpots = [], displayTanks = [], soldierSpots = [], flameSoldierSpots = [], tankSpots = [], jeepSpots = []; // jeepSpots: enemy jeeps (enemy-jeeps.js)
  // Stage 2: pillars standing in a row share one continuous stepped base (a stylobate) instead of
  // separate plinths, as on the NES, where their plinths run together into a raised band. Rows are
  // pillars spaced a plinth apart along one line; each row gets a two-step stone base and its
  // pillars are raised onto it (ent.raise). The base blocks the jeep, like the row of pillars.
  function colonnadeBases() {
    const cols2 = stage.entities.filter(e => e.type === 'column'), STEP = .2, chains = [];
    const chain = (key, along, gap) => {
      const groups = new Map();
      for (const c of cols2) { const k = Math.round(c[key] / 6); (groups.get(k) ?? groups.set(k, []).get(k)).push(c); }
      for (const g of groups.values()) {
        g.sort((a, b) => a[along] - b[along]);
        let run = [g[0]];
        for (let i = 1; i <= g.length; i++) {
          if (i < g.length && g[i][along] - g[i - 1][along] <= gap) { run.push(g[i]); continue; }
          if (run.length >= 2) chains.push({ run, along });
          run = [g[i]];
        }
      }
    };
    chain('y', 'x', 36); // rows across the screen
    chain('x', 'y', 52); // rows running up the screen
    const mat = limestone(9, '#aaa292'), lip = limestone(10, '#9a9283'), g = new THREE.Group(); // weathered limestone, a shade darker than the columns
    for (const { run, along } of chains) {
      const a0 = run[0][along], a1 = run[run.length - 1][along], other = run.reduce((t, c) => t + c[along === 'x' ? 'y' : 'x'], 0) / run.length;
      const mid = along === 'x' ? toWorld((a0 + a1) / 2, other) : toWorld(other, (a0 + a1) / 2);
      const len = (a1 - a0) * PX + 3, h = Math.max(...run.map(c => { const q = toWorld(c.x, c.y); return tileAt(q.x, q.z) === 'E' ? TERRACE_H + .1 : heightAt(q.x, q.z); }));
      for (const [w, y0, m] of [[3.4, 0, lip], [2.9, STEP, mat]]) { // lower step a little wider
        const box = new THREE.Mesh(new THREE.BoxGeometry(along === 'x' ? len + .5 : w, STEP, along === 'x' ? w : len + .5), m);
        box.position.set(mid.x, h + y0 + STEP / 2, mid.z); box.castShadow = box.receiveShadow = true; g.add(box);
      }
      for (const c of run) c.raise = 2 * STEP;
      obstacles.push({ x: mid.x, z: mid.z, hw: (along === 'x' ? len : 2.9) / 2, hd: (along === 'x' ? 2.9 : len) / 2, alive: true, kind: 'blocker' });
    }
    scene.add(mergeStatic(g));
  }

  const standY = (x, z) => tileAt(x, z) === 'E' ? TERRACE_H + .1 : heightAt(x, z); // on a terrace's edge: on top of its wall
  // Stage 6's barricades (a hundred and ninety of them) are drawn as instances: each kind is built once or twice (a couple of variants) and every barricade is a transform of it, so a kind costs a handful of draw
  // calls whatever their number, instead of five or six a barricade in every pass (main view, shadow map, the puddles' mirror).
  const BARRICADE_MATS = {}; // (the two shared materials of the joined barricade parts)
  const INSTANCED = { hedgehog: 1, sandbags: 1, drumstack: 2, cratestack: 2 }, instanceBatches = new Map();
  const addInstance = (ent, spec, p, face) => {
    const variants = INSTANCED[ent.type], v = Math.abs(Math.floor(ent.x * 7 + ent.y * 3)) % variants, key = ent.type + v + (ent.look ?? '');
    let b = instanceBatches.get(key);
    if (!b) { const t = mergeStatic(spec.build({ ...ent, x: 17 + v * 41, y: 29 + v * 67 })); dropTinyShadows(t); t.updateMatrixWorld(true); b = { template: t, list: [] }; instanceBatches.set(key, b); }
    const k = .96 + (Math.abs(Math.floor(ent.x * 13 + ent.y * 7)) % 9) / 100, m = new THREE.Matrix4();
    m.compose(new THREE.Vector3(p.x, standY(p.x, p.z), p.z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), face), new THREE.Vector3(k, k, k));
    b.list.push(m);
    return new THREE.Object3D(); // (a stand-in for the code below, which only nudges or reads it)
  };
  const flushInstances = () => {
    for (const { template, list } of instanceBatches.values()) {
      const meshes = []; template.traverse(o => { if (o.isMesh) meshes.push(o); });
      // The plain painted parts (steel, drum paint, crates, wire: no texture) were a mesh, and so a draw call, for every colour: five or six a variant. They are joined into one mesh for the metal ones and one for the matt ones, each part's colour
      // carried in its vertices, so a variant costs two draw calls whatever colours it has. (Their shininess is the average of the kind; the textured parts, the sandbags, are left as they are.)
      const plain = meshes.filter(m => !Array.isArray(m.material) && !m.material.map && !m.material.bumpMap && !m.material.emissiveMap && !m.material.transparent && m.material.isMeshStandardMaterial && m.geometry.attributes.position);
      for (const metal of [true, false]) {
        const group = plain.filter(m => (m.material.metalness > .3) === metal); if (group.length < 2) continue;
        const geos = group.map(m => { template.updateMatrixWorld(true); const g = worldGeometry(m), n = g.attributes.position.count, col = new Float32Array(n * 3), c = m.material.color; for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; } g.setAttribute('color', new THREE.BufferAttribute(col, 3)); return g; });
        const geo = mergeGeometries(geos); if (!geo) continue;
        const mat = (metal ? (BARRICADE_MATS.metal ??= new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .55, metalness: .6, envMapIntensity: .35 })) : (BARRICADE_MATS.matt ??= new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .85, metalness: .03, envMapIntensity: .35 })));
        const im = new THREE.InstancedMesh(geo, mat, list.length);
        list.forEach((m, i) => im.setMatrixAt(i, m));
        im.castShadow = group.some(m => m.castShadow); im.receiveShadow = group.some(m => m.receiveShadow); im.frustumCulled = false; im.instanceMatrix.needsUpdate = true; im.userData.mirror = true; scene.add(im);
        for (const m of group) meshes.splice(meshes.indexOf(m), 1);
      }
      for (const mesh of meshes) {
        const im = new THREE.InstancedMesh(mesh.geometry, mesh.material, list.length), t = new THREE.Matrix4();
        list.forEach((m, i) => im.setMatrixAt(i, t.multiplyMatrices(m, mesh.matrixWorld)));
        im.castShadow = mesh.castShadow; im.receiveShadow = mesh.receiveShadow; im.frustumCulled = false; im.instanceMatrix.needsUpdate = true; im.userData.mirror = true; scene.add(im);
      }
    }
    instanceBatches.clear();
  };
  const place = (obj, p, face = 0) => { obj.position.copy(p).setY(standY(p.x, p.z)); obj.rotation.y = face; scene.add(obj); return obj; };

  colonnadeBases();
  const cactusSpots = [], rockSpots = [], launcherSpots = [], dronePads = [], yardObjs = []; // (yardObjs: the container yard's boxes and piles, for rerollContainers)
  let entIndex = -1;
  for (const ent of stage.entities) {
    entIndex++;
    if (ent.type === 'container' || ent.type === 'containerpile') ent.seedOff ??= stage.containerSeed ?? 0; // (stage.containerSeed: the hand-picked set of colours, wear and open doors for the yard)
    const p = toWorld(ent.x, ent.y), hw = (ent.w || 16) * PX / 2, hd = (ent.h || 16) * PX / 2;
    if (ent.type === 'start') { start = p; continue; }
    if (ent.type === 'mudlauncher') { launcherSpots.push(Object.assign(p.clone(), { dry: !!ent.dry })); continue; } // placed by MudLaunchers
    if (ent.type === 'dronepad') { dronePads.push(p); continue; } // placed by DronePads
    if (ent.type === 'fallingrock') { p.dragK = ent.dragK; p.gravK = ent.gravK; p.turn = ent.turn; rockSpots.push(p); continue; } // placed by FallingRocks
    if (ent.type === 'camoturret') { camoSpots.push(p); continue; } // placed by CamoTurrets
    if (ent.type === 'displaytank') { displayTanks.push({ p, kind: ent.kind }); continue; } // placed by Tanks: parked and dead still, no gun, no target (to look at a tank's size)
    if (ent.type === 'flamesoldier') { flameSoldierSpots.push(p); continue; } // brought to life by FlameSoldiers
    if (ent.type === 'soldier') { soldierSpots.push(p); continue; } // brought to life by Soldiers
    if (ent.type === 'enemyjeep') { jeepSpots.push(p); continue; } // placed by EnemyJeeps
    if (ent.type === 'lighttank' || ent.type === 'mediumtank' || ent.type === 'flametank') { tankSpots.push({ p, kind: ent.type === 'lighttank' ? 'light' : ent.type === 'flametank' ? 'flame' : 'medium', hidden: !!ent.hidden, yaw: ent.yaw }); continue; } // placed by Tanks
    if (ent.type === 'cactus') { cactusSpots.push({ p, size: ent.size ?? 12 }); continue; } // drawn together, below
    if (ent.type === 'helipad') {
      helipad = p.clone(); if (ent.paint) paintedPad = p.clone();
      // flashing perimeter lights where the NES map has its ring of drums (slab and markings: buildHelipadSlab)
      // rows along the landing square's top and bottom and a column on the side away from the STOP
      // apron (the ring is open toward the apron), in the pad's own coordinates
      const sq = ent.lights ? null : helipadCircle?.square, spots = ent.lights ? ent.lights.map(([dx, dy]) => [dx * PX, dy * PX]) : []; // (ent.lights: where the level gives the ring, in NES px from the pad's middle: stage 6's pad is painted, not a slab)
      if (sq) {
        const x0 = sq.x0 - p.x, x1 = sq.x1 - p.x, z0 = sq.z0 - p.z, z1 = sq.z1 - p.z, west = helipadCircle.apronWest;
        for (let i = 0; i < 6; i++) { const x = x0 + .6 + i * (x1 - x0 - 1.2) / 5; spots.push([x, z0 - .9], [x, z1 + .9]); }
        for (let j = 0; j < 3; j++) spots.push([west ? x1 + 1.1 : x0 - 1.1, (z0 + z1) / 2 + (j - 1) * 2.6]);
      }
      const ccx = sq ? (sq.x0 + sq.x1) / 2 - p.x : 0, ccz = sq ? (sq.z0 + sq.z1) / 2 - p.z : 0;
      // numbered clockwise round the ring (seen from above) for the chase sequence
      spots.sort((a, b) => Math.atan2(a[1] - ccz, a[0] - ccx) - Math.atan2(b[1] - ccz, b[0] - ccx));
      const pad = new THREE.Group();
      spots.forEach(([x, z], i) => { const d = buildPadLight(i, spots.length); d.position.set(x, 0, z); pad.add(d); });
      pad.traverse(o => { if (o.name === 'padLight' || o.name === 'lens') o.name = ''; }); // let the lights merge into a few meshes
      place(mergeStatic(pad), p);
      continue;
    }
    const spec = SPAWN[ent.type];
    if (!spec) { console.warn('no spawn rule for', ent.type); continue; }
    // stage 2's toppling pillar (stage.toppling, see toppling.js): built as a stump and, on it, its
    // upper drums as a separate piece that can come away (the joint is a plain drum seam till then)
    const topSpec = ent.type === 'column' ? [].concat(stage.toppling ?? []).find(t => Math.hypot(p.x - t.x, p.z - t.z) < 1.5) : null, topples = !!topSpec;
    const TOPPLE_BREAK = topSpec?.breakAt ?? 2.2; // m up the shaft where it breaks
    const entFace = (spec.face || 0) + (ent.rot ?? 0) * Math.PI / 180;
    const obj = INSTANCED[ent.type] && !topples ? addInstance(ent, spec, p, entFace) : place(mergeStatic(topples ? buildColumn(ent.x * 31 + ent.y * 7, TOPPLE_BREAK, false, false) : spec.build(ent)), p, (spec.face || 0) + (ent.rot ?? 0) * Math.PI / 180); // (ent.rot: degrees, turns the object about its middle; + is counter-clockwise seen from above)
    if (ent.type === 'gate' && ent.curtain) { const cg = getCurtainGate(); if (cg) { // the curtain gate stands as high as the highest ground under it (so the walls on both sides join its pylons); each pylon is made longer downward, to the lowest ground under it, and the curtain reaches down to the road
      const centre = heightAt(p.x, p.z), drop = Math.max(0, cg.y - centre); obj.position.y = cg.y;
      for (const o of obj.children) if (o.isMesh && gatePylonMats().includes(o.material)) {
        const sx = o.geometry.boundingBox ? 0 : (o.geometry.computeBoundingBox(), 0), cx = (o.geometry.boundingBox.min.x + o.geometry.boundingBox.max.x) / 2 + o.position.x; // (this pylon's middle along the gate)
        let low = 1e9; for (const u of [-.65, 0, .65]) for (const v of [-.95, 0, .95]) low = Math.min(low, heightAt(p.x + cx + u, p.z + v));
        const ext = Math.max(0, cg.y - low) + .3, pos = o.geometry.attributes.position; for (let i = 0; i < pos.count; i++) if (pos.getY(i) < o.geometry.boundingBox.min.y + .01) pos.setY(i, pos.getY(i) - ext);
        pos.needsUpdate = true; o.geometry.computeBoundingBox(); o.geometry.computeBoundingSphere();
      }
      const cu = obj.getObjectByName('curtain'); if (cu) { cu.position.y = -drop; cu.scale.y = (3.3 + drop) / 3.3; }
      for (const o of obj.children) if (o.name === 'curtainLens') o.position.y -= drop * 0; } }
    if (ent.type === 'container' || ent.type === 'containerpile') { obj.userData.ent = ent; yardObjs.push(obj); }
    if (['tent', 'hut', 'barracks', 'gate'].includes(ent.type) && !obj.isInstancedMesh && ent.w && ent.h && stage.isSecretLevel) { // (the secret level's snow slopes: a building stands on the highest ground under its footprint, not the ground at its middle, so no corner of it sinks)
      const sc = (ent.scale ?? 1.2) * 1.15, hw = ent.w / 6.4 / 2 * sc + .4, hd = ent.h / 6.4 / 2 * sc + .4, a = (ent.rot ?? 0) * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a); let top = obj.position.y;
      for (const [u, v] of [[-1, -1], [1, -1], [-1, 1], [1, 1], [0, 0], [-1, 0], [1, 0], [0, -1], [0, 1]]) { const lx = u * hw, lz = v * hd; top = Math.max(top, heightAt(p.x + lx * ca + lz * sa, p.z - lx * sa + lz * ca)); }
      obj.position.y = top + .08; // (a little proud of the snow: the floor inside a blown-open hut was being swallowed by it)
    }
    if (ent.snowRoof) obj.traverse(o => { const u = o.material?.userData?.snowBase; if (u) { u.value = obj.position.y; o.material.userData.snowCenter.value.set(obj.position.x, obj.position.z); o.material.userData.snowFace.value.set(Math.sin(obj.rotation.y), Math.cos(obj.rotation.y)); } }); // (and which way the hut's window wall faces: its snow stays as it is, the other sides' is lowered) // (a snowy hut's foot height, so its snow can be measured up from the ground)
    dropTinyShadows(obj, ['tent', 'powhut', 'barracks', 'hut'].includes(ent.type) ? 1.1 : .3); // (the small pieces of a prop: no shadow of their own; the huts are made of many small pieces, so their limit is higher)
    if (topples) {
      const seed = ent.x * 31 + ent.y * 7, h = columnHeight(ent);
      const drums = mergeStatic(buildColumnDrums(seed, h - TOPPLE_BREAK, (ent.x * 13 + ent.y) % 5 !== 0));
      drums.position.copy(obj.position).setY(obj.position.y + (ent.raise ?? 0) + .9 + TOPPLE_BREAK); scene.add(drums);
      topplers.push({ drums, at: p.clone(), base: drums.position.y, length: h - TOPPLE_BREAK, spec: topSpec });
    }
    if (ent.raise) obj.position.y += ent.raise; // standing on a colonnade's base
    if (ent.lift ?? spec.lift) obj.position.y += ent.lift ?? spec.lift; // (ent.lift: this one's own height, e.g. a gun on a roof) // (stage 3's lasers: up on a roof)
    let ob = null;
    const cs = spec.collide ?? 1; // (collide: shrinks the driving collision box only, the target's hit box keeps its size)
    const turned = !!spec.depth && Math.abs(Math.sin((ent.rot ?? 0) * Math.PI / 180)) > .7; // (a gate turned a quarter: it runs along Z, so its fixed depth is the X half-size)
    if (spec.block) { const bk = typeof spec.block === 'function' ? spec.block(ent) : spec.block; ob = { x: p.x, z: p.z, hw: (turned ? spec.depth : hw * bk) * cs, hd: (turned ? hd * bk : spec.depth ?? hd * bk) * cs, alive: true, kind: spec.kind ?? ent.type, isTarget: !!spec.target, top: spec.top ? spec.top(ent) : 0 }; obstacles.push(ob); } // (depth: a fixed half-depth, m, for things much thinner than their sprite)
    if (ob && ent.type === 'gate' && ent.rot) { // a gate turned by rot (the POW village's): one axis-aligned box can't cover its doors, so a row of small squares runs along them (all gone with the doors)
      const a = ent.rot * Math.PI / 180, dx = Math.cos(a), dz = -Math.sin(a), half = Math.max(hw, hd), n = Math.ceil(half * 2 / 1.0); // (half: the gate's whole length, whichever of its w and h it was given as: stage 5's secret gate is w 8, h 64, so hw alone left all but its middle 2.7 m open) ob.hw = ob.hd = .75;
      for (let i = 0; i <= n; i++) { const k = -half + 2 * half * i / n; if (Math.abs(k) < .01) continue; const o = { x: p.x + dx * k, z: p.z + dz * k, hw: .75, hd: .75, kind: ob.kind, get alive() { return ob.alive; }, set alive(v) { } }; obstacles.push(o); }
    }
    if (ent.type === 'gate' && ent.curtain) { // a power cable from the east emitter, down the pylon and round to the fence's north side, along its foot and out over the beach into the sea: the curtain is fed from out there (the island's power station)
      const gx = p.x, gz = p.z, g0 = heightAt(gx + 4.4, gz + .2), pts = [new THREE.Vector3(gx + 4.465, obj.position.y + .1, gz + .71), new THREE.Vector3(gx + 4.46, Math.max(g0 + .25, obj.position.y - .05), gz + .72), new THREE.Vector3(gx + 4.4, g0 + .08, gz + .3), new THREE.Vector3(gx + 4.4, heightAt(gx + 4.4, gz - .6) + .08, gz - .6), new THREE.Vector3(gx + 4.5, heightAt(gx + 4.5, gz - 1.3) + .08, gz - 1.3), new THREE.Vector3(gx + 4.9, heightAt(gx + 4.9, gz - 1.9) + .08, gz - 1.9), new THREE.Vector3(gx + 5.6, heightAt(gx + 5.6, gz - 3.4) + .08, gz - 3.4)];
      let x = gx + 6, k = 0; const zc = gz - 4.2;
      while (x < gx + 90) { // along the wall's foot, wandering a little, until it reaches the water
        const z = zc + Math.sin(k * .9) * .28, h = heightAt(x, z); if (!waterAt(x, z) && tileAt(x, z) !== 'S') pts.push(new THREE.Vector3(x, h + .08, z)); else break; x += 1.6; k++;
      }
      let ex = x, ez = zc; for (let i = 1; i <= 4; i++) pts.push(new THREE.Vector3(ex + i * 1.6, -.1 - i * .18, ez + Math.sin((k + i) * .9) * .28)); // (down into the water)
      const curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', .35), cableMat = new THREE.MeshStandardMaterial({ color: 0x17181a, roughness: .55, metalness: .25 }), cable = new THREE.Group(); cable.name = 'powerCable';
      const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, Math.max(12, Math.round(pts.length * 5)), .085, 8, false), cableMat); tube.castShadow = true; cable.add(tube);
      const clampMat = new THREE.MeshStandardMaterial({ color: 0x7a7f84, roughness: .4, metalness: .8 }), tagMat = new THREE.MeshStandardMaterial({ color: 0xc8a020, roughness: .6 });
      for (let i = 2; i < pts.length - 4; i += 3) { const q = pts[i]; const c = new THREE.Mesh(new THREE.BoxGeometry(.2, .2, .3), clampMat); c.position.copy(q).setY(q.y + .02); cable.add(c); const t = new THREE.Mesh(new THREE.BoxGeometry(.22, .05, .12), tagMat); t.position.copy(q).setY(q.y + .14); cable.add(t); } // (clamps with warning tags)
      { // a jumper from the west emitter's gland, down its pylon, round to the north side (the far side of the gate: the player can't reach it) and across the road there, to join the cable at the east emitter
        const gy = (x, z) => heightAt(x, z) + .08, hp = [new THREE.Vector3(gx - 4.465, obj.position.y + .1, gz - .01), new THREE.Vector3(gx - 4.46, Math.max(heightAt(gx - 4.4, gz - .3) + .25, obj.position.y - .05), gz - .1), new THREE.Vector3(gx - 4.45, gy(gx - 4.45, gz - .7), gz - .7), new THREE.Vector3(gx - 4.7, gy(gx - 4.7, gz - 1.7), gz - 1.7)];
        for (const u of [-4.2, -3.1, -1.7, -.4, .9, 2.0, 3.1, 4.0]) { const z = gz - 2.55 + Math.sin(u * 1.1 + .6) * .38 + Math.sin(u * 2.7) * .12, x = gx + u + Math.sin(u * 3.3) * .1; hp.push(new THREE.Vector3(x, gy(x, z), z)); } // (a lazy S along the ground: no ruler-straight line)
        hp.push(new THREE.Vector3(gx + 4.8, gy(gx + 4.8, gz - 2.75), gz - 2.75), new THREE.Vector3(gx + 5.25, gy(gx + 5.25, gz - 2.95), gz - 2.95));
        const jt = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(hp, false, 'catmullrom', .35), 60, .085, 8, false), cableMat); jt.castShadow = true; cable.add(jt);
        for (const q of [hp[3], hp[7], hp[10]]) { const c = new THREE.Mesh(new THREE.BoxGeometry(.2, .2, .3), clampMat); c.position.copy(q).setY(q.y + .02); cable.add(c); const t = new THREE.Mesh(new THREE.BoxGeometry(.22, .05, .12), tagMat); t.position.copy(q).setY(q.y + .14); cable.add(t); }
      }
      scene.add(mergeStatic(cable));
    }
    if (ob && ent.type === 'gate' && ent.curtain) ob.alive = false; // (a curtain of energy is no wall: the jeep drives into it and is destroyed (main.js), and shots fly through; the gate stays a target for grenades)
    if (stage.rain && ob && !ent.lift && obj.userData?.tops) { // (containers: each box's own top, not one height over the whole pile: a pile is stepped, and splashes over its low boxes floated at the height of the highest)
      const ph = obj.rotation.y, pc = Math.cos(ph), ps = Math.sin(ph);
      for (const t of obj.userData.tops) { const th = t.ry + ph, ca = Math.abs(Math.cos(th)), sa = Math.abs(Math.sin(th)); rainTops.push({ x: obj.position.x + t.x * pc + t.z * ps, z: obj.position.z - t.x * ps + t.z * pc, hw: ca * t.hl + sa * t.hw, hd: sa * t.hl + ca * t.hw, h: obj.position.y + t.h }); }
    } else if (stage.rain && ob && !ent.lift) { const tb = new THREE.Box3().setFromObject(obj); if (!tb.isEmpty() && tb.max.y > .4) rainTops.push({ x: (tb.min.x + tb.max.x) / 2, z: (tb.min.z + tb.max.z) / 2, hw: (tb.max.x - tb.min.x) / 2, hd: (tb.max.z - tb.min.z) / 2, h: tb.max.y }); } // (the real top of what stands here: huts, tents, jets...)
    const tz = ent.type === 'container' ? obj.userData?.topperZ : undefined, tp = tz !== undefined ? (obj.updateMatrixWorld(true), obj.localToWorld(new THREE.Vector3(0, 0, tz))) : null; // (a single container with a second box set on one half: that half stands two high)
    if (tp && ob) ob.top = 2 * 2.62;
    if (spec.blocks) for (const b of spec.blocks(p, ent)) obstacles.push({ ...b, alive: true, kind: b.kind ?? ent.type, ...(tp && Math.hypot(b.x - tp.x, b.z - tp.z) < 1.9 ? { top: 2 * 2.62 } : {}) });
    if (ent.type === 'conveyor') { conveyors.push({ x: p.x, z: p.z, hw: (ent.w * PX - 2 * RAIL) / 2, hd: ent.h * PX / 2, v: ent.speed ?? 3.4, ribPitch: 4 }); } // (stage 6: carries the jeep south)
    // a target's hit box is the same square as its collision box, so anything that hits it damages it
    if (spec.target && !(ent.type === 'gate' && ent.curtain)) targets.push({ id: 'e' + entIndex, object: obj, x: p.x, z: p.z, r: Math.max(hw, hd) * .8, hw: ob ? ob.hw / cs : hw * .8, hd: ob ? ob.hd / cs : hd * .8,
      ...spec.target, ...(spec.hit ? { hw: spec.hit.hw, hd: spec.hit.hd, r: spec.hit.r, z: p.z + spec.hit.dz } : {}), ...(ent.type === 'gate' && ent.rot ? { hw, hd: hw, r: hw * .8 } : {}), obstacle: ob, ...(ent.star ? { reveals: true } : {}), ...(['barracks', 'tent', 'hut', 'powhut'].includes(ent.type) ? { boom: true } : {}), // (boom: a building coming down has its own, heavier explosion sound) // (reveals: the hidden star where it stands comes out when it's destroyed)
      wreck: (debris, fx, from) => wreck(scene, ent.type, obj, debris, fx, from) });
    if (ent.type === 'laser') lasers.push(obj);
    if (ent.type === 'statue' || ent.type === 'bust') statues.push({ obj, target: targets[targets.length - 1], boss: ent.type === 'bust' }); // its mouth fires missiles
    if (ent.type === 'm270') { const mz = obj.getObjectByName('boom'), muzzle = new THREE.Object3D(); muzzle.name = 'muzzle'; muzzle.position.set(0, .4, -3.7); mz.add(muzzle); // (the front of the launcher box, up where it is pitched)
      turrets.push({ top: obj.getObjectByName('turret'), base: obj, target: targets[targets.length - 1], cannon: true, shell: HEAVY_SHELL, burstSize: 9, burstGap: .13, scatter: .3, reloadK: 1.8, turnRate: 2, range: 33.6 }); } // (a ripple of nine heavy shells, each a little off the line, a tenth of a second or so apart; reloading 1.8 times as long as a turret: about 40% less often)
    if (ent.type === 'turret') turrets.push({ top: obj.getObjectByName('turret'), base: obj, target: targets[targets.length - 1], cannon: true });
    if (ent.type === 'wallturret') turrets.push({ top: obj.getObjectByName('turret'), base: obj, target: targets[targets.length - 1], cannon: true, lofted: true, range: ent.range ?? 38, scan: ent.scan, turnRate: 3.2 }); // (range: 38 m, a long reach (the emplacement's is 28); turnRate: it swings round quickly) (lofted: it stands on a wall, so the wall under it does not count as in the way, see EnemyFire)
    if (ent.type === 'wallturret' && stage.isSecretLevel) { const tp = obj.getObjectByName('turret'); if (tp) { tp.traverse(o => { if (o.isMesh && !Array.isArray(o.material)) o.material = skinMats.get(o.material) ?? skinMats.set(o.material, o.material.clone()).get(o.material); }); /* (the skinned top gets materials of its own, shared by the six tops but not by the bases: a material drawn both as a skinned mesh and as a plain one made the plain base parts (collar, cap, ring) follow the live gun's recoil) */ } if (tp) skinify(tp, tp.getObjectByName('gun') ? ['gun'] : []); } /* (the island's wall guns only: skinned top, a few draw calls; elsewhere, stage 6's roof guns, they are built as they always were) */ // (the gun's turning top is skinned: the turret and its barrel, which slides in recoil, are the bones, so the whole top is a few draw calls)
    if (ent.type === 'wallturret' && ent.scan) { const tp = obj.getObjectByName('turret'); if (tp) tp.rotation.y = ent.scan.start ?? 0; } // (a guard starts out facing its own way)
    if (ent.type === 'turret') { const gun = obj.getObjectByName('turret'); obj.traverse(o => { if (!o.isMesh) return; for (let q = o.parent; q; q = q.parent) if (q === gun) return; o.userData.baseShadow = true; }); } // (the low concrete base: it casts a shadow only at ULTRA, see quality.js)
    if (ent.type === 'pickup') { spinners.push(obj.getObjectByName('star')); pickups.push(obj); } // hidden until shot (Pickups)
  }

  flushInstances(); // (the barricades, as instances)
  buildCacti(cactusSpots);
  // Stage 2's little desert plants: clumps of two to four ribbed, round-topped cactus stems of
  // different heights, leaning a little outward, in dusty greens. All drawn as one instanced mesh.
  function buildCacti(spots) {
    if (!spots.length) return;
    const stem = new THREE.CylinderGeometry(.11, .13, 1, 10, 3), cap = new THREE.SphereGeometry(.11, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2);
    cap.translate(0, .5, 0);
    const pos = stem.attributes.position, v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) { v.fromBufferAttribute(pos, i); const a = Math.atan2(v.z, v.x), k = 1 - .12 * Math.abs(Math.sin(a * 4)); pos.setXYZ(i, v.x * k, v.y, v.z * k); } // ribs
    stem.computeVertexNormals();
    const geo = mergeGeometries([stem, cap]); geo.translate(0, .5, 0); // base at the origin
    const parts = [], rr = rng(31);
    for (const { p, size } of spots) {
      const n = 2 + Math.floor(rr() * 3), scale = .75 + Math.min(1, size / 30) * .5, y = heightAt(p.x, p.z);
      for (let k = 0; k < n; k++) {
        const a = rr() * Math.PI * 2, d = k ? .12 + rr() * .2 : 0;
        parts.push({ x: p.x + Math.cos(a) * d, y, z: p.z + Math.sin(a) * d, h: (k ? .3 + rr() * .3 : .55 + rr() * .35) * scale, w: (.9 + rr() * .5) * scale,
          lean: k ? .15 + rr() * .3 : rr() * .1, dir: a, tint: rr() });
      }
    }
    const mesh = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .85, envMapIntensity: .3 }), parts.length);
    parts.forEach((c, i) => {
      q.setFromEuler(e.set(Math.sin(c.dir) * c.lean, 0, -Math.cos(c.dir) * c.lean));
      m4.compose(new THREE.Vector3(c.x, c.y - .03, c.z), q, new THREE.Vector3(c.w, c.h, c.w));
      mesh.setMatrixAt(i, m4);
      mesh.setColorAt(i, col.setRGB(.2 + c.tint * .08, .3 + c.tint * .08, .14 + c.tint * .04)); // dusty sage to olive greens
    });
    mesh.castShadow = mesh.receiveShadow = true; mesh.frustumCulled = false; mesh.userData.plant = true; scene.add(mesh); // (plant: see quality.js)
  }

  // Is any water on screen? The screen's corners, cast down onto the ground, give the area in view;
  // look for water cells in it (with a margin: the water's ripples bend what it shows a little).
  const ray = new THREE.Raycaster(), ground0 = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hit = new THREE.Vector3();
  // Where is water on screen? The screen's ground area is a trapezoid (wider at the top, further
  // away): walk it row by row, each row as wide as the screen is there, plus a small margin for the
  // ripples' bending. Returns the WATER_GRID-metre squares holding visible water (empty: none), or
  // null if the view reaches the sky (then assume water everywhere).
  const corner = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  const WATER_MARGIN = 1.5, WATER_GRID = 4; // m
  const gridKey = (x, z) => Math.floor(x / WATER_GRID) * 4096 + Math.floor(z / WATER_GRID);
  const found = new Set(); // (reused every frame: no garbage for the browser to collect)
  const waterSquares = camera => {
    const uv = [[-1, -1], [1, -1], [-1, 1], [1, 1]]; // near left, near right, far left, far right
    for (let k = 0; k < 4; k++) {
      ray.setFromCamera({ x: uv[k][0], y: uv[k][1] }, camera);
      if (!ray.ray.intersectPlane(ground0, corner[k])) return null;
    }
    const [nl, nr, fl, fr] = corner, rows = Math.max(1, Math.ceil(Math.abs(fl.z - nl.z) / (CELL * .9)));
    found.clear();
    for (let r = -1; r <= rows + 1; r++) { // (a row beyond each end: the margin)
      const t = r / rows, z = nl.z + (fl.z - nl.z) * t - Math.sign(fl.z - nl.z) * (r < 0 ? WATER_MARGIN : r > rows ? -WATER_MARGIN : 0);
      const tt = Math.min(1, Math.max(0, t)), xl = nl.x + (fl.x - nl.x) * tt - WATER_MARGIN, xr = nr.x + (fr.x - nr.x) * tt + WATER_MARGIN;
      for (let x = xl; x < xr + CELL * .9; x += CELL * .9) { const xx = Math.min(x, xr); if (isWet(xx, z)) found.add(gridKey(xx, z)); }
    }
    return found;
  };
  // Reflections: only things whose mirror image can land on water that's on screen. An image reaches
  // out about 0.8x the height of what casts it (the camera looks down steeply), so a thing is drawn
  // into the reflection only if visible water lies within that reach of it; the rest are taken off
  // the reflection layer for this frame (the jeep driving inland, a palm grove with the water off
  // screen, the transport helicopter parked away from the river...).
  const bound = new THREE.Box3(), bsph = new THREE.Sphere(), offReflect = [], reflBounds = new WeakMap(); // (not userData: chunk pieces share theirs)
  const staticWater = new WeakMap(); // static thing -> keys of the water squares its reflection can reach (sortIntoWaterLayers)
  const reflParts = new WeakMap();   // thing -> its parts on the reflection layer (switched off together)
  const reflectsOnto = (o, squares) => {
    const keys = staticWater.get(o);
    if (keys) { for (const k of keys) if (squares.has(k)) return true; return false; }
    let b = reflBounds.get(o);
    if (!b) { // its size and where its middle is, relative to its position (worked out once)
      if (o.isInstancedMesh) { if (!o.geometry.boundingSphere) return true; bsph.copy(o.geometry.boundingSphere).applyMatrix4(o.matrixWorld); }
      else { bound.setFromObject(o); if (bound.isEmpty()) { reflBounds.set(o, { off: new THREE.Vector3(), r: 0, empty: true }); return false; } bound.getBoundingSphere(bsph); }
      b = { off: bsph.center.clone().sub(o.position), r: bsph.radius }; reflBounds.set(o, b);
    }
    if (b.empty) return false;
    const cx = o.position.x + b.off.x, cz = o.position.z + b.off.z, top = o.position.y + b.off.y + b.r;
    const reach = Math.max(0, top) * .8 + 1.5 + b.r;
    for (let gx = Math.floor((cx - reach) / WATER_GRID); gx <= Math.floor((cx + reach) / WATER_GRID); gx++)
      for (let gz = Math.floor((cz - reach) / WATER_GRID); gz <= Math.floor((cz + reach) / WATER_GRID); gz++) if (squares.has(gx * 4096 + gz)) return true;
    return false;
  };
  // The shadow map gets a pass of its own, before the views: three.js only draws into it what the
  // rendering camera can see (its layers, and anything hidden for it), and the views draw less than
  // everything (the water views their layers, the main view whatever main culling drops). The pass
  // renders nothing itself (its camera looks at nothing) into a 1-pixel target; only the shadow map
  // gets drawn, from the sun's view.
  const shadowOnly = new THREE.WebGLRenderTarget(1, 1), nowhere = new THREE.PerspectiveCamera(1, 1, 1, 2);
  nowhere.layers.enable(SHADOW_ONLY); nowhere.position.set(0, -1e4, 0); nowhere.lookAt(0, -2e4, 0); nowhere.updateMatrixWorld();
  // Main view culling (a tuning slider, see main.js): 1 = what the camera sees; above 1 the main view
  // drops things nearer the screen's middle (from their bounding spheres), below 1 keeps more.
  let mainCull = 1;
  const cullCam = new THREE.PerspectiveCamera(), frustum = new THREE.Frustum(), m4c = new THREE.Matrix4(), hidden = [];
  const sphereOf = o => { // world bounding sphere (static things: worked out once; movers: follow their position)
    let b = reflBounds.get(o);
    if (!b) {
      if (o.isInstancedMesh) { if (!o.geometry.boundingSphere) return null; bsph.copy(o.geometry.boundingSphere).applyMatrix4(o.matrixWorld); }
      else { bound.setFromObject(o); if (bound.isEmpty()) return null; bound.getBoundingSphere(bsph); }
      b = { off: bsph.center.clone().sub(o.position), r: bsph.radius }; reflBounds.set(o, b);
    }
    bsph.center.copy(o.position).add(b.off); bsph.radius = b.r; return bsph;
  };
  let reflectOn = true, lite = false;
  const cullReflect = camera => { // takes this frame's out-of-reach things off the reflection layer (put back by restoreReflect)
    const squares = waterSquares(camera);
    if (reflectOn && squares && squares.size) for (const o of scene.children) { // (reflections off: nothing to take off the layer; the walk over every object's parts was a big part of an empty frame on a slow CPU)
      if (!(o.layers.mask & (1 << REFLECT)) || o.isLight || o.userData.fxBatch || reflectsOnto(o, squares)) continue; // (the particle batches are everywhere at once: always kept, see fx.js)
      let parts = reflParts.get(o);
      if (!parts) { parts = []; o.traverse(m => { if (m.layers.mask & (1 << REFLECT)) parts.push(m); }); reflParts.set(o, parts); }
      for (const m of parts) { m.layers.disable(REFLECT); offReflect.push(m); }
    }
    return squares;
  };
  const restoreReflect = () => { for (const m of offReflect) m.layers.enable(REFLECT); offReflect.length = 0; };
  // Dev: what each pass would draw right now (game.world.drawReport() in the console), grouped by kind.
  let lastCam = null;
  const drawReport = () => {
    const sun = light.sun, passes = {
      reflect: [water.mirrorCam, o => o.layers.mask & (1 << REFLECT)],
      shadow: [sun.shadow.camera, o => o.castShadow && (o.layers.mask & (1 | 1 << SHADOW_ONLY))],
      main: [lastCam, o => o.layers.mask & 1],
    }, fr = new THREE.Frustum(), mm = new THREE.Matrix4(), out = {}, box = new THREE.Box3();
    if (lastCam) cullReflect(lastCam); // (as the real reflection pass sees it)
    for (const [name, [cam, ok]] of Object.entries(passes)) {
      if (!cam) continue;
      cam.updateMatrixWorld(); fr.setFromProjectionMatrix(mm.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
      const groups = new Map(), owners = new Map(); let total = 0, totalTris = 0;
      scene.traverseVisible(o => {
        if (!(o.isMesh || o.isPoints || o.isLine || o.isSprite) || !ok(o) || (o.frustumCulled && !fr.intersectsObject(o))) return; // (points, lines and sprites too: the renderer draws them, and a report without them comes short of the real count)
        let root = o; while (root.parent && root.parent !== scene) root = root.parent; // (the model this piece belongs to)
        const label = root.name || (root.isMesh ? 'mesh ' + root.geometry.attributes.position.count + 'v' + (root.userData.wreck ? ' wreck' : '') + (root.isInstancedMesh ? ' instanced' : '') : root.type + '[' + root.children.slice(0, 3).map(c => c.name || c.type).join(',') + ']'), ow = owners.get(label) ?? owners.set(label, { label, calls: 0, roots: new Set() }).get(label);
        ow.calls += Array.isArray(o.material) ? o.material.length : 1; ow.roots.add(root);
        const n = Array.isArray(o.material) ? o.material.length : 1, g = o.geometry, v = g.attributes.position.count;
        const key = (o.isInstancedMesh ? 'instanced x' + o.count : o.isPoints ? 'points' : o.isLine ? 'line' : o.isSprite ? 'sprite' : 'mesh') + ' verts ' + v + (o.parent === scene ? ' (scene child)' : ' (in ' + (o.parent.name || o.parent.type) + ')');
        const m0 = Array.isArray(o.material) ? o.material[0] : o.material, e = groups.get(key) ?? groups.set(key, { key: key + ' ' + (n > 1 ? n + 'mats ' : '') + (m0.name || '#' + (m0.color ? m0.color.getHexString() : '?')), calls: 0, items: 0, tris: 0, box: new THREE.Box3(), first: o }).get(key);
        const tr = (g.index ? g.index.count : v) / 3 * (o.isInstancedMesh ? o.count : 1); e.tris += tr; totalTris += tr;
        e.calls += n; e.items++; total += n; e.box.expandByPoint(o.getWorldPosition(new THREE.Vector3())); if (!g.boundingSphere) g.computeBoundingSphere(); e.r = Math.max(e.r ?? 0, g.boundingSphere.radius * o.matrixWorld.getMaxScaleOnAxis()); // (the bound the renderer culls by: the biggest of the group)
      });
      const all = [...groups.values()];
      out[name] = { total, tris: totalTris, top: all.sort((a, b) => b.calls - a.calls).slice(0, 12), heavy: all.sort((a, b) => b.tris - a.tris).slice(0, 8), owners: [...owners.values()].sort((a, b) => b.calls - a.calls).slice(0, 10).map(w => ({ label: w.label, calls: w.calls, models: w.roots.size })) };
    }
    restoreReflect();
    for (const v of Object.values(out)) for (const g of [...v.top, ...v.heavy]) { const b = g.box; if (!g.first) continue; // (a group listed in both the top and the heavy lists is done once)
      const f = g.first, geo = f.geometry; if (!geo.boundingSphere) geo.computeBoundingSphere(); const c = geo.boundingSphere.center.clone().applyMatrix4(f.matrixWorld); // (the geometry's real middle, not the object's origin)
      g.at = `x${Math.round(b.min.x)}..${Math.round(b.max.x)} z${Math.round(b.min.z)}..${Math.round(b.max.z)}  cull radius ${Math.round(g.r ?? 0)} m  middle x${Math.round(c.x)} z${Math.round(c.z)}  name '${f.name || ''}' parent '${f.parent?.name || f.parent?.type || ''}' ${f.isInstancedMesh ? 'instanced' : f.material?.map ? 'textured' : 'plain'}`; delete g.first; }
    for (const [k, v] of Object.entries(out)) { console.log(`%c${k}: ${v.total} calls`, 'font-weight:bold'); console.table(v.top); }
    return out;
  };
  // The P overlay's LIST DRAWN OBJECTS: what each pass draws right now, per model, and how much of it cannot show: pieces three.js still draws although they are outside the view (it only culls
  // what has a bound it can test: instanced meshes are drawn whole), and pieces too small to cover a few pixels. The shadow pass counts a caster as wasted when it is more than 25 m from the
  // screen (a rough reach for its shadow). Things hidden behind other things are not detected.
  const drawnObjects = renderer => {
    if (!lastCam) return 'nothing has been drawn yet';
    const sun = light.sun, H = renderer.domElement.height, mm = new THREE.Matrix4(), im = new THREE.Matrix4(), v = new THREE.Vector3(), s = new THREE.Sphere(), mainFr = new THREE.Frustum(), fr = new THREE.Frustum();
    lastCam.updateMatrixWorld(); mainFr.setFromProjectionMatrix(mm.multiplyMatrices(lastCam.projectionMatrix, lastCam.matrixWorldInverse));
    const passes = { main: [lastCam, o => o.layers.mask & 1, H, 3], shadow: [sun.shadow.camera, o => o.castShadow && (o.layers.mask & (1 | 1 << SHADOW_ONLY)), sun.shadow.mapSize.y, 2] };
    if (reflectOn) passes.reflect = [water.mirrorCam, o => o.layers.mask & (1 << REFLECT), H, 3];
    const wasted = (name, cam, size, minPx) => { // why the world sphere in `s` is not worth drawing: 'outside', 'tiny', or '' (it shows)
      if (name === 'shadow') { const r = s.radius; s.radius += 25; const near = mainFr.intersectsSphere(s); s.radius = r; if (!near) return 'outside'; }
      else if (!fr.intersectsSphere(s)) return 'outside';
      const w = cam.isOrthographicCamera ? 2 * s.radius * size / ((cam.top - cam.bottom) / cam.zoom) : s.radius * size / (Math.max(.1, -v.copy(s.center).applyMatrix4(cam.matrixWorldInverse).z) * Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2));
      return w < minPx ? 'tiny' : '';
    };
    const k = n => (n / 1000).toFixed(1) + 'k', out = {};
    cullReflect(lastCam); // (as the real reflection pass sees it)
    for (const [name, [cam, ok, size, minPx]] of Object.entries(passes)) {
      cam.updateMatrixWorld(); fr.setFromProjectionMatrix(mm.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
      const groups = new Map(), tot = { calls: 0, tris: 0, waste: 0 };
      scene.traverseVisible(o => {
        if (!(o.isMesh || o.isPoints || o.isLine || o.isSprite) || !ok(o) || (o.frustumCulled && !fr.intersectsObject(o))) return; // (points, lines and sprites too: the renderer draws them, and a report without them comes short of the real count)
        const g = o.geometry; if (!g.boundingSphere) g.computeBoundingSphere();
        const n = Array.isArray(o.material) ? o.material.length : 1, per = (g.index ? g.index.count : g.attributes.position.count) / 3, count = o.isInstancedMesh ? o.count : 1;
        let root = o; while (root.parent && root.parent !== scene) root = root.parent;
        const label = root.name || (root.isMesh ? 'mesh ' + root.geometry.attributes.position.count + 'v' + (root.isInstancedMesh ? ' instanced' : '') : root.type + '[' + root.children.slice(0, 3).map(c => c.name || c.type).join(',') + ']');
        const e = groups.get(label) ?? groups.set(label, { label, pieces: 0, calls: 0, tris: 0, waste: 0, tiny: 0, outside: 0 }).get(label);
        let bad = 0;
        if (o.isInstancedMesh) for (let i = 0; i < count; i++) { o.getMatrixAt(i, im); im.premultiply(o.matrixWorld); s.copy(g.boundingSphere).applyMatrix4(im); const w = wasted(name, cam, size, minPx); if (w) { bad++; e[w]++; } }
        else { s.copy(g.boundingSphere).applyMatrix4(o.matrixWorld); const w = wasted(name, cam, size, minPx); if (w) { bad++; e[w]++; } }
        e.pieces += count; e.calls += n; e.tris += per * count; e.waste += per * bad; tot.calls += n; tot.tris += per * count; tot.waste += per * bad;
      });
      out[name] = { groups: [...groups.values()], tot };
    }
    restoreReflect();
    let objects = 0, hidden = 0; scene.traverse(o => { objects++; if (!o.visible) hidden++; });
    const L = [`DRAWN OBJECTS: what each pass draws right now (${renderer.domElement.width}x${H})`, `scene: ${objects} objects walked every frame (${hidden} of them switched off)`, '',
      'WASTED = drawn, but outside the view or too small to show (under 3 px wide; 2 px in the shadow map). Things hidden behind other things are not detected.', '',
      'pass      calls   triangles   wasted triangles'];
    for (const [name, p] of Object.entries(out)) L.push(`${name.padEnd(9)} ${String(p.tot.calls).padStart(5)}   ${k(p.tot.tris).padStart(9)}   ${k(p.tot.waste).padStart(8)}  (${(p.tot.waste / Math.max(1, p.tot.tris) * 100).toFixed(0)}%)`);
    const row = g => `  ${g.label.slice(0, 34).padEnd(34)} ${String(g.pieces).padStart(5)} pcs ${String(g.calls).padStart(4)} calls ${k(g.tris).padStart(7)} tris   outside ${String(g.outside).padStart(4)}  tiny ${String(g.tiny).padStart(4)}  wasted ${k(g.waste)}`;
    for (const [name, p] of Object.entries(out)) {
      L.push('', `[${name}] MOST WASTED`, ...p.groups.filter(g => g.waste > 0).sort((a, b) => b.waste - a.waste).slice(0, 20).map(row));
      L.push(`[${name}] BIGGEST`, ...p.groups.sort((a, b) => b.tris - a.tris).slice(0, 12).map(row));
    }
    return L.join('\n');
  };
  // The real draw calls of the main view, counted as three.js makes them (a hook on every mesh's render), by the model each belongs to: the P overlay's list estimates this from the meshes and their materials, and
  // missed about half. Draws one extra frame to the screen. Type __callsByModel() in the console (in the game's frame).
  const callsByModel = renderer => {
    if (!lastCam) return 'nothing has been drawn yet';
    const counts = new Map(), saved = [];
    scene.traverse(o => {
      if (!(o.isMesh || o.isPoints || o.isLine || o.isSprite)) return;
      let root = o; while (root.parent && root.parent !== scene) root = root.parent;
      const label = root.name || (root.isMesh ? 'mesh ' + root.geometry.attributes.position.count + 'v' + (root.isInstancedMesh ? ' instanced' : '') : root.type), before = o.onBeforeRender;
      saved.push([o, before]); o.onBeforeRender = function (...a) { counts.set(label, (counts.get(label) ?? 0) + 1); before.apply(this, a); };
    });
    const info = renderer.info; const was = info.autoReset; info.autoReset = true; renderer.setRenderTarget(null); renderer.render(scene, lastCam); const calls = info.render.calls; info.autoReset = was;
    for (const [o, b] of saved) o.onBeforeRender = b;
    const rows = [...counts.entries()].sort((a, b) => b[1] - a[1]), total = rows.reduce((t, r) => t + r[1], 0);
    return `main view: renderer says ${calls} calls; counted ${total}` + String.fromCharCode(10) + rows.slice(0, 40).map(([k, n]) => `${String(n).padStart(5)}  ${k}`).join(String.fromCharCode(10));
  };
  // F9's shadow breakdown: the same pass timed (CPU, ms per call) with the shadow map, without it (the scene walk and the render state alone), and a bare walk over every object.
  const shadowBench = renderer => {
    const N = 60, time = f => { f(); const t = performance.now(); for (let i = 0; i < N; i++) f(); return (performance.now() - t) / N; };
    const pass = () => { renderer.setRenderTarget(shadowOnly); renderer.render(scene, nowhere); renderer.setRenderTarget(null); };
    const sun = light.sun, was = sun.castShadow, wasAuto = renderer.shadowMap.autoUpdate;
    renderer.shadowMap.autoUpdate = false; renderer.shadowMap.needsUpdate = true;
    const withShadow = time(() => { renderer.shadowMap.needsUpdate = true; pass(); });
    sun.castShadow = false; const without = time(pass); sun.castShadow = was;
    const walk = time(() => scene.traverse(() => {})), matrices = time(() => scene.updateMatrixWorld());
    renderer.shadowMap.autoUpdate = wasAuto;
    return `shadow pass ${withShadow.toFixed(2)} ms | same pass without the sun's shadow ${without.toFixed(2)} ms | bare walk over every object ${walk.toFixed(2)} ms | updateMatrixWorld ${matrices.toFixed(2)} ms`;
  };
  // LOW draws plain matte standard materials (the ground, walls, rocks: roughness at least .9, no metal, no bump map, no shader patch) as Lambert twins: the same colour and texture lit per vertex
  // instead of per pixel, with no specular (a matte surface has none to speak of, and LOW has no image-based light either). On an integrated GPU the per-pixel lighting of the big, screen-filling
  // meshes was most of the frame (the stage 4 profile: flat shading saved 83% of the GPU time, half resolution 63%). Put back when leaving LOW.
  const cheapTwin = new Map(); // standard material -> its twin
  const twinOf = m => {
    if (!m.isMeshStandardMaterial || m.roughness < .9 || m.metalness > .1 || m.flatShading || m.bumpMap || m.normalMap || m.alphaMap || m.emissiveMap || m.aoMap || m.lightMap || m.roughnessMap || m.metalnessMap
      || (m !== groundMat && Object.prototype.hasOwnProperty.call(m, 'onBeforeCompile')) || Object.prototype.hasOwnProperty.call(m, 'customProgramCacheKey')) return m; // (the ground is let through with its shader patches: they only replace chunks the Lambert shader has too: map_fragment, color_fragment, begin_vertex)
    let t = cheapTwin.get(m);
    if (!t) {
      t = new THREE.MeshLambertMaterial({ name: m.name, color: m.color, map: m.map, vertexColors: m.vertexColors, side: m.side, shadowSide: m.shadowSide, transparent: m.transparent, opacity: m.opacity, alphaTest: m.alphaTest, depthWrite: m.depthWrite, depthTest: m.depthTest,
        polygonOffset: m.polygonOffset, polygonOffsetFactor: m.polygonOffsetFactor, polygonOffsetUnits: m.polygonOffsetUnits, emissive: m.emissive, emissiveIntensity: m.emissiveIntensity });
      if (m === groundMat) t.onBeforeCompile = (sh, r) => m.onBeforeCompile(sh, r); // (the ground's patches: the detail texture, the cliff, chasm and camo-hole cuts, the grass look)
      t.userData.standard = m; cheapTwin.set(m, t);
    }
    return t;
  };
  const swapCheapMaterials = on => {
    scene.traverse(o => {
      if (!o.material || !(o.isMesh)) return;
      const swap = m => on ? twinOf(m) : (m.userData.standard ?? m);
      o.material = Array.isArray(o.material) ? o.material.map(swap) : swap(o.material);
    });
  };
  const renderAll = (renderer, camera) => {
    lastCam = camera;
    const ts = performance.now(), walk0 = passTime.walk;
    scene.updateMatrixWorld(); passTime.walk += performance.now() - ts; profile.mark('scene matrices (every object)'); // (once for the whole frame: scene.autoUpdate is off, so the shadow, reflection, see-through and main renders do not each walk every object in the scene again)
    let shadowDue = light.sun.castShadow; if (!shadowDue) for (const o of scene.children) if (o.isLight && o.castShadow && o.visible && o.shadow?.needsUpdate) { shadowDue = true; break; }   // (stage 6: the sun casts none, but the lightning's own light draws its shadows on the frames of a flash, asking for the update itself)
    if (shadowDue) { // every frame (the water's see-through view may skip frames at LOW; the shadows don't). No pass when nothing casts any
      renderer.shadowMap.autoUpdate = false; renderer.shadowMap.needsUpdate = true;
      renderer.setRenderTarget(shadowOnly); renderer.render(scene, nowhere); renderer.setRenderTarget(null);
    }
    const tp = performance.now(); passTime.shadow += tp - ts - (passTime.walk - walk0); profile.mark('shadow map');
    if (mainCull !== 1) {
      cullCam.copy(camera); cullCam.zoom = mainCull; cullCam.updateProjectionMatrix();
      frustum.setFromProjectionMatrix(m4c.multiplyMatrices(cullCam.projectionMatrix, camera.matrixWorldInverse));
      for (const o of scene.children) {
        if (!o.visible || o.isLight || o.userData.fxBatch || o === water.mesh || !(o.isMesh || o.isGroup || o.isObject3D) || o.children.length === 0 && !o.isMesh) continue;
        const sp = sphereOf(o); if (sp && !frustum.intersectsSphere(sp)) { o.visible = false; hidden.push(o); }
      }
    }
    profile.mark('main culling');
    const ci = renderer.info, cnt = () => ci.render.calls, k0 = cnt();
    puddleMirror?.render(renderer, scene, camera); // (stage 6: the mirror image in the puddles, drawn before the water's own views)
    const k1 = cnt();
    const squares = cullReflect(camera);
    passTime.prep += performance.now() - tp; profile.mark('reflection culling');
    water.render(scene, camera, !squares || squares.size > 0);
    window.__passCalls = { autoReset: ci.autoReset, puddleMirror: k1 - k0, waterPasses: cnt() - k1, waterRan: !squares || squares.size > 0, squares: squares ? squares.size : 'none' }; // (for the profile: type JSON.stringify(__passCalls) in the console)
    restoreReflect();
    for (const o of hidden) o.visible = true;
    hidden.length = 0;
    profile.mark('cleanup after the views');
  };

  // Stage 6's overcast light: every ordinary (lit) material in the scene, the level's objects and whatever is added later (tanks, soldiers, wreckage), is dimmed a little and loses some of its environment
  // reflection, so the assets sit in the weak light instead of looking sunlit. The ground and the road paint are left as they are.
  if (stage.dimAssets) {
    const { color: kc = .84, env: ke = .7 } = stage.dimAssets;
    const dim = root => root.traverse(m => {
      if (!m.isMesh && !m.isInstancedMesh) return;
      for (const mt of [].concat(m.material)) {
        if (!mt || !mt.isMeshStandardMaterial || mt.userData.dimmed || mt.userData.noDim || mt === groundMat || (mt.emissive.getHex() !== 0 && mt.emissiveIntensity > .5)) continue; // (glowing materials stay as they are; a plain material's emissive is black, its intensity default 1, which is not a glow)
        mt.userData.dimmed = true; mt.color.multiplyScalar(kc); mt.envMapIntensity *= ke;
      }
    });
    dim(scene);
    const add = scene.add.bind(scene); scene.add = (...objs) => { objs.forEach(dim); return add(...objs); };
  }
  await step('chunks');
  scene.autoUpdate = false; // (renderAll updates every matrix once a frame instead of each of the frame's four renders doing it: the empty-frame profile showed about a millisecond a render of pure scene walking)
  chunkStatic(scene); // split the stage-long scatter and big level meshes into culled chunks (see chunks.js)
  sortIntoWaterLayers();
  puddleMirror?.flag(scene); // (what the puddles mirror)

  // Which static things the water's reflection and see-through views draw (see layers.js). A thing
  // can show in the reflection if it's tall enough for its mirror image to reach water near it
  // (the camera looks down steeply: an image reaches out about 0.8x the height); the see-through
  // view needs what's in or under the water. Judged from each thing's bounds against the water cells.
  function sortIntoWaterLayers() {
    const box = new THREE.Box3(), sph = new THREE.Sphere();
    const waterNear = (b, m) => {
      for (let z = b.min.z - m; z <= b.max.z + m; z += CELL * .9) for (let x = b.min.x - m; x <= b.max.x + m; x += CELL * .9) if (isWet(x, z)) return true;
      return false;
    };
    const proxies = [], im = new THREE.Matrix4(), ib = new THREE.Box3();
    // A reflection-only copy of the instances whose mirror image can reach water (a crate chunk has 6 draw calls
    // per material set, and most of its crates are nowhere near the water): own tight bounds, shared geometry.
    const reflectProxy = o => {
      const src = o.geometry; if (!src.boundingBox) src.computeBoundingBox();
      o.updateMatrixWorld(true);
      const keep = [], keys = new Set(), all = new THREE.Box3();
      for (let i = 0; i < o.count; i++) {
        o.getMatrixAt(i, im); im.premultiply(o.matrixWorld); ib.copy(src.boundingBox).applyMatrix4(im);
        const reach = ib.max.y * .8 + 1.5;
        if (ib.max.y <= .6 || !waterNear(ib, reach)) continue;
        keep.push(i); all.union(ib);
        for (let z = ib.min.z - reach; z <= ib.max.z + reach + CELL; z += CELL * .9) for (let x = ib.min.x - reach; x <= ib.max.x + reach + CELL; x += CELL * .9) if (isWet(x, z)) keys.add(gridKey(x, z));
      }
      if (!keep.length) { o.layers.disable(REFLECT); return true; } // (none: nothing for the reflection)
      const g = new THREE.BufferGeometry();
      for (const k of Object.keys(src.attributes)) g.setAttribute(k, src.attributes[k]);
      if (src.index) g.setIndex(src.index);
      for (const gr of src.groups) g.addGroup(gr.start, gr.count, gr.materialIndex);
      g.boundingSphere = all.getBoundingSphere(new THREE.Sphere());
      const px = new THREE.InstancedMesh(g, o.material, keep.length), col = new THREE.Color();
      keep.forEach((i, j) => { o.getMatrixAt(i, im); px.setMatrixAt(j, im); if (o.instanceColor) { o.getColorAt(i, col); px.setColorAt(j, col); } });
      px.position.copy(o.position); px.quaternion.copy(o.quaternion); px.scale.copy(o.scale); px.updateMatrixWorld(true);
      px.castShadow = px.receiveShadow = false; px.frustumCulled = true; px.layers.set(REFLECT);
      staticWater.set(px, [...keys]); o.layers.disable(REFLECT);
      return px;
    };
    { const guns = turrets.filter(t => t.base?.name === 'wallTurretBase').map(t => t.base); if (stage.isSecretLevel && guns.length > 1 && navParams.get('basemerge') !== 'off') { /* (the secret level only: elsewhere the guns' bases stay their own meshes, which the wet road's mirror and the roofs' heights deal with) */ const n0 = scene.children.length; mergeAcross(guns, scene, { skip: n => n.name === 'turret' }); if (stage.isSecretLevel) for (let i = n0; i < scene.children.length; i++) scene.children[i].userData.noWater = true; } } // (the guns' static bases and fittings, all of one kind together, are a few meshes in all: only the turrets turn and are blown off)
    if (stage.isSecretLevel) for (const t of turrets) if (t.base) t.base.userData.noWater = true; // (the guns are on land and are never near the ice: out of the mirror)
    for (const o of scene.children) {
      if (o.isLight) { addToLayer(o, REFLECT, UNDERWATER); continue; }
      if (stage.isSecretLevel && !o.isLight && (o.userData.plant || /palm|tree|pine|bush|forest|grove|spruce|fir/i.test(o.name ?? ''))) { o.userData.noWater = true; continue; } // (the secret level: no tree stands anywhere near the water, so none is in its reflection, on open water or ice)
      if (o === water.mesh || o.userData.fxBatch || o.userData.noWater || o.name?.startsWith('swampTree') || o.layers.mask === 1 << SHADOW_ONLY) continue; // (a shadow-only twin (harbour.js: the crates' and containers' plain white shadow casters) must never be copied into the reflection: it would show as white crates) // (the grass is never mirrored; the swamp trees have their own low-detail mirror copy, see swamp-trees.js)
      if (o.isInstancedMesh) { // (its bounds are the instances' sphere, see chunks.js)
        if (!o.geometry.boundingSphere) continue;
        sph.copy(o.geometry.boundingSphere).applyMatrix4(o.matrixWorld); sph.getBoundingBox(box);
      } else box.setFromObject(o);
      if (box.isEmpty()) continue;
      if (box.max.y > .6 && waterNear(box, box.max.y * .8 + 1.5)) {
        const proxy = o.isInstancedMesh ? reflectProxy(o) : null; // (instanced scatter: only the instances by the water go into the reflection)
        if (proxy) { if (proxy !== true) proxies.push(proxy); if (box.min.y < .5 && waterNear(box, 1)) addToLayer(o, UNDERWATER); continue; }
        addToLayer(o, REFLECT);
        const reach = box.max.y * .8 + 1.5, keys = new Set(); // the water squares (WATER_GRID) its reflection can reach
        for (let z = box.min.z - reach; z <= box.max.z + reach + CELL; z += CELL * .9) for (let x = box.min.x - reach; x <= box.max.x + reach + CELL; x += CELL * .9)
          if (isWet(x, z)) keys.add(gridKey(x, z));
        staticWater.set(o, [...keys]);
      }
      if (box.min.y < .5 && waterNear(box, 1)) addToLayer(o, UNDERWATER);
    }
    for (const px of proxies) scene.add(px);
  }

  const circleHitsBox = (x, z, r, b) => {
    const dx = Math.max(Math.abs(x - b.x) - b.hw, 0), dz = Math.max(Math.abs(z - b.z) - b.hd, 0);
    return dx * dx + dz * dz < r * r;
  };

  return {
    secretPad,
    xOk: (x, z) => x <= LEVEL.halfWidth - LEVEL.edgeMargin + (stage.eastExtend ?? 0) && x >= -LEVEL.halfWidth + LEVEL.edgeMargin - (EXT && z >= EXT.z0 && z <= EXT.z1 ? EXT.cols * CELL - 1.5 : 0), // (the jeep may leave through the map's side only into the left extension)
    powerPlantInfo: () => powerPlant, powerStacks: () => powerPlant && powerPlant.alive ? powerPlant.stacks : [], powerPlantAlive: () => !powerPlant || powerPlant.alive, destroyPowerPlant: instant => { if (powerPlant && powerPlant.alive) { powerPlant.alive = false; powerPlant.intact.visible = false; powerPlant.ruin.visible = true; for (const g of gateCurtains) { g.userData.curtainDead = true; if (instant) g.userData.curtainA = 0; } } }, // (instant: a loaded game, where it went down earlier: the curtain is already out) // (the power station down: the laser gate's curtain, which it fed, fades out and the way is open) // (the island's power station: standing, or in ruins)
    vlsHoles, rainStage: stage.theme === 'harbour', wetEnv: light.wetEnv, scene, light, obstacles, targets, turrets, statues, topplers, lasers, start, tileAt, waterAt, heightAt, shotHeightAt: (x, z) => heightAt(x, z, true), mineBeacon: !!theme.dry, chasmAt: (x, z) => !!chasmSurface && tileAt(x, z) === 'V', chasmSurfaceAt: (x, z) => chasmSurface ? chasmSurface(x, z) : 0, get chasmHaze() { return chasmHaze; }, groundMat, groundBase, camoHoles, camoBeyond: stage.camoBeyond, displayTanks, groundUv, markingCrop, camoGaps, camoSpots, rockSpots, mines: minesW, mineSigns: mineSignsW, trainRig, launcherSpots, dronePads, cliffHeightAt, summitPad: stage.summitPad ?? null, summitRoad: stage.mountains?.summit?.pts ?? null, summitRoad2: stage.mountains?.summit2?.pts ?? null, flares, flareGlows, heliTrigger: stage.heliTrigger ?? null, get forestStats() { return forestStats; }, get mountainFog() { return mountainFog; }, gateCurtains, chimneys, campfires, piers: stage.piers ?? [], forestShadowPrep: () => { if (mtGroup && terrainShadowOff) for (const o of mtGroup.children) o.castShadow = false; else if (mtGroup && mtHid === false) for (const o of mtGroup.children) o.castShadow = !!stage.mountains?.cast; if (mtShadow && !terrainShadowOff) mtShadow.visible = true; const cam = lastCam; if (!forestShadow || !cam) return; const sp = new THREE.Vector3(), tp = new THREE.Vector3(); light.sun.getWorldPosition(sp); light.sun.target.getWorldPosition(tp); forestShadow.shadowPrep(cam, sp, tp); }, forestShadowDone: () => { if (mtShadow) mtShadow.visible = false; forestShadow?.shadowDone(); }, cullBushes: camera => { mtTopCull(); bushCull?.(camera); forestUpdate?.(camera); }, soldierSpots, flameSoldierSpots, tankSpots, jeepSpots, bridges, helipad, helipadCircle: helipadCircle ?? paintedPad, pickups,
    disturb: (x, z, s) => water.disturb(x, z, s), // stage 4: a bubble or a stirring in the swamp (swamp-life.js)
    swampWet: (x, z) => swampWet(x, z), // stage 4: on the swamp's drawn water (a margin in from its edge)
    mudK: (x, z) => theme === THEMES.mountain ? Math.min(1, Math.max(0, -heightAt(x, z) / SWAMP_DEPTH)) : 0, // how far into the mud a point is: 0 on the bank, up to 1 in the swamp (the bed drops away from the bank)
    treeSpots: () => swampTrees?.boxes ?? [], // stage 4: the swamp trees' trunk boxes ({ x, z, ... })
    swampAt: (x, z) => swampWet(x, z, 0), // stage 4: on the swamp's water as it is drawn (the smooth shore, not the tile map: they differ by a metre or two at the edge)
    speedAt: (x, z) => swampWet(x, z, 0) ? .5 : 1, // how fast a vehicle can go here, as a share of its top speed
    soldierPatrol: stage.soldierPatrol ?? null, boatSolid, setIceBreaks: l => water.setBreaks(l), setIce: v => water.setIce(v), setSeaFrozen: on => { seaFrozen = !!on; groundIndexFor(seaFrozen); }, get seaFrozen() { return seaFrozen; }, // (the secret level's freeze: how far the ice has spread (0 to 1) for the water's look, and whether the jeep may drive on it)
    leanSlopes: stage.leanSlopes ?? 0, // (stage 2: the jeep tips nose up and down on the stairs' ramps, by this share of the lean the snow slopes give, player.js)
    snowBumps: !!stage.isSecretLevel, // the jeep pitches and rolls a little over the uneven snow (player.js)
    slopedShots: !!stage.isSecretLevel, // enemy shells drop relative to the ground under the gun (enemies.js)
    groundTrail,
    liftPOWs: !!stage.isSecretLevel, // the prisoners stand on the ground's height there (pows.js): the snow slope
    solidTile: t => BLOCKING.has(t), // terrain nothing can drive through (for path planning)
    render: renderAll, shadowBench, drawReport, drawnObjects, callsByModel,
    setMainCull: k => { mainCull = k; }, // (tuning slider)
    ripple: (pos, strength, dir) => water.ripple(pos.x, pos.z, strength, dir), // dir: the way the thing that made it was heading (a wake: only the half ahead of that is drawn)
    resize: () => water.resize(),
    setWaterScale: k => water.setScale(k),
    setRedrawEvery: n => water.setEvery(n),
    setWaterReflect: on => { reflectOn = on; water.setReflect(on && !seaOff); },
    setPlateau: on => { terrainShadowOff = on; if (mtGroup) for (const o of mtGroup.children) o.castShadow = !on && !!stage.mountains?.cast; }, // (north of z -403.9 on the second climb: the ground casts no shadow, it lies below everything that stands on the plateau; and its ascent is not drawn)
    setSeaOff: on => { if (on === seaOff) return; seaOff = on; water.mesh.userData.hidden = on || navParams.has('nowater'); water.setReflect(reflectOn && !on); puddleMirror?.skip(on); /* (the road's mirror of the jeep has no puddles to show in up there) */ }, // (the second summit's plateau: the sea is out of sight, behind the mist: its plane and its reflection are not drawn)
    setWaterReflectAA: n => water.setReflectAA(n),
    // The lite look (the lowest graphics level, for slow GPUs and CPUs): no (or only cheap) shadows, none of the pooled point lights (the glow of a shot or a blast; every pixel of everything is shaded against
    // each one, and each draw sends their uniforms), and the water opaque with no see-through pass (it redraws the scene).
    // It also drops the image-based lighting (scene.environment: every lit pixel of every standard material samples a pre-filtered sky for its diffuse and its specular light, several texture fetches
    // and a lot of arithmetic, which a slow GPU feels), with the sky light turned up (x1.6) to make up the brightness.
    // Draw the water's views once, whether or not any water is on screen, and with nothing left out for being off screen (what is outside the view is never drawn, so its shaders are never built): the reflection, the see-through view and the
    // water itself build their shader programs at their first use, which was a hitch of most of a second when the sea first came into view (the transport's flight in). Called behind the loading screen (main.js).
    prewarmWater: camera => {
      const off = []; scene.traverse(o => { if (o.frustumCulled && (o.layers.mask & ((1 << REFLECT) | (1 << UNDERWATER)))) { o.frustumCulled = false; off.push(o); } });
      try { water.render(scene, camera, true); } finally { for (const o of off) o.frustumCulled = true; }
    },
    setLite: (on, shadows = false, noEnv = on, plainWater = on) => { // shadows: the sun still casts them (LOW draws the two-tap kind, see quality.js); noEnv: no image-based lighting (MEDIUM has that alone, the rest of the lite look is LOW's)
      lite = on; light.sun.castShadow = sunShadows && (!on || shadows); water.setSimple(plainWater); // (plainWater: the sea as a plain colour, no see-through view)
      scene.traverse(o => { if (o.isPointLight) o.visible = !on; });
      scene.environment = noEnv ? null : envTexture; light.hemi.intensity = hemiBase * (noEnv ? 1.6 : 1);
      if (chasmHaze?.uDustSkip) chasmHaze.uDustSkip.value = on ? 1 : 0; // (stage 5, LOW: no dust and mud patches on the dirt, the chasm rim's too)
      swapCheapMaterials(on); setGrassDetail(!on); // (LOW: no grass noise on the ground: see grass-detail.js)
      // The chasm's lip is lifted where the slope turns from the sun and the sky (uNorthLift and the others, tuned with the sky light on). Without the sky light (and the
      // hemisphere raised in its place) the slope loses much less than that, so the same lift left a pale line along the rim: eased by CHASM_LITE_LIFT.
      if (chasmHaze) for (const n of ['uNorthLift', 'uSouthLift', 'uSideLift']) if (chasmHaze[n]) { chasmHaze[n].base ??= chasmHaze[n].value; chasmHaze[n].value = chasmHaze[n].base * (noEnv ? +(navParams.get('chasmlift') ?? CHASM_LITE_LIFT) : 1); } // (?chasmlift=0.4: try another factor from the page address)
    },
    setOutput: t => water.setOutput(t), // where the final view is drawn (msaa.js)
    // Is a circle of radius r at (x, z) overlapping solid terrain or a solid object?
    // The speed (m/s, toward +z: south) a conveyor carries something standing at (x, z), or 0 off the belts.
    shotOverRock: !!stage.isSecretLevel, // (the secret level: its rock cells (X) do not stop shots by themselves: the mountain's real shape does (facesAhead, and a grenade's height against the ground)
    facesAhead: (x, z, dx, dz) => { // the secret level: does the ground rise steeply ahead, in the direction a shot is travelling? (a mountain face in its way: about 35 degrees or more over 2 m). Ground that falls away, or runs sideways along the shot, is not in its way: shots go out over the drop beside the summit road.
      if (!stage.isSecretLevel || !mtHeightAt) return false; const l = Math.hypot(dx, dz); if (l < 1e-4) return false; const a = 2.2 / l;
      return mtHeightAt(x + dx * a, z + dz * a) - mtHeightAt(x, z) > 1.55;
    },
    steepAt: (x, z, limit = .5) => { if (!stage.isSecretLevel || !mtHeightAt) return false; const e = .6; return Math.hypot(mtHeightAt(x + e, z) - mtHeightAt(x - e, z), mtHeightAt(x, z + e) - mtHeightAt(x, z - e)) / (2 * e) > limit; }, // (the secret level: ground steeper than about 27 degrees, the mountain's faces and cliffs, which foot soldiers cannot walk on and shots cannot cross)
    conveyorAt: (x, z) => { for (const c of conveyors) if (Math.abs(x - c.x) < c.hw && Math.abs(z - c.z) < c.hd) return c.v; return 0; },
    setPuddles: m => puddleMirror?.setMode(m), flagMirror: o => puddleMirror?.flag({ children: [o], traverse: f => o.traverse(f) }), puddleFlash: v => puddleMirror?.setFlash(v), // (flagMirror: something added after the level was made, for the wet road to mirror)
     // Picking the yard's look: builds every container and pile again with another seed offset (the colours, the wear, which have their doors open and what lies on their roofs all come from it), where they stand. Press N / B in the game; the
    // number goes into the stage's `containerSeed`. (The red light of the gate's curtain on nearby boxes is only set up at load: reload with the seed in the stage file to see that too.)
    rerollContainers: off => {
      yardObjs.forEach((old, i) => {
        const ent = old.userData.ent; ent.seedOff = off; const spec = SPAWN[ent.type];
        const nu = mergeStatic(spec.build(ent)); dropTinyShadows(nu, .3); nu.position.copy(old.position); nu.rotation.copy(old.rotation); nu.userData.ent = ent;
        scene.remove(old); scene.add(nu); puddleMirror?.flag({ children: [nu], traverse: f => nu.traverse(f) }); yardObjs[i] = nu;
      });
      return yardObjs.length;
    },
    puddleStorm: v => puddleMirror?.setStorm(v), puddleBolt: (...a) => puddleMirror?.setBolt(...a), puddleMirrorSkip: v => puddleMirror?.skip(v), puddleMirrorOldCull: v => puddleMirror?.oldCull(v), puddleRoad: v => puddleMirror?.setRoad(v), puddleCut: n => puddleMirror?.setCut(n), puddleRainRip: v => puddleMirror?.setRainRip(v), puddleRough: v => puddleMirror?.setRough(v),
    wetRoad: !!stage.puddles, // (stage 6's wet road film lies over the ground)
    puddleRipple: (x, z, a, d) => puddleMirror?.ripple(x, z, a, d),
    puddleWetness: (renderer, x, z) => puddleMirror ? puddleMirror.wetness(renderer, x, z) : 0, // 0..1; above about .7 is standing water // a vehicle is driving through stage 6's water
    rainTops, mapSize: { W, L, cell: CELL }, // (the map's size and cell, m: for the rain's height map)
    buildingTop: roofAt, // how high a building rises here (stage 6: grenades burst on it instead of arcing over)
    debrisGround, // where wreckage comes to rest: on a roof, not through it
    obstaclesNear: (x, z) => ogAt(x, z), // (the obstacles within about OM = 3 m of the point: the boxes in its grid cell; the tank route planner reads these, not the whole list)
    blocked(x, z, r) { const _t = performance.now(), res = this.blocked0(x, z, r) || (stage.isSecretLevel && this.steepAt(x, z, .6)), // (the secret level: nothing drives up a slope steeper than about 31 degrees: the mountain's faces)
      B = window.__blockedT ??= { n: 0, t: 0 }; B.t += performance.now() - _t; B.n++; return res; },
    blocked0(x, z, r) {
      for (const [ox, oz] of [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r], [r * .7, r * .7], [-r * .7, r * .7], [r * .7, -r * .7], [-r * .7, -r * .7]]) {
        if (solidAt(x + ox, z + oz)) return true;
      }
      return (r <= OM ? ogAt(x, z) : obstacles).some(b => b.alive && circleHitsBox(x, z, r, b));
    },
    // Is a rectangle (half-length hl along its heading, half-width hw) at (x, z), facing yaw, overlapping
    // solid terrain or an object? Checked at points every 0.5 m round its outline, so thin walls
    // can't slip between them.
    // Does a jet of flame stop at (x, z)? Walls, buildings and crates stop it; it passes wire fences, sandbags, chasms and water.
    flameBlocked(x, z) {
      if ('BKLXFn'.includes(tileAt(x, z))) return true;
      return ogAt(x, z).some(b => b.alive && !FLAME_PASS.has(b.kind) && Math.abs(x - b.x) < b.hw && Math.abs(z - b.z) < b.hd);
    },
    blockedRect(x, z, yaw, hl, hw, forPlayer = false, noIce = false) { // forPlayer: the player's jeep also meets the obstacles marked playerOnly (stage 5's garage mouths)
      const fx = -Math.sin(yaw), fz = -Math.cos(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw);
      const hit = (u, v) => {
        const px = x + fx * u + rx * v, pz = z + fz * u + rz * v;
        return solidAt(px, pz, noIce) || (forPlayer && ((boatSolid.fn && boatSolid.fn(px, pz)) || (seaFrozen && pierBoatAt(px, pz)))) || (stage.isSecretLevel && mtHeightAt && steepFor(px, pz)) || ogAt(px, pz).some(b => b.alive && (forPlayer || !b.playerOnly) && Math.abs(px - b.x) < b.hw && Math.abs(pz - b.z) < b.hd);
      };
      const nu = Math.ceil(hl / .25), nv = Math.ceil(hw / .25);
      for (let i = -nu; i <= nu; i++) { const u = i / nu * hl; if (hit(u, -hw) || hit(u, hw)) return true; }
      for (let j = -nv; j <= nv; j++) { const v = j / nv * hw; if (hit(-hl, v) || hit(hl, v)) return true; }
      return hit(0, 0);
    },
    // Saved games: which of the level's own targets (turrets, buildings, gates) are destroyed.
    snapshot() { return { dead: targets.filter(t => t.id && !t.boss && t.hp <= 0).map(t => t.id) }; }, // (the boss fight starts afresh)
    // Put them back destroyed, quietly: the wreck as it ends up (scorched, roof blown in, burning),
    // without the blast, the flying debris or the prisoners coming out again.
    restore(data, fx) {
      const quiet = quietEffects(scene, fx, debrisGround, (x, z) => tileAt(x, z) === '~'); // the wreckage is left lying about, as it would have landed
      for (const id of data?.dead ?? []) {
        const t = targets.find(o => o.id === id);
        if (!t || t.hp <= 0) continue;
        t.hp = 0;
        if (t.obstacle && !t.solidWreck) t.obstacle.alive = false;
        else if (t.obstacle) t.obstacle.isTarget = false; // (a gutted building stops bullets)
        t.wreck(quiet.debris, quiet.fx);
      }
      quiet.finish();
    },
    update(dt, player, aim = player.position) {
      obsFrame++;
      { const now = performance.now() / 1000; for (const g of gateCurtains) { const dead = !!g.userData.curtainDead; g.userData.curtainA += ((dead ? 0 : 1) - g.userData.curtainA) * Math.min(1, dt * 2.2); g.userData.curtain.update(now, g.userData.curtainA < .01 ? 0 : g.userData.curtainA); if (g.userData.L) g.userData.L.glow = Math.min(1.2, g.userData.curtainA); if (g.userData.light) g.userData.light.intensity = 3.2 * g.userData.curtainA * (.92 + .08 * Math.sin(now * 17) * Math.sin(now * 5.3)); if (dead && g.userData.curtainA < .01) for (const c of [...g.children]) if (c.name === 'curtainLens') g.remove(c); } } // (a new frame: the obstacle grid is rebuilt the next time a collision test needs it)
      for (const t of beltTextures) t.offset.y += dt * 3.4 / BELT_REPEAT; // (the belt's ribs run south: its pattern slides toward +z)
      const pp = player.position;
      turrets.forEach(({ top, base, target, live, turnRate = 3, scan }) => { // swing toward the jeep when it's close
        if (target.hp <= 0) return;
        const a = live ? pp : aim, dx = a.x - base.position.x, dz = a.z - base.position.z; // turrets track where the jeep WAS (tanks: where it is)
        if (player.dead || target.asleep || dx * dx + dz * dz > 45 * 45) { if (scan) top.rotation.y += scan.dir * scan.speed * dt; return; } // (a guard that has nothing to shoot at turns slowly on its mount, each its own way and at its own pace: they are watching) // start tracking before the jeep is in firing range
        let d = Math.atan2(-dx, -dz) - base.rotation.y - top.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d));
        top.rotation.y += d * Math.min(1, dt * turnRate);
      });
      spinners.forEach(s => { s.rotation.y += dt * 3; });
      flashPadLights(clock += dt);
      { const tm = performance.now() / 1000; for (const m of mooredBoats) if (!m.dead && !seaFrozen) { m.hull.position.y = Math.sin(tm * 1.7 + m.phase) * .06; m.hull.rotation.z = Math.sin(tm * 1.3 + m.phase) * .035; m.hull.rotation.x = Math.sin(tm * 1.1 + m.phase * 2) * .02; } } // (the moored boats ride the swell: bob, roll and pitch)
      water.update(dt); swampMist?.update(dt, pp); swampTrees?.update(dt); grassLife?.update(dt);
      palmWind.value += dt; bushWind.value += dt;
    },
  };
}
