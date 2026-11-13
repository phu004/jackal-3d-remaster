// The snow's surface look, shared by the mountain (mountains.js) and the open ground (world.js, the snow theme), so the two are literally the same shader code: the relief (drifts, wind ripples, grain:
// the slope of a noise field, sampled beside the point) and the fine light-and-dark crust of the colour. Both work from a world position `q` (metres). Prepend SNOW_GLSL to a fragment shader, then
//   normal = normalize( normal - snowTilt( q, normal ) * SNOW_TILT );   diffuseColor.rgb *= snowShade( q );
export const SNOW_GROUND_K = 1.5; // the open ground's brightness against its own painted colour: it comes out as bright as the mountain's skirt (whose vertex colour is .55 where the apron ends)
export const SNOW_GROUND = [.59, .6, .62]; // the open ground's lit-surface colour (its painted colour 208, 214, 224 as linear light, times its .627 base colour, times SNOW_GROUND_K), which the mountain's apron fades to
export const SNOW_DIM = 1; // all the snow's brightness (the ground's, the mountains', the walls', roofs' and pier's): 10% darker, so the falling flakes show against it
export const SNOW_TILT = .5; // (the relief is twice as wide as before, so it tilts the normal about half as much per metre: this keeps the drifts' contrast) // how hard the relief tilts the normal
export const SNOW_GLSL = /* glsl */`
float mh( vec3 p ) { p = fract( p * 0.1031 ); p += dot( p, p.zyx + 31.32 ); return fract( ( p.x + p.y ) * p.z ); } // (no sin(): far from the origin its precision breaks into maze-like contour lines)
float mn( vec3 p ) { vec3 i = floor( p ), f = fract( p ); f = f * f * ( 3.0 - 2.0 * f );
	return mix( mix( mix( mh( i ), mh( i + vec3( 1, 0, 0 ) ), f.x ), mix( mh( i + vec3( 0, 1, 0 ) ), mh( i + vec3( 1, 1, 0 ) ), f.x ), f.y ), mix( mix( mh( i + vec3( 0, 0, 1 ) ), mh( i + vec3( 1, 0, 1 ) ), f.x ), mix( mh( i + vec3( 0, 1, 1 ) ), mh( i + vec3( 1, 1, 1 ) ), f.x ), f.y ), f.z ); }
float snRh( vec2 p ) { p *= 0.55; p += ( vec2( mn( vec3( p * 0.05 + 7.0, 1.0 ) ), mn( vec3( p * 0.05 + 19.0, 2.0 ) ) ) - 0.5 ) * 7.0; vec2 r1 = mat2( 0.82, -0.57, 0.57, 0.82 ) * p, r2 = mat2( 0.64, 0.77, -0.77, 0.64 ) * p; return mn( vec3( p * 0.1 + 3.0, 0.0 ) ) * 2.4 + mn( vec3( p * 0.25, 0.0 ) ) * 1.5 + mn( vec3( r1.x * 1.3 + 20.0, r1.y * 0.35, 0.0 ) ) * 0.6 + mn( vec3( r2.x * 0.9 + 40.0, r2.y * 0.4, 0.0 ) ) * 0.5 + mn( vec3( p * 0.7, 0.0 ) ) * 0.9 + mn( vec3( p * 2.6 + 5.0, 0.0 ) ) * 0.3 + mn( vec3( p * 7.0 + 11.0, 0.0 ) ) * 0.08 + mn( vec3( p * 19.0 + 3.0, 0.0 ) ) * 0.025 + mn( vec3( p * 41.0 + 8.0, 0.0 ) ) * 0.012; } // (the coordinates are bent by slow noise, and the two wind-ripple layers run in different directions, so no one direction dominates)
vec3 snowTilt( vec3 q, vec3 normal ) { // the relief's slope along the surface, in view space
	float s0 = snRh( q.xz ); vec3 gs = vec3( snRh( q.xz + vec2( 0.04, 0.0 ) ) - s0, 0.0, snRh( q.xz + vec2( 0.0, 0.04 ) ) - s0 ) / 0.04;
	vec3 g = ( viewMatrix * vec4( gs, 0.0 ) ).xyz; return g - normal * dot( g, normal ); }
vec3 snowTint( vec3 q ) { // snow is never neutral: a cool blue-white in the hollows, a touch warmer on the crests, in broad soft patches
	float m = mn( vec3( q.x * 0.03, 1.3, q.z * 0.03 ) ), h = mn( vec3( q.x * 0.11 + 5.0, 2.1, q.z * 0.11 ) );
	return mix( vec3( 0.98, 0.99, 1.01 ), vec3( 1.01, 1.0, 0.99 ), smoothstep( 0.3, 0.7, m ) ) * ( 0.97 + 0.06 * h ); }
const float SNOW_DIM = ${SNOW_DIM.toFixed(2)};
float snowShade( vec3 q ) { q.y = 0.37; return SNOW_DIM * ( 0.93 + 0.1 * mn( q * vec3( 9.0, 4.0, 9.0 ) + 7.0 ) + 0.04 * mn( q * 22.0 ) ); } // (height ignored: the slope and the flat shore strip get the same pattern)
`;
