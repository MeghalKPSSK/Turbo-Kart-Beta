// The player's saved career: credits, records, story progress and per-vehicle upgrades.

const PROFILE_KEY = 'turbo-road-league-profile-v2';
const LEGACY_PROFILE_KEY = 'turbo-road-league-profile-v1';

export const freshProfile = () => ({
    credits: 1200, races: 0, wins: 0, bestFinish: 9, bestTime: null, bestScore: 0, totalPoints: 0,
    roadCoins: 0, storyStage: 0, storyComplete: false, takedowns: 0, garage: {}
});

export function loadProfile() {
    try {
        const stored = localStorage.getItem(PROFILE_KEY);
        if (stored) return { ...freshProfile(), ...JSON.parse(stored) };
        const legacy = localStorage.getItem(LEGACY_PROFILE_KEY);
        if (legacy) {
            // Version 1 shared three global tunes; refund their coins at the new, larger scale.
            const old = JSON.parse(legacy);
            const spent = Object.values(old.tunes || {}).reduce((sum, level) => sum + [0, 4, 11, 21][Math.min(3, Number(level) || 0)], 0);
            const rest = { ...old };
            delete rest.tunes;
            return { ...freshProfile(), ...rest, roadCoins: (old.roadCoins || 0) + spent * 8 };
        }
    } catch {
        // fall through to a fresh profile
    }
    return freshProfile();
}

export function saveProfile(profile) {
    try {
        localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
    } catch {
        // Storage can be full or blocked (private windows); the game still plays.
    }
}
