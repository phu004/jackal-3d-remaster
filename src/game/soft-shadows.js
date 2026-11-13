// Contact-hardening soft shadows (PCSS) for the sun. three.js's own shadow filtering blurs every
// shadow by the same amount, so a helicopter 20 m up casts as crisp a shadow as a rock on the ground.
// Here each shadowed pixel first looks for the things blocking the light (blocker search), works out
// how far above it they are, and widens its filter in proportion: shadows are sharp where an object
// touches the ground and grow soft the higher it is, as under a real sun. The sun's apparent size is
// exaggerated a little so the effect reads from the game camera.
// Import this before anything is rendered: it patches the shared shader chunk every material uses.
import { params } from './nav.js';
import * as THREE from 'three';

// Must match the sun's shadow camera (see setupLighting in world.js).
const DEPTH_RANGE = 149;  // far - near, metres
// The shadow box, in the sun's view (metres from the point it aims at, see setupLighting): fitted to
// what the camera sees (the visible ground, plus casters up to 10 m tall just off screen whose
// shadows fall into view) with a 2 m margin. The sun's camera is turned so its 'up' is north
// (SHADOW_UP), lining the box up with the screen; otherwise it sits at the sun's compass angle and
// the rectangle round the view wastes its corners. A bigger box only draws more off-screen things.
export const SHADOW_BOX = { left: -39, right: 39, bottom: -30, top: +params.get('shadowtop') || 28 }; // (top tuned by eye; ?shadowtop=45 tries a taller box: a trial setting for a shadow edge seen along the top of the screen)
export const SHADOW_UP = [0, 0, -1];
const BOX_W = SHADOW_BOX.right - SHADOW_BOX.left, BOX_H = SHADOW_BOX.top - SHADOW_BOX.bottom;
const MAP = 4096;         // shadow map size, texels

const pcss = samples => /* glsl */`
#define PCSS_SAMPLES ${samples}
const float PCSS_DEPTH = ${DEPTH_RANGE.toFixed(1)};
const vec2 PCSS_BOX = vec2( ${BOX_W.toFixed(1)}, ${BOX_H.toFixed(1)} ); // (uv per metre differs across and up the box)
const float PCSS_LIGHT = 0.022;                  // tan of the sun's (exaggerated) apparent radius
const float PCSS_MIN = ${(1.5 / MAP).toFixed(7)}; // narrowest filter (uv): about what PCF soft gave before
const float PCSS_REACH = 30.0;                   // blockers up to this far above (m) are searched for

vec2 pcssTap( int i, float rot ) { // golden-angle spiral, evenly covering a unit disc
  float r = sqrt( ( float( i ) + 0.5 ) / float( PCSS_SAMPLES ) ), a = float( i ) * 2.39996 + rot;
  return vec2( cos( a ), sin( a ) ) * r;
}
// (texture2DLodEXT, not texture2D, inside the loops: a plain lookup in a loop makes the Windows GLSL translator unroll it, thirty-two lookups in every shader built, and it spent most of the load compiling that; a lookup at level 0 can stay a loop)
float pcssShadow( sampler2D map, vec4 c ) {
  float zr = c.z;
  float rot = 6.2831 * fract( sin( dot( c.xy * 4096.0, vec2( 12.9898, 78.233 ) ) ) * 43758.5453 ); // per-texel rotation, fixed in the world
  vec2 search = PCSS_LIGHT * PCSS_REACH / PCSS_BOX;
  float sum = 0.0, n = 0.0;
  for ( int i = 0; i < PCSS_SAMPLES; i++ ) {
    float d = unpackRGBAToDepth( texture2DLodEXT( map, c.xy + pcssTap( i, rot ) * search, 0.0 ) );
    if ( d < zr ) { sum += d; n += 1.0; }
  }
  if ( n == 0.0 ) return 1.0;
  float gap = ( zr - sum / n ) * PCSS_DEPTH;                  // metres between the blockers and this point, along the light
  vec2 radius = max( vec2( PCSS_MIN ), gap * PCSS_LIGHT / PCSS_BOX );
  float lit = 0.0;
  for ( int i = 0; i < PCSS_SAMPLES; i++ ) lit += step( zr, unpackRGBAToDepth( texture2DLodEXT( map, c.xy + pcssTap( i, rot + 1.3 ) * radius, 0.0 ) ) );
  return lit / float( PCSS_SAMPLES );
}
`;

// The cheap version (quality.js, lower levels): no blocker search and no contact hardening, just one,
// two, four or eight taps a texel or so apart (two or four soften the stair-steps a little).
const CHEAP_TAPS = { 1: [[0, 0]], 2: [[-.6, -.6], [.6, .6]], 4: [[-.6, -.6], [.6, -.6], [-.6, .6], [.6, .6]],
  8: [[-.6, -.6], [.6, -.6], [-.6, .6], [.6, .6], [-1.3, 0], [1.3, 0], [0, -1.3], [0, 1.3]] }; // (8: a ring, a little softer)
const cheap = (mapSize, taps) => /* glsl */`
float pcssShadow( sampler2D map, vec4 c ) {
  const float T = ${(1 / mapSize).toFixed(7)};
  float lit = 0.0;
  ${CHEAP_TAPS[taps].map(([x, y]) => `lit += step( c.z, unpackRGBAToDepth( texture2D( map, c.xy + vec2( ${x.toFixed(2)}, ${y.toFixed(2)} ) * T ) ) );`).join('\n  ')}
  return lit / ${taps.toFixed(1)};
}
`;

// The stock chunk, kept so the patch can be redone with another sample count (see quality.js).
const ORIGINAL = THREE.ShaderChunk.__shadowmapOriginal ??= THREE.ShaderChunk.shadowmap_pars_fragment;
let samples = 0, map = 0;

// Use n samples per pass (blocker search and filter each); or, with n = -1, -2, -4 or -8, the cheap
// shadows with that many taps, for a shadow map mapSize texels across. Returns true if it changed; materials already
// compiled then need needsUpdate to pick it up (their program cache key includes it).
export function setShadowSamples(n, mapSize = MAP) {
  const m = n > 0 ? 0 : mapSize; // (only the cheap version depends on the map size)
  if (n === samples && m === map) return false;
  samples = n; map = m;
  let chunk = ORIGINAL.replace('float getShadow(', (n > 0 ? pcss(n) : cheap(mapSize, -n)) + '\n\tfloat getShadow(');
  chunk = chunk.replace('if ( frustumTest ) {', 'if ( frustumTest ) {\n\t\t\treturn pcssShadow( shadowMap, shadowCoord );'); // first one: getShadow (directional / spot)
  THREE.ShaderChunk.shadowmap_pars_fragment = chunk;
  return true;
}
setShadowSamples(16);
const programKey = THREE.Material.prototype.customProgramCacheKey;
THREE.Material.prototype.customProgramCacheKey = function () { return programKey.call(this) + '|pcss' + samples + '/' + map; };
