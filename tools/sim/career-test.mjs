// Checks the career rules without a browser: every event builds a valid race, the scoring
// awards the right stars, and results update the save (stars, credits, boss vehicles, cups).
import { ALL_EVENTS, CAREER_TIERS, CUPS, TRACK_LENGTHS, eventRace, scoreEvent, tierUnlocked, totalStars } from '../../src/game/data/career.js';
import { ROAD_TRACKS, ROAD_VEHICLES } from '../../src/game/data/roadRacing.js';
import { applyRaceResult, buyUpgrade, buyVehicle, freshProfile, startCup } from '../../src/state/profile.js';

let failures = 0;
const check = (name, ok, detail = '') => {
    if (!ok) failures += 1;
    console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` (${detail})` : ''}`);
};
const base = { position: 1, totalRacers: 9, time: 60, credits: 500, score: 3000, takedowns: 0, driftPoints: 0, wrecks: 0, busted: false, timedOut: false, gap: 0, standings: [] };

console.log('events');
check('30 events in 5 tiers', ALL_EVENTS.length === 30 && CAREER_TIERS.length === 5);
check('every event uses a known track', ALL_EVENTS.every((item) => ROAD_TRACKS.some((track) => track.id === item.trackId) && TRACK_LENGTHS[item.trackId]));
check('every tier ends in a boss duel', CAREER_TIERS.every((tier) => tier.events[5].type === 'duel'));
check('every boss vehicle exists', CAREER_TIERS.every((tier) => ROAD_VEHICLES.some((vehicle) => vehicle.id === tier.crew.boss.vehicleId)));
check('every cup uses known tracks', CUPS.every((cup) => cup.tracks.every((id) => TRACK_LENGTHS[id])));
for (const item of ALL_EVENTS) {
    const race = eventRace(item);
    const fine = race.laps > 0 && Array.isArray(race.rivals) && race.rivals.every((r) => r.name && Number.isFinite(r.profile.skill))
        && (!['timeTrial', 'drift', 'takedown'].includes(item.type) || (race.targets.length === 3 && race.targets.every(Number.isFinite)));
    if (!fine) check(`${item.id} builds a race`, false);
}
check('every event builds a race', true);
const reachable = CAREER_TIERS.every((tier, index) => tier.requires <= index * 18);
check('each tier can be reached with the stars before it', reachable);

console.log('scoring');
const find = (type) => ALL_EVENTS.find((item) => item.type === type);
check('race: 1st/2nd/3rd/4th', [1, 2, 3, 4].map((position) => scoreEvent(find('race'), { ...base, position }).stars).join() === '3,2,1,0');
const trial = find('timeTrial');
const targets = eventRace(trial).targets;
check('time trial thresholds', [targets[2] - 1, targets[1] - 1, targets[0] - 1, targets[0] + 5].map((time) => scoreEvent(trial, { ...base, time }).stars).join() === '3,2,1,0', targets.join('/'));
const drift = find('drift');
check('drift thresholds', [0, ...drift.targets].map((driftPoints) => scoreEvent(drift, { ...base, driftPoints }).stars).join() === '0,1,2,3');
const hunt = find('takedown');
check('takedown thresholds', [0, ...hunt.targets].map((takedowns) => scoreEvent(hunt, { ...base, takedowns }).stars).join() === '0,1,2,3');
const chase = find('pursuit');
check('pursuit: clean / one wreck / two / busted', [[0, false], [1, false], [2, false], [3, true]].map(([wrecks, busted]) => scoreEvent(chase, { ...base, wrecks, busted }).stars).join() === '3,2,1,0');
const duel = find('duel');
check('duel: win / close loss / loss', [{ position: 1, gap: 0 }, { position: 2, gap: 2 }, { position: 2, gap: 9 }].map((r) => scoreEvent(duel, { ...base, ...r }).stars).join() === '3,2,1');
check('elimination: 1st/2nd/4th/5th', [1, 2, 4, 5].map((position) => scoreEvent(find('elimination'), { ...base, position }).stars).join() === '3,2,1,0');

console.log('save');
let profile = freshProfile();
const first = ALL_EVENTS[0];
let outcome = applyRaceResult(profile, { ...base, position: 2 }, { mode: 'career', event: first });
check('two stars recorded and paid', outcome.profile.stars[first.id] === 2 && outcome.summary.starBonus === 800 && outcome.profile.credits === 2000 + 500 + 800);
outcome = applyRaceResult(outcome.profile, { ...base, position: 3 }, { mode: 'career', event: first });
check('a worse replay keeps the stars and pays no bonus', outcome.profile.stars[first.id] === 2 && outcome.summary.starBonus === 0);
profile = freshProfile();
const boss = CAREER_TIERS[0].events[5];
outcome = applyRaceResult(profile, base, { mode: 'career', event: ALL_EVENTS.find((item) => item.id === boss.id) });
check('beating the boss hands over their vehicle', outcome.profile.owned.includes(CAREER_TIERS[0].crew.boss.vehicleId) && outcome.summary.wonVehicle && outcome.profile.bosses.includes('street'));
let stars = {};
for (const item of CAREER_TIERS[0].events) stars[item.id] = 2;
check('twelve stars open the club tier but not pro', tierUnlocked(1, stars) && !tierUnlocked(2, stars) && totalStars(stars) === 12);
profile = buyVehicle({ ...freshProfile(), credits: 5000 }, 'bike_solstice');
check('buying a vehicle costs credits', profile.owned.includes('bike_solstice') && profile.credits === 500);
check('cannot buy without the credits', buyVehicle(freshProfile(), 'car_northstar_gp').owned.length === 2);
profile = buyUpgrade(freshProfile(), 'bike_nightjar', 'speed');
check('buying an upgrade costs credits', profile.garage.bike_nightjar.speed === 1 && profile.credits === 1500);
check('cannot upgrade a vehicle you do not own', buyUpgrade(freshProfile(), 'car_northstar_gp', 'speed').credits === 2000);
profile = startCup(freshProfile(), 'harbour');
const standings = [{ name: 'YOU', isPlayer: true }, { name: 'Kade Rook' }, { name: 'Talon Grey' }];
for (let round = 0; round < 3; round += 1) {
    outcome = applyRaceResult(profile, { ...base, standings }, { mode: 'cup' });
    profile = outcome.profile;
}
check('winning every round wins the cup and the prize', outcome.summary.cup.finished && outcome.summary.cup.place === 1 && profile.cups.harbour === 1 && profile.activeCup === null && outcome.summary.cup.prize === 4000);

if (failures) {
    console.log(`\n${failures} career check(s) failed`);
    process.exit(1);
}
console.log('\nall career checks passed');
