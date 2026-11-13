// Patrol boat (placeholder): the gunboat chassis in dark grey, with a single-barrelled deck gun,
// after the NES sprite. Same named parts as the gunboat: `hull` containing `turret` (carries `muzzle`).
import * as THREE from 'three';
import { add, cached } from './common.js';
import { buildGunboat, camoMaterial } from './gunboat.js';

// the gunboat's green camouflage becomes a naval one: a mix of light blue and grey (trim/glass/dark/tyres are kept)
const CAMO_NAVAL = { seed: 19, base: '#5d6e7c', blobs: [['#44525e', 4, 95], ['#7f97aa', 4, 85], ['#4f6e88', 3, 75], ['#323c46', 2, 60]] };

export function buildPatrolBoat() {
  const root = buildGunboat(); root.name = 'patrolboat';
  const swaps = cached('patrolMats', () => new Map());
  root.traverse(o => {
    if (!o.isMesh) return;
    const c = o.material.userData.camo; if (!c) return;
    if (!swaps.has(o.material)) { const m = camoMaterial(CAMO_NAVAL, ...c); m.side = o.material.side; swaps.set(o.material, m); }
    o.material = swaps.get(o.material);
  });

  // swap the twin barrels (x = ±.12) for one barrel on the centreline
  const turret = root.getObjectByName('turret'), hull = root.getObjectByName('hull');
  const twins = turret.children.filter(c => c.isMesh && Math.abs(Math.abs(c.position.x) - .12) < 1e-3);
  const barrelMat = twins[0].material, ringMat = twins[1].material;
  twins.forEach(c => { turret.remove(c); c.geometry.dispose(); });
  add(turret, new THREE.CylinderGeometry(.06, .075, 1.5, 10), barrelMat, 0, .45, -.9).rotation.x = Math.PI / 2;
  add(turret, new THREE.CylinderGeometry(.095, .095, .16, 10), ringMat, 0, .45, -1.62).rotation.x = Math.PI / 2; // muzzle brake
  turret.getObjectByName('muzzle').position.set(0, .45, -1.72);

  // the pale rubbing strake had exactly the same outline as the hull side (both bevels reach .06 out),
  // so the two faces z-fought; make the strake stand just proud of the hull
  const strake = hull.children.find(c => c.isMesh && Math.abs(c.position.y - .5) < 1e-3);
  strake.scale.set(1.025, 1.012, 1);

  // upper structure: drop the gunboat's wheelhouse and mast (the 'cross'), build a stepped one
  const near = (a, b) => Math.abs(a - b) < 1e-3;
  const old = hull.children.filter(c => c.isMesh && c.position.y > 1.05);
  const mats = {
    cabin: cached('patrolCabin', () => camoMaterial(CAMO_NAVAL, .3, .3, .7, .15)), trim: old.find(c => near(c.position.y, 1.66)).material,
    glass: old.find(c => near(c.position.y, 1.35)).material, dark: old.find(c => near(c.position.y, 2.3)).material,
  };
  old.forEach(c => { hull.remove(c); c.geometry.dispose(); });
  // rounded top-view footprint, blunt chamfered nose at +y (which becomes the bow, -Z)
  const plan = (w, d, r) => {
    const sh = new THREE.Shape(), x = w / 2, y = d / 2;
    sh.moveTo(-x + r, -y); sh.lineTo(x - r, -y); sh.quadraticCurveTo(x, -y, x, -y + r);
    sh.lineTo(x, y * .05); sh.quadraticCurveTo(x, y, w * .2, y);
    sh.lineTo(-w * .2, y); sh.quadraticCurveTo(-x, y, -x, y * .05);
    sh.lineTo(-x, -y + r); sh.quadraticCurveTo(-x, -y, -x + r, -y);
    return sh;
  };
  const tier = (w, d, r, y0, h, m, z, bevel = .03) => {
    const g = new THREE.ExtrudeGeometry(plan(w, d, r), { depth: h, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3, curveSegments: 14 });
    const mesh = add(hull, g, mats[m], 0, y0, z); mesh.rotation.x = -Math.PI / 2; return mesh;
  };
  // deckhouse: soft-cornered tiers with a wraparound window band
  tier(1.8, 2.2, .45, .72, .2, 'cabin', 1.0);
  tier(1.88, 2.28, .5, .95, .18, 'glass', 1.0, 0);
  tier(1.8, 2.2, .45, 1.15, .14, 'cabin', 1.0);
  tier(1.96, 2.36, .5, 1.3, .05, 'trim', 1.0, .02);
  // bridge: smaller, rounder, set forward, with its own window band and an overhanging roof
  tier(1.3, 1.3, .4, 1.35, .1, 'cabin', .55);
  tier(1.38, 1.38, .44, 1.47, .26, 'glass', .55, 0);
  tier(1.3, 1.3, .4, 1.75, .08, 'cabin', .55);
  tier(1.56, 1.56, .5, 1.85, .05, 'trim', .55, .02);
  add(hull, new THREE.SphereGeometry(.22, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), mats.trim, 0, 1.92, .8);   // radome
  add(hull, new THREE.CylinderGeometry(.12, .14, .14, 10), mats.dark, -.42, 1.97, .1);                      // searchlight
  const funnel = add(hull, new THREE.CylinderGeometry(.2, .26, .55, 14), mats.dark, 0, 1.62, 1.75);         // raked oval funnel
  funnel.scale.z = 1.5; funnel.rotation.x = .12;
  const cap = add(hull, new THREE.CylinderGeometry(.21, .21, .05, 14), mats.trim, 0, 1.9, 1.78); cap.scale.z = 1.5;

  // 10% narrower: the hull and everything fixed to it (the gun turret keeps its shape, as it swings round)
  hull.children.forEach(c => {
    if (c === turret || !c.isMesh) return;
    c.geometry = c.geometry.clone(); c.geometry.scale(.9, 1, 1); c.position.x *= .9; // (a clone: the gunboat's own geometry is shared)
  });
  return root;
}
