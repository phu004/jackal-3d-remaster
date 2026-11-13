// Asset viewer: preview any registered asset with the game's lighting, a 1 m grid,
// a 1.8 m person for scale, and a button that snaps to the in-game camera angle.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { ASSETS } from './assets/index.js';
import { palmWind } from './assets/stage-props.js';
import { setupLighting, skyDome } from './game/world.js';

const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene(); scene.add(skyDome(250)); // same sky the reflections are baked from
setupLighting(scene, renderer).follow(new THREE.Vector3());
const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshStandardMaterial({ color: 0xf29a3a, roughness: 1 }));
ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
const grid = new THREE.GridHelper(40, 40, 0x7a3d10, 0xb86a28); grid.position.y = .01; scene.add(grid);
const person = new THREE.Mesh(new THREE.CylinderGeometry(.25, .25, 1.8, 12), new THREE.MeshStandardMaterial({ color: 0x3050c0 }));
person.position.set(0, .9, 0); person.castShadow = true; scene.add(person);

const camera = new THREE.PerspectiveCamera(38, 1, .1, 300);
camera.position.set(18, 12, 18);
const controls = new OrbitControls(camera, canvas); controls.target.set(0, 1.5, 0); controls.enableDamping = true;

const pick = document.getElementById('pick'), info = document.getElementById('info');
Object.entries(ASSETS).forEach(([k, a]) => pick.add(new Option(a.title, k)));

let current = null, spinners = [];
function show(key) {
  if (!ASSETS[key]) key = Object.keys(ASSETS)[0];
  if (current) scene.remove(current);
  current = ASSETS[key].build(); scene.add(current);
  pick.value = key; location.hash = key;
  if (ASSETS[key].lift) current.position.y = -new THREE.Box3().setFromObject(current).min.y;
  const box = new THREE.Box3().setFromObject(current), size = box.getSize(new THREE.Vector3());
  person.position.x = box.max.x + 1.5;
  info.textContent = `${size.x.toFixed(2)} × ${size.y.toFixed(2)} × ${size.z.toFixed(2)} m (W×H×L)`;
  spinners = [];
  current.traverse(o => {
    if (/^rotor/i.test(o.name)) spinners.push([o, 'y', o.name === 'rotorRear' ? -22 : 22]);
    if (/^wheel/i.test(o.name)) spinners.push([o, 'x', -6]);
    if (o.name === 'propeller') spinners.push([o, 'z', 30]);
  });
}
pick.onchange = () => show(pick.value);
show(location.hash.slice(1));

let animate = true;
document.getElementById('anim').onclick = e => { animate = !animate; e.target.textContent = 'Animate: ' + (animate ? 'ON' : 'OFF'); };
document.getElementById('gamecam').onclick = () => {
  controls.target.set(0, 0, 0); camera.position.set(0, 45, 28);
};

function resize() { renderer.setSize(innerWidth, innerHeight, false); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); }
addEventListener('resize', resize); resize();

const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), .05);
  if (animate) { spinners.forEach(([o, axis, speed]) => { o.rotation[axis] += speed * dt; }); palmWind.value += dt; }
  controls.update();
  renderer.render(scene, camera);
});
