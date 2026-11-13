// Water with refraction and reflection. Each frame, before the normal render:
//  - reflection: the scene is drawn from a camera mirrored below the surface (clipped at the
//    surface, no sky behind it) into a half-res texture, so explosions, grenades, the chopper,
//    palms etc. show up mirrored in the water;
//  - refraction: the scene is drawn without the water, so the surface can show the sloping bed.
// The water shader distorts both with the same ripples and tints deeper water darker.
import * as THREE from 'three';
import { REFLECT, UNDERWATER } from './layers.js';
import { WAVE_TIME } from './surf-time.js';
import { SNOW_GLSL, SNOW_TILT, SNOW_GROUND } from './snow-surface.js';
import { passCalls, passTime, profile } from './perf.js';

const vertexShader = /* glsl */`
uniform mat4 textureMatrix; // world -> mirrored camera's texture space
varying vec2 vUv;
varying vec3 vWorld;
varying vec4 vReflUv;
#include <fog_pars_vertex>
void main() {
  vUv = uv;
  vReflUv = textureMatrix * vec4( position, 1.0 );
  vec4 wp = modelMatrix * vec4( position, 1.0 );
  vWorld = wp.xyz;
  vec4 mvPosition = viewMatrix * wp;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const fragmentShader = /* glsl */`
uniform sampler2D tRefract;   // the scene without water, from this camera
uniform sampler2D tReflect;   // the scene mirrored in the surface; alpha 0 where there's only sky
uniform sampler2D tWater;     // r = depth (0 shore .. 1 deep), g = water coverage
uniform vec2 uRes;
uniform float uTime;
uniform vec3 uSun;
uniform vec3 uShallow;
uniform vec3 uDeep;
uniform vec4 uRipples[16];
uniform vec2 uRippleDir[16];  // a ring's heading: only the half of it ahead of that way is drawn (a wake: no back half); (0, 0) = the whole ring     // x, z, start time, strength (0 = unused)
uniform vec4 uDisturb[16];    // a swamp's own disturbances (bubbles breaking, something stirring): x, z, start time, strength (0 = unused)
uniform float uSpec;         // how bright the sun's glitter on the water is (1 = the default)
uniform float uSurf;
uniform vec2 uWL;            // the water plane's width and length in metres (for the second swell layer's direction)
        // surf: 1 = swell breaking on the shore (foam lines running in and a wash at the waterline)
uniform vec3 uSkyLo, uSkyHi;  // the sky the sea mirrors: horizon and overhead
uniform vec3 uOvercast;       // a swamp's sky: the overcast's colour at the horizon (the stage's fog colour)
uniform float uClouds;        // a swamp's sky: 1 = half blue sky, half cloud; 0 = overcast
uniform float uSimple;        // 1: the lite look: the sea's colours without the see-through lookup (no bed seen through it)
uniform vec4 uBrkA[7];        // the secret level's ambush subs under the ice: x, z, and the way its bow points (x, z)
uniform vec4 uBrkB[7];        // half length, half width (0 = none), how far the ice over it has cracked (0..1), how far it has opened (0..1)
uniform float uIce;           // how far the sea has frozen: 0 open water .. 1 ice all over (the freeze spreads out from the shore); a see-through frosted sheet, cracked, with no waves
uniform float uSwamp;         // 1: a swamp (stage 4): murky and opaque, nothing seen through it, calm, a mirror for what is above it
varying vec2 vUv;
varying vec3 vWorld;
varying vec4 vReflUv;
${SNOW_GLSL}
#ifdef ICE_TRAILS
uniform sampler2D uTrailMap; uniform float uTrailOn; uniform vec4 uTrailBox;   // (the tracks the vehicles leave in the snow (ground-trail.js): the same map the terrain's snow reads)
float trT( vec2 uv ) { return texture2D( uTrailMap, uv ).r; }
#endif
#include <fog_pars_fragment>


float ihash( vec2 p ) { return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453 ); }
vec2 ihash2( vec2 p ) { return vec2( ihash( p ), ihash( p + 19.19 ) ); }
vec2 vorD; // (set by vor: the vector from the point to its nearest cell's feature point, in the cell grid's own space)
vec4 vor( vec2 p ) { // cell distances: x = nearest feature point, y = second nearest (their difference is small along the cell edges: the cracks)
  vec2 ip = floor( p ), f = fract( p ); float d1 = 8.0, d2 = 8.0; vec2 id = vec2( 0.0 ), rn = vec2( 0.0 );
  for ( int j = -1; j <= 1; j++ ) for ( int i = -1; i <= 1; i++ ) {
    vec2 g = vec2( float( i ), float( j ) ), o = ihash2( ip + g ), r = g + o - f; float d = dot( r, r );
    if ( d < d1 ) { d2 = d1; d1 = d; id = o; rn = r; } else if ( d < d2 ) d2 = d;
  }
  vorD = rn;
  return vec4( sqrt( d1 ), sqrt( d2 ), id );
}

// One travelling wave: adds its surface slope at p. dir = heading, len = wavelength (m),
// steep = max slope. Speed follows deep-water dispersion, so longer waves travel faster.
void wave( inout vec2 slope, vec2 p, float t, vec2 dir, float len, float steep ) {
  float k = 6.2832 / len;
  dir = normalize( dir );
  slope += dir * steep * cos( k * dot( dir, p ) - sqrt( 9.8 * k ) * t * 0.35 );
}

float hash( vec2 p ) { return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453 ); }
float vnoise( vec2 p ) {
  vec2 i = floor( p ), f = fract( p ), u = f * f * ( 3.0 - 2.0 * f );
  return mix( mix( hash( i ), hash( i + vec2( 1.0, 0.0 ) ), u.x ), mix( hash( i + vec2( 0.0, 1.0 ) ), hash( i + vec2( 1.0, 1.0 ) ), u.x ), u.y );
}
// Fractures as random straight segments scattered over the ice, with no grid or regions to show: every cell of the given size starts one segment (random place, heading and length, a slight kink in the middle) and two branches that
// leave it at wide angles; the segments of the neighbouring cells reach across, so cracks cross cell edges freely. thin: the line's half width in metres. x = the line (1 on it), y = a wider soft band round it.
float segDt( vec2 p, vec2 a, vec2 b, out float tt ) { vec2 pa = p - a, ba = b - a; tt = clamp( dot( pa, ba ) / dot( ba, ba ), 0.0, 1.0 ); return length( pa - ba * tt ); } // (also how far along the segment the nearest point is: 0 at its start, 1 at its end)
float segD( vec2 p, vec2 a, vec2 b ) { vec2 pa = p - a, ba = b - a; return length( pa - ba * clamp( dot( pa, ba ) / dot( ba, ba ), 0.0, 1.0 ) ); }
vec2 crackNet( vec2 p, float cell, float seed, float len, float thin ) {
  vec2 ic = floor( p / cell ); float line = 0.0, glow = 0.0;
  for ( int j = -1; j <= 1; j++ ) for ( int i = -1; i <= 1; i++ ) {
    vec2 c = ic + vec2( float( i ), float( j ) );
    vec2 h = ihash2( c * 1.31 + seed ), h2 = ihash2( c * 0.77 + seed * 3.7 + 5.0 ), h3 = ihash2( c * 1.93 + seed * 7.1 + 9.0 );
    if ( h3.x < 0.18 ) continue;                                                         // (a few cells have none)
    vec2 a = ( c + h ) * cell; float ang = h2.x * 6.2832, L = cell * len * ( 0.6 + 0.8 * h2.y );
    vec2 dir = vec2( cos( ang ), sin( ang ) ), b = a + dir * L, m = a + dir * L * 0.5 + vec2( -dir.y, dir.x ) * ( h3.y - 0.5 ) * L * 0.12;
    float w0 = thin * ( 0.4 + 2.2 * h3.y * h3.y ), tA, tB; float dA = segDt( p, a, m, tA ), dB = segDt( p, m, b, tB ), d = min( dA, dB );
    float along = dA < dB ? tA * 0.5 : 0.5 + tB * 0.5, w = w0 * ( 0.2 + 0.8 * sin( 3.14159 * along ) );   // (thick in the middle, tapering to a hairline at each end)
    line = max( line, 1.0 - smoothstep( 0.0, w, d ) ); glow = max( glow, 1.0 - smoothstep( 0.0, w * 6.0, d ) );
    vec2 h4 = ihash2( c * 2.17 + seed * 5.3 + 3.0 ), h5 = ihash2( c * 0.63 + seed * 9.9 + 1.0 );
    float t1 = 0.2 + 0.6 * h4.x, t2 = 0.2 + 0.6 * h4.y;                                    // (where along it each branch leaves)
    vec2 b1 = mix( a, b, t1 ), b2 = mix( a, b, t2 );
    float a1 = ang + ( h5.x < 0.5 ? -1.0 : 1.0 ) * ( 0.7 + 0.7 * h5.y ), a2 = ang + ( h5.y < 0.5 ? 1.0 : -1.0 ) * ( 0.7 + 0.7 * h5.x );
    float tb1, tb2; float d1 = segDt( p, b1, b1 + vec2( cos( a1 ), sin( a1 ) ) * L * ( 0.2 + 0.3 * h4.y ), tb1 ), d2 = segDt( p, b2, b2 + vec2( cos( a2 ), sin( a2 ) ) * L * ( 0.18 + 0.28 * h4.x ), tb2 );
    float db = min( d1, d2 ), tbr = d1 < d2 ? tb1 : tb2, wb = w0 * 0.55 * ( 1.0 - 0.8 * tbr );  // (a branch is thickest where it leaves its crack and thins to nothing at its tip: it ends partway, a T-junction)
    line = max( line, ( 1.0 - smoothstep( 0.0, wb, db ) ) * 0.8 ); glow = max( glow, ( 1.0 - smoothstep( 0.0, wb * 6.0, db ) ) * 0.6 );
  }
  return vec2( line, glow );
}
// The same noise with its slope (x = value, yz = d/dp): one lookup instead of three finite-difference ones.
vec3 vnoised( vec2 p ) {
  vec2 i = floor( p ), f = fract( p ), u = f * f * ( 3.0 - 2.0 * f ), du = 6.0 * f * ( 1.0 - f );
  float a = hash( i ), b = hash( i + vec2( 1.0, 0.0 ) ), c = hash( i + vec2( 0.0, 1.0 ) ), d = hash( i + vec2( 1.0, 1.0 ) ), k = a - b - c + d;
  return vec3( a + ( b - a ) * u.x + ( c - a ) * u.y + k * u.x * u.y, du * ( vec2( b - a, c - a ) + k * u.yx ) );
}
// Irregular ripples: three octaves of noise drifting in different directions (height, in metres).
// Each octave is rotated so the value-noise grids don't line up into a visible lattice.
const mat2 R1 = mat2( 0.80, 0.60, -0.60, 0.80 ), R2 = mat2( -0.29, 0.96, -0.96, -0.29 ), R3 = mat2( 0.42, -0.91, 0.91, 0.42 );
vec2 rippleSlope( vec2 p, float t ) { // the slope of that height field (each octave's gradient, turned back by its rotation)
  vec3 n = vnoised( R1 * p * 0.9 + vec2( t * 0.25, t * 0.11 ) );
  vec2 g = ( n.yz * R1 ) * ( 0.9 * 0.10 );
  n = vnoised( R2 * p * 2.1 - vec2( t * 0.32, -t * 0.20 ) ); g += ( n.yz * R2 ) * ( 2.1 * 0.045 );
  n = vnoised( R3 * p * 4.7 + vec2( -t * 0.50, t * 0.41 ) ); g += ( n.yz * R3 ) * ( 4.7 * 0.02 );
  return g;
}
vec2 swampSlope( vec2 p, float t ) { // a swamp's ripples: faint, slow and the same in every direction (no streaking): two scales of noise at different angles, each creeping its own way
  vec3 a = vnoised( R1 * p * 0.8 + vec2( t * 0.03, t * 0.018 ) );
  vec3 b = vnoised( R2 * p * 2.3 - vec2( t * 0.045, -t * 0.03 ) );
  vec2 g = ( a.yz * R1 ) * ( 0.8 * 0.11 ) + ( b.yz * R2 ) * ( 2.3 * 0.048 );
  return g * ( 0.7 + 0.6 * vnoise( p * 0.06 + t * 0.02 ) ); // (a little uneven from place to place)
}
// One set of six wave trains (3 m swells down to 30 cm ripples), rotated by rot and scaled by s.
void waveSet( inout vec2 slope, vec2 q, float t, mat2 rot, float s ) {
  wave( slope, q, t, rot * vec2( 1.0, 0.3 ), 3.1 * s, 0.10 );
  wave( slope, q, t, rot * vec2( -0.4, 1.0 ), 1.9 * s, 0.09 );
  wave( slope, q, t, rot * vec2( 0.8, -0.6 ), 1.13 * s, 0.07 );
  wave( slope, q, t, rot * vec2( -0.9, -0.2 ), 0.71 * s, 0.06 );
  wave( slope, q, t, rot * vec2( 0.2, 0.95 ), 0.43 * s, 0.05 );
  wave( slope, q, t, rot * vec2( 0.6, 0.7 ), 0.29 * s, 0.04 );
}

void main() {
  vec3 wd3 = texture2D( tWater, vUv ).rgb; vec2 wd = wd3.rg; float wide = wd3.b;
  float depth = wd.r, cover = wd.g;
  if ( cover < 0.02 ) discard;
  float iceA = uIce <= 0.0 ? 0.0 : uIce >= 1.0 ? 1.0 : smoothstep( 0.0, 0.2, uIce * 1.8 - depth * 0.9 - vnoise( vWorld.xz * 0.07 ) * 0.5 ); // (how frozen it is here: the ice forms at the shore first and spreads out to the deep water)

  float brkStress = 0.0, brkOpen = 0.0, brkNear = 0.0;
  if ( uIce > 0.5 ) for ( int bi = 0; bi < 7; bi++ ) { // the ice over a submarine: clear and cracking more and more as it nears breaking, then a ragged hole of open water
    vec4 bA = uBrkA[bi], bB = uBrkB[bi]; if ( bB.x <= 0.0 ) continue;
    vec2 bd = vWorld.xz - bA.xy; if ( dot( bd, bd ) > bB.x * bB.x * 12.0 ) continue;
    vec2 ba = vec2( dot( bd, bA.zw ), -bd.x * bA.w + bd.y * bA.z ) / bB.xy;
    float be = pow( pow( abs( ba.x ), 3.0 ) + pow( abs( ba.y ), 3.0 ), 0.3333 ) * ( 1.0 + ( vnoise( vWorld.xz * 1.1 + bA.xy ) - 0.5 ) * 0.4 + ( vnoise( vWorld.xz * 3.7 + bA.yx ) - 0.5 ) * 0.18 );
    brkStress = max( brkStress, bB.z * ( 1.0 - smoothstep( 0.9, 2.6, be ) ) );
    brkOpen = max( brkOpen, bB.w * ( 1.0 - smoothstep( 0.92, 1.0, be ) ) );
    brkNear = max( brkNear, 1.0 - smoothstep( 1.5, 2.6, be ) );
  }
  iceA *= 1.0 - brkOpen;

  // surface normal from six wave trains (3 m swells down to 30 cm ripples) plus noise ripples.
  // The waves run through a slow large-scale warp so their fronts curve, and overall strength
  // varies by region (choppier / calmer patches), so no repeating pattern shows.
  vec2 p = vWorld.xz, slope = vec2( 0.0 );
  float t = mix( uTime, 3.0, iceA ); // (frozen: the ice's wave detail does not move, and no ripple ring spreads over it)
  float surfCyc = 0.0, surfWarp = 0.0, surfReach = 0.0; vec2 surfDir = vec2( 0.0, 1.0 ); float surfGl = 0.0;
  if ( iceA < 0.999 ) { // (all frozen: the waves, the ripple rings and the swell are not worked out at all; the ice replaces the slope with its own facets below, and they were the largest part of this shader's cost over a sea of ice)
  if ( uSwamp > 0.5 ) slope = swampSlope( p, t ); // (a swamp: just those slow ripples; the sea's wave trains are not worked out at all)
  else {
  // two-scale warp: broad bends in the wave fronts plus a finer wobble so crests don't line up
  vec2 q = p + vec2( vnoise( R1 * p * 0.06 ), vnoise( R1 * p * 0.06 + 17.0 ) ) * 6.0;
  q += vec2( vnoise( R2 * p * 0.21 + 5.0 ), vnoise( R2 * p * 0.21 + 31.0 ) ) * 1.6 - 0.8;
  // two differently rotated / scaled wave sets, cross-faded by a slow noise mask, so the
  // interference pattern changes from patch to patch instead of tiling across the sea
  float m = smoothstep( 0.3, 0.7, vnoise( R3 * p * 0.028 + 3.0 ) );
  vec2 sa = vec2( 0.0 ), sb = vec2( 0.0 );
  if ( m < 1.0 ) waveSet( sa, q, t, mat2( 1.0, 0.0, 0.0, 1.0 ), 1.0 );   // (where the mask is fully on one set, the other isn't worked out at all)
  if ( m > 0.0 ) waveSet( sb, q * 1.0 + 9.0, t, R2, 1.23 );
  slope += mix( sa, sb, m );
  slope += rippleSlope( p, t );
  slope *= 0.55 + 0.9 * vnoise( p * 0.04 + t * 0.02 ); // choppy / calm patches

  }

  if ( uSwamp > 0.5 ) for ( int i = 0; i < 16; i++ ) { // bubbles and stirrings: a few soft rings spreading slowly from where they broke the surface
    vec4 d = uDisturb[ i ];
    float age = t - d.z;
    if ( d.w <= 0.0 || age < 0.0 || age > 8.0 ) continue; // (a ring lives 8 s and spreads out to 8 m)
    vec2 dv = p - d.xy;
    float r = length( dv ) + 1e-4, x = r - age * 1.0;
    slope += dv / r * cos( x * 8.0 ) * exp( -x * x * 6.0 ) * exp( -age * 0.42 ) * d.w * 0.5;
  }
  // ripple rings from explosions: a wave packet travelling outward at 4.5 m/s, fading over ~3.5 s
  for ( int i = 0; i < 16; i++ ) {
    vec4 rp = uRipples[ i ];
    float age = t - rp.z;
    if ( rp.w <= 0.0 || age < 0.0 || age > 4.5 ) continue;
    vec2 dv = p - rp.xy;
    float d = length( dv ) + 1e-4, x = d - age * 4.5;
    float env = exp( -x * x * 0.6 ) * exp( -age * 1.1 ) * rp.w;
    vec2 rd = uRippleDir[ i ]; float ahead = dot( rd, rd ) > 0.01 ? smoothstep( -0.15, 0.45, dot( dv / d, rd ) ) : 1.0; // (a moving thing's rings: just the half ahead of the way it was going, fading out toward the sides)
    slope += dv / d * cos( x * 3.0 ) * env * 0.6 * ahead;
  }
  if ( uSurf > 0.5 ) { // the swell itself: long ridges of water running along the shore (they follow the depth contours), their slope tilting the surface so they catch the sky and the sun and bend the bed seen through them
    surfWarp = vnoise( p * 0.45 + vec2( t * 0.05, 0.0 ) );
    surfCyc = fract( depth * 4.0 + t * 0.17 + surfWarp * 0.5 );
    surfReach = 1.0 - smoothstep( 0.05, 0.8, depth );
    mat2 J = mat2( dFdx( p.x ), dFdy( p.x ), dFdx( p.y ), dFdy( p.y ) );
    vec2 gD = inverse( J ) * vec2( dFdx( depth ), dFdy( depth ) );                    // (which way the water gets deeper, in world metres)
    float gl = length( gD );
    surfGl = gl; if ( gl > 1e-5 ) surfDir = gD / gl;
    if ( gl > 1e-5 ) slope += gD / gl * ( cos( surfCyc * 6.2832 ) * 0.85 + cos( surfCyc * 12.566 + 1.0 ) * 0.3 ) * 0.7 * surfReach * ( 0.6 + 0.8 * vnoise( p * 0.3 ) );
  }
  if ( uSurf > 0.5 ) { // one more layer of the swell, starting 3 or 4 m further out than the first: the same ridges, driven by the wider distance map (which reaches ~14 m), fading in out there and out again toward the shore, where the first layer takes over
    const float ue = 0.003;
    vec2 gu = vec2( texture2D( tWater, vUv + vec2( ue, 0.0 ) ).b - texture2D( tWater, vUv - vec2( ue, 0.0 ) ).b, texture2D( tWater, vUv + vec2( 0.0, ue ) ).b - texture2D( tWater, vUv - vec2( 0.0, ue ) ).b );
    vec2 gdir = vec2( gu.x / uWL.x, - gu.y / uWL.y ); float gl2 = length( gdir );                                   // (which way the water gets deeper, in the world)
    if ( gl2 > 1e-7 ) {
      float per = 5.0, ph = fract( t / per + vnoise( p * 0.12 ) * 0.7 );                                          // (one crest at a time, running in over about 7 s; the phase differs along the coast, so it doesn't arrive everywhere at once)
      float cp = mix( 0.52, 0.22, ph ), x = ( wide - cp ) / 0.06;                                                    // (where the single crest is: from about 7 m out down to about 3 m)
      float crest = smoothstep( 0.0, 0.12, ph ) * ( 1.0 - smoothstep( 0.82, 1.0, ph ) );                              // (it swells as it forms and dies away as it joins the first layer)
      slope += gdir / gl2 * ( - 2.0 * x * exp( - x * x ) ) * 0.55 * crest * ( 0.6 + 0.8 * vnoise( p * 0.3 + 5.0 ) );
    }
  }
  } // (end of the not-fully-frozen waves)
  float iceSnowK = 0.0; // how much snow lies on the ice here (0 bare .. 1 snow): snow is a diffuse surface, so it takes the mirror and the glints away
  float iceRim = 0.0, iceSeam = 0.0, iceFiss = 0.0; vec2 iceMid = vec2( 0.0 ); // (the ice's seam bevel (how near a seam, and the way to the facet's middle), and, from the colour below, where the cracks and the fissures are: for the highlights)
  vec2 iw = vec2( 0.0 ), iaD = vec2( 0.0 ); vec4 ia = vec4( 0.0 ); // (ice: the warp of the cracks, the big plates, and the way to each plate's middle)
  if ( iceA > 0.001 ) {
    iw = vec2( vnoise( p * 0.35 ), vnoise( p * 0.35 + 13.0 ) ) * 2.0 - 1.0;
  if ( iceA > 0.001 ) { // the ice as blocks, not waves: flat facets, each at its own tilt, with a narrow bevel along each seam; the water's own sharp highlight formula then lights each facet all at once, so the glints are crisp polygons, like the faces of cut ice
    vec2 fw = ( vec2( vnoise( p * 0.06 + 2.0 ), vnoise( p * 0.06 + 9.0 ) ) - 0.5 ) * 9.0; // (a slow warp, so the facets are irregular polygons)
    vec4 fa = vor( R2 * ( p + fw ) * 0.32 ); vec2 fda = vorD;
    vec2 midA = ( fda * R2 ) / 0.32; float rimA = 1.0 - smoothstep( 0.0, 0.07, fa.y - fa.x );      // (the direction to the facet's middle, back in the world's axes; 1 at a seam)
    vec4 fb = vor( R3 * ( p - fw * 0.6 ) * 0.84 + 7.0 ); vec2 fdb = vorD;
    vec2 midB = ( fdb * R3 ) / 0.84; float rimB = 1.0 - smoothstep( 0.0, 0.06, fb.y - fb.x );
    vec2 facets = ( fa.zw - 0.5 ) * 0.11 + normalize( midA + 1e-4 ) * rimA * 0.09 + ( fb.zw - 0.5 ) * 0.05 + normalize( midB + 1e-4 ) * rimB * 0.05; // (big facets and smaller ones within them)
    slope = mix( slope, slope * 0.1 + facets, iceA );
    iceMid = normalize( midA + 1e-4 ); iceRim = max( rimA, rimB * 0.8 );
  }
 // (no waves, and no cells: the ice lies almost flat, with the faintest unevenness; the cracks are drawn in the colour)
  }
  slope *= 0.5 + 0.5 * cover;                          // calmer right at the waterline
  vec3 N = normalize( vec3( -slope.x, 1.0, -slope.y ) );
  vec3 V = normalize( cameraPosition - vWorld );
  vec3 Ns = N; // the normal the sky, the mirror and the sun see
  if ( iceA > 0.001 ) { // the seams' bevels are put straight into it, so a beveled edge catches its own sharp glint as the view moves
    vec3 edgeNormal = normalize( vec3( iceMid.x * iceRim * 0.45, 1.0, iceMid.y * iceRim * 0.45 ) );
    Ns = normalize( mix( Ns, edgeNormal, iceRim * iceA * 0.38 ) );
  }

  // refraction: look up the bed through the tilted surface, more distortion in deeper water
  vec2 suv = gl_FragCoord.xy / uRes + N.xz * ( 0.02 + 0.05 * depth ) * cover; // (less bend at the waterline, where the bed under it is the quay)
  vec3 col;
  if ( uSwamp > 0.5 ) { // no refraction: the muck hides what is under it. Its colour is mottled by slow noise: dark mud, green scum, and fine speckle
    float n1 = vnoise( p * 0.3 + 4.0 ), n2 = vnoise( R2 * p * 1.1 + 9.0 ), n3 = vnoise( R3 * p * 4.5 + t * 0.03 );
    vec3 muck = mix( uShallow, uDeep, clamp( depth * 0.7 + 0.35 * n1, 0.0, 1.0 ) );
    col = mix( muck, vec3( 0.17, 0.19, 0.07 ), smoothstep( 0.5, 0.8, n1 * 0.6 + n2 * 0.4 ) * 0.4 ); // (dark green scum)
    col *= 0.85 + 0.3 * n3;
    col += vec3( 0.05, 0.04, 0.015 ) * ( 0.35 + 0.65 * pow( 1.0 - max( dot( N, V ), 0.0 ), 2.0 ) ) * ( 1.0 - 0.5 * depth ); // light scattered back out of the murk: a warm glow, more at a glance
    float fleck = smoothstep( 0.72, 0.8, vnoise( p * 2.6 + vec2( t * 0.04, 0.0 ) ) * 0.6 + vnoise( p * 9.0 ) * 0.4 ); // floating leaves and bits
    col = mix( col, vec3( 0.08, 0.07, 0.03 ), fleck * 0.5 );
  } else {
    vec3 colW = vec3( 0.0 ), colI = vec3( 0.0 ); // (open water and ice, both worked out only while the freeze is spreading across this spot, and blended)
    if ( iceA < 0.999 ) {
    vec3 tint = mix( uShallow, uDeep, depth );
    col = uSimple > 0.5 ? mix( tint, uShallow, 0.2 * ( 1.0 - depth ) ) : mix( texture2D( tRefract, suv ).rgb, tint, mix( 0.25, 0.8, depth ) * ( 1.0 - 0.7 * brkOpen ) ); // (a hole in the ice: clear water, the hull seen through it) // (lite: just the tint, a little lighter in the shallows)
      colW = col;
    }
    if ( iceA > 0.001 ) { // the frozen sea (after a dark teal lake ice): clear, glossy ice over black water, so a hull gliding under it shows, softened; long white fractures with a soft teal glow, thin dark fissures, trapped bubbles
    vec2 bl = vec2( 0.0022, 0.0022 * uRes.x / uRes.y );
    vec2 ca = bl * 1.6;                                                                                              // (chromatic aberration: the ice bends red, green and blue by slightly different amounts, so a hull seen through it has a faint colour fringe)
    vec3 under = vec3( texture2D( tRefract, suv + ca ).r, texture2D( tRefract, suv ).g, texture2D( tRefract, suv - ca ).b ) * 0.36;
    under += ( texture2D( tRefract, suv + vec2( bl.x, 0.0 ) ).rgb + texture2D( tRefract, suv - vec2( bl.x, 0.0 ) ).rgb + texture2D( tRefract, suv + vec2( 0.0, bl.y ) ).rgb + texture2D( tRefract, suv - vec2( 0.0, bl.y ) ).rgb ) * 0.16; // (a soft blur: seen through thick ice)
    vec3 iceDeep = mix( vec3( 0.02, 0.3, 0.37 ), vec3( 0.0, 0.025, 0.06 ), smoothstep( 0.0, 0.8, depth ) ); // (a rich cyan-emerald near the shore and under the light, down to a dark navy-teal in the deep)
    vec2 q1 = p + iw * 0.35;
    vec2 pv = V.xz / max( V.y, 0.3 );                                                                  // (parallax: the cracks lie at different depths in the ice; a deeper one is seen along the line of sight, so it slides across the surface as the camera moves)
    vec2 wob = ( vec2( vnoise( p * 0.55 + 3.0 ), vnoise( p * 0.55 + 11.0 ) ) - 0.5 ) * 1.2 + ( vec2( vnoise( p * 2.3 + 5.0 ), vnoise( p * 2.3 + 17.0 ) ) - 0.5 ) * 0.4; // (the ice's top is not a mirror: its uneven surface bends the view of what lies in it, so the cracks seen through it are warped, the deeper ones more)
    vec2 qA = q1 - pv * 0.3 + wob * 0.2, qB = q1 - pv * 1.1 + wob * 0.5, qC = q1 - pv * 2.0 + wob * 0.8, qD = q1 - pv * 0.6 + wob * 0.3, qE = q1 - pv * 1.5 + wob * 0.65, qF = q1 - pv * 0.2 + wob * 0.18, qK1 = q1 - pv * 2.6 + wob * 1.0, qK2 = q1 - pv * 1.3 + wob * 0.55; // (metres down: the shallow ones nearly at the surface, the deepest well below it)
    vec2 wd = vec2( 0.87, 0.5 ), wn = vec2( -0.5, 0.87 );
    float sf = vnoise( p * 0.045 + 41.0 ) * 0.5 + vnoise( p * 0.12 + 7.0 ) * 0.28 + vnoise( vec2( dot( p, wd ) * 0.05, dot( p, wn ) * 0.4 ) + 3.0 ) * 0.22; // (broad patches, medium ones, and drifts stretched along the wind)
    sf += ( vnoise( p * 1.7 + 3.0 ) * 0.5 + vnoise( p * 4.4 + 11.0 ) * 0.3 + vnoise( p * 9.0 + 2.0 ) * 0.2 - 0.5 ) * 0.2; // (ragged edges)
    sf += ( 1.0 - smoothstep( 0.0, 0.3, depth ) ) * 0.16;                                                               // (more snow toward the shore)
    float snowA = smoothstep( 0.565, 0.645, sf ) * ( 1.0 - brkNear ); // (one layer, on the very top of the ice: lying on the surface itself, with no depth, no parallax and no warp, unlike the cracks)
    vec2 cM = vec2( 0.0 ), cD = vec2( 0.0 ), cK = vec2( 0.0 );
    if ( snowA < 0.98 ) { cM = crackNet( qA, 16.0, 1.0, 1.7, 0.075 ); cD = crackNet( qB, 8.0, 2.0, 1.5, 0.05 ); cK = crackNet( qK1, 22.0, 4.0, 1.4, 0.03 ); } // (under full snow the cracks are not seen at all: they are not worked out there) // (long major fractures near the surface, middle ones below them, fine ones deep down, and a few dark open cracks deepest)
    float patchD = smoothstep( 0.3, 0.6, vnoise( p * 0.07 + 33.0 ) ), patchF = smoothstep( 0.35, 0.65, vnoise( p * 0.09 + 52.0 ) ); // (the finer cracks come in patches, with clear ice between)
    float lines = cM.x * 1.0 + cD.x * ( 0.25 + 0.5 * patchD );                                                                 // (the white frost along the shallow fractures)
    float linesDeep = 0.0;                                                                          // (the deep, fine ones: seen through the ice, a cooler blue)
    float glow  = cM.y * 0.5 + cD.y * 0.3;                                                                 // (a faint stress glow)
    vec2 k1 = cK, k2 = vec2( 0.0 );
    float fissure = clamp( k1.x, 0.0, 1.0 );                                                               // (a few dark open cracks, deep enough to hide what is under them)
    iceSeam = clamp( cM.x + cD.x * 0.2 + iceRim * 1.5, 0.0, 1.0 ); iceFiss = fissure; // (only the major fractures catch the sun's glint: the finer ones do not light up, or the glare turns into a mesh)
    float live = 0.4 + 0.6 * smoothstep( 0.3, 0.65, vnoise( p * 0.12 + 20.0 ) );                                         // (some stretches are shattered, some clean)
    live = mix( live, 1.0, brkStress );
    if ( brkStress > 0.01 ) { vec2 cS1 = crackNet( q1 - pv * 0.4, 5.0, 7.0, 1.3, 0.07 ), cS2 = crackNet( q1 - pv * 0.15, 2.6, 9.0, 1.2, 0.05 ), cS3 = crackNet( q1 - pv * 0.9, 1.5, 13.0, 1.1, 0.035 ); lines += ( cS1.x * 0.9 + cS2.x * 0.9 + cS3.x * 0.8 ) * brkStress * brkStress; glow += brkStress * 0.5; fissure = max( fissure, ( cS2.x * 0.5 + cS3.x * 0.4 ) * brkStress * brkStress * brkStress ); } // (the stress cracks: more and finer ones as the break nears)
    col = mix( under * 1.45 * ( 1.0 - 0.85 * fissure ), iceDeep, mix( 0.2, 0.34, depth ) );   // (what is under the ice shows clearly: a hull in the water is a bright shape in dark water)
    float subM = smoothstep( 0.012, 0.07, length( texture2D( tRefract, suv ).rgb - vec3( 0.001, 0.008, 0.012 ) ) ); // (anything under the ice that is not the dark water behind it: a hull, a boat)
    col = mix( col, under * 1.7 + vec3( 0.0, 0.025, 0.035 ), subM * 0.92 * ( 1.0 - 0.85 * fissure ) );   // (it shows through almost undimmed: the ice is clear)
    col = mix( col, vec3( 0.0, 0.02, 0.05 ), ( smoothstep( 0.4, 0.78, vnoise( p * 0.055 + 3.0 ) ) * 0.7 + smoothstep( 0.45, 0.8, vnoise( p * 0.14 + 31.0 ) ) * 0.3 ) ); // (the ice's thickness, from over the surface: deep patches fall away to a dark navy, the thinner ice stays a bright cyan-green: the depth of the sea under it)
    col += vec3( 0.0, 0.045, 0.05 ) * vnoise( p * 0.35 + 9.0 ) + vec3( 0.0, 0.03, 0.03 ) * vnoise( p * 1.3 );          // (lighter teal where the ice is thinner)
    col *= 1.0 - 0.7 * fissure;                                                                                              // (the dark cracks)
    col = mix( col, vec3( 0.06, 0.4, 0.47 ), clamp( glow * live, 0.0, 1.0 ) * 0.16 );                                      // (the teal stress glow)
    col = mix( col, vec3( 0.42, 0.68, 0.76 ), clamp( linesDeep * live, 0.0, 1.0 ) * 0.4 );                                    // (the deep cracks, cyan)
    col = mix( col, vec3( 0.8, 0.91, 0.95 ), clamp( lines * live * ( 0.7 + 0.3 * vnoise( p * 2.0 ) ), 0.0, 1.0 ) * 0.62 );    // (pale, subtle lines: not glowing)
    col = mix( col, vec3( 0.62, 0.8, 0.86 ), clamp( cM.y * 0.9 + cD.y * 0.5, 0.0, 1.0 ) * 0.42 * live * ( 0.5 + 0.5 * vnoise( p * 0.4 + 12.0 ) ) ); // (milky frost bands along the long fractures, wider and fuzzier, patchy)
    col = mix( col, vec3( 0.07, 0.5, 0.58 ), ( smoothstep( 0.5, 0.82, vnoise( p * 0.03 + 17.0 ) ) * 0.6 + smoothstep( 0.55, 0.85, vnoise( p * 0.09 + 5.0 ) ) * 0.25 ) ); // (broad lighter turquoise stretches among the deeper blue) // (crisp white frost along the fractures, flickering in brightness along them)
    // (no frost specks or bubbles: fine dots of that size shimmered as the camera moved)
    // snow lying on the ice: ragged patches, thicker toward the shore, stretched into drifts along the wind, thin and broken at the edges, bluish in the hollows, over the cracks
    if ( snowA > 0.01 ) { // (the snow's lighting, relief and tracks are only worked out where there is snow)
    vec3 qS = vec3( p.x, 0.0, p.y ), upV = normalize( ( viewMatrix * vec4( 0.0, 1.0, 0.0, 0.0 ) ).xyz );   // (the terrain's own snow: its relief, its crust and grain, its tint, from snow-surface.js, lit by the sun's direction against that relief)
    vec3 nS = normalize( upV - snowTilt( qS, upV ) * ${SNOW_TILT.toFixed(3)} ), Lv = normalize( ( viewMatrix * vec4( uSun, 0.0 ) ).xyz );
    float trR = 0.0, trHard = 0.0;
    #ifdef ICE_TRAILS
    { // the tracks: the groove's slope tilts the snow's normal (a dent with a faint lip), and the snow in it is darker, cooler, and a little brown where it was pressed hardest, exactly as on the terrain
      vec2 tuv = vec2( ( p.x - uTrailBox.x ) * uTrailBox.z, ( uTrailBox.y - p.y ) * uTrailBox.w );
      if ( uTrailOn > 0.5 && tuv.x > 0.0 && tuv.x < 1.0 && tuv.y > 0.0 && tuv.y < 1.0 ) {
        vec2 tx = vec2( 1.8 / ICE_TRAIL_SIZE ), mpp = 1.8 / ( vec2( uTrailBox.z, uTrailBox.w ) * ICE_TRAIL_SIZE ), tw = tx * 3.0, mpw = mpp * 3.0;
        vec2 gt = vec2( ( trT( tuv + vec2( tx.x, 0.0 ) ) - trT( tuv - vec2( tx.x, 0.0 ) ) ) / ( 2.0 * mpp.x ), - ( trT( tuv + vec2( 0.0, tx.y ) ) - trT( tuv - vec2( 0.0, tx.y ) ) ) / ( 2.0 * mpp.y ) );
        vec2 gw = vec2( ( trT( tuv + vec2( tw.x, 0.0 ) ) - trT( tuv - vec2( tw.x, 0.0 ) ) ) / ( 2.0 * mpw.x ), - ( trT( tuv + vec2( 0.0, tw.y ) ) - trT( tuv - vec2( 0.0, tw.y ) ) ) / ( 2.0 * mpw.y ) );
        float vary = 0.75 + 0.25 * mn( vec3( p * 0.9, 17.0 ) );
        vec2 gh = ( - ( 0.14 + 0.6 * ICE_TRAIL_BERM ) * gt + ICE_TRAIL_BERM * gw ) * vary * ICE_TRAIL_FLIP;
        vec3 tgv = ( viewMatrix * vec4( gh.x, 0.0, gh.y, 0.0 ) ).xyz; tgv -= nS * dot( tgv, nS ); nS = normalize( nS - tgv );
        vec2 e2 = vec2( 1.6 / ICE_TRAIL_SIZE );
        float tr = trT( tuv ) * 0.4 + 0.15 * ( trT( tuv + vec2( e2.x, 0.0 ) ) + trT( tuv - vec2( e2.x, 0.0 ) ) + trT( tuv + vec2( 0.0, e2.y ) ) + trT( tuv - vec2( 0.0, e2.y ) ) );
        trR = smoothstep( 0.03, 0.85, tr ) * vary; trHard = smoothstep( 0.6, 0.98, tr ) * smoothstep( 0.35, 0.8, mn( vec3( p * 2.5, 11.0 ) ) );
      }
    }
    #endif
    float rel = dot( nS, Lv ) - dot( upV, Lv );
    vec3 snowCol = vec3( ${SNOW_GROUND.map(v => v.toFixed(3)).join(', ')} ) * snowTint( qS ) * snowShade( qS ) * clamp( 1.0 + 1.6 * rel, 0.55, 1.35 ) * 1.45;
    snowCol *= 1.0 - trR * 0.22; snowCol = mix( snowCol, snowCol * vec3( 0.88, 0.93, 1.0 ), trR * 0.5 ); snowCol = mix( snowCol, vec3( 0.26, 0.23, 0.2 ), trHard * 0.3 );
    col = mix( col, snowCol, snowA * 0.96 );
    iceSnowK = snowA;
    }
      colI = col;
    }
    col = mix( colW, colI, iceA );
  }

  // sky reflection, stronger at glancing angles (Schlick fresnel)
  vec3 R = reflect( -V, Ns );
  vec3 sky = mix( uSkyLo, uSkyHi, smoothstep( 0.0, 0.6, R.y ) );
  float fres = 0.04 + 0.96 * pow( 1.0 - max( dot( N, V ), 0.0 ), 5.0 );
  if ( uSwamp > 0.5 && uClouds > 0.5 ) { // half blue sky, half cloud: broad white masses with soft edges over a deeper blue overhead. The ripples tilt the reflected ray, which slides the cloud lookup about (the layer is far up): the clouds wobble and stream with the water
    vec2 cp = p + R.xz / max( R.y, 0.2 ) * 14.0; // (a short lever: the ripples only nudge the clouds, they don't shatter them)
    float cn = vnoise( cp * 0.035 + vec2( t * 0.006, 0.0 ) ) * 0.7 + vnoise( R1 * cp * 0.08 + 7.0 ) * 0.3; // (a few big soft masses, no fine detail)
    float cloud = smoothstep( 0.34, 0.66, cn ); // (about half of the sky)
    vec3 blue = mix( vec3( 0.26, 0.42, 0.64 ), vec3( 0.16, 0.30, 0.55 ), smoothstep( 0.3, 0.95, R.y ) ); // (a muted blue: it is seen through murk)
    sky = mix( blue, vec3( 0.74, 0.77, 0.78 ), cloud );
    col += sky * 0.12 * pow( max( dot( N, normalize( vec3( -0.3, 1.0, 0.4 ) ) ), 0.0 ), 24.0 ); // (a soft sheen on the ripples that face the light)
  } else if ( uSwamp > 0.5 ) { // the sky seen in murk: just a tint of the fog's colour, a little paler overhead, and a faint sheen where the view glances off it
    sky = mix( uOvercast, uOvercast * 1.35, smoothstep( 0.3, 0.95, R.y ) * 0.6 );
    col += uOvercast * 0.5 * pow( max( dot( N, normalize( vec3( -0.3, 1.0, 0.4 ) ) ), 0.0 ), 24.0 ); // a soft sheen on the ripples that tilt toward the light: the wet look (seen from above the plain fresnel is near nothing)
    col += uOvercast * 0.18 * pow( 1.0 - max( dot( N, V ), 0.0 ), 3.0 );
  }
  col = mix( col, sky, clamp( mix( 0.06 + fres * 2.5 + iceA * 0.3, ( 0.17 + 0.13 * uClouds ) + fres * 1.2, uSwamp ), 0.0, mix( 0.7 + iceA * 0.15, 0.4 + 0.1 * uClouds, uSwamp ) ) * ( 1.0 - 0.85 * iceSnowK ) );

  // mirrored objects (explosions, palms, the chopper...), rippled like everything else
  vec4 ruv = vReflUv;
  ruv.xy += mix( N.xz, Ns.xz * 0.6, iceA ) * ( 0.022 + 0.02 * uSwamp ) * ruv.w; // (a swamp's moving surface wavers what is mirrored in it) // (a light bend: more makes mirrored buildings and boats break into blobs)
  vec4 refl = texture2DProj( tReflect, ruv );
  { float lr = dot( refl.rgb, vec3( 0.3, 0.59, 0.11 ) ); refl.rgb = mix( vec3( lr ), refl.rgb, 1.0 + 3.6 * iceA ) * ( 1.0 + 0.3 * iceA ); } // (on ice the reflection's colours are pushed further apart and lifted a little: a dull dark ghost reads as a second shadow, a colourful one reads as a reflection)
  float rk = clamp( 0.55 + fres * 2.0 + 0.2 * uSwamp + 0.45 * iceA, 0.0, 0.85 + 0.1 * uSwamp + 0.13 * iceA );
  rk = mix( rk, clamp( 0.14 + fres * 1.1, 0.0, 0.36 ), iceA ); // (ice is a dull, faint mirror: what is above it shows only as a ghost, never as a second, small copy of itself)
  rk *= 1.0 - 0.88 * iceSnowK; // (snow does not mirror what is above it) // (a swamp is a darker mirror: what is above it shows clearly)
  col = col * ( 1.0 - refl.a * rk ) + refl.rgb * rk; // refl.rgb is already weighted by its alpha (smoke, dust)

  // sunlight: a sharp glitter lobe on ripples that face the sun, plus a soft sheen
  vec3 H = normalize( V + uSun );
  float nh = max( dot( Ns, H ), 0.0 );
  vec3 sunCol = vec3( 1.0, 0.95, 0.85 );
  col += sunCol * ( pow( nh, 500.0 ) * 6.0 + pow( nh, 40.0 ) * 0.22 ) * mix( 1.0, 0.35, uSwamp ) * ( 1.0 - iceA ) * uSpec; // (the ice's gloss: a bright core and a wide smooth falloff, cool white, rolled off softly so it never clips flat, like the highlight on a block of clear ice) // (wet ice: a broad hot streak where it faces the sun)

  if ( iceA > 0.001 ) { // the ice's highlights, in two parts: a tight mirror glint on the smooth plates, and a broad rough lobe along the seams and the cracks (crushed, frosted ice), none inside the dark fissures
    float specFrost = pow( nh, 60.0 ) * 3.5 + pow( nh, 12.0 ) * 0.8;                       // (broad, soft lobes: the light rolls across the ice, no pin-point lens flare)
    float microCrystal = mix( 0.7, 1.3, vnoise( p * 25.0 ) );                                  // (a fine glitter, as of tiny ice crystals, so it is sugary and not lacquered)
    float totalSpec = mix( specFrost, specFrost * 1.5, iceSeam ) * microCrystal * ( 1.0 - 0.9 * iceFiss ) * ( 1.0 - 0.9 * iceSnowK ); // (brighter along the seams and cracks; none in the dark fissures, and none on snow)
    col += sunCol * iceA * totalSpec * uSpec * 0.22;
  }
  if ( uSurf > 0.5 && iceA < 0.5 ) { // shoreline foam: metres to the waterline -> a swash that rushes up and slides back (a sawtooth moving toward the land) -> eroded by scrolling noise, so its trailing edge breaks into lace -> layered: a thin crisp leading line, soft trailing lace, a lighter shallows, lit like the scene
    float dm = surfGl > 1e-5 ? min( depth / surfGl, 9.0 ) : 9.0;                                                       // (distance to the shore in metres: the depth over how fast it changes)
    float shore = clamp( 1.0 - dm / 3.2, 0.0, 1.0 );                                                                     // (1 at the waterline, 0 at the foam's width)
    vec2 fp = p + N.xz * 0.7;                                                                                          // (the foam wobbles with the ripples)
    vec2 fdr = vec2( t * 0.03, - t * 0.04 );
    float phase = fract( dm * 0.3 + t * 0.2 + vnoise( p * 0.05 ) * 2.0 + surfWarp * 0.6 );                             // (the waves arrive at different times along the coast)
    float swash = smoothstep( 0.0, 0.15, phase ) * ( 1.0 - smoothstep( 0.15, 1.0, phase ) );                          // (a quick rush, a slow retreat)
    float n = vnoise( fp * 2.0 + fdr ) * 0.55 + vnoise( R2 * fp * 5.5 - fdr * 1.5 ) * 0.45 + ( vnoise( fp * 23.0 ) - 0.5 ) * 0.25; // (scrolling noise at two scales, plus fine bubbles)
    float band = shore * swash;
    float mask = smoothstep( 0.4, 0.8, band * 1.25 + n * 0.5 - 0.2 );                                                    // (the noise erodes the edge of the band: lace)
    float lead = smoothstep( 0.0, 0.04, phase ) * ( 1.0 - smoothstep( 0.06, 0.15, phase ) ) * shore * smoothstep( 0.28, 0.5, n + 0.2 ); // (the thin bright front of the swash)
    float tr = shore * ( 1.0 - smoothstep( 0.15, 1.0, phase ) ) * smoothstep( 0.46, 0.72, n * 1.1 ) * 0.6;           // (soft lace left behind, fading slowly)
    float foamAmt = clamp( mask * ( 0.6 + 0.4 * swash ) + lead * 0.9 + tr, 0.0, 1.0 );
    float soft = smoothstep( 0.25, 0.7, band * 1.25 + n * 0.5 - 0.2 );
    col = mix( col, uShallow * 1.25 + 0.02, shore * 0.22 );                                                            // (lighter in the shallows)
    col *= 1.0 - 0.22 * clamp( soft - foamAmt, 0.0, 1.0 );                                                             // (a faint dark rim just outside the foam, for contrast on the pale sand)
    vec3 foamCol = vec3( 0.93, 0.96, 1.0 ) * ( 0.72 + 0.28 * max( dot( N, uSun ), 0.0 ) ) * ( 0.9 + 0.1 * vnoise( p * 28.0 ) ); // (lit, not flat white)
    col = mix( col, foamCol, foamAmt * 0.85 );
  }
  if ( uSwamp > 0.5 ) col *= clamp( 1.0 + dot( slope, vec2( -0.5, 0.85 ) ) * 0.6, 0.88, 1.12 ); // the ripples catch a little more light on one side
  if ( uSwamp > 0.5 ) col = mix( col, vec3( 0.29, 0.29, 0.15 ), ( 1.0 - smoothstep( 0.0, 0.035, depth ) ) * 0.65 ); // lighter only right at the shore (about a metre): the shallows
  float swampA = mix( 0.6, 0.98, smoothstep( 0.0, 0.3, depth ) ); // by depth: thin and see-through at the edge (the bank shows), murky in the middle
  gl_FragColor = vec4( col, cover * mix( 1.0, swampA, uSwamp ) );
  #include <fog_fragment>
}`;

export function createWater(renderer, waterTex, width, length, swamp = false) { // swamp: murky and opaque, no see-through pass (stage 4)
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  const target = new THREE.WebGLRenderTarget(size.x, size.y, { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
  const uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
    tRefract: { value: null }, tReflect: { value: null }, textureMatrix: { value: new THREE.Matrix4() }, tWater: { value: null }, uRes: { value: new THREE.Vector2() }, uTime: { value: 0 },
    uSun: { value: new THREE.Vector3(-9, 18, 10).normalize() },
    uShallow: { value: new THREE.Color(swamp ? 0x2a2f16 : 0x3f86b0) }, uDeep: { value: new THREE.Color(swamp ? 0x131a0c : 0x0c2c5e) }, uSurf: { value: 0 }, uIce: { value: 0 }, uWL: { value: new THREE.Vector2( 1, 1 ) }, uSpec: { value: 1 }, uSkyLo: { value: new THREE.Vector3( 0.85, 0.68, 0.45 ) }, uSkyHi: { value: new THREE.Vector3( 0.55, 0.75, 1.0 ) }, uSwamp: { value: swamp ? 1 : 0 }, uSimple: { value: 0 }, uOvercast: { value: new THREE.Color(0x8a9062) }, uClouds: { value: 0 }, uDisturb: { value: Array.from({ length: 16 }, () => new THREE.Vector4()) },
    uBrkA: { value: Array.from({ length: 7 }, () => new THREE.Vector4()) }, uBrkB: { value: Array.from({ length: 7 }, () => new THREE.Vector4()) }, uRipples: { value: Array.from({ length: 16 }, () => new THREE.Vector4()) }, uRippleDir: { value: Array.from({ length: 16 }, () => new THREE.Vector2()) },
  }]);
  let scale = 1, every = 1, frame = 0, reflect = true, cleared = false, output = null, simple = false; // simple: opaque, no see-through pass (the lite look)
  const clearColor = new THREE.Color(); // (reused every frame)
  const reflOpts = { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter };
  let reflTarget = new THREE.WebGLRenderTarget(size.x / 2, size.y / 2, reflOpts);
  uniforms.tReflect.value = reflTarget.texture;
  uniforms.tRefract.value = target.texture; uniforms.tWater.value = waterTex; uniforms.uRes.value.copy(size);
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, length), new THREE.ShaderMaterial({
    uniforms, vertexShader, fragmentShader, transparent: true, depthWrite: false, fog: true,
  }));
  mesh.rotation.x = -Math.PI / 2;
  let reflDiv = 2; // (the mirror view is drawn at 1/2 of the screen's size on water, at full size on ice, where it is a clear mirror)
  let reflectAll = true; // (on ice the mirror draws the whole scene; setReflectAll(false) goes back to the tagged things only, as for open water)
  const hideInMirror = [], hooks = {}; // (hideInMirror: objects left out of the mirror on ice; hooks: before / after the see-through pass on ice)
  // The shadows on the ice: a clear plane just over the water that shows only the shadows falling on it (where the water is), so things standing on the ice have their shadow right under them
  const iceShadowMat = new THREE.ShadowMaterial({ opacity: .2 });
  iceShadowMat.onBeforeCompile = sh => { sh.uniforms.tWaterM = { value: waterTex };
    sh.vertexShader = ['varying vec2 vUvW;', ''].join(String.fromCharCode(10)) + sh.vertexShader.replace('#include <begin_vertex>', ['#include <begin_vertex>', 'vUvW = uv;'].join(String.fromCharCode(10)));
    sh.fragmentShader = ['varying vec2 vUvW;', 'uniform sampler2D tWaterM;', ''].join(String.fromCharCode(10)) + sh.fragmentShader.replace('void main() {', ['void main() {', 'if ( texture2D( tWaterM, vUvW ).g < 0.5 ) discard;'].join(String.fromCharCode(10))); };
  const iceShadow = new THREE.Mesh(mesh.geometry, iceShadowMat); iceShadow.position.z = .03; iceShadow.receiveShadow = true; iceShadow.renderOrder = 2; iceShadow.visible = false; iceShadow.userData.noWater = true; mesh.add(iceShadow); // (local z is up: the water plane lies rotated)

  // Mirrored camera with an oblique near plane on the water surface (same approach as three's
  // Reflector), so nothing below the surface gets into the reflection.
  const mirrorCam = new THREE.PerspectiveCamera();
  const normal = new THREE.Vector3(), surface = new THREE.Vector3(), camPos = new THREE.Vector3(), rot = new THREE.Matrix4();
  const view = new THREE.Vector3(), lookAt = new THREE.Vector3(), target3 = new THREE.Vector3();
  const plane = new THREE.Plane(), clip = new THREE.Vector4(), qv = new THREE.Vector4();
  function updateMirror(camera) {
    mesh.updateMatrixWorld(); camera.updateMatrixWorld();
    surface.setFromMatrixPosition(mesh.matrixWorld); camPos.setFromMatrixPosition(camera.matrixWorld);
    normal.set(0, 1, 0);
    view.subVectors(surface, camPos);
    if (view.dot(normal) > 0) return false; // camera below the surface
    view.reflect(normal).negate().add(surface);
    rot.extractRotation(camera.matrixWorld);
    lookAt.set(0, 0, -1).applyMatrix4(rot).add(camPos);
    target3.subVectors(surface, lookAt).reflect(normal).negate().add(surface);
    mirrorCam.position.copy(view);
    mirrorCam.up.set(0, 1, 0).applyMatrix4(rot).reflect(normal);
    mirrorCam.lookAt(target3);
    mirrorCam.far = camera.far;
    mirrorCam.updateMatrixWorld();
    mirrorCam.projectionMatrix.copy(camera.projectionMatrix);
    uniforms.textureMatrix.value.set(.5, 0, 0, .5, 0, .5, 0, .5, 0, 0, .5, .5, 0, 0, 0, 1)
      .multiply(mirrorCam.projectionMatrix).multiply(mirrorCam.matrixWorldInverse).multiply(mesh.matrixWorld);
    plane.setFromNormalAndCoplanarPoint(normal, surface).applyMatrix4(mirrorCam.matrixWorldInverse);
    clip.set(plane.normal.x, plane.normal.y, plane.normal.z, plane.constant);
    const e = mirrorCam.projectionMatrix.elements;
    qv.set((Math.sign(clip.x) + e[8]) / e[0], (Math.sign(clip.y) + e[9]) / e[5], -1, (1 + e[10]) / e[14]);
    clip.multiplyScalar(2 / clip.dot(qv));
    e[2] = clip.x; e[6] = clip.y; e[10] = clip.z + 1 - .003; e[14] = clip.w;
    return true;
  }

  return {
    mesh, mirrorCam,
    // A swamp's own disturbance at (x, z): a bubble breaking, something stirring (strength ~1 for a bubble). Reuses the oldest of 16 slots.
    disturb(x, z, strength = 1) {
      const slots = uniforms.uDisturb.value, now = uniforms.uTime.value, slot = slots.reduce((a, b) => (b.w <= 0 || b.z < a.z ? b : a));
      slot.set(x, z, now, strength);
    },
    setClouds(on) { uniforms.uClouds.value = on ? 1 : 0; }, // (a swamp's sky: half blue, half cloud; off: overcast)
    setWaterColors(shallow, deep) { uniforms.uShallow.value.set(shallow); uniforms.uDeep.value.set(deep); }, // (hex: the sea's tint in the shallows and in the depths)
    setSpec(k) { uniforms.uSpec.value = k; }, // (the sun's glitter: 1 = default)
    setWL(w, l) { uniforms.uWL.value.set(w, l); },
    setSun(x, y, z) { uniforms.uSun.value.set(x, y, z).normalize(); }, // (where the sun stands: the sea's glitter)
    setBreaks(list) { for (let i = 0; i < 7; i++) { const b = list[i]; if (!b) { uniforms.uBrkB.value[i].set(0, 0, 0, 0); continue; } uniforms.uBrkA.value[i].set(b.x, b.z, -Math.sin(b.yaw), -Math.cos(b.yaw)); uniforms.uBrkB.value[i].set(b.hl, b.hw, b.stress, b.open); } }, // (the ambush subs under the ice: where each lies, and how far the ice over it has cracked and opened)
    setTrails(gt) { // the ground-trail map (ground-trail.js): the snow patches on the ice show the tracks too
      const m = mesh.material; m.uniforms.uTrailMap = gt.uMap; m.uniforms.uTrailOn = gt.uOn; m.uniforms.uTrailBox = { value: gt.box };
      m.defines = { ICE_TRAILS: '', ICE_TRAIL_SIZE: gt.size.toFixed(1), ICE_TRAIL_BERM: (gt.berm ?? .03).toFixed(3), ICE_TRAIL_FLIP: gt.flip ? '-1.0' : '1.0' }; m.needsUpdate = true;
    },
    setReflectAll(on) { reflectAll = !!on; },
    setReflectHide(list) { hideInMirror.length = 0; hideInMirror.push(...list); }, hooks,
    setIce(v) { uniforms.uIce.value = v === true ? 1 : v === false ? 0 : v; iceShadow.visible = uniforms.uIce.value > 0.6; { const d = 2; if (d !== reflDiv) { reflDiv = d; this.resize(); } } }, // (how far the sea has frozen, 0 to 1 (or true / false): the secret level's)
    setSurf(on) { uniforms.uSurf.value = on ? 1 : 0; }, // (surf along the shore: the secret level's)
    setSkyColors(lo, hi) { const a = new THREE.Color(lo), b = new THREE.Color(hi); uniforms.uSkyLo.value.set(a.r, a.g, a.b); uniforms.uSkyHi.value.set(b.r, b.g, b.b); }, // (hex colours: the sky the open sea mirrors)
    setSky(color) { uniforms.uOvercast.value.set(color); }, // (a swamp's overcast: the stage's fog colour)
    update(dt) { uniforms.uTime.value += dt; WAVE_TIME.value = uniforms.uTime.value; }, // (the land's shader follows the same waves: surf-time.js)
    // Start a ripple ring at (x, z); strength ~1 for a grenade. Reuses the oldest of 16 slots.
    // dir: { x, z } the way the thing was heading: only the half of the ring ahead of that is shown (a wake); leave it out for a whole ring (a blast).
    ripple(x, z, strength = 1, dir = null) {
      const slots = uniforms.uRipples.value, now = uniforms.uTime.value;
      const slot = slots.reduce((a, b) => (b.w <= 0 || b.z < a.z ? b : a));
      slot.set(x, z, now, strength);
      const d = uniforms.uRippleDir.value[slots.indexOf(slot)], len = dir ? Math.hypot(dir.x, dir.z) : 0;
      if (len > 1e-4) d.set(dir.x / len, dir.z / len); else d.set(0, 0);
    },
    resize() {
      renderer.getDrawingBufferSize(size);
      target.setSize(Math.max(1, Math.round(size.x * scale)), Math.max(1, Math.round(size.y * scale)));
      reflTarget.setSize(Math.max(1, Math.round(size.x * scale / reflDiv)), Math.max(1, Math.round(size.y * scale / reflDiv))); cleared = false;
      uniforms.uRes.value.copy(size);
    },
    // Draw the reflection and see-through views at this fraction of the screen's resolution (quality.js).
    setScale(k) { scale = k; this.resize(); },
    // Redraw the shadow map and the water's views only every n frames (quality.js, lowest level).
    setEvery(n) { every = n; },
    // The reflection drawn with n-times multisampling (0: none; WebGL2 only): the thin parts of a bridge, narrower than a pixel in the half-size picture, no longer crawl as the camera moves (quality.js, top level).
    setReflectAA(n) {
      const want = renderer.capabilities.isWebGL2 ? n : 0;
      if ((reflTarget.samples ?? 0) === want) return;
      const w = Math.max(1, Math.round(size.x * scale / reflDiv)), h = Math.max(1, Math.round(size.y * scale / reflDiv));
      reflTarget.dispose();
      reflTarget = want ? new THREE.WebGLMultisampleRenderTarget(w, h, reflOpts) : new THREE.WebGLRenderTarget(w, h, reflOpts);
      if (want) reflTarget.samples = want;
      uniforms.tReflect.value = reflTarget.texture; cleared = false;
    },
    get fresh() { return frame % every === 0; }, // (this frame redraws the water views and the shadow map)
    // Where the final view is drawn: null for the screen, or a render target (msaa.js).
    setOutput(t) { output = t; },
    // Reflections of the scene on or off (off: only the sky's colour is reflected; quality.js, lowest level).
    setReflect(on) { reflect = on; cleared = false; },
    // The lite look: the sea's colours and the sky in it, with no see-through pass at all (what is under the water is not seen).
    setSimple(on) { simple = on; uniforms.uSimple.value = on ? 1 : 0; },
    // Draw the scene: mirrored into the reflection texture, without water into the refraction
    // texture, then for real. inView: is any water on screen (if not, the two water views are skipped).
    render(scene, camera, inView = true) {
      const fresh = ++frame % every === 0;
      renderer.shadowMap.autoUpdate = false;
      renderer.shadowMap.needsUpdate = false; // (the shadow map is drawn before this, on its own: see renderAll in world.js)
      mesh.visible = false;

      if (!reflect && !cleared) { // reflections off: an empty view (alpha 0 = only sky here)
        const clear = renderer.getClearColor(clearColor), clearA = renderer.getClearAlpha();
        renderer.setClearColor(0x000000, 0); renderer.setRenderTarget(reflTarget); renderer.clear(); renderer.setClearColor(clear, clearA);
        cleared = true;
      }
      profile.mark('water setup');
      if (inView && fresh) {
      if (reflect && updateMirror(camera)) {
        const bg = scene.background, clear = renderer.getClearColor(clearColor), clearA = renderer.getClearAlpha();
        scene.background = null; renderer.setClearColor(0x000000, 0); // alpha 0 = "only sky here"
        mirrorCam.layers.set(REFLECT); // only what can show in the reflection (layers.js)
        const everything = reflectAll && uniforms.uIce.value > 0.001, hidden = []; // (on ice: the whole scene is mirrored, the soldiers, the explosions and all, not only what was tagged when the level was built; the land itself (anything marked noWater, and the ground) is left out: it is heavy and is far from the ice)
        if (everything) { mirrorCam.layers.enable(0); for (const o of scene.children) if (o.visible && (o.userData.noWater || hideInMirror.includes(o))) { o.visible = false; hidden.push(o); } }
        const c0 = renderer.info.render.calls, t0 = performance.now();
        renderer.setRenderTarget(reflTarget); renderer.clear(); renderer.render(scene, mirrorCam);
        for (const o of hidden) o.visible = true;
        passCalls.reflect += renderer.info.render.calls - c0; passTime.reflect += performance.now() - t0; profile.mark('water reflection');
        scene.background = bg; renderer.setClearColor(clear, clearA);
      }

      if (!swamp && !simple) { // (a swamp is not see-through: that whole pass is skipped; so is it in the lite look)
      const mask = camera.layers.mask; camera.layers.set(UNDERWATER); // only the bed and what's in the water (layers.js)
      const c1 = renderer.info.render.calls, t1 = performance.now();
      const frozenNow = uniforms.uIce.value >= 0.55; let bgS = null, clS = null, caS = 1; // (all frozen: the sea bed is not drawn at all under the ice, only what is in the water (the boats, the submarines), against a dark blue-green: nothing for the jeep's shadow to fall on far below, and a cheaper pass)
      if (frozenNow) { hooks.before?.(); bgS = scene.background; scene.background = null; clS = renderer.getClearColor(clearColor).clone(); caS = renderer.getClearAlpha(); renderer.setClearColor(0x03151d, 1); }
      renderer.setRenderTarget(target); renderer.render(scene, camera);
      if (frozenNow) { hooks.after?.(); scene.background = bgS; renderer.setClearColor(clS, caS); }
      passCalls.refract += renderer.info.render.calls - c1; passTime.refract += performance.now() - t1; profile.mark('see-through view');
      camera.layers.mask = mask;
      }
      }
      renderer.setRenderTarget(output); // (the screen, or the antialiasing target: see msaa.js)
      mesh.visible = inView && !mesh.userData.hidden; // (no water on screen: don't draw the stage-wide plane at all, it would only discard every pixel)
      const t2 = performance.now();
      renderer.render(scene, camera);
      passTime.main += performance.now() - t2; profile.mark('main view');
    },
  };
}
