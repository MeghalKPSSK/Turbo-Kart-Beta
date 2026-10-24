import { spawn, run, kmh, makeBot } from './harness.mjs';
import { circleWorld } from './synthetic.mjs';
const vehicleId = process.argv[2] || 'bike_nightjar';
async function trial(label, setup) {
    const world = await circleWorld(6000);
    const car = spawn(world, vehicleId, { s: 10, lane: 0 });
    const bot = makeBot(world, car, { targetSpeed: 500, lookahead: setup.lookahead ?? 0.5 });
    let maxYaw = 0, maxLat = 0, lastLane = 0, crash = false;
    run(world, 12, () => {
        bot.update();
        if (setup.lockSteer) car.input.steer = 0;
        maxYaw = Math.max(maxYaw, Math.abs(car.yawRate));
        maxLat = Math.max(maxLat, Math.abs(car.lateralSpeed));
        lastLane = bot.proj.lane;
    });
    console.log(`${label.padEnd(34)} -> end speed ${kmh(car.speed)} km/h, maxYawRate ${maxYaw.toFixed(2)}, maxLatSpeed ${maxLat.toFixed(1)}, endLane ${lastLane.toFixed(1)}`);
}
await trial('steering locked straight', { lockSteer: true });
await trial('pure pursuit lookahead 0.5', { lookahead: 0.5 });
await trial('pure pursuit lookahead 1.0', { lookahead: 1.0 });
await trial('pure pursuit lookahead 1.6', { lookahead: 1.6 });
