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
| Nitro | Space or Ctrl | A | NITRO |
| Handbrake drift (while steering) | Shift | X or right bumper | DRIFT |
| Reset to the track | R | Y | RESET |
| Pause | Esc | Start | Pause button |

Keys can be rebound under **Settings**, which also holds the volume, the graphics
quality (low, medium, high) and whether the touch buttons are shown.

Clean driving and clean drifts refill nitro; blue track canisters add 35% and a
takedown adds 30%. Engine and event sounds start after the first control input.

## Modes

- **Career:** five tiers (Street, Club, Pro, Elite, Legend), each run by a rival
  crew, with six events per tier. Events award up to three stars; stars open
  the next tier. The last event of each tier is a duel against the crew boss,
  and winning it puts the boss's machine in your garage.
- **Event types:** circuit race, time trial, elimination, drift score, takedown
  hunt, boss duel, and police pursuit in the top two tiers.
- **Tournaments:** five cups of three to five rounds, scored on points, with
  prize money for the top three.
- **Quick Race:** any route, any owned vehicle.

The obstacles on every route are other vehicles: traffic driving in lane, slower
than the race, and stalled vehicles with their hazard lights on. A hard hit knocks
a traffic vehicle out of its lane. Time trials run on an empty road. Resetting to
the track (R) puts you back where you were with your laps intact; you only lose
the places of rivals who pass while you recover.

A wrecked bike breaks apart and a wrecked car is thrown over and burns; both
rejoin a moment later. Brake assist (on by default, under Settings) slows you
when you arrive far too fast for a corner.

Credits are the only currency. Races, new stars and cups pay them out; they buy
vehicles and per-vehicle upgrades (top speed, acceleration, handling, nitro,
armour) in the garage. Progress is saved in the browser.

The career data and scoring rules live in `src/game/data/career.js`, and the
save format in `src/state/profile.js`.

## Tests

```sh
npm test
```

Runs the headless checks in `tools/sim/`: career rules and scoring, asset
dimensions, vehicle dynamics, flip recovery, every ramp jump, and a crash fuzz test. `npm run lint`
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

## City routes

The city street routes are built differently from the scenic circuits. Blender
exports geometry, UVs and named materials only
(`tools/blender/build_city_tracks.py`); the game adds photographic surface
textures, a real dusk sky, lit windows, street-lamp glow and instanced scanned
trees when the route loads (`src/game/effects/cityLook.js`).

The textures, sky and tree come from [Poly Haven](https://polyhaven.com) and are
CC0. To fetch and rebuild them:

```sh
python3 tools/assets/fetch_polyhaven.py
/Applications/Blender.app/Contents/MacOS/Blender -b --python tools/blender/build_city_assets.py
/Applications/Blender.app/Contents/MacOS/Blender -b --python tools/blender/build_city_tracks.py
```

## Production build

```sh
npm run build
```

The production site is written to `docs/`.
