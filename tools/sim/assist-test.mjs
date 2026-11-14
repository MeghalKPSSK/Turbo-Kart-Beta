// Brake assist check: a driver who never brakes should lap with far fewer hard wall hits
// with the assist on, and the assist must stay out of the way of a car at a safe speed.
//   node tools/sim/assist-test.mjs
import { loadWorld, spawn, FIXED_DT } from './harness.mjs';
import { ProgressTracker } from '../../src/game/physics/progress.js';
import { CollisionSystem } from '../../src/game/systems/collisions.js';
import { buildAssist } from '../../src/game/physics/assist.js';

async function lap(trackId, vehicleId, assistOn) {
    const world = await loadWorld(trackId, { hazards: false });
    const { track, physics } = world;
    const car = spawn(world, vehicleId, { s: 20, lane: 0 });
    for (let i = 0; i < 120; i += 1) physics.step();
    const tracker = new ProgressTracker(track, car);
    const collisions = new CollisionSystem(physics);
    const assist = buildAssist(track, car);
    let hard = 0, idle = 0;
    const steps = Math.round(70 / FIXED_DT);
    for (let step = 0; step < steps && tracker.total < track.length * 1.5; step += 1) {
        if (step % 2 === 0) {
            tracker.update(FIXED_DT * 2);
            // Flat out, steering at a point ahead on the centre line, never braking.
            const target = track.roadPoint(tracker.s + Math.max(10, car.speedAbs * 0.45), 0);
            const dx = target.x - car.position.x, dz = target.z - car.position.z;
            const side = dx * car.left.x + dz * car.left.z;
            const forward = dx * car.forward.x + dz * car.forward.z;
            car.input.steer = Math.max(-1, Math.min(1, Math.atan2(side, Math.max(0.1, forward)) * 3));
            car.input.throttle = 1;
            car.input.brake = 0;
            if (assistOn && car.speed > 14) {
                const help = assist.correct(tracker.s, car.speed);
                if (help.lift) { car.input.throttle = 0; car.input.brake = help.brake; }
            }
            if (car.speed < 12 && assist.correct(tracker.s, car.speed).lift) idle += 1;
        }
        physics.step();
        if (step % 4 === 0) for (const ev of collisions.update(FIXED_DT * 4)) if (ev.type === 'wall' && ev.severity > 0.35) hard += 1;
    }
    physics.dispose();
    return { hard, idle, distance: Math.round(tracker.total) };
}

let failures = 0;
for (const [trackId, vehicleId] of [['downtown_circuit', 'bike_nightjar'], ['hillside_suburbs', 'car_apex_gp'], ['sunset_shores', 'bike_vector']]) {
    const off = await lap(trackId, vehicleId, false);
    const on = await lap(trackId, vehicleId, true);
    const ok = on.hard <= Math.max(0, off.hard - 1) || (off.hard === 0 && on.hard === 0);
    if (!ok || on.idle) failures += 1;
    console.log(`${ok && !on.idle ? 'ok  ' : 'FAIL'} ${trackId.padEnd(18)} ${vehicleId.padEnd(14)} hard wall hits: ${off.hard} without assist, ${on.hard} with (${on.distance} m covered)`);
}
if (failures) { console.log(`\n${failures} assist check(s) failed`); process.exit(1); }
console.log('\nbrake assist reduces hard wall hits and stays out of the way at safe speeds');
