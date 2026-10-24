import { spawn, run, makeBot, FIXED_DT } from './harness.mjs';
import { circleWorld } from './synthetic.mjs';

const vehicleId = process.argv[2] || 'car_apex_gp';
const world = await circleWorld(6000);
const car = spawn(world, vehicleId, { s: 10, lane: 0 });
const bot = makeBot(world, car, { targetSpeed: 40 });
run(world, 10, () => bot.update());
console.log('cruising', car.speed.toFixed(1), 'lane', bot.proj.lane.toFixed(2));
// brake to a stop with the bot steering
run(world, 8, () => { bot.update(); car.input.throttle = 0; car.input.brake = 1; });
console.log('stopped: speed', car.speed.toFixed(2), 'lane', bot.proj.lane.toFixed(2), 'reversing', car.reversing, 'steer', car.input.steer.toFixed(2), 'steerAngle', car.steerAngle.toFixed(3));
for (let i = 0; i < 6; i += 1) {
    run(world, 0.5, () => { car.input.throttle = 0; car.input.brake = 1; });
    const w = car.wheels.map((x) => `${x.grounded ? 'G' : '-'}${x.load?.toFixed?.(0) ?? ''}`).join(' ');
    console.log(`hold S +${((i + 1) * 0.5).toFixed(1)}s: speed ${car.speed.toFixed(2)} reversing ${car.reversing} braking ${car.braking} mode ${car.mode} wheels ${w} vLong ${car.wheels[2].vLong?.toFixed(2)} up.y ${car.up.y.toFixed(2)} hold ${car.hold}`);
}
console.log('input', JSON.stringify(car.input));
void FIXED_DT;
