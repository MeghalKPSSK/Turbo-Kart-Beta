// Vehicle dynamics regression for every vehicle: acceleration, top speed, braking, reverse and
// cornering on synthetic roads. Exits non-zero when a number leaves its expected band.
//   node tools/sim/drive-test.mjs [vehicleId ...]
import { spawn, run, kmh, makeBot, ROAD_VEHICLES } from './harness.mjs';
import { circleWorld } from './synthetic.mjs';

const requested = process.argv.slice(2);
const vehicles = ROAD_VEHICLES.filter((v) => !requested.length || requested.includes(v.id));
let failures = 0;
const check = (name, ok, detail) => {
    if (!ok) failures += 1;
    console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name} (${detail})`);
};

for (const info of vehicles) {
    console.log(info.id);
    {
        const world = await circleWorld(8000);
        const car = spawn(world, info.id, { s: 10, lane: 0 });
        const bot = makeBot(world, car, { targetSpeed: 500 });
        let t100 = null;
        run(world, 40, (t) => { bot.update(); if (t100 === null && car.speed > 100 / 3.6) t100 = t; });
        const nominal = car.spec.engine.topSpeed;
        check('0-100 km/h', t100 !== null && t100 > 1.8 && t100 < 4.2, `${t100?.toFixed(2)} s`);
        check('top speed', car.speed > nominal * 0.93 && car.speed < nominal * 1.02, `${kmh(car.speed)} km/h vs nominal ${kmh(nominal)}`);
        const v0 = car.speed;
        let stopT = null;
        run(world, 10, (t) => { bot.update(); car.input.throttle = 0; car.input.brake = 1; if (stopT === null && car.speed < 1) stopT = t; });
        const decel = stopT ? v0 / stopT : 0;
        check('braking', decel >= 16, `${decel.toFixed(1)} m/s² from ${kmh(v0)} km/h`);
        world.physics.dispose();
    }
    {
        const world = await circleWorld(8000);
        const car = spawn(world, info.id, { s: 10, lane: 0 });
        run(world, 1, () => {});
        run(world, 4, () => { car.input.throttle = 0; car.input.brake = 1; car.input.steer = 0; });
        check('reverse (hold S from standstill)', car.speed < -8 && car.reversing, `${car.speed.toFixed(1)} m/s, reversing=${car.reversing}`);
        world.physics.dispose();
    }
    {
        const world = await circleWorld(80);
        const car = spawn(world, info.id, { s: 5, lane: 0, speed: 28 });
        const bot = makeBot(world, car, { targetSpeed: 28, lookahead: 0.35 });
        let maxLane = 0, minUp = 1;
        run(world, 12, () => { bot.update(); maxLane = Math.max(maxLane, Math.abs(bot.proj.lane)); minUp = Math.min(minUp, car.up.y); });
        check('skidpad R=80 m at 28 m/s', maxLane < 2.5 && minUp > 0.9, `max lane error ${maxLane.toFixed(1)} m, min up.y ${minUp.toFixed(2)}`);
        world.physics.dispose();
    }
}

if (failures) {
    console.log(`\n${failures} check(s) failed`);
    process.exit(1);
}
console.log('\nall vehicle dynamics checks passed');
