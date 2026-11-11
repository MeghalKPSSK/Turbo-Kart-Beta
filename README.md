# Turbo Road League

Turbo Road League is an original road-racing game built around Blender-authored
open-wheel cars, rider-equipped bikes, and closed scenic circuits. You race eight
rivals: steer, brake, drift, boost, jump the ramps, and ram rivals hard enough for a
takedown. The game has no music.

## Run the game

From this folder:

```sh
npm install
npm run dev
```

Open the local address Vite prints.

## Controls

| Action | Keyboard | Gamepad | Touch |
| --- | --- | --- | --- |
| Accelerate | W or Up | Right trigger | GAS |
| Brake, then reverse | S or Down | Left trigger | BRAKE |
| Steer | A / D or Left / Right | Left stick or d-pad | Arrow buttons |
| Nitro | Shift | A | NITRO |
| Drift (while steering) | Space | X or right bumper | DRIFT |
| Reset to the track | R | Y | RESET |
| Pause | Esc | Start | Pause button |

Keys can be rebound under **Settings**, which also holds the volume, the graphics
quality (low, medium, high) and whether the touch buttons are shown.

Clean driving and clean drifts refill nitro; blue track canisters add 35% and a
takedown adds 30%. Road coins collected on track buy per-vehicle upgrades (top
speed, acceleration, handling, nitro, armour) in the garage. Engine and event
sounds start after the first control input.

Choose **Story Mode** for eight saved chapters across the circuits. Meet each
chapter's finish target to unlock the next one. **Quick Race** keeps all routes
available.

## Tests

```sh
npm test
```

Runs the headless physics checks in `tools/sim/`: asset dimensions, vehicle
dynamics, flip recovery, every ramp jump, and a crash fuzz test. `npm run lint`
checks the source.

## Blender vehicle assets

- Editable source: `assets/blender/turbo_road_vehicles.blend`
- Eight Blender models: four bikes (Nightjar Streetfighter, Vector Trackbike,
  Driftwood Scrambler, Solstice Endurance) and four open-wheel cars (Apex,
  Vector, Emberline, and Northstar Grand Prix)
- Exported models: `public/models/blender/bike_nightjar.glb`,
  `bike_vector.glb`, `bike_driftwood.glb`, `bike_solstice.glb`,
  `car_apex_gp.glb`, `car_vector_gp.glb`, `car_emberline_gp.glb`, and
  `car_northstar_gp.glb`
- Generator: `tools/blender/build_road_vehicles.py`

Each formula car has four visible wheels, open-wheel bodywork, a cockpit, and a
helmeted driver. Paint selection recolors the Blender model, while power, grip,
and armor upgrades change race performance and durability.

## Blender race environments

The game has eight closed routes, each exported as a Blender GLB with matching
centerline metadata. Routes include alpine switchbacks, a sandstone canyon, a
rainforest waterfall, coastal roads, a glacial circuit, a night industrial
course, island water, and a volcanic ridge. Terrain, scenery, race gates, and
jump ramps are authored in Blender; the browser loads these models for both
vehicle previews and races.

- Editable source: `assets/blender/turbo_road_tracks.blend`
- Course exports and metadata: `public/models/blender/*.glb` and
  `*.track.json`
- Generator: `tools/blender/build_road_tracks.py`

To rebuild either Blender asset set, open Blender's Python Console and run the
command shown at the top of the corresponding generator file, replacing
`/path/to` with this project's absolute path. Then restart or refresh Vite so
it serves the updated files.

## Production build

```sh
npm run build
```

The production site is written to `docs/`.
