// Tilted top-down follow camera. Follows the jeep both ways along the stage (north = -Z).
//
// Fairness across window shapes: `ref` is an invisible camera in exactly the same place with a
// fixed 16:9 shape. What it sees is the "play window"; game rules (e.g. which turrets may fire) use
// it, never the real screen edges. The game view is sized to 16:9 (bars round it, see main.js), so
// the real camera normally matches it exactly; resize() still copes with any other shape (on 16:9
// or wider it keeps the vertical view, narrower ones open the field of view to fit the width).
import * as THREE from 'three';
import { LEVEL } from './world.js';

const OFFSET = new THREE.Vector3(0, 45, 28);
const LEAD = 4;         // look this far ahead of the jeep
const SOUTH_LIMIT = -14; // furthest south the camera centres, so the map's bottom edge stays near the screen edge
const FOV = 38, PLAY_ASPECT = 16 / 9;
const _v = new THREE.Vector3(); // scratch (no garbage per call)

export class GameCamera {
  constructor(start) {
    this.camera = new THREE.PerspectiveCamera(FOV, 1, 6, 600);
    this.ref = new THREE.PerspectiveCamera(FOV, PLAY_ASPECT, 6, 600); // the play window
    this.zoom = 1;
    this.secret = null; // { areas: [{ z0, z1, x1 }], focusMin }: where the camera may follow the jeep past the usual sideways limit: in an area (those rows, left of x1: the secret passage itself) it scrolls on to focusMin (stage 5's secret land)
    this.focus = start.clone().add(new THREE.Vector3(0, 0, -6)); // frames the landing zone for the intro
    this.place();
  }

  resize(w, h) {
    const aspect = w / h, c = this.camera;
    c.aspect = aspect;
    // narrower than 16:9: widen the vertical field of view until the play window's full width fits
    c.fov = aspect >= PLAY_ASPECT ? FOV
      : THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(FOV / 2)) * PLAY_ASPECT / aspect));
    c.updateProjectionMatrix();
  }

  // Is a world point inside the play window (same for every screen shape)? `margin` < 1 shrinks it.
  inPlayWindow(p, margin = .95) {
    const v = _v.copy(p).project(this.ref);
    return Math.abs(v.x) < margin && Math.abs(v.y) < margin && v.z < 1;
  }

  // The jeep can roam the whole stage, back to the southern edge of the map.
  // southLimit: set when the jeep is shut in somewhere (the boss arena's invisible wall).
  bounds() { return { north: -LEVEL.length + 3, south: this.southLimit ?? -2 }; }

  // Where the camera settles when following a jeep at p: a little ahead of it, without scrolling
  // past either end of the map, and sideways only until the map edge would show.
  followTarget(p) {
    const sc = this.secret, lo = sc && sc.areas.some(a => p.z >= a.z0 && p.z <= a.z1 && p.x < a.x1) ? sc.focusMin : -LEVEL.cameraRangeX;
    return new THREE.Vector3(THREE.MathUtils.clamp(p.x, lo, LEVEL.cameraRangeX), 0,
      THREE.MathUtils.clamp(p.z - LEAD, -LEVEL.length + 16, SOUTH_LIMIT));
  }

  // Pan to `to` over `duration` seconds and stay there (the boss arena), instead of following the jeep.
  lockTo(to, duration) { this.lock = { from: this.focus.clone(), to: to.clone(), t: 0, dur: duration }; }

  kick(a) { this.shakeAmp = Math.max(this.shakeAmp || 0, a); }   // a jolt (metres at the camera) that dies away on its own

  update(dt, player) {
    this.shakeAmp = Math.max(0, (this.shakeAmp || 0) - dt * 1.6);
    if (this.lock) {
      const l = this.lock, k = Math.min(1, (l.t += dt) / l.dur);
      this.focus.lerpVectors(l.from, l.to, k * k * (3 - 2 * k));
    } else if (player.enabled) {
      const f = this.focus;
      const t = this.followTarget(player.position);
      f.z += (t.z - f.z) * Math.min(1, dt * 4);
      f.x += (t.x - f.x) * Math.min(1, dt * 3);
      if (this.followHeight) f.y += (Math.max(0, player.position.y) - f.y) * Math.min(1, dt * 3); // (the secret level's summit road climbs 30 m: the camera rises with the jeep, so the view keeps its distance from the ground)
    }
    if (this.swayOn) { this.swayT = (this.swayT || 0) + dt; this.swayK = Math.min(1, (this.swayK || 0) + dt / 2.5); }
    this.place();
  }

  // Fly-through mode: pan freely anywhere on the map, zoom with `zoom` (1 = game view).
  fly(dt, axis, fast) {
    const speed = (fast ? 120 : 40) * this.zoom;
    this.focus.x = THREE.MathUtils.clamp(this.focus.x + axis.x * speed * dt, -LEVEL.halfWidth - 20, LEVEL.halfWidth + 20);
    this.focus.z = THREE.MathUtils.clamp(this.focus.z + axis.z * speed * dt, -LEVEL.length - 20, 20);
    this.place();
  }

  place() {
    for (const c of [this.camera, this.ref]) {
      c.position.copy(this.focus).addScaledVector(OFFSET, this.zoom);
      c.lookAt(this.focus);
      if (this.shakeAmp > 0) { const a = Math.min(1, this.shakeAmp) * .5; c.position.x += (Math.random() - .5) * a; c.position.y += (Math.random() - .5) * a; c.position.z += (Math.random() - .5) * a * .6; }
      if (this.swayK > 0) { // the results screen: the view drifts slowly about the scene, a little swing and tilt (as Quake's intermission did)
        const t = this.swayT, k = this.swayK * this.swayK * (3 - 2 * this.swayK);
        c.position.x += Math.sin(t * .45) * 3.2 * k; c.position.y += Math.sin(t * .31 + 1) * 1.2 * k; c.position.z += Math.cos(t * .38) * 2 * k;
        c.lookAt(this.focus.x + Math.sin(t * .27 + 2) * 1.5 * k, this.focus.y, this.focus.z + Math.cos(t * .33) * 1.2 * k); c.rotateZ(Math.sin(t * .29) * .035 * k);
      }
      c.updateMatrixWorld();
    }
  }
}
