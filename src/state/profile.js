// The player's save: credits, driver experience, owned vehicles and upgrades, career stars,
// cups and records. Version 3 has one currency (credits); older saves are converted on load.

import {
    CAREER_TIERS, CUPS, CUP_POINTS, STARTER_VEHICLES, UPGRADE_PRICES, VEHICLE_PRICES,
    driverLevel, scoreEvent, starBonus
} from '../game/data/career.js';
import { UPGRADE_MAX_LEVEL } from '../game/data/roadRacing.js';

const PROFILE_KEY = 'turbo-road-league-profile-v3';
const V2_KEY = 'turbo-road-league-profile-v2';
const V1_KEY = 'turbo-road-league-profile-v1';

export const freshProfile = () => ({
    version: 3, credits: 2000, xp: 0,
    races: 0, wins: 0, bestFinish: 9, bestTime: null, bestScore: 0, totalPoints: 0, takedowns: 0,
    owned: [...STARTER_VEHICLES], garage: {}, stars: {}, bosses: [], cups: {}, activeCup: null
});

// Version 2 had a second currency (road coins, spent on upgrades) and the old eight-chapter
// story. Coins become credits and upgraded vehicles stay owned; story progress has no
// equivalent in the career and is dropped.
function fromV2(old) {
    const garage = old.garage || {};
    return {
        ...freshProfile(),
        credits: (old.credits || 0) + (old.roadCoins || 0) * 40,
        xp: Math.round((old.totalPoints || 0) / 10),
        races: old.races || 0, wins: old.wins || 0, bestFinish: old.bestFinish ?? 9, bestTime: old.bestTime ?? null,
        bestScore: old.bestScore || 0, totalPoints: old.totalPoints || 0, takedowns: old.takedowns || 0,
        owned: [...new Set([...STARTER_VEHICLES, ...Object.keys(garage)])], garage
    };
}

function fromV1(old) {
    const spent = Object.values(old.tunes || {}).reduce((sum, level) => sum + [0, 4, 11, 21][Math.min(3, Number(level) || 0)], 0);
    return fromV2({ ...old, garage: {}, roadCoins: (old.roadCoins || 0) + spent * 8 });
}

export function loadProfile() {
    try {
        const stored = localStorage.getItem(PROFILE_KEY);
        if (stored) return { ...freshProfile(), ...JSON.parse(stored) };
        const v2 = localStorage.getItem(V2_KEY);
        if (v2) return fromV2(JSON.parse(v2));
        const v1 = localStorage.getItem(V1_KEY);
        if (v1) return fromV1(JSON.parse(v1));
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

// ----------------------------------------------------------------------------- garage

export const ownsVehicle = (profile, id) => profile.owned.includes(id);
export const upgradePrice = (level) => (level >= UPGRADE_MAX_LEVEL ? Infinity : UPGRADE_PRICES[level]);

export function buyVehicle(profile, id) {
    const price = VEHICLE_PRICES[id] ?? Infinity;
    if (ownsVehicle(profile, id) || profile.credits < price) return profile;
    return { ...profile, credits: profile.credits - price, owned: [...profile.owned, id] };
}

export function buyUpgrade(profile, vehicleId, key) {
    const level = profile.garage?.[vehicleId]?.[key] || 0;
    const price = upgradePrice(level);
    if (!ownsVehicle(profile, vehicleId) || profile.credits < price) return profile;
    return {
        ...profile,
        credits: profile.credits - price,
        garage: { ...profile.garage, [vehicleId]: { ...(profile.garage?.[vehicleId] || {}), [key]: level + 1 } }
    };
}

// ----------------------------------------------------------------------------- cups

export function startCup(profile, cupId) {
    return { ...profile, activeCup: { id: cupId, round: 0, points: {} } };
}

export const abandonCup = (profile) => ({ ...profile, activeCup: null });

// Standings table, best first. The player is listed as "YOU".
export function cupTable(points) {
    return Object.entries(points).map(([name, score]) => ({ name, score, isPlayer: name === 'YOU' }))
        .sort((a, b) => b.score - a.score || (a.isPlayer ? -1 : 1));
}

// ----------------------------------------------------------------------------- results

// Applies a finished race to the save. `context` says what the race was:
// { mode: 'career', event } | { mode: 'cup' } | { mode: 'quick' }.
// Returns the new profile and what the result screen should announce.
export function applyRaceResult(profile, result, context) {
    const before = driverLevel(profile.xp).level;
    const next = {
        ...profile,
        credits: profile.credits + result.credits,
        xp: profile.xp + Math.round((result.score || 0) / 10),
        races: profile.races + 1,
        wins: profile.wins + (result.position === 1 ? 1 : 0),
        bestFinish: Math.min(profile.bestFinish, result.position),
        bestTime: result.timedOut || result.busted ? profile.bestTime : profile.bestTime === null ? result.time : Math.min(profile.bestTime, result.time),
        bestScore: Math.max(profile.bestScore || 0, result.score || 0),
        totalPoints: (profile.totalPoints || 0) + (result.score || 0),
        takedowns: (profile.takedowns || 0) + (result.takedowns || 0)
    };
    const summary = { mode: context.mode, payout: result.credits };

    if (context.mode === 'career' && context.event) {
        const item = context.event;
        const tier = CAREER_TIERS[item.tierIndex];
        const scored = scoreEvent(item, result);
        const previous = profile.stars[item.id] || 0;
        const gained = Math.max(0, scored.stars - previous);
        const bonus = starBonus(item, gained);
        next.stars = { ...profile.stars, [item.id]: Math.max(previous, scored.stars) };
        next.credits += bonus;
        summary.payout += bonus;
        Object.assign(summary, { event: item, tier, stars: scored.stars, previousStars: previous, starBonus: bonus, line: scored.summary });
        if (item.type === 'duel') {
            const won = result.position === 1;
            summary.bossLine = won ? tier.defeat : tier.taunt;
            summary.bossName = tier.crew.boss.name;
            if (won && !profile.bosses.includes(tier.id)) {
                next.bosses = [...profile.bosses, tier.id];
                const prize = tier.crew.boss.vehicleId;
                if (!next.owned.includes(prize)) {
                    next.owned = [...next.owned, prize];
                    summary.wonVehicle = prize;
                }
            }
        }
        // A tier that these stars have just opened.
        const total = Object.values(next.stars).reduce((sum, value) => sum + value, 0);
        const had = Object.values(profile.stars).reduce((sum, value) => sum + value, 0);
        summary.unlockedTier = CAREER_TIERS.find((candidate) => candidate.requires > had && candidate.requires <= total) || null;
    }

    if (context.mode === 'cup' && profile.activeCup) {
        const cup = CUPS.find((candidate) => candidate.id === profile.activeCup.id);
        const points = { ...profile.activeCup.points };
        result.standings.forEach((entry, index) => {
            const name = entry.isPlayer ? 'YOU' : entry.name;
            points[name] = (points[name] || 0) + (CUP_POINTS[index] || 0);
        });
        const round = profile.activeCup.round + 1;
        const table = cupTable(points);
        const finished = round >= cup.tracks.length;
        summary.cup = { cup, round, table, finished };
        if (finished) {
            const place = table.findIndex((row) => row.isPlayer) + 1;
            const prize = Math.round(cup.prize * ([1, 0.5, 0.25][place - 1] || 0));
            next.credits += prize;
            summary.payout += prize;
            next.cups = { ...profile.cups, [cup.id]: Math.min(profile.cups[cup.id] || 99, place) };
            next.activeCup = null;
            Object.assign(summary.cup, { place, prize });
        } else {
            next.activeCup = { id: cup.id, round, points };
        }
    }

    const after = driverLevel(next.xp).level;
    if (after > before) summary.levelUp = after;
    return { profile: next, summary };
}
