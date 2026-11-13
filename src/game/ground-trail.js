// Tracks left in the ground that last: a top-down map of the whole level that the wheels write into as they roll (the snow shader in mountains.js reads it: the tracks are pressed into the relief and the snow
// is darkened and dirtied along them). The map is a render target that is never cleared; each wheel's movement since the last frame is drawn into it as a soft-edged strip, with MAX blending, so
// overlapping passes don't pile up into black and the line is continuous however fast the vehicle goes.
import * as THREE from 'three';

export const GT_SIZE = 4096, SIZE = GT_SIZE; // (a one-channel map: 16 MB at this size, a texel about 7 cm: a tire's line is several texels wide with soft shoulders)

export class GroundTrail {
  // bounds: world metres { x0, x1, z0, z1 }
  constructor(renderer, { x0, x1, z0, z1 }) {
    this.r = renderer; this.x0 = x0; this.z1 = z1; this.sx = x1 - x0; this.sz = z1 - z0;
    // The map's memory (16 MB) exists only while there are tracks: the first strip creates it, and once everything has faded (nothing stamped for `life` seconds) it is freed again; until then the shader reads a 1 x 1 dummy and skips the track code altogether.
    this.dummy = new THREE.DataTexture(new Uint8Array([0]), 1, 1, THREE.RedFormat); this.dummy.needsUpdate = true;
    this.rt = null; this.uMap = { value: this.dummy }; this.uOn = { value: 0 }; this.size = SIZE; this.idle = 0;
    this.box = new THREE.Vector4(x0, z1, 1 / this.sx, 1 / this.sz); // (what the shader needs to turn a world position into a position on the map: x0, z1, 1 / width, 1 / depth; the map's v runs north, toward -z)
    this.scene = new THREE.Scene();
    this.cam = new THREE.OrthographicCamera(-this.sx / 2, this.sx / 2, this.sz / 2, -this.sz / 2, .1, 100);
    this.cam.up.set(0, 0, -1); this.cam.position.set(x0 + this.sx / 2, 50, z1 - this.sz / 2); this.cam.lookAt(x0 + this.sx / 2, 0, z1 - this.sz / 2);
    const geo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    const mat = new THREE.ShaderMaterial({
      vertexShader: 'varying vec2 vUv;\nvoid main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 ); }',
      uniforms: { uDepth: { value: 1 } },
      fragmentShader: 'varying vec2 vUv;\nuniform float uDepth;\nvoid main() { float a = smoothstep( 0.0, 0.3, 1.0 - abs( vUv.y * 2.0 - 1.0 ) ); float e = 1.0; gl_FragColor = vec4( a * max( e, 0.0 ) * uDepth, 0.0, 0.0, 1.0 ); }',
      blending: THREE.CustomBlending, blendEquation: THREE.MaxEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor, depthTest: false, depthWrite: false, transparent: false });
    this.mesh = new THREE.Mesh(geo, mat); this.mesh.frustumCulled = false; this.scene.add(this.mesh);
    // fading: every so often the whole map has two levels of 255 taken off (a reverse-subtract pass of one full-map quad), so a track is gone after `life` seconds: the snow has covered it again. The edges, being shallower, go first.
    this.life = 80; this.fadeT = 0;
    this.fadeScene = new THREE.Scene();
    const fm = new THREE.Mesh(new THREE.PlaneGeometry(this.sx, this.sz).rotateX(-Math.PI / 2), new THREE.ShaderMaterial({
      vertexShader: 'void main() { gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 ); }', fragmentShader: 'void main() { gl_FragColor = vec4( 2.0 / 255.0, 0.0, 0.0, 1.0 ); }',
      blending: THREE.CustomBlending, blendEquation: THREE.ReverseSubtractEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor, depthTest: false, depthWrite: false, transparent: false }));
    fm.position.set(x0 + this.sx / 2, 1, z1 - this.sz / 2); fm.frustumCulled = false; this.fadeScene.add(fm);
    // craters: a ragged disc, deepest in the middle and sloping up to the rim, written into the same map (so they are pressed into the snow, darkened and faded away like the tracks)
    this.crScene = new THREE.Scene();
    this.crMat = new THREE.ShaderMaterial({ uniforms: { uDepth: { value: 1 }, uSeed: { value: 0 }, uInner: { value: 0.35 } },
      vertexShader: 'varying vec2 vUv;\nvoid main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 ); }',
      fragmentShader: 'varying vec2 vUv;\nuniform float uDepth, uSeed, uInner;\nvoid main() { vec2 p = vUv * 2.0 - 1.0; float r = length( p ), a = atan( p.y, p.x ); float rim = 0.86 + 0.08 * sin( a * 3.0 + uSeed ) + 0.05 * sin( a * 7.0 + uSeed * 2.3 ) + 0.03 * sin( a * 13.0 + uSeed * 4.1 ); float d = smoothstep( rim, rim * uInner, r ); gl_FragColor = vec4( d * uDepth, 0.0, 0.0, 1.0 ); }',
      blending: THREE.CustomBlending, blendEquation: THREE.MaxEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor, depthTest: false, depthWrite: false, transparent: false });
    this.crMesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), this.crMat); this.crMesh.frustumCulled = false; this.crScene.add(this.crMesh);
    this._c = new THREE.Color(); this.prev = null;
  }

  ensure() {
    if (this.rt) return;
    this.rt = new THREE.WebGLRenderTarget(SIZE, SIZE, { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, format: THREE.RedFormat, type: THREE.UnsignedByteType, depthBuffer: false, stencilBuffer: false });
    this.clear(); this.uMap.value = this.rt.texture; this.uOn.value = 1; this.fadeT = 0;
  }

  release() { if (!this.rt) return; this.rt.dispose(); this.rt = null; this.uMap.value = this.dummy; this.uOn.value = 0; }

  clear() {
    const r = this.r, prev = r.getRenderTarget(), ca = r.getClearAlpha(), ac = r.autoClear; r.getClearColor(this._c); const col = this._c.getHex();
    r.setRenderTarget(this.rt); r.setClearColor(0x000000, 0); r.autoClear = true; r.clear(true, false, false);
    r.setRenderTarget(prev); r.setClearColor(col, ca); r.autoClear = ac;
  }

  // A crater of `radius` metres at (x, z).
  crater(x, z, radius, depth = 1) {
    if (x < this.x0 || x > this.x0 + this.sx || z > this.z1 || z < this.z1 - this.sz) return;
    this.ensure(); this.idle = 0;
    this.crMat.uniforms.uDepth.value = depth; this.crMat.uniforms.uSeed.value = Math.random() * 6.28;
    this.crMesh.position.set(x, 1, z); this.crMesh.rotation.set(0, Math.random() * 6.28, 0); this.crMesh.scale.set(radius * 2, 1, radius * 2);
    const r = this.r, prev = r.getRenderTarget(), ac = r.autoClear;
    r.autoClear = false; r.setRenderTarget(this.rt); r.render(this.crScene, this.cam); r.setRenderTarget(prev); r.autoClear = ac;
  }

  // A footprint of someone on foot at (x, z), walking along `yaw` (forward is (-sin, -cos)); side: -1 the left foot, +1 the right. A soft oval dent about 27 x 56 cm (a little larger than a real boot, so it shows at the map's resolution), a hand's width to the side of his path, shallower than a wheel's rut.
  footprint(x, z, yaw, side) {
    if (x < this.x0 || x > this.x0 + this.sx || z > this.z1 || z < this.z1 - this.sz) return;
    this.ensure(); this.idle = 0;
    this.crMat.uniforms.uDepth.value = .92 + Math.random() * .08; this.crMat.uniforms.uSeed.value = Math.random() * 6.28;
    const ox = Math.cos(yaw) * side * .15, oz = -Math.sin(yaw) * side * .15;
    this.crMesh.position.set(x + ox, 1, z + oz); this.crMesh.rotation.set(0, yaw, 0); this.crMesh.scale.set(.27, 1, .56);
    const r = this.r, prev = r.getRenderTarget(), ac = r.autoClear;
    r.autoClear = false; r.setRenderTarget(this.rt); r.render(this.crScene, this.cam); r.setRenderTarget(prev); r.autoClear = ac;
  }

  // A dent of any size at (x, z), an oval w x l metres turned to `yaw` (the walkers' feet): deep in the middle, sloping up to the rim, pressed into the snow like the tracks and filled in as they are.
  stamp(x, z, yaw, w, l, depth = 1, inner = .35) { // inner: where the flat bottom starts, as a fraction of the radius: nearer 1 is a steeper wall and a deeper-looking pit (.35 is the soft bowl the tracks use)
    if (x < this.x0 || x > this.x0 + this.sx || z > this.z1 || z < this.z1 - this.sz) return;
    this.ensure(); this.idle = 0; this.crMat.uniforms.uInner.value = inner;
    this.crMat.uniforms.uDepth.value = depth; this.crMat.uniforms.uSeed.value = Math.random() * 6.28;
    this.crMesh.position.set(x, 1, z); this.crMesh.rotation.set(0, yaw, 0); this.crMesh.scale.set(w, 1, l);
    const r = this.r, prev = r.getRenderTarget(), ac = r.autoClear;
    r.autoClear = false; r.setRenderTarget(this.rt); r.render(this.crScene, this.cam); r.setRenderTarget(prev); r.autoClear = ac;
    this.crMat.uniforms.uInner.value = .35;
  }

  fade(dt) {
    if (!this.rt) return;
    if (!(this.life > 0)) return;
    if ((this.idle += dt) > this.life + 4) { this.release(); return; } // (nothing stamped for a whole fade: it is all gone, so the memory goes too)
    this.fadeT += dt; const period = this.life / 127.5;                    // (127.5 passes of two levels: the whole 255 in `life` seconds)
    if (this.fadeT < period) return; this.fadeT = Math.min(this.fadeT - period, period);
    const r = this.r, prev = r.getRenderTarget(), ac = r.autoClear;
    r.autoClear = false; r.setRenderTarget(this.rt); r.render(this.fadeScene, this.cam); r.setRenderTarget(prev); r.autoClear = ac;
  }

  // One strip from (ax, az) to (bx, bz), `width` metres wide.
  strip(ax, az, bx, bz, width, depth = 1) {
    this.ensure(); this.idle = 0;
    const dx = bx - ax, dz = bz - az, len = Math.hypot(dx, dz) + width;
    this.mesh.material.uniforms.uDepth.value = depth;
    this.mesh.position.set((ax + bx) / 2, 1, (az + bz) / 2); this.mesh.rotation.set(0, Math.atan2(-dz, dx), 0); this.mesh.scale.set(len, 1, width);
    const r = this.r, prev = r.getRenderTarget(), ac = r.autoClear;
    r.autoClear = false; r.setRenderTarget(this.rt); r.render(this.scene, this.cam); r.setRenderTarget(prev); r.autoClear = ac;
  }

  // The jeep's two rear wheels. The map showed why four wheels from the heading gave a knotted lattice: the jeep's path is an octagon (it moves in steps of direction) while its body turns smoothly, so the wheels worked out from
  // the body's heading wander across the path and cross each other at every corner. So the tracks follow the PATH: the jeep's position is smoothed (low-passed by distance), its heading is taken from that smoothed path, and the two
  // wheel lines are parallel offsets of it, a little behind. Each frame then draws the curve through the midpoints of each wheel's last three positions, cut into short strips (continuous, rounded).
  // key: which vehicle (each keeps its own smoothed path); back: how far behind the position the tracks are laid; lateral: how far each is from the middle.
  wheels(pos, yaw, halfLen, halfWid, width = .55, onGround = true, key = 'jeep', back = halfLen - .2, lateral = halfWid * .75, bodyHeading = false) { // bodyHeading: the tracks lie along the vehicle's own heading, whichever way it is moving (a tank does not swing its body round like a jeep: reversing must lay straight tracks, not an arc)
    this.st ??= new Map(); let q = this.st.get(key); if (!q) this.st.set(key, q = { hist: [[], []], run: [0, 0] });
    const moved0 = q.sm ? Math.hypot(pos.x - q.sm[0], pos.z - q.sm[1]) : 0;
    if (!q.sm || !onGround || moved0 > 2) { q.sm = [pos.x, pos.z]; q.hd = [-Math.sin(yaw), -Math.cos(yaw)]; q.hist = [[], []]; q.run = [0, 0]; return; }
    const k = 1 - Math.exp(-moved0 / 1.1), nx = q.sm[0] + (pos.x - q.sm[0]) * k, nz = q.sm[1] + (pos.z - q.sm[1]) * k, step = Math.hypot(nx - q.sm[0], nz - q.sm[1]);
    if (step < .008) return;                                              // (hardly moved)
    const dx = (nx - q.sm[0]) / step, dz = (nz - q.sm[1]) / step, hx = q.hd[0] + (dx - q.hd[0]) * .35, hz = q.hd[1] + (dz - q.hd[1]) * .35, hl = Math.hypot(hx, hz) || 1;
    let turn = Math.abs(q.hd[0] * hz / hl - q.hd[1] * hx / hl); if (bodyHeading) { const nhx = -Math.sin(yaw), nhz = -Math.cos(yaw); turn = Math.abs(q.hd[0] * nhz - q.hd[1] * nhx); q.hd = [nhx, nhz]; } else q.hd = [hx / hl, hz / hl]; q.sm = [nx, nz];
    const depth = Math.min(1, .6 + 7 * turn + 1.5 * Math.min(.1, Math.abs(step - (q.lastStep ?? step)))); q.lastStep = step;
    const fx = q.hd[0], fz = q.hd[1], sx = fz, sz = -fx;                    // (forward and across, from the smoothed path)
    [-1, 1].forEach((sd, i) => {
      const c = [nx - fx * back + sx * sd * lateral, nz - fz * back + sz * sd * lateral], h = q.hist[i];
      h.push(c); if (h.length > 3) h.shift();
      if (h.length === 3) {
        const [a, b, d] = h, m0 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], m1 = [(b[0] + d[0]) / 2, (b[1] + d[1]) / 2]; let px = m0[0], pz = m0[1];
        for (let n = 1; n <= 3; n++) { const t = n / 3, u = 1 - t, qx = u * u * m0[0] + 2 * u * t * b[0] + t * t * m1[0], qz = u * u * m0[1] + 2 * u * t * b[1] + t * t * m1[1], sl = Math.hypot(qx - px, qz - pz);
          if (sl > .004) { q.run[i] += sl; const ramp = Math.min(1, q.run[i] / 2.2), r = q.run[i] + i * 37, wv = .72 + .28 * Math.sin(r * .55 + 1.3) + .22 * Math.sin(r * 1.7 + i * 2.1) + .12 * Math.sin(r * 4.3), dv = .8 + .2 * Math.sin(r * .8 + i) + .12 * Math.sin(r * 2.9);
            this.strip(px, pz, qx, qz, width * Math.max(.5, wv), Math.min(1, depth * ramp * ramp * (3 - 2 * ramp) * dv)); } // (a new track eases in over its first couple of metres; its width and depth wander)
          px = qx; pz = qz; }
      }
    });
  }
}
