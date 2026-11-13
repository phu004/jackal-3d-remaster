// A mine warning sign: two wooden posts holding a board that leans back toward the camera so it reads from above: a skull and crossbones in a red border, no words.
// Origin on the ground at the foot of the posts; the board faces +z (south, toward the camera).
import * as THREE from 'three';

let tex = null;
const board = () => tex ??= (() => {
  const W = 256, H = 256, c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d');
  x.fillStyle = '#d8d4c8'; x.fillRect(0, 0, W, H); x.strokeStyle = '#b3201a'; x.lineWidth = 16; x.strokeRect(8, 8, W - 16, H - 16);
  x.lineCap = 'round'; x.strokeStyle = '#16140f'; x.lineWidth = 17; // (crossbones behind the skull)
  for (const s of [1, -1]) { x.beginPath(); x.moveTo(64, 128 + s * 58); x.lineTo(192, 128 - s * 58); x.stroke(); for (const e of [[64, 128 + s * 58], [192, 128 - s * 58]]) for (const o of [-9, 9]) { x.beginPath(); x.arc(e[0] + (e[0] < 128 ? -4 : 4), e[1] + o * (s > 0 ? 1 : -1) * .9, 9, 0, 6.3); x.fillStyle = '#16140f'; x.fill(); } }
  x.fillStyle = '#16140f'; x.beginPath(); x.ellipse(128, 104, 46, 44, 0, 0, 6.3); x.fill(); x.fillRect(102, 122, 52, 40); // (the skull: a round cranium over a jaw)
  x.fillStyle = '#d8d4c8'; x.beginPath(); x.ellipse(108, 104, 13, 15, 0, 0, 6.3); x.fill(); x.beginPath(); x.ellipse(148, 104, 13, 15, 0, 0, 6.3); x.fill(); x.beginPath(); x.moveTo(128, 118); x.lineTo(120, 134); x.lineTo(136, 134); x.closePath(); x.fill(); // (eyes and nose)
  x.fillStyle = '#d8d4c8'; for (let i = 0; i < 4; i++) x.fillRect(108 + i * 11, 148, 5, 14); // (teeth)
  const t = new THREE.CanvasTexture(c); t.anisotropy = 4; t.encoding = THREE.sRGBEncoding; return t;
})();

export function buildMineSign() {
  const g = new THREE.Group(); g.name = 'mineSign';
  const wood = new THREE.MeshStandardMaterial({ color: 0x4a3a2a, roughness: 1 }), face = new THREE.MeshStandardMaterial({ map: board(), roughness: .8 }), back = new THREE.MeshStandardMaterial({ color: 0x8a8678, roughness: 1 });
  for (const sx of [-.55, .55]) { const p = new THREE.Mesh(new THREE.BoxGeometry(.1, 1.5, .1), wood); p.position.set(sx, .7, 0); p.castShadow = p.receiveShadow = true; g.add(p); }
  const b = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.1, .05), [back, back, back, back, face, back]); b.position.set(0, 1.05, .05); b.rotation.x = -.7; b.castShadow = b.receiveShadow = true; g.add(b); // (leaning back: the top away from the camera, the face up toward it)
  return g;
}
