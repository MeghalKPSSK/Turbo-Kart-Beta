// Player settings: volume, graphics quality, touch controls and key bindings.

const SETTINGS_KEY = 'turbo-road-league-settings-v1';

export const ACTIONS = [
    { id: 'accelerate', label: 'Accelerate' },
    { id: 'brake', label: 'Brake / reverse' },
    { id: 'left', label: 'Steer left' },
    { id: 'right', label: 'Steer right' },
    { id: 'boost', label: 'Nitro' },
    { id: 'drift', label: 'Drift' },
    { id: 'reset', label: 'Reset to track' },
    { id: 'pause', label: 'Pause' }
];

// Inputs the game holds down (everything except the one-shot reset and pause).
export const HELD_ACTIONS = ['accelerate', 'brake', 'left', 'right', 'boost', 'drift'];

export const DEFAULT_KEYS = {
    accelerate: ['w', 'ArrowUp'],
    brake: ['s', 'ArrowDown'],
    left: ['a', 'ArrowLeft'],
    right: ['d', 'ArrowRight'],
    boost: ['Shift'],
    drift: [' '],
    reset: ['r'],
    pause: ['Escape']
};

// What each graphics level costs the renderer.
export const QUALITY_LEVELS = {
    low: { label: 'Low', detail: 'No shadows, lower resolution. For phones and older laptops.', pixelRatio: 1, antialias: false, shadows: 0, particles: 0.5 },
    medium: { label: 'Medium', detail: 'Soft shadows at a moderate resolution.', pixelRatio: 1.5, antialias: true, shadows: 1024, particles: 0.8 },
    high: { label: 'High', detail: 'Sharp shadows and full resolution.', pixelRatio: 1.75, antialias: true, shadows: 2048, particles: 1 }
};

export const TOUCH_MODES = {
    auto: { label: 'Auto', detail: 'Shown on touch screens only.' },
    on: { label: 'Always', detail: 'Always show the on-screen buttons.' },
    off: { label: 'Never', detail: 'Keyboard or gamepad only.' }
};

const cloneKeys = (keys) => Object.fromEntries(ACTIONS.map(({ id }) => [id, [...(keys?.[id] || DEFAULT_KEYS[id])]]));

export const defaultSettings = () => ({ volume: 0.8, quality: 'high', touch: 'auto', keys: cloneKeys(DEFAULT_KEYS) });

export function loadSettings() {
    try {
        const stored = JSON.parse(localStorage.getItem(SETTINGS_KEY) || 'null');
        if (stored) {
            const base = defaultSettings();
            return {
                volume: Number.isFinite(stored.volume) ? Math.min(1, Math.max(0, stored.volume)) : base.volume,
                quality: QUALITY_LEVELS[stored.quality] ? stored.quality : base.quality,
                touch: TOUCH_MODES[stored.touch] ? stored.touch : base.touch,
                keys: cloneKeys(stored.keys)
            };
        }
    } catch {
        // fall through to the defaults
    }
    return defaultSettings();
}

export function saveSettings(settings) {
    try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch {
        // Storage can be blocked; settings then last for this visit only.
    }
}

// One identifier per physical key: letters are case-insensitive, everything else is the key name.
export const keyId = (event) => (event.key.length === 1 ? event.key.toLowerCase() : event.key);

export function keyLabel(key) {
    if (key === ' ') return 'SPACE';
    if (key.startsWith('Arrow')) return { ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→' }[key];
    if (key === 'Escape') return 'ESC';
    return key.toUpperCase();
}

// key -> action lookup for the input handler.
export function keyLookup(keys) {
    const lookup = {};
    for (const { id } of ACTIONS) for (const key of keys[id] || []) lookup[key] = id;
    return lookup;
}

// Binds `key` as the only key for `action`, removing it from any other action. An action that
// would be left with no key gets its default back so the game can always be played.
export function rebindKey(keys, action, key) {
    const next = cloneKeys(keys);
    for (const { id } of ACTIONS) next[id] = next[id].filter((k) => k !== key);
    next[action] = [key];
    for (const { id } of ACTIONS) {
        if (!next[id].length) next[id] = DEFAULT_KEYS[id].filter((k) => !Object.values(next).flat().includes(k));
    }
    return next;
}

export function wantsTouchControls(mode) {
    if (mode === 'on') return true;
    if (mode === 'off' || typeof window === 'undefined') return false;
    return window.matchMedia?.('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
}
