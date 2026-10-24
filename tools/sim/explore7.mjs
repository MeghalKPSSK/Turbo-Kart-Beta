import { spawn, run, kmh, makeBot } from './harness.mjs';
import { circleWorld } from './synthetic.mjs';
const world = await circleWorld(6000);
const car = spawn(world, process.argv[2] || 'bike_nightjar', { s: 10, lane: 0 });
const bot = makeBot(world, car, { targetSpeed: 500 });
const deg = (r) => (r * 180 / Math.PI).toFixed(1);
run(world, 5, (t, step) => {
    bot.update();
    if (step % 30 === 0) {
        const roll = Math.asin(car.left.y), pitch = Math.asin(car.forward.y);
        console.log(`t=${t.toFixed(2)} v=${car.speed.toFixed(1)} lane=${bot.proj.lane.toFixed(2)} roll=${deg(roll)} pitch=${deg(pitch)} yawRate=${car.yawRate.toFixed(2)} gr=${car.groundedCount} loads=${car.wheels.map((w) => (w.load / 1000).toFixed(1)).join('/')} steer=${car.input.steer.toFixed(2)} lat=${car.lateralSpeed.toFixed(2)} y=${car.position.y.toFixed(2)}`);
    }
});
