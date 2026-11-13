// Stage 4's swamp mist: two thin, slowly drifting layers of ground fog hung over the swamp (a warm grey-yellow haze, thicker in some places than others, thinning out at the
// swamp's edge), so the water seems to breathe and the far end of it fades. Each is one transparent plane over the swamp's own extent, shaded by noise; where the swamp isn't, it
// is discarded at once. Drawn in the main view only (the reflection and see-through views don't list it).
import * as THREE from 'three';

const vertexShader = /* glsl */`
varying vec3 vWorld;
void main() { vec4 wp = modelMatrix * vec4( position, 1.0 ); vWorld = wp.xyz; gl_Position = projectionMatrix * viewMatrix * wp; }`;

const fragmentShader = /* glsl */`
uniform sampler2D tWater;   // r = depth, g = water coverage (the same map the water uses)
uniform vec4 uMap;          // WE, LE, L, layer's strength
uniform vec2 uDrift;        // m/s
uniform float uTime, uScale;
uniform vec3 uColor;
uniform vec2 uClear;        // the jeep: the mist thins out round it
varying vec3 vWorld;
float hash( vec2 p ) { return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453 ); }
float vnoise( vec2 p ) { vec2 i = floor( p ), f = fract( p ); f = f * f * ( 3.0 - 2.0 * f );
  return mix( mix( hash( i ), hash( i + vec2( 1.0, 0.0 ) ), f.x ), mix( hash( i + vec2( 0.0, 1.0 ) ), hash( i + vec2( 1.0, 1.0 ) ), f.x ), f.y ); }
void main() {
  vec2 uv = vec2( vWorld.x / uMap.x + 0.5, ( -vWorld.z - uMap.z * 0.5 ) / uMap.y + 0.5 );
  float cover = texture2D( tWater, uv, 5.0 ).g; // (blurred by a low mip, about 5 m wide: the mist thins out over the grass 3-5 m past the shore, no edge at the waterline)
  float mask = smoothstep( 0.03, 0.45, cover );
  if ( mask < 0.005 ) discard;
  vec2 p = vWorld.xz * uScale + uDrift * uTime * uScale;
  float n = vnoise( p ) * 0.55 + vnoise( p * 2.3 + vec2( 5.0, 11.0 ) + uDrift.yx * uTime * 0.4 ) * 0.3 + vnoise( p * 5.1 + 17.0 ) * 0.15;
  float dens = smoothstep( 0.28, 0.85, n ) * mask; // (thin and thick patches. The mist is not thinned round the jeep: that showed as a darker patch following it; the layers lie below the jeep's body anyway)
  float a = dens * uMap.w;
  if ( a < 0.004 ) discard;
  gl_FragColor = vec4( uColor, a );
}`;

// bounds: { x0, x1, z0, z1 } the swamp's extent (m); map: { tex (the water mask), WE, LE, L }.
export function buildSwampMist(scene, bounds, map, color = 0x7c8456) { // color: the stage's fog colour
  const layers = [], pad = 8;
  const w = bounds.x1 - bounds.x0 + 2 * pad, d = bounds.z1 - bounds.z0 + 2 * pad;
  for (const spec of [{ y: .15, strength: .27, scale: .05, drift: [.035, .015] }, { y: .3, strength: .18, scale: .032, drift: [-.02, .03] }]) {
    const mat = new THREE.ShaderMaterial({
      vertexShader, fragmentShader, transparent: true, depthWrite: false,
      uniforms: { tWater: { value: map.tex }, uMap: { value: new THREE.Vector4(map.WE, map.LE, map.L, spec.strength) }, uDrift: { value: new THREE.Vector2(...spec.drift) }, uTime: { value: 0 }, uScale: { value: spec.scale }, uColor: { value: new THREE.Color(color) }, uClear: { value: new THREE.Vector2(1e5, 1e5) } },
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat);
    mesh.rotation.x = -Math.PI / 2; mesh.position.set((bounds.x0 + bounds.x1) / 2, spec.y, (bounds.z0 + bounds.z1) / 2); mesh.renderOrder = 4;
    scene.add(mesh); layers.push(mat);
  }
  return { update(dt, focus) { for (const m of layers) { m.uniforms.uTime.value += dt; if (focus) m.uniforms.uClear.value.set(focus.x, focus.z); } } };
}
