// Physical dimensions measured from the Blender models (metres, vehicle space: +Z forward,
// +Y up, origin on the ground between the wheels). `tools/sim/verify-assets.mjs` re-checks
// these numbers against the exported GLB files.
const carDims = (frontZ, rearZ, frontR, rearR) => ({
    wheelbase: frontZ - rearZ,
    wheels: [
        { name: 'FL', x: 1.04, y: frontR, z: frontZ, radius: frontR, steered: true, driven: true, front: true },
        { name: 'FR', x: -1.04, y: frontR, z: frontZ, radius: frontR, steered: true, driven: true, front: true },
        { name: 'RL', x: 1.12, y: rearR, z: rearZ, radius: rearR, steered: false, driven: true, front: false },
        { name: 'RR', x: -1.12, y: rearR, z: rearZ, radius: rearR, steered: false, driven: true, front: false }
    ],
    // `parts` are extra, massless collision boxes that cover what stands above the tub (the
    // cockpit / halo column and the rear wing), so a flipped car rests on them instead of
    // sinking into the road. verify-assets checks them against the model.
    body: {
        half: [1.2, 0.32, 2.05],
        center: [0, 0.82, 0.2],
        parts: [
            { half: [0.5, 0.52, 0.7], center: [0, 1.55, 0.2] },     // cockpit, halo and airbox
            { half: [0.5, 0.45, 0.55], center: [0, 1.35, -0.9] },   // engine cover
            { half: [1.25, 0.27, 0.32], center: [0, 1.8, -1.8] }    // rear wing
        ]
    },
    comHeight: 0.4,
    mass: 1000,
    length: 4.24,
    width: 2.7,
    exhausts: [{ x: 0.2, y: 0.74, z: -1.86 }, { x: -0.2, y: 0.74, z: -1.86 }]
});

// Bikes are simulated on four narrow, all-wheel-driven contact points so they stay upright
// and keep traction; the model leans visually into corners.
const bikeDims = (radius) => ({
    wheelbase: 2.13,
    wheels: [
        { name: 'FL', x: 0.3, y: radius, z: 1.08, radius, steered: true, driven: true, front: true },
        { name: 'FR', x: -0.3, y: radius, z: 1.08, radius, steered: true, driven: true, front: true },
        { name: 'RL', x: 0.3, y: radius, z: -1.05, radius, steered: false, driven: true, front: false },
        { name: 'RR', x: -0.3, y: radius, z: -1.05, radius, steered: false, driven: true, front: false }
    ],
    body: {
        half: [0.36, 0.55, 1.4],
        center: [0, 1.0, 0],
        parts: [
            { half: [0.3, 0.27, 0.5], center: [0, 1.8, 0.15] },     // rider
            { half: [0.3, 0.12, 1.2], center: [0, 1.62, 0] }        // tank, screen and tail
        ]
    },
    comHeight: 0.55,
    mass: 460,
    length: 3.3,
    width: 1.16,
    exhausts: [{ x: 0.2, y: 0.62, z: -1.3 }, { x: -0.2, y: 0.62, z: -1.3 }]
});

export const ROAD_VEHICLES = [
    {
        id: 'bike_nightjar',
        dims: bikeDims(0.58),
        name: 'Nightjar Streetfighter',
        type: 'BIKE',
        model: 'bike_nightjar.glb',
        description: 'A compact naked bike built to dive inside on tight canyon turns.',
        stats: { speed: 5, acceleration: 5, handling: 5, armor: 2 },
        defaultPaint: 0xe83e2d
    },
    {
        id: 'bike_vector',
        dims: bikeDims(0.58),
        name: 'Vector Trackbike',
        type: 'BIKE',
        model: 'bike_vector.glb',
        description: 'Full fairings and a long pull make this the fastest bike on the straights.',
        stats: { speed: 5, acceleration: 4, handling: 4, armor: 2 },
        defaultPaint: 0x176bdb
    },
    {
        id: 'bike_driftwood',
        dims: bikeDims(0.64),
        name: 'Driftwood Scrambler',
        type: 'BIKE',
        model: 'bike_driftwood.glb',
        description: 'A high-bar scrambler with a broad front plate and a stable stance on rough roads.',
        stats: { speed: 4, acceleration: 4, handling: 5, armor: 3 },
        defaultPaint: 0xe1a333
    },
    {
        id: 'bike_solstice',
        dims: bikeDims(0.58),
        name: 'Solstice Endurance',
        type: 'BIKE',
        model: 'bike_solstice.glb',
        description: 'A faired endurance machine with side winglets and a strong mid-range pull.',
        stats: { speed: 5, acceleration: 5, handling: 4, armor: 2 },
        defaultPaint: 0xe8e7dc
    },
    {
        id: 'car_apex_gp',
        dims: carDims(1.209, -1.246, 0.49, 0.51),
        name: 'Apex Grand Prix',
        type: 'CAR',
        model: 'car_apex_gp.glb',
        description: 'An open-wheel single-seater with a low nose, broad wings, and a cockpit driver.',
        stats: { speed: 5, acceleration: 4, handling: 4, armor: 3 },
        defaultPaint: 0xe83e2d
    },
    {
        id: 'car_vector_gp',
        dims: carDims(1.209, -1.246, 0.5, 0.52),
        name: 'Vector Grand Prix',
        type: 'CAR',
        model: 'car_vector_gp.glb',
        description: 'A sharp, compact formula racer tuned for quick direction changes and clean exits.',
        stats: { speed: 4, acceleration: 5, handling: 5, armor: 3 },
        defaultPaint: 0x138e7a
    },
    {
        id: 'car_emberline_gp',
        dims: carDims(1.283, -1.321, 0.49, 0.52),
        name: 'Emberline Grand Prix',
        type: 'CAR',
        model: 'car_emberline_gp.glb',
        description: 'A broad-winged formula racer with a short wheelbase and strong corner exit.',
        stats: { speed: 4, acceleration: 5, handling: 5, armor: 4 },
        defaultPaint: 0xe1a333
    },
    {
        id: 'car_northstar_gp',
        dims: carDims(1.283, -1.321, 0.5, 0.51),
        name: 'Northstar Grand Prix',
        type: 'CAR',
        model: 'car_northstar_gp.glb',
        description: 'A narrow-nose single-seater built for stable high-speed runs and clean braking.',
        stats: { speed: 5, acceleration: 4, handling: 4, armor: 4 },
        defaultPaint: 0x176bdb
    }
];

export const ROAD_TRACKS = [
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

export const ROAD_CAMPAIGN = [
    { id: 'first-light', title: 'First Light', trackId: 'sunset_shores', crew: 'GRIDBREAKERS', rival: 'Mara Vale', goal: 3, chapter: 'Earn your place on the coast road.', briefing: 'A clean top-three finish puts the rookie crew on the league map.' },
    { id: 'ridge-runner', title: 'Ridge Runner', trackId: 'rovers_rift', crew: 'GRIDBREAKERS', rival: 'Kade Rook', goal: 3, chapter: 'Take the mountain line.', briefing: 'Hold your nerve over the crests and beat the local pace setters.' },
    { id: 'copper-line', title: 'Copper Line', trackId: 'canyon_springs', crew: 'NIGHT SHIFT', rival: 'Juniper Flux', goal: 3, chapter: 'The Night Shift wants the canyon.', briefing: 'The redstone run is narrow. Collect nitro and stay planted through the sweepers.' },
    { id: 'green-veil', title: 'Green Veil', trackId: 'jungle_falls', crew: 'NIGHT SHIFT', rival: 'Talon Grey', goal: 3, chapter: 'Make the waterfall run yours.', briefing: 'Wet-looking scenery hides a fast road. Keep your line and finish on the podium.' },
    { id: 'breakwater', title: 'Breakwater', trackId: 'coral_bay', crew: 'WILDLINES', rival: 'Sera Quill', goal: 2, chapter: 'Wildlines raise the stakes.', briefing: 'A second-place finish is enough to earn an invite to the highlands.' },
    { id: 'frostbite', title: 'Frostbite', trackId: 'frost_harbor', crew: 'WILDLINES', rival: 'Brass Calder', goal: 2, chapter: 'Grip beats bravado.', briefing: 'The cold course punishes late steering. Beat the crew and keep the car on asphalt.' },
    { id: 'after-hours', title: 'After Hours', trackId: 'rivet_factory', crew: 'FREE AGENTS', rival: 'Ivy Strake', goal: 1, chapter: 'The league night race.', briefing: 'Win under the foundry lights to claim a place in the final.' },
    { id: 'ashfall-crown', title: 'Ashfall Crown', trackId: 'ember_crater', crew: 'CHAMPIONSHIP', rival: 'Niko Voss', goal: 1, chapter: 'One last run for the road crown.', briefing: 'Take first on the volcanic ridge and become Turbo Road League champion.' }
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


// Coin-funded upgrades. Every level is a real physics change (see physics/specs.js).
export const UPGRADES = [
    { key: 'speed', label: 'TOP SPEED', short: 'SPD', detail: 'Raises top speed on the straights.', perLevel: '+2 m/s (+8 km/h)' },
    { key: 'accel', label: 'ACCELERATION', short: 'ACC', detail: 'More engine thrust out of every corner.', perLevel: '+8% thrust' },
    { key: 'handling', label: 'HANDLING', short: 'HND', detail: 'Sticky tyres and sharper steering.', perLevel: '+4% grip' },
    { key: 'nitro', label: 'NITRO', short: 'NOS', detail: 'Stronger, longer blue-flame boost.', perLevel: '+6% power' },
    { key: 'armor', label: 'ARMOR', short: 'ARM', detail: 'Soaks up crashes and takedowns.', perLevel: '-6% damage' }
];
export const UPGRADE_MAX_LEVEL = 5;
export const UPGRADE_COSTS = [30, 60, 100, 160, 240];

export const upgradeCost = (level) => (level >= UPGRADE_MAX_LEVEL ? Infinity : UPGRADE_COSTS[level]);

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
