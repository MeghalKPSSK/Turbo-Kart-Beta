// ========================================
// TURBO KART RACING - Game Constants
// ========================================

export const GAME_CONSTANTS = {
    // Game Info
    GAME_NAME: 'Turbo Kart Racing',
    VERSION: '1.0.0',
    
    // Physics Constants
    PHYSICS: {
        GRAVITY: -30,
        FRICTION_GROUND: 0.98,
        FRICTION_AIR: 0.995,
        FRICTION_WATER: 0.92,
        MAX_SPEED_BASE: 120,
        ACCELERATION_BASE: 45,
        BRAKE_FORCE: 80,
        TURN_SPEED_BASE: 3.5,
        DRIFT_FACTOR: 0.7,
        DRIFT_ANGLE_BOOST: 0.3,
        BOUNCE_FACTOR: 0.5,
        ANTI_GRAVITY_BOOST: 1.15,
        WATER_SPEED_MODIFIER: 0.85,
        GLIDE_LIFT: 0.5,
        GLIDE_DRAG: 0.02,
        COIN_SPEED_BONUS: 0.01,
        MAX_COINS: 10
    },
    
    // Engine Classes
    ENGINE_CLASSES: {
        '50cc': { speedMod: 0.7, accelMod: 1.0, name: '50cc', difficulty: 'Easy' },
        '100cc': { speedMod: 0.85, accelMod: 1.1, name: '100cc', difficulty: 'Normal' },
        '150cc': { speedMod: 1.0, accelMod: 1.2, name: '150cc', difficulty: 'Hard' },
        'mirror': { speedMod: 1.0, accelMod: 1.2, mirrored: true, name: 'Mirror', difficulty: 'Expert' },
        '200cc': { speedMod: 1.3, accelMod: 1.5, name: '200cc', difficulty: 'Extreme' }
    },
    
    // Drift & Boost
    DRIFT: {
        MIN_TIME_MINI: 0.8,
        MIN_TIME_SUPER: 1.8,
        MIN_TIME_ULTRA: 3.0,
        BOOST_MINI: 1.2,
        BOOST_SUPER: 1.4,
        BOOST_ULTRA: 1.6,
        BOOST_DURATION_MINI: 0.8,
        BOOST_DURATION_SUPER: 1.2,
        BOOST_DURATION_ULTRA: 1.8
    },
    
    // Item System
    ITEMS: {
        SLOTS: 2,
        ROULETTE_TIME: 2.0,
        ITEM_PROBABILITY: {
            'banana': [30, 25, 20, 15, 10, 8, 5, 3, 2, 1, 0, 0],
            'green_shell': [25, 25, 20, 15, 12, 10, 8, 5, 3, 2, 1, 0],
            'red_shell': [0, 10, 15, 18, 20, 20, 18, 15, 12, 10, 8, 5],
            'mushroom': [0, 5, 10, 15, 18, 20, 22, 22, 20, 18, 15, 12],
            'triple_mushroom': [0, 0, 2, 5, 8, 12, 15, 18, 20, 22, 22, 20],
            'star': [0, 0, 0, 2, 4, 6, 10, 15, 18, 20, 22, 25],
            'bullet_bill': [0, 0, 0, 0, 2, 4, 6, 10, 15, 20, 25, 30],
            'blue_shell': [0, 0, 0, 0, 0, 2, 4, 6, 8, 10, 12, 15],
            'lightning': [0, 0, 0, 0, 0, 0, 2, 4, 6, 8, 10, 12],
            'coin': [15, 20, 18, 15, 12, 8, 5, 3, 2, 1, 0, 0],
            'super_horn': [10, 8, 6, 5, 4, 3, 2, 2, 1, 1, 0, 0],
            'boomerang': [5, 5, 6, 7, 8, 8, 7, 6, 5, 4, 3, 2],
            'piranha_plant': [5, 5, 8, 10, 12, 12, 10, 8, 6, 4, 2, 1],
            'blooper': [0, 2, 5, 8, 10, 10, 8, 6, 4, 2, 1, 0],
            'bob_omb': [10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 8, 5],
            'golden_mushroom': [0, 0, 0, 0, 2, 4, 8, 12, 15, 18, 20, 20],
            'fire_flower': [0, 5, 8, 10, 10, 10, 8, 6, 4, 2, 1, 0],
            'feather': [0, 0, 2, 5, 8, 10, 8, 6, 4, 2, 1, 0]
        }
    },
    
    // Race Settings
    RACE: {
        DEFAULT_LAPS: 3,
        COUNTDOWN_TIME: 3,
        MAX_PLAYERS: 12,
        MAX_LOCAL_PLAYERS: 4,
        RESPAWN_TIME: 2,
        INVINCIBILITY_TIME: 3,
        LAP_NOTIFICATION_TIME: 2
    },
    
    // Battle Mode
    BATTLE: {
        DEFAULT_TIME: 180,
        BALLOON_COUNT: 5,
        SHINE_HOLD_TIME: 20,
        RESPAWN_TIME: 3
    },
    
    // Audio
    AUDIO: {
        MUSIC_VOLUME: 0.8,
        SFX_VOLUME: 0.8,
        FADE_TIME: 1.0
    },
    
    // Graphics
    GRAPHICS: {
        LOW: { shadowMapSize: 512, antialias: false, pixelRatio: 1 },
        MEDIUM: { shadowMapSize: 1024, antialias: true, pixelRatio: 1 },
        HIGH: { shadowMapSize: 2048, antialias: true, pixelRatio: typeof window !== 'undefined' ? window.devicePixelRatio : 1 },
        ULTRA: { shadowMapSize: 4096, antialias: true, pixelRatio: typeof window !== 'undefined' ? window.devicePixelRatio : 1 }
    },
    
    // Controls
    CONTROLS: {
        KEYBOARD_P1: {
            accelerate: ['KeyW', 'ArrowUp'],
            brake: ['KeyS', 'ArrowDown'],
            left: ['KeyA', 'ArrowLeft'],
            right: ['KeyD', 'ArrowRight'],
            drift: ['Space'],
            boost: ['ShiftLeft', 'ShiftRight'],
            useItem: [],
            lookBack: ['KeyX'],
            pause: ['Escape']
        },
        KEYBOARD_P2: {
            accelerate: ['KeyI'],
            brake: ['KeyK'],
            left: ['KeyJ'],
            right: ['KeyL'],
            drift: ['KeyU'],
            useItem: ['KeyO'],
            lookBack: ['KeyP'],
            pause: ['Escape']
        },
        GAMEPAD: {
            accelerate: 7,
            brake: 6,
            drift: 5,
            useItem: 0,
            lookBack: 1,
            pause: 9
        }
    },
    
    // Cups
    CUPS: [
        { id: 'mushroom', name: 'Mushroom Cup', icon: '🍄', tracks: ['luigi_circuit', 'moo_moo_meadows', 'mushroom_gorge', 'toads_factory'] },
        { id: 'flower', name: 'Flower Cup', icon: '🌸', tracks: ['mario_circuit', 'coconut_mall', 'dk_summit', 'warios_gold_mine'] },
        { id: 'star', name: 'Star Cup', icon: '⭐', tracks: ['daisy_circuit', 'koopa_cape', 'maple_treeway', 'grumble_volcano'] },
        { id: 'special', name: 'Special Cup', icon: '👑', tracks: ['dry_dry_ruins', 'moonview_highway', 'bowsers_castle', 'rainbow_road'] },
        { id: 'shell', name: 'Shell Cup', icon: '🐚', tracks: ['gcn_peach_beach', 'ds_yoshi_falls', 'snes_ghost_valley', 'n64_mario_raceway'] },
        { id: 'banana', name: 'Banana Cup', icon: '🍌', tracks: ['n64_sherbet_land', 'gba_shy_guy_beach', 'ds_delfino_square', 'gcn_waluigi_stadium'] },
        { id: 'leaf', name: 'Leaf Cup', icon: '🍃', tracks: ['ds_desert_hills', 'gba_bowser_castle', 'n64_dks_jungle', 'gcn_mario_circuit'] },
        { id: 'lightning', name: 'Lightning Cup', icon: '⚡', tracks: ['snes_mario_circuit', 'ds_peach_gardens', 'gcn_dk_mountain', 'n64_bowsers_castle'] }
    ],
    
    // Character Weight Classes
    WEIGHT_CLASSES: {
        FEATHER: { speedMod: 0.9, accelMod: 1.2, weightMod: 0.7, handlingMod: 1.15 },
        LIGHT: { speedMod: 0.95, accelMod: 1.1, weightMod: 0.85, handlingMod: 1.1 },
        MEDIUM: { speedMod: 1.0, accelMod: 1.0, weightMod: 1.0, handlingMod: 1.0 },
        CRUISER: { speedMod: 1.05, accelMod: 0.95, weightMod: 1.1, handlingMod: 0.95 },
        HEAVY: { speedMod: 1.1, accelMod: 0.85, weightMod: 1.25, handlingMod: 0.85 }
    },
    
    // Colors
    COLORS: {
        DRIFT_BLUE: 0x4444ff,
        DRIFT_ORANGE: 0xff8800,
        DRIFT_PURPLE: 0xff00ff,
        STAR: 0xffdd00,
        BULLET: 0x333333,
        COIN: 0xffd700,
        BOOST_PAD: 0xff4400,
        ANTI_GRAVITY: 0x8a2be2,
        UNDERWATER: 0x0096ff
    }
};

export default GAME_CONSTANTS;
