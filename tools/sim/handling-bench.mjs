// Laps real circuits with the keyboard-style driver and reports how controllable the car is:
// lap time, wall/hazard hits, crash energy, time spent off the road and worst slide.
//   node tools/sim/handling-bench.mjs [trackId|all] [vehicleId] [laps] [key=value ...]
// options: drift=corners  speedBias=1.1  reaction=0.2  aLat=17  lane=centre
import { readdirSync } from 'node:fs';
import { loadWorld, spawn, FIXED_DT, MODELS } from './harness.mjs';
import { ProgressTracker } from '../../src/game/physics/progress.js';
import { CollisionSystem } from '../../src/game/systems/collisions.js';
import { placeOnRoad, gridSlot } from '../../src/game/systems/raceRules.js';
import { makeKeyboardDriver } from './keyboard-driver.mjs';

const positional = process.argv.slice(2).filter((a) => !a.includes('='));
const named = Object.fromEntries(process.argv.slice(2).filter((a) => a.includes('=')).map((a) => a.split('=')));
const trackArg = positional[0] || 'all';
const vehicleId = positional[1] || 'car_apex_gp';
const laps = Number(positional[2] || 2);
const options = {};
for (const [key, value] of Object.entries(named)) {
    if (key === 'lane') options.useLine = value !== 'centre';
    else options[key] = Number.isNaN(Number(value)) ? value : Number(value);
}

const tracks = trackArg === 'all'
    ? readdirSync(MODELS).filter((f) => f.endsWith('.track.json')).map((f) => f.replace('.track.json', ''))
    : trackArg.split(',');

export async function benchTrack(trackId, vehicle, lapCount, driverOptions) {
    const world = await loadWorld(trackId, { hazards: driverOptions.nohaz !== 1 });
    const { track, physics } = world;
    const car = spawn(world, vehicle, { s: 20, lane: 0 });
    const slot = gridSlot(track, 0);
    car.place(slot.x, slot.y + 0.35, slot.z, slot.forward, 0);
    for (let i = 0; i < 120; i += 1) physics.step();
    const tracker = new ProgressTracker(track, car);
    const driver = makeKeyboardDriver(world, car, driverOptions);
    const collisions = new CollisionSystem(physics);
    const lapTimes = [];
    const result = { trackId, wallHits: 0, hardHits: 0, hazardHits: 0, crashEnergy: 0, damage: 0, offRoad: 0, resets: 0, maxSlip: 0, spins: 0, maxLane: 0 };
    let t = 0;
    let lapStart = 0;
    let stuck = 0;
    let lastLap = 0;
    const maxSeconds = lapCount * 90 + 20;
    for (let step = 0; t < maxSeconds && lapTimes.length < lapCount; step += 1) {
        if (step % 2 === 0) {
            tracker.update(FIXED_DT * 2);
            driver.update(FIXED_DT * 2);
        }
        physics.step();
        if (step % 4 === 0) {
            for (const ev of collisions.update(FIXED_DT * 4)) {
                if (ev.type === 'wall' && process.env.TRACE_HITS) console.log(`  WALL t ${t.toFixed(1)} s ${tracker.s.toFixed(0)} lane ${tracker.lane.toFixed(1)} v ${car.speed.toFixed(1)} dv ${ev.impulseSpeed.toFixed(1)} slip ${(car.slipAngle * 57.3).toFixed(0)} steer ${car.steer.toFixed(2)} yaw ${(car.yawRate * 57.3).toFixed(0)} up.y ${car.up.y.toFixed(2)} grounded ${car.groundedCount} hdgErr ${(tracker.headingError * 57.3).toFixed(0)}`);
                if (ev.type === 'wall') { result.wallHits += 1; result.crashEnergy += ev.impulseSpeed; if (ev.impulseSpeed > 6) result.hardHits += 1; }
                if (ev.type === 'hazard') { result.hazardHits += 1; if (process.env.TRACE_HITS) console.log(`  HAZARD t ${t.toFixed(1)} ${ev.hazard?.id} s ${tracker.s.toFixed(0)} lane ${tracker.lane.toFixed(1)} v ${car.speed.toFixed(1)} dv ${ev.impulseSpeed.toFixed(1)} hazardLane ${ev.hazard?.lane} style ${ev.hazard?.style} shape ${ev.hazard?.shape}`); }
            }
        }
        result.damage += 1 - car.health;
        car.health = 1;
        if (car.mode === 'wrecked' && car.wreckTimer <= 0) car.recover();
        result.maxSlip = Math.max(result.maxSlip, Math.abs(car.slipAngle));
        if (Math.abs(car.slipAngle) > 1.2 && car.speedAbs > 10) result.spins += 1 / 120;
        result.maxLane = Math.max(result.maxLane, Math.abs(tracker.lane));
        if (Math.abs(tracker.lane) > track.halfWidth) result.offRoad += FIXED_DT;
        if (Math.abs(car.speed) < 1.5) stuck += FIXED_DT; else stuck = 0;
        if (stuck > 3.5 || tracker.offRoadTime > 3 || car.flippedTime > 2) {
            placeOnRoad(track, car, tracker.s + 3, 0, 10);
            tracker.reset();
            result.resets += 1;
            stuck = 0;
        }
        const lapsDone = Math.floor(tracker.total / track.length);
        if (lapsDone > lastLap && lapsDone >= 1) {
            lapTimes.push(t - lapStart);
            lapStart = t;
            lastLap = lapsDone;
        }
        if (process.env.TRACE && step % Number(process.env.TRACE_EVERY || 60) === 0 && t > Number(process.env.TRACE_FROM || 0) && t < Number(process.env.TRACE_TO || 9999)) {
            console.log(`t ${t.toFixed(1)} s ${tracker.s.toFixed(0)} lane ${tracker.lane.toFixed(1)} v ${car.speed.toFixed(1)} slip ${(car.slipAngle * 57.3).toFixed(0)} steer ${car.input.steer} thr ${car.input.throttle} brk ${car.input.brake} yaw ${(car.yawRate * 57.3).toFixed(0)} grounded ${car.groundedCount} air ${car.airborne ? 1 : 0}`);
        }
        t += FIXED_DT;
    }
    physics.dispose();
    return { ...result, lapTimes, finished: lapTimes.length >= lapCount, length: track.length };
}

if (process.argv[1].endsWith('handling-bench.mjs')) {
    let totalHits = 0, totalHard = 0, totalResets = 0, totalOff = 0, count = 0;
    for (const trackId of tracks) {
        const r = await benchTrack(trackId, vehicleId, laps, options);
        count += 1;
        totalHits += r.wallHits; totalHard += r.hardHits; totalResets += r.resets; totalOff += r.offRoad;
        const best = r.lapTimes.length ? Math.min(...r.lapTimes) : NaN;
        console.log(`${trackId.padEnd(15)} ${r.length.toFixed(0).padStart(5)} m  laps [${r.lapTimes.map((x) => x.toFixed(1)).join(', ')}]${r.finished ? '' : ' DNF'}  best ${best.toFixed(1)} s  wall ${String(r.wallHits).padStart(3)} (hard ${r.hardHits})  hazard ${r.hazardHits}  crash-energy ${r.crashEnergy.toFixed(0).padStart(4)}  off-road ${r.offRoad.toFixed(1)} s  resets ${r.resets}  max slip ${(r.maxSlip * 57.3).toFixed(0)}°  spin-time ${r.spins.toFixed(1)} s`);
    }
    console.log(`\n${vehicleId}: wall hits ${totalHits} (hard ${totalHard}), resets ${totalResets}, off-road ${totalOff.toFixed(1)} s over ${count} track(s) x ${laps} lap(s)  options ${JSON.stringify(options)}`);
}
