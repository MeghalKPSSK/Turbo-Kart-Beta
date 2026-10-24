import { spawn, run, makeBot } from './harness.mjs';
import { circleWorld } from './synthetic.mjs';

const vehicleId = process.argv[2] || 'car_apex_gp';
const world = await circleWorld(6000);
const car = spawn(world, vehicleId, { s: 10, lane: 0 });
const bot = makeBot(world, car, { targetSpeed: 40 });
run(world, 10, () => bot.update());
run(world, 8, () => { bot.update(); car.input.throttle = 0; car.input.brake = 1; });
const proj = {};
const report = (label) => {
    world.track.project(car.position.x, car.position.z, -1, proj);
    const h = Math.atan2(car.forward.x, car.forward.z);
    console.log(`${label.padEnd(18)} speed ${car.speed.toFixed(2)} lane ${proj.lane.toFixed(2)} pos (${car.position.x.toFixed(1)}, ${car.position.z.toFixed(1)}) heading ${(h * 57.3).toFixed(0)}deg longF ${car._lastLongForce?.toFixed?.(0)} surf ${car.surfaceGrip}`);
};
report('stopped');
for (const [label, steer, throttle, brake] of [['S steer 0', 0, 0, 1], ['S steer -0.79', -0.79, 0, 1], ['S steer +0.79', 0.79, 0, 1], ['W steer 0', 0, 1, 0], ['W steer -0.5', -0.5, 1, 0]]) {
    run(world, 2.0, () => { car.input.steer = steer; car.input.throttle = throttle; car.input.brake = brake; });
    report(label);
}
