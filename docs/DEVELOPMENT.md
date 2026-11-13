# Jackal Remaster

A 3D remaster of the NES game *Jackal*, built with three.js. All assets are procedural and designed with Claude.ai.

## Run

Double-click `start.bat`. It starts the dev server and opens the game in Chrome. Or run:

```
npm install
npm run dev
```

and open the URL it prints. `viewer.html` is the asset viewer.

Opening `index.html` directly from disk (`file://`) doesn't work: browsers block the game's code files there.

**Controls:** WASD / arrows move · J / Z machine gun (always fires up-screen, as on the NES) · K / X grenade (fires the way you face) · Enter skips the intro.

**Debug:**
- `?intro=9` starts the opening cutscene 9 seconds in.
- `?z=250` skips the intro and drops the jeep 250 m up the stage. Add `&x=-10` to set the sideways position.
- **P** toggles the performance overlay (FPS, frame times, draw calls, triangles, GPU). Works in builds too.
- In dev mode, **F** toggles fly-through mode: WASD pans, Shift is fast, the mouse wheel zooms, and pressing F again drops the jeep where the camera is.
- In dev mode, `window.game` exposes the world and player in the browser console.

## Levels

Stage 1 is generated from a rip of the NES map, `asset-sources/jackal-stage-1-nes-map.webp`:

```
python tools/map_to_level.py
```

The script:
- classifies every 8×8 NES cell (sand, jungle, coast, water, bridge, wall, concrete);
- finds every sprite on the map (palms, turrets, barracks, tents, rocks, foxholes) by exact pixel matching;
- writes `src/levels/stage1/terrain.txt` and `src/levels/stage1/entities.json`;
- writes `reference/stage1-debug.png`, which shows what it detected.

Scale: one NES cell = 1.25 m. Re-running the script overwrites both data files, so put fixes in its
`MANUAL` list rather than editing the output.

The map rip and `reference/` are for personal reference only. Don't publish them with the game.

## Layout

```
asset-sources/   original Claude.ai artifact HTML files + the NES map rip (reference only; not shipped)
reference/       converter debug output (not shipped)
tools/           map_to_level.py: NES map rip -> level data
docs/            ASSET_GUIDE.md: asset contract + Claude.ai prompt template
src/assets/      one module per 3D asset, plus shared helpers (common.js) and the registry (index.js)
src/levels/      generated level data (terrain grid + entity list) per stage
src/game/        world, camera, player, weapons, intro cutscene, fx, input
src/main.js      game entry point
src/viewer.js    asset viewer entry point
```

three.js is pinned to **0.128.0**, the version Claude.ai artifacts load. Don't upgrade it without
checking that the assets still look right: newer versions changed lighting and colour handling.
