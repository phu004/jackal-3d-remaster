// Render layers for the water's two extra views (see water.js), so they don't redraw the whole scene:
//  REFLECT: what can show in the water's reflection. The camera looks steeply down, so only tall
//    things right next to the water (palms on the bank, bridges, columns by the pools, statues) and
//    the vehicles reach it; the ground, low scatter and anything further off never do.
//  UNDERWATER: what the see-through view needs: the river bed and pool floors, and whatever stands
//    in the water (statues, boats, bridge piers).
// Everything stays on layer 0 for the normal view. three.js tests layers per object (not per group),
// so marking an object marks all of it. Lights must be on a layer to light it, and every light must be
// on every layer: a view with a different set of lights makes every material re-pick its shader.
//  SHADOW_ONLY: drawn into the shadow map and nowhere else (the shadow pass's own camera has it on, see world.js).
export const REFLECT = 1, UNDERWATER = 2, SHADOW_ONLY = 3;

export function addToLayer(obj, ...layers) {
  obj.traverse(o => layers.forEach(l => o.layers.enable(l)));
  return obj;
}
