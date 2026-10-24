# Turbo Road League

Turbo Road League is an original road-racing game built around Blender-authored
open-wheel cars, rider-equipped bikes, and closed scenic circuits. Its racing
focus is clean competition: steering, braking, cornering, drifting, boost, and
terrain jumps. There are no fighting or guard controls, music, or parachute
mechanics.

## Run the game

From this folder:

```sh
npm install
npm run dev
```

Open the local address Vite prints. Use **WASD** or the arrow keys to drive,
hold **Shift** to spend nitro, hold **Space** while steering to drift, and **Esc**
to pause. Clean driving and clean drifts refill nitro; blue track pickups add
30%. Engine and event sounds start after the first control input. The game has
no music.

Choose **Story Mode** for eight saved chapters across the Blender circuits.
Meet each chapter's finish target to unlock the next one; credits from races
can be spent on power, grip, and durability upgrades. **Quick Race** keeps all
routes available.

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
