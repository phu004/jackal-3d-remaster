// Stage 5's secret helipad, on the land mass beyond the map's left edge (stage.secretPad: { x, z, cells }): a square concrete slab for the transport helicopter, weathered and marked like the evac pad (its slab top is
// helipad.js, fed a made-up grid of 'H' cells placed to put the slab where we want it), with a ring of the flashing perimeter lights (stage-props.js: they chase round the ring by themselves, see flashPadLights).
import * as THREE from 'three';
import { buildHelipadSlab } from './helipad.js';
import { buildPadLight } from '../assets/stage-props.js';

export function buildSecretPad(scene, { x, z, cells = 16 }, CELL, heightAt = () => 0) {
  const size = cells * CELL, grid = Array.from({ length: cells }, () => 'H'.repeat(cells));
  // buildHelipadSlab puts cell (0, 0) at (-W/2, -L): choose W and L so that the slab's middle falls on (x, z)
  const W = 2 * (-(x - size / 2)), L = -(z - size / 2);
  const centre = buildHelipadSlab(scene, grid, CELL, W, L), y = heightAt(x, z);
  const base = new THREE.Mesh(new THREE.BoxGeometry(size, .1, size), new THREE.MeshStandardMaterial({ color: 0x5e5e58, roughness: .95 })); // (the slab's thickness: its top is the textured plane just above)
  base.position.set(x, y + .05, z); base.receiveShadow = true; scene.add(base);
  const sq = centre.square, spots = [], pad = new THREE.Group(); pad.position.y = y;
  for (let i = 0; i < 6; i++) { const px = sq.x0 + .6 + i * (sq.x1 - sq.x0 - 1.2) / 5; spots.push([px, sq.z0 - .9], [px, sq.z1 + .9]); }
  for (let i = 0; i < 6; i++) { const pz = sq.z0 + .6 + i * (sq.z1 - sq.z0 - 1.2) / 5; spots.push([sq.x0 - .9, pz], [sq.x1 + .9, pz]); }
  const cx = x, cz = z; for (let i = spots.length - 1; i >= 0; i--) if (spots[i][0] > sq.x1 && Math.abs(spots[i][1] - cz) < 2.5) spots.splice(i, 1); // (the two on the gate's side, in front of the gate: none)
  spots.sort((a, b) => Math.atan2(a[1] - cz, a[0] - cx) - Math.atan2(b[1] - cz, b[0] - cx)); // numbered clockwise round the ring, for the chase
  spots.forEach(([px, pz], i) => { const d = buildPadLight(i, spots.length); d.position.set(px, 0, pz); pad.add(d); });
  scene.add(pad);
  return { x, z, size, centre };
}
