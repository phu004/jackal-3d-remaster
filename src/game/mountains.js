// The secret level's mountain range: a height field that climbs for good, with no flat top. Rising from the foot of the blocked cells ('X') the ground goes up in a snow skirt, then steepens into rock
// ridges and gullies that run down the slope and carry on rising (peaks and saddles along the range) out of sight past the map's edge. Visual only: the 'X' cells block like walls.
// Colour is per vertex, by steepness and noise: snow where it is gentle or sheltered (the gullies), rock where it is steep. Built in tiles so the ones off screen are skipped.
import * as THREE from 'three';
import { noise2 } from './cliffs.js';
import { BufferGeometryUtils } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { SNOW_GLSL, SNOW_TILT, SNOW_GROUND } from './snow-surface.js';
import { WAVE_TIME } from './surf-time.js';
import roadMapUrl from '../assets/textures/road-slush.png';
import roadNrmUrl from '../assets/textures/road-slush-normal.png';

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// area: { x0, x1, z0, z1 } m; isRock(x, z): inside the mountain's cells. opts: { height (peak height m), res (m per sample), seed, snow (0..1), rock: [r, g, b] }
// the beach's wash (the secret level's surf): each wave that the water draws arriving at the shore sends a film of water up the sand (a quick rush, a slow slide back), darkening it and leaving lace at its front; the same clock and wave phase as water.js
const SURF_FUNCS = `
float vn2( vec2 p ) { return mn( vec3( p, 0.5 ) ); }
float washRun() { // metres the wash has reached up the beach
  float t = uSurfT, warp = vn2( vMW.xz * 0.45 + vec2( t * 0.05, 0.0 ) );
  float arrive = fract( t * 0.2 + vn2( vMW.xz * 0.05 ) * 2.0 + warp * 0.6 );
  float swash = smoothstep( 0.0, 0.15, arrive ) * ( 1.0 - smoothstep( 0.15, 1.0, arrive ) );
  return 0.15 + 2.1 * swash;
}
float washEdge() { return vWd + ( vn2( vMW.xz * 1.7 ) - 0.5 ) * 0.7 + ( vn2( vMW.xz * 5.0 ) - 0.5 ) * 0.25; }
float washFilm() { return ( 1.0 - smoothstep( washRun() - 0.12, washRun(), washEdge() ) ) * vBeach; }
`;
const SURF_COLOR = `
	{ float film = washFilm(), e = washEdge(), run = washRun();
	  float lace = mn( vec3( vMW.xz * 6.0 + vec2( uSurfT * 0.3, 0.0 ), 1.5 ) ) * 0.6 + mn( vec3( vMW.xz * 15.0, 4.0 ) ) * 0.4;
	  float damp = ( 1.0 - smoothstep( 0.0, 2.6, vWd + ( vn2( vMW.xz * 1.1 ) - 0.5 ) * 1.2 ) ) * vBeach; // (damp sand lingers behind the wash)
	  diffuseColor.rgb *= 1.0 - 0.18 * damp - 0.3 * film;
	  diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.07, 0.09, 0.1 ), film * 0.25 ); // (a thin film of water)
	  float lead = smoothstep( run - 0.35, run - 0.08, e ) * ( 1.0 - smoothstep( run - 0.08, run + 0.04, e ) ) * vBeach; // (the front of the wash)
	  float behind = film * ( 1.0 - smoothstep( 0.0, 0.9, run - e ) );                                               // (lace just behind the front)
	  float foam = clamp( lead * smoothstep( 0.3, 0.6, lace ) * 1.1 + behind * 0.5 * smoothstep( 0.5, 0.75, lace ), 0.0, 1.0 );
	  diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.75, 0.78, 0.8 ), foam * 0.8 ); }`;

// the road: the photo of churned, dirty snow (tools/make_road_texture.py) laid along the path in the road's own coordinates (u across it, v along it): colour and relief both from the picture, tiled mirrored (no
// seams) at two scales and blended by noise so it doesn't repeat; the edges wander and fade into the snow.
const TRAIL_W = 2.5; // m, half the road's width
let ROAD_TEX = null;
function roadTextures() {
  if (ROAD_TEX) return ROAD_TEX;
  const loader = new THREE.TextureLoader(), mk = url => { const t = loader.load(url); t.wrapS = t.wrapT = THREE.MirroredRepeatWrapping; t.anisotropy = 8; return t; };
  return ROAD_TEX = { map: mk(roadMapUrl), nrm: mk(roadNrmUrl) };
}
const TRAIL_FUNCS = `
float rdN( vec2 p ) { return mn( vec3( p, 3.0 ) ); }
float roadW( float v ) { return ${TRAIL_W.toFixed(2)} * ( 0.9 + 0.2 * rdN( vec2( v * 0.05, 3.0 ) ) ); }
float roadEdge( float u, float v, vec2 p ) { return abs( u ) + ( rdN( vec2( v * 0.25, u * 0.4 ) ) - 0.5 ) * 0.9 + ( rdN( p * 3.0 ) - 0.5 ) * 0.3; } // (the distance from the road's middle, with its edges made to wander)
vec2 roadUV( float u, float v, float k, float off ) { return vec2( v / ( 8.4 * k ) + off, 0.62 - ( abs( u ) - 0.8 ) / ( 2.2 * k ) * 0.6 ); }
float trackMask( float e, float rw ) { return ( 1.0 - smoothstep( rw * 0.58, rw * 1.12, e ) ) * smoothstep( rw * 0.05, rw * 0.38, e ); } // (the two wheel tracks either side of a streak of untouched snow down the middle, fading into the snow at the outer edge)
// (the photo's bands run ALONG the road, laid across each track: brown in the middle of the track, greyer toward the edges)
`;
// The road, per layer: two functions written once (and called once for each of the layers), so the shader compiles about one fifth the code it did when each layer's code was repeated in place.
const ROAD_FNS = `
vec3 roadNrm( vec4 T0, vec2 W0, vec3 normal ) {
		if ( W0.x > 0.999 ) {
			float rw = roadW( T0.y ), mask = trackMask( roadEdge( T0.x, T0.y, vMW.xz ), rw ) * smoothstep( 0.0, 1.0, W0.y );
			if ( mask > 0.0 ) {
				vec3 tn = texture2D( uRoadNrm, roadUV( T0.x, T0.y, 1.0, 0.0 ) ).xyz * 2.0 - 1.0;
				vec2 tang = T0.zw, lat = sign( T0.x ) * vec2( - tang.y, tang.x );
				vec2 gw = - tn.y * lat - tn.x * tang;                                                   // (the picture's relief, laid on the road)
				vec3 tg2 = ( viewMatrix * vec4( gw.x, 0.0, gw.y, 0.0 ) ).xyz; tg2 -= normal * dot( tg2, normal );
				normal = normalize( normal - tg2 * 3.1 * mask );                                       // (deeper: the ruts' walls catch the light and shade more strongly)
			}
		}
	return normal;
}
vec3 roadCol( vec4 T0, vec2 W0, vec3 col ) {
	if ( W0.x > 0.999 ) {
		float rw = roadW( T0.y ), e = roadEdge( T0.x, T0.y, vMW.xz ), fade = smoothstep( 0.0, 1.0, W0.y ), mask = trackMask( e, rw ) * fade, fringe = ( 1.0 - smoothstep( rw * 0.85, rw * 1.9, e ) ) * smoothstep( rw * 0.1, rw * 0.45, e ) * fade;
		vec3 t1 = pow( texture2D( uRoadMap, roadUV( T0.x, T0.y, 1.0, 0.0 ) ).rgb, vec3( 2.2 ) ), t2 = pow( texture2D( uRoadMap, roadUV( T0.x, T0.y + 2.7, 1.5, 0.31 ) ).rgb, vec3( 2.2 ) );
		vec3 road = mix( t1, t2, smoothstep( 0.3, 0.7, rdN( vMW.xz * 0.2 ) ) );                                     // (two scales of the picture, blended by noise: no visible repeat)
		col = mix( col, col * 0.88, fringe * 0.35 );                         // (a faint dirty fringe round the road)
		col = mix( col, road * 0.95, mask * 0.92 );
		col *= 1.0 - 0.14 * mask;                                          // (the bottom of a rut is shaded: a little darker down in the track)
	}
	return col;
}
`;
const trailNormal = n => `normal = roadNrm( vTr${n}, vTw${n}, normal );
`;
const trailColor = n => `diffuseColor.rgb = roadCol( vTr${n}, vTw${n}, diffuseColor.rgb );
`;


// The tracks the jeep's wheels leave (ground-trail.js): the map's value (0 untouched .. 1 deep in a rut) presses the snow down (normals from its slope) and dirties it (a darker, greyer, slightly brown packed colour).
const GT_NORMAL = (size, flip, berm) => `
		{ vec2 tuv = vec2( ( vMW.x - uTrailBox.x ) * uTrailBox.z, ( uTrailBox.y - vMW.z ) * uTrailBox.w );
		  if ( uTrailOn > 0.5 && tuv.x > 0.0 && tuv.x < 1.0 && tuv.y > 0.0 && tuv.y < 1.0 ) {
		    vec2 tx = vec2( 1.8 / ${size}.0 ), mpp = 1.8 / ( vec2( uTrailBox.z, uTrailBox.w ) * ${size}.0 ); // (a wide step for the slope: smooth shoulders, not texel noise; and that step in metres)
		    vec2 tw = tx * 3.0, mpw = mpp * 3.0;                                                              // (a three times wider step, for the lip beside the groove)
		    vec2 gt = vec2( ( texture2D( uTrailMap, tuv + vec2( tx.x, 0.0 ) ).r - texture2D( uTrailMap, tuv - vec2( tx.x, 0.0 ) ).r ) / ( 2.0 * mpp.x ), - ( texture2D( uTrailMap, tuv + vec2( 0.0, tx.y ) ).r - texture2D( uTrailMap, tuv - vec2( 0.0, tx.y ) ).r ) / ( 2.0 * mpp.y ) );   // (the groove's slope, per metre east and per metre south)
		    vec2 gw = vec2( ( texture2D( uTrailMap, tuv + vec2( tw.x, 0.0 ) ).r - texture2D( uTrailMap, tuv - vec2( tw.x, 0.0 ) ).r ) / ( 2.0 * mpw.x ), - ( texture2D( uTrailMap, tuv + vec2( 0.0, tw.y ) ).r - texture2D( uTrailMap, tuv - vec2( 0.0, tw.y ) ).r ) / ( 2.0 * mpw.y ) ); // (and the slope of the same, blurred wide)
		    float vary = 0.75 + 0.25 * mn( vec3( vMW.xz * 0.9, 17.0 ) );                                      // (the track is deeper in some stretches)
		    // height = - 0.14 * groove + 0.03 * ( wide - 0.6 * groove ): a dent with a faint lip beside it, worked out from the groove itself: nothing is stamped for the lip, so no joint can leave a bump
		    vec2 gh = ( - ( 0.14 + 0.6 * ${berm.toFixed(3)} ) * gt + ${berm.toFixed(3)} * gw ) * vary * ${flip ? '-1.0' : '1.0'};
		    vec3 tgv = ( viewMatrix * vec4( gh.x, 0.0, gh.y, 0.0 ) ).xyz; tgv -= normal * dot( tgv, normal );
		    normal = normalize( normal - tgv * ( 1.0 - rockK ) * ( 1.0 - vBeach ) );
		  } }
`;
const GT_COLOR = (size, debug) => `
	{ vec2 tuv = vec2( ( vMW.x - uTrailBox.x ) * uTrailBox.z, ( uTrailBox.y - vMW.z ) * uTrailBox.w );
	  if ( uTrailOn > 0.5 && tuv.x > 0.0 && tuv.x < 1.0 && tuv.y > 0.0 && tuv.y < 1.0 ) {
	    vec2 e2 = vec2( 1.6 / ${size}.0 );                                                                                // (five taps: the map smoothed a touch, so no texel blockiness shows)
	    float tr = texture2D( uTrailMap, tuv ).r * 0.4 + 0.15 * ( texture2D( uTrailMap, tuv + vec2( e2.x, 0.0 ) ).r + texture2D( uTrailMap, tuv - vec2( e2.x, 0.0 ) ).r + texture2D( uTrailMap, tuv + vec2( 0.0, e2.y ) ).r + texture2D( uTrailMap, tuv - vec2( 0.0, e2.y ) ).r );
	    float snowK = ( 1.0 - rockness ) * ( 1.0 - vBeach ), k = smoothstep( 0.03, 0.85, tr ) * snowK;
	    float grit = smoothstep( 0.35, 0.8, mn( vec3( vMW.xz * 2.5, 11.0 ) ) );                                           // (low frequency, in metres: patches much bigger than a texel)
	    float vary = 0.75 + 0.25 * mn( vec3( vMW.xz * 0.9, 17.0 ) ), rr = smoothstep( 0.03, 0.85, tr ) * vary * snowK;
	    diffuseColor.rgb *= 1.0 - rr * 0.22;                                                                            // (darker in the groove)
	    diffuseColor.rgb = mix( diffuseColor.rgb, diffuseColor.rgb * vec3( 0.88, 0.93, 1.0 ), rr * 0.5 );               // (a faint cool tint, not a strong blue)
	    diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.26, 0.23, 0.2 ), smoothstep( 0.6, 0.98, tr ) * grit * snowK * 0.3 ); // (a little brown, only where it was pressed hardest)
${debug ? '	    diffuseColor.rgb = vec3( tr ); // (?gtdebug: the raw track map as the colour)' : ''}
	  } }
`;

export function buildMountains({ area, isRock, isWater = null, trails = [], groundTrail = null, ...o }) {
  const P = { height: 34, relief: 1, crag: 1, res: .6, seed: 11, snow: 1, rock: [.36, .33, .32], skirt: .3, reach: 20, rise: 3, plainReach: 110, shore: 70, shoreFrom: 3, // the open ground is part of this mesh: a gentle slope that rises `rise` m up to the foot of the mountain over `plainReach` m, and eases down to sea level over the `shore` m before the sea's strip (the last `shoreFrom` m, where the old flat ground is still drawn)
   beach: 5.2, // beach: m of dark sand along the water (the snow's edge wanders about this)
   apron: 12, // apron: m of snow drifts and talus piled against the foot, out over the open ground (rising to under half a metre at the rock, level with the ground at its outer edge)
    // reach: m of mountain built inward from the edge (the camera never sees further: nothing is built past it)
    ...o }, RES = P.res;
  const W = Math.ceil((area.x1 - area.x0) / RES) + 1, H = Math.ceil((area.z1 - area.z0) / RES) + 1;
  const n1 = noise2(P.seed), n2 = noise2(P.seed + 1), n3 = noise2(P.seed + 2), n4 = noise2(P.seed + 3);
  // distance (m) inward from the edge of the rock cells: a two-pass chamfer, then blurred so the cells' staircase becomes long smooth runs
  const INF = 1e9, d = new Float32Array(W * H), o2 = new Float32Array(W * H), AR = P.apron; // d: inward from the edge (0 off the mountain); o2: outward from it (0 on the mountain)
  const rockMask = new Uint8Array(W * H); // (the rock cells themselves, unblurred)
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) { const r = isRock(area.x0 + i * RES, area.z0 + j * RES); d[j * W + i] = r ? INF : 0; o2[j * W + i] = r ? 0 : INF; rockMask[j * W + i] = r ? 1 : 0; }
  const D1 = RES, D2 = RES * 1.4142;
  const chamfer = d => { // (distance to the nearest 0 cell: two passes)
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) { const k = j * W + i; let v = d[k]; if (!v) continue; if (i) v = Math.min(v, d[k - 1] + D1); if (j) v = Math.min(v, d[k - W] + D1); if (i && j) v = Math.min(v, d[k - W - 1] + D2); if (i < W - 1 && j) v = Math.min(v, d[k - W + 1] + D2); d[k] = v; }
    for (let j = H - 1; j >= 0; j--) for (let i = W - 1; i >= 0; i--) { const k = j * W + i; let v = d[k]; if (!v) continue; if (i < W - 1) v = Math.min(v, d[k + 1] + D1); if (j < H - 1) v = Math.min(v, d[k + W] + D1); if (i < W - 1 && j < H - 1) v = Math.min(v, d[k + W + 1] + D2); if (i && j < H - 1) v = Math.min(v, d[k + W - 1] + D2); d[k] = v; }
  };
  const wdist = new Float32Array(W * H); // m from the sea (0 in it)
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) wdist[j * W + i] = isWater && isWater(area.x0 + i * RES, area.z0 + j * RES) ? 0 : INF;
  chamfer(d); chamfer(o2); if (isWater) chamfer(wdist);
  const blur = (src, r) => { const t = new Float32Array(src.length), o = new Float32Array(src.length), c = 2 * r + 1;
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) { let s = 0; for (let a = -r; a <= r; a++) s += src[j * W + Math.min(W - 1, Math.max(0, i + a))]; t[j * W + i] = s / c; }
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) { let s = 0; for (let a = -r; a <= r; a++) s += t[Math.min(H - 1, Math.max(0, j + a)) * W + i]; o[j * W + i] = s / c; } return o; };
  const dist = blur(blur(d, Math.round(1.2 / RES)), Math.round(1.2 / RES)), out = blur(blur(o2, Math.round(1.2 / RES)), Math.round(1.2 / RES)), wd = isWater ? blur(blur(wdist, Math.round(1.2 / RES)), Math.round(1.2 / RES)) : wdist;
  // the height field
  const apron = new Float32Array(W * H), hgt = new Float32Array(W * H), crev = new Float32Array(W * H).fill(1); // crev: 0 in the crevices, 1 on the crests (darkens the rock in the gullies)
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const k = j * W + i, x = area.x0 + i * RES, z = area.z0 + j * RES; let dd = dist[k];
    const oo = out[k], apr = oo < AR ? .5 * (.55 + .9 * n1(x / 7 + 40, z / 7)) * Math.pow(1 - smooth(0, AR, oo), 1.6) * (1 + .22 * Math.sin(oo * 1.1 + n2(x / 5, z / 5) * 6)) + (n3(x / 2, z / 2) - .5) * .1 * (1 - smooth(0, AR, oo)) : 0; // the apron's height here: drifts that fade out into the open ground
    apron[k] = apr;
    const shore = isWater ? smooth(P.shoreFrom, P.shoreFrom + P.shore, wd[k]) : 1, plain = P.rise * (1 - smooth(0, P.plainReach, oo)) * shore; // the gentle slope of the open ground (it dips under the sea-side ground, which is still drawn there, so the two never cross in a tangle of lines)
    if (dd <= 0) { hgt[k] = plain + Math.max(0, apr); continue; }
    dd += (n1(x / 14, z / 14) - .5) * 3.2 + (n2(x / 5, z / 5) - .5) * 1.1; dd = Math.max(0, dd);
    const peak = P.height * (.55 + .75 * smooth(.2, .8, n3(z / 70, 3)) + .25 * (n3(z / 23, 9) - .5)); // the ridge line: peaks and saddles along the range
    const body = smooth(2, 36, dd), reach = 1 - Math.exp(-dd / 30);
    // gullies and buttresses run straight down the slope (the noise is stretched along x): ridged, so the crests are sharp
    const wx = (n1(x / 9, z / 9) - .5) * 7, wz = (n2(x / 9 + 7, z / 9) - .5) * 7, rg = v => 1 - Math.abs(v * 2 - 1); // (the noise is warped, so the buttresses bend and branch; stretched along the slope, so they run straight down it)
    const rid = rg(n4((dd + wx) / 16 + 20, (z + wz) / 6.5)), rid2 = rg(n2((dd + wx) / 6.5 + 5, (z + wz) / 2.8)), rid3 = rg(n1(dd / 2.6 + 9, z / 1.15)), rid4 = rg(n3(dd / 1.2 + 3, z / .5));
    const crag = (rid * rid * .62 + rid2 * rid2 * .3 + rid3 * rid3 * .1) * (7 + 30 * body) + rid4 * rid4 * .35 * smooth(3, 14, dd); crev[k] = Math.min(1, (rid * .55 + rid2 * .45) * 1.25);
    hgt[k] = plain + P.relief * (P.skirt * Math.min(dd, 9) + peak * Math.pow(body, 1.25) * .8 + 22 * reach + P.crag * (crag * smooth(1.5, 12, dd) + (n3(x / 3, z / 3) - .5) * 1.2 * body)) + apron[k] * (1 - smooth(0, 6, dd)); // (P.relief scales the whole mountain's height above the open ground, so its slopes: 1 as built; .4 gives about half the slope angle) // (the drifts run on up the foot of the mountain, so no seam at the cliff line) // (the climb keeps on past the peak line: no flat top)
  }
  // The summit road: a road cut into the mountain that switches back up it to a plateau (P.summit: { pts (dense, world m), length, halfW, plateau: {x,z,r}, h0, h1 }). The tiles along it were opened by the generator (so the jeep can drive it);
  // here the ground is made to match: along the road the surface is the road's own height, climbing from h0 to h1 (the last stretch and the plateau flat); beside it the ground goes up in a cliff wall to the height of the road's highest
  // part within reach plus a few metres (so the ridge between two legs stands above the upper one), and fades back into the mountain's own height beyond. Everything near the road is drawn as rock (the walls are steep).
  const SM = P.summit, summitBoost = new Float32Array(W * H), dnA = new Float32Array(W * H);
  for (const SM of [P.summit, P.summit2]) if (SM) { // (a second ascent, summit2, is shaped the same way: its own road and plateau; where its box meets the first one's, the ground takes the higher of the two)
    const pts = SM.pts, cum = [0]; for (let a = 1; a < pts.length; a++) cum.push(cum[a - 1] + Math.hypot(pts[a][0] - pts[a - 1][0], pts[a][1] - pts[a - 1][1]));
    const S0 = (() => { const i = pts.findIndex(q => q[0] <= (SM.climbX ?? 1e9) && q[1] <= (SM.climbZ ?? 1e9)); return i > 0 ? cum[i] : 0; })(); // (the climb starts where the road reaches x = climbX: before that it runs on the plain, with the main road)
    const LEN = cum[cum.length - 1], hw = SM.halfW, pl = SM.plateau, plAxis = (x, z) => Math.hypot(x - Math.min(Math.max(x, pl.x2 ?? pl.x), pl.x), z - Math.min(Math.max(z, pl.z), pl.z2 ?? pl.z)),  LR = (() => { const i = pts.findIndex(q => plAxis(q[0], q[1]) <= pl.r); return Math.max(S0 + 10, (i > 0 ? cum[i] : LEN) - 3); })(), // (the road reaches the plateau's own height 3 m before it enters the plateau, and runs level from there)
      roadH = sv => { const t = Math.min(1, Math.max(0, sv - S0) / (LR - S0)), e = Math.pow(t, 1.6), c = t * t * (3 - 2 * t); return SM.h0 + (SM.h1 - SM.h0) * (e + (c - e) * smooth(.55, 1, t)); }; // (easy at the start, and easing out at the top: the grade falls to nothing as it meets the plateau) // (a long, easy start: level at the opening, where it meets the sea-level ground, the grade rising smoothly along the climb: about 3 degrees 10 m in, 9 at 50 m, and 26 at the top)
    const bx0 = Math.min(...pts.map(q => q[0]), (pl.x2 ?? pl.x) - pl.r) - 40, bx1 = Math.max(...pts.map(q => q[0]), pl.x + pl.r) + 40, bz0 = Math.min(...pts.map(q => q[1]), pl.z - pl.r) - 40, bz1 = Math.max(...pts.map(q => q[1]), (pl.z2 ?? pl.z) + pl.r) + 40;
    const mass = new Float32Array(W * H); for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) { const x = area.x0 + i * RES, z = area.z0 + j * RES; if (x < bx0 || x > bx1 || z < bz0 || z > bz1) continue; mass[j * W + i] = (dist[j * W + i] > 0 || plAxis(x, z) < pl.r + .5) ? 1 : 0; }
    // SM.slope: the mountain is one steady hillside rising to the plateau (its height by z is the road's own average height at that z), and the road is a shelf cut across it: no walls, the ground beside the road stays on the slope, a short cut or bank down to the road.
    let slopeZ = null; const so = Float32Array.from(hgt), dnS = new Float32Array(W * H), snS = new Float32Array(W * H), roadS = new Float32Array(W * H), done = new Uint8Array(W * H); // (slope mode works in two passes: the ground beside the road first, smoothed, then the road cut into it)
    if (SM.slope) {
      const zs = pts.map(q => q[1]), zMin = Math.min(...zs), zMax = Math.max(...zs), nb = Math.ceil(zMax - zMin) + 1, sum = new Float32Array(nb), cnt = new Float32Array(nb);
      pts.forEach((q, a) => { const b = Math.round(q[1] - zMin); sum[b] += roadH(cum[a]); cnt[b]++; });
      let arr = Array.from(sum, (v, i) => cnt[i] ? v / cnt[i] : NaN);
      for (let i = 0; i < nb; i++) if (Number.isNaN(arr[i])) { let a = i - 1, b = i + 1; while (a >= 0 && Number.isNaN(arr[a])) a--; while (b < nb && Number.isNaN(arr[b])) b++; arr[i] = a < 0 ? arr[b] : b >= nb ? arr[a] : arr[a] + (arr[b] - arr[a]) * (i - a) / (b - a); }
      for (let pass = 0; pass < 4; pass++) arr = arr.map((_, i) => { let t = 0, c = 0; for (let d = -4; d <= 4; d++) { const q = Math.min(nb - 1, Math.max(0, i + d)); t += arr[q]; c++; } return t / c; });
      slopeZ = z => { const f = z - zMin; if (f <= 0) return SM.h1; if (f >= nb - 1) return arr[nb - 1]; const i = Math.floor(f); return arr[i] + (arr[i + 1] - arr[i]) * (f - i); };
    }
    const massB = blur(blur(mass, Math.round(1.2 / RES)), Math.round(1.2 / RES)); // (the mountain mass, blurred: the cliff walls rise only where there is rock, fading out at its edge)
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) { // (the mountain mass: the rock cells that are left, and the opened tiles of the road: it carries the cliff walls)
      const x = area.x0 + i * RES, z = area.z0 + j * RES; if (x < bx0 || x > bx1 || z < bz0 || z > bz1) continue;
      let dn = 1e9, sn = 0, wall = -1e9;
      const FALL = SM.fall ?? .55, ridge = (h, d) => h - FALL * Math.max(0, d - hw - 1); // (the road runs along the crest of a spur: the ground beside it drops away at about 30 degrees, so the summit is the highest point and nothing rises above the road; the mountain's own height shows wherever it is higher than that)
      for (let a = 0; a + 1 < pts.length; a += 1) {
        const x0 = pts[a][0], z0 = pts[a][1], dx = pts[a + 1][0] - x0, dz = pts[a + 1][1] - z0, l2 = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((x - x0) * dx + (z - z0) * dz) / l2)), d = Math.hypot(x - x0 - dx * t, z - z0 - dz * t), sv = cum[a] + t * Math.sqrt(l2);
        if (d < dn) { dn = d; sn = sv; } const tt = ridge(roadH(sv), d); if (tt > wall) wall = tt;
      }
      const edgeOff = slopeZ ? Math.min(3.6, Math.max(0, (n1(x / 11 + 5, z / 11) - .35) * 7 + (n2(x / 4.5 + 9, z / 4.5) - .5) * 2.6)) : 0, /* (slope mode: the plateau's outline is not a clean capsule: lobes and bays, up to 3.6 m, so the edge is irregular, and its tiles are opened that far) */ dpl = Math.max(0, plAxis(x, z) - pl.r - edgeOff); if (dpl < dn) { dn = dpl; sn = LEN; } wall = Math.max(wall, ridge(SM.h1, dpl));
      const k = j * W + i, nz = ((n1(x / 5 + 90, z / 5) - .5) * 1.6 + (n2(x / 2.2 + 30, z / 2.2) - .5) * .6) * smooth(30, 80, sn), outside = slopeZ ? hgt[k] + (Math.max(slopeZ(z) * (isWater ? smooth(0, 34, wd[k]) : 1) * Math.max(smooth(0, 16, Math.max(dist[k], 16 * (1 - smooth(hw, hw + 10, dn)))), 1 - smooth(-112, -100, x)) + nz * .6 * smooth(hw + 4, hw + 10, dn), (roadH(sn) - .25 * Math.max(0, dn - hw - 2)) * (isWater ? smooth(0, 34, wd[k]) : 1)) - hgt[k]) * (isWater ? smooth(1, 30, wd[k]) : 1) : // (near the sea the mountain's own natural ground stands, the shore the old coast has; the hillside's slope comes in over the 30 m inland)
       // (slope mode: never lower than the gentle fall (SM.fall) from the highest road in reach: a max of smooth cones, so no steps, so no ditch or sheer drop is left beside it; the west is full height out to the map's edge; and the ground dips a little below the water's level over the last few metres before the sea, so the shoreline is where that smooth slope meets the water, not the stair-stepped edge of the sea's tiles)
       SM.cap ? hgt[k] + (Math.min(hgt[k], Math.max(wall, .3) + 1 + nz * smooth(hw, hw + 5, dn)) - hgt[k]) * (1 - smooth(hw + 14, hw + 32, dn)) : hgt[k] + Math.max(0, wall + nz * smooth(hw, hw + 5, dn) - hgt[k]) * massB[k], // (cap: the mountain's own height beside the road is cut down to the road's wall, so the surface beside the road stays near the road's level and the road shows; the full height returns further out)
       road = roadH(sn) + (n3(x / 1.1, z / 1.1) - .5) * .06;
      if (SM !== P.summit && dnA[k] && dnA[k] < dn) continue; // (nearer the first summit's road: its shaping stands)
      if (slopeZ) { const wS = 1 - smooth(-280, -252, z); if (wS <= 0) continue; /* (slope mode only from the foot of the climb northward: the corridor and the coast south of it keep the ground they had) */ const crag = sn >= LEN - .5 ? ((n3(x / 2.6 + 4, z / 2.6) - .5) * 3.4 + (n1(x / 1.3, z / 1.3 + 8) - .5) * 1.1 + (n2(x / .7 + 2, z / .7) - .5) * .35) * smooth(hw + .5, hw + 3, dn) * (1 - smooth(hw + 9, hw + 15, dn)) : 0; /* (the plateau's rim: broken, rocky ground on its slopes, in two sizes of lumps and a fine grit) */ const rim = sn >= LEN - .5 && dn > 0 ? ((n1(x / 8 + 1, z / 8) - .4) * 2.4 + (n2(x / 3.6 + 3, z / 3.6) - .5) * .8) * smooth(.15, 1.6, dn) * (1 - smooth(3.5, 9, dn)) : 0; // (the plateau's rim: height variation only on the edge side, beyond the flat top: humps and dips of gentle slope, so the top stays level and nothing on it is blocked)
        so[k] = hgt[k] + (outside + crag - hgt[k]) * wS; dnS[k] = dn; snS[k] = sn; roadS[k] = road + rim; done[k] = 1; continue; }
      hgt[k] = outside + (road - outside) * (1 - smooth(hw - .3, hw + .9, dn)) * smooth(6, 22, sn); // the road itself at its own height, the walls beside it (the first 20 m, running with the main road on the plain, keep the plain's own height)
      dnA[k] = dn; summitBoost[k] = 7 * smooth(hw + .3, hw + 2.5, dn) * (1 - smooth(hw + 9, hw + 22, dn));
    }
    if (slopeZ) { // the ground beside the road, blurred over a few metres (no steps where the nearest leg changes), and the road shelf cut into it with a short bank
      const r4 = Math.round(4 / RES), sm = blur(blur(so, r4), r4);
      for (let k = 0; k < W * H; k++) { if (!done[k]) continue; const dn = dnS[k], sn = snS[k]; hgt[k] = sm[k] + (roadS[k] - sm[k]) * (1 - smooth(hw - .3, hw + 3.8, dn)) * smooth(6, 22, sn); dnA[k] = dn; summitBoost[k] = 7 * smooth(hw + .3, hw + 2.5, dn) * (1 - smooth(hw + 9, hw + 22, dn)); }
    }
  }
  if (SM && SM.backHeight) { // west of the summit the ground goes on up into a tall rock face, out past the map's edge so the player never sees beyond it: the ridge that falls away from the plateau on its other sides (h1 - 0.55 per metre from its edge) climbs here by backHeight m over backRun m (an S-curve, steepest in the middle: about 50 degrees), with no step anywhere. It is drawn as rock.
    const pl = SM.plateau, wx0 = (pl.x2 ?? pl.x) - pl.r, pa = (x, z) => Math.hypot(x - Math.min(Math.max(x, pl.x2 ?? pl.x), pl.x), z - Math.min(Math.max(z, pl.z), pl.z2 ?? pl.z));
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      const x = area.x0 + i * RES, z = area.z0 + j * RES; if (x >= wx0) continue;
      const k = j * W + i, g = SM.backHeight * smooth(0, SM.backRun, wx0 - x), T = SM.h1 - .55 * Math.max(0, Math.hypot(pl.r, z - Math.min(Math.max(z, pl.z), pl.z2 ?? pl.z)) - pl.r) + g; // (west of the plateau the fall-away depends on how far north or south of it a point is, not on how far west: the ground does not dip before the rock face begins)
      if (T > hgt[k]) { hgt[k] = T; summitBoost[k] = Math.max(summitBoost[k], 7 * smooth(.04, .25, g / SM.backHeight) * (1 - smooth(.1, 1, Math.abs(z - (pl.z + (pl.z2 ?? pl.z)) / 2) / 70))); }
    }
  }
  // The cliff by the main road (P.folds: { x0, x1, z0, z1 }), cut after the summit's own shaping (which would otherwise smooth it away): the wall is notched, columns of rock with gullies cut deep westward into it (each gully takes its height from further east, so the cliff's outline steps in), the columns fluted and
  // terraced into shelves and risers; the gullies are shaded dark. Kept clear of the road itself.
  if (P.folds && P.flutes !== 0) {
    const B = P.folds, src = Float32Array.from(hgt), hs = (xx, zz) => { const fi = Math.min(W - 1.001, Math.max(0, (xx - area.x0) / RES)), fj = Math.min(H - 1.001, Math.max(0, (zz - area.z0) / RES)), i0 = Math.floor(fi), j0 = Math.floor(fj), tx = fi - i0, tz = fj - j0, q = j0 * W + i0; return (src[q] * (1 - tx) + src[q + 1] * tx) * (1 - tz) + (src[q + W] * (1 - tx) + src[q + W + 1] * tx) * tz; };
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      const k = j * W + i, x = area.x0 + i * RES, z = area.z0 + j * RES;
      const bm = smooth(B.x0 - 1.8, B.x0, x) * (1 - smooth(B.x1, B.x1 + 1.8, x)) * smooth(B.z0 - 8, B.z0, z) * (1 - smooth(B.z1, B.z1 + 8, z)) * (SM ? smooth(SM.halfW + 3, SM.halfW + 11, dnA[k]) : 1) * smooth(3, 7, hgt[k]); if (bm <= 0) continue;
      const zz = z / 7.5 + (n2(x / 9 + 30, z / 9) - .5) * 2.4 + (n1(x / 14 + 3, z / 12) - .5) * 1.5, v = Math.abs(Math.cos(Math.PI * zz)), v2 = Math.abs(Math.cos(Math.PI * (zz * 2.3 + .37 + (n3(x / 6 + 11, z / 6) - .5) * 1.4))), fl = v * .74 + v2 * .26, t = Math.min(1, Math.max(0, (fl - .02) / .85)), fsh = t * t * (3 - 2 * t);
      let h = hs(x + (1 - fsh) * (P.foldsNotch ?? 1.2) * bm * (.7 + .6 * n3(x / 15 + 60, z / 15)), z); // (the gully: the ground as it is further east)
      h -= (1 - fsh) * .3 * (P.flutes ?? 1) * bm;
      if (P.terrace !== 0) { const S = 1.7, lv = h / S + (n2(x / 6 + 2, z / 6) - .5) * 1.7 + (n1(x / 2.2, z / 2.2) - .5) * .55 + (n3(x / .8 + 5, z / .8) - .5) * .18, fr = lv - Math.floor(lv); h += (Math.floor(lv) + smooth(.45, .9, fr) - lv) * S * (P.terrace ?? .45) * bm * smooth(.1, .4, n3(x / 20 + 7, z / 20 + 3)); }
      hgt[k] = h; crev[k] = Math.min(crev[k], .35 + .65 * Math.min(1, fsh * 1.25 + (1 - bm)));
    }
  }
  // vehicle trails: polylines in world metres. The first (the main road) and all the others (branches) are worked out as two separate layers, each with its own distance across the road (u), distance along it (v), direction and
  // fade, and each is drawn on its own in the fragment shader: where a branch runs into the main road both sets of tracks show, overlapping, as on a real junction, instead of one of them cutting the other off.
  const REACH = 5.6;
  const trailField = (list, scale = 1) => { // scale: a narrower road (< 1): its distance across is stretched, so its width and its picture shrink together
    const f = { u: new Float32Array(W * H), tw: new Float32Array(W * H), fade: new Float32Array(W * H), dx: new Float32Array(W * H), dz: new Float32Array(W * H), v: new Float32Array(W * H) }, nd = new Float32Array(W * H).fill(1e9);
    const seen = []; // (the vertices of the paths already done, with their distance along: an arm that leaves from one of them carries on counting from there, so where two arms share a stretch they agree on v and the picture doesn't tear)
    for (const pts of list) {
      const dirs = pts.slice(1).map((q, a) => { const l = Math.hypot(q[0] - pts[a][0], q[1] - pts[a][1]) || 1; return [(q[0] - pts[a][0]) / l, (q[1] - pts[a][1]) / l]; }), cum = [0];
      { let best = null, bd = 3; for (const q of seen) { const dd = Math.hypot(q.x - pts[0][0], q.z - pts[0][1]); if (dd < bd) { bd = dd; best = q; } } if (best) cum[0] = best.v; }
      for (let a = 1; a < pts.length; a++) cum.push(cum[a - 1] + Math.hypot(pts[a][0] - pts[a - 1][0], pts[a][1] - pts[a - 1][1]));
      pts.forEach((q, a) => seen.push({ x: q[0], z: q[1], v: cum[a] }));
      for (let a = 0; a + 1 < pts.length; a++) {
        const [x0, z0] = pts[a], [x1, z1] = pts[a + 1], dx = x1 - x0, dz = z1 - z0, len2 = dx * dx + dz * dz || 1, len = Math.sqrt(len2);
        const i0 = Math.max(0, Math.floor((Math.min(x0, x1) - REACH - area.x0) / RES)), i1 = Math.min(W - 1, Math.ceil((Math.max(x0, x1) + REACH - area.x0) / RES));
        const j0 = Math.max(0, Math.floor((Math.min(z0, z1) - REACH - area.z0) / RES)), j1 = Math.min(H - 1, Math.ceil((Math.max(z0, z1) + REACH - area.z0) / RES));
        for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
          const x = area.x0 + i * RES, z = area.z0 + j * RES, t = Math.max(0, Math.min(1, ((x - x0) * dx + (z - z0) * dz) / len2)), d = Math.hypot(x - (x0 + dx * t), z - (z0 + dz * t)), k = j * W + i;
          if (d >= nd[k]) continue;
          let ux = dirs[a][0], uz = dirs[a][1]; // (past the end of a segment the direction is the mean of the two meeting there: both then agree which side of the road a point is on)
          if (t <= 0 && a > 0) { ux += dirs[a - 1][0]; uz += dirs[a - 1][1]; } else if (t >= 1 && a + 1 < dirs.length) { ux += dirs[a + 1][0]; uz += dirs[a + 1][1]; }
          const ul = Math.hypot(ux, uz) || 1; ux /= ul; uz /= ul;
          const side = (x - x0) * uz - (z - z0) * ux < 0 ? -1 : 1, fd = (pts[a][2] ?? 1) + ((pts[a + 1][2] ?? 1) - (pts[a][2] ?? 1)) * t; // (fd: how strong the road is here, 1 full to 0 faded into the snow: a point's third number)
          const wp = (pts[a][3] ?? 1) + ((pts[a + 1][3] ?? 1) - (pts[a][3] ?? 1)) * t; // (a point's fourth number: how wide the road is there, 1 the usual, less than 1 narrower: the second ascent's tracks narrow at its tight turns)
          nd[k] = d; f.u[k] = side * Math.min(d / (scale * wp), 12); f.tw[k] = 1; f.fade[k] = fd; f.dx[k] = ux; f.dz[k] = uz; f.v[k] = cum[a] + t * len;
        }
      }
    }
    for (let k = 0; k < W * H; k++) if (rockMask[k] || (isWater && wd[k] < 5)) { f.u[k] = 0; f.tw[k] = 0; f.fade[k] = 0; } // (no trail in the rock or down at the water: the rock cells themselves, not the blurred distance, whose soft edge reached into a narrow road and broke its tracks into dashes)
    return f;
  };
  const NS = 5, layerOf = i => i < 3 ? i : 3 + ((i - 3) % 2), sets = Array.from({ length: NS }, (_, n) => trailField(trails.filter((_, i) => layerOf(i) === n), n >= 3 ? .85 : 1)); // (the first three paths each have a layer of their own; the others share the last two, alternately: two roads that run into one another must not share a layer, or the seam where their nearest path changes shows as a thin zigzag line) // (up to five layers: each of the first four paths on its own, and any others together)
  // normals by finite differences, colour by steepness  // normals by finite differences, colour by steepness
  const RK = P.relief < 1 ? Math.pow(P.relief, 1.5) * 1.45 : 1; // (the rock shows where the ground is steep: with the slopes scaled down by `relief` the steepness that counts as rock scales down with them, and a little more)
  const beachA = new Float32Array(W * H), nrm = new Float32Array(W * H * 3), col = new Float32Array(W * H * 3), rock = P.rock, snow = P.snow, GROUND = SNOW_GROUND;
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const k = j * W + i, hx = hgt[j * W + Math.min(W - 1, i + 1)] - hgt[j * W + Math.max(0, i - 1)], hz = hgt[Math.min(H - 1, j + 1) * W + i] - hgt[Math.max(0, j - 1) * W + i];
    let nx = -hx / (2 * RES), nz = -hz / (2 * RES); const l = Math.hypot(nx, 1, nz); nx /= l; nz /= l; const ny = 1 / l;
    nrm[k * 3] = nx; nrm[k * 3 + 1] = ny; nrm[k * 3 + 2] = nz;
    const x = area.x0 + i * RES, z = area.z0 + j * RES, steep = 1 - ny, nn = (n1(x / 2.4, z / 2.4) - .5) * .22 + (n2(x / .8, z / .8) - .5) * .1 + (n3(x / 9, z / 9) - .5) * .18;
    let r = smooth(.3, .52, (steep + nn - .12 * snow - .22 * (1 - crev[k]) * snow) / RK) * smooth(.15, 3.2, hgt[k]) * smooth(.6, 7, dist[k] + summitBoost[k]); // 1 = bare rock (it fades in over the first few metres up from the foot: no cut-off line where rock meets snow)
    if (dist[k] <= 0 && out[k] < AR) r = smooth(.62, .78, n1(x / 1.3 + 5, z / 1.3) * .6 + n3(x / 4, z / 4) * .4) * (1 - smooth(1.5, 7, out[k])) * .85; // (scree: loose rock lying in the snow at the foot, thinning out away from it)
    if (P.rockBand && dist[k] > 0) { // (colour only: more bare rock in a band of the slope, x between rockBand.x0 and x1 and z between z0 and z1, in streaks and ribs running down the fall line (the noise is stretched along it) with snow between; the shape of the ground is not touched)
      const B = P.rockBand, band = smooth(B.x0 - 1.8, B.x0, x) * (1 - smooth(B.x1, B.x1 + 1.8, x)) * smooth(B.z0 - 8, B.z0, z) * (1 - smooth(B.z1, B.z1 + 8, z));
      if (band > 0) { // rock in layers that follow the contours (strata: ledges of bare rock across the slope, wavy and broken up, with snow lying between them), as on the south-west cliffs
        const lv = hgt[k] / 2.6 + (n2(x / 5 + 2, z / 5) - .5) * 1.5 + (n1(x / 1.7, z / 1.7) - .5) * .7 + (n3(x / .7 + 5, z / .7) - .5) * .25, fr = lv - Math.floor(lv), layer = smooth(0, .18, fr) * (1 - smooth(.42, .7, fr)); // (thicker ledges with ragged, soft edges)
        const broken = smooth(.22, .5, n3(x / 4.2 + 4, z / 4.2) * .6 + n1(x / 1.5, z / 1.5) * .4), lv2 = hgt[k] / 7 + (n3(x / 8 + 9, z / 8) - .5) * 1.2, fr2 = lv2 - Math.floor(lv2), big = smooth(0, .15, fr2) * (1 - smooth(.3, .55, fr2)) * smooth(.3, .55, n2(x / 4 + 20, z / 4)); // (and broader ledges)
        const ledge = Math.max(layer * broken, big), rr = B.amount * ledge * band * smooth(.008, .05, steep) * smooth(3.5, 7, hgt[k]);
        r = Math.max(r, rr); crev[k] = Math.min(crev[k], 1 - .55 * rr * (1 - smooth(0, .4, fr))); // (each ledge is darker at its foot and lighter on its lip: a hint of relief)
      }
    }
    const tone = .8 + .5 * n2(x / 1.7 + 4, z / 1.7), warm = n3(x / 6 + 8, z / 6); // (rock: grey-brown, rust in patches, strata streaks down the slope)
    const rc = [rock[0] * tone * (1 + .13 * warm), rock[1] * tone * (1 + .07 * warm), rock[2] * tone * (1 - .08 * warm)], snT = 0, /* the snow is the apron's colour all the way: the open slope has the same look as the foot */ sn = [(.59 + (GROUND[0] - .59) * snT) * (.96 + .04 * ny), (.6 + (GROUND[1] - .6) * snT) * (.97 + .03 * ny), .62 + (GROUND[2] - .62) * snT]; // (the snow's colour: exactly the ground's where the apron ends, a touch greyer up the slope)
    const hh = (a, b) => hgt[Math.min(H - 1, Math.max(0, j + b)) * W + Math.min(W - 1, Math.max(0, i + a))], cav = (hh(-3, 0) + hh(3, 0) + hh(0, -3) + hh(0, 3)) / 4 - hgt[k]; // (cav: how far the ground lies below its surroundings here: grooves and hollows)
    const dark = (1 - r * (1 - (.32 + .85 * crev[k]))) * (1 - r * .6 * smooth(.1, 1.1, cav)); // (the grooves and crevices of the rock: deep shade) // (deep gullies in the rock: dark)
    // the shore: the snow ends in a ragged edge and below it lies dark, wet sand and stones down to the water (the shader treats a dark colour as rock, so it gets the rock's grain and crevices)
    let beach = 0, bc = null;
    if (isWater && wd[k] < 9) {
      const edge = P.beach + (n1(x / 7 + 70, z / 7 + 11) - .5) * 5 + (n3(x / 3 + 40, z / 3) - .5) * 1.6 + (n2(x / 1.7 + 9, z / 1.7) - .5) * 1.8 + (n3(x / .6 + 30, z / .6) - .5) * .5; // (where the snow stops: wanders about the beach's width, ragged at the fringe)
      const wj = wd[k] + (n3(x / .9 + 50, z / .9) - .5) * 1.7 + (n2(x / 3.2 + 60, z / 3.2) - .5) * 1.5 + (n1(x / 1.3 + 8, z / 1.3 + 20) - .5) * .8; // (the distance jittered at three scales: patches of snow lie out on the sand and dark sand shows through in the snow, so the change is gradual, not a line)
      beach = Math.max(1 - smooth(edge - 1.7, edge + 1.2, wj), 1 - smooth(.5, 1.8, wd[k])); // (the last metre or two at the water is always dark sand: where the wandering edge came in under that, bare white snow was left lying right at the waterline)
      const wet0 = w => .75 + .25 * smooth(0, 1.5, w), sand = .75 + .5 * n2(x / .9 + 4, z / .9), stone = smooth(.55, .8, n3(x / 2.2 + 5, z / 2.2)); // (darker toward the water; dark stones among the sand)
      beach *= 1 - .9 * smooth(.5, .68, n1(x / 3.4 + 120, z / 3.4) * .6 + n2(x / 1.2 + 30, z / 1.2) * .4) * smooth(.9, 3.0, wd[k]); // (patches of snow lying on the dark sand, ragged at the edges and kept off the last metre or so by the water)
      const dry = smooth(0, 4.5, wd[k]), grain = .85 + .3 * n3(x / .35 + 20, z / .35); // (wet sand is a dark warm brown right at the water, a paler tan up the beach; a few stones lie in it)
      bc = [(.075 + .075 * dry - .035 * stone) * sand * grain * wet0(wd[k]), (.066 + .066 * dry - .032 * stone) * sand * grain * wet0(wd[k]), (.058 + .054 * dry - .028 * stone) * sand * grain * wet0(wd[k])]; // (dark, soaked, and not far from grey: the sand of a cold shore)
    }
    beachA[k] = beach;
    for (let c = 0; c < 3; c++) { const base = (sn[c] + (rc[c] - sn[c]) * r) * dark; col[k * 3 + c] = bc ? base + (bc[c] - base) * beach : base; }
    if (P.debug) { const t = dist[k] > 0 ? [.1, .8, .1] : out[k] < AR ? [.9, .8, .1] : wd[k] < P.shore ? [.8, .1, .8] : [.1, .3, .95]; for (let c = 0; c < 3; c++) col[k * 3 + c] = t[c]; } // (?snowdbg: each region in a solid colour: rock/slope green, the foot's apron yellow, the open slope blue, the sea-side strip magenta)
  }
  const fogU = { uFogY: { value: 0 }, uFogK: { value: 0 } }; // the summit's mist (main.js sets these): the ground well below the jeep's height fades into it
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, envMapIntensity: .3 }); // (the ground's own roughness and reflection, so the apron and the open ground light up alike)
  mat.onBeforeCompile = sh => { // fine detail the vertices (0.5 m apart) can't carry: grain and cracks in the rock, a crust and sparkle on the snow, all from the world position
    sh.uniforms.uFogY = fogU.uFogY; sh.uniforms.uFogK = fogU.uFogK;
    if (groundTrail) { sh.uniforms.uTrailMap = groundTrail.uMap; sh.uniforms.uTrailOn = groundTrail.uOn; sh.uniforms.uTrailBox = { value: groundTrail.box }; }
    sh.uniforms.uSurfT = WAVE_TIME; { const rt = roadTextures(); sh.uniforms.uRoadMap = { value: rt.map }; sh.uniforms.uRoadNrm = { value: rt.nrm }; }
    const decl = Array.from({ length: NS }, (_, n) => `attribute vec4 aTr${n + 1};
attribute vec2 aTw${n + 1};
varying vec4 vTr${n + 1};
varying vec2 vTw${n + 1};
`).join(''), asg = Array.from({ length: NS }, (_, n) => ` vTr${n + 1} = aTr${n + 1}; vTw${n + 1} = aTw${n + 1};`).join('');
    sh.vertexShader = `varying vec3 vMW;
attribute float aBeach, aWd;
varying float vBeach, vWd;
` + decl + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
 vBeach = aBeach; vWd = aWd;` + asg + ' vMW = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;');
    sh.fragmentShader = `varying vec3 vMW;
varying float vBeach, vWd;
${Array.from({ length: NS }, (_, n) => `varying vec4 vTr${n + 1};
varying vec2 vTw${n + 1};
`).join('')}uniform float uSurfT, uFogY, uFogK;
uniform sampler2D uRoadMap, uRoadNrm;
${groundTrail ? `uniform sampler2D uTrailMap;
uniform float uTrailOn;
uniform vec4 uTrailBox;
` : ''}${SNOW_GLSL}
// On a steep face the snow's pattern is laid on the vertical plane along the face (its strike and the height), not on the ground plan: laid on the plan it is stretched down the slope. Flat ground is as it was.
float sfSteep( vec3 nW ) { return smoothstep( 0.45, 0.8, 1.0 - nW.y ); }
vec3 snowTiltS( vec3 q, vec3 normal, vec3 nW ) {
	vec3 fl = snowTilt( q, normal ); float st = sfSteep( nW ); if ( st < 0.01 ) return fl;
	vec3 tw = pow( abs( nW ), vec3( 4.0 ) ); float wx = tw.x, wz = tw.z, ws = wx + wz + 1e-4; // (a face looking along x is drawn from the side (z, height), one looking along z from the front (x, height), blended where it turns: the pattern is the same size everywhere and is never dragged out along the slope)
	vec2 cA = q.zy, cB = q.xy, gA = vec2( 0.0 ), gB = vec2( 0.0 ); float rA = wx / ws;
	if ( rA > 0.12 ) { float a0 = snRh( cA ); gA = vec2( snRh( cA + vec2( 0.04, 0.0 ) ) - a0, snRh( cA + vec2( 0.0, 0.04 ) ) - a0 ) / 0.04; } // (a plane with under a tenth of the weight is skipped)
	if ( rA < 0.88 ) { float b0 = snRh( cB ); gB = vec2( snRh( cB + vec2( 0.04, 0.0 ) ) - b0, snRh( cB + vec2( 0.0, 0.04 ) ) - b0 ) / 0.04; }
	if ( rA <= 0.12 ) wx = 0.0; if ( rA >= 0.88 ) wz = 0.0; ws = wx + wz + 1e-4;
	vec3 gs = ( vec3( 0.0, gA.y, gA.x ) * wx + vec3( gB.x, gB.y, 0.0 ) * wz ) / ws, g = ( viewMatrix * vec4( gs, 0.0 ) ).xyz; return mix( fl, g - normal * dot( g, normal ), st ); }
float snowShadeS( vec3 q, vec3 nW ) {
	float a = snowShade( q ), st = sfSteep( nW ); if ( st < 0.01 ) return a;
	vec3 tw = pow( abs( nW ), vec3( 4.0 ) ); float wx = tw.x, wz = tw.z, ws = wx + wz + 1e-4;
	vec3 pA = vec3( q.zy * 7.0, 0.37 ), pB = vec3( q.xy * 7.0, 0.37 ); float n = ( mn( pA + 7.0 ) * wx + mn( pB + 7.0 ) * wz ) / ws, n2 = ( mn( pA * 2.4 ) * wx + mn( pB * 2.4 ) * wz ) / ws;
	return mix( a, SNOW_DIM * ( 0.93 + 0.1 * n + 0.04 * n2 ), st ); }
${P.surf ? SURF_FUNCS : ''}
${trails.length ? TRAIL_FUNCS + ROAD_FNS : ''}
float rid( vec3 p ) { float a = 1.0 - abs( mn( p ) * 2.0 - 1.0 ); return a * a; }
float fold( vec3 p ) { // folds, creases and ledges in the rock: ridged noise, the same size in every direction, the lines wandering through a slow warp (kept to four noise lookups: it runs on every rock pixel)
	vec3 w = p + vec3( mn( p * 0.4 + 3.0 ) * 1.6 );
	return rid( w * 0.8 ) * 0.5 + rid( w * 1.9 + 4.0 ) * 0.3 + rid( w * 4.6 + 8.0 ) * 0.2; }
float rh( vec3 p ) { return mn( p * vec3( 4.0, 2.0, 4.0 ) ) * 0.5 + mn( p * vec3( 11.0, 5.0, 11.0 ) + 5.0 ) * 0.3 + mn( p * 29.0 + 9.0 ) * 0.2; }
` + sh.fragmentShader.replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
	${P.surf ? 'roughnessFactor = mix( roughnessFactor, 0.2, washFilm() );' : ''}`).replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
	{ // fine relief the 0.5 m mesh can't carry: chips and ridges on the rock, a faint wind ripple on the snow (the slope of a noise field, by sampling beside the point)
		float rockK = 1.0 - smoothstep( 0.42, 0.62, dot( vColor, vec3( 0.333 ) ) * 1.8 - 0.35 ); vec3 q = vMW; vec3 gv = vec3( 0.0 ), gsv = vec3( 0.0 ); // (each of the two bumps is only worked out where it shows: the rock's on rock, the snow's on snow)
		if ( rockK > 0.02 ) {
			float h0 = rh( q ), e = 0.06;
			vec3 gr = vec3( rh( q + vec3( e, 0.0, 0.0 ) ) - h0, rh( q + vec3( 0.0, e, 0.0 ) ) - h0, rh( q + vec3( 0.0, 0.0, e ) ) - h0 ) / e;
			float f0 = rockFold, ef = 0.07; gr += vec3( fold( q + vec3( ef, 0.0, 0.0 ) ) - f0, fold( q + vec3( 0.0, ef, 0.0 ) ) - f0, fold( q + vec3( 0.0, 0.0, ef ) ) - f0 ) / ef * 1.1;
			gv = ( viewMatrix * vec4( gr, 0.0 ) ).xyz; gv -= normal * dot( gv, normal );
		}
		if ( rockK < 0.98 ) gsv = snowTiltS( q, normal, inverseTransformDirection( normal, viewMatrix ) ); // (the snow: shared with the open ground, see snow-surface.js)
		normal = normalize( normal - mix( gsv * ${SNOW_TILT.toFixed(3)}, gv * 0.55 * ( 1.0 - 0.8 * vBeach ), rockK ) ); // (the beach: soft sand, not chipped rock)${trails.length ? Array.from({ length: NS }, (_, n) => trailNormal(n + 1)).join('') : ''}${groundTrail ? GT_NORMAL(groundTrail.size, groundTrail.flip, groundTrail.berm ?? .03) : ''}
	}`).replace('#include <color_fragment>', `#include <color_fragment>
	float rockFold = 0.0; // (worked out once for the colour, and again for the bump)
	{ float rockness = 1.0 - smoothstep( 0.42, 0.62, dot( vColor, vec3( 0.333 ) ) * 1.8 - 0.35 ); // (0 snow .. 1 rock, from the vertex colour's brightness)
	  float g1 = mn( vMW * vec3( 3.1, 1.3, 3.1 ) ), g2 = mn( vMW * vec3( 9.0, 4.0, 9.0 ) + 7.0 ), g3 = mn( vMW * 22.0 );
	  float cr = 1.0 - smoothstep( 0.0, 0.07, abs( mn( vMW * vec3( 1.1, 0.35, 1.1 ) + 3.0 ) - 0.5 ) ); // cracks and strata lines (stretched up the slope)
	  float rk = ( 0.65 + 0.7 * g1 ) * ( 0.8 + 0.4 * g2 ) * ( 0.88 + 0.24 * g3 ) * ( 1.0 - 0.45 * cr );
	  vec3 rockTint = vec3( 1.0 );
	  if ( rockness > 0.02 ) { rockFold = fold( vMW ); float fd = rockFold; rk *= ( 1.0 - 0.5 * smoothstep( 0.5, 0.95, fd ) ) * ( 0.85 + 0.3 * smoothstep( 0.05, 0.45, fd ) ); // (dark in the creases, lighter on the ledges between)
	    rockTint = mix( vec3( 0.92, 0.95, 1.02 ), vec3( 1.02, 0.97, 0.9 ), smoothstep( 0.35, 0.65, mn( vMW * 0.7 + 21.0 ) ) );
	    float sl = vMW.y / 0.9 + ( mn( vec3( vMW.xz * 0.12, 1.0 ) ) - 0.5 ) * 2.5, sf = fract( sl ), sh = fract( sin( floor( sl ) * 12.9898 ) * 43758.5453 ); // (strata: bands lying along the contours, each its own tone: pale, rusty, pink, grey; the edges soft)
	    vec3 band = mix( vec3( 0.88, 0.9, 0.95 ), vec3( 1.06, 0.95, 0.85 ), smoothstep( 0.2, 0.8, sh ) ) * ( 0.88 + 0.2 * sh );
	    rockTint *= mix( vec3( 1.0 ), band, 0.85 * ( 1.0 - 0.5 * smoothstep( 0.8, 1.0, sf ) ) * ${P.folds ? `smoothstep( ${(P.folds.x0-1.8).toFixed(1)}, ${P.folds.x0.toFixed(1)}, vMW.x ) * ( 1.0 - smoothstep( ${P.folds.x1.toFixed(1)}, ${(P.folds.x1+1.8).toFixed(1)}, vMW.x ) ) * smoothstep( ${(P.folds.z0-8).toFixed(1)}, ${P.folds.z0.toFixed(1)}, vMW.z ) * ( 1.0 - smoothstep( ${P.folds.z1.toFixed(1)}, ${(P.folds.z1+8).toFixed(1)}, vMW.z ) )` : '0.0'} ); }                // (patches of cooler grey rock and of rusty brown)
	  float sn = snowShadeS( vMW, inverseTransformDirection( normalize( vNormal ), viewMatrix ) );
	  diffuseColor.rgb *= mix( sn, mix( rk, 0.85 + 0.3 * g3 + 0.1 * g2 - 0.1, vBeach ), rockness ); diffuseColor.rgb *= mix( vec3( 1.0 ), rockTint, rockness * ( 1.0 - vBeach ) ); diffuseColor.rgb *= mix( vec3( 1.0 ), snowTint( vMW ), ( 1.0 - rockness ) * ( 1.0 - vBeach ) ); ${P.surf ? SURF_COLOR : ''} ${trails.length ? Array.from({ length: NS }, (_, n) => trailColor(n + 1)).join('') : ''}${groundTrail ? GT_COLOR(groundTrail.size, groundTrail.debug) : ''} }`);
  };
  const group = new THREE.Group(), T = 16; // samples per tile side
  const flatMemo = new Map(), tileFlat = (ti, tj) => { // (does the tile at this corner count as open, smooth slope?)
    const key = ti + ',' + tj; if (flatMemo.has(key)) return flatMemo.get(key);
    let f = P.coarse !== false && ti >= 0 && tj >= 0 && ti < W - 1 && tj < H - 1;
    if (f) { const w = Math.min(T, W - 1 - ti) + 1, h = Math.min(T, H - 1 - tj) + 1; f = (w - 1) % 4 === 0 && (h - 1) % 4 === 0; let lo = 1e9, hi = -1e9, plain = true; for (let j = 0; j < h && f; j++) for (let i = 0; i < w; i++) { const kk = (tj + j) * W + ti + i; if (wd[kk] < 6) { f = false; break; } if (dist[kk] > 0 || out[kk] < AR + 1) plain = false; if (hgt[kk] < lo) lo = hgt[kk]; if (hgt[kk] > hi) hi = hgt[kk]; } if (f && !plain && hi - lo > .15) f = false;
      if (!f && P.coarseZone && ti >= 0 && tj >= 0 && ti < W - 1 && tj < H - 1) { const cx = area.x0 + (ti + w / 2) * RES, cz = area.z0 + (tj + h / 2) * RES; let sea = false; for (let j = 0; j < h && !sea; j++) for (let i = 0; i < w; i++) if (wd[(tj + j) * W + ti + i] < 6) { sea = true; break; } f = !sea && (w - 1) % 4 === 0 && (h - 1) % 4 === 0 && P.coarseZone(cx, cz); } // (P.coarseZone(x, z): places where the ground is drawn coarse whatever its shape: far flanks the camera only just reaches)
    } // (a tile inside the mountain is still coarse when it is level to within 15 cm over its 10 m: the summit plateaus, flat white sheets: a sixteenth of the triangles, the same look)
    flatMemo.set(key, f); return f;
  };
  const tiles = []; // (every tile mesh, with where it is: the tiles are joined into larger blocks below)
  for (let tj = 0; tj < H - 1; tj += T) for (let ti = 0; ti < W - 1; ti += T) {
    const w = Math.min(T, W - 1 - ti) + 1, h = Math.min(T, H - 1 - tj) + 1; let any = false;
    for (let j = 0; j < h && !any; j++) for (let i = 0; i < w; i++) { const kk = (tj + j) * W + ti + i; if (wd[kk] > 0 && !(dist[kk] > P.reach)) { any = true; break; } }
    if (!any) continue;
    // a tile of open, smooth slope (no rock, no foot, not near the sea) is built at a quarter of the resolution (the shader carries its detail). Along an edge shared with a finer tile the rim of the coarse tile
    // uses the fine samples (a fan to the middle of each rim quad), so the two meet exactly: no crack, no skirt.
    const flat = tileFlat(ti, tj), fineL = !tileFlat(ti - T, tj), fineR = !tileFlat(ti + T, tj), fineT = !tileFlat(ti, tj - T), fineB = !tileFlat(ti, tj + T);
    const verts = [], vid = new Map(), idx = [];
    const V = (si, sj) => { const key = sj * W + si; let id = vid.get(key); if (id === undefined) { id = verts.length; verts.push(key); vid.set(key, id); } return id; };
    const skip = (k, k1, k2, k3) => (P.hideWest && (k % W) * RES + area.x0 < P.hideWest.x && Math.floor(k / W) * RES + area.z0 < P.hideWest.z) || Math.max(wd[k], wd[k1], wd[k2], wd[k3]) <= 0 || Math.min(dist[k], dist[k1], dist[k2], dist[k3]) > P.reach; // (none of the sea, none of the far slope the camera can't see; P.hideWest { x, z }: nothing west of x and north of z, where the camera cannot reach (the second ascent's west flank beyond the map's edge))
    if (!flat) {
      for (let j = 0; j < h - 1; j++) for (let i = 0; i < w - 1; i++) {
        const si = ti + i, sj = tj + j, k = sj * W + si; if (skip(k, k + 1, k + W, k + W + 1)) continue;
        const a2 = V(si, sj), b2 = V(si + 1, sj), c2 = V(si, sj + 1), e2 = V(si + 1, sj + 1); idx.push(a2, c2, b2, b2, c2, e2);
      }
    } else {
      const nq = (w - 1) / 4, mq = (h - 1) / 4;
      for (let cj = 0; cj < mq; cj++) for (let ci = 0; ci < nq; ci++) {
        const si = ti + ci * 4, sj = tj + cj * 4, k = sj * W + si; if (skip(k, k + 4, k + 4 * W, k + 4 * W + 4)) continue;
        const onT = cj === 0 && fineT, onR = ci === nq - 1 && fineR, onB = cj === mq - 1 && fineB, onL = ci === 0 && fineL;
        if (!(onT || onR || onB || onL)) { const a2 = V(si, sj), b2 = V(si + 4, sj), c2 = V(si, sj + 4), e2 = V(si + 4, sj + 4); idx.push(a2, c2, b2, b2, c2, e2); continue; }
        const ring = [], edge = (x0, y0, x1, y1, fine) => { const n = fine ? 4 : 1, dx = (x1 - x0) / n, dy = (y1 - y0) / n; for (let q = 0; q < n; q++) ring.push(V(x0 + dx * q, y0 + dy * q)); };
        edge(si, sj, si + 4, sj, onT); edge(si + 4, sj, si + 4, sj + 4, onR); edge(si + 4, sj + 4, si, sj + 4, onB); edge(si, sj + 4, si, sj, onL);
        const ctr = V(si + 2, sj + 2); for (let r = 0; r < ring.length; r++) idx.push(ctr, ring[(r + 1) % ring.length], ring[r]);
      }
    }
    if (!idx.length) continue;
    const nv = verts.length, P0 = new Float32Array(nv * 3), N0 = new Float32Array(nv * 3), C0 = new Float32Array(nv * 3), B0 = new Float32Array(nv), W0 = new Float32Array(nv), TR = sets.map(() => new Float32Array(nv * 4)), TW = sets.map(() => new Float32Array(nv * 2));
    for (let v = 0; v < nv; v++) {
      const k = verts[v], si = k % W, sj = (k - si) / W;
      P0[v * 3] = area.x0 + si * RES; P0[v * 3 + 1] = hgt[k] - .06 * (1 - smooth(2, 5, wd[k])); P0[v * 3 + 2] = area.z0 + sj * RES;
      for (let c = 0; c < 3; c++) { N0[v * 3 + c] = nrm[k * 3 + c]; C0[v * 3 + c] = col[k * 3 + c]; }
      B0[v] = beachA[k]; W0[v] = Math.min(wd[k], 8); sets.forEach((f, n) => { TR[n][v * 4] = f.u[k]; TR[n][v * 4 + 1] = f.v[k]; TR[n][v * 4 + 2] = f.dx[k]; TR[n][v * 4 + 3] = f.dz[k]; TW[n][v * 2] = f.tw[k]; TW[n][v * 2 + 1] = f.fade[k]; }); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(P0, 3)); g.setAttribute('normal', new THREE.BufferAttribute(N0, 3)); g.setAttribute('color', new THREE.BufferAttribute(C0, 3)); g.setAttribute('aBeach', new THREE.BufferAttribute(B0, 1)); g.setAttribute('aWd', new THREE.BufferAttribute(W0, 1)); sets.forEach((f, n) => { g.setAttribute('aTr' + (n + 1), new THREE.BufferAttribute(TR[n], 4)); g.setAttribute('aTw' + (n + 1), new THREE.BufferAttribute(TW[n], 2)); }); g.setIndex(idx); g.computeBoundingSphere(); g.computeBoundingBox();
    const m = new THREE.Mesh(g, mat); m.renderOrder = -5; /* (drawn first: the ground beneath then fails the depth test before it is shaded) */ m.receiveShadow = true; m.castShadow = !!P.cast; if (P.cast) mat.shadowSide = THREE.FrontSide; group.add(m); tiles.push({ m, ti, tj }); // (cast: opt-in; the ground is one open surface, so its front faces are what go into the shadow map)
  }
  // The tiles are small (20 m across, a flat one only 25 vertices): a draw call each in every pass. Neighbouring tiles are joined into blocks of 3 x 3 (the same triangles, so the surface is exactly as before); a block is still skipped when it is off screen.
  { const B = 3, blocks = new Map();
    for (const t of tiles) { const key = Math.floor(t.ti / (T * B)) + ',' + Math.floor(t.tj / (T * B)); (blocks.get(key) ?? blocks.set(key, []).get(key)).push(t); }
    for (const list of blocks.values()) {
      if (list.length < 2) continue;
      const merged = BufferGeometryUtils.mergeBufferGeometries(list.map(t => t.m.geometry)); if (!merged) continue; // (a block whose tiles do not agree on their attributes is left as it is)
      const m = new THREE.Mesh(merged, list[0].m.material); m.renderOrder = list[0].m.renderOrder; m.receiveShadow = list[0].m.receiveShadow; m.castShadow = list[0].m.castShadow;
      for (const t of list) { group.remove(t.m); t.m.geometry.dispose(); } group.add(m);
    } }
  // A coarse copy of the whole range for the shadow pass only: the drawn tiles reach 40 m in from the edge, but a peak further in still shades the slopes below it. It is hidden except while the sun's shadow map is drawn (world.js hooks it into that pass with the forest's shadow meshes); 2.4 m between points, in 48 m tiles so the ones outside the shadow box are skipped.
  const proxy = new THREE.Group(); proxy.name = 'mountainShadow'; proxy.visible = false;
  { const PS = 4, T = 20, pmat = new THREE.MeshBasicMaterial({ colorWrite: false }); pmat.shadowSide = THREE.FrontSide;
    for (let tj = 0; tj < H - PS; tj += T * PS) for (let ti = 0; ti < W - PS; ti += T * PS) {
      const nx = Math.min(T, Math.floor((W - 1 - ti) / PS)), nz = Math.min(T, Math.floor((H - 1 - tj) / PS)); if (nx < 1 || nz < 1) continue;
      let hi = -1e9; const pos = new Float32Array((nx + 1) * (nz + 1) * 3), idx = [];
      for (let b = 0; b <= nz; b++) for (let a = 0; a <= nx; a++) { const si = ti + a * PS, sj = tj + b * PS, k = sj * W + si, o = (b * (nx + 1) + a) * 3; let lo = hgt[k]; for (let dj = -3; dj <= 3; dj++) for (let di = -3; di <= 3; di++) { const qi = si + di, qj = sj + dj; if (qi >= 0 && qj >= 0 && qi < W && qj < H) lo = Math.min(lo, hgt[qj * W + qi]); } /* (the lowest ground within ~3 samples: a chord between two sample points over a gully or a crag would otherwise stand above the drawn surface, unseen, and throw a shadow on it: the phantom shadows by the cliff) */ pos[o] = area.x0 + si * RES; pos[o + 1] = lo - .7; pos[o + 2] = area.z0 + sj * RES; hi = Math.max(hi, hgt[k]); }
      if (hi < 4.5) continue; // (flat open ground: nothing to cast)
      for (let b = 0; b < nz; b++) for (let a = 0; a < nx; a++) { const i0 = b * (nx + 1) + a, i1 = i0 + 1, i2 = i0 + nx + 1, i3 = i2 + 1; idx.push(i0, i2, i1, i1, i2, i3); }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
      const m = new THREE.Mesh(g, pmat); m.castShadow = true; m.receiveShadow = false; proxy.add(m);
    } }
  return { group, proxy, fog: fogU, heightAt: (x, z) => { // the drawn surface, bilinear (what the open ground's things stand on; the rock's own cells block, nothing stands there)
    const fx = (x - area.x0) / RES, fz = (z - area.z0) / RES; if (fx < 0 || fz < 0 || fx >= W - 1 || fz >= H - 1) return 0;
    const i = Math.floor(fx), j = Math.floor(fz), tx = fx - i, tz = fz - j, k = j * W + i;
    return Math.max(0, (hgt[k] * (1 - tx) + hgt[k + 1] * tx) * (1 - tz) + (hgt[k + W] * (1 - tx) + hgt[k + W + 1] * tx) * tz); } };
}
