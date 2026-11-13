// Stage 2's terrace retaining walls, built along the terraces' edges from distinct stone blocks: a
// wobbly, uneven face with a few stepped-in stretches and collapsed sections, blocks of varied length
// in one course (sometimes two) with pale mortar in the joints, the odd missing or chipped block, sand
// drifted against the foot in places, fallen blocks, and desert scrub along the bottom.
// The wall is scenery only: the edge cells it stands on block movement anyway.
import * as THREE from 'three';
import { limestone } from '../assets/ruins.js';

// ---- shape ----
const THICK = .6;                 // metres: block depth into the terrace
const THICK_VAR = .2;             // ± share of that, per block (the strip's width varies)
const WOBBLE = .18;               // metres: how far the face wanders in and out along a run (smooth)
const STEP_IN_CHANCE = .12;       // chance per few metres of a stretch stepped back into the terrace
const STEP_IN = .32;              // metres stepped back
const GAPS = 3;                   // collapsed, lower stretches along all the walls
const GAP_LEN = [2, 3.5];         // metres long
const GAP_HEIGHT = .45;           // share of the full wall height left standing there
// ---- blocks ----
const LENGTH = [1, 3];            // block length as a multiple of its height
const TWO_COURSE_CHANCE = .25;    // share of stretches laid in two courses instead of one
const MISSING = .04;              // share of blocks gone
const CHIPPED = .15;              // share of blocks worn smaller and askew
const JOINT = .035;               // metres: gap between blocks (pale mortar shows through)
const TONE = [.82, 1];            // per-block brightness range (grey-tan, greyer than the floor)
const FACE_FILL = 0x2e2a24;       // emissive lift so the shaded faces don't read as a hard dark edge
// ---- sand and scrub ----
const DRIFT_CHANCE = .45;         // chance per stretch of sand piled against the foot
const DRIFT_HEIGHT = [.25, .75];  // metres
const FALLEN_CHANCE = .12;        // chance per stretch of a fallen block lying on the sand
export const BUSH_DENSITY = 2.2;  // scrub along the foot of the walls (1 = the old density)

function rng(seed) {
  let s = seed >>> 0;
  return () => { s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}

// runs: straight stretches of terrace edge, [{ ax, az, bx, bz, nx, nz }] (from a to b, outward normal n).
// height: the wall's height (terrace top plus a little coping); groundAt(x, z): the low side's ground.
export function buildTerraceWalls(scene, runs, height, groundAt = () => 0, sandColor = 0x8a6c46) {
  const rand = rng(99), blocks = [], mortar = [], drifts = [], fallen = [], bushes = [];
  const smooth = (t, seed) => Math.sin(t * .9 + seed) * .6 + Math.sin(t * 2.3 + seed * 1.7) * .4; // wobble along a run
  const total = runs.reduce((t, r) => t + Math.hypot(r.bx - r.ax, r.bz - r.az), 0);
  const gaps = Array.from({ length: GAPS }, () => { const g = rand() * total; return [g, g + GAP_LEN[0] + rand() * (GAP_LEN[1] - GAP_LEN[0])]; }); // where along all the walls the collapses are
  let along = 0;
  for (const run of runs) {
    const len = Math.hypot(run.bx - run.ax, run.bz - run.az), ux = (run.bx - run.ax) / len, uz = (run.bz - run.az) / len, seed = rand() * 100;
    const at = (t, off) => [run.ax + ux * t + run.nx * off, run.az + uz * t + run.nz * off];
    const gapAt = t => gaps.some(([g0, g1]) => along + t >= g0 && along + t <= g1);
    // pale mortar behind the blocks, showing through the joints
    const [mx, mz] = at(len / 2, -THICK * .55);
    mortar.push({ x: mx, z: mz, len: len, h: height - .08, yaw: Math.atan2(-uz, ux) });
    let t = 0, stepIn = 0, stepLeft = 0;
    while (t < len - .05) {
      if (stepLeft <= 0) { stepIn = rand() < STEP_IN_CHANCE ? STEP_IN : 0; stepLeft = 2 + rand() * 4; }
      const two = rand() < TWO_COURSE_CHANCE, collapsed = gapAt(t), h = collapsed ? height * GAP_HEIGHT : height;
      const courses = two && !collapsed ? [[0, h / 2], [h / 2, h / 2]] : [[0, h]];
      let sectionEnd = t;
      for (const [y0, ch] of courses) { // lay a course over this stretch
        let s = t;
        const stretch = Math.min(len - t, ch * (LENGTH[0] + rand() * (LENGTH[1] - LENGTH[0])) * (courses.length > 1 ? 2 : 1));
        while (s < t + stretch - .05) {
          const bl = Math.min(t + stretch - s, ch * (LENGTH[0] + rand() * (LENGTH[1] - LENGTH[0])));
          if (rand() >= MISSING) {
            const mid = s + bl / 2, off = WOBBLE * smooth(mid, seed) - stepIn, depth = THICK * (1 + (rand() - .5) * 2 * THICK_VAR);
            const chip = rand() < CHIPPED, k = chip ? .9 : 1;
            const [x, z] = at(mid, off - depth / 2);
            blocks.push({ x, y: y0 + ch / 2 * k, z, sx: (bl - JOINT) * k, sy: ch * k - JOINT, sz: depth * k,
              yaw: Math.atan2(-uz, ux) + (chip ? (rand() - .5) * .12 : (rand() - .5) * .02), tilt: chip ? (rand() - .5) * .08 : 0,
              tone: TONE[0] + rand() * (TONE[1] - TONE[0]) });
          }
          s += bl;
        }
        sectionEnd = Math.max(sectionEnd, t + stretch);
      }
      if (collapsed) for (let k = 0; k < 4; k++) { // rubble where it fell
        const [x, z] = at(t + rand() * (sectionEnd - t), .3 + rand() * 1.2), sz = .25 + rand() * .3;
        fallen.push({ x, z, s: sz, yaw: rand() * 3, roll: (rand() - .5) * .6 });
      }
      // sand drifted against the foot (or not), a fallen block now and then, scrub
      if (rand() < DRIFT_CHANCE) {
        const [x, z] = at(t + (sectionEnd - t) / 2, .15 + rand() * .4);
        drifts.push({ x, z, len: (sectionEnd - t) * (.8 + rand() * .7), h: DRIFT_HEIGHT[0] + rand() * (DRIFT_HEIGHT[1] - DRIFT_HEIGHT[0]), d: 1 + rand() * 1.2, yaw: Math.atan2(-uz, ux) });
      }
      if (rand() < FALLEN_CHANCE) { const [x, z] = at(t + rand() * (sectionEnd - t), .8 + rand() * 1.4); fallen.push({ x, z, s: .3 + rand() * .3, yaw: rand() * 3, roll: (rand() - .5) * .5 }); }
      stepLeft -= sectionEnd - t; t = sectionEnd;
    }
    for (let s = 0; s < len; s += .9 / BUSH_DENSITY) { // scrub along the foot, sometimes overlapping
      if (rand() < .3) continue;
      const [x, z] = at(s + (rand() - .5) * .6, .45 + rand() * .9);
      bushes.push({ x, z, s: .35 + rand() * .3 });
    }
    along += len;
  }

  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), col = new THREE.Color(), box = new THREE.BoxGeometry(1, 1, 1);
  const inst = (geo, material, list, set, shadows = true) => {
    if (!list.length) return;
    const mesh = new THREE.InstancedMesh(geo, material, list.length);
    list.forEach((o, i) => set(o, i, mesh));
    mesh.castShadow = shadows; mesh.receiveShadow = true; mesh.frustumCulled = false; scene.add(mesh);
    return mesh;
  };
  const stoneMat = limestone(21, '#a49b8a').clone(); stoneMat.emissive = new THREE.Color(FACE_FILL);
  inst(box, stoneMat, blocks, (b, i, mesh) => {
    const gy = groundAt(b.x, b.z);
    m4.compose(new THREE.Vector3(b.x, gy + b.y, b.z), q.setFromEuler(e.set(b.tilt, b.yaw, 0)), new THREE.Vector3(b.sx, b.sy, b.sz));
    mesh.setMatrixAt(i, m4); mesh.setColorAt(i, col.setScalar(b.tone));
  });
  inst(box, new THREE.MeshStandardMaterial({ color: 0xbdb3a0, roughness: 1, envMapIntensity: .2 }), mortar, (b, i, mesh) => {
    m4.compose(new THREE.Vector3(b.x, b.h / 2, b.z), q.setFromEuler(e.set(0, b.yaw, 0)), new THREE.Vector3(b.len, b.h, THICK * .5));
    mesh.setMatrixAt(i, m4);
  }, false);
  inst(new THREE.SphereGeometry(1, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: sandColor, roughness: 1, envMapIntensity: .2 }), drifts, (d, i, mesh) => {
    m4.compose(new THREE.Vector3(d.x, -.02, d.z), q.setFromEuler(e.set(0, d.yaw, 0)), new THREE.Vector3(d.len / 2, d.h, d.d / 2));
    mesh.setMatrixAt(i, m4);
  }, false); // (low sand mounds: their shadow can't be seen)
  inst(box, stoneMat, fallen, (f, i, mesh) => {
    m4.compose(new THREE.Vector3(f.x, f.s * .35, f.z), q.setFromEuler(e.set(f.roll, f.yaw, f.roll * .5)), new THREE.Vector3(f.s * 1.6, f.s * .8, f.s));
    mesh.setMatrixAt(i, m4); mesh.setColorAt(i, col.setScalar(.8 + rand() * .15));
  });
  const bushMesh = inst(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .95, flatShading: true, envMapIntensity: .3 }), bushes, (b, i, mesh) => {
    m4.compose(new THREE.Vector3(b.x, b.s * .45, b.z), q.setFromEuler(e.set(rand() * 3, rand() * 3, rand() * 3)), new THREE.Vector3(b.s * 1.2, b.s * .75, b.s * 1.2));
    mesh.setMatrixAt(i, m4); mesh.setColorAt(i, col.setRGB(.13 + rand() * .07, .2 + rand() * .08, .07 + rand() * .04)); // dusty olive-greens
  });
  if (bushMesh) bushMesh.userData.plant = true; // (the lowest graphics level drops small plants' shadows)
}

// Straight runs of terrace edge from the terrain: wherever an edge cell ('E') borders low ground, its
// side is a stretch of wall; neighbouring stretches on the same line join into one run.
export function edgeRuns(tileRC, r0, r1, c0, c1, cellX, cellZ, CELL, isLow) {
  const segs = new Map(); // key: orientation + line -> list of [from, to]
  for (let r = r0; r < r1; r++) for (let c = c0; c < c1; c++) {
    if (tileRC(r, c) !== 'E') continue;
    for (const [dr, dc] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
      if (!isLow(tileRC(r + dr, c + dc))) continue;
      const key = dc ? `x:${c + (dc > 0 ? 1 : 0)}:${dc}` : `z:${r + (dr > 0 ? 1 : 0)}:${dr}`;
      (segs.get(key) ?? segs.set(key, []).get(key)).push(dc ? r : c);
    }
  }
  const runs = [];
  for (const [key, list] of segs) {
    const [o, lineS, dS] = key.split(':'), line = +lineS, d = +dS;
    list.sort((a, b) => a - b);
    let start = list[0], prev = list[0];
    for (let i = 1; i <= list.length; i++) {
      if (i < list.length && list[i] === prev + 1) { prev = list[i]; continue; }
      if (o === 'x') runs.push({ ax: cellX(line), az: cellZ(start), bx: cellX(line), bz: cellZ(prev + 1), nx: d, nz: 0 });
      else runs.push({ ax: cellX(start), az: cellZ(line), bx: cellX(prev + 1), bz: cellZ(line), nx: 0, nz: d });
      start = prev = list[i];
    }
  }
  return runs;
}
