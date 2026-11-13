// A panel of tick boxes for finding what costs the most on a stage (opened from the P overlay: STAGE SWITCHES): untick a box and that kind of thing is taken out of the scene at once (it stays out until it is ticked again),
// while a line at the top shows the frames per second, the draw calls and the triangles, as they are now. Each box is a list of things that is re-worked every frame (soldiers come and go, tanks are built later), and is hidden
// at the start of each render of the scene (scene.onBeforeRender: the shadow pass, the main view and the road's mirror are all rendered from it), so the game cannot put it back in between. Nothing here changes the game; closing the panel puts everything back.
const lists = e => {
  const kids = e.scene.children, named = re => () => kids.filter(o => re.test(o.name));
  const big = () => { const l = []; e.scene.traverse(o => { if (!o.isMesh || o.userData.fxBatch || o.isInstancedMesh || o.name === 'grass') return; const g = o.geometry; if (!g.boundingSphere) g.computeBoundingSphere(); if (g.boundingSphere.radius * Math.max(o.scale.x, o.scale.z) > 25) l.push(o); }); return l; };
  return [
    ['Tanks: manned', () => e.tanks.tanks.filter(t => !t.inert).map(t => t.obj)],
    ['Tanks: unmanned (the parked ones)', () => [...(e.tanks.displayMeshes ?? []), ...e.tanks.tanks.filter(t => t.inert && !t.proxy).map(t => t.obj)]],
    ['Enemy jeeps', () => (e.enemyJeeps?.jeeps ?? []).map(j => j.obj)],
    ['Your jeep', () => [e.player?.object].filter(Boolean)],
    ['Soldiers', () => e.soldiers.list.map(s => s.obj)],
    ['Gun turrets (on roofs, walls and the ground)', () => e.world.turrets.map(t => t.base).filter(b => b && /^(wallTurret|turretBase|turret)/i.test(b.name))],
    ['Barricades and other instanced props', () => { const l = []; e.scene.traverse(o => { if (o.isInstancedMesh && !o.userData.fxBatch && o.name !== 'grass') l.push(o); }); return l; }],
    ['Container yard (the piles of containers)', named(/^container/)],
    ['Arena gate', named(/^gate/)],
    ['Helicopters, the boss tank, parked aircraft', named(/^(helicopter|bossTank|f35|bomber|jet|mi24)/i)],
    ['Big level meshes (buildings, walls, the ground)', big],
    ['Wreckage and flying debris', () => e.debris.pieces.map(p => p.obj)],
    ['Effects (smoke, sparks, flames)', () => { const l = []; e.scene.traverse(o => { if (o.userData.fxBatch) l.push(o); }); return l; }],
    ['Rain (streaks and splashes)', () => [e.rain?.mesh, e.rain?.splash].filter(Boolean)],
  ];
};

export function openToggles(env) {
  if (document.getElementById('stage-switches')) return;
  const e = env, scene = e.scene, sun = e.world.light.sun, groups = lists(e), off = new Set(); let mirrorOff = false, shadowsWas = sun.castShadow, shadowsOff = false;
  const touched = new Set();
  const prev = scene.onBeforeRender;
  scene.onBeforeRender = (...a) => { // each render of the scene: whatever is switched off is out of it first
    for (const i of off) for (const o of groups[i][1]()) { if (o && o.visible) { o.visible = false; touched.add(o); } }
    prev?.(...a);
  };
  const root = document.createElement('div'); root.id = 'stage-switches';
  Object.assign(root.style, { position: 'fixed', left: '8px', bottom: '8px', zIndex: 30, background: 'rgba(10,14,8,.92)', color: '#e8f0d0', font: '12px/1.45 "Courier New", monospace', padding: '8px 10px', border: '1px solid #e8b877', maxHeight: '86vh', overflowY: 'auto', minWidth: '320px' });
  const stat = document.createElement('div'); stat.style.cssText = 'color:#ffe060;margin-bottom:6px;white-space:pre'; root.appendChild(stat);
  const add = (label, set, title = '') => {
    const row = document.createElement('label'); row.style.cssText = 'display:flex;gap:6px;align-items:center;cursor:pointer;padding:1px 0'; row.title = title;
    const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = true; cb.addEventListener('change', () => set(cb.checked));
    row.append(cb, document.createTextNode(label)); root.appendChild(row); return cb;
  };
  groups.forEach(([label], i) => add(label, on => { if (on) off.delete(i); else off.add(i); if (on) for (const o of groups[i][1]()) o && (o.visible = true); }));
  const hr = document.createElement('div'); hr.textContent = '— passes and shading —'; hr.style.cssText = 'margin:6px 0 2px;color:#a8b47a'; root.appendChild(hr);
  add("Road reflection (the puddles' mirror pass)", on => { mirrorOff = !on; e.world.puddleMirrorSkip?.(mirrorOff); });
  add("Mirror culling: NEW (by where each model's reflection falls; unticked: the OLD way, by distance from the middle of the view, 52 m)", on => e.world.puddleMirrorOldCull?.(!on));
  add('Shadows', on => { shadowsOff = !on; if (!on) shadowsWas = sun.castShadow; sun.castShadow = on ? shadowsWas : false; }, 'the sun stops casting: every shader is rebuilt once, a short stall');
  const bar = document.createElement('div'); bar.style.cssText = 'display:flex;gap:6px;margin-top:8px';
  const mk = (t, f) => { const b = document.createElement('button'); b.textContent = t; b.style.cssText = 'flex:1;font:inherit;padding:3px 6px;background:#2a3318;color:#e8f0d0;border:1px solid #e8b877;cursor:pointer'; b.addEventListener('click', f); bar.appendChild(b); };
  const close = () => { off.clear(); for (const o of touched) o.visible = true; touched.clear(); e.world.puddleMirrorSkip?.(false); if (shadowsOff) sun.castShadow = shadowsWas; scene.onBeforeRender = prev ?? (() => {}); clearInterval(tick); root.remove(); };
  mk('TICK ALL', () => { for (const cb of root.querySelectorAll('input')) if (!cb.checked) { cb.checked = true; cb.dispatchEvent(new Event('change')); } });
  mk('CLOSE (puts everything back)', close); root.appendChild(bar);
  const tick = setInterval(() => { const a = e.perf?.avg; if (a) stat.textContent = `${a.fps.toFixed(0)} fps   ${a.frame.toFixed(1)} ms/frame   game logic ${a.logic.toFixed(1)} ms\n${Math.round(a.calls)} draw calls   ${(a.tris / 1000).toFixed(0)}k triangles`; }, 500);
  document.body.appendChild(root);
}
