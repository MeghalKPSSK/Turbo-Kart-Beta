// Physical dimensions measured from the Blender models (metres, vehicle space: +Z forward,
// +Y up, origin on the ground between the wheels). `tools/sim/verify-assets.mjs` re-checks
// these numbers against the exported GLB files.
// Street cars (tools/blender/build_street_cars.py). `cabin` is [rear z, front z] of the
// glasshouse. The cabin gets its own massless collision box so a car on its roof rests on the
// roof instead of sinking into the road; verify-assets checks the boxes against the model.
const carDims = ({ wheelbase, track, radius, length, width, roof, cabin, cabinWidth }) => ({
    wheelbase,
    wheels: [
        { name: 'FL', x: track, y: radius, z: wheelbase / 2, radius, steered: true, driven: true, front: true },
        { name: 'FR', x: -track, y: radius, z: wheelbase / 2, radius, steered: true, driven: true, front: true },
        { name: 'RL', x: track, y: radius, z: -wheelbase / 2, radius, steered: false, driven: true, front: false },
        { name: 'RR', x: -track, y: radius, z: -wheelbase / 2, radius, steered: false, driven: true, front: false }
    ],
    body: {
        // The box starts half a metre up: a low nose then rides up a ramp on its wheels instead
        // of digging its chin in, and a car straddling the edge of a kicker is not beached on it.
        half: [width / 2, 0.25, length / 2],
        center: [0, 0.75, 0],
        parts: [
            { half: [cabinWidth, (roof - 0.9) / 2 + 0.03, (cabin[1] - cabin[0]) / 2], center: [0, (roof + 0.9) / 2, (cabin[0] + cabin[1]) / 2] }
        ]
    },
    comHeight: 0.4,
    mass: 1000,
    length,
    width,
    // A road car's narrow track tips easily when one side climbs a kicker; resist roll as a
    // wider car would, so jumps stay the fun kind.
    inertiaWidth: 2.7,
    exhausts: [{ x: 0.36, y: 0.34, z: -length / 2 + 0.05 }, { x: -0.36, y: 0.34, z: -length / 2 + 0.05 }]
});

// Bikes (tools/blender/build_street_bikes.py) are simulated on four narrow, all-wheel-driven
// contact points so they stay upright and keep traction; the model leans visually into
// corners. `highPipe` is the scrambler's raised exhaust.
const bikeDims = ({ highPipe = false } = {}) => {
    const radius = 0.35;
    const axle = 0.81;
    return {
        // Steering response of the longer machine the handling was tuned around: with the true
        // 1.62 m wheelbase the same steering input turns the bike too sharply for a keyboard.
        wheelbase: 2.13,
        wheels: [
            { name: 'FL', x: 0.3, y: radius, z: axle, radius, steered: true, driven: true, front: true },
            { name: 'FR', x: -0.3, y: radius, z: axle, radius, steered: true, driven: true, front: true },
            { name: 'RL', x: 0.3, y: radius, z: -axle, radius, steered: false, driven: true, front: false },
            { name: 'RR', x: -0.3, y: radius, z: -axle, radius, steered: false, driven: true, front: false }
        ],
        body: {
            half: [0.45, 0.4, 1.2],
            center: [0, 0.85, 0],
            parts: [
                { half: [0.36, 0.52, 0.62], center: [0, 1.66, -0.08] }    // rider
            ]
        },
        comHeight: 0.55,
        mass: 460,
        length: 2.4,
        width: 0.9,
        // Yaw and roll inertia of the longer, wider machine the handling was tuned around.
        inertiaLength: 3.3,
        inertiaWidth: 1.16,
        exhausts: [highPipe ? { x: -0.22, y: 0.82, z: -0.95 } : { x: -0.23, y: 0.46, z: -0.9 }]
    };
};

export const ROAD_VEHICLES = [
    {
        id: 'bike_nightjar',
        dims: bikeDims(),
        name: 'Nightjar Streetfighter',
        type: 'BIKE',
        model: 'bike_nightjar.glb',
        description: 'A compact naked bike built to dive inside on tight canyon turns.',
        stats: { speed: 5, acceleration: 5, handling: 5, armor: 2 },
        defaultPaint: 0xe83e2d
    },
    {
        id: 'bike_vector',
        dims: bikeDims(),
        name: 'Vector Trackbike',
        type: 'BIKE',
        model: 'bike_vector.glb',
        description: 'Full fairings and a long pull make this the fastest bike on the straights.',
        stats: { speed: 5, acceleration: 4, handling: 4, armor: 2 },
        defaultPaint: 0x176bdb
    },
    {
        id: 'bike_driftwood',
        dims: bikeDims({ highPipe: true }),
        name: 'Driftwood Scrambler',
        type: 'BIKE',
        model: 'bike_driftwood.glb',
        description: 'A high-bar scrambler with a broad front plate and a stable stance on rough roads.',
        stats: { speed: 4, acceleration: 4, handling: 5, armor: 3 },
        defaultPaint: 0xe1a333
    },
    {
        id: 'bike_solstice',
        dims: bikeDims(),
        name: 'Solstice Endurance',
        type: 'BIKE',
        model: 'bike_solstice.glb',
        description: 'A faired endurance machine with side winglets and a strong mid-range pull.',
        stats: { speed: 5, acceleration: 5, handling: 4, armor: 2 },
        defaultPaint: 0xe8e7dc
    },
    {
        id: 'car_apex_gp',
        dims: carDims({ wheelbase: 2.66, track: 0.795, radius: 0.345, length: 4.52, width: 1.93, roof: 1.27, cabin: [-1.45, 0.94], cabinWidth: 0.74 }),
        name: 'Apex GT',
        type: 'CAR',
        model: 'car_apex_gp.glb',
        description: 'A front-engined sports coupe: balanced, quick and happy to slide.',
        stats: { speed: 5, acceleration: 4, handling: 4, armor: 3 },
        defaultPaint: 0xe83e2d
    },
    {
        id: 'car_vector_gp',
        dims: carDims({ wheelbase: 2.56, track: 0.795, radius: 0.33, length: 4.11, width: 1.91, roof: 1.42, cabin: [-1.8, 0.9], cabinWidth: 0.76 }),
        name: 'Vector RS',
        type: 'CAR',
        model: 'car_vector_gp.glb',
        description: 'A hot hatch: short, light on its feet and sharp into every corner.',
        stats: { speed: 4, acceleration: 5, handling: 5, armor: 3 },
        defaultPaint: 0x138e7a
    },
    {
        id: 'car_emberline_gp',
        dims: carDims({ wheelbase: 2.84, track: 0.8, radius: 0.355, length: 4.82, width: 1.96, roof: 1.33, cabin: [-1.55, 0.62], cabinWidth: 0.78 }),
        name: 'Emberline V8',
        type: 'CAR',
        model: 'car_emberline_gp.glb',
        description: 'A long-bonnet muscle car with strong corner exits and a tough shell.',
        stats: { speed: 4, acceleration: 5, handling: 5, armor: 4 },
        defaultPaint: 0xe1a333
    },
    {
        id: 'car_northstar_gp',
        dims: carDims({ wheelbase: 2.7, track: 0.815, radius: 0.35, length: 4.56, width: 2.0, roof: 1.16, cabin: [-1.25, 1.12], cabinWidth: 0.72 }),
        name: 'Northstar S',
        type: 'CAR',
        model: 'car_northstar_gp.glb',
        description: 'A low, wide mid-engined supercar: the fastest machine in the league.',
        stats: { speed: 5, acceleration: 4, handling: 4, armor: 4 },
        defaultPaint: 0x176bdb
    }
];

export const ROAD_TRACKS = [
    {
        id: 'downtown_circuit',
        city: true,
        name: 'Meridian Downtown',
        region: 'Meridian City',
        biome: 'DOWNTOWN GRID',
        grade: 'INTERMEDIATE',
        description: 'Six hard corners through the downtown blocks at dusk, with a park run under the trees.',
        laps: 3,
        jumpProgress: [],
        tone: '#f2a65a',
        sky: '#7f8ea3'
    },
    {
        id: 'harbour_docks',
        city: true,
        name: 'Saltgate Docks',
        region: 'Meridian City',
        biome: 'HARBOUR FRONT',
        grade: 'NOVICE',
        description: 'A long quayside straight past the warehouses, then a sweep back through the yards.',
        laps: 3,
        jumpProgress: [],
        tone: '#6fb6c9',
        sky: '#7f8ea3'
    },
    {
        id: 'hillside_suburbs',
        city: true,
        name: 'Larkhill Rise',
        region: 'Meridian City',
        biome: 'HILLSIDE SUBURBS',
        grade: 'ADVANCED',
        description: 'Eight corners over rolling hills between low houses and tree-lined streets.',
        laps: 3,
        jumpProgress: [],
        tone: '#9bc46a',
        sky: '#7f8ea3'
    },
    {
        id: 'industrial_zone',
        city: true,
        name: 'Foundry Row',
        region: 'Meridian City',
        biome: 'INDUSTRIAL ZONE',
        grade: 'INTERMEDIATE',
        description: 'Square corners between the factories, with a tight dog-leg through the loading yards.',
        laps: 3,
        jumpProgress: [],
        tone: '#d97a4a',
        sky: '#7f8ea3'
    },
    {
        id: 'park_boulevard',
        city: true,
        name: 'Elmwood Boulevard',
        region: 'Meridian City',
        biome: 'PARK BOULEVARD',
        grade: 'NOVICE',
        description: 'Wide, flowing bends through the city park, under trees almost all the way round.',
        laps: 3,
        jumpProgress: [],
        tone: '#7fcf8f',
        sky: '#7f8ea3'
    },
    {
        id: 'highway_ring',
        city: true,
        name: 'Orbital Ring',
        region: 'Meridian City',
        biome: 'HIGHWAY RING',
        grade: 'EXPERT',
        description: 'Two kilometres of flat-out ring road beneath the glass towers. Top speed decides it.',
        laps: 2,
        jumpProgress: [],
        tone: '#8aa4ff',
        sky: '#7f8ea3'
    },
    {
        id: 'crosstown_sprint',
        city: true,
        name: 'Crosstown Sprint',
        region: 'Meridian City',
        biome: 'CITY SPRINT',
        grade: 'ADVANCED',
        description: 'Three kilometres across the whole city in one lap. Eleven corners, none of them twice.',
        laps: 1,
        jumpProgress: [],
        tone: '#f08a5d',
        sky: '#7f8ea3'
    },
    {
        id: 'riverside_sprint',
        city: true,
        name: 'Riverside Sprint',
        region: 'Meridian City',
        biome: 'PARKLAND SPRINT',
        grade: 'INTERMEDIATE',
        description: 'A single fast lap of sweeping bends through the riverside parks.',
        laps: 1,
        jumpProgress: [],
        tone: '#5fbf9a',
        sky: '#7f8ea3'
    },
    {
        id: 'rovers_rift',
        name: 'Highpoint Switchbacks',
        region: 'Kestrel Highlands',
        biome: 'ALPINE RIDGE',
        grade: 'ADVANCED',
        description: 'Blind crests, broken rock, and a wide jump above the valley.',
        laps: 2,
        jumpProgress: [0.31, 0.77],
        tone: '#e9854c',
        sky: '#a6c7dc'
    },
    {
        id: 'canyon_springs',
        name: 'Copper Basin Run',
        region: 'Copper Basin',
        biome: 'REDSTONE CANYON',
        grade: 'INTERMEDIATE',
        description: 'Fast sweepers thread through a sunlit sandstone gorge.',
        laps: 3,
        jumpProgress: [0.54],
        tone: '#de9c56',
        sky: '#edbd86'
    },
    {
        id: 'jungle_falls',
        name: 'Verdant Falls Loop',
        region: 'Greenveil Reserve',
        biome: 'RAINFOREST',
        grade: 'NOVICE',
        description: 'A damp forest circuit beneath a high cascade and mossy cliffs.',
        laps: 3,
        jumpProgress: [0.39],
        tone: '#57b69d',
        sky: '#91d4c6'
    },
    {
        id: 'sunset_shores',
        name: 'Sunline Causeway',
        region: 'South Cape',
        biome: 'COASTAL ROAD',
        grade: 'NOVICE',
        description: 'A bright sea-level sprint with long views and changing camber.',
        laps: 3,
        jumpProgress: [0.66],
        tone: '#48a8b7',
        sky: '#f5aa7d'
    },
    {
        id: 'frost_harbor',
        name: 'Frostline Express',
        region: 'North Harbor',
        biome: 'GLACIAL COAST',
        grade: 'ADVANCED',
        description: 'A fast frozen loop where grip fades over shaded corners.',
        laps: 3,
        jumpProgress: [0.28],
        tone: '#6ba3c2',
        sky: '#bbd8e8'
    },
    {
        id: 'rivet_factory',
        name: 'Foundry District',
        region: 'East Works',
        biome: 'INDUSTRIAL NIGHT',
        grade: 'INTERMEDIATE',
        description: 'Service roads weave beneath steel gantries and glowing race lights.',
        laps: 3,
        jumpProgress: [0.72],
        tone: '#f06c3e',
        sky: '#526779'
    },
    {
        id: 'coral_bay',
        name: 'Breakwater Sprint',
        region: 'Coral Bay',
        biome: 'ISLAND COAST',
        grade: 'NOVICE',
        description: 'A short, high-speed loop past pale sand and open water.',
        laps: 3,
        jumpProgress: [0.34],
        tone: '#46bac1',
        sky: '#a9e6e5'
    },
    {
        id: 'ember_crater',
        name: 'Ashfall Ring',
        region: 'Morrow Crater',
        biome: 'VOLCANIC SLOPE',
        grade: 'EXPERT',
        description: 'A technical highland loop with dark rock and a sharp downhill finish.',
        laps: 2,
        jumpProgress: [0.59],
        tone: '#e45235',
        sky: '#d08b70'
    }
];

export const ROAD_RIVALS = [
    { name: 'Mara Vale', crew: 'GRIDBREAKERS', paint: 0xf1bd42 },
    { name: 'Kade Rook', crew: 'GRIDBREAKERS', paint: 0x262e39 },
    { name: 'Juniper Flux', crew: 'NIGHT SHIFT', paint: 0x9a42b4 },
    { name: 'Talon Grey', crew: 'NIGHT SHIFT', paint: 0xc9d9e2 },
    { name: 'Sera Quill', crew: 'WILDLINES', paint: 0x3eb6a2 },
    { name: 'Brass Calder', crew: 'WILDLINES', paint: 0xe56c25 },
    { name: 'Niko Voss', crew: 'FREE AGENTS', paint: 0x286ce1 },
    { name: 'Ivy Strake', crew: 'FREE AGENTS', paint: 0xd54567 }
];

export const PAINT_COLORS = [
    { name: 'Signal Red', color: 0xe83e2d },
    { name: 'Ion Blue', color: 0x176bdb },
    { name: 'Acid Lime', color: 0xb3d629 },
    { name: 'Burnt Gold', color: 0xe1a333 },
    { name: 'Deep Teal', color: 0x138e7a },
    { name: 'Carbon', color: 0x272d35 },
    { name: 'Chalk', color: 0xe8e7dc },
    { name: 'Hot Magenta', color: 0xd83087 }
];


// Upgrades, bought with credits (prices in data/career.js). Every level is a real physics
// change (see physics/specs.js).
export const UPGRADES = [
    { key: 'speed', label: 'TOP SPEED', short: 'SPD', detail: 'Raises top speed on the straights.', perLevel: '+2 m/s (+8 km/h)' },
    { key: 'accel', label: 'ACCELERATION', short: 'ACC', detail: 'More engine thrust out of every corner.', perLevel: '+8% thrust' },
    { key: 'handling', label: 'HANDLING', short: 'HND', detail: 'Sticky tyres and sharper steering.', perLevel: '+4% grip' },
    { key: 'nitro', label: 'NITRO', short: 'NOS', detail: 'Stronger, longer blue-flame boost.', perLevel: '+6% power' },
    { key: 'armor', label: 'ARMOR', short: 'ARM', detail: 'Soaks up crashes and takedowns.', perLevel: '-6% damage' }
];
export const UPGRADE_MAX_LEVEL = 5;

// Rival personalities: how hard each one pushes, blocks and rams.
export const RIVAL_PROFILES = [
    { aggression: 0.95, skill: 1.03 },
    { aggression: 0.85, skill: 1.01 },
    { aggression: 0.7, skill: 1.0 },
    { aggression: 0.8, skill: 0.99 },
    { aggression: 0.6, skill: 0.98 },
    { aggression: 0.9, skill: 0.97 },
    { aggression: 0.75, skill: 0.96 },
    { aggression: 0.65, skill: 0.95 }
];

export const GRADE_PACE = { NOVICE: 0.9, INTERMEDIATE: 0.96, ADVANCED: 1.02, EXPERT: 1.08 };
