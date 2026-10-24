import { loadWorld, spawn, run, kmh, makeBot } from './harness.mjs';

const world = await loadWorld(process.argv[2] || 'ember_crater');
const { track } = world;
// ember_crater has a long straight near the start/ramp: begin at s=140 (see layout report)
const car = spawn(world, process.argv[3] || 'car_apex_gp', { s: 150, lane: 0 });
const bot = makeBot(world, car, { targetSpeed: 200 });
let t100 = null; let log = [];
run(world, 14, (t, step) => {
    bot.update();
    car.input.nitro = false;
    if (t100 === null && car.speed > 100 / 3.6) { t100 = t; }
    if (step % 120 === 0) log.push(`t=${t.toFixed(1)} s=${bot.proj.s.toFixed(0)} lane=${bot.proj.lane.toFixed(1)} v=${kmh(car.speed)}km/h grounded=${car.groundedCount} up=${car.up.y.toFixed(3)}`);
});
console.log(log.join('\n'));
console.log('0-100 km/h:', t100?.toFixed(2), 's  top reached:', kmh(car.speed), 'km/h  (nominal top', kmh(car.spec.engine.topSpeed), ')');
