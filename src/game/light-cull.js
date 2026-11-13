// Point lights that don't reach a pixel cost it nothing.
// three.js r128 works out for every pixel whether each point light reaches it (directLight.visible: false past the light's distance), but then runs the full surface
// lighting (diffuse, specular, all the arithmetic) for that light anyway, with a colour of zero. Wrapping that call in the visibility test skips it: a pixel far
// from a fire or a blast pays only for the distance check. The branch is the same for neighbouring pixels (a light's reach is a smooth disc), so the GPU skips it well.
// Must run before anything is drawn (main.js imports it first, like soft-shadows.js).
import * as THREE from 'three';

const CALL = 'RE_Direct( directLight, geometry, material, reflectedLight );';
export const STOCK = THREE.ShaderChunk.lights_fragment_begin; // (kept so bench.js can compare the two)
const start = STOCK.indexOf('NUM_POINT_LIGHTS'), at = STOCK.indexOf(CALL, start);
export const CULLED = start >= 0 && at >= 0 && STOCK.indexOf('NUM_SPOT_LIGHTS') > at // (the first call after the point-light loop begins, before the spot-light one)
  ? STOCK.slice(0, at) + 'if ( directLight.visible ) ' + CALL + STOCK.slice(at + CALL.length) : STOCK;
THREE.ShaderChunk.lights_fragment_begin = CULLED;
