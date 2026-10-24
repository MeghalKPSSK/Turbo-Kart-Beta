// Headless race: 1 "player" bot + 8 AI rivals on a real circuit, using the game's physics + AI.
import { loadWorld, spawn, FIXED_DT, ROAD_VEHICLES, kmh } from './harness.mjs';
import { ProgressTracker } from '../../src/game/physics/progress.js';
import { AIDriver, wrapDelta } from '../../src/game/ai/driver.js';
import { GRADE_PACE, RIVAL_PROFILES } from '../../src/game/data/roadRacing.js';
import { CollisionSystem } from '../../src/game/systems/collisions.js';
import { gridSlot, recoverVehicle, needsRecovery, placeOnRoad } from '../../src/game/systems/raceRules.js';

const trackId = process.argv[2] || 'sunset_shores';
const laps = Number(process.argv[3] || 2);
const playerSkill = Number(process.argv[4] || 0.93);
const playerAggression = Number(process.argv[5] || 0);
const maxSeconds = Number(process.argv[6] || 200);
// GRADE=NOVICE|INTERMEDIATE|ADVANCED|EXPERT applies the same rival scaling the game uses.
const gradeIndex = Object.keys(GRADE_PACE).indexOf(process.env.GRADE);
const rivalPace = GRADE_PACE[process.env.GRADE] ?? 1;
const rivalPower = gradeIndex >= 0 ? 0.94 + gradeIndex * 0.055 : 1;

const world = await loadWorld(trackId);
const { track, physics } = world;
const racers = [];
const gridSlots = 9;


for (let i = 0; i < gridSlots; i += 1) {
    const isPlayer = i === 6; // start 7th of 9 like a mid-pack rookie
    const aiIndex = i < 6 ? i : i - 1;
    const vehicleId = ROAD_VEHICLES[(i * 3 + 1) % ROAD_VEHICLES.length].id;
    const car = spawn(world, vehicleId, { s: 20, lane: 0, id: isPlayer ? 'player' : `rival_${aiIndex}`, power: isPlayer ? 1 : rivalPower });
    const slot = gridSlot(track, i);
    car.place(slot.x, slot.y + 0.35, slot.z, slot.forward, 0);
    const tracker = new ProgressTracker(track, car);
    const profile = isPlayer ? { aggression: playerAggression, skill: playerSkill } : RIVAL_PROFILES[aiIndex % RIVAL_PROFILES.length];
    const driver = new AIDriver({ track, vehicle: car, tracker, personality: profile, pace: isPlayer ? 1 : rivalPace, seed: i + 1 });
    racers.push({ id: car.id, vehicle: car, tracker, driver, isPlayer, laps: [], lastLapTime: 0, impacts: 0, respawns: 0, name: `${car.id}:${vehicleId.replace('_gp', '')}` });
}
const player = racers.find((r) => r.isPlayer);
// let cars settle
for (let i = 0; i < 120; i += 1) physics.step();
racers.forEach((r) => r.tracker.reset());

let t = 0;
let step = 0;
let started = false;
const collisions = new CollisionSystem(physics);
const tally = { wall: 0, vehicle: 0, hazard: 0, takedown: 0, destroyed: 0 };
const takedownLog = [];
const finish = [];
while (t < maxSeconds && finish.length < racers.length) {
    if (!started && t >= 1) started = true;
    if (step % 2 === 0) {
        for (const r of racers) r.tracker.update(FIXED_DT * 2);
        for (const r of racers) {
            r.driver.update(FIXED_DT * 2, { started, elapsed: t - 1, racers, me: r, player });
            if (r.driver.needsRespawn) {
                r.driver.needsRespawn = false; r.respawns += 1;
                placeOnRoad(track, r.vehicle, r.tracker.s + 6, 0, 20);
            }
        }
    }
    physics.step();
    if (step % 4 === 0) {
        for (const ev of collisions.update(FIXED_DT * 4)) {
            tally[ev.type] = (tally[ev.type] || 0) + 1;
            const owner = (veh) => racers.find((x) => x.vehicle === veh);
            if (ev.type === 'hazard' && process.env.HAZLOG) { const r = owner(ev.vehicle); console.log(`HAZARD ${ev.hazard?.id} lane ${ev.hazard?.lane} s ${ev.hazard?.s} <- ${r?.id} v=${ev.speed.toFixed(1)} carLane=${r?.tracker.lane.toFixed(1)} carS=${r?.tracker.s.toFixed(0)} t=${(t-1).toFixed(1)} tgtLane=${r?.driver.debug.targetLane?.toFixed(1)} imp=${ev.impulseSpeed.toFixed(1)}`); }
            if (ev.type === 'wall' || ev.type === 'hazard') { const r = owner(ev.vehicle); if (r) { r.impacts += 1; if (ev.type === 'hazard') r.hazardHits = (r.hazardHits || 0) + 1; } }
            if (ev.type === 'vehicle') { const ra = owner(ev.a), rb = owner(ev.b); if (ra) ra.impacts += 1; if (rb) rb.impacts += 1; }
            if (ev.type === 'takedown') { const att = owner(ev.attacker), vic = owner(ev.victim); att.takedowns = (att.takedowns || 0) + 1; vic.wrecked = (vic.wrecked || 0) + 1; takedownLog.push(`${(t - 1).toFixed(1)}s ${att.id} -> ${vic.id} (closing ${ev.closing.toFixed(0)} m/s)`); }
        }
    }
    for (const r of racers) if (needsRecovery(r.vehicle)) recoverVehicle(track, r.tracker, r.vehicle);
    for (const r of racers) {
        const lapsDone = Math.floor(r.tracker.total / track.length);
        if (lapsDone > r.laps.length && lapsDone >= 1) {
            r.laps.push(t - 1 - r.lastLapTime); r.lastLapTime = t - 1;
            if (r.laps.length >= laps && !finish.includes(r)) finish.push(r);
        }
    }
    step += 1; t += FIXED_DT;
    if (process.env.TRACE && step % 12 === 0) {
        const r = racers.find((x) => x.id === process.env.TRACE);
        const from = Number(process.env.TRACE_FROM || 0), to = Number(process.env.TRACE_TO || 999);
        if (r && t - 1 > from && t - 1 < to) {
            console.log(`${(t - 1).toFixed(1)} s=${r.tracker.s.toFixed(0)} lane=${r.tracker.lane.toFixed(1)} v=${r.vehicle.speed.toFixed(1)} laneCmd=${r.driver.laneCmd.toFixed(1)} tgtLane=${r.driver.debug.targetLane?.toFixed(1)} tgtV=${r.driver.debug.targetSpeed?.toFixed(1)} steer=${r.vehicle.input.steer.toFixed(2)} thr=${r.vehicle.input.throttle.toFixed(2)} brk=${r.vehicle.input.brake.toFixed(2)} hp=${r.vehicle.health.toFixed(2)}`);
        }
    }
    if (step % 1200 === 0 && process.env.VERBOSE) {
        const order = [...racers].sort((a, b) => b.tracker.total - a.tracker.total);
        console.log(`t=${(t - 1).toFixed(0)} ` + order.map((r) => `${r.id.replace('rival_', 'R')}:${(r.tracker.total / track.length).toFixed(2)}@${kmh(r.vehicle.speed)}`).join(' '));
    }
}
const order = [...racers].sort((a, b) => b.tracker.total - a.tracker.total);
console.log(`\n=== ${trackId} (${track.length.toFixed(0)} m) ${laps} laps, simulated ${(t - 1).toFixed(1)} s, events`, JSON.stringify(tally));
for (const [i, r] of order.entries()) {
    const best = r.laps.length ? Math.min(...r.laps) : NaN;
    console.log(`${i + 1}. ${r.name.padEnd(28)} laps [${r.laps.map((x) => x.toFixed(1)).join(', ')}]  best ${best.toFixed(1)}s  contacts ${r.impacts} hazardHits ${r.hazardHits || 0} takedowns ${r.takedowns || 0} wrecked ${r.wrecked || 0} respawns ${r.respawns}  hp ${(r.vehicle.health * 100).toFixed(0)}% nitro ${(r.vehicle.nitro * 100).toFixed(0)}%`);
}

if (takedownLog.length) console.log('takedowns:\n  ' + takedownLog.slice(0, 20).join('\n  '));
