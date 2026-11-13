// The summit's helipad: only a ring of perimeter lights on the snow (see buildSummitPad).
import * as THREE from 'three';
import { buildPadLight } from './stage-props.js';

export function buildSummitPad(r = 6.2) { // a ring of red and blue perimeter lights (the stage 6 helipad's: assets/stage-props.js buildPadLight) round the landing circle: no pavement, just the lights on the snow. Origin: the middle of the ring.
  const g = new THREE.Group(); g.name = 'summitPad'; const n = 16;
  for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2, l = buildPadLight(i, n); l.position.set(Math.cos(a) * r, 0, Math.sin(a) * r); g.add(l); }
  return g;
}
