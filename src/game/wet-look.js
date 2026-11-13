// Makes a model look rain-soaked (stage 6): its materials are cloned (the shared ones, used by other things, stay dry), turned into deeper, darker, glossy ones, and given a film of water to mirror the sky: a thin layer over the paint
// whose surface is slightly wavy, so what it reflects (the overcast sky, with dark rain cloud and brighter gaps, and the glare of the sun behind it) drifts across the surface in soft patches and changes with the angle you see it from.
// Nothing is painted on: it is all reflection (the strength by Fresnel, so it is strongest at a shallow angle) plus the darker, richer paint of a wet body.
import * as THREE from 'three';

export const wetSlide = { value: new THREE.Vector2() }; // (moved with the jeep: the reflection slides with where it is and which way it faces)
export const wetFlash = { value: 0 }; // (the lightning's flash, 0 .. 1: the sky the paint mirrors lights up with it)
const patch = (m, marks = false) => { // marks: also the rain's marks on the paint (streaks running down the sides, beads, pooled water on the flat tops): for a big model, as the containers have
  m.onBeforeCompile = sh => {
    sh.uniforms.wetSlide = wetSlide; sh.uniforms.wetFlash = wetFlash;
    sh.vertexShader = 'varying vec3 vWetP;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n\tvWetP = position;');
    sh.fragmentShader = 'varying vec3 vWetP;\nuniform vec2 wetSlide; uniform float wetFlash;\n' + sh.fragmentShader
      .replace('#include <common>', `#include <common>
        float wHash( vec2 p ) { return fract( sin( dot( p, vec2( 12.9898, 78.233 ) ) ) * 43758.5453 ); }
        float wNoise( vec2 p ) { vec2 i = floor( p ), f = fract( p ); f = f * f * ( 3.0 - 2.0 * f ); return mix( mix( wHash( i ), wHash( i + vec2( 1, 0 ) ), f.x ), mix( wHash( i + vec2( 0, 1 ) ), wHash( i + vec2( 1, 1 ) ), f.x ), f.y ); }`)
      .replace('#include <map_fragment>', `#include <map_fragment>
        vec3 wGeo = normalize( cross( dFdx( vWetP ), dFdy( vWetP ) ) );
        float wUp = smoothstep( .45, .9, abs( wGeo.y ) );
        float wFoot = ( 1.0 - smoothstep( 0.0, .38, vWetP.y ) ) * ( 1.0 - wUp );   // the splashed band along the bottom
        diffuseColor.rgb *= .6 * ( 1.0 - .35 * wFoot );                            // wet paint: deeper and darker
        float wMark = 0.0;
        ${marks ? `
        vec2 wf = vec2( vWetP.x * abs( wGeo.z ) + vWetP.z * abs( wGeo.x ), vWetP.y );            // along the face, and up it
        float wCol = floor( wf.x * 9.0 ), wH = wHash( vec2( wCol, 3.1 ) ), wH2 = wHash( vec2( wCol, 7.7 ) );
        float wRun = smoothstep( 1.0, .15, abs( fract( wf.x * 9.0 ) - .5 ) * 2.0 + ( wH2 - .5 ) * .5 );
        float wStart = .9 + wH2 * 3.6, wT = ( wStart - wf.y ) / ( .8 + wH * 2.2 );                // where a streak starts, and how far down it runs
        float wStreak = ( 1.0 - wUp ) * wRun * step( .3, wH ) * step( 0.0, wT ) * ( 1.0 - smoothstep( .5, 1.0, wT ) );
        float wDrop = ( 1.0 - wUp ) * step( .86, wHash( floor( wf * vec2( 26.0, 20.0 ) ) ) ) * .6;     // beads of water
        vec2 wq = vWetP.xz * 1.1; float wPool = wUp * smoothstep( .45, .8, wNoise( wq ) * .65 + wNoise( wq * 2.7 + 5.0 ) * .35 ) * .8;   // water lying in patches on the flat tops
        wMark = clamp( wStreak * .9 + wDrop + wPool, 0.0, 1.0 );
        diffuseColor.rgb *= 1.0 - .38 * wStreak - .08 * wDrop - .16 * wPool;` : ''}`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = min( roughnessFactor, ${marks ? 'mix( .22, .06, wMark )' : '.12'} );`)
      .replace('#include <tonemapping_fragment>', `{ // a faked mirror: the wet paint's reflection looked up from the surface's direction as the camera sees it (a "matcap"), so it is the same whatever the real lights do and wherever the jeep is
          vec3 V = normalize( vViewPosition );
          vec2 wob = vec2( wNoise( vWetP.xz * 4.0 + 1.3 ) - .5, wNoise( vWetP.xz * 4.0 + 7.1 ) - .5 ) * .2 * ( .4 + .6 * wUp ) + vec2( wNoise( vWetP.xz * 11.0 ) - .5, wNoise( vWetP.xz * 11.0 + 3.7 ) - .5 ) * .05; // (the film's wavy surface)
          vec3 Nv = normalize( normal + vec3( wob, 0.0 ) );
          vec2 p = Nv.xy;                                                   // where on the mirror ball this surface looks
          float up = p.y * .5 + .5;
          vec3 mc = mix( vec3( .16, .18, .22 ), vec3( .74, .79, .88 ), smoothstep( .15, .95, up ) );                      // dark below, the pale sky above
          mc *= ( .55 + .75 * wNoise( p * 3.2 + wetSlide + 2.0 ) ) * ( .7 + .6 * wNoise( p * 7.5 + wetSlide * 1.6 + 9.0 ) );  // rain cloud, dark and bright with ragged edges, sliding as the jeep moves and turns
          mc *= 1.0 + wetFlash * ( 2.5 + 3.0 * wNoise( p * 2.0 + 5.0 ) );                                                    // lightning: the whole sky flares, the thin cloud most
          vec2 q = ( p - vec2( .06, .6 ) + wetSlide * .12 ) / vec2( .5, .13 ); float d = length( max( abs( q ) - vec2( .55, .2 ), 0.0 ) );
          mc += vec3( 1.0, .98, .95 ) * smoothstep( .5, .08, d ) * .8;                                                   // a big soft window of light: the hood sits on its edge, so the waves in the film make it glint
          mc += vec3( 1.0 ) * smoothstep( .09, .0, length( ( p - vec2( -.32, .5 ) - wetSlide * .1 ) * vec2( 1.0, 2.2 ) ) ) * .5; // and a small hot spot
          mc *= mix( 1.0, .4, smoothstep( .78, 1.0, length( p ) ) );          // the rim reflects the dark ground
          vec3 Lv = normalize( vec3( -.35, .55, .75 ) ); float spec = pow( max( dot( Nv, normalize( Lv + V ) ), 0.0 ), 70.0 );  // and a light fixed to the camera, so some glint is always there
          gl_FragColor.rgb += mc * ( .08 + .04 * wUp ) * ( 1.0 + wetFlash * .6 ) + vec3( 1.0, .98, .95 ) * spec * .15;
        }
        #include <tonemapping_fragment>`);
  };
  m.customProgramCacheKey = () => 'wetLook5' + (marks ? 'M' : '');
};

export function wetten(root, envMap = null, coat = true, marks = false) { // coat false: standard materials (no clearcoat layer, cheaper: for a big model)
  const done = new Map();
  root.traverse(o => {
    if (!o.isMesh) return;
    o.material = [].concat(o.material).map(m => {
      if (!m.isMeshStandardMaterial || (m.emissive.getHex() !== 0 && m.emissiveIntensity > .5) || m.transparent) return m;
      if (!done.has(m)) {
        const c = coat ? new THREE.MeshPhysicalMaterial() : new THREE.MeshStandardMaterial(); THREE.MeshStandardMaterial.prototype.copy.call(c, m); if (coat) c.defines = { STANDARD: '', PHYSICAL: '' }; c.userData = { ...m.userData }; // (copied as a standard material: the physical copy would read clearcoat settings the source doesn't have; and the copy resets the shader's defines)
        if (coat) { c.clearcoat = 1; c.clearcoatRoughness = .05; c.reflectivity = 1; } c.roughness = Math.min(c.roughness, .3); // (a glossy coat over the paint)
        if (envMap) { c.envMap = envMap; c.envMapIntensity = 1.0; } else c.envMapIntensity = m.envMapIntensity ?? 1;
        patch(c, marks); done.set(m, c);
      }
      return done.get(m);
    });
    if (o.material.length === 1) o.material = o.material[0];
  });
}
