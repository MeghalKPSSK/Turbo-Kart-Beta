import { loadWorld, spawn, run, makeBot } from './harness.mjs';

const trackId = process.argv[2] || 'canyon_springs';
const vehicleId = process.argv[3] || 'car_apex_gp';
const lane = Number(process.argv[4] ?? 8.84);
const kmhSpeed = Number(process.argv[5] || 130);
const world = await loadWorld(trackId);
const { track } = world;
const ramp = track.ramps[0];
const car = spawn(world, vehicleId, { s: ramp.s0 - 70, lane, speed: kmhSpeed / 3.6 });
const bot = makeBot(world, car, { targetSpeed: kmhSpeed / 3.6, lane, lookahead: 0.6 });
console.log(trackId, 'ramp', ramp.s0.toFixed(0), '-', ramp.s1.toFixed(0), 'hw', ramp.halfWidth, 'rise', ramp.rise);
let next = 0;
run(world, 4.2, (t, step) => {
    bot.update();
    if (t >= next) {
        next += 0.1;
        const roll = Math.atan2(car.left.y, car.up.y) * 57.3;
        const pitch = Math.asin(Math.max(-1, Math.min(1, car.forward.y))) * 57.3;
        const w = car.body.angvel();
        console.log(`t ${t.toFixed(1)} s ${bot.proj.s.toFixed(0)} lane ${bot.proj.lane.toFixed(1)} v ${(car.speed).toFixed(1)} grounded ${car.groundedCount} roll ${roll.toFixed(0)} pitch ${pitch.toFixed(0)} up.y ${car.up.y.toFixed(2)} angvel ${w.x.toFixed(1)},${w.y.toFixed(1)},${w.z.toFixed(1)} y ${car.position.y.toFixed(2)} hp ${car.health.toFixed(2)}`);
    }
});
