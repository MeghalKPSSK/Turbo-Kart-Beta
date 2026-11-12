// The career: five tiers of six events, each tier run by a rival crew whose boss is the
// last event. Plus the tournaments (cups). Everything here is plain data and pure functions,
// so the scoring rules can be tested without a browser.

import { ROAD_TRACKS, ROAD_VEHICLES } from './roadRacing.js';

export const TRACK_LENGTHS = {
    canyon_springs: 1033, coral_bay: 730, downtown_circuit: 1117, ember_crater: 1149, frost_harbor: 911,
    harbour_docks: 1156, highway_ring: 2176, hillside_suburbs: 1256, industrial_zone: 1303, jungle_falls: 692,
    park_boulevard: 1262, rivet_factory: 971, rovers_rift: 1106, sunset_shores: 740
};

// How each kind of rival drives. `hunter` rivals go looking for the player, `block` rivals
// cover the player's line when ahead, `nitroBias` rivals burn boost far more often.
export const DRIVING_STYLES = {
    clean: { label: 'CLEAN RACER', aggression: 0.45, skill: 1.02 },
    rammer: { label: 'RAMMER', aggression: 1.0, skill: 0.98, hunter: 0.5 },
    blocker: { label: 'BLOCKER', aggression: 0.8, skill: 1.0, block: true },
    gambler: { label: 'NITRO GAMBLER', aggression: 0.6, skill: 0.99, nitroBias: 2.4 },
    ace: { label: 'ACE', aggression: 0.75, skill: 1.05, nitroBias: 1.4 },
    police: { label: 'PURSUIT UNIT', aggression: 1.0, skill: 1.03, hunter: 1 }
};

// The regular field. Bosses are listed with their crews below.
export const ROSTER = [
    { name: 'Kade Rook', paint: 0x262e39, style: 'rammer' },
    { name: 'Talon Grey', paint: 0xc9d9e2, style: 'clean' },
    { name: 'Sera Quill', paint: 0x3eb6a2, style: 'gambler' },
    { name: 'Odile Marsh', paint: 0xb3d629, style: 'blocker' },
    { name: 'Rex Dannet', paint: 0xd83087, style: 'rammer' },
    { name: 'Wren Calloway', paint: 0xe8e7dc, style: 'clean' },
    { name: 'Jax Morrow', paint: 0x7a4fd6, style: 'gambler' },
    { name: 'Petra Lund', paint: 0xe1a333, style: 'blocker' }
];

export const EVENT_TYPES = {
    race: { label: 'CIRCUIT RACE', rule: 'Finish on the podium. First place earns three stars.' },
    timeTrial: { label: 'TIME TRIAL', rule: 'An empty road and the clock. Beat the target times.' },
    elimination: { label: 'ELIMINATION', rule: 'Every 20 seconds the racer in last place is out. Be the last one running.' },
    drift: { label: 'DRIFT SCORE', rule: 'Hold long, fast drifts to score. Position does not matter.' },
    takedown: { label: 'TAKEDOWN HUNT', rule: 'Ram rivals hard enough to wreck them before the clock runs out.' },
    duel: { label: 'BOSS DUEL', rule: 'One on one against the crew boss. Win to take their machine.' },
    pursuit: { label: 'POLICE PURSUIT', rule: 'Finish the run with pursuit units on your tail. Three wrecks and you are busted.' }
};

const event = (id, type, trackId, name, brief, extra = {}) => ({ id, type, trackId, name, brief, ...extra });

export const CAREER_TIERS = [
    {
        id: 'street', name: 'STREET', requires: 0,
        crew: { name: 'DOCKSIDE DRIFTERS', colour: '#6fb6c9', boss: { name: 'Mara Vale', paint: 0xf1bd42, style: 'clean', vehicleId: 'bike_driftwood' } },
        story: 'You roll into Meridian with one machine and no name. The Dockside Drifters run the harbour, and Mara Vale decides who gets a start.',
        taunt: 'Nice and tidy wins down here, rookie. Show me tidy.',
        defeat: 'Clean lap. The docks will remember that. Take the Scrambler, you earned it.',
        events: [
            event('street-1', 'race', 'harbour_docks', 'Quayside Opener', 'Your first start. Stay out of trouble and bring it home in the top three.'),
            event('street-2', 'timeTrial', 'park_boulevard', 'Boulevard Clock', 'No traffic, no excuses. Learn the fast line through the park.'),
            event('street-3', 'race', 'sunset_shores', 'Coast Road Run', 'The Drifters take it out of town. Hit the ramp square and keep your speed.'),
            event('street-4', 'drift', 'downtown_circuit', 'Downtown Slide', 'Six square corners. Hold the handbrake and steer to make them count.', { targets: [500, 1200, 2100] }),
            event('street-5', 'elimination', 'coral_bay', 'Breakwater Knockout', 'Last place goes home every 20 seconds. Do not be last.'),
            event('street-6', 'duel', 'park_boulevard', 'Mara Vale', 'Beat the boss of the docks one on one.')
        ]
    },
    {
        id: 'club', name: 'CLUB', requires: 8,
        crew: { name: 'NIGHT SHIFT', colour: '#9a42b4', boss: { name: 'Juniper Flux', paint: 0x9a42b4, style: 'gambler', vehicleId: 'car_vector_gp' } },
        story: 'Word gets round. The Night Shift race the city after dark and bet everything on boost. Juniper Flux never lifts.',
        taunt: 'Save your nitro if you like. I never have.',
        defeat: 'Out-boosted on my own streets. Fine. The Vector is yours.',
        events: [
            event('club-1', 'race', 'downtown_circuit', 'Downtown After Dark', 'A full grid through the blocks. They will boost every straight.'),
            event('club-2', 'takedown', 'industrial_zone', 'Foundry Fight', 'The Night Shift want you gone. Return the favour.', { targets: [2, 4, 6], timeLimit: 120 }),
            event('club-3', 'timeTrial', 'jungle_falls', 'Waterfall Clock', 'Short, twisting and fast. The ramp is worth taking flat out.'),
            event('club-4', 'race', 'canyon_springs', 'Copper Basin', 'Long sweepers through the canyon. Keep it planted.'),
            event('club-5', 'elimination', 'downtown_circuit', 'Block Party Knockout', 'Nine start. One finishes.'),
            event('club-6', 'duel', 'industrial_zone', 'Juniper Flux', 'One on one through the foundry. She will boost first.')
        ]
    },
    {
        id: 'pro', name: 'PRO', requires: 20,
        crew: { name: 'WILDLINES', colour: '#e56c25', boss: { name: 'Brass Calder', paint: 0xe56c25, style: 'rammer', vehicleId: 'bike_vector' } },
        story: 'The Wildlines do not overtake. They go through you. Brass Calder has wrecked every contender this season.',
        taunt: 'Bring spare parts.',
        defeat: 'Nobody has put me in the wall in years. Take the Trackbike before I change my mind.',
        events: [
            event('pro-1', 'race', 'hillside_suburbs', 'Larkhill Scramble', 'Eight corners over the hills with a field that leans on you.'),
            event('pro-2', 'drift', 'frost_harbor', 'Cold Slide', 'Ice-cold asphalt and long bends. Big angles score big.', { targets: [900, 1800, 2900] }),
            event('pro-3', 'takedown', 'rivet_factory', 'Night Shift Reckoning', 'Hit first and hit hard.', { targets: [3, 5, 7], timeLimit: 120 }),
            event('pro-4', 'race', 'rovers_rift', 'Highpoint Switchbacks', 'Blind crests and two ramps above the valley.'),
            event('pro-5', 'timeTrial', 'hillside_suburbs', 'Hillside Clock', 'Carry speed over the crests. Brake late, not never.'),
            event('pro-6', 'duel', 'frost_harbor', 'Brass Calder', 'He will try to wreck you inside a lap. Stay ahead or stay clear.')
        ]
    },
    {
        id: 'elite', name: 'ELITE', requires: 34,
        crew: { name: 'IRON CIRCUIT', colour: '#286ce1', boss: { name: 'Ivy Strake', paint: 0xd54567, style: 'blocker', vehicleId: 'car_emberline_gp' } },
        story: 'The Iron Circuit hold the ring road, and the city has noticed. Pursuit units now join the party. Ivy Strake has never been passed twice.',
        taunt: 'You can have any line you like. As long as it is behind me.',
        defeat: 'You found the gap. Nobody finds the gap. The Emberline goes with you.',
        events: [
            event('elite-1', 'race', 'highway_ring', 'Orbital Opener', 'Two kilometres flat out. Slipstream and top speed decide it.'),
            event('elite-2', 'pursuit', 'downtown_circuit', 'Heat Downtown', 'Three pursuit units start right behind you. Finish the laps.'),
            event('elite-3', 'elimination', 'hillside_suburbs', 'Larkhill Knockout', 'The hills thin the field for you. Do not be the one thinned.'),
            event('elite-4', 'drift', 'ember_crater', 'Ashfall Slide', 'Fast volcanic sweepers. Hold the slide all the way through.', { targets: [1300, 2500, 3800] }),
            event('elite-5', 'race', 'rivet_factory', 'Foundry Lights', 'A hard, narrow race against the Iron Circuit.'),
            event('elite-6', 'duel', 'highway_ring', 'Ivy Strake', 'She will cover every move on the ring road.')
        ]
    },
    {
        id: 'legend', name: 'LEGEND', requires: 50,
        crew: { name: 'CROWN SYNDICATE', colour: '#f2c27b', boss: { name: 'Niko Voss', paint: 0x286ce1, style: 'ace', vehicleId: 'car_northstar_gp' } },
        story: 'One crew left. The Crown Syndicate have held the league title for five seasons, and Niko Voss has not lost a duel in any of them.',
        taunt: 'Everyone gets this far once. Nobody gets further.',
        defeat: 'The crown is yours. Look after it. Somebody is always coming.',
        events: [
            event('legend-1', 'pursuit', 'highway_ring', 'Ring Road Heat', 'Pursuit units at top speed. Keep moving.'),
            event('legend-2', 'race', 'ember_crater', 'Ashfall Ring', 'The fastest field in the league on the hardest circuit.'),
            event('legend-3', 'takedown', 'rovers_rift', 'Syndicate Purge', 'Clear the mountain.', { targets: [4, 6, 8], timeLimit: 130 }),
            event('legend-4', 'timeTrial', 'highway_ring', 'Orbital Record', 'The lap record is the last thing the Syndicate still own.'),
            event('legend-5', 'elimination', 'canyon_springs', 'Final Knockout', 'Eight of the best. No second chances.'),
            event('legend-6', 'duel', 'ember_crater', 'Niko Voss', 'Beat the champion and the league is yours.')
        ]
    }
];

export const CUP_POINTS = [10, 8, 6, 5, 4, 3, 2, 1, 0];

export const CUPS = [
    { id: 'harbour', name: 'HARBOUR CUP', tier: 0, prize: 4000, tracks: ['harbour_docks', 'coral_bay', 'park_boulevard'], blurb: 'Three quick rounds by the water. A first trophy for a new name.' },
    { id: 'city-lights', name: 'CITY LIGHTS CUP', tier: 1, prize: 8000, tracks: ['downtown_circuit', 'industrial_zone', 'hillside_suburbs', 'park_boulevard'], blurb: 'Four rounds across the city districts.' },
    { id: 'highland', name: 'HIGHLAND CUP', tier: 2, prize: 13000, tracks: ['rovers_rift', 'canyon_springs', 'jungle_falls', 'frost_harbor'], blurb: 'Out of town, over the crests and off the ramps.' },
    { id: 'crown', name: 'CROWN SERIES', tier: 4, prize: 25000, tracks: ['highway_ring', 'ember_crater', 'rivet_factory', 'downtown_circuit', 'hillside_suburbs'], blurb: 'Five rounds against the best in the league.' }
];

// Vehicle prices. Starters are free; a boss vehicle is also handed over for winning the duel.
export const STARTER_VEHICLES = ['bike_nightjar', 'car_apex_gp'];
export const VEHICLE_PRICES = {
    bike_nightjar: 0, car_apex_gp: 0, bike_solstice: 4500, bike_driftwood: 6000,
    car_vector_gp: 9000, bike_vector: 12000, car_emberline_gp: 16000, car_northstar_gp: 22000
};

// Upgrade prices in credits, per level.
export const UPGRADE_PRICES = [500, 1000, 1800, 2800, 4000];

// ----------------------------------------------------------------------------- lookups

export const ALL_EVENTS = CAREER_TIERS.flatMap((tier, tierIndex) => tier.events.map((item, index) => ({ ...item, tierIndex, index })));
export const findEvent = (id) => ALL_EVENTS.find((item) => item.id === id) || null;
export const trackById = (id) => ROAD_TRACKS.find((item) => item.id === id) || ROAD_TRACKS[0];

export const totalStars = (stars = {}) => Object.values(stars).reduce((sum, value) => sum + (value || 0), 0);
export const tierUnlocked = (tierIndex, stars) => totalStars(stars) >= CAREER_TIERS[tierIndex].requires;
export const tierStars = (tierIndex, stars = {}) => CAREER_TIERS[tierIndex].events.reduce((sum, item) => sum + (stars[item.id] || 0), 0);
export const cupUnlocked = (cup, stars) => tierUnlocked(cup.tier, stars);

// Driver level from experience points: each level needs a little more than the last.
export function driverLevel(xp = 0) {
    const step = 600;
    const level = Math.floor(Math.sqrt(Math.max(0, xp) / step)) + 1;
    const floor = step * (level - 1) ** 2;
    const next = step * level ** 2;
    return { level, progress: (xp - floor) / (next - floor), next };
}

// ----------------------------------------------------------------------------- race setup

const rival = (entry, tweak = {}) => {
    const style = DRIVING_STYLES[entry.style];
    return {
        name: entry.name, paint: entry.paint, vehicleId: entry.vehicleId, crew: entry.crew || 'FREE AGENTS', police: Boolean(entry.police),
        power: tweak.power || 1,
        profile: { aggression: style.aggression, skill: style.skill + (tweak.skill || 0), hunter: style.hunter || 0, block: Boolean(style.block), nitroBias: style.nitroBias || 1 }
    };
};

const POLICE_UNITS = ['UNIT 7', 'UNIT 12', 'UNIT 31'].map((name, index) => ({
    name, paint: 0x16233f, style: 'police', police: true, crew: 'MERIDIAN PD', vehicleId: ['car_apex_gp', 'car_vector_gp', 'car_emberline_gp'][index]
}));

// A mid-field rival's flying lap on each track, in seconds (measured with tools/sim/race-sim.mjs).
export const TRACK_PAR = {
    canyon_springs: 24.2, coral_bay: 23.8, downtown_circuit: 29.4, ember_crater: 31.2, frost_harbor: 24.2,
    harbour_docks: 26.5, highway_ring: 35.7, hillside_suburbs: 31.5, industrial_zone: 34.1, jungle_falls: 28.9,
    park_boulevard: 25.4, rivet_factory: 30.2, rovers_rift: 35.4, sunset_shores: 20.4
};

// Target times for a time trial, as [one star, two stars, three stars] in seconds. Par is a
// mid-field rival's pace from a standing start; three stars means matching it, and the
// margins tighten by 3% a tier.
export function trialTargets(item) {
    const par = TRACK_PAR[item.trackId] * eventLaps(item) + 5;
    const tighten = item.tierIndex * 0.03;
    return [1.32, 1.16, 1.06].map((margin) => Math.round(par * (margin - tighten)));
}

export function eventLaps(item) {
    const track = trackById(item.trackId);
    if (item.type === 'timeTrial' || item.type === 'duel') return Math.min(2, track.laps);
    return track.laps;
}

// Everything the race engine needs to run a career event.
export function eventRace(item) {
    const tier = CAREER_TIERS[item.tierIndex];
    const boss = { ...tier.crew.boss, crew: tier.crew.name };
    const pace = 0.9 + 0.045 * item.tierIndex;
    const power = 0.94 + 0.055 * item.tierIndex;
    const field = ROSTER.map((entry) => rival(entry));
    const base = { type: item.type, laps: eventLaps(item), pace, power, targets: item.targets };
    switch (item.type) {
        case 'timeTrial':
            return { ...base, rivals: [], targets: trialTargets(item) };
        case 'duel':
            return { ...base, rivals: [rival(boss, { skill: 0.03, power: 1.04 })], bossName: boss.name };
        case 'drift':
            return { ...base, rivals: field.slice(0, 3) };
        case 'takedown':
            return { ...base, laps: 99, timeLimit: item.timeLimit || 120, rivals: field };
        case 'elimination':
            return { ...base, laps: 99, interval: 20, rivals: [rival(boss, { skill: 0.01 }), ...field.slice(1)] };
        case 'pursuit':
            return { ...base, rivals: POLICE_UNITS.map((unit) => rival(unit, { power: 1.1 })), playerSlot: 0 };
        default:
            return { ...base, rivals: [rival(boss, { skill: 0.01 }), ...field.slice(1)] };
    }
}

// A cup round is a plain race at the cup's tier.
export function cupRace(cup) {
    const pace = 0.9 + 0.045 * cup.tier;
    return { type: 'race', pace, power: 0.94 + 0.055 * cup.tier, rivals: ROSTER.map((entry) => rival(entry)) };
}

// ----------------------------------------------------------------------------- scoring

const byTargets = (value, targets) => (value >= targets[2] ? 3 : value >= targets[1] ? 2 : value >= targets[0] ? 1 : 0);

// Stars (0-3) and a one-line summary for a finished event. `result` is what the race engine
// reports: position, time, driftPoints, takedowns, wrecks, busted, gap.
export function scoreEvent(item, result) {
    const race = eventRace(item);
    switch (item.type) {
        case 'timeTrial': {
            const [one, two, three] = race.targets;
            const stars = result.timedOut ? 0 : result.time <= three ? 3 : result.time <= two ? 2 : result.time <= one ? 1 : 0;
            return { stars, summary: `Targets ${three}s · ${two}s · ${one}s` };
        }
        case 'drift':
            return { stars: byTargets(result.driftPoints || 0, race.targets), summary: `${Math.round(result.driftPoints || 0).toLocaleString()} drift points · targets ${race.targets.join(' / ')}` };
        case 'takedown':
            return { stars: byTargets(result.takedowns || 0, race.targets), summary: `${result.takedowns || 0} takedowns · targets ${race.targets.join(' / ')}` };
        case 'pursuit': {
            const stars = result.busted ? 0 : result.wrecks === 0 ? 3 : result.wrecks === 1 ? 2 : 1;
            return { stars, summary: result.busted ? 'Busted: wrecked three times' : `Escaped with ${result.wrecks} wreck${result.wrecks === 1 ? '' : 's'}` };
        }
        case 'duel': {
            const won = result.position === 1;
            const stars = won ? 3 : result.gap !== null && result.gap <= 3 ? 2 : 1;
            return { stars, summary: won ? `Beat ${race.bossName}` : `Lost to ${race.bossName}${result.gap !== null ? ` by ${result.gap.toFixed(1)}s` : ''}` };
        }
        case 'elimination': {
            const stars = result.position === 1 ? 3 : result.position <= 2 ? 2 : result.position <= 4 ? 1 : 0;
            return { stars, summary: result.position === 1 ? 'Last one running' : `Knocked out in position ${result.position}` };
        }
        default: {
            const stars = result.position === 1 ? 3 : result.position === 2 ? 2 : result.position === 3 ? 1 : 0;
            return { stars, summary: `Finished ${result.position} of ${result.totalRacers}` };
        }
    }
}

// Credits for newly earned stars: later tiers pay more.
export const starBonus = (item, newStars) => newStars * 400 * (item.tierIndex + 1);

export const vehicleById = (id) => ROAD_VEHICLES.find((item) => item.id === id) || ROAD_VEHICLES[0];
