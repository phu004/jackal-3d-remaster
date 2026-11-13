# Crafting assets with Claude.ai

Every 3D asset in the game is procedural three.js code: no model files and no image textures.
You design it in a Claude.ai artifact, then port it into `src/assets/` as one module.

The game is pinned to **three.js r128**, the same version Claude.ai artifacts load, so an asset
looks the same in the game as it did in the chat.

## The asset contract

| Rule | Why |
|---|---|
| **1 unit = 1 metre** | Keeps everything in scale (jeep ≈ 4 m, transport ≈ 14.5 m, soldier ≈ 1.8 m). |
| **Y is up, the front faces −Z** | The game turns things by setting `rotation.y`. |
| **Origin on the ground, at the centre** | `position.y = 0` means "standing on the ground". |
| **One function `buildX()` that returns a `THREE.Group`** | No scene, camera, lights, renderer or animation loop inside it. |
| **Moving parts are separate `Group`s with a `.name`** | The game finds them with `getObjectByName('turret')` and animates them. |
| **Materials: `MeshStandardMaterial`, canvas textures only** | Nothing to download, and it matches the lighting. |
| **Keep it cheap** | Many copies can be on screen. Aim for curve/segment counts of 12–32, not 64+. |

Shared helpers already live in `src/assets/common.js`: `paint()` (panelled military paint),
`tireMaterial()`, `palette()` (black, steel, yellow, glass), `extrudeProfile()`,
`roundedRect()` and `decal()`. Ported code can use them in place of its own copies.

## Prompt template (paste into Claude.ai)

Attach a screenshot of the NES sprite, then send:

```
Build a three.js r128 (cdnjs) artifact: a 3D remaster of this NES Jackal sprite — [WHAT IT IS].

Constraints (it will be dropped into a game):
- 1 unit = 1 metre. Real-world size about [L × W × H] m.
- Y up, the front faces -Z, origin on the ground at the model's centre.
- Put ALL model-building code in one function `buildModel()` that returns a THREE.Group.
  The scene, lights, camera and orbit controls go outside that function.
- Moving parts are child Groups with a .name: [e.g. "turret" rotates on Y, "barrel" pitches on X,
  "wheelFL/FR/RL/RR" roll on X]. Pivot each Group at its real hinge point.
- MeshStandardMaterial only. Textures are drawn procedurally on canvases
  (panel seams, rivets, weathering, stencils) — no image files.
- Keep geometry segments modest (12–32).
- Lighting for the preview: HemisphereLight(0xfff2e0, 0x9a6a3a, 0.5) +
  DirectionalLight(0xfff4e6, 1.15) at (-9, 18, 10) with shadows, orange desert ground 0xf29a3a.
- Add a "Game camera" button that views it from (0, 45, 28) looking at the origin,
  which is how the player will actually see it.
```

Then iterate. Check it with **Game camera** often: the player mostly sees the top of the model,
so the roof, turret and deck matter more than the underside.

## Bringing it into the game

1. Save the finished artifact's HTML in `asset-sources/` (this keeps the original).
2. Create `src/assets/<name>.js` with `export function build<Name>() { ... }`, containing the body
   of `buildModel()`. Or ask Claude Code: *"port asset-sources/X.html into the game"*.
3. Add it to `src/assets/index.js` so it appears in the asset viewer.
4. Open `viewer.html#<name>`. Check the size readout, compare it with the 1.8 m blue person, and try
   **Game camera**.

## Asset wishlist (Stage 1)

Placeholders for the Stage 1 props are in `src/assets/stage-props.js`, sized to the NES sprites
(8 px = 1.25 m). To replace one, have Claude.ai build it with the same size and part names, then swap
the function.

- [x] Tandem-rotor transport, `transport.js` (opening scene)
- [ ] Player jeep, `jeep.js`, ~4 x 2.5 m: `wheelFL/FR/RL/RR` roll on X, `gun` + `muzzle`
- [ ] Gun emplacement, `buildTurret`, ~5 x 5 m concrete block: `turret` yaws on Y, `muzzle`
- [ ] POW barracks, `buildBarracks`, ~8.6 x 7 m (the building you blow open to free prisoners): `roof` / `roofBroken`
- [ ] Compound hut, `buildTent`, ~6 x 8 m: `roof` / `roofBroken` (intact / blown-out)
- [ ] Compound gate, `buildGate`, ~10 m wide: `doorL` / `doorR` swing on Y
- [ ] Palm tree, `buildPalm`, ~6 m tall
- [ ] Desert boulder, `buildRock`, ~4 m across
- [ ] Sandbag foxhole, `buildFoxhole`, ~5 x 3 m arc open to the north
- [ ] Fuel drum, `buildDrum`, ~1.1 m tall
- [ ] Helipad markings, `buildHelipadMarkings`
- [ ] Weapon pickup star, `buildPickup`: `star` spins
- [ ] Not built yet: enemy foot soldier, POW soldier, enemy tank, rescue helicopter, Stage 1 boss
