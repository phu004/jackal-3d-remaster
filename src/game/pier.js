// A wooden pier running out over the water: planked deck on two stringers, pairs of piles every couple of metres, a handrail on each side, mooring posts at the end. Built from simple boxes and cylinders (a few hundred triangles).
// from (x, z0) on the shore out to (x, z1) in the water (any direction); deck: height of the walking surface above the water's level (y 0).
import * as THREE from 'three';
import { SNOW_GLSL, SNOW_TILT, SNOW_GROUND, SNOW_DIM } from './snow-surface.js';

// Weathered plank: long grain lines, knots, darker edges, and a nail at each end. One shared canvas; each plank tints it differently.
let plankTex = null;
function plankTexture() {
  if (plankTex) return plankTex;
  const c = document.createElement('canvas'); c.width = 256; c.height = 64; const x = c.getContext('2d');
  x.fillStyle = '#8a6c48'; x.fillRect(0, 0, 256, 64);
  let st = 5; const rnd = () => (st = (st * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 70; i++) { const y = rnd() * 64, l = 40 + rnd() * 200, o = rnd() * 256; x.strokeStyle = `rgba(${40 + rnd() * 30 | 0},${28 + rnd() * 20 | 0},${14 + rnd() * 12 | 0},${.12 + rnd() * .25})`; x.lineWidth = .6 + rnd() * 1.6; x.beginPath(); x.moveTo(o, y); x.bezierCurveTo(o + l * .3, y + (rnd() - .5) * 4, o + l * .7, y + (rnd() - .5) * 4, o + l, y + (rnd() - .5) * 3); x.stroke(); }
  for (let i = 0; i < 3; i++) { const kx = 20 + rnd() * 216, ky = 10 + rnd() * 44, r = 3 + rnd() * 4; const g = x.createRadialGradient(kx, ky, 0, kx, ky, r * 2.2); g.addColorStop(0, 'rgba(40,24,12,.7)'); g.addColorStop(1, 'rgba(40,24,12,0)'); x.fillStyle = g; x.beginPath(); x.ellipse(kx, ky, r * 2.4, r, 0, 0, 7); x.fill(); }
  x.fillStyle = 'rgba(30,20,12,.35)'; x.fillRect(0, 0, 256, 3); x.fillRect(0, 61, 256, 3);
  x.fillStyle = '#2a2a2c'; for (const nx of [8, 248]) for (const ny of [18, 46]) { x.beginPath(); x.arc(nx, ny, 2.2, 0, 7); x.fill(); }   // (nails)
  plankTex = new THREE.CanvasTexture(c); plankTex.anisotropy = 4; plankTex.encoding = THREE.sRGBEncoding; return plankTex;
}

// The snow slab's material: standard lighting, the snow look of snow-surface.js, and a coverage mask (alpha-tested: the planks show where there is none).
// halfWidth: half the slab's width; rail: a narrow strip on the top of a rail (mostly covered)
export function snowMaterial(halfWidth, rail = false, centre = false) { // centre: thickest along the middle line and thinning to the sides (a drift banked against a wall), not along the edges
  const m = new THREE.MeshStandardMaterial({ roughness: 1, envMapIntensity: .3 }); m.color.setRGB(SNOW_GROUND[0], SNOW_GROUND[1], SNOW_GROUND[2]); // (the terrain's own snow colour and material, so the pier's snow matches it)
  m.onBeforeCompile = sh => {
    sh.vertexShader = `varying vec3 vMW;
varying vec3 vLoc;
` + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
 vLoc = position; vMW = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;`);
    sh.fragmentShader = `varying vec3 vMW;
varying vec3 vLoc;
${SNOW_GLSL}
` + sh.fragmentShader
      .replace('#include <map_fragment>', `#include <map_fragment>
	float edgeD = ${halfWidth.toFixed(3)} - abs( vLoc.z );                                   // (metres in from the slab's side)
	float nz = mn( vec3( vMW.xz * 1.3, 4.0 ) ) * 0.55 + mn( vec3( vMW.xz * 4.1, 9.0 ) ) * 0.3 + mn( vec3( vMW.xz * 13.0, 2.0 ) ) * 0.15;
	float cover = ${rail ? '0.35' : '-0.05'} + ${centre ? 'smoothstep( 0.0, ' + (halfWidth * .9).toFixed(3) + ', edgeD )' : '( 1.0 - smoothstep( 0.0, ' + (rail ? '0.05' : '0.9') + ', edgeD ) )'} * ${rail ? '0.5' : centre ? '1.05' : '0.62'} + ( nz - 0.5 ) * 1.5 + 0.3 * ( mn( vec3( vMW.xz * 0.35, 6.0 ) ) - 0.5 );   // (thick at the edges, patchy inside)
	if ( cover < 0.1 ) discard;
	diffuseColor.rgb *= snowShade( vMW ) * mix( 0.8, 1.0, smoothstep( 0.1, 0.3, cover ) ) * snowTint( vMW );   // (a slightly darker, bluer thin edge)`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
	normal = normalize( normal - snowTilt( vMW, normal ) * ${(SNOW_TILT * 1.3).toFixed(3)} );`);
  };
  return m;
}

// Coats a material in snow, in its own shader (so the snow is the surface of the thing, not a layer floating on it): everything facing up is covered, the sides carry clinging patches and streaks (heavier near the top), and the
// covered parts take the same relief, crust and colour as the ground's snow. For the secret level's walls.
export function snowCoat(mat, { plain = false, cling = .3, up = .35, rough = .6, bright = 1.25, tilt = .5, grain = 0, roofY = null, edge = .07, desat = 0, ridge = 1, bare = .72, zones = 0, base = null, local = false, rim = null, fine = 0, tiles = false, thick = 0, rep = 1, repV = 0, loc = false } = {}) { // tiles: a roof of separate tiles seen from above: snow lies along the upper part of each tile's row, with a scalloped lower edge, as on a tiled roof // fine: extra fine detail in the snow's relief and grain (for a big roof seen from above) // rim: [radius, width] in the object's own coordinates: snow gathers toward the outer rim of a slab (a gun turret's concrete pad), leaving the middle bare // local: patterns follow the object's own coordinates (for parts that turn, like a gun turret: the snow turns with them) // bare: how bright the bare surface stays; zones: large patches where it is mostly covered or mostly bare; base: height of a drift banked round the foot // roofY: [eave, ridge] local heights of a roof, so the snow can thin toward the ridge and the eave; edge: how soft the edge of the cover is; desat: how much the bare surface is greyed and darkened; ridge: 0 to keep the ridge cap bare of the scouring // bright: the snow's brightness against the ground's; tilt: relief strength; grain: mottled texture in the snow's colour (0 none) // up: how steeply a surface can lean and still be covered (higher: only flatter places); rough: how ragged the edge of the cover is
  const prev = mat.onBeforeCompile; mat.userData.snowBase ??= { value: 0 }; mat.userData.snowFace ??= { value: new THREE.Vector2() }; mat.userData.snowCenter ??= { value: new THREE.Vector2() }; mat.userData.snowM ??= { value: new THREE.Matrix4() }; // (snowM: this mesh's place in the turning assembly it belongs to, so every mesh of it shares one set of coordinates) // (made now, so the game can set it after placing the object: before the shader has ever been built)
  mat.onBeforeCompile = sh => {
    prev?.(sh); sh.uniforms.uSnowBase = mat.userData.snowBase; sh.uniforms.uSnowFace = mat.userData.snowFace; sh.uniforms.uSnowCenter = mat.userData.snowCenter; sh.uniforms.uSnowM = mat.userData.snowM; // (the height of the object's foot in the world: set after it is placed, so heights can be measured up from it)
    sh.vertexShader = `varying vec3 vSW;
varying float vLY;
varying vec3 vLP;
uniform mat4 uSnowM;
${loc ? 'attribute vec3 aLoc;' : ''}
` + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
 vSW = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz; vLY = ${loc ? 'aLoc' : 'position'}.y; vLP = ( uSnowM * vec4( ${loc ? 'aLoc' : 'position'}, 1.0 ) ).xyz;`); // (loc: many sheets merged into one mesh: each vertex carries its position in its own sheet, which the snow pattern is laid out in)
    sh.fragmentShader = `varying vec3 vSW;
varying float vLY;
varying vec3 vLP;
uniform float uSnowBase;
uniform vec2 uSnowFace;
uniform vec2 uSnowCenter;
float snCover;
float mh2( vec2 p ) { p = fract( p * vec2( 0.1031, 0.1030 ) ); p += dot( p, p.yx + 31.32 ); return fract( ( p.x + p.y ) * p.x ); }
float mn2( vec2 p ) { vec2 i = floor( p ), f = fract( p ); f = f * f * ( 3.0 - 2.0 * f ); return mix( mix( mh2( i ), mh2( i + vec2( 1.0, 0.0 ) ), f.x ), mix( mh2( i + vec2( 0.0, 1.0 ) ), mh2( i + vec2( 1.0, 1.0 ) ), f.x ), f.y ); }
float snRhL( vec2 p ) { return mn2( p * 0.14 + 3.0 ) * 2.4 + mn2( p * 0.4 ) * 1.2 + mn2( p * 1.1 + 7.0 ) * 0.7${fine ? ` + ( mn2( p * 1.9 + 4.0 ) * 0.5 + mn2( vec2( p.x * 0.5 + p.y * 0.2, p.y * 2.6 ) + 1.0 ) * 0.4 ) * ${(fine * 1.0).toFixed(2)}` : ''}; }      // (a light version of the ground's relief: three scales)
vec3 snowTiltL( vec3 q, vec3 normal ) { float s0 = snRhL( q.xz ); vec3 gs = vec3( snRhL( q.xz + vec2( 0.04, 0.0 ) ) - s0, 0.0, snRhL( q.xz + vec2( 0.0, 0.04 ) ) - s0 ) / 0.04; vec3 g = ( viewMatrix * vec4( gs, 0.0 ) ).xyz; return g - normal * dot( g, normal ); }
float snowShadeL( vec3 q ) { return ${SNOW_DIM.toFixed(2)} * ( 0.93 + 0.1 * mn2( q.xz * 9.0 + 7.0 ) + 0.04 * mn2( q.xz * 22.0 ) ); }
vec3 snowTintL( vec3 q ) { return mix( vec3( 0.98, 0.99, 1.01 ), vec3( 1.01, 1.0, 0.99 ), smoothstep( 0.3, 0.7, mn2( q.xz * 0.03 + 1.3 ) ) ) * ( 0.97 + 0.06 * mn2( q.xz * 0.11 + 5.0 ) ); }
` + sh.fragmentShader
      .replace('#include <color_fragment>', `#include <color_fragment>
	{ vec2 snP = ${local ? 'vLP.xz * 2.2' : 'vSW.xz'}; vec3 wnS = normalize( ( vec4( vNormal, 0.0 ) * viewMatrix ).xyz );                                           // (the surface's normal in the world)
	  vec2 wp = snP + ( vec2( mn2( snP * 0.6 + 3.0 ), mn2( snP * 0.6 + 9.0 ) ) - 0.5 ) * 1.4; // (warped, so the shapes flow and don't follow a grid)
	  float nzS = mn2( wp * 1.3 + 3.0 ) * 0.6 + mn2( wp * 3.7 + 8.0 ) * 0.4;
	  float upS = wnS.y + ( nzS - 0.5 ) * ${rough.toFixed(2)};                                                                   // (how snowy: high where it faces up)
	  float sideS = ( 1.0 - smoothstep( 0.0, 0.5, abs( wnS.y ) ) ) * ( mn2( vec2( vSW.x * 0.9 + vSW.z * 0.9, vSW.y * 0.55 ) + 5.0 ) * 0.6 + nzS * 0.4 - ${(0.5 + cling / 3).toFixed(3)} ) * 2.5;
	  float rawS = max( upS - ${up.toFixed(2)}, sideS );
	  ${tiles ? `{ float tu = ${tiles === 'x' ? 'vLP.z' : tiles === '-x' ? 'vLP.z' : 'vLP.x'}, tv = ( ${tiles === 'x' ? 'vLP.x' : tiles === '-x' ? '-vLP.x' : 'vLP.z'} ) * ${(repV || rep).toFixed(2)}, n1 = mn2( vSW.xz * 0.9 + 2.0 ), n2 = mn2( vSW.xz * 2.3 + 7.0 );     // (each tile in its own coordinates: across it (tu) and up the slope (tv); the snow is anchored at the LOW end of each tile's row, as snow piles against the next row up, and its upper edge is the scalloped one)
	    float lobe = 1.0 - pow( abs( sin( tu * ${(8.4 * rep).toFixed(2)} + n1 * 3.0 ) ), 0.55 );                                      // (rounded tongues of snow pointing down the slope, two to a tile)
	    float edgeV = -0.2 + ( 0.3 + 0.1 * ( n2 - 0.5 ) ) * lobe + ( n1 - 0.5 ) * 0.12;                         // (where the snow ends, down the slope)
	    rawS = ( - tv - edgeV + ${thick.toFixed(2)} ) - 0.22 * smoothstep( 0.7, 0.9, mn2( vSW.xz * 5.5 + 3.0 ) ); }` : ''}
	  ${rim ? `rawS = max( rawS, ( ( length( vSW.xz - uSnowCenter ) - ${rim[0].toFixed(2)} ) / ${rim[1].toFixed(2)} - ( nzS - 0.5 ) * 1.6 ) );   // (drifts along the rim of the slab and into its corners, ragged toward the middle)` : ''}
	  ${zones ? `rawS += ( mn2( snP * 0.32 + 7.0 ) - 0.5 ) * ${zones.toFixed(2)} + ( mn2( snP * 0.8 + 2.0 ) - 0.5 ) * ${(zones * .4).toFixed(2)};   // (large zones: some stretches fully covered, bare wood clustered in a few places)` : ''}
	  ${base ? `{ float hy = vSW.y - uSnowBase, al = vSW.x + vSW.z; float win = smoothstep( 0.6, 0.85, dot( normalize( wnS.xz + 1e-4 ), uSnowFace ) ); float bh = ${base.toFixed(2)} * mix( 0.5, 1.0, win ) * ( 0.3 + 1.2 * mn2( vec2( al * 0.5, 1.0 ) + 6.0 ) ) + ( mn2( vec2( al * 2.6, hy * 1.4 ) + 2.0 ) - 0.5 ) * 0.4;  rawS = max( rawS, ( bh - hy ) / 0.14 - ( nzS - 0.5 ) * 1.2 ); }   // (a drift whose top edge wanders: high in some places, low in others, with ragged tongues, not a level line)` : ''}
	  ${roofY ? `float ry = clamp( ( vSW.y - uSnowBase - ${roofY[0].toFixed(2)} ) / ${(roofY[1] - roofY[0]).toFixed(2)}, 0.0, 1.0 ); rawS -= ${(ridge * 0.22).toFixed(2)} * smoothstep( 0.78, 0.99, ry ) + 0.16 * ( 1.0 - smoothstep( 0.0, 0.1, ry ) ); // (the wind scours the ridge and the snow slides off the eave: thick in between)` : ''}                                                                // (a coverage value that crosses 0 at the edge of the snow)
	  snCover = smoothstep( 0.0, ${edge.toFixed(2)}, rawS );                                                                    // (a CRISP edge: snow is either stuck on or it isn't)
	  float wetS = smoothstep( -0.07, 0.0, rawS ) * ( 1.0 - snCover ) * 0.6;                                            // (the damp, dark band of concrete just beside the snow)
	  { float lum = dot( diffuseColor.rgb, vec3( 0.299, 0.587, 0.114 ) ); diffuseColor.rgb = mix( diffuseColor.rgb, vec3( lum ) * vec3( 0.88, 0.84, 0.8 ), ${desat.toFixed(2)} * ( 0.6 + 0.4 * wetS ) ); } // (the bare surface: greyer, not a strong orange)
	  diffuseColor.rgb *= mix( ${(bare - desat * .12).toFixed(2)}, 0.55, wetS );                                                                // (the bare concrete is darker and grubbier, darkest right at the snow)
	  vec3 snC = vec3( 0.62, 0.64, 0.69 ) * snowShadeL( vSW ) * snowTintL( vSW );
	  float thick = smoothstep( 0.05, 0.4, rawS );                                                                // (brighter, fluffier where it is thick)
	  float gr = mn2( snP * 3.2 + 6.0 ) * 0.5 + mn2( snP * 9.0 + 2.0 ) * 0.5;      // (drifts, crust and grain in the snow's colour)
	  float hol = mn2( snP * 1.1 + 9.0 );                                                                 // (broad hollows and swells)
	  snC *= mix( vec3( 1.0 ), vec3( 0.93, 0.96, 1.02 ), ( 1.0 - hol ) * 0.7 * ${(0.4 + grain).toFixed(2)} );   // (blue-tinted shade in the hollows, as on the ground)
	  snC *= 0.88 + 0.12 * smoothstep( 0.0, 0.3, rawS );                                                           // (thin snow is a little darker: it has thickness)
	  snC *= 1.0 - ${grain.toFixed(2)} * ( 0.55 * ( 1.0 - gr ) + 0.35 * ( 1.0 - hol ) ) + ${(grain * .3).toFixed(2)};
	  ${fine ? `snC *= 1.0 - ${(fine * .07).toFixed(2)} * ( 1.0 - mn2( vec2( snP.x * 0.8 + snP.y * 0.2, snP.y * 3.2 ) + 3.0 ) ) - ${(fine * .05).toFixed(2)} * ( 1.0 - mn2( snP * 2.4 + 8.0 ) );   // (soft wind-drift streaks in the colour: no fine grain, which reads as gravel)` : ''}
	  diffuseColor.rgb = mix( diffuseColor.rgb, ${plain ? 'vec3( 1.0 )' : `snC * ( ${bright.toFixed(2)} + 0.25 * thick + 0.12 * ( 1.0 - smoothstep( ${edge.toFixed(2)}, ${(edge * 2.2).toFixed(2)}, rawS ) ) * snCover )`}, snCover ); }`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
	normal = normalize( normal - snowTiltL( vSW, normal ) * ${tilt.toFixed(2)} * snCover );`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
	roughnessFactor = mix( roughnessFactor, 1.0, snCover );`)
      .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
	metalnessFactor = mix( metalnessFactor, 0.0, snCover );   // (snow is not metal: a metallic roof under it dulled the snow to grey and mirrored the sky in streaks, sheet by sheet)`);
  };
  const key = 'snowcoat:' + [plain, cling, up, rough, bright, tilt, grain, roofY, edge, desat, ridge, bare, zones, base, local, rim, fine, tiles, thick, rep, repV, loc].join(':'); mat.customProgramCacheKey = () => key; // (each set of options is its own program)
  return mat;
}

export function buildPier({ x0, z0, x1, z1, width = 3.2, deck = .55, seed = 7, groundAt = 0 }) {
  const g = new THREE.Group(), dx = x1 - x0, dz = z1 - z0, len = Math.hypot(dx, dz), ang = Math.atan2(-dz, dx);
  let s = seed; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const wood = c => new THREE.MeshStandardMaterial({ color: c, roughness: .95, envMapIntensity: .2 }), board = c => new THREE.MeshStandardMaterial({ color: c, map: plankTexture(), roughness: .92, envMapIntensity: .2 });
  const plank = [0xd8c0a0, 0xc2a888, 0xe4cca8, 0xb09878].map(board), beam = wood(0x4f3b26), pile = wood(0x3a2c1c), rail = wood(0x8a6c46);
  const add = (geo, m, x, y, z) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = o.receiveShadow = true; g.add(o); return o; };
  // local frame: x along the pier (0 at the shore end), z across it
  const nPl = Math.floor(len / .46), pl = len / nPl;
  for (let i = 0; i < nPl; i++) add(new THREE.BoxGeometry(pl - .03, .07, width - .06 - rnd() * .08), plank[Math.floor(rnd() * 4)], (i + .5) * pl, deck, (rnd() - .5) * .06);
  for (const side of [-1, 1]) add(new THREE.BoxGeometry(len, .22, .16), beam, len / 2, deck - .16, side * (width / 2 - .3)); // the stringers under the deck
  const pileGeo = new THREE.CylinderGeometry(.13, .15, deck + 1.6, 8);
  for (let u = 0; u <= len + .01; u += 2.4) for (const side of [-1, 1]) {
    add(pileGeo, pile, Math.min(u, len - .1), deck - (deck + 1.6) / 2 + .55, side * (width / 2 - .12)); // (the piles stand in the water: the lower part is under the surface)
    add(new THREE.BoxGeometry(.12, .12, width - .1), beam, Math.min(u, len - .1), deck - .3, 0);                           // a cross beam under the deck at each pair
  }
  for (const side of [-1, 1]) { // handrails: a top rail and a mid rail on posts
    const rz = side * (width / 2 - .05);
    add(new THREE.BoxGeometry(len, .07, .08), rail, len / 2, deck + .98, rz); add(new THREE.BoxGeometry(len, .05, .06), rail, len / 2, deck + .55, rz);
    for (let u = .1; u <= len; u += 2.4) add(new THREE.BoxGeometry(.1, .95, .1), rail, u, deck + .5, rz);
  }
  for (const side of [-1, 1]) add(new THREE.CylinderGeometry(.16, .18, .55, 8), pile, len - .35, deck + .3, side * (width / 2 - .5)); // mooring posts
  // snow: a blanket over the deck and along the tops of the rails, drawn with the same snow code as the ground and the mountains (snow-surface.js): drifts and wind ripples as relief, the same crust, and a coverage that is
  // thick along the edges and against the rails, and torn and thin toward the middle where the planks show through; its edge is ragged and has thickness
  const hw2 = (width - .04) / 2, snow = snowMaterial(hw2);
  const blanket = new THREE.Mesh(new THREE.BoxGeometry(len, .07, width - .04, Math.ceil(len), 1, 6), snow); blanket.position.set(len / 2, deck + .055, 0); blanket.receiveShadow = true; g.add(blanket);
  for (const side of [-1, 1]) { const cap = new THREE.Mesh(new THREE.BoxGeometry(len, .06, .16), snowMaterial(.08, true)); cap.position.set(len / 2, deck + 1.03, side * (width / 2 - .05)); cap.receiveShadow = true; g.add(cap); }
  const post = new THREE.MeshStandardMaterial({ roughness: 1 }); post.color.setRGB(SNOW_GROUND[0], SNOW_GROUND[1], SNOW_GROUND[2]);
  for (const side of [-1, 1]) { const c = new THREE.Mesh(new THREE.IcosahedronGeometry(.2, 0), post); c.scale.y = .5; c.position.set(len - .35, deck + .62, side * (width / 2 - .5)); g.add(c); } // (a cap on each mooring post)
  // the ramp up from the shore to the deck: a sloping run of planks, 3 m long, with a beam under it, a handrail either side, and a wedge of earth and snow banked against its sides
  const RAMP = 3, rise = Math.max(.05, deck - groundAt - .04), rl = Math.hypot(RAMP, rise), rang = Math.atan2(rise, RAMP);
  { const mid = (groundAt + .04 + deck) / 2;
    for (let i = 0; i < Math.round(RAMP / .46); i++) { const f = (i + .5) / Math.round(RAMP / .46), u = -RAMP + f * RAMP, y = groundAt + .04 + rise * f; const pl = add(new THREE.BoxGeometry(.43, .07, width - .06 - rnd() * .08), plank[Math.floor(rnd() * 4)], u, y, (rnd() - .5) * .05); pl.rotation.z = rang; }
    for (const side of [-1, 1]) { const b = add(new THREE.BoxGeometry(rl, .2, .16), beam, -RAMP / 2, mid - .16, side * (width / 2 - .3)); b.rotation.z = rang;
      const rz = side * (width / 2 - .05), tr = add(new THREE.BoxGeometry(rl, .07, .08), rail, -RAMP / 2, mid + .98, rz); tr.rotation.z = rang; const mr = add(new THREE.BoxGeometry(rl, .05, .06), rail, -RAMP / 2, mid + .55, rz); mr.rotation.z = rang;
      for (let u = -RAMP + .1; u <= 0; u += 1.2) add(new THREE.BoxGeometry(.1, .95, .1), rail, u, groundAt + .04 + rise * (u + RAMP) / RAMP + .5, rz);
    } }
  g.position.set(x0, 0, z0); g.rotation.y = ang;
  // what the jeep needs: the deck's height under any point (a short ramp up from the ground at the shore end), and boxes along the rails and across the far end to keep it on
  const ux = dx / len, uz = dz / len;
  const deckAt = (x, z) => {
    const s = (x - x0) * ux + (z - z0) * uz, u = (x - x0) * -uz + (z - z0) * ux;
    if (s < -RAMP || s > len || Math.abs(u) > width / 2) return null;
    const k = Math.min(1, (s + RAMP) / RAMP); return groundAt + .04 + (deck - groundAt - .04) * k; // (up the ramp in a straight line, then the deck)
  };
  const rails = [];
  for (const side of [-1, 1]) for (let q = -RAMP; q <= len; q += .8) rails.push({ x: x0 + ux * q - uz * side * (width / 2 + .1), z: z0 + uz * q + ux * side * (width / 2 + .1), hw: .45, hd: .45 });
  for (let q = -width / 2; q <= width / 2; q += .8) rails.push({ x: x0 + ux * (len + .3) - uz * q, z: z0 + uz * (len + .3) + ux * q, hw: .45, hd: .45 });
  return { group: g, deckAt, rails, boxes: Array.from({ length: Math.ceil(len / 1.1) + 1 }, (_, i) => { const t = Math.min(1, i * 1.1 / len); return { x: x0 + dx * t, z: z0 + dz * t, hw: width / 2 - .2, hd: width / 2 - .2 }; }) };
}
