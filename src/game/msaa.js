// The last step of drawing a frame: the main view goes into a render target and is copied to the screen, which allows two things the canvas itself cannot do while the game
// runs: antialiasing that can be switched on and off (the canvas's own can only be chosen when the WebGL context is made, so the renderer is made without it; on, the target is
// multisampled; needs WebGL 2, without it antialiasing stays off), and a colour grade with a vignette (a stage's `mood.grade`: a tint, saturation, contrast and darkened corners).
// The water's refraction lookups go by screen pixel, and the target is the size of the drawing buffer, so they still line up.
import * as THREE from 'three';
import { profile } from './perf.js';

export function createMsaa(renderer, samples = 4) {
  let target = null, aa = false, graded = false, mode = 0; // mode: 0 straight to the screen, 1 a plain target (graded), 2 a multisampled one
  const size = new THREE.Vector2();
  const copy = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
    uniforms: { tSrc: { value: null }, uTint: { value: new THREE.Vector3(1, 1, 1) }, uSat: { value: 1 }, uContrast: { value: 1 }, uVig: { value: 0 }, uShock: { value: new THREE.Vector4(.5, .5, 0, .1) }, uShockK: { value: 0 }, uAspect: { value: 1.78 } },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4( position.xy, 0.0, 1.0 ); }',
    fragmentShader: `uniform sampler2D tSrc; uniform vec3 uTint; uniform float uSat, uContrast, uVig, uShockK, uAspect; uniform vec4 uShock; varying vec2 vUv;
void main() {
  vec3 c;
  if ( uShockK > 0.0 ) { // a shockwave (an energy field's power burst: airbase-boss.js): a ring spreading from uShock.xy, radius uShock.z, width uShock.w: the picture is pushed outward at its front (a lens), followed by fading ripples, the colour channels pulled apart, and a pale electric flash in the ring
    vec2 d = ( vUv - uShock.xy ) * vec2( uAspect, 1.0 ); float r = length( d ), x = ( r - uShock.z ) / uShock.w;
    vec2 dir = d / max( r, 0.0001 ) / vec2( uAspect, 1.0 );
    float disp = ( x * exp( -x * x ) + sin( x * 5.0 - 1.0 ) * exp( -x * x * 0.35 ) * 0.35 ) * uShockK * 0.05;
    vec2 o = dir * disp;
    c = vec3( texture2D( tSrc, vUv - o * 1.15 ).r, texture2D( tSrc, vUv - o ).g, texture2D( tSrc, vUv - o * 0.85 ).b );
    c += vec3( 0.45, 0.62, 1.0 ) * exp( -x * x * 1.5 ) * 0.12 * uShockK;
  } else c = texture2D( tSrc, vUv ).rgb;
  float l = dot( c, vec3( 0.299, 0.587, 0.114 ) );
  c = mix( vec3( l ), c, uSat ) * uTint;          // desaturated, tinted toward yellow-green
  c = ( c - 0.5 ) * uContrast + 0.5;
  vec2 d = ( vUv - 0.5 ) * vec2( 1.15, 1.0 );
  c *= 1.0 - uVig * smoothstep( 0.35, 0.85, length( d ) ); // the corners fall away
  gl_FragColor = vec4( max( c, 0.0 ), 1.0 );
}`,
    depthTest: false, depthWrite: false,
  }));
  copy.frustumCulled = false;
  const copyScene = new THREE.Scene(), copyCam = new THREE.Camera();
  copyScene.add(copy);

  function apply() {
    const want = aa && renderer.capabilities.isWebGL2 ? 2 : graded ? 1 : 0;
    if (want === mode) return;
    target?.dispose(); target = null; mode = want;
    if (!want) return;
    renderer.getDrawingBufferSize(size);
    const opts = { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, generateMipmaps: false };
    if (want === 2) { target = new THREE.WebGLMultisampleRenderTarget(size.x, size.y, opts); target.samples = samples; }
    else target = new THREE.WebGLRenderTarget(size.x, size.y, opts);
    copy.material.uniforms.tSrc.value = target.texture;
  }

  return {
    // The target the main view should be drawn into (null: straight to the screen).
    get target() { return target; },
    set(on) { aa = on; apply(); },
    // grade: { tint: [r, g, b], sat, contrast, vignette }, or null for none.
    setGrade(g) {
      graded = !!g;
      if (g) { const u = copy.material.uniforms; u.uTint.value.set(...(g.tint ?? [1, 1, 1])); u.uSat.value = g.sat ?? 1; u.uContrast.value = g.contrast ?? 1; u.uVig.value = g.vignette ?? 0; }
      apply();
    },
    resize() { if (target) { renderer.getDrawingBufferSize(size); target.setSize(size.x, size.y); } },
    // A shockwave across the picture (see the shader): centre (x, y) in 0..1 screen coordinates, radius and width in screen heights, strength 0..1; strength 0 = none. Only while the final pass exists (graded or antialiased).
    shock(x, y, radius, width, k) { const u = copy.material.uniforms; u.uShock.value.set(x, y, radius, width); u.uShockK.value = k; },
    // After the frame is drawn into the target: put it on the screen.
    present() {
      if (!target) return;
      renderer.getDrawingBufferSize(size); copy.material.uniforms.uAspect.value = size.x / Math.max(1, size.y);
      renderer.setRenderTarget(null); renderer.render(copyScene, copyCam); profile.mark('antialias + colour grade to screen');
    },
  };
}
